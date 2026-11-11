# KAMK AI Dispetcher

KAMK is a voice-first Android dispatcher agent for hourly water-observation workflows.

## Implemented development milestone

- Android mobile interface for dispatcher sign-in, live-session controls, conversation transcript and admin settings.
- WebRTC full-duplex audio connection to OpenAI Realtime, with foreground microphone permission and assistant barge-in support.
- Short-lived Realtime client-secret creation on a trusted backend; the permanent OpenAI API key never enters the APK.
- Individual dispatcher accounts, dispatcher/supervisor/admin roles, PostgreSQL storage and audit events.
- Uzbek agent instructions and server-side H/Q validation for seven observation points.
- Prepare → read-back → explicit spoken confirmation → commit workflow for observation batches.
- Duplicate date/hour/point protection; no silent overwrites.
- Admin upload of the original Excel workbook from the Android settings screen, historical data import, date-sheet lookup and template-preserving report export.
- Telegram report preparation and confirmation; optional server schedule at minute 00 every two hours in Asia/Tashkent.
- CI for Android unit tests/build plus Node backend and WebRTC client syntax checks.

## Current source of truth
- `app/` — Android client, WebView-hosted Realtime WebRTC UI and native permission/file-picker bridge.
- `server/` — secure Node.js API, PostgreSQL schema, Realtime token minting, agent functions, Excel template import/export and Telegram delivery.
- `docs/REALTIME_DISPATCHER_AGENT.md` — architecture and safety requirements.
- `docs/VOICE_AGENT_CONVERSATION_EXAMPLES.md` — Uzbek conversation behavior.

## Required deployment before live use

The Android app needs an HTTPS backend URL. The backend needs PostgreSQL, a server-side OpenAI API key with Realtime access and billing enabled, a JWT secret, initial admin credentials and persistent storage for the official workbook and report files. Telegram delivery additionally needs a bot token and target group chat ID. Configure these as backend secrets; never paste them into source code or place them in the APK.

See [server/README.md](server/README.md) and [server/.env.example](server/.env.example).

## Not yet production-complete

The repository contains the first integrated realtime/backend implementation, but it has not yet been connected to a deployed server or exercised with a real OpenAI account, live Telegram group and physical Android phone. The correction/overwrite workflow, reliable offline queue and sync conflict handling, full supervisor dashboard, operational monitoring/backups and end-to-end acceptance tests remain. Treat current APKs as development builds, not as the official operational system.
