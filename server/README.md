# KAMK Dispatcher API — backend deployment

This backend powers individual dispatcher accounts, PostgreSQL records, audit events and secure Realtime client credentials.

## Requirements
- Node.js 22+
- PostgreSQL 14+
- HTTPS public URL
- OpenAI API project with Realtime access and billing enabled

## Required environment variables
Copy `.env.example` to `.env` for local development, or enter each value in the hosting provider's secret/environment settings:
- `DATABASE_URL`: PostgreSQL connection string
- `DATABASE_SSL`: `true` for managed PostgreSQL; set `false` for local development only
- `JWT_SECRET`: long random secret (32+ characters)
- `OPENAI_API_KEY`: server-side OpenAI API key; never put this key in the Android app
- `SEED_ADMIN_USERNAME`: initial administrator login
- `SEED_ADMIN_PASSWORD`: initial administrator password (at least 10 characters)
- `OPENAI_REALTIME_MODEL`: defaults to `gpt-realtime-2.1`
- `CORS_ORIGINS`: normally `https://appassets.androidplatform.net`

The first startup creates the database tables and creates the first admin account if that username does not already exist. Store the initial admin credentials securely, then use the admin cabinet API to create dispatcher accounts.

## Deploy with Docker
Build from the `server/` directory and deploy the container with the environment variables above. The service listens on `PORT` (default 8080). Configure the hosting provider's HTTPS URL and health check path `/healthz`.

## API routes
- `POST /api/auth/login` — dispatcher sign-in
- `GET /api/auth/me` — current account
- `POST /api/admin/dispatchers` — create a dispatcher/supervisor account
- `GET /api/admin/dispatchers` — list accounts
- `GET /api/realtime/token` — mint a short-lived Realtime client secret
- `POST /api/agent/execute` — execute allow-listed agent functions under the logged-in dispatcher identity
- `GET /healthz` — health check

## Realtime flow
The backend requests a short-lived Realtime client secret from OpenAI using the permanent API key on the server. The Android WebView creates a WebRTC peer connection, streams microphone audio and plays the remote voice response. Function calls are sent to the authenticated backend; the model never writes directly to PostgreSQL.

The initial agent functions are:
- `prepare_observation_batch`: validate date, hour, point, H/Q and create a pending batch only.
- `confirm_observation_batch`: save the exact pending batch after the assistant receives explicit dispatcher confirmation.
- `get_observations`: retrieve the current dispatcher's entries (supervisors/admins can inspect all).

Duplicate date/hour/point rows are rejected; the API does not silently overwrite them. H-only and H+Q locations are validated server-side.

## Important current scope
The initial Realtime milestone implements real duplex voice, dispatcher sign-in, database access, pending confirmation and an audit trail. The original Excel workbook template, Excel export, Telegram scheduled delivery, supervisor dashboard, offline sync, correction workflow and production account lifecycle are not yet complete. Do not use this milestone as the official operational register until those modules and on-device tests are finished.

## Security
- Keep `OPENAI_API_KEY`, JWT secret, database credentials and Telegram credentials in the backend secret store.
- Use HTTPS in production.
- Rotate seeded admin credentials after first deployment.
- Restrict database access to the backend service.
- Back up PostgreSQL and test restore procedures.


## Upload the official Excel workbook

Sign in using an administrator account and use the app's Settings screen to upload the original `.xlsx` workbook. The API validates its first header and date-tab format, stores it at `WORKBOOK_TEMPLATE_PATH`, and imports existing readings into PostgreSQL without overwriting existing database records. Mount a persistent volume at `/data` so the template and generated reports survive container restarts.

The export engine looks for the requested date tab in `dd,MM,yy` or `dd,MM,yyyy` format. It preserves the original workbook structure and writes values only into the expected H/Q cells. If the date tab is absent, or an existing workbook cell conflicts with the database value, export stops rather than silently changing the workbook.

## Telegram delivery

Set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in backend secrets. Add the bot to the target Telegram group and grant it permission to send documents.

- Voice-initiated send: the agent prepares the report, reads out its date and record count, waits for the dispatcher to explicitly agree, then sends it.
- Scheduled send: set `REPORT_SCHEDULE_ENABLED=true`. The backend sends at minute 00 of every two-hour slot in the `Asia/Tashkent` timezone. A database idempotency key prevents duplicate sends for the same slot when more than one app instance is running.
