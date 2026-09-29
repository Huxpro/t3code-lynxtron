# OC4 Sidebar existing-thread evidence

- Source revision: `5a82f65b8` plus the current OC1-OC4 working-tree changes.
- Canonical source snapshot: `5686b023626886dc8de671be3ee684bdba6fb5783a85ffc5b4f48cad4abb3398`.
- Thread: `274e9e56-2cae-4657-b7df-8937308ba209` (`Native list transcript baseline`).
- Route state: the same existing thread in Electron and Lynxtron.
- Viewport: 1280 x 820 logical pixels, 2x 2560 x 1640 captures, dark theme.
- Electron capture explicitly sets the shared Sidebar preference to 256 px; Lynx uses the same shared default.
- Renderer errors: Electron 0; Lynx DevTool 0.
- Sidebar visual gates: Sidebar max delta 1 px; header 0 px; Search 7 px; active row 5 px. All pass the 8 px threshold. All three measured font sizes pass the 2 px threshold.
- Popup interaction: Electron closed trigger `{8,104,203x32}`, row `{18,178,219x20}`; open popup `{8,140,203x74}` with row unchanged. Lynx closed trigger `{7,101,210x28}`, row `{16,173,224x18}`; open popup `{7,133,210x72}` with row unchanged; outside tap removes popup and keeps row at y=173.
- The former Composer geometry failure was subsequently closed in OC5; this
  directory remains the OC4 Sidebar acceptance record.
- Diagnostic side-by-side and pixel diff are not acceptance scores.
