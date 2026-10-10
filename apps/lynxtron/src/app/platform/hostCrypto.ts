// Effect's `Crypto` service for the Lynx thread. The Lynx engine has no Web
// Crypto; the host's preload exposes `randomUUID`, which is the one member
// upstream's command builders use (`randomUUIDv4`, for command ids). Every
// other member fails with its own name, so a new use shows up as that name
// and not as a silently weak value.
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";

export class HostCryptoUnsupportedError extends Error {
  override readonly name = "HostCryptoUnsupportedError";
  constructor(readonly member: string) {
    super(`Crypto.${member} is not available in the Lynx client.`);
  }
}

function unsupported(member: string): Effect.Effect<never> {
  return Effect.suspend(() => Effect.die(new HostCryptoUnsupportedError(member)));
}

function unsupportedUnsafe(member: string): never {
  throw new HostCryptoUnsupportedError(member);
}

/** A `Crypto` whose UUIDs come from `randomUUID`, asked for at each use. */
export function makeHostCrypto(randomUUID: () => string): Crypto.Crypto {
  return Crypto.Crypto.of({
    "~effect/Crypto": "~effect/Crypto",
    randomUUIDv4: Effect.sync(randomUUID),
    randomUUIDv7: unsupported("randomUUIDv7"),
    randomBytes: () => unsupported("randomBytes"),
    digest: () => unsupported("digest"),
    random: unsupported("random"),
    randomBoolean: unsupported("randomBoolean"),
    randomInt: unsupported("randomInt"),
    randomBetween: () => unsupported("randomBetween"),
    randomIntBetween: () => unsupported("randomIntBetween"),
    randomShuffle: () => unsupported("randomShuffle"),
    nextIntUnsafe: () => unsupportedUnsafe("nextIntUnsafe"),
    nextDoubleUnsafe: () => unsupportedUnsafe("nextDoubleUnsafe"),
  });
}
