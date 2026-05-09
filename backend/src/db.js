'use strict';

require('dotenv').config();
const { Pool } = require('pg');

// Strip parameters pg doesn't understand (e.g. channel_binding from Neon URLs)
// NEON_DATABASE_URL takes priority so Railway's auto-injected DATABASE_URL doesn't override Neon
const rawUrl = (process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || '').trim();
const dbUrl = rawUrl.replace(/[&?]channel_binding=[^&]*/g, '');

console.log('[DB] URL source:', process.env.NEON_DATABASE_URL ? 'NEON_DATABASE_URL' : 'DATABASE_URL');
console.log('[DB] URL prefix:', rawUrl.slice(0, 40) || '(empty)');

if (!dbUrl) {
  console.error('FATAL: Neither NEON_DATABASE_URL nor DATABASE_URL is set — exiting');
  process.exit(1);
}

const pool = new Pool({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client:', err);
});

/**
 * Execute a single parameterized query using a pool connection.
 * @param {string} text - SQL query string with $1, $2, ... placeholders
 * @param {Array}  params - Parameter values
 * @returns {Promise<import('pg').QueryResult>}
 */
async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV === 'development') {
    console.log('executed query', { text, duration, rows: res.rowCount });
  }
  return res;
}

/**
 * Acquire a dedicated client from the pool for transactions.
 * Caller must call client.release() when done.
 * @returns {Promise<import('pg').PoolClient>}
 */
async function getClient() {
  const client = await pool.connect();
  return client;
}

module.exports = { query, getClient, pool };
