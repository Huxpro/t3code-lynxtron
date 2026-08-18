import { useCallback, useMemo, useState } from "@lynx-js/react";
import {
  deriveModelPickerModels,
  describeUnavailableProviderInstance,
  type ModelPickerModel,
} from "@t3tools/client-runtime/presentation/model-picker";
import {
  getProviderSummary,
  getProviderVersionLabel,
  type ProviderInstanceEntry,
  type ProviderStatusKey,
} from "@t3tools/client-runtime/presentation/provider";
import {
  deriveProviderSettingsFields,
  nextProviderConfigWithFieldValue,
  readProviderConfigBoolean,
  readProviderConfigString,
  readProviderConfigStringArray,
  type ProviderSettingsSchema,
} from "@t3tools/client-runtime/presentation/provider-settings-fields";
import { withProviderCustomModels } from "@t3tools/client-runtime/presentation/provider-settings";
import {
  ClaudeSettings,
  CodexSettings,
  CursorSettings,
  GrokSettings,
  OpenCodeSettings,
  ProviderDriverKind,
  ProviderInstanceId,
  type ProviderInstanceConfig,
  type ProviderInstanceEnvironmentVariable,
  type ServerSettings,
} from "@t3tools/contracts";
import { ProviderInstanceCardSurface } from "../../../../web/src/components/settings/SettingsSurfaces";
import { DraftInput } from "../../../../web/src/components/ui/draft-input";
import { Textarea } from "../../../../web/src/components/ui/textarea";
import { t3ClientActions, useT3ClientState } from "../state/t3Client";
import type { ModelInfo } from "../bridge";
import { Icon } from "./Icon";
import { ProviderBrandIcon } from "./ProviderBrandIcon";
import { SettingsSection, SmallButton, SmallIconButton, Toggle } from "./SettingsControls";

interface ProviderCardProps {
  entry: ProviderInstanceEntry;
  instance: ProviderInstanceConfig;
  selectedModel: ModelInfo | undefined;
  updating: boolean;
  onSelectModel: (model: ModelInfo) => void;
  onEnabledChange: (instanceId: ProviderInstanceId, enabled: boolean) => void;
  onInstanceChange: (instanceId: ProviderInstanceId, instance: ProviderInstanceConfig) => void;
  onUpdateProvider: (instanceId: ProviderInstanceId) => void;
  onDelete: ((instanceId: ProviderInstanceId) => void) | undefined;
}

const PROVIDER_STATUS_DOT_CLASSES: Record<ProviderStatusKey, string> = {
  disabled: "provider-card__status-dot--warn",
  error: "provider-card__status-dot--error",
  ready: "provider-card__status-dot--ok",
  warning: "provider-card__status-dot--warn",
};

const PROVIDER_SETTINGS_SCHEMAS: Readonly<Record<string, ProviderSettingsSchema>> = {
  codex: CodexSettings,
  claudeAgent: ClaudeSettings,
  cursor: CursorSettings,
  grok: GrokSettings,
  opencode: OpenCodeSettings,
};

function effectiveProviderInstance(
  entry: ProviderInstanceEntry,
  settings: ServerSettings | undefined,
): ProviderInstanceConfig {
  const explicit = settings?.providerInstances[entry.instanceId];
  if (explicit) return explicit;
  const legacy = settings?.providers[entry.driverKind as keyof ServerSettings["providers"]];
  return {
    driver: entry.driverKind,
    enabled: entry.enabled,
    ...(entry.snapshot.displayName ? { displayName: entry.snapshot.displayName } : {}),
    ...(entry.snapshot.accentColor ? { accentColor: entry.snapshot.accentColor } : {}),
    ...(legacy ? { config: legacy } : {}),
  };
}

