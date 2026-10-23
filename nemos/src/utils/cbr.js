const fs=require("fs").promises,path=require("path"),os=require("os");
const D=process.env.NEMONS_HOME||path.join(os.homedir(),".nemos");
const E=path.join(D,"experiences");
function sim(a,b){const wa=new Set((a||"").toLowerCase().split(/\s+/).filter(w=>w.length>3));const wb=new Set((b||"").toLowerCase().split(/\s+/).filter(w=>w.length>3));if(!wa.size||!wb.size)return 0;let c=0;for(const w of wa)if(wb.has(w))c++;return c/Math.max(wa.size,wb.size)}
class CBR{async retrieve(q,l){l=l||3;const all=await this.list();if(!all.length)return[];return all.map(e=>({...e,_score:0.5*sim(q,e.prompt||"")+0.3*(e.success_rate||1)})).sort((a,b)=>b._score-a._score).slice(0,l)}
async retain(sol,meta){const id=`exp-${Date.now().toString(36)}`;const p=path.join(E,id+".json");const e={id,timestamp:new Date().toISOString(),prompt:meta.prompt,solution:sol,success_rate:meta.success?1:0,adapter:meta.adapter||"unknown"};await fs.mkdir(E,{recursive:true});await fs.writeFile(p,JSON.stringify(e,null,2));return e}
async list(){try{const f=await fs.readdir(E);const r=[];for(const fn of f)if(fn.endsWith(".json")){try{r.push(JSON.parse(await fs.readFile(path.join(E,fn),"utf8")))}catch{}}return r}catch{return[]}}
async stats(){const all=await this.list();return{total:all.length,success_rate:all.length?all.filter(e=>e.success_rate>0.5).length/all.length:0}}}
module.exports={CBRExperienceStore:CBR};
