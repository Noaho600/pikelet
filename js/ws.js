/**
 * WebSocket URL for Pikelet.
 *
 * Same machine as the API: leave the meta tag empty → uses current host + `/ws`.
 *
 * Static host (e.g. Netlify): point at your real-time server:
 * - Set env `PIKELET_WS_URL` at build time (see `npm run build:netlify` + Netlify), or
 * - Set `<meta name="pikelet-ws-endpoint" content="wss://your-api.host/ws" />`, or
 * - Before any module: `window.__PIKELET_WS_URL__ = "wss://your-api.host/ws";`
 */
export function getWsUrl() {
  if (typeof window !== "undefined" && window.__PIKELET_WS_URL__) {
    const u = String(window.__PIKELET_WS_URL__).trim();
    if (u) return u;
  }
  if (typeof document !== "undefined") {
    const m = document.querySelector('meta[name="pikelet-ws-endpoint"]')?.getAttribute("content")?.trim();
    if (m) return m;
  }
  const p = typeof location !== "undefined" && location.protocol === "https:" ? "wss:" : "ws:";
  const host = typeof location !== "undefined" ? location.host : "localhost:3333";
  return `${p}//${host}/ws`;
}
