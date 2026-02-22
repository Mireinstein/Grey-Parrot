from deepgram import DeepgramClient, LiveOptions, LiveTranscriptionEvents


class DeepgramStreamer:
    """
    Streams audio to Deepgram on-demand (lazy connect — the WebSocket to
    Deepgram is only opened when the first audio chunk arrives, avoiding
    the 1011 timeout that fires when the connection sits idle too long).

    Fires on_utterance(text) when Deepgram detects speech_final=True.
    """

    def __init__(self, api_key: str, language: str, on_utterance):
        self._api_key = api_key
        self._language = language
        self._on_utterance = on_utterance
        self._conn = None

    async def _ensure_connected(self):
        if self._conn is not None:
            return

        client = DeepgramClient(self._api_key)
        self._conn = client.listen.asyncwebsocket.v("1")

        options = LiveOptions(
            model="nova-2",
            language=self._language,
            punctuate=True,
            interim_results=True,
            endpointing=600,       # ms of silence → utterance boundary
            encoding="linear16",
            sample_rate=16000,
            channels=1,
        )

        on_utterance = self._on_utterance

        async def _on_transcript(conn, result, **kwargs):
            try:
                text = result.channel.alternatives[0].transcript.strip()
                if result.speech_final and text:
                    await on_utterance(text)
            except Exception as e:
                print(f"[Streamer] handler error: {e}")

        self._conn.on(LiveTranscriptionEvents.Transcript, _on_transcript)
        await self._conn.start(options)

    async def send(self, pcm_bytes: bytes):
        await self._ensure_connected()
        if self._conn:
            try:
                await self._conn.send(pcm_bytes)
            except Exception:
                # Connection dropped; reset so next send reconnects
                self._conn = None

    async def finish(self):
        if self._conn:
            try:
                await self._conn.finish()
            except Exception:
                pass
            self._conn = None
