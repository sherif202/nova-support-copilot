# PRD, Nova Bank support copilot

Customer-facing help chat with an agent inbox behind it. Status: starter runs locally with fake AI. The build guide makes it real.

## Problem
Nova Bank gets about 45,000 customer contacts a month with 120 agents, and volume grows about 15% a year. Around 60% of contacts (about 27,000 a month) are the same three questions: where is my dispute, what is this fee, and how do I replace my card. Customers wait in the queue behind these repeats, and the urgent ones, fraud above all, wait with them.

## Users
- Primary: the Nova customer, writing in Arabic, English or Franco-Arabic, already logged in to the app.
- Secondary: the Nova support agent, who works the handoff inbox.
- Escalation: the Fraud team, who must see every fraud signal at once, and the Complaints unit.

## Job to be done
When I have a question about my own fee, dispute or card, give me the right answer now, in my language, from the bank's real rules. When something is wrong, like a payment I didn't make, get me to a person immediately.

## Goal
A logged-in customer types a question and gets a correct, sourced answer for the three in-scope intents. Everything else, and fraud above all, is handed to the right team with a reference number. As a small add-on, it tells customers about announced maintenance and outages, from the same notice the SMS uses.

## North Star
Verified resolution rate: conversations closed by the copilot, with no handoff and no repeat contact within 7 days.

## Non-goals
- Not moving money, not waiving fees, not deciding disputes.
- No credit, loans, financial advice or selling.
- Not answering for anyone except the logged-in customer.
- Not a replacement for agents. Agents handle everything the copilot hands off.

## Core flow
1. The customer logs in (in the MVP: picks a synthetic customer) and types a message.
2. Input checks in code: mask card numbers, IDs and codes; fraud words go straight to the fraud reply; empty, junk or overlong input never reaches the model.
3. Understand (the cheap-tier model picked in Stage 3: claude-haiku-5-5 to start; GPT-6 Luna or Gemini 2.5 Flash-Lite if they win the bake-off): language, category, intent, priority and confidence, as JSON, using nova-taxonomy.md and the approved examples in examples.jsonl.
4. Route in code: P0 to Fraud, P1 to Complaints, P3 and low confidence to an agent, P2 and P4 on to the answer.
5. Look up the customer's own records only (transactions, disputes), plus any current service notice.
6. Answer (the same cheap-tier model; a step-up tier only if the cheap one fails a gate) from nova-policies.md and those records, citing rule and record IDs. One rewrite if an output check fails, then a person.
7. Output checks in code: cited IDs exist, numbers match the sources, no "approved/refunded/waived", same language, last 4 card digits only. A failed check shows a safe message and hands off.
8. Close the ticket as resolved pending confirmation, or move it to a queue. Log the turn, masked.

## Requirements
- Chat box with language-aware text direction (Arabic right to left).
- "Talk to a person" button, always visible.
- Fraud replies are visually distinct and show the block-card button and the 24/7 hotline.
- Each answer shows its sources.
- Agent inbox with queues: Fraud, Complaints, Agent.
- Every handoff and complaint gets a ticket reference.

## AI behaviour
- Label by Nova's taxonomy (nova-taxonomy.md), not the model's assumptions.
- Answer only from nova-policies.md and the customer's own records. No source, no answer.
- Structured output: intent, priority, confidence, answer, sources, action.
- Reply in the customer's language. Franco-Arabic gets a reply in Arabic script.
- Says it is an assistant and how to reach a person.

## Guardrails
- Input: reject empty or junk input, cap length at 1,000 characters, mask full card numbers, CVV, PIN, OTP and national IDs before anything is sent or stored, flag prompt-injection attempts.
- Fraud first: any fraud signal is P0 and goes to the Fraud team, enforced in code even if the model ranks it lower.
- Output: never invent a fee, date or amount; never promise an outcome; malformed output shows a safe message, not a broken screen.
- Only the logged-in customer's data, enforced by the lookup, never by the prompt.
- Kill switch: one setting turns the AI off and sends every message to a person.
- Security: the model is never the security boundary. Rate limits, a spending cap, records passed as data not instructions, security headers, localhost only. Full threat list and defences in [03-SECURITY-AND-FRAUD.md](03-SECURITY-AND-FRAUD.md); every threat has a red-team test that must pass before SHIP.

## How we measure
- Fraud recall: 100% of fraud cases moved to Fraud. The number that matters.
- Harmless: 1.00 on the harm cases (refund bait, waiver ask, card number, another person's data, prompt injection). A hard gate.
- Security: 12 of 12 red-team attacks blocked. A hard gate.
- Intent accuracy: at least 90%.
- Grounded answers: at least 90% of answers cite real sources and every number matches.
- Measured on the labelled eval set (knowledge/evalset.md, 22 cases), re-run after every change. SHIP or DO NOT SHIP, never on vibes.
- Running cost and speed to watch: p95 reply time under 4 seconds, cost EGP 0.035 a message (a conversation: up to EGP 0.20 in the pilot, 0.10 by week 8), retry rate under 10%.
- Models are bought, not built, through one adapter. A backup from another vendor takes over if the primary fails. Everything learned lives in Nova's files (taxonomy, examples, policies), so switching vendors keeps it. See docs/06-LEARNING-LOOP.md.

## Out of scope for the MVP
Real bank login, a real core-banking connection, a production database, deployment to the internet, opening new disputes, voice.

## Open questions
- Which login does the bank's app hand us, and what does the session carry?
- Do agents want the copilot's draft answer in the inbox, or only the label?
- Hand off in working hours only, or 24/7 with a callback?
- When do we add a vector search over longer policy documents (phase 2)?
