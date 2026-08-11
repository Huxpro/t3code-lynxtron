import { defineConfig } from "@rspack/cli";
import { rspack } from "@rspack/core";
import path from "node:path";

const rootDir = import.meta.dirname;

export default defineConfig({
  target: "web",
  mode: "production",
  entry: {
    preview: "./src/browser-preview/index.ts",
  },
  output: {
    path: path.resolve(rootDir, "output/browser-preview"),
    filename: "assets/[name].[contenthash:8].js",
    chunkFilename: "assets/[name].[contenthash:8].js",
    clean: true,
  },
  module: {
    rules: [
      {
        resourceQuery: /inline/,
        type: "asset/source",
      },
      {
        test: /\.css$/,
        resourceQuery: { not: [/inline/] },
        type: "css/auto",
      },
      {
        test: /\.(?:woff2|ttf)$/,
        type: "asset/resource",
        generator: {
          filename: "assets/[name].[contenthash:8][ext]",
        },
      },
      {
        test: /\.ts$/,
        exclude: [/node_modules/],
        loader: "builtin:swc-loader",
        options: { jsc: { parser: { syntax: "typescript" } } },
        type: "javascript/auto",
      },
    ],
  },
  experiments: {
    css: true,
  },
  plugins: [
    new rspack.HtmlRspackPlugin({
      template: "./src/browser-preview/index.html",
      title: "T3 Lynx Web compatibility probe",
    }),
    new rspack.CopyRspackPlugin({
      patterns: [
        {
          from: "./output/bundle/web/main.web.bundle",
          to: "lynx/main.web.bundle",
        },
        {
          from: "./output/bundle/web/static",
          to: "static",
        },
      ],
    }),
  ],
  resolve: {
    extensions: [".ts", ".js"],
  },
});
