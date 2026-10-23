const fs=require("fs").promises,path=require("path"),os=require("os");
const N=process.env.NEMONS_HOME||path.join(os.homedir(),".nemons");
class AdapterContract{async init(){await fs.mkdir(path.join(N,"adapters"),{recursive:true})}
async register(a){await this.init();const id=a.id||"adapter-"+Date.now().toString(36);const c={id,name:a.name||id,coding_agent:a.coding_agent||"unknown",capabilities:a.capabilities||["intercept","inject","collect"],status:"registered",usage:{invocations:0,successful:0},registered_at:new Date().toISOString()};await fs.writeFile(path.join(N,"adapters",id+".json"),JSON.stringify(c,null,2));return c}
async listAll(){await this.init();try{const f=await fs.readdir(path.join(N,"adapters"));const r=[];for(const fn of f)if(fn.endsWith(".json")){try{r.push(JSON.parse(await fs.readFile(path.join(N,"adapters",fn),"utf8")))}catch{}}return r}catch{return[]}}
async stats(){const all=await this.listAll();return{total:all.length}}}
module.exports={AdapterContract};