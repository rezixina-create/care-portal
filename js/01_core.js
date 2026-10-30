/**
 * 介護施設 統合業務ポータルシステム (Care Portal)
 * 【施設内Wi-Fiクラウド共有 ＆ スタンドアロン両対応版】
 * ・サーバー稼働時: 親機PCに全データが一元保存され、タブレット等の他端末とリアルタイム共有
 * ・単体起動時: ブラウザのlocalStorageで永久保存
 * ・サーバー稼働時は、端末(ブラウザ)に全データの控えを残さない (共用端末の個人情報対策)
 */

// HTMLエスケープヘルパー (XSS防止・表示崩れ防止)
function escapeHtml(str) {
 if (str === null || str === undefined) return "";
 return String(str)
 .replace(/&/g, "&amp;")
 .replace(/</g, "&lt;")
 .replace(/>/g, "&gt;")
 .replace(/"/g, "&quot;")
 .replace(/'/g, "&#039;");
}

// 役職序列判定（偉い人順: 施設長・管理者 → リーダー・相談員 → 看護師 → 介護職員 → 事務員）
function getStaffRoleRank(role, name) {
 const text = `${role || ""} ${name || ""}`.toLowerCase();
 if (text.includes("施設長") || text.includes("管理者") || text.includes("所長") || text.includes("ホーム長") || text.includes("院長") || text.includes("理事")) return 1;
 if (text.includes("副施設長") || text.includes("副管理者") || text.includes("事務長")) return 2;
 if (text.includes("相談員") || text.includes("ケアマネ") || text.includes("サービス提供") || text.includes("サ責")) return 3;
 if (text.includes("看護師長") || text.includes("主任看護") || text.includes("看護リーダー")) return 4;
 if (text.includes("看護")) return 5;
 if (text.includes("リーダー") || text.includes("主任") || text.includes("チーフ")) return 6;
 if (text.includes("機能訓練") || text.includes("理学療法") || text.includes("作業療法")) return 7;
 if (text.includes("介護") || text.includes("ケア") || text.includes("ヘルパー")) return 8;
 if (text.includes("事務")) return 9;
 return 10;
}

function sortStaffList(list) {
 if (!Array.isArray(list)) return [];
 return list.sort((a, b) => {
 const rankA = getStaffRoleRank(a.role, a.name);
 const rankB = getStaffRoleRank(b.role, b.name);
 if (rankA !== rankB) return rankA - rankB;
 return (a.name || "").localeCompare(b.name || "", "ja");
 });
}

// 夜間巡視・体位変換 自動生成定型文の標準初期値 (施設・現場ごとのカスタマイズ対応)
// [Claude修正] チェックを付けるだけで、確かめていない観察（呼吸状態安定・異常なし・発赤悪化なし・排尿あり・前の体位など）が
// 公式記録に書き込まれていた。標準の文は「行ったこと」だけにする。観察したことは職員が書き足す。
const DEFAULT_NIGHT_TURN_TEMPLATES = {
 "安眠中": "【{time} 定時巡視】訪室確認。安眠中。",
 "左側臥位": "【{time} 定時巡視・体位変換】訪室確認。左側臥位へ体位変換実施。",
 "右側臥位": "【{time} 定時巡視・体位変換】訪室確認。右側臥位へ体位変換実施。",
 "仰臥位": "【{time} 定時巡視・体位変換】訪室確認。仰臥位へ体位変換実施。",
 "おむつ交換": "【{time} 定時巡視・おむつ交換】訪室確認。おむつ交換実施。"
};
// 以前の標準の文（施設が書き換えていなければ、新しい標準の文に置き換える）
const CP_OLD_NIGHT_TURN_TEMPLATES = {
 "安眠中": "【{time} 定時巡視】訪室確認。静かに安眠中、呼吸状態安定。掛物の乱れを整え、ナースコールを手元に確認。異常なし。",
 "左側臥位": "【{time} 定時巡視・体位変換】訪室確認。仰臥位から左側臥位へ体位変換実施。仙骨部除圧クッションを背部・膝間に挿入。良肢位保持、寝具を整える。",
 "右側臥位": "【{time} 定時巡視・体位変換】訪室確認。左側臥位から右側臥位へ体位変換実施。除圧クッション配置し安楽な姿勢を保持。呼吸落ち着き安眠継続。",
 "仰臥位": "【{time} 定時巡視・体位変換】訪室確認。側臥位から仰臥位へ体位変換実施。背部・仙骨部の皮膚状態確認（発赤悪化なし）。膝下クッション配置。",
 "おむつ交換": "【{time} 定時巡視・おむつ交換】訪室確認。おむつ汚染（排尿あり）確認しパッド交換実施。陰部清拭、皮膚保護処置。寝具交換なし、安眠。"
};

// ======================================================================
// [Claude修正] サーバー側ログイン (セッション) の共通処理
// ログインに成功するとサーバーが発行する鍵 (トークン) をこのタブに保持し、
// データの取得・保存などの通信に付けて送る。鍵が無い・期限切れの場合、サーバーはデータを渡さない。
// ======================================================================
function cpGetToken() {
 try { return sessionStorage.getItem("carePortalToken") || ""; } catch (e) { return ""; }
}

function cpSetToken(token) {
 try {
 if (token) sessionStorage.setItem("carePortalToken", token);
 else sessionStorage.removeItem("carePortalToken");
 } catch (e) {}
}

async function cpApiFetch(url, options) {
 const opts = Object.assign({}, options || {});
 opts.headers = Object.assign({}, opts.headers || {}, { "X-Session-Token": cpGetToken() });
 opts.credentials = "same-origin";
 const res = await fetch(url, opts);
 if (res.status === 401 && typeof handleSessionExpired === "function") {
 handleSessionExpired();
 }
 return res;
}

// [Claude修正] 暗証番号はサーバーの中だけで管理する (端末に届くデータでは伏せ字)。
// 初期番号のままかどうかは is_initial_pin で判断する
// [Claude修正] 接続案内のQRコードを端末内で作成する (外部サービス api.qrserver.com へURLを送らない)。
// 方式: QRコード (JIS X 0510) バイトモード・誤り訂正レベルM・型番1〜10 (英数字で最大約200文字まで)
const CP_QR_EC_M = [null,
 [10, 1, 16, 0, 0], [16, 1, 28, 0, 0], [26, 1, 44, 0, 0], [18, 2, 32, 0, 0], [24, 2, 43, 0, 0],
 [16, 4, 27, 0, 0], [18, 4, 31, 0, 0], [22, 2, 38, 2, 39], [22, 3, 36, 2, 37], [26, 4, 43, 1, 44]];
const CP_QR_ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

function cpQrGfMul(x, y) {
 let z = 0;
 for (let i = 7; i >= 0; i--) {
 z = (z << 1) ^ ((z >>> 7) * 0x11D);
 z ^= ((y >>> i) & 1) * x;
 }
 return z & 0xFF;
}

function cpQrRsDivisor(degree) {
 const r = new Array(degree).fill(0);
 r[degree - 1] = 1;
 let root = 1;
 for (let i = 0; i < degree; i++) {
 for (let j = 0; j < r.length; j++) {
 r[j] = cpQrGfMul(r[j], root);
 if (j + 1 < r.length) r[j] ^= r[j + 1];
 }
 root = cpQrGfMul(root, 0x02);
 }
 return r;
}

function cpQrRsRemainder(data, divisor) {
 const r = new Array(divisor.length).fill(0);
 data.forEach(b => {
 const f = b ^ r.shift();
 r.push(0);
 divisor.forEach((d, i) => { r[i] ^= cpQrGfMul(d, f); });
 });
 return r;
}

// QRコードの白黒パターン (true=黒) の2次元配列を返す。入りきらない場合は null
function cpQrMatrix(text) {
 const bytes = Array.from(new TextEncoder().encode(String(text)));
 let ver = 0;
 for (let v = 1; v <= 10; v++) {
 const t = CP_QR_EC_M[v];
 const cap = t[1] * t[2] + t[3] * t[4];
 const bits = 4 + (v < 10 ? 8 : 16) + bytes.length * 8;
 if (bits <= cap * 8) { ver = v; break; }
 }
 if (!ver) return null;
 const [ecLen, n1, d1, n2, d2] = CP_QR_EC_M[ver];
 const dataCap = n1 * d1 + n2 * d2;

 // データ部
 const bb = [];
 const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bb.push((val >>> i) & 1); };
 put(4, 4);
 put(bytes.length, ver < 10 ? 8 : 16);
 bytes.forEach(b => put(b, 8));
 put(0, Math.min(4, dataCap * 8 - bb.length));
 while (bb.length % 8) bb.push(0);
 const data = [];
 for (let i = 0; i < bb.length; i += 8) data.push(parseInt(bb.slice(i, i + 8).join(""), 2));
 for (let pad = 0xEC; data.length < dataCap; pad ^= 0xEC ^ 0x11) data.push(pad);

 // 誤り訂正 (ブロック分割・交互配置)
 const div = cpQrRsDivisor(ecLen);
 const blocks = [];
 let k = 0;
 for (let i = 0; i < n1 + n2; i++) {
 const len = i < n1 ? d1 : d2;
 const dat = data.slice(k, k + len);
 k += len;
 blocks.push({ dat, ecc: cpQrRsRemainder(dat, div) });
 }
 const cw = [];
 const maxD = Math.max(d1, d2);
 for (let i = 0; i < maxD; i++) blocks.forEach(b => { if (i < b.dat.length) cw.push(b.dat[i]); });
 for (let i = 0; i < ecLen; i++) blocks.forEach(b => cw.push(b.ecc[i]));

 // 機能パターン
 const size = ver * 4 + 17;
 const mod = [], fn = [];
 for (let y = 0; y < size; y++) { mod.push(new Array(size).fill(false)); fn.push(new Array(size).fill(false)); }
 const setF = (x, y, dark) => { mod[y][x] = dark; fn[y][x] = true; };
 for (let i = 0; i < size; i++) { setF(6, i, i % 2 === 0); setF(i, 6, i % 2 === 0); }
 [[3, 3], [size - 4, 3], [3, size - 4]].forEach(([cx, cy]) => {
 for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
 const x = cx + dx, y = cy + dy;
 if (x < 0 || y < 0 || x >= size || y >= size) continue;
 const dist = Math.max(Math.abs(dx), Math.abs(dy));
 setF(x, y, dist !== 2 && dist !== 4);
 }
 });
 const al = CP_QR_ALIGN[ver];
 const last = al.length - 1;
 for (let i = 0; i < al.length; i++) for (let j = 0; j < al.length; j++) {
 if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
 for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
 setF(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
 }
 }
 const drawFormat = (mask) => {
 const d = (0 << 3) | mask; // 誤り訂正レベルM = 0
 let rem = d;
 for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
 const bits = ((d << 10) | rem) ^ 0x5412;
 const g = (i) => ((bits >>> i) & 1) !== 0;
 for (let i = 0; i <= 5; i++) setF(8, i, g(i));
 setF(8, 7, g(6)); setF(8, 8, g(7)); setF(7, 8, g(8));
 for (let i = 9; i < 15; i++) setF(14 - i, 8, g(i));
 for (let i = 0; i < 8; i++) setF(size - 1 - i, 8, g(i));
 for (let i = 8; i < 15; i++) setF(8, size - 15 + i, g(i));
 setF(8, size - 8, true);
 };
 drawFormat(0);
 if (ver >= 7) {
 let rem = ver;
 for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
 const bits = (ver << 12) | rem;
 for (let i = 0; i < 18; i++) {
 const dark = ((bits >>> i) & 1) !== 0;
 const a = size - 11 + (i % 3), b = Math.floor(i / 3);
 setF(a, b, dark); setF(b, a, dark);
 }
 }

 // データ配置 (右下からジグザグ)
 let bi = 0;
 for (let right = size - 1; right >= 1; right -= 2) {
 if (right === 6) right = 5;
 for (let vert = 0; vert < size; vert++) {
 for (let j = 0; j < 2; j++) {
 const x = right - j;
 const upward = ((right + 1) & 2) === 0;
 const y = upward ? size - 1 - vert : vert;
 if (!fn[y][x] && bi < cw.length * 8) {
 mod[y][x] = ((cw[bi >>> 3] >>> (7 - (bi & 7))) & 1) !== 0;
 bi++;
 }
 }
 }
 }

 // マスク (8種類から読み取りやすいものを選ぶ)
 const maskFn = [
 (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x, y) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
 (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => (x * y) % 2 + (x * y) % 3 === 0,
 (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0, (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0];
 const applyMask = (m) => {
 for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
 if (!fn[y][x] && maskFn[m](x, y)) mod[y][x] = !mod[y][x];
 }
 };
 const penalty = () => {
 let p = 0, dark = 0;
 for (let a = 0; a < 2; a++) {
 for (let i = 0; i < size; i++) {
 let run = 1;
 for (let j = 1; j <= size; j++) {
 const cur = j < size ? (a ? mod[j][i] : mod[i][j]) : null;
 const prev = a ? mod[j - 1][i] : mod[i][j - 1];
 if (cur === prev) run++;
 else { if (run >= 5) p += run - 2; run = 1; }
 }
 }
 }
 for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
 if (mod[y][x]) dark++;
 if (x < size - 1 && y < size - 1) {
 const c = mod[y][x];
 if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) p += 3;
 }
 }
 p += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
 return p;
 };
 let best = 0, bestP = Infinity;
 for (let m = 0; m < 8; m++) {
 applyMask(m); drawFormat(m);
 const p = penalty();
 if (p < bestP) { bestP = p; best = m; }
 applyMask(m);
 }
 applyMask(best); drawFormat(best);
 return mod;
}

