/* ============ телефон: оболочка с вкладками ============
   ЧТО ЭТО. Второе место, которое рисует DOM (первые два — render.js и
   tutorial-ui.js). Договорено с Сергеем 26.08: на телефоне игра раскладывается
   не одной колонкой в пять с лишним экранов, а по листам с полосой вкладок внизу.

   ГЛАВНОЕ ПРО УСТРОЙСТВО. Здесь НЕТ второго рисовальщика игры. Всё содержимое
   по-прежнему считает и строит render.js, а этот файл только РАСКЛАДЫВАЕТ уже
   готовые секции по вкладкам и показывает одну из них. Секции подписаны в разметке
   ещё с самого начала (data-sec="chart|ledger|duty|contracts|log|debt|office|roads"),
   поэтому переезд — это перестановка узлов, а не копия кода. Отсюда два важных
   следствия: id-шники не меняются (значит, подсветка шагов обучения продолжает
   находить свои элементы), и любая правка в render.js автоматически видна на
   телефоне — расходиться двум версиям экрана просто нечем.

   Что этот файл всё-таки рисует сам: полосу вкладок, кнопку долга в шапке, шторку
   кредитора и лист «Трюм» (в десктопной раскладке отдельного трюма нет — там
   партии живут колонкой внутри ведомости, а на телефоне колонок нет).

   На широком экране всё это выключено: phoneShell() при !PHONE() разбирает
   оболочку обратно и возвращает переставленные узлы на их места. */

const PHONE=()=>NARROW();   // один порог с CSS (560px), см. NARROW в render.js

let phTab='market';      // какой лист открыт
let phChartOpen=1;       // график цен развёрнут
let phSheetOpen=0;       // шторка кредитора
let phMounted=0;
let phPrev='market';   // куда возвращает «Вернуться к игре» с листа настроек

/* Листы и что на них лежит. Услуги конторы разъезжаются по смыслу: страховка,
   оценщик, дёготь и расширение трюма — к грузу, тракт и кони — к дорогам
   (иначе «Контора» была бы чуланом, куда сложено всё, что некуда деть). */
// Шестерёнка рисуется, а не берётся готовым значком: системная ⚙ приезжает
// эмодзи-шрифтом и выглядит чужой среди типографских знаков остальных вкладок.
const PH_GEAR='<svg viewBox="0 0 24 24" width="17" height="17" fill="none" '+
  'stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true">'+
  '<circle cx="12" cy="12" r="3.3"/>'+
  '<path d="M12 2.8v2.6M12 18.6v2.6M21.2 12h-2.6M5.4 12H2.8'+
  'M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8M18.5 18.5l-1.8-1.8M7.3 7.3L5.5 5.5"/></svg>';
const PH_TABS=[
  {id:'market',g:'§',t:()=>L.ph.market,secs:['chart','ledger']},
  {id:'hold',  g:'▤',t:()=>L.ph.hold,  secs:['phold','office','phboost']},
  {id:'roads', g:'◈',t:()=>L.ph.roads, secs:['roads']},
  {id:'deals', g:'✎',t:()=>L.ph.deals, secs:['duty','contracts','log']},
  {id:'set',   g:PH_GEAR,t:()=>L.ph.settings,secs:['phset']}
];
const PH_ROAD_BTNS=['road','horses'];   // эти кнопки конторы переезжают к дорогам

// Переставленные узлы помним вместе с их прежним местом: на широком экране
// оболочка разбирается, и всё обязано вернуться ровно туда, где было.
let phMoved=[];
function phMove(node,to){
  if(!node||!to||node.parentNode===to)return;
  phMoved.push([node,node.parentNode,node.nextSibling]);
  to.appendChild(node);
}
function phRestore(){
  phMoved.forEach(m=>{try{m[1].insertBefore(m[0],m[2])}catch(e){}});
  phMoved=[];
}

function phSec(name){return document.querySelector('[data-sec="'+name+'"]')}

