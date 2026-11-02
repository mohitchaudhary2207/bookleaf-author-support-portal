PRAGMA foreign_keys = ON;

-- Login identities. Authors link to an author profile; admins have no author_id.
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('author', 'admin')),
  author_id     TEXT UNIQUE REFERENCES authors(author_id),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS authors (
  author_id   TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  phone       TEXT,
  city        TEXT,
  joined_date TEXT
);

CREATE TABLE IF NOT EXISTS books (
  book_id                  TEXT PRIMARY KEY,
  author_id                TEXT NOT NULL REFERENCES authors(author_id),
  title                    TEXT NOT NULL,
  isbn                     TEXT,
  genre                    TEXT,
  publication_date         TEXT,            -- NULL while in production
  status                   TEXT NOT NULL,   -- 'Published & Live' | 'In Production - <stage>'
  mrp                      REAL,            -- NULL while in production
  author_royalty_per_copy  REAL,
  total_copies_sold        INTEGER NOT NULL DEFAULT 0,
  total_royalty_earned     REAL NOT NULL DEFAULT 0,
  royalty_paid             REAL NOT NULL DEFAULT 0,
  royalty_pending          REAL NOT NULL DEFAULT 0,
  last_royalty_payout_date TEXT,
  print_partner            TEXT,
  available_on             TEXT NOT NULL DEFAULT '[]'  -- JSON array of platform names
);
CREATE INDEX IF NOT EXISTS idx_books_author ON books(author_id);

CREATE TABLE IF NOT EXISTS tickets (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  author_id         TEXT NOT NULL REFERENCES authors(author_id),
  book_id           TEXT REFERENCES books(book_id),     -- NULL = General / Account Level
  subject           TEXT NOT NULL,
  description       TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'In Progress', 'Resolved', 'Closed')),

  -- AI-assisted triage. *_source records who set the value so overrides are auditable.
  category          TEXT,
  category_source   TEXT NOT NULL DEFAULT 'pending' CHECK (category_source IN ('pending', 'ai', 'rules', 'admin')),
  priority          TEXT CHECK (priority IN ('Critical', 'High', 'Medium', 'Low')),
  priority_source   TEXT NOT NULL DEFAULT 'pending' CHECK (priority_source IN ('pending', 'ai', 'rules', 'admin')),
  ai_confidence     REAL,
  ai_rationale      TEXT,
  ai_status         TEXT NOT NULL DEFAULT 'pending' CHECK (ai_status IN ('pending', 'done', 'fallback', 'failed')),

  assigned_to       INTEGER REFERENCES users(id),
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  first_response_at TEXT,
  resolved_at       TEXT
);
CREATE INDEX IF NOT EXISTS idx_tickets_author  ON tickets(author_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status  ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_created ON tickets(created_at);

-- Public conversation (author <-> support). Internal notes live in their own table so a
-- bug in a query can never leak them to an author.
CREATE TABLE IF NOT EXISTS ticket_messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id   INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('author', 'admin')),
  sender_id   INTEGER NOT NULL REFERENCES users(id),
  body        TEXT NOT NULL,
  ai_assisted INTEGER NOT NULL DEFAULT 0,   -- 1 if the admin started from an AI draft
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_ticket ON ticket_messages(ticket_id);

CREATE TABLE IF NOT EXISTS ticket_notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id  INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  admin_id   INTEGER NOT NULL REFERENCES users(id),
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_notes_ticket ON ticket_notes(ticket_id);

CREATE TABLE IF NOT EXISTS ticket_attachments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id     INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  stored_name   TEXT NOT NULL,
  mime_type     TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_attachments_ticket ON ticket_attachments(ticket_id);

-- Audit trail of changes (status, overrides, assignment). Admin-only.
CREATE TABLE IF NOT EXISTS ticket_activity (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id  INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  actor_id   INTEGER REFERENCES users(id),      -- NULL = system / AI
  action     TEXT NOT NULL,
  detail     TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_activity_ticket ON ticket_activity(ticket_id);

-- Cached AI draft per ticket. Re-opening a ticket does NOT trigger a new LLM call unless the
-- conversation changed (input_hash) or an admin explicitly asks for a regeneration.
CREATE TABLE IF NOT EXISTS ai_drafts (
  ticket_id    INTEGER PRIMARY KEY REFERENCES tickets(id) ON DELETE CASCADE,
  body         TEXT NOT NULL,
  source       TEXT NOT NULL CHECK (source IN ('ai', 'template')),
  model        TEXT,
  input_hash   TEXT NOT NULL,
  notes        TEXT,                              -- warnings for the admin (JSON array)
  generated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Every LLM call, successful or not: powers cost reporting and debugging.
CREATE TABLE IF NOT EXISTS ai_usage (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id     INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
  purpose       TEXT NOT NULL,                    -- 'classify' | 'draft'
  model         TEXT NOT NULL,
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  latency_ms    INTEGER,
  ok            INTEGER NOT NULL,
  error         TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
