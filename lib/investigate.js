// Transaction investigator (1.0.13; on unless INVESTIGATE=off; docs/INVESTIGATOR.md). Works with the customer to
// narrow the search to a few transactions, explains one transaction's status and history step by step, and checks
// for money on its way before anything goes to a person. Deterministic: everything is built in code from the
// logged-in customer's own records (data/transactions.json + data/transaction-details.json) and the rule text in
// knowledge/nova-transaction-rules.md. No model call, and no change to the AI prompts.

const fs = require("fs");
const path = require("path");
const { customerRecords, findDates, normalizeDigits } = require("./lookup");

const ROOT = path.join(__dirname, "..");
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
const RULES_TEXT = fs.readFileSync(path.join(ROOT, "knowledge", "nova-transaction-rules.md"), "utf8");
const RULES = Object.fromEntries([...RULES_TEXT.matchAll(/^\s*-\s*\*\*(TXS-\d+\.\d+)\*\*\s*(.*)$/gm)].map((m) => [m[1], m[2]]));
const HOLIDAYS = ["2026-10-06", "2026-11-05"]; // TXS-3.3 (synthetic)

const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const DAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS_AR = ["الأحد", "الاتنين", "التلات", "الأربع", "الخميس", "الجمعة", "السبت"];

// "2026-10-30T18:42" -> { en: "Fri 30 Oct, 18:42", ar: "الجمعة 30 أكتوبر، 18:42" }
function when(iso, withDay = true) {
  if (!iso) return { en: "", ar: "" };
  const [date, time] = iso.split("T");
  const [y, m, d] = date.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const t = time ? `, ${time.slice(0, 5)}` : "";
  return { en: `${withDay ? DAYS_EN[wd] + " " : ""}${d} ${MONTHS_EN[m - 1]}${t}`, ar: `${withDay ? DAYS_AR[wd] + " " : ""}${d} ${MONTHS_AR[m - 1]}${t.replace(",", "،")}` };
}
const money = (n) => {
  const v = Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
  return { en: `EGP ${v}`, ar: `${v} جنيه` };
};
const join = (parts, sep = " ") => ({ en: parts.map((p) => (typeof p === "string" ? p : p.en)).join(sep), ar: parts.map((p) => (typeof p === "string" ? p : p.ar)).join(sep) });

const CHANNEL = {
  card_in_store: { en: "card in store", ar: "بالكارت في المحل" },
  online: { en: "online", ar: "أونلاين" },
  atm: { en: "ATM", ar: "ماكينة صراف" },
  instapay: { en: "InstaPay", ar: "إنستاباي" },
  bank_transfer: { en: "bank transfer", ar: "تحويل بنكي" },
  international: { en: "international transfer", ar: "تحويل من بره مصر" },
  standing_order: { en: "standing order", ar: "أمر دفع ثابت" },
  refund: { en: "merchant refund", ar: "استرداد من التاجر" },
  fee: { en: "Nova fee", ar: "رسوم نوفا" },
};
const STATUS = {
  posted: { en: "Posted", ar: "اتخصمت", tone: "ok" },
  pending: { en: "Pending", ar: "معلّقة", tone: "wait" },
  declined: { en: "Declined", ar: "اترفضت", tone: "risk" },
  reversed: { en: "Reversed", ar: "اتلغت", tone: "info" },
  refunded: { en: "Refund on its way", ar: "الفلوس راجعة", tone: "info" },
  disputed: { en: "Disputed", ar: "عليها اعتراض", tone: "wait" },
};

// The short reason shown in the timeline step ("Pending: ..."); the full reason is in "Why".
const SHORT = {
  card_hold: { en: "waiting for the merchant to confirm (card hold)", ar: "مستنيين التاجر يأكد (مبلغ محجوز)" },
  hotel_hold: { en: "hotel hold, which can last up to 14 days", ar: "حجز فندق، ممكن يفضل لحد 14 يوم" },
  new_sender_review: { en: "routine security review of a first transfer from a new sender", ar: "مراجعة أمان روتينية لأول تحويل من شخص جديد" },
  after_cutoff: { en: "sent after the 2:00 pm cut-off before the weekend", ar: "اتبعت بعد ميعاد الـ 2 الضهر وقبل الويك إند" },
  payroll_date: { en: "waiting for the payroll date your employer set", ar: "مستني تاريخ المرتب اللي الشركة حددته" },
  international_transfer: { en: "international transfer, 2 to 5 business days", ar: "تحويل من بره مصر، من 2 لـ 5 أيام عمل" },
  merchant_refund: { en: "waiting for the merchant to send the refund", ar: "مستنيين التاجر يبعت الاسترداد" },
};

