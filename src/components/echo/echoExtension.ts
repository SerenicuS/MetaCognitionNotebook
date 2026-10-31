import { buildEchoSearchIndex, matchEchoText } from '../../utils/echoMatching';
import { createContextAnchor } from '../../utils/echoReconciliation';
import {
  StateField,
  StateEffect,
  RangeSetBuilder,
  type Extension,
  type Text,
} from '@codemirror/state';
import {
  EditorView,
  Decoration,
  type DecorationSet,
} from '@codemirror/view';
import { invertedEffects } from '@codemirror/commands';
import type { EchoEntity, EchoPersistentReference, EchoConfirmedReference, EchoCandidateMatch } from './types';

// ============================================================================
// State Effects
// ============================================================================

export const loadReferencesEffect = StateEffect.define<{
  references: EchoPersistentReference[];
  detachedReferences?: EchoPersistentReference[];
}>();
export const bindReferenceEffect = StateEffect.define<EchoPersistentReference>();
export const unbindReferenceEffect = StateEffect.define<{ id: string }>();
export const changeTargetEffect = StateEffect.define<{ id: string; targetId: string }>();
export const detachReferenceEffect = StateEffect.define<{ id: string }>();
export const reattachReferenceEffect = StateEffect.define<EchoPersistentReference>();

// Aliases for backward compatibility
export const confirmReferenceEffect = StateEffect.define<EchoConfirmedReference>();
export const unconfirmReferenceEffect = StateEffect.define<{ id: string }>();
export const resetReferencesEffect = StateEffect.define<void>();
export const setEntitiesEffect = StateEffect.define<EchoEntity[]>();

// ============================================================================
// Inverted Effects for Complete Undo/Redo Support
// ============================================================================

export const echoInvertedEffects = invertedEffects.of((tr) => {
  const inverted: StateEffect<unknown>[] = [];
  const stateField = tr.startState.field(confirmedReferencesField, false);
  const currentRefs = stateField?.references || [];
  const currentDetached = stateField?.detachedReferences || [];
  const allCurrent = [...currentRefs, ...currentDetached];

  // History-aware restoration of references detached by document edits:
  // When an edit mutates or truncates a bound span, record reattachReferenceEffect(ref)
  // so that undoing the edit restores the exact reference identity and offsets.
  if (tr.docChanged) {
    for (const ref of currentRefs) {
      const newFrom = tr.changes.mapPos(ref.from, 1);
      const newTo = tr.changes.mapPos(ref.to, -1);
      const collapsedOrOutOfBounds = newFrom >= newTo || newTo > tr.newDoc.length;
      const textMismatch =
        !collapsedOrOutOfBounds &&
        tr.newDoc.sliceString(newFrom, newTo).toLowerCase() !== ref.matchedText.toLowerCase();

      if (collapsedOrOutOfBounds || textMismatch) {
        inverted.push(reattachReferenceEffect.of(ref));
      }
    }
  }

  for (const effect of tr.effects) {
    if (effect.is(bindReferenceEffect) || effect.is(confirmReferenceEffect)) {
      inverted.push(unbindReferenceEffect.of({ id: effect.value.id }));
    } else if (effect.is(unbindReferenceEffect) || effect.is(unconfirmReferenceEffect)) {
      const prior = allCurrent.find((r) => r.id === effect.value.id);
      if (prior) {
        inverted.push(bindReferenceEffect.of(prior));
      }
    } else if (effect.is(changeTargetEffect)) {
      const prior = allCurrent.find((r) => r.id === effect.value.id);
      if (prior) {
        inverted.push(
          changeTargetEffect.of({
            id: effect.value.id,
            targetId: prior.targetId || prior.entityId || '',
          })
        );
      }
    } else if (effect.is(detachReferenceEffect)) {
      const prior = currentRefs.find((r) => r.id === effect.value.id);
      if (prior) {
        inverted.push(reattachReferenceEffect.of(prior));
      }
    } else if (effect.is(reattachReferenceEffect)) {
      inverted.push(detachReferenceEffect.of({ id: effect.value.id }));
    }
  }

  return inverted;
});

// ============================================================================
// Entity Universe Store in EditorState
// ============================================================================

export const echoEntitiesField = StateField.define<EchoEntity[]>({
  create() {
    return [];
  },
  update(entities, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setEntitiesEffect)) {
        return effect.value;
      }
    }
    return entities;
  },
});

// ============================================================================
// Confirmed & Persistent References StateField
// Tracks active and detached references and maps them cleanly through document edits
// ============================================================================

export interface ConfirmedReferenceState {
  references: EchoPersistentReference[];
  detachedReferences: EchoPersistentReference[];
  decorations: DecorationSet;
}

