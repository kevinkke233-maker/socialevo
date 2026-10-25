#!/usr/bin/env python3
"""Local prototype server with explicitly configured text and media providers.

Environment variables:
  TEXT_AGENT_PROVIDER Optional text route: deepseek (default) or openai.
  TEXT_AGENT_MODEL   OpenAI critical/default model; gpt-6.1-sol.
  TEXT_AGENT_REASONING_EFFORT OpenAI critical/default effort; medium.
  TEXT_AGENT_ROUTING_PROFILE sol-luna-v1 (default), or single-sol-medium-v1.
  DEEPSEEK_API_KEY   Required for real DeepSeek calls.
  DEEPSEEK_PRO_MODEL Optional model id for deepseek-pro. Defaults to DEEPSEEK_MODEL
                     or deepseek-v4-pro.
  DEEPSEEK_FLASH_MODEL Optional model id for deepseek-flash. Defaults to deepseek-v4-flash.
  DEEPSEEK_BASE_URL  Optional endpoint. Defaults to DeepSeek chat completions.
  NPC_VOICE_PROVIDER Optional. Defaults to qwen; openai is an explicit legacy route.
  QWEN_VOICE_MODE    Optional. Defaults to flash; next is explicit nonstreaming rollback.
  DASHSCOPE_API_KEY  Optional. Beijing Model Studio key for NPC voice.
  SFM_WORKSPACE_ID   Optional. The same Beijing workspace as the Model Studio key.
  OPENAI_API_KEY     Required only for explicitly selected OpenAI text/media routes.
  OPENAI_TTS_MODEL   Optional TTS model id. Defaults to gpt-4o-mini-tts.
  OPENAI_TTS_BASE_URL Optional endpoint. Defaults to OpenAI audio speech.
  ACCESS_CODE        Optional site access code for public deployments.
"""

from __future__ import annotations

import base64
import binascii
import json
import re
import os
import hashlib
import hmac
import socket
import select
import threading
import time
import uuid
import secrets
from functools import partial
import recap_image
import io
import wave
import research_store
import research_keepsakes
import research_questionnaire
import study_account_auth
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib import request, error, parse
from live_voice import LiveSpeechStream, LiveSpeechError, LIVE_MODEL, transport_available
from qwen_voice import QWEN_MODEL, QwenSpeechError, synthesize_next, valid_workspace
from qwen_flash_voice import QwenFlashStream, FlashSpeechError, FLASH_MODEL, transport_available as flash_transport_available


def load_local_env() -> None:
    """Only this installation's optional ignored file; process env wins."""
    env_path = Path(__file__).with_name(".env.local")
    if env_path.is_symlink():
        raise RuntimeError("The local environment file must not be a symlink.")
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_local_env()

ROOT = Path(__file__).resolve().parent
LOCAL_PAIR_MODE = os.environ.get("ANONYMOUS_LOCAL_PAIR_MODE", "0") == "1"
LOCAL_STORE_PATH = ""


