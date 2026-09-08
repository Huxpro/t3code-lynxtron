import catalog from "./catalog.json";

import { ModelPickerEmptySurface } from "../chat/ModelPickerSurface";
import { HostHeading, HostText, HostView } from "../ui/hostElements";

export function ComponentLabIsolatedSurface({ storyId }: { readonly storyId: string }) {
  const story = catalog.find((entry) => entry.id === storyId);
  if (!story || storyId !== "chat/ModelPickerSurface#ModelPickerEmptySurface") return null;
  return (
    <HostView className="component-lab" data-component-lab="web-lynx-shared">
      <HostView className="component-lab__rail">
        <HostText className="component-lab__eyebrow">T3 CODE SYSTEM</HostText>
        <HostHeading className="component-lab__title">Components Lab</HostHeading>
      </HostView>
      <HostView className="component-lab__content">
        <HostView
          className="component-lab-story"
          data-component-states={story.states.join(",")}
          data-component-story={story.id}
        >
          <HostView className="component-lab-story__header">
            <HostHeading className="component-lab-story__title">{story.title}</HostHeading>
            <HostText className="component-lab-story__id">{story.id}</HostText>
          </HostView>
          <HostView className="component-lab-story__canvas">
            <HostView className="component-lab-model-picker-empty">
              <ModelPickerEmptySurface message="No models found" />
            </HostView>
          </HostView>
        </HostView>
      </HostView>
    </HostView>
  );
}
