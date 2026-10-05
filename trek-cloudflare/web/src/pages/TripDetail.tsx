import { useCallback, useEffect, useMemo, useState } from "react";
import { places, photoUrl, trips, type Day, type MapPhotoFeature, type PhotoShare, type Place, type Share, type Trip } from "../api";
import { navigate } from "../App";
import { TripMap } from "../components/TripMap";

export function TripDetail({ id }: { id: number }) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [days, setDays] = useState<Day[]>([]);
  const [list, setList] = useState<Place[]>([]);
  const [shares, setShares] = useState<PhotoShare[]>([]);
  const [share, setShare] = useState<Share | null>(null);
  const [features, setFeatures] = useState<MapPhotoFeature[]>([]);
  const [weather, setWeather] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const d = await trips.detail(id);
      setTrip(d.trip);
      setDays(d.days);
      setList(d.places);
      setShare(d.share);
      setShares(await trips.photoShares(id));
      setFeatures((await trips.mapPhotos(id)).features);
      trips
        .weather(id)
        .then((w) => {
          const t = w.daily.time ?? [];
          const codes = w.daily.weathercode ?? [];
          setWeather(
            t.length
              ? t.slice(0, 5).map((day, i) => `${String(day).slice(5)} ${String(w.daily.temperature_2m_max?.[i] ?? "?")}° / ${String(
                  w.daily.temperature_2m_min?.[i] ?? "?",
                )}° ${String(codes[i] ?? "")}`).join(" · ")
              : null,
          );
        })
        .catch(() => setWeather(null));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "chargement impossible");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const flash = (m: string) => {
    setInfo(m);
    setTimeout(() => setInfo(null), 2500);
  };

  if (err) return <div className="error">{err}</div>;
  if (!trip) return <div className="muted">Chargement…</div>;

  return (
    <div className="stack">
      <div className="row">
        <button className="ghost" onClick={() => navigate("/")}>
          ← Voyages
        </button>
        <h2 style={{ flex: 1 }}>{trip.title}</h2>
        <a className="muted" href={`/api/trips/${id}/export.gpx`}>
          GPX
        </a>
        <a className="muted" href={`/api/trips/${id}/calendar.ics`}>
          ICS
        </a>
        <button
          className="danger"
          onClick={() => {
            if (!confirm(`Supprimer « ${trip.title} » ?`)) return;
            void trips.remove(id).then(() => navigate("/"));
          }}
        >
          Supprimer
        </button>
      </div>
      {info && <div className="muted">{info}</div>}
      {weather && <div className="muted">Météo : {weather}</div>}

      <TripMap places={list} features={features} photoHref={(f) => photoUrl(f.properties.url)} />

      <div className="grid two">
        <PlacesCard tripId={id} places={list} days={days} onChanged={load} />
        <div className="stack">
          <ShareCard tripId={id} share={share} onChanged={load} onFlash={flash} />
          <PhotosCard tripId={id} shares={shares} places={list} onChanged={load} onFlash={flash} />
        </div>
      </div>

      <DaysCard tripId={id} days={days} onChanged={load} />
    </div>
  );
}

