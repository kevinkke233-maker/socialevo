"""Optional post-game art. Structured public facts only; not an evaluation.

No automatic retries. One charged attempt per session/worker, at most three
attempts per client/hour, one generation concurrently. Secrets stay server-side.
"""
from __future__ import annotations
import base64
import hashlib
import json
import re
import threading
import time
import uuid
from pathlib import Path
from urllib import request

CHOICES = json.loads((Path(__file__).parent / 'src/lab-recap-choices.json').read_text())
STAGES = [x['stageId'] for x in CHOICES]
ANCHORS = ['Arrival and initial role discussion', 'Advisor criticism of the inherited manuscript and bounded revision request',
           'Return to team: pressure to transfer legacy blame onto the current reviser', 'Check actual work and separate inherited contributions from new credit']
NPCS = ['mina','riley','sam','leo','nora']
ACTIONS = ['evidence_clarification','bounded_collaboration','passive_avoidance','overcommitment','blame_externalization','public_escalation','responsibility_visibility','credit_self_erasure','credit_overclaim','transparent_credit','other_social_action']
COVER = Path(__file__).parent / 'assets/title-screen/lab-entry-cover-v2.png'
lock = threading.Lock()
slots = threading.BoundedSemaphore(1)
attempts: dict[str, dict] = {}
client_attempts: dict[str, list[float]] = {}
jobs: dict[str, dict] = {}

def validate(payload: object) -> str:
    if not isinstance(payload, dict) or set(payload) != {'consent', 'recap'} or payload['consent'] is not True:
        return 'Explicit consent and structured recap are required.'
    r = payload['recap']
    if not isinstance(r, dict) or set(r) != {'version', 'sessionId', 'stages', 'ending', 'delivery', 'publicEncounters', 'actions'} or r['version'] != 'lab-recap-v2-cover':
        return 'Invalid recap schema.'
    if not isinstance(r['sessionId'], str) or not re.fullmatch(r'recap-[a-zA-Z0-9_-]{6,96}', r['sessionId']):
        return 'Use an anonymous recap identifier.'
    if r['ending'] not in ('success', 'partial_outcome', 'unhealthy_failure'):
        return 'AI art is available only after a normal completed ending.'
    rows = r['stages']
    if not isinstance(rows, list) or len(rows) != 4:
        return 'All four ordered stages are required.'
    for i, row in enumerate(rows):
        if not isinstance(row, dict) or set(row) != {'stageId','completed','optionId','taskStatus','anchorPresented','sourceEventIds'}:
            return 'Invalid stage fields; free text and hidden state are not accepted.'
        if row['stageId'] != STAGES[i] or row['completed'] is not True or not isinstance(row['anchorPresented'], bool) or (i > 0 and not row['anchorPresented']):
            return 'Ordered completed mainline and actual anchors are required.'
        if not isinstance(row['optionId'], str) or row['optionId'] not in {'', *[x['id'] for x in CHOICES[i]['choices']]}:
            return 'Only original designed choices or an unquoted free-text choice are allowed.'
        if row['taskStatus'] not in ('accepted','needs_revision','rejected','not_submitted') or (i > 0 and row['taskStatus'] == 'not_submitted'):
            return 'Actual submission status is required.'
        ids = row['sourceEventIds']
        if not isinstance(ids, list) or not 1 <= len(ids) <= 3 or any(not isinstance(s, str) or not re.fullmatch(r'source-[a-zA-Z0-9_-]{6,96}',s) for s in ids):
            return 'Anonymous committed source references are required.'
    if not isinstance(r['actions'],list) or len(r['actions'])!=4 or any(not isinstance(a,str) or a not in ACTIONS for a in r['actions']):
        return 'Only validated public action categories are allowed.'
    people=r['publicEncounters']
    if not isinstance(people,list) or len(people)>5:
        return 'Invalid public encounter summary.'
    seen=set()
    for p in people:
        if not isinstance(p,dict) or set(p)!={'npcId','turns','sourceEventIds'} or not isinstance(p['npcId'],str) or p['npcId'] not in NPCS or p['npcId'] in seen or type(p['turns']) is not int or not 1<=p['turns']<=9999:
            return 'Only actual public speaker counts are allowed; counts are not affinity.'
        seen.add(p['npcId'])
        if not isinstance(p['sourceEventIds'],list) or not 1<=len(p['sourceEventIds'])<=8 or any(not isinstance(x,str) or not re.fullmatch(r'source-[a-zA-Z0-9_-]{6,96}',x) for x in p['sourceEventIds']):
            return 'Anonymous public encounter sources are required.'
    d = r['delivery']
    if not isinstance(d, dict) or set(d) != {'day','onTime'} or type(d['day']) is not int or not 1 <= d['day'] <= 9999 or type(d['onTime']) is not bool:
        return 'Invalid actual delivery.'
    if d['onTime'] != (d['day'] <= 7):
        return 'Delivery day and deadline status disagree.'
    return ''

