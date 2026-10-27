const SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
let sdk;
function loadSDK() {
  if (globalThis.google?.accounts?.oauth2) return Promise.resolve();
  if (!sdk) sdk = new Promise((resolve,reject) => {
    const script=document.createElement('script');
    script.src='https://accounts.google.com/gsi/client';script.async=true;
    script.onload=resolve;script.onerror=()=>{sdk=null;script.remove();reject(Error('Não foi possível abrir a conexão Google. Confira a internet.'));};
    document.head.append(script);
  });
  return sdk;
}
export class DriveLibrary {
  constructor({clientId='',folderName='MP3 verificados - Acervo completo',fetcher=globalThis.fetch.bind(globalThis)}={}) {
    this.clientId=clientId;this.folderName=folderName;this.fetcher=fetcher;
    this.token=null;this.expiresAt=0;this.authorizing=false;
  }
  get configured(){return /^\d+-[\w-]+\.apps\.googleusercontent\.com$/.test(this.clientId);}
  get connected(){return !!this.token&&Date.now()<this.expiresAt;}
  warm(){return this.configured?loadSDK():Promise.resolve();}
  async connect(){
    if(!this.configured)throw Error('A conexão Google ainda precisa ser configurada nos Ajustes.');
    if(this.connected)return;
    if(this.authorizing)throw Error('Conclua a conexão com o Google na janela aberta.');
    await loadSDK();
    this.authorizing=true;
    try{
      await new Promise((resolve,reject)=>{
        const client=google.accounts.oauth2.initTokenClient({client_id:this.clientId,scope:SCOPE,include_granted_scopes:false,
          callback:response=>{
            if(response.error||!response.access_token||!google.accounts.oauth2.hasGrantedAllScopes(response,SCOPE)){reject(Error('O acesso de leitura ao Drive não foi autorizado.'));return;}
            this.token=response.access_token;this.expiresAt=Date.now()+Math.max(0,Number(response.expires_in||3600)-60)*1000;resolve();
          },error_callback:()=>reject(Error('A conexão Google foi fechada ou bloqueada. Toque em Conectar novamente.'))});
        client.requestAccessToken({prompt:''});
      });
    }finally{this.authorizing=false;}
  }
  disconnect(){this.token=null;this.expiresAt=0;}
  async request(path,params={}){
    if(!this.connected)throw Error('Conecte sua conta Google para acessar o acervo privado.');
    const url=new URL('https://www.googleapis.com/drive/v3/'+path);
    for(const [key,value] of Object.entries(params))url.searchParams.set(key,value);
    const response=await this.fetcher(url.href,{headers:{Authorization:'Bearer '+this.token},cache:'no-store',credentials:'omit'});
    if(response.status===401){this.disconnect();throw Error('A conexão Google expirou. Toque em Conectar novamente.');}
    if(!response.ok)throw Error(response.status===403?'O Google não permitiu ler este arquivo. Confira a conta conectada.':'Não foi possível ler o Drive. Tente novamente.');
    return response;
  }
  async files(q){
    let pageToken='',result=[];const visited=new Set();
    do{
      const params={q:'trashed = false and ('+q+')',fields:'nextPageToken,files(id,name,mimeType,size,modifiedTime,parents,capabilities(canDownload))',pageSize:'1000'};
      if(pageToken)params.pageToken=pageToken;
      const data=await(await this.request('files',params)).json();
      result.push(...(data.files||[]));pageToken=data.nextPageToken||'';
      if(pageToken&&visited.has(pageToken))throw Error('O Google repetiu uma página do catálogo. Tente atualizar novamente.');
      visited.add(pageToken);
    }while(pageToken);
    return result;
  }
  async catalog(onProgress=()=>{}){
    const escaped=this.folderName.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    const roots=await this.files("mimeType = 'application/vnd.google-apps.folder' and name = '"+escaped+"'");
    if(!roots.length)throw Error('A pasta de MP3 compactados não apareceu nesta conta Google.');
    const queue=roots.map(x=>x.id),visited=new Set(),audio=new Map();
    while(queue.length){
      const parents=[];
      while(queue.length&&parents.length<25){const id=queue.shift();if(visited.has(id))continue;if(!/^[\w-]+$/.test(id))throw Error('Identificador de pasta inválido.');visited.add(id);parents.push(id);}
      if(!parents.length)continue;
      for(const item of await this.files(parents.map(id=>"'"+id+"' in parents").join(' or '))){
        if(item.mimeType==='application/vnd.google-apps.folder')queue.push(item.id);
        else if(item.name?.toLowerCase().endsWith('.mp3')&&item.capabilities?.canDownload!==false)audio.set(item.id,item);
      }
      onProgress({folders:visited.size,files:audio.size});
    }
    return [...audio.values()];
  }
  media(id){if(!/^[\w-]+$/.test(id))throw Error('Identificador de áudio inválido.');return this.request('files/'+id,{alt:'media'});}
}
