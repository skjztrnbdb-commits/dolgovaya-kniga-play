/* ============ вид (DOM) ============
   Единственный модуль, который трогает document: карта, график, таблица рынка,
   главное меню и панель достижений. При переносе на другой язык/платформу
   это единственный файл, который переписывается целиком заново. */
/* ============ отрисовка ============ */
function drawMap(){
  const xs=MKTS.map(m=>POS[m.n][0]),ys=MKTS.map(m=>POS[m.n][1]);
  // поля по бокам считаем под самую длинную подпись рынка: при 34 «Верхний рынок»
  // упирался в край и терял последнюю букву
  const x0=Math.min.apply(null,xs)-52,x1=Math.max.apply(null,xs)+52;
  const y0=Math.min.apply(null,ys)-22,y1=Math.max.apply(null,ys)+22;
  let s='<svg class="dk-map" viewBox="'+x0+' '+y0+' '+(x1-x0)+' '+(y1-y0)+'" xmlns="http://www.w3.org/2000/svg">';
  EDGES.forEach(e=>{
    if(!NB[e[0]]||!NB[e[1]])return;
    const a=POS[e[0]],b=POS[e[1]];
    s+='<line class="lk" x1="'+a[0]+'" y1="'+a[1]+'" x2="'+b[0]+'" y2="'+b[1]+'"/>';
  });
  // дальний тракт рисуем иначе, чем обычные дороги: пунктир и подпись «2 дня» —
  // на карте должно быть видно, что этот путь другой, до того как игрок нажмёт
  LONG_EDGES.forEach(e=>{
    if(!NB[e[0]]||NB[e[0]].indexOf(e[1])<0)return;
    const a=POS[e[0]],b=POS[e[1]],mx=(a[0]+b[0])/2,my=(a[1]+b[1])/2;
    s+='<line class="lk long" x1="'+a[0]+'" y1="'+a[1]+'" x2="'+b[0]+'" y2="'+b[1]+'"/>'+
       '<rect x="'+(mx-15)+'" y="'+(my-6)+'" width="30" height="11" fill="#E9EEE4" opacity=".92"/>'+
       '<text x="'+mx+'" y="'+(my+2.5)+'" text-anchor="middle" class="road">'+L.misc.mapDays(e[2])+'</text>';
  });
  MKTS.forEach(m=>{
    const p=POS[m.n],l=LBL[m.n],cur=m.n===S.mkt,nb=NB[S.mkt].indexOf(m.n)>=0&&!S.over;
    const shape=MSHAPE[m.n]||'circle';
    s+='<g class="'+(nb?'hit':'')+'" data-m="'+m.n+'">'+
       shapeSVG(shape,p[0],p[1],cur?7:5,'class="mk-shape'+(cur?' cur':'')+'"')+
       '<text x="'+l[0]+'" y="'+l[1]+'" text-anchor="'+l[2]+'" class="'+(cur?'cur':'')+'">'+mname(m.n)+'</text></g>';
  });
  el('map').innerHTML=s+'</svg>';
  el('map').querySelectorAll('g.hit').forEach(g=>g.addEventListener('click',()=>travel(g.getAttribute('data-m'))));
}

// Доля в проценты со знаком: +7% / −18%. Нужен именно знак, а не всегда «+»,
// с тех пор как появились отрицательные модификаторы (сорванное предписание).
// Минус — типографский (−), а не дефис.
function sgn(v){const p=Math.round(v*100);return (p<0?'−':'+')+Math.abs(p)+'%'}
// Подписи дней на оси: первый, последний, промежуточные круглыми шагами и «сегодня»
// отдельным жирным номером. Если «сегодня» попадает вплотную к готовой отметке —
// сливаем их в одну, иначе подписи печатаются друг поверх друга (на первом дне
// выходило «д.1» поверх «д.1»). Общая для ценового и балансового графиков: раньше
// логика жила только в ценовом, и балансовый её не знал.
function dayTicks(dstep){
  let ticks=[{d:1,a:'start'},{d:P.days,a:'end'}];
  for(let d=dstep;d<P.days;d+=dstep){
    if(Math.abs(d-1)<dstep*.3||Math.abs(d-P.days)<dstep*.3)continue;
    ticks.push({d:d,a:'middle'});
  }
  const thresh=Math.max(1,dstep*.3);
  let merged=false;
  ticks=ticks.map(t=>{
    // на слиянии берём НОМЕР сегодняшнего дня (а не отметки) — иначе на втором дне
    // жирным подписывалось «д.1»; позиция сдвигается на пол-шага, это незаметно
    if(!merged&&Math.abs(t.d-S.day)<=thresh){merged=true;return{d:S.day,a:t.a,today:true}}
    return t;
  });
  if(!merged)ticks.push({d:S.day,a:'middle',today:true});
  return ticks.sort((x,y)=>x.d-y.d);
}
function niceStep(range,targetTicks){
  const raw=range/Math.max(1,targetTicks);
  const mag=Math.pow(10,Math.floor(Math.log10(Math.max(raw,1e-9))));
  const norm=raw/mag;
  let step;
  if(norm<1.5)step=1;else if(norm<3)step=2;else if(norm<7)step=5;else step=10;
  return step*mag;
}
// Плавный переход цвета «синий (только приняли) → красный (срок сегодня)» для
// срочности контракта. u — доля пройденного срока (0 = только приняли, 1 = день сдачи).
function urgencyColor(u){
  u=Math.max(0,Math.min(1,u));
  const from=[29,79,122],to=[163,43,34]; // var(--credit) → var(--debit)
  const r=Math.round(from[0]+(to[0]-from[0])*u);
  const g=Math.round(from[1]+(to[1]-from[1])*u);
  const b=Math.round(from[2]+(to[2]-from[2])*u);
  return 'rgb('+r+','+g+','+b+')';
}
// Все формы рисуются «в вес» круга радиуса r: множители подобраны так, чтобы площадь
// закраски совпадала с площадью круга (πr²), а не по случайным коэффициентам. Раньше
// ромб строился по полудиагонали 1.8r — это вчетверо больше круга по площади, и на карте
// текущая «Таможня» (r=7) выходила громадным чёрным ромбом рядом с обычными кружками.
function shapeSVG(shape,cx,cy,r,attrs){
  if(shape==='triangle'){
    const h=r*1.8;
    return '<polygon points="'+cx+','+(cy-h*.62)+' '+(cx-h*.58)+','+(cy+h*.42)+' '+(cx+h*.58)+','+(cy+h*.42)+'" '+attrs+'/>';
  }
  if(shape==='square'){
    const s2=r*1.77; // сторона: s² = πr²
    return '<rect x="'+(cx-s2/2)+'" y="'+(cy-s2/2)+'" width="'+s2+'" height="'+s2+'" '+attrs+'/>';
  }
  if(shape==='diamond'){
    const d=r*1.28; // полудиагональ: 2d² = πr²
    return '<polygon points="'+cx+','+(cy-d)+' '+(cx+d)+','+cy+' '+cx+','+(cy+d)+' '+(cx-d)+','+cy+'" '+attrs+'/>';
  }
  if(shape==='cross'){
    const s3=r*1.25,w=r*.66; // две планки минус их пересечение: 2·(w·2s₃)−w² ≈ πr²
    return '<g '+attrs+'><rect x="'+(cx-w/2)+'" y="'+(cy-s3)+'" width="'+w+'" height="'+(s3*2)+'"/>'+
      '<rect x="'+(cx-s3)+'" y="'+(cy-w/2)+'" width="'+(s3*2)+'" height="'+w+'"/></g>';
  }
  return '<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" '+attrs+'/>';
}
// Сентинел вместо id товара: chartGood===BAL — значит открыт балансовый график,
// а не цена конкретного товара. Отдельной переменной-режима нарочно нет: всё
// остальное уже завязано на chartGood, и вторая переменная только разошлась бы с ней.
/* ============ бегущая строка новостей ============
   Три последние новости мира — события цен и молва — лентой над графиком.
   До неё всё это лежало только в журнале: событие «Обвал в штольне, цена на олово
   резко выросла» игрок находил случайно, дочитав записи до нужной строки.

   Пересобираем ТОЛЬКО когда содержимое сменилось: draw() зовут после каждой сделки,
   а пересборка узла начинает анимацию заново — лента дёргалась бы к началу на каждый
   клик игрока. Отсюда и подпись tickSig. */
let tickSig='';
function drawTicker(){
  const box=el('ticker');if(!box)return;
  const items=(S.news||[]).slice(0,3);
  if(!items.length){box.style.display='none';tickSig='';return}
  box.style.display='';
  const sig=items.map(x=>x.d+'|'+x.t).join('~');
  if(sig===tickSig)return;
  tickSig=sig;
  // подпись у молвы — та же самая, что в панели «Молва» (rumTrustLabel): один
  // и тот же слух не должен в двух местах говорить о себе разное
  const one=items.map(x=>'<span class="it '+(x.k==='ev'?'ev':'')+'"><b>'+L.misc.logDay(x.d)+' · '+
    (x.k==='ev'?L.misc.tickEvent:rumTrustLabel({trust:x.tr}))+'</b> '+x.t+'</span>').join('');
  const tr=el('tick-track');
  // две копии подряд: лента уезжает ровно на половину ширины и начинается заново,
  // поэтому склейка не видна и пустого места в конце не бывает
  tr.innerHTML='<span class="copy">'+one+'</span><span class="copy">'+one+'</span>';
  // скорость постоянная (около 55 пикселей в секунду), а не длительность: иначе
  // короткая новость летит, а длинная ползёт
  const w=tr.scrollWidth/2||700;
  tr.style.animationDuration=Math.max(12,Math.round(w/55))+'s';
}

