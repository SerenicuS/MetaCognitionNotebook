import { VaultPanel } from './VaultPanel';
import type { RunVault } from '@/services/vault';
import React, { useState } from 'react';
import { Modal } from './Modal';
import { LibraryInfo, ReindexReport, SavePreferences } from '@/types';
import { api } from '@/services/api';
import { useToast } from './Toast';
import { RefreshCw, Moon, Sun, Monitor, Database, FolderCheck, LogOut, Save, Sliders } from 'lucide-react';
import { cn } from '@/utils/cn';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  libraryInfo: LibraryInfo | null;
  onReindexed: () => void;
  theme: 'dark' | 'light' | 'system';
  onThemeChange: (theme: 'dark' | 'light' | 'system') => void;
  savePreferences: SavePreferences;
  onSavePreferencesChange: (prefs: SavePreferences) => void;
  onExit?: () => void;
  runVault: RunVault;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  libraryInfo,
  onReindexed,
  theme,
  onThemeChange,
  savePreferences,
  onSavePreferencesChange,
  onExit,
  runVault,
}) => {
  const { success, error } = useToast();
  const [isReindexing, setIsReindexing] = useState(false);
  const [reindexResult, setReindexResult] = useState<ReindexReport | null>(null);

  const handleReindex = async () => {
    setIsReindexing(true);
    try {
      const report = await api.reindexLibrary();
      setReindexResult(report);
      success('Library Reindexed', `Scanned ${report.total_files_scanned} files, synced ${report.documents_indexed} documents.`);
      onReindexed();
    } catch (err) {
      error('Reindexing Failed', String(err));
    } finally {
      setIsReindexing(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Settings & Workspace Health"
      description="Configure workspace appearance, view storage locations, and manage library indices."
      maxWidth="max-w-2xl"
    >
      <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-1">
        {/* Appearance Section */}
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-3">
            Interface Theme
          </label>
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => onThemeChange('dark')}
              className={cn(
                'flex items-center justify-center gap-2.5 p-3.5 rounded-xl border text-[13.5px] font-medium transition-all',
                theme === 'dark'
                  ? 'bg-accent border-primary text-primary font-semibold shadow-sm'
                  : 'bg-card border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              )}
            >
              <Moon className="w-4 h-4" />
              Charcoal & Gold (Dark)
            </button>
            <button
              onClick={() => onThemeChange('light')}
              className={cn(
                'flex items-center justify-center gap-2.5 p-3.5 rounded-xl border text-[13.5px] font-medium transition-all',
                theme === 'light'
                  ? 'bg-accent border-primary text-primary font-semibold shadow-sm'
                  : 'bg-card border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              )}
            >
              <Sun className="w-4 h-4" />
              Warm Ivory (Light)
            </button>
            <button
              onClick={() => onThemeChange('system')}
              className={cn(
                'flex items-center justify-center gap-2.5 p-3.5 rounded-xl border text-[13.5px] font-medium transition-all',
                theme === 'system'
                  ? 'bg-accent border-primary text-primary font-semibold shadow-sm'
                  : 'bg-card border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              )}
            >
              <Monitor className="w-4 h-4" />
              System Match
            </button>
          </div>
        </div>

        {/* Saving & Autosave Preferences */}
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-3">
            Saving & Autosave Preferences
          </label>
          <div className="space-y-3">
            {/* Mode selection */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => onSavePreferencesChange({ ...savePreferences, mode: 'automatic' })}
                className={cn(
                  'flex items-start gap-2.5 p-3.5 rounded-xl border text-left transition-all',
                  savePreferences.mode === 'automatic'
                    ? 'bg-accent border-primary text-primary shadow-sm'
                    : 'bg-card border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                )}
              >
                <Save className="w-4 h-4 mt-0.5 shrink-0" />
                <div>
                  <div className="text-[13.5px] font-semibold">Automatic Autosave</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Saves prose after typing inactivity. Default & recommended.
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => onSavePreferencesChange({ ...savePreferences, mode: 'manual' })}
                className={cn(
                  'flex items-start gap-2.5 p-3.5 rounded-xl border text-left transition-all',
                  savePreferences.mode === 'manual'
                    ? 'bg-accent border-primary text-primary shadow-sm'
                    : 'bg-card border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                )}
              >
                <Sliders className="w-4 h-4 mt-0.5 shrink-0" />
                <div>
                  <div className="text-[13.5px] font-semibold">Manual Saving</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Save via Ctrl+S or Save button. Prompts on document switch.
                  </div>
                </div>
              </button>
            </div>

            {/* Delay Slider (only in automatic mode) */}
            {savePreferences.mode === 'automatic' ? (
              <div className="p-3.5 rounded-xl bg-muted/20 border border-border/70 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-foreground">Autosave Delay</span>
                  <span className="font-mono font-semibold text-primary px-2 py-0.5 rounded bg-primary/10">
                    {savePreferences.debounceSeconds} {savePreferences.debounceSeconds === 1 ? 'second' : 'seconds'}
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="1"
                  value={savePreferences.debounceSeconds}
                  onChange={(e) =>
                    onSavePreferencesChange({
                      ...savePreferences,
                      debounceSeconds: Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 3)),
                    })
                  }
                  className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>1s (Faster)</span>
                  <span>3s (Default)</span>
                  <span>10s (Relaxed)</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Writing is saved once you pause typing for {savePreferences.debounceSeconds} seconds. Continued typing resets the timer.
                </p>
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-800/40 text-xs text-amber-200/90 leading-relaxed">
                In Manual Mode, edits remain in memory until you press <kbd className="px-1 py-0.5 rounded bg-amber-900/40 text-[11px] font-mono border border-amber-700/60">Ctrl + S</kbd> or click <strong>Save</strong>. Switching documents will prompt you with Save, Discard, or Cancel options.
              </div>
            )}

            <p className="text-[11px] text-muted-foreground/80 italic">
              Note: Universe, Book, Chapter, and relationship changes are structural and saved immediately in either mode.
            </p>
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-3">
            Managed Storage Architecture
          </label>
          <div className="space-y-2.5">
            <div className="p-3.5 rounded-xl bg-muted/30 border border-border flex items-start gap-3">
              <FolderCheck className="w-4.5 h-4.5 text-primary mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-foreground">Canonical Content Directory (Markdown)</div>
                <div className="text-xs font-mono text-muted-foreground break-all mt-0.5 select-all">
                  {libraryInfo?.library_path || 'Documents/MetaCognitionNotebook'}
                </div>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-muted/30 border border-border flex items-start gap-3">
              <Database className="w-4.5 h-4.5 text-primary mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-foreground">SQLite Rebuildable Index Database</div>
                <div className="text-xs font-mono text-muted-foreground break-all mt-0.5 select-all">
                  {libraryInfo?.db_path || 'AppData/Local/com.metacognition.notebook/metadata.db'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Document Stats & Reindexing */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Library Diagnostics
            </label>
            <button
              onClick={handleReindex}
              disabled={isReindexing}
              className="flex items-center gap-1.5 text-xs text-primary font-medium hover:text-gold-hover disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', isReindexing && 'animate-spin')} />
              {isReindexing ? 'Scanning...' : 'Reindex from Disk'}
            </button>
          </div>

          <div className="grid grid-cols-4 gap-2.5 text-center">
            <div className="p-3.5 rounded-xl bg-muted/20 border border-border/60">
              <div className="text-2xl font-serif font-semibold text-foreground">{libraryInfo?.document_count ?? 0}</div>
              <div className="text-[11px] uppercase font-medium text-muted-foreground mt-0.5">Total Docs</div>
            </div>
            <div className="p-3.5 rounded-xl bg-muted/20 border border-border/60">
              <div className="text-2xl font-serif font-semibold text-primary">{libraryInfo?.poetry_count ?? 0}</div>
              <div className="text-[11px] uppercase font-medium text-muted-foreground mt-0.5">Poems</div>
            </div>
            <div className="p-3.5 rounded-xl bg-muted/20 border border-border/60">
              <div className="text-2xl font-serif font-semibold text-primary">{libraryInfo?.philosophy_count ?? 0}</div>
              <div className="text-[11px] uppercase font-medium text-muted-foreground mt-0.5">Philosophies</div>
            </div>
            <div className="p-3.5 rounded-xl bg-muted/20 border border-border/60">
              <div className="text-2xl font-serif font-semibold text-primary">{libraryInfo?.lorebook_count ?? 0}</div>
              <div className="text-[11px] uppercase font-medium text-muted-foreground mt-0.5">Lorebooks</div>
            </div>
          </div>

          {reindexResult && (
            <div className="mt-3 p-3 rounded-lg bg-emerald-950/20 border border-emerald-800/40 text-xs text-emerald-300">
              Reindexing complete: scanned {reindexResult.total_files_scanned} files, synced {reindexResult.documents_indexed} documents.
              {reindexResult.errors.length > 0 && (
                <div className="mt-1 text-rose-300">Errors: {reindexResult.errors.join(', ')}</div>
              )}
            </div>
          )}
        </div>

        <VaultPanel runVault={runVault} />

        {/* Keyboard Shortcuts Reference */}
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-2">
            Keyboard Shortcuts
          </label>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/10 border border-border/40">
              <span className="text-muted-foreground text-[13px]">Universal Search</span>
              <kbd className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono text-foreground border border-border">Ctrl + K</kbd>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/10 border border-border/40">
              <span className="text-muted-foreground text-[13px]">Save Document</span>
              <kbd className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono text-foreground border border-border">Ctrl + S</kbd>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/10 border border-border/40">
              <span className="text-muted-foreground text-[13px]">New Document</span>
              <kbd className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono text-foreground border border-border">Ctrl + N</kbd>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/10 border border-border/40">
              <span className="text-muted-foreground text-[13px]">Toggle Navigator</span>
              <kbd className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono text-foreground border border-border">Click Layers</kbd>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/10 border border-border/40">
              <span className="text-muted-foreground text-[13px]">Exit Application</span>
              <kbd className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono text-foreground border border-border">Ctrl + Q</kbd>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex flex-col">
            <span>MetaCognition Notebook v0.7.0 (Desktop Edition — Development Build)</span>
            <span className="text-[11px] text-muted-foreground/60">Tauri 2 + Rust + SQLite</span>
          </div>
          {onExit && (
            <button
              onClick={onExit}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 text-xs font-medium transition-colors"
              title="Save changes and close application"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Exit Application</span>
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
};
