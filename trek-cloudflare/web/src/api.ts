/**
 * Client API typé — parle exactement aux routes du Worker (src/routes/*).
 * Aucune dépendance : fetch natif + token JWT en localStorage (le cookie
 * httpOnly est posé par le Worker, le Bearer sert au reload).
 */

export interface User {
  id: number;
  username: string;
  email: string;
  role: string;
}

export interface Trip {
  id: number;
  user_id: number;
  title: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  currency: string;
  cover_image: string | null;
  is_archived: number;
  created_at: string;
  updated_at: string;
  places_count?: number;
  photos_count?: number;
}

export interface Day {
  id: number;
  trip_id: number;
  day_number: number;
  date: string | null;
  title: string | null;
  notes: string | null;
}

export interface Place {
  id: number;
  trip_id: number;
  day_id: number | null;
  name: string;
  description: string | null;
  lat: number | null;
  lng: number | null;
  address: string | null;
  category: string | null;
  notes: string | null;
  image_url: string | null;
  website: string | null;
}

export type Source = "upload" | "instagram" | "wordpress";

export interface PhotoShare {
  id: number;
  trip_id?: number;
  place_id: number | null;
  source: Source;
  url: string;
  thumbnail_url: string | null;
  caption: string | null;
  lat: number | null;
  lng: number | null;
  author: string | null;
  taken_at: string | null;
}

export interface Share {
  token: string;
  share_map: number;
  share_photos: number;
  expires_at: string | null;
}

export interface MapPhotoFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    id: number;
    source: Source;
    url: string;
    thumbnail: string | null;
    caption: string | null;
    author: string | null;
    place_id: number | null;
  };
}

export interface WpMedia {
  id: number;
  url: string;
  alt: string | null;
  date: string | null;
  mime: string | null;
}

