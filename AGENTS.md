# T3 Code

T3 Code is a minimal GUI for coding agents. A Node WebSocket server wraps provider CLIs (Codex, Claude Code, Cursor, Grok, OpenCode) and serves web, desktop, and mobile clients.

You can think of T3 Code as an open source "bring-your-own-subscription" alternative to apps like Claude Desktop, Codex App, Cursor Glass and Conductor.

## What makes T3 Code special?

We have over 100,000 users who love T3 Code. It's important we maintain the things they love as we continue to iterate on the product. Here's a brief list of the things we can never compromise on.

### 1. Open at the core

T3 Code is truly open. We share our roadmap, we share how we think about things, and of course we share all our code. A large number of our users run forks. We work in the open, and should strive to stay that way.

### 2. Performance without compromise

Lots of apps have gotten bogged down with bad tech decisions and "slop". We have not, and we're proud of the performance of T3 Code. We regularly audit for performance regressions, often caused by sending too much data over websockets, css animations causing gpu spikes, lists being hard to render, and more. Make sure all changes are considerate of performance impact.

### 3. Remote ready

The architecture of T3 Code's websocket layer (npx t3) enables a lot of awesome remote features. These have become core to the product. Whether users are connecting directly over their local network, using Tailscale, or leaning in fully with T3 Connect (our tunnel solution, also in this repo), we need to make sure new features are properly supported.

### 4. Multi-surface

T3 Code has 3 key app surfaces: **web**, **desktop**, and **mobile**.

**Web** is kind of two surfaces, as we have the public facing "app.t3.codes" as well as locally hosting the web app through the `npx t3` command. Both need to be supported by all new features where reasonable.

**Desktop** is the main surface most users install first. It's a full Electron app that bundles the server runner as well. The desktop app can also be used as the host server, allowing remote connections from app.t3.codes or the mobile app.

**Mobile** is a React Native app for both iOS and Android, available on the App Store and Google Play. The mobile app allows for connecting to any T3 Code server to control work remotely.

## A note from Theo

I like ambitious ideas, simple systems, and software that feels obvious. Do not preserve complexity just because it already exists. Do not introduce machinery because it looks architecturally impressive. Understand the real constraint, then fight for the smallest model that makes the correct behavior unsurprising.

Channel both "measure twice, cut once" and "yagni". Fight scope creep. Try to honor the dev's intent in both a minimal and realistic fashion.

The rest of this document is meant to help you navigate the codebase and make changes effectively. Think of these instructions less as "hard rules", more as "good defaults". The developer's preferences should be able to override anything here.

Of note: Most T3 Code contributions will come from T3 Code itself, often controlled remotely. This means you should be careful about accessing data, killing dev servers, and other things that may damage the T3 Code instance that the contributor is using.

## A small glossary

We need to be on the same page with terminology. When communicating, use this language:

- **you** means the agent reading this file and changing T3 Code.
- **we, us, and maintainers** mean Theo, Julius and the people building T3 Code. These are who you are talking to now.
- **user** means the person using T3 Code to direct coding agents.
- **agent** means the coding agent a user runs inside T3 Code. Depending on context, that may also include you.
- **provider** means the agent runtime or harness T3 Code talks to, such as Codex, Claude, Cursor, or OpenCode.
- **client** means the web, desktop, or mobile UI.
- **environment** means one running T3 server and the machine, filesystem, provider credentials, and state it owns.
- **project** means an environment-local workspace record rooted at a directory.
- **thread** means the durable conversation and work history for a project.
- **turn** means one user-to-agent cycle, including follow-up work such as checkpointing.
- **T3 home** means the base data directory. Runtime state normally lives below its userdata directory.

## The three ways to hurt yourself

1. **Killing by pattern.** Never `pkill -f`, `pgrep | kill`, or `kill` a PID you found by matching a name, path, or worktree string. Your own agent process has this worktree's path in its argv, and this machine runs several other dev servers at once. Kill only a PID you captured at spawn, or the owner of your port from `ss -H -ltnp` after confirming `/proc/<pid>/cwd` is your worktree.
2. **Writing to the live install.** `~/.t3/userdata` is the developer's real T3 Code database, in use while you work. Reading it and copying from it are fine, and a good way to get real test data (see Test data). Never start a server against it, never open it read-write, never clean it up.
3. **Baking in origins.** Never set `VITE_HTTP_URL` or `VITE_WS_URL` for dev. Dev is single-origin and Vite proxies `/api`, `/ws`, `/oauth`, and `/.well-known`. Setting them bakes localhost into the bundle and silently breaks every remote browser.

