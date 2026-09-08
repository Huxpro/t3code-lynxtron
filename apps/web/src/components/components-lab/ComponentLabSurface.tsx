import catalog from "./catalog.json";
import { PRIMARY_LOCAL_ENVIRONMENT_ID } from "@t3tools/contracts";
import { type ReactNode, useState } from "react";
import { ComponentLabColumn, ComponentLabStack } from "./ComponentLabStack";

import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
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
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../ui/empty";
import { HostButton, HostHeading, HostText, HostView } from "../ui/hostElements";
import { Input } from "../ui/input";
import { Kbd, KbdGroup } from "../ui/kbd";
import { Menu, MenuGroup, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "../ui/menu";
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
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "../ui/sidebar";
import { Textarea } from "../ui/textarea";
import { Tooltip, TooltipPopup, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { SettingResetButton, SettingsRow, SettingsSection } from "../settings/settingsLayout";
import { ProjectFavicon } from "../ProjectFavicon";

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
    <Select value={value} onValueChange={setValue}>
      <SelectTrigger aria-label="Density" data-component-lab-select-trigger="default">
        <SelectValue>{value === "compact" ? "Compact" : "Comfortable"}</SelectValue>
      </SelectTrigger>
      <SelectPopup alignItemWithTrigger={false} data-floating-popup="component-lab-select">
        <SelectItem data-component-lab-select-item="comfortable" value="comfortable">
          Comfortable
        </SelectItem>
        <SelectItem data-component-lab-select-item="compact" value="compact">
          Compact
        </SelectItem>
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
      onValueChange={setValue}
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
    </SidebarProvider>
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
                environmentId={PRIMARY_LOCAL_ENVIRONMENT_ID}
              />
              <HostText className="component-lab-host-text">background-only</HostText>
            </HostView>
          </StoryFrame>

          <StoryFrame id="ui/sidebar#SidebarMenuButton" title="Sidebar menu button">
            <ComponentLabSidebarStory />
          </StoryFrame>

          {(
            [
              ["ui/sidebar#SidebarProvider", "Sidebar provider"],
              ["ui/sidebar#SidebarGroup", "Sidebar group"],
              ["ui/sidebar#SidebarMenu", "Sidebar menu"],
              ["ui/sidebar#SidebarMenuItem", "Sidebar menu item"],
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

          <StoryFrame id="ui/popover#Popover" title="Popover">
            <ComponentLabPopoverStory />
          </StoryFrame>

          {(
            [
              ["ui/popover#PopoverTrigger", "Popover trigger"],
              ["ui/popover#PopoverPopup", "Popover popup"],
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
              <MenuPopup align="start" relationId="component-lab-menu" side="top">
                <MenuGroup data-component-lab-menu-group="actions">
                  <MenuItem data-component-lab-menu-item="open">Open in editor</MenuItem>
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
        </ComponentLabStack>
      </HostView>
    </HostView>
  );
}
