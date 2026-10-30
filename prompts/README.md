# Nova's prompts (Stage 4)

The prompt is the product. These files are the copilot's behaviour, so they are versioned like code: in git, with a changelog, a version number, and an eval score for every change.

| File | Used at | Who changes it |
| - | - | - |
| `understand.md` | Build steps 6, 7, 7b: label every message | PM |
| `answer.md` | Build steps 8, 8b: write the answer for P2 and greetings | PM |
| `retry.md` | Build step 12: the one retry after a failed output check | PM |
| `replies.md` | Steps 9 to 13: fixed replies sent by code, never by a model | PM, signed off by Compliance |
| `CHANGELOG.md` | Every change, with its score | Whoever changes a prompt |

## How a prompt is put together

Code fills the `{{PLACEHOLDERS}}` when the server starts (the knowledge files) and for every message (the customer's data). The order matters for cost:

1. **Cached, the same for every message:** sections 1 to 8, then the knowledge in this order: taxonomy, approved examples, policies. Put nothing that changes per message here. A single changed character above the cache point means every message pays full price.
2. **Not cached, built per message:** the time in Cairo, this customer's top 3 records, live notices, the last few turns (masked), and the message.

Cached input costs about a tenth of normal input on all three vendors, so the long part of the prompt costs almost nothing after the first message.

**Check that caching really works.** Each vendor has a minimum size before it caches anything. The understand prompt is roughly 3,500 to 4,000 tokens with the taxonomy and examples; the answer prompt is roughly 2,500 to 3,000 with the policies. If the model check or the log shows zero cached tokens, the prompt is under that vendor's minimum: then the cost per message is higher than the Stage 3 table, and you either accept it or add the next approved examples to cross the minimum. Measure, don't assume.

## Written to work on any vendor

Stage 3 kept Claude, GPT and Gemini in the bake-off, so the prompts use nothing that only one vendor understands:

- Plain Markdown headings and simple tags like `<policies>`. All three read them the same way.
- The output is one JSON object. The adapter (`lib/model.js`) also turns on each vendor's own structured-output mode, and code still checks the JSON, because a mode can be switched off by mistake.
- No temperature, no "think step by step", no role-play tricks. The steps are written out instead.
- The same files go to every vendor. If one vendor needs a change, that's a finding for the bake-off, not a second prompt.

## The rules for changing a prompt

1. **One change at a time.** Then run build step 14 and write the scores in `CHANGELOG.md`.
2. **Every failure becomes an example.** Add the wrong and the right answer to section 7 (as a "bad, then fixed" pair), or a trap row to the taxonomy, or an approved line in `knowledge/examples.jsonl`. Never paste an eval or hold-out case: rewrite it with different words, amounts and dates.
3. **Bump the version** in the file's first line and in the changelog.
4. **Stop when it converges:** two versions in a row within 0.02 of each other, no hard-gate failure.
5. **Rules that matter for safety live in code too.** The prompt asks; code enforces: fraud words, masking, blocked words, sources, amounts, language, the retry limit. A prompt alone is never the guardrail.
