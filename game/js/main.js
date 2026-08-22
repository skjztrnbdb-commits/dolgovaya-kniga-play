/* ============ точка входа ============
   Загружается последним: развешивает обработчики кнопок (ссылаются на функции
   из других модулей лениво, внутри замыканий — поэтому порядок загрузки этого
   файла относительно них не важен, важно лишь, что он последний), выставляет
   тестовый хук и запускает игру. */
/* ============ обработчики ============ */
el('wait').onclick=()=>travel(null);
el('upgrade').onclick=()=>{
  const c=upCost();if(!c||S.cash<c)return;
  S.cash-=c;S.cap+=UPSTEP;S.up++;stat('upg',c);snd('good');
  note(L.msg.upgraded(capacity(),c),'');
  tel('upgrade','трюм='+capacity());draw();
};
el('appraise').onclick=appraise;
el('insure').onclick=insure;
el('tar').onclick=buyTar;
el('road').onclick=buyRoad;
el('horses').onclick=buyHorses;
// после операции с долгом открываем балансовый график: игрок только что двинул
// долг и кассу — ему важно увидеть траекторию, а не цену товара (тот же принцип,
// что при переезде и возвращении в заход, см. travel/resumeSession)
el('repay').onclick=()=>{
  let a=parseInt(el('bank-amt').value)||0;a=Math.min(a,S.cash,S.debt);
  if(a<1)return;
  S.cash-=a;S.debt-=a;stat('repaid',a);snd('good');note(L.msg.repaid(a),'pos');
  if(S.debt<=0)announce(L.msg.debtClearTitle,L.msg.debtClear,'good');
  if(S.debt<=P.debt/2)grant('a3');
  el('bank-amt').value='';tel('repay','$'+a);chartGood=BAL;draw();
};
el('borrow').onclick=()=>{
  let a=parseInt(el('bank-amt').value)||0;a=Math.min(a,60000);
  if(a<1)return;
  S.cash+=a;S.debt+=a;stat('borrowed',a);snd('click');note(L.msg.borrowed(a),'neg');
  el('bank-amt').value='';tel('borrow','$'+a);chartGood=BAL;draw();
};
// Кнопок самоотчёта («Скучно», «Интересно!», «ИГРА АХУЕННАЯ» и прочих) больше нет:
// их не нажимают, и рассчитывать на них было утопией (решение Сергея, 21.08). То же
// самое игра теперь выводит сама, по косвенным признакам из журнала — см. engagement()
// в telemetry.js.
el('close-book').onclick=earlyClose;
el('export').onclick=()=>{tel('export','');exportLog()};
el('settings').onclick=()=>{snd('click');settings()};
el('restart').onclick=menu;
el('rumours').addEventListener('click',()=>{if(S&&S.rumNew){S.rumNew=0;draw()}});
// Поворот экрана и смена размера окна меняют масштаб графика и набор чисел в шапке
// (см. NARROW в render.js) — их надо пересчитать. Только когда на экране сам заход:
// draw() снимает оверлеи, и на открытом меню или финале это закрыло бы их.
let resizeTimer=null;
window.addEventListener('resize',()=>{
  clearTimeout(resizeTimer);
  resizeTimer=setTimeout(()=>{
    if(!S||S.over||document.querySelector('.dk-over'))return;
    draw();
  },200);
});

/* ============ тестовый хук ============
   Только для автотестов (tests/game.test.js). На геймплей не влияет —
   просто открывает доступ к внутренним функциям и текущему состоянию. */
if(typeof window!=='undefined'){
  window.__DK_TEST__={
    start,buy,sell,travel,accept,fulfil,decline,appraise,insure,buyTar,tick,rollAll,disaster,
    takeLots,quoteBuy,quoteSell,makeOffer,refill,reserveTarget,rankFor,earlyClose,
    bf,grant,mesto,plural,niceStep,shapeSVG,contractHere,contractAt,disposeVal,disposeExposed,
    ask,money,rateFor,freight,idleFee,capacity,held,room,qty,avg,lots,expCount,volOf,invested,inDays,daysLeft,
    disposeVal,payOrBorrow,
    stat,statTop,freshStats,
    saveSession,clearSession,resumeSession,addQty,refreshHistToday,bid,ask,el,draw,
    insCost,insurePay,net,reserveTarget,goldPerm,rewardMul,suspectQty,suspectCost,apCost,appraise,
    toast,note,news,drawTicker,engagement,engagementLine,clearToasts,replayToasts,askConfirm,closePopups,rumour,rumTrustLabel,menu,settings,stretchRootFor,unstretchRoot,
    goldCands,openLive,goalMet,examsClean,announce,dayTicks,bribeRate,offerBribe,overStats,balanceChartSVG,
    buyRoad,buyHorses,roadOpen,roadForSale,horsesForSale,isLongRoad,
    desertEvent,bedouinOffers,bedouinPick,meetBedouin,maybeTrader,revealLore,loreCost,askChoice,
    afterToasts,dropPending,
    revisionOutlook,revisionToast,resumeBriefing,roadDays,getNB:()=>NB,fatalMove,refreshBalToday,drawBalanceChart,drawChart,BAL,getChartGood:()=>chartGood,
    getS:()=>S,getP:()=>P,getGOODS:()=>GOODS,getMKTS:()=>MKTS,
    getUnlocked:()=>unlocked,getAchDone:()=>achDone,getAchOn:()=>achOn,
    getSavedSession:()=>savedSession,
    tutStart,tutNext,tutRepeat,tutStop,tutCheck,tutStuck,tutPrices,tutAllows,inTut,tutList,tutMenu,
    getTUT:()=>TUT,getTutDone:()=>tutDone,TUT_LESSONS,TUT_ORDER,TUT_PRESET,
    setLang,applyLang,detectLang,telCount,mname,dname,ddesc,achTxt,RU,EN,
    getL:()=>L,getLANG:()=>LANG,
    PRESETS,TIERS,POOL,ACHS,GOLD_PERM,REWARD,UPSTEP,ORDER,BUILD,exportLog,TAR_COST,DUTY_FAIL,maxBuyQty,MAX_FILL,TOAST_MAX
  };
}

loadStore().then(menu);
