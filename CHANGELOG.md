# Changelog

Documentation of changes made during project setup and improvement.

---

## Requirements & Dependencies

### Commented out optional/unused libraries
- **huggingface-hub** – pulled transitively by sentence-transformers
- **SpeechRecognition**, **pyttsx3** – only for `helper.speak()`/`listen()`; app uses Gemini STT
- **pydub** – not used in the codebase
- **pytest** – testing only; uncomment for development

### Version updates for Python 3.12 compatibility
- **faiss-cpu**: `1.7.4` → `>=1.8.0` (1.7.4 has no wheel for Python 3.12)
- **numpy**: `1.24.3` → `>=1.24.3` (allow compatible version)
- **sentence-transformers**: `2.2.2` → `>=2.7.0` (2.2.2 incompatible with modern huggingface-hub `cached_download`)

### helper.py – optional TTS/STT imports
- `pyttsx3` and `speech_recognition` moved to lazy imports inside `speak()` and `listen()` so the app runs without them installed.

---

## .gitignore

- Uncommented database/index ignores: `app.db`, `*.db`, `*.sqlite`, `*.sqlite3`, `medical_cases.index`, `medical_cases_metadata.pkl`
- Added `*_Zone.Identifier` (Windows metadata)
- Added `=*` (pip artifact files)
- Markdown: ignore `*.md` except `README.md` and `CHANGELOG.md`

---

## Run Script (run.sh)

- Added `run.sh` for one-command setup and run: creates venv if needed, installs deps, runs `python app.py`
- Usage: `bash run.sh` whenever receiving updated files from the team

---

## Auth & UX

### Login page flash fix
- Auth gate now hidden server-side when `current_user.is_authenticated` to avoid brief flash of login page before app loads.

### Add Patient – JSON parse error fix
- Added Content-Type check before parsing response as JSON; shows "Session may have expired" if server returns HTML.
- Exempted patient creation endpoints from CSRF: `/api/patients` (clinician) and `/admin/api/patients` (admin).

---

## Simulated Mode

### Message handling
- In simulated mode, user input is treated as the **Patient’s scenario** (not clinician).
- Displayed as Patient in transcript; backend echo is skipped to avoid duplicate messages.
- Frontend sends `role=patient` for simulated mode.

### SSE headers
- Added `Cache-Control: no-cache`, `X-Accel-Buffering: no`, `Connection: keep-alive` on agent chat stream response to prevent buffering.

### Error handling
- Wrapped LLM/agent init and per-turn calls in try/except.
- On failure, stream yields a System message like `[Error: ...]` instead of stopping silently.
- Errors logged in Flask console.

### agent_loader.py typo fix
- Fixed `"agentpip install --upgrade langchain"` → `"agent."` in docstring.

---

## Patient & Clinician Message Formatting

- **Bilingual display**: English and Kiswahili/Swahili now render on separate lines for readability. `formatBilingualForDisplay()` inserts a line break before "Swahili:" or "Kiswahili:" when both appear in the same message.

---

## Summarize & Final Plan Flow

- **Backend**: When `role=finalize`, always use `real_actor_chat_stepwise` (not simulate) so the Finalize path runs correctly.
- **Frontend**: `updateSummaryPanelFromMessage()` populates the summary panel when Listener/Clinician messages arrive from any stream (including simulated).
- **Simulated mode**: Summary and plan come at the end of the simulate stream. The Finalize button only opens the panel; no extra API call (content already in panel).
- **Real/Live mode**: Finalize button opens the panel and calls the API to generate summary from the conversation.

---

## Transcript Selection & Recommender Fixes

### Text selection in transcript
- **Issue**: Users could not select or copy text in the transcript area.
- **Cause**: `.app-container` had `user-select: none`, which prevented selection.
- **Fix**: Added `user-select: text` to `.transcript-messages` and `.message-text` so transcript text can be selected and copied.

