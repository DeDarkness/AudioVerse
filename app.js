import { listBooks, addBook, patchBook, deleteBook, getAudio, restoreProgress, cleanupAbandonedImports } from './db.js';
import { AudioPlayer } from './player.js';
import { time, size, escapeHTML as e, progress, filterBooks } from './utils.js';

const $ = selector => document.querySelector(selector);
const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const player = new AudioPlayer();
let books = [], view = 'library', filter = 'all', toastTimeout, deleteId = null, installPrompt = null;
const palette = ['sage','copper','violet','blue','rose','sand'];
const theme = book => palette[Array.from(book.id).reduce((n,c) => n+c.charCodeAt(0),0) % palette.length];
const cover = (book, extra = '') => `<div class="book-cover ${theme(book)} ${extra}" aria-hidden="true"><span class="cover-orbit"></span><span class="cover-top">AUDIOVERSE / BIBLIOTECA PESSOAL</span><span class="cover-name">${e(book.title)}</span><span class="cover-bottom">${icon('headphones')}<span>ESCUTE.<br>IMAGINE.</span></span></div>`;

function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimeout); toastTimeout = setTimeout(() => { $('#toast').hidden = true; },5500); }
async function refresh() { books = await listBooks(); render(); }
function errorMessage(error) { return error?.name === 'QuotaExceededError' ? 'Sem espaço para salvar este áudio. Libere armazenamento e tente novamente.' : error?.message || 'Não foi possível concluir. Tente novamente.'; }
function run(fn) { return (...args) => { try { return Promise.resolve(fn(...args)).catch(error => toast(errorMessage(error))); } catch (error) { toast(errorMessage(error)); } }; }
function visibleBooks() { return filterBooks(books,{query:$('#search').value,filter,favorites:view === 'favorites',sort:$('#sort').value}); }
function latestBook() { return books.find(b => b.id === player.book?.id) || books.find(b => b.id === localStorage.getItem('audioverse-last')) || [...books].filter(b => b.position > 0 && !b.finished).sort((a,b) => (b.lastPlayedAt||0)-(a.lastPlayedAt||0))[0]; }
function renderHero() {
  const book = latestBook();
  if (book) {
    const current = player.book?.id === book.id ? player.book : book;
    $('#hero').className = 'hero resume-hero';
    $('#hero').innerHTML = `<div class="hero-content"><span class="hero-tag"><span class="status-dot"></span> CONTINUE SUA HISTÓRIA</span><h2>${e(current.title)}</h2><p>${e(current.author)} <span class="separator">/</span> ${current.duration ? `${time(Math.max(0,current.duration-current.position))} restantes` : size(current.bytes)}</p><div class="hero-actions"><button class="primary" data-listen="${e(current.id)}">${icon('play')}Continuar ouvindo</button><button class="text-button" data-details="${e(current.id)}">Ver detalhes ${icon('arrow')}</button></div><div class="hero-progress"><span style="width:${progress(current)}%"></span></div><small>${Math.round(progress(current))}% da sua jornada</small></div>${cover(current,'hero-cover')}`;
  } else {
    $('#hero').className = 'hero welcome-hero';
    $('#hero').innerHTML = `<div class="hero-content"><span class="hero-tag"><span class="status-dot"></span> LEVE SUAS HISTÓRIAS COM VOCÊ</span><h2>Dê play em<br>outros universos<span>.</span></h2><p>Audiolivros, ideias e boas companhias.<br>Seu próximo capítulo, no seu tempo.</p><button class="primary import-button">${icon('plus')}Importar meu primeiro áudio</button><small>MP3, M4A e outros formatos de áudio</small></div><div class="hero-art" aria-hidden="true"><div class="art-ring ring-one"></div><div class="art-ring ring-two"></div><div class="art-book"><span>AUDIO<br>VERSE<span class="art-period">.</span></span><div class="sound-bars">${Array.from({length:17},(_,i)=>`<i style="--height:${[20,35,50,30,65,80,55,95,70,45,85,60,40,70,45,30,18][i]}%"></i>`).join('')}</div><small>HISTÓRIAS QUE ACOMPANHAM VOCÊ</small></div><span class="art-badge">${icon('headphones')} SEU MUNDO, EM ÁUDIO</span></div>`;
  }
}
function render() {
  $('#nav-count').textContent = books.length;
  $('#book-count').textContent = visibleBooks().length;
  $('#page-title').innerHTML = `${view === 'favorites' ? 'Seus favoritos' : 'Sua biblioteca'}<span class="accent">.</span>`;
  $('#page-subtitle').textContent = view === 'favorites' ? 'As histórias que você quer ter sempre por perto.' : 'Boas histórias merecem acompanhar você.';
  $('#collection-title').firstChild.textContent = view === 'favorites' ? 'Áudios favoritos ' : 'Todos os áudios ';
  renderHero(); renderLibrary(); renderPlayer();
}
function renderLibrary() {
  const visible = visibleBooks();
  $('#book-count').textContent = visible.length;
  const list = $('#book-list');
  if (!visible.length) {
    const empty = !books.length;
    list.className = 'book-grid is-empty';
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">${icon(empty ? 'library' : view === 'favorites' ? 'heart' : 'search')}</div><h3>${empty ? 'Uma biblioteca com a sua cara' : 'Nenhum áudio por aqui'}</h3><p>${empty ? 'Adicione os áudios do seu aparelho.<br>A gente guarda o ponto onde você parou.' : 'Experimente outra busca ou filtro.'}</p>${empty ? '<button class="text-button import-button">Escolher arquivos <span>↗</span></button>' : ''}</div>`;
    return;
  }
  list.className = 'book-grid';
  list.innerHTML = visible.map(book => `<article class="book-card" data-book="${e(book.id)}"><button class="cover-button" data-listen="${e(book.id)}" aria-label="Ouvir ${e(book.title)}">${cover(book)}<span class="cover-play">${icon('play')}</span></button><div class="book-meta"><div><h3><button class="title-button" data-details="${e(book.id)}">${e(book.title)}</button></h3><p>${e(book.author)}</p></div><button class="icon-button favorite ${book.favorite ? 'selected' : ''}" data-favorite="${e(book.id)}" aria-label="${book.favorite ? 'Remover dos' : 'Adicionar aos'} favoritos: ${e(book.title)}" aria-pressed="${book.favorite}">${icon('heart')}</button></div><div class="book-progress"><span style="width:${progress(book)}%"></span></div><div class="book-bottom"><span>${book.finished ? 'Concluído' : book.position > 0 ? `${Math.round(progress(book))}% ouvido` : 'Ainda não ouvido'}</span><span>${book.duration ? time(book.duration) : size(book.bytes)}</span></div><span class="offline-badge">${icon('check')} No aparelho</span></article>`).join('');
}
function renderPlayer() {
  const book = player.book;
  $('#player').hidden = !book;
  document.body.classList.toggle('has-player',!!book);
  if (!book) return;
  $('#player-title').textContent = book.title;
  $('#player-author').textContent = book.author;
  $('#mini-cover').innerHTML = icon('headphones');
  $('#mini-cover').className = `mini-cover ${theme(book)}`;
  $('#play').innerHTML = icon(player.audio.paused ? 'play' : 'pause');
  $('#play').setAttribute('aria-label',player.audio.paused ? 'Reproduzir' : 'Pausar');
  $('#play').disabled = player.loading;
  $('#speed').value = String(player.rate);
  tick();
}
function tick() {
  if (!player.book) return;
  $('#elapsed').textContent = time(player.book.position);
  $('#duration').textContent = time(player.book.duration);
  $('#seek').max = String(player.book.duration || 100);
  $('#seek').disabled = !player.book.duration;
  if (document.activeElement !== $('#seek')) $('#seek').value = String(player.book.position || 0);
  $('#seek').style.setProperty('--progress',`${progress(player.book)}%`);
  $('#sleep-label').textContent = player.sleepDeadline ? `${Math.max(1,Math.ceil((player.sleepDeadline-Date.now())/60000))}′` : '';
  $('#sleep').classList.toggle('selected',!!player.sleepDeadline);
}
function switchView(next) {
  view = next;
  $('#library-view').hidden = view === 'settings';
  $('#settings-view').hidden = view !== 'settings';
  document.querySelectorAll('[data-view]').forEach(b => { b.classList.toggle('active',b.dataset.view === view); if (b.dataset.view === view) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current'); });
  if (view === 'settings') updateStorage();
  else render();
  window.scrollTo({top:0,behavior:'instant'});
}
function openDetails(id) {
  const book = books.find(b => b.id === id);
  if (!book) return;
  const current = player.book?.id === id ? player.book : book;
  $('#details-content').innerHTML = `<div class="dialog-heading"><span class="eyebrow">SEU ÁUDIO</span><button class="icon-button" data-close aria-label="Fechar">${icon('close')}</button></div><div class="details-intro">${cover(book)}<div><h2>${e(book.title)}</h2><p>${e(book.filename)}</p><span class="local-pill">${size(book.bytes)} · NO APARELHO</span></div></div><form id="edit-book" data-id="${e(id)}"><label>Título<input name="title" required maxlength="300" value="${e(book.title)}"></label><label>Autor / descrição<input name="author" required maxlength="200" value="${e(book.author)}"></label><button class="secondary" type="submit">Salvar informações</button></form><div class="details-actions"><button class="primary" data-listen="${e(id)}">${icon('play')}Ouvir áudio</button><button class="secondary" data-download="${e(id)}">${icon('download')}Salvar original</button></div><h3>Marcadores <span class="muted">${book.bookmarks.length}</span></h3><div class="bookmark-list">${book.bookmarks.length ? book.bookmarks.map(m => `<div class="bookmark-row"><button class="text-button" data-mark="${e(m.id)}" data-id="${e(id)}">${icon('bookmark')}<span>${e(m.label)}<small>${time(m.position)}</small></span></button><button class="icon-button" data-remove-mark="${e(m.id)}" data-id="${e(id)}" aria-label="Remover marcador ${e(m.label)}">${icon('close')}</button></div>`).join('') : '<p class="muted">Durante a reprodução, toque no ícone de marcador para guardar um trecho.</p>'}</div><div class="details-footer"><span>Posição salva: ${time(current.position)}</span><button class="text-button danger-text" data-delete="${e(id)}">Remover da biblioteca</button></div>`;
  if (!$('#details').open) $('#details').showModal();
}
function download(blob, filename) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url),60000);
}
async function importFiles(files) {
  if (!files.length) return;
  let added = 0, duplicates = 0;
  $('#import-status').hidden = false;
  document.querySelectorAll('.import-button').forEach(b => { b.disabled = true; });
  try {
    for (let i=0;i<files.length;i++) {
      $('#import-status').textContent = `Salvando no aparelho · ${i+1}/${files.length} · ${files[i].name}`;
      try { const result = await addBook(files[i]); if (result.duplicate) duplicates++; else added++; }
      catch (error) { toast(`${files[i].name}: ${errorMessage(error)}`); }
    }
    await refresh();
    if (added || duplicates) toast(`${added} áudio(s) adicionado(s).${duplicates ? ` ${duplicates} já estava(m) na biblioteca.` : ''}`);
    // Request persistence only after an intentional import; denial doesn't block offline use.
    if (added && navigator.storage?.persist) await navigator.storage.persist().catch(() => false);
  } finally { $('#import-status').hidden = true; $('#files').value = ''; document.querySelectorAll('.import-button').forEach(b => { b.disabled = false; }); }
}

