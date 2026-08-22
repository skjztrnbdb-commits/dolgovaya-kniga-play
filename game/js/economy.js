/* ============ экономика ============
   Трюм (вместимость, лоты, подделки), цены и котировки, платные услуги
   (страховка, оценщик) — вся арифметика игры, без единого обращения к DOM. */
/* ============ трюм ============ */
const lots=g=>S.lots[g]||[];
const qty=g=>lots(g).reduce((s,l)=>s+l.q,0);
const fkq=g=>lots(g).reduce((s,l)=>s+l.fk,0);
const cst=g=>lots(g).reduce((s,l)=>s+l.c,0);
const avg=g=>{const q=qty(g);return q?cst(g)/q:0};
const expCount=g=>(S.exposed&&S.exposed[g])||0;
const held=()=>GOODS.reduce((s,g)=>s+qty(g.id)*g.bulk+expCount(g.id)*g.bulk,0);
const capacity=()=>S.cap+bf('cap');
const room=()=>capacity()-held();
function disposeVal(g){
  const G=good(g),b=bidAt(g,1)||Math.round(G.base*.5);
  return Math.max(1,Math.round(b*.35));
}
function disposeExposed(g){
  const n=expCount(g);if(!n)return;
  const per=disposeVal(g),total=per*n;
  S.cash+=total;S.exposed[g]=0;
  note(L.msg.disposed(good(g).n,n,total),'pos');
  tel('fake_dispose',good(g).n+' x'+n+' $'+total);
  snd('sell');draw();
}
function contractHere(gid){
  return S.contracts.some(c=>c.state==='live'&&c.g===gid&&c.mkt===S.mkt&&c.done<c.qty);
}
function contractAt(gid){
  return S.contracts.find(c=>c.state==='live'&&c.g===gid&&c.mkt===S.mkt&&c.done<c.qty);
}
function takeLots(g,n){
  // берём сперва настоящий товар, подделка идёт в счёт только когда партия исчерпана —
  // без этого округление на остатке в одну единицу теряло счёт подделок (баг v8)
  let left=n,fk=0,c=0,q=0;const arr=lots(g);
  while(left>0&&arr.length){
    const l=arr[0],t=Math.min(l.q,left);
    const genuine=l.q-l.fk,takeGenuine=Math.min(t,Math.max(0,genuine)),takeFake=t-takeGenuine;
    const cc=l.c*t/l.q;
    l.q-=t;l.fk-=takeFake;l.c-=cc;left-=t;fk+=takeFake;c+=cc;q+=t;
    if(l.q<=0)arr.shift();
  }
  return{q:q,fk:fk,cost:c};
}

/* ============ цены ============ */
const rawAt=(m,g)=>S.raw[m]?S.raw[m][g]:null;
const spreadOf=m=>mk(m).spread*(1-bf('spread'));
function boostMul(g){
  let v=1+(S.perm[g]||0);
  (S.temp[g]||[]).forEach(b=>{if(b.until>=S.day)v*=1+b.m});
  return v;
}
// Если в этой точке ждут сдачи контракта на этот товар, докупить недостающее
// прямо здесь и тут же сдать не должно быть выгоднее, чем возить — иначе это
// не логистика, а хак: докупил на месте по рыночной цене, сдал по контрактной,
// разница в карман. Поэтому цена покупки не может быть ниже цены за единицу
// по контракту с запасом (15%), пока контракт ждёт сдачи именно здесь.
function contractFloorHere(g){
  const c=contractAt(g);
  return c?Math.ceil(c.pay/c.qty*1.15):0;
}
function askAt(g,imp,m){
  const mkt=m||S.mkt,r=rawAt(mkt,g);
  if(!r)return null;
  const base=Math.max(1,Math.round(r*imp*(1+spreadOf(mkt)/2)*(1-bf('buy'))));
  return mkt===S.mkt?Math.max(base,contractFloorHere(g)):base;
}
function bidAt(g,imp,m){const r=rawAt(m||S.mkt,g);
  return r?Math.max(1,Math.round(r*imp*(1-spreadOf(m||S.mkt)/2)*boostMul(g)*(1+bf('sell')))):null}
