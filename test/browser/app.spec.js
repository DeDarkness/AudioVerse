import {test,expect} from '@playwright/test';
import {writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const needsAudio = browserName => test.skip(browserName === 'webkit' && process.platform === 'win32','O WebKit deste Windows rejeita inclusive WAV original com MEDIA_ERR_SRC_NOT_SUPPORTED. Playback é verificado no Chromium e no WebKit do CI Linux.');

function wave(seconds=45){
  const rate=8000, samples=seconds*rate, buffer=Buffer.alloc(44+samples*2);
  buffer.write('RIFF');buffer.writeUInt32LE(buffer.length-8,4);buffer.write('WAVE',8);buffer.write('fmt ',12);buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);buffer.writeUInt32LE(rate,24);buffer.writeUInt32LE(rate*2,28);buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);buffer.write('data',36);buffer.writeUInt32LE(samples*2,40);
  for(let i=0;i<samples;i++)buffer.writeInt16LE(Math.round(Math.sin(i/rate*Math.PI*2*220)*300),44+i*2);
  return buffer;
}
async function importAudio(page,name='Meu audiolivro.wav'){
  await page.locator('#files').setInputFiles({name,mimeType:'audio/wav',buffer:wave()});
  await expect(page.locator('.book-card')).toHaveCount(1);
}
test('importar, tocar, avançar, salvar progresso e ouvir offline',async({page,context,browserName})=>{
  needsAudio(browserName);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await importAudio(page);
  await page.locator('.cover-button').click();
  await expect(page.locator('#play')).toHaveAttribute('aria-label','Pausar');
  await expect(page.locator('#duration')).toHaveText('0:45');
  await page.locator('#forward').click();
  await expect.poll(()=>page.locator('#native-audio').evaluate(a=>a.currentTime)).toBeGreaterThan(14);
  await page.locator('#speed').selectOption('1.5');
  await expect.poll(()=>page.locator('#native-audio').evaluate(a=>a.playbackRate)).toBe(1.5);
  await page.locator('#play').click();
  await page.locator('#bookmark').click();
  await page.locator('#player-details').click();
  await expect(page.locator('.bookmark-row')).toHaveCount(1);
  await page.locator('#details [data-close]').click();
  await page.locator('.favorite').click();
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
  await page.reload();
  await expect(page.locator('#player')).toBeVisible();
  await expect.poll(()=>page.locator('#native-audio').evaluate(a=>a.currentTime)).toBeGreaterThan(14);
  await context.setOffline(true);await page.reload();
  await expect(page.locator('.book-card')).toHaveCount(1);
  await expect(page.locator('#connection')).toContainText('Modo offline');
  await page.locator('#play').click();await expect(page.locator('#play')).toHaveAttribute('aria-label','Pausar');
  await page.locator('#play').click();
  expect(errors).toEqual([]);
});
test('duplicatas, favoritos, edição segura, busca e remoção',async({page},testInfo)=>{
  await page.goto('/');
  const fixture=testInfo.outputPath('livro.wav');await writeFile(fixture,wave());
  await page.locator('#files').setInputFiles(fixture);await expect(page.locator('.book-card')).toHaveCount(1);
  await page.locator('#files').setInputFiles(fixture);
  await expect(page.locator('#import-status')).toBeHidden();
  await expect(page.locator('.book-card')).toHaveCount(1);
  await expect(page.locator('.book-meta b')).toHaveCount(0);
  await page.locator('.sidebar [data-view="favorites"]').click();await expect(page.locator('.book-card')).toHaveCount(0);
  await page.locator('.sidebar [data-view="library"]').click();await page.locator('.favorite').click();
  await page.locator('.title-button').click();
  await page.locator('[name="title"]').fill('<b>Leitura pessoal</b>');await page.locator('[name="author"]').fill('Meu autor');
  await page.getByRole('button',{name:'Salvar informações'}).click();await expect(page.locator('#details')).not.toBeVisible();
  await expect(page.locator('.title-button')).toHaveText('<b>Leitura pessoal</b>');
  await expect(page.locator('.book-meta b')).toHaveCount(0);
  await page.locator('#search').fill('xyz');await expect(page.locator('.book-card')).toHaveCount(0);await page.locator('#search').fill('');
  await page.locator('.title-button').click();await page.getByRole('button',{name:'Remover da biblioteca'}).click();
  await page.locator('#confirm-delete').click();await expect(page.locator('.book-card')).toHaveCount(0);
});
test('interface móvel, temporizador e backup restaurável',async({page,browserName})=>{
  needsAudio(browserName);
  await page.clock.install();
  await page.setViewportSize({width:390,height:844});await page.goto('/');await importAudio(page);
  await page.locator('.cover-button').click();await expect(page.locator('#duration')).toHaveText('0:45');
  await page.locator('#forward').click();await page.locator('#play').click();
  await expect(page.locator('#sleep')).toBeInViewport();
  await mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/preview-mobile-player.png',fullPage:true});
  await page.locator('#sleep').click();await page.getByRole('button',{name:'15 min',exact:true}).click();await expect(page.locator('#sleep-label')).toHaveText('15′');
  await page.clock.fastForward(15*60*1000+1000);
  await expect(page.locator('#sleep-label')).toBeEmpty();await expect(page.locator('#play')).toHaveAttribute('aria-label','Reproduzir');
  await page.locator('.mobile-nav [data-view="settings"]').click();
  const downloadPromise=page.waitForEvent('download');await page.locator('#export-backup').click();const download=await downloadPromise;
  const filePath=await download.path();
  await page.locator('#backup-file').setInputFiles(filePath);await expect(page.locator('#toast')).toContainText('1 áudio(s) restaurado(s)');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('layout inicial sem rolagem horizontal em celular e desktop',async({page})=>{
  await mkdir('artifacts',{recursive:true});
  for(const width of [390,1440]){
    await page.setViewportSize({width,height:900});await page.goto('/');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`artifacts/preview-${width}.png`,fullPage:true});
  }
});
test('comandos Media Session controlam o mesmo áudio ao trocar de tela',async({page,browserName})=>{
  needsAudio(browserName);
  await page.addInitScript(()=>{
    window.mediaHandlers={};
    if(navigator.mediaSession){const original=navigator.mediaSession.setActionHandler.bind(navigator.mediaSession);navigator.mediaSession.setActionHandler=(name,fn)=>{window.mediaHandlers[name]=fn;return original(name,fn);};}
  });
  await page.goto('/');await importAudio(page);await page.locator('.cover-button').click();
  await expect(page.locator('#duration')).toHaveText('0:45');
  await page.locator('.sidebar [data-view="settings"]').click();
  await page.evaluate(()=>window.mediaHandlers.pause());await expect(page.locator('#play')).toHaveAttribute('aria-label','Reproduzir');
  await page.evaluate(()=>window.mediaHandlers.seekto({seekTime:22}));
  await expect.poll(()=>page.locator('#native-audio').evaluate(a=>a.currentTime)).toBeGreaterThan(21);
  await page.evaluate(()=>window.mediaHandlers.play());await expect(page.locator('#play')).toHaveAttribute('aria-label','Pausar');
  await expect(page.locator('audio')).toHaveCount(1);
});
test('importação em blocos preserva todos os bytes, inclusive offline',async({page,context})=>{
  const buffer=Buffer.alloc(4*1024*1024+17,0x5a), expected=createHash('sha256').update(buffer).digest('hex');
  await page.goto('/');
  await page.locator('#files').setInputFiles({name:'Integridade.mp3',mimeType:'audio/mpeg',buffer});
  await expect(page.locator('.book-card')).toHaveCount(1);
  const digest=()=>page.evaluate(async()=>{
    const {listBooks,getAudio}=await import('/db.js'),[book]=await listBooks();
    const audio=await getAudio(book.id);
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await audio.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');
  });
  expect(await digest()).toBe(expected);
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
  await page.reload();await context.setOffline(true);await page.reload();
  expect(await digest()).toBe(expected);
});
