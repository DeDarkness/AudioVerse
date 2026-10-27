import { fingerprint, validAudio, clamp, filenameMetadata } from './utils.js';
let connection;
export function openDB() {
  if (connection) return connection;
  connection = new Promise((resolve, reject) => {
    const request = indexedDB.open('audioverse', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('books', { keyPath: 'id' }).createIndex('fingerprint', 'fingerprint', {unique: true});
      db.createObjectStore('audio', { keyPath: 'id' });
    };
    request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); connection = null; }; resolve(request.result); };
    request.onerror = () => { connection = null; reject(request.error); };
  });
  return connection;
}
async function transaction(stores, mode, run) {
  const db = await openDB();
  return new Promise((resolve,reject) => {
    const tx = db.transaction(stores, mode);
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(tx.error || new Error('Não foi possível salvar os dados.'));
    tx.onerror = event => reject(tx.error || event.target.error || new Error('Não foi possível salvar os dados.'));
    try { run(tx, value => { result = value; }); } catch (e) { tx.abort(); reject(e); }
  });
}
export const listBooks = () => transaction(['books'], 'readonly', (tx, done) => { const r = tx.objectStore('books').getAll(); r.onsuccess = () => done(r.result); });
export const getAudio = id => transaction(['audio'], 'readonly', (tx, done) => {
  const store = tx.objectStore('audio'), r = store.get(id);
  r.onsuccess = () => {
    const header = r.result;
    if (!header) return;
    if (header.blob) { done(header.blob); return; } // Read compatibility for an earlier local build.
    const parts = [];
    let index = 0;
    function next() {
      if (index === header.chunkCount) { done(new Blob(parts,{type:header.type})); return; }
      const chunk = store.get(`${id}:${index++}`);
      chunk.onsuccess = () => {
        if (!chunk.result?.buffer) { tx.abort(); return; }
        parts.push(new Blob([chunk.result.buffer]));
        next();
      };
    }
    next();
  };
});
const chunkRange = id => IDBKeyRange.bound(`${id}:`,`${id}:\uffff`);
async function removeAudio(id) {
  return transaction(['audio'],'readwrite',tx=>{
    const store=tx.objectStore('audio');
    store.delete(id); store.delete(`pending:${id}`); store.delete(chunkRange(id));
  });
}
export async function cleanupAbandonedImports() {
  const pending = await transaction(['audio'],'readonly',(tx,done)=>{
    const r=tx.objectStore('audio').getAll(IDBKeyRange.bound('pending:','pending:\uffff'));
    r.onsuccess=()=>done(r.result);
  });
  // A fresh import can be running in another tab; only reclaim abandoned work after 24 hours.
  for (const item of pending) if (Date.now()-item.createdAt > 24*3600000) await removeAudio(item.bookId);
}
export async function addBook(file,onProgress=()=>{}) {
  if (!validAudio(file) || !file.size) throw new Error('Escolha um arquivo de áudio válido e com conteúdo.');
  const existing = await transaction(['books'],'readonly',(tx,done)=>{
    const r=tx.objectStore('books').index('fingerprint').get(fingerprint(file)); r.onsuccess=()=>done(r.result);
  });
  if (existing) return {book:existing,duplicate:true};
  const book = {id:crypto.randomUUID(), fingerprint:fingerprint(file), ...filenameMetadata(file.name), filename:file.name, bytes:file.size, type:file.type || '', addedAt:Date.now(), position:0, duration:0, favorite:false, finished:false, bookmarks:[]};
  const chunkSize = 4*1024*1024, chunkCount = Math.ceil(file.size/chunkSize);
  try {
    await transaction(['audio'],'readwrite',tx=>tx.objectStore('audio').put({id:`pending:${book.id}`,bookId:book.id,createdAt:Date.now()}));
    for (let index=0;index<chunkCount;index++) {
      // ArrayBuffer chunks avoid File/Blob serialization failures in some WebKit ports,
      // without reading a whole multi-hour audiobook into memory during import.
      const buffer=await file.slice(index*chunkSize,(index+1)*chunkSize).arrayBuffer();
      await transaction(['audio'],'readwrite',tx=>tx.objectStore('audio').put({id:`${book.id}:${index}`,buffer}));
      onProgress((index+1)/chunkCount);
    }
    // Only a fully stored file becomes visible in the library.
    return await transaction(['books','audio'],'readwrite',(tx,done)=>{
      tx.objectStore('books').add(book);
      tx.objectStore('audio').put({id:book.id,type:book.type,chunkCount});
      tx.objectStore('audio').delete(`pending:${book.id}`);
      done({book,duplicate:false});
    });
  } catch (error) { await removeAudio(book.id).catch(()=>{}); throw error; }
}
// Read/modify/write in one transaction preserves simultaneous progress and favorite updates.
export const patchBook = (id, patch) => transaction(['books'],'readwrite',(tx,done) => {
  const store = tx.objectStore('books'), r = store.get(id);
  r.onsuccess = () => { if (!r.result) return; const book = {...r.result,...patch}; store.put(book); done(book); };
});
export const deleteBook = id => transaction(['books','audio'],'readwrite', tx => { tx.objectStore('books').delete(id); const audio=tx.objectStore('audio'); audio.delete(id); audio.delete(`pending:${id}`); audio.delete(chunkRange(id)); });
export async function addDriveBooks(files) {
  return transaction(['books'],'readwrite',(tx,done)=>{
    const store=tx.objectStore('books');let added=0;done(0);
    for(const file of files){
      if(!/^[\w-]+$/.test(file.id)||!file.name?.toLowerCase().endsWith('.mp3')||!Number.isSafeInteger(Number(file.size))||Number(file.size)<=0)continue;
      const id='drive:'+file.id,r=store.get(id);
      r.onsuccess=()=>{
        const current=r.result;
        // A changed cloud file must not silently replace an offline copy with a different length.
        if(current){store.put({...current,...(!current.offline?{filename:file.name,bytes:Number(file.size)}:{}),driveModifiedTime:file.modifiedTime});return;}
        store.add({id,fingerprint:id,driveId:file.id,driveModifiedTime:file.modifiedTime,...filenameMetadata(file.name),filename:file.name,bytes:Number(file.size),type:'audio/mpeg',offline:false,addedAt:Date.now(),position:0,duration:0,favorite:false,finished:false,bookmarks:[]});done(++added);
      };
    }
  });
}
export async function cacheDriveAudio(book,response,onProgress=()=>{}) {
  if(!book.driveId||!response.ok||!response.body)throw Error('Áudio do Drive indisponível.');
  const chunkSize=4*1024*1024,reader=response.body.getReader();
  let buffer=new Uint8Array(chunkSize),used=0,index=0,total=0;
  try{
    await removeAudio(book.id);
    await transaction(['audio'],'readwrite',tx=>tx.objectStore('audio').put({id:`pending:${book.id}`,bookId:book.id,createdAt:Date.now()}));
    while(true){
      const {done,value}=await reader.read();if(done)break;
      if(total+value.byteLength>book.bytes)throw Error('O arquivo no Drive mudou. Atualize o catálogo antes de ouvir.');
      total+=value.byteLength;let offset=0;
      while(offset<value.byteLength){
        const count=Math.min(chunkSize-used,value.byteLength-offset);buffer.set(value.subarray(offset,offset+count),used);used+=count;offset+=count;
        if(used===chunkSize){const data=buffer.buffer;await transaction(['audio'],'readwrite',tx=>tx.objectStore('audio').put({id:`${book.id}:${index++}`,buffer:data}));buffer=new Uint8Array(chunkSize);used=0;}
      }
      onProgress(total/book.bytes);
    }
    if(total!==book.bytes)throw Error('O download ficou incompleto. Tente novamente.');
    if(used){const data=buffer.buffer.slice(0,used);await transaction(['audio'],'readwrite',tx=>tx.objectStore('audio').put({id:`${book.id}:${index++}`,buffer:data}));}
    await transaction(['audio','books'],'readwrite',tx=>{
      const store=tx.objectStore('audio');store.put({id:book.id,type:'audio/mpeg',chunkCount:index});store.delete(`pending:${book.id}`);
      const request=tx.objectStore('books').get(book.id);request.onsuccess=()=>{if(request.result)tx.objectStore('books').put({...request.result,offline:true});};
    });
  }catch(error){await reader.cancel().catch(()=>{});await removeAudio(book.id).catch(()=>{});throw error;}
  finally{reader.releaseLock();}
}
export async function removeDriveCache(id) {await removeAudio(id);return patchBook(id,{offline:false});}
export async function restoreProgress(data) {
  if (data?.format !== 'audioverse-progress' || data.version !== 1 || !Array.isArray(data.books) || data.books.length > 10000) throw new Error('Este arquivo não é um backup compatível do AudioVerse.');
  const incoming = new Map();
  for (const b of data.books) {
    if (typeof b?.fingerprint !== 'string' || typeof b.position !== 'number' || !Number.isFinite(b.position) || !Array.isArray(b.bookmarks) || b.bookmarks.some(m => typeof m?.id !== 'string' || !Number.isFinite(m.position) || typeof m.label !== 'string')) throw new Error('O backup contém dados inválidos.');
    incoming.set(b.fingerprint,b);
  }
  return transaction(['books'],'readwrite',(tx,done) => {
    let count = 0;
    const cursor = tx.objectStore('books').openCursor();
    cursor.onsuccess = () => {
      const c = cursor.result;
      if (!c) { done(count); return; }
      const b = c.value, saved = incoming.get(b.fingerprint);
      if (saved) { c.update({...b, title:typeof saved.title === 'string' ? saved.title.slice(0,300) : b.title, author:typeof saved.author === 'string' ? saved.author.slice(0,200) : b.author, position:clamp(saved.position,0,b.duration || Number.MAX_SAFE_INTEGER), favorite:!!saved.favorite, finished:!!saved.finished, readStatus:['read','unread'].includes(saved.readStatus) ? saved.readStatus : null, bookmarks:saved.bookmarks.slice(0,1000).map(m => ({id:m.id,position:clamp(m.position,0,b.duration || Number.MAX_SAFE_INTEGER),label:m.label.slice(0,200)}))}); count++; }
      c.continue();
    };
  });
}
