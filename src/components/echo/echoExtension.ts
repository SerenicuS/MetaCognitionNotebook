import { buildEchoSearchIndex, matchEchoText } from '../../utils/echoMatching';
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
import type { EchoEntity, EchoConfirmedReference, EchoCandidateMatch } from './types';

// ============================================================================
// State Effects
// ============================================================================

export const confirmReferenceEffect = StateEffect.define<EchoConfirmedReference>();
export const unconfirmReferenceEffect = StateEffect.define<{ id: string }>();
export const resetReferencesEffect = StateEffect.define<void>();
export const setEntitiesEffect = StateEffect.define<EchoEntity[]>();

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
// Confirmed References StateField
// Tracks confirmed references and maps them cleanly through document edits
// ============================================================================

export interface ConfirmedReferenceState {
  references: EchoConfirmedReference[];
  decorations: DecorationSet;
}

function buildConfirmedDecorations(
  references: EchoConfirmedReference[],
  doc: Text
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  // CodeMirror requires ranges to be added in ascending order of 'from'
  const sorted = [...references].sort((a, b) => a.from - b.from || a.to - b.to);

  for (const ref of sorted) {
    if (ref.from >= 0 && ref.to <= doc.length && ref.from < ref.to) {
      builder.add(
        ref.from,
        ref.to,
        Decoration.mark({
          class: 'cm-echo-reference',
          attributes: {
            'data-entity-id': ref.entityId,
            'data-ref-id': ref.id,
            'title': `Echo Reference: ${ref.matchedText} (Click to inspect lore)`,
          },
        })
      );
    }
  }

  return builder.finish();
}

export const confirmedReferencesField = StateField.define<ConfirmedReferenceState>({
  create() {
    return {
      references: [],
      decorations: Decoration.none,
    };
  },
  update(current, tr) {
    let references = current.references;

    // 1. Map existing references through document changes
    if (tr.docChanged) {
      const updated: EchoConfirmedReference[] = [];
      for (const ref of references) {
        const newFrom = tr.changes.mapPos(ref.from, 1);
        const newTo = tr.changes.mapPos(ref.to, -1);

        // Invalidation rule: if the range collapsed or the text inside changed,
        // invalidate the reference so corrupted text does not retain a false binding.
        if (newFrom < newTo && newTo <= tr.newDoc.length) {
          const currentSlice = tr.newDoc.sliceString(newFrom, newTo);
          if (currentSlice.toLowerCase() === ref.matchedText.toLowerCase()) {
            updated.push({
              ...ref,
              from: newFrom,
              to: newTo,
              matchedText: currentSlice,
            });
          }
        }
      }
      references = updated;
    }

    // 2. Handle effects (confirm, unconfirm, reset)
    for (const effect of tr.effects) {
      if (effect.is(confirmReferenceEffect)) {
        // Remove any existing reference overlapping the new range
        const newRef = effect.value;
        references = references.filter(
          (r) => !(r.from < newRef.to && r.to > newRef.from)
        );
        references.push(newRef);
      } else if (effect.is(unconfirmReferenceEffect)) {
        references = references.filter((r) => r.id !== effect.value.id);
      } else if (effect.is(resetReferencesEffect)) {
        references = [];
      }
    }

    const decorations = buildConfirmedDecorations(references, tr.newDoc);
    return { references, decorations };
  },
  provide: (field) => EditorView.decorations.from(field, (val) => val.decorations),
});

// ============================================================================
// Candidate Matches Scanner & Decoration
// Scans text for canonical lore names and aliases that have NOT yet been confirmed
// Supports multi-word names, Unicode, punctuation boundaries, and alias matching
// ============================================================================

const indexes = new WeakMap<EchoEntity[], ReturnType<typeof buildEchoSearchIndex>>();
export function findCandidateMatches(doc: Text, entities: EchoEntity[], confirmed: EchoConfirmedReference[] = []): EchoCandidateMatch[] {
  let index = indexes.get(entities);
  if (!index) { index = buildEchoSearchIndex(entities); indexes.set(entities, index); }
  return matchEchoText(doc.toString(), index, confirmed);
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

    // Recalculate candidate matches on doc changes, confirmed reference changes, or entity updates
    const entitiesChanged = tr.effects.some((e) => e.is(setEntitiesEffect));
    const refChanged = tr.effects.some(
      (e) =>
        e.is(confirmReferenceEffect) ||
        e.is(unconfirmReferenceEffect) ||
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
// Dispatches click events on confirmed references or candidate suggestions
// ============================================================================

export interface EchoEditorCallbacks {
  onSelectReference?: (entityId: string, rect: DOMRect, from: number, to: number) => void;
  onClarifyCandidate?: (candidate: EchoCandidateMatch, rect: DOMRect) => void;
}

export function echoClickPlugin(callbacks: EchoEditorCallbacks): Extension {
  return EditorView.domEventHandlers({
    mousedown(event) {
      if (event.button !== 0) return false;
      const reference = (event.target as HTMLElement | null)?.closest('.cm-echo-reference, .cm-echo-candidate, .cm-echo-candidate-ambiguous');
      if (reference) { event.preventDefault(); return true; }
      return false;
    },
    click(event, view) {
      const target = event.target as HTMLElement | null;
      if (!target) return false;

      // 1. Check if user clicked a confirmed reference
      const refEl = target.closest('.cm-echo-reference') as HTMLElement | null;
      if (refEl) {
        const entityId = refEl.getAttribute('data-entity-id');
        const pos = view.posAtDOM(refEl);
        const rect = refEl.getBoundingClientRect();
        if (entityId && callbacks.onSelectReference) {
          const refs = view.state.field(confirmedReferencesField).references;
          const match =
            refs.find((r) => r.from <= pos && r.to >= pos) ||
            refs.find((r) => r.entityId === entityId);
          callbacks.onSelectReference(
            entityId,
            rect,
            match ? match.from : pos,
            match ? match.to : pos
          );
          return true;
        }
      }

      // 2. Check if user clicked an unconfirmed candidate
      const candEl = target.closest('.cm-echo-candidate, .cm-echo-candidate-ambiguous') as HTMLElement | null;
      if (candEl) {
        const pos = view.posAtDOM(candEl);
        const rect = candEl.getBoundingClientRect();
        const candidates = view.state.field(candidateMatchesField).candidates;
        const candWord = candEl.getAttribute('data-candidate-word');
        const match =
          candidates.find((c) => c.from <= pos && c.to >= pos) ||
          candidates.find((c) => c.matchedText === candWord) ||
          candidates.find((c) => Math.abs(c.from - pos) <= (c.matchedText?.length || 0) + 2);
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
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
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
  // Confirmed references: elegant gold dotted underline + cursor pointer
  '.cm-echo-reference': {
    borderBottom: '2px solid rgba(212, 175, 55, 0.85)',
    backgroundColor: 'rgba(212, 175, 55, 0.10)',
    borderRadius: '2px',
    padding: '0 2px',
    cursor: 'pointer',
    transition: 'background-color 0.15s ease, border-color 0.15s ease',
  },
  '.cm-echo-reference:hover': {
    backgroundColor: 'rgba(212, 175, 55, 0.22)',
    borderBottomColor: '#f1d279',
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
