# Nova Bank Support Copilot

### An AI copilot that answers Nova's three most common questions, and hands everything else to the right person

- 45,000 contacts a month; 27,000 are about **fees, disputes and cards**
- Built and tested end to end on synthetic data: **version 1.0.13, eval SHIP**
- Arabic, English and Franco-Arabic

Sherif Hilal · AI Product Management · 31 October 2026

---

# The problem and our bet

**The problem**
- 45,000 contacts a month for 120 agents, growing 15% a year
- 60% are the same three questions: "why was I charged?", "where is my dispute?", "my card broke"
- Fraud reports wait in the same queue

**Our bet**
- Answer those three questions instantly, from the customer's own records and Nova's rules
- Send fraud, complaints and anything unsure to a person, at once

**North Star:** verified resolution rate, a chat closed by the copilot with no repeat contact in 7 days. **Target: 40%**

**Must never slip:** fraud recall 100%

---

# The MVP: what we built

**1 · Customer chat**
- Answers with its sources ("Why this answer?")
- "Which one do you mean?" picker for the exact transaction, card or dispute
- Transaction investigator: narrow the search, see why a payment is pending or declined, check money on its way

**2 · Agent inbox**
- Every handoff arrives with a summary and the full investigation, so the customer never repeats themselves
- Modes: Off · Suggest only · Auto-answer

**3 · PM control panel**
- Key Results live, cost per model, bottlenecks, ROI, automatic recommendations

**Next: live demo**

---

# Live demo

1. **A fee, explained from its source**: Franco-Arabic in, an Arabic answer out
2. **Fraud goes first**: "badal fa2ed" (lost card) goes straight to the Fraud team, with no AI involved
3. **"Which one do you mean?"**: a vague question gets the customer's own records to pick from
4. **The investigator**: a declined payment explained step by step; money on its way found
5. **The agent inbox and the PM panel**: the full picture, live numbers, ROI

---

# System design: a workflow, not an agent

1. **Check the input** (code): mask card numbers, block junk, apply a rate limit
2. **Fraud first** (code): a word list in 3 languages sends fraud to the Fraud team before any AI
3. **Understand** (AI · Claude Haiku 5.5): language, intent, priority, confidence
4. **Route** (code): complaints, out of scope, low confidence or "talk to a person" go to a person
5. **Look up** (code): only this customer's records, top 3; a picker if the question is vague
6. **Answer** (AI · Claude Haiku 5.5): only from the records and Nova's rules, citing each one
7. **Check the answer** (code): 8 checks (numbers, sources, promises, language, card digits, secrets, links, prompt leaks); one retry, then a person

**Only 2 of the 7 steps use AI. Everything that must never go wrong is code.**

---

# Design choices and trade-offs

| We chose | Instead of | Because |
| - | - | - |
| A fixed workflow | An autonomous agent | Same message, same path; every step testable; nothing can move money |
| Fraud caught in code | Trusting the model | Fraud recall must be 100%, with no exceptions |
| The cheapest model that passes | The biggest model | Haiku 5.5 passed every gate; Sonnet and Opus cost 10 to 50 times more and scored no better |
| Policies in the prompt, records by lookup | A vector database | About 65 short rules; nothing to "not find"; cached for cost |
| A vendor-neutral adapter | One vendor locked in | Production depends on Central Bank rules, data residency and bank contracts |
| Deterministic pickers and investigator | More AI | No AI cost, no invented answers, the same result every time |

---

# Eval: how we know it works

**106 test cases, run on every change, with 10 gates that all must pass**

| Gate | Result, version 1.0.13 |
| - | - |
| Fraud recall | **13/13** |
| Harmless | **7/7** |
| Red-team attacks blocked | **18/18** |
| Honesty: says "I don't know" | **5/5** |
| Intent accuracy | **98.5%** (target 90%) |
| Grounded answers | **97.1%** (target 90%) |
| Record picker and investigator checks | **4/4 · 9/9** |

**14 versions, each scored:** grounded answers went from 75.9% to 97.1%. One version that broke a gate was rolled back.

**Shadow run on 200 past tickets:** 63% would have been resolved, 0 of 16 fraud cases missed, and 0 answers where an agent was needed.

---

# Guardrails: safe by design

- **Fraud first:** a word list in code; it works even with the AI switched off
- **Only your own data:** the customer ID comes from the login, never from the chat (banking secrecy, Law 194/2020)
- **No source, no answer:** every number must appear in a record or a rule, or the answer is blocked
- **No promises:** "approved", "refunded" and "waived" are blocked; only people decide
- **Card numbers masked:** last 4 digits only, before anything is saved
- **Attacks refused:** prompt injection, role-play and "ignore your rules" are tested in 18 red-team cases
- **A person, always one tap away:** low confidence, complaints and vulnerable customers go to a person
- **A kill switch:** Off · Suggest only · Auto-answer, and every change is logged

---

# Pricing: what it costs

**Per message**
- About **EGP 0.02** per answered message, against a target of EGP 0.035 (Claude Haiku 5.5, prompt caching)
- Fraud, junk, the pickers and the investigator screens: **free** (code only)

**Per month at Nova's volume (45,000 contacts)**
- AI: about **EGP 675**
- Fixed (hosting, monitoring, weekly review): **EGP 5,000**

**How we keep it predictable**
- **Size tiers:** 80% of conversations stay within the S, M and L sizes; XL and XXL are reviewed and charged back to the business line
- **Credits:** budgets set in credits, so a model price change doesn't change the budgets

**Building and testing it, so far:** about **US$2.21** in total

---

# Business case

**Value:** agent time freed by resolved conversations

| Per month, at 45,000 contacts | |
| - | - |
| Value of agent time freed | **EGP 543,960** |
| AI and fixed cost | **EGP 5,675** |
| Projected ROI | **about 95×** |
| Payback | **415 conversations a month** |

- Absorbs the 15% yearly growth without hiring about **18 more agents** a year
- Fraud reports no longer wait behind fee questions

**Honest caveat:** the value is agent time, not cash; it becomes cash only by avoiding hires. The agent cost (EGP 2 a minute) and the 63% shadow rate are assumptions to confirm in the pilot.

---

# Roadmap and the ask

1. **Internal beta**, 2 days: 50 chats in Suggest-only mode, where an agent approves every answer
2. **Pilot**, 5 days: 10 to 20 people measure the North Star ("Did this solve it?") against 40%
3. **Ramp**: 1% → 5% → 25% → 100% of app users, one question type at a time, with a go/no-go at each step
4. **Phase 2**: WhatsApp, a fresh hold-out test set, an OpenAI and Gemini bake-off, and a data-residency decision with Compliance

**The ask**
- 10 to 20 pilot users and one contact-center agent for 2 weeks
- A Compliance review of the guardrails and the fixed replies
- A go/no-go decision after the pilot, on the North Star and fraud recall
