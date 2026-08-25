import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import type { LocalEnvironmentRendezvous } from "@t3tools/shared/localEnvironmentRendezvous";

const currentUserKey = (): string =>
  typeof process.getuid === "function" ? String(process.getuid()) : (process.env.USER ?? "user");

const LocalEnvironmentRendezvousJson = Schema.fromJsonString(
  Schema.Struct({
    version: Schema.Literal(1),
    ownerPid: Schema.Int,
    environmentId: Schema.String,
    httpBaseUrl: Schema.String,
    wsBaseUrl: Schema.String,
    bootstrapCredential: Schema.String,
    publishedAt: Schema.String,
  }),
);
const encodeRendezvous = Schema.encodeEffect(LocalEnvironmentRendezvousJson);

export const rendezvousDirectory = (path: Path.Path, temporaryDirectory: string): string =>
  path.join(temporaryDirectory, `t3code-local-environments-${currentUserKey()}`);

export const rendezvousPath = (
  path: Path.Path,
  temporaryDirectory: string,
  ownerPid: number,
): string => path.join(rendezvousDirectory(path, temporaryDirectory), `${ownerPid}.json`);

export const publishDesktopLocalEnvironment = Effect.fn(
  "desktop.localEnvironmentRendezvous.publish",
)(function* (input: {
  readonly ownerPid: number;
  readonly temporaryDirectory: string;
  readonly environmentId: string;
  readonly httpBaseUrl: string;
  readonly wsBaseUrl: string;
  readonly bootstrapCredential: string;
}) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const directory = rendezvousDirectory(path, input.temporaryDirectory);
  const destination = rendezvousPath(path, input.temporaryDirectory, input.ownerPid);
  const now = yield* DateTime.now;
  const temporary = path.join(directory, `${input.ownerPid}.${DateTime.toEpochMillis(now)}.tmp`);
  const descriptor: LocalEnvironmentRendezvous = {
    version: 1,
    ownerPid: input.ownerPid,
    environmentId: input.environmentId,
    httpBaseUrl: input.httpBaseUrl,
    wsBaseUrl: input.wsBaseUrl,
    bootstrapCredential: input.bootstrapCredential,
    publishedAt: DateTime.formatIso(now),
  };
  const encoded = yield* encodeRendezvous(descriptor);
  yield* fileSystem.makeDirectory(directory, { recursive: true });
  yield* fileSystem.chmod(directory, 0o700);
  yield* fileSystem.writeFileString(temporary, `${encoded}\n`);
  yield* fileSystem.chmod(temporary, 0o600);
  yield* fileSystem.rename(temporary, destination);
  yield* fileSystem.chmod(destination, 0o600);
  return destination;
});

export const removeDesktopLocalEnvironment = Effect.fn("desktop.localEnvironmentRendezvous.remove")(
  function* (input: { readonly ownerPid: number; readonly temporaryDirectory: string }) {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const filePath = rendezvousPath(path, input.temporaryDirectory, input.ownerPid);
    yield* fileSystem.remove(filePath, { force: true });
  },
);
