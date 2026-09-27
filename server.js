const fs=require("fs"),path=require("path"),crypto=require("crypto");
console.log("BOOT: server.js started");
let express=null;
try{
  express=require("express");
  console.log("BOOT: express loaded");
}catch(e){
  console.error("EXPRESS_LOAD_ERROR",e&&e.stack||e);
}

process.on("uncaughtException",e=>console.error("UNCAUGHT_EXCEPTION",e&&e.stack||e));
process.on("unhandledRejection",e=>console.error("UNHANDLED_REJECTION",e&&e.stack||e));

const PORT=Math.max(1,Number(process.env.PORT)||3000);

let ethers=null;
try{
  ethers=require("ethers").ethers;
  console.log("Ethers loaded successfully");
}catch(e){
  console.error("ETHERS_LOAD_ERROR",e&&e.stack||e);
}

if(!express){
  const http=require("http");
  const fallback=http.createServer((req,res)=>{
    res.writeHead(503,{"content-type":"application/json; charset=utf-8"});
    res.end(JSON.stringify({ok:false,error:"EXPRESS_NOT_AVAILABLE"}));
  });
  fallback.listen(PORT,"0.0.0.0",()=>console.log(`BOOT: fallback server listening on ${PORT}`));
}else{
const app=express();
app.disable("x-powered-by");
app.use(express.json({limit:"32kb"}));

const RPCS=String(
  process.env.DOTONE_RPC_URLS ||
  process.env.DOTONE_RPC_URL ||
  "https://rpc.dotone.online,https://rpc.dotone.network"
).split(",").map(x=>x.trim()).filter(Boolean);

const CHAIN=Number(process.env.DOTO_CHAIN_ID||505);
const SECRET=String(process.env.DOTO_SIGNER_SECRET||"").trim();
const KEYHEX=String(process.env.DOTO_WALLET_ENCRYPTION_KEY||"").trim();
const DATA=String(process.env.DOTO_DATA_DIR||path.join(process.cwd(),"data"));
const FILE=path.join(DATA,"wallets.enc.json");
const KEY=/^[0-9a-fA-F]{64}$/.test(KEYHEX)?Buffer.from(KEYHEX,"hex"):null;

let provider=null;
let providerIndex=0;

function makeProvider(){
  return new ethers.JsonRpcProvider(
    RPCS[providerIndex],
    {name:"dotone",chainId:CHAIN},
    {staticNetwork:false}
  );
}

function getProvider(){
  if(!provider) provider=makeProvider();
  return provider;
}

async function readRpc(fn){
  let last;
  for(let i=0;i<RPCS.length;i++){
    try{
      return await fn(getProvider());
    }catch(e){
      last=e;
      provider=null;
      providerIndex=(providerIndex+1)%RPCS.length;
    }
  }
  throw last||Error("RPC_UNAVAILABLE");
}

function auth(req){
  const h=String(req.headers.authorization||"");
  if(!SECRET||!h.startsWith("Bearer ")) return false;
  const a=Buffer.from(h.slice(7)),b=Buffer.from(SECRET);
  return a.length===b.length&&crypto.timingSafeEqual(a,b);
}

function guard(req,res,next){
  if(!auth(req)) return res.status(401).json({ok:false,error:"UNAUTHORIZED"});
  next();
}

function enc(s){
  if(!KEY) throw Error("ENCRYPTION_KEY_NOT_CONFIGURED");
  const iv=crypto.randomBytes(12);
  const c=crypto.createCipheriv("aes-256-gcm",KEY,iv);
  const d=Buffer.concat([c.update(s,"utf8"),c.final()]);
  return {
    v:1,
    iv:iv.toString("base64"),
    tag:c.getAuthTag().toString("base64"),
    data:d.toString("base64")
  };
}

function dec(o){
  if(!KEY) throw Error("ENCRYPTION_KEY_NOT_CONFIGURED");
  const d=crypto.createDecipheriv(
    "aes-256-gcm",
    KEY,
    Buffer.from(o.iv,"base64")
  );
  d.setAuthTag(Buffer.from(o.tag,"base64"));
  return Buffer.concat([
    d.update(Buffer.from(o.data,"base64")),
    d.final()
  ]).toString();
}

function store(){
  if(!KEY) throw Error("ENCRYPTION_KEY_NOT_CONFIGURED");
  fs.mkdirSync(DATA,{recursive:true});
  if(!fs.existsSync(FILE)){
    fs.writeFileSync(
      FILE,
      JSON.stringify({version:1,wallets:[]},null,2),
      {mode:0o600}
    );
  }
  return JSON.parse(fs.readFileSync(FILE,"utf8"));
}

function save(x){
  fs.mkdirSync(DATA,{recursive:true});
  const t=FILE+".tmp";
  fs.writeFileSync(t,JSON.stringify(x,null,2),{mode:0o600});
  fs.renameSync(t,FILE);
}

function pub(w){
  return {
    id:w.id,
    name:w.name,
    address:w.address,
    accountIndex:w.accountIndex,
    createdAt:w.createdAt
  };
}

function phrase(s,i=0){
  s=String(s||"").trim().replace(/\s+/g," ").toLowerCase();
  if(!ethers.Mnemonic.isValidMnemonic(s)) throw Error("INVALID_MNEMONIC");
  i=Number(i);
  if(!Number.isInteger(i)||i<0||i>100000) throw Error("INVALID_ACCOUNT_INDEX");
  return ethers.HDNodeWallet.fromPhrase(
    s,
    undefined,
    `m/44'/60'/0'/0/${i}`
  );
}

function wei(a){
  a=String(a??"").trim().replace(/,/g,"");
  if(!/^\d+(?:\.\d{1,18})?$/.test(a)) throw Error("INVALID_AMOUNT");
  const v=ethers.parseUnits(a,18);
  if(v<=0n) throw Error("INVALID_AMOUNT");
  return v;
}

app.get("/",(q,r)=>r.json({
  service:"DotOne DOTO Multi-Wallet Signer",
  chainId:505,
  rpcCount:RPCS.length
}));

app.get("/health",async(q,r)=>{
  try{
    const n=await readRpc(p=>p.getNetwork());
    const id=Number(n.chainId);
    const ok=!!SECRET&&!!KEY&&id===505&&CHAIN===505;
    let count=null;
    try{count=store().wallets.length}catch{}
    r.json({
      ok,
      status:ok?"ok":"incomplete",
      chainId:id,
      expectedChainId:505,
      rpc:RPCS[providerIndex],
      rpcCount:RPCS.length,
      secretConfigured:!!SECRET,
      encryptionConfigured:!!KEY,
      walletCount:count
    });
  }catch(e){
    r.status(503).json({
      ok:false,
      status:"rpc_error",
      error:e.message,
      rpc:RPCS[providerIndex],
      rpcCount:RPCS.length
    });
  }
});

app.get("/wallets",guard,(q,r)=>{
  try{
    r.json({ok:true,wallets:store().wallets.map(pub)});
  }catch(e){
    r.status(503).json({ok:false,error:e.message});
  }
});

app.post("/wallets/import-mnemonic",guard,(q,r)=>{
  try{
    const w=phrase(q.body?.mnemonic,q.body?.accountIndex??0);
    const s=store();
    const dup=s.wallets.find(
      x=>x.address.toLowerCase()===w.address.toLowerCase()
    );
    if(dup){
      return r.status(409).json({
        ok:false,
        error:"WALLET_ALREADY_EXISTS",
        wallet:pub(dup)
      });
    }

    const x={
      id:crypto.randomUUID(),
      name:String(q.body?.name||"Wallet").trim().slice(0,80)||"Wallet",
      address:w.address,
      accountIndex:Number(q.body?.accountIndex??0),
      createdAt:new Date().toISOString(),
      secret:enc(w.privateKey)
    };

    s.wallets.push(x);
    save(s);

    r.status(201).json({ok:true,wallet:pub(x)});
  }catch(e){
    r.status(400).json({ok:false,error:e.message});
  }
});

app.get("/wallets/:id",guard,(q,r)=>{
  try{
    const w=store().wallets.find(x=>x.id===q.params.id);
    if(!w) return r.status(404).json({ok:false,error:"WALLET_NOT_FOUND"});
    r.json({ok:true,wallet:pub(w)});
  }catch(e){
    r.status(503).json({ok:false,error:e.message});
  }
});

app.get("/wallets/:id/balance",guard,async(q,r)=>{
  try{
    const w=store().wallets.find(x=>x.id===q.params.id);
    if(!w) return r.status(404).json({ok:false,error:"WALLET_NOT_FOUND"});

    const b=await readRpc(p=>p.getBalance(w.address));

    r.json({
      ok:true,
      wallet:pub(w),
      balanceWei:b.toString(),
      balanceDOTO:ethers.formatEther(b),
      rpc:RPCS[providerIndex]
    });
  }catch(e){
    r.status(503).json({ok:false,error:e.message});
  }
});

app.post("/wallets/:id/send-native",guard,async(q,r)=>{
  try{
    const w=store().wallets.find(x=>x.id===q.params.id);
    if(!w) return r.status(404).json({ok:false,error:"WALLET_NOT_FOUND"});

    if(Number(q.body?.chainId)!==505) throw Error("CHAIN_ID_MISMATCH");

    const to=String(q.body?.to||"").trim();
    if(!ethers.isAddress(to)) throw Error("INVALID_DESTINATION");

    const v=q.body?.amountWei!=null
      ?BigInt(String(q.body.amountWei))
      :wei(q.body?.amount);

    if(v<=0n) throw Error("INVALID_AMOUNT");

    const p=getProvider();
    const n=await p.getNetwork();
    if(Number(n.chainId)!==505) throw Error("RPC_CHAIN_ID_MISMATCH");

    const s=new ethers.Wallet(dec(w.secret),p);

    if((await s.getAddress()).toLowerCase()!==w.address.toLowerCase()){
      throw Error("WALLET_INTEGRITY_ERROR");
    }

    const tx=await s.sendTransaction({
      to:ethers.getAddress(to),
      value:v
    });

    r.json({
      ok:true,
      walletId:w.id,
      from:w.address,
      to:ethers.getAddress(to),
      amountDOTO:ethers.formatEther(v),
      txHash:tx.hash,
      rpc:RPCS[providerIndex],
      orderId:q.body?.orderId||null
    });
  }catch(e){
    r.status(400).json({ok:false,error:e.message});
  }
});

app.delete("/wallets/:id",guard,(q,r)=>{
  try{
    const s=store();
    const i=s.wallets.findIndex(x=>x.id===q.params.id);
    if(i<0) return r.status(404).json({ok:false,error:"WALLET_NOT_FOUND"});
    const x=s.wallets.splice(i,1)[0];
    save(s);
    r.json({ok:true,removed:pub(x)});
  }catch(e){
    r.status(503).json({ok:false,error:e.message});
  }
});

app.listen(PORT,"0.0.0.0",()=>{
  console.log(`DOTO multi-wallet signer listening on ${PORT}`);
  console.log(`RPC endpoints configured: ${RPCS.length}`);
  console.log(`Ethers available: ${!!ethers}`);
});
}
