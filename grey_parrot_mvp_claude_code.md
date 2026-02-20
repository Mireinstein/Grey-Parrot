# Grey Parrot MVP - Specification for Claude Code
## Browser Extension for Real-Time Call Translation

---

## PROJECT OVERVIEW

Build Grey Parrot as a **Chrome Extension** that provides real-time bidirectional speech translation (Spanish ↔ English) for contact center agents using browser-based softphones.

**Target Users:** Contact center agents using Amazon Connect CCP, Five9, Genesys Cloud, or similar browser-based softphones

**Goal:** Prove that real-time translation works with <2 second latency and acceptable quality

---

## DELIVERABLES

### Primary Deliverable: Chrome Extension
- Hooks into browser-based softphone audio
- Captures customer and agent audio streams
- Sends to translation backend via WebSocket
- Plays translated audio back
- Shows real-time transcript

### Secondary Deliverable: Translation Backend
- FastAPI server with WebSocket endpoint
- STT → LLM → TTS translation pipeline
- Handles bidirectional audio streaming

---

## TECHNICAL STACK

### Frontend (Chrome Extension)
- **Language:** JavaScript (vanilla, no frameworks for MVP)
- **APIs:** Chrome Extension APIs, WebRTC API, Web Audio API
- **WebSocket:** Native WebSocket for backend communication

### Backend
- **Language:** Python 3.11+
- **Framework:** FastAPI
- **APIs:**
  - Deepgram (Speech-to-Text)
  - Anthropic Claude (Translation)
  - ElevenLabs (Text-to-Speech)

---

## ARCHITECTURE

```
┌─────────────────────────────────────────────────────┐
│                    Browser                          │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │  Softphone (Amazon Connect CCP / Five9)     │  │
│  │                                             │  │
│  │  WebRTC Audio: Customer ←→ Agent           │  │
│  └──────────────┬─────────────────────────────┘  │
│                 │                                  │
│  ┌──────────────▼──────────────────────────────┐  │
│  │      Grey Parrot Extension                  │  │
│  │                                             │  │
│  │  inject.js: Captures audio streams         │  │
│  │  content.js: Bridges page ↔ extension      │  │
│  │  background.js: WebSocket to backend       │  │
│  │  popup.js: UI controls                     │  │
│  └──────────────┬──────────────────────────────┘  │
└─────────────────┼──────────────────────────────────┘
                  │ WebSocket
                  ▼
    ┌─────────────────────────────────┐
    │   Translation Backend (Python)  │
    │                                 │
    │   WebSocket Handler             │
    │         ↓                       │
    │   Audio Buffer                  │
    │         ↓                       │
    │   ┌────────────────────────┐   │
    │   │  Translation Pipeline  │   │
    │   │                        │   │
    │   │  STT (Deepgram)        │   │
    │   │    ↓                   │   │
    │   │  LLM (Claude)          │   │
    │   │    ↓                   │   │
    │   │  TTS (ElevenLabs)      │   │
    │   └────────────────────────┘   │
    │         ↓                       │
    │   Translated Audio Out          │
    └─────────────────────────────────┘
```

---

## FILE STRUCTURE

```
grey-parrot/
│
├── extension/                      # Chrome Extension
│   ├── manifest.json              # Extension config
│   ├── background.js              # Service worker (WebSocket)
│   ├── content.js                 # Content script (page bridge)
│   ├── inject.js                  # Injected script (audio capture)
│   ├── popup.html                 # Extension popup UI
│   ├── popup.js                   # Popup logic
│   ├── styles/
│   │   └── popup.css
│   └── icons/
│       ├── icon-16.png
│       ├── icon-48.png
│       └── icon-128.png
│
├── backend/                        # Translation Backend
│   ├── main.py                    # FastAPI app
│   ├── translation_pipeline.py    # STT → LLM → TTS
│   ├── audio_processor.py         # Audio buffering/chunking
│   ├── services/
│   │   ├── deepgram_service.py   # Deepgram STT
│   │   ├── claude_service.py     # Claude translation
│   │   └── elevenlabs_service.py # ElevenLabs TTS
│   ├── requirements.txt
│   └── config.py
│
├── .env.example                    # API keys template
├── README.md                       # Setup instructions
└── TESTING.md                      # Test scenarios
```