// QRコードをSVG文字列で返す (周囲に4マスの余白)。作れない場合は空文字
function cpQrSvg(text, px) {
 const m = cpQrMatrix(text);
 if (!m) return "";
 const n = m.length, q = 4, total = n + q * 2;
 let d = "";
 for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
 if (m[y][x]) d += `M${x + q},${y + q}h1v1h-1z`;
 }
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${px}" height="${px}" shape-rendering="crispEdges" role="img" aria-label="接続用QRコード"><rect width="${total}" height="${total}" fill="#ffffff"/><path d="${d}" fill="#000000"/></svg>`;
}

// [Claude修正] 期限日までの日数 (端末の日付で計算。当日=0、過ぎたら負)
// new Date("YYYY-MM-DD") は世界標準時の0時(日本の朝9時)扱いのため、日数が1日ずれていた
function cpDaysUntil(dateStr) {
 const m = String(dateStr || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
 if (!m) return null;
 const t = new Date();
 const today = new Date(t.getFullYear(), t.getMonth(), t.getDate());
 const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
 return Math.round((d - today) / 86400000);
}

// [Claude修正] 記録台帳 (予防接種・消防訓練・レクリエーション) は削除せず「取消」にする。
// 取消した記録はデータに残し、一覧では取消線・取消理由・取消者を表示する。誤って取消した場合は「取消を戻す」で元に戻せる
const CP_LEDGERS = {
 vaccines: { label: "予防接種記録", render: () => renderOfficeVaccines() },
 fire_drills: { label: "消防・避難訓練記録", render: () => renderOfficeFireDrills() },
 recreations: { label: "レクリエーション記録", render: () => renderRecreationTable() },
 incidents: { label: "事故・ヒヤリハット報告書", render: () => renderOfficeIncidents() },
 // [Claude修正] 委員会・研修は管理者・事務員だけ。共通の取消・取消を戻すを直接呼んでも止める
 committees: { label: "委員会・研修記録", render: () => renderOfficeCommittees(), can: () => (typeof isCurrentStaffAdminOrClerk === "function" && isCurrentStaffAdminOrClerk()), who: "管理者または事務員" }
};

function cpLedgerStaff() {
 return (document.getElementById("currentStaff")?.value) || gState.currentStaff || "担当職員";
}

function cpVoidLedgerRecord(key, id) {
 const conf = CP_LEDGERS[key];
 const rec = (db.data[key] || []).find(x => Number(x.id) === Number(id));
 if (!conf || !rec || rec.voided) return;
 if (conf.can && !conf.can()) { alert(`${conf.label}の取消は${conf.who}のみ可能です。`); return; }
 const reason = prompt(`この${conf.label}を「取消」にします。\n記録は消えずに、取消済みとして残ります。\n\n取消の理由を入力してください (例: 重複登録、利用者の選択間違い)`, "");
 if (reason === null) return;
 if (!reason.trim()) { alert("取消の理由を入力してください。取消は行っていません。"); return; }
 rec.voided = true;
 rec.voided_at = toLocalDateTimeStr(new Date());
 rec.voided_by = cpLedgerStaff();
 rec.void_reason = reason.trim();
 db.save();
 conf.render();
 alert(`${conf.label}を取消にしました。`);
}

function cpRestoreLedgerRecord(key, id) {
 const conf = CP_LEDGERS[key];
 const rec = (db.data[key] || []).find(x => Number(x.id) === Number(id));
 if (!conf || !rec || !rec.voided) return;
 if (conf.can && !conf.can()) { alert(`${conf.label}の取消を戻すのは${conf.who}のみ可能です。`); return; }
 if (!confirm(`この${conf.label}の取消を戻し、有効な記録に戻しますか？\n(取消理由: ${rec.void_reason || '-'})`)) return;
 rec.voided = false;
 rec.restored_at = toLocalDateTimeStr(new Date());
 rec.restored_by = cpLedgerStaff();
 db.save();
 conf.render();
}

// 操作欄: 有効な記録は「訂正」「取消」、取消済みは取消情報と「取消を戻す」
function cpLedgerActions(key, rec, editFn) {
 if (rec.voided) {
  return `<div style="font-size:11px; color:#991b1b; font-weight:bold;">取消済</div>
   <div style="font-size:10.5px; color:#5f6d66; white-space:normal; max-width:180px;">${escapeHtml(rec.voided_at || '')} ${escapeHtml(rec.voided_by || '')}<br>理由: ${escapeHtml(rec.void_reason || '-')}</div>
   <button type="button" class="btn btn-secondary" style="font-size:11px; padding:2px 7px; margin-top:3px;" onclick="cpRestoreLedgerRecord('${key}', ${Number(rec.id)})">取消を戻す</button>`;
 }
 return `<button type="button" class="btn btn-secondary" style="font-size:11px; padding:2px 7px;" onclick="${editFn}(${Number(rec.id)})">訂正</button>
  <button type="button" class="btn btn-secondary" style="font-size:11px; padding:2px 7px; margin-left:3px; color:#991b1b; border-color:#fca5a5;" onclick="cpVoidLedgerRecord('${key}', ${Number(rec.id)})">取消</button>`;
}

// 取消済みの行は薄く表示し、内容に取消線を引く (操作欄は除く)
function cpMarkVoidedRow(tr) {
 tr.style.background = "#f6f8f6";
 tr.style.color = "#94a19a";
 const cells = tr.querySelectorAll("td");
 cells.forEach((td, i) => { if (i < cells.length - 1) td.style.textDecoration = "line-through"; });
 tr.querySelectorAll("td:not(:last-child) *").forEach(el => { el.style.color = "#94a19a"; el.style.background = "transparent"; el.style.textDecoration = "line-through"; });
}

// 有効な記録を先に、取消済みを後ろに並べる (元の並び順は保つ)
function cpLedgerOrder(list) {
 return list.filter(x => !x.voided).concat(list.filter(x => x.voided));
}

function cpIsInitialPin(s) {
 if (!s || typeof s !== "object") return false;
 if (db && db.isServerMode) return s.is_initial_pin !== false;
 return (s.pin || "0000") === "0000" || s.is_initial_pin !== false;
}

async function cpPostJson(url, obj) {
 const res = await cpApiFetch(url, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(obj)
 });
 let info = {};
 try { info = await res.json(); } catch (e) {}
 return { status: res.status, ok: res.ok, info: info };
}

let cpSessionExpiredShown = false;
function handleSessionExpired() {
 if (!gState || !gState.session || cpSessionExpiredShown) return;
 cpSessionExpiredShown = true;
 // [Claude修正] 先に画面を閉じてから知らせる (handleLogout がお知らせを出す)
 handleLogout({ reason: "expired" });
 setTimeout(() => { cpSessionExpiredShown = false; }, 3000);
}

// ======================================================================
// [Claude修正] 3者比較による合流 (マージ)
// local = この端末のデータ, base = 前回サーバーと同期した時点のデータ, server = サーバーの最新
// ・片方だけが変えた部分は、変えた側を採用
// ・ID付きの記録の配列は1件ずつ合流 (両端末で追加した記録はどちらも残す)
// ・同じ記録を両端末で別々に編集した場合は、この端末の内容を採用
// ・一方が削除し、もう一方が編集した記録は、記録を残す (消失を防ぐ)
// ======================================================================
function cpSame(a, b) {
 return cpJEq(a, b);
}

