CREATE TABLE IF NOT EXISTS seasons (
  year INTEGER PRIMARY KEY,
  champion_code TEXT,
  champion_team TEXT,
  indexed_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS races (
  id BIGSERIAL PRIMARY KEY,
  year INTEGER NOT NULL REFERENCES seasons(year) ON DELETE CASCADE,
  round INTEGER,
  name TEXT NOT NULL,
  circuit TEXT,
  date DATE,
  condition TEXT,
  indexed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (year, name)
);

CREATE TABLE IF NOT EXISTS drivers (
  code TEXT PRIMARY KEY,
  full_name TEXT,
  nationality TEXT
);

CREATE TABLE IF NOT EXISTS teams (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS race_results (
  race_id BIGINT NOT NULL REFERENCES races(id) ON DELETE CASCADE,
  driver_code TEXT NOT NULL REFERENCES drivers(code),
  team_id BIGINT REFERENCES teams(id),
  grid_position INTEGER,
  finish_position INTEGER,
  status TEXT,
  total_laps INTEGER,
  PRIMARY KEY (race_id, driver_code)
);

CREATE TABLE IF NOT EXISTS stints (
  id BIGSERIAL PRIMARY KEY,
  race_id BIGINT NOT NULL REFERENCES races(id) ON DELETE CASCADE,
  driver_code TEXT NOT NULL REFERENCES drivers(code),
  stint_number INTEGER NOT NULL,
  compound TEXT,
  lap_start INTEGER,
  lap_end INTEGER,
  lap_count INTEGER
);

CREATE TABLE IF NOT EXISTS laps (
  race_id BIGINT NOT NULL REFERENCES races(id) ON DELETE CASCADE,
  driver_code TEXT NOT NULL REFERENCES drivers(code),
  lap_number INTEGER NOT NULL,
  lap_time_seconds NUMERIC(8, 3),
  compound TEXT,
  stint_number INTEGER,
  pit_stop BOOLEAN DEFAULT false,
  PRIMARY KEY (race_id, driver_code, lap_number)
);

CREATE TABLE IF NOT EXISTS weather (
  race_id BIGINT PRIMARY KEY REFERENCES races(id) ON DELETE CASCADE,
  condition TEXT,
  avg_air_temp NUMERIC(5, 2),
  avg_track_temp NUMERIC(5, 2),
  raw JSONB
);

CREATE TABLE IF NOT EXISTS live_snapshots (
  id BIGSERIAL PRIMARY KEY,
  session_key BIGINT,
  session_name TEXT,
  lap INTEGER,
  total_laps INTEGER,
  payload JSONB NOT NULL,
  captured_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_races_year ON races(year);
CREATE INDEX IF NOT EXISTS idx_results_driver ON race_results(driver_code);
CREATE INDEX IF NOT EXISTS idx_stints_race_driver ON stints(race_id, driver_code);
CREATE INDEX IF NOT EXISTS idx_live_snapshots_session ON live_snapshots(session_key, captured_at DESC);
