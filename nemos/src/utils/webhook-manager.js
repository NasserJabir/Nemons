const fs=require("fs").promises,path=require("path"),os=require("os");
const N=process.env.NEMONS_HOME||path.join(os.homedir(),".nemons");
const EVENTS=["experience.stored","verification.passed","verification.failed","trust.changed","candidate.adopted","subagent.spawned"];
class WebhookManager{async init(){await fs.mkdir(path.join(N,"webhooks"),{recursive:true})}
async subscribe(wh){await this.init();const id=wh.id||"hook-"+Date.now().toString(36);const e={id,url:wh.url,events:wh.events||["*"],status:"active",delivery:{sent:0,success:0}};await fs.writeFile(path.join(N,"webhooks",id+".json"),JSON.stringify(e,null,2));return e}
async emit(event,payload){const subs=await this.listActive();const matching=subs.filter(s=>s.events.includes("*")||s.events.includes(event));return{event,notified:matching.length}}
async listActive(){await this.init();try{const f=await fs.readdir(path.join(N,"webhooks"));const r=[];for(const fn of f)if(fn.endsWith(".json")){try{const s=JSON.parse(await fs.readFile(path.join(N,"webhooks",fn),"utf8"));if(s.status==="active")r.push(s)}catch{}}return r}catch{return[]}}
async stats(){const all=await this.listActive();return{total:all.length,supported_events:EVENTS}}}
module.exports={WebhookManager,SUPPORTED_EVENTS:EVENTS};