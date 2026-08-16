import { describe, expect, it } from "vite-plus/test";

import {
  pairingCredentialAfterRevocation,
  type PairingCredentialState,
} from "./connectionsMutation.logic";

const credential: PairingCredentialState = {
  id: "link-created-here",
  credential: "SECRET",
  expiresAt: "2026-08-16T05:00:00.000Z",
};

describe("pairingCredentialAfterRevocation", () => {
  it("clears only the successfully revoked credential link", () => {
    expect(
      pairingCredentialAfterRevocation(credential, {
        id: "link-created-here",
        revoked: true,
      }),
    ).toBeNull();
    expect(
      pairingCredentialAfterRevocation(credential, {
        id: "another-link",
        revoked: true,
      }),
    ).toBe(credential);
    expect(
      pairingCredentialAfterRevocation(credential, {
        id: "link-created-here",
        revoked: false,
      }),
    ).toBe(credential);
  });
});
