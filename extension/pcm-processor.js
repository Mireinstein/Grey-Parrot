// AudioWorklet processor — runs in the audio rendering thread.
// Converts float32 samples to int16 PCM and posts the buffer back
// to the main thread via MessagePort.
class PCMProcessor extends AudioWorkletProcessor {
    process(inputs) {
        const channel = inputs[0] && inputs[0][0];
        if (!channel) return true;

        const pcm16 = new Int16Array(channel.length);
        for (let i = 0; i < channel.length; i++) {
            const s = Math.max(-1, Math.min(1, channel[i]));
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
        return true;
    }
}

registerProcessor('pcm-processor', PCMProcessor);
