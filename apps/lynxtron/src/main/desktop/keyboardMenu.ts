import type {
  KeyboardPacketPlatform,
  RendererNeutralKeyboardPacket,
} from "@t3tools/shared/keyboard";

export const T3_KEYBOARD_EVENT = "t3:keyboard";

export interface DiscreteKeyboardAccelerator {
  readonly id:
    | "dismiss-overlay"
    | "terminal-submit"
    | "file-picker"
    | "new-thread"
    | "quick-switch"
    | "open-settings"
    | "toggle-sidebar"
    | `thread-jump-${number}`;
  readonly label: string;
  readonly accelerator: string;
  readonly key: string;
  readonly code: string;
  readonly shift: boolean;
  readonly menu: "app" | "file" | "view";
  readonly usesCommandModifier?: boolean;
  readonly visible?: boolean;
  readonly acceleratorWorksWhenHidden?: boolean;
  readonly enabled?: boolean;
}

export const DISCRETE_KEYBOARD_ACCELERATORS: ReadonlyArray<DiscreteKeyboardAccelerator> = [
  {
    id: "terminal-submit",
    label: "Run Terminal Command",
    accelerator: "Return",
    key: "Enter",
    code: "Enter",
    shift: false,
    menu: "app",
    usesCommandModifier: false,
    visible: false,
    acceleratorWorksWhenHidden: true,
    enabled: false,
  },
  {
    id: "dismiss-overlay",
    label: "Dismiss Overlay",
    accelerator: "Esc",
    key: "Escape",
    code: "Escape",
    shift: false,
    menu: "app",
    usesCommandModifier: false,
    visible: false,
    acceleratorWorksWhenHidden: true,
  },
  {
    id: "open-settings",
    label: "Settings…",
    accelerator: "CommandOrControl+,",
    key: ",",
    code: "Comma",
    shift: false,
    menu: "app",
  },
  {
    id: "new-thread",
    label: "New Thread",
    accelerator: "CommandOrControl+N",
    key: "n",
    code: "KeyN",
    shift: false,
    menu: "file",
  },
  {
    id: "quick-switch",
    label: "Quick Switch",
    accelerator: "CommandOrControl+K",
    key: "k",
    code: "KeyK",
    shift: false,
    menu: "view",
  },
  {
    id: "file-picker",
    label: "Go to File",
    accelerator: "CommandOrControl+P",
    key: "p",
    code: "KeyP",
    shift: false,
    menu: "view",
  },
  {
    id: "toggle-sidebar",
    label: "Toggle Sidebar",
    accelerator: "CommandOrControl+B",
    key: "b",
    code: "KeyB",
    shift: false,
    menu: "view",
  },
  ...Array.from({ length: 9 }, (_, index) => ({
    id: `thread-jump-${index + 1}` as const,
    label: `Jump to Thread ${index + 1}`,
    accelerator: `CommandOrControl+${index + 1}`,
    key: String(index + 1),
    code: `Digit${index + 1}`,
    shift: false,
    menu: "view" as const,
    visible: false,
    acceleratorWorksWhenHidden: true,
  })),
];

export function keyboardPacketPlatformForProcess(platform: string): KeyboardPacketPlatform {
  if (platform === "darwin") return "darwin";
  if (platform === "win32") return "win32";
  return "linux";
}

export function createDiscreteKeyboardPacket(input: {
  readonly accelerator: DiscreteKeyboardAccelerator;
  readonly platform: string;
  readonly sequence: number;
  readonly type?: "keydown" | "keyup";
}): RendererNeutralKeyboardPacket {
  const mac = input.platform === "darwin";
  const usesCommandModifier = input.accelerator.usesCommandModifier !== false;
  return {
    type: input.type ?? "keydown",
    key: input.accelerator.key,
    code: input.accelerator.code,
    modifiers: {
      meta: input.type === "keyup" ? false : usesCommandModifier && mac,
      ctrl: input.type === "keyup" ? false : usesCommandModifier && !mac,
      shift: input.type === "keyup" ? false : input.accelerator.shift,
      alt: false,
    },
    repeat: false,
    source: {
      kind: "lynxtron-menu",
      platform: keyboardPacketPlatformForProcess(input.platform),
    },
    sequence: input.sequence,
  };
}
