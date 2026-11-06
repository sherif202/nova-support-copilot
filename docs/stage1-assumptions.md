# Nova Support Copilot: Stage 1 assumptions to test on real data

31 Oct 2026, merged 6 Nov 2026 · Sherif Hilal · Nova Bank is a fictional bank from the course brief. Live, editable version: https://claude.ai/artifact/QpNi4oSstWvDX9yPijBGMg

## Why this list

Stage 1 said "go, narrowly, with conditions". AI fits one job: reading a free-text question in Egyptian Arabic, English or Franco-Arabic and matching it to the customer's own record and the right policy rule. Everything else is code, buttons or a person. The Triple Fit scores were market 4/5, solution 4/5 and incentive 3/5.

Every result since then ran on synthetic data from a fictional brief. That covers 50 customers, about 520 transactions, 20 policy documents and 200 tickets. The release test passed (version 1.0.15, 106 cases) and the shadow run answered 63% of 200 tickets, which is an answer rate, not verified resolution. But those tickets were rebuilt from the same customer records the copilot reads, so they prove the pipeline works, not that real customers behave this way.

Below are 44 assumptions in seven areas. Each one says what would make the project, what would break it, and the real data that settles it. **Bold rows** are the ones that can stop the project on their own.

Key: **Status** says how far we got. *Untested* means only the brief supports it. *Synthetic pass* means it passed on our test data but not on real data. *Partly tested* means public evidence exists, but nothing from Nova.

## 1. Problem and demand

The whole case rests on there being a large, repeatable pile of simple questions. If the pile is small, or the questions need an action rather than an answer, the copilot has little to do.

| # | Assumption | Status | Makes it if | Breaks it if | Real data to test it |
| --- | --- | --- | --- | --- | --- |
| D1 | Nova gets about 45,000 contacts a month with 120 agents | Untested (brief) | Real volume is close or higher | Volume is much lower, so savings shrink below the fixed cost | 12 months of contact counts by channel |
| D2 | About 60% (27,000) are disputes, fees and cards | Untested (brief) | 40% or more of contacts fall in these 3 reasons | Under about 25%, or the reasons are spread thin across many topics | Contact reason codes for 3 to 6 months; a sample of 500 tagged tickets |
| **D3** | **Most of those contacts need information, not an action** | **Untested, top risk from Stage 1** | **Over half are "explain this" or "where is it"** | **Most need a refund, a block, a change or a decision. Then reframe as an agent assistant** | **Agent interview: "of your last 20 calls, how many needed no action?"; 200 tickets tagged by resolution type** |
| D4 | Volume grows about 15% a year, so the bank needs about 18 more agents next year | Untested (brief) | Growth holds and hiring is hard or costly | Volume is flat, so the "no new hires" pitch loses its force | Yearly contact trend; hiring plan and cost per agent |
| D5 | Some of the 27,000 can be removed without AI (status screen, card flow, expiry alerts) | Partly tested (design only) | The AI still has a big share left after these tools | Simple tools remove almost everything, leaving AI too little to justify it | Which intents need free-text understanding vs a button, from the tagged ticket sample |
| D6 | Peak load is low, about 4 contacts a minute | Untested (derived from D1) | Peaks stay under a few hundred a minute | Big spikes (salary day, an outage) exceed the provider limits | Contacts per hour for the busiest days of the year |

## 2. Customers and channel

The copilot only helps people who reach it and trust it. The brief itself warns that Nova's app is used for balance checks and little else.

