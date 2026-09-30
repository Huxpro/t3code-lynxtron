import { T3_HOST_METHODS, type HostReply } from "../../shared/hostProtocol.ts";

export interface HostCapabilityDeps {
  readonly clipboard: { writeText(text: string): void };
  readonly shell: {
    openExternal(url: string): Promise<void>;
    // Resolves to an error message, or "" on success.
    openPath(path: string): Promise<string>;
  };
  readonly registerHandler: (
    method: string,
    handler: (params: unknown) => Promise<HostReply>,
  ) => void;
}

const stringParam = (params: unknown, key: string): string | null => {
  const value = (params as Record<string, unknown> | null)?.[key];
  return typeof value === "string" ? value : null;
};

const failure = (error: unknown): HostReply => ({
  error: error instanceof Error ? error.message : String(error),
});

// Serves the renderer's clipboard and native/external navigation from main.
export function registerHostCapabilities(deps: HostCapabilityDeps): void {
  deps.registerHandler(T3_HOST_METHODS.writeClipboardText, async (params) => {
    const text = stringParam(params, "text");
    if (text === null) return { error: "text is required" };
    deps.clipboard.writeText(text);
    return {};
  });
  deps.registerHandler(T3_HOST_METHODS.openExternal, async (params) => {
    const url = stringParam(params, "url");
    if (url === null) return { error: "url is required" };
    return deps.shell.openExternal(url).then(() => ({}), failure);
  });
  deps.registerHandler(T3_HOST_METHODS.openPath, async (params) => {
    const path = stringParam(params, "path");
    if (path === null) return { error: "path is required" };
    return deps.shell.openPath(path).then((error) => (error ? { error } : {}), failure);
  });
}
