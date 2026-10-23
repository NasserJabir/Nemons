const fs=require("fs").promises,path=require("path"),os=require("os");
const N=process.env.NEMONS_HOME||path.join(os.homedir(),".nemons");
class ToolProviderContract{async init(){await fs.mkdir(path.join(N,"tool-providers"),{recursive:true})}
async register(p){await this.init();const id=p.id||"prov-"+Date.now().toString(36);const c={id,name:p.name||id,type:p.type||"mcp",endpoint:p.endpoint||null,capabilities:p.capabilities||[],tools:[],status:"registered",registered_at:new Date().toISOString()};await fs.writeFile(path.join(N,"tool-providers",id+".json"),JSON.stringify(c,null,2));return c}
async discover(cap){const all=await this.listAll();return cap?all.filter(p=>p.capabilities.includes(cap)):all}
async listAll(){await this.init();try{const f=await fs.readdir(path.join(N,"tool-providers"));const r=[];for(const fn of f)if(fn.endsWith(".json")){try{r.push(JSON.parse(await fs.readFile(path.join(N,"tool-providers",fn),"utf8")))}catch{}}return r}catch{return[]}}
async stats(){const all=await this.listAll();return{total:all.length}}}
module.exports={ToolProviderContract};