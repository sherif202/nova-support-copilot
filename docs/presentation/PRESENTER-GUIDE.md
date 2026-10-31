# Presenter guide: the Nova deck in Gamma

10 slides plus one live-demo card. The deck text is `nova-gamma-deck.md`, in this folder. Every number in it comes from the repository at version 1.0.13 (`docs/PROJECT-STATUS.md`). Nova Bank is fictional and all data is synthetic; say so once, on slide 1.

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
| 6 | Eval | Table, plus a small bar or big number: **75.9% → 97.1%** | `11-pm-panel-engineering-iterations.jpg` | "106 tests on every change, 10 gates. Fraud recall has been 100% in every run. 14 versions, each scored; one that broke a gate was rolled back." |
| 7 | Guardrails | Icon list, 8 items (shield, lock, stop sign, person…) | `03-chat-franco-answer-and-fraud.jpg` | "Safety is layered: in code before the AI, in the prompt, and in code after it." |
| 8 | Pricing | Two columns ("Per message" / "Per month"), plus a callout for the tiers and credits | `12-pm-roi.png` (crop the size tiers) | "About two piasters per answer. Most of the cost is fixed. Size tiers and credits keep it predictable." |
| 9 | Business case | Big numbers: **EGP 543,960** value · **EGP 5,675** cost · **415** payback, then the caveat in a note box | `12-pm-roi.png` (crop the ROI tiles) | "The value is agent time. Payback needs only 415 conversations a month. The assumptions get confirmed in the pilot." |
| 10 | Roadmap and ask | **Timeline** (beta → pilot → ramp → phase 2), then "The ask" as three bullets | `16-investigate-narrow.png` (optional) | "We stopped before real users on purpose. What we need is 20 pilot users, a Compliance review, and a go/no-go after the pilot." |

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
| 7 | – | PM control panel → tick Load sample | ROI tiles, payback 415, 80% within S to L |

Backup if the Wi-Fi or API fails: use screenshots 13 to 20 and `12-pm-roi.png` in that order. Fraud (step 2), the pickers and the investigator (steps 3 to 5) work without the AI.

## Likely panel questions

- **"What if it's wrong?"** It answers only from sources, every number is checked in code, and anything unsure goes to a person. Shadow run: 0 answers where an agent was needed.
- **"Why not a bigger model?"** It passed every gate at a fraction of the cost; bigger models scored no better (Stage 3 bake-off).
- **"Is the 63% real?"** It's a shadow number on synthetic tickets. The pilot measures the real one.
- **"Data leaving Egypt?"** The pilot uses synthetic data only. Production needs Central Bank approval or a provider hosted in Egypt, and the vendor-neutral adapter makes switching a setting.
- **"What did it cost to build?"** About US$2.21 in AI calls for all tests to date.
