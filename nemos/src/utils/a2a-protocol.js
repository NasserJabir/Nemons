// A2A Protocol — Agent-to-Agent Communication
// Based on: Google A2A Protocol
// Agent Cards for capability discovery
const fs=require("fs").promises,path=require("path"),os=require("os");
const N=process.env.NEMONS_HOME||path.join(os.homedir(),".nemos");
const D=path.join(N,"a2a");

class A2AProtocol {
  async init(){await fs.mkdir(D,{recursive:true})}
  
  // Register an agent with its Agent Card
  async registerAgent(agentCard){await this.init();const id=agentCard.id||`agent-${Date.now().toString(36)}`;const card={id,name:agentCard.name||id,capabilities:agentCard.capabilities||[],endpoint:agentCard.endpoint||"",version:agentCard.version||"1.0.0",registered_at:new Date().toISOString()};await fs.writeFile(path.join(D,id+".json"),JSON.stringify(card,null,2));return card}
  
  // Discover agents by capability
  async discover(capability){await this.init();const files=await fs.readdir(D);const matches=[];for(const f of files)if(f.endsWith(".json")){try{const card=JSON.parse(await fs.readFile(path.join(D,f),"utf8"));if(!capability||card.capabilities?.includes(capability))matches.push(card)}catch{}}return matches}
  
  // Send task to another agent
  async sendTask(targetAgentId,task){const target=await this.getAgent(targetAgentId);if(!target)return{error:"agent not found"};return{from:"self",to:targetAgentId,task,task_id:`task-${Date.now().toString(36)}`,sent_at:new Date().toISOString(),status:"sent"}}
  
  async getAgent(id){try{return JSON.parse(await fs.readFile(path.join(D,id+".json"),"utf8"))}catch{return null}}
  
  async listAgents(){await this.init();const files=await fs.readdir(D);const agents=[];for(const f of files)if(f.endsWith(".json")){try{agents.push(JSON.parse(await fs.readFile(path.join(D,f),"utf8")))}catch{}}return agents}
  
  async stats(){const agents=await this.listAgents();return{total_agents:agents.length,capabilities:[...new Set(agents.flatMap(a=>a.capabilities||[]))]}}
}
module.exports={A2AProtocol};
