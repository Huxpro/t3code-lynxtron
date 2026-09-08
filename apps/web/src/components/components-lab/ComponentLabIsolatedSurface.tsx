import isolatedCatalog from "./isolatedCatalog.json";

import { AppShellSurface } from "../AppShellSurface";
import { ModelPickerEmptySurface } from "../chat/ModelPickerSurface";
import { ComposerToolbarRow } from "../chat/ComposerSurface";
import { PaletteSectionSurface } from "../CommandPaletteSurface";
import {
  AccessListRowSurface,
  ArchivedThreadsSurface,
  SourceControlItemRowSurface,
  SourceControlMarkSurface,
} from "../settings/SettingsSurfaces";
import { HostHeading, HostText, HostView } from "../ui/hostElements";

export function ComponentLabIsolatedSurface({ storyId }: { readonly storyId: string }) {
  const story = isolatedCatalog.find((entry) => entry.id === storyId);
  if (!story) return null;
  const specimen = (() => {
    if (storyId === "chat/ModelPickerSurface#ModelPickerEmptySurface") {
      return (
        <HostView className="component-lab-model-picker-empty">
          <ModelPickerEmptySurface message="No models found" />
        </HostView>
      );
    }
    if (storyId === "CommandPaletteSurface#PaletteSectionSurface") {
      return (
        <HostView className="component-lab-palette-section">
          <PaletteSectionSurface label="Recent Threads" />
        </HostView>
      );
    }
    if (
      storyId === "settings/SettingsSurfaces#SourceControlMarkSurface" ||
      storyId === "settings/SettingsSurfaces#StatusDotSurface"
    ) {
      return (
        <HostView className="component-lab-source-control-marks component-lab-specimen-row">
          <SourceControlMarkSurface tone="success" />
          <SourceControlMarkSurface tone="warning" />
          <SourceControlMarkSurface tone="muted" />
        </HostView>
      );
    }
    if (storyId === "settings/SettingsSurfaces#SourceControlItemRowSurface") {
      return (
        <HostView className="component-lab-source-control-rows component-lab-specimen-stack">
          <SourceControlItemRowSurface
            badge={<HostText>Authenticated</HostText>}
            control={<HostText>Disable</HostText>}
            label="GitHub"
            mark={<SourceControlMarkSurface tone="success" />}
            summary="Detected CLI"
            version="2.81.0"
          />
        </HostView>
      );
    }
    if (storyId === "settings/SettingsSurfaces#AccessListRowSurface") {
      return (
        <HostView className="component-lab-access-list-rows component-lab-specimen-stack">
          <AccessListRowSurface
            control={<HostText>Revoke</HostText>}
            description="Connected · macOS · 4 scopes"
            primaryLabel="MacBook Pro"
            primaryTrailing={<HostText>This device</HostText>}
            statusDot={<SourceControlMarkSurface tone="success" />}
          />
        </HostView>
      );
    }
    if (storyId === "chat/ComposerSurface#ComposerToolbarRow") {
      return (
        <HostView className="component-lab-composer-toolbar" style={{ width: "320px" }}>
          <ComposerToolbarRow
            items={[
              <HostText data-component-lab-toolbar-item="model">Model</HostText>,
              <HostText data-component-lab-toolbar-item="runtime">Runtime</HostText>,
              <HostText data-component-lab-toolbar-item="mode">Mode</HostText>,
            ]}
          />
        </HostView>
      );
    }
    if (storyId === "AppShellSurface#AppShellSurface") {
      return (
        <HostView className="component-lab-app-shell">
          <AppShellSurface
            globalControl={<HostText data-component-lab-app-shell-slot="global">Global</HostText>}
            main={<HostText data-component-lab-app-shell-slot="main">Main</HostText>}
            sidebar={<HostText data-component-lab-app-shell-slot="sidebar">Sidebar</HostText>}
          />
        </HostView>
      );
    }
    if (storyId === "settings/SettingsSurfaces#ArchivedThreadsSurface") {
      return (
        <HostView className="component-lab-archived-threads" style={{ width: "512px" }}>
          <ArchivedThreadsSurface
            emptyDescription="Archived threads will appear here."
            emptyTitle="No archived threads"
            groups={[
              {
                key: "t3code",
                title: "t3code",
                threads: [
                  {
                    id: "thread-1",
                    title: "Investigate scroll anchor",
                    description: "Archived 2h · Created 5h",
                    action: <HostText>Unarchive</HostText>,
                  },
                ],
              },
            ]}
          />
        </HostView>
      );
    }
    return null;
  })();
  if (!specimen) return null;
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
          <HostView className="component-lab-story__canvas">{specimen}</HostView>
        </HostView>
      </HostView>
    </HostView>
  );
}
