export interface FileSaveResultLike {
  readonly _tag: "Success" | "Failure";
}

export interface FileSaveScheduler {
  readonly now: () => number;
  readonly schedule: (callback: () => void, delayMs: number) => unknown;
  readonly cancel: (handle: unknown) => void;
}

export interface FileSaveCoordinatorOptions<R extends FileSaveResultLike> {
  readonly debounceMs: number;
  readonly scheduler: FileSaveScheduler;
  readonly persist: (contents: string) => Promise<R>;
  readonly onPendingChange: (pending: boolean) => void;
  readonly onConfirmed: (contents: string) => void;
}

/**
 * Serializes debounced file writes without dropping edits that arrive while a
 * previous revision is in flight. The result shape intentionally matches
 * `AtomCommandResult` while remaining usable by non-Web hosts.
 */
export class FileSaveCoordinator<R extends FileSaveResultLike = FileSaveResultLike> {
  private timer: unknown | null = null;
  private latestContents = "";
  private latestRevision = 0;
  private confirmedRevision = 0;
  private lastChangeAt = 0;
  private saving = false;
  private disposed = false;

  private readonly options: FileSaveCoordinatorOptions<R>;

  constructor(options: FileSaveCoordinatorOptions<R>) {
    this.options = options;
  }

  change(contents: string): void {
    this.latestContents = contents;
    this.latestRevision += 1;
    this.lastChangeAt = this.options.scheduler.now();
    this.options.onPendingChange(true);
    this.schedule(this.options.debounceMs);
  }

  flush(): Promise<void> {
    this.clearTimer();
    return this.persistLatest();
  }

  dispose(): void {
    this.disposed = true;
    if (this.latestRevision > this.confirmedRevision) void this.flush();
  }

  private schedule(delay: number): void {
    this.clearTimer();
    this.timer = this.options.scheduler.schedule(() => {
      this.timer = null;
      void this.persistLatest();
    }, delay);
  }

  private clearTimer(): void {
    if (this.timer === null) return;
    this.options.scheduler.cancel(this.timer);
    this.timer = null;
  }

  private async persistLatest(): Promise<void> {
    if (this.saving || this.latestRevision === this.confirmedRevision) return;

    this.saving = true;
    const contents = this.latestContents;
    const revision = this.latestRevision;
    const result = await this.options.persist(contents);
    const succeeded = result._tag === "Success";
    if (succeeded) {
      this.confirmedRevision = Math.max(this.confirmedRevision, revision);
      this.options.onConfirmed(contents);
    }

    this.saving = false;
    if (revision === this.latestRevision) {
      if (succeeded) this.options.onPendingChange(false);
      return;
    }

    const remainingDebounce = Math.max(
      0,
      this.options.debounceMs - (this.options.scheduler.now() - this.lastChangeAt),
    );
    if (this.disposed) {
      void this.persistLatest();
    } else {
      this.schedule(remainingDebounce);
    }
  }
}