// [Claude修正 2026-10-18] 「JSON にしたとき同じ中身か」を、文字にせずに比べる
// （以前は比べるたびに JSON の文字にしていて、記録が1年分あると保存1件に数秒かかっていた）
// JSON と同じく、undefined・関数の項目は無いものとして扱い、NaN・Infinity は null と同じとする（項目の順番は問わない）
function cpJNorm(v) {
 if (v === undefined || typeof v === "function" || typeof v === "symbol") return undefined;
 if (typeof v === "number" && !isFinite(v)) return null;
 return v;
}
function cpJEq(a, b) {
 if (a === b) return true;
 // ふつうの場合（undefined の項目がない記録どうし）を先に速く比べる。合わなければ下の正確な比べ方で確かめる
 if (a !== null && b !== null && typeof a === "object" && typeof b === "object") {
  if (Array.isArray(a)) {
   if (Array.isArray(b) && a.length === b.length) {
    let ok = true;
    for (let i = 0; i < a.length; i++) { const x = a[i], y = b[i]; if (x !== y && !cpJEq(x, y)) { ok = false; break; } }
    if (ok) return true;
   }
  } else if (!Array.isArray(b) && typeof a.toJSON !== "function" && typeof b.toJSON !== "function") {
   const ka = Object.keys(a);
   if (ka.length === Object.keys(b).length) {
    let ok = true;
    for (let i = 0; i < ka.length; i++) {
     const k = ka[i], x = a[k], y = b[k];
     if (x === y && (y !== undefined || Object.prototype.hasOwnProperty.call(b, k))) continue;
     if (!Object.prototype.hasOwnProperty.call(b, k) || !cpJEq(x, y)) { ok = false; break; }
    }
    if (ok) return true;
   }
  }
 }
 return cpJEqSlow(a, b);
}
function cpJEqSlow(a, b) {
 if (a === b) return true;
 a = cpJNorm(a); b = cpJNorm(b);
 if (a === b) return true;
 if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
 if (typeof a.toJSON === "function" || typeof b.toJSON === "function") return JSON.stringify(a) === JSON.stringify(b);
 const aa = Array.isArray(a), ba = Array.isArray(b);
 if (aa !== ba) return false;
 if (aa) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
   const x = cpJNorm(a[i]), y = cpJNorm(b[i]);
   if (!cpJEq(x === undefined ? null : x, y === undefined ? null : y)) return false;
  }
  return true;
 }
 let na = 0, nb = 0;
 for (const k in a) {
  if (!Object.prototype.hasOwnProperty.call(a, k)) continue;
  const x = cpJNorm(a[k]);
  if (x === undefined) continue;
  na++;
  if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
  if (!cpJEq(x, b[k])) return false;
 }
 for (const k in b) {
  if (!Object.prototype.hasOwnProperty.call(b, k)) continue;
  if (cpJNorm(b[k]) !== undefined) nb++;
 }
 return na === nb;
}
function cpClone(v) {
 if (v === undefined) return undefined;
 return JSON.parse(JSON.stringify(v));
}

function cpIdKeys(arr) {
 if (!Array.isArray(arr)) return null;
 const keys = [];
 const seen = {};
 for (const it of arr) {
 if (!it || typeof it !== "object" || Array.isArray(it) || it.id === undefined || it.id === null || it.id === "") return null;
 const k = String(it.id);
 seen[k] = (seen[k] || 0) + 1;
 keys.push(seen[k] === 1 ? k : `${k}#${seen[k]}`);
 }
 return keys;
}

function cpMergeIdArray(local, base, server) {
 const lk = cpIdKeys(local), bk = cpIdKeys(base || []), sk = cpIdKeys(server || []);
 if (!lk || !bk || !sk) return null;
 const L = new Map(), B = new Map(), S = new Map();
 lk.forEach((k, i) => L.set(k, local[i]));
 bk.forEach((k, i) => B.set(k, (base || [])[i]));
 sk.forEach((k, i) => S.set(k, (server || [])[i]));
 const result = [];
 const used = new Set();
 // サーバーの並びを基準に
 sk.forEach(k => {
 const sv = S.get(k);
 if (L.has(k)) {
 const lv = L.get(k);
 if (!B.has(k) && !cpSame(lv, sv)) {
 // 両端末が同じ時刻 (同じID) で別々の記録を追加した場合は、両方とも残す
 result.push(sv, lv);
 used.add(k);
 return;
 }
 const localChanged = !B.has(k) || !cpSame(lv, B.get(k));
 // [Claude修正 2026-10-16] 同じ記録を両方の端末で直したときは、項目ごとに合流する
 // （以前は記録ごとこの端末の内容を使い、ほかの端末が直した別の項目が消えていた。同じ項目はこの端末の内容）
 if (localChanged && B.has(k) && !cpSame(sv, B.get(k)) && cpIsPlainObject(lv) && cpIsPlainObject(sv)) {
 result.push(cpMergeValue(lv, B.get(k), sv));
 } else {
 result.push(localChanged ? lv : sv);
 }
 used.add(k);
 } else if (B.has(k)) {
 // この端末で削除済み。サーバー側で編集されていれば残す
 if (!cpSame(sv, B.get(k))) { result.push(sv); }
 used.add(k);
 } else {
 result.push(sv); // 他端末で追加
 used.add(k);
 }
 });
 // この端末だけにある記録 (この端末で追加、または他端末で削除されたがこの端末で編集)
 const head = [], tail = [];
 lk.forEach((k, i) => {
 if (used.has(k)) return;
 const lv = L.get(k);
 if (B.has(k) && cpSame(lv, B.get(k))) return; // 他端末で削除され、この端末では未編集
 (i < local.length / 2 ? head : tail).push(lv);
 });
 return head.concat(result, tail);
}

function cpIsPlainObject(v) {
 return v !== null && typeof v === "object" && !Array.isArray(v);
}

function cpMergeValue(local, base, server) {
 if (cpSame(local, base)) return server;
 if (cpSame(server, base)) return local;
 if (Array.isArray(local) && Array.isArray(server)) {
 const merged = cpMergeIdArray(local, Array.isArray(base) ? base : [], server);
 return merged || local;
 }
 if (cpIsPlainObject(local) && cpIsPlainObject(server)) {
 const b = cpIsPlainObject(base) ? base : {};
 const out = {};
 new Set([...Object.keys(local), ...Object.keys(server), ...Object.keys(b)]).forEach(k => {
 const v = cpMergeValue(local[k], b[k], server[k]);
 if (v !== undefined) out[k] = v;
 });
 return out;
 }
 return local;
}

// ======================================================================
// [Claude追加 2026-10-16] 差分保存（作り変え ②）
// 前回サーバーと同期した時点（base）と今のデータ（cur）を比べ、変わった記録だけを取り出す。
// ・ID付きの記録の配列は1件ずつ: 追加・変更は {t:"up", v:新しい中身, b:前の中身}、削除は {t:"rm", b:前の中身}
//   新しい記録は、すぐ後ろにある既存の記録のID（before）を付け、サーバーでも同じ並びに入れる
// ・それ以外（設定のオブジェクトなど）は項目ごとまとめて {t:"set", v, b}
// サーバーは「前の中身」と今のサーバーの中身を比べ、ほかの端末が先に変えていたら 409 を返す
// ======================================================================
function cpUniqueIdKeys(arr) {
 if (!Array.isArray(arr)) return null;
 const keys = [];
 const seen = new Set();
 for (const it of arr) {
  if (!it || typeof it !== "object" || Array.isArray(it) || it.id === undefined || it.id === null || it.id === "") return null;
  const k = String(it.id);
  if (seen.has(k)) return null; // 同じIDが2つある配列は、項目ごとまとめて送る
  seen.add(k);
  keys.push(k);
 }
 return keys;
}

function cpComputeDiff(base, cur) {
 const ops = [];
 base = base || {};
 const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k) && o[k] !== undefined;
 new Set([...Object.keys(cur), ...Object.keys(base)]).forEach(k => {
  if (k === "_rev") return;
  const hasC = has(cur, k), hasB = has(base, k);
  const c = cur[k], b = base[k];
  if (hasC && hasB && Array.isArray(c) && Array.isArray(b)) {
   const ck = cpUniqueIdKeys(c), bk = cpUniqueIdKeys(b);
   if (ck && bk) {
    const B = new Map();
    bk.forEach((id, i) => B.set(id, b[i]));
    const C = new Set(ck);
    ck.forEach((id, i) => {
     const v = c[i];
     if (!B.has(id)) {
      let before = null;
      for (let j = i + 1; j < ck.length; j++) { if (B.has(ck[j])) { before = ck[j]; break; } }
      ops.push({ k: k, t: "up", id: id, v: cpClone(v), b: null, before: before });
     } else if (!cpJEq(v, B.get(id))) {
      ops.push({ k: k, t: "up", id: id, v: cpClone(v), b: B.get(id) });
     }
    });
    bk.forEach((id, i) => { if (!C.has(id)) ops.push({ k: k, t: "rm", id: id, b: b[i] }); });
    return;
   }
  }
  if (hasC === hasB && (!hasC || cpJEq(c, b))) return;
  const op = { k: k, t: "set", had: hasB };
  if (hasB) op.b = b;
  if (hasC) op.v = cpClone(c); else op.del = true;
  ops.push(op);
 });
 return ops;
}

// [Claude追加 2026-10-16] 受け取りも差分: サーバーから届いた変更（1件分）を当てはめる（サーバーの当てはめ方と同じ）
function cpApplyOp(d, op) {
 const k = op.k;
 if (op.t === "set") { if (op.del) delete d[k]; else d[k] = op.v; return; }
 if (!Array.isArray(d[k])) d[k] = [];
 const arr = d[k];
 const idx = arr.findIndex(x => x && typeof x === "object" && String(x.id) === String(op.id));
 if (op.t === "rm") { if (idx >= 0) arr.splice(idx, 1); return; }
 if (op.t !== "up") return;
 if (idx >= 0) { arr[idx] = op.v; return; }
 const at = (op.before !== undefined && op.before !== null) ? arr.findIndex(x => x && typeof x === "object" && String(x.id) === String(op.before)) : -1;
 if (at >= 0) arr.splice(at, 0, op.v); else arr.push(op.v);
}

