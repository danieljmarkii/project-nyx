import { assembleReport, type ReportInput, type ReportEventInput } from './report.ts'
import { renderReport } from './render.ts'
function plain(html: string): string { return html.replace(/<[^>]+>/g, ' ').replace(/&mdash;/g,'—').replace(/&rsquo;/g,'’').replace(/&ndash;/g,'–').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ') }
const NOW='2026-07-02T12:00:00Z', TZ='America/New_York'
let seq=0; const id=(p:string)=>`${p}-${++seq}`
const at=(d:string,t='14:00:00')=>`${d}T${t}Z`
function meal(o:any):ReportEventInput{return{id:id('meal'),type:'meal',occurredAt:at(o.date,o.time??'13:00:00'),occurredAtConfidence:'witnessed',occurredAtEarliest:null,occurredAtLatest:null,severity:null,notes:null,loggedAt:at(o.date,o.time??'13:00:00'),meal:{foodItemId:o.foodItemId??'f-unknown',intakeRating:o.intakeRating??null,quantity:null,foodType:o.foodType??'meal',format:null,primaryProtein:(o.proteins??[])[0]??null,proteins:o.proteins??null,ingredientsNotes:null,extractionConfidence:null,brand:o.brand,productName:o.product}}}
function symptom(d:string,t='itch'):ReportEventInput{return{id:id(t),type:t,occurredAt:at(d,'19:00:00'),occurredAtConfidence:'witnessed',occurredAtEarliest:null,occurredAtLatest:null,severity:null,notes:null,loggedAt:at(d,'19:00:00'),meal:null}}
function days(a:string,b:string){const o:string[]=[];const e=Date.parse(`${b}T00:00:00Z`);for(let m=Date.parse(`${a}T00:00:00Z`);m<=e;m+=86400000)o.push(new Date(m).toISOString().slice(0,10));return o}
const HP:any={foodItemId:'f-hp',foodLabel:'RC Hydrolyzed HP',role:'primary_diet',allowedFrom:'2026-04-21',allowedUntil:null,primaryProtein:'soy',brand:'Royal Canin',productName:'Hydrolyzed HP',proteins:['soy'],ingredientsNotes:'soy'}

Deno.test('R5 — the B-494 patient, with everything in the cropped days', () => {
  const events: ReportEventInput[] = []
  // CROPPED HEAD (Apr 21 – Jun 1): every prescribed bowl REFUSED, plus a daily
  // off-diet chicken meal, plus 5 vomits.
  for (const d of days('2026-04-21','2026-06-01')) {
    events.push(meal({date:d,brand:'Royal Canin',product:'Hydrolyzed HP',foodItemId:'f-hp',proteins:['soy'],intakeRating:'refused',time:'08:00:00'}))
    events.push(meal({date:d,brand:'Purina',product:'Chicken Feast',foodItemId:'f-chicken',proteins:['chicken'],time:'20:00:00'}))
  }
  for (const d of ['2026-04-22','2026-04-27','2026-05-06','2026-05-13','2026-05-24']) events.push(symptom(d,'vomit'))
  // IN-WINDOW (Jun 2 – Jul 2): eleven clean, eaten meals of the trial diet.
  for (const d of days('2026-06-22','2026-07-02')) {
    events.push(meal({date:d,brand:'Royal Canin',product:'Hydrolyzed HP',foodItemId:'f-hp',proteins:['soy'],intakeRating:'all'}))
  }
  const i: ReportInput = { now:NOW, timezone:TZ,
    pet:{id:'p',name:'Nyx',species:'cat',breed:'DSH',sex:'female',dateOfBirth:'2018-01-01',weightKg:4.1}, ownerName:'Sam',
    events, aiAnalyses:[], weightChecks:[], doses:[], medications:[], medicationItems:[],
    dietTrials:[{id:'t',foodItemId:'f-hp',startedAt:'2026-04-21',targetDurationDays:84,status:'active',completedAt:null,endedAt:null,indication:'gi',vetName:'Dr. Chen',foodLabel:'RC Hydrolyzed HP',primaryProtein:'soy',proteins:['soy'],allowedFoods:[HP]} as any],
    vetVisits:[{visitedAt:'2026-04-21',clinicName:'R',vetName:'C',reason:'start elimination diet'},{visitedAt:'2026-06-02',clinicName:'R',vetName:'C',reason:'six-week recheck'}],
    feedingArrangements:[], conditions:[] }
  ;(i as any).eventsSinceIso = '2026-01-03T12:00:00Z' // the pull reaches past the trial start ⇒ NOT a floor
  const s = assembleReport(i)
  console.log('R5 crop      :', JSON.stringify(s.scope.trialCropSymptoms))
  console.log('R5 safetyFlags:', JSON.stringify(s.safetyFlags.map((f:any)=>f.kind)))
  console.log('R5 trial.exposures:', JSON.stringify((s.trial as any)?.exposures))
  const t = plain(renderReport(s))
  const k = t.indexOf('Record')
  console.log('R5 TRIAL ROW :', t.slice(k, k+900))
  const li = t.indexOf('Range Scoped to')
  console.log('R5 LEGEND    :', t.slice(li, li+500))
})
