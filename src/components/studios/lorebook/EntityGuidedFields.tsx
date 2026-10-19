import React, { useState } from 'react';
import type { LorebookMetadata } from '@/types';
import { ChevronDown, ChevronRight, Sliders } from 'lucide-react';

interface EntityGuidedFieldsProps {
  metadata: LorebookMetadata;
  onChange: (patch: Partial<LorebookMetadata>) => void;
  readOnly?: boolean;
}

export const EntityGuidedFields: React.FC<EntityGuidedFieldsProps> = ({
  metadata,
  onChange,
  readOnly = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const entryType = metadata.entry_type;

  // Only render guided fields for character, location, faction, concept/rule
  if (!['character', 'location', 'faction', 'concept', 'rule'].includes(entryType)) {
    return null;
  }

  const handleFieldChange = (section: keyof LorebookMetadata, key: string, value: string) => {
    const currentSection = (metadata[section] as Record<string, string>) || {};
    onChange({
      [section]: {
        ...currentSection,
        [key]: value,
      },
    });
  };

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
          </span>
          <span className="text-xs text-muted-foreground font-sans">(Optional Guided Attributes)</span>
        </div>
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {isExpanded && (
        <div className="p-4 space-y-4 border-t border-border/60 text-xs">
          {/* CHARACTER FIELDS */}
          {entryType === 'character' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-muted-foreground font-medium mb-1">Role / Archetype</label>
                <input
                  type="text"
                  disabled={readOnly}
                  value={metadata.character_fields?.role || ''}
                  onChange={(e) => handleFieldChange('character_fields', 'role', e.target.value)}
                  placeholder="e.g. Reluctant Regent, High Mage, Wandering Scholar"
                  className="w-full px-3 py-1.5 rounded-lg bg-background border border-border/80 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-muted-foreground font-medium mb-1">Species / Race</label>
                <input
                  type="text"
                  disabled={readOnly}
                  value={metadata.character_fields?.species || ''}
                  onChange={(e) => handleFieldChange('character_fields', 'species', e.target.value)}
                  placeholder="e.g. Human, Moon Elf, Synthet"
                  className="w-full px-3 py-1.5 rounded-lg bg-background border border-border/80 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-muted-foreground font-medium mb-1">Affiliation / Order</label>
                <input
                  type="text"
                  disabled={readOnly}
                  value={metadata.character_fields?.affiliation || ''}
                  onChange={(e) => handleFieldChange('character_fields', 'affiliation', e.target.value)}
                  placeholder="e.g. Ashen Order, Crown Council"
                  className="w-full px-3 py-1.5 rounded-lg bg-background border border-border/80 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-muted-foreground font-medium mb-1">Primary Goals</label>
                <input
                  type="text"
                  disabled={readOnly}
                  value={metadata.character_fields?.goals || ''}
                  onChange={(e) => handleFieldChange('character_fields', 'goals', e.target.value)}
                  placeholder="e.g. Restore the broken ward, avenge house"
                  className="w-full px-3 py-1.5 rounded-lg bg-background border border-border/80 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-muted-foreground font-medium mb-1">Motivations & Passions</label>
                <input
                  type="text"
                  disabled={readOnly}
                  value={metadata.character_fields?.motivations || ''}
                  onChange={(e) => handleFieldChange('character_fields', 'motivations', e.target.value)}
                  placeholder="What drives this character when tested?"
                  className="w-full px-3 py-1.5 rounded-lg bg-background border border-border/80 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-muted-foreground font-medium mb-1">Strengths</label>
                <input
                  type="text"
                  disabled={readOnly}
                  value={metadata.character_fields?.strengths || ''}
                  onChange={(e) => handleFieldChange('character_fields', 'strengths', e.target.value)}
                  placeholder="e.g. Tactical brilliance, incorruptible will"
                  className="w-full px-3 py-1.5 rounded-lg bg-background border border-border/80 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-muted-foreground font-medium mb-1">Weaknesses / Flaws</label>
                <input
                  type="text"
                  disabled={readOnly}
                  value={metadata.character_fields?.weaknesses || ''}
                  onChange={(e) => handleFieldChange('character_fields', 'weaknesses', e.target.value)}
                  placeholder="e.g. Unforgiving pride, sworn vow"
                  className="w-full px-3 py-1.5 rounded-lg bg-background border border-border/80 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
          )}

          {/* LOCATION FIELDS */}
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

          {/* FACTION FIELDS */}
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
            </div>
          )}

          {/* RULES / SYSTEMS FIELDS */}
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
