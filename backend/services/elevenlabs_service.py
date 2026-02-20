from elevenlabs import generate, set_api_key
import numpy as np


class ElevenLabsService:
    def __init__(self, api_key):
        set_api_key(api_key)

        # Voice IDs for different languages
        self.voices = {
            'en': '21m00Tcm4TlvDq8ikWAM',  # Rachel
            'es': 'EXAVITQu4vr4xnSDxMaL',  # Bella
            'fr': 'ErXwobaYiN019PkySvjV',   # Antoni
        }

    def synthesize(self, text: str, language: str) -> bytes:
        """
        Convert text to speech.
        returns: audio bytes
        """
        voice_id = self.voices.get(language, self.voices['en'])

        audio = generate(
            text=text,
            voice=voice_id,
            model="eleven_turbo_v2"
        )

        return audio
