import { useCallback, useState } from "@lynx-js/react";

const values = new Map<string, unknown>();

export class LocalStorageOperationError extends Error {
  readonly operation: string;
  readonly storageKey: string;
  override readonly cause: unknown;

  constructor({
    cause,
    operation,
    storageKey,
  }: {
    readonly cause: unknown;
    readonly operation: string;
    readonly storageKey: string;
  }) {
    super(`Failed to ${operation} local storage item ${storageKey}.`);
    this.name = "LocalStorageOperationError";
    this.cause = cause;
    this.operation = operation;
    this.storageKey = storageKey;
  }
}

export function getLocalStorageItem<T>(key: string, _schema: unknown): T | null {
  return values.has(key) ? (values.get(key) as T) : null;
}

export function setLocalStorageItem<T>(key: string, value: T, _schema: unknown): void {
  values.set(key, value);
}

export function removeLocalStorageItem(key: string): void {
  values.delete(key);
}

export function useLocalStorage<T>(
  key: string,
  initialValue: T,
  schema: unknown,
): [T, (value: T | ((current: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => getLocalStorageItem<T>(key, schema) ?? initialValue);
  const update = useCallback(
    (next: T | ((current: T) => T)) => {
      setValue((current) => {
        const resolved = typeof next === "function" ? (next as (current: T) => T)(current) : next;
        if (resolved === null) {
          values.delete(key);
        } else {
          values.set(key, resolved);
        }
        return resolved;
      });
    },
    [key],
  );
  return [value, update];
}
