import { useEffect, useMemo, useState } from "react";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";

export interface SharePhotoFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    id: number;
    source: "upload" | "instagram" | "wordpress";
    url: string;
    thumbnail: string | null;
    caption: string | null;
    author: string | null;
  };
}

interface Props {
  /** Ex. https://trek-cloudflare.<compte>.workers.dev */
  apiBase: string;
  tripId: number;
  /** Lien public : la carte marche sans compte. Sinon session (cookies). */
  shareToken?: string;
  sources?: ("upload" | "instagram" | "wordpress")[];
}

const SOURCE_COLOR: Record<string, string> = {
  upload: "#6366f1",
  instagram: "#e1306c",
  wordpress: "#21759b",
};

function FitBounds({ features }: { features: SharePhotoFeature[] }) {
  const map = useMap();
  useEffect(() => {
    if (!features.length) return;
    const b = L.latLngBounds(features.map((f) => [f.geometry.coordinates[1], f.geometry.coordinates[0]] as [number, number]));
    map.fitBounds(b.pad(0.2));
  }, [features, map]);
  return null;
}

function iconFor(f: SharePhotoFeature): L.DivIcon {
  const color = SOURCE_COLOR[f.properties.source] ?? "#6366f1";
  const thumb = f.properties.thumbnail ?? f.properties.url;
  return L.divIcon({
    className: "",
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -22],
    html: `<div style="width:44px;height:44px;border-radius:50%;overflow:hidden;border:3px solid ${color};box-shadow:0 1px 4px rgba(0,0,0,.4);background:#111"><img src="${thumb}" alt="" style="width:100%;height:100%;object-fit:cover" loading="lazy"/></div>`,
  });
}

/**
 * Overlay photos partagées sur fond OpenFreeMap (sans token).
 * Source : GET /api/trips/:id/map-photos (GeoJSON, session ou ?share=).
 * Dépendances déjà présentes dans le client TREK : leaflet + react-leaflet.
 */
export function PhotoShareMap({ apiBase, tripId, shareToken, sources }: Props) {
  const [features, setFeatures] = useState<SharePhotoFeature[]>([]);
  const [error, setError] = useState<string | null>(null);
  const icons = useMemo(() => new Map<number, L.DivIcon>(), []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (sources?.length) params.set("sources", sources.join(","));
    if (shareToken) params.set("share", shareToken);
    const q = params.toString();
    fetch(`${apiBase}/api/trips/${tripId}/map-photos${q ? `?${q}` : ""}`, { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((fc: { features: SharePhotoFeature[] }) => {
        setFeatures(fc.features ?? []);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, [apiBase, tripId, shareToken, sources?.join(",")]);

  if (error) return <p>Carte indisponible ({error})</p>;
  return (
    <MapContainer center={[48.85, 2.35]} zoom={5} style={{ height: 420, width: "100%" }}>
      <TileLayer url="https://tiles.openfreemap.org/planet/{z}/{x}/{y}.png" maxZoom={19} />
      <FitBounds features={features} />
      {features.map((f) => {
        let icon = icons.get(f.properties.id);
        if (!icon) {
          icon = iconFor(f);
          icons.set(f.properties.id, icon);
        }
        const [lng, lat] = f.geometry.coordinates;
        return (
          <Marker key={f.properties.id} position={[lat, lng]} icon={icon}>
            <Popup>
              <strong>{f.properties.source}</strong>
              {f.properties.author ? ` · ${f.properties.author}` : ""}
              <br />
              {f.properties.caption ?? ""}
              <br />
              <a href={f.properties.url} target="_blank" rel="noreferrer">
                Ouvrir la photo
              </a>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
