import test from 'node:test';
import assert from 'node:assert/strict';
import { STATES, DEFAULT_COLORS, rms, levelFromBytes, stepSpring, blendParams, parseColor, resolveColors } from '../orb.js';

const close = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('rms of silence is zero and of a full-scale square wave is one', () => {
  assert.equal(rms([]), 0);
  assert.equal(rms([0, 0, 0]), 0);
  assert.equal(rms([1, -1, 1, -1]), 1);
  close(rms([0.5, -0.5]), 0.5);
});

test('levelFromBytes treats 128 as silence and clamps to 1', () => {
  assert.equal(levelFromBytes(new Uint8Array([128, 128, 128])), 0);
  close(levelFromBytes(new Uint8Array([160, 96, 160, 96]), 1), 0.25);
  close(levelFromBytes(new Uint8Array([160, 96, 160, 96])), 1);
  assert.equal(levelFromBytes(new Uint8Array([255, 0, 255, 0])), 1);
  assert.equal(levelFromBytes(new Uint8Array([])), 0);
});

test('stepSpring settles on the target within a second without overshooting', () => {
  let s = { x: 0, v: 0 };
  let peak = 0;
  for (let i = 0; i < 60; i++) {
    s = stepSpring(s, 1, 1 / 60);
    peak = Math.max(peak, s.x);
  }
  close(s.x, 1, 0.01);
  assert.ok(peak < 1.01, `peak ${peak}`);
});

test('stepSpring keeps velocity, so a new target mid-flight stays smooth', () => {
  let s = { x: 0, v: 0 };
  for (let i = 0; i < 5; i++) s = stepSpring(s, 1, 1 / 60);
  assert.ok(s.v > 0);
  const next = stepSpring(s, 0, 1 / 60);
  assert.ok(next.x > s.x, 'still moving up on the first frame after the target drops');
});

test('blendParams lerps numbers and arrays and clamps t', () => {
  const from = { speed: 0, c1: [0, 0, 0] };
  const to = { speed: 2, c1: [1, 0.5, 0] };
  assert.deepEqual(blendParams(from, to, 0.5), { speed: 1, c1: [0.5, 0.25, 0] });
  assert.deepEqual(blendParams(from, to, 2), to);
  assert.deepEqual(blendParams(from, to, -1), from);
});

test('parseColor reads 3 and 6 digit hex and rejects anything else', () => {
  assert.deepEqual(parseColor('#ffffff'), [1, 1, 1]);
  assert.deepEqual(parseColor('000'), [0, 0, 0]);
  const [r, g, b] = parseColor('#4c8dff');
  close(r, 76 / 255);
  close(g, 141 / 255);
  close(b, 1);
  assert.deepEqual(parseColor('#f80'), parseColor('#ff8800'));
  assert.throws(() => parseColor('blue'), TypeError);
  assert.throws(() => parseColor('#12345'), TypeError);
});

test('resolveColors applies an array to every state and merges an object over the defaults', () => {
  const all = resolveColors(['#111111', '#222222']);
  for (const state of Object.keys(STATES)) assert.deepEqual(all[state], ['#111111', '#222222']);
  const some = resolveColors({ speaking: ['#000000', '#ffffff'] });
  assert.deepEqual(some.speaking, ['#000000', '#ffffff']);
  assert.deepEqual(some.idle, DEFAULT_COLORS.idle);
  assert.deepEqual(resolveColors(undefined), DEFAULT_COLORS);
});

test('every state defines the same motion keys', () => {
  const keys = Object.keys(STATES.idle).sort().join();
  for (const s of Object.values(STATES)) assert.equal(Object.keys(s).sort().join(), keys);
  assert.deepEqual(Object.keys(STATES), ['idle', 'listening', 'thinking', 'speaking']);
});
