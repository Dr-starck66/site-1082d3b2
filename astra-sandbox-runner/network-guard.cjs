const net=require("node:net"),http=require("node:http"),https=require("node:https"),dns=require("node:dns");
const local=h=>{h=String(h||"localhost").toLowerCase().replace(/^\[|\]$/g,"");return h==="localhost"||h==="127.0.0.1"||h==="::1"||h==="0.0.0.0"};
const deny=h=>{if(!local(h)){const e=new Error("ASTRA_SANDBOX_NETWORK_DENIED:"+h);e.code="ASTRA_NETWORK_DENIED";throw e}};
const originalConnect=net.Socket.prototype.connect;
net.Socket.prototype.connect=function(...args){let h="localhost";const a=args[0];if(typeof a==="object"&&a)h=a.host||a.hostname||"localhost";else if(typeof args[1]==="string")h=args[1];deny(h);return originalConnect.apply(this,args)};
function wrap(mod,name){const original=mod[name];mod[name]=function(input,...args){let h="localhost";try{const u=typeof input==="string"||input instanceof URL?new URL(input):null;h=u?.hostname||input?.hostname||input?.host||"localhost"}catch{}deny(String(h).split(":")[0]);return original.call(this,input,...args)}}
wrap(http,"request");wrap(http,"get");wrap(https,"request");wrap(https,"get");
const oldFetch=global.fetch;if(oldFetch)global.fetch=async function(input,...args){const u=new URL(typeof input==="string"?input:input.url);deny(u.hostname);return oldFetch(input,...args)};
for(const name of ["lookup","resolve","resolve4","resolve6","resolveAny","resolveCname","resolveMx","resolveNs","resolveTxt","resolveSrv"]){if(typeof dns[name]==="function"){const old=dns[name];dns[name]=function(host,...args){deny(host);return old.call(this,host,...args)}}}
