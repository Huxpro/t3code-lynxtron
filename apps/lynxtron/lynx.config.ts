import { defineConfig } from "@lynx-js/rspeedy";
import { pluginReactLynx } from "@lynx-js/react-rsbuild-plugin";
import { tanstackRouter } from "@tanstack/router-plugin/rspack";
import { rspack } from "@rspack/core";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const probeEntry = process.env.T3_LYNXTRON_PROBE_ENTRY?.trim();
const probeOutput = process.env.T3_LYNXTRON_PROBE_OUTPUT?.trim();
const webPreview = process.env.T3_LYNXTRON_WEB_PREVIEW === "1";

if ((probeEntry === undefined) !== (probeOutput === undefined)) {
  throw new Error(
    "T3_LYNXTRON_PROBE_ENTRY and T3_LYNXTRON_PROBE_OUTPUT must be provided together.",
  );
}

// Polyfill globals that TanStack Router and url-search-params-polyfill
// expect. The Lynx runtime does not provide window, self, document, etc.
// BannerPlugin injects this at the very start of every chunk before any
// module code runs.
const GLOBAL_POLYFILL = `
(function() {
  if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
  if (typeof globalThis.self === 'undefined') globalThis.self = globalThis;
  if (typeof globalThis.document === 'undefined') globalThis.document = {
    baseURI: '', createElement: function() { return {}; },
    querySelector: function() { return null; },
    querySelectorAll: function() { return []; },
    head: { appendChild: function() {} },
    createTextNode: function() { return {}; },
  };
  if (typeof globalThis.location === 'undefined') globalThis.location = {
    href: '', reload: function() {}, replace: function() {},
  };
  if (typeof globalThis.navigator === 'undefined') globalThis.navigator = {
    platform: 'MacIntel',
    userAgent: '',
  };
  if (typeof globalThis.sessionStorage === 'undefined') globalThis.sessionStorage = {
    getItem: function() { return null; }, setItem: function() {},
  };
  if (typeof globalThis.queueMicrotask === 'undefined') {
    globalThis.queueMicrotask = function(cb) { Promise.resolve().then(cb); };
  }
  if (typeof Object.hasOwn !== 'function') {
    Object.hasOwn = function(object, property) {
      return Object.prototype.hasOwnProperty.call(object, property);
    };
  }
  // Effect Encoding constructs these globals when @effect/atom-react loads.
  // Lynx's QuickJS VM does not provide the Web Encoding API, including in
  // development bundles where tree-shaking cannot remove that module.
  if (typeof globalThis.TextEncoder === 'undefined') {
    globalThis.TextEncoder = class TextEncoder {
      get encoding() { return 'utf-8'; }
      encode(input) {
        var text = String(input === undefined ? '' : input);
        var bytes = [];
        for (var index = 0; index < text.length; index += 1) {
          var codePoint = text.charCodeAt(index);
          if (codePoint >= 0xd800 && codePoint <= 0xdbff) {
            var next = text.charCodeAt(index + 1);
            if (next >= 0xdc00 && next <= 0xdfff) {
              codePoint = ((codePoint - 0xd800) << 10) + (next - 0xdc00) + 0x10000;
              index += 1;
            } else {
              codePoint = 0xfffd;
            }
          } else if (codePoint >= 0xdc00 && codePoint <= 0xdfff) {
            codePoint = 0xfffd;
          }

          if (codePoint <= 0x7f) {
            bytes.push(codePoint);
          } else if (codePoint <= 0x7ff) {
            bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
          } else if (codePoint <= 0xffff) {
            bytes.push(
              0xe0 | (codePoint >> 12),
              0x80 | ((codePoint >> 6) & 0x3f),
              0x80 | (codePoint & 0x3f),
            );
          } else {
            bytes.push(
              0xf0 | (codePoint >> 18),
              0x80 | ((codePoint >> 12) & 0x3f),
              0x80 | ((codePoint >> 6) & 0x3f),
              0x80 | (codePoint & 0x3f),
            );
          }
        }
        return new Uint8Array(bytes);
      }
      encodeInto(input, destination) {
        var encoded = this.encode(input);
        var written = Math.min(encoded.length, destination.length);
        destination.set(encoded.subarray(0, written));
        return { read: String(input === undefined ? '' : input).length, written: written };
      }
    };
  }
  if (typeof globalThis.TextDecoder === 'undefined') {
    globalThis.TextDecoder = class TextDecoder {
      constructor(label) {
        if (label && String(label).toLowerCase() !== 'utf-8' && String(label).toLowerCase() !== 'utf8') {
          throw new RangeError('Only UTF-8 is supported');
        }
      }
      get encoding() { return 'utf-8'; }
      decode(input) {
        var bytes = input === undefined ? new Uint8Array(0) : new Uint8Array(input.buffer || input, input.byteOffset || 0, input.byteLength);
        var output = '';
        for (var index = 0; index < bytes.length;) {
          var first = bytes[index++];
          var codePoint = first;
          var needed = 0;
          var minimum = 0;
          if (first >= 0xc2 && first <= 0xdf) {
            codePoint = first & 0x1f;
            needed = 1;
            minimum = 0x80;
          } else if (first >= 0xe0 && first <= 0xef) {
            codePoint = first & 0x0f;
            needed = 2;
            minimum = 0x800;
          } else if (first >= 0xf0 && first <= 0xf4) {
            codePoint = first & 0x07;
            needed = 3;
            minimum = 0x10000;
          } else if (first > 0x7f) {
            output += '\\ufffd';
            continue;
          }

          var valid = index + needed <= bytes.length;
          for (var offset = 0; valid && offset < needed; offset += 1) {
            var continuation = bytes[index + offset];
            if ((continuation & 0xc0) !== 0x80) {
              valid = false;
            } else {
              codePoint = (codePoint << 6) | (continuation & 0x3f);
            }
          }
          if (
            !valid ||
            codePoint < minimum ||
            codePoint > 0x10ffff ||
            (codePoint >= 0xd800 && codePoint <= 0xdfff)
          ) {
            output += '\\ufffd';
            continue;
          }
          index += needed;
          if (codePoint <= 0xffff) {
            output += String.fromCharCode(codePoint);
          } else {
            codePoint -= 0x10000;
            output += String.fromCharCode(0xd800 + (codePoint >> 10), 0xdc00 + (codePoint & 0x3ff));
          }
        }
        return output;
      }
    };
  }
  // TanStack Router core does instanceof Response checks.
  if (typeof globalThis.Response === 'undefined') {
    globalThis.Response = class Response {
      constructor(body, init) {
        this.body = body ?? null;
        this.status = (init && init.status) || 200;
        this.headers = (init && init.headers) || {};
      }
    };
  }
})();
`.trim();

