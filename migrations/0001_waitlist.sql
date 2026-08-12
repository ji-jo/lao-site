CREATE TABLE IF NOT EXISTS waitlist_entries (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE,
  username TEXT NOT NULL COLLATE NOCASE,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'unsubscribed')),
  verification_token_hash TEXT,
  unsubscribe_token_hash TEXT NOT NULL,
  reservation_expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_at TEXT,
  unsubscribed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source TEXT NOT NULL DEFAULT 'lao.lt'
);

CREATE UNIQUE INDEX IF NOT EXISTS waitlist_email_unique
  ON waitlist_entries (lower(email));

CREATE UNIQUE INDEX IF NOT EXISTS waitlist_username_unique
  ON waitlist_entries (lower(username));

CREATE UNIQUE INDEX IF NOT EXISTS waitlist_verification_token_unique
  ON waitlist_entries (verification_token_hash)
  WHERE verification_token_hash IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS waitlist_unsubscribe_token_unique
  ON waitlist_entries (unsubscribe_token_hash);

CREATE INDEX IF NOT EXISTS waitlist_status_created
  ON waitlist_entries (status, created_at);
