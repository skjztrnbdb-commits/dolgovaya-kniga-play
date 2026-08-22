/* ============ обучение: экран и панель шага (DOM) ============
   Единственный, кроме render.js, модуль, который трогает document. Разделены они
   потому, что render.js рисует ЗАХОД, а этот — слой поверх захода: каталог уроков,
   панель текущего шага и подсветка того места, на которое шаг показывает.
   При переезде на другой язык/платформу оба выбрасываются и пишутся заново,
   а tutorial.js (сценарии и движок) переживёт переезд. */

/* ============ каталог уроков ============ */
function tutMenu(){
  document.querySelectorAll('.dk-over').forEach(n=>n.remove());
  tutStop();
  const done=tutList().filter(l=>tutDone[l.id]).length,total=tutList().length;
  const o=document.createElement('div');o.className='dk-over dk-start dk-tutlist';
  const H=L.tut.head;
  o.innerHTML='<h2>'+H.title+'</h2><p class="lede">'+H.lede+'<br>'+H.done(done,total)+'</p>';
  let cat='';
  const d=document.createElement('div');d.className='dk-diff';
  tutList().forEach((l,i)=>{
    if(!cat){
      cat=1;
      const s=document.createElement('div');s.className='dk-split';
      s.innerHTML='<span>'+L.tut.cat+'</span>';
      d.appendChild(s);
    }
    // уроки идут цепочкой: следующий открывается, когда пройден предыдущий.
    // Порядок здесь не украшение — каждый урок опирается на предыдущий (возить
    // товар бессмысленно объяснять раньше, чем разрыв цен)
    const prev=i>0?TUT_ORDER[i-1]:null;
    const open=!prev||!!tutDone[prev]||!!tutDone[l.id];
    const b=document.createElement('button');
    b.className='tut-card'+(tutDone[l.id]?' passed':'')+(open?'':' lock');
    b.disabled=!open;
    b.innerHTML=(i+1)+'. '+tutName(l.id)+'<i>'+(open?tutOne(l.id):H.locked(tutName(prev)))+'</i>'+
      (tutDone[l.id]?'<span class="mark">'+H.passed+'</span>':'');
    if(open)b.onclick=()=>{snd('click');o.remove();unstretchRoot();tutStart(l.id)};
    d.appendChild(b);
  });
  o.appendChild(d);
  const end=document.createElement('div');end.className='dk-end';
  const back=document.createElement('button');
  back.textContent=H.back;
  back.onclick=()=>{snd('click');o.remove();unstretchRoot();menu()};
  end.appendChild(back);o.appendChild(end);
  el('root').appendChild(o);bringIntoView();stretchRootFor(o);
}

/* ============ панель шага ============
   Живёт внизу экрана, поверх игры (position:fixed), и не мешает нажимать на саму
   игру — в этом вся идея: игрок с первой минуты работает с настоящим интерфейсом,
   а не с его обрубком. Ничего не блокируем: сломанный шаг чинится кнопкой
   «Повторить шаг», для этого движок и снимает состояние перед каждым шагом. */
