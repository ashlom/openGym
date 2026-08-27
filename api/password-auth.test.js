import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createAttemptLimiter, encodePassword, parsePasswordUsers, verifyPassword } from './password-auth.js';

test('password hashes verify the right password and reject the wrong one', async () => {
  const encoded = encodePassword('correct horse battery staple', Buffer.alloc(16, 7));
  assert.equal(await verifyPassword('correct horse battery staple', encoded), true);
  assert.equal(await verifyPassword('wrong password', encoded), false);
});

test('malformed password hashes fail closed', async () => {
  assert.equal(await verifyPassword('anything', ''), false);
  assert.equal(await verifyPassword('anything', 'scrypt$bad'), false);
  assert.equal(await verifyPassword('anything', 'scrypt$16384$8$1$%%%$%%%'), false);
});

test('encoded hashes use scrypt parameters and never contain the password', () => {
  const encoded = encodePassword('super-secret', Buffer.alloc(16, 9));
  assert.match(encoded, /^scrypt\$16384\$8\$1\$/);
  assert.equal(encoded.includes('super-secret'), false);
  const [, n, r, p, salt, hash] = encoded.split('$');
  assert.equal(Number(n), 16384);
  assert.equal(Number(r), 8);
  assert.equal(Number(p), 1);
  assert.equal(Buffer.from(salt, 'base64url').length, 16);
  assert.equal(Buffer.from(hash, 'base64url').length, 32);
  assert.doesNotThrow(() => crypto.timingSafeEqual(Buffer.from(hash, 'base64url'), Buffer.alloc(32)));
});

test('multi-user password config validates and normalizes accounts', () => {
  const hash = encodePassword('rafa', Buffer.alloc(16, 3));
  const users = parsePasswordUsers(JSON.stringify([
    { username: ' Rafa ', hash, uid: 'existing-rafa', name: 'Rafa', admin: true },
    { username: 'FER', hash, uid: 'fer', name: 'Fer' },
  ]));
  assert.deepEqual(users.map(({ username, uid, name, admin }) => ({ username, uid, name, admin })), [
    { username: 'rafa', uid: 'existing-rafa', name: 'Rafa', admin: true },
    { username: 'fer', uid: 'fer', name: 'Fer', admin: false },
  ]);
});

test('multi-user password config rejects invalid or duplicate accounts', () => {
  const hash = encodePassword('rafa', Buffer.alloc(16, 4));
  assert.throws(() => parsePasswordUsers('{bad json'));
  assert.throws(() => parsePasswordUsers(JSON.stringify([{ username: 'rafa', hash: 'bad', uid: 'rafa' }])));
  assert.throws(() => parsePasswordUsers(JSON.stringify([
    { username: 'Rafa', hash, uid: 'rafa' },
    { username: 'rafa', hash, uid: 'other' },
  ])));
});

test('attempt limiter blocks after five failures and clears after success', () => {
  const limiter = createAttemptLimiter({ max: 5, windowMs: 60_000 });
  const now = 1_000_000;
  for (let i = 0; i < 5; i++) {
    assert.equal(limiter.retryAfter('client', now), 0);
    limiter.fail('client', now);
  }
  assert.equal(limiter.retryAfter('client', now), 60);
  limiter.clear('client');
  assert.equal(limiter.retryAfter('client', now), 0);
});

test('attempt limiter forgets failures outside the window', () => {
  const limiter = createAttemptLimiter({ max: 2, windowMs: 10_000 });
  limiter.fail('client', 1000);
  limiter.fail('client', 2000);
  assert.equal(limiter.retryAfter('client', 2000), 9);
  assert.equal(limiter.retryAfter('client', 12_001), 0);
});

test('attempt limiter caps stored client keys', () => {
  const limiter = createAttemptLimiter({ max: 5, windowMs: 60_000, maxKeys: 3 });
  for (let i = 0; i < 20; i++) limiter.fail(`client-${i}`, 1000);
  assert.equal(limiter.size() <= 3, true);
});
