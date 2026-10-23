// Ensemble Code Generation
// Based on: arXiv:2503.15838
// Generate multiple candidates, select best
class EnsembleGenerator {
  // Generate N candidates
  async generate(prompt, count) {
    count=count||3;
    const candidates=[];
    for(let i=0;i<count;i++){
      candidates.push({
        id:`cand-${i}`,
        prompt,
        // Different "temperatures" / strategies
        strategy:this.getStrategy(i),
        code:this.generateCandidate(prompt,i),
        score:0,
      });
    }
    return candidates;
  }
  
  getStrategy(idx){const strategies=["direct","step_by_step","test_first"];return strategies[idx%strategies.length]}
  
  generateCandidate(prompt,idx){const p=(prompt||"").toLowerCase();if(p.includes("function"))return`// Strategy: ${this.getStrategy(idx)}\nfunction solution() { /* implementation */ }`;if(p.includes("class"))return`// Strategy: ${this.getStrategy(idx)}\nclass Solution { /* implementation */ }`;return`// Strategy: ${this.getStrategy(idx)}\n// solution code`}
  
  // Score each candidate
  score(candidates, criteria) {
    for(const c of candidates){
      let score=0;
      const code=(c.code||"").toLowerCase();
      // Score by criteria
      if(criteria?.tests_pass!==false)score+=0.3;
      if(code.includes("function")||code.includes("class"))score+=0.2;
      if(code.includes("test")||code.includes("spec"))score+=0.2;
      if(code.length>50)score+=0.15;
      if(code.length<500)score+=0.15;
      c.score=Math.min(1,score);
    }
    return candidates;
  }
  
  // Select best candidate
  select(candidates, scored) {
    if(scored)candidates=this.score(candidates,{});
    return candidates.sort((a,b)=>b.score-a.score)[0];
  }
  
  // Full ensemble pipeline
  async run(prompt, options) {
    const opts=options||{};
    const count=opts.count||3;
    const candidates=await this.generate(prompt,count);
    const scored=this.score(candidates,opts.criteria);
    const best=this.select(scored);
    return{
      prompt:prompt.slice(0,100),
      candidates_generated:count,
      best_candidate:{
        id:best.id,
        strategy:best.strategy,
        score:best.score,
        code:best.code,
      },
      all_scores:scored.map(c=>({id:c.id,score:c.score,strategy:c.strategy})),
    };
  }
  
  stats(){return{strategies:["direct","step_by_step","test_first"],reference:"arXiv:2503.15838"}}
}
module.exports={EnsembleGenerator};
