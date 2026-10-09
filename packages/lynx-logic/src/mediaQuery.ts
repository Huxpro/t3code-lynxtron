export const RESPONSIVE_BREAKPOINTS = {
  "2xl": 1536,
  "3xl": 1600,
  "4xl": 2000,
  lg: 1024,
  md: 768,
  sm: 640,
  xl: 1280,
} as const;

export type ResponsiveBreakpoint = keyof typeof RESPONSIVE_BREAKPOINTS;
export type ResponsiveBreakpointQuery =
  | ResponsiveBreakpoint
  | `max-${ResponsiveBreakpoint}`
  | `${ResponsiveBreakpoint}:max-${ResponsiveBreakpoint}`;

export interface MediaQueryInput {
  readonly min?: ResponsiveBreakpoint | number;
  readonly max?: ResponsiveBreakpoint | number;
  readonly pointer?: "coarse" | "fine";
}

export interface ViewportSnapshot {
  readonly width: number;
  readonly height: number;
  readonly pointer: "coarse" | "fine";
  readonly testResize?: boolean;
}

function resolveBreakpoint(value: ResponsiveBreakpoint | number): number {
  return typeof value === "number" ? value : RESPONSIVE_BREAKPOINTS[value];
}

function resolveMin(value: ResponsiveBreakpoint | number): string {
  return `(min-width: ${resolveBreakpoint(value)}px)`;
}

function resolveMax(value: ResponsiveBreakpoint | number): string {
  return `(max-width: ${resolveBreakpoint(value) - 1}px)`;
}

export function normalizeMediaQuery(
  query: ResponsiveBreakpointQuery | MediaQueryInput | (string & {}),
): string {
  if (typeof query !== "string") {
    const parts: string[] = [];
    if (query.min != null) parts.push(resolveMin(query.min));
    if (query.max != null) parts.push(resolveMax(query.max));
    if (query.pointer) parts.push(`(pointer: ${query.pointer})`);
    return parts.length > 0 ? parts.join(" and ") : "(min-width: 0px)";
  }

  if (query.startsWith("(")) return query;

  const parts: string[] = [];
  for (const segment of query.split(":")) {
    if (segment.startsWith("max-")) {
      const breakpoint = segment.slice(4);
      if (breakpoint in RESPONSIVE_BREAKPOINTS) {
        parts.push(resolveMax(breakpoint as ResponsiveBreakpoint));
      }
    } else if (segment in RESPONSIVE_BREAKPOINTS) {
      parts.push(resolveMin(segment as ResponsiveBreakpoint));
    }
  }
  return parts.length > 0 ? parts.join(" and ") : query;
}

function testWidthClause(width: number, clause: string): boolean | null {
  const min = /^\(\s*min-width\s*:\s*(\d+(?:\.\d+)?)px\s*\)$/i.exec(clause);
  if (min) return width >= Number(min[1]);
  const max = /^\(\s*max-width\s*:\s*(\d+(?:\.\d+)?)px\s*\)$/i.exec(clause);
  if (max) return width <= Number(max[1]);
  return null;
}

function testPointerClause(pointer: ViewportSnapshot["pointer"], clause: string): boolean | null {
  const match = /^\(\s*pointer\s*:\s*(coarse|fine)\s*\)$/i.exec(clause);
  return match ? pointer === match[1] : null;
}

export function matchesViewportMediaQuery(
  snapshot: ViewportSnapshot,
  query: ResponsiveBreakpointQuery | MediaQueryInput | (string & {}),
): boolean {
  const normalized = normalizeMediaQuery(query);
  return normalized.split(/\s+and\s+/i).every((clause) => {
    const widthMatch = testWidthClause(snapshot.width, clause);
    if (widthMatch !== null) return widthMatch;
    const pointerMatch = testPointerClause(snapshot.pointer, clause);
    return pointerMatch ?? false;
  });
}

export function viewportTier(width: number): ResponsiveBreakpoint | "base" {
  if (width >= RESPONSIVE_BREAKPOINTS["4xl"]) return "4xl";
  if (width >= RESPONSIVE_BREAKPOINTS["3xl"]) return "3xl";
  if (width >= RESPONSIVE_BREAKPOINTS["2xl"]) return "2xl";
  if (width >= RESPONSIVE_BREAKPOINTS.xl) return "xl";
  if (width >= RESPONSIVE_BREAKPOINTS.lg) return "lg";
  if (width >= RESPONSIVE_BREAKPOINTS.md) return "md";
  if (width >= RESPONSIVE_BREAKPOINTS.sm) return "sm";
  return "base";
}