function ProviderConfigFields({
  entry,
  instance,
  onChange,
}: {
  entry: ProviderInstanceEntry;
  instance: ProviderInstanceConfig;
  onChange: (next: ProviderInstanceConfig) => void;
}) {
  const schema = PROVIDER_SETTINGS_SCHEMAS[entry.driverKind];
  const fields = useMemo(() => (schema ? deriveProviderSettingsFields(schema) : []), [schema]);
  if (fields.length === 0) return null;
  return (
    <view className="provider-card__config">
      {fields.map((field) => {
        const commit = (value: string | boolean) => {
          const config = nextProviderConfigWithFieldValue(instance.config, field, value);
          const { config: _config, ...rest } = instance;
          onChange(config ? { ...rest, config } : rest);
        };
        return (
          <view key={field.key} className="provider-card__config-field">
            <text className="provider-card__config-label">{field.label}</text>
            {field.control === "switch" ? (
              <Toggle
                ariaLabel={field.label}
                value={readProviderConfigBoolean(
                  instance.config,
                  field.key,
                  field.defaultBooleanValue,
                )}
                onChange={commit}
              />
            ) : field.control === "textarea" ? (
              <Textarea
                aria-label={field.label}
                value={readProviderConfigString(instance.config, field.key)}
                placeholder={field.placeholder}
                onChange={(event) => commit(event.currentTarget.value)}
              />
            ) : (
              <DraftInput
                aria-label={field.label}
                type={field.control === "password" ? "password" : undefined}
                value={readProviderConfigString(instance.config, field.key)}
                placeholder={field.placeholder}
                onCommit={commit}
              />
            )}
            {field.description ? (
              <text className="provider-card__config-description">{field.description}</text>
            ) : null}
          </view>
        );
      })}
    </view>
  );
}

function ProviderEnvironmentFields({
  instance,
  onChange,
}: {
  instance: ProviderInstanceConfig;
  onChange: (next: ProviderInstanceConfig) => void;
}) {
  const environment = instance.environment ?? [];
  const publish = (next: ReadonlyArray<ProviderInstanceEnvironmentVariable>) => {
    const { environment: _environment, ...rest } = instance;
    onChange(next.length > 0 ? { ...rest, environment: next } : rest);
  };
  const update = (index: number, patch: Partial<ProviderInstanceEnvironmentVariable>) => {
    publish(
      environment.map((variable, variableIndex) =>
        variableIndex === index
          ? {
              ...variable,
              ...patch,
              ...(patch.value !== undefined ? { valueRedacted: false } : {}),
            }
          : variable,
      ),
    );
  };
  return (
    <view className="provider-card__environment">
      <view className="provider-card__environment-header">
        <text className="provider-card__config-label">Environment variables</text>
        <SmallButton
          label="Add"
          onTap={() =>
            publish([
              ...environment,
              {
                name: `VARIABLE_${environment.length + 1}`,
                value: "",
                sensitive: true,
              },
            ])
          }
        />
      </view>
      {environment.length === 0 ? (
        <text className="provider-card__config-description">
          Add API keys, base URLs, or other per-instance CLI settings.
        </text>
      ) : (
        environment.map((variable, index) => (
          <view key={`${variable.name}-${index}`} className="provider-card__environment-row">
            <DraftInput
              aria-label={`Environment variable name ${index + 1}`}
              value={variable.name}
              placeholder="VARIABLE_NAME"
              onCommit={(name) => {
                const normalized = name.trim();
                if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(normalized)) {
                  update(index, { name: normalized });
                }
              }}
            />
            <DraftInput
              aria-label={`Environment variable value ${index + 1}`}
              type={variable.sensitive ? "password" : undefined}
              value={variable.valueRedacted ? "" : variable.value}
              placeholder={variable.valueRedacted ? "Stored secret" : "Value"}
              onCommit={(value) => update(index, { value })}
            />
            <view className="provider-card__environment-actions">
              <Toggle
                ariaLabel={`Mark environment variable ${variable.name} as sensitive`}
                value={variable.sensitive}
                onChange={(sensitive) => update(index, { sensitive })}
              />
              <SmallButton
                label="Remove"
                onTap={() =>
                  publish(environment.filter((_, variableIndex) => variableIndex !== index))
                }
              />
            </view>
          </view>
        ))
      )}
    </view>
  );
}

