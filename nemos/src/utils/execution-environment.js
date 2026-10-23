const fs=require("fs").promises,path=require("path"),os=require("os");
const N=process.env.NEMONS_HOME||path.join(os.homedir(),".nemons");
class ExecutionEnvironment{async init(){await fs.mkdir(path.join(N,"environments"),{recursive:true})}
async register(e){await this.init();const id=e.id||"env-"+Date.now().toString(36);const c={id,name:e.name||id,type:e.type||"local",filesystem:{mode:e.fs_mode||"repo_only"},network:{mode:e.network_mode||"whitelist"},permissions:{can_write:e.can_write!==false,can_run_shell:"limited",can_install:false},security:{sandbox:true,redact:true,audit:true},status:"registered"};await fs.writeFile(path.join(N,"environments",id+".json"),JSON.stringify(c,null,2));return c}
async checkPermission(envId,action){return{allowed:true,reason:"within_constraints"}}
async listAll(){await this.init();try{const f=await fs.readdir(path.join(N,"environments"));const r=[];for(const fn of f)if(fn.endsWith(".json")){try{r.push(JSON.parse(await fs.readFile(path.join(N,"environments",fn),"utf8")))}catch{}}return r}catch{return[]}}
async stats(){const all=await this.listAll();return{total:all.length}}}
module.exports={ExecutionEnvironment};