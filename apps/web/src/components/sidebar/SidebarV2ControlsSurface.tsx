import {
  ChevronDownIcon,
  FolderIcon,
  FolderPlusIcon,
  PlusIcon,
  SearchIcon,
  SquarePenIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { CommandDialogTrigger } from "../ui/command";
import { HostButton, HostText, HostView } from "../ui/hostElements";
import { Kbd } from "../ui/kbd";
import { Menu, MenuPopup, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "../ui/menu";
import { SidebarGroup, SidebarMenuButton } from "../ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

type HostButtonProps = Parameters<typeof HostButton>[0];

export interface SidebarV2ProjectScopeOption {
  readonly scopeKey: string;
  readonly displayName: string;
  readonly favicon: ReactNode;
  /** Web-only trailing project-actions control; Lynx passes null. */
  readonly actions?: ReactNode;
}

export interface SidebarV2ControlsSurfaceProps {
  readonly commandPaletteShortcutLabel: string | null;
  /** Web may provide its inline thread-search control; Lynx keeps the bounded Quick Switch trigger. */
  readonly searchControl?: ReactNode;
  readonly newThreadShortcutLabel: string | null;
  readonly newThreadDisabled: boolean;
  /**
   * Explicit search activation for hosts whose CommandDialogTrigger leaf does
   * not wire opening itself (Lynx). Web omits this and keeps the Base UI
   * dialog trigger behavior.
   */
  readonly onSearchClick?: HostButtonProps["onClick"];
  readonly onNewThreadClick: HostButtonProps["onClick"];
  readonly projectScopeOptions: readonly SidebarV2ProjectScopeOption[];
  readonly projectScopeKey: string | null;
  readonly onProjectScopeKeyChange: (scopeKey: string | null) => void;
  readonly projectScopeMenuOpen: boolean;
  readonly onProjectScopeMenuOpenChange: (open: boolean) => void;
  readonly projectScopeControlWidth?: number;
  readonly scopedFavicon: ReactNode | null;
  readonly scopedDisplayName: string | null;
  readonly onNewProjectClick: HostButtonProps["onClick"];
  readonly searchVisual?: ReactNode;
  readonly projectScopeVisual?: ReactNode;
}

/**
 * Renderer-neutral Sidebar V2 top-control anatomy: the Search / New-thread
 * row and the project-scope / New-project row. The host wrapper owns scope
 * state, navigation, and rich project actions; this module owns the shared
 * structure, copy, and classes compiled by both Web and Lynx.
 */
export function SidebarV2ControlsSurface(props: SidebarV2ControlsSurfaceProps) {
  return (
    <>
      <SidebarGroup className="px-2 pb-2 pt-3">
        <HostView
          className={`flex items-center gap-1${props.searchVisual ? " sidebar-v2-control-row--authority" : ""}`}
        >
          {props.searchVisual}
          {props.searchControl ?? (
            <HostView className="min-w-0 flex-1">
              <CommandDialogTrigger
                render={
                  <SidebarMenuButton
                    size="sm"
                    type="button"
                    aria-label="Search threads and commands"
                    className="sidebar-v2-search h-8 gap-2 rounded-md border-0 bg-transparent px-2 py-1.5 text-sm font-medium text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
                    data-testid="command-palette-trigger"
                    render={<HostButton onClick={props.onSearchClick} />}
                  />
                }
              >
                <SearchIcon className="size-4 shrink-0 text-sidebar-muted-foreground/80" />
                <HostView className="sidebar-v2-search-label flex-1 truncate text-left">
                  Search
                </HostView>
                {props.commandPaletteShortcutLabel ? (
                  <Kbd className="h-4 min-w-0 rounded-sm bg-sidebar-control-surface px-1.5 text-[10px] text-sidebar-muted-foreground ring-1 ring-sidebar-border">
                    {props.commandPaletteShortcutLabel}
                  </Kbd>
                ) : null}
              </CommandDialogTrigger>
            </HostView>
          )}
          <HostView className="shrink-0">
            <Tooltip>
              <TooltipTrigger
                render={
                  <SidebarMenuButton
                    size="sm"
                    type="button"
                    className="sidebar-v2-new-thread relative size-8 justify-center rounded-md border-0 bg-transparent p-0 text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
                    disabled={props.newThreadDisabled}
                    aria-label="New thread"
                    render={<HostButton onClick={props.onNewThreadClick} />}
                  />
                }
              >
                <SquarePenIcon className="size-4 shrink-0 text-sidebar-muted-foreground/80" />
                <HostText
                  className="pointer-events-none absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-1/2 pointer-fine:hidden"
                  aria-hidden="true"
                />
              </TooltipTrigger>
              <TooltipPopup side="right">
                {props.newThreadShortcutLabel
                  ? `New thread (${props.newThreadShortcutLabel})`
                  : "New thread"}
              </TooltipPopup>
            </Tooltip>
          </HostView>
        </HostView>
      </SidebarGroup>
      {props.projectScopeOptions.length > 0 ? (
        <SidebarGroup className="px-2 pb-2 pt-0">
          <HostView
            className={`flex items-center gap-1${props.projectScopeVisual ? " sidebar-v2-control-row--authority" : ""}`}
          >
            {props.projectScopeVisual}
            <HostView
              className={`sidebar-v2-project-scope-host relative min-w-0 flex-1${
                props.projectScopeMenuOpen ? " sidebar-v2-project-scope-host--open" : ""
              }`}
              {...(props.projectScopeControlWidth === undefined
                ? {}
                : {
                    style: {
                      width: `${props.projectScopeControlWidth}px`,
                      minWidth: `${props.projectScopeControlWidth}px`,
                      maxWidth: `${props.projectScopeControlWidth}px`,
                    },
                  })}
            >
              <Menu
                open={props.projectScopeMenuOpen}
                onOpenChange={props.onProjectScopeMenuOpenChange}
              >
                <MenuTrigger
                  aria-label="Filter threads by project"
                  data-testid="sidebar-v2-project-scope-trigger"
                  className="sidebar-v2-project-scope-trigger flex h-8 w-full min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 text-left text-sm font-medium text-sidebar-muted-foreground outline-none hover:bg-sidebar-row-hover hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
                >
                  {props.scopedFavicon ?? (
                    <FolderIcon className="size-4 shrink-0 text-sidebar-muted-foreground/80" />
                  )}
                  <HostText className="min-w-0 flex-1 truncate">
                    {props.scopedDisplayName ?? "All projects"}
                  </HostText>
                  <ChevronDownIcon className="size-4 shrink-0 text-sidebar-muted-foreground/70" />
                </MenuTrigger>
                <MenuPopup
                  align="start"
                  relationId="sidebar-project-scope"
                  side="bottom"
                  sideOffset={4}
                  className="w-(--anchor-width) sidebar-v2-scope-popup"
                  {...(props.projectScopeControlWidth === undefined
                    ? {}
                    : {
                        style: {
                          width: `${props.projectScopeControlWidth}px`,
                          height: `${(props.projectScopeOptions.length + 1) * 32 + 8}px`,
                          minHeight: `${(props.projectScopeOptions.length + 1) * 32 + 8}px`,
                        },
                      })}
                >
                  <MenuRadioGroup
                    value={props.projectScopeKey ?? "all"}
                    onValueChange={(value) =>
                      props.onProjectScopeKeyChange(value === "all" ? null : (value as string))
                    }
                  >
                    <MenuRadioItem
                      value="all"
                      closeOnClick
                      className="sidebar-v2-scope-option--all h-8 min-h-8 px-1 py-0 text-sm font-medium [&>span:last-child]:flex [&>span:last-child]:min-w-0 [&>span:last-child]:items-center [&>span:last-child]:gap-2"
                    >
                      <FolderIcon className="size-4 shrink-0" />
                      <HostText className="min-w-0 truncate text-sm">All projects</HostText>
                    </MenuRadioItem>
                    {props.projectScopeOptions.map((option) => (
                      <MenuRadioItem
                        key={option.scopeKey}
                        value={option.scopeKey}
                        closeOnClick
                        data-sidebar-project-scope-option={option.scopeKey}
                        className="sidebar-v2-scope-option h-8 min-h-8 px-1 py-0 text-sm font-medium [&>span:last-child]:flex [&>span:last-child]:min-w-0 [&>span:last-child]:items-center [&>span:last-child]:gap-2"
                      >
                        {option.favicon}
                        <HostText className="min-w-0 truncate text-sm">
                          {option.displayName}
                        </HostText>
                        {option.actions ?? null}
                      </MenuRadioItem>
                    ))}
                  </MenuRadioGroup>
                </MenuPopup>
              </Menu>
            </HostView>
            <Tooltip>
              <TooltipTrigger
                render={
                  <SidebarMenuButton
                    size="sm"
                    className="sidebar-v2-new-project relative size-8 shrink-0 justify-center rounded-md bg-transparent p-0 text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
                    type="button"
                    aria-label="New project"
                    render={<HostButton onClick={props.onNewProjectClick} />}
                  />
                }
              >
                <FolderPlusIcon className="size-4 shrink-0 text-sidebar-muted-foreground/80" />
                <HostText
                  className="pointer-events-none absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-1/2 pointer-fine:hidden"
                  aria-hidden="true"
                />
              </TooltipTrigger>
              <TooltipPopup side="right">New project</TooltipPopup>
            </Tooltip>
          </HostView>
        </SidebarGroup>
      ) : null}
    </>
  );
}

export function SidebarV2EmptyStateSurface(props: {
  readonly hasProjects: boolean;
  readonly scopedDisplayName: string | null;
  readonly onAddProjectClick: HostButtonProps["onClick"];
}) {
  return (
    <HostView className="flex flex-col items-center gap-2 px-2 py-6 text-center text-xs text-muted-foreground/60">
      {!props.hasProjects ? (
        <>
          <HostText>No projects yet</HostText>
          <HostButton
            type="button"
            onClick={props.onAddProjectClick}
            className="inline-flex items-center gap-1.5 rounded-md border border-sidebar-border px-2.5 py-1 text-[11px] font-medium text-sidebar-muted-foreground transition-colors hover:bg-sidebar-row-hover hover:text-sidebar-foreground"
          >
            <PlusIcon className="size-3" />
            Add project
          </HostButton>
        </>
      ) : props.scopedDisplayName ? (
        <HostText>{`No threads in ${props.scopedDisplayName} yet`}</HostText>
      ) : (
        <HostText>No threads yet</HostText>
      )}
    </HostView>
  );
}
