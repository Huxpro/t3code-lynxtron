#!/usr/bin/env node
// Opener for Linux dev (LYNXTRON_OPEN_COMMAND): Lynxtron runs it for
// shell.openExternal / shell.openPath, and it hands the target to the dev
// viewer, which offers it to the developer's browser.

import * as NodeProcess from "node:process";

const target = NodeProcess.argv[2];
const host = NodeProcess.env.T3_LYNXTRON_VIEWER_HOST ?? "127.0.0.1";
const port = NodeProcess.env.T3_LYNXTRON_VIEWER_PORT;
if (!target || !port) NodeProcess.exit(1);

const response = await fetch(`http://${host}:${port}/open`, {
  method: "POST",
  body: target,
}).catch(() => null);
NodeProcess.exit(response?.ok ? 0 : 1);
