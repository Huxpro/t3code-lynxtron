import {
  cloneElement,
  isValidElement,
  type ElementType,
  type ReactElement,
  type ReactNode,
} from "@lynx-js/react";

type AnyProps = Record<string, unknown>;

function joinClassNames(left: unknown, right: unknown): unknown {
  if (typeof left !== "string") return right;
  if (typeof right !== "string") return left;
  return `${left} ${right}`;
}

export function mergeProps<TagName extends ElementType = ElementType>(
  ...sources: ReadonlyArray<AnyProps | undefined>
): AnyProps {
  const merged: AnyProps = {};

  for (const source of sources) {
    if (!source) continue;
    for (const [key, value] of Object.entries(source)) {
      if (key === "className") {
        merged[key] = joinClassNames(merged[key], value);
      } else if (key === "style" && typeof merged[key] === "object" && typeof value === "object") {
        merged[key] = { ...(merged[key] as AnyProps), ...(value as AnyProps) };
      } else {
        merged[key] = value;
      }
    }
  }

  return merged;
}

type RenderValue = ReactElement<AnyProps> | ((props: AnyProps, state: unknown) => ReactNode);

export function useRender({
  defaultTagName: _defaultTagName,
  props,
  render,
  state,
}: {
  readonly defaultTagName: ElementType;
  readonly props: AnyProps;
  readonly render?: RenderValue;
  readonly state?: unknown;
}): ReactNode {
  if (typeof render === "function") {
    return render(props, state);
  }
  if (isValidElement(render)) {
    return cloneElement(render, mergeProps(render.props, props));
  }
  const { children, ...elementProps } = props;
  return <view {...elementProps}>{children as ReactNode}</view>;
}

export namespace useRender {
  export type ComponentProps<TagName extends ElementType> = AnyProps & {
    readonly children?: ReactNode;
    readonly className?: string;
    readonly render?: ReactElement<AnyProps> | ((props: AnyProps, state: unknown) => ReactNode);
  };
}
