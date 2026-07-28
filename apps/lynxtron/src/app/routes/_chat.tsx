import { Outlet, createFileRoute } from "@tanstack/react-router";

function ChatRouteLayout() {
  return <Outlet />;
}

export const Route = createFileRoute("/_chat")({
  component: ChatRouteLayout,
});
