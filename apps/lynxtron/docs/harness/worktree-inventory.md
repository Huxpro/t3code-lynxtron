# Historical Plan 11C H0 — Worktree and authority inventory

Captured: 2026-08-04
Repository: `/Users/bytedance/github/t3code`
Branch: `lynxtron-port`
HEAD: `4604dd443f8f351402eb33bc7fefa3f548194545`
Upstream: `lynxtron/lynxtron-port`
Upstream relation: ahead `0`, behind `0`
Merge base with local `main`: `9cbe50d10de90684f4322d467dd1eafe9f726045`
Relation to `origin/main`: behind `1`, ahead `46`
Relation to local `main`: behind `0`, ahead `208`

This file is an immutable snapshot of the pre-archaeology checkout. It does not
describe the current final5 branch or worktree.

This file is the H0 protection boundary. It records provenance and disposition
without deleting, resetting, staging, committing, or rewriting any existing
user work.

## Dirty-worktree summary

- Tracked modifications: **77**
- Untracked entries reported by Git: **98**
- Authored tracked diff: **15,027 insertions / 4,151 deletions across 77 files**
- Evidence footprint: **125 MB**
- Reports footprint: **28 MB**
- 2026-08-03 evidence files: **120**

The checkout on disk is authoritative. The uncommitted tree contains multiple
coherent work streams accumulated after `4604dd443`, not one atomic patch.

## First-match provenance rules

Every dirty path is covered by the first matching rule below. H1 may refine a
path to a narrower owner, but must not remove coverage.

| Priority | Path pattern | Count/status | Provenance | Owner | H0 disposition |
| ---: | --- | --- | --- | --- | --- |
| 1 | `apps/mobile/modules/**/.gradle/` | 4 untracked | Android build cache, unrelated to Lynxtron port | generated/accidental | Do not treat as product work. Eligible for H8 deletion only after confirming no active Android build. |
| 2 | `apps/lynxtron/evidence/**` | 46 untracked Git entries; 125 MB total tree | Historical T5/T6, Plan 11 Native, BW, SB, failed attempts and generated visual diffs | mixed evidence | Preserve. H1/H2 registry must classify retained/diagnostic/invalid/superseded before any deletion. |
| 3 | `apps/lynxtron/reports/**` | 5 modified, 11 untracked | Generated audits, capture metadata, reuse reports and SB probes | generated reports | Preserve inputs and reproducible outputs. H1 records generator and authority; H8 may delete reproducible duplicates. |
| 4 | `apps/lynxtron/scripts/**` | 5 modified, 15 untracked | Plan 11 semantic verifier, Native capture, Browser Preview, shared-server workbench and diagnostic probes | Harness work | Preserve. H1 separates current candidates from obsolete/diagnostic scripts; no script is current authority until H2/H3 verifier coverage exists. |
| 5 | `apps/lynxtron/src/browser-preview/**` | 6 modified, 3 untracked | Plan 11A/11B Browser Preview, static fallback and live connector host | Browser Harness | Preserve. H3 will decide the minimal supported Fast Harness graph. |
| 6 | `apps/lynxtron/src/main/**` | 5 modified, 2 untracked | Plan 10/11 main-owned connector, readiness, branding and lifecycle work | Native host product work | Preserve as product code. Requires focused tests and Native boundary evidence before classification as complete. |
| 7 | `apps/lynxtron/src/app/**` | 15 modified, 6 untracked | Plan 10/11 Lynx product composition, settings, router, lifecycle and UI convergence | Lynx product work | Preserve. H6 audits actual residuals; old plan status is not sufficient. |
| 8 | `apps/lynxtron/docs/**` | 6 modified, 3 untracked | Implementation history, Plan 11A/11B/11C, visual capture and gap log | documentation/context | Preserve. Plan 11C is current Harness authority; H1 normalizes status and history. |
| 9 | `apps/lynxtron/*` excluding above | 4 modified, 1 untracked | package scripts, config, Tailwind and local ignore rules | Lynxtron config | Preserve. H3/H5 verify current need and generated ownership. |
| 10 | `apps/web/**` | 26 modified, 7 untracked | Shared composition extraction, Settings, Sidebar, overlays, Composer and lifecycle surfaces | shared product work | Preserve as product/source-reuse work. Web regressions must be independently checked; no file may be removed as “Harness cleanup”. |
| 11 | `packages/client-runtime/**` | 3 modified | Shared connection/lifecycle presentation and package exports | shared runtime product work | Preserve. H5 route graph classifies physical reuse and dependencies. |
| 12 | `packages/contracts/**` | 2 modified | IPC/branding contract changes | contracts product work | Preserve. Must remain schema/contracts-only per repository architecture. |
| 13 | any unmatched dirty path | currently 0 | unknown | user work | Stop and add an explicit rule before modifying it. |

## Detailed work-stream interpretation

### Product and architecture work

The tracked modifications under `apps/lynxtron/src/app`,
`apps/lynxtron/src/main`, `apps/web`, `packages/client-runtime`, and
`packages/contracts` contain the accumulated Plan 10/11 source-first port:

- main-owned connector and sequenced renderer protocol;
- semantic cold-start and lifecycle recovery;
- Sidebar V2, Composer, Settings, Quick Switch and Model Picker shared
  compositions;
- app branding and Appearance settings;
- Web-preserving platform hosts and contracts.

