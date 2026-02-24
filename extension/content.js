const isTopFrame = window === window.top;

// ── 1. Inject inject.js into page context so it can access WebRTC ──
// Runs in every frame so the RTCPeerConnection hook is applied regardless
// of which frame Amazon Connect uses for the softphone WebRTC connection.
window.__gpWorkletUrl = chrome.runtime.getURL('pcm-processor.js');

const script = document.createElement('script');
script.src = chrome.runtime.getURL('inject.js');
(document.head || document.documentElement).appendChild(script);
script.onload = () => script.remove();

// ── 2. Sidebar state (top frame only) ────────────────────────────
let sidebarHost = null;

// ── 3. Forward audio chunks from page → background ────────────────
// Runs in every frame — audio may originate from an iframe.
window.addEventListener('message', (event) => {
    if (event.source !== window) return;

    if (event.data.type === 'AUDIO_CHUNK') {
        try {
            chrome.runtime.sendMessage({
                type: 'TRANSLATE_AUDIO',
                direction: event.data.direction,
                audioData: event.data.audioData
            });
        } catch (e) {
            // Extension context invalidated — page refresh required
        }
    }
});

// ── 4. Storage listener — update transcript in sidebar ────────────
// Top frame only: iframes have no sidebar to update.
if (isTopFrame) {
    chrome.storage.onChanged.addListener((changes) => {
        if (changes.transcript && sidebarHost) {
            const shadow = sidebarHost.shadowRoot;
            if (shadow) displayTranscript(shadow, changes.transcript.newValue);
        }
    });
}

// ── 5. Messages from background ───────────────────────────────────
chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'START_TRANSLATION') {
        // Tell inject.js to start capturing the agent mic
        window.postMessage({ type: 'START_TRANSLATION' }, '*');
        // Update sidebar UI (translation was started via the toolbar icon)
        if (isTopFrame && sidebarHost) {
            const shadow = sidebarHost.shadowRoot;
            if (shadow) {
                shadow.getElementById('gp-status').textContent = 'Translation Active';
                shadow.getElementById('gp-status').className   = 'gp-status active';
                shadow.getElementById('startBtn').disabled     = true;
                shadow.getElementById('stopBtn').disabled      = false;
                shadow.getElementById('gp-transcript').textContent = 'Listening\u2026';
            }
        }
    }
    if (message.type === 'STOP_TRANSLATION') {
        window.postMessage({ type: 'STOP_TRANSLATION' }, '*');
        // Update sidebar UI (translation stopped via toolbar icon or sidebar button)
        if (isTopFrame && sidebarHost) {
            const shadow = sidebarHost.shadowRoot;
            if (shadow) {
                shadow.getElementById('gp-status').textContent = 'Translation Inactive';
                shadow.getElementById('gp-status').className   = 'gp-status inactive';
                shadow.getElementById('startBtn').disabled     = false;
                shadow.getElementById('stopBtn').disabled      = true;
            }
        }
    }
    if (message.type === 'TOGGLE_SIDEBAR' && isTopFrame) {
        toggleSidebar();
    }
});

