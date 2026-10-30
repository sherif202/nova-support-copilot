# Nova Bank policies the copilot may quote

The only facts the copilot may state. Every answer must cite at least one rule ID from this file or a record ID from the customer's own data. If the answer is not here, the copilot says it doesn't have that information and offers a colleague. It never guesses.

Nova Bank is fictional. All fees and timelines are invented for this project. Amounts are in EGP unless stated.

## FEE · Fees and charges

### Accounts
- **FEE-1.1** Current Account monthly fee: EGP 15 a month when the average balance is under EGP 5,000. Free at or above EGP 5,000.
- **FEE-1.2** Business Account monthly fee: EGP 75 a month.
- **FEE-1.3** Closing an account within 6 months of opening: EGP 100. Free after 6 months.
- **FEE-1.4** Printed statement: EGP 5 a page. E-statements are free.

### Cash and ATMs
- **FEE-2.1** Withdrawal at a Nova ATM: free.
- **FEE-2.2** Balance check at a Nova ATM: free.
- **FEE-2.3** Withdrawal at another bank's ATM in Egypt: EGP 25 per withdrawal.
- **FEE-2.4** Withdrawal abroad: 3% of the amount, with a minimum of EGP 75. Example: 3% of EGP 2,000 is EGP 60, so the minimum of EGP 75 applies.
- **FEE-2.5** Balance check at another bank's ATM: EGP 3.

### Overdraft
- **FEE-3.1** Overdraft fee: EGP 50 each time the balance goes below zero, charged at most 3 times a month.

### Cards
- **FEE-4.1** Nova Debit Card yearly fee: EGP 120.
- **FEE-4.2** Replacement of a damaged card: EGP 100.
- **FEE-4.3** Renewal of an expiring card: free.
- **FEE-4.4** Express card delivery in 2 business days: EGP 75.
- **FEE-4.5** Classic Credit Card yearly fee: EGP 300, free in the first year.
- **FEE-5.1** Purchase in a foreign currency: 3% of the amount.

### Transfers
- **FEE-7.1** Transfer between Nova accounts: free.
- **FEE-7.3** ACH transfer in Egypt: EGP 10.

Not in the fee schedule (the copilot must not invent a price): cheque books, safe deposit boxes, certificates of balance. These go to a colleague.

## DSP · Disputes

A dispute is a transaction the customer made but believes is wrong: charged twice, wrong amount, goods never arrived. A transaction the customer did NOT make is fraud, not a dispute (see FRD-1).

- **DSP-1** A dispute can be opened within 60 days of the transaction posting. Opening a dispute is free.
- **DSP-2** Stages the customer sees: Submitted → Under review → Waiting for merchant → Decision → Closed.
- **DSP-3** Nova confirms receipt within 2 business days. The target for a decision is 45 days. Card-network cases can take up to 90 days.
- **DSP-4** Documents needed: a signed dispute form, and a receipt or proof of cancellation. A police report may be asked for only when an unrecognised amount is over EGP 5,000.
- **DSP-5** The copilot may share the stage, the dates and any missing documents. Only the Disputes team decides the outcome. The copilot never promises a refund, never says "approved", and never gives temporary credit.
- **DSP-6** Card-network disputes go through Visa chargeback rules, which can add time.
- **DSP-7** When a dispute closes, the reason is shown in the app and sent by SMS.
- **DSP-8** A dispute raised in bad faith can be charged EGP 100.

## CRD · Card replacement

- **CRD-1** Damaged card: request a replacement in the app or at a branch. Fee EGP 100 (FEE-4.2). Delivery in 5 business days in Cairo and Giza, 7 business days elsewhere. Express delivery in 2 business days for EGP 75 (FEE-4.4).
- **CRD-2** Expiring card: a new card is sent automatically 30 days before expiry, free (FEE-4.3). No action needed.
- **CRD-3** Lost or stolen card: block the card now in the app or through the 24/7 hotline. The Fraud team reviews recent activity. The replacement fee is waived. This is always handled as fraud first (FRD-1).
- **CRD-5** The PIN is set in the app. Nova never sends or asks for a PIN.

## FRD · Fraud and security

- **FRD-1** Fraud signals: a transaction the customer didn't make, a lost or stolen card, someone asking for a PIN, OTP or password, or a call claiming to be from Nova. Fraud is always handled first, by a person.
- **FRD-2** The first reply to any fraud signal shows the block-card button and the 24/7 hotline.
- **FRD-3** The Fraud team calls back within 2 hours in working hours, 8 hours outside working hours.
- **FRD-4** Nova never asks for a full card number, CVV, PIN, OTP or password, by phone, SMS, email or chat.
- **FRD-5** After the customer reports fraud, they are not liable for later transactions.

## DIG · The copilot itself

- **DIG-4** The copilot answers three things: dispute status, fee explanations, and card replacement (damaged or expiring). It can also share announced maintenance and outages from the service status file (DIG-8).
- **DIG-5** It hands over to a person for fraud, complaints, low confidence, or whenever the customer asks.
- **DIG-6** It says it is an assistant and how to reach a person.
- **DIG-7** Chats are kept for service and audit: transaction-related chats for 5+ years, other chats for 12 months.
- **DIG-8** Planned maintenance and outages: the copilot may share a maintenance window or a known outage only from the service status file (`data/service-status.json`), citing its notice ID, with start and end times in Cairo time. It uses the same wording the customer got by SMS. It never guesses a cause, a fix time or a window that isn't listed. If nothing is listed for the service and time asked about, it says there is no announced maintenance and offers a colleague.
- **DIG-9** One source for notices: Digital Operations or Card Operations publish each notice once, in the service status file. The SMS, the app banner and the copilot all read that same notice.
