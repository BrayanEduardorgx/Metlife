import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.jpg':'image/jpeg', '.png':'image/png' };
const dataFile = join(process.cwd(), 'shared-records.json');
let recordQueue=Promise.resolve();
async function getRecords(){ try { return JSON.parse(await readFile(dataFile, 'utf8')); } catch { return []; } }
async function body(req){ let value=''; for await (const chunk of req) value+=chunk; return JSON.parse(value||'{}'); }
http.createServer(async (req,res) => {
  try {
    if(req.url==='/api/records' && req.method==='GET'){
      const records=await getRecords();
      res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
      return res.end(JSON.stringify(records));
    }
    if(req.url==='/api/records' && req.method==='POST'){
      const record=await body(req);
      if(!record._id)record._id=`record_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
      recordQueue=recordQueue.then(async()=>{const records=await getRecords();if(!records.some(item=>item._id===record._id)){records.push(record);await writeFile(dataFile,JSON.stringify(records,null,2),'utf8');}});
      await recordQueue;
      res.writeHead(201,{'Content-Type':'application/json; charset=utf-8'});
      return res.end(JSON.stringify(record));
    }
    const file = join(process.cwd(), req.url === '/' ? 'index.html' : decodeURIComponent(req.url).replace(/^\//,''));
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end('No encontrado'); }
}).listen(4173, '0.0.0.0', () => console.log('METLIFE listo en http://localhost:4173'));