/* ============ сборка оболочки ============ */
function phMount(){
  if(phMounted)return;
  const root=el('root');if(!root)return;
  root.classList.add('ph');

  // кнопка долга в шапке — она же вход в «Кредитора». Долг весь заход висит
  // на экране, и нажать именно на него, чтобы поговорить с кредитором, читается
  // само; поэтому пятой вкладки нет (решение Сергея, 26.08)
  const head=root.querySelector('.dk-head');
  if(head&&!el('ph-debt')){
    const b=document.createElement('button');
    b.id='ph-debt';b.className='ph-debt';b.type='button';
    b.innerHTML='<span class="l"><span class="k"></span><span class="v"></span></span>'+
                '<span class="r"><span class="w"></span><span class="c">▾</span></span>';
    b.onclick=()=>{snd('click');phSetSheet(!phSheetOpen)};
    head.appendChild(b);
  }

  // лист «Трюм»: своей секции в разметке нет, потому что на десктопе трюм —
  // это колонка внутри ведомости. Заводим её здесь и наполняем в phHold()
  if(!el('ph-hold')){
    const sec=document.createElement('div');
    sec.className='dk-section';sec.id='ph-hold';sec.setAttribute('data-sec','phold');
    const body=root.querySelector('.dk-body');
    if(body)body.insertBefore(sec,body.firstChild);
  }

  // Надбавки — своя секция, а не хвост «Конторы»: это не то, что покупают,
  // а то, что заработали контрактами, и в одном списке с услугами оно читалось
  // как ещё одна платная строка (Сергей, 30.08). Сам блок не копируется —
  // переезжает узел #boosts, который наполняет render.js
  if(!el('ph-boost')){
    const sec=document.createElement('div');
    sec.className='dk-section';sec.id='ph-boost';sec.setAttribute('data-sec','phboost');
    sec.innerHTML='<div class="dk-legend"><span class="ph-boost-h"></span></div>';
    const body=root.querySelector('.dk-body');
    if(body)body.insertBefore(sec,body.firstChild);
  }
  phMove(el('boosts'),el('ph-boost'));

  // лист настроек: содержимое собирает settingsBody() из render.js — тот же код,
  // что и во всплывающих настройках на компьютере
  if(!el('ph-set')){
    const sec=document.createElement('div');
    sec.className='dk-section ph-set';sec.id='ph-set';sec.setAttribute('data-sec','phset');
    const body=root.querySelector('.dk-body');
    if(body)body.insertBefore(sec,body.firstChild);
  }

  // шторка кредитора: сама панель не копируется, а переезжает сюда целиком
  if(!el('ph-sheet')){
    const dim=document.createElement('div');
    dim.id='ph-dim';dim.className='ph-dim';
    dim.onclick=()=>phSetSheet(0);
    const sh=document.createElement('div');
    sh.id='ph-sheet';sh.className='ph-sheet';
    sh.innerHTML='<div class="ph-grip"></div><div class="ph-sheet-h"></div>';
    const inner=document.createElement('div');
    inner.className='ph-sheet-in';inner.id='ph-sheet-in';
    sh.appendChild(inner);
    root.appendChild(dim);root.appendChild(sh);
    // по шапке шторки тоже закрываем: «потянуть вниз» на живом пальце работает,
    // а мышью в отладке — нет, и это единственный способ её закрыть без жеста
    sh.querySelector('.ph-grip').onclick=()=>phSetSheet(0);
  }
  phMove(phSec('debt'),el('ph-sheet-in'));

  // тракт и кони — к дорогам: обе услуги про дорогу, и думают о них там же
  const roads=phSec('roads');
  PH_ROAD_BTNS.forEach(id=>phMove(el(id),roads));

  // полоса вкладок
  if(!el('ph-tabs')){
    const nav=document.createElement('nav');
    nav.id='ph-tabs';nav.className='ph-tabs';
    PH_TABS.forEach(t=>{
      const b=document.createElement('button');
      b.type='button';b.className='ph-tab';b.setAttribute('data-tab',t.id);
      b.innerHTML='<span class="gl">'+t.g+'</span><span class="n"></span><span class="dot"></span>';
      b.onclick=()=>{snd('click');phSetTab(t.id)};
      nav.appendChild(b);
    });
    root.appendChild(nav);
  }

  // строка над графиком: свернуть/развернуть. Свёрнутый график освобождает
  // два товара в ведомости, развёрнутый — то, ради чего вообще ездят
  const chart=phSec('chart');
  if(chart&&!el('ph-chartbar')){
    const bar=document.createElement('button');
    bar.id='ph-chartbar';bar.className='ph-chartbar';bar.type='button';
    bar.innerHTML='<span class="t"></span><span class="x"></span>';
    bar.onclick=()=>{phChartOpen=!phChartOpen;snd('click');phoneShell()};
    chart.insertBefore(bar,chart.firstChild);
  }
  phMounted=1;
}

function phUnmount(){
  if(!phMounted)return;
  const root=el('root');
  phRestore();
  ['ph-debt','ph-tabs','ph-sheet','ph-dim','ph-hold','ph-set','ph-boost','ph-chartbar'].forEach(id=>{
    const n=el(id);if(n)n.remove();
  });
  if(root){
    root.classList.remove('ph','ph-sheet-on');
    root.querySelectorAll('.ph-hide').forEach(n=>n.classList.remove('ph-hide'));
    root.querySelectorAll('.ph-open').forEach(n=>n.classList.remove('ph-open'));
  }
  phMounted=0;
}

