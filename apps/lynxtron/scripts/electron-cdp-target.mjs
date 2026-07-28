const PRODUCT_RENDERER_PROTOCOLS = new Set(["http:", "https:", "t3code:", "t3code-dev:"]);

function isProductRendererTarget(target) {
  if (target?.type !== "page" || typeof target.url !== "string") return false;
  try {
    return PRODUCT_RENDERER_PROTOCOLS.has(new URL(target.url).protocol);
  } catch {
    return false;
  }
}

export function selectElectronRendererTarget(targets) {
  const productTargets = targets.filter(isProductRendererTarget);
  const preferred =
    productTargets.find((target) => target.url.startsWith("t3code-dev://")) ??
    productTargets.find((target) => target.url.startsWith("t3code://")) ??
    productTargets.find((target) => target.url.startsWith("http://127.0.0.1")) ??
    productTargets.find((target) => target.url.startsWith("http://localhost")) ??
    productTargets[0];

  if (!preferred?.webSocketDebuggerUrl) {
    throw new Error("Electron CDP did not expose a T3 Code product renderer target.");
  }
  return preferred;
}
