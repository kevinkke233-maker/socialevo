"""Owner-scoped paired keepsakes from immutable saved public facts only.

No questionnaire-completion claim, research measure, hidden NPC state, raw player
text or dialogue is projected. Image permits live in durable storage, not here.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import math
import time
from decimal import Decimal

import recap_image
from research_store import ResearchError, encoded

STAGES = tuple(recap_image.STAGES)
TASKS = ("", "brief_review", "revision_plan", "contribution_statement")
ANCHORS = ("", "advisor_review", "return_blame", "final_check")
PARENTS = {"advisor_review": None, "revision_review": "advisor_review", "return_blame": "revision_review", "final_check": "return_blame"}
CHOICES = tuple({item["id"] for item in row["choices"]} for row in recap_image.CHOICES)
ANCHOR_STAGE = {"advisor_review": STAGES[1], "revision_review": STAGES[2], "return_blame": STAGES[2], "final_check": STAGES[3]}


def _obj(value):
    return value if isinstance(value, dict) else {}


def _rows(value):
    return value if isinstance(value, list) else []


def _stable_hash(value):
    """SocialEvoCore.stableHash over sorted JSON and JavaScript UTF-16 units."""
    def stringify(item):
        if isinstance(item, dict):
            return "{" + ",".join(json.dumps(key, ensure_ascii=False) + ":" + stringify(item[key]) for key in sorted(item)) + "}"
        if isinstance(item, list):
            return "[" + ",".join(stringify(part) for part in item) + "]"
        if type(item) is float:
            if not math.isfinite(item):
                raise ValueError("Non-finite source number")
            if item == 0:
                return "0"
            shortest = repr(item)
            if 1e-6 <= abs(item) < 1e21:
                # JSON.stringify uses decimal notation throughout this range;
                # preserve the shortest decimal, not the binary integer value.
                decimal = format(Decimal(shortest), "f")
                return decimal.rstrip("0").rstrip(".") if "." in decimal else decimal
            coefficient, exponent = shortest.lower().split("e")
            coefficient = coefficient.removesuffix(".0")
            power = int(exponent)
            return coefficient + "e" + ("+" if power >= 0 else "-") + str(abs(power))
        return json.dumps(item, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    text = value if isinstance(value, str) else stringify(value)
    raw, result = text.encode("utf-16-le", "surrogatepass"), 2166136261
    for i in range(0, len(raw), 2):
        result = ((result ^ (raw[i] | raw[i + 1] << 8)) * 16777619) & 0xffffffff
    return f"fnv1a32-{result:08x}"


def _anchor_schedule(anchor_id, event, narrative, session, events, anchors):
    metadata = _obj(event.get("metadata"))
    dynamic = anchor_id in ("return_blame", "final_check")
    marked = any(key in metadata for key in ("anchorCastVersion", "anchorCastKey", "anchorCastHash"))
    casts = _obj(narrative.get("casts"))
    has_cast = any(isinstance(c, dict) and c.get("anchorId") == anchor_id for c in casts.values())
    if marked or (dynamic and has_cast):
        cast = _obj(casts.get(metadata.get("anchorCastKey")))
        parent = _obj(anchors.get(PARENTS[anchor_id]))
        if (not dynamic or narrative.get("epoch") != session.get("sessionEpoch") or not cast
                or cast.get("version") != "lab-anchor-cast-v1" or metadata.get("anchorCastVersion") != cast.get("version")
                or metadata.get("anchorCastHash") != cast.get("hash") or cast.get("anchorId") != anchor_id
                or cast.get("stageId") != ANCHOR_STAGE[anchor_id] or cast.get("sessionId") != session.get("sessionId")
                or cast.get("epoch") != session.get("sessionEpoch") or cast.get("key") != metadata.get("anchorCastKey")
                or metadata.get("artifactId") != cast.get("artifactId") or not parent
                or parent.get("eventId") != cast.get("parentAnchorEventId")
                or _stable_hash({k: v for k, v in cast.items() if k != "hash"}) != cast.get("hash")):
            return []
        proposal = cast.get("creditProposalId") or ""
        key = f"{anchor_id}:{cast.get('artifactId') or parent['eventId']}" + (":" + proposal if proposal else "")
        if cast.get("key") != key or (metadata.get("creditProposalId") or "") != proposal or _obj(_obj(_obj(cast.get("input")).get("credit")).get("published")).get("proposalId", "") != proposal:
            return []
        candidates = _rows(_obj(cast.get("input")).get("candidates"))
        eligible = [c.get("id") for c in candidates if isinstance(c, dict)]
        plan = _obj(cast.get("plan"))
        ids = _rows(plan.get("responderIds"))
        if (len(set(eligible)) != len(eligible) or any(n not in recap_image.NPCS for n in eligible)
                or set(plan) != {"reason", "responderIds"} or not isinstance(plan.get("reason"), str) or not plan["reason"].strip()
                or not 1 <= len(ids) <= 5 or len(set(ids)) != len(ids) or any(n not in eligible for n in ids)):
            return []
        source = next((e for e in events if e.get("eventId") == cast.get("sourceEventId")), None)
        if (not source or source.get("sessionEpoch") != session.get("sessionEpoch") or source.get("type") != "story_anchor_cast"
                or source.get("status") != "committed" or not source.get("commit")
                or _obj(source.get("metadata")).get("anchorId") != anchor_id
                or _obj(source.get("metadata")).get("castHash") != cast.get("hash")
                or _obj(source.get("metadata")).get("castInputHash") != _stable_hash(cast.get("input"))):
            return []
        schedule = _rows(cast.get("steps"))
        if len(schedule) != len(ids):
            return []
        for i, npc in enumerate(ids):
            moves = (["responsibility_pressure"] if i == 0 else ["responsibility_response"]) if anchor_id == "return_blame" else (["actual_work_check"] if i == 0 else ["credit_check"])
            if len(ids) == 1:
                moves.append("responsibility_response" if anchor_id == "return_blame" else "credit_check")
            if _obj(schedule[i]).get("npcId") != npc or _obj(schedule[i]).get("moves") != moves:
                return []
        return schedule
    if anchor_id in ("advisor_review", "revision_review"):
        return [{"npcId": "mina", "moves": ["work_received"]}, {"npcId": "riley", "moves": ["critical_issue", "revision_request"]}]
    return ([{"npcId": "sam", "moves": ["responsibility_pressure"]}, {"npcId": "nora", "moves": ["responsibility_response"]}]
            if anchor_id == "return_blame" else [{"npcId": "mina", "moves": ["actual_work_check"]}, {"npcId": "nora", "moves": ["credit_check"]}])


def _semantic_step(step, expected, anchor_id, event):
    metadata = _obj(step.get("metadata"))
    deliveries = _rows(step.get("dialogueDeliveries"))
    delivery = next((d for d in deliveries if isinstance(d, dict) and d.get("status") == "delivered" and d.get("channel") == "story_anchor_speech" and d.get("npcId") == expected["npcId"]), None)
    checks = _rows(metadata.get("anchorSemanticChecks"))
    verdict = _obj(checks[-1]) if checks else {}
    text = _obj(delivery).get("text", "")
    moves = _rows(verdict.get("moves"))
    if (not delivery or not isinstance(text, str) or _obj(step.get("audience")).get("visibility") != "group"
            or metadata.get("stageId") != ANCHOR_STAGE[anchor_id] or verdict.get("version") != "lab-anchor-semantics-v2"
            or verdict.get("supported") is not True or verdict.get("violations") != []
            or metadata.get("anchorCastHash") != _obj(event.get("metadata")).get("anchorCastHash")
            or len(moves) != len(expected["moves"]) or {m.get("id") for m in moves if isinstance(m, dict)} != set(expected["moves"])):
        return False
    for move in moves:
        if (set(move) != {"id", "meaningPresent", "quote", "reason"} or move.get("meaningPresent") is not True
                or not isinstance(move.get("quote"), str) or not move["quote"].strip() or move["quote"] not in text
                or not isinstance(move.get("reason"), str) or not move["reason"].strip()):
            return False
    binding = _obj(verdict.get("roleBinding"))
    if set(binding) != {"recipient", "stance", "quote"} or not isinstance(binding.get("quote"), str) or binding["quote"] not in text:
        return False
    if "responsibility_pressure" in expected["moves"]:
        if binding["recipient"] != "player" or binding["stance"] not in ("transfer", "resist_transfer", "repair") or not binding["quote"].strip():
            return False
    elif binding != {"recipient": "not_applicable", "stance": "none", "quote": ""}:
        return False
    evidence = _obj(metadata.get("moveEvidence"))
    if any(not isinstance(evidence.get(move), str) or not evidence[move] or evidence[move] not in text for move in expected["moves"]):
        return False
    return verdict.get("candidateHash") == _stable_hash({"dialogue": text, "evidence": evidence})


def export_projection_input(payload: dict) -> dict:
    """Read canonical ExportV2 sources; never accept a client-supplied recap."""
    session = _obj(payload.get("session"))
    story = _obj(payload.get("story"))
    pacing = _obj(story.get("pacing", payload.get("stagePacing")))
    narrative = _obj(story.get("narrativeStory", payload.get("narrativeStory")))
    events = [e for e in _rows(payload.get("eventLedger")) if isinstance(e, dict)
              and e.get("sessionId") == session.get("sessionId")]
    # Duplicate source identities cannot become a public fact.
    seen, duplicate = set(), set()
    for event in events:
        identity = event.get("eventId")
        if identity in seen:
            duplicate.add(identity)
        seen.add(identity)
    events = [e for e in events if e.get("eventId") not in duplicate and isinstance(e.get("eventId"), str) and e["eventId"]]
    artifacts = _rows(_obj(payload.get("workspace")).get("submittedArtifacts", payload.get("submittedArtifacts")))
    completed_anchors = _obj(narrative.get("completed")) if narrative.get("epoch") == session.get("sessionEpoch") else {}
    anchors = {}
    # labAnchorRecord checks actual delivered/read source events before project().
    # Fail closed if a legacy/incomplete export omits these receipts.
    for anchor_id, parent in PARENTS.items():
        record = _obj(completed_anchors.get(anchor_id))
        event = next((e for e in events if e.get("eventId") == record.get("eventId")
                      and e.get("sessionEpoch") == session.get("sessionEpoch")
                      and e.get("status") == "committed" and e.get("type") == "story_anchor"
                      and _obj(e.get("metadata")).get("anchorId") == anchor_id), None)
        steps = [next((e for e in events if e.get("eventId") == identity), None)
                 for identity in _rows(record.get("stepEventIds"))]
        deliveries = _rows(_obj(event).get("dialogueDeliveries"))
        schedule = _anchor_schedule(anchor_id, event, narrative, session, events, anchors) if event else []
        valid = (event and (not parent or parent in anchors) and steps and len(steps) == len(deliveries)
                 and len(steps) == len(schedule) and all(isinstance(d, dict) and d.get("status") == "delivered" for d in deliveries))
        for i, step in enumerate(steps):
            metadata = _obj(_obj(step).get("metadata"))
            valid = valid and step and step.get("status") == "committed" and step.get("type") == "story_anchor_step" and step.get("sessionEpoch") == session.get("sessionEpoch") and metadata.get("anchorId") == anchor_id and metadata.get("stepIndex") == i and bool(metadata.get("readCompletedAt"))
            if valid:
                valid = _semantic_step(step, schedule[i], anchor_id, event)
        task = {"advisor_review": "brief_review", "revision_review": "revision_plan", "final_check": "contribution_statement"}.get(anchor_id)
        if task:
            artifact = next((a for a in artifacts if isinstance(a, dict) and a.get("id") == record.get("artifactId") and a.get("sourceTaskId") == task), None)
            valid = valid and artifact and any(e.get("eventId") == artifact.get("sourceEventId") and e.get("status") == "committed" and e.get("sessionEpoch") == session.get("sessionEpoch") for e in events)
        if valid:
            anchors[anchor_id] = record
    outcome = _obj(_obj(payload.get("outcome")).get("finalOutcome"))
    delivery = outcome.get("delivery") or _obj(story.get("narrativeClock", payload.get("narrativeClock"))).get("delivery")
    return {"epoch": session.get("sessionEpoch"), "events": events,
            "completed": _rows(pacing.get("completed")), "artifacts": artifacts, "anchors": anchors,
            "delivery": delivery, "outcome": outcome, "sessionId": session.get("sessionId", "")}


def project(data: dict) -> dict:
    """Python parity for src/lab-recap-core.js project; input is source-bound."""
    valid = [e for e in _rows(data.get("events")) if isinstance(e, dict) and e.get("sessionEpoch") == data.get("epoch")
             and e.get("status") == "committed" and _obj(e.get("audience")).get("visibility") == "group"]
    rows = []
    for i, stage_id in enumerate(STAGES):
        completion = next((c for c in _rows(data.get("completed")) if isinstance(c, dict) and c.get("stageId") == stage_id), None)
        core = next((e for e in valid if completion and e.get("eventId") == completion.get("eventId") and e.get("type") == "key_decision" and _obj(e.get("metadata")).get("stageId") == stage_id), None)
        candidates = [a for a in _rows(data.get("artifacts")) if isinstance(a, dict) and a.get("sourceTaskId") == TASKS[i]]
        artifact = candidates[-1] if candidates else None
        artifact_event = next((e for e in valid if artifact and e.get("type") == "artifact_submission" and _obj(e.get("metadata")).get("artifactId") == artifact.get("id") and any(isinstance(d, dict) and d.get("channel") == "artifact_evaluation" and d.get("status") == "delivered" for d in _rows(e.get("dialogueDeliveries")))), None)
        anchor = _obj(data.get("anchors")).get(ANCHORS[i])
        anchor_event = next((e for e in valid if anchor and e.get("eventId") == anchor.get("eventId") and e.get("type") == "story_anchor"), None)
        rows.append({"stageId": stage_id, "completed": bool(core), "optionId": _obj(_obj(core).get("metadata")).get("selectedOptionId") or "",
                     "taskStatus": artifact["status"] if artifact_event and artifact.get("status") in ("accepted", "needs_revision", "rejected") else "not_submitted",
                     "anchorPresented": bool(anchor_event), "sourceEventIds": [e["eventId"] for e in (core, artifact_event, anchor_event) if e]})
    people = []
    for npc in recap_image.NPCS:
        sources = [e for e in valid if e.get("type") != "story_anchor" and any(isinstance(d, dict) and d.get("npcId") == npc and d.get("status") == "delivered" for d in _rows(e.get("dialogueDeliveries")))]
        turns = sum(sum(isinstance(d, dict) and d.get("npcId") == npc and d.get("status") == "delivered" for d in _rows(e.get("dialogueDeliveries"))) for e in sources)
        if turns:
            people.append({"npcId": npc, "turns": min(turns, 9999), "sourceEventIds": [e["eventId"] for e in sources[-8:]]})
    actions = []
    for row in rows:
        core = next((e for e in valid if e.get("type") == "key_decision" and row["sourceEventIds"] and e.get("eventId") == row["sourceEventIds"][0]), None)
        code = _obj(_obj(_obj(core).get("metadata")).get("actionClassification")).get("actionCode")
        actions.append(code if code in recap_image.ACTIONS else "other_social_action")
    finished = all(r["completed"] for r in rows) and all(r["anchorPresented"] for r in rows[1:])
    outcome, delivery = _obj(data.get("outcome")), _obj(data.get("delivery"))
    return {"version": "lab-recap-v2-cover", "sessionId": data.get("sessionId", ""), "stages": rows, "publicEncounters": people, "actions": actions,
            "ending": outcome["endType"] if finished and outcome.get("endType") in ("success", "partial_outcome", "unhealthy_failure") else "incomplete",
            "delivery": {"day": delivery.get("submittedAtDay"), "onTime": bool(delivery.get("submittedOnTime"))} if finished and delivery.get("submitted") else None}


def _alias(secret: str, pair: str, label: str, purpose: str, value: str) -> str:
    return hmac.new(secret.encode(), encoded(["paired-keepsakes-v1", pair, label, purpose, value]), hashlib.sha256).hexdigest()


def public_game(payload: dict, pair: str, label: str, secret: str, source_hash: str) -> dict:
    data = export_projection_input(payload)
    facts = project(data)
    delivery = facts.get("delivery")
    if delivery and (type(delivery.get("day")) is not int or not 1 <= delivery["day"] <= 9999
                     or delivery.get("onTime") != (delivery["day"] <= 7)):
        facts["delivery"] = None
    free = []
    for i, row in enumerate(facts["stages"]):
        # Arbitrary option strings cannot leak into the presentation or image.
        if row["optionId"] not in CHOICES[i] and row["optionId"] != "":
            row["optionId"] = ""
            continue
        if row["optionId"] != "" or not row["completed"]:
            continue
        event = next((e for e in data["events"] if e.get("eventId") == row["sourceEventIds"][0] and e.get("sessionEpoch") == data["epoch"] and e.get("type") == "key_decision" and e.get("status") == "committed" and _obj(e.get("audience")).get("visibility") == "group" and _obj(e.get("metadata")).get("stageId") == row["stageId"]), None)
        action = _obj(_obj(_obj(event).get("metadata")).get("actionClassification"))
        confidence = action.get("confidence")
        if action.get("actionCode") in recap_image.ACTIONS and type(confidence) in (int, float) and math.isfinite(confidence) and 0 <= confidence <= 1:
            free.append({"stageId": row["stageId"], "sourceId": row["sourceEventIds"][0], "actionCode": action["actionCode"], "confidence": confidence})
    facts["sessionId"] = "recap-" + _alias(secret, pair, label, "session", source_hash)[:48]
    def source(value):
        return "source-" + _alias(secret, pair, label, "event", value)[:48]
    for row in [*facts["stages"], *facts["publicEncounters"]]:
        row["sourceEventIds"] = [source(value) for value in row["sourceEventIds"]]
    for action in free:
        action["sourceId"] = source(action["sourceId"])
    return {"recap": facts, "freeActions": free, "sourceHash": source_hash}


def image_result(store, row: dict, label: str) -> dict | None:
    record = row.get("keepsakeImages", {}).get(label)
    if not record:
        return None
    if record.get("sourceHash") != row["games"][label]["terminal"]["sha256"]:
        raise ResearchError(409, "keepsake_source_changed", "The image source does not match the saved game.")
    result = {"gameLabel": label, "sourceHash": record["sourceHash"], "jobId": record["jobId"], "status": record["status"]}
    if result["status"] == "pending" and time.time() > record.get("pendingUntil", 0):
        result.update(status="unknown", errorCode="image_generation_status_unknown")
    if result["status"] == "failed":
        result["errorCode"] = "image_generation_unavailable"
    if result["status"] == "ready":
        reference = record["image"]
        png = store._get_blob(reference["objectKey"])
        if hashlib.sha256(png).hexdigest() != reference["sha256"] or not png.startswith(b"\x89PNG\r\n\x1a\n"):
            raise ResearchError(503, "stored_image_integrity", "The saved image failed its integrity check.")
        result.update(imageDataUrl="data:image/png;base64," + base64.b64encode(png).decode(), **record.get("metadata", {}))
    return result


def keepsakes(store, owner: str, secret: str) -> dict:
    row = store.completed_pair(owner)
    games = {}
    for label in ("A", "B"):
        payload = store.terminal_payload(row, label)
        game = public_game(payload, row["pairId"], label, secret, row["games"][label]["terminal"]["sha256"])
        game["image"] = image_result(store, row, label)
        games[label] = game
    return {"ok": True, "pairId": row["pairId"], "ready": True, "games": games}
