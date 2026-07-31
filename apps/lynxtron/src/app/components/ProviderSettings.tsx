import { useCallback, useMemo, useState } from "@lynx-js/react";
import {
  deriveModelPickerModels,
  type ModelPickerModel,
} from "@t3tools/client-runtime/presentation/model-picker";
import {
  getProviderSummary,
  getProviderVersionLabel,
  type ProviderInstanceEntry,
  type ProviderStatusKey,
} from "@t3tools/client-runtime/presentation/provider";
import type { ProviderInstanceId } from "@t3tools/contracts";
import { ProviderInstanceCardSurface } from "../../../../web/src/components/settings/SettingsSurfaces";
import { t3ClientActions, useT3ClientState } from "../state/t3Client";
import type { ModelInfo } from "../bridge";
import { Icon } from "./Icon";
import { SettingsSection, Toggle } from "./SettingsControls";

interface ProviderCardProps {
  entry: ProviderInstanceEntry;
  selectedModel: ModelInfo | undefined;
  updating: boolean;
  onSelectModel: (model: ModelInfo) => void;
  onEnabledChange: (instanceId: ProviderInstanceId, enabled: boolean) => void;
}

const PROVIDER_STATUS_DOT_CLASSES: Record<ProviderStatusKey, string> = {
  disabled: "provider-card__status-dot--warn",
  error: "provider-card__status-dot--error",
  ready: "provider-card__status-dot--ok",
  warning: "provider-card__status-dot--warn",
};

function ProviderCard({
  entry,
  selectedModel,
  updating,
  onSelectModel,
  onEnabledChange,
}: ProviderCardProps) {
  const [expanded, setExpanded] = useState(false);
  const models = useMemo(
    () => deriveModelPickerModels([entry], { includeDisabled: true }),
    [entry],
  );
  const statusKey: ProviderStatusKey = entry.enabled ? entry.status : "disabled";
  const summary = getProviderSummary({
    ...entry.snapshot,
    enabled: entry.enabled,
  });
  const versionLabel = getProviderVersionLabel(entry.snapshot.version);

  const toggleExpand = useCallback(() => setExpanded((previous) => !previous), []);
  const handleSelect = useCallback(
    (model: ModelPickerModel) => onSelectModel(model),
    [onSelectModel],
  );
  const handleEnabledChange = useCallback(
    (enabled: boolean) => {
      if (!updating) onEnabledChange(entry.instanceId, enabled);
    },
    [entry.instanceId, onEnabledChange, updating],
  );

  return (
    <ProviderInstanceCardSurface
      icon={
        <view className="provider-card__logo-wrap">
          {entry.driverKind === "claudeAgent" ? (
            <Icon name="claude" size={16} />
          ) : (
            <view className="provider-card__logo-fallback">
              <text className="provider-card__logo-fallback-text">
                {entry.displayName.slice(0, 1)}
              </text>
            </view>
          )}
          <view className={`provider-card__status-dot ${PROVIDER_STATUS_DOT_CLASSES[statusKey]}`} />
        </view>
      }
      title={entry.displayName}
      version={
        versionLabel ? (
          <text className="text-xs text-muted-foreground">{versionLabel}</text>
        ) : undefined
      }
      summaryHeadline={updating ? "Updating…" : summary.headline}
      summaryDetail={summary.detail ?? undefined}
      expanded={expanded}
      onToggleExpanded={toggleExpand}
      toggleAriaLabel={`Toggle ${entry.displayName} details`}
      expandChevron={
        <Icon name={expanded ? "chevron-down" : "chevron-right"} size={16} color="#a1a1aa" />
      }
      toggle={<Toggle value={entry.enabled} onChange={handleEnabledChange} />}
      body={
        expanded ? (
          <view className="provider-card__body">
            {models.map((model) => {
              const isSelected =
                selectedModel?.instanceId === model.instanceId &&
                selectedModel?.slug === model.slug;
              return (
                <view
                  key={`${model.instanceId}-${model.slug}`}
                  className={
                    isSelected
                      ? "provider-card__model provider-card__model--selected"
                      : "provider-card__model"
                  }
                  bindtap={() => handleSelect(model)}
                >
                  <view className="provider-card__model-info">
                    <text className="provider-card__model-name">{model.name}</text>
                    <text className="provider-card__model-slug">{model.slug}</text>
                  </view>
                  {isSelected ? <text className="provider-card__model-check-text">✓</text> : null}
                </view>
              );
            })}
          </view>
        ) : undefined
      }
    />
  );
}

export function ProviderSettings() {
  const { providerEntries, selectedModel, providerUpdatePending, providerSettingsError } =
    useT3ClientState();
  const { setModelSelection, setProviderEnabled } = t3ClientActions;

  const handleSelectModel = useCallback(
    (model: ModelInfo) => {
      setModelSelection(model);
    },
    [setModelSelection],
  );

  return (
    <view className="settings-panel">
      <SettingsSection title="Providers">
        {providerSettingsError ? (
          <view className="settings-empty">
            <text className="settings-empty__text">
              Could not update provider: {providerSettingsError}
            </text>
          </view>
        ) : null}
        {providerEntries.length === 0 ? (
          <view className="settings-empty">
            <text className="settings-empty__text">
              No providers configured. Connect to a provider to get started.
            </text>
          </view>
        ) : (
          providerEntries.map((entry) => (
            <ProviderCard
              key={entry.instanceId}
              entry={entry}
              selectedModel={selectedModel}
              updating={providerUpdatePending === entry.instanceId}
              onSelectModel={handleSelectModel}
              onEnabledChange={setProviderEnabled}
            />
          ))
        )}
      </SettingsSection>
    </view>
  );
}
