# Demo 2 — WhatsApp AI Assistant — test results

**Tested on:** 2026-11-09. Workflow: `workflow-whatsapp-assistant.json` as built in this folder (19 nodes, name "Demo 2 — WhatsApp AI Assistant, Glow & Co Salon (Forethinq Labs)"). Error handler: `workflow-error-handler.json` (2 nodes). Primary model: `gemini-3.1-flash-lite` (fallback order `gemini-3.5-flash-lite`, then `gemma-4-31b-it` — not needed, every live call succeeded on the primary model).

## Hardening fixes — verified present in the JSON

1. Gemini key only in the `x-goog-api-key` header (placeholder `YOUR_GEMINI_API_KEY`). No query parameters on the AI node; the old `?key=` form is gone. ✅
2. Model set to `gemini-3.1-flash-lite` (was `gemini-3.8-flash`). ✅
3. Retries (3 tries, 1s wait) plus wired error outputs on every external node: AI Reply — Gemini, Send Reply — WhatsApp, Send Handoff Reply — WhatsApp, Send Fallback — WhatsApp, Log Conversation (Sheets), Alert Owner — Gmail. ✅
4. `settings.errorWorkflow` = `REPLACE_WITH_ERROR_WORKFLOW_ID` placeholder; the sticky note explains the copy-the-ID linking step. `workflow-error-handler.json` created in Demo 1's style (source package had none). ✅
5. New **Parse & Validate Reply** code node checks the AI reply before anything is sent: empty/malformed output, a stated price that is not in the knowledge base, an offered unlisted service, or a booking for an unlisted service all route to the owner-handoff path (holding reply sent instead). Customer text enters the prompt between CUSTOMER_MESSAGE_START / CUSTOMER_MESSAGE_END markers with a data-not-commands rule, and marker tokens typed by the customer are stripped first. ✅
6. Every path ends in a conversation-log sheet row: Answered, Handed Off, Non-text Fallback, and Error (WhatsApp send failed) all reach **Log Conversation** with a Status and a Notes reason. A failed log write or owner alert stops the run loudly via Stop nodes + the error workflow. No silent terminal nodes. ✅

Structure checks: both JSONs parse; all 19 nodes are reachable from the WhatsApp Trigger; no dangling connection targets. **23 structural/fix checks passed, 0 failed.**

## Unit tests (Code-node logic, run in Node against the real jsCode from the workflow file)

**23 passed, 0 failed** — `node test_logic.js`:

- Extract Message: text payload extracted; image payload flagged non-text.
- Prepare Fallback Log: non-text input shapes a `Non-text Fallback` log record carrying the fallback reply text.
- Knowledge + Build Prompt: prompt has exactly one marker pair, customer text sits between them, the data-not-commands rule is present, allowed-amounts list is derived from the knowledge base (₹499, 899, 1,499, 2,999, 1,299, 599, 799, 2,499, 2,000).
- Injection: a customer message containing fake CUSTOMER_MESSAGE_END / START tokens is sanitised — still exactly one real marker pair, payload stays between them.
- Validator: valid price reply passes unchanged; empty reply hands off with holding text; malformed JSON hands off; invented price (keratin at ₹3,999) hands off; honest keratin handoff (needs_human, no price) passes as Handed Off; booking for an unlisted service hands off; complete valid booking passes; complaint intent forces needsHuman even when the model forgets the flag.
- Mark Handoff — AI Call Failed: shapes a Handed Off record carrying the error in Notes. Mark Error — Send Failed: shapes an Error record.

## Live model tests (real prompts from the workflow's own Knowledge node, via the vault-backed Gemini client)

All 6 text cases from `sample-conversations.md` ran on **gemini-3.1-flash-lite**, and each raw response was then passed through the workflow's own Parse & Validate Reply node.

