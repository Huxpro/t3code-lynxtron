# Upstream sync 2026-09-29 and feature port backlog

## Plan metadata

- Content type: Merge record and port backlog
- Status: `in_progress` (merge landed; feature ports pending)
- Branch: `lynxtron/upstream-sync-2026-09-29` (from `lynxtron/full-ui-0.0.21` at `5a3f20b93`)
- Upstream: `origin/main` (pingdotgg/t3code), 463 commits past merge base `0ad91b6e7f`
- Product authority: upstream Web/Electron after the merge
- Created: 2026-09-29

## Merge policy

Upstream rewrote several Web areas our fork had moved behind shared Surface
components (sidebar, chat view, composer, timeline, settings panels). Where
both changed, the merge takes upstream's Web file and keeps only the fork's
test hooks (`data-*` attributes, class hooks) and shared helper calls that
behave identically. Web therefore renders upstream's layout again; Lynx still
renders the fork's shared Surfaces and now lags upstream in those areas. The
feature ports below close that gap one feature at a time.

Consequences to keep in mind:

- Web no longer renders through `ChatRouteSurface`, `ComposerSurface`,
  `ChatHeaderSurface`, `ComposerPending*Surface`, `ChangedFilesCardSurface`,
  `ThreadErrorBannerSurface`, `TranscriptRowSurface`, `SidebarV2*Surface`, or the
  shared General Settings composition. Lynx still does.
- Web's General settings route renders upstream's `GeneralSettingsPanel`
  (`SettingsPanels.tsx`). Lynx keeps `GeneralSettingsContent` minus the two
  removed rows (task panel auto-open, assistant streaming).
- Upstream's sidebar V2 became `Sidebar.tsx`; Lynx keeps `SidebarV2.lynx.tsx`
  and `Sidebar.lynx.tsx` (legacy) through `AppSidebarLayout.lynx.tsx`.

## Lynx fixes made during the merge

- Settings: `enableAssistantStreaming` became `enableLegacyTokenStreaming`;
  `autoOpenPlanSidebar` was removed, and so was the Lynx plan panel auto-open
  (upstream folds plans into chat).
- Shims for new shared imports: `useCanGoBack` (always false in Lynx),
  `defaultAnimateLayoutChanges`, `SidebarUpdateArchitectureWarning`,
  `resolveSidebarStageFocusRingOffsetClass`, `env.lynx.ts`, `serverConfig: null`
  on the Lynx environment (hides Pull Requests), `Button` `micro`/`ghost-muted`,
  `SidebarMenuButton size="icon"`, the `chart-no-axes-column` icon.
- `generate-lynx-css.mjs` reads the dark sidebar palette from its new nested
  `[data-app-sidebar] { @variant dark }` block and no longer copies fonts from
  Web (upstream dropped DM Sans/JetBrains Mono; Lynx keeps its tracked copies).
- The shared keyboard matcher took upstream's layout-key fix, the search
  overlay keeps its mode on close, and the source-control "Could not verify"
  row shows the auth detail.
- The fork's responsive composer toolbar classes (`46f881897`) were restored
  after the merge took upstream's `BranchToolbar*`.

## Merge verification

Background native battery (the M7 plan, 23 entries) against a fresh server
bundle and Lynx build:

- First pass: 15/23. The failures were traced to upstream behaviour changes,
  not to Lynx rendering regressions:
  - OpenCode ships disabled by default. Harness runs now enable it in each
    copied state unless the fixture decides
    (`scripts/fixture-provider-defaults.mjs`); live revert and the remote
    journey pass again.
  - The sidebar Settings row became an icon utility menu; the Settings button
    keeps the `sidebar-settings-row` hook. Lynx hides the Usage button (no
    Usage page).
  - One more default keybinding (`themeEditor.toggle`): the read-only table has
    46 rows.
  - The fork's turn-start guard rejected the unchecked provider snapshot that
    upstream publishes right after a restart (`installed: false`,
    `status: "warning"`). A genuinely missing CLI reports `status: "error"`,
    which the guard still rejects, so the `installed` branch was removed
    (regression test in `ProviderCommandReactor.test.ts`).
  - Dark sidebar-scope and model-option runs were startup flakes; both pass on
    rerun.
