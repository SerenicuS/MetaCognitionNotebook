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

/** Retain failed metadata actions for Ctrl+S/retry and include them in close flushing. */
export class MutationQueue {
  private actions: (() => Promise<void>)[] = [];
  public hasFailure = false;
  private inFlight: Promise<boolean> | null = null;
  get pendingCount() { return this.actions.length; }
  discard(): boolean {
    if (this.inFlight) return false;
    this.actions = [];
    this.hasFailure = false;
    return true;
  }
  enqueue(action: () => Promise<void>) { this.actions.push(action); return this.flush(); }
  flush(): Promise<boolean> {
    if (this.inFlight) return this.inFlight;
    if (!this.actions.length) return Promise.resolve(true);
    this.hasFailure = false;
    this.inFlight = (async () => {
      // Defer work until inFlight has been assigned, including synchronous failures.
      await Promise.resolve();
      try {
        while (this.actions.length) {
          try { await this.actions[0](); } catch { this.hasFailure = true; return false; }
          this.actions.shift();
        }
        return true;
      } finally {
        // Clear before resolving callers, so an immediately queued action starts a new drain.
        this.inFlight = null;
      }
    })();
    return this.inFlight;
  }
}

/** Orders actual IPC operations and their acknowledgements, including body saves. */
export class CommandQueue {
  private tail: Promise<unknown> = Promise.resolve();
  run<T>(action: () => Promise<T>): Promise<T> {
    const result = this.tail.then(action);
    this.tail = result.catch(() => {});
    return result;
  }
}

/** Recheck mutations after draining writing: organization actions may arrive during a save. */
export async function flushWorkspace(mutations: MutationQueue, saveBody: () => Promise<boolean>): Promise<boolean> {
  while (true) {
    if (!(await mutations.flush())) return false;
    if (!(await saveBody())) return false;
    if (!mutations.pendingCount) return true;
  }
}