// データベース管理クラス (ハイブリッド: サーバー同期 ＋ ローカル保存)
class LocalDB {
 constructor() {
 this.key = "CARE_PORTAL_DATABASE_V1";
 this.isServerMode = window.location.protocol.startsWith("http");
 // [Claude修正] サーバー接続時は、端末(ブラウザ)に全データの控えを残さない。
 // 以前は保存のたびに全データ(利用者の病歴・連絡先・記録)を端末に書き込み、ログアウト後や
 // タブを閉じた後も残っていた。次にページを開くと、ログイン前から前の職員が見ていたデータが
 // メモリに読み込まれていた。正本はサーバー(親機)にあり、ログイン後にサーバーから取得する。
 // 以前の版が残した控えもここで消す。単体起動時はブラウザが保存先なので従来どおり。
 if (this.isServerMode) {
 this.clearLocalCopy();
 this.data = this.ensureDefaultArrays({});
 } else {
 this.data = this.loadLocal();
 }
 this.serverIPs = [];
 this.serverPort = window.location.port || 8888;
 this.hasSyncedWithServer = !this.isServerMode;
 this.setBase(JSON.stringify(this.data));

 // [Claude修正] サーバーのデータはログイン後に取得する (ログイン前はサーバーが渡さないため)
 if (this.isServerMode && cpGetToken()) {
 this.initServerSync();
 }
 }

 loadLocal() {
 const raw = localStorage.getItem(this.key);
 if (raw) {
 try {
 const parsed = JSON.parse(raw);
 return this.ensureDefaultArrays(parsed);
 } catch (e) {}
 }
 return this.initSeedData();
 }

 ensureDefaultArrays(d) {
 if (!d || typeof d !== "object") return this.initSeedData();
 const arrayKeys = [
 "residents", "stamps", "templates", "suppliers", "inventory",
 "emergency_supplies", "belongings", "equipments", "recreations",
 "vehicle_logs", "fire_drills", "committees", "care_records",
 "shifts", "notebooks", "notebook_stamps", "vitals", "excretions",
 "meals", "oral_cares", "baths", "meds", "turns", "linens",
 "groomings", "weight_records", "visitations", "inventory_logs",
 "consumptions", "orders", "deposits", "complaints", "incidents", "photos",
 "daily_schedules", "monthly_notices", "care_summaries", "body_schema_pins",
 "eyedrop_orders", "vaccines", "topical_records", "prescriptions", "resident_medications",
 "units", "unit_logs", "settings_logs", "contract_docs", "contract_doc_types", "billing_overrides",
 "care_plans", "qualification_master", "dementia_assessments", // [Antigravity実装 2026-10-21] ケアプラン・資格研修マスタ・認知症高齢者自立度
 "life_assessments", // [Claude修正] LIFE の評価（ログイン直後から入れ物があるようにして、画面を開いただけで変更扱いにならないようにする）
 "mc_audit_logs", "host_recovery_logs" // [Antigravity実装 2026-10-30] 最初の入口（MC）と親機での管理者パスワード初期化の監査履歴
 ];
 arrayKeys.forEach(k => {
 if (!Array.isArray(d[k])) d[k] = [];
 });
 // [Claude追加] 区分（ユニット・フロア）: 以前の版の「wing」（東棟・西棟の文字）を区分の番号（unit_id）に移す。
 // どの端末でも同じ番号になるよう、利用者→職員の順に出てきた順で番号を振る
 {
 const people = (Array.isArray(d.residents) ? d.residents : []).concat(Array.isArray(d.stamps) ? d.stamps : []).filter(x => x && typeof x === "object");
 if (!d.units.length) {
 const names = [];
 people.forEach(x => { if (x.wing && !names.includes(x.wing)) names.push(x.wing); });
 d.units = names.map((n, i) => ({ id: i + 1, name: n, order: i + 1 }));
 }
 const byName = {};
 d.units.forEach(u => { if (u && u.name) byName[u.name] = u.id; });
 people.forEach(x => {
 if (x.wing !== undefined) {
 if ((x.unit_id === undefined || x.unit_id === null) && byName[x.wing]) x.unit_id = byName[x.wing];
 delete x.wing;
 }
 });
 people.forEach(x => { if (typeof x.role === "string" && /^.+ユニットリーダー$/.test(x.role) && x.role !== "ユニットリーダー" && x.unit_id) x.role = "ユニットリーダー"; });
 }
 // [Antigravity修正 2026-10-30] アカウントは職員の登録時に作成する（読み込み時に見本や aaaa/0000 を自動生成しない）
 if (!Array.isArray(d.staff_accounts)) d.staff_accounts = [];
 d.staff_accounts.forEach(a => { if (a && a.staff_name && !a.id) a.id = a.staff_name; });
 cpDedupeLoginIds(d.staff_accounts);
 if (!d.night_turn_templates || typeof d.night_turn_templates !== "object") {
 d.night_turn_templates = Object.assign({}, DEFAULT_NIGHT_TURN_TEMPLATES);
 }
 // [Claude修正] 空のときに見本データ（架空の記録・指示）を本番のデータへ書き込んでいたのをやめる
 if (!Array.isArray(d.care_summaries)) d.care_summaries = [];
 // [Claude修正] 空のときに見本データ（架空の記録・指示）を本番のデータへ書き込んでいたのをやめる
 if (!Array.isArray(d.body_schema_pins)) d.body_schema_pins = [];
 if (Array.isArray(d.stamps)) {
 d.stamps = sortStaffList(d.stamps);
 }

 if (!d.monthly_shifts || typeof d.monthly_shifts !== "object") {
 d.monthly_shifts = {};
 }
 if (!Array.isArray(d.shift_hope_offs)) {
  d.shift_hope_offs = [];
 }
 if (!Array.isArray(d.shift_ng_pairs)) {
 d.shift_ng_pairs = [];
 }

 // 消耗品マスター・アイテム同期＆移行 (手袋S/L追加、尿取りパッド名称統一、ワイドパッド追加)
 // [Claude修正] 手袋S/L・ワイドパッドの追加は、古い名前（尿取りパッド 4回分）が残っている古いデータのときだけ（毎回だと、消した品目が読み込みのたびに戻っていた）
 if (Array.isArray(d.inventory) && d.inventory.some(i => i && i.name === "尿取りパッド 4回分")) {
 d.inventory.forEach(i => {
 if (i.name === "尿取りパッド 4回分") i.name = "尿取りパッド";
 });
 if (!d.inventory.some(i => i.name === "ワイドパッド")) {
 d.inventory.push({
 id: 401,
 name: "ワイドパッド",
 category: "オムツ・パッド",
 current_stock: 4,
 safety_stock: 5,
 normal_stock: 10,
 unit: "パック",
 unit_price: 1600,
 is_personal_billable: 1,
 supplier_id: 1,
 supplier_name: "ケアサポート商事"
 });
 }
 if (!d.inventory.some(i => i.name === "使い捨てプラスチック手袋 S")) {
 d.inventory.push({
 id: 402,
 name: "使い捨てプラスチック手袋 S",
 category: "衛生用品",
 current_stock: 12,
 safety_stock: 8,
 normal_stock: 16,
 unit: "箱",
 unit_price: 650,
 is_personal_billable: 0,
 supplier_id: 1,
 supplier_name: "ケアサポート商事"
 });
 }
 if (!d.inventory.some(i => i.name === "使い捨てプラスチック手袋 L")) {
 d.inventory.push({
 id: 403,
 name: "使い捨てプラスチック手袋 L",
 category: "衛生用品",
 current_stock: 10,
 safety_stock: 8,
 normal_stock: 16,
 unit: "箱",
 unit_price: 650,
 is_personal_billable: 0,
 supplier_id: 1,
 supplier_name: "ケアサポート商事"
 });
 }
 }

 // 取引先 (suppliers) の取扱品目同期
 if (Array.isArray(d.suppliers)) {
 const careSupp = d.suppliers.find(s => s.id === 1 || (s.name || "").includes("ケアサポート"));
 // [Claude修正] 初期品目の自動追加は1回だけにする (毎回追加すると、削除した商品が再読み込みで復活していた)
 if (careSupp && Array.isArray(careSupp.items) && !d.supplier_items_seeded_v1) {
 d.supplier_items_seeded_v1 = true;
 careSupp.items.forEach(i => {
 if (i.name === "尿取りパッド 4回分") i.name = "尿取りパッド";
 });
 if (!careSupp.items.some(i => i.name === "ワイドパッド")) {
 careSupp.items.push({ name: "ワイドパッド", unit_price: 1600, unit: "パック" });
 }
 if (!careSupp.items.some(i => i.name === "使い捨てプラスチック手袋 S")) {
 careSupp.items.push({ name: "使い捨てプラスチック手袋 S", unit_price: 650, unit: "箱" });
 }
 if (!careSupp.items.some(i => i.name === "使い捨てプラスチック手袋 L")) {
 careSupp.items.push({ name: "使い捨てプラスチック手袋 L", unit_price: 650, unit: "箱" });
 }
 }
 }

 // [Claude修正] 取扱商品にIDが無いと「編集」「削除」が効かなかった (ID=0 扱いで新規追加画面が開き、削除もされない)。
 // IDの無い商品に、全端末で同じになる固定IDを付与する。
 if (Array.isArray(d.suppliers)) {
 d.suppliers.forEach(sp => {
 if (!Array.isArray(sp.items)) return;
 sp.items.forEach((it, idx) => {
 if (it && (it.id === undefined || it.id === null || it.id === 0 || it.id === "")) {
 let cand = Number(sp.id) * 1000 + idx + 1;
 while (sp.items.some(o => o !== it && Number(o.id) === cand)) cand++;
 it.id = cand;
 }
 });
 });
 }
 // [Claude修正] 食事の時間帯は「朝食/昼食/夕食」で保存する (業務日誌・個人記録はこの表記で集計している)。
 // 旧表記 (朝/昼/夕) で保存された記録を読み替える。
 if (Array.isArray(d.meals)) {
 const mealMap = { "朝": "朝食", "昼": "昼食", "夕": "夕食" };
 d.meals.forEach(m => { if (m && mealMap[m.meal_type]) m.meal_type = mealMap[m.meal_type]; });
 }

 // 過去履歴内の旧表記更新
 ["orders", "consumptions", "inventory_logs"].forEach(tblKey => {
 if (Array.isArray(d[tblKey])) {
 d[tblKey].forEach(row => {
 if (row.item_name === "尿取りパッド 4回分") row.item_name = "尿取りパッド";
 });
 }
 });

 // [Claude修正] 空のときに見本データ（架空の記録・指示）を本番のデータへ書き込んでいたのをやめる
 if (!Array.isArray(d.eyedrop_orders)) d.eyedrop_orders = [];

 // [Claude修正 2026-10-22] 入院の期間リストは、読み込んだときには作らない（見るだけでは cpGetHospitalizations が前の形の入院日を1件目として扱う）。
 // 読み込んだときに足すと、前に同期した中身とサーバーの中身がずれて、利用者の情報の保存が毎回「競合」になっていた

 // [Antigravity実装 2026-10-19] 資格・研修の一覧（マスタ）の初期設定（読み込んだだけで差分が出ないよう固定値で用意）
 if (!Array.isArray(d.qualification_master) || d.qualification_master.length === 0) {
 const srcBoth = "https://www.pref.hiroshima.lg.jp/uploaded/attachment/511579.pdf https://www.city.kuki.lg.jp/_res/projects/default_project/_page_/001/007/698/1007698_022.pdf";
 d.qualification_master = [
  { id: 1, name: "介護福祉士", kana: "かいごふくしし", kind: "資格", has_mark: "なし", mark_detail: "", source_url: "", created_by: "初期登録", created_at: "", status: "有効" },
  { id: 2, name: "実務者研修", kana: "じつむしゃけんしゅう", kind: "研修", has_mark: "なし", mark_detail: "", source_url: "", created_by: "初期登録", created_at: "", status: "有効" },
  { id: 3, name: "介護職員初任者研修", kana: "かいごしょくいんしょにんしゃけんしゅう", kind: "研修", has_mark: "なし", mark_detail: "", source_url: "", created_by: "初期登録", created_at: "", status: "有効" },
  { id: 4, name: "介護支援専門員", kana: "かいごしえんせんもんいん", kind: "資格", has_mark: "あり", mark_detail: "計画作成担当者のうち1人以上に必要（人員基準）", source_url: srcBoth, created_by: "初期登録", created_at: "", status: "有効" },
  { id: 5, name: "看護師", kana: "かんごし", kind: "資格", has_mark: "なし", mark_detail: "", source_url: "", created_by: "初期登録", created_at: "", status: "有効" },
  { id: 6, name: "准看護師", kana: "じゅんかんごし", kind: "資格", has_mark: "なし", mark_detail: "", source_url: "", created_by: "初期登録", created_at: "", status: "有効" },
  { id: 7, name: "社会福祉士", kana: "しゃかいふくしし", kind: "資格", has_mark: "なし", mark_detail: "", source_url: "", created_by: "初期登録", created_at: "", status: "有効" },
  { id: 8, name: "社会福祉主事", kana: "しゃかいふくししゅじ", kind: "資格", has_mark: "なし", mark_detail: "", source_url: "", created_by: "初期登録", created_at: "", status: "有効" },
  { id: 9, name: "認知症介護実践者研修", kana: "にんちしょうかいごじっせんしゃけんしゅう", kind: "研修", has_mark: "あり", mark_detail: "計画作成担当者に必要（人員基準）", source_url: srcBoth, created_by: "初期登録", created_at: "", status: "有効" },
  { id: 10, name: "認知症対応型サービス事業管理者研修", kana: "にんちしょうたいおうがたさーびすじぎょうかんりしゃけんしゅう", kind: "研修", has_mark: "あり", mark_detail: "管理者に必要（人員基準）", source_url: srcBoth, created_by: "初期登録", created_at: "", status: "有効" }
 ];
 try { Object.defineProperty(d, "_qmSeeded", { value: true, enumerable: false, configurable: true, writable: true }); } catch (e) {}
 }

 return d;
 }

