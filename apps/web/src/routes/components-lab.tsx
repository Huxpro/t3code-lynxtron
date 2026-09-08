import { createFileRoute } from "@tanstack/react-router";

import { ComponentLabSurface } from "../components/components-lab/ComponentLabSurface";
import { ComponentLabIsolatedSurface } from "../components/components-lab/ComponentLabIsolatedSurface";

function ComponentsLabRoute() {
  const url = new URL(window.location.href);
  const storyId =
    url.searchParams.get("story") ?? new URLSearchParams(url.hash.slice(1)).get("story");
  return storyId ? <ComponentLabIsolatedSurface storyId={storyId} /> : <ComponentLabSurface />;
}

export const Route = createFileRoute("/components-lab")({
  component: ComponentsLabRoute,
});
