"""Exact Qwen-Audio-3.1-TTS-Next HTTPS adapter (non-streaming generation)."""
from __future__ import annotations

import io
import json
import re
import struct
from urllib import error, parse, request
import wave

QWEN_MODEL = "qwen-audio-3.1-tts-next"
QWEN_GENERATION_TIMEOUT_SECONDS = 120
QWEN_DOWNLOAD_TIMEOUT_SECONDS = 20
MAX_AUDIO_BYTES = 10_000_000


class QwenSpeechError(Exception):
    def __init__(self, code: str, upstream_status: int = 0):
        self.code = code
        self.upstream_status = upstream_status
        super().__init__({
            "qwen_not_configured": "Configure the Beijing Model Studio API key and workspace ID.",
            "qwen_workspace_invalid": "The Model Studio workspace ID is invalid.",
            "qwen_prompt_too_long": "The generated voice prompt exceeds the model's 3000-character limit.",
            "qwen_credentials_invalid": "Model Studio rejected the API key.",
            "qwen_access_denied": "This key/workspace cannot access the requested Qwen model.",
            "qwen_model_unavailable": "Check the exact model, Beijing region, and workspace access.",
            "qwen_rate_limited": "Model Studio rate limit reached; continue with text.",
            "qwen_input_rejected": "Model Studio rejected this voice request.",
            "qwen_timeout": "Qwen audio generation or download timed out.",
            "qwen_connection_failed": "Model Studio could not be reached.",
            "qwen_invalid_response": "Qwen did not return a completed audio file.",
            "qwen_audio_url_invalid": "The returned audio URL is not an approved provider storage URL.",
            "qwen_invalid_audio": "Qwen returned invalid, oversized, or unsupported WAV audio.",
            "qwen_audio_download_failed": "The generated Qwen audio file could not be downloaded.",
            "qwen_cancelled": "The voice line was cancelled by the game client.",
        }.get(code, "Qwen voice generation failed; continue with text."))


