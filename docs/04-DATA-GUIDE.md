# Data guide, Nova Bank support copilot (Stage 2)

Every file the copilot reads or the team labels, its format, and where it sits in the architecture. **Everything here is synthetic.** Nova Bank is fictional, and no real customer, card or account is in this kit.

## Honesty note for Demo Day

Two Stage 2 steps need real people. For now they are **simulated** and marked that way in the files:

| Step | What the brief asks | What is in the kit now | How to make it real |
| - | - | - | - |
| Real phrasing | 5 Egyptian friends answer 9 questions on WhatsApp | `data/whatsapp-phrasing.csv`, 45 replies written to sound real, every row marked `SIMULATED` | Send the 9 questions in the `what_we_asked` column to 5 friends. Paste their exact words into `reply_as_typed`, typos included, and change `source` to `real` |
| Double labelling | Two people label the same 50 tickets | Labeller A and labeller B columns in `data/tickets-labelled.csv` for tickets T-0001 to T-0050, `source` says `labels simulated` | Give a teammate the 50 messages without labels. Put their answers in `labeller_b_intent` and recount |

Say this plainly to the panel: "the pipeline, checks and gates are real; the human inputs are simulated until we run them."

## Where each file sits in the architecture

| Step in the flow | File | Format | Count | Who writes it |
| - | - | - | - | - |
| 4 · Lookup | `data/customers.json` | JSON | 50 customers | Synthetic (the bank's core system in real life) |
| 4 · Lookup | `data/cards.json` **new** | JSON | 58 cards (50 debit, 8 credit) | Synthetic (card system) |
| 4 · Lookup | `data/transactions.json` | JSON | 504 rows, Aug to Oct 2026 | Synthetic (core banking) |
| 4 · Lookup | `data/disputes.json` | JSON | 15 disputes, every stage | Synthetic (disputes system) |
| 4 · Lookup | `data/service-status.json` | JSON | 3 notices | Digital and Card Operations |
| 5 · Answer (cached) | `knowledge/nova-policies.md` | Markdown, one rule ID per line | 39 rules | Policy owners |
| 2 · Understand | `knowledge/nova-taxonomy.md` | Markdown | 21 intents, traps, fraud words | Support lead |
| 2 · Understand | `knowledge/examples.jsonl` **new, Stage 3** | JSON Lines | 43 approved examples, growing weekly | Support lead approves. Never copied from the eval set. See 06-LEARNING-LOOP.md |
| 7 · Learn | `logs/corrections.jsonl` **new, Stage 3** | JSON Lines, masked | written by the agent inbox | Agents |
| 7 · Close or move | `data/tickets.json` | JSON, starts as `[]` | written by the app | The copilot |
| 7 · Log | `logs/messages.jsonl` | JSONL, one masked line per message | written by the app | The copilot |
| Stage 2 labelling | `data/tickets-labelled.csv` **new** | CSV (opens in Excel) | 200 tickets | Synthetic, labels simulated |
| Stage 2 phrasing | `data/whatsapp-phrasing.csv` **new** | CSV | 45 replies | Simulated |
| Eval | `knowledge/evalset.md` | Markdown tables | 60 + 6 + 4 + 12 cases | Cases 1 to 22 by a person, 23 to 60 synthetic |
| Final check only | `holdout.md` in `nova-holdout-sealed.zip` | Markdown | 15 cases | Sealed, kept outside the kit |
| Secrets | `.env` | text | 1 key | You. Never shared, never in a screenshot |

The JSON files are the MVP's database. In a real bank each one is an API call to the bank's own system, with the customer ID taken from the signed login, never from the message.

## What the records look like

**customers.json**: `customer_id`, `name`, `plan` (Current, Savings, Business), `tenure_months`, `contact_channel`, `card_last4`, `city`, `preferred_language` (ar, franco, en), `avg_balance_egp`. The city decides card delivery time (CRD-1: 5 business days in Cairo and Giza, 7 elsewhere). The average balance decides the EGP 15 monthly fee (FEE-1.1).

**cards.json**: `card_id` (CARD-0012-1), `customer_id`, `product`, `last4`, `expiry` (YYYY-MM), `status` (active, blocked, replacement_in_transit), and, when something is happening, a `renewal` block with `type` (expiry, damaged, lost_stolen), `dispatch_date`, `expected_by` or `delivered`, and the `fee_rule` that applies. Only the last 4 digits are ever stored.

**transactions.json**: `record_id` (TXN-YYYY-MM-DD-NNNN), `customer_id`, `date`, `merchant`, `amount_egp` (negative is money out), `category`, `status` (posted, pending, disputed). Fee rows also carry `fee_rule`, and `linked_txn` when the fee comes from another row (for example the 3% on a foreign purchase). Row `TXN-2026-09-22-0140` is the planted attack for red-team case R6 and is kept on purpose.

**disputes.json**: `dispute_id`, `customer_id`, `submitted`, `transaction`, `amount_egp`, `stage` (DSP-2), `receipt_confirmed`, `missing_documents`, `card_network` (Visa or none, DSP-6), `police_report_required` (true over EGP 5,000, DSP-4), plus `decision_date`, `closed` and `closed_reason` when they apply (DSP-7).

**tickets-labelled.csv**: `ticket_id`, `received_at`, `channel`, `customer_id`, `language`, `message`, `category`, `intent`, `priority`, `queue`, `resolution_minutes`, `agent_note`, `double_labelled`, `labeller_a_intent`, `labeller_b_intent`, `category_agreed`, `source`.

## What the data covers

| Area | Coverage |
| - | - |
| Fee rules in the transactions | 13 of the 14 fee rules that cost money appear (all but FEE-1.3, closing an account). Every fee row's amount matches its rule (3%, minimum EGP 75 abroad, at most 3 overdraft fees a month) |
| Dispute stages | Submitted 2, Under review 5, Waiting for merchant 3, Decision 2, Closed 3. One over EGP 5,000 (police report), two Visa card-network cases |
| Cards | Expiring next month (free renewal), a renewal that never arrived, a damaged card in transit, an express replacement already delivered, 5 blocked lost cards, credit cards for the FEE-4.5 trap |
| Cities | 9 cities, so "Cairo and Giza versus elsewhere" is tested |
| Tickets | 45 fees + 40 disputes + 35 cards = 120 (the brief's 60%), plus 80 other. 71 Franco-Arabic, 59 Arabic, 70 English |
| Eval set | 60 cases: 19 Arabic, 21 English, 20 Franco-Arabic (a third). Every case has a retrieval label, or `none` |

## Labelling check (simulated)

Two labellers on tickets T-0001 to T-0050:

- **Category agreement: 46 of 50 (92%)**, above the 90% target.
- **Intent agreement: 42 of 50 (84%).**

Where they disagreed, we fixed the definition in the taxonomy, not the label (see the four new rows in "Traps to watch"):

| Message | Labeller A | Labeller B | Fix |
| - | - | - | - |
| I want to dispute a double charge from Noon (3 tickets, different merchants) | dispute.open_request | fraud.unknown_txn | A double charge they made is a dispute. Only "I didn't make it" is fraud |
| el kart da3 mny | fraud.card_lost_stolen | card.replace_damaged | "da3" means lost |
| رجعولي الـ 100 جنيه من فضلك | fee.waiver_request | fee.explain | Asking for money back is a waiver request |
| What documents do you need for my dispute? (2 tickets) | dispute.documents | dispute.status | Any question about papers is documents |
| do I pay for the renewed card? | card.replace_expired | card.replace_damaged | "Renewed" means expiry |

## Checks that passed on this data

Every transaction ID is unique and matches its date. Every fee row matches its rule and amount. No customer has more than 3 overdraft fees in a month. No number of 12 or more digits appears anywhere. Every dispute points to its own customer's disputed transaction and was opened within 60 days. No closed reason uses the word "refund", so it can't trip the blocked-word check. Every ID in the eval set exists and belongs to that case's customer. The hold-out hash in evalset.md matches the sealed file.

## Rules for changing the data

1. Never add real data. Test card numbers only.
2. Don't change cases 1 to 22, or the records they point to. They are frozen, so scores stay comparable.
3. New record? Follow the ID patterns and add the fee rule to every fee row.
4. Changed a record that an eval case uses? Update that case's benchmark answer in the same change.
5. Never open or edit the hold-out until the Stage 7 release check.
