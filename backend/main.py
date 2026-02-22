from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import numpy as np
from datetime import datetime
from deep_translator import GoogleTranslator
from services.deepgram_service import DeepgramService
from services.deepgram_streamer import DeepgramStreamer
from config import Config

app = FastAPI(title="Grey Parrot Translation API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

sessions = {}


def translate_text(text: str, source: str, target: str) -> str:
    if source == target:
        return text
    return GoogleTranslator(source=source, target=target).translate(text)


@app.websocket("/ws/translate")
async def translate_websocket(websocket: WebSocket):
    await websocket.accept()
    session_id = None
    streamers = {}

    try:
        tts = DeepgramService(Config.DEEPGRAM_API_KEY)

        while True:
            data = await websocket.receive_json()

            if data['type'] == 'START_SESSION':
                session_id = data['sessionId']
                customer_lang = data['customerLanguage']
                agent_lang = data['agentLanguage']
                transcript = []

                sessions[session_id] = {
                    'customer_lang': customer_lang,
                    'agent_lang': agent_lang,
                    'transcript': transcript,
                }

                # ── Customer → Agent ─────────────────────────────────────
                # Agent reads the English translation; no TTS needed.
                async def on_customer_utterance(text: str,
                                                _cl=customer_lang, _al=agent_lang,
                                                _tr=transcript):
                    loop = asyncio.get_event_loop()
                    translated = await loop.run_in_executor(
                        None, lambda: translate_text(text, _cl, _al)
                    )
                    print(f"customer | {text!r} → {translated!r}")
                    _tr.append({
                        'speaker': 'customer',
                        'text': text,
                        'translation': translated,
                        'timestamp': datetime.now().isoformat(),
                    })
                    await websocket.send_json({'type': 'TRANSCRIPT', 'transcript': _tr})

                # ── Agent → Customer ─────────────────────────────────────
                # Translate agent's English to customer language + TTS.
                async def on_agent_utterance(text: str,
                                             _cl=customer_lang, _al=agent_lang,
                                             _tr=transcript):
                    loop = asyncio.get_event_loop()
                    translated = await loop.run_in_executor(
                        None, lambda: translate_text(text, _al, _cl)
                    )
                    print(f"agent   | {text!r} → {translated!r}")

                    if _al != _cl:
                        audio_bytes = tts.synthesize(translated)
                        audio_array = np.frombuffer(audio_bytes, dtype=np.int16)
                        await websocket.send_json({
                            'type': 'TRANSLATED_AUDIO',
                            'direction': 'customer',
                            'audioData': audio_array.tolist(),
                        })

                    _tr.append({
                        'speaker': 'agent',
                        'text': text,
                        'translation': translated,
                        'timestamp': datetime.now().isoformat(),
                    })
                    await websocket.send_json({'type': 'TRANSCRIPT', 'transcript': _tr})

                # Lazy-connect: Deepgram WS opens on first audio chunk
                streamers['customer'] = DeepgramStreamer(
                    Config.DEEPGRAM_API_KEY, customer_lang, on_customer_utterance
                )
                streamers['agent'] = DeepgramStreamer(
                    Config.DEEPGRAM_API_KEY, agent_lang, on_agent_utterance
                )

                await websocket.send_json({
                    'type': 'SESSION_STARTED',
                    'sessionId': session_id,
                })

            elif data['type'] == 'AUDIO_CHUNK' and session_id in sessions:
                direction = data['direction']
                if direction in streamers:
                    audio_array = np.array(data['audioData'], dtype=np.int16)
                    await streamers[direction].send(audio_array.tobytes())

            elif data['type'] == 'END_SESSION' and session_id in sessions:
                del sessions[session_id]
                for s in streamers.values():
                    await s.finish()
                streamers.clear()
                await websocket.send_json({
                    'type': 'SESSION_ENDED',
                    'sessionId': session_id,
                })

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"WebSocket error: {e}")
    finally:
        if session_id and session_id in sessions:
            del sessions[session_id]
        for s in streamers.values():
            try:
                await s.finish()
            except Exception:
                pass


@app.get("/health")
def health():
    return {
        "status": "ok",
        "active_sessions": len(sessions),
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=Config.HOST, port=Config.PORT)
