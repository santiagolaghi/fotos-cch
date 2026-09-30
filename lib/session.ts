const enc = new TextEncoder();
function secret(){ const s=process.env.APP_SESSION_SECRET; if(!s) throw new Error('APP_SESSION_SECRET missing'); return s; }
function b64url(bytes:Uint8Array){ return Buffer.from(bytes).toString('base64url'); }
function fromB64url(v:string){ return new Uint8Array(Buffer.from(v,'base64url')); }
async function key(){ return crypto.subtle.importKey('raw',enc.encode(secret()),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']); }
export async function createSessionToken(hours=12){ const exp=Date.now()+hours*60*60*1000; const msg=String(exp); const sig=new Uint8Array(await crypto.subtle.sign('HMAC',await key(),enc.encode(msg))); return `${msg}.${b64url(sig)}`; }
export async function verifySessionToken(token?:string|null){ if(!token)return false; const [expRaw,sigRaw]=token.split('.'); const exp=Number(expRaw); if(!exp||exp<Date.now()||!sigRaw)return false; try{return crypto.subtle.verify('HMAC',await key(),fromB64url(sigRaw),enc.encode(expRaw));}catch{return false;} }
