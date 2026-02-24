// Runs in page context - has access to WebRTC
console.log('Grey Parrot: Inject script loaded');

let audioContext  = null;
let workletReady  = false;
let useWorklet    = false;   // true once AudioWorkletNode confirmed working
let processors    = {};
let isTranslating = false;
let pendingStreams = { agent: null, customer: null };

// ── AudioContext + worklet setup ──────────────────────────────────
// __gpWorkletUrl is set by content.js (chrome.runtime.getURL) before
// this script loads — gives us a chrome-extension:// URL that avoids
// the blob: CSP restriction on the CCP page.
async function ensureAudioContext() {
    if (!audioContext) {
        audioContext = new AudioContext({ sampleRate: 16000 });
    }

    if (!workletReady) {
        const url = window.__gpWorkletUrl;
        if (url) {
            try {
                await audioContext.audioWorklet.addModule(url);
                useWorklet   = true;
                workletReady = true;
                console.log('Grey Parrot: AudioWorkletNode active');
            } catch (e) {
                // Page CSP may still block chrome-extension:// URLs;
                // fall back to ScriptProcessorNode (deprecated but functional).
                console.warn('Grey Parrot: AudioWorklet blocked, falling back to ScriptProcessorNode', e);
                useWorklet   = false;
                workletReady = true;
            }
        } else {
            useWorklet   = false;
            workletReady = true;
        }
    }
}

// ── Hook getUserMedia (agent's microphone) ────────────────────────
const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
navigator.mediaDevices.getUserMedia = async function(...args) {
    const stream = await originalGetUserMedia(...args);

    if (stream.getAudioTracks().length > 0) {
        pendingStreams.agent = stream;
        if (isTranslating) {
            await captureAudioStream(stream, 'agent');
        }
    }

    return stream;
};

// ── Hook RTCPeerConnection (customer's audio) ─────────────────────
const originalRTCPeerConnection = window.RTCPeerConnection;
window.RTCPeerConnection = function(...args) {
    const pc = new originalRTCPeerConnection(...args);

    pc.addEventListener('track', async (event) => {
        if (event.track.kind === 'audio') {
            const stream = new MediaStream([event.track]);
            pendingStreams.customer = stream;
            if (isTranslating) {
                await captureAudioStream(stream, 'customer');
            }
        }
    });

    return pc;
};

// ── Capture a stream ──────────────────────────────────────────────
async function captureAudioStream(stream, direction) {
    if (!stream || stream.getAudioTracks().length === 0) {
        console.warn('Grey Parrot: no audio tracks in', direction, 'stream — skipping');
        return;
    }

    await ensureAudioContext();

    const source = audioContext.createMediaStreamSource(stream);

    if (useWorklet) {
        // ── Modern path: AudioWorkletNode ──
        const workletNode = new AudioWorkletNode(audioContext, 'pcm-processor');

        workletNode.port.onmessage = (event) => {
            const pcm16 = new Int16Array(event.data);
            window.postMessage({
                type:      'AUDIO_CHUNK',
                direction,
                audioData: Array.from(pcm16)
            }, '*');
        };

        source.connect(workletNode);
        workletNode.connect(audioContext.destination);
        processors[direction] = { source, node: workletNode };

    } else {
        // ── Fallback path: ScriptProcessorNode ──
        const processor = audioContext.createScriptProcessor(4096, 1, 1);

        processor.onaudioprocess = (e) => {
            const float32 = e.inputBuffer.getChannelData(0);
            const pcm16   = new Int16Array(float32.length);
            for (let i = 0; i < float32.length; i++) {
                const s = Math.max(-1, Math.min(1, float32[i]));
                pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }
            window.postMessage({
                type:      'AUDIO_CHUNK',
                direction,
                audioData: Array.from(pcm16)
            }, '*');
        };

        source.connect(processor);
        processor.connect(audioContext.destination);
        processors[direction] = { source, node: processor };
    }
}

// ── Listen for commands from content.js ──────────────────────────
window.addEventListener('message', async (event) => {
    if (event.source !== window) return;

    if (event.data.type === 'START_TRANSLATION') {
        isTranslating = true;
        console.log('Grey Parrot: Translation started');

        if (pendingStreams.agent && !processors.agent) {
            await captureAudioStream(pendingStreams.agent, 'agent');
        }
        if (pendingStreams.customer && !processors.customer) {
            await captureAudioStream(pendingStreams.customer, 'customer');
        }
    }

    if (event.data.type === 'STOP_TRANSLATION') {
        isTranslating = false;
        Object.values(processors).forEach(({ source, node }) => {
            node.disconnect();
            source.disconnect();
        });
        processors = {};
        console.log('Grey Parrot: Translation stopped');
    }
});
