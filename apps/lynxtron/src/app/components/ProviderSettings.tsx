import { useCallback, useEffect, useMemo, useRef, useState } from "@lynx-js/react";
import {
  deriveModelPickerModels,
  describeUnavailableProviderInstance,
  type ModelPickerModel,
} from "@t3tools/client-runtime/presentation/model-picker";
import { redactSourceControlAccount } from "@t3tools/client-runtime/presentation/source-control";
import {
  getProviderSummary,
  getProviderVersionLabel,
  normalizeProviderAccentColor,
  sortProviderInstanceEntries,
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
  DEFAULT_SERVER_SETTINGS,
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
import {
  getBackgroundActivityPresetSettings,
  resolveServerBackgroundActivitySettings,
} from "@t3tools/shared/backgroundActivitySettings";
import * as Duration from "effect/Duration";
import {
  ADD_PROVIDER_WIZARD_STEPS,
  resolveWizardNavigation,
} from "../../../../web/src/components/settings/AddProviderInstanceDialog.logic";
import { ProviderInstanceCardSurface } from "../../../../web/src/components/settings/SettingsSurfaces";
import {
  backgroundActivityOverrideSettings,
  durationToSeconds,
  normalizeIntervalSeconds,
  PROVIDER_HEALTH_INTERVAL_STEP_SECONDS,
} from "../../../../web/src/components/settings/SettingsPanels.logic";
import { DraftInput } from "../../../../web/src/components/ui/draft-input";
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
} from "../../../../web/src/components/ui/number-field";
import { Textarea } from "../../../../web/src/components/ui/textarea";
import { t3ClientActions, useT3ClientState } from "../state/t3Client";
import { uiActions } from "../state/uiState";
import type { ModelInfo } from "../bridge";
import { Icon } from "./Icon";
import { ProviderBrandIcon } from "./ProviderBrandIcon";
import {
  SettingsRow,
  SettingsSection,
  SmallButton,
  SmallIconButton,
  Toggle,
} from "./SettingsControls";

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

const PROVIDER_SETTINGS_DRIVER_ORDER = Object.keys(PROVIDER_SETTINGS_SCHEMAS).map((driver) =>
  ProviderDriverKind.make(driver),
);

const PROVIDER_ACCENT_SWATCHES = [
  "#2563eb",
  "#16a34a",
  "#ea580c",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
] as const;

const COMING_SOON_PROVIDER_DRIVERS = [
  { driver: ProviderDriverKind.make("githubCopilot"), label: "Github Copilot" },
  { driver: ProviderDriverKind.make("gemini"), label: "Gemini" },
  { driver: ProviderDriverKind.make("acpRegistry"), label: "ACP Registry" },
  { driver: ProviderDriverKind.make("piAgent"), label: "Pi Agent" },
] as const;

const PROVIDER_MOTION_DURATION_MS = 200;

const PROVIDER_DRIVER_LABELS: Readonly<Record<string, string>> = {
  codex: "Codex",
  claudeAgent: "Claude",
  cursor: "Cursor",
  grok: "Grok",
  opencode: "OpenCode",
};

function providerLabel(driver: ProviderDriverKind): string {
  return PROVIDER_DRIVER_LABELS[driver] ?? String(driver);
}

function deriveProviderInstanceId(driver: ProviderDriverKind, label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return slug ? `${driver}_${slug}` : "";
}

function validateProviderInstanceId(
  instanceId: string,
  existingIds: ReadonlyArray<string>,
): string | null {
  if (!instanceId) return "Instance ID is required.";
  if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(instanceId)) {
    return "Instance ID must start with a letter and use only letters, digits, '-', or '_'.";
  }
  if (existingIds.includes(instanceId)) {
    return `An instance named '${instanceId}' already exists.`;
  }
  return null;
}

function prefersReducedMotion(): boolean {
  const target = globalThis as {
    readonly matchMedia?: (query: string) => { readonly matches: boolean };
  };
  return target.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

type ProviderMotionPhase = "closed" | "entering" | "open" | "exiting";

function useProviderPresence(open: boolean): {
  readonly phase: ProviderMotionPhase;
  readonly present: boolean;
} {
  const [present, setPresent] = useState(open);
  const [phase, setPhase] = useState<ProviderMotionPhase>(open ? "open" : "closed");
  const presentRef = useRef(open);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (prefersReducedMotion()) {
      presentRef.current = open;
      setPresent(open);
      setPhase(open ? "open" : "closed");
      return;
    }
    if (open) {
      presentRef.current = true;
      setPresent(true);
      setPhase("entering");
      timerRef.current = setTimeout(() => {
        setPhase("open");
        timerRef.current = null;
      }, PROVIDER_MOTION_DURATION_MS);
      return;
    }
    if (!presentRef.current) {
      setPhase("closed");
      return;
    }
    setPhase("exiting");
    timerRef.current = setTimeout(() => {
      presentRef.current = false;
      setPresent(false);
      setPhase("closed");
      timerRef.current = null;
    }, PROVIDER_MOTION_DURATION_MS);
  }, [open]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    [],
  );

  return { phase, present };
}

