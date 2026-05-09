'use strict';

/**
 * Database migration runner.
 * Reads SQL migration files and executes them against the configured database.
 *
 * Usage: node src/db-migrate.js
 *        npm run migrate
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const MIGRATIONS_DIR = path.join(__dirname, '../../database/migrations');

async function runMigrations() {
  const client = await pool.connect();
  console.log('Connected to database:', process.env.DATABASE_URL);

  try {
    // Create migrations tracking table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Get list of already-executed migrations
    const executedResult = await client.query(
      'SELECT filename FROM schema_migrations ORDER BY id ASC'
    );
    const executedFiles = new Set(executedResult.rows.map((r) => r.filename));

    // Read migration files from directory
    let migrationFiles;
    try {
      migrationFiles = fs.readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith('.sql'))
        .sort(); // Alphabetical order ensures correct sequence
    } catch (err) {
      console.error(`Could not read migrations directory: ${MIGRATIONS_DIR}`);
      console.error(err.message);
      process.exit(1);
    }

    if (migrationFiles.length === 0) {
      console.log('No migration files found.');
      return;
    }

    let ranCount = 0;
    let skippedCount = 0;

    for (const filename of migrationFiles) {
      if (executedFiles.has(filename)) {
        console.log(`  [SKIP] ${filename} (already executed)`);
        skippedCount++;
        continue;
      }

      const filePath = path.join(MIGRATIONS_DIR, filename);
      const sql = fs.readFileSync(filePath, 'utf8');

      console.log(`  [RUN]  ${filename}`);
      const startTime = Date.now();

      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (filename) VALUES ($1)',
          [filename]
        );
        await client.query('COMMIT');

        const elapsed = Date.now() - startTime;
        console.log(`  [OK]   ${filename} completed in ${elapsed}ms`);
        ranCount++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  [FAIL] ${filename}`);
        console.error('  Error:', err.message);
        console.error('\nMigration failed. Database rolled back to pre-migration state.');
        process.exit(1);
      }
    }

    console.log(`\nMigrations complete: ${ranCount} executed, ${skippedCount} skipped.`);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations().catch((err) => {
  console.error('Fatal migration error:', err);
  process.exit(1);
});