def valid_workspace(value: str) -> bool:
    return isinstance(value, str) and bool(re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?", value))


def endpoint_for(workspace: str) -> str:
    if not valid_workspace(workspace):
        raise QwenSpeechError("qwen_workspace_invalid")
    return f"https://{workspace}.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer"


def safe_audio_url(value: str) -> str:
    if not isinstance(value, str) or any(ord(c) < 32 for c in value):
        raise QwenSpeechError("qwen_audio_url_invalid")
    try:
        url = parse.urlsplit(value)
        host = (url.hostname or "").lower()
        allowed = host.endswith(".aliyuncs.com") or host.endswith(".alicdn.com")
        if (url.scheme not in {"http", "https"} or not allowed or url.username or url.password
                or url.port not in {None, 80, 443} or not url.path or ".internal." in host or "-internal." in host):
            raise ValueError()
        # Some OSS URLs use HTTP. Upgrade without forwarding any bearer key.
        return parse.urlunsplit(("https", host, url.path, url.query, ""))
    except (ValueError, TypeError):
        raise QwenSpeechError("qwen_audio_url_invalid") from None


class SafeAudioRedirect(request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return super().redirect_request(req, fp, code, msg, headers, safe_audio_url(newurl))


def _http_failure(status: int) -> QwenSpeechError:
    return QwenSpeechError({401: "qwen_credentials_invalid", 403: "qwen_access_denied",
        404: "qwen_model_unavailable", 429: "qwen_rate_limited", 400: "qwen_input_rejected"}.get(status, "qwen_upstream_error"), status)


def finalize_wav_lengths(audio: bytes) -> bytes:
    """Repair the observed provider's provisional RIFF/data lengths, not PCM.

    The completed HTTPS artifact can retain consistent near-2-GiB sentinel
    lengths. Only this narrow shape is repaired, using the bounded downloaded
    payload. Ordinary mismatches/truncation are rejected. Metadata (including
    the AIGC chunk) and PCM samples remain byte-for-byte unchanged.
    """
    if not 12 <= len(audio) <= MAX_AUDIO_BYTES or audio[:4] != b"RIFF" or audio[8:12] != b"WAVE":
        raise QwenSpeechError("qwen_invalid_audio")
    declared = struct.unpack_from("<I", audio, 4)[0] + 8
    if declared == len(audio):
        return audio
    if not 0x7FFF0000 <= declared < 0x80000000:
        raise QwenSpeechError("qwen_invalid_audio")
    position = 12
    block_align = None
    for _ in range(128):
        if position + 8 > len(audio):
            break
        tag, size = struct.unpack_from("<4sI", audio, position)
        body = position + 8
        if tag == b"data":
            available = len(audio) - body
            if (size <= MAX_AUDIO_BYTES or declared != body + size or block_align != 2
                    or not 0 < available <= 120 * 24000 * 2 or available % block_align):
                break
            fixed = bytearray(audio)
            struct.pack_into("<I", fixed, 4, len(audio) - 8)
            struct.pack_into("<I", fixed, position + 4, available)
            return bytes(fixed)
        if body + size + (size & 1) > len(audio):
            break
        if tag == b"fmt " and size >= 16:
            block_align = struct.unpack_from("<H", audio, body + 12)[0]
        position = body + size + (size & 1)
    raise QwenSpeechError("qwen_invalid_audio")


def synthesize_next(api_key: str, workspace: str, prompt: str, seed: int,
                    rate: float = 1.0, *, open_api=None, open_audio=None, cancelled=None) -> tuple[bytes, dict]:
    if not api_key or not workspace:
        raise QwenSpeechError("qwen_not_configured")
    endpoint = endpoint_for(workspace)
    if not isinstance(prompt, str) or not prompt.strip() or len(prompt) > 3000:
        raise QwenSpeechError("qwen_prompt_too_long")
    cancelled = cancelled or (lambda: False)
    if cancelled():
        raise QwenSpeechError("qwen_cancelled")
    payload = {"model": QWEN_MODEL, "input": {"text_prompt": prompt, "format": "wav",
        "sample_rate": 24000, "channels": 1, "seed": seed, "rate": rate, "enable_aigc_tag": True}}
    api = open_api or request.urlopen
    download = open_audio or request.build_opener(SafeAudioRedirect()).open
    req = request.Request(endpoint, data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Authorization": "Bearer " + api_key, "Content-Type": "application/json"}, method="POST")
    phase = "generation"
    try:
        with api(req, timeout=QWEN_GENERATION_TIMEOUT_SECONDS) as response:
            raw = response.read(1_000_001)
        if len(raw) > 1_000_000:
            raise QwenSpeechError("qwen_invalid_response")
        data = json.loads(raw)
        if not isinstance(data, dict) or not isinstance(data.get("output"), dict):
            raise QwenSpeechError("qwen_invalid_response")
        output = data["output"]
        if output.get("finish_reason") != "stop" or not isinstance(output.get("audio"), dict):
            raise QwenSpeechError("qwen_invalid_response")
        if cancelled():
            raise QwenSpeechError("qwen_cancelled")
        audio_url = safe_audio_url(output["audio"].get("url"))
        phase = "download"
        # Separate opener/request: never send the API key to a signed media URL.
        with download(request.Request(audio_url, headers={"Accept": "audio/wav"}), timeout=QWEN_DOWNLOAD_TIMEOUT_SECONDS) as response:
            content_length = getattr(response, "headers", {}).get("Content-Length")
            if content_length is not None and (not re.fullmatch(r"[0-9]{1,12}", content_length)
                    or not 0 < int(content_length) <= MAX_AUDIO_BYTES):
                raise QwenSpeechError("qwen_invalid_audio")
            audio = response.read(MAX_AUDIO_BYTES + 1)
            if content_length is not None and len(audio) != int(content_length):
                raise QwenSpeechError("qwen_invalid_audio")
        if cancelled():
            raise QwenSpeechError("qwen_cancelled")
        if not audio or len(audio) > MAX_AUDIO_BYTES:
            raise QwenSpeechError("qwen_invalid_audio")
        audio = finalize_wav_lengths(audio)
        with wave.open(io.BytesIO(audio), "rb") as wav:
            if (wav.getnchannels(), wav.getsampwidth(), wav.getframerate(), wav.getcomptype()) != (1, 2, 24000, "NONE"):
                raise QwenSpeechError("qwen_invalid_audio")
            if not 0 < wav.getnframes() <= 120 * 24000 or len(wav.readframes(wav.getnframes())) != wav.getnframes() * 2:
                raise QwenSpeechError("qwen_invalid_audio")
        usage = data.get("usage") if isinstance(data.get("usage"), dict) else {}
        usage = {name: value for name, value in usage.items()
            if name in {"input_tokens", "output_tokens", "total_tokens", "duration"}
            and isinstance(value, (int, float)) and not isinstance(value, bool) and 0 <= value < 1_000_000_000}
        return audio, usage
    except error.HTTPError as exc:
        if phase == "download":
            raise QwenSpeechError("qwen_audio_download_failed", exc.code) from None
        raise _http_failure(exc.code) from None
    except (TimeoutError,):
        raise QwenSpeechError("qwen_timeout") from None
    except error.URLError as exc:
        raise QwenSpeechError("qwen_timeout" if isinstance(exc.reason, TimeoutError) else "qwen_connection_failed") from None
    except (json.JSONDecodeError, UnicodeError, KeyError, TypeError):
        raise QwenSpeechError("qwen_invalid_response") from None
    except (wave.Error, EOFError):
        raise QwenSpeechError("qwen_invalid_audio") from None
