import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { SettingsPage } from "../components/SettingsPage";

export const Route = createFileRoute("/settings")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/general", replace: true });
  },
  component: SettingsRouteLayout,
});

function SettingsRouteLayout() {
  return (
    <SettingsPage panelId="general">
      <Outlet />
    </SettingsPage>
  );
}