function inputValue(event: unknown): string {
  const input = event as {
    readonly detail?: { readonly value?: unknown };
    readonly target?: { readonly value?: unknown };
    readonly currentTarget?: { readonly value?: unknown };
  };
  const value = input.detail?.value ?? input.target?.value ?? input.currentTarget?.value;
  return typeof value === "string" ? value : "";
}

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
  driver,
  instance,
  onChange,
}: {
  driver: ProviderDriverKind;
  instance: ProviderInstanceConfig;
  onChange: (next: ProviderInstanceConfig) => void;
}) {
  const schema = PROVIDER_SETTINGS_SCHEMAS[driver];
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
  const bodyPresence = useProviderPresence(expanded);
  const [authEmailRevealed, setAuthEmailRevealed] = useState(false);
  const models = useMemo(
    () => deriveModelPickerModels([entry], { includeDisabled: true }),
    [entry],
  );
  const statusKey: ProviderStatusKey = entry.enabled ? entry.status : "disabled";
  const summary = getProviderSummary({
    ...entry.snapshot,
    enabled: entry.enabled,
  });
  const authEmail = entry.snapshot.auth.email?.trim();
  const authenticatedDetail =
    entry.snapshot.auth.status === "authenticated" && authEmail
      ? (entry.snapshot.auth.label ?? entry.snapshot.auth.type ?? null)
      : null;
  const summaryHeadline =
    entry.snapshot.auth.status === "authenticated" && authEmail
      ? `Authenticated as ${
          authEmailRevealed ? authEmail : redactSourceControlAccount(authEmail)
        }${authenticatedDetail ? ` · ${authenticatedDetail}` : ""}`
      : `${summary.headline}${summary.detail ? ` - ${summary.detail}` : ""}`;
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
      badge={
        entry.driverKind === "cursor" || entry.driverKind === "grok" ? (
          <text className="provider-card__badge">Early Access</text>
        ) : undefined
      }
      version={
        versionLabel ? (
          <text className="text-xs text-muted-foreground">{versionLabel}</text>
        ) : undefined
      }
      summaryHeadline={updating ? "Updating…" : summaryHeadline}
      summaryAriaLabel={
        entry.snapshot.auth.status === "authenticated" && authEmail
          ? authEmailRevealed
            ? "Hide account email"
            : "Reveal account email"
          : undefined
      }
      onSummaryClick={
        entry.snapshot.auth.status === "authenticated" && authEmail
          ? () => setAuthEmailRevealed((current) => !current)
          : undefined
      }
      titleTrailing={
        canUpdate ? (
          <SmallIconButton
            label={updating ? "Updating provider" : "Update available — update provider"}
            disabled={updating}
            icon={<Icon name="arrow-up" size={12} color="#818181" />}
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
      toggle={
        <Toggle
          ariaLabel={`Enable ${entry.displayName}`}
          value={entry.enabled}
          onChange={handleEnabledChange}
        />
      }
      body={
        bodyPresence.present ? (
          <view
            className={`provider-card__body provider-card__body--${bodyPresence.phase}`}
            data-provider-card-expanded={expanded ? "true" : "false"}
            data-provider-card-motion={bodyPresence.phase}
          >
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
              driver={entry.driverKind}
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
              <SmallButton
                className="provider-card__delete-instance"
                label="Delete instance"
                onTap={() => onDelete(entry.instanceId)}
              />
            ) : null}
          </view>
        ) : undefined
      }
    />
  );
}

