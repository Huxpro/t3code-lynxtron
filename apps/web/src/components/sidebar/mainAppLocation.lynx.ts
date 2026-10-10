import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

// The pages whose sidebar footer shows Back. `/projects/<key>` is a Lynx
// screen of its own with the regular footer, so it is not one of them.
export function isSidebarUtilityPage(pathname: string) {
  return (
    pathname === "/settings" ||
    pathname.startsWith("/settings/") ||
    pathname === "/usage" ||
    pathname === "/pull-requests"
  );
}

/** Lynx keeps no history stack and no remembered location, so there is nothing to track. */
export function MainAppLocationTracker() {
  return null;
}

/** Leaves a utility page for the thread list. */
export function useNavigateToMainApp() {
  const navigate = useNavigate();
  return useCallback(() => navigate({ to: "/" }), [navigate]);
}
