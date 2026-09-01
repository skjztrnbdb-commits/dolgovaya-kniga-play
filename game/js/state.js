/* ============ состояние сессии ============
   Общее для всех модулей: текущий заход (S), сложность (P), товары/рынки текущего
   набора, мелкие чистые хелперы (money/plural/mesto/rnd/pick/...) и localStorage. */
let S,P,GOODS,MKTS,NB,ROAD,bias,seen,cid,AC,sndOn=true;
let unlocked={easy:1},achDone={},achOn={};
// пройденные уроки обучения: {id:1}. Лежит в том же ключе localStorage, что и
// остальной прогресс (поле t), и на заход не влияет — только на пометки в каталоге
let tutDone={};
// снимок незавершённого захода для восстановления после перезагрузки страницы —
// см. saveSession/clearSession/resumeSession
let savedSession=null;
let wall0=0,actMs=0,actFrom=null,lastAct=0,chartGood=null;

const UPSTEP=120;
// Деньги, числительные и сроки собирает ЯЗЫК, а не движок: у русского три формы
// числительного, у английского две, разделители разрядов тоже свои. Обёртки
// оставлены глобальными, чтобы двести мест вызова не переписывать (см. lang.js).
const money=v=>L.money(v);
const plural=(n,one,few,many)=>L.plur(n,one,few,many);
const mesto=n=>L.slots(n);
const fixed=(v,n)=>L.dec(v,n);
// Копилка итогов захода. Нужна ровно потому, что деньги в игре не лежат на месте:
// проценты, фрахт, штрафы и прибыль по сделкам видно только в момент, когда они
// происходят, а к финалу от них остаётся одно число в кассе. Разбирать журнал обратно
// нельзя — он текстовый и сломается от первой же правки формулировки, поэтому копим
// по ходу. Всё аддитивно: на геймплей не влияет, только на итоговый экран.
const stat=(k,v)=>{if(S&&S.stats)S.stats[k]=(S.stats[k]||0)+v};
// «Рекорд» — лучшее/худшее событие захода: сравниваем по полю v, храним и подпись
const statTop=(k,rec,bigger)=>{
  if(!S||!S.stats)return;
  const cur=S.stats[k];
  if(!cur||(bigger?rec.v>cur.v:rec.v<cur.v))S.stats[k]=rec;
};
const freshStats=()=>({int:0,freight:0,idle:0,fine:0,pen:0,lost:0,insBack:0,serv:0,
  bribe:0,bribes:0,bought:0,sold:0,profit:0,cpay:0,borrowed:0,repaid:0,upg:0,rot:0,
  buys:0,sells:0,best:null,worst:null,bigc:null,bigd:null});
// Срок словами от сегодняшнего дня: «завтра», «через 4 дня». Абсолютный номер дня
// («до дня 27») заставлял считать в уме, сколько это от текущего дня — на карточках
// контрактов от него уже отказались, теперь так же говорят и сообщения.
const inDays=d=>L.inDays(d);
// То же для того, что уже идёт и вот-вот кончится (страховка): «ещё 3 дня».
const daysLeft=d=>L.daysLeft(d);
// кнопки быстрого количества (+1/+5/+10) прибавляют к уже введённому, не больше maxQ
const addQty=(cur,inc,maxQ)=>Math.max(cur,Math.min(cur+inc,maxQ));
const rnd=(a,b)=>a+Math.random()*(b-a);
const irnd=(a,b)=>Math.round(rnd(a,b));
const pick=a=>a[Math.floor(Math.random()*a.length)];
const shuf=a=>a.slice().sort(()=>Math.random()-.5);
const el=id=>document.getElementById(id);
const good=id=>GOODS.find(g=>g.id===id);
const mk=n=>MKTS.find(m=>m.n===n);

function bf(key){
  let v=0;
  ACHS.forEach(a=>{if(achDone[a.id]&&achOn[a.id]!==0&&a.f[key])v+=a.f[key]});
  return v;
}
function rateFor(d){
  const t=P.days/3;
  return Math.max(.005,(d<=t?P.rates[0]:d<=t*2?P.rates[1]:P.rates[2])-bf('rate')-S.relief);
}

/* ============ хранилище ============
   localStorage, а не window.storage: последний — API песочницы артефактов claude.ai,
   за её пределами (локально, на itch.io) он не существует, и сохранения тихо никогда
   бы не работали. localStorage — обычный браузерный API, доступен везде. */
async function loadStore(){
  // ВЫБРАННЫЙ язык держим отдельной переменной, а не в LANG: у LANG есть стартовое
  // значение, и по нему нельзя отличить «игрок выбрал русский» от «ещё ничего
  // не выбирал». Раньше на этом и спотыкались — английский по умолчанию не включался
  // никогда, потому что LANG уже был непустым
  let chosen=null;
  try{
    const raw=localStorage.getItem('dk8');
    if(raw){const j=JSON.parse(raw);unlocked=j.u||{easy:1};achDone=j.a||{};achOn=j.o||{};savedSession=j.s||null;tutDone=j.t||{};
      if(j.lng)chosen=j.lng}
  }catch(e){}
  if(!unlocked||!unlocked.easy)unlocked=Object.assign({easy:1},unlocked||{});
  setLang(LANGS[chosen]?chosen:detectLang(),true);
}
async function saveStore(){
  try{localStorage.setItem('dk8',JSON.stringify({u:unlocked,a:achDone,o:achOn,s:savedSession,t:tutDone,lng:LANG}))}catch(e){}
}
// Сохраняем текущий заход целиком, чтобы обновление игры (или случайный F5) не стирало
// прогресс — раньше S жил только в памяти вкладки и пропадал при любой перезагрузке.
// Вызывается из draw() на каждую перерисовку — дёшево, состояние небольшое.
function saveSession(){
  // Обучение не сохраняется НИКОГДА и, главное, не стирает сохранение настоящего
  // захода: игрок мог прерваться на 18-м дне Ростовщика и зайти посмотреть урок.
  // Выходим до clearSession() — именно в этом порядке, иначе урок сносил бы заход.
  if(inTut())return;
  if(!S||S.over){clearSession();return}
  savedSession={S:S,goods:GOODS.map(g=>g.id),bias:bias,seen:seen,cid:cid,
    chartGood:chartGood};
  saveStore();
}
function clearSession(){
  if(!savedSession)return;
  savedSession=null;saveStore();
}
// force — единственное исключение из правила «в обучении достижений нет»: само
// пройденное обучение (a26). Всё остальное, что игрок делает внутри урока, —
// не заход, и открывать за это ачивки нельзя.
function grant(id,force){
  if(inTut()&&!force)return;
  if(achDone[id])return; // уже открыто раньше — бафф и так активен, тост не повторяем
  achDone[id]=1;if(achOn[id]===undefined)achOn[id]=1;
  const a=ACHS.find(x=>x.id===id);
  toast(L.misc.achTitle,achTxt(a,'n')+' — '+achTxt(a,'b'),'gold');snd('ach');
  note(L.misc.achLine(achTxt(a,'n'),achTxt(a,'b')),'pos',true); // в телеметрии уже есть toast и achievement
  tel('achievement',id+' '+a.n);
  saveStore();
}
