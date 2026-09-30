import http from "node:http";
import {readFile,stat} from "node:fs/promises";
import {extname,join,normalize} from "node:path";
const root=process.cwd(),port=Number(process.env.PORT||3000);
const types={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".json":"application/json; charset=utf-8",".svg":"image/svg+xml",".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".webp":"image/webp"};
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url||"/","http://localhost");
    if(url.pathname==="/health"){res.writeHead(200,{"content-type":"application/json"});return res.end(JSON.stringify({ok:true,service:"astra-builder-omega-v2",version:"2.0.0"}));}
    let p=decodeURIComponent(url.pathname);if(p==="/")p="/index.html";
    const safe=normalize(p).replace(/^([.][.][/\\])+/, "");const file=join(root,safe);
    if(!file.startsWith(root)){res.writeHead(403);return res.end("Forbidden");}
    const s=await stat(file);if(!s.isFile())throw new Error("not file");
    const body=await readFile(file);res.writeHead(200,{"content-type":types[extname(file)]||"application/octet-stream","cache-control":"public, max-age=300"});res.end(body);
  }catch{res.writeHead(404,{"content-type":"text/plain; charset=utf-8"});res.end("Not found");}
});
server.listen(port,"0.0.0.0",()=>console.log("ASTRA BUILDER Ω V2 listening on",port));