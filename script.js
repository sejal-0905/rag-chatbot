
const API = "http://localhost:8000";
marked.setOptions({ breaks: true, gfm: true });

let activeChatId = null;
let lastDebugData = null;
let debugPanelOpen = false;

function getAllChats() { return JSON.parse(localStorage.getItem("ragChats") || "{}"); }
function saveAllChats(c) { localStorage.setItem("ragChats", JSON.stringify(c)); }
function createChat(title = "New Chat") {
  const id = "chat_" + Date.now();
  const chats = getAllChats();
  chats[id] = { id, title, history: [], messages: "" };
  saveAllChats(chats);
  return id;
}
function getChat(id) { return getAllChats()[id] || null; }
function updateChat(id, patch) {
  const chats = getAllChats();
  if (chats[id]) { Object.assign(chats[id], patch); saveAllChats(chats); }
}
function deleteChat(id) { const c = getAllChats(); delete c[id]; saveAllChats(c); }

function renderChatList() {
  const chats = getAllChats();
  const list = document.getElementById("chatList");
  list.innerHTML = "";
  const sorted = Object.values(chats).reverse();
  if (!sorted.length) {
    list.innerHTML = `<div style="font-size:10px;color:#2a2040;padding:10px 6px">no chats yet</div>`;
    return;
  }
  sorted.forEach(chat => {
    const item = document.createElement("div");
    item.className = "chat-item" + (chat.id === activeChatId ? " active" : "");
    item.innerHTML = `
      <i class="ti ti-message-circle" style="font-size:12px;flex-shrink:0;color:#4a3f6e"></i>
      <span class="chat-title">${chat.title}</span>
      <button class="chat-del" title="Delete"><i class="ti ti-trash"></i></button>`;
    item.querySelector(".chat-del").addEventListener("click", async e => {
      e.stopPropagation();
      if (!await showConfirm("Delete this chat?")) return;
      deleteChat(chat.id);
      if (activeChatId === chat.id) {
        const rem = Object.keys(getAllChats());
        rem.length ? switchToChat(rem[rem.length - 1]) : startNewChat();
      }
      renderChatList();
    });
    item.querySelector(".chat-title").addEventListener("dblclick", e => {
      e.stopPropagation(); e.preventDefault();
      const t = prompt("Rename chat:", chat.title);
      if (t?.trim()) { updateChat(chat.id, { title: t.trim() }); renderChatList(); }
    });
    item.addEventListener("click", () => switchToChat(chat.id));
    list.appendChild(item);
  });
}

function switchToChat(id) {
  activeChatId = id;
  localStorage.setItem("ragActiveChat", id);
  renderChatList();
  const chat = getChat(id);
  if (!chat) return;
  const msgs = document.getElementById("messages");
  if (chat.messages) {
    msgs.innerHTML = chat.messages;
    msgs.scrollTop = msgs.scrollHeight;
    reattachCopyButtons();
  } else {
    const hasDocs = document.querySelectorAll(".file-item").length > 0;
    showWelcomeScreen(hasDocs);
  }
}

function showWelcomeScreen(hasDocuments) {
  const msgs = document.getElementById("messages");
  if (hasDocuments) {
    const docs = [...document.querySelectorAll(".file-item")].map(el => el.dataset.name);
    const multiDoc = docs.length > 1;

    const pickerHTML = multiDoc ? `
      <div class="doc-picker">
        <div class="doc-picker-label">which document?</div>
        <div class="doc-picker-options">
          ${docs.map((d, i) => `<button class="doc-picker-opt${i === 0 ? ' selected' : ''}" data-doc="${escHtml(d)}" onclick="selectDoc(this)"><i class="ti ti-file-text" style="font-size:11px"></i> ${escHtml(d)}</button>`).join("")}
        </div>
      </div>` : "";

    msgs.innerHTML = `<div class="welcome" id="welcomeScreen">
      <div class="welcome-icon"><i class="ti ti-sparkles"></i></div>
      <div class="welcome-title">What do you want to know?</div>
      ${pickerHTML}
      <div class="welcome-chips">
        <button class="welcome-chip" onclick="useChip(this)">What is this document about?</button>
        <button class="welcome-chip" onclick="useChip(this)">What are the key concepts?</button>
        <button class="welcome-chip" onclick="useChip(this)">Explain the main topic simply</button>
        <button class="welcome-chip" onclick="useChip(this)">What are the most important points?</button>
      </div>
    </div>`;
  } else {
    msgs.innerHTML = `<div class="welcome" id="welcomeScreen">
      <div class="welcome-icon"><i class="ti ti-file-upload"></i></div>
      <div class="welcome-title">Upload a document to get started</div>
      <div class="welcome-sub">supports PDF and TXT files</div>
      <div class="welcome-upload-hint">
        drag a file anywhere on the page, or
        <span onclick="document.getElementById('docsBtn').click()">browse files</span>
      </div>
    </div>`;
  }
}

