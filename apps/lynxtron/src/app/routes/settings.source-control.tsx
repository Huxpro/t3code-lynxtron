import { createFileRoute } from "@tanstack/react-router";

import { SourceControlSettings } from "../components/OtherSettings";

export const Route = createFileRoute("/settings/source-control")({
  component: SourceControlSettings,
});
