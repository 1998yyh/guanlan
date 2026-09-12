import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {validateSnapshot,buildAnalysisPrompt} from './core.mjs';
const exec=promisify(execFile);
const host=process.env.HOST||'127.0.0.1';
if(host!=='127.0.0.1'&&!process.env.API_TOKEN)throw new Error('对外监听时请设置 API_TOKEN');
let cached;let pending;
async function snapshot(){
 if(process.env.MARKET_PROVIDER!=='akshare')return JSON.parse(await readFile(new URL('../src/demo.json',import.meta.url),'utf8'));
 if(cached&&Date.now()-Date.parse(cached.asOf)<60_000)return cached;
 if(pending)return pending;
 pending=(async()=>{const {stdout}=await exec(process.env.PYTHON||'python3',[new URL('./market.py',import.meta.url).pathname],{timeout:45000,maxBuffer:8*1024*1024});cached={quotes:validateSnapshot(JSON.parse(stdout)),source:'AKShare / 东方财富 · 抓取时间非逐笔时间',asOf:new Date().toISOString(),demo:false};return cached;})();
 try{return await pending;}finally{pending=undefined;}
}
const server=http.createServer(async(req,res)=>{
 res.setHeader('Content-Type','application/json; charset=utf-8');
 const origin=req.headers.origin;
 if(['https://localhost','http://localhost','http://localhost:5173','http://127.0.0.1:5173',process.env.WEB_ORIGIN].filter(Boolean).includes(origin)){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
 res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
 if(req.method==='OPTIONS'){res.writeHead(204).end();return;}
 const send=(status,data)=>{res.writeHead(status);res.end(JSON.stringify(data));};
 if(process.env.API_TOKEN&&req.headers.authorization!==`Bearer ${process.env.API_TOKEN}`){send(401,{error:'访问口令无效'});return;}
 try{
  if(req.url==='/api/health'){send(200,{ok:true,aiConfigured:Boolean(process.env.OLLAMA_MODEL),provider:process.env.MARKET_PROVIDER||'demo'});return;}
  if(req.method==='GET'&&req.url==='/api/quotes'){send(200,await snapshot());return;}
  if(req.method==='POST'&&req.url==='/api/analyze'){
   if(!process.env.OLLAMA_MODEL){send(503,{error:'AI 尚未配置：请在服务端设置 OLLAMA_MODEL，并启动 Ollama。'});return;}
   let body='';for await(const chunk of req){body+=chunk;if(body.length>16000){send(413,{error:'分析内容过长'});return;}}
   let input;try{input=JSON.parse(body);}catch{send(400,{error:'请求格式错误'});return;}
   if(!/^\d{6}$/.test(input.code)||typeof input.notes!=='string'){send(400,{error:'股票代码或笔记无效'});return;}
   const data=await snapshot();if(!data.quotes.some(q=>q.code===input.code)){send(404,{error:'当前行情中没有此股票'});return;}
   const response=await fetch(`${process.env.OLLAMA_URL||'http://127.0.0.1:11434'}/api/chat`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OLLAMA_MODEL,stream:false,messages:[{role:'user',content:buildAnalysisPrompt(data,input.code,input.notes)}]}),signal:AbortSignal.timeout(90000)});
   if(!response.ok)throw new Error('模型服务请求失败');const result=await response.json();if(!result.message?.content)throw new Error('模型返回空内容');
   send(200,{text:result.message.content,source:data.source,asOf:data.asOf,demo:data.demo,model:process.env.OLLAMA_MODEL});return;
  }
  send(404,{error:'接口不存在'});
 }catch(error){console.error(error.message);send(502,{error:'数据或模型服务不可用，请检查服务端配置与日志后重试。'});}
});
server.listen(Number(process.env.PORT)||8787,host,()=>console.log(`观澜 API http://${host}:${Number(process.env.PORT)||8787}`));