---

## PHASE 1: TRANSLATION BACKEND (Build This First)

### Goal
Get the STT → LLM → TTS pipeline working end-to-end with test audio files.

### Tasks

#### 1. Set up FastAPI project structure
```bash
mkdir -p backend/services
cd backend
touch main.py translation_pipeline.py audio_processor.py
touch services/deepgram_service.py services/claude_service.py services/elevenlabs_service.py
touch requirements.txt config.py .env
```

#### 2. Create requirements.txt
```
fastapi==0.109.0
uvicorn[standard]==0.27.0
websockets==12.0
python-dotenv==1.0.0
deepgram-sdk==3.2.0
anthropic==0.18.0
elevenlabs==0.2.26
numpy==1.26.3
pydub==0.25.1
scipy==1.11.4
```

#### 3. Create config.py
```python
import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    # API Keys
    DEEPGRAM_API_KEY = os.getenv('DEEPGRAM_API_KEY')
    ANTHROPIC_API_KEY = os.getenv('ANTHROPIC_API_KEY')
    ELEVENLABS_API_KEY = os.getenv('ELEVENLABS_API_KEY')
    
    # Audio Settings
    SAMPLE_RATE = 16000
    CHUNK_SIZE = 4096
    BUFFER_DURATION_MS = 500  # Process every 500ms
    
    # Server Settings
    HOST = '0.0.0.0'
    PORT = 8000
```

#### 4. Implement services/deepgram_service.py
```python
from deepgram import Deepgram
import asyncio
import numpy as np

class DeepgramService:
    def __init__(self, api_key):
        self.client = Deepgram(api_key)
    
    async def transcribe(self, audio_data: np.ndarray, language: str) -> str:
        """
        Transcribe audio to text
        audio_data: numpy array of PCM16 audio
        language: 'es' or 'en'
        returns: transcribed text
        """
        # Convert numpy array to bytes
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
```

#### 5. Implement services/claude_service.py
```python
from anthropic import Anthropic

class ClaudeService:
    def __init__(self, api_key):
        self.client = Anthropic(api_key=api_key)
    
    def translate(self, text: str, source_lang: str, target_lang: str) -> str:
        """
        Translate text using Claude
        """
        lang_names = {
            'es': 'Spanish',
            'en': 'English',
            'fr': 'French',
            'zh': 'Mandarin Chinese'
        }
        
        source = lang_names.get(source_lang, source_lang)
        target = lang_names.get(target_lang, target_lang)
        
        prompt = f"""You are a professional translator for customer support calls.

Translate this {source} text to {target}.

Rules:
1. Maintain tone and formality
2. Keep support terminology accurate
3. Preserve empathy and politeness
4. Return ONLY the translation - no explanations

{source} text:
{text}

{target} translation:"""
        
        message = self.client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=1024,
            temperature=0.3,
            messages=[{"role": "user", "content": prompt}]
        )
        
        return message.content[0].text.strip()
```

#### 6. Implement services/elevenlabs_service.py
```python
from elevenlabs import generate, set_api_key
import numpy as np

class ElevenLabsService:
    def __init__(self, api_key):
        set_api_key(api_key)
        
        # Voice IDs for different languages
        self.voices = {
            'en': '21m00Tcm4TlvDq8ikWAM',  # Rachel
            'es': 'EXAVITQu4vr4xnSDxMaL',  # Bella
            'fr': 'ErXwobaYiN019PkySvjV',  # Antoni
        }
    
    def synthesize(self, text: str, language: str) -> bytes:
        """
        Convert text to speech
        returns: audio bytes (PCM16)
        """
        voice_id = self.voices.get(language, self.voices['en'])
        
        audio = generate(
            text=text,
            voice=voice_id,
            model="eleven_turbo_v2"
        )
        
        return audio
```

