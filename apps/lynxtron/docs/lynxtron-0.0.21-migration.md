# Lynxtron 0.0.21 migration

Last updated: 2026-09-10

This ledger tracks the upgrade of the complete Lynxtron product baseline at
commit `97605a1b8` (the build with Components Lab, Terminal, and Browser
surfaces). It deliberately does not use the older `5a82f65b` checkout as the
product baseline.

## Version changes

| Package                                       | Before              | Current             | Status               |
| --------------------------------------------- | ------------------- | ------------------- | -------------------- |
| `@lynx-js/lynxtron`                           | `0.0.18`            | `0.0.21`            | upgraded             |
| `@lynx-js/lynxtron-dev-plugins`               | `0.0.18`            | `0.0.21`            | upgraded             |
| `@lynx-js/lynxtron-builder`                   | `0.0.18`            | `0.0.21`            | upgraded             |
| `@lynx-js/cef-webview`                        | `0.0.18`            | `0.0.18`            | temporarily retained |
| `@lynx-js/react`                              | `0.120.0`           | `0.123.1`           | upgraded             |
| `@lynx-js/react-rsbuild-plugin`               | `0.16.x`            | `0.18.1`            | upgraded             |
| `@lynx-js/rspeedy`                            | `0.14.x`            | `0.16.1`            | upgraded             |
| `@lynx-js/lynx-core`                          | `0.1.3`             | `0.1.4`             | upgraded             |
| `@lynx-js/type-config` / `@lynx-js/types`     | `3.6.0` / `3.8.0`   | `4.1.1` / `4.1.0`   | upgraded             |
| `@lynx-js/web-core` / `@lynx-js/web-elements` | `0.21.0` / `0.12.3` | `0.23.0` / `0.12.7` | upgraded             |

## T3 compatibility changes

ReactLynx 0.123.1 tightened intrinsic-element and branded-value types. The
migration keeps runtime behavior unchanged while adapting the following
boundaries:

- browser probe navigation now narrows the optional success URL;
- pairing-code expiry fallback remains an ISO timestamp;
- Components Lab columns accept the already-used `className`;
- command collection stories narrow their generic item at the render boundary;
- the local environment constant is branded at the fixture boundary;
- the Lynx input wrapper forwards `id`;
- host elements narrow unknown `className` values and accept focus events that
  do not contain a mouse button;
- menu probe callbacks normalize to `Promise<void>`;
- popover refs are cast only at the Lynx intrinsic boundary;
- tooltip overlay level uses the new numeric union.

## Confirmed 0.0.21 packaging regression

Lynxtron 0.0.21 stages the development runtime at
`dist/devtool/Lynxtron.app` and exposes the selected executable through
`@lynx-js/lynxtron/native-paths`. The packaged-readiness harness previously
assumed the pre-0.0.21 `dist/Lynxtron.app` layout, so preflight failed before
launching the owned process. The harness now uses the package export first and
retains its legacy path only as a fallback for older runtimes.

### CEF WebView archive

`@lynx-js/cef-webview@0.0.21` cannot currently be installed on macOS arm64. Its
postinstall downloads:

```text
https://github.com/lynx-family/lynxtron/releases/download//v0.0.21/cef_webview-v0.0.21-darwin-arm64.zip
```

The downloaded file is 14,372,766 bytes with SHA-256
`9ceb77d61d8d728b5a1f060fec0c735af4da437786d7f622fc07f92b9fbd15f0`,
but both `zip-lib` and the system `unzip -t` reject it because the end-of-central-
directory record is missing. A fresh direct download from the canonical release
asset produced the same byte count, SHA, and failure, so this is not a transient
local download.

The migration therefore retains `@lynx-js/cef-webview@0.0.18` so the existing
builtin-browser implementation and framework staging do not regress while the
host runtime, builder, and dev plugin move to 0.0.21. Remove this exception when
the 0.0.21 macOS arm64 asset is republished as a valid archive.

## Verification

- connector transport tests: 30/30 passed;
- Lynx app and desktop-main typecheck: passed after the compatibility changes;
- Browser-preview typecheck: passed;
- production build: passed;
- CEF 0.0.18 frameworks: staged into the 0.0.21 devtool runtime by
  `prepare:cef-runtime`;
- runtime launch and product-flow verification: pending the next migration
  slice.

## Window identity

The visually complete reference window is the checkout at commit `97605a1b8`.
Another running process from `t3code-archaeology-verify3` uses Lynxtron 0.0.16
and is retained only as the visual/behavioral reference. New acceptance runs
must use an isolated state directory, an owned PID, and a SHA-named bundle URL.
