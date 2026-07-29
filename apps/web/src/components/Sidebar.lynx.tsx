import { useLocation, useNavigate } from "../lib/router";
import { SettingsSidebarNav } from "./settings/SettingsSidebarNav";
import { SidebarChromeHeader } from "./sidebar/SidebarChrome";

/**
 * Settings-only Lynx leaf for the legacy Sidebar module name. Chat routes
 * mount the converged SidebarV2 host directly from AppSidebarLayout, so this
 * file never evaluates the DOM-heavy legacy Sidebar graph.
 */
export default function Sidebar() {
  const pathname = useLocation({ select: (location) => location.pathname });
  const navigate = useNavigate();

  return (
    <>
      <SidebarChromeHeader isElectron />
      <SettingsSidebarNav
        pathname={pathname}
        onBack={() => void navigate({ to: "/" })}
        onNavigate={(to) => void navigate({ to, replace: true })}
      />
    </>
  );
}
