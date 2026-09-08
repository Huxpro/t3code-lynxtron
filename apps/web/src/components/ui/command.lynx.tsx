import {
  cloneElement,
  createContext,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "@lynx-js/react";
import { Input } from "./input";

type ElementProps = Record<string, unknown> & {
  readonly children?: ReactNode;
  readonly className?: string;
  readonly render?: ReactElement<Record<string, unknown>>;
};

export const CommandCreateHandle = () => ({});

interface CommandContextValue {
  readonly query: string;
  readonly setQuery: (query: string) => void;
}

const CommandContext = createContext<CommandContextValue | null>(null);
const CommandGroupItemsContext = createContext<readonly unknown[]>([]);

export function CommandDialog({
  children,
  open = false,
}: ElementProps & { readonly open?: boolean }) {
  return open ? <>{children}</> : null;
}

export function CommandDialogTrigger({ children, render, ...props }: ElementProps) {
  if (isValidElement(render)) {
    return cloneElement(render, { ...props, children });
  }
  return <view {...props}>{children}</view>;
}

const Container = ({ children, ...props }: ElementProps) => <view {...props}>{children}</view>;

export const CommandDialogPopup = Container;
export function Command({
  children,
  className,
  value: controlledValue,
  defaultValue = "",
  onValueChange,
  ...props
}: ElementProps & {
  readonly defaultValue?: string;
  readonly onValueChange?: (value: string) => void;
  readonly value?: string;
}) {
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const query = typeof controlledValue === "string" ? controlledValue : uncontrolledValue;
  const setQuery = useCallback(
    (next: string) => {
      if (controlledValue === undefined) setUncontrolledValue(next);
      onValueChange?.(next);
    },
    [controlledValue, onValueChange],
  );
  const context = useMemo(() => ({ query, setQuery }), [query, setQuery]);
  return (
    <CommandContext.Provider value={context}>
      <view {...props} className={["ui-command", className].filter(Boolean).join(" ")}>
        {children}
      </view>
    </CommandContext.Provider>
  );
}
export function CommandCollection({
  children,
}: {
  readonly children: (item: unknown, index: number) => ReactNode;
}) {
  const items = useContext(CommandGroupItemsContext);
  return <>{items.map((item, index) => children(item, index))}</>;
}
export const CommandEmpty = Container;
export function CommandFooter({ children, className, ...props }: ElementProps) {
  return (
    <view
      {...props}
      className={["ui-command-footer", className].filter(Boolean).join(" ")}
      data-slot="command-footer"
    >
      {children}
    </view>
  );
}
export function CommandGroup({
  children,
  className,
  items = [],
  ...props
}: ElementProps & { readonly items?: readonly unknown[] }) {
  return (
    <CommandGroupItemsContext.Provider value={items}>
      <scroll-view
        {...props}
        className={["ui-command-group", className].filter(Boolean).join(" ")}
        data-slot="command-group"
        enable-scroll={false}
        scroll-y
      >
        {children}
      </scroll-view>
    </CommandGroupItemsContext.Provider>
  );
}
export function CommandGroupLabel({ children, className, ...props }: ElementProps) {
  return (
    <view
      {...props}
      className={["ui-command-group-label", className].filter(Boolean).join(" ")}
      data-slot="command-group-label"
    >
      <text>{children}</text>
    </view>
  );
}
export function CommandInput({ className, placeholder, ...props }: ElementProps) {
  const context = useContext(CommandContext);
  return (
    <view className="ui-command-input-shell">
      <Input
        {...props}
        className={["ui-command-input", className].filter(Boolean).join(" ")}
        nativeInput
        onValueChange={context?.setQuery}
        placeholder={typeof placeholder === "string" ? placeholder : undefined}
        size="lg"
        unstyled
        value={context?.query ?? ""}
      />
    </view>
  );
}
export function CommandItem({ children, className, ...props }: ElementProps) {
  return (
    <view
      {...props}
      className={["ui-command-item", className].filter(Boolean).join(" ")}
      data-slot="command-item"
    >
      {children}
    </view>
  );
}
export function CommandList({ children, className, ...props }: ElementProps) {
  return (
    <scroll-view
      {...props}
      className={["ui-command-list", className].filter(Boolean).join(" ")}
      data-slot="command-list"
      scroll-y
    >
      {children}
    </scroll-view>
  );
}
export function CommandPanel({ children, className, ...props }: ElementProps) {
  return (
    <view
      {...props}
      className={["ui-command-panel", className].filter(Boolean).join(" ")}
      data-slot="command-panel"
    >
      {children}
    </view>
  );
}
export function CommandSeparator({ className, ...props }: ElementProps) {
  return (
    <view
      {...props}
      className={["ui-command-separator", className].filter(Boolean).join(" ")}
      data-slot="command-separator"
    />
  );
}
export function CommandShortcut({ children, className, ...props }: ElementProps) {
  return (
    <text
      {...props}
      className={["ui-command-shortcut", className].filter(Boolean).join(" ")}
      data-slot="command-shortcut"
    >
      {children}
    </text>
  );
}
