// MetaShare — Failure-Aware Collective Self-Improvement (arXiv:2610.21887)
// Agents share failure experiences for collective learning
// NeurIPS 2026 Meta-Agents Workshop
const fs=require("fs").promises,path=require("path"),os=require("os");
const N=require("./runtime-config").nemonsHome();
const D=path.join(N,"metashare");

class MetaShare {
  async init(){await fs.mkdir(D,{recursive:true})}
  
  // Share a failure experience with the collective
  async shareFailure(failure){
    await this.init();
    const id=`fail-${Date.now().toString(36)}`;
    const entry={
      id,
      agent_id:failure.agent_id||"unknown",
      task:failure.task||"",
      failure_type:failure.type||"generic",
      root_cause:failure.root_cause||"unknown",
      attempted_solution:failure.attempted||"",
      what_failed:failure.description||"",
      what_worked:failure.worked||"",
      lesson:failure.lesson||"",
      severity:failure.severity||"medium",
      shared_at:new Date().toISOString(),
      // Collective feedback
      feedback:[],
      // Solutions proposed by other agents
      solutions:[],
    };
    await fs.writeFile(path.join(D,id+".json"),JSON.stringify(entry,null,2));
    return entry;
  }
  
  // Retrieve similar failures (for learning)
  async retrieveSimilar(task,limit){
    limit=limit||5;
    const all=await this.listAll();
    const t=(task||"").toLowerCase();
    return all.map(f=>{
      let score=0;
      // Match by task keywords
      if(f.task&&f.task.toLowerCase().includes(t.split(" ")[0]||""))score+=0.4;
      // Match by failure type
      if(f.failure_type&&t.includes(f.failure_type.toLowerCase()))score+=0.3;
      // Prioritize failures with solutions
      if(f.solutions.length>0)score+=0.2;
      return{...f,_score:score};
    }).filter(f=>f._score>0).sort((a,b)=>b._score-a._score).slice(0,limit);
  }
  
  // Propose a solution to a shared failure (collective learning)
  async proposeSolution(failureId,solution,agentId){
    await this.init();
    try{
      const f=JSON.parse(await fs.readFile(path.join(D,failureId+".json"),"utf8"));
      f.solutions.push({
        agent_id:agentId||"anonymous",
        solution:solution,
        proposed_at:new Date().toISOString(),
        votes:0,
      });
      await fs.writeFile(path.join(D,failureId+".json"),JSON.stringify(f,null,2));
      return f;
    }catch{return{error:"failure not found"}}
  }
  
  // Vote on a solution (collective intelligence)
  async voteSolution(failureId,solutionIndex,vote){
    await this.init();
    try{
      const f=JSON.parse(await fs.readFile(path.join(D,failureId+".json"),"utf8"));
      if(f.solutions[solutionIndex]){
        f.solutions[solutionIndex].votes+=(vote>0?1:-1);
        await fs.writeFile(path.join(D,failureId+".json"),JSON.stringify(f,null,2));
      }
      return f;
    }catch{return{error:"not found"}}
  }
  
  // Add feedback to a failure
  async addFeedback(failureId,feedback,agentId){
    await this.init();
    try{
      const f=JSON.parse(await fs.readFile(path.join(D,failureId+".json"),"utf8"));
      f.feedback.push({
        agent_id:agentId||"anonymous",
        feedback,
        timestamp:new Date().toISOString(),
      });
      await fs.writeFile(path.join(D,failureId+".json"),JSON.stringify(f,null,2));
      return f;
    }catch{return{error:"not found"}}
  }
  
  async listAll(){
    try{
      const files=await fs.readdir(D);
      const failures=[];
      for(const f of files)if(f.endsWith(".json")){
        try{failures.push(JSON.parse(await fs.readFile(path.join(D,f),"utf8")))}catch{}
      }
      return failures;
    }catch{return[]}
  }
  
  async stats(){
    const all=await this.listAll();
    return{
      total_failures_shared:all.length,
      total_solutions_proposed:all.reduce((s,f)=>s+f.solutions.length,0),
      total_feedback:all.reduce((s,f)=>s+f.feedback.length,0),
      by_severity:all.reduce((a,f)=>{a[f.severity]=(a[f.severity]||0)+1;return a},{}),
      reference:"arXiv:2610.21887 (NeurIPS 2026)",
    };
  }
}
module.exports={MetaShare};
