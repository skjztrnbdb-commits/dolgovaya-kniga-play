/* ============ мир и заход ============
   Смена дня (проценты, ревизии, порча, бедствия, случайные события), переезды
   между рынками, победа/поражение и старт нового захода. */
/* ============ день ============ */
function rumour(){
  if(!tutAllows('rum'))return; // в уроке фон не нужен: он отвлекает от единственной механики урока
  const lie=Math.random()<P.lie;
  const cands=[];
  MKTS.forEach(m=>{if(m.n===S.mkt)return;GOODS.forEach(g=>{
    const r=rawAt(m.n,g.id);if(!r)return;const k=r/g.base;
    if(k>1.4)cands.push({m:m.n,g:g.n,gid:g.id,hi:1,p:Math.round(r*(1-spreadOf(m.n)/2))});
    else if(k<.72)cands.push({m:m.n,g:g.n,gid:g.id,hi:0,p:Math.round(r*(1+spreadOf(m.n)/2))});
  })});
  let x;
  if(lie||!cands.length){
    const m=pick(MKTS.filter(z=>z.n!==S.mkt)),g=pick(GOODS),hi=Math.random()<.5;
    x={m:m.n,g:g.n,gid:g.id,hi:hi,p:Math.round(g.base*(hi?rnd(1.5,2.1):rnd(.45,.65))),lie:1};
  }else x=pick(cands);
  S.rumours.unshift({d:S.day,trust:!x.lie,mkt:x.m,gid:x.gid,hi:x.hi,p:x.p,
    t:(x.hi?L.misc.rumHigh:L.misc.rumLow)(mname(x.m),x.g,x.p)});
  if(S.rumours.length>10)S.rumours.pop();
  news(S.rumours[0].t,'rum',S.rumours[0].trust);
  S.rumNew=1;snd('rum');
}
// Общая для журнала молвы (draw()) и всплывашки на графике (drawChart()) —
// иначе формулировки могли бы разъехаться, и с графика не было бы видно,
// подтверждён слух или нет.
function rumTrustLabel(r){return P.hintTrust?(r.trust?L.rum.trusted:L.rum.doubted):L.rum.plain}
function addGood(cat){
  const add=pick(cat.filter(g=>!GOODS.some(x=>x.id===g.id)));
  if(!add)return null;
  GOODS.push(add);S.lots[add.id]=[];
  MKTS.forEach(m=>{bias[m.n][add.id]=rnd(m.wild?.65:.78,m.wild?1.45:1.28);S.imp[m.n][add.id]=1});
  GOODS.sort((a,b)=>a.base-b.base);
  return add;
}
function disaster(){
  if(!held())return;
  if(Math.random()>=(P.disaster||0))return;
  const heldGoods=GOODS.filter(g=>qty(g.id)>0);
  if(!heldGoods.length)return;
  const kind=pick(['rats','fire','cart','customs']);
  let val=0,txt='',covered=true,grab=null;
  if(kind==='rats'){
    const g=pick(heldGoods),lose=Math.max(1,Math.round(qty(g.id)*rnd(.15,.3)));
    const t=takeLots(g.id,lose);val=t.cost;
    txt=L.w.rats(t.q,g.n);
  }else if(kind==='fire'){
    // пожар бьёт сразу по нескольким товарам, и раньше он один не называл, по каким:
    // «сгорело 8 единиц груза» — а каких именно, игрок узнавал, пересчитывая трюм
    let n=0;const what=[];
    heldGoods.forEach(g=>{
      const lose=Math.round(qty(g.id)*rnd(.1,.22));
      if(lose>0){const t=takeLots(g.id,lose);val+=t.cost;n+=t.q;what.push(g.n+' '+t.q)}
    });
    txt=L.w.fire(n,what.join(', '));
  }else if(kind==='cart'){
    const g=pick(heldGoods),lose=Math.max(1,Math.round(qty(g.id)*rnd(.1,.25)));
    const t=takeLots(g.id,lose);val=t.cost;
    txt=L.w.cart(t.q,g.n);
  }else{
    const g=pick(heldGoods),lose=Math.max(1,Math.round(qty(g.id)*rnd(.2,.4)));
    // снимок партий ДО изъятия: подкуп возвращает груз ровно тем же, каким он был —
    // с тем же возрастом лотов и тем же числом подделок внутри, а не «новой партией»
    const snap=lots(g.id).map(l=>({q:l.q,c:l.c,age:l.age,fk:l.fk,checked:l.checked}));
    const t=takeLots(g.id,lose);val=t.cost;covered=false;
    txt=L.w.customs(t.q,g.n);
    grab={g:g.id,n:t.q,cost:Math.round(t.cost),snap:snap,name:g.n};
  }
  if(val<=0)return;
  stat('lost',val);
  statTop('bigd',{v:Math.round(val),d:S.day,kind:kind},true);
  // Без этой приписки бедствие ничему не учит: игрок видит «попортили 3 единицы»,
  // не знает, во что это встало в деньгах, и делает вывод «бедствиями можно
  // пренебречь». Теперь в тосте и в журнале стоит цена вопроса и то, что дала бы
  // страховка именно здесь — включая случай, когда она не дала бы ничего.
  // Выплату считаем ДО объявления и называем прямо в нём. Раньше страховка платила
  // молча — отдельной строкой в журнале, которую в потоке событий никто не читал,
  // а тост говорил только о потере. Игрок видел «сгорело на $3 511» при действующем
  // полисе и делал единственно возможный вывод: страховка не работает.
  const back=covered?insurePay(val,L.w.lossWhy,true):0;
  txt+=L.w.lostSum(val);
  if(!covered)txt+=L.w.notCovered;
  else if(back>0)txt+=L.w.insBack(back,val-back,S.insLeft<=0);
  else txt+=L.w.wouldPay(Math.round(val*INS_BACK));
  announce(L.w.disTitle,txt);snd('bad');
  // covered — это «такой тип бедствия в принципе покрывается полисом», а не «игроку
  // возместили». Раньше в лог писалось просто «застраховано», и в log-11 строка
  // утверждала, что потеря застрахована, хотя полиса у игрока не было вовсе.
  // Пишем оба факта отдельно: покрывается ли тип и был ли действующий полис
  const insured=S.ins>=S.day;
  tel('disaster',kind+' потеряно=$'+Math.round(val)+
    (covered?(insured?' возмещено по полису $'+back:' полиса не было'):' конфискат (полисом не покрывается)'));
  if(!covered&&S.ins>=S.day)note(L.w.customsNoIns,'neg');
  if(grab)offerBribe(grab);
}
// Цена вопроса у чиновника: он смотрит не на товар, а на то, насколько игрок в него
// упёрся. Свободный груз — подкуп дешевле потери (есть смысл платить). Груз под
// контракт — дороже потери, но дешевле сорванного контракта. Груз под предписание
// гильдии — совсем дорого: отказаться от предписания нельзя, и чиновник это знает.
function bribeRate(g){
  const live=S.contracts.filter(c=>c.state==='live'&&c.g===g);
  if(live.some(c=>c.duty))return 1.5;
  if(live.length)return 1.2;
  return .8;
}
function offerBribe(grab){
  if(S.over||grab.cost<=0)return;
  const k=bribeRate(grab.g),price=Math.max(1,Math.round(grab.cost*k));
  // винительный падеж: «забрала 1 единицу», а не «1 единица» (принцип 4)
  const what=L.w.bribeWhat(grab.n,grab.name,grab.cost);
  // Раньше при нехватке денег выбор просто не показывали — а игрок, который держит
  // кассу в нуле (то есть любой разумный), не видел его никогда: чиновник забирал груз
  // молча. Теперь платить можно в долг, как и всем остальным в этой игре; недостающее
  // уходит кредитору, и об этом сказано прямо в вопросе.
  const short=Math.max(0,price-Math.round(S.cash));
  const why=k>1.4?L.w.bribeWhyDuty:k>1?L.w.bribeWhyCon:L.w.bribeWhyFree;
  tel('bribe_offer','$'+price+' в кассе $'+Math.round(S.cash)+(short?' в долг $'+short:''));
  afterToasts(()=>askConfirm(L.w.bribeAsk(what,why,price,short),
    ()=>{
      if(S.over)return;
      payOrBorrow(price,L.w.bribeWhy);
      S.lots[grab.g]=grab.snap;stat('bribe',price);stat('bribes',1);
      note(L.w.bribePaid(price),'neg');
      tel('bribe','$'+price+' за '+grab.n+' ед. '+grab.name+' (груз $'+grab.cost+', k='+k+')');
      snd('click');draw();
    },
    L.w.bribeYes(price,short),L.w.bribeNo,
    ()=>{tel('bribe_declined','$'+price+' за '+grab.n+' ед. '+grab.name+' (груз $'+grab.cost+', k='+k+')')}));
}
// arriving — рынок, куда игрок едет этим ходом (у простоя на месте его нет).
// Нужен только для того, чтобы предписание не назначили со сдачей ровно там,
// куда игрок сейчас приедет: у обычных предложений эту дыру закрывает чистка
// «протухших» offer'ов в travel(), а предписание сразу live и под неё не попадало.
// Сводка при возвращении в заход. Возврат непрочитанных тостов её не заменяет:
// игрок мог в сердцах закрыть игру ИМЕННО потому, что завтра ревизия, которую он боится
// не пройти, — тост он при этом погасил, а через неделю сядет играть и закопается
// в цифры, не вспомнив про срок. Поэтому важное пересобирается заново из состояния,
// а не восстанавливается из того, что висело на экране: ключи те же ('revision',
// 'call'), поэтому свежая версия заменяет возвращённую, а не встаёт рядом с ней.
function resumeBriefing(){
  if(!S||S.over)return;
  const said=[];
  const out=revisionOutlook();
  if(out){
    const t=revisionToast(out);
    toast(t[0],t[1],out.over?'':'good','revision');
    said.push('ревизия д.'+out.day+(out.over?' долг выше нормы':' долг в норме'));
  }
  if(S.debt>0&&P.call&&S.debt>=P.call*.85&&S.debt<P.call){
    const zapas=P.call-S.debt;
    toast(L.w.callTitle,L.w.callBrief(S.debt,P.call,zapas),'','call');
    said.push('порог, запас '+Math.round(zapas));
  }
  // горящие обязательства: срок в днях игрок видит и на карточке, но карточку надо
  // ещё найти глазами, а вернувшись через неделю он смотрит не туда
  const hot=S.contracts.filter(c=>c.state==='live'&&c.due-S.day<=2)
    .sort((a,b)=>a.due-b.due);
  if(hot.length){
    toast(L.w.dueTitle,hot.map(c=>L.w.dueLine(c.duty?L.w.dutyPre:c.gold?L.w.goldPre:'',
      good(c.g).n,c.done,c.qty,mname(c.mkt),inDays(c.due))).join('<br>'),'','due');
    said.push('горящих обязательств: '+hot.length);
  }
  if(said.length)tel('resume_briefing',said.join(' · '));
}
// Ближайшая ревизия, если она в пределах трёх дней, вместе с ответом на единственный
// вопрос игрока — успеваю или нет. Считается не по сегодняшнему долгу, а по тому, каким
// он станет ко дню ревизии (проценты набегут и за оставшиеся дни). Товар берём
// по ЗАКУПКЕ: обещать рыночную цену — значит обещать удачную продажу, которой может
// и не случиться. Одна функция на два места: предупреждение по ходу дня (tick) и сводка
// при возвращении в заход (resumeBriefing).
function revisionOutlook(){
  const soon=P.checks.find(c=>{const d=c[0]-S.day;return d>0&&d<=3});
  if(!soon)return null;
  const left=soon[0]-S.day,lim=Math.round(P.debt*soon[1]);
  let future=S.debt;
  for(let d=1;d<=left;d++)future*=1+rateFor(S.day+d);
  return{day:soon[0],left:left,lim:lim,over:S.debt>lim,future:Math.round(future),
    need:Math.max(0,Math.round(future)-lim),have:Math.round(S.cash+invested())};
}
function revisionVerdict(o){
  return o.have>=o.need?L.w.revEnough(o.have,o.need):L.w.revShort(o.have,o.need,o.need-o.have);
}
function revisionToast(o){
  // если провал ревизии сам по себе пробивает порог — это уже не про штраф, а про конец
  // захода, и сказать об этом надо в самом предупреждении, а не оставлять на потом
  // считаем по долгу НА ДЕНЬ РЕВИЗИИ, а не по сегодняшнему: проценты за оставшиеся дни
  // тоже успеют набежать, и без них предупреждение молчало ровно в случае захода 18
  const fine=Math.round(P.debt*.2),deadly=o.over&&P.call&&o.future+fine>P.call;
  return[o.left===1?L.w.revTomorrow:L.w.revInDays(o.left),
    o.over?L.w.revOver(S.debt,o.lim,revisionVerdict(o),deadly,fine,P.call)
          :L.w.revUnder(S.debt,o.lim)];
}
// desert — этот день игрок провёл в пустыне. Пустыня отдельный мир: там нет ни гильдии
// с предписаниями, ни таможни с чиновником, ни новых предложений, ни крыс на складе —
// всё это про людные места. Своё у неё одно: то, что случается на самом тракте
// (см. desertEvent). Проценты, сроки контрактов и ревизии идут своим чередом:
// кредитор не перестаёт считать оттого, что должник в песках.
function tick(arriving,desert){
  S.day++;
  const r=rateFor(S.day),pr=rateFor(S.day-1);
  if(r>pr+1e-9){
    announce(L.w.rateUpTitle,L.w.rateUp(fixed(r*100,1)));snd('bad');
  }
  if(S.debt>0){const i=Math.round(S.debt*r);S.debt+=i;stat('int',i);note(L.w.interest(i),'neg')}
  // Про ревизию игра долбит три дня подряд с цифрами, а про мгновенную смерть —
  // порог, за которым контору забирают, не дожидаясь срока, — молчала вовсе: он висел
  // статичной строкой в панели кредитора с первого дня и в упор не читался. В заходе
  // разработчика смерть случилась с перебором в $76 при $7 858 в кассе: хватило бы
  // внести сотню. Предупреждаем каждый день, пока долг в 15% от порога; ключ 'call' —
  // вчерашняя копия заменяется новой, а не копится рядом с ней (иначе висело бы
  // разом три предупреждения с устаревшими цифрами).
  if(S.debt>0&&P.call&&S.debt>=P.call*.85&&S.debt<P.call&&!S.over){
    const zapas=P.call-S.debt,tomorrow=Math.round(S.debt*rateFor(S.day+1));
    announce(L.w.callTitle,L.w.callWarn(S.debt,P.call,zapas,tomorrow>=zapas?tomorrow:0),'','call');
    tel('call_warn','долг='+Math.round(S.debt)+' порог='+P.call+' запас='+Math.round(zapas));
  }
  if(S.debt<=P.debt/2)grant('a3');
  if(S.cash>=15000)grant('a12');

  // разовое предупреждение за 3 дня до ревизии, если на сегодняшний долг она бы
  // провалилась — иначе штраф и навязанный товар сваливаются без предупреждения
  // Предупреждаем КАЖДЫЙ день, пока ревизия ближе трёх дней и долг выше нормы.
  // Одного раза за три дня мало: за сутки торговли игрок про ревизию забывает
  // начисто — проверено на собственном заходе, предупреждение прилетело на 12-й
  // день и к 15-му о нём никто уже не помнил.
  const out=revisionOutlook();
  let warnToast=null;
  if(out&&out.over){
    const when=L.misc.when(out.left);
    note(L.w.revNote(when,S.debt,out.lim,revisionVerdict(out)),'neg',true); // в телеметрии уже есть toast и revision_warn
    tel('revision_warn','день='+out.day+' осталось='+out.left+' долг='+Math.round(S.debt)+' норма='+out.lim+
      ' внести='+out.need+' на_руках='+out.have+(out.have>=out.need?' хватает':' не хватает'));
    // сам тост показываем в самом конце tick(): после этого места в дне успевают
    // выстрелить бедствие, сорванный контракт, предписание и золотой контракт,
    // а предупреждение о ревизии — самое важное сообщение дня (дальше штраф
    // и навязанный скоропорт), и оно должно лечь последним
    warnToast=revisionToast(out);
  }
  P.checks.forEach(c=>{
    if(S.day!==c[0])return;
    const lim=Math.round(P.debt*c[1]);
    if(S.debt>lim){
      const f=Math.round(P.debt*.2),was=S.debt;S.debt+=f;stat('fine',f);
      const add=addGood(POOL.perish);
      announce(L.w.revFailTitle,L.w.revFail(was,lim,f,add?add.n:''));snd('bad');
      tel('revision_fail','день='+c[0]+' долг='+Math.round(was)+' норма='+lim+' штраф='+f+(add?' навязан:'+add.n:''));
    }else{
      S.relief+=.002;S.revisionsPassed++;
      // все ревизии захода пройдены — ачивка выдаётся сразу, не дожидаясь финала:
      // экзамены уже сданы, и проигрыш на последних днях этого не отменяет
      if(S.revisionsPassed>=P.checks.length)grant('a18');
      const add=addGood(Math.random()<.5?POOL.elite:POOL.stable);
      announce(L.w.revPassTitle,L.w.revPass(add?add.n:''),'good');snd('good');
      tel('revision_pass','день='+c[0]+' долг='+Math.round(S.debt)+' норма='+lim+(add?' открыт:'+add.n:''));
    }
  });

  MKTS.forEach(m=>GOODS.forEach(g=>{
    if(S.imp[m.n][g.id]===undefined)S.imp[m.n][g.id]=1;
    S.imp[m.n][g.id]+=(1-S.imp[m.n][g.id])*.35;
  }));
  S.vol={}; // новый день — рынок «забыл» вчерашние объёмы, свобода до FREE() снова доступна

  // Порча идёт каждый день понемногу, поэтому тост на неё — только когда она
  // заметная: ежедневное всплывающее сообщение игрок начинает гасить не читая,
  // а вместе с ним и всё остальное, что попало в ту же пачку. Порог — доля
  // от стоимости трюма, а не круглая сумма: на Ученике и на Ростовщике, в начале
  // и в конце захода «заметно» — это очень разные деньги.
  const ROT_LOUD=.05;
  let rotVal=0,rotBack=0;const rotWhat=[];
  GOODS.forEach(g=>{
    if(!g.rot||S.tarBarrels)return; // смоляные бочки куплены — скоропорт в трюме не сыреет вовсе
    let lost=0,val=0;
    lots(g.id).forEach(l=>{
      l.age++;
      const d=Math.floor(l.q*(g.rot*P.rot*(1-bf('rot'))*(1+l.age*.12))+Math.random()*.7);
      if(d>0){
        const f=Math.min(l.fk,Math.round(l.fk*d/l.q));
        val+=l.c*d/l.q;l.c-=l.c*d/l.q;l.q-=d;l.fk-=f;lost+=d;
      }else if(l.age>=6)grant('a10');
    });
    S.lots[g.id]=lots(g.id).filter(l=>l.q>0);
    if(lost){
      // Порча уносила деньги молча: строка «отсырело 3 ед.» не называла ни суммы,
      // ни того, что часть вернул страховщик (тот писал отдельной строкой ниже).
      // Теперь одна запись со всеми числами — как у бедствия.
      stat('rot',val);
      const back=insurePay(val,L.w.rotWhy,true);
      rotVal+=val;rotBack+=back;rotWhat.push(g.n+' '+lost+' ед.');
      note(L.w.rotNote(g.n,lost,val,back),'neg');
    }
  });
  // Один тост на весь день, а не по тосту на товар: сгнить за ночь может сразу
  // несколько партий, и три сообщения подряд про одно и то же событие — это шум.
  // База — стоимость трюма ДО порчи, иначе доля считалась бы от того, что уцелело.
  if(rotVal>0){
    const base=invested()+rotVal;
    if(rotVal>=base*ROT_LOUD){
      toast(L.w.rotTitle,L.w.rotToast(rotVal,rotWhat.join(', '),rotBack));
      snd('bad');
    }
    tel('rot','$'+Math.round(rotVal)+' ('+rotWhat.join(', ')+')'+(rotBack>0?' возмещено $'+rotBack:'')+
      ' доля трюма='+(rotVal/(invested()+rotVal)*100).toFixed(1)+'%');
  }
  if(!desert)disaster(); // в пустыне работает только своё бедствие, из desertEvent()

  S.event=null;
  if(Math.random()<P.ev){
    const bad=Math.random()<P.evBad,g=pick(GOODS),m=pick(MKTS);
    const tab=L.ev[g.ev]||L.ev.remeslo;
    S.event={g:g.id,m:m.n,k:bad?rnd(1.7,2.3):rnd(.42,.6)};
    // один текст на журнал и на бегущую строку: разъехаться они не могут
    const evTxt=L.misc.evLine(mname(m.n),pick(bad?tab.hi:tab.lo),g.n,bad);
    note(evTxt,bad?'neg':'pos');
    news(evTxt,'ev');
    // без этой строки скачок цены не доказать по логу: событие писалось только в
    // note(), а тот обрезается до 70 записей. В log-10 медь ушла по $1199 при базе
    // $460 — по логу нельзя было сказать, событие это или удачные bias/imp/надбавки
    tel('event',good(g.id).n+' в «'+m.n+'» x'+S.event.k.toFixed(2)+(bad?' (цена вверх)':' (цена вниз)'));
  }

  S.contracts.forEach(c=>{
    if(c.state==='live'&&S.day>c.due){
      const f=Math.round(c.pen*(1-c.done/c.qty));
      S.debt+=f;c.state='failed';stat('pen',f);
      if(c.duty){
        // сорванное предписание бьёт трижды: неустойка в долг, выросшая НАВСЕГДА
        // ставка (гильдия жалуется кредитору — от этого не увернуться) и упавшая
        // цена продажи этого товара. Надбавки за выполнение у предписания нет
        // по замыслу — вся его механика в цене провала
        S.relief-=DUTY_FAIL.rate; // S.relief вычитается из ставки, минус здесь = рост ставки
        S.temp[c.g]=S.temp[c.g]||[];
        S.temp[c.g].push({m:DUTY_FAIL.sell,until:S.day+DUTY_FAIL.days});
        const pct=Math.round(-DUTY_FAIL.sell*100),rp=fixed(DUTY_FAIL.rate*100,1);
        announce(L.w.dutyFailTitle,L.w.dutyFail(good(c.g).n,f,rp,pct,DUTY_FAIL.days));snd('bad');
        tel('duty_fail',good(c.g).n+' '+c.done+'/'+c.qty+' неустойка=$'+f+' ставка+='+DUTY_FAIL.rate+' цена_продажи='+DUTY_FAIL.sell);
      }else{
        announce(L.w.conFailTitle,L.w.conFail(good(c.g).n,mname(c.mkt),f));snd('bad');
        tel('contract_fail',good(c.g).n+' '+c.done+'/'+c.qty+' неустойка=$'+f);
      }
    }
    if(c.state==='offer'){c.grab--;if(c.grab<0)c.state='gone'}
  });
  S.contracts=S.contracts.filter(c=>c.state==='offer'||c.state==='live');
  if(!desert&&P.duty&&!goalMet()&&Math.random()<P.duty&&!S.contracts.some(c=>c.duty)){
    const d=makeOffer('duty',arriving);S.contracts.push(d);
    announce(L.w.dutyTitle,L.w.dutyOffer(good(d.g).n,d.qty,mname(d.mkt),inDays(d.due)));snd('bad');
    tel('duty_offer',good(d.g).n+' x'+d.qty+' -> '+d.mkt+' $'+d.pay);
  }
  if(!desert)refill(); // новые предложения появляются на рынках, а не среди барханов
  Object.keys(S.temp).forEach(k=>{S.temp[k]=S.temp[k].filter(b=>b.until>=S.day)});
  // предупреждение о ревизии — последним, чтобы его не затёр тост любого события
  // выше, и «липким» (без автогашения): важнее прочего, тут решается заход
  // ключ 'revision': завтрашнее предупреждение заменит сегодняшнее, а не ляжет рядом
  if(warnToast){toast(warnToast[0],warnToast[1],'','revision');snd('bad')}
}
function reserveTarget(){return Math.round(P.debt*.4)}
// Ни одной проваленной ревизии из тех, что УСПЕЛИ состояться. Досрочная победа
// не должна отнимать ачивку: заход 22 — ревизия 8-го дня пройдена, книга закрыта
// на 15-й, вторая (16-й день) просто не наступила. Хотя бы одна состояться обязана —
// иначе победа на пятый день давала бы «экзамены» вообще без экзаменов.
function examsClean(){
  const due=P.checks.filter(c=>c[0]<=S.day).length;
  return due>=1&&S.revisionsPassed>=due;
}
// Принятые обязательства, которые ещё висят: и обычные контракты, и предписания.
// Непринятые предложения сюда НЕ входят — игрок под ними не подписывался.
const openLive=()=>S.contracts.filter(c=>c.state==='live');
// Цель достигнута: долг закрыт и резерв набран. С этого момента новых предписаний
// не выдаём — от них нельзя отказаться, и они бесконечно откладывали бы законный
// финал, требуя закрыть хвост, которого игрок не просил.
const goalMet=()=>S.debt<=0&&S.cash>=reserveTarget();
function rankFor(){
  const daysLeft=P.days-S.day,cap=S.cash+stock(),tgt=reserveTarget();
  if(daysLeft>=Math.round(P.days*.35)&&cap>=tgt*2)return L.w2.rank1;
  if(daysLeft>=Math.round(P.days*.15)&&cap>=tgt*1.25)return L.w2.rank2;
  return L.w2.rank3;
}
function earlyClose(){
  if(!S||S.over||S.debt>0||S.cash<reserveTarget())return;
  // хвосты закрываем до финала: контора с висящими обязательствами не «чистая»,
  // а закрыть книгу и оставить гильдию с невывезенным грузом — не победа
  const left=openLive();
  if(left.length){
    announce(L.w.tailsTitle,L.w.tails(left.map(c=>L.w.tailItem(c.duty,good(c.g).n,c.done,c.qty,mname(c.mkt))).join('; ')),'info');
    draw();return;
  }
  finish(true,L.w2.endEarly(P.days-S.day),{rank:rankFor()});
  draw();
}
// Ход, после которого проценты перевалят порог, — это не ход, а конец захода. Игра
// обязана сказать об этом ДО, а не показать штамп ПОСЛЕ: смерть по недосмотру
// («я не заметил, что процентов накапает больше запаса») — самый обидный способ
// проиграть. Не запрещаем: ехать под нож бывает единственным вариантом, но пусть
// это будет решение, а не случайность.
function fatalMove(){
  if(!P.call||S.debt<=0)return null;
  const i=Math.round(S.debt*rateFor(S.day+1));
  let after=Math.round(S.debt)+i,fine=0;
  // Штраф за проваленную ревизию прилетает в тот же день, что и проценты, — и в заходе 18
  // именно он добил долг до порога с перебором в $60 при $16 265 в кассе. Считать только
  // проценты значит промолчать ровно тогда, когда предупреждение нужнее всего.
  const chk=P.checks.find(c=>c[0]===S.day+1);
  if(chk&&after>Math.round(P.debt*chk[1])){fine=Math.round(P.debt*.2);after+=fine}
  return after>P.call?{i:i,fine:fine,after:after}:null;
}
// stopDesert — «заехать к бедуину»: с конями тракт проходится за день и мимо шатра,
// и если игрок хочет к нему, он платит за это тем же днём, что экономили кони.
// confirmed — игрок уже подтвердил, что готов сделать заведомо смертельный ход.
function travel(dest,stopDesert,confirmed){
  if(S.over)return;
  const doom=confirmed?null:fatalMove();
  if(doom){
    askConfirm((doom.fine?L.w2.doomFine(doom.i,doom.fine,doom.after):L.w2.doomPlain(doom.i,doom.after))+
      L.w2.doomTail(P.call,S.cash,S.debt>0,!!dest),
      ()=>{tel('fatal_move','подтвердил: долг '+Math.round(S.debt)+' + проценты '+doom.i+
          (doom.fine?' + штраф '+doom.fine:'')+' > '+P.call);
        travel(dest,stopDesert,1)},
      L.w2.doomYes(!!dest),L.w2.doomNo,
      ()=>tel('fatal_move_cancel','долг '+Math.round(S.debt)+' + проценты '+doom.i+
        (doom.fine?' + штраф '+doom.fine:'')+' > '+P.call));
    return;
  }
  const f=dest?freight():idleFee();
  stat(dest?'freight':'idle',f);
  if(f>S.cash){const d=f-S.cash;S.debt+=d;S.cash=0;note(L.w2.shortPay(d),'neg')}
  else S.cash-=f;
  snd(dest?'travel':'click');
  const long=dest?isLongRoad(S.mkt,dest):false;
  let days=dest?roadDays(S.mkt,dest):1;
  if(long&&stopDesert&&S.horses)days++; // за привал у шатра платим сэкономленным днём
  tel(dest?'travel':'wait',(dest?S.mkt+' -> '+dest+(days>1?' ('+days+' дн. пути)':''):'переждал день')+' расход $'+f);
  note(dest?L.w2.moved(mname(S.mkt),mname(dest),f,days):L.w2.waited(f),'');
  // Дальний тракт — это несколько суток подряд: проценты капают за каждые, цены
  // перебрасываются за каждые, и бедствие может случиться в каждые. Точку на балансовом
  // графике за промежуточный день ставим руками: draw() будет только в конце поездки,
  // а день в графике пропадать не должен.
  // пустыня на тракте случается всегда — и с конями, и без: её всё равно проезжают
  let desert=null;
  for(let d=0;d<days&&!S.over;d++){
    if(d)refreshBalToday();
    tick(dest,long&&d===0); // первый день тракта проходит в песках
    if(long&&d===0)desert=desertEvent();
    if(d<days-1)rollAll();
  }
  // «сбились с пути» — лишние сутки поверх всего остального, и тоже в пустыне
  if(desert&&desert.extra&&!S.over){refreshBalToday();tick(dest,1);rollAll()}
  if(dest){
    S.mkt=dest;S.visited[dest]=1;
    if(Object.keys(S.visited).length>=MKTS.length)grant('a16');
    // предложение (не принятое) со сдачей ровно там, куда мы только что приехали,
    // никогда не получится принять (accept() запрещает сдачу в текущей точке) —
    // держать его в списке бессмысленно и сбивает с толку, сразу заменяем на новое
    const stale=S.contracts.some(c=>c.state==='offer'&&c.mkt===dest);
    if(stale){
      S.contracts=S.contracts.filter(c=>!(c.state==='offer'&&c.mkt===dest));
      refill();
    }
  }else S.everIdled=1;
  rollAll();rumour();
  // после каждого переезда открываем балансовый график: день сменился, набежали
  // проценты — это момент, когда игроку важнее общая траектория, а не цена товара
  chartGood=BAL;
  if(S.debt>P.call)finish(false,L.w2.endCall);
  else if(S.day>P.days){
    const tgt=reserveTarget();
    if(S.debt<=0&&S.cash>=tgt&&!openLive().length)finish(true,L.w2.endWin);
    else if(S.debt<=0&&S.cash>=tgt)finish(false,L.w2.endTails,{stamp:L.w2.stampTails});
    else if(S.debt<=0)finish(false,L.w2.endNoReserve,{stamp:L.w2.stampNotReady});
    else finish(false,L.w2.endLose);
  }
  // Разовая за заход подсказка про страховку: в log-13 полис не покупался ни разу
  // за 24 дня при трёх бедствиях — игрок считал, что полис сгорает на первом переезде,
  // и что бедствия мелкие. Один раз показать цену вопроса стоит, каждый переезд —
  // уже нытьё, поэтому флаг S.insHinted и порог «в трюме заметные деньги».
  if(dest&&!S.over&&!S.insHinted&&S.ins<S.day&&invested()>=P.debt*.15){
    S.insHinted=1;
    announce(L.w2.noInsTitle,L.w2.noIns(invested(),Math.round(INS_BACK*100),insCost()),'info');
    tel('insurance_hint','в трюме=$'+Math.round(invested()));
  }
  // привал у шатра: без коней он сам собой, с конями — только если игрок выбрал заехать
  if(long&&!S.over&&(!S.horses||stopDesert)&&Math.random()<.55)meetBedouin();
  else if(dest&&!S.over&&!long)maybeTrader();
  if(dest&&!S.over){
    const waiting=S.contracts.filter(c=>c.state==='live'&&c.mkt===dest&&qty(c.g)>0);
    // Три вида обязательств — три разных сообщения, в одну строку их сводить нельзя:
    // игрок читал «здесь ждут по контракту: Зерно» и про предписание гильдии (от него
    // нельзя отказаться, срыв бьёт неустойкой в долг), и про золотой (постоянная
    // надбавка за закрытие). Цвет тоста — тот же, что у этого обязательства везде
    // ещё: предписание красное, золотой золотой, обычный контракт зелёный. Порядок —
    // от тяжёлого к приятному: сорванное предписание стоит дороже всего остального.
    const duties=waiting.filter(c=>c.duty),golds=waiting.filter(c=>c.gold),
          deals=waiting.filter(c=>!c.duty&&!c.gold);
    if(duties.length)announce(L.w2.waitDutyTitle,L.w2.waitDuty(duties.map(c=>good(c.g).n).join(', ')));
    if(golds.length)announce(L.w2.waitGoldTitle,L.w2.waitGold(golds.map(c=>good(c.g).n).join(', ')),'gold');
    if(deals.length)announce(L.w2.waitConTitle,L.w2.waitCon(deals.map(c=>good(c.g).n).join(', ')),'good');
  }
  draw();
}
function finish(won,line,opts){
  opts=opts||{};
  const achBefore=Object.keys(achDone);
  S.over={won:won,line:line,stamp:opts.stamp||(won?L.w2.stampPaid:L.w2.stampBust),rank:opts.rank};
  // всё, что висело на экране в последний день, гасим: заход кончился, и новости
  // про завтрашнюю ревизию к нему уже не относятся (S.over выставлен выше, поэтому
  // новые тосты и не появятся — см. toast() в ui.js)
  clearToasts();
  // line уже содержит конкретную причину (провал по сроку долга vs по резерву
  // vs успех) — раньше tel писал только «погашено/банкрот» одним словом, и при
  // разборе чужого лога нельзя было понять, какая именно из веток сработала
  // ранг — тоже в лог: он показывает, победа была впритык или с запасом, а по
  // одной строке «погашено» этого не видно (в log-10 итог $6575 при пороге $6000 —
  // «едва свели баланс», и это надо читать из лога, а не досчитывать вручную)
  tel('end',(won?'погашено: ':'банкрот: ')+line+(opts.rank?' | ранг: '+opts.rank:''));
  // сводка по косвенным признакам прямо в лог: скучал ли, буксовал ли, затянуло ли.
  // Считается по журналу этого захода — см. engagement() в telemetry.js
  tel('engagement',engagementLine());
  if(won){
    grant('a4');
    if(P.days-S.day>=5)grant('a11');
    if(S.key==='norm')grant('a14');
    if(S.key==='hard')grant('a15');
    if(!S.everIdled)grant('a17');
    if(examsClean())grant('a18');
    if(!S.everInsured)grant('a19');
    if(!S.everAppraised)grant('a20');
    if(!S.everDistressSold)grant('a23');
    if(S.key==='hard'){
      // «Без единого костыля»: все остальные достижения уже открыты и на время
      // ЭТОГО забега выключены руками — bf() в таком забеге ничего не даёт,
      // победа целиком на своих силах, без подсказок-баффов от прошлых заходов
      const others=ACHS.filter(a=>a.id!=='a25');
      if(others.every(a=>achDone[a.id])&&others.every(a=>achOn[a.id]===0))grant('a25');
    }
    const i=ORDER.indexOf(S.key);
    if(i>=0&&ORDER[i+1]&&!unlocked[ORDER[i+1]]){
      unlocked[ORDER[i+1]]=1;saveStore();S.over.unlocked=PRESETS[ORDER[i+1]].n;
    }
    snd('gold');
  }else snd('bad');
  // Достижения этой победы тостом уже не покажутся (после S.over тостов нет),
  // поэтому они перечисляются на итоговом экране — там им и место: это часть
  // разбора захода, а не всплывашка, которую гасят не читая.
  const fresh=Object.keys(achDone).filter(id=>achBefore.indexOf(id)<0);
  if(fresh.length)S.over.achs=fresh;
}