function selectDoc(btn) {
  document.querySelectorAll(".doc-picker-opt").forEach(b => b.classList.remove("selected"));
  btn.classList.add("selected");
}

function getSelectedDoc() {
  const sel = document.querySelector(".doc-picker-opt.selected");
  if (!sel) return null;
  const doc = sel.dataset.doc;
  return doc === "all" ? null : doc;
}

function useChip(btn) {
  const input = document.getElementById("questionInput");
  const selectedDoc = getSelectedDoc();
  const text = btn.textContent.trim();
  input.value = selectedDoc ? `From ${selectedDoc}: ${text}` : text;
  input.focus();
  sendQuestion();
}

function startNewChat() {
  const id = createChat("New Chat");
  activeChatId = id;
  localStorage.setItem("ragActiveChat", id);
  renderChatList();
  const hasDocs = document.querySelectorAll(".file-item").length > 0;
  showWelcomeScreen(hasDocs);
}

function openDebugPanel() {
  debugPanelOpen = true;
  document.getElementById("debugPanel").classList.add("open");
  document.getElementById("messages").classList.add("panel-open");
  document.getElementById("inputWrap").classList.add("panel-open");
}

function closeDebugPanel() {
  debugPanelOpen = false;
  document.getElementById("debugPanel").classList.remove("open");
  document.getElementById("messages").classList.remove("panel-open");
  document.getElementById("inputWrap").classList.remove("panel-open");
}

function renderDebugPanel(data) {
  lastDebugData = data;
  const body = document.getElementById("debugBody");
  if (!data) {
    body.innerHTML = `<div class="debug-empty"><i class="ti ti-radar-2"></i>ask a question to see<br>retrieved chunks here</div>`;
    return;
  }
  const chunks = data.debug_chunks || [];
  const maxScore = Math.max(...chunks.map(c => c.score), 0.001);
  document.getElementById("debugPanelSubtitle").textContent = chunks.length ? `${chunks.length} chunks` : "";
  let html = "";
  if (data.search_query) {
    html += `<div class="debug-query-box"><div class="debug-query-label">search query used</div><div class="debug-query-text">${escHtml(data.search_query)}</div></div>`;
  }
  html += `<div class="debug-legend"><div class="legend-bar"></div>reranker score — higher = more relevant</div>`;
  chunks.forEach((c, idx) => {
    const pct = Math.round((Math.max(0, c.score) / maxScore) * 100);
    const scoreColor = c.score > 0 ? "#10b981" : "#ef4444";
    html += `<div class="chunk-card" id="chunkCard_${idx}">
      <div class="chunk-card-header" onclick="toggleChunkCard(${idx})">
        <span class="chunk-rank">#${c.rank}</span>
        <span class="chunk-source" title="${escHtml(c.source)}">${escHtml(c.source)}</span>
        <div class="chunk-score-wrap"><span class="chunk-score-val" style="color:${scoreColor}">${c.score.toFixed(3)}</span></div>
        <i class="ti ti-chevron-down chunk-chevron"></i>
      </div>
      <div class="chunk-bar-wrap"><div class="chunk-bar-track"><div class="chunk-bar-fill" style="width:${pct}%"></div></div></div>
      <div class="chunk-body">
        <div class="chunk-text" id="chunkText_${idx}">${escHtml(c.chunk)}</div>
        <button class="chunk-copy-btn" onclick="copyChunk(${idx})"><i class="ti ti-copy"></i> copy chunk</button>
      </div>
    </div>`;
  });
  body.innerHTML = html;
}

