/* ============ звук ============ */
const TONES={buy:[[520,660,.09]],sell:[[660,440,.11]],travel:[[300,240,.07]],
  click:[[430,430,.04]],good:[[520,780,.14]],bad:[[220,130,.22]],
  rum:[[880,880,.05],[1150,1150,.06]],ach:[[520,660,.09],[780,980,.16]],
  gold:[[660,880,.1],[990,1320,.2]]};
function snd(kind){
  if(!sndOn)return;
  try{
    AC=AC||new (window.AudioContext||window.webkitAudioContext)();
    // браузеры (особенно Safari) иногда создают контекст в состоянии suspended
    // и требуют явный resume() даже из обработчика клика — без этого звук
    // молча не играет (ошибок нет, просто тишина, пока что-то не «расшевелит» контекст)
    if(AC.state==='suspended')AC.resume();
    const seq=TONES[kind]||TONES.click;let t=AC.currentTime;
    seq.forEach(s=>{
      const o=AC.createOscillator(),g=AC.createGain();
      o.type=kind==='bad'?'sawtooth':'triangle';
      o.frequency.setValueAtTime(s[0],t);
      if(s[1]!==s[0])o.frequency.exponentialRampToValueAtTime(s[1],t+s[2]);
      g.gain.setValueAtTime(kind==='click'?.045:.09,t);
      g.gain.exponentialRampToValueAtTime(.001,t+s[2]+.04);
      o.connect(g);g.connect(AC.destination);o.start(t);o.stop(t+s[2]+.06);
      t+=s[2];
    });
  }catch(e){}
}
function bringIntoView(){
  // Прокручиваем, ТОЛЬКО если корень игры реально уехал за экран — например, игрок
  // читал конец ведомости и оттуда открыл меню. Раньше здесь стоял безусловный
  // scrollIntoView({block:'center'}), и на телефоне, где корень выше экрана,
  // «центрирование» само по себе давало плавный сдвиг на несколько пикселей при
  // каждом открытии меню, настроек и финала: страница молча уползала к бегущей
  // строке, и это выглядело как дефект (нашёл Сергей 28.08 на живой сборке).
  try{
    const r=el('root').getBoundingClientRect();
    if(Math.abs(r.top)<60)return;
    window.scrollTo({top:window.scrollY+r.top,behavior:'smooth'});
  }catch(e){}
}
// .dk-over — position:absolute;inset:0, размер жёстко привязан к высоте #root.
// Для меню/настроек список ачивок может оказаться выше, чем реальный (в меню —
// почти пустой) остальной контент #root — тогда фон попапа обрывается раньше
// конца содержимого, и сквозь него по-настоящему (не приглушённо) виден футер
// на своей обычной позиции, а не там, где заканчивается попап. Растягиваем
// #root под содержимое попапа; снимается в draw() (unstretchRoot) и в местах,
// где попап закрывают без вызова draw().
// Зависимость взаимная: высота оверлея = max(содержимое, 100% высоты #root),
// а min-height у #root мы считаем по высоте оверлея. Одного замера не хватает —
// первый берётся до того, как #root вырастет, и хвост оверлея (нижний padding
// под кнопкой) остаётся снаружи. Поэтому подгоняем, пока не сойдётся: обычно
// хватает двух проходов, пять — просто потолок от зацикливания.
function stretchRootFor(o){
  const r=el('root');
  for(let i=0;i<5;i++){
    const want=Math.max(o.offsetHeight||0,window.innerHeight||0);
    if(Math.abs(want-r.offsetHeight)<1)break;
    r.style.minHeight=want+'px';
  }
}
function unstretchRoot(){el('root').style.minHeight=''}
// Вопрос — единственный случай, где по-настоящему нужен выбор (Да/Нет с реальными
// последствиями, например неустойка в долг за отказ от контракта), поэтому не тост:
// тап где угодно не может значить одновременно и «да», и «нет». Приглушённый фон
// (игра видна позади), не .dk-over — незачем подменять весь экран ради одной фразы.
// bringIntoView() тут не нужен и не был нужен: попап position:fixed, то есть уже
// всегда по центру видимой области — вызов scrollIntoView только дёргал страницу
// (например, уезжал график, за которым только что следили).
function closePopups(){document.querySelectorAll('.dk-popup,.dk-popup-backdrop').forEach(n=>n.remove())}
// onNo — необязательный: нужен там, где отказ сам по себе решение и его надо записать
// в журнал (подкуп чиновника). Клик по фону считается тем же отказом, что и кнопка «нет».
function askConfirm(msg,onYes,yesLabel,noLabel,onNo){
  closePopups();
  const bd=document.createElement('div');bd.className='dk-popup-backdrop';
  bd.onclick=()=>{closePopups();if(onNo)onNo()};
  const o=document.createElement('div');o.className='dk-popup dk-confirm';
  o.innerHTML='<p>'+msg+'</p>';
  const row=document.createElement('div');row.className='row';
  const y=document.createElement('button');y.textContent=yesLabel||L.msg.yesSell;y.className='sell';
  const n=document.createElement('button');n.textContent=noLabel||L.msg.noSell;
  y.onclick=()=>{closePopups();onYes()};
  n.onclick=()=>{closePopups();if(onNo)onNo()};
  row.appendChild(y);row.appendChild(n);o.appendChild(row);
  el('root').appendChild(bd);el('root').appendChild(o);
}
// Выбор из нескольких предложений (бедуин в пустыне, бродячий трейдер на рынке).
// askConfirm умеет только «да/нет», а тут вариантов бывает три-четыре, и каждый со своей
// ценой. Кнопки — списком во всю ширину, потому что в них цифры и текст, а не одно слово.
// opts: [{label, sub, kind, disabled, onPick}], последняя строка — «уйти».
function askChoice(title,msg,opts,leaveLabel,onLeave){
  closePopups();
  const bd=document.createElement('div');bd.className='dk-popup-backdrop';
  bd.onclick=()=>{closePopups();if(onLeave)onLeave()};
  const o=document.createElement('div');o.className='dk-popup dk-choice';
  o.innerHTML='<h4>'+title+'</h4><p>'+msg+'</p>';
  opts.forEach(x=>{
    const b=document.createElement('button');b.className='wide'+(x.kind?' '+x.kind:'');
    b.innerHTML=x.label+(x.sub?'<i>'+x.sub+'</i>':'');
    b.disabled=!!x.disabled;
    b.onclick=()=>{closePopups();x.onPick()};
    o.appendChild(b);
  });
  const n=document.createElement('button');n.textContent=leaveLabel||L.msg.leave;
  n.onclick=()=>{closePopups();if(onLeave)onLeave()};
  o.appendChild(n);
  el('root').appendChild(bd);el('root').appendChild(o);
}
/* ============ тосты ============
   Тосты СТАКАЮТСЯ, а не вытесняют друг друга. Раньше toast() сносил предыдущий,
   и за один день сообщения затирали одно другое: приехал на рынок — тост «здесь
   ждут поставку» убивал предупреждение о ревизии, которое tick() показал секундой
   раньше (travel() шлёт свой тост уже ПОСЛЕ tick(), так что порядок внутри tick()
   ничего не спасал). Игрок терял ровно те сообщения, ради которых они и заведены.
   Теперь все живут в общей колонке, у каждого свой таймер; клик по тосту убирает
   его один, клик по фону — все разом. */
