export type ComposerTextInsertionListener = (text: string) => boolean;

let insertionListener: ComposerTextInsertionListener | null = null;

export function appendComposerText(current: string, insertion: string): string {
  if (!current || /\s$/u.test(current)) return `${current}${insertion}`;
  return `${current} ${insertion}`;
}

export function requestComposerTextInsertion(text: string): boolean {
  return insertionListener?.(text) ?? false;
}

export function onComposerTextInsertion(listener: ComposerTextInsertionListener): () => void {
  insertionListener = listener;
  return () => {
    if (insertionListener === listener) insertionListener = null;
  };
}
