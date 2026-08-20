import type { ProjectReadFileResult } from "@t3tools/contracts";
import { EnvironmentId } from "@t3tools/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const executeAtomQuery = vi.hoisted(() => vi.fn());

vi.mock("@t3tools/client-runtime/state/runtime", async (importOriginal) => ({
  ...(await importOriginal()),
  executeAtomQuery,
}));

import {
  clearProjectFileQueryData,
  confirmProjectFileQueryData,
  getOptimisticProjectFileQueryData,
  resolveProjectFileQueryData,
  setProjectFileQueryData,
  shouldRefreshProjectFileDetail,
} from "./projectFilesQueryState";

const environmentId = EnvironmentId.make("environment-project-files-query-test");

describe("project files queries", () => {
  beforeEach(() => {
    executeAtomQuery.mockResolvedValue({ _tag: "Failure", cause: null });
  });

  it("refreshes server contents whenever a non-image file detail opens", () => {
    expect(shouldRefreshProjectFileDetail("README.md", false)).toBe(true);
    expect(shouldRefreshProjectFileDetail("logo.png", true)).toBe(false);
    expect(shouldRefreshProjectFileDetail(null, false)).toBe(false);
  });

  afterEach(() => {
    clearProjectFileQueryData(environmentId, "/repo", "convex.json");
    executeAtomQuery.mockReset();
    vi.unstubAllGlobals();
  });

  it("keeps the latest optimistic draft when an older write finishes", () => {
    vi.stubGlobal("window", {});
    const initial = {
      relativePath: "convex.json",
      contents: '{"nodeVersion":"20"}',
      byteLength: 20,
      truncated: false,
    } satisfies ProjectReadFileResult;
    setProjectFileQueryData(environmentId, "/repo", "convex.json", '{"nodeVersion":"220"}');
    setProjectFileQueryData(environmentId, "/repo", "convex.json", '{"nodeVersion":"22"}');

    expect(getOptimisticProjectFileQueryData(environmentId, "/repo", "convex.json")?.contents).toBe(
      '{"nodeVersion":"22"}',
    );

    expect(
      confirmProjectFileQueryData(environmentId, "/repo", "convex.json", '{"nodeVersion":"220"}'),
    ).toBe(false);

    expect(resolveProjectFileQueryData(environmentId, "/repo", "convex.json", initial)).toEqual({
      relativePath: "convex.json",
      contents: '{"nodeVersion":"22"}',
      byteLength: 20,
      truncated: false,
    });

    expect(
      confirmProjectFileQueryData(environmentId, "/repo", "convex.json", '{"nodeVersion":"22"}'),
    ).toBe(true);
  });

  it("keeps confirmed contents until the refreshed query observes the persisted write", async () => {
    const confirmedContents = '{"nodeVersion":"22"}';
    executeAtomQuery
      .mockResolvedValueOnce({
        _tag: "Success",
        value: {
          relativePath: "convex.json",
          contents: '{"nodeVersion":"20"}',
          byteLength: 20,
          truncated: false,
        },
      })
      .mockResolvedValueOnce({
        _tag: "Success",
        value: {
          relativePath: "convex.json",
          contents: confirmedContents,
          byteLength: 20,
          truncated: false,
        },
      });

    setProjectFileQueryData(environmentId, "/repo", "convex.json", confirmedContents);
    expect(
      confirmProjectFileQueryData(environmentId, "/repo", "convex.json", confirmedContents),
    ).toBe(true);
    await vi.waitFor(() => expect(executeAtomQuery).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(getOptimisticProjectFileQueryData(environmentId, "/repo", "convex.json")?.contents).toBe(
      confirmedContents,
    );

    expect(
      confirmProjectFileQueryData(environmentId, "/repo", "convex.json", confirmedContents),
    ).toBe(true);
    await vi.waitFor(() =>
      expect(getOptimisticProjectFileQueryData(environmentId, "/repo", "convex.json")).toBeNull(),
    );
  });
});
