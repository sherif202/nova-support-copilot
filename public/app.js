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

const isArabic = (lang) => lang === "arabic" || lang === "franco";
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
  if (data.choices && data.choices.length) wrap.append(didYouMean(data, original, arabic));
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
      body: JSON.stringify({ customerId: $("customer").value, message: text, chosenIntent: extra.chosenIntent, ticketId: extra.ticketId }),
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
  customers = await (await fetch("/api/customers")).json();
  $("customer").replaceChildren(
    ...customers.map((c) => {
      const opt = el("option", "", `${c.customer_id} · ${c.name} (${c.plan})`);
      opt.value = c.customer_id;
      return opt;
    })
  );
  if (customers.some((c) => c.customer_id === "C-0012")) $("customer").value = "C-0012";
  showWelcome();
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
  if (t.note) rows.push(["Note", t.note]);
  const dl = el("dl");
  for (const [k, v] of rows) dl.append(el("dt", "", k), el("dd", "", v));
  box.append(dl);
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
