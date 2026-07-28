export interface KeyValueStorage {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
  readonly removeItem: (key: string) => void;
}

export interface ClipboardCapability {
  readonly available: () => boolean;
  readonly writeText: (value: string) => Promise<void>;
}

export interface ConnectivityCapability {
  readonly isOnline: () => boolean;
}

export interface KeyboardCapability {
  readonly available: boolean;
  readonly subscribe: (listener: (key: string) => void) => () => void;
}

export interface MediaQueryCapability {
  readonly matches: (query: string) => boolean;
}

export interface NavigationCapability {
  readonly canOpenExternal: () => boolean;
  readonly canOpenPath: () => boolean;
  readonly openExternal: (url: string) => Promise<void>;
  readonly openPath: (path: string) => Promise<void>;
}

export interface ClientUiCapabilities {
  readonly storage: KeyValueStorage;
  readonly clipboard: ClipboardCapability;
  readonly connectivity: ConnectivityCapability;
  readonly keyboard: KeyboardCapability;
  readonly mediaQuery: MediaQueryCapability;
  readonly navigation: NavigationCapability;
}
