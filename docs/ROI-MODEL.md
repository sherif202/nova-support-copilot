# ROI model and request-level cost attribution

The PM control panel has an **ROI model** section (PM control panel tab, below the recommendations). It answers four questions from the same log: what the copilot is worth, what it costs, where the cost goes, and when a flat budget stops holding. No model call; everything is a rollup.

**All money figures beyond the token costs are assumptions** (`lib/roi-config.js`) until the bank or the pilot replaces them. Nova Bank is fictional and the sample is the 1.0.11 shadow run on 200 synthetic tickets (the last shadow run). Live data uses the current version (1.0.15); the turn log also counts the record picker, and the investigator has its own metrics in the panel.

**Correction, 6 Nov 2026.** The first version of this model showed an ROI of 9,485%. That number was wrong, and the mistake was mine. It multiplied the shadow's 63% by all 45,000 contacts, as if every contact came to the chat, was in scope and was resolved. It set the running cost at EGP 5,000 a month and left out building and connecting to the bank. This page replaces it.

Screenshot: [`docs/screenshots/12-pm-roi.png`](screenshots/12-pm-roi.png). To see it: run the app, open the PM control panel and tick **Load sample**, or open `http://localhost:3000/?view=pm&sample=1&focus=roi` for the ROI section on its own.

## 1. Request-level cost attribution

Every customer message is logged once in `logs/messages.jsonl`, with stable fields captured at the request entry point (`server.js`, `writeTurnLog`). This extends the existing turn log rather than adding a second one:

| Field | What it is |
| - | - |
| `request_id` | The message ID |
| `conversation_id` | The "agent run": per customer, until an outcome (an AI answer or a handoff) |
| `customer_id`, `segment`, `business_line` | The customer, their plan, and the business line that owns the cost (Retail or Business banking) |
| `workflow` | The intent |
| `prompt_version` | Understand and answer prompt versions with their hashes |
| `model_ids`, `provider`, `deployment` | Which models ran, the vendor, and the mode (off, suggest, auto) |
| `tokens`, `retries`, `latency_ms` | Tokens in and out, answer retries, time to reply |
| `cost_usd`, `cost_egp` | Cost of the request, at the exchange rate in `lib/prices.js` |
| `outcome` | answered, handoff, fraud, fixed_reply or asked (a clarifying question) |
| `verified_resolved` | Joined at rollup time from `logs/feedback.jsonl` ("Did this solve your question?"), because the log is append-only |

The message text stays masked as before (no full card number is ever saved), and no key is ever logged. Lines written before these fields existed are filled in from the older fields, so old logs still roll up (`lib/roi.js`, `recordsFromTurns`).

**Rollups from the same records:** cost per customer, per workflow, per conversation (to spot long loops and runaway retries), per prompt version, and cost per successful answer (AI cost ÷ resolved conversations).

## 2. The ROI model

**The funnel.** Not every contact reaches the copilot, and not every chat ends the problem:

45,000 contacts → 60% in scope (27,000) → share that start in chat → share of those chats resolved with no repeat contact in 7 days

| Case | Start in chat | Resolved | Resolved contacts a month |
| - | - | - | - |
| Low | 10% | 25% | 675 |
| Base | 20% | 40% | 2,160 |
| High | 35% | 55% | 5,198 |

The 40% is the North Star target. None of these three rates has been measured; the pilot measures them. The shadow's 63% is not used here, because it is an answer rate on synthetic tickets.

**Two ways to count the value**, because the question is what the bank really gets:

- **Talk time only:** resolved contacts × 9.6 agent minutes × EGP 2 a minute = EGP 19.19 for each one. This counts only the minutes spent on the contact.
- **If hiring really falls:** each contact resolved is 1 of the 375 contacts an agent handles a month (45,000 ÷ 120 agents). At EGP 19,200 a month for an agent (160 hours at EGP 2 a minute), that is EGP 51.2 for each one. This counts the whole paid month, and it is true only if the bank hires fewer people.

**ROI** = (value − cost) ÷ cost, per month. **Break-even** = the resolved contacts a month where the value covers the cost.

| Assumption | Value |
| - | - |
| Agent cost, with salary, seat and overhead | EGP 2.00 a minute |
| Agent minutes per resolved contact (average of the labelled tickets) | 9.6 |
| Agents, hours a month | 120, 160 |
| Fixed monthly cost: hosting, monitoring, a part-time knowledge owner, quality review and compliance | EGP 60,000 |
| Build, bank integration, security and compliance work | EGP 1,200,000, spread over 36 months |
| Monthly contacts (Nova brief), share in scope | 45,000, 60% |
| Committed monthly AI budget | EGP 300 |
| Exchange rate (`lib/prices.js`) | EGP 50 per US$ |

Fixed and build together come to EGP 93,333 a month. AI is about EGP 81 a month in the base case, so AI cost barely matters: the case depends on how many contacts are resolved, and on whether hiring falls.

| Per month | Low | Base | High |
| - | - | - | - |
| Resolved contacts | 675 | 2,160 | 5,198 |
| Agents' workload freed | 1.8 | 5.8 | 13.9 |
| Value, talk time only | EGP 12,951 | EGP 41,445 | EGP 99,726 |
| Value, if hiring falls | EGP 34,560 | EGP 110,592 | EGP 266,112 |
| Cost, with AI | EGP 93,374 | EGP 93,414 | EGP 93,475 |
| **ROI, talk time only** | **−86%** | **−56%** | **+7%** |
| **ROI, if hiring falls** | **−63%** | **+18%** | **+185%** |