#### 7. Implement translation_pipeline.py
```python
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
        Full translation pipeline: audio in → audio out
        Returns dict with original text, translation, and audio
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
```

#### 8. Implement main.py (FastAPI server)
```python
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import json
import numpy as np
from translation_pipeline import TranslationPipeline
from audio_processor import AudioProcessor

app = FastAPI(title="Grey Parrot Translation API")

# CORS for browser extension
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Active sessions
sessions = {}

@app.websocket("/ws/translate")
async def translate_websocket(websocket: WebSocket):
    """Main WebSocket endpoint for real-time translation"""
    await websocket.accept()
    session_id = None
    
    try:
        # Initialize pipeline
        pipeline = TranslationPipeline()
        audio_processor = AudioProcessor()
        
        while True:
            data = await websocket.receive_json()
            
            if data['type'] == 'START_SESSION':
                session_id = data['sessionId']
                customer_lang = data['customerLanguage']
                agent_lang = data['agentLanguage']
                
                sessions[session_id] = {
                    'customer_lang': customer_lang,
                    'agent_lang': agent_lang,
                    'transcript': [],
                    'processor': audio_processor
                }
                
                await websocket.send_json({
                    'type': 'SESSION_STARTED',
                    'sessionId': session_id
                })
            
            elif data['type'] == 'AUDIO_CHUNK' and session_id in sessions:
                # Get session data
                session = sessions[session_id]
                direction = data['direction']  # 'customer' or 'agent'
                audio_array = np.array(data['audioData'], dtype=np.int16)
                
                # Add to buffer
                session['processor'].add_chunk(direction, audio_array)
                
                # Check if ready to process
                if session['processor'].is_ready(direction):
                    # Get buffered audio
                    buffered_audio = session['processor'].get_buffer(direction)
                    
                    # Determine source and target languages
                    if direction == 'customer':
                        source_lang = session['customer_lang']
                        target_lang = session['agent_lang']
                    else:
                        source_lang = session['agent_lang']
                        target_lang = session['customer_lang']
                    
                    # Process through pipeline
                    result = await pipeline.process(
                        buffered_audio,
                        source_lang,
                        target_lang
                    )
                    
                    if result:
                        # Send translated audio back
                        await websocket.send_json({
                            'type': 'TRANSLATED_AUDIO',
                            'direction': 'agent' if direction == 'customer' else 'customer',
                            'audioData': result['audio'].tolist(),
                            'latency': result['latency']
                        })
                        
                        # Send transcript update
                        session['transcript'].append({
                            'speaker': direction,
                            'text': result['original_text'],
                            'translation': result['translated_text'],
                            'timestamp': result['timestamp']
                        })
                        
                        await websocket.send_json({
                            'type': 'TRANSCRIPT',
                            'transcript': session['transcript']
                        })
                    
                    # Clear buffer
                    session['processor'].clear_buffer(direction)
            
            elif data['type'] == 'END_SESSION' and session_id in sessions:
                del sessions[session_id]
                await websocket.send_json({
                    'type': 'SESSION_ENDED',
                    'sessionId': session_id
                })
    
    except WebSocketDisconnect:
        if session_id and session_id in sessions:
            del sessions[session_id]
    except Exception as e:
        print(f"WebSocket error: {e}")

@app.get("/health")
def health():
    return {
        "status": "ok",
        "active_sessions": len(sessions)
    }

if __name__ == "__main__":
    import uvicorn
    from config import Config
    uvicorn.run(app, host=Config.HOST, port=Config.PORT)
```

#### 9. Implement audio_processor.py
```python
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
```

### Testing Backend

Create a test script `test_backend.py`:
```python
import asyncio
import numpy as np
from translation_pipeline import TranslationPipeline

async def test_translation():
    pipeline = TranslationPipeline()
    
    # Load test audio (you'll need a sample Spanish audio file)
    # For now, create dummy audio
    test_audio = np.random.randint(-32768, 32767, 16000, dtype=np.int16)
    
    result = await pipeline.process(test_audio, 'es', 'en')
    
    if result:
        print("✅ Translation successful!")
        print(f"Original: {result['original_text']}")
        print(f"Translation: {result['translated_text']}")
        print(f"Latency: {result['latency']['total']:.0f}ms")
    else:
        print("❌ Translation failed")

if __name__ == "__main__":
    asyncio.run(test_translation())
```

