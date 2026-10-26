import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname,'..',process.argv.includes('--dist') ? 'dist' : '.');
const port = Number(process.env.PORT || 4173);
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png'};
const server = http.createServer(async(req,res)=>{
  try {
    const url = new URL(req.url,'http://localhost');
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    let filename = path.resolve(root,relative || 'index.html');
    if (filename !== root && !filename.startsWith(root+path.sep)) { res.writeHead(403); res.end(); return; }
    if ((await stat(filename)).isDirectory()) filename = path.join(filename,'index.html');
    const body = await readFile(filename);
    res.writeHead(200,{'Content-Type':mime[path.extname(filename)] || 'application/octet-stream','Cache-Control':'no-cache'}); res.end(body);
  } catch { res.writeHead(404); res.end('Arquivo não encontrado'); }
});
server.listen(port,'127.0.0.1',()=>console.log(`AudioVerse: http://127.0.0.1:${port}`));
