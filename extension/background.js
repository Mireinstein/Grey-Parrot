let ws = null;
let isActive = false;
let sessionId = null;
let activeTabId = null;

// Send to the known CCP tab only; swallow the error if content script isn't ready
function sendToTab(message) {
    if (!activeTabId) return;
    chrome.tabs.sendMessage(activeTabId, message, () => {
        if (chrome.runtime.lastError) {
            // Content script not present on this tab — ignore silently
        }
    });
}

// Toggle the sidebar when the extension icon is clicked (no popup configured)
chrome.action.onClicked.addListener((tab) => {
    chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_SIDEBAR' }, () => {
        if (chrome.runtime.lastError) {
            // Content script not injected on this page
        }
    });
});

function connectBackend(customerLanguage, agentLanguage) {
    ws = new WebSocket('ws://localhost:8000/ws/translate');

    ws.onopen = () => {
        console.log('Grey Parrot: Connected to backend');
        ws.send(JSON.stringify({
            type: 'START_SESSION',
            sessionId: sessionId,
            customerLanguage,
            agentLanguage
        }));
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === 'TRANSCRIPT') {
            chrome.storage.local.set({ transcript: data.transcript });
        }

        if (data.type === 'SESSION_STARTED') {
            console.log('Grey Parrot: Session started', data.sessionId);
        }

        if (data.type === 'SESSION_ENDED') {
            console.log('Grey Parrot: Session ended', data.sessionId);
        }
    };

    ws.onerror = (error) => console.error('Grey Parrot: WebSocket error', error);

    ws.onclose = () => {
        if (isActive) {
            console.log('Grey Parrot: WebSocket closed, reconnecting in 2s...');
            setTimeout(() => connectBackend(customerLanguage, agentLanguage), 2000);
        }
    };
}

chrome.runtime.onMessage.addListener((message, sender) => {
    if (message.type === 'START_TRANSLATION') {
        isActive = true;
        sessionId = 'session-' + Date.now();

        if (sender.tab) {
            // Message came from content script (sidebar) — use that tab directly
            activeTabId = sender.tab.id;
            sendToTab({ type: 'START_TRANSLATION' });
        } else {
            // Fallback: query the active tab (e.g. if popup is still used)
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]) {
                    activeTabId = tabs[0].id;
                    sendToTab({ type: 'START_TRANSLATION' });
                }
            });
        }

        connectBackend(message.customerLanguage, message.agentLanguage);
    }

    if (message.type === 'STOP_TRANSLATION') {
        isActive = false;

        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'END_SESSION', sessionId }));
            ws.close();
        }

        sendToTab({ type: 'STOP_TRANSLATION' });
        activeTabId = null;
    }

    if (message.type === 'TRANSLATE_AUDIO' && isActive && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'AUDIO_CHUNK',
            sessionId,
            direction: message.direction,
            audioData: message.audioData
        }));
    }
});
