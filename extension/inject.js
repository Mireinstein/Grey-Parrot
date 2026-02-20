// Runs in page context - has access to WebRTC
console.log('Grey Parrot: Inject script loaded');

let audioContext = null;
let processors = {};
let isTranslating = false;

// Hook getUserMedia (agent's microphone)
const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
navigator.mediaDevices.getUserMedia = async function(...args) {
    const stream = await originalGetUserMedia(...args);

    if (isTranslating) {
        captureAudioStream(stream, 'agent');
    }

    return stream;
};

// Hook RTCPeerConnection (customer's audio)
const originalRTCPeerConnection = window.RTCPeerConnection;
window.RTCPeerConnection = function(...args) {
    const pc = new originalRTCPeerConnection(...args);

    pc.addEventListener('track', (event) => {
        if (event.track.kind === 'audio' && isTranslating) {
            captureAudioStream(event.streams[0], 'customer');
        }
    });

    return pc;
};

function captureAudioStream(stream, direction) {
    if (!audioContext) {
        audioContext = new AudioContext({ sampleRate: 16000 });
    }

    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);

    source.connect(processor);
    processor.connect(audioContext.destination);

    processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = float32ToPCM16(inputData);

        window.postMessage({
            type: 'AUDIO_CHUNK',
            direction: direction,
            audioData: Array.from(pcm16)
        }, '*');
    };

    processors[direction] = { source, processor };
}

function float32ToPCM16(float32Array) {
    const pcm16 = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
        const s = Math.max(-1, Math.min(1, float32Array[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return pcm16;
}

// Listen for commands from content.js
window.addEventListener('message', (event) => {
    if (event.source !== window) return;

    if (event.data.type === 'START_TRANSLATION') {
        isTranslating = true;
        console.log('Grey Parrot: Translation started');
    }

    if (event.data.type === 'STOP_TRANSLATION') {
        isTranslating = false;
        Object.values(processors).forEach(({ source, processor }) => {
            processor.disconnect();
            source.disconnect();
        });
        processors = {};
        console.log('Grey Parrot: Translation stopped');
    }

    if (event.data.type === 'INJECT_AUDIO') {
        playTranslatedAudio(event.data.audioData);
    }
});

function playTranslatedAudio(audioData) {
    if (!audioContext) return;

    const buffer = audioContext.createBuffer(1, audioData.length, 16000);
    const channelData = buffer.getChannelData(0);

    for (let i = 0; i < audioData.length; i++) {
        channelData[i] = audioData[i] / 32768.0;
    }

    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    source.start();
}
