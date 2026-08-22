/* ============ контракты ============ */
// Товары, на которые золотой контракт в этом заходе ещё НЕ предлагался.
// Правило: один золотой на товар за заход, и точка. Раньше проверялся S.perm,
// который ставится только при ЗАКРЫТИИ золотого — поэтому отказ или просрочка
// золотого открывали дорогу второму золотому на тот же товар. Хуже того, в
// makeOffer стоял безусловный откат `cands=GOODS`, который отменял правило
// целиком, когда свободных товаров не осталось: ровно это дало два золотых
// на «Часы» и два на «Соль» в log-9 (все 4 товара захода уже отметились).
function goldCands(){
  const used=S.contracts.map(c=>c.g);
  return GOODS.filter(x=>!S.goldGoods[x.id]&&used.indexOf(x.id)<0);
}
// avoid — рынок, куда игрок едет прямо сейчас (см. travel/tick). Предписание рождается
// внутри tick(), то есть до того, как S.mkt станет точкой прибытия, и без этого
// исключения гильдия могла назначить сдачу ровно там, куда игрок в тот же миг приедет:
// предписание закрывалось без единого переезда. Тот же запрет, что и на обычный контракт
// со сдачей в текущей точке, только на шаг раньше — на выдаче, а не на приёме.
function makeOffer(kind,avoid){
  const gold=kind==='gold',duty=kind==='duty';
  const used=S.contracts.map(c=>c.g);
  let cands;
  if(gold){
    cands=goldCands();
    // нет подходящего товара — золотой не выдумываем из воздуха (это и был баг),
    // а честно отдаём обычный контракт; refill() спрашивает goldCands() заранее,
    // так что сюда попадает только прямой вызов makeOffer('gold') из тестов
    if(!cands.length)return makeOffer('');
  }else{
    cands=GOODS.filter(x=>used.indexOf(x.id)<0);
    if(!cands.length)cands=GOODS;
  }
  const g=pick(cands);
  if(gold)S.goldGoods[g.id]=1;
  const t=gold?TIERS[2]:pick(TIERS);
  // золотой — заметно тяжелее обычного «крупного» (та же доля трюма ×1.4), а не
  // отдельная произвольная цифра — так они остаются согласованы, если крупный
  // ещё когда-нибудь перетюнят
  const pf=gold?rnd(t.pf[0]*1.4,t.pf[1]*1.4):rnd(t.pf[0],t.pf[1]);
  // Округление к БЛИЖАЙШЕМУ и минимум одна единица. Раньше стояли ceil и минимум
  // две — для тяжёлых товаров это дико перелетало цель и стирало разницу между
  // тирами: «мелкий» на жемчуг (105 мест за единицу) выходил 2 ед. = 210 мест,
  // то есть 84% трюма — крупнее, чем «средний» на лёгкий товар. Ближайшее
  // округление держит объём максимально близко к заявленной доле трюма; для
  // очень тяжёлых товаров шаг в одну единицу и есть предел точности.
  const q=Math.max(1,Math.round(P.cap*pf/g.bulk));
  // сдавать нельзя там же, где предложили контракт — иначе никакой логистики,
  // просто купил и тут же сдал на месте
  const dest=MKTS.filter(x=>x.n!==S.mkt&&x.n!==avoid);
  const m=(dest.length?pick(dest):pick(MKTS)).n;
  const local=g.base*bias[m][g.id];
  let prem=rnd(t.prem[0],t.prem[1]);
  if(gold)prem*=1.15;
  if(duty)prem*=.75;
  const pay=Math.round(local*q*prem*(1+bf('cpay'))*rewardMul()/10)*10;
  // срок короче, чем у обычного «крупного» (12-16 дней) — но не драконовский:
  // объём и так заметно больше (см. pf ×1.4 выше), совсем сжатый срок поверх
  // этого сделал бы контракт не тяжёлым, а нечестным
  const dueDays=gold?irnd(8,11):irnd(t.d[0],t.d[1]);
  return{id:cid++,g:g.id,qty:q,done:0,mkt:m,due:S.day+dueDays,
    pay:pay,pen:Math.round(pay*(duty?.7:t.pen)),tier:gold?'золотой':duty?'предписание':t.k,
    // boost:null у предписания — надбавки за выполнение оно не даёт (см. DUTY_FAIL)
    // надбавка за закрытие тоже растёт со сложностью — и в размере, и в сроке
    gold:gold,duty:duty,boost:duty?null:[t.boost[0]*rewardMul(),t.boost[1]+(rewardMul()>=1.3?1:0)],
    state:duty?'live':'offer',seen:S.day,grab:duty?0:irnd(2,3)};
}
function refill(){
  if(!tutAllows('con'))return; // в уроке контракты ставит сам сценарий, а не рынок
  // суммарно принятые+предложенные не больше 3 — раньше считались только предложения,
  // и принятый контракт незаметно раздувал список до четырёх (баг v8).
  // Предписания в этот лимит НЕ входят: они не предложения, а обязательства,
  // и раньше одно предписание съедало слот, оставляя игрока с двумя контрактами
  // вместо трёх — механика гильдии молча резала обычную торговлю.
  let n=0;
  while(S.contracts.filter(c=>!c.duty&&(c.state==='offer'||c.state==='live')).length<3&&n++<6){
    // canGold спрашиваем ДО решения: иначе refill объявил бы золотой контракт
    // (тост, запись в журнал, gold_offer в телеметрии), а makeOffer отдал бы
    // обычный — то есть игрок увидел бы золотой, которого нет
    const canGold=goldCands().length>0;
    const force=canGold&&S.day>=9&&!S.goldEverOffered&&!S.contracts.some(c=>c.gold);
    const gold=canGold&&(force||(Math.random()<P.gold&&!S.contracts.some(c=>c.gold)));
    if(gold)S.goldEverOffered=1;
    const c=makeOffer(gold?'gold':'');
    S.contracts.push(c);
    if(gold){
      // золотой контракт редкий и ценный — на один звук полагаться нельзя (не всегда
      // слышно/включён), поэтому дублируем явной всплывашкой прямо в момент появления
      announce(L.con.goldTitle,L.con.goldOffer(good(c.g).n,c.qty,mname(c.mkt)),'gold');snd('gold');
      tel('gold_offer',good(c.g).n+' x'+c.qty+' -> '+c.mkt+' $'+c.pay);
    }
  }
}
function accept(id){
  const c=S.contracts.find(x=>x.id===id);if(!c)return;
  if(c.mkt===S.mkt)return; // сдача прямо здесь — нельзя, иначе никакой логистики (баг v9/v10)
  c.state='live';snd('click');
  note(L.con.accepted(good(c.g).n,c.qty,mname(c.mkt),inDays(c.due)),'');
  tel('contract_accept',c.tier+' '+good(c.g).n+' x'+c.qty+' -> '+c.mkt+' $'+c.pay);
  refill();draw();
}
function fulfil(id){
  const c=S.contracts.find(x=>x.id===id);
  if(!c||c.state!=='live'||c.mkt!==S.mkt)return;
  const want=Math.min(qty(c.g),c.qty-c.done);
  if(want<1)return;
  const t=takeLots(c.g,want),ok=t.q-t.fk;
  const paid=Math.round(c.pay*ok/c.qty);
  S.cash+=paid;c.done+=ok;stat('cpay',paid);
  // Копим полученное по контракту целиком: сдача бывает частями, и закрывающий тост
  // раньше называл сумму ПОСЛЕДНЕЙ партии. Контракт на $1 000, сданный как 99+1,
  // закрывался сообщением «Получено $10» — цифра верная, но читается как цена
  // контракта, и выглядит это ограблением.
  c.got=(c.got||0)+paid;
  statTop('bigc',{v:paid,d:S.day,g:good(c.g).n,q:ok,
    tier:c.duty?'предписание':c.gold?'золотой':c.tier},true);
  if(t.fk>0){
    S.exposed[c.g]=(S.exposed[c.g]||0)+t.fk;
    announce(L.msg.fakeTitle,L.msg.fakeAtContract(good(c.g).n,t.fk));snd('bad');
    S.fakesFound+=t.fk;if(S.fakesFound>=5)grant('a7');
    insurePay(t.fk*(t.cost/Math.max(1,t.q)),L.w.fakeWhy);
  }
  // «Получено X за последнюю партию, всего по контракту Y» — но только если сдавали
  // частями: при сдаче одним разом обе суммы совпадают, и вторая половина фразы
  // превратилась бы в шум
  const gotTxt=c.got>paid?L.con.gotPart(paid,c.got):L.con.got(c.got);
  if(c.done>=c.qty){
    c.state='done';
    grant('a13');
    if(c.due-S.day>=5)grant('a22');
    S.contractsDone++;if(S.contractsDone>=5)grant('a8');
    if(c.gold){
      const gtxt=!S.perm[c.g]
        ?L.con.goldDone(gotTxt,Math.round(goldPerm()*100),good(c.g).n)
        :L.con.goldDoneAgain(gotTxt);
      if(!S.perm[c.g])S.perm[c.g]=goldPerm();
      announce(L.con.goldDoneTitle,gtxt,'gold');snd('gold');
      grant('a9');
    }else if(c.duty){
      // предписание надбавки не даёт: обязательное не награждают, вся его механика
      // — в цене провала (DUTY_FAIL при срыве срока, см. tick())
      announce(L.con.dutyDoneTitle,L.con.dutyDone(gotTxt),'good');snd('good');
    }else{
      S.temp[c.g]=S.temp[c.g]||[];
      S.temp[c.g].push({m:c.boost[0],until:S.day+c.boost[1]});
      announce(L.con.doneTitle,L.con.done(gotTxt,Math.round(c.boost[0]*100),good(c.g).n,c.boost[1]),'good');
      snd('good');
    }
    S.contracts=S.contracts.filter(x=>x.id!==c.id);refill();
  }else{
    note(L.con.partial(ok,c.done,c.qty,paid,c.got,c.pay),'pos');snd('good');
  }
  tel('contract_deliver',good(c.g).n+' '+c.done+'/'+c.qty+' $'+paid+' всего $'+c.got);
  chartGood=c.g;draw();
}
// Отказ от контракта — предписания (duty) не трогает, отказаться от них нельзя
// по определению. Освободившийся слот НЕ добирается тут же новым предложением —
// это сделает обычный refill() на ближайшем tick() (любой переезд/простой),
// как и для сорванных/просроченных контрактов.
function decline(id){
  const c=S.contracts.find(x=>x.id===id);
  if(!c||c.duty)return;
  if(c.state==='live'){
    const f=Math.round(c.pen*(1-c.done/c.qty));
    S.debt+=f;
    announce(L.con.declinedTitle,L.con.declined(good(c.g).n,f));snd('bad');
    tel('contract_decline',good(c.g).n+' неустойка $'+f);
  }else{
    note(L.con.declinedOffer(good(c.g).n),'');
    tel('contract_decline_offer',good(c.g).n);
    snd('click');
  }
  S.contracts=S.contracts.filter(x=>x.id!==c.id);
  draw();
}
