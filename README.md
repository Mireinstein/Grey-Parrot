# Grey Parrot

Real-time bidirectional speech translation (Spanish ↔ English) for contact center agents using browser-based softphones.

## Quick Start

### 1. Get API Keys

| Service | URL | Free Tier |
|---------|-----|-----------|
| Deepgram | https://console.deepgram.com/ | $200 credit |
| Anthropic | https://console.anthropic.com/ | $5 credit |
| ElevenLabs | https://elevenlabs.io/ | 10k characters |

### 2. Configure Backend

```bash
cd backend
cp ../.env.example .env
# Edit .env and add your API keys
```

### 3. Install Backend Dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 4. Start Backend

```bash
cd backend
python main.py
```

Server runs at `http://localhost:8000`. Verify with:
```bash
curl http://localhost:8000/health
```

### 5. Test the Pipeline

```bash
cd backend
python test_backend.py
```

### 6. Load Chrome Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select the `extension/` folder
5. The Grey Parrot icon appears in your toolbar

### 7. Use the Extension

1. Navigate to your Amazon Connect CCP page
2. Click the Grey Parrot icon
3. Select customer and agent languages
4. Click **Start Translation**
5. Translation begins on the next call

## Architecture

```
Browser (Amazon Connect CCP)
  └── inject.js        Captures WebRTC audio streams
  └── content.js       Bridges page ↔ extension
  └── background.js    WebSocket client to backend

Backend (FastAPI)
  └── main.py          WebSocket server
  └── translation_pipeline.py
        └── Deepgram   Speech-to-Text
        └── Claude     Translation
        └── ElevenLabs Text-to-Speech
```

## File Structure

```
grey-parrot/
├── extension/
│   ├── manifest.json
│   ├── background.js
│   ├── content.js
│   ├── inject.js
│   ├── popup.html
│   ├── popup.js
│   ├── styles/popup.css
│   └── icons/
├── backend/
│   ├── main.py
│   ├── translation_pipeline.py
│   ├── audio_processor.py
│   ├── config.py
│   ├── requirements.txt
│   ├── test_backend.py
│   └── services/
│       ├── deepgram_service.py
│       ├── claude_service.py
│       └── elevenlabs_service.py
├── .env.example
└── README.md
```

## Success Criteria

- [ ] Backend starts without errors
- [ ] Health endpoint responds: `curl http://localhost:8000/health`
- [ ] WebSocket accepts connections
- [ ] Pipeline processes audio through STT → LLM → TTS
- [ ] Total latency < 2 seconds
- [ ] Extension loads in Chrome without errors
- [ ] Popup opens and displays UI
- [ ] Audio captured and translated end-to-end

## Adding Icons

Generate icons at 16x16, 48x48, and 128x128 pixels and place them in `extension/icons/`:
- `icon-16.png`
- `icon-48.png`
- `icon-128.png`

## Supported Languages

| Code | Language |
|------|----------|
| `es` | Spanish |
| `en` | English |
| `fr` | French |
