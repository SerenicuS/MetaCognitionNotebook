export interface VaultPreview {
  path: string; size: number; archive_sha256: string; format_version: number; app_version: string;
  created_at: string; document_count: number; studios: string[]; attachment_count: number;
  archived_count: number; file_count: number; total_bytes: number;
}
export interface VaultHistory { folder: string; backups: { path: string; name: string; size: number; file_date: string; incomplete: boolean }[] }
export interface VaultRestore { restored_path: string; document_count: number }
export type VaultPhase = 'Creating' | 'Verifying' | 'Restoring' | 'Opening folder' | 'Activating' | 'Returning';
export type RunVault = <T>(phase: VaultPhase, action: () => Promise<T>) => Promise<T>;

/** Native close waits for the entire operation; a failed flush never starts a capture. */
export class VaultCoordinator {
  private operation: Promise<unknown> | null = null;
  private activationPending = false;
  requireRestart() { this.activationPending = true; }
  get restartRequired() { return this.activationPending; }
  get busy() { return this.operation !== null || this.activationPending; }
  run<T>(flush: () => Promise<boolean>, action: () => Promise<T>): Promise<T> {
    if (this.busy) return Promise.reject(new Error('A Vault operation is already running.'));
    const task = (async () => {
      if (!(await flush())) throw new Error('Backup/recovery did not start because pending changes could not be saved.');
      return action();
    })();
    this.operation = task.finally(() => { this.operation = null; });
    return this.operation as Promise<T>;
  }
  async wait(): Promise<void> { await this.operation?.catch(() => {}); }
  async prepareExit(flush: () => Promise<boolean>): Promise<boolean> {
    await this.wait();
    return this.restartRequired ? true : flush();
  }
}
export const backupSize = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KiB` : `${(bytes / 1024 / 1024).toFixed(1)} MiB`;

export interface ActivationStatus {
  active_path: string; selected_path: string; previous_path: string | null;
  preserved_backup: string | null; restart_required: boolean; message: string;
}
/** A lost activation acknowledgement must be reconciled before writing resumes. */
export async function reconcileActivation(gate: VaultCoordinator, status: () => Promise<ActivationStatus>): Promise<ActivationStatus> {
  try {
    const result = await status();
    if (result.restart_required) gate.requireRestart();
    return result;
  } catch (error) {
    gate.requireRestart(); // Unknown publication outcome: close/reopen resolves it at startup.
    throw error;
  }
}