/* ============ переключения ============ */
function phSetTab(id){
  if(id!==phTab)phPrev=phTab;
  phTab=id;
  if(id==='set')phSettings();
  if(phSheetOpen)phSetSheet(0);
  phoneShell();
  // новый лист начинается сверху: иначе, переключившись с длинных «Дел»,
  // попадаешь в середину ведомости и не понимаешь, где ты
  try{window.scrollTo(0,0)}catch(e){}
}
function phSetSheet(on){
  phSheetOpen=on?1:0;
  const root=el('root');
  if(root)root.classList.toggle('ph-sheet-on',!!phSheetOpen);
}
// Обучение подсвечивает элемент по селектору — если он на другом листе, лист
// надо открыть, иначе шаг показывает в пустоту (tutorial-ui.js зовёт это перед
// прокруткой к цели)
function phoneReveal(node){
  if(!PHONE()||!node||!node.closest)return;
  if(node.closest('.ph-sheet')){phSetSheet(1);return}
  const sec=node.closest('[data-sec]');
  if(!sec)return;
  const name=sec.getAttribute('data-sec');
  const tab=PH_TABS.filter(t=>t.secs.indexOf(name)>=0)[0];
  if(tab&&tab.id!==phTab)phSetTab(tab.id);
}

/* ============ лист «Трюм» ============
   Здесь и только здесь видно то, чего не показывает ведомость: возраст партий,
   среднюю закупку по каждому товару, сколько выйдет, если продать всё прямо
   здесь, и отвал с разоблачёнными подделками. */
function phHold(){
  const box=el('ph-hold');if(!box||!S)return;
  const cap=capacity();
  let h='<div class="dk-legend"><span>'+L.ph.holdHead(Math.round(held()),cap)+'</span></div>';
  const mine=GOODS.filter(g=>qty(g.id)>0||expCount(g.id)>0);
  if(!mine.length)h+='<p class="ph-empty">'+L.ph.holdEmpty+'</p>';
  mine.forEach(g=>{
    const q=qty(g.id),mest=Math.round(q*g.bulk),b=bid(g.id);
    h+='<div class="ph-lot">';
    h+='<div class="h"><b>'+g.n+'</b><span>'+(q?L.ph.holdQty(q,mest):'')+'</span></div>';
    if(q){
      const ls=lots(g.id);
      if(g.rot)h+='<div class="l">'+L.ph.holdLots(ls.map(l=>L.tbl.lot(l.q,l.age)).join(', '))+'</div>';
      h+='<div class="p">'+(b?L.ph.holdAvg(avg(g.id),b):L.ph.holdNoBid)+'</div>';
      if(b){
        const qs=quoteSell(g.id,q),gain=qs.n?Math.round(qs.sum-cst(g.id)):0;
        h+='<div class="g'+(gain>=0?' up':' dn')+'">'+L.ph.holdGain(gain)+'</div>';
      }
    }
    if(expCount(g.id)>0){
      h+='<div class="x">'+L.tbl.exposed(expCount(g.id))+
         '<button class="exp-btn" type="button" data-g="'+g.id+'">'+
         L.tbl.disposeBtn(disposeVal(g.id))+'</button></div>';
    }
    h+='</div>';
  });
  box.innerHTML=h;
  box.querySelectorAll('.exp-btn').forEach(n=>n.addEventListener('click',e=>{
    e.stopPropagation();disposeExposed(n.getAttribute('data-g'));
  }));
}

/* ============ лист настроек ============
   Пятая вкладка вместо шестерёнки в шапке (решение Сергея, 29.08). Содержимое —
   ровно то же, что во всплывающих настройках на компьютере: собирается общей
   settingsBody(). Телефон добавляет к нему «Журнал» и «Меню» — на компьютере они
   живут в подвале, а подвала здесь нет, его место заняла полоса вкладок. */
function phSettings(){
  const box=el('ph-set');if(!box)return;
  box.innerHTML='';
  const mk=(txt,fn)=>{
    const b=document.createElement('button');b.className='wide';
    b.textContent=txt;b.onclick=()=>{snd('click');fn()};return b;
  };
  const stamp=document.createElement('div');
  stamp.className='dk-note ph-build';stamp.textContent=L.ui.build+' '+BUILD;
  settingsBody(box,phSettings,()=>phSetTab(phPrev==='set'?'market':phPrev),
    [mk(L.ui.logBtn,()=>{tel('export','');exportLog()}),mk(L.ui.menuBtn,menu),stamp]);
  // на телефоне это не «закрыть окно», а «уйти с листа» — и называться должно так
  box.querySelectorAll('.dk-set-close').forEach(b=>{b.textContent=L.ph.backTo});
}

