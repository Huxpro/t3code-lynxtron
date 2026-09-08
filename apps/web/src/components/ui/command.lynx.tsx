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
import { Dialog, DialogPopup, DialogTrigger } from "./dialog";

type ElementProps = Record<string, unknown> & {
  readonly children?: ReactNode;
  readonly className?: string;
  readonly render?: ReactElement<Record<string, unknown>>;
};

export const CommandCreateHandle = () => ({});

interface CommandContextValue {
  readonly itemCount: number;
  readonly query: string;
  readonly setQuery: (query: string) => void;
}

const CommandContext = createContext<CommandContextValue | null>(null);
const CommandGroupItemsContext = createContext<readonly unknown[]>([]);

export const CommandDialog = Dialog;

export function CommandDialogTrigger({ children, render, ...props }: ElementProps) {
  return (
    <DialogTrigger {...props} render={render}>
      {children}
    </DialogTrigger>
  );
}

const Container = ({ children, ...props }: ElementProps) => <view {...props}>{children}</view>;

export function CommandDialogPopup({
  children,
  className,
  onBackdropPointerDown: _onBackdropPointerDown,
  ...props
}: ElementProps & { readonly onBackdropPointerDown?: () => void }) {
  return (
    <DialogPopup
      {...props}
      className={["ui-command-dialog-popup", className].filter(Boolean).join(" ")}
      data-command-dialog-popup="component-lab"
      showCloseButton={false}
    >
      {children}
    </DialogPopup>
  );
}
export function Command({
  children,
  className,
  value: controlledValue,
  defaultValue = "",
  items = [],
  onValueChange,
  ...props
}: ElementProps & {
  readonly defaultValue?: string;
  readonly items?: readonly unknown[];
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
  const context = useMemo(
    () => ({ itemCount: items.length, query, setQuery }),
    [items.length, query, setQuery],
  );
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
export function CommandEmpty({ children, className, ...props }: ElementProps) {
  const context = useContext(CommandContext);
  if ((context?.itemCount ?? 0) > 0) return null;
  return (
    <view
      {...props}
      className={["ui-command-empty", className].filter(Boolean).join(" ")}
      data-slot="command-empty"
    >
      {children}
    </view>
  );
}
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
