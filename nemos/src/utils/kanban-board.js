// Kanban Board — Worker State Tracking
// Based on: Agent Orchestrator (OrchestratorInc)
// States: Working, Needs you, In review, Ready to merge
const fs=require("fs").promises,path=require("path"),os=require("os");
const N=process.env.NEMONS_HOME||path.join(os.homedir(),".nemos");
const D=path.join(N,"kanban");

const STATES=["working","needs_you","in_review","ready_to_merge","merged","blocked"];

class KanbanBoard {
  async init(){await fs.mkdir(D,{recursive:true})}
  
  async createWorker(worker){await this.init();const id=worker.id||`worker-${Date.now().toString(36)}`;const w={id,...worker,state:"working",created_at:new Date().toISOString(),history:[{state:"working",timestamp:new Date().toISOString()}]};await fs.writeFile(path.join(D,id+".json"),JSON.stringify(w,null,2));return w}
  
  async moveWorker(id,newState,reason){await this.init();try{const w=JSON.parse(await fs.readFile(path.join(D,id+".json"),"utf8"));if(!STATES.includes(newState))return{error:"invalid state"};w.state=newState;w.history.push({state:newState,timestamp:new Date().toISOString(),reason});await fs.writeFile(path.join(D,id+".json"),JSON.stringify(w,null,2));return w}catch{return{error:"not found"}}}
  
  async getBoard(){await this.init();const files=await fs.readdir(D);const board={};for(const s of STATES)board[s]=[];for(const f of files)if(f.endsWith(".json")){try{const w=JSON.parse(await fs.readFile(path.join(D,f),"utf8"));if(board[w.state])board[w.state].push(w)}catch{}}return board}
  
  async stats(){const b=await this.getBoard();const stats={};for(const s of STATES)stats[s]=b[s].length;stats.total=STATES.reduce((sum,s)=>sum+stats[s],0);return stats}
}
module.exports={KanbanBoard};
