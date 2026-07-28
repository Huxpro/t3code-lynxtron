import { createFileRoute } from "@tanstack/react-router";

import { ArchiveSettings } from "../components/OtherSettings";

export const Route = createFileRoute("/settings/archive")({
  component: ArchiveSettings,
});