 save() {
 this._localDirty = true; // [Claude修正 2026-10-18] まだ送っていない変更がある（受け取りのときの判断に使う）
 // 1. 単体起動時はブラウザに保存 ([Claude修正] サーバー接続時は端末に控えを残さない)
 this.storeLocalCopy();

 // 2. サーバーモードなら親機へ即時送信 (初回同期完了後のみ)
 if (this.isServerMode && this.hasSyncedWithServer) {
 this.saveToServer();
 }
 }

 // [Claude修正] 端末(ブラウザ)への控えは単体起動時だけ書く
 storeLocalCopy(json) {
 if (this.isServerMode) return;
 try { localStorage.setItem(this.key, json || JSON.stringify(this.data)); } catch (e) {}
 }

 clearLocalCopy() {
 try { localStorage.removeItem(this.key); } catch (e) {}
 }

 // [Claude修正] まだ親機へ送れていない変更があるか (サーバー接続時のみ)
 hasUnsentChanges() {
 if (!this.isServerMode) return false;
 try { return cpComputeDiff(this.baseObj || {}, this.data).length > 0; } catch (e) { return true; }
 }

 // [Claude修正] ログアウトの前に、未送信の変更を親機へ送り切る。
 // 送れた (または未送信がない) ときは true、送れなかったときは false
 async flushUnsentChanges() {
 if (!this.isServerMode) return true;
 try { if (this._saveChain) await this._saveChain; } catch (e) {}
 if (!this.hasUnsentChanges()) return true;
 if (!this.hasSyncedWithServer || !cpGetToken()) return false;
 for (let i = 0; i < 2; i++) {
 try { await this.saveToServer(); } catch (e) {}
 if (!this.hasUnsentChanges()) return true;
 await new Promise(r => setTimeout(r, 1000));
 }
 return !this.hasUnsentChanges();
 }

 // [Claude修正] 保存の競合対策 (別々の端末でほぼ同時に保存すると、後から保存した端末が
 // 全データを上書きし、先に保存された記録が消えていた)。
 // 保存の直前にサーバーの最新データを取得し、「前回同期した状態」と比べて
 // 自分の変更と他端末の変更を合流 (マージ) してから保存する。
 // さらに版番号 (_rev) をサーバー側で照合し、取得から保存までの間に他端末が保存した場合は
 // サーバーが 409 を返すので、もう一度取得・合流してやり直す。
 async saveToServer() {
 if (this.isServerMode && !this.hasSyncedWithServer) return;
 this._saveChain = (this._saveChain || Promise.resolve()).then(() => this._syncAndSave()).catch(() => {});
 return this._saveChain;
 }

 // [Claude追加 2026-10-16] 前回サーバーと同期した時点の中身（base）と版番号をそろえて持つ
 // base は画面のデータ（this.data）とは別の写しで、中の記録を画面側と共有しない（共有すると変更に気づけない）
 setBase(json, obj) {
 if (obj) this.baseObj = obj;
 else { try { this.baseObj = JSON.parse(json || "{}"); } catch (e) { this.baseObj = {}; } }
 this.baseRev = Number(this.baseObj && this.baseObj._rev) || 0;
 }

 // [Claude修正 2026-10-18] 保存できた変更を base に当てはめる（全体を文字にして写し直さない）
 applyOpsToBase(ops, rev) {
 if (!this.baseObj) this.baseObj = {};
 ops.forEach(op => cpApplyOp(this.baseObj, op));
 this.baseObj._rev = rev;
 this.baseRev = Number(rev) || 0;
 }

 // [Claude修正 2026-10-18] ほかの端末の変更（1件ずつ）を、この端末のデータと base に合流する。
 // 合流の決まりは以前の全体の合流（mergeRemoteData / cpMergeIdArray）と同じ:
 // ・この端末で変えていない記録は、届いた中身にする
 // ・両方で同じ記録を直したときは、項目ごとに合流する（同じ項目はこの端末の内容）
 // ・この端末で直した記録が、ほかの端末で消されていたら残す（消失を防ぐ）
 // ・この端末で消した記録が、ほかの端末で直されていたら戻す
 mergeRemoteOps(ops, rev) {
 if (!this.baseObj) this.baseObj = {};
 const base = this.baseObj;
 const sameId = (x, id) => x && typeof x === "object" && String(x.id) === id;
 ops.forEach(op => {
  const k = op.k;
  if (!k || k === "_rev") return;
  if (k === "qualification_master" && base._qmSeeded) { base.qualification_master = []; base._qmSeeded = false; }
  if (op.t === "set") {
   const sv = op.del ? undefined : op.v;
   const cur = this.data[k], b = base[k];
   const merged = cpJEq(cur, b) ? sv : cpMergeValue(cur, b, sv);
   this.assignMergedKey(k, cpClone(merged));
   if (op.del) delete base[k]; else base[k] = op.v;
   return;
  }
  if (op.t !== "up" && op.t !== "rm") return;
  const id = String(op.id);
  if (!Array.isArray(this.data[k])) {
   if (this.data[k] !== undefined && !cpJEq(this.data[k], base[k])) { cpApplyOp(base, op); return; } // この端末で別の形に変えていた
   this.data[k] = [];
  }
  const arr = this.data[k];
  const li = arr.findIndex(x => sameId(x, id));
  const lv = li >= 0 ? arr[li] : undefined;
  const bv = Array.isArray(base[k]) ? base[k].find(x => sameId(x, id)) : undefined;
  if (op.t === "rm") {
   if (lv !== undefined && bv !== undefined && cpJEq(lv, bv)) arr.splice(li, 1);
  } else {
   const sv = op.v;
   if (lv === undefined) {
    if (bv === undefined || !cpJEq(sv, bv)) {
     const at = (op.before !== undefined && op.before !== null) ? arr.findIndex(x => sameId(x, String(op.before))) : -1;
     if (at >= 0) arr.splice(at, 0, cpClone(sv)); else arr.push(cpClone(sv));
    }
   } else if (bv === undefined) {
    if (!cpJEq(lv, sv)) arr.splice(li, 0, cpClone(sv)); // 両方の端末で同じIDの記録を追加: どちらも残す
   } else if (cpJEq(lv, bv)) {
    arr[li] = cpClone(sv);
   } else if (!cpJEq(sv, bv) && cpIsPlainObject(lv) && cpIsPlainObject(sv)) {
    arr[li] = cpClone(cpMergeValue(lv, bv, sv));
   }
  }
  cpApplyOp(base, op);
 });
 base._rev = rev;
 this.baseRev = Number(rev) || 0;
 }

