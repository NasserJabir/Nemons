// CodeVisionary — Agent-based Code Evaluation
// Based on: arXiv:2504.13472
// Evaluate LLM-generated code via agent-based framework
class CodeVisionary {
  evaluate(code, criteria) {
    const dimensions=this.getDimensions();
    const results={};
    for(const dim of dimensions){
      results[dim.name]=this.evaluateDimension(code,dim,criteria);
    }
    const overallScore=Object.values(results).reduce((s,r)=>s+r.score,0)/dimensions.length;
    return{
      overall_score:overallScore,
      dimensions:results,
      recommendation:this.getRecommendation(overallScore),
      reference:"arXiv:2504.13472",
    };
  }
  
  getDimensions(){return[
    {name:"correctness",weight:0.3,checks:["syntax_valid","logic_sound","handles_edge_cases"]},
    {name:"efficiency",weight:0.2,checks:["no_redundant_loops","uses_appropriate_data_structures","time_complexity_reasonable"]},
    {name:"readability",weight:0.2,checks:["meaningful_names","proper_indentation","has_comments"]},
    {name:"maintainability",weight:0.15,checks:["modular","follows_conventions","testable"]},
    {name:"security",weight:0.15,checks:["no_hardcoded_secrets","validates_input","uses_parameterized_queries"]},
  ]}
  
  evaluateDimension(code,dim,criteria){
    const checks={};
    for(const c of dim.checks){checks[c]=this.runCheck(code,c)}
    const passedCount=Object.values(checks).filter(v=>v).length;
    return{score:passedCount/dim.checks.length,checks,weight:dim.weight};
  }
  
  runCheck(code,checkName){const c=(code||"").toLowerCase();const checks={
    syntax_valid:!c.includes("syntax error"),
    logic_sound:!c.includes("todo")&&!c.includes("fixme"),
    handles_edge_cases:c.includes("edge")||c.includes("null")||c.includes("undefined"),
    no_redundant_loops:!c.includes("for(...for(..."),
    uses_appropriate_data_structures:c.includes("map")||c.includes("set")||c.includes("array"),
    time_complexity_reasonable:c.length<5000,
    meaningful_names:/function\s+[a-z][a-zA-Z]{5,}/.test(code||""),
    proper_indentation:(code||"").includes("  ")||(code||"").includes("\t"),
    has_comments:c.includes("//")||c.includes("/*"),
    modular:(code||"").split("function").length>1||(code||"").split("class").length>1,
    follows_conventions:!c.includes("var ")||c.includes("let ")||c.includes("const "),
    testable:c.includes("export")||c.includes("module.exports"),
    no_hardcoded_secrets:!c.includes("password=")&&!c.includes("api_key="),
    validates_input:c.includes("validate")||c.includes("check")||c.includes("assert"),
    uses_parameterized_queries:c.includes("?")||c.includes("prepare")||!c.includes("query("),
  };return checks[checkName]!==undefined?checks[checkName]:false}
  
  getRecommendation(score){if(score>=0.8)return"accept";if(score>=0.6)return"accept_with_minor_revisions";if(score>=0.4)return"major_revisions_needed";return"reject"}
  
  stats(){return{dimensions:5,reference:"arXiv:2504.13472"}}
}
module.exports={CodeVisionary};
