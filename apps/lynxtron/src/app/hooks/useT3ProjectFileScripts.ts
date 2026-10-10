import { useEffect, useState } from "@lynx-js/react";
import { T3_PROJECT_FILE_NAME, type T3ProjectFileScript } from "@t3tools/contracts";
import { T3ProjectFileFromJson } from "@t3tools/shared/t3ProjectFile";
import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";

import { t3ClientActions, useT3ClientState } from "../state/t3Client";

const decodeT3ProjectFile = Schema.decodeExit(T3ProjectFileFromJson);
const NO_SCRIPTS: ReadonlyArray<T3ProjectFileScript> = [];

export interface T3ProjectFileState {
  /** Same states as Web's useT3ProjectFileState: `invalid` means t3.json fails to parse. */
  readonly status: "loading" | "missing" | "invalid" | "valid";
  readonly scripts: ReadonlyArray<T3ProjectFileScript>;
}

const LOADING: T3ProjectFileState = { status: "loading", scripts: NO_SCRIPTS };
const MISSING: T3ProjectFileState = { status: "missing", scripts: NO_SCRIPTS };
const INVALID: T3ProjectFileState = { status: "invalid", scripts: NO_SCRIPTS };

export function useT3ProjectFileState(cwd: string | null): T3ProjectFileState {
  const [state, setState] = useState<T3ProjectFileState>(LOADING);
  const { commandsReady } = useT3ClientState();

  useEffect(() => {
    let cancelled = false;
    if (!cwd || !commandsReady) {
      setState(cwd ? LOADING : MISSING);
      return;
    }
    void t3ClientActions
      .readProjectFile(cwd, T3_PROJECT_FILE_NAME)
      .then((result) => {
        if (cancelled) return;
        if (result.truncated) {
          setState(MISSING);
          return;
        }
        const decoded = decodeT3ProjectFile(result.contents);
        setState(
          Exit.isSuccess(decoded)
            ? { status: "valid", scripts: decoded.value.scripts ?? NO_SCRIPTS }
            : INVALID,
        );
      })
      .catch(() => {
        if (!cancelled) setState(MISSING);
      });
    return () => {
      cancelled = true;
    };
  }, [commandsReady, cwd]);

  return state;
}

export function useT3ProjectFileScripts(cwd: string | null): ReadonlyArray<T3ProjectFileScript> {
  return useT3ProjectFileState(cwd).scripts;
}
