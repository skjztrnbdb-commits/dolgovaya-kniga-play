/* ============ обучение: сценарии и движок ============
   План целиком — docs/TUTORIAL.md. Коротко о том, что здесь важно знать:

   Урок — это отдельный срежиссированный мини-заход: свой набор товаров, свои
   ФИКСИРОВАННЫЕ цены (rollAll() спрашивает tutPrices() и затирает случайные),
   ноль бедствий, слухов, предписаний и посторонних контрактов. Иначе урок про
   спред зависел бы от того, что сегодня выпало на рынке.

   Главное правило текстов: урок объясняет ПРАВИЛО, а не число. Никаких «45 дней»
   и «2% в день» — они живут в PRESETS и меняются вместе с балансом. Где число
   всё-таки нужно (какая сейчас цена, сколько ушло на фрахт), say/after — функции,
   и число подставляется из живого состояния.

   Обучение не трогает настоящий заход: saveSession() и grant() выходят сразу,
   если inTut() — сохранение и достижения игрока остаются нетронутыми.

   Этот файл — без DOM. Панель шага и каталог уроков рисует tutorial-ui.js. */

/* Базовая «сложность» обучения. Не в data.js: это не баланс игры, а декорация
   для уроков — здесь нет ни срока, ни ревизий, ни порога, за которым забирают
   контору (call выставлен заведомо недостижимым, а не нулём: ноль означал бы
   «долг больше порога» на первом же кадре). */
const TUT_PRESET={n:'Обучение',days:60,debt:6000,cash:3000,cap:250,
  rates:[.02,.02,.02],freight:.9,call:9e9,checks:[],
  ev:0,evBad:0,rot:1,lie:0,lot:1,duty:0,gold:0,disaster:0,
  mix:[1,1,1],mkts:['Соляные ряды','Старый порт','Верхний рынок'],
  hintBest:1,hintArrow:1,hintFake:1,hintProfile:1,hintTrust:1,hintToday:1,
  d:'Обучение'};
PRESETS.tut=TUT_PRESET;

/* Хелперы для текстов уроков: считают по живому состоянию, а не по константам. */
const tq=id=>qty(id);
const tst=k=>(S.stats&&S.stats[k])||0;
// «Шаг зашёл в тупик»: нужно купить n единиц, а денег на недостающие уже не хватает.
// Ради этого шаги и умеют stuck(): в обучении ничего не блокируется, но игрок,
// который распорядился кассой не так, должен УЗНАТЬ, что дальше не получится,
// а не тыкать в кнопки, пока не бросит (разбор с Сергеем, 20.08).
const tutNoCash=(id,n)=>{
  const left=n-qty(id);
  return left>0&&S.cash<askAt(id,S.imp[S.mkt][id])*left;
};

/* Сценарии уроков: ТОЛЬКО механика — что показать, что должен сделать игрок, когда
   шаг считается выполненным и когда он зашёл в тупик. Все тексты (название урока,
   суть одной строкой, реплики шагов и итог) живут в языковых пакетах, в `L.tut.<id>`:
   урок надо не переводить, а писать заново на каждом языке (см. lang.js). Порядок
   шагов здесь и порядок реплик в `L.tut.<id>.s` обязан совпадать — это проверяет тест. */
