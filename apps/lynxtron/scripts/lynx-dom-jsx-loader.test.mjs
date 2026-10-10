import { createRequire } from "node:module";
import * as NodePath from "node:path";

import { describe, expect, it } from "vite-plus/test";

const require = createRequire(import.meta.url);
const loader = require("./lynx-dom-jsx-loader.cjs");
const { assertNoDomJsx, isUpstreamComponent, readHostTags, transformDomJsx } = loader;

const webSource = NodePath.resolve(import.meta.dirname, "../../web/src");
const upstreamFile = NodePath.join(webSource, "components/Example.tsx");
const tags = new Set(["div", "span", "button", "img"]);
const transform = (source) => transformDomJsx(source, upstreamFile, tags, "/host/hostDom.tsx");
const HOST_IMPORT = 'import * as __LynxHostDom from "/host/hostDom.tsx";';

describe("lynx-dom-jsx-loader transform", () => {
  it("rewrites opening, closing and self-closing DOM tags to host components", () => {
    expect(
      transform(
        'export const A = () => (\n  <div className="a">\n    <img src="x" />\n  </div>\n);',
      ),
    ).toBe(
      `${HOST_IMPORT}export const A = () => (\n  <__LynxHostDom.div className="a">\n    <__LynxHostDom.img src="x" />\n  </__LynxHostDom.div>\n);`,
    );
  });

  it("leaves components, member tags, fragments and type arguments alone", () => {
    const source =
      "export const A = () => (<><Button><Menu.Item /></Button>{list as Array<span>}</>);";
    expect(transform(source)).toBe(source);
  });

  it("keeps every line where upstream wrote it", () => {
    const source = "import { x } from 'y';\n\nexport const A = () => <span>{x}</span>;\n";
    expect(transform(source).split("\n")[2]).toBe(
      "export const A = () => <__LynxHostDom.span>{x}</__LynxHostDom.span>;",
    );
  });

  it("maps onClick on a DOM tag to bindtap and leaves a component's onClick alone", () => {
    expect(transform("<div><button onClick={go}>Go</button><Button onClick={go} /></div>")).toBe(
      `${HOST_IMPORT}<__LynxHostDom.div><__LynxHostDom.button bindtap={go}>Go</__LynxHostDom.button><Button onClick={go} /></__LynxHostDom.div>`,
    );
  });

  it("passes spreads, aria, data and style props through", () => {
    expect(transform('<span {...props} aria-hidden="true" data-slot="x" style={style} />')).toBe(
      `${HOST_IMPORT}<__LynxHostDom.span {...props} aria-hidden="true" data-slot="x" style={style} />`,
    );
  });

  it("fails on a DOM tag with no host mapping, naming the file, tag and line", () => {
    expect(() => transform("const a = (\n  <div>\n    <input value={v} />\n  </div>\n);")).toThrow(
      /apps\/web\/src\/components\/Example\.tsx cannot be compiled for Lynx:\n {2}- <input> has no Lynx host mapping \(line 3\)/u,
    );
  });

  it("reports an unmapped tag once, not for its closing tag too", () => {
    let message = "";
    try {
      transform("<svg><path /></svg>");
    } catch (error) {
      message = String(error);
    }
    expect(message.match(/<svg> has no Lynx host mapping/gu)).toHaveLength(1);
    expect(message).toContain("<path> has no Lynx host mapping");
  });

  it("fails on an event prop it cannot map", () => {
    expect(() => transform("<div onPointerDown={start} />")).toThrow(
      /onPointerDown on <div> has no Lynx event mapping \(line 1\)/u,
    );
  });

  it("fails on DOM node access", () => {
    expect(() => transform("<div ref={ref} />")).toThrow(/ref on <div>/u);
    expect(() => transform("<span dangerouslySetInnerHTML={html} />")).toThrow(
      /dangerouslySetInnerHTML on <span>/u,
    );
  });

  it("lists every problem in the file in one error", () => {
    expect(() => transform("<div onKeyDown={a}><textarea /></div>")).toThrow(
      /onKeyDown on <div>[^]*<textarea> has no Lynx host mapping/u,
    );
  });
});

describe("lynx-dom-jsx-loader scope", () => {
  it("applies to upstream .tsx only", () => {
    expect(isUpstreamComponent(upstreamFile)).toBe(true);
    expect(isUpstreamComponent(NodePath.join(webSource, "components/Example.lynx.tsx"))).toBe(
      false,
    );
    expect(isUpstreamComponent(NodePath.join(webSource, "lib/utils.ts"))).toBe(false);
    expect(isUpstreamComponent(NodePath.resolve(import.meta.dirname, "../src/app/index.tsx"))).toBe(
      false,
    );
  });

  it("returns non-upstream and non-tsx sources untouched", () => {
    const run = (resourcePath, source) =>
      loader.call({ resourcePath, addDependency: () => undefined }, source);
    const lynxOwned = "export const A = () => <view><text>a</text></view>;";
    expect(run(NodePath.join(webSource, "components/Example.lynx.tsx"), lynxOwned)).toBe(lynxOwned);
    expect(run(NodePath.join(webSource, "lib/example.ts"), "const a = <T,>(x: T) => x;")).toBe(
      "const a = <T,>(x: T) => x;",
    );
  });

  it("rejects a DOM tag in a Lynx-owned file, where nothing rewrites it", () => {
    const lynxFile = NodePath.join(webSource, "components/Example.lynx.tsx");
    expect(() => assertNoDomJsx("<view><div /></view>", lynxFile, tags)).toThrow(
      /Example\.lynx\.tsx is Lynx-owned and writes DOM tags \(<div>\)/u,
    );
    expect(() => assertNoDomJsx("<view><input /></view>", lynxFile, tags)).not.toThrow();
  });

  it("reads the tag map from the host module's exports", () => {
    expect([
      ...readHostTags(
        "type Props = {};\nfunction Box() {}\nexport type T = Props;\nexport const div = Box,\n  nav = Box;\nexport function span() {}\n",
      ),
    ]).toEqual(["div", "nav", "span"]);
  });
});
