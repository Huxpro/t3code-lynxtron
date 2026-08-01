# BW0 current-stack browser compatibility

- Source HEAD at run: `f3a2be1e47153779042f7eac3712424f207c3582`
- Browser: isolated Chrome 151.0.7922.72, PID 41128, CDP 9351
- Profile: `/tmp/t3code-bw0-chrome.HLkQFj`
- Static host: owned port 41983
- Entry: existing `src/app/index.tsx`
- Native output: `output/bundle/lynx/main.lynx.bundle`
- Web output: `output/bundle/web/main.web.bundle`
- Browser copy: `output/browser-preview/lynx/main.web.bundle`

The first control attempt loaded the Native bundle in `<lynx-view>` and was
rejected with `Invalid Magic Header`. The valid path is an Rspeedy environment
named `web`, which makes the already-installed ReactLynx build plugin choose
`WebEncodePlugin`. It emits a separate Web template from the same entry and
module graph; no product JSX is copied.

The retained probe reached the host's `rendered` signal, found a real
`x-view` product tree, and showed the shared chat/composer anatomy plus Lynx
Sidebar V2 and wordmark leaves. It recorded no renderer errors and no
unexplained console errors. Chrome reports one sandbox warning created by the
Web Platform's internal hidden iframe; it is retained in `probe.json` and is
not a T3 product exception.

The requested Lynx cell is 1280 x 820. Chrome's visible content viewport in
this diagnostic run is 1280 x 733 at DPR 2, so `browser.png` is BW0 diagnostic
evidence only. BW2 owns exact matched pane and exported-image dimensions.
The preview intentionally has no typed connector snapshot yet and therefore
shows the initial lifecycle shell; BW1 owns populated semantic readiness and
command recording.

Focused acceptance passed on the retained source: the Browser Preview,
Lynxtron, and Web TypeScript programs; the Rspeedy Web plus Rspack host build;
and the ReactLynx best-practices scan of both the production entry and browser
host. The build retains the two documented Effect `import.meta` warnings and
the generic Web-template asset-size warning; neither produced a runtime error.
