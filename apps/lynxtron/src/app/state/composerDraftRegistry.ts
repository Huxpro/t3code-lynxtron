import type { UploadChatAttachment } from "@t3tools/contracts";
import type { ComposerFileContext } from "@t3tools/client-runtime/presentation/composer";

const drafts = new Map<string, string>();
const attachments = new Map<string, UploadChatAttachment[]>();
const fileContexts = new Map<string, ComposerFileContext[]>();
const listeners = new Set<() => void>();
const PERSISTED_DRAFTS_KEY = "composerPromptDrafts";
const PERSISTED_ATTACHMENTS_KEY = "composerImageAttachments";
const PERSISTED_FILE_CONTEXTS_KEY = "composerFileContexts";

export interface ComposerDraftStorage {
  isAvailable?(): boolean;
  get<T>(key: string, fallback: T): T;
  set(key: string, value: unknown): void;
}

export function hydrateComposerDrafts(storage: ComposerDraftStorage): boolean {
  if (storage.isAvailable && !storage.isAvailable()) return false;
  const persisted = storage.get<Record<string, unknown>>(PERSISTED_DRAFTS_KEY, {});
  for (const [key, value] of Object.entries(persisted)) {
    if (typeof value === "string" && value.length > 0 && !drafts.has(key)) drafts.set(key, value);
  }
  const persistedAttachments = storage.get<Record<string, UploadChatAttachment[]>>(
    PERSISTED_ATTACHMENTS_KEY,
    {},
  );
  for (const [key, value] of Object.entries(persistedAttachments)) {
    if (Array.isArray(value) && value.length > 0 && !attachments.has(key))
      attachments.set(key, value);
  }
  const persistedFileContexts = storage.get<Record<string, ComposerFileContext[]>>(
    PERSISTED_FILE_CONTEXTS_KEY,
    {},
  );
  for (const [key, value] of Object.entries(persistedFileContexts)) {
    if (Array.isArray(value) && value.length > 0 && !fileContexts.has(key))
      fileContexts.set(key, value);
  }
  notify();
  return true;
}

export function persistComposerDrafts(storage: ComposerDraftStorage): boolean {
  if (storage.isAvailable && !storage.isAvailable()) return false;
  storage.set(PERSISTED_DRAFTS_KEY, Object.fromEntries(drafts));
  storage.set(PERSISTED_ATTACHMENTS_KEY, Object.fromEntries(attachments));
  storage.set(PERSISTED_FILE_CONTEXTS_KEY, Object.fromEntries(fileContexts));
  return true;
}

export function composerDraftKey(input: {
  readonly projectId?: string;
  readonly threadId?: string;
}): string {
  return input.threadId ? `thread:${input.threadId}` : `project:${input.projectId ?? "unknown"}`;
}

export function readComposerDraft(key: string): string {
  return drafts.get(key) ?? "";
}

export function writeComposerDraft(key: string, value: string): void {
  if (value.length === 0) drafts.delete(key);
  else drafts.set(key, value);
}

export function moveComposerDraft(fromKey: string, toKey: string): void {
  if (fromKey === toKey) return;
  const value = drafts.get(fromKey);
  drafts.delete(fromKey);
  if (value === undefined || value.length === 0) drafts.delete(toKey);
  else drafts.set(toKey, value);
  const movedAttachments = attachments.get(fromKey);
  attachments.delete(fromKey);
  if (movedAttachments?.length) attachments.set(toKey, movedAttachments);
  const movedFileContexts = fileContexts.get(fromKey);
  fileContexts.delete(fromKey);
  if (movedFileContexts?.length) fileContexts.set(toKey, movedFileContexts);
  notify();
}

export function clearComposerDraft(key: string): void {
  drafts.delete(key);
  attachments.delete(key);
  fileContexts.delete(key);
  notify();
}

function notify(): void {
  for (const listener of listeners) listener();
}
export function subscribeComposerDrafts(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function readComposerFileContexts(key: string): ReadonlyArray<ComposerFileContext> {
  return fileContexts.get(key) ?? [];
}
export function addComposerFileContext(key: string, context: ComposerFileContext): void {
  const next = [
    ...(fileContexts.get(key) ?? []).filter((entry) => entry.path !== context.path),
    context,
  ];
  fileContexts.set(key, next);
  notify();
}
export function removeComposerFileContext(key: string, path: string): void {
  const next = (fileContexts.get(key) ?? []).filter((entry) => entry.path !== path);
  if (next.length) fileContexts.set(key, next);
  else fileContexts.delete(key);
  notify();
}

export function readComposerAttachments(key: string): ReadonlyArray<UploadChatAttachment> {
  return attachments.get(key) ?? [];
}

export function addComposerAttachments(
  key: string,
  values: ReadonlyArray<UploadChatAttachment>,
): ReadonlyArray<UploadChatAttachment> {
  const next = [...(attachments.get(key) ?? []), ...values].slice(0, 8);
  if (next.length) attachments.set(key, next);
  return next;
}

export function removeComposerAttachment(
  key: string,
  index: number,
): ReadonlyArray<UploadChatAttachment> {
  const next = (attachments.get(key) ?? []).filter((_, candidate) => candidate !== index);
  if (next.length) attachments.set(key, next);
  else attachments.delete(key);
  return next;
}
