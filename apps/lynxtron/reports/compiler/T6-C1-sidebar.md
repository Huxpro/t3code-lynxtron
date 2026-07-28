# T6-C1 Web Sidebar compiler probe

Date: 2026-07-28

Target: the complete 3,653-line
`apps/web/src/components/Sidebar.tsx` subtree, compiled as the production Lynx
entry with the same `lynx.config.ts` resolver and transforms used by Lynxtron.

## First probe

The original subtree failed before component compilation because the Lynx
resolver did not expose the Web `~` source alias. Once that alias resolved, the
remaining linker gaps were:

- `apps/web/src/platform/clientCapabilities.lynx.ts` was absent;
- the ReactLynx compatibility shim did not provide the named React `version`;
- the DOM shim did not provide `unstable_batchedUpdates` required by
  `@dnd-kit/core`.

These are platform-resolution or compatibility-leaf gaps, not reasons to copy
the Sidebar composition.

## Second probe

After adding the alias, one platform leaf, and the two compatibility exports,
the unchanged Web Sidebar subtree compiled successfully:

```text
probe_status=0
main.lynx.bundle  2426.4 kB
total             2427.2 kB
built in          6.58 s
```

The only compiler warnings are the existing Effect `import.meta` warnings.
This proves the complete Web Sidebar is the compiler-first target; a smaller
clean-room renderer is not required by the compiler.

The probe is reproducible without changing the production entry:

```sh
PROBE_OUTPUT="$(mktemp -d /tmp/t3code-t6-c1-sidebar-probe.XXXXXX)"
T3_LYNXTRON_PROBE_ENTRY="$PWD/apps/web/src/components/Sidebar.tsx" \
T3_LYNXTRON_PROBE_OUTPUT="$PROBE_OUTPUT" \
pnpm --dir apps/lynxtron exec rspeedy build --environment lynx --mode production
```

## Runtime leaves to test next

Compilation does not certify runtime compatibility. The next runtime probe
must exercise the complete subtree and record failures in dependency order:

1. TanStack React Router hooks versus registered R4;
2. Base UI DOM primitives and portals;
3. DnD/auto-animation DOM sensors;
4. global keyboard handlers under registered R5;
5. project/thread state host wiring;
6. SVG/icon rendering under registered R1.

The first failing runtime leaf should be split or adapted before changing the
shared composition. Do not replace this result with a smaller independent
Sidebar.
