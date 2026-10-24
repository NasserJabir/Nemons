const fs=require("fs").promises,path=require("path"),os=require("os");
const D=require("./runtime-config").nemonsHome();
const S=path.join(D,"skills");
class SL{async register(s){const id=s.id||`skill-${Date.now().toString(36)}`;const f={...s,id,success_rate:1.0,total_uses:0,created_at:new Date().toISOString()};await fs.mkdir(S,{recursive:true});await fs.writeFile(path.join(S,id+".json"),JSON.stringify(f,null,2));return f}
async retrieve(q,l){l=l||5;const all=await this.list();return all.map(s=>({...s,_score:0.5*(s.success_rate||1)})).sort((a,b)=>b._score-a._score).slice(0,l)}
async list(){try{const f=await fs.readdir(S);const r=[];for(const fn of f)if(fn.endsWith(".json")){try{r.push(JSON.parse(await fs.readFile(path.join(S,fn),"utf8")))}catch{}}return r}catch{return[]}}
async stats(){const all=await this.list();return{total:all.length,auto_derived:all.filter(s=>s.derived_from).length}}}
module.exports={SkillLibrary:SL};
