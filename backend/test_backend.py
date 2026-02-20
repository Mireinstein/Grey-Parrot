import asyncio
import numpy as np
import sys
import os

# Add backend directory to path
sys.path.insert(0, os.path.dirname(__file__))

from translation_pipeline import TranslationPipeline


async def test_translation():
    print("Grey Parrot Backend Test")
    print("=" * 40)

    pipeline = TranslationPipeline()

    # Create dummy audio (1 second of silence at 16kHz)
    # In real usage, load an actual Spanish audio file here
    test_audio = np.zeros(16000, dtype=np.int16)

    print("Testing pipeline with dummy audio (es -> en)...")
    print("Note: Dummy audio will likely produce no transcript.")
    print("Replace with real audio for a meaningful test.\n")

    result = await pipeline.process(test_audio, 'es', 'en')

    if result:
        print("Translation successful!")
        print(f"Original:    {result['original_text']}")
        print(f"Translation: {result['translated_text']}")
        print(f"Latency breakdown:")
        print(f"  STT: {result['latency']['stt']:.0f}ms")
        print(f"  LLM: {result['latency']['llm']:.0f}ms")
        print(f"  TTS: {result['latency']['tts']:.0f}ms")
        print(f"  Total: {result['latency']['total']:.0f}ms")
    else:
        print("No result (audio may be too short or silent - this is expected with dummy audio)")
        print("Test infrastructure is working correctly.")


if __name__ == "__main__":
    asyncio.run(test_translation())
