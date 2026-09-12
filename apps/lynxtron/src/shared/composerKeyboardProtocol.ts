export const T3_COMPOSER_RETURN_FOCUS_METHOD = "t3:composer.return-focus";

export interface ComposerReturnFocusParams {
  readonly focused: boolean;
}

export function isComposerReturnFocusParams(input: unknown): input is ComposerReturnFocusParams {
  return (
    typeof input === "object" &&
    input !== null &&
    typeof (input as { focused?: unknown }).focused === "boolean"
  );
}
