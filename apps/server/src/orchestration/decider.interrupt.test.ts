import {
  CommandId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  TurnId,
  type OrchestrationReadModel,
} from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { decideOrchestrationCommand } from "./decider.ts";

const NOW = "2026-01-01T00:00:00.000Z";

function readModel(activeTurnId: TurnId | null): OrchestrationReadModel {
  return {
    snapshotSequence: 0,
    projects: [],
    threads: [
      {
        id: ThreadId.make("thread-1"),
        projectId: ProjectId.make("project-1"),
        title: "Thread",
        pullRequests: [],
        modelSelection: {
          instanceId: ProviderInstanceId.make("opencode"),
          model: "opencode/big-pickle",
        },
        runtimeMode: "full-access",
        interactionMode: "default",
        branch: null,
        worktreePath: null,
        latestTurn: null,
        createdAt: NOW,
        updatedAt: NOW,
        archivedAt: null,
        settledOverride: null,
        settledAt: null,
        deletedAt: null,
        messages: [],
        proposedPlans: [],
        activities: [],
        checkpoints: [],
        session: {
          threadId: ThreadId.make("thread-1"),
          status: "running",
          providerName: "opencode",
          providerInstanceId: ProviderInstanceId.make("opencode"),
          runtimeMode: "full-access",
          activeTurnId,
          lastError: null,
          updatedAt: NOW,
        },
      },
    ],
    updatedAt: NOW,
  };
}

it.layer(NodeServices.layer)("turn interrupt decider", (it) => {
  it.effect("projects the active turn id when the client omits it", () =>
    Effect.gen(function* () {
      const activeTurnId = TurnId.make("turn-active");
      const event = yield* decideOrchestrationCommand({
        command: {
          type: "thread.turn.interrupt",
          commandId: CommandId.make("cmd-interrupt"),
          threadId: ThreadId.make("thread-1"),
          createdAt: NOW,
        },
        readModel: readModel(activeTurnId),
      });
      const events = Array.isArray(event) ? event : [event];
      expect(events).toHaveLength(1);
      if (events[0]?.type === "thread.turn-interrupt-requested") {
        expect(events[0].payload.turnId).toBe(activeTurnId);
      }
    }),
  );

  it.effect("preserves an explicit turn id", () =>
    Effect.gen(function* () {
      const explicitTurnId = TurnId.make("turn-explicit");
      const event = yield* decideOrchestrationCommand({
        command: {
          type: "thread.turn.interrupt",
          commandId: CommandId.make("cmd-interrupt-explicit"),
          threadId: ThreadId.make("thread-1"),
          turnId: explicitTurnId,
          createdAt: NOW,
        },
        readModel: readModel(TurnId.make("turn-active")),
      });
      const events = Array.isArray(event) ? event : [event];
      expect(events).toHaveLength(1);
      if (events[0]?.type === "thread.turn-interrupt-requested") {
        expect(events[0].payload.turnId).toBe(explicitTurnId);
      }
    }),
  );
});
