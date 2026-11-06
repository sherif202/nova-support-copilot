# Presenter guide: the Nova deck in Gamma

10 slides plus one live-demo card. The deck text is `nova-gamma-deck.md`, in this folder. Every number in it comes from the repository at version 1.0.15 (`docs/PROJECT-STATUS.md`). Nova Bank is fictional and all data is synthetic; say so once, on slide 1.

## Build it in Gamma (about 10 minutes)

1. Open gamma.app → **Create new** → **Paste in text**.
2. Paste the whole of `nova-gamma-deck.md`.
3. Choose **Presentation**, and **Card-by-card** (each `---` becomes one card). You should see **11 cards**.
4. Text setting: choose **Preserve this exact text**, not "Generate" or "Condense", so Gamma doesn't rewrite the numbers.
5. Images: choose **No images** (or "Upload your own"), and add the screenshots listed below. Avoid AI-generated photos of banks, money or people: they look like a real bank.
6. Theme: a clean, light theme with a dark teal accent, close to Nova's colours (teal #0e6b70). Font: one sans-serif.
7. Go card by card and apply the layout in the table below (in Gamma: select a block → **Layout** or **Turn into…**).
8. Check every number against `docs/PROJECT-STATUS.md` before presenting.

## Slide by slide: layout, visual, what to say

| # | Slide | Gamma layout to pick | Add this image (from `docs/screenshots/`) | Say (about 30 to 45 s) |
| - | - | - | - | - |
| 1 | Title | Title card, image on the right | `01-chat-welcome-calibration.jpg` | "An AI copilot for Nova's three most common questions. Nova is a fictional bank; all data is synthetic." |
| 2 | Problem and bet | Two columns ("The problem" / "Our bet"), then a highlighted box for the North Star | none, or a big-number callout: **27,000 / month** | "60% of contacts are the same three questions. We answer those and send fraud to a person first. One number proves it: verified resolution, target 40%." |
| 3 | The MVP | Three columns (chat · inbox · PM panel) | `13-picker-transactions.png`, `20-agent-investigation-summary.png`, `10-pm-panel-key-results-and-recommendations.jpg` | "Three screens. Then I'll show it live." |
| – | **Live demo** | Section divider (big text) | none | Switch to the browser (run sheet below). About 4 minutes. |
| 4 | System design | **Steps / timeline** (7 numbered steps), with AI steps 3 and 6 highlighted | optional: the 7-step flow | "Only two of seven steps use AI. Fraud, routing and checking are code, so they can't hallucinate." |
| 5 | Design choices | Table | none | "Every choice traded capability for safety and cost: a workflow, the cheapest model that passes, vendor-neutral." |
| 6 | Eval | Table, plus a small bar or big number: **75.9% → 97.1%** | `11-pm-panel-engineering-iterations.jpg` | "106 tests on every change, 10 gates. Fraud recall has been 100% in every run. 16 versions, each scored. I also tested whether it gives up too easily: 2 of 24 new questions went to a person." |
| 7 | Guardrails | Icon list, 8 items (shield, lock, stop sign, person…) | `03-chat-franco-answer-and-fraud.jpg` | "Safety is layered: in code before the AI, in the prompt, and in code after it." |
| 8 | Pricing | Two columns ("Per message" / "Per month"), plus a callout for the tiers and credits | `12-pm-roi.png` (crop the size tiers) | "AI is about two piasters per answer. The real cost is running and integrating it, EGP 93,333 a month by my assumptions. Size tiers and credits keep the AI part predictable." |
| 9 | Business case | Table of low, base and high cases, big number: **1,824** break-even, then the caveat in a note box | `12-pm-roi.png` (crop the ROI tiles) | "The honest range is minus 56% to plus 18%. It pays only if the bank hires fewer people, and small changes can turn it negative. Real data replaces every assumption." |
| 10 | Roadmap and ask | **Timeline** (evidence → staff trial → agent-first pilot → customer ramp → on-premise), then "The ask" as three bullets | `16-investigate-narrow.png` (optional) | "We stopped before real users on purpose. Next comes evidence, then agents first, and customers only when the numbers earn it. On-premise is a later phase with its own test and costs." |

**Visual steps and selections, in short:** steps layout for the system design (slide 4), tables for choices and eval (5, 6), icons for guardrails (7), big numbers for pricing and the business case (8, 9), a timeline for the roadmap (10).

## Live demo run sheet (about 4 minutes)

Before the panel: start the app (`node server.js` in the `nova-support-copilot` folder), reset the demo (`data/tickets.json` = `[]`, empty `logs/`), and open http://localhost:3000. The full script is in `docs/DEMO-SCRIPT.md`.

| Step | Log in as | Do | Point at |
| - | - | - | - |
| 1 | C-0012 | Type `3ayez a3raf el 25 geneh elly et5asamo yom 14/9 dol eh` | The Arabic answer, the badge, "Why this answer?" (rule FEE-2.3 and the transaction) |
| 2 | C-0012 | Type `3ayez badal fa2ed lel visa` | The red fraud reply, block card, hotline; no AI used |
| 3 | C-0040 | Type `There's a fee on my account I don't understand` | "Which one do you mean?" with her 3 fees; tap one |
| 4 | C-0010 | 🔎 Find a transaction → This week → Online → tap the declined Amazon.eg | The live count, the memory jogger, the steps, "Why was it declined?" (TXS-2.5) |
| 5 | C-0010 | 💸 I'm waiting for money → Someone sent me money → Yesterday | The InstaPay from Ahmed Hassan, found on its way; no handoff |
| 6 | – | Agent inbox → Why routed here? | The summary and the investigation picture |
| 7 | – | PM control panel → tick Load sample | Low, base and high cases, break-even 1,824 to 4,869, 80% within S to L |

Backup if the Wi-Fi or API fails: use screenshots 13 to 20 and `12-pm-roi.png` in that order. Fraud (step 2), the pickers and the investigator (steps 3 to 5) work without the AI.

## Likely panel questions

- **"What if it's wrong?"** It answers only from sources, every number is checked in code, and anything unsure goes to a person. Shadow run: 0 answers where an agent was needed.
- **"Why not a bigger model?"** It passed every gate at a fraction of the cost; bigger models scored no better (Stage 3 bake-off).
- **"Is the 63% real?"** No. It's an answer rate on synthetic tickets, not verified resolution, so I don't use it in the business case. The pilot measures the real one.
- **"Why did the ROI change?"** My first model showed 9,485%, which was wrong: it counted every contact as coming to the chat and left out the real running and build costs. I rebuilt it on a funnel, with three cases.
- **"Won't it hand everything to a person?"** It did on my first test: 16 of 34. I added chat memory and one clarifying question, and 2 of 24 new questions went to a person. That set is small and I wrote it, so the pilot has to confirm it.
- **"Data leaving Egypt?"** The pilot uses synthetic data only. Production needs Central Bank approval or a provider hosted in Egypt, and the vendor-neutral adapter makes switching a setting.
- **"Which job goes away?"** None is promised. The base case frees about 5.8 agents' workload, and it becomes money only through fewer hires. Finance has to agree that rule first.
- **"Why not a status screen?"** It may solve part of this with no AI. It is on the roadmap as a comparison, and I have not priced it yet.
- **"Why agents first?"** It lowers the risk of a bad answer while we count wrong answers. Customers come when the numbers earn it.
- **"Can it run on-premise?"** Not as built. It likely needs an open model on the bank's servers, which must pass every test again, with a real cost quote.
- **"What did it cost to build?"** About US$2.46 in AI calls for all tests to date.
