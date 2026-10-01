import test from "node:test";
import assert from "node:assert/strict";
import {handler} from "../server.mjs";
test("health returns 200",()=>{let status=0,body="";const res={writeHead:s=>status=s,end:x=>body=String(x||"")};handler({url:"/health"},res);assert.equal(status,200);assert.equal(body,"ok")});
