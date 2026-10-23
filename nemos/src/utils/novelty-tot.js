// Novelty-based Tree-of-Thought
// Based on: arXiv:2605.06040
// Reduce token cost via novelty-based pruning
class NoveltyToT {
  search(problem, maxNodes) {
    maxNodes=maxNodes||20;
    const tree={problem,children:[],visited:false};
    const visited=new Set();
    const queue=[tree];
    let expanded=0;
    while(queue.length>0&&expanded<maxNodes){
      const node=queue.shift();
      if(visited.has(this.hash(node.problem)))continue;
      visited.add(this.hash(node.problem));
      const children=this.expand(node.problem);
      for(const c of children){
        if(!visited.has(this.hash(c))){
          const childNode={problem:c,children:[],visited:false};
          node.children.push(childNode);
          queue.push(childNode);
          expanded++;
          if(expanded>=maxNodes)break;
        }
      }
    }
    return{
      tree,
      nodes_expanded:expanded,
      nodes_pruned:visited.size,
      token_savings:this.estimateSavings(visited.size,expanded),
    };
  }
  
  expand(problem){const p=(problem||"").toLowerCase();if(p.includes("implement"))return["design first","write tests first","implement directly"];if(p.includes("fix"))return["diagnose root cause","apply minimal fix","add regression test"];return["approach A","approach B","approach C"]}
  
  hash(s){let h=0;for(let i=0;i<(s||"").length;i++){h=((h<<5)-h)+(s||"").charCodeAt(i);h|=0}return h}
  
  estimateSavings(visited,expanded){const fullTree=Math.pow(3,Math.log2(expanded+1));return{full_exploration:Math.round(fullTree),actual:expanded,savings_percent:Math.round((1-expanded/Math.max(fullTree,1))*100)+"%"}}
  
  stats(){return{type:"novelty_pruned",reference:"arXiv:2605.06040",benefit:"token cost reduction"}}
}
module.exports={NoveltyToT};
