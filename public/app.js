// ---- Agent definitions (display only) ----
const AGENTS = {
  orchestrator: { emoji: "🧭", name: "Atlas", role: "Orchestrator · hires & pays" },
  research: { emoji: "🔎", name: "Argus", role: "Researcher · finds sources" },
  writer: { emoji: "✍️", name: "Calliope", role: "Writer · drafts the report" },
  verifier: { emoji: "🛡️", name: "Themis", role: "Verifier · fact-checks" },
};

const agentsEl = document.getElementById("agents");
const feedEl = document.getElementById("feed");
const reportEl = document.getElementById("report");
const runBtn = document.getElementById("runBtn");
const queryInput = document.getElementById("queryInput");

// Build the four agent cards.
const cards = {};
for (const [id, info] of Object.entries(AGENTS)) {
  const card = document.createElement("div");
  card.className = "agent-card";
  card.innerHTML = `
    <div class="agent-top">
      <span class="agent-emoji">${info.emoji}</span>
      <div>
        <div class="agent-name">${info.name}</div>
        <div class="agent-role">${info.role}</div>
      </div>
    </div>
    <div class="agent-balance" data-balance>0 <span>tUSDC</span></div>
    <div class="agent-state" data-state></div>`;
  agentsEl.appendChild(card);
  cards[id] = card;
}

function setBalance(agent, balance) {
  const el = cards[agent]?.querySelector("[data-balance]");
  if (el) el.innerHTML = `${balance} <span>tUSDC</span>`;
}

function setState(agent, state) {
  const card = cards[agent];
  if (!card) return;
  card.classList.toggle("working", state === "working");
  const el = card.querySelector("[data-state]");
  if (el) el.textContent = state === "working" ? "● working…" : "";
}

function flashPaid(agent) {
  const card = cards[agent];
  if (!card) return;
  card.classList.add("paid");
  setTimeout(() => card.classList.remove("paid"), 1200);
}

// ---- Transaction feed ----
function addFeed(order) {
  const { from, to, phase, amount, capability, txHash } = order;
  const fromName = AGENTS[from]?.name ?? from;
  const toName = AGENTS[to]?.name ?? to;
  const tx = txHash
    ? `<a class="tx-link" href="https://basescan.org/tx/${txHash}" target="_blank" title="${txHash}">⛓ tx</a>`
    : "";
  const li = document.createElement("li");
  li.innerHTML = `
    <span class="phase ${phase}">${phase}</span>
    <span>${fromName} → ${toName}</span>
    <span class="agent-role">(${capability})</span>
    ${tx}
    <span class="tx-amount">${amount} tUSDC</span>`;
  feedEl.prepend(li);
  if (phase === "clear") flashPaid(to);
}

// ---- Minimal Markdown -> HTML (headings, bold, lists, links) ----
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

function showReport(r) {
  const pct = Math.round((r.confidence ?? 0) * 100);
  const sources = (r.sources ?? [])
    .filter((s) => s.url)
    .map((s, i) => `<li>[${i + 1}] <a href="${s.url}" target="_blank">${s.title || s.url}</a></li>`)
    .join("");
  reportEl.innerHTML = `
    <div class="confidence">✅ Verifier confidence: <strong>${pct}%</strong> · 💸 Total spent: <strong>${r.totalSpent} tUSDC</strong></div>
    <div>${renderMarkdown(r.report || "")}</div>
    ${sources ? `<h3>Sources</h3><ul>${sources}</ul>` : ""}`;
}

// ---- Server-Sent Events ----
const es = new EventSource("/api/events");
es.onmessage = (msg) => {
  let ev;
  try {
    ev = JSON.parse(msg.data);
  } catch {
    return;
  }

  switch (ev.type) {
    case "balance":
      setBalance(ev.agent, ev.balance);
      break;
    case "agent":
      setState(ev.agent, ev.state);
      break;
    case "order":
      addFeed(ev);
      break;
    case "run":
      if (ev.phase === "start") {
        feedEl.innerHTML = "";
        reportEl.innerHTML = `<p class="placeholder">🧭 Orchestrator is hiring agents for: “${ev.query}” …</p>`;
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

// ---- Run button ----
function setRunning(running) {
  runBtn.disabled = running;
  runBtn.textContent = running ? "Working…" : "Run research";
}

async function run() {
  const query = queryInput.value.trim();
  if (!query) return;
  setRunning(true);
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
queryInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") run();
});

// ---- Status badges ----
fetch("/api/status")
  .then((r) => r.json())
  .then((s) => {
    const railBadge = document.getElementById("railBadge");
    if (s.rail === "croo") {
      railBadge.textContent = "⛓ LIVE on Base";
      railBadge.classList.add("live");
    } else {
      railBadge.textContent = "🧪 Simulation";
    }
    document.getElementById("llmBadge").textContent = `🧠 ${s.llm}`;
  })
  .catch(() => {});
