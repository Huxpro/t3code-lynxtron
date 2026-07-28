import { createFileRoute } from "@tanstack/react-router";

import { ChatView } from "../components/ChatView";

export const Route = createFileRoute("/_chat/draft/$draftId")({
  component: DraftRouteView,
});

function DraftRouteView() {
  return <ChatView />;
}
