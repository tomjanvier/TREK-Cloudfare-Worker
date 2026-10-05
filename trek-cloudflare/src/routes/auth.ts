import { Hono } from "hono";
import type { Env } from "../env";
import { requireAuth, signSession, type SessionUser } from "../auth";
import { clientIp, err, readJson, type AppContext } from "../lib/http";
import { rateLimit } from "../lib/ratelimit";
import { fmtIssues, loginSchema, registerSchema } from "../lib/validate";

const enc = new TextEncoder();

async function hashPassword(password: string, saltHex: string): Promise<string> {
  const salt = Uint8Array.from(saltHex.match(/../g)!.map((h) => parseInt(h, 16)));
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: 100_000 }, // max supporté par WebCrypto Workers
    key,
    256,
  );
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function newSalt(): string {
  return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.min(x.length, y.length); i++) diff |= x[i]! ^ y[i]!;
  return diff === 0;
}

const auth = new Hono<{ Bindings: Env }>();

async function checkRate(c: AppContext, scope: string): Promise<Response | null> {
  const r = await rateLimit(c.env, `auth-${scope}:${clientIp(c)}`, 10, 60);
  if (!r.ok) {
    return c.json({ error: "rate_limited" }, 429, { "Retry-After": String(r.retryAfter) });
  }
  return null;
}

auth.post("/register", async (c) => {
  const limited = await checkRate(c, "register");
  if (limited) return limited;
  const parsed = registerSchema.safeParse(await readJson(c));
  if (!parsed.success) return err(c, "bad_request", 400, { issues: fmtIssues(parsed.error) });
  const { username, email, password } = parsed.data;
  const salt = newSalt();
  const password_hash = `${salt}$${await hashPassword(password, salt)}`;
  try {
    const res = await c.env.DB.prepare("INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)")
      .bind(username, email, password_hash)
      .run();
    const user: SessionUser = { id: Number(res.meta.last_row_id), username, email, role: "user" };
    const token = await signSession(c.env.JWT_SECRET, user);
    return c.json({ user, token }, 200, {
      "Set-Cookie": `trek_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`,
    });
  } catch {
    return err(c, "username_or_email_taken", 409);
  }
});

auth.post("/login", async (c) => {
  const limited = await checkRate(c, "login");
  if (limited) return limited;
  const parsed = loginSchema.safeParse(await readJson(c));
  if (!parsed.success) return err(c, "bad_request", 400, { issues: fmtIssues(parsed.error) });
  const { login, password } = parsed.data;
  const low = login.toLowerCase();
  const row = await c.env.DB.prepare("SELECT * FROM users WHERE lower(username) = ? OR lower(email) = ?")
    .bind(low, low)
    .first<{ id: number; username: string; email: string; role: string; password_hash: string }>();
  if (!row) return err(c, "invalid_credentials", 401);
  const [salt, expected] = row.password_hash.split("$");
  if (!salt || !expected || !timingSafeEqual(await hashPassword(password, salt), expected)) {
    return err(c, "invalid_credentials", 401);
  }
  const user: SessionUser = { id: row.id, username: row.username, email: row.email, role: row.role };
  const token = await signSession(c.env.JWT_SECRET, user);
  return c.json({ user, token }, 200, {
    "Set-Cookie": `trek_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`,
  });
});

auth.post("/logout", (c) =>
  c.json({ ok: true }, 200, { "Set-Cookie": "trek_session=; Path=/; HttpOnly; Max-Age=0" }),
);

auth.get("/me", requireAuth, (c) => c.json({ user: c.get("user") }));

export default auth;
