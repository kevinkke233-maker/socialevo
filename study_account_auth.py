"""Shared participant-account contracts; never log credentials or request bodies.

Production transports terminate at the dedicated HTTPS account origin. This
module does not make a plaintext transport secure; its adapter must enforce TLS.
"""
from __future__ import annotations

from dataclasses import dataclass
import hashlib
import hmac
import json
import re
import secrets
import threading
from urllib.parse import urlsplit

VERSION = "study-account-v1"
PASSWORD_VERSION = "pbkdf2-sha256-v1"
PASSWORD_ITERATIONS = 600_000
MAX_BODY_BYTES = 4096
ACCESS_COOKIE_NAME = "emo_agent_access"
_KDF_SLOTS = threading.BoundedSemaphore(4)
_DUMMY_SALT = b"\x00" * 32


def _error(status: int, code: str, message: str):
    # research_store imports the pure password helpers. Resolve its exception
    # only at call time, after both modules have finished importing.
    from research_store import ResearchError
    raise ResearchError(status, code, message)


def validate_password(password) -> None:
    if not isinstance(password, str) or not 12 <= len(password) <= 128:
        _error(400, "invalid_password", "Use a password of 12 to 128 characters, at most 512 UTF-8 bytes.")
    try:
        size = len(password.encode("utf-8"))
    except UnicodeEncodeError:
        size = 513
    if size > 512:
        _error(400, "invalid_password", "Use a password of 12 to 128 characters, at most 512 UTF-8 bytes.")


def hash_password(password: str) -> dict:
    validate_password(password)
    salt = secrets.token_bytes(32)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PASSWORD_ITERATIONS)
    return {"version": PASSWORD_VERSION, "iterations": PASSWORD_ITERATIONS, "salt": salt.hex(), "digest": digest.hex()}


def verify_password(password: str, credential: dict | None) -> bool:
    validate_password(password)
    valid = (isinstance(credential, dict) and credential.get("version") == PASSWORD_VERSION
             and type(credential.get("iterations")) is int and credential["iterations"] == PASSWORD_ITERATIONS
             and isinstance(credential.get("salt"), str) and bool(re.fullmatch(r"[a-f0-9]{64}", credential["salt"]))
             and isinstance(credential.get("digest"), str) and bool(re.fullmatch(r"[a-f0-9]{64}", credential["digest"])))
    salt = bytes.fromhex(credential["salt"]) if valid else _DUMMY_SALT
    expected = bytes.fromhex(credential["digest"]) if valid else b"\x00" * 32
    actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PASSWORD_ITERATIONS)
    return hmac.compare_digest(actual, expected) and bool(valid)


def scoped_signature(secret: str, assignment_id: str, auth_generation: str | None = None) -> str:
    if not secret or not isinstance(assignment_id, str) or not assignment_id:
        _error(503, "study_not_configured", "Study authorization is unavailable.")
    if auth_generation is not None and not re.fullmatch(r"[a-f0-9]{32}", str(auth_generation)):
        _error(503, "stored_account_invalid", "The saved account authorization is invalid.")
    message = assignment_id if auth_generation is None else "study-account-grant-v1|" + assignment_id + "|" + auth_generation
    return hmac.new(secret.encode("utf-8"), message.encode("utf-8"), hashlib.sha256).hexdigest()


def _headers(headers) -> dict:
    return {str(key).lower(): str(value) for key, value in (headers or {}).items()}


def access_cookie_valid(headers, access_code: str = "", access_cookie_secret: str | None = None) -> bool:
    if not access_code:
        return True
    secret = access_code if access_cookie_secret is None else access_cookie_secret
    expected = hashlib.sha256((access_code + ":" + secret).encode("utf-8")).hexdigest()
    values = [part.strip().partition("=")[2] for part in _headers(headers).get("cookie", "").split(";")
              if part.strip().partition("=")[0] == ACCESS_COOKIE_NAME]
    return len(values) == 1 and hmac.compare_digest(values[0], expected)


def validate_account_headers(headers, public_url: str, access_code: str = "", access_cookie_secret: str | None = None, *, status: bool = False) -> None:
    values = _headers(headers)
    if not access_cookie_valid(values, access_code, access_cookie_secret):
        _error(403, "access_required", "Access code required.")
    origin = urlsplit(public_url)
    if origin.scheme not in ("http", "https") or not origin.netloc:
        _error(503, "account_not_configured", "Account sign-in is unavailable.")
    expected = origin.scheme + "://" + origin.netloc
    if values.get("sec-fetch-site") == "cross-site" or (values.get("origin") and values["origin"] != expected) or (not status and values.get("origin") != expected):
        _error(403, "research_origin_required", "Use the study page.")
    if not status and values.get("content-type", "").partition(";")[0].strip().lower() != "application/json":
        _error(415, "json_content_type_required", "Send an application/json account request.")


