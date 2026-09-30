import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyDiscount, total } from '../src/prices.js';

test('takes ten percent off', () => {
  assert.equal(applyDiscount(1000, 10), 900);
});

test('rounds half a cent up', () => {
  assert.equal(applyDiscount(995, 10), 896);
});

test('totals the lines', () => {
  assert.equal(total([{ cents: 250, qty: 2 }, { cents: 100, qty: 1 }]), 600);
});
