# Project status

**Current version: 1.0.13** (31 October 2026), eval **SHIP**, locked as the baseline in `docs/baseline.json`. 1.0.12 was never locked, because 1.0.13 contains it. 1.0.11 is kept there as the previous baseline.

**Where the project stands:** built and tested end to end on synthetic data, **stopped before the internal beta**. Everything left needs real people.

- Model: Claude Haiku 5.5 (`claude-haiku-5-5`) for both steps, low effort, handoff below confidence 0.7. Anthropic is used for the pilot only; the production vendor is still open (`docs/MODEL-STRATEGY.md`).
- Nova Bank is fictional. All data is synthetic. No real customer has used the copilot.

## What the copilot does today

| Feature | Since | Where to read |
| - | - | - |
| Answers fee, dispute, card and maintenance questions from the customer's own records and Nova's rules, in Arabic, English and Franco-Arabic; fraud, complaints and anything unsure go to a person | 1.0.0 to 1.0.11 | `prompts/CHANGELOG.md`, stage pages 5 and 6 |
| Customer chat, agent inbox and PM control panel; the 3 UX pillars; Telos critique | Stage 6 | [stage-6-integration-ux.html](stages/stage-6-integration-ux.html) |
| ROI model in the PM panel, with request-level cost attribution | 31 Oct | `docs/ROI-MODEL.md` |
| Record picker: the customer taps the exact transaction, card or dispute; a vague question gets "Which one do you mean?" | 1.0.12 | Stage 6 page, screenshots 13 to 15 |
| Transaction investigator: guided narrowing, one transaction explained step by step, "I'm waiting for money", a handoff with the full picture. Typed questions about a payment's status or money on its way get the same answers (TXS rules in the AI's knowledge) | 1.0.13 | `docs/INVESTIGATOR.md`, screenshots 16 to 20 |

## Stage by stage

| Stage | Status | What exists | Page |
| - | - | - | - |
| 1 · Problem Framing | Done | Scope, North Star (verified resolution rate, target 40%), fraud gate | Planning pages (`docs/LIFECYCLE-PAGES.md`), `docs/01-PRD.md` |
| 2 · Data Collection & Prep | Done | 50 synthetic customers, 520 transactions (16 added for the investigator), 15 disputes, policies and transaction rules by rule ID, 200 labelled tickets linked to the records, eval set, a 15-case hold-out | `docs/04-DATA-GUIDE.md`, `docs/lifecycle/` |
| 3 · Model Selection | Done for Anthropic | Bake-off runs A to D, T, U. OpenAI and Gemini runs are scripted but not run (no keys) | `docs/MODEL-STRATEGY.md` |
| 4 · Prompt & System Design | Done | 8-section prompts (answer prompt 1.0.4), fixed replies, retry note, 50 approved examples, CHANGELOG 1.0.0 to 1.0.13 | `prompts/CHANGELOG.md` |
| 5 · Evaluation | Done, with open items | 1.0.13 says SHIP on 106 cases and 10 gates; hold-out used once; LLM judge not built | [stage-5-evaluation.html](stages/stage-5-evaluation.html) |
| 6 · Integration & UX | Partly done | Chat, inbox, PM panel with the ROI model, record picker, transaction investigator, the 3 UX pillars. Usability test with 5 people not run | [stage-6-integration-ux.html](stages/stage-6-integration-ux.html) |
| 7 · Staged Launch | Partly done | Shadow run done (3 runs, last on 1.0.11). **Stopped before the internal beta.** Pilot not started | [stage-7-staged-launch.html](stages/stage-7-staged-launch.html), [shadow-run-results.md](stages/shadow-run-results.md) |
| 8 · Monitoring & Feedback | Built, no real data | PM control panel, automatic recommendations, ROI and investigator metrics, weekly report format | [stage-8-monitoring.html](stages/stage-8-monitoring.html) |
| 9 · Iteration & Retraining | Running on the eval only | 14 versions, each with scores (1.0.10 rejected); weekly fix cycle and learning loop | [stage-9-iteration.html](stages/stage-9-iteration.html) |

All stage reports: [docs/stages/index.html](stages/index.html).

## Key numbers

### Eval, version 1.0.13 (fixed eval date): SHIP

106 cases: 65 main questions (5 new typed transaction questions), 6 service status, 4 junk, 18 red-team, 4 record-picker and 9 investigator checks.

| Measure | Result | Gate or target |
| - | - | - |
| Fraud recall | 13/13 | must be 100% |
| Harmless | 7/7 | must be 1.00 |
| Security (red team) | 18/18 | all must pass |
| Honesty | 5/5 (cases 21, 57, 59, S3, S6) | 21, 57, 59 must pass |
| Intent accuracy | 98.5% (64/65) | 90% |
| Grounded answers | 97.1% (33/34) | 90% |
| Recall@3, notice match | 100%, 100% | 95%, 100% |
| Record picker | 4/4 | all must pass |
| Investigator checks | 9/9 | all must pass |
| Citation recall, precision | 100%, 64.1% | 90%, 90% (precision not a gate, below target) |
| Speed | p50 2.5 s, p95 4.8 s | 6 s in the pilot |
| Cost | US$0.029 for the run, US$0.00044 per answered message | |

Still failing, none of them a gate: case 20 (an injection attempt handed to a person instead of answered), 45 (account takeover read as phishing, still sent to Fraud) and S4 (card declined abroad read as a payment question, handed to a person). The free unit checks of the investigator (`node tools/test-investigator.mjs`) pass 15/15.

1.0.13 took 2 eval runs. Run 1: DO NOT SHIP, grounded 30/34. A bug in my retry link connected cards to every transaction (case 37), and the scope rule DIG-4 still listed only fees, disputes and cards (case 61). Both were fixed. Run 2: SHIP.

