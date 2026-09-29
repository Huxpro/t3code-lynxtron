import type { BrowserPreviewScenario } from "./previewScenarios.ts";

function moduleUrl(source: string): string {
  return URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
}

export interface BrowserPreviewNativeModules {
  readonly map: Readonly<Record<"bridge" | "nodejs", string>>;
  dispose(): void;
}

export function createBrowserPreviewNativeModules(
  scenario: BrowserPreviewScenario,
): BrowserPreviewNativeModules {
  const bridge = moduleUrl(`
export default function createBridge(_nativeModules, nativeModulesCall) {
  nativeModulesCall("t3:preview.module-ready", {});
  return {
    call(name, data, callback) {
      const result = nativeModulesCall(name, data);
      if (typeof callback === "function") {
        Promise.resolve(result).then(callback);
      }
      return result;
    },
  };
}
`);
  const capabilities = moduleUrl(`
const preferences = ${JSON.stringify(scenario.preferences)};
const branding = ${JSON.stringify(scenario.branding)};

export default function createCapabilities() {
  return {
    exposed: {
      getAppBranding() {
        return branding;
      },
      getPrefs() {
        return { ...preferences };
      },
      setPrefs(patch) {
        Object.assign(preferences, patch || {});
        return { ...preferences };
      },
      writeClipboardText(value) {
        void String(value);
      },
    },
  };
}
`);

  return {
    map: { bridge, nodejs: capabilities },
    dispose: () => {
      URL.revokeObjectURL(bridge);
      URL.revokeObjectURL(capabilities);
    },
  };
}
