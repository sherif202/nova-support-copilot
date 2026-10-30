// Stage 6 (UX): plain-language explanations for the customer and the agent. No model call, no new facts:
// everything here is built from the policies, the customer's own (already masked) records, and the route
// the code took. See docs/UX-PRINCIPLES.md.

const { RULES } = require("./checks");

// Intents in words a customer understands.
const INTENT_WORDS = {
  "fee.explain": { en: "a question about a charge", ar: "سؤال عن رسوم", option: { en: "Explain a charge", ar: "شرح رسوم اتخصمت" } },
  "fee.overdraft": { en: "an overdraft fee question", ar: "سؤال عن رسوم السحب على المكشوف", option: { en: "An overdraft fee", ar: "رسوم السحب على المكشوف" } },
  "fee.waiver_request": { en: "a request to remove a fee", ar: "طلب إلغاء رسوم" },
  "dispute.status": { en: "a question about your dispute", ar: "سؤال عن حالة الاعتراض", option: { en: "Where my dispute is", ar: "الاعتراض بتاعي وصل لفين" } },
  "dispute.documents": { en: "a question about dispute papers", ar: "سؤال عن أوراق الاعتراض", option: { en: "Papers for my dispute", ar: "أوراق الاعتراض" } },
  "dispute.open_request": { en: "a request to open a dispute", ar: "طلب فتح اعتراض" },
  "card.replace_damaged": { en: "a damaged card question", ar: "سؤال عن كارت تالف", option: { en: "Replace a damaged card", ar: "تغيير كارت تالف" } },
  "card.replace_expired": { en: "an expiring card question", ar: "سؤال عن كارت هيخلص", option: { en: "My card is expiring", ar: "الكارت بتاعي هيخلص" } },
  "service.status": { en: "a question about the app or a service", ar: "سؤال عن التطبيق أو صيانة", option: { en: "Is the app or a service down?", ar: "فيه عطل أو صيانة؟" } },
  "general.info": { en: "a general question", ar: "سؤال عام" },
  "general.chitchat": { en: "a greeting or a request for a person", ar: "تحية أو طلب التحدث مع موظف" },
  "general.unknown": { en: "a message I couldn't read", ar: "رسالة مش واضحة" },
};

const wordsFor = (intent, lang) => (INTENT_WORDS[intent] ? INTENT_WORDS[intent][lang] : intent);

// The low-risk P2 intents the customer may pick from when the copilot isn't sure (Stage 6, "Did you mean…").
// Never fraud, complaints, sensitive or out-of-scope: those always go to a person.
const SAFE_CHOICES = ["fee.explain", "fee.overdraft", "dispute.status", "dispute.documents", "card.replace_damaged", "card.replace_expired", "service.status"];
const NEIGHBOUR = {
  "fee.explain": "fee.overdraft",
  "fee.overdraft": "fee.explain",
  "dispute.status": "dispute.documents",
  "dispute.documents": "dispute.status",
  "card.replace_damaged": "service.status",
  "card.replace_expired": "card.replace_damaged",
  "service.status": "card.replace_damaged",
};

// Up to 2 options: the copilot's own guess and its closest low-risk neighbour.
function choicesFor(intent) {
  if (!SAFE_CHOICES.includes(intent)) return [];
  return [intent, NEIGHBOUR[intent]].filter((id) => SAFE_CHOICES.includes(id)).map((id) => ({ intent: id, en: INTENT_WORDS[id].option.en, ar: INTENT_WORDS[id].option.ar }));
}

const RULE_FAMILY = { FEE: { en: "Nova fee schedule", ar: "جدول رسوم نوفا" }, DSP: { en: "Nova disputes policy", ar: "سياسة الاعتراضات" }, CRD: { en: "Nova cards policy", ar: "سياسة الكروت" }, DIG: { en: "Nova digital banking policy", ar: "سياسة الخدمات الرقمية" }, FRD: { en: "Nova fraud policy", ar: "سياسة الاحتيال" }, GEN: { en: "Nova branch information", ar: "معلومات فروع نوفا" } };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (iso) => {
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};
const egp = (n) => `EGP ${Math.abs(Number(n)).toLocaleString("en-US")}`;

// One source in plain words: a rule (its first sentence) or one of the customer's own records.
function describeSource(id, records, notices) {
  const family = id.split("-")[0];
  if (RULES[id]) {
    const text = RULES[id].replace(/\*\*/g, "").split(/(?<=\.)\s/)[0];
    return { id, kind: "rule", en: `${(RULE_FAMILY[family] || { en: "Nova policy" }).en}: ${text}`, ar: `${(RULE_FAMILY[family] || { ar: "سياسة نوفا" }).ar}: ${text}` };
  }
  const r = records.find((x) => (x.record_id || x.dispute_id || x.card_id) === id);
  if (r && r.record_id) return { id, kind: "transaction", en: `Your transaction on ${day(r.date)}: ${r.merchant}, ${egp(r.amount_egp)}`, ar: `عمليتك يوم ${day(r.date)}: ${r.merchant}، ${egp(r.amount_egp)}` };
  if (r && r.dispute_id) return { id, kind: "dispute", en: `Your dispute ${r.dispute_id}: ${r.stage}, ${egp(r.amount_egp)}`, ar: `اعتراضك ${r.dispute_id}: ${r.stage}، ${egp(r.amount_egp)}` };
  if (r && r.card_id) return { id, kind: "card", en: `Your ${r.product} ending ${r.last4}`, ar: `${r.product} اللي آخرها ${r.last4}` };
  const n = notices.find((x) => x.notice_id === id);
  if (n) return { id, kind: "notice", en: `Service notice: ${n.message_en}`, ar: `إعلان صيانة: ${n.message_ar}` };
  return { id, kind: "other", en: id, ar: id };
}

