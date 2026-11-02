CREATE TABLE IF NOT EXISTS judging_events (
 id TEXT PRIMARY KEY, owner TEXT NOT NULL, name TEXT NOT NULL, tables INTEGER NOT NULL CHECK(tables BETWEEN 1 AND 500),
 key_hash TEXT NOT NULL, open INTEGER NOT NULL DEFAULT 1, created BIGINT NOT NULL,
 round INTEGER NOT NULL DEFAULT 1, timer_remaining BIGINT NOT NULL DEFAULT 10800000,
 timer_ends BIGINT, timer_state TEXT NOT NULL DEFAULT 'Ready', timer_updated BIGINT NOT NULL DEFAULT 0,
 announcement TEXT NOT NULL DEFAULT '', bcp_url TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS judging_calls (
 id TEXT PRIMARY KEY,event TEXT NOT NULL REFERENCES judging_events(id),table_no INTEGER NOT NULL,
 kind TEXT NOT NULL,status TEXT NOT NULL,judge TEXT NOT NULL DEFAULT '',created BIGINT NOT NULL,updated BIGINT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS judging_one_active ON judging_calls(event,table_no) WHERE status!='Resolved';
CREATE INDEX IF NOT EXISTS judging_call_queue ON judging_calls(event,created);
CREATE TABLE IF NOT EXISTS judging_login_attempts(bucket TEXT PRIMARY KEY,count INTEGER NOT NULL,expires BIGINT NOT NULL);