// Телефон — не «узкий десктоп»: у графика там должен быть свой масштаб, а у шапки
// свой набор чисел. Один порог на всё, чтобы CSS и JS не разъезжались (в style.css
// тот же 560px). Пересчитывается на лету: draw() зовут и после поворота/ресайза.
const NARROW=()=>{
  try{return (document.documentElement.clientWidth||window.innerWidth||1200)<=560}
  catch(e){return false}
};

const BAL='__balance__';
/* ============ балансовый график ============
   Касса, деньги в товаре и долг день ото дня плюс два вида «стен»: дни ревизий с нормой, до которой
   надо опустить долг, и порог, за которым контору забирают немедленно. Всё это
   разбросано по интерфейсу (плашка долга, панель кредитора, предупреждения), но
   увидеть траекторию — успеваю или закапываюсь — можно было только в голове. */
// Разделено на «построить SVG» и «положить в свою коробку» ради итогового экрана:
// тот же график нужен там второй раз, а привязка к el('chart') делала это невозможным.
function drawBalanceChart(){
  // заголовок секции общий с ценовым графиком, поэтому подменяем обе его части:
  // «График цен · Баланс … по вашим наблюдениям» читалось бы как противоречие
  el('chart-title').textContent=L.chart.runProgress;
  el('chart-good').textContent=L.chart.balanceWord;
  el('chart-note').textContent=L.chart.balanceNote;
  const svg=balanceChartSVG();
  el('chart').innerHTML=svg||'<div class="dk-note" style="margin:0">'+L.chart.noRecords+'</div>';
  el('chart-key').innerHTML=svg?balanceKeyHTML():'';
}
// Маркеры линий вынесены наружу: ими подписана и легенда, и итоговый экран
const balXMark=(cx,cy,r)=>'<g stroke="#A32B22" stroke-width="1.8" stroke-linecap="round">'+
  '<line x1="'+(cx-r)+'" y1="'+(cy-r)+'" x2="'+(cx+r)+'" y2="'+(cy+r)+'"/>'+
  '<line x1="'+(cx-r)+'" y1="'+(cy+r)+'" x2="'+(cx+r)+'" y2="'+(cy-r)+'"/></g>';
