import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { assert, describe, it } from "vite-plus/test";

import { HostCryptoUnsupportedError, makeHostCrypto } from "./hostCrypto.ts";

describe("makeHostCrypto", () => {
  it("asks the host for a new UUID each time one is wanted", async () => {
    let next = 0;
    const crypto = makeHostCrypto(() => `uuid-${++next}`);
    assert.equal(next, 0);
    assert.equal(await Effect.runPromise(crypto.randomUUIDv4), "uuid-1");
    assert.equal(await Effect.runPromise(crypto.randomUUIDv4), "uuid-2");
  });

  it("fails every member the host cannot back, naming it", async () => {
    const crypto = makeHostCrypto(() => "uuid");
    const failed = async (effect: Effect.Effect<unknown, unknown>) => {
      const exit = await Effect.runPromiseExit(effect);
      const defect = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null;
      return defect instanceof HostCryptoUnsupportedError ? defect.member : null;
    };
    assert.equal(await failed(crypto.randomBytes(16)), "randomBytes");
    assert.equal(await failed(crypto.digest("SHA-256", new Uint8Array())), "digest");
    assert.equal(await failed(crypto.randomUUIDv7), "randomUUIDv7");
    assert.equal(await failed(crypto.randomIntBetween(0, 9)), "randomIntBetween");
    assert.throws(() => crypto.nextDoubleUnsafe(), /Crypto\.nextDoubleUnsafe is not available/);
  });
});
