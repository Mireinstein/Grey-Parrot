let ws = null;
let isActive = false;
let sessionId = null;
let activeTabId = null;  // track the CCP tab so we never message the wrong tab

// Send to the known CCP tab only; swallow the error if content script isn't ready
function sendToTab(message) {
    if (!activeTabId) return;
    chrome.tabs.sendMessage(activeTabId, message, () => {
        if (chrome.runtime.lastError) {
            // Content script not present on this tab — ignore silently
        }
    });
}

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

        if (data.type === 'TRANSLATED_AUDIO') {
            sendToTab({ type: 'TRANSLATED_AUDIO', audioData: data.audioData });
        }

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

    // Only reconnect while a session is active
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

        // Remember which tab to talk to (the tab that sent the message via popup)
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                activeTabId = tabs[0].id;
                sendToTab({ type: 'START_TRANSLATION' });
            }
        });

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
