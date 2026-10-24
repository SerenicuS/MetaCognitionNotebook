import React, { useState } from 'react';
import { Modal } from '@/components/common/Modal';
import {
  AlertCircle,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import type { DocumentDetail, DocumentMetadata, HouseRecord } from '@/types';
import { getHouseColorTheme, getHouseIconComponent } from '@/utils/house';
import { useToast } from '@/components/common/Toast';
import { cn } from '@/utils/cn';

export interface MoveDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: DocumentDetail | DocumentMetadata | null;
  houses: HouseRecord[];
  onCoordinateMove: (docId: string, targetHouseId: string) => Promise<DocumentMetadata>;
  onSwitchHouse?: (houseId: string) => Promise<void>;
}

export const MoveDocumentModal: React.FC<MoveDocumentModalProps> = ({
  isOpen,
  onClose,
  document,
  houses,
  onCoordinateMove,
  onSwitchHouse,
}) => {
  const { success, error } = useToast();
  const [selectedTargetHouseId, setSelectedTargetHouseId] = useState<string>('');
  const [isMoving, setIsMoving] = useState(false);
  const [moveError, setMoveError] = useState('');

  if (!isOpen || !document) return null;

  const docMeta = 'metadata' in document ? document.metadata : document;
  const currentHouseId = docMeta.house_id || 'house-default';
  const currentHouse = houses.find(h => h.id === currentHouseId);

  // Check if this document is a Universe-bound Lorebook entity
  let isBoundLorebookEntity = false;
  let universeName = '';
  if (docMeta.doc_type === 'lorebook' && docMeta.metadata_json) {
    try {
      const parsed = JSON.parse(docMeta.metadata_json);
      if (parsed.universe_id || parsed.universe) {
        isBoundLorebookEntity = true;
        universeName = parsed.universe || parsed.universe_id || 'Universe';
      }
    } catch {}
  }

  // Active houses
  const activeHouses = houses.filter(h => !h.archived);

  // Destination eligibility helper
  const getEligibility = (house: HouseRecord): { eligible: boolean; reason?: string } => {
    if (house.id === currentHouseId) {
      return { eligible: false, reason: 'Current owning House' };
    }
    if (docMeta.doc_type === 'manuscript') {
      if (!house.manuscript_tools_enabled) {
        return { eligible: false, reason: 'Manuscript Tools are not enabled in this House' };
      }
    } else if (
      docMeta.doc_type === 'poetry' ||
      docMeta.doc_type === 'philosophy' ||
      docMeta.doc_type === 'lorebook'
    ) {
      if (!house.enabled_studios.includes(docMeta.doc_type)) {
        const studioName = docMeta.doc_type.charAt(0).toUpperCase() + docMeta.doc_type.slice(1);
        return { eligible: false, reason: `${studioName} Studio is not enabled in this House` };
      }
    }
    return { eligible: true };
  };

  const handleMove = async () => {
    if (!selectedTargetHouseId) return;
    const targetHouse = houses.find(h => h.id === selectedTargetHouseId);
    if (!targetHouse) return;

    setIsMoving(true);
    setMoveError('');

    try {
      await onCoordinateMove(docMeta.id, selectedTargetHouseId);

      success('Document Moved', `Moved "${docMeta.title}" to ${targetHouse.name}.`);
      onClose();

      // Offer or prompt switching house
      if (onSwitchHouse && window.confirm(`"${docMeta.title}" is now in "${targetHouse.name}". Switch to "${targetHouse.name}" workspace now?`)) {
        await onSwitchHouse(targetHouse.id);
      }
    } catch (err: any) {
      const msg = err?.message || String(err);
      setMoveError(msg);
      error('Move Failed', msg);
    } finally {
      setIsMoving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Move Document to House"
      description={`Transfer "${docMeta.title}" to another House workspace while preserving content and links.`}
      maxWidth="max-w-xl"
    >
      <div className="space-y-4">
        {/* DOCUMENT SUMMARY */}
        <div className="p-3.5 rounded-xl border border-border/80 bg-muted/20 flex items-center justify-between text-xs">
          <div>
            <span className="font-semibold text-foreground text-sm font-serif block">
              {docMeta.title}
            </span>
            <div className="flex items-center gap-2 mt-0.5 text-muted-foreground">
              <span className="uppercase font-mono text-[10.5px] px-1.5 py-0.2 rounded bg-muted">
                {docMeta.doc_type}
              </span>
              <span>•</span>
              <span>Current House: <strong className="text-foreground">{currentHouse?.name || currentHouseId}</strong></span>
            </div>
          </div>
        </div>

        {/* UNIVERSE ENTITY GUARDRAIL */}
        {isBoundLorebookEntity ? (
          <div className="p-4 rounded-xl border border-amber-500/40 bg-amber-500/10 space-y-2">
            <div className="flex items-start gap-2.5">
              <Lock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-amber-300">
                  Lorebook Entity Belongs to "{universeName}"
                </h4>
                <p className="text-xs text-amber-200/90 mt-1 leading-relaxed">
                  Lorebook entities are bound to their Universe canon and cannot be moved individually across Houses.
                  To transfer this entity to another House, move the entire <strong>{universeName}</strong> Universe in the Universe Dashboard.
                </p>
              </div>
            </div>
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 text-xs font-semibold"
              >
                Understood
              </button>
            </div>
          </div>
        ) : (
          <>
            {moveError && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{moveError}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-foreground mb-2">
                Select Destination House:
              </label>

              <div className="space-y-2 max-h-56 overflow-y-auto p-1">
                {activeHouses.map(house => {
                  const theme = getHouseColorTheme(house.color);
                  const IconComp = getHouseIconComponent(house.icon);
                  const { eligible, reason } = getEligibility(house);
                  const isSelected = selectedTargetHouseId === house.id;

                  return (
                    <button
                      key={house.id}
                      type="button"
                      disabled={!eligible || isMoving}
                      onClick={() => setSelectedTargetHouseId(house.id)}
                      className={cn(
                        'w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all',
                        isSelected
                          ? 'bg-primary/15 border-primary text-foreground shadow-xs'
                          : eligible
                          ? 'bg-card/50 border-border/70 hover:bg-accent/40 text-foreground/90 cursor-pointer'
                          : 'bg-muted/10 border-border/40 text-muted-foreground/60 cursor-not-allowed opacity-60'
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={cn(
                            'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border',
                            theme.bg,
                            theme.border,
                            theme.text
                          )}
                        >
                          <IconComp className="w-4 h-4" />
                        </div>

                        <div className="min-w-0">
                          <span className="text-sm font-serif font-semibold truncate block">
                            {house.name}
                          </span>
                          {!eligible && reason && (
                            <span className="text-[11px] text-rose-400 block mt-0.5">
                              {reason}
                            </span>
                          )}
                        </div>
                      </div>

                      {isSelected && (
                        <CheckCircle2 className="w-5 h-5 text-primary shrink-0 ml-2" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-border/70">
              <span className="text-[11px] text-muted-foreground">
                Canonical path and links will remain preserved.
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isMoving}
                  className="px-4 py-2 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted/40"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!selectedTargetHouseId || isMoving}
                  onClick={handleMove}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-gold-hover transition-colors shadow-xs disabled:opacity-50"
                >
                  {isMoving ? 'Moving...' : 'Move Document'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};
