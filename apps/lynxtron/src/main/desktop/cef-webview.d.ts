declare module "@lynx-js/cef-webview/lynxtron" {
  const cefWebview: {
    initialize(options?: Record<string, unknown>): boolean;
  };

  export default cefWebview;
}
