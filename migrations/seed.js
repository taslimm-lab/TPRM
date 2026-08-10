// migrations/seed.js
// Simple seed script that uses the server_helpers DB helper.
try {
  const { seedDb, createUser } = require('../server_helpers');
  const bcrypt = require('bcrypt');

  seedDb()
    .then(async () => {
      // create default admin user for dev
      const pwHash = await bcrypt.hash('password', 10);
      await createUser('admin@local', pwHash, 'ADMIN', 'Local Admin');
      console.log('Database seeded successfully. Default admin: admin@local / password');
    })
    .catch((err) => {
      console.error('Seeding failed:', err.message || err);
      process.exit(1);
    });
} catch (err) {
  console.error('Seeding failed. Ensure dependencies are installed:', err.message);
  process.exit(1);
}
