import { createFileRoute } from "@tanstack/react-router";
import { ChatView } from "../components/ChatView";

export const Route = createFileRoute("/_chat/")({
  component: ChatIndexRouteView,
});

function ChatIndexRouteView() {
  return <ChatView />;
}
