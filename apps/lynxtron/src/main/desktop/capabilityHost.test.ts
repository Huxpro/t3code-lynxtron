import { describe, expect, it, vi } from "vite-plus/test";

import { T3_CLIPBOARD_WRITE_TEXT_METHOD, T3_CONFIRM_METHOD } from "../../shared/capabilityProtocol";
import {
  createProbeConfirm,
  startClipboardCapabilityHost,
  startConfirmCapabilityHost,
} from "./capabilityHost";

describe("startClipboardCapabilityHost", () => {
  it("registers the typed clipboard handler and disposes it", () => {
    let handler: ((params: unknown) => void) | undefined;
    const removeHandler = vi.fn();
    const writeText = vi.fn();
    const host = startClipboardCapabilityHost(
      {
        handle(method, nextHandler) {
          expect(method).toBe(T3_CLIPBOARD_WRITE_TEXT_METHOD);
          handler = nextHandler;
        },
        removeHandler,
      },
      writeText,
    );

    handler?.({ value: "first line\nsecond line" });
    expect(writeText).toHaveBeenCalledWith("first line\nsecond line");

    host.dispose();
    expect(removeHandler).toHaveBeenCalledWith(T3_CLIPBOARD_WRITE_TEXT_METHOD);
  });

  it("rejects malformed clipboard payloads", () => {
    let handler: ((params: unknown) => void) | undefined;
    const host = startClipboardCapabilityHost(
      {
        handle(_method, nextHandler) {
          handler = nextHandler;
        },
        removeHandler() {},
      },
      vi.fn(),
    );

    expect(() => handler?.({ value: 42 })).toThrow("Clipboard text must be a string.");
    host.dispose();
  });
});

describe("startConfirmCapabilityHost", () => {
  it("validates the request and returns the native confirmation result", async () => {
    let handler: ((params: unknown) => unknown) | undefined;
    const confirm = vi.fn().mockResolvedValue(true);
    const removeHandler = vi.fn();
    const host = startConfirmCapabilityHost(
      {
        handle(method, nextHandler) {
          expect(method).toBe(T3_CONFIRM_METHOD);
          handler = nextHandler;
        },
        removeHandler,
      },
      confirm,
    );

    await expect(
      handler?.({
        message: "Revert this thread?",
        detail: "Cannot be undone.",
        confirmLabel: "Revert",
      }),
    ).resolves.toBe(true);
    expect(confirm).toHaveBeenCalledWith({
      message: "Revert this thread?",
      detail: "Cannot be undone.",
      confirmLabel: "Revert",
    });
    expect(() => handler?.({ message: "" })).toThrow("Confirm request requires a message.");

    host.dispose();
    expect(removeHandler).toHaveBeenCalledWith(T3_CONFIRM_METHOD);
  });
});

describe("createProbeConfirm", () => {
  it("answers from the queue, logs each prompt, and cancels once exhausted", async () => {
    const lines: string[] = [];
    const confirm = createProbeConfirm("cancel, confirm", (line) => lines.push(line));
    const input = { message: "Revert?", detail: "Cannot be undone.", confirmLabel: "Revert" };

    expect(await confirm(input)).toBe(false);
    expect(await confirm(input)).toBe(true);
    expect(await confirm(input)).toBe(false);
    expect(lines[1]).toBe(`[confirm-probe] ${JSON.stringify({ ...input, answer: "confirm" })}`);
  });
});
