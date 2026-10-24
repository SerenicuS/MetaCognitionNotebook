import React, { useState, useRef, useEffect } from 'react';
import {
  ChevronDown,
  Check,
  Plus,
  Settings,
} from 'lucide-react';
import type { HouseRecord } from '@/types';
import { getHouseColorTheme, getHouseIconComponent } from '@/utils/house';
import { cn } from '@/utils/cn';

export interface HouseSwitcherProps {
  activeHouse: HouseRecord | null;
  houses: HouseRecord[];
  onSwitchHouse: (houseId: string) => Promise<void>;
  onOpenHouseManagement: (initialTab?: 'active' | 'archived' | 'integrity') => void;
  onCreateHouse: () => void;
  isCollapsed?: boolean;
}

export const HouseSwitcher: React.FC<HouseSwitcherProps> = ({
  activeHouse,
  houses,
  onSwitchHouse,
  onOpenHouseManagement,
  onCreateHouse,
  isCollapsed = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Filter out archived houses from ordinary selection
  const activeHouses = houses.filter(h => !h.archived);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Keyboard navigation (Escape to close)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const activeColor = getHouseColorTheme(activeHouse?.color);
  const ActiveIcon = getHouseIconComponent(activeHouse?.icon);

  return (
    <div ref={containerRef} className="relative select-none px-3 py-2 border-b border-border/80">
      {/* TRIGGER BUTTON */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`Current House: ${activeHouse?.name || 'Primary House'}. Click to switch House.`}
        className={cn(
          'w-full flex items-center gap-2.5 p-2 rounded-xl border transition-all text-left group',
          isOpen
            ? 'bg-accent/90 border-primary/50 shadow-sm ring-1 ring-primary/30'
            : 'bg-card/70 border-border/60 hover:bg-accent/40 hover:border-border'
        )}
        title={isCollapsed ? `House: ${activeHouse?.name || 'Primary House'}` : undefined}
      >
        <div
          className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border transition-all',
            activeColor.bg,
            activeColor.border,
            activeColor.text
          )}
        >
          <ActiveIcon className="w-4 h-4" />
        </div>

        {!isCollapsed && (
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground/70 font-mono flex items-center gap-1">
              <span>House of Thoughts</span>
            </div>
            <div className="text-sm font-serif font-bold text-foreground truncate tracking-wide group-hover:text-gold-rich transition-colors">
              {activeHouse?.name || 'Primary House'}
            </div>
          </div>
        )}

        {!isCollapsed && (
          <ChevronDown
            className={cn(
              'w-4 h-4 text-muted-foreground/70 transition-transform duration-200 shrink-0 group-hover:text-foreground',
              isOpen && 'rotate-180 text-primary'
            )}
          />
        )}
      </button>

      {/* DROPDOWN MENU */}
      {isOpen && (
        <div
          role="listbox"
          aria-label="Select House"
          className={cn(
            'absolute z-50 mt-1.5 w-72 rounded-2xl bg-card/95 backdrop-blur-md border border-border/90 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150',
            isCollapsed ? 'left-full ml-2 top-0' : 'left-3 right-3'
          )}
        >
          {/* Header */}
          <div className="px-3.5 py-2.5 border-b border-border/70 bg-muted/20 flex items-center justify-between">
            <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-muted-foreground">
              Select House
            </span>
            <span className="text-[10px] text-muted-foreground/80 font-mono">
              {activeHouses.length} Active {activeHouses.length === 1 ? 'House' : 'Houses'}
            </span>
          </div>

          {/* List of Houses */}
          <div className="max-h-60 overflow-y-auto p-1.5 space-y-1">
            {activeHouses.map((house) => {
              const isSelected = house.id === activeHouse?.id;
              const theme = getHouseColorTheme(house.color);
              const IconComp = getHouseIconComponent(house.icon);

              return (
                <button
                  key={house.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={async () => {
                    setIsOpen(false);
                    if (!isSelected) {
                      await onSwitchHouse(house.id);
                    }
                  }}
                  className={cn(
                    'w-full flex items-center gap-2.5 p-2 rounded-xl text-left transition-all border',
                    isSelected
                      ? 'bg-primary/10 border-primary/40 text-foreground font-semibold shadow-xs'
                      : 'border-transparent hover:bg-accent/50 text-foreground/85'
                  )}
                >
                  <div
                    className={cn(
                      'w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border',
                      theme.bg,
                      theme.border,
                      theme.text
                    )}
                  >
                    <IconComp className="w-3.5 h-3.5" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-serif font-semibold truncate tracking-wide">
                        {house.name}
                      </span>
                      {house.id === 'house-default' && (
                        <span className="text-[9.5px] uppercase font-mono px-1 py-0.2 rounded bg-muted/80 text-muted-foreground shrink-0">
                          Primary
                        </span>
                      )}
                    </div>
                    {house.description && (
                      <p className="text-[11px] text-muted-foreground truncate leading-tight mt-0.5">
                        {house.description}
                      </p>
                    )}
                  </div>

                  {isSelected && (
                    <Check className="w-4 h-4 text-primary shrink-0 ml-1" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Footer Actions */}
          <div className="p-1.5 border-t border-border/70 bg-muted/10 space-y-0.5">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onCreateHouse();
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create New House</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onOpenHouseManagement('active');
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Manage Houses...</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
