import { Outlet, createRootRoute, useRouterState } from "@tanstack/react-router";
import { AppSidebarLayout } from "../../../../web/src/components/AppSidebarLayout";

export const Route = createRootRoute({
  component: RootRouteView,
});

function RootRouteView() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isSettings = pathname.startsWith("/settings");

  if (isSettings) {
    return <Outlet />;
  }

  return (
    <AppSidebarLayout>
      <Outlet />
    </AppSidebarLayout>
  );
}
