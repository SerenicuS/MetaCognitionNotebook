import React, { useEffect, useRef, useState } from 'react';
import type { EchoEntity, EchoCategory } from './types';
import {
  User,
  MapPin,
  Shield,
  Sparkles,
  Sword,
  Calendar,
  Compass,
  X,
  ExternalLink,
  Briefcase,
  Layers,
  Tag,
} from 'lucide-react';
import { cn } from '@/utils/cn';

interface EchoDocumentationPopupProps {
  entity: EchoEntity;
  position: { top: number; left: number };
  onClose: () => void;
  onNavigateEntity?: (entityName: string) => void;
  onOpenDocument?: (docId: string) => void;
}

const CATEGORY_CONFIG: Record<
  EchoCategory,
  { label: string; icon: React.FC<{ className?: string }>; color: string; bg: string }
> = {
  character: { label: 'Character', icon: User, color: 'text-sky-400', bg: 'bg-sky-500/10 border-sky-500/30' },
  location: { label: 'Location', icon: MapPin, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' },
  faction: { label: 'Faction', icon: Shield, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30' },
  rule: { label: 'Rule / System', icon: Sparkles, color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/30' },
  artifact: { label: 'Artifact', icon: Sword, color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/30' },
  event: { label: 'Event', icon: Calendar, color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/30' },
  other: { label: 'Lore', icon: Compass, color: 'text-gray-400', bg: 'bg-gray-500/10 border-gray-500/30' },
};

export const EchoDocumentationPopup: React.FC<EchoDocumentationPopupProps> = ({
  entity,
  position,
  onClose,
  onNavigateEntity,
  onOpenDocument,
}) => {
  const popupRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'attributes' | 'relationships' | 'organization'>('overview');

  // Dismiss on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Click outside to dismiss
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const cat = CATEGORY_CONFIG[entity.category] || CATEGORY_CONFIG.other;
  const CatIcon = cat.icon;

  // Viewport clamping for position
  const safeLeft = Math.min(Math.max(16, position.left - 160), window.innerWidth - 440);
  const safeTop = Math.min(position.top + 24, window.innerHeight - 440);

  const hasHeldOffices = !!(entity.heldOffices && entity.heldOffices.length > 0);
  const hasFactionStructure = !!(entity.factionStructure && entity.factionStructure.positions.length > 0);
  const hasOrganization = hasHeldOffices || hasFactionStructure;

  const totalAttributeCount =
    Object.keys(entity.guidedAttributes).length + entity.customAttributes.length;

  return (
    <div
      ref={popupRef}
      role="dialog"
      aria-label={`Echo Lore Documentation: ${entity.name}`}
      className="fixed z-50 w-96 rounded-xl border border-primary/40 bg-card/95 p-4 shadow-2xl backdrop-blur-md select-none text-foreground font-sans animate-in fade-in zoom-in-95 duration-150"
      style={{ top: `${safeTop}px`, left: `${safeLeft}px` }}
    >
      {/* Header */}
      <div className="flex items-start justify-between pb-3 border-b border-border/70">
        <div className="min-w-0 pr-2">
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            <span
              className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold border',
                cat.bg,
                cat.color
              )}
            >
              <CatIcon className="w-3 h-3" />
              <span>{cat.label}</span>
            </span>
            <span className="text-[11px] text-muted-foreground font-serif">
              {entity.universe}
            </span>
            {entity.status === 'archived' && (
              <span className="text-[10px] uppercase font-bold px-1.5 py-0.2 rounded bg-rose-950/40 text-rose-400 border border-rose-800/50">
                Archived
              </span>
            )}
          </div>
          <h3 className="text-xl font-serif font-bold tracking-wide text-foreground truncate">
            {entity.name}
          </h3>

          {/* Aliases pill (Phase C1) */}
          {entity.aliases && entity.aliases.length > 0 && (
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground pt-0.5">
              <Tag className="w-2.5 h-2.5 text-amber-400 shrink-0" />
              <span className="truncate italic">
                Aliases: {entity.aliases.join(', ')}
              </span>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close Documentation"
          className="text-muted-foreground hover:text-foreground p-1 rounded-md transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 pt-2.5 pb-2 text-xs border-b border-border/40 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={cn(
            'px-2.5 py-1 rounded-md font-medium transition-colors',
            activeTab === 'overview'
              ? 'bg-primary/20 text-primary font-semibold'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Overview
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('attributes')}
          className={cn(
            'px-2.5 py-1 rounded-md font-medium transition-colors flex items-center gap-1',
            activeTab === 'attributes'
              ? 'bg-primary/20 text-primary font-semibold'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <span>Attributes</span>
          <span className="text-[10px] opacity-70">({totalAttributeCount})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('relationships')}
          className={cn(
            'px-2.5 py-1 rounded-md font-medium transition-colors flex items-center gap-1',
            activeTab === 'relationships'
              ? 'bg-primary/20 text-primary font-semibold'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <span>Relationships</span>
          <span className="text-[10px] opacity-70">({entity.relationships.length})</span>
        </button>
        {hasOrganization && (
          <button
            type="button"
            onClick={() => setActiveTab('organization')}
            className={cn(
              'px-2.5 py-1 rounded-md font-medium transition-colors flex items-center gap-1',
              activeTab === 'organization'
                ? 'bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Briefcase className="w-3 h-3 text-amber-400" />
            <span>Offices</span>
          </button>
        )}
      </div>

      {/* Tab Content */}
      <div className="py-3 text-xs leading-relaxed max-h-60 overflow-y-auto pr-1">
        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div className="space-y-3">
            <p className="text-muted-foreground text-xs font-sans leading-normal">
              {entity.description || 'No canonical description recorded in Web of Thought.'}
            </p>

            {/* Quick character profile facts (Phase C1) */}
            {entity.characterProfile && (
              <div className="p-2.5 rounded-lg bg-muted/20 border border-border/50 space-y-1.5">
                <div className="font-semibold text-foreground text-[11px] flex items-center gap-1 text-primary">
                  <User className="w-3 h-3" />
                  <span>Character Profile Summary</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                  {entity.characterProfile.age && (
                    <div><span className="text-muted-foreground">Age:</span> {entity.characterProfile.age}</div>
                  )}
                  {entity.characterProfile.species && (
                    <div><span className="text-muted-foreground">Species:</span> {entity.characterProfile.species}</div>
                  )}
                  {entity.characterProfile.gender && (
                    <div><span className="text-muted-foreground">Gender:</span> {entity.characterProfile.gender}</div>
                  )}
                  {entity.characterProfile.vitalStatus && (
                    <div><span className="text-muted-foreground">Status:</span> {entity.characterProfile.vitalStatus}</div>
                  )}
                  {entity.characterProfile.occupation && (
                    <div className="col-span-2"><span className="text-muted-foreground">Occupation:</span> {entity.characterProfile.occupation}</div>
                  )}
                  {entity.characterProfile.narrativeRole && (
                    <div className="col-span-2"><span className="text-muted-foreground">Role:</span> {entity.characterProfile.narrativeRole}</div>
                  )}
                </div>
              </div>
            )}

            {/* Quick guided fact pills */}
            {Object.keys(entity.guidedAttributes).length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {Object.entries(entity.guidedAttributes).map(([k, v]) => (
                  <span
                    key={k}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-muted/40 border border-border/60 text-[11px]"
                  >
                    <span className="text-muted-foreground">{k}:</span>
                    <span className="font-medium text-foreground">{v}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ATTRIBUTES TAB */}
        {activeTab === 'attributes' && (
          <div className="space-y-2">
            {/* Guided attributes */}
            {Object.entries(entity.guidedAttributes).map(([k, v]) => (
              <div
                key={k}
                className="flex items-center justify-between p-1.5 rounded bg-muted/20 border border-border/40 text-xs"
              >
                <span className="text-muted-foreground font-medium">{k}</span>
                <span className="text-foreground font-semibold text-right">{v}</span>
              </div>
            ))}

            {/* Detailed appearance / attire / personality if character */}
            {entity.characterProfile?.physicalAppearance && (
              <div className="p-2 rounded bg-muted/20 border border-border/40 text-xs space-y-0.5">
                <span className="text-muted-foreground font-medium block">Physical Appearance:</span>
                <span className="text-foreground">{entity.characterProfile.physicalAppearance}</span>
              </div>
            )}
            {entity.characterProfile?.clothingAttire && (
              <div className="p-2 rounded bg-muted/20 border border-border/40 text-xs space-y-0.5">
                <span className="text-muted-foreground font-medium block">Signature Clothing:</span>
                <span className="text-foreground">{entity.characterProfile.clothingAttire}</span>
              </div>
            )}
            {entity.characterProfile?.personality && (
              <div className="p-2 rounded bg-muted/20 border border-border/40 text-xs space-y-0.5">
                <span className="text-muted-foreground font-medium block">Personality:</span>
                <span className="text-foreground">{entity.characterProfile.personality}</span>
              </div>
            )}

            {/* Custom attributes */}
            {entity.customAttributes.map((attr) => (
              <div
                key={attr.id}
                className="flex items-center justify-between p-1.5 rounded bg-muted/20 border border-border/40 text-xs"
              >
                <span className="text-muted-foreground">{attr.key}</span>
                <span className="text-foreground">{attr.value}</span>
              </div>
            ))}

            {totalAttributeCount === 0 && (
              <div className="text-muted-foreground italic text-center py-4">
                No attributes recorded for this entity.
              </div>
            )}
          </div>
        )}

        {/* RELATIONSHIPS TAB */}
        {activeTab === 'relationships' && (
          <div className="space-y-2">
            {entity.relationships.map((rel, idx) => (
              <div
                key={`${rel.targetId}-${idx}`}
                className="p-2 rounded-lg bg-muted/20 border border-border/50 flex flex-col gap-1"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-semibold text-primary uppercase tracking-wider">
                      {rel.relationType}
                    </span>
                    {rel.categoryKind && (
                      <span className="text-[9px] uppercase px-1 py-0.2 rounded bg-muted text-muted-foreground border border-border/40">
                        {rel.categoryKind}
                      </span>
                    )}
                  </div>

                  {onNavigateEntity ? (
                    <button
                      type="button"
                      onClick={() => onNavigateEntity(rel.targetName)}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-400 hover:underline"
                    >
                      <span>{rel.targetName}</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </button>
                  ) : (
                    <span className="text-[11px] font-medium text-foreground">
                      {rel.targetName}
                    </span>
                  )}
                </div>
                {rel.description && (
                  <p className="text-[11px] text-muted-foreground italic">
                    {rel.description}
                  </p>
                )}
              </div>
            ))}

            {entity.relationships.length === 0 && (
              <div className="text-muted-foreground italic text-center py-4">
                No active relationships connected to this entity.
              </div>
            )}
          </div>
        )}

        {/* ORGANIZATION TAB (Phase C2 Offices & Hierarchy) */}
        {activeTab === 'organization' && (
          <div className="space-y-2.5">
            {/* Character held offices */}
            {hasHeldOffices && (
              <div className="space-y-1.5">
                <div className="font-semibold text-foreground text-[11px] flex items-center gap-1 text-amber-300">
                  <Briefcase className="w-3 h-3 text-amber-400" />
                  <span>Official Positions Held</span>
                </div>
                {entity.heldOffices!.map((office, i) => (
                  <div
                    key={`${office.factionId}-${i}`}
                    className="p-2 rounded bg-amber-950/20 border border-amber-500/30 text-xs space-y-0.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground">{office.positionTitle}</span>
                      <span className="text-[11px] text-amber-300">{office.factionTitle}</span>
                    </div>
                    {office.branchName && (
                      <div className="text-[10px] text-muted-foreground">Branch: {office.branchName}</div>
                    )}
                    {office.description && (
                      <div className="text-[10px] text-muted-foreground italic">{office.description}</div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Faction organization structure */}
            {hasFactionStructure && (
              <div className="space-y-1.5">
                <div className="font-semibold text-foreground text-[11px] flex items-center gap-1 text-amber-300">
                  <Layers className="w-3 h-3 text-amber-400" />
                  <span>Faction Offices &amp; Roster</span>
                </div>
                {entity.factionStructure!.positions.map((pos) => (
                  <div
                    key={pos.id}
                    className="p-2 rounded bg-muted/20 border border-border/40 text-xs space-y-0.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground">{pos.title}</span>
                      {pos.isVacant ? (
                        <span className="text-[10px] px-1 py-0.2 rounded bg-rose-950/30 text-rose-300 border border-rose-600/30">
                          Vacant
                        </span>
                      ) : (
                        <span className="text-[11px] text-amber-300">{pos.holders.join(', ')}</span>
                      )}
                    </div>
                    {pos.branchName && (
                      <div className="text-[10px] text-muted-foreground">Branch: {pos.branchName}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer info & Navigation */}
      <div className="pt-2.5 border-t border-border/40 flex items-center justify-between text-[11px] text-muted-foreground">
        {onOpenDocument && entity.id ? (
          <button
            type="button"
            onClick={() => onOpenDocument(entity.id)}
            className="hover:underline text-primary flex items-center gap-1 font-medium"
          >
            <span>Open in Lorebook</span>
            <ExternalLink className="w-3 h-3" />
          </button>
        ) : (
          <span>Web of Thought Canonical Record</span>
        )}

        <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border text-[10px] font-mono">
          Esc to close
        </kbd>
      </div>
    </div>
  );
};