/* ============ строка товара на телефоне ============
   «Партия» переезжает в строку счётчика — туда, где выбирают количество, и где
   рядом с полем всё равно пусто. Освобождается целый ряд кнопок: карточка была
   в четыре этажа (счётчик, купить/партия, продать/всё) при том, что половина
   кнопок у большинства товаров мертва. */
function phRows(){
  const tb=el('rows');if(!tb)return;
  [].slice.call(tb.querySelectorAll('tr')).forEach(tr=>{
    const lot=tr.querySelector('.lot-btn'),step=tr.querySelector('.qstep');
    if(lot&&step&&lot.parentNode!==step)step.appendChild(lot);
    // Товар, которого здесь не купить и нет в трюме, — это строка с ценами,
    // а не форма: счётчик и мёртвые кнопки занимают треть экрана и не делают
    // ничего. Но прячем их ТОЛЬКО когда товар тут вообще не торгуется — в ценах
    // так и написано. Первая версия прятала кнопки по «все они выключены», и под
    // это попадал дорогой товар, на который просто не хватает денег: игрок видел
    // «Часы» без единой кнопки и решал, что их не продают (Сергей, 30.08).
    // «Мало денег» — сообщение, и оно должно остаться на кнопке.
    const nm=tr.querySelector('.dk-name'),id=nm&&nm.getAttribute('data-g');
    const traded=id&&typeof rawAt==='function'&&!!rawAt(S.mkt,id);
    tr.classList.toggle('ph-dead',!!id&&!traded&&qty(id)<1);
  });
}

/* ============ главное: собрать/обновить ============
   Зовётся последней строкой draw(). */
function phoneShell(){
  if(typeof document==='undefined')return;
  if(!PHONE()){phUnmount();return}
  phMount();
  if(!S)return;

  // кнопка долга
  const db=el('ph-debt');
  if(db){
    const r=rateFor(S.day);
    db.querySelector('.k').textContent=L.ui.debt+' · '+fixed(r*100,1)+L.ui.perDay;
    db.querySelector('.v').textContent=money(S.debt);
    db.querySelector('.w').textContent=L.ph.creditor;
    db.classList.toggle('paid',S.debt<=0);
  }

  // подписи вкладок и точка «есть новое» на «Делах»
  const news=(S.rumNew>0)||S.contracts.some(c=>c.state==='offer');
  PH_TABS.forEach(t=>{
    const b=document.querySelector('.ph-tab[data-tab="'+t.id+'"]');
    if(!b)return;
    b.querySelector('.n').textContent=t.t();
    b.classList.toggle('on',t.id===phTab);
    b.querySelector('.dot').style.display=(t.id==='deals'&&news)?'block':'none';
  });

  // какие секции показывать
  const show=(PH_TABS.filter(t=>t.id===phTab)[0]||PH_TABS[0]).secs;
  ['chart','ledger','phold','office','phboost','roads','duty','contracts','log','phset','debt'].forEach(name=>{
    const sec=phSec(name);if(!sec)return;
    // «Кредитор» живёт в шторке и вкладкам не подчиняется
    if(name==='debt')return;
    sec.classList.toggle('ph-hide',show.indexOf(name)<0);
  });

  // график: строка-переключатель и свёрнутое состояние
  const chart=phSec('chart'),bar=el('ph-chartbar');
  if(chart&&bar){
    const g=chartGood===BAL?L.ui.chartBalance:(good(chartGood)?good(chartGood).n:'');
    bar.querySelector('.t').textContent=L.ph.chartOne(g);
    bar.querySelector('.x').textContent=(phChartOpen?'▴ '+L.ph.collapse:'▾ '+L.ph.expand);
    chart.classList.toggle('ph-chart-off',!phChartOpen);
  }

  phHold();
  phRows();
  const bh=document.querySelector('.ph-boost-h');
  if(bh)bh.textContent=L.ph.boosts;

  // Высота шапки нужна двум местам в CSS: шторка кредитора выезжает ровно из-под
  // неё, а тело листа тянется на весь оставшийся экран (иначе красная линия поля
  // обрывается там, где кончился короткий лист, — Сергей, 28.08). Шапка переносится
  // по строкам и высоту меняет, поэтому меряем её, а не забиваем числом.
  el('root').setAttribute('data-ph-tab',phTab);
  const head=el('root').querySelector('.dk-head');
  if(head)el('root').style.setProperty('--ph-head',head.offsetHeight+'px');
}
