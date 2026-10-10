import type { ComponentType } from "@lynx-js/react";

import { Icon, type IconName } from "./components/Icon";

type LucideProps = {
  readonly className?: string;
  readonly color?: string;
  readonly size?: number | string;
};

function createIcon(name: IconName): ComponentType<LucideProps> {
  return function LynxLucideIcon({ className, color, size }: LucideProps) {
    const sidebarSettings = name === "settings" && className?.includes("sidebar-settings-icon");
    const resolvedSize = typeof size === "number" ? size : sidebarSettings ? 18 : 16;
    return (
      <Icon
        // lucide-react names each icon in a class; a rule can find the icon by it.
        className={className ? `lucide-${name} ${className}` : `lucide-${name}`}
        color={sidebarSettings ? "#818181" : color}
        name={name}
        size={resolvedSize}
      />
    );
  };
}

export const ArchiveIcon = createIcon("archive");
export const ArrowDownIcon = createIcon("arrow-up");
export const ArrowLeftIcon = createIcon("arrow-left");
export const ChartNoAxesColumnIcon = createIcon("chart-no-axes-column");
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
export const FolderIcon = createIcon("folder");
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
export const PaletteIcon = createIcon("palette");
export const SettingsIcon = createIcon("settings");
export const SquarePenIcon = createIcon("square-pen");
export const StarIcon = createIcon("message-square");
export const TerminalIcon = createIcon("panel-bottom");
export const Trash2Icon = createIcon("trash-2");
export const TriangleAlertIcon = createIcon("triangle-alert");
export const Undo2Icon = createIcon("rotate-ccw");
export const XIcon = createIcon("square");
