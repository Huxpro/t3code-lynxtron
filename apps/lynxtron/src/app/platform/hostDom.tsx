// Lynx implementations of the DOM tags upstream Web components write.
// `scripts/lynx-dom-jsx-loader.cjs` rewrites `<div>` in an upstream file to
// `div` from this module, so every value this module exports is a supported DOM
// tag and nothing else may be exported from here. Lynx-owned code uses the Lynx
// host elements directly.
import { Children, isValidElement, type ReactNode } from "@lynx-js/react";

import { HostButton, HostText, HostView } from "~/components/ui/hostElements";

// A handler upstream wrote for a DOM event. It is called with a Lynx event, so
// the parameter is `never`: a handler that reads its event does not typecheck
// when written inline, and one typed elsewhere is accepted as upstream typed it.
type DomHandler = (event: never) => void;
type LynxHandler = (event: unknown) => void;

// Props reach these components from DOM-typed upstream code, where an optional
// prop may be present and undefined.
export type HostDomProps = Record<string, unknown> & {
  readonly children?: ReactNode | undefined;
  readonly className?: string | undefined;
  /** What the loader turns a written `onClick` into. */
  readonly bindtap?: DomHandler | undefined;
  /** An `onClick` that arrives through a props spread. */
  readonly onClick?: DomHandler | undefined;
};

function tapHandler(props: Pick<HostDomProps, "bindtap" | "onClick">): LynxHandler | undefined {
  return (props.bindtap ?? props.onClick) as LynxHandler | undefined;
}

// Handlers HostView implements. Any other `on*` prop that arrives through a
// spread is dropped: a function is not a Lynx attribute.
const HOST_VIEW_HANDLERS = new Set([
  "onAuxClick",
  "onContextMenu",
  "onDoubleClick",
  "onKeyDown",
  "onMouseEnter",
  "onMouseLeave",
]);

function splitHandlers(props: Record<string, unknown>) {
  const attributes: Record<string, unknown> = {};
  let needsHostView = false;
  for (const name in props) {
    if (!/^on[A-Z]/u.test(name)) {
      attributes[name] = props[name];
    } else if (HOST_VIEW_HANDLERS.has(name) && props[name] !== undefined) {
      attributes[name] = props[name];
      needsHostView = true;
    }
  }
  return { attributes, needsHostView };
}

// Lynx draws text only inside <text>.
function wrapText(children: ReactNode): ReactNode {
  return Children.map(children, (child) =>
    typeof child === "string" || typeof child === "number" ? <HostText>{child}</HostText> : child,
  );
}

function Box({ children, bindtap, onClick, ...rest }: HostDomProps) {
  const tap = tapHandler({ bindtap, onClick });
  const { attributes, needsHostView } = splitHandlers(rest);
  if (needsHostView) {
    return (
      <HostView {...attributes} onClick={tap}>
        {wrapText(children)}
      </HostView>
    );
  }
  return (
    <view {...attributes} bindtap={tap}>
      {wrapText(children)}
    </view>
  );
}

function Button({ children, bindtap, onClick, disabled, type: _type, ...rest }: HostDomProps) {
  const isDisabled = disabled === true;
  const { attributes } = splitHandlers(rest);
  return (
    <HostButton
      {...attributes}
      {...(isDisabled ? { disabled: true } : {})}
      onClick={isDisabled ? undefined : tapHandler({ bindtap, onClick })}
    >
      {wrapText(children)}
    </HostButton>
  );
}

// `flex`, `inline-grid`, `md:flex`: the element lays out children as a box.
const BOX_DISPLAY_CLASS = /(?:^|\s)(?:[^\s:]+:)*(?:inline-)?(?:flex|grid)(?:\s|$)/u;

function isInlineContent(children: ReactNode): boolean {
  let inline = true;
  Children.forEach(children, (child) => {
    if (child === null || child === undefined || typeof child === "boolean") return;
    if (typeof child === "string" || typeof child === "number") return;
    if (isValidElement(child) && child.type === Inline) return;
    inline = false;
  });
  return inline;
}

// A span, p, heading or label is text when it only holds text, and a box when
// it is empty (a dot, a spacer), is a flex or grid container, or holds elements.
function Inline({ children, bindtap, onClick, ...rest }: HostDomProps) {
  const className = typeof rest.className === "string" ? rest.className : "";
  if (
    Children.count(children) === 0 ||
    BOX_DISPLAY_CLASS.test(className) ||
    !isInlineContent(children)
  ) {
    return (
      <Box {...rest} bindtap={bindtap} onClick={onClick}>
        {children}
      </Box>
    );
  }
  const tap = tapHandler({ bindtap, onClick });
  const { attributes } = splitHandlers(rest);
  return (
    <HostText {...attributes} className={className} onClick={tap ? () => tap({}) : undefined}>
      {children}
    </HostText>
  );
}

function Img({ alt, src, bindtap, onClick, ...rest }: HostDomProps) {
  const { attributes } = splitHandlers(rest);
  const tap = tapHandler({ bindtap, onClick });
  return (
    <image
      {...attributes}
      {...(typeof alt === "string" ? { "accessibility-label": alt } : {})}
      src={typeof src === "string" ? src : ""}
      {...(tap ? { bindtap: tap } : {})}
    />
  );
}

export const div = Box,
  section = Box,
  article = Box,
  header = Box,
  footer = Box,
  main = Box,
  nav = Box,
  aside = Box,
  ul = Box,
  ol = Box,
  li = Box;
export const button = Button;
export const span = Inline,
  p = Inline,
  h1 = Inline,
  h2 = Inline,
  h3 = Inline,
  h4 = Inline,
  h5 = Inline,
  h6 = Inline,
  label = Inline,
  strong = Inline,
  em = Inline,
  b = Inline,
  i = Inline,
  small = Inline,
  code = Inline,
  kbd = Inline;
export const img = Img;
