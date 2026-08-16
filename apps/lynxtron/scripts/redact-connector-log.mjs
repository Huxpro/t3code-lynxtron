export function redactConnectorLog(value) {
  return String(value).replace(/(wsTicket=)[^\s]+/gu, "$1<redacted>");
}