### Clinician "I need more information" in first turn
- **Issue**: After the first patient prompt in simulated mode, the Clinician sometimes said "I need more information about the conversation so far" instead of a diagnostic question.
- **Cause**: The `question_recommender_agent` returned this when context was minimal (only the patient's opening statement).
- **Fixes**:
  1. **Simulated mode**: Added first-turn instruction telling the recommender to always suggest a question based on the patient's opening statement; never ask for more information.
  2. **Real mode**: Same first-turn / short-context note when history has ≤2 messages.
  3. **Live mode**: Same first-turn note; ensured the current patient utterance is included in recommender context when history doesn't yet contain it.
  4. **agents.yaml**: Strengthened `question_recommender_agent` description: "NEVER say 'I need more information' or ask for more details. Always suggest a concrete diagnostic question based on what the patient has said so far."

---

## Admin Dashboard Fixes

### Patients tab
- **Issue**: Patients tab showed "coming soon" and never loaded data.
- **Fix**: Added `GET /admin/api/patients` to list all patients with clinician display name. Implemented `loadPatientsData()` and `renderPatientsTable()`. Patients tab loads on first view (lazy). Create Patient modal now refreshes the list after creation.

### Clinicians tab
- **Fix**: Added `email` to clinicians API response so the table displays clinician email correctly.

### Analytics – cancer likelihood
- **Issue**: Analytics lacked an explicit cancer likelihood prediction.
- **Fix**: 
  - Backend: `conversation_disease_likelihoods` now computes `cancer_likelihood_pct` from FAISS results: similarity-weighted score for cases with (1) diseases containing "cancer", (2) red flag "Possible cancer-related bleeding".
  - UI: Disease Likelihood panel shows a prominent "🩺 Cancer Likelihood" card with percentage, color-coded (green for low, red for ≥20%).

### Workflow improvements
- **Patient filter**: Added filter by patient in Conversations tab; "View Conversations" on a patient now switches to Conversations tab and applies the filter.
- **Analytics lazy-load**: Analytics tab loads data on first view instead of on page load.
- **Create Patient validation**: Validates clinician selection before submit; shows error if no clinician selected.

### DB storage verification
- Conversations, messages, and patients are stored and retrieved correctly. `log_hook` receives conversation ID and logs to the right conversation. Ownership (owner_user_id, patient_id) is respected in queries.

### Conversations – cascading clinician → patient filter
- **Clinician first, then patient**: When a clinician is selected, the patient dropdown shows only that clinician's patients (no duplicate P001s). When "All Clinicians" is selected, patients are shown with their clinician in parentheses, e.g. `P001 (Dr. Smith)`.
- Changing clinician clears the patient selection and repopulates the patient dropdown.
- "View Conversations" from the Patients tab sets both clinician and patient filters.
- **Backend**: `GET /admin/api/patients?clinician_id=N` optionally filters patients by clinician.

### Analytics – link cancer likelihood to patient and conversation
- **Symptoms by Conversation table**: Added Patient and Clinician columns; added "View" button (opens conversation detail modal) alongside "Analyze".
- **Disease Likelihood panel**: Shows Patient and Clinician labels; added "View conversation" button to open the full transcript.
- **Backend**: `/admin/api/symptoms` now includes `patient_identifier`, `patient_display_name` per conversation; `/admin/api/conversation/<id>/disease_likelihoods` returns `patient_label` and `clinician_label`.

### Analytics – persist analysis history
- **DB persistence**: Added `conversation_disease_likelihoods` table to store the latest analysis snapshot per conversation (overwritten on re-analyze).
- **API**: `GET /admin/api/conversation/<id>/disease_likelihoods` now returns persisted results by default (`source: "db"`). Add `?force=1` (used by "Re-analyze") to recompute and overwrite (`source: "computed"`).
- **UI**: “Analyze” uses cached/persisted results; “Re-analyze” forces recomputation. Panel displays `Last analyzed` from the persisted `analyzed_at` timestamp.

### Conversation patient linking
- **Fix**: Selecting a patient in the main app now immediately updates the active conversation’s `patient_id` in the DB (not just the session), so the Admin Conversations table populates the Patient column reliably.

### Patient identifier alignment (recommended UX)
- **Clinician-side labels**: Patient labels now show the stable identifier first, with the old ordinal as a secondary hint (e.g. `P010 (Patient 3)` or `P010 — Name (Patient 3)`).
- **Admin Conversations**: Patient column now prefers stored patient identifier/display name (instead of per-clinician `Patient N`).

---

## Latest Application Updates

### Patient identification workflow (main app)
- Replaced dropdown-based patient selection with manual clinician entry of patient number.
- Added input guidance in UI: accepted formats include `P001` and `001`.
- Backend now normalizes patient identifiers to `P###` format, validates input, and returns a clear error for invalid formats.
- If the entered identifier already exists for the logged-in clinician, it is reused; otherwise a new patient record is created and linked.
- Conversation linking remains immediate: selected patient is written to the active conversation `patient_id` in DB (not session-only).

### Reset conversation behavior
- Improved reset handling so patient context is preserved when a valid patient number is already set.
- If a clinician typed a patient number but did not click Set yet, reset now resolves it first, then starts the fresh conversation with the correct `patient_id`.

### Live mode UX improvements
- Added a live status line in the Live pane (listening/connection feedback).
- Enhanced **Unasked (End-only)** flow:
  - During live capture, recommendations are stored for end-of-session ranking.
  - On Stop, the app fetches a consolidated bundle (listener summary + ranked unasked questions).
  - Summary panel and unasked modal are populated automatically from that bundle.

### Search experience and robustness
- Upgraded search rendering from plain text blocks to structured result cards for readability.
- Preserved robust type handling for mixed string/object result fields, preventing highlight/render crashes.
- Preserved explicit no-results messaging and backend error propagation to avoid silent failures.

### Validation and quality checks
- Verified owner/admin access boundaries in code paths:
  - Clinicians only access their own history/conversations.
  - Admin APIs remain role-guarded.
- Syntax checks passed for backend modules after integration updates.
- Lint diagnostics reported no new issues in edited files.

### Patient number blank in Admin / History
- **Issue**: After creating a conversation with a patient number specified, Admin Conversations and History showed the patient column blank or "unknown".
- **Cause**: If the user entered a patient number but sent a message without clicking "Set", the session never received `patient_id`, so the conversation was created with `patient_id` NULL.
- **Fix**:
  - Auto-sync patient from the manual input field before any request that creates or uses a conversation (send message, live transcription).
  - Added `GET /api/session-patient` to return current session patient for UI hydration on page load.
  - Patient input and session state are now restored when the user refreshes or navigates back to the main app.
  - History fallback for missing patient label changed from "Unknown Patient" to "—" for consistency with Admin.

---

## File Structure

- **run.sh** – One-command run script (keep when receiving updates from team)
- **CHANGELOG.md** – This file
