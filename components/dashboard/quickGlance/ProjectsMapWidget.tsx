"use client";

// Leaflet + OpenStreetMap map of current projects -- always loaded via
// next/dynamic with ssr:false from PropertyDeveloperQuickGlance.tsx (Leaflet
// touches `window`/`document` at import time, which breaks server rendering).
// No API key/billing, unlike Google Maps.
//
// Tiles come from CARTO's free Voyager basemap, not tile.openstreetmap.org
// directly -- OSM's own tile usage policy explicitly discourages hotlinking
// it from a production app (no bulk/commercial use, low and unpredictable
// rate limits) and it started returning 404s for this app's tile requests
// once real traffic hit it (confirmed live: switching the state filter
// pans/zooms the map, which requests a new batch of tiles). CARTO's
// basemaps are free for this kind of moderate web-app use with attribution,
// same underlying OSM data, just served from an endpoint meant for exactly
// this.
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

// Tile requests are cache-first via public/sw-map-tiles.js, registered app-
// wide from components/AppServiceWorker.tsx (not here) -- see that file's
// own comment for why it's mounted at the app-shell layout instead of just
// this one page.
export default function ProjectsMapWidget({ pins, onSelect }: { pins: MapPin[]; onSelect: (id: string) => void }) {
  return (
    <MapContainer center={AUSTRALIA_CENTER} zoom={4} scrollWheelZoom style={{ height: "100%", width: "100%", borderRadius: 16 }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        subdomains="abcd"
        maxZoom={20}
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
