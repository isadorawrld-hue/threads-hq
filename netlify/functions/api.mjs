import { getStore } from "@netlify/blobs";
import { ProxyAgent, fetch as ufetch } from "undici";
import { handle } from "../../lib/core.mjs";

function makeStore() {
  const s = getStore({ name: "crm", consistency: "strong" });
  return {
    get: (k) => s.get(k, { type: "json" }),
    set: (k, v) => s.setJSON(k, v),
    getBinary: (k) => s.get(k, { type: "arrayBuffer" }),
    setBinary: (k, v) => s.set(k, v),
    delete: (k) => s.delete(k),
    list: async (prefix) => {
      const keys = [];
      for await (const page of s.list({ prefix, paginate: true })) for (const b of page.blobs) keys.push(b.key);
      return keys;
    },
  };
}

async function proxyFetch(url, proxy, timeoutMs) {
  const ctrl = AbortSignal.timeout(timeoutMs || 12000);
  if (!proxy) return fetch(url, { signal: ctrl });
  return ufetch(url, { dispatcher: new ProxyAgent(proxy), signal: ctrl });
}

export default async (req) =>
  handle(req, {
    store: makeStore(),
    fetch: (u, o = {}) => fetch(u, { ...o, signal: AbortSignal.timeout(25000) }),
    proxyFetch,
  });

export const config = { path: "/api/*" };
