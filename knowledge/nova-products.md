# Nova Bank products, names customers use

Every bank sells under its own product names. Customers ask about them by name, in Arabic, English or Franco-Arabic, so the copilot must recognise them. Nova Bank is fictional and so are these products; the names follow the style of Egyptian banks.

**This file is not a source of facts.** It holds names only, no rates, returns, fees or terms. Facts the copilot may state live in `nova-policies.md` with a rule ID. If a product fact is not there, the copilot says it doesn't have the information and offers a colleague (no source, no answer). It never recommends a product (non-negotiable 5).

Owner: Product team. A product is added here when it launches, and its fees go into `nova-policies.md` at the same time.

## Product catalogue

| Product ID | Official name (Arabic) | Official name (English) | Type | What customers type | Copilot handling |
| - | - | - | - | - | - |
| PRD-INV-01 | صندوق سنابل | Sanabel Fund | Investment fund | سنابل، صندوق السنابل، sanabel, el sanabel | Which product to choose, or should I invest: `advice.any`, P3, a colleague. What it is, its return or its fees: `general.info`, P4, no source, a colleague |
| PRD-DEP-01 | ودائع البركة | Al Baraka Deposits | Time deposit | وديعة البركة، البركة، wade3et el baraka, el baraka | Same as above |
| PRD-CERT-01 | شهادة الأمان | Aman Certificate | Savings certificate | شهادة أمان، الشهادة، shahadet aman, shahada | Same as above |
| PRD-SAV-01 | حساب توفير نوفا | Nova Savings Account | Savings account | التوفير، حساب التوفير، tawfeer | Same as above |
| PRD-CUR-01 | حساب نوفا الجاري | Nova Current Account | Current account | الحساب الجاري، gary | Monthly fee questions: `fee.explain` (FEE-1.1). Other questions: `general.info` |
| PRD-CRD-01 | بطاقة نوفا للخصم المباشر | Nova Debit Card | Debit card | الفيزا، الكارت، el visa, el kart | `card.*` and `fee.*` as the taxonomy says (FEE-4.1, CRD-1, CRD-2) |
| PRD-CRD-02 | بطاقة نوفا كلاسيك الائتمانية | Classic Credit Card | Credit card | الكريديت، الائتمان، credit card | Yearly fee: `fee.explain` (FEE-4.5). A higher limit or a new card: `loan.any`, P3 |
| PRD-LOAN-01 | تمويل نوفا الشخصي | Nova Personal Finance | Personal loan | قرض، تمويل، 2ard, tamweel | Always `loan.any`, P3, a colleague (a person makes every credit decision) |

## Rules for the copilot

1. A product name alone never changes the priority. A fraud signal about a product (for example "money left my Al Baraka deposit and it wasn't me") is still P0 fraud.
2. Asking which product is better, or whether to invest, is always `advice.any` (P3), even when the customer names a product.
3. Only facts with a rule ID in `nova-policies.md` may be stated. Today that covers the account, card and fee rules, not the investment and deposit products, so those questions go to a colleague.
4. Reply with the product's official name in the customer's language.

## Adding a product

1. Add a row here with a new Product ID.
2. Add the product's names to "Words customers use" in `nova-taxonomy.md`.
3. Add its fees and terms to `nova-policies.md`, each with a rule ID, if the copilot should answer about it.
4. Add test cases to `evalset.md` (a "what is", a "which is better" and a fraud case), run build step 14, and log the change in `prompts/CHANGELOG.md`.
