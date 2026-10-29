import React, { useState, useMemo } from 'react';
import type { DocumentMetadata, CharacterFields, LoreCategory } from '@/types';
import type { Plan, Thought } from '@/utils/thought';
import {
  User,
  MapPin,
  Tag,
  Briefcase,
  Eye,
  BookOpen,
  Plus,
  X,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Sliders,
  Building,
  ExternalLink,
  Shield,
} from 'lucide-react';
import { CharacterAffiliationSelector } from './CharacterAffiliationSelector';
import { EntityLinkField } from './EntityLinkField';
import { RESIDENCE_LABEL, getCharacterHeldOffices } from '@/utils/universe';

interface CharacterProfileFieldsProps {
  fields: CharacterFields;
  onChange: (key: string, value: any) => void;
  readOnly?: boolean;
  isInteractive: boolean;
  documentId?: string;
  universeId?: string;
  plan?: Plan | null;
  onSaveThought?: (
    expected: () => number,
    plan: import('@/utils/relationships').PlanMutation,
    acknowledge: (result: Thought) => void
  ) => Promise<boolean>;
  allDocuments: DocumentMetadata[];
  onNavigateToEntity: (id: string) => void;
  onOpenCreateFaction?: (initialName?: string) => void;
  handleCreateEntity: (category: LoreCategory, initialName?: string) => void;
}

const VITAL_STATUS_SUGGESTIONS = [
  'Active / Alive',
  'Deceased',
  'Missing',
  'In Exile',
  'Dormant / Sealed',
  'Immortal / Timeless',
  'Unknown',
];

const NARRATIVE_ROLE_SUGGESTIONS = [
  'Protagonist',
  'Antagonist',
  'Supporting Ally',
  'Foil',
  'Mentor',
  'Historical Legend',
];

