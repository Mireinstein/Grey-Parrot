# Grey Parrot

Real-time bidirectional speech translation for contact centers. Grey Parrot sits as a sidebar inside Amazon Connect's CCP, listens to both sides of the call, and shows the agent a live translated transcript — no headset splitters, no separate apps.

**How it works:**
- The customer speaks (e.g. Spanish) -> agent hears it in their language e.g English
- The agent speaks English →  customer hears Spanish

---

## Prerequisites

- **Python 3.10+**
- **Google Chrome**
- **Amazon Connect instance** with an agent account (you'll use the CCP softphone at `https://<your-instance>.my.connect.aws/ccp-v2/`)
- **Deepgram API key** — free $200 credit at [console.deepgram.com](https://console.deepgram.com/)

---

## Setup

### 1. Clone the repo

```bash
git clone https://github.com/Mireinstein/Grey-Parrot.git
cd Grey-Parrot
```

### 2. Configure environment

```bash
cp .env.example backend/.env
```

Edit `backend/.env` and set your Deepgram key:

```
DEEPGRAM_API_KEY=your_deepgram_key_here
```

### 3. Install backend dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 4. Start the backend

```bash
cd backend
python main.py
```

The server starts on `http://localhost:8000`. Confirm it's running:

```bash
curl http://localhost:8000/health
# {"status":"ok","active_sessions":0}
```

Leave this terminal open — the backend must stay running during calls.

### 5. Load the Chrome extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in the top-right)
3. Click **Load unpacked**
4. Select the `extension/` folder from this repo
5. The Grey Parrot icon appears in your Chrome toolbar

---

## Using Grey Parrot on a Call

1. **Navigate to your Amazon Connect CCP**
   `https://<your-instance>.my.connect.aws/ccp-v2/`
   The Grey Parrot sidebar opens automatically on the right side of the page.

2. **Select languages in the sidebar**
   - *Customer Language* — the language the customer is calling in (e.g. Spanish)
   - *Agent Language* — the language the agent speaks (e.g. English)

3. **Click "Start Translation"**
   The status pill turns green and shows *Translation Active*.

4. **Accept a call in the CCP softphone**
   As soon as audio flows, Grey Parrot begins transcribing both sides:
   - **Customer:** shows the English translation of what the customer said
   - **Agent:** shows a confirmation of what the agent said

5. **End the session**
   Click **Stop Translation** when the call ends. The transcript stays visible until the next session starts.

> **Tip:** The sidebar can be resized by dragging the left edge. It can be hidden/shown by clicking the Grey Parrot toolbar icon.

---

## Architecture

```
Amazon Connect CCP (browser tab)
  ├── content.js        Content script — injects sidebar UI and bridges messages
  ├── inject.js         Page-context script — hooks getUserMedia + RTCPeerConnection
  │                     to capture raw 16 kHz PCM from both audio streams
  └── pcm-processor.js  AudioWorklet — converts float32 samples to int16 PCM

Chrome Extension Background
  └── background.js     Maintains WebSocket connection to backend;
                        forwards audio chunks and receives transcript updates

Backend (FastAPI + uvicorn)
  └── main.py                  WebSocket server — orchestrates the pipeline
  └── services/
      └── deepgram_streamer.py Streams PCM to Deepgram Live API (nova-2 model)
                               Fires callback on speech_final utterances
  └── config.py                Reads .env (DEEPGRAM_API_KEY, host, port)

Translation
  └── deep-translator (GoogleTranslator) — free, no API key required
```

**Data flow per utterance:**

```
Microphone / WebRTC track
  → inject.js (AudioWorklet, 16 kHz int16 PCM)
  → content.js (window.postMessage)
  → background.js (chrome.runtime.sendMessage → WebSocket)
  → backend main.py (AUDIO_CHUNK)
  → DeepgramStreamer.send()
  → Deepgram Live API (nova-2, speech_final)
  → GoogleTranslator
  → WebSocket TRANSCRIPT message
  → background.js → chrome.storage.local
  → content.js (storage.onChanged)
  → sidebar displayTranscript()
```

---

## File Structure

```
Grey-Parrot/
├── extension/
│   ├── manifest.json       MV3 manifest — permissions, content script rules
│   ├── background.js       Service worker — WebSocket client, message routing
│   ├── content.js          Content script — sidebar UI (Shadow DOM), audio bridge
│   ├── inject.js           Page-context script — WebRTC hooks, AudioWorklet
│   ├── pcm-processor.js    AudioWorklet processor — float32 → int16 PCM
│   └── icons/
│       ├── icon-16.png
│       ├── icon-48.png
│       └── icon-128.png
├── backend/
│   ├── main.py             FastAPI WebSocket server
│   ├── config.py           Environment config
│   ├── requirements.txt
│   └── services/
│       └── deepgram_streamer.py  Deepgram Live streaming client
├── .env.example
└── README.md
```

---

## Supported Languages

| Code | Language   |
|------|------------|
| `en` | English    |
| `es` | Spanish    |
| `fr` | French     |
| `pt` | Portuguese |
| `de` | German     |
| `zh` | Chinese    |
| `ar` | Arabic     |
| `ja` | Japanese   |
| `ko` | Korean     |
| `hi` | Hindi      |
| `ru` | Russian    |
| `it` | Italian    |

----

## Troubleshooting

**Sidebar doesn't open**
- Make sure the extension is loaded and enabled in `chrome://extensions/`
- The content script only runs on `*.my.connect.aws/ccp-v2/*` — confirm your CCP URL matches that pattern

**"Translation Inactive" stays grey after clicking Start**
- Check the backend is running: `curl http://localhost:8000/health`
- Open Chrome DevTools on the CCP tab → Console — look for WebSocket errors from Grey Parrot

**No transcript appears during a call**
- Open the extension's background service worker console (`chrome://extensions/` → Grey Parrot → *Service Worker*) and check for errors
- In the CCP tab console, look for `Grey Parrot: AudioWorkletNode active` or `falling back to ScriptProcessorNode` — either is fine
- Confirm audio is flowing: the Deepgram streamer connects lazily on the first audio chunk, so silence will produce nothing

**`DEEPGRAM_API_KEY` error on backend start**
- Ensure `backend/.env` exists and contains a valid key (not the placeholder from `.env.example`)