- Open: `approval-intervention` can no longer be seeded from a static fixture.
  Upstream #7719 reconciles orphaned provider sessions at startup, so a seeded
  running session with a pending approval becomes an errored session. The
  approval gate needs a live approval-required turn (with P4).
- Budget: semantic ready 1.7 to 2.3 s passes; process-tree RSS is 0.96 to
  1.15 GB against 800 MB. Lynxtron stays at about 350 MB; the server grew to
  330 to 480 MB and a resident `claude` provider CLI adds about 270 MB. The
  budget needs to separate provider CLIs from the client before it is re-pinned.

## Known failures carried from HEAD (not merge-caused)

Verified against HEAD content or a HEAD worktree:

- `apps/web/src/modelSelection.test.ts` "falls back without carrying a disabled
  instance model": the shared projection deliberately keeps a disabled explicit
  instance, contradicting the test.
- `scripts/shared-workbench/workbench.test.mjs` source-control badge count, and
  `transcriptLayoutContract.test.ts` diff file gap (16px in CSS, 8px in test).
- `client-runtime` `tsgo`: `previewAnnotation.test.ts`, `reviewComment.test.ts`,
  `transcript.test.ts` fixture typing; Effect lint findings for `Date` use.
- Upstream's new `namespace-node-imports` lint rule flags most Lynx scripts.

## Feature port backlog

Ordered by product value to a Lynx user. Each port brings the Lynx surface to
upstream's behaviour through shared source where the runtime allows, with a
focused test and a background smoke.

| #   | Upstream feature                                                                                     | Lynx area                         |
| --- | ---------------------------------------------------------------------------------------------------- | --------------------------------- |
| P1  | Remove Build/Plan toggle; plan mode behind Legacy features (#5551, #5664)                            | Composer, General settings — done |
| P2  | Collapse tool activity into one line; subagent rows and counts (#7152, #5745)                        | Transcript                        |
| P3  | Composer state drawers, question prompt collapse (#7150, #6773)                                      | Composer interventions            |
| P4  | Approval actions: micro buttons, "Cancel"/"Approve" (upstream restyle)                               | Composer approval geometry        |
| P5  | Skills listed with slash commands (#7737)                                                            | Composer command menu             |
| P6  | Sidebar footer utility menu, back buttons, pinning and pin order (#6210, #6031, #5312, #5581, #5578) | Sidebar                           |
| P7  | Thread actions from the header title; Copy Thread ID (#5592, #5574)                                  | Chat header, thread menus         |
| P8  | Confirm before closing a terminal (#7592)                                                            | Terminal — done                   |
| P9  | Configurable fonts and sizes; system font stacks (#5103)                                             | Appearance, typography            |
| P10 | Theme library and OKLCH palettes (#5226, #6036, #6183, #5636)                                        | Appearance, generated CSS         |
| P11 | Older timestamps show the date (#6654)                                                               | Transcript, sidebar               |
| P12 | Project settings page and manual project icons (#5768, #5775)                                        | Settings                          |
| P13 | Unsent drafts in the sidebar (#5777)                                                                 | Sidebar                           |
| P14 | Right panel empty state, surface dropdown shortcuts, maximize binding (#6258, #7318, #5091)          | Right panel                       |
| P15 | New thread picker shows project location (#7392)                                                     | New thread flow                   |

P1 notes: Lynx persists `planModeEnabled` with its client settings, forces the
default mode in the composer and in the dispatched turn (shared
`resolveThreadTurnDispatchState`), hides the toggle and `/plan` `/default`,
and shows the Legacy features rows (token streaming asks for native
confirmation). Upstream also strips the OpenCode "plan" agent from stored
text-generation selections when plan mode turns off; Lynx does not yet.

Out of scope for Lynx unless the runtime changes: pull request surfaces
(#6039, #7148, #7077, #6597), usage insights (#8101, #7147), browser defaults and
favicons (CEF stays opt-in, Plan 13), SSH editor handoff (#6572), launchd
service, AUR packaging, mobile-only and desktop-installer features.