export const CharacterProfileFields: React.FC<CharacterProfileFieldsProps> = ({
  fields,
  onChange,
  readOnly = false,
  isInteractive,
  documentId,
  universeId,
  plan,
  onSaveThought,
  allDocuments,
  onNavigateToEntity,
  onOpenCreateFaction,
  handleCreateEntity,
}) => {
  // Alias input state
  const [aliasInput, setAliasInput] = useState('');

  // Section visibility states (can be toggled by the writer without deleting data)
  const [showIdentity, setShowIdentity] = useState(true);
  const [showSocial, setShowSocial] = useState(true);
  const [showAppearance, setShowAppearance] = useState(true);
  const [showPersonality, setShowPersonality] = useState(true);

  // Derive official faction positions dynamically without mutating Character document
  const heldOffices = useMemo(() => {
    if (!documentId) return [];
    return getCharacterHeldOffices(
      documentId,
      allDocuments,
      universeId,
      plan?.universes || []
    );
  }, [documentId, allDocuments, universeId, plan]);

  // Character Development & Writing Notes collapsible state
  const hasWritingNotes = Boolean(
    fields.goals?.trim() ||
      fields.motivations?.trim() ||
      fields.strengths?.trim() ||
      fields.weaknesses?.trim()
  );
  const [showWritingNotes, setShowWritingNotes] = useState(hasWritingNotes);

  // Normalize aliases to string[]
  const rawAliases = fields.aliases;
  const aliases: string[] = Array.isArray(rawAliases)
    ? rawAliases.filter(Boolean)
    : typeof rawAliases === 'string'
    ? (rawAliases as string)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  const handleAddAlias = (rawText: string) => {
    const trimmed = rawText.trim();
    if (!trimmed) return;
    const splitItems = trimmed
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const updated = [...new Set([...aliases, ...splitItems])];
    onChange('aliases', updated);
    setAliasInput('');
  };

  const handleRemoveAlias = (indexToRemove: number) => {
    const updated = aliases.filter((_, idx) => idx !== indexToRemove);
    onChange('aliases', updated);
  };

  return (
    <div className="space-y-4">
      {/* ==================== 1. LEGACY ROLE / ARCHETYPE BANNER ==================== */}
      {fields.role && fields.role.trim() !== '' && (
        <div className="p-3.5 rounded-xl border border-amber-500/40 bg-amber-500/10 space-y-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <div>
                <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider">
                  Legacy Role / Archetype Preserved
                </span>
                <p className="text-foreground text-xs font-medium">
                  "{fields.role}"
                </p>
              </div>
            </div>

            {!readOnly && (
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onChange('occupation', fields.role)}
                  className="px-2 py-1 rounded bg-background/80 hover:bg-background border border-amber-500/30 text-[11px] font-medium text-foreground transition-colors"
                  title="Copy this value into Occupation"
                >
                  Use as Occupation
                </button>
                <button
                  type="button"
                  onClick={() => onChange('narrative_role', fields.role)}
                  className="px-2 py-1 rounded bg-background/80 hover:bg-background border border-amber-500/30 text-[11px] font-medium text-foreground transition-colors"
                  title="Copy this value into Narrative Role"
                >
                  Use as Narrative Role
                </button>
                <button
                  type="button"
                  onClick={() => onChange('role', '')}
                  className="px-2 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 text-[11px] font-medium text-rose-300 transition-colors"
                  title="Clear legacy role field"
                >
                  Clear Field
                </button>
              </div>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground leading-relaxed">
            This field was carried over from an earlier notebook format. It is safely preserved and will not be overwritten automatically.
          </p>
        </div>
      )}

      {/* ==================== SECTION VISIBILITY CONTROLS ==================== */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-lg bg-muted/20 border border-border/50 text-[11px]">
        <span className="text-muted-foreground font-medium flex items-center gap-1.5">
          <Sliders className="w-3 h-3 text-primary" />
          Display Sections:
        </span>
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => setShowIdentity(!showIdentity)}
            className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
              showIdentity
                ? 'bg-primary/20 text-primary border border-primary/40'
                : 'bg-muted/40 text-muted-foreground hover:bg-muted/60'
            }`}
          >
            Identity
          </button>
          <button
            type="button"
            onClick={() => setShowSocial(!showSocial)}
            className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
              showSocial
                ? 'bg-primary/20 text-primary border border-primary/40'
                : 'bg-muted/40 text-muted-foreground hover:bg-muted/60'
            }`}
          >
            Social &amp; Story
          </button>
          <button
            type="button"
            onClick={() => setShowAppearance(!showAppearance)}
            className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
              showAppearance
                ? 'bg-primary/20 text-primary border border-primary/40'
                : 'bg-muted/40 text-muted-foreground hover:bg-muted/60'
            }`}
          >
            Appearance &amp; Attire
          </button>
          <button
            type="button"
            onClick={() => setShowPersonality(!showPersonality)}
            className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
              showPersonality
                ? 'bg-primary/20 text-primary border border-primary/40'
                : 'bg-muted/40 text-muted-foreground hover:bg-muted/60'
            }`}
          >
            Personality
          </button>
          <button
            type="button"
            onClick={() => setShowWritingNotes(!showWritingNotes)}
            className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
              showWritingNotes
                ? 'bg-primary/20 text-primary border border-primary/40'
                : 'bg-muted/40 text-muted-foreground hover:bg-muted/60'
            }`}
          >
            Writing Notes {hasWritingNotes && '•'}
          </button>
        </div>
      </div>

      {/* ==================== 2. CORE IDENTITY SECTION ==================== */}
      {showIdentity && (
        <div className="p-3.5 rounded-xl border border-border/70 bg-card/50 space-y-3">
          <div className="flex items-center gap-1.5 pb-2 border-b border-border/40 text-foreground font-semibold text-xs">
            <User className="w-3.5 h-3.5 text-sky-400" />
            <span>Core Identity &amp; Demographics</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {/* Species / Race / Lineage */}
            <div>
              <label className="block text-muted-foreground font-medium mb-1">
                Species / Race / Origin
              </label>
              <input
                type="text"
                disabled={readOnly}
                value={fields.species || ''}
                onChange={(e) => onChange('species', e.target.value)}
                placeholder="e.g. Human, Moon Elf, Synthetic, Celestial"
                className="w-full px-2.5 py-1.5 rounded-lg bg-background border border-border/80 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Age / Lifespan */}
            <div>
              <label className="block text-muted-foreground font-medium mb-1">
                Age / Lifespan
              </label>
              <input
                type="text"
                disabled={readOnly}
                value={fields.age || ''}
                onChange={(e) => onChange('age', e.target.value)}
                placeholder="e.g. 38, Ageless, 3rd Century, Created 2140"
                className="w-full px-2.5 py-1.5 rounded-lg bg-background border border-border/80 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Gender / Pronouns */}
            <div>
              <label className="block text-muted-foreground font-medium mb-1">
                Gender / Pronouns
              </label>
              <input
                type="text"
                disabled={readOnly}
                value={fields.gender || ''}
                onChange={(e) => onChange('gender', e.target.value)}
                placeholder="e.g. She/Her, He/Him, Non-binary, Agender"
                className="w-full px-2.5 py-1.5 rounded-lg bg-background border border-border/80 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Vital Status */}
            <div className="sm:col-span-2 md:col-span-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1">
                <label className="text-muted-foreground font-medium">Vital Status</label>
                <div className="flex flex-wrap items-center gap-1 text-[10px]">
                  <span className="text-muted-foreground/60 mr-1">Suggestions:</span>
                  {VITAL_STATUS_SUGGESTIONS.map((sug) => (
                    <button
                      key={sug}
                      type="button"
                      disabled={readOnly}
                      onClick={() => onChange('vital_status', sug)}
                      className="px-1.5 py-0.5 rounded bg-muted/40 hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              </div>
              <input
                type="text"
                disabled={readOnly}
                value={fields.vital_status || ''}
                onChange={(e) => onChange('vital_status', e.target.value)}
                placeholder="e.g. Active / Alive, Deceased, Sealed, Unknown"
                className="w-full px-2.5 py-1.5 rounded-lg bg-background border border-border/80 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Aliases & Titles */}
            <div className="sm:col-span-2 md:col-span-3">
              <label className="block text-muted-foreground font-medium mb-1">
                Aliases, Epithets &amp; Known Titles
              </label>
              <div className="space-y-2">
                {/* Active alias tags */}
                {aliases.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {aliases.map((alias, idx) => (
                      <span
                        key={`${alias}-${idx}`}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 border border-primary/30 text-primary text-xs font-medium"
                      >
                        <Tag className="w-3 h-3 text-primary/70" />
                        <span>{alias}</span>
                        {!readOnly && (
                          <button
                            type="button"
                            onClick={() => handleRemoveAlias(idx)}
                            className="hover:text-rose-400 p-0.5 rounded"
                            title={`Remove ${alias}`}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                )}

                {/* Inline alias entry */}
                {!readOnly && (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={aliasInput}
                      onChange={(e) => setAliasInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddAlias(aliasInput);
                        }
                      }}
                      placeholder="Add an alias or epithet (press Enter or comma-separate multiple)..."
                      className="flex-1 px-2.5 py-1.5 rounded-lg bg-background border border-border/80 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddAlias(aliasInput)}
                      className="px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-foreground font-medium flex items-center gap-1 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
            {/* Character Residence / Home Location */}
            <div className="md:col-span-2">
              {isInteractive ? (
                <EntityLinkField
                  currentDocId={documentId!}
                  universeId={universeId!}
                  plan={plan || null}
                  onSaveThought={onSaveThought}
                  allDocuments={allDocuments}
                  onNavigateToEntity={onNavigateToEntity}
                  fieldLabel="Residence / Origin Location"
                  icon={MapPin}
                  allowedCategories={['locations']}
                  relationshipLabel={RESIDENCE_LABEL}
                  matchingLabels={['resides in', 'resident of', 'birthplace', 'originates from']}
                  reciprocalLabels={['inhabited by']}
                  isSource={true}
                  multiple={false}
                  legacyText={fields.residence || ''}
                  onClearLegacyText={() => onChange('residence', '')}
                  onOpenCreateEntity={handleCreateEntity}
                  readOnly={readOnly}
                  descriptionHelp="Where this character dwells, holds dominion, or was born."
                />
              ) : (
                <div>
                  <label className="block text-muted-foreground font-medium mb-1">
                    Residence / Origin
                  </label>
                  <input
                    type="text"
                    disabled={readOnly}
                    value={fields.residence || ''}
                    onChange={(e) => onChange('residence', e.target.value)}
                    placeholder="e.g. Sunken Citadel, Northern Marches"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-background border border-border/80 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================== 3. SOCIAL & NARRATIVE IDENTITY ==================== */}
      {showSocial && (
        <div className="p-3.5 rounded-xl border border-border/70 bg-card/50 space-y-3">
          <div className="flex items-center gap-1.5 pb-2 border-b border-border/40 text-foreground font-semibold text-xs">
            <Briefcase className="w-3.5 h-3.5 text-amber-400" />
            <span>Social Standing &amp; Narrative Role</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Occupation / Profession */}
            <div>
              <label className="block text-muted-foreground font-medium mb-1">
                Occupation / Profession
              </label>
              <input
                type="text"
                disabled={readOnly}
                value={fields.occupation || ''}
                onChange={(e) => onChange('occupation', e.target.value)}
                placeholder="e.g. Master Alchemist, Starship Pilot, High Blacksmith"
                className="w-full px-2.5 py-1.5 rounded-lg bg-background border border-border/80 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <p className="text-[10px] text-muted-foreground/70 mt-1">
                Craft, trade, or civilian profession. Distinct from official faction hierarchy seats.
              </p>
            </div>

            {/* Narrative Role */}
            <div>
              <div className="flex items-center justify-between gap-1 mb-1">
                <label className="text-muted-foreground font-medium">Narrative Role</label>
                <div className="hidden sm:flex flex-wrap items-center gap-1 text-[10px]">
                  {NARRATIVE_ROLE_SUGGESTIONS.slice(0, 3).map((role) => (
                    <button
                      key={role}
                      type="button"
                      disabled={readOnly}
                      onClick={() => onChange('narrative_role', role)}
                      className="px-1.5 py-0.5 rounded bg-muted/40 hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {role}
                    </button>
                  ))}
                </div>
              </div>
                            <input
                type="text"
                disabled={readOnly}
                value={fields.narrative_role || ''}
                onChange={(e) => onChange('narrative_role', e.target.value)}
                placeholder="e.g. Protagonist, Antagonist, Supporting Ally, Foil, Mentor"
                className="w-full px-2.5 py-1.5 rounded-lg bg-background border border-border/80 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Official Faction Positions & Seats (Derived dynamically from Factions) */}
            <div className="md:col-span-2 space-y-1.5 p-2.5 rounded-lg bg-background/80 border border-border/70">
              <div className="flex items-center justify-between">
                <label className="text-muted-foreground font-medium flex items-center gap-1.5 text-xs">
                  <Building className="w-3.5 h-3.5 text-amber-400" />
                  Institutional Positions &amp; Seats (Derived from Factions)
                </label>
                <span className="text-[10px] text-muted-foreground">
                  {heldOffices.length} {heldOffices.length === 1 ? 'Office Held' : 'Offices Held'}
                </span>
              </div>

              {heldOffices.length === 0 ? (
                <p className="text-[11px] text-muted-foreground/70 italic">
                  No official faction positions currently held. (Official positions and seats are assigned within Faction organization structures).
                </p>
              ) : (
                <div className="flex flex-wrap gap-2 pt-1">
                  {heldOffices.map((office) => (
                    <div
                      key={`${office.factionId}-${office.positionId}`}
                      className="inline-flex flex-col gap-0.5 p-2 rounded-lg bg-card border border-amber-500/30 text-xs shadow-sm"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-foreground text-xs text-amber-300">
                          {office.positionTitle}
                        </span>
                        {office.branchName && (
                          <span className="text-[10px] text-muted-foreground px-1.5 py-0.2 rounded bg-muted/40">
                            {office.branchName}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <span>in</span>
                        <button
                          type="button"
                          onClick={() => onNavigateToEntity(office.factionId)}
                          className="font-medium text-foreground hover:text-primary hover:underline inline-flex items-center gap-0.5"
                          title="View Faction"
                        >
                          <Shield className="w-2.5 h-2.5 text-amber-400" />
                          <span>{office.factionTitle}</span>
                          <ExternalLink className="w-2.5 h-2.5 ml-0.5" />
                        </button>
                      </div>
                      {office.description && (
                        <p className="text-[10px] text-muted-foreground/80 mt-0.5 line-clamp-1">
                          {office.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <h4 className="md:col-span-2 font-medium">Affiliations &amp; Memberships (Explicit Links)</h4>
            {/* Character Affiliation (Factions/Nations) */}
            <div className="md:col-span-2">
              {isInteractive ? (
                <CharacterAffiliationSelector
                  characterDocId={documentId!}
                  universeId={universeId!}
                  plan={plan || null}
                  onSaveThought={onSaveThought}
                  allDocuments={allDocuments}
                  onNavigateToEntity={onNavigateToEntity}
                  legacyAffiliation={fields.affiliation || ''}
                  onClearLegacyAffiliation={() => onChange('affiliation', '')}
                  onOpenCreateFaction={onOpenCreateFaction}
                  readOnly={readOnly}
                />
              ) : (
                <div>
                  <label className="block text-muted-foreground font-medium mb-1">
                    Affiliation / Order (Factions &amp; Nations)
                  </label>
                  <input
                    type="text"
                    disabled={readOnly}
                    value={fields.affiliation || ''}
                    onChange={(e) => onChange('affiliation', e.target.value)}
                    placeholder="e.g. Ashen Order, Crown Council"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-background border border-border/80 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              )}
            </div>


          </div>
        </div>
      )}

      {/* ==================== 4. APPEARANCE & ATTIRE ==================== */}
      {showAppearance && (
        <div className="p-3.5 rounded-xl border border-border/70 bg-card/50 space-y-3">
          <div className="flex items-center gap-1.5 pb-2 border-b border-border/40 text-foreground font-semibold text-xs">
            <Eye className="w-3.5 h-3.5 text-emerald-400" />
            <span>Appearance &amp; Signature Attire</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-muted-foreground font-medium mb-1">
                Physical Appearance
              </label>
              <textarea
                rows={3}
                disabled={readOnly}
                value={fields.physical_appearance || ''}
                onChange={(e) => onChange('physical_appearance', e.target.value)}
                placeholder="Height, physique, distinctive scars, complexion, hair/eyes, or synthetic/alien traits..."
                className="w-full px-2.5 py-1.5 rounded-lg bg-background border border-border/80 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary resize-y"
              />
            </div>

            <div>
              <label className="block text-muted-foreground font-medium mb-1">
                Clothing &amp; Signature Attire
              </label>
              <textarea
                rows={3}
                disabled={readOnly}
                value={fields.clothing_attire || ''}
                onChange={(e) => onChange('clothing_attire', e.target.value)}
                placeholder="Signature garments, robes of office, battle harness, ceremonial armor, everyday travel gear..."
                className="w-full px-2.5 py-1.5 rounded-lg bg-background border border-border/80 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary resize-y"
              />
            </div>
          </div>
        </div>
      )}

      {/* ==================== 5. PERSONALITY & DEMEANOR ==================== */}
      {showPersonality && (
        <div className="p-3.5 rounded-xl border border-border/70 bg-card/50 space-y-3">
          <div className="flex items-center gap-1.5 pb-2 border-b border-border/40 text-foreground font-semibold text-xs">
            <Sparkles className="w-3.5 h-3.5 text-violet-400" />
            <span>Personality &amp; Demeanor</span>
          </div>

          <div>
            <label className="block text-muted-foreground font-medium mb-1">
              Personality &amp; Behavioral Habits
            </label>
            <textarea
              rows={3}
              disabled={readOnly}
              value={fields.personality || ''}
              onChange={(e) => onChange('personality', e.target.value)}
              placeholder="Temperament, speech patterns, behavioral quirks, worldview, social demeanor, moral code..."
              className="w-full px-2.5 py-1.5 rounded-lg bg-background border border-border/80 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary resize-y"
            />
          </div>
        </div>
      )}

      {/* ==================== 6. CHARACTER DEVELOPMENT & WRITING NOTES (COLLAPSIBLE) ==================== */}
      <div className="border border-border/70 rounded-xl bg-card/40 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowWritingNotes(!showWritingNotes)}
          className="w-full flex items-center justify-between p-3 bg-muted/20 hover:bg-muted/30 text-left transition-colors"
        >
          <div className="flex items-center gap-2">
            <BookOpen className="w-3.5 h-3.5 text-primary" />
            <span className="font-semibold text-foreground text-xs">
              Character Development &amp; Writing Notes
            </span>
            <span className="text-[11px] text-muted-foreground">
              (Optional Narrative Prompts)
            </span>
            {hasWritingNotes && (
              <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
            )}
          </div>
          {showWritingNotes ? (
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          )}
        </button>

        {showWritingNotes && (
          <div className="p-3.5 space-y-3 border-t border-border/50 text-xs">
            <p className="text-[11px] text-muted-foreground">
              These developmental writing prompts are preserved for your narrative drafting and interior character planning.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-muted-foreground font-medium mb-1">Primary Goals</label>
                <input
                  type="text"
                  disabled={readOnly}
                  value={fields.goals || ''}
                  onChange={(e) => onChange('goals', e.target.value)}
                  placeholder="e.g. Restore the broken ward, avenge house"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-background border border-border/80 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-muted-foreground font-medium mb-1">Motivations &amp; Passions</label>
                <input
                  type="text"
                  disabled={readOnly}
                  value={fields.motivations || ''}
                  onChange={(e) => onChange('motivations', e.target.value)}
                  placeholder="What drives this character when tested?"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-background border border-border/80 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-muted-foreground font-medium mb-1">Strengths &amp; Capabilities</label>
                <input
                  type="text"
                  disabled={readOnly}
                  value={fields.strengths || ''}
                  onChange={(e) => onChange('strengths', e.target.value)}
                  placeholder="e.g. Tactical brilliance, incorruptible will"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-background border border-border/80 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-muted-foreground font-medium mb-1">Weaknesses &amp; Flaws</label>
                <input
                  type="text"
                  disabled={readOnly}
                  value={fields.weaknesses || ''}
                  onChange={(e) => onChange('weaknesses', e.target.value)}
                  placeholder="e.g. Unforgiving pride, sworn vow"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-background border border-border/80 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
