# Stage 7 shadow run results

**Run:** 30 Oct 2026, 21:46 UTC, `node tools/shadow.mjs`, against the app at commit `854e08f`.
**Settings:** Claude Haiku 5.5 (`claude-haiku-5-5`) for both steps, low effort, handoff below confidence 0.7, mode Auto-answer low-risk.
**Input:** all 200 labelled contact-center tickets in `data/tickets-labelled.csv` (synthetic, Stage 2). Nobody saw the copilot's answers; each route was compared with how an agent handled the ticket.
**Raw results:** `logs/shadow-2026-10-30T21-46-42-854Z.json` (local, not committed).

## Summary

| Measure | Result |
| - | - |
| Tickets processed | 200 (84 English, 65 Arabic, 51 Franco-Arabic) |
| Intent accuracy | 98.0% (196/200) |
| Priority accuracy | 100% |
| **Fraud tickets missed** | **0 of 16** (all reached the Fraud queue) |
| Answered where an agent was needed | 0 |
| Would have resolved | 46/200 (23.0%) |
| Agent minutes saved | 455 minutes (about 7.6 hours) on 200 tickets |
| Total cost | US$0.0591 |
| Cost per answered message | US$0.000365, **EGP 0.018** (at EGP 50 per US$) |
| Latency | p50 2.6 s, **p95 5.7 s** (gate 6 s) |
| Answer retries | 1 |

By language:

| Language | Tickets | Intent accuracy | Would have resolved |
| - | - | - | - |
| English | 84 | 98.8% | 17 |
| Arabic | 65 | 96.9% | 16 |
| Franco-Arabic | 51 | 98.0% | 13 |

## Wrong routes, by category

| Expected → got | Count | Why |
| - | - | - |
| Copilot → Agent | 96 | See below: mostly "no source" |
| Complaints → Supervisor | 2 | `sensitive.vulnerable` cases go to the head of agents by design (owner decision, Round 0). Still a person; not an error |
| Any → Fraud wrongly | 0 | |
| Fraud → anything else | 0 | |

Wrong intents: 4, all in the **fee** category, all `fee.explain` read as `fee.overdraft` (1 English, 1 Franco-Arabic, 2 Arabic). Side effect of the 1.0.2 trap row "an unexplained EGP 50 is overdraft". Low risk: they were handed off, not answered wrongly.

## Why 96 answerable tickets went to a person

| Reason | Count |
| - | - |
| No source: Nova's rules and the customer's records don't cover it | 87 |
| Not sure (confidence under 0.7) | 4 |
| The customer asked for a person | 5 |

The "no source" handoffs are mostly a **data mismatch, not a copilot failure**. The 200 tickets were generated in Stage 2 separately from the customer records, so many ask about things that don't exist for that customer:

- 22 of the 27 "no source" dispute questions come from customers with **no dispute record at all** (for example, C-0006 asks about a Careem dispute; C-0006 has no dispute).
- 22 other "no source" questions retrieved **no matching record** (for example, a 300-pound charge that isn't in that customer's transactions).
- 12 maintenance questions ran at the real time (30 Oct, evening), when no maintenance notice was live, so "no announced maintenance, a colleague" was the honest answer.

In each case the copilot refused to invent an answer, which is the honesty rule working ("no source, no answer"). So **23% is a lower bound**. The agent's "Copilot" label assumed the agent had the information; the copilot was right not to guess when it didn't.

## What this means for stage 7

- **Safety holds on new data:** 0 fraud misses, 0 answers where an agent was needed, priority 100%.
- **Cost and speed hold:** EGP 0.018 per answered message, far under the EGP 1 target; p95 5.7 s is under the 6 s gate but over the 4 s bake-off rule. Watch it in the pilot.
- **The resolution number needs linked data:** before using the shadow rate as a Key Result, regenerate the labelled tickets from the customer records (stage 2 generator, `build_tickets.py`), so every ticket's charge or dispute exists. Then rerun this script.
- **One fix to queue:** the `fee.explain` vs `fee.overdraft` confusion (4 cases): reword the 1.0.2 trap row so it fires only when the amount matches the overdraft fee in the customer's records.

## Next

1. Regenerate linked tickets and rerun the shadow (about US$0.06).
2. Fix the fee trap row, run the full eval (about US$0.02), log it in the CHANGELOG.
3. Then the internal beta in Suggest-only mode.
