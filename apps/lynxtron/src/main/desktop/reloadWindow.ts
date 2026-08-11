export interface RelaunchableApp {
  relaunch(options?: { args?: string[] }): void;
  exit(exitCode?: number): void;
}

export function reloadApplication(
  app: RelaunchableApp,
  argv: ReadonlyArray<string> = process.argv,
): true {
  app.relaunch({ args: argv.slice(1) });
  app.exit(0);
  return true;
}

export function createReloadMenuItem(app: RelaunchableApp) {
  return {
    id: "t3-reload",
    label: "Reload",
    accelerator: "CommandOrControl+R",
    registerAccelerator: true,
    click: () => reloadApplication(app),
  } as const;
}
