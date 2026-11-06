(function () {
  /*SIM-CORE-START*/
  var A = { contacts: 45000, inScope: 0.6, minutes: 9.594, egpMin: 2, hireValue: 51.2, fixed: 93333.33, aiChat: 0.015, aiBig: 0.1,
    askRecover: 0.6, catchAuto: 0.8, catchHuman: 0.9, checkMin: 1.5, concurrency: 1.5, capacityPerMin: 370, msgsPerChat: 1.6,
    p95Base: 5.5, p95Big: 2.2, bar: 0.96, rescuedAcc: 0.93 };
  var HOUR = [.25,.15,.1,.08,.08,.12,.25,.5,.9,1.3,1.5,1.5,1.4,1.3,1.3,1.2,1.2,1.3,1.4,1.4,1.2,.9,.6,.4];
  var DOW = [1.15, 1, 1, 1, 1.05, .6, .75]; // Sunday first
  var LOWER = [.9, .8, .7, .6, 0];
  var ACC = [.995, .98, .93, .41, .25];
  var EASY = [.40, .30, .15, .10, .05], MED = [.25, .30, .20, .15, .10];
  var MIX = [.55, .33, .12]; // easy, medium, must go to a person
  var EVENTS = [
    { id: "ramadan", name: "Ramadan pattern", why: "Quiet days, a late-night peak", whole: true },
    { id: "fee", name: "Yearly card fee day", why: "Same question from many people", days: [9, 10], vol: 2.2, mix: [.75, .2, .05] },
    { id: "policy", name: "New fee rules go live", why: "Questions the AI has not seen", days: [3, 4, 5, 6, 7, 8, 9], vol: 1.5, nov: .25 },
    { id: "fraud", name: "Phishing wave", why: "Most chats must go to Fraud", days: [6, 7], vol: 2.5, mix: [.25, .2, .55], nov: .05 },
    { id: "eid", name: "Eid holiday", why: "Branches closed, half the agents", days: [13, 14, 15, 16], vol: 1.4, staff: .5 },
    { id: "outage", name: "Card network outage, 4 hours", why: "Sudden spike, one known answer", days: [18], hours: [19, 22], vol: 6, mix: [.85, .1, .05] },
    { id: "app", name: "App outage, 2 hours", why: "Chat goes silent, then a rebound", days: [21], hours: [20, 21], vol: 0, after: { hours: [22, 23], vol: 3 } },
    { id: "sale", name: "White Friday sale", why: "Declines and disputes rise", days: [26, 27, 28], vol: 2, mix: [.3, .55, .15], nov: .05 }
  ];
  var DAYS = 30, S_AT_DEFAULT = null;
  var RAMADAN = function (h) { return h >= 9 && h <= 15 ? .8 : h >= 16 && h <= 17 ? .6 : h >= 18 && h <= 19 ? .3 : h >= 20 || h <= 1 ? 1.6 : h >= 2 && h <= 4 ? 1.4 : 1; };
  function base(d, h) {
    var w = HOUR[h] * DOW[d % 7];
    if (d >= 24 && d <= 27) w *= 1.5;
    if (d === 0) w *= 1.2;
    return w;
  }
  var NORM = 0; for (var d0 = 0; d0 < DAYS; d0++) for (var h0 = 0; h0 < 24; h0++) NORM += base(d0, h0);

  function hourShape(d, h, on) {
    var out = { vol: 1, mix: MIX, nov: 0, staff: 1 };
    EVENTS.forEach(function (e) {
      if (!on[e.id]) return;
      if (e.whole) { out.vol *= RAMADAN(h); return; }
      if (e.days.indexOf(d) < 0) return;
      var inHours = !e.hours || (h >= e.hours[0] && h <= e.hours[1]);
      if (inHours) {
        out.vol *= e.vol;
        if (e.mix) out.mix = e.mix;
        out.nov += e.nov || 0;
        out.staff = Math.min(out.staff, e.staff || 1);
      } else if (e.after && h >= e.after.hours[0] && h <= e.after.hours[1]) out.vol *= e.after.vol;
    });
    return out;
  }
  function bandsOf(p, nov) {
    if (!nov) return p;
    var q = p.slice(), move = (q[0] + q[1]) * Math.min(nov, 1);
    q[0] *= 1 - Math.min(nov, 1); q[1] *= 1 - Math.min(nov, 1);
    q[3] += move / 2; q[4] += move / 2;
    return q;
  }
  // What one unit of a topic does under these settings.
  function topic(p, c, human) {
    var answered = 0, right = 0;
    for (var i = 0; i < 5; i++) if (LOWER[i] >= c.thr) { answered += p[i]; right += p[i] * ACC[i]; }
    var rest = 1 - answered, big = 0, asks = 0;
    if (c.big) { big = rest; var g = rest * c.lift; answered += g; right += g * A.rescuedAcc; rest -= g; }
    if (c.ask) { asks = rest; var r = rest * A.askRecover; answered += r; right += r * A.rescuedAcc; rest -= r; }
    var wrong = answered - right, caught = wrong * A.catchAuto, left = wrong - caught;
    var human2 = human ? left * A.catchHuman : 0;
    return { answered: answered, right: right, bad: left - human2, hand: rest + caught + human2, big: big, asks: asks, checks: human ? answered : 0 };
  }
  function run(c, on, rota) {
    var chatsMonth = A.contacts * A.inScope * c.adopt, scale = chatsMonth / NORM;
    var S = c.S, V = c.lens === "hire" ? A.hireValue : A.minutes * A.egpMin, hrs = [], backlog = 0;
    var t = { chats: 0, resolved: 0, value: 0, bad: 0, autoAns: 0, autoBad: 0, hand: 0, asks: 0, big: 0, ai: 0, worstWait: 0, waitHrs: 0, peak: 0, need: [0, 0, 0] };
    for (var d = 0; d < DAYS; d++) for (var h = 0; h < 24; h++) {
      var s = hourShape(d, h, on), chats = base(d, h) * scale * s.vol;
      var e = topic(bandsOf(EASY, s.nov), c, c.mode === 2), m = topic(bandsOf(MED, s.nov), c, c.mode >= 1);
      var ce = chats * s.mix[0], cm = chats * s.mix[1], cs = chats * s.mix[2];
      var right = ce * e.right + cm * m.right, bad = ce * e.bad + cm * m.bad, hand = ce * e.hand + cm * m.hand + cs;
      var checks = ce * e.checks + cm * m.checks, big = ce * e.big + cm * m.big, asks = ce * e.asks + cm * m.asks;
      var resolved = right * S;
      var rawValue = (ce * e.right * (c.mode === 2 ? 1 - A.checkMin / A.minutes : 1) + cm * m.right * (c.mode >= 1 ? 1 - A.checkMin / A.minutes : 1)) * S * V;
      var load = hand * A.minutes + checks * A.checkMin;
      var shift = h < 8 ? 0 : h < 16 ? 1 : 2, wait = 0;
      var capPerAgent = 60 * A.concurrency * s.staff;
      t.need[shift] = Math.max(t.need[shift], Math.ceil(load / capPerAgent));
      if (rota) {
        var cap = rota[shift] * capPerAgent;
        backlog = Math.max(0, backlog + load - cap);
        wait = backlog / (rota[shift] * A.concurrency * s.staff);
      }
      hrs.push({ d: d, h: h, chats: chats, load: load, wait: wait, staff: s.staff, resolved: resolved, hand: hand });
      t.chats += chats; t.resolved += resolved; t.value += rawValue; t.bad += bad; t.hand += hand; t.asks += asks; t.big += big;
      if (c.mode === 0) { t.autoAns += ce * e.answered + cm * m.answered; t.autoBad += bad; }
      else if (c.mode === 1) { t.autoAns += ce * e.answered; t.autoBad += ce * e.bad; }
      t.ai += chats * A.aiChat + big * A.aiBig;
      t.worstWait = Math.max(t.worstWait, wait); if (wait > 5) t.waitHrs++;
      t.peak = Math.max(t.peak, chats * A.msgsPerChat / 60);
    }
    t.acc = t.autoAns ? 1 - t.autoBad / t.autoAns : 1;
    t.bigShare = t.big / Math.max(t.chats, 1);
    t.p95 = A.p95Base + (c.big ? A.p95Big * Math.min(1, t.bigShare / .15) : 0);
    t.badCost = t.bad * c.badEq * V;
    t.cost = t.ai + A.fixed;
    t.net = t.value - t.badCost - t.cost;
    t.roiBefore = (t.value - t.cost) / t.cost;
    t.roi = t.net / t.cost;
    t.hrs = hrs;
    return t;
  }
  function normalRota(c) {
    var r = run(c, {}, null), rows = [[], [], []];
    r.hrs.forEach(function (x) { rows[x.h < 8 ? 0 : x.h < 16 ? 1 : 2].push(x.load); });
    return rows.map(function (a) { a.sort(function (p, q) { return p - q; }); return Math.max(1, Math.ceil(a[Math.floor(a.length * .95)] / (60 * A.concurrency))); });
  }
  var DEFAULTS = { thr: .7, big: false, ask: true, mode: 0, adopt: .2, lift: .1, badEq: 15, speed: 6, lens: "hire", S: 1 };
  (function calibrate() { var r = run(DEFAULTS, {}, null); S_AT_DEFAULT = (A.contacts * A.inScope * DEFAULTS.adopt * .4) / r.resolved; DEFAULTS.S = S_AT_DEFAULT; })();
  function search(c, on) {
    var out = [];
    [.6, .7, .8, .9].forEach(function (thr) { [0, 1, 2].forEach(function (mode) { [false, true].forEach(function (big) { [false, true].forEach(function (ask) {
      var k = Object.assign({}, c, { thr: thr, mode: mode, big: big, ask: ask });
      var r = run(k, on, normalRota(k));
      var acc = mode === 2 || r.acc >= A.bar, fast = r.p95 <= c.speed + 1e-9;
      out.push({ c: k, r: r, ok: acc && fast });
    }); }); }); });
    return out.filter(function (x) { return x.ok; }).sort(function (a, b) { return b.r.net - a.r.net; });
  }
  /*SIM-CORE-END*/
  if (typeof window === "undefined" || typeof document === "undefined") { globalThis.SIM = { run: run, search: search, normalRota: normalRota, DEFAULTS: DEFAULTS, EVENTS: EVENTS, A: A }; return; }

  var $ = function (id) { return document.getElementById(id); };
  var cfg = Object.assign({}, DEFAULTS), on = {};
  var MODES = ["AI answers alone", "AI on easy, agent on the rest", "Agent approves every answer"];
  var egp = function (n) { return (n < 0 ? "−" : "") + "EGP " + Math.round(Math.abs(n)).toLocaleString("en-US"); };
  var pct = function (n) { return (n >= 0 ? "+" : "−") + Math.abs(Math.round(n * 100)) + "%"; };
  var num = function (n) { return Math.round(n).toLocaleString("en-US"); };
  var dayName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
  function seg(host, items, get, set) {
    host.innerHTML = "";
    items.forEach(function (it) {
      var b = document.createElement("button"); b.type = "button"; b.textContent = it[1];
      b.setAttribute("aria-pressed", String(get() === it[0]));
      b.addEventListener("click", function () { set(it[0]); draw(); });
      host.appendChild(b);
    });
  }
  EVENTS.forEach(function (e) {
    var l = document.createElement("label"); l.className = "sim-check";
    l.innerHTML = '<input type="checkbox" id="sim-ev-' + e.id + '"><span>' + esc(e.name) + "<small>" + esc(e.why) + "</small></span>";
    $("sim-events").appendChild(l);
    l.querySelector("input").addEventListener("change", function (ev) { on[e.id] = ev.target.checked; draw(); });
  });
  var PRESETS = [["Normal month", []], ["Ramadan month", ["ramadan", "eid"]], ["Crisis week", ["fraud", "outage", "app"]], ["Worst month", ["fee", "policy", "fraud", "eid", "outage", "app", "sale"]]];
  PRESETS.forEach(function (p) {
    var b = document.createElement("button"); b.type = "button"; b.textContent = p[0];
    b.addEventListener("click", function () { on = {}; p[1].forEach(function (id) { on[id] = true; }); draw(); });
    $("sim-presets").appendChild(b);
  });
  [["sim-ask", "ask"], ["sim-big", "big"]].forEach(function (x) { $(x[0]).addEventListener("change", function (e) { cfg[x[1]] = e.target.checked; draw(); }); });
  [["sim-adopt", "adopt", 100], ["sim-lift", "lift", 100], ["sim-bad", "badEq", 1], ["sim-speed", "speed", 1]].forEach(function (x) {
    $(x[0]).addEventListener("input", function (e) { cfg[x[1]] = Number(e.target.value) / x[2]; draw(); });
  });
  var bestNow = null;
  $("sim-use").addEventListener("click", function () { if (bestNow) { cfg = Object.assign({}, bestNow.c); draw(); } });

  function describe(c) {
    return MODES[c.mode] + ", confidence " + c.thr.toFixed(1) + (c.ask ? ", one clear question" : ", no clear question") + (c.big ? ", bigger model" : ", small model only");
  }
  function tile(label, value, sub, cls) { return '<div class="sim-tile ' + (cls || "") + '"><span class="l">' + esc(label) + '</span><span class="v">' + esc(value) + '</span><span class="l">' + esc(sub) + "</span></div>"; }
  function heat(r) {
    var cw = 22, ch = 12, x0 = 34, y0 = 44, max = 0;
    r.hrs.forEach(function (x) { max = Math.max(max, x.chats); });
    var s = '<svg viewBox="0 0 ' + (x0 + cw * DAYS + 4) + " " + (y0 + ch * 24 + 6) + '" role="img" aria-label="Chats per hour for 30 days. Peak ' + max.toFixed(1) + ' chats an hour.">';
    var row = 0;
    EVENTS.forEach(function (e) {
      if (!on[e.id] || e.whole) return;
      var a = e.days[0], b = e.days[e.days.length - 1];
      s += '<rect x="' + (x0 + a * cw) + '" y="' + (2 + row * 11) + '" width="' + ((b - a + 1) * cw - 2) + '" height="3" rx="1.5" class="ev"/>';
      row = (row + 1) % 2;
    });
    for (var d = 0; d < DAYS; d++) {
      var dn = dayName[d % 7];
      s += '<text x="' + (x0 + d * cw + cw / 2) + '" y="' + (y0 - 18) + '" text-anchor="middle">' + (d + 1) + "</text>";
      s += '<text x="' + (x0 + d * cw + cw / 2) + '" y="' + (y0 - 6) + '" text-anchor="middle">' + dn[0] + "</text>";
    }
    [0, 6, 12, 18, 23].forEach(function (h) { s += '<text x="' + (x0 - 6) + '" y="' + (y0 + h * ch + 10) + '" text-anchor="end">' + String(h).padStart(2, "0") + "</text>"; });
    r.hrs.forEach(function (x, i) {
      var o = x.chats <= 0 ? 0 : .08 + .92 * Math.sqrt(x.chats / max), red = x.wait > 5;
      s += '<rect data-i="' + i + '" x="' + (x0 + x.d * cw + 1) + '" y="' + (y0 + x.h * ch + 1) + '" width="' + (cw - 2) + '" height="' + (ch - 2) + '" rx="2" class="c' + (red ? " hot" : "") + '" fill-opacity="' + o.toFixed(3) + '"/>';
    });
    $("sim-map").innerHTML = s + "</svg>";
    var tip = $("sim-tip");
    $("sim-map").onmousemove = function (ev) {
      var i = ev.target.getAttribute && ev.target.getAttribute("data-i");
      if (i === null || i === undefined) { tip.style.display = "none"; return; }
      var x = r.hrs[+i];
      tip.innerHTML = "Day " + (x.d + 1) + " (" + dayName[x.d % 7] + "), " + String(x.h).padStart(2, "0") + ":00<br>" + x.chats.toFixed(1) + " chats · " + x.hand.toFixed(1) + " to a person<br>Wait for a person: " + Math.round(x.wait) + " min";
      tip.style.display = "block"; tip.style.left = Math.min(ev.clientX + 12, innerWidth - 250) + "px"; tip.style.top = ev.clientY + 12 + "px";
    };
    $("sim-map").onmouseleave = function () { tip.style.display = "none"; };
  }
  function triangle(r, best) {
    var P = { q: [160, 26], c: [24, 214], l: [296, 214] };
    var spot = function (x) {
      var q = Math.max(.05, Math.min(1, (x.acc - .9) / .1)), co = Math.max(.05, 1 - x.ai / 1500), sp = Math.max(.05, 1 - (x.p95 - 6) / 4), sum = q + co + sp;
      return [(q * P.q[0] + co * P.c[0] + sp * P.l[0]) / sum, (q * P.q[1] + co * P.c[1] + sp * P.l[1]) / sum];
    };
    var a = spot(r), b = best ? spot(best.r) : null;
    var s = '<svg viewBox="0 0 320 240" role="img" aria-label="Triangle of cost, quality and speed, with a dot for the current settings."><polygon points="160,26 24,214 296,214"/>';
    s += '<text x="160" y="16" text-anchor="middle">Quality</text><text x="24" y="232" text-anchor="middle">Low cost</text><text x="296" y="232" text-anchor="middle">Speed</text>';
    if (b) s += '<circle cx="' + b[0].toFixed(1) + '" cy="' + b[1].toFixed(1) + '" r="10" class="best"/>';
    s += '<circle cx="' + a[0].toFixed(1) + '" cy="' + a[1].toFixed(1) + '" r="6" class="you"/></svg>';
    $("sim-tri").innerHTML = s + '<p class="sim-note">Filled dot: your settings. Ring: the sweet spot. You cannot reach all three corners.</p>';
  }
  function draw() {
    seg($("sim-mode"), MODES.map(function (m, i) { return [i, m]; }), function () { return cfg.mode; }, function (v) { cfg.mode = v; });
    seg($("sim-thr"), [[.6, "0.6"], [.7, "0.7"], [.8, "0.8"], [.9, "0.9"]], function () { return cfg.thr; }, function (v) { cfg.thr = v; });
    seg($("sim-lens"), [["hire", "Hiring really falls"], ["time", "Minutes saved only"]], function () { return cfg.lens; }, function (v) { cfg.lens = v; });
    $("sim-ask").checked = cfg.ask; $("sim-big").checked = cfg.big;
    EVENTS.forEach(function (e) { $("sim-ev-" + e.id).checked = !!on[e.id]; });
    $("sim-adopt").value = cfg.adopt * 100; $("sim-adoptv").textContent = Math.round(cfg.adopt * 100) + "% of in-scope";
    $("sim-lift").value = cfg.lift * 100; $("sim-liftv").textContent = Math.round(cfg.lift * 100) + "%";
    $("sim-bad").value = cfg.badEq; $("sim-badv").textContent = cfg.badEq;
    $("sim-speed").value = cfg.speed; $("sim-speedv").textContent = cfg.speed.toFixed(1) + " s";

    var rota = normalRota(cfg), r = run(cfg, on, rota), top = search(cfg, on), best = top[0] || null;
    bestNow = best;
    var same = best && best.c.thr === cfg.thr && best.c.mode === cfg.mode && best.c.ask === cfg.ask && best.c.big === cfg.big;
    $("sim-verdict").innerHTML = !best ? "<b>No setting meets the limits.</b> Raise the slowest reply we accept, or lower the bar." :
      same ? "<b>You are on the sweet spot for this month.</b> " + esc(describe(cfg)) + "." :
      "<b>Sweet spot: " + esc(describe(best.c)) + ".</b> " + egp(best.r.net - r.net) + " a month better than your settings.";
    if (best && best.r.worstWait > 5) $("sim-verdict").innerHTML += " Customers would still wait: add agents as the rota table shows.";
    $("sim-use").style.display = best && !same ? "" : "none";
    var cap = r.peak / A.capacityPerMin;
    $("sim-tiles").innerHTML =
      tile("Net value a month", egp(r.net), "after bad answers and all costs", r.net >= 0 ? "ok" : "bad") +
      tile("Resolved chats", num(r.resolved), "of " + num(r.chats) + " chats") +
      tile("Bad answers reach customers", num(r.bad), "a month") +
      tile("Longest wait for a person", Math.round(r.worstWait) + " min", r.waitHrs + " hours over 5 min", r.worstWait > 5 ? "bad" : "ok") +
      tile("Busiest minute", r.peak.toFixed(1) + " msgs", (cap * 100).toFixed(1) + "% of AI capacity") +
      tile("Slowest 5% of replies", r.p95.toFixed(1) + " s", "pilot limit 6 s", r.p95 > 6 ? "warn" : "ok");
    heat(r);
    var names = ["Night, 00 to 08", "Day, 08 to 16", "Evening, 16 to 24"];
    $("sim-rota").innerHTML = "<table><thead><tr><th>Shift</th><th class=n>Normal rota</th><th class=n>Needed this month</th></tr></thead><tbody>" +
      names.map(function (n, i) { return "<tr><td>" + n + "</td><td class=n>" + rota[i] + "</td><td class=n>" + (r.need[i] > rota[i] ? "<b>" + r.need[i] + "</b>" : r.need[i]) + "</td></tr>"; }).join("") + "</tbody></table>";
    triangle({ acc: r.acc, ai: r.ai, p95: r.p95 }, best ? { r: { acc: best.r.acc, ai: best.r.ai, p95: best.r.p95 } } : null);
    $("sim-money").innerHTML = "<table><tbody>" +
      "<tr><td>Value of resolved chats</td><td class=n>" + egp(r.value) + "</td></tr>" +
      "<tr><td>AI cost</td><td class=n>" + egp(-r.ai) + "</td></tr>" +
      "<tr><td>Running and build cost</td><td class=n>" + egp(-A.fixed) + "</td></tr>" +
      "<tr><td>ROI before bad answers (the ROI model's figure)</td><td class=n>" + pct(r.roiBefore) + "</td></tr>" +
      "<tr><td>Bad answers, each cancelling " + cfg.badEq + " good ones</td><td class=n>" + egp(-r.badCost) + "</td></tr>" +
      "<tr><td><b>Net value</b> (ROI " + pct(r.roi) + ")</td><td class=n><b>" + egp(r.net) + "</b></td></tr></tbody></table>";
    $("sim-top").innerHTML = "<table><thead><tr><th>Settings</th><th class=n>Net a month</th><th class=n>Bad answers</th><th class=n>Longest wait</th></tr></thead><tbody>" +
      top.slice(0, 3).map(function (t) { return "<tr><td>" + esc(describe(t.c)) + "</td><td class=n>" + egp(t.r.net) + "</td><td class=n>" + num(t.r.bad) + "</td><td class=n>" + Math.round(t.r.worstWait) + " min</td></tr>"; }).join("") + "</tbody></table>";
    $("sim-rule").textContent = "Compared: 48 setting combinations. Each must keep answers the AI sends alone at 24 in 25 or better, and stay within the slowest reply you accept.";
  }
  draw();
})();
