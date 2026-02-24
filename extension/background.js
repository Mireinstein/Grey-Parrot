let ws = null;
let isActive = false;
let sessionId = null;
let activeTabId = null;
let pendingStreamId = null;   // held until offscreen signals it's ready

// Send to the known CCP tab only; swallow the error if content script isn't ready
function sendToTab(message) {
    if (!activeTabId) return;
    chrome.tabs.sendMessage(activeTabId, message, () => {
        if (chrome.runtime.lastError) {
            // Content script not present on this tab — ignore silently
        }
    });
}

// Extension icon click:
//  • On the CCP tab and idle  → START translation (tabCapture works here because
//    Chrome counts action.onClicked as "invoking" the extension for that tab)
//  • On any tab while active  → STOP translation
//  • Otherwise                → toggle sidebar
chrome.action.onClicked.addListener(async (tab) => {
    const isCcpTab = tab.url && /\.my\.connect\.aws/.test(tab.url);

    if (isActive) {
        // Stop — works regardless of current tab
        isActive = false;
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'END_SESSION', sessionId }));
            ws.close();
        }
        sendToTab({ type: 'STOP_TRANSLATION' });
        stopOffscreenCapture();
        chrome.action.setBadgeText({ text: '' });
        activeTabId = null;

    } else if (isCcpTab) {
        // Start on the CCP tab — read language prefs saved by the sidebar
        const prefs = await chrome.storage.local.get(['customerLanguage', 'agentLanguage']);
        const customerLanguage = prefs.customerLanguage || 'es';
        const agentLanguage    = prefs.agentLanguage    || 'en';

        isActive    = true;
        sessionId   = 'session-' + Date.now();
        activeTabId = tab.id;

        // Start agent mic immediately
        sendToTab({ type: 'START_TRANSLATION' });

        // Start customer audio capture — tabCapture is allowed here because this
        // handler IS the extension invocation Chrome requires.
        chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id }, (streamId) => {
            if (chrome.runtime.lastError || !streamId) {
                console.error('Grey Parrot: tabCapture.getMediaStreamId failed —',
                    chrome.runtime.lastError?.message ?? 'no stream ID');
                return;
            }
            startOffscreenCapture(streamId);
        });

        connectBackend(customerLanguage, agentLanguage);
        chrome.action.setBadgeText({ text: '⬤', tabId: tab.id });
        chrome.action.setBadgeBackgroundColor({ color: '#2ecc71', tabId: tab.id });

    } else {
        // Not on CCP page — just toggle the sidebar
        chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_SIDEBAR' }, () => {
            if (chrome.runtime.lastError) {}
        });
    }
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

        if (data.type === 'TTS_AUDIO') {
            sendToTab({ type: 'TTS_AUDIO', audio: data.audio });
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

async function startOffscreenCapture(streamId) {
    // Only one offscreen document allowed at a time
    const existing = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
    });

    if (existing.length > 0) {
        // Document already running — listener is registered, send immediately
        chrome.runtime.sendMessage({ type: 'CAPTURE_CUSTOMER_AUDIO', tabAudioStreamId: streamId });
    } else {
        // Store the stream ID; offscreen.js will signal OFFSCREEN_READY once its
        // listener is registered, and we'll send CAPTURE_CUSTOMER_AUDIO then.
        pendingStreamId = streamId;
        await chrome.offscreen.createDocument({
            url:           'offscreen.html',
            reasons:       ['USER_MEDIA'],
            justification: 'Capture customer audio from CCP tab',
        });
        // CAPTURE_CUSTOMER_AUDIO is sent from the OFFSCREEN_READY handler below
    }
}

async function stopOffscreenCapture() {
    chrome.runtime.sendMessage({ type: 'STOP_CUSTOMER_AUDIO' });
    const existing = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
    });
    if (existing.length > 0) {
        await chrome.offscreen.closeDocument();
    }
}

chrome.runtime.onMessage.addListener((message, sender) => {
    // Offscreen document signals that its onMessage listener is registered
    if (message.type === 'OFFSCREEN_READY') {
        if (pendingStreamId) {
            chrome.runtime.sendMessage({ type: 'CAPTURE_CUSTOMER_AUDIO', tabAudioStreamId: pendingStreamId });
            pendingStreamId = null;
        }
    }

    if (message.type === 'STOP_TRANSLATION') {
        isActive = false;

        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'END_SESSION', sessionId }));
            ws.close();
        }

        sendToTab({ type: 'STOP_TRANSLATION' });
        stopOffscreenCapture();
        chrome.action.setBadgeText({ text: '' });
        activeTabId = null;
    }

    // Audio from agent mic (inject.js → content.js → here)
    if (message.type === 'TRANSLATE_AUDIO' && isActive && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'AUDIO_CHUNK',
            sessionId,
            direction: message.direction,
            audioData: message.audioData
        }));
    }

    // Audio from customer (offscreen.js → here)
    if (message.type === 'CUSTOMER_AUDIO_CHUNK' && isActive && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'AUDIO_CHUNK',
            sessionId,
            direction: 'customer',
            audioData: message.audioData
        }));
    }
});