def account_status(headers, *, public_url: str, access_code: str = "", access_cookie_secret: str | None = None, transport: str) -> dict:
    validate_account_headers(headers, public_url, access_code, access_cookie_secret, status=True)
    if transport not in ("lambda-url-https", "local-test"):
        _error(503, "account_https_endpoint_required", "Use the dedicated secure sign-in endpoint.")
    return {"ok": True, "enabled": True, "version": VERSION, "transport": transport}


def paired_response(store, row: dict, study_secret: str, capabilities_for_condition) -> dict:
    label = row["currentGame"]
    game = row["games"][label]
    record = store.assignment(game["assignmentId"])
    if not record:
        _error(503, "stored_account_invalid", "The saved account authorization is invalid.")
    signature = scoped_signature(study_secret, game["assignmentId"], record.get("authGeneration"))
    profile = {"active": True, "assignmentId": game["assignmentId"], "pairId": row["pairId"], "gameLabel": label,
               "protocolVersion": row["protocolVersion"], "capabilities": capabilities_for_condition(game["condition"]),
               "videoEnabled": False, "expiresAt": record["expiresAt"], "sessionToken": game["assignmentId"] + "." + signature}
    return {"ok": True, "pair": store.public_pair(row), "profile": profile}


@dataclass(frozen=True)
class AccountResponse:
    payload: dict
    cookie_owner: str


def handle_account_request(path: str, body: dict, owner: str, headers, *, store, study_secret: str,
                           public_url: str, capabilities_for_condition, access_code: str = "", access_cookie_secret: str | None = None,
                           policy_for_participant=None) -> AccountResponse:
    from research_store import PARTICIPANTS, new_owner, participant_from_owner
    validate_account_headers(headers, public_url, access_code, access_cookie_secret)
    if not isinstance(body, dict):
        _error(400, "invalid_schema", "The account request must be a JSON object.")
    try:
        size = len(json.dumps(body, ensure_ascii=False).encode("utf-8"))
    except (UnicodeEncodeError, TypeError, ValueError):
        _error(400, "invalid_schema", "The account request must be valid JSON.")
    if size > MAX_BODY_BYTES:
        _error(413, "body_too_large", "The account request is too large.")
    operations = {"/api/study/account/register": "register", "/api/study/account/login": "login", "/api/study/account/password": "password"}
    operation = operations.get(path)
    if not operation:
        _error(404, "account_route_not_found", "The account action was not found.")
    expected = {"password", "passwordConfirm"} if operation == "password" else {"participantId", "password"} | ({"passwordConfirm"} if operation == "register" else set())
    if set(body) != expected:
        _error(400, "invalid_schema", "The account request fields are invalid.")
    password = body["password"]
    validate_password(password)
    if operation != "login" and (not isinstance(body["passwordConfirm"], str) or body["passwordConfirm"] != password):
        _error(400, "password_confirmation_mismatch", "The two passwords do not match.")
    participant = participant_from_owner(owner) if operation == "password" else body["participantId"]
    if participant not in PARTICIPANTS:
        _error(403, "account_auth_failed", "The account credentials could not be verified.")
    if not _KDF_SLOTS.acquire(blocking=False):
        _error(429, "account_auth_rate_limited", "Too many sign-in attempts. Try again later.")
    try:
        # This durable lease is shared by every Lambda worker/process. The local
        # semaphore alone cannot impose a global bound when AWS has no reserved
        # concurrency available. Headers/schema/policy failures consume no lease.
        with store.account_request_slot():
            if operation == "password":
                row = store.current(owner)
                if store.public_pair(row).get("passwordConfigured"):
                    _error(409, "password_already_configured", "This account already has a password. Use sign-in to continue.")
            replacement = new_owner(participant)
            if operation == "register":
                policy = policy_for_participant(participant) if policy_for_participant else None
                row = store.register_account(participant, replacement, password, questionnaire_policy=policy)
            elif operation == "login":
                row = store.login_account(participant, password, replacement)
            else:
                row = store.set_account_password(owner, password, replacement)
            # Re-read ownership: a concurrent later login must not obtain a stale
            # profile from this callback, even though both use the correct password.
            row = store.current(replacement)
            return AccountResponse(paired_response(store, row, study_secret, capabilities_for_condition), replacement)
    finally:
        _KDF_SLOTS.release()