def configure_local_pair() -> None:
    """Opt-in local storage only, never inherited production storage/secrets."""
    global LOCAL_STORE_PATH
    for key in ("RESEARCH_DYNAMODB_TABLE", "RESEARCH_S3_BUCKET", "RESEARCH_ADMIN_TOKEN",
                "RESEARCH_SESSION_DIR", "RESEARCH_PUBLIC_URL", "RESEARCH_ORIGIN_SECRET",
                "STUDY_ASSIGNMENT_SECRET", "ACCESS_CODE", "ACCESS_COOKIE_SECRET"):
        os.environ.pop(key, None)
    os.environ["RESEARCH_AB_ENABLED"] = "1" if LOCAL_PAIR_MODE else "0"
    os.environ["RESEARCH_QUESTIONNAIRE_ENABLED"] = "1" if LOCAL_PAIR_MODE else "0"
    os.environ["RESEARCH_ACCOUNT_AUTH_ENABLED"] = "1" if LOCAL_PAIR_MODE else "0"
    os.environ["RESEARCH_REQUIRE_SECURE"] = "0"
    os.environ["RESEARCH_STORAGE_BACKEND"] = "sqlite" if LOCAL_PAIR_MODE else ""
    os.environ["RESEARCH_SQLITE_PATH"] = ""
    os.environ["RESEARCH_STORAGE_PREFIX"] = "anonymous-local-v1"
    if not LOCAL_PAIR_MODE:
        return
    if os.environ.get("HOST", "127.0.0.1") not in ("127.0.0.1", "localhost"):
        raise RuntimeError("Local paired mode must bind to localhost.")
    directory = Path(os.environ.get("ANONYMOUS_LOCAL_DATA_DIR", str(ROOT / ".local-data"))).expanduser().absolute()
    if directory.is_symlink():
        raise RuntimeError("The local data directory must not be a symlink.")
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    marker = directory / "installation.json"
    if not marker.exists():
        if any(directory.iterdir()):
            raise RuntimeError("Choose a new empty local data directory; existing databases are never imported.")
        marker.write_text(json.dumps({"format": "anonymous-local-store-v1"}), encoding="utf-8")
        marker.chmod(0o600)
    if marker.is_symlink() or json.loads(marker.read_text(encoding="utf-8")) != {"format": "anonymous-local-store-v1"}:
        raise RuntimeError("This is not an anonymous local installation.")
    secret_path = directory / "session-secret"
    if not secret_path.exists():
        descriptor = os.open(secret_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            handle.write(secrets.token_urlsafe(48))
    if secret_path.is_symlink():
        raise RuntimeError("The local secret must not be a symlink.")
    secret = secret_path.read_text(encoding="utf-8").strip()
    if not re.fullmatch(r"[A-Za-z0-9_-]{64}", secret):
        raise RuntimeError("The local installation secret is invalid.")
    database = directory / "paired.sqlite3"
    if database.is_symlink():
        raise RuntimeError("The local database must not be a symlink.")
    LOCAL_STORE_PATH = str(database)
    os.environ["RESEARCH_SQLITE_PATH"] = LOCAL_STORE_PATH
    os.environ["STUDY_ASSIGNMENT_SECRET"] = secret


configure_local_pair()


DEEPSEEK_BASE_URL = os.environ.get(
    "DEEPSEEK_BASE_URL",
    "https://api.deepseek.com/chat/completions",
)
DEFAULT_DEEPSEEK_PRO_MODEL = os.environ.get(
    "DEEPSEEK_PRO_MODEL",
    os.environ.get("DEEPSEEK_MODEL", "deepseek-v4-pro"),
)
DEFAULT_DEEPSEEK_FLASH_MODEL = os.environ.get("DEEPSEEK_FLASH_MODEL", "deepseek-v4-flash")
TEXT_AGENT_PROVIDER = os.environ.get("TEXT_AGENT_PROVIDER", "deepseek").strip().lower()
TEXT_AGENT_MODEL = os.environ.get("TEXT_AGENT_MODEL", "gpt-6.1-sol").strip()
TEXT_AGENT_REASONING_EFFORT = os.environ.get("TEXT_AGENT_REASONING_EFFORT", "medium").strip()
TEXT_AGENT_ROUTING_PROFILE = os.environ.get("TEXT_AGENT_ROUTING_PROFILE", "sol-luna-v1").strip()
OPENAI_CHAT_BASE_URL = "https://api.openai.com/v1/chat/completions"
OPENAI_TEXT_MODEL = "gpt-6.1-sol"
OPENAI_TEXT_MAX_COMPLETION_TOKENS = 8192


def load_text_agent_routing_policy() -> tuple[dict, str]:
    """Read the shared route table; malformed configuration never enables I/O."""
    try:
        policy = json.loads(Path(__file__).with_name("text_agent_routing.json").read_text(encoding="utf-8"))
        if not isinstance(policy, dict) or set(policy) != {"version", "defaultProfile", "profiles", "purposes"}:
            raise ValueError("Invalid routing policy fields")
        if policy["version"] != "sol-luna-v1" or policy["defaultProfile"] != "sol_medium":
            raise ValueError("Unsupported routing policy")
        expected = {"sol_low": ("gpt-6.1-sol", "low"), "sol_medium": ("gpt-6.1-sol", "medium"),
                    "luna_low": ("gpt-6-luna", "low"), "luna_none": ("gpt-6-luna", "none")}
        profiles, purposes = policy["profiles"], policy["purposes"]
        if (not isinstance(profiles, dict) or set(profiles) != set(expected)
                or not isinstance(purposes, dict) or len(purposes) != 17):
            raise ValueError("Invalid routing profiles")
        for name, identity in expected.items():
            profile = profiles[name]
            if (not isinstance(profile, dict) or set(profile) != {"model", "reasoningEffort", "maxCompletionTokens"}
                    or (profile["model"], profile["reasoningEffort"]) != identity
                    or type(profile["maxCompletionTokens"]) is not int
                    or profile["maxCompletionTokens"] != OPENAI_TEXT_MAX_COMPLETION_TOKENS):
                raise ValueError("Invalid routing profile")
        if any(not isinstance(purpose, str) or not re.fullmatch(r"[a-z][a-z0-9_]{0,99}", purpose)
               or not isinstance(profile, str) or profile not in profiles for purpose, profile in purposes.items()):
            raise ValueError("Invalid purpose routing")
        # Pin the approved v1 mapping without maintaining a second route table.
        # Runtime source manifests separately protect the file with SHA256.
        fingerprint = 2166136261
        for character in json.dumps(policy, sort_keys=True, separators=(",", ":"), ensure_ascii=True):
            fingerprint = ((fingerprint ^ ord(character)) * 16777619) & 0xffffffff
        if f"fnv1a32-{fingerprint:08x}" != "fnv1a32-f5aac5f3":
            raise ValueError("Routing table differs from the approved v1 mapping")
        return policy, ""
    except (OSError, ValueError, TypeError, KeyError):
        return {}, "The configured OpenAI routing policy is unavailable or invalid."


TEXT_AGENT_ROUTING_POLICY, TEXT_AGENT_ROUTING_POLICY_ERROR = load_text_agent_routing_policy()
BUILD_VERSION = "anonymous-release"
CODE_COMMIT = "anonymous-release"
API_CONTRACT_VERSION = "socialevo-api-v3"
GOOGLE_VISION_BASE_URL = os.environ.get(
    "GOOGLE_VISION_BASE_URL",
    "https://vision.googleapis.com/v1/images:annotate",
)
ACCESS_CODE = os.environ.get("ACCESS_CODE", "").strip()
OPENAI_TTS_BASE_URL = os.environ.get(
    "OPENAI_TTS_BASE_URL",
    "https://api.openai.com/v1/audio/speech",
)
OPENAI_TTS_MODEL = os.environ.get("OPENAI_TTS_MODEL", "gpt-4o-mini-tts")
OPENAI_VOICE_MODE = os.environ.get("OPENAI_VOICE_MODE", "live").strip().lower()
NPC_VOICE_PROVIDER = os.environ.get("NPC_VOICE_PROVIDER", "qwen").strip().lower()
QWEN_VOICE_MODE = os.environ.get("QWEN_VOICE_MODE", "flash").strip().lower()
ACCESS_COOKIE_NAME = "emo_agent_access"
MAX_CHAT_BODY_BYTES = 1_500_000
MAX_FACE_BODY_BYTES = 1_500_000
MAX_TTS_BODY_BYTES = 16_000
MAX_TTS_AUDIO_BYTES = 10_000_000
MAX_TERMINAL_EXPORT_BYTES = 5_000_000
MAX_PAIRED_EXPORT_BYTES = 25_000_000
CHAT_UPSTREAM_TIMEOUT_SECONDS = 150
PAIRED_CHAT_UPSTREAM_TIMEOUT_SECONDS = 110
GOOGLE_VISION_TIMEOUT_SECONDS = 8
OPENAI_TTS_TIMEOUT_SECONDS = 45
TTS_PCM_SAMPLE_RATE = 24000
TTS_STREAM_CHUNK_BYTES = 4096
ALLOWED_PRODUCT_MODELS = {
    "deepseek-flash",
    "deepseek-v4-flash",
    "deepseek-pro",
    "deepseek-v4-pro",
}
OPENAI_TTS_VOICE_PROFILES = {
    "mina": {
        "voice": "marin",
        "live_voice": "marin",
        "name": "Dr. Lin",
        "vocal_age": "a woman in her early-to-mid 40s",
        "instruction": "A fair but cautious research advisor. A mature female mid-to-low register, calm precision, composed warmth, and gently corrective emphasis. Use a conversational pace, not a slow lecture. Concern can sharpen her precision without turning her into a different character.",
    },
    "leo": {
        "voice": "echo",
        "live_voice": "ripple",
        "name": "Jun",
        "vocal_age": "a man in his early 20s",
        "instruction": "A young male labmate with a light-to-medium register, quiet warmth, careful phrasing, and sincere, specific support. Under pressure he sounds more hesitant, not suddenly aggressive. Remain clearly audible; do not whisper, stammer, or add filler sounds.",
    },
    "sam": {
        "voice": "onyx",
        "live_voice": "meridian",
        "name": "Kai",
        "vocal_age": "a man in his late 20s",
        "instruction": "A capable senior graduate student. A grounded male mid-to-low register, concise and slightly brisk phrasing, guarded confidence, and crisp emphasis. Pressure may make his delivery clipped or defensive; respect or cooperation must be supported by this actual line, not assumed.",
    },
    "riley": {
        "voice": "cedar",
        "live_voice": "vesper",
        "name": "Prof. Zhao",
        "vocal_age": "a man in his late 50s to early 60s",
        "instruction": "A senior male professor and high-pressure project lead. A low, mature register with controlled authority, decisive sentence endings, evaluative emphasis, and short purposeful pauses. Convey criticism or reluctant acknowledgment only when the line supports it. Never shout, caricature an older person, or become theatrically villainous.",
    },
    "nora": {
        "voice": "coral",
        "live_voice": "gleam",
        "name": "Emma",
        "vocal_age": "a woman in her early-to-mid 20s",
        "instruction": "A young female peer with a soft but clear medium register, mild brightness, polite warmth, and socially cautious phrasing. Uncertainty may introduce a brief natural hesitation; relief can sound less guarded. Avoid breathy whispering, infantilization, long pauses, and exaggerated cuteness.",
    },
}
QWEN_CHARACTER_PROFILES = {
    "mina": {"description": "Dr. Lin，40多岁的成年女性导师，清晰的中低声线，克制、精确、温和纠偏；自然对话节奏，不像讲课。", "seed": 1177},
    "leo": {"description": "Jun，20出头的成年男性同学，年轻清晰的中音，温暖、谨慎、真诚；不耳语，不夸张卖萌。", "seed": 2219},
    "sam": {"description": "Kai，接近30岁的成年男性研究生，干练的中低音，直接、简洁、略快；压力下略有防备，但不吼叫。", "seed": 3323},
    "riley": {"description": "Prof. Zhao，50多岁到60出头的成年男性教授，成熟低音，冷静、带权威感，强调重点；不演成恶人，不怒吼。", "seed": 4421},
    "nora": {"description": "Emma，20多岁的成年女性同学，柔和而清晰的中音，礼貌、略带谨慎；不是儿童音，不刻意气声。", "seed": 5531},
}
QWEN_FLASH_VOICES = {
    "mina": {"zh": "guyunshu_v3.1", "en": "Donna_v3.1"},
    "leo": {"zh": "anmingyuan_v3.1", "en": "Andy_v3.1"},
    "sam": {"zh": "longanzhi_v3.1", "en": "Brian_v3.1"},
    "riley": {"zh": "longsanshu_v3.1", "en": "David_v3.1"},
    "nora": {"zh": "xieshurou_v3.1", "en": "Annie_v3.1"},
}
TTS_EMOTION_DIRECTIONS = {
    "neutral": "emotionally restrained and natural",
    "happy": "subtly pleased or warm, without an exaggerated smile in every word",
    "sad": "subdued and affected, while remaining articulate",
    "angry": "controlled frustration, firmer emphasis, never shouting",
    "surprised": "a brief lift of surprise followed by grounded speech",
    "worried": "concern or tension in the phrasing, not constant tremor",
    "skeptical": "cautious or questioning, with selective emphasis",
    "relieved": "a release of tension and steadier confidence, not automatic affection",
}
TTS_TONE_DIRECTIONS = {
    "neutral": "natural conversational delivery",
    "measured": "composed, precise delivery with economical pauses",
    "warm": "gentle, approachable delivery without forced intimacy",
    "cautious": "careful, reserved delivery with mild hesitation",
    "firm": "direct, clear, controlled emphasis",
    "tense": "brisker and tighter delivery without rushing or shouting",
    "supportive": "reassuring but specific delivery, not sentimental",
    "reflective": "thoughtful, even delivery without long dramatic silences",
}
TTS_STAGE_DIRECTIONS = {
    "opening": "The group is meeting a newly transferred member; this is an introductory exchange.",
    "stage_1_entry": "The scene concerns entering the lab and clarifying an initial role.",
    "stage_2_first_failure": "The scene concerns the first lab task and its review or criticism.",
    "stage_3_revision_conflict": "The scene concerns revisions, disagreement, and clarification of responsibility.",
    "stage_4_credit": "The scene concerns contribution, credit, and the outcome of the collaboration.",
    "ending": "This is a closing exchange; its emotional outcome is determined by the spoken line.",
}
TTS_SITUATION_DIRECTIONS = {
    "group": "Address a small lab group naturally, not an auditorium.",
    "private_talk": "This is a one-to-one exchange; slightly quieter and closer, but clearly audible.",
    "relationship_transfer": "An ambiguous project incident is being discussed; preserve uncertainty and do not imply guilt or innocence beyond the actual words.",
}
STUDY_PROTOCOL_VERSION = "lab-entry-rq3-v22-paired-ab"
STUDY_SESSION_TTL_SECONDS = 8 * 60 * 60
STUDY_COOKIE_NAME = "socialevo_study"
STUDY_SESSIONS: dict[str, dict] = {}
STUDY_SESSIONS_LOCK = threading.Lock()
RESEARCH_STORES: dict[tuple, research_store.ResearchStore] = {}
RESEARCH_STORES_LOCK = threading.Lock()


def research_ab_enabled() -> bool:
    return LOCAL_PAIR_MODE


def get_research_store() -> research_store.ResearchStore:
    if not research_ab_enabled() or not _study_secret():
        raise research_store.ResearchError(503, "study_not_configured", "The paired study is not configured.")
    backend = os.environ.get("RESEARCH_STORAGE_BACKEND", "").strip().lower()
    prefix = os.environ.get("RESEARCH_STORAGE_PREFIX", "study-ab-v1").strip()
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", prefix):
        raise research_store.ResearchError(503, "study_not_configured", "The study storage namespace is invalid.")
    sqlite_path = os.environ.get("RESEARCH_SQLITE_PATH", "").strip()
    if backend != "sqlite" or not LOCAL_STORE_PATH or sqlite_path != LOCAL_STORE_PATH:
        raise research_store.ResearchError(503, "study_not_configured", "Durable study storage is not configured.")
    key = (backend, prefix, sqlite_path, STUDY_PROTOCOL_VERSION, BUILD_VERSION, CODE_COMMIT)
    with RESEARCH_STORES_LOCK:
        store = RESEARCH_STORES.get(key)
        if store is None:
            source = {"buildVersion": BUILD_VERSION, "codeCommit": CODE_COMMIT, "apiContractVersion": API_CONTRACT_VERSION}
            store = research_store.SQLiteResearchStore(sqlite_path, prefix, STUDY_PROTOCOL_VERSION, source)
            RESEARCH_STORES[key] = store
    return store


def research_runtime_metadata() -> dict:
    enabled = research_ab_enabled()
    backend = os.environ.get("RESEARCH_STORAGE_BACKEND", "").strip().lower()
    configured = backend == "sqlite" and bool(LOCAL_STORE_PATH)
    healthy = False
    if enabled and configured:
        try:
            get_research_store()
            healthy = True
        except Exception:
            pass
    secure_required = os.environ.get("RESEARCH_REQUIRE_SECURE", "") == "1"
    secure_configured = not secure_required or (os.environ.get("RESEARCH_PUBLIC_URL", "").startswith("https://") and bool(os.environ.get("RESEARCH_ORIGIN_SECRET", "").strip()))
    return {"enabled": enabled, "ready": enabled and healthy and bool(_study_secret()) and secure_configured,
            "healthy": healthy, "storageConfigured": bool(configured), "storageBackend": backend if enabled else None,
            "protocolVersion": STUDY_PROTOCOL_VERSION, "participantCapacity": len(research_store.PARTICIPANTS), "counterbalancedOrders": True,
            "secureTransportRequired": secure_required, "privateExports": True}


def study_capabilities(condition: str) -> dict:
    shared = {
        "storeMemory": True,
        "retrieveMemory": True,
        "useRag": True,
        "useRecentWindow": False,
    }
    if condition == "self-evolving":
        return {
            **shared,
            "updateEmotion": True,
            "updateSurfaceLine": True,
            "updateTrustBelonging": True,
            "updateRelationship": True,
            "updateValueTradeoffs": True,
            "updateStrategy": True,
        }
    return {
        **shared,
        "updateEmotion": False,
        "updateSurfaceLine": False,
        "updateTrustBelonging": False,
        "updateRelationship": False,
        "updateValueTradeoffs": False,
        "updateStrategy": False,
    }


def study_capability_hash(condition: str) -> str:
    payload = {"id": condition, **study_capabilities(condition)}
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    value = 2166136261
    for character in encoded:
        value ^= ord(character)
        value = (value * 16777619) & 0xFFFFFFFF
    return f"fnv1a32-{value:08x}"


def _study_secret() -> str:
    return os.environ.get("STUDY_ASSIGNMENT_SECRET", "").strip()


def _study_signature(assignment_id: str, auth_generation: str | None = None) -> str:
    return study_account_auth.scoped_signature(_study_secret(), assignment_id, auth_generation)


def issue_study_session(participant_id: str) -> tuple[str, dict]:
    secret = _study_secret()
    if not secret:
        raise RuntimeError("study assignment is not configured")
    participant_hash = hmac.new(
        secret.encode("utf-8"),
        participant_id.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    arm_digest = hmac.new(
        secret.encode("utf-8"),
        f"{STUDY_PROTOCOL_VERSION}:{participant_hash}".encode("utf-8"),
        hashlib.sha256,
    ).digest()
    condition = "self-evolving" if arm_digest[0] % 2 == 0 else "memory-only"
    assignment_id = f"study-{uuid.uuid4().hex}"
    expires_at = int(time.time()) + STUDY_SESSION_TTL_SECONDS
    record = {
        "assignmentId": assignment_id,
        "participantHash": participant_hash,
        "condition": condition,
        "capabilities": study_capabilities(condition),
        "capabilityHash": study_capability_hash(condition),
        "protocolVersion": STUDY_PROTOCOL_VERSION,
        "issuedAt": int(time.time()),
        "expiresAt": expires_at,
    }
    with STUDY_SESSIONS_LOCK:
        STUDY_SESSIONS[assignment_id] = record
    return f"{assignment_id}.{_study_signature(assignment_id)}", record


def verify_study_token(token: str) -> dict | None:
    assignment_id, separator, signature = str(token or "").partition(".")
    if not separator or not re.fullmatch(r"[0-9a-f]{64}", signature) or not _study_secret():
        return None
    if research_store.assignment_participant(assignment_id):
        if not research_ab_enabled():
            return None
        record = get_research_store().assignment(assignment_id)
        if record:
            record["capabilities"] = {"id": record["condition"], **study_capabilities(record["condition"])}
            record["capabilityHash"] = study_capability_hash(record["condition"])
    else:
        with STUDY_SESSIONS_LOCK:
            record = STUDY_SESSIONS.get(assignment_id)
    if not record or int(record.get("expiresAt", 0)) <= int(time.time()):
        return None
    if not hmac.compare_digest(signature, _study_signature(assignment_id, record.get("authGeneration"))):
        return None
    return record


def access_cookie_value() -> str:
    secret = os.environ.get("ACCESS_COOKIE_SECRET", ACCESS_CODE)
    return hashlib.sha256(f"{ACCESS_CODE}:{secret}".encode("utf-8")).hexdigest()


def resolve_deepseek_model(requested: str | None) -> str:
    model = str(requested or "deepseek-pro").strip()
    if model == "deepseek-flash":
        return DEFAULT_DEEPSEEK_FLASH_MODEL
    if model == "deepseek-v4-flash":
        return DEFAULT_DEEPSEEK_FLASH_MODEL
    if model in {"deepseek-pro", "deepseek-v4-pro"}:
        return DEFAULT_DEEPSEEK_PRO_MODEL
    return model


def text_agent_configuration_error() -> str:
    if TEXT_AGENT_PROVIDER not in {"deepseek", "openai"}:
        return "The configured text provider is not enabled."
    if TEXT_AGENT_PROVIDER == "openai" and (
        TEXT_AGENT_MODEL != OPENAI_TEXT_MODEL or TEXT_AGENT_REASONING_EFFORT != "medium"
    ):
        return "The configured OpenAI text model or reasoning effort is not enabled."
    if TEXT_AGENT_PROVIDER == "openai":
        if TEXT_AGENT_ROUTING_PROFILE not in {"sol-luna-v1", "single-sol-medium-v1"}:
            return "The configured OpenAI routing profile is not enabled."
        if TEXT_AGENT_ROUTING_PROFILE == "sol-luna-v1" and TEXT_AGENT_ROUTING_POLICY_ERROR:
            return TEXT_AGENT_ROUTING_POLICY_ERROR
    return ""


def openai_text_route(agent_purpose: str = "unspecified") -> dict:
    if TEXT_AGENT_ROUTING_PROFILE == "single-sol-medium-v1":
        return {"model": OPENAI_TEXT_MODEL, "reasoningEffort": "medium",
                "maxCompletionTokens": OPENAI_TEXT_MAX_COMPLETION_TOKENS}
    if TEXT_AGENT_ROUTING_PROFILE != "sol-luna-v1" or TEXT_AGENT_ROUTING_POLICY_ERROR:
        raise ValueError("OpenAI routing configuration is invalid")
    policy = TEXT_AGENT_ROUTING_POLICY
    return dict(policy["profiles"][policy["purposes"].get(agent_purpose, policy["defaultProfile"])])


def text_agent_runtime_metadata() -> dict:
    openai = TEXT_AGENT_PROVIDER == "openai"
    metadata = {
        "provider": TEXT_AGENT_PROVIDER,
        "model": TEXT_AGENT_MODEL if openai else DEFAULT_DEEPSEEK_PRO_MODEL,
        "reasoningEffort": TEXT_AGENT_REASONING_EFFORT if openai else "",
        "maxCompletionTokens": OPENAI_TEXT_MAX_COMPLETION_TOKENS if openai else 0,
        "temperatureSupported": not openai,
        "keyConfigured": bool(os.environ.get("OPENAI_API_KEY" if openai else "DEEPSEEK_API_KEY", "").strip()),
        "configurationValid": not bool(text_agent_configuration_error()),
    }
    if openai and TEXT_AGENT_ROUTING_PROFILE == "sol-luna-v1" and not TEXT_AGENT_ROUTING_POLICY_ERROR:
        metadata["routingPolicy"] = json.loads(json.dumps(TEXT_AGENT_ROUTING_POLICY))
    return metadata


def nonnegative_int(value: object) -> int:
    if isinstance(value, bool):
        return 0
    try:
        return max(0, int(value or 0))
    except (TypeError, ValueError):
        return 0


def log_chat_proxy_event(
    event_name: str,
    *,
    request_id: str,
    payload: dict,
    requested_model: str,
    resolved_model: str,
    started_at: float,
    upstream_status: int = 0,
    error_type: str = "",
    upstream_error_code: str = "",
) -> None:
    """Emit content-free diagnostics suitable for Elastic Beanstalk logs."""
    record = {
        "event": event_name,
        "requestId": request_id,
        "agentPurpose": str(payload.get("agentPurpose") or "unspecified")[:100],
        "requestedModel": requested_model,
        "resolvedModel": resolved_model,
        "requestedProvider": str(payload.get("provider", "deepseek")),
        "resolvedProvider": TEXT_AGENT_PROVIDER,
        "reasoningEffort": payload.get("reasoningEffort", "") if TEXT_AGENT_PROVIDER == "openai" else "",
        "latencyMs": round((time.monotonic() - started_at) * 1000),
    }
    if upstream_status:
        record["upstreamStatus"] = upstream_status
    if error_type:
        record["errorType"] = error_type
    if upstream_error_code:
        record["upstreamErrorCode"] = upstream_error_code
    print(json.dumps(record, ensure_ascii=True, sort_keys=True), flush=True)


def safe_upstream_error_code(exc: error.HTTPError) -> str:
    """Extract a provider error class without retaining its message or request content."""
    try:
        raw_body = exc.read(65536)
        parsed = json.loads(raw_body.decode("utf-8"))
    except (AttributeError, OSError, ValueError, UnicodeDecodeError, json.JSONDecodeError):
        return ""
    upstream_error = parsed.get("error") if isinstance(parsed, dict) else None
    if not isinstance(upstream_error, dict):
        return ""
    candidate = upstream_error.get("code") or upstream_error.get("type")
    if not isinstance(candidate, (str, int)):
        return ""
    header_safe = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_."
    return "".join(character for character in str(candidate)[:80] if character in header_safe)


def likelihood_score(value: str | None) -> float:
    scores = {
        "VERY_UNLIKELY": 0.02,
        "UNLIKELY": 0.18,
        "POSSIBLE": 0.5,
        "LIKELY": 0.78,
        "VERY_LIKELY": 0.95,
    }
    return scores.get(str(value or "").upper(), 0.0)


def normalize_google_face_response(upstream: dict) -> dict:
    responses = upstream.get("responses") or []
    annotations = []
    if responses and isinstance(responses[0], dict):
        annotations = responses[0].get("faceAnnotations") or []
    if not annotations:
        return {
            "ok": True,
            "provider": "google-vision",
            "facePresent": False,
            "confidence": 0,
            "expression": {"joy": 0, "sorrow": 0, "anger": 0, "surprise": 0},
            "attention": 0,
            "pose": {"pan": 0, "tilt": 0, "roll": 0},
            "quality": {"detectionConfidence": 0, "landmarkingConfidence": 0},
        }

    face = annotations[0]
    detection = float(face.get("detectionConfidence") or 0)
    landmarking = float(face.get("landmarkingConfidence") or 0)
    pan = float(face.get("panAngle") or 0)
    tilt = float(face.get("tiltAngle") or 0)
    roll = float(face.get("rollAngle") or 0)
    pose_penalty = min((abs(pan) + abs(tilt) + abs(roll) / 2) / 120, 0.55)
    attention = max(0, min(1, (detection * 0.7 + landmarking * 0.3) - pose_penalty))
    expression = {
        "joy": likelihood_score(face.get("joyLikelihood")),
        "sorrow": likelihood_score(face.get("sorrowLikelihood")),
        "anger": likelihood_score(face.get("angerLikelihood")),
        "surprise": likelihood_score(face.get("surpriseLikelihood")),
    }
    return {
        "ok": True,
        "provider": "google-vision",
        "facePresent": True,
        "confidence": round(detection, 3),
        "expression": expression,
        "attention": round(attention, 3),
        "pose": {"pan": round(pan, 2), "tilt": round(tilt, 2), "roll": round(roll, 2)},
        "quality": {
            "detectionConfidence": round(detection, 3),
            "landmarkingConfidence": round(landmarking, 3),
        },
    }


def validate_chat_payload(payload: object) -> str:
    if not isinstance(payload, dict):
        return "Chat request must be a JSON object."
    allowed_keys = {
        "provider",
        "model",
        "messages",
        "temperature",
        "agentPurpose",
        "responseFormat",
        "maxTokens",
        "reasoningEffort",
    }
    unexpected = sorted(set(payload) - allowed_keys)
    if unexpected:
        return f"Unsupported chat field: {unexpected[0]}."
    provider = payload.get("provider", "deepseek")
    if not isinstance(provider, str):
        return "provider must be a string."
    if "reasoningEffort" in payload and provider != "openai":
        return "reasoningEffort is only allowed for openai."
    if provider == "openai":
        if "temperature" in payload:
            return "temperature is not supported for the configured OpenAI text model."
        if payload.get("reasoningEffort") not in ("low", "medium", "none"):
            return "reasoningEffort is not enabled for openai."
        if payload.get("maxTokens") != OPENAI_TEXT_MAX_COMPLETION_TOKENS:
            return "maxTokens must be 8192 for openai."
        if payload.get("responseFormat") != "json_object":
            return "responseFormat must be json_object for openai."
    model = payload.get("model", "deepseek-pro")
    if not isinstance(model, str) or not model.strip() or len(model) > 80:
        return "model must be a short non-empty string."
    agent_purpose = payload.get("agentPurpose", "unspecified")
    if not isinstance(agent_purpose, str) or not agent_purpose.strip() or len(agent_purpose) > 100:
        return "agentPurpose must be a short non-empty string."
    if provider == "openai" and not text_agent_configuration_error():
        route = openai_text_route(agent_purpose)
        if payload.get("model") != route["model"] or payload.get("reasoningEffort") != route["reasoningEffort"]:
            return "The requested model or reasoning effort does not match this agent purpose."
    temperature = payload.get("temperature", 0.7)
    if isinstance(temperature, bool) or not isinstance(temperature, (int, float)):
        return "temperature must be numeric."
    if not 0 <= float(temperature) <= 2:
        return "temperature must be between 0 and 2."
    response_format = payload.get("responseFormat")
    if response_format is not None and response_format != "json_object":
        return "responseFormat must be json_object when provided."
    max_tokens = payload.get("maxTokens")
    if max_tokens is not None:
        if isinstance(max_tokens, bool) or not isinstance(max_tokens, int):
            return "maxTokens must be an integer."
        if not 64 <= max_tokens <= 32768:
            return "maxTokens must be between 64 and 32768."
    messages = payload.get("messages")
    if not isinstance(messages, list) or not 1 <= len(messages) <= 64:
        return "messages must contain between 1 and 64 entries."
    total_chars = 0
    for message in messages:
        if not isinstance(message, dict) or set(message) != {"role", "content"}:
            return "Each message must contain exactly role and content."
        if message.get("role") not in {"system", "user", "assistant"}:
            return "Message role is invalid."
        content = message.get("content")
        if not isinstance(content, str) or not content.strip():
            return "Message content must be a non-empty string."
        total_chars += len(content)
    if total_chars > 1_000_000:
        return "Combined message content is too large."
    return ""


def validate_face_payload(payload: object) -> str:
    if not isinstance(payload, dict):
        return "Face request must be a JSON object."
    if set(payload) != {"imageDataUrl"}:
        return "Face request must contain exactly imageDataUrl."
    image = payload.get("imageDataUrl")
    if not isinstance(image, str) or not image.startswith("data:image/jpeg;base64,"):
        return "imageDataUrl must be a JPEG data URL."
    if len(image) > MAX_FACE_BODY_BYTES:
        return "imageDataUrl is too large."
    return ""


def validate_tts_payload(payload: object) -> str:
    if not isinstance(payload, dict):
        return "Voice request must be a JSON object."
    required = {"speakerId", "text", "language"}
    if not required <= set(payload) or set(payload) - (required | {"delivery"}):
        return "Voice request must contain exactly speakerId, text, language, and optional delivery."
    speaker_id = payload.get("speakerId")
    if not isinstance(speaker_id, str) or speaker_id not in OPENAI_TTS_VOICE_PROFILES:
        return "speakerId is not enabled for NPC voice output."
    text = payload.get("text")
    if not isinstance(text, str) or not text.strip() or len(text) > 1200:
        return "text must contain between 1 and 1200 characters."
    if any(ord(character) < 32 and character not in "\n\t" for character in text):
        return "text contains unsupported control characters."
    if not isinstance(payload.get("language"), str) or payload["language"] not in {"zh", "en"}:
        return "language must be zh or en."
    if "delivery" in payload:
        delivery = payload["delivery"]
        allowed = {
            "emotion": TTS_EMOTION_DIRECTIONS,
            "tone": TTS_TONE_DIRECTIONS,
            "stage": TTS_STAGE_DIRECTIONS,
            "situation": TTS_SITUATION_DIRECTIONS,
        }
        if not isinstance(delivery, dict) or set(delivery) != set(allowed):
            return "delivery must contain exactly emotion, tone, stage, and situation."
        if any(not isinstance(delivery[key], str) or delivery[key] not in choices for key, choices in allowed.items()):
            return "delivery contains an unsupported expression, tone, stage, or situation."
    return ""


def tts_instructions(payload: dict, *, natural: bool = False) -> str:
    """Only public delivery enums influence prosody; no appraisal or memory input."""
    profile = OPENAI_TTS_VOICE_PROFILES[payload["speakerId"]]
    delivery = payload.get("delivery", {})
    language = (
        "Speak fluent natural Mandarin Chinese with connected phrasing and clear diction, without exaggerated pauses between words."
        if payload["language"] == "zh"
        else "Speak fluent natural English with connected conversational phrasing and clear diction."
    )
    return " ".join([
        f"Voice-act {profile['name']}. Vocal age impression: {profile['vocal_age']}; this is a voice-casting direction, not additional story content.",
        profile["instruction"], language,
        "Maintain the same speaker identity, gender presentation, accent, and basic register across every line.",
        "This line's visible emotion: " + TTS_EMOTION_DIRECTIONS[delivery.get("emotion", "neutral")] + ".",
        "This line's speaking tone: " + TTS_TONE_DIRECTIONS[delivery.get("tone", "neutral")] + ".",
        TTS_STAGE_DIRECTIONS[delivery.get("stage", "stage_1_entry")],
        TTS_SITUATION_DIRECTIONS[delivery.get("situation", "group")],
        "Story stage supplies setting, not a command to become friendlier or more hostile. The actual words and this line's delivery labels take precedence; do not invent relationship changes.",
        (
            "This is an experimental natural-voice presentation, not a new decision agent. You may lightly rephrase the approved source line into natural spoken language. Preserve its meaning, uncertainty, negation, stance, speaker, names, and responsibility. Do not add facts, evidence, commitments, actions, claims of trust or friendship, questions, or other characters. Do not describe emotions aloud or read directions. Do not delegate or call tools. Wait silently until the application tells you to speak; then say just one short NPC turn and remain silent."
            if natural else
            "Read the input exactly. Do not read these directions, describe emotions aloud, add words, dialogue, breaths, laughter, music, or sound effects. Use subtle acting and brief punctuation pauses, never word-by-word narration."
        ),
    ])


def voice_dependency_ready() -> bool:
    if NPC_VOICE_PROVIDER == "qwen":
        return QWEN_VOICE_MODE == "next" or (QWEN_VOICE_MODE == "flash" and flash_transport_available())
    if NPC_VOICE_PROVIDER != "openai":
        return False
    return OPENAI_VOICE_MODE == "tts" or (OPENAI_VOICE_MODE == "live" and transport_available())


def voice_runtime_metadata() -> dict:
    if NPC_VOICE_PROVIDER == "qwen":
        workspace = os.environ.get("SFM_WORKSPACE_ID", "").strip()
        if QWEN_VOICE_MODE != "next":
            ready = QWEN_VOICE_MODE == "flash" and flash_transport_available()
            return {"provider": "dashscope", "engine": "qwen-flash" if QWEN_VOICE_MODE == "flash" else "invalid",
                "model": FLASH_MODEL if QWEN_VOICE_MODE == "flash" else "",
                "configured": bool(os.environ.get("DASHSCOPE_API_KEY", "").strip()) and valid_workspace(workspace) and ready,
                "dependencyReady": ready, "streaming": QWEN_VOICE_MODE == "flash", "format": "pcm_s16le",
                "sampleRate": 24000, "requestTimeoutMs": 45000, "paraphrase": False, "microphone": False,
                "profileVersion": "qwen-flash-cast-v1"}
        return {"provider": "dashscope", "engine": "qwen-next", "model": QWEN_MODEL,
            "configured": bool(os.environ.get("DASHSCOPE_API_KEY", "").strip()) and valid_workspace(workspace),
            "dependencyReady": True, "streaming": False, "format": "wav", "sampleRate": 24000,
            "requestTimeoutMs": 150000, "paraphrase": False, "microphone": False,
            "profileVersion": "qwen-next-prompt-v1"}
    return {"provider": "openai", "engine": OPENAI_VOICE_MODE,
        "model": LIVE_MODEL if OPENAI_VOICE_MODE == "live" else OPENAI_TTS_MODEL,
        "configured": bool(os.environ.get("OPENAI_API_KEY", "").strip()) and voice_dependency_ready(),
        "dependencyReady": voice_dependency_ready(), "streaming": True, "format": "pcm_s16le",
        "sampleRate": TTS_PCM_SAMPLE_RATE, "requestTimeoutMs": 45000,
        "paraphrase": OPENAI_VOICE_MODE == "live", "microphone": False, "profileVersion": "npc-delivery-v1"}


def qwen_voice_instruction(payload: dict) -> str:
    delivery = payload.get("delivery", {})
    emotion = {"neutral": "自然克制", "happy": "轻微愉悦", "sad": "略有低落但吐字清楚", "angry": "克制不满，不大喊",
        "surprised": "短暂惊讶后恢复自然", "worried": "有担心或紧张", "skeptical": "谨慎质疑", "relieved": "松一口气，但不自动变亲密"}[delivery.get("emotion", "neutral")]
    tone = {"neutral": "自然对话", "measured": "平稳精确", "warm": "温和但不过度亲密", "cautious": "谨慎而清晰",
        "firm": "直接坚定", "tense": "稍紧绷但不急促", "supportive": "真诚支持", "reflective": "短暂思考，不长时间沉默"}[delivery.get("tone", "neutral")]
    stage = {"opening": "初次见面", "stage_1_entry": "临时入组", "stage_2_first_failure": "第一项任务与评议",
        "stage_3_revision_conflict": "修改与责任讨论", "stage_4_credit": "贡献与成果讨论", "ending": "结束交流"}[delivery.get("stage", "stage_1_entry")]
    situation = {"group": "向小组说话", "private_talk": "一对一交流，稍轻但清楚", "relationship_transfer": "讨论模糊失误，不擅自判断责任"}[delivery.get("situation", "group")]
    language = "流利自然的普通话" if payload["language"] == "zh" else "自然流利的英语"
    return (
        "生成一段单人干净配音，只有该角色的人声；不要背景音乐、环境声、音效、旁白或其他说话人。\n"
        + "角色声线：" + QWEN_CHARACTER_PROFILES[payload["speakerId"]]["description"] + "年龄是声龄指导，不增加剧情事实。\n"
        + f"用{language}，情绪{emotion}，语气{tone}。公开场景：{stage}，{situation}。阶段只提供背景，不强制越后越友好。\n"
        + "只读输入原台词，不读提示、角色名或标签；不要改写、添加、删减台词，不改变否定、疑问、事实和责任归属。保持自然连贯表达，不逐字断句。\n"
    )


def qwen_voice_prompt(payload: dict) -> str:
    return qwen_voice_instruction(payload) + "台词：" + json.dumps(payload["text"].strip(), ensure_ascii=False)


def validate_terminal_export(payload: object, study_record: dict) -> str:
    if not isinstance(payload, dict) or payload.get("schemaVersion") != "2.0":
        return "Terminal export must be an ExportV2 object."
    session = payload.get("session")
    terminal = payload.get("terminal")
    research = payload.get("researchStudy")
    video = payload.get("video")
    if not isinstance(session, dict) or not isinstance(session.get("sessionId"), str):
        return "Terminal export requires a sessionId."
    if not isinstance(terminal, dict) or not terminal.get("reason") or not terminal.get("idempotencyKey"):
        return "Terminal export requires terminal reason and idempotencyKey."
    if not isinstance(research, dict) or research.get("assignmentId") != study_record.get("assignmentId"):
        return "Terminal export assignment does not match the study session."
    if not isinstance(video, dict) or any(
        video.get(key) is not False
        for key in ("rawFramesStored", "rawFramesExported", "sentToDialogueModel")
    ):
        return "Terminal export video boundary is invalid."
    forbidden_keys = {
        "apiKey", "api_key", "sessionToken", "imageDataUrl", "rawFrame", "rawFrames"
    }

    def contains_forbidden_key(value: object) -> bool:
        if isinstance(value, dict):
            return any(
                key in forbidden_keys or contains_forbidden_key(item)
                for key, item in value.items()
            )
        if isinstance(value, list):
            return any(contains_forbidden_key(item) for item in value)
        return False

    if contains_forbidden_key(payload):
        return "Terminal export contains a forbidden secret or raw-frame field."
    return ""


class PrototypeHandler(SimpleHTTPRequestHandler):
    def send_head(self):
        # Explicit public file types/roots protect GET and inherited HEAD alike.
        # Server source, local credentials, databases and config are never static.
        try:
            requested_parts = parse.unquote(parse.urlsplit(self.path).path).replace("\\", "/").split("/")
            target = Path(self.translate_path(self.path)).resolve()
            relative = target.relative_to(ROOT)
            parts = requested_parts + list(relative.parts)
            private = any(
                part.startswith(".") or part.lower().startswith("api_keys.local")
                for part in parts
            )
            suffix = relative.suffix.lower()
            public = (
                relative == Path("index.html") or relative == Path("text_agent_routing.json")
                or relative == Path("src/lab-recap-choices.json")
                or relative.parent == Path(".") and suffix == ".css"
                or relative.parts and relative.parts[0] == "src" and suffix in {".js", ".css"}
                or relative.parts and relative.parts[0] in {"assets", "vendor"} and suffix in {".png", ".jpg", ".jpeg", ".svg", ".webp", ".gif"}
                or relative.parts and relative.parts[0] == "questionnaires" and suffix in {".html", ".md"}
            )
            # Directories are never listed; '/' resolves to the game index.
            if relative == Path(".") and target.is_dir():
                public = True
            private = private or not public
        except (OSError, RuntimeError, ValueError):
            private = True
        if private:
            self.send_error(404, "File not found")
            return None
        return super().send_head()

    def list_directory(self, path):
        # Do not publish config filenames or other project directory contents.
        self.send_error(404, "File not found")
        return None

    def do_GET(self) -> None:
        route = parse.urlsplit(self.path)
        if route.path.startswith("/api/research") or route.path == "/research-admin.html":
            self._error_response(404, "endpoint_disabled", "Research administration is not included in this release.")
            return
        if self.path == "/health":
            self._json_response(
                200,
                {
                    "status": "ok",
                    "buildVersion": BUILD_VERSION,
                    "codeCommit": CODE_COMMIT,
                    "scenarioVersion": "lab-entry-v1",
                    "apiContractVersion": API_CONTRACT_VERSION,
                    "textAgent": text_agent_runtime_metadata(),
                    "materialEvidence": {"version": "lab-public-work-evidence-v1", "answerability": "lab-question-answerability-v7-feedback-scope", "originalBriefImmutable": True, "rawAnalysisTableProvided": False, "folderHierarchyProvided": False},
                    "replyChoices": {"version": "npc-branch-replies-v4-semantic-agent", "source": "delivered-npc-alternatives", "customReply": True, "modelCalls": True, "agentPurpose": "ui_reply_options", "optional": True, "timeoutMs": 10000, "inputScope": "current-delivered-line-only", "scoresPlayer": False},
                    "reviewMaterials": {"version": "lab-review-materials-v1-source-board", "source": "immutable-brief", "rawDataProvided": False, "draftOnly": True},
                    "groupThread": {"version": "lab-group-thread-v1-ordered", "orderedPreparation": True, "draftPrefixIsHistoricalEvidence": False, "transferProbeIndependent": True},
                    "cooperativeWorkspace": {"version": "lab-cooperation-v1", "stageAwarePacks": True, "notesArePrivateDrafts": True, "newProgressGates": False, "originalSourcesUnchanged": True},
                    "reviewEpisode": {"version": "lab-review-episode-v1", "stage": "stage_2_first_failure", "newProgressGates": False, "consultationRequired": False, "draftIsSubmission": False},
                    "socialEnvironment": {"version": "lab-social-world-v1", "distributedRoles": True, "sourceOnlyDiscovery": True, "trustGate": False, "consultEveryoneRequired": False, "conditionSpecificOpportunity": False},
                    "workEpisodes": {"version": "lab-work-episodes-v1", "stages": ["stage_3_revision_conflict", "stage_4_credit"], "newProgressGates": False, "proposalIsAgreement": False},
                    "workRevision": {"version": "lab-work-revision-v1", "explicitOnly": True, "sameTaskCriteria": True, "beforeIncidentOrCore": True, "identicalReplayRejected": True, "historyGradesRetained": True},
                    "bgm": {"version": "lab-bgm-v2-c-slow60", "track": "c-slow60", "bpm": 60, "engine": "local-web-audio", "enabledInStudy": research_ab_enabled()},
                    **({"studyAudio": {"version": "study-audio-v1", "npcVoice": "optional-verbatim", "backgroundMusic": "optional", "microphone": False, "camera": False, "settingsRecorded": True}} if research_ab_enabled() else {}),
                    "voice": voice_runtime_metadata(),
                    "recapImage": {"keyConfigured": bool(os.environ.get("OPENAI_API_KEY", "").strip()), "model": os.environ.get("OPENAI_RECAP_IMAGE_MODEL", "gpt-image-2"), "styleReference": "lab-entry-cover-v2", "requestMode": "async-job", "studyReleaseAvailable": research_ab_enabled()},
                    **({"pairedRecap": {"version": "paired-keepsakes-v1", "perGameCards": True, "illustrationRelease": "after-pair-completed", "questionnaireCompletedByThisFeature": False}} if research_ab_enabled() else {}),
                    "researchAB": research_runtime_metadata(),
                    "studyAccount": {"version": study_account_auth.VERSION, "enabled": os.environ.get("RESEARCH_ACCOUNT_AUTH_ENABLED", "") == "1",
                                     "passwordTransport": "dedicated-https-origin", "legacyGameOriginHTTPS": False},
                    **({"studyRecovery": {"version": "paired-game-recovery-v1", "enabled": True, "currentSavedGameOnly": True, "automaticRequestReplay": False}} if research_ab_enabled() else {}),
                    **({"studyQuestionnaire": research_questionnaire.metadata()} if research_questionnaire.enabled() else {}),
                },
                headers={"Cache-Control": "no-store"},
            )
            return
        route = parse.urlsplit(self.path)
        if route.path.startswith("/api/study/account/"):
            self._handle_study_account()
            return
        if route.path == "/api/research/admin-bootstrap":
            self._handle_research_get(route.path)
            return
        if research_ab_enabled() and route.path == "/research-admin.html" and os.environ.get("RESEARCH_REQUIRE_SECURE", "") == "1" and not self._secure_research_origin():
            self.send_response(302)
            self.send_header("Location", os.environ.get("RESEARCH_PUBLIC_URL", "").rstrip("/") + "/research-admin.html")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if research_ab_enabled() and route.path in ("/", "/index.html"):
            params = parse.parse_qs(route.query)
            if params.get("mode") != ["demo"]:
                base = os.environ.get("RESEARCH_PUBLIC_URL", "").rstrip("/")
                secure_required = os.environ.get("RESEARCH_REQUIRE_SECURE", "") == "1"
                should_redirect = not (params.get("study") == ["1"] and params.get("paired") == ["1"]) or (secure_required and not self._secure_research_origin())
                if should_redirect:
                    self.send_response(302)
                    self.send_header("Location", f"{base}/?study=1&paired=1")
                    self.send_header("Cache-Control", "no-store")
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                    return
        if not self._has_access():
            if route.path in ("/api/study/pair/keepsakes", "/api/study/pair/recap-image-status", "/api/study/pair/questionnaire", "/api/study/pair/recovery"):
                self._error_response(403, "access_required", "Access code required.")
                return
            self._access_page()
            return
        if route.path == "/api/study/pair/questionnaire":
            self._handle_questionnaire()
            return
        if route.path == "/api/study/pair/recovery":
            self._handle_study_recovery()
            return
        if route.path in ("/api/study/pair/keepsakes", "/api/study/pair/recap-image-status"):
            self._handle_pair_keepsakes("keepsakes" if route.path.endswith("/keepsakes") else "status")
            return
        if route.path == "/api/study/pair":
            self._handle_study_pair("current")
            return
        if route.path in ("/api/research/participants", "/api/research/export", "/api/research/admin-bootstrap"):
            self._handle_research_get(route.path)
            return
        if parse.urlsplit(self.path).path == '/api/recap-image-status':
            if research_ab_enabled() or self._pair_owner_cookie():
                self._error_response(403, 'paired_recap_required', 'Use the owner-scoped paired keepsakes.');return
            study, ok = self._validated_study_context(uuid.uuid4().hex)
            if not ok:return
            if study:
                self._error_response(403,'study_recap_disabled','Art cannot precede the research questionnaire.');return
            params=parse.parse_qs(parse.urlsplit(self.path).query)
            job=params.get('job',[''])[0]
            if set(params)!={'job'} or len(params['job'])!=1 or len(job)!=32 or any(ch not in '0123456789abcdef' for ch in job):
                self._error_response(400,'invalid_job','Invalid image job.');return
            result=recap_image.job_result(self.client_address[0],job)
            if result is None:self._error_response(404,'image_job_unavailable','Image job not available.');return
            self._json_response(200,result,headers={'Cache-Control':'no-store'});return
        super().do_GET()

    def do_POST(self) -> None:
        route = parse.urlsplit(self.path)
        if route.path.startswith("/api/research") or route.path in {"/api/study/session", "/api/feedback"} or route.path == "/api/session-terminal" and not research_ab_enabled():
            self._error_response(404, "collection_disabled", "Automatic research collection is disabled in this release.")
            self.close_connection = True
            return
        if parse.urlsplit(self.path).path.startswith("/api/study/account/"):
            self._handle_study_account()
            return
        if self.path == "/api/access":
            self._handle_access_check()
            return
        if not self._has_access():
            self._error_response(403, "access_required", "Access code required.")
            return
        if self.path in ("/api/study/pair", "/api/study/pair/advance", "/api/study/pair/complete", "/api/study/pair/checkpoint"):
            self._handle_study_pair({"/api/study/pair": "claim", "/api/study/pair/advance": "advance", "/api/study/pair/complete": "complete", "/api/study/pair/checkpoint": "checkpoint"}[self.path])
            return
        if self.path == "/api/study/pair/recap-image":
            self._handle_pair_keepsakes("image")
            return
        if self.path == "/api/study/pair/questionnaire":
            self._handle_questionnaire()
            return
        if self.path == "/api/study/session":
            self._handle_study_session()
            return
        if self.path == "/api/research/assignment":
            self._handle_research_assignment()
            return
        if self.path == "/api/session-terminal":
            self._handle_session_terminal()
            return
        if self.path == "/api/feedback":
            self._handle_feedback()
            return
        if self.path == "/api/face-signal":
            self._handle_face_signal()
            return
        if self.path == "/api/tts":
            self._handle_tts()
            return
        if self.path == "/api/recap-image":
            self._handle_recap_image()
            return
        if self.path != "/api/chat":
            self._error_response(404, "unknown_endpoint", "Unknown API endpoint.")
            return
        self._handle_chat()

    def _handle_recap_image(self) -> None:
        request_id = uuid.uuid4().hex
        if research_ab_enabled() or self._pair_owner_cookie():
            self._error_response(403, "paired_recap_required", "Use the owner-scoped paired keepsakes.")
            return
        length = self._content_length(request_id)
        if length is None:
            return
        if length <= 0 or length > 16000:
            self._error_response(400, "invalid_body", "Recap body is invalid.")
            return
        study, ok = self._validated_study_context(request_id)
        if not ok:
            return
        if study:
            self._error_response(403, "study_recap_disabled", "Art cannot precede the research questionnaire.")
            return
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            self._error_response(400, "invalid_json", "Invalid recap JSON.")
            return
        problem = recap_image.validate(payload)
        if problem:
            self._error_response(400, "invalid_schema", problem)
            return
        api_key = os.environ.get("OPENAI_API_KEY", "")
        if not api_key:
            self._error_response(503, "image_not_configured", "Image generation is not configured; local recap remains available.")
            return
        model = os.environ.get("OPENAI_RECAP_IMAGE_MODEL", "gpt-image-2")
        if model not in {"gpt-image-2", "gpt-image-1.5"}:
            self._error_response(503, "image_model_not_enabled", "Recap image model is not enabled.")
            return
        status, result = recap_image.reserve(self.client_address[0], payload["recap"])
        if status == "ready":
            self._json_response(200, result)
            return
        asynchronous=self.headers.get('Prefer','')=='respond-async'
        if status=='pending' and asynchronous and result:
            self._json_response(202,result,headers={'Cache-Control':'no-store'});return
        if status != "reserved":
            self._error_response(429 if status in {"busy", "rate_limited"} else 409,
                                 "image_" + status, "No additional image charge attempted; use the local recap.")
            return
        if asynchronous:
            job=recap_image.start_job(result['key'],self.client_address[0],payload['recap'],api_key,model)
            self._json_response(202,job,headers={'Cache-Control':'no-store'});return
        generated = None
        try:
            generated = recap_image.generate(payload["recap"], api_key, model)
        except Exception:
            # Do not disclose upstream response content, private credentials or
            # auto-retry a potentially already charged image generation.
            self._error_response(502, "image_generation_unavailable", "Image generation failed or timed out; local recap remains available.")
            return
        finally:
            recap_image.finish(result["key"], generated)
        self._json_response(200, generated)

    def _handle_pair_keepsakes(self, operation: str) -> None:
        request_id = uuid.uuid4().hex
        if not self._research_transport(request_id):
            return
        origin = self.headers.get("Origin")
        public = parse.urlsplit(os.environ.get("RESEARCH_PUBLIC_URL", ""))
        expected_origin = f"{public.scheme}://{public.netloc}" if public.scheme and public.netloc else "http://" + self.headers.get("Host", "")
        if (origin and origin != expected_origin) or self.headers.get("Sec-Fetch-Site") == "cross-site":
            self._error_response(403, "research_origin_required", "Use the research study page.", request_id=request_id)
            return
        try:
            store = get_research_store()
            owner = self._pair_owner_cookie()
            row = store.completed_pair(owner)
            params = parse.parse_qs(parse.urlsplit(self.path).query, keep_blank_values=True)
            if operation == "keepsakes":
                if params:
                    raise research_store.ResearchError(400, "invalid_query", "Keepsakes do not accept query data.")
                self._json_response(200, research_keepsakes.keepsakes(store, owner, _study_secret()), headers={"Cache-Control": "no-store"})
                return
            if operation == "status":
                job = params.get("job", [""])[0]
                if set(params) != {"job"} or len(params["job"]) != 1 or not re.fullmatch(r"[a-f0-9]{32}", job):
                    raise research_store.ResearchError(400, "invalid_job", "Invalid image job.")
                label = next((label for label, image in row.get("keepsakeImages", {}).items() if image.get("jobId") == job), None)
                if label not in ("A", "B"):
                    raise research_store.ResearchError(404, "image_job_unavailable", "Image job not available to this owner.")
                self._json_response(200, {"ok": True, **research_keepsakes.image_result(store, row, label)}, headers={"Cache-Control": "no-store"})
                return
            self._require_pair_write_token(store, owner)
            payload = self._research_json_body(request_id, 1024)
            if payload is None:
                return
            if set(payload) != {"gameLabel", "consent"} or payload.get("consent") is not True or payload.get("gameLabel") not in ("A", "B"):
                raise research_store.ResearchError(400, "invalid_schema", "Choose one saved game and explicitly consent to image generation.")
            label = payload["gameLabel"]
            research_questionnaire.assert_allowed(store, owner, "image")
            existing = research_keepsakes.image_result(store, row, label)
            if existing:
                self._json_response(202 if existing["status"] == "pending" else 200, {"ok": True, **existing}, headers={"Cache-Control": "no-store"})
                return
            game = research_keepsakes.public_game(store.terminal_payload(row, label), row["pairId"], label, _study_secret(), row["games"][label]["terminal"]["sha256"])
            facts, source_hash = game["recap"], game["sourceHash"]
            problem = recap_image.validate({"consent": True, "recap": facts})
            if problem:
                raise research_store.ResearchError(409, "keepsake_source_incomplete", "The saved public sources are insufficient for an illustration; the original game record is preserved.")
            api_key = os.environ.get("OPENAI_API_KEY", "")
            model = os.environ.get("OPENAI_RECAP_IMAGE_MODEL", "gpt-image-2")
            if not api_key or model not in {"gpt-image-2", "gpt-image-1.5"}:
                raise research_store.ResearchError(503, "image_not_configured", "Image generation is not configured; the local recap remains available.")
            # Proxy peers are shared by many participants. Rate-limit a stable,
            # anonymous pair key; it never enters the provider request.
            client = "paired-" + hmac.new(_study_secret().encode(), ("image-rate:" + row["pairId"]).encode(), hashlib.sha256).hexdigest()
            status, ticket = recap_image.reserve(client, facts)
            if status != "reserved":
                # No durable permit is spent on a local busy/rate-limited path.
                raise research_store.ResearchError(429 if status in {"busy", "rate_limited", "pending"} else 409, "image_" + status, "No additional image charge attempted; try later only if generation has not started.")
            try:
                won, image, image_job = store.reserve_keepsake_image_job(owner, label, source_hash, uuid.uuid4().hex)
            except Exception:
                recap_image.finish(ticket["key"], None)
                raise
            if not won:
                recap_image.finish(ticket["key"], None)
                existing = research_keepsakes.image_result(store, store.completed_pair(owner), label)
                self._json_response(202 if existing["status"] == "pending" else 200, {"ok": True, **existing}, headers={"Cache-Control": "no-store"})
                return
            def generate_saved_image():
                generated = None
                try:
                    generated = recap_image.generate(facts, api_key, model)
                    prefix = "data:image/png;base64,"
                    value = generated.get("imageDataUrl", "")
                    if not isinstance(value, str) or not value.startswith(prefix):
                        raise ValueError("Invalid generated image")
                    png = base64.b64decode(value[len(prefix):], validate=True)
                    metadata = {"model": model, "illustrativeOnly": True, "artworkStyle": "lab-entry-cover-v2", "recapVersion": "lab-recap-v2-cover"}
                    store.finish_keepsake_image_job(image_job, png, metadata)
                except Exception:
                    try:
                        store.finish_keepsake_image_job(image_job, None)
                    except Exception:
                        pass  # Durable pending expires to unknown; never retry a possibly charged call.
                finally:
                    recap_image.finish(ticket["key"], generated)
            try:
                threading.Thread(target=generate_saved_image, daemon=True).start()
            except Exception:
                recap_image.finish(ticket["key"], None)
                # Keep the durable unknown attempt; a restart cannot spend again.
                raise
            self._json_response(202, {"ok": True, "gameLabel": label, "sourceHash": source_hash, "jobId": image["jobId"], "status": "pending"}, headers={"Cache-Control": "no-store"})
        except research_store.ResearchError as exc:
            self._error_response(exc.status, exc.code, exc.message, request_id=request_id)
        except Exception:
            self._error_response(503, "research_storage_unavailable", "The durable keepsake store is unavailable; no retry was scheduled.", request_id=request_id)

    def _secure_research_origin(self) -> bool:
        expected = os.environ.get("RESEARCH_ORIGIN_SECRET", "").strip()
        supplied = self.headers.get("X-SocialEvo-Origin", "")
        forwarded = self.headers.get("CloudFront-Forwarded-Proto", self.headers.get("X-Forwarded-Proto", "")).strip().lower()
        return bool(expected and supplied and hmac.compare_digest(expected.encode("utf-8"), supplied.encode("utf-8")) and forwarded == "https")

    def _research_transport(self, request_id: str) -> bool:
        if os.environ.get("RESEARCH_REQUIRE_SECURE", "") != "1":
            return True
        if not self._secure_research_origin():
            self._error_response(403, "secure_research_origin_required", "Use the secure research study address.", request_id=request_id)
            return False
        return True

    def _research_admin(self, request_id: str) -> bool:
        self._error_response(404, "endpoint_disabled", "Research administration is not included in this release.", request_id=request_id)
        return False

    def _pair_owner_cookie(self) -> str:
        for item in self.headers.get("Cookie", "").split(";"):
            name, separator, value = item.strip().partition("=")
            if separator and name == research_store.PAIR_COOKIE_NAME:
                return value if research_store.participant_from_owner(value) else ""
        return ""

    def _research_json_body(self, request_id: str, maximum: int = 4096) -> dict | None:
        length = self._content_length(request_id)
        if length is None:
            return None
        if length <= 0 or length > maximum:
            self._error_response(413 if length > maximum else 400, "body_too_large" if length > maximum else "empty_body", "The research request body is invalid.", request_id=request_id)
            return None
        try:
            value = json.loads(self.rfile.read(length).decode("utf-8"), parse_constant=lambda _value: (_ for _ in ()).throw(ValueError()))
        except (ValueError, UnicodeDecodeError):
            self._error_response(400, "invalid_json", "The research request must be valid JSON.", request_id=request_id)
            return None
        if not isinstance(value, dict):
            self._error_response(400, "invalid_schema", "The research request must be a JSON object.", request_id=request_id)
            return None
        return value

    def _pair_response(self, store: research_store.ResearchStore, row: dict, owner: str = "", **extra) -> None:
        payload = study_account_auth.paired_response(store, row, _study_secret(), study_capabilities)
        headers = {"Cache-Control": "no-store"}
        if owner:
            secure = os.environ.get("RESEARCH_REQUIRE_SECURE", "") == "1" or self.headers.get("X-Forwarded-Proto") == "https" or self.headers.get("CloudFront-Forwarded-Proto") == "https"
            headers["Set-Cookie"] = f"{research_store.PAIR_COOKIE_NAME}={owner}; Path=/; HttpOnly; SameSite=Strict; Max-Age={research_store.PAIR_TTL_SECONDS}" + ("; Secure" if secure else "")
        self._json_response(200, {**payload, **extra}, headers=headers)

    def _handle_study_account(self) -> None:
        request_id = uuid.uuid4().hex
        # Passwords never enter the HTTP-only EB origin in the formal release.
        # This denial precedes body reading, parsing, storage and body logging.
        if os.environ.get("RESEARCH_REQUIRE_SECURE", "") == "1":
            self._error_response(503, "account_https_endpoint_required", "Use the dedicated secure sign-in endpoint.", request_id=request_id)
            self.close_connection = True
            return
        if os.environ.get("RESEARCH_ACCOUNT_AUTH_ENABLED", "") != "1" or not research_ab_enabled():
            self._error_response(404, "account_not_enabled", "Account sign-in is unavailable.", request_id=request_id)
            return
        route = parse.urlsplit(self.path)
        try:
            if route.query:
                raise research_store.ResearchError(400, "invalid_query", "Account requests do not accept query data.")
            public_url = os.environ.get("RESEARCH_PUBLIC_URL", "") or "http://" + self.headers.get("Host", "")
            kwargs = {"public_url": public_url, "access_code": ACCESS_CODE,
                      "access_cookie_secret": os.environ.get("ACCESS_COOKIE_SECRET", ACCESS_CODE)}
            if self.command == "GET" and route.path == "/api/study/account/status":
                payload = study_account_auth.account_status(self.headers, **kwargs, transport="local-test")
                self._json_response(200, payload, headers={"Cache-Control": "no-store"})
                return
            if self.command != "POST" or route.path not in ("/api/study/account/register", "/api/study/account/login", "/api/study/account/password"):
                raise research_store.ResearchError(404, "account_route_not_found", "The account action was not found.")
            study_account_auth.validate_account_headers(self.headers, **kwargs)
            body = self._research_json_body(request_id, study_account_auth.MAX_BODY_BYTES)
            if body is None:
                return
            store = get_research_store()
            result = study_account_auth.handle_account_request(route.path, body, self._pair_owner_cookie(), self.headers,
                store=store, study_secret=_study_secret(), capabilities_for_condition=study_capabilities, **kwargs,
                policy_for_participant=(lambda participant: research_questionnaire.new_policy(store, participant)) if research_questionnaire.enabled() else None)
            self._json_response(200, result.payload, headers={"Cache-Control": "no-store", "Set-Cookie":
                f"{research_store.PAIR_COOKIE_NAME}={result.cookie_owner}; Path=/; HttpOnly; SameSite=Strict; Max-Age={research_store.PAIR_TTL_SECONDS}"})
        except research_store.ResearchError as exc:
            self._error_response(exc.status, exc.code, exc.message, request_id=request_id)
        except Exception:
            self._error_response(503, "account_storage_unavailable", "Account sign-in could not be confirmed. Try again later.", request_id=request_id)

    def _require_pair_write_token(self, store, owner: str) -> dict:
        row = store.current(owner)
        assignment_id = row["games"][row["currentGame"]]["assignmentId"]
        assignment = store.assignment(assignment_id)
        if assignment and assignment.get("authGeneration") is not None:
            record = verify_study_token(self.headers.get("X-SocialEvo-Study-Token", ""))
            if not record or record["assignmentId"] != assignment_id or record.get("authGeneration") != assignment.get("authGeneration"):
                raise research_store.ResearchError(403, "account_session_revoked", "Sign in again to continue from the saved game.")
        # The store checks the owner again inside every write CAS retry.
        store.authorize(owner, assignment_id, allow_saved=True)
        return row

    def _invalid_paired_token(self) -> None:
        assignment_id = self.headers.get("X-SocialEvo-Study-Token", "").partition(".")[0]
        record = get_research_store().assignment(assignment_id) if research_store.assignment_participant(assignment_id) else None
        if record and record.get("authGeneration") is not None:
            raise research_store.ResearchError(403, "account_session_revoked", "Sign in again to continue from the saved game.")
        raise research_store.ResearchError(403, "invalid_study_session", "The paired study assignment is invalid.")

    def _assert_study_request_current(self, context: dict | None) -> None:
        if not context or not context.get("pairId"):
            return
        current = verify_study_token(self.headers.get("X-SocialEvo-Study-Token", ""))
        if not current or current["assignmentId"] != context["assignmentId"] or current.get("authGeneration") != context.get("authGeneration"):
            raise research_store.ResearchError(403, "account_session_revoked", "Sign in again to continue from the saved game.")
        get_research_store().authorize(self._pair_owner_cookie(), context["assignmentId"])

    def _study_response_current(self, context: dict | None, request_id: str) -> bool:
        try:
            self._assert_study_request_current(context)
            return True
        except research_store.ResearchError as exc:
            self._error_response(exc.status, exc.code, exc.message, request_id=request_id)
        except Exception:
            self._error_response(503, "research_storage_unavailable", "The current sign-in could not be confirmed.", request_id=request_id)
        return False

    def _handle_study_pair(self, operation: str) -> None:
        request_id = self.headers.get("X-SocialEvo-Request-Id") or uuid.uuid4().hex
        if not self._research_transport(request_id):
            return
        try:
            store = get_research_store()
            owner = self._pair_owner_cookie()
            first_legacy_claim = operation == "claim" and not owner
            if operation == "current":
                if not owner:
                    self._json_response(200, {"ok": True, "pair": None, "profile": None}, headers={"Cache-Control": "no-store"})
                    return
                self._pair_response(store, store.current(owner))
                return
            payload = self._research_json_body(request_id, MAX_PAIRED_EXPORT_BYTES if operation == "checkpoint" else 4096)
            if payload is None:
                return
            if operation == "claim":
                if set(payload) != {"participantId"} or payload.get("participantId") not in research_store.PARTICIPANTS:
                    raise research_store.ResearchError(400, "invalid_participant_id", "Choose a participant ID from P1 to P50.")
                participant = payload["participantId"]
                if os.environ.get("RESEARCH_ACCOUNT_AUTH_ENABLED", "") == "1":
                    if not owner:
                        raise research_store.ResearchError(403, "password_required", "Use participant sign-in to start or restore this code.")
                    row = store.current(owner)
                    if row["participantId"] != participant:
                        raise research_store.ResearchError(409, "browser_already_enrolled", "This browser is linked to another participant code.")
                    self._pair_response(store, row)
                    return
                if owner and research_store.participant_from_owner(owner) != participant:
                    raise research_store.ResearchError(409, "browser_already_enrolled", "This browser is already enrolled with a different participant ID.")
                owner = owner or research_store.new_owner(participant)
                policy = research_questionnaire.new_policy(store, participant) if research_questionnaire.enabled() else None
                row = store.claim(participant, owner, questionnaire_policy=policy)
            elif operation == "checkpoint":
                self._save_paired_export(store, owner, payload, terminal=False, request_id=request_id)
                return
            else:
                self._require_pair_write_token(store, owner)
                if payload:
                    raise research_store.ResearchError(400, "invalid_schema", "This transition requires an empty JSON object.")
                research_questionnaire.assert_allowed(store, owner, "advance" if operation == "advance" else "complete")
                row = store.advance(owner) if operation == "advance" else store.complete(owner)
            # Reads and transitions never renew authentication: an older response
            # must not replace the cookie set by a newer cross-device sign-in.
            self._pair_response(store, row, owner if first_legacy_claim else "")
        except research_store.ResearchError as exc:
            self._error_response(exc.status, exc.code, exc.message, request_id=request_id)
        except Exception:
            self._error_response(503, "research_storage_unavailable", "The durable research store is unavailable; no completion was confirmed.", request_id=request_id)

    def _save_paired_export(self, store: research_store.ResearchStore, owner: str, payload: dict, terminal: bool, request_id: str) -> None:
        token = self.headers.get("X-SocialEvo-Study-Token", "")
        record = verify_study_token(token) if token else None
        if not record or not record.get("pairId"):
            self._invalid_paired_token()
        store.authorize(owner, record["assignmentId"], allow_saved=True)
        research_questionnaire.assert_allowed(store, owner, "game")
        completed = research_store.validate_paired_export(payload, record, terminal)
        result = store.save(owner, record["assignmentId"], payload, terminal=terminal, completed=completed)
        self._pair_response(store, result.pop("pair"), **result)

    def _handle_study_recovery(self) -> None:
        request_id = uuid.uuid4().hex
        if not self._research_transport(request_id):
            return
        origin = self.headers.get("Origin")
        public = parse.urlsplit(os.environ.get("RESEARCH_PUBLIC_URL", ""))
        expected = f"{public.scheme}://{public.netloc}" if public.scheme and public.netloc else "http://" + self.headers.get("Host", "")
        if (origin and origin != expected) or self.headers.get("Sec-Fetch-Site") == "cross-site":
            self._error_response(403, "research_origin_required", "Use the study page.", request_id=request_id)
            return
        try:
            store = get_research_store(); owner = self._pair_owner_cookie()
            store.current(owner)
            if parse.urlsplit(self.path).query:
                raise research_store.ResearchError(400, "invalid_query", "Recovery always uses the current owned game; selectors are not accepted.")
            result = store.recovery(owner, capabilities_for_condition=study_capabilities)
            # No cookie renewal, assignment mutation or new token identity.
            self._pair_response(store, result.pop("pair"), **result)
        except research_store.ResearchError as exc:
            self._error_response(exc.status, exc.code, exc.message, request_id=request_id)
        except Exception:
            self._error_response(503, "recovery_storage_unavailable", "The saved game could not be read; no new game was created.", request_id=request_id)

    def _handle_questionnaire(self) -> None:
        request_id = uuid.uuid4().hex
        if not research_questionnaire.enabled():
            self._error_response(404, "questionnaire_not_enabled", "The questionnaire draft is not enabled.", request_id=request_id)
            return
        if not self._research_transport(request_id):
            return
        origin = self.headers.get("Origin")
        public = parse.urlsplit(os.environ.get("RESEARCH_PUBLIC_URL", ""))
        expected = f"{public.scheme}://{public.netloc}" if public.scheme and public.netloc else "http://" + self.headers.get("Host", "")
        if (origin and origin != expected) or self.headers.get("Sec-Fetch-Site") == "cross-site":
            self._error_response(403, "research_origin_required", "Use the study page.", request_id=request_id)
            return
        try:
            store = get_research_store(); owner = self._pair_owner_cookie()
            store.current(owner)
            if parse.urlsplit(self.path).query:
                raise research_store.ResearchError(400, "invalid_query", "Questionnaire requests do not accept query data.")
            self._require_pair_write_token(store, owner)
            if self.command == "GET":
                result = research_questionnaire.public_status(store, owner)
            else:
                payload = self._research_json_body(request_id, research_questionnaire.MAX_BODY)
                if payload is None: return
                result = research_questionnaire.acknowledge_summary(store, owner, payload) if payload.get("action") == "acknowledge_summary" else research_questionnaire.save(store, owner, payload)
            self._json_response(200, result, headers={"Cache-Control": "no-store"})
        except research_store.ResearchError as exc:
            self._error_response(exc.status, exc.code, exc.message, request_id=request_id)
        except Exception:
            self._error_response(503, "questionnaire_storage_unavailable", "The questionnaire could not be saved; no submission was confirmed.", request_id=request_id)

    def _handle_research_get(self, route: str) -> None:
        request_id = self.headers.get("X-SocialEvo-Request-Id") or uuid.uuid4().hex
        if not self._research_transport(request_id):
            return
        if route == "/api/research/admin-bootstrap":
            if not self._secure_research_origin():
                self._error_response(403, "secure_research_origin_required", "Use the secure research study address.", request_id=request_id)
                return
            try:
                path = Path(__file__).resolve().parent / "config" / "research-bootstrap.enc.json"
                package = json.loads(path.read_text(encoding="utf-8"))
                self._json_response(200, package, headers={"Cache-Control": "no-store"})
            except (OSError, ValueError):
                self._error_response(404, "research_bootstrap_unavailable", "The encrypted researcher delivery package is unavailable.", request_id=request_id)
            return
        if not self._research_admin(request_id):
            return
        try:
            store = get_research_store()
            if route == "/api/research/participants":
                self._json_response(200, {"ok": True, "participants": store.registry()}, headers={"Cache-Control": "no-store"})
                return
            params = parse.parse_qs(parse.urlsplit(self.path).query)
            if set(params) - {"participantId", "history"} or "participantId" not in params or len(params["participantId"]) != 1 or ("history" in params and params["history"] != ["1"]):
                raise research_store.ResearchError(400, "invalid_participant_id", "A single participantId is required.")
            participant = params["participantId"][0]
            package = store.export(participant, history=params.get("history") == ["1"])
            self._json_response(200, package, headers={"Cache-Control": "no-store", "Content-Disposition": f'attachment; filename="SocialEvoNPC-{participant}-AB.json"'})
        except research_store.ResearchError as exc:
            self._error_response(exc.status, exc.code, exc.message, request_id=request_id)
        except Exception:
            self._error_response(503, "research_storage_unavailable", "The durable research store is unavailable.", request_id=request_id)

    def _handle_study_session(self) -> None:
        request_id = self.headers.get("X-SocialEvo-Request-Id") or uuid.uuid4().hex
        if research_ab_enabled():
            self._error_response(409, "paired_study_required", "Use the paired participant enrollment for this research release.", request_id=request_id)
            return
        length = self._content_length(request_id)
        if length is None:
            return
        if length <= 0 or length > 4096:
            self._error_response(400, "invalid_body", "Study session request is invalid.", request_id=request_id)
            return
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._error_response(400, "invalid_json", "Request body must be valid JSON.", request_id=request_id)
            return
        if not isinstance(payload, dict) or set(payload) != {"participantId", "enrollmentCode"}:
            self._error_response(400, "invalid_schema", "Study session requires participantId and enrollmentCode.", request_id=request_id)
            return
        participant_id = payload.get("participantId")
        enrollment_code = payload.get("enrollmentCode")
        expected_code = os.environ.get("STUDY_ENROLLMENT_CODE", "").strip()
        if not _study_secret() or not expected_code:
            self._error_response(503, "study_not_configured", "The research study profile is not configured.", request_id=request_id)
            return
        if not isinstance(participant_id, str) or not 1 <= len(participant_id.strip()) <= 80:
            self._error_response(400, "invalid_participant_id", "Participant ID is invalid.", request_id=request_id)
            return
        if not isinstance(enrollment_code, str) or not hmac.compare_digest(enrollment_code, expected_code):
            self._error_response(401, "study_enrollment_denied", "Study enrollment is not authorized.", request_id=request_id)
            return
        token, record = issue_study_session(participant_id.strip())
        self._json_response(
            200,
            {
                "ok": True,
                "sessionToken": token,
                "profile": {
                    "active": True,
                    "assignmentId": record["assignmentId"],
                    "protocolVersion": record["protocolVersion"],
                    "capabilities": record["capabilities"],
                    "videoEnabled": False,
                    "expiresAt": record["expiresAt"],
                },
            },
            headers={
                "X-SocialEvo-Request-Id": request_id,
                "Set-Cookie": (
                    f"{STUDY_COOKIE_NAME}={record['assignmentId']}; Path=/; HttpOnly; "
                    f"SameSite=Strict; Max-Age={STUDY_SESSION_TTL_SECONDS}"
                ),
            },
        )

    def _handle_research_assignment(self) -> None:
        request_id = self.headers.get("X-SocialEvo-Request-Id") or uuid.uuid4().hex
        if research_ab_enabled() and not self._research_transport(request_id):
            return
        expected = os.environ.get("RESEARCH_ADMIN_TOKEN", "").strip()
        supplied = self.headers.get("Authorization", "").removeprefix("Bearer ").strip()
        if not expected:
            self._error_response(503, "research_auth_not_configured", "Research authorization is not configured.", request_id=request_id)
            return
        if not supplied or not hmac.compare_digest(supplied.encode("utf-8"), expected.encode("utf-8")):
            self._error_response(401, "research_auth_required", "Research authorization is required.", request_id=request_id)
            return
        length = self._content_length(request_id)
        if length is None:
            return
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._error_response(400, "invalid_json", "Request body must be valid JSON.", request_id=request_id)
            return
        assignment_id = payload.get("assignmentId") if isinstance(payload, dict) else ""
        if research_ab_enabled() and research_store.assignment_participant(assignment_id):
            if not self._research_transport(request_id):
                return
            try:
                record = get_research_store().assignment(assignment_id)
            except Exception:
                self._error_response(503, "research_storage_unavailable", "The durable research store is unavailable.", request_id=request_id)
                return
        else:
            with STUDY_SESSIONS_LOCK:
                record = STUDY_SESSIONS.get(str(assignment_id or ""))
        if not record:
            self._error_response(404, "assignment_not_found", "Study assignment was not found.", request_id=request_id)
            return
        self._json_response(200, {
            "assignmentId": record["assignmentId"],
            "condition": record["condition"],
            "protocolVersion": record["protocolVersion"],
            "participantHash": record["participantHash"],
        }, headers={"X-SocialEvo-Request-Id": request_id})

    def _handle_session_terminal(self) -> None:
        request_id = self.headers.get("X-SocialEvo-Request-Id") or uuid.uuid4().hex
        token = self.headers.get("X-SocialEvo-Study-Token", "")
        if research_ab_enabled():
            if not self._research_transport(request_id):
                return
            try:
                store = get_research_store()
                payload = self._research_json_body(request_id, MAX_PAIRED_EXPORT_BYTES)
                if payload is not None:
                    self._save_paired_export(store, self._pair_owner_cookie(), payload, terminal=True, request_id=request_id)
            except research_store.ResearchError as exc:
                self._error_response(exc.status, exc.code, exc.message, request_id=request_id)
            except Exception:
                self._error_response(503, "research_storage_unavailable", "The durable research store is unavailable; no completion was confirmed.", request_id=request_id)
            return
        record = verify_study_token(token) if token else None
        if not record:
            cookie_assignment = self._study_cookie_assignment()
            with STUDY_SESSIONS_LOCK:
                record = STUDY_SESSIONS.get(cookie_assignment)
        if not record:
            self._error_response(
                403, "invalid_study_session", "Study session authorization is invalid.",
                request_id=request_id,
            )
            return
        length = self._content_length(request_id)
        if length is None:
            return
        if length <= 0 or length > MAX_TERMINAL_EXPORT_BYTES:
            self._error_response(
                413 if length > MAX_TERMINAL_EXPORT_BYTES else 400,
                "body_too_large" if length > MAX_TERMINAL_EXPORT_BYTES else "empty_body",
                "Terminal export is too large." if length > MAX_TERMINAL_EXPORT_BYTES else "Terminal export is required.",
                request_id=request_id,
            )
            return
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._error_response(400, "invalid_json", "Terminal export must be valid JSON.", request_id=request_id)
            return
        validation_error = validate_terminal_export(payload, record)
        if validation_error:
            self._error_response(400, "invalid_terminal_export", validation_error, request_id=request_id)
            return
        storage_root = os.environ.get("RESEARCH_SESSION_DIR", "").strip()
        if not storage_root:
            self._json_response(202, {
                "ok": True,
                "persisted": False,
                "reason": "research_session_dir_not_configured",
            }, headers={"X-SocialEvo-Request-Id": request_id})
            return
        root = Path(storage_root).expanduser().resolve()
        root.mkdir(parents=True, exist_ok=True)
        session_id = str(payload["session"]["sessionId"])
        safe_session = hashlib.sha256(session_id.encode("utf-8")).hexdigest()[:20]
        output_path = root / f"{record['assignmentId']}-{safe_session}.json"
        temporary_path = output_path.with_suffix(".tmp")
        temporary_path.write_text(
            json.dumps(payload, ensure_ascii=False, sort_keys=True, indent=2),
            encoding="utf-8",
        )
        temporary_path.replace(output_path)
        self._json_response(201, {
            "ok": True,
            "persisted": True,
            "recordId": output_path.stem,
        }, headers={"X-SocialEvo-Request-Id": request_id})

    def _study_cookie_assignment(self) -> str:
        cookie = self.headers.get("Cookie", "")
        for item in cookie.split(";"):
            name, separator, value = item.strip().partition("=")
            if separator and name == STUDY_COOKIE_NAME:
                return value
        return ""

    def _validated_study_context(self, request_id: str) -> tuple[dict | None, bool]:
        token = self.headers.get("X-SocialEvo-Study-Token", "")
        cookie_assignment = self._study_cookie_assignment()
        pair_owner = self._pair_owner_cookie()
        if not token and not cookie_assignment and not pair_owner:
            return None, True
        if research_ab_enabled() and (pair_owner or research_store.assignment_participant(token.partition(".")[0])):
            if not self._research_transport(request_id):
                return None, False
            try:
                record = verify_study_token(token)
                if not record or not record.get("pairId"):
                    self._invalid_paired_token()
                get_research_store().authorize(pair_owner, record["assignmentId"])
                research_questionnaire.assert_allowed(get_research_store(), pair_owner, "game")
                return record, True
            except research_store.ResearchError as exc:
                self._error_response(exc.status, exc.code, exc.message, request_id=request_id)
            except Exception:
                self._error_response(503, "research_storage_unavailable", "The durable research store is unavailable.", request_id=request_id)
            return None, False
        record = verify_study_token(token)
        if research_ab_enabled():
            self._error_response(403, "paired_study_required", "Use the paired participant enrollment for this research release.", request_id=request_id)
            return None, False
        if not record or (cookie_assignment and cookie_assignment != record["assignmentId"]):
            self._error_response(403, "invalid_study_session", "Study session authorization is invalid.", request_id=request_id)
            return None, False
        return record, True

    def _handle_chat(self) -> None:
        request_id = self.headers.get("X-SocialEvo-Request-Id") or uuid.uuid4().hex
        started_at = time.monotonic()
        length = self._content_length(request_id)
        if length is None:
            return
        if length <= 0 or length > MAX_CHAT_BODY_BYTES:
            self._error_response(
                413 if length > MAX_CHAT_BODY_BYTES else 400,
                "body_too_large" if length > MAX_CHAT_BODY_BYTES else "empty_body",
                "Chat request body is too large." if length > MAX_CHAT_BODY_BYTES else "Chat request body is required.",
                request_id=request_id,
            )
            return
        raw_body = self.rfile.read(length)
        try:
            payload = json.loads(raw_body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._error_response(400, "invalid_json", "Request body must be valid JSON.", request_id=request_id)
            return
        validation_error = validate_chat_payload(payload)
        if validation_error:
            self._error_response(400, "invalid_schema", validation_error, request_id=request_id)
            return

        study_context, study_ok = self._validated_study_context(request_id)
        if not study_ok:
            return
        if study_context:
            supplied_assignment = self.headers.get("X-SocialEvo-Study-Assignment", "")
            supplied_capability_hash = self.headers.get("X-SocialEvo-Study-Capability-Hash", "")
            if (
                supplied_assignment != study_context["assignmentId"]
                or not supplied_capability_hash
                or not hmac.compare_digest(
                    supplied_capability_hash,
                    study_context["capabilityHash"],
                )
            ):
                self._error_response(
                    409,
                    "study_condition_mismatch",
                    "The study session configuration does not match its server assignment.",
                    request_id=request_id,
                )
                return

        configuration_error = text_agent_configuration_error()
        if configuration_error:
            self._error_response(503, "configuration_error", configuration_error,
                                 retryable=False, request_id=request_id)
            return
        provider = payload.get("provider", "deepseek")
        if provider != TEXT_AGENT_PROVIDER:
            self._error_response(
                400, "unsupported_provider", "The requested text provider does not match the server configuration.",
                request_id=request_id,
            )
            return
        requested_model = str(payload.get("model") or "deepseek-pro").strip()
        openai = provider == "openai"
        route = openai_text_route(payload.get("agentPurpose", "unspecified")) if openai else None
        if (openai and requested_model != route["model"]) or (not openai and requested_model not in ALLOWED_PRODUCT_MODELS):
            self._error_response(
                400, "unsupported_model", "The requested model is not enabled for this text configuration.",
                request_id=request_id,
            )
            return

        api_key = os.environ.get("OPENAI_API_KEY" if openai else "DEEPSEEK_API_KEY", "").strip()
        base_url = OPENAI_CHAT_BASE_URL if openai else DEEPSEEK_BASE_URL
        if not api_key:
            self._error_response(
                503, "configuration_error", "The required model service is not configured.",
                retryable=False, request_id=request_id,
            )
            return

        resolved_model = route["model"] if openai else resolve_deepseek_model(requested_model)
        resolved_effort = route["reasoningEffort"] if openai else ""
        incident_thinking = not openai and payload.get("agentPurpose") in {
            "lab_incident_role_scope", "lab_written_work_scope", "lab_world_evidence_scope"
        }
        if openai:
            upstream_payload = {
                "model": resolved_model,
                "messages": payload["messages"],
                "stream": False,
                "store": False,
                "reasoning_effort": resolved_effort,
                "max_completion_tokens": OPENAI_TEXT_MAX_COMPLETION_TOKENS,
                "response_format": {"type": "json_object"},
            }
        else:
            upstream_payload = {
                "model": resolved_model,
                "messages": payload["messages"],
                "temperature": payload.get("temperature", 0.7),
                "stream": False,
                "thinking": {"type": "enabled" if incident_thinking else "disabled"},
            }
            if incident_thinking:
                upstream_payload["reasoning_effort"] = "low"
            if payload.get("responseFormat") == "json_object":
                upstream_payload["response_format"] = {"type": "json_object"}
            if payload.get("maxTokens") is not None:
                upstream_payload["max_tokens"] = payload["maxTokens"]

        req = request.Request(
            base_url,
            data=json.dumps(upstream_payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )

        try:
            transport_timeout = PAIRED_CHAT_UPSTREAM_TIMEOUT_SECONDS if study_context and study_context.get("pairId") else CHAT_UPSTREAM_TIMEOUT_SECONDS
            with request.urlopen(req, timeout=transport_timeout) as response:
                body = response.read()
            try:
                upstream = json.loads(body.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                log_chat_proxy_event(
                    "chat_proxy_error",
                    request_id=request_id,
                    payload=payload,
                    requested_model=requested_model,
                    resolved_model=resolved_model,
                    started_at=started_at,
                    upstream_status=200,
                    error_type="InvalidUpstreamJson",
                )
                self._error_response(
                    502,
                    "invalid_upstream_json",
                    "The model service returned an invalid response.",
                    retryable=True,
                    request_id=request_id,
                )
                return
            choices = upstream.get("choices") if isinstance(upstream, dict) else None
            first_choice = choices[0] if isinstance(choices, list) and choices else None
            first_message = first_choice.get("message") if isinstance(first_choice, dict) else None
            content = first_message.get("content") if isinstance(first_message, dict) else None
            complete_openai_result = not openai or (
                isinstance(upstream, dict)
                and upstream.get("model") == resolved_model
                and isinstance(choices, list) and len(choices) == 1
                and isinstance(first_choice, dict) and isinstance(first_message, dict)
                and first_choice.get("finish_reason") == "stop"
                and not first_message.get("refusal")
                and not first_message.get("tool_calls")
                and not first_message.get("function_call")
            )
            if not isinstance(content, str) or not content.strip() or not complete_openai_result:
                log_chat_proxy_event(
                    "chat_proxy_error",
                    request_id=request_id,
                    payload=payload,
                    requested_model=requested_model,
                    resolved_model=resolved_model,
                    started_at=started_at,
                    upstream_status=200,
                    error_type="InvalidUpstreamSchema",
                )
                self._error_response(
                    502,
                    "invalid_upstream_schema",
                    "The model service returned an incomplete response.",
                    retryable=True,
                    request_id=request_id,
                )
                return
            if incident_thinking:
                # The browser needs only the final structured verdict, not the
                # provider's intermediate reasoning. Preserve token accounting.
                for choice in choices:
                    message = choice.get("message") if isinstance(choice, dict) else None
                    if isinstance(message, dict):
                        message.pop("reasoning_content", None)
            upstream_latency_ms = round((time.monotonic() - started_at) * 1000)
            if upstream_latency_ms >= 30000:
                log_chat_proxy_event(
                    "chat_proxy_slow",
                    request_id=request_id,
                    payload=payload,
                    requested_model=requested_model,
                    resolved_model=resolved_model,
                    started_at=started_at,
                    upstream_status=200,
                )
            upstream["socialEvoMeta"] = {
                "requestId": request_id,
                "requestedProvider": provider,
                "requestedModel": requested_model,
                "resolvedProvider": provider,
                "resolvedModel": resolved_model,
                "reasoningEffort": resolved_effort if openai else ("low" if incident_thinking else ""),
                "maxCompletionTokens": OPENAI_TEXT_MAX_COMPLETION_TOKENS if openai else payload.get("maxTokens", 0),
                "latencyMs": upstream_latency_ms,
            }
            if study_context:
                upstream["socialEvoMeta"]["studyAssignmentId"] = study_context["assignmentId"]
                upstream["socialEvoMeta"]["studyProtocolVersion"] = study_context["protocolVersion"]
            usage = upstream.get("usage") if isinstance(upstream.get("usage"), dict) else {}
            prompt_details = usage.get("prompt_tokens_details") if isinstance(usage.get("prompt_tokens_details"), dict) else {}
            completion_details = usage.get("completion_tokens_details") if isinstance(usage.get("completion_tokens_details"), dict) else {}
            cached_tokens = nonnegative_int(prompt_details.get("cached_tokens"))
            reasoning_tokens = nonnegative_int(completion_details.get("reasoning_tokens"))
            cache_hit_tokens = cached_tokens if openai else nonnegative_int(usage.get("prompt_cache_hit_tokens"))
            cache_miss_tokens = max(0, nonnegative_int(usage.get("prompt_tokens")) - cached_tokens) if openai else nonnegative_int(usage.get("prompt_cache_miss_tokens"))
            usage_headers = {
                "X-SocialEvo-Prompt-Tokens": str(nonnegative_int(usage.get("prompt_tokens"))),
                "X-SocialEvo-Completion-Tokens": str(nonnegative_int(usage.get("completion_tokens"))),
                "X-SocialEvo-Total-Tokens": str(nonnegative_int(usage.get("total_tokens"))),
                "X-SocialEvo-Cache-Hit-Tokens": str(cache_hit_tokens),
                "X-SocialEvo-Cache-Miss-Tokens": str(cache_miss_tokens),
                "X-SocialEvo-Reasoning-Tokens": str(reasoning_tokens),
                "X-SocialEvo-Cached-Input-Tokens": str(cached_tokens),
                "X-SocialEvo-Upstream-Latency-Ms": str(upstream_latency_ms),
            }
            if not self._study_response_current(study_context, request_id):
                return
            self._json_response(
                200,
                upstream,
                headers={
                    "X-SocialEvo-Request-Id": request_id,
                    "X-SocialEvo-Resolved-Provider": provider,
                    "X-SocialEvo-Resolved-Model": resolved_model,
                    "X-SocialEvo-Reasoning-Effort": resolved_effort if openai else ("low" if incident_thinking else ""),
                    "X-SocialEvo-Max-Completion-Tokens": str(OPENAI_TEXT_MAX_COMPLETION_TOKENS if openai else payload.get("maxTokens", 0)),
                    **({"X-SocialEvo-Study-Assignment": study_context["assignmentId"]} if study_context else {}),
                    **usage_headers,
                },
            )
        except error.HTTPError as exc:
            upstream_error_code = safe_upstream_error_code(exc)
            log_chat_proxy_event(
                "chat_proxy_error",
                request_id=request_id,
                payload=payload,
                requested_model=requested_model,
                resolved_model=resolved_model,
                started_at=started_at,
                upstream_status=exc.code,
                error_type="HTTPError",
                upstream_error_code=upstream_error_code,
            )
            self._error_response(
                502,
                "upstream_http_error",
                "The model service rejected the request.",
                retryable=exc.code == 429 or exc.code >= 500,
                request_id=request_id,
                extra_headers={
                    "X-SocialEvo-Upstream-Status": str(exc.code),
                    **({"X-SocialEvo-Upstream-Error-Code": upstream_error_code} if upstream_error_code else {}),
                },
            )
        except (TimeoutError, socket.timeout):
            log_chat_proxy_event(
                "chat_proxy_error",
                request_id=request_id,
                payload=payload,
                requested_model=requested_model,
                resolved_model=resolved_model,
                started_at=started_at,
                error_type="TimeoutError",
            )
            self._error_response(
                504,
                "upstream_timeout",
                "The model service timed out.",
                retryable=True,
                request_id=request_id,
            )
        except error.URLError:
            log_chat_proxy_event(
                "chat_proxy_error",
                request_id=request_id,
                payload=payload,
                requested_model=requested_model,
                resolved_model=resolved_model,
                started_at=started_at,
                error_type="URLError",
            )
            self._error_response(
                502,
                "upstream_unreachable",
                "The model service is unreachable.",
                retryable=True,
                request_id=request_id,
            )
        except Exception as exc:  # noqa: BLE001 - sanitize unexpected service failures
            log_chat_proxy_event(
                "chat_proxy_error",
                request_id=request_id,
                payload=payload,
                requested_model=requested_model,
                resolved_model=resolved_model,
                started_at=started_at,
                error_type=type(exc).__name__,
            )
            self._error_response(
                502,
                "upstream_failure",
                "The model request could not be completed.",
                retryable=False,
                request_id=request_id,
            )

    def _handle_tts(self) -> None:
        """Synthesize one validated, participant-visible NPC line without storing it."""
        request_id = self.headers.get("X-SocialEvo-Request-Id") or uuid.uuid4().hex
        study_context = None
        if research_ab_enabled():
            # The formal release has no anonymous TTS fallback: omitting either
            # cookie or token must never turn a study request into product use.
            if not self._research_transport(request_id):
                return
            study_context, study_ok = self._validated_study_context(request_id)
            if not study_ok:
                return
            if not study_context or not study_context.get("pairId"):
                self._error_response(403, "paired_study_required", "Use the active paired study game for voice output.", request_id=request_id)
                return
        elif self._study_cookie_assignment() or self._pair_owner_cookie() or self.headers.get("X-SocialEvo-Study-Token"):
            self._error_response(
                403,
                "study_voice_disabled",
                "Voice modality is disabled for this study profile.",
                request_id=request_id,
            )
            return
        self._voice_study_context = study_context
        length = self._content_length(request_id)
        if length is None:
            return
        if length <= 0 or length > MAX_TTS_BODY_BYTES:
            self._error_response(
                413 if length > MAX_TTS_BODY_BYTES else 400,
                "body_too_large" if length > MAX_TTS_BODY_BYTES else "empty_body",
                "Voice request body is too large." if length > MAX_TTS_BODY_BYTES else "Voice request body is required.",
                request_id=request_id,
            )
            return
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._error_response(400, "invalid_json", "Voice request must be valid JSON.", request_id=request_id)
            return
        validation_error = validate_tts_payload(payload)
        if validation_error:
            self._error_response(400, "invalid_schema", validation_error, request_id=request_id)
            return
        if study_context:
            verbatim = ((NPC_VOICE_PROVIDER == "qwen" and QWEN_VOICE_MODE == "flash")
                        or (NPC_VOICE_PROVIDER == "openai" and OPENAI_VOICE_MODE == "tts"))
            if not verbatim:
                self._error_response(403, "study_verbatim_voice_required", "Study voice must read the displayed NPC line verbatim.", request_id=request_id)
                return
            if not voice_runtime_metadata().get("configured"):
                self._error_response(503, "study_voice_not_configured", "The optional study voice service is unavailable; continue with text.", request_id=request_id)
                return
        if NPC_VOICE_PROVIDER == "qwen":
            if QWEN_VOICE_MODE == "flash":
                self._handle_qwen_flash_voice(payload, request_id, "audio/pcm" in self.headers.get("Accept", "").lower())
            elif QWEN_VOICE_MODE == "next":
                self._handle_qwen_voice(payload, request_id)
            else:
                self._error_response(503, "voice_mode_invalid", "The configured Qwen voice mode is not supported.", request_id=request_id)
            return
        if NPC_VOICE_PROVIDER != "openai":
            self._error_response(503, "voice_provider_invalid", "The configured voice provider is not supported.", request_id=request_id)
            return
        api_key = os.environ.get("OPENAI_API_KEY", "").strip()
        if not api_key:
            self._error_response(
                503,
                "tts_not_configured",
                "The optional voice service is not configured.",
                retryable=False,
                request_id=request_id,
            )
            return
        profile = OPENAI_TTS_VOICE_PROFILES[str(payload["speakerId"])]
        streaming = "audio/pcm" in self.headers.get("Accept", "").lower()
        if OPENAI_VOICE_MODE == "live":
            self._handle_live_voice(payload, profile, api_key, request_id, streaming)
            return
        if OPENAI_VOICE_MODE != "tts":
            self._error_response(503, "voice_mode_invalid", "The configured voice mode is not supported.", request_id=request_id)
            return
        upstream_payload = {
            "model": OPENAI_TTS_MODEL,
            "voice": profile["voice"],
            "input": payload["text"].strip(),
            "instructions": tts_instructions(payload),
            "response_format": "pcm" if streaming else "mp3",
            "stream_format": "audio",
        }
        req = request.Request(
            OPENAI_TTS_BASE_URL,
            data=json.dumps(upstream_payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with request.urlopen(req, timeout=OPENAI_TTS_TIMEOUT_SECONDS) as response:
                if streaming:
                    self._stream_tts_pcm(response, request_id, str(profile["voice"]))
                    return
                audio = response.read()
            if not audio or len(audio) > MAX_TTS_AUDIO_BYTES:
                self._error_response(
                    502,
                    "invalid_tts_audio",
                    "The voice service returned invalid audio.",
                    retryable=True,
                    request_id=request_id,
                )
                return
            if not self._study_response_current(study_context, request_id):
                return
            self._binary_response(
                200,
                audio,
                "audio/mpeg",
                headers={
                    "Cache-Control": "no-store",
                    "X-SocialEvo-Request-Id": request_id,
                    "X-SocialEvo-TTS-Provider": "openai",
                    "X-SocialEvo-Voice-Id": str(profile["voice"]),
                },
            )
        except error.HTTPError as exc:
            self._error_response(
                502,
                "tts_upstream_error",
                "The voice service rejected the request.",
                retryable=exc.code == 429 or exc.code >= 500,
                request_id=request_id,
                extra_headers={"X-SocialEvo-Upstream-Status": str(exc.code)},
            )
        except (TimeoutError, socket.timeout):
            self._error_response(
                504,
                "tts_upstream_timeout",
                "The voice service timed out.",
                retryable=True,
                request_id=request_id,
            )
        except error.URLError:
            self._error_response(
                502,
                "tts_upstream_unreachable",
                "The voice service is unreachable.",
                retryable=True,
                request_id=request_id,
            )
        except Exception:  # noqa: BLE001 - keep optional voice failures sanitized
            self._error_response(
                502,
                "tts_upstream_failure",
                "The voice request could not be completed.",
                retryable=False,
                request_id=request_id,
            )

    def _handle_qwen_flash_voice(self, payload, request_id, streaming):
        voice_id = QWEN_FLASH_VOICES[payload["speakerId"]][payload["language"]]
        try:
            with QwenFlashStream(os.environ.get("DASHSCOPE_API_KEY", "").strip(),
                os.environ.get("SFM_WORKSPACE_ID", "").strip(), voice_id,
                qwen_voice_instruction(payload), payload["text"].strip(), payload["language"],
                QWEN_CHARACTER_PROFILES[payload["speakerId"]]["seed"],
                cancelled=self._voice_client_disconnected) as response:
                if streaming:
                    self._stream_tts_pcm(response, request_id, voice_id, engine="qwen-flash")
                    return
                pcm = bytearray()
                while True:
                    chunk = response.read1(TTS_STREAM_CHUNK_BYTES)
                    if not chunk: break
                    pcm.extend(chunk)
                    if len(pcm) > MAX_TTS_AUDIO_BYTES: raise FlashSpeechError("flash_invalid_audio")
                if not pcm or len(pcm) % 2: raise FlashSpeechError("flash_invalid_audio")
                output = io.BytesIO()
                with wave.open(output, "wb") as wav:
                    wav.setnchannels(1); wav.setsampwidth(2); wav.setframerate(24000); wav.writeframes(pcm)
                if not self._study_response_current(getattr(self, "_voice_study_context", None), request_id):
                    return
                self._binary_response(200, output.getvalue(), "audio/wav", headers={
                    "Cache-Control": "no-store", "X-SocialEvo-Request-Id": request_id,
                    "X-SocialEvo-TTS-Provider": "dashscope", "X-SocialEvo-Voice-Model": FLASH_MODEL,
                    "X-SocialEvo-Voice-Id": voice_id, "X-SocialEvo-Voice-Mode": "verbatim-tts",
                    "X-SocialEvo-Generation-Streaming": "true", "X-SocialEvo-Delivery-Streaming": "false"})
        except FlashSpeechError as exc:
            if exc.code == "flash_cancelled":
                self.close_connection = True
                return
            self._voice_failure_log(request_id, exc.code, exc.upstream_status)
            status = 503 if exc.code in {"qwen_not_configured", "flash_dependency_missing"} else 429 if exc.code in {"flash_busy", "flash_rate_limited"} else 504 if exc.code == "flash_timeout" else 502
            self._error_response(status, exc.code, str(exc), retryable=exc.code in {"flash_busy", "flash_rate_limited"}, request_id=request_id,
                extra_headers={"X-SocialEvo-Upstream-Status": str(exc.upstream_status)})
        except (BrokenPipeError, ConnectionResetError):
            self.close_connection = True
        except Exception:
            self._voice_failure_log(request_id, "flash_upstream_error")
            self._error_response(502, "flash_upstream_error", "Qwen Flash voice failed; continue with text.", request_id=request_id)

    def _handle_qwen_voice(self, payload, request_id):
        try:
            audio, usage = synthesize_next(
                os.environ.get("DASHSCOPE_API_KEY", "").strip(),
                os.environ.get("SFM_WORKSPACE_ID", "").strip(),
                qwen_voice_prompt(payload), QWEN_CHARACTER_PROFILES[payload["speakerId"]]["seed"],
                cancelled=self._voice_client_disconnected,
            )
            headers = {"Cache-Control": "no-store", "X-SocialEvo-Request-Id": request_id,
                "X-SocialEvo-TTS-Provider": "dashscope", "X-SocialEvo-Voice-Model": QWEN_MODEL,
                "X-SocialEvo-Voice-Mode": "source-text-prompt", "X-SocialEvo-Voice-Id": "qwen-profile-" + payload["speakerId"],
                "X-SocialEvo-Generation-Streaming": "false"}
            for name, header in [("input_tokens", "X-SocialEvo-Prompt-Tokens"), ("output_tokens", "X-SocialEvo-Completion-Tokens"), ("total_tokens", "X-SocialEvo-Total-Tokens")]:
                if name in usage: headers[header] = str(usage[name])
            self._binary_response(200, audio, "audio/wav", headers=headers)
        except QwenSpeechError as exc:
            if exc.code == "qwen_cancelled":
                self.close_connection = True
                return
            self._voice_failure_log(request_id, exc.code, exc.upstream_status)
            status = 503 if exc.code in {"qwen_not_configured", "qwen_workspace_invalid"} else 429 if exc.code == "qwen_rate_limited" else 502
            self._error_response(status, exc.code, str(exc), retryable=exc.code == "qwen_rate_limited", request_id=request_id,
                extra_headers={"X-SocialEvo-Upstream-Status": str(exc.upstream_status)})
        except (BrokenPipeError, ConnectionResetError):
            self.close_connection = True
        except Exception:
            self._voice_failure_log(request_id, "qwen_upstream_error")
            self._error_response(502, "qwen_upstream_error", "Qwen voice generation failed; continue with text.", request_id=request_id)

    def _handle_live_voice(self, payload, profile, api_key, request_id, streaming):
        try:
            with LiveSpeechStream(
                api_key=api_key, voice=profile["live_voice"],
                instructions=tts_instructions(payload, natural=True),
                text=payload["text"].strip(), language=payload["language"],
                cancelled=self._voice_client_disconnected,
            ) as response:
                if streaming:
                    self._stream_tts_pcm(response, request_id, profile["live_voice"], engine="live")
                else:
                    # Old clients can play a WAV clip. Never silently use another
                    # provider/model when the requested Live model is unavailable.
                    pcm = bytearray()
                    while True:
                        chunk = response.read1(TTS_STREAM_CHUNK_BYTES)
                        if not chunk:
                            break
                        pcm.extend(chunk)
                        if len(pcm) > MAX_TTS_AUDIO_BYTES:
                            raise LiveSpeechError("live_invalid_audio")
                    if not pcm:
                        raise LiveSpeechError("live_invalid_audio")
                    output = io.BytesIO()
                    with wave.open(output, "wb") as wav:
                        wav.setnchannels(1)
                        wav.setsampwidth(2)
                        wav.setframerate(TTS_PCM_SAMPLE_RATE)
                        wav.writeframes(pcm)
                    self._binary_response(200, output.getvalue(), "audio/wav", headers={
                        "Cache-Control": "no-store",
                        "X-SocialEvo-Request-Id": request_id,
                        "X-SocialEvo-TTS-Provider": "openai",
                        "X-SocialEvo-Voice-Id": profile["live_voice"],
                        "X-SocialEvo-Voice-Model": LIVE_MODEL,
                        "X-SocialEvo-Voice-Mode": "natural-paraphrase",
                    })
        except LiveSpeechError as exc:
            if exc.code == "live_cancelled":
                self.close_connection = True
                return
            self._voice_failure_log(request_id, exc.code, exc.upstream_status)
            self._error_response(429 if exc.code in {"live_busy", "live_rate_limited"} else 503 if exc.code == "live_dependency_missing" else 502,
                exc.code, str(exc), retryable=exc.code in {"live_busy", "live_rate_limited", "live_connection_failed", "live_timeout"},
                request_id=request_id, extra_headers={"X-SocialEvo-Upstream-Status": str(exc.upstream_status)})
        except Exception:
            self._voice_failure_log(request_id, "live_upstream_error")
            self._error_response(502, "live_upstream_error", "GPT-Live voice preview could not be completed.", request_id=request_id)

    def _voice_client_disconnected(self):
        # Body has already been consumed. A readable socket with EOF means Next,
        # restart, tab close, or nginx cancellation: release the upstream slot.
        try:
            readable, _, _ = select.select([self.connection], [], [], 0)
            return bool(readable) and self.connection.recv(1, socket.MSG_PEEK | socket.MSG_DONTWAIT) == b""
        except (OSError, ValueError):
            return False

    def _voice_failure_log(self, request_id, code, upstream_status=0):
        # Never print source dialogue, transcripts, audio, headers, or keys.
        print(json.dumps({"event": "voice_failure", "requestId": request_id,
            "provider": NPC_VOICE_PROVIDER, "engine": "qwen-" + QWEN_VOICE_MODE if NPC_VOICE_PROVIDER == "qwen" else OPENAI_VOICE_MODE,
            "errorCode": code, "upstreamStatus": upstream_status}), flush=True)

    def _stream_tts_pcm(self, response, request_id: str, voice_id: str, *, engine="tts") -> None:
        # read1 returns available bytes instead of waiting to fill an entire read.
        read_chunk = getattr(response, "read1", None) or response.read
        first = read_chunk(TTS_STREAM_CHUNK_BYTES)
        if not first or len(first) > MAX_TTS_AUDIO_BYTES:
            self._error_response(502, "invalid_tts_audio", "The voice service returned invalid audio.", request_id=request_id)
            return
        if not self._study_response_current(getattr(self, "_voice_study_context", None), request_id):
            return
        self.protocol_version = "HTTP/1.1"
        self.close_connection = True
        self.send_response(200)
        for key, value in {
            "Content-Type": "audio/pcm",
            "Transfer-Encoding": "chunked",
            "Connection": "close",
            "Cache-Control": "no-store, no-transform",
            "X-Accel-Buffering": "no",
            "X-Content-Type-Options": "nosniff",
            "X-SocialEvo-Request-Id": request_id,
            "X-SocialEvo-TTS-Provider": "dashscope" if engine == "qwen-flash" else "openai",
            "X-SocialEvo-Voice-Id": voice_id,
            "X-SocialEvo-Voice-Model": FLASH_MODEL if engine == "qwen-flash" else LIVE_MODEL if engine == "live" else OPENAI_TTS_MODEL,
            "X-SocialEvo-Voice-Mode": "natural-paraphrase" if engine == "live" else "verbatim-tts",
            "X-SocialEvo-Audio-Format": "pcm_s16le",
            "X-SocialEvo-Audio-Sample-Rate": str(TTS_PCM_SAMPLE_RATE),
            "X-SocialEvo-Audio-Channels": "1",
            "X-SocialEvo-Generation-Streaming": "true",
        }.items():
            self.send_header(key, value)
        self.end_headers()
        received = 0
        chunk = first
        try:
            while chunk:
                self._assert_study_request_current(getattr(self, "_voice_study_context", None))
                received += len(chunk)
                if received > MAX_TTS_AUDIO_BYTES:
                    return  # An incomplete transfer is an error, not valid EOF.
                self.wfile.write(f"{len(chunk):X}\r\n".encode("ascii"))
                self.wfile.write(chunk)
                self.wfile.write(b"\r\n")
                self.wfile.flush()
                chunk = read_chunk(TTS_STREAM_CHUNK_BYTES)
            if received % 2:
                return  # PCM must end on a complete 16-bit sample.
            self.wfile.write(b"0\r\n\r\n")
            self.wfile.flush()
        except Exception as exc:
            # Headers are committed: never append JSON errors to an audio stream.
            # Closing without a final chunk lets fetch detect a truncated stream.
            self.close_connection = True
            if not isinstance(exc, (BrokenPipeError, ConnectionResetError)) and getattr(exc, "code", "") not in {"live_cancelled", "flash_cancelled"}:
                self._voice_failure_log(request_id, exc.code if isinstance(exc, (LiveSpeechError, FlashSpeechError)) else "voice_stream_interrupted")

    def _handle_face_signal(self) -> None:
        """Return privacy-preserving low-dimensional face/expression signals.

        The server does not store raw images. The browser sends a compressed
        still frame only when the participant has opted into video modality.
        """
        request_id = self.headers.get("X-SocialEvo-Request-Id") or uuid.uuid4().hex
        if research_ab_enabled() or self._study_cookie_assignment() or self._pair_owner_cookie():
            self._error_response(
                403,
                "study_video_disabled",
                "Video modality is disabled for this study profile.",
                request_id=request_id,
            )
            return
        length = self._content_length(request_id)
        if length is None:
            return
        if length <= 0 or length > MAX_FACE_BODY_BYTES:
            self._error_response(
                413 if length > MAX_FACE_BODY_BYTES else 400,
                "body_too_large" if length > MAX_FACE_BODY_BYTES else "empty_body",
                "Video frame payload is too large." if length > MAX_FACE_BODY_BYTES else "Video frame payload is required.",
                request_id=request_id,
            )
            return
        raw_body = self.rfile.read(length)
        try:
            payload = json.loads(raw_body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._error_response(400, "invalid_json", "Request body must be valid JSON.", request_id=request_id)
            return

        validation_error = validate_face_payload(payload)
        if validation_error:
            self._error_response(400, "invalid_schema", validation_error, request_id=request_id)
            return

        image_data = payload["imageDataUrl"].split(",", 1)[1]
        try:
            decoded_image = base64.b64decode(image_data, validate=True)
        except (ValueError, binascii.Error):
            self._error_response(
                400,
                "invalid_image",
                "imageDataUrl must contain valid base64 image data.",
                request_id=request_id,
            )
            return
        if not decoded_image or not decoded_image.startswith(b"\xff\xd8\xff"):
            self._error_response(
                400,
                "invalid_image",
                "imageDataUrl must contain valid JPEG data.",
                request_id=request_id,
            )
            return

        api_key = os.environ.get("GOOGLE_VISION_API_KEY")
        if not api_key:
            self._error_response(
                503,
                "configuration_error",
                "Visible expression detection is not configured.",
                retryable=False,
                request_id=request_id,
            )
            return

        url = f"{GOOGLE_VISION_BASE_URL}?{parse.urlencode({'key': api_key})}"
        upstream_payload = {
            "requests": [
                {
                    "image": {"content": image_data},
                    "features": [{"type": "FACE_DETECTION", "maxResults": 1}],
                }
            ]
        }
        req = request.Request(
            url,
            data=json.dumps(upstream_payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with request.urlopen(req, timeout=GOOGLE_VISION_TIMEOUT_SECONDS) as response:
                raw = response.read()
        except error.HTTPError as exc:
            self._error_response(
                502,
                "vision_upstream_http_error",
                "Visible expression detection rejected the frame.",
                retryable=exc.code == 429 or exc.code >= 500,
                request_id=request_id,
            )
            return
        except (TimeoutError, socket.timeout):
            self._error_response(
                504,
                "vision_upstream_timeout",
                "Visible expression detection timed out.",
                retryable=True,
                request_id=request_id,
            )
            return
        except error.URLError:
            self._error_response(
                502,
                "vision_upstream_unreachable",
                "Visible expression detection is unreachable.",
                retryable=True,
                request_id=request_id,
            )
            return
        except Exception:  # noqa: BLE001 - sanitize unexpected service failures
            self._error_response(
                502,
                "vision_upstream_failure",
                "Visible expression detection could not be completed.",
                retryable=False,
                request_id=request_id,
            )
            return

        try:
            upstream = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._error_response(
                502,
                "invalid_vision_json",
                "Visible expression detection returned invalid JSON.",
                retryable=True,
                request_id=request_id,
            )
            return

        responses = upstream.get("responses") if isinstance(upstream, dict) else None
        first_response = responses[0] if isinstance(responses, list) and responses else None
        if not isinstance(first_response, dict):
            self._error_response(
                502,
                "invalid_vision_schema",
                "Visible expression detection returned an incomplete response.",
                retryable=True,
                request_id=request_id,
            )
            return
        if first_response.get("error"):
            self._error_response(
                502,
                "vision_processing_error",
                "Visible expression detection could not process the frame.",
                retryable=True,
                request_id=request_id,
            )
            return

        normalized = normalize_google_face_response(upstream)
        normalized["requestId"] = request_id
        self._json_response(
            200,
            normalized,
            headers={"X-SocialEvo-Request-Id": request_id},
        )

    def _handle_feedback(self) -> None:
        request_id = self.headers.get("X-SocialEvo-Request-Id") or uuid.uuid4().hex
        if research_ab_enabled() and self._pair_owner_cookie():
            try:
                self._require_pair_write_token(get_research_store(), self._pair_owner_cookie())
            except research_store.ResearchError as exc:
                self._error_response(exc.status, exc.code, exc.message, request_id=request_id)
                return
            except Exception:
                self._error_response(503, "research_storage_unavailable", "The current sign-in could not be confirmed.", request_id=request_id)
                return
        length = self._content_length(request_id)
        if length is None:
            return
        if length <= 0 or length > 50000:
            self._error_response(
                413 if length > 50000 else 400,
                "body_too_large" if length > 50000 else "empty_body",
                "Feedback payload is too large." if length > 50000 else "Feedback payload is required.",
                request_id=request_id,
            )
            return
        raw_body = self.rfile.read(length)
        try:
            payload = json.loads(raw_body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._error_response(400, "invalid_json", "Request body must be valid JSON.", request_id=request_id)
            return
        if not isinstance(payload, dict) or not isinstance(payload.get("feedback"), dict):
            self._error_response(
                400,
                "invalid_schema",
                "Feedback request must contain a feedback object.",
                request_id=request_id,
            )
            return
        print(
            "NEWCOMER_CIRCLE_FEEDBACK "
            + json.dumps(payload, ensure_ascii=False, sort_keys=True),
            flush=True,
        )
        self._json_response(
            200,
            {"ok": True, "requestId": request_id},
            headers={"X-SocialEvo-Request-Id": request_id},
        )

    def _content_length(self, request_id: str = "") -> int | None:
        try:
            return int(self.headers.get("Content-Length", "0"))
        except (TypeError, ValueError):
            self._error_response(
                400,
                "invalid_content_length",
                "Content-Length must be a valid integer.",
                request_id=request_id,
            )
            return None

    def _error_response(
        self,
        status: int,
        code: str,
        message: str,
        *,
        retryable: bool = False,
        request_id: str = "",
        extra_headers: dict[str, str] | None = None,
    ) -> None:
        if code == "pair_owner_required" and research_ab_enabled():
            try:
                assignment_id = self.headers.get("X-SocialEvo-Study-Token", "").partition(".")[0]
                record = get_research_store().assignment(assignment_id) if research_store.assignment_participant(assignment_id) else None
                if record and record.get("authGeneration") is not None:
                    code, message = "account_session_revoked", "Sign in again to continue from the saved game."
            except Exception:
                pass  # A denied owner stays denied when storage is unavailable.
        self._json_response(
            status,
            {
                "error": {
                    "code": code,
                    "message": message,
                    "retryable": retryable,
                    "requestId": request_id,
                }
            },
            headers={
                **({"X-SocialEvo-Request-Id": request_id} if request_id else {}),
                "X-SocialEvo-Error-Code": code,
                "X-SocialEvo-Retryable": "true" if retryable else "false",
                **(extra_headers or {}),
            },
        )

    def _json_response(
        self,
        status: int,
        body: dict,
        *,
        headers: dict[str, str] | None = None,
    ) -> None:
        encoded = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(encoded)

    def _binary_response(
        self,
        status: int,
        body: bytes,
        content_type: str,
        *,
        headers: dict[str, str] | None = None,
    ) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def _has_access(self) -> bool:
        if not ACCESS_CODE:
            return True
        cookie_header = self.headers.get("Cookie", "")
        expected = access_cookie_value()
        for item in cookie_header.split(";"):
            if "=" not in item:
                continue
            key, value = item.strip().split("=", 1)
            if key == ACCESS_COOKIE_NAME and hmac.compare_digest(value, expected):
                return True
        return False

    def _handle_access_check(self) -> None:
        if not ACCESS_CODE:
            self._json_response(200, {"ok": True})
            return
        request_id = self.headers.get("X-SocialEvo-Request-Id") or uuid.uuid4().hex
        length = self._content_length(request_id)
        if length is None:
            return
        if length <= 0 or length > 4096:
            self._error_response(
                413 if length > 4096 else 400,
                "body_too_large" if length > 4096 else "empty_body",
                "Access payload is too large." if length > 4096 else "Access payload is required.",
                request_id=request_id,
            )
            return
        raw_body = self.rfile.read(length)
        try:
            payload = json.loads(raw_body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._error_response(400, "invalid_json", "Request body must be valid JSON.", request_id=request_id)
            return
        if not isinstance(payload, dict) or set(payload) != {"accessCode"}:
            self._error_response(
                400,
                "invalid_schema",
                "Access request must contain exactly accessCode.",
                request_id=request_id,
            )
            return
        submitted = str(payload.get("accessCode", "")).strip()
        if not hmac.compare_digest(submitted, ACCESS_CODE):
            self._error_response(401, "incorrect_access_code", "Incorrect access code.", request_id=request_id)
            return
        cookie = (
            f"{ACCESS_COOKIE_NAME}={access_cookie_value()}; Path=/; "
            "HttpOnly; SameSite=Lax; Max-Age=86400"
        )
        if self.headers.get("X-Forwarded-Proto") == "https" or self.headers.get("CloudFront-Forwarded-Proto") == "https":
            cookie += "; Secure"
        self._json_response(
            200,
            {"ok": True, "requestId": request_id},
            headers={
                "Set-Cookie": cookie,
                "X-SocialEvo-Request-Id": request_id,
            },
        )

    def _access_page(self) -> None:
        page = """<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Newcomer Circle Access</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f6f1e8; color: #20242b; }
      main { width: min(420px, calc(100vw - 40px)); background: #fffaf1; border: 1px solid #d8c7ad; border-radius: 8px; padding: 28px; box-shadow: 0 18px 48px rgba(75, 57, 35, 0.14); }
      h1 { margin: 0 0 8px; font-size: 28px; }
      p { margin: 0 0 20px; line-height: 1.5; color: #4d5662; }
      label { display: block; margin-bottom: 8px; font-weight: 700; }
      input { box-sizing: border-box; width: 100%; padding: 12px 13px; border: 1px solid #b9aa95; border-radius: 6px; font: inherit; }
      button { margin-top: 14px; width: 100%; border: 0; border-radius: 6px; padding: 12px 14px; font-weight: 800; background: #2f7c80; color: white; cursor: pointer; }
      .error { min-height: 20px; margin-top: 12px; color: #a33a2b; font-weight: 700; }
    </style>
  </head>
  <body>
    <main>
      <h1>Newcomer Circle</h1>
      <p>This study prototype is protected. Enter the access code provided by the research team.</p>
      <form id="access-form">
        <label for="access-code">Access code</label>
        <input id="access-code" name="accessCode" autocomplete="off" autofocus required />
        <button type="submit">Enter Study</button>
        <div id="error" class="error"></div>
      </form>
    </main>
    <script>
      document.getElementById("access-form").addEventListener("submit", async (event) => {
        event.preventDefault();
        const error = document.getElementById("error");
        error.textContent = "";
        const accessCode = document.getElementById("access-code").value;
        const response = await fetch("/api/access", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessCode })
        });
        if (response.ok) window.location.reload();
        else error.textContent = "Incorrect access code.";
      });
    </script>
  </body>
</html>"""
        encoded = page.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8765"))
    host = os.environ.get("HOST", "127.0.0.1")
    server = ThreadingHTTPServer((host, port), partial(PrototypeHandler, directory=str(ROOT)))
    print(f"Serving anonymous game on http://{host}:{port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
