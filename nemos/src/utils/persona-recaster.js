// Persona Recasting (arXiv:2610.15788)
// Dynamically adjust persona based on social dynamics and task context
class PersonaRecaster {
  // Recast persona based on task complexity
  recast(basePersona, taskContext){
    const factors=this.analyzeContext(taskContext);
    const adjusted={...basePersona};
    
    // Adjust expertise level
    if(factors.complexity==="high")adjusted.experience="15+ years (escalated)";
    else if(factors.complexity==="low")adjusted.experience="5+ years";
    
    // Adjust focus areas
    adjusted.focus_areas=this.selectFocus(factors);
    
    // Adjust communication style
    adjusted.communication=this.adjustStyle(factors);
    
    return{original:basePersona,recast:adjusted,factors,changed:JSON.stringify(basePersona)!==JSON.stringify(adjusted)};
  }
  
  analyzeContext(ctx){
    const t=(ctx.task||"").toLowerCase();
    const u=(ctx.user_level||"mid").toLowerCase();
    return{
      complexity:this.assessComplexity(t),
      domain:this.detectDomain(t),
      user_level:u,
      urgency:ctx.urgent?"high":"normal",
    };
  }
  
  assessComplexity(t){
    if(t.length>200||t.includes("architecture")||t.includes("distributed"))return"high";
    if(t.length>50)return"medium";
    return"low";
  }
  
  detectDomain(t){
    if(t.includes("auth")||t.includes("security"))return"security";
    if(t.includes("ui")||t.includes("component"))return"frontend";
    if(t.includes("api")||t.includes("endpoint"))return"backend";
    if(t.includes("deploy")||t.includes("infra"))return"devops";
    return"general";
  }
  
  selectFocus(f){
    const focus={security:["threats","validation","secrets"],frontend:["a11y","performance","UX"],backend:["types","error-handling","tests"],devops:["health-checks","monitoring","rollback"],general:["correctness","tests","conventions"]};
    return focus[f.domain]||focus.general;
  }
  
  adjustStyle(f){
    if(f.user_level==="beginner")return"detailed with explanations";
    if(f.user_level==="expert")return"concise and technical";
    return"balanced";
  }
  
  stats(){return{reference:"arXiv:2610.15788",mechanism:"dynamic persona adjustment"}}
}
module.exports={PersonaRecaster};