These changes are not Harness debris. H1 may mark their historical plan claims
as unverified, but must not delete the implementation.

### Harness and evidence work

The Browser Preview, shared-server scripts, SB reports and `2026-08-03/BW*` /
`SB*` evidence include several generations:

- Plan 11A hand-built Web reference experiment;
- Plan 11B real-Web/shared-server correction;
- interrupted `SB4b`, `SB4c`, `SB4d`, and `SB4final` diagnostic runs;
- current real-Web/Lynx-for-Web frames;
- one-off probes such as `diagnose-lynx-styles.mjs`.

None is automatically admitted to the new strict evidence manifests. H1
classifies them; H2 verifier admission is required for retained status.

### Historical visual evidence

The large July evidence roots contain valuable provenance but also generated
diff duplication and failed attempts:

| Root | Approximate size | H0 classification |
| --- | ---: | --- |
| `2026-07-27/T5-F3` | 12 MB | historical paired fidelity evidence; retain pending registry |
| `2026-07-27/T5-F4` | 6.2 MB | historical Settings diagnostics including failed attempts |
| `2026-07-27/T5-F5` | 2.0 MB | historical Settings state evidence |
| `2026-07-28/T5-F5` | 43 MB | historical certification plus many reproducible side-by-side/diff outputs |
| `2026-07-28/T6-C1` | 26 MB | historical Sidebar/Header probes and certification attempts |
| `2026-07-29/*` | about 7 MB | transcript, keyboard, Sidebar and runtime-upgrade evidence |
| `2026-08-01/OC*` | about 2 MB | Plan 11 Native semantic reports and notes |
| `2026-08-02/BW*` | under 1 MB | Browser compatibility/host diagnostic evidence |
| `2026-08-03/BW2` | 18 MB | hand-built reference-host matrix; superseded for certification |
| `2026-08-03/SB4*` | about 8.5 MB | real-Web iterations; only strict-manifest admission may retain a cell |

No H0 evidence is deleted.

## Process and port ownership

### Explicitly external / user-owned

The following processes belong to
`/Users/bytedance/github/lynxtron-examples/.claude/worktrees/worktree-align-upstream-main-93a2df`
and are unrelated to this T3 checkout:

- shell PID `17513`;
- Lynxtron CLI PID `18740`;
- Lynxtron app PID `18748`;
- extension host PID `18862`;
- Lynxtron app PID `68206`.

Observed listeners include:

- `*:8903` owned by PID `18748`;
- `*:8901` owned by PID `68206`.

**Do not stop, focus, attach, resize, or reuse these clients.** They are user
work and are outside Plan 11C.

### Unknown / unowned listeners

Observed at H0:

- Node PID `59191` on `[::1]:9933`;
- Bun PID `59192` on `127.0.0.1:59132`;
- Node PID `99547` on `127.0.0.1:21783`.

They were not proven to belong to this run. Treat them as user-owned until a
later task proves exact PID/cwd/arguments. Do not kill by name or port alone.

### T3 Plan 11C ownership

No T3 server, Browser Harness, Chrome session, or Lynxtron Native process was
started by H0. H0 owns no runtime PID or port.

## Isolated state

- Workbench state directory:
  `apps/lynxtron/.t3-workbench`
- SQLite:
  `apps/lynxtron/.t3-workbench/userdata/state.sqlite`
- SQLite SHA-256:
  `4f3ab2a192e031e3f169deef96ba0136693795d9e444645ee9737b1a1a3d64ad`
- SB2 seed report:
  `apps/lynxtron/reports/sb2-seed.json`
- SB2 report SHA-256:
  `bdddfa5f7eabdc17ceb91da7bef460e8c025c01af8e65fe0e696a6af3a5657a0`

The SQLite file is isolated from live `~/.t3/userdata`, but it is not yet a
Plan 11C canonical snapshot. H2/H3 must create a manifest-recorded snapshot and
prove selected project/thread/model identity before retaining frames.

## Known accidental / reproducible candidates

The following are candidates for H8 cleanup, not H0 deletion:

- four Android `.gradle` directories;
- `failed-attempts/` diagnostic images;
- generated `*-diff.png` and `*-side-by-side.png` whose source frames remain;
- interrupted `SB4b/c/d/final` directories;
- one-off `diagnose-lynx-styles.mjs`;
- old geometry baselines and static fallback probes;
- generated report JSON that can be reproduced by a known command.

Each candidate requires a registry entry and reference check before removal.

## Authority baseline

Current authority order after H0:

1. repository `AGENTS.md`;
2. `apps/lynxtron/docs/plans/00-execution-index.md`;
3. `apps/lynxtron/docs/plans/11c-synara-harness-reset-and-gap-prioritization.md`;
4. this inventory for worktree protection;
5. checkout source and newly verified evidence.

Plan 11A, Plan 11B, BW/SB reports, implementation status, ledger and gap logs
remain historical inputs only until H1 classifies them.

## H0 exit decision

H0 is complete:

- every dirty path is covered by a provenance/disposition rule;
- external processes and ports are identified and protected;
- isolated state hashes are recorded;
- evidence volume and generations are inventoried;
- no user work was deleted, reset, staged, committed, or overwritten.

Exact next task: **H1 — create the current-state authority and evidence/context
registry, then update status/ledger/capture docs without deleting unclassified
artifacts.**
