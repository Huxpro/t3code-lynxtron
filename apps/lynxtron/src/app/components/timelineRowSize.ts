export type TimelineRowReuseShape =
  | {
      readonly kind: "message";
      readonly role: "assistant" | "system" | "user";
      readonly hasCheckpoint: boolean;
    }
  | {
      readonly kind: "proposed-plan" | "turn-fold" | "work" | "work-toggle" | "working";
    };

export function timelineRowReuseIdentifier(row: TimelineRowReuseShape): string {
  if (row.kind !== "message") return row.kind;
  return row.role === "assistant" && row.hasCheckpoint
    ? "message:assistant:checkpoint"
    : `message:${row.role}`;
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
