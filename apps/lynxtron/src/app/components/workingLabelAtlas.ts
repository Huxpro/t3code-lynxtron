export interface WorkingLabelGlyph {
  readonly char: string;
  readonly left: number;
  readonly phase: number;
  readonly row: number;
}

export interface WorkingLabelAtlasLayout {
  readonly width: number;
  readonly glyphs: readonly WorkingLabelGlyph[];
}

export interface WorkingLabelFullCell {
  readonly left: number;
  readonly top: number;
}

export const WORKING_LABEL_FULL_ATLAS = {
  startHour: 64,
  hourCount: 8,
  minuteCount: 60,
  columns: 8,
  cellWidth: 120,
  cellHeight: 17,
  width: 960,
  height: 1020,
} as const;

export const WORKING_LABEL_ATLAS = {
  chars: "0123456789hms.",
  phases: 64,
  cellWidth: 12,
  cellHeight: 17,
  prefixRow: 14,
  prefixAdvance: 61.28125,
  single: {
    "0": 7.53125,
    "1": 3.4375,
    "2": 6.34375,
    "3": 6.5078125,
    "4": 6.6796875,
    "5": 6.7109375,
    "6": 6.9140625,
    "7": 5.875,
    "8": 6.6953125,
    "9": 6.9140625,
    h: 6.328125,
    m: 9.8046875,
    s: 5.5234375,
    ".": 2.1796875,
    " ": 2.9296875,
  },
  pairOverrides: {
    "0": {
      "0": 7.5234375,
      "1": 7.5234375,
      "2": 7.40625,
      "3": 7.5234375,
      "4": 7.5234375,
      "5": 7.5234375,
      "6": 7.5234375,
      "7": 7.375,
      "8": 7.5234375,
      "9": 7.5234375,
      h: 7.5234375,
      m: 7.5234375,
      s: 7.5234375,
      ".": 7.0859375,
      " ": 7.5234375,
    },
    "1": {
      "0": 3.4296875,
      "1": 3.4296875,
      "2": 3.4296875,
      "3": 3.4296875,
      "4": 3.4296875,
      "5": 3.4375,
      "6": 3.4296875,
      "7": 3.4375,
      "8": 3.4296875,
      "9": 3.4296875,
      h: 3.4296875,
      m: 3.4296875,
      s: 3.4375,
      ".": 3.4375,
      " ": 3.4296875,
    },
    "2": {
      "0": 6.21875,
      "1": 6.3359375,
      "2": 6.3359375,
      "3": 6.3359375,
      "4": 6.1484375,
      "5": 6.3359375,
      "6": 6.3359375,
      "7": 6.1484375,
      "8": 6.1484375,
      "9": 6.2265625,
      h: 6.3359375,
      m: 6.3359375,
      s: 6.3359375,
      ".": 6.3359375,
      " ": 6.3359375,
    },
    "3": {
      "0": 6.5,
      "1": 6.3125,
      "2": 6.5,
      "3": 6.5,
      "4": 6.5,
      "5": 6.5078125,
      "6": 6.5,
      "7": 6.3203125,
      "8": 6.5,
      "9": 6.1796875,
      h: 6.5,
      m: 6.5,
      s: 6.5,
      ".": 6.5,
      " ": 6.5,
    },
    "4": {
      "0": 6.671875,
      "1": 6.671875,
      "2": 6.671875,
      "3": 6.671875,
      "4": 6.6796875,
      "5": 6.6796875,
      "6": 6.671875,
      "7": 6.6796875,
      "8": 6.671875,
      "9": 6.671875,
      h: 6.6796875,
      m: 6.6796875,
      s: 6.6796875,
      ".": 6.6796875,
      " ": 6.6796875,
    },
    "5": {
      "0": 6.703125,
      "1": 6.7109375,
      "2": 6.515625,
      "3": 6.7109375,
      "4": 6.7109375,
      "5": 6.7109375,
      "6": 6.7109375,
      "7": 6.5234375,
      "8": 6.703125,
      "9": 6.390625,
      h: 6.7109375,
      m: 6.7109375,
      s: 6.7109375,
      ".": 6.7109375,
      " ": 6.7109375,
    },
    "6": {
      "0": 6.90625,
      "1": 6.90625,
      "2": 6.6171875,
      "3": 6.90625,
      "4": 6.90625,
      "5": 6.6875,
      "6": 6.90625,
      "7": 6.625,
      "8": 6.90625,
      "9": 6.6875,
      h: 6.90625,
      m: 6.90625,
      s: 6.9140625,
      ".": 6.484375,
      " ": 6.90625,
    },
    "7": {
      "0": 5.71875,
      "1": 5.9140625,
      "2": 5.5859375,
      "3": 5.5859375,
      "4": 5.2265625,
      "5": 5.5546875,
      "6": 5.5859375,
      "7": 5.875,
      "8": 5.6796875,
      "9": 5.5859375,
      h: 5.875,
      m: 5.5859375,
      s: 5.1796875,
      ".": 5.21875,
      " ": 5.875,
    },
    "8": {
      "0": 6.6875,
      "1": 6.46875,
      "2": 6.5,
      "3": 6.6875,
      "4": 6.6875,
      "5": 6.6875,
      "6": 6.6875,
      "7": 6.40625,
      "8": 6.6875,
      "9": 6.3671875,
      h: 6.6875,
      m: 6.6875,
      s: 6.6875,
      ".": 6.6875,
      " ": 6.6875,
    },
    "9": {
      "0": 6.90625,
      "1": 6.71875,
      "2": 6.71875,
      "3": 6.71875,
      "4": 6.90625,
      "5": 6.9140625,
      "6": 6.90625,
      "7": 6.625,
      "8": 6.71875,
      "9": 6.90625,
      h: 6.90625,
      m: 6.90625,
      s: 6.9140625,
      ".": 6.578125,
      " ": 6.90625,
    },
    h: {
      "0": 6.3203125,
      "1": 6.3203125,
      "2": 6.3203125,
      "3": 6.3203125,
      "4": 6.328125,
      "5": 6.328125,
      "6": 6.3203125,
      "7": 6.328125,
      "8": 6.3203125,
      "9": 6.3203125,
      h: 6.328125,
      m: 6.328125,
      s: 6.328125,
      ".": 6.328125,
      " ": 6.328125,
    },
    m: {
      "0": 9.796875,
      "1": 9.796875,
      "2": 9.796875,
      "3": 9.796875,
      "4": 9.8046875,
      "5": 9.8046875,
      "6": 9.796875,
      "7": 9.8046875,
      "8": 9.796875,
      "9": 9.796875,
      h: 9.8046875,
      m: 9.8046875,
      s: 9.8046875,
      ".": 9.8046875,
      " ": 9.8046875,
    },
    s: {
      "0": 5.515625,
      "1": 5.3359375,
      "2": 5.515625,
      "3": 5.515625,
      "4": 5.5234375,
      "5": 5.5234375,
      "6": 5.5234375,
      "7": 5.0078125,
      "8": 5.515625,
      "9": 5.296875,
      h: 5.5234375,
      m: 5.5234375,
      s: 5.5234375,
      ".": 5.5234375,
      " ": 5.5234375,
    },
    ".": {
      "0": 1.734375,
      "1": 1.921875,
      "2": 2.171875,
      "3": 2.171875,
      "4": 2.1796875,
      "5": 2.1796875,
      "6": 1.84375,
      "7": 1.8515625,
      "8": 2.171875,
      "9": 1.84375,
      h: 2.1796875,
      m: 2.1796875,
      s: 2.1796875,
      ".": 2.1796875,
      " ": 2.1796875,
    },
    " ": {
      "0": 2.921875,
      "1": 2.921875,
      "2": 2.921875,
      "3": 2.921875,
      "4": 2.9296875,
      "5": 2.9296875,
      "6": 2.921875,
      "7": 2.9296875,
      "8": 2.921875,
      "9": 2.921875,
      h: 2.9296875,
      m: 2.9296875,
      s: 2.9296875,
      ".": 2.9296875,
      " ": 2.9296875,
    },
  },
} as const;