function showDebugLoading() {
  document.getElementById("debugBody").innerHTML = `<div class="debug-loading">${Array(5).fill(0).map((_, i) => `<div><div class="skel" style="height:14px;width:${60+i*8}%;margin-bottom:6px"></div><div class="skel" style="height:38px;width:100%"></div></div>`).join("")}</div>`;
}

function toggleChunkCard(idx) { document.getElementById("chunkCard_" + idx).classList.toggle("expanded"); }

function copyChunk(idx) {
  const el = document.getElementById("chunkText_" + idx);
  if (!el) return;
  navigator.clipboard.writeText(el.innerText);
  const btn = el.nextElementSibling;
  btn.innerHTML = '<i class="ti ti-check"></i> copied!';
  setTimeout(() => { btn.innerHTML = '<i class="ti ti-copy"></i> copy chunk'; }, 1500);
}

function escHtml(str) {
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

document.getElementById("newChatBtn").addEventListener("click", startNewChat);
document.getElementById("toggleSidebar").addEventListener("click", () => document.getElementById("sidebar").classList.toggle("collapsed"));
document.getElementById("docsBtn").addEventListener("click", () => {
  document.getElementById("docsOverlay").classList.toggle("open");
  document.getElementById("docsBtn").classList.toggle("active");
});
document.addEventListener("click", e => {
  const ov = document.getElementById("docsOverlay");
  const btn = document.getElementById("docsBtn");
  if (!ov.contains(e.target) && !btn.contains(e.target)) {
    ov.classList.remove("open");
    btn.classList.remove("active");
  }
});
document.getElementById("debugCloseBtn").addEventListener("click", closeDebugPanel);
document.getElementById("clearBtn").addEventListener("click", () => {
  if (!activeChatId) return;
  updateChat(activeChatId, { history: [], messages: "" });
  const hasDocs = document.querySelectorAll(".file-item").length > 0;
  showWelcomeScreen(hasDocs);
});
document.getElementById("fileInput").addEventListener("change", uploadFile);
document.getElementById("askBtn").addEventListener("click", sendQuestion);
document.getElementById("questionInput").addEventListener("keydown", e => { if (e.key === "Enter") sendQuestion(); });

async function loadDocuments() {
  document.getElementById("loadingSpinner").style.display = "flex";
  try {
    const res = await fetch(`${API}/documents`);
    const data = await res.json();
    if (data.documents?.length) {
      const allChunks = await fetch(`${API}/documents/chunks`).then(r=>r.json()).catch(()=>({}));
      data.documents.forEach(f => addFileToList(f, allChunks[f] || null));
    }
  } catch {} finally { document.getElementById("loadingSpinner").style.display = "none"; }
}

function addFileToList(filename, chunks = null) {
  if ([...document.querySelectorAll(".file-item")].some(el => el.dataset.name === filename)) return;
  const item = document.createElement("div");
  item.className = "file-item";
  item.dataset.name = filename;
  item.innerHTML = `
    <i class="ti ti-file-text file-icon"></i>
    <span class="file-name">${filename}</span>
    ${chunks ? `<span class="chunk-badge">${chunks}c</span>` : ""}
    <button class="delete-btn" title="Delete"><i class="ti ti-trash"></i></button>`;
  item.querySelector(".delete-btn").addEventListener("click", e => {
    e.preventDefault(); e.stopPropagation();
    deleteDocument(filename, item);
  });
  document.getElementById("fileList").appendChild(item);
  const welcome = document.getElementById("welcomeScreen");
  if (welcome) showWelcomeScreen(true);
}

async function deleteDocument(filename, itemEl) {
  if (!await showConfirm(`Delete "<b>${filename}</b>" from the database?`)) return;
  try {
    const res = await fetch(`${API}/documents/${encodeURIComponent(filename)}`, { method: "DELETE" });
    const data = await res.json();
    if (data.deleted) itemEl.remove();
  } catch {}
}

async function uploadFile(e) {
  e.preventDefault();
  const files = Array.from(e.target.files);
  if (!files.length) return;
  e.target.value = "";
  const status = document.getElementById("statusMsg");
  status.style.display = "block";
  status.style.background = "#13101e";
  status.style.border = "0.5px solid #2a2040";
  for (const file of files) {
    status.textContent = `reading ${file.name}...`;
    status.style.color = "#a78bfa";
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch(`${API}/upload`, { method: "POST", body: fd });
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (data.error) { status.textContent = `error: ${data.error}`; status.style.color = "#ef4444"; }
            else if (data.progress) { status.textContent = data.progress; status.style.color = "#a78bfa"; }
            else if (data.chunks_stored !== undefined) {
              status.textContent = `✓ ${data.filename} (${data.chunks_stored} chunks)`;
              status.style.color = "#10b981";
              addFileToList(data.filename, data.chunks_stored);
            }
          } catch {}
        }
      }
    } catch { status.textContent = `upload failed for ${file.name}`; status.style.color = "#ef4444"; }
  }
}

