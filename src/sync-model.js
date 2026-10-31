export function normalize(source,a){
 const raw=source==='strava'?a.start_date:a.startTimeGMT;
 const start=typeof raw==='string'?raw.replace(' ','T')+(source==='garmin'&&!/(Z|[+-]\d{2}:?\d{2})$/.test(raw)?'Z':''):'';
 const id=String(source==='strava'?a.id:a.activityId);
 const meters=Number(a.distance),seconds=Number(source==='strava'?a.moving_time:a.duration);
 if(!id||id==='undefined'||!Number.isFinite(Date.parse(start))||!Number.isFinite(meters)||meters<0||!Number.isFinite(seconds)||seconds<0)return null;
 const sport=String(a.sport_type||a.type||a.activityType?.typeKey||'other').toLowerCase();
 return {id:`${source}:${id}`,source,sourceId:id,start:new Date(start).toISOString(),name:String(a.name||a.activityName||'Activity').slice(0,200),meters,seconds,sport:sport.includes('run')?'run':sport.includes('cycl')||sport.includes('ride')?'ride':sport,externalId:a.external_id||null};
}
export function mergeActivities(rows){
 const merged=[];
 for(const row of [...rows].filter(Boolean).sort((a,b)=>a.start.localeCompare(b.start))){
  const match=merged.find(a=>a.id===row.id||(a.source!==row.source&&a.sport===row.sport&&Math.abs(Date.parse(a.start)-Date.parse(row.start))<=60000&&Math.abs(a.meters-row.meters)<=Math.max(50,a.meters*.01)&&Math.abs(a.seconds-row.seconds)<=Math.max(30,a.seconds*.03)));
  if(match){if(!match.sources.some(s=>s.id===row.id))match.sources.push({id:row.id,source:row.source});}else merged.push({...row,sources:[{id:row.id,source:row.source}]});
 }return merged.sort((a,b)=>b.start.localeCompare(a.start));
}
export function validateWorkout(w){
 if(!w||typeof w.title!=='string'||!w.title.trim()||w.title.length>100)throw new Error('Give the workout a title (up to 100 characters).');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(w.date)||new Date(w.date+'T12:00:00Z').toISOString().slice(0,10)!==w.date)throw new Error('Choose a valid workout date.');
 if(!Array.isArray(w.steps)||!w.steps.length||w.steps.length>50)throw new Error('Add between 1 and 50 steps.');
 for(const s of w.steps){if(!['warmup','interval','recovery','cooldown'].includes(s.kind)||!Number.isFinite(s.seconds)||s.seconds<10||s.seconds>14400)throw new Error('Each step needs a duration between 10 seconds and 4 hours.');if(s.target==='pace'&&(!Number.isFinite(s.low)||!Number.isFinite(s.high)||s.low<120||s.high>1200||s.low>s.high))throw new Error('Pace targets must be 120–1200 seconds/km, fastest first.');if(s.target==='hr'&&(!Number.isFinite(s.low)||!Number.isFinite(s.high)||s.low<40||s.high>240||s.low>s.high))throw new Error('Heart-rate targets must be 40–240 bpm, lowest first.');if(!['open','pace','hr'].includes(s.target))throw new Error('Unsupported target.');}
 return {title:w.title.trim(),date:w.date,steps:w.steps.map(({kind,seconds,target,low,high})=>({kind,seconds,target,...(target==='open'?{}:{low,high})}))};
}
export function garminWorkout(input){const w=validateWorkout(input);return {workoutName:w.title,sportType:{sportTypeId:1,sportTypeKey:'running'},workoutSegments:[{segmentOrder:1,sportType:{sportTypeId:1,sportTypeKey:'running'},workoutSteps:w.steps.map((s,i)=>({type:'ExecutableStepDTO',stepOrder:i+1,stepType:{stepTypeId:({warmup:1,interval:3,recovery:4,cooldown:2})[s.kind],stepTypeKey:s.kind},endCondition:{conditionTypeId:2,conditionTypeKey:'time'},endConditionValue:s.seconds,targetType:s.target==='pace'?{workoutTargetTypeId:6,workoutTargetTypeKey:'pace.zone'}:s.target==='hr'?{workoutTargetTypeId:4,workoutTargetTypeKey:'heart.rate.zone'}:{workoutTargetTypeId:1,workoutTargetTypeKey:'no.target'},...(s.target==='pace'?{targetValueOne:1000/s.high,targetValueTwo:1000/s.low}:s.target==='hr'?{targetValueOne:s.low,targetValueTwo:s.high}:{})}))}]};}
