# Nova Bank support copilot, categories and safety policy

The source of truth for understanding customer messages. Label every message with THESE definitions, not the model's own. The facts for answers live in nova-policies.md.

## Priorities

A higher priority always wins. A message that mentions a fee AND a payment the customer didn't make is P0 fraud.

| Priority | Meaning | Who handles it |
| - | - | - |
| P0 | Fraud and security | Fraud team, at once. The copilot never answers it itself. |
| P1 | Complaint or sensitive | Complaints unit or a senior agent, with a reference number |
| P2 | In scope | The copilot answers, with a source |
| P3 | Out of scope | Polite redirect and a person |
| P4 | General | The copilot (greetings, thanks) or a person on request |

## Categories and intents

**Fraud and security · P0**
- `fraud.unknown_txn` A payment the customer says they didn't make. "msh ana elly 3amalt", "I didn't make this payment".
- `fraud.card_lost_stolen` A lost or stolen card. "badal fa2ed" means a replacement for a LOST card. "et sere2", "I lost my card".
- `fraud.otp_phishing` Someone asked for a code, PIN or password, or claimed to be from Nova.
- `fraud.account_takeover` The customer can't get in, or sees changes they didn't make.

**Complaints and sensitive · P1**
- `complaint.formal` The customer wants to file a complaint.
- `sensitive.legal_press` Threats of the Central Bank, a lawyer, court or the press.
- `sensitive.vulnerable` A minor, a death in the family, illness, or clear distress.

**Disputes · P2**
- `dispute.status` Where is my dispute, when will it be decided, will I get my money back.
- `dispute.documents` What papers do I need for my dispute.
- `dispute.open_request` The customer wants to open a new dispute. P3: hand to a person in this MVP.

**Fees and charges · P2**
- `fee.explain` What is this charge.
- `fee.overdraft` Why was I charged for going below zero.
- `fee.waiver_request` Please remove or refund a fee. P3: the copilot can't waive fees.

**Cards · P2**
- `card.replace_damaged` My card is broken, scratched or not working.
- `card.replace_expired` My card is expiring or expired.

**Out of scope · P3**
- `loan.any` Loans and credit.
- `transfer.any` Transfers, and any request about another person's account.
- `advice.any` Which product is better for me, should I invest, any financial advice.

**General · P4**
- `general.info` Branch hours, product names, anything else factual.
- `service.status` Is the app, internet banking, an ATM or card payments down or under maintenance? "el app msh shaghal", "is there maintenance tonight?" **P2**: answered only from the service status file (DIG-8).
- `general.chitchat` Greetings, thanks, "I want to talk to someone".

## Traps to watch

| Message | Wrong label | Right label | Why |
| - | - | - | - |
| ana 3ayza badal fa2ed lel kart | card.replace_damaged | fraud.card_lost_stolen | "badal fa2ed" = lost card |
| el 3amalia di msh ana elly 3amaltha | dispute.open_request | fraud.unknown_txn | "I didn't make this" is fraud, not a dispute |
| I was charged a fee and there's a payment I didn't make | fee.explain | fraud.unknown_txn | Mixed message: fraud wins |
| My card got declined abroad and there's a charge I don't know | service.status | fraud.unknown_txn | A maintenance window never explains away a charge they didn't make |
| I want to dispute a double charge from Noon | fraud.unknown_txn | dispute.open_request | They made the purchase; it was charged twice. Only "I didn't make it" is fraud. Found in the Stage 2 labelling check |
| رجعولي الـ 100 جنيه من فضلك | fee.explain | fee.waiver_request | Asking for the money back is a waiver request (P3), not a question about the fee. Found in the Stage 2 labelling check |
| el kart da3 mny | card.replace_damaged | fraud.card_lost_stolen | "da3" means lost. Found in the Stage 2 labelling check |
| محتاجين أوراق إيه عشان الاعتراض؟ | dispute.status | dispute.documents | Any question about papers is documents, even without the word "documents" |
| شالوا مني 50 جنيه كده من غير ما أعرف ليه | fee.explain | fee.overdraft | EGP 50 is the overdraft fee (FEE-3.1). An unexplained EGP 50 charge, once or several times in a month, is fee.overdraft unless another fee is named. Found in the Stage 4 eval |
| ba3at el wara2 khalas, lessa fe 7aga na2sa? | general.info | dispute.documents | Asking what is still missing after sending a form or papers is about a dispute's documents. Found in the Stage 4 eval |
| el kart et2sar mn el nos | fraud.card_lost_stolen | card.replace_damaged | "et2sar" means broke (damaged). Only "etsara2" (stolen) or "da3" (lost) is fraud. Found in the Stage 4 eval |
| el visa ma3edetsh fi Dubai el naharda | card.replace_damaged | service.status | A card declined abroad, with no charge they don't know, is a service question: check the notices. Found in the Stage 4 eval |
| dafa3t 15 geneh masareef ba3d ma 7awelt le akhoya | fraud.unknown_txn | fee.explain | A fee after a transfer the customer made is a fee question. Only a payment they didn't make is fraud. Found in the Stage 4 eval |

