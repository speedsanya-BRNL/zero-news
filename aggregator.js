const PROXIES = [
  u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  u => `https://corsproxy.io/?url=${encodeURIComponent(u)}`
];
const G = 'https://news.google.com/rss';

const REGIONS = [
  { id:'world', name:'🌍 МИР', counts:[20,15,15], feeds:[
      `${G}/headlines/section/topic/WORLD?hl=ru&gl=RU&ceid=RU:ru`,
      `${G}/search?q=(экономика OR рынок OR бизнес OR финансы)&hl=ru&gl=RU&ceid=RU:ru`,
      `${G}/search?q=(арест OR полиция OR суд OR преступление OR ДТП)&hl=ru&gl=RU&ceid=RU:ru` ]},
  { id:'usa', name:'🇺🇸 США', counts:[20,15,15], feeds:[
      `${G}/headlines/section/topic/NATIONAL?hl=en-US&gl=US&ceid=US:en`,
      `${G}/search?q=(US economy OR stock OR Fed OR inflation OR business)&hl=en-US&gl=US&ceid=US:en`,
      `${G}/search?q=(US police OR arrest OR crime OR charged OR FBI)&hl=en-US&gl=US&ceid=US:en` ]},
  { id:'europe', name:'🇪🇺 ЕВРОПА', counts:[20,15,15], feeds:[
      `${G}/search?q=(Europe OR EU OR UK OR France OR Germany)&hl=en-GB&gl=GB&ceid=GB:en`,
      `${G}/search?q=(Europe economy OR ECB OR inflation OR energy)&hl=en-GB&gl=GB&ceid=GB:en`,
      `${G}/search?q=(Europe police OR crime OR court OR fraud)&hl=en-GB&gl=GB&ceid=GB:en` ]},
  { id:'thailand', name:'🇹🇭 ТАИЛАНД', counts:[20,15,15], feeds:[
      `${G}/search?q=(Thailand OR Bangkok OR Phuket)&hl=en-US&gl=TH&ceid=TH:en`,
      `${G}/search?q=(Thailand economy OR baht OR trade OR tourism)&hl=en-US&gl=TH&ceid=TH:en`,
      `${G}/search?q=(Thailand police OR arrest OR raid OR scam)&hl=en-US&gl=TH&ceid=TH:en` ]},
  { id:'russia', name:'🇷🇺 РОССИЯ', counts:[20,15,15], feeds:[
      `${G}/headlines/section/topic/NATIONAL?hl=ru&gl=RU&ceid=RU:ru`,
      `${G}/search?q=(экономика OR бюджет OR курс OR ЦБ OR нефть)&hl=ru&gl=RU&ceid=RU:ru`,
      `${G}/search?q=(происшествия OR задержали OR уголовное OR суд OR ФСБ)&hl=ru&gl=RU&ceid=RU:ru` ]},
  { id:'barnaul', name:'📍 БАРНАУЛ', counts:[20,15,15], feeds:[
      `${G}/search?q=(Барнаул OR Алтайский край)&hl=ru&gl=RU&ceid=RU:ru`,
      `${G}/search?q=Барнаул (экономика OR бюджет OR бизнес OR стройка)&hl=ru&gl=RU&ceid=RU:ru`,
      `${G}/search?q=Барнаул (суд OR задержали OR уголовное OR мошенничество)&hl=ru&gl=RU&ceid=RU:ru` ]},
];
const CATS = ['ОБЩИЕ','ЭКОНОМИКА','КРИМИНАЛ'];

async function fetchText(url){
  for (const p of PROXIES){
    try{ const r = await fetch(p(url)); if(r.ok) return await r.text(); }catch(e){}
  }
  throw new Error('proxy fail');
}
function parseRSS(xml){
  const doc = new DOMParser().parseFromString(xml,'text/xml');
  return [...doc.querySelectorAll('item')].map(i=>({
    title:(i.querySelector('title')?.textContent||'').replace(/ - [^-]+$/,'').trim(),
    link:i.querySelector('link')?.textContent||'#',
    pub:new Date(i.querySelector('pubDate')?.textContent||0),
    src:(i.querySelector('title')?.textContent||'').split(' - ').pop().trim(),
  })).filter(x=>x.title).sort((a,b)=>b.pub-a.pub);
}

