CREATE TABLE IF NOT EXISTS service_events (
    id BIGSERIAL PRIMARY KEY,
    event_type TEXT NOT NULL,
    source TEXT NOT NULL,
    outcome TEXT NOT NULL,
    duration_ms INTEGER,
    status_code INTEGER,
    fallback_used BOOLEAN NOT NULL DEFAULT false,
    error_code TEXT,
    context JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_events_source_created
    ON service_events (source, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_service_events_outcome_created
    ON service_events (outcome, created_at DESC);
