# KAMK — Professional Realtime AI Dispatcher

## Product direction

The earlier 0.1 prototype is not the target product. It used Android SpeechRecognizer, a phrase matcher and Android TextToSpeech. That is not a conversational AI agent. The production direction is a native Android app with a persistent, user-controlled realtime speech-to-speech session.

## Voice experience

- One tap starts a live conversation; the app shows a clear listening / thinking / speaking / executing state.
- While the session is active and the app is in the foreground, the microphone streams audio continuously to the realtime session. Voice activity detection handles natural turn-taking.
- The dispatcher can interrupt the assistant; the assistant can stop speaking, listen and continue with conversation context.
- The assistant responds in natural Uzbek, asks follow-up questions when fields are missing or ambiguous, and remembers the active task and recently named observation point within the session.
- A clear End session button closes the microphone and realtime connection. Background microphone use is not hidden; if later required it must use Android's foreground-service rules and a persistent notification.

## Realtime architecture

1. Android native WebRTC media connection for duplex microphone/audio.
2. Trusted backend creates short-lived Realtime client secrets. The permanent OpenAI API key is stored only on the backend and never shipped in the APK.
3. Realtime session uses speech-to-speech model (configure a currently supported Realtime model, starting with `gpt-realtime-2.1`) and Uzbek dispatcher instructions.
4. Realtime data channel carries session events, transcript text, tool calls and tool results.
5. The application executes dispatcher functions only after strict schema validation and required confirmation.
6. Backend stores accounts, roles, audit events and shared observation records. Android local storage is an offline queue/cache, not the source of truth.

## Dispatcher tools

- `get_shift_context`: current dispatcher, work date, shift, today's saved readings and relevant sheet schema.
- `prepare_observation`: prepare one or several hourly observations. Does not write.
- `confirm_observation_batch`: commit only the batch the dispatcher explicitly confirmed.
- `correct_observation`: create an audited correction; never silently erase the previous value.
- `get_observations`: query the current day, hour or point.
- `export_hourly_report`: create the day report using the approved workbook template.
- `send_telegram_report`: send a confirmed report to the configured group, return Telegram's message/document ID.
- `get_report_status`: show latest export/send time and result.

## Safety and operational rules

- The model must not invent H or Q values, point names, hour, unit, or date.
- H-only points: 02 reyka, PK390, PK446, PK559. H+Q points: PK66, PK287, PK583. This mapping must be configured from the supplied workbook and reviewed before production.
- Missing/unclear data triggers a clarification question. No guessed number is written.
- Before a write, the assistant reads back the interpreted point, time, H and Q values. The dispatcher must explicitly confirm.
- A correction or overwrite must be separately confirmed and retained in the audit history.
- No Telegram report is sent until the export is valid and the configured reporting time/approval policy allows it.
- Tool permissions are enforced by backend role checks, not by the model prompt alone.
- API credentials, Telegram bot token and backend secrets must not be committed to Git or embedded in the Android APK.

## Multi-dispatcher accounts

- Individual dispatcher sign-in and account status.
- Role-based access: dispatcher, supervisor, administrator.
- Each record stores dispatcher ID, date, hour, point, H, Q, created/updated timestamps and correction history.
- Supervisors can see consolidated status and report delivery status.
- Conflict rule for same date/hour/point is explicit: show existing value, request correction confirmation and write an audit event.

## Excel compatibility

The uploaded example contains multiple day sheets and a fixed layout. The final implementation must use the actual supplied workbook as a template, preserve its formulas, merged cells, print areas, formatting and existing sheet names, and write values into the existing correct cells. A newly generated generic spreadsheet is not a substitute for preserving the official workbook. Unknown future sheet dates must be handled explicitly.

## Acceptance tests before calling the app ready

1. Natural Uzbek multi-turn command where the dispatcher says the point first and gives H/Q later.
2. Correct interpretation of decimal values spoken with Uzbek decimal wording.
3. Ambiguous point/number causes a question, not a write.
4. Multi-point batch is read back as a complete list and requires explicit confirmation.
5. The assistant can be interrupted mid-sentence and resumes with correct context.
6. Confirmed values land in the exact original workbook cells; formulas and formatting remain intact.
7. Duplicate entry and correction leave an audit history.
8. Telegram send reports success only after Telegram confirms it.
9. Two separate dispatcher accounts cannot edit each other's records without permission.
10. Network loss keeps a pending queue and synchronizes without duplicate writes.

## External services needed

- A deployed HTTPS backend with authentication and persistent database.
- OpenAI API project with Realtime model access and API billing enabled.
- Telegram bot token and target group chat ID held in backend secrets/configuration.
- A secure deployment environment for secrets and database backups.

A ChatGPT subscription does not provide an application server API key; Realtime API usage is billed to the OpenAI API project separately.