## Fraud word list (checked in code before the model runs)

Any match makes the message P0 and sends the fixed fraud reply. Match without caring about upper or lower case, and allow for extra spaces. When in doubt, add the phrase: a false alarm costs a minute of a Fraud specialist's time, a miss costs the customer's money.

| Signal | English | Arabic | Franco-Arabic |
| - | - | - | - |
| Lost or stolen card | lost my card, card stolen, stolen | ضاع، اتسرق، بدل فاقد | da3, et sere2, etsara2, badal fa2ed |
| A payment they didn't make | didn't make, not me, don't recognise, unknown payment | مش أنا، معملتهاش، مش عارف العملية دي | msh ana, ma3amaltesh, msh 3aref el 3amalia |
| Asked for a code | asked for my code, OTP, PIN, password, verification code | طلب الكود، الرقم السري، كلمة السر | talab el code, el pin, el password |
| Someone claiming to be Nova | called from the bank, said he is from Nova | كلمني من البنك، قال إنه من البنك | kalemny mn el bank |
| Account takeover | can't log in and, changed my number, changed my password, someone logged in | حد دخل على حسابي، غيروا رقمي | 7ad da5al 3ala 7esaby, ghayaro rakamy |
| Phishing link | link, SMS saying I won, refund link | لينك، رسالة إني كسبت | link, resala eny kesbt |

## Words customers use

| Official term | Arabic | What customers say | Franco-Arabic | Maps to |
| - | - | - | - | - |
| Nova Debit Card | بطاقة نوفا للخصم المباشر | الفيزا، الكارت | el visa, el kart | card.* |
| Fee | رسوم | مصاريف، خصم | masareef, et5asam | fee.* |
| Overdraft | السحب على المكشوف | سحبت أكتر من رصيدي | sa7abt aktar mn rasedy | fee.overdraft |
| Dispute | اعتراض على معاملة | شكوى على عملية | e3terad | dispute.* |
| One-time password | رمز التحقق | الكود اللي بيجي في رسالة | el code | fraud.otp_phishing |
| Lost card replacement | بدل فاقد | بدل فاقد | badal fa2ed | fraud.card_lost_stolen |
| Sanabel Fund (investment fund) | صندوق سنابل | السنابل، صندوق السنابل | sanabel | advice.any (P3) if they ask which to choose or whether to invest; otherwise general.info (P4) |
| Al Baraka Deposits (time deposit) | ودائع البركة | وديعة البركة، البركة | wade3et el baraka | advice.any (P3) if choosing or investing; otherwise general.info (P4) |
| Aman Certificate (savings certificate) | شهادة الأمان | شهادة أمان، الشهادة | shahadet aman | advice.any (P3) if choosing or investing; otherwise general.info (P4) |
| Nova Savings Account | حساب توفير نوفا | التوفير | tawfeer | advice.any (P3) if choosing; otherwise general.info (P4) |
| Nova Personal Finance (loan) | تمويل نوفا الشخصي | قرض، تمويل | 2ard, tamweel | loan.any (P3) |

Product names never change the priority on their own: a payment the customer didn't make from any product is still P0 fraud. The full product list, with IDs and handling rules, is in `knowledge/nova-products.md`.

## Non-negotiable (enforced in code, not only in the prompt)

1. Fraud goes first, to a person. Any fraud signal is P0 before the model runs.
2. Never ask for, repeat or store a full card number, CVV, PIN, OTP or password. Mask them.
3. Only the logged-in customer's own data. Never another person's.
4. No decisions about money: never "approved", "refunded" or "waived", no promises of an outcome.
5. No financial advice and no selling.
6. No source, no answer. If it isn't in nova-policies.md or the customer's records, hand off.
7. Every complaint gets a reference number.
8. A person whenever the customer asks.

## Hand to a person

Mark for a person, never guess, when: the priority is P0, P1 or P3; confidence is low; the message is about someone else's account; or the customer asks for a person.

## Language

Detect the customer's language: Arabic, English or Franco-Arabic. Reply in the same language. Reply to Franco-Arabic in Arabic script.
