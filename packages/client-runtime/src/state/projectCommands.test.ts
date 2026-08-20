import { describe, expect, it } from "@effect/vitest";
import { EnvironmentId } from "@t3tools/contracts";
import * as Crypto from "effect/Crypto";
import { Atom, AtomRegistry } from "effect/unstable/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import { createProjectEnvironmentAtoms } from "./projectCommands.ts";

describe("project environment optimistic files", () => {
  it("retains confirmed contents while the file surface briefly unmounts", async () => {
    const projectEnvironment = createProjectEnvironmentAtoms(
      {} as Atom.AtomRuntime<EnvironmentRegistry | Crypto.Crypto, never>,
    );
    const atom = projectEnvironment.optimisticFile({
      environmentId: EnvironmentId.make("environment-project-file-retention"),
      cwd: "/repo",
      relativePath: "README.md",
    });
    const registry = AtomRegistry.make();
    const optimisticFile = {
      confirmedAgainst: undefined,
      data: {
        relativePath: "README.md",
        contents: "persisted contents",
        byteLength: 18,
        truncated: false,
      },
    };

    const unmount = registry.mount(atom);
    registry.set(atom, optimisticFile);
    unmount();
    await Promise.resolve();

    const remount = registry.mount(atom);
    expect(registry.get(atom)).toEqual(optimisticFile);

    remount();
    registry.dispose();
  });
});
