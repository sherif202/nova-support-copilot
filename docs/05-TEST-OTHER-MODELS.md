# Testing models from other vendors (Stage 3)

You can compare Claude, OpenAI's GPT and Google's Gemini now, before the app is built. There are two ways to do it.

| | A. Playground, no code | B. Model check script |
| - | - | - |
| What you do | Paste a few messages into each vendor's web page | Run one command on your laptop |
| Cases | 5 to 10, by hand | All 60, scored automatically |
| You get | A feel for the replies | Intent, priority and language accuracy, fraud recall, p50 and p95 speed, tokens and cost **per language** |
| Cost | Google: free. OpenAI: needs a little credit | About US$0.05 per cheap model for all 60 cases with answers |

All data in the kit is synthetic, so it's safe to send to any vendor. **Never send real customer data**, especially to a free tier.

## Get the keys

Keep every key like the Anthropic one: only in `.env`, never in a chat, never in a screenshot, never committed.

| Vendor | Where | Notes |
| - | - | - |
| Anthropic | console.anthropic.com → API keys | You already have this one |
| OpenAI | platform.openai.com → API keys. Add US$5 of credit under Billing | Needed for runs E and F |
| Google | aistudio.google.com → Get API key | Free tier with rate limits. Google may use free-tier data for training, which is fine for synthetic data only |
| OpenRouter (optional) | openrouter.ai → Keys, with a few dollars of credit | One key reaches Claude, GPT and Gemini. Good for quick tests, not for a bank's real traffic |

## A. Playground (10 minutes, no code)

1. Open Google AI Studio or the OpenAI Playground and pick the model (for example Gemini 2.5 Flash-Lite, or GPT-6 Luna).
2. In **System instructions**, paste this, then the whole of `knowledge/nova-taxonomy.md` under it:

   > You label customer messages for Nova Bank, a bank in Egypt. Customers write in Egyptian Arabic, English, or Franco-Arabic. Use ONLY the definitions, priorities and traps in the taxonomy below. Reply with JSON only: input_language, category, intent, priority (P0 to P4), confidence (0 to 1).

3. Paste messages from `knowledge/evalset.md`, one at a time. Start with the traps: cases 4, 10 ("3ayez badal fa2ed lel visa" must be P0 fraud), 16 and 21, plus three Franco-Arabic cases.
4. Compare the intent and priority with the "Expected" columns.

## B. Model check script (the one to show the panel)

```
npm install
cp .env.example .env          # then paste the keys you have
npm run model-check -- --runs fake:test
```

The fake run costs nothing and proves everything is in place. Then:

```
npm run model-check -- --limit 10
npm run model-check -- --answer
```

- `--limit 10` runs the first 10 cases on every model in `MODEL_CHECK_RUNS` in `.env`. Do this first, so a wrong key or model ID costs almost nothing.
- `--answer` runs all 60 cases and also writes an answer for the P2 cases, so you see how long answers are in Arabic, English and Franco-Arabic, and what a conversation really costs.
- To test other models: `npm run model-check -- --runs anthropic:claude-haiku-5-5,google:gemini-3.8-flash`
- On Google's free tier, add `--delay 4000` so you stay under the rate limit.

**Model IDs.** The IDs in `.env.example` are a best guess. Copy the exact ID from each vendor's models page. If an ID is wrong, the script says "model not found" and moves to the next one.

### Reading the result

```
▶ google:gemini-2.5-flash-lite  (60 cases, with answers)
  intent 92% · priority 95% · language 98% · fraud (model only) 10/10 · p50 0.61s · p95 1.40s
  ┌─────────┬───────┬────────┬─────────────────┬──────────────────────────┐
  │ arabic  │ 19    │ ...    │ answer tokens   │ egp_per_conversation_est │
```

These numbers are an illustration, not a result.

| Line | Gate | Note |
| - | - | - |
| intent | ≥ 90% | The main thing that separates vendors, especially on Franco-Arabic |
| priority | – | A wrong P0 is the dangerous miss |
| fraud (model only) | – | In the real app, fraud words are also caught in code, so the app's fraud recall must be 100% even if this isn't |
| p95 | under 4 s | This is only the understand step; the full reply takes longer |
| egp_per_message_understand, egp_per_conversation_est | EGP 0.035 a message | Measured tokens for one question; the answer step runs on about 60% of messages. A real conversation has several messages, so multiply by the expected length (4 to 5 in the pilot) |
| Misses | – | Read them. They tell you which trap or language the model struggles with |

Every run is saved to `logs/model-check-<time>.json` with each reply. No key is ever written to the log.

### What this does not test

It checks **understanding**, and with `--answer` it measures answer **length and cost**. It doesn't test lookup (the right records are handed over directly), output checks, red-team attacks or the judge. Those come in the full bake-off after build step 14, with the same models.
