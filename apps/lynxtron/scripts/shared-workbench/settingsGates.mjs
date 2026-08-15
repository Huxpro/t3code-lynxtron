function rectWithin(webRect, lynxRect, tolerance) {
  return (
    webRect &&
    lynxRect &&
    ["x", "y", "width", "height"].every(
      (key) =>
        typeof webRect[key] === "number" &&
        typeof lynxRect[key] === "number" &&
        Math.abs(webRect[key] - lynxRect[key]) <= tolerance,
    )
  );
}

export function sourceControlErrorSettingsGeometryMatches(webMetrics, lynxMetrics) {
  const webSections = webMetrics?.geometry?.sections ?? [];
  const lynxSections = lynxMetrics?.geometry?.sections ?? [];
  return (
    JSON.stringify(webMetrics?.sectionTitles ?? []) ===
      JSON.stringify(["Server environment", "Text generation"]) &&
    JSON.stringify(lynxMetrics?.sectionTitles ?? []) ===
      JSON.stringify(["Server environment", "Text generation"]) &&
    JSON.stringify(webMetrics?.sourceControlEmptyTitles ?? []) ===
      JSON.stringify(["Could not scan the server environment"]) &&
    JSON.stringify(lynxMetrics?.sourceControlEmptyTitles ?? []) ===
      JSON.stringify(["Could not scan the server environment"]) &&
    rectWithin(
      webMetrics?.geometry?.sourceControlEmpty?.rect,
      lynxMetrics?.geometry?.sourceControlEmpty?.rect,
      1,
    ) &&
    webSections.length === 2 &&
    lynxSections.length === 2 &&
    webSections.every((webSection, index) =>
      rectWithin(webSection?.box?.rect, lynxSections[index]?.box?.rect, 8),
    )
  );
}
