# OC0 lifecycle-error diagnostic baseline

This diagnostic bundle renders the real `AppSidebarLayout → ChatView → ChatHeader/Composer` product tree with a deterministic `status: "error"` fixture. It is not a packaged-readiness test and its null transport diagnostic is expected: the probe deliberately prevents `useT3ClientState()` from starting a connector transport so the error state cannot be overwritten.

- Probe entry: `src/app/probes/lifecycle-error-runtime.tsx`.
- Expected visible detail: `OC0 fixture: backend unavailable; reconnect from the lifecycle affordance.`
- Owned Lynxtron PID: 54600; server-ready port: 50839; DevTool client: `localhost:8903`; session: 1.
- Exact probe bundle: `/tmp/t3code-oc0-lifecycle.Lddu9D/main.lynx.bundle`, 1,744,001 bytes, SHA-256 `50c2c2e842d374ae0d85eeb6db10c3547037154a88f560d422bc5a180c13ed7f`.
- Logical viewport: 1280 x 820; retained JPEG: 2560 x 1640 at device pixel ratio 2.
- DevTool renderer console: zero errors.
- Cleanup: PID 54600 exited and owned ports 8903/50839 were free; Synara/Fiddle were untouched.

The machine assertion proves the O5 failure signature: neither header nor shell contains the supplied error detail, while the disabled Composer says only `Connecting to T3 Code…`. The same frame also confirms that shared Nightly stage artwork renders when the fixture supplies a Nightly server version; the production O4 failure is stage resolution, not missing artwork code.
