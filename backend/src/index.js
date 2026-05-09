'use strict';

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

// Routes
const authRoutes = require('./routes/auth');
const careHomesRoutes = require('./routes/careHomes');
const placementAgentsRoutes = require('./routes/placementAgents');
const referralAgentsRoutes = require('./routes/referralAgents');
const patientsRoutes = require('./routes/patients');
const queueRoutes = require('./routes/queue');
const agreementsRoutes = require('./routes/agreements');
const placementsRoutes = require('./routes/placements');
const adminRoutes = require('./routes/admin');
const subscriptionsRoutes = require('./routes/subscriptions');
const reportsRoutes = require('./routes/reports');

// Services
const { startQueueJobs } = require('./services/queueJobs');

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------
const app = express();
const PORT = process.env.PORT || 4000;

// ---------------------------------------------------------------------------
// Security & utility middleware
// ---------------------------------------------------------------------------
app.use(helmet());

app.use(cors({
  origin: process.env.APP_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'stripe-signature'],
}));

app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use(limiter);

// ---------------------------------------------------------------------------
// Stripe webhook: must come BEFORE express.json() to preserve raw body
// ---------------------------------------------------------------------------
app.use(
  '/api/v1/subscriptions/webhook',
  express.raw({ type: 'application/json' }),
  subscriptionsRoutes
);

// ---------------------------------------------------------------------------
// Body parsing (for all other routes)
// ---------------------------------------------------------------------------
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// API Routes
// ---------------------------------------------------------------------------
const API_PREFIX = '/api/v1';

app.use(`${API_PREFIX}/auth`, authRoutes);
app.use(`${API_PREFIX}/care-homes`, careHomesRoutes);
app.use(`${API_PREFIX}/placement-agents`, placementAgentsRoutes);
app.use(`${API_PREFIX}/referral-agents`, referralAgentsRoutes);
app.use(`${API_PREFIX}/patients`, patientsRoutes);
app.use(`${API_PREFIX}/queue`, queueRoutes);
app.use(`${API_PREFIX}/agreements`, agreementsRoutes);
app.use(`${API_PREFIX}/placements`, placementsRoutes);
app.use(`${API_PREFIX}/admin`, adminRoutes);
app.use(`${API_PREFIX}/subscriptions`, subscriptionsRoutes);
app.use(`${API_PREFIX}/reports`, reportsRoutes);

// ---------------------------------------------------------------------------
// 404 handler
// ---------------------------------------------------------------------------
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

// ---------------------------------------------------------------------------
// Global error handler
// ---------------------------------------------------------------------------
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);

  // Postgres errors
  if (err.code === '23505') {
    return res.status(409).json({ error: 'Duplicate entry — this record already exists.' });
  }
  if (err.code === '23503') {
    return res.status(400).json({ error: 'Referenced record does not exist.' });
  }
  if (err.code === '22P02') {
    return res.status(400).json({ error: 'Invalid UUID format.' });
  }

  const status = err.status || err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production'
    ? 'An internal server error occurred.'
    : err.message || 'Internal server error';

  return res.status(status).json({ error: message });
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`CareConnect API running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
  console.log(`API base: http://localhost:${PORT}/api/v1`);

  // Start background cron jobs
  startQueueJobs();
});

module.exports = app;
