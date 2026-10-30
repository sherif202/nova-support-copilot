# Where Nova's learning lives

Nova doesn't train the model. Everything the copilot learns from real customers is written to **files Nova owns**, and every model reads those same files on every message. Switching from Haiku to GPT-6 Luna or Gemini is a line in `.env`. The new model starts with everything the old one had learned, on its first message.

## The stores

| File | Format | What it holds | Who changes it | How a model uses it |
| - | - | - | - | - |
| `knowledge/nova-taxonomy.md` | Markdown | Intents, priorities, **traps** (wrong label → right label → why), fraud words | Support lead, weekly | Whole file in the system prompt, cached |
| `knowledge/examples.jsonl` **new** | JSON Lines, one example per line | Real phrasings with the right intent and priority. Starts with 43 synthetic ones | Support lead approves; agents suggest | All `approved` lines in the system prompt, cached |
| `knowledge/nova-policies.md` | Markdown, one rule ID per line | The only facts the copilot may state | Policy owners | System prompt for the answer step, cached |
| `knowledge/evalset.md` | Markdown tables | Test cases with the right answers | Whoever fixes a miss adds the case | Never shown to the model. Scores every model the same way |
| `logs/messages.jsonl` | JSON Lines, masked | Every message, label, confidence, attempts, model, cost | The app | Where misreads are found |
| `logs/corrections.jsonl` **new** | JSON Lines | An agent's fix to a wrong label, with the reason | Agents, from the inbox | Reviewed weekly, then promoted |
| `logs/baseline.json` | JSON | The current provider, models, prompt hash and every score | The bake-off | A new model must beat it |

None of these files depends on a vendor. They are plain text that any model can read, and that a bank auditor can read too.

## One line in each new file

`knowledge/examples.jsonl`
```json
{"id": "EX-044", "message": "el visa mesh shaghala fi Dubai", "language": "franco", "intent": "service.status", "priority": "P2", "why": "Declined abroad, no unknown charge", "source": "pilot week 2, from C-0031, masked", "status": "approved", "added": "2026-11-20"}
```

`logs/corrections.jsonl`
```json
{"time": "2026-11-18T10:42:00+02:00", "message_id": "M-8812", "message": "el visa mesh shaghala fi Dubai", "model_label": "card.replace_damaged", "agent_label": "service.status", "agent": "A-07", "reason": "Card works, declined abroad only", "model": "claude-haiku-5-5"}
```

Messages are masked before they are saved: no card numbers, IDs, OTPs or names.

## The weekly loop (Stage 8 and 9)

1. **Find** every misread from the week: agent corrections, handoffs after a wrong answer, retries, low confidence.
2. **Fix the knowledge, not the model.** For each one, either add a trap row to the taxonomy, add an example to `examples.jsonl`, or fix a policy line.
3. **Add a test.** The same message becomes a new case in `evalset.md`, so the fix can never quietly break later.
4. **Rerun the eval** on the current model. Ship only if every gate still passes and nothing got worse than `baseline.json`.

That's why retries and conversation length should fall week by week: each misread happens once, then it's in the files.

## Switching models

1. Change `PROVIDER` and the model IDs in `.env`.
2. Run the eval set. The new model reads the same taxonomy, examples and policies, so it starts already "knowing" every fix.
3. Compare with `baseline.json`. Switch only on a pass.

Nothing is lost, because nothing was stored inside the old model.

## Rules for the examples bank

- **Never copy an eval or hold-out case into it.** If the model sees the test, the test means nothing. The model check and step 14 both rely on this.
- Only the support lead sets `status` to `approved`. Agents' suggestions start as `proposed`.
- Keep it balanced: no intent with more than 10 examples, and at least a third Franco-Arabic.
- Up to about 200 examples, put all of them in the cached prompt. That costs almost nothing, because cached input is about a tenth of the price. Past 200, pick the 20 most similar examples per message.
- Mask before saving, always.

## Fine-tuning (only if this isn't enough)

If intent accuracy stays under 90% after a few weekly loops, `data/tickets-labelled.csv`, `examples.jsonl` and `corrections.jsonl` are already the training set, in a plain format every vendor accepts. A fine-tuned model is tied to one vendor, though, so it's the last step, not the first.
