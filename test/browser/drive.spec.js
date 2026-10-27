import {test,expect} from '@playwright/test';
// Keep mocked API calls outside the service worker's network path.
test.use({serviceWorkers:'block'});

test('catálogo Google aparece dentro do app e mantém marcadores ao atualizar',async({page})=>{
  await page.addInitScript(()=>{
    window.google={accounts:{oauth2:{hasGrantedAllScopes:()=>true,initTokenClient:options=>({requestAccessToken:()=>options.callback({access_token:'fake-private-token',expires_in:3600,scope:'https://www.googleapis.com/auth/drive.readonly'})})}}};
  });
  await page.route('**/cloud-config.json',route=>route.fulfill({json:{clientId:'123-test.apps.googleusercontent.com',folderName:'MP3 compactados - Acervo completo'}}));
  const requests=[];
  await page.route('https://www.googleapis.com/drive/v3/**',async route=>{
    const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization','Access-Control-Allow-Methods':'GET, OPTIONS'};
    if(route.request().method()==='OPTIONS'){await route.fulfill({status:204,headers});return;}
    const request=route.request();requests.push(request);expect(request.headers().authorization).toBe('Bearer fake-private-token');
    const q=new URL(request.url()).searchParams.get('q');
    await route.fulfill({headers,json:q.includes('name =')?{files:[{id:'test_root',mimeType:'application/vnd.google-apps.folder'}]}:{files:[{id:'test_mp3',name:'Autor - Meu acervo.mp3',size:'12000',mimeType:'audio/mpeg'}]}});
  });
  await page.goto('/');await page.locator('#drive-connect').click();
  await expect(page.locator('.book-card')).toHaveCount(1);await expect(page.locator('.offline-badge')).toHaveText('No seu Drive');
  await page.locator('.read-toggle').click();
  await page.locator('#drive-connect').click();await expect(page.locator('.book-card')).toHaveCount(1);await expect(page.locator('.read-toggle')).toHaveText('✓ Lido');
  await page.locator('#drive-disconnect').click();await expect(page.locator('#drive-status')).toContainText('Conecte');
  expect(requests.every(r=>!r.url().includes('fake-private-token'))).toBe(true);
  expect(await page.evaluate(()=>!JSON.stringify(localStorage).includes('fake-private-token'))).toBe(true);
  await page.reload();await expect(page.locator('.book-card')).toHaveCount(1);await expect(page.locator('.read-toggle')).toHaveText('✓ Lido');
});

test('configuração ausente é indicada sem fingir conexão com o Drive',async({page})=>{
  await page.route('**/cloud-config.json',route=>route.fulfill({json:{clientId:''}}));
  await page.goto('/');await page.locator('#drive-connect').click();
  await expect(page.locator('#settings-view')).toBeVisible();await expect(page.locator('#google-setup')).toHaveAttribute('open','');
  await expect(page.locator('#toast')).toContainText('precisa do identificador Google');
});

test('configuração lenta do Drive não bloqueia importação local',async({page})=>{
  let release;const gate=new Promise(resolve=>{release=resolve;});
  await page.route('**/cloud-config.json',async route=>{await gate;await route.fulfill({json:{clientId:''}});});
  try{
    await page.goto('/',{waitUntil:'domcontentloaded'});
    await page.locator('#files').setInputFiles({name:'Meu arquivo.mp3',mimeType:'audio/mpeg',buffer:Buffer.from('fixture de armazenamento')});
    await expect(page.locator('.book-card')).toHaveCount(1);
  }finally{release();}
  await expect(page.locator('#drive-connect')).toBeEnabled();
});