const TUT_LESSONS=[
{id:'o2',
 goods:['kan'],mkt:'Соляные ряды',
 prices:{'Соляные ряды':{kan:120},'Старый порт':{kan:120},'Верхний рынок':{kan:120}},
 preset:{cash:3000,debt:2000},
 steps:[
  {focus:'.dk-tbl tbody tr',done:()=>tst('buys')>0,stuck:()=>tst('buys')===0&&tutNoCash('kan',1)},
  {focus:'.dk-tbl tbody tr',done:()=>tq('kan')===0&&tst('sells')>0}]},

{id:'o1',
 goods:['kan'],mkt:'Старый порт',
 prices:{'Соляные ряды':{kan:120},'Старый порт':{kan:120},'Верхний рынок':{kan:120}},
 preset:{cash:2500,debt:6000},
 steps:[
  // подсвечиваем оба места и прокручиваем к первому — к панели кредитора: она и есть
  // то, за чем игрок должен следить, а до кнопки он докрутит сам (Сергей, 20.08).
  // Слов «справа», «слева», «внизу» в текстах нет нигде: на телефоне вёрстка в один
  // столбец, и такая подсказка врёт (принцип 15). Показываем именем и подсветкой
  {focus:'#debt-panel,#wait',enter:()=>{TUT.mem.i1=tst('int')},done:()=>S.day>=2},
  {focus:'#wait',done:()=>S.day>=3},
  {focus:'#bank-amt',done:()=>tst('repaid')>0,stuck:()=>tst('repaid')===0&&S.cash<1}]},

{id:'o3',
 goods:['kan'],mkt:'Соляные ряды',
 prices:{'Соляные ряды':{kan:90},'Старый порт':{kan:150},'Верхний рынок':{kan:120}},
 preset:{cash:3000,debt:4000},
 steps:[
  {focus:'.dk-tbl tbody tr',done:()=>tq('kan')>=10,stuck:()=>tutNoCash('kan',10)},
  {focus:'#markets',done:()=>S.mkt==='Старый порт'},
  {focus:'.dk-tbl tbody tr',done:()=>tq('kan')===0&&tst('sells')>0}]},

{id:'o4',
 goods:['sol','med'],mkt:'Старый порт',
 prices:{'Соляные ряды':{sol:14,med:460},'Старый порт':{sol:14,med:460},'Верхний рынок':{sol:14,med:460}},
 preset:{cash:9000,debt:2000},
 steps:[
  {focus:'.dk-tbl tbody tr',done:()=>tq('sol')>=40},
  {focus:'.dk-tbl tbody tr',done:()=>tq('sol')===0},
  {focus:'.dk-tbl tbody tr',done:()=>tq('med')>=3,stuck:()=>tutNoCash('med',3)}]},

{id:'o5',
 goods:['kan'],mkt:'Старый порт',
 prices:{'Соляные ряды':{kan:120},'Старый порт':{kan:120},'Верхний рынок':{kan:120}},
 preset:{cash:20000,debt:2000},
 steps:[
  {focus:'.dk-tbl tbody tr',enter:()=>{TUT.mem.a0=ask('kan')},done:()=>tst('buys')>=1},
  {focus:'.dk-tbl tbody tr',enter:()=>{TUT.mem.av=avg('kan')},done:()=>tst('buys')>=2},
  {focus:'.dk-tbl tbody tr',enter:()=>{TUT.mem.b0=bid('kan')},done:()=>tq('kan')===0&&tst('sells')>0}]},

{id:'o6',
 goods:['kan'],mkt:'Соляные ряды',
 prices:{'Соляные ряды':{kan:90},'Старый порт':{kan:150},'Верхний рынок':{kan:120}},
 preset:{cash:3500,debt:4000},
 setup:function(){
   // контракт собран руками, а не через makeOffer(): в уроке он должен быть
   // ровно таким каждый раз — тот же товар, тот же город, тот же срок
   S.contracts=[{id:cid++,g:'kan',qty:20,done:0,mkt:'Старый порт',due:S.day+8,
     pay:4050,pen:1420,tier:'средний',gold:0,duty:0,boost:[.05,3],state:'offer',seen:S.day,grab:3}];
 },
 steps:[
  {focus:'#contracts',done:()=>S.contracts.some(c=>c.state==='live')},
  {focus:'.dk-tbl tbody tr',done:()=>tq('kan')>=20,stuck:()=>tutNoCash('kan',20)},
  {focus:'#markets',done:()=>S.mkt==='Старый порт'},
  {focus:'#contracts',done:()=>S.contractsDone>=1}]},

{id:'o7',
 goods:['kan'],mkt:'Старый порт',
 prices:{'Соляные ряды':{kan:120},'Старый порт':{kan:120},'Верхний рынок':{kan:120}},
 preset:{cash:2000,debt:1200},
 steps:[
  {focus:'#bank-amt',done:()=>S.debt<=0,stuck:()=>S.debt>0&&S.cash<S.debt},
  {focus:'#close-book',done:()=>!!S.over}]}
];
// Тексты урока — из языкового пакета; здесь только доступ к ним
const tutT=(id)=>(L.tut&&L.tut[id])||{};
const tutName=id=>tutT(id).n||id;
const tutOne=id=>tutT(id).one||'';
const tutFin=id=>{const v=tutT(id).fin;return typeof v==='function'?v():(v||'')};
const tutStepTxt=(id,i,f)=>{
  const s=(tutT(id).s||[])[i];if(!s)return '';
  const v=s[f];return typeof v==='function'?v():(v||'');
};

const TUT_BY_ID={};
TUT_LESSONS.forEach(l=>TUT_BY_ID[l.id]=l);
// Порядок «Основ» — тот, в котором их проходят цепочкой (не тот, в котором они
// объявлены выше: сначала объявлен o2, потому что он же образец формата)
const TUT_ORDER=['o1','o2','o3','o4','o5','o6','o7'];
const tutList=()=>TUT_ORDER.map(id=>TUT_BY_ID[id]).filter(Boolean);