// ---------------------------------------------------------------- lieux
function PlacesCard({
  tripId,
  places: list,
  days,
  onChanged,
}: {
  tripId: number;
  places: Place[];
  days: Day[];
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [dayId, setDayId] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setErr(null);
    try {
      await places.create(tripId, {
        name: name.trim(),
        lat: lat ? Number(lat) : null,
        lng: lng ? Number(lng) : null,
        day_id: dayId ? Number(dayId) : null,
      });
      setName("");
      setLat("");
      setLng("");
      onChanged();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "échec");
    }
  }

  return (
    <div className="card stack">
      <h3>Lieux</h3>
      <form className="stack" onSubmit={add}>
        <div>
          <label htmlFor="pn">Nom</label>
          <input id="pn" value={name} onChange={(e) => setName(e.target.value)} placeholder="Geysir" />
        </div>
        <div className="row">
          <div style={{ flex: 1 }}>
            <label htmlFor="plat">Lat</label>
            <input id="plat" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="64.3105" />
          </div>
          <div style={{ flex: 1 }}>
            <label htmlFor="plng">Lng</label>
            <input id="plng" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="-20.3029" />
          </div>
          <div style={{ flex: 1 }}>
            <label htmlFor="pday">Jour</label>
            <select id="pday" value={dayId} onChange={(e) => setDayId(e.target.value)}>
              <option value="">—</option>
              {days.map((d) => (
                <option key={d.id} value={d.id}>
                  J{d.day_number}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button type="submit">Ajouter</button>
        {err && <div className="error">{err}</div>}
      </form>
      <div className="divider" />
      <div className="list">
        {list.map((p) => (
          <div className="list-item" key={p.id}>
            <div>
              <strong>{p.name}</strong>
              <div className="muted">
                {p.lat !== null && p.lng !== null ? `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}` : "pas de coordonnées"}
              </div>
            </div>
            <button
              className="ghost"
              onClick={() => {
                if (confirm(`Supprimer « ${p.name} » ?`)) void places.remove(p.id).then(onChanged);
              }}
            >
              ✕
            </button>
          </div>
        ))}
        {list.length === 0 && <div className="muted">Aucun lieu.</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- partage
function ShareCard({
  tripId,
  share,
  onChanged,
  onFlash,
}: {
  tripId: number;
  share: Share | null;
  onChanged: () => void;
  onFlash: (m: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const url = share ? `${window.location.origin}/shared/${share.token}` : null;

  return (
    <div className="card stack">
      <h3>Partage public</h3>
      {!share ? (
        <>
          <div className="muted">Crée un lien lecture seule, sans compte.</div>
          <button
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void trips
                .share(tripId)
                .then((r) => {
                  onFlash(`Lien créé : ${r.url}`);
                  onChanged();
                })
                .catch((e: Error) => onFlash(`Erreur : ${e.message}`))
                .finally(() => setBusy(false));
            }}
          >
            {busy ? "…" : "Créer le lien"}
          </button>
        </>
      ) : (
        <>
          <a href={url!} target="_blank" rel="noreferrer">
            {url}
          </a>
          <div className="row">
            <button className="ghost" onClick={() => void navigator.clipboard?.writeText(url!)}>
              Copier
            </button>
            <label className="row" style={{ gap: 6 }}>
              <input
                type="checkbox"
                style={{ width: "auto" }}
                checked={!!share.share_map}
                onChange={(e) => void trips.patchShare(tripId, { share_map: e.target.checked ? 1 : 0 }).then(onChanged)}
              />
              <span className="muted">carte</span>
            </label>
            <label className="row" style={{ gap: 6 }}>
              <input
                type="checkbox"
                style={{ width: "auto" }}
                checked={!!share.share_photos}
                onChange={(e) => void trips.patchShare(tripId, { share_photos: e.target.checked ? 1 : 0 }).then(onChanged)}
              />
              <span className="muted">photos</span>
            </label>
            <button
              className="danger"
              onClick={() => {
                if (confirm("Révoquer le lien ?")) void trips.revokeShare(tripId).then(onChanged);
              }}
            >
              Révoquer
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- photos
function PhotosCard({
  tripId,
  shares,
  places: list,
  onChanged,
  onFlash,
}: {
  tripId: number;
  shares: PhotoShare[];
  places: Place[];
  onChanged: () => void;
  onFlash: (m: string) => void;
}) {
  const [igUrl, setIgUrl] = useState("");
  const [igLat, setIgLat] = useState("");
  const [igLng, setIgLng] = useState("");
  const [wpSearch, setWpSearch] = useState("");
  const [wpItems, setWpItems] = useState<{ id: number; url: string; alt: string | null }[]>([]);
  const [wpLat, setWpLat] = useState("");
  const [wpLng, setWpLng] = useState("");

  const geo = useMemo(
    () => (lat: string, lng: string) => ({
      lat: lat ? Number(lat) : null,
      lng: lng ? Number(lng) : null,
    }),
    [],
  );

  return (
    <div className="card stack">
      <h3>Photos partagées</h3>

      <div className="thumbs">
        {shares.map((s) => (
          <div className="thumb" key={s.id} title={s.caption ?? s.url}>
            <img src={photoUrl(s.thumbnail_url ?? s.url)} alt={s.caption ?? ""} loading="lazy" />
            <button
              className="x"
              onClick={() => {
                if (confirm("Retirer cette photo de la carte ?")) void trips.deletePhotoShare(tripId, s.id).then(onChanged);
              }}
            >
              ✕
            </button>
          </div>
        ))}
        {shares.length === 0 && <div className="muted">Aucune photo épinglée.</div>}
      </div>

      <div className="divider" />

      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (!igUrl.trim()) return;
          void trips
            .pinInstagram(tripId, { url: igUrl.trim(), ...geo(igLat, igLng) })
            .then(() => {
              onFlash("Photo Instagram épinglée.");
              setIgUrl("");
              onChanged();
            })
            .catch((e2: Error) => onFlash(`Erreur : ${e2.message}`));
        }}
      >
        <h3 style={{ margin: 0 }}>Instagram</h3>
        <input placeholder="https://www.instagram.com/p/…" value={igUrl} onChange={(e) => setIgUrl(e.target.value)} />
        <div className="row">
          <input style={{ flex: 1 }} placeholder="lat" value={igLat} onChange={(e) => setIgLat(e.target.value)} />
          <input style={{ flex: 1 }} placeholder="lng" value={igLng} onChange={(e) => setIgLng(e.target.value)} />
          <button type="submit">Épingler</button>
        </div>
        <div className="muted">Lien public uniquement (oEmbed, sans login).</div>
      </form>

      <div className="divider" />

      <div className="stack">
        <h3 style={{ margin: 0 }}>WordPress</h3>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            void trips
              .wpMedia(wpSearch || undefined)
              .then(setWpItems)
              .catch((e2: Error) => onFlash(`Erreur : ${e2.message}`));
          }}
        >
          <input style={{ flex: 1 }} placeholder="rechercher un média…" value={wpSearch} onChange={(e) => setWpSearch(e.target.value)} />
          <button type="submit">Chercher</button>
        </form>
        {wpItems.length > 0 && (
          <>
            <div className="row">
              <input style={{ flex: 1 }} placeholder="lat" value={wpLat} onChange={(e) => setWpLat(e.target.value)} />
              <input style={{ flex: 1 }} placeholder="lng" value={wpLng} onChange={(e) => setWpLng(e.target.value)} />
            </div>
            <div className="thumbs">
              {wpItems.slice(0, 18).map((m) => (
                <button
                  key={m.id}
                  className="thumb"
                  title={m.alt ?? `média ${m.id}`}
                  onClick={() =>
                    void trips
                      .pinWordPress(tripId, { media_id: m.id, ...geo(wpLat, wpLng) })
                      .then(() => {
                        onFlash("Média WordPress épinglé.");
                        onChanged();
                      })
                      .catch((e: Error) => onFlash(`Erreur : ${e.message}`))
                  }
                  style={{ padding: 0, cursor: "pointer" }}
                >
                  <img src={m.url} alt={m.alt ?? ""} loading="lazy" />
                </button>
              ))}
            </div>
          </>
        )}
        <div className="muted">Nécessite WP_SITE_URL configuré côté Worker.</div>
      </div>

      <div className="divider" />

      <div className="stack">
        <h3 style={{ margin: 0 }}>Upload</h3>
        <input
          type="file"
          accept="image/*,video/*"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const fd = new FormData();
            fd.append("file", f);
            const p = list[0];
            if (p?.lat != null && p.lng != null) {
              fd.append("lat", String(p.lat));
              fd.append("lng", String(p.lng));
            }
            void trips
              .uploadPhoto(tripId, fd)
              .then(() => {
                onFlash("Photo uploadée.");
                onChanged();
              })
              .catch((e2: Error) => onFlash(`Erreur : ${e2.message}`));
            e.target.value = "";
          }}
        />
        <div className="muted">Premier lieu géolocalisé utilisé comme position par défaut.</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- jours
function DaysCard({ tripId, days, onChanged }: { tripId: number; days: Day[]; onChanged: () => void }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="card stack">
      <h3>Jours</h3>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          setErr(null);
          void trips
            .addDay(tripId, { title: title || undefined, date: date || undefined })
            .then(() => {
              setTitle("");
              setDate("");
              onChanged();
            })
            .catch((e2: Error) => setErr(e2.message));
        }}
      >
        <input style={{ flex: 1 }} placeholder="Titre du jour" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input type="date" style={{ width: 170 }} value={date} onChange={(e) => setDate(e.target.value)} />
        <button type="submit">Ajouter</button>
      </form>
      {err && <div className="error">{err}</div>}
      <div className="list">
        {days.map((d) => (
          <div className="list-item" key={d.id}>
            <div>
              <strong>J{d.day_number}</strong> {d.title ? `· ${d.title}` : ""}
              <div className="muted">{d.date ?? "sans date"}</div>
            </div>
          </div>
        ))}
        {days.length === 0 && <div className="muted">Aucun jour.</div>}
      </div>
    </div>
  );
}