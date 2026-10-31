// Nova Bank help chat, front end. Talks to server.js through /api/*.
// Stage 6 UX: trust (calibration, confidence, honest fallbacks), layered explanations, and human steering
// (person any time, "Did you mean…", feedback, undo, automation modes). See docs/UX-PRINCIPLES.md.
// Every piece of text from the server is shown with textContent, never as HTML.

const $ = (id) => document.getElementById(id);
let lastMessage = "";
let customers = [];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function scrollDown() {
  $("messages").scrollTop = $("messages").scrollHeight;
}

const isArabic = (lang) => ["arabic", "ar", "franco"].includes(lang);
const pick = (pair, arabic) => (pair ? (arabic ? pair.ar : pair.en) : "");

// ---------- Pillar 1: calibration. What the assistant is and isn't, in the customer's language. ----------

const SUGGESTIONS = {
  en: ["What is this 120 pound charge?", "Where is my dispute on Unknown POS 4471?", "My card expires next month, do I have to pay?", "I took out 2,000 EGP in Dubai, why did you charge 75?"],
  ar: ["3ayez a3raf el 25 geneh elly et5asamo yom 14/9 dol eh", "fen el e3terad bta3y 3la Unknown POS 4471?", "el kart et2sar, a3mel eh?", "الكارت هيخلص الشهر الجاي، هدفع حاجة؟"],
};

function showWelcome() {
  const customer = customers.find((c) => c.customer_id === $("customer").value) || {};
  const arabic = isArabic(customer.preferred_language);
  const card = el("section", "banner");
  card.setAttribute("dir", arabic ? "rtl" : "ltr");
  card.setAttribute("aria-label", arabic ? "عن المساعد" : "About this assistant");
  card.append(el("strong", "", arabic ? "أنا مساعد نوفا بالذكاء الاصطناعي" : "I'm Nova's AI assistant"));
  const list = el("ul");
  (arabic
    ? ["بجاوب من حسابك أنت ومن قواعد نوفا المنشورة بس.", "أقدر أشرح رسوم، أقولك الاعتراض وصل لفين، أو أساعدك في كارت بايظ أو هيخلص.", "مبحولش فلوس، ومبلغيش رسوم، ومبديش نصايح مالية.", "عمري ما هطلب منك الرقم السري أو الـ OTP أو الـ CVV.", "تقدر تكلم موظف في أي وقت."]
    : ["I answer only from your own account and Nova's published rules.", "I can explain a fee, tell you where your dispute is, or help with a damaged or expiring card.", "I can't move money, remove fees or give financial advice: a colleague can.", "I will never ask for your PIN, OTP or CVV.", "You can talk to a person at any time."]
  ).forEach((t) => list.append(el("li", "", t)));
  card.append(list);
  card.append(quickStart(arabic));
  const tries = el("div", "suggestions");
  tries.append(el("span", "hint", arabic ? "جرّب:" : "Try:"));
  for (const q of SUGGESTIONS[arabic ? "ar" : "en"]) {
    const b = el("button", "suggestion", q);
    b.type = "button";
    b.setAttribute("dir", "auto");
    b.addEventListener("click", () => send(q));
    tries.append(b);
  }
  card.append(tries);
  $("messages").replaceChildren(card);
}

// ---------- Record picker (Stage 6, Human Agency) ----------
// The customer points at exactly what they mean: their own transactions, cards and disputes as cards, with the
// facts that tell them apart in bold. The server builds the cards from the logged-in customer's records only.

const QUICK = [
  { kind: "transactions", en: "🧾 A charge on my account", ar: "🧾 خصم على حسابي" },
  { kind: "cards", en: "💳 My card", ar: "💳 الكارت بتاعي" },
  { kind: "disputes", en: "⚖ My dispute", ar: "⚖ الاعتراض بتاعي" },
  { send: { en: "Is there any maintenance or outage right now?", ar: "هل فيه صيانة أو عطل دلوقتي؟" }, en: "📢 Is a service down?", ar: "📢 فيه خدمة واقفة؟" },
];

function quickStart(arabic) {
  const row = el("div", "suggestions quick");
  row.append(el("span", "hint", arabic ? "ابدأ من هنا:" : "Start here:"));
  for (const q of QUICK) {
    const b = el("button", "suggestion quick-chip", arabic ? q.ar : q.en);
    b.type = "button";
    b.addEventListener("click", () => (q.flow === "find" ? openFinder(arabic, "", b.textContent) : q.flow === "waiting" ? openWaiting(arabic, b.textContent) : q.kind ? openPicker(q.kind, arabic, b.textContent) : send(arabic ? q.send.ar : q.send.en)));
    row.append(b);
  }
  return row;
}

const PICK_TITLE = {
  transactions: { en: "Which charge? Your latest transactions:", ar: "أنهي خصم؟ آخر عملياتك:" },
  cards: { en: "Which card?", ar: "أنهي كارت؟" },
  disputes: { en: "Which dispute?", ar: "أنهي اعتراض؟" },
};

// One picker card: the facts that tell records apart in bold, then the details.
function recordCard(item, arabic, onTap) {
  const b = el("button", "rec-card");
  b.type = "button";
  b.setAttribute("dir", arabic ? "rtl" : "ltr");
  const top = el("span", "rec-bold");
  item.bold.forEach((x, i) => {
    if (i) top.append(el("span", "rec-dot", " · "));
    top.append(el("b", "", pick(x, arabic)));
  });
  if (item.status) top.append(el("span", `st-pill st-${item.status.tone}`, pick(item.status, arabic)));
  const meta = el("span", "rec-meta");
  meta.append(el("span", "rec-tag", pick(item.tag, arabic)));
  item.meta.forEach((m) => meta.append(el("span", "", pick(m, arabic))));
  b.append(top, el("span", "rec-title", pick(item.title, arabic)), meta);
  b.addEventListener("click", () => onTap(item, b));
  return b;
}

function shortLabel(item, arabic) {
  return item.bold.map((x) => pick(x, arabic)).join(" · ");
}

// What a tap on a record can ask. Fees are answered at once; other records offer the services an agent helps with.
const FOLLOW_UPS = {
  fee: (item) => [{ en: "Why was I charged this?", ar: "الخصم ده ليه؟", intent: item.intent }],
  transaction: () => [
    { en: "I don't recognise this payment", ar: "مش أنا اللي عملت العملية دي" },
    { en: "I want to dispute this payment", ar: "عايز أعترض على العملية دي" },
  ],
  card: (item) => [
    ...(item.on_its_way ? [{ en: "Where is my new card?", ar: "الكارت الجديد بتاعي فين؟", intent: "card.replace_expired" }] : []),
    { en: "My card is damaged, how do I replace it?", ar: "الكارت بايظ، أغيّره إزاي؟", intent: "card.replace_damaged" },
    { en: "My card is expiring, what happens?", ar: "الكارت هيخلص، إيه اللي هيحصل؟", intent: "card.replace_expired" },
    { en: "I lost my card", ar: "الكارت ضاع مني" },
  ],
  dispute: () => [
    { en: "Where is my dispute now?", ar: "الاعتراض بتاعي وصل لفين؟", intent: "dispute.status" },
    { en: "What documents do you need for it?", ar: "محتاجين أوراق إيه للاعتراض ده؟", intent: "dispute.documents" },
  ],
};

