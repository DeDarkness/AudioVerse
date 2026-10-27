import {test} from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {DriveLibrary} from '../drive.js';
import {addDriveBooks,listBooks,patchBook,cacheDriveAudio,getAudio,removeDriveCache,deleteBook,openDB} from '../db.js';

test('catálogo privado percorre paginação e subpastas sem colocar token nas URLs',async()=>{
  const urls=[];const fetcher=async(url,options)=>{
    assert.equal(options.headers.Authorization,'Bearer fixture-token');assert.equal(url.includes('fixture-token'),false);
    const u=new URL(url),q=u.searchParams.get('q');urls.push(u);
    if(q.includes('name ='))return Response.json({files:[{id:'root_1',mimeType:'application/vnd.google-apps.folder'}]});
    if(q.includes("'root_1'"))return u.searchParams.has('pageToken')?Response.json({files:[{id:'b',name:'Outro.mp3',size:'100'}]}):Response.json({files:[{id:'sub',mimeType:'application/vnd.google-apps.folder'},{id:'a',name:'Livro.mp3',size:'10'},{id:'private',name:'Sem acesso.mp3',capabilities:{canDownload:false}}],nextPageToken:'page-2'});
    return Response.json({files:[{id:'c',name:'Mais.mp3',size:'100'},{id:'d',name:'Original.pdf'}]});
  };
  const drive=new DriveLibrary({fetcher});drive.token='fixture-token';drive.expiresAt=Date.now()+60000;
  assert.deepEqual((await drive.catalog()).map(x=>x.id),['a','b','c']);assert.equal(urls.length,4);
  drive.disconnect();await assert.rejects(()=>drive.catalog(),/Conecte/);
});
test('falha de autorização limpa a sessão e permite reconectar sem expor credenciais',async()=>{
  const drive=new DriveLibrary({fetcher:async()=>new Response(null,{status:401})});drive.token='test';drive.expiresAt=Date.now()+60000;
  await assert.rejects(()=>drive.media('book_1'),/expirou/);assert.equal(drive.connected,false);assert.equal(drive.token,null);
});
test('download interrompido é removido; conclusão atravessa blocos, preserva posição e pode ser liberada',async()=>{
  const bytes=new Uint8Array(4*1024*1024+777).map((_,i)=>i%251);
  const file={id:'cloud_test',name:'Autor - Livro - Parte 01 de 02.mp3',size:String(bytes.byteLength),modifiedTime:'2026-01-01'};
  assert.equal(await addDriveBooks([file]),1);let book=(await listBooks())[0];
  await patchBook(book.id,{position:120,bookmarks:[{id:'m',position:30,label:'Trecho'}],readStatus:'read'});
  assert.equal(await addDriveBooks([file]),0);book=(await listBooks())[0];assert.equal(book.position,120);assert.equal(book.readStatus,'read');
  const broken=new ReadableStream({start(c){c.enqueue(bytes.subarray(0,1000));c.close();}});
  await assert.rejects(()=>cacheDriveAudio(book,new Response(broken)),/incompleto/);
  assert.equal(await getAudio(book.id),undefined);assert.equal((await listBooks())[0].offline,false);
  const updates=[];
  const stream=new ReadableStream({start(c){c.enqueue(bytes.subarray(0,211));c.enqueue(bytes.subarray(211,4*1024*1024+2));c.enqueue(bytes.subarray(4*1024*1024+2));c.close();}});
  await cacheDriveAudio(book,new Response(stream),p=>updates.push(p));
  assert.deepEqual(new Uint8Array(await(await getAudio(book.id)).arrayBuffer()),bytes);assert.equal(updates.at(-1),1);
  book=(await listBooks())[0];assert.equal(book.offline,true);assert.equal(book.position,120);assert.equal(book.bookmarks.length,1);
  await removeDriveCache(book.id);assert.equal(await getAudio(book.id),undefined);book=(await listBooks())[0];assert.equal(book.offline,false);assert.equal(book.position,120);
  const db=await openDB();const pending=await new Promise(resolve=>{const tx=db.transaction('audio');const r=tx.objectStore('audio').getAll();r.onsuccess=()=>resolve(r.result);});assert.equal(pending.length,0);
  await deleteBook(book.id);
});