def prompt_for(r: dict) -> str:
    # No user-origin text, identifiers, dialogue, scores, notes or private memory
    # can enter this prompt. Original choice semantics come from the locked data.
    moments = []
    for i,row in enumerate(r['stages']):
        choice=next((x['label'] for x in CHOICES[i]['choices'] if x['id']==row['optionId']), 'Free-written choice withheld; only its validated public action category is available.')
        moments.append({'incident':ANCHORS[i],'choice':choice,'publicAction':r['actions'][i],'documentStatus':row['taskStatus']})
    people=[{'character':p['npcId'],'deliveredPublicTurns':p['turns']} for p in r['publicEncounters']]
    return ('Use case: style-transfer / illustration-story. Create ONE wide, cinematic anime game ending key illustration, not a comic, grid, collage, title screen or screenshot. '
        'The supplied approved cover is a STYLE AND CHARACTER IDENTITY reference ONLY: preserve its elegant hand-painted anime faces, natural proportions, warm wood, sage and navy palette, soft window light and detailed academic laboratory. '
        'Do NOT copy its arrival pose or assume that its smiling welcome describes this ending. Recompose the scene around the protagonist at their final shared-computer handover with the actual submitted documents. There are only three modest review/plan/contribution documents: prefer three thin folders, not huge stacks implying weeks of unrecorded labor. '
        'The protagonist is a young adult man with short dark hair, navy cardigan and pale shirt. Lin (mina) is an adult woman with chestnut shoulder-length hair, burgundy blouse and white coat. '
        'Zhao (riley) is an older man with grey hair, glasses and dark jacket. Kai (sam) is a young adult man with short blond curls, dark skin and blue shirt. '
        'Jun (leo) is a young adult man with short brown hair and green sweater. Emma (nora) is a young adult woman with muted purple bob and blue jacket. '
        'Personalize the visible composition using the supplied four actual choices, public action categories, submission statuses and delivery: '
        'bounded clarification or transparent credit can be suggested by separate annotated documents and a measured, engaged protagonist; overcommitment by a heavier paper stack; '
        'blame or escalation by separated composition and a tense but non-abusive discussion; credit erasure by the protagonist standing aside, overclaim by a central assertive handover. '
        'These are artistic metaphors for recorded actions, NOT objective emotion or relationship judgments. '
        'Only cast characters with actual delivered public speech in the encounter list; their frequency selects visual prominence, NEVER friendliness, support, consent or closeness. '
        'Keep persona differences: no universally smiling, grateful or hostile team. For partial_outcome, unhealthy_failure or outstanding revisions, depict an unfinished handover with papers still under review, not celebration. '
        'On-time versus late is separate from quality: late can use subdued evening light without implying poor work; on-time does not imply publication or success. '
        'The four incidents occurred in order, but depict one final moment; do not combine them into four panels or fabricate experiments, signed agreements, new achievements, awards or resolved disagreement. '
        'No readable text, labels, numeric grades, UI, speech bubbles, logos or watermark. Do not change gender, age, skin tone, outfits or the lab story. '
        'Recorded facts, with identifiers and raw dialogue withheld: '+json.dumps({'moments':moments,'publicCast':people,'ending':r['ending'],'delivery':r['delivery']},ensure_ascii=False))