function followUps(item, arabic, box) {
  const key = item.kind === "transaction" ? (item.is_fee ? "fee" : "transaction") : item.kind;
  const options = FOLLOW_UPS[key](item);
  const ask = (o) => send(pick(o, arabic), { recordId: item.id, chosenIntent: o.intent, label: shortLabel(item, arabic) });
  if (options.length === 1) return ask(options[0]);
  const row = el("div", "choices");
  row.setAttribute("dir", arabic ? "rtl" : "ltr");
  row.append(el("p", "", arabic ? `عن ${shortLabel(item, arabic)}، عايز تعرف إيه؟` : `About ${shortLabel(item, arabic)}: what would you like to do?`));
  for (const o of options) {
    const b = el("button", "chip-btn", pick(o, arabic));
    b.type = "button";
    b.addEventListener("click", () => {
      row.querySelectorAll("button").forEach((x) => (x.disabled = true));
      ask(o);
    });
    row.append(b);
  }
  box.after(row);
  scrollDown();
}

function noneOfThese(arabic) {
  const b = el("button", "secondary small", arabic ? "🙋 ولا واحدة: كلّم موظف" : "🙋 None of these: talk to a person");
  b.type = "button";
  b.addEventListener("click", talkToPerson);
  return b;
}

// A picker opened from a quick-start chip: the customer's own records of one kind.
async function openPicker(kind, arabic, chipText, offset = 0, box = null) {
  let data;
  try {
    data = await (await fetch(`/api/records?customerId=${encodeURIComponent($("customer").value)}&kind=${kind}&offset=${offset}`)).json();
  } catch {
    return;
  }
  if (!box) {
    addUser(chipText);
    box = el("div", "bot-turn picker");
    box.setAttribute("dir", arabic ? "rtl" : "ltr");
    box.append(el("p", "msg bot", data.items.length ? pick(PICK_TITLE[kind], arabic) : arabic ? "مفيش حاجة من النوع ده على حسابك." : "There's nothing of this kind on your account."));
    box.append(el("div", "rec-list"));
    $("messages").append(box);
  }
  const list = box.querySelector(".rec-list");
  box.querySelectorAll(".more-btn, .none-btn").forEach((x) => x.remove());
  const tap = (item, button) => {
    box.querySelectorAll(".rec-card").forEach((x) => x.classList.toggle("picked", x === button));
    followUps(item, arabic, box);
  };
  data.items.forEach((item) => list.append(recordCard(item, arabic, tap)));
  if (data.more) {
    const more = el("button", "secondary small more-btn", arabic ? "اعرض أكتر" : "Show more");
    more.type = "button";
    more.addEventListener("click", () => openPicker(kind, arabic, chipText, offset + data.items.length, box));
    box.append(more);
  }
  const none = noneOfThese(arabic);
  none.classList.add("none-btn");
  box.append(none);
  scrollDown();
}

// The automatic picker: the question was too vague to know which record, so the copilot asks.
function whichOne(data, original, arabic) {
  const box = el("div", "picker");
  box.setAttribute("dir", arabic ? "rtl" : "ltr");
  const list = el("div", "rec-list");
  for (const item of data.picker.items) {
    list.append(recordCard(item, arabic, (it, button) => {
      box.querySelectorAll(".rec-card").forEach((x) => {
        x.disabled = true;
        x.classList.toggle("picked", x === button);
      });
      send(original, { recordId: it.id, chosenIntent: data.intent, label: shortLabel(it, arabic) });
    }));
  }
  box.append(list);
  if (features.investigate && data.picker.kind === "transactions") {
    const search = el("button", "secondary small", arabic ? "🔎 دوّر في كل عملياتي" : "🔎 Search all my transactions");
    search.type = "button";
    search.addEventListener("click", () => openFinder(arabic, original, search.textContent));
    box.append(search);
  }
  box.append(noneOfThese(arabic));
  return box;
}

// ---------- Transaction investigator (1.0.13; on unless INVESTIGATE=off; docs/INVESTIGATOR.md) ----------
// The customer and the copilot narrow the search together, open one transaction to see its status and history
// step by step, and check money on its way before anything goes to a person. Built in code from the customer's
// own records and Nova's transaction rules; no AI call. Every flow ends with "Did this solve it?" and a person.

let features = { investigate: false };
async function loadFeatures() {
  try {
    features = await (await fetch("/api/features")).json();
  } catch {
    features = { investigate: false };
  }
  if (features.investigate) {
    QUICK.unshift(
      { flow: "find", en: "🔎 Find a transaction", ar: "🔎 دوّر على عملية" },
      { flow: "waiting", en: "💸 I'm waiting for money", ar: "💸 مستني فلوس" }
    );
  }
}

const FIND_GROUPS = [
  { key: "when", en: "When?", ar: "إمتى؟", options: [["today", "Today", "النهارده"], ["yesterday", "Yesterday", "امبارح"], ["week", "This week", "الأسبوع ده"], ["month", "This month", "الشهر ده"]] },
  { key: "how", en: "How?", ar: "إزاي؟", options: [["card_in_store", "Card in a shop", "بالكارت في محل"], ["online", "Online", "أونلاين"], ["atm", "ATM", "ماكينة صراف"], ["transfer", "Transfer or InstaPay", "تحويل أو إنستاباي"]] },
  { key: "direction", en: "Money in or out?", ar: "فلوس داخلة ولا خارجة؟", options: [["out", "Money out", "خارجة"], ["in", "Money in", "داخلة"]] },
  { key: "amount", en: "How much, roughly?", ar: "المبلغ تقريباً؟", options: [["range:0:500", "Under 500", "أقل من 500"], ["range:500:5000", "500 to 5,000", "من 500 لـ 5,000"], ["range:5000:10000000", "Over 5,000", "أكتر من 5,000"]] },
];

