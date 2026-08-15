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

export function sourceControlLoadingSettingsGeometryMatches(webMetrics, lynxMetrics) {
  const expectedTitles = ["Version Control", "Source Control Providers", "Text generation"];
  const webSections = webMetrics?.geometry?.sections ?? [];
  const lynxSections = lynxMetrics?.geometry?.sections ?? [];
  const webRows = webMetrics?.geometry?.loadingRows ?? [];
  const lynxRows = lynxMetrics?.geometry?.loadingRows ?? [];
  return (
    webMetrics?.loading === true &&
    lynxMetrics?.loading === true &&
    JSON.stringify(webMetrics?.sectionTitles ?? []) === JSON.stringify(expectedTitles) &&
    JSON.stringify(lynxMetrics?.sectionTitles ?? []) === JSON.stringify(expectedTitles) &&
    webSections.length === 3 &&
    lynxSections.length === 3 &&
    webSections.every((webSection, index) =>
      rectWithin(webSection?.box?.rect, lynxSections[index]?.box?.rect, 12),
    ) &&
    webRows.length >= 4 &&
    lynxRows.length === 4 &&
    lynxRows.every((row) => row.box?.rect?.width > 0 && row.box.rect.height > 0)
  );
}