const ask=g=>askAt(g,S.imp[S.mkt][g]);
const bid=g=>bidAt(g,S.imp[S.mkt][g]);
const stock=()=>GOODS.reduce((s,g)=>s+qty(g.id)*(bid(g.id)||Math.round(g.base*.5)),0);
const net=()=>S.cash+stock()-S.debt;
// сколько денег закопано в трюме — по цене закупки, а не по текущей рыночной:
// это ровно та сумма, что ушла из кассы и ждёт продажи. Нарочно не stock():
// stock() — во сколько трюм оценивает рынок сегодня, invested() — сколько за него
// заплачено; разница между ними и есть незафиксированная прибыль или убыток.
const invested=()=>GOODS.reduce((s,g)=>s+cst(g.id),0);
// постоянная надбавка золотого контракта — та же лестница наград по сложности
const goldPerm=()=>GOLD_PERM*rewardMul();
const upCost=()=>[1800,5000,13000,30000][S.up]||null;
// коэффициент .7 (было 7) компенсирует то, что held() теперь в 10 раз больше
// из-за перевода объёма в целые «пуды» — иначе фрахт вырос бы в те же 10 раз
const freight=()=>Math.round((30+.7*held())*P.freight*(1-bf('fr')));
const idleFee=()=>Math.max(10,Math.round(freight()*.25));
// quiet — не писать строку в телеметрию: так помечены записи, которые придут туда
// вторым концом (announce() пишет один и тот же текст и в журнал, и в тост, и
// логировать его дважды незачем — см. announce в ui.js).
// Заплатить, а чего не хватит — записать в долг. Ровно так игра уже поступает с фрахтом:
// «не хватило на расходы, $X записано в долг». Без этого любое предложение проходило мимо
// разумного игрока: тот держит кассу в нуле, чтобы не переплачивать процент, и в момент
// встречи с торговцем у него на руках всегда ноль (нашёл Сергей).
function payOrBorrow(sum,why){
  if(sum<=0)return 0;
  const fromCash=Math.min(S.cash,sum),toDebt=Math.round(sum-fromCash);
  S.cash-=fromCash;
  if(toDebt>0){
    S.debt+=toDebt;stat('borrowed',toDebt);
    note(L.msg.borrowForced(toDebt,why),'neg');
    tel('borrow_forced','$'+toDebt+' ('+why+')');
  }
  return toDebt;
}
function note(t,c,quiet){
  S.log.unshift({d:S.day,t:t,c:c||''});if(S.log.length>70)S.log.pop();
  if(!quiet)tel('note',t);
}
// Лента новостей мира: события цен и молва. Ровно те же тексты, что уходят в журнал
// и в панель «Молва», но собранные в одном месте — бегущей строкой над графиком.
// Причина: событие «Обвал в штольне, цена на олово резко выросла» — это самое
// интересное, что происходит в игре само по себе, и до сих пор его можно было
// увидеть только СЛУЧАЙНО, дочитав журнал до нужной строки (нашёл Сергей, 20.08).
// kind: 'ev' — событие цен, 'rum' — молва; trust нужен молве, чтобы бегущая строка
// подписывала надёжность ровно так же, как панель «Молва», и они не разъезжались.
function news(t,kind,trust){
  if(!S)return;
  S.news=S.news||[];
  S.news.unshift({d:S.day,t:t,k:kind||'',tr:trust?1:0});
  while(S.news.length>6)S.news.pop();
}
function fakeRisk(g){
  const G=good(g);if(!G.fake)return 0;
  const a=ask(g);if(!a)return 0;
  return Math.max(0,Math.min(.5,G.fake*(1-a/G.base)-bf('fake')));
}
const FREE=()=>Math.max(3,Math.round(capacity()*.25));
const SLOPE=()=>Math.max(24,capacity()*1.6);
const lotCap=()=>Math.max(1,Math.floor(capacity()*P.lot));

