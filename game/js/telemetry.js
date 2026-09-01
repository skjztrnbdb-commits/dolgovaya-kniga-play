/* ============ журнал ============ */
const activeSec=()=>(actMs+(actFrom!=null?performance.now()-actFrom:0))/1000;
const wallSec=()=>(performance.now()-wall0)/1000;
function focusOn(){if(actFrom==null)actFrom=performance.now()}
function focusOff(){if(actFrom!=null){actMs+=performance.now()-actFrom;actFrom=null;if(S)tel('blur','вкладка вне фокуса')}}
document.addEventListener('visibilitychange',()=>{document.hidden?focusOff():(focusOn(),S&&tel('focus','вкладка вернулась'))});
window.addEventListener('blur',focusOff);window.addEventListener('focus',focusOn);
function tel(act,detail){
  if(!S)return;
  const a=activeSec();
  S.tel.push({a:+a.toFixed(1),da:+(a-lastAct).toFixed(1),w:+wallSec().toFixed(1),
    day:S.day,act:act,detail:detail||'',cash:Math.round(S.cash),debt:Math.round(S.debt),
    net:Math.round(net()),held:+held().toFixed(1),mkt:S.mkt});
  lastAct=a;
  telCount();
}
// Счётчик в подвале отдельной функцией: его надо уметь перерисовать не только
// после действия, но и после смены языка (applyLang). Считает только действия
// игрока и события мира: note/toast — это не действия, а то, что игрок прочитал,
// и раздувать ими цифру значит врать про его активность.
function telCount(){
  const c=el('tel-count');
  if(!c||!S)return;
  const acts=S.tel.filter(e=>e.act!=='note'&&e.act!=='toast').length;
  c.textContent=L.ui.counter(acts,Math.round(activeSec()),Math.round(wallSec()));
}
/* ============ косвенные признаки вовлечённости ============
   Кнопок самоотчёта больше нет: их не нажимают, это суровая реальность (решение
   Сергея, 21.08). Но узнавать «скучно / застрял / затянуло» всё равно надо — и это
   выводится из журнала, который и так пишется. Сигналы нарочно грубые и объяснимые
   одной фразой: цель не «посчитать вовлечённость в баллах», а увидеть в чужом логе,
   в каком месте человек начал скучать или буксовать.

   ЧТО СЧИТАЕМ И ПОЧЕМУ:
   - темп по третям АКТИВНОГО времени. Скука выглядит не как «бросил», а как «думает
     всё дольше»: 12 действий в минуту в начале и 4 в конце — это затухание.
   - долгие паузы при вкладке В ФОКУСЕ (da уже считает только активные секунды).
     Пауза, когда игрок ушёл в другую вкладку, — это не скука, это жизнь.
   - простой подряд («переждать день» несколько раз кряду) — верный признак, что
     игрок не знает, что делать, или ждёт непонятно чего.
   - метания: переезды и простои подряд без единой сделки.
   - отказы: сколько раз действие не прошло (не хватило денег или места) — так
     выглядит «я застрял» со стороны игры.
   - вернулся ли после перерыва и начал ли новый заход сразу после финала — это уже
     признаки обратного, «затянуло». */
const ENG_PAUSE=45;   // с этой паузы в фокусе считаем, что игрок завис над экраном
// Что в журнале — НЕ действие игрока, а речь мира: события цен, порча, бедствия,
// предупреждения, выданные обязательства, служебные записи. Считать их наравне
// с кликами нельзя: три дня простоя подряд выглядели бы как бурная активность,
// потому что между ними мир успел написать про проценты, слух и предписание.
const ENG_WORLD=('note toast blur focus start again end engagement abandon event rot disaster '+
  'revision_warn revision_pass revision_fail duty_offer gold_offer contract_fail call_warn '+
  'achievement insurance_hint resume resume_toasts build_change trader_offer borrow_forced '+
  'tut_start tut_step tut_done tut_repeat tut_restart tut_stuck tut_lesson_done tut_exit').split(' ');
