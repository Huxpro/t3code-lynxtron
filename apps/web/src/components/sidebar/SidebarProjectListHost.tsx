import type { SidebarProjectListHostProps } from "./SidebarProjectListHost.types";

export type {
  SidebarProjectHostRow,
  SidebarProjectHostThread,
  SidebarProjectListHostProps,
} from "./SidebarProjectListHost.types";

/**
 * The browser keeps the complete DOM/DnD Sidebar subtree. Lynx resolves the
 * sibling `.lynx.tsx` leaf, which renders the same canonical presentation rows
 * with native host elements while ReactLynx cannot load the DOM-heavy row card.
 */
export function SidebarProjectListHost({ children }: SidebarProjectListHostProps) {
  return children;
}
