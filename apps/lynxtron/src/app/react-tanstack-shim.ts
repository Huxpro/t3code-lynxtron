// Shim react -> @lynx-js/react/compat for TanStack Router compatibility.
// TanStack Router accesses React.use (React 19+), which @lynx-js/react
// doesn't export. The router guards it with React["use"] so undefined is safe.
//
// We use a default-import + manual object spread to avoid Rspack's strict
// ESM linking that would fail on a non-existent named export.

import ReactLynxCompat from "@lynx-js/react/compat";

// Add React.use as undefined (safe — TanStack Router checks for it).
const shim: any = { ...ReactLynxCompat, use: undefined };

export const {
  Children,
  Component,
  Fragment,
  PureComponent,
  Suspense,
  cloneElement,
  createContext,
  createElement,
  createRef,
  forwardRef,
  isValidElement,
  lazy,
  memo,
  startTransition,
  useCallback,
  useContext,
  useDebugValue,
  useEffect,
  useErrorBoundary,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} = shim;

export const use = undefined;
export const version = shim.version ?? "19.0.0-lynx";
export default shim;
