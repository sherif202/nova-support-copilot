# Stage 7 shadow run results

Two runs of `node tools/shadow.mjs` on 30 Oct 2026, both with Claude Haiku 5.5 (`claude-haiku-5-5`) for both steps, low effort, handoff below confidence 0.7, mode Auto-answer low-risk. Nobody saw the copilot's answers; each route was compared with how an agent handled the ticket.

- **Run 1 (before), 21:46 UTC, commit `854e08f`:** the Stage 2 tickets as generated, asked at the real time.
- **Run 2 (after), 22:01 UTC:** the same 200 tickets regenerated from the customer records (`tools/build_linked_tickets.mjs`), each asked at a pinned time (`asked_at`).

Raw results: `logs/shadow-2026-10-30T21-46-42-854Z.json` and `logs/shadow-2026-10-30T22-01-36-379Z.json` (local, not committed). The old tickets file stays in git history (commit `c7d86ed`).

## What changed in the tickets

`tools/build_linked_tickets.mjs` keeps every ticket's id, intent, language, priority, queue, resolution minutes and double labels exactly as they were. It finds the Stage 2 template (`build_tickets.py`) each message came from and refills it from one customer's real records:

| Ticket type | Before | After |
| - | - | - |
| Fee questions | Random amount and day | A fee that customer was charged, with its amount and day. EGP 50 (the overdraft fee) only in `fee.overdraft` tickets |
| Dispute questions | Random customer and merchant | A customer with a dispute, and that dispute's merchant |
| Unknown payment, open a dispute | Random merchant | A real purchase of that customer |
| Card questions | Random customer | A customer with a working card |
| Maintenance questions | Asked at the real time (no notice live) | Asked during the notice they are about (29 Oct 20:15, 29 Oct 14:00 for "tonight", 31 Oct 02:30 for cards abroad) |
| Everything else | | Asked on 30 Oct 2026 between 08:00 and 18:00 |

62 messages were refilled; 138 needed no record details and kept their wording. Same 200 tickets, same mix (84 English, 65 Arabic, 51 Franco-Arabic), same queue labels (142 Copilot, 31 Agent, 16 Fraud, 11 Complaints). The injection test record in the transactions is never used as a ticket.

## Before and after

| Measure | Before | After |
| - | - | - |
| Tickets processed | 200 | 200 |
| Intent accuracy | 98.0% (196/200) | **99.5%** (199/200) |
| Priority accuracy | 100% | 100% |
| **Fraud tickets missed** | **0 of 16** | **0 of 16** |
| Answered where an agent was needed | 0 | 0 |
| **Would have resolved** | 46/200 (23.0%) | **118/200 (59.0%)**, 83% of the 142 tickets an agent marked "Copilot" |
| Agent minutes saved | 455 (7.6 hours) | **1,138 (19 hours)** |
| Total cost | US$0.0591 | US$0.0585 |
| Cost per answered message | US$0.000365, EGP 0.018 | US$0.000492, **EGP 0.025** (target under EGP 0.035) |
| Latency | p50 2.6 s, p95 5.7 s | p50 2.4 s, **p95 5.2 s** (gate 6 s) |
| Copilot → Agent | 96 | 23 |
| Complaints → Supervisor | 2 | 2 (by design: `sensitive.vulnerable` goes to the head of agents) |
| Any → Fraud wrongly | 0 | 0 |

An answer costs a little more now because more tickets get a full answer from the records (dispute timelines, fee explanations) instead of a short handoff.

By language:

| Language | Tickets | Intent before → after | Resolved before → after |
| - | - | - | - |
| English | 84 | 98.8% → 100% | 17 → 43 |
| Arabic | 65 | 96.9% → 100% | 16 → 42 |
| Franco-Arabic | 51 | 98.0% → 98.0% | 13 → 33 |

## Why the 24 remaining "Copilot" tickets didn't resolve

