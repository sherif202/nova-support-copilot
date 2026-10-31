// PM control panel (GET /api/pm). Quality, cost per model ID, volume bottlenecks, iterations to close a problem,
// and recommendations that recompute on every refresh (the Telos pattern: tied to a Key Result, ranked by
// impact, tagged with the sub-metric they move). All text from the server is set with textContent.

(function () {
  const $ = (id) => document.getElementById(id);
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  };
  const pct = (x) => (x === null || x === undefined ? "—" : `${(x * 100).toFixed(1)}%`);
  const usd = (x, d = 4) => (x === null || x === undefined ? "—" : `US$${Number(x).toFixed(d)}`);
  const num = (x) => (x === null || x === undefined ? "—" : Number(x).toLocaleString("en-US"));
  const secs = (x) => (x === null || x === undefined ? "—" : `${Number(x).toFixed(1)} s`);
  const egp = (x, d = 2) => (x === null || x === undefined ? "—" : `EGP ${Number(x).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`);
  const params = new URLSearchParams(location.search);

  function section(title, hint) {
    const s = el("section", "pm-section");
    s.append(el("h3", "", title));
    if (hint) s.append(el("p", "hint", hint));
    return s;
  }

  function table(headers, rows) {
    const wrap = el("div", "table-wrap");
    const t = el("table");
    const tr = el("tr");
    headers.forEach((h) => tr.append(el("th", "", h)));
    const thead = el("thead");
    thead.append(tr);
    const tbody = el("tbody");
    if (!rows.length) {
      const r = el("tr");
      const td = el("td", "empty", "Nothing yet.");
      td.colSpan = headers.length;
      r.append(td);
      tbody.append(r);
    }
    rows.forEach((cells) => {
      const r = el("tr");
      cells.forEach((c) => {
        const td = el("td");
        if (c instanceof Node) td.append(c);
        else td.textContent = c === null || c === undefined ? "—" : String(c);
        r.append(td);
      });
      tbody.append(r);
    });
    t.append(thead, tbody);
    wrap.append(t);
    return wrap;
  }

  function tile(label, value, note, state) {
    const t = el("div", `tile ${state || ""}`);
    t.append(el("div", "tile-label", label), el("div", "tile-value", value));
    if (note) t.append(el("div", "tile-note", note));
    return t;
  }

  function verdictChip(v) {
    const ok = v === "SHIP";
    return el("span", `conf ${ok ? "conf-high" : v ? "conf-low" : "conf-none"}`, v || "—");
  }

  function chip(text, kind) {
    return el("span", `conf ${kind}`, text);
  }

  // The ROI model (lib/roi.js): value of resolved conversations against AI and fixed cost, size tiers, the three
  // things to track, and credits. All assumptions are synthetic and listed in lib/roi-config.js.
  function roiSection(r) {
    const R = r.roi;
    const a = r.assumptions;
    const source = r.source === "sample"
      ? "Sample data: the 1.0.11 shadow run on 200 synthetic tickets (\"would have resolved\" stands in for the customer's answer)."
      : "Live data from the turn log; resolved = the customer said \"solved\".";
    const s = section("ROI model", `${source} Synthetic assumptions (lib/roi-config.js): agent time EGP ${a.agent_egp_per_minute.toFixed(2)} a minute, fixed cost EGP ${a.fixed_monthly_egp.toLocaleString("en-US")} a month, ${a.monthly_contacts.toLocaleString("en-US")} contacts a month, EGP ${a.egp_per_usd} per US$.`);
    s.id = "roi";
    if (!R.conversations) {
      s.append(el("p", "hint", "No conversations yet. Tick \"Load sample\" to see the model on the 1.0.11 shadow run."));
      return s;
    }
    const roiPct = (x) => (x === null ? "—" : `${Math.round(x * 100).toLocaleString("en-US")}%`);
    const tiles = el("div", "tiles");
    tiles.append(
      tile("ROI per month (projected)", roiPct(R.monthly.roi), `(value − AI − fixed) ÷ (AI + fixed) at ${R.monthly.contacts.toLocaleString("en-US")} contacts`, R.monthly.roi === null ? "" : R.monthly.roi > 0 ? "ok" : "bad"),
      tile("Value per month", egp(R.monthly.value_egp, 0), `agent time freed: ${pct(R.resolution_rate)} resolved × minutes × EGP a minute`),
      tile("AI cost per month", egp(R.monthly.ai_cost_egp, 0), `plus EGP ${R.monthly.fixed_egp.toLocaleString("en-US")} fixed`),
      tile("Payback volume", R.payback_conversations === null ? "—" : `${R.payback_conversations.toLocaleString("en-US")} a month`, "conversations needed to cover the fixed cost"),
      tile("Within S to L", pct(r.within_s_to_l), "of conversations · target 80% or more", r.within_s_to_l >= 0.8 ? "ok" : "bad"),
      tile("Cost per successful answer", egp(R.cost_per_successful_answer_egp, 4), "AI cost ÷ resolved conversations"),
      tile("This data set", `${egp(R.value_egp, 0)} value`, `${egp(R.ai_cost_egp, 2)} AI cost · ${R.conversations} conversations, ${R.resolved} resolved`),
      tile("This data set, with a month's fixed cost", roiPct(R.data_set_roi), "why the payback volume matters", R.data_set_roi > 0 ? "ok" : "warn")
    );
    s.append(tiles);

    s.append(el("h4", "", "Request-level cost attribution"));
    s.append(el("p", "hint", "Every request is logged once with the same fields: request, conversation, customer, segment, business line, workflow, prompt version, model IDs, mode, tokens, retries, latency, cost in US$ and EGP, outcome, and whether the customer said it was solved. Every view below is a rollup of those records."));
    s.append(table(["Prompt version", "Requests", "AI cost", "Resolved", "Cost per successful answer"], r.prompt_versions.map((v) => [v.prompt_version, num(v.requests), egp(v.cost_egp, 2), num(v.resolved), egp(v.cost_per_successful_answer_egp, 4)])));
    s.append(el("h4", "", "Most expensive conversations (agent runs)"));
    s.append(table(["Conversation", "Customer", "Workflow", "Requests", "Retries", "AI cost", "Size", "Outcome"], r.runs.map((x) => [x.id, x.customer_id, x.workflow, x.requests, x.retries, egp(x.cost_egp, 4), chip(x.tier, ["XL", "XXL"].includes(x.tier) ? "conf-low" : "conf-high"), x.long_loop ? `${x.outcome} · long loop` : x.outcome])));

    s.append(el("h4", "", "Size tiers: S, M and L cover the work; XL and XXL are reviewed and charged back"));
    const grid = el("div", "pm-grid");
    const t1 = el("div");
    t1.append(table(["Size", "Up to (AI cost)", "Conversations", "Share", "AI cost"], r.tiers.map((t) => [chip(t.tier, ["XL", "XXL"].includes(t.tier) ? "conf-low" : "conf-high"), t.limit_egp === null ? "above XL" : egp(t.limit_egp, 4), num(t.conversations), pct(t.share), egp(t.cost_egp, 2)])));
    const t2 = el("div");
    t2.append(el("p", "hint", "Chargeback: XL and XXL conversations are billed to the business line that owns the customer, the internal version of \"charge for XL and XXL\"."), table(["Business line", "XL + XXL", "AI cost", "Above the L limit"], r.chargeback.map((c) => [c.business_line, num(c.conversations), egp(c.cost_egp, 4), egp(c.above_l_egp, 4)])));
    grid.append(t1, t2);
    s.append(grid);

    s.append(el("h4", "", "What to track"));
    const track = el("div", "pm-grid track");
    const cust = el("div", "track-card");
    const neg = r.customers.filter((c) => c.negative && c.cost_egp > 0);
    cust.append(el("strong", "", "Customers"), el("p", "hint", `AI cost against value saved per customer. ${neg.length} cost more than they save (no resolved conversation).`),
      table(["Customer", "Line", "Chats", "Cost", "Value", "Margin"], r.customers.slice(0, 6).map((c) => [c.customer_id, c.business_line.replace(" banking", ""), c.conversations, egp(c.cost_egp, 3), egp(c.value_egp, 0), c.negative ? chip(egp(c.margin_egp, 3), "conf-low") : egp(c.margin_egp, 0)])));
    const work = el("div", "track-card");
    const advice = { Optimise: "conf-medium", Keep: "conf-high", "Route only": "conf-none", Sunset: "conf-low", "Re-price / review": "conf-low" };
    work.append(el("strong", "", "Workloads"), el("p", "hint", "Cost per workflow, and what to do with each: optimise, re-price or review, or sunset. Hover the advice for the reason."),
      table(["Workflow", "Chats", "Resolved", "Cost / chat", "Advice"], r.workloads.slice(0, 10).map((w) => { const c = chip(w.action, advice[w.action] || "conf-none"); c.title = w.why; return [w.workflow, w.conversations, pct(w.resolution_rate), egp(w.cost_per_conversation, 4), c]; })));
    const dem = el("div", "track-card");
    const D = r.demands;
    const maxWeek = Math.max(...D.weeks.map((w) => w.conversations), 1);
    const bars = el("div", "weekbars");
    D.weeks.forEach((w) => {
      const row = el("div", "weekbar");
      const fill = el("span", "weekfill");
      fill.style.width = `${(w.conversations / maxWeek) * 100}%`;
      const lane = el("span", "weektrack");
      lane.append(fill);
      row.append(el("span", "", w.week.slice(5)), lane, el("span", "", String(w.conversations)));
      bars.append(row);
    });
    const status = D.alert === "over" ? "over budget, growth is eating the margin." : D.alert === "growth" ? "growing fast, watch the margin." : `${egp(D.headroom_egp, 0)} headroom.`;
    dem.append(el("strong", "", "Demands"), el("p", "hint", `Weekly volume against the committed budget. Growth, last 4 full weeks against the 4 before: ${D.growth === null ? "—" : pct(D.growth)}.`), bars,
      el("p", D.alert ? "rec-action" : "hint", `Projected AI spend ${egp(D.projected_monthly_ai_egp, 0)} a month against a flat budget of ${egp(D.monthly_budget_egp, 0)}: ${status}`));
    track.append(cust, work, dem);
    s.append(track);

    s.append(el("h4", "", "Credits (internal unit)"));
    s.append(el("p", "hint", `1 credit = the AI cost of a median S conversation = ${egp(r.credits.credit_egp, 4)}. Budgets are set in credits, so when model prices change only the value of a credit changes, not the budgets.`));
    s.append(table(["Business line", "Share of chats", "Credits in this data", "Credits a month (projected)", "Monthly budget", "Use"], r.credits.lines.map((l) => [l.business_line, pct(l.share), num(Math.round(l.data_set_credits)), num(Math.round(l.monthly_credits)), num(l.monthly_budget), l.use === null ? "—" : chip(pct(l.use), l.use > 1 ? "conf-low" : l.use > 0.8 ? "conf-medium" : "conf-high")])));
    return s;
  }

  function render(d) {
    const root = $("pm");
    root.replaceChildren();
    const L = d.live;
    if (params.get("focus") === "roi") {
      root.append(roiSection(d.roi));
      return;
    }

    // 1. Key Results at a glance
    const krs = section("Key Results", `Mode: ${d.mode}. Live numbers since the last demo reset. EGP at ${d.egp_per_usd} per US$.`);
    const tiles = el("div", "tiles");
    const fraudOk = !L.fraud_total || L.fraud_routed === L.fraud_total;
    tiles.append(
      tile("KR1 · Verified resolution", pct(L.verified_resolution_rate), `${L.solved_yes} said solved, ${L.solved_no} not solved · target 40%`, L.verified_resolution_rate === null ? "" : L.verified_resolution_rate >= 0.4 ? "ok" : "warn"),
      tile("KR2 · Fraud recall (live)", L.fraud_total ? `${L.fraud_routed}/${L.fraud_total}` : "—", "must be 100%", fraudOk ? "ok" : "bad"),
      tile("KR3 · Cost per answered message", L.egp_per_answered === null ? "—" : `EGP ${L.egp_per_answered.toFixed(3)}`, `${usd(L.usd_per_answered, 5)} · target under EGP 0.035`, L.egp_per_answered === null ? "" : L.egp_per_answered < 0.035 ? "ok" : "bad"),
      tile("KR4 · Speed p95", secs(L.p95_seconds), `p50 ${secs(L.p50_seconds)} · gate 6 s`, L.p95_seconds === null ? "" : L.p95_seconds <= 6 ? "ok" : "bad"),
      tile("Messages", num(L.messages), `${num(L.with_ai)} used AI · ${num(L.answered_by_ai)} answered by AI`),
      tile("Automation rate", pct(L.automation_rate), `handoff rate ${pct(L.handoff_rate)}`),
      tile("Answer retries", pct(L.retry_rate), "answers that needed a second try"),
      tile("Total spend (live)", usd(L.total_usd), `EGP ${L.total_egp.toFixed(2)} · cache reads ${pct(L.cache_share)} of input`)
    );
    krs.append(tiles);
    root.append(krs);

    // 2. Recommendations, recomputed on every refresh
    const rec = section("Recommendations (auto-updated)", "Recomputed from the numbers on this page every time you refresh. Pattern from Telos (ProductVoyagers, Apache-2.0): each one is tied to a Key Result, ranked by impact, and tagged with the sub-metric it moves.");
    const list = el("ol", "recs");
    d.recommendations.forEach((r) => {
      const li = el("li", `rec rec-${r.impact.toLowerCase()}`);
      const head = el("div", "rec-head");
      head.append(el("span", `impact impact-${r.impact.toLowerCase()}`, r.impact), el("span", "rec-kr", `${r.kr} · ${r.tag}`), el("strong", "", r.title));
      li.append(head, el("p", "", r.why), el("p", "rec-action", `→ ${r.action}`));
      list.append(li);
    });
    rec.append(list);
    root.append(rec);

    // 2b. ROI model
    root.append(roiSection(d.roi));

    // 3. Cost and calls by model ID
    const mod = section("Cost and calls by model", "Which model ran each step, with its exact model ID. Prices from lib/prices.js.");
    mod.append(table(
      ["Model ID", "Provider", "Steps (understand / answer)", "API calls", "Input", "Cache read", "Output", "Avg time", "Cost"],
      d.models.map((m) => [el("code", "", m.model_id), m.provider, `${m.steps.understand || 0} / ${m.steps.answer || 0}`, num(m.calls), num(m.input_tokens), num(m.cache_read_tokens), num(m.output_tokens), m.avg_ms ? `${m.avg_ms} ms` : "—", m.priced ? usd(m.usd) : "not priced"])
    ));
    root.append(mod);

    // 4. Where the volume is a bottleneck
    const neck = section("Volume and bottlenecks", "Where messages pile up: open tickets per queue and how long the oldest has waited, why messages left the AI, and which intents drive the volume.");
    const grid = el("div", "pm-grid");
    const q = el("div");
    q.append(el("h4", "", "Queues"), table(["Queue", "Open", "Total", "Oldest open"], d.bottlenecks.queues.map((x) => [x.queue, x.open, x.total, x.open ? `${x.oldest_open_minutes} min` : "—"])));
    const r = el("div");
    r.append(el("h4", "", "Handoff and fixed-reply reasons"), table(["Reason", "Count"], d.bottlenecks.reasons.map((x) => [x.label, x.count])));
    grid.append(q, r);
    neck.append(grid);
    neck.append(el("h4", "", "Intents"), table(["Intent", "Messages", "Handed off", "Cost"], d.bottlenecks.intents.map((x) => [x.intent, x.messages, `${x.handed_off} (${pct(x.messages ? x.handed_off / x.messages : 0)})`, usd(x.usd)])));
    neck.append(el("p", "hint", `Languages: ${d.bottlenecks.languages.map((x) => `${x.key} ${x.count}`).join(" · ") || "—"}`));
    root.append(neck);

    // 5. Iterations to solve or close a problem
    const conv = section("Iterations to solve or close a problem (live)", "For each customer problem: how many messages and AI calls it took to reach an answer or a person, the retries, what it cost, and which model IDs it used.");
    conv.append(table(
      ["Time", "Customer", "Intent", "Messages", "AI calls", "Retries", "Outcome", "Cost", "Model IDs"],
      d.conversations.map((c) => [new Date(c.time).toLocaleTimeString(), c.customer, c.intent, c.messages, c.ai_calls, c.retries, c.outcome, usd(c.usd, 5), c.models])
    ));
    root.append(conv);

    const eng = section("Iterations to fix the copilot (engineering)", `Every prompt or knowledge version and every eval run, with its cost. Eval runs on disk cost ${usd(d.engineering.eval_usd, 3)}; bake-off runs ${usd(d.engineering.bakeoff_usd, 3)}.`);
    eng.append(el("h4", "", "Versions (prompts/CHANGELOG.md)"), table(
      ["Version", "What changed", "Model", "Intent", "Fraud", "Harmless", "Grounded", "Verdict"],
      d.engineering.changelog.map((v) => [v.version, v.change.length > 120 ? v.change.slice(0, 117) + "…" : v.change, v.model, v.intent_accuracy, v.fraud_recall, v.harmless, v.grounded, v.verdict.length > 60 ? v.verdict.slice(0, 57) + "…" : v.verdict])
    ));
    eng.append(el("h4", "", "Eval runs (tools/eval.mjs)"), table(
      ["Run", "Verdict", "Fraud", "Harmless", "Security", "Intent", "Grounded", "Cost"],
      d.engineering.runs.slice().reverse().map((x) => [new Date(x.time).toLocaleString(), verdictChip(x.verdict), pct(x.fraud_recall), x.harmless === undefined ? "—" : x.harmless.toFixed(2), pct(x.security), pct(x.intent_accuracy), pct(x.grounded_answers), usd(x.usd, 3)])
    ));
    eng.append(el("h4", "", "Bake-off runs (step 14b)"), table(
      ["Run", "Settings", "Verdict", "Grounded", "p95", "Cost", "Model IDs"],
      d.engineering.bakeoffs.map((b) => [b.run, b.config, b.verdict, b.grounded, secs(b.p95_seconds), usd(b.usd, 3), (b.models || []).join(", ")])
    ));
    root.append(eng);

    if (d.baseline) {
      const base = section("Locked baseline", `docs/baseline.json · commit ${d.baseline.commit} · release ${d.baseline.release}`);
      const e = d.baseline.eval;
      base.append(el("p", "", `${e.verdict}: fraud ${e.fraud_recall}, harmless ${e.harmless}, security ${e.security}, intent ${pct(e.intent_accuracy)}, grounded ${e.grounded_answers}. Settings: ${d.baseline.settings.UNDERSTAND_MODEL} / ${d.baseline.settings.ANSWER_MODEL}, effort ${d.baseline.settings.ANSWER_EFFORT}, threshold ${d.baseline.settings.HANDOFF_CONFIDENCE}.`));
      root.append(base);
    }

    const modes = section("Automation mode changes", "Every switch between Off, Suggest only and Auto-answer, from logs/mode.jsonl.");
    modes.append(table(["Time", "From", "To", "By"], d.mode_changes.map((m) => [new Date(m.time).toLocaleString(), m.from, m.to, m.by])));
    root.append(modes);

    root.append(el("p", "hint", `Generated ${new Date(d.generated_at).toLocaleString()}.`));
  }

  async function loadPm() {
    $("pm").replaceChildren(el("p", "hint", "Loading…"));
    try {
      render(await (await fetch($("pm-sample").checked ? "/api/pm?sample=1" : "/api/pm")).json());
    } catch (err) {
      $("pm").replaceChildren(el("p", "hint", "Couldn't load the panel. Is the app running?"));
    }
  }

  window.loadPm = loadPm;
  $("pm-refresh").addEventListener("click", loadPm);
  $("pm-sample").addEventListener("change", loadPm);
  // ?view=pm opens the panel; &sample=1 loads the sample; &focus=roi shows only the ROI section (for presenting).
  if (params.get("sample") === "1") $("pm-sample").checked = true;
  if (params.get("view") === "pm") $("tab-pm").click();
})();
