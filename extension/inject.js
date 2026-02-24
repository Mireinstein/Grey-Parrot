// Runs in page context - has access to WebRTC
console.log('Grey Parrot: Inject script loaded');

// ── Hook RTCPeerConnection so we can replace the mic track with TTS ──
const _OriginalRTCPeerConnection = window.RTCPeerConnection;
const _trackedPCs = new Set();
class RTCPeerConnection extends _OriginalRTCPeerConnection {
    constructor(...args) {
        super(...args);
        _trackedPCs.add(this);
        this.addEventListener('connectionstatechange', () => {
            if (this.connectionState === 'closed' || this.connectionState === 'failed') {
                _trackedPCs.delete(this);
            }
        });
    }
}
Object.defineProperty(RTCPeerConnection, 'name', { value: 'RTCPeerConnection' });
window.RTCPeerConnection = RTCPeerConnection;

let audioContext  = null;
let workletReady  = false;
let useWorklet    = false;   // true once AudioWorkletNode confirmed working
let processors    = {};
let isTranslating = false;
let pendingStreams = { agent: null };

// ── TTS injection state ───────────────────────────────────────────
let ttsCtx         = null;   // AudioContext for TTS playback
let ttsDest        = null;   // MediaStreamDestination → feeds WebRTC sender
let ttsSender      = null;   // the RTCRtpSender whose track we replaced
let originalTrack  = null;   // saved mic track, restored on stop

async function startTTSInjection() {
    ttsCtx = new AudioContext();
    ttsDest = ttsCtx.createMediaStreamDestination();

    for (const pc of _trackedPCs) {
        const audioSender = pc.getSenders().find(s => s.track && s.track.kind === 'audio');
        if (audioSender) {
            originalTrack = audioSender.track;
            ttsSender     = audioSender;
            await audioSender.replaceTrack(ttsDest.stream.getAudioTracks()[0]);
            console.log('Grey Parrot: WebRTC mic replaced with TTS stream');
            break;
        }
    }
}

async function stopTTSInjection() {
    if (ttsSender && originalTrack) {
        await ttsSender.replaceTrack(originalTrack);
    }
    ttsSender = null; originalTrack = null;
    if (ttsCtx) { await ttsCtx.close(); ttsCtx = null; }
    ttsDest = null;
}

async function playTTSChunk(base64Mp3) {
    if (!ttsCtx || !ttsDest) return;
    const binary = atob(base64Mp3);
    const bytes  = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    try {
        const buf = await ttsCtx.decodeAudioData(bytes.buffer);
        const src = ttsCtx.createBufferSource();
        src.buffer = buf;
        src.connect(ttsDest);   // routes audio into the WebRTC sender track
        src.start();
    } catch (e) {
        console.error('Grey Parrot: TTS decode failed', e);
    }
}

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

        // Agent mic — captured via getUserMedia hook
        if (pendingStreams.agent && !processors.agent) {
            await captureAudioStream(pendingStreams.agent, 'agent');
        }

        await startTTSInjection();
    }

    if (event.data.type === 'STOP_TRANSLATION') {
        isTranslating = false;
        Object.values(processors).forEach(({ source, node }) => {
            node.disconnect();
            source.disconnect();
        });
        processors = {};
        await stopTTSInjection();
        console.log('Grey Parrot: Translation stopped');
    }

    if (event.data.type === 'TTS_AUDIO') {
        await playTTSChunk(event.data.audio);
    }
});
