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
