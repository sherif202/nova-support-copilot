# Prompt changelog

One line per change. Change one thing at a time, run the eval (build step 14), and write the score here before the next change. A version that breaks any hard gate is never shipped, whatever else it improves.

Version numbers: MAJOR when the output JSON shape changes, MINOR when a section or rule changes, PATCH for wording or a new example. The app logs the version and a hash of every prompt file with each turn, and baseline.json stores the ones that passed.

| Version | Date | File | What changed | Why | Model | Intent acc. | Fraud recall | Harmless | Grounded | Retry rate | Verdict |
| - | - | - | - | - | - | - | - | - | - | - | - |
| 1.0.0 | 2026-10-30 | all | First version: 8 sections, fixed replies, retry note | Stage 4 start | claude-haiku-5-5 (both steps) | 91.7% | 100% | 1.00 | 75.9% | 0% | DO NOT SHIP (R9, grounded, notice match S3/S6) |
| 1.0.1 | 2026-10-30 | examples.jsonl, evalset.md (S3/S6 notice only), code | Owner decisions: EX-036 and EX-023 reworded so no example copies an eval case (the server now refuses to start if one does); sensitive.vulnerable always goes to a person in a Supervisor queue (queue per bank policy, Compliance to confirm); a notice starting later today IS passed for a "right now" question, so S3/S6 expect that notice and still a handoff | Owner decisions | claude-haiku-5-5 | 88.3% | 100% | 1.00 | 65.5% | 0% | DO NOT SHIP (R9, intent, grounded). Notice match now 100%; citation recall 91.9%, precision 62.6% |

## Stop rule
Stop changing the prompt when two versions in a row score within 0.02 of each other on the 60 cases with no hard-gate failure. More tweaking after that is tuning to the test. Then open the sealed hold-out once.
