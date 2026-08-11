import type { ReactNode } from "@lynx-js/react";

import { SettingsRouteSurface } from "../../../../web/src/components/settings/SettingsRouteSurface";
import { navigate, usePathname } from "../router";
import type { LynxSettingsPanelId } from "../settingsPanel";

export function SettingsPage({
  children,
  panelId = "general",
}: {
  readonly children: ReactNode;
  readonly panelId?: LynxSettingsPanelId;
}) {
  const pathname = usePathname();
  return (
    <SettingsRouteSurface
      contentId={panelId}
      electron
      pathname={pathname}
      onBack={() => navigate("/", { replace: true })}
      onNavigate={(to) => navigate(to, { replace: true })}
    >
      {children}
    </SettingsRouteSurface>
  );
}