 // [Claude修正 2026-10-16] ② 差分保存。以前は保存のたびに全データを取得・合流し、全データを送っていた
 // （データが増えると保存に十数秒かかり、端末が多いと保存できない記録が出ていた）。
 // 今は変わった記録だけを送る。ほかの端末が同じ記録を先に変えていたら（409）、最新を取得して合流し、やり直す。
 // 差分保存に対応していないサーバーや、5回やり直しても保存できないときは、以前の全体の保存を使う。
 async _syncAndSave() {
 if (this._diffUnsupported) return this._fullSyncAndSave();
 this._saving = true;
 this._syncEpoch = (this._syncEpoch || 0) + 1;
 this._remoteMergedDuringSave = false;
 let fallback = false;
 try {
 for (let attempt = 1; attempt <= 5; attempt++) {
 // [Claude修正 2026-10-18] 全データを文字にして写すのをやめ、base と今のデータを直接比べる（変わった記録だけ写す）
 this._localDirty = false;
 if (this.baseObj && this.baseObj._qmSeeded && !cpJEq(this.data.qualification_master, this.baseObj.qualification_master)) {
  this.baseObj.qualification_master = [];
  this.baseObj._qmSeeded = false;
 }
 const ops = cpComputeDiff(this.baseObj || {}, this.data);
 if (ops.length === 0) {
 this.updateSyncBadge(true);
 if (this._remoteMergedDuringSave) this.refreshViewAfterRemoteMerge();
 return true;
 }
 const res = await cpApiFetch('/api/save-diff', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ base_rev: this.baseRev, ops: ops })
 });
 if (res.status === 404) { this._diffUnsupported = true; fallback = true; break; }
 if (res.status === 403) {
 // [Claude追加 2026-10-22] サーバーが職種で止めた変更は、この端末でも元に戻してから、ほかの変更を送り直す
 let info = null;
 try { info = await res.json(); } catch (e) { info = null; }
 if (!this._revertForbiddenKey(info)) { fallback = true; break; }
 continue;
 }
 if (res.status === 409) {
 // ほかの端末が同じ記録を先に変えていた（またはサーバーにデータがない）。最新を取得して合流してからやり直す
 const pulled = await this._pullForSave();
 if (!pulled) { fallback = true; break; }
 await new Promise(r => setTimeout(r, 100 * attempt));
 continue;
 }
 if (!res.ok) { fallback = true; break; }
 const resp = await res.json();
 this.data._rev = resp.rev;
 this._forbidCount = 0;
 const othersSavedBetween = Number(resp.prev_rev) !== Number(this.baseRev);
 const revBeforeSave = this.baseRev;
 this.applyOpsToBase(ops, resp.rev);
 // ほかの端末の保存が間にあったときは、前の版から後の変更を受け取り直す（自分の変更は同じ中身なので重ねても変わらない）
 if (othersSavedBetween) this.baseRev = revBeforeSave;
 this.storeLocalCopy();
 this.updateSyncBadge(true);
 this.updateBackupBadge(resp.saved_at || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
 if (othersSavedBetween) {
 // 送るまでの間にほかの端末も保存していた。自分の保存分を前提に、最新と合流する
 this._forcePull = true;
 const pulled = await this._pullForSave();
 if (pulled) this._forcePull = false;
 }
 if (this._remoteMergedDuringSave) this.refreshViewAfterRemoteMerge();
 // 送っている間に画面で変更された分があれば、続けて送る
 // 送っている間に画面で保存された分は、save() が続けて送る（ここで全体を比べ直さない）
 return true;
 }
 if (!fallback) fallback = true;
 } catch (err) {
 console.warn("Server diff save error:", err);
 fallback = true;
 } finally {
 this._saving = false;
 }
 this._localDirty = true; // 送れなかった。次の受け取りのときにもう一度送る
 if (fallback) return this._fullSyncAndSave();
 return false;
 }

 // [Claude追加 2026-10-16] 受け取りも差分: 前回同期した版から後に変わった記録だけをサーバーから受け取り、
 // 前回の中身（base）に当てはめて「今のサーバーの中身」を作る。サーバーが変更を覚えていないときなどは null（全データを取る）
 // [Claude修正 2026-10-18] 届いた変更の一覧 { rev, ops } を返す（base の全体を写し直さない）
 async _fetchChanges() {
 const res = await cpApiFetch('/api/changes?since=' + encodeURIComponent(this.baseRev), { cache: 'no-store' });
 if (!res.ok) return null;
 const j = await res.json();
 if (!j || j.full || !Array.isArray(j.changes)) return null;
 const ops = [];
 j.changes.forEach(ch => (ch.ops || []).forEach(op => ops.push(op)));
 return { rev: j.rev, ops: ops };
 }

 // サーバーの全データ（文字）を受け取り、この端末のデータと合流して base にする（変更の一覧が使えないとき）
 _mergeFullText(text) {
 const serverData = this.ensureDefaultArrays(JSON.parse(text));
 const changed = !cpJEq(serverData, this.baseObj || {});
 if (changed) this.mergeRemoteData(serverData);
 // base は画面のデータと共有しないよう、もう一度読み直して別に持つ
 this.setBase(null, this.ensureDefaultArrays(JSON.parse(text)));
 return changed;
 }

 // 最新を取得し（変わった記録だけ、できなければ全データ）、この端末の変更と合流する（保存中の競合のときに使う）
 async _pullForSave() {
 try {
 let ch = null;
 try { ch = await this._fetchChanges(); } catch (e) { ch = null; }
 if (ch) {
 if (ch.ops.length > 0) { this.mergeRemoteOps(ch.ops, ch.rev); this._remoteMergedDuringSave = true; }
 else { this.baseObj._rev = ch.rev; this.baseRev = Number(ch.rev) || 0; }
 } else {
 const res = await cpApiFetch('/api/data', { cache: 'no-store' });
 if (!res.ok) return false;
 const text = await res.text();
 if (!text || text.trim() === "" || text.trim() === "{}") return false;
 if (this._mergeFullText(text)) this._remoteMergedDuringSave = true;
 }
 this.storeLocalCopy();
 return true;
 } catch (e) {
 return false;
 }
 }

 // 以前の全体の保存（差分保存に対応していないサーバー用・差分保存がうまくいかないときの予備）
 async _fullSyncAndSave() {
 this._saving = true;
 this._syncEpoch = (this._syncEpoch || 0) + 1;
 try {
 for (let attempt = 1; attempt <= 5; attempt++) {
 let serverRev = 0;
 let remoteChanged = false;
 const resGet = await cpApiFetch('/api/data', { cache: 'no-store' });
 if (resGet.ok) {
 const text = await resGet.text();
 if (text && text.trim() !== "" && text.trim() !== "{}") {
 const serverData = this.ensureDefaultArrays(JSON.parse(text));
 serverRev = Number(serverData._rev) || 0;
 if (!cpJEq(serverData, this.baseObj || {})) {
 this.mergeRemoteData(serverData);
 remoteChanged = true;
 }
 }
 }
 this.data._rev = serverRev + 1;
 const payload = JSON.stringify(this.data);
 const res = await cpApiFetch('/api/save', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: payload
 });
 if (res.status === 403) {
 let info = null;
 try { info = await res.json(); } catch (e) { info = null; }
 if (!this._revertForbiddenKey(info)) { this.updateSyncBadge(false); return false; }
 continue;
 }
 if (res.status === 409) {
 // 取得から保存までの間に他端末が保存した。少し待って取得・合流からやり直す
 await new Promise(r => setTimeout(r, 150 * attempt));
 continue;
 }
 if (res.ok) {
 this.setBase(payload);
 this.storeLocalCopy(payload);
 this.updateSyncBadge(true);
 try {
 const resp = await res.json();
 this.updateBackupBadge(resp.saved_at || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
 } catch (e) {
 this.updateBackupBadge(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
 }
 if (remoteChanged) this.refreshViewAfterRemoteMerge();
 return true;
 }
 this.updateSyncBadge(false);
 return false;
 }
 console.warn("Server save conflict could not be resolved after retries");
 this.updateSyncBadge(false);
 return false;
 } catch (err) {
 console.warn("Server save error:", err);
 this.updateSyncBadge(false);
 return false;
 } finally {
 this._saving = false;
 }
 }

 // [Claude追加 2026-10-22] 職種で保存できない変更（サーバーが 403 で返した項目）を、前に同期した中身に戻す
 _revertForbiddenKey(info) {
 const k = info && info.key;
 if (!k || k === "_rev") return false;
 this._forbidCount = (this._forbidCount || 0) + 1;
 if (this._forbidCount > 20) return false; // 戻しても同じ変更が続くとき（止まらないようにする）
 const base = this.baseObj || {};
 const sameId = (x, id) => x && typeof x === "object" && String(x.id) === String(id);
 if (info.id !== undefined && info.id !== null && Array.isArray(this.data[k])) {
  // その1件だけ戻す（同じ項目のほかの記録の変更は残して送り直す）
  const arr = this.data[k];
  const li = arr.findIndex(x => sameId(x, info.id));
  const bv = Array.isArray(base[k]) ? base[k].find(x => sameId(x, info.id)) : undefined;
  if (bv !== undefined) { if (li >= 0) arr[li] = cpClone(bv); else arr.push(cpClone(bv)); }
  else if (li >= 0) arr.splice(li, 1);
 } else {
  this.assignMergedKey(k, Object.prototype.hasOwnProperty.call(base, k) ? cpClone(base[k]) : undefined);
 }
 this.storeLocalCopy();
 const LABEL = { kasan_settings: "加算・減算の設定", billing_settings: "請求の設定", billing_overrides: "請求の個別の設定", units: "区分",
  contract_docs: "契約の書類", contract_doc_types: "契約の書類の種類", office_info: "事業所の情報", staff_archive: "職員の記録（削除した方）",
  shift_ng_pairs: "勤務の組み合わせの配慮", shift_staffing: "勤務の人数", shift_events: "勤務表の行事", monthly_shift_units: "勤務の区分",
  monthly_shifts: "勤務表", resident_medications: "処方薬", eyedrop_orders: "点眼の指示", dementia_assessments: "認知症の自立度",
  life_assessments: "LIFE の評価", residents: "利用者の情報（バイタルの目安・ケアプラン目標・基本方針・要介護度・認定の期間・認定更新の手続き・負担割合）", care_plans: "ケアプラン", care_summaries: "介護サマリー",
  stamps: "職員の登録", staff_accounts: "ID・パスワード", shift_hope_offs: "希望休", invoices: "利用者への請求書", invoice_fee_tables: "利用者への請求の料金表", quality_evaluations: "自己評価・外部評価",
  photos: "保管庫の写真", incidents: "事故報告書" };
 const label = LABEL[k] || k;
 const who = (info && info.who) || "決まった職種の方";
 if (!this._forbidShown) this._forbidShown = {};
 if (!this._forbidShown[k]) {
  this._forbidShown[k] = true;
  if (who === "写真の取消は親機で行ってください" || (info && info.message === "写真の取消は親機で行ってください")) {
   setTimeout(() => alert(`保存できない変更がありました。\n写真の取消は親機で行ってください。\nこの端末での変更は元に戻しました。`), 0);
  } else {
   setTimeout(() => alert(`保存できない変更がありました。\n「${label}」を変えられるのは${who}です。\nこの端末での変更は元に戻しました。`), 0);
  }
 }
 this.refreshViewAfterRemoteMerge();
 return true;
 }

 // 他端末の変更を、このページが持つ配列・オブジェクトを置き換えずに (参照を保ったまま) 取り込む
 mergeRemoteData(serverData) {
 let base = {};
 base = this.baseObj || {}; // [Claude修正 2026-10-16] 毎回 JSON を読み直さない
 const keys = new Set([...Object.keys(this.data), ...Object.keys(serverData)]);
 keys.forEach(k => {
 if (k === "_rev") return;
 this.assignMergedKey(k, cpMergeValue(this.data[k], base[k], serverData[k]));
 });
 }

 // 合流した値を、このページが持つ配列・オブジェクトを置き換えずに (参照を保ったまま) 入れる
 assignMergedKey(k, merged) {
 const cur = this.data[k];
 if (merged === undefined) {
 delete this.data[k];
 } else if (Array.isArray(cur) && Array.isArray(merged)) {
 // 多いとき（1年分の記録など）に引数の数の上限を超えないよう、分けて入れる
 if (merged.length < 30000) cur.splice(0, cur.length, ...merged);
 else { cur.length = 0; for (let i = 0; i < merged.length; i++) cur.push(merged[i]); }
 } else if (cur && merged && typeof cur === "object" && typeof merged === "object" && !Array.isArray(cur) && !Array.isArray(merged)) {
 Object.keys(cur).forEach(x => { if (!(x in merged)) delete cur[x]; });
 Object.assign(cur, merged);
 } else {
 this.data[k] = merged;
 }
 }

 refreshViewAfterRemoteMerge() {
 const activeTag = document.activeElement ? document.activeElement.tagName : "";
 if (activeTag !== "INPUT" && activeTag !== "TEXTAREA" && activeTag !== "SELECT") {
 if (typeof reloadStateFromDb === 'function') reloadStateFromDb();
 }
 }

 updateBackupBadge(timeStr) {
 const b = document.getElementById("backupStatusBadge");
 if (!b) return;
 b.textContent = `自動バックアップ済 (${timeStr})`;
 b.dataset.state = "ok";
 b.title = `${timeStr} に親機PCへ保存し、控えも作りました（USBへの保存は手動です）`;
 }

 async initServerSync() {
 if (this._syncStartedFor === cpGetToken()) return;
 this._syncStartedFor = cpGetToken();
 // サーバーのローカルIP一覧を取得
 try {
 const resIp = await cpApiFetch('/api/ip');
 if (resIp.ok) {
 const ipData = await resIp.json();
 this.serverIPs = ipData.ips || [];
 this.serverPort = ipData.port || window.location.port || 8888;
 if (ipData.tunnel_url && ipData.tunnel_url.trim() !== "") {
 localStorage.setItem("care_portal_tunnel_url", ipData.tunnel_url.trim());
 } else {
 // トンネル起動直後のURL遅延取得に対応（自動リトライ）
 setTimeout(() => this.retryFetchTunnelUrl(1), 3000);
 }
 this.renderShareModalUrls();
 }
 } catch (e) {}

 // サーバー上の最新DBを取得
 try {
 const res = await cpApiFetch('/api/data');
 if (res.ok) {
 const text = await res.text();
 if (text && text.trim() !== "" && text.trim() !== "{}") {
 const serverData = JSON.parse(text);
 // [Claude修正] 端末に控えを持たなくなったので、サーバーのデータを常に正本として使う
 // (以前は利用者が0人のとき、端末の控えを残してサーバーへ送っていた)
 if (serverData && typeof serverData === "object" && !Array.isArray(serverData)) {
 this.data = this.ensureDefaultArrays(serverData);
 // base は別に読み直して持つ（画面のデータと記録を共有しない）
 this.setBase(null, this.ensureDefaultArrays(JSON.parse(text)));
 this.storeLocalCopy();
 // 画面を再初期化して最新データを表示
 setTimeout(() => {
 if (typeof reloadStateFromDb === 'function') {
 reloadStateFromDb();
 }
 }, 100);
 }
 } else {
 // [Antigravity修正 2026-10-30] サーバーが空のときは見本データを送らず、利用者0人・職員0人・記録0件の空の形で始める
 this.data = this.initSeedData();
 this.setBase(null, this.initSeedData());
 this.hasSyncedWithServer = true;
 setTimeout(() => {
 if (typeof reloadStateFromDb === 'function') reloadStateFromDb();
 }, 100);
 }
 this.hasSyncedWithServer = true;
 this.updateSyncBadge(true);
 }
 } catch (e) {
 console.warn("Init sync failed, running in local mode:", e);
 this.updateSyncBadge(false);
 }

 // 5秒ごとのバックグラウンド同期 (他端末からの入力を反映)
 if (!this._pollTimer) this._pollTimer = setInterval(() => this.pollServerUpdates(), 5000);
 }

 async retryFetchTunnelUrl(attempt) {
 if (attempt > 3) return;
 try {
 const res = await cpApiFetch('/api/ip');
 if (res.ok) {
 const data = await res.json();
 if (data.tunnel_url && data.tunnel_url.trim() !== "") {
 localStorage.setItem("care_portal_tunnel_url", data.tunnel_url.trim());
 this.renderShareModalUrls();
 return;
 }
 }
 } catch (_) {}
 if (attempt < 3) {
 setTimeout(() => this.retryFetchTunnelUrl(attempt + 1), 4000);
 }
 }

 async pollServerUpdates() {
 if (!this.isServerMode) return;
 if (!cpGetToken()) return;

 // トンネル接続先URLの変更検知とQRコード自動更新 (サーバー側のtunnel_url.txtの変更に自動追従)
 this.pollCycleCount = (this.pollCycleCount || 0) + 1;
 if (this.pollCycleCount % 2 === 0) {
 try {
 const resIp = await cpApiFetch('/api/ip');
 if (resIp.ok) {
 const ipData = await resIp.json();
 if (ipData.tunnel_url && ipData.tunnel_url.trim() !== "") {
 const currentTunnel = localStorage.getItem("care_portal_tunnel_url") || "";
 if (ipData.tunnel_url.trim() !== currentTunnel) {
 localStorage.setItem("care_portal_tunnel_url", ipData.tunnel_url.trim());
 this.renderShareModalUrls();
 }
 }
 }
 } catch (_) {}
 }

 try {
 const epochAtFetch = this._syncEpoch;
 // [Claude修正 2026-10-16] ① まず版番号だけを聞き、変わっていなければ全データは取らない
 // （以前は5秒ごとに全データを受け取っていて、データが増えると重かった）
 const rr = await cpApiFetch('/api/rev', { cache: 'no-store' });
 if (rr.ok) {
 const rj = await rr.json();
 if (Number(rj.rev) === Number(this.baseRev) && !this._forcePull) { this.updateSyncBadge(true); return; }
 } else if (rr.status !== 404) {
 return;
 }
 if (this._saving || this._syncEpoch !== epochAtFetch) return;
 // [Claude追加 2026-10-16] 受け取りも差分: 変わった記録だけを受け取る。できないとき・続けて60回使ったあとは全データ（念のための照合）
 // [Claude修正 2026-10-18] 変わった記録だけを、この端末のデータに1件ずつ合流する（以前は全データを写し直して比べていた）
 let ch = null;
 this._changesStreak = this._changesStreak || 0;
 if (this._changesStreak < 60) {
 try { ch = await this._fetchChanges(); } catch (e) { ch = null; }
 }
 // [Claude修正] 保存中、または取得中に保存が行われた場合は取り込まない
 // (取得した内容が保存より古いと、削除した記録が復活するなどの不整合が起きるため)
 if (this._saving || this._syncEpoch !== epochAtFetch) return;
 const baseRev = Number(this.baseRev) || 0;
 if (ch) {
 this._changesStreak++;
 if ((Number(ch.rev) || 0) < baseRev) return; // 古い版は無視
 if (ch.ops.length === 0) {
 this.baseObj._rev = ch.rev; this.baseRev = Number(ch.rev) || 0;
 this._forcePull = false;
 this.updateSyncBadge(true);
 return;
 }
 const hadLocal = this._localDirty || !!this._saving;
 this.mergeRemoteOps(ch.ops, ch.rev);
 this._forcePull = false;
 this.storeLocalCopy();
 this.updateSyncBadge(true);
 // 未送信の自分の変更がある場合は保存する
 if (hadLocal) this.saveToServer();
 } else {
 this._changesStreak = 0;
 const res = await cpApiFetch('/api/data', { cache: 'no-store' });
 if (!res.ok) return;
 const text = await res.text();
 if (!text || text.trim() === "" || text === "{}") return;
 if (this._saving || this._syncEpoch !== epochAtFetch) return;
 const parsed = JSON.parse(text);
 if (!parsed || !parsed.residents) return;
 if ((Number(parsed._rev) || 0) < baseRev) return; // 古い版は無視
 const serverData = this.ensureDefaultArrays(parsed);
 if (cpJEq(serverData, this.baseObj || {})) {
 this._forcePull = false;
 this.updateSyncBadge(true);
 return;
 }
 // [Claude修正] 以前は this.data を丸ごと差し替えていたため、入力中で画面を更新しなかった場合に
 // 画面側が古いデータを持ち続け、次の保存で他端末の記録を消すことがあった。
 // 配列の参照を保ったまま、他端末の変更だけを合流する。
 const hadLocal = this._localDirty || !!this._saving;
 this.mergeRemoteData(serverData);
 this.setBase(null, this.ensureDefaultArrays(JSON.parse(text)));
 this._forcePull = false;
 this.storeLocalCopy();
 this.updateSyncBadge(true);
 // 合流後もサーバーと異なる (未送信の自分の変更がある) 場合は保存する
 if (hadLocal) this.saveToServer();
 }

 // 職員が編集中でない場合に限りビューを更新
 const activeTag = document.activeElement ? document.activeElement.tagName : "";
 if (activeTag !== "INPUT" && activeTag !== "TEXTAREA" && activeTag !== "SELECT") {
 if (typeof reloadStateFromDb === 'function') {
 reloadStateFromDb();
 }
 }
 } catch (e) {
 this.updateSyncBadge(false);
 }
 }

 updateSyncBadge(isOnline) {
 const badge = document.getElementById("syncStatusBadge");
 if (!badge) return;
 if (this.isServerMode) {
 if (isOnline) {
 badge.textContent = "施設内Wi-Fi共有中";
 badge.dataset.state = "ok";
 badge.title = "施設内Wi-Fiで他端末とリアルタイム共有中 (クリックで接続URL表示)";
 } else {
 badge.textContent = "親機サーバーと通信できません";
 badge.dataset.state = "down";
 badge.title = "親機サーバーとの通信が一時途絶しています (ローカル保存中)";
 }
 } else {
 badge.textContent = "このPCだけで動作中";
 badge.dataset.state = "local";
 badge.title = "このPC単体で動作しています (他端末共有にはサーバー起動が必要です)";
 }
 }

 renderShareModalUrls() {
 const container = document.getElementById("shareUrlList");
 if (!container) return;
 container.innerHTML = "";

 const port = this.serverPort || 8888;
 let ipsToShow = [...this.serverIPs];
 const currentHost = window.location.hostname;
 if (currentHost && currentHost !== "localhost" && currentHost !== "127.0.0.1" && !ipsToShow.includes(currentHost)) {
 ipsToShow.unshift(currentHost);
 }
 if (ipsToShow.length === 0) {
 ipsToShow.push("192.168.11.17");
 }
 const primaryIp = ipsToShow[0];
 const localUrl = `http://${primaryIp}:${port}`;

 // トンネルURL（最新取得値 または 保存値）
 let cloudflareUrl = localStorage.getItem("care_portal_tunnel_url") || (window.location.protocol === "https:" ? window.location.origin : "");
 const isTunnel = Boolean(cloudflareUrl && cloudflareUrl.trim() !== "");
 const unifiedUrl = isTunnel ? cloudflareUrl.trim() : localUrl;
 // [Claude修正] QRコードは端末内で作成する (接続URLを外部サービスへ送らない)
 const unifiedQrSvg = cpQrSvg(unifiedUrl, 130);

 // スマホ・他端末 外部接続用（統一案内 1つに統合）
 const cardDiv = document.createElement("div");
 cardDiv.style.cssText = "display:flex; gap:18px; align-items:center; background:#f6f8f6; border:2px solid #1e5b47; border-radius:12px; padding:16px 18px; box-shadow:0 3px 10px rgba(37,99,235,0.12); flex-wrap:wrap;";
 cardDiv.innerHTML = `
 <div style="flex-shrink:0; text-align:center; margin:0 auto;">
 <div class="cp-share-qr" style="width:130px; height:130px; border-radius:8px; border:2px solid #a9cfbf; background:#fff; display:block; padding:4px; box-sizing:content-box;">${unifiedQrSvg || '<span style="font-size:11px; color:#991b1b;">URLが長すぎるためQRコードを作成できません</span>'}</div>
 <span style="font-size:11px; color:#1e5b47; font-weight:bold; margin-top:5px; display:block;">カメラでスキャン</span>
 </div>
 <div style="flex:1; min-width:260px;">
 <div style="font-family:monospace; font-size:14px; font-weight:bold; color:#1a4f3d; margin-bottom:12px; word-break:break-all; background:#ffffff; padding:8px 12px; border-radius:6px; border:1px solid #c9e0d5;">
 ${unifiedUrl}
 </div>
 <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
 <button class="btn btn-primary" style="padding:7px 18px; font-size:13px; font-weight:bold; background:#1e5b47; border-color:#1e5b47;" onclick="copyShareUrl('${unifiedUrl}')">接続URLをコピー</button>
 <a href="${unifiedUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary" style="padding:7px 12px; font-size:12px; text-decoration:none; display:inline-flex; align-items:center;">ブラウザで開く</a>
 <button class="btn btn-outline" style="padding:6px 10px; font-size:12px; color:#4a5852;" onclick="promptChangeTunnelUrl()">URL変更</button>
 </div>
 ${isTunnel ? `
 <div style="margin-top:10px; padding-top:8px; border-top:1px dashed #cdd6d0; font-size:11px; color:#5f6d66; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:4px;">
 <span>同一Wi-Fi内 直接アクセス: <code style="color:#36443e;">${localUrl}</code></span>
 </div>` : ''}
 </div>
 `;
 container.appendChild(cardDiv);
 }

 initSeedData() {
 // [Antigravity修正 2026-10-30] 見本の利用者・職員・記録・ログインIDをアプリのコードから外し、空の形（配列の箱）だけを作る
 const seed = {
  residents: [],
  units: [],
  unit_logs: [],
  stamps: [],
  staff_accounts: [],
  templates: [],
  suppliers: [],
  inventory: [],
  emergency_supplies: [],
  belongings: [],
  equipments: [],
  recreations: [],
  vehicle_logs: [],
  fire_drills: [],
  committees: [],
  care_records: [],
  notebooks: [],
  notebook_stamps: [],
  vitals: [],
  excretions: [],
  meals: [],
  oral_cares: [],
  baths: [],
  meds: [],
  turns: [],
  linens: [],
  groomings: [],
  weight_records: [],
  visitations: [],
  inventory_logs: [],
  consumptions: [],
  orders: [],
  deposits: [],
  complaints: [],
  incidents: [],
  care_summaries: [],
  body_schema_pins: [],
  eyedrop_orders: [],
  prescriptions: [],
  resident_medications: [],
  billing_overrides: [],
  care_plans: [],
  shift_hope_offs: [],
  shift_ng_pairs: [],
  mc_audit_logs: [],
  host_recovery_logs: []
 };
 this.storeLocalCopy(JSON.stringify(seed));
 return this.ensureDefaultArrays(seed);
 }
}

