import type { EnvironmentId } from "@t3tools/contracts";
import { isProjectFaviconFallbackUrl } from "@t3tools/shared/projectFavicon";
import { useEffect, useState } from "@lynx-js/react";
import { Icon } from "../../../lynxtron/src/app/components/Icon";
import { t3ClientActions, useT3ClientState } from "../../../lynxtron/src/app/state/t3Client";

const loadedProjectFaviconUrls = new Map<string, string | null>();

export function ProjectFavicon({
  environmentId,
  cwd,
  className,
  size = 14,
}: {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly className?: string;
  readonly fallbackIcon?: unknown;
  readonly size?: number;
}) {
  const cacheKey = JSON.stringify([environmentId, cwd]);
  const [src, setSrc] = useState<string | null>(
    () => loadedProjectFaviconUrls.get(cacheKey) ?? null,
  );
  const [failed, setFailed] = useState(false);
  const { commandsReady } = useT3ClientState();

  useEffect(() => {
    if (!commandsReady) return;
    let active = true;
    setFailed(false);
    void t3ClientActions
      .createAssetUrl({ resource: { _tag: "project-favicon", cwd } })
      .then((result) => {
        if (!active) return;
        const next = isProjectFaviconFallbackUrl(result.url) ? null : result.url;
        loadedProjectFaviconUrls.set(cacheKey, next);
        setSrc(next);
      })
      .catch(() => {
        if (!active) return;
        loadedProjectFaviconUrls.set(cacheKey, null);
        setSrc(null);
      });
    return () => {
      active = false;
    };
  }, [cacheKey, commandsReady, cwd]);

  if (src && !failed) {
    return (
      <image
        src={src}
        mode="aspectFit"
        binderror={() => setFailed(true)}
        className={["lynx-project-favicon size-3.5 shrink-0", className].filter(Boolean).join(" ")}
        style={{ width: `${size}px`, height: `${size}px` }}
      />
    );
  }
  return (
    <Icon
      name="folder"
      size={size}
      color="#818181"
      className={["lynx-project-favicon size-3.5 shrink-0", className].filter(Boolean).join(" ")}
    />
  );
}
