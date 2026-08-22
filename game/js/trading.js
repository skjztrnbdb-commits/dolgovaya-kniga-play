/* ============ торговля ============ */
function buy(g,want){
  if(S.over)return;
  const G=good(g),q=quoteBuy(g,want);
  if(q.n<1){
    // «Я застрял» со стороны игры выглядит именно так: игрок жмёт «Купить», а покупки
    // не происходит. Пишем отдельной строкой — по ней engagement() и считает отказы
    const why=!rawAt(S.mkt,g)?'не торгуется':room()<G.bulk?'нет места':'мало денег';
    tel('blocked',G.n+': '+why);
    note(L.msg.noRoom,'neg');snd('bad');return draw()
  }
  const risk=fakeRisk(g);let fakes=0;
  for(let i=0;i<q.n;i++)if(Math.random()<risk)fakes++;
  S.lots[g]=S.lots[g]||[];
  S.lots[g].push({q:q.n,c:q.sum,age:0,fk:fakes,checked:0});
  S.cash-=q.sum;S.imp[S.mkt][g]=q.imp;stat('bought',q.sum);stat('buys',1);
  S.vol[S.mkt]=S.vol[S.mkt]||{};S.vol[S.mkt][g]=q.vol;
  snd('buy');grant('a1');
  if(risk>.1&&fakes===0&&q.n>=2)grant('a6');
  if(room()<G.bulk)grant('a5');
  note(L.msg.bought(G.n,q.n,q.sum),'');
  tel('buy',G.n+' x'+q.n+' $'+Math.round(q.sum)+' ср.'+Math.round(q.sum/q.n));
  chartGood=g;refreshHistToday(g);draw();
}
function sell(g,want){
  if(S.over)return;
  const G=good(g),q=quoteSell(g,want);
  if(q.n<1)return;
  const t=takeLots(g,q.n);
  let got=q.sum;
  if(t.fk>0)got=Math.round(q.sum*(1-t.fk/t.q)+q.sum*(t.fk/t.q)*.08);
  const pl=got-t.cost;
  S.cash+=got;stat('sold',got);stat('profit',pl);stat('sells',1);
  statTop('best',{v:Math.round(pl),d:S.day,g:G.n,q:t.q,mkt:S.mkt},true);
  statTop('worst',{v:Math.round(pl),d:S.day,g:G.n,q:t.q,mkt:S.mkt},false);
  if(q.distress)S.everDistressSold=1;
  if(!q.distress){S.imp[S.mkt][g]=q.imp;S.vol[S.mkt]=S.vol[S.mkt]||{};S.vol[S.mkt][g]=q.vol;}
  snd('sell');grant('a1');
  if(pl>=1500)grant('a2');
  if(t.fk>0){
    S.exposed[g]=(S.exposed[g]||0)+t.fk;
    announce(L.msg.fakeTitle,L.msg.fakeAtMarket(G.n,t.fk));snd('bad');
    S.fakesFound+=t.fk;if(S.fakesFound>=5)grant('a7');
    insurePay(t.fk*(t.cost/t.q),L.w.fakeWhy);
  }
  note(L.msg.sold(G.n,t.q,got,pl,q.distress),pl>=0?'pos':'neg');
  tel(q.distress?'distress_sell':'sell',G.n+' x'+t.q+' $'+Math.round(got)+' ср.'+Math.round(got/t.q)+(t.fk?' подделок:'+t.fk:''));
  chartGood=g;refreshHistToday(g);draw();
}

function best(g){
  let b=null;
  MKTS.forEach(m=>{if(m.n===S.mkt)return;const r=seen[m.n][g];if(r&&(!b||r.p>b.p))b={p:r.p,m:m.n,d:r.d}});
  return b;
}
function arrow(cur,ref){
  if(!cur||!ref)return'';
  const d=Math.round((cur/ref-1)*100);
  if(Math.abs(d)<4)return'';
  return' <span class="dk-arw '+(d>0?'g':'r')+'">'+(d>0?'▲':'▼')+Math.abs(d)+'%</span>';
}
