type SidebarCommandListener = () => void;

const toggleListeners = new Set<SidebarCommandListener>();

export function requestSidebarToggle(): void {
  for (const listener of toggleListeners) listener();
}

export function onSidebarToggleRequest(listener: SidebarCommandListener): () => void {
  toggleListeners.add(listener);
  return () => {
    toggleListeners.delete(listener);
  };
}
