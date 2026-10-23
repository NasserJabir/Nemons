// Hierarchical Chain-of-Thought
// Based on: arXiv:2604.00130
// Multi-level reasoning instead of linear chain
class HierarchicalCoT {
  reason(problem, depth) {
    depth=depth||3;
    const tree=this.buildTree(problem,depth);
    return{
      problem,
      tree,
      levels:depth,
      nodes:this.countNodes(tree),
    };
  }
  
  buildTree(problem,depth,level){if(level===0)return{leaf:true,problem};const sub=this.decompose(problem);return{problem,level:depth-level,children:sub.map(s=>this.buildTree(s,depth-1,level))}}
  
  decompose(problem){const p=(problem||"").toLowerCase();const parts=[];if(p.includes("and")){const split=problem.split(/\s+and\s+/i);for(const s of split)parts.push(s.trim())}if(parts.length===0){parts.push("analyze requirements","design solution","implement code","verify correctness")}return parts.slice(0,4)}
  
  countNodes(tree){if(!tree)return 0;if(tree.leaf)return 1;let count=1;for(const c of(tree.children||[]))count+=this.countNodes(c);return count}
  
  // Trace: get reasoning path from root to a leaf
  trace(tree, targetLeaf) {
    const path=[];
    const find=(node,target)=>{
      path.push(node.problem||"");
      if(node.leaf&&path.length>=2)return true;
      for(const c of(node.children||[])){if(find(c,target))return true}
      path.pop();
      return false;
    };
    find(tree,targetLeaf);
    return path;
  }
  
  stats(){return{type:"hierarchical",default_depth:3,reference:"arXiv:2604.00130"}}
}
module.exports={HierarchicalCoT};
