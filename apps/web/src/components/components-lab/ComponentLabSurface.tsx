import catalog from "./catalog.json";
import type { ReactNode } from "react";

import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { HostHeading, HostText, HostView } from "../ui/hostElements";
import { Input } from "../ui/input";
import { Kbd, KbdGroup } from "../ui/kbd";
import { Separator } from "../ui/separator";
import { Switch } from "../ui/switch";
import { Textarea } from "../ui/textarea";

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
  return (
    <HostView className="component-lab-story" data-component-story={id}>
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
          <HostView className="component-lab-specimen-stack">
            <StoryLabel>Empty</StoryLabel>
            <Input aria-label="Empty input" placeholder="Search projects" />
            <StoryLabel>Value</StoryLabel>
            <Input aria-label="Filled input" value="t3code-lynxtron" />
            <StoryLabel>Disabled</StoryLabel>
            <Input aria-label="Disabled input" disabled value="Unavailable" />
          </HostView>
        </StoryFrame>

        <StoryFrame id="ui/textarea#Textarea" title="Textarea">
          <HostView className="component-lab-specimen-stack">
            <Textarea aria-label="Empty textarea" placeholder="Describe the change" />
            <Textarea aria-label="Filled textarea" value="Keep the renderer contract explicit." />
            <Textarea aria-label="Disabled textarea" disabled value="Read only" />
          </HostView>
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
      </HostView>
    </HostView>
  );
}
