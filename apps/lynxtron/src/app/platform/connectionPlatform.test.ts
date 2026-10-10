import {
  CloudSession,
  PrimaryEnvironmentAuth,
  SshEnvironmentGateway,
} from "@t3tools/client-runtime/platform";
import { remoteHttpClientLayer } from "@t3tools/client-runtime/rpc";
import { EnvironmentId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schedule from "effect/Schedule";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { assert, describe, it } from "vite-plus/test";

import {
  connectionPlatformLayer,
  makeHostFetch,
  readPrimaryConnection,
  waitForPrimaryConnection,
  type HostHttpRequest,
  type HostHttpResponse,
} from "./connectionPlatform.ts";

function hostWith(reply: HostHttpResponse) {
  const requests: Array<HostHttpRequest> = [];
  const layer = remoteHttpClientLayer(
    makeHostFetch((request) => {
      requests.push(request);
      return Promise.resolve(reply);
    }),
  );
  return { requests, layer };
}

describe("makeHostFetch under upstream's HTTP client", () => {
  it("sends the method, headers and JSON body as text and decodes the JSON reply", async () => {
    const host = hostWith({
      status: 200,
      headers: { "content-type": "application/json", "x-served-by": "t3" },
      body: JSON.stringify({ ticket: "abc" }),
    });
    const response = await Effect.runPromise(
      HttpClient.execute(
        HttpClientRequest.post("http://127.0.0.1:4100/api/auth/websocket-ticket").pipe(
          HttpClientRequest.bearerToken("secret"),
          HttpClientRequest.bodyJsonUnsafe({ hello: "wörld" }),
        ),
      ).pipe(
        Effect.flatMap((reply) =>
          Effect.map(reply.json, (json) => ({
            json,
            status: reply.status,
            servedBy: reply.headers["x-served-by"],
          })),
        ),
        Effect.provide(host.layer),
      ),
    );

    assert.deepEqual(response, { json: { ticket: "abc" }, status: 200, servedBy: "t3" });
    assert.equal(host.requests.length, 1);
    const request = host.requests[0]!;
    assert.equal(request.url, "http://127.0.0.1:4100/api/auth/websocket-ticket");
    assert.equal(request.method, "POST");
    assert.equal(request.headers.authorization, "Bearer secret");
    assert.deepEqual(JSON.parse(request.body ?? ""), { hello: "wörld" });
  });

  it("reports an error status as a response instead of throwing", async () => {
    const host = hostWith({ status: 401, headers: {}, body: "" });
    const status = await Effect.runPromise(
      HttpClient.get("http://127.0.0.1:4100/api/environment").pipe(
        Effect.map((reply) => reply.status),
        Effect.provide(host.layer),
      ),
    );
    assert.equal(status, 401);
    assert.equal(host.requests[0]?.body, undefined);
  });
});

describe("primary connection", () => {
  const connection = {
    httpBaseUrl: "http://127.0.0.1:4100",
    wsBaseUrl: "ws://127.0.0.1:4100",
    bearer: "b",
  };

  it("keeps asking until the host has a server", async () => {
    const replies: Array<unknown> = [null, null, connection];
    let calls = 0;
    const read = readPrimaryConnection(() => Promise.resolve(replies[calls++]));
    const result = await Effect.runPromise(waitForPrimaryConnection(read, Schedule.recurs(5)));
    assert.deepEqual(result, connection);
    assert.equal(calls, 3);
  });

  it("retries a bridge that throws and a reply of the wrong shape", async () => {
    let calls = 0;
    const read = readPrimaryConnection(() => {
      calls += 1;
      if (calls === 1) return Promise.reject(new Error("bridge down"));
      if (calls === 2) return Promise.resolve({ httpBaseUrl: 4100 });
      return Promise.resolve(connection);
    });
    const result = await Effect.runPromise(waitForPrimaryConnection(read, Schedule.recurs(5)));
    assert.deepEqual(result, connection);
  });

  it("fails as a transient error while the host has none", async () => {
    const error = await Effect.runPromise(
      Effect.flip(readPrimaryConnection(() => Promise.resolve(null))),
    );
    assert.equal(error._tag, "ConnectionTransientError");
    assert.equal(error.reason, "endpoint-unavailable");
  });
});

describe("capabilities this client does not have", () => {
  const run = <A, E>(
    effect: Effect.Effect<A, E, CloudSession | SshEnvironmentGateway | PrimaryEnvironmentAuth>,
  ) => Effect.runPromise(effect.pipe(Effect.provide(connectionPlatformLayer)));

  it("has no cloud session and refuses to mint a cloud token", async () => {
    const result = await run(
      Effect.gen(function* () {
        const cloud = yield* CloudSession;
        return { identity: yield* cloud.identity, token: yield* Effect.flip(cloud.clerkToken) };
      }),
    );
    assert.isTrue(Option.isNone(result.identity));
    assert.equal(result.token._tag, "ConnectionBlockedError");
    assert.equal(result.token.reason, "unsupported");
  });

  it("refuses SSH environments as unsupported", async () => {
    const target = { alias: "box", hostname: "box", username: null, port: null };
    const result = await run(
      Effect.gen(function* () {
        const ssh = yield* SshEnvironmentGateway;
        return {
          provision: yield* Effect.flip(ssh.provision(target)),
          prepare: yield* Effect.flip(
            ssh.prepare({
              connectionId: "ssh:box",
              expectedEnvironmentId: EnvironmentId.make("environment-1"),
              target,
            }),
          ),
        };
      }),
    );
    assert.equal(result.provision.reason, "unsupported");
    assert.equal(result.prepare.reason, "unsupported");
  });

  it("fails the primary bearer without a host instead of falling back to cookie auth", async () => {
    const error = await run(
      Effect.flatMap(PrimaryEnvironmentAuth, (auth) => Effect.flip(auth.bearerToken)),
    );
    assert.equal(error._tag, "ConnectionTransientError");
  });
});
