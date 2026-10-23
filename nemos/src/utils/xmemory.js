// xMemory — Hierarchical Agent Memory
// Based on: arXiv:2602.02007 (2026)
// Principle: "Decoupling before Aggregation"
// Structure: Messages → Segments → Components → Groups
const fs=require("fs").promises,path=require("path"),os=require("os");
const N=process.env.NEMONS_HOME||path.join(os.homedir(),".nemos");
const D=path.join(N,"xmemory");

class XMemory {
  async init(){await fs.mkdir(D,{recursive:true})}
  
  // Level 1: Messages → Segments (split into local events)
  segment(messages) {
    if(!messages||!Array.isArray(messages))return[];
    const segments=[];
    let current=[];
    for(const msg of messages){
      current.push(msg);
      // Split on topic changes or every 10 messages
      if(current.length>=10||this.isTopicChange(msg,current[current.length-2])){
        segments.push({id:`seg-${segments.length}`,messages:[...current],timestamp:new Date().toISOString()});
        current=[];
      }
    }
    if(current.length>0)segments.push({id:`seg-${segments.length}`,messages:current,timestamp:new Date().toISOString()});
    return segments;
  }
  
  isTopicChange(msg,prev){if(!prev)return false;return(msg.topic||"")!==(prev.topic||"")}
  
  // Level 2: Segments → Components (decouple into reusable facts)
  decouple(segment) {
    const components=[];
    for(const msg of(segment.messages||[])){
      // Extract facts, updates, decisions
      if(msg.content){
        const facts=this.extractFacts(msg.content);
        const updates=this.extractUpdates(msg.content);
        const decisions=this.extractDecisions(msg.content);
        for(const f of facts)components.push({type:"fact",value:f,source:msg.id||segment.id});
        for(const u of updates)components.push({type:"update",value:u,source:msg.id||segment.id});
        for(const d of decisions)components.push({type:"decision",value:d,source:msg.id||segment.id});
      }
    }
    return components;
  }
  
  extractFacts(text){const facts=[];const m=text.match(/(?:fact|note|rule):\s*(.+)/gi);if(m)for(const f of m)facts.push(f.replace(/^(?:fact|note|rule):\s*/i,""));return facts}
  extractUpdates(text){const updates=[];const m=text.match(/(?:updated|changed|modified):\s*(.+)/gi);if(m)for(const u of m)updates.push(u.replace(/^(?:updated|changed|modified):\s*/i,""));return updates}
  extractDecisions(text){const decisions=[];const m=text.match(/(?:decided|chose|will):\s*(.+)/gi);if(m)for(const d of m)decisions.push(d.replace(/^(?:decided|chose|will):\s*/i,""));return decisions}
  
  // Level 3: Components → Groups (aggregate by sparsity-semantic faithfulness)
  aggregate(components) {
    const groups=[];
    const used=new Set();
    for(let i=0;i<components.length;i++){
      if(used.has(i))continue;
      const group={id:`grp-${groups.length}`,components:[components[i]],type:components[i].type};
      used.add(i);
      for(let j=i+1;j<components.length;j++){
        if(used.has(j))continue;
        if(this.isSimilar(components[i].value,components[j].value)&&components[i].type===components[j].type){
          group.components.push(components[j]);
          used.add(j);
        }
      }
      groups.push(group);
    }
    return groups;
  }
  
  isSimilar(a,b){const wa=new Set((a||"").toLowerCase().split(/\s+/).filter(w=>w.length>3));const wb=new Set((b||"").toLowerCase().split(/\s+/).filter(w=>w.length>3));if(!wa.size||!wb.size)return false;let c=0;for(const w of wa)if(wb.has(w))c++;return c/Math.max(wa.size,wb.size)>0.3}
  
  // Level 4: Top-down retrieval (groups → components → segments → messages)
  async retrieve(query, limit) {
    limit=limit||5;
    await this.init();
    const all=await this.listAll();
    if(!all.length)return[];
    // Score by group relevance
    return all.map(g=>({...g,_score:this.scoreGroup(g,query)})).filter(g=>g._score>0).sort((a,b)=>b._score-a._score).slice(0,limit);
  }
  
  scoreGroup(group,query){const ql=(query||"").toLowerCase();let score=0;for(const c of(group.components||[])){if(c.value&&c.value.toLowerCase().includes(ql.split(" ")[0]||""))score+=1}return score}
  
  async store(groups){await this.init();const id=`xmem-${Date.now().toString(36)}`;const entry={id,timestamp:new Date().toISOString(),groups};await fs.writeFile(path.join(D,id+".json"),JSON.stringify(entry,null,2));return entry}
  
  async listAll(){try{const f=await fs.readdir(D);const r=[];for(const fn of f)if(fn.endsWith(".json")){try{r.push(JSON.parse(await fs.readFile(path.join(D,fn),"utf8")))}catch{}}return r}catch{return[]}}
  
  async stats(){const all=await this.listAll();return{total_entries:all.length,total_groups:all.reduce((s,e)=>s+(e.groups?.length||0),0),total_components:all.reduce((s,e)=>s+e.groups?.reduce((ss,g)=>ss+g.components.length,0)||0,0)}}
  
  // Full pipeline: messages → segments → components → groups → store
  async process(messages, query) {
    const segments=this.segment(messages);
    const allComponents=[];
    for(const seg of segments){allComponents.push(...this.decouple(seg))}
    const groups=this.aggregate(allComponents);
    await this.store(groups);
    return{segments:segments.length,components:allComponents.length,groups:groups.length};
  }
}

module.exports={XMemory};
