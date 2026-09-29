import { afterEach, describe, expect, it } from "vite-plus/test";

import { clientCapabilities, setEnvironmentPathsResolveLocally } from "./clientCapabilities.lynx";

describe("Lynx path navigation ownership", () => {
  afterEach(() => setEnvironmentPathsResolveLocally(true));

  it("refuses to open a remote environment's paths on this device", async () => {
    setEnvironmentPathsResolveLocally(false);
    expect(clientCapabilities.navigation.canOpenPath()).toBe(false);
    await expect(clientCapabilities.navigation.openPath("/remote/src/a.ts")).rejects.toThrow(
      "Files in a remote environment cannot be opened on this device.",
    );
  });
});