function rollAll(){
  S.raw={};
  MKTS.forEach(m=>{
    S.raw[m.n]={};
    GOODS.forEach(g=>{
      if(Math.random()<.06){S.raw[m.n][g.id]=null;return}
      let p=g.base*bias[m.n][g.id]*rnd(m.wild?.65:.8,m.wild?1.45:1.24);
      const r=Math.random();
      if(r<.05)p*=rnd(1.8,2.7); else if(r<.1)p*=rnd(.4,.58);
      if(S.event&&S.event.g===g.id&&S.event.m===m.n)p*=S.event.k;
      S.raw[m.n][g.id]=Math.max(1,p);
    });
  });
  // обучение: цены в уроке не случайны, их задаёт сценарий (см. tutorial.js).
  // Затираем ДО того, как ниже запишется история наблюдений, — иначе на графике
  // остались бы случайные числа, которых игрок в ведомости не видел
  if(inTut())tutPrices();
  GOODS.forEach(g=>{
    const b=bid(g.id);
    if(b){
      seen[S.mkt][g.id]={p:b,d:S.day};
      S.hist[S.mkt][g.id]=S.hist[S.mkt][g.id]||[];
      S.hist[S.mkt][g.id].push({d:S.day,p:b});
    }
  });
  // Тайный полный журнал цен: пишем КАЖДЫЙ день по ВСЕМ рынкам, а не только по тому,
  // где стоит игрок. Сам он этого не видит — фог войны остаётся как был, — но именно
  // отсюда берётся то, что продают бедуин и бродячий трейдер: настоящая история,
  // а не выдумка задним числом, поэтому она не разойдётся с тем, что игрок увидит сам.
  if(!S.histAll)S.histAll={};
  MKTS.forEach(m=>{
    S.histAll[m.n]=S.histAll[m.n]||{};
    GOODS.forEach(g=>{
      const p=bidAt(g.id,S.imp[m.n]?S.imp[m.n][g.id]:1,m.n);
      if(!p)return;
      S.histAll[m.n][g.id]=S.histAll[m.n][g.id]||[];
      S.histAll[m.n][g.id].push({d:S.day,p:p});
    });
  });
}
// Открыть игроку историю по товару на всех рынках: копим её всегда (histAll),
// а по покупке переносим в S.hist — дальше это обычный график, который ничем
// не отличается от увиденного своими глазами.
function revealLore(gid){
  if(!S.histAll)return 0;
  let added=0;
  MKTS.forEach(m=>{
    const src=(S.histAll[m.n]||{})[gid]||[];
    S.hist[m.n]=S.hist[m.n]||{};
    const have=S.hist[m.n][gid]||[],days={};
    have.forEach(x=>days[x.d]=1);
    const merged=have.concat(src.filter(x=>!days[x.d]));
    merged.sort((a,b)=>a.d-b.d);
    added+=merged.length-have.length;
    S.hist[m.n][gid]=merged;
  });
  S.lore=S.lore||{};S.lore[gid]=1;
  return added;
}
const loreCost=g=>Math.round((200+25*S.day)*(good(g).base>500?1.6:1));
// Точка «сегодня» на графике пишется один раз в rollAll() (в начале дня) и потом
// не двигается сама — после сделки цена уже другая (влияние на объём), а график
// об этом молчит до следующего дня. Обновляем последнюю точку текущего дня на
// актуальную bid-цену сразу после покупки/продажи — новую точку не добавляем,
// один день — одна точка.
function refreshHistToday(g){
  const arr=S.hist[S.mkt]&&S.hist[S.mkt][g];
  if(!arr||!arr.length)return;
  const last=arr[arr.length-1];
  if(last.d!==S.day)return;
  const b=bid(g);
  if(b)last.p=b;
}
// Точка балансового графика за сегодня. Вызывается из draw(), поэтому
// перезаписывается после каждой сделки — сегодняшний столбик живой, прошедшие дни
// заморожены. Отдельная история, а не выкладка из S.tel: телеметрия пишет события,
// а тут нужен ровный ряд «одно значение на день», в том числе за дни без действий.
function refreshBalToday(){
  if(!S.bal)S.bal=[];
  const last=S.bal[S.bal.length-1];
  const inv=Math.round(invested());
  if(last&&last.d===S.day){last.cash=S.cash;last.debt=S.debt;last.inv=inv}
  else S.bal.push({d:S.day,cash:S.cash,debt:S.debt,inv:inv});
}
function profile(m){
  const s=GOODS.map(g=>({g:g,b:bias[m][g.id]})).sort((x,y)=>x.b-y.b);
  return{cheap:s[0].g.n,dear:s[s.length-1].g.n};
}
function todayBest(){
  let lo=null,hi=null;
  GOODS.forEach(g=>{
    const r=rawAt(S.mkt,g.id);if(!r)return;
    const k=r/g.base;
    if(!lo||k<lo.k)lo={k:k,n:g.n};
    if(!hi||k>hi.k)hi={k:k,n:g.n};
  });
  return{lo:lo,hi:hi};
}

