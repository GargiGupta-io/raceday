# RaceDay Backend Reliability

This guide explains how RaceDay stays usable when an upstream API, cache, database, or live connection is slow or unavailable.

## Scope

The reliability layer protects request-time and live workloads.

It currently covers:

- OpenF1 live requests;
- optional OpenAI or Gemini companion refinement;
- recent live-state and OpenF1 response caching;
- companion AI response caching;
- season-summary caching;
- targeted rate limiting;
- live WebSocket recovery;
- and optional operational event persistence.

Historical FastF1, Jolpica, and OpenMeteo indexing remains a separate batch-oriented path. Those loaders keep their existing synchronous behavior and write normalized data into the prebuilt JSON index.

## Runtime Architecture

```text
Browser / extension
        |
        v
Next.js + live connection controller
        |
        | WebSocket first, REST polling fallback
        v
FastAPI
        |
        +---------------- Reliability gateway ----------------+
        |  source timeout -> bounded retry -> circuit breaker  |
        +------------------------------------------------------+
             |                         |
             v                         v
          OpenF1                 Companion AI
             |                         |
             +----------+--------------+
                        |
             recent response/state
                        |
            Redis when healthy, memory otherwise
                        |
              sanitized outcome events
                        |
          PostgreSQL only when explicitly enabled

Historical race reads ----------> prebuilt JSON index
```

The prebuilt JSON index is the primary race-data store. Redis and PostgreSQL are optional supporting services, not correctness requirements.

## Shared Upstream Client

`backend/core/http_client.py` owns one `httpx.AsyncClient` for the FastAPI lifespan.

The client provides:

- separate connect, read, write, and connection-pool timeouts;
- bounded retries for temporary failures;
- exponential backoff with jitter;
- bounded `Retry-After` support;
- per-source circuit breakers;
- cancellation-safe shutdown;
- sanitized operational events;
- and reusable connection pooling.

Retryable conditions are network errors, timeouts, and HTTP `408`, `425`, `429`, `500`, `502`, `503`, and `504`.

Permanent client errors such as `400`, `401`, `403`, and `404` are not retried.

### Source Policies

| Source | Connect | Read | Attempts | Backoff cap | Circuit opens | Recovery delay |
|---|---:|---:|---:|---:|---:|---:|
| OpenF1 | 2s | 6s | 3 | 1.5s | 4 failed operations | 20s |
| Companion AI | 3s | 10s | 2 | 1s | 3 failed operations | 30s |
| Jolpica policy | 3s | 12s | 3 | 2s | 5 failed operations | 30s |
| OpenMeteo policy | 3s | 12s | 3 | 2s | 5 failed operations | 30s |

The Jolpica and OpenMeteo policies are defined for the future request-path migration. Their current historical indexing loaders still use their existing synchronous retry code.

## Circuit Breakers

Each upstream source has an independent circuit.

```text
closed -> repeated exhausted failures -> open
open   -> recovery delay expires      -> half-open
half-open -> one successful probe     -> closed
half-open -> failed probe             -> open
```

Only one request becomes the half-open recovery probe. Other requests fail fast and use their normal fallback.

An OpenF1 outage cannot open the AI circuit, and an AI outage cannot affect historical race browsing.

## Cache And Rate Limits

`backend/core/cache.py` always provides process-local memory storage.

When `REDIS_URL` is configured and reachable, Redis becomes the shared cache and counter backend. A Redis failure starts a 30-second cooldown and immediately returns RaceDay to memory.

| Cached value | TTL |
|---|---:|
| OpenF1 source response | 8 seconds |
| Latest live snapshot | 30 seconds |
| Companion AI race moment | 10 minutes |
| Season summaries | 10 minutes |

Recent live snapshots include `capturedAt`. A snapshot older than 30 seconds, more than five seconds in the future, or missing a valid timestamp is not restored.

Rate limits apply only to expensive write-style routes:

| Route group | Default limit |
|---|---:|
| Companion note | 120 per minute |
| Companion video analysis | 30 per minute |
| Strategy simulation | 60 per minute |
| Manual refresh | 6 per hour |

