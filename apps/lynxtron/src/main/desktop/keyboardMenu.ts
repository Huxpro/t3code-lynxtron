import type {
  KeyboardPacketPlatform,
  RendererNeutralKeyboardPacket,
} from "@t3tools/shared/keyboard";

export const T3_KEYBOARD_EVENT = "t3:keyboard";

export interface DiscreteKeyboardAccelerator {
  readonly id: "new-thread" | "quick-switch" | "open-settings";
  readonly label: string;
  readonly accelerator: string;
  readonly key: string;
  readonly code: string;
  readonly shift: boolean;
  readonly menu: "app" | "file" | "view";
}

export const DISCRETE_KEYBOARD_ACCELERATORS: ReadonlyArray<DiscreteKeyboardAccelerator> = [
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
}): RendererNeutralKeyboardPacket {
  const mac = input.platform === "darwin";
  return {
    type: "keydown",
    key: input.accelerator.key,
    code: input.accelerator.code,
    modifiers: {
      meta: mac,
      ctrl: !mac,
      shift: input.accelerator.shift,
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
