# Nova Bank transaction rules (transaction investigator)

Rules the transaction investigator quotes when it explains why a transaction is pending, declined, reversed or refunded, and when money is expected. Same format as `nova-policies.md`.

Nova Bank is fictional. **All limits, times and holidays here are invented for this project (synthetic).** Since 1.0.13 this file is read by the investigator screens (`lib/investigate.js`) **and** loaded into the AI's answer prompt after `nova-policies.md`, so a typed question gets the same answer as the screens. The output checks treat TXS rule IDs like any other rule.

## TXS-1 · Card holds and posting

- **TXS-1.1** A card payment is first authorised: the amount is held from the available balance and shows as pending. The merchant then confirms it and it posts, usually within 3 business days.
- **TXS-1.2** Hotels, car hire and fuel stations can hold an estimated amount for longer, up to 14 days, and the final amount can be different from the hold.
- **TXS-1.3** If the merchant never confirms a hold, Nova releases it automatically after 7 business days. The money returns to the available balance.

## TXS-2 · Why a payment is declined

- **TXS-2.1** Insufficient balance: the available balance at that moment was lower than the amount. Pending holds count against the available balance.
- **TXS-2.2** Daily limit reached: card purchases up to EGP 50,000 a day and ATM withdrawals up to EGP 20,000 a day. The limits reset at midnight Cairo time.
- **TXS-2.3** Card blocked or expired: a blocked card, or a card past its expiry month, is declined everywhere.
- **TXS-2.4** Wrong PIN: after 3 wrong PIN tries in a row the card is declined for PIN payments and ATM withdrawals until midnight Cairo time.
- **TXS-2.5** Online security check: an online payment that fails the security check (for example the one-time code wasn't completed, or the pattern looked unusual) is declined to protect the customer. Trying again and completing the code usually works.
- **TXS-2.6** Merchant category not allowed: some merchant types (for example gambling) are blocked on all Nova cards.
- **TXS-2.7** A declined payment never takes money from the account. If the customer sees a pending amount for a declined payment, it is released under TXS-1.3.

## TXS-3 · Business days, cut-off times and holidays

- **TXS-3.1** Business days are Sunday to Thursday. Friday, Saturday and public holidays are not business days.
- **TXS-3.2** A bank transfer received after the 2:00 pm Cairo cut-off on a business day is processed on the next business day.
- **TXS-3.3** Public holidays in the demo period (synthetic): 6 October (Armed Forces Day) and 5 November 2026.

## TXS-4 · Money coming in

- **TXS-4.1** InstaPay transfers usually arrive within seconds, 24 hours a day. A transfer can stay pending for a routine security review, for example a first transfer from a new sender, usually until 12:00 pm the next day.
- **TXS-4.2** A domestic bank transfer (ACH) arrives the next business day if the sending bank sent it before the cut-off (TXS-3.2), otherwise one business day later.
- **TXS-4.3** Salaries post on the date in the employer's payroll file, by 10:00 am Cairo time. Nova can't change the date the employer chose.
- **TXS-4.4** International transfers take 2 to 5 business days, depending on the sending bank and the banks in between.

## TXS-5 · Reversals and refunds

- **TXS-5.1** A reversal cancels a hold before it posts (for example a cancelled order or trip). The money returns to the available balance at once.
- **TXS-5.2** A refund is a new payment from the merchant after the purchase posted. It arrives when the merchant sends it, usually within 10 business days. Nova doesn't decide or speed up a merchant's refund; a dispute is the route if it never arrives (DSP rules).

## TXS-6 · What the investigator can and can't share

- **TXS-6.1** Only the logged-in customer's own transactions, never anyone else's (Banking Law 194/2020, banking secrecy).
- **TXS-6.2** For money coming in, only the sender's name as it appears on the transfer, never the sender's account or card details.
- **TXS-6.3** Card numbers show only the last 4 digits.
- **TXS-6.4** No promises: expected times are the normal times under these rules, not a guarantee. If the normal time has passed, a colleague traces it.
- **TXS-6.5** A payment the customer says they didn't make always goes to the Fraud team first.