| # | Case | Expected | Actual | Verdict |
|---|---|---|---|---|
| 1 | Prices for haircut + facial | KB prices only (₹499–₹899, ₹1,299), intent price, no handoff | Exact KB prices quoted, intent `price`, validated, Answered | ✅ Pass |
| 2 | Open on Tuesday? | Says closed Tuesdays, offers another day | "We are closed on Tuesdays… any other day… 10 AM to 8 PM", intent `hours`, Answered | ✅ Pass |
| 3 | Book hair spa tomorrow 4 pm | Confirm booking | **First run:** confirmed for "tomorrow" — which was Tuesday 10 Nov, a closed day — and promised the weekday discount. The prompt gave the model no current date, so it could not resolve "tomorrow". **Fix applied:** the Knowledge node now injects today's date (Asia/Kolkata) and a never-book-a-closed-day rule. **Re-run:** refused Tuesday, offered Wednesday 11 Nov at 4 PM and asked for confirmation, booking left null until the customer agrees | ✅ Pass after fix (behaviour is more correct than the script's literal expectation: no false confirmation) |
| 4 | Book me a manicure | Asks for missing day/time, confirms nothing | Asked for day and time, booking null, nothing confirmed | ✅ Pass |
| 5 | Keratin treatment? How much? (trap) | No invented price, needs_human, holding reply | **Run 1:** the model escalated itself — "we don't have that service listed. I've alerted our team…", `needs_human: true`, no price stated, validator passed it as Handed Off. **Run 2** (after the prompt change, model is stochastic): the model tried to answer instead — it quoted a real KB service but set `needs_human: false` for an unlisted-service question. The validator blocked the reply ("we offer" + "keratin"), so the customer still got the holding reply, the row logged Handed Off, and the owner was alerted. No price was invented in either run | ✅ Pass — by the model in run 1, by the validator safety net in run 2 |
| 6 | Complaint about last week's appointment (trap) | Holding reply + handoff, no arguing or promises | Apology + "someone will reach out to you shortly", intent `complaint`, `needs_human: true`, validator: Handed Off | ✅ Pass |
| 7 | Photo / voice note (non-text) | Fallback reply, no crash | Not live-testable without a WhatsApp number. Covered by unit tests: Extract flags it non-text, fallback log record is shaped with Status `Non-text Fallback` | ⚠️ Unit-tested only |

## n8n stub run — 2026-11-10 (Rio, n8n 2.46.6 in ~/workspace/n8n-local)

Both shipped files import into n8n exactly as shipped (import returned success for the main workflow and the error handler). The run used test variants of the main workflow: WhatsApp Trigger replaced by a Manual Trigger + seeded WhatsApp webhook payloads; every WhatsApp / Google Sheets / Gmail node replaced by a Code passthrough stub; the Gemini HTTP node replaced by a stub returning canned Gemini-shaped responses — except the AI-failure case, which kept the shipped HTTP node. Driver and full log: `~/workspace/n8n-local/stub-runs-2026-11-10/` (driver.py, d2-run.log). No execution errors in any case; nothing in the shipped files needed fixing.

| Case | Setup | Result |
|---|---|---|
| W1 Price question | "What are your prices for a haircut and facial?", canned Gemini reply quoting KB prices (₹499–₹899, ₹1,299), intent `price` | Validated, sent via the Send Reply stub, logged `Answered`; owner alert correctly did not fire |
| W2 Keratin handoff | Canned Gemini reply with `needs_human: true` and the holding text | Logged `Handed Off`, owner-alert stub fired. Note: a *validated* handoff reply is sent by the Send Reply node, not Send Handoff Reply — the two WhatsApp send nodes have identical parameters (same recipient, same `$json.reply` text), so the customer receives the same holding reply either way; Send Handoff Reply serves the blocked-reply and AI-failure paths |
| W3 Non-text | Seeded image message (no text) | Took the fallback branch: fallback-send stub ran, logged `Non-text Fallback` — script case #7 now covered inside n8n as well as in unit tests |
| W4 AI failure | Text question, shipped Gemini node with its placeholder key | Real Google call returned 400 "API key not valid" after retries; conversation logged `Handed Off` via Mark Handoff — AI Call Failed, handoff-send stub and owner-alert stub both fired |

**Rio's n8n_demo_ready review — 2026-11-10: PASS, with the documented limits standing.** Secrets: placeholder key in the `x-goog-api-key` header only, no `?key=` form anywhere, no real key in any publish file. All 6 external nodes carry retry (3 tries, 1s wait) + `continueErrorOutput`. Error workflow shipped with the settings placeholder and README linking steps. AI output validated before any send (price, unlisted-service, and booking checks in Parse & Validate Reply); a bad reply or a failed call routes to the handoff path with its own alert, never to a normal send (proven in n8n by W4). Customer text sits inside CUSTOMER_MESSAGE_START/END markers under a data-not-commands rule, with marker tokens stripped first. Every path ends in a log row with a Status and Notes (Answered, Handed Off, Non-text Fallback, Error). Two items stand as documented Known limits rather than passes: **no dedupe** (a redelivered webhook can double-reply — stated in the README) and relative-day reasoning tied to the injected date. Unit suite re-run 2026-11-10: 23 passed, 0 failed.

## Not tested

- **Full live n8n run** (import, WhatsApp trigger, real sends, real sheet writes): needs a Meta test number and Google credentials. The workflow has now been imported into a clean n8n and run end to end with stubbed nodes (above); the live version of that run is still to do.
- Live fallbacks `gemini-3.5-flash-lite` / `gemma-4-31b-it`: both are listed on the stored key (checked 2026-11-09) but were not called, because the primary model never returned 429/503 during the run.
- The error-handler workflow's Gmail send has not been fired live.

Raw live prompts and responses are kept in `live-prompts/`; the runners are `build_prompts.js`, `run_live.py`, `eval_live.js`.
