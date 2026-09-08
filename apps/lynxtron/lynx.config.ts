import { defineConfig } from "@lynx-js/rspeedy";
import { pluginLynxConfig } from "@lynx-js/config-rsbuild-plugin";
import { pluginRspeedyDevReady } from "@lynx-js/lynxtron-dev-plugins/rspeedy";
import { pluginReactLynx } from "@lynx-js/react-rsbuild-plugin";
import { tanstackRouter } from "@tanstack/router-plugin/rspack";
import { rspack } from "@rspack/core";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const probeEntry = process.env.T3_LYNXTRON_PROBE_ENTRY?.trim();
const probeOutput = process.env.T3_LYNXTRON_PROBE_OUTPUT?.trim();
const probePageConfig = process.env.T3_LYNXTRON_PROBE_PAGE_CONFIG?.trim();
const webPreview = process.env.T3_LYNXTRON_WEB_PREVIEW === "1";

if ((probeEntry === undefined) !== (probeOutput === undefined)) {
  throw new Error(
    "T3_LYNXTRON_PROBE_ENTRY and T3_LYNXTRON_PROBE_OUTPUT must be provided together.",
  );
}

if (probePageConfig !== undefined && probeEntry === undefined) {
  throw new Error("T3_LYNXTRON_PROBE_PAGE_CONFIG requires an env-gated probe entry.");
}

const parsedProbePageConfig =
  probePageConfig === undefined
    ? undefined
    : (JSON.parse(probePageConfig) as Record<string, unknown>);
const pageConfig = {
  alignMouseEventWithW3C: true,
  enableCSSInvalidation: true,
  enableCSSSelector: true,
  enableRemoveCSSScope: true,
  ...parsedProbePageConfig,
};
const pageConfigKeys = Object.keys(pageConfig);

// Standalone Lynx build config for the T3 Code Lynxtron port.
export default defineConfig({
  output: {
    filename: "[name].[platform].bundle",
    distPath: {
      root: probeOutput ?? (webPreview ? "./output/bundle/web" : "./output/bundle/lynx"),
    },
    sourceMap: false,
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
          source: {
            entry: { main: probeEntry ?? "./src/app/index.tsx" },
            preEntry: "./src/app/polyfills.ts",
          },
        },
      },
  tools: {
    rspack: [
      {
        module: {
          rules: [
            {
              test: /\.woff2$/u,
              resourceQuery: /inline/u,
              type: "asset/inline",
            },
            {
              test: /\.svg$/u,
              resourceQuery: /external/u,
              type: "asset/resource",
              generator: {
                filename: "static/svg/[name].[contenthash:8][ext]",
              },
            },
            {
              test: /\.png$/u,
              resourceQuery: /external/u,
              type: "asset/resource",
              generator: {
                filename: "static/image/[name].[contenthash:8][ext]",
              },
            },
          ],
        },
        plugins: [
          new rspack.DefinePlugin({
            __T3_LYNXTRON_WEB_PREVIEW__: JSON.stringify(webPreview),
          }),
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
    pluginLynxConfig(pageConfig, {
      configKeys: pageConfigKeys,
      validate: (input) => input as never,
    }),
    pluginRspeedyDevReady(),
  ],
});
