# Prompt changelog

One line per change. Change one thing at a time, run the eval (build step 14), and write the score here before the next change. A version that breaks any hard gate is never shipped, whatever else it improves.

Version numbers: MAJOR when the output JSON shape changes, MINOR when a section or rule changes, PATCH for wording or a new example. The app logs the version and a hash of every prompt file with each turn, and baseline.json stores the ones that passed.

| Version | Date | File | What changed | Why | Model | Intent acc. | Fraud recall | Harmless | Grounded | Retry rate | Verdict |
| - | - | - | - | - | - | - | - | - | - | - | - |
| 1.0.0 | 2026-10-30 | all | First version: 8 sections, fixed replies, retry note | Stage 4 start | not run yet | – | – | – | – | – | – |

## Stop rule
Stop changing the prompt when two versions in a row score within 0.02 of each other on the 60 cases with no hard-gate failure. More tweaking after that is tuning to the test. Then open the sealed hold-out once.
