import { useCallback } from "@lynx-js/react";

type TextareaEvent = {
  readonly detail: {
    readonly value: string;
  };
};

export interface TextareaProps {
  readonly "aria-label"?: string;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly onBlur?: () => void;
  readonly onChange?: (event: { currentTarget: { value: string } }) => void;
  readonly placeholder?: string;
  readonly size?: "sm" | "default" | "lg" | number;
  readonly unstyled?: boolean;
  readonly value?: string;
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
      placeholder={placeholder}
      bindblur={onBlur}
      bindinput={handleInput}
    />
  );
}
