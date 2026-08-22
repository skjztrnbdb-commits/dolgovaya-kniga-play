/* ============ языки ============
   Механизм, а не тексты: сами тексты лежат в lang-ru.js и lang-en.js.

   ПОЧЕМУ ТАК, А НЕ СЛОВАРЬ КЛЮЧ→СТРОКА С ПОДСТАНОВКОЙ. Потому что принцип 4
   (docs/PRINCIPLES.md): русский текст не собирается из кубиков с падежами, и
   английский — из своих кубиков тоже. Шаблон вида «{market}. Дёшево отдают {good}»
   навязывает обоим языкам один скелет фразы, а он у них разный. Поэтому значение
   в языковом пакете — не строка с дырками, а ФУНКЦИЯ: каждый язык сам решает,
   как склеить фразу из чисел и названий, включая числительные и артикли.

   Правила, которые нельзя нарушать:
   - Ключи в lang-ru.js и lang-en.js совпадают до одного. Расхождение ловит тест.
   - Названия РЫНКОВ переводятся только на экране (`mname()`), а внутри остаются
     русскими: они служат ключами в десятке мест (`S.mkt`, `bias`, `NB`, `ROAD`,
     `POS`, `S.imp`, `S.hist`, `seen`, `S.visited`) и лежат в сохранении. Перевести
     их «по-настоящему» значит сломать сохранённые заходы и всю карту.
   - Названия ТОВАРОВ, наоборот, безопасно переписываются прямо в POOL (`applyLang`):
     ключ там `id`, а `n` — только для показа.
   - ТЕЛЕМЕТРИЯ НЕ ПЕРЕВОДИТСЯ. Журнал (`tel()`) — инструмент разбора для нас, а
     не текст для игрока; двадцать два разобранных лога написаны по-русски, и менять
     язык записей значит обрубить эту преемственность. */

let LANG='ru';
let L=RU;

// Английский по умолчанию — решение Сергея 21.08. Не «по языку браузера»: игра
// уезжает на itch.io и в Steam, где английский и есть язык по умолчанию, а русский
// выбирают осознанно (в настройках или через ?lng=ru). Выбор сохраняется.
function detectLang(){
  try{
    const q=(location.search.match(/[?&]lng=(ru|en)/)||[])[1];
    if(q)return q;
  }catch(e){}
  return 'en';
}
const LANGS={ru:RU,en:EN};
function setLang(code,quiet){
  if(!LANGS[code])return;
  const was=LANG;
  LANG=code;L=LANGS[code];
  // Записи журнала, молва, лента новостей и висящие сообщения хранятся ГОТОВЫМ
  // текстом (собрать их заново нельзя: у двух десятков видов свои формулировки),
  // поэтому после смены языка они остались бы на прежнем — «Контора принята вместе
  // с долгом» посреди английского экрана. Смешанный журнал хуже короткого, поэтому
  // старые записи выбрасываем. Телеметрия при этом не трогается: она нарочно
  // русская и нужна для разбора, а не игроку.
  if(!quiet&&was!==code&&typeof S!=='undefined'&&S){
    S.log=[];S.news=[];S.rumours=[];S.rumNew=0;
    if(typeof clearToasts==='function')clearToasts();
  }
  applyLang();
  if(!quiet)saveStore();
}
// Переписываем то, что живёт в данных, а не в текстах: названия товаров (ключ — id,
// имя только для показа) и статические подписи разметки (элементы с data-t).
function applyLang(){
  [].concat(POOL.perish,POOL.stable,POOL.elite).forEach(g=>{
    if(L.goods[g.id])g.n=L.goods[g.id];
  });
  if(typeof document==='undefined'||!document.querySelectorAll)return;
  document.querySelectorAll('[data-t]').forEach(n=>{
    const v=tkey(n.getAttribute('data-t'));
    if(v!=null)n.textContent=v;
  });
  document.querySelectorAll('[data-ph]').forEach(n=>{
    const v=tkey(n.getAttribute('data-ph'));
    if(v!=null)n.placeholder=v;
  });
  const t=document.querySelector('title');
  if(t)t.textContent=L.ui.title;
  // подпись сборки в подвале: собирается из слова и константы, поэтому data-t
  // здесь не годится — обновляем руками при каждой смене языка
  const b=document.getElementById('build');
  if(b)b.textContent=L.ui.build+' '+BUILD;
  // Подпись конторы и счётчик действий пишутся не в draw(), а один раз в момент
  // события (start/resume и tel). После смены языка они оставались на прежнем —
  // «КОНТОРА «ВЕТРЯК» · УЧЕНИК» посреди английского экрана (нашёл Сергей 21.08).
  if(typeof S!=='undefined'&&S){
    const sub=document.getElementById('sub');
    if(sub&&!inTut())sub.textContent=L.ui.house+' · '+dname(S.key);
    if(typeof telCount==='function')telCount();
  }
}
// Значение по «пути» вида 'ui.day' — только для data-t в разметке; в коде
// обращаются напрямую, L.ui.day
function tkey(path){
  const parts=path.split('.');
  let v=L;
  for(let i=0;i<parts.length;i++){
    if(v==null)return null;
    v=v[parts[i]];
  }
  return typeof v==='function'?v():v;
}
// Название рынка на экране. Внутри игры имя рынка — это ключ, и переводить его
// нельзя (см. шапку файла), поэтому показываем через таблицу перевода.
const mname=n=>(L.mkts&&L.mkts[n])||n;
// Название и описание сложности берутся из языка, а не из PRESETS: в PRESETS
// остаются только числа. Те же поля в PRESETS оставлены как русский запасной
// вариант — их видит телеметрия, которая нарочно не переводится.
const dname=k=>(L.diff[k]&&L.diff[k].n)||(PRESETS[k]&&PRESETS[k].n)||k;
const ddesc=k=>(L.diff[k]&&L.diff[k].d)||(PRESETS[k]&&PRESETS[k].d)||'';
// то же для достижений: в ACHS остаются id, баффы и флаги, тексты — здесь
const achTxt=(a,f)=>((L.ach&&L.ach[a.id]&&L.ach[a.id][f])||a[f]);
