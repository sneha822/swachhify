import L from "leaflet";
import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { cn } from "@/lib/format";

export const DEFAULT_CENTER: [number, number] = [26.9124, 75.7873]; // Jaipur

export interface MapPin {
  id: string | number;
  lat: number;
  lng: number;
  /** Marker glyph: inline SVG (use the PIN_* constants) or a category emoji from the API. */
  emoji: string;
  color?: string;
  label?: string;
  popup?: React.ReactNode;
  pulse?: boolean;
}

const glyph = (path: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;

/** Lucide-derived marker glyphs, so map pins match the rest of the icon set. */
export const PIN_HOME = glyph('<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>');
export const PIN_VEHICLE = glyph('<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>');
export const PIN_PACKAGE = glyph('<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>');
export const PIN_HUB = glyph('<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/>');
export const PIN_BATTERY = glyph('<path d="M10 10v4"/><path d="M14 10v4"/><path d="M22 14v-4"/><rect x="2" y="6" width="16" height="12" rx="2"/>');
export const PIN_GIFT = glyph('<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/>');
export const PIN_RECYCLE = glyph('<path d="M7 19H4.815a1.83 1.83 0 0 1-1.57-.881 1.785 1.785 0 0 1-.004-1.784L7.196 9.5"/><path d="M11 19h8.203a1.83 1.83 0 0 0 1.556-.89 1.784 1.784 0 0 0 0-1.775l-1.226-2.12"/><path d="m14 16-3 3 3 3"/><path d="M8.293 13.596 4.875 9.5"/><path d="m9 6 3-3 3 3"/><path d="M12 3v7"/>');

const iconCache = new Map<string, L.DivIcon>();
function pinIcon(emoji: string, color = "#175939", pulse = false) {
  const key = `${emoji}|${color}|${pulse}`;
  if (!iconCache.has(key)) {
    iconCache.set(
      key,
      L.divIcon({
        className: "map-pin",
        iconSize: [40, 48],
        iconAnchor: [20, 46],
        popupAnchor: [0, -40],
        html: `<div style="position:relative;width:40px;height:48px;color:${color}">
          ${pulse ? `<span style="position:absolute;left:5px;top:5px;width:30px;height:30px;border-radius:9999px;background:${color};opacity:.3;animation:ping 1.8s cubic-bezier(0,0,.2,1) infinite"></span>` : ""}
          <div style="position:absolute;left:4px;top:1px;width:32px;height:32px;border-radius:9999px;background:#fff;border:2px solid ${color};display:grid;place-items:center;font-size:16px;line-height:1;box-shadow:0 4px 10px -4px rgba(16,22,19,.45)">${emoji}</div>
          <div style="position:absolute;left:16px;top:29px;width:8px;height:8px;background:${color};transform:rotate(45deg);border-radius:1px"></div>
        </div>`,
      }),
    );
  }
  return iconCache.get(key)!;
}

function FitBounds({ pins }: { pins: MapPin[] }) {
  const map = useMap();
  const key = pins.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join("|");
  useEffect(() => {
    if (!pins.length) return;
    if (pins.length === 1) map.setView([pins[0].lat, pins[0].lng], 14);
    else map.fitBounds(L.latLngBounds(pins.map((p) => [p.lat, p.lng])), { padding: [40, 40], maxZoom: 15 });
  }, [key, map]); // `key` captures pin positions; re-fitting on every render would fight the user's panning
  return null;
}

export function MapView({
  pins,
  className,
  line,
  onPinClick,
}: {
  pins: MapPin[];
  className?: string;
  line?: [number, number][];
  onPinClick?: (id: MapPin["id"]) => void;
}) {
  const center = useMemo<[number, number]>(() => (pins[0] ? [pins[0].lat, pins[0].lng] : DEFAULT_CENTER), [pins]);
  return (
    <div className={cn("relative isolate overflow-hidden rounded-card border border-line bg-brand-50", className ?? "h-72")}>
      <style>{"@keyframes ping{75%,100%{transform:scale(2);opacity:0}}"}</style>
      <MapContainer center={center} zoom={13} scrollWheelZoom={false} className="h-full w-full" attributionControl>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {pins.map((p) => (
          <Marker
            key={p.id}
            position={[p.lat, p.lng]}
            icon={pinIcon(p.emoji, p.color, p.pulse)}
            title={p.label}
            eventHandlers={onPinClick ? { click: () => onPinClick(p.id) } : undefined}
          >
            {p.popup && <Popup>{p.popup}</Popup>}
          </Marker>
        ))}
        {line && <Polyline positions={line} pathOptions={{ color: "#0284c7", weight: 4, dashArray: "6 8" }} />}
        <FitBounds pins={pins} />
      </MapContainer>
    </div>
  );
}

function ClickToPlace({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], Math.max(map.getZoom(), 15));
  }, [lat, lng, map]);
  return null;
}

/** Tap the map (or use GPS) to set an exact pickup location. */
export function LocationPicker({ lat, lng, onChange, className }: { lat: number; lng: number; onChange: (lat: number, lng: number) => void; className?: string }) {
  return (
    <div className={cn("relative isolate overflow-hidden rounded-card border border-line", className ?? "h-64")}>
      <MapContainer center={[lat, lng]} zoom={14} scrollWheelZoom={false} className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker
          position={[lat, lng]}
          icon={pinIcon(PIN_HOME)}
          draggable
          eventHandlers={{
            dragend: (e) => {
              const p = (e.target as L.Marker).getLatLng();
              onChange(p.lat, p.lng);
            },
          }}
        />
        <ClickToPlace onPick={onChange} />
        <Recenter lat={lat} lng={lng} />
      </MapContainer>
    </div>
  );
}

export const directionsUrl = (lat: number, lng: number) =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat.toFixed(6)},${lng.toFixed(6)}`;
