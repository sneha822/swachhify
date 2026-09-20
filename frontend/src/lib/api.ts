const BASE = import.meta.env.VITE_API_URL ?? "/api/v1";
const ACCESS = "swacchify.access";
const REFRESH = "swacchify.refresh";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export const tokens = {
  get access() {
    return storage()?.getItem(ACCESS) ?? null;
  },
  get refresh() {
    return storage()?.getItem(REFRESH) ?? null;
  },
  set(access: string, refresh: string) {
    storage()?.setItem(ACCESS, access);
    storage()?.setItem(REFRESH, refresh);
  },
  clear() {
    storage()?.removeItem(ACCESS);
    storage()?.removeItem(REFRESH);
  },
};

type Json = Record<string, unknown> | unknown[];

interface Options {
  method?: string;
  body?: Json | FormData;
  signal?: AbortSignal;
}

function message(detail: unknown, fallback: string): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length) {
    const d = detail[0] as { msg?: string; loc?: unknown[] };
    const field = Array.isArray(d.loc) ? String(d.loc[d.loc.length - 1]) : "";
    const msg = (d.msg ?? fallback).replace(/^Value error, /, "");
    return field && !["body", "query"].includes(field) ? `${field.replace(/_/g, " ")}: ${msg}` : msg;
  }
  return fallback;
}

let refreshing: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  const rt = tokens.refresh;
  if (!rt) return false;
  refreshing ??= fetch(`${BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: rt }),
  })
    .then(async (r) => {
      if (!r.ok) {
        tokens.clear();
        return false;
      }
      const data = await r.json();
      tokens.set(data.access_token, data.refresh_token);
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export async function api<T = unknown>(path: string, opts: Options = {}, retry = true): Promise<T> {
  const headers: Record<string, string> = {};
  const isForm = opts.body instanceof FormData;
  if (opts.body && !isForm) headers["Content-Type"] = "application/json";
  if (tokens.access) headers.Authorization = `Bearer ${tokens.access}`;

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: opts.method ?? (opts.body ? "POST" : "GET"),
      headers,
      body: opts.body ? (isForm ? (opts.body as FormData) : JSON.stringify(opts.body)) : undefined,
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(0, "Can't reach Swacchify. Check your internet connection.");
  }

  if (res.status === 401 && retry && tokens.refresh && !path.startsWith("/auth/")) {
    if (await refreshTokens()) return api<T>(path, opts, false);
    window.dispatchEvent(new Event("swacchify:logout"));
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, message(data?.detail, `Something went wrong (${res.status})`));
  return data as T;
}

export const get = <T>(path: string, signal?: AbortSignal) => api<T>(path, { signal });
export const post = <T>(path: string, body?: Json | FormData) => api<T>(path, { method: "POST", body: body ?? {} });
export const patch = <T>(path: string, body: Json) => api<T>(path, { method: "PATCH", body });
export const put = <T>(path: string, body: Json) => api<T>(path, { method: "PUT", body });
export const del = <T>(path: string) => api<T>(path, { method: "DELETE" });

export function wsUrl(): string | null {
  if (!tokens.access) return null;
  const base = BASE.startsWith("http") ? BASE.replace(/^http/, "ws") : `${location.origin.replace(/^http/, "ws")}${BASE}`;
  return `${base}/ws?token=${encodeURIComponent(tokens.access)}`;
}

export function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") s.set(k, String(v));
  const str = s.toString();
  return str ? `?${str}` : "";
}
