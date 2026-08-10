// migrations/seed.js
// Simple seed script that uses the server_helpers DB helper.
try {
  const { seedDb } = require('../server_helpers');
  seedDb();
  console.log('Database seeded successfully.');
} catch (err) {
  console.error('Seeding failed. Ensure dependencies are installed:', err.message);
  process.exit(1);
}
