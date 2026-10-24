import React, { useState } from 'react';
import { Modal } from '@/components/common/Modal';
import {
  Globe,
  AlertCircle,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import type { HouseRecord, UniverseMoveResult } from '@/types';
import type { Universe } from '@/utils/thought';
import { getHouseColorTheme, getHouseIconComponent } from '@/utils/house';
import { useToast } from '@/components/common/Toast';
import { cn } from '@/utils/cn';

export interface MoveUniverseModalProps {
  isOpen: boolean;
  onClose: () => void;
  universe: Universe | null;
  ownedDocumentCount: number;
  houses: HouseRecord[];
  onCoordinateMove: (universeId: string, targetHouseId: string) => Promise<UniverseMoveResult>;
  onSwitchHouse?: (houseId: string) => Promise<void>;
}

export const MoveUniverseModal: React.FC<MoveUniverseModalProps> = ({
  isOpen,
  onClose,
  universe,
  ownedDocumentCount,
  houses,
  onCoordinateMove,
  onSwitchHouse,
}) => {
  const { success, error } = useToast();
  const [selectedTargetHouseId, setSelectedTargetHouseId] = useState<string>('');
  const [isMoving, setIsMoving] = useState(false);
  const [moveError, setMoveError] = useState('');

  if (!isOpen || !universe) return null;

  // Determine current owning house
  const sourceHouse = houses.find(h => h.universe_ids.includes(universe.id))
    ?? houses.find(h => h.id === 'house-default');
  const sourceHouseId = sourceHouse?.id || 'house-default';

  const activeHouses = houses.filter(h => !h.archived);

  // Check destination eligibility
  const getEligibility = (house: HouseRecord): { eligible: boolean; reason?: string } => {
    if (house.id === sourceHouseId) {
      return { eligible: false, reason: 'Current owning House' };
    }
    if (!house.enabled_studios.includes('lorebook')) {
      return { eligible: false, reason: 'Lorebook Studio is not enabled in this House' };
    }
    return { eligible: true };
  };

  const handleMove = async () => {
    if (!selectedTargetHouseId || isMoving) return;
    const targetHouse = houses.find(h => h.id === selectedTargetHouseId);
    if (!targetHouse) return;

    setIsMoving(true);
    setMoveError('');

    try {
      const result = await onCoordinateMove(universe.id, selectedTargetHouseId);

      success(
        'Universe Moved',
        `Successfully moved Universe "${universe.name}" and ${result.document_count} entities to ${targetHouse.name}.`
      );
      onClose();

      // Offer to switch to destination House
      if (
        onSwitchHouse &&
        window.confirm(
          `Universe "${universe.name}" now belongs to "${targetHouse.name}". Switch to "${targetHouse.name}" workspace now?`
        )
      ) {
        await onSwitchHouse(targetHouse.id);
      }
    } catch (err: any) {
      const msg = err?.message || String(err);
      setMoveError(msg);
      error('Universe Move Failed', msg);
    } finally {
      setIsMoving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={isMoving ? () => {} : onClose}
      title="Move Lorebook Universe to House"
      description={`Transfer "${universe.name}" and all associated entity documents to another House.`}
      maxWidth="max-w-xl"
    >
      <div className="space-y-4">
        {/* UNIVERSE SUMMARY */}
        <div className="p-4 rounded-xl border border-border/80 bg-muted/20 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Globe className="w-5 h-5 text-primary" />
              <span className="font-serif font-bold text-base text-foreground">
                {universe.name}
              </span>
            </div>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground">
              {ownedDocumentCount} Owned {ownedDocumentCount === 1 ? 'Document' : 'Documents'}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            Current Owner: <strong className="text-foreground">{sourceHouse?.name || sourceHouseId}</strong>
          </div>
          <p className="text-[11.5px] text-muted-foreground leading-relaxed pt-1 border-t border-border/50">
            Moving this Universe atomically reassigns ownership of the Universe and all {ownedDocumentCount} entity documents to the destination House. Document paths, IDs, relationships, and history are preserved without breaking references.
          </p>
        </div>

        {moveError && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{moveError}</span>
          </div>
        )}

        {/* DESTINATION SELECTION */}
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

        {/* FOOTER */}
        <div className="flex items-center justify-between pt-3 border-t border-border/70">
          <span className="text-[11px] text-muted-foreground">
            {isMoving ? 'Executing multi-document operation journal...' : 'Changes will be transactionally journaled.'}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isMoving}
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted/40"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!selectedTargetHouseId || isMoving}
              onClick={handleMove}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-gold-hover transition-colors shadow-xs disabled:opacity-50"
            >
              {isMoving && <Clock className="w-3.5 h-3.5 animate-spin" />}
              <span>{isMoving ? 'Moving Universe...' : 'Move Universe'}</span>
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
