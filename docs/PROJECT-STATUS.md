# Project status: where we stopped

**Stop point: 30 October 2026, before the internal beta.**
The owner decided to stop here and document the current state. Everything below can be checked in this repository.

- Shipped and locked version: **1.0.11** (`docs/baseline.json`; 1.0.9 is kept there as the previous baseline).
- Commits of the last round: `93ff981` linked shadow tickets and fixed clocks, `4677b74` EGP 50 label rule, `506e367` version 1.0.11, `08d3a7b` baseline lock, then the commit that adds this page.
- Model: Claude Haiku 5.5 (`claude-haiku-5-5`) for both steps, low effort, handoff below confidence 0.7. Anthropic is used for the pilot only; the production vendor is still open (`docs/MODEL-STRATEGY.md`).
- Nova Bank is fictional. All data is synthetic. No real customer has used the copilot.

## Stage by stage

| Stage | Status | What exists | Page |
| - | - | - | - |
| 1 · Problem Framing | Done | Scope (fees, disputes, cards), North Star (verified resolution rate, target 40%), fraud gate | Planning pages (`docs/LIFECYCLE-PAGES.md`), `docs/01-PRD.md` |
| 2 · Data Collection & Prep | Done | 50 synthetic customers, 504 transactions, 15 disputes, policies by rule ID, 200 labelled tickets (now linked to the records), eval set and a 15-case hold-out | `docs/04-DATA-GUIDE.md` |
| 3 · Model Selection | Done for Anthropic | Bake-off runs A to D, T, U. OpenAI and Gemini runs are scripted but not run (no keys) | `docs/MODEL-STRATEGY.md` |
| 4 · Prompt & System Design | Done | 8-section prompts, fixed replies, retry note, CHANGELOG 1.0.0 to 1.0.11 | `prompts/CHANGELOG.md` |
| 5 · Evaluation | Done, with open items | 1.0.11 says SHIP; hold-out used once; LLM judge not built | [stage-5-evaluation.html](stages/stage-5-evaluation.html) |
| 6 · Integration & UX | Partly done | Chat, agent inbox, PM control panel, the 3 UX pillars, Telos critique. Usability test with 5 people not run | [stage-6-integration-ux.html](stages/stage-6-integration-ux.html) |
| 7 · Staged Launch | Partly done | Shadow run done (3 runs). **Stopped before the internal beta.** Pilot not started | [stage-7-staged-launch.html](stages/stage-7-staged-launch.html), [shadow-run-results.md](stages/shadow-run-results.md) |
| 8 · Monitoring & Feedback | Built, no real data | PM control panel, alerts as automatic recommendations, weekly report format. Waits for real chats | [stage-8-monitoring.html](stages/stage-8-monitoring.html) |
| 9 · Iteration & Retraining | Running on the eval only | 12 versions, each with scores; weekly fix cycle and learning loop defined; case study outline | [stage-9-iteration.html](stages/stage-9-iteration.html) |

All stage reports: [docs/stages/index.html](stages/index.html).

## Key numbers

### Eval, version 1.0.11 (fixed eval date): SHIP

| Measure | Result | Gate or target |
| - | - | - |
| Fraud recall | 13/13 | must be 100% |
| Harmless | 7/7 | must be 1.00 |
| Security (red team) | 18/18 | all must pass |
| Honesty | 5/5 (cases 21, 57, 59, S3, S6) | 21, 57, 59 must pass |
| Intent accuracy | 98.3% (59/60) | 90% |
| Grounded answers | 96.6% (28/29) | 90% |
| Recall@3, notice match | 100%, 100% | 95%, 100% |
| Citation recall, precision | 100%, 63.2% | 90%, 90% (precision not a gate, below target) |
| Speed | p50 2.6 s, **p95 6.4 s** | 6 s in the pilot: watch |
| Cost | US$0.0235 for the run, US$0.00039 per answered message | |

Still failing, none of them a gate: case 20 (an injection attempt handed to a person instead of answered), 45 (account takeover read as phishing, still sent to Fraud) and S4 (card declined abroad read as a damaged card, handed to a person).

### Shadow run on 200 tickets

| Measure | Run 1: Stage 2 tickets | Run 2: linked | Run 3: linked + new facts (1.0.11) |
| - | - | - | - |
| Would have resolved | 23.0% (46/200) | 59.0% (118/200) | **63.0% (126/200)** |
| Agent minutes saved | 455 | 1,138 | 1,207 |
| Fraud tickets missed | 0 of 16 | 0 of 16 | 0 of 16 |
| Answered where an agent was needed | 0 | 0 | 0 |
| Intent accuracy | 98.0% | 99.5% | 100% |
| Cost per answered message | EGP 0.018 | EGP 0.025 | EGP 0.024 |
| p95 | 5.7 s | 5.2 s | **6.0 s** |

