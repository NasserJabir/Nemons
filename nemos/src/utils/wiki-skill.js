// WikiSkill (arXiv:2608.27454)
// Compile agent experience into persistent skills (like a wiki for agents)
const fs=require("fs").promises,path=require("path"),os=require("os");
const N=require("./runtime-config").nemonsHome();
const D=path.join(N,"wikiskills");

class WikiSkill {
  async init(){await fs.mkdir(D,{recursive:true})}
  
  // Compile a successful run into a persistent skill
  async compileFromRun(run){
    if(!run.success)return{error:"only successful runs can be compiled"};
    
    const skill={
      id:`wiki-${Date.now().toString(36)}`,
      title:this.generateTitle(run),
      source_run:run.id,
      content:this.generateContent(run),
      procedure:this.extractProcedure(run),
      lessons_learned:this.extractLessons(run),
      created_at:new Date().toISOString(),
      // Versioning (wiki-style)
      version:1,
      revisions:[],
    };
    
    await this.init();
    await fs.writeFile(path.join(D,skill.id+".json"),JSON.stringify(skill,null,2));
    return skill;
  }
  
  generateTitle(run){
    const p=run.prompt||"";
    // Extract key action
    if(p.toLowerCase().includes("implement"))return"Implementation: "+p.slice(0,60);
    if(p.toLowerCase().includes("fix"))return"Bug Fix: "+p.slice(0,60);
    if(p.toLowerCase().includes("refactor"))return"Refactor: "+p.slice(0,60);
    return"Experience: "+p.slice(0,60);
  }
  
  generateContent(run){
    const parts=[];
    parts.push(`## Task\n${run.prompt||"N/A"}`);
    parts.push(`## Solution\n${run.evidence?.diff||"N/A"}`);
    parts.push(`## Tests\n${JSON.stringify(run.evidence?.test_results||{})}`);
    parts.push(`## Verification\n${JSON.stringify(run.verification||{})}`);
    return parts.join("\n\n");
  }
  
  extractProcedure(run){
    const steps=[];
    if(run.evidence?.diff)steps.push("Apply the generated code changes");
    if(run.evidence?.test_results)steps.push("Verify tests pass");
    if(run.verification?.pass)steps.push("Confirm verification succeeded");
    return steps;
  }
  
  extractLessons(run){
    const lessons=[];
    if(run.evidence?.lint_results?.errors===0)lessons.push("Zero lint errors achieved");
    if(run.evidence?.test_results?.passed)lessons.push("All tests passed");
    if(run.evidence?.coverage_delta>0)lessons.push(`Coverage increased by ${run.evidence.coverage_delta}`);
    return lessons;
  }
  
  // Revise a skill (wiki-style collaborative editing)
  async revise(id,revision,author){
    await this.init();
    try{
      const skill=JSON.parse(await fs.readFile(path.join(D,id+".json"),"utf8"));
      skill.revisions.push({
        version:skill.version,
        author:author||"system",
        timestamp:new Date().toISOString(),
        change:revision.change||"updated",
        old_content:skill.content,
      });
      skill.version++;
      if(revision.content)skill.content=revision.content;
      if(revision.procedure)skill.procedure=revision.procedure;
      if(revision.lessons)skill.lessons_learned=[...new Set([...skill.lessons_learned,...revision.lessons])];
      skill.last_revised=new Date().toISOString();
      await fs.writeFile(path.join(D,id+".json"),JSON.stringify(skill,null,2));
      return skill;
    }catch{return{error:"skill not found"}}
  }
  
  async retrieve(query,limit){
    limit=limit||5;
    const all=await this.listAll();
    const q=(query||"").toLowerCase();
    return all.map(s=>{
      let score=0;
      if(s.title&&s.title.toLowerCase().includes(q.split(" ")[0]||""))score+=0.5;
      if(s.content&&s.content.toLowerCase().includes(q.split(" ")[0]||""))score+=0.3;
      return{...s,_score:score};
    }).filter(s=>s._score>0).sort((a,b)=>b._score-a._score).slice(0,limit);
  }
  
  async listAll(){
    try{
      const files=await fs.readdir(D);
      const skills=[];
      for(const f of files)if(f.endsWith(".json")){
        try{skills.push(JSON.parse(await fs.readFile(path.join(D,f),"utf8")))}catch{}
      }
      return skills;
    }catch{return[]}
  }
  
  async stats(){
    const all=await this.listAll();
    return{
      total:all.length,
      total_revisions:all.reduce((s,x)=>s+x.revisions?.length,0),
      avg_version:all.length?(all.reduce((s,x)=>s+x.version,0)/all.length).toFixed(1):0,
      reference:"arXiv:2608.27454",
    };
  }
}
module.exports={WikiSkill};
