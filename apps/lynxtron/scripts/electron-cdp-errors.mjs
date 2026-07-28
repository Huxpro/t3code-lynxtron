const DRAFT_THREAD_NOT_FOUND =
  /^\[network\] (?:404 Not Found|Failed to load resource: the server responded with a status of 404 \(Not Found\)) http:\/\/127\.0\.0\.1:\d+\/api\/orchestration\/threads\/[0-9a-f-]+$/u;

export function classifyElectronRendererErrors(errors, { href, route }) {
  const expected = [];
  const unexpected = [];
  const isNewThreadDraft =
    route === "new-thread" &&
    typeof href === "string" &&
    /^t3code(?:-dev)?:\/\/app\/#\/draft\/[^/]+$/u.test(href);

  for (const error of errors) {
    if (isNewThreadDraft && DRAFT_THREAD_NOT_FOUND.test(error)) {
      expected.push(error);
    } else {
      unexpected.push(error);
    }
  }
  return { expected, unexpected };
}