function tutPanel(){
  if(!TUT||!TUT.ready){tutClearUI();return}
  let p=el('tut-panel');
  if(!p){
    p=document.createElement('div');p.id='tut-panel';p.className='dk-tut-panel';
    el('root').appendChild(p);
    el('root').classList.add('tut-on');
  }
  const les=TUT.les,n=TUT.les.steps.length,pos=TUT_ORDER.indexOf(les.id),H=L.tut.head;
  let head,body,rows;
  if(TUT.finished){
    head='<span>'+H.lessonDone+'</span><span>'+(pos>=0?H.lessonNo(pos+1,TUT_ORDER.length):'')+'</span>';
    body='<h4>'+tutName(les.id)+'</h4><p class="fin">'+tutFin(les.id)+'</p>';
    // достижение за пройденное целиком обучение показываем здесь, а не тостом:
    // последний урок кончается победой, а после финала захода тостов уже нет
    if(TUT_ORDER.every(id=>tutDone[id])){
      const a=ACHS.find(x=>x.id==='a26');
      if(a)body+='<p class="ok">'+H.allDone(achTxt(a,'n'),achTxt(a,'b').toLowerCase())+'</p>';
    }
    const nx=tutNextLesson();
    rows=[
      nx?{t:H.nextLesson(tutName(nx.id)),cls:'go',fn:()=>tutStart(nx.id)}:null,
      {t:H.again,fn:()=>tutRestartLesson()},
      {t:H.toList,fn:()=>{tutStop();tutMenu()}}
    ];
  }else{
    head='<span>'+tutName(les.id)+'</span><span>'+H.stepNo(TUT.i+1,n)+'</span>';
    const stuck=!TUT.ok&&tutStuck();
    body='<p>'+(TUT.say||tutStepTxt(les.id,TUT.i,'say'))+'</p>'+
      (TUT.ok?'<p class="ok">'+(tutStepTxt(les.id,TUT.i,'after')||H.ok)+'</p>':'')+
      (stuck?'<p class="stuck">'+H.stuck+'</p>':'');
    rows=[
      TUT.ok?{t:(TUT.i+1<n?H.next:H.finish),cls:'go',fn:()=>tutNext()}:null,
      {t:H.repeat,cls:stuck?'go':'',fn:()=>tutRepeat()},
      {t:H.restart,fn:()=>tutRestartLesson()},
      {t:H.exit,fn:()=>{tutStop();tutMenu()}}
    ];
  }
  p.innerHTML='<div class="h">'+head+'</div>'+body;
  const r=document.createElement('div');r.className='row';
  rows.filter(Boolean).forEach(x=>{
    const b=document.createElement('button');
    b.textContent=x.t;if(x.cls)b.className=x.cls;
    b.onclick=x.fn;
    r.appendChild(b);
  });
  p.appendChild(r);
}

// Подсветка места, о котором говорит шаг. Пересобирается после каждой перерисовки:
// draw() строит таблицу и карточки заново, и класс на старых узлах не выживает.
function tutFocus(){
  document.querySelectorAll('.dk-tut-focus').forEach(n=>n.classList.remove('dk-tut-focus'));
  if(!TUT||!TUT.ready||TUT.finished||TUT.ok)return;
  const st=TUT.les.steps[TUT.i];
  if(!st||!st.focus)return;
  let list=[];
  try{list=[].slice.call(document.querySelectorAll(st.focus))}catch(e){return}
  list.forEach(n=>n.classList.add('dk-tut-focus'));
  // прокручиваем к цели один раз за шаг: делать это на каждой перерисовке значит
  // дёргать страницу под руками игрока после каждой его же покупки
  if(list.length&&!TUT.scrolled){
    TUT.scrolled=true;
    // с задержкой: прокрутка запускается прямо посреди draw(), и высота страницы
    // в этот момент ещё меняется (панель шага только что появилась, оверлей каталога
    // только что снят) — плавный скролл в такой момент просто не случается
    // без behavior:'smooth' нарочно: в браузерах с включённым «уменьшить движение»
    // плавная прокрутка просто не происходит, и шаг молча остаётся за краем экрана
    // (поймано на живой странице). Мгновенный переход некрасивее, но случается всегда.
    const target=list[0];
    setTimeout(()=>{try{target.scrollIntoView({block:'center'})}catch(e){}},80);
  }
}

function tutClearUI(){
  const p=el('tut-panel');if(p)p.remove();
  el('root').classList.remove('tut-on');
  document.querySelectorAll('.dk-tut-focus').forEach(n=>n.classList.remove('dk-tut-focus'));
}

// Точка, из которой обучение узнаёт, что игрок что-то сделал: draw() зовёт её
// последней строкой. Отдельного слушателя кликов нет нарочно — шаг проверяет
// СОСТОЯНИЕ (см. tutCheck), а не то, по какой кнопке щёлкнули.
function tutAfterDraw(){
  if(!TUT||!TUT.ready)return;
  tutCheck();
  tutPanel();
  tutFocus();
}
