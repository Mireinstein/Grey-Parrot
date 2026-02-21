import io
import wave
import numpy as np
import httpx
from deepgram import DeepgramClient, SpeakOptions


# Deepgram Aura TTS voice — English only (Aura does not yet ship Spanish voices).
# The pipeline translates non-English speech to English text via Deepgram's
# translate parameter, then synthesises that English text with Aura.
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
    Handles all three pipeline stages using Deepgram APIs only:

      STT + Translation  →  Listen API (nova-2) with translate=True
      TTS               →  Speak API  (Aura)

    Translation note:
      Deepgram's translate parameter converts non-English audio to an English
      transcript in a single API call.  For English → target-language calls the
      English transcript passes through unchanged and is synthesised directly.
    """

    def __init__(self, api_key: str):
        self.api_key = api_key
        self.client = DeepgramClient(api_key)

    # ------------------------------------------------------------------ #
    #  STT + Translation (one Deepgram Listen API call)                   #
    # ------------------------------------------------------------------ #

    async def transcribe_and_translate(
        self, audio_data: np.ndarray, source_lang: str
    ) -> dict:
        """
        Transcribe audio and, when the source is non-English, return an
        English translation alongside the original transcript — all in one
        Deepgram Listen API call.

        Returns:
            {
                'transcript':  original-language text,
                'translation': English text (equals transcript when
                               source_lang == 'en'),
            }
        """
        wav_bytes = _numpy_to_wav_bytes(audio_data)
        should_translate = source_lang != 'en'

        params = {'model': 'nova-2', 'language': source_lang, 'punctuate': 'true'}
        if should_translate:
            params['translate'] = 'true'

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

        # Deepgram returns translations as a list under 'translations'
        translations = alt.get('translations') or []
        translated = translations[0].get('transcript', '').strip() if translations else original

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
