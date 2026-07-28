import { useCallback, useEffect, useState } from "@lynx-js/react";

import { Input, type InputProps } from "./input";

export type DraftInputProps = Omit<InputProps, "value" | "onChange"> & {
  readonly value: string;
  readonly onCommit: (next: string) => void;
};

export function DraftInput({ value, onCommit, ...rest }: DraftInputProps) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = useCallback(() => {
    if (draft !== value) onCommit(draft);
  }, [draft, onCommit, value]);

  return <Input {...rest} value={draft} onValueChange={setDraft} onBlur={commit} />;
}