const api = (route, params) => fetch(`/api/investigate/${route}?${new URLSearchParams({ customerId: $("customer").value, ...params })}`).then((r) => r.json());
const postInv = (route, body) => fetch(`/api/investigate/${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customerId: $("customer").value, ...body }) }).then((r) => r.json());

// Handoff with the full picture: the agent sees what the customer looked for, what was checked and why.
async function investigationHandoff(arabic, ctx, reason, afterNode) {
  const data = await postInv("handoff", { ...ctx, reason });
  const wrap = el("div", "bot-turn");
  wrap.setAttribute("dir", arabic ? "rtl" : "ltr");
  wrap.append(
    el("div", "msg bot", arabic ? `حوّلتك لزميل ومعاه كل اللي دوّرنا عليه، فمش هتعيد الكلام. رقم طلبك ${data.ticket.ticket_id}.` : `I've passed you to a colleague with everything we checked, so you won't have to repeat yourself. Your reference is ${data.ticket.ticket_id}.`),
    el("div", "badge badge-wait", arabic ? "↪ اتحوّلت لموظف ومعاه ملخص البحث" : "↪ Passed to a colleague with the investigation summary")
  );
  (afterNode || $("messages").lastChild).after(wrap);
  scrollDown();
}

// "Did this solve it?" at the end of every flow, plus a person.
function invFeedback(arabic, ctx, onHandoff) {
  const row = el("div", "feedback");
  row.append(el("span", "hint", arabic ? "ده حلّ سؤالك؟" : "Did this solve it?"));
  const yes = el("button", "chip-btn", arabic ? "👍 أيوه" : "👍 Yes");
  const no = el("button", "chip-btn", arabic ? "👎 لأ" : "👎 No");
  const person = el("button", "secondary small", arabic ? "🙋 كلّم موظف" : "🙋 Talk to a person");
  [yes, no, person].forEach((b) => (b.type = "button"));
  yes.addEventListener("click", () => {
    postInv("log", { ...ctx.log, outcome: "solved" });
    row.replaceChildren(el("span", "hint", arabic ? "تمام، شكراً." : "Great, thanks."));
  });
  no.addEventListener("click", () => {
    postInv("log", { ...ctx.log, outcome: "not_solved" });
    row.replaceChildren(el("span", "hint", arabic ? "آسفين. زميل يقدر يكمّل معاك:" : "Sorry about that. A colleague can take it from here:"), person);
  });
  person.addEventListener("click", () => onHandoff(arabic ? "العميل طلب موظف" : "the customer asked for a person"));
  row.append(yes, no, person);
  return row;
}

// a) "Find a transaction": guided narrowing with a live count, pre-filled from the customer's own words.
async function openFinder(arabic, text, chipText) {
  if (chipText) addUser(chipText);
  const box = el("div", "bot-turn finder");
  box.setAttribute("dir", arabic ? "rtl" : "ltr");
  const state = { filters: {}, steps: 0 };
  const head = el("p", "msg bot", arabic ? "تعالى ندوّر عليها سوا. اختار اللي فاكره، وأنا هضيّق البحث:" : "Let's find it together. Pick what you remember and I'll narrow it down:");
  const count = el("p", "find-count");
  const prefill = el("p", "hint");
  const groups = el("div", "find-groups");
  const where = el("div", "find-group");
  const whereInput = el("input", "find-input");
  whereInput.placeholder = arabic ? "اسم المحل أو المكان (مثلاً Carrefour)" : "Shop or place (for example Carrefour)";
  const places = el("div", "suggestions");
  const results = el("div", "rec-list");
  const footer = el("div", "find-footer");
  box.append(head, prefill, count, groups, where, results, footer);
  $("messages").append(box);

  const chipsFor = {};
  for (const g of FIND_GROUPS) {
    const row = el("div", "find-group");
    row.append(el("span", "find-label", arabic ? g.ar : g.en));
    chipsFor[g.key] = [];
    for (const [value, en, ar] of g.options) {
      const b = el("button", "chip-btn", arabic ? ar : en);
      b.type = "button";
      b.addEventListener("click", () => {
        state.filters[g.key] = state.filters[g.key] === value ? "" : value;
        state.steps += 1;
        refresh();
      });
      chipsFor[g.key].push([value, b]);
      row.append(b);
    }
    groups.append(row);
  }
  const go = el("button", "secondary small", arabic ? "دوّر" : "Search");
  go.type = "button";
  const applyPlace = () => {
    state.filters.place = whereInput.value.trim();
    state.steps += 1;
    refresh();
  };
  go.addEventListener("click", applyPlace);
  whereInput.addEventListener("keydown", (e) => e.key === "Enter" && applyPlace());
  where.append(el("span", "find-label", arabic ? "فين؟" : "Where?"), whereInput, go, places);

  const ctx = () => ({ flow: "find", lookingFor: text || "", filters: state.filters, candidates: [...results.querySelectorAll(".rec-card")].map((c) => c.dataset.id), found: [], steps: state.steps, log: { flow: "find", steps: state.steps, found: false } });

  async function refresh(first = false) {
    const params = Object.fromEntries(Object.entries(state.filters).filter(([, v]) => v));
    if (first && text) params.q = text;
    const data = await api("find", params);
    if (first && data.clues) {
      Object.assign(state.filters, data.clues);
      const known = Object.keys(data.clues);
      // Show the clues with the chip labels the customer sees ("This week", "Online"), not internal values.
      const label = (k, v) => {
        const g = FIND_GROUPS.find((x) => x.key === k);
        const o = g && g.options.find(([value]) => value === v);
        if (o) return arabic ? o[2] : o[1];
        if (k === "amount") return (arabic ? "حوالي " : "about EGP ") + String(v).split(":")[1];
        return String(v).replace(/^date:/, "");
      };
      if (known.length) prefill.textContent = (arabic ? "من كلامك: " : "From your message: ") + known.map((k) => label(k, data.clues[k])).join(" · ");
      if (data.clues.place) whereInput.value = data.clues.place;
    }
    for (const g of FIND_GROUPS) for (const [value, b] of chipsFor[g.key]) b.classList.toggle("on", state.filters[g.key] === value);
    count.replaceChildren(el("b", "", String(data.count)), document.createTextNode(arabic ? ` عملية مطابقة من ${data.total}` : ` of ${data.total} transactions match`));
    places.replaceChildren();
    if (!state.filters.place && data.places.length) {
      places.append(el("span", "hint", arabic ? "مش فاكر فين؟ أماكن في النتايج دي:" : "Not sure where? Places in these results:"));
      for (const p of data.places) {
        const b = el("button", "suggestion", p);
        b.type = "button";
        b.addEventListener("click", () => {
          whereInput.value = p;
          applyPlace();
        });
        places.append(b);
      }
    }
    results.replaceChildren();
    for (const item of data.items) {
      const c = recordCard(item, arabic, (it, button) => {
        results.querySelectorAll(".rec-card").forEach((x) => x.classList.toggle("picked", x === button));
        openDetail(it.id, arabic, { ...ctx(), steps: state.steps }, box);
      });
      c.dataset.id = item.id;
      results.append(c);
    }
    if (!data.count) results.append(el("p", "hint", arabic ? "مفيش عملية بالمواصفات دي. جرّب تشيل اختيار." : "Nothing matches all of these. Try removing a choice."));
    footer.replaceChildren();
    const missing = el("button", "secondary small", arabic ? "مش لاقيها هنا" : "It isn't here");
    missing.type = "button";
    missing.addEventListener("click", () => {
      postInv("log", { flow: "find", steps: state.steps, found: false, outcome: "handoff" });
      investigationHandoff(arabic, ctx(), arabic ? "العميل مش لاقي العملية في النتايج" : "the customer couldn't find it in the results", box);
    });
    footer.append(missing, personButton(arabic));
    scrollDown();
  }
  refresh(true);
}

// c) One transaction: memory jogger, timeline, why, what next, what happened around it.
async function openDetail(id, arabic, ctx, afterNode) {
  const d = await api("txn", { id });
  if (d.error) return;
  postInv("log", { flow: ctx.flow, steps: ctx.steps, found: true, outcome: "viewed", recordId: id, reason: d.reason_key });
  const box = el("div", "bot-turn detail-card");
  box.setAttribute("dir", arabic ? "rtl" : "ltr");
  const header = recordCard(d.item, arabic, () => {});
  header.disabled = true;
  header.classList.add("picked");
  box.append(header, el("p", "jogger", `💡 ${pick(d.jogger, arabic)}`));
  const tl = el("ol", "timeline");
  d.steps.forEach((s) => {
    const li = el("li", `tl-${s.tone}`);
    li.append(el("span", "", pick(s, arabic)));
    tl.append(li);
  });
  box.append(el("h4", "", arabic ? "اللي حصل خطوة بخطوة" : "What happened, step by step"), tl);
  if (d.why) {
    const why = el("div", "why-box");
    const title = d.item.status.key === "declined" ? (arabic ? "ليه اترفضت؟" : "Why was it declined?") : d.item.status.key === "pending" ? (arabic ? "ليه لسه معلّقة؟" : "Why is it pending?") : arabic ? "ليه؟" : "Why?";
    why.append(el("strong", "", title), el("p", "", pick(d.why, arabic)));
    if (d.rule) {
      const r = el("code", "src-id", d.rule);
      r.title = d.rule_text || "";
      why.append(el("span", "hint", arabic ? "القاعدة: " : "Nova rule: "), r);
    }
    box.append(why);
  }
  if (d.next) box.append(el("div", "next-box", `${arabic ? "اللي جاي: " : "What happens next: "}${pick(d.next, arabic)}`));
  if (d.around.length) {
    const ar = el("ul", "around");
    d.around.forEach((a) => ar.append(el("li", "", `${pick(a.when, arabic)} · ${pick(a.what, arabic)} · ${pick(a.status, arabic)}`)));
    box.append(el("h4", "", arabic ? "اللي حصل حواليها" : "Around that time"), ar);
  }
  const actions = el("div", "find-footer");
  if (d.can_report_fraud) {
    const fraud = el("button", "secondary small danger", arabic ? "⚠ مش أنا اللي عملتها" : "⚠ I didn't make this");
    fraud.type = "button";
    // Fraud goes first: the same fraud word list as the chat, so it reaches the Fraud team with no AI call.
    fraud.addEventListener("click", () => send(arabic ? "مش أنا اللي عملت العملية دي" : "I didn't make this payment", { recordId: id, label: shortLabel(d.item, arabic) }));
    actions.append(fraud);
  }
  const handCtx = { ...ctx, candidates: [id], found: d.item.status.key === "pending" ? [id] : [], log: { flow: ctx.flow, steps: ctx.steps, found: true, recordId: id, reason: d.reason_key } };
  const handoff = (reason) => investigationHandoff(arabic, handCtx, reason, box);
  if (d.late) {
    const trace = el("button", "small", arabic ? "زميل يتتبعها" : "A colleague will trace it");
    trace.type = "button";
    trace.addEventListener("click", () => handoff(arabic ? "الميعاد العادي عدّى والعملية لسه معلّقة" : "the normal time has passed and it is still pending"));
    actions.append(trace);
  }
  box.append(actions, invFeedback(arabic, handCtx, handoff));
  (afterNode || $("messages").lastChild).after(box);
  scrollDown();
}

// d) "I'm waiting for money": who from, when, how; check money on its way before any handoff.
const WAIT_SOURCES = [["person", "Someone sent me money", "حد بعتلي فلوس"], ["salary", "My salary", "مرتبي"], ["refund", "A refund from a shop", "فلوس راجعة من محل"], ["abroad", "From abroad", "من بره مصر"]];
const WAIT_SENT = [["today", "Today", "النهارده"], ["yesterday", "Yesterday", "امبارح"], ["2-3", "2 to 3 days ago", "من يومين تلاتة"], ["4+", "4 days ago or more", "من 4 أيام أو أكتر"], ["", "Not sure", "مش متأكد"]];

function openWaiting(arabic, chipText, preset = {}) {
  if (chipText) addUser(chipText);
  const box = el("div", "bot-turn finder");
  box.setAttribute("dir", arabic ? "rtl" : "ltr");
  const state = { source: preset.source || "", sent: preset.sent, steps: 0 };
  box.append(el("p", "msg bot", arabic ? "خليني أشوف لو فيه فلوس في الطريق لحسابك. الفلوس جاية منين؟" : "Let me check whether money is on its way to your account. Where is it coming from?"));
  const srcRow = el("div", "find-group");
  const sentRow = el("div", "find-group");
  const name = el("input", "find-input");
  name.placeholder = arabic ? "اسم اللي باعت (اختياري)" : "Sender's name (optional)";
  const out = el("div", "waiting-out");
  const pickRow = (row, list, key) => list.map(([value, en, ar]) => {
    const b = el("button", "chip-btn", arabic ? ar : en);
    b.type = "button";
    b.addEventListener("click", () => {
      state[key] = value;
      state.steps += 1;
      row.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
      if (state.source && state.sent !== undefined) check();
    });
    if (preset[key] === value) b.classList.add("on");
    row.append(b);
    return b;
  });
  srcRow.append(el("span", "find-label", arabic ? "منين؟" : "From?"));
  pickRow(srcRow, WAIT_SOURCES, "source");
  sentRow.append(el("span", "find-label", arabic ? "اتبعتت إمتى؟" : "When was it sent?"));
  pickRow(sentRow, WAIT_SENT, "sent");
  const nameRow = el("div", "find-group");
  nameRow.append(el("span", "find-label", arabic ? "مين؟" : "Who?"), name);
  box.append(srcRow, nameRow, sentRow, out);
  $("messages").append(box);

  async function check() {
    const w = await api("waiting", { source: state.source, sent: state.sent || "", from: name.value.trim() });
    out.replaceChildren();
    const ctx = { flow: "waiting", lookingFor: `${pick(w.source, false)}${w.from ? ` from ${w.from}` : ""}`, filters: { source: state.source, sent: state.sent || "not sure", from: w.from }, candidates: [...w.pending, ...w.posted].map((x) => x.id), found: w.pending.map((x) => x.id), steps: state.steps };
    const log = { flow: "waiting", steps: state.steps, found: w.pending.length + w.posted.length > 0 };
    const showItems = (list, title) => {
      out.append(el("p", "msg bot", title));
      for (const item of list) {
        const c = recordCard(item, arabic, () => openDetail(item.id, arabic, { ...ctx }, out));
        out.append(c);
        const tl = el("ol", "timeline");
        item.detail.steps.forEach((s) => tl.append(el("li", `tl-${s.tone}`, pick(s, arabic))));
        out.append(tl);
        if (item.detail.why) out.append(el("p", "hint", `${pick(item.detail.why, arabic)} (${item.detail.rule})`));
      }
    };
    if (w.pending.length) showItems(w.pending, arabic ? "لقيتها: الفلوس في الطريق لحسابك." : "Found it: the money is on its way to your account.");
    if (w.posted.length) showItems(w.posted, arabic ? "ودي فلوس وصلت حسابك في آخر 10 أيام:" : "And this already arrived in your account in the last 10 days:");
    if (!w.pending.length && !w.posted.length) {
      out.append(el("p", "msg bot", arabic ? "لسه مفيش فلوس في الطريق من النوع ده." : "Nothing of this kind is on its way yet."));
      out.append(el("div", "why-box", `${pick(w.normal, arabic)} (${w.normal.rule})${w.normal_by ? (arabic ? ` حسب ميعاد الإرسال، المعتاد توصل قبل ${pick(w.normal_by, true)}.` : ` From when it was sent, it would normally arrive by ${pick(w.normal_by, false)}.`) : ""}`));
    }
    const actions = el("div", "find-footer");
    if (w.suggest_handoff) {
      const trace = el("button", "small", arabic ? "زميل يتتبعها" : "A colleague will trace it");
      trace.type = "button";
      trace.addEventListener("click", () => investigationHandoff(arabic, ctx, w.overdue ? (arabic ? "الميعاد العادي عدّى ومفيش فلوس في الطريق" : "the normal time has passed and nothing is on its way") : arabic ? "العميل مش متأكد من ميعاد الإرسال ومفيش حاجة في الطريق" : "nothing on its way and the customer isn't sure when it was sent", box));
      actions.append(trace);
    } else if (!w.pending.length && !w.posted.length) {
      actions.append(el("span", "hint", arabic ? "لسه في الميعاد العادي، فالأفضل نستنى شوية." : "It's still within the normal time, so it's best to wait a little."));
    }
    out.append(actions, invFeedback(arabic, { log }, (reason) => investigationHandoff(arabic, ctx, reason, box)));
    scrollDown();
  }
  if (state.source && state.sent !== undefined) check();
}

// ---------- One message ----------

function addUser(text) {
  const div = el("div", "msg user", text);
  div.setAttribute("dir", "auto");
  $("messages").append(div);
  scrollDown();
}

// Pillar 1: confidence feedback in plain words, never raw codes.
function statusBadge(data, arabic) {
  if (data.priority === "P0") return el("div", "badge badge-risk", arabic ? "⚠ حماية من الاحتيال: وصلناك بفريق الاحتيال" : "⚠ Fraud protection: sent to our Fraud team");
  if (data.reply_id === "R-DRAFT") return el("div", "badge badge-wait", arabic ? "⏳ في انتظار مراجعة موظف" : "⏳ Waiting for a colleague to review");
  if (data.action === "pick") return el("div", "badge badge-info", arabic ? "ℹ اختار واحدة عشان أجاوبك عنها بالظبط، من غير تخمين" : "ℹ Pick one so I answer about exactly that one, no guessing");
  if (data.action === "handoff") return el("div", "badge badge-wait", arabic ? "↪ اتحوّلت لموظف" : "↪ Passed to a colleague");
  if (data.reply_id === "R-WAIT" || data.reply_id === "R-EMPTY" || data.reply_id === "R-TOO-LONG") return el("div", "badge badge-info", arabic ? "ℹ مفيش استخدام للذكاء الاصطناعي في الرد ده" : "ℹ No AI was used for this reply");
  const confidence = data.confidence >= 0.85 ? (arabic ? "ثقة عالية" : "high confidence") : (arabic ? "ثقة متوسطة" : "medium confidence");
  return el("div", "badge badge-ok", arabic ? `✓ اتراجعت على قواعد نوفا وسجلاتك · ${confidence}` : `✓ Checked against Nova's rules and your records · ${confidence}`);
}