const balDMark=(cx,cy,r)=>'<polygon points="'+cx+','+(cy-r)+' '+(cx+r)+','+cy+' '+cx+','+(cy+r)+' '+(cx-r)+','+cy+'" fill="#2C6B4F"/>';
function balanceKeyHTML(){
  return '<span><svg width="12" height="12" style="vertical-align:middle;margin-right:4px">'+balXMark(6,6,3.2)+'</svg>'+L.chart.keyDebt(S.debt)+'</span>'+
    '<span><svg width="12" height="12" style="vertical-align:middle;margin-right:4px"><circle cx="6" cy="6" r="3" fill="#1D4F7A"/></svg>'+L.chart.keyCash(S.cash)+'</span>'+
    '<span><svg width="12" height="12" style="vertical-align:middle;margin-right:4px">'+balDMark(6,6,3.4)+'</svg>'+L.chart.keyInv(Math.round(invested()))+'</span>'+
    '<span>'+L.chart.keyNet(net())+'</span>'+
    '<span style="color:#8A6A1F">'+L.chart.keyAudit+'</span>'+
    '<span style="color:#A32B22">'+L.chart.keyCall+'</span>'+
    '<span style="color:#2C6B4F">'+L.chart.keyReserve+'</span>';
}
function balanceChartSVG(){
  const pts=S.bal||[];
  if(!pts.length)return '';
  // На телефоне viewBox УЖЕ (не шире): SVG растягивается по ширине контейнера,
  // поэтому чем меньше viewBox, тем крупнее внутри него подписи. При 640 на экране
  // в 340 точек текст сжимался до 4 пикселей — «график супер мелкий, ничего
  // не разобрать» (Сергей, 21.08).
  const nr=NARROW();
  const W=nr?330:640,H=nr?200:190,PL=nr?42:54,PR=nr?6:8,PT=10,PB=nr?16:18;
  // потолок оси: сам порог всегда в кадре — иначе не видно, насколько близко край.
  // Дно — ниже нуля: итог (касса + товар − долг) почти весь заход отрицательный,
  // и без отрицательной части оси его линию просто некуда положить.
  const net=p=>p.cash+(p.inv||0)-p.debt;
  // в обучении порога нет (см. tutorial.js): он выставлен заведомо недостижимым,
  // и если пустить его в масштаб, вся ось уедет в миллиарды, а линии слипнутся у нуля
  const callShown=P.call&&!inTut();
  let mx=Math.max(callShown?P.call:0,...pts.map(p=>Math.max(p.cash,p.debt,p.inv||0)))*1.06;
  let mn=Math.min(0,...pts.map(net))*1.12;
  const X=d=>PL+(d-1)/Math.max(1,P.days-1)*(W-PL-PR);
  const Y=v=>PT+(1-(v-mn)/(mx-mn))*(H-PT-PB);
  let s='<svg class="dk-chart" viewBox="0 0 '+W+' '+H+'" xmlns="http://www.w3.org/2000/svg">';
  const step=niceStep(mx-mn,5);
  for(let v=Math.ceil(mn/step)*step;v<=mx;v+=step){
    const y=Y(v);
    s+='<line class="grid" x1="'+PL+'" y1="'+y+'" x2="'+(W-PR)+'" y2="'+y+'"/>'+
       '<text x="'+(PL-5)+'" y="'+(y+3)+'" text-anchor="end">'+Math.round(v).toLocaleString('ru-RU')+'</text>';
  }
  // нулевая черта заметнее прочих: к ней и стремится итог, это и есть цель захода
  if(mn<0)s+='<line x1="'+PL+'" y1="'+Y(0)+'" x2="'+(W-PR)+'" y2="'+Y(0)+'" stroke="#1C2620" stroke-width="1" opacity=".55"/>';
  const dstep=niceStep(P.days,nr?3:5);
  for(let d=dstep;d<P.days;d+=dstep)s+='<line class="grid" x1="'+X(d)+'" y1="'+PT+'" x2="'+X(d)+'" y2="'+(H-PB)+'"/>';
  // дни ревизий: вертикаль на всю высоту + короткая планка на уровне нормы,
  // до которой надо опустить долг именно к этому дню
  P.checks.forEach(c=>{
    const x=X(c[0]),lim=Math.round(P.debt*c[1]),y=Y(lim),past=S.day>c[0];
    const op=past?.35:.9;
    // подпись сидит вплотную над планкой нормы (а не болтается у оси) и лежит на
    // подложке цвета бумаги: раньше она пересекалась с пунктиром и читалась с трудом.
    // Если планка слишком близко к верху — уводим подпись под неё, чтобы не срезало.
    const above=y-PT>14,ty=above?y-6:y+13,w=34,h=10;
    s+='<line x1="'+x+'" y1="'+PT+'" x2="'+x+'" y2="'+(H-PB)+'" stroke="#8A6A1F" stroke-width="1" stroke-dasharray="2 3" opacity="'+op+'"/>'+
       '<line x1="'+(x-13)+'" y1="'+y+'" x2="'+(x+13)+'" y2="'+y+'" stroke="#8A6A1F" stroke-width="2" opacity="'+(past?.35:1)+'"/>'+
       '<rect x="'+(x-w/2)+'" y="'+(ty-h+2)+'" width="'+w+'" height="'+h+'" fill="#E9EEE4" opacity="'+(past?.75:.95)+'"/>'+
       '<text x="'+x+'" y="'+ty+'" text-anchor="middle" fill="#8A6A1F" opacity="'+(past?.5:1)+'">'+L.chart.axisAudit+'</text>';
  });
  // порог, за которым контору забирают немедленно
  if(callShown){
    const yc=Y(P.call);
    s+='<line x1="'+PL+'" y1="'+yc+'" x2="'+(W-PR)+'" y2="'+yc+'" stroke="#A32B22" stroke-width="1.6" stroke-dasharray="6 3"/>'+
       '<text x="'+(W-PR)+'" y="'+(yc-3)+'" text-anchor="end" fill="#A32B22">'+L.chart.axisCall(P.call)+'</text>';
  }
  // и вторая стена, с другой стороны: резерв, без которого книгу не закрыть. Долг
  // в ноль — это ещё не победа, и на графике это должно быть видно так же ясно,
  // как порог кредитора
  const rt=reserveTarget(),yr=Y(rt);
  s+='<line x1="'+PL+'" y1="'+yr+'" x2="'+(W-PR)+'" y2="'+yr+'" stroke="#2C6B4F" stroke-width="1.4" stroke-dasharray="4 4" opacity=".9"/>'+
     '<text x="'+(W-PR)+'" y="'+(yr-3)+'" text-anchor="end" fill="#2C6B4F">'+L.chart.axisReserve(rt)+'</text>';
  // p.inv нет в точках, записанных до появления этой линии (снимок старого захода
  // в localStorage) — там она честно ляжет на ноль, а не уронит график
  const line=key=>pts.map((p,i)=>(i?'L':'M')+X(p.d)+' '+Y(p[key]||0)).join(' ');
  s+='<path d="'+line('debt')+'" fill="none" stroke="#A32B22" stroke-width="2"/>';
  s+='<path d="'+line('inv')+'" fill="none" stroke="#2C6B4F" stroke-width="2"/>';
  s+='<path d="'+line('cash')+'" fill="none" stroke="#1D4F7A" stroke-width="2"/>';
  // Итог = касса + товар − долг. Без маркеров и тоньше остальных: это не четвёртая
  // равноправная линия, а производная от трёх — сама по себе она ничего не говорит,
  // но показывает то, чего не видно ни в одной из трёх: движется заход к нулю или нет
  s+='<path d="'+pts.map((p,i)=>(i?'L':'M')+X(p.d)+' '+Y(net(p))).join(' ')+
     '" fill="none" stroke="#1C2620" stroke-width="1.4" stroke-dasharray="5 3" opacity=".75"/>';
  // долг — острый косой крест, касса — мягкий круг, товар — ромб: три линии должны
  // различаться не только цветом (на печати и при дальтонизме цвет не работает)
  const xMark=balXMark,dMark=balDMark;
  pts.forEach(p=>{
    const cur=p.d===S.day;
    s+=xMark(X(p.d),Y(p.debt),cur?4:2.6)+
       dMark(X(p.d),Y(p.inv||0),cur?4:2.8)+
       '<circle cx="'+X(p.d)+'" cy="'+Y(p.cash)+'" r="'+(cur?3.6:2.4)+'" fill="#1D4F7A"/>';
  });
  dayTicks(dstep).forEach(t=>{
    s+='<text x="'+X(t.d)+'" y="'+(H-5)+'" text-anchor="'+t.a+'"'+(t.today?' class="today-lbl"':'')+'>'+L.chart.dayTick(t.d)+'</text>';
  });
  return s+'</svg>';
}
function drawChart(){
  const tabs=el('chart-tabs');tabs.innerHTML='';
  // вкладка баланса первой и нарочно не похожа на товарные — это не товар,
  // а сводка по заходу целиком
  const bb=document.createElement('button');
  bb.textContent=L.chart.balanceTab;bb.className='bal'+(chartGood===BAL?' on':'');
  bb.onclick=()=>{chartGood=BAL;snd('click');drawChart()};
  tabs.appendChild(bb);
  GOODS.forEach(g=>{
    const b=document.createElement('button');
    const owned=qty(g.id)>0;
    b.innerHTML=g.n+(owned?' <span style="color:var(--credit)">●</span>':'');
    b.className=(g.id===chartGood?'on':'')+(owned?' owned':'');
    b.title=owned?L.misc.hasInHold:'';
    b.onclick=()=>{chartGood=g.id;snd('click');drawChart()};
    tabs.appendChild(b);
  });
  // вкладки построены целиком — только теперь расходимся по видам графика,
  // иначе с открытого баланса некуда было бы вернуться
  if(chartGood===BAL){drawBalanceChart();return}
  el('chart-title').textContent=L.ui.chartPrices;
  el('chart-note').textContent=L.ui.byObservations;
  const G=good(chartGood);
  el('chart-good').textContent=G?G.n:'—';
  const series=MKTS.map(m=>({m:m,pts:(S.hist[m.n][chartGood]||[])})).filter(s=>s.pts.length);
  const holdAvg=G&&qty(chartGood)>0?avg(chartGood):null;
  // слух живёт 2 дня и тускнеет к концу срока
  const rumHere=(S.rumours||[]).filter(r=>r.gid===chartGood&&S.day-r.d<=2&&S.day-r.d>=0);
  if(!series.length){
    el('chart').innerHTML='<div class="dk-note" style="margin:0">'+L.misc.noObs+'</div>';
    el('chart-key').innerHTML='';return;
  }
  const nr=NARROW();
  const W=nr?330:640,H=nr?180:170,PL=nr?36:46,PR=nr?6:8,PT=10,PB=nr?16:18;
  let mn=Infinity,mx=-Infinity;
  series.forEach(s=>s.pts.forEach(p=>{mn=Math.min(mn,p.p);mx=Math.max(mx,p.p)}));
  if(holdAvg){mn=Math.min(mn,holdAvg);mx=Math.max(mx,holdAvg)}
  rumHere.forEach(r=>{mn=Math.min(mn,r.p);mx=Math.max(mx,r.p)});
  if(mx-mn<1)mx=mn+1;
  // не даём оси сжиматься теснее приличного для порядка цены товара — иначе
  // небольшой реальный разброс (18→20) после округления подписей до целых даёт
  // повторяющиеся на вид числа («20/20/19/19/18»), и игрок путает шум с наваром
  const priceMag=Math.pow(10,Math.floor(Math.log10(Math.max(1,(mn+mx)/2))));
  const minRange=priceMag*2;
  if(mx-mn<minRange){const mid=(mn+mx)/2;mn=Math.max(0,mid-minRange/2);mx=mid+minRange/2}
  const pad=(mx-mn)*.12;mn=Math.max(0,mn-pad);mx=mx+pad;
  const X=d=>PL+(d-1)/Math.max(1,P.days-1)*(W-PL-PR);
  const Y=p=>PT+(1-(p-mn)/(mx-mn))*(H-PT-PB);
  let s='<svg class="dk-chart" viewBox="0 0 '+W+' '+H+'" xmlns="http://www.w3.org/2000/svg">';
  // круглые деления по цене (25/50/75/100…), а не произвольные доли диапазона
  const step=niceStep(mx-mn,4);
  for(let v=Math.ceil(mn/step)*step;v<=mx;v+=step){
    const y=Y(v);
    s+='<line class="grid" x1="'+PL+'" y1="'+y+'" x2="'+(W-PR)+'" y2="'+y+'"/>'+
       '<text x="'+(PL-5)+'" y="'+(y+3)+'" text-anchor="end">'+Math.round(v).toLocaleString('ru-RU')+'</text>';
  }
  // круглые деления по дням — сетка отдельно от подписей снизу
  const dstep=niceStep(P.days,nr?3:5);
  for(let d=dstep;d<P.days;d+=dstep){
    const x=X(d);
    s+='<line class="grid" x1="'+x+'" y1="'+PT+'" x2="'+x+'" y2="'+(H-PB)+'"/>';
  }
  // подписи дней: 1 и последний день всегда на месте; «сегодня» — отдельным жирным
  // номером снизу, который едет по оси вместе с ходом времени, а не словом наверху.
  // Если день сегодня и так близко к одной из регулярных отметок — подписи сливаются
  // в одну (жирную), чтобы не наезжали друг на друга.
  dayTicks(dstep).forEach(t=>{
    s+='<text x="'+X(t.d)+'" y="'+(H-5)+'" text-anchor="'+t.a+'"'+(t.today?' class="today-lbl"':'')+'>'+L.chart.dayTick(t.d)+'</text>';
  });
  s+='<line x1="'+X(S.day)+'" y1="'+PT+'" x2="'+X(S.day)+'" y2="'+(H-PB)+'" stroke="#1C2620" stroke-width="1" stroke-dasharray="3 3"/>';
  if(holdAvg){
    const y=Y(holdAvg);
    s+='<line x1="'+PL+'" y1="'+y+'" x2="'+(W-PR)+'" y2="'+y+'" stroke="#2C6B4F" stroke-width="1.3" stroke-dasharray="5 3" opacity=".85"/>'+
       '<text x="'+(W-PR)+'" y="'+(y-3)+'" text-anchor="end" fill="#2C6B4F">'+L.misc.avgBuy+L.num(holdAvg)+'</text>';
  }
  // текущий рынок отличается заметно бо́льшими маркерами, а не толщиной линии —
  // жирная линия+буллеты вместе выглядели невнятно, попросили выбрать что-то одно
  series.forEach(sr=>{
    const shape=MSHAPE[sr.m.n]||'circle',cur=sr.m.n===S.mkt;
    const d=sr.pts.map((p,i)=>(i?'L':'M')+X(p.d)+' '+Y(p.p)).join(' ');
    s+='<path d="'+d+'" fill="none" stroke="'+sr.m.c+'" stroke-width="1.3" opacity="'+(cur?1:.35)+'"/>';
    // рынок с одной-единственной точкой не рисует линию вообще — такую точку
    // при стандартном мелком радиусе неигроков было легко не заметить, поэтому
    // одиночные точки рисуем на треть крупнее и заметно менее прозрачными
    sr.pts.forEach(p=>{
      const lone=sr.pts.length===1;
      // неактивные рынки лишь немного мельче активного: они и так тусклее и не жирные,
      // а втрое меньший буллет попросту не читался
      s+=shapeSVG(shape,X(p.d),Y(p.p),cur?3.4:(lone?2.9:2.6),
        'style="fill:'+sr.m.c+';opacity:'+(cur?1:(lone?.8:.62))+'"');
    });
  });
  const rumTags=[];
  rumHere.forEach((r,i)=>{
    const age=S.day-r.d,op=Math.max(.25,1-age/2.2),x=X(r.d),y=Y(r.p);
    const mc=(mk(r.mkt)||{}).c||'#1C2620',tagId='rum'+i;
    rumTags.push({id:tagId,r:r});
    // маленький треугольник + увеличенная невидимая зона тапа (мобильный экран мелкий)
    s+='<g data-rum="'+tagId+'" style="cursor:pointer">'+
      '<circle cx="'+x+'" cy="'+y+'" r="9" fill="transparent"/>'+
      (r.hi
        ?'<polygon points="'+x+','+(y-5)+' '+(x-4)+','+(y+3)+' '+(x+4)+','+(y+3)+'" fill="none" stroke="'+mc+'" stroke-width="1.3" opacity="'+op+'"/>'
        :'<polygon points="'+x+','+(y+5)+' '+(x-4)+','+(y-3)+' '+(x+4)+','+(y-3)+'" fill="none" stroke="'+mc+'" stroke-width="1.3" opacity="'+op+'"/>')+
      '</g>';
  });
  el('chart').innerHTML=s+'</svg>';
  el('chart').querySelectorAll('[data-rum]').forEach(n=>{
    const tag=rumTags.find(t=>t.id===n.getAttribute('data-rum'));if(!tag)return;
    n.addEventListener('click',()=>{
      const r=tag.r,trust=rumTrustLabel(r);
      // перенос строки, а не пробел — на широком экране это иначе одна длинная
      // строка через весь тост, а не читаемые две мысли (признак доверия / сам слух)
      toast(L.chart.rumToast(r.d),trust.charAt(0).toUpperCase()+trust.slice(1)+'.<br>'+r.t,'info');
    });
  });
  el('chart-key').innerHTML=series.map(sr=>'<span'+(sr.m.n===S.mkt?'':' style="opacity:.55"')+'><svg width="12" height="12" style="vertical-align:middle;margin-right:4px">'+
      shapeSVG(MSHAPE[sr.m.n]||'circle',6,6,3,'style="fill:'+sr.m.c+'"')+'</svg>'+mname(sr.m.n)+(sr.m.n===S.mkt?' ('+L.ui.youHere+')':'')+'</span>').join('')+
    (holdAvg?'<span>'+L.chart.yourAvg+'</span>':'')+
    (rumHere.length?'<span>'+L.chart.rumHint+'</span>':'');
}

