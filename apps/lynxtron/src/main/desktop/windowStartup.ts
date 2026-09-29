export interface LynxtronWindowStartupOptions<Host> {
  readonly attachConnectorHost: () => Host;
  readonly loadRenderer: () => void;
}

/**
 * Attach every renderer-facing bridge handler before the Lynx bundle can run.
 */
export function startLynxtronWindow<Host>({
  attachConnectorHost,
  loadRenderer,
}: LynxtronWindowStartupOptions<Host>): Host {
  const host = attachConnectorHost();
  loadRenderer();
  return host;
}