document.addEventListener('click',run(async event => {
  const b = event.target.closest('button');
  if (!b) return;
  if (b.matches('.import-button')) $('#files').click();
  if (b.dataset.view) switchView(b.dataset.view);
  if (b.dataset.filter) { filter = b.dataset.filter; document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x===b)); renderLibrary(); }
  if (b.dataset.listen) {
    const book = books.find(x=>x.id===b.dataset.listen);
    if (book) { if ($('#details').open) $('#details').close(); await player.select(book,true); }
  }
  if (b.dataset.details) openDetails(b.dataset.details);
  if (b.dataset.favorite) {
    const book = books.find(x=>x.id===b.dataset.favorite);
    if (book) { await patchBook(book.id,{favorite:!book.favorite}); await refresh(); }
  }
  if (b.hasAttribute('data-close')) b.closest('dialog').close();
  if (b.dataset.delete) { deleteId = b.dataset.delete; $('#confirm-dialog').showModal(); }
  if (b.dataset.download) { const book = books.find(x=>x.id===b.dataset.download); const blob = await getAudio(book.id); if (blob) download(blob,book.filename); else throw new Error('Arquivo não encontrado.'); }
  if (b.dataset.mark) {
    const book = books.find(x=>x.id===b.dataset.id), mark = book.bookmarks.find(x=>x.id===b.dataset.mark);
    if (player.book?.id !== book.id) await player.select({...book,position:mark.position,finished:false},true);
    else { player.seek(mark.position); await player.play(); }
    $('#details').close();
  }
  if (b.dataset.removeMark) {
    const book = books.find(x=>x.id===b.dataset.id);
    await patchBook(book.id,{bookmarks:book.bookmarks.filter(x=>x.id!==b.dataset.removeMark)}); await refresh(); openDetails(book.id);
  }
  if (b.dataset.minutes !== undefined) { const min = Number(b.dataset.minutes); player.setSleep(min); $('#sleep-dialog').close(); toast(min ? `O áudio será pausado em ${min} minutos.` : 'Temporizador desativado.'); }
}));
$('#files').addEventListener('change',run(event=>importFiles(Array.from(event.target.files))));
$('#search').addEventListener('input',renderLibrary);
$('#sort').addEventListener('change',renderLibrary);
$('#play').addEventListener('click',()=>player.toggle());
$('#back').addEventListener('click',()=>player.seek(player.audio.currentTime-15));
$('#forward').addEventListener('click',()=>player.seek(player.audio.currentTime+15));
$('#seek').addEventListener('input',()=>player.seek(Number($('#seek').value)));
$('#seek').addEventListener('change',()=>{ $('#seek').blur(); tick(); });
$('#speed').addEventListener('change',()=>player.setRate(Number($('#speed').value)));
$('#sleep').addEventListener('click',()=>$('#sleep-dialog').showModal());
$('#player-details').addEventListener('click',()=>{ if (player.book) openDetails(player.book.id); });
$('#bookmark').addEventListener('click',run(async()=>{
  if (!player.book) return;
  const book = books.find(b=>b.id===player.book.id);
  const mark = {id:crypto.randomUUID(),position:player.audio.currentTime,label:`Marcador ${book.bookmarks.length+1}`};
  await patchBook(book.id,{bookmarks:[...book.bookmarks,mark]}); await refresh(); toast(`Marcador salvo em ${time(mark.position)}.`);
}));
document.addEventListener('submit',run(async event => {
  if (event.target.id !== 'edit-book') return;
  event.preventDefault();
  const data = new FormData(event.target), id = event.target.dataset.id;
  const title = data.get('title').trim(), author = data.get('author').trim();
  if (!title || !author) throw new Error('Preencha o título e o autor.');
  await patchBook(id,{title,author});
  if (player.book?.id === id) { player.book.title = title; player.book.author = author; player.setMetadata(); }
  await refresh(); $('#details').close(); toast('Informações salvas.');
}));
$('#confirm-delete').addEventListener('click',run(async()=>{
  if (!deleteId) return;
  if (player.book?.id === deleteId) await player.clear();
  await deleteBook(deleteId); deleteId = null;
  $('#confirm-dialog').close(); $('#details').close(); await refresh(); toast('Áudio removido deste aparelho.');
}));
$('#export-backup').addEventListener('click',run(async()=>{
  await player.save(); const all = await listBooks();
  download(new Blob([JSON.stringify({format:'audioverse-progress',version:1,exportedAt:new Date().toISOString(),books:all.map(({fingerprint,title,author,position,favorite,finished,bookmarks})=>({fingerprint,title,author,position,favorite,finished,bookmarks}))},null,2)],{type:'application/json'}),`AudioVerse-progresso-${new Date().toISOString().slice(0,10)}.json`);
}));
$('#import-backup').addEventListener('click',()=>$('#backup-file').click());
$('#backup-file').addEventListener('change',run(async event=>{
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > 10*1024*1024) throw new Error('O backup de progresso deve ter no máximo 10 MB.');
    const data = JSON.parse(await file.text());
    // Pause before restoring so live playback doesn't overwrite the imported position.
    player.audio.pause(); await player.save();
    const count = await restoreProgress(data);
    await refresh();
    if (player.book) {
      const updated = books.find(b=>b.id===player.book.id);
      player.book = {...updated}; player.seek(updated.position); player.book.finished = updated.finished; player.setMetadata(); await player.save(); renderPlayer();
    }
    toast(`${count} áudio(s) restaurado(s).${count === 0 ? ' Importe primeiro os mesmos arquivos de áudio.' : ''}`);
  } finally { event.target.value = ''; }
}));
async function updateStorage() {
  try {
    const estimate = await navigator.storage?.estimate?.(), persisted = await navigator.storage?.persisted?.();
    $('#storage-info').textContent = estimate ? `${size(estimate.usage || 0)} utilizados de ${size(estimate.quota || 0)} disponíveis para este site. ${persisted ? 'Armazenamento persistente autorizado.' : ''}` : 'A consulta de espaço não está disponível neste navegador.';
    $('#persist').disabled = !navigator.storage?.persist;
  } catch { $('#storage-info').textContent = 'Não foi possível consultar o espaço.'; }
}
$('#persist').addEventListener('click',run(async()=>{
  const allowed = await navigator.storage.persist(); await updateStorage(); toast(allowed ? 'Armazenamento persistente autorizado.' : 'O navegador não autorizou a persistência. Mantenha seus arquivos originais.');
}));
window.addEventListener('beforeinstallprompt',event=>{ event.preventDefault(); installPrompt = event; $('#install').hidden = false; });
$('#install').addEventListener('click',run(async()=>{ if (!installPrompt) return; await installPrompt.prompt(); installPrompt = null; $('#install').hidden = true; }));
function connection() { $('#connection').innerHTML = `<span class="status-dot"></span><span>${navigator.onLine ? 'Conectado' : 'Modo offline'}</span>`; }
window.addEventListener('online',connection); window.addEventListener('offline',connection); connection();
player.addEventListener('change',()=>{ renderPlayer(); if (player.book) { const i = books.findIndex(b=>b.id===player.book.id); if (i>=0) books[i] = {...books[i],position:player.book.position,duration:player.book.duration,finished:player.book.finished}; } renderHero(); renderLibrary(); });
player.addEventListener('tick',tick);
player.addEventListener('problem',event=>toast(event.detail));
player.addEventListener('sleepended',()=>toast('Temporizador encerrado. Boa pausa.'));
setInterval(()=>{ player.checkSleep(); tick(); },1000);
for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('click',event=>{ if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX<r.left || event.clientX>r.right || event.clientY<r.top || event.clientY>r.bottom) dialog.close(); } });
await cleanupAbandonedImports().then(refresh).catch(error=>{ $('#book-list').innerHTML = '<div class="empty-state"><h3>Não foi possível abrir a biblioteca</h3><p>Confira se este navegador permite armazenar dados locais e recarregue a página.</p></div>'; toast(errorMessage(error)); });
const last = books.find(b=>b.id===localStorage.getItem('audioverse-last'));
if (last) await player.select(last);
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then(async registration=>{
    const ready = await navigator.serviceWorker.ready;
    if (ready.active) $('#connection').title = 'Interface disponível offline';
    // Updates wait for the next app launch, never interrupting an audiobook.
    registration.addEventListener('updatefound',()=>{ const worker = registration.installing; worker?.addEventListener('statechange',()=>{ if (worker.state==='installed' && navigator.serviceWorker.controller) toast('Atualização pronta. Feche e abra o app quando terminar de ouvir.'); }); });
  }).catch(()=>toast('A interface offline não foi preparada. Abra o app novamente com internet.'));
}
