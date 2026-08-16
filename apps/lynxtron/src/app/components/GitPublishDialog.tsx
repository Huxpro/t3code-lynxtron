import { useEffect, useMemo, useState } from "@lynx-js/react";
import type {
  SourceControlCloneProtocol,
  SourceControlProviderKind,
  SourceControlRepositoryVisibility,
} from "@t3tools/contracts";

import { t3ClientActions } from "../state/t3Client";

interface GitPublishDialogProps {
  readonly cwd: string;
  readonly onClose: () => void;
}

const PUBLISH_PROVIDERS = [
  { kind: "github", label: "GitHub", host: "github.com" },
  { kind: "azure-devops", label: "Azure DevOps", host: "dev.azure.com" },
  { kind: "bitbucket", label: "Bitbucket", host: "bitbucket.org" },
  { kind: "gitlab", label: "GitLab", host: "gitlab.com" },
] as const satisfies ReadonlyArray<{
  readonly kind: SourceControlProviderKind;
  readonly label: string;
  readonly host: string;
}>;

function inputValue(event: unknown): string {
  const input = event as {
    readonly detail?: { readonly value?: unknown };
    readonly target?: { readonly value?: unknown };
    readonly currentTarget?: { readonly value?: unknown };
  };
  const value = input.detail?.value ?? input.target?.value ?? input.currentTarget?.value;
  return typeof value === "string" ? value : "";
}

