import { useCallback } from "@lynx-js/react";

type TextareaEvent = {
  readonly detail: {
    readonly value: string;
  };
};

export interface TextareaProps {
  readonly "aria-label"?: string | undefined;
  readonly className?: string | undefined;
  readonly disabled?: boolean | undefined;
  readonly onBlur?: (() => void) | undefined;
  readonly onChange?: ((event: { currentTarget: { value: string } }) => void) | undefined;
  readonly placeholder?: string | undefined;
  readonly size?: "sm" | "default" | "lg" | number | undefined;
  readonly unstyled?: boolean | undefined;
  readonly value?: string | undefined;
}

export function Textarea({
  "aria-label": ariaLabel,
  className,
  disabled = false,
  onBlur,
  onChange,
  placeholder,
  size = "default",
  unstyled = false,
  value = "",
}: TextareaProps) {
  const handleInput = useCallback(
    (event: TextareaEvent) => {
      if (!disabled) onChange?.({ currentTarget: { value: event.detail.value } });
    },
    [disabled, onChange],
  );

  return (
    <textarea
      aria-label={ariaLabel}
      aria-disabled={disabled ? "true" : undefined}
      className={[
        unstyled ? "ui-textarea ui-textarea--unstyled" : "ui-textarea",
        `ui-textarea--${String(size)}`,
        disabled ? "ui-textarea--disabled" : undefined,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...({ value } as object)}
      {...(placeholder === undefined ? {} : { placeholder })}
      {...(onBlur === undefined ? {} : { bindblur: onBlur })}
      bindinput={handleInput}
    />
  );
}
