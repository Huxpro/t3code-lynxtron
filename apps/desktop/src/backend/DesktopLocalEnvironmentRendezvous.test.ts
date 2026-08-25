import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";

import {
  publishDesktopLocalEnvironment,
  removeDesktopLocalEnvironment,
} from "./DesktopLocalEnvironmentRendezvous.ts";

describe("DesktopLocalEnvironmentRendezvous", () => {
  it.effect("atomically publishes a private descriptor and removes only its own PID path", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const temporaryDirectory = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "t3-desktop-rendezvous-test-",
      });
      const descriptorPath = yield* publishDesktopLocalEnvironment({
        ownerPid: 12345,
        temporaryDirectory,
        environmentId: "environment-id",
        httpBaseUrl: "http://127.0.0.1:45679/",
        wsBaseUrl: "ws://127.0.0.1:45679/",
        bootstrapCredential: "secret",
      });
      const contents = yield* fileSystem.readFileString(descriptorPath);
      const info = yield* fileSystem.stat(descriptorPath);
      assert.include(contents, '"environmentId":"environment-id"');
      assert.include(contents, '"bootstrapCredential":"secret"');
      assert.equal(info.mode & 0o777, 0o600);

      yield* removeDesktopLocalEnvironment({ ownerPid: 54321, temporaryDirectory });
      assert.isTrue(yield* fileSystem.exists(descriptorPath));
      yield* removeDesktopLocalEnvironment({ ownerPid: 12345, temporaryDirectory });
      assert.isFalse(yield* fileSystem.exists(descriptorPath));
      assert.equal(path.basename(descriptorPath), "12345.json");
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