export function GitPublishDialog({ cwd, onClose }: GitPublishDialogProps) {
  const [providers, setProviders] = useState<ReadonlyArray<SourceControlProviderKind>>([]);
  const [provider, setProvider] = useState<SourceControlProviderKind>("github");
  const [repository, setRepository] = useState("");
  const [visibility, setVisibility] = useState<SourceControlRepositoryVisibility>("private");
  const [protocol, setProtocol] = useState<SourceControlCloneProtocol>("ssh");
  const [wizardStep, setWizardStep] = useState<0 | 1 | 2>(0);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void t3ClientActions
      .discoverSourceControl()
      .then((result) => {
        if (cancelled) return;
        const available = result.sourceControlProviders
          .filter((item) => item.status === "available" && item.auth.status === "authenticated")
          .map((item) => item.kind);
        setProviders(available);
        if (available[0]) setProvider(available[0]);
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const canPublish = useMemo(() => {
    const [owner, ...nameParts] = repository.trim().split("/");
    return (
      !loading &&
      !publishing &&
      providers.includes(provider) &&
      Boolean(owner?.trim()) &&
      Boolean(nameParts.join("/").trim())
    );
  }, [loading, provider, providers, publishing, repository]);
  const providerOptions = useMemo(
    () =>
      PUBLISH_PROVIDERS.toSorted((left, right) => {
        const leftReady = providers.includes(left.kind);
        const rightReady = providers.includes(right.kind);
        if (leftReady !== rightReady) return leftReady ? -1 : 1;
        return left.label.localeCompare(right.label);
      }),
    [providers],
  );

  const publish = () => {
    if (!canPublish) return;
    setPublishing(true);
    setError(null);
    void t3ClientActions
      .publishRepository({
        cwd,
        provider,
        repository: repository.trim(),
        visibility,
        remoteName: "origin",
        protocol,
      })
      .then((result) => {
        setSuccess(`${result.repository.nameWithOwner} published from ${result.branch}.`);
        setWizardStep(2);
      })
      .catch((cause) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => setPublishing(false));
  };

  return (
    <view className="git-publish-overlay" data-git-publish-dialog="true">
      <view
        className="git-publish-dismiss"
        aria-label="Dismiss Publish repository"
        bindtap={onClose}
      />
      <view className="git-publish-dialog" catchtap={() => undefined}>
        <view className="git-publish-header">
          <view className="git-publish-heading">
            <text className="git-publish-title">Publish repository</text>
            <text className="git-publish-description">
              Pick where to host it, then point us at a repo to push to.
            </text>
          </view>
          <view
            className="git-publish-close"
            aria-label="Close Publish repository"
            bindtap={onClose}
          >
            <text>×</text>
          </view>
          <view className="git-publish-steps" data-git-publish-step={String(wizardStep)}>
            {(["Provider", "Repository", "Summary"] as const).map((label, index) => {
              const complete = index < wizardStep;
              const active = index === wizardStep;
              return (
                <view
                  key={label}
                  className={`git-publish-step${active ? " git-publish-step--active" : ""}${
                    complete ? " git-publish-step--complete" : ""
                  }`}
                  data-git-publish-step-label={label}
                  data-git-publish-step-state={
                    active ? "active" : complete ? "complete" : "pending"
                  }
                  bindtap={
                    wizardStep !== 2 && index < wizardStep
                      ? () => setWizardStep(index as 0 | 1)
                      : undefined
                  }
                >
                  <view className="git-publish-step__marker">
                    <text>{complete ? "✓" : ""}</text>
                  </view>
                  <view className="git-publish-step__copy">
                    <text className="git-publish-step__eyebrow">STEP {index + 1}</text>
                    <text className="git-publish-step__label">{label}</text>
                  </view>
                </view>
              );
            })}
          </view>
        </view>

        {wizardStep === 2 && success ? (
          <view className="git-publish-success">
            <text className="git-publish-success__title">Repository published</text>
            <text className="git-publish-success__description">{success}</text>
          </view>
        ) : wizardStep === 0 ? (
          <view className="git-publish-body">
            <text className="git-publish-label">Provider</text>
            <view className="git-publish-provider-grid" data-git-publish-providers="true">
              {providerOptions.map((item) => {
                const ready = providers.includes(item.kind);
                const selected = item.kind === provider && ready;
                return (
                  <view
                    key={item.kind}
                    className={`git-publish-provider-card${
                      selected ? " git-publish-provider-card--active" : ""
                    }${ready ? "" : " git-publish-provider-card--disabled"}`}
                    data-git-publish-provider={item.kind}
                    data-git-publish-provider-ready={ready ? "true" : "false"}
                    bindtap={ready ? () => setProvider(item.kind) : undefined}
                  >
                    <view className="git-publish-provider-card__copy">
                      <text className="git-publish-provider-card__label">{item.label}</text>
                      <text className="git-publish-provider-card__host">{item.host}</text>
                    </view>
                    {!ready ? (
                      <text className="git-publish-provider-card__setup">Setup Required</text>
                    ) : null}
                  </view>
                );
              })}
            </view>
            {!loading && providers.length === 0 ? (
              <text className="git-publish-warning">
                No authenticated hosting provider is available. Configure one in Settings → Source
                Control.
              </text>
            ) : null}
          </view>
        ) : (
          <view className="git-publish-body">
            <text className="git-publish-label">Repository</text>
            <input
              className="git-publish-input"
              aria-label="Repository owner and name"
              placeholder="owner/repository"
              bindinput={(event) => setRepository(inputValue(event))}
            />

            <text className="git-publish-label">Visibility</text>
            <view className="git-publish-options">
              {(["private", "public"] as const).map((item) => (
                <view
                  key={item}
                  className={`git-publish-option${item === visibility ? " git-publish-option--active" : ""}`}
                  data-git-publish-visibility={item}
                  bindtap={() => setVisibility(item)}
                >
                  <text>{item}</text>
                </view>
              ))}
            </view>

            <view
              className="git-publish-advanced-trigger"
              aria-expanded={advancedOpen ? "true" : "false"}
              bindtap={() => setAdvancedOpen((open) => !open)}
            >
              <text>{advancedOpen ? "⌄" : "›"} Advanced</text>
            </view>
            {advancedOpen ? (
              <>
                <text className="git-publish-label">Protocol</text>
                <view className="git-publish-options">
                  {(["ssh", "https"] as const).map((item) => (
                    <view
                      key={item}
                      className={`git-publish-option${
                        item === protocol ? " git-publish-option--active" : ""
                      }`}
                      data-git-publish-protocol={item}
                      bindtap={() => setProtocol(item)}
                    >
                      <text>{item.toUpperCase()}</text>
                    </view>
                  ))}
                </view>
              </>
            ) : null}
          </view>
        )}

        {error ? <text className="git-publish-error">{error}</text> : null}
        <view className="git-publish-footer">
          <view
            className="git-publish-button"
            bindtap={wizardStep === 0 || wizardStep === 2 ? onClose : () => setWizardStep(0)}
          >
            <text>{wizardStep === 2 ? "Done" : wizardStep === 0 ? "Cancel" : "Back"}</text>
          </view>
          {wizardStep === 0 ? (
            <view
              className={`git-publish-button git-publish-button--primary${
                providers.length > 0 ? "" : " git-publish-button--disabled"
              }`}
              aria-disabled={providers.length > 0 ? "false" : "true"}
              bindtap={providers.length > 0 ? () => setWizardStep(1) : undefined}
            >
              <text>Next</text>
            </view>
          ) : wizardStep === 1 ? (
            <view
              className={`git-publish-button git-publish-button--primary${canPublish ? "" : " git-publish-button--disabled"}`}
              aria-disabled={canPublish ? "false" : "true"}
              bindtap={canPublish ? publish : undefined}
            >
              <text>{publishing ? "Publishing…" : "Publish"}</text>
            </view>
          ) : null}
        </view>
      </view>
    </view>
  );
}
