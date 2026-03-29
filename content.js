//content.js

let shadowRoot;
let panel;
let selectedText = "";
let currentProvider = "google";

init();

// ================= INIT =================
function init() {
  createShadowRoot();
  document.addEventListener("mouseup", handleSelection);
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") closePanel();
  });
}

// ================= SHADOW ROOT =================
function createShadowRoot() {
  const container = document.createElement("div");
  document.documentElement.appendChild(container);
  shadowRoot = container.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
    .highlight {
      position: fixed;
      background: rgba(255,235,59,0.4);
      border-radius: 4px;
      z-index: 999998;
      cursor: pointer;
    }

    .panel {
      position: fixed;
      width: 260px;
      background: white;
      border: 1px solid #ccc;
      border-radius: 10px;
      z-index: 999999;
      box-shadow: 0 5px 20px rgba(0,0,0,0.2);
      font-family: Arial;
    }

    .header {
      display:flex;
      justify-content:space-between;
      background:#eee;
      padding:6px;
      cursor: move;
    }

    .providers span,
    .copy {
      cursor: pointer; /* ✅ FIX cursor */
      margin-right: 6px;
    }

    textarea {
      width:100%;
      height:150px;
      border:none;
      padding:10px;
      resize:none;
      box-sizing: border-box; /* ✅ FIX width overflow */
      outline: none;
    }
  `;
  shadowRoot.appendChild(style);
}

function handleSelection() {

  const sel = window.getSelection();
  if (!sel.rangeCount) return;

  const text = sel.toString().trim();
  if (!text || text.length < 2) return;

  selectedText = text;

  const range = sel.getRangeAt(0);

  const wordCount = text.split(/\s+/).length;
  const mode = wordCount === 1 ? "word" : "sentence";

  // ✅ keep user-selected provider (NO force)
  let providerToUse = currentProvider;

  chrome.runtime.sendMessage({
    type: "TRANSLATE",
    text,
    provider: providerToUse,
    mode,
    original: text
  }, (res) => {

    if (!res) return;

    res.mode = mode;

    createHighlight(range, res);

    const rect = range.getBoundingClientRect();
    openPanel(res, rect);
  });

  sel.removeAllRanges();
}

// ================= MULTI-LINE HIGHLIGHT =================
function createHighlight(range, data) {
  const rects = Array.from(range.getClientRects());
  const group = [];

  rects.forEach(rect => {
    const box = document.createElement("div");
    box.className = "highlight";

    box.style.position = "absolute";
    box.style.top = (rect.top + window.scrollY) + "px";
    box.style.left = (rect.left + window.scrollX) + "px";

    // box.style.top = rect.top + "px";
    // box.style.left = rect.left + "px";
    box.style.width = rect.width + "px";
    box.style.height = rect.height + "px";

    box.dataset.data = JSON.stringify(data);

    box.onclick = (e) => {

      if (e.altKey) {
        group.forEach(el => el.remove());
        closePanel();
        return;
      }

      const d = JSON.parse(box.dataset.data);
      openPanel(d, rect);
    };

    shadowRoot.appendChild(box);
    group.push(box);
  });
}

// ================= PANEL =================
function openPanel(data, rect) {

  closePanel();

  panel = document.createElement("div");
  panel.className = "panel";

  panel.style.top = rect.bottom + 10 + "px";
  panel.style.left = rect.left + "px";

  panel.innerHTML = `
    <div class="header">
      <div class="providers">
        <span data-p="google">🌐</span>
        <span data-p="dict">📘</span>
        <span data-p="ai">🧠</span>
      </div>
      <span class="copy">📋</span>
    </div>
    <textarea>${buildContent(data)}</textarea>
  `;

  shadowRoot.appendChild(panel);

  // ✅ PROVIDER SWITCH
  panel.querySelectorAll(".providers span").forEach(btn => {
    btn.onclick = (e) => {

      e.stopPropagation();

      currentProvider = btn.dataset.p;

      const wordCount = selectedText.split(/\s+/).length;
      const mode = wordCount === 1 ? "word" : "sentence";

      chrome.runtime.sendMessage({
        type: "TRANSLATE",
        text: selectedText,
        provider: currentProvider,
        mode
      }, res => {
        res.mode = mode;
        panel.querySelector("textarea").value = buildContent(res);
      });
    };
  });

  // ✅ COPY FIX
  panel.querySelector(".copy").onclick = (e) => {

    e.stopPropagation();

    const textarea = panel.querySelector("textarea");

    navigator.clipboard.writeText(textarea.value)
      .then(() => {
        e.target.textContent = "✅";
        setTimeout(() => e.target.textContent = "📋", 1000);
      })
      .catch(() => {
        textarea.select();
        document.execCommand("copy");
      });
  };

  enableDrag(panel);

  setTimeout(() => {
    document.addEventListener("mousedown", outsideClick);
  });
}

// ================= BUILD CONTENT =================
function buildContent(data) {

  // ✅ FIX TITLE LOGIC
  let title = (data.mode === "word")
    ? data.original
    : data.translated;

  let out = `👉 ${title}\n\n`;

  // ✅ GROUP MEANINGS
  if (data.meanings?.length) {

    const grouped = {};

    data.meanings.forEach(m => {
      if (!grouped[m.type]) grouped[m.type] = [];
      grouped[m.type].push(m.meaning);
    });

    out += "📘 Dictionary:\n";

    Object.keys(grouped).forEach(type => {
      const unique = [...new Set(grouped[type])];
      out += `${type}: ${unique.join(" ")}\n\n`;
    });
  }

  // ✅ EXAMPLES
  if (data.examples?.length) {
    out += "📗 Examples:\n";
    data.examples.slice(0, 3).forEach(e => {
      out += `- ${e}\n`;
    });
  }

  return out;
}

// ================= CLOSE =================
function closePanel() {
  if (panel) {
    panel.remove();
    panel = null;
    document.removeEventListener("mousedown", outsideClick);
  }
}

function outsideClick(e) {
  if (!panel) return;
  if (e.composedPath().includes(panel)) return;
  closePanel();
}

// ================= DRAG =================
function enableDrag(panel) {
  const header = panel.querySelector(".header");

  let isDown = false, ox = 0, oy = 0;

  header.onmousedown = (e) => {

    // ❌ prevent drag on buttons
    if (e.target.closest(".providers") || e.target.closest(".copy")) return;

    isDown = true;

    const r = panel.getBoundingClientRect();
    ox = e.clientX - r.left;
    oy = e.clientY - r.top;
  };

  document.onmousemove = (e) => {
    if (!isDown) return;
    panel.style.left = e.clientX - ox + "px";
    panel.style.top = e.clientY - oy + "px";
  };

  document.onmouseup = () => isDown = false;
}
// from branch 01
// 22222222222222222222222




// from branch 01
// 3333333333333333333333