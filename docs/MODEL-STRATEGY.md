# Model strategy: vendor-neutral by design

The copilot is not tied to one AI vendor. We piloted on one model to get a measured baseline. The production model is chosen by the same tests, plus the factors a bank must weigh.

## One adapter, switched by settings

`lib/model.js` is the only file that knows which vendor runs the copilot. It supports Anthropic, OpenAI and Google today. The rest of the app never sees the vendor. Every vendor returns the same answer format, has the same 15-second limit, and is checked by the same safety code.

Switching vendor is a change in `.env`, not in code:

```
PROVIDER=openai            # anthropic, openai or google
UNDERSTAND_MODEL=<model id>
ANSWER_MODEL=<model id>
ANSWER_EFFORT=low
BACKUP_PROVIDER=google     # used when the main vendor fails or times out
BACKUP_MODEL=<model id>
OPENAI_API_KEY=            # each vendor's key, pasted only into .env, never shared
GEMINI_API_KEY=
```

A message never makes more than 4 AI calls, even when the backup steps in.

## The pilot baseline (Anthropic, for measurement only)

Settings: Claude Haiku 5.5 for both steps, low effort, handoff below confidence 0.7. Locked baseline: version 1.0.15 (6 Nov 2026). Full numbers in `docs/baseline.json`.

| Gate | Result |
| - | - |
| Fraud recall (must be 100%) | 13/13 |
| Harmless (must be 1.00) | 7/7 |
| Security, red team (must be 100%) | 18/18 |
| Intent accuracy (90% or more) | 96.9% (63/65) |
| Grounded answers (90% or more) | 33/34, 97.1% |
| Record picker and investigator checks | 4/4 and 9/9 |
| Speed | 2.9 s typical, 5.5 s for the slowest 5% |
| Cost per message | about US$0.0002 to 0.0005; fraud, junk, the pickers and the investigator screens cost nothing |

Larger Anthropic models (Sonnet 5.5, Opus 5.5) cost 10 to 50 times more, were slower, and did not score better.

## How the production model is chosen

**1. The same gates decide for every vendor.** No model goes live unless it passes all of them on `knowledge/evalset.md`: fraud recall 100%, harmless 1.00, every red-team attack blocked, grounded answers 90% or more, intent accuracy 90% or more, the honesty cases. A fresh, unseen hold-out set is run once before release.

**2. The bake-off is already scripted.** Runs E to H (OpenAI and Gemini, build step 14b) use the same script and the same prompts. They run as soon as the keys are added:

| Run | Vendor | Status |
| - | - | - |
| A to D, T, U | Anthropic | Done, see `docs/baseline.json` |
| E, F | OpenAI | Waiting for a key |
| G, H | Google Gemini | Waiting for a key |

**3. The factors a bank weighs, after the gates:**

| Factor | Why it matters |
| - | - |
| Data residency, processing near Egypt | Where customer messages are processed and stored |
| Central Bank of Egypt and outsourcing rules | What the regulator allows for customer data and third-party AI. To confirm with Compliance |
| The bank's existing cloud contracts | Using a provider the bank already has a contract and a security review with |
| Cost per message | Measured per language, because Arabic uses more tokens |
| Arabic and Franco-Arabic quality | Measured by the same eval, case by case |
| Speed | The slowest 5% of messages should answer within about 4 seconds |
| No lock-in | A backup vendor from a different company, set in `BACKUP_PROVIDER` |

The guide's rule: drop any run that misses a gate, then any that is too slow, then take the cheapest. On a tie, take the vendor with processing nearer Egypt.

## An in-country or on-premise option

If regulation or the bank's policy requires that customer messages never leave Egypt or the bank, an open-weight model hosted in-country or on the bank's own servers can be added as one more branch in `lib/model.js`. It then goes through the same gates and the same bake-off before it can be used.

## What does not change with the vendor

These protections are in code, not in the model, so they hold for any vendor:

- **Fraud first:** fraud phrases go straight to the Fraud team, with no AI call.
- **Masking:** card numbers, CVV, PIN, OTP and national IDs are masked before any AI sees them.
- **Least data:** the AI sees only the logged-in customer's own records.
- **Answer checks:** every answer is checked for sources, amounts, promise words, requests for secrets, links and language.
- **Rate limit and kill switch:** 20 messages a minute per customer, and one setting sends every message to a person.

## Cost proxy for other vendors (6 Nov 2026)

A proxy, not a test: no GPT or Gemini model has run on Nova. It takes the tokens measured in the last 1.0.15 eval run (1,272,516 cached, 34,654 new input, 29,235 output) and prices them at each vendor's official list price, scaled to the base case of 5,400 chats a month (EGP 81 on Haiku, EGP 50 per US$).

| Model | Input · cached · output, US$ per million tokens | Cost against Haiku | AI cost a month, EGP | If caching fails, EGP | ROI if hiring falls |
| - | - | - | - | - | - |
| OpenAI GPT-6 Luna | 0.1 · 0.01 · 0.5 | 1.0× | 81 | 382 | +18% |
| Google Gemini 2.5 Flash-Lite | 0.1 · 0.01 · 0.4 | 0.9× | 73 | 374 | +18% |
| Anthropic Claude Haiku 5.5 (today) | 0.1 · 0.01 · 0.5 | 1.0× | 81 | 382 | +18% |
| Google Gemini 3.1 Flash-Lite | 0.25 · 0.025 · 1.5 | 2.7× | 222 | 974 | +18% |
| Google Gemini 3.8 Flash, until 31 Dec 2026 | 0.75 · 0.075 · 3.75 | 7.5× | 608 | 2,866 | +18% |
| OpenAI GPT-6.1 Terra | 1 · 0.05 · 5 | 7.9× | 643 | 3,821 | +18% |
| Google Gemini 3.8 Flash, from 1 Jan 2027 | 1.5 · 0.15 · 7.5 | 15.0× | 1,215 | 5,732 | +17% |
| Anthropic Claude Sonnet 5.5 | 2 · 0.2 · 10 | 20.0× | 1,620 | 7,642 | +16% |
| Anthropic Claude Opus 5.5 | 4 · 0.2 · 20 | 31.7× | 2,571 | 15,284 | +15% |
| OpenAI GPT-6 Astra | 10 · 1 · 50 | 100.0× | 8,100 | 38,211 | +9% |

Cost does not decide the vendor: even the dearest model is under 9% of the EGP 93,333 running and build cost. Accuracy on Arabic and Franco, speed, data residency and contracts decide it, and those can only come from a real test. Token counts, retries and cache use will differ by vendor. Quiet night hours may let a cache expire, which pushes cost toward the "caching fails" column. Google's context cache can also add a storage charge. Prices: developers.openai.com/api/docs/pricing, aistudio.google.com/docs/pricing, `lib/prices.js`.
