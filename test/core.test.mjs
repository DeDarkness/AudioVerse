import { test } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { time, filterBooks, escapeHTML, progress, filenameMetadata, isRead } from '../utils.js';
import { addBook, listBooks, getAudio, patchBook, deleteBook, restoreProgress } from '../db.js';

test('horas longas e conteúdo HTML são apresentados com segurança',()=>{
  assert.equal(time(22*3600+5*60),'22:05:00');
  assert.equal(time(-15),'0:00');
  assert.equal(escapeHTML('<img src="x" onerror="x">'), '&lt;img src=&quot;x&quot; onerror=&quot;x&quot;&gt;');
  assert.equal(progress({position:125,duration:100}),100);
});
test('filtros combinam busca, favoritos e status',()=>{
  const books=[{title:'Leviatã',author:'Thomas Hobbes',filename:'l.mp3',favorite:true,position:10,finished:false,addedAt:1},{title:'Outro',author:'Pessoa',filename:'o.mp3',favorite:false,position:100,finished:true,addedAt:2}];
  assert.equal(filterBooks(books,{query:'hobbes',favorites:true,filter:'progress'}).length,1);
  assert.equal(filterBooks(books,{filter:'finished'})[0].title,'Outro');
  assert.equal(filterBooks(books,{query:'inexistente'}).length,0);
});
test('partes de um audiolivro mantêm a ordem e a leitura independe da posição',()=>{
  const first={id:'a',...filenameMetadata('Autor - Livro - Parte 01 de 02.mp3'),addedAt:1,position:30,finished:false,readStatus:'read'};
  const second={id:'b',...filenameMetadata('Autor - Livro - Parte 02 de 02.mp3'),addedAt:3,position:0,finished:false};
  assert.equal(first.author,'Autor');assert.equal(first.partIndex,1);
  assert.deepEqual(filterBooks([second,first]).map(x=>x.id),['a','b']);
  assert.equal(isRead(first),true);assert.equal(first.position,30);
  assert.equal(filterBooks([first,second],{filter:'unread'})[0].id,'b');
});
test('biblioteca preserva áudio, evita duplicatas e restaura progresso atomicamente',async()=>{
  const file=new File(['audio-fixture'],'teste.mp3',{type:'audio/mpeg',lastModified:10});
  const {book}=await addBook(file);
  assert.equal((await addBook(file)).duplicate,true);
  assert.equal(await (await getAudio(book.id)).text(),'audio-fixture');
  await Promise.all([patchBook(book.id,{position:73,duration:100}),patchBook(book.id,{favorite:true})]);
  let saved=(await listBooks())[0];
  assert.equal(saved.position,73); assert.equal(saved.favorite,true);
  await assert.rejects(()=>restoreProgress({format:'audioverse-progress',version:1,books:[{fingerprint:book.fingerprint,position:50,bookmarks:[]},{position:'invalid'}]}));
  assert.equal((await listBooks())[0].position,73);
  assert.equal(await restoreProgress({format:'audioverse-progress',version:1,books:[{fingerprint:book.fingerprint,position:1000,favorite:false,finished:true,bookmarks:[{id:'mark',position:25,label:'Trecho'}]}]}),1);
  saved=(await listBooks())[0]; assert.equal(saved.position,100); assert.equal(saved.bookmarks.length,1);
  await deleteBook(book.id);
  assert.equal((await listBooks()).length,0); assert.equal(await getAudio(book.id),undefined);
});