// Plain-words reasons, each tied to a rule (TXS-*). `ctx` has the record and its details.
const DECLINE = {
  insufficient_balance: (x) => ({ rule: "TXS-2.1", en: `Your available balance at that moment was ${money(x.d.available_balance_egp).en}, less than the ${money(x.t.amount_egp).en} payment. Pending holds count against the available balance.`, ar: `رصيدك المتاح ساعتها كان ${money(x.d.available_balance_egp).ar}، أقل من مبلغ العملية ${money(x.t.amount_egp).ar}. والمبالغ المعلّقة بتتحسب من الرصيد المتاح.` }),
  daily_limit: (x) => ({ rule: "TXS-2.2", en: `You had already withdrawn ${money(x.d.used_today_egp || 0).en} that day, and the daily ATM limit is EGP 20,000. The limit resets at midnight Cairo time.`, ar: `كنت سحبت ${money(x.d.used_today_egp || 0).ar} في نفس اليوم، والحد اليومي للسحب من الماكينة 20,000 جنيه. الحد بيرجع من أول نص الليل بتوقيت القاهرة.` }),
  card_blocked: () => ({ rule: "TXS-2.3", en: "The card was blocked at that moment, so every payment was declined.", ar: "الكارت كان متوقف ساعتها، فأي عملية بتترفض." }),
  card_expired: () => ({ rule: "TXS-2.3", en: "The card had passed its expiry month.", ar: "الكارت كان عدّى شهر انتهائه." }),
  pin_tries: () => ({ rule: "TXS-2.4", en: "After 3 wrong PIN tries in a row, PIN payments and ATM withdrawals are declined until midnight Cairo time.", ar: "بعد 3 محاولات غلط للرقم السري ورا بعض، العمليات بالرقم السري والسحب بيترفضوا لحد نص الليل بتوقيت القاهرة." }),
  online_security_check: () => ({ rule: "TXS-2.5", en: "The online security check wasn't completed (for example the one-time code), so the payment was declined to protect you. Trying again and completing the code usually works.", ar: "خطوة الأمان الأونلاين ماكملتش (زي الكود اللي بيوصلك)، فالعملية اترفضت عشان نحميك. لما تحاول تاني وتكمّل الكود غالباً بتمشي." }),
  merchant_category: () => ({ rule: "TXS-2.6", en: "This type of merchant is blocked on all Nova cards.", ar: "النوع ده من التجار مقفول على كل كروت نوفا." }),
};
const HOLD = {
  card_hold: () => ({ rule: "TXS-1.1", en: "The merchant authorised the payment and Nova is holding the amount until the merchant confirms it. Card payments usually post within 3 business days.", ar: "التاجر عمل تفويض بالعملية ونوفا حاجزة المبلغ لحد ما التاجر يأكدها. عمليات الكارت عادةً بتتخصم خلال 3 أيام عمل." }),
  hotel_hold: () => ({ rule: "TXS-1.2", en: "Hotels, car hire and fuel stations can hold an estimated amount for up to 14 days, and the final amount can be different.", ar: "الفنادق وتأجير العربيات ومحطات البنزين ممكن يحجزوا مبلغ تقديري لحد 14 يوم، والمبلغ النهائي ممكن يختلف." }),
  new_sender_review: () => ({ rule: "TXS-4.1", en: "InstaPay is usually instant. A first transfer from a new sender can wait for a routine security review, usually until 12:00 pm the next day.", ar: "إنستاباي عادةً فوري. أول تحويل من شخص جديد ممكن يستنى مراجعة أمان روتينية، عادةً لحد 12 الضهر تاني يوم." }),
  after_cutoff: () => ({ rule: "TXS-4.2", en: "It was sent after the 2:00 pm cut-off before the weekend (Friday and Saturday aren't business days), so it's processed on the next business day.", ar: "اتبعت بعد ميعاد الـ 2 الضهر وقبل الويك إند (الجمعة والسبت مش أيام عمل)، فبيتنفذ أول يوم عمل بعده." }),
  payroll_date: () => ({ rule: "TXS-4.3", en: "Salaries post on the date in the employer's payroll file, by 10:00 am Cairo time. Nova can't change the date your employer chose.", ar: "المرتبات بتنزل في التاريخ اللي في ملف المرتبات بتاع الشركة، قبل 10 الصبح بتوقيت القاهرة. نوفا متقدرش تغيّر التاريخ اللي الشركة اختارته." }),
  international_transfer: () => ({ rule: "TXS-4.4", en: "International transfers take 2 to 5 business days, depending on the sending bank and the banks in between.", ar: "التحويلات من بره مصر بتاخد من 2 لـ 5 أيام عمل، حسب البنك اللي باعت والبنوك اللي في النص." }),
  merchant_refund: () => ({ rule: "TXS-5.2", en: "The merchant has started the refund. It arrives when the merchant sends it, usually within 10 business days. Nova doesn't decide or speed up a merchant's refund.", ar: "التاجر بدأ يرجّع الفلوس. بتوصل لما التاجر يبعتها، عادةً خلال 10 أيام عمل. نوفا مش هي اللي بتقرر أو بتسرّع استرداد التاجر." }),
};

