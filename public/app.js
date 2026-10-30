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
    $("tickets").innerHTML = '<tr><td colspan="6" class="empty">No tickets yet. Handoffs from the chat appear here.</td></tr>';
    return;
  }
  $("tickets").innerHTML = "";
  tickets.slice().reverse().forEach((t) => {
    const tr = document.createElement("tr");
    [t.ticket_id, t.queue, t.priority, t.customer_id, t.message, t.status].forEach((v, i) => {
      const td = document.createElement("td");
      td.textContent = v;
      if (i === 1) td.className = "q-" + v;
      if (i === 4) td.setAttribute("dir", "auto");
      tr.appendChild(td);
    });
    $("tickets").appendChild(tr);
  });
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
