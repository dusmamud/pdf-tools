function f(r,t){return r.replace(/\{(\w+)\}/g,(n,e)=>String(t[e]??""))}export{f};