// Pillar 2: layered explanation (general → feature → decision), collapsed until asked for.
function whyThisAnswer(explain, arabic) {
  const box = el("details", "why");
  box.append(el("summary", "", arabic ? "ليه الإجابة دي؟" : "Why this answer?"));
  box.append(el("p", "why-general", pick(explain.general, arabic)));
  const ICON = { rule: "📘", transaction: "🧾", dispute: "⚖", card: "💳", notice: "📢", other: "•" };
  const list = el("ul", "sources");
  for (const s of explain.sources) {
    const li = el("li");
    li.setAttribute("dir", "auto");
    li.append(el("span", "src-icon", ICON[s.kind] || "•"), el("span", "", pick(s, arabic)), el("code", "src-id", s.id));
    list.append(li);
  }
  box.append(list);
  box.append(el("p", "why-decision", pick(explain.decision, arabic)));
  return box;
}

// Pillar 3: feedback loop on every AI answer. Telos R1: the question is "Did this solve it?", the exact signal
// the North Star (verified resolution rate) counts, so every answer measures the Key Result directly.
function feedback(data, arabic) {
  const row = el("div", "feedback");
  row.append(el("span", "hint", arabic ? "الإجابة دي حلّت مشكلتك؟" : "Did this solve your question?"));
  const up = el("button", "chip-btn", arabic ? "👍 أيوه" : "👍 Yes");
  up.type = "button";
  up.setAttribute("aria-label", arabic ? "أيوه، اتحلّت" : "Yes, solved");
  const down = el("button", "chip-btn", arabic ? "👎 لأ" : "👎 No");
  down.type = "button";
  down.setAttribute("aria-label", arabic ? "لأ، ماتحلّتش" : "No, not solved");
  const post = (rating, reason) =>
    fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message_id: data.message_id, customerId: $("customer").value, rating, reason }) });
  up.addEventListener("click", () => {
    post("up");
    row.replaceChildren(el("span", "hint", arabic ? "شكراً على رأيك." : "Thanks for the feedback."));
  });
  down.addEventListener("click", () => {
    const reasons = el("div", "feedback");
    reasons.append(el("span", "hint", arabic ? "إيه المشكلة؟ (اختياري)" : "What went wrong? (optional)"));
    [["wrong", "Wrong", "غلط"], ["unclear", "Unclear", "مش واضح"], ["not_what_i_asked", "Not what I asked", "مش ده اللي سألت عنه"]].forEach(([key, en, ar]) => {
      const b = el("button", "chip-btn", arabic ? ar : en);
      b.type = "button";
      b.addEventListener("click", () => {
        post("down", key);
        reasons.replaceChildren(el("span", "hint", arabic ? "شكراً. تقدر تعيد صياغة سؤالك، أو تكلم موظف." : "Thanks. You can rephrase your question, or talk to a person."), personButton(arabic));
      });
      reasons.append(b);
    });
    const skip = el("button", "chip-btn", arabic ? "تخطي" : "Skip");
    skip.type = "button";
    skip.addEventListener("click", () => {
      post("down");
      reasons.replaceChildren(el("span", "hint", arabic ? "شكراً على رأيك." : "Thanks for the feedback."));
    });
    reasons.append(skip);
    row.replaceWith(reasons);
  });
  row.append(up, down);
  return row;
}