function draw(){
  refreshBalToday(); // точка баланса за сегодня — живая, пересчитывается после каждой сделки
  saveSession();
  if(S.cash<=0)grant('a21');
  const eliteHeld=GOODS.filter(g=>g.fake);
  if(eliteHeld.length>=2&&eliteHeld.every(g=>qty(g.id)>0))grant('a24');
  const r=rateFor(S.day);
  el('s-day').textContent=Math.min(S.day,P.days)+'/'+P.days;
  el('s-cash').textContent=money(S.cash);
  el('s-cash').className='v'+(S.cash<500?' warn':'');
  el('s-cap').textContent=Math.round(held())+'/'+capacity();
  el('s-rate').textContent=fixed(r*100,1)+'%';
  el('s-debt').textContent=money(S.debt);
  el('rate2').textContent=fixed(r*100,1)+L.ui.perDay;
  const rTgt=reserveTarget();
  // на узком экране в клетке резерва только ЦЕЛЬ: сколько в кассе сейчас, написано
  // через две клетки в той же строке, и повторять это в трети ширины экрана незачем
  el('s-reserve').textContent=NARROW()?money(rTgt):money(S.cash)+' / '+money(rTgt);
  el('s-reserve').className='v'+(S.debt<=0&&S.cash<rTgt?' warn':'');
  // визуальное удовлетворение: красная плашка — пока висит долг, жёлтая — долг закрыт,
  // но резерва на новое дело ещё не хватает, зелёная — можно закрывать книгу прямо сейчас
  el('debt-panel').className='dk-debt'+(S.debt>0?'':(S.cash>=rTgt?' ready':' paid'));
  const nx=P.checks.filter(c=>c[0]>S.day)[0];
  el('s-int').textContent=S.debt>0
    ? L.hdr.tomorrow(S.debt*r,Math.max(0,P.days-S.day+1))
      +(nx?L.hdr.revision(inDays(nx[0]),P.debt*nx[1]):'')
    : (S.cash>=rTgt?L.hdr.readyToClose:L.hdr.needReserve(rTgt-S.cash));
  el('mkt-name').textContent=mname(S.mkt);
  el('mkt-day').textContent=L.tbl.dayAndSpread(Math.min(S.day,P.days),Math.round(spreadOf(S.mkt)*100));
  el('tbl-note').textContent=L.tbl.note(GOODS.slice(0,3).map(g=>L.tbl.noteItem(g.n,g.bulk)).join('; '),lotCap());
  const cb=el('close-book');
  cb.style.display=(S.debt<=0&&S.cash>=rTgt&&!S.over)?'block':'none';

  const tb=el('rows');tb.innerHTML='';
  GOODS.forEach(g=>{
    const a=ask(g.id),b=bid(g.id),have=qty(g.id),bk=best(g.id),imp=S.imp[S.mkt][g.id];
    const herec=contractAt(g.id);
    const tr=document.createElement('tr');
    if(herec)tr.className='dk-row-flag';
    let warn='';
    if(P.hintFake&&a){
      const rk=fakeRisk(g.id);
      if(rk>.26)warn='<span class="dk-warn">'+L.tbl.fakeRisk+'</span>';
      else if(rk>.11)warn='<span class="dk-warn" style="opacity:.7">'+L.tbl.cheaper+'</span>';
    }
    let impTxt='';
    const dev=Math.round(Math.abs(imp-1)*100);
    if(imp<.96)impTxt='<span class="dk-sub" style="color:var(--debit)">'+L.tbl.pushedDown(dev)+'</span>';
    else if(imp>1.04)impTxt='<span class="dk-sub" style="color:var(--credit)">'+L.tbl.pushedUp(dev)+'</span>';
    const bm=boostMul(g.id);
    // множитель бывает и меньше единицы (сорванное предписание роняет цену), поэтому
    // и порог двусторонний, и знак берётся из числа — иначе выходило «надбавка +-18%»,
    // а штраф вообще не показывался, потому что условие было только «больше единицы»
    if(bm>1.001||bm<.999){
      const parts=[];
      if(S.perm[g.id])parts.push(sgn(S.perm[g.id])+' '+L.tbl.forever);
      (S.temp[g.id]||[]).forEach(bb=>parts.push(sgn(bb.m)+' '+L.tbl.more(bb.until-S.day+1)));
      const down=bm<1;
      impTxt+='<span class="dk-boost'+(down?' down':'')+'" title="'+parts.join('; ')+'">'+
        (down?L.tbl.penalty:L.tbl.boost)+sgn(bm-1)+'</span>';
    }
    let hold=L.tbl.none;
    if(have){
      const lots0=lots(g.id);
      const ages=g.rot?'<span class="dk-sub">'+lots0.map(l=>L.tbl.lot(l.q,l.age)).join(', ')+'</span>':'';
      const chk=lots0.some(l=>l.checked)&&fkq(g.id)?'<span class="dk-sub" style="color:var(--debit)">'+L.tbl.fakesFound(fkq(g.id))+'</span>':'';
      const mest=have*g.bulk;
      // Крупной строкой — количество и цена за единицу: два числа, которыми игрок
      // сравнивает свою партию с котировкой рынка. Мелкой под ними — сколько всего
      // в этой партии денег и сколько она занимает места. Слово «закуп» убрано:
      // строка стоит в колонке «в трюме», других цен там быть не может.
      // Сама средняя видна ВСЕГДА, на всех сложностях. Когда-то её прятал общий флаг
      // подсказок, и на Ростовщике игрок не видел, почём сам же купил товар. Скрывать
      // чужие рынки и слухи — сложность; скрывать собственную бухгалтерию — не
      // сложность, а духота: игрок всё равно это знает, просто считает в уме.
      hold='<span class="hold-avg">'+L.tbl.holdLead(have,avg(g.id))+'</span>'+
        '<span class="dk-sub">'+L.tbl.holdSub(cst(g.id),mest)+'</span>'+ages+chk;
    }
    if(expCount(g.id)>0){
      hold+='<span class="dk-warn">'+L.tbl.exposed(expCount(g.id))+
        '<button class="exp-btn" type="button" data-g="'+g.id+'">'+L.tbl.disposeBtn(disposeVal(g.id))+'</button></span>';
    }
    const tagParts=[];
    if(g.fake)tagParts.push('<span class="dk-tag tag-eli">'+L.tbl.tagElite+'</span>');
    if(g.rot)tagParts.push('<span class="dk-tag tag-rot">'+L.tbl.tagRot+'</span>');
    if(!tagParts.length)tagParts.push('<span class="dk-tag tag-std">'+L.tbl.tagStd+'</span>');
    const tag=tagParts.join(' ');
    tr.innerHTML=
      '<td class="c-name"><span class="dk-name" data-g="'+g.id+'">'+g.n+'</span>'+tag+
        '<span class="dk-sub">'+L.tbl.bulkPer(g.bulk)+'</span></td>'+
      '<td class="c-ask"><span class="lbl">'+L.ui.colBuy+'</span><span class="dk-ask">'+
        (a?money(a):'<span class="dk-none">'+L.tbl.noTrade+'</span>')+'</span>'+warn+'</td>'+
      '<td class="c-bid"><span class="lbl">'+L.ui.colSell+'</span><span class="dk-bid">'+
        (b?money(b):(have?'<span class="dk-none">'+L.tbl.onlyDealer+'</span>':L.tbl.none))+'</span>'+impTxt+'</td>'+
      '<td class="c-hold"><span class="lbl">'+L.ui.colHold+'</span>'+hold+'</td>';
    const qc=document.createElement('td');qc.className='dk-qty';
    qc.innerHTML='<span class="lbl">'+L.ui.colQty+'</span>';
    const inp=document.createElement('input');inp.type='number';inp.min=1;inp.value=1;
    // отдельные − и +: нативные спиннеры браузера мелкие и в них не попасть
    const stepRow=document.createElement('div');stepRow.className='qstep';
    const mk=(txt,d)=>{
      const b=document.createElement('button');b.textContent=txt;b.type='button';
      b.onclick=()=>{
        const cur=Math.max(1,parseInt(inp.value)||1);
        const maxQ=Math.max(1,quoteBuy(g.id,9999).n);
        inp.value=Math.max(1,Math.min(maxQ,cur+d));
        upd();
      };
      return b;
    };
    stepRow.appendChild(mk('−',-1));stepRow.appendChild(inp);stepRow.appendChild(mk('+',1));
    qc.appendChild(stepRow);
    const qb=document.createElement('div');qb.className='qbtns';
    // 1/5/10 прибавляют к тому, что уже введено (не больше, чем реально можно купить) —
    // чтобы «5» дважды подряд давало 10, а не оставляло те же 5
    // «+1» тут не нужен: единицу прибавляет плюсик у самого поля ввода
    [['+2',2],['+5',5],['+10',10]].forEach(x=>{
      const t=document.createElement('button');t.textContent=x[0];
      t.onclick=()=>{
        const cur=Math.max(0,parseInt(inp.value)||0);
        const maxQ=Math.max(1,quoteBuy(g.id,9999).n);
        inp.value=addQty(cur,x[1],maxQ);
        upd();
      };
      qb.appendChild(t);
    });
    qc.appendChild(qb);
    const ac=document.createElement('td');ac.className='dk-acts';
    const b1=document.createElement('button');b1.className='buy';
    const b2=document.createElement('button');b2.className='buy';
    const b3=document.createElement('button');b3.className='sell';
    const b4=document.createElement('button');b4.className='sell';
    [b1,b2].forEach(x=>ac.appendChild(x));
    if(herec){
      const bc=document.createElement('button');bc.className='deliver';
      const canDeliver=have>0;
      bc.textContent=canDeliver
        ?L.tbl.deliver(Math.min(have,herec.qty-herec.done))
        :L.tbl.deliverEmpty;
      bc.disabled=!canDeliver;
      bc.onclick=()=>fulfil(herec.id);
      ac.appendChild(bc);
    }
    [b3,b4].forEach(x=>ac.appendChild(x));
    // вторая строка — цена за единицу, без «по »: слово ничего не добавляло к «$61/ед.»,
    // а место под цифры съедало (на кнопке их и так впритык)
    function lab(pre,q,reason){return q.n?pre+' '+q.n+' · '+money(q.sum)+'<b>'+money(q.sum/q.n)+L.per+'</b>':pre+' '+L.tbl.none+(reason?'<b>'+reason+'</b>':'')}
    // почему «Купить» неактивна — не всегда очевидно (особенно «трюм полон»: общий
    // остаток места виден только в шапке, а не в строке конкретного товара, и не все
    // товары занимают одинаково много места, чтобы прикинуть в уме)
    function buyBlockReason(){
      if(!rawAt(S.mkt,g.id))return L.tbl.whyNoTrade;
      if(room()<g.bulk)return L.tbl.whyFull;
      const price=askAt(g.id,S.imp[S.mkt][g.id]);
      if(price&&S.cash<price)return L.tbl.whyPoor;
      return'';
    }
    function upd(){
      const n=Math.max(1,parseInt(inp.value)||1);
      const q1=quoteBuy(g.id,n),q2=quoteBuy(g.id,maxBuyQty(g.id)),q3=quoteSell(g.id,n),q4=quoteSell(g.id,have);
      const reason=buyBlockReason();
      b1.innerHTML=lab(L.tbl.buy,q1,reason);b1.disabled=!q1.n;
      b2.innerHTML=lab(L.tbl.lotBtn,q2,reason);b2.disabled=!q2.n;
      b3.innerHTML=lab(q3.distress?L.tbl.dump:L.tbl.sell,q3);b3.disabled=!q3.n;
      b4.innerHTML=lab(q4.distress?L.tbl.dumpAll:L.tbl.all,q4);b4.disabled=!q4.n;
    }
    inp.oninput=upd;
    b1.onclick=()=>buy(g.id,Math.max(1,parseInt(inp.value)||1));
    b2.onclick=()=>buy(g.id,maxBuyQty(g.id));
    b3.onclick=()=>{
      const n=Math.max(1,parseInt(inp.value)||1);
      if(contractHere(g.id))askConfirm(L.tbl.sellConfirm(g.n,n),()=>sell(g.id,n));
      else sell(g.id,n);
    };
    b4.onclick=()=>{
      if(contractHere(g.id))askConfirm(L.tbl.sellAllConfirm(g.n),()=>sell(g.id,have));
      else sell(g.id,have);
    };
    upd();
    tr.appendChild(qc);tr.appendChild(ac);
    tr.style.cursor='pointer';
    tr.addEventListener('click',e=>{
      if(e.target.closest('button,input'))return;
      chartGood=g.id;snd('click');drawChart();
    });
    tb.appendChild(tr);
  });
  tb.querySelectorAll('.exp-btn').forEach(n=>n.addEventListener('click',e=>{
    e.stopPropagation();disposeExposed(n.getAttribute('data-g'));
  }));

  drawChart();
  drawTicker();

  const pr=profile(S.mkt),td=todayBest();
  el('here').innerHTML='<div class="dk-here"><span>'+mname(S.mkt)+'</span><b>'+L.ui.youHere+
    (P.hintProfile?'<br>'+L.road.profile(pr.cheap,pr.dear):'')+
    (P.hintToday&&td.lo?'<br>'+L.road.today(td.lo.n,td.hi.n):'')+'</b></div>';
  drawMap();
  el('dir').innerHTML=P.hintProfile
    ? MKTS.map(m=>{const p=profile(m.n),nm=m.n===S.mkt?'<b>'+mname(m.n)+'</b>':mname(m.n);
        return '<div>'+L.road.dirLine(nm,p.cheap,p.dear)+'</div>'}).join('')
      +'<div class="today">'+L.road.dirNote+'</div>'
    : '<div>'+L.road.noDir+'</div>';

  const mw=el('markets');mw.innerHTML='';
  const f=freight();
  NB[S.mkt].forEach(n=>{
    const long=isLongRoad(S.mkt,n),d=roadDays(S.mkt,n);
    const b=document.createElement('button');b.className='wide'+(long?' long':'');
    // дальний тракт подписан отдельно: он экономит переезды, но стоит лишних суток
    // процентов — игрок должен видеть цену до нажатия, а не после
    b.innerHTML=L.road.go(mname(n))+'<i>'+(d>1?L.road.goLong(d,f)
      :(long?L.road.goHorses(f):L.road.goPlain(f)))+'</i>';
    b.disabled=!!S.over;b.onclick=()=>travel(n);mw.appendChild(b);
    // с конями шатёр проскакивают мимо — но к нему можно заехать нарочно, заплатив
    // тем самым днём, который кони и экономят
    if(long&&S.horses){
      const b2=document.createElement('button');b2.className='wide long';
      b2.innerHTML=L.road.goTent(mname(n))+'<i>'+L.road.goTentSub(d+1)+'</i>';
      b2.disabled=!!S.over;b2.onclick=()=>travel(n,1);mw.appendChild(b2);
    }
  });
  el('wait').innerHTML=L.road.wait+'<i>'+L.road.waitFee(idleFee())+'</i>';

  el('rumours').innerHTML=S.rumours.length
    ? S.rumours.map(x=>'<div class="dk-rum"><span class="h '+(P.hintTrust?(x.trust?'ok':'no'):'')+'">'+
        L.rum.head(x.d,rumTrustLabel(x))+'</span><br>'+x.t+'</div>').join('')
    : '<div class="dk-note" style="margin:0">'+L.rum.quiet+'</div>';
  el('rum-new').innerHTML=S.rumNew?'<span class="new">'+L.rum.fresh+'</span>':'';

  // предписания — отдельным блоком НАД контрактами: их не выбирают и от них нельзя
  // отказаться, поэтому мешать их с обычными предложениями в одном списке неправильно
  const cw=el('contracts');cw.innerHTML='';
  const dw=el('duties');dw.innerHTML='';
  const duties=S.contracts.filter(c=>c.duty);
  el('duty-sec').style.display=duties.length?'':'none';
  el('d-count').textContent=duties.length?L.rum.noRefusal:'';
  const live=S.contracts.filter(c=>c.state==='live'&&!c.duty),off=S.contracts.filter(c=>c.state==='offer'&&!c.duty);
  el('c-count').textContent=L.rum.inWork(live.length);
  duties.concat(live).concat(off).forEach(c=>{
    const g=good(c.g),isLive=c.state==='live',left=c.due-S.day;
    // срочность — доля пройденного срока с момента появления предложения (c.seen)
    // до дня сдачи (c.due); только для live, у offer есть свой отдельный grab-таймер
    const span=Math.max(1,c.due-c.seen),urgency=isLive?1-left/span:0,ucol=urgencyColor(urgency);
    const d=document.createElement('div');
    d.className='dk-card '+(c.gold?'gold ':'')+(c.duty?'duty ':'');
    if(isLive&&!c.gold&&!c.duty)d.style.borderLeft='3px solid '+ucol;
    // Карточка выстроена по тому, куда игрок реально смотрит (разбор с Сергеем):
    // крупно — остаток к сдаче, сколько уже в трюме, точка сдачи, срок и цена за
    // единицу; мелкой строкой внизу — общая сумма, надбавка и неустойка: они нужны,
    // но взгляд на них не задерживается. «Сдать в» убрано — название рынка и так
    // читается как пункт назначения. «Срок до дня 27» заменено на «осталось N дн.»:
    // абсолютный номер дня требовал считать в уме, сколько это от сегодня.
    const inHold=qty(c.g),needLeft=Math.max(0,c.qty-c.done);
    const dl=Math.max(0,left);
    const срок=dl+' '+L.days(dl);
    const extra=c.gold?L.con.boostGold(Math.round(GOLD_PERM*100))
      :c.duty?L.con.boostNone
      :L.con.boostTemp(Math.round(c.boost[0]*100),c.boost[1]);
    d.innerHTML='<h4><span>'+g.n+'</span><i class="'+(c.gold?'g':'')+'">'+(L.tier[c.tier]||c.tier)+'</i></h4>'+
      '<div class="need">'+(isLive?L.con.needMore(needLeft):L.con.need(c.qty))+
        '<span class="inhold' + (inHold?' has':'') + '">'+L.con.inHold(inHold)+'</span></div>'+
      '<div class="terms"><b>'+mname(c.mkt)+'</b> · '+(isLive?L.con.leftDays(срок,ucol)
        :L.con.termDays(срок,c.grab+1))+'</div>'+
      '<div class="per">'+money(c.pay/c.qty)+' <span>'+L.con.perUnit+'</span></div>'+
      '<div class="fine">'+L.con.totalLine(c.pay,extra,c.pen,isLive)+
      (c.duty?L.con.dutyRate(fixed(DUTY_FAIL.rate*100,1)):'')+'</div>';
    const row=document.createElement('div');row.className='row';
    const b=document.createElement('button');
    if(isLive){
      const can=c.mkt===S.mkt&&qty(c.g)>0&&c.done<c.qty;
      let clabel;
      if(can)clabel=L.con.deliverN(Math.min(qty(c.g),c.qty-c.done));
      else if(c.mkt!==S.mkt)clabel=L.con.deliverAt(mname(c.mkt));
      else clabel=L.con.nothingToDeliver;
      b.className='buy';b.textContent=clabel;
      b.disabled=!can;b.onclick=()=>fulfil(c.id);
    }else{
      const here=c.mkt===S.mkt;
      b.textContent=here?L.con.takeHere:L.con.take;
      b.disabled=here;b.title=here?L.con.takeHereWhy:'';
      if(!here)b.onclick=()=>accept(c.id);
    }
    row.appendChild(b);
    if(!c.duty){
      const x=document.createElement('button');x.className='sell';x.textContent=L.con.refuse;
      x.onclick=()=>{
        const msg=isLive?L.con.refuseLive(g.n,Math.round(c.pen*(1-c.done/c.qty))):L.con.refuseOffer(g.n);
        askConfirm(msg,()=>decline(c.id),L.con.refuseYes,L.con.refuseNo);
      };
      row.appendChild(x);
    }
    d.appendChild(row);(c.duty?dw:cw).appendChild(d);
  });

  const uc=upCost(),ub=el('upgrade');
  ub.innerHTML=uc?L.office.upgrade(UPSTEP)+'<i>'+L.office.upgradeCost(uc,held()>capacity()*.9)+'</i>'
    :L.office.upgradeMax;
  ub.disabled=!uc||S.cash<uc||!!S.over;
  // кнопка честно говорит, почему она мёртвая: подделки бывают только у элитных
  // товаров, и проверенный лот второй раз проверять нечего
  const ab=el('appraise'),ac2=apCost(),susp=suspectQty();
  const hasElite=GOODS.some(g=>g.fake&&qty(g.id)>0);
  ab.innerHTML=L.office.appraise+'<i>'+(susp?L.office.appraiseCost(ac2,susp)
    :(hasElite?L.office.appraiseChecked:L.office.appraiseNothing))+'</i>';
  ab.disabled=!susp||S.cash<ac2||!!S.over;
  const ib=el('insure'),ic=insCost();
  // «5 дней» игрок читал как «сгорит на первом же переезде» — а переезд и есть день,
  // так что полис живёт ровно пять переездов, и честнее сказать это прямо. Плюс
  // цена вопроса: сколько денег сейчас едет незастрахованным.
  // в состоянии «застрахован» показываем остаток покрытия, а не только срок: полис
  // привязан к сумме груза на момент покупки, и докупленное сверх неё не прикрыто
  ib.innerHTML=S.ins>=S.day
    ? L.office.insured+'<i>'+L.office.insuredSub(daysLeft(S.ins),Math.max(0,S.insLeft||0))+'</i>'
    : L.office.insure+'<i>'+L.office.insureSub(ic,INS_DAYS,Math.round(INS_BACK*100),held()?invested():0)+'</i>';
  ib.disabled=!held()||S.cash<ic||S.ins>=S.day||!!S.over;
  // Тракт и кони показываются только там, где имеют смысл: на Ученике Дальней фактории
  // нет вовсе, на Приказчике тракт открыт с самого начала. Кнопку, которая никогда
  // не станет доступной, лучше не показывать совсем, чем дразнить ею.
  const rb=el('road');
  rb.style.display=roadForSale()?'':'none';
  rb.innerHTML=L.office.road+'<i>'+L.office.roadSub(ROAD_COST)+'</i>';
  rb.disabled=S.cash<ROAD_COST||!!S.over;
  const hb=el('horses');
  hb.style.display=(horsesForSale()||(S.horses&&roadOpen()))?'':'none';
  hb.innerHTML=S.horses?L.office.horsesDone+'<i>'+L.office.horsesDoneSub+'</i>'
    :L.office.horses+'<i>'+L.office.horsesSub(HORSE_COST)+'</i>';
  hb.disabled=!!S.horses||S.cash<HORSE_COST||!!S.over;
  const tbn=el('tar');
  tbn.innerHTML=S.tarBarrels?L.office.tarDone+'<i>'+L.office.tarDoneSub+'</i>'
    :L.office.tar+'<i>'+L.office.tarSub(TAR_COST)+'</i>';
  tbn.disabled=S.tarBarrels||S.cash<TAR_COST||!!S.over;

  const bl=[];
  GOODS.forEach(g=>{
    if(S.perm[g.id])bl.push(L.office.boostPerm(g.n,sgn(S.perm[g.id])));
    (S.temp[g.id]||[]).forEach(b=>bl.push(L.office.boostTemp(g.n,sgn(b.m),b.until-S.day+1,b.m<0)));
  });
  if(S.relief)bl.push(L.office.reliefLine(fixed(S.relief*100,1)));
  if(S.tarBarrels)bl.push(L.office.tarLine);
  // бафы от ачивок сюда не выводим — они все постоянные, их не нужно отслеживать
  // по ходу игры; полный список смотреть в окне настроек (шестерёнка)
  el('boosts').innerHTML=bl.length
    ? '<b>'+L.office.boostsTitle+'</b><br>'+bl.join('<br>')
    : L.office.noBoosts;

  el('bank-alert').textContent = S.debt<=0 ? '' :
    S.cash<=0 ? L.hdr.cashEmpty : S.cash<400 ? L.hdr.cashLow : '';
  // в обучении порога нет (он выставлен заведомо недостижимым) — и писать про него
  // девятизначное число значит пугать игрока цифрой, которой в игре не бывает
  el('bank-note').textContent=inTut()?'':L.hdr.callNote(P.call);

  const lg=el('log');lg.innerHTML='';
  S.log.forEach(l=>{const p=document.createElement('p');p.className=l.c;
    p.innerHTML='<span class="d">'+L.misc.logDay(l.d)+'</span> '+l.t;lg.appendChild(p)});

  document.querySelectorAll('.dk-over').forEach(n=>n.remove());
  unstretchRoot(); // снимает растяжку под меню/настройки (см. stretchRootFor) — обычный игровой рендер её не просит
  if(S.over){
    closePopups(); // финал — любой открытый вопрос (сдать/продать, резерв) уже не имеет смысла
    const o=document.createElement('div');o.className='dk-over dk-final';
    o.innerHTML='<div class="dk-stampmark">'+S.over.stamp+'</div>'+
      '<p style="margin-top:16px">'+S.over.line+'</p>'+
      '<p class="fig">'+(S.over.won?L.fin.capital(money(S.cash+stock())):L.fin.debtLeft(money(S.debt)))+'</p>'+
      (S.over.rank?'<p style="color:var(--gold);font-weight:700">'+L.fin.rank(S.over.rank)+'</p>':'')+
      (S.over.unlocked?'<p style="color:var(--up)">'+L.fin.unlocked(S.over.unlocked)+'</p>':'')+
      // достижения этой победы: тостом они больше не приходят (после финала тостов нет),
      // и без этой строки игрок узнавал бы о них только зайдя в список достижений
      ((S.over.achs&&S.over.achs.length)
        ?'<p style="color:var(--gold)">'+L.fin.achOpened(S.over.achs.map(id=>{
            const a=ACHS.find(x=>x.id===id);return a?achTxt(a,'n')+' ('+achTxt(a,'b')+')':id}).join('; '))+'</p>':'')+
      overStats();
    const a=document.createElement('div');
    a.style.cssText='display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;justify-content:center';
    const x1=document.createElement('button');x1.textContent=L.fin.exportBtn;x1.onclick=exportLog;
    const x2=document.createElement('button');x2.textContent=L.fin.toMenu;x2.onclick=menu;
    a.appendChild(x1);a.appendChild(x2);o.appendChild(a);
    // Разбор захода сделал финал длиннее экрана — теперь ему, как меню и настройкам,
    // нужна растяжка #root: без неё .dk-over (position:absolute;inset:0) обрывается
    // по высоте игрового экрана, и вся статистика ниже графика оказывается за краем.
    el('root').appendChild(o);bringIntoView();stretchRootFor(o);
  }
  // разово, в момент, когда резерв набирается впервые за заход — предложить явный
  // выбор, а не полагаться на то, что игрок сам заметит текст в панели «Кредитор».
  // askConfirm() — всплывашка (.dk-popup), не .dk-over, поэтому не зависит от чистки
  // выше и не пропадает молча на следующем draw(), пока её явно не закроют.
  if(!S.over&&S.debt<=0&&S.cash>=rTgt&&!S.reserveAnnounced){
    S.reserveAnnounced=1;
    snd('good');
    // если хвосты ещё висят, не зовём закрывать книгу: кнопка всё равно откажет,
    // а обещание, которое интерфейс тут же не выполняет, — худший вид подсказки
    const left=openLive();
    afterToasts(()=>askConfirm(L.fin.reserveGot(money(S.cash),left.length
        ? L.fin.reserveTails(left.map(c=>good(c.g).n+' '+c.done+'/'+c.qty).join(', '))
        : L.fin.reserveFree),
      ()=>earlyClose(),left.length?L.fin.reserveOk:L.fin.reserveClose,L.fin.reserveGoOn));
  }
  // последней строкой: обучение проверяет, выполнил ли игрок шаг, и обновляет
  // свою панель. Именно после всей отрисовки — панель показывает на элементы,
  // которые draw() только что построил заново (см. tutorial-ui.js)
  if(inTut())tutAfterDraw();
}