// ── 5. Sidebar HTML / CSS (injected into Shadow DOM) ─────────────
const SIDEBAR_TEMPLATE = `
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  #wrapper {
    display: flex;
    height: 100%;
    width: 100%;
  }

  /* Drag-to-resize handle on the left edge */
  #resize-handle {
    width: 5px;
    flex-shrink: 0;
    cursor: ew-resize;
    background: transparent;
    transition: background 0.15s;
    position: relative;
    z-index: 1;
  }
  #resize-handle:hover,
  #resize-handle.dragging {
    background: #4a90e2;
  }

  /* Main panel */
  #sidebar {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: #f4f5f7;
    box-shadow: -6px 0 28px rgba(0, 0, 0, 0.18);
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: #2d2d2d;
    font-size: 13px;
  }

  /* ── Header ── */
  .gp-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 13px 14px;
    background: #16213e;
    color: #fff;
    flex-shrink: 0;
    user-select: none;
  }
  .gp-logo { width: 22px; height: 22px; object-fit: contain; }
  .gp-title { flex: 1; min-width: 0; }
  .gp-title h1 { font-size: 14px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .gp-title p  { font-size: 10.5px; opacity: 0.6; margin-top: 1px; }
  .gp-close {
    background: none;
    border: none;
    color: #fff;
    font-size: 17px;
    cursor: pointer;
    padding: 4px 7px;
    border-radius: 5px;
    opacity: 0.7;
    line-height: 1;
    transition: opacity 0.15s, background 0.15s;
    flex-shrink: 0;
  }
  .gp-close:hover { opacity: 1; background: rgba(255,255,255,0.12); }

  /* ── Body ── */
  .gp-body {
    flex: 1;
    overflow-y: auto;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 13px;
    min-height: 0;
  }

  /* ── Status pill ── */
  .gp-status {
    text-align: center;
    padding: 6px 12px;
    border-radius: 999px;
    font-size: 11.5px;
    font-weight: 600;
    letter-spacing: 0.3px;
  }
  .gp-status.inactive { background: #e4e4e4; color: #777; }
  .gp-status.active   {
    background: #d4edda;
    color: #1a6b2a;
    animation: gp-pulse 2s ease-in-out infinite;
  }
  @keyframes gp-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.65; } }

  /* ── Controls ── */
  .gp-controls { display: flex; flex-direction: column; gap: 7px; }

  .gp-label {
    font-size: 10.5px;
    font-weight: 700;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .gp-select {
    width: 100%;
    padding: 7px 9px;
    border: 1px solid #d0d0d0;
    border-radius: 6px;
    font-size: 13px;
    background: #fff;
    color: #2d2d2d;
    cursor: pointer;
    appearance: auto;
  }
  .gp-select:focus { outline: none; border-color: #4a90e2; }

  .gp-btn {
    width: 100%;
    padding: 9px;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s, opacity 0.15s;
    margin-top: 2px;
  }
  .gp-btn:disabled { opacity: 0.42; cursor: not-allowed; }

  .gp-btn-start { background: #4a90e2; color: #fff; }
  .gp-btn-start:hover:not(:disabled) { background: #357abd; }

  .gp-btn-stop { background: #e0e0e0; color: #555; }
  .gp-btn-stop:hover:not(:disabled) { background: #c9c9c9; }

  /* ── Transcript ── */
  .gp-transcript-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex: 1;
    min-height: 0;
  }

  .gp-transcript {
    background: #fff;
    border: 1px solid #ddd;
    border-radius: 6px;
    padding: 10px;
    flex: 1;
    min-height: 120px;
    overflow-y: auto;
    font-size: 12.5px;
    color: #555;
    line-height: 1.55;
  }

  .gp-entry {
    padding: 8px 0;
    border-bottom: 1px solid #f0f0f0;
  }
  .gp-entry:last-child { border-bottom: none; }

  .gp-speaker {
    font-weight: 700;
    font-size: 12px;
    margin-right: 4px;
  }
  .gp-speaker.customer { color: #c0392b; }
  .gp-speaker.agent    { color: #0070c1; }

  .gp-original-text { color: #333; font-size: 12px; }
</style>

<div id="wrapper">
  <div id="resize-handle" title="Drag to resize"></div>
  <div id="sidebar">

    <div class="gp-header">
      <img class="gp-logo" id="gp-logo-img" src="" alt="Grey Parrot">
      <div class="gp-title">
        <h1>Grey Parrot</h1>
        <p>Real-Time Translation</p>
      </div>
      <button class="gp-close" id="closeBtn" title="Close sidebar">&#x2715;</button>
    </div>

    <div class="gp-body">

      <div id="gp-status" class="gp-status inactive">Translation Inactive</div>

      <div class="gp-controls">
        <span class="gp-label">Customer Language</span>
        <select id="customerLang" class="gp-select">
          <option value="es" selected>Spanish</option>
          <option value="en">English</option>
          <option value="fr">French</option>
          <option value="pt">Portuguese</option>
          <option value="de">German</option>
          <option value="zh">Chinese</option>
          <option value="ar">Arabic</option>
          <option value="ja">Japanese</option>
          <option value="ko">Korean</option>
          <option value="hi">Hindi</option>
          <option value="ru">Russian</option>
          <option value="it">Italian</option>
        </select>

        <span class="gp-label">Agent Language</span>
        <select id="agentLang" class="gp-select">
          <option value="en" selected>English</option>
          <option value="es">Spanish</option>
          <option value="fr">French</option>
          <option value="pt">Portuguese</option>
          <option value="de">German</option>
          <option value="zh">Chinese</option>
          <option value="ar">Arabic</option>
          <option value="ja">Japanese</option>
          <option value="ko">Korean</option>
          <option value="hi">Hindi</option>
          <option value="ru">Russian</option>
          <option value="it">Italian</option>
        </select>

        <button id="startBtn" class="gp-btn gp-btn-start">&#9654;  Start Translation</button>
        <button id="stopBtn"  class="gp-btn gp-btn-stop" disabled>&#9632;  Stop Translation</button>
      </div>

      <div class="gp-transcript-section">
        <span class="gp-label">Live Transcript</span>
        <div id="gp-transcript" class="gp-transcript">No active session</div>
      </div>

    </div>
  </div>
</div>
`;