// [Claude整理 2026-10-19] 03_common.js から移した（データの読み込み時に使うため）
// [Claude修正] 日付は日本時間 (端末のローカル時刻) で求める。
// 旧実装の toISOString() は世界標準時のため、日本時間の 0:00〜8:59 は「前日」になり、
// 「今日」ボタンや初期表示日、深夜帯の記録日付が1日ずれていた。
function toLocalDateStr(d) {
 const x = (d instanceof Date) ? d : new Date(d);
 return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}
// [Claude整理 2026-10-19] 03_common.js から移した（データの読み込み時に使うため）
function toLocalDateTimeStr(d) {
 const x = (d instanceof Date) ? d : new Date(d);
 return `${toLocalDateStr(x)} ${String(x.getHours()).padStart(2, "0")}:${String(x.getMinutes()).padStart(2, "0")}`;
}
// [Claude整理 2026-10-19] 14_auth_home.js から移した（データの読み込み時に使うため）
// 同じIDが重なっていたら、並びで先の方を残し、後の方に空いているIDを振る。空のIDは勝手に埋めない。
function cpDedupeLoginIds(accounts) {
 if (!Array.isArray(accounts)) return;
 const seen = new Set();
 accounts.forEach(a => {
  if (!a) return;
  const k = String(a.staff_id || "").trim().toLowerCase();
  if (!k) return;
  if (seen.has(k)) { a.staff_id = cpNextFreeLoginId(accounts.filter(x => x !== a)); }
  seen.add(String(a.staff_id).trim().toLowerCase());
 });
}
// [Claude整理 2026-10-19] 14_auth_home.js から移した（データの読み込み時に使うため）
// [Claude追加 2026-10-18] 空いているログインID（aaaa, bbbb, … yyyyy。zzzz は最初の入口 MC の予約のため除外）
function cpNextFreeLoginId(accounts) {
 const used = new Set((accounts || []).map(a => String((a && a.staff_id) || "").trim().toLowerCase()));
 used.add("zzzz");
 for (let len = 4; len < 10; len++) {
  for (let c = 0; c < 26; c++) {
   const id = String.fromCharCode(97 + c).repeat(len);
   if (!used.has(id)) return id;
  }
 }
 return "staff" + Date.now().toString(36).replace(/[0-9]/g, x => String.fromCharCode(97 + Number(x)));
}

