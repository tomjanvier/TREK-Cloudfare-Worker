import { Hono } from "hono";
import type { Env } from "../env";
import { requireAuth } from "../auth";
import { assertTripAccess, getDay, getPlace } from "../db/client";
import { tripFromPlace, userIdOf } from "../lib/access";
import { err, readJson } from "../lib/http";
import { notifyTrip } from "../lib/notify";
import { fmtIssues, placeCreateSchema, placePatchSchema } from "../lib/validate";

/** Opérations collection imbriquées sous /api/trips/:id/places (compat client d'origine). */
export const placesNested = new Hono<{ Bindings: Env }>();

placesNested.get("/:id/places", requireAuth, async (c) => {
  const tripId = Number(c.req.param("id"));
  const trip = await assertTripAccess(c.env.DB, tripId, userIdOf(c));
  if (!trip) return err(c, "not_found", 404);
  const { results } = await c.env.DB.prepare("SELECT * FROM places WHERE trip_id = ? ORDER BY id").bind(tripId).all();
  return c.json({ places: results });
});

placesNested.post("/:id/places", requireAuth, async (c) => {
  const tripId = Number(c.req.param("id"));
  const trip = await assertTripAccess(c.env.DB, tripId, userIdOf(c));
  if (!trip) return err(c, "not_found", 404);
  const parsed = placeCreateSchema.safeParse(await readJson(c));
  if (!parsed.success) return err(c, "bad_request", 400, { issues: fmtIssues(parsed.error) });
  const b = parsed.data;
  if (b.day_id !== undefined && b.day_id !== null) {
    const day = await getDay(c.env.DB, b.day_id);
    if (!day || day.trip_id !== tripId) return err(c, "bad_day_id", 400);
  }
  const res = await c.env.DB.prepare(
    "INSERT INTO places (trip_id, day_id, name, lat, lng, address, category, notes, image_url, website) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(tripId, b.day_id ?? null, b.name, b.lat ?? null, b.lng ?? null, b.address ?? null, b.category ?? null, b.notes ?? null, b.image_url ?? null, b.website ?? null)
    .run();
  const place = await getPlace(c.env.DB, Number(res.meta.last_row_id));
  notifyTrip(c, tripId, { type: "place.created", tripId, place });
  return c.json({ place }, 200);
});

/** Opérations membre sous /api/places/:placeId. */
export const placesApi = new Hono<{ Bindings: Env }>();

placesApi.get("/:placeId", requireAuth, async (c) => {
  const resolved = await tripFromPlace(c.env.DB, Number(c.req.param("placeId")), userIdOf(c));
  if (!resolved) return err(c, "not_found", 404);
  return c.json({ place: await getPlace(c.env.DB, resolved.placeId) });
});

placesApi.patch("/:placeId", requireAuth, async (c) => {
  const placeId = Number(c.req.param("placeId"));
  const resolved = await tripFromPlace(c.env.DB, placeId, userIdOf(c));
  if (!resolved) return err(c, "not_found", 404);
  const parsed = placePatchSchema.safeParse(await readJson(c));
  if (!parsed.success) return err(c, "bad_request", 400, { issues: fmtIssues(parsed.error) });
  const b = parsed.data;
  if (b.day_id !== undefined && b.day_id !== null) {
    const day = await getDay(c.env.DB, b.day_id);
    if (!day || day.trip_id !== resolved.trip.id) return err(c, "bad_day_id", 400);
  }
  const sets: string[] = [];
  const binds: (string | number | null)[] = [];
  const push = (col: string, v: string | number | null | undefined) => {
    if (v !== undefined) {
      sets.push(`${col} = ?`);
      binds.push(v);
    }
  };
  push("name", b.name);
  push("day_id", b.day_id);
  push("lat", b.lat);
  push("lng", b.lng);
  push("address", b.address ?? undefined);
  push("category", b.category ?? undefined);
  push("notes", b.notes ?? undefined);
  push("image_url", b.image_url ?? undefined);
  push("website", b.website ?? undefined);
  if (!sets.length) return err(c, "bad_request", 400);
  sets.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')");
  await c.env.DB.prepare(`UPDATE places SET ${sets.join(", ")} WHERE id = ?`).bind(...binds, placeId).run();
  const place = await getPlace(c.env.DB, placeId);
  notifyTrip(c, resolved.trip.id, { type: "place.updated", tripId: resolved.trip.id, place });
  return c.json({ place });
});

placesApi.delete("/:placeId", requireAuth, async (c) => {
  const placeId = Number(c.req.param("placeId"));
  const resolved = await tripFromPlace(c.env.DB, placeId, userIdOf(c));
  if (!resolved) return err(c, "not_found", 404);
  // FK : photos.place_id et photo_shares.place_id passent à NULL.
  await c.env.DB.prepare("DELETE FROM places WHERE id = ?").bind(placeId).run();
  notifyTrip(c, resolved.trip.id, { type: "place.deleted", tripId: resolved.trip.id, placeId });
  return c.json({ ok: true });
});