| Reason | Count | Comment |
| - | - | - |
| No source: branch hours, nearest branch, cheque book price | 10 | Nova's knowledge base has no branch or cheque-book facts. Add them, or move `general.info` out of scope |
| Customer asked for a person | 5 | Correct by design |
| No source: dispute details | 4 | For example, a police report question on a dispute at the Decision stage. A safe handoff |
| No source: card not reading | 2 | "The card doesn't read" isn't clearly damage. A safe handoff |
| No source: "charged 50 twice" when the records show one overdraft fee | 1 | The copilot was right not to agree with the customer |
| Answer failed its checks twice | 1 | Handed off (R-CHECK-FAILED) |
| Wrong intent | 1 | "50 taken twice this month, why" read as `fee.explain`, not `fee.overdraft`. Answered from the record anyway; not counted as resolved |

Before the data fix, 87 handoffs were "no source"; after, 17. **The 23% was a data problem, not a copilot problem.**

## The EGP 50 trap row (fix 2)

The 4 "fee.explain read as fee.overdraft" cases in run 1 were all "what is this 50 pounds" questions. In the linked tickets, a 50 charge is always the overdraft fee, so the confusion no longer appears in the shadow run.

We still tried narrowing the trap row in `knowledge/nova-taxonomy.md` (version 1.0.10): `fee.overdraft` only when the customer asks *why* 50 was taken, says it happened more than once, or mentions a low balance or overdraft; *what is this 50* → `fee.explain`. The full eval said **DO NOT SHIP**. Eval cases 2 ("ليه اتخصم مني 50 جنيه؟") and 29 ("el 50 geneh di overdraft wala eh?") flipped to `fee.explain`, so intent fell to 95.0% and grounded to 24/29. **Rejected and reverted to the 1.0.9 row** (CHANGELOG 1.0.10).

The underlying issue is labelling, not wording: the Stage 2 tickets label "why did you take 50 pounds" as `fee.explain`, while eval case 2 labels the same question `fee.overdraft`. Both routes answer from the same record and name the overdraft fee, so the customer gets the same answer either way. Recommendation: agree one label for "unexplained 50" in the taxonomy, and relabel the tickets to match, rather than tuning the prompt.

## A clock bug in the eval, found and fixed

The first eval run (after midnight in Cairo, 31 Oct) also failed cases 8, 9 and 40. All three were card questions for C-0012, labelled right at confidence 0.9 but handed off. The reason: C-0012's renewal card has a dispatch date of 31 Oct, so from that day it counts as "sent, not delivered" and the copilot hands off. The eval sent no fixed time for its main cases, so its result depended on the day it ran. `tools/eval.mjs` now asks every case at a fixed time (`EVAL_NOW`, default 2026-10-30 12:00 Cairo); status cases keep their own times. The hold-out script and set were not touched.

Rerun on 1.0.9 with the pinned clock: **SHIP**. Fraud 13/13, harmless 7/7, security 18/18, intent 96.7%, grounded 27/29 (93.1%), honesty 5/5, notice match 100%, citation recall 100%, p95 4.2 s, US$0.024. Same as the 1.0.9 baseline.

## What this means for stage 7

- **Safety holds on new data:** 0 fraud misses and 0 answers where an agent was needed, in both runs.
- **The shadow resolution rate is 59%** of all tickets (83% of those an agent would hand to the copilot), above the 40% North Star target. It is a shadow number on synthetic tickets: the pilot must confirm it with real customers' "Did this solve your question?".
- **Cost and speed hold:** EGP 0.025 per answered message, p95 5.2 s.
- **Two small product decisions:** add branch and cheque-book facts to the knowledge base, or move `general.info` out of scope (10 handoffs); and agree one label for "unexplained EGP 50".

## Next

1. Internal beta in Suggest-only mode (needs testers).
2. Optional: add branch hours and cheque-book prices to the knowledge base, then rerun the shadow.