**Break-even: 1,824 resolved contacts a month if hiring falls, 4,869 on minutes alone.** That is 6.8% and 18% of in-scope contacts.

**The honest reading:** this is a modest case that pays only if the bank really hires fewer people, or moves agents to other paid work. Saved minutes alone don't pay for it unless the high case comes true. The brief expects 15% more contacts a year, about 18 more agents, so the base case would absorb about a third of one year's growth. All costs are assumptions to replace with the bank's figures.

## 3. Size tiers and the tenets

Each conversation is put in a size by its AI cost. The limits come from the sample's cost percentiles and are stored in `lib/roi-config.js`:

| Size | AI cost up to | Sample share |
| - | - | - |
| S | EGP 0.01565 (p50) | 50% |
| M | EGP 0.01695 (p70) | 20% |
| L | EGP 0.01835 (p80) | 10% |
| XL | EGP 0.0324 (p95) | 15% |
| XXL | above | 5% |

**Tenet 1: at least 80% of conversations stay within S to L** (the tile "Within S to L"). On the sample it is exactly 80% by construction; on live data it moves, and the panel raises a HIGH recommendation when it falls under 80%.
**Tenet 2: S, M and L cover the work; XL and XXL are flagged for review and charged back** to the business line that owns the customer. This is the internal version of "charge for XL and XXL".

## 4. What to track

- **Customers:** AI cost against value saved per customer. A customer is flagged as negative margin when the cost has no value against it (no resolved conversation), usually out-of-scope or high-variance questions.
- **Workloads:** cost per workflow, with advice for each:
  - **Optimise:** resolves well but costs more than the in-scope median; check retries, caching or a cheaper model.
  - **Keep:** resolves well at a low cost.
  - **Re-price / review:** most still go to a person after the AI cost; close the knowledge gap or charge it back.
  - **Sunset:** never resolves; stop answering it with AI.
  - **Route only:** out of scope or fraud; the AI only labels and routes it.
- **Demands:** weekly volume against the committed budget. An alert fires when the projected monthly AI spend goes over the budget, or when volume grows more than 15% in four weeks while the budget stays flat.

## 5. Credits (internal unit)

1 credit = the AI cost of a median S conversation that called a model (EGP 0.0068 on the sample). Each business line has a monthly budget in credits (Retail 30,000, Business 14,000: about the EGP 300 budget, split 70/30 by contact share). When model prices change, only the EGP value of a credit changes; the budgets stay the same. Credits are easy to understand (one credit is about one simple question) and affordable to use.

## 6. Sample results

The cost measures below come from the 1.0.11 shadow run on 200 conversations. They are real measurements on synthetic tickets. The scenario results are in section 2.

| Measure | Result |
| - | - |
| Answered with the right intent | 126 of 200 (63%), an answer rate, not verified resolution |
| AI cost on the data set | EGP 3.00 |
| Cost per successful answer | EGP 0.0238 |
| Within S to L | 80.0% |
| XL and XXL charged back | Retail 29 conversations (EGP 0.78), Business 11 (EGP 0.33) |
| Credits a month (projected) | Retail 7,924 of 30,000 (26%), Business 3,942 of 14,000 (28%) |
| Demand | Growth 13.5% over 4 weeks; projected AI spend EGP 92 against the EGP 300 budget |
| Negative-margin customers | 3 |
| Workloads | Optimise: dispute.status, card.replace_damaged, fee.overdraft. No sunset candidates |

The most expensive conversations are single messages (no long loops); the very first one in the run cost the most because it wrote the prompt cache.

## 7. The load simulator

The ROI model above is one average month. The simulator (`public/roi-simulator.html`, linked from the ROI section of the PM panel and included in the published ROI page) plays 720 hours of chat, with the day and night pattern, weekends, salary days and 8 events: Ramadan, the yearly fee day, new fee rules, a phishing wave, Eid, a card network outage, an app outage and a White Friday sale.

You change who presses send, the confidence level, the clear question and a bigger model. It reports net value, bad answers, agents needed by shift and the wait for a person, and it compares 48 setting combinations to find the sweet spot. It charges each bad answer at 15 good ones, and a setting must keep AI-sent answers at 24 in 25 or better and stay within the reply time you accept. A normal month with today's settings matches the base case: 2,160 resolved, +18% before bad answers.

Every rate is listed on the page. The day pattern, events and most confidence rates are estimates, to be replaced with the bank's contact log. The only measured inputs are the costs, the 5.5 s speed, the handling minutes and 13 of 32 right at confidence 0.6 to 0.69, all on synthetic data. It is deterministic, and it does not charge for customers left waiting, so read the money with the wait.

## Files

- `lib/roi.js`: rollups, ROI, tiers, the three tracks, credits, and the ROI recommendations
- `lib/roi-config.js`: all assumptions, tier limits and credit budgets
- `data/roi-sample.json`: the sample (no message text), rebuilt with `node tools/build_roi_sample.mjs`
- `server.js`: the attribution fields in the turn log
- `public/pm.js`: the ROI section and the "Load sample" switch
- `public/roi-simulator.html`, `.css`, `.js`: the load simulator (separate files because the app's security policy blocks inline code)
