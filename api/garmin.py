"""Owner-only experimental Garmin adapter. Never logs provider responses or credentials."""
import base64, hashlib, hmac, json, os, tempfile, time, urllib.request, uuid, re
from contextvars import ContextVar
user_context=ContextVar("athlete",default=None)
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse
from datetime import date, timedelta

def redis_config():
    for url_key,token_key in [('UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN'),('KV_REST_API_URL','KV_REST_API_TOKEN')]:
        url,token=os.environ.get(url_key),os.environ.get(token_key)
        if url and token: return url,token
    raise RuntimeError('Persistent sync storage is not configured')
def redis(*command):
    url,token=redis_config()
    req=urllib.request.Request(url,data=json.dumps(command).encode(),headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
    with urllib.request.urlopen(req,timeout=15) as r: data=json.load(r)
    if 'error' in data: raise RuntimeError('Storage unavailable')
    return data.get('result')
def key(n):
    subject=user_context.get()
    if not re.fullmatch(r'strava:[1-9][0-9]*',subject or ''): raise ValueError('Authenticated athlete required')
    return 'runninggem:users:'+subject+':'+n
def crypt_key(): return bytes.fromhex(os.environ['SESSION_SECRET'])
def encrypt(value):
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    iv=os.urandom(12)
    return base64.b64encode(iv+AESGCM(crypt_key()).encrypt(iv,json.dumps(value).encode(),None)).decode()
def decrypt(value):
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    raw=base64.b64decode(value)
    return json.loads(AESGCM(crypt_key()).decrypt(raw[:12],raw[12:],None))
def authorized(cookie):
    try:
        values=dict(p.strip().split('=',1) for p in cookie.split(';') if '=' in p)
        body,mac=values['rg_session'].split('.')
        expected=base64.urlsafe_b64encode(hmac.new(crypt_key(),body.encode(),hashlib.sha256).digest()).decode().rstrip('=')
        data=json.loads(base64.urlsafe_b64decode(body+'='*((-len(body))%4)))
        return data['sub'] if hmac.compare_digest(expected,mac) and data.get('v')==2 and re.fullmatch(r'strava:[1-9][0-9]*',data.get('sub','')) and data['exp']>time.time() else None
    except Exception: return False

def validate(w):
    if not isinstance(w,dict) or not isinstance(w.get('title'),str) or not 0<len(w['title'].strip())<=100: raise ValueError('Invalid title')
    date.fromisoformat(w['date'])
    if not isinstance(w.get('steps'),list) or not 1<=len(w['steps'])<=50: raise ValueError('Invalid steps')
    for s in w['steps']:
        if s.get('kind') not in ['warmup','interval','recovery','cooldown'] or type(s.get('seconds')) not in [int,float] or not 10<=s['seconds']<=14400: raise ValueError('Invalid duration')
        target=s.get('target')
        if target not in ['open','pace','hr']: raise ValueError('Invalid target')
        if target!='open':
            low,high=s.get('low'),s.get('high');bounds=(120,1200) if target=='pace' else (40,240)
            if type(low) not in [int,float] or type(high) not in [int,float] or not bounds[0]<=low<=high<=bounds[1]: raise ValueError('Invalid target range')
    return w

def workout_payload(w):
    w=validate(w);steps=[]
    for i,s in enumerate(w['steps']):
        # Garmin uses meters/second for pace ranges, seconds for time durations.
        target=s['target']; kind=s['kind']
        step={'type':'ExecutableStepDTO','stepOrder':i+1,'stepType':{'stepTypeId':{'warmup':1,'cooldown':2,'interval':3,'recovery':4}[kind],'stepTypeKey':kind},'endCondition':{'conditionTypeId':2,'conditionTypeKey':'time'},'endConditionValue':s['seconds'],'targetType':{'workoutTargetTypeId':{'open':1,'pace':6,'hr':4}[target],'workoutTargetTypeKey':{'open':'no.target','pace':'pace.zone','hr':'heart.rate.zone'}[target]}}
        if target!='open': step.update(targetValueOne=1000/s['high'] if target=='pace' else s['low'],targetValueTwo=1000/s['low'] if target=='pace' else s['high'])
        steps.append(step)
    sport={'sportTypeId':1,'sportTypeKey':'running'}
    return {'workoutName':w['title'].strip(),'sportType':sport,'workoutSegments':[{'segmentOrder':1,'sportType':sport,'workoutSteps':steps}]}

def normalize(a):
    from datetime import datetime, timezone
    raw=a.get('startTimeGMT','').replace(' ','T').removesuffix('Z')
    start=datetime.fromisoformat(raw).replace(tzinfo=timezone.utc).isoformat().replace('+00:00','Z')
    sport=a.get('activityType',{}).get('typeKey','other').lower()
    return {'id':'garmin:'+str(a['activityId']),'source':'garmin','sourceId':str(a['activityId']),'start':start,'name':str(a.get('activityName','Activity'))[:200],'meters':float(a.get('distance') or 0),'seconds':float(a.get('duration') or 0),'sport':'run' if 'run' in sport else 'ride' if 'cycl' in sport else sport,'externalId':None}

class handler(BaseHTTPRequestHandler):
    def log_message(self,*args): pass
    def respond(self,status,data):
        self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(json.dumps(data).encode())
    def do_POST(self):
        actor=authorized(self.headers.get('Cookie',''))
        if not actor: return self.respond(401,{'error':'Sign in with Strava first'})
        if os.environ.get('ENABLE_EXPERIMENTAL_GARMIN')!='true': return self.respond(503,{'error':'The unofficial Garmin adapter is disabled. Official OAuth authorization does not enable unofficial API calls.'})
        if self.headers.get('Origin')!=os.environ.get('APP_URL','').rstrip('/'): return self.respond(403,{'error':'Request origin rejected'})
        context_token=user_context.set(actor)
        lock=None;lock_id=uuid.uuid4().hex
        try:
            length=int(self.headers.get('Content-Length','0'))
            if not 0<length<=32000: return self.respond(400,{'error':'Invalid request size'})
            b=json.loads(self.rfile.read(length));action=b.get('action')
            if action not in ['connect','mfa','import','export']: return self.respond(400,{'error':'Unknown Garmin operation'})
            lock=key('garmin-lock')
            if not redis('SET',lock,lock_id,'NX','EX',240): return self.respond(409,{'error':'Another Garmin request is running'})
            from garminconnect import Garmin
            with tempfile.TemporaryDirectory(prefix='runninggem-') as folder:
                token_file=os.path.join(folder,'garmin_tokens.json')
                if action=='connect':
                    client=Garmin(b.get('email',''),b.get('password',''),return_on_mfa=True)
                    result=client.login(folder)
                    if isinstance(result,tuple) and result[0]=='needs_mfa':
                        redis('SET',key('garmin-mfa'),encrypt(result[1]),'EX',300)
                        return self.respond(200,{'needsMfa':True})
                    client.client.dump(folder)
                    client.login(folder)
                elif action=='mfa':
                    pending=redis('GETDEL',key('garmin-mfa'))
                    if not pending: return self.respond(400,{'error':'MFA session expired. Connect again.'})
                    client=Garmin();client.resume_login(decrypt(pending),str(b.get('code','')))
                    client.client.dump(folder)
                    client.login(folder)
                else:
                    saved=redis('GET',key('garmin'))
                    if not saved: return self.respond(409,{'error':'Connect Garmin first'})
                    with open(token_file,'w') as f: json.dump(decrypt(saved),f)
                    os.chmod(token_file,0o600)
                    client=Garmin();client.login(folder)
                client.client.dump(folder)
                if os.path.exists(token_file):
                    with open(token_file) as f: redis('SET',key('garmin'),encrypt(json.load(f)))
                else: raise RuntimeError('Garmin token persistence unavailable')
                if action in ['connect','mfa']: return self.respond(200,{'connected':True})
                if action=='import':
                    start=int(b.get('start',0))
                    if start<0 or start>100000: raise ValueError('Invalid history offset')
                    activities=client.get_activities(start,100)
                    for a in activities:
                        n=normalize(a);redis('HSET',key('activities'),n['id'],encrypt(n))
                    warning=None
                    if start==0:
                        health=[]
                        try:
                            for offset in range(7):
                                day=(date.today()-timedelta(days=offset)).isoformat();stats=client.get_stats(day)
                                health.append({'date':day,'steps':stats.get('totalSteps'),'restingHeartRate':stats.get('restingHeartRate'),'sleepSeconds':stats.get('sleepingSeconds'),'bodyBatteryHigh':stats.get('bodyBatteryHighestValue'),'bodyBatteryLow':stats.get('bodyBatteryLowestValue')})
                            redis('SET',key('health'),encrypt(health))
                        except Exception: warning='Activities imported; health metrics are temporarily unavailable.'
                    redis('SET',key('garmin-last'),time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()))
                    return self.respond(200,{'imported':len(activities),'nextStart':start+100 if len(activities)==100 else None,'warning':warning})
                if action=='export':
                    w=validate(b.get('workout'));payload=workout_payload(w)
                    digest=hashlib.sha256(json.dumps(w,sort_keys=True).encode()).hexdigest();delivery_key=key('delivery:'+digest)
                    record=redis('GET',delivery_key)
                    record=json.loads(record) if record else {}
                    if record.get('scheduled'): return self.respond(200,{**record,'alreadySent':True})
                    if record.get('uncertain') or record.get('schedulePending'): return self.respond(409,{'error':'Previous upload outcome is uncertain. Check Garmin before creating another workout.'})
                    wid=record.get('workoutId')
                    if not wid:
                        redis('SET',delivery_key,json.dumps({'uncertain':True}))
                        uploaded=client.upload_workout(payload)
                        wid=uploaded.get('workoutId') if isinstance(uploaded,dict) else None
                        if not wid: raise RuntimeError('No workout receipt')
                        record={'workoutId':wid,'scheduled':False};redis('SET',delivery_key,json.dumps(record))
                    record['schedulePending']=True;redis('SET',delivery_key,json.dumps(record))
                    client.schedule_workout(wid,w['date'])
                    record={'workoutId':wid,'scheduled':True,'date':w['date'],'status':'Scheduled in Garmin Connect. Sync your compatible watch to receive it.'}
                    redis('SET',delivery_key,json.dumps(record))
                    return self.respond(200,record)
        except ValueError: self.respond(400,{'error':'Invalid workout or request. Check dates, durations and target ranges.'})
        except Exception: self.respond(502,{'error':'Garmin request failed. Reconnect if needed; an upload may already exist in Garmin Connect.'})
        finally:
            if lock:
                try: redis('EVAL',"if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",1,lock,lock_id)
                except Exception: pass
            user_context.reset(context_token)
