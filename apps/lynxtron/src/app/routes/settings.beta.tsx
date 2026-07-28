import { createFileRoute } from "@tanstack/react-router";

import { BetaSettings } from "../components/OtherSettings";

export const Route = createFileRoute("/settings/beta")({
  component: BetaSettings,
});
