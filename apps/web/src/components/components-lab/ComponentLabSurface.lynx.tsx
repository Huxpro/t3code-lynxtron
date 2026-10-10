import catalog from "../../../../lynxtron/src/app/components-lab/catalog.json";
import { PRIMARY_LOCAL_ENVIRONMENT_ID } from "@t3tools/contracts";
import { type ReactNode, useState } from "react";
import { ComponentLabColumn, ComponentLabStack } from "./ComponentLabStack";

import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import {
  Command,
  CommandCollection,
  CommandDialog,
  CommandDialogPopup,
  CommandDialogTrigger,
  CommandEmpty,
  CommandFooter,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPanel,
  CommandSeparator,
  CommandShortcut,
} from "../ui/command";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { DraftInput } from "../ui/draft-input";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../ui/empty";
import {
  HostButton,
  HostHeading,
  HostHeadline,
  HostLayoutView,
  HostList,
  HostListItem,
  HostScrollView,
  HostText,
  HostView,
} from "../ui/hostElements";
import { Input } from "../ui/input";
import { Kbd, KbdGroup } from "../ui/kbd";
import { Label } from "../ui/label";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuShortcut,
  MenuTrigger,
} from "../ui/menu";
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
} from "../ui/number-field";
import { ScrollArea } from "../ui/scroll-area";
import { Popover, PopoverClose, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { Separator } from "../ui/separator";
import {
  Sheet,
  SheetClose,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
  SheetTrigger,
} from "../ui/sheet";
import {
  Select,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Switch } from "../ui/switch";
import {
  SidebarContent,
  SidebarGroup,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "../ui/sidebar";
import { Textarea } from "../ui/textarea";
import { Tooltip, TooltipPopup, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { SettingResetButton, SettingsRow, SettingsSection } from "../settings/settingsLayout";
import { ProjectFavicon } from "../ProjectFavicon";
import { ThreadErrorBannerSurface } from "../chat/ThreadErrorBannerSurface";
import { ChangedFilesCardSurface } from "../chat/ChangedFilesCardSurface";
import { ChatHeaderSurface } from "../chat/ChatHeaderSurface";
import {
  FileTreeChildrenSurface,
  FileTreeDirectoryRowSurface,
  FileTreeFileRowSurface,
} from "../chat/FileTreeSurface";
import {
  ChangeRequestStatusIcon,
  PrStatusTooltipContent,
  ThreadStatusLabel,
  ThreadWorktreeIndicator,
  prStatusIndicator,
} from "../ThreadStatusIndicators";
import { resolveThreadStatusPill } from "../Sidebar.logic";
import {
  SidebarChromeFooterSurface,
  SidebarChromeHeaderSurface,
} from "../sidebar/SidebarChromeSurface";
import { T3Wordmark } from "../T3Wordmark";
import { SidebarUpdatePillSurface } from "../sidebar/SidebarUpdatePillSurface";
import { RightPanelEmptySurface } from "../RightPanelSurface";
import { PaletteEmptySurface } from "../CommandPaletteSurface";
import { ModelPickerEmptySurface } from "../chat/ModelPickerSurface";
import {
  PlanEmptySurface,
  PlanExplanationSurface,
  PlanStepsSurface,
  ProposedPlanSectionSurface,
} from "../PlanSurface";

type StoryId = (typeof catalog)[number]["id"];

function StoryFrame({
  children,
  id,
  title,
}: {
  readonly children: ReactNode;
  readonly id: StoryId;
  readonly title: string;
}) {
  const story = catalog.find((entry) => entry.id === id);
  return (
    <HostView
      className="component-lab-story"
      data-component-states={story?.states.join(",")}
      data-component-story={id}
    >
      <HostView className="component-lab-story__header">
        <HostHeading className="component-lab-story__title">{title}</HostHeading>
        <HostText className="component-lab-story__id">{id}</HostText>
      </HostView>
      <HostView className="component-lab-story__canvas">{children}</HostView>
    </HostView>
  );
}

function StoryLabel({ children }: { readonly children: ReactNode }) {
  return <HostText className="component-lab-specimen__label">{children}</HostText>;
}

function ComponentLabSelectStory() {
  const [value, setValue] = useState("comfortable");
  return (
    <Select value={value} onValueChange={(next) => next !== null && setValue(next)}>
      <SelectTrigger aria-label="Density" data-component-lab-select-trigger="default">
        <SelectValue>{value === "compact" ? "Compact" : "Comfortable"}</SelectValue>
      </SelectTrigger>
      <SelectPopup alignItemWithTrigger={false} data-floating-popup="component-lab-select">
        <SelectGroup>
          <SelectGroupLabel>Density</SelectGroupLabel>
          <SelectItem data-component-lab-select-item="comfortable" value="comfortable">
            Comfortable
          </SelectItem>
          <SelectItem data-component-lab-select-item="compact" value="compact">
            Compact
          </SelectItem>
        </SelectGroup>
      </SelectPopup>
    </Select>
  );
}

function ComponentLabNumberFieldStory() {
  const [value, setValue] = useState(10);
  return (
    <NumberField
      className="w-32"
      data-component-lab-number-field="default"
      max={20}
      min={0}
      onValueChange={(next) => next !== null && setValue(next)}
      step={2}
      value={value}
    >
      <NumberFieldGroup className="source-control-git-number-field">
        <NumberFieldDecrement
          aria-label="Decrease interval"
          className="source-control-git-number-field__stepper"
          data-component-lab-number-action="decrement"
        />
        <NumberFieldInput
          aria-label="Interval seconds"
          className="source-control-git-number-field__input"
          data-component-lab-number-input="value"
        />
        <NumberFieldIncrement
          aria-label="Increase interval"
          className="source-control-git-number-field__stepper"
          data-component-lab-number-action="increment"
        />
      </NumberFieldGroup>
    </NumberField>
  );
}

const scrollAreaRows = ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot"];

function ComponentLabScrollAreaStory() {
  return (
    <ScrollArea className="component-lab-scroll-area">
      <HostView className="component-lab-scroll-area__content">
        {scrollAreaRows.map((label) => (
          <HostText className="component-lab-scroll-area__row" key={label}>
            {label}
          </HostText>
        ))}
      </HostView>
    </ScrollArea>
  );
}

function ComponentLabDialogStory() {
  return (
    <Dialog>
      <DialogTrigger
        data-component-lab-dialog-trigger="default"
        render={<Button variant="outline" />}
      >
        Open dialog
      </DialogTrigger>
      <DialogPopup
        className="component-lab-dialog"
        data-component-lab-dialog-popup="default"
        showCloseButton={false}
      >
        <DialogHeader className="component-lab-dialog__header">
          <DialogTitle className="component-lab-dialog__title">Add environment</DialogTitle>
          <DialogDescription className="component-lab-dialog__description">
            Connect another machine to this T3 Code workspace.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="component-lab-dialog__panel" scrollFade={false}>
          <HostText className="component-lab-host-text">Environment details</HostText>
        </DialogPanel>
        <DialogFooter className="component-lab-dialog__footer" variant="bare">
          <DialogClose
            data-component-lab-dialog-close="default"
            render={<Button variant="outline" />}
          >
            Cancel
          </DialogClose>
          <Button>Continue</Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

function ComponentLabSheetStory() {
  return (
    <Sheet>
      <SheetTrigger
        data-component-lab-sheet-trigger="default"
        render={<Button variant="outline" />}
      >
        Open sheet
      </SheetTrigger>
      <SheetPopup
        className="component-lab-sheet"
        data-component-lab-sheet-popup="default"
        showCloseButton={false}
        side="right"
      >
        <SheetHeader className="component-lab-sheet__header">
          <SheetTitle className="component-lab-sheet__title">Review changes</SheetTitle>
          <SheetDescription className="component-lab-sheet__description">
            Inspect the latest workspace changes.
          </SheetDescription>
        </SheetHeader>
        <SheetPanel className="component-lab-sheet__panel" scrollFade={false}>
          <HostText className="component-lab-host-text">Workspace details</HostText>
        </SheetPanel>
        <SheetFooter className="component-lab-sheet__footer" variant="bare">
          <SheetClose
            data-component-lab-sheet-close="default"
            render={<Button variant="outline" />}
          >
            Done
          </SheetClose>
        </SheetFooter>
      </SheetPopup>
    </Sheet>
  );
}

function ComponentLabPopoverStory() {
  return (
    <Popover>
      <PopoverTrigger
        data-component-lab-popover-trigger="default"
        render={<Button variant="outline" />}
      >
        Open popover
      </PopoverTrigger>
      <PopoverPopup
        align="start"
        className="component-lab-popover"
        data-component-lab-popover-popup="default"
        viewportClassName="component-lab-popover__viewport"
      >
        <HostText className="component-lab-host-text">Popover details</HostText>
        <PopoverClose
          data-component-lab-popover-close="default"
          render={<Button size="sm" variant="outline" />}
        >
          Done
        </PopoverClose>
      </PopoverPopup>
    </Popover>
  );
}

function ComponentLabSettingsStory() {
  const [resetCount, setResetCount] = useState(0);
  return (
    <SettingsSection
      headerAction={
        <HostView className="component-lab-settings-reset">
          <HostText
            className="component-lab-host-text component-lab-host-text--muted"
            data-component-lab-reset-count="value"
          >
            Reset {resetCount}
          </HostText>
          <SettingResetButton
            label="appearance"
            onClick={() => setResetCount((count) => count + 1)}
          />
        </HostView>
      }
      title="Appearance"
    >
      <SettingsRow
        control={<Switch aria-label="Use system theme" checked />}
        description="Choose how T3 Code looks across the app."
        status="System"
        title="Theme"
      />
      <SettingsRow
        description="This setting is managed by the current environment."
        title="Environment theme"
        unavailable
      />
    </SettingsSection>
  );
}

function ComponentLabSidebarStory() {
  const [selected, setSelected] = useState(0);
  return (
    <SidebarProvider className="component-lab-sidebar-provider" defaultOpen>
      <ComponentLabColumn className="component-lab-sidebar-stack">
        <SidebarTrigger
          aria-label="Toggle lab sidebar"
          className="component-lab-sidebar-trigger"
          data-component-lab-sidebar-trigger="default"
        >
          <HostText className="component-lab-sidebar-trigger__label">Toggle</HostText>
        </SidebarTrigger>
        <SidebarContent className="component-lab-sidebar-content">
          <SidebarGroup className="component-lab-sidebar-group">
            <SidebarMenu className="component-lab-sidebar-menu">
              <SidebarMenuItem className="component-lab-sidebar-menu-item">
                <SidebarMenuButton
                  className="component-lab-sidebar-menu-button"
                  data-component-lab-sidebar-menu-button="default"
                  onClick={() => setSelected((count) => count + 1)}
                >
                  <HostText className="component-lab-host-text">Project settings</HostText>
                  <HostText
                    className="component-lab-host-text component-lab-host-text--muted"
                    data-component-lab-sidebar-count="value"
                  >
                    Selected {selected}
                  </HostText>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarInset className="component-lab-sidebar-inset">
          <HostText className="component-lab-host-text component-lab-host-text--muted">
            Main surface
          </HostText>
        </SidebarInset>
      </ComponentLabColumn>
    </SidebarProvider>
  );
}

function ComponentLabCommandStory() {
  const [query, setQuery] = useState("");
  const items = [
    { label: "Open project", shortcut: "⌘O", value: "open-project" },
    { label: "New thread", shortcut: null, value: "new-thread" },
  ].filter((item) => item.label.toLowerCase().includes(query.toLowerCase()));
  return (
    <HostView className="component-lab-command">
      <Command
        autoHighlight={false}
        items={items}
        mode="none"
        onValueChange={setQuery}
        value={query}
      >
        <CommandInput
          aria-label="Component lab command input"
          className="component-lab-command__input"
          placeholder="Search commands"
        />
        <CommandPanel className="component-lab-command__panel">
          <CommandList className="component-lab-command__list">
            <CommandEmpty className="component-lab-command__empty">
              No matching commands.
            </CommandEmpty>
            <CommandGroup className="component-lab-command__group" items={items}>
              <CommandGroupLabel className="component-lab-command__label">
                Workspace
              </CommandGroupLabel>
              <CommandCollection>
                {(rawItem: unknown, index) => {
                  const item = rawItem as (typeof items)[number];
                  return (
                    <CommandItem
                      className="component-lab-command__item"
                      key={item.value}
                      value={item.value}
                    >
                      <HostText className="component-lab-command__item-label">
                        {item.label}
                      </HostText>
                      {item.shortcut ? (
                        <CommandShortcut className="component-lab-command__shortcut">
                          {item.shortcut}
                        </CommandShortcut>
                      ) : null}
                      {index < items.length - 1 ? (
                        <CommandSeparator className="component-lab-command__separator" />
                      ) : null}
                    </CommandItem>
                  );
                }}
              </CommandCollection>
            </CommandGroup>
          </CommandList>
        </CommandPanel>
        <CommandFooter className="component-lab-command__footer">
          <HostText className="component-lab-command__footer-label">Choose an action</HostText>
        </CommandFooter>
      </Command>
    </HostView>
  );
}

function ComponentLabCommandDialogStory() {
  const [open, setOpen] = useState(false);
  return (
    <CommandDialog
      disablePointerDismissal
      open={open}
      onOpenChange={setOpen}
      triggerId="component-lab-command-dialog-trigger"
    >
      <CommandDialogTrigger
        className="component-lab-command-dialog-trigger"
        data-component-lab-command-dialog-trigger="default"
        id="component-lab-command-dialog-trigger"
        onClick={() => setOpen(true)}
      >
        Open command dialog
      </CommandDialogTrigger>
      <Button data-component-lab-command-dialog-open="default" onClick={() => setOpen(true)}>
        Show command dialog
      </Button>
      <CommandDialogPopup
        aria-label="Component lab command dialog"
        className="component-lab-command-dialog"
        data-component-lab-command-dialog-popup="default"
        onBackdropPointerDown={() => setOpen(false)}
      >
        <HostView className="component-lab-command-dialog__body">
          <HostHeading className="component-lab-command-dialog__title">Quick actions</HostHeading>
          <HostText className="component-lab-host-text component-lab-host-text--muted">
            Search projects and commands.
          </HostText>
          <DialogClose
            data-component-lab-command-dialog-close="default"
            render={<Button variant="outline" />}
          >
            Done
          </DialogClose>
        </HostView>
      </CommandDialogPopup>
    </CommandDialog>
  );
}

function ComponentLabDraftInputStory() {
  const [committed, setCommitted] = useState("alpha");
  return (
    <HostView className="component-lab-draft-input">
      <HostView className="component-lab-draft-input__frame">
        <DraftInput
          aria-label="Component lab draft input"
          className="component-lab-draft-input__control"
          onCommit={setCommitted}
          value={committed}
        />
      </HostView>
      <HostText
        className="component-lab-host-text component-lab-host-text--muted"
        data-component-lab-draft-committed="value"
      >
        Committed {committed}
      </HostText>
    </HostView>
  );
}

function ComponentLabThreadErrorStory() {
  const [visible, setVisible] = useState(true);
  return visible ? (
    <HostView className="component-lab-thread-error">
      <ThreadErrorBannerSurface
        icon={<HostText className="component-lab-thread-error__icon">!</HostText>}
        title="Provider unavailable"
        description="The selected model could not be loaded."
        action={
          <Button
            aria-label="Dismiss component lab error"
            className="thread-error-dismiss"
            data-component-lab-thread-error-dismiss="default"
            onClick={() => setVisible(false)}
            size="icon-xs"
            variant="ghost"
          >
            ×
          </Button>
        }
      />
    </HostView>
  ) : null;
}

function ComponentLabThreadStatusStory() {
  type StatusThread = Parameters<typeof resolveThreadStatusPill>[0]["thread"];
  const base = {
    hasActionableProposedPlan: false,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    interactionMode: "default",
    latestTurn: null,
    session: null,
  } as StatusThread;
  const states = [
    resolveThreadStatusPill({
      thread: {
        ...base,
        session: { status: "running" },
      } as StatusThread,
    }),
    resolveThreadStatusPill({ thread: { ...base, hasPendingUserInput: true } }),
    resolveThreadStatusPill({
      thread: {
        ...base,
        latestTurn: {
          completedAt: "2026-03-09T10:05:00.000Z",
          startedAt: "2026-03-09T10:00:00.000Z",
          state: "completed",
        },
        lastVisitedAt: "2026-03-09T10:04:00.000Z",
      } as StatusThread,
    }),
    resolveThreadStatusPill({
      thread: {
        ...base,
        hasActionableProposedPlan: true,
        interactionMode: "plan",
        latestTurn: {
          completedAt: "2026-03-09T10:05:00.000Z",
          startedAt: "2026-03-09T10:00:00.000Z",
          state: "completed",
        },
        session: { activeTurnId: null, status: "ready" },
      } as StatusThread,
    }),
  ].filter((status) => status !== null);
  return (
    <HostView className="component-lab-thread-statuses">
      {states.map((status) => (
        <ThreadStatusLabel key={status.label} status={status} />
      ))}
    </HostView>
  );
}

function ComponentLabChangeRequestStory() {
  const basePr = {
    baseRef: "main",
    headRef: "feature/error-fidelity",
    number: 42,
    state: "open",
    title: "Fix error banner fidelity",
    url: "https://github.com/pingdotgg/t3code/pull/42",
  } as const;
  const statuses = (["open", "merged", "closed"] as const)
    .map((state) => prStatusIndicator({ ...basePr, state }, undefined))
    .filter((status) => status !== null);
  return (
    <HostView className="component-lab-change-requests">
      {statuses.map((status) => (
        <HostView className="component-lab-change-request" key={status.tooltipLead}>
          <ChangeRequestStatusIcon className="component-lab-change-request__icon" />
          <PrStatusTooltipContent status={status} />
        </HostView>
      ))}
    </HostView>
  );
}

function ComponentLabWorktreeStory() {
  return (
    <HostView className="component-lab-worktree-indicator">
      <ThreadWorktreeIndicator
        thread={{
          branch: "feature/error-fidelity",
          id: "component-lab-thread" as never,
          worktreePath: "/Users/bytedance/github/t3code-worktrees/error-fidelity",
        }}
      />
    </HostView>
  );
}

function ComponentLabSidebarChromeStory() {
  return (
    <HostView className="component-lab-sidebar-chrome">
      <SidebarChromeHeaderSurface
        brand={<HostText className="component-lab-sidebar-chrome__brand">T3 Code</HostText>}
        isElectron={false}
        trigger={<Button size="icon-xs">≡</Button>}
      />
      <SidebarChromeFooterSurface>
        <Button className="sidebar-settings-row" size="sm" variant="ghost">
          Settings
        </Button>
      </SidebarChromeFooterSurface>
    </HostView>
  );
}

function ComponentLabFileTreeStory() {
  const [expanded, setExpanded] = useState(true);
  const [selected, setSelected] = useState(false);
  return (
    <HostView className="component-lab-file-tree">
      <FileTreeDirectoryRowSurface
        chevron={<HostText>›</HostText>}
        depth={0}
        expanded={expanded}
        folderIcon={<HostText className="component-lab-file-tree__icon">D</HostText>}
        itemPath="src"
        name="src"
        onToggle={() => setExpanded((value) => !value)}
        trailing={<HostText>+12 -3</HostText>}
      />
      {expanded ? (
        <FileTreeChildrenSurface>
          <FileTreeFileRowSurface
            depth={1}
            fileIcon={<HostText className="component-lab-file-tree__icon">TS</HostText>}
            itemPath="src/index.ts"
            name="index.ts"
            onSelect={() => setSelected((value) => !value)}
            selected={selected}
            showLeadingSpacer
            trailing={<HostText>+8 -1</HostText>}
          />
        </FileTreeChildrenSurface>
      ) : null}
    </HostView>
  );
}

function ComponentLabChangedFilesCardStory() {
  const [expanded, setExpanded] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(true);
  const setExpandedState = (next: boolean) => {
    setExpanded(next);
    if (!next) setPreviewVisible(false);
  };
  return (
    <HostView className="component-lab-changed-files-card">
      <ChangedFilesCardSurface
        compactPreviewVisible={previewVisible && !expanded}
        expanded={expanded}
        expandedBody={
          <FileTreeChildrenSurface>
            <FileTreeFileRowSurface
              depth={0}
              fileIcon={<HostText className="component-lab-file-tree__icon">TS</HostText>}
              name="src/index.ts"
              trailing={<HostText>+8 -1</HostText>}
            />
          </FileTreeChildrenSurface>
        }
        fileCount={2}
        onExpandedChange={setExpandedState}
        onShowAll={() => {
          setExpanded(true);
          setPreviewVisible(false);
        }}
        openDiffControl={<HostButton className="turn-diff-card__open">Open diff</HostButton>}
        previewFiles={[
          {
            key: "src/index.ts",
            name: "index.ts",
            icon: <HostText className="component-lab-file-tree__icon">TS</HostText>,
            onSelect: () => setExpanded(true),
          },
        ]}
        previewScopes={[{ key: "src", label: "src", fileCount: 2 }]}
        stat={<HostText className="turn-diff-card__stat">+12 −3</HostText>}
        toggleIcon={<HostText>›</HostText>}
        turnId="component-lab-turn"
      />
    </HostView>
  );
}

function ComponentLabChatHeaderStory() {
  const [newThreadCount, setNewThreadCount] = useState(0);
  return (
    <HostView className="component-lab-chat-header">
      <ChatHeaderSurface
        actions={<HostText className="component-lab-chat-header__action">Review</HostText>}
        activeProjectName="t3code"
        activeThreadTitle="Restore CSS fidelity"
        onNewThreadInProject={() => setNewThreadCount((count) => count + 1)}
        projectIcon={<HostText className="component-lab-chat-header__icon">T3</HostText>}
        rightPanelOpen={false}
      />
      <HostText data-component-lab-chat-header-count="value">New thread {newThreadCount}</HostText>
    </HostView>
  );
}

function ComponentLabPlanStory() {
  const steps = [
    { key: "audit", status: "completed", text: "Audit CSS generation" },
    { key: "adapt", status: "inProgress", text: "Restore supported selectors" },
    { key: "verify", status: "pending", text: "Verify both renderers" },
  ];
  return (
    <HostView className="component-lab-plan">
      <PlanExplanationSurface>
        Restore fidelity without duplicating product components.
      </PlanExplanationSurface>
      <PlanStepsSurface
        steps={steps}
        renderIcon={(status) => (
          <HostText className={`component-lab-plan__status component-lab-plan__status--${status}`}>
            {status === "completed" ? "✓" : status === "inProgress" ? "•" : "○"}
          </HostText>
        )}
      />
      <HostView className="component-lab-plan__disclosure component-lab-plan__disclosure--collapsed">
        <ProposedPlanSectionSurface
          chevron={<HostText>›</HostText>}
          expanded={false}
          onToggle={() => {}}
          title="Full Plan"
        />
      </HostView>
      <HostView className="component-lab-plan__disclosure component-lab-plan__disclosure--expanded">
        <ProposedPlanSectionSurface
          chevron={<HostText className="rotate-90">›</HostText>}
          expanded
          onToggle={() => {}}
          title="Full Plan"
        >
          <HostText>Preserve shared component identity across renderers.</HostText>
        </ProposedPlanSectionSurface>
      </HostView>
    </HostView>
  );
}

function ComponentLabRightPanelEmptyStory() {
  return (
    <HostView className="component-lab-right-panel-empty">
      <RightPanelEmptySurface actions={[]} />
    </HostView>
  );
}

function ComponentLabHostListStory() {
  return (
    <HostScrollView className="component-lab-host-scroll">
      <HostList className="component-lab-host-list">
        {Array.from({ length: 6 }, (_, index) => (
          <HostListItem className="component-lab-host-list__item" key={index}>
            <HostText>Host row {index + 1}</HostText>
          </HostListItem>
        ))}
      </HostList>
    </HostScrollView>
  );
}

function ComponentLabHostLayoutStory() {
  return (
    <HostLayoutView className="component-lab-host-layout">
      <HostHeadline className="component-lab-host-headline">Build something great</HostHeadline>
      <HostText className="component-lab-host-text component-lab-host-text--muted">
        Shared renderer-neutral layout anatomy.
      </HostText>
    </HostLayoutView>
  );
}

function ComponentLabUpdatePillStory() {
  const [visible, setVisible] = useState(true);
  return (
    <HostView className="component-lab-update-pills">
      {visible ? (
        <SidebarUpdatePillSurface
          description="Claude can be updated from provider settings."
          dismissIcon={<HostText>×</HostText>}
          dismissLabel="Dismiss provider update notice"
          icon={<HostText>!</HostText>}
          onActivate={() => {}}
          onDismiss={() => setVisible(false)}
          progressDurationMs={3000}
          title="Claude update available"
          tone="warning"
        />
      ) : (
        <HostText data-component-lab-update-dismissed="true">Update dismissed</HostText>
      )}
      <SidebarUpdatePillSurface
        description="Running provider update command."
        icon={<HostText>↻</HostText>}
        onActivate={() => {}}
        title="Updating provider"
        tone="loading"
      />
    </HostView>
  );
}

export function ComponentLabSurface() {
  return (
    <HostView className="component-lab" data-component-lab="web-lynx-shared">
      <HostView className="component-lab__rail">
        <HostText className="component-lab__eyebrow">T3 CODE SYSTEM</HostText>
        <HostHeading className="component-lab__title">Components Lab</HostHeading>
        <HostText className="component-lab__summary">
          Real product components rendered from one shared story contract.
        </HostText>
        {catalog.map((story) => (
          <HostView className="component-lab__index-row" key={story.id}>
            <HostText className="component-lab__index-title">{story.title}</HostText>
            <HostText className="component-lab__index-count">{story.states.length}</HostText>
          </HostView>
        ))}
      </HostView>

      <HostView className="component-lab__content">
        <ComponentLabStack>
          <StoryFrame id="ui/button#Button" title="Button">
            <HostView className="component-lab-specimen-row">
              <Button>Default</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Delete</Button>
              <Button disabled>Disabled</Button>
            </HostView>
          </StoryFrame>

          <StoryFrame id="ProjectFavicon#ProjectFavicon" title="Project favicon">
            <HostView className="component-lab-project-favicon-frame">
              <ProjectFavicon
                className="component-lab-project-favicon"
                cwd="/Users/bytedance/github/background-only"
                environmentId={
                  PRIMARY_LOCAL_ENVIRONMENT_ID as import("@t3tools/contracts").EnvironmentId
                }
              />
              <HostText className="component-lab-host-text">background-only</HostText>
            </HostView>
          </StoryFrame>

          <StoryFrame id="ui/sidebar#SidebarMenuButton" title="Sidebar menu button">
            <ComponentLabSidebarStory />
          </StoryFrame>

          <StoryFrame id="ui/draft-input#DraftInput" title="Draft input">
            <ComponentLabDraftInputStory />
          </StoryFrame>

          <StoryFrame
            id="chat/ThreadErrorBannerSurface#ThreadErrorBannerSurface"
            title="Thread error banner"
          >
            <ComponentLabThreadErrorStory />
          </StoryFrame>

          <StoryFrame id="ThreadStatusIndicators#ThreadStatusLabel" title="Thread status label">
            <ComponentLabThreadStatusStory />
          </StoryFrame>

          <StoryFrame
            id="ThreadStatusIndicators#ChangeRequestStatusIcon"
            title="Change request status icon"
          >
            <ComponentLabChangeRequestStory />
          </StoryFrame>

          <StoryFrame
            id="ThreadStatusIndicators#PrStatusTooltipContent"
            title="Change request tooltip"
          >
            <HostText className="component-lab-host-text component-lab-host-text--muted">
              Exercised by the shared production change request composition above.
            </HostText>
          </StoryFrame>

          <StoryFrame
            id="ThreadStatusIndicators#ThreadWorktreeIndicator"
            title="Thread worktree indicator"
          >
            <ComponentLabWorktreeStory />
          </StoryFrame>

          <StoryFrame
            id="sidebar/SidebarChromeSurface#SidebarChromeHeaderSurface"
            title="Sidebar chrome header surface"
          >
            <ComponentLabSidebarChromeStory />
          </StoryFrame>

          <StoryFrame
            id="sidebar/SidebarChromeSurface#SidebarChromeFooterSurface"
            title="Sidebar chrome footer surface"
          >
            <HostText className="component-lab-host-text component-lab-host-text--muted">
              Exercised by the shared production Sidebar chrome composition above.
            </HostText>
          </StoryFrame>

          <StoryFrame
            id="chat/FileTreeSurface#FileTreeDirectoryRowSurface"
            title="File tree directory row"
          >
            <ComponentLabFileTreeStory />
          </StoryFrame>

          <StoryFrame
            id="chat/ChangedFilesCardSurface#ChangedFilesCardSurface"
            title="Changed files card surface"
          >
            <ComponentLabChangedFilesCardStory />
          </StoryFrame>

          <StoryFrame id="chat/ChatHeaderSurface#ChatHeaderSurface" title="Chat header surface">
            <ComponentLabChatHeaderStory />
          </StoryFrame>

          <StoryFrame id="chat/ChatHeaderTitle#ChatHeaderTitle" title="Chat header title">
            <HostText className="component-lab-host-text component-lab-host-text--muted">
              Exercised by the shared production Chat header composition above.
            </HostText>
          </StoryFrame>

          <StoryFrame id="PlanSurface#PlanExplanationSurface" title="Plan surface">
            <ComponentLabPlanStory />
          </StoryFrame>

          {(
            [
              ["PlanSurface#PlanStepsSurface", "Plan steps"],
              ["PlanSurface#ProposedPlanSectionSurface", "Proposed plan section"],
            ] as const
          ).map(([id, title]) => (
            <StoryFrame id={id} key={id} title={title}>
              <HostText className="component-lab-host-text component-lab-host-text--muted">
                Exercised by the shared production Plan composition above.
              </HostText>
            </StoryFrame>
          ))}

          <StoryFrame id="PlanSurface#PlanEmptySurface" title="Plan empty state">
            <HostView className="component-lab-plan-empty">
              <PlanEmptySurface />
            </HostView>
          </StoryFrame>

          <StoryFrame id="RightPanelSurface#RightPanelEmptySurface" title="Right panel empty state">
            <ComponentLabRightPanelEmptyStory />
          </StoryFrame>

          <StoryFrame id="CommandPaletteSurface#PaletteEmptySurface" title="Palette empty state">
            <HostView className="component-lab-palette-empty">
              <PaletteEmptySurface message="No matching projects or actions." />
            </HostView>
          </StoryFrame>

          {(
            [
              ["chat/FileTreeSurface#FileTreeFileRowSurface", "File tree file row"],
              ["chat/FileTreeSurface#FileTreeChildrenSurface", "File tree children"],
            ] as const
          ).map(([id, title]) => (
            <StoryFrame id={id} key={id} title={title}>
              <HostText className="component-lab-host-text component-lab-host-text--muted">
                Exercised by the shared production File tree composition above.
              </HostText>
            </StoryFrame>
          ))}

          <StoryFrame id="ui/hostElements#HostScrollView" title="Host scroll view">
            <ComponentLabHostListStory />
          </StoryFrame>

          {(
            [
              ["ui/hostElements#HostList", "Host list"],
              ["ui/hostElements#HostListItem", "Host list item"],
            ] as const
          ).map(([id, title]) => (
            <StoryFrame id={id} key={id} title={title}>
              <HostText className="component-lab-host-text component-lab-host-text--muted">
                Exercised by the shared Host scroll composition above.
              </HostText>
            </StoryFrame>
          ))}

          <StoryFrame id="ui/hostElements#HostLayoutView" title="Host layout view">
            <ComponentLabHostLayoutStory />
          </StoryFrame>

          <StoryFrame id="ui/hostElements#HostHeadline" title="Host headline">
            <HostText className="component-lab-host-text component-lab-host-text--muted">
              Exercised by the shared Host layout composition above.
            </HostText>
          </StoryFrame>

          <StoryFrame id="T3Wordmark#T3Wordmark" title="T3 wordmark">
            <HostView className="component-lab-t3-wordmarks">
              <HostView className="component-lab-t3-wordmark">
                <T3Wordmark />
              </HostView>
              <HostView className="component-lab-t3-wordmark component-lab-t3-wordmark--backdrop text-white">
                <T3Wordmark />
              </HostView>
            </HostView>
          </StoryFrame>

          <StoryFrame
            id="sidebar/SidebarUpdatePillSurface#SidebarUpdatePillSurface"
            title="Sidebar update pill surface"
          >
            <ComponentLabUpdatePillStory />
          </StoryFrame>

          <StoryFrame id="ui/command#Command" title="Command">
            <ComponentLabCommandStory />
          </StoryFrame>

          <StoryFrame id="ui/command#CommandDialog" title="Command dialog">
            <ComponentLabCommandDialogStory />
          </StoryFrame>

          {(
            [
              ["ui/command#CommandList", "Command list"],
              ["ui/command#CommandGroup", "Command group"],
              ["ui/command#CommandGroupLabel", "Command group label"],
              ["ui/command#CommandItem", "Command item"],
              ["ui/command#CommandPanel", "Command panel"],
              ["ui/command#CommandSeparator", "Command separator"],
              ["ui/command#CommandShortcut", "Command shortcut"],
              ["ui/command#CommandFooter", "Command footer"],
              ["ui/command#CommandInput", "Command input"],
              ["ui/command#CommandCollection", "Command collection"],
              ["ui/command#CommandEmpty", "Command empty"],
              ["ui/command#CommandDialogTrigger", "Command dialog trigger"],
              ["ui/command#CommandDialogPopup", "Command dialog popup"],
            ] as const
          ).map(([id, title]) => (
            <StoryFrame id={id} key={id} title={title}>
              <HostText className="component-lab-host-text component-lab-host-text--muted">
                Exercised by the shared production Command composition above.
              </HostText>
            </StoryFrame>
          ))}

          {(
            [
              ["ui/sidebar#SidebarProvider", "Sidebar provider"],
              ["ui/sidebar#SidebarGroup", "Sidebar group"],
              ["ui/sidebar#SidebarMenu", "Sidebar menu"],
              ["ui/sidebar#SidebarMenuItem", "Sidebar menu item"],
              ["ui/sidebar#SidebarContent", "Sidebar content"],
              ["ui/sidebar#SidebarTrigger", "Sidebar trigger"],
              ["ui/sidebar#SidebarInset", "Sidebar inset"],
            ] as const
          ).map(([id, title]) => (
            <StoryFrame id={id} key={id} title={title}>
              <HostText className="component-lab-host-text component-lab-host-text--muted">
                Exercised by the shared production Sidebar composition above.
              </HostText>
            </StoryFrame>
          ))}

          <StoryFrame id="ui/select#Select" title="Select">
            <ComponentLabSelectStory />
          </StoryFrame>

          <StoryFrame id="ui/number-field#NumberField" title="Number field">
            <ComponentLabNumberFieldStory />
          </StoryFrame>

          <StoryFrame id="ui/scroll-area#ScrollArea" title="Scroll area">
            <ComponentLabScrollAreaStory />
          </StoryFrame>

          <StoryFrame id="ui/dialog#Dialog" title="Dialog">
            <ComponentLabDialogStory />
          </StoryFrame>

          <StoryFrame id="ui/sheet#Sheet" title="Sheet">
            <ComponentLabSheetStory />
          </StoryFrame>

          <StoryFrame id="ui/sheet#SheetPopup" title="Sheet popup">
            <HostText className="component-lab-host-text component-lab-host-text--muted">
              Exercised by the shared production Sheet composition above.
            </HostText>
          </StoryFrame>

          {(
            [
              ["ui/sheet#SheetTrigger", "Sheet trigger"],
              ["ui/sheet#SheetClose", "Sheet close"],
              ["ui/sheet#SheetHeader", "Sheet header"],
              ["ui/sheet#SheetPanel", "Sheet panel"],
              ["ui/sheet#SheetFooter", "Sheet footer"],
              ["ui/sheet#SheetTitle", "Sheet title"],
              ["ui/sheet#SheetDescription", "Sheet description"],
            ] as const
          ).map(([id, title]) => (
            <StoryFrame id={id} key={id} title={title}>
              <HostText className="component-lab-host-text component-lab-host-text--muted">
                Exercised by the shared production Sheet composition above.
              </HostText>
            </StoryFrame>
          ))}

          <StoryFrame id="ui/popover#Popover" title="Popover">
            <ComponentLabPopoverStory />
          </StoryFrame>

          {(
            [
              ["ui/popover#PopoverTrigger", "Popover trigger"],
              ["ui/popover#PopoverPopup", "Popover popup"],
              ["ui/popover#PopoverClose", "Popover close"],
            ] as const
          ).map(([id, title]) => (
            <StoryFrame id={id} key={id} title={title}>
              <HostText className="component-lab-host-text component-lab-host-text--muted">
                Exercised by the shared production Popover composition above.
              </HostText>
            </StoryFrame>
          ))}

          {(
            [
              ["ui/dialog#DialogPopup", "Dialog popup"],
              ["ui/dialog#DialogPanel", "Dialog panel"],
              ["ui/dialog#DialogHeader", "Dialog header"],
              ["ui/dialog#DialogFooter", "Dialog footer"],
              ["ui/dialog#DialogTitle", "Dialog title"],
              ["ui/dialog#DialogDescription", "Dialog description"],
              ["ui/dialog#DialogTrigger", "Dialog trigger"],
              ["ui/dialog#DialogClose", "Dialog close"],
            ] as const
          ).map(([id, title]) => (
            <StoryFrame id={id} key={id} title={title}>
              <HostText className="component-lab-host-text component-lab-host-text--muted">
                Exercised by the shared production Dialog composition above.
              </HostText>
            </StoryFrame>
          ))}

          <StoryFrame id="ui/tooltip#Tooltip" title="Tooltip">
            <TooltipProvider delay={0}>
              <Tooltip>
                <TooltipTrigger
                  data-component-lab-tooltip-trigger="default"
                  data-floating-anchor="component-lab-tooltip"
                  render={<Button variant="outline" />}
                >
                  Hover for details
                </TooltipTrigger>
                <TooltipPopup relationId="component-lab-tooltip">Shared tooltip</TooltipPopup>
              </Tooltip>
            </TooltipProvider>
          </StoryFrame>

          <StoryFrame id="ui/menu#Menu" title="Menu">
            <Menu>
              <MenuTrigger
                data-component-lab-menu-trigger="default"
                data-floating-anchor="component-lab-menu"
                render={<Button variant="outline" />}
              >
                Open menu
              </MenuTrigger>
              <MenuPopup
                align="start"
                className="component-lab-menu-popup"
                relationId="component-lab-menu"
                side="top"
              >
                <MenuGroup data-component-lab-menu-group="actions">
                  <MenuGroupLabel>File actions</MenuGroupLabel>
                  <MenuItem data-component-lab-menu-item="open">
                    Open in editor
                    <MenuShortcut>⌘O</MenuShortcut>
                  </MenuItem>
                  <MenuSeparator data-component-lab-menu-separator="default" />
                  <MenuItem data-component-lab-menu-item="copy">Copy path</MenuItem>
                </MenuGroup>
              </MenuPopup>
            </Menu>
          </StoryFrame>

          <StoryFrame id="ui/tooltip#TooltipTrigger" title="Tooltip trigger">
            <TooltipProvider delay={0}>
              <Tooltip>
                <TooltipTrigger
                  data-component-lab-tooltip-trigger="glass"
                  data-floating-anchor="component-lab-tooltip-glass"
                  render={<Button variant="ghost" />}
                >
                  Hover glass
                </TooltipTrigger>
                <TooltipPopup relationId="component-lab-tooltip-glass" variant="glass">
                  Glass tooltip
                </TooltipPopup>
              </Tooltip>
            </TooltipProvider>
          </StoryFrame>

          <StoryFrame id="ui/tooltip#TooltipPopup" title="Tooltip popup">
            <HostText className="component-lab-host-text component-lab-host-text--muted">
              Opened by the real Tooltip state machine in paired capture.
            </HostText>
          </StoryFrame>

          <StoryFrame id="ui/tooltip#TooltipProvider" title="Tooltip provider">
            <HostText className="component-lab-host-text component-lab-host-text--muted">
              Shared by both production Tooltip fixtures above.
            </HostText>
          </StoryFrame>

          <StoryFrame id="ui/menu#MenuTrigger" title="Menu trigger">
            <HostText className="component-lab-host-text component-lab-host-text--muted">
              Rendered by the Menu story through the real Button primitive.
            </HostText>
          </StoryFrame>

          <StoryFrame id="ui/menu#MenuPopup" title="Menu popup">
            <HostText className="component-lab-host-text component-lab-host-text--muted">
              Opened by the real Menu state machine in its paired interaction capture.
            </HostText>
          </StoryFrame>

          <StoryFrame id="ui/menu#MenuItem" title="Menu item">
            <HostText className="component-lab-host-text component-lab-host-text--muted">
              Open in editor and Copy path use the same production MenuItem.
            </HostText>
          </StoryFrame>

          <StoryFrame id="ui/menu#MenuGroup" title="Menu group">
            <HostText className="component-lab-host-text component-lab-host-text--muted">
              Both actions share the production MenuGroup in the Menu fixture above.
            </HostText>
          </StoryFrame>

          <StoryFrame id="ui/menu#MenuSeparator" title="Menu separator">
            <HostText className="component-lab-host-text component-lab-host-text--muted">
              Separates the two production MenuItem instances above.
            </HostText>
          </StoryFrame>

          <StoryFrame id="ui/menu#MenuGroupLabel" title="Menu group label">
            <HostText className="component-lab-host-text component-lab-host-text--muted">
              Renders File actions in the shared Menu fixture above.
            </HostText>
          </StoryFrame>

          <StoryFrame id="ui/menu#MenuShortcut" title="Menu shortcut">
            <HostText className="component-lab-host-text component-lab-host-text--muted">
              Renders the ⌘O hint inside the shared production MenuItem above.
            </HostText>
          </StoryFrame>

          <StoryFrame id="ui/select#SelectTrigger" title="Select trigger">
            <HostText className="component-lab-host-text component-lab-host-text--muted">
              Exercised by the shared Select fixture above.
            </HostText>
          </StoryFrame>

          <StoryFrame id="ui/select#SelectValue" title="Select value">
            <HostText className="component-lab-host-text component-lab-host-text--muted">
              Verified as Comfortable, then Compact after selection.
            </HostText>
          </StoryFrame>

          <StoryFrame id="ui/select#SelectPopup" title="Select popup">
            <HostText className="component-lab-host-text component-lab-host-text--muted">
              The shared fixture retains this subtree across closed and open states.
            </HostText>
          </StoryFrame>

          <StoryFrame id="ui/select#SelectItem" title="Select item">
            <HostText className="component-lab-host-text component-lab-host-text--muted">
              Comfortable and Compact use the same production SelectItem.
            </HostText>
          </StoryFrame>

          <StoryFrame id="ui/select#SelectGroup" title="Select group">
            <HostText className="component-lab-host-text component-lab-host-text--muted">
              Groups both density choices in the shared Select fixture above.
            </HostText>
          </StoryFrame>

          <StoryFrame id="ui/select#SelectGroupLabel" title="Select group label">
            <HostText className="component-lab-host-text component-lab-host-text--muted">
              Renders the Density label in the shared Select popup above.
            </HostText>
          </StoryFrame>

          <StoryFrame id="ui/number-field#NumberFieldGroup" title="Number field group">
            <HostText className="component-lab-host-text component-lab-host-text--muted">
              Exercised by the shared Number field fixture above.
            </HostText>
          </StoryFrame>

          <StoryFrame id="ui/number-field#NumberFieldInput" title="Number field input">
            <HostText className="component-lab-host-text component-lab-host-text--muted">
              Reflects each increment and decrement from the shared fixture.
            </HostText>
          </StoryFrame>

          <StoryFrame id="ui/number-field#NumberFieldIncrement" title="Number increment">
            <HostText className="component-lab-host-text component-lab-host-text--muted">
              Increments the shared value by two.
            </HostText>
          </StoryFrame>

          <StoryFrame id="ui/number-field#NumberFieldDecrement" title="Number decrement">
            <HostText className="component-lab-host-text component-lab-host-text--muted">
              Restores the shared value to its initial state.
            </HostText>
          </StoryFrame>

          <StoryFrame id="settings/settingsLayout#SettingsSection" title="Settings section">
            <ComponentLabSettingsStory />
          </StoryFrame>

          <StoryFrame id="settings/settingsLayout#SettingsRow" title="Settings row">
            <HostText className="component-lab-host-text component-lab-host-text--muted">
              Rendered by the shared Settings section fixture above.
            </HostText>
          </StoryFrame>

          <StoryFrame id="settings/settingsLayout#SettingResetButton" title="Setting reset button">
            <HostText className="component-lab-host-text component-lab-host-text--muted">
              Exercised by the shared Settings section header action above.
            </HostText>
          </StoryFrame>

          <StoryFrame id="ui/empty#Empty" title="Empty state">
            <Empty className="settings-remote-empty">
              <EmptyMedia className="settings-remote-empty__media" variant="icon">
                <HostText className="component-lab-host-text">◇</HostText>
              </EmptyMedia>
              <EmptyHeader className="settings-remote-empty__header">
                <EmptyTitle className="settings-remote-empty__title">No environments</EmptyTitle>
                <EmptyDescription className="settings-remote-empty__description">
                  Add an environment to continue remotely.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button size="sm" variant="outline">
                  Add environment
                </Button>
              </EmptyContent>
            </Empty>
          </StoryFrame>

          <StoryFrame id="ui/empty#EmptyHeader" title="Empty header">
            <HostText className="component-lab-host-text component-lab-host-text--muted">
              Shared by the empty-state fixture above.
            </HostText>
          </StoryFrame>

          <StoryFrame id="ui/empty#EmptyMedia" title="Empty media">
            <HostText className="component-lab-host-text component-lab-host-text--muted">
              Uses the production icon media layers.
            </HostText>
          </StoryFrame>

          <StoryFrame id="ui/empty#EmptyTitle" title="Empty title">
            <HostText className="component-lab-host-text component-lab-host-text--muted">
              Uses the production empty-state heading.
            </HostText>
          </StoryFrame>

          <StoryFrame id="ui/empty#EmptyDescription" title="Empty description">
            <HostText className="component-lab-host-text component-lab-host-text--muted">
              Uses the production supporting copy.
            </HostText>
          </StoryFrame>

          <StoryFrame id="ui/empty#EmptyContent" title="Empty content">
            <HostText className="component-lab-host-text component-lab-host-text--muted">
              Uses the production action container.
            </HostText>
          </StoryFrame>

          <StoryFrame id="ui/badge#Badge" title="Badge">
            <HostView className="component-lab-specimen-row">
              <Badge>Default</Badge>
              <Badge variant="secondary">Secondary</Badge>
              <Badge variant="outline">Outline</Badge>
              <Badge variant="success">Success</Badge>
              <Badge variant="warning">Warning</Badge>
              <Badge variant="error">Error</Badge>
            </HostView>
          </StoryFrame>

          <StoryFrame id="ui/input#Input" title="Input">
            <ComponentLabColumn>
              <StoryLabel>Empty</StoryLabel>
              <Input aria-label="Empty input" placeholder="Search projects" />
              <StoryLabel>Value</StoryLabel>
              <Input aria-label="Filled input" value="t3code-lynxtron" />
              <StoryLabel>Disabled</StoryLabel>
              <Input aria-label="Disabled input" disabled value="Unavailable" />
            </ComponentLabColumn>
          </StoryFrame>

          <StoryFrame id="ui/label#Label" title="Label">
            <ComponentLabColumn>
              <Label data-component-lab-label="project-name" htmlFor="component-lab-project-name">
                Project name
              </Label>
              <Input aria-label="Project name" id="component-lab-project-name" value="t3code" />
            </ComponentLabColumn>
          </StoryFrame>

          <StoryFrame id="ui/textarea#Textarea" title="Textarea">
            <ComponentLabColumn>
              <Textarea aria-label="Empty textarea" placeholder="Describe the change" />
              <Textarea aria-label="Filled textarea" value="Keep the renderer contract explicit." />
              <Textarea aria-label="Disabled textarea" disabled value="Read only" />
            </ComponentLabColumn>
          </StoryFrame>

          <StoryFrame id="ui/switch#Switch" title="Switch">
            <HostView className="component-lab-specimen-row">
              <StoryLabel>Off</StoryLabel>
              <Switch aria-label="Unchecked switch" />
              <StoryLabel>On</StoryLabel>
              <Switch aria-label="Checked switch" checked />
              <StoryLabel>Disabled</StoryLabel>
              <Switch aria-label="Disabled switch" disabled />
            </HostView>
          </StoryFrame>

          <StoryFrame id="ui/kbd#Kbd" title="Keyboard key">
            <Kbd>K</Kbd>
          </StoryFrame>

          <StoryFrame id="ui/kbd#KbdGroup" title="Keyboard chord">
            <KbdGroup>
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
            </KbdGroup>
          </StoryFrame>

          <StoryFrame id="ui/separator#Separator" title="Separator">
            <HostView className="component-lab-separator-row">
              <Separator />
              <Separator className="component-lab-separator--vertical" orientation="vertical" />
            </HostView>
          </StoryFrame>

          <StoryFrame id="ui/hostElements#HostView" title="Host view">
            <HostView className="component-lab-host-surface">
              <HostView className="component-lab-host-surface__nested" />
            </HostView>
          </StoryFrame>

          <StoryFrame id="ui/hostElements#HostText" title="Host text">
            <HostView className="component-lab-specimen-row">
              <HostText className="component-lab-host-text">Primary text</HostText>
              <HostText className="component-lab-host-text component-lab-host-text--muted">
                Muted text
              </HostText>
            </HostView>
          </StoryFrame>

          <StoryFrame id="ui/hostElements#HostButton" title="Host button">
            <HostView className="component-lab-specimen-row">
              <HostButton className="component-lab-host-button">Host action</HostButton>
              <HostButton
                aria-disabled="true"
                className="component-lab-host-button component-lab-host-button--disabled"
              >
                Disabled
              </HostButton>
            </HostView>
          </StoryFrame>

          <StoryFrame id="ui/hostElements#HostHeading" title="Host heading">
            <HostHeading className="component-lab-story__title">Shared heading</HostHeading>
          </StoryFrame>

          <StoryFrame
            id="components-lab/ComponentLabStack#ComponentLabStack"
            title="Component lab stack"
          >
            <HostText className="component-lab-host-text component-lab-host-text--muted">
              This complete story list is rendered by the shared stack primitive.
            </HostText>
          </StoryFrame>

          <StoryFrame
            id="components-lab/ComponentLabStack#ComponentLabColumn"
            title="Component lab column"
          >
            <ComponentLabColumn>
              <HostText className="component-lab-host-text">First row</HostText>
              <HostText className="component-lab-host-text">Second row</HostText>
            </ComponentLabColumn>
          </StoryFrame>

          <StoryFrame
            id="chat/ModelPickerSurface#ModelPickerEmptySurface"
            title="Model picker empty state"
          >
            <HostView className="component-lab-model-picker-empty">
              <ModelPickerEmptySurface message="No models found" />
            </HostView>
          </StoryFrame>
        </ComponentLabStack>
      </HostView>
    </HostView>
  );
}
