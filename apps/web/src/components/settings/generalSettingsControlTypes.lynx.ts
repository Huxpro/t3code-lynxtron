export interface GeneralSettingsOption<Value extends string = string> {
  readonly label: string;
  readonly value: Value;
}

export interface GeneralSettingsSelectProps<Value extends string = string> {
  readonly ariaLabel: string;
  readonly onValueChange: (value: Value) => void;
  readonly options: ReadonlyArray<GeneralSettingsOption<Value>>;
  readonly value: Value;
  readonly width?: "normal" | "wide";
}

export interface GeneralSettingsGlassOpacityProps {
  readonly max: number;
  readonly min: number;
  readonly onValueChange: (value: number) => void;
  readonly value: number;
}

export interface GeneralSettingsTextInputProps {
  readonly ariaLabel: string;
  readonly onCommit: (value: string) => void;
  readonly placeholder?: string;
  readonly value: string;
}

export interface GeneralSettingsValueButtonProps {
  readonly ariaLabel: string;
  readonly disabled?: boolean;
  readonly label: string;
  readonly onPress?: () => void;
}