export function buildConfirmedDecorations(
  references: EchoPersistentReference[],
  doc?: Text
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const maxLen = doc ? doc.length : Number.MAX_SAFE_INTEGER;
  const activeRefs = references.filter(
    (r) => r.status !== 'detached' && r.from >= 0 && r.to <= maxLen && r.from < r.to
  );
  activeRefs.sort((a, b) => a.from - b.from || a.to - b.to);

  for (const ref of activeRefs) {
    const isUnresolved = ref.status === 'unresolved';
    const entityId = ref.targetId || ref.entityId || '';
    builder.add(
      ref.from,
      ref.to,
      Decoration.mark({
        class: isUnresolved ? 'cm-echo-reference cm-echo-reference-unresolved' : 'cm-echo-reference',
        attributes: {
          'data-entity-id': entityId,
          'data-ref-id': ref.id,
          'title': isUnresolved
            ? `Unresolved Lore Reference: "${ref.matchedText}" (Target entity is missing or archived)`
            : `Echo Reference: ${ref.matchedText} (Click to inspect lore)`,
        },
      })
    );
  }

  return builder.finish();
}

export const confirmedReferencesField = StateField.define<ConfirmedReferenceState>({
  create() {
    return {
      references: [],
      detachedReferences: [],
      decorations: Decoration.none,
    };
  },
  update(current, tr) {
    let references = current.references;
    let detachedReferences = current.detachedReferences;

    // 1. Map existing references through document changes
    if (tr.docChanged) {
      const docString = tr.newDoc.toString();
      const updatedRefs: EchoPersistentReference[] = [];
      const newlyDetached: EchoPersistentReference[] = [];

      for (const ref of references) {
        const newFrom = tr.changes.mapPos(ref.from, 1);
        const newTo = tr.changes.mapPos(ref.to, -1);

        // Invalidation rule: if the range collapsed or the text inside changed,
        // move to detachedReferences so corrupted text does not retain a false binding.
        if (newFrom < newTo && newTo <= tr.newDoc.length) {
          const currentSlice = tr.newDoc.sliceString(newFrom, newTo);
          if (currentSlice.toLowerCase() === ref.matchedText.toLowerCase()) {
            updatedRefs.push({
              ...ref,
              from: newFrom,
              to: newTo,
              matchedText: currentSlice,
              anchor: createContextAnchor(docString, newFrom, newTo),
            });
          } else {
            newlyDetached.push({
              ...ref,
              status: 'detached',
              updatedAt: new Date().toISOString(),
            });
          }
        } else {
          newlyDetached.push({
            ...ref,
            status: 'detached',
            updatedAt: new Date().toISOString(),
          });
        }
      }

      references = updatedRefs;
      if (newlyDetached.length) {
        detachedReferences = [...detachedReferences, ...newlyDetached];
      }
    }

    // 2. Handle effects (load, bind, unbind, changeTarget, detach, reattach, reset)
    for (const effect of tr.effects) {
      if (effect.is(loadReferencesEffect)) {
        references = [...effect.value.references];
        detachedReferences = effect.value.detachedReferences ? [...effect.value.detachedReferences] : [];
      } else if (effect.is(bindReferenceEffect) || effect.is(confirmReferenceEffect)) {
        const val = effect.value;
        const normalizedRef: EchoPersistentReference = {
          ...val,
          targetId: val.targetId || val.entityId || '',
          entityId: val.targetId || val.entityId || '',
          status: val.status || 'active',
          anchor: val.anchor || createContextAnchor(tr.newDoc.toString(), val.from, val.to),
          createdAt: val.createdAt || new Date().toISOString(),
          updatedAt: val.updatedAt || new Date().toISOString(),
        };

        if (normalizedRef.status === 'detached') {
          detachedReferences = detachedReferences.filter((r) => r.id !== normalizedRef.id);
          detachedReferences.push(normalizedRef);
          references = references.filter((r) => r.id !== normalizedRef.id);
        } else {
          // Remove any existing reference overlapping the new range or sharing the same ID
          references = references.filter(
            (r) => r.id !== normalizedRef.id && !(r.from < normalizedRef.to && r.to > normalizedRef.from)
          );
          detachedReferences = detachedReferences.filter((r) => r.id !== normalizedRef.id);
          references.push(normalizedRef);
        }
      } else if (effect.is(unbindReferenceEffect) || effect.is(unconfirmReferenceEffect)) {
        references = references.filter((r) => r.id !== effect.value.id);
        detachedReferences = detachedReferences.filter((r) => r.id !== effect.value.id);
      } else if (effect.is(changeTargetEffect)) {
        references = references.map((r) =>
          r.id === effect.value.id
            ? {
                ...r,
                targetId: effect.value.targetId,
                entityId: effect.value.targetId,
                status: 'active',
                updatedAt: new Date().toISOString(),
              }
            : r
        );
        detachedReferences = detachedReferences.map((r) =>
          r.id === effect.value.id
            ? {
                ...r,
                targetId: effect.value.targetId,
                entityId: effect.value.targetId,
                updatedAt: new Date().toISOString(),
              }
            : r
        );
      } else if (effect.is(detachReferenceEffect)) {
        const target = references.find((r) => r.id === effect.value.id);
        if (target) {
          references = references.filter((r) => r.id !== effect.value.id);
          detachedReferences.push({
            ...target,
            status: 'detached',
            updatedAt: new Date().toISOString(),
          });
        }
      } else if (effect.is(reattachReferenceEffect)) {
        const val = effect.value;
        const normalized: EchoPersistentReference = {
          ...val,
          targetId: val.targetId || val.entityId || '',
          entityId: val.targetId || val.entityId || '',
          status: 'active',
          updatedAt: new Date().toISOString(),
        };
        detachedReferences = detachedReferences.filter((r) => r.id !== normalized.id);
        references = references.filter(
          (r) => r.id !== normalized.id && !(r.from < normalized.to && r.to > normalized.from)
        );
        references.push(normalized);
      } else if (effect.is(resetReferencesEffect)) {
        references = [];
        detachedReferences = [];
      }
    }

    const decorations = buildConfirmedDecorations(references, tr.newDoc);
    return { references, detachedReferences, decorations };
  },
  provide: (field) => EditorView.decorations.from(field, (val) => val.decorations),
});

