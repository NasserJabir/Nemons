// Subagent Spawn Model (arXiv:2605.08460)
// 3 memory modes: inherit-full, inherit-partial, agent-agnostic
// 2 lifespan modes: one-time, persistent
const fs=require("fs").promises,path=require("path"),os=require("os");
const { writeAtomic } = require("../store/storage");
const { timeId } = require("./ids");
const N=require("./runtime-config").nemonsHome();
const D=path.join(N,"subagents");

class SubagentManager {
  async init(){await fs.mkdir(D,{recursive:true})}
  
  // Spawn a new subagent with specified modes
  async spawn(config){
    await this.init();
    const id=config.id||timeId("sub");
    const subagent={
      id,
      parent_id:config.parent_id||"main",
      role:config.role||"executor",
      capabilities:config.capabilities||[],
      memory_mode:config.memory_mode||"agent-agnostic", // inherit-full | inherit-partial | agent-agnostic
      lifespan:config.lifespan||"one-time", // one-time | persistent
      task:config.task||"",
      state:"created",
      created_at:new Date().toISOString(),
      // Security: track resource access
      resource_access:[],
      // Memory projection (based on mode)
      inherited_memory:this.projectMemory(config.memory_mode,config.parent_memory||{}),
    };
    await writeAtomic(path.join(D,id+".json"),JSON.stringify(subagent,null,2));
    return subagent;
  }
  
  // Project memory based on inheritance mode
  projectMemory(mode,parentMemory){
    switch(mode){
      case"inherit-full":
        return{...parentMemory,warning:"full inheritance - check for malicious content"};
      case"inherit-partial":
        const safe={};
        // Only inherit facts and decisions, not raw conversation
        if(parentMemory.facts)safe.facts=parentMemory.facts;
        if(parentMemory.decisions)safe.decisions=parentMemory.decisions;
        return safe;
      case"agent-agnostic":
        return{}; // no inheritance - full isolation
      default:
        return{};
    }
  }
  
  // Check security invariants
  checkInvariants(subagent){
    const violations=[];
    
    // Termination scope: only parent can terminate children
    // Memory isolation: subagent can only access memory per its mode
    if(subagent.memory_mode==="inherit-full"&&!subagent.parent_id){
      violations.push({invariant:"memory_isolation",violation:"full_inheritance_without_parent"});
    }
    
    // Resource access must be bounded by role
    const allowed=this.getResourcesForRole(subagent.role);
    for(const resource of subagent.resource_access){
      if(!allowed.includes(resource)){
        violations.push({invariant:"resource_access_control",violation:`unauthorized: ${resource}`});
      }
    }
    
    return{valid:violations.length===0,violations};
  }
  
  getResourcesForRole(role){
    const resources={
      executor:["filesystem","tests","lint"],
      reviewer:["filesystem","diff","tests"],
      planner:["filesystem","docs"],
      security:["filesystem","secrets-scan","policy"],
    };
    return resources[role]||["filesystem"];
  }
  
  async complete(id,result){
    await this.init();
    try{
      const sub=JSON.parse(await fs.readFile(path.join(D,id+".json"),"utf8"));
      sub.state="completed";
      sub.result=result;
      sub.completed_at=new Date().toISOString();
      await writeAtomic(path.join(D,id+".json"),JSON.stringify(sub,null,2));
      return sub;
    }catch{return{error:"not found"}}
  }
  
  async list(){
    await this.init();
    const files=await fs.readdir(D);
    const subs=[];
    for(const f of files)if(f.endsWith(".json")){
      try{subs.push(JSON.parse(await fs.readFile(path.join(D,f),"utf8")))}catch{}
    }
    return subs;
  }
  
  async stats(){
    const subs=await this.list();
    return{
      total:subs.length,
      active:subs.filter(s=>s.state==="created"||s.state==="running").length,
      completed:subs.filter(s=>s.state==="completed").length,
      by_memory_mode:{
        "inherit-full":subs.filter(s=>s.memory_mode==="inherit-full").length,
        "inherit-partial":subs.filter(s=>s.memory_mode==="inherit-partial").length,
        "agent-agnostic":subs.filter(s=>s.memory_mode==="agent-agnostic").length,
      },
      by_lifespan:{
        "one-time":subs.filter(s=>s.lifespan==="one-time").length,
        "persistent":subs.filter(s=>s.lifespan==="persistent").length,
      },
      reference:"arXiv:2605.08460",
    };
  }
}
module.exports={SubagentManager};