function personButton(arabic) {
  const b = el("button", "secondary small", arabic ? "🙋 كلّم موظف دلوقتي" : "🙋 Talk to a person now");
  b.type = "button";
  b.addEventListener("click", talkToPerson);
  return b;
}

// Pillar 3: "Did you mean…" when the copilot isn't sure and the guesses are low-risk.
function didYouMean(data, original, arabic) {
  const box = el("div", "choices");
  box.append(el("p", "", arabic ? "مش متأكد قوي من قصدك. تقصد…" : "I'm not completely sure what you mean. Did you mean…"));
  for (const c of data.choices) {
    const b = el("button", "chip-btn", pick(c, arabic));
    b.type = "button";
    b.addEventListener("click", () => {
      box.querySelectorAll("button").forEach((x) => (x.disabled = true));
      send(original, { chosenIntent: c.intent, ticketId: data.ticket_id, label: pick(c, arabic) });
    });
    box.append(b);
  }
  box.append(personButton(arabic));
  box.append(el("p", "hint", arabic ? `زميل عنده طلبك برضه (${data.ticket_id}) لو حبيت تستنى.` : `A colleague also has your request (${data.ticket_id}) if you'd rather wait.`));
  return box;
}

// Pillar 3: undo and override. Blocking a card asks to confirm first.
function blockCard(arabic) {
  const box = el("div", "block-box");
  const button = el("button", "block-card", arabic ? "اوقف الكارت" : "Block card");
  button.type = "button";
  button.addEventListener("click", () => {
    const confirmRow = el("div", "confirm");
    confirmRow.append(el("span", "", arabic ? "توقف الكارت دلوقتي؟" : "Block your card now?"));
    const yes = el("button", "block-card small", arabic ? "أيوه، اوقفه" : "Yes, block it");
    yes.type = "button";
    const no = el("button", "secondary small", arabic ? "إلغاء" : "Cancel");
    no.type = "button";
    yes.addEventListener("click", () => {
      confirmRow.replaceWith(el("p", "msg bot fraud", arabic ? "ده عرض تجريبي: مفيش كارت حقيقي اتوقف. في التطبيق الحقيقي الكارت بيتوقف فوراً. وتقدر تكلم الخط الساخن 19999 (رقم وهمي)." : "Demo only: no real card is blocked here. In the real app this blocks your card at once. You can also call the 24/7 hotline on 19999 (fictional)."));
    });
    no.addEventListener("click", () => {
      confirmRow.remove();
      button.hidden = false;
    });
    confirmRow.append(yes, no);
    button.hidden = true;
    box.append(confirmRow);
  });
  box.append(button);
  return box;
}