// ============================================================================
// Candidate Matches Scanner & Decoration
// ============================================================================

const indexes = new WeakMap<EchoEntity[], ReturnType<typeof buildEchoSearchIndex>>();
export function findCandidateMatches(
  doc: Text,
  entities: EchoEntity[],
  confirmed: EchoPersistentReference[] = []
): EchoCandidateMatch[] {
  let index = indexes.get(entities);
  if (!index) {
    index = buildEchoSearchIndex(entities);
    indexes.set(entities, index);
  }
  const activeConfirmed = confirmed.filter((r) => r.status !== 'detached');
  return matchEchoText(doc.toString(), index, activeConfirmed);
}

function buildCandidateDecorations(
  candidates: EchoCandidateMatch[]
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const sorted = [...candidates].sort((a, b) => a.from - b.from || a.to - b.to);

  for (const cand of sorted) {
    builder.add(
      cand.from,
      cand.to,
      Decoration.mark({
        class: cand.isAmbiguous ? 'cm-echo-candidate-ambiguous' : 'cm-echo-candidate',
        attributes: {
          'data-candidate-word': cand.matchedText,
          'title': cand.isAmbiguous
            ? `Ambiguous lore term: "${cand.matchedText}" (${cand.matchingEntities.length} matches). Click to clarify.`
            : `Known lore term: "${cand.matchedText}". Click to inspect dossier.`,
        },
      })
    );
  }

  return builder.finish();
}

export const candidateMatchesField = StateField.define<{
  candidates: EchoCandidateMatch[];
  decorations: DecorationSet;
}>({
  create(state) {
    const entities = state.field(echoEntitiesField, false) || [];
    const confirmed = state.field(confirmedReferencesField, false)?.references || [];
    const candidates = findCandidateMatches(state.doc, entities, confirmed);
    return {
      candidates,
      decorations: buildCandidateDecorations(candidates),
    };
  },
  update(current, tr) {
    const entities = tr.state.field(echoEntitiesField, false) || [];
    const confirmed = tr.state.field(confirmedReferencesField, false)?.references || [];

    const entitiesChanged = tr.effects.some((e) => e.is(setEntitiesEffect));
    const refChanged = tr.effects.some(
      (e) =>
        e.is(bindReferenceEffect) ||
        e.is(confirmReferenceEffect) ||
        e.is(unbindReferenceEffect) ||
        e.is(unconfirmReferenceEffect) ||
        e.is(loadReferencesEffect) ||
        e.is(changeTargetEffect) ||
        e.is(detachReferenceEffect) ||
        e.is(reattachReferenceEffect) ||
        e.is(resetReferencesEffect)
    );

    if (tr.docChanged || entitiesChanged || refChanged) {
      const candidates = findCandidateMatches(tr.newDoc, entities, confirmed);
      return {
        candidates,
        decorations: buildCandidateDecorations(candidates),
      };
    }

    return current;
  },
  provide: (field) => EditorView.decorations.from(field, (val) => val.decorations),
});

// ============================================================================
// Interactive Click Dispatcher Extension
// ============================================================================

export interface EchoEditorCallbacks {
  onSelectReference?: (entityId: string, rect: DOMRect, from: number, to: number, refId?: string) => void;
  onClarifyCandidate?: (candidate: EchoCandidateMatch, rect: DOMRect) => void;
}