## Hit every surface

The most common defect in this repo is a change that works on the path you tested and is missing everywhere else. Before calling frontend work done, walk this list and say which entries applied:

- **Entry points.** A behavior reachable from the chat view is usually also reachable from Settings, the command palette, and a keybinding. Fixing one is not fixing the feature.
- **Clients.** Web, desktop (wraps web, adds Electron shell/IPC), and mobile (React Native, separate navigation). Shared logic lives in `packages/client-runtime`
- **Providers.** Codex, Claude, Cursor, Grok, and OpenCode each have an adapter. Provider-shaped features need a decision per adapter, even if the decision is "not supported here".
- **Contracts.** Anything crossing the wire is typed in `packages/contracts`. Change the schema and the server, web, mobile, and desktop all follow.
- **Reverse states.** If you added a way in, add the way out and the way to see it. Snooze needs unsnooze. Close needs reopen. A one-way door is a bug.
- **Connection modes.** Local, remote/relay, and tunnel behave differently. Multi-device and multi-environment cases are real.
- **Docs.** `docs/` splits by audience. Behavior changes that a user would notice belong in `docs/user/` (shipped-product voice, no repo tooling or source paths); architecture and contributor changes in `docs/internals/`; runbooks in `docs/operations/`; new vocabulary in `docs/internals/glossary.md`.

## Dev servers

- `vp i` installs. Worktrees get this from the t3.json setup script; if module resolution looks broken, it probably did not run.
- `vp run dev` starts server and web. In a worktree, state defaults to that worktree's gitignored `.t3`, which deliberately outranks an ambient `T3CODE_HOME` so you cannot land on shared state by accident. An explicit `--home-dir` still wins.
- Ports derive from the worktree path and are stable across restarts, but read the real ones from the `[dev-runner]` line since occupied ports shift.
- `--share` publishes over the tailnet. Do not open the URL when you use this, just send it to the user with the pairing code included in url
- The web app requires pairing. Hand over the pairing URL, not the bare origin. A URL without its token is useless to whoever you gave it to.
- Stop what you started, by the PID you tracked. See rule 1.

## Test data

An empty database is a bad test. Seed your worktree's `.t3` with a copy of real data instead of pointing at live state:

