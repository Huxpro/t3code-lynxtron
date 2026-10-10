// The key event an upstream `onKeyDown` / `onKeyUp` handler is called with on
// Lynx. A Lynx key event reaches the handler from the main thread after it has
// been dispatched, so the event carries the key and its modifiers and nothing
// that needs the live DOM event (`target`, `nativeEvent`, `code`).
import type { HostKeyEvent } from "~/components/ui/hostElements";

export interface DomKeyEvent extends HostKeyEvent {
  /** Does nothing: a key on a Lynx element has no default action to prevent. */
  preventDefault(): void;
  /** Throws: the event has finished propagating before the handler runs. */
  stopPropagation(): void;
}

// A method signature, so a handler upstream typed for React's KeyboardEvent is
// accepted by reference and one written inline gets `DomKeyEvent`.
export type DomKeyHandler = { handle(event: DomKeyEvent): void }["handle"];

function preventDefault(): void {}

function stopPropagation(): void {
  throw new Error(
    "KeyboardEvent.stopPropagation is not available on Lynx: the key event has already propagated when its handler runs.",
  );
}

function flag(event: object, name: keyof HostKeyEvent): boolean {
  return name in event && (event as Record<string, unknown>)[name] === true;
}

/** Builds the event from what the host element forwards. */
export function domKeyEvent(event: unknown): DomKeyEvent {
  if (typeof event !== "object" || event === null || !("key" in event)) {
    throw new Error("A Lynx key event arrived without a key.");
  }
  return {
    key: String(event.key),
    repeat: flag(event, "repeat"),
    altKey: flag(event, "altKey"),
    ctrlKey: flag(event, "ctrlKey"),
    metaKey: flag(event, "metaKey"),
    shiftKey: flag(event, "shiftKey"),
    preventDefault,
    stopPropagation,
  };
}

/** Adapts a DOM key handler to the host elements' `onKeyDown` / `onKeyUp`. */
export function hostKeyHandler(handler: DomKeyHandler): (event: unknown) => void {
  return (event) => handler(domKeyEvent(event));
}
