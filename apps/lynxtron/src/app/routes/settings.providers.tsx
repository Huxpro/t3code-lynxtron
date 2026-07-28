import { createFileRoute } from "@tanstack/react-router";
import { ProviderSettings } from "../components/ProviderSettings";

export const Route = createFileRoute("/settings/providers")({
  component: ProviderSettings,
});
