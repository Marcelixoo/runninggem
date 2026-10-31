import importlib.util, io, json, os, unittest
from unittest.mock import patch
from pathlib import Path
os.environ['SESSION_SECRET']='ab'*32
spec=importlib.util.spec_from_file_location('garmin_adapter',Path(__file__).parents[1]/'api/garmin.py');g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)
W={'title':'Intervals','date':'2026-11-05','steps':[{'kind':'warmup','seconds':600,'target':'open'},{'kind':'interval','seconds':120,'target':'pace','low':270,'high':300}]}
class FakeClient:
    uploads=0;schedules=0;fail_schedule=False;mfa=False
    def __init__(self,*a,**kw): self.client=self
    def login(self,folder): return ('needs_mfa',{'test':'pending'}) if self.mfa else (None,None)
    def resume_login(self,*a): return (None,None)
    def dump(self,folder): Path(folder,'garmin_tokens.json').write_text(json.dumps({'access_token':'test'}))
    def upload_workout(self,payload): type(self).uploads+=1;return {'workoutId':123}
    def schedule_workout(self,wid,day):
        type(self).schedules+=1
        if self.fail_schedule: raise RuntimeError('timeout')
        return {'workoutId':wid}
    def get_activities(self,*a): return [{'activityId':1,'startTimeGMT':'2026-10-30 08:00:00','distance':5000,'duration':1800,'activityType':{'typeKey':'running'}}]
    def get_stats(self,day): return {'totalSteps':10000,'restingHeartRate':50}
class Tests(unittest.TestCase):
    def setUp(self):
        self.store={};FakeClient.uploads=FakeClient.schedules=0;FakeClient.fail_schedule=False;FakeClient.mfa=False
        self.fake_redis=patch.object(g,'redis',self.redis);self.fake_redis.start();self.auth=patch.object(g,'authorized',lambda _:'strava:123');self.auth.start();self.garmin=patch('garminconnect.Garmin',FakeClient);self.garmin.start();os.environ['APP_URL']='https://pilot.test';os.environ['ENABLE_EXPERIMENTAL_GARMIN']='true';self.scope=g.user_context.set('strava:123')
    def tearDown(self): self.fake_redis.stop();self.auth.stop();self.garmin.stop();g.user_context.reset(self.scope)
    def redis(self,*args):
        cmd,k,*rest=args
        if cmd=='GET': return self.store.get(k)
        if cmd=='GETDEL': return self.store.pop(k,None)
        if cmd=='SET':
            if 'NX' in rest and k in self.store:return None
            self.store[k]=rest[0];return 'OK'
        if cmd=='HSET': self.store[k+':'+str(rest[0])]=rest[1];return 1
        if cmd=='EVAL': self.store.pop(rest[1],None);return 1
    def request(self,data):
        h=object.__new__(g.handler);raw=json.dumps(data).encode();h.headers={'Cookie':'test','Origin':'https://pilot.test','Content-Length':str(len(raw))};h.rfile=io.BytesIO(raw);out=[];h.respond=lambda status,data:out.append((status,data));h.do_POST();return out[0]
    def test_pace_conversion_and_reject_bad_targets(self):
        s=g.workout_payload(W)['workoutSegments'][0]['workoutSteps'][1];self.assertAlmostEqual(s['targetValueOne'],1000/300);self.assertAlmostEqual(s['targetValueTwo'],1000/270)
        bad={**W,'steps':[{'kind':'interval','seconds':120,'target':'hr','low':180,'high':120}]}
        with self.assertRaises(ValueError):g.validate(bad)
    def test_connect_persists_encrypted_tokens_and_mfa_roundtrip(self):
        status,data=self.request({'action':'connect','email':'test','password':'test'});self.assertEqual(status,200);self.assertTrue(data['connected']);self.assertNotIn('access_token',self.store[g.key('garmin')])
        FakeClient.mfa=True;status,data=self.request({'action':'connect'});self.assertTrue(data['needsMfa']);FakeClient.mfa=False
        status,data=self.request({'action':'mfa','code':'123456'});self.assertTrue(data['connected']);self.assertNotIn(g.key('garmin-mfa'),self.store)
    def test_repeat_delivery_does_not_create_duplicate_workouts(self):
        self.request({'action':'connect'});self.assertEqual(self.request({'action':'export','workout':W})[0],200);status,data=self.request({'action':'export','workout':W});self.assertTrue(data['alreadySent']);self.assertEqual(FakeClient.uploads,1);self.assertEqual(FakeClient.schedules,1)
    def test_uncertain_schedule_blocks_blind_retry(self):
        self.request({'action':'connect'});FakeClient.fail_schedule=True;self.assertEqual(self.request({'action':'export','workout':W})[0],502);self.assertEqual(self.request({'action':'export','workout':W})[0],409);self.assertEqual(FakeClient.uploads,1);self.assertEqual(FakeClient.schedules,1)
    def test_import_stores_health_and_normalized_history(self):
        self.request({'action':'connect'});status,data=self.request({'action':'import','start':0});self.assertEqual(status,200);self.assertEqual(data['imported'],1);activity=g.decrypt(self.store[g.key('activities')+':garmin:1']);self.assertEqual(activity['meters'],5000);self.assertEqual(len(g.decrypt(self.store[g.key('health')])),7)
    def test_old_shared_sessions_rejected_and_v2_identity_verified(self):
        self.auth.stop()
        def signed(data):
            body=g.base64.urlsafe_b64encode(json.dumps(data).encode()).decode().rstrip('=')
            mac=g.base64.urlsafe_b64encode(g.hmac.new(g.crypt_key(),body.encode(),g.hashlib.sha256).digest()).decode().rstrip('=')
            return 'rg_session='+body+'.'+mac
        self.assertIsNone(g.authorized(signed({'role':'owner','exp':g.time.time()+60})))
        self.assertEqual(g.authorized(signed({'v':2,'sub':'strava:123','exp':g.time.time()+60})),'strava:123')
        self.assertIsNone(g.authorized(signed({'v':2,'sub':'strava:123','exp':1})))
    def test_experimental_adapter_is_disabled_by_default(self):
        os.environ.pop('ENABLE_EXPERIMENTAL_GARMIN',None)
        status,data=self.request({'action':'connect'})
        self.assertEqual(status,503)
        self.assertEqual(len(self.store),0)
if __name__=='__main__': unittest.main()
