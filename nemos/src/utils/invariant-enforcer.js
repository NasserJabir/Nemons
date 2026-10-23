const fs=require("fs").promises,path=require("path"),os=require("os");
const N=process.env.NEMONS_HOME||path.join(os.homedir(),".nemons");
class InvariantEnforcer{constructor(){this.violations=[]}
async log(a){await fs.mkdir(path.join(N,"audit"),{recursive:true});let log=[];try{log=JSON.parse(await fs.readFile(path.join(N,"audit","enforcement.json"),"utf8"))}catch{};log.push({...a,timestamp:new Date().toISOString()});await fs.writeFile(path.join(N,"audit","enforcement.json"),JSON.stringify(log.slice(-5000),null,2))}
checkPersonaNoAuth(p){const forbidden=["permissions","authorized","admin","root"];const found=forbidden.filter(f=>JSON.stringify(p).toLowerCase().includes(f));return{violated:found.length>0,fields:found,invariant:"#3: Persona != Authorization"}}
checkNoFifthLayer(type){const allowed=["episodic","semantic","procedural","working"];return{violated:!allowed.includes(type),allowed,invariant:"#10: No fifth layer"}}
async checkIdentity(params){if(!params.identity_id)return{violated:true,reason:"identity_id required",invariant:"#1"};return{violated:false}}
async checkNoSilentMutation(asset,cl){if(!cl)return{violated:false,action:"warn"};const c=await cl.registerCandidate({type:asset.type||"skill",content:asset});return{violated:false,action:"route_to_candidate",candidate_id:c.candidate?.id,invariant:"#7"}}
async checkHardDeny(action,trust,env){const destructive=["delete","drop","truncate","rm"];if(destructive.includes(action.type))return{violated:true,action:"block",reason:"destructive_action",invariant:"#8"};return{violated:false}}
async enforce(params){const results={};let blocked=false;if(params.identity_id!==undefined){results.identity=await this.checkIdentity({identity_id:params.identity_id});if(results.identity.violated)blocked=true}if(params.persona){results.persona=this.checkPersonaNoAuth(params.persona);if(results.persona.violated)blocked=true}if(params.memory_type){results.memory=this.checkNoFifthLayer(params.memory_type);if(results.memory.violated)blocked=true}if(params.action){results.hard_deny=await this.checkHardDeny(params.action);if(results.hard_deny.violated)blocked=true}await this.log({operation:params.operation,blocked,results});return{allowed:!blocked,blocked,results}}
async stats(){return{invariants:10,reference:"Central Invariant Enforcer"}}}
const enforcer=new InvariantEnforcer();
module.exports={InvariantEnforcer,enforcer};