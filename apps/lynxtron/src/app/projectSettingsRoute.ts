// Lynx spelling of Web's `/projects/$projectKey` route. Logical project keys
// contain `/` and `:` (paths, repository identities), so the key is one
// encoded path segment, as TanStack Router encodes the Web param.
const PROJECT_SETTINGS_PREFIX = "/projects/";

export function projectSettingsPath(projectKey: string): string {
  return `${PROJECT_SETTINGS_PREFIX}${encodeURIComponent(projectKey)}`;
}

/** The project key a project settings pathname targets, or null for any other route. */
export function parseProjectSettingsPath(pathname: string): string | null {
  if (!pathname.startsWith(PROJECT_SETTINGS_PREFIX)) return null;
  const segment = pathname.slice(PROJECT_SETTINGS_PREFIX.length);
  if (segment.length === 0 || segment.includes("/")) return null;
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}
