import { useCallback, useEffect, useRef } from "@lynx-js/react";
import type { NodesRef } from "@lynx-js/types";

/**
 * Keeps a Lynx `<input>` showing `value`. The element has no `value` prop, so a
 * non-empty starting value or an external change must go through `setValue`.
 * Spread `ref` on the input and call `noteInput` from `bindinput` so typing is
 * not written back over the caret.
 */
export function useNativeInputValue(value: string) {
  const ref = useRef<NodesRef>(null);
  const shown = useRef("");
  useEffect(() => {
    if (shown.current === value) return;
    shown.current = value;
    ref.current?.invoke({ method: "setValue", params: { value } }).exec();
  }, [value]);
  const noteInput = useCallback((next: string) => {
    shown.current = next;
  }, []);
  return { ref, noteInput };
}