export function echoClickPlugin(callbacks: EchoEditorCallbacks): Extension {
  return EditorView.domEventHandlers({
    mousedown(event) {
      if (event.button !== 0) return false;
      const reference = (event.target as HTMLElement | null)?.closest(
        '.cm-echo-reference, .cm-echo-candidate, .cm-echo-candidate-ambiguous'
      );
      if (reference) {
        event.preventDefault();
        return true;
      }
      return false;
    },
    click(event, view) {
      const target = event.target as HTMLElement | null;
      if (!target) return false;

      // 1. Check if user clicked a confirmed reference
      const refEl = target.closest('.cm-echo-reference') as HTMLElement | null;
      if (refEl) {
        const entityId = refEl.getAttribute('data-entity-id');
        const refId = refEl.getAttribute('data-ref-id') || undefined;
        const pos = view.posAtDOM(refEl);
        const rect = refEl.getBoundingClientRect();
        if (entityId && callbacks.onSelectReference) {
          const refs = view.state.field(confirmedReferencesField).references;
          const match =
            (refId ? refs.find((r) => r.id === refId) : null) ||
            refs.find((r) => r.from <= pos && r.to >= pos) ||
            refs.find((r) => r.targetId === entityId || r.entityId === entityId);
          callbacks.onSelectReference(
            entityId,
            rect,
            match ? match.from : pos,
            match ? match.to : pos,
            refId
          );
          return true;
        }
      }

      // 2. Check if user clicked an unconfirmed candidate
      const candEl = target.closest(
        '.cm-echo-candidate, .cm-echo-candidate-ambiguous'
      ) as HTMLElement | null;
      if (candEl) {
        const pos = view.posAtDOM(candEl);
        const rect = candEl.getBoundingClientRect();
        const candidates = view.state.field(candidateMatchesField).candidates;
        const candWord = candEl.getAttribute('data-candidate-word');
        const match =
          candidates.find((c) => c.from <= pos && c.to >= pos) ||
          candidates.find((c) => c.matchedText === candWord) ||
          candidates.find(
            (c) => Math.abs(c.from - pos) <= (c.matchedText?.length || 0) + 2
          );
        if (match && callbacks.onClarifyCandidate) {
          callbacks.onClarifyCandidate(match, rect);
          return true;
        }
      }

      return false;
    },
  });
}

// ============================================================================
// Clean Creative Writing Theme for CodeMirror 6
// ============================================================================

export const echoWritingTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '16px',
    backgroundColor: 'transparent',
    color: 'inherit',
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  '.cm-content': {
    padding: '24px 20px',
    lineHeight: '1.75',
    caretColor: 'var(--primary, #d4af37)',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  '.cm-line': {
    padding: '0',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-cursor': {
    borderLeftColor: 'var(--primary, #d4af37)',
    borderLeftWidth: '2px',
  },
  // Confirmed references: subtle gold dotted underline + cursor pointer
  '.cm-echo-reference': {
    borderBottom: '2px dotted rgba(212, 175, 55, 0.85)',
    backgroundColor: 'rgba(212, 175, 55, 0.08)',
    borderRadius: '2px',
    padding: '0 2px',
    cursor: 'pointer',
    transition: 'background-color 0.15s ease, border-color 0.15s ease',
  },
  '.cm-echo-reference:hover': {
    backgroundColor: 'rgba(212, 175, 55, 0.22)',
    borderBottomColor: '#f1d279',
  },
  // Unresolved references: soft amber dotted underline
  '.cm-echo-reference-unresolved': {
    borderBottom: '2px dotted rgba(245, 158, 11, 0.85)',
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderRadius: '2px',
    padding: '0 2px',
    cursor: 'pointer',
  },
  '.cm-echo-reference-unresolved:hover': {
    backgroundColor: 'rgba(245, 158, 11, 0.20)',
    borderBottomColor: '#fbbf24',
  },
  // Unconfirmed candidates: faint subtle dashed line, non-intrusive
  '.cm-echo-candidate': {
    borderBottom: '1.5px dashed rgba(160, 160, 160, 0.6)',
    backgroundColor: 'rgba(160, 160, 160, 0.05)',
    borderRadius: '2px',
    cursor: 'pointer',
  },
  '.cm-echo-candidate:hover': {
    borderBottomColor: 'rgba(212, 175, 55, 0.7)',
    backgroundColor: 'rgba(212, 175, 55, 0.08)',
  },
  // Ambiguous candidates: soft amber dashed underline
  '.cm-echo-candidate-ambiguous': {
    borderBottom: '1.5px dashed rgba(245, 158, 11, 0.7)',
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderRadius: '2px',
    cursor: 'pointer',
  },
});
