export function getWsUrl() {
  const p = location.protocol === "https:" ? "wss:" : "ws:";
  return `${p}//${location.host}/ws`;
}