def reserve(client: str, r: dict) -> tuple[str, dict | None]:
    now=time.monotonic(); key=hashlib.sha256((client+'|'+r['sessionId']).encode()).hexdigest()
    fingerprint=hashlib.sha256(json.dumps(r,sort_keys=True).encode()).hexdigest()
    with lock:
        for k in list(attempts):
            if now-attempts[k]['at'] > 3600: del attempts[k]
        if key in attempts:
            old=attempts[key]
            return ('changed' if old['hash'] != fingerprint else old['status'],old.get('result') or ({'jobId':old['jobId'],'status':'pending'} if old.get('jobId') else None))
        for k in list(client_attempts):
            client_attempts[k]=[t for t in client_attempts[k] if now-t<3600]
            if not client_attempts[k]:del client_attempts[k]
        if len(client_attempts.get(client,[]))>=3:return ('rate_limited',None)
        if not slots.acquire(blocking=False):return ('busy',None)
        attempts[key]={'at':now,'hash':fingerprint,'status':'pending'}
        client_attempts.setdefault(client,[]).append(now)
        return ('reserved',{'key':key})

def finish(key: str, result: dict | None) -> None:
    with lock:
        if key in attempts: attempts[key].update(status='ready' if result else 'failed',result=result)
    slots.release()

def start_job(key: str, client: str, r: dict, api_key: str, model: str) -> dict:
    job=uuid.uuid4().hex;now=time.monotonic()
    with lock:
        for old in list(jobs):
            if now-jobs[old]['at']>3600:del jobs[old]
        jobs[job]={'key':key,'client':hashlib.sha256(client.encode()).hexdigest(),'at':now}
        attempts[key]['jobId']=job
    def run():
        result=None
        try:result=generate(r,api_key,model)
        except Exception:pass  # No response, credentials or automatic retry.
        finally:finish(key,result)
    threading.Thread(target=run,daemon=True).start()
    return {'jobId':job,'status':'pending'}

def job_result(client: str, job: str) -> dict | None:
    with lock:
        record=jobs.get(job)
        if not record or time.monotonic()-record['at']>3600 or record['client']!=hashlib.sha256(client.encode()).hexdigest():return None
        attempt=attempts.get(record['key'])
        if not attempt:return None
        if attempt['status']=='ready':return {'status':'ready',**attempt['result']}
        if attempt['status']=='failed':return {'status':'failed','errorCode':'image_generation_unavailable'}
        return {'status':'pending','jobId':job}

def generate(r: dict, api_key: str, model: str) -> dict:
    # Immutable server-owned approved art only. No client URL/path, SSRF,
    # participant photo, uploads or user-origin text is accepted here.
    reference=COVER.read_bytes()
    if not reference.startswith(b'\x89PNG\r\n\x1a\n') or len(reference)>10_000_000:
        raise ValueError('Invalid approved reference')
    boundary='socialevo-'+uuid.uuid4().hex
    fields={'model':model,'prompt':prompt_for(r),'size':'1536x1024','quality':'medium','n':'1','output_format':'png'}
    chunks=[]
    for name,value in fields.items():
        chunks.append((f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n').encode())
    chunks.append((f'--{boundary}\r\nContent-Disposition: form-data; name="image[]"; filename="approved-lab-cover.png"\r\nContent-Type: image/png\r\n\r\n').encode()+reference+b'\r\n')
    chunks.append(f'--{boundary}--\r\n'.encode())
    req=request.Request('https://api.openai.com/v1/images/edits',data=b''.join(chunks),headers={'Authorization':f'Bearer {api_key}','Content-Type':f'multipart/form-data; boundary={boundary}'},method='POST')
    with request.urlopen(req,timeout=170) as response: raw=response.read(25_000_001)
    if len(raw)>25_000_000:raise ValueError('Image response too large')
    image=json.loads(raw).get('data',[{}])[0].get('b64_json','')
    decoded=base64.b64decode(image,validate=True)
    if not decoded.startswith(b'\x89PNG\r\n\x1a\n') or len(decoded)>16_000_000:raise ValueError('Invalid PNG')
    return {'imageDataUrl':'data:image/png;base64,'+image,'model':model,'illustrativeOnly':True,'artworkStyle':'lab-entry-cover-v2','recapVersion':'lab-recap-v2-cover'}
