import type { ProviderDriverKind } from "@t3tools/contracts";

/**
 * Derive an instance id from a user-provided label: the driver slug plus the
 * label slug — e.g. label "Work" on driver "codex" becomes `codex_work`. The
 * label slug is capped at 48 chars so the composed id stays under the 64-char
 * cap enforced by `ProviderInstanceId` in `@t3tools/contracts`.
 */
export function deriveProviderInstanceId(driver: ProviderDriverKind, label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return slug ? `${driver}_${slug}` : "";
}

const INSTANCE_ID_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

/**
 * Validate an instance id against the same slug rules the server applies in
 * `ProviderInstanceId` (see `packages/contracts/src/providerInstance.ts`).
 * Returns a user-facing error string, or `null` if valid.
 */
export function validateProviderInstanceId(
  id: string,
  existing: ReadonlySet<string>,
): string | null {
  if (id.length === 0) return "Instance ID is required.";
  if (id.length > 64) return "Instance ID must be 64 characters or fewer.";
  if (!INSTANCE_ID_PATTERN.test(id)) {
    return "Instance ID must start with a letter and use only letters, digits, '-', or '_'.";
  }
  if (existing.has(id)) return `An instance named '${id}' already exists.`;
  return null;
}
