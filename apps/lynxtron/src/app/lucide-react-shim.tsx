import type { ComponentType } from "@lynx-js/react";

import { Icon, type IconName } from "./components/Icon";

type LucideProps = {
  readonly className?: string;
  readonly color?: string;
  readonly size?: number | string;
};

function createIcon(name: IconName): ComponentType<LucideProps> {
  return function LynxLucideIcon({ className, color, size }: LucideProps) {
    return (
      <Icon
        className={className}
        color={color}
        name={name}
        size={typeof size === "number" ? size : 16}
      />
    );
  };
}

export const ArchiveIcon = createIcon("archive");
export const ArrowDownIcon = createIcon("arrow-up");
export const ArrowLeftIcon = createIcon("arrow-left");
export const ArrowUpDownIcon = createIcon("arrow-up-down");
export const ArrowUpIcon = createIcon("arrow-up");
export const BotIcon = createIcon("bot");
export const CheckIcon = createIcon("square");
export const ChevronDownIcon = createIcon("chevron-down");
export const ChevronRightIcon = createIcon("chevron-right");
export const CircleCheckIcon = createIcon("square");
export const CloudIcon = createIcon("cloud-upload");
export const ContainerIcon = createIcon("folder");
export const DownloadIcon = createIcon("arrow-up");
export const EllipsisIcon = createIcon("ellipsis");
export const FileJsonIcon = createIcon("file-json");
export const FlaskConicalIcon = createIcon("flask-conical");
export const FolderOpenIcon = createIcon("folder");
export const FolderPlusIcon = createIcon("plus");
export const GitBranchIcon = createIcon("git-branch");
export const GitPullRequestIcon = createIcon("git-branch");
export const Globe2Icon = createIcon("link-2");
export const InfoIcon = createIcon("message-square");
export const KeyboardIcon = createIcon("keyboard");
export const Link2Icon = createIcon("link-2");
export const LoaderIcon = createIcon("refresh-cw");
export const MinusIcon = createIcon("square");
export const PanelLeftCloseIcon = createIcon("panel-left");
export const PanelLeftIcon = createIcon("panel-left");
export const PipetteIcon = createIcon("pencil-line");
export const PlusIcon = createIcon("plus");
export const RefreshCwIcon = createIcon("refresh-cw");
export const RotateCcwIcon = createIcon("rotate-ccw");
export const RotateCwIcon = createIcon("refresh-cw");
export const SearchIcon = createIcon("search");
export const Settings2Icon = createIcon("settings-2");
export const SettingsIcon = createIcon("settings");
export const SquarePenIcon = createIcon("square-pen");
export const StarIcon = createIcon("message-square");
export const TerminalIcon = createIcon("panel-bottom");
export const Trash2Icon = createIcon("trash-2");
export const TriangleAlertIcon = createIcon("triangle-alert");
export const Undo2Icon = createIcon("rotate-ccw");
export const XIcon = createIcon("square");
