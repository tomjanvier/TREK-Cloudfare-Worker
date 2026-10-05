import { describe, expect, it } from "vitest";
import { newShareToken } from "../src/db/client";
import { clampLatLng, decodeCursor, encodeCursor } from "../src/lib/http";
import { parseInstagramUrl } from "../src/photos/instagram";
import { instaPinSchema, placeCreateSchema, sharePatchSchema, tripCreateSchema } from "../src/lib/validate";

describe("parseInstagramUrl", () => {
  it("accepte /p/, /reel/ et /reels/", () => {
    expect(parseInstagramUrl("https://www.instagram.com/p/ABC123xyz/")).toBe("ABC123xyz");
    expect(parseInstagramUrl("https://instagram.com/reel/XYZ-12_3")).toBe("XYZ-12_3");
    expect(parseInstagramUrl("https://www.instagram.com/reels/AbC_9-x/")).toBe("AbC_9-x");
  });
  it("rejette les autres URLs", () => {
    expect(parseInstagramUrl("https://example.com/p/ABC")).toBeNull();
    expect(parseInstagramUrl("https://www.instagram.com/stories/x/123")).toBeNull();
    expect(parseInstagramUrl("not a url")).toBeNull();
  });
});

describe("newShareToken", () => {
  it("génère des tokens base64url uniques de 32 caractères (24 octets)", () => {
    const a = newShareToken();
    const b = newShareToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(a).not.toBe(b);
  });
});

describe("curseurs keyset", () => {
  it("roundtrip encode/decode", () => {
    const cur = encodeCursor("2026-10-05T12:00:00.000Z", 42);
    expect(decodeCursor(cur)).toEqual({ t: "2026-10-05T12:00:00.000Z", id: 42 });
  });
  it("rejette les curseurs invalides", () => {
    expect(decodeCursor(null)).toBeNull();
    expect(decodeCursor("!!!")).toBeNull();
    expect(decodeCursor(Buffer.from("{}").toString("base64url"))).toBeNull();
  });
});

describe("clampLatLng", () => {
  it("accepte null et valeurs valides", () => {
    expect(clampLatLng(null, null)).toEqual({ lat: null, lng: null });
    expect(clampLatLng(48.85, 2.35)).toEqual({ lat: 48.85, lng: 2.35 });
  });
  it("rejette hors bornes", () => {
    expect(clampLatLng(91, 0)).toEqual({ error: "bad_latlng" });
    expect(clampLatLng(0, 181)).toEqual({ error: "bad_latlng" });
    expect(clampLatLng("abc", 0)).toEqual({ error: "bad_latlng" });
  });
});

describe("schemas zod", () => {
  it("tripCreate exige un titre, days_count plafonné", () => {
    expect(tripCreateSchema.safeParse({ title: "Islande" }).success).toBe(true);
    expect(tripCreateSchema.safeParse({ title: "  " }).success).toBe(false);
    expect(tripCreateSchema.safeParse({ title: "X", days_count: 61 }).success).toBe(false);
  });
  it("placeCreate borne lat/lng", () => {
    expect(placeCreateSchema.safeParse({ name: "Reykjavik", lat: 64.1, lng: -21.9 }).success).toBe(true);
    expect(placeCreateSchema.safeParse({ name: "X", lat: 91 }).success).toBe(false);
  });
  it("instaPin exige une url (le format est vérifié route-side)", () => {
    expect(instaPinSchema.safeParse({ url: "https://www.instagram.com/p/A/" }).success).toBe(true);
    expect(instaPinSchema.safeParse({}).success).toBe(false);
  });
  it("sharePatch borne les flags", () => {
    expect(sharePatchSchema.safeParse({ share_map: 0 }).success).toBe(true);
    expect(sharePatchSchema.safeParse({ share_map: 2 }).success).toBe(false);
  });
});
