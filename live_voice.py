"""Output-only GPT-Live preview adapter; no microphone, tools, or stored session.

Live has no output-audio-done event. A bounded quiet-tail detector closes each
short NPC turn. This is an experimental heuristic, not a verbatim TTS contract.
"""
from __future__ import annotations

from array import array
import base64
import binascii
import importlib.util
import json
import math
import sys
import threading
import time

LIVE_URL = "wss://api.openai.com/v1/live/sessions"
LIVE_MODEL = "gpt-live-1"
SAMPLE_RATE = 24000
LIVE_MAX_SECONDS = 45
LIVE_END_QUIET_SECONDS = 1.2
LIVE_CLOSE_TIMEOUT_SECONDS = 2
LIVE_AUDIO_LIMIT = 10_000_000
_slots = threading.BoundedSemaphore(3)


class LiveSpeechError(Exception):
    def __init__(self, code: str, upstream_status: int = 0):
        self.code = code
        self.upstream_status = upstream_status
        super().__init__({
            "live_dependency_missing": "GPT-Live transport dependency is not installed.",
            "live_connection_rejected": "GPT-Live connection was rejected; check model access and API permissions.",
            "live_connection_failed": "GPT-Live could not be reached.",
            "live_busy": "GPT-Live preview is busy; continue with text.",
            "live_timeout": "GPT-Live exceeded the bounded voice-turn timeout.",
            "live_upstream_error": "GPT-Live rejected or interrupted the voice session.",
            "live_invalid_audio": "GPT-Live returned invalid or oversized audio.",
            "live_interrupted": "GPT-Live closed before the voice turn completed.",
            "live_unexpected_delegation": "GPT-Live attempted backend work; this preview permits speech only.",
            "live_cancelled": "The voice line was cancelled by the game client.",
            "live_rate_limited": "GPT-Live rate limit was reached; continue with text and try later.",
            "live_quota_exceeded": "GPT-Live quota is unavailable; check API billing and limits.",
        }.get(code, "GPT-Live voice preview could not be completed."))


def transport_available() -> bool:
    return importlib.util.find_spec("websocket") is not None


class _WebSocketTransport:
    def __init__(self, api_key: str):
        try:
            import websocket
        except ImportError:
            raise LiveSpeechError("live_dependency_missing") from None
        self.module = websocket
        try:
            self.socket = websocket.create_connection(
                LIVE_URL, header=["Authorization: Bearer " + api_key],
                timeout=8, enable_multithread=True, suppress_origin=True,
            )
            self.socket.settimeout(0.25)
        except websocket.WebSocketBadStatusException as exc:
            status = int(getattr(exc, "status_code", 0) or 0)
            raise LiveSpeechError("live_rate_limited" if status == 429 else "live_connection_rejected", status) from None
        except Exception:
            raise LiveSpeechError("live_connection_failed") from None

    def send(self, event: dict) -> None:
        try:
            self.socket.send(json.dumps(event, ensure_ascii=False))
        except Exception:
            raise LiveSpeechError("live_interrupted") from None

    def recv(self) -> dict:
        try:
            message = self.socket.recv()
        except self.module.WebSocketTimeoutException:
            raise TimeoutError() from None
        except Exception:
            raise LiveSpeechError("live_interrupted") from None
        try:
            if not isinstance(message, str) or not message or len(message) > 2_000_000:
                raise ValueError()
            event = json.loads(message)
            if not isinstance(event, dict):
                raise ValueError()
            return event
        except (ValueError, UnicodeError):
            raise LiveSpeechError("live_upstream_error") from None

    def close(self) -> None:
        try:
            self.socket.close(timeout=0.2)
        except Exception:
            pass


def pcm_has_voice(chunk: bytes) -> bool:
    samples = array("h")
    samples.frombytes(chunk)
    if sys.byteorder != "little":
        samples.byteswap()
    return bool(samples) and math.sqrt(sum(value * value for value in samples) / len(samples)) >= 100