export function AddProviderInstanceDialog({
  open,
  onClose,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
}) {
  const { settings } = useT3ClientState();
  const presence = useProviderPresence(open);
  const wasOpenRef = useRef(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [driver, setDriver] = useState(ProviderDriverKind.make("codex"));
  const [label, setLabel] = useState("");
  const [instanceIdDraft, setInstanceIdDraft] = useState("");
  const [accentColor, setAccentColor] = useState("");
  const [configByDriver, setConfigByDriver] = useState<Readonly<Record<string, unknown>>>({});
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const navigationGuardRef = useRef(0);
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setWizardStep(0);
      setDriver(ProviderDriverKind.make("codex"));
      setLabel("");
      setInstanceIdDraft("");
      setAccentColor("");
      setConfigByDriver({});
      setHasAttemptedSubmit(false);
      setError(null);
      setSaving(false);
    }
    wasOpenRef.current = open;
  }, [open]);
  const instanceId = instanceIdDraft.trim() || deriveProviderInstanceId(driver, label);
  const existingIds = Object.keys(settings?.providerInstances ?? {});
  const instanceIdError = validateProviderInstanceId(instanceId, existingIds);
  const configDraft = configByDriver[driver];
  const instanceDraft: ProviderInstanceConfig = {
    driver,
    enabled: true,
    ...(label.trim() ? { displayName: label.trim() } : {}),
    ...(normalizeProviderAccentColor(accentColor)
      ? { accentColor: normalizeProviderAccentColor(accentColor) }
      : {}),
    ...(configDraft === undefined ? {} : { config: configDraft }),
  };
  const navigateToStep = useCallback(
    (requestedStep: number) => {
      const now = Date.now();
      if (requestedStep > wizardStep && now - navigationGuardRef.current < 250) return;
      navigationGuardRef.current = now;
      const navigation = resolveWizardNavigation(
        wizardStep,
        requestedStep,
        ADD_PROVIDER_WIZARD_STEPS.length,
        { instanceIdError },
      );
      if (navigation.kind === "blocked") {
        setHasAttemptedSubmit(true);
        setError(navigation.error);
      } else {
        setError(null);
      }
      setWizardStep(navigation.step);
    },
    [instanceIdError, wizardStep],
  );
  const save = useCallback(() => {
    setHasAttemptedSubmit(true);
    if (instanceIdError) {
      setError(instanceIdError);
      return;
    }
    setSaving(true);
    setError(null);
    void t3ClientActions
      .createProviderInstance(ProviderInstanceId.make(instanceId), instanceDraft)
      .then(onClose)
      .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setSaving(false));
  }, [instanceDraft, instanceId, instanceIdError, onClose]);

  if (!presence.present) return null;

  return (
    <>
      <view
        className={`provider-instance-dialog-overlay provider-instance-dialog-overlay--${presence.phase}`}
        aria-label="Dismiss Add provider instance"
        data-provider-dialog-motion={presence.phase}
        bindtap={onClose}
      />
      <view
        className={`provider-instance-dialog provider-instance-dialog--${presence.phase} flex flex-col`}
        aria-label="Add provider instance"
        data-provider-instance-dialog="true"
        data-provider-dialog-motion={presence.phase}
        data-provider-wizard-step={String(wizardStep)}
        catchtap={() => undefined}
      >
        <view className="provider-instance-dialog__close" aria-label="Close" bindtap={onClose}>
          <Icon name="x" size={16} color="#818181" />
        </view>
        <view className="provider-instance-dialog__header flex flex-col">
          <text className="provider-instance-dialog__title">Add provider instance</text>
          <text className="provider-instance-dialog__description">
            Configure an additional provider instance — for example, a second Codex install pointed
            at a different workspace.
          </text>
          <view className="provider-instance-dialog__steps">
            {ADD_PROVIDER_WIZARD_STEPS.map((step, index) => (
              <view
                key={step}
                className={
                  index === wizardStep
                    ? "provider-instance-dialog__step provider-instance-dialog__step--active"
                    : "provider-instance-dialog__step"
                }
                aria-current={index === wizardStep ? "step" : undefined}
                aria-label={`${step}, step ${index + 1}`}
                bindtap={() => navigateToStep(index)}
              >
                <view className="provider-instance-dialog__step-number">
                  <text className="provider-instance-dialog__step-number-label">
                    {index < wizardStep ? "✓" : String(index + 1)}
                  </text>
                </view>
                <text className="provider-instance-dialog__step-label">{step}</text>
              </view>
            ))}
          </view>
        </view>
        <scroll-view
          className="provider-instance-dialog__body"
          scroll-y
          scroll-orientation="vertical"
        >
          <view
            className={`provider-instance-dialog__step-content provider-instance-dialog__step-content--${wizardStep}`}
          >
            {wizardStep === 0 ? (
              <>
                <view className="provider-instance-dialog__driver-heading" flatten={false}>
                  <text className="provider-instance-dialog__label">Driver</text>
                </view>
                <view className="provider-instance-dialog__drivers">
                  {PROVIDER_SETTINGS_DRIVER_ORDER.map((option) => (
                    <view
                      key={option}
                      className={
                        option === driver
                          ? "provider-instance-dialog__driver provider-instance-dialog__driver--selected"
                          : "provider-instance-dialog__driver"
                      }
                      aria-checked={option === driver ? "true" : "false"}
                      bindtap={() => setDriver(option)}
                    >
                      <ProviderBrandIcon driverKind={option} size={16} />
                      <text className="provider-instance-dialog__driver-label">
                        {providerLabel(option)}
                      </text>
                      {option === "cursor" || option === "grok" ? (
                        <text className="provider-instance-dialog__early-access">Early Access</text>
                      ) : null}
                      {option === driver ? (
                        <text className="provider-instance-dialog__driver-check">✓</text>
                      ) : null}
                    </view>
                  ))}
                  {COMING_SOON_PROVIDER_DRIVERS.map((option) => (
                    <view
                      key={option.driver}
                      className="provider-instance-dialog__driver provider-instance-dialog__driver--disabled"
                      aria-disabled="true"
                    >
                      <text className="provider-instance-dialog__driver-label">{option.label}</text>
                      <text className="provider-instance-dialog__coming-soon">Coming Soon</text>
                    </view>
                  ))}
                </view>
              </>
            ) : null}
            {wizardStep === 1 ? (
              <>
                <view className="provider-instance-dialog__identity-field" flatten={false}>
                  <text className="provider-instance-dialog__label">Label</text>
                  <view className="provider-instance-dialog__input-shell" flatten={false}>
                    <input
                      className="provider-instance-dialog__input"
                      aria-label="Provider instance label"
                      placeholder="e.g. Work"
                      {...({ value: label } as object)}
                      bindinput={(event: unknown) => {
                        setLabel(inputValue(event));
                        if (hasAttemptedSubmit) setError(null);
                      }}
                    />
                  </view>
                  <view className="provider-instance-dialog__helper" flatten={false}>
                    <text className="provider-instance-dialog__hint">
                      Shown in the provider list. Optional.
                    </text>
                  </view>
                </view>
                <view className="provider-instance-dialog__identity-field" flatten={false}>
                  <text className="provider-instance-dialog__label">Instance ID</text>
                  <view className="provider-instance-dialog__input-shell" flatten={false}>
                    <input
                      className="provider-instance-dialog__input"
                      aria-label="Provider instance ID"
                      placeholder={`${driver}_work`}
                      {...({ value: instanceId } as object)}
                      bindinput={(event: unknown) => {
                        setInstanceIdDraft(inputValue(event));
                        if (hasAttemptedSubmit) setError(null);
                      }}
                    />
                  </view>
                  <view className="provider-instance-dialog__helper" flatten={false}>
                    {hasAttemptedSubmit && instanceIdError ? (
                      <text className="provider-instance-dialog__error">
                        {error ?? instanceIdError}
                      </text>
                    ) : (
                      <text className="provider-instance-dialog__hint">
                        Routing key used by threads and sessions. Letters, digits, '-', or '_'.
                      </text>
                    )}
                  </view>
                </view>
                <view className="provider-instance-dialog__identity-field" flatten={false}>
                  <text className="provider-instance-dialog__label">Accent color</text>
                  <view className="provider-instance-dialog__swatches">
                    {PROVIDER_ACCENT_SWATCHES.map((swatch) => (
                      <view
                        key={swatch}
                        className={
                          accentColor === swatch
                            ? "provider-instance-dialog__swatch provider-instance-dialog__swatch--selected"
                            : "provider-instance-dialog__swatch"
                        }
                        aria-label={`Use ${swatch} accent`}
                        style={{ backgroundColor: swatch }}
                        bindtap={() => setAccentColor(swatch)}
                      />
                    ))}
                  </view>
                  <view className="provider-instance-dialog__helper" flatten={false}>
                    <text className="provider-instance-dialog__hint">
                      Optional marker shown in the picker.
                    </text>
                  </view>
                </view>
              </>
            ) : null}
            {wizardStep === 2 ? (
              <ProviderConfigFields
                driver={driver}
                instance={instanceDraft}
                onChange={(next) =>
                  setConfigByDriver((current) => ({
                    ...current,
                    [driver]: next.config ?? {},
                  }))
                }
              />
            ) : null}
          </view>
        </scroll-view>
        <view className="provider-instance-dialog__footer">
          <SmallButton
            className="provider-instance-dialog__secondary"
            label={wizardStep === 0 ? "Cancel" : "Back"}
            onTap={() => {
              if (wizardStep === 0) onClose();
              else navigateToStep(wizardStep - 1);
            }}
          />
          {wizardStep < ADD_PROVIDER_WIZARD_STEPS.length - 1 ? (
            <view
              className="provider-instance-dialog__save"
              bindtap={() => navigateToStep(wizardStep + 1)}
            >
              <text className="provider-instance-dialog__save-label">Next</text>
            </view>
          ) : (
            <view
              className={
                saving
                  ? "provider-instance-dialog__save provider-instance-dialog__save--disabled"
                  : "provider-instance-dialog__save"
              }
              aria-disabled={saving ? "true" : undefined}
              bindtap={saving ? undefined : save}
            >
              <text className="provider-instance-dialog__save-label">
                {saving ? "Adding…" : "Add instance"}
              </text>
            </view>
          )}
        </view>
      </view>
    </>
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
  const effectiveSettings = settings ?? DEFAULT_SERVER_SETTINGS;
  const resolvedBackgroundActivity = resolveServerBackgroundActivitySettings(effectiveSettings);
  const providerHealthPreset = getBackgroundActivityPresetSettings(
    resolvedBackgroundActivity.profile,
  ).providerHealthRefreshInterval;
  const providerHealthRefreshIntervalSeconds = durationToSeconds(
    resolvedBackgroundActivity.providerHealthRefreshInterval,
  );
  const defaultProviderHealthRefreshIntervalSeconds = durationToSeconds(providerHealthPreset);
  const sortedProviderEntries = useMemo(
    () => sortProviderInstanceEntries(providerEntries, PROVIDER_SETTINGS_DRIVER_ORDER),
    [providerEntries],
  );

  const handleSelectModel = useCallback(
    (model: ModelInfo) => {
      setModelSelection(model);
    },
    [setModelSelection],
  );

  return (
    <view className="settings-panel">
      <SettingsSection
        id="providers"
        title="Providers"
        headerAction={
          <view className="provider-settings-header-actions">
            <SmallIconButton
              label="Add provider instance"
              icon={<Icon name="plus" size={14} color="#a1a1aa" />}
              onTap={uiActions.openAddProviderDialog}
            />
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
          </view>
        }
      >
        <SettingsRow
          id="provider-health-check-interval"
          title="Health check interval"
          description="Refresh provider availability, versions, auth state, and model metadata in the background. Set this to 0 seconds to rely on manual refreshes."
          control={
            <view className="provider-health-control">
              <NumberField
                value={providerHealthRefreshIntervalSeconds}
                min={0}
                step={PROVIDER_HEALTH_INTERVAL_STEP_SECONDS}
                onValueChange={(value) => {
                  if (!settings) return;
                  void t3ClientActions
                    .updateServerSettings(
                      backgroundActivityOverrideSettings(
                        settings.backgroundActivity,
                        resolvedBackgroundActivity,
                        {
                          providerHealthRefreshInterval: Duration.seconds(
                            normalizeIntervalSeconds(value),
                          ),
                        },
                      ),
                    )
                    .catch(() => undefined);
                }}
              >
                <NumberFieldGroup className="provider-health-number-field">
                  <NumberFieldDecrement aria-label="Decrease provider health check interval" />
                  <NumberFieldInput aria-label="Provider health check interval in seconds" />
                  <NumberFieldIncrement aria-label="Increase provider health check interval" />
                </NumberFieldGroup>
              </NumberField>
              <text className="provider-health-unit">seconds</text>
              {providerHealthRefreshIntervalSeconds !==
              defaultProviderHealthRefreshIntervalSeconds ? (
                <SmallIconButton
                  label="Reset provider health check interval to default"
                  icon={<Icon name="rotate-ccw" size={12} color="#818181" />}
                  onTap={() => {
                    if (!settings) return;
                    void t3ClientActions
                      .updateServerSettings(
                        backgroundActivityOverrideSettings(
                          settings.backgroundActivity,
                          resolvedBackgroundActivity,
                          { providerHealthRefreshInterval: undefined },
                        ),
                      )
                      .catch(() => undefined);
                  }}
                />
              ) : null}
            </view>
          }
        />
        {providerSettingsError ? (
          <view className="settings-empty">
            <text className="settings-empty__text">
              Could not update provider: {providerSettingsError}
            </text>
          </view>
        ) : null}
        {sortedProviderEntries.length === 0 ? (
          <view className="settings-empty">
            <text className="settings-empty__text">
              No providers configured. Connect to a provider to get started.
            </text>
          </view>
        ) : (
          sortedProviderEntries.map((entry) => (
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
