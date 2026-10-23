class PR{constructor(){this.plugins=new Map();this.hooks={"tool.execute.before":[],"tool.execute.after":[],"session.start":[],"session.end":[],"context.pack.built":[],"evidence.collected":[],"verification.completed":[]}}
register(p){if(!p.name)throw new Error("name required");for(const[e,h]of Object.entries(p.hooks||{})){(this.hooks[e]=this.hooks[e]||[]).push({pluginName:p.name,handler:h})}this.plugins.set(p.name,p)}
async emit(e,...a){const h=this.hooks[e]||[];const r=[];for(const{pluginName,handler}of h)try{r.push({plugin:pluginName,result:await handler(...a)})}catch(err){r.push({plugin:pluginName,error:err.message})}return r}
list(){return Array.from(this.plugins.keys())}
stats(){return{total_plugins:this.plugins.size,total_hooks:Object.values(this.hooks).reduce((s,h)=>s+h.length,0)}}}
const registry=new PR();
module.exports={PluginRegistry:PR,registry};
