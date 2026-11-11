CREATE TABLE IF NOT EXISTS dispatchers (
  id UUID PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('dispatcher', 'supervisor', 'admin')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS observations (
  id UUID PRIMARY KEY,
  observation_date DATE NOT NULL,
  hour SMALLINT NOT NULL CHECK (hour BETWEEN 1 AND 24),
  point_key TEXT NOT NULL CHECK (point_key IN ('reyka02','pk66','pk287','pk390','pk446','pk559','pk583')),
  h_value NUMERIC(14,4) NOT NULL CHECK (h_value >= 0),
  q_value NUMERIC(14,4),
  dispatcher_id UUID NOT NULL REFERENCES dispatchers(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (observation_date, hour, point_key)
);

CREATE TABLE IF NOT EXISTS pending_batches (
  id UUID PRIMARY KEY,
  dispatcher_id UUID NOT NULL REFERENCES dispatchers(id),
  observation_date DATE NOT NULL,
  hour SMALLINT NOT NULL CHECK (hour BETWEEN 1 AND 24),
  readings JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','confirmed','cancelled','expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS audit_events (
  id BIGSERIAL PRIMARY KEY,
  dispatcher_id UUID NOT NULL REFERENCES dispatchers(id),
  event_type TEXT NOT NULL,
  entity_id UUID,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_observations_date_hour ON observations(observation_date, hour);
CREATE INDEX IF NOT EXISTS idx_observations_dispatcher ON observations(dispatcher_id, observation_date);
CREATE INDEX IF NOT EXISTS idx_audit_dispatcher_time ON audit_events(dispatcher_id, created_at DESC);


CREATE TABLE IF NOT EXISTS pending_reports (
  id UUID PRIMARY KEY,
  dispatcher_id UUID NOT NULL REFERENCES dispatchers(id),
  observation_date DATE NOT NULL,
  record_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('pending','sending','sent','failed','cancelled','expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  telegram_message_id BIGINT
);

CREATE TABLE IF NOT EXISTS scheduled_report_runs (
  slot_key TEXT PRIMARY KEY,
  observation_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('started','sent','failed')),
  error_message TEXT,
  telegram_message_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