/* ============ итоговый экран ============
   Заход прожит — и вот тут разбор как раз интересен, в отличие от «Итога» в шапке,
   который мельтешил по ходу игры и был убран (разбор с Сергеем, 2026-08-19). Всё
   считается из копилки S.stats (набивается по ходу захода) и из S.bal/S.tel; ничего
   не парсится обратно из текста журнала. */
function overStats(){
  const st=S.stats||freshStats(),pts=S.bal||[];
  const days=Math.min(S.day,P.days);
  const mins=Math.round(activeSec()/60);
  const travels=S.tel.filter(e=>e.act==='travel').length;
  const waits=S.tel.filter(e=>e.act==='wait').length;
  const failed=S.contracts.filter(c=>c.state==='failed').length;
  const checksTotal=P.checks.length;
  // Пик долга и точка, где были ближе всего к нулю — прямо из ряда балансового графика.
  // «Ближе всего к нулю» считаем не по голому долгу, а по чистой позиции: долг минус
  // касса минус товар по закупке. По голому долгу в проигрышном заходе выигрывал первый
  // день (долг только рос) — строка была формально верной и совершенно пустой.
  const netDebt=p=>p.debt-p.cash-(p.inv||0);
  let peak=null,near=null;
  pts.forEach(p=>{
    if(!peak||p.debt>peak.debt)peak=p;
    if(!near||netDebt(p)<netDebt(near))near=p;
  });
  const money0=v=>money(Math.round(v||0));
  // строка «показатель — число»; cls красит число, когда это потеря или прибыль
  const row=(k,v,cls)=>'<div class="srow"><span class="sk">'+k+'</span><span class="sv'+(cls?' '+cls:'')+'">'+v+'</span></div>';
  const box=(title,rows)=>'<div class="sbox"><h4>'+title+'</h4>'+rows.join('')+'</div>';

  const F=L.fin;
  const trade=box(F.trade,[
    row(F.bought,money0(st.bought)),
    row(F.soldFor,money0(st.sold)),
    row(F.profit,money0(st.profit),st.profit>=0?'pos':'neg'),
    row(F.deals,(st.buys||0)+' / '+(st.sells||0)),
    row(F.cpay,money0(st.cpay),'pos'),
    row(F.closed,S.contractsDone+(failed?F.failedN(failed):''))
  ]);
  const debt=box(F.debtBox,[
    row(F.interest,money0(st.int),'neg'),
    row(F.borrowed,money0(st.borrowed)),
    row(F.repaid,money0(st.repaid),'pos'),
    row(F.fines,money0(st.fine),st.fine?'neg':''),
    row(F.pens,money0(st.pen),st.pen?'neg':''),
    row(F.audits,F.ofN(S.revisionsPassed,checksTotal))
  ]);
  const road=box(F.roadBox,[
    row(F.moves,travels+' / '+waits),
    row(F.freight,money0(st.freight+st.idle),'neg'),
    row(F.upgrades,st.upg?money0(st.upg):F.noUpgrade),
    row(F.mkts,F.ofN(Object.keys(S.visited||{}).length,MKTS.length)),
    row(F.rot,money0(st.rot),st.rot?'neg':''),
    row(F.fakes,S.fakesFound||0)
  ]);
  const risk=box(F.riskBox,[
    row(F.lost,money0(st.lost),st.lost?'neg':''),
    row(F.insBack,money0(st.insBack),st.insBack?'pos':''),
    row(F.serv,money0(st.serv)),
    row(F.bribes,st.bribes?F.bribesN(st.bribes,money0(st.bribe)):F.never),
    row(F.peak,peak?money0(peak.debt)+F.day(peak.d):'—','neg'),
    row(F.nearest,near?money0(netDebt(near))+F.day(near.d):'—',near&&netDebt(near)<=0?'pos':'')
  ]);

  // «Что запомнилось» — то, ради чего разбор и открывают: не столбик чисел,
  // а несколько фраз про конкретные дни этого конкретного захода
  const ev=[];
  const deal=(r,pre)=>F.dealLine(pre,r.g,r.q,mname(r.mkt),r.v>=0?'+':'−',money0(Math.abs(r.v)),r.d);
  if(st.best&&st.best.v>0)ev.push(deal(st.best,F.best));
  if(st.worst&&st.worst.v<0)ev.push(deal(st.worst,F.worst));
  if(st.bigc)ev.push(F.bigc(st.bigc.g,st.bigc.q,(L.tier[st.bigc.tier]||st.bigc.tier),money0(st.bigc.v),st.bigc.d));
  // вид бедствия хранится ключом (rats/fire/...), старые сохранения — словом
  if(st.bigd)ev.push(F.bigd((L.w.disKind[st.bigd.kind]||(st.bigd.kind==='storm'?L.w2.stormKind:st.bigd.kind)),money0(st.bigd.v),st.bigd.d));
  if(peak)ev.push(F.peakLine(peak.d,money0(peak.debt)));
  if(near)ev.push(F.nearLine(near.d,money0(near.debt),money0(near.cash+(near.inv||0)),
    money0(Math.abs(netDebt(near))),netDebt(near)<=0));
  if(!S.everInsured)ev.push(F.noIns);
  if(S.everDistressSold)ev.push(F.distress);
  if(!S.everIdled)ev.push(F.noIdle);
  // главная строка разбора: во что обошёлся сам факт долга по сравнению с тем,
  // что заработано руками. Это и есть предмет игры, а не сумма в кассе
  const earned=Math.round((st.profit||0)+(st.cpay||0));
  // «131% всего, что вы подняли» читается как ошибка, хотя арифметика верная, — поэтому
  // случай «проценты обошлись дороже всей выручки» проговариваем словами, а не долей
  let verdict='';
  if(st.int>0){
    verdict=F.verdict(money0(st.int),money0(earned));
    if(earned>0&&st.int<=earned)verdict+=F.verdictShare(Math.round(st.int/earned*100));
    else if(earned>0)verdict+=F.verdictTimes(fixed(st.int/earned,1));
    else verdict+=F.verdictNone;
  }

  return '<div class="over-stats">'+
    '<div class="dk-legend"><span>'+F.head(days,P.days)+'</span><span>'+F.headTime(mins,S.tel.length)+'</span></div>'+
    (balanceChartSVG()||'')+
    '<div class="chart-key">'+balanceKeyHTML()+'</div>'+
    (verdict?'<p class="verdict">'+verdict+'</p>':'')+
    '<div class="sgrid">'+trade+debt+road+risk+'</div>'+
    (ev.length?'<div class="dk-legend split"><span>'+F.memories+'</span></div><ul class="sevents"><li>'+ev.join('</li><li>')+'</li></ul>':'')+
    '</div>';
}