async function sendQuestion() {
  const input = document.getElementById("questionInput");
  const q = input.value.trim();
  if (!q) return;
  input.value = "";
  if (!activeChatId) startNewChat();
  document.getElementById("welcomeScreen")?.remove();

  const hasDocs = document.querySelectorAll(".file-item").length > 0;
  if (!hasDocs) {
    const msgs = document.getElementById("messages");
    const nudge = document.createElement("div");
    nudge.className = "no-docs-nudge";
    nudge.innerHTML = `<i class="ti ti-alert-circle"></i> No documents uploaded yet.<span class="no-docs-nudge-link" onclick="document.getElementById('docsBtn').click()">Upload one →</span>`;
    msgs.appendChild(nudge);
    msgs.scrollTop = msgs.scrollHeight;
    document.getElementById("askBtn").disabled = false;
    document.getElementById("questionInput").value = q;
    return;
  }

  appendMsg("user", q);
  document.getElementById("askBtn").disabled = true;

  const { div: assistantDiv, bubble, stopPhase } = createAssistantBubble();
  const msgs = document.getElementById("messages");
  msgs.appendChild(assistantDiv);
  msgs.scrollTop = msgs.scrollHeight;

  const chat = getChat(activeChatId);
  const history = chat ? chat.history : [];
  let fullAnswer = "";
  let sources = [];
  let debugChunks = [];
  let webUsed = false;
  let webSources = [];
  let renderScheduled = false;

  if (debugPanelOpen) showDebugLoading();

  try {
    const res = await fetch(`${API}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: q, history: history.slice(-10) })
    });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const evt = JSON.parse(line.slice(6));
          if (evt.sources !== undefined) {
            sources = evt.sources;
            debugChunks = evt.debug_chunks || [];
            webUsed = evt.web_used || false;
            webSources = evt.web_sources || [];
            const payload = { search_query: q, debug_chunks: debugChunks };
            renderDebugPanel(payload);
          } else if (evt.token) {
            stopPhase();
            fullAnswer += evt.token;
            if (!renderScheduled) {
              renderScheduled = true;
              requestAnimationFrame(() => {
                bubble.innerHTML = marked.parse(fullAnswer);
                msgs.scrollTop = msgs.scrollHeight;
                renderScheduled = false;
              });
            }
          } else if (evt.done) {
            bubble.innerHTML = marked.parse(fullAnswer);
            finaliseAssistantMsg(assistantDiv, sources, debugChunks, q, fullAnswer, webUsed, webSources);
          } else if (evt.error) {
            stopPhase();
            bubble.innerHTML = `<span style="color:#7c6fa0;font-style:italic">Error: ${evt.error}</span>`;
          }
        } catch {}
      }
    }

    const newHistory = [...history, { role: "user", content: q }, { role: "assistant", content: fullAnswer }];
    const isNew = history.length === 0;
    const newTitle = isNew ? q.slice(0, 35) + (q.length > 35 ? "…" : "") : chat.title;
    updateChat(activeChatId, { history: newHistory, messages: msgs.innerHTML, title: newTitle });
    if (isNew) renderChatList();
  } catch {
    bubble.textContent = "error reaching backend. make sure it's running.";
  }
  document.getElementById("askBtn").disabled = false;
}

function finaliseAssistantMsg(assistantDiv, sources, debugChunks, query, fullAnswer, webUsed, webSources) {
  const inner = assistantDiv.querySelector("div");

  const hasDocChunks = debugChunks.length > 0;
  const hasWeb = webUsed && webSources && webSources.length > 0;
  const topDocScore = hasDocChunks ? Math.max(...debugChunks.map(c => c.score)) : -Infinity;
  const isDocTargeted = query.toLowerCase().startsWith("from ") && query.includes(".pdf");
  const docChunksRelevant = hasDocChunks && (topDocScore > 0 || isDocTargeted);

  if (docChunksRelevant || hasWeb) {    const barsEl = document.createElement("div");
    barsEl.className = "source-bars";
    let barsHTML = `<div class="source-bars-label">sources used</div>`;

    if (docChunksRelevant) {
      const minScore = Math.min(...debugChunks.map(c => c.score));
      const sourceTotals = {};
      debugChunks.forEach(c => {
        const shifted = c.score - minScore;
        sourceTotals[c.source] = (sourceTotals[c.source] || 0) + shifted;
      });
      const docTotal = Object.values(sourceTotals).reduce((a, b) => a + b, 0);
      const webWeight = hasWeb ? docTotal * 0.3 : 0;
      const grandTotal = docTotal + webWeight;
      const sorted = Object.entries(sourceTotals).sort((a, b) => b[1] - a[1]);

      sorted.forEach(([src, val]) => {
        const pct = grandTotal > 0 ? Math.round((val / grandTotal) * 100) : Math.round(100 / (sorted.length + (hasWeb ? 1 : 0)));
        barsHTML += `<div class="source-bar-row"><div class="source-bar-name" title="${escHtml(src)}">${escHtml(src)}</div><div class="source-bar-track"><div class="source-bar-fill" data-pct="${pct}"></div></div><div class="source-bar-pct">${pct}%</div></div>`;
      });

      if (hasWeb) {
        const webPct = grandTotal > 0 ? Math.round((webWeight / grandTotal) * 100) : 0;
        barsHTML += `<div class="source-bar-row"><div class="source-bar-name" style="color:#38bdf8">🌐 web search</div><div class="source-bar-track"><div class="source-bar-fill" data-pct="${webPct}" style="background:linear-gradient(90deg,#0ea5e9,#38bdf8)"></div></div><div class="source-bar-pct" style="color:#38bdf8">${webPct}%</div></div>`;
      }
    } else if (hasWeb) {
      barsHTML += `<div class="source-bar-row"><div class="source-bar-name" style="color:#38bdf8">🌐 web search</div><div class="source-bar-track"><div class="source-bar-fill" data-pct="100" style="background:linear-gradient(90deg,#0ea5e9,#38bdf8)"></div></div><div class="source-bar-pct" style="color:#38bdf8">100%</div></div>`;
    }

    if (hasWeb) {
      barsHTML += `<div style="margin-top:8px;display:flex;flex-direction:column;gap:3px">${webSources.map(s =>
        `<a href="${escHtml(s.url)}" target="_blank" style="font-size:9px;color:#0ea5e9;text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block" title="${escHtml(s.url)}">↗ ${escHtml(s.title || s.url)}</a>`
      ).join("")}</div>`;
    }

    barsEl.innerHTML = barsHTML;
    inner.appendChild(barsEl);
    requestAnimationFrame(() => { barsEl.querySelectorAll(".source-bar-fill").forEach(el => { el.style.width = el.dataset.pct + "%"; }); });
  }

  if (docChunksRelevant) {
    const studyBtns = document.createElement("div");
    studyBtns.className = "study-btns";
    studyBtns.innerHTML = `
      <button class="study-btn" data-mode="notes"><i class="ti ti-notes"></i> Make Notes</button>
      <button class="study-btn" data-mode="flashcards"><i class="ti ti-cards"></i> Flashcards</button>
      <button class="study-btn" data-mode="quiz"><i class="ti ti-help-circle"></i> Quiz Me</button>`;
    inner.appendChild(studyBtns);

    const studyOutputEl = document.createElement("div");
    inner.appendChild(studyOutputEl);

    studyBtns.querySelectorAll(".study-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const mode = btn.dataset.mode;
        const context = debugChunks.map(c => c.chunk).join("\n\n");
        runStudyMode(mode, context, fullAnswer, studyBtns, studyOutputEl);
      });
    });
  }

  const meta = document.createElement("div");
  meta.className = "msg-meta";
  const ts = document.createElement("span");
  ts.className = "msg-timestamp";
  ts.textContent = formatTime(new Date());
  meta.appendChild(ts);
  const copyBtn = document.createElement("button");
  copyBtn.className = "copy-btn";
  copyBtn.title = "Copy";
  copyBtn.innerHTML = '<i class="ti ti-copy"></i>';
  copyBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(fullAnswer);
    copyBtn.innerHTML = '<i class="ti ti-check"></i>';
    setTimeout(() => { copyBtn.innerHTML = '<i class="ti ti-copy"></i>'; }, 1500);
  });
  meta.appendChild(copyBtn);
  if (debugChunks.length) {
    const chunkBtn = document.createElement("button");
    chunkBtn.className = "view-chunks-btn loaded";
    chunkBtn.innerHTML = `<i class="ti ti-radar-2"></i> view chunks`;
    chunkBtn.addEventListener("click", () => {
      renderDebugPanel({ search_query: query, debug_chunks: debugChunks });
      openDebugPanel();
    });
    meta.appendChild(chunkBtn);
  }
  inner.appendChild(meta);
}

async function runStudyMode(mode, context, answer, btnsEl, outputEl) {
  const allBtns = btnsEl.querySelectorAll(".study-btn");
  allBtns.forEach(b => { b.disabled = true; });
  const activeBtn = btnsEl.querySelector(`[data-mode="${mode}"]`);
  activeBtn.classList.add("loading");
  activeBtn.innerHTML = `<i class="ti ti-loader-2" style="animation:spin 1s linear infinite"></i> generating...`;

  outputEl.innerHTML = "";

  const icons = { notes: "ti-notes", flashcards: "ti-cards", quiz: "ti-help-circle" };
  const titles = { notes: "Study Notes", flashcards: "Flashcards", quiz: "Quiz" };

  try {
    const res = await fetch(`${API}/study`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, context, answer })
    });
    const data = await res.json();
    console.log("study response:", JSON.stringify(data));
    if (data.error) throw new Error(data.error);
    let parsed = data.result;
    console.log("parsed:", JSON.stringify(parsed));

    if (typeof parsed === "string") {
      try { parsed = JSON.parse(parsed); } catch {}
    }

    if (mode === "notes" && Array.isArray(parsed)) {
      parsed = { title: "Study Notes", points: parsed.map(p => typeof p === "string" ? p : JSON.stringify(p)) };
    }
    if (mode === "notes" && (!parsed || !parsed.title || !Array.isArray(parsed.points))) {
      throw new Error("Unexpected response shape for notes.");
    }
    if ((mode === "flashcards" || mode === "quiz") && !Array.isArray(parsed)) {
      throw new Error("Unexpected response shape for " + mode);
    }

    outputEl.innerHTML = `<div class="study-output">
      <div class="study-output-header">
        <div class="study-output-title"><i class="ti ${icons[mode]}"></i>${titles[mode]}</div>
        <button class="study-output-close" onclick="this.closest('.study-output').remove()"><i class="ti ti-x"></i></button>
      </div>
      <div class="study-output-body" id="studyBody_${Date.now()}"></div>
    </div>`;

    const body = outputEl.querySelector(".study-output-body");

    if (mode === "notes") {
      body.innerHTML = `<div class="notes-content"><strong style="color:#a78bfa;font-size:12px">${escHtml(parsed.title)}</strong><ul style="margin-top:8px">${parsed.points.map(p => `<li>${escHtml(p)}</li>`).join("")}</ul></div>`;
    }

    if (mode === "flashcards") {
  body.innerHTML = `<div class="flashcard-stack">${parsed.map(card => `
    <div class="flashcard" onclick="this.classList.toggle('flipped')">
        <div class="flashcard-inner">

            <div class="flashcard-front">
                <span class="flashcard-front-text">
                    ${escHtml(card.front)}
                </span>

                <span class="flashcard-flip-hint">
                    click to flip
                </span>
            </div>

            <div class="flashcard-back">
                ${escHtml(card.back)}
            </div>

        </div>
    </div>
`).join("")}</div>`;
}
    if (mode === "quiz") {
      const qid = "quiz_" + Date.now();
      body.innerHTML = `<div class="quiz-stack">${parsed.map((q, qi) => `
        <div class="quiz-q" id="${qid}_${qi}">
          <div class="quiz-q-num">question ${qi + 1} of ${parsed.length}</div>
          <div class="quiz-q-text">${escHtml(q.question)}</div>
          <div class="quiz-options">
            ${Object.entries(q.options).map(([k, v]) => `<button class="quiz-option" data-key="${k}" onclick="answerQuiz(this, '${k}', '${q.answer}', \`${escHtml(q.explanation)}\`, '${qid}_${qi}')">${k}) ${escHtml(v)}</button>`).join("")}
          </div>
          <div class="quiz-explanation" id="${qid}_exp_${qi}">${escHtml(q.explanation)}</div>
        </div>`).join("")}
      </div>`;
    }

  } catch (err) {
    outputEl.innerHTML = `<div class="study-output"><div class="study-output-body"><span style="font-size:11px;color:#ef4444">Failed to generate: ${escHtml(err.message)}. Try again.</span></div></div>`;
  }

  allBtns.forEach(b => { b.disabled = false; b.classList.remove("loading"); });
  const btnLabels = { notes: `<i class="ti ti-notes"></i> Make Notes`, flashcards: `<i class="ti ti-cards"></i> Flashcards`, quiz: `<i class="ti ti-help-circle"></i> Quiz Me` };
  activeBtn.innerHTML = btnLabels[mode];

  outputEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function answerQuiz(btn, chosen, correct, explanation, cardId) {
  const card = document.getElementById(cardId);
  card.querySelectorAll(".quiz-option").forEach(b => {
    b.disabled = true;
    if (b.dataset.key === correct) b.classList.add("correct");
    else if (b.dataset.key === chosen && chosen !== correct) b.classList.add("wrong");
  });
  const exp = card.querySelector(".quiz-explanation");
  if (exp) exp.classList.add("show");
}

function appendMsg(role, text) {
  const msgs = document.getElementById("messages");
  const div = document.createElement("div");
  div.className = `msg ${role}`;
  div.innerHTML = `<div><div class="bubble">${text}</div><div class="msg-meta"><span class="msg-timestamp">${formatTime(new Date())}</span></div></div>`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function createAssistantBubble() {
  const div = document.createElement("div");
  div.className = "msg assistant";
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.innerHTML = `<div class="phase-indicator"><div class="phase-dot"></div><span class="phase-text">Searching documents<span class="phase-ellipsis">...</span></span></div>`;
  const inner = document.createElement("div");
  inner.appendChild(bubble);
  div.appendChild(inner);
  const phases = ["Searching documents", "Searching the web", "Analysing results", "Generating answer"];
  let phaseIdx = 0;
  const phaseEl = bubble.querySelector(".phase-text");
  const interval = setInterval(() => {
    phaseIdx = Math.min(phaseIdx + 1, phases.length - 1);
    phaseEl.innerHTML = `${phases[phaseIdx]}<span class="phase-ellipsis">...</span>`;
  }, 1800);
  let phaseStopped = false;
  const stopPhase = () => {
    if (phaseStopped) return;
    phaseStopped = true;
    clearInterval(interval);
    const indicator = bubble.querySelector(".phase-indicator");
    if (indicator) indicator.remove();
  };
  return { div, bubble, stopPhase };
}

function formatTime(d) { return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }

function showConfirm(message) {
  return new Promise(resolve => {
    const ov = document.createElement("div");
    ov.className = "dialog-overlay";
    ov.innerHTML = `<div class="dialog-box"><p>${message}</p><div class="dialog-actions"><button class="btn-cancel">Cancel</button><button class="btn-confirm">Delete</button></div></div>`;
    document.body.appendChild(ov);
    ov.querySelector(".btn-cancel").addEventListener("click", () => { ov.remove(); resolve(false); });
    ov.querySelector(".btn-confirm").addEventListener("click", () => { ov.remove(); resolve(true); });
  });
}

function reattachCopyButtons() {
  document.querySelectorAll(".copy-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const bubble = btn.closest(".msg")?.querySelector(".bubble");
      if (bubble) navigator.clipboard.writeText(bubble.innerText);
      btn.innerHTML = '<i class="ti ti-check"></i>';
      setTimeout(() => { btn.innerHTML = '<i class="ti ti-copy"></i>'; }, 1500);
    });
  });
}

const styleEl = document.createElement("style");
styleEl.textContent = `@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;
document.head.appendChild(styleEl);

let dragCounter = 0;

document.addEventListener("dragenter", e => {
  if (!e.dataTransfer.types.includes("Files")) return;
  dragCounter++;
  document.getElementById("dragOverlay").classList.add("active");
});

document.addEventListener("dragleave", e => {
  dragCounter--;
  if (dragCounter <= 0) {
    dragCounter = 0;
    document.getElementById("dragOverlay").classList.remove("active");
  }
});

document.addEventListener("dragover", e => { e.preventDefault(); });

document.addEventListener("drop", async e => {
  e.preventDefault();
  dragCounter = 0;
  document.getElementById("dragOverlay").classList.remove("active");
  const files = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith(".pdf") || f.name.endsWith(".txt"));
  if (!files.length) return;
  document.getElementById("docsBtn").click();
  const status = document.getElementById("statusMsg");
  status.style.display = "block";
  status.style.background = "#13101e";
  status.style.border = "0.5px solid #2a2040";
  for (const file of files) {
    status.textContent = `reading ${file.name}...`;
    status.style.color = "#a78bfa";
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch(`${API}/upload`, { method: "POST", body: fd });
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (data.error) { status.textContent = `error: ${data.error}`; status.style.color = "#ef4444"; }
            else if (data.progress) { status.textContent = data.progress; status.style.color = "#a78bfa"; }
            else if (data.chunks_stored !== undefined) {
              status.textContent = `✓ ${data.filename} (${data.chunks_stored} chunks)`;
              status.style.color = "#10b981";
              addFileToList(data.filename, data.chunks_stored);
            }
          } catch {}
        }
      }
    } catch { status.textContent = `upload failed for ${file.name}`; status.style.color = "#ef4444"; }
  }
});

loadDocuments().then(() => {
  const chats = getAllChats();
  const savedActive = localStorage.getItem("ragActiveChat");
  if (!Object.keys(chats).length) {
    startNewChat();
  } else {
    activeChatId = (savedActive && chats[savedActive]) ? savedActive : Object.keys(chats).at(-1);
    renderChatList();
    switchToChat(activeChatId);
  }
});
