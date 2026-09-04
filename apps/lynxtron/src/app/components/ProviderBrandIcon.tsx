import { Icon, type IconName } from "./Icon";

function providerBrandIconName(driverKind: string | null): IconName {
  switch (driverKind) {
    case "codex":
    case "openai":
      return "openai";
    case "claudeAgent":
      return "claude";
    case "cursor":
      return "cursor";
    case "grok":
      return "grok";
    case "opencode":
      return "opencode";
    case "githubCopilot":
      return "github-copilot";
    case "gemini":
      return "gemini";
    case "acpRegistry":
      return "acp-registry";
    case "piAgent":
      return "pi-agent";
    default:
      return "bot";
  }
}

export function ProviderBrandIcon({
  driverKind,
  size,
  className,
}: {
  readonly driverKind: string | null;
  readonly size: number;
  readonly className?: string;
}) {
  return <Icon name={providerBrandIconName(driverKind)} size={size} className={className} />;
}
