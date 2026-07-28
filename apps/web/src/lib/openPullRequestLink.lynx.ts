import { useCallback } from "@lynx-js/react";

import { clientCapabilities } from "../platform/clientCapabilities";

interface LinkActivationEvent {
  readonly preventDefault?: () => void;
  readonly stopPropagation?: () => void;
}

export class PullRequestLinkOpenError extends Error {
  readonly targetOrigin: string | null;
  override readonly cause: unknown;

  constructor(input: { readonly targetOrigin: string | null; readonly cause: unknown }) {
    super(
      input.targetOrigin === null
        ? "Unable to open pull request link."
        : `Unable to open pull request link at ${input.targetOrigin}.`,
    );
    this.name = "PullRequestLinkOpenError";
    this.targetOrigin = input.targetOrigin;
    this.cause = input.cause;
  }

  static fromCause(targetUrl: string, cause: unknown): PullRequestLinkOpenError {
    const schemeSeparator = targetUrl.indexOf("://");
    const pathStart = schemeSeparator < 0 ? -1 : targetUrl.indexOf("/", schemeSeparator + 3);
    const targetOrigin =
      schemeSeparator < 0 ? null : pathStart < 0 ? targetUrl : targetUrl.slice(0, pathStart);
    return new PullRequestLinkOpenError({ targetOrigin, cause });
  }
}

export async function openPullRequestLink(
  shell: { readonly openExternal: (url: string) => Promise<void> },
  targetUrl: string,
): Promise<void> {
  try {
    await shell.openExternal(targetUrl);
  } catch (cause) {
    throw PullRequestLinkOpenError.fromCause(targetUrl, cause);
  }
}

export function useOpenPrLink() {
  return useCallback((event: LinkActivationEvent | undefined, prUrl: string) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    void openPullRequestLink(clientCapabilities.navigation, prUrl).catch((cause) => {
      console.error("[lynx-sidebar] unable to open pull request link", { cause });
    });
  }, []);
}
