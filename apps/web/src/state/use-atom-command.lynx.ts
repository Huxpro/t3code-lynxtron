import { RegistryContext } from "@effect/atom-react";
import * as Cause from "effect/Cause";
import { AsyncResult, type AtomRegistry } from "effect/unstable/reactivity";
import { useCallback, useContext } from "react";

interface LynxAtomCommand<W, A, E> {
  readonly label: string;
  readonly run: (
    registry: AtomRegistry.AtomRegistry,
    input: W,
  ) => Promise<AsyncResult.Success<A, E> | AsyncResult.Failure<A, E>>;
}

/**
 * Lynx-safe command hook. It preserves the shared command interface without
 * importing the Web environment RPC runtime into QuickJS.
 */
export function useAtomCommand<A, E, W>(
  command: LynxAtomCommand<W, A, E>,
  _options?: string | { readonly label?: string; readonly reportFailure?: boolean },
): (value: W) => Promise<AsyncResult.Success<A, E> | AsyncResult.Failure<A, E>> {
  const registry = useContext(RegistryContext);
  return useCallback(
    async (value: W) => {
      try {
        return await command.run(registry, value);
      } catch (defect) {
        return AsyncResult.failure(Cause.die(defect));
      }
    },
    [command, registry],
  );
}
