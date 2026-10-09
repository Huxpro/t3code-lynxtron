import { type CxOptions, cx } from "class-variance-authority";
import { twMerge } from "tailwind-merge";

import { DraftId } from "../composerDraftStore";

export { isLinuxPlatform, isMacPlatform, isWindowsPlatform } from "./platformDetection";

export function cn(...inputs: CxOptions) {
  return twMerge(cx(inputs));
}

export function randomHex(byteLength: number): string {
  let output = "";
  for (let index = 0; index < byteLength; index += 1) {
    output += Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, "0");
  }
  return output;
}

export function randomUUID(): string {
  const hex = randomHex(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
}

export const newCommandId = () => randomUUID();
export const newProjectId = () => randomUUID();
export const newThreadId = () => randomUUID();
export const newDraftId = () => DraftId.make(randomUUID());
export const newMessageId = () => randomUUID();

export function normalizeSearchText(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}
