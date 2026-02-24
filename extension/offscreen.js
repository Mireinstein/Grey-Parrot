// Offscreen document — runs as a real extension page so getUserMedia with
// chromeMediaSource:'tab' works without CSP or context restrictions.

let audioCtx  = null;
let processor = null;

chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'CAPTURE_CUSTOMER_AUDIO') {
        captureAudio(message.tabAudioStreamId);
    }
    if (message.type === 'STOP_CUSTOMER_AUDIO') {
        cleanup();
    }
});

// Signal background that our listener is registered and we're ready to
// receive CAPTURE_CUSTOMER_AUDIO. This eliminates the race condition where
// the background sent the message before this listener was set up.
chrome.runtime.sendMessage({ type: 'OFFSCREEN_READY' });

function sendChunk(pcm16) {
    chrome.runtime.sendMessage({ type: 'CUSTOMER_AUDIO_CHUNK', audioData: Array.from(pcm16) });
}

async function captureAudio(streamId) {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                mandatory: {
                    chromeMediaSource: 'tab',
                    chromeMediaSourceId: streamId,
                }
            },
            video: false,
        });

        audioCtx = new AudioContext({ sampleRate: 16000 });
        const source = audioCtx.createMediaStreamSource(stream);

        // Try AudioWorklet; fall back to ScriptProcessorNode
        let useWorklet = false;
        try {
            await audioCtx.audioWorklet.addModule(chrome.runtime.getURL('pcm-processor.js'));
            useWorklet = true;
        } catch (_) {}

        if (useWorklet) {
            const node = new AudioWorkletNode(audioCtx, 'pcm-processor');
            node.port.onmessage = (e) => sendChunk(new Int16Array(e.data));
            source.connect(node);
            node.connect(audioCtx.destination);
            processor = node;
        } else {
            const node = audioCtx.createScriptProcessor(4096, 1, 1);
            node.onaudioprocess = (e) => {
                const float32 = e.inputBuffer.getChannelData(0);
                const pcm16   = new Int16Array(float32.length);
                for (let i = 0; i < float32.length; i++) {
                    const s = Math.max(-1, Math.min(1, float32[i]));
                    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                }
                sendChunk(pcm16);
            };
            source.connect(node);
            node.connect(audioCtx.destination);
            processor = node;
        }
    } catch (e) {
        console.error('Grey Parrot offscreen: capture failed', e);
    }
}

function cleanup() {
    if (processor) { processor.disconnect(); processor = null; }
    if (audioCtx)  { audioCtx.close();       audioCtx  = null; }
}
