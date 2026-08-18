import type {
  ProviderSettingsFormAnnotation,
  ProviderSettingsFormControl,
  ProviderSettingsFormSchemaAnnotation,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

export type ProviderSettingsSchema = {
  readonly fields: Readonly<Record<string, Schema.Top>>;
} & Schema.Top;

export interface ProviderSettingsFieldModel {
  readonly key: string;
  readonly control: ProviderSettingsFormControl;
  readonly label: string;
  readonly description?: string | undefined;
  readonly placeholder?: string | undefined;
  readonly clearWhenEmpty: "omit" | "persist";
  readonly defaultBooleanValue?: boolean | undefined;
}

function titleizeFieldKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/^./, (char) => char.toUpperCase());
}

function readFieldAnnotations(fieldSchema: Schema.Top) {
  return Schema.resolveAnnotationsKey(fieldSchema) ?? Schema.resolveAnnotations(fieldSchema);
}

function readFieldAnnotationString(
  fieldSchema: Schema.Top,
  key: "title" | "description",
): string | undefined {
  const value = readFieldAnnotations(fieldSchema)?.[key];
  return typeof value === "string" ? value : undefined;
}

function readProviderSettingsFormAnnotation(
  fieldSchema: Schema.Top,
): ProviderSettingsFormAnnotation {
  return readFieldAnnotations(fieldSchema)?.providerSettingsForm ?? {};
}

function readProviderSettingsFormSchemaAnnotation(
  settingsSchema: ProviderSettingsSchema,
): ProviderSettingsFormSchemaAnnotation {
  return Schema.resolveAnnotations(settingsSchema)?.providerSettingsFormSchema ?? {};
}

function readFieldBooleanDefault(fieldSchema: Schema.Top): boolean | undefined {
  const decoded = Schema.decodeUnknownOption(fieldSchema as Schema.Decoder<unknown>)(undefined);
  return Option.isSome(decoded) && typeof decoded.value === "boolean" ? decoded.value : undefined;
}

export function deriveProviderSettingsFields(
  settingsSchema: ProviderSettingsSchema,
): ReadonlyArray<ProviderSettingsFieldModel> {
  const schemaAnnotation = readProviderSettingsFormSchemaAnnotation(settingsSchema);
  const orderedKeys = new Map(
    (schemaAnnotation.order ?? []).map((key, index) => [key, index] as const),
  );
  const orderFallbackOffset = orderedKeys.size;

  return Object.keys(settingsSchema.fields)
    .map((key, index) => ({ key, index }))
    .toSorted(
      (left, right) =>
        (orderedKeys.get(left.key) ?? orderFallbackOffset + left.index) -
        (orderedKeys.get(right.key) ?? orderFallbackOffset + right.index),
    )
    .flatMap(({ key }) => {
      const fieldSchema = settingsSchema.fields[key]!;
      const formAnnotation = readProviderSettingsFormAnnotation(fieldSchema);
      if (formAnnotation.hidden) return [];
      const title = readFieldAnnotationString(fieldSchema, "title");
      const description = readFieldAnnotationString(fieldSchema, "description");
      return [
        {
          key,
          control: formAnnotation.control ?? "text",
          label: title ?? titleizeFieldKey(key),
          ...(description ? { description } : {}),
          ...(formAnnotation.placeholder ? { placeholder: formAnnotation.placeholder } : {}),
          clearWhenEmpty: formAnnotation.clearWhenEmpty ?? "omit",
          ...(formAnnotation.control === "switch"
            ? { defaultBooleanValue: readFieldBooleanDefault(fieldSchema) }
            : {}),
        } satisfies ProviderSettingsFieldModel,
      ];
    });
}

export function readProviderConfigString(config: unknown, key: string): string {
  if (config === null || typeof config !== "object") return "";
  const value = (config as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

export function readProviderConfigStringArray(config: unknown, key: string): ReadonlyArray<string> {
  if (config === null || typeof config !== "object") return [];
  const value = (config as Record<string, unknown>)[key];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

export function readProviderConfigBoolean(
  config: unknown,
  key: string,
  defaultValue = false,
): boolean {
  if (config === null || typeof config !== "object") return defaultValue;
  const value = (config as Record<string, unknown>)[key];
  return typeof value === "boolean" ? value : defaultValue;
}

export function nextProviderConfigWithFieldValue(
  config: unknown,
  field: ProviderSettingsFieldModel,
  value: string | boolean,
): Record<string, unknown> | undefined {
  const next =
    config !== null && typeof config === "object" ? { ...(config as Record<string, unknown>) } : {};

  if (typeof value === "boolean") {
    const emptyValue = field.defaultBooleanValue ?? false;
    if (field.clearWhenEmpty === "omit" && value === emptyValue) delete next[field.key];
    else next[field.key] = value;
  } else if (field.clearWhenEmpty === "omit" && value.trim().length === 0) {
    delete next[field.key];
  } else {
    next[field.key] = value;
  }

  return Object.keys(next).length > 0 ? next : undefined;
}
