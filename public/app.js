// ---------- SVG icons (crisp, no external assets) ----------
const ICON = {
  hub: `<svg viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2.4"/><circle cx="5" cy="19" r="2.4"/><circle cx="19" cy="19" r="2.4"/><path d="M12 7.4v3.2M11 12.4 6.5 16.8M13 12.4l4.5 4.4"/></svg>`,
  user: `<svg viewBox="0 0 24 24" fill="none" stroke="#98a6d4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/></svg>`,
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="#6ea8fe" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="6"/><path d="m20 20-3.5-3.5"/></svg>`,
  pen: `<svg viewBox="0 0 24 24" fill="none" stroke="#43e0a0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`,
  shield: `<svg viewBox="0 0 24 24" fill="none" stroke="#f472b6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6Z"/><path d="m9 12 2 2 4-4"/></svg>`,
};

const LOGO = `<svg viewBox="0 0 48 48" fill="none"><defs><linearGradient id="lg" x1="0" y1="0" x2="48" y2="48"><stop stop-color="#6ea8fe"/><stop offset="1" stop-color="#a78bfa"/></linearGradient></defs><path d="M24 3 42 13.5v21L24 45 6 34.5v-21Z" stroke="url(#lg)" stroke-width="2.5" fill="rgba(110,168,254,0.08)"/><circle cx="24" cy="18" r="3" fill="#6ea8fe"/><circle cx="16" cy="30" r="3" fill="#a78bfa"/><circle cx="32" cy="30" r="3" fill="#43e0a0"/><path d="M24 21 16.8 27.6M24 21 31.2 27.6" stroke="url(#lg)" stroke-width="2" stroke-linecap="round"/></svg>`;

// ---------- agent definitions ----------
const AGENTS = {
  client:       { name: "Customer (you)", role: "Buyer · sends the request", icon: ICON.user,   pill: "Customer", bal: false },
  orchestrator: { name: "Atlas",          role: "Orchestrator · hires & pays", icon: ICON.hub,  pill: "Orchestrator", bal: true },
  research:     { name: "Argus",          role: "Research · finds sources", icon: ICON.search,  bal: true },
  writer:       { name: "Calliope",       role: "Writer · drafts report",   icon: ICON.pen,     bal: true },
  verifier:     { name: "Themis",         role: "Verifier · fact-checks",   icon: ICON.shield,  bal: true },
};

const nameOf = (id) => AGENTS[id]?.name ?? id;

// ---------- build nodes ----------
document.getElementById("logoSlot").innerHTML = LOGO;

for (const [id, a] of Object.entries(AGENTS)) {
  const el = document.getElementById("node-" + id);
  if (!el) continue;
  el.innerHTML = `
    ${a.pill ? `<span class="role-pill">${a.pill}</span>` : ""}
    <div class="node-ring"></div>
    <div class="node-ico">${a.icon}</div>
    <div class="node-body">
      <div class="node-name">${a.name}</div>
      <div class="node-role">${a.role}</div>
      ${a.bal ? `<div class="node-bal" data-bal>0.00 <span>USDC</span></div>` : ""}
      <div class="node-state" data-state></div>
    </div>`;
}

function setBalance(id, balance) {
  const el = document.querySelector(`#node-${id} [data-bal]`);
  if (el) el.innerHTML = `${(+balance).toFixed(2)} <span>USDC</span>`;
}
function setState(id, state) {
  const node = document.getElementById("node-" + id);
  if (!node) return;
  node.classList.toggle("working", state === "working");
  node.classList.add("active");
  const el = node.querySelector("[data-state]");
  if (el) el.textContent = state === "working" ? "● working…" : "";
}
function flashPaid(id) {
  const node = document.getElementById("node-" + id);
  if (!node) return;
  node.classList.add("paid", "active");
  setTimeout(() => node.classList.remove("paid"), 1400);
}

// ---------- flying coin animation ----------
function flyCoin(fromId, toId) {
  const a = document.getElementById("node-" + fromId);
  const b = document.getElementById("node-" + toId);
  if (!a || !b) return;
  const ra = a.getBoundingClientRect();
  const rb = b.getBoundingClientRect();
  const x0 = ra.left + ra.width / 2 - 15;
  const y0 = ra.top + ra.height / 2 - 15;
  const coin = document.createElement("div");
  coin.className = "coin";
  coin.textContent = "$";
  coin.style.left = x0 + "px";
  coin.style.top = y0 + "px";
  document.getElementById("coinLayer").appendChild(coin);
  requestAnimationFrame(() => {
    const dx = rb.left + rb.width / 2 - 15 - x0;
    const dy = rb.top + rb.height / 2 - 15 - y0;
    coin.style.transform = `translate(${dx}px, ${dy}px) scale(0.65)`;
    coin.style.opacity = "0.15";
  });
  setTimeout(() => coin.remove(), 1200);
}