/* ============ пустыня и её обитатель ============
   Дальний тракт идёт не по пустому месту: посередине пустыня, где не торгуют, где
   портится груз и где иногда стоит шатёр бедуина. Пустыню проезжают всегда — и с конями,
   и без; кони лишь избавляют от привала. Заехать к бедуину с конями можно, но тогда
   поездка снова стоит два дня: за разговор платят временем. */
function desertEvent(){
  const r=Math.random();
  if(r<.30&&held()){                       // песчаная буря: часть груза в песок
    const g=pick(GOODS.filter(x=>qty(x.id)>0));
    if(g){
      const lose=Math.max(1,Math.round(qty(g.id)*rnd(.08,.2)));
      const snap=lots(g.id).map(l=>({q:l.q,c:l.c,age:l.age,fk:l.fk,checked:l.checked}));
      const t=takeLots(g.id,lose);
      if(t.cost>0){
        stat('lost',t.cost);
        statTop('bigd',{v:Math.round(t.cost),d:S.day,kind:'storm'},true);
        const back=insurePay(t.cost,L.w2.stormWhy,true);
        announce(L.w2.stormTitle,L.w2.storm(t.q,g.n,t.cost,back));
        snd('bad');tel('desert','буря '+g.n+' -'+t.q+' ед. $'+Math.round(t.cost)+(back?' возмещено $'+back:''));
        return{lost:1,snap:snap};
      }
    }
  }
  if(r<.45){                               // сбились с пути: лишние сутки
    announce(L.w2.lostWayTitle,L.w2.lostWay);
    snd('bad');tel('desert','лишний день пути');
    return{extra:1};
  }
  tel('desert','пусто');
  return{};
}
// Бедуин стоит в пустыне не каждый день, и предлагает не всё сразу — иначе шатёр
// превращается в постоянный магазин, а он должен быть встречей.
function bedouinOffers(){
  const out=[];
  // 1) скупщик неликвида: берёт разоблачённые подделки дороже барыги
  const junk=GOODS.filter(g=>expCount(g.id)>0);
  if(junk.length){
    const g=pick(junk),n=expCount(g.id),per=Math.round(disposeVal(g.id)*rnd(1.8,2.4)),total=per*n;
    out.push({kind:'junk',g:g.id,n:n,total:total,
      label:L.w2.offJunk(g.n,n),sub:L.w2.offJunkSub(per,total)});
  }
  // 2) партия вслепую: дёшево, но что в ящиках — знает только он
  const sale=GOODS.filter(g=>rawAt(S.mkt,g.id)||true);
  if(sale.length&&room()>0){
    const g=pick(sale),base=Math.round(g.base*rnd(.5,.72));
    const n=Math.max(1,Math.min(Math.floor(room()/g.bulk),Math.round(P.cap*rnd(.15,.3)/g.bulk)));
    if(n>0)out.push({kind:'blind',g:g.id,n:n,price:base*n,per:base,
      label:L.w2.offBlind(g.n,n),sub:L.w2.offBlindSub(base*n,base,g.base)});
  }
  // 3) сведения: история цен по товару на всех рынках
  const unknown=GOODS.filter(g=>!(S.lore||{})[g.id]);
  if(unknown.length){
    const g=pick(unknown),c=loreCost(g.id);
    out.push({kind:'lore',g:g.id,cost:c,
      label:L.w2.offLore(g.n),sub:L.w2.offLoreSub(c)});
  }
  return out.slice(0,3);
}
function bedouinPick(o){
  if(o.kind==='junk'){
    S.cash+=o.total;S.exposed[o.g]=0;
    note(L.w2.bedJunk(good(o.g).n,o.n,o.total),'pos');
    tel('bedouin','неликвид '+good(o.g).n+' x'+o.n+' $'+o.total);snd('sell');
  }else if(o.kind==='blind'){
    if(room()<good(o.g).bulk*o.n)return;
    // подделок в такой партии заметно больше обычного — это и есть цена «не глядя»
    let fakes=0;for(let i=0;i<o.n;i++)if(Math.random()<rnd(.15,.4))fakes++;
    payOrBorrow(o.price,L.w2.blindWhy);
    S.lots[o.g]=S.lots[o.g]||[];
    S.lots[o.g].push({q:o.n,c:o.price,age:0,fk:fakes,checked:0});
    stat('bought',o.price);stat('buys',1);
    note(L.w2.bedBlind(good(o.g).n,o.n,o.price),'');
    tel('bedouin','партия вслепую '+good(o.g).n+' x'+o.n+' $'+o.price+' подделок:'+fakes);snd('buy');
  }else{
    payOrBorrow(o.cost,L.w.loreWhy);stat('serv',o.cost);
    const added=revealLore(o.g);
    announce(L.w2.loreTitle,L.w2.bedLore(good(o.g).n,added),'good');
    chartGood=o.g;
    tel('bedouin','записи '+good(o.g).n+' $'+o.cost+' точек:'+added);snd('good');
  }
  draw();
}
function meetBedouin(){
  const offers=bedouinOffers();
  if(!offers.length)return;
  S.desertSeen=1;
  tel('bedouin_offer',offers.map(o=>o.kind).join(','));
  afterToasts(()=>askChoice(L.w2.tentTitle,L.w2.tent,
    // кнопки не гасим по деньгам: не хватает — уйдёт в долг, и об этом сказано прямо
    offers.map(o=>({label:o.label,
      sub:o.sub+(o.kind!=='junk'&&S.cash<(o.price||o.cost)?L.w2.onDebt:''),
      kind:o.kind==='junk'?'sell':'buy',
      disabled:o.kind==='blind'&&room()<good(o.g).bulk*o.n,
      onPick:()=>bedouinPick(o)})),
    L.w2.tentLeave,
    ()=>{tel('bedouin','ушли ни с чем');draw()}));
}
/* ============ бродячий трейдер ============
   То же, что третье предложение бедуина, но приходит сам и на обычные рынки. В пустыне
   не появляется никогда: там уже есть кому торговать сведениями, и двое сразу — это
   не встреча, а базар. */
