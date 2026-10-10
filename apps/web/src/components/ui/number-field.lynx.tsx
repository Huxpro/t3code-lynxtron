import { createContext, useCallback, useContext, useMemo, type ReactNode } from "@lynx-js/react";

import { hostAttribute } from "./hostElements";

interface NumberFieldContextValue {
  readonly setValue: (value: number) => void;
  readonly stepBy: (direction: -1 | 1) => void;
  readonly value: number;
}

interface NumberFieldProps extends Record<string, unknown> {
  readonly children?: ReactNode;
  readonly className?: string;
  readonly max?: number;
  readonly min?: number;
  readonly onValueChange?: (value: number) => void;
  readonly size?: "sm" | "default" | "lg";
  readonly step?: number;
  readonly value?: number | null;
  readonly "aria-label"?: string;
}

interface NumberFieldChildProps extends Record<string, unknown> {
  readonly children?: ReactNode | undefined;
  readonly className?: string | undefined;
  readonly "aria-label"?: string | undefined;
}

const NumberFieldContext = createContext<NumberFieldContextValue | null>(null);

function useNumberFieldContext(): NumberFieldContextValue {
  const context = useContext(NumberFieldContext);
  if (!context) throw new Error("NumberField children must be used within NumberField.");
  return context;
}

export function NumberField({
  children,
  className,
  max = Number.POSITIVE_INFINITY,
  min = Number.NEGATIVE_INFINITY,
  onValueChange,
  step = 1,
  value = 0,
  ...props
}: NumberFieldProps) {
  const numericValue = typeof value === "number" && Number.isFinite(value) ? value : 0;
  const setValue = useCallback(
    (nextValue: number) => {
      if (!Number.isFinite(nextValue)) return;
      onValueChange?.(Math.min(max, Math.max(min, nextValue)));
    },
    [max, min, onValueChange],
  );
  const context = useMemo<NumberFieldContextValue>(
    () => ({
      setValue,
      stepBy: (direction) => setValue(numericValue + direction * step),
      value: numericValue,
    }),
    [numericValue, setValue, step],
  );

  return (
    <NumberFieldContext.Provider value={context}>
      <view {...props} {...(className === undefined ? {} : { className })}>
        {children}
      </view>
    </NumberFieldContext.Provider>
  );
}

export function NumberFieldGroup({ children, className, ...props }: NumberFieldChildProps) {
  return (
    <view {...props} {...(className === undefined ? {} : { className })}>
      {children}
    </view>
  );
}

export function NumberFieldDecrement({
  className,
  "aria-label": accessibilityLabel,
  ...props
}: NumberFieldChildProps) {
  const { stepBy } = useNumberFieldContext();
  return (
    <view
      {...props}
      {...(className === undefined ? {} : { className })}
      {...hostAttribute("accessibility-label", accessibilityLabel)}
      bindtap={() => stepBy(-1)}
    >
      <text>−</text>
    </view>
  );
}

export function NumberFieldIncrement({
  className,
  "aria-label": accessibilityLabel,
  ...props
}: NumberFieldChildProps) {
  const { stepBy } = useNumberFieldContext();
  return (
    <view
      {...props}
      {...(className === undefined ? {} : { className })}
      {...hostAttribute("accessibility-label", accessibilityLabel)}
      bindtap={() => stepBy(1)}
    >
      <text>+</text>
    </view>
  );
}

export function NumberFieldInput({
  className,
  "aria-label": accessibilityLabel,
  ...props
}: NumberFieldChildProps) {
  const { setValue, value } = useNumberFieldContext();
  return (
    <input
      {...(className === undefined ? {} : { className })}
      {...(accessibilityLabel === undefined ? {} : { "accessibility-label": accessibilityLabel })}
      {...props}
      {...({ value: String(value) } as object)}
      bindinput={(event: { detail?: { value?: string } }) => {
        const nextValue = Number(event.detail?.value);
        if (Number.isFinite(nextValue)) setValue(nextValue);
      }}
    />
  );
}

export function NumberFieldScrubArea({
  children,
  className,
}: NumberFieldChildProps & { readonly label?: string }) {
  return <view className={className ?? ""}>{children}</view>;
}

export function CursorGrowIcon({ className }: { readonly className?: string }) {
  return <text className={className ?? ""}>↔</text>;
}

export const NumberFieldPrimitive = {
  Decrement: NumberFieldDecrement,
  Group: NumberFieldGroup,
  Increment: NumberFieldIncrement,
  Input: NumberFieldInput,
  Root: NumberField,
  ScrubArea: NumberFieldScrubArea,
};