- Copy from `~/.t3/userdata` (the developer's real data, the most realistic test set) or `~/.t3/dev`. Worktree state lives at `<worktree>/.t3/userdata`.
- Snapshot the database with `VACUUM INTO`, which is safe even while a server has the source open and yields one consistent file:

  ```bash
  mkdir -p .t3/userdata
  rm -f .t3/userdata/state.sqlite*  # VACUUM INTO refuses to overwrite
  bun -e "new (require('bun:sqlite').Database)(process.env.HOME + '/.t3/userdata/state.sqlite', { readonly: true }).run(\"VACUUM INTO '.t3/userdata/state.sqlite'\")"
  ```

  A plain `cp` is only safe when no server has the source open, and must bring the `-wal` and `-shm` siblings along. A live file copy is a corrupt copy.

- Bring `secrets` and `settings.json` only if the flow under test needs them.
- Copy in, never symlink. Data flows one way: into your sandbox, never back out.

## Verifying

- Smallest proof that the change works. `vp test run <files>` for the tests you touched, targeted lint and typecheck for the scope you changed.
- **Do not run repo-wide checks.** No `vp check`, no `vp run -r test`, no `vp run -r typecheck` unless I ask. CI owns the full suite.
- Backend behavior changes ship with focused tests for that behavior.
- The server is event-sourced and its async flows emit typed receipts. Wait on receipts and worker drains, never on sleeps or polling. A test that needs a timeout to pass is wrong.
- Upon request, user-visible frontend changes should get one integrated pass in a real client: `test-t3-app` for web, `test-t3-mobile` for mobile. The primary agent does this once after integrating. Subagents do not launch their own dev servers. Ask permission before doing computer use or spinning up browsers.

## Lynxtron harnessing

Lynxtron verification has three distinct questions: did the code compile, did the product connect, and did the rendered interaction work? Evidence for one is not evidence for the others.

### Acceptance tiers

- **Use tiered acceptance.** For an implementation slice, run focused tests, the affected Web and Lynx typechecks, renderer scanner/audits, affected builds, and one fresh 1280 x 820 zero-error capture. Reserve paired viewports, themes, lifecycle states, and the complete visual matrix for phase exit. Repeating the full certification battery after every small change is waste, not confidence.
- **Use isolated realistic state.** Launch with a fresh `T3_LYNXTRON_BASE_DIR`, an explicit `T3_LYNXTRON_PROJECT_CWD`, and explicit `T3_LYNXTRON_VIEWPORT_WIDTH` / `T3_LYNXTRON_VIEWPORT_HEIGHT`. Seed a useful project or a safe database snapshot; do not point the app at live `~/.t3/userdata` and do not accept an accidental empty-state-only test as product coverage.
- **Build once per evidence run.** For a slice, build the affected artifact; for phase-exit evidence, run the complete production build. Record `HEAD`, the staged `dist/desktop` bundle paths and hashes, and the actual bundle URL/path reported by the DevTool session. A successful build or attached session does not prove that the running process loaded that build.

### Preflight and evidence validity

Prove the harness before using it to judge the product. Do not retain a screenshot in the certification matrix until all applicable preflight checks pass:

- Record the isolated state directory, server/Lynxtron/Web PIDs, listening ports, executable path, explicit viewport variables, route, theme, and snapshot identity.
- Use one complete canonical snapshot for Web and Lynx. Create missing fixture data through the real product API or RPC, not renderer-only hard-coding.
- Resolve the DevTool client from the owned Lynxtron PID and its listening port, then verify the expected session bundle. Never choose a client by list order, a remembered port, or app name alone; Fiddle and other Lynxtron instances commonly coexist.
- For Web evidence, use a named isolated browser session. Record `innerWidth`, `innerHeight`, `visualViewport`, device pixel ratio, and exported image dimensions, then close only that session.
- For Native evidence, distinguish requested window size, LynxView content size, device pixel ratio, and exported image size. Reject a frame whose measured dimensions do not match the recorded cell semantics.
- Gate on semantic readiness. Server output saying `T3 Code server is ready`, the existence of a DevTool session, a visible window, and an empty error console are insufficient. Require `globalThis.__T3_LYNXTRON_CONNECTOR_TRANSPORT__` to report `kind === "main"`, require a nonnegative advancing `lastSeq()`, and assert a known project/model or another canonical state in the UI. A window that still says Connecting is a failed smoke even if the child server is listening.

Treat retained evidence as invalid, not as a product regression, when the client/process/bundle identity is wrong, Web and Lynx use different state/route/theme, dimensions are wrong, a production bundle requests a dev asset server, an outside writer changes persisted state, or runtime errors occur during capture. Keep diagnostic screenshots outside the certification matrix and fix the harness first.

### Startup and signal discipline

- Exercise the real startup order. Connector tests that instantiate the host directly do not cover the `LynxWindow` lifecycle. The packaged launch harness must catch bridge-registration races between `loadFile`, `lynxBridge.handle`, renderer bootstrap, and server readiness. Do not hide a failed bridge probe with a sleep, reload, fixture injection, or screenshot; fix the ordering or readiness protocol.
- Wait on signals, not elapsed time. Capture the spawned process and its logs, then wait for server-ready and renderer-ready diagnostics/state. A bounded deadline may fail the harness, but a fixed sleep must not decide success.
- If an owned Native process exits twice with the same error, stop reopening it and diagnose the runtime. Do not create a restart loop that repeatedly raises windows over the user's desktop.

### Computer Use and DevTool roles

- Ask permission before computer control. Once authorized, prefer Computer Use to inspect and operate an already-running owned app for visible route changes, menus, theme changes, scrolling, focus, and real OS keyboard input. Use DevTool for exact LynxView screenshots, DOM/component geometry, runtime evaluation, and console capture. Record which channel proved each interaction.
- Verify the exact process and staged bundle before reusing a visible app. Computer Use acting on an installed or stale app with the same display name is a harness failure.
- Do not use `open -a`, AppleScript activation, deep links, or shell-driven menu/focus commands merely to drive certification; those paths can disturb the user's desktop and do not prove the interaction under test. Bringing the exact owned process forward is allowed when the user explicitly asks to see or operate it.
- DevTool currently provides reliable tap injection, not physical keyboard, wheel, drag, focus, or selection evidence. Without an authorized Computer Use/user session, mark those checks `pending-user-session` instead of accumulating headless screenshots. Computer Use evidence counts only when it sends the real OS input and the visible result is recorded.
- A fresh T3 Lynxtron process has one reliable screencast frame. Establish readiness, drive the target state, and capture that frame; use a new owned process for the next retained Native frame. Do not copy another app's assumption that one Native process can supply a whole screenshot matrix.

### Run ordering, state restoration, and cleanup

- Put expensive work outside cheap variation: build once, prepare and hash one shared snapshot, then vary viewport, theme, route, and interaction state. Respect the one-frame constraint above; reuse build and fixture work, not an exhausted screencast session.
- Prefer disposable isolated state. If a verification run must change an existing persisted file, save its original bytes and hash, record the temporary bytes/hash, and restore only after the owned process exits and the current file still matches what this run wrote. If it changed unexpectedly, do not overwrite a possible competing writer; preserve the backup and report both hashes.
- Capture DevTool errors and warnings with every retained frame. Record geometry, image dimensions, bundle identity, client port, snapshot, route, theme, semantic readiness, interaction channel, and cleanup result in the evidence notes.
- Stop only owned PIDs, close only named browser/Computer Use sessions created for the run, confirm owned ports are free, and verify state cleanup before declaring the harness clean.
- **Handoff only a working window.** When asked to open the app, keep the process started by the agent alive, bring that exact process to the foreground, and verify product readiness before saying it is ready. Report whether the state is isolated or copied and retain the PID/session needed to stop only that process later.

## Pull requests

- Never make a PR unless the developer explicitly asks you to do so.
- Conventional commit titles, plain language: `fix(web): new threads no longer spike CPU`.
- Body: the problem in a sentence or two, then how you fixed it. End with the model and harness that did the work.
- **Rebase onto latest main before opening.** Stale branches conflict and burn a review round.
- UI changes need before/after images. Motion or timing needs a short video.
- One concern per PR. If the description says "also", split it.
- When babysitting: poll checks and comments newer than the last push, verify each bot finding against the source, fix real ones, dismiss false positives with a written reason. Stay quiet when nothing is new. Stop when the bots are green on the latest commit.

## How it works

Clients send typed WebSocket requests. The server turns them into _commands_, a pure _decider_ turns commands into persisted _events_, and a _projector_ derives the read model the UI renders. Provider CLIs run as subprocesses; per-provider _adapters_ translate their native protocols into orchestration events. Side effects run in queue-backed _reactors_ that emit _receipts_ when milestones land. Each turn ends with a _checkpoint_, a hidden git ref, so the app can diff and restore.

Full glossary with file links: `docs/internals/glossary.md`

## Where code lives

- `apps/server` - WebSocket, orchestration, providers, checkpointing. Effect-heavy: read `.repos/effect-smol/LLMS.md` before writing Effect code.
- `apps/web` - React/Vite UI. `apps/desktop` wraps it, `apps/mobile` is React Native, `apps/marketing` is the site.
- `packages/contracts` - Effect/Schema contracts plus small derived helpers. No heavy runtime logic.
- `packages/shared` - shared runtime utils, subpath exports, no barrel.
- `packages/client-runtime` - client code shared by web and mobile.
- `.repos/` - vendored read-only references. Prefer their patterns over invented ones. Never edit or import from them. Sync with `vpr sync:repos` when bumping the matching dependency.

## Taste

- Complexity belongs at the adapter boundary. Orchestration stays pure, UI stays dumb.
- Inferred types over annotations. `any` is the enemy.
- Comments describe how a thing is used, and move when the code moves. To be used mostly to describe functions, not to annotate every line of behavior.
- Our users drive agents all day and notice a dropped frame, a lying spinner, and a stale label. No continuously repainting animations; they peg the GPU on high-refresh displays.
- If a rule here fights the task in front of you, say so loudly and get a human sign-off before breaking it.

## Additional tips

- Don't verify with browsers or computer use unless the user explicitly agrees or requests it.
- Security is important, but should not be over-indexed on, especially for dev mode/maintainer-only features.
