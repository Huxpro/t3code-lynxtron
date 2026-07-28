export async function persistSidebarOpenState(_options: {
  expiresAt: number;
  name: string;
  open: boolean;
}) {
  // Lynx Desktop does not expose the browser Cookie Store API. Sidebar state
  // remains canonical for this session until native settings persistence lands.
}
