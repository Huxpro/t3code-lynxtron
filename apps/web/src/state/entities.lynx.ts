import { useMemo } from "@lynx-js/react";
import type {
  EnvironmentProject,
  EnvironmentThread,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/shell";
import type {
  EnvironmentId,
  ScopedProjectRef,
  ScopedThreadRef,
  ServerConfig,
  ThreadId,
} from "@t3tools/contracts";

import { appAtomRegistry } from "../../../lynxtron/src/app/state/atomRegistry";
import { LYNX_PRIMARY_ENVIRONMENT_ID } from "../../../lynxtron/src/app/state/environment";
import {
  t3ClientStateAtom,
  useT3ClientState,
  type T3ClientState,
} from "../../../lynxtron/src/app/state/t3Client";

function scopeProjects(projects: T3ClientState["projects"]): ReadonlyArray<EnvironmentProject> {
  return projects.map((project) => ({
    ...project,
    environmentId: LYNX_PRIMARY_ENVIRONMENT_ID,
  }));
}

function scopeThreads(threads: T3ClientState["threads"]): ReadonlyArray<EnvironmentThreadShell> {
  return threads.map((thread) => ({
    ...thread,
    environmentId: LYNX_PRIMARY_ENVIRONMENT_ID,
  }));
}

export function useActiveEnvironmentId(): EnvironmentId {
  useT3ClientState();
  return LYNX_PRIMARY_ENVIRONMENT_ID;
}

export function readActiveEnvironmentId(): EnvironmentId {
  return LYNX_PRIMARY_ENVIRONMENT_ID;
}

export function setActiveEnvironmentId(_environmentId: EnvironmentId | null): void {}

export function useProjectRefs(): ReadonlyArray<ScopedProjectRef> {
  const projects = useProjects();
  return useMemo(
    () =>
      projects.map((project) => ({
        environmentId: project.environmentId,
        projectId: project.id,
      })),
    [projects],
  );
}

export function useThreadRefs(): ReadonlyArray<ScopedThreadRef> {
  const threads = useThreadShells();
  return useMemo(
    () =>
      threads.map((thread) => ({
        environmentId: thread.environmentId,
        threadId: thread.id,
      })),
    [threads],
  );
}

export function useEnvironmentProjectRefs(
  environmentId: EnvironmentId | null,
): ReadonlyArray<ScopedProjectRef> {
  const refs = useProjectRefs();
  return environmentId === LYNX_PRIMARY_ENVIRONMENT_ID ? refs : [];
}

export function useEnvironmentThreadRefs(
  environmentId: EnvironmentId | null,
): ReadonlyArray<ScopedThreadRef> {
  const refs = useThreadRefs();
  return environmentId === LYNX_PRIMARY_ENVIRONMENT_ID ? refs : [];
}

export function useProjects(): ReadonlyArray<EnvironmentProject> {
  const { projects } = useT3ClientState();
  return useMemo(() => scopeProjects(projects), [projects]);
}

export function useServerConfigs(): ReadonlyMap<EnvironmentId, ServerConfig> {
  const { serverConfig } = useT3ClientState();
  return useMemo(
    () =>
      serverConfig
        ? new Map<EnvironmentId, ServerConfig>([[LYNX_PRIMARY_ENVIRONMENT_ID, serverConfig]])
        : new Map<EnvironmentId, ServerConfig>(),
    [serverConfig],
  );
}

export function useThreadShells(): ReadonlyArray<EnvironmentThreadShell> {
  const { threads } = useT3ClientState();
  return useMemo(() => scopeThreads(threads), [threads]);
}

export function useAllEnvironmentShellsBootstrapped(): boolean {
  const { status } = useT3ClientState();
  return status === "ready";
}

export function useThreadShellsForProjectRefs(
  refs: ReadonlyArray<ScopedProjectRef>,
): ReadonlyArray<EnvironmentThreadShell> {
  const threads = useThreadShells();
  return useMemo(() => {
    const projectIds = new Set(
      refs
        .filter((ref) => ref.environmentId === LYNX_PRIMARY_ENVIRONMENT_ID)
        .map((ref) => ref.projectId),
    );
    return threads.filter((thread) => projectIds.has(thread.projectId));
  }, [refs, threads]);
}

export function useProject(ref: ScopedProjectRef | null): EnvironmentProject | null {
  const projects = useProjects();
  return (
    projects.find(
      (project) =>
        ref !== null && project.environmentId === ref.environmentId && project.id === ref.projectId,
    ) ?? null
  );
}

export function useThreadShell(ref: ScopedThreadRef | null): EnvironmentThreadShell | null {
  const threads = useThreadShells();
  return (
    threads.find(
      (thread) =>
        ref !== null && thread.environmentId === ref.environmentId && thread.id === ref.threadId,
    ) ?? null
  );
}

export function useThread(ref: ScopedThreadRef | null): EnvironmentThread | null {
  return useThreadShell(ref) as EnvironmentThread | null;
}

export function readProject(ref: ScopedProjectRef): EnvironmentProject | null {
  return (
    scopeProjects(appAtomRegistry.get(t3ClientStateAtom).projects).find(
      (project) => project.environmentId === ref.environmentId && project.id === ref.projectId,
    ) ?? null
  );
}

export function readThreadShell(ref: ScopedThreadRef): EnvironmentThreadShell | null {
  return (
    scopeThreads(appAtomRegistry.get(t3ClientStateAtom).threads).find(
      (thread) => thread.environmentId === ref.environmentId && thread.id === ref.threadId,
    ) ?? null
  );
}

export function readEnvironmentSupportsSettlement(environmentId: EnvironmentId): boolean {
  const config = appAtomRegistry.get(t3ClientStateAtom).serverConfig;
  return (
    environmentId === LYNX_PRIMARY_ENVIRONMENT_ID &&
    config?.environment.capabilities.threadSettlement === true
  );
}

export function readEnvironmentSupportsSnooze(environmentId: EnvironmentId): boolean {
  const config = appAtomRegistry.get(t3ClientStateAtom).serverConfig;
  return (
    environmentId === LYNX_PRIMARY_ENVIRONMENT_ID &&
    config?.environment.capabilities.threadSnooze === true
  );
}

export function readEnvironmentThreadRefs(
  environmentId: EnvironmentId,
): ReadonlyArray<ScopedThreadRef> {
  if (environmentId !== LYNX_PRIMARY_ENVIRONMENT_ID) return [];
  return scopeThreads(appAtomRegistry.get(t3ClientStateAtom).threads).map((thread) => ({
    environmentId: thread.environmentId,
    threadId: thread.id,
  }));
}

export function readThreadRefs(): ReadonlyArray<ScopedThreadRef> {
  return readEnvironmentThreadRefs(LYNX_PRIMARY_ENVIRONMENT_ID);
}

export function findThreadRef(threadId: ThreadId): ScopedThreadRef | null {
  return readThreadRefs().find((ref) => ref.threadId === threadId) ?? null;
}
