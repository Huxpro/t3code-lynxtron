import { Undo2Icon } from "lucide-react";
import { type ComponentPropsWithoutRef, type ReactNode, useEffect, useState } from "react";

import type {
  GeneralSettingsGlassOpacityProps,
  GeneralSettingsSelectProps,
  GeneralSettingsTextInputProps,
  GeneralSettingsValueButtonProps,
} from "./generalSettingsControlTypes";

function joinClassNames(...values: ReadonlyArray<string | undefined | false>): string {
  return values.filter(Boolean).join(" ");
}

export function SettingsSection({
  title,
  icon,
  headerAction,
  children,
  className,
  ...sectionProps
}: ComponentPropsWithoutRef<"section"> & {
  title: string;
  icon?: ReactNode;
  headerAction?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section {...sectionProps} className={joinClassNames("settings-section space-y-3", className)}>
      <div className="flex min-h-8 items-center justify-between gap-4 px-3 sm:px-4">
        <h2 className="settings-section__title flex items-center gap-2 text-lg font-semibold tracking-[-0.025em] text-foreground">
          {icon}
          {title}
        </h2>
        <div className="flex min-h-7 min-w-7 items-center justify-end">{headerAction}</div>
      </div>
      <div className="relative space-y-1 overflow-visible text-foreground">{children}</div>
    </section>
  );
}

export function SettingsRow({
  title,
  description,
  status,
  resetAction,
  control,
  children,
  unavailable = false,
  className,
  ...rowProps
}: Omit<ComponentPropsWithoutRef<"div">, "title"> & {
  title: ReactNode;
  description: ReactNode;
  status?: ReactNode;
  resetAction?: ReactNode;
  control?: ReactNode;
  children?: ReactNode;
  unavailable?: boolean;
}) {
  return (
    <div
      {...rowProps}
      aria-disabled={unavailable || undefined}
      data-settings-unavailable={unavailable || undefined}
      className={joinClassNames(
        "settings-row rounded-xl px-3 sm:px-4",
        children ? "pt-3 pb-1" : "py-3",
        unavailable && "pointer-events-none opacity-50",
        className,
      )}
    >
      <div className="flex flex-col gap-3 sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(10rem,auto)] sm:items-center sm:gap-8">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex min-h-5 items-center gap-1.5">
            <h3 className="settings-row__title text-sm font-medium tracking-[-0.005em] text-foreground">
              {title}
            </h3>
            <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center">
              {resetAction}
            </span>
          </div>
          <p className="settings-row__desc max-w-xl text-[13px] leading-[1.45] text-muted-foreground/80">
            {description}
          </p>
          {status ? <div className="pt-0.5 text-xs text-muted-foreground">{status}</div> : null}
        </div>
        {control ? (
          <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto sm:justify-end">
            {control}
          </div>
        ) : null}
      </div>
      {children}
    </div>
  );
}

export function SettingResetButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={`Reset ${label} to default`}
      className="inline-flex size-5 items-center justify-center rounded-sm p-0 text-muted-foreground hover:text-foreground"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      <Undo2Icon className="size-3" />
    </button>
  );
}

export function SettingsPageContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="settings-panel settings-page-scroll-fade scrollbar-gutter-both flex-1 overflow-y-auto px-4 pt-10 pb-7 sm:px-8 sm:pt-12 sm:pb-10">
      <div className={joinClassNames("mx-auto flex w-full max-w-4xl flex-col gap-12", className)}>
        {children}
      </div>
    </div>
  );
}

export function GeneralSettingsSelect<Value extends string>({
  ariaLabel,
  onValueChange,
  options,
  value,
  width = "normal",
}: GeneralSettingsSelectProps<Value>) {
  return (
    <select
      aria-label={ariaLabel}
      className={joinClassNames(
        "h-8 rounded-md border border-input bg-background px-3 text-xs text-foreground",
        width === "wide" ? "w-full sm:w-44" : "w-full sm:w-40",
      )}
      onChange={(event) => onValueChange(event.currentTarget.value as Value)}
      value={value}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function GeneralSettingsGlassOpacity({
  max,
  min,
  onValueChange,
  value,
}: GeneralSettingsGlassOpacityProps) {
  const ratio = (value - min) / (max - min);
  const sliderStyle = {
    "--glass-slider-progress": `${ratio * 100}%`,
    "--glass-slider-fill-offset": `${0.5 - ratio}rem`,
  } as React.CSSProperties;

  return (
    <div className="flex w-full items-center gap-3 sm:w-52">
      <output
        className="min-w-12 rounded-md bg-muted px-2 py-1 text-center font-mono text-xs font-medium tabular-nums text-foreground"
        htmlFor="glass-opacity"
      >
        {value}%
      </output>
      <input
        aria-label="Glass opacity"
        className="glass-opacity-slider min-w-0 flex-1"
        id="glass-opacity"
        max={max}
        min={min}
        onChange={(event) => onValueChange(Number(event.currentTarget.value))}
        step={5}
        style={sliderStyle}
        type="range"
        value={value}
      />
    </div>
  );
}

export function GeneralSettingsTextInput({
  ariaLabel,
  onCommit,
  placeholder,
  value,
}: GeneralSettingsTextInputProps) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };

  return (
    <input
      aria-label={ariaLabel}
      className="h-8 w-full rounded-md border border-input bg-background px-3 text-xs text-foreground sm:w-72"
      onBlur={commit}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          commit();
          event.currentTarget.blur();
        }
      }}
      placeholder={placeholder}
      spellCheck={false}
      value={draft}
    />
  );
}

export function GeneralSettingsValueButton({
  ariaLabel,
  disabled,
  label,
  onPress,
}: GeneralSettingsValueButtonProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      className="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-xs font-medium text-foreground disabled:opacity-50"
      disabled={disabled}
      onClick={onPress}
    >
      {label}
    </button>
  );
}

export function GeneralSettingsNotice({ message }: { readonly message: string }) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
      {message}
    </div>
  );
}

export function GeneralSettingsSwitch({
  checked,
  disabled,
  onCheckedChange,
  ...props
}: {
  readonly checked: boolean;
  readonly disabled?: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
  readonly "aria-label": string;
}) {
  return (
    <button
      {...props}
      type="button"
      role="switch"
      aria-checked={checked}
      className="relative inline-flex h-[18px] w-[30px] items-center rounded-full bg-input p-px data-[state=checked]:bg-primary disabled:opacity-50"
      data-state={checked ? "checked" : "unchecked"}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
    >
      <span
        className={joinClassNames(
          "block size-4 rounded-full bg-background transition-transform",
          checked && "translate-x-3",
        )}
      />
    </button>
  );
}
