import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  clearComposerDraft,
  composerDraftKey,
  moveComposerDraft,
  readComposerDraft,
  writeComposerDraft,
  hydrateComposerDrafts,
  persistComposerDrafts,
  addComposerAttachments,
  readComposerAttachments,
  removeComposerAttachment,
  addComposerFileContext,
  readComposerFileContexts,
  removeComposerFileContext,
} from "./composerDraftRegistry.ts";

describe("composer draft registry", () => {
  beforeEach(() => {
    for (const key of ["project:p1", "thread:t1", "thread:t2"]) clearComposerDraft(key);
  });

  it("isolates project hero and thread drafts", () => {
    const project = composerDraftKey({ projectId: "p1" });
    const thread = composerDraftKey({ projectId: "p1", threadId: "t1" });
    writeComposerDraft(project, "new thread");
    writeComposerDraft(thread, "existing thread");
    expect(readComposerDraft(project)).toBe("new thread");
    expect(readComposerDraft(thread)).toBe("existing thread");
  });

  it("promotes a hero draft to the created thread without duplication", () => {
    writeComposerDraft("project:p1", "first turn");
    moveComposerDraft("project:p1", "thread:t1");
    expect(readComposerDraft("project:p1")).toBe("");
    expect(readComposerDraft("thread:t1")).toBe("first turn");
    clearComposerDraft("thread:t1");
    expect(readComposerDraft("thread:t1")).toBe("");
  });

  it("round-trips non-empty drafts through host storage", () => {
    const values = new Map<string, unknown>();
    const storage = {
      get: <T>(key: string, fallback: T) => (values.get(key) as T | undefined) ?? fallback,
      set: (key: string, value: unknown) => void values.set(key, value),
    };
    writeComposerDraft("thread:t2", "survive restart");
    persistComposerDrafts(storage);
    clearComposerDraft("thread:t2");
    hydrateComposerDrafts(storage);
    expect(readComposerDraft("thread:t2")).toBe("survive restart");
  });

  it("recovers every draft kind when host storage becomes readable after startup", () => {
    let ready = false;
    const stored: Record<string, unknown> = {
      composerPromptDrafts: { "thread:t2": "late draft" },
      composerImageAttachments: {
        "thread:t2": [
          {
            type: "image",
            name: "late.png",
            mimeType: "image/png",
            sizeBytes: 4,
            dataUrl: "data:image/png;base64,dGVzdA==",
          },
        ],
      },
      composerFileContexts: {
        "thread:t2": [{ path: "src/late.ts", contents: "export const late = true;" }],
      },
    };
    const set = vi.fn();
    const storage = {
      isAvailable: () => ready,
      get: <T>(key: string, fallback: T) =>
        ready ? ((stored[key] as T | undefined) ?? fallback) : fallback,
      set,
    };
    expect(hydrateComposerDrafts(storage)).toBe(false);
    expect(readComposerDraft("thread:t2")).toBe("");
    expect(readComposerAttachments("thread:t2")).toEqual([]);
    expect(readComposerFileContexts("thread:t2")).toEqual([]);
    expect(set).not.toHaveBeenCalled();
    ready = true;
    expect(hydrateComposerDrafts(storage)).toBe(true);
    expect(readComposerDraft("thread:t2")).toBe("late draft");
    expect(readComposerAttachments("thread:t2")).toHaveLength(1);
    expect(readComposerAttachments("thread:t2")[0]?.name).toBe("late.png");
    expect(readComposerFileContexts("thread:t2")).toEqual([
      { path: "src/late.ts", contents: "export const late = true;" },
    ]);
  });

  it("does not overwrite persisted attachments while host storage is unavailable", () => {
    const set = vi.fn();
    const storage = {
      isAvailable: () => false,
      get: <T>(_key: string, fallback: T) => fallback,
      set,
    };
    expect(persistComposerDrafts(storage)).toBe(false);
    expect(set).not.toHaveBeenCalled();
  });

  it("keeps local edits made before delayed host hydration completes", () => {
    const localAttachment = {
      type: "image" as const,
      name: "local.png",
      mimeType: "image/png",
      sizeBytes: 5,
      dataUrl: "data:image/png;base64,bG9jYWw=",
    };
    writeComposerDraft("thread:t2", "local draft");
    addComposerAttachments("thread:t2", [localAttachment]);
    addComposerFileContext("thread:t2", { path: "src/local.ts", contents: "local" });
    const storage = {
      isAvailable: () => true,
      get: <T>(key: string, fallback: T) =>
        (({
          composerPromptDrafts: { "thread:t2": "stale persisted draft" },
          composerImageAttachments: { "thread:t2": [{ ...localAttachment, name: "stale.png" }] },
          composerFileContexts: { "thread:t2": [{ path: "src/stale.ts", contents: "stale" }] },
        })[key] as T | undefined) ?? fallback,
      set: () => {},
    };

    expect(hydrateComposerDrafts(storage)).toBe(true);
    expect(readComposerDraft("thread:t2")).toBe("local draft");
    expect(readComposerAttachments("thread:t2")[0]?.name).toBe("local.png");
    expect(readComposerFileContexts("thread:t2")[0]?.path).toBe("src/local.ts");
  });

  it("adds, removes, persists, and promotes image attachments", () => {
    const attachment = {
      type: "image" as const,
      name: "proof.png",
      mimeType: "image/png",
      sizeBytes: 4,
      dataUrl: "data:image/png;base64,dGVzdA==",
    };
    addComposerAttachments("project:p1", [attachment]);
    moveComposerDraft("project:p1", "thread:t1");
    expect(readComposerAttachments("thread:t1")).toEqual([attachment]);
    expect(removeComposerAttachment("thread:t1", 0)).toEqual([]);
  });

  it("persists and promotes file contexts with the hero draft", () => {
    const values = new Map<string, unknown>();
    const storage = {
      get: <T>(key: string, fallback: T) => (values.get(key) as T | undefined) ?? fallback,
      set: (key: string, value: unknown) => void values.set(key, value),
    };
    addComposerFileContext("project:p1", { path: "src/a.ts", contents: "export const a = 1;" });
    moveComposerDraft("project:p1", "thread:t1");
    persistComposerDrafts(storage);
    clearComposerDraft("thread:t1");
    hydrateComposerDrafts(storage);
    expect(readComposerFileContexts("thread:t1")).toEqual([
      { path: "src/a.ts", contents: "export const a = 1;" },
    ]);
  });

  it("replaces duplicate file paths and removes the persisted chip", () => {
    addComposerFileContext("thread:t1", { path: "src/a.ts", contents: "old" });
    addComposerFileContext("thread:t1", { path: "src/a.ts", contents: "new" });
    expect(readComposerFileContexts("thread:t1")).toEqual([{ path: "src/a.ts", contents: "new" }]);
    removeComposerFileContext("thread:t1", "src/a.ts");
    expect(readComposerFileContexts("thread:t1")).toEqual([]);
  });
});
