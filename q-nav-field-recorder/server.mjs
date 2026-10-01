import http from "node:http";
import fs from "node:fs";
const PORT=Number(process.env.PORT||8080);
const page=fs.readFileSync(new URL("./index.html",import.meta.url),"utf8");
export function handler(req,res){
  if(req.url==="/health"){res.writeHead(200,{"content-type":"text/plain","cache-control":"no-store"});return res.end("ok")}
  if(req.url==="/"||req.url==="/index.html"){res.writeHead(200,{"content-type":"text/html; charset=utf-8","cache-control":"no-store"});return res.end(page)}
  res.writeHead(404,{"content-type":"text/plain"});res.end("Not found");
}
if(process.env.NODE_ENV!=="test") http.createServer(handler).listen(PORT,"0.0.0.0",()=>console.log("QNAV_FIELD_RECORDER_READY port="+PORT));