/* ============ достижения (общий рендер для меню и настроек) ============
   Обычные ачивки — по две в строке (`.ach-grid` — грид на 2 колонки).
   capstone (сейчас только «Без единого костыля») — на всю строку и золотая,
   специально выделяется среди остальных. */
function buildAchGrid(toggle,rerender){
  const wrap=document.createElement('div');wrap.className='ach-wrap';
  const got=ACHS.filter(a=>achDone[a.id]).length;
  wrap.innerHTML='<div class="dk-legend"><span>'+L.set.achTitle(got,ACHS.length)+'</span></div>';
  if(toggle){
    const bulk=document.createElement('div');bulk.style.cssText='display:flex;gap:8px;margin-bottom:8px';
    const offAll=document.createElement('button');offAll.textContent=L.set.offAll;
    offAll.onclick=()=>{ACHS.forEach(a=>{if(achDone[a.id])achOn[a.id]=0});saveStore();snd('click');rerender()};
    const onAll=document.createElement('button');onAll.textContent=L.set.onAll;
    onAll.onclick=()=>{ACHS.forEach(a=>{if(achDone[a.id])achOn[a.id]=1});saveStore();snd('click');rerender()};
    bulk.appendChild(offAll);bulk.appendChild(onAll);wrap.appendChild(bulk);
  }
  const gr=document.createElement('div');gr.className='ach-grid';
  // capstone — всегда первой строкой; дальше открытые впереди закрытых;
  // и в открытых, и в закрытых — сперва не-секретные, потом секретные
  // (иначе «? ? ?» перемешиваются с обычными карточками и сортировка не читается)
  const sorted=ACHS.slice().sort((a,b)=>
    (b.capstone?1:0)-(a.capstone?1:0)||
    (achDone[b.id]?1:0)-(achDone[a.id]?1:0)||
    (a.secret?1:0)-(b.secret?1:0));
  sorted.forEach(a=>{
    const has=!!achDone[a.id],on=achOn[a.id]!==0;
    // видимые (не secret) ачивки показывают условие и бафф даже до открытия —
    // чтобы было к чему стремиться; секретные — только «? ? ?» до победы над условием
    // capstone показывает условие и бафф всегда, даже секретный и не открытый —
    // весь смысл в том, чтобы было видно, к чему идти, а не удивить в моменте
    const known=has||!a.secret;
    // capstone: имя и условие прячутся как у обычного секрета, но бафф виден
    // всегда — должен маячить целью, не только сюрпризом в момент открытия
    const buffKnown=known||a.capstone;
    const c=document.createElement('div');
    c.className='ach '+(has?(on?'':'off'):'locked')+(a.capstone?' capstone':'');
    c.innerHTML='<b>'+(known?achTxt(a,'n'):L.set.hidden)+'</b>'+(known?achTxt(a,'d'):L.set.locked)+
      '<span class="bf">'+(buffKnown?achTxt(a,'b'):'')+'</span>'+
      (has?'<span class="status">'+L.set.opened+'</span>':'');
    if(has&&toggle){
      const t=document.createElement('button');
      t.textContent=on?L.set.off:L.set.on;
      t.onclick=()=>{achOn[a.id]=on?0:1;saveStore();snd('click');rerender()};
      c.appendChild(t);
    }
    gr.appendChild(c);
  });
  wrap.appendChild(gr);
  return wrap;
}