function ProviderCard({
  entry,
  instance,
  selectedModel,
  updating,
  onSelectModel,
  onEnabledChange,
  onInstanceChange,
  onUpdateProvider,
  onDelete,
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
  const unavailableReason = describeUnavailableProviderInstance(entry);
  const canUpdate =
    entry.snapshot.versionAdvisory?.status === "behind_latest" &&
    entry.snapshot.versionAdvisory.canUpdate === true &&
    entry.snapshot.versionAdvisory.updateCommand !== null;
  const customModels = readProviderConfigStringArray(instance.config, "customModels");
  const [customModelDraft, setCustomModelDraft] = useState("");

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
          <ProviderBrandIcon driverKind={entry.driverKind} size={16} />
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
      titleTrailing={
        canUpdate ? (
          <SmallButton
            label={updating ? "Updating…" : "Update"}
            onTap={updating ? undefined : () => onUpdateProvider(entry.instanceId)}
          />
        ) : undefined
      }
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
            <view className="provider-card__config-field">
              <text className="provider-card__config-label">Display name</text>
              <DraftInput
                aria-label={`${entry.displayName} display name`}
                value={instance.displayName ?? ""}
                placeholder={entry.displayName}
                onCommit={(displayName) => {
                  const normalized = displayName.trim();
                  const { displayName: _displayName, ...rest } = instance;
                  onInstanceChange(
                    entry.instanceId,
                    normalized ? { ...rest, displayName: normalized } : rest,
                  );
                }}
              />
            </view>
            <view className="provider-card__config-field">
              <text className="provider-card__config-label">Accent color</text>
              <DraftInput
                aria-label={`${entry.displayName} accent color`}
                value={instance.accentColor ?? ""}
                placeholder="#2563eb"
                onCommit={(accentColor) => {
                  const normalized = accentColor.trim();
                  const { accentColor: _accentColor, ...rest } = instance;
                  onInstanceChange(
                    entry.instanceId,
                    normalized ? { ...rest, accentColor: normalized } : rest,
                  );
                }}
              />
            </view>
            <ProviderConfigFields
              entry={entry}
              instance={instance}
              onChange={(next) => onInstanceChange(entry.instanceId, next)}
            />
            <ProviderEnvironmentFields
              instance={instance}
              onChange={(next) => onInstanceChange(entry.instanceId, next)}
            />
            <view className="provider-card__custom-models">
              <text className="provider-card__config-label">Custom models</text>
              <view className="provider-card__custom-model-add">
                <DraftInput
                  aria-label={`Add custom model to ${entry.displayName}`}
                  value={customModelDraft}
                  placeholder="model-slug"
                  onCommit={setCustomModelDraft}
                />
                <SmallButton
                  label="Add model"
                  onTap={() => {
                    const normalized = customModelDraft.trim();
                    if (!normalized) return;
                    onInstanceChange(
                      entry.instanceId,
                      withProviderCustomModels(instance, [...customModels, normalized]),
                    );
                    setCustomModelDraft("");
                  }}
                />
              </view>
              {customModels.map((model) => (
                <view key={model} className="provider-card__custom-model-row">
                  <text className="provider-card__model-slug">{model}</text>
                  <SmallButton
                    label="Remove"
                    onTap={() =>
                      onInstanceChange(
                        entry.instanceId,
                        withProviderCustomModels(
                          instance,
                          customModels.filter((candidate) => candidate !== model),
                        ),
                      )
                    }
                  />
                </view>
              ))}
            </view>
            {models.map((model) => {
              const isSelected =
                selectedModel?.instanceId === model.instanceId &&
                selectedModel?.slug === model.slug;
              return (
                <view
                  key={`${model.instanceId}-${model.slug}`}
                  className={
                    unavailableReason
                      ? "provider-card__model provider-card__model--disabled"
                      : isSelected
                        ? "provider-card__model provider-card__model--selected"
                        : "provider-card__model"
                  }
                  aria-disabled={unavailableReason ? "true" : undefined}
                  bindtap={unavailableReason ? undefined : () => handleSelect(model)}
                >
                  <view className="provider-card__model-info">
                    <text className="provider-card__model-name">{model.name}</text>
                    <text className="provider-card__model-slug">
                      {unavailableReason ?? model.slug}
                    </text>
                  </view>
                  {isSelected ? <text className="provider-card__model-check-text">✓</text> : null}
                </view>
              );
            })}
            {onDelete ? (
              <SmallButton label="Delete instance" onTap={() => onDelete(entry.instanceId)} />
            ) : null}
          </view>
        ) : undefined
      }
    />
  );
}

