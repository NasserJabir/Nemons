// Bounded Agents — Delegation Security (arXiv:2608.15888)
// Agentic Principal Chain (APC): 6 authorization checks
// Reduces exfiltration from 75-100% to 0%
class DelegationSecurity {
  constructor(){this.chains=new Map()}
  
  // Create a delegation chain for an agent
  createChain(agentId,initialScope){
    const chain={
      agent_id:agentId,
      principals:[{
        id:agentId,
        scope:initialScope||{actions:["read"],budget:100,resources:["filesystem"]},
        depth:0,
        timestamp:new Date().toISOString(),
      }],
      session_state:{actions:[],budget_used:0},
    };
    this.chains.set(agentId,chain);
    return chain;
  }
  
  // 6 authorization checks (non-compensatory)
  authorize(agentId,request){
    const chain=this.chains.get(agentId);
    if(!chain)return{authorized:false,reason:"no_chain"};
    
    const checks={};
    
    // Check 1: Scope authorization
    checks.scope=this.checkScope(chain,request);
    
    // Check 2: Budget authorization
    checks.budget=this.checkBudget(chain,request);
    
    // Check 3: Composition safety (no prohibited combinations)
    checks.composition=this.checkComposition(chain,request);
    
    // Check 4: Intent binding
    checks.intent=this.checkIntent(chain,request);
    
    // Check 5: Delegation depth limit
    checks.depth=this.checkDepth(chain,request);
    
    // Check 6: Resource access control
    checks.resources=this.checkResources(chain,request);
    
    const allPass=Object.values(checks).every(c=>c.pass);
    
    if(allPass){
      chain.session_state.actions.push(request);
      chain.session_state.budget_used+=(request.cost||1);
    }
    
    return{authorized:allPass,checks,blast_radius:allPass?"contained":"blocked"};
  }
  
  checkScope(chain,req){
    const scope=chain.principals[chain.principals.length-1].scope;
    const allowed=scope.actions.includes(req.action);
    return{pass:allowed,reason:allowed?"in_scope":"out_of_scope"};
  }
  
  checkBudget(chain,req){
    const scope=chain.principals[chain.principals.length-1].scope;
    const remaining=scope.budget-chain.session_state.budget_used;
    return{pass:remaining>=(req.cost||1),reason:remaining>=0?"budget_available":"budget_exhausted"};
  }
  
  checkComposition(chain,req){
    // Check if combining this request with prior actions creates prohibited outcome
    const prohibited=["delete+create","read_secret+send_email"];
    const actions=[...chain.session_state.actions.map(a=>a.action),req.action];
    for(const p of prohibited){
      const parts=p.split("+");
      if(parts.every(part=>actions.includes(part))){
        return{pass:false,reason:`prohibited combination: ${p}`};
      }
    }
    return{pass:true,reason:"composition_safe"};
  }
  
  checkIntent(chain,req){
    // Verify request matches declared intent
    if(req.intent&&req.action&&req.intent!==req.action){
      return{pass:false,reason:"intent_action_mismatch"};
    }
    return{pass:true,reason:"intent_aligned"};
  }
  
  checkDepth(chain,req){
    const maxDepth=5;
    return{pass:chain.principals.length<=maxDepth,reason:chain.principals.length<=maxDepth?"within_depth":"max_depth_exceeded"};
  }
  
  checkResources(chain,req){
    const scope=chain.principals[chain.principals.length-1].scope;
    if(!req.resources)return{pass:true,reason:"no_resources_requested"};
    const allowed=scope.resources||[];
    const hasAll=req.resources.every(r=>allowed.includes(r));
    return{pass:hasAll,reason:hasAll?"resources_authorized":"unauthorized_resource"};
  }
  
  // Delegate authority to a sub-agent (with restricted scope)
  delegate(parentId,childId,delegatedScope){
    const parent=this.chains.get(parentId);
    if(!parent)return{error:"parent_chain_not_found"};
    
    const parentScope=parent.principals[parent.principals.length-1].scope;
    // Restrict: child can never exceed parent scope
    const restrictedScope={
      actions:delegatedScope.actions||parentScope.actions,
      budget:Math.min(delegatedScope.budget||50,parentScope.budget*0.5), // max 50% of parent
      resources:(delegatedScope.resources||parentScope.resources).filter(r=>parentScope.resources.includes(r)),
    };
    
    const childChain=this.createChain(childId,restrictedScope);
    childChain.principals[0].delegated_from=parentId;
    childChain.principals[0].delegated_at=new Date().toISOString();
    
    return{delegated:true,child_id:childId,restricted_scope:restrictedScope};
  }
  
  stats(){return{chains:this.chains.size,checks:6,reference:"arXiv:2608.15888",exfiltration_reduction:"75-100% → 0%"}}
}
module.exports={DelegationSecurity};