63% of all tickets is 89% of the 142 tickets an agent would have given the copilot. Details: [shadow-run-results.md](stages/shadow-run-results.md).

**Speed is the number to watch.** p95 was 6.0 s in the last shadow run and 6.4 s in the last eval, against a 6 s pilot gate (it was 4.2 s in the run before). Nothing in 1.0.11 adds work per message, so API speed at that hour is the likely cause, but it is not proven. If the beta shows the same, the planned fix is the Telos recommendation: hand off after 6 s.

### Spend

- This round (linked tickets to baseline lock): about **US$0.19**. Two shadow runs (US$0.0585, US$0.0600) and three eval runs (US$0.0222, US$0.0240, US$0.0235).
- The whole project: about **US$2.05** in eval, bake-off and shadow runs (US$1.80 before this round, plus the first shadow run at US$0.06 and this round).

## Decisions in this round, and who made them

| Decision | Decided by | Result |
| - | - | - |
| Regenerate the 200 tickets from the customer records, keep counts, mix and labels; ask each ticket at a fixed time | Owner, via the project assistant | Done: `tools/build_linked_tickets.mjs`. Shadow went from 23% to 59% |
| Narrow the "unexplained EGP 50" trap row (version 1.0.10) | Owner asked for it; I wrote the wording | **Rejected:** the eval said DO NOT SHIP (cases 2 and 29 broke). Reverted to the 1.0.9 row |
| Give the eval a fixed date (`EVAL_NOW`) | Me, as a bug fix | The eval had failed 3 card cases only because it ran after 30 Oct. Rerun on 1.0.9: SHIP |
| An unexplained EGP 50 is `fee.overdraft` everywhere | Owner (decision 2) | Rule added to the ticket script. Changed 0 labels |
| Add branch hours and the cheque book price as synthetic facts, and move honesty cases 21 and 57 to facts Nova still doesn't have | Owner chose option A out of the three I listed | FEE-1.5, GEN-1, GEN-2 added; case 21 now asks the safe deposit box price, 57 holiday branch hours. A product decision, not a reaction to failed results. Version 1.0.11: SHIP |
| Lock 1.0.11 as the baseline | Owner, via the project assistant | `docs/baseline.json`, 1.0.9 kept as the previous baseline |
| Stop before the internal beta and document | Owner | This page |

Earlier decisions (Round 0, model choice, threshold, automation modes, product names) are in [docs/stages/index.html](stages/index.html) and `prompts/CHANGELOG.md`.

## What is synthetic, and what is not proven yet

- **All data is synthetic:** customers, transactions, disputes, tickets, policies, fees, branch hours and the cheque book price. The WhatsApp phrasing sheet is simulated, not real replies.
- **No real users yet.** The 63% is a shadow number on synthetic tickets. The North Star (verified resolution rate) has not been measured with real people.
- **The hold-out was used once** (against 1.0.8: 6/7 grounded, a strict DO NOT SHIP because of one safe handoff). The next release check needs a fresh hold-out, written by someone who hasn't seen the eval set.
- **Not built or not run:** the LLM judge (a second model scoring answers), and the usability test with 5 Arabic or Franco-Arabic speakers.
- **English is the weakest language:** all three failing eval cases are in English. The stage 5 gap check (no more than 0.05 between languages) is not met.
- **Citation precision is about 62 to 63%:** answers cite extra rules. Not a gate, but below the 90% target.
- **Known gaps from the last shadow run:** the copilot doesn't infer "closed on Saturday" from the Sunday-to-Thursday hours (2 handoffs), and Nova has no branch list, so "nearest branch" always goes to a person (2 handoffs).
- **Case 21 got easier:** the safe deposit box is also the "bad answer" example inside the answer prompt. Case 59 (certificate of balance) is the clean honesty check.
- **OpenAI and Gemini were not tested** (no keys). Anthropic is for the pilot only.
- **The published lifecycle pages** (`docs/LIFECYCLE-PAGES.md`) match the GitHub copies as of commit 19b4cec.

## What's next, and what it needs

Everything left needs people; none of it can be finished by the build alone.

1. **Internal beta (stage 7):** 5 to 10 classmates or colleagues, about 50 conversations in Suggest-only mode, fraud and complaint scenarios on purpose. An agent approves every AI answer. About 2 days.
2. **Pilot (stage 7):** 10 to 20 people with the scenario cards in Auto-answer mode, to measure "Did this solve your question?" against the 40% target. About 5 days. Present it as evidence, not statistical proof.
3. **Before or during the beta:** a fresh hold-out from a second person, and a check of p95 speed.
4. **Case study (portfolio):** the two-page write-up (problem, research, decisions and trade-offs, the metric and its result, what I'd do differently). Best written after the pilot, so it has a real result; until then, the shadow run is the evidence, clearly marked as synthetic.

To restart: follow the README to run the app (`node server.js`), reset the demo as the README says, then follow the beta plan on the stage 7 page.
