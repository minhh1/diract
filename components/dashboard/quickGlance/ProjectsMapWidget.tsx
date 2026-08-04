"use client";

// Leaflet + OpenStreetMap map of current projects -- always loaded via
// next/dynamic with ssr:false from PropertyDeveloperQuickGlance.tsx (Leaflet
// touches `window`/`document` at import time, which breaks server rendering).
// No API key/billing, unlike Google Maps -- OSM tiles are free to use under
// their tile usage policy (this is a low-traffic internal dashboard, well
// within it).
import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Leaflet's default marker icon resolves its image URLs relative to the
// bundler's asset path, which breaks under Next/webpack (Icon shows a
// broken image) unless overridden -- the standard fix, pointing at the
// same CDN Leaflet's own docs use rather than copying image assets into
// public/ for 3 small icons.
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

export interface MapPin {
  id: string;
  name: string;
  lat: number;
  lng: number;
  isSelected: boolean;
}

// Recenters the map when the pin set changes (e.g. a state filter narrows
// it) -- MapContainer's own center/zoom props are only read on first mount.
function FitBounds({ pins }: { pins: MapPin[] }) {
  const map = useMap();
  useEffect(() => {
    if (pins.length === 0) return;
    if (pins.length === 1) {
      map.setView([pins[0].lat, pins[0].lng], 12);
      return;
    }
    map.fitBounds(pins.map(p => [p.lat, p.lng] as [number, number]), { padding: [32, 32] });
  }, [pins, map]);
  return null;
}

const AUSTRALIA_CENTER: [number, number] = [-25.2744, 133.7751];

export default function ProjectsMapWidget({ pins, onSelect }: { pins: MapPin[]; onSelect: (id: string) => void }) {
  return (
    <MapContainer center={AUSTRALIA_CENTER} zoom={4} scrollWheelZoom style={{ height: "100%", width: "100%", borderRadius: 16 }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds pins={pins} />
      {pins.map(pin => (
        <Marker key={pin.id} position={[pin.lat, pin.lng]} eventHandlers={{ click: () => onSelect(pin.id) }}>
          <Popup>{pin.name}</Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
