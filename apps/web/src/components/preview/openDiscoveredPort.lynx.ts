import type { DiscoveredLocalServer, ScopedThreadRef } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/unstable/reactivity";

interface OpenPreviewMutation<E> {
  (input: unknown): Promise<AsyncResult.Success<unknown, E> | AsyncResult.Failure<unknown, E>>;
}

/**
 * Preview ports are not advertised by the Lynx host, so this is an explicit
 * unreachable fallback rather than a Web browser/right-panel dependency.
 */
export async function openDiscoveredPort<E>(_input: {
  readonly threadRef: ScopedThreadRef;
  readonly port: DiscoveredLocalServer;
  readonly openPreview: OpenPreviewMutation<E>;
}): Promise<AsyncResult.Failure<void, Error>> {
  return AsyncResult.failure(
    Cause.fail(new Error("Preview sessions are not supported by the Lynx host.")),
  );
}
