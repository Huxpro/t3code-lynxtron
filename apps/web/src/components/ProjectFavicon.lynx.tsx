import type { EnvironmentId } from "@t3tools/contracts";

export function ProjectFavicon({
  className,
}: {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly className?: string;
  readonly fallbackIcon?: unknown;
}) {
  return (
    <view
      className={["lynx-project-favicon size-3.5 shrink-0", className].filter(Boolean).join(" ")}
    />
  );
}
