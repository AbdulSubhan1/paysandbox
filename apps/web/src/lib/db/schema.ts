import { bigint, boolean, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, unique } from 'drizzle-orm/pg-core';

const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();
const money = () => bigint({ mode: 'number' });

// ---- Better Auth (plural model names, see auth.ts) ----

export const users = pgTable('users', {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  createdAt: createdAt(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  githubUserId: text().unique(),
  githubLogin: text(),
  isAdmin: boolean().notNull().default(false),
});

export const sessions = pgTable('sessions', {
  id: text().primaryKey(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  token: text().notNull().unique(),
  createdAt: createdAt(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  ipAddress: text(),
  userAgent: text(),
  userId: text().notNull().references(() => users.id, { onDelete: 'cascade' }),
});

export const accounts = pgTable('accounts', {
  id: text().primaryKey(),
  accountId: text().notNull(),
  providerId: text().notNull(),
  userId: text().notNull().references(() => users.id, { onDelete: 'cascade' }),
  accessToken: text(),
  refreshToken: text(),
  idToken: text(),
  accessTokenExpiresAt: timestamp({ withTimezone: true }),
  refreshTokenExpiresAt: timestamp({ withTimezone: true }),
  scope: text(),
  password: text(),
  createdAt: createdAt(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const verifications = pgTable('verifications', {
  id: text().primaryKey(),
  identifier: text().notNull(),
  value: text().notNull(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

// ---- PaySandbox ----

export const signupAllowlist = pgTable('signup_allowlist', {
  githubLogin: text().primaryKey(), // stored lowercase
  addedBy: text(),
  createdAt: createdAt(),
});

export const merchants = pgTable('merchants', {
  id: text().primaryKey(),
  ownerUserId: text().references(() => users.id, { onDelete: 'cascade' }), // null for guest sandboxes
  name: text().notNull(),
  isGuest: boolean().notNull().default(false),
  guestExpiresAt: timestamp({ withTimezone: true }),
  demoReceiverMode: text(),
  createdAt: createdAt(),
});

export const apiKeyType = pgEnum('api_key_type', ['publishable', 'secret']);

export const apiKeys = pgTable('api_keys', {
  id: text().primaryKey(),
  merchantId: text().notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  type: apiKeyType().notNull(),
  prefix: text().notNull(),
  last4: text().notNull(),
  keyHash: text().unique(), // secret keys only
  publishableValue: text().unique(), // publishable keys only
  expiresAt: timestamp({ withTimezone: true }), // set when a secret key is rolled
  createdAt: createdAt(),
});

export const sessionStatus = pgEnum('session_status', ['open', 'complete', 'expired']);

export type LineItem = { name: string; quantity: number; amount: number };

export const checkoutSessions = pgTable(
  'checkout_sessions',
  {
    id: text().primaryKey(),
    merchantId: text().notNull().references(() => merchants.id, { onDelete: 'cascade' }),
    amount: money().notNull(),
    currency: text().notNull().default('pkr'),
    lineItems: jsonb().$type<LineItem[]>().notNull(),
    customerEmail: text(),
    successUrl: text().notNull(),
    cancelUrl: text().notNull(),
    status: sessionStatus().notNull().default('open'),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    paymentId: text(),
    idempotencyKey: text(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.merchantId, t.createdAt)],
);

export const customers = pgTable(
  'customers',
  {
    id: text().primaryKey(),
    merchantId: text().notNull().references(() => merchants.id, { onDelete: 'cascade' }),
    email: text().notNull(), // stored lowercase
    name: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.merchantId, t.email)],
);

export const paymentStatus = pgEnum('payment_status', [
  'requires_action',
  'succeeded',
  'failed',
  'partially_refunded',
  'refunded',
  'disputed',
  'dispute_lost',
]);

export const payments = pgTable(
  'payments',
  {
    id: text().primaryKey(),
    merchantId: text().notNull().references(() => merchants.id, { onDelete: 'cascade' }),
    checkoutSessionId: text().notNull().references(() => checkoutSessions.id, { onDelete: 'cascade' }),
    customerId: text().notNull().references(() => customers.id),
    attemptId: text().notNull(),
    amount: money().notNull(),
    amountRefunded: money().notNull().default(0),
    status: paymentStatus().notNull(),
    cardBrand: text().notNull(),
    cardLast4: text().notNull(),
    testCard: text().notNull(),
    failureCode: text(),
    declineCode: text(),
    otpAttempts: integer().notNull().default(0),
    createdAt: createdAt(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.checkoutSessionId, t.attemptId), index().on(t.merchantId, t.createdAt)],
);

/** The dashboard timeline. Session-level rows (e.g. "Checkout session created") have no paymentId. */
export const paymentActivity = pgTable(
  'payment_activity',
  {
    id: text().primaryKey(),
    seq: bigint({ mode: 'number' }).generatedAlwaysAsIdentity(), // insertion order: rows can share a timestamp
    checkoutSessionId: text().notNull().references(() => checkoutSessions.id, { onDelete: 'cascade' }),
    paymentId: text().references(() => payments.id, { onDelete: 'cascade' }),
    kind: text().notNull(),
    message: text().notNull(),
    detail: jsonb(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.checkoutSessionId, t.createdAt)],
);

export const events = pgTable(
  'events',
  {
    id: text().primaryKey(),
    merchantId: text().notNull().references(() => merchants.id, { onDelete: 'cascade' }),
    type: text().notNull(),
    payload: jsonb().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.merchantId, t.createdAt)],
);

export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    merchantId: text().notNull().references(() => merchants.id, { onDelete: 'cascade' }),
    key: text().notNull(),
    requestHash: text().notNull(),
    status: text({ enum: ['in_progress', 'done'] }).notNull(),
    responseStatus: integer(),
    responseBody: jsonb(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.merchantId, t.key] })],
);

export const apiRequestLog = pgTable(
  'api_request_log',
  {
    id: text().primaryKey(),
    merchantId: text().notNull().references(() => merchants.id, { onDelete: 'cascade' }),
    method: text().notNull(),
    path: text().notNull(),
    status: integer().notNull(),
    idempotencyKey: text(),
    errorCode: text(),
    durationMs: integer().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.merchantId, t.createdAt)],
);

export const usageDaily = pgTable(
  'usage_daily',
  {
    merchantId: text().notNull().references(() => merchants.id, { onDelete: 'cascade' }),
    day: text().notNull(), // YYYY-MM-DD in Asia/Karachi
    apiRequests: integer().notNull().default(0),
    checkoutSessions: integer().notNull().default(0),
    webhookAttempts: integer().notNull().default(0),
    testEvents: integer().notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.merchantId, t.day] })],
);

