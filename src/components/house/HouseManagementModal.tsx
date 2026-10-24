import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/common/Modal';
import {
  Plus,
  Edit2,
  Archive,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  Shield,
  RefreshCw,
} from 'lucide-react';
import type {
  AuthoringStudio,
  CreateHouseInput,
  HouseIntegrityReport,
  HouseRecord,
  UpdateHouseInput,
} from '@/types';
import { api } from '@/services/api';
import {
  HOUSE_COLORS,
  HOUSE_ICONS,
  getHouseColorTheme,
  getHouseIconComponent,
} from '@/utils/house';
import { useToast } from '@/components/common/Toast';
import { cn } from '@/utils/cn';

export interface HouseManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  houses: HouseRecord[];
  activeHouseId: string;
  onSwitchHouse: (houseId: string) => Promise<void>;
  onRefreshHouses: () => Promise<void>;
  initialTab?: 'active' | 'archived' | 'integrity';
}

type TabType = 'active' | 'archived' | 'integrity';

export const HouseManagementModal: React.FC<HouseManagementModalProps> = ({
  isOpen,
  onClose,
  houses,
  activeHouseId,
  onSwitchHouse,
  onRefreshHouses,
  initialTab = 'active',
}) => {
  const { success, error, info } = useToast();
  const [currentTab, setCurrentTab] = useState<TabType>(initialTab);

  // Form states: 'list' | 'create' | 'edit'
  const [formMode, setFormMode] = useState<'list' | 'create' | 'edit'>('list');
  const [editingHouseId, setEditingHouseId] = useState<string | null>(null);

  // Form fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedColor, setSelectedColor] = useState('amber');
  const [selectedIcon, setSelectedIcon] = useState('castle');
  const [enabledStudios, setEnabledStudios] = useState<AuthoringStudio[]>(['poetry', 'philosophy', 'lorebook']);
  const [manuscriptEnabled, setManuscriptEnabled] = useState(true);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Integrity scanner state
  const [integrityReport, setIntegrityReport] = useState<HouseIntegrityReport | null>(null);
  const [scanningIntegrity, setScanningIntegrity] = useState(false);
  const [recoveringMoves, setRecoveringMoves] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setCurrentTab(initialTab);
      setFormMode('list');
      setFormError('');
      if (initialTab === 'integrity') {
        void runIntegrityScan();
      }
    }
  }, [isOpen, initialTab]);

  const activeHouses = houses.filter(h => !h.archived);
  const archivedHouses = houses.filter(h => h.archived);

  const startCreate = () => {
    setName('');
    setDescription('');
    setSelectedColor('amber');
    setSelectedIcon('castle');
    setEnabledStudios(['poetry', 'philosophy', 'lorebook']);
    setManuscriptEnabled(true);
    setFormError('');
    setFormMode('create');
  };

  const startEdit = (house: HouseRecord) => {
    setEditingHouseId(house.id);
    setName(house.name);
    setDescription(house.description || '');
    setSelectedColor(house.color || 'amber');
    setSelectedIcon(house.icon || 'castle');
    setEnabledStudios(house.enabled_studios || ['poetry', 'philosophy', 'lorebook']);
    setManuscriptEnabled(house.manuscript_tools_enabled ?? true);
    setFormError('');
    setFormMode('edit');
  };

  const toggleStudio = (studio: AuthoringStudio) => {
    if (enabledStudios.includes(studio)) {
      if (enabledStudios.length === 1) {
        setFormError('At least one authoring studio must remain enabled.');
        return;
      }
      // Check if house owns active universes and trying to disable lorebook
      if (studio === 'lorebook' && formMode === 'edit' && editingHouseId) {
        const targetHouse = houses.find(h => h.id === editingHouseId);
        if (targetHouse && targetHouse.universe_ids.length > 0) {
          setFormError(`Cannot disable Lorebook Studio: this House owns ${targetHouse.universe_ids.length} active Universe(s). Move or reassign universes first.`);
          return;
        }
      }
      setFormError('');
      setEnabledStudios(enabledStudios.filter(s => s !== studio));
    } else {
      setFormError('');
      setEnabledStudios([...enabledStudios, studio]);
    }
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      setFormError('House name cannot be empty.');
      return;
    }

    if (enabledStudios.length === 0) {
      setFormError('At least one authoring studio must be enabled.');
      return;
    }

    // Check name uniqueness among other active houses
    const duplicate = activeHouses.some(
      h => h.name.trim().toLowerCase() === cleanName.toLowerCase() && h.id !== editingHouseId
    );
    if (duplicate) {
      setFormError(`An active House named "${cleanName}" already exists. Please choose a distinct name.`);
      return;
    }

    setSubmitting(true);
    setFormError('');

    try {
      if (formMode === 'create') {
        const input: CreateHouseInput = {
          name: cleanName,
          description: description.trim() || undefined,
          color: selectedColor,
          icon: selectedIcon,
          enabled_studios: enabledStudios,
          manuscript_tools_enabled: manuscriptEnabled,
        };
        const created = await api.createHouse(input);
        await onRefreshHouses();
        success('House Created', `House "${created.name}" created successfully.`);
        setFormMode('list');
      } else if (formMode === 'edit' && editingHouseId) {
        const input: UpdateHouseInput = {
          id: editingHouseId,
          name: cleanName,
          description: description.trim() || null,
          color: selectedColor,
          icon: selectedIcon,
          enabled_studios: enabledStudios,
          manuscript_tools_enabled: manuscriptEnabled,
        };
        const updated = await api.updateHouse(input);
        await onRefreshHouses();
        success('House Updated', `House "${updated.name}" updated successfully.`);
        setFormMode('list');
      }
    } catch (err: any) {
      setFormError(err?.message || String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleArchiveHouse = async (house: HouseRecord) => {
    if (house.id === 'house-default') {
      error('Cannot Archive', 'The Primary House cannot be archived.');
      return;
    }

    if (!window.confirm(`Archive "${house.name}"? Writing and universes remain safe and recoverable.`)) {
      return;
    }

    try {
      // If currently active, switch to house-default first
      if (house.id === activeHouseId) {
        info('Switching House', 'Switching to Primary House before archiving...');
        await onSwitchHouse('house-default');
      }
      await api.archiveHouse(house.id);
      await onRefreshHouses();
      success('House Archived', `"${house.name}" moved to archives.`);
    } catch (err: any) {
      error('Archive Failed', err?.message || String(err));
    }
  };

  const handleRestoreHouse = async (house: HouseRecord) => {
    try {
      await api.restoreHouse(house.id);
      await onRefreshHouses();
      success('House Restored', `"${house.name}" has been restored to active Houses.`);
    } catch (err: any) {
      error('Restore Failed', err?.message || String(err));
    }
  };

  const runIntegrityScan = async () => {
    setScanningIntegrity(true);
    try {
      const rep = await api.inspectHouseIntegrity();
      setIntegrityReport(rep);
    } catch (err: any) {
      error('Integrity Scan Failed', err?.message || String(err));
    } finally {
      setScanningIntegrity(false);
    }
  };

  const runRecoverMoves = async () => {
    setRecoveringMoves(true);
    try {
      const res = await api.recoverPendingUniverseMoves();
      if (res) {
        success('Moves Recovered', `Rolled forward pending universe move: "${res.universe_id}" (${res.document_count} documents).`);
      } else {
        info('No Pending Moves', 'No pending or interrupted universe moves found.');
      }
      await runIntegrityScan();
      await onRefreshHouses();
    } catch (err: any) {
      error('Recovery Failed', err?.message || String(err));
    } finally {
      setRecoveringMoves(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="House of Thoughts Management"
      description="Organize your creative workspaces, configure studios, and monitor library integrity."
      maxWidth="max-w-3xl"
    >
      <div className="space-y-5 max-h-[72vh] overflow-y-auto pr-1">
        {/* TABS */}
        <div className="flex items-center justify-between border-b border-border/80 pb-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setCurrentTab('active');
                setFormMode('list');
              }}
              className={cn(
                'px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors',
                currentTab === 'active'
                  ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
              )}
            >
              Active Houses ({activeHouses.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setCurrentTab('archived');
                setFormMode('list');
              }}
              className={cn(
                'px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors',
                currentTab === 'archived'
                  ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
              )}
            >
              Archived ({archivedHouses.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setCurrentTab('integrity');
                setFormMode('list');
                if (!integrityReport) void runIntegrityScan();
              }}
              className={cn(
                'px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5',
                currentTab === 'integrity'
                  ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
              )}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Integrity &amp; Health</span>
            </button>
          </div>

          {currentTab === 'active' && formMode === 'list' && (
            <button
              type="button"
              onClick={startCreate}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-gold-hover transition-colors shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create House</span>
            </button>
          )}
        </div>

        {/* CREATE / EDIT FORM */}
        {(formMode === 'create' || formMode === 'edit') && (
          <form onSubmit={handleSubmitForm} className="space-y-4 p-4 rounded-xl border border-border bg-card/60">
            <div className="flex items-center justify-between border-b border-border/70 pb-2.5">
              <h3 className="text-base font-serif font-bold text-foreground">
                {formMode === 'create' ? 'Create New House' : 'Edit House Configuration'}
              </h3>
              <button
                type="button"
                onClick={() => setFormMode('list')}
                className="text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                Cancel
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  House Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Citadel of Lore, Poetic Sanctuary"
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Workspace focus and theme..."
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            {/* COLOR & ICON PICKER */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">
                  Color Theme
                </label>
                <div className="flex flex-wrap gap-2">
                  {Object.values(HOUSE_COLORS).map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedColor(c.id)}
                      title={c.name}
                      className={cn(
                        'w-7 h-7 rounded-full flex items-center justify-center border transition-all',
                        c.dot,
                        selectedColor === c.id
                          ? 'ring-2 ring-primary ring-offset-2 ring-offset-card scale-110'
                          : 'opacity-70 hover:opacity-100'
                      )}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">
                  House Icon
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(HOUSE_ICONS).map(([key, IconComp]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedIcon(key)}
                      title={key}
                      className={cn(
                        'p-1.5 rounded-lg border transition-all',
                        selectedIcon === key
                          ? 'bg-primary/20 border-primary text-primary font-bold'
                          : 'border-border/60 hover:bg-muted/40 text-muted-foreground'
                      )}
                    >
                      <IconComp className="w-4 h-4" />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ENABLED STUDIOS & TOOLS */}
            <div className="pt-2 border-t border-border/60">
              <label className="block text-xs font-medium text-foreground mb-2">
                Enabled Studios in this House
              </label>
              <div className="grid grid-cols-3 gap-3">
                {(['poetry', 'philosophy', 'lorebook'] as const).map(studio => {
                  const isChecked = enabledStudios.includes(studio);
                  return (
                    <label
                      key={studio}
                      className={cn(
                        'flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition-all',
                        isChecked
                          ? 'bg-primary/10 border-primary/50 text-foreground'
                          : 'bg-card/40 border-border/50 text-muted-foreground'
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleStudio(studio)}
                        className="rounded border-border text-primary focus:ring-primary"
                      />
                      <span className="text-xs font-serif font-semibold capitalize">
                        {studio} Studio
                      </span>
                    </label>
                  );
                })}
              </div>

              <div className="mt-3">
                <label className="flex items-center gap-2.5 p-3 rounded-xl border border-border/60 bg-card/40 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={manuscriptEnabled}
                    onChange={e => setManuscriptEnabled(e.target.checked)}
                    className="rounded border-border text-primary focus:ring-primary"
                  />
                  <div>
                    <span className="text-xs font-serif font-semibold block text-foreground">
                      Enable Manuscript Tools
                    </span>
                    <span className="text-[11px] text-muted-foreground block mt-0.5">
                      Cross-studio long-form assembly and outline compilation.
                    </span>
                  </div>
                </label>
              </div>
            </div>

            {/* BUTTONS */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/70">
              <button
                type="button"
                onClick={() => setFormMode('list')}
                className="px-4 py-2 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted/40"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-gold-hover transition-colors shadow-xs"
              >
                {submitting ? 'Saving...' : formMode === 'create' ? 'Create House' : 'Save Changes'}
              </button>
            </div>
          </form>
        )}

        {/* ACTIVE HOUSES LIST */}
        {currentTab === 'active' && formMode === 'list' && (
          <div className="space-y-3">
            {activeHouses.map(house => {
              const theme = getHouseColorTheme(house.color);
              const IconComp = getHouseIconComponent(house.icon);
              const isCurrent = house.id === activeHouseId;

              return (
                <div
                  key={house.id}
                  className={cn(
                    'p-4 rounded-xl border transition-all flex items-start justify-between gap-4',
                    isCurrent
                      ? 'bg-accent/40 border-primary/50 shadow-xs'
                      : 'bg-card/40 border-border/70 hover:border-border'
                  )}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className={cn(
                        'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border mt-0.5',
                        theme.bg,
                        theme.border,
                        theme.text
                      )}
                    >
                      <IconComp className="w-5 h-5" />
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-base font-serif font-bold text-foreground truncate">
                          {house.name}
                        </h4>
                        {isCurrent && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/40 font-semibold">
                            Active Workspace
                          </span>
                        )}
                        {house.id === 'house-default' && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            Primary
                          </span>
                        )}
                      </div>

                      {house.description && (
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                          {house.description}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-2 mt-2.5 text-[11px] text-muted-foreground">
                        <span className="font-mono text-muted-foreground/70">ID: {house.id}</span>
                        <span>•</span>
                        <span>Studios: {house.enabled_studios.join(', ')}</span>
                        {house.manuscript_tools_enabled && (
                          <>
                            <span>•</span>
                            <span>Manuscript Tools</span>
                          </>
                        )}
                        {house.universe_ids.length > 0 && (
                          <>
                            <span>•</span>
                            <span className="text-gold-rich font-medium">
                              {house.universe_ids.length} Universe{house.universe_ids.length === 1 ? '' : 's'}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {!isCurrent && (
                      <button
                        type="button"
                        onClick={() => onSwitchHouse(house.id)}
                        className="px-2.5 py-1.5 rounded-lg border border-primary/40 text-primary hover:bg-primary/10 text-xs font-medium transition-colors"
                        title="Switch to this House"
                      >
                        Enter House
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => startEdit(house)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                      title="Edit House settings"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    {house.id !== 'house-default' && (
                      <button
                        type="button"
                        onClick={() => handleArchiveHouse(house)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                        title="Archive House"
                      >
                        <Archive className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ARCHIVED HOUSES LIST */}
        {currentTab === 'archived' && formMode === 'list' && (
          <div className="space-y-3">
            {archivedHouses.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                No archived Houses. Archived Houses retain their documents and universes safely.
              </div>
            ) : (
              archivedHouses.map(house => {
                const theme = getHouseColorTheme(house.color);
                const IconComp = getHouseIconComponent(house.icon);

                return (
                  <div
                    key={house.id}
                    className="p-4 rounded-xl border border-border/50 bg-card/20 opacity-80 hover:opacity-100 transition-opacity flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={cn(
                          'w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border',
                          theme.bg,
                          theme.border,
                          theme.text
                        )}
                      >
                        <IconComp className="w-4 h-4" />
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-serif font-bold text-foreground truncate">
                            {house.name}
                          </h4>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            Archived
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          ID: {house.id} · {house.universe_ids.length} Universes owned
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRestoreHouse(house)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-primary/40 text-primary hover:bg-primary/10 text-xs font-medium transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Restore House</span>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* INTEGRITY & HEALTH TAB */}
        {currentTab === 'integrity' && formMode === 'list' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-xl border border-border/80 bg-muted/10">
              <div>
                <h4 className="text-sm font-serif font-bold text-foreground">
                  Read-Only House Ownership Scanner
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Scans Markdown frontmatter, SQLite index consistency, and operation journals.
                </p>
              </div>
              <button
                type="button"
                onClick={runIntegrityScan}
                disabled={scanningIntegrity}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-gold-hover transition-colors shadow-xs"
              >
                <RefreshCw className={cn('w-3.5 h-3.5', scanningIntegrity && 'animate-spin')} />
                <span>{scanningIntegrity ? 'Scanning...' : 'Scan Now'}</span>
              </button>
            </div>

            {integrityReport && (
              <div className="space-y-3">
                <div className="grid grid-cols-4 gap-3 text-center">
                  <div className="p-3 rounded-lg border border-border/60 bg-card/40">
                    <div className="text-lg font-bold font-mono text-foreground">
                      {integrityReport.total_documents_scanned}
                    </div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">
                      Scanned Docs
                    </div>
                  </div>
                  <div className="p-3 rounded-lg border border-border/60 bg-card/40">
                    <div className="text-lg font-bold font-mono text-foreground">
                      {integrityReport.issues.length}
                    </div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">
                      Total Issues
                    </div>
                  </div>
                  <div className="p-3 rounded-lg border border-border/60 bg-card/40">
                    <div className="text-lg font-bold font-mono text-foreground">
                      {integrityReport.incomplete_universe_move_count ?? 0}
                    </div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">
                      Pending Moves
                    </div>
                  </div>
                  <div className="p-3 rounded-lg border border-border/60 bg-card/40">
                    <div className="text-lg font-bold font-mono text-foreground">
                      {integrityReport.conflicting_entity_count}
                    </div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">
                      Conflicts
                    </div>
                  </div>
                </div>

                {/* If there are incomplete universe moves */}
                {(integrityReport.incomplete_universe_move_count ?? 0) > 0 && (
                  <div className="p-4 rounded-xl border border-amber-500/40 bg-amber-500/10 flex items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <h5 className="text-sm font-semibold text-amber-300">
                          Incomplete Universe Move Detected
                        </h5>
                        <p className="text-xs text-amber-200/80 mt-0.5 leading-relaxed">
                          A previous move was interrupted. Vault backups are safely blocked until the operation is rolled forward.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={runRecoverMoves}
                      disabled={recoveringMoves}
                      className="px-3.5 py-2 rounded-lg bg-amber-500 text-charcoal text-xs font-bold hover:bg-amber-400 transition-colors shrink-0 shadow-sm"
                    >
                      {recoveringMoves ? 'Recovering...' : 'Recover Move'}
                    </button>
                  </div>
                )}

                {/* Issues list */}
                {integrityReport.issues.length === 0 ? (
                  <div className="p-6 text-center text-sm text-emerald-400 flex flex-col items-center gap-2 border border-emerald-500/30 rounded-xl bg-emerald-500/5">
                    <CheckCircle2 className="w-6 h-6" />
                    <span>All documents and Universe mappings are perfectly consistent.</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Detected Issues ({integrityReport.issues.length})
                    </h5>
                    <div className="max-h-48 overflow-y-auto space-y-1.5 p-1">
                      {integrityReport.issues.map((issue, idx) => (
                        <div
                          key={idx}
                          className="p-2.5 rounded-lg border border-border/70 bg-card/60 text-xs flex items-start gap-2.5"
                        >
                          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <span className="font-mono text-[11px] font-semibold text-foreground uppercase">
                              [{issue.issue_type}]
                            </span>{' '}
                            <span className="text-muted-foreground">{issue.message}</span>
                            {issue.relative_path && (
                              <div className="text-[10.5px] font-mono text-muted-foreground/70 mt-0.5 truncate">
                                {issue.relative_path}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};
