type ModelPickerJumpListener = (index: number) => boolean;

let listener: ModelPickerJumpListener | null = null;

export function requestModelPickerJump(index: number): boolean {
  return listener?.(index) ?? false;
}

export function onModelPickerJump(listenerValue: ModelPickerJumpListener): () => void {
  listener = listenerValue;
  return () => {
    if (listener === listenerValue) listener = null;
  };
}
