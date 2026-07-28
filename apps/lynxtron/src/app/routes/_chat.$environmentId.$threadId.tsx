import { createFileRoute } from "@tanstack/react-router";

import { ChatView } from "../components/ChatView";

export const Route = createFileRoute("/_chat/$environmentId/$threadId")({
  component: ThreadRouteView,
});

function ThreadRouteView() {
  return <ChatView />;
}
