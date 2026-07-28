import * as Option from "effect/Option";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/unstable/reactivity";

import { t3ClientActions } from "../../../lynxtron/src/app/state/t3Client";

const updateMetadata = {
  label: "lynx:threads:update-metadata",
  run: async (
    _registry: unknown,
    command: {
      readonly environmentId: string;
      readonly input: {
        readonly threadId: string;
        readonly title?: string;
      };
    },
  ) => {
    const title = command.input.title?.trim();
    if (!title) {
      return AsyncResult.failure(Cause.fail(new Error("Thread title cannot be empty.")));
    }
    try {
      await t3ClientActions.renameThread(command.input.threadId, title);
      return AsyncResult.success(undefined);
    } catch (error) {
      return AsyncResult.failure(Cause.fail(error));
    }
  },
};

export const threadEnvironment = {
  updateMetadata,
};

/**
 * Sidebar prewarming is unnecessary because entities.lynx reads the single
 * connector snapshot synchronously.
 */
export function useEnvironmentThread() {
  return {
    data: Option.none(),
    status: "empty" as const,
    error: Option.none(),
  };
}
