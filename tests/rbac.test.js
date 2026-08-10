const { isAllowed } = require('../lib/rbac');

test('ADMIN allowed for any role', () => {
  expect(isAllowed('ADMIN', 'EDITOR')).toBe(true);
  expect(isAllowed('ADMIN', ['EDITOR', 'VIEWER'])).toBe(true);
});

test('EDITOR allowed for EDITOR', () => {
  expect(isAllowed('EDITOR', 'EDITOR')).toBe(true);
});

test('EDITOR not allowed for ADMIN', () => {
  expect(isAllowed('EDITOR', 'ADMIN')).toBe(false);
});

test('array of allowed roles works', () => {
  expect(isAllowed('EDITOR', ['VIEWER', 'EDITOR'])).toBe(true);
  expect(isAllowed('VIEWER', ['EDITOR', 'ADMIN'])).toBe(false);
});
