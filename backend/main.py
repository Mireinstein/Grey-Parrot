from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import asyncio
from deep_translator import GoogleTranslator
from services.deepgram_streamer import DeepgramStreamer
from config import Config

app = FastAPI(title="Grey Parrot Subtitle API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

sessions = {}


def translate_text(text: str, target: str) -> str:
    # source='auto' — Google Translate detects the spoken language per line,
    # independent of what Deepgram was told (language=multi).
    return GoogleTranslator(source="auto", target=target).translate(text)


@app.websocket("/ws/translate")
async def translate_websocket(websocket: WebSocket):
    await websocket.accept()
    session_id = None
    streamer = None

    try:
        while True:
            data = await websocket.receive_json()

            if data["type"] == "START_SESSION":
                session_id = data["sessionId"]
                target_lang = data["targetLanguage"]

                sessions[session_id] = {"target_lang": target_lang}

                async def on_utterance(text: str, _tl=target_lang):
                    loop = asyncio.get_event_loop()
                    translated = await loop.run_in_executor(
                        None, lambda: translate_text(text, _tl)
                    )
                    print(f"{text!r} -> {translated!r}")
                    await websocket.send_json({"type": "CAPTION", "text": translated})

                # Lazy-connect: Deepgram WS opens on first audio chunk.
                # language="multi" (nova-3) auto-detects/code-switches across
                # the spoken language, independent of the caption target.
                streamer = DeepgramStreamer(Config.DEEPGRAM_API_KEY, "multi", on_utterance)

                await websocket.send_json({"type": "SESSION_STARTED", "sessionId": session_id})

            elif data["type"] == "AUDIO_CHUNK" and session_id in sessions and streamer:
                import array as _array

                pcm_bytes = _array.array("h", data["audioData"]).tobytes()
                await streamer.send(pcm_bytes)

            elif data["type"] == "END_SESSION" and session_id in sessions:
                del sessions[session_id]
                if streamer:
                    await streamer.finish()
                    streamer = None
                try:
                    await websocket.send_json({"type": "SESSION_ENDED", "sessionId": session_id})
                except Exception:
                    pass  # client already closed the socket — that's fine

    except (WebSocketDisconnect, RuntimeError):
        pass  # normal client disconnect
    except Exception as e:
        import traceback

        print(f"WebSocket error: {e}")
        traceback.print_exc()
    finally:
        if session_id and session_id in sessions:
            del sessions[session_id]
        if streamer:
            try:
                await streamer.finish()
            except Exception:
                pass


@app.get("/health")
def health():
    return {"status": "ok", "active_sessions": len(sessions)}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=Config.HOST, port=Config.PORT)