// Без этого счётчика первые FREE() мест бесплатны на КАЖДЫЙ отдельный клик — значит,
// раздробив крупную сделку на продажи по одной единице, можно было вообще не двигать
// цену (баг v9, пойман спамом кнопки «Продать 1»). Теперь свобода считается за весь день.
const volOf=(g)=>(S.vol[S.mkt]&&S.vol[S.mkt][g])||0;
// Потолок влияния на цену покупки. Был 1.35 — и в него упиралась КАЖДАЯ заливка трюма
// (замер: 35 заливок из 35 на всех весах товара). После потолка любое количество
// докупалось по одной и той же цене: в log-13 канаты шли x56 по 67, потом x14, x3, x1, x1
// ровно по 82 — то есть «партия» переставала быть партией, объём переставал двигать цену,
// и открывалось ровно то, от чего оберегает принцип 10 — плоский участок, который выгодно
// доить. 1.7 подобран замером: полная заливка трюма одним товаром разгоняет цену до
// 1.60–1.62 на любом bulk, то есть в потолок в живой игре не упираются вовсе, и он
// остаётся тем, чем должен быть, — страховкой от абсурда, а не рабочим режимом.
const IMP_CAP=1.7;
// Зеркало потолка на продаже. Был 0,72 — и в него, ровно как в потолок на покупке,
// упиралась КАЖДАЯ распродажа полного трюма (35 из 35 в замере): дальше в рынок можно
// было валить сколько угодно по одной и той же цене. 0,55 подобран тем же замером —
// полная распродажа роняет цену до 0,56–0,58 на любом bulk, то есть пола в живой игре
// не достают. Кнопка «Всё» по-прежнему продаёт весь трюм одним нажатием: пол трогает
// цену хвоста, а не количество за клик (требование Сергея, проверено тестом).
const IMP_FLOOR=.55;
function quoteBuy(g,want){
  if(!rawAt(S.mkt,g)||want<1)return{n:0,sum:0,imp:S.imp[S.mkt][g]};
  const G=good(g);
  let imp=S.imp[S.mkt][g],sum=0,n=0;
  const byRoom=Math.floor(room()/G.bulk),byLot=Math.floor(lotCap()/G.bulk);
  const lim=Math.min(want,byRoom,Math.max(1,byLot)),free=FREE(),sl=SLOPE(),already=volOf(g);
  while(n<lim){
    const p=askAt(g,imp);
    if(sum+p>S.cash)break;
    sum+=p;n++;
    if((already+n)*G.bulk>free)imp=Math.min(IMP_CAP,imp*(1+G.bulk/sl));
  }
  return{n:n,sum:sum,imp:imp,vol:already+n};
}
// Сколько берёт кнопка «Партия» (бывшая «Макс»). Нарочно НЕ всё, что влезает: одно нажатие не должно
// разом разгонять цену и забивать весь трюм одним товаром. Берём три четверти
// возможного — остаток добирается повторными нажатиями, и на каждом видно, как
// растёт цена (разбор с Сергеем, 2026-08-18). Последнюю единицу отдаём целиком,
// иначе на остатке в 1 шт. кнопка выдавала бы ноль и выглядела сломанной.
const MAX_FILL=.75;
function maxBuyQty(g){
  const full=quoteBuy(g,9999).n;
  return full>1?Math.max(1,Math.floor(full*MAX_FILL)):full;
}
function quoteSell(g,want){
  const G=good(g),have=qty(g);
  if(want<1||!have)return{n:0,sum:0,imp:S.imp[S.mkt][g]};
  let imp=S.imp[S.mkt][g],sum=0,n=0;
  const free=FREE(),sl=SLOPE(),already=volOf(g);
  if(!rawAt(S.mkt,g)){
    const dp=Math.max(1,Math.round(G.base*.5*boostMul(g)));
    const k=Math.min(want,have);
    return{n:k,sum:dp*k,imp:imp,distress:1};
  }
  while(n<Math.min(want,have)){
    sum+=bidAt(g,imp);n++;
    if((already+n)*G.bulk>free)imp=Math.max(IMP_FLOOR,imp*(1-1.15*G.bulk/sl));
  }
  return{n:n,sum:sum,imp:imp,vol:already+n};
}