// ---- Plan 2: webhooks, refunds, disputes, jobs ----

/** One endpoint per merchant. The signing secret is stored encrypted (lib/crypto/secretbox.ts). */
export const webhookEndpoints = pgTable('webhook_endpoints', {
  id: text().primaryKey(),
  merchantId: text()
    .notNull()
    .unique()
    .references(() => merchants.id, { onDelete: 'cascade' }),
  url: text().notNull(),
  secretEncrypted: text().notNull(),
  previousSecretEncrypted: text(), // kept 24 h after a roll
  previousSecretExpiresAt: timestamp({ withTimezone: true }),
  enabled: boolean().notNull().default(true),
  consecutiveFailures: integer().notNull().default(0), // failed deliveries (events) in a row
  disabledReason: text(),
  createdAt: createdAt(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const deliveryState = pgEnum('delivery_state', ['pending', 'delivered', 'failed']);

/** One per event and endpoint; its attempts are in webhook_attempts. */
export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: text().primaryKey(),
    merchantId: text().notNull().references(() => merchants.id, { onDelete: 'cascade' }),
    eventId: text().notNull().references(() => events.id, { onDelete: 'cascade' }),
    endpointId: text().notNull().references(() => webhookEndpoints.id, { onDelete: 'cascade' }),
    state: deliveryState().notNull().default('pending'),
    attemptCount: integer().notNull().default(0),
    nextAttemptAt: timestamp({ withTimezone: true }),
    lastError: text(),
    createdAt: createdAt(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.eventId, t.endpointId), index().on(t.merchantId, t.createdAt)],
);

export const webhookAttempts = pgTable(
  'webhook_attempts',
  {
    id: text().primaryKey(),
    deliveryId: text().notNull().references(() => webhookDeliveries.id, { onDelete: 'cascade' }),
    attempt: integer().notNull(),
    url: text().notNull(),
    statusCode: integer(), // null: timeout, network error or blocked address
    error: text(), // timeout | network | blocked_address | redirect
    durationMs: integer().notNull(),
    responseSnippet: text(), // first 1 KB of the response body
    requestHeaders: jsonb().notNull(),
    attemptedAt: createdAt(),
  },
  (t) => [index().on(t.deliveryId, t.attempt)],
);

export const refunds = pgTable(
  'refunds',
  {
    id: text().primaryKey(),
    merchantId: text().notNull().references(() => merchants.id, { onDelete: 'cascade' }),
    paymentId: text().notNull().references(() => payments.id, { onDelete: 'cascade' }),
    amount: money().notNull(),
    reason: text({ enum: ['requested_by_customer', 'duplicate', 'fraudulent'] }).notNull(),
    status: text({ enum: ['succeeded'] }).notNull().default('succeeded'),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.paymentId)],
);

export const disputeStatus = pgEnum('dispute_status', ['needs_response', 'won', 'lost']);

export const disputes = pgTable('disputes', {
  id: text().primaryKey(),
  merchantId: text().notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  paymentId: text()
    .notNull()
    .unique() // one dispute per payment, ever
    .references(() => payments.id, { onDelete: 'cascade' }),
  amount: money().notNull(),
  reason: text().notNull(),
  status: disputeStatus().notNull().default('needs_response'),
  previousPaymentStatus: paymentStatus().notNull(), // restored when the dispute is won
  respondBy: timestamp({ withTimezone: true }).notNull(),
  createdAt: createdAt(),
  closedAt: timestamp({ withTimezone: true }),
});

export const jobKind = pgEnum('job_kind', ['deliver_webhook', 'expire_session', 'open_dispute', 'dispute_deadline']);

/** Transactional outbox for timers and retries (lib/jobs/jobs.ts). */
export const jobs = pgTable(
  'jobs',
  {
    id: text().primaryKey(),
    merchantId: text().notNull().references(() => merchants.id, { onDelete: 'cascade' }),
    kind: jobKind().notNull(),
    refId: text().notNull(),
    runAt: timestamp({ withTimezone: true }).notNull(),
    state: text({ enum: ['pending', 'done'] }).notNull().default('pending'),
    attempts: integer().notNull().default(0),
    lockedUntil: timestamp({ withTimezone: true }),
    publishedAt: timestamp({ withTimezone: true }),
    lastError: text(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.state, t.runAt), index().on(t.merchantId, t.state, t.runAt)],
);
