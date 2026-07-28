// Stub react-dom for Lynx. TanStack Router imports flushSync from 'react-dom'
// in link.js. In Lynx there's no DOM to flush, so flushSync just calls the fn.
export function flushSync<R>(fn: () => R): R {
  return fn();
}

export function unstable_batchedUpdates<R, Args extends ReadonlyArray<unknown>>(
  fn: (...args: Args) => R,
  ...args: Args
): R {
  return fn(...args);
}

// Stub remaining react-dom exports.
export const createPortal = undefined;
export const createRoot = undefined;
export const hydrateRoot = undefined;
export const render = undefined;
export const unmountComponentAtNode = undefined;
export const findDOMNode = undefined;
export const version = "0.0.0-lynx-stub";