/* ============ услуги ============ */
// Доля возмещения одним числом: раньше «60%» жило текстом в кнопке, в описании
// и в формуле порознь — разъехались бы при первой же правке баланса.
const INS_BACK=.6;
const INS_DAYS=5;
const insCost=()=>Math.max(200,Math.round(invested()*.06));
function insure(){
  const c=insCost();
  if(S.cash<c||!held()||S.ins>=S.day)return;
  // Полис покрывает груз, который лежал в трюме В МОМЕНТ покупки, а не всё, что игрок
  // потом успеет докупить. Иначе выгодно было страховаться на пустой трюм за минимальные
  // $200 и набивать его после — премия считается от стоимости груза, и такой обход
  // делал страховку почти бесплатной (нашёл Сергей). S.insLeft — остаток покрытия:
  // выплаты уменьшают его, исчерпался — полис больше ничего не вернёт.
  S.cash-=c;S.ins=S.day+INS_DAYS;S.insSum=Math.round(invested());S.insLeft=S.insSum;
  S.everInsured=1;stat('serv',c);snd('click');
  note(L.msg.insured(S.insSum,daysLeft(S.ins),c),'');
  tel('insure','$'+c+' страховая сумма $'+S.insSum);draw();
}
// silent — не писать свою строку в журнал: вызывающий скажет про возмещение сам,
// в том же сообщении, где говорит о потере (бедствие). Возвращает выплату, чтобы
// её можно было назвать в этом сообщении.
function insurePay(loss,why,silent){
  if(!(S.ins>=S.day)||loss<=0)return 0;
  if(S.insLeft===undefined)S.insLeft=S.insSum===undefined?loss:S.insSum; // полис из старого сохранения
  const pay=Math.min(Math.round(loss*INS_BACK),Math.max(0,Math.round(S.insLeft)));
  if(pay<=0)return 0;
  S.insLeft-=pay;S.cash+=pay;stat('insBack',pay);
  if(!silent)note(L.msg.insPay(pay,why,S.insLeft<=0),'pos');
  return pay;
}
// Разовая покупка на весь заход (не продлевается, в отличие от страховки) —
// скоропорт в трюме перестаёт сыреть вовсе, а не просто частично возмещается
// после потери (страховка покрывает только 60% от стоимости уже потерянного)
const TAR_COST=8000;
function buyTar(){
  if(S.tarBarrels||S.cash<TAR_COST||!!S.over)return;
  S.cash-=TAR_COST;S.tarBarrels=1;stat('serv',TAR_COST);snd('good');
  announce(L.msg.tarTitle,L.msg.tarBought(TAR_COST),'good');
  tel('tar_barrels','$'+TAR_COST);draw();
}
// Дальний тракт и быстрые кони — разовые вложения, как смоляные бочки, но не в сохранность
// груза, а во время. Тракт превращает три переезда в два дня, кони — два дня в один.
// Продаются только там, где в них есть смысл: тракт — где он вообще предусмотрен
// и ещё не открыт, кони — где тракт уже открыт (иначе сокращать нечего).
const roadForSale=()=>!!(P.longRoad===1&&S&&!S.road);
const horsesForSale=()=>!!(roadOpen()&&S&&!S.horses);
function buyRoad(){
  if(!roadForSale()||S.cash<ROAD_COST||!!S.over)return;
  S.cash-=ROAD_COST;S.road=1;stat('serv',ROAD_COST);
  buildMarkets(); // тракт появляется на карте и в списке переездов сразу
  announce(L.msg.roadTitle,L.msg.roadBought(ROAD_COST),'good');
  snd('good');tel('road_buy','$'+ROAD_COST);draw();
}
function buyHorses(){
  if(!horsesForSale()||S.cash<HORSE_COST||!!S.over)return;
  S.cash-=HORSE_COST;S.horses=1;stat('serv',HORSE_COST);
  announce(L.msg.horsesTitle,L.msg.horsesBought(HORSE_COST),'good');
  snd('good');tel('horses_buy','$'+HORSE_COST);draw();
}
// Подделки бывают только у элитных товаров (поле `fake` есть лишь у POOL.elite),
// и проверять лот второй раз незачем. Отсюда две величины: сколько единиц в трюме
// вообще могут оказаться подделкой и во сколько эта часть груза обошлась. Раньше
// оценщик брал 3% со ВСЕГО трюма и звался даже тогда, когда проверять было нечего —
// то есть предлагал платить за услугу, которая заведомо ничего не найдёт.
const suspectLots=()=>{
  const out=[];
  GOODS.forEach(g=>{if(g.fake)lots(g.id).forEach(l=>{if(!l.checked&&l.q>0)out.push(l)})});
  return out;
};
const suspectQty=()=>suspectLots().reduce((s,l)=>s+l.q,0);
const suspectCost=()=>suspectLots().reduce((s,l)=>s+l.c,0);
const apCost=()=>Math.max(150,Math.round(suspectCost()*.03*(1-bf('ap'))));
function appraise(){
  const c=apCost();
  if(S.cash<c||!suspectQty())return;
  S.cash-=c;S.everAppraised=1;let total=0;
  GOODS.forEach(g=>{
    const arr=lots(g.id);
    arr.forEach(l=>{
      l.checked=1;
      if(l.fk>0){
        const costOut=l.c*l.fk/l.q;
        l.c-=costOut;l.q-=l.fk;total+=l.fk;
        S.exposed[g.id]=(S.exposed[g.id]||0)+l.fk;l.fk=0;
      }
    });
    S.lots[g.id]=arr.filter(l=>l.q>0);
  });
  note(L.msg.apDone(c,total),total?'neg':'pos',true); // в телеметрии уже есть toast и appraise
  // тост всегда, даже когда подделок нет: услуга платная, и без ответа игрок
  // не понимает, отработал оценщик или клик вообще не прошёл
  if(total){
    toast(L.msg.apFoundTitle(total),L.msg.apFoundSub);snd('bad');
    S.fakesFound+=total;if(S.fakesFound>=5)grant('a7');
  }else{
    toast(L.msg.apCleanTitle,L.msg.apCleanSub(c),'good');snd('good');
  }
  tel('appraise','$'+c+' подделок:'+total);draw();
}
