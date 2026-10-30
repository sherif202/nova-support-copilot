# Stage 6: UX principles, applied

How the three design pillars show up in the Nova copilot. The AI logic, prompts and safety code are unchanged: these are interface features, plus small additions to the server that report what it already decided. Screenshots are in `docs/screenshots/`.

## Pillar 1: Trust and reliability

| Practice | What we built | Where to see it |
| - | - | - |
| Calibration and expectation setting | A first-message card: an AI assistant that answers only from your account and Nova's published rules; what it can and can't do; it never asks for a PIN, OTP or CVV; a person any time. Shown in the customer's own language (Arabic, right-to-left, for Arabic and Franco customers) | Chat, top. `01-chat-welcome-calibration.jpg` |
| Confidence feedback UI | A plain-words badge under every reply: "✓ Checked against Nova's rules and your records · high confidence", "↪ Passed to a colleague", "⚠ Fraud protection", "ℹ No AI was used". In the inbox: a High / Medium / Low confidence chip with the number, as text plus colour | Chat, every reply. Inbox, Confidence column. `02`, `08` |
| Progressive reliability | Low-risk questions are answered only after code checks pass; anything uncertain goes to a person. Every eval run is logged against the same gates (`docs/baseline.json`) | `prompts/CHANGELOG.md`, `docs/baseline.json` |
| Error transparency and fallback paths | Every handoff says why in one honest line (not sure, needs a person, for your safety, outside what I can do, failed a safety check, no source, assistant busy or off, too many messages) with the reference number and a "Talk to a person now" button. A network error offers "Try again" or a person, never a broken screen | Chat, under each handoff. `03`, `05` |

## Pillar 2: Transparent, digestible explainability

| Practice | What we built | Where to see it |
| - | - | - |
| Layered explanations (general → feature → decision) | "Why this answer?" under every AI answer. **General:** "Based on your own account and Nova's published rules." **Feature:** each source in plain words, e.g. "Nova fee schedule: Withdrawal abroad: 3% of the amount, with a minimum of EGP 75" and "Your transaction on 8 Sep 2026: ATM withdrawal, Dubai, EGP 2,000", with the rule or record ID small. **Decision:** how it was read, the confidence, why it answered on its own, and how many safety checks passed | Chat, "Why this answer?". `02` |
| Progressive disclosure UI | The explanation is collapsed until the customer asks for it. In the inbox, "Why routed here?" opens the label, priority, confidence, routing rule, records looked up and sources cited for each ticket | Chat and inbox. `02`, `07` |
| User-centric language | No raw codes on the customer screen: rule and record IDs are moved out of the answer into "Why this answer?". Intents read as "Fee question" or "Unknown payment", statuses as "Waiting for an agent" or "Approved, sent to customer" | Chat answers, inbox Intent and Status columns |
| Visual explanation aids | Icons per source type (📘 rule, 🧾 transaction, ⚖ dispute, 💳 card, 📢 notice); green, amber and red by outcome, always with words | `02`, `07`, `08` |

## Pillar 3: Human agency and steering

| Practice | What we built | Where to see it |
| - | - | - |
| Progressive automation and opt-in modes | An automation mode switch in the inbox, shown in the header on both views: **Off** (every message to a person, no AI; the same as `COPILOT_ENABLED=false`), **Suggest only** (the AI drafts, an agent edits and approves before the customer sees it), **Auto-answer low-risk** (today's behaviour and the default). Every change is logged to `logs/mode.jsonl`. Customers opt in to suggested questions with one tap | Inbox, Automation mode. `06`, `08` |
| Custom controls | Suggested questions, a queue filter in the inbox, "Did you mean…" options | Chat and inbox. `05` |
| Undo, override and fallback | "Talk to a person" is always visible and makes no AI call. "Did you mean…": when the copilot isn't sure and its guess is a low-risk question, it offers up to 2 options plus a person (never for fraud, complaints, sensitive or out-of-scope); the ticket is still created, and a picked option is answered and marks it "Resolved: customer picked an option". "Block card" asks to confirm and has Cancel. Agents can "Edit reply" in Suggest mode, change a label ("Wrong label?"), close a ticket, and **Undo** either within 10 seconds | Chat and inbox. `04`, `05`, `06`, `07` |
| User feedback loops | 👍 / 👎 under every AI answer; 👎 asks for an optional one-tap reason (wrong, unclear, not what I asked) and offers a person. Saved to `logs/feedback.jsonl`; counts shown in the inbox. Agent label corrections go to `logs/corrections.jsonl`. Nothing changes `knowledge/` until a person approves it | Chat and inbox. `08` |

## What did not change

The safety code still decides first: fraud words go to the Fraud team with no AI call, card numbers and codes are masked before anything is saved, every answer passes the output checks, the rate limit and kill switch still apply. "Did you mean…" can never route around them: a picked option is used only when the understand step still sees a low-risk question.

## Two notes for the bank

- The "Suggest only" reply to the customer ("A colleague is checking my answer before you see it") and the one-line handoff reasons are new wording written for this demo. They belong in `prompts/replies.md` with Compliance sign-off before going live.
- The rule text in "Why this answer?" comes from `knowledge/nova-policies.md`, which is in English; Arabic customers see the Arabic rule family name with the English rule text until the policies are translated.
