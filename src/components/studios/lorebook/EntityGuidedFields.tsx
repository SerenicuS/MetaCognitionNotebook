import React, { useState } from 'react';
import type { DocumentMetadata, LorebookMetadata, LoreCategory } from '@/types';
import type { Plan, Thought } from '@/utils/thought';
import {
  ChevronDown,
  ChevronRight,
  Sliders,
  Users,
  MapPin,
  Shield,
  Sword,
  Sparkles,
} from 'lucide-react';
import { CharacterProfileFields } from './CharacterProfileFields';
import { FactionOrganizationEditor } from './FactionOrganizationEditor';
import { EntityLinkField } from './EntityLinkField';
import {
  RESIDENCE_LABEL,
  LEADERSHIP_LABEL,
  TERRITORY_LABEL,
  ALLY_LABEL,
  RIVAL_LABEL,
  OWNER_LABEL,
  CREATOR_LABEL,
  OCCURRED_AT_LABEL,
  PARTICIPANT_LABEL,
} from '@/utils/universe';

interface EntityGuidedFieldsProps {
  metadata: LorebookMetadata;
  onChange: (patch: Partial<LorebookMetadata>) => void;
  readOnly?: boolean;
  documentId?: string;
  universeId?: string;
  plan?: Plan | null;
  onSaveThought?: (
    expected: () => number,
    plan: import('@/utils/relationships').PlanMutation,
    acknowledge: (result: Thought) => void
  ) => Promise<boolean>;
  allDocuments?: DocumentMetadata[];
  onNavigateToEntity?: (id: string) => void;
  onOpenCreateFaction?: (initialName?: string) => void;
  onOpenCreateEntity?: (category: LoreCategory, initialName?: string) => void;
}

