import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    # API Keys
    DEEPGRAM_API_KEY = os.getenv('DEEPGRAM_API_KEY')

    # Audio Settings
    SAMPLE_RATE = 16000
    CHUNK_SIZE = 4096
    BUFFER_DURATION_MS = 500  # Process every 500ms

    # Server Settings
    HOST = '0.0.0.0'
    PORT = 8000
