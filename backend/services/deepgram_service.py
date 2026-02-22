import asyncio
import io
import wave
import numpy as np
import httpx
from deep_translator import GoogleTranslator
from deepgram import DeepgramClient, SpeakOptions


# Deepgram Aura TTS voice — English only (Aura does not yet ship Spanish voices).
# STT is handled by nova-2; translation by Google Translate (deep_translator).
VOICE = 'aura-asteria-en'


def _numpy_to_wav_bytes(audio_data: np.ndarray, sample_rate: int = 16000) -> bytes:
    """Wrap a PCM16 numpy array in a WAV container for the Deepgram Listen API."""
    buf = io.BytesIO()
    with wave.open(buf, 'wb') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)   # 16-bit = 2 bytes
        wf.setframerate(sample_rate)
        wf.writeframes(audio_data.tobytes())
    return buf.getvalue()


class DeepgramService:
    """
    STT  →  Deepgram Listen API (nova-2)
    Translation  →  Google Translate via deep_translator (no API key required)
    TTS  →  Deepgram Speak API (Aura)
    """

    def __init__(self, api_key: str):
        self.api_key = api_key
        self.client = DeepgramClient(api_key)

    # ------------------------------------------------------------------ #
    #  STT (Deepgram nova-2) + Translation (Google Translate)             #
    # ------------------------------------------------------------------ #

    async def transcribe_and_translate(
        self, audio_data: np.ndarray, source_lang: str
    ) -> dict:
        """
        Transcribe audio with Deepgram nova-2, then translate to English
        with Google Translate when the source is non-English.

        Returns:
            {
                'transcript':  original-language text,
                'translation': English text (equals transcript when source_lang == 'en'),
            }
        """
        wav_bytes = _numpy_to_wav_bytes(audio_data)
        params = {'model': 'nova-2', 'language': source_lang, 'punctuate': 'true'}

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                'https://api.deepgram.com/v1/listen',
                headers={
                    'Authorization': f'Token {self.api_key}',
                    'Content-Type': 'audio/wav',
                },
                content=wav_bytes,
                params=params,
                timeout=30.0,
            )
            resp.raise_for_status()
            data = resp.json()

        alt = data['results']['channels'][0]['alternatives'][0]
        original = alt.get('transcript', '').strip()

        if source_lang != 'en' and original:
            loop = asyncio.get_event_loop()
            translated = await loop.run_in_executor(
                None,
                lambda: GoogleTranslator(source=source_lang, target='en').translate(original)
            )
        else:
            translated = original

        return {'transcript': original, 'translation': translated}

    # ------------------------------------------------------------------ #
    #  TTS  (Deepgram Aura Speak API)                                     #
    # ------------------------------------------------------------------ #

    def synthesize(self, text: str) -> bytes:
        """
        Synthesise text to speech using Deepgram Aura and return raw PCM16
        audio bytes at 16 kHz.
        """
        options = SpeakOptions(
            model=VOICE,
            encoding='linear16',
            sample_rate=16000,
        )

        response = self.client.speak.rest.v('1').stream_memory(
            {'text': text},
            options,
        )

        return response.stream_memory.read()
