import type {
  KeybindingCommand,
  KeybindingWhenNode,
  ResolvedKeybindingsConfig,
} from "@t3tools/contracts";

export type KeyboardPacketPlatform = "darwin" | "linux" | "win32";

export interface RendererNeutralKeyboardPacket {
  readonly type: "keydown" | "keyup";
  readonly key: string;
  readonly code: string;
  readonly modifiers: {
    readonly meta: boolean;
    readonly ctrl: boolean;
    readonly shift: boolean;
    readonly alt: boolean;
  };
  readonly repeat: boolean;
  readonly source: {
    readonly kind: "lynxtron-menu";
    readonly platform: KeyboardPacketPlatform;
  };
  readonly sequence: number;
}

export interface RendererNeutralKeyboardEventLike {
  readonly type?: string;
  readonly key: string;
  readonly code?: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
}

export interface RendererNeutralShortcutContext {
  readonly terminalFocus: boolean;
  readonly terminalOpen: boolean;
  readonly previewFocus: boolean;
  readonly previewOpen: boolean;
  readonly [key: string]: boolean;
}

export interface RendererNeutralShortcutMatchOptions {
  readonly platform: string;
  readonly context?: Partial<RendererNeutralShortcutContext>;
}

const EVENT_CODE_KEY_ALIASES: Readonly<Record<string, readonly string[]>> = {
  BracketLeft: ["["],
  BracketRight: ["]"],
  Digit0: ["0"],
  Digit1: ["1"],
  Digit2: ["2"],
  Digit3: ["3"],
  Digit4: ["4"],
  Digit5: ["5"],
  Digit6: ["6"],
  Digit7: ["7"],
  Digit8: ["8"],
  Digit9: ["9"],
};

function isBooleanRecord(value: unknown): value is Record<string, boolean> {
  return typeof value === "object" && value !== null;
}

export function isRendererNeutralKeyboardPacket(
  value: unknown,
): value is RendererNeutralKeyboardPacket {
  if (typeof value !== "object" || value === null) return false;
  const packet = value as Partial<RendererNeutralKeyboardPacket>;
  const source = packet.source as Partial<RendererNeutralKeyboardPacket["source"]> | undefined;
  return (
    (packet.type === "keydown" || packet.type === "keyup") &&
    typeof packet.key === "string" &&
    typeof packet.code === "string" &&
    isBooleanRecord(packet.modifiers) &&
    typeof packet.modifiers.meta === "boolean" &&
    typeof packet.modifiers.ctrl === "boolean" &&
    typeof packet.modifiers.shift === "boolean" &&
    typeof packet.modifiers.alt === "boolean" &&
    typeof packet.repeat === "boolean" &&
    source?.kind === "lynxtron-menu" &&
    (source.platform === "darwin" || source.platform === "linux" || source.platform === "win32") &&
    Number.isSafeInteger(packet.sequence) &&
    (packet.sequence ?? -1) >= 0
  );
}

export function keyboardPacketToEvent(
  packet: RendererNeutralKeyboardPacket,
): RendererNeutralKeyboardEventLike {
  return {
    type: packet.type,
    key: packet.key,
    code: packet.code,
    metaKey: packet.modifiers.meta,
    ctrlKey: packet.modifiers.ctrl,
    shiftKey: packet.modifiers.shift,
    altKey: packet.modifiers.alt,
  };
}

export function keyboardPacketPlatform(packet: RendererNeutralKeyboardPacket): string {
  switch (packet.source.platform) {
    case "darwin":
      return "MacIntel";
    case "win32":
      return "Win32";
    case "linux":
      return "Linux";
  }
}

function normalizeEventKey(key: string): string {
  const normalized = key.toLowerCase();
  return normalized === "esc" ? "escape" : normalized;
}

function resolveEventKeys(event: RendererNeutralKeyboardEventLike): Set<string> {
  const layoutKey = normalizeEventKey(event.key);
  const keys = new Set([layoutKey]);
  // The physical-position fallback exists for layouts that type non-Latin
  // letters and for Option-modified symbols on macOS. When the layout already
  // produces a Latin letter, match on it alone so a remapped physical key does
  // not trigger shortcuts for two letters at once.
  const letterCode = event.code?.match(/^Key([A-Z])$/)?.[1];
  if (letterCode && !/^[a-z]$/.test(layoutKey)) keys.add(letterCode.toLowerCase());
  const aliases = event.code ? EVENT_CODE_KEY_ALIASES[event.code] : undefined;
  for (const alias of aliases ?? []) keys.add(alias);
  return keys;
}

function evaluateWhenNode(
  node: KeybindingWhenNode,
  context: RendererNeutralShortcutContext,
): boolean {
  switch (node.type) {
    case "identifier":
      if (node.name === "true") return true;
      if (node.name === "false") return false;
      return Boolean(context[node.name]);
    case "not":
      return !evaluateWhenNode(node.node, context);
    case "and":
      return evaluateWhenNode(node.left, context) && evaluateWhenNode(node.right, context);
    case "or":
      return evaluateWhenNode(node.left, context) || evaluateWhenNode(node.right, context);
  }
}

export function resolveRendererNeutralShortcutCommand(
  event: RendererNeutralKeyboardEventLike,
  keybindings: ResolvedKeybindingsConfig,
  options: RendererNeutralShortcutMatchOptions,
): KeybindingCommand | null {
  const isMac = options.platform.toLowerCase().includes("mac");
  const context: RendererNeutralShortcutContext = {
    terminalFocus: false,
    terminalOpen: false,
    previewFocus: false,
    previewOpen: false,
    ...options.context,
  };
  const eventKeys = resolveEventKeys(event);

  for (let index = keybindings.length - 1; index >= 0; index -= 1) {
    const binding = keybindings[index];
    if (!binding) continue;
    if (binding.whenAst && !evaluateWhenNode(binding.whenAst, context)) continue;

    const shortcut = binding.shortcut;
    const expectedMeta = shortcut.metaKey || (shortcut.modKey && isMac);
    const expectedCtrl = shortcut.ctrlKey || (shortcut.modKey && !isMac);
    if (
      event.metaKey !== expectedMeta ||
      event.ctrlKey !== expectedCtrl ||
      event.shiftKey !== shortcut.shiftKey ||
      event.altKey !== shortcut.altKey ||
      !eventKeys.has(shortcut.key)
    ) {
      continue;
    }
    return binding.command;
  }
  return null;
}
