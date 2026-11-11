# KAMK AI Dispetcher

KAMK is being rebuilt as a professional Android voice-first dispatcher agent for hourly water-observation workflows.

## Current milestone: realtime voice and dispatcher backend

The current branch contains:
- Android WebView-hosted WebRTC voice screen with foreground-only microphone session, barge-in capable Realtime audio, voice connection state and conversation transcript.
- OpenAI Realtime client-secret endpoint on the backend. Permanent OpenAI API key remains server-side.
- Individual dispatcher sign-in, role-based supervisor/admin access and PostgreSQL storage.
- Realtime function tools to prepare observation batches, read the exact values back, wait for explicit spoken confirmation, and commit confirmed readings.
- Server-side validation for seven points, H-only and H+Q fields, hour/date, duplicate protection and audit events.
- Native Android microphone permission bridge and local secure-origin assets.

## Realtime architecture references
- [Realtime speech-to-speech conversations](https://developers.openai.com/api/docs/guides/realtime-conversations)
- [WebRTC connection and ephemeral client secrets](https://developers.openai.com/api/docs/guides/voice-webrtc)
- [GPT-Realtime-2.1 model](https://developers.openai.com/api/docs/models/gpt-realtime-2.1)

## Repository map
- `app/` — Android client and local realtime voice UI.
- `server/` — secure Node.js API, Realtime token minting, PostgreSQL schema and agent function execution.
- `docs/REALTIME_DISPATCHER_AGENT.md` — target architecture and safety requirements.
- `docs/VOICE_AGENT_CONVERSATION_EXAMPLES.md` — Uzbek speech-agent behavior examples.

## Backend deployment required

The APK cannot create a live AI session until the backend is deployed and configured. Follow [server/README.md](server/README.md). Required server-side configuration includes PostgreSQL, a long random JWT secret, and an OpenAI API key with Realtime access and billing enabled. Configure the backend HTTPS URL in the app login screen.

**Never place the permanent OpenAI API key or Telegram bot token in the APK or source repository.**

## Not complete yet
This milestone is not the finished water-dispatch production system. The official uploaded Excel workbook template and its exact formatting/formulas, Excel export, Telegram scheduled reports, correction workflow, offline synchronization, supervisor dashboard and full on-device acceptance tests remain to be implemented. Do not replace the official operational spreadsheet with this milestone yet.