const engPlayerAct=e=>ENG_WORLD.indexOf(e.act)<0;
function engagement(){
  const ev=(S&&S.tel)||[];
  const acts=ev.filter(engPlayerAct);
  const total=activeSec();
  const res={acts:acts.length,min:+(total/60).toFixed(1),tempo:[0,0,0],pause:0,longPauses:0,
    waitRun:0,driftRun:0,blocked:0,away:Math.max(0,wallSec()-total),resumes:0,again:0,done:false};
  if(!acts.length)return res;
  const third=Math.max(1,total/3),cnt=[0,0,0];
  acts.forEach(e=>{cnt[Math.min(2,Math.floor(e.a/third))]++});
  res.tempo=cnt.map(c=>+(c/(third/60)).toFixed(1));
  const gaps=acts.map(e=>e.da).sort((a,b)=>a-b);
  res.pause=+gaps[Math.floor(gaps.length/2)].toFixed(1);
  res.longPauses=gaps.filter(g=>g>=ENG_PAUSE).length;
  let wait=0,drift=0;
  acts.forEach(e=>{
    if(e.act==='wait'){wait++;if(wait>res.waitRun)res.waitRun=wait}else wait=0;
    if(e.act==='travel'||e.act==='wait'){drift++;if(drift>res.driftRun)res.driftRun=drift}
    else if(e.act==='buy'||e.act==='sell'||e.act==='contract_deliver')drift=0;
    if(e.act==='blocked')res.blocked++;
  });
  // а это — речь мира и служебные отметки, их считаем по полному журналу
  ev.forEach(e=>{
    if(e.act==='resume')res.resumes++;
    if(e.act==='again')res.again++;
    if(e.act==='end')res.done=true;
  });
  return res;
}
// Та же сводка одной строкой — она уходит в шапку выгруженного журнала и отдельной
// записью в момент финала, чтобы в чужом логе сигнал читался сразу, без пересчёта.
function engagementLine(){
  const g=engagement();
  if(g.acts<8)return 'мало данных: действий '+g.acts;
  const f=[],drop=g.tempo[0]>0?g.tempo[2]/g.tempo[0]:1;
  // темп сравниваем только на заходе длиннее трёх минут: на коротком отрезке треть
  // активного времени — это секунды, и любое число действий даёт дикие «действия в минуту»
  if(g.min>=3&&drop<=.6)f.push('ЗАТУХАНИЕ (темп '+g.tempo[0]+'→'+g.tempo[2]+' действий/мин)');
  if(g.min>=3&&drop>=1.15)f.push('РАЗОГНАЛСЯ (темп '+g.tempo[0]+'→'+g.tempo[2]+' действий/мин)');
  if(g.longPauses>=3)f.push('ДОЛГИЕ ПАУЗЫ ('+g.longPauses+' шт. по '+ENG_PAUSE+'с и дольше)');
  if(g.waitRun>=3)f.push('ПРОСТОЙ ПОДРЯД ('+g.waitRun+' дн.)');
  if(g.driftRun>=4)f.push('МЕТАНИЯ (ходов без сделок подряд: '+g.driftRun+')');
  if(g.blocked>=5)f.push('УПИРАЛСЯ В ОТКАЗЫ ('+g.blocked+')');
  if(g.away>g.min*60*.5)f.push('ОТВЛЕКАЛСЯ (вне фокуса '+Math.round(g.away/60)+' мин)');
  if(g.pause<=6&&g.acts>=40)f.push('ЗАТЯНУЛО (медианная пауза '+g.pause+'с)');
  if(g.again)f.push('НАЧАЛ ЗАНОВО СРАЗУ ПОСЛЕ ФИНАЛА');
  if(g.resumes)f.push('ВОЗВРАЩАЛСЯ ПОСЛЕ ПЕРЕРЫВА ('+g.resumes+')');
  if(!g.done)f.push('заход не доигран');
  if(!f.length)f.push('ровный заход, без выраженных сигналов');
  return f.join('; ');
}

function exportLog(){
  const g=engagement();
  const head='Долговая книга · сборка '+BUILD+' · '+P.n+' · товары: '+GOODS.map(g=>g.n).join(', ')+' · '+new Date().toISOString()+'\n'+
    '# akt_sek — секунды с вкладкой в фокусе; pauza — таких секунд с прошлого действия; obshee_sek — по часам\n'+
    '# сигналы: '+engagementLine()+'\n'+
    '# темп по третям захода: '+g.tempo.join(' / ')+' действий/мин; медианная пауза '+g.pause+
      'с; простоев подряд '+g.waitRun+'; ходов без сделок подряд '+g.driftRun+'; отказов '+g.blocked+'\n'+
    'akt_sek\tpauza\tobshee_sek\tden\trynok\tdeystvie\tdetali\tkassa\tdolg\titog\ttryum\n';
  const rows=S.tel.map(e=>[e.a,e.da,e.w,e.day,e.mkt,e.act,e.detail,e.cash,e.debt,e.net,e.held].join('\t')).join('\n');
  const b=new Blob([head+rows],{type:'text/plain;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='dolgovaya-kniga-log.tsv';
  document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},400);
}
