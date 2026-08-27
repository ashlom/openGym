import crypto from 'node:crypto';

const DEFAULTS = { N: 16_384, r: 8, p: 1, keylen: 32 };
const HASH_RE = /^scrypt\$(\d+)\$(\d+)\$(\d+)\$([A-Za-z0-9_-]+)\$([A-Za-z0-9_-]+)$/;

function parsePasswordHash(encoded) {
  const match = HASH_RE.exec(String(encoded || ''));
  if (!match) return null;
  const [, nRaw, rRaw, pRaw, saltRaw, hashRaw] = match;
  const N = Number(nRaw), r = Number(rRaw), p = Number(pRaw);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return null;
  if (N < 16_384 || N > 1_048_576 || (N & (N - 1)) !== 0 || r < 1 || r > 32 || p < 1 || p > 16) return null;
  try {
    const salt = Buffer.from(saltRaw, 'base64url');
    const hash = Buffer.from(hashRaw, 'base64url');
    if (salt.length < 16 || hash.length < 32 || hash.length > 64) return null;
    return { N, r, p, salt, hash };
  } catch { return null; }
}

export const isPasswordHashValid = encoded => parsePasswordHash(encoded) !== null;

export function encodePassword(password, salt = crypto.randomBytes(16)) {
  const { N, r, p, keylen } = DEFAULTS;
  const hash = crypto.scryptSync(String(password), salt, keylen, { N, r, p, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export async function verifyPassword(password, encoded) {
  const parsed = parsePasswordHash(encoded);
  if (!parsed) return false;
  return new Promise(resolve => {
    crypto.scrypt(String(password), parsed.salt, parsed.hash.length, {
      N: parsed.N, r: parsed.r, p: parsed.p, maxmem: 64 * 1024 * 1024
    }, (error, actual) => {
      if (error) return resolve(false);
      try { resolve(crypto.timingSafeEqual(actual, parsed.hash)); }
      catch { resolve(false); }
    });
  });
}

export function createAttemptLimiter({ max = 5, windowMs = 15 * 60_000, maxKeys = 10_000 } = {}) {
  const attempts = new Map();
  let writes = 0;
  const active = (key, now) => {
    const list = (attempts.get(key) || []).filter(ts => ts > now - windowMs);
    if (list.length) attempts.set(key, list); else attempts.delete(key);
    return list;
  };
  return {
    retryAfter(key, now = Date.now()) {
      const list = active(key, now);
      if (list.length < max) return 0;
      return Math.max(1, Math.ceil((list[0] + windowMs - now) / 1000));
    },
    fail(key, now = Date.now()) {
      if (++writes % 100 === 0) {
        for (const candidate of attempts.keys()) active(candidate, now);
      }
      const list = active(key, now);
      if (!attempts.has(key) && attempts.size >= maxKeys) {
        attempts.delete(attempts.keys().next().value);
      }
      list.push(now);
      attempts.set(key, list);
    },
    clear(key) { attempts.delete(key); },
    size() { return attempts.size; }
  };
}
