# ROI model and request-level cost attribution

The PM control panel has an **ROI model** section (PM control panel tab, below the recommendations). It answers four questions from the same log: what the copilot is worth, what it costs, where the cost goes, and when a flat budget stops holding. No model call; everything is a rollup.

**All money figures beyond the token costs are synthetic assumptions** (`lib/roi-config.js`). Nova Bank is fictional and the sample is the 1.0.11 shadow run on 200 synthetic tickets.

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
| `outcome` | answered, handoff, fraud or fixed_reply |
| `verified_resolved` | Joined at rollup time from `logs/feedback.jsonl` ("Did this solve your question?"), because the log is append-only |

The message text stays masked as before (no full card number is ever saved), and no key is ever logged. Lines written before these fields existed are filled in from the older fields, so old logs still roll up (`lib/roi.js`, `recordsFromTurns`).

**Rollups from the same records:** cost per customer, per workflow, per conversation (to spot long loops and runaway retries), per prompt version, and cost per successful answer (AI cost ÷ resolved conversations).

## 2. The ROI formula

- **Value** = resolved conversations × agent minutes for that workflow × agent cost per minute.
  Agent minutes per workflow are the averages of `resolution_minutes` in the 200 labelled tickets, the same minutes the shadow script counts as saved.
- **ROI** = (value − AI cost − fixed cost) ÷ (AI cost + fixed cost), per month, projected to the monthly volume in the config.
- **Payback volume** = fixed monthly cost ÷ (value per conversation − AI cost per conversation): the conversations a month needed to cover the fixed cost.

| Assumption (synthetic) | Value |
| - | - |
| Agent cost | EGP 2.00 a minute |
| Fixed monthly cost (hosting, monitoring, a person reviewing the weekly report) | EGP 5,000 |
| Monthly contacts for the projection (Nova brief) | 45,000 |
| Committed monthly AI budget (flat tier) | EGP 1,000 |
| Exchange rate (`lib/prices.js`) | EGP 50 per US$ |

**Caveat for the panel:** the value is agent time freed, not cash saved. It becomes cash only if it replaces hiring (the brief expects 15% more contacts a year), or if the freed time is used elsewhere. The result is very sensitive to the agent cost per minute, which is an assumption.

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

1 credit = the AI cost of a median S conversation that called a model (EGP 0.0068 on the sample). Each business line has a monthly budget in credits (Retail 100,000, Business 45,000: about the EGP 1,000 budget, split 70/30 by contact share). When model prices change, only the EGP value of a credit changes; the budgets stay the same. Credits are easy to understand (one credit is about one simple question) and affordable to use.

## 6. Sample results (1.0.11 shadow run, 200 conversations)

| Measure | Result |
| - | - |
| Resolved | 126 of 200 (63%) |
| Value on the data set | EGP 2,418 (1,209 agent minutes) |
| AI cost on the data set | EGP 3.00 |
| Cost per successful answer | EGP 0.0238 |
| ROI on the data set alone, with a full month's fixed cost | −52% |
| **Payback volume** | **415 conversations a month** |
| Projected value per month (45,000 contacts) | EGP 543,960 |
| Projected AI cost per month | EGP 675, plus EGP 5,000 fixed |
| **Projected ROI per month** | **9,485%** |
| Within S to L | 80.0% |
| XL and XXL charged back | Retail 29 conversations (EGP 0.78), Business 11 (EGP 0.33) |
| Credits a month (projected) | Retail 66,035 of 100,000 (66%), Business 32,850 of 45,000 (73%) |
| Demand | Growth 13.5% over 4 weeks; projected AI spend EGP 766 against the EGP 1,000 budget |
| Negative-margin customers | 3 |
| Workloads | Optimise: dispute.status, card.replace_damaged, fee.overdraft. No sunset candidates |

Reading it: on 200 conversations the copilot doesn't cover a month's fixed cost (−52%), but it pays back from about 415 conversations a month, and at Nova's volume the value of the freed agent time is far larger than the cost. The most expensive conversations are single messages (no long loops); the very first one in the run cost the most because it wrote the prompt cache.

## Files

- `lib/roi.js`: rollups, ROI, tiers, the three tracks, credits, and the ROI recommendations
- `lib/roi-config.js`: all assumptions, tier limits and credit budgets
- `data/roi-sample.json`: the sample (no message text), rebuilt with `node tools/build_roi_sample.mjs`
- `server.js`: the attribution fields in the turn log
- `public/pm.js`: the ROI section and the "Load sample" switch
