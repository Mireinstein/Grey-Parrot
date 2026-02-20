import asyncio
import numpy as np
from datetime import datetime
from services.deepgram_service import DeepgramService
from services.claude_service import ClaudeService
from services.elevenlabs_service import ElevenLabsService
from config import Config


class TranslationPipeline:
    def __init__(self):
        self.deepgram = DeepgramService(Config.DEEPGRAM_API_KEY)
        self.claude = ClaudeService(Config.ANTHROPIC_API_KEY)
        self.elevenlabs = ElevenLabsService(Config.ELEVENLABS_API_KEY)

    async def process(self, audio_data: np.ndarray, source_lang: str, target_lang: str):
        """
        Full translation pipeline: audio in -> audio out.
        Returns dict with original text, translation, and audio.
        """
        try:
            # Step 1: Speech to Text
            start_time = datetime.now()
            text = await self.deepgram.transcribe(audio_data, source_lang)
            stt_latency = (datetime.now() - start_time).total_seconds() * 1000

            if not text or len(text.strip()) < 3:
                return None  # Skip empty/very short transcriptions

            # Step 2: Translate
            start_time = datetime.now()
            translated_text = self.claude.translate(text, source_lang, target_lang)
            llm_latency = (datetime.now() - start_time).total_seconds() * 1000

            # Step 3: Text to Speech
            start_time = datetime.now()
            audio_bytes = self.elevenlabs.synthesize(translated_text, target_lang)
            tts_latency = (datetime.now() - start_time).total_seconds() * 1000

            # Convert bytes to numpy array
            audio_array = np.frombuffer(audio_bytes, dtype=np.int16)

            return {
                'original_text': text,
                'translated_text': translated_text,
                'audio': audio_array,
                'latency': {
                    'stt': stt_latency,
                    'llm': llm_latency,
                    'tts': tts_latency,
                    'total': stt_latency + llm_latency + tts_latency
                },
                'timestamp': datetime.now().isoformat()
            }

        except Exception as e:
            print(f"Pipeline error: {e}")
            return None
