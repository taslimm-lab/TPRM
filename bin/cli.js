#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const argv = require('minimist')(process.argv.slice(2));
const helpers = require('../server_helpers');
const bcrypt = require('bcrypt');

async function createAdmin(email, password, displayName = 'Admin') {
  const hash = await bcrypt.hash(password, 10);
  const user = await helpers.createUser(email, hash, 'ADMIN', displayName);
  console.log(JSON.stringify({ ok: true, user }, null, 2));
}

async function migrate() {
  await helpers.initDb();
  console.log(JSON.stringify({ ok: true, msg: 'migrations applied (sqlite schema ensured)' }));
}

async function listPermissions() {
  const perms = await helpers.listPermissions();
  console.log(JSON.stringify({ ok: true, permissions: perms }, null, 2));
}

async function main() {
  const cmd = argv._[0];
  try {
    if (cmd === 'create-admin') {
      const email = argv.email || argv.e;
      const password = argv.password || argv.p;
      const displayName = argv.displayName || argv.d || 'Admin';
      if (!email || !password) {
        console.error('email and password required: --email you@host --password secret');
        process.exit(2);
      }
      await createAdmin(email, password, displayName);
    } else if (cmd === 'migrate') {
      await migrate();
    } else if (cmd === 'list-perms') {
      await listPermissions();
    } else {
      console.error('unknown command. use create-admin, migrate, list-perms');
      process.exit(2);
    }
  } catch (err) {
    console.error(err && err.message || err);
    process.exit(1);
  }
}

if (require.main === module) main();
