(function () {
  "use strict";

  // ---- TMQ framework v2 (Analysis columns I..AC) --------------------------------
  // penNo / penPartial mirror the extra deductions in Analysis!AE3.
  var SECTIONS = [
    { name: "First Impressions & Greeting", crit: [
      { id: "I", t: "Correct Company Greeting" },
      { id: "J", t: "Agent Introduction – Name & Personal Touch" },
      { id: "K", t: "Clear Enunciation" } ] },
    { name: "Booking Process – Capturing Information", crit: [
      { id: "L", t: "Confirming & Clarifying Names", penNo: 2 },
      { id: "M", t: "Full Address Details for Bookings", penNo: 2 },
      { id: "N", t: "Authentication for Commercial Customers", penNo: 2, penPartial: 1, noPartial: true },
      { id: "O", t: "Avoiding Assumptions" },
      { id: "P", t: "Correct Booking Procedures Followed", penNo: 2, penPartial: 1 },
      { id: "Q", t: "Airport Bookings – Capturing Details", penNo: 2, penPartial: 1 } ] },
    { name: "Customer Interaction & Call Handling", crit: [
      { id: "R", t: "Providing Correct & Consistent Information" },
      { id: "S", t: "Politeness & Enthusiasm" },
      { id: "T", t: "Maintaining Professionalism" },
      { id: "U", t: "Avoiding Unnecessary Holds / Mutes" },
      { id: "V", t: "Keeping the Conversation Natural" },
      { id: "W", t: "Engaging with Customers" },
      { id: "X", t: "Handling ETA Queries Tactfully" },
      { id: "Y", t: "Call Control & Efficiency" },
      { id: "Z", t: "Not Asking to Spell Well-Known Locations" },
      { id: "AA", t: "Active Listening & Information Retention" } ] },
    { name: "Call Closure", crit: [
      { id: "AB", t: "Confident Call Closure" },
      { id: "AC", t: "Professional Closing Statement" } ] }
  ];
  var HIHI = ["GDPR", "Rudeness", "Booking Error", "Hang Up", "Business Avoidance", "Language",
    "Business Refusal", "Professionalism", "Competition", "No Answer", "Foul Language"];
  var ALL = [];
  SECTIONS.forEach(function (s) { s.crit.forEach(function (c) { ALL.push(c); }); });
  var OPTS = [["Yes", "a-yes"], ["Partial", "a-partial"], ["No", "a-no"], ["NA", "a-na"]];

  var TYPICAL = { N: "NA", P: "NA", Q: "NA" }; // what every one of the 40 real rows looks like
  var SCENARIOS = {
    typical: { label: "Typical booking", set: {} },
    tesco: { label: "Asked to spell “Tesco”", set: { M: "Partial", Z: "No" } },
    address: { label: "Missed the full address", set: { M: "No" } },
    airport: { label: "Airport, terminal not confirmed", set: { P: "Yes", Q: "Partial" } },
    ninety: { label: "Exactly 90%", set: { P: "Yes", Q: "Yes", U: "No", X: "No" } },
    auth: { label: "Account caller not authenticated", set: { N: "No" } },
    gdpr: { label: "GDPR breach", set: {}, hihi: ["GDPR"] }
  };

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function renderScorer(root) {
    var list = root.querySelector("#crit-list");
    var html = "";
    SECTIONS.forEach(function (s, si) {
      html += '<div class="sect"><div class="sect-h"><h4>' + esc(s.name) + '</h4><span>' + s.crit.length + ' criteria</span></div>';
      s.crit.forEach(function (c) {
        var tag = c.penNo ? '<span class="chip crit" title="Extra deduction in the sheet">Critical · No −' + c.penNo + (c.penPartial ? ', Partial −' + c.penPartial : '') + '</span>' : "";
        html += '<fieldset class="crit"><legend>' + esc(c.t) + tag + '</legend><div class="seg">';
        OPTS.forEach(function (o) {
          var id = "c-" + c.id + "-" + o[0];
          var dis = (o[0] === "Partial" && c.noPartial) ? ' disabled title="The rubric defines no Partial for this criterion"' : "";
          html += '<input type="radio" name="c-' + c.id + '" id="' + id + '" value="' + o[0] + '"' + dis + '><label for="' + id + '" class="' + o[1] + '">' + (o[0] === "NA" ? "N/A" : o[0]) + '</label>';
        });
        html += '</div></fieldset>';
      });
      html += '</div>';
    });
    list.innerHTML = html;
    var hh = root.querySelector("#hihi-list");
    hh.innerHTML = HIHI.map(function (h) { return '<label><input type="checkbox" value="' + esc(h) + '">' + esc(h) + '</label>'; }).join("");
    var scn = root.querySelector("#scn-list");
    scn.innerHTML = Object.keys(SCENARIOS).map(function (k) { return '<button type="button" data-scn="' + k + '" aria-pressed="false">' + esc(SCENARIOS[k].label) + '</button>'; }).join("");
  }

  function applyScenario(root, key) {
    var sc = SCENARIOS[key];
    ALL.forEach(function (c) {
      var v = sc.set[c.id] || TYPICAL[c.id] || "Yes";
      var el = root.querySelector("#c-" + c.id + "-" + v);
      if (el) el.checked = true;
    });
    root.querySelectorAll("#hihi-list input").forEach(function (i) { i.checked = !!(sc.hihi && sc.hihi.indexOf(i.value) > -1); });
    root.querySelectorAll("#scn-list button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.scn === key)); });
    compute(root);
  }

  // Score = (Σ points − Σ penalties) ÷ applicable criteria; any HiHi ⇒ 0. Integer maths in half-points.
  function compute(root) {
    var half = 0, pen2 = 0, n = 0, pens = [];
    var secs = SECTIONS.map(function (s) {
      var h = 0, m = 0;
      s.crit.forEach(function (c) {
        var el = root.querySelector('input[name="c-' + c.id + '"]:checked');
        var a = el ? el.value : "NA";
        if (a === "NA") return;
        n++; m++;
        var p = a === "Yes" ? 2 : a === "Partial" ? 1 : 0;
        half += p; h += p;
        if (a === "No" && c.penNo) { pen2 += 2 * c.penNo; pens.push("−" + c.penNo + " · No on " + c.t); }
        if (a === "Partial" && c.penPartial) { pen2 += 2 * c.penPartial; pens.push("−" + c.penPartial + " · Partial on " + c.t); }
      });
      return { name: s.name, pct: m ? (h * 50) / m : null };
    });
    var hihi = Array.prototype.map.call(root.querySelectorAll("#hihi-list input:checked"), function (i) { return i.value; });
    var fig = root.querySelector("#live-fig"), band = root.querySelector("#live-band"), math = root.querySelector("#live-math");
    var net = half - pen2, band_ = "none", label = "Not scorable", icon = "–", shown;
    if (hihi.length) {
      shown = "0%"; band_ = "fail"; label = "Auto-fail"; icon = "✕";
      math.textContent = "Zero-tolerance issue: " + hihi.join(", ") + ". The sheet forces 0% whatever the answers.";
    } else if (!n) {
      shown = "—"; math.textContent = "Every criterion is N/A. The sheet shows #DIV/0! here.";
    } else {
      var raw = (net * 50) / n; // percent
      var floored = raw < 0;
      shown = (floored ? 0 : raw).toFixed(raw % 1 === 0 ? 0 : 2) + "%";
      if (net === 2 * n) { band_ = "perfect"; label = "Perfect"; icon = "★"; }
      else if (net * 50 > 90 * n) { band_ = "meets"; label = "Meets KPI"; icon = "✓"; }
      else if (net > 0) { band_ = "below"; label = "Below KPI"; icon = "!"; }
      else { band_ = "fail"; label = "Fail"; icon = "✕"; }
      math.textContent = n + " applicable · " + (half / 2) + " points − " + (pen2 / 2) + " penalty = " + (net / 2) + " ÷ " + n +
        (floored ? " · raw " + raw.toFixed(2) + "% (the sheet shows it negative; we propose a 0% floor)" : "");
    }
    fig.textContent = shown;
    band.className = "pill " + band_;
    band.innerHTML = "<i aria-hidden=\"true\">" + icon + "</i>" + label;
    root.querySelector("#live-meters").innerHTML = secs.map(function (s) {
      var cls = s.pct === null ? "none" : s.pct > 90 ? "" : s.pct > 0 ? "below" : "fail";
      var v = s.pct === null ? "N/A" : (s.pct % 1 === 0 ? s.pct.toFixed(0) : s.pct.toFixed(1)) + "%";
      return '<div class="meter"><span>' + esc(s.name.split(" – ")[0]) + '</span><b>' + v + '</b><div class="track"><div class="fill ' + cls + '" style="width:' + (s.pct || 0) + '%"></div></div></div>';
    }).join("");
    root.querySelector("#live-pens").innerHTML = pens.length ? pens.map(function (p) { return "<li>" + esc(p) + "</li>"; }).join("") : '<li class="muted">No critical deductions</li>';
  }

  function initScorer() {
    var root = document.getElementById("scorer");
    if (!root) return;
    renderScorer(root);
    root.addEventListener("change", function () {
      root.querySelectorAll("#scn-list button").forEach(function (b) { b.setAttribute("aria-pressed", "false"); });
      compute(root);
    });
    root.querySelector("#scn-list").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-scn]");
      if (b) applyScenario(root, b.dataset.scn);
    });
    applyScenario(root, "typical");
  }

  // ---- Smart paste: parse rows copied from the call-recordings portal ------------
  var SITES = { SOL: "Solihull", BIR: "Birmingham", BIRPK: "Birmingham · PK", NUN: "Nuneaton", GB: "Great Barr" };
  var ROSTER = ["Demo Ava Stone", "Demo Ivy Lake", "Demo Max Hill"];
  var RE = /^\s*(Queue|Exten)\s+(?:(\d+)\s*\/\s*(\d+)\s*-\s*)?(.+?)\s+-\s+([A-Z]{2,6})\s+-\s+([A-Z]{1,4})\s+(.+?)\s+(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):\d{2}\s+(\d{2}):(\d{2}):(\d{2})/;

  function mask(num) {
    var d = num.replace(/\D/g, "");
    if (!/^0\d{9,10}$/.test(d)) return esc(num.trim());
    return d.slice(0, 3) + "•• •••" + d.slice(-3);
  }
  function parseRows(text) {
    return text.split(/\r?\n/).filter(function (l) { return l.trim(); }).map(function (line) {
      var m = RE.exec(line);
      if (!m) return { bad: line };
      var dt = new Date(+m[8], +m[9] - 1, +m[10], +m[11], +m[12]);
      var mon = new Date(dt); mon.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
      var secs = (+m[13]) * 3600 + (+m[14]) * 60 + (+m[15]);
      return {
        kind: m[1], queue: m[2], ext: m[3], agent: m[4].trim(), site: m[5], team: m[6], caller: m[7],
        when: dt.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) + " " + m[11] + ":" + m[12],
        week: "w/c " + mon.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
        dur: Math.floor(secs / 60) + ":" + String(secs % 60).padStart(2, "0")
      };
    });
  }
  function renderPaste() {
    var ta = document.getElementById("paste-in"), out = document.getElementById("paste-out");
    if (!ta || !out) return;
    var rows = parseRows(ta.value);
    if (!rows.length) { out.innerHTML = '<tr><td colspan="7" class="muted">Paste one or more rows from the portal table.</td></tr>'; return; }
    out.innerHTML = rows.map(function (r, i) {
      if (r.bad) return '<tr><td class="num">' + (i + 1) + '</td><td colspan="6" class="muted">Not recognised — the reviewer fills this call in by hand.</td></tr>';
      var internal = r.kind === "Exten";
      var known = ROSTER.indexOf(r.agent) > -1;
      var status = internal ? '<span class="warn">Internal extension call · skipped by default</span>'
        : known ? '<span class="ok">✓</span> Ready to score' : "New agent · admin confirms";
      return '<tr><td class="num">' + (i + 1) + '</td><td>' + esc(r.agent) + '<div class="small muted">' + (r.queue ? "Queue " + r.queue + " · ext " + r.ext : "Extension") + " · team " + esc(r.team) + '</div></td>' +
        '<td>' + esc(SITES[r.site] || r.site + " (unknown code)") + '</td><td class="mono">' + (internal ? esc(r.caller) : mask(r.caller)) + '</td>' +
        '<td>' + r.when + '<div class="small muted">' + r.week + '</div></td><td class="num">' + r.dur + '</td><td>' + status + '</td></tr>';
    }).join("");
  }

  // ---- Table of contents highlight --------------------------------------------
  function initToc() {
    var links = Array.prototype.slice.call(document.querySelectorAll(".toc a"));
    if (!("IntersectionObserver" in window) || !links.length) return;
    var byId = {};
    links.forEach(function (a) { byId[a.getAttribute("href").slice(1)] = a; });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting && byId[en.target.id]) {
          links.forEach(function (a) { a.classList.remove("active"); });
          byId[en.target.id].classList.add("active");
        }
      });
    }, { rootMargin: "-20% 0px -70% 0px" });
    Object.keys(byId).forEach(function (id) { var s = document.getElementById(id); if (s) io.observe(s); });
  }

  document.addEventListener("DOMContentLoaded", function () {
    initScorer();
    var ta = document.getElementById("paste-in");
    if (ta) { ta.addEventListener("input", renderPaste); renderPaste(); }
    initToc();
  });
})();