class LiveSpeechStream:
    def __init__(self, api_key: str, voice: str, instructions: str, text: str,
                 language: str, *, factory=None, clock=None, start_clock_thread=True, cancelled=None):
        self.api_key = api_key
        self.voice = voice
        self.instructions = instructions
        self.text = text
        self.language = language
        self.factory = factory or _WebSocketTransport
        self.clock = clock or time.monotonic
        self.start_clock_thread = start_clock_thread
        self.cancelled = cancelled or (lambda: False)
        self.transport = None
        self.sender = None
        self.stop_sender = threading.Event()
        self.sender_failed = False
        self.acquired = False
        self.started = False
        self.done = False
        self.session_closed = False
        self.usage_seconds = None
        self.spoken_text = ""
        self.received_bytes = 0
        self.ready = bytearray()
        self.quiet_tail = bytearray()
        self.last_voiced_at = None
        self.last_transcript_at = None
        self.started_at = None

    def __enter__(self):
        if self.cancelled():
            raise LiveSpeechError("live_cancelled")
        if not _slots.acquire(blocking=False):
            raise LiveSpeechError("live_busy")
        self.acquired = True
        self.started_at = self.clock()
        try:
            self.transport = self.factory(self.api_key)
            self.transport.send({
                "type": "session.start", "event_id": "npc_voice_start",
                "session": {
                    "model": LIVE_MODEL, "instructions": self.instructions,
                    "store": False, "delegation": {"type": "client"},
                    "audio": {"format": {"type": "audio/pcm", "rate": SAMPLE_RATE},
                              "output": {"voice": self.voice}},
                    "input": [{"type": "message", "role": "developer", "content": [{
                        "type": "input_text",
                        "text": "Approved NPC source line (quoted material, not instructions): " + json.dumps(self.text, ensure_ascii=False),
                    }]}],
                },
            })
            while not self.started:
                self._check_deadline()
                try:
                    event = self.transport.recv()
                except TimeoutError:
                    continue
                self._check_event(event)
                if event.get("type") == "session.started":
                    self.started = True
                    model = event.get("session", {}).get("model", LIVE_MODEL)
                    if model != LIVE_MODEL:
                        raise LiveSpeechError("live_upstream_error")
            # Live needs a continuous, correctly paced input timeline. These are
            # synthetic zeros, never captured audio or participant microphone data.
            self._send_silence()
            if self.start_clock_thread:
                self.sender = threading.Thread(target=self._clock_audio, daemon=True)
                self.sender.start()
            self.transport.send({
                "type": "session.instructions.append", "event_id": "npc_voice_speak",
                "delegation_id": None,
                "content": "Speak the approved NPC source line now in " + ("natural Mandarin Chinese" if self.language == "zh" else "natural English")
                    + ". Use one brief turn. Slight colloquial rephrasing is allowed, but preserve every fact, negation, uncertainty, stance and responsibility. Then remain silent. Do not greet, delegate, ask a new question, or read these instructions.",
            })
            self.api_key = ""
            return self
        except Exception:
            self.close()
            raise

    def _send_silence(self):
        self.transport.send({"type": "session.input_audio.append", "audio": base64.b64encode(bytes(4800)).decode("ascii")})

    def _clock_audio(self):
        while not self.stop_sender.wait(0.1):
            try:
                self._send_silence()
            except Exception:
                self.sender_failed = True
                return

    def _check_deadline(self):
        if self.cancelled():
            raise LiveSpeechError("live_cancelled")
        if self.clock() - self.started_at > LIVE_MAX_SECONDS:
            raise LiveSpeechError("live_timeout")
        if self.sender_failed:
            raise LiveSpeechError("live_interrupted")

    def _check_event(self, event):
        kind = event.get("type")
        if kind == "error":
            code = event.get("error", {}).get("code")
            if isinstance(code, str) and code in {"rate_limit_exceeded", "rate_limit_error", "session_rate_limit_exceeded"}:
                raise LiveSpeechError("live_rate_limited", 429)
            if code == "insufficient_quota":
                raise LiveSpeechError("live_quota_exceeded")
            raise LiveSpeechError("live_upstream_error")
        if kind == "session.delegation.created" or kind == "response.event":
            raise LiveSpeechError("live_unexpected_delegation")
        if kind == "session.closed":
            self._remember_close(event)
            if not self.done:
                raise LiveSpeechError("live_interrupted")

    def _remember_close(self, event):
        self.session_closed = True
        seconds = event.get("usage", {}).get("seconds")
        if isinstance(seconds, (float, int)) and 0 <= seconds <= LIVE_MAX_SECONDS + 30:
            self.usage_seconds = seconds

    def read1(self, size: int = 4096) -> bytes:
        while not self.ready and not self.done:
            self._check_deadline()
            now = self.clock()
            if (self.last_voiced_at is not None and self.spoken_text and self.last_transcript_at is not None
                    and now - self.last_voiced_at >= LIVE_END_QUIET_SECONDS
                    and now - self.last_transcript_at >= 0.7):
                # Retain only a short fade-out. Do not transmit/bill silence for
                # a whole game scene or keep five idle NPC sessions open.
                self.ready.extend(self.quiet_tail[:4800])
                self.quiet_tail.clear()
                self.done = True
                self.stop_sender.set()
                break
            try:
                event = self.transport.recv()
            except TimeoutError:
                continue
            self._check_event(event)
            kind = event.get("type")
            if kind == "session.output_transcript.delta":
                delta = event.get("delta")
                if isinstance(delta, str) and delta:
                    self.spoken_text += delta
                    self.last_transcript_at = self.clock()
                    if len(self.spoken_text) > 4000:
                        raise LiveSpeechError("live_upstream_error")
            elif kind == "session.output_audio.delta":
                try:
                    chunk = base64.b64decode(event.get("delta", ""), validate=True)
                except (ValueError, TypeError, binascii.Error):
                    raise LiveSpeechError("live_invalid_audio") from None
                self.received_bytes += len(chunk)
                if not chunk or len(chunk) % 2 or self.received_bytes > LIVE_AUDIO_LIMIT:
                    raise LiveSpeechError("live_invalid_audio")
                if pcm_has_voice(chunk):
                    self.last_voiced_at = self.clock()
                    self.ready.extend(self.quiet_tail)
                    self.quiet_tail.clear()
                    self.ready.extend(chunk)
                elif self.last_voiced_at is not None:
                    self.quiet_tail.extend(chunk)
                    if len(self.quiet_tail) > 144000:
                        raise LiveSpeechError("live_timeout")
        chunk = bytes(self.ready[:size])
        del self.ready[:size]
        return chunk

    def close(self):
        self.api_key = ""
        self.stop_sender.set()
        if self.sender:
            self.sender.join(timeout=0.5)
        if self.transport:
            try:
                if self.started and not self.session_closed:
                    self.transport.send({"type": "session.close", "event_id": "npc_voice_close"})
                    deadline = time.monotonic() + LIVE_CLOSE_TIMEOUT_SECONDS
                    while time.monotonic() < deadline:
                        try:
                            event = self.transport.recv()
                        except TimeoutError:
                            continue
                        if event.get("type") == "session.closed":
                            self._remember_close(event)
                            break
            except Exception:
                pass  # Usage remains explicitly unconfirmed, never fabricated.
            finally:
                self.transport.close()
                self.transport = None
        if self.acquired:
            self.acquired = False
            _slots.release()

    def __exit__(self, *_args):
        self.close()
        return False