// Тосты не гаснут сами — игрок закрывает их сам (клик по тосту убирает один,
// клик по фону — все). Таймера нет вовсе: сообщение, которое стоило показать,
// стоит и дочитать, а исчезающий текст игрок ловит боковым зрением и теряет.
// Раз никто не гаснет, потолок стека выше прежнего, а сам стек прокручивается
// (max-height + overflow-y в style.css) — иначе на бурном дне часть сообщений
// вытеснялась бы молча, то есть ровно то, от чего мы уходили.
const TOAST_MAX=6;
let toastBox=null;
// Всплывашка с выбором (бедуин, торговец, подкуп, набранный резерв) не должна
// вылезать поверх непрочитанных тостов: тосты рассказывают, что произошло, а выбор
// требует решения по итогу — и решать, не дочитав, игрок не может. Поэтому такие
// попапы ждут, пока стопка тостов не опустеет. Очередь на один: два предложения
// подряд в один день — уже базар, второе просто не показываем.
let pendingChoice=null;
const toastsOnScreen=()=>!!(toastBox&&toastBox.children.length);
function afterToasts(fn){
  if(!toastsOnScreen()){fn();return}
  pendingChoice=fn;
}
function dropPending(){pendingChoice=null}
function runPending(){
  const fn=pendingChoice;
  if(!fn||!S||S.over)return;
  pendingChoice=null;fn();
}
function clearToasts(){
  document.querySelectorAll('.dk-toast-stack,.dk-toast-backdrop').forEach(n=>n.remove());
  toastBox=null;
  if(S)S.toasts=[]; // погасил все — значит прочитал: возвращать их после перезагрузки незачем
  runPending();     // дочитал — теперь можно и предложить выбор
}
// Непрочитанные тосты переживают перезагрузку. Вкладку закрывают, телефон
// блокируется, браузер падает — а на экране в этот момент висело «ревизия завтра»
// или «крысы съели чай». Возвращаясь, игрок этого уже не помнит и узнаёт о ревизии
// в день ревизии. Поэтому список висящих тостов живёт в S (значит, попадает
// в снимок сессии) и восстанавливается вместе с заходом.
function replayToasts(){
  const all=(S&&S.toasts)||[];
  if(!all.length||S.over)return;
  const list=all.filter(r=>r.b===BUILD),stale=all.length-list.length;
  S.toasts=list; // записи чужой сборки выбрасываем совсем, а не копим мёртвым грузом
  list.slice().forEach(r=>toast(r.t,r.s,r.k,r.key,r));
  if(list.length||stale)tel('resume_toasts','возвращено непрочитанных: '+list.length+
    (stale?', пропущено с прошлой сборки: '+stale:''));
}
// key — необязательный: тост с тем же ключом заменяет предыдущий вместо того,
// чтобы встать рядом. Нужен для повторяющихся сообщений: предупреждение о ревизии
// приходит каждый день, и без ключа рядом висели бы разом «через 3 дня», «через
// 2 дня» и «завтра» — устаревшие копии, которые прямо врут игроку.
// Одно событие — один текст. Раньше note() и toast() писались порознь, и они
// расходились: провал ревизии в журнале называл и штраф, и навязанный товар,
// а в тосте — только что-то одно. Теперь тост показывает ровно ту же фразу,
// что уходит в журнал, и разъехаться они физически не могут.
// kind: '' — плохая новость, good/gold — хорошая, info — нейтральная.
function announce(title,text,kind,key){
  // note() молча: этот же текст уйдёт в телеметрию строкой toast — одно сообщение,
  // одна запись, иначе разбор лога пришлось бы чистить от дублей
  note(text,kind==='good'||kind==='gold'?'pos':kind==='info'?'':'neg',true);
  toast(title,text,kind,key);
}
// Всё, что игрок увидел на экране, пишется в телеметрию: раньше по логу нельзя было
// сказать, показывали ли ему тост про возмещение страховки или он его прокликал —
// приходилось гадать по косвенным следам (просьба Сергея после захода 15).
// rec — восстановление уже записанного тоста после перезагрузки: он не пишется
// в телеметрию второй раз и не встаёт в список заново, он в нём уже есть.
function toast(text,sub,kind,key,rec){
  // Заход кончился — новостей больше нет. «Ревизия через 3 дня» поверх штампа
  // БАНКРОТ читается как издёвка (Сергей, 20.08): предупреждение о завтрашнем дне
  // для конторы, которой уже нет. Достижения, выданные в момент победы, не теряются —
  // они перечислены на самом итоговом экране (см. finish/overStats).
  if(S&&S.over)return;
  if(!rec){
    tel('toast',text+(sub?' — '+sub:''));
    // b — сборка, на которой тост родился. Текст сообщения хранится готовым (собрать
    // его заново из «вида и параметров» нельзя: у двух десятков видов свои формулировки
    // и свои числа, и реестр построителей пришлось бы держать в синхроне с каждой
    // правкой текста). Зато по сборке видно, что запись из прошлой версии игры, —
    // такие после обновления не возвращаем, чтобы игрок не читал позавчерашние
    // формулировки как сегодняшние.
    rec={id:S?(S.toastSeq=(S.toastSeq||0)+1):0,t:text,s:sub||'',k:kind||'',key:key||'',b:BUILD};
    if(S){
      S.toasts=S.toasts||[];
      if(key)S.toasts=S.toasts.filter(x=>x.key!==key); // тот же ключ — замена, как и на экране
      S.toasts.push(rec);
      while(S.toasts.length>TOAST_MAX)S.toasts.shift();
    }
  }
  if(!toastBox){
    const bd=document.createElement('div');bd.className='dk-toast-backdrop';
    bd.addEventListener('click',clearToasts);
    toastBox=document.createElement('div');toastBox.className='dk-toast-stack';
    // Клик по самой колонке (промежутки между тостами, поля по бокам) тоже гасит всю
    // пачку: колонка лежит НАД фоном, поэтому раньше эти несколько десятков пикселей
    // молча съедали клик — игрок жал «куда-то в тосты», и не происходило ничего.
    // onclick, а не addEventListener: так обработчик виден тесту (заглушка DOM
    // не исполняет слушателей) — а гасить его по отдельности всё равно незачем.
    toastBox.onclick=clearToasts;
    el('root').appendChild(bd);el('root').appendChild(toastBox);
  }
  const box=toastBox;
  // копию списка, а не живую коллекцию: remove() меняет box.children на ходу
  if(key)[].slice.call(box.children).forEach(c=>{if(c.dkKey===key)c.remove()});
  const d=document.createElement('div');
  if(key)d.dkKey=key;
  d.className='dk-toast'+(kind==='good'?' good':kind==='gold'?' gold':kind==='info'?' info':'');
  d.innerHTML=text+(sub?'<small>'+sub+'</small>':'');
  box.appendChild(d);
  while(box.children.length>TOAST_MAX)box.children[0].remove();
  const drop=()=>{
    d.remove();
    if(S&&S.toasts)S.toasts=S.toasts.filter(x=>x.id!==rec.id); // прочитан — больше не всплывёт
    if(box===toastBox&&!box.children.length)clearToasts();     // а он и запустит отложенный выбор
  };
  // stopPropagation: иначе клик по одному тосту всплыл бы до фона и снёс всю пачку.
  // onclick, а не addEventListener, по той же причине, что и у колонки: так обработчик
  // виден тесту (заглушка DOM слушателей не исполняет), а гасить его отдельно незачем
  d.onclick=e=>{if(e&&e.stopPropagation)e.stopPropagation();drop()};
}
