type ThreadJumpListener = (index: number) => boolean;

let listener: ThreadJumpListener | null = null;

export function requestSidebarThreadJump(index: number): boolean {
  return listener?.(index) ?? false;
}

export function onSidebarThreadJump(listenerValue: ThreadJumpListener): () => void {
  listener = listenerValue;
  return () => {
    if (listener === listenerValue) listener = null;
  };
}
