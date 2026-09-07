import { createFileRoute } from "@tanstack/react-router";

import { ComponentLabSurface } from "../components/components-lab/ComponentLabSurface";

function ComponentsLabRoute() {
  return <ComponentLabSurface />;
}

export const Route = createFileRoute("/components-lab")({
  component: ComponentsLabRoute,
});