Normal race reads, health checks, `/live`, and WebSockets are not rate limited.

Client addresses are converted to short salted hashes before they enter counter keys. Raw addresses are not stored. If the limiter fails, the product request is allowed to continue.

## Live Connection Recovery

The frontend uses WebSocket delivery first.

If the socket fails or its handshake stalls:

1. the page starts polling `GET /live`;
2. a reconnect is scheduled with exponential backoff and jitter;
3. polling keeps the live view usable;
4. a recovered WebSocket stops polling;
5. stale polling responses cannot replace newer WebSocket data;
6. and page cleanup cancels every socket and timer.

The backend keeps the last known live state during a temporary OpenF1 outage and marks source health as degraded. A valid no-session response remains a successful state rather than an error.

## PostgreSQL Operational Events

PostgreSQL stores operational history only. It does not store seasons, race results, laps, stints, videos, or user activity.

Event writing requires both:

```text
RELIABILITY_EVENTS_ENABLED=true
DATABASE_URL=postgresql://...
```

`DATABASE_URL` by itself does not enable writes.

When enabled, startup applies `backend/schema/migrations/001_service_events.sql` and starts a background writer.

Requests place sanitized events into a bounded in-process queue and never await a database insert. The default queue capacity is 500. When full, the oldest queued event is dropped so memory remains bounded.

The table can record:

- source and operation;
- success, failure, skip, or fallback outcome;
- latency;
- HTTP status;
- sanitized error category;
- circuit state;
- fallback use;
- and a small allowlisted context object.

It rejects unknown context keys and values that resemble URLs, credentials, authorization data, email addresses, passwords, or secrets.

It never receives request bodies, headers, provider responses, transcripts, radio text, raw client addresses, or API keys.

If PostgreSQL fails, event loss is counted and RaceDay continues.

## Health Endpoints

Health routes return remembered state. They do not call every dependency on demand.

| Endpoint | Purpose |
|---|---|
| `GET /health` | Process and build status |
| `GET /health/data-sources` | Provider status and circuit state |
| `GET /health/cache` | Redis availability and active fallback backend |
| `GET /health/events` | Event queue, database, and writer status |
| `GET /live/status` | Live task, source, client, and last-update state |
| `GET /storage/status` | Primary race store plus optional event-store status |
| `GET /indexing/status` | Historical/current-season indexing progress |

Useful deployment checks:

```bash
curl https://raceday-backend.onrender.com/health
curl https://raceday-backend.onrender.com/health/data-sources
curl https://raceday-backend.onrender.com/health/cache
curl https://raceday-backend.onrender.com/health/events
curl https://raceday-backend.onrender.com/storage/status
```

Do not expose database URLs, Redis URLs, salts, or provider keys in health responses.

## Environment Variables

### Core Deployment

| Variable | Required | Purpose |
|---|---|---|
| `PORT` | Hosting platform | Uvicorn listen port; defaults to `8888` locally |
| `FRONTEND_URLS` | Recommended | Comma-separated CORS origins |
| `PREBUILT_INDEX_MIN_RACES` | No | Minimum shipped races before startup trusts the prebuilt index; defaults to `100` |
| `CACHE_DIR` | No | Raw/cache data path |
| `INDEX_DIR` | No | JSON race index path |

### Optional Reliability Services

| Variable | Required | Purpose |
|---|---|---|
| `REDIS_URL` | No | Shared cache and rate-limit counters |
| `RATE_LIMIT_SALT` | Recommended with Redis | Private stable salt for hashed client identifiers |
| `DATABASE_URL` | No | PostgreSQL connection for service events |
| `RELIABILITY_EVENTS_ENABLED` | No | Explicit event-store opt-in |
| `RELIABILITY_EVENT_QUEUE_SIZE` | No | Event queue capacity; defaults to `500` |

### Optional Companion Providers

| Variable | Required | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | No | Optional companion wording refinement |
| `GEMINI_API_KEY` | No | Alternative companion wording refinement |
| `GROQ_API_KEY` | No | Optional radio transcription |

All secrets belong in local `.env` files or hosting environment settings. Never commit real values.

## Render Deployment

