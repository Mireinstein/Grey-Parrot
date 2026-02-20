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
                session = sessions[session_id]
                direction = data['direction']  # 'customer' or 'agent'
                audio_array = np.array(data['audioData'], dtype=np.int16)

                # Add to buffer
                session['processor'].add_chunk(direction, audio_array)

                # Check if ready to process
                if session['processor'].is_ready(direction):
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

                        # Update transcript
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
