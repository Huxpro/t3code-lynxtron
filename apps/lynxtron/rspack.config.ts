import { defineConfig } from "@rspack/cli";
import { rspack } from "@rspack/core";
import * as path from "path";
import { fileURLToPath } from "url";
import { pluginLynxtron } from "@lynx-js/lynxtron-dev-plugins/rspack";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = process.env.NODE_ENV === "development";

// Host-process (main + preload) build. Targets Node/Electron-main because the
// Lynxtron host is an Electron-like runtime.
export default defineConfig({
  target: "electron-main",
  devServer: {
    devMiddleware: {
      writeToDisk: true,
    },
  },
  entry: {
    main: "./src/main/desktop/main.ts",
    preload: "./src/main/desktop/preload.ts",
  },
  output: {
    path: path.resolve(__dirname, "dist/desktop/"),
    filename: "[name].js",
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: [/node_modules/],
        loader: "builtin:swc-loader",
        options: { jsc: { parser: { syntax: "typescript" } } },
        type: "javascript/auto",
      },
    ],
  },
  plugins: [
    new rspack.CopyRspackPlugin({
      patterns: [
        {
          // The host bundle (main.js/preload.js) is emitted as CommonJS
          // (electron-main target), so the runtime package.json must NOT
          // declare "type": "module" (the root one does, for the ESM build
          // config files). Strip it during the copy.
          from: "./package.json",
          to: "package.json",
          transform(content: Buffer) {
            const pkg = JSON.parse(content.toString("utf-8"));
            delete pkg.type;
            delete pkg.dependencies;
            delete pkg.devDependencies;
            delete pkg.scripts;
            return JSON.stringify(pkg, null, 2);
          },
        },
        { from: "./output/bundle/lynx/", to: "." },
      ],
    }),
    pluginLynxtron({
      isDev,
      entry: path.resolve(__dirname, "./dist/desktop"),
      env: {
        T3_LYNXTRON_BUNDLE_PATH:
          process.env.T3_LYNXTRON_DEV_BUNDLE_URL ?? "http://127.0.0.1:3000/main.lynx.bundle",
      },
    }),
  ],
  resolve: { extensions: [".ts", ".js"] },
});
