// Lynx toast state, kept free of React so it can be unit tested.

export type LynxToastType = "error" | "info" | "loading" | "success" | "warning";

export interface LynxToastOptions {
  readonly type?: LynxToastType | string;
  readonly title?: unknown;
  readonly description?: unknown;
  readonly timeout?: number;
}

export interface LynxToastRecord {
  readonly id: number;
  readonly type: LynxToastType;
  readonly title: string | null;
  readonly description: string | null;
}

// Mirrors the Web toast defaults: auto-dismiss after five seconds, loading
// toasts stay until updated or closed, and only the newest few are shown.
const DEFAULT_TIMEOUT_MS = 5_000;

let nextToastId = 1;
let toasts: readonly LynxToastRecord[] = [];
const listeners = new Set<() => void>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();

const textOf = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

const normalizeType = (type: unknown): LynxToastType =>
  type === "error" ||
  type === "loading" ||
  type === "success" ||
  type === "warning" ||
  type === "info"
    ? type
    : "info";

function emit(next: readonly LynxToastRecord[]): void {
  toasts = next;
  for (const listener of listeners) listener();
}

function schedule(id: number, type: LynxToastType, timeout: number | undefined): void {
  const existing = timers.get(id);
  if (existing) clearTimeout(existing);
  timers.delete(id);
  const duration = timeout ?? DEFAULT_TIMEOUT_MS;
  if (type === "loading" || duration <= 0) return;
  timers.set(
    id,
    setTimeout(() => toastManager.close(id), duration),
  );
}

/** Lynx implementation of the Web toast manager surface used by shared code. */
export const toastManager = {
  add(options: LynxToastOptions): number {
    const id = nextToastId++;
    const type = normalizeType(options.type);
    emit([
      ...toasts,
      { id, type, title: textOf(options.title), description: textOf(options.description) },
    ]);
    schedule(id, type, options.timeout);
    return id;
  },
  update(id: number, options: LynxToastOptions): void {
    const current = toasts.find((toast) => toast.id === id);
    if (!current) return;
    const type = options.type === undefined ? current.type : normalizeType(options.type);
    emit(
      toasts.map((toast) =>
        toast.id === id
          ? {
              id,
              type,
              title: options.title === undefined ? toast.title : textOf(options.title),
              description:
                options.description === undefined ? toast.description : textOf(options.description),
            }
          : toast,
      ),
    );
    schedule(id, type, options.timeout);
  },
  close(id: number): void {
    const timer = timers.get(id);
    if (timer) clearTimeout(timer);
    timers.delete(id);
    if (!toasts.some((toast) => toast.id === id)) return;
    emit(toasts.filter((toast) => toast.id !== id));
  },
};

/** Current toasts, oldest first. */
export function readToasts(): readonly LynxToastRecord[] {
  return toasts;
}

export function subscribeToasts(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