### Shadow run on 200 tickets (last run on 1.0.11)

| Measure | Run 1: Stage 2 tickets | Run 2: linked | Run 3: linked + new facts (1.0.11) |
| - | - | - | - |
| Would have resolved | 23.0% (46/200) | 59.0% (118/200) | **63.0% (126/200)** |
| Agent minutes saved | 455 | 1,138 | 1,207 |
| Fraud tickets missed | 0 of 16 | 0 of 16 | 0 of 16 |
| Answered where an agent was needed | 0 | 0 | 0 |
| Intent accuracy | 98.0% | 99.5% | 100% |
| Cost per answered message | EGP 0.018 | EGP 0.025 | EGP 0.024 |
| p95 | 5.7 s | 5.2 s | 6.0 s |

63% of all tickets is 89% of the 142 tickets an agent would have given the copilot. The shadow run has not been repeated on 1.0.13. Details: [shadow-run-results.md](stages/shadow-run-results.md).

**Speed:** p95 was 4.8 s in the 1.0.13 eval and 6.0 s in the last shadow run, against a 6 s pilot gate. If the beta shows over 6 s, the planned fix is the Telos recommendation: hand off after 6 s.

### Spend

About **US$2.21** in eval, bake-off and shadow runs for the whole project:
- US$2.05 to the 1.0.11 baseline
- US$0.10 for the four 1.0.12 runs
- US$0.06 for the two 1.0.13 runs
- under US$0.01 for demo messages

The ROI model and the investigator screens make no model calls.

## Decisions, and who made them

| Decision | Decided by | Result |
| - | - | - |
| Regenerate the 200 tickets from the customer records; ask each ticket at a fixed time | Owner, via the project assistant | `tools/build_linked_tickets.mjs`. Shadow went from 23% to 59% |
| Narrow the "unexplained EGP 50" trap row (1.0.10) | Owner asked for it; I wrote the wording | **Rejected:** DO NOT SHIP (cases 2 and 29 broke). Reverted |
| Give the eval a fixed date (`EVAL_NOW`) | Me, as a bug fix | The eval had failed 3 card cases only because it ran after 30 Oct |
| An unexplained EGP 50 is `fee.overdraft` everywhere | Owner | Rule in the ticket script. Changed 0 labels |
| Branch hours and cheque book price as synthetic facts; honesty cases 21 and 57 moved to facts Nova still lacks | Owner chose option A | 1.0.11: SHIP |
| Lock 1.0.11 as the baseline | Owner, via the project assistant | Done; now the previous baseline |
| Stop before the internal beta and document | Owner | Still the stop point |
| Add the ROI model to the PM panel (31 Oct) | Owner | `docs/ROI-MODEL.md` |
| Add the record picker (31 Oct) | Owner said go | 1.0.12, SHIP |
| Build the transaction investigator (31 Oct) | Owner | First as a draft without an eval, at the owner's request |
| Test the investigator, put the TXS rules into the AI, keep every document consistent, lock 1.0.13 (31 Oct) | Owner, via the project assistant | 1.0.13: SHIP on run 2; locked as the baseline (1.0.12 skipped) |

Earlier decisions (Round 0, model choice, threshold, automation modes, product names) are in [docs/stages/index.html](stages/index.html) and `prompts/CHANGELOG.md`.

## What is synthetic, and what is not proven yet

- **All data is synthetic:** customers, transactions, disputes, tickets, policies, transaction rules, fees, branch hours and the cheque book price. The WhatsApp phrasing sheet is simulated, not real replies.
- **No real users yet.** The 63% is a shadow number on synthetic tickets, last measured on 1.0.11. The North Star (verified resolution rate) has not been measured with real people.
- **The hold-out was used once** (against 1.0.8: 6/7 grounded, a strict DO NOT SHIP because of one safe handoff). The next release check needs a fresh hold-out written by someone who hasn't seen the eval set.
- **Not built or not run:** the LLM judge (a second model scoring answers), and the usability test with 5 Arabic or Franco-Arabic speakers.
- **English is the weakest language:** all three failing eval cases are in English.
- **Citation precision is about 64%:** answers cite extra rules. Not a gate, but below the 90% target.
- **Known gaps:**
  - The copilot doesn't infer "closed on Saturday" from the Sunday-to-Thursday hours.
  - Nova has no branch list.
  - The investigator's expected times use the date, not the hour, to decide "late".
- **Case 21 got easier:** the safe deposit box is also the "bad answer" example inside the answer prompt. Case 59 (certificate of balance) is the clean honesty check.
- **OpenAI and Gemini were not tested** (no keys). Anthropic is for the pilot only.
- **The published lifecycle pages** need republishing from this version (`docs/LIFECYCLE-PAGES.md`).

## What's next, and what it needs

Everything left needs people; none of it can be finished by the build alone.

1. **Internal beta (stage 7):** 5 to 10 classmates or colleagues, about 50 conversations in Suggest-only mode, including the pickers and the investigator, with fraud and complaint scenarios on purpose. About 2 days.
2. **Pilot (stage 7):** 10 to 20 people with the scenario cards in Auto-answer mode, to measure "Did this solve your question?" against the 40% target. About 5 days. Present it as evidence, not statistical proof.
3. **Before or during the beta:** a fresh hold-out from a second person, and a shadow run on 1.0.13 (about US$0.06).
4. **Case study (portfolio):** the two-page write-up, best written after the pilot so it has a real result.

To restart: follow the README to run the app (`node server.js`), reset the demo as the README says, then follow `docs/DEMO-SCRIPT.md` and the beta plan on the stage 7 page.
