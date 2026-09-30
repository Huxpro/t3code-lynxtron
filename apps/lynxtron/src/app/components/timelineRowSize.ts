export type TimelineRowReuseShape =
  | {
      readonly kind: "message";
      readonly role: "assistant" | "system" | "user";
      readonly hasCheckpoint: boolean;
    }
  | {
      /** `grouped`: a one-line entry under an expanded tool-group summary. */
      readonly kind: "work";
      readonly grouped?: boolean;
    }
  | {
      /** `summary`: the one-line tool-group summary, not the "+N previous" toggle. */
      readonly kind: "work-toggle";
      readonly summary?: boolean;
    }
  | {
      readonly kind: "working";
      readonly thinking?: boolean;
    }
  | {
      readonly kind: "proposed-plan" | "turn-fold" | "work-live";
    };

export function timelineRowReuseIdentifier(row: TimelineRowReuseShape): string {
  switch (row.kind) {
    case "message":
      return row.role === "assistant" && row.hasCheckpoint
        ? "message:assistant:checkpoint"
        : `message:${row.role}`;
    case "work":
      return row.grouped ? "work:grouped" : "work";
    case "work-toggle":
      return row.summary ? "work-toggle:summary" : "work-toggle";
    case "working":
      return row.thinking ? "working:thinking" : "working";
    default:
      return row.kind;
  }
}
import {
  reduceTimelineScrollMode,
  type TimelineScrollMode,
} from "@t3tools/client-runtime/presentation/transcript";

export function resolveNativeTimelineScrollUpdate(input: {
  readonly mode: TimelineScrollMode;
  readonly eventSource: number;
  readonly userScrollEventSource: number;
  readonly atEnd: boolean;
  readonly contentFits: boolean;
  readonly jumpToLatestInFlight: boolean;
}): {
  readonly mode: TimelineScrollMode;
  readonly clearAnchor: boolean;
  readonly jumpToLatestInFlight: boolean;
} {
  if (input.contentFits) {
    return { mode: "following-end", clearAnchor: false, jumpToLatestInFlight: false };
  }
  if (input.eventSource !== input.userScrollEventSource) {
    return {
      mode: input.mode,
      clearAnchor: false,
      jumpToLatestInFlight: input.jumpToLatestInFlight,
    };
  }
  if (input.jumpToLatestInFlight) {
    return {
      mode: "following-end",
      clearAnchor: false,
      jumpToLatestInFlight: !input.atEnd,
    };
  }
  return {
    mode: reduceTimelineScrollMode(input.mode, {
      kind: input.atEnd ? "user-scroll-end" : "user-scroll-away",
    }),
    clearAnchor: true,
    jumpToLatestInFlight: false,
  };
}
