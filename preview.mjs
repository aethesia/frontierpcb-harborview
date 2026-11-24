import http from 'node:http';
import {createReadStream} from 'node:fs';
import {stat, realpath} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = await realpath(fileURLToPath(new URL('./', import.meta.url)));
const portArg = process.argv.indexOf('--port');
const port = Number(portArg >= 0 ? process.argv[portArg+1] : process.env.PORT || 8090);
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.gz':'application/gzip',
  '.woff2':'font/woff2','.woff':'font/woff','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon'};
http.createServer(async (req,res) => {
  try {
    if (!['GET','HEAD'].includes(req.method)) {res.writeHead(405);res.end();return;}
    const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    let path = resolve(root,'.'+pathname);
    if (path !== root && !path.startsWith(root+sep)) {res.writeHead(403);res.end();return;}
    let info = await stat(path).catch(()=>null);
    if (!info?.isFile()) {
      if (/^\/(?:data|assets|fonts|api)\//.test(pathname)) {res.writeHead(404);res.end('Not found');return;}
      path=resolve(root,'index.html');info=await stat(path);
    }
    res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream',
      'Content-Length':info.size,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
    if (req.method==='HEAD')res.end();else createReadStream(path).pipe(res);
  } catch {res.writeHead(500);res.end('Preview error');}
}).listen(port,'127.0.0.1',()=>console.log(`FrontierPCB static preview: http://127.0.0.1:${port}`));
