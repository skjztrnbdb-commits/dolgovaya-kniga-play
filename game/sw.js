/* ============ офлайн ============
   Сервис-воркер: игра должна открываться в дороге и в метро (просьба Сергея, 29.08).
   Файлов всего полторы сотни килобайт, поэтому кладём в кэш всё разом при установке.

   СТРАТЕГИЯ — «сначала сеть, кэш как запасной аэродром», и это принципиально.
   Обычный для приложений порядок обратный (сначала кэш — так быстрее), но нам
   быстрее не надо, а вот отдать игроку вчерашнюю сборку — реальная опасность:
   на этом уже обжигались, когда игрок прислал лог со старой версии и это пришлось
   вычислять по косвенным скачкам долга (docs/HISTORY.md, разбор log-8). Пока есть
   сеть, игрок всегда получает свежие файлы; кэш достаётся ему ровно тогда, когда
   сети нет, — то есть ровно тогда, когда альтернатива не «старая версия»,
   а «пустой экран».

   Отсюда же нет и возни с версиями кэша: имя постоянное, содержимое обновляется
   само при каждом успешном ответе сети.

   ВАЖНО: список ASSETS обязан совпадать с тем, что грузит index.html. Забыть
   в нём модуль — значит получить игру, которая офлайн падает на пустом месте;
   за этим следит тест «Сервис-воркер знает обо всех файлах игры». */
const CACHE='dk-offline';
const ASSETS=[
  './','index.html','style.css','manifest.webmanifest',
  'js/data.js','js/lang-ru.js','js/lang-en.js','js/lang.js','js/state.js','js/ui.js',
  'js/telemetry.js','js/economy.js','js/contracts.js','js/world.js','js/trading.js',
  'js/render.js','js/render-phone.js','js/tutorial.js','js/tutorial-ui.js','js/main.js',
  'icons/icon-180.png','icons/icon-192.png','icons/icon-512.png'
];

self.addEventListener('install',e=>{
  // addAll валится целиком, если не приехал хоть один файл, — поэтому кладём
  // по одному и не считаем неудачу поводом не установиться: офлайн без одной
  // иконки лучше, чем отсутствие офлайна вовсе
  e.waitUntil(caches.open(CACHE).then(c=>
    Promise.all(ASSETS.map(u=>c.add(u).catch(()=>null)))
  ).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>
    Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))
  ).then(()=>self.clients.claim()));
});

self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  const own=url.origin===location.origin;
  // шрифты приезжают с чужого домена (Google Fonts) — их тоже держим в кэше,
  // иначе офлайн игра теряет свою типографику и выглядит чужой
  const fonts=/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if(!own&&!fonts)return;
  e.respondWith(
    fetch(req).then(res=>{
      if(res&&(res.ok||res.type==='opaque')){
        const copy=res.clone();
        caches.open(CACHE).then(c=>c.put(req,copy)).catch(()=>{});
      }
      return res;
    }).catch(()=>caches.match(req).then(hit=>
      // переход на страницу без сети и без её копии — отдаём корень:
      // игра одностраничная, любой её адрес это один и тот же index.html
      hit||(req.mode==='navigate'?caches.match('./'):undefined)
    ))
  );
});