function maybeTrader(){
  if(S.over||S.day<5)return;
  if((S.trader||{}).last&&S.day-S.trader.last<4)return; // не чаще раза в четыре дня
  if(Math.random()>=.18)return;
  const unknown=GOODS.filter(g=>!(S.lore||{})[g.id]);
  if(!unknown.length)return;
  const list=shuf(unknown).slice(0,3).map(g=>({g:g.id,cost:loreCost(g.id)}));
  const all=list.reduce((s,x)=>s+x.cost,0),bulkPrice=Math.round(all*.65);
  S.trader.last=S.day;
  tel('trader_offer',list.map(x=>good(x.g).n).join(','));
  const opts=list.map(x=>({label:L.w2.traderOne(good(x.g).n),
    sub:L.w2.traderOneSub(x.cost)+(S.cash<x.cost?L.w2.onDebt:''),
    kind:'buy',
    onPick:()=>{payOrBorrow(x.cost,L.w.loreWhy);stat('serv',x.cost);const a=revealLore(x.g);chartGood=x.g;
      announce(L.w2.loreTitle,L.w2.traderGot(good(x.g).n,a),'good');
      tel('trader','записи '+good(x.g).n+' $'+x.cost);snd('good');draw()}}));
  if(list.length>1)opts.push({label:L.w2.traderAll(list.length),
    sub:L.w2.traderAllSub(bulkPrice,all)+(S.cash<bulkPrice?L.w2.onDebt:''),kind:'buy',
    onPick:()=>{payOrBorrow(bulkPrice,L.w.loreWhy);stat('serv',bulkPrice);let a=0;list.forEach(x=>{a+=revealLore(x.g)});
      chartGood=list[0].g;
      announce(L.w2.loreTitle,L.w2.traderGotAll(a),'good');
      tel('trader','всё разом $'+bulkPrice+' товаров:'+list.length);snd('good');draw()}});
  afterToasts(()=>askChoice(L.w2.traderTitle,L.w2.trader,
    opts,L.w2.traderLeave,()=>{tel('trader','отказались');draw()}));
}
/* ============ старт ============ */
function buildMarkets(){
  MKTS=P.mkts?ALL_MKTS.filter(m=>P.mkts.indexOf(m.n)>=0):ALL_MKTS.slice();
  NB={};MKTS.forEach(m=>NB[m.n]=[]);
  ROAD={}; // сколько дней занимает переезд между соседями; по умолчанию один
  const link=(a,b,days)=>{
    if(!NB[a]||!NB[b])return;
    NB[a].push(b);NB[b].push(a);
    if(days>1){ROAD[a+'|'+b]=days;ROAD[b+'|'+a]=days}
  };
  EDGES.forEach(e=>link(e[0],e[1],1));
  // тракт появляется на карте, только когда он открыт: на Приказчике сразу,
  // на Ростовщике — после покупки. Перестраиваем NB и в момент покупки (buyRoad)
  if(roadOpen())LONG_EDGES.forEach(e=>link(e[0],e[1],e[2]));
}
const roadOpen=()=>!!(P.longRoad&&S&&S.road);
// Дней пути до соседнего рынка. Отдельная функция, а не поле у ребра, потому что
// спрашивают её из четырёх мест: сама поездка, кнопки переезда, карта и подсказки.
// Быстрые кони сокращают дальний тракт вдвое — в этом вся их покупка.
const roadDays=(from,to)=>{
  const d=ROAD[from+'|'+to]||1;
  return d>1&&S&&S.horses?d-1:d;
};
const isLongRoad=(from,to)=>!!ROAD[from+'|'+to];
function start(key){
  // Новый заход сразу после финала — сильный признак того, что игра зацепила:
  // запоминаем ДО того, как S будет перезаписан, и пишем в журнал нового захода
  const after=S&&S.over?(S.over.won?'после победы':'после поражения'):null;
  // Начали настоящий заход — обучение закончено, чем бы оно ни закончилось.
  // Обычно из обучения выходят через меню (оно тоже зовёт tutStop), но полагаться
  // на единственный путь нельзя: пока TUT жив, grant() молчит и достижения захода
  // не выдаются вовсе. Исключение — сам заход обучения, его start() и запускает.
  if(key!=='tut')tutStop();
  P=PRESETS[key];cid=1;wall0=performance.now();actMs=0;actFrom=performance.now();lastAct=0;
  GOODS=shuf(POOL.perish).slice(0,P.mix[0])
    .concat(shuf(POOL.stable).slice(0,P.mix[1]))
    .concat(shuf(POOL.elite).slice(0,P.mix[2]))
    .sort((a,b)=>a.base-b.base);
  buildMarkets();
  bias={};MKTS.forEach(m=>{bias[m.n]={};GOODS.forEach(g=>bias[m.n][g.id]=rnd(m.wild?.65:.78,m.wild?1.45:1.28))});
  seen={};MKTS.forEach(m=>seen[m.n]={});
  S={key:key,day:1,cash:P.cash,debt:P.debt,cap:P.cap,mkt:MKTS[Math.min(1,MKTS.length-1)].n,
     lots:{},up:0,raw:{},imp:{},hist:{},bal:[],contracts:[],ins:0,log:[],rumours:[],rumNew:0,news:[],
     temp:{},perm:{},relief:0,contractsDone:0,fakesFound:0,over:null,event:null,tel:[],
     exposed:{},goldEverOffered:0,goldGoods:{},vol:{},tarBarrels:0,
     // состояние для достижений, требующих смотреть на заход целиком (см. finish())
     visited:{},everIdled:0,revisionsPassed:0,everInsured:0,everAppraised:0,everDistressSold:0,
     reserveAnnounced:0,insHinted:0,insSum:0,insLeft:0,stats:freshStats(),toasts:[],toastSeq:0,
     // тракт: на Приказчике открыт сразу (longRoad:2), на Ростовщике покупается
     road:P.longRoad===2?1:0,horses:0,desertSeen:0,histAll:{},lore:{},trader:{},build:BUILD};
  buildMarkets(); // NB строится второй раз: теперь известно, открыт ли тракт
  S.visited[S.mkt]=1;
  GOODS.forEach(g=>S.lots[g.id]=[]);
  MKTS.forEach(m=>{S.imp[m.n]={};S.hist[m.n]={};GOODS.forEach(g=>S.imp[m.n][g.id]=1)});
  chartGood=GOODS[0].id;
  rollAll();refill();rumour();
  note(L.w2.startNote(P.days),'');
  tel('start',key+' | '+GOODS.map(g=>g.n).join(','));
  if(after)tel('again',after);
  el('sub').textContent=L.ui.house+' · '+dname(S.key);
  draw();
}
// Восстановление захода после перезагрузки страницы, из снимка saveSession().
// Обёрнуто в try/catch: снимок — данные из localStorage, которые могли остаться
// от старой версии игры (другой набор товаров и т. п.) — тогда просто откатываемся
// в меню, вместо того чтобы упасть посреди отрисовки.
function resumeSession(){
  const snap=savedSession;
  if(!snap)return;
  try{
    S=snap.S;P=PRESETS[S.key];
    if(!P)throw new Error('неизвестная сложность в сохранённом заходе');
    buildMarkets();
    GOODS=snap.goods.map(id=>POOL_BY_ID[id]).filter(Boolean);
    if(!GOODS.length)throw new Error('не удалось восстановить товары захода');
    bias=snap.bias||{};seen=snap.seen||{};cid=snap.cid||1;
    // после перезагрузки открываем баланс, а не тот товар, на котором прервались:
    // возвращаясь к заходу, игрок сперва спрашивает «где я по деньгам», а не «почём
    // была медь» — тот же принцип, что и при переезде (см. travel)
    chartGood=BAL;
    // снимок мог остаться от версии игры до добавления этих полей — без
    // дефолтов первый же travel() упал бы на S.visited[dest]=1
    if(!S.visited)S.visited={};
    S.visited[S.mkt]=1;
    if(S.everIdled===undefined)S.everIdled=0;
    if(S.revisionsPassed===undefined)S.revisionsPassed=0;
    if(S.everInsured===undefined)S.everInsured=0;
    if(S.everAppraised===undefined)S.everAppraised=0;
    if(S.everDistressSold===undefined)S.everDistressSold=0;
    if(S.reserveAnnounced===undefined)S.reserveAnnounced=0;
    if(S.insHinted===undefined)S.insHinted=0;
    // полис из сохранения, сделанного до страховой суммы: считаем, что он покрывает
    // то, что лежит в трюме сейчас — иначе старый полис молча перестал бы платить
    if(S.insSum===undefined){S.insSum=Math.round(invested());S.insLeft=S.insSum}
    if(S.road===undefined)S.road=P.longRoad===2?1:0;
    if(S.horses===undefined)S.horses=0;
    if(S.desertSeen===undefined)S.desertSeen=0;
    if(!S.histAll)S.histAll={};
    if(!S.lore)S.lore={};
    if(!S.trader)S.trader={};
    if(!S.news)S.news=[];   // снимок захода, начатого до появления бегущей строки
    buildMarkets(); // тракт мог быть куплен в сохранённом заходе
    if(!S.stats)S.stats=freshStats(); // снимок захода, начатого до появления копилки
    if(!S.toasts)S.toasts=[];         // снимок до того, как тосты стали переживать перезагрузку
    if(S.toastSeq===undefined)S.toastSeq=0;
    if(S.tarBarrels===undefined)S.tarBarrels=0;
    if(!S.bal)S.bal=[]; // сохранение до появления балансового графика
    // старое сохранение без учёта выданных золотых: восстанавливаем по S.perm —
    // это не полный список (отказы/просрочки там не отмечены), но лучше пустого:
    // хотя бы товары с уже полученной надбавкой не получат золотой повторно
    if(!S.goldGoods){S.goldGoods={};Object.keys(S.perm||{}).forEach(k=>S.goldGoods[k]=1)}
    wall0=performance.now();actMs=0;actFrom=performance.now();lastAct=0;
    el('sub').textContent=L.ui.house+' · '+dname(S.key);
    // Заход живёт днями и переживает обновления игры. Без отметки в логе потом
    // не понять, почему в начале захода тексты одни, а в конце другие (заход 18).
    if(S.build&&S.build!==BUILD)tel('build_change',S.build+' -> '+BUILD);
    S.build=BUILD;
    tel('resume','восстановлено после перезагрузки');
    draw();
    replayToasts();   // сперва возвращаем непрочитанное — то, что игрок не успел закрыть
    resumeBriefing(); // а поверх кладём важное на сейчас, даже если он это уже закрывал
  }catch(e){
    S=null;clearSession();menu();
  }
}