| # | Assumption | Status | Makes it if | Breaks it if | Real data to test it |
| --- | --- | --- | --- | --- | --- |
| **C1** | **Customers with these questions will use a chat in the app** | **Untested; the brief contradicts it** | **A large share of in-scope callers are active app users** | **Most callers rarely open the app, or prefer to call. Then start on WhatsApp instead** | **Share of callers with an app login in the last 30 days; channel mix by contact reason** |
| **C2** | **The copilot understands real Egyptian Arabic and Franco-Arabic phrasing** | **Synthetic pass (intent 96.9%), but we wrote the test phrases ourselves** | **Accuracy holds on real typed messages, typos and slang** | **Accuracy drops well under 90% on real text. Then answers go wrong or handoffs pile up** | **2,000 or more real anonymised chat or email messages, in their original script** |
| C3 | Customers will trust a bot with money questions | Partly tested (public reviews show distrust of bank apps) | Ratings and repeat use stay high in the pilot | Customers skip the bot and ask for a person straight away | Pilot "Talk to a person" rate in the first message; customer ratings |
| C4 | 40% verified resolution is reachable | Not tested (the shadow's 63% is an answer rate on synthetic tickets) | Pilot reaches 40% or more | Real customers ask messier, multi-part questions, and the rate falls under 25% | Pilot results; real tickets replayed in shadow mode |
| C5 | We can tell when a customer comes back within 7 days on any channel | Untested | One customer ID links app, phone and branch contacts | Channels aren't linked, so "verified" can't be checked and the North Star is unmeasurable | Whether the CRM links contacts across channels by customer ID |
| C6 | Customers will answer "Did this solve your question?" | Untested | Enough answer it to measure the rate | Few answer, so the number is biased toward happy customers | Response rate to existing post-contact surveys |
| C7 | Pickers and reminders feel helpful, not tiring, for every age group | Untested (built, not user-tested) | Customers finish the picker flow in a few taps | Older or less digital customers drop out or call anyway | A 5-person usability test per segment; drop-off in the pilot |

## 3. Data and systems

The copilot answers only from Nova's own records and rules. If real records are messy, slow or missing the fields we rely on, the answers fail, however good the model is. This is where synthetic data flatters us most.

| # | Assumption | Status | Makes it if | Breaks it if | Real data to test it |
| --- | --- | --- | --- | --- | --- |
| **S1** | **IT can give a read-only, real-time link to one customer's transactions, cards and disputes** | **Untested** | **An API returns a logged-in customer's records in under 1 second** | **Only overnight files or screen scraping are possible, or IT can't open it in the project window. Then only a status screen is possible** | **IT architecture review: which systems hold each record and how they are reached** |
| **S2** | **Real records carry the fields the matching and investigator use** | **Untested (our data was designed to have them)** | **Merchant name, amount, date and time, channel, status and a decline or hold reason code are all there** | **Merchants appear as raw codes ("POS 4492 CAIRO"), or there is no decline reason. Then matching fails, and the investigator shows a status without the reason** | **An anonymised extract of 1,000 transactions with every field, plus decline codes and hold data from the card switch** |
| **S8** | **The answer to each in-scope question exists in the customer's records and Nova's rules** | **Synthetic pass (the shadow run answered 23% before the tickets were linked to the records, 63% after)** | **Most real in-scope tickets have a record and a rule that answer them** | **Over 40% of real in-scope tickets have no source. No source means no answer, so this caps resolution** | **200 real tickets matched to their records and the policy that answers each** |
| S3 | Nova's policies exist as clear rules with IDs that we can cite | Untested (we wrote FEE-2.3, DSP-4 and the others) | A current, approved fee schedule and policy set exists, with one owner | Rules are scattered, outdated, contradict each other or live in people's heads | The real fee schedule, dispute policy and card policy, with their owner and last review date |
| S4 | Disputes and card requests are linked to the transaction they concern | Untested | Each dispute record points to its transaction and shows its stage | Disputes live in email or a separate tool with no link | A sample of 100 dispute records and the system they live in |
| S5 | Real tickets can be labelled to build a fair test set | Untested | Agents or QA label 300 or more tickets with the right intent and answer | No one has time, or labels disagree a lot | A labelling session: 2 people label the same 100 tickets and we compare |
| S6 | Core systems are fast enough for a p95 reply under 6 seconds | Synthetic pass (5.5 s, but our data is local) | Lookups add under 1 second | Lookups take several seconds, pushing replies past 6 s | Response times of the core-banking API under normal load |
| S7 | We get anonymised real data at all | Untested | Data office approves a masked extract for testing | Only synthetic data is ever allowed before launch | Data office's rules for test data and masking |
| S9 | A small, cheap model is good enough on real Egyptian Arabic and Franco | Synthetic pass (Claude Haiku 5.5 passes every gate; p95 4.8 to 6.3 s) | The same model passes the gates on real messages | Grounded answers fall under 90% or p95 goes over 6 s. Then a bigger model raises cost per answer | Real messages replayed through the same release test, at about US$0.03 per 100 |

## 4. Business case

The first ROI of 9,485% was wrong and has been replaced. The new model counts only contacts that are in scope, start in chat and get resolved. In the base case (20% start in chat, 40% resolved) that is 2,160 contacts a month, and ROI is +18% if hiring really falls, or −56% on minutes saved alone. Break-even is 1,824 to 4,869 resolved contacts a month. AI cost is tiny (about EGP 81 a month in the base case), so the case can only break on the value side or the running and build costs.

| # | Assumption | Status | Makes it if | Breaks it if | Real data to test it |
| --- | --- | --- | --- | --- | --- |
| B1 | An agent minute is worth about EGP 2 | Untested (our estimate) | Real loaded cost per minute is close or higher | It is much lower, cutting the value in proportion | Loaded agent cost: salary, benefits, seat, supervision, divided by productive minutes |
| B2 | Each resolved contact saves about 9.6 agent minutes | Untested (our estimate) | Average handle time for these 3 reasons is near 10 minutes | Handle time is 3 to 4 minutes, so value falls by more than half | Average handle time by contact reason, plus wrap-up time |
| **B3** | **Freed agent time turns into real value** | **Untested** | **The bank avoids hiring for growth, or moves agents to harder or sales work** | **Freed time sits idle and no one counts it, so finance sees no saving** | **Finance's view: is the saving counted as avoided hires, and at what volume?** |
| **B4** | **Running cost is about EGP 60,000 a month, plus EGP 1.2 million to build and integrate over 3 years** | **Untested (placeholder)** | **Real fixed cost, including people, stays well below the value** | **Integration, compliance reviews, monitoring staff and vendor contracts cost far more. Every extra EGP 10,000 a month moves break-even up by about 195 resolved contacts** | **IT and vendor quotes; people needed to run and monitor it (PM, QA, compliance hours)** |
| B5 | AI cost stays near EGP 0.024 per answer | Synthetic pass (measured) | Real messages are similar in length | Longer real chats, an exchange rate move from EGP 50 per US dollar, or a vendor price rise. Even 10 times higher would still be small | Average real message length; vendor contract price in EGP |
| B6 | Remaining calls don't get much slower | Untested | Agents handle the harder mix without a big rise in handle time | Easy calls leave, average handle time rises, and managers read it as agents getting worse | Handle time by reason before and during the pilot, with KPIs reset |

## 5. Risk, law and the bank

These can stop the project even if every other number is good. A later on-premise launch adds one more: an open model on the bank's own servers must pass every test again, with its own cost quote and capacity test. A missed fraud case costs a customer money, and a data leak is a crime under Banking Law 194 of 2020 (Art. 231).

| # | Assumption | Status | Makes it if | Breaks it if | Real data to test it |
| --- | --- | --- | --- | --- | --- |
| **R1** | **The Central Bank of Egypt allows customer data to reach the AI provider** | **Untested; flagged in Stage 1** | **CBE approves the provider under its outsourcing rules, or a model hosted in Egypt is available** | **Data can't leave Egypt and no approved local hosting exists. Then a self-hosted model and a new bake-off are needed** | **Legal and compliance opinion on CBE outsourcing and cloud rules; which vendors have Egypt or approved-region hosting** |
| **R2** | **The fraud word list catches real fraud reports** | **Synthetic pass (13/13 test cases, 0 of 16 missed in shadow)** | **Recall stays at 100% on real reported fraud** | **Real customers describe fraud in ways the list misses, and money keeps leaving** | **Every real fraud contact from the last 12 months, anonymised, replayed through the fraud check** |
| R3 | Masking removes all personal data before it reaches the AI | Synthetic pass (card numbers and our test formats) | It catches real national ID, phone, IBAN and card formats | Real messages hold data in formats we never tested | 1,000 real messages run through the masker, then checked by a person |
| R4 | Compliance agrees that explaining a fee or status is service, not advice or a decision, and the complaint route stays intact | Partly tested (advice is refused; complaints go to a person with a reference) | Compliance signs the cost-of-being-wrong matrix, the fixed replies and the in-scope list | Compliance treats any automated answer about money as regulated advice | A 30-minute review with compliance, using the matrix and sample answers |
| R5 | There is no AI-specific CBE rule that blocks this | Partly tested (none found in public sources; not proof there is none) | Legal confirms no extra approval is needed | A new or unpublished rule requires approval, delaying launch | Legal check with CBE guidance, refreshed before launch |
| R6 | The copilot only ever sees the logged-in customer's records | Synthetic pass (security tests 18/18) | Real login and session hand over the customer ID safely | The real app passes IDs in a way that could be changed or mixed up | Security review and penetration test of the real integration, by the bank's security team |
| R7 | The vendor contract covers data use, retention and audit | Untested | The contract bars training on bank data and allows audits | Terms allow data reuse or give no audit rights | The vendor's enterprise terms, checked by legal |
| R8 | Masked chat logs can be kept for 5 years or more | Partly tested (masked before saving; a retention rule in our policies) | The bank's retention and privacy policy allows it | Logs can't be kept, so there is no evaluation or audit on real chats | The bank's retention and privacy policy |

## 6. Operations and people

Incentive fit was the weakest score in Stage 1 (3/5). The model can be right and the project can still fail if the people around it don't adopt it.

| # | Assumption | Status | Makes it if | Breaks it if | Real data to test it |
| --- | --- | --- | --- | --- | --- |
| **O1** | **Agents and their managers will back it** | **Untested** | **Agents see fewer repetitive calls and believe the "no new hires for growth" framing** | **Agents fear for their jobs, avoid Suggest-only mode or quietly undo its drafts** | **A 30-minute session with 5 to 10 agents and 2 supervisors; Suggest-only acceptance rate in the beta** |
| O2 | Agent KPIs are reset so harder remaining calls don't count against them | Untested | Operations agrees new targets before the pilot | KPIs stay as they are and agents are punished for the harder mix | Current agent scorecard and who can change it |
| O3 | The handoff summary saves agents time | Synthetic pass (built and shown, not rated by agents) | Agents rate it useful in over 80% of handoffs | Agents re-read the whole chat anyway | Agent ratings on 50 handoffs in the internal beta |
| O4 | The Fraud team and Complaints unit can take escalations quickly, at any hour | Untested | A person picks up fraud cases within minutes, day and night | Fraud cases arrive at 2 a.m. and wait until morning | Fraud team hours, staffing and current response times |
| O5 | Someone owns the copilot after launch | Partly tested (the learning loop and changelog work in the build) | A named owner updates policies, reviews failures weekly and reruns the release test | No owner, so rules go stale and answers drift out of date | A named owner and time budget in the launch plan |
| O6 | Compliance signs off in time | Untested | A named compliance owner reviews the guardrails and fixed replies before the pilot | A late veto stops the launch | A review slot and a named compliance owner |

## 7. Are we measuring the right thing

A test set written by the builder checks what the builder expects. Our 106 cases and the 63% shadow result both come from data we made ourselves.

| # | Assumption | Status | Makes it if | Breaks it if | Real data to test it |
| --- | --- | --- | --- | --- | --- |
| M1 | The 106 release-test cases represent real traffic | Synthetic pass (the hold-out was written by the same author and used once) | Real tickets score close to the release test | Real tickets score far below it | A fresh hold-out from real tickets, written by a second person |
| M2 | "Would have resolved" in the shadow run matches what really happens | Synthetic pass (labels simulated) | The copilot's routing agrees with what agents actually did | Agent outcomes disagree with the copilot's routing | Real labelled tickets with their actual outcome |

## What to ask the instructor for

Eleven assumptions can stop the project on their own. The list below tests eight of them (D3, C1, C2, S2, S8, R1, R2, O1). S1, B3 and B4 need the real bank's IT and finance teams, so they stay open until a pilot.

1. **Three months of contact reasons, with how each was resolved and how long it took.** Tests D1, D2, D3, B2. The cheapest item to get.
2. **One hour with a contact-center agent and a supervisor.** Tests D3, O1, O2: "Of your last 20 calls, how many needed no action?" and how agents are measured.
3. **500 to 2,000 anonymised customer messages (chat, WhatsApp or call transcripts) in their original language and script, plus every fraud report from the last 12 months.** Tests C2, R2, R3, S9, M1. Replayed through the existing release test at about US$0.03 per 100.
4. **200 tickets with their matching anonymised transactions, disputes and cards.** Tests S8, S4, M2. A real shadow run, done the same way as the synthetic one.
5. **The real fee schedule, dispute policy and card policy, with their owners.** Tests S3. Replaces the synthetic handbook rule by rule.
6. **Channel usage: app monthly users, chat and WhatsApp volumes, and the share of callers who used the app in the last 30 days.** Tests C1. Decides chat or WhatsApp first.
7. **A sample of about 1,000 transactions with every field, plus card decline codes and hold data.** Tests S2. Shows what matching and the investigator can explain.
8. **A compliance view on AI providers, data residency and log retention.** Tests R1, R4, R5, R8. Decides the vendor before any real data leaves the bank.
9. **Agent cost, the hiring plan and IT running costs.** Tests B1, B3, B4, D4. Turns the ROI model's assumptions into the bank's numbers.

All of it can be anonymised: masked customer IDs, no names, and card numbers cut to the last 4 digits.

If the instructor can only provide one thing, ask for item 3. Real messages test the language, the intents and the fraud check at once.

**What happens next with the data:** Nothing in the build needs rewriting. Each real data set replaces its synthetic version, and the same release test, shadow run and ROI model run again without changes first. Then we compare the results with the synthetic ones, and fix only what the real data shows. The old hold-out set stays sealed.