---

## PHASE 2: CHROME EXTENSION (Build After Backend Works)

### Goal
Create browser extension that hooks into softphone audio and connects to backend.

### Tasks

#### 1. Create extension/manifest.json
```json
{
  "manifest_version": 3,
  "name": "Grey Parrot - Real-Time Translation",
  "version": "1.0.0",
  "description": "Real-time bidirectional translation for contact center calls",
  "permissions": ["activeTab", "storage", "tabs"],
  "host_permissions": ["*://*.awsapps.com/*", "http://localhost:8000/*"],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["*://*.awsapps.com/connect/ccp-v2/*"],
      "js": ["content.js"],
      "run_at": "document_start"
    }
  ],
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon-16.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    }
  },
  "web_accessible_resources": [
    {
      "resources": ["inject.js"],
      "matches": ["*://*/*"]
    }
  ]
}
```

#### 2. Create extension/inject.js (Audio Capture)
```javascript
// Runs in page context - has access to WebRTC

console.log('Grey Parrot: Inject script loaded');

let audioContext = null;
let processors = {};
let isTranslating = false;

// Hook getUserMedia (agent's microphone)
const originalGetUserMedia = navigator.mediaDevices.getUserMedia;
navigator.mediaDevices.getUserMedia = async function(...args) {
    const stream = await originalGetUserMedia.apply(this, args);
    
    if (isTranslating) {
        captureAudioStream(stream, 'agent');
    }
    
    return stream;
};

// Hook RTCPeerConnection (customer's audio)
const originalRTCPeerConnection = window.RTCPeerConnection;
window.RTCPeerConnection = function(...args) {
    const pc = new originalRTCPeerConnection(...args);
    
    pc.addEventListener('track', (event) => {
        if (event.track.kind === 'audio' && isTranslating) {
            captureAudioStream(event.streams[0], 'customer');
        }
    });
    
    return pc;
};

function captureAudioStream(stream, direction) {
    if (!audioContext) {
        audioContext = new AudioContext({sampleRate: 16000});
    }
    
    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    
    source.connect(processor);
    processor.connect(audioContext.destination);
    
    processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = float32ToPCM16(inputData);
        
        window.postMessage({
            type: 'AUDIO_CHUNK',
            direction: direction,
            audioData: Array.from(pcm16)
        }, '*');
    };
    
    processors[direction] = processor;
}

function float32ToPCM16(float32Array) {
    const pcm16 = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
        const s = Math.max(-1, Math.min(1, float32Array[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return pcm16;
}

// Listen for commands
window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    
    if (event.data.type === 'START_TRANSLATION') {
        isTranslating = true;
    }
    
    if (event.data.type === 'STOP_TRANSLATION') {
        isTranslating = false;
        Object.values(processors).forEach(p => p.disconnect());
        processors = {};
    }
    
    if (event.data.type === 'INJECT_AUDIO') {
        playTranslatedAudio(event.data.audioData);
    }
});

function playTranslatedAudio(audioData) {
    if (!audioContext) return;
    
    const buffer = audioContext.createBuffer(1, audioData.length, 16000);
    const channelData = buffer.getChannelData(0);
    
    for (let i = 0; i < audioData.length; i++) {
        channelData[i] = audioData[i] / 32768.0;
    }
    
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    source.start();
}
```

#### 3. Create extension/content.js (Bridge)
```javascript
// Inject script into page
const script = document.createElement('script');
script.src = chrome.runtime.getURL('inject.js');
(document.head || document.documentElement).appendChild(script);
script.onload = () => script.remove();

// Forward messages between page and extension
window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    
    if (event.data.type === 'AUDIO_CHUNK') {
        chrome.runtime.sendMessage({
            type: 'TRANSLATE_AUDIO',
            direction: event.data.direction,
            audioData: event.data.audioData
        });
    }
});

// Listen for translated audio from background
chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'TRANSLATED_AUDIO') {
        window.postMessage({
            type: 'INJECT_AUDIO',
            audioData: message.audioData
        }, '*');
    }
});
```

