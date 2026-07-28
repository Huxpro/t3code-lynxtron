import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "@lynx-js/react";

interface SelectContextValue {
  readonly disabled: boolean;
  readonly open: boolean;
  readonly select: (value: string) => void;
  readonly setOpen: (open: boolean) => void;
  readonly value: string | undefined;
}

const SelectContext = createContext<SelectContextValue | null>(null);

function useSelectContext(): SelectContextValue {
  const context = useContext(SelectContext);
  if (!context) throw new Error("Select components must be nested under Select.");
  return context;
}

export interface SelectProps {
  readonly children?: ReactNode;
  readonly disabled?: boolean;
  readonly onValueChange?: (value: string) => void;
  readonly value?: string;
}

export function Select({ children, disabled = false, onValueChange, value }: SelectProps) {
  const [open, setOpen] = useState(false);
  const select = useCallback(
    (next: string) => {
      if (disabled) return;
      onValueChange?.(next);
      setOpen(false);
    },
    [disabled, onValueChange],
  );
  const context = useMemo(
    () => ({ disabled, open, select, setOpen, value }),
    [disabled, open, select, value],
  );

  return (
    <SelectContext.Provider value={context}>
      <view className="ui-select-root">{children}</view>
    </SelectContext.Provider>
  );
}

export interface SelectTriggerProps {
  readonly "aria-label"?: string;
  readonly children?: ReactNode;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly size?: "default" | "lg" | "sm" | "xs";
  readonly variant?: "default" | "ghost";
}

export function SelectTrigger({
  children,
  className,
  disabled = false,
  size = "default",
  variant = "default",
}: SelectTriggerProps) {
  const context = useSelectContext();
  const handleTap = useCallback(() => {
    if (!disabled && !context.disabled) context.setOpen(!context.open);
  }, [context, disabled]);

  return (
    <view
      className={[
        "ui-select-trigger",
        `ui-select-trigger--${size}`,
        `ui-select-trigger--${variant}`,
        context.open ? "ui-select-trigger--open" : undefined,
        disabled || context.disabled ? "ui-select-trigger--disabled" : undefined,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      bindtap={handleTap}
    >
      {children}
      <text className="ui-select-trigger__chevron">⌄</text>
    </view>
  );
}

export function SelectValue({
  children,
  className,
}: {
  readonly children?: ReactNode;
  readonly className?: string;
}) {
  return (
    <text className={["ui-select-value", className].filter(Boolean).join(" ")} text-maxline="1">
      {children}
    </text>
  );
}

export interface SelectPopupProps {
  readonly align?: "start" | "center" | "end";
  readonly alignItemWithTrigger?: boolean;
  readonly children?: ReactNode;
  readonly className?: string;
  readonly matchTriggerWidth?: boolean;
  readonly popupClassName?: string;
  readonly side?: "top" | "bottom" | "left" | "right";
  readonly sideOffset?: number;
}

export function SelectPopup({ children, className, popupClassName }: SelectPopupProps) {
  const { open } = useSelectContext();
  if (!open) return null;

  return (
    <view className={["ui-select-popup", popupClassName].filter(Boolean).join(" ")}>
      <view className={["ui-select-list", className].filter(Boolean).join(" ")}>{children}</view>
    </view>
  );
}

export interface SelectItemProps {
  readonly children?: ReactNode;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly hideIndicator?: boolean;
  readonly value: string;
}

export function SelectItem({ children, className, disabled = false, value }: SelectItemProps) {
  const context = useSelectContext();
  const selected = context.value === value;
  const handleTap = useCallback(() => {
    if (!disabled) context.select(value);
  }, [context, disabled, value]);

  return (
    <view
      className={[
        "ui-select-item",
        selected ? "ui-select-item--selected" : undefined,
        disabled ? "ui-select-item--disabled" : undefined,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      bindtap={handleTap}
    >
      <text className="ui-select-item__label">{children}</text>
    </view>
  );
}

export function SelectSeparator({ className }: { readonly className?: string }) {
  return <view className={["ui-select-separator", className].filter(Boolean).join(" ")} />;
}

export function SelectGroup({ children }: { readonly children?: ReactNode }) {
  return <view className="ui-select-group">{children}</view>;
}

export function SelectGroupLabel({
  children,
  className,
}: {
  readonly children?: ReactNode;
  readonly className?: string;
}) {
  return (
    <text className={["ui-select-group-label", className].filter(Boolean).join(" ")}>
      {children}
    </text>
  );
}

export const SelectContent = SelectPopup;

export function SelectButton(props: SelectTriggerProps) {
  return <SelectTrigger {...props} />;
}

export function selectTriggerVariants({
  className,
  size = "default",
  variant = "default",
}: Pick<SelectTriggerProps, "className" | "size" | "variant"> = {}): string {
  return [
    "ui-select-trigger",
    `ui-select-trigger--${size}`,
    `ui-select-trigger--${variant}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");
}
