// Inject script into page context so it can access WebRTC APIs
const script = document.createElement('script');
script.src = chrome.runtime.getURL('inject.js');
(document.head || document.documentElement).appendChild(script);
script.onload = () => script.remove();

// Forward audio chunks from page to background service worker
window.addEventListener('message', (event) => {
    if (event.source !== window) return;

    if (event.data.type === 'AUDIO_CHUNK') {
        chrome.runtime.sendMessage({
            type: 'TRANSLATE_AUDIO',
            direction: event.data.direction,
            audioData: event.data.audioData
        });
    }
});

// Listen for translated audio from background and pass to inject.js
chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'TRANSLATED_AUDIO') {
        window.postMessage({
            type: 'INJECT_AUDIO',
            audioData: message.audioData
        }, '*');
    }

    if (message.type === 'START_TRANSLATION') {
        window.postMessage({ type: 'START_TRANSLATION' }, '*');
    }

    if (message.type === 'STOP_TRANSLATION') {
        window.postMessage({ type: 'STOP_TRANSLATION' }, '*');
    }
});
