import { useMemo, useState, useCallback } from "@lynx-js/react";
import { isSessionBusy } from "@t3tools/client-runtime/presentation/session";
import type { ActivityEntry, ChatMessage, SessionStatus } from "../bridge";
import { MarkdownRenderer } from "./MarkdownRenderer";

interface MessagesTimelineProps {
  messages: ReadonlyArray<ChatMessage>;
  activities: ReadonlyArray<ActivityEntry>;
  sessionStatus: SessionStatus;
  cwd?: string | undefined;
}

const ACTIVITY_ICONS: Record<string, string> = {
  tool: "🔧",
  info: "ℹ",
  error: "✗",
  approval: "⚠",
};

const ACTIVITY_COLORS: Record<string, string> = {
  tool: "#8b5cf6",
  info: "#6b7280",
  error: "#ef4444",
  approval: "#eab308",
};

function ActivityItem({ activity }: { activity: ActivityEntry }) {
  const [expanded, setExpanded] = useState(false);
  const icon = ACTIVITY_ICONS[activity.tone] ?? "•";
  const color = ACTIVITY_COLORS[activity.tone] ?? "#6b7280";

  const toggle = useCallback(() => setExpanded((v) => !v), []);

  return (
    <view className="activity-item">
      <view className="activity-item__header" bindtap={toggle}>
        <text className="activity-item__icon" style={{ color } as any}>
          {icon}
        </text>
        <text className="activity-item__summary">{activity.summary || activity.kind}</text>
        <text className="activity-item__chevron">{expanded ? "▼" : "▶"}</text>
      </view>
      {expanded ? (
        <view className="activity-item__body">
          <text className="activity-item__meta">Kind: {activity.kind}</text>
          <text className="activity-item__meta">Tone: {activity.tone}</text>
        </view>
      ) : null}
    </view>
  );
}

function MessageBubble({ message, cwd }: { message: ChatMessage; cwd?: string | undefined }) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const hasText = message.text && message.text.trim().length > 0;

  if (isSystem) {
    return (
      <view className="msg msg--system">
        <text className="msg__text msg__text--system">{message.text}</text>
      </view>
    );
  }

  if (isUser) {
    // Reference: group flex-col items-end; bubble max-w-[80%] rounded-2xl
    // bg-secondary (white 4%) p-3; no role label; timestamp on hover only.
    return (
      <view className="msg msg--user">
        <view className="msg__bubble msg__bubble--user">
          <text className="msg__text">{message.text}</text>
        </view>
      </view>
    );
  }

  // Assistant: full-width chat-markdown, no bubble, no label.
  return (
    <view className="msg msg--assistant">
      {hasText ? (
        <MarkdownRenderer text={message.text} streaming={message.streaming} cwd={cwd} />
      ) : message.streaming ? (
        <text className="msg__text msg__text--dim">Thinking…</text>
      ) : null}
    </view>
  );
}

export function MessagesTimeline({
  messages,
  activities,
  sessionStatus,
  cwd,
}: MessagesTimelineProps) {
  // Group activities by their prefix (first part of id before first dash, or turn)
  const activityGroups = useMemo(() => {
    const groups: Array<{ key: string; activities: ActivityEntry[] }> = [];
    for (const a of activities) {
      const last = groups[groups.length - 1];
      // Group consecutive activities
      if (last) {
        last.activities.push(a);
      } else {
        groups.push({ key: a.id, activities: [a] });
      }
    }
    return groups;
  }, [activities]);

  const isEmpty = messages.length === 0;
  const isRunning = isSessionBusy(sessionStatus);

  return (
    <scroll-view scroll-orientation="vertical" className="timeline" sticky-bottom="true">
      {isEmpty ? (
        <view className="timeline__empty">
          <text className="timeline__empty-title">Start a conversation</text>
          <text className="timeline__empty-sub">
            Ask T3 Code to build, explain, or fix something in your project.
          </text>
        </view>
      ) : (
        <view className="timeline__list">
          {messages.map((m) => {
            const isAssistant = m.role === "assistant";
            const isLastAssistant = isAssistant && m === messages[messages.length - 1];
            const showActivities = isLastAssistant && activities.length > 0;

            return (
              <view key={m.id}>
                <MessageBubble message={m} cwd={cwd} />
                {showActivities ? (
                  <view className="timeline__activities">
                    <text className="timeline__activities-label">Work log</text>
                    {activities.map((a) => (
                      <ActivityItem key={a.id} activity={a} />
                    ))}
                  </view>
                ) : null}
              </view>
            );
          })}
          {isRunning ? (
            <view className="timeline__running-indicator">
              <text className="timeline__running-text">● Running</text>
            </view>
          ) : null}
        </view>
      )}
    </scroll-view>
  );
}