#### 4. Create extension/background.js (WebSocket)
```javascript
let ws = null;
let isActive = false;
let sessionId = null;

function connectBackend() {
    ws = new WebSocket('ws://localhost:8000/ws/translate');
    
    ws.onopen = () => console.log('Connected to backend');
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === 'TRANSLATED_AUDIO') {
            // Forward to content script
            chrome.tabs.query({active: true}, (tabs) => {
                chrome.tabs.sendMessage(tabs[0].id, {
                    type: 'TRANSLATED_AUDIO',
                    audioData: data.audioData
                });
            });
        }
        
        if (data.type === 'TRANSCRIPT') {
            // Store for popup
            chrome.storage.local.set({transcript: data.transcript});
        }
    };
    
    ws.onerror = (error) => console.error('WebSocket error:', error);
    ws.onclose = () => setTimeout(connectBackend, 2000);
}

chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'START_TRANSLATION') {
        isActive = true;
        sessionId = 'session-' + Date.now();
        
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            connectBackend();
        }
        
        setTimeout(() => {
            ws.send(JSON.stringify({
                type: 'START_SESSION',
                sessionId: sessionId,
                customerLanguage: message.customerLanguage,
                agentLanguage: message.agentLanguage
            }));
        }, 500);
    }
    
    if (message.type === 'STOP_TRANSLATION') {
        isActive = false;
        if (ws) {
            ws.send(JSON.stringify({
                type: 'END_SESSION',
                sessionId: sessionId
            }));
        }
    }
    
    if (message.type === 'TRANSLATE_AUDIO' && isActive && ws) {
        ws.send(JSON.stringify({
            type: 'AUDIO_CHUNK',
            sessionId: sessionId,
            direction: message.direction,
            audioData: message.audioData
        }));
    }
});

connectBackend();
```

#### 5. Create extension/popup.html (UI)
```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Grey Parrot</title>
    <link rel="stylesheet" href="styles/popup.css">
</head>
<body>
    <div class="container">
        <div class="header">
            <span class="logo">🦜</span>
            <div>
                <h1>Grey Parrot</h1>
                <p>Real-Time Translation</p>
            </div>
        </div>
        
        <div id="status" class="status inactive">Translation Inactive</div>
        
        <div class="controls">
            <label>Customer Language</label>
            <select id="customerLang">
                <option value="es" selected>Spanish</option>
                <option value="en">English</option>
            </select>
            
            <label>Agent Language</label>
            <select id="agentLang">
                <option value="en" selected>English</option>
                <option value="es">Spanish</option>
            </select>
            
            <button id="startBtn" class="btn-primary">Start Translation</button>
            <button id="stopBtn" class="btn-secondary" disabled>Stop</button>
        </div>
        
        <div class="transcript-section">
            <label>Live Transcript</label>
            <div id="transcript" class="transcript">
                No active session
            </div>
        </div>
    </div>
    
    <script src="popup.js"></script>
</body>
</html>
```

#### 6. Create extension/popup.js
```javascript
const statusEl = document.getElementById('status');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const transcriptEl = document.getElementById('transcript');

startBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({
        type: 'START_TRANSLATION',
        customerLanguage: document.getElementById('customerLang').value,
        agentLanguage: document.getElementById('agentLang').value
    });
    
    statusEl.textContent = 'Translation Active';
    statusEl.className = 'status active';
    startBtn.disabled = true;
    stopBtn.disabled = false;
});

stopBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({type: 'STOP_TRANSLATION'});
    
    statusEl.textContent = 'Translation Inactive';
    statusEl.className = 'status inactive';
    startBtn.disabled = false;
    stopBtn.disabled = true;
});

// Update transcript
chrome.storage.onChanged.addListener((changes) => {
    if (changes.transcript) {
        displayTranscript(changes.transcript.newValue);
    }
});

function displayTranscript(transcript) {
    if (!transcript) return;
    
    transcriptEl.innerHTML = transcript.map(entry => `
        <div class="entry">
            <strong>${entry.speaker}:</strong> ${entry.text}
            <br><em>${entry.translation}</em>
        </div>
    `).join('');
}
```

