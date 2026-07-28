import type { ReactNode } from "@lynx-js/react";

import { SettingsRouteSurface } from "../../../../web/src/components/settings/SettingsRouteSurface";
import { navigate, usePathname } from "../router";

export function SettingsPage({ children }: { readonly children: ReactNode }) {
  const pathname = usePathname();
  return (
    <SettingsRouteSurface
      electron
      pathname={pathname}
      onBack={() => navigate("/", { replace: true })}
      onNavigate={(to) => navigate(to, { replace: true })}
    >
      {children}
    </SettingsRouteSurface>
  );
}
