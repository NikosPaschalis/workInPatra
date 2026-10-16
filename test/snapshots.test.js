import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { CATEGORY_DEFINITIONS } from '../categories.js';

const snapshotDir = path.resolve('data/snapshots');
const categoryIds = CATEGORY_DEFINITIONS.map(({ id }) => id);
const files = readdirSync(snapshotDir).filter(name => /^\d{4}-\d{2}\.json$/.test(name)).sort();

test('historical snapshots use the canonical category schema and reconcile totals', () => {
  assert.ok(files.length > 0, 'at least one historical snapshot should exist');
  for (const file of files) {
    const snapshot = JSON.parse(readFileSync(path.join(snapshotDir, file), 'utf8'));
    assert.deepEqual(Object.keys(snapshot.byCategory), categoryIds, file + ' category keys/order');
    assert.ok(!Object.hasOwn(snapshot.byCategory, 'retail'), file + ' should map retail to sales');
    assert.equal(Object.values(snapshot.byCategory).reduce((sum, count) => sum + count, 0), snapshot.total, file + ' category total');
    assert.equal(Object.values(snapshot.bySource).reduce((sum, count) => sum + count, 0), snapshot.total, file + ' source total');
    assert.equal(snapshot.snapshotType, 'active_inventory', file + ' measurement type');
  }
});

test('snapshot manifest lists every historical snapshot in chronological order', () => {
  const manifest = JSON.parse(readFileSync(path.join(snapshotDir, 'index.json'), 'utf8'));
  assert.deepEqual(manifest.snapshots.map(item => item.file), files);
  assert.deepEqual(manifest.snapshots.map(item => item.month), files.map(file => file.slice(0, 7)));
  assert.equal(manifest.snapshotType, 'active_inventory');
});