const band = (c) => (c >= 0.85 ? "high" : c >= 0.7 ? "medium" : "low");

// The three layers under an AI answer: general, feature (sources), decision.
function explainAnswer(label, sources, records, notices, checksPassed) {
  const kinds = new Set(sources.map((id) => describeSource(id, records, notices).kind));
  const fromAccount = [...kinds].some((k) => ["transaction", "dispute", "card"].includes(k));
  const fromPolicy = kinds.has("rule");
  return {
    general: {
      en: `Based on ${[fromAccount && "your own account", fromPolicy && "Nova's published rules", kinds.has("notice") && "Nova's service notices"].filter(Boolean).join(" and ") || "Nova's information"}.`,
      ar: `معتمد على ${[fromAccount && "حسابك", fromPolicy && "قواعد نوفا المنشورة", kinds.has("notice") && "إعلانات الصيانة"].filter(Boolean).join(" و") || "معلومات نوفا"}.`,
    },
    sources: sources.map((id) => describeSource(id, records, notices)),
    decision: {
      en: `I read this as ${wordsFor(label.intent, "en")}, with ${band(label.confidence)} confidence (${label.confidence}). It is a low-risk question, so I answered it myself, and the answer passed ${checksPassed.length} safety checks before you saw it.`,
      ar: `فهمت رسالتك على إنها ${wordsFor(label.intent, "ar")}، بثقة ${{ high: "عالية", medium: "متوسطة", low: "منخفضة" }[band(label.confidence)]} (${label.confidence}). ده سؤال قليل المخاطر، فجاوبت عليه بنفسي، والإجابة عدّت ${checksPassed.length} فحوصات أمان قبل ما تشوفها.`,
    },
  };
}

// Why a message went to a person, in one honest line, plus the routing rule for the agent.
const HANDOFF_WHY = {
  "R-FRAUD": { en: "For your safety: anything that looks like fraud goes straight to our Fraud team, without the AI.", ar: "لأمانك: أي حاجة شكلها احتيال بتروح فوراً لفريق الاحتيال من غير الذكاء الاصطناعي.", rule: "Fraud signal: fraud word list or understand step P0 (taxonomy, non-negotiable 1)" },
  "R-COMPLAINT": { en: "Complaints and sensitive matters are always handled by a person.", ar: "الشكاوى والحالات الحساسة دايماً بيتعامل معاها موظف.", rule: "P1 complaint or sensitive (step 11)" },
  "R-OUT-OF-SCOPE": { en: "This is outside what I can do here (moving money, removing fees, advice, or someone else's account).", ar: "ده خارج اللي أقدر أعمله هنا (تحويل فلوس، إلغاء رسوم، نصيحة، أو حساب حد تاني).", rule: "P3 out of scope (step 11)" },
  "R-UNSURE": { en: "I wasn't sure enough what you meant, so a colleague will check rather than me guessing.", ar: "مكنتش متأكد كفاية من قصدك، فحد من زمايلنا هيراجع بدل ما أخمّن.", rule: "Understand confidence under the handoff threshold, or a card with no delivery recorded" },
  "R-PERSON": { en: "You asked for a person, or this needs one.", ar: "طلبت تكلم موظف، أو الموضوع محتاج موظف.", rule: "Customer asked for a person, or sensitive.vulnerable to Supervisor" },
  "R-CHECK-FAILED": { en: "My answer didn't pass Nova's safety checks, so a colleague will reply instead.", ar: "إجابتي معدّتش فحوصات الأمان بتاعة نوفا، فحد من زمايلنا هيرد بدالي.", rule: "Output check failed (step 12 or step 15)" },
  "R-NO-SOURCE": { en: "Nova's rules and your records don't cover this, and I won't guess.", ar: "قواعد نوفا وسجلاتك مفيهاش المعلومة دي، ومش هخمّن.", rule: "Answer step found no source (no source, no answer)" },
  "R-MODEL-DOWN": { en: "The assistant is busy or unavailable right now.", ar: "المساعد مشغول أو مش متاح دلوقتي.", rule: "Model call failed or timed out" },
  "R-OFF": { en: "The assistant is switched off right now, so colleagues are answering.", ar: "المساعد مقفول دلوقتي، والموظفين هم اللي بيردوا.", rule: "Mode Off (COPILOT_ENABLED=false)" },
  "R-WAIT": { en: "That was a lot of messages in one minute. This limit protects your account; nothing was lost.", ar: "بعت رسايل كتير في دقيقة واحدة. الحد ده بيحمي حسابك، ومفيش حاجة ضاعت.", rule: "Rate limit: over 20 messages a minute" },
  "R-DRAFT": { en: "A colleague is checking my answer before you see it.", ar: "حد من زمايلنا بيراجع إجابتي قبل ما توصلك.", rule: "Mode Suggest only: the AI drafted, an agent approves" },
};

module.exports = { explainAnswer, HANDOFF_WHY, choicesFor, SAFE_CHOICES, band, wordsFor, describeSource };
