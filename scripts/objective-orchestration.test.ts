import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const setupUrl = new URL('./setup-trueforge.ts', import.meta.url);

test('golden mission requires reproduction before a verified fix', async () => {
  const source = await readFile(setupUrl, 'utf8');
  assert.match(source, /CONTEXT, REQUIREMENTS, VERIFY, ACTION/);
  assert.match(source, /targeted reproduction fails before the patch/);
  assert.match(source, /broader regression suite still passes after the patch/);
  assert.match(source, /branch\+PR will be created without merging/);
});

test('publication remains approval gated', async () => {
  const source = await readFile(setupUrl, 'utf8');
  assert.match(source, /requireApprovalForTools: \['publish_verified_fix'\]/);
});
