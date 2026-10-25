"""Opt-in questionnaire draft. Private raw answers, no scoring or model input.

The production default is disabled. Game terminals and assignment orders remain
immutable; questionnaire records are an independent owner-bound appendix.
"""
from __future__ import annotations

import copy
import hashlib
import json
import math
import os
from pathlib import Path
import re

from research_store import ResearchError, encoded, utc_now

VERSION = 'full-package-v0.4-no-followup-20261019'
POLICY = 'full-v04'
STAGES = ('pre', 'game_a', 'post_a', 'game_b', 'comparison')
CATALOG_PATH = Path(__file__).parent / 'config/questionnaire-v04.json'
MAX_BODY = 256_000


def enabled():
    return os.environ.get('RESEARCH_AB_ENABLED') == '1' and os.environ.get('RESEARCH_QUESTIONNAIRE_ENABLED') == '1'


def metadata():
    return {'enabled': True, 'version': VERSION, 'policy': POLICY, 'scores': False,
            'followup': False, 'itemCount': len(catalog()['items'])}


def catalog():
    try:
        value = json.loads(CATALOG_PATH.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        raise ResearchError(503, 'questionnaire_catalog_unavailable', 'The questionnaire draft is unavailable.') from None
    if value.get('schemaVersion') != 'socialevonpc-questionnaire-catalog-v1' or value.get('version') != VERSION or not isinstance(value.get('forms'), dict) or not isinstance(value.get('items'), list):
        raise ResearchError(503, 'questionnaire_catalog_unavailable', 'The questionnaire catalog version is invalid.')
    return value


def new_policy(store, participant, legacy=False):
    catalog()  # A new enrollment must not bind to an unavailable draft catalog.
    orders = store.questionnaire_orders()
    if participant not in orders:
        raise ResearchError(503, 'participant_capacity_pending', 'This participant code is not ready yet. Try again after the study update finishes.')
    order = orders[participant]
    return {'enabled': True, 'version': VERSION, 'policy': POLICY, 'order': order, 'createdAt': utc_now(),
            'catalogSha256': hashlib.sha256(CATALOG_PATH.read_bytes()).hexdigest(),
            'legacy': legacy, 'summaryAcknowledgements': {}, 'stages': {stage: {'status': 'pending', 'history': []} for stage in STAGES}}


def ensure(store, owner):
    for _ in range(24):
        row = store.current(owner)
        q = row.get('questionnaire')
        if q:
            if q.get('version') != VERSION or q.get('policy') != POLICY:
                raise ResearchError(409, 'questionnaire_version_conflict', 'This enrollment uses a different questionnaire version.')
            return row
        value = copy.deepcopy(row)
        q = new_policy(store, row['participantId'], legacy=True)
        q['stages']['pre']['status'] = 'missing_legacy'
        # An old game B cannot provide a fresh after-A measure.
        if row.get('currentGame') == 'B' or row.get('status') == 'completed':
            for stage in ('game_a', 'post_a'):
                q['stages'][stage]['status'] = 'missing_legacy'
        if row.get('status') == 'completed':
            q['stages']['game_b']['status'] = 'missing_legacy'
            q['summaryAcknowledgements']['B'] = {'derived': True, 'source': 'legacy_pair_completed',
                'sourceCompletedAt': row.get('completedAt'), 'recordedAt': utc_now()}
        for stage in STAGES:
            q['stages'][stage]['timingDeviation'] = ['legacy_enrollment']
            if row.get('status') == 'completed':
                q['stages'][stage]['timingDeviation'].append('posthoc_collection')
        value['questionnaire'] = q
        if store._cas(row['participantId'], row['revision'], value):
            return store.current(owner)
    raise ResearchError(409, 'pair_busy', 'The enrollment changed concurrently; retry the same request.')


def done(entry):
    return entry.get('status') in ('submitted', 'missing_legacy')


def saved(row, label):
    game = row.get('games', {}).get(label, {})
    return bool(game.get('saved') and game.get('completed') and game.get('terminal'))


def position(row):
    q = row['questionnaire']; stages = q['stages']; acks = q['summaryAcknowledgements']
    if not done(stages['pre']): return 'pre', None
    if not saved(row, 'A'): return None, 'game_a'
    if not done(stages['game_a']): return 'game_a', None
    if not done(stages['post_a']):
        if 'A' not in acks: return None, 'summary_a'
        return 'post_a', None
    if not saved(row, 'B'): return None, 'game_b'
    if not done(stages['game_b']): return 'game_b', None
    if not done(stages['comparison']):
        if 'B' not in acks: return None, 'summary_b'
        return 'comparison', None
    return None, 'complete'


def source_binding(row, stage):
    labels = ('A',) if stage in ('game_a', 'post_a') else ('B',) if stage == 'game_b' else ('A', 'B') if stage == 'comparison' else ()
    if any(not saved(row, label) for label in labels):
        raise ResearchError(409, 'questionnaire_game_not_saved', 'The required completed game must be saved first.')
    return {'gameLabel': labels[0] if len(labels) == 1 else None,
            'terminalHashes': {label: row['games'][label]['terminal']['sha256'] for label in labels}}


def form_for(q, stage, data=None):
    data = data or catalog()
    ids = {'pre': ('transfer_' + q['order'][0], 'confidence'), 'post_a': ('transfer_' + q['order'][1], 'confidence'),
           'game_a': ('per_game',), 'game_b': ('per_game',), 'comparison': ('comparison',)}[stage]
    indexed = {item['id']: item for item in data['items']}
    forms = [data['forms'][identity] for identity in ids]
    if any(form.get('collection', 'enabled') != 'enabled' for form in forms):
        raise ResearchError(503, 'questionnaire_form_unavailable', 'The current form is not enabled for collection.')
    item_ids = [identity for form in forms for identity in form['itemIds']]
    if len(set(item_ids)) != len(item_ids):
        raise ResearchError(503, 'questionnaire_catalog_unavailable', 'Question IDs must be unique within each form.')
    allowed_item = {'id', 'displayId', 'type', 'question', 'required', 'allowSkip', 'options'}
    result = {key: copy.deepcopy(forms[0][key]) for key in ('title', 'intro', 'contextPrompt', 'outro') if key in forms[0]}
    result.update(id=stage, itemIds=item_ids, items=[{key: copy.deepcopy(value) for key, value in indexed[identity].items() if key in allowed_item} for identity in item_ids], sections=[])
    for index, form in enumerate(forms):
        sections = copy.deepcopy(form.get('sections') or [{'id': form['id'], 'title': form.get('title', {}), 'itemIds': form['itemIds']}])
        for section in sections:
            clean = {key: copy.deepcopy(value) for key, value in section.items() if key in ('id', 'title', 'groupTitle', 'before', 'after', 'itemIds')}
            clean['id'] = str(index) + '-' + str(clean.get('id', form['id']))
            if index and section is sections[0]:
                clean['groupTitle'] = copy.deepcopy(form.get('title', {}))
                before = copy.deepcopy(form.get('intro', []))
                if form.get('contextPrompt'): before.append(form['contextPrompt'])
                clean['before'] = before + clean.get('before', [])
            if section is sections[-1] and index:
                clean['after'] = clean.get('after', []) + copy.deepcopy(form.get('outro', []))
            result['sections'].append(clean)
    return result


def read_reference(store, reference):
    if not reference: return None
    raw = store._get_blob(reference['objectKey'])
    if hashlib.sha256(raw).hexdigest() != reference['sha256']:
        raise ResearchError(503, 'stored_questionnaire_integrity', 'The saved questionnaire failed its integrity check.')
    return json.loads(raw)


def public_status(store, owner, mark_seen=True):
    row = ensure(store, owner)
    if row['questionnaire'].get('catalogSha256') != hashlib.sha256(CATALOG_PATH.read_bytes()).hexdigest():
        raise ResearchError(409, 'questionnaire_catalog_changed', 'The enrolled questionnaire catalog has changed.')
    if mark_seen:
        for _ in range(24):
            stage, _waiting = position(row)
            if not stage or row['questionnaire']['stages'][stage].get('seenAt'): break
            value = copy.deepcopy(row); value['questionnaire']['stages'][stage]['seenAt'] = utc_now()
            value['questionnaire']['stages'][stage]['sourceBinding'] = source_binding(row, stage)
            if store._cas(row['participantId'], row['revision'], value):
                row = store.current(owner); break
            row = ensure(store, owner)
        else:
            raise ResearchError(409, 'pair_busy', 'The enrollment changed concurrently; retry the same request.')
    stage, waiting = position(row); q = row['questionnaire']; data = catalog()
    statuses = {name: {key: copy.deepcopy(value) for key, value in entry.items() if key in ('status', 'seenAt', 'submittedAt', 'lastSavedAt', 'timingDeviation', 'lastSaveSequence')}
                for name, entry in q['stages'].items()}
    seen = {}
    for name, entry in q['stages'].items():
        if entry.get('seenAt'):
            answer = read_reference(store, entry.get('submitted') or entry.get('draft'))
            seen[name] = {'form': form_for(q, name, data), 'answers': answer.get('answers', {}) if answer else {}, 'status': entry['status']}
    current = seen.get(stage) if stage else None
    return {'ok': True, **metadata(), 'pairId': row['pairId'], 'currentStage': stage, 'currentForm': current['form'] if current else None,
            'currentAnswers': current['answers'] if current else {}, 'currentStatus': current['status'] if current else None,
            'currentSequence': q['stages'][stage].get('lastSaveSequence', -1) if stage else -1,
            'waitingFor': waiting, 'complete': waiting == 'complete', 'stages': statuses, 'seenForms': seen,
            'summaryAcknowledgements': {label: {key: copy.deepcopy(value) for key, value in ack.items() if key in ('acknowledgedAt', 'derived', 'source', 'sourceCompletedAt', 'recordedAt')} for label, ack in q['summaryAcknowledgements'].items()},
            'timingDeviation': bool(q.get('legacy'))}


def validate_payload(payload, form):
    required = {'stage', 'version', 'answers', 'language', 'status', 'saveSequence'}
    if not isinstance(payload, dict) or not required <= set(payload) or set(payload) - (required | {'clientTiming', 'requestId'}):
        raise ResearchError(400, 'invalid_questionnaire_schema', 'A stage, version, answers, language and save status are required.')
    if payload['version'] != VERSION or payload['status'] not in ('draft', 'submitted') or payload['language'] not in ('zh', 'en'):
        raise ResearchError(400, 'invalid_questionnaire_schema', 'The questionnaire version, language or status is invalid.')
    if type(payload['saveSequence']) is not int or not 0 <= payload['saveSequence'] <= 2_147_483_647:
        raise ResearchError(400, 'invalid_questionnaire_sequence', 'A non-negative integer save sequence is required.')
    if 'requestId' in payload and (not isinstance(payload['requestId'], str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,160}', payload['requestId'])):
        raise ResearchError(400, 'invalid_questionnaire_schema', 'The request identifier is invalid.')
    answers = payload['answers']; indexed = {item['id']: item for item in form['items']}
    if not isinstance(answers, dict) or set(answers) - set(indexed) or (payload['status'] == 'submitted' and set(answers) != set(indexed)):
        raise ResearchError(400, 'invalid_questionnaire_answers', 'Final submissions must explicitly answer or skip every displayed item.')
    for key, answer in answers.items():
        item = indexed[key]
        if answer is None:
            if item.get('allowSkip') is not True: raise ResearchError(400, 'invalid_questionnaire_answers', 'This item cannot be skipped.')
            continue
        kind = item['type']; options = {option['value'] for option in item.get('options', [])}
        valid = False
        if kind in ('free_text_optional', 'written_situation_response'):
            valid = isinstance(answer, str) and len(answer) <= 8000 and all(ord(ch) >= 32 or ch in '\n\t\r' for ch in answer)
        elif kind == 'multiple_choice':
            valid = isinstance(answer, list) and all(isinstance(value, str) for value in answer) and len(answer) == len(set(answer)) and all(value in options for value in answer)
        else:
            valid = isinstance(answer, str) and answer in options
        if not valid: raise ResearchError(400, 'invalid_questionnaire_answers', 'An answer does not match its original question type or choices.')
    timing = payload.get('clientTiming', {})
    allowed = {'openedAt', 'startedAt', 'submittedAt', 'endedAt', 'elapsedMs', 'activeMs', 'step', 'page', 'pageCount', 'explicitSkip'}
    if not isinstance(timing, dict) or set(timing) - allowed:
        raise ResearchError(400, 'invalid_questionnaire_timing', 'The client timing metadata is invalid.')
    for key, value in timing.items():
        valid = (type(value) in (int, float) and math.isfinite(value) and 0 <= value <= 1e12) if key in ('elapsedMs', 'activeMs', 'page', 'pageCount') else isinstance(value, bool) if key == 'explicitSkip' else isinstance(value, str) and len(value) <= 100
        if not valid: raise ResearchError(400, 'invalid_questionnaire_timing', 'The client timing metadata is invalid.')


def save(store, owner, payload):
    if not isinstance(payload, dict) or payload.get('stage') not in STAGES:
        raise ResearchError(400, 'invalid_questionnaire_stage', 'Choose an available questionnaire stage.')
    stage = payload['stage']; row = ensure(store, owner); form = form_for(row['questionnaire'], stage)
    validate_payload(payload, form)
    content = {key: payload[key] for key in ('stage', 'version', 'answers', 'language', 'status')}
    fingerprint = hashlib.sha256(encoded(content)).hexdigest(); reference = None
    input_hash = hashlib.sha256(encoded(payload)).hexdigest()
    for _ in range(24):
        row = ensure(store, owner); q = row['questionnaire']; entry = q['stages'][stage]
        current_catalog_hash = hashlib.sha256(CATALOG_PATH.read_bytes()).hexdigest()
        if q.get('catalogSha256') != current_catalog_hash:
            raise ResearchError(409, 'questionnaire_catalog_changed', 'The enrolled questionnaire catalog has changed; no answers were overwritten.')
        sequence, previous = payload['saveSequence'], entry.get('lastSaveSequence', -1)
        if sequence < previous:
            raise ResearchError(409, 'questionnaire_stale_save', 'A newer questionnaire save is already stored.')
        if sequence == previous:
            if entry.get('inputHash') == input_hash:
                reference = entry.get('submitted') or entry.get('draft')
                return {**public_status(store, owner), 'persisted': True, 'idempotent': True, 'recordId': reference['sha256']}
            raise ResearchError(409, 'questionnaire_sequence_conflict', 'One save sequence cannot contain different answers.')
        if entry.get('submitted'):
            raise ResearchError(409, 'questionnaire_already_submitted', 'The submitted questionnaire is immutable.')
        if position(row)[0] != stage:
            raise ResearchError(409, 'questionnaire_stage_not_available', 'This questionnaire stage is not currently available.')
        if not entry.get('seenAt'):
            raise ResearchError(409, 'questionnaire_not_displayed', 'Open the current form before saving answers.')
        if payload.get('requestId') and payload.get('requestId') == entry.get('requestId') and entry.get('inputHash') != input_hash:
            raise ResearchError(409, 'questionnaire_request_conflict', 'A request identifier cannot save different answers.')
        binding = source_binding(row, stage)
        if entry.get('sourceBinding') != binding:
            raise ResearchError(409, 'questionnaire_source_changed', 'The displayed form belongs to another game source.')
        if reference is None:
            document = {'schemaVersion': 'socialevonpc-questionnaire-response-v1', 'version': VERSION, 'policy': POLICY,
                        'pairId': row['pairId'], 'participantId': row['participantId'], 'stage': stage, 'language': payload['language'],
                        'status': payload['status'], 'answers': copy.deepcopy(payload['answers']), 'clientTiming': copy.deepcopy(payload.get('clientTiming', {})),
                        'saveSequence': sequence, 'catalogSha256': current_catalog_hash, 'formSha256': hashlib.sha256(encoded(form)).hexdigest(),
                        'formSnapshot': copy.deepcopy(form),
                        'serverSavedAt': utc_now(), 'seenAt': entry['seenAt'], 'sourceBinding': binding,
                        'timingDeviation': copy.deepcopy(entry.get('timingDeviation', [])), 'requestId': payload.get('requestId')}
            reference = store._reference(row, 'questionnaires', document, stage)
        value = copy.deepcopy(row); target = value['questionnaire']['stages'][stage]
        target.update(status=payload['status'], lastSavedAt=reference['receivedAt'], inputHash=input_hash, contentHash=fingerprint, requestId=payload.get('requestId'), lastSaveSequence=sequence)
        target[payload['status']] = reference
        target['history'] = (target.get('history', []) + [reference])[-32:]
        if payload['status'] == 'submitted': target['submittedAt'] = reference['receivedAt']
        if store._cas(row['participantId'], row['revision'], value):
            return {**public_status(store, owner), 'persisted': True, 'idempotent': False, 'recordId': reference['sha256']}
    raise ResearchError(409, 'pair_busy', 'The questionnaire changed concurrently; retry the same request.')


def acknowledge_summary(store, owner, payload):
    if set(payload) != {'action', 'gameLabel', 'version', 'language'} or payload.get('action') != 'acknowledge_summary' or payload.get('gameLabel') not in ('A', 'B') or payload.get('version') != VERSION or payload.get('language') not in ('zh', 'en'):
        raise ResearchError(400, 'invalid_questionnaire_schema', 'Choose one saved game summary to acknowledge.')
    label = payload['gameLabel']; stage = 'game_a' if label == 'A' else 'game_b'
    for _ in range(24):
        row = ensure(store, owner); q = row['questionnaire']
        if not saved(row, label) or not done(q['stages'][stage]):
            raise ResearchError(409, 'summary_not_available', 'Save the completed game and its per-game questionnaire first.')
        if label in q['summaryAcknowledgements']:
            return {**public_status(store, owner), 'persisted': True, 'idempotent': True}
        value = copy.deepcopy(row); value['questionnaire']['summaryAcknowledgements'][label] = {
            'acknowledgedAt': utc_now(), 'terminalHash': row['games'][label]['terminal']['sha256'], 'language': payload['language']}
        if store._cas(row['participantId'], row['revision'], value):
            return {**public_status(store, owner), 'persisted': True, 'idempotent': False}
    raise ResearchError(409, 'pair_busy', 'The summary acknowledgement changed concurrently; retry the same request.')


def assert_allowed(store, owner, operation):
    if not enabled(): return
    row = ensure(store, owner); q = row['questionnaire']; stages = q['stages']
    required = ('pre',) if operation == 'game' else ('pre', 'game_a', 'post_a') if operation == 'advance' else STAGES if operation in ('complete', 'image') else ()
    if any(not done(stages[stage]) for stage in required):
        raise ResearchError(409, 'questionnaire_required', 'Finish or explicitly skip the current questionnaire before continuing.')
    if operation in ('complete', 'image') and not q['summaryAcknowledgements'].get('B'):
        raise ResearchError(409, 'summary_acknowledgement_required', 'View the second game summary and continue first.')
