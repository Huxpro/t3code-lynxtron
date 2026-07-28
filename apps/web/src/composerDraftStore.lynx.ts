import type { ScopedProjectRef } from "@t3tools/contracts";
import { create } from "zustand";

declare const draftIdBrand: unique symbol;
export type DraftId = string & { readonly [draftIdBrand]: "DraftId" };
export const DraftId = {
  make: (value: string): DraftId => value as DraftId,
};

interface LynxComposerDraftStoreState {
  getDraftSession: (_draftId: string) => null;
  getDraftThreadByProjectRef: (_projectRef: ScopedProjectRef) => null;
  clearDraftThread: (_draftId: unknown) => void;
  clearProjectDraftThreadId: (_projectRef: ScopedProjectRef) => void;
}

/**
 * Sidebar-only Lynx adapter. Composer draft ownership remains in the native
 * Lynx ChatView until the shared Web draft lifecycle is ported.
 */
export const useComposerDraftStore = create<LynxComposerDraftStoreState>(() => ({
  getDraftSession: () => null,
  getDraftThreadByProjectRef: () => null,
  clearDraftThread: () => {},
  clearProjectDraftThreadId: () => {},
}));

export function clearComposerDraftsEnvironment(): void {}
