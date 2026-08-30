import {
  GeneralSettingsSelect,
  GeneralSettingsValueButton,
  SettingsRow,
} from "./generalSettingsHost";
import { useEffect, useState } from "@lynx-js/react";
import type { BackgroundActivityProfile, ProviderInstanceId } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import { ModelPicker } from "../../../../lynxtron/src/app/components/ModelPicker";
import { useT3ClientState } from "../../../../lynxtron/src/app/state/t3Client";
import {
  getGeneralSettingsSurfaceActions,
  type BackgroundActivityProfileOption,
} from "./generalSettingsStore";

export const GENERAL_SETTINGS_TEXT_GENERATION_MODEL_STATUS = undefined;
export const GENERAL_SETTINGS_TEXT_GENERATION_MODEL_UNAVAILABLE = false;

export function GeneralSettingsAboutContent({ versionLabel }: { readonly versionLabel: string }) {
  return (
    <SettingsRow
      title={`Version ${versionLabel}`}
      description="Current version of the application."
      status="Automatic updates and update-track selection are not yet available in Lynxtron."
    />
  );
}

const BACKGROUND_ACTIVITY_OPTIONS = [
  { value: "balanced", label: "Balanced" },
  { value: "performance", label: "Performance" },
  { value: "battery-saver", label: "Battery saver" },
] as const;

export function GeneralSettingsBackgroundActivityContent({
  description,
  onProfileChange,
  profile,
}: {
  readonly description: string;
  readonly onProfileChange: (profile: BackgroundActivityProfile) => void;
  readonly profile: BackgroundActivityProfileOption;
}) {
  const options =
    profile === "advanced"
      ? ([{ value: "advanced", label: "Advanced" }, ...BACKGROUND_ACTIVITY_OPTIONS] as const)
      : BACKGROUND_ACTIVITY_OPTIONS;
  return (
    <SettingsRow
      id="background-activity"
      title="Background activity"
      description={description}
      status={
        profile === "advanced"
          ? "Advanced interval controls remain available in Electron."
          : undefined
      }
      control={
        <GeneralSettingsSelect
          ariaLabel="Background activity profile"
          options={options}
          value={profile}
          onValueChange={(value) => {
            if (value !== "advanced") onProfileChange(value);
          }}
        />
      }
    />
  );
}

export function GeneralSettingsDiagnosticsControl({ onOpen }: { onOpen: () => void }) {
  return (
    <GeneralSettingsValueButton
      ariaLabel="View diagnostics"
      label="View diagnostics"
      onPress={onOpen}
    />
  );
}

export function GeneralSettingsTextGenerationModelControl({ label }: { label: string }) {
  const { models, providerEntries, providers, settings } = useT3ClientState();
  const [open, setOpen] = useState(false);
  const [activeProvider, setActiveProvider] = useState<ProviderInstanceId | "favorites">(
    settings?.textGenerationModelSelection?.instanceId ?? "favorites",
  );
  const selection = settings?.textGenerationModelSelection;
  useEffect(() => {
    if (!open && selection?.instanceId) setActiveProvider(selection.instanceId);
  }, [open, selection?.instanceId]);
  const selectedModel = models.find(
    (model) => model.instanceId === selection?.instanceId && model.slug === selection?.model,
  );
  return (
    <view className="settings-model-picker-anchor">
      <view
        aria-label="Text generation model"
        data-chat-provider-model-picker="true"
        data-floating-anchor="settings-model-picker"
        data-settings-model-picker-trigger
        className="select-box select-box--interactive"
        bindtap={() => setOpen((current) => !current)}
      >
        <text className="select-box__label" text-maxline="1">
          {selectedModel?.name ?? label}
        </text>
        <text className="select-box__chevron">⌄</text>
      </view>
      {open ? (
        <view className="settings-model-picker-overlay" data-settings-model-picker-overlay>
          <ModelPicker
            models={models}
            providers={providerEntries}
            providerSnapshots={providers}
            selectedModel={selectedModel}
            currentModelSelection={selection}
            currentProviderInstanceId={selection?.instanceId ?? null}
            activeProvider={activeProvider}
            onActiveProviderChange={setActiveProvider}
            onSelect={(model) => {
              getGeneralSettingsSurfaceActions().setTextGenerationModelSelection(
                createModelSelection(model.instanceId, model.slug),
              );
              setOpen(false);
            }}
            onClose={() => setOpen(false)}
          />
        </view>
      ) : null}
    </view>
  );
}