const lazyIO = new IntersectionObserver(async(entries,obs)=>{
  for(const e of entries){
    if(!e.isIntersecting) continue;
    obs.unobserve(e.target);
    const card=e.target, img=card.querySelector('img');
    try{
      const html = await fetchText(card.dataset.link);
      const m = html.match(/property="og:image"\s+content="([^"]+)"|<meta[^>]+og:image[^>]+content="([^"]+)"/);
      const url = m && (m[1]||m[2]);
      if(url){ img.src=url; img.onerror=()=>img.remove(); }
      else img.remove();
    }catch(_){ img.remove(); }
  }
},{rootMargin:'400px'});

function card(item, cat){
  const el=document.createElement('article');
  el.className='news-card'; el.dataset.link=item.link;
  el.innerHTML=`<div class="photo"><img loading="lazy" alt=""></div>
    <h5 class="cat">${cat}</h5><h4>${item.title}</h4>
    <p class="meta">${item.src} · ${item.pub.toLocaleDateString('ru-RU')}</p>
    <a href="${item.link}" target="_blank" rel="noopener">👉 первоисточник →</a>`;
  try{
    const d=new URL(item.link).hostname;
    el.querySelector('img').src=`https://www.google.com/s2/favicons?sz=128&domain=${d}`;
  }catch(_){}
  lazyIO.observe(el);
  return el;
}

async function buildRegion(region){
  const sec=document.createElement('section');
  sec.className='region'; sec.id=region.id;
  sec.innerHTML=`<h2 class="region-title">${region.name} — загрузка…</h2>`;
  const grid=document.createElement('div'); grid.className='card-grid'; sec.appendChild(grid);
  await Promise.all(region.feeds.map(async(feed,ci)=>{
    try{
      const items=parseRSS(await fetchText(feed)).slice(0, region.counts[ci]);
      items.forEach(it=>grid.appendChild(card(it, CATS[ci])));
    }catch(e){ console.warn(region.id, e); }
  }));
  const total=region.counts.reduce((a,b)=>a+b,0);
  sec.querySelector('.region-title').textContent=`${region.name} — ${grid.children.length}/${total}`;
  return sec;
}

let lastUpdate = Date.now();
const REFRESH_INTERVAL = 2*60*60*1000;
let countdownInterval;

function startCountdown(){
  clearInterval(countdownInterval);
  countdownInterval = setInterval(()=>{
    const remaining = Math.max(0, REFRESH_INTERVAL - (Date.now()-lastUpdate));
    const mins = Math.floor(remaining/60000);
    const secs = Math.floor((remaining%60000)/1000);
    document.getElementById('countdown').textContent =
      `Следующее обновление через: ${mins}м ${secs.toString().padStart(2,'0')}с`;
    if(remaining===0){ buildAll(); lastUpdate=Date.now(); }
  },1000);
}

async function buildAll(){
  const app=document.getElementById('app');
  app.innerHTML='<div class="loading">Собираем 300 новостей…</div>';
  const nav=document.getElementById('nav');
  nav.innerHTML=''; app.textContent='';
  for(const r of REGIONS){
    nav.insertAdjacentHTML('beforeend',`<a href="#${r.id}">${r.name}</a>`);
    app.appendChild(await buildRegion(r));
  }
  lastUpdate=Date.now();
  document.getElementById('updated').textContent='Обновлено: '+new Date().toLocaleString('ru-RU');
  startCountdown();
}

document.getElementById('today').textContent=
  new Date().toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
document.getElementById('refresh').onclick=buildAll;
buildAll();
