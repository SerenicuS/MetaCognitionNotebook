/** Serialize flush callers and drain edits that arrive while a write is in flight. */
export class SaveCoordinator {
  private inFlight: Promise<boolean> | null = null;

  flush(writeNext: () => Promise<'saved' | 'more' | 'error'>): Promise<boolean> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = (async () => {
      while (true) {
        const result = await writeNext();
        if (result === 'error') return false;
        if (result === 'saved') return true;
      }
    })().finally(() => { this.inFlight = null; });
    return this.inFlight;
  }
}

/** Keep the window alive until all writing is saved; allow retries after failure. */
export class ExitCoordinator {
  private exiting = false;

  async run(flush: () => Promise<boolean>, exit: () => Promise<void>): Promise<boolean> {
    if (this.exiting) return false;
    this.exiting = true;
    try {
      if (!(await flush())) return false;
      await exit();
      return true;
    } finally {
      this.exiting = false;
    }
  }
}
