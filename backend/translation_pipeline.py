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

    async def process(self, audio_data: np.ndarray, source_lang: str, target_lang: str):
        """
        Full pipeline: PCM16 audio in → translated PCM16 audio out.

        Returns a dict with original text, translation, audio array, and
        per-stage latency, or None when the transcript is too short to process.
        """
        try:
            # Step 1 + 2: STT and translation in a single Deepgram Listen call
            start_time = datetime.now()
            result = await self.deepgram.transcribe_and_translate(audio_data, source_lang)
            stt_translate_latency = (datetime.now() - start_time).total_seconds() * 1000

            original_text = result['transcript']
            translated_text = result['translation']

            if not original_text or len(original_text.strip()) < 3:
                return None  # Skip empty / noise-only audio

            # Step 3: TTS via Deepgram Aura (synthesises the translated text)
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