// When it happened: the sent time for money coming in, the authorised time for money going out.
const stamp = (t, d) => (t.amount_egp > 0 ? d.sent_at || d.posted_at || t.date : d.authorised_at || t.date);
// The first sentence of a reason, as a phrase after "Declined:" (first letter lower case, nothing else changed).
const phrase = (text) => { const first = text.split(". ")[0].replace(/\.$/, ""); return first.charAt(0).toLowerCase() + first.slice(1); };

function details() {
  return readJson("data/transaction-details.json").details;
}

// Today in Cairo, as YYYY-MM-DD (the server passes it, so tests can pin it).
function addBusinessDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`);
  let left = n;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 5 && wd !== 6 && !HOLIDAYS.includes(d.toISOString().slice(0, 10))) left -= 1;
  }
  return d.toISOString().slice(0, 10);
}

// One transaction as a tap card: amount and date in bold, then place, channel and a status badge.
function card(t, d) {
  const status = STATUS[t.status] || STATUS.posted;
  return {
    id: t.record_id,
    kind: "transaction",
    bold: [money(t.amount_egp), when(stamp(t, d), false)],
    title: { en: t.merchant, ar: t.merchant },
    tag: CHANNEL[d.channel] || { en: d.channel, ar: d.channel },
    meta: [d.area ? { en: d.area, ar: d.area } : null, d.card_last4 ? { en: `card •••• ${d.card_last4}`, ar: `كارت •••• ${d.card_last4}` } : null].filter(Boolean),
    status: { key: t.status, en: status.en, ar: status.ar, tone: status.tone },
    direction: t.amount_egp > 0 ? "in" : "out",
  };
}

// Clues already in the customer's own words, so the finder can skip those steps.
function cluesFrom(text, customerId) {
  const s = normalizeDigits(String(text || "")).toLowerCase();
  const { dates, rest } = findDates(s);
  const clues = {};
  if (/\btoday\b|النهارده|ennaharda|el naharda/.test(s)) clues.when = "today";
  else if (/yesterday|امبارح|embare7|mbare7/.test(s)) clues.when = "yesterday";
  else if (/this week|الأسبوع ده|el esbo3 da/.test(s)) clues.when = "week";
  else if (/this month|الشهر ده|el shahr da/.test(s)) clues.when = "month";
  else if (dates.length) clues.when = `date:${String(dates[0].month).padStart(2, "0")}-${String(dates[0].day).padStart(2, "0")}`;
  if (/instapay|انستا|إنستا/.test(s)) clues.how = "instapay";
  else if (/\batm\b|ماكينة|makana|سحبت|sa7abt/.test(s)) clues.how = "atm";
  else if (/online|اونلاين|أونلاين|website|app/.test(s)) clues.how = "online";
  else if (/transfer|تحويل|7awalt|ta7wil/.test(s)) clues.how = "transfer";
  else if (/\bshop|store|محل|ma7al/.test(s)) clues.how = "card_in_store";
  const amount = (rest.match(/\d+(?:\.\d+)?/g) || []).map(Number).find((n) => n >= 5 && n < 1e7);
  if (amount) clues.amount = `about:${amount}`;
  const { transactions } = customerRecords(customerId);
  const words = s.split(/[^a-z0-9؀-ۿ.]+/).filter((w) => w.length >= 3);
  const place = transactions.map((t) => t.merchant).find((m) => words.some((w) => m.toLowerCase().split(/[^a-z0-9.]+/).includes(w)));
  if (place) clues.place = place.split(/[ ,]/)[0];
  if (/received|didn't arrive|waiting|وصل|جالي|مستني|mestanni/.test(s)) clues.direction = "in";
  return clues;
}

// Filter the customer's transactions. `today` is YYYY-MM-DD in Cairo.
function matchOne(t, d, f, today) {
  const date = stamp(t, d).slice(0, 10);
  if (f.when === "today" && date !== today) return false;
  if (f.when === "yesterday" && date !== addDays(today, -1)) return false;
  if (f.when === "week" && date < addDays(today, -7)) return false;
  if (f.when === "month" && date < addDays(today, -31)) return false;
  if (f.when && f.when.startsWith("date:") && date.slice(5) !== f.when.slice(5)) return false;
  if (f.how) {
    const ch = d.channel;
    if (f.how === "transfer" && !["bank_transfer", "instapay", "international", "standing_order"].includes(ch)) return false;
    if (f.how !== "transfer" && ch !== f.how) return false;
  }
  if (f.amount) {
    const a = Math.abs(t.amount_egp);
    const [kind, v1, v2] = f.amount.split(":");
    if (kind === "about" && Math.abs(a - Number(v1)) > Math.max(5, Number(v1) * 0.15)) return false;
    if (kind === "range" && (a < Number(v1) || a > Number(v2))) return false;
  }
  if (f.place && !t.merchant.toLowerCase().includes(String(f.place).toLowerCase()) && !String(d.area || "").toLowerCase().includes(String(f.place).toLowerCase())) return false;
  if (f.direction === "in" && t.amount_egp < 0) return false;
  if (f.direction === "out" && t.amount_egp > 0) return false;
  return true;
}
function addDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function find(customerId, filters, today) {
  const D = details();
  const all = customerRecords(customerId).transactions.filter((t) => t.category !== "Fee" || filters.include_fees);
  const hits = all.filter((t) => matchOne(t, D[t.record_id] || {}, filters, today))
    .sort((a, b) => String(stamp(b, D[b.record_id] || {})).localeCompare(String(stamp(a, D[a.record_id] || {}))));
  // Memory jogger: the places the customer used in the current results, most recent first.
  const places = [...new Set(hits.map((t) => t.merchant.replace(/^(InstaPay from|Bank transfer from|International transfer from|Refund from) /, "")))].slice(0, 6);
  return { count: hits.length, total: all.length, items: hits.slice(0, 8).map((t) => card(t, D[t.record_id] || {})), places };
}

// One transaction, explained: memory jogger, step-by-step timeline, why, what next, and what happened around it.
function detail(customerId, id, today) {
  const D = details();
  const { transactions } = customerRecords(customerId);
  const t = transactions.find((x) => x.record_id === id);
  if (!t) return null;
  const d = D[id] || {};
  const x = { t, d };
  const steps = [];
  const at = d.area ? join([t.merchant, `(${d.area})`]) : { en: t.merchant, ar: t.merchant };
  const via = CHANNEL[d.channel] || { en: d.channel, ar: d.channel };
  let why = null, next = null, rule = d.rule || null;
  if (t.amount_egp > 0) {
    steps.push(d.sender
      ? { en: `Sent by ${d.sender} by ${via.en}${d.sent_at ? `, ${when(d.sent_at).en}` : ""}`, ar: `اتبعت من ${d.sender} عن طريق ${via.ar}${d.sent_at ? `، ${when(d.sent_at).ar}` : ""}`, tone: "info" }
      : { en: `Received: ${t.merchant} (${via.en})`, ar: `وصلت: ${t.merchant} (${via.ar})`, tone: "info" });
  } else if (d.channel !== "fee") {
    steps.push({ en: `${t.status === "declined" ? "Tried" : "Authorised"} ${when(d.authorised_at || t.date).en} at ${at.en} (${via.en})`, ar: `${t.status === "declined" ? "اتعملت محاولة" : "اتعمل تفويض"} ${when(d.authorised_at || t.date).ar} في ${at.ar} (${via.ar})`, tone: "info" });
  }
  if (t.status === "declined") {
    const r = (DECLINE[d.decline_code] || (() => ({ rule: null, en: "The payment was declined.", ar: "العملية اترفضت." })))(x);
    rule = r.rule;
    why = r;
    steps.push({ en: `Declined: ${phrase(r.en)}`, ar: `اترفضت: ${r.ar.split(". ")[0].replace(/\.$/, "")}`, tone: "risk" });
    steps.push({ en: "No money was taken (TXS-2.7)", ar: "مفيش فلوس اتخصمت (TXS-2.7)", tone: "ok" });
    const retry = transactions.find((y) => (D[y.record_id] || {}).retry_of === id);
    next = retry
      ? { en: `You tried again at ${when((D[retry.record_id] || {}).authorised_at || retry.date).en} and it went through.`, ar: `حاولت تاني ${when((D[retry.record_id] || {}).authorised_at || retry.date).ar} والعملية مشيت.` }
      : { en: "You can try again once the reason is fixed (for example after money comes in, after midnight for a limit, or by completing the code).", ar: "تقدر تحاول تاني لما السبب يتحل (مثلاً بعد ما فلوس تنزل، أو بعد نص الليل للحد، أو لما تكمّل الكود)." };
  } else if (t.status === "pending") {
    const r = (HOLD[d.hold_reason] || HOLD.card_hold)(x);
    rule = r.rule;
    why = r;
    const expected = d.expected_post || addBusinessDays((d.authorised_at || t.date).slice(0, 10), 3);
    const late = expected.slice(0, 10) < today;
    const short = SHORT[d.hold_reason] || SHORT.card_hold;
    steps.push({ en: `Pending: ${short.en}`, ar: `معلّقة: ${short.ar}`, tone: "wait" });
    steps.push({ en: `${t.amount_egp > 0 ? "Expected in your account" : "Expected to post"} by ${when(expected).en}${late ? " (that time has passed)" : ""}`, ar: `${t.amount_egp > 0 ? "متوقع توصل حسابك" : "متوقع تتخصم"} قبل ${when(expected).ar}${late ? " (الميعاد ده عدّى)" : ""}`, tone: late ? "risk" : "wait" });
    next = late
      ? { en: "The normal time has passed, so a colleague should trace it. I'll pass them everything we found.", ar: "الميعاد العادي عدّى، فالأحسن زميل يتتبعها. هبعتله كل اللي لقيناه." }
      : { en: `Nothing to do for now: under ${rule}, it should be done by ${when(expected).en}. This is the normal time, not a guarantee.`, ar: `مفيش حاجة تعملها دلوقتي: حسب ${rule} المفروض تخلص قبل ${when(expected).ar}. ده الميعاد العادي، مش ضمان.` };
    x.expected = expected;
    x.late = late;
  } else if (t.status === "reversed") {
    rule = "TXS-5.1";
    why = { rule, en: "The merchant cancelled the payment before it posted (for example a cancelled order or trip), so the hold was reversed.", ar: "التاجر لغى العملية قبل ما تتخصم (زي طلب أو مشوار اتلغى)، فالمبلغ المحجوز رجع." };
    steps.push({ en: `Reversed ${when(d.reversed_at).en}: the money is back in your available balance`, ar: `اتلغت ${when(d.reversed_at).ar}: الفلوس رجعت لرصيدك المتاح`, tone: "ok" });
    next = { en: "Nothing to do: the money is back.", ar: "مفيش حاجة تعملها: الفلوس رجعت." };
  } else if (t.status === "refunded") {
    rule = "TXS-5.2";
    const refund = transactions.find((y) => y.record_id === d.refund_id);
    const rd = refund ? D[refund.record_id] || {} : {};
    steps.push({ en: `Posted ${when(d.posted_at || t.date).en}`, ar: `اتخصمت ${when(d.posted_at || t.date).ar}`, tone: "info" });
    if (refund) steps.push({ en: `Refund started by ${t.merchant} ${when(rd.sent_at || refund.date).en}: ${refund.status === "posted" ? "back in your account" : `expected by ${when(rd.expected_post).en}`}`, ar: `${t.merchant} بدأ يرجّع الفلوس ${when(rd.sent_at || refund.date).ar}: ${refund.status === "posted" ? "رجعت حسابك" : `متوقع قبل ${when(rd.expected_post).ar}`}`, tone: "wait" });
    why = HOLD.merchant_refund();
    next = { en: "Nothing to do for now. If it hasn't arrived by then, a dispute is the route (a colleague can open it).", ar: "مفيش حاجة تعملها دلوقتي. لو موصلتش لحد الميعاد، الاعتراض هو الطريق (زميل يقدر يفتحه)." };
  } else {
    if (d.posted_at || t.date) steps.push({ en: `Posted ${when(d.posted_at || t.date).en}`, ar: `اتخصمت ${when(d.posted_at || t.date).ar}`, tone: "ok" });
    next = { en: "This payment is complete.", ar: "العملية دي خلصت." };
  }

  // Memory jogger: where, how and when, in one sentence.
  const jog = t.amount_egp > 0
    ? { en: `This is ${money(t.amount_egp).en} from ${d.sender || t.merchant}, sent by ${via.en}${d.sent_at ? ` on ${when(d.sent_at).en}` : ""}.`, ar: `دي ${money(t.amount_egp).ar} من ${d.sender || t.merchant}، اتبعتت عن طريق ${via.ar}${d.sent_at ? ` يوم ${when(d.sent_at).ar}` : ""}.` }
    : { en: `You made this at ${at.en}${d.card_last4 ? ` with your card ending ${d.card_last4}` : ""} (${via.en}) on ${when(d.authorised_at || t.date).en}${d.terminal ? `, ${d.terminal}` : ""}.`, ar: `عملت العملية دي في ${at.ar}${d.card_last4 ? ` بالكارت اللي آخره ${d.card_last4}` : ""} (${via.ar}) يوم ${when(d.authorised_at || t.date).ar}${d.terminal ? `، ${d.terminal}` : ""}.` };

  // What happened around it, in order: the same day and the day after.
  const day = stamp(t, d).slice(0, 10);
  const around = transactions.filter((y) => y.record_id !== id).map((y) => ({ y, yd: D[y.record_id] || {} }))
    .filter(({ y, yd }) => { const yday = stamp(y, yd).slice(0, 10); return yday >= day && yday <= addDays(day, 1); })
    .sort((a, b) => String(stamp(a.y, a.yd)).localeCompare(String(stamp(b.y, b.yd))))
    .slice(0, 5).map(({ y, yd }) => ({ id: y.record_id, when: when(stamp(y, yd)), what: { en: `${y.merchant}, ${money(y.amount_egp).en}${y.amount_egp > 0 ? " in" : ""}`, ar: `${y.merchant}، ${money(y.amount_egp).ar}${y.amount_egp > 0 ? " داخلة" : ""}` }, status: STATUS[y.status] || STATUS.posted }));

  return { item: card(t, d), reason_key: d.decline_code || d.hold_reason || t.status, jogger: jog, steps, why, rule, rule_text: rule ? RULES[rule] : null, next, around, late: Boolean(x.late), expected: x.expected || null, can_report_fraud: t.amount_egp < 0 };
}

const SOURCES = {
  person: { channels: ["instapay", "bank_transfer"], en: "Someone sent me money", ar: "حد بعتلي فلوس" },
  salary: { channels: ["bank_transfer"], salary: true, en: "My salary", ar: "مرتبي" },
  refund: { channels: ["refund"], en: "A refund from a shop", ar: "فلوس راجعة من محل" },
  abroad: { channels: ["international"], en: "From abroad", ar: "من بره مصر" },
};
// Normal timing when nothing is found yet, by source.
const NORMAL = {
  person: { rule: "TXS-4.1", en: "InstaPay usually arrives within seconds; a bank transfer arrives the next business day if sent before the 2:00 pm cut-off (TXS-4.2).", ar: "إنستاباي عادةً بيوصل في ثواني؛ والتحويل البنكي بيوصل أول يوم عمل لو اتبعت قبل الساعة 2 الضهر (TXS-4.2)." },
  salary: { rule: "TXS-4.3", en: "Salaries post on the date in your employer's payroll file, by 10:00 am. Your employer can confirm the date.", ar: "المرتب بينزل في التاريخ اللي في ملف المرتبات بتاع شركتك، قبل 10 الصبح. الشركة تقدر تأكدلك التاريخ." },
  refund: { rule: "TXS-5.2", en: "A refund arrives when the merchant sends it, usually within 10 business days of the merchant starting it.", ar: "الاسترداد بيوصل لما التاجر يبعته، عادةً خلال 10 أيام عمل من ما يبدأه." },
  abroad: { rule: "TXS-4.4", en: "International transfers take 2 to 5 business days.", ar: "التحويلات من بره مصر بتاخد من 2 لـ 5 أيام عمل." },
};

// "I'm waiting for money": check money on its way and recent money in, before any handoff.
function waiting(customerId, { source = "person", from = "", sent = "" }, today) {
  const D = details();
  const src = SOURCES[source] || SOURCES.person;
  const incoming = customerRecords(customerId).transactions.filter((t) => t.amount_egp > 0).map((t) => ({ t, d: D[t.record_id] || {} }))
    .filter(({ t, d }) => (src.salary ? /salary/i.test(t.merchant) : src.channels.includes(d.channel) && !/salary/i.test(t.merchant)))
    .filter(({ t, d }) => !from || `${t.merchant} ${d.sender || ""}`.toLowerCase().includes(String(from).toLowerCase()));
  const recentFrom = addDays(today, -10);
  const pending = incoming.filter(({ t }) => t.status === "pending");
  const posted = incoming.filter(({ t, d }) => t.status === "posted" && ((d.posted_at || d.sent_at || t.date).slice(0, 10)) >= recentFrom);
  const sentDays = { today: 0, yesterday: 1, "2-3": 3, "4+": 5 }[sent];
  const expectedBusiness = { person: 1, salary: 1, refund: 10, abroad: 5 }[source] || 1;
  const sentDate = sentDays === undefined ? null : addDays(today, -sentDays);
  const normalBy = sentDate ? addBusinessDays(sentDate, expectedBusiness) : null;
  const overdue = Boolean(normalBy && normalBy < today);
  const items = (list) => list.map(({ t }) => ({ ...card(t, D[t.record_id] || {}), detail: detail(customerId, t.record_id, today) }));
  return {
    source: { key: source, en: src.en, ar: src.ar },
    from,
    pending: items(pending),
    posted: items(posted),
    normal: NORMAL[source] || NORMAL.person,
    normal_by: normalBy ? when(normalBy) : null,
    overdue,
    // Hand over only when nothing is on its way and the normal time has passed (or the customer asks).
    suggest_handoff: !pending.length && !posted.length && (overdue || sentDays === undefined),
  };
}

// The investigation summary an agent gets with the handoff, so the customer never repeats themselves.
function summary({ flow, filters = {}, candidates = [], found = [], reason = "", lookingFor = "" }) {
  const f = Object.entries(filters).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(", ") || "none";
  return [
    `Investigation (${flow}). Looking for: ${lookingFor || "not stated"}.`,
    `Filters: ${f}.`,
    `Candidates checked: ${candidates.length ? candidates.join(", ") : "none"}.`,
    `Pending or incoming found: ${found.length ? found.join(", ") : "none"}.`,
    `Why a person: ${reason || "the customer asked"}.`,
  ].join(" ");
}

module.exports = { find, detail, waiting, summary, cluesFrom, addBusinessDays, SOURCES, RULES };
