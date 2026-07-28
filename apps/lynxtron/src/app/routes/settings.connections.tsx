import { createFileRoute } from "@tanstack/react-router";

import { ConnectionsSettings } from "../components/OtherSettings";

export const Route = createFileRoute("/settings/connections")({
  component: ConnectionsSettings,
});