---

## DEVELOPMENT WORKFLOW (Use with Claude Code)

### Step 1: Backend First
```bash
# Tell Claude Code:
"Build the backend for Grey Parrot following backend/main.py specification. 
Start with the translation pipeline, then build the FastAPI WebSocket server."

# Test it works:
python backend/test_backend.py
python backend/main.py
```

### Step 2: Extension Next
```bash
# Tell Claude Code:
"Build the Chrome extension for Grey Parrot following extension/manifest.json 
specification. Start with audio capture, then WebSocket connection."

# Test it:
# Load extension in Chrome
# Open Amazon Connect CCP test instance
# Click extension, start translation
```

### Step 3: Integration
```bash
# Tell Claude Code:
"Test end-to-end: extension captures audio, backend translates, 
extension plays translated audio. Debug any issues."
```

---

## SUCCESS CRITERIA

✅ **Backend Works:**
- FastAPI server starts without errors
- WebSocket accepts connections
- Test audio processes through STT → LLM → TTS
- Latency < 2 seconds for test audio

✅ **Extension Works:**
- Loads in Chrome without errors
- Detects Amazon Connect CCP page
- Captures audio streams (customer + agent)
- Sends to backend via WebSocket
- Receives and plays translated audio

✅ **End-to-End:**
- Spanish audio → English audio (customer to agent)
- English audio → Spanish audio (agent to customer)
- Transcript displays in real-time
- No crashes during 5-minute test call

---

## TESTING CHECKLIST

### Backend Tests
```bash
□ Server starts: python main.py
□ Health endpoint: curl http://localhost:8000/health
□ WebSocket connects: wscat -c ws://localhost:8000/ws/translate
□ Pipeline processes test audio
```

### Extension Tests
```bash
□ Extension loads in chrome://extensions/
□ Manifest valid (no errors)
□ Icons display correctly
□ Popup opens and shows UI
□ Content script injects on CCP page
```

### Integration Tests
```bash
□ Audio captured from microphone
□ Audio sent to backend via WebSocket
□ Backend returns translated audio
□ Translated audio plays in browser
□ Transcript updates in real-time
□ Latency acceptable (< 3 seconds)
```

---

## API KEYS NEEDED

Get these before starting:
1. **Deepgram**: https://console.deepgram.com/ (free tier: $200 credit)
2. **Anthropic**: https://console.anthropic.com/ (free tier: $5 credit)
3. **ElevenLabs**: https://elevenlabs.io/ (free tier: 10k characters)

Add to `backend/.env`:
```bash
DEEPGRAM_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here
ELEVENLABS_API_KEY=your_key_here
```

---

## DEPLOYMENT (AFTER MVP WORKS)

### Backend
```bash
# Deploy to Render, Railway, or Heroku
# Or use AWS EC2 / Lambda
```

### Extension
```bash
# Publish to Chrome Web Store
# Or distribute as .zip for testing
```

---

## NEXT STEPS AFTER MVP

1. **Add more languages** (French, Mandarin)
2. **Optimize latency** (< 1 second)
3. **Add call recording**
4. **Build admin dashboard**
5. **Amazon Connect production integration**

---

## KEY POINTS FOR CLAUDE CODE

- **Start with backend** - get translation pipeline working first
- **Test incrementally** - test each component before moving to next
- **Use simple audio test files** - don't need real phone calls initially
- **Extension is just audio capture + WebSocket** - keep it simple
- **Backend does all the heavy lifting** - extension is thin client

---

**This specification is optimized for Claude Code to build the MVP step-by-step. Focus on getting the backend working first, then the extension second.**

🦜 Good luck!
