import type { ConnectionStatus, SessionStatus } from "../bridge";
import { ChatHeaderSurface } from "../../../../web/src/components/chat/ChatHeaderSurface";
import { Icon, type IconName } from "./Icon";

interface ChatHeaderProps {
  projectName: string;
  threadTitle: string;
  sessionStatus: SessionStatus;
  connectionStatus: ConnectionStatus;
  statusDetail?: string;
  rightPanelOpen?: boolean;
  onToggleRightPanel?: () => void;
}

// An outline action button with optional split chevron (matches the original
// Add action / Open / Commit & push group controls).
function ActionButton({
  icon,
  label,
  chevron,
}: {
  icon: IconName;
  label?: string;
  chevron?: boolean;
}) {
  return (
    <view className="action-btn">
      <Icon name={icon} size={14} color="#a1a1aa" className="action-btn__icon-img" />
      {label ? <text className="action-btn__label">{label}</text> : null}
      {chevron ? (
        <>
          <view className="action-btn__divider" />
          <Icon name="chevron-down" size={14} color="#a1a1aa" className="action-btn__chevron-img" />
        </>
      ) : null}
    </view>
  );
}

export function ChatHeader({
  projectName,
  threadTitle,
  connectionStatus,
  rightPanelOpen,
  onToggleRightPanel,
}: ChatHeaderProps) {
  return (
    <view className="chat-header-reference topbar" data-chat-header>
      <ChatHeaderSurface
        activeProjectName={projectName}
        activeThreadTitle={threadTitle}
        projectIcon={
          <view className="chat-header-project-icon-reference topbar__proj-icon">
            <text className="topbar__proj-icon-text">T3</text>
          </view>
        }
        rightPanelOpen={rightPanelOpen ?? false}
        actions={
          <>
            <ActionButton icon="plus" label="Add action" chevron />
            <ActionButton icon="folder" label="Open" chevron />
            <ActionButton icon="git-commit-horizontal" label="Commit" chevron />
            <view className="topbar__toggle">
              <Icon
                name="panel-bottom"
                size={14}
                color="#f5f5f5"
                className="topbar__toggle-icon-img"
              />
            </view>
            <view
              className={`topbar__toggle${rightPanelOpen ? " topbar__toggle--active" : ""}`}
              bindtap={onToggleRightPanel}
            >
              <Icon
                name="panel-right"
                size={14}
                color="#f5f5f5"
                className="topbar__toggle-icon-img"
              />
            </view>
          </>
        }
      />
    </view>
  );
}
