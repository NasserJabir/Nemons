function computeRoutingScore(e,l){l=l||{l1:0.3,l2:0.4,l3:0.1,l4:0.2};return{total:l.l1*(1-(e.no_syntax_errors!==false?1:0))+l.l2*(1-(e.no_security_violations!==false?1:0))+l.l3*Math.max(0,(e.cost||0)-Infinity)+l.l4*(1-(e.deploy_success!==false?1:0))}}
function extract(e,v){if(!v||!v.layers)return null;const f=[];if(v.layers.constraints&&!v.layers.constraints.pass){for(const r of(v.layers.constraints.results||[]))if(!r.pass)f.push({layer:"constraints",check:r.name,severity:r.severity})}if(v.layers.grounding&&!v.layers.grounding.pass)f.push({layer:"grounding"});return{failures:f,count:f.length}}
function mapToPatch(c){if(!c||!c.failures.length)return null;return{primary:c.failures[0],total:c.failures.length}}
module.exports={computeRoutingScore,extractCounterexample:extract,mapToPatch};
