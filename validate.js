// データ検証：node validate.js
const fs=require("fs");const o={};
new Function("out", fs.readFileSync(__dirname+"/data.js","utf8")+"; out.Q=QUESTIONS;out.K=KAI;")(o);
const bad=[];const ids=new Set();const foreign=/[Ѐ-ӿ가-힯]|[A-Za-z]{3,}/;
for(const q of o.Q){
  if(ids.has(q.id))bad.push([q.id,"重複ID"]);ids.add(q.id);
  if(!q.opts||q.opts.length<2)bad.push([q.id,"選択肢不足"]);
  else{
    if(!q.opts.includes(q.a))bad.push([q.id,"正解が選択肢にない"]);
    if(new Set(q.opts).size!==q.opts.length)bad.push([q.id,"選択肢重複",JSON.stringify(q.opts)]);
  }
  if(!q.h)bad.push([q.id,"解説なし"]);
  const m=[q.q,q.a,q.h||"",...(q.opts||[])].join(" ").match(foreign);
  if(m)bad.push([q.id,"異言語混入",m[0]]);
  if(!o.K.find(k=>k.id===q.kai))bad.push([q.id,"未登録単元",q.kai]);
}
console.log("問題数:",o.Q.length,"／単元:",o.K.length,"／エラー:",bad.length);
bad.forEach(b=>console.log("  "+b.join(" | ")));
process.exit(bad.length?1:0);
