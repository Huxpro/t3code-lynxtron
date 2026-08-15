import type {
  SourceControlWritingStyleMode,
  SourceControlDiscoveryResult,
  SourceControlProviderDiscoveryItem,
  SourceControlProviderKind,
  VcsDiscoveryItem,
  VcsDriverKind,
  VcsStatusResult,
} from "@t3tools/contracts";
import { resolveChangeRequestPresentation } from "@t3tools/shared/sourceControl";

export interface PrStatusIndicator {
  readonly label: string;
  readonly colorClass: string;
  readonly tooltip: string;
  readonly tooltipLead: string;
  readonly tooltipTitle: string;
  readonly url: string;
}

export interface TerminalStatusIndicator {
  readonly label: "Terminal process running";
  readonly colorClass: string;
  readonly pulse: boolean;
}

export type ThreadPr = VcsStatusResult["pr"];

export function settledPrHoverColorClass(state: NonNullable<ThreadPr>["state"]): string {
  switch (state) {
    case "open":
      return "group-hover/v2-row:text-emerald-600 dark:group-hover/v2-row:text-emerald-300/90";
    case "merged":
      return "group-hover/v2-row:text-violet-600 dark:group-hover/v2-row:text-violet-300/90";
    case "closed":
      return "group-hover/v2-row:text-red-600 dark:group-hover/v2-row:text-red-300/90";
  }
}

export function prStatusIndicator(
  pr: ThreadPr,
  provider: VcsStatusResult["sourceControlProvider"] | null | undefined,
): PrStatusIndicator | null {
  if (!pr) return null;

  const presentation = resolveChangeRequestPresentation(provider);
  const formattedState = pr.state.charAt(0).toUpperCase() + pr.state.slice(1);
  const tooltipLead = `${presentation.shortName} #${pr.number} - ${formattedState}`;
  const tooltip = `${tooltipLead}: ${pr.title}`;

  switch (pr.state) {
    case "open":
      return {
        label: `${presentation.shortName} open`,
        colorClass: "text-emerald-600 dark:text-emerald-300/90",
        tooltip,
        tooltipLead,
        tooltipTitle: pr.title,
        url: pr.url,
      };
    case "closed":
      return {
        label: `${presentation.shortName} closed`,
        colorClass: "text-red-600 dark:text-red-300/90",
        tooltip,
        tooltipLead,
        tooltipTitle: pr.title,
        url: pr.url,
      };
    case "merged":
      return {
        label: `${presentation.shortName} merged`,
        colorClass: "text-violet-600 dark:text-violet-300/90",
        tooltip,
        tooltipLead,
        tooltipTitle: pr.title,
        url: pr.url,
      };
  }
}

export function resolveThreadPr(input: {
  readonly threadBranch: string | null;
  readonly gitStatus: VcsStatusResult | null;
  readonly hasDedicatedWorktree?: boolean;
}): ThreadPr | null {
  const { threadBranch, gitStatus, hasDedicatedWorktree = false } = input;
  if (gitStatus === null) return null;
  if (hasDedicatedWorktree) return gitStatus.pr ?? null;
  if (threadBranch === null || gitStatus.refName !== threadBranch) return null;
  return gitStatus.pr ?? null;
}

export function terminalStatusFromRunningIds(
  runningTerminalIds: ReadonlyArray<string>,
): TerminalStatusIndicator | null {
  if (runningTerminalIds.length === 0) return null;
  return {
    label: "Terminal process running",
    colorClass: "text-teal-600 dark:text-teal-300/90",
    pulse: true,
  };
}

export type SourceControlDiscoveryItem = VcsDiscoveryItem | SourceControlProviderDiscoveryItem;

export type SourceControlSummaryPart =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "code"; readonly text: string }
  | { readonly kind: "sensitive"; readonly prefix: string; readonly text: string };

interface SourceControlItemPresentationBase {
  readonly id: string;
  readonly label: string;
  readonly version: string | null;
  readonly statusTone: "success" | "warning" | "muted";
  readonly badgeLabel: "Coming Soon" | "Not authenticated" | null;
  readonly enabled: boolean;
  readonly summaryParts: ReadonlyArray<SourceControlSummaryPart>;
}

export interface VcsDiscoveryItemPresentation extends SourceControlItemPresentationBase {
  readonly section: "vcs";
  readonly kind: VcsDriverKind;
}

export interface SourceControlProviderItemPresentation extends SourceControlItemPresentationBase {
  readonly section: "provider";
  readonly kind: SourceControlProviderKind;
}

export type SourceControlItemPresentation =
  | VcsDiscoveryItemPresentation
  | SourceControlProviderItemPresentation;

export interface SourceControlDiscoveryPresentation {
  readonly versionControlSystems: ReadonlyArray<VcsDiscoveryItemPresentation>;
  readonly sourceControlProviders: ReadonlyArray<SourceControlProviderItemPresentation>;
  readonly hasItems: boolean;
}

export interface SourceControlEmptyPresentation {
  readonly sectionTitle: "Server environment";
  readonly title: "Could not scan the server environment" | "Nothing detected yet";
  readonly description: string;
}

export function deriveSourceControlEmptyPresentation(
  error: string | null,
): SourceControlEmptyPresentation {
  return {
    sectionTitle: "Server environment",
    title: error === null ? "Nothing detected yet" : "Could not scan the server environment",
    description:
      error ??
      "Install Git on the server, add optional hosting integrations or credentials your workspace needs, then rescan.",
  };
}

