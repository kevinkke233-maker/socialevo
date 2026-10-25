"""Durable, exclusive, counterbalanced two-game research enrollment.

SQLite is an explicit local/test backend. Production uses DynamoDB conditional
writes for enrollment/state and private S3 objects for complete ExportV2 data.
No participant registry or complete export is stored in the application process.
"""
from __future__ import annotations

import copy
import hashlib
import hmac
import json
import math
import os
import re
import secrets
import sqlite3
import time
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

PARTICIPANTS = tuple(f"P{i}" for i in range(1, 51))
LEGACY_PARTICIPANTS = PARTICIPANTS[:40]
STAGES = ("stage_1_entry", "stage_2_first_failure", "stage_3_revision_conflict", "stage_4_credit")
NORMAL_ENDINGS = frozenset(("success", "partial_outcome", "unhealthy_failure"))
PAIR_COOKIE_NAME = "socialevo_pair"
PAIR_TTL_SECONDS = 90 * 24 * 60 * 60
ACCOUNT_VERSION = "participant-account-v1"
ACCOUNT_ATTEMPT_WINDOW_SECONDS = 300
ACCOUNT_ATTEMPT_LIMIT = 5
ACCOUNT_SLOT_CAPACITY = 4
ACCOUNT_SLOT_LEASE_SECONDS = 60
ACCOUNT_SLOT_KEY = "__account_slots__"
ACCOUNT_SLOT_VERSION = "participant-account-slots-v1"
MAX_CHECKPOINTS_PER_GAME = 512
RESERVED_SUMMARY_CHECKPOINTS = 32
TECHNICAL_ENDINGS = frozenset(("backend_failure", "incomplete", "session_unavailable"))
_KEEPSAKE_JOB_SEAL_KEY = secrets.token_bytes(32)


@dataclass(frozen=True, repr=False)
class _KeepsakeJobCapability:
    """Process-local authority for one already reserved background result only."""
    prefix: str
    protocol: str
    participant: str
    pair_id: str
    label: str
    job_id: str
    source_hash: str
    permit_hash: str
    seal: str


class ResearchError(Exception):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


def encoded(value: object) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def participant_from_owner(owner: str) -> str:
    participant, sep, token = str(owner or "").partition(".")
    return participant if sep and participant in PARTICIPANTS and re.fullmatch(r"[A-Za-z0-9_-]{32,128}", token) else ""


def new_owner(participant: str) -> str:
    return f"{participant}.{secrets.token_urlsafe(32)}"


def assignment_participant(assignment_id: str) -> str:
    match = re.fullmatch(r"ab-(P(?:[1-9]|[1-4][0-9]|50))-[0-9a-f]{32}-[AB]", str(assignment_id or ""))
    return match.group(1) if match else ""


def _hash_owner(owner: str) -> str:
    return hashlib.sha256(owner.encode("utf-8")).hexdigest()


def _duration_ms(session: dict) -> int | None:
    try:
        start = datetime.fromisoformat(session["startedAt"].replace("Z", "+00:00"))
        end = datetime.fromisoformat(session["endedAt"].replace("Z", "+00:00"))
        value = int((end - start).total_seconds() * 1000)
        return value if value >= 0 else None
    except (KeyError, TypeError, ValueError, OverflowError):
        return None


def validate_research_collection(payload: dict) -> None:
    """Catch accidentally missing/truncated collection, not certify client truth."""
    session = payload["session"]
    archive = payload.get("researchArchive")
    if (not isinstance(archive, dict) or archive.get("schemaVersion") != "study-pair-readonly-archive-v1"
            or archive.get("sessionId") != session["sessionId"] or archive.get("modelContextUnchanged") is not True):
        raise ResearchError(400, "incomplete_research_archive", "The complete dialogue and retrieval archive is required.")
    for field, count_field in (("dialogueHistory", "dialogueCount"), ("retrievalTraces", "retrievalCount")):
        values, count = archive.get(field), archive.get(count_field)
        if not isinstance(values, list) or type(count) is not int or count != len(values):
            raise ResearchError(400, "incomplete_research_archive", "Research archive counts do not match the complete records.")
        if field == "dialogueHistory" and not count:
            raise ResearchError(400, "incomplete_research_archive", "The complete game dialogue archive is empty.")
        if any(not isinstance(row, dict) or row.get("archiveSequence") != index for index, row in enumerate(values, 1)):
            raise ResearchError(400, "incomplete_research_archive", "Research archive ordering is incomplete.")
    timing = payload["researchStudy"].get("timing")
    fields = ("wallClockMs", "visibleMs", "backgroundMs", "interactiveMs", "blockedMs", "readingMs", "setupMs", "summaryVisibleMs")

    def finite_nonnegative(value):
        return type(value) in (int, float) and math.isfinite(value) and value >= 0

    if (not isinstance(timing, dict) or timing.get("schemaVersion") != "study-pair-timing-v1"
            or timing.get("sessionId") != session["sessionId"] or timing.get("startedAt") != session.get("startedAt")
            or not timing.get("endedAt") or _duration_ms(timing) is None
            or not all(finite_nonnegative(timing.get(field)) for field in fields)
            or not isinstance(timing.get("stages"), dict) or not isinstance(timing.get("transitions"), list)
            or not isinstance(timing.get("events"), list)):
        raise ResearchError(400, "incomplete_research_timing", "Complete, finite session timing is required.")
    tolerance = max(25, timing["wallClockMs"] * 0.00001)
    if (abs(timing["visibleMs"] + timing["backgroundMs"] - timing["wallClockMs"]) > tolerance
            or abs(sum(timing[field] for field in ("interactiveMs", "blockedMs", "readingMs", "setupMs")) - timing["visibleMs"]) > tolerance):
        raise ResearchError(400, "incomplete_research_timing", "Mutually exclusive timing totals are inconsistent.")
    for stage in timing["stages"].values():
        if not isinstance(stage, dict) or not all(finite_nonnegative(stage.get(field)) for field in fields if field != "summaryVisibleMs"):
            raise ResearchError(400, "incomplete_research_timing", "Stage timing records are incomplete.")
        if (abs(stage["visibleMs"] + stage["backgroundMs"] - stage["wallClockMs"]) > tolerance
                or abs(sum(stage[field] for field in ("interactiveMs", "blockedMs", "readingMs", "setupMs")) - stage["visibleMs"]) > tolerance):
            raise ResearchError(400, "incomplete_research_timing", "Stage timing activity totals are inconsistent.")
    if abs(sum(stage["wallClockMs"] for stage in timing["stages"].values()) - timing["wallClockMs"]) > tolerance:
        raise ResearchError(400, "incomplete_research_timing", "Stage timing does not cover the complete session.")
    event_types = {event.get("type") for event in timing["events"] if isinstance(event, dict)}
    if not {"game_entered", "summary_shown"}.issubset(event_types):
        raise ResearchError(400, "incomplete_research_timing", "Game entry and summary timing markers are required.")
    if any(not isinstance(event, dict) or not finite_nonnegative(event.get("elapsedMs")) for event in timing["events"] + timing["transitions"]):
        raise ResearchError(400, "incomplete_research_timing", "Timing event offsets are invalid.")


def validate_paired_export(payload: object, record: dict, terminal: bool) -> bool:
    """Validate assignment binding and distinguish normal completion from evidence.

    Browser exports are client evidence, not server-certified research results.
    Completion nevertheless requires the actual exported four committed cores and
    a consistent terminal result; a restart/fatal export can never unlock game B.
    """
    if not isinstance(payload, dict) or payload.get("schemaVersion") != "2.0":
        raise ResearchError(400, "invalid_export", "An ExportV2 object is required.")
    session, research, condition = (payload.get(k) for k in ("session", "researchStudy", "condition"))
    if not isinstance(session, dict) or not isinstance(research, dict) or not isinstance(condition, dict):
        raise ResearchError(400, "invalid_export", "Export session and research assignment are required.")
    if (research.get("assignmentId") != record["assignmentId"] or research.get("pairId") != record["pairId"]
            or research.get("gameLabel") != record["gameLabel"] or session.get("participantId") != record["participantId"]
            or condition.get("id") != record["condition"] or research.get("protocolVersion") != record["protocolVersion"]):
        raise ResearchError(409, "study_condition_mismatch", "Export does not match the assigned participant and game.")
    if condition.get("capabilities") != record.get("capabilities"):
        raise ResearchError(409, "study_condition_mismatch", "Export capabilities do not match the assigned game.")
    if not isinstance(session.get("sessionId"), str) or not 1 <= len(session["sessionId"]) <= 160:
        raise ResearchError(400, "invalid_export", "A valid sessionId is required.")
    if session.get("adminMode") is not False:
        raise ResearchError(400, "invalid_export", "Administrative games cannot enter the participant registry.")
    video = payload.get("video")
    if not isinstance(video, dict) or any(video.get(key) is not False for key in ("rawFramesStored", "rawFramesExported", "sentToDialogueModel")):
        raise ResearchError(400, "invalid_export", "The export video boundary is invalid.")
    forbidden = {"apiKey", "api_key", "sessionToken", "ownerSecret", "rawFrame", "rawFrames", "imageDataUrl"}

    def forbidden_key(value):
        if isinstance(value, dict):
            return any(key in forbidden or forbidden_key(item) for key, item in value.items())
        return isinstance(value, list) and any(forbidden_key(item) for item in value)

    if forbidden_key(payload):
        raise ResearchError(400, "invalid_export", "Secrets and raw camera frames cannot be recorded.")
    if not isinstance(payload.get("eventLedger"), list) or not isinstance(payload.get("log"), list):
        raise ResearchError(400, "invalid_export", "The complete event and dialogue ledgers are required.")
    if not terminal:
        return False
    receipt = payload.get("terminal")
    if not isinstance(receipt, dict) or not receipt.get("reason") or not isinstance(receipt.get("idempotencyKey"), str) or not receipt["idempotencyKey"]:
        raise ResearchError(400, "invalid_terminal_export", "Terminal reason and idempotencyKey are required.")
    completion = session.get("completionType")
    if completion not in NORMAL_ENDINGS:
        return False
    outcome = payload.get("outcome", {}).get("finalOutcome") if isinstance(payload.get("outcome"), dict) else None
    if (receipt["reason"] not in ("summary", completion) or not isinstance(outcome, dict) or outcome.get("endType") != completion
            or session.get("fatalCode") or session.get("fatalContext") or _duration_ms(session) is None):
        raise ResearchError(400, "invalid_terminal_export", "The normal terminal result and session timing are inconsistent.")
    epoch = session.get("sessionEpoch")
    cores = [e for e in payload["eventLedger"] if isinstance(e, dict) and e.get("type") == "key_decision" and e.get("status") == "committed" and e.get("sessionId") == session["sessionId"] and e.get("sessionEpoch") == epoch]
    if len(cores) != 4 or [e.get("metadata", {}).get("stageId") for e in cores] != list(STAGES):
        raise ResearchError(400, "incomplete_game", "All four committed stage decisions are required before this game can complete.")
    ids = [e.get("eventId") for e in cores]
    if any(not isinstance(item, str) or not item for item in ids) or len(set(ids)) != 4 or any(e.get("rootEventId") != e["eventId"] for e in cores):
        raise ResearchError(400, "incomplete_game", "The four stage decisions must have distinct matching source events.")
    if payload.get("scenarioMeta", {}).get("stageIndex") != 3:
        raise ResearchError(400, "incomplete_game", "The game has not reached its final stage.")
    integrity = condition.get("integrity")
    if not isinstance(integrity, dict) or integrity.get("status") != "pass" or integrity.get("violationCount") != 0:
        raise ResearchError(400, "study_condition_mismatch", "The exported condition integrity did not pass.")
    validate_research_collection(payload)
    return True