const TOKEN_KEY = "trek_token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* stockage indisponible */
  }
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(method: string, path: string, body?: unknown, opts: { raw?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(path, { method, headers, body: payload, credentials: "include" });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : undefined;
  if (!res.ok) {
    const msg =
      (data as { error?: string } | undefined)?.error ??
      (typeof data === "string" ? data.slice(0, 120) : `HTTP ${res.status}`);
    throw new ApiError(res.status, msg);
  }
  if (opts.raw) return data as T;
  return data as T;
}

// ---------- auth ----------
export const auth = {
  register: (b: { email: string; password: string; username?: string }) =>
    request<{ user: User; token: string }>("POST", "/api/auth/register", b).then((r) => {
      setToken(r.token);
      return r.user;
    }),
  login: (b: { email: string; password: string; remember_me?: boolean }) =>
    request<{ user: User; token: string }>("POST", "/api/auth/login", b).then((r) => {
      setToken(r.token);
      return r.user;
    }),
  me: () => request<{ user: User }>("GET", "/api/auth/me").then((r) => r.user),
  logout: () => request<{ ok: true }>("POST", "/api/auth/logout").then(() => setToken(null)),
};

// ---------- trips ----------
export const trips = {
  list: (cursor?: string) =>
    request<{ trips: Trip[]; nextCursor: string | null }>("GET", `/api/trips${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`),
  create: (b: { title: string; description?: string; start_date?: string; end_date?: string; days_count?: number }) =>
    request<{ trip: Trip }>("POST", "/api/trips", b).then((r) => r.trip),
  detail: (id: number) =>
    request<{ trip: Trip; days: Day[]; places: Place[]; photo_shares_count: number; share: Share | null }>("GET", `/api/trips/${id}`),
  update: (id: number, b: Partial<{ title: string; description: string; start_date: string; end_date: string; is_archived: number }>) =>
    request<{ trip: Trip }>("PATCH", `/api/trips/${id}`, b).then((r) => r.trip),
  remove: (id: number) => request<{ ok: true }>("DELETE", `/api/trips/${id}`),
  days: (id: number) => request<{ days: Day[] }>("GET", `/api/trips/${id}/days`).then((r) => r.days),
  addDay: (id: number, b: { title?: string; date?: string }) => request<{ day: Day }>("POST", `/api/trips/${id}/days`, b).then((r) => r.day),
  mapPhotos: (id: number, shareToken?: string, sources?: string[]) => {
    const p = new URLSearchParams();
    if (sources?.length) p.set("sources", sources.join(","));
    if (shareToken) p.set("share", shareToken);
    const q = p.toString();
    return request<{ type: string; features: MapPhotoFeature[] }>("GET", `/api/trips/${id}/map-photos${q ? `?${q}` : ""}`);
  },
  weather: (id: number) =>
    request<{ centroid: { lat: number; lng: number }; start: string; end: string; daily: Record<string, (number | string | null)[]> }>(
      "GET",
      `/api/trips/${id}/weather`,
    ),
  // ---------- partage ----------
  share: (id: number) => request<Share & { url: string }>("POST", `/api/trips/${id}/share`),
  shareInfo: (id: number) => request<{ share: Share }>("GET", `/api/trips/${id}/share`).then((r) => r.share),
  patchShare: (id: number, b: { share_map?: number; share_photos?: number; expires_at?: string | null }) =>
    request<{ share: Share }>("PATCH", `/api/trips/${id}/share`, b).then((r) => r.share),
  revokeShare: (id: number) => request<{ ok: true }>("DELETE", `/api/trips/${id}/share`),
  // ---------- photos ----------
  photoShares: (id: number, source?: Source) =>
    request<{ photo_shares: PhotoShare[] }>("GET", `/api/trips/${id}/photo-shares${source ? `?source=${source}` : ""}`).then(
      (r) => r.photo_shares,
    ),
  deletePhotoShare: (id: number, shareId: number) => request<{ ok: true }>("DELETE", `/api/trips/${id}/photo-shares/${shareId}`),
  uploadPhoto: (id: number, form: FormData) =>
    request<{ id: number; url: string }>("POST", `/api/trips/${id}/photos`, form).then((r) => r.id),
  deletePhoto: (id: number, photoId: number) => request<{ ok: true }>("DELETE", `/api/trips/${id}/photos/${photoId}`),
  // ---------- photos externes ----------
  previewInstagram: (url: string) =>
    request<{ embed: { thumbnail_url: string | null; title: string | null; author_name: string | null }; cached: boolean }>(
      "GET",
      `/api/photos/instagram/preview?url=${encodeURIComponent(url)}`,
    ),
  pinInstagram: (id: number, b: { url: string; lat?: number | null; lng?: number | null; caption?: string; place_id?: number | null }) =>
    request<{ id: number }>("POST", `/api/trips/${id}/photos/instagram`, b).then((r) => r.id),
  wpMedia: (search?: string) =>
    request<{ media: WpMedia[] }>("GET", `/api/photos/wordpress/media${search ? `?search=${encodeURIComponent(search)}` : ""}`).then(
      (r) => r.media,
    ),
  pinWordPress: (id: number, b: { media_id: number; lat?: number | null; lng?: number | null }) =>
    request<{ id: number }>("POST", `/api/trips/${id}/photos/wordpress`, b).then((r) => r.id),
};

// ---------- lieux ----------
export const places = {
  list: (tripId: number, q?: { search?: string; day_id?: number }) => {
    const p = new URLSearchParams();
    if (q?.search) p.set("search", q.search);
    if (q?.day_id) p.set("day_id", String(q.day_id));
    const s = p.toString();
    return request<{ places: Place[] }>("GET", `/api/trips/${tripId}/places${s ? `?${s}` : ""}`).then((r) => r.places);
  },
  create: (tripId: number, b: { name: string; lat?: number | null; lng?: number | null; address?: string; day_id?: number | null; notes?: string }) =>
    request<{ place: Place }>("POST", `/api/trips/${tripId}/places`, b).then((r) => r.place),
  update: (placeId: number, b: Partial<{ name: string; lat: number | null; lng: number | null; day_id: number | null; notes: string }>) =>
    request<{ place: Place }>("PATCH", `/api/places/${placeId}`, b).then((r) => r.place),
  remove: (placeId: number) => request<{ ok: true }>("DELETE", `/api/places/${placeId}`),
};

// ---------- page publique ----------
export const shared = {
  get: (token: string) =>
    request<{
      trip: Pick<Trip, "id" | "title" | "description" | "start_date" | "end_date" | "cover_image">;
      places: Place[];
      photo_shares: PhotoShare[];
      permissions: { share_map: boolean; share_photos: boolean };
    }>("GET", `/api/shared/${token}`),
};

/** URL d'une photo : les chemins /api/... passent par la capability du lien public. */
export function photoUrl(url: string, shareToken?: string): string {
  if (shareToken && url.startsWith("/api/")) return `${url}${url.includes("?") ? "&" : "?"}share=${encodeURIComponent(shareToken)}`;
  return url;
}