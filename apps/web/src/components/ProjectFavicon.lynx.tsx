import type { EnvironmentId } from "@t3tools/contracts";
import { Icon } from "../../../lynxtron/src/app/components/Icon";

export function ProjectFavicon({
  className,
}: {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly className?: string;
  readonly fallbackIcon?: unknown;
}) {
  return (
    <Icon
      name="folder"
      size={14}
      color="#818181"
      className={["lynx-project-favicon size-3.5 shrink-0", className].filter(Boolean).join(" ")}
    />
  );
}
