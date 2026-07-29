import {
  ArchiveIcon,
  ArrowLeftIcon,
  BotIcon,
  FlaskConicalIcon,
  GitBranchIcon,
  KeyboardIcon,
  Link2Icon,
  PaletteIcon,
  Settings2Icon,
} from "lucide-react";

import type { SettingsNavigationItem, SettingsSectionPath } from "./SettingsNavigationContent";

const ICONS = {
  archive: ArchiveIcon,
  bot: BotIcon,
  "flask-conical": FlaskConicalIcon,
  "git-branch": GitBranchIcon,
  keyboard: KeyboardIcon,
  "link-2": Link2Icon,
  palette: PaletteIcon,
  "settings-2": Settings2Icon,
} as const;

export function SettingsNavigationHost({
  items,
  onBack,
  onNavigate,
  pathname,
}: {
  readonly items: ReadonlyArray<SettingsNavigationItem>;
  readonly onBack: () => void;
  readonly onNavigate: (to: SettingsSectionPath) => void;
  readonly pathname: string;
}) {
  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden px-2 py-3">
        <nav className="flex flex-col gap-1">
          {items.map((item) => {
            const Icon = ICONS[item.icon];
            const isActive = pathname === item.to;
            return (
              <button
                type="button"
                key={item.to}
                className={
                  isActive
                    ? "flex h-8 items-center gap-2 rounded-md bg-sidebar-row-active px-2 py-1.5 text-left text-sm font-medium text-sidebar-foreground"
                    : "flex h-8 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium text-sidebar-muted-foreground/80 hover:bg-sidebar-row-hover hover:text-sidebar-foreground"
                }
                onClick={() => onNavigate(item.to)}
              >
                <Icon
                  className={
                    isActive
                      ? "size-4 shrink-0 text-sidebar-foreground"
                      : "size-4 shrink-0 text-sidebar-muted-foreground/60"
                  }
                />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
      <div className="p-2">
        <button
          type="button"
          className="flex h-8 w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-sidebar-muted-foreground/80 hover:bg-sidebar-row-hover hover:text-sidebar-foreground"
          onClick={onBack}
        >
          <ArrowLeftIcon className="size-4" />
          <span>Back</span>
        </button>
      </div>
    </>
  );
}
