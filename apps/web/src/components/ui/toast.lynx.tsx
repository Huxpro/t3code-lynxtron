import type { ReactNode } from "react";

let nextToastId = 1;

export const toastManager = {
  add: (_options: unknown): number => nextToastId++,
  close: (_id: number): void => {},
};

export const anchoredToastManager = toastManager;

export function stackedThreadToast<T>(options: T): T {
  return options;
}

export function ToastProvider({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}

export const AnchoredToastProvider = ToastProvider;
export type ToastPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";
