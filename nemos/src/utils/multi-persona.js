// Multi-Persona Interfaces (arXiv:2610.12878)
// Addresses 3 harms: cognitive offloading, ideological narrowing, epistemic compression
// Uses game design: magic circle, role differentiation, persona embodiment
class MultiPersona {
  constructor(){this.personas=[]}
  
  // Add a persona to the multi-persona set
  add(persona){this.personas.push({id:`p${this.personas.length}`,...persona,added:new Date().toISOString()});return this}
  
  // Generate competing perspectives on a problem
  generatePerspectives(problem){
    const roles=this.getRoleSet(problem);
    return roles.map((r,i)=>({
      persona_id:`p${i}`,
      role:r.role,
      perspective:`${r.role} view: ${this.generateView(problem,r)}`,
      bias_check:r.bias,
    }));
  }
  
  // Role differentiation (from game design: tank, healer, mage pattern)
  getRoleSet(problem){
    const p=(problem||"").toLowerCase();
    if(p.includes("security")||p.includes("auth"))
      return[
        {role:"Security Engineer",bias:"risk-averse",focus:"threats"},
        {role:"DevOps Engineer",bias:"efficiency-focused",focus:"deploy"},
        {role:"QA Engineer",bias:"completeness-focused",focus:"tests"},
        {role:"Product Manager",bias:"user-focused",focus:"UX"},
      ];
    if(p.includes("refactor"))
      return[
        {role:"Architect",bias:"structure-focused",focus:"design"},
        {role:"Maintainer",bias:"readability-focused",focus:"clarity"},
        {role:"Performance Engineer",bias:"speed-focused",focus:"optimization"},
      ];
    return[
      {role:"Senior Engineer",bias:"correctness-focused",focus:"implementation"},
      {role:"QA Engineer",bias:"test-focused",focus:"edge cases"},
      {role:"DevOps Engineer",bias:"deploy-focused",focus:"CI/CD"},
    ];
  }
  
  generateView(problem,role){
    const views={
      "Security Engineer":`Assess security implications: input validation, secrets, least privilege`,
      "DevOps Engineer":`Consider deployment: health checks, monitoring, rollback plan`,
      "QA Engineer":`Write tests first: edge cases, error paths, integration tests`,
      "Product Manager":`Focus on user value: what problem does this solve?`,
      "Architect":`Design before code: interfaces, contracts, separation of concerns`,
      "Maintainer":`Optimize for readability: naming, structure, documentation`,
      "Performance Engineer":`Profile and optimize: time/space complexity, caching`,
      "Senior Engineer":`Implement correctly: types, error handling, conventions`,
    };
    return views[role.role]||"Consider this problem from multiple angles";
  }
  
  // Magic circle: create safe boundary for disagreement
  createMagicCircle(){
    return{boundary:"multi-persona-magic-circle",rules:["All perspectives are valid","Disagreement is productive","No single answer is authoritative","Evaluate before deciding"]};
  }
  
  // Evaluate which perspective to prioritize
  evaluate(perspectives,criteria){
    return perspectives.map(p=>({...p,score:this.score(p,criteria)})).sort((a,b)=>b.score-a.score);
  }
  
  score(p,c){let s=0.5;if(c){if(c.priority===p.focus)s+=0.3;if(c.bias===p.bias)s+=0.2}return s}
  
  stats(){return{total_personas:this.personas.length,reference:"arXiv:2610.12878",principle:"multi-persona addresses 3 harms"}}
}
module.exports={MultiPersona};