// Pillar 2, user-centric language: rule and record codes move out of the answer into "Why this answer?".
// Display only: the server's answer and its checks are unchanged.
const CODE = "(?:TXN-\\d{4}-\\d{2}-\\d{2}-\\d{4}|D-\\d{4}-\\d{4}|CARD-\\d{4}-\\d+|ANN-\\d{4}-\\d{2}-\\d{2}-\\d{2}|[A-Z]{2,4}-\\d+(?:\\.\\d+)?)";
function withoutCodes(text) {
  return text
    .replace(new RegExp(`\\s*\\((?:(?:record|rule|linked to)\\s*)?${CODE}(?:\\s*[,،]\\s*(?:linked to\\s*)?${CODE})*\\)`, "g"), "")
    .replace(new RegExp(`\\s*\\(\\s*\\)`, "g"), "")
    .replace(/\s+([.,،])/g, "$1");
}

function addBot(data, original) {
  const arabic = data.reply_language === "arabic";
  const wrap = el("div", "bot-turn");
  const shown = data.action === "answer" && data.explain ? withoutCodes(data.answer_text) : data.answer_text;
  const bubble = el("div", "msg bot" + (data.priority === "P0" ? " fraud" : ""), shown);
  bubble.setAttribute("dir", "auto");
  wrap.append(bubble, statusBadge(data, arabic));
  // Pillar 1: error transparency. Every handoff says why, honestly, in one line.
  if (data.why && data.why.en && data.reply_id !== "R-DRAFT") {
    const why = el("p", "why-line", pick(data.why, arabic));
    why.setAttribute("dir", "auto");
    wrap.append(why);
  }
  if (data.action === "answer" && data.explain) {
    if (data.customer_choice) wrap.append(el("p", "hint", arabic ? "جاوبت على حسب اختيارك." : "Answered using the option you picked."));
    wrap.append(whyThisAnswer(data.explain, arabic), feedback(data, arabic));
  }
  if (data.action === "pick" && data.picker) wrap.append(whichOne(data, original, arabic));
  else if (data.choices && data.choices.length) wrap.append(didYouMean(data, original, arabic));
  else if (data.action === "handoff" && data.priority !== "P0" && data.reply_id !== "R-PERSON") wrap.append(personButton(arabic));
  if (data.block_card) wrap.append(blockCard(arabic));
  $("messages").append(wrap);
  scrollDown();
}

// ---------- Talking to the server ----------

async function send(text, extra = {}) {
  lastMessage = text;
  addUser(extra.label ? `${text}  →  ${extra.label}` : text);
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId: $("customer").value, message: text, chosenIntent: extra.chosenIntent, ticketId: extra.ticketId, recordId: extra.recordId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");
    addBot(data, text);
    if (data.mode) showMode(data.mode);
  } catch (err) {
    // Pillar 1: honest error with a way forward, never a broken screen.
    const wrap = el("div", "bot-turn");
    wrap.append(el("div", "msg bot", "I couldn't reach the assistant just now. Nothing was lost."));
    const retry = el("button", "secondary small", "Try again");
    retry.type = "button";
    retry.addEventListener("click", () => {
      wrap.remove();
      send(text, extra);
    });
    wrap.append(retry, personButton(false));
    $("messages").append(wrap);
    scrollDown();
  }
}

$("composer").addEventListener("submit", (e) => {
  e.preventDefault();
  const text = $("text").value.trim();
  if (!text) return;
  $("text").value = "";
  send(text);
});

async function talkToPerson() {
  const res = await fetch("/api/handoff", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ customerId: $("customer").value, message: lastMessage || "Customer asked for a person" }),
  });
  const data = await res.json();
  const wrap = el("div", "bot-turn");
  wrap.append(el("div", "msg bot", `Connecting you to a colleague now. Your reference is ${data.ticket.ticket_id}.`), el("div", "badge badge-wait", "↪ Passed to a colleague · no AI used"));
  $("messages").append(wrap);
  scrollDown();
}
$("person").addEventListener("click", talkToPerson);

