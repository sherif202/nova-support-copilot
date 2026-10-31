# Nova Bank support copilot (starter)

A help chat for Nova Bank that runs on your own computer. Nova Bank is fictional and every customer in `data/` is synthetic.

**The AI in this starter is fake on purpose.** Every message gets the same reply. You will make it real, one step at a time, with Claude Code, by following [docs/02-BUILD-GUIDE.md](docs/02-BUILD-GUIDE.md).

## Run it

You need Node.js LTS (version 18 or newer). The starter itself needs nothing else:

```
node server.js
```

Then open http://localhost:3000 in your browser. Stop it with Ctrl+C.

## Test models from other vendors (Stage 3)

Run `npm install` once, add the keys you have to `.env`, then:

```
npm run model-check -- --runs fake:test        # free, checks the script works
npm run model-check -- --limit 10              # 10 cases on every model in MODEL_CHECK_RUNS
npm run model-check -- --answer                # all 60 cases, with answers, cost per language
```

See [docs/05-TEST-OTHER-MODELS.md](docs/05-TEST-OTHER-MODELS.md).

## What's inside

| Path | What it is |
| - | - |
| `server.js` | The whole back end. `fakeCopilot()` is the function you will replace. |
| `public/` | The web page: a customer chat and an agent inbox. |
| `data/` | The "database": JSON files of synthetic customers (50), cards, transactions (504), disputes (15), service notices and the live tickets the app writes. Plus two CSV sheets for Stage 2: `tickets-labelled.csv` (200 labelled tickets) and `whatsapp-phrasing.csv`. See docs/04-DATA-GUIDE.md. |
| `knowledge/nova-taxonomy.md` | Categories, priorities, traps and safety rules. The copilot labels messages with these. |
| `knowledge/nova-policies.md` | The only facts the copilot may state, each with a rule ID it must cite. |
| `knowledge/examples.jsonl` | 43 approved example messages with the right label. Nova's memory of real phrasing: every model reads it, so switching models loses nothing. See docs/06-LEARNING-LOOP.md. |
| `knowledge/evalset.md` | 60 test messages, 6 service status cases, 4 junk inputs and 12 red-team attacks with the correct answers, and how to score them. The 15 hold-out cases are kept outside the kit. |
| `prompts/` | Stage 4: the copilot's prompts (understand, answer, retry), the fixed replies a person wrote, and the changelog with a score for every change. See prompts/README.md. |
| `docs/` | Setup checklist, PRD, the build guide with Claude Code prompts, the security and fraud defence guide, the data guide and how to test other vendors' models. |
| `tools/model-check.mjs` | Stage 3: runs the 60 eval cases through Claude, GPT or Gemini and reports accuracy, speed and cost per language. |
| `.env.example` | Copy to `.env` and add your Anthropic API key in step 5. OpenAI, Google and OpenRouter keys are optional, for the model check. |

## Project status

Stopped on 30 Oct 2026, before the internal beta. Version 1.0.11 is the locked baseline (eval SHIP, grounded 28/29); the stage 7 shadow run says the copilot would have resolved 63% of 200 synthetic tickets with 0 fraud missed. What is done, what is not proven yet and what comes next: [docs/PROJECT-STATUS.md](docs/PROJECT-STATUS.md).

## Built on top of the starter

| Path | What it is |
| - | - |
| `lib/` | The copilot: prompt loader, lookup, guard (masking, junk, injection flags), fraud word list, output checks, model adapter (vendor-neutral), explanations, PM metrics, prices. |
| `public/` | Three screens: customer chat, agent inbox, and the **PM control panel** (Key Results, cost per model ID, bottlenecks, iterations, auto-updated recommendations). Nova Bank logo in `public/logo.svg`. |
| `knowledge/nova-products.md` | Nova's product names in Arabic and English (صندوق سنابل، ودائع البركة…), names only, with how the copilot handles each. |
| `tools/eval.mjs` · `tools/redteam.mjs` · `tools/holdout.mjs` · `tools/shadow.mjs` · `tools/build_linked_tickets.mjs` | Step 14 eval with SHIP/DO NOT SHIP (asked at a fixed date), red team, the one-time hold-out run, the stage 7 shadow run on 200 labelled tickets, and the script that links those tickets to the customer records. |
| `docs/lifecycle/` | The lifecycle plan and the stage 1 to 4 pages, as published. |
| `lib/investigate.js` · `knowledge/nova-transaction-rules.md` · `data/transaction-details.json` | The transaction investigator (1.0.13-draft, behind `INVESTIGATE`): guided narrowing, one transaction explained, "I'm waiting for money", handoff with a summary. See `docs/INVESTIGATOR.md`. |
| `lib/picker.js` | The record picker: the customer's own transactions, cards and disputes as cards to tap, key facts in bold (1.0.12). |
| `docs/ROI-MODEL.md` · `lib/roi.js` · `lib/roi-config.js` | The ROI model in the PM panel: request-level cost attribution, ROI, size tiers, what to track, credits (synthetic assumptions). |
| `docs/PROJECT-STATUS.md` | Where the project stopped, stage by stage, with the numbers, decisions and open items. |
| `docs/stages/` | Visual stage reports 5 to 9 (open `docs/stages/index.html`). |
| `docs/telos/critique-card.html` | The screens critiqued against Nova's Key Results with the Telos method. |
| `docs/MODEL-STRATEGY.md` · `docs/UX-PRINCIPLES.md` · `docs/DEMO-SCRIPT.md` · `docs/baseline.json` | Vendor-neutral model strategy, the 3 UX pillars, the live demo script, and the locked SHIP baseline. |

## The API

| Call | What it does |
| - | - |
| `GET /api/customers` | The synthetic customers for the "Log in as" picker. |
| `POST /api/chat` `{customerId, message}` | One message in, one copilot reply out. |
| `POST /api/handoff` `{customerId, message}` | "Talk to a person". Creates a ticket in the Agent queue. |
| `GET /api/tickets` | What the agent inbox shows. |

## Reset the demo

Replace the contents of `data/tickets.json` with `[]` and delete the files in `logs/`.

## Rules for this project

- Your API key goes in `.env` only. `.env` is in `.gitignore`. Keep it secret. Never share it, never paste it into a chat, never let it appear in a screenshot.
- The server only listens on your own computer (127.0.0.1). See [docs/03-SECURITY-AND-FRAUD.md](docs/03-SECURITY-AND-FRAUD.md) for every defence.
- Synthetic data only. Never put a real customer's name, card number or account in this project.
