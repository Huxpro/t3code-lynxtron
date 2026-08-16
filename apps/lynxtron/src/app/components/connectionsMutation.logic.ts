export interface PairingCredentialState {
  readonly id: string;
  readonly credential: string;
  readonly expiresAt: string;
}

export function pairingCredentialAfterRevocation(
  current: PairingCredentialState | null,
  input: { readonly id: string; readonly revoked: boolean },
): PairingCredentialState | null {
  return input.revoked && current?.id === input.id ? null : current;
}