// [Antigravity追加 2026-10-30] 最初の入口（MC）の閉じる条件の判定
// 管理者・事務員の判定は isStaffAdminOrClerk と同じ見方で行う:
//   管理者: 管理者|施設長|所長|ホーム長|院長|理事
//   事務員: 事務（「事務員 (パート)」を含む）
// 閉じる条件: 管理者と事務員を合わせて3人以上そろい、そのうち管理者1人以上・事務員1人以上
function cpIsAdminRoleText(role) {
 return /管理者|施設長|所長|ホーム長|院長|理事/.test(String(role || ""));
}
function cpIsClerkRoleText(role) {
 return /事務/.test(String(role || ""));
}
function cpGetMcRoleCounts(data) {
 const d = data || (typeof db !== "undefined" && db && db.data) || {};
 const stamps = Array.isArray(d.stamps) ? d.stamps : [];
 const accounts = Array.isArray(d.staff_accounts) ? d.staff_accounts : [];
 let adminCount = 0;
 let clerkCount = 0;
 stamps.forEach(st => {
  if (!st || typeof st !== "object") return;
  if (st.status === "休止中") return;
  const nm = String(st.name || "").trim();
  if (!nm) return;
  const acc = accounts.find(a => a && a.staff_name === nm);
  if (!acc || !String(acc.staff_id || "").trim()) return;
  if (typeof db !== "undefined" && db && !db.isServerMode) {
   if (!String(acc.password || "").trim()) return;
  }
  const role = String(st.role || "");
  if (cpIsAdminRoleText(role)) adminCount++;
  else if (cpIsClerkRoleText(role)) clerkCount++;
 });
 const totalAdminClerk = adminCount + clerkCount;
 const closed = (adminCount >= 1 && clerkCount >= 1 && totalAdminClerk >= 3);
 return { adminCount, clerkCount, totalAdminClerk, closed };
}
function cpIsMcClosed(data) {
 return cpGetMcRoleCounts(data).closed;
}

// データベースインスタンスの生成
const db = new LocalDB();

// グローバル状態
let gState = {
 residents: db.data.residents,
 inventory: db.data.inventory,
 suppliers: db.data.suppliers,
 stamps: db.data.stamps,
 templates: db.data.templates,
 recreations: db.data.recreations,
 emergencySupplies: db.data.emergency_supplies,
 care_summaries: db.data.care_summaries,
 care_plans: db.data.care_plans || [], // [Antigravity実装 2026-10-19]
 body_schema_pins: db.data.body_schema_pins || [],
 schemaResidentId: 1,
 eyedrop_orders: db.data.eyedrop_orders || [],
 medTimingFilter: "all",
 selectedResidentId: 1,
 selectedDate: toLocalDateStr(new Date()),
 currentMonth: toLocalDateStr(new Date()).slice(0, 7),
 activePortal: "care",
 activeCareTab: "record",
 activeOfficeTab: "inventory",
 currentShiftMonth: toLocalDateStr(new Date()).slice(0, 7),
 recordScope: "today",
 showDailyScheduleDemo: false // [Antigravity実装 2026-10-16]
};
