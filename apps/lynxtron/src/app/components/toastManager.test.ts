import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { toastManager } from "../../../../web/src/components/ui/toastStore.lynx";

describe("Lynx toast manager", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("auto-dismisses ordinary toasts and keeps loading toasts until updated", () => {
    vi.useFakeTimers();
    const closeSpy = vi.spyOn(toastManager, "close");
    const success = toastManager.add({ type: "success", title: "Relative path copied" });
    const loading = toastManager.add({ type: "loading", title: "Working" });
    vi.advanceTimersByTime(5_000);
    expect(closeSpy).toHaveBeenCalledWith(success);
    expect(closeSpy).not.toHaveBeenCalledWith(loading);
    toastManager.update(loading, { type: "success", title: "Done" });
    vi.advanceTimersByTime(5_000);
    expect(closeSpy).toHaveBeenCalledWith(loading);
    closeSpy.mockRestore();
  });
});
