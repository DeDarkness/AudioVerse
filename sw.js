const CACHE = 'audioverse-shell-1.2.1';
const FILES = ['./','./index.html','./styles.css','./app.js','./db.js','./player.js','./utils.js','./drive.js','./cloud-config.json','./manifest.webmanifest','./icons/icon.svg','./icons/icon-192.png','./icons/icon-512.png','./icons/maskable-512.png','./icons/apple-touch-icon.png'];
let mediaDB;
function database() {
  if (!mediaDB) mediaDB = new Promise((resolve,reject)=>{
    const r=indexedDB.open('audioverse',1);
    r.onupgradeneeded=()=>{
      const db=r.result;
      db.createObjectStore('books',{keyPath:'id'}).createIndex('fingerprint','fingerprint',{unique:true});
      db.createObjectStore('audio',{keyPath:'id'});
    };
    r.onsuccess=()=>{r.result.onversionchange=()=>{r.result.close();mediaDB=null;};resolve(r.result);};
    r.onerror=()=>{mediaDB=null;reject(r.error);};
  });
  return mediaDB;
}
async function record(store,id) {
  const db=await database();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(store,'readonly'),r=tx.objectStore(store).get(id);
    r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);tx.onabort=()=>reject(tx.error);
  });
}
async function localAudio(request,id) {
  const [book,header]=await Promise.all([record('books',id),record('audio',id)]);
  if(!book||!header) return new Response('Áudio não encontrado',{status:404});
  const total=book.bytes;
  let start=0,end=total-1,status=200;
  const range=request.headers.get('Range');
  if(range){
    const match=/^bytes=(\d*)-(\d*)$/.exec(range);
    if(!match||(!match[1]&&!match[2])) return new Response(null,{status:416,headers:{'Content-Range':`bytes */${total}`}});
    if(match[1]){start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),end):end;}
    else {start=Math.max(0,total-Number(match[2]));}
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>end||start>=total) return new Response(null,{status:416,headers:{'Content-Range':`bytes */${total}`}});
    status=206;
  }
  const mime={mp3:'audio/mpeg',m4a:'audio/mp4',m4b:'audio/mp4',aac:'audio/aac',wav:'audio/wav',ogg:'audio/ogg',flac:'audio/flac'};
  const type=mime[book.filename.split('.').pop().toLowerCase()]||(book.type?.startsWith('audio/') ? book.type : 'application/octet-stream');
  const headers={'Content-Type':type,'Content-Length':String(end-start+1),'Accept-Ranges':'bytes','Cache-Control':'private, no-store'};
  if(status===206)headers['Content-Range']=`bytes ${start}-${end}/${total}`;
  if(request.method==='HEAD')return new Response(null,{status,headers});
  if(header.blob)return new Response(header.blob.slice(start,end+1),{status,headers});
  let cursor=start;
  const stream=new ReadableStream({
    async pull(controller){
      try{
        if(cursor>end){controller.close();return;}
        const index=Math.floor(cursor/(4*1024*1024));
        const chunk=await record('audio',`${id}:${index}`);
        if(!chunk?.buffer)throw Error('Bloco de áudio ausente');
        const offset=cursor-index*4*1024*1024;
        const count=Math.min(chunk.buffer.byteLength-offset,end-cursor+1);
        if(count<=0)throw Error('Bloco de áudio inválido');
        controller.enqueue(new Uint8Array(chunk.buffer,offset,count));cursor+=count;
        if(cursor>end)controller.close();
      }catch(error){controller.error(error);}
    }
  });
  return new Response(stream,{status,headers});
}
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES))); });
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('audioverse-shell-') && key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (!['GET','HEAD'].includes(request.method) || url.origin !== self.location.origin || !['http:','https:'].includes(url.protocol)) return;
  const scope = new URL(self.registration.scope);
  if (!url.pathname.startsWith(scope.pathname)) return;
  const mediaPath=url.pathname.slice(scope.pathname.length);
  if(mediaPath.startsWith('_audio/')){event.respondWith(localAudio(request,decodeURIComponent(mediaPath.slice(7))).catch(()=>new Response('Não foi possível ler o áudio local',{status:503})));return;}
  if(request.method!=='GET')return;
  // Only cache the versioned app shell. Imported audio stays in IndexedDB.
  event.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(request,{ignoreSearch:true});
    if (cached) return cached;
    try { return await fetch(request); }
    catch (error) { if (request.mode === 'navigate') return await cache.match('./index.html'); throw error; }
  }));
});