// ---------- transaction feed ----------
const feedEl = document.getElementById("feed");
function addFeed(o) {
  const tx = o.txHash
    ? `<a class="tx-link" href="https://basescan.org/tx/${o.txHash}" target="_blank" title="${o.txHash}">⛓ tx</a>`
    : "";
  const li = document.createElement("li");
  li.innerHTML = `
    <span class="phase ${o.phase}">${o.phase}</span>
    <span class="who">${nameOf(o.from)} → ${nameOf(o.to)}</span>
    <span class="cap">${o.capability || ""}</span>
    ${tx}
    <span class="tx-amount">${(+o.amount).toFixed(2)} USDC</span>`;
  feedEl.prepend(li);
  while (feedEl.children.length > 60) feedEl.removeChild(feedEl.lastChild);
}

// ---------- stats ----------
let txCount = 0;
const setStat = (id, v) => (document.getElementById(id).textContent = v);

// ---------- markdown (tiny) ----------
function renderMarkdown(md) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc(md)
    .replace(/^### (.*)$/gm, "<h3>$1</h3>")
    .replace(/^## (.*)$/gm, "<h2>$1</h2>")
    .replace(/^# (.*)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
    .replace(/^\s*[-*] (.*)$/gm, "<li>$1</li>")
    .replace(/(<li>[\s\S]*?<\/li>)/g, "<ul>$1</ul>")
    .replace(/\n{2,}/g, "<br/><br/>")
    .replace(/\n/g, "<br/>");
}

const reportEl = document.getElementById("report");
function showReport(r) {
  const pct = Math.round((r.confidence ?? 0) * 100);
  setStat("statSpent", (+r.totalSpent).toFixed(2));
  setStat("statConf", pct + "%");
  setStat("statSources", (r.sources ?? []).filter((s) => s.url).length);
  const sources = (r.sources ?? [])
    .filter((s) => s.url)
    .map((s, i) => `<li>[${i + 1}] <a href="${s.url}" target="_blank">${s.title || s.url}</a></li>`)
    .join("");
  reportEl.innerHTML = `
    <div class="confidence"><span>✅ Confidence: <strong>${pct}%</strong></span><span>💸 Spent: <strong>${(+r.totalSpent).toFixed(2)} USDC</strong></span></div>
    <div>${renderMarkdown(r.report || "")}</div>
    ${sources ? `<h3>Sources</h3><ul>${sources}</ul>` : ""}`;
}

// ---------- SSE ----------
const es = new EventSource("/api/events");
es.onmessage = (msg) => {
  let ev;
  try { ev = JSON.parse(msg.data); } catch { return; }

  switch (ev.type) {
    case "balance": setBalance(ev.agent, ev.balance); break;
    case "agent": setState(ev.agent, ev.state); break;
    case "order":
      addFeed(ev);
      if (ev.phase === "lock") flyCoin(ev.from, ev.to);
      if (ev.phase === "lock" && ev.txHash) setStat("statTx", ++txCount);
      if (ev.phase === "clear") flashPaid(ev.to);
      break;
    case "run":
      if (ev.phase === "start") {
        reportEl.innerHTML = `<p class="placeholder">🧭 Atlas is assembling a report for: “${ev.query}” …</p>`;
      } else if (ev.phase === "done") {
        showReport(ev.report);
        setRunning(false);
      } else if (ev.phase === "error") {
        reportEl.innerHTML = `<p class="placeholder">⚠️ ${ev.message}</p>`;
        setRunning(false);
      }
      break;
    case "log":
      if (ev.level === "error") console.error("[server]", ev.message);
      break;
  }
};

// ---------- run button ----------
const runBtn = document.getElementById("runBtn");
const queryInput = document.getElementById("queryInput");
function setRunning(running) {
  runBtn.disabled = running;
  runBtn.querySelector("span").textContent = running ? "Working…" : "Run research";
}
async function run() {
  const query = queryInput.value.trim();
  if (!query) return;
  setRunning(true);
  txCount = 0;
  setStat("statTx", 0); setStat("statSpent", "—"); setStat("statConf", "—"); setStat("statSources", "—");
  try {
    const res = await fetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) throw new Error((await res.json()).error || "request failed");
  } catch (err) {
    reportEl.innerHTML = `<p class="placeholder">⚠️ ${err.message}</p>`;
    setRunning(false);
  }
}
runBtn.addEventListener("click", run);
queryInput.addEventListener("keydown", (e) => { if (e.key === "Enter") run(); });

// ---------- status badges ----------
fetch("/api/status")
  .then((r) => r.json())
  .then((s) => {
    const rail = document.getElementById("railBadge");
    if (s.rail === "croo") { rail.textContent = "LIVE on Base"; rail.classList.add("live"); }
    else rail.textContent = "🧪 Simulation";
    document.getElementById("llmBadge").textContent = "🧠 " + s.llm;
  })
  .catch(() => {});