/* ============ движок ============ */
// TUT — идущий урок: {les, i, ok, mem, snap}. Он же признак «мы в обучении»
// для всей остальной игры: см. inTut() и точки касания в saveSession/grant/
// rollAll/rumour/refill/draw/menu.
let TUT=null;
const inTut=()=>!!TUT||!!(S&&S.tut);
// Что уроку разрешено из «живого мира». По умолчанию не разрешено ничего:
// слухи, новые предложения контрактов и прочий фон в уроке — шум, который
// отвлекает от единственной механики, ради которой урок и существует.
// Спрашиваем именно TUT (идёт ли урок ПРЯМО СЕЙЧАС), а не inTut(): последний
// остаётся верным и после выхода из урока, пока в S лежит его состояние.
const tutAllows=k=>!TUT||!!TUT.les[k];

// Котировки урока вместо случайных. Вызывается из rollAll() каждый день, поэтому
// цены в уроке не «зафиксированы один раз», а честно перевыставляются — никакого
// дрейфа между днями, и урок про переезд показывает ровно то, что обещал.
function tutPrices(){
  if(!TUT)return;
  const pr=TUT.les.prices||{};
  MKTS.forEach(m=>{
    S.raw[m.n]=S.raw[m.n]||{};
    GOODS.forEach(g=>{
      const row=pr[m.n]||{};
      S.raw[m.n][g.id]=row[g.id]||g.base;
    });
  });
}

// Снимок состояния перед шагом — на нём держится «Повторить шаг». Копируем то же,
// что и saveSession(): S целиком плюс bias/seen/cid. Этого достаточно, потому что
// набор товаров, рынков и сложность внутри урока не меняются.
function tutSnap(){
  return{S:JSON.parse(JSON.stringify(S)),bias:JSON.parse(JSON.stringify(bias)),
    seen:JSON.parse(JSON.stringify(seen)),cid:cid,chart:chartGood};
}
function tutRestore(sn){
  S=JSON.parse(JSON.stringify(sn.S));
  bias=JSON.parse(JSON.stringify(sn.bias));
  seen=JSON.parse(JSON.stringify(sn.seen));
  cid=sn.cid;chartGood=sn.chart;
}

function tutStart(id){
  const les=TUT_BY_ID[id];
  if(!les)return;
  TUT={les:les,i:0,ok:false,mem:{},snap:null,ready:false};
  closePopups();clearToasts();
  document.querySelectorAll('.dk-over').forEach(n=>n.remove());
  unstretchRoot();
  // общий start() строит валидный S по той же схеме, что и настоящий заход, —
  // ничего не дублируем; всё, что урок хочет иначе, переписывается следом
  start('tut');
  P=Object.assign({},TUT_PRESET,les.preset||{});
  GOODS=les.goods.map(g=>POOL_BY_ID[g]).filter(Boolean);
  buildMarkets();
  S.day=1;S.cash=P.cash;S.debt=P.debt;S.cap=P.cap;
  S.mkt=les.mkt||MKTS[0].n;
  S.lots={};GOODS.forEach(g=>S.lots[g.id]=[]);
  S.imp={};S.hist={};S.histAll={};S.vol={};
  MKTS.forEach(m=>{S.imp[m.n]={};S.hist[m.n]={};GOODS.forEach(g=>S.imp[m.n][g.id]=1)});
  // репутация рынков («обычно дёшево соль») считается из bias — выводим её из цен
  // урока, чтобы справочник не расходился с тем, что игрок видит в ведомости
  bias={};MKTS.forEach(m=>{bias[m.n]={};GOODS.forEach(g=>{
    const row=(les.prices||{})[m.n]||{};
    bias[m.n][g.id]=(row[g.id]||g.base)/g.base;
  })});
  seen={};MKTS.forEach(m=>seen[m.n]={});
  S.contracts=[];S.rumours=[];S.rumNew=0;S.log=[];S.bal=[];S.tel=[];S.toasts=[];
  S.temp={};S.perm={};S.relief=0;S.exposed={};S.goldGoods={};S.contractsDone=0;
  S.visited={};S.visited[S.mkt]=1;
  S.insHinted=1;                       // подсказку про страховку в уроке не показываем
  S.reserveAnnounced=les.reserve?0:1;  // и предложение закрыть книгу — только там, где оно к месту
  S.stats=freshStats();
  S.tut={les:les.id};
  chartGood=GOODS[0].id;
  rollAll();
  if(les.setup)les.setup();
  el('sub').textContent=dname('tut')+' · '+tutName(les.id);
  tel('tut_start',les.id);
  TUT.ready=true;
  tutEnterStep();
  draw();
}