// Standalone Lynx build config for the T3 Code Lynxtron port.
export default defineConfig({
  output: {
    filename: "[name].[platform].bundle",
    distPath: { root: probeOutput ?? (webPreview ? "./output/bundle/web" : "./output/bundle/lynx") },
  },
  resolve: {
    alias: {
      "~": path.resolve(import.meta.dirname, "../web/src"),
      "@formkit/auto-animate$": require.resolve("./src/app/auto-animate-shim.ts"),
      "lucide-react$": require.resolve("./src/app/lucide-react-shim.tsx"),
      react$: require.resolve("./src/app/react-tanstack-shim.ts"),
      "react-dom$": require.resolve("./src/app/react-dom-stub.ts"),
      ...(webPreview ? { "url-search-params-polyfill$": false } : {}),
    },
  },
  environments: webPreview
    ? {
        web: {
          source: { entry: { main: probeEntry ?? "./src/app/index.tsx" } },
        },
      }
    : {
        lynx: {
          source: { entry: { main: probeEntry ?? "./src/app/index.tsx" } },
        },
      },
  tools: {
    rspack: [
      {
        plugins: [
          ...(!webPreview
            ? [
                new rspack.BannerPlugin({
                  banner: GLOBAL_POLYFILL,
                  raw: true,
                  entryOnly: true,
                  include: /\.(js|ts|tsx|jsx|mjs)$/,
                }),
              ]
            : []),
          tanstackRouter({
            target: "react",
            routesDirectory: "./src/app/routes",
            generatedRouteTree: "./src/app/routeTree.gen.ts",
          }),
        ],
      },
      // Rsbuild merges object-form extension arrays after its defaults. Use a
      // final modifier so extensionless imports select the same `.lynx` files
      // as TypeScript's `moduleSuffixes` contract.
      (config) => {
        config.resolve ??= {};
        config.resolve.extensions = [
          ".lynx.tsx",
          ".lynx.ts",
          ".tsx",
          ".ts",
          ".mjs",
          ".js",
          ".jsx",
          ".json",
          ".cjs",
        ];
      },
    ],
  },
  plugins: [
    pluginReactLynx({
      enableCSSInheritance: true,
    }),
  ],
});
