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
