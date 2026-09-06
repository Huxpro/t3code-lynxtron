import { useEffect, useState } from "@lynx-js/react";
import { T3_PROJECT_FILE_NAME, type T3ProjectFileScript } from "@t3tools/contracts";
import { T3ProjectFileFromJson } from "@t3tools/shared/t3ProjectFile";
import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";

import { t3ClientActions } from "../state/t3Client";

const decodeT3ProjectFile = Schema.decodeExit(T3ProjectFileFromJson);
const NO_SCRIPTS: ReadonlyArray<T3ProjectFileScript> = [];

export function useT3ProjectFileScripts(cwd: string | null): ReadonlyArray<T3ProjectFileScript> {
  const [scripts, setScripts] = useState<ReadonlyArray<T3ProjectFileScript>>(NO_SCRIPTS);

  useEffect(() => {
    let cancelled = false;
    if (!cwd) {
      setScripts(NO_SCRIPTS);
      return;
    }
    void t3ClientActions
      .readProjectFile(cwd, T3_PROJECT_FILE_NAME)
      .then((result) => {
        if (cancelled || result.truncated) return;
        const decoded = decodeT3ProjectFile(result.contents);
        setScripts(Exit.isSuccess(decoded) ? (decoded.value.scripts ?? NO_SCRIPTS) : NO_SCRIPTS);
      })
      .catch(() => {
        if (!cancelled) setScripts(NO_SCRIPTS);
      });
    return () => {
      cancelled = true;
    };
  }, [cwd]);

  return scripts;
}
