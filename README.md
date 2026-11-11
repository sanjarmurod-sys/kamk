# KAMK — AI Dispetcher

**Current repository status:** 0.1 was a local prototype only. It is not the intended professional realtime product and must not be used as the final operational system.

## Product target

A professional Android AI dispatcher with a natural, continuous, low-latency Uzbek speech-to-speech conversation while a dispatcher explicitly has a live session open. The agent must understand conversational context, ask follow-up questions, interpret multiple observation points and execute approved actions through validated app tools.

## Target architecture

- Native Android application with a full-duplex WebRTC voice session.
- OpenAI Realtime speech-to-speech model, beginning with a supported reasoning/tool-capable Realtime model such as `gpt-realtime-2.1`.
- Trusted HTTPS backend creates short-lived Realtime client secrets. The permanent API key stays on the backend only.
- Function tools for preparing and confirming observation batches, corrections, querying records, exporting the official Excel template and sending Telegram reports.
- A real central database and authentication for dispatcher accounts, supervisor and administrator roles.
- Offline queue, sync conflict handling and audit trail.
- Official workbook preservation: existing sheets, styles, formulas, merged cells and print setup must be retained.

## Voice behavior

- Tap **Start live session** once. While the live session is active and foregrounded, the agent listens continuously with voice activity detection and natural turn taking.
- The dispatcher can interrupt the assistant. It must stop speaking and listen.
- The agent speaks natural Uzbek, remembers the active conversational context and asks only for missing/ambiguous information.
- Before any write, the agent reads back the observation batch and waits for explicit spoken confirmation.
- The agent never claims an action succeeded until the backend reports success.
- Tap **End session** to close microphone and connection. Background listening must be visible, user-controlled and follow Android foreground-service requirements.

## Repository documentation

- `docs/REALTIME_DISPATCHER_AGENT.md` — system architecture, tool boundaries, roles, data safety and acceptance tests.
- `docs/VOICE_AGENT_CONVERSATION_EXAMPLES.md` — intended natural Uzbek conversational behavior.

## Realtime API references

- [Realtime speech-to-speech conversations](https://developers.openai.com/api/docs/guides/realtime-conversations)
- [Realtime function tools](https://developers.openai.com/api/docs/guides/realtime-mcp)
- [Realtime client secret endpoint](https://developers.openai.com/api/reference/resources/realtime/subresources/client_secrets/methods/create)

## Configuration and security

A Realtime integration requires an OpenAI API project with Realtime access and API billing enabled. API usage is separate from a ChatGPT subscription. The permanent OpenAI API key, Telegram bot token, database URL and signing secrets must be stored in the backend deployment's secret manager. **Never commit these values or place them inside the APK.**

See `docs/REALTIME_DISPATCHER_AGENT.md` before implementing production functionality.
