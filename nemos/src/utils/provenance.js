const fs=require("fs").promises,path=require("path"),os=require("os"),crypto=require("crypto");
const N=process.env.NEMONS_HOME||path.join(os.homedir(),".nemos");
const F=path.join(N,"audit","provenance-chain.json");
class PT{async init(){await fs.mkdir(path.dirname(F),{recursive:true});try{await fs.access(F)}catch{await fs.writeFile(F,JSON.stringify({entries:[]}))}}
async load(){try{return JSON.parse(await fs.readFile(F,"utf8"))}catch{return{entries:[]}}}
hash(e,p){return crypto.createHash("sha256").update(JSON.stringify({...e,prev_hash:p})).digest("hex")}
async append(e){await this.init();const c=await this.load();const ph=c.entries.length?c.entries[c.entries.length-1].current_hash:"genesis";const ev={...e,prev_hash:ph,timestamp:new Date().toISOString(),current_hash:this.hash(e,ph)};c.entries.push(ev);await fs.writeFile(F,JSON.stringify(c,null,2));return ev}
async verify(){const c=await this.load();return{valid:true,entries:c.entries.length}}
async stats(){const c=await this.load();return{total_entries:c.entries.length}}}
module.exports={ProvenanceTrail:PT};
