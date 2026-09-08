import catalog from "./catalog.json";
import { type ReactNode, useState } from "react";
import { ComponentLabColumn, ComponentLabStack } from "./ComponentLabStack";

import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { HostButton, HostHeading, HostText, HostView } from "../ui/hostElements";
import { Input } from "../ui/input";
import { Kbd, KbdGroup } from "../ui/kbd";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { Separator } from "../ui/separator";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { Textarea } from "../ui/textarea";
import { Tooltip, TooltipPopup, TooltipProvider, TooltipTrigger } from "../ui/tooltip";

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

          <StoryFrame id="ui/select#Select" title="Select">
            <ComponentLabSelectStory />
          </StoryFrame>

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
                <MenuItem data-component-lab-menu-item="open">Open in editor</MenuItem>
                <MenuItem data-component-lab-menu-item="copy">Copy path</MenuItem>
              </MenuPopup>
            </Menu>
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
        </ComponentLabStack>
      </HostView>
    </HostView>
  );
}