// Replies an agent approved in "Suggest only" mode reach the customer here.
async function pollApprovedReplies() {
  try {
    const res = await fetch(`/api/replies?customerId=${encodeURIComponent($("customer").value)}`);
    for (const r of await res.json()) {
      const wrap = el("div", "bot-turn");
      const bubble = el("div", "msg bot", r.text);
      bubble.setAttribute("dir", "auto");
      wrap.append(bubble, el("div", "badge badge-ok", `✓ Reviewed and sent by a colleague · ${r.ticket_id}`));
      $("messages").append(wrap);
      scrollDown();
    }
  } catch {
    // Try again on the next tick.
  }
}
setInterval(pollApprovedReplies, 5000);

async function loadCustomers() {
  await loadFeatures();
  customers = await (await fetch("/api/customers")).json();
  $("customer").replaceChildren(
    ...customers.map((c) => {
      const opt = el("option", "", `${c.customer_id} · ${c.name} (${c.plan})`);
      opt.value = c.customer_id;
      return opt;
    })
  );
  // ?customer=C-0004 logs in as that synthetic customer; &open=transactions|cards|disputes opens that picker
  // (for demos and screenshots; opening a picker calls no AI).
  const params = new URLSearchParams(location.search);
  const wanted = params.get("customer");
  $("customer").value = customers.some((c) => c.customer_id === wanted) ? wanted : customers.some((c) => c.customer_id === "C-0012") ? "C-0012" : $("customer").value;
  showWelcome();
  const open = params.get("open");
  const who = customers.find((c) => c.customer_id === $("customer").value) || {};
  const inArabic = isArabic(who.preferred_language);
  if (features.investigate && open === "find") openFinder(inArabic, params.get("q") || "", inArabic ? "🔎 دوّر على عملية" : "🔎 Find a transaction");
  if (features.investigate && open === "txn") openDetail(params.get("id"), inArabic, { flow: "find", steps: 0 });
  if (features.investigate && open === "waiting") openWaiting(inArabic, inArabic ? "💸 مستني فلوس" : "💸 I'm waiting for money", { source: params.get("source") || "", sent: params.has("sent") ? params.get("sent") : undefined });
  if (params.get("view") === "inbox") $("tab-inbox").click();
  if (["transactions", "cards", "disputes"].includes(open)) {
    const customer = customers.find((c) => c.customer_id === $("customer").value) || {};
    const arabic = isArabic(customer.preferred_language);
    const chip = QUICK.find((q) => q.kind === open);
    openPicker(open, arabic, arabic ? chip.ar : chip.en);
  }
}
$("customer").addEventListener("change", showWelcome);

// ---------- Pillar 3: progressive automation mode ----------

const MODE_NAMES = { off: "Off (people only)", suggest: "Suggest only", auto: "Auto-answer low-risk" };
function showMode(mode) {
  $("mode-pill").textContent = `Mode: ${MODE_NAMES[mode] || mode}`;
  $("mode-pill").className = `mode-pill mode-${mode}`;
  document.querySelectorAll('input[name="mode"]').forEach((r) => (r.checked = r.value === mode));
}
async function loadMode() {
  showMode((await (await fetch("/api/mode")).json()).mode);
}
document.querySelectorAll('input[name="mode"]').forEach((radio) =>
  radio.addEventListener("change", async () => {
    const res = await fetch("/api/mode", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: radio.value }) });
    showMode((await res.json()).mode);
  })
);

// ---------- Agent inbox ----------

const INTENT_NAMES = {
  "fee.explain": "Fee question", "fee.overdraft": "Overdraft fee", "fee.waiver_request": "Fee waiver request",
  "dispute.status": "Dispute status", "dispute.documents": "Dispute papers", "dispute.open_request": "New dispute",
  "card.replace_damaged": "Damaged card", "card.replace_expired": "Expiring card", "service.status": "Service status",
  "fraud.unknown_txn": "Unknown payment", "fraud.card_lost_stolen": "Lost or stolen card", "fraud.otp_phishing": "Code or phishing", "fraud.account_takeover": "Account takeover",
  "complaint.formal": "Complaint", "sensitive.legal_press": "Legal or press threat", "sensitive.vulnerable": "Vulnerable customer",
  "loan.any": "Loan", "transfer.any": "Transfer or other account", "advice.any": "Advice",
  "general.info": "General question", "general.chitchat": "Chat or wants a person", "general.unknown": "Unclear",
};
const STATUS_NAMES = {
  moved_to_agent: "Waiting for an agent", moved_to_fraud: "With Fraud team", draft_pending_approval: "AI draft: review and approve",
  approved: "Approved, sent to customer", closed: "Closed", resolved_by_customer_choice: "Resolved: customer picked an option",
};

// Pillar 1 and 2: confidence as text plus colour, never colour alone.
function confidenceChip(c) {
  if (typeof c !== "number") return el("span", "conf conf-none", "—");
  const [name, cls] = c >= 0.85 ? ["High", "conf-high"] : c >= 0.7 ? ["Medium", "conf-medium"] : ["Low", "conf-low"];
  return el("span", `conf ${cls}`, `${name} ${c.toFixed(2)}`);
}

function whyRouted(t) {
  const box = el("div", "routed");
  const rows = [
    ["Summary", t.summary || "—"],
    ["Understood as", `${INTENT_NAMES[t.intent] || t.intent} (${t.intent}), priority ${t.priority}`],
    ["Confidence", typeof t.confidence === "number" ? t.confidence.toFixed(2) : "not measured (no AI call)"],
    ["Routed by", t.routing_rule || "Customer pressed 'Talk to a person'"],
    ["Records looked up", t.retrieved_ids && t.retrieved_ids.length ? t.retrieved_ids.join(", ") : "none"],
    ["Sources cited", (t.draft_sources || t.cited || []).join(", ") || "none"],
  ];
  if (t.injection_flagged) rows.push(["Warning", "The message looked like an attempt to change the assistant's rules"]);
  if (t.note && !t.investigation) rows.push(["Note", t.note]);
  const dl = el("dl");
  for (const [k, v] of rows) dl.append(el("dt", "", k), el("dd", "", v));
  box.append(dl);
  if (t.investigation) {
    const inv = t.investigation;
    const card = el("div", "inv-summary");
    card.append(el("strong", "", "🔎 Investigation summary: what the copilot already checked"));
    const idl = el("dl");
    const filters = Object.entries(inv.filters || {}).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(" · ") || "none";
    [
      ["Flow", inv.flow === "waiting" ? "Waiting for money" : "Find a transaction"],
      ["Looking for", inv.looking_for || "not stated"],
      ["Filters used", filters],
      ["Candidates checked", inv.candidates.length ? inv.candidates.join(", ") : "none"],
      ["Pending or incoming found", inv.found.length ? inv.found.join(", ") : "none"],
      ["Why a person", inv.reason],
    ].forEach(([k, v]) => idl.append(el("dt", "", k), el("dd", "", v)));
    card.append(idl, el("p", "hint", "The customer won't have to repeat any of this."));
    box.append(card);
  }
  return box;
}

