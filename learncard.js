/* ================================================================
   学びカード（深い解説）＋ 間隔反復
   両ゲーム共通。DEEP（deep.js）に id → {imi,parts,chigai,rei,nyushi,oboe}
   ================================================================ */
"use strict";

/* 再出題の間隔（日）。step0=次のセットから出題OK、以後 1日・3日・7日後 */
const LC_INTERVALS = [0, 1, 3, 7];

/* 解説カードのHTML。full=false は正解時向けの短い版 */
function learnHTML(q, full = true) {
  const d = (typeof DEEP !== "undefined" && DEEP[q.id]) || null;
  const sec = (cls, em, ttl, body) => body
    ? `<div class="lc-sec ${cls}"><div class="lc-t">${em} ${ttl}</div><div class="lc-b">${body}</div></div>` : "";
  if (!d) return sec("hint", "💬", "ヒント", q.h || "");
  let h = sec("imi", "💡", "いみ", d.imi);
  if (full) {
    h += sec("parts", "🔎", "なりたち", d.parts);
    h += sec("chigai", "⚠️", "まちがえやすい", d.chigai);
    if (d.rei && d.rei.length) h += sec("rei", "✏️", "れいぶん", d.rei.map(r => `<div class="lc-rei">・${r}</div>`).join(""));
  }
  h += sec("nyushi", "🎯", "入試では", d.nyushi);
  if (full) h += sec("oboe", "🧠", "おぼえ方", d.oboe);
  return h;
}

/* 間隔反復。weak = { id: { miss, step, due } } */
function lcMiss(weak, id) {
  const w = weak[id] || { miss: 0, step: 0, due: 0 };
  w.miss++; w.step = 0; w.due = Date.now();
  weak[id] = w;
}
function lcHit(weak, id) {
  const w = weak[id]; if (!w) return;
  w.step = (w.step || 0) + 1;
  if (w.step >= LC_INTERVALS.length) { delete weak[id]; return; }
  w.due = Date.now() + LC_INTERVALS[w.step] * 864e5;
}
const lcDue = (weak, id) => !!weak[id] && (weak[id].due || 0) <= Date.now();
/* 復習期限が来ている問題を pool から最大 max 件 */
function lcDueList(weak, pool, max) {
  const due = pool.filter(q => lcDue(weak, q.id));
  due.sort((a, b) => (weak[a.id].due || 0) - (weak[b.id].due || 0));
  return due.slice(0, max);
}
/* 次に復習が来る日（表示用） */
function lcNextLabel(weak) {
  const n = Object.keys(weak).length; if (!n) return "";
  const due = Object.keys(weak).filter(id => lcDue(weak, id)).length;
  return due ? `${due}問 ふくしゅう待ち` : `${n}問 ためこみ中`;
}

/* 実践女子の大問二の型：書き取り5・読み4・言葉の知識2 */
const JISSEN_KAKI = ["kaki", "kaki2", "dokun", "doon"];
const JISSEN_YOMI = ["yomi", "yomi2"];
const JISSEN_CHISHIKI = ["kanyo", "shikibetsu", "bunpo", "jukugo", "taigi", "ruigi", "yoji", "yojierr", "kotowaza", "chugoku",
  "aimai", "keigo", "wago", "kokoro", "iro", "bushuimi", "yomikata", "shoryaku", "sanji", "goyo", "fukushi"];
function jissenSet(all, seen, pickFn) {
  const by = cats => all.filter(q => cats.includes(q.t));
  return [...pickFn(by(JISSEN_KAKI), 5), ...pickFn(by(JISSEN_YOMI), 4), ...pickFn(by(JISSEN_CHISHIKI), 2)];
}