type WorkingLabelChar = keyof typeof WORKING_LABEL_ATLAS.single;

function isWorkingLabelChar(value: string): value is WorkingLabelChar {
  return value in WORKING_LABEL_ATLAS.single;
}

function advanceFor(char: WorkingLabelChar, next: string | undefined): number {
  if (!next) return WORKING_LABEL_ATLAS.single[char];
  const overrides = WORKING_LABEL_ATLAS.pairOverrides as Readonly<
    Partial<Record<WorkingLabelChar, Readonly<Partial<Record<WorkingLabelChar, number>>>>>
  >;
  return isWorkingLabelChar(next)
    ? (overrides[char]?.[next] ?? WORKING_LABEL_ATLAS.single[char])
    : WORKING_LABEL_ATLAS.single[char];
}

export function layoutWorkingLabel(elapsedLabel: string): WorkingLabelAtlasLayout | null {
  const chars = Array.from(elapsedLabel);
  if (!chars.every(isWorkingLabelChar)) return null;

  let advance = WORKING_LABEL_ATLAS.prefixAdvance;
  const glyphs: WorkingLabelGlyph[] = [];
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index]!;
    if (char !== " ") {
      const fraction = advance - Math.floor(advance);
      glyphs.push({
        char,
        left: Math.floor(advance),
        phase: Math.round(fraction * WORKING_LABEL_ATLAS.phases) % WORKING_LABEL_ATLAS.phases,
        row: WORKING_LABEL_ATLAS.chars.indexOf(char),
      });
    }
    advance += advanceFor(char, chars[index + 1]);
  }

  return { width: advance, glyphs };
}

export function resolveWorkingLabelFullCell(elapsedLabel: string): WorkingLabelFullCell | null {
  const match = /^(\d+)h (\d+)m$/.exec(elapsedLabel);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (
    hour < WORKING_LABEL_FULL_ATLAS.startHour ||
    hour >= WORKING_LABEL_FULL_ATLAS.startHour + WORKING_LABEL_FULL_ATLAS.hourCount ||
    minute < 0 ||
    minute >= WORKING_LABEL_FULL_ATLAS.minuteCount
  ) {
    return null;
  }
  const index =
    (hour - WORKING_LABEL_FULL_ATLAS.startHour) * WORKING_LABEL_FULL_ATLAS.minuteCount + minute;
  return {
    left: (index % WORKING_LABEL_FULL_ATLAS.columns) * WORKING_LABEL_FULL_ATLAS.cellWidth,
    top: Math.floor(index / WORKING_LABEL_FULL_ATLAS.columns) * WORKING_LABEL_FULL_ATLAS.cellHeight,
  };
}
