# Grey Parrot

A Chrome extension that puts live, translated subtitles on any video —
YouTube, TikTok, or anything else playing in a browser tab. No captions
required from the source; Grey Parrot listens to the tab's audio, transcribes
it, translates it, and overlays it on the page in real time.

**How it works:**
- Speech-to-text (STT) on whatever's playing in the tab, spoken language
  auto-detected
- Text-to-text (TTT) translation into your chosen subtitle language
- Result rendered as a live caption bar over the page

There's no text-to-speech and no bidirectional audio — it's a one-way
subtitle overlay, not a call-translation tool.

---

## Prerequisites

- **Python 3.10+**
- **Google Chrome**
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

Leave this terminal open — the backend must stay running while you use the
extension.

### 5. Load the Chrome extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in the top-right)
3. Click **Load unpacked**
4. Select the `extension/` folder from this repo
5. The Grey Parrot icon appears in your Chrome toolbar

---

## Using it

1. Open a video — a YouTube video, a TikTok, anything playing audio in a tab.
2. Click the Grey Parrot toolbar icon.
3. Pick your **subtitle language** from the dropdown.
4. Click **Start subtitles**.
5. A caption bar appears near the bottom of the page and updates live as the
   video plays. Audio keeps playing normally — Grey Parrot captures the tab's
   audio in parallel, it doesn't interrupt playback.
6. Click **Stop** in the popup when you're done.

---

## Architecture

```
Popup (toolbar icon)
  └── popup.js          Start/Stop UI, subtitle-language picker

Background service worker
  └── background.js     Orchestrates everything: injects content.js into the
                        active tab, starts tabCapture + the offscreen
                        document, opens the WebSocket to the backend, relays
                        captions to the tab

Offscreen document (required for tab audio capture in MV3)
  └── offscreen.js       getUserMedia({chromeMediaSource:'tab'}) → AudioWorklet
                        → 16 kHz int16 PCM chunks. Also plays the captured
                        stream back so audio keeps working normally.
  └── pcm-processor.js   AudioWorklet — float32 samples → int16 PCM

Content script (injected on demand, not statically on every page)
  └── content.js         Renders the caption overlay (Shadow DOM)

Backend (FastAPI + uvicorn)
  └── main.py                  WebSocket server — orchestrates the pipeline
  └── services/
      └── deepgram_streamer.py Streams PCM to Deepgram Live API
                               (nova-3, language="multi" — auto-detects/
                               code-switches the spoken language)

Translation
  └── deep-translator (GoogleTranslator, source="auto") — free, no API key
```

**Data flow per utterance:**

```
Tab audio (chrome.tabCapture)
  → offscreen.js (AudioWorklet, 16 kHz int16 PCM)
  → background.js (WebSocket)
  → backend main.py (AUDIO_CHUNK)
  → DeepgramStreamer.send()
  → Deepgram Live API (nova-3, language=multi, speech_final)
  → GoogleTranslator (source=auto, target=<your language>)
  → WebSocket CAPTION message
  → background.js → chrome.tabs.sendMessage
  → content.js → caption overlay updates
```

---

## File structure

```
Grey-Parrot/
├── extension/
│   ├── manifest.json       MV3 manifest — permissions, action popup
│   ├── background.js       Service worker — orchestration, WebSocket client
│   ├── offscreen.js         Tab-audio capture (getUserMedia + AudioWorklet)
│   ├── offscreen.html
│   ├── content.js            Caption overlay (Shadow DOM), injected on demand
│   ├── popup.html / popup.js Start/Stop UI, language picker
│   ├── pcm-processor.js      AudioWorklet processor — float32 → int16 PCM
│   └── icons/
├── backend/
│   ├── main.py              FastAPI WebSocket server
│   ├── config.py            Environment config
│   ├── requirements.txt
│   └── services/
│       └── deepgram_streamer.py  Deepgram Live streaming client
├── .env.example
└── README.md
```

---

## Supported languages

**Spoken-language detection** (Deepgram nova-3, `language=multi`) currently
code-switches across: English, Spanish, French, German, Hindi, Russian,
Portuguese, Japanese, Italian, Dutch. ([Deepgram docs](https://developers.deepgram.com/docs/multilingual-code-switching))

**Subtitle/target language** is whatever you pick in the popup — translation
goes through Google Translate, which covers a much wider set than the
detection list above.

---

## Troubleshooting

**Nothing happens when I click "Start subtitles"**
- Check the backend is running: `curl http://localhost:8000/health`
- Open `chrome://extensions/` → Grey Parrot → *service worker* console and
  look for errors from `tabCapture.getMediaStreamId`

**Caption bar never appears**
- Open the offscreen document's console (`chrome://extensions/` → Grey
  Parrot → inspect views → `offscreen.html`) and check for `getUserMedia`
  errors
- Confirm the tab actually has audio playing — silence produces no captions

**Audio goes silent after clicking Start**
- This shouldn't happen — `offscreen.js` plays the captured stream back
  through an `<audio>` element specifically to avoid this. If it does,
  check the offscreen console for playback errors.

**`DEEPGRAM_API_KEY` error on backend start**
- Ensure `backend/.env` exists and contains a valid key (not the placeholder
  from `.env.example`)
