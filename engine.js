/* ================================================================
   ことばクエスト — エンジン部
   設計方針：
   1) 開いたら1タップで問題（メニュー階層ゼロ）
   2) 1問=1タップ（4択）。正解は即次へ、テンポ最優先
   3) 間違いはその場で解説カード → にがてノートに自動登録（間隔反復）
   4) 累計解答数・コンボ・タイムで「大量に解いた」実感を可視化
   ================================================================ */
"use strict";

/* ---------- セーブ ---------- */
const DEF = {
  ver: 1, total: 0, correct: 0, streakBest: 0, lv: 1, xp: 0,
  weak: {},        // id -> {miss:回数, due:あと何セットで再出題}
  cleared: {},     // 回ID -> {best:正答数, n:問題数, times:[秒]}
  daily: { d: "", n: 0 },   // 今日の解答数
  medals: [], mute: false, lastPlay: "", seen: {}
};
let S;
try { S = Object.assign({}, DEF, JSON.parse(localStorage.getItem("kotobaQuest") || "{}")); }
catch (e) { S = { ...DEF }; }
S.weak = S.weak || {}; S.cleared = S.cleared || {}; S.daily = S.daily || { d: "", n: 0 }; S.seen = S.seen || {};
const save = () => localStorage.setItem("kotobaQuest", JSON.stringify(S));
const todayStr = () => new Date().toISOString().slice(0, 10);
if (S.daily.d !== todayStr()) { S.daily = { d: todayStr(), n: 0 }; }

/* ---------- 音 ---------- */
let AC = null;
function beep(freq, dur, type = "sine", vol = .14, when = 0) {
  if (S.mute) return;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, AC.currentTime + when);
    g.gain.exponentialRampToValueAtTime(.001, AC.currentTime + when + dur);
    o.connect(g); g.connect(AC.destination);
    o.start(AC.currentTime + when); o.stop(AC.currentTime + when + dur + .05);
  } catch (e) { }
}
const sfx = {
  tap: () => beep(620, .05, "square", .05),
  ok: () => { beep(740, .08); beep(988, .1, "sine", .13, .06); },
  combo: (n) => { const b = 660 + Math.min(n, 12) * 40; beep(b, .07); beep(b * 1.5, .1, "sine", .13, .05); },
  ng: () => beep(150, .28, "sawtooth", .11),
  clear: () => [523, 659, 784, 1046].forEach((f, i) => beep(f, .2, "sine", .15, i * .12)),
  lvup: () => [523, 659, 784, 880, 1046].forEach((f, i) => beep(f, .13, "triangle", .14, i * .07)),
  medal: () => [784, 988, 1175, 1568].forEach((f, i) => beep(f, .16, "triangle", .13, i * .09)),
};

/* ---------- 汎用 ---------- */
const $ = id => document.getElementById(id);
const pick = a => a[Math.floor(Math.random() * a.length)];
const shuffle = a => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[b[i], b[j]] = [b[j], b[i]]; } return b; };
const xpNeed = lv => 60 + lv * 40;
function addXp(n) {
  S.xp += n;
  while (S.xp >= xpNeed(S.lv)) { S.xp -= xpNeed(S.lv); S.lv++; sfx.lvup(); toast("🎉 レベルアップ！ Lv." + S.lv); }
}
const RANKS = [
  [0, "ことば見習い", "🐣"], [200, "ことば修行中", "📗"], [500, "ことば使い", "✒️"],
  [1000, "ことば名人", "🎓"], [2000, "ことば師範", "🏅"], [4000, "ことば博士", "👑"], [8000, "ことばの神", "🌟"]
];
const rankOf = n => RANKS.filter(r => n >= r[0]).pop();
function toast(msg) {
  const t = document.createElement("div"); t.className = "toast"; t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 1800);
}
function confetti(n = 30) {
  const ems = ["🎉", "✨", "⭐️", "🌸", "💮", "🎊"];
  for (let i = 0; i < n; i++) {
    const c = document.createElement("div"); c.className = "conf";
    c.textContent = pick(ems);
    c.style.left = Math.random() * 100 + "vw";
    c.style.animationDuration = (1.5 + Math.random() * 1.6) + "s";
    c.style.animationDelay = (Math.random() * .5) + "s";
    document.body.appendChild(c); setTimeout(() => c.remove(), 4000);
  }
}