// ── 6. Sidebar lifecycle ──────────────────────────────────────────

function createSidebar() {
    sidebarHost = document.createElement('div');
    sidebarHost.id = 'grey-parrot-sidebar-host';

    Object.assign(sidebarHost.style, {
        position: 'fixed',
        top:      '0',
        right:    '0',
        width:    '25vw',
        minWidth: '280px',
        height:   '100vh',
        zIndex:   '2147483647',
        display:  'flex',
    });

    const shadow = sidebarHost.attachShadow({ mode: 'open' });
    shadow.innerHTML = SIDEBAR_TEMPLATE;

    document.body.appendChild(sidebarHost);

    shadow.getElementById('gp-logo-img').src = chrome.runtime.getURL('icons/icon-48.png');

    wireSidebarControls(shadow);
    wireResizeHandle(sidebarHost, shadow);

    // Restore any transcript already in storage
    chrome.storage.local.get(['transcript'], (result) => {
        if (result.transcript && result.transcript.length > 0) {
            displayTranscript(shadow, result.transcript);
        }
    });
}

function wireSidebarControls(shadow) {
    const $ = (id) => shadow.getElementById(id);

    $('closeBtn').addEventListener('click', hideSidebar);

    // Save language prefs whenever they change so the icon-click handler can read them
    const savePrefs = () => chrome.storage.local.set({
        customerLanguage: $('customerLang').value,
        agentLanguage:    $('agentLang').value,
    });
    $('customerLang').addEventListener('change', savePrefs);
    $('agentLang').addEventListener('change', savePrefs);

    // Start button: save prefs and prompt user to click the toolbar icon.
    // tabCapture requires the extension to be "invoked" (toolbar icon click),
    // so the actual start happens in chrome.action.onClicked in background.js.
    $('startBtn').addEventListener('click', () => {
        savePrefs();
        $('gp-status').textContent = 'Click the toolbar icon \u2B06 to activate';
        $('gp-status').className   = 'gp-status inactive';
        $('startBtn').disabled     = true;
    });

    $('stopBtn').addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'STOP_TRANSLATION' });
        $('gp-status').textContent = 'Translation Inactive';
        $('gp-status').className   = 'gp-status inactive';
        $('startBtn').disabled     = false;
        $('stopBtn').disabled      = true;
    });
}

function wireResizeHandle(host, shadow) {
    const handle = shadow.getElementById('resize-handle');
    let dragging = false;
    let startX, startWidth;

    handle.addEventListener('mousedown', (e) => {
        dragging   = true;
        startX     = e.clientX;
        startWidth = host.offsetWidth;
        handle.classList.add('dragging');
        e.preventDefault();
    });

    // Listeners on document so the mouse can travel outside the shadow DOM
    document.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        // Dragging left → sidebar gets wider; dragging right → narrower
        const delta    = startX - e.clientX;
        const newWidth = Math.max(280, Math.min(window.innerWidth * 0.6, startWidth + delta));
        host.style.width = newWidth + 'px';
        document.documentElement.style.marginRight = newWidth + 'px';
    });

    document.addEventListener('mouseup', () => {
        if (dragging) {
            dragging = false;
            handle.classList.remove('dragging');
        }
    });
}

function displayTranscript(shadow, transcript) {
    if (!transcript || transcript.length === 0) return;
    const el = shadow.getElementById('gp-transcript');
    if (!el) return;

    el.innerHTML = transcript.map(entry => {
        const isCustomer = entry.speaker === 'customer';
        const label      = isCustomer ? 'Customer' : 'Agent';
        const displayText = isCustomer ? entry.translation : entry.text;
        return `
        <div class="gp-entry">
            <span class="gp-speaker ${entry.speaker}">${label}:</span>
            <span class="gp-original-text">${displayText}</span>
        </div>`;
    }).join('');

    el.scrollTop = el.scrollHeight;
}

function showSidebar() {
    if (!sidebarHost) {
        createSidebar();
    } else {
        sidebarHost.style.display = 'flex';
    }
    document.documentElement.style.marginRight = sidebarHost.offsetWidth + 'px';
}

function hideSidebar() {
    if (sidebarHost) sidebarHost.style.display = 'none';
    document.documentElement.style.marginRight = '';
}

function toggleSidebar() {
    if (!sidebarHost || sidebarHost.style.display === 'none') {
        showSidebar();
    } else {
        hideSidebar();
    }
}

// ── 7. Auto-open on page load (top frame only) ───────────────────
if (isTopFrame) {
    if (document.body) {
        showSidebar();
    } else {
        document.addEventListener('DOMContentLoaded', showSidebar);
    }
}