export const EntityGuidedFields: React.FC<EntityGuidedFieldsProps> = ({
  metadata,
  onChange,
  readOnly = false,
  documentId,
  universeId,
  plan = null,
  onSaveThought,
  allDocuments = [],
  onNavigateToEntity = () => {},
  onOpenCreateFaction,
  onOpenCreateEntity,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const entryType = metadata.entry_type;

  // Supported entry types with guided attributes
  if (
    !['character', 'location', 'faction', 'concept', 'rule', 'artifact', 'event'].includes(
      entryType
    )
  ) {
    return null;
  }

  const handleFieldChange = (section: keyof LorebookMetadata, key: string, value: any) => {
    const currentSection = (metadata[section] as Record<string, any>) || {};
    onChange({
      [section]: {
        ...currentSection,
        [key]: value,
      },
    });
  };

  // Safe fallback for entity creator handler
  const handleCreateEntity = (category: LoreCategory, initialName?: string) => {
    if (onOpenCreateEntity) {
      onOpenCreateEntity(category, initialName);
    } else if (category === 'factions' && onOpenCreateFaction) {
      onOpenCreateFaction(initialName);
    }
  };

  const isInteractive = Boolean(documentId && universeId);

  return (
    <div className="border border-border/80 rounded-xl bg-card/40 overflow-hidden mb-6 transition-all">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3.5 bg-muted/20 hover:bg-muted/40 text-left transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Sliders className="w-4 h-4 text-primary" />
          <span className="text-sm font-serif font-semibold text-foreground">
            {entryType === 'character' && 'Character Profile Attributes'}
            {entryType === 'location' && 'Location Lore & Geography'}
            {entryType === 'faction' && 'Faction / Nation Structure'}
            {(entryType === 'concept' || entryType === 'rule') && 'System Rules & Limitations'}
            {entryType === 'artifact' && 'Artifact & Relic Properties'}
            {entryType === 'event' && 'Historical Event Chronicle'}
          </span>
          <span className="text-xs text-muted-foreground font-sans">
            (Optional Guided Attributes)
          </span>
        </div>
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {isExpanded && (
        <div className="p-4 space-y-4 border-t border-border/60 text-xs">
          {/* ==================== CHARACTER FIELDS ==================== */}
          {entryType === 'character' && (
            <CharacterProfileFields
              fields={metadata.character_fields || {}}
              onChange={(key, val) => handleFieldChange('character_fields', key, val)}
              readOnly={readOnly}
              isInteractive={isInteractive}
              documentId={documentId}
              universeId={universeId}
              plan={plan}
              onSaveThought={onSaveThought}
              allDocuments={allDocuments}
              onNavigateToEntity={onNavigateToEntity}
              onOpenCreateFaction={onOpenCreateFaction}
              handleCreateEntity={handleCreateEntity}
            />
          )}

          {/* ==================== LOCATION FIELDS ==================== */}
          {entryType === 'location' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-muted-foreground font-medium mb-1">Location Type</label>
                <input
                  type="text"
                  disabled={readOnly}
                  value={metadata.location_fields?.location_type || ''}
                  onChange={(e) => handleFieldChange('location_fields', 'location_type', e.target.value)}
                  placeholder="e.g. Citadel, Sanctuary, Archipelagic Province"
                  className="w-full px-3 py-1.5 rounded-lg bg-background border border-border/80 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-muted-foreground font-medium mb-1">Region / Province</label>
                <input
                  type="text"
                  disabled={readOnly}
                  value={metadata.location_fields?.region || ''}
                  onChange={(e) => handleFieldChange('location_fields', 'region', e.target.value)}
                  placeholder="e.g. Northern Marches, Sunken Vale"
                  className="w-full px-3 py-1.5 rounded-lg bg-background border border-border/80 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Ruling / Controlling Factions */}
              <div className="md:col-span-2">
                {isInteractive ? (
                  <EntityLinkField
                    currentDocId={documentId!}
                    universeId={universeId!}
                    plan={plan}
                    onSaveThought={onSaveThought}
                    allDocuments={allDocuments}
                    onNavigateToEntity={onNavigateToEntity}
                    fieldLabel="Ruling / Controlling Factions"
                    icon={Shield}
                    allowedCategories={['factions']}
                    relationshipLabel="Controlled by"
                    matchingLabels={['controlled by', 'controls', 'ruling faction', 'sovereign']}
                    reciprocalLabels={[TERRITORY_LABEL, 'controls']}
                    isSource={true}
                    multiple={true}
                    legacyText={metadata.location_fields?.factions || ''}
                    onClearLegacyText={() => handleFieldChange('location_fields', 'factions', '')}
                    onOpenCreateEntity={handleCreateEntity}
                    readOnly={readOnly}
                    descriptionHelp="Factions, kingdoms, or orders that govern or claim sovereignty here."
                  />
                ) : (
                  <div>
                    <label className="block text-muted-foreground font-medium mb-1">Ruling / Associated Factions</label>
                    <input
                      type="text"
                      disabled={readOnly}
                      value={metadata.location_fields?.factions || ''}
                      onChange={(e) => handleFieldChange('location_fields', 'factions', e.target.value)}
                      placeholder="e.g. Grand Theocracy, Merchant League"
                      className="w-full px-3 py-1.5 rounded-lg bg-background border border-border/80 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                )}
              </div>

              {/* Notable Inhabitants & Peoples */}
              <div className="md:col-span-2">
                {isInteractive ? (
                  <EntityLinkField
                    currentDocId={documentId!}
                    universeId={universeId!}
                    plan={plan}
                    onSaveThought={onSaveThought}
                    allDocuments={allDocuments}
                    onNavigateToEntity={onNavigateToEntity}
                    fieldLabel="Notable Inhabitants & Key Figures"
                    icon={Users}
                    allowedCategories={['characters', 'cultures']}
                    relationshipLabel="Inhabited by"
                    matchingLabels={['inhabited by', 'resides in', 'resident of', 'inhabitants']}
                    reciprocalLabels={[RESIDENCE_LABEL, 'resides in']}
                    isSource={true}
                    multiple={true}
                    legacyText={metadata.location_fields?.inhabitants || ''}
                    onClearLegacyText={() => handleFieldChange('location_fields', 'inhabitants', '')}
                    onOpenCreateEntity={handleCreateEntity}
                    readOnly={readOnly}
                    descriptionHelp="Characters who dwell here or notable cultures rooted in this soil."
                  />
                ) : (
                  <div>
                    <label className="block text-muted-foreground font-medium mb-1">Inhabitants / Populations</label>
                    <input
                      type="text"
                      disabled={readOnly}
                      value={metadata.location_fields?.inhabitants || ''}
                      onChange={(e) => handleFieldChange('location_fields', 'inhabitants', e.target.value)}
                      placeholder="e.g. High Elves, Scholarly Monks, Exiles"
                      className="w-full px-3 py-1.5 rounded-lg bg-background border border-border/80 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                )}
              </div>

              <div className="md:col-span-2">
                <label className="block text-muted-foreground font-medium mb-1">Notable Historical Events</label>
                <input
                  type="text"
                  disabled={readOnly}
                  value={metadata.location_fields?.notable_events || ''}
                  onChange={(e) => handleFieldChange('location_fields', 'notable_events', e.target.value)}
                  placeholder="e.g. The Siege of the Sun Gate (Year 402)"
                  className="w-full px-3 py-1.5 rounded-lg bg-background border border-border/80 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
          )}

          {/* ==================== FACTION FIELDS ==================== */}
          {entryType === 'faction' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-muted-foreground font-medium mb-1">Faction / Organization Type</label>
                <input
                  type="text"
                  disabled={readOnly}
                  value={metadata.faction_fields?.faction_type || ''}
                  onChange={(e) => handleFieldChange('faction_fields', 'faction_type', e.target.value)}
                  placeholder="e.g. Sovereign Kingdom, Holy Order, Underground Syndicate"
                  className="w-full px-3 py-1.5 rounded-lg bg-background border border-border/80 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-muted-foreground font-medium mb-1">Ideology / Core Doctrine</label>
                <input
                  type="text"
                  disabled={readOnly}
                  value={metadata.faction_fields?.ideology || ''}
                  onChange={(e) => handleFieldChange('faction_fields', 'ideology', e.target.value)}
                  placeholder="e.g. Absolute purity of the Arcana, Isolationism"
                  className="w-full px-3 py-1.5 rounded-lg bg-background border border-border/80 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {isInteractive&&<div className="md:col-span-2"><EntityLinkField
                currentDocId={documentId!} universeId={universeId!} plan={plan} onSaveThought={onSaveThought}
                allDocuments={allDocuments} onNavigateToEntity={onNavigateToEntity} fieldLabel="Members" icon={Users}
                allowedCategories={['characters']} relationshipLabel="Members" isSource={true} multiple={true}
                readOnly={readOnly} descriptionHelp="Canonical membership links, including Member of recorded from a Character. Membership does not imply leadership."
              /></div>}
              {/* Leadership / High Council */}
              <div className="md:col-span-2">
                {isInteractive ? (
                  <EntityLinkField
                    currentDocId={documentId!}
                    universeId={universeId!}
                    plan={plan}
                    onSaveThought={onSaveThought}
                    allDocuments={allDocuments}
                    onNavigateToEntity={onNavigateToEntity}
                    fieldLabel="Leadership / High Council"
                    icon={Users}
                    allowedCategories={['characters']}
                    relationshipLabel={LEADERSHIP_LABEL}
                    matchingLabels={['led by', 'leader', 'leads', 'high council', 'commander']}
                    reciprocalLabels={['leads', 'commander of']}
                    isSource={true}
                    multiple={true}
                    legacyText={metadata.faction_fields?.leadership || ''}
                    onClearLegacyText={() => handleFieldChange('faction_fields', 'leadership', '')}
                    onOpenCreateEntity={handleCreateEntity}
                    readOnly={readOnly}
                    descriptionHelp="Characters who lead, govern, or hold high council seats in this faction."
                  />
                ) : (
                  <div>
                    <label className="block text-muted-foreground font-medium mb-1">Leadership / High Council</label>
                    <input
                      type="text"
                      disabled={readOnly}
                      value={metadata.faction_fields?.leadership || ''}
                      onChange={(e) => handleFieldChange('faction_fields', 'leadership', e.target.value)}
                      placeholder="e.g. High Archon, Circle of Five"
                      className="w-full px-3 py-1.5 rounded-lg bg-background border border-border/80 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                )}
              </div>

              {/* Territory / Controlled Locations (Mixed Field with Notes) */}
              <div className="md:col-span-2">
                {isInteractive ? (
                  <EntityLinkField
                    currentDocId={documentId!}
                    universeId={universeId!}
                    plan={plan}
                    onSaveThought={onSaveThought}
                    allDocuments={allDocuments}
                    onNavigateToEntity={onNavigateToEntity}
                    fieldLabel="Territory / Controlled Locations"
                    icon={MapPin}
                    allowedCategories={['locations']}
                    relationshipLabel={TERRITORY_LABEL}
                    matchingLabels={['controls', 'territory', 'ruling', 'governs']}
                    reciprocalLabels={['controlled by']}
                    isSource={true}
                    multiple={true}
                    legacyText={metadata.faction_fields?.territory || ''}
                    onClearLegacyText={() => handleFieldChange('faction_fields', 'territory', '')}
                    mixedNotesValue={metadata.faction_fields?.territory_notes || ''}
                    onMixedNotesChange={(notes) => handleFieldChange('faction_fields', 'territory_notes', notes)}
                    mixedNotesPlaceholder="Territory notes, border disputes, or sphere of influence details..."
                    onOpenCreateEntity={handleCreateEntity}
                    readOnly={readOnly}
                    descriptionHelp="Linked locations governed by this faction, with optional descriptive territory reach notes."
                  />
                ) : (
                  <div>
                    <label className="block text-muted-foreground font-medium mb-1">Territory / Reach</label>
                    <input
                      type="text"
                      disabled={readOnly}
                      value={metadata.faction_fields?.territory || ''}
                      onChange={(e) => handleFieldChange('faction_fields', 'territory', e.target.value)}
                      placeholder="e.g. The Western Spires and trade corridors"
                      className="w-full px-3 py-1.5 rounded-lg bg-background border border-border/80 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                )}
              </div>

              {/* Allies (Undirected Faction Links) */}
              <div>
                {isInteractive ? (
                  <EntityLinkField
                    currentDocId={documentId!}
                    universeId={universeId!}
                    plan={plan}
                    onSaveThought={onSaveThought}
                    allDocuments={allDocuments}
                    onNavigateToEntity={onNavigateToEntity}
                    fieldLabel="Allied Factions & Nations"
                    icon={Shield}
                    allowedCategories={['factions']}
                    relationshipLabel={ALLY_LABEL}
                    matchingLabels={['allied with', 'ally', 'allies']}
                    directed={false}
                    multiple={true}
                    legacyText={metadata.faction_fields?.allies || ''}
                    onClearLegacyText={() => handleFieldChange('faction_fields', 'allies', '')}
                    onOpenCreateEntity={handleCreateEntity}
                    readOnly={readOnly}
                  />
                ) : (
                  <div>
                    <label className="block text-muted-foreground font-medium mb-1">Allies</label>
                    <input
                      type="text"
                      disabled={readOnly}
                      value={metadata.faction_fields?.allies || ''}
                      onChange={(e) => handleFieldChange('faction_fields', 'allies', e.target.value)}
                      placeholder="e.g. The Silver Guild"
                      className="w-full px-3 py-1.5 rounded-lg bg-background border border-border/80 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                )}
              </div>

              {/* Rivals (Undirected Faction Links) */}
              <div>
                {isInteractive ? (
                  <EntityLinkField
                    currentDocId={documentId!}
                    universeId={universeId!}
                    plan={plan}
                    onSaveThought={onSaveThought}
                    allDocuments={allDocuments}
                    onNavigateToEntity={onNavigateToEntity}
                    fieldLabel="Rival Factions & Enemies"
                    icon={Sword}
                    allowedCategories={['factions']}
                    relationshipLabel={RIVAL_LABEL}
                    matchingLabels={['rival of', 'rival', 'enemy of', 'hostile to']}
                    directed={false}
                    multiple={true}
                    legacyText={metadata.faction_fields?.rivals || ''}
                    onClearLegacyText={() => handleFieldChange('faction_fields', 'rivals', '')}
                    onOpenCreateEntity={handleCreateEntity}
                    readOnly={readOnly}
                  />
                ) : (
                  <div>
                    <label className="block text-muted-foreground font-medium mb-1">Rivals / Enemies</label>
                    <input
                      type="text"
                      disabled={readOnly}
                      value={metadata.faction_fields?.rivals || ''}
                      onChange={(e) => handleFieldChange('faction_fields', 'rivals', e.target.value)}
                      placeholder="e.g. Ashen Order"
                      className="w-full px-3 py-1.5 rounded-lg bg-background border border-border/80 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                )}
              </div>

              {/* Organization & Official Hierarchy (Phase C2) */}
              <div className="md:col-span-2 pt-3 border-t border-border/60">
                <FactionOrganizationEditor
                  fields={metadata.faction_fields || {}}
                  onChange={(patch) => {
                    const currentSection = metadata.faction_fields || {};
                    onChange({
                      faction_fields: {
                        ...currentSection,
                        ...patch,
                      },
                    });
                  }}
                  readOnly={readOnly}
                  allDocuments={allDocuments}
                  universeId={universeId}
                  universes={plan?.universes || []}
                  onNavigateToEntity={onNavigateToEntity}
                />
              </div>
            </div>
          )}

          {/* ==================== ARTIFACT FIELDS ==================== */}
          {entryType === 'artifact' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-muted-foreground font-medium mb-1">Artifact Type</label>
                <input
                  type="text"
                  disabled={readOnly}
                  value={metadata.artifact_fields?.artifact_type || ''}
                  onChange={(e) => handleFieldChange('artifact_fields', 'artifact_type', e.target.value)}
                  placeholder="e.g. Relic Weapon, Grimoire, Talisman, Ancient Vessel"
                  className="w-full px-3 py-1.5 rounded-lg bg-background border border-border/80 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-muted-foreground font-medium mb-1">Origin / Era of Creation</label>
                <input
                  type="text"
                  disabled={readOnly}
                  value={metadata.artifact_fields?.origin || ''}
                  onChange={(e) => handleFieldChange('artifact_fields', 'origin', e.target.value)}
                  placeholder="e.g. Forged in the First Age of Stars"
                  className="w-full px-3 py-1.5 rounded-lg bg-background border border-border/80 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Current Owner / Bearer */}
              <div>
                {isInteractive ? (
                  <EntityLinkField
                    currentDocId={documentId!}
                    universeId={universeId!}
                    plan={plan}
                    onSaveThought={onSaveThought}
                    allDocuments={allDocuments}
                    onNavigateToEntity={onNavigateToEntity}
                    fieldLabel="Current Owner / Bearer"
                    icon={Shield}
                    allowedCategories={['characters', 'factions']}
                    relationshipLabel={OWNER_LABEL}
                    matchingLabels={['owned by', 'possesses', 'wields', 'bearer', 'held by']}
                    reciprocalLabels={['possesses', 'wields']}
                    isSource={true}
                    multiple={false}
                    legacyText={metadata.artifact_fields?.owner || ''}
                    onClearLegacyText={() => handleFieldChange('artifact_fields', 'owner', '')}
                    onOpenCreateEntity={handleCreateEntity}
                    readOnly={readOnly}
                  />
                ) : (
                  <div>
                    <label className="block text-muted-foreground font-medium mb-1">Current Owner / Bearer</label>
                    <input
                      type="text"
                      disabled={readOnly}
                      value={metadata.artifact_fields?.owner || ''}
                      onChange={(e) => handleFieldChange('artifact_fields', 'owner', e.target.value)}
                      placeholder="e.g. Aldric, Ashen Order"
                      className="w-full px-3 py-1.5 rounded-lg bg-background border border-border/80 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                )}
              </div>

              {/* Creator / Artisan */}
              <div>
                {isInteractive ? (
                  <EntityLinkField
                    currentDocId={documentId!}
                    universeId={universeId!}
                    plan={plan}
                    onSaveThought={onSaveThought}
                    allDocuments={allDocuments}
                    onNavigateToEntity={onNavigateToEntity}
                    fieldLabel="Creator / Artisan"
                    icon={Sparkles}
                    allowedCategories={['characters', 'factions']}
                    relationshipLabel={CREATOR_LABEL}
                    matchingLabels={['created by', 'forged by', 'craftsman', 'built by']}
                    reciprocalLabels={['created', 'forged']}
                    isSource={true}
                    multiple={false}
                    legacyText={metadata.artifact_fields?.creator || ''}
                    onClearLegacyText={() => handleFieldChange('artifact_fields', 'creator', '')}
                    onOpenCreateEntity={handleCreateEntity}
                    readOnly={readOnly}
                  />
                ) : (
                  <div>
                    <label className="block text-muted-foreground font-medium mb-1">Creator / Artisan</label>
                    <input
                      type="text"
                      disabled={readOnly}
                      value={metadata.artifact_fields?.creator || ''}
                      onChange={(e) => handleFieldChange('artifact_fields', 'creator', e.target.value)}
                      placeholder="e.g. Master Smith Corin, Solar Guild"
                      className="w-full px-3 py-1.5 rounded-lg bg-background border border-border/80 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                )}
              </div>

              <div className="md:col-span-2">
                <label className="block text-muted-foreground font-medium mb-1">Powers & Properties</label>
                <textarea
                  rows={2}
                  disabled={readOnly}
                  value={metadata.artifact_fields?.powers || ''}
                  onChange={(e) => handleFieldChange('artifact_fields', 'powers', e.target.value)}
                  placeholder="Known enchantments, magical resonance, curses, or requirements for attunement..."
                  className="w-full px-3 py-1.5 rounded-lg bg-background border border-border/80 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary resize-y"
                />
              </div>
            </div>
          )}

          {/* ==================== EVENT FIELDS ==================== */}
          {entryType === 'event' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-muted-foreground font-medium mb-1">Date / Era / Timeline</label>
                <input
                  type="text"
                  disabled={readOnly}
                  value={metadata.event_fields?.date_era || ''}
                  onChange={(e) => handleFieldChange('event_fields', 'date_era', e.target.value)}
                  placeholder="e.g. 3rd Age, Year 412, During the Eclipse"
                  className="w-full px-3 py-1.5 rounded-lg bg-background border border-border/80 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Event Location */}
              <div>
                {isInteractive ? (
                  <EntityLinkField
                    currentDocId={documentId!}
                    universeId={universeId!}
                    plan={plan}
                    onSaveThought={onSaveThought}
                    allDocuments={allDocuments}
                    onNavigateToEntity={onNavigateToEntity}
                    fieldLabel="Location / Site of Event"
                    icon={MapPin}
                    allowedCategories={['locations']}
                    relationshipLabel={OCCURRED_AT_LABEL}
                    matchingLabels={['occurred at', 'site of', 'located at', 'battleground']}
                    reciprocalLabels={['site of']}
                    isSource={true}
                    multiple={false}
                    legacyText={metadata.event_fields?.location || ''}
                    onClearLegacyText={() => handleFieldChange('event_fields', 'location', '')}
                    onOpenCreateEntity={handleCreateEntity}
                    readOnly={readOnly}
                  />
                ) : (
                  <div>
                    <label className="block text-muted-foreground font-medium mb-1">Location / Site</label>
                    <input
                      type="text"
                      disabled={readOnly}
                      value={metadata.event_fields?.location || ''}
                      onChange={(e) => handleFieldChange('event_fields', 'location', e.target.value)}
                      placeholder="e.g. Sunken Citadel"
                      className="w-full px-3 py-1.5 rounded-lg bg-background border border-border/80 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                )}
              </div>

              {/* Key Participants & Factions */}
              <div className="md:col-span-2">
                {isInteractive ? (
                  <EntityLinkField
                    currentDocId={documentId!}
                    universeId={universeId!}
                    plan={plan}
                    onSaveThought={onSaveThought}
                    allDocuments={allDocuments}
                    onNavigateToEntity={onNavigateToEntity}
                    fieldLabel="Key Participants & Factions"
                    icon={Users}
                    allowedCategories={['characters', 'factions']}
                    relationshipLabel={PARTICIPANT_LABEL}
                    matchingLabels={['participant in', 'participated in', 'participant', 'belligerent']}
                    reciprocalLabels={['participated in']}
                    isSource={false}
                    multiple={true}
                    legacyText={metadata.event_fields?.participants || ''}
                    onClearLegacyText={() => handleFieldChange('event_fields', 'participants', '')}
                    onOpenCreateEntity={handleCreateEntity}
                    readOnly={readOnly}
                    descriptionHelp="Characters and factions actively involved in this event."
                  />
                ) : (
                  <div>
                    <label className="block text-muted-foreground font-medium mb-1">Participants</label>
                    <input
                      type="text"
                      disabled={readOnly}
                      value={metadata.event_fields?.participants || ''}
                      onChange={(e) => handleFieldChange('event_fields', 'participants', e.target.value)}
                      placeholder="e.g. Aldric, The Ashen Order"
                      className="w-full px-3 py-1.5 rounded-lg bg-background border border-border/80 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-muted-foreground font-medium mb-1">Outcome & Result</label>
                <input
                  type="text"
                  disabled={readOnly}
                  value={metadata.event_fields?.outcome || ''}
                  onChange={(e) => handleFieldChange('event_fields', 'outcome', e.target.value)}
                  placeholder="e.g. Decisive victory for the Order, Shattered ward"
                  className="w-full px-3 py-1.5 rounded-lg bg-background border border-border/80 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-muted-foreground font-medium mb-1">Historical Significance</label>
                <input
                  type="text"
                  disabled={readOnly}
                  value={metadata.event_fields?.significance || ''}
                  onChange={(e) => handleFieldChange('event_fields', 'significance', e.target.value)}
                  placeholder="e.g. Marked the start of the Second Cataclysm"
                  className="w-full px-3 py-1.5 rounded-lg bg-background border border-border/80 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
          )}

          {/* ==================== RULES / SYSTEMS FIELDS ==================== */}
          {(entryType === 'concept' || entryType === 'rule') && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-muted-foreground font-medium mb-1">System Type</label>
                <input
                  type="text"
                  disabled={readOnly}
                  value={metadata.rule_fields?.system_type || ''}
                  onChange={(e) => handleFieldChange('rule_fields', 'system_type', e.target.value)}
                  placeholder="e.g. Hard Magic System, Divine Miracle, Advanced Tech"
                  className="w-full px-3 py-1.5 rounded-lg bg-background border border-border/80 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-muted-foreground font-medium mb-1">Fundamental Principles</label>
                <input
                  type="text"
                  disabled={readOnly}
                  value={metadata.rule_fields?.principles || ''}
                  onChange={(e) => handleFieldChange('rule_fields', 'principles', e.target.value)}
                  placeholder="e.g. Energy conservation, blood resonance"
                  className="w-full px-3 py-1.5 rounded-lg bg-background border border-border/80 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-muted-foreground font-medium mb-1">Limitations & Costs</label>
                <input
                  type="text"
                  disabled={readOnly}
                  value={metadata.rule_fields?.limitations || ''}
                  onChange={(e) => handleFieldChange('rule_fields', 'limitations', e.target.value)}
                  placeholder="What restricts this power? What is the sacrifice?"
                  className="w-full px-3 py-1.5 rounded-lg bg-background border border-border/80 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-muted-foreground font-medium mb-1">Exceptions & Rare Variants</label>
                <input
                  type="text"
                  disabled={readOnly}
                  value={metadata.rule_fields?.exceptions || ''}
                  onChange={(e) => handleFieldChange('rule_fields', 'exceptions', e.target.value)}
                  placeholder="Known anomalies or legendary rule-breakers"
                  className="w-full px-3 py-1.5 rounded-lg bg-background border border-border/80 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-muted-foreground font-medium mb-1">Consequences & Backlash</label>
                <input
                  type="text"
                  disabled={readOnly}
                  value={metadata.rule_fields?.consequences || ''}
                  onChange={(e) => handleFieldChange('rule_fields', 'consequences', e.target.value)}
                  placeholder="What happens when pushed past the safe threshold?"
                  className="w-full px-3 py-1.5 rounded-lg bg-background border border-border/80 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
