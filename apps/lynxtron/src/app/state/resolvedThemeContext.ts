import { createContext, useContext } from "@lynx-js/react";

import type { LynxtronResolvedTheme } from "../../shared/themeProtocol.ts";

export const ResolvedThemeContext = createContext<LynxtronResolvedTheme>("dark");

export function useResolvedTheme(): LynxtronResolvedTheme {
  return useContext(ResolvedThemeContext);
}
