from deepgram import Deepgram
import asyncio
import numpy as np


class DeepgramService:
    def __init__(self, api_key):
        self.client = Deepgram(api_key)

    async def transcribe(self, audio_data: np.ndarray, language: str) -> str:
        """
        Transcribe audio to text.
        audio_data: numpy array of PCM16 audio
        language: 'es' or 'en'
        returns: transcribed text
        """
        audio_bytes = audio_data.tobytes()

        response = await self.client.transcription.prerecorded(
            {'buffer': audio_bytes, 'mimetype': 'audio/wav'},
            {
                'language': language,
                'model': 'nova-2',
                'punctuate': True,
                'diarize': False
            }
        )

        transcript = response['results']['channels'][0]['alternatives'][0]['transcript']
        return transcript.strip()