export const SOURCE_CONTROL_WRITING_STYLE_OPTIONS: Readonly<
  Record<SourceControlWritingStyleMode, { readonly label: string; readonly description: string }>
> = {
  repo_conventions: {
    label: "Repository conventions",
    description: "In each project, matches recent change descriptions and change request titles.",
  },
  conventional_commits: {
    label: "Conventional Commits",
    description:
      "Uses Conventional Commit prefixes for change descriptions; change request titles and descriptions stay concise.",
  },
  custom: {
    label: "Custom instructions",
    description:
      "Applies your instructions to change descriptions and change request titles and descriptions in every project.",
  },
};

const REDACTED_TEXT_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function redactSourceControlAccount(value: string): string {
  let state = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    state ^= value.charCodeAt(index);
    state = Math.imul(state, 0x01000193);
  }
  const nextChar = () => {
    state = Math.imul(state ^ (state >>> 13), 0x85ebca6b);
    state = Math.imul(state ^ (state >>> 16), 0xc2b2ae35);
    return REDACTED_TEXT_ALPHABET[Math.abs(state) % REDACTED_TEXT_ALPHABET.length] ?? "x";
  };
  return Array.from(value, (character) =>
    character === "@" || character === "." || character === "-" || character === "_"
      ? character
      : nextChar(),
  ).join("");
}

function optionGetOrNull<A>(
  option:
    | { readonly _tag: "None" }
    | { readonly _tag: "Some"; readonly value: A }
    | { readonly value?: A },
): A | null {
  return "value" in option && option.value !== undefined ? option.value : null;
}

function summaryForVcs(item: VcsDiscoveryItem): ReadonlyArray<SourceControlSummaryPart> {
  if (!item.implemented) {
    return [{ kind: "text", text: `Support for ${item.label} is coming soon.` }];
  }
  if (item.status !== "available") {
    return [{ kind: "text", text: `Not available on this server: ${item.installHint}` }];
  }
  return [{ kind: "text", text: "Available" }];
}

function summaryForProvider(
  item: SourceControlProviderDiscoveryItem,
): ReadonlyArray<SourceControlSummaryPart> {
  if (item.status !== "available") {
    return [{ kind: "text", text: `Not available on this server: ${item.installHint}` }];
  }
  if (item.auth.status === "authenticated") {
    const account = optionGetOrNull(item.auth.account);
    return [
      { kind: "text", text: "Authenticated" },
      ...(account ? [{ kind: "sensitive" as const, prefix: " as ", text: account }] : []),
    ];
  }
  if (!item.executable) {
    return [{ kind: "text", text: `Available. ${item.installHint}` }];
  }
  if (item.auth.status === "unauthenticated") {
    return [
      {
        kind: "text",
        text: `${item.label} is not authenticated on this server. Sign in or configure credentials using the `,
      },
      { kind: "code", text: item.executable },
      { kind: "text", text: " tool on the server host to enable pull request features." },
    ];
  }
  return [
    {
      kind: "text",
      text: `Could not verify ${item.label}. ${item.installHint}`,
    },
  ];
}

export function projectSourceControlDiscoveryItem(
  item: SourceControlDiscoveryItem,
): SourceControlItemPresentation {
  const version = optionGetOrNull(item.version);
  if ("auth" in item) {
    const authenticated = item.status === "available" && item.auth.status === "authenticated";
    return {
      id: `provider:${item.kind}`,
      section: "provider",
      kind: item.kind,
      label: item.label,
      version,
      statusTone: authenticated ? "success" : "warning",
      badgeLabel: item.auth.status === "unauthenticated" ? "Not authenticated" : null,
      enabled: authenticated,
      summaryParts: summaryForProvider(item),
    };
  }

  const ready = item.status === "available" && item.implemented;
  return {
    id: `vcs:${item.kind}`,
    section: "vcs",
    kind: item.kind,
    label: item.label,
    version,
    statusTone: !item.implemented ? "muted" : ready ? "success" : "warning",
    badgeLabel: item.implemented ? null : "Coming Soon",
    enabled: ready,
    summaryParts: summaryForVcs(item),
  };
}

export function projectSourceControlDiscovery(
  result: SourceControlDiscoveryResult,
): SourceControlDiscoveryPresentation {
  const versionControlSystems = result.versionControlSystems.map(
    (item) => projectSourceControlDiscoveryItem(item) as VcsDiscoveryItemPresentation,
  );
  const sourceControlProviders = result.sourceControlProviders.map(
    (item) => projectSourceControlDiscoveryItem(item) as SourceControlProviderItemPresentation,
  );
  return {
    versionControlSystems,
    sourceControlProviders,
    hasItems: versionControlSystems.length > 0 || sourceControlProviders.length > 0,
  };
}

export function sourceControlSummaryText(
  item: Pick<SourceControlItemPresentation, "summaryParts">,
  options?: { readonly includeSensitive?: boolean },
): string {
  return item.summaryParts
    .flatMap((part) => {
      if (part.kind !== "sensitive") return [part.text];
      return options?.includeSensitive ? [`${part.prefix}${part.text}`] : [];
    })
    .join("");
}