/* ============ настройки (внутри игры) ============ */
function settings(){
  document.querySelectorAll('.dk-over.dk-settings').forEach(n=>n.remove());
  const o=document.createElement('div');o.className='dk-over dk-settings';
  const box=document.createElement('div');box.style.cssText='width:min(560px,100%);text-align:left';
  const h=document.createElement('h2');h.textContent=L.set.title;h.style.cssText='text-align:center';
  box.appendChild(h);
  const sndRow=document.createElement('button');sndRow.className='wide';
  sndRow.textContent=L.set.sound(sndOn);
  sndRow.onclick=()=>{sndOn=!sndOn;if(sndOn)snd('click');rerenderSettings()};
  box.appendChild(sndRow);
  // Переключатель языка. После смены перерисовываем то, что под настройками:
  // меню или сам заход — иначе половина экрана осталась бы на прежнем языке
  const lngRow=document.createElement('button');lngRow.className='wide';
  lngRow.textContent=L.set.lang;
  lngRow.onclick=()=>{
    const inMenu=!!document.querySelector('.dk-over.dk-start');
    setLang(LANG==='ru'?'en':'ru');
    snd('click');
    if(inMenu)menu(); else if(S)draw();
    settings();
  };
  box.appendChild(lngRow);
  box.appendChild(buildAchGrid(true,rerenderSettings));
  const close=document.createElement('button');close.className='wide';close.style.marginTop='10px';
  close.textContent=L.set.close;close.onclick=()=>{o.remove();unstretchRoot()};
  box.appendChild(close);
  o.appendChild(box);
  el('root').appendChild(o);bringIntoView();stretchRootFor(o);
}
function rerenderSettings(){settings()}