def technical_resume_issue(payload: dict, record: dict) -> str:
    """Check a technical attempt's resume envelope, not its game/QA verdicts.

    The browser still runs GameRecoveryCore.prepare before importing anything.
    A partial/legacy terminal must never displace a usable checkpoint silently.
    """
    session, snapshot = payload.get("session", {}), payload.get("runtimeCheckpoint")
    outcome = payload.get("outcome")
    if (session.get("completionType") not in TECHNICAL_ENDINGS or not isinstance(outcome, dict)
            or outcome.get("finalOutcome") is not None and (not isinstance(outcome["finalOutcome"], dict)
                or outcome["finalOutcome"].get("endType") not in TECHNICAL_ENDINGS)):
        return "technical_outcome_invalid"
    if not isinstance(snapshot, dict) or snapshot.get("schemaVersion") != "socialevonpc-game-resume-v1":
        return "runtime_checkpoint_missing"
    if (payload.get("exportType") != "SocialEvoNPC.SessionExport" or type(session.get("sessionEpoch")) is not int
            or not 0 <= session["sessionEpoch"] <= 9_007_199_254_740_991
            or snapshot.get("sessionId") != session.get("sessionId") or type(snapshot.get("sessionEpoch")) is not int
            or snapshot["sessionEpoch"] != session["sessionEpoch"]
            or any(snapshot.get(key) != record.get(key) for key in ("assignmentId", "pairId", "gameLabel"))):
        return "runtime_checkpoint_binding"
    try:
        if datetime.fromisoformat(str(snapshot.get("capturedAt", "")).replace("Z", "+00:00")).tzinfo is None:
            return "runtime_checkpoint_incomplete"
    except (TypeError, ValueError):
        return "runtime_checkpoint_incomplete"
    state, globals_, interrupted = (snapshot.get(key) for key in ("state", "globals", "interrupted"))
    if not all(isinstance(value, dict) for value in (state, globals_, interrupted)):
        return "runtime_checkpoint_incomplete"
    if (any(not isinstance(state.get(key), str) for key in ("artifactDraft", "selectedArtifactOption", "artifactSubmissionStatus", "screen", "sessionEndedAt"))
            or any(type(state.get(key)) is not bool for key in ("decisionPanelVisible", "sessionClosed"))
            or any(key not in state or state[key] is not None and not isinstance(state[key], dict)
                   for key in ("activeArtifactTask", "pendingDecision", "pendingTerminalOutcome", "pendingPostDecisionContinuation"))):
        return "runtime_checkpoint_incomplete"
    for key in ("sideTalkSemanticHistory", "sideTalkOpportunityKeys", "sideTalkRootRewardKeys", "committedNpcEvents", "openWorkspaceDocumentIds"):
        if not isinstance(state.get(key), list):
            return "runtime_checkpoint_incomplete"
    if (not all(isinstance(interrupted.get(key), list) for key in ("unknownRequests", "pendingEventIds", "runtimeFlags", "diagnostics"))
            or type(interrupted.get("requiresManualContinuation")) is not bool
            or not isinstance(interrupted.get("activeEventId"), str)):
        return "runtime_checkpoint_incomplete"
    events, api, story = payload.get("eventLedger"), payload.get("api"), payload.get("story")
    if (not isinstance(events, list) or not isinstance(api, dict) or not isinstance(api.get("calls"), list)
            or not isinstance(story, dict) or not isinstance(story.get("pacing"), dict)
            or not isinstance(story["pacing"].get("completed"), list)):
        return "runtime_checkpoint_incomplete"
    completed = story["pacing"]["completed"]
    if (type(state.get("roundIndex")) is not int or not 0 <= state["roundIndex"] <= 4 or state["roundIndex"] != len(completed)
            or any(not isinstance(item, dict) or item.get("stageId") != STAGES[index]
                   for index, item in enumerate(completed))):
        return "runtime_checkpoint_progress"
    for counter, rows, field, prefix in (("eventSequence", events, "eventId", "event-"),
                                         ("apiCallSequence", api["calls"], "callId", "call-")):
        value = state.get(counter)
        if type(value) is not int or not 0 <= value <= 9_007_199_254_740_991:
            return "runtime_checkpoint_counter_floor"
        floor = 0
        seen = set()
        pattern = re.compile(re.escape(prefix + session["sessionId"] + "-") + r"([0-9]+)$")
        for item in rows:
            if not isinstance(item, dict) or not isinstance(item.get(field), str) or not item[field] or item[field] in seen:
                return "runtime_checkpoint_incomplete"
            seen.add(item[field])
            match = pattern.fullmatch(item[field])
            if match:
                floor = max(floor, int(match[1]))
        if value < floor:
            return "runtime_checkpoint_counter_floor"
    return ""


def technical_resume_follows_checkpoint(payload: dict, checkpoint: dict, cursor: int | None) -> str:
    """A late interrupted upload cannot roll back already acknowledged facts."""
    base = payload.get("terminal", {}).get("baseCheckpointSequence")
    if cursor is not None and (type(base) is not int or base != cursor):
        return "runtime_checkpoint_stale_base"
    for source in (payload, checkpoint):
        archive = source.get("researchArchive")
        if not isinstance(archive, dict) or archive.get("sessionId") != payload["session"]["sessionId"] or archive.get("modelContextUnchanged") is not True:
            return "runtime_checkpoint_archive_regression"
        for field, count_field in (("dialogueHistory", "dialogueCount"), ("retrievalTraces", "retrievalCount")):
            values = archive.get(field)
            if not isinstance(values, list) or type(archive.get(count_field)) is not int or archive[count_field] != len(values):
                return "runtime_checkpoint_archive_regression"
    for field in ("dialogueHistory", "retrievalTraces"):
        previous = checkpoint["researchArchive"][field]
        values = payload["researchArchive"][field]
        if len(values) < len(previous) or encoded(values[:len(previous)]) != encoded(previous):
            return "runtime_checkpoint_archive_regression"
    previous_events = checkpoint.get("eventLedger", [])
    if (not isinstance(previous_events, list) or any(not isinstance(event, dict) or not event.get("eventId") for event in previous_events)
            or [event["eventId"] for event in payload["eventLedger"][:len(previous_events)]] != [event["eventId"] for event in previous_events]):
        return "runtime_checkpoint_event_regression"
    previous_snapshot = checkpoint.get("runtimeCheckpoint")
    previous_state = previous_snapshot.get("state", {}) if isinstance(previous_snapshot, dict) else {}
    if not isinstance(previous_state, dict):
        return "runtime_checkpoint_counter_floor"
    for key in ("eventSequence", "apiCallSequence"):
        if type(previous_state.get(key)) is int and payload["runtimeCheckpoint"]["state"][key] < previous_state[key]:
            return "runtime_checkpoint_counter_floor"
    return ""


