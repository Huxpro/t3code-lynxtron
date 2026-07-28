import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { persistSidebarOpenState } from "./sidebarPersistence";

const originalCookieStore = Object.getOwnPropertyDescriptor(globalThis, "cookieStore");

afterEach(() => {
  if (originalCookieStore) {
    Object.defineProperty(globalThis, "cookieStore", originalCookieStore);
  } else {
    Reflect.deleteProperty(globalThis, "cookieStore");
  }
});

describe("persistSidebarOpenState", () => {
  it("is a no-op when Cookie Store is unavailable", async () => {
    Reflect.deleteProperty(globalThis, "cookieStore");

    await expect(
      persistSidebarOpenState({ expiresAt: 1, name: "sidebar", open: true }),
    ).resolves.toBeUndefined();
  });

  it("keeps persistence best-effort when a custom protocol rejects the write", async () => {
    Object.defineProperty(globalThis, "cookieStore", {
      configurable: true,
      value: { set: vi.fn().mockRejectedValue(new DOMException("unsupported")) },
    });

    await expect(
      persistSidebarOpenState({ expiresAt: 1, name: "sidebar", open: false }),
    ).resolves.toBeUndefined();
  });
});
