import numpy as np
from config import Config


class AudioProcessor:
    def __init__(self):
        self.buffers = {
            'customer': [],
            'agent': []
        }
        self.buffer_duration_ms = Config.BUFFER_DURATION_MS
        self.sample_rate = Config.SAMPLE_RATE

    def add_chunk(self, direction: str, audio_chunk: np.ndarray):
        """Add audio chunk to buffer"""
        self.buffers[direction].append(audio_chunk)

    def is_ready(self, direction: str) -> bool:
        """Check if buffer has enough audio to process"""
        total_samples = sum(len(chunk) for chunk in self.buffers[direction])
        duration_ms = (total_samples / self.sample_rate) * 1000
        return duration_ms >= self.buffer_duration_ms

    def get_buffer(self, direction: str) -> np.ndarray:
        """Get concatenated buffer"""
        return np.concatenate(self.buffers[direction])

    def clear_buffer(self, direction: str):
        """Clear buffer after processing"""
        self.buffers[direction] = []
