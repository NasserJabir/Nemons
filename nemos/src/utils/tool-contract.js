const fs=require("fs").promises,path=require("path"),os=require("os");
const N=process.env.NEMONS_HOME||path.join(os.homedir(),".nemons");
class ToolContract{async init(){await fs.mkdir(path.join(N,"tools"),{recursive:true})}
async register(t){await this.init();const id=t.id||"tool-"+Date.now().toString(36);const c={id,name:t.name||id,capabilities:t.capabilities||[],input_schema:t.input_schema||{},permissions:t.permissions||["read"],provider:t.provider_id||"builtin",usage:{calls:0,success:0},registered_at:new Date().toISOString()};await fs.writeFile(path.join(N,"tools",id+".json"),JSON.stringify(c,null,2));return c}
async get(id){try{return JSON.parse(await fs.readFile(path.join(N,"tools",id+".json"),"utf8"))}catch{return null}}
async listAll(){await this.init();try{const f=await fs.readdir(path.join(N,"tools"));const r=[];for(const fn of f)if(fn.endsWith(".json")){try{r.push(JSON.parse(await fs.readFile(path.join(N,"tools",fn),"utf8")))}catch{}}return r}catch{return[]}}
async stats(){const all=await this.listAll();return{total:all.length}}}
module.exports={ToolContract};