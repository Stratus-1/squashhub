# SquashHub Assistant beta: "Failed to send a request" diagnosis and fix

## Diagnosis (from production records)

1. **Which request failed:** the in-app assistant's call to the `ai-help` backend function from Rachel Gates's Nelspruit account. It was a spoken message: the transcript was used and no screenshots were attached.
2. **It reached the backend twice, and both requests completed:**
   - 11:55:38 UTC (13:55 SAST): escalated, and support ticket `b2f1f99b…` was created.
   - 11:56:53 UTC: escalated again (she retried), and a second ticket `07b9235a…` was created.
   - Both correctly identified the real problem: Rachel & Chanya were listed twice at 14:15, and Maria & Jozelle were missing. The requests were marked "unsupported action, needs a person".
   - **No data was changed.** Escalation only creates a support ticket.
3. **Why the screen showed red:** "Failed to send a request to the Edge Function" means the phone never received a reply. This is not an error message from the server. The server finished its work, but the connection dropped before the answer came back.
   - **Most likely cause (not confirmed):** a slow request. One question can run up to 8 back-to-back AI steps with reasoning, and the loop keeps going even after it has escalated. That can run long on a phone connection and get cut off.
   - **Why it's not confirmed:** the backend's request timing logs for this function returned no rows for today, so the exact duration can't be proven. The fix therefore adds timing logs.
4. **What it was NOT:**
   - Not sign-in: she was signed in, identified as captain at Nelspruit, and the club had assistant access.
   - Not CORS, a broken request, permissions, or AI configuration: the request ran, saved its result and opened tickets.
   - Not the voice transcript: the transcription worked.
5. **Afrikaans and apostrophes:** played no part. The text was stored and interpreted correctly.
6. **Link to the tournament bug:** the content of the message was about today's playoff bug. The failure itself is a separate assistant problem with long-running replies.
7. **Current user experience gap:** when a send fails, the panel shows the error text, but the typed or spoken message has already been cleared from the box. There is no Retry button. Retrying makes a duplicate ticket, which is what happened today.

## Fix (smallest safe change)

**Backend (`ai-help`)**
- Stop right after an escalation succeeds and reply at once with the ticket number. Don't keep calling the AI.
- Add a total time budget of about 40 seconds and a per-step timeout. If the budget runs out, reply with a clear message instead of hanging. Keep the existing handling for busy, credits and blocked errors.
- **No duplicate tickets on retry:** the app sends a request ID with each message. If that ID already has a saved result, return the saved result instead of running again or opening another ticket. The ID is stored in the existing request details, so the database structure doesn't change.
- Log each request's timing, number of steps and outcome, with no message text or personal data.

**App (assistant panel)**
- Clear the message box only after a successful reply.
- On failure, keep the user's message in the chat with an error note and a **Retry** button. Retry resends the same text, voice-transcript flag, screenshots and request ID.
- Show a friendlier connection message: "Couldn't reach the assistant. Your message is saved — tap Retry."
- Typed and spoken messages use exactly the same path.

**Live data:** no changes. The two duplicate tickets are left for you to close.

## Tests
- Backend unit tests:
  - An escalation ends the loop after one ticket.
  - Running out of the time budget returns a timeout reply.
  - A repeated request ID returns the stored result with no new ticket or action.
  - An Afrikaans message with apostrophes passes through unchanged.
- Panel tests:
  - A failed send keeps the text and shows Retry.
  - Retry reuses the same request ID and succeeds.
  - A successful send clears the box.
  - A spoken message follows the same flow.
- Live check: send the same Afrikaans message as a Nelspruit captain test user, typed and spoken. Confirm one ticket and a quick reply, then retry and confirm no second ticket.

## Technical details
- Files: `supabase/functions/ai-help/index.ts` (early return after escalate, deadline/AbortController, `clientRequestId` lookup in `ai_assist_interactions.context`), `src/hooks/use-ai-help.ts` (pass `clientRequestId`, map `FunctionsFetchError`), `src/components/ai/AiHelpBetaPanel.tsx` (retain input on failure, Retry action).
- Append the diagnosis and fix to `docs/PROJECT_STRUCTURE_AND_ISSUE_LOG.md`. Not published unless you ask.
