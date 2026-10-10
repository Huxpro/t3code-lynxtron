import { type ReactNode, useCallback } from "@lynx-js/react";

import { useNativeInputValue } from "../../../../lynxtron/src/app/hooks/useNativeInputValue";

type InputEvent = {
  readonly detail: {
    readonly value: string;
  };
};

export interface InputProps {
  readonly "aria-label"?: string | undefined;
  readonly children?: ReactNode | undefined;
  readonly className?: string | undefined;
  readonly disabled?: boolean | undefined;
  readonly id?: string | undefined;
  readonly nativeInput?: boolean | undefined;
  readonly onBlur?: (() => void) | undefined;
  readonly onChange?: ((event: { currentTarget: { value: string } }) => void) | undefined;
  readonly onValueChange?: ((value: string) => void) | undefined;
  readonly placeholder?: string | undefined;
  readonly size?: "sm" | "default" | "lg" | number | undefined;
  readonly spellCheck?: boolean | undefined;
  readonly type?: string | undefined;
  readonly unstyled?: boolean | undefined;
  readonly value?: string | undefined;
}

export function Input({
  "aria-label": ariaLabel,
  className,
  disabled = false,
  id,
  onBlur,
  onChange,
  onValueChange,
  placeholder,
  size = "default",
  unstyled = false,
  value = "",
}: InputProps) {
  const { ref, noteInput } = useNativeInputValue(value);
  const handleInput = useCallback(
    (event: InputEvent) => {
      noteInput(event.detail.value);
      if (disabled) return;
      onValueChange?.(event.detail.value);
      onChange?.({ currentTarget: { value: event.detail.value } });
    },
    [disabled, noteInput, onChange, onValueChange],
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
      ref={ref}
      {...(ariaLabel === undefined ? {} : { "aria-label": ariaLabel })}
      {...(disabled ? { "aria-disabled": "true" } : {})}
      className={resolvedClassName}
      {...(id === undefined ? {} : { id })}
      {...(placeholder === undefined ? {} : { placeholder })}
      {...(onBlur === undefined ? {} : { bindblur: onBlur })}
      bindinput={handleInput}
    />
  );
}
