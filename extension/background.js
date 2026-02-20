let ws = null;
let isActive = false;
let sessionId = null;

function connectBackend() {
    ws = new WebSocket('ws://localhost:8000/ws/translate');

    ws.onopen = () => {
        console.log('Grey Parrot: Connected to backend');
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === 'TRANSLATED_AUDIO') {
            // Forward translated audio to the active tab's content script
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        type: 'TRANSLATED_AUDIO',
                        audioData: data.audioData
                    });
                }
            });
        }

        if (data.type === 'TRANSCRIPT') {
            // Store transcript for popup to display
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
        console.log('Grey Parrot: WebSocket closed, reconnecting in 2s...');
        setTimeout(connectBackend, 2000);
    };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'START_TRANSLATION') {
        isActive = true;
        sessionId = 'session-' + Date.now();

        if (!ws || ws.readyState !== WebSocket.OPEN) {
            connectBackend();
            // Wait for connection before sending START_SESSION
            setTimeout(() => {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'START_SESSION',
                        sessionId: sessionId,
                        customerLanguage: message.customerLanguage,
                        agentLanguage: message.agentLanguage
                    }));
                }
            }, 1000);
        } else {
            ws.send(JSON.stringify({
                type: 'START_SESSION',
                sessionId: sessionId,
                customerLanguage: message.customerLanguage,
                agentLanguage: message.agentLanguage
            }));
        }

        // Tell content script to start capturing audio
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, { type: 'START_TRANSLATION' });
            }
        });
    }

    if (message.type === 'STOP_TRANSLATION') {
        isActive = false;

        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'END_SESSION',
                sessionId: sessionId
            }));
        }

        // Tell content script to stop capturing audio
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, { type: 'STOP_TRANSLATION' });
            }
        });
    }

    if (message.type === 'TRANSLATE_AUDIO' && isActive && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'AUDIO_CHUNK',
            sessionId: sessionId,
            direction: message.direction,
            audioData: message.audioData
        }));
    }
});

// Initiate connection when service worker starts
connectBackend();