class ResearchStore:
    backend = "abstract"

    def __init__(self, prefix: str, protocol: str, source: dict):
        self.prefix, self.protocol, self.source = prefix, protocol, copy.deepcopy(source)

    def _fresh_registry(self) -> dict:
        ids = list(PARTICIPANTS)
        secrets.SystemRandom().shuffle(ids)
        full_first = set(ids[:len(PARTICIPANTS) // 2])
        return {pid: "full_memory" if pid in full_first else "memory_full" for pid in PARTICIPANTS}

    @staticmethod
    def _registry_capacity(orders: dict) -> int:
        if (not isinstance(orders, dict) or set(orders) not in (set(LEGACY_PARTICIPANTS), set(PARTICIPANTS))
                or any(value not in ("full_memory", "memory_full") for value in orders.values())
                or sum(value == "full_memory" for value in orders.values()) != len(orders) // 2):
            raise ResearchError(503, "registry_unavailable", "The durable participant registry is invalid; existing assignments were preserved.")
        return len(orders)

    @staticmethod
    def _expand_registry(orders: dict) -> dict:
        """Append ten slots to the legacy draw; never redraw an existing slot."""
        ResearchStore._registry_capacity(orders)
        expanded = copy.deepcopy(orders)
        missing = [pid for pid in PARTICIPANTS if pid not in orders]
        secrets.SystemRandom().shuffle(missing)
        needed = len(PARTICIPANTS) // 2 - sum(value == "full_memory" for value in orders.values())
        expanded.update({pid: "full_memory" if index < needed else "memory_full" for index, pid in enumerate(missing)})
        return expanded

    def _blank_participant(self, participant: str, order: str) -> dict:
        return {"participantId": participant, "order": order, "status": "available", "pairId": None,
                "protocolVersion": self.protocol, "currentGame": None, "games": {}, "createdAt": utc_now(), "revision": 0}

    def _get(self, participant: str) -> dict | None:
        raise NotImplementedError

    def _cas(self, participant: str, expected_revision: int, value: dict) -> bool:
        raise NotImplementedError

    def _put_blob(self, key: str, body: bytes) -> None:
        raise NotImplementedError

    def _get_blob(self, key: str) -> bytes:
        raise NotImplementedError

    @staticmethod
    def _password_configured(row: dict) -> bool:
        auth = row.get("participantAuth")
        # A damaged credential must fail closed, never become an unclaimed password.
        return "participantAuth" in row and (not isinstance(auth, dict) or any(key in auth for key in ("credential", "version", "grant")))

    @staticmethod
    def _authorization_expiry(row: dict, game: dict) -> int | None:
        if not ResearchStore._password_configured(row):
            return game.get("expiresAt")
        auth = row.get("participantAuth", {})
        if not isinstance(auth, dict):
            return None
        grant = auth.get("grant")
        if (auth.get("version") != ACCOUNT_VERSION or not isinstance(grant, dict)
                or not re.fullmatch(r"[a-f0-9]{32}", str(grant.get("generation", "")))
                or type(grant.get("issuedAt")) is not int or type(grant.get("expiresAt")) is not int
                or grant["expiresAt"] <= grant["issuedAt"]):
            return None
        return grant["expiresAt"]

    def _owner_row(self, owner: str, row: dict | None = None) -> dict:
        participant = participant_from_owner(owner)
        row = row or (self._get(participant) if participant else None)
        if (not participant or not row or row.get("participantId") != participant
                or not isinstance(row.get("ownerHash"), str) or not hmac.compare_digest(row["ownerHash"], _hash_owner(owner))):
            raise ResearchError(403, "pair_owner_required", "This browser does not own the participant enrollment.")
        return row

    def _owned(self, owner: str, row: dict | None = None) -> dict:
        row = self._owner_row(owner, row)
        if self._password_configured(row):
            expiry = self._authorization_expiry(row, {})
            if type(expiry) is not int or expiry <= int(time.time()):
                raise ResearchError(403, "pair_owner_required", "Sign in again to access this participant enrollment.")
        return row

    def _claim_value(self, row: dict, owner: str, questionnaire_policy: dict | None) -> dict:
        value = copy.deepcopy(row)
        pair_hex, now, issued_at = uuid.uuid4().hex, utc_now(), int(time.time())
        conditions = ("self-evolving", "memory-only") if row["order"] == "full_memory" else ("memory-only", "self-evolving")
        value.update(ownerHash=_hash_owner(owner), pairId=f"pair-{pair_hex}", status="in_progress", currentGame="A", startedAt=now,
                     completedAt=None, source=copy.deepcopy(self.source), games={})
        if questionnaire_policy is not None:
            value["questionnaire"] = copy.deepcopy(questionnaire_policy)
        for label, condition in zip(("A", "B"), conditions):
            value["games"][label] = {"gameLabel": label, "assignmentId": f"ab-{row['participantId']}-{pair_hex}-{label}",
                "condition": condition, "saved": False, "completed": False, "sessionId": None, "startedAt": now if label == "A" else None,
                "completedAt": None, "terminal": None, "terminalAttempts": [], "checkpoints": [], "issuedAt": issued_at,
                "expiresAt": issued_at + PAIR_TTL_SECONDS}
        return value

    @staticmethod
    def _account_denied() -> ResearchError:
        return ResearchError(403, "account_auth_failed", "The participant account could not be authenticated.")

    def _reserve_account_attempt(self, participant: str) -> dict | None:
        """Reserve before KDF so concurrent workers cannot bypass the durable limit.

        Reservations are not cleared on success: already-running requests must
        still count, and crashes must not silently refund a guessed password.
        """
        if participant not in PARTICIPANTS:
            return None
        for _ in range(24):
            row = self._get(participant)
            if not row:
                return None
            now = int(time.time())
            auth = row.get("participantAuth", {})
            if not isinstance(auth, dict):
                raise self._account_denied()
            throttle = auth.get("throttle", {})
            if not isinstance(throttle, dict):
                raise self._account_denied()
            start, attempts, blocked = (throttle.get(key, 0) for key in ("windowStart", "attempts", "blockedUntil"))
            if any(type(item) is not int or item < 0 for item in (start, attempts, blocked)):
                raise self._account_denied()
            if blocked > now or (start <= now < start + ACCOUNT_ATTEMPT_WINDOW_SECONDS and attempts >= ACCOUNT_ATTEMPT_LIMIT):
                raise ResearchError(429, "account_auth_rate_limited", "Too many account attempts; please wait before trying again.")
            if not start <= now < start + ACCOUNT_ATTEMPT_WINDOW_SECONDS:
                start, attempts = now, 0
            attempts += 1
            value = copy.deepcopy(row)
            value.setdefault("participantAuth", {})["throttle"] = {
                "windowStart": start, "attempts": attempts,
                "blockedUntil": start + ACCOUNT_ATTEMPT_WINDOW_SECONDS if attempts >= ACCOUNT_ATTEMPT_LIMIT else 0}
            if self._cas(participant, row["revision"], value):
                return value
        raise ResearchError(409, "account_auth_conflict", "The participant account changed concurrently; please retry.")

    @staticmethod
    def _account_grant() -> dict:
        issued_at = int(time.time())
        return {"generation": secrets.token_hex(16), "issuedAt": issued_at, "expiresAt": issued_at + PAIR_TTL_SECONDS}

    def register_account(self, participant: str, owner: str, password: str, questionnaire_policy: dict | None = None) -> dict:
        from study_account_auth import hash_password, validate_password, verify_password
        validate_password(password)
        row = self._reserve_account_attempt(participant)
        if not row or participant_from_owner(owner) != participant or row.get("ownerHash") or self._password_configured(row):
            verify_password(password, None)
            raise self._account_denied()
        credential = hash_password(password)
        for _ in range(24):
            row = self._get(participant)
            if not row or row.get("ownerHash") or self._password_configured(row):
                raise self._account_denied()
            value = self._claim_value(row, owner, questionnaire_policy)
            value["participantAuth"] = {**copy.deepcopy(row.get("participantAuth", {})),
                "version": ACCOUNT_VERSION, "credential": credential, "grant": self._account_grant()}
            if self._cas(participant, row["revision"], value):
                return self.current(owner)
        raise ResearchError(409, "account_auth_conflict", "The participant account changed concurrently; please retry.")

    def login_account(self, participant: str, password: str, new_owner: str) -> dict:
        from study_account_auth import validate_password, verify_password
        validate_password(password)
        row = self._reserve_account_attempt(participant)
        auth = row.get("participantAuth", {}) if row else {}
        credential = auth.get("credential")
        verified = verify_password(password, credential)
        if (not verified or not row or auth.get("version") != ACCOUNT_VERSION or not row.get("ownerHash") or not row.get("pairId")
                or participant_from_owner(new_owner) != participant):
            raise self._account_denied()
        for _ in range(24):
            row = self._get(participant)
            current_auth = row.get("participantAuth") if row else None
            if (not row or not isinstance(current_auth, dict) or current_auth.get("version") != ACCOUNT_VERSION
                    or current_auth.get("credential") != credential or not row.get("ownerHash")
                    or hmac.compare_digest(row["ownerHash"], _hash_owner(new_owner))):
                raise self._account_denied()
            value = copy.deepcopy(row)
            value["ownerHash"] = _hash_owner(new_owner)
            value["participantAuth"]["grant"] = self._account_grant()
            if self._cas(participant, row["revision"], value):
                return self.current(new_owner)
        raise ResearchError(409, "account_auth_conflict", "The participant account changed concurrently; please retry.")

    def set_account_password(self, owner: str, password: str, new_owner: str) -> dict:
        from study_account_auth import hash_password, validate_password
        validate_password(password)
        # Legacy owner proof remains sufficient after an old assignment expired;
        # only a still-secret original cookie can attach the first credential.
        try:
            row = self._owner_row(owner)
        except ResearchError:
            raise self._account_denied() from None
        participant = row["participantId"]
        if (self._password_configured(row) or participant_from_owner(new_owner) != participant
                or hmac.compare_digest(row["ownerHash"], _hash_owner(new_owner))):
            raise self._account_denied()
        self._reserve_account_attempt(participant)
        credential = hash_password(password)
        for _ in range(24):
            try:
                row = self._owner_row(owner)
            except ResearchError:
                raise self._account_denied() from None
            if self._password_configured(row):
                raise self._account_denied()
            value = copy.deepcopy(row)
            value["ownerHash"] = _hash_owner(new_owner)
            value["participantAuth"] = {**copy.deepcopy(row.get("participantAuth", {})),
                "version": ACCOUNT_VERSION, "credential": credential, "grant": self._account_grant()}
            if self._cas(participant, row["revision"], value):
                return self.current(new_owner)
        raise ResearchError(409, "account_auth_conflict", "The participant account changed concurrently; please retry.")

    def claim(self, participant: str, owner: str, questionnaire_policy: dict | None = None) -> dict:
        if participant not in PARTICIPANTS or participant_from_owner(owner) != participant:
            raise ResearchError(400, "invalid_participant_id", "Choose a participant ID from P1 to P50.")
        for _ in range(24):
            row = self._get(participant)
            if not row:
                raise ResearchError(503, "registry_unavailable", "The participant registry is unavailable.")
            if row.get("ownerHash"):
                if not hmac.compare_digest(row["ownerHash"], _hash_owner(owner)):
                    raise ResearchError(409, "participant_claimed", "This participant ID is already in use.")
                return self._owned(owner, row)
            value = self._claim_value(row, owner, questionnaire_policy)
            if self._cas(participant, row["revision"], value):
                return self.current(owner)
        raise ResearchError(409, "pair_busy", "Enrollment changed concurrently; please retry.")

    def questionnaire_orders(self) -> dict:
        """Persist 25/25 X/Y, with 12/13 in each 25-slot AB order stratum.

        Legacy 10/10 allocations in each stratum are retained. Conditional
        creation/CAS makes concurrent workers reuse the same appended draw.
        """
        key = "__questionnaire_registry__"
        game_orders = self._get("__registry__")
        capacity = self._registry_capacity(game_orders)
        participants_in_pool = [pid for pid in PARTICIPANTS if pid in game_orders]
        for _ in range(8):
            registry = self._get(key)
            orders = registry.get("orders", {}) if isinstance(registry, dict) else {}
            if registry is not None:
                if (not isinstance(registry, dict) or registry.get("version") != "questionnaire-order-v1"
                        or type(registry.get("revision")) is not int or registry["revision"] < 0
                        or not isinstance(orders, dict) or set(orders) not in (set(LEGACY_PARTICIPANTS), set(PARTICIPANTS))
                        or not set(orders).issubset(game_orders)
                        or any(value not in ("XY", "YX") for value in orders.values())
                        or sum(value == "XY" for value in orders.values()) != len(orders) // 2):
                    raise ResearchError(503, "questionnaire_registry_unavailable", "The questionnaire order registry is invalid; existing orders were preserved.")
                counts = [sum(orders[pid] == "XY" for pid in orders if game_orders[pid] == arm) for arm in ("full_memory", "memory_full")]
                if (len(orders) == len(LEGACY_PARTICIPANTS) and counts != [10, 10]
                        or len(orders) == len(PARTICIPANTS) and sorted(counts) != [12, 13]):
                    raise ResearchError(503, "questionnaire_registry_unavailable", "The questionnaire strata are invalid; existing orders were preserved.")
                if len(orders) == capacity:
                    return copy.deepcopy(orders)
            expanded = copy.deepcopy(orders)
            targets = [capacity // 4, capacity // 2 - capacity // 4]
            secrets.SystemRandom().shuffle(targets)
            for arm, target in zip(("full_memory", "memory_full"), targets):
                participants = [pid for pid in participants_in_pool if game_orders[pid] == arm and pid not in orders]
                secrets.SystemRandom().shuffle(participants)
                needed = target - sum(orders[pid] == "XY" for pid in orders if game_orders[pid] == arm)
                expanded.update({pid: "XY" if index < needed else "YX" for index, pid in enumerate(participants)})
            if registry is None:
                self._create_auxiliary(key, {"version": "questionnaire-order-v1", "orders": expanded, "createdAt": utc_now(), "revision": 0})
            elif self._cas(key, registry["revision"], {**registry, "orders": expanded}):
                return copy.deepcopy(expanded)
        raise ResearchError(503, "questionnaire_registry_unavailable", "Questionnaire allocation changed concurrently; retry without changing existing answers.")

    def _create_auxiliary(self, key: str, value: dict) -> None:
        raise NotImplementedError

    @staticmethod
    def _account_slots_unavailable():
        return ResearchError(503, "account_slots_unavailable", "Account sign-in capacity could not be verified; please try later.")

    @staticmethod
    def _validate_account_slots(row):
        if (not isinstance(row, dict) or set(row) != {"schemaVersion", "capacity", "leaseSeconds", "leases", "revision"}
                or row.get("schemaVersion") != ACCOUNT_SLOT_VERSION
                or type(row.get("capacity")) is not int or row["capacity"] != ACCOUNT_SLOT_CAPACITY
                or type(row.get("leaseSeconds")) is not int or row["leaseSeconds"] != ACCOUNT_SLOT_LEASE_SECONDS
                or type(row.get("revision")) is not int or not 0 <= row["revision"] <= 9_007_199_254_740_991
                or not isinstance(row.get("leases"), list) or len(row["leases"]) > ACCOUNT_SLOT_CAPACITY):
            raise ResearchStore._account_slots_unavailable()
        nonces = set()
        for lease in row["leases"]:
            if (not isinstance(lease, dict) or set(lease) != {"nonce", "issuedAt", "expiresAt"}
                    or not isinstance(lease.get("nonce"), str) or not re.fullmatch(r"[a-f0-9]{32}", lease["nonce"])
                    or lease["nonce"] in nonces
                    or any(type(lease.get(key)) is not int or not 0 <= lease[key] <= 9_007_199_254_740_991 for key in ("issuedAt", "expiresAt"))
                    or lease["expiresAt"] - lease["issuedAt"] != ACCOUNT_SLOT_LEASE_SECONDS):
                raise ResearchStore._account_slots_unavailable()
            nonces.add(lease["nonce"])

    def _acquire_account_slot(self):
        try:
            nonce = secrets.token_hex(16)
            for _ in range(24):
                row = self._get(ACCOUNT_SLOT_KEY)
                if row is None:
                    self._create_auxiliary(ACCOUNT_SLOT_KEY, {"schemaVersion": ACCOUNT_SLOT_VERSION,
                        "capacity": ACCOUNT_SLOT_CAPACITY, "leaseSeconds": ACCOUNT_SLOT_LEASE_SECONDS, "leases": [], "revision": 0})
                    row = self._get(ACCOUNT_SLOT_KEY)
                self._validate_account_slots(row)
                now = int(time.time())
                leases = [lease for lease in row["leases"] if lease["expiresAt"] > now]
                if len(leases) >= ACCOUNT_SLOT_CAPACITY:
                    raise ResearchError(429, "account_busy", "Account sign-in is busy; please wait briefly and try again.")
                if any(lease["nonce"] == nonce for lease in row["leases"]):
                    nonce = secrets.token_hex(16)
                    continue
                lease = {"nonce": nonce, "issuedAt": now, "expiresAt": now + ACCOUNT_SLOT_LEASE_SECONDS}
                value = copy.deepcopy(row)
                value["leases"] = leases + [lease]
                self._validate_account_slots(value)
                if self._cas(ACCOUNT_SLOT_KEY, row["revision"], value):
                    return lease
            raise self._account_slots_unavailable()
        except ResearchError:
            raise
        except Exception:
            raise self._account_slots_unavailable() from None

    def _release_account_slot(self, own_lease):
        try:
            for _ in range(24):
                row = self._get(ACCOUNT_SLOT_KEY)
                self._validate_account_slots(row)
                # A timed-out holder must never release a later/foreign lease.
                if own_lease not in row["leases"]:
                    return
                value = copy.deepcopy(row)
                value["leases"] = [lease for lease in row["leases"] if lease != own_lease]
                if self._cas(ACCOUNT_SLOT_KEY, row["revision"], value):
                    return
            raise self._account_slots_unavailable()
        except ResearchError:
            raise
        except Exception:
            raise self._account_slots_unavailable() from None

    @contextmanager
    def account_request_slot(self):
        """A namespace-wide, expiring limit; never touch game or S3 records.

        Lambda's hard timeout is 25 seconds. The 60-second durable lease keeps a
        killed worker counted until it cannot still be handling authentication.
        """
        lease = self._acquire_account_slot()
        try:
            yield
        finally:
            self._release_account_slot(lease)

    def current(self, owner: str) -> dict:
        return self._owned(owner)

    def assignment(self, assignment_id: str) -> dict | None:
        participant = assignment_participant(assignment_id)
        row = self._get(participant) if participant else None
        if not row or not row.get("pairId"):
            return None
        for label, game in row["games"].items():
            if game["assignmentId"] == assignment_id:
                expires_at = self._authorization_expiry(row, game)
                if self._password_configured(row) and expires_at is None:
                    raise ResearchError(503, "stored_account_invalid", "The saved account authorization is invalid.")
                return {"assignmentId": assignment_id, "participantId": participant, "participantHash": hashlib.sha256(participant.encode()).hexdigest(),
                        "pairId": row["pairId"], "gameLabel": label, "condition": game["condition"], "protocolVersion": row["protocolVersion"],
                        "issuedAt": game["issuedAt"], "expiresAt": expires_at,
                        "authGeneration": row.get("participantAuth", {}).get("grant", {}).get("generation") if self._password_configured(row) else None,
                        "currentGame": row["currentGame"],
                        "pairStatus": row["status"], "completed": game["completed"], "sessionId": game["sessionId"]}
        return None

    def authorize(self, owner: str, assignment_id: str, allow_saved: bool = False) -> dict:
        row = self._owned(owner)
        current = row["games"][row["currentGame"]]
        selected = next((game for game in row["games"].values() if game["assignmentId"] == assignment_id), None)
        if not selected or assignment_id != current["assignmentId"] or (not allow_saved and (selected["completed"] or row["status"] == "completed")):
            raise ResearchError(409, "inactive_study_game", "Only the current unfinished game can use this assignment.")
        if selected["gameLabel"] == "B" and not row["games"]["B"]["startedAt"]:
            raise ResearchError(409, "inactive_study_game", "The second game has not started.")
        return row

    def _reference(self, row: dict, label: str, payload: dict, kind: str) -> dict:
        body = encoded(payload)
        digest = hashlib.sha256(body).hexdigest()
        key = f"{self.prefix}/{row['participantId']}/{row['pairId']}/{label}/{kind}/{digest}.json"
        self._put_blob(key, body)
        return {"objectKey": key, "sha256": digest, "bytes": len(body), "receivedAt": utc_now()}

    @staticmethod
    def _checkpoint_cursor(game: dict) -> int | None:
        refs = game.get("checkpoints", [])
        reference_cursor = refs[-1].get("saveSequence") if refs else None
        cursor = game.get("latestCheckpointSequence", reference_cursor)
        if cursor is not None and (type(cursor) is not int or not 0 <= cursor <= 2_147_483_647 or cursor != reference_cursor):
            raise ResearchError(503, "stored_checkpoint_sequence_invalid", "The stored checkpoint sequence does not match its source reference.")
        return cursor

    def save(self, owner: str, assignment_id: str, payload: dict, terminal: bool, completed: bool) -> dict:
        row = self.authorize(owner, assignment_id, allow_saved=True)
        label = next(label for label, game in row["games"].items() if game["assignmentId"] == assignment_id)
        session_id = payload["session"]["sessionId"]
        digest = hashlib.sha256(encoded(payload)).hexdigest()
        checkpoint_sequence = None
        checkpoint = payload.get("checkpoint")
        if not terminal and isinstance(checkpoint, dict) and "saveSequence" in checkpoint:
            checkpoint_sequence = checkpoint["saveSequence"]
            if type(checkpoint_sequence) is not int or not 0 <= checkpoint_sequence <= 2_147_483_647:
                raise ResearchError(400, "invalid_checkpoint_sequence", "A non-negative integer checkpoint save sequence is required.")
        reference = None
        for _ in range(24):
            row = self._owned(owner)
            if row["currentGame"] != label:
                raise ResearchError(409, "inactive_study_game", "This game is no longer the active game.")
            game = row["games"][label]
            if game["sessionId"] and game["sessionId"] != session_id:
                raise ResearchError(409, "session_already_bound", "This game is already bound to a different session.")
            if terminal and game.get("terminal"):
                if game["terminal"]["sha256"] == digest:
                    return {"pair": row, "persisted": True, "completed": game["completed"], "idempotent": True, "recordId": digest}
                raise ResearchError(409, "terminal_already_saved", "The saved terminal record is immutable.")
            if terminal and completed:
                cursor = self._checkpoint_cursor(game)
                terminal_metadata = payload.get("terminal")
                base_sequence = terminal_metadata.get("baseCheckpointSequence") if isinstance(terminal_metadata, dict) else None
                if cursor is not None and (type(base_sequence) is not int or base_sequence != cursor):
                    raise ResearchError(409, "terminal_checkpoint_conflict", "A newer checkpoint must be recovered before this game can finish.")
            refs = game["terminalAttempts"] if terminal else game["checkpoints"]
            if not terminal:
                previous_sequence = self._checkpoint_cursor(game)
                if previous_sequence is not None:
                    if checkpoint_sequence is None:
                        raise ResearchError(409, "checkpoint_sequence_required", "This session now requires ordered checkpoint saves.")
                    if checkpoint_sequence < previous_sequence:
                        raise ResearchError(409, "checkpoint_stale_save", "A newer checkpoint is already saved.")
                    if checkpoint_sequence == previous_sequence:
                        if refs and refs[-1].get("saveSequence") == checkpoint_sequence and refs[-1]["sha256"] == digest:
                            return {"pair": row, "persisted": True, "completed": game["completed"], "idempotent": True, "recordId": digest}
                        raise ResearchError(409, "checkpoint_sequence_conflict", "One checkpoint save sequence cannot contain different snapshots.")
            if any(item["sha256"] == digest for item in refs):
                return {"pair": row, "persisted": True, "completed": game["completed"], "idempotent": True, "recordId": digest}
            checkpoint_limit = MAX_CHECKPOINTS_PER_GAME if game["completed"] else MAX_CHECKPOINTS_PER_GAME - RESERVED_SUMMARY_CHECKPOINTS
            if not terminal and len(refs) >= checkpoint_limit:
                raise ResearchError(429, "checkpoint_limit", "The checkpoint limit has been reached; terminal saving remains available.")
            if terminal and not completed and len(game["terminalAttempts"]) >= 32:
                raise ResearchError(429, "terminal_attempt_limit", "The interrupted-attempt record limit has been reached.")
            if reference is None:
                reference = self._reference(row, label, payload, "terminal" if terminal else "checkpoint")
                if not terminal and checkpoint_sequence is not None:
                    reference["saveSequence"] = checkpoint_sequence
            # Ordering belongs to the successful CAS, not to S3 upload time.
            # The same blob may survive a CAS retry while newer saves commit.
            reference["savedRevision"] = row["revision"] + 1
            value = copy.deepcopy(row)
            saved_game = value["games"][label]
            saved_game["sessionId"] = session_id
            saved_game["lastSavedAt"] = reference["receivedAt"]
            if terminal and completed:
                saved_game.update(terminal=reference, completed=True, saved=True, completedAt=reference["receivedAt"],
                                  completionType=payload["session"]["completionType"], durationMs=_duration_ms(payload["session"]))
            elif terminal:
                saved_game["terminalAttempts"].append(reference)
                saved_game["lastInterruptedAt"] = reference["receivedAt"]
            else:
                saved_game["checkpoints"].append(reference)
                if checkpoint_sequence is not None:
                    saved_game["latestCheckpointSequence"] = checkpoint_sequence
            if self._cas(row["participantId"], row["revision"], value):
                return {"pair": self.current(owner), "persisted": True, "completed": saved_game["completed"], "idempotent": False, "recordId": digest}
        raise ResearchError(409, "pair_busy", "The game record changed concurrently; please retry.")

    def advance(self, owner: str) -> dict:
        for _ in range(24):
            row = self._owned(owner)
            if row["currentGame"] == "B":
                return row
            if not all(row["games"]["A"].get(key) for key in ("saved", "completed", "terminal")):
                raise ResearchError(409, "game_a_not_saved", "The first game must finish and be saved before the second game starts.")
            value = copy.deepcopy(row)
            value["currentGame"] = "B"
            value["games"]["B"]["startedAt"] = utc_now()
            if self._cas(row["participantId"], row["revision"], value):
                return self.current(owner)
        raise ResearchError(409, "pair_busy", "The enrollment changed concurrently; please retry.")

    def complete(self, owner: str) -> dict:
        for _ in range(24):
            row = self._owned(owner)
            if row["status"] == "completed":
                return row
            if row["currentGame"] != "B" or not all(game.get("saved") and game.get("completed") and game.get("terminal") for game in row["games"].values()):
                raise ResearchError(409, "pair_not_complete", "Both games must finish and be saved before enrollment completes.")
            value = copy.deepcopy(row)
            value.update(status="completed", completedAt=utc_now())
            if self._cas(row["participantId"], row["revision"], value):
                return self.current(owner)
        raise ResearchError(409, "pair_busy", "The enrollment changed concurrently; please retry.")

    def completed_pair(self, owner: str) -> dict:
        """Owner-only read, separate from current unfinished assignment tokens."""
        row = self._owned(owner)
        if (row.get("status") != "completed" or set(row.get("games", {})) != {"A", "B"}
                or any(not game.get("saved") or not game.get("completed") or not game.get("terminal")
                       for game in row["games"].values())):
            raise ResearchError(409, "pair_not_complete", "Both normal games must be saved before keepsakes are available.")
        return row

    def terminal_payload(self, row: dict, label: str) -> dict:
        reference = row["games"][label]["terminal"]
        return self.read_export_reference(reference)

    def read_export_reference(self, reference: dict) -> dict:
        """Read one immutable object with its stored checksum, never by client key."""
        body = self._get_blob(reference["objectKey"])
        if hashlib.sha256(body).hexdigest() != reference["sha256"] or ("bytes" in reference and reference["bytes"] != len(body)):
            raise ResearchError(503, "stored_export_integrity", "A stored export failed its integrity check.")
        try:
            payload = json.loads(body, parse_constant=lambda _value: (_ for _ in ()).throw(ValueError()))
        except (ValueError, UnicodeDecodeError):
            raise ResearchError(503, "stored_export_integrity", "A stored export is not valid JSON.") from None
        if not isinstance(payload, dict):
            raise ResearchError(503, "stored_export_integrity", "A stored export is not an object.")
        return payload

    @staticmethod
    def _recovery_reference(reference: dict) -> dict:
        return {key: copy.deepcopy(reference[key]) for key in ("sha256", "bytes", "receivedAt", "saveSequence", "savedRevision") if key in reference}

    @staticmethod
    def _recovery_reference_order(candidate: dict, previous: dict) -> int:
        """Compare accepted saves; old references retain their original metadata."""
        revisions = [reference.get("savedRevision") for reference in (candidate, previous)]
        if any(value is not None and (type(value) is not int or value <= 0) for value in revisions):
            raise ResearchError(503, "stored_recovery_order_invalid", "Saved source revision metadata is invalid.")
        if all(type(value) is int and value > 0 for value in revisions):
            if revisions[0] == revisions[1] and candidate.get("sha256") != previous.get("sha256"):
                raise ResearchError(503, "stored_recovery_order_invalid", "Two saved sources have the same save revision.")
            return (revisions[0] > revisions[1]) - (revisions[0] < revisions[1])
        try:
            dates = [datetime.fromisoformat(str(reference.get("receivedAt", "")).replace("Z", "+00:00"))
                     for reference in (candidate, previous)]
            if any(value.tzinfo is None for value in dates):
                raise ValueError()
        except (TypeError, ValueError):
            raise ResearchError(503, "stored_recovery_order_invalid", "Saved source ordering metadata is invalid.") from None
        return (dates[0] > dates[1]) - (dates[0] < dates[1])

    def recovery(self, owner: str, *, capabilities_for_condition) -> dict:
        """Read only this owner's current game; no claims, renewal or writes.

        The trusted server supplies its canonical capability policy. A new
        process can rebuild the existing assignment token from durable metadata.
        """
        row = self.current(owner)
        label = row.get("currentGame")
        game = row.get("games", {}).get(label)
        if label not in ("A", "B") or not isinstance(game, dict) or not game.get("startedAt"):
            raise ResearchError(409, "inactive_study_game", "The current study game has not started.")
        effective_expiry = self._authorization_expiry(row, game)
        if type(effective_expiry) is not int or effective_expiry <= int(time.time()):
            raise ResearchError(403, "recovery_assignment_expired", "The original study assignment has expired; contact the researcher.")
        if game.get("condition") not in ("self-evolving", "memory-only"):
            raise ResearchError(503, "stored_recovery_binding", "The stored game condition is invalid.")
        record = {"assignmentId": game["assignmentId"], "participantId": row["participantId"], "pairId": row["pairId"],
                  "gameLabel": label, "condition": game["condition"], "protocolVersion": row["protocolVersion"],
                  "capabilities": {"id": game["condition"], **capabilities_for_condition(game["condition"])}}
        def read(reference, normal_terminal=False):
            payload = self.read_export_reference(reference)
            try:
                normal = validate_paired_export(payload, record, terminal=normal_terminal)
                if payload["session"]["sessionId"] != game.get("sessionId") or not game.get("sessionId"):
                    raise ResearchError(409, "session_already_bound", "The saved session does not match.")
                if normal_terminal and not normal:
                    raise ResearchError(409, "incomplete_game", "The terminal is not a normal completed game.")
                if reference.get("saveSequence") is not None and payload.get("checkpoint", {}).get("saveSequence") != reference["saveSequence"]:
                    raise ResearchError(409, "checkpoint_sequence_conflict", "The checkpoint source sequence does not match.")
            except (ResearchError, KeyError, TypeError, ValueError):
                raise ResearchError(503, "stored_recovery_binding", "The stored recovery does not match the current participant, assignment and session.") from None
            return payload
        checkpoints = game.get("checkpoints", [])
        normal = game.get("saved") is True and game.get("completed") is True and bool(game.get("terminal"))
        if any((game.get("saved"), game.get("completed"), game.get("terminal"))) and not normal:
            raise ResearchError(503, "stored_recovery_binding", "The stored completion and terminal references disagree.")
        reference = game["terminal"] if normal else checkpoints[-1] if checkpoints else None
        source, payload, technical_stop = "terminal" if normal else "checkpoint", None, None
        cursor = self._checkpoint_cursor(game)
        if not normal and game.get("terminalAttempts"):
            attempt_reference = game["terminalAttempts"][-1]
            ordering = self._recovery_reference_order(attempt_reference, reference) if reference else 1
            if ordering >= 0:
                attempt = read(attempt_reference)
                terminal_metadata = attempt.get("terminal")
                reason = terminal_metadata.get("reason") if isinstance(terminal_metadata, dict) else None
                if reason in ("technical_stop", "fatal", "study_profile_failure") or attempt.get("session", {}).get("fatalCode"):
                    if ordering == 0 and reference and attempt_reference["sha256"] != reference["sha256"]:
                        raise ResearchError(409, "recovery_order_unconfirmed", "The latest saved source cannot be determined safely; contact the researcher.")
                    issue = technical_resume_issue(attempt, record)
                    checkpoint_payload = read(reference) if not issue and reference else None
                    if not issue and checkpoint_payload is not None:
                        issue = technical_resume_follows_checkpoint(attempt, checkpoint_payload, cursor)
                    technical_stop = {"reference": self._recovery_reference(attempt_reference), "reason": reason,
                        "completionType": attempt.get("session", {}).get("completionType"), "usable": not bool(issue),
                        "newerThanSource": bool(issue and reference), **({"unusableReason": issue} if issue else {})}
                    if not issue:
                        reference, payload, source = attempt_reference, attempt, "technical_stop"
                    else:
                        # Returning an older checkpoint could reuse IDs and
                        # roll back facts already present in this saved attempt.
                        raise ResearchError(409, "technical_stop_resume_unavailable", "The latest saved technical stop cannot safely resume. All records are retained; contact the researcher.")
        if not reference:
            raise ResearchError(404, "recovery_not_available", "No saved checkpoint is available for the current game.")
        payload = payload if payload is not None else read(reference, normal_terminal=normal)
        recovery = {"source": source, "reference": self._recovery_reference(reference), "export": payload,
                    "highestAcceptedSequence": cursor if cursor is not None else -1}
        if technical_stop:
            recovery["technicalStop"] = technical_stop
        if normal and checkpoints:
            latest_reference = checkpoints[-1]
            latest = read(latest_reference)
            timing = payload.get("researchStudy", {}).get("timing", {})
            latest_timing = latest.get("researchStudy", {}).get("timing", {})
            later_receipt = self._recovery_reference_order(latest_reference, reference) >= 0
            no_timing_regression = (isinstance(latest_timing, dict) and all(type(latest_timing.get(key)) in (int, float)
                and math.isfinite(latest_timing[key]) and latest_timing[key] >= timing.get(key, 0) for key in ("wallClockMs", "summaryVisibleMs")))
            archive = payload.get("researchArchive", {})
            latest_archive = latest.get("researchArchive")
            archive_extends_terminal = (isinstance(latest_archive, dict) and latest_archive.get("modelContextUnchanged") is True
                and all(latest_archive.get(key) == archive.get(key)
                for key in ("schemaVersion", "sessionId", "modelContextUnchanged")))
            if archive_extends_terminal:
                for field, count_field in (("dialogueHistory", "dialogueCount"), ("retrievalTraces", "retrievalCount")):
                    original_values, latest_values = archive.get(field), latest_archive.get(field)
                    if (not isinstance(original_values, list) or not isinstance(latest_values, list)
                            or type(latest_archive.get(count_field)) is not int or latest_archive[count_field] != len(latest_values)
                            or len(latest_values) < len(original_values)
                            or encoded(latest_values[:len(original_values)]) != encoded(original_values)
                            or any(not isinstance(item, dict) or type(item.get("archiveSequence")) is not int or item["archiveSequence"] != index
                                   for index, item in enumerate(latest_values, 1))):
                        archive_extends_terminal = False
                        break
            if (later_receipt and no_timing_regression and archive_extends_terminal
                    and latest.get("session", {}).get("completionType") == payload["session"]["completionType"]
                    and latest.get("outcome", {}).get("finalOutcome") == payload.get("outcome", {}).get("finalOutcome")
                    and all(latest.get("session", {}).get(key) == payload["session"].get(key) for key in ("sessionEpoch", "startedAt", "endedAt"))):
                recovery["latestCheckpoint"] = {"purpose": "summary_appendix", "reference": self._recovery_reference(latest_reference), "export": latest}
        latest_row = self.current(owner)
        latest_game = latest_row.get("games", {}).get(label, {})
        if (latest_row.get("currentGame") != label or latest_game.get("assignmentId") != game["assignmentId"]
                or latest_game.get("sessionId") != game.get("sessionId") or latest_game.get("terminal") != game.get("terminal")
                or latest_game.get("checkpoints", [])[-1:] != checkpoints[-1:]
                or latest_game.get("terminalAttempts", [])[-1:] != game.get("terminalAttempts", [])[-1:]):
            raise ResearchError(409, "recovery_state_changed", "The saved game changed during recovery; request it again.")
        return {"pair": latest_row, "recovery": recovery}

    def reserve_keepsake_image(self, owner: str, label: str, source_hash: str, job: str) -> tuple[bool, dict]:
        """Durable one-attempt permit. Never change games or immutable terminals."""
        won, image, _capability = self._reserve_keepsake_image(owner, label, source_hash, job, issue_capability=False)
        return won, image

    def reserve_keepsake_image_job(self, owner: str, label: str, source_hash: str, job: str) -> tuple[bool, dict, _KeepsakeJobCapability | None]:
        """Server-only reservation plus authority captured at the winning CAS.

        Only the winning original request receives a capability. A refresh,
        duplicate click or new login cannot start another background generation.
        """
        return self._reserve_keepsake_image(owner, label, source_hash, job, issue_capability=True)

    def _reserve_keepsake_image(self, owner, label, source_hash, job, *, issue_capability):
        if label not in ("A", "B") or not re.fullmatch(r"[a-f0-9]{32}", job):
            raise ResearchError(400, "invalid_image_job", "Invalid game or image job.")
        for _ in range(24):
            row = self.completed_pair(owner)
            if row["games"][label]["terminal"]["sha256"] != source_hash:
                raise ResearchError(409, "keepsake_source_changed", "The saved game source does not match.")
            existing = row.get("keepsakeImages", {}).get(label)
            if existing:
                if existing.get("sourceHash") != source_hash:
                    raise ResearchError(409, "keepsake_source_changed", "The image belongs to a different saved source.")
                return False, copy.deepcopy(existing), None
            value = copy.deepcopy(row)
            image = {"status": "pending", "jobId": job, "sourceHash": source_hash,
                     "createdAt": utc_now(), "pendingUntil": time.time() + 300,
                     "consent": True, "consentVersion": "paired-keepsakes-v1"}
            value.setdefault("keepsakeImages", {})[label] = image
            if self._cas(row["participantId"], row["revision"], value):
                capability = self._keepsake_job_capability(row, label, image) if issue_capability else None
                return True, copy.deepcopy(image), capability
        raise ResearchError(409, "pair_busy", "The enrollment changed concurrently; please retry.")

    def _keepsake_job_capability(self, row, label, image):
        values = (self.prefix, self.protocol, row["participantId"], row["pairId"], label, image["jobId"], image["sourceHash"], hashlib.sha256(encoded(image)).hexdigest())
        seal = hmac.new(_KEEPSAKE_JOB_SEAL_KEY, encoded(values), hashlib.sha256).hexdigest()
        return _KeepsakeJobCapability(*values, seal)

    def _keepsake_job_row(self, capability):
        if type(capability) is not _KeepsakeJobCapability:
            raise ResearchError(403, "image_job_capability_invalid", "This background image job is not authorized.")
        values = tuple(getattr(capability, name) for name in ("prefix", "protocol", "participant", "pair_id", "label", "job_id", "source_hash", "permit_hash"))
        if not all(isinstance(value, str) for value in (*values, capability.seal)) or not re.fullmatch(r"[a-f0-9]{64}", capability.seal):
            raise ResearchError(403, "image_job_capability_invalid", "This background image job is not authorized.")
        seal = hmac.new(_KEEPSAKE_JOB_SEAL_KEY, encoded(values), hashlib.sha256).hexdigest()
        if (capability.prefix != self.prefix or capability.protocol != self.protocol
                or not hmac.compare_digest(capability.seal, seal)):
            raise ResearchError(403, "image_job_capability_invalid", "This background image job is not authorized.")
        row = self._get(capability.participant)
        games = row.get("games", {}) if row else {}
        image = row.get("keepsakeImages", {}).get(capability.label, {}) if row else {}
        if (not row or row.get("participantId") != capability.participant or row.get("pairId") != capability.pair_id
                or row.get("protocolVersion") != capability.protocol or row.get("status") != "completed"
                or set(games) != {"A", "B"} or capability.label not in ("A", "B")
                or any(not game.get("saved") or not game.get("completed") or not game.get("terminal") for game in games.values())
                or games[capability.label]["terminal"].get("sha256") != capability.source_hash
                or image.get("jobId") != capability.job_id or image.get("sourceHash") != capability.source_hash
                or image.get("status") not in ("pending", "ready", "failed")
                or (image.get("status") == "pending" and hashlib.sha256(encoded(image)).hexdigest() != capability.permit_hash)):
            raise ResearchError(409, "image_job_mismatch", "The background image job no longer matches its reserved source.")
        return row, image

    def finish_keepsake_image_job(self, capability: _KeepsakeJobCapability, png: bytes | None, metadata: dict | None = None) -> None:
        """Finish this reserved append-only result after browser authorization rotates.

        The capability cannot authorize a new generation, game save, rating or
        questionnaire. Owner-facing writes still require the current cookie.
        """
        row, image = self._keepsake_job_row(capability)
        if image["status"] != "pending":
            return
        reference = None
        if png is not None:
            if not png.startswith(b"\x89PNG\r\n\x1a\n") or len(png) > 16_000_000:
                raise ValueError("Invalid keepsake PNG")
            digest = hashlib.sha256(png).hexdigest()
            key = f"{self.prefix}/{capability.participant}/{capability.pair_id}/{capability.label}/keepsakes/{capability.source_hash}/{digest}.png"
            self._put_image_blob(key, png)
            reference = {"objectKey": key, "sha256": digest, "bytes": len(png)}
        for _ in range(24):
            row, image = self._keepsake_job_row(capability)
            if image["status"] != "pending":
                return
            value = copy.deepcopy(row)
            record = value["keepsakeImages"][capability.label]
            record.update(status="ready" if reference else "failed", finishedAt=utc_now())
            if reference:
                record.update(image=reference, metadata=copy.deepcopy(metadata or {}))
            else:
                record["errorCode"] = "image_generation_unavailable"
            if self._cas(row["participantId"], row["revision"], value):
                return
        raise ResearchError(409, "pair_busy", "The image job changed concurrently; please retry saving this same result.")

    def finish_keepsake_image(self, owner: str, label: str, job: str, source_hash: str,
                              png: bytes | None, metadata: dict | None = None) -> None:
        reference = None
        if png is not None:
            if not png.startswith(b"\x89PNG\r\n\x1a\n") or len(png) > 16_000_000:
                raise ValueError("Invalid keepsake PNG")
            row = self.completed_pair(owner)
            image = row.get("keepsakeImages", {}).get(label, {})
            if image.get("jobId") != job or image.get("sourceHash") != source_hash:
                raise ResearchError(409, "image_job_mismatch", "The image job does not match the owner and source.")
            digest = hashlib.sha256(png).hexdigest()
            key = f"{self.prefix}/{row['participantId']}/{row['pairId']}/{label}/keepsakes/{source_hash}/{digest}.png"
            self._put_image_blob(key, png)
            reference = {"objectKey": key, "sha256": digest, "bytes": len(png)}
        for _ in range(24):
            row = self.completed_pair(owner)
            image = row.get("keepsakeImages", {}).get(label, {})
            if image.get("jobId") != job or image.get("sourceHash") != source_hash:
                raise ResearchError(409, "image_job_mismatch", "The image job does not match the owner and source.")
            if image.get("status") != "pending":
                return
            value = copy.deepcopy(row)
            record = value["keepsakeImages"][label]
            record.update(status="ready" if reference else "failed", finishedAt=utc_now())
            if reference:
                record.update(image=reference, metadata=copy.deepcopy(metadata or {}))
            else:
                record["errorCode"] = "image_generation_unavailable"
            if self._cas(row["participantId"], row["revision"], value):
                return
        raise ResearchError(409, "pair_busy", "The enrollment changed concurrently; please retry.")

    def _put_image_blob(self, key: str, body: bytes) -> None:
        self._put_blob(key, body)

    def public_pair(self, row: dict) -> dict:
        return {key: copy.deepcopy(row.get(key)) for key in ("pairId", "participantId", "currentGame", "status", "startedAt", "completedAt", "protocolVersion")} | {
            "passwordConfigured": self._password_configured(row),
            "games": {label: {key: copy.deepcopy(game.get(key)) for key in ("gameLabel", "saved", "completed", "sessionId", "startedAt", "completedAt", "lastSavedAt", "durationMs")} |
                {"checkpointAvailable": bool(game.get("checkpoints")), "activeTokenAllowed": row["currentGame"] == label and not game["completed"] and row["status"] != "completed"}
                for label, game in row["games"].items()}}

    def registry(self) -> list[dict]:
        rows = []
        for participant in PARTICIPANTS:
            row = self._get(participant)
            if row:
                visible = self.public_pair(row)
                visible.update(order=row["order"], source=row.get("source"), revision=row["revision"])
                for label, game in row["games"].items():
                    visible["games"][label].update(condition=game["condition"], assignmentId=game["assignmentId"],
                                                  checkpointCount=len(game["checkpoints"]), interruptedAttemptCount=len(game["terminalAttempts"]))
                if row.get("questionnaire"):
                    q = row["questionnaire"]
                    submitted = [stage for stage, entry in q.get("stages", {}).items() if entry.get("status") == "submitted"]
                    missing = [stage for stage, entry in q.get("stages", {}).items() if entry.get("status") == "missing_legacy"]
                    state = "legacy_partial" if missing else "submitted" if len(submitted) == 5 else "in_progress" if any(entry.get("seenAt") for entry in q.get("stages", {}).values()) else "not_started"
                    visible["questionnaireSummary"] = {"enabled": True, "version": q["version"], "policy": q["policy"], "status": state,
                                                        "submittedStages": submitted, "missingLegacy": missing, "formOrder": q["order"]}
                rows.append(visible)
        return rows

    def export(self, participant: str, history: bool = False) -> dict:
        if participant not in PARTICIPANTS:
            raise ResearchError(400, "invalid_participant_id", "Choose a participant ID from P1 to P50.")
        row = self._get(participant)
        if not row:
            raise ResearchError(404, "participant_not_found", "The participant record was not found.")
        manifest = copy.deepcopy(row)
        manifest.pop("ownerHash", None)
        manifest.pop("participantAuth", None)
        games = {}
        for label, game in row["games"].items():
            def read(reference):
                body = self._get_blob(reference["objectKey"])
                if hashlib.sha256(body).hexdigest() != reference["sha256"]:
                    raise ResearchError(503, "stored_export_integrity", "A stored export failed its integrity check.")
                return json.loads(body)
            checkpoints = game["checkpoints"] if history else game["checkpoints"][-1:]
            interrupted = game["terminalAttempts"] if history else game["terminalAttempts"][-1:]
            games[label] = {"terminal": read(game["terminal"]) if game["terminal"] else None,
                            "checkpoints": [read(ref) for ref in checkpoints],
                            "interruptedAttempts": [read(ref) for ref in interrupted]}
        questionnaire = None
        if row.get("questionnaire"):
            def read_questionnaire(reference):
                if not reference:
                    return None
                body = self._get_blob(reference["objectKey"])
                if hashlib.sha256(body).hexdigest() != reference["sha256"]:
                    raise ResearchError(503, "stored_questionnaire_integrity", "A stored questionnaire failed its integrity check.")
                return json.loads(body)
            questionnaire = {"policy": copy.deepcopy(row["questionnaire"]), "stages": {stage: {
                "draft": read_questionnaire(entry.get("draft")), "submitted": read_questionnaire(entry.get("submitted")),
                **({"history": [read_questionnaire(ref) for ref in entry.get("history", [])]} if history else {})}
                for stage, entry in row["questionnaire"].get("stages", {}).items()}}
        return {"schemaVersion": "socialevo-paired-export-v1", "exportedAt": utc_now(), "historyIncluded": history,
                "historyPolicy": "All immutable object references and checksums are in manifest; default includes complete terminals and latest checkpoint/interruption per game.",
                "manifest": manifest, "games": games, **({"questionnaires": questionnaire} if questionnaire else {})}


class SQLiteResearchStore(ResearchStore):
    backend = "sqlite"

    def __init__(self, path: str, prefix: str, protocol: str, source: dict):
        super().__init__(prefix, protocol, source)
        self.path = str(Path(path).expanduser().resolve())
        Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        with self._connection() as connection:
            connection.execute("PRAGMA journal_mode=WAL")
            connection.execute("CREATE TABLE IF NOT EXISTS research_rows (namespace TEXT, participant TEXT, revision INTEGER NOT NULL, document TEXT NOT NULL, PRIMARY KEY(namespace, participant))")
            connection.execute("CREATE TABLE IF NOT EXISTS research_objects (object_key TEXT PRIMARY KEY, body BLOB NOT NULL)")
            connection.execute("BEGIN IMMEDIATE")
            existing = connection.execute("SELECT document FROM research_rows WHERE namespace=? AND participant='__registry__'", (self.prefix,)).fetchone()
            orders = json.loads(existing[0]) if existing else self._fresh_registry()
            expanded = self._expand_registry(orders)
            if not existing:
                connection.execute("INSERT INTO research_rows VALUES (?, '__registry__', 0, ?)", (self.prefix, encoded(orders).decode()))
            elif expanded != orders:
                connection.execute("UPDATE research_rows SET document=?, revision=revision+1 WHERE namespace=? AND participant='__registry__'", (encoded(expanded).decode(), self.prefix))
            orders = expanded
            for participant in PARTICIPANTS:
                row = self._blank_participant(participant, orders[participant])
                connection.execute("INSERT OR IGNORE INTO research_rows VALUES (?, ?, 0, ?)", (self.prefix, participant, encoded(row).decode()))

    @contextmanager
    def _connection(self):
        connection = sqlite3.connect(self.path, timeout=30)
        try:
            os.chmod(self.path, 0o600)
            connection.execute("PRAGMA busy_timeout=30000")
            with connection:
                yield connection
        finally:
            connection.close()

    def _get(self, participant):
        with self._connection() as connection:
            result = connection.execute("SELECT document FROM research_rows WHERE namespace=? AND participant=?", (self.prefix, participant)).fetchone()
        return json.loads(result[0]) if result else None

    def _cas(self, participant, expected_revision, value):
        value = copy.deepcopy(value)
        value["revision"] = expected_revision + 1
        with self._connection() as connection:
            result = connection.execute("UPDATE research_rows SET revision=?, document=? WHERE namespace=? AND participant=? AND revision=?",
                (value["revision"], encoded(value).decode(), self.prefix, participant, expected_revision))
            return result.rowcount == 1

    def _create_auxiliary(self, key, value):
        with self._connection() as connection:
            connection.execute("INSERT OR IGNORE INTO research_rows VALUES (?, ?, 0, ?)", (self.prefix, key, encoded(value).decode()))

    def _put_blob(self, key, body):
        with self._connection() as connection:
            connection.execute("INSERT OR IGNORE INTO research_objects VALUES (?, ?)", (key, body))

    def _get_blob(self, key):
        with self._connection() as connection:
            result = connection.execute("SELECT body FROM research_objects WHERE object_key=?", (key,)).fetchone()
        if not result:
            raise ResearchError(503, "stored_export_unavailable", "A stored export is unavailable.")
        return bytes(result[0])


class AWSResearchStore(ResearchStore):
    backend = "aws"

    def __init__(self, table: str, bucket: str, prefix: str, protocol: str, source: dict):
        super().__init__(prefix, protocol, source)
        import boto3  # Only the explicitly configured production backend needs boto3.
        self.table_name, self.bucket = table, bucket
        region = os.environ.get("AWS_DEFAULT_REGION", "").strip() or os.environ.get("AWS_REGION", "").strip()
        options = {"region_name": region} if region else {}
        self.dynamodb, self.s3 = boto3.client("dynamodb", **options), boto3.client("s3", **options)
        meta_key = self._key("__registry__")
        metadata = self.dynamodb.get_item(TableName=table, Key={"pk": {"S": meta_key}}, ConsistentRead=True).get("Item")
        if not metadata:
            orders = self._fresh_registry()
            try:
                self.dynamodb.put_item(TableName=table, Item={"pk": {"S": meta_key}, "document": {"S": encoded(orders).decode()}, "revision": {"N": "0"}}, ConditionExpression="attribute_not_exists(pk)")
            except Exception as exc:
                if not self._conditional(exc):
                    raise
            metadata = self.dynamodb.get_item(TableName=table, Key={"pk": {"S": meta_key}}, ConsistentRead=True).get("Item")
        if not metadata:
            raise ResearchError(503, "registry_unavailable", "The durable participant registry is unavailable.")
        for _ in range(8):
            orders = json.loads(metadata["document"]["S"])
            expanded = self._expand_registry(orders)
            if expanded == orders:
                break
            try:
                self.dynamodb.put_item(TableName=table,
                    Item={"pk": {"S": meta_key}, "document": {"S": encoded(expanded).decode()}, "revision": {"N": str(int(metadata["revision"]["N"]) + 1)}},
                    ConditionExpression="#revision = :expected", ExpressionAttributeNames={"#revision": "revision"},
                    ExpressionAttributeValues={":expected": metadata["revision"]})
            except Exception as exc:
                if not self._conditional(exc):
                    raise
            metadata = self.dynamodb.get_item(TableName=table, Key={"pk": {"S": meta_key}}, ConsistentRead=True).get("Item")
            if not metadata:
                raise ResearchError(503, "registry_unavailable", "The durable participant registry is unavailable.")
        else:
            raise ResearchError(503, "registry_unavailable", "The participant registry changed concurrently; existing slots were preserved.")
        for participant in PARTICIPANTS:
            try:
                self.dynamodb.put_item(TableName=table, Item={"pk": {"S": self._key(participant)}, "document": {"S": encoded(self._blank_participant(participant, orders[participant])).decode()}, "revision": {"N": "0"}}, ConditionExpression="attribute_not_exists(pk)")
            except Exception as exc:
                if not self._conditional(exc):
                    raise

        # Verify the actual instance role can both write and read private data.
        # This tiny system object never occupies a participant or simulates play.
        # Construction is cached by server.py, so health polling does not write.
        probe = encoded({"schemaVersion": "socialevo-storage-health-v1", "protocolVersion": self.protocol,
                         "purpose": "private-storage-read-write-check"})
        probe_hash = hashlib.sha256(probe).hexdigest()
        probe_key = f"{self.prefix}/system/health/{probe_hash}.json"
        self._put_blob(probe_key, probe)
        if hashlib.sha256(self._get_blob(probe_key)).hexdigest() != probe_hash:
            raise ResearchError(503, "research_storage_integrity", "The private object store failed its readiness check.")

    def _key(self, participant):
        return f"{self.prefix}#{participant}"

    @staticmethod
    def _conditional(exc):
        return getattr(exc, "response", {}).get("Error", {}).get("Code") == "ConditionalCheckFailedException"

    def _get(self, participant):
        result = self.dynamodb.get_item(TableName=self.table_name, Key={"pk": {"S": self._key(participant)}}, ConsistentRead=True).get("Item")
        return json.loads(result["document"]["S"]) if result else None

    def _cas(self, participant, expected_revision, value):
        value = copy.deepcopy(value)
        value["revision"] = expected_revision + 1
        try:
            self.dynamodb.put_item(TableName=self.table_name, Item={"pk": {"S": self._key(participant)}, "revision": {"N": str(value["revision"])}, "document": {"S": encoded(value).decode()}},
                ConditionExpression="#revision = :expected", ExpressionAttributeNames={"#revision": "revision"}, ExpressionAttributeValues={":expected": {"N": str(expected_revision)}})
            return True
        except Exception as exc:
            if self._conditional(exc):
                return False
            raise

    def _create_auxiliary(self, key, value):
        try:
            self.dynamodb.put_item(TableName=self.table_name, Item={"pk": {"S": self._key(key)}, "revision": {"N": "0"}, "document": {"S": encoded(value).decode()}}, ConditionExpression="attribute_not_exists(pk)")
        except Exception as exc:
            if not self._conditional(exc):
                raise

    def _put_blob(self, key, body):
        self.s3.put_object(Bucket=self.bucket, Key=key, Body=body, ContentType="application/json", ServerSideEncryption="AES256", Metadata={"sha256": hashlib.sha256(body).hexdigest()})

    def _put_image_blob(self, key, body):
        self.s3.put_object(Bucket=self.bucket, Key=key, Body=body, ContentType="image/png", ServerSideEncryption="AES256", Metadata={"sha256": hashlib.sha256(body).hexdigest()})

    def _get_blob(self, key):
        response = self.s3.get_object(Bucket=self.bucket, Key=key)
        with response["Body"] as body:
            return body.read()
