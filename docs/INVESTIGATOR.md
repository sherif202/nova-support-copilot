# Transaction investigator (1.0.13)

The copilot works **with** the customer to find the exact transaction they mean, explains its status and history step by step, and checks for money on its way before anything goes to a person. When a person is needed, the agent gets the full picture.

**Status:** shipped in 1.0.13 (eval SHIP, 31 Oct 2026). On by default; set `INVESTIGATE=off` to turn it off. It was first built as a draft without an eval at the owner's request, then tested: 9 investigator checks in the eval (V1 to V9, all pass), 15 free unit checks (`node tools/test-investigator.mjs`, all pass), and 5 typed questions (cases 61 to 65) now that the AI knows the transaction rules.

**How it stays safe:** the screens are deterministic. Narrowing, matching, status reasons, timelines and expected dates are built by code from the logged-in customer's own records and the rule text, with no model call. Since 1.0.13 the AI also has the transaction rules (TXS) and each record's status facts, so a typed question ("why was my payment declined?", "I'm waiting for money from Ahmed") gets the same answer as the screens, with the usual output checks.

## The flows

### a) Find a transaction (guided narrowing)

The customer taps **🔎 Find a transaction**, or **Search all my transactions** under a "Which one do you mean?" picker. Chips narrow the search, and a live count ("**3** of 10 transactions match") updates after every tap:

- **When?** Today · Yesterday · This week · This month
- **How?** Card in a shop · Online · ATM · Transfer or InstaPay
- **Money in or out?**
- **How much, roughly?** Under 500 · 500 to 5,000 · Over 5,000
- **Where?** Free text, plus a **memory jogger**: "Not sure where? Places in these results: Amazon.eg · Breadfast · Uber"

Clues the customer already typed are pre-filled ("From your message: This week · Online"), so those steps are skipped. Results are tap cards: **amount and date in bold**, merchant, channel, area, card •••• last 4, and a status badge (Posted, Pending, Declined, Reversed, Refund on its way). "It isn't here" hands over with what was checked.

### b) One transaction, explained

- **Memory jogger:** "You made this at Carrefour Maadi (Maadi, Cairo) with your card ending 4437 (card in store) on Fri 30 Oct, 18:42, POS 7712."
- **What happened, step by step:**
  - "Tried Fri 30 Oct, 18:42 at Carrefour Maadi"
  - "Declined: your available balance at that moment was EGP 980, less than the EGP 1,450 payment"
  - "No money was taken"
- **Why it is pending or declined**, in plain words with the rule ID (TXS-x.x), and the rule text on hover.
- **What happens next:** for example "You tried again at 20:31 and it went through", or "under TXS-1.2 it should be done by Thu 12 Nov. This is the normal time, not a guarantee."
- **Around that time:** the customer's other transactions that day and the next, in order. For example, the InstaPay that arrived at 20:10 before the retry worked.
- **⚠ I didn't make this** goes straight to the Fraud team, through the same fraud word list as the chat, with no AI call.
- If the normal time has passed, a colleague traces it.

### c) I'm waiting for money

The customer picks:
- where the money is coming from: someone sent me money, my salary, a refund from a shop, or from abroad
- the sender's name (optional)
- when it was sent: today, yesterday, 2 to 3 days ago, 4 days or more, or not sure

The copilot then checks money on its way and recent money in:
- **Pending found:** the item, its timeline, why it waits and the expected time under the rule (for example "routine security review of a first transfer from a new sender, expected by 12:00").
- **Already arrived:** shown with the posting date.
- **Nothing found:** the normal timing for that method and the date it would normally arrive by. It offers a person **only** when that time has passed, or the customer isn't sure when it was sent.

### d) Every flow ends with "Did this solve it?" and "Talk to a person"

## Handoff with the full picture

Before handing over, the copilot builds an investigation summary. The ticket stores it, and the agent inbox shows it under "Why routed here?":
- the flow
- what the customer is looking for
- the filters used
- the candidates checked
- the pending or incoming items found
- why a person is needed

The customer never has to repeat themselves. Screenshot 20.

## Data and rules (all synthetic)

- `knowledge/nova-transaction-rules.md`: rules TXS-1 to TXS-6, covering:
  - card holds and posting times (3 business days, hotels up to 14 days, release after 7 business days)
  - decline reasons
  - business days (Sunday to Thursday), the 2:00 pm cut-off and holidays
  - InstaPay, domestic, salary and international timings
  - reversals and refunds
  - what can and can't be shared

  Since 1.0.13 it is also loaded into the AI's answer prompt, after the policies, and the output checks accept TXS rule IDs.
- `data/transactions.json`: 16 new records (pending, declined, reversed, refunded, money coming in) for five demo customers the eval never uses: C-0003, C-0005, C-0009, C-0010 and C-0017. The 504 existing records are unchanged and in the same order.
- `data/transaction-details.json`: the extra facts per transaction (authorised and posted times, channel, area, terminal or website, card last 4, decline code, hold reason, expected date, sender name). The AI prompts don't read it.
- Rebuild both with `node tools/build_investigator_data.mjs`; the output is the same every time.

## Policy and law notes

- **Only the customer's own data** (Banking Law 194/2020, banking secrecy): every endpoint checks the logged-in customer, and records are filtered by that customer only.
- **Incoming money shows the sender's name only**, never their account or card details (TXS-6.2).
- **Card numbers show the last 4 digits only** (TXS-6.3). Typed text is masked before use.
- **No promises:** times are "the normal time under the rules, not a guarantee" (TXS-6.4). Nothing suggests Nova decides a merchant's refund (TXS-5.2).
- **Fraud first:** "I didn't make this" from any flow goes to the Fraud team (TXS-6.5, FRD-1).
- **UX pillars:**
  - Trust: honest status, rules cited, nothing invented.
  - Explainability: a timeline, a why and what happens next.
  - Human agency: the customer chooses every step; "Talk to a person" is always there; handoffs carry the full picture.

## Measuring it

The PM control panel has a "Transaction investigator" section, from `logs/investigations.jsonl` (structured fields only, no free text):
- investigations
- average narrowing steps
- % that found the transaction
- % resolved without an agent
- top decline and pending reasons

## Tests (1.0.13)

- Eval V1 to V9 (`knowledge/evalset.md`): narrowing finds the right record; declined shows the right reason and rule; a pending hold shows its expected date; "waiting for money" finds the pending InstaPay; with nothing found it explains the normal timing and hands off only after it; "I didn't make this" goes to Fraud; privacy; the handoff summary with no sender account details. All pass.
- Eval cases 61 to 65: typed questions about a declined payment, a hotel hold, an InstaPay under review, an ATM daily limit and a transfer after the cut-off. All answered and grounded.
- `node tools/test-investigator.mjs`: 15 free unit checks, all pass.

Still open: real customers (does narrowing take fewer steps than calling, and do people trust the expected times?), and "late" uses the date, not the hour.

Screenshots: `docs/screenshots/16-investigate-narrow.png`, `17-investigate-detail-pending.png`, `18-investigate-declined.png` (Arabic), `19-waiting-for-money.png`, `20-agent-investigation-summary.png`.
