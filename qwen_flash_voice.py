"""Output-only Qwen-Audio-3.1-TTS-Flash streaming; no microphone or decisions."""
from __future__ import annotations

import importlib.util
import json
import threading
import time
import uuid

from qwen_voice import valid_workspace

FLASH_MODEL = "qwen-audio-3.1-tts-flash"
FLASH_SAMPLE_RATE = 24000
FLASH_MAX_SECONDS = 45
FLASH_AUDIO_LIMIT = 120 * FLASH_SAMPLE_RATE * 2
_slots = threading.BoundedSemaphore(3)


class FlashSpeechError(Exception):
    def __init__(self, code: str, upstream_status: int = 0):
        self.code = code
        self.upstream_status = upstream_status
        super().__init__({
            "qwen_not_configured": "Configure the Beijing Model Studio API key and workspace ID.",
            "flash_dependency_missing": "Qwen Flash WebSocket transport is not installed.",
            "flash_connection_rejected": "Qwen Flash connection was rejected; check region, workspace and model access.",
            "flash_connection_failed": "Qwen Flash could not be reached.",
            "flash_credentials_invalid": "Model Studio rejected the API key.",
            "flash_access_denied": "This workspace cannot access Qwen Flash.",
            "flash_model_unavailable": "The requested Qwen Flash model is unavailable.",
            "flash_input_rejected": "Qwen Flash rejected this voice request.",
            "flash_rate_limited": "Qwen Flash rate limit reached; continue with text.",
            "flash_busy": "Qwen Flash voice is busy; continue with text.",
            "flash_timeout": "Qwen Flash exceeded the bounded generation timeout.",
            "flash_invalid_audio": "Qwen Flash returned invalid or oversized audio.",
            "flash_invalid_event": "Qwen Flash returned an invalid voice event.",
            "flash_interrupted": "Qwen Flash closed before the voice task completed.",
            "flash_cancelled": "The voice line was cancelled by the game client.",
        }.get(code, "Qwen Flash voice failed; continue with text."))


def transport_available() -> bool:
    return importlib.util.find_spec("websocket") is not None


def endpoint_for(workspace: str) -> str:
    if not valid_workspace(workspace):
        raise FlashSpeechError("qwen_not_configured")
    return f"wss://{workspace}.cn-beijing.maas.aliyuncs.com/api-ws/v1/inference"


def safe_usage(value):
    if not isinstance(value, dict): return {}
    return {key: number for key, number in value.items()
            if key in {"input_tokens", "output_tokens", "total_tokens", "characters"}
            and isinstance(number, (int, float)) and not isinstance(number, bool)
            and 0 <= number < 1_000_000_000}


def provider_failure(code, status=0):
    mapping = {"InvalidApiKey": ("flash_credentials_invalid", 401),
               "AccessDenied": ("flash_access_denied", 403),
               "Throttling.RateQuota": ("flash_rate_limited", 429),
               "Throttling": ("flash_rate_limited", 429),
               "ModelNotFound": ("flash_model_unavailable", 404),
               "InvalidParameter": ("flash_input_rejected", 400)}
    name, mapped_status = mapping.get(code if isinstance(code, str) else "", ("flash_upstream_error", status))
    return FlashSpeechError(name, mapped_status)


class _WebSocketTransport:
    def __init__(self, api_key, workspace):
        url = endpoint_for(workspace)
        try:
            import websocket
        except ImportError:
            raise FlashSpeechError("flash_dependency_missing") from None
        self.module = websocket
        self.socket = None
        try:
            self.socket = websocket.create_connection(url, header=["Authorization: Bearer " + api_key],
                timeout=8, enable_multithread=True, suppress_origin=True, redirect_limit=0)
            self.socket.settimeout(0.25)
        except websocket.WebSocketBadStatusException as exc:
            status = int(getattr(exc, "status_code", 0) or 0)
            self.close()
            raise FlashSpeechError("flash_rate_limited" if status == 429 else "flash_connection_rejected", status) from None
        except Exception:
            self.close()
            raise FlashSpeechError("flash_connection_failed") from None

    def send(self, event):
        try:
            self.socket.send(json.dumps(event, ensure_ascii=False))
        except Exception:
            raise FlashSpeechError("flash_interrupted") from None

    def recv(self):
        try:
            return self.socket.recv()
        except self.module.WebSocketTimeoutException:
            raise TimeoutError() from None
        except Exception:
            raise FlashSpeechError("flash_interrupted") from None

    def close(self):
        if self.socket is not None:
            try: self.socket.close(timeout=0.2)
            except Exception: pass


