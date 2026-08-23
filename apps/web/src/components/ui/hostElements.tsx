import type * as React from "react";

export function HostView({
  children,
  eventThrough: _eventThrough,
  stopTapPropagation,
  onClick,
  ...props
}: React.ComponentProps<"div"> & {
  readonly eventThrough?: boolean;
  readonly stopTapPropagation?: boolean;
}) {
  return (
    <div
      {...props}
      onClick={
        stopTapPropagation
          ? (event) => {
              event.stopPropagation();
              onClick?.(event);
            }
          : onClick
      }
    >
      {children}
    </div>
  );
}

export function HostLayoutView({ children, ...props }: React.ComponentProps<"div">) {
  return <div {...props}>{children}</div>;
}

export function HostListItem({ children, ...props }: React.ComponentProps<"li">) {
  return <li {...props}>{children}</li>;
}

export function HostList({ children, ...props }: React.ComponentProps<"ul">) {
  return <ul {...props}>{children}</ul>;
}

export function HostScrollView({ children, ...props }: React.ComponentProps<"div">) {
  return <div {...props}>{children}</div>;
}

export function HostHeading({ children, ...props }: React.ComponentProps<"h2">) {
  return <h2 {...props}>{children}</h2>;
}

export function HostHeadline({ children, ...props }: React.ComponentProps<"h1">) {
  return <h1 {...props}>{children}</h1>;
}

export function HostButton({ children, ...props }: React.ComponentProps<"button">) {
  return <button {...props}>{children}</button>;
}

export function HostText({
  children,
  eventThrough: _eventThrough,
  ...props
}: React.ComponentProps<"span"> & { readonly eventThrough?: boolean }) {
  return <span {...props}>{children}</span>;
}