// Начало шага: снимок для «Повторить», необязательный enter(), запись в журнал.
function tutEnterStep(quiet){
  const st=tutStep();
  if(!st)return;
  TUT.ok=false;TUT.scrolled=false;
  if(st.enter)st.enter();
  // текст шага считается один раз, здесь: реплика бывает функцией и берёт числа из
  // состояния, а состояние по ходу шага меняется — иначе инструкция переписывалась
  // бы прямо под руками игрока и начинала противоречить себе
  TUT.say=tutStepTxt(TUT.les.id,TUT.i,'say');
  TUT.snap=tutSnap();
  if(!quiet)tel('tut_step',TUT.les.id+' шаг '+(TUT.i+1)+' из '+TUT.les.steps.length);
}
const tutStep=()=>TUT&&!TUT.finished?TUT.les.steps[TUT.i]:null;

// Проверка «сделал ли игрок то, о чём просит шаг». Вызывается после каждой
// перерисовки: предикат смотрит на состояние, а не на клик, — игрок мог прийти
// к результату своим путём, и это законно.
function tutCheck(){
  if(!TUT||!TUT.ready||TUT.finished||TUT.ok)return;
  const st=tutStep();
  if(!st||!st.done)return;
  let ok=false;
  try{ok=!!st.done()}catch(e){ok=false}
  if(!ok)return;
  TUT.ok=true;TUT.stuck=false;
  snd('good');
  tel('tut_done',TUT.les.id+' шаг '+(TUT.i+1));
}
// Проверка на тупик — отдельно от tutCheck: шаг не выполнен и выполнить его уже
// нечем. Тогда панель сама предлагает откатиться, а не ждёт, пока игрок догадается.
function tutStuck(){
  if(!TUT||!TUT.ready||TUT.finished||TUT.ok)return false;
  const st=tutStep();
  if(!st||!st.stuck)return false;
  let v=false;
  try{v=!!st.stuck()}catch(e){v=false}
  if(v&&!TUT.stuck)tel('tut_stuck',TUT.les.id+' шаг '+(TUT.i+1));
  TUT.stuck=v;
  return v;
}

function tutNext(){
  if(!TUT)return;
  if(TUT.i+1<TUT.les.steps.length){
    TUT.i++;tutEnterStep();tutPanel();draw();
  }else{
    TUT.finished=true;
    tutDone[TUT.les.id]=1;saveStore();
    tel('tut_lesson_done',TUT.les.id);
    snd('gold');
    // всё обучение целиком — единственное достижение, которое выдаётся не в заходе
    // (grant с force, см. state.js): в самом уроке ачивок нет, но пройденное
    // обучение — факт про игрока, а не событие захода
    if(TUT_ORDER.every(id=>tutDone[id]))grant('a26',1);
    tutPanel();
  }
}
// Повтор шага — то, ради чего снимок и делается. Отсюда же следует, что в уроке
// не надо ничего запрещать: сломать урок нестрашно, всё чинится откатом.
function tutRepeat(){
  if(!TUT||!TUT.snap)return;
  tutRestore(TUT.snap);
  tutEnterStep(true); // тот же вход в шаг, что и в первый раз: enter(), текст, новый снимок
  closePopups();clearToasts();
  tel('tut_repeat',TUT.les.id+' шаг '+(TUT.i+1));
  snd('click');
  tutPanel();draw();
}
function tutRestartLesson(){
  if(!TUT)return;
  const id=TUT.les.id;
  tel('tut_restart',id);
  tutStart(id);
}
// Следующий урок цепочки — или null, если этот последний
function tutNextLesson(){
  if(!TUT)return null;
  const i=TUT_ORDER.indexOf(TUT.les.id);
  return i>=0&&TUT_ORDER[i+1]?TUT_BY_ID[TUT_ORDER[i+1]]:null;
}
// Выход из обучения. Урок снят, а вот метка S.tut на состоянии остаётся нарочно:
// пока в S лежит заход обучения, он не должен ни сохраняться, ни выдавать
// достижения, ни предлагаться в меню кнопкой «Продолжить заход». Метка исчезает
// сама, когда S заменят настоящим заходом (start/resumeSession).
function tutStop(){
  if(!TUT)return;
  tel('tut_exit',TUT.les.id+' шаг '+(TUT.i+1));
  TUT=null;
  tutClearUI();
}
