# BW1 deterministic refresh

This is a normal refresh of the `populated-ready` scenario without rebuilding
the host between navigation and capture. The tightened readiness gate waited
for all of the following before retaining the evidence:

- the Lynx Web product root rendered;
- the browser native-module bridge registered;
- the renderer called typed connector `ready`;
- the canonical project, thread, and model were present in product text;
- no unexplained runtime error occurred.

The connector restarted deterministically at sequence 0 with one ready call.
The three profiling `NYI` messages are known Lynx Web runtime diagnostics and
are recorded separately from unexplained errors.