class QwenFlashStream:
    def __init__(self, api_key: str, workspace: str, voice: str, instruction: str,
                 text: str, language: str, seed: int, *, factory=None, clock=None, cancelled=None):
        self.api_key, self.workspace = api_key, workspace
        self.voice, self.instruction = voice, instruction
        self.text, self.language, self.seed = text, language, seed
        self.factory = factory or _WebSocketTransport
        self.clock = clock or time.monotonic
        self.cancelled = cancelled or (lambda: False)
        self.task_id = str(uuid.uuid4())
        self.transport = None
        self.acquired = False
        self.started = False
        self.done = False
        self.closed = False
        self.started_at = None
        self.ready = bytearray()
        self.received_bytes = 0
        self.usage = {}

    def _header(self, action):
        return {"action": action, "task_id": self.task_id, "streaming": "duplex"}

    def _check_deadline(self):
        if self.cancelled(): raise FlashSpeechError("flash_cancelled")
        if self.started_at is None: raise FlashSpeechError("flash_invalid_event")
        if self.clock() - self.started_at >= FLASH_MAX_SECONDS:
            raise FlashSpeechError("flash_timeout")

    def __enter__(self):
        if self.started_at is not None or self.closed:
            raise FlashSpeechError("flash_invalid_event")
        if not self.api_key or not valid_workspace(self.workspace):
            raise FlashSpeechError("qwen_not_configured")
        if (self.language not in {"zh", "en"} or not isinstance(self.text, str)
                or not self.text.strip() or len(self.text) > 1200):
            raise FlashSpeechError("flash_input_rejected")
        if self.cancelled(): raise FlashSpeechError("flash_cancelled")
        if not _slots.acquire(blocking=False): raise FlashSpeechError("flash_busy")
        self.acquired = True
        self.started_at = self.clock()
        try:
            self.transport = self.factory(self.api_key, self.workspace)
            self._check_deadline()
            self.transport.send({"header": self._header("run-task"), "payload": {
                "task_group": "audio", "task": "tts", "function": "SpeechSynthesizer", "model": FLASH_MODEL,
                "parameters": {"text_type": "PlainText", "voice": self.voice, "format": "pcm",
                    "sample_rate": FLASH_SAMPLE_RATE, "rate": 1.0, "pitch": 1.0, "volume": 50,
                    "seed": self.seed, "language_hints": [self.language], "instruction": self.instruction}, "input": {}}})
            self.api_key = ""
            while not self.started:
                self._receive()
            self._check_deadline()
            self.transport.send({"header": self._header("continue-task"), "payload": {"input": {"text": self.text.strip()}}})
            self.transport.send({"header": self._header("finish-task"), "payload": {"input": {}}})
            return self
        except Exception:
            self.close()
            raise

    def _receive(self):
        self._check_deadline()
        try: event = self.transport.recv()
        except TimeoutError: return
        self._check_deadline()
        if isinstance(event, bytes):
            if not self.started or not event or self.received_bytes + len(event) > FLASH_AUDIO_LIMIT:
                raise FlashSpeechError("flash_invalid_audio")
            if self.received_bytes == 0 and event[:4] == b"RIFF" and event[8:12] == b"WAVE":
                raise FlashSpeechError("flash_invalid_audio")
            self.received_bytes += len(event)
            self.ready.extend(event)
            return
        if not isinstance(event, str) or not event or len(event) > 1_000_000:
            raise FlashSpeechError("flash_interrupted")
        try: data = json.loads(event)
        except (ValueError, UnicodeError): raise FlashSpeechError("flash_invalid_event") from None
        if (not isinstance(data, dict) or not isinstance(data.get("header"), dict)
                or data["header"].get("task_id") != self.task_id):
            raise FlashSpeechError("flash_invalid_event")
        header = data["header"]
        kind = header.get("event")
        if kind == "task-failed": raise provider_failure(header.get("error_code"))
        if kind == "task-started":
            if self.started: raise FlashSpeechError("flash_invalid_event")
            self.started = True
            return
        if kind not in {"result-generated", "task-finished"} or not self.started:
            raise FlashSpeechError("flash_invalid_event")
        payload = data.get("payload")
        if not isinstance(payload, dict): raise FlashSpeechError("flash_invalid_event")
        usage = safe_usage(payload.get("usage"))
        if usage: self.usage = usage  # Prefer final cumulative usage; never add repeated events.
        if kind == "task-finished":
            if not self.received_bytes or self.received_bytes % 2:
                raise FlashSpeechError("flash_invalid_audio")
            self.done = True

    def read1(self, size=4096):
        self._check_deadline()
        while not self.ready and not self.done:
            self._receive()
        size = max(1, min(int(size), len(self.ready)))
        result = bytes(self.ready[:size])
        del self.ready[:size]
        return result

    def close(self):
        if self.closed: return
        self.closed = True
        try:
            if self.transport is not None:
                if self.started and not self.done:
                    try:
                        self.transport.send({"header": self._header("finish-task"), "payload": {"input": {"directive": "cancel"}}})
                    except Exception: pass
                try: self.transport.close()
                except Exception: pass
        finally:
            self.transport = None
            self.api_key = ""
            self.ready.clear()
            if self.acquired:
                _slots.release()
                self.acquired = False

    def __exit__(self, *args):
        self.close()
