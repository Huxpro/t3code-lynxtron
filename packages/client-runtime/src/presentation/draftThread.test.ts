import { describe, expect, it } from "vite-plus/test";

import {
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type ThreadTurnStartBootstrap,
} from "@t3tools/contracts";

import {
  buildDraftThreadTurnBootstrap,
  composerDraftScopeKey,
  createLocalDraftThread,
  forgetLocalDraftThread,
  projectDraftThreadInteractionMode,
  projectComposerDraftText,
  normalizeComposerDraftTextByScopeKey,
  projectDraftThreadModelSelection,
  projectDraftThreadRuntimeMode,
  projectDraftThreadWorkspace,
  readLocalDraftThreadForProject,
  rememberLocalDraftThread,
  shouldFinalizePromotedDraftThread,
} from "./draftThread.ts";

const selection = {
  instanceId: ProviderInstanceId.make("codex"),
  model: "gpt-5.6-sol",
};

describe("local draft thread", () => {
  it("keeps Composer text scoped to its thread and removes empty drafts", () => {
    const first = projectComposerDraftText({}, "thread:thread-a", "draft a");
    const second = projectComposerDraftText(first, "project:project-b", "draft b");

    expect(second).toEqual({
      "thread:thread-a": "draft a",
      "project:project-b": "draft b",
    });
    expect(projectComposerDraftText(second, "thread:thread-a", "draft a")).toBe(second);
    expect(projectComposerDraftText(second, "thread:thread-a", "")).toEqual({
      "project:project-b": "draft b",
    });
  });

  it("uses stable project keys for local drafts and rejects malformed persisted entries", () => {
    expect(
      composerDraftScopeKey({ threadId: "random-draft", projectId: "project-a", localDraft: true }),
    ).toBe("project:project-a");
    expect(
      composerDraftScopeKey({ threadId: "thread-a", projectId: "project-a", localDraft: false }),
    ).toBe("thread:thread-a");
    expect(composerDraftScopeKey({ localDraft: false })).toBeNull();
    expect(
      normalizeComposerDraftTextByScopeKey({
        "project:project-a": "keep",
        "thread:thread-a": "also keep",
        "project:": "drop empty key",
        legacy: "drop unknown key",
        "thread:wrong-type": 42,
        "thread:empty": "",
      }),
    ).toEqual({
      "project:project-a": "keep",
      "thread:thread-a": "also keep",
    });
  });

  it("remembers one reusable local draft per project", () => {
    const first = createLocalDraftThread({
      threadId: ThreadId.make("draft-a"),
      projectId: ProjectId.make("project-a"),
      modelSelection: selection,
      createdAt: "2026-08-22T00:00:00.000Z",
    });
    const second = createLocalDraftThread({
      threadId: ThreadId.make("draft-b"),
      projectId: ProjectId.make("project-b"),
      modelSelection: selection,
      createdAt: "2026-08-22T00:01:00.000Z",
    });

    const registry = rememberLocalDraftThread(rememberLocalDraftThread({}, first), second);

    expect(readLocalDraftThreadForProject(registry, first.projectId)).toBe(first);
    expect(readLocalDraftThreadForProject(registry, second.projectId)).toBe(second);
    expect(forgetLocalDraftThread(registry, first)).toEqual({
      [second.projectId]: second,
    });
    expect(
      forgetLocalDraftThread(registry, {
        ...first,
        id: ThreadId.make("stale-draft-a"),
      }),
    ).toBe(registry);
  });

  it("builds a non-persisted thread shell with the same defaults as a server thread", () => {
    expect(
      createLocalDraftThread({
        threadId: ThreadId.make("draft-thread"),
        projectId: ProjectId.make("project-1"),
        modelSelection: selection,
        createdAt: "2026-08-22T00:00:00.000Z",
      }),
    ).toMatchObject({
      id: "draft-thread",
      projectId: "project-1",
      title: "New thread",
      modelSelection: selection,
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
      session: null,
      latestUserMessageAt: null,
      envMode: "local",
      startFromOrigin: false,
    });
  });

  it("promotes the draft through the atomic turn-start bootstrap", () => {
    const draft = createLocalDraftThread({
      threadId: ThreadId.make("draft-thread"),
      projectId: ProjectId.make("project-1"),
      modelSelection: selection,
      runtimeMode: "auto",
      interactionMode: "plan",
      branch: "feature/draft",
      worktreePath: "/tmp/worktree",
      envMode: "worktree",
      startFromOrigin: true,
      createdAt: "2026-08-22T00:00:00.000Z",
    });
    const prepareWorktree = {
      prepareWorktree: {
        projectCwd: "/repo",
        baseBranch: "main",
      },
      runSetupScript: true,
    } satisfies ThreadTurnStartBootstrap;

    expect(buildDraftThreadTurnBootstrap(draft, "Implement it", prepareWorktree)).toEqual({
      ...prepareWorktree,
      createThread: {
        projectId: draft.projectId,
        title: "Implement it",
        modelSelection: selection,
        runtimeMode: "auto",
        interactionMode: "plan",
        branch: "feature/draft",
        worktreePath: "/tmp/worktree",
        createdAt: draft.createdAt,
      },
    });
  });

  it("projects draft-only model and mode changes without a server mutation", () => {
    const draft = createLocalDraftThread({
      threadId: ThreadId.make("draft-thread"),
      projectId: ProjectId.make("project-1"),
      modelSelection: selection,
      createdAt: "2026-08-22T00:00:00.000Z",
    });
    const nextSelection = {
      instanceId: ProviderInstanceId.make("claudeAgent"),
      model: "claude-fable-5",
    };
    const withModel = projectDraftThreadModelSelection(draft, nextSelection);
    const withRuntime = projectDraftThreadRuntimeMode(withModel, "approval-required");
    const withInteraction = projectDraftThreadInteractionMode(withRuntime, "plan");

    expect(withInteraction).toMatchObject({
      modelSelection: nextSelection,
      runtimeMode: "approval-required",
      interactionMode: "plan",
    });
    expect(projectDraftThreadRuntimeMode(undefined, "auto")).toBeUndefined();
  });

  it("keeps workspace intent local until promotion and clears stale worktree context", () => {
    const draft = createLocalDraftThread({
      threadId: ThreadId.make("draft-thread"),
      projectId: ProjectId.make("project-1"),
      modelSelection: selection,
      branch: "feature/draft",
      worktreePath: "/tmp/worktree",
      envMode: "worktree",
      startFromOrigin: true,
      createdAt: "2026-08-22T00:00:00.000Z",
    });

    expect(projectDraftThreadWorkspace(draft, { startFromOrigin: false })).toMatchObject({
      envMode: "worktree",
      startFromOrigin: false,
      branch: "feature/draft",
      worktreePath: "/tmp/worktree",
    });
    expect(
      projectDraftThreadWorkspace(draft, {
        branch: "feature/next",
        worktreePath: "/tmp/next-worktree",
      }),
    ).toMatchObject({
      envMode: "worktree",
      branch: "feature/next",
      worktreePath: "/tmp/next-worktree",
    });
    expect(projectDraftThreadWorkspace(draft, { envMode: "local" })).toMatchObject({
      envMode: "local",
      startFromOrigin: false,
      branch: null,
      worktreePath: null,
    });
  });

  it("finalizes only after canonical detail proves that the draft started", () => {
    const draftThreadId = ThreadId.make("draft-thread");

    expect(
      shouldFinalizePromotedDraftThread({
        draftThreadId,
        payloadThreadId: draftThreadId,
        messageCount: 0,
        sessionStatus: "idle",
      }),
    ).toBe(false);
    expect(
      shouldFinalizePromotedDraftThread({
        draftThreadId,
        payloadThreadId: draftThreadId,
        messageCount: 1,
        sessionStatus: "idle",
      }),
    ).toBe(true);
    expect(
      shouldFinalizePromotedDraftThread({
        draftThreadId,
        payloadThreadId: draftThreadId,
        messageCount: 0,
        sessionStatus: "starting",
      }),
    ).toBe(true);
    expect(
      shouldFinalizePromotedDraftThread({
        draftThreadId,
        payloadThreadId: ThreadId.make("another-thread"),
        messageCount: 1,
        sessionStatus: "running",
      }),
    ).toBe(false);
  });
});