/* ============ меню ============ */
function menu(){
  // Брошенный на середине заход — сигнал не хуже проигранного: пишем, на каком дне
  // и с каким долгом игрок ушёл, иначе по логу это выглядит просто обрывом записей
  if(S&&!S.over&&!inTut()&&P)tel('abandon','день '+S.day+' из '+P.days+', долг '+Math.round(S.debt));
  tutStop(); // из обучения выходим начисто: панель шага и подсветка не должны пережить меню
  document.querySelectorAll('.dk-over').forEach(n=>n.remove());
  dropPending(); // уходим в меню — отложенное предложение из захода уже неактуально
  clearToasts(); // через функцию, а не querySelectorAll: она же сбрасывает ссылку на стек
  const o=document.createElement('div');o.className='dk-over dk-start';
  // каждая мысль — с новой строки (было одним абзацем, три разных факта слипались в одну фразу);
  // «репутация рынков» убрана — на этом экране ещё не показывали ни разу, что это такое, а до
  // объяснения (панель «Дороги» внутри захода) звучит голым термином. Вместо неё — то, что реально
  // нужно перед выбором сложности: сколько времени займёт заход (см. docs/PRINCIPLES.md)
  o.innerHTML='<h2>'+L.ui.title+'</h2><p class="lede">'+L.menu.lede+'</p>';
  // на этом экране футер (и его кнопка настроек) скрыт под .dk-over — без своей кнопки
  // настройки отсюда было вообще не открыть. Без класса wide и без своего text-align/
  // text-transform — нарочно: обычная кнопка и так прописными по центру (как «Продолжить»/
  // «Новая игра» ниже), wide это переопределяет на строчные и по левому краю
  const setBtn=document.createElement('button');setBtn.style.cssText='width:min(430px,100%);margin-bottom:14px';
  setBtn.textContent=L.ui.settingsBtn;setBtn.onclick=()=>{snd('click');settings()};
  o.appendChild(setBtn);
  // заход обучения — не заход: предлагать «продолжить» его нельзя, иначе кнопка
  // подменит собой настоящее сохранение игрока
  const live=S&&!S.over&&!inTut();
  // состояние берём либо у идущего захода, либо из сохранения — чтобы на кнопке
  // «Продолжить» стояли настоящие цифры, а не одно слово без контекста
  const st=live?S:(savedSession&&savedSession.S);
  if(st&&PRESETS[st.key]){
    const pr=PRESETS[st.key];
    const b=document.createElement('button');b.className='dk-resume';
    b.innerHTML=L.menu.resume+
      '<i>'+L.menu.resumeLine(dname(st.key),Math.min(st.day,pr.days),pr.days)+'</i>'+
      '<i>'+L.menu.resumeMoney(st.debt,st.cash,st.mkt)+'</i>';
    b.onclick=()=>{if(!live)resumeSession();o.remove();unstretchRoot()};
    o.appendChild(b);
  }
  // разделитель: ниже — только начало новой игры. Отдельной кнопки «Новая игра»
  // больше нет, её роль и так выполняют кнопки сложности под этим заголовком
  const split=document.createElement('div');split.className='dk-split';
  split.innerHTML='<span>'+L.menu.newGame+'</span>';
  o.appendChild(split);
  const d=document.createElement('div');d.className='dk-diff';
  const tut=document.createElement('button');
  const tdone=tutList().filter(l=>tutDone[l.id]).length,ttotal=tutList().length;
  tut.className='tut-entry';
  tut.innerHTML=L.menu.tut+'<i>'+(tdone?L.menu.tutDone(tdone,ttotal):L.menu.tutNew)+'</i>';
  tut.onclick=()=>{snd('click');o.remove();unstretchRoot();tutMenu()};
  d.appendChild(tut);
  ORDER.forEach((k,i)=>{
    const open=!!unlocked[k];
    const b=document.createElement('button');
    b.className=open?'':'lock';
    b.innerHTML=dname(k)+'<i>'+(open?ddesc(k):L.menu.locked(dname(ORDER[i-1])))+'</i>';
    b.disabled=!open;
    if(open)b.onclick=()=>{
      const go=()=>{document.querySelectorAll('.dk-over').forEach(n=>n.remove());snd('click');start(k)};
      // раньше рядом была отдельная кнопка «Новая игра», и выбор сложности читался
      // как «начать заново». Теперь сложности — единственный путь к новой игре,
      // поэтому незаконченный заход спрашиваем прежде, чем стереть
      if(st)askConfirm(L.menu.confirmNew(dname(k),dname(st.key),Math.min(st.day,PRESETS[st.key].days)),
        go,L.menu.confirmYes,L.menu.confirmNo);
      else go();
    };
    d.appendChild(b);
  });
  o.appendChild(d);

  o.appendChild(buildAchGrid(true,menu));
  // страница длинная (до 25 карточек ачивок) и раньше без предупреждения обрывалась
  // прямо на последней — добавляем явный конец с возвратом наверх, к выбору сложности
  const end=document.createElement('div');end.className='dk-end';
  const top=document.createElement('button');
  top.textContent=L.menu.toTop;
  top.onclick=()=>{snd('click');el('root').scrollIntoView({behavior:'smooth',block:'start'})};
  end.appendChild(top);o.appendChild(end);
  el('root').appendChild(o);bringIntoView();stretchRootFor(o);
}
