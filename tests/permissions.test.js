const helpers = require('../server_helpers');

beforeAll(async () => {
  await helpers.initDb();
});

afterAll(async () => {
  await helpers.closeDb();
});

test('create and list permission and delete by scope', async () => {
  // ensure no leftover
  const before = await helpers.listPermissions();
  const p = await helpers.createPermission({ resource: 'test-res', action: 'create', role: 'EDITOR', allow: 1 });
  expect(p).toBeTruthy();
  const after = await helpers.listPermissions();
  const found = after.find(x => x.id === p.id);
  expect(found).toBeTruthy();
  // isAllowedFor should reflect role-based allow (EDITOR on test-res create)
  const ok = await helpers.isAllowedFor(null, 'EDITOR', 'test-res', 'create');
  expect(ok).toBe(true);
  // delete role-based perms
  const del = await helpers.deletePermissionsFor('test-res', 'create', 'role');
  expect(del.deleted).toBeGreaterThanOrEqual(1);
});

test('oauth account link and find', async () => {
  const u = await helpers.createUser('permtest@example.com', 'hash', 'EDITOR', 'Perm Test');
  const link = await helpers.linkOAuthAccount('github', 'prov-12345', u.id);
  expect(link).toBeTruthy();
  const found = await helpers.findUserByProvider('github', 'prov-12345');
  expect(found).toBe(u.id);
});
