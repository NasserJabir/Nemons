const fs=require("fs").promises,path=require("path"),os=require("os");
const N=require("./runtime-config").nemonsHome();
class M{constructor(){this.types={episodic:path.join(N,"memory","episodic"),semantic:path.join(N,"memory","semantic"),procedural:path.join(N,"memory","procedural"),working:path.join(N,"memory","working")};this.working=new Map()}
async init(){for(const d of Object.values(this.types))await fs.mkdir(d,{recursive:true})}
async store(t,d){await this.init();const id=d.id||`${t}-${Date.now().toString(36)}`;const f={id,type:t,timestamp:new Date().toISOString(),...d};await fs.writeFile(path.join(this.types[t],id+".json"),JSON.stringify(f,null,2));return f}
async list(t,l){await this.init();try{const f=await fs.readdir(this.types[t]);const r=[];for(const fn of f)if(fn.endsWith(".json")){try{r.push(JSON.parse(await fs.readFile(path.join(this.types[t],fn),"utf8")))}catch{}}return r.slice(-(l||10)).reverse()}catch{return[]}}
async stats(){const s={};for(const t of Object.keys(this.types)){try{const f=await fs.readdir(this.types[t]);s[t]={count:f.length}}catch{s[t]={count:0}}}s.working={count:this.working.size};return s}}
module.exports={MultiTypeMemory:M};
