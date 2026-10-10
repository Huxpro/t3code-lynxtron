// Lynx implementation of `@base-ui/react/merge-props`. The build and typecheck
// resolve the package specifier to this module.
import type * as hostDom from "../hostDom";

type HostDomTag = keyof typeof hostDom;
type TagProps<Tag extends HostDomTag> = Parameters<(typeof hostDom)[Tag]>[0];
type Handler = (...args: ReadonlyArray<unknown>) => void;

const isHandler = (value: unknown): value is Handler => typeof value === "function";
const isStyle = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/**
 * Merges props the way Base UI does: a later set wins, class names join, style
 * objects merge, and handlers of the same name all run, the later one first.
 */
export function mergeProps<Tag extends HostDomTag = HostDomTag>(
  ...sets: ReadonlyArray<TagProps<Tag> | undefined>
): TagProps<Tag> {
  const merged: Record<string, unknown> = {};
  for (const set of sets) {
    if (!set) continue;
    for (const name in set) {
      const next = set[name];
      const previous = merged[name];
      if (name === "className" && typeof next === "string" && typeof previous === "string") {
        merged[name] = `${next} ${previous}`;
      } else if (name === "style" && isStyle(next) && isStyle(previous)) {
        merged[name] = { ...previous, ...next };
      } else if (/^(?:on[A-Z]|bind|catch)/u.test(name) && isHandler(next) && isHandler(previous)) {
        merged[name] = (...args: ReadonlyArray<unknown>) => {
          next(...args);
          previous(...args);
        };
      } else if (next !== undefined || !(name in merged)) {
        merged[name] = next;
      }
    }
  }
  return merged;
}
