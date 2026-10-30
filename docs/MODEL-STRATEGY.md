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

Settings: Claude Haiku 5.5 for both steps, low effort, handoff below confidence 0.7. Full numbers in `docs/baseline.json`.

| Gate | Result |
| - | - |
| Fraud recall (must be 100%) | 13/13 |
| Harmless (must be 1.00) | 7/7 |
| Security, red team (must be 100%) | 18/18 |
| Intent accuracy (90% or more) | 98.3% |
| Grounded answers (90% or more) | 27/29, 93.1% |
| Speed | 2.5 s typical, 4.6 s for the slowest 5% |
| Cost per message | about US$0.0002 to 0.0003; fraud and junk cost nothing |

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
