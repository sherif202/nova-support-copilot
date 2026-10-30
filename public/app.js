// Nova Bank help chat, front end. Talks to server.js through /api/*.

const $ = (id) => document.getElementById(id);
let lastMessage = "";

function addMessage(text, who, extra) {
  const div = document.createElement("div");
  div.className = "msg " + who + (extra && extra.fraud ? " fraud" : "");
  div.setAttribute("dir", "auto");
  div.textContent = text;
  if (extra && extra.chips && extra.chips.length) {
    const meta = document.createElement("div");
    meta.className = "meta";
    extra.chips.forEach((c) => {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = c;
      meta.appendChild(chip);
    });
    div.appendChild(meta);
  }
  $("messages").appendChild(div);
  $("messages").scrollTop = $("messages").scrollHeight;
}

// Shown under every fraud reply. In this demo no real card can be blocked, so it says so.
function addBlockCardButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "block-card";
  button.textContent = "Block card";
  button.addEventListener("click", () => {
    button.disabled = true;
    addMessage("Demo only: no real card is blocked here. In the real app this blocks your card at once. You can also call the 24/7 hotline on 19999 (fictional).", "bot", { fraud: true });
  });
  $("messages").appendChild(button);
  $("messages").scrollTop = $("messages").scrollHeight;
}

async function loadCustomers() {
  const res = await fetch("/api/customers");
  const customers = await res.json();
  // Build options with textContent, never innerHTML, so a name can't inject HTML
  $("customer").replaceChildren(
    ...customers.map((c) => {
      const opt = document.createElement("option");
      opt.value = c.customer_id;
      opt.textContent = `${c.customer_id} · ${c.name} (${c.plan})`;
      return opt;
    })
  );
  const preferred = customers.find((c) => c.customer_id === "C-0012");
  if (preferred) $("customer").value = preferred.customer_id;
}

$("composer").addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = $("text").value.trim();
  if (!text) return;
  lastMessage = text;
  addMessage(text, "user");
  $("text").value = "";
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId: $("customer").value, message: text }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");
    const chips = [data.intent, data.priority].concat(data.sources || []).filter(Boolean);
    addMessage(data.answer_text, "bot", { chips, fraud: data.priority === "P0" });
    if (data.block_card) addBlockCardButton();
  } catch (err) {
    addMessage("Sorry, I couldn't answer that. Please try again or talk to a person.", "bot");
  }
});

$("person").addEventListener("click", async () => {
  const res = await fetch("/api/handoff", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ customerId: $("customer").value, message: lastMessage || "Customer asked for a person" }),
  });
  const data = await res.json();
  addMessage(`Connecting you to a colleague now. Your reference is ${data.ticket.ticket_id}.`, "bot");
});

async function loadTickets() {
  const res = await fetch("/api/tickets");
  const tickets = await res.json();
  if (!tickets.length) {
    $("tickets").innerHTML = '<tr><td colspan="8" class="empty">No tickets yet. Handoffs from the chat appear here.</td></tr>';
    return;
  }
  $("tickets").innerHTML = "";
  tickets.slice().reverse().forEach((t) => {
    const tr = document.createElement("tr");
    [t.ticket_id, t.queue, t.priority, t.intent, t.customer_id, t.message, t.status].forEach((v, i) => {
      const td = document.createElement("td");
      td.textContent = v;
      if (i === 1) td.className = "q-" + v;
      if (i === 5) td.setAttribute("dir", "auto");
      tr.appendChild(td);
    });
    const action = document.createElement("td");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary";
    button.textContent = "Wrong label?";
    button.addEventListener("click", () => showCorrectionForm(tr, t, button));
    action.appendChild(button);
    tr.appendChild(action);
    $("tickets").appendChild(tr);
  });
}

// "Wrong label?": the agent picks the right intent and a reason. Saved to logs/corrections.jsonl only;
// a person decides later whether it becomes an approved example (docs/06-LEARNING-LOOP.md).
let intents = null;
async function showCorrectionForm(row, ticket, button) {
  if (!intents) intents = await (await fetch("/api/intents")).json();
  button.disabled = true;
  const formRow = document.createElement("tr");
  const cell = document.createElement("td");
  cell.colSpan = 8;
  const form = document.createElement("form");
  form.className = "correction";
  const select = document.createElement("select");
  select.replaceChildren(
    ...intents.map((id) => {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = id;
      return opt;
    })
  );
  select.value = ticket.intent;
  const reason = document.createElement("input");
  reason.placeholder = "Short reason, e.g. 'da3' means lost";
  reason.maxLength = 300;
  reason.required = true;
  const save = document.createElement("button");
  save.type = "submit";
  save.textContent = "Save correction";
  const note = document.createElement("span");
  note.className = "hint";
  form.append("Right intent: ", select, reason, save, note);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const res = await fetch("/api/corrections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket_id: ticket.ticket_id, agent_label: select.value, reason: reason.value }),
    });
    const data = await res.json();
    note.textContent = res.ok ? "Saved for review. Nothing changes until a person approves it." : data.error;
    if (res.ok) save.disabled = true;
  });
  cell.appendChild(form);
  formRow.appendChild(cell);
  row.after(formRow);
}

function show(view) {
  $("view-chat").hidden = view !== "chat";
  $("view-inbox").hidden = view !== "inbox";
  $("tab-chat").classList.toggle("active", view === "chat");
  $("tab-inbox").classList.toggle("active", view === "inbox");
  if (view === "inbox") loadTickets();
}

$("tab-chat").addEventListener("click", () => show("chat"));
$("tab-inbox").addEventListener("click", () => show("inbox"));
$("refresh").addEventListener("click", loadTickets);

loadCustomers();
