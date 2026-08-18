import { type ReactNode, useCallback } from "@lynx-js/react";

type InputEvent = {
  readonly detail: {
    readonly value: string;
  };
};

export interface InputProps {
  readonly "aria-label"?: string;
  readonly children?: ReactNode;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly nativeInput?: boolean;
  readonly onBlur?: () => void;
  readonly onChange?: (event: { currentTarget: { value: string } }) => void;
  readonly onValueChange?: (value: string) => void;
  readonly placeholder?: string;
  readonly size?: "sm" | "default" | "lg" | number;
  readonly spellCheck?: boolean;
  readonly type?: string;
  readonly unstyled?: boolean;
  readonly value?: string;
}

export function Input({
  "aria-label": ariaLabel,
  className,
  disabled = false,
  onBlur,
  onChange,
  onValueChange,
  placeholder,
  size = "default",
  unstyled = false,
  value = "",
}: InputProps) {
  const handleInput = useCallback(
    (event: InputEvent) => {
      if (disabled) return;
      onValueChange?.(event.detail.value);
      onChange?.({ currentTarget: { value: event.detail.value } });
    },
    [disabled, onChange, onValueChange],
  );
  const resolvedClassName = [
    unstyled ? "ui-input ui-input--unstyled" : "ui-input",
    `ui-input--${String(size)}`,
    disabled ? "ui-input--disabled" : undefined,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <input
      aria-label={ariaLabel}
      aria-disabled={disabled ? "true" : undefined}
      className={resolvedClassName}
      {...({ value } as object)}
      placeholder={placeholder}
      bindblur={onBlur}
      bindinput={handleInput}
    />
  );
}
