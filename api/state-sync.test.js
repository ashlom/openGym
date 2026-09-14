import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptedState, incomingStateIsStale } from './state-sync.js';

test('rejects an incoming state based on an older revision', () => {
  assert.equal(incomingStateIsStale({ _rev: 2, _ts: 200 }, { _rev: 1, _ts: 999999 }), true);
});

test('accepts one write based on the current revision', () => {
  assert.equal(incomingStateIsStale({ _rev: 2, _ts: 200 }, { _rev: 2, _ts: 100 }), false);
});

test('supports a revisionless old client only when its timestamp is current', () => {
  assert.equal(incomingStateIsStale({ _rev: 2, _ts: 200 }, { _ts: 100 }), true);
  assert.equal(incomingStateIsStale({ _rev: 2, _ts: 200 }, { _ts: 300 }), false);
});

test('uses timestamp ordering for legacy canonical state', () => {
  assert.equal(incomingStateIsStale({ _ts: 200 }, { _ts: 100 }), true);
  assert.equal(incomingStateIsStale({ _ts: 100 }, { _ts: 200 }), false);
  assert.equal(incomingStateIsStale(null, { _ts: 100 }), false);
});

test('stamps accepted state with server time and the next revision', () => {
  assert.deepEqual(acceptedState({ _rev: 4, _ts: 200 }, { _rev: 4, _ts: 999999, routines: [] }, 300), {
    _rev: 5, _ts: 300, routines: [],
  });
  assert.equal(acceptedState({ _ts: 100 }, { routines: [] }, 200)._rev, 1);
});
