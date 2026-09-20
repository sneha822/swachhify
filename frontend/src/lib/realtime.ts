import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { wsUrl } from "./api";
import { useToast } from "./toast";
import type { Pickup } from "./types";

type Event =
  | { event: "notification"; data: { title: string; body: string; type: string } }
  | { event: "pickup_update"; data: { code: string; status: string } }
  | { event: "partner_location"; data: { code: string; lat: number; lng: number; distance_km: number; eta_min: number } };

/** Live updates over WebSocket; reconnects with backoff. Refreshes the affected queries. */
export function useRealtime(enabled: boolean) {
  const qc = useQueryClient();
  const toast = useToast();

  useEffect(() => {
    if (!enabled) return;
    let ws: WebSocket | null = null;
    let attempts = 0;
    let closed = false;
    let ping: ReturnType<typeof setInterval> | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      const url = wsUrl();
      if (!url || closed) return;
      ws = new WebSocket(url);
      ws.onopen = () => {
        attempts = 0;
        ping = setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send("ping"), 25_000);
      };
      ws.onmessage = (m) => {
        let msg: Event;
        try {
          msg = JSON.parse(m.data);
        } catch {
          return;
        }
        if (msg.event === "notification") {
          qc.invalidateQueries({ queryKey: ["notifications"] });
          qc.invalidateQueries({ queryKey: ["rewards"] });
          toast({ tone: "info", title: msg.data.title, body: msg.data.body });
        } else if (msg.event === "pickup_update") {
          qc.invalidateQueries({ queryKey: ["pickups"] });
          qc.invalidateQueries({ queryKey: ["pickup", msg.data.code] });
          qc.invalidateQueries({ queryKey: ["partner"] });
          qc.invalidateQueries({ queryKey: ["admin"] });
        } else if (msg.event === "partner_location") {
          const d = msg.data;
          qc.setQueryData<Pickup>(["pickup", d.code], (p) =>
            p ? { ...p, tracking: { lat: d.lat, lng: d.lng, distance_km: d.distance_km, eta_min: d.eta_min, live: true } } : p,
          );
        }
      };
      ws.onclose = (e) => {
        clearInterval(ping);
        if (closed || e.code === 4401) return;
        attempts += 1;
        retry = setTimeout(connect, Math.min(30_000, 1000 * 2 ** attempts));
      };
    };
    connect();
    return () => {
      closed = true;
      clearInterval(ping);
      clearTimeout(retry);
      ws?.close();
    };
  }, [enabled, qc, toast]);
}
