import { useEffect, useState, type ReactNode } from "@lynx-js/react";

import { readToasts, subscribeToasts, toastManager } from "./toastStore.lynx";

export { toastManager };

const MAX_VISIBLE_TOASTS = 3;

export const anchoredToastManager = toastManager;

export function stackedThreadToast<T>(options: T): T {
  return options;
}

export function ToastProvider({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}

export const AnchoredToastProvider = ToastProvider;
export type ToastPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";

/** Renders the newest toasts in the top-right corner, like Web's default provider. */
export function ToastViewport() {
  const [visible, setVisible] = useState(readToasts);
  useEffect(() => {
    setVisible(readToasts());
    return subscribeToasts(() => setVisible(readToasts()));
  }, []);
  const shown = visible.slice(-MAX_VISIBLE_TOASTS).reverse();
  if (shown.length === 0) return null;
  return (
    <view className="ui-toast-viewport" data-toast-count={String(visible.length)}>
      {shown.map((toast) => (
        <view
          key={toast.id}
          className={`ui-toast ui-toast--${toast.type}`}
          data-toast-type={toast.type}
          data-slot="toast"
        >
          <view className="ui-toast__accent" />
          <view className="ui-toast__body">
            {toast.title ? (
              <text className="ui-toast__title" text-maxline="2">
                {toast.title}
              </text>
            ) : null}
            {toast.description ? (
              <text className="ui-toast__description" text-maxline="4">
                {toast.description}
              </text>
            ) : null}
          </view>
          <view
            className="ui-toast__dismiss"
            aria-label="Dismiss notification"
            bindtap={() => toastManager.close(toast.id)}
          >
            <text className="ui-toast__dismiss-label">×</text>
          </view>
        </view>
      ))}
    </view>
  );
}