/* ---------- 問題ユーティリティ ---------- */
// 4択の選択肢を作る（正解＋同カテゴリのダミー）
function makeOpts(q) {
  if (q.opts && q.opts.length >= 2) return shuffle(q.opts);
  const pool = QUESTIONS.filter(x => x.t === q.t && x.a !== q.a);
  const wrong = shuffle(pool).slice(0, 3).map(x => x.a);
  return shuffle([q.a, ...wrong]);
}
const catName = {
  kaki: "漢字の書き", yomi: "漢字の読み", doon: "同じ読みの漢字", dokun: "同訓異字", goku: "説明文の重要語",
  kanyo: "慣用句", taigi: "対義語", ruigi: "類義語", yoji: "四字熟語", kotowaza: "ことわざ",
  bunpo: "ことばのきまり", bungaku: "文学史", keigo: "敬語", bushu: "部首",
  giongo: "擬音語・擬態語", goyo: "ことばの誤り", jukugo: "熟語の組み立て",
  sanji: "三字熟語", gairai: "外来語", fukushi: "呼応の副詞", wago: "ことばの意味", kana: "かなづかい",
  aimai: "あいまいな文の読み分け", chugoku: "中国のことわざ", iro: "色の漢字の慣用表現", kokoro: "心・気・目の慣用表現",
  shoryaku: "省略語のもとの形", yojierr: "四字熟語の誤字訂正", kaki2: "実践女子レベルの書き取り", yomi2: "慣用的な読み",
  shikibetsu: "同じ働きの言葉", bushuimi: "部首の名前と意味", yomikata: "熟語の読み方の種類"
};
const catEm = {
  kaki: "✏️", yomi: "📖", doon: "🔍", dokun: "🖌️", goku: "🧠", kanyo: "🖐️", taigi: "⚖️", ruigi: "🤝",
  yoji: "🈲", kotowaza: "🦉", bunpo: "📐", bungaku: "📜", keigo: "🙇", bushu: "🈚",
  giongo: "💨", goyo: "⚠️", jukugo: "🧩", sanji: "3️⃣", gairai: "🌏", fukushi: "🔗",
  wago: "🌾", kana: "🖊️",
  aimai: "🔀", chugoku: "🐉", iro: "🎨", kokoro: "💓", shoryaku: "✂️", yojierr: "🔧",
  kaki2: "🏫", yomi2: "👁️", shikibetsu: "🧭", bushuimi: "🧱", yomikata: "📚"
};

/* ---------- 出題セット生成 ---------- */
// mode: "mix" | cat名 | "weak" | "kai:<回ID>"
function buildSet(mode, n = 10) {
  let pool;
  if (mode === "weak") {
    const ids = Object.keys(S.weak).filter(id => S.weak[id].miss > 0);
    pool = QUESTIONS.filter(q => ids.includes(q.id));
    if (!pool.length) pool = QUESTIONS;
  } else if (mode.startsWith("kai:")) {
    const k = mode.slice(4);
    pool = QUESTIONS.filter(q => q.kai === k);
  } else if (mode === "mix") {
    pool = QUESTIONS;
  } else {
    pool = QUESTIONS.filter(q => q.t === mode);
  }
  if (!pool.length) pool = QUESTIONS;
  // 実践女子もぎ：書き取り5・読み4・言葉の知識2 の型で出す
  if (mode === "jissen") {
    const set = jissenSet(QUESTIONS, S.seen, (p, k) => leastSeen(p, k));
    set.forEach(q => { S.seen[q.id] = (S.seen[q.id] || 0) + 1; });
    save(); return set;
  }
  // 復習期限が来た問題（翌日・3日後・7日後）を優先的に混ぜる（最大30%）
  const weakQ = lcDueList(S.weak, pool, Math.max(1, Math.round(n * 0.3)));
  const weakIds = weakQ.map(q => q.id);
  const restQ = pool.filter(q => !weakIds.includes(q.id));
  const nWeak = weakQ.length;
  // 未出題を最優先に（一巡するまで 同じ問題を出さない）
  const set = shuffle([...weakQ, ...leastSeen(restQ, n - nWeak)]);
  set.forEach(q => { S.seen[q.id] = (S.seen[q.id] || 0) + 1; });
  save();
  return set.length ? set : leastSeen(pool, n);
}
/* 出題回数の少ない問題から選ぶ */
function leastSeen(pool, n) {
  S.seen = S.seen || {};
  const bucket = {};
  pool.forEach(q => { const c = S.seen[q.id] || 0; (bucket[c] = bucket[c] || []).push(q); });
  const out = [];
  Object.keys(bucket).map(Number).sort((a, b) => a - b).forEach(c => {
    if (out.length >= n) return;
    shuffle(bucket[c]).forEach(q => { if (out.length < n) out.push(q); });
  });
  return out;
}

