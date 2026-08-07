let ws = null;
let isActive = false;
let sessionId = null;
let activeTabId = null;
let targetLanguage = 'en';
let pendingStreamId = null;   // held until offscreen signals it's ready

function sendToTab(message) {
    if (!activeTabId) return;
    chrome.tabs.sendMessage(activeTabId, message, () => {
        if (chrome.runtime.lastError) {
            // Content script not present on this tab — ignore silently
        }
    });
}

async function startCaptioning(tabId, lang) {
    targetLanguage = lang;
    isActive = true;
    sessionId = 'session-' + Date.now();
    activeTabId = tabId;

    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });

    chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (streamId) => {
        if (chrome.runtime.lastError || !streamId) {
            console.error('Grey Parrot: tabCapture.getMediaStreamId failed —',
                chrome.runtime.lastError?.message ?? 'no stream ID');
            return;
        }
        startOffscreenCapture(streamId);
    });

    connectBackend(lang);
    chrome.action.setBadgeText({ text: '⬤', tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#2ecc71', tabId });
}

function stopCaptioning() {
    isActive = false;

    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'END_SESSION', sessionId }));
        ws.close();
    }
    ws = null;

    sendToTab({ type: 'STOP_OVERLAY' });
    stopOffscreenCapture();
    if (activeTabId) chrome.action.setBadgeText({ text: '', tabId: activeTabId });
    activeTabId = null;
}

function connectBackend(lang) {
    ws = new WebSocket('ws://localhost:8000/ws/translate');

    ws.onopen = () => {
        console.log('Grey Parrot: Connected to backend');
        ws.send(JSON.stringify({
            type: 'START_SESSION',
            sessionId,
            targetLanguage: lang,
        }));
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === 'CAPTION') {
            sendToTab({ type: 'SUBTITLE_UPDATE', text: data.text });
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
            setTimeout(() => connectBackend(targetLanguage), 2000);
        }
    };
}

async function startOffscreenCapture(streamId) {
    const existing = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });

    if (existing.length > 0) {
        chrome.runtime.sendMessage({ type: 'CAPTURE_TAB_AUDIO', tabAudioStreamId: streamId });
    } else {
        // Store the stream ID; offscreen.js signals OFFSCREEN_READY once its
        // listener is registered, and we send CAPTURE_TAB_AUDIO then.
        pendingStreamId = streamId;
        await chrome.offscreen.createDocument({
            url: 'offscreen.html',
            reasons: ['USER_MEDIA'],
            justification: 'Capture tab audio for live subtitle transcription',
        });
    }
}

async function stopOffscreenCapture() {
    chrome.runtime.sendMessage({ type: 'STOP_TAB_AUDIO' });
    const existing = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
    if (existing.length > 0) {
        await chrome.offscreen.closeDocument();
    }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'START') {
        (async () => {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab?.id) await startCaptioning(tab.id, message.targetLanguage);
        })();
    }

    if (message.type === 'STOP') {
        stopCaptioning();
    }

    if (message.type === 'GET_STATUS') {
        sendResponse({ isActive, targetLanguage });
        return true;
    }

    // Offscreen document signals that its onMessage listener is registered
    if (message.type === 'OFFSCREEN_READY') {
        if (pendingStreamId) {
            chrome.runtime.sendMessage({ type: 'CAPTURE_TAB_AUDIO', tabAudioStreamId: pendingStreamId });
            pendingStreamId = null;
        }
    }

    // Audio from offscreen.js
    if (message.type === 'AUDIO_CHUNK' && isActive && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'AUDIO_CHUNK',
            sessionId,
            audioData: message.audioData,
        }));
    }
});
