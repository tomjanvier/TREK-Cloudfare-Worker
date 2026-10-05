import type { Next } from "hono";
import type { D1Database } from "@cloudflare/workers-types";
import type { AppContext } from "./http";

const MAX_STORED_BYTES = 8192;
const TTL_SEC = 24 * 3600;

interface IdemRow {
  status: number;
  body: string;
}

/**
 * Rejeu `X-Idempotency-Key` (le client offline-first renvoie ses mutations
 * avec cette clé : un retry réseau ne doit jamais double-appliquer).
 * Portage allégé de l'intercepteur Nest d'origine : D1 au lieu de mémoire.
 */
export async function idempotency(c: AppContext, next: Next): Promise<Response | void> {
  const key = c.req.header("x-idempotency-key")?.trim();
  const user = c.get("user");
  if (!key || !user || key.length > 128 || !["POST", "PATCH", "DELETE"].includes(c.req.method)) {
    return next();
  }
  const db: D1Database = c.env.DB;
  const hit = await db
    .prepare("SELECT status, body FROM idempotency_keys WHERE key = ? AND user_id = ? AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')")
    .bind(key, user.id)
    .first<IdemRow>()
    .catch(() => null);
  if (hit) {
    return new Response(hit.body, {
      status: hit.status as 200,
      headers: { "content-type": "application/json", "x-idempotent-replay": "true" },
    });
  }
  await next();
  const res = c.res;
  const ct = res.headers.get("content-type") ?? "";
  if (res.ok && ct.includes("application/json")) {
    const clone = res.clone();
    c.executionCtx.waitUntil(
      (async () => {
        const text = await clone.text().catch(() => "");
        if (!text || text.length > MAX_STORED_BYTES) return;
        await db
          .prepare(
            `INSERT INTO idempotency_keys (key, user_id, status, body, expires_at)
             VALUES (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now', '+1 day'))
             ON CONFLICT(key) DO NOTHING`,
          )
          .bind(key, user.id, res.status, text)
          .run()
          .catch(() => null);
        // Ménage paresseux des clés expirées.
        await db.prepare("DELETE FROM idempotency_keys WHERE expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now')").run().catch(() => null);
      })(),
    );
  }
}
