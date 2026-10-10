// Lynx implementation of `@base-ui/react/use-render`: upstream's ui components
// name their default DOM tag as a string here, where the DOM tag loader cannot
// see it, so the tag is resolved to its host component at render time. The
// build and typecheck resolve the package specifier to this module.
import { cloneElement, createElement, isValidElement, type ReactElement } from "@lynx-js/react";

import * as hostDom from "../hostDom";
import { mergeProps } from "./merge-props";

type HostDomTag = keyof typeof hostDom;
type TagProps<Tag extends HostDomTag> = Parameters<(typeof hostDom)[Tag]>[0];
type RenderProp<Tag extends HostDomTag> =
  | ReactElement<Record<string, unknown>>
  | ((props: TagProps<Tag>) => ReactElement);

export function useRender<Tag extends HostDomTag>({
  defaultTagName,
  props = {},
  render,
}: useRender.Parameters<Tag>): ReactElement {
  if (typeof render === "function") return render(props);
  if (isValidElement(render)) return cloneElement(render, mergeProps(props, render.props));
  return createElement(hostDom[defaultTagName], props);
}

export namespace useRender {
  export type ComponentProps<Tag extends HostDomTag> = TagProps<Tag> & {
    readonly render?: RenderProp<Tag>;
  };
  export interface Parameters<Tag extends HostDomTag> {
    readonly defaultTagName: Tag;
    readonly props?: TagProps<Tag>;
    readonly render?: RenderProp<Tag> | undefined;
  }
}
