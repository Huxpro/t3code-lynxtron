# Rejected full `composerDraftStore` reuse probe

This directory is diagnostic evidence, not certification.

The Lynx-specific Sidebar draft adapter was temporarily removed so the
production resolver consumed the complete Web `composerDraftStore.ts`. The
production build succeeded and the strict App Shell reuse report temporarily
rose from 27.5% / 36.0% to 34.5% / 49.0% (modules / lines), but a fresh real
Lynxtron launch failed before first paint.

Lynx DevTool reported main-thread `TypeError: not a function`, missing snapshot
types, and `snapshotPatchApply failed: ctx not found`; the captured frame is
blank. The adapter was restored, the normal 2039.4 kB production bundle rebuilt,
and the strict report returned to 27.5% / 36.0%.

This rules out treating Web-store compilation as proof of runtime reuse. The
draft lifecycle must be decomposed into renderer-neutral state and bounded
host effects before it can replace the Lynx adapter.
