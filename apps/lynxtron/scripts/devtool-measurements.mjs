function commandResult(response) {
  return response?.result?.result ?? response?.result ?? response;
}

function quadRect(quad) {
  if (!Array.isArray(quad) || quad.length < 8) return null;
  const x = [quad[0], quad[2], quad[4], quad[6]];
  const y = [quad[1], quad[3], quad[5], quad[7]];
  const left = Math.min(...x);
  const top = Math.min(...y);
  const right = Math.max(...x);
  const bottom = Math.max(...y);
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

function styleRecord(response) {
  const result = commandResult(response);
  const properties = result?.computedStyle ?? [];
  return Object.fromEntries(properties.map((property) => [property.name, property.value]));
}

function attributeRecord(response) {
  const attributes = commandResult(response)?.attributes ?? [];
  const pairs = [];
  for (let index = 0; index + 1 < attributes.length; index += 2) {
    pairs.push([attributes[index], attributes[index + 1]]);
  }
  return Object.fromEntries(pairs);
}

async function queryNode(runCdp, rootNodeId, selector) {
  const response = await runCdp("DOM.querySelector", {
    nodeId: rootNodeId,
    selector,
  });
  const nodeId = commandResult(response)?.nodeId;
  if (!Number.isInteger(nodeId) || nodeId <= 0) {
    throw new Error(`Lynx DevTool selector did not match: ${selector}`);
  }
  return nodeId;
}

function decodeHtmlAttribute(value) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replace(/&#(\d+);/gu, (_match, codePoint) => String.fromCodePoint(Number(codePoint)))
    .replace(/&#x([\da-f]+);/giu, (_match, codePoint) =>
      String.fromCodePoint(Number.parseInt(codePoint, 16)),
    );
}

function textRecord(response, outerHtmlResponse) {
  const result = commandResult(response);
  const directText = result?.text ?? result?.innerText;
  if (typeof directText === "string" && directText.length > 0 && directText !== "[object Object]") {
    return directText;
  }

  const rawTextValues = result?.rawTextValues;
  if (Array.isArray(rawTextValues) && rawTextValues.length > 0) {
    const text = rawTextValues
      .filter((value) => typeof value === "string" && value !== "[object Object]")
      .join(" ");
    if (text.length > 0) return text;
  }

  // Lynx Desktop currently returns an empty rawTextValues array from
  // DOM.innerText. Its DOM.getOuterHTML payload retains rendered text as
  // `text` attributes on <text> and <raw-text> nodes.
  const outerHTML = commandResult(outerHtmlResponse)?.outerHTML;
  if (typeof outerHTML !== "string") return "";
  return [...outerHTML.matchAll(/\stext="([^"]*)"/gu)]
    .map((match) => decodeHtmlAttribute(match[1]))
    .filter(Boolean)
    .join(" ");
}

async function nodeMeasurement(runCdp, rootNodeId, selector) {
  const nodeId = await queryNode(runCdp, rootNodeId, selector);
  const [boxResponse, styleResponse, textResponse, outerHtmlResponse, attributesResponse] =
    await Promise.all([
      runCdp("DOM.getBoxModel", { nodeId }),
      runCdp("CSS.getComputedStyleForNode", { nodeId }),
      runCdp("DOM.innerText", { nodeId }),
      runCdp("DOM.getOuterHTML", { nodeId }),
      runCdp("DOM.getAttributes", { nodeId }),
    ]);
  const box = commandResult(boxResponse)?.model;
  const styles = styleRecord(styleResponse);
  const text = textRecord(textResponse, outerHtmlResponse);
  return {
    selector,
    nodeId,
    rect: quadRect(box?.border ?? box?.content),
    box: box
      ? {
          width: box.width,
          height: box.height,
        }
      : null,
    text,
    attributes: attributeRecord(attributesResponse),
    style: {
      backgroundColor: styles["background-color"] ?? null,
      color: styles.color ?? null,
      fontFamily: styles["font-family"] ?? null,
      fontSize: styles["font-size"] ?? null,
      fontWeight: styles["font-weight"] ?? null,
      lineHeight: styles["line-height"] ?? null,
    },
  };
}

export async function collectLynxMeasurements({ runCdp, spec }) {
  await runCdp("DOM.enable", { useCompression: false });
  const documentResponse = await runCdp("DOM.getDocument", {});
  const root = commandResult(documentResponse)?.root;
  // Lynx Desktop's synthetic top-level root does not participate in
  // DOM.querySelector. Query from its document child when present.
  const rootNodeId = root?.children?.[0]?.nodeId ?? root?.nodeId;
  if (!rootNodeId) {
    throw new Error("Lynx DevTool DOM.getDocument did not return a root node.");
  }

  const measurementBySelector = new Map();
  const measure = (selector) => {
    const cached = measurementBySelector.get(selector);
    if (cached) return cached;
    const pending = nodeMeasurement(runCdp, rootNodeId, selector);
    measurementBySelector.set(selector, pending);
    return pending;
  };
  const collect = async (entries) =>
    Object.fromEntries(
      await Promise.all(entries.map(async (entry) => [entry.id, await measure(entry.lynx)])),
    );

  return {
    schemaVersion: 1,
    source: "lynx-devtool",
    route: spec.route,
    anchors: await collect(spec.anchors),
    typography: await collect(spec.typography),
    colors: await collect(spec.colors),
  };
}