/* ---------- ドリル本体 ---------- */
let D = null;
function startDrill(mode, n, opt = {}) {
  const qs = buildSet(mode, n);
  D = {
    mode, qs, i: 0, ok: 0, combo: 0, best: 0, lock: false,
    t0: Date.now(), miss: [], timed: !!opt.timed, limit: opt.limit || 0, timer: null
  };
  $("drillTitle").textContent = opt.title || (mode === "weak" ? "😤 にがて集中" : mode === "mix" ? "⚔️ ミックス" : mode === "jissen" ? "🏫 実践女子もぎ" : (catEm[mode] || "📚") + " " + (catName[mode] || mode));
  if (D.timed) {
    $("dTimer").style.display = "block";
    D.timer = setInterval(() => {
      const rem = D.limit - (Date.now() - D.t0) / 1000;
      if (rem <= 0) { endDrill(); return; }
      $("dTimer").textContent = "⏱ " + rem.toFixed(1);
      $("dTimer").style.color = rem < 10 ? "#e8455f" : "";
    }, 100);
  } else $("dTimer").style.display = "none";
  show("drill");
  nextQ();
}
function nextQ() {
  const q = D.qs[D.i];
  D.qStart = Date.now();
  $("dProg").textContent = (D.i + 1) + " / " + D.qs.length;
  $("dBar").style.width = (D.i / D.qs.length * 100) + "%";
  $("dCombo").textContent = D.combo >= 2 ? "🔥" + D.combo : "";
  $("qCat").textContent = (catEm[q.t] || "") + " " + (catName[q.t] || "");
  $("qText").innerHTML = q.q;
  $("qText").className = "qtext" + (q.q.length > 22 ? " sm" : "");
  const opts = makeOpts(q);
  const box = $("opts"); box.innerHTML = "";
  opts.forEach(o => {
    const b = document.createElement("button");
    b.className = "opt" + (o.length <= 2 ? " big" : "");
    b.textContent = o;
    b.onclick = () => answer(b, o, q);
    box.appendChild(b);
  });
}
function answer(btn, chosen, q) {
  if (!D || D.lock) return;
  D.lock = true;
  const good = chosen === q.a;
  S.total++; S.daily.n++;
  if (good) {
    S.correct++; D.ok++; D.combo++; D.best = Math.max(D.best, D.combo);
    S.streakBest = Math.max(S.streakBest, D.combo);
    btn.classList.add("ok");
    D.combo >= 3 ? sfx.combo(D.combo) : sfx.ok();
    addXp(3 + Math.min(D.combo, 10));
    // にがて解消（翌日・3日後・7日後と 3回つづけて正解で卒業）
    if (S.weak[q.id]) lcHit(S.weak, q.id);
    if (D.combo > 0 && D.combo % 5 === 0) toast("🔥 " + D.combo + "れんぞく！");
    save();
    setTimeout(() => { D.lock = false; advance(); }, 260);
  } else {
    D.combo = 0; sfx.ng();
    btn.classList.add("ng");
    [...$("opts").children].forEach(b => { if (b.textContent === q.a) b.classList.add("ok"); });
    D.miss.push(q);
    lcMiss(S.weak, q.id);
    save();
    setTimeout(() => showExp(q, () => { D.lock = false; advance(); }), 480);
  }
}
function advance() {
  D.i++;
  if (D.i >= D.qs.length) endDrill(); else nextQ();
}
function showExp(q, cb) {
  $("expCat").textContent = (catEm[q.t] || "") + " " + (catName[q.t] || "");
  $("expQ").innerHTML = q.q;
  $("expA").innerHTML = "こたえ： <b>" + q.a + "</b>";
  $("expH").innerHTML = learnHTML(q, true);
  $("expH").style.display = "block";
  $("expOv").scrollTop = 0;
  $("expOv").classList.add("on");
  $("expNext").onclick = () => { sfx.tap(); $("expOv").classList.remove("on"); cb(); };
}
function endDrill() {
  if (D.timer) clearInterval(D.timer);
  const sec = Math.round((Date.now() - D.t0) / 10) / 100;
  const n = D.i > 0 ? D.i : D.qs.length;
  const rate = Math.round(D.ok / n * 100);
  addXp(20 + D.ok * 2); save();
  // 回クリア記録
  if (D.mode.startsWith("kai:")) {
    const k = D.mode.slice(4);
    const c = S.cleared[k] || { best: 0, n: 0, times: [] };
    c.best = Math.max(c.best, D.ok); c.n = n;
    c.times.push(sec); c.times.sort((a, b) => a - b); c.times = c.times.slice(0, 3);
    S.cleared[k] = c;
  }
  checkMedals();
  save();
  if (rate === 100) { sfx.clear(); confetti(50); } else sfx.clear();
  $("rTitle").textContent = rate === 100 ? "🏆 ぜんもん せいかい！" : rate >= 80 ? "✨ すごい！" : rate >= 60 ? "👍 いいちょうし！" : "💪 つぎ いこう！";
  $("rScore").textContent = D.ok + " / " + n;
  $("rSub").innerHTML =
    `せいとうりつ ${rate}%　⏱ ${sec}秒　🔥さいこう ${D.best}れんぞく<br>` +
    `<span class="rtot">きょう ${S.daily.n}問／つうさん ${S.total}問</span>`;
  const rv = $("rReview"); rv.innerHTML = "";
  if (D.miss.length) {
    const b = document.createElement("button");
    b.className = "btn ghost"; b.textContent = "📖 まちがえた" + D.miss.length + "問を もういちど";
    const missed = [...D.miss];
    b.onclick = () => { sfx.tap(); D = { mode: "review", qs: shuffle(missed), i: 0, ok: 0, combo: 0, best: 0, lock: false, t0: Date.now(), miss: [], timed: false }; $("drillTitle").textContent = "📖 まちがい直し"; show("drill"); nextQ(); };
    rv.appendChild(b);
  }
  const again = $("rAgain");
  again.textContent = "もう1セット ▶";
  const mode = D.mode === "review" ? "weak" : D.mode, nn = D.qs.length, timed = D.timed, lim = D.limit;
  again.onclick = () => { sfx.tap(); startDrill(mode === "review" ? "weak" : mode, nn, { timed, limit: lim }); };
  show("result");
}

/* ---------- メダル ---------- */
const MEDALS = [
  { id: "m10", n: 10, t: "はじめの一歩", em: "🥉" }, { id: "m50", n: 50, t: "50問とっぱ", em: "🥈" },
  { id: "m100", n: 100, t: "100問とっぱ", em: "🥇" }, { id: "m300", n: 300, t: "300問とっぱ", em: "🏅" },
  { id: "m500", n: 500, t: "500問とっぱ", em: "🎖️" }, { id: "m1000", n: 1000, t: "1000問とっぱ", em: "👑" },
  { id: "m2000", n: 2000, t: "2000問とっぱ", em: "🌟" },
];
function checkMedals() {
  MEDALS.forEach(m => {
    if (S.total >= m.n && !S.medals.includes(m.id)) {
      S.medals.push(m.id); sfx.medal(); confetti(40);
      setTimeout(() => toast(m.em + " " + m.t + " かくとく！"), 400);
    }
  });
}

/* ---------- 画面切替 ---------- */
function show(id) {
  document.querySelectorAll(".scr").forEach(s => s.classList.remove("on"));
  $("scr-" + id).classList.add("on");
  if (id === "home") renderHome();
}
