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
// 学びカード（deep.js）の網羅チェック
try{
  const d={};new Function("out",fs.readFileSync(__dirname+"/deep.js","utf8")+"; out.D=DEEP;")(d);
  const KEYS=["imi","parts","chigai","rei","nyushi","oboe"];let nd=0;
  for(const q of o.Q){const e=d.D[q.id];if(!e){bad.push([q.id,"深い解説なし"]);continue;}
    for(const k of KEYS)if(!e[k]||(Array.isArray(e[k])&&!e[k].length))bad.push([q.id,"解説の欠落",k]);
    const all=[e.imi,e.parts,e.chigai,e.nyushi,e.oboe,...(e.rei||[])].join(" ");
    if(/[—–―]/.test(all))bad.push([q.id,"ダッシュ記号"]);
    const m=all.match(foreign);if(m&&q.t!=="gairai")bad.push([q.id,"解説に異言語",m[0]]);nd++;}
  console.log("深い解説:",nd,"件");
}catch(e){console.log("deep.js なし/読込失敗:",e.message);}
console.log("問題数:",o.Q.length,"／単元:",o.K.length,"／エラー:",bad.length);
bad.forEach(b=>console.log("  "+b.join(" | ")));
process.exit(bad.length?1:0);
