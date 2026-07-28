export async function persistSidebarOpenState({
  expiresAt,
  name,
  open,
}: {
  expiresAt: number;
  name: string;
  open: boolean;
}) {
  if (typeof cookieStore === "undefined") return;
  try {
    await cookieStore.set({
      expires: expiresAt,
      name,
      path: "/",
      value: String(open),
    });
  } catch {
    // Electron custom protocols can expose CookieStore while rejecting writes.
    // Sidebar state is already applied in memory, so persistence stays best-effort.
  }
}
