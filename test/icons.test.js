import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ICONS } from '../icons.js';

// A missing icon fails silently in the page (it just doesn't show), so check every name app.js uses.
test('every icon used by the app is in icons.js', () => {
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  const names = new Set([
    ...[...app.matchAll(/icon\(\s*'([\w-]+)'/g)].map(m => m[1]),                  // icon('name')
    ...[...app.matchAll(/\bicon: '([\w-]+)'/g)].map(m => m[1]),                    // { icon: 'name' }
    ...[...app.matchAll(/'([\w-]+)'\s*:\s*'([\w-]+)'\)/g)].flatMap(m => [m[1], m[2]]), // icon(cond ? 'a' : 'b')
  ]);
  const missing = [...names].filter(n => !ICONS[n]);
  assert.deepEqual(missing, []);
  assert.ok(names.size > 25, `found ${names.size} icon names`);
});