RaceDay's root `Dockerfile` installs backend requirements, copies the backend plus the prebuilt `data` directory, and starts `backend.api:app` on the platform-provided port.

Recommended rollout order:

1. Merge the tested reliability branch into `master`.
2. Let Render build the root `Dockerfile`.
3. Deploy first without `REDIS_URL` or PostgreSQL event variables.
4. Verify `/health`, `/storage/status`, historical races, `/live`, and companion notes.
5. Confirm the frontend `NEXT_PUBLIC_API_URL` points to `https://raceday-backend.onrender.com`.
6. Confirm fresh extension installs use the same Render backend.
7. Add Redis only if shared cache or multi-instance limits are needed.
8. Add PostgreSQL only if persistent operational history is needed.
9. Enable event writes only after `DATABASE_URL` exists.
10. Recheck every health endpoint and the browser extension.

The baseline deployment requires neither Redis nor PostgreSQL.

## Rollback

Rollback is layered so optional services can be removed before code is reverted.

1. Set `RELIABILITY_EVENTS_ENABLED=false` to stop new PostgreSQL events.
2. Remove `DATABASE_URL` if the event database is being retired.
3. Remove `REDIS_URL` to return to process-local memory.
4. Verify `/health/cache` reports memory and `/health/events` reports disabled.
5. Revert the relevant granular commit or the reliability merge if runtime code must be rolled back.

The prebuilt JSON index does not need to be regenerated for any of these steps.

## Failure Matrix

| Failure | Backend behavior | User-visible result |
|---|---|---|
| Brief OpenF1 timeout | Retry with backoff | Usually no interruption |
| Continued OpenF1 outage | Open circuit and keep recent state | Degraded live status |
| No active live session | Return a valid inactive response | Clear no-session state |
| AI timeout or open circuit | Keep deterministic RaceDay note | Companion continues |
| Redis startup/operation failure | Enter cooldown and use memory | Product continues |
| PostgreSQL connection/write failure | Drop/count event and retry later | Product continues |
| WebSocket disconnect | Poll REST and reconnect | Live updates continue |
| Render restart | Load shipped JSON index | Historical browsing remains available |
| Historical provider outage | Serve already indexed JSON | Existing races remain available |

## Tradeoffs

### Why JSON Remains The Race Store

The prebuilt index already gives fast, deterministic historical reads and survives stateless Render restarts. Moving all races into PostgreSQL would add import jobs, migrations, query rewrites, and deployment risk without improving the current portfolio workload enough to justify it.

### Why Redis Is Optional

Local development and single-instance deployment should work without infrastructure setup. Memory provides the same cache interface and keeps Redis from becoming a new single point of failure. The tradeoff is that memory cache and rate-limit state is not shared between backend instances.

### Why PostgreSQL Stores Only Events

Operational events are small, structured, and useful across restarts. They provide durable failure history without putting core race reads behind a new database dependency. The tradeoff is that event retention and dashboards must be added before the table grows indefinitely in a long-running production system.

### Why Polling Remains

WebSockets give timely live updates, but browsers, proxies, and hosting platforms can interrupt them. REST polling costs more requests but gives the user a dependable secondary path.

### Why Historical Loaders Are Still Synchronous

FastF1 and the historical indexing pipeline perform file, pandas, and CPU-heavy work. Converting only their HTTP calls would not make the complete pipeline non-blocking. They remain batch work outside the request-time live path and should eventually move to scheduled workers.

## Remaining Scaling Work

- run indexing in a scheduled worker rather than the API process;
- add Redis pub/sub before horizontally scaling WebSocket fanout;
- add event retention or aggregation before long-term PostgreSQL use;
- move raw caches to object storage if repository/deployment size becomes a problem;
- migrate structured race data only when query volume justifies it;
- and monitor production latency before changing timeout or circuit thresholds.

## Verification

From the repository root:

```bash
PYTHONPATH=. pytest -q backend/tests
cd frontend && npm test
cd frontend && npm run typecheck
cd frontend && npm run build
```

The integration suite deliberately simulates OpenF1, AI, Redis, PostgreSQL, shutdown, and WebSocket failures without contacting real services.
