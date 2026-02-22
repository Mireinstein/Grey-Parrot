import numpy as np
from datetime import datetime
from services.deepgram_service import DeepgramService
from config import Config


class TranslationPipeline:
    """
    All three stages — STT, translation, and TTS — are handled exclusively
    by Deepgram:

      1. STT + Translation  →  Deepgram Listen API (nova-2, translate=True)
      2. TTS               →  Deepgram Speak API  (Aura)
    """

    def __init__(self):
        self.deepgram = DeepgramService(Config.DEEPGRAM_API_KEY)

    async def process(self, audio_data: np.ndarray, source_lang: str, target_lang: str, synthesize: bool = True):
        """
        STT + translation pipeline. When synthesize=False, skips TTS and
        returns only the text (used for customer→agent where the agent reads
        the translation rather than hearing it).

        Returns a dict with original text, translation, optional audio array,
        and per-stage latency, or None when the transcript is too short.
        """
        try:
            start_time = datetime.now()
            result = await self.deepgram.transcribe_and_translate(audio_data, source_lang)
            stt_translate_latency = (datetime.now() - start_time).total_seconds() * 1000

            original_text = result['transcript']
            translated_text = result['translation']

            if not original_text or len(original_text.strip()) < 3:
                return None  # Skip empty / noise-only audio

            print(f"src={source_lang}→{target_lang} | original: {original_text!r} | translated: {translated_text!r}")

            audio_array = None
            tts_latency = 0

            if synthesize:
                start_time = datetime.now()
                audio_bytes = self.deepgram.synthesize(translated_text)
                tts_latency = (datetime.now() - start_time).total_seconds() * 1000
                audio_array = np.frombuffer(audio_bytes, dtype=np.int16)

            return {
                'original_text': original_text,
                'translated_text': translated_text,
                'audio': audio_array,
                'latency': {
                    'stt_translate': stt_translate_latency,
                    'tts': tts_latency,
                    'total': stt_translate_latency + tts_latency
                },
                'timestamp': datetime.now().isoformat()
            }

        except Exception as e:
            print(f"Pipeline error: {e}")
            return None