function showUndo(text, ticketId) {
  const bar = $("undo-bar");
  let left = 10;
  bar.hidden = false;
  const label = el("span", "", `${text} `);
  const button = el("button", "secondary small", `Undo (${left})`);
  button.type = "button";
  bar.replaceChildren(label, button);
  const timer = setInterval(() => {
    left -= 1;
    button.textContent = `Undo (${left})`;
    if (left <= 0) {
      clearInterval(timer);
      bar.hidden = true;
    }
  }, 1000);
  button.addEventListener("click", async () => {
    clearInterval(timer);
    const res = await fetch("/api/tickets/undo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticket_id: ticketId }) });
    bar.replaceChildren(el("span", "", res.ok ? "Undone." : "Too late to undo."));
    setTimeout(() => (bar.hidden = true), 2500);
    loadTickets();
  });
}

let intents = null;
async function showCorrectionForm(afterRow, ticket) {
  if (!intents) intents = await (await fetch("/api/intents")).json();
  const formRow = el("tr", "detail-row");
  const cell = el("td");
  cell.colSpan = 9;
  const form = el("form", "correction");
  const select = el("select");
  select.setAttribute("aria-label", "Right intent");
  select.replaceChildren(...intents.map((id) => {
    const opt = el("option", "", `${INTENT_NAMES[id] || id} (${id})`);
    opt.value = id;
    return opt;
  }));
  select.value = ticket.intent;
  const reason = el("input");
  reason.placeholder = "Short reason, e.g. 'da3' means lost";
  reason.setAttribute("aria-label", "Reason");
  reason.maxLength = 300;
  reason.required = true;
  const save = el("button", "", "Save correction");
  save.type = "submit";
  form.append("Right intent: ", select, reason, save);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const res = await fetch("/api/corrections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticket_id: ticket.ticket_id, agent_label: select.value, reason: reason.value }) });
    const data = await res.json();
    if (!res.ok) return form.append(el("span", "hint", data.error));
    await loadTickets();
    showUndo(`Label changed to ${INTENT_NAMES[select.value] || select.value}. Saved for review; a person approves it before the copilot learns from it.`, ticket.ticket_id);
  });
  cell.append(form);
  formRow.append(cell);
  afterRow.after(formRow);
}

function showDraftEditor(afterRow, ticket) {
  const formRow = el("tr", "detail-row");
  const cell = el("td");
  cell.colSpan = 9;
  const form = el("form", "draft-editor");
  form.append(el("label", "", "AI draft. Edit it, then approve to send it to the customer:"));
  const text = el("textarea");
  text.value = ticket.draft || "";
  text.rows = 4;
  text.setAttribute("dir", "auto");
  text.setAttribute("aria-label", "Reply to send");
  const approve = el("button", "", "Approve and send");
  approve.type = "submit";
  form.append(text, approve);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const res = await fetch("/api/tickets/approve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticket_id: ticket.ticket_id, text: text.value }) });
    if (!res.ok) return form.append(el("span", "hint", (await res.json()).error));
    loadTickets();
  });
  cell.append(form);
  formRow.append(cell);
  afterRow.after(formRow);
}

async function loadFeedback() {
  const f = await (await fetch("/api/feedback")).json();
  $("feedback-counts").textContent = f.up + f.down
    ? `Customer feedback: 👍 ${f.up} · 👎 ${f.down} (wrong ${f.reasons.wrong}, unclear ${f.reasons.unclear}, not what they asked ${f.reasons.not_what_i_asked})`
    : "Customer feedback: none yet";
}

async function loadTickets() {
  loadFeedback();
  const all = await (await fetch("/api/tickets")).json();
  const queue = $("queue-filter").value;
  const tickets = all.filter((t) => !queue || t.queue === queue);
  if (!tickets.length) {
    $("tickets").replaceChildren(Object.assign(el("tr"), { innerHTML: '<td colspan="9" class="empty">No tickets here yet. Handoffs from the chat appear here.</td>' }));
    return;
  }
  $("tickets").replaceChildren();
  for (const t of tickets.slice().reverse()) {
    const tr = el("tr");
    const cells = [
      el("td", "", t.ticket_id),
      el("td", "q-" + t.queue, t.queue),
      el("td", "", t.priority),
      (() => { const td = el("td"); td.append(el("span", "", INTENT_NAMES[t.intent] || t.intent), el("br"), el("code", "src-id", t.intent)); return td; })(),
      (() => { const td = el("td"); td.append(confidenceChip(t.confidence)); return td; })(),
      el("td", "", t.customer_id),
      (() => { const td = el("td", "", t.message); td.setAttribute("dir", "auto"); return td; })(),
      el("td", "", STATUS_NAMES[t.status] || t.status),
    ];
    const actions = el("td", "row-actions");
    const why = el("button", "secondary small", "Why routed here?");
    why.type = "button";
    why.setAttribute("aria-expanded", "false");
    let open = null;
    why.addEventListener("click", () => {
      if (open) {
        open.remove();
        open = null;
        why.setAttribute("aria-expanded", "false");
        return;
      }
      open = el("tr", "detail-row");
      const cell = el("td");
      cell.colSpan = 9;
      cell.append(whyRouted(t));
      open.append(cell);
      tr.after(open);
      why.setAttribute("aria-expanded", "true");
    });
    actions.append(why);
    if (new URLSearchParams(location.search).get("ticket") === t.ticket_id) setTimeout(() => why.click(), 0);
    if (t.investigation) cells[6].prepend(el("span", "st-pill st-info", "🔎 Investigation"), el("br"));
    if (t.status === "draft_pending_approval") {
      const edit = el("button", "small", "Edit reply");
      edit.type = "button";
      edit.addEventListener("click", () => showDraftEditor(tr, t));
      actions.append(edit);
    }
    const relabel = el("button", "secondary small", "Wrong label?");
    relabel.type = "button";
    relabel.addEventListener("click", () => showCorrectionForm(tr, t));
    actions.append(relabel);
    if (t.status !== "closed") {
      const close = el("button", "secondary small", "Close");
      close.type = "button";
      close.addEventListener("click", async () => {
        await fetch("/api/tickets/close", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticket_id: t.ticket_id }) });
        await loadTickets();
        showUndo(`${t.ticket_id} closed.`, t.ticket_id);
      });
      actions.append(close);
    }
    tr.append(...cells, actions);
    $("tickets").append(tr);
  }
}
$("queue-filter").addEventListener("change", loadTickets);

function show(view) {
  for (const v of ["chat", "inbox", "pm"]) {
    $(`view-${v}`).hidden = view !== v;
    $(`tab-${v}`).classList.toggle("active", view === v);
  }
  if (view === "inbox") loadTickets();
  if (view === "chat") scrollDown();
  if (view === "pm" && window.loadPm) window.loadPm();
}

$("tab-chat").addEventListener("click", () => show("chat"));
$("tab-inbox").addEventListener("click", () => show("inbox"));
$("tab-pm").addEventListener("click", () => show("pm"));
$("refresh").addEventListener("click", loadTickets);

loadCustomers();
loadMode();
