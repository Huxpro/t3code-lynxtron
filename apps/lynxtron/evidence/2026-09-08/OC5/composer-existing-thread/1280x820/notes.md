# OC5 Composer existing-thread evidence

- Source revision: `5a82f65b8` plus the current OC1-OC5 working-tree changes.
- Canonical source snapshot: `5686b023626886dc8de671be3ee684bdba6fb5783a85ffc5b4f48cad4abb3398`.
- Thread: `274e9e56-2cae-4657-b7df-8937308ba209` (`Native list transcript baseline`).
- Electron and Lynxtron use separate clones of the same starting snapshot. The retained Lynx clone's main database hash remained `5686b023...abb3398` after capture.
- Viewport: 1280 x 820 logical pixels, 2x 2560 x 1640 captures, dark theme.
- Exact-owned Lynxtron identity: root PID 51923, DevTool client `localhost:8901`, session 1, staged bundle `dist/desktop/main.lynx.bundle`. The process was stopped after capture.
- Semantic readiness: connector transport `main`, sequence 23, and zero warning/error console entries.
- Composer geometry is exact: Electron and Lynx are both `{x:384,y:628,width:768,height:172}`. The full measurement spec passes 5/5 anchors, 3/3 typography gates, and 4/4 semantic color gates.
- Content assertions each matched exactly once in the Lynx DOM: `High · 1M`, `lynxtron-port`, and `Ask anything, @tag files/folders, $use skills, or / for commands`. The measurement extractor does not include a Lynx `<textarea>` placeholder in `innerText`, so the Composer aggregate text field is not an applicable placeholder comparison.
- Computer Use real-input proof used owned PID 59025 and window 66483 on a disposable clone: model pill opened the model picker; runtime changed `Full access` → `Supervised`; interaction changed `Build` → `Plan`; New thread retained the same Composer composition; traits changed `High · 1M` → `Extra High · 1M`, with the connector logging the canonical model-options update.
- The first diagnostic attempt deleted the copied WAL/SHM pair and therefore showed an empty state. It was rejected before measurement metadata was retained. The formal capture preserved the complete inactive SQLite snapshot trio.
- The matching 1440 x 900 pair is recorded under the OC7 evidence directory
  and passes the same gates, completing OC5.
