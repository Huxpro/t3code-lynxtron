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
  const isActive = selectedModel?.instanceId === entry.instanceId;
  const statusKey: ProviderStatusKey = entry.enabled ? entry.status : "disabled";
  const summary = getProviderSummary({
    ...entry.snapshot,
    enabled: entry.enabled,
  });
  const versionLabel = getProviderVersionLabel(entry.snapshot.version);
  const statusLine = [
    updating ? "Updating…" : summary.headline,
    versionLabel,
    `${models.length} model${models.length === 1 ? "" : "s"}`,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" · ");

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
    <view className={expanded ? "provider-card provider-card--expanded" : "provider-card"}>
      <view className="provider-card__header">
        <view className="provider-card__logo-wrap">
          {entry.driverKind === "claudeAgent" ? (
            <Icon name="claude" size={16} className="provider-card__logo-img" />
          ) : (
            <view className="provider-card__logo-fallback">
              <text className="provider-card__logo-fallback-text">
                {entry.displayName.slice(0, 1)}
              </text>
            </view>
          )}
          <view className={`provider-card__status-dot ${PROVIDER_STATUS_DOT_CLASSES[statusKey]}`} />
        </view>
        <view className="provider-card__info">
          <view className="provider-card__name-row">
            <text className="provider-card__name">{entry.displayName}</text>
            {isActive ? (
              <view className="provider-card__badge">
                <text className="provider-card__badge-text">Active</text>
              </view>
            ) : null}
          </view>
          <text className="provider-card__status">{statusLine}</text>
          {summary.detail ? <text className="provider-card__status">{summary.detail}</text> : null}
        </view>
        <view className="provider-card__right">
          <view className="provider-card__chevron-btn" bindtap={toggleExpand}>
            <Icon
              name={expanded ? "chevron-down" : "chevron-right"}
              size={16}
              color="#a1a1aa"
              className="provider-card__chevron-img"
            />
          </view>
          <Toggle value={entry.enabled} onChange={handleEnabledChange} />
        </view>
      </view>

      {expanded ? (
        <view className="provider-card__body">
          {models.map((model) => {
            const isSelected =
              selectedModel?.instanceId === model.instanceId && selectedModel?.slug === model.slug;
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
      ) : null}
    </view>
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