export function ProviderSettings() {
  const {
    providerEntries,
    settings,
    selectedModel,
    providersRefreshPending,
    providerUpdatePending,
    providerSettingsError,
  } = useT3ClientState();
  const {
    refreshProviders,
    setModelSelection,
    setProviderEnabled,
    updateProvider,
    updateProviderInstance,
  } = t3ClientActions;
  const [newDriver, setNewDriver] = useState<"codex" | "claudeAgent">("codex");
  const [newInstanceId, setNewInstanceId] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");

  const handleSelectModel = useCallback(
    (model: ModelInfo) => {
      setModelSelection(model);
    },
    [setModelSelection],
  );

  return (
    <view className="settings-panel">
      <SettingsSection
        title="Providers"
        headerAction={
          <SmallIconButton
            label="Refresh provider status"
            disabled={providersRefreshPending}
            icon={
              <Icon
                name="refresh-cw"
                size={14}
                color="#a1a1aa"
                className={providersRefreshPending ? "provider-refresh-icon--pending" : undefined}
              />
            }
            onTap={() => {
              void refreshProviders().catch(() => undefined);
            }}
          />
        }
      >
        <view className="provider-instance-create">
          <text className="provider-card__config-label">Add provider instance</text>
          <view className="provider-instance-create__driver">
            <SmallButton label="Codex" onTap={() => setNewDriver("codex")} />
            <SmallButton label="Claude" onTap={() => setNewDriver("claudeAgent")} />
          </view>
          <DraftInput
            aria-label="New provider instance ID"
            value={newInstanceId}
            placeholder={`${newDriver}_work`}
            onCommit={setNewInstanceId}
          />
          <DraftInput
            aria-label="New provider display name"
            value={newDisplayName}
            placeholder={newDriver === "codex" ? "Work Codex" : "Work Claude"}
            onCommit={setNewDisplayName}
          />
          <SmallButton
            label="Add instance"
            onTap={() => {
              const instanceId = newInstanceId.trim();
              if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(instanceId)) return;
              void t3ClientActions
                .createProviderInstance(ProviderInstanceId.make(instanceId), {
                  driver: ProviderDriverKind.make(newDriver),
                  enabled: true,
                  ...(newDisplayName.trim() ? { displayName: newDisplayName.trim() } : {}),
                })
                .then(() => {
                  setNewInstanceId("");
                  setNewDisplayName("");
                })
                .catch(() => undefined);
            }}
          />
        </view>
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
              instance={effectiveProviderInstance(entry, settings)}
              selectedModel={selectedModel}
              updating={providerUpdatePending === entry.instanceId}
              onSelectModel={handleSelectModel}
              onEnabledChange={setProviderEnabled}
              onInstanceChange={(instanceId, instance) => {
                void updateProviderInstance(instanceId, instance).catch(() => undefined);
              }}
              onUpdateProvider={(instanceId) => {
                void updateProvider(instanceId).catch(() => undefined);
              }}
              onDelete={
                entry.isDefault
                  ? undefined
                  : (instanceId) => {
                      void t3ClientActions
                        .deleteProviderInstance(instanceId)
                        .catch(() => undefined);
                    }
              }
            />
          ))
        )}
      </SettingsSection>
    </view>
  );
}
