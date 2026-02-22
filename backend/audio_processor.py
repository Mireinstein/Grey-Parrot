import numpy as np
from config import Config


# RMS below this level (on a 16-bit scale) is treated as silence.
# Phone/WebRTC background noise is typically < 200; speech > 800.
SILENCE_RMS_THRESHOLD = 300

# How many consecutive silent chunks before we consider the utterance finished.
# Each ScriptProcessorNode chunk is 4096 samples @ 16 kHz ≈ 256 ms.
# 3 chunks ≈ 768 ms of silence — a natural pause between sentences.
SILENCE_CHUNKS_REQUIRED = 3

# Minimum buffered speech before silence can trigger processing (ms).
# Prevents firing on brief noise blips.
MIN_SPEECH_MS = 600

# Hard cap: always process after this many ms regardless of silence.
MAX_BUFFER_MS = 8000


class AudioProcessor:
    def __init__(self):
        self.buffers = {'customer': [], 'agent': []}
        self.silence_counters = {'customer': 0, 'agent': 0}
        self.sample_rate = Config.SAMPLE_RATE

    def add_chunk(self, direction: str, audio_chunk: np.ndarray):
        self.buffers[direction].append(audio_chunk)

        rms = np.sqrt(np.mean(audio_chunk.astype(np.float32) ** 2))
        if rms < SILENCE_RMS_THRESHOLD:
            self.silence_counters[direction] += 1
        else:
            self.silence_counters[direction] = 0  # reset on any speech

    def is_ready(self, direction: str) -> bool:
        total_samples = sum(len(c) for c in self.buffers[direction])
        duration_ms = (total_samples / self.sample_rate) * 1000

        if duration_ms < MIN_SPEECH_MS:
            return False  # not enough audio yet

        # Fire when speaker pauses or hard cap reached
        pause_detected = self.silence_counters[direction] >= SILENCE_CHUNKS_REQUIRED
        max_reached = duration_ms >= MAX_BUFFER_MS
        return pause_detected or max_reached

    def get_buffer(self, direction: str) -> np.ndarray:
        return np.concatenate(self.buffers[direction])

    def clear_buffer(self, direction: str):
        self.buffers[direction] = []
        self.silence_counters[direction] = 0
