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
 committees: { label: "委員会・研修記録", render: () => renderOfficeCommittees() }
};

function cpLedgerStaff() {
 return (document.getElementById("currentStaff")?.value) || gState.currentStaff || "担当職員";
}

function cpVoidLedgerRecord(key, id) {
 const conf = CP_LEDGERS[key];
 const rec = (db.data[key] || []).find(x => Number(x.id) === Number(id));
 if (!conf || !rec || rec.voided) return;
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
 "units", "unit_logs", "settings_logs", "contract_docs", "contract_doc_types", "billing_overrides"
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
 // [Claude修正] ログイン用アカウントは、職員マスタ (stamps) から全端末で同じ内容になるよう生成する。
 // 旧実装は各端末がログイン時にばらばらに作成していたため、ある端末でID・パスワードを変更しても、
 // 別の端末の保存で初期値 (aaaa/0000) に戻されることがあった。職員名をIDにして1件ずつ合流できるようにする。
 if (!Array.isArray(d.staff_accounts)) d.staff_accounts = [];
 d.staff_accounts.forEach(a => { if (a && a.staff_name && !a.id) a.id = a.staff_name; });
 (Array.isArray(d.stamps) ? d.stamps : []).forEach(st => {
 const nm = (st && st.name) ? st.name : st;
 if (!nm || typeof nm !== "string") return;
 if (!d.staff_accounts.some(a => a && a.staff_name === nm)) {
 d.staff_accounts.push({ id: nm, staff_name: nm, staff_id: "aaaa", password: "0000", is_custom: false, updated_at: "" });
 }
 });
 if (!d.night_turn_templates || typeof d.night_turn_templates !== "object") {
 d.night_turn_templates = Object.assign({}, DEFAULT_NIGHT_TURN_TEMPLATES);
 }
 // [Claude修正] 空のときに見本データ（架空の記録・指示）を本番のデータへ書き込んでいたのをやめる
 if (!Array.isArray(d.care_summaries)) d.care_summaries = [];
 // [Claude修正] 空のときに見本データ（架空の記録・指示）を本番のデータへ書き込んでいたのをやめる
 if (!Array.isArray(d.body_schema_pins)) d.body_schema_pins = [];
 if (Array.isArray(d.stamps)) {
 const nameMap = {
 "施設長": "木村 健一",
 "木村": "木村 健一",
 "田中": "田中 慎一",
 "鈴木": "鈴木 美智子",
 "山田": "山田 孝之",
 "佐藤": "佐藤 健太",
 "高橋": "高橋 直樹",
 "伊藤": "伊藤 翔太",
 "渡辺": "渡辺 拓也",
 "中村": "中村 大輔",
 "小林": "小林 亮"
 };
 // 既存の短縮名をフルネームに置換
 d.stamps.forEach(s => {
 const curName = s.name || s;
 if (nameMap[curName]) {
 s.name = nameMap[curName];
 }
 });

 // 15名フルネーム体制の定義
 const fullStaffDefaults = [
 { name: "木村 健一", role: "管理者" },
 { name: "鈴木 美智子", role: "主任看護師" },
 { name: "加藤 由美", role: "看護師" },
 { name: "山田 孝之", role: "介護リーダー" },
 { name: "佐藤 健太", role: "介護職員" },
 { name: "高橋 直樹", role: "介護職員" },
 { name: "伊藤 翔太", role: "介護職員" },
 { name: "渡辺 拓也", role: "介護職員" },
 { name: "中村 大輔", role: "介護職員" },
 { name: "小林 亮", role: "介護職員" },
 { name: "斉藤 翼", role: "介護職員" },
 { name: "吉田 誠", role: "介護職員" },
 { name: "清水 翔平", role: "介護職員" },
 { name: "田中 慎一", role: "事務員" },
 { name: "松本 陽子", role: "事務員" }
 ];
 fullStaffDefaults.forEach(s => {
 if (!d.stamps.some(existing => (existing.name || existing) === s.name)) {
 d.stamps.push(s);
 }
 });
 d.stamps = sortStaffList(d.stamps);
 }

 if (!d.monthly_shifts || typeof d.monthly_shifts !== "object") {
 d.monthly_shifts = {};
 }
 if (!Array.isArray(d.shift_hope_offs)) {
  d.shift_hope_offs = [
   { id: 1, year_month: "2026-10", staff_name: "佐藤 健太", day: 15, reason: "通院のため" },
   { id: 2, year_month: "2026-10", staff_name: "小林 誠", day: 25, reason: "冠婚葬祭" },
   { id: 3, year_month: "2026-10", staff_name: "渡辺 拓也", day: 8, reason: "家族行事" }
  ];
 }
 if (!Array.isArray(d.shift_ng_pairs)) {
 d.shift_ng_pairs = [
 { id: 1, staff1: "佐藤 健太", staff2: "高橋 直樹", reason: "相性配慮 (同日夜勤NG)" }
 ];
 } else {
 // 既存の短縮名をフルネームに更新
 d.shift_ng_pairs.forEach(p => {
 if (p.staff1 === "佐藤") p.staff1 = "佐藤 健太";
 if (p.staff1 === "高橋") p.staff1 = "高橋 直樹";
 if (p.staff2 === "佐藤") p.staff2 = "佐藤 健太";
 if (p.staff2 === "高橋") p.staff2 = "高橋 直樹";
 });
 }

 // 消耗品マスター・アイテム同期＆移行 (手袋S/L追加、尿取りパッド名称統一、ワイドパッド追加)
 if (Array.isArray(d.inventory)) {
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
 b.title = `${timeStr} に親機PCへ保存し、data/backup/ にもバックアップしました（USBへの保存は手動です）`;
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
 // サーバーが空ならローカル初期データをサーバーへ初回登録
 // [Claude修正] 端末に控えを持たないので、初回 (デモ) の見本データはここで作る
 if (!Array.isArray(this.data.residents) || this.data.residents.length === 0) {
 this.data = this.initSeedData();
 }
 this.hasSyncedWithServer = true;
 await this.saveToServer();
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
 const today = new Date();
 const todayStr = toLocalDateStr(today);
 const nowStr = `${todayStr} ${today.toTimeString().slice(0, 5)}`;

 const seed = {
 residents: [
 { id: 1, unit_id: 1, name: "佐藤 太郎", room_no: "101", care_level: "要介護3", status: "在所", birth_date: "1940-10-15", policy_stamp: "看取り", sensor_alert: " 離床センサーマット使用中 (ベッド脇)", emergency_contact: "長男: 佐藤 一郎 (090-1111-2222)", family_wishes: "本人が穏やかに過ごせるようにお願いします。", life_history: "元大工職人。相撲観戦が大好き。頑固だが笑顔が優しい。", paralysis: "右片麻痺 (移乗・歩行の介助は麻痺側（右）の後方から)", allergies: "卵アレルギー", diet_type: "普通食 (一口大)", oral_state: "上部義歯 (下残歯あり)", diseases: "糖尿病, 高血圧, 脳梗塞後遺症", care_plan_goal: "歩行器での安全な移動。食事時のむせ込み予防。", dr_instructions: "次回採血予定。低血糖症状に留意。", next_clinic_date: "2026-10-14", care_expiry_date: "2026-11-15", deposit_balance: 35000 },
 { id: 2, unit_id: 1, name: "田中 ハナ", room_no: "102", care_level: "要介護2", status: "在所", birth_date: "1938-11-20", policy_stamp: "緊急搬送", sensor_alert: " ナースコール常時手元配置", emergency_contact: "長女: 田中 美咲 (090-3333-4444)", family_wishes: "足元の冷えを気にするので温かくしてください。", life_history: "元教員。読書と手芸が趣味。几帳面な性格。", paralysis: "麻痺なし (膝痛あり)", allergies: "なし", diet_type: "軟飯・一口刻み", oral_state: "総義歯", diseases: "心不全, 高血圧", care_plan_goal: "下肢の浮腫チェック。水分管理 (1日1200ml程度)。", dr_instructions: "利尿剤の継続。体重増加時は連絡。", next_clinic_date: "2026-10-07", care_expiry_date: "2026-10-25", deposit_balance: 28000 },
 { id: 3, unit_id: 2, name: "鈴木 一郎", room_no: "103", care_level: "要介護3", status: "在所", birth_date: "1935-02-15", policy_stamp: "看取り", sensor_alert: " 離床・転倒防止センサーマット (ベッド脇・端座位見守り)", emergency_contact: "妻: 鈴木 和子 (090-5555-6666)", family_wishes: "できるだけ居室で静かに休ませてあげてください。", life_history: "元農業。穏やかな性格。家族思い。", paralysis: "左片麻痺 (端座位保持可・移乗軽介助)", allergies: "そばアレルギー", diet_type: "やわらか食 (舌でつぶせる・とろみでまとめる)", oral_state: "残歯のみ", diseases: "パーキンソン病, 嚥下障害, 誤嚥性肺炎既往", care_plan_goal: "ベッド上での安定した端座位保持を活かし、介助による車椅子移乗・離床機会の確保。残存機能の維持と誤嚥予防。", dr_instructions: "抗パーキンソン薬の定時内服厳守。", next_clinic_date: "2026-10-20", care_expiry_date: "2027-04-30", deposit_balance: 42000 },
 { id: 4, unit_id: 2, name: "高橋 トメ", room_no: "105", care_level: "要介護1", status: "入院中", birth_date: "1942-08-01", policy_stamp: "緊急搬送", sensor_alert: "特記なし", emergency_contact: "長男: 高橋 健 (090-7777-8888)", family_wishes: "退院時期が決まったらすぐ連絡します。", life_history: "元商店経営。明るく社交的。", paralysis: "麻痺なし", allergies: "なし", diet_type: "普通食", oral_state: "総義歯", diseases: "骨粗鬆症", care_plan_goal: "転倒予防の見守り。", dr_instructions: "大腿骨経過観察中。", next_clinic_date: "2026-10-10", care_expiry_date: "2027-01-15", deposit_balance: 15000 }
 ],
 // [Claude修正] 区分（ユニット・フロア）の見本。名前は事務ポータル「区分の設定」で自由に変えられる
 units: [{ id: 1, name: "東棟", order: 1 }, { id: 2, name: "西棟", order: 2 }],
 unit_logs: [],
 // [Claude修正] 職員22名（2ユニット）。役職・担当の区分・資格はアンチさんのデータに合わせた
 stamps: [
 { name: "木村 健一", role: "管理者", qualifications: "社会福祉主事・介護福祉士・認知症対応型サービス事業管理者研修修了", employment_type: "常勤", duty_type: "日勤専従" },
 { name: "佐々木 浩二", role: "生活相談員", qualifications: "社会福祉士・介護福祉士", employment_type: "常勤", duty_type: "日勤専従" },
 { name: "小林 恵子", role: "計画作成担当者（ケアマネ）", qualifications: "介護支援専門員・介護福祉士・認知症介護実践者研修修了", employment_type: "常勤", duty_type: "日勤専従" },
 { name: "鈴木 美智子", role: "主任看護師", qualifications: "看護師 (正看護師)", employment_type: "常勤", duty_type: "日勤専従" },
 { name: "加藤 由美", role: "看護師", qualifications: "看護師 (正看護師)", employment_type: "常勤", duty_type: "日勤専従" },
 { name: "山田 孝之", role: "ユニットリーダー", unit_id: 1, qualifications: "介護福祉士", employment_type: "常勤", duty_type: "交替勤務" },
 { name: "吉田 誠", role: "ユニットリーダー", unit_id: 2, qualifications: "介護福祉士", employment_type: "常勤", duty_type: "交替勤務" },
 { name: "伊藤 翔太", role: "介護職員", unit_id: 1, qualifications: "介護福祉士", employment_type: "常勤", duty_type: "交替勤務" },
 { name: "井上 蓮", role: "介護職員", unit_id: 1, qualifications: "実務者研修", employment_type: "常勤", duty_type: "交替勤務" },
 { name: "高橋 直樹", role: "介護職員", unit_id: 1, qualifications: "介護福祉士", employment_type: "常勤", duty_type: "交替勤務" },
 { name: "佐藤 健太", role: "介護職員", unit_id: 1, qualifications: "介護福祉士", employment_type: "常勤", duty_type: "交替勤務" },
 { name: "小林 亮", role: "介護職員", unit_id: 1, qualifications: "初任者研修", employment_type: "常勤", duty_type: "交替勤務" },
 { name: "松田 健二", role: "介護職員", unit_id: 1, qualifications: "介護福祉士", employment_type: "常勤", duty_type: "交替勤務" },
 { name: "清水 翔平", role: "介護職員", unit_id: 1, qualifications: "実務者研修", employment_type: "常勤", duty_type: "交替勤務" },
 { name: "斉藤 翼", role: "介護職員", unit_id: 2, qualifications: "介護福祉士", employment_type: "常勤", duty_type: "交替勤務" },
 { name: "石川 太陽", role: "介護職員", unit_id: 2, qualifications: "初任者研修", employment_type: "常勤", duty_type: "交替勤務" },
 { name: "中村 大輔", role: "介護職員", unit_id: 2, qualifications: "介護福祉士", employment_type: "常勤", duty_type: "交替勤務" },
 { name: "渡辺 拓也", role: "介護職員", unit_id: 2, qualifications: "実務者研修", employment_type: "常勤", duty_type: "交替勤務" },
 { name: "野村 拓海", role: "介護職員", unit_id: 2, qualifications: "介護福祉士", employment_type: "常勤", duty_type: "交替勤務" },
 { name: "三浦 拓也", role: "介護職員", unit_id: 2, qualifications: "介護福祉士", employment_type: "常勤", duty_type: "交替勤務" },
 { name: "松本 陽子", role: "事務員", qualifications: "医療事務・日商簿記", employment_type: "常勤", duty_type: "日勤専従" },
 { name: "田中 慎一", role: "事務員 (パート)", qualifications: "普通自動車免許", employment_type: "非常勤 (パート)", duty_type: "日勤専従" }
 ],

 templates: [
 { category: "巡視", label: "安眠中", phrase: "訪室確認。安眠中。呼吸状態安定。" },
 { category: "巡視", label: "左側臥位", phrase: "確認のため訪室。左側臥位にて入眠中。" },
 { category: "巡視", label: "ナースコール対応", phrase: "ナースコールあり訪室。排泄介助実施。" },
 { category: "食事", label: "全量摂取", phrase: "主食・副食ともに全量摂取。むせ込みなし。" },
 { category: "排泄", label: "普通便中量", phrase: "トイレ誘導にて排尿あり。普通便中等量排便あり。" },
 { category: "入浴", label: "軟膏塗布", phrase: "一般浴実施。背部・両下腿に保湿軟膏塗布。皮膚状態異常なし。" }
 ],
 suppliers: [
 { id: 1, name: "ケアサポート商事", phone: "03-1234-5678", contact_person: "佐々木", items: [
 { name: "テープ止めオムツ L", unit_price: 2600, unit: "パック" },
 { name: "テープ止めオムツ M", unit_price: 2400, unit: "パック" },
 { name: "尿取りパッド", unit_price: 1400, unit: "パック" },
 { name: "ワイドパッド", unit_price: 1600, unit: "パック" },
 { name: "使い捨てプラスチック手袋 S", unit_price: 650, unit: "箱" },
 { name: "使い捨てプラスチック手袋 M", unit_price: 650, unit: "箱" },
 { name: "使い捨てプラスチック手袋 L", unit_price: 650, unit: "箱" }
 ]},
 { id: 2, name: "メディカル薬品", phone: "03-9876-5432", contact_person: "木村", items: [
 { name: "ヒルドイドソフト軟膏 100g", unit_price: 1800, unit: "本" },
 { name: "手指消毒用アルコール 1L", unit_price: 1200, unit: "本" },
 { name: "とろみ調整剤 1kg", unit_price: 2800, unit: "袋" }
 ]}
 ],
 inventory: [
 { id: 1, name: "テープ止めオムツ L", category: "オムツ・パッド", current_stock: 2, safety_stock: 5, normal_stock: 10, unit: "パック", unit_price: 2600, is_personal_billable: 1, supplier_id: 1, supplier_name: "ケアサポート商事" },
 { id: 2, name: "テープ止めオムツ M", category: "オムツ・パッド", current_stock: 8, safety_stock: 5, normal_stock: 10, unit: "パック", unit_price: 2400, is_personal_billable: 1, supplier_id: 1, supplier_name: "ケアサポート商事" },
 { id: 3, name: "尿取りパッド", category: "オムツ・パッド", current_stock: 3, safety_stock: 6, normal_stock: 12, unit: "パック", unit_price: 1400, is_personal_billable: 1, supplier_id: 1, supplier_name: "ケアサポート商事" },
 { id: 4, name: "ワイドパッド", category: "オムツ・パッド", current_stock: 4, safety_stock: 5, normal_stock: 10, unit: "パック", unit_price: 1600, is_personal_billable: 1, supplier_id: 1, supplier_name: "ケアサポート商事" },
 { id: 5, name: "使い捨てプラスチック手袋 S", category: "衛生用品", current_stock: 12, safety_stock: 8, normal_stock: 16, unit: "箱", unit_price: 650, is_personal_billable: 0, supplier_id: 1, supplier_name: "ケアサポート商事" },
 { id: 6, name: "使い捨てプラスチック手袋 M", category: "衛生用品", current_stock: 15, safety_stock: 10, normal_stock: 20, unit: "箱", unit_price: 650, is_personal_billable: 0, supplier_id: 1, supplier_name: "ケアサポート商事" },
 { id: 7, name: "使い捨てプラスチック手袋 L", category: "衛生用品", current_stock: 10, safety_stock: 8, normal_stock: 16, unit: "箱", unit_price: 650, is_personal_billable: 0, supplier_id: 1, supplier_name: "ケアサポート商事" },
 { id: 8, name: "手指消毒用アルコール 1L", category: "消毒", current_stock: 4, safety_stock: 3, normal_stock: 8, unit: "本", unit_price: 1200, is_personal_billable: 0, supplier_id: 2, supplier_name: "メディカル薬品" },
 { id: 9, name: "とろみ調整剤 1kg", category: "食事関連", current_stock: 6, safety_stock: 4, normal_stock: 10, unit: "袋", unit_price: 2800, is_personal_billable: 1, supplier_id: 2, supplier_name: "メディカル薬品" }
 ],
 emergency_supplies: [
 { id: 1, name: "保存水 2L (6本入)", quantity: 30, unit: "箱", expiry_date: "2028-09-30", notes: "地下備蓄庫" },
 { id: 2, name: "アルファ米 白飯 50食", quantity: 10, unit: "箱", expiry_date: "2026-10-10", notes: "賞味期限間近・おやつ等で順次消費推奨" },
 { id: 3, name: "缶詰パン チョコ味", quantity: 40, unit: "缶", expiry_date: "2027-03-31", notes: "1階備蓄庫" }
 ],
 belongings: [
 { id: 1, resident_id: 1, category: "衣類・日用品", item_name: "長袖シャツ", quantity: "5枚", marked: 1, notes: "全品記名あり" },
 { id: 2, resident_id: 1, category: "衣類・日用品", item_name: "ズボン", quantity: "4本", marked: 1, notes: "ウエストゴム" },
 { id: 3, resident_id: 1, category: "家具・家電・私物", item_name: "液晶テレビ 24型", quantity: "1台", marked: 1, notes: "居室テレビ台設置" },
 { id: 4, resident_id: 2, category: "衣類・日用品", item_name: "カーディガン", quantity: "3着", marked: 1, notes: "娘様持参品" }
 ],
 equipments: [
 { id: 1, resident_id: 1, equipment_name: "標準自走式車椅子", ownership_type: "施設備品", notes: "ノーパンクタイヤ" },
 { id: 2, resident_id: 1, equipment_name: "エアマット (ここちあ)", ownership_type: "個人レンタル", notes: "床ずれ防止用・介護保険レンタル" },
 { id: 3, resident_id: 2, equipment_name: "歩行器 (四輪)", ownership_type: "施設備品", notes: "歩行訓練用" }
 ],
 recreations: [
 { id: 1, date: "2026-09-28", title: "風船バレー大会", content: "1階食堂にて開催。参加12名。大いに盛り上がる。", staff_name: "山田" },
 { id: 2, date: "2026-09-29", title: "秋の歌 音楽療法", content: "紅葉、赤とんぼ等の合唱。鈴やカスタネット演奏。", staff_name: "佐藤" }
 ],
 vehicle_logs: [
 { id: 1, date: "2026-09-29", vehicle_name: "キャラバン1号", driver_name: "山田", purpose: "佐藤様・田中様 眼科受診送迎", start_km: 14520, end_km: 14535, distance_km: 15, key_returned: 1, notes: "給油なし・異常なし" }
 ],
 fire_drills: [
 { id: 1, date: "2026-05-20", drill_type: "昼間想定 避難・消火訓練", participants_count: 14, scenario: "1階厨房からの出火想定。全員避難完了タイム4分12秒。", notes: "消火器放射訓練実施。", supervisor: "施設長" }
 ],
 committees: [
 { id: 1, date: "2026-09-15", committee_name: "身体拘束廃止委員会", attendees: "施設長、山田、鈴木、田中", agenda: "スピーチロックの防止とセンサーマット適切な使用", content: "不要な拘束ゼロの継続確認。各ケース検討。" }
 ],
 care_records: [
 { id: 1, recorded_at: nowStr, resident_id: 1, category: "バイタル", content: "体温 37.8度。少し悪寒の訴えあり。水分補給を促しクーリング実施。", staff_name: "山田" },
 { id: 2, recorded_at: nowStr, resident_id: 2, category: "特変", content: "居室にて立ち上がり時にふらつきあり。転倒はなし。見守りを強化。", staff_name: "佐藤" }
 ],
 notebooks: [
 { id: 1, date: todayStr, category: "特変申し送り", content: "佐藤様 14:00頃 体温37.8度の発熱あり。夕方の検温と水分摂取に要留意。", status: "未対応", staff_name: "山田", resolved_staff: null },
 { id: 2, date: todayStr, category: "依頼事項", content: "田中様のご家族より面会時に靴下の差し入れ預かり。居室へ保管済。", status: "完了", staff_name: "佐藤", resolved_staff: "佐藤" }
 ],
 notebook_stamps: [
 { date: todayStr, staff_name: "山田" }
 ],
 vitals: [],
 excretions: [],
 meals: [],
 oral_cares: [],
 baths: [],
 meds: [],
 turns: [],
 linens: [],
 groomings: [],
 weight_records: [
 { id: 101, date: "2026-08-15", month: "2026-08", resident_id: 1, weight: 52.2, diff_prev: "+0.1kg", staff_name: "山田" },
 { id: 102, date: "2026-08-15", month: "2026-08", resident_id: 2, weight: 46.0, diff_prev: "-0.2kg", staff_name: "佐藤" },
 { id: 103, date: "2026-08-15", month: "2026-08", resident_id: 3, weight: 58.5, diff_prev: "±0.0kg", staff_name: "鈴木" },
 { id: 104, date: "2026-08-15", month: "2026-08", resident_id: 4, weight: 43.8, diff_prev: "-0.4kg", staff_name: "山田" }
 ],
 visitations: [],
 inventory_logs: [],
 consumptions: [],
 orders: [],
 deposits: [],
 complaints: [],
    incidents: [
      {
        id: 1,
        report_type: "ヒヤリハット",
        occurred_at: "2026-10-07 22:15",
        resident_id: 1,
        place: "居室 (ベッドサイド)",
        situation: "夜間巡回時、離床センサーマットのコール発報あり直ちに居室へ急行。佐藤様がトイレへ行こうとベッド柵を外し、歩行器を使わずに立ち上がり独歩しようとしてバランスを崩しかけていたところを、職員が背後から支えて介助。転倒・外傷はなく、そのまま歩行器を使用したトイレ誘導を行い、排泄後安全にベッドへ戻られた。",
        cause: "【利用者要因】歩行機能が回復してきたことで「自分一人でも歩ける」という過信が生じていた。夜間の覚醒直後で覚醒度が十分でなく、歩行器の使用手順を失念していた。\n【環境・ケア要因】就寝時に歩行器がベッドから少し離れた位置（約1.5m）に置かれており、手の届く範囲になかった。",
        prevention: "1. 就寝時、歩行器は必ずベッド柵の開口部すぐ横（手の届く定位置）に配置し、ブレーキロックを徹底する。\n2. 離床センサーマットの感度・敷設位置を再点検し、端座位になった時点で早期覚知できるようにする。\n3. 日常の声かけとして「夜間トイレの際は必ずナースコールを押してください」「歩行器を使って職員と一緒に行きましょう」と繰り返し穏やかに伝える。",
        supervisor_comment: "離床センサーへの迅速な初動対応により転倒を未然に防止できた良好な対応。歩行自立度が上がっている時期こそ転倒リスクが高まるため、職員間の申し送りで歩行器の定位置管理を徹底し、夜勤帯の巡視タイミングにも留意すること。（管理者：木村 健一）",
        status: "承認済",
        staff_name: "山田 孝之 (ユニットリーダー)",
        injury_pins: []
      },
      {
        id: 2,
        report_type: "事故報告",
        occurred_at: "2026-10-08 12:10",
        resident_id: 1,
        place: "食堂・デイルーム",
        situation: "昼食終了後、食堂椅子から車椅子へ移乗介助を行う際、車椅子の右フットサポート（足載せ台）の跳ね上げ確認が不十分であったため、佐藤様の右下腿前側がフットサポートの金属フレーム部に軽く接触。右下腿に約1.5cmの擦り傷（少量の出血）ができた。直ちに主任看護師（鈴木）に報告し、看護師が傷の処置を行った（処置の内容は看護記録）。痛みの訴えはなく、バイタルサインも安定（BP 126/74, P 66）。往診医（ひだまり内科・田中医師）へ電話報告の上、長男様（佐藤 一郎様）へ電話にて事故状況・処置・謝罪の報告を実施し、了承を得た。",
        cause: "【職員要因】昼食後の移乗が重なる時間帯で焦りが生じ、車椅子移乗の基本動作である「左右両側のフットサポート跳ね上げ確認」「ブレーキ確実確認」の指差し確認を怠っていた。\n【環境・利用者要因】皮膚が乾燥しやすく、軽く当たっただけでも傷ができやすい状態であった。",
        prevention: "1. 車椅子移乗時は、必ずフットサポートを完全に外側へ跳ね上げたことを目視・指差し確認してから移乗動作に入ることを介助手順として再徹底する。\n2. 皮膚の脆弱性に対し、日頃の保湿ケアの継続（看護師の指示に従う）に加え、移乗・移動時のレッグウォーマーや保護サポーターの着用を検討する。\n3. 看護師の指示に基づき、創部の経過観察（発赤・腫脹・浸出液の有無）を日勤・夜勤の申し送りで共有し、毎日の創傷処置記録に残す。",
        supervisor_comment: "初動の看護師連携・創部処置・主治医およびご家族への即時連絡は適切に行われた。しかし、フットサポートの跳ね上げ確認という基本手順の省略が直接原因であり重大に受け止める。全介護職員を対象に移乗動作の安全点検カンファレンスを緊急開催し、指差し確認の徹底を指導した。（管理者：木村 健一）",
        status: "承認済",
        staff_name: "伊藤 翔太 (介護職員)",
        injury_pins: [
          {
            id: 1,
            site_name: "右下腿前面",
            injury_type: "擦り傷 (約1.5cm)",
            severity: "軽度",
            treatment: "看護師が処置（内容は看護記録）。バイタル確認、往診医へ報告、長男様へ電話報告。",
            notes: "出血は少量ですぐ止まった。痛み・腫れの訴えなし。経過は看護師が確認。",
            x_pct: 35.0,
            y_pct: 78.0
          }
        ]
      },
      {
        id: 3,
        report_type: "ヒヤリハット",
        occurred_at: "2026-10-06 08:20",
        resident_id: 2,
        place: "食堂 (朝食配薬時)",
        situation: "朝食後の服薬介助時、田中 ハナ 様の席へ別の方の薬袋を誤って手渡してしまった。直後に隣席の利用者からお茶をこぼしたとの訴えがあり視線を外して対応に入ったが、ふと手渡した薬袋の氏名相違（渡す相手を取り違えていたこと）に気がつき直ちに田中様のお席へ戻ったところ、田中様が薬包を開封し口へ運ぼうとされている寸前であったため、「田中様、少々お待ちください！」とお声がけして直前で制止・回収した。田中様ご本人の薬袋を、顔を見て氏名・日付・何食のお薬かを読み上げて確認した上で内服を完了。誤薬・内服には至らず、健康被害なし。",
        cause: "【職員要因】朝の配膳・下膳と配薬が重なる繁忙帯で、手元に複数名分の薬袋を持ったまま配薬を行っていた。さらに「利用者の顔を見て、氏名・日付・何食のお薬かを声出し確認し、飲み終えるまでその場で見届ける」という基本手順を怠り、手渡した直後に他利用者の訴えに気を取られ、内服確認を完了させずにその場を離れてしまった。\n【環境要因】朝食後の離床・下膳と服薬が同時進行する時間帯における職員間の役割分担が不明確であった。",
        prevention: "1. 配薬の鉄則である「1人ずつ薬袋を手に取り、相手の顔を見て氏名・日付・何食のお薬かを声に出して読み上げ確認し、確実に飲み終えるまでその場を離れず見届ける（手渡し放置の絶対禁止）」を徹底する。\n2. 配薬中に他利用者からのコールや訴えがあった場合、手元の配薬を一時中断して薬を回収するか、近くの他職員へ対応を依頼し、服薬介助中の職員は目の前の利用者の内服完了まで絶対に目を離さない。\n3. 配薬時は複数人分の薬袋を同時に持ち歩かず、ワゴンから1名分ずつ取り出して配薬する。",
        supervisor_comment: "内服直前での制止により誤薬事故（重大インシデント）を水際で回避できたが、手渡し後に確認・見届けを完了せず他対応に移ったことは極めて危険な行為。服薬介助は「1人ずつ・対面読み上げ確認・最後まで見届ける」を全職員で再徹底し、朝の配薬時間帯はコール対応と配薬担当の役割分担を明確にすること。（主任看護師：鈴木 美智子）",
        status: "承認済",
        staff_name: "小林 亮 (介護職員)",
        injury_pins: []
      }
    ],

 // [Claude修正] 見本データは、初めて起動したデモのときだけ入れる（既存のデータには書き込まない）
 care_summaries: [
 {
 id: 1,
 resident_id: 1,
 created_at: "2026-10-01",
 updated_at: "2026-10-01",
 staff_name: "山田 孝之",
 summary_type: "新規入所時サマリー",
 basic_info: "要介護3。生年月日: 1940-10-15 (85歳)。キーパーソン: 長男・佐藤 一郎様 (090-1111-2222)。認知症高齢者の日常生活自立度IIb。障害高齢者の日常生活自立度B1。",
 background: "自宅にて長男家族と同居していたが、2026年8月に自宅内で転倒し右大腿骨頸部骨折。急性期病院にて骨接合術施行。リハビリ継続の上、在宅介護困難となり当施設へ新規入所。",
 physical_cognitive: "右股関節可動域制限・右下肢軽度筋力低下あり。歩行時にすり足・ふらつき認める。短期記憶の低下あるが、見当識はおおむね保たれており穏やかに意思疎通可能。",
 adl: "寝返り・起き上がり自立。立ち上がり・車椅子移乗は見守り・一部軽介助。歩行器歩行にて20m程度自立移動可能。更衣・整容は一部介助（ボタン留め・靴下着脱等）。入浴は一般浴にて洗身・洗髪見守り介助。",
 meals_hydration: "普通食 (一口大)。スプーンおよび箸使用にて自力摂取可能（むせ込み見守り）。水分目標量1,200ml/日。下顎軽度引き気味での嚥下を声かけ。",
 excretion: "日中はトイレ誘導にて排尿自立・見守り。夜間はリハビリパンツ＋尿取りパッド使用。定時声かけにて失禁ほぼなし。便秘傾向のため水分摂取促す。",
 sleep: "21:00就寝、6:00起床。夜間1〜2回トイレ覚醒あり。中途覚醒時は転倒注意のため離床センサーマット使用。声かけにて再入眠良好。",
 meds: "降圧薬・血糖降下薬内服中。朝・夕食後。看護師・介護職員による配薬・服薬確認にて全量自己内服。",
 medical_care: "毎日のバイタルチェック（血圧・体温・脈拍・SpO2）。褥瘡・皮膚剥離なし。保湿剤塗布継続。",
 dementia_behavior: "夕方時に「そろそろ帰らないと」と帰宅願望が時折出現。お茶を勧め、大工職人時代の仕事や大相撲の話題を傾聴することで落ち着かれる。",
 care_notes: "急がせる声かけは焦りを生み転倒リスクとなるため、ゆっくりとしたペースで対応する。声かけは気づきやすい左側（健側）から、移乗・歩行の介助は麻痺側（右）の後方から行う。大工道具や相撲の話題を好まれる。",
 family_info: "長男様が週1回程度面会来訪。何かあれば長男様へ連絡希望。看取り方針については自然な経過での見守りを希望（施設での看取り・DNAR合意済）。",
 future_goals: "歩行器による安全な自立歩行を維持し、転倒防止を図る。食事摂取量を維持し低血糖・脱水を予防。他入所者とのレクリエーション参加を促す。"
 },
 {
 id: 2,
 resident_id: 4,
 created_at: "2026-10-02",
 updated_at: "2026-10-02",
 staff_name: "鈴木 美智子",
 summary_type: "入院後再入所サマリー",
 basic_info: "要介護1。生年月日: 1942-08-01 (84歳)。キーパーソン: 長男・高橋 健様 (090-7777-8888)。現在一時入院中（大腿骨経過観察・点滴加療）。退院復帰予定。",
 background: "骨粗鬆症の治療および精査のため協力病院へ一時入院。病状軽快に伴い再入所調整中。",
 physical_cognitive: "四肢麻痺なし。軽度認知機能低下あるが会話明瞭。歩行器使用にて自立歩行可能。",
 adl: "移動・更衣・排泄自立。入浴時見守り。立ち上がり時のふらつき予防。",
 meals_hydration: "普通食全量摂取。むせ込みなし。水分摂取良好。",
 excretion: "トイレ排泄自立。夜間念のためパッド使用。",
 sleep: "睡眠良好。夜間覚醒時も自力トイレ歩行可能。",
 meds: "骨粗鬆症治療薬・ビタミン剤内服。",
 medical_care: "特別な医療処置なし。定期受診・骨密度測定フォロー。",
 dementia_behavior: "目立ったBPSDなし。明るく社交的。",
 care_notes: "活動的なため無理な早歩きによる転倒に留意。適度な休憩を促す。",
 family_info: "長男様がこまめに連絡対応。退院日決定次第共有いただく手はず。",
 future_goals: "再入所後のADL低下を防ぎ、自立した日常動作を維持する。"
 },
 {
 id: 3,
 resident_id: 2,
 created_at: "2026-10-02",
 updated_at: "2026-10-02",
 staff_name: "佐藤 恵美",
 summary_type: "定期見直しサマリー",
 basic_info: "要介護2。生年月日: 1938-11-20 (87歳)。キーパーソン: 長女・田中 美咲様 (090-3333-4444)。認知症自立度I。障害自立度A2。心不全・高血圧・両変形性膝関節症あり。",
 background: "元小学校教員。夫他界後、長女近隣にて一人暮らしをしていたが、心不全による緊急入院を契機に下肢筋力低下。退院後、在宅療養見守りのため当施設へ入所され6ヶ月経過。定期見直し実施。",
 physical_cognitive: "認知機能はおおむね良好で日常会話・意思疎通明瞭。几帳面な性格。両膝関節に変形性膝関節症に伴う荷重痛あり。歩行時は手すりまたはシルバーカー使用。軽度心不全による下腿浮腫傾向。",
 adl: "室内移動は手すり伝い歩行またはシルバーカーにて自立・見守り。立ち上がり時に膝痛のため手押し動作必要。更衣・整容は自立。入浴は一般浴・見守りにて洗身・洗髪実施（浴槽出入り時軽介助）。",
 meals_hydration: "軟飯・一口大刻み食。自力全量摂取可能。心不全管理のため塩分制限・水分管理目標（1日1,000〜1,200ml程度）。計量カップにて水分摂取量を記録。",
 excretion: "日中・夜間ともにポータブルトイレまたは居室トイレにて自立排泄。夜間1回排泄覚醒あり。利尿剤内服中のため午前中の尿量増加に配慮。",
 sleep: "21:30就寝、6:30起床。足元の冷えを訴えることがあり、保温靴下や毛布にて調整。入眠良好。中途覚醒時もナースコール対応にて安全確認。",
 meds: "降圧薬・利尿剤・胃薬を定期内服中。朝・夕食後。職員による配薬と服用確認にて自己内服確実。",
 medical_care: "心不全管理のための毎朝体重測定（前日比+1.5kg以上で往診医報告基準）。バイタル測定。両膝関節へのモーラステープ貼付（朝貼付・夕入浴前剥離）。両下腿へのヒルドイドローション塗布。",
 dementia_behavior: "目立ったBPSD・周辺症状なし。読書や手芸を楽しまれ、落ち着いて穏やかに過ごされている。几帳面ゆえに持ち物の位置等にこだわりあり傾聴。",
 care_notes: "立ち上がりや歩行時は膝への負担軽減のため焦らせず見守る。下肢浮腫・呼吸苦・体重増加の早期発見に努める。手芸や読書等の活動を尊重。",
 family_info: "長女様が週1〜2回面会および日用品補充に来訪。何かあれば長女様へ連絡。救急搬送方針（心不全悪化時は早期搬送希望）。",
 future_goals: "心不全の安定維持（体重・浮腫・血圧コントロール）。両膝の疼痛を緩和し、室内歩行・活動性を維持して穏やかな生活を支援。"
 },
 {
 id: 4,
 resident_id: 3,
 created_at: "2026-10-01",
 updated_at: "2026-10-01",
 staff_name: "山田 孝之",
 summary_type: "新規入所時サマリー",
 basic_info: "要介護3。生年月日: 1935-02-15 (91歳)。キーパーソン: 妻・鈴木 和子様 (090-5555-6666)。認知症自立度IIa。障害自立度B2。パーキンソン病、嚥下障害、誤嚥性肺炎既往、左片麻痺。",
 background: "元農業。真面目で温厚な性格。10年前にパーキンソン病と診断。在宅にて妻が介護していたが、誤嚥性肺炎で入院加療。退院にあたり経口摂取支援と専門的介護を要するため当施設へ新規入所。",
 physical_cognitive: "左片麻痺およびパーキンソン病による無動・振戦・筋強剛あり。小刻み歩行・突進歩行のリスク高く、自立歩行は不可。車椅子移動。意思疎通は可能だが発語が小声で聞き取りに傾聴を要する。",
 adl: "ベッド上での寝返り・起き上がりは軽介助。端座位保持は数分可能。車椅子への移乗は職員1名による軽介助〜一部介助。更衣・整容は全介助。入浴は機械浴（リフト浴）にて全身清拭・洗身介助。",
 meals_hydration: "やわらか食（舌でつぶせる軟らかさ・とろみあんでまとめる。刻むだけの形はまとまりにくく誤嚥しやすいため避ける）。嚥下反射の遅延あり、食事時は頭頸部前屈位（顎引き）を保持。スプーンにて一口ずつ全介助。水分は全量トロミ茶。1日目標1,000ml。むせ込み・湿性咳嗽に厳重警戒。",
 excretion: "リハビリパンツ＋尿取りパッド使用。定時おむつ交換および車椅子移乗時にポータブルトイレ誘導（成功率約50%）。排便は2〜3日に1回、緩下剤調整にて管理。",
 sleep: "20:30就寝、6:00起床。夜間体位変換（3時間ごと）実施。仙骨部発赤予防のため体圧分散エアマット使用。離床センサー設置。夜間覚醒時は穏やかに声かけ。",
 meds: "抗パーキンソン薬（レボドパ合剤）、便秘薬、胃薬。定時内服厳守（薬効オン・オフ現象あり、時間厳守が動作に直結）。トロミ水または服薬ゼリーにて全介助服薬。",
 medical_care: "誤嚥性肺炎予防の口腔ケア徹底（毎食後）。仙骨部発赤予防（アズノール軟膏塗布＋体交）。左肘スキンテア処置（亜鉛華軟膏＋ガーゼ保護）。背部乾燥へのプロペト塗布。",
 dementia_behavior: "夜間に小声での独語やせん妄傾向が稀に見られるが、職員の手を握り優しく声かけすることで入眠。暴言や拒絶はなし。",
 care_notes: "抗パーキンソン薬の内服時間を厳守すること。食事介助は急がせず一口ごとの嚥下を確認。車椅子座位時の姿勢崩れ（左傾き）にクッションで補正。",
 family_info: "高齢の奥様が週1回面会。介護負担軽減に感謝されている。看取り方針合意済（DNAR、施設での平穏な看取り希望）。緊急連絡先は長男様（副）。",
 future_goals: "誤嚥性肺炎の再発防止と安全な経口摂取の継続。褥瘡を発生させず、車椅子移乗による離床機会を確保して寝たきり化を予防。"
 }
 ],
 body_schema_pins: [
 { id: 1, resident_id: 1, pin_no: 1, category: "軟膏塗布", site_name: "背部 (肩甲骨間〜腰部)", item_name: "ヒルドイドソフト軟膏 0.3%", frequency: "入浴後", status: "継続中", notes: "乾燥・掻痒予防。入浴後に擦らず薄く広げて塗布すること。", doctor_name: "さくら皮膚科", x_pct: 75.5, y_pct: 32.0, created_at: "2026-10-01 10:00", updated_at: "2026-10-01 10:00", staff_name: "山田 孝之" },
 { id: 2, resident_id: 1, pin_no: 2, category: "褥瘡・発赤", site_name: "仙骨部", item_name: "アズノール軟膏 0.033%", frequency: "朝・夕 (1日2回)", status: "継続中", notes: "軽度発赤あり。除圧マット使用中。車椅子座位長引かないよう声かけ。", doctor_name: "さくら往診クリニック", x_pct: 75.0, y_pct: 46.5, created_at: "2026-10-01 10:15", updated_at: "2026-10-01 10:15", staff_name: "山田 孝之" },
 { id: 3, resident_id: 1, pin_no: 3, category: "軟膏塗布", site_name: "右足背・踵部", item_name: "プロペト (白色ワセリン)", frequency: "入浴後", status: "継続中", notes: "角質硬化・亀裂予防。靴下着用前に塗布。", doctor_name: "さくら皮膚科", x_pct: 38.0, y_pct: 92.0, created_at: "2026-10-02 09:30", updated_at: "2026-10-02 09:30", staff_name: "佐藤 恵美" },
 { id: 4, resident_id: 2, pin_no: 1, category: "湿布・貼付剤", site_name: "右膝関節部 (前面〜側方)", item_name: "モーラステープL 40mg", frequency: "1日1回 朝", status: "継続中", notes: "変形性膝関節症の疼痛緩和。入浴前（夕方）に剥がす。日光過敏・かぶれ確認。", doctor_name: "中央整形外科", x_pct: 20.5, y_pct: 66.5, created_at: "2026-10-01 11:00", updated_at: "2026-10-01 11:00", staff_name: "佐藤 恵美" },
 { id: 5, resident_id: 2, pin_no: 2, category: "湿布・貼付剤", site_name: "左膝関節部 (前面〜側方)", item_name: "モーラステープL 40mg", frequency: "1日1回 朝", status: "継続中", notes: "立ち上がり時の疼痛軽減。皮膚発赤ないか剥離時に確認。", doctor_name: "中央整形外科", x_pct: 30.5, y_pct: 66.5, created_at: "2026-10-01 11:05", updated_at: "2026-10-01 11:05", staff_name: "佐藤 恵美" },
 { id: 6, resident_id: 2, pin_no: 3, category: "軟膏塗布", site_name: "両下腿 (すね〜ふくらはぎ)", item_name: "ヒルドイドローション 0.3%", frequency: "入浴後", status: "継続中", notes: "下肢乾燥・軽度浮腫ケア。下から上へ優しくなじませるように塗布。", doctor_name: "さくら皮膚科", x_pct: 25.5, y_pct: 78.0, created_at: "2026-10-02 14:00", updated_at: "2026-10-02 14:00", staff_name: "山田 孝之" },
 { id: 7, resident_id: 3, pin_no: 1, category: "褥瘡・発赤", site_name: "仙骨部〜尾骨部", item_name: "アズノール軟膏 0.033% ＋ フィルム保護", frequency: "朝・夕・就寝前 (1日3回)", status: "継続中", notes: "車椅子自走なし・座位姿勢が崩れやすく発赤リスク大。定期的な体位変換と除圧クッション確認。", doctor_name: "さくら往診クリニック", x_pct: 75.0, y_pct: 46.5, created_at: "2026-09-28 10:00", updated_at: "2026-10-02 15:00", staff_name: "山田 孝之" },
 { id: 8, resident_id: 3, pin_no: 2, category: "打撲・創傷", site_name: "左肘頭部 (外側)", item_name: "亜鉛華単軟膏 ＋ メロリンガーゼ被覆", frequency: "1日1回 朝処置", status: "継続中", notes: "車椅子手すり接触による皮膚剥離（スキンテア・約1cm）。浸出液少、上皮化傾向。テープ固定は弱粘着使用。", doctor_name: "さくら往診クリニック", x_pct: 91.0, y_pct: 35.0, created_at: "2026-09-30 08:30", updated_at: "2026-10-03 09:00", staff_name: "鈴木 美智子" },
 { id: 9, resident_id: 3, pin_no: 3, category: "軟膏塗布", site_name: "背部全体 (胸椎〜腰椎部)", item_name: "プロペト (白色ワセリン)", frequency: "入浴後", status: "継続中", notes: "老人性乾皮症による痒み訴えあり。入浴後に水分を拭き取り次第すぐ塗布。", doctor_name: "さくら皮膚科", x_pct: 75.0, y_pct: 30.0, created_at: "2026-10-01 16:30", updated_at: "2026-10-01 16:30", staff_name: "山田 孝之" },
 { id: 10, resident_id: 4, pin_no: 1, category: "打撲・創傷", site_name: "右大腿外側 (骨折手術創部)", item_name: "ヘパリン類似物質油性クリーム ＋ 保護ガーゼ", frequency: "1日1回 朝", status: "継続中", notes: "手術創治癒後瘢痕の皮膚ツッパリ・乾燥予防。強く揉まないこと。創部発赤・熱感なし。", doctor_name: "さくら総合病院 整形外科", x_pct: 18.0, y_pct: 49.0, created_at: "2026-10-02 11:00", updated_at: "2026-10-02 11:00", staff_name: "鈴木 美智子" },
 { id: 11, resident_id: 4, pin_no: 2, category: "湿布・貼付剤", site_name: "腰部中央 (L3〜L5付近)", item_name: "ロキソニンテープ 50mg", frequency: "1日1回 朝貼付", status: "継続中", notes: "腰背部痛緩和。1日1回朝食後貼付、入浴時剥離。皮膚かぶれ注視。", doctor_name: "さくら総合病院 整形外科", x_pct: 75.0, y_pct: 40.0, created_at: "2026-10-02 11:15", updated_at: "2026-10-02 11:15", staff_name: "鈴木 美智子" },
 { id: 12, resident_id: 4, pin_no: 3, category: "褥瘡・発赤", site_name: "右踵部 (かかと)", item_name: "アズノール軟膏 ＋ かかと保護パッド", frequency: "1日1回 就寝前", status: "継続中", notes: "臥床時の持続圧迫による発赤予防。除圧クッションを足首下に配置。", doctor_name: "さくら往診クリニック", x_pct: 38.0, y_pct: 95.0, created_at: "2026-10-02 11:30", updated_at: "2026-10-02 11:30", staff_name: "鈴木 美智子" }
 ],
 eyedrop_orders: [
 {
 id: 1,
 resident_id: 1,
 eye: "右のみ",
 medicine_name: "キサラタン点眼液 0.005%",
 timing_slots: ["眠前"],
 dosage: "1回1滴",
 notes: "緑内障治療。就寝前に右眼へ1滴点眼。点眼後しばらく目を閉じ涙嚢部を軽く圧迫。",
 doctor_name: "さくら眼科クリニック",
 status: "継続中",
 updated_at: "2026-10-01"
 },
  {
    id: 5,
    resident_id: 1,
    created_at: "2026-10-08",
    updated_at: "2026-10-08",
    staff_name: "山田 孝之",
    summary_type: "定期見直しサマリー",
    basic_info: "要介護3。生年月日: 1940-10-15 (85歳)。キーパーソン: 長男・佐藤 一郎様 (090-1111-2222)。認知症高齢者の日常生活自立度IIb。障害高齢者の日常生活自立度B1。",
    background: "自宅にて長男家族と同居していたが、2026年8月に自宅内で転倒し右大腿骨頸部骨折。急性期病院にて骨接合術施行。リハビリ継続の上、在宅介護困難となり当施設へ新規入所。",
    physical_cognitive: "右股関節可動域制限・右下肢軽度筋力低下あり。歩行時にすり足・ふらつき認める。短期記憶の低下あるが、見当識はおおむね保たれており穏やかに意思疎通可能。",
    adl: "寝返り・起き上がり自立。立ち上がり・車椅子移乗は見守りにて自立（軽介助不要となった）。歩行器歩行にて40m程度自立移動可能（前回20m）。更衣・整容は一部介助（靴下着脱のみ）。入浴は一般浴にて洗身見守り、洗髪一部介助。",
    meals_hydration: "普通食（一口大）継続。自力摂取良好、むせ込みは減少。水分摂取は1日平均1,100ml程度で目標1,200mlにやや届かないため、10時・15時の補水を強化。",
    excretion: "日中はトイレ誘導にて排尿自立。夜間はリハビリパンツ＋尿取りパッド使用継続。夜間失禁なし。便秘傾向は緩下剤調整と水分促しにより改善（2日に1回排便）。",
    sleep: "21:00就寝、6:00起床。夜間1〜2回トイレ覚醒あり。中途覚醒時は転倒注意のため離床センサーマット使用。声かけにて再入眠良好。",
    meds: "降圧薬・血糖降下薬内服中。朝・夕食後。看護師・介護職員による配薬・服薬確認にて全量自己内服。",
    medical_care: "毎日のバイタルチェック（血圧・体温・脈拍・SpO2）。褥瘡・皮膚剥離なし。保湿剤塗布継続。",
    dementia_behavior: "夕方時に「そろそろ帰らないと」と帰宅願望が時折出現。お茶を勧め、大工職人時代の仕事や大相撲の話題を傾聴することで落ち着かれる。",
    care_notes: "急がせる声かけは焦りを生み転倒リスクとなるため、ゆっくりとしたペースで対応する。声かけは気づきやすい左側（健側）から、移乗・歩行の介助は麻痺側（右）の後方から行う。大工道具や相撲の話題を好まれる。",
    family_info: "長男様が週1回程度面会来訪。何かあれば長男様へ連絡希望。看取り方針については自然な経過での見守りを希望（施設での看取り・DNAR合意済）。",
    future_goals: "歩行器歩行の距離をさらに伸ばし、食堂までの自立歩行を目指す。転倒ゼロを継続。水分摂取量1,200ml/日の達成。レクリエーションへの週2回以上の参加。"
  },
  {
    id: 6,
    resident_id: 1,
    created_at: "2026-10-09",
    updated_at: "2026-10-09",
    staff_name: "鈴木 美智子",
    summary_type: "状態変化・処方見直しサマリー",
    basic_info: "要介護3。生年月日: 1940-10-15 (85歳)。キーパーソン: 長男・佐藤 一郎様 (090-1111-2222)。認知症高齢者の日常生活自立度IIb。障害高齢者の日常生活自立度B1。",
    background: "大腿骨頸部骨折術後入所から1週間経過。歩行器歩行自立度向上に伴い活動量増加。夕方の胸やけ症状および便通経過を往診医（ひだまり内科クリニック・田中医師）に相談し、処方見直しを実施。",
    physical_cognitive: "右下肢筋力・右股関節可動域はリハビリ継続により着実に回復。歩行器歩行にて50m以上安定移動可能。短期記憶低下あるが、見当識はおおむね保たれ穏やかに意思疎通可能。",
    adl: "寝返り・起き上がり・立ち上がり・車椅子移乗は完全自立。歩行器歩行にて居室から食堂まで見守り自立歩行。更衣は自立（靴下着脱のみ軽介助）。入浴は一般浴にて洗身・洗髪ほぼ自力実施（背部のみ一部介助）。",
    meals_hydration: "普通食 (一口大)。自力全量摂取良好。むせ込みは消失。水分摂取量は1日1,200ml目標を達成（平均1,250ml）。食後の胸やけの訴えに対し、食後すぐに横にならないよう促し（時間は主治医の指示に従う）、追加処方薬（ランソプラゾール）にて経過観察。",
    excretion: "日中はトイレ誘導にて完全自立。夜間も定時排泄リズム定着により失禁ゼロ継続。酸化マグネシウム継続および水分摂取確保により、自然排便（普通便〜軟便）が1〜2日に1回順調にあり、便秘傾向は解消。",
    sleep: "21:00就寝、6:00起床。夜間中途覚醒時もナースコール押し自力トイレ可能。声かけにて再入眠良好、良眠維持。",
    meds: "高血圧症に対しアムロジピン錠5mg（朝食後1錠）、糖尿病に対しシタグリプチン錠50mg（朝食後1錠）、便秘症に対し酸化マグネシウム錠330mg（朝・夕食後各1錠）を継続。10/8往診時に食後の胸やけ・胃酸逆流傾向を認め、ランソプラゾールOD錠15mg（朝食後1錠）を追加処方。動悸があるときの頓服としてメトプロロール錠20mg（1回1錠）の指示あり（使うときは看護師・主治医の指示に従う）。看護師（鈴木・加藤）による配薬セット、服薬確認および効果・副作用チェックを徹底。",
    medical_care: "看護師による毎朝バイタル測定（血圧128/76mmHg、脈拍68、SpO2 98%、体温36.5℃で血圧良好に安定）。処方変更に伴い、胃部症状の推移、脈拍・ふらつき、軟便傾向の有無を重点観察。褥瘡・スキンテアなし。仙骨部・背部の保湿ケア継続。",
    dementia_behavior: "夕方の帰宅願望は環境適応に伴い大幅に減少。大相撲観戦や大工職人時代の昔語りを楽しまれ、他入所者への温かい声かけも見られる。",
    care_notes: "歩行が安定してきたことによる油断からの独歩・転倒に留意。移動時は必ず歩行器を使用するよう優しく声かけ。食後すぐに横にならないよう促す（時間は主治医の指示に従う）。大工道具や相撲の話題を好まれる。",
    family_info: "長男様が週1回面会。歩行改善と顔色の良さに安心されている。処方変更の内容についても看護師より長男様へ電話報告・了承済。施設看取り方針合意済。",
    future_goals: "歩行器での食堂・デイルームへの完全自立移動。転倒ゼロ継続。レクリエーション（書道・体操）への積極的参加。"
  },

 {
 id: 2,
 resident_id: 2,
 eye: "両眼",
 medicine_name: "ヒアレイン点眼液 0.1%",
 timing_slots: ["朝", "昼", "夕"],
 dosage: "1回1滴",
 notes: "角結膜上皮障害・ドライアイ。朝食後・昼食後・夕食後に両眼へ各1滴点眼。",
 doctor_name: "中央眼科医院",
 status: "継続中",
 updated_at: "2026-10-01"
 },
 {
 id: 3,
 resident_id: 3,
 eye: "左のみ",
 medicine_name: "サンコバ点眼液 0.02%",
 timing_slots: ["朝", "夕"],
 dosage: "1回1滴",
 notes: "調節機能改善・眼精疲労。朝食後・夕食後に左眼のみ1滴点眼。",
 doctor_name: "さくら眼科クリニック",
 status: "継続中",
 updated_at: "2026-10-01"
 },
 {
 id: 4,
 resident_id: 4,
 eye: "両眼",
 medicine_name: "クラビット点眼液 1.5%",
 timing_slots: ["朝", "昼", "夕"],
 dosage: "1回1滴",
 notes: "細菌性結膜炎の治療。眼科の指示した期間のみ使用（抗菌薬のため漫然と続けない）。朝食後・昼食後・夕食後に両眼へ各1滴点眼。容器先端がまつ毛に触れないよう清潔操作。",
 doctor_name: "総合病院眼科",
 status: "継続中",
 updated_at: "2026-10-01"
 }
 ],
 // [Claude修正] 処方箋の見本（佐藤様）。処方薬の一覧は看護師（鈴木）が処方箋を見て登録した、という見本
    prescriptions: [
      {"id": 1, "resident_id": 1, "issued_date": "2026-10-01", "note": "新規入所時の処方", "uploaded_at": "2026-10-01 10:30", "uploaded_by": "鈴木 美智子 (主任看護師)", "url": "data/photos/prescriptions/r1/rx_20261001_sato.jpg"},
      {"id": 2, "resident_id": 1, "issued_date": "2026-10-08", "note": "往診での処方見直し", "uploaded_at": "2026-10-08 14:15", "uploaded_by": "鈴木 美智子 (主任看護師)", "url": "data/photos/prescriptions/r1/rx_20261008_sato.jpg"}
    ],
    resident_medications: [
      {"id": 1, "resident_id": 1, "name": "アムロジピン錠 5mg", "unit": "錠", "status": "服用中", "timings": [{"key": "朝食後", "count": 1}], "purpose": "高血圧症の治療（血圧を下げる）", "source_type": "処方箋", "source_detail": "2026-10-01 の処方箋", "added_at": "2026-10-01 11:00", "added_by": "鈴木 美智子", "edit_history": []},
      {"id": 2, "resident_id": 1, "name": "酸化マグネシウム錠 330mg", "unit": "錠", "status": "服用中", "timings": [{"key": "朝食後", "count": 1}, {"key": "夕食後", "count": 1}], "purpose": "便秘症の改善（便をやわらかくする）", "source_type": "処方箋", "source_detail": "2026-10-01 の処方箋", "added_at": "2026-10-01 11:00", "added_by": "鈴木 美智子", "edit_history": []},
      {"id": 5, "resident_id": 1, "name": "シタグリプチン錠 50mg", "unit": "錠", "status": "服用中", "timings": [{"key": "朝食後", "count": 1}], "purpose": "糖尿病の治療（血糖を下げる）", "source_type": "処方箋", "source_detail": "2026-10-01 の処方箋", "added_at": "2026-10-01 11:00", "added_by": "鈴木 美智子", "edit_history": []},
      {"id": 3, "resident_id": 1, "name": "ランソプラゾールOD錠 15mg", "unit": "錠", "status": "服用中", "timings": [{"key": "朝食後", "count": 1}], "purpose": "食後の胸やけ（胃酸を抑える）", "source_type": "処方箋", "source_detail": "2026-10-08 の処方箋", "added_at": "2026-10-08 14:30", "added_by": "鈴木 美智子", "edit_history": []},
      {"id": 4, "resident_id": 1, "name": "メトプロロール錠 20mg", "unit": "錠", "status": "服用中", "timings": [], "prn": {"count": 1, "when": "動悸があるとき"}, "purpose": "動悸があるときの頓服", "source_type": "処方箋", "source_detail": "2026-10-08 の処方箋", "added_at": "2026-10-08 14:35", "added_by": "鈴木 美智子", "edit_history": []}
    ],
    billing_overrides: []
 };
 this.storeLocalCopy(JSON.stringify(seed));
 return this.ensureDefaultArrays(seed);
 }
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

// ======================================================================
// 現場介護向け 医療・症状・ケア専門用語 やさしい解説辞書
// ======================================================================
const MEDICAL_TERMS_DICTIONARY = {
 // 呼吸・循環器
 "起座呼吸": {
 term: "起座呼吸",
 ruby: "きざこきゅう",
 meaning: "横になると息苦しくなり、体を起こして座ると呼吸が楽になる状態。",
 urgency: " 即時報告レベル",
 urgencyType: "danger",
 checkPoint: "ベッドに横になるのを嫌がり前かがみで座りたがるときは心不全の悪化が疑われます。無理に寝かせず、背上げ（起座・座位）を保ち、直ちに看護師へ連絡してください。",
 isDisease: false
 },
 "チアノーゼ": {
 term: "チアノーゼ",
 ruby: "ちあのーぜ",
 meaning: "血液中の酸素が不足し、唇・爪・顔色が青紫色になる危険サイン。",
 urgency: " 即時報告レベル",
 urgencyType: "danger",
 checkPoint: "直ちに酸素吸入（指示がある場合）の確認、呼吸状態の確保、SpO2測定を行い、大至急看護師または医師へ報告してください。",
 isDisease: false
 },
 "湿性嗄声": {
 term: "湿性嗄声",
 ruby: "しっせいさせい",
 meaning: "声帯や喉に唾液・痰・水分が絡んでガラガラ・ゴロゴロ鳴る湿った声。",
 urgency: " 即時報告レベル",
 urgencyType: "danger",
 checkPoint: "喉に食物や痰が溜まって誤嚥の危険が高い状態です。飲食を直ちに止め、前傾姿勢で咳払いを促し、必要に応じて看護師へ吸引を依頼してください。",
 isDisease: false
 },
 "ガラガラ声": {
 term: "ガラガラ声",
 ruby: "がらがらごえ",
 meaning: "喉に唾液や食べ物、痰が残留しているときの湿った声（湿性嗄声）。",
 urgency: " 即時報告レベル",
 urgencyType: "danger",
 checkPoint: "誤嚥の典型的な初期サインです。飲食を中断し、頭を前に倒して咳き込ませ、看護師へ連絡してください。",
 isDisease: false
 },
 "喘鳴": {
 term: "喘鳴",
 ruby: "ぜんめい",
 meaning: "呼吸をするときに『ゼーゼー』『ヒューヒュー』と苦しそうな音がすること。",
 urgency: " 即時報告レベル",
 urgencyType: "danger",
 checkPoint: "気道が狭くなっているか心不全で肺に水が溜まっているサインです。衣類を緩め、背上げ（座位）にして直ちに看護師へ連絡してください。",
 isDisease: false
 },
 "SpO2": {
 term: "SpO2",
 ruby: "えすぴーおーつー",
 // [Claude修正 2026-10-14] 根拠: 日本呼吸器学会『よくわかるパルスオキシメータ』の記載だけにした
 meaning: "パルスオキシメーターで測る、血液中の酸素の値（酸素飽和度）。",
 urgency: " 普段より3〜4%低い・90%未満は看護師へ",
 urgencyType: "danger",
 checkPoint: "健康な方の標準値は96〜99%です。90%未満は呼吸不全の状態とされています。普段の値から3〜4%低下した場合は、早めの受診が必要とされています（看護師へ報告します）。手を動かしている、指が冷たい、マニキュアをしている時は正しく測れません。落ち着いている時の値をあらかじめ確認しておきます。",
 isDisease: false
 },
 "HOT": {
 term: "HOT",
 ruby: "ほっと (ざいたくさんそりょうほう)",
 // [Claude修正 2026-10-14] 根拠: 厚生労働省「在宅酸素療法における火気の取扱いについて」の記載だけにした
 meaning: "在宅酸素療法（HOT）。",
 urgency: "ℹ 火気は装置の周囲2m以内に置かない",
 urgencyType: "info",
 checkPoint: "酸素濃縮装置などの使用中は、装置の周囲2m以内に火気を置きません。酸素は医師の指示どおりに吸入します（介護職の判断で変えず、看護師へ伝えます）。",
 isDisease: false
 },
 "在宅酸素療法": {
 term: "在宅酸素療法",
 ruby: "ざいたくさんそりょうほう",
 // [Claude修正 2026-10-14] 根拠: 厚生労働省「在宅酸素療法における火気の取扱いについて」の記載だけにした
 meaning: "在宅酸素療法（HOT）。",
 urgency: "ℹ 火気は装置の周囲2m以内に置かない",
 urgencyType: "info",
 checkPoint: "酸素濃縮装置などの使用中は、装置の周囲2m以内に火気を置きません。酸素は医師の指示どおりに吸入します（介護職の判断で変えず、看護師へ伝えます）。",
 isDisease: false
 },
 "起座位": {
 term: "起座位",
 ruby: "きざい",
 meaning: "上半身を起こし、オーバーテーブルに置いた枕などにもたれて前かがみになる姿勢。",
 urgency: " 現場介護でしてよい安全ケア",
 urgencyType: "info",
 checkPoint: "心不全や呼吸困難があるとき、横たわるより座る方が肺が広がり呼吸が楽になります。オーバーテーブルにクッションを置きもたれかからせる姿勢も有効です。",
 isDisease: false
 },
 "ファーラー位": {
 term: "ファーラー位",
 ruby: "ふぁーらーい",
 meaning: "ベッドの背上げをした半座位（角度の目安は資料によって幅があるため、施設・看護師の指示に従う）。",
 urgency: " 現場介護でしてよい安全ケア",
 urgencyType: "info",
 checkPoint: "食後の逆流・誤嚥予防や、呼吸が少し苦しいときの安静姿勢として使われます。膝裏にも軽くクッションを入れて体がずり落ちないように支えます。",
 isDisease: false
 },
 "放散痛": {
 term: "放散痛",
 ruby: "ほうさんつう",
 meaning: "心臓など痛みの原因箇所から離れた場所（左肩・背中・顎・みぞおち）に広がる痛み。",
 urgency: " 即時報告レベル",
 urgencyType: "danger",
 checkPoint: "『左肩が急に重痛い』『顎や歯が痛い』と訴える場合、心筋梗塞・狭心症の放散痛の可能性があります。直ちにバイタルを測り看護師・救急要請を検討します。",
 isDisease: false
 },
 "不整脈": {
 term: "不整脈",
 ruby: "ふせいみゃく",
 meaning: "心臓の拍動リズムが不規則になったり、脈が極端に速い（頻脈）・遅い（徐脈）状態。",
 urgency: " めまい・動悸・胸痛伴う時は即報告",
 urgencyType: "warning",
 checkPoint: "検脈でリズムがバラバラ、または普段と比べて極端に速い・遅い場合は直ちに看護師へ連絡（一般に1分間100回以上を頻脈、60回未満（50回以下とする資料もある）を徐脈という。報告する数値は施設・主治医の基準に従う）。ふらつき・転倒に厳重警戒してください。",
 isDisease: false
 },
 "ヒートショック": {
 term: "ヒートショック",
 ruby: "ひーとしょっく",
 meaning: "暖かい居室から寒い脱衣所・浴室への移動で血圧が急変動し、脳卒中や心筋梗塞を起こす現象。",
 urgency: " 現場介護での予防が重要",
 urgencyType: "info",
 checkPoint: "冬場の入浴時は脱衣所・浴室をあらかじめ暖房等で温めておく、湯の温度は41℃以下、つかる時間は10分までを目安にする、急に立ち上がらせない等の予防が必須です。",
 isDisease: false
 },
 "肺水腫": {
 term: "肺水腫",
 ruby: "はいすいしゅ",
 meaning: "心不全などが原因で肺に水が染み出し、溺れたような激しい呼吸苦を起こす危険状態。",
 urgency: " 即時報告レベル (緊急搬送)",
 urgencyType: "danger",
 checkPoint: "横になれず激しく息苦しがる、ピンク色の泡状痰、ゼーゼー音がサイン。直ちに体を起こして座らせ（起座位）、大至急看護師・救急要請してください。",
 isDisease: false
 },

 // 脳・神経・意識
 "片麻痺": {
 term: "片麻痺",
 ruby: "かたまひ",
 meaning: "身体の左右どちらか半分（右手と右足、または左手と左足）に力が入らない状態。",
 urgency: " 急な悪化・新規出現は即報告 (脳梗塞疑い)",
 urgencyType: "danger",
 checkPoint: "普段より急に力が入らなくなった、腕が上がらない、顔の半分が下がっている場合は脳血管障害の再発疑い。直ちに看護師・救急要請します。日常の介助では、歩行時は麻痺側（患側）のやや後方に立って支え、衣類は脱健着患（脱ぐ時は健側から、着る時は患側から）で行います。",
 isDisease: false
 },
 "構音障害": {
 term: "構音障害",
 ruby: "こうおんしょうがい",
 meaning: "舌や唇の筋肉麻痺により、ろれつが回らなくなったり言葉が不明瞭になる状態。",
 urgency: " 急な出現・悪化は即報告",
 urgencyType: "danger",
 checkPoint: "『イー』『パ・タ・カ・ラ』を発音してもらい、急にろれつが回らないときは脳梗塞の疑い。直ちに看護師へ報告してください。",
 isDisease: false
 },
 "ろれつ不良": {
 term: "ろれつ不良",
 ruby: "ろれつふりょう",
 meaning: "舌がもつれて言葉がはっきりと喋れなくなる症状（構音障害）。",
 urgency: " 即時報告レベル",
 urgencyType: "danger",
 checkPoint: "脳梗塞の代表的サインです。片麻痺や顔面のゆがみがないかも確認し、直ちに安静を保ち看護師へ報告してください。",
 isDisease: false
 },
 "意識混濁": {
 term: "意識混濁",
 ruby: "いしきこんだく",
 meaning: "呼びかけに対する反応が鈍い、ボーッとして辻褄が合わない、意識が朦朧としている状態。",
 urgency: " 即時報告レベル",
 urgencyType: "danger",
 checkPoint: "低血糖、脳血管障害、重篤な脱水、高熱などの危険なサインです。安全な姿勢（誤嚥防止の横向き・側臥位）にし直ちに看護師・医師へ連絡します。",
 isDisease: false
 },
 "意識障害": {
 term: "意識障害",
 ruby: "いしきしょうがい",
 meaning: "目を開けない、呼びかけに反応しない、会話が成り立たないなど意識レベルが低下した状態。",
 urgency: " 即時報告レベル (緊急)",
 urgencyType: "danger",
 checkPoint: "飲食はさせず、気道確保（横向き寝・側臥位）を行い、大声で周囲の職員・看護師を呼び直ちに医師連絡・救急要請を行います。",
 isDisease: false
 },
 "せん妄": {
 term: "せん妄",
 ruby: "せんもう",
 meaning: "脱水・感染症・環境変化等で、数時間〜数日の間に急に時間や場所がわからなくなり幻覚や興奮が起きる一時的な意識障害。",
 urgency: " 看護師へ報告 (原因疾患の探索)",
 urgencyType: "warning",
 checkPoint: "認知症の悪化に見えますが、発熱・尿路感染・脱水・便秘・薬剤副作用が原因であることが多いです。体温測定・水分摂取確認を行い看護師へ報告します。",
 isDisease: false
 },
 "半側空間無視": {
 term: "半側空間無視",
 ruby: "はんそくくうかんむし",
 meaning: "脳の損傷により、麻痺側（多くは左側）にある人や物、配膳された食事に気づかなくなる障害。",
 urgency: "ℹ 現場ケア知識",
 urgencyType: "info",
 checkPoint: "本人は見えていない自覚がありません。声かけや食事の配膳は気づきやすい側（健側）から行い、麻痺側にある食事や障害物へ優しく注意を促します。",
 isDisease: false
 },
 "感情失禁": {
 term: "感情失禁",
 ruby: "かんじょうしっきん",
 meaning: "脳血管障害などの後遺症で、些細な刺激や理由もないのに急に泣いたり大笑いしたりする症状。",
 urgency: "ℹ 現場ケア知識",
 urgencyType: "info",
 checkPoint: "本人の意思でコントロールできません。動揺せず『大丈夫ですよ』と落ち着いた声かけをし、背中を優しくさすって安心感を促します。",
 isDisease: false
 },
 "悪性症候群": {
 term: "悪性症候群",
 ruby: "あくせいしょうこうぐん",
 // [Claude修正 2026-10-14] 根拠: 厚生労働省「重篤副作用疾患別対応マニュアル 悪性症候群」の記載だけにした
 meaning: "抗精神病薬などの薬の副作用で起きる病気。パーキンソン病の薬を減らしたときに起きることもあります。",
 urgency: " 即時報告レベル",
 urgencyType: "danger",
 checkPoint: "高熱・発汗、意識のくもり、手足の震えや身体のこわばり、飲み込みにくさなどが見られたら、直ちに看護師・医師へ連絡します。放置すると重篤になることがあり、迅速な対応が必要とされています。",
 isDisease: false
 },

 // 運動・パーキンソン
 "振戦": {
 term: "振戦",
 ruby: "しんせん",
 meaning: "手や指、足、顎などが自分の意思と無関係に細かくリズミカルに震える症状。",
 urgency: " 低血糖の震えは即報告 / パーキンソン症状は観察",
 urgencyType: "warning",
 checkPoint: "冷汗や脱力を伴う場合は低血糖の疑い（即報告）。安静にしている時に指先で丸薬を丸めるように震える場合はパーキンソン病の症状で、内服時間通りに服薬できているか確認します。",
 isDisease: false
 },
 "筋固縮": {
 term: "筋固縮",
 ruby: "きんこしゅく",
 meaning: "他人が関節を曲げ伸ばししようとした際、筋肉が鉛の管のように硬く抵抗する症状。",
 urgency: "ℹ 現場ケア知識",
 urgencyType: "info",
 checkPoint: "移乗や更衣の際に無理に力を入れて引っ張ると骨折や筋損傷の原因になります。ゆっくりと本人の動きに合わせて優しく介助します。",
 isDisease: false
 },
 "すくみ足": {
 term: "すくみ足",
 ruby: "すくみあし",
 meaning: "歩き始めや方向転換の際に、足の裏が床に接着剤で張り付いたように一歩目が出なくなる症状。",
 urgency: " 現場介護でしてよい安全ケア",
 urgencyType: "info",
 checkPoint: "無理に引っ張ると転倒します。『いち、に』とリズムカルに声をかけたり、職員の足をまたいでもらう、床に線を引くなど、視覚・聴覚の合図が役立つことがあります。",
 isDisease: false
 },
 "突進現象": {
 term: "突進現象",
 ruby: "とっしんげんしょう",
 meaning: "歩き始めると前傾姿勢のまま小刻みに足が加速し、自分の意思で止まれなくなる症状。",
 urgency: " 転倒高リスク (見守り必須)",
 urgencyType: "warning",
 checkPoint: "壁や物にぶつかって転倒・けがをするおそれがあります。歩行時は付き添い、急がせず、歩き出しや方向転換はゆっくり声をかけます。",
 isDisease: false
 },

 // 代謝・消化・嚥下
 "低血糖発作": {
 term: "低血糖発作",
 ruby: "ていけっとうほっさ",
 meaning: "血糖値が過度に低下し、冷や汗・手指の震え・動悸・顔面蒼白・空腹感・頭痛などを起こし、進むと意識がもうろうとする状態。",
 urgency: " 即時報告レベル (昏睡リスク)",
 urgencyType: "danger",
 checkPoint: "放置すると意識消失・脳障害に繋がります。直ちに安静を保ち看護師へ報告。指示に基づきブドウ糖やジュース等の糖分を迅速に補給します（αグルコシダーゼ阻害薬を飲んでいる方は砂糖では効きにくいため、ブドウ糖を使います）。",
 isDisease: false
 },
 "チョークサイン": {
 term: "チョークサイン",
 ruby: "ちょーくさいん",
 meaning: "食べ物が喉に詰まり声が出せないとき、自分の喉元を両手で強く押さえる窒息の世界共通サイン。",
 urgency: " 超緊急 (即時窒息解除・救急)",
 urgencyType: "danger",
 checkPoint: "1分1秒を争う窒息状態です。直ちに大声で周囲を呼び、119番通報を頼みながら、背部叩打法（肩甲骨の間を手のひらで強く叩く）や腹部突き上げ法（ハイムリック法）を行います。",
 isDisease: false
 },
 "交互嚥下": {
 term: "交互嚥下",
 ruby: "こうごえんげ",
 // [Claude修正 2026-10-14] 根拠: 日本摂食嚥下リハビリテーション学会雑誌 12巻3号（2008）の論文の記載だけにした
 meaning: "食べ物と、ゼリーなどを交互に飲み込む方法。",
 urgency: "ℹ 方法は嚥下評価・施設の指示に従う",
 urgencyType: "info",
 checkPoint: "嚥下困難者用のゼリーを使った交互嚥下で、のどに残った食べ物を除く効果が報告されています。ゼリーやとろみなどの形態は指示を守ります。",
 isDisease: false
 },
 "爪白癬": {
 term: "爪白癬",
 ruby: "つめはくせん",
 meaning: "爪の水虫。爪が白濁・肥厚して脆くなる真菌感染症。",
 urgency: "ℹ 現場ケア知識 (足病変チェック)",
 urgencyType: "info",
 checkPoint: "糖尿病の利用者は足の感覚が鈍く、爪の割れや靴擦れから細菌が入り足壊疽（切断）に繋がることがあります。入浴時に足先の傷や赤みがないか必ず観察します。",
 isDisease: false
 },
 "シャント": {
 term: "シャント",
 ruby: "しゃんと",
 meaning: "人工透析のために、手術で腕の動脈と静脈を直接つなぎ合わせて血流を増やした血管。",
 urgency: " 圧迫厳禁 / シャント音・振動が消えた時は即報告",
 urgencyType: "warning",
 checkPoint: "シャントがある腕での血圧測定、採血、腕枕、重い荷物の把持、腕時計・ゴムバンドの装着は厳禁。毎日、手で触れて『ビリビリ』という振動（スリル）があるか、耳を近づけて『ザーザー』という音が聞こえるかを確認し、弱い・消えている時は直ちに看護師へ報告します。",
 isDisease: false
 },
 "宿便性イレウス": {
 term: "宿便性イレウス",
 ruby: "しゅくべんせいいれうす",
 meaning: "直腸に硬い便が大量に詰まり、腸閉塞を起こして激しい腹痛や嘔吐を起こす状態。",
 urgency: " 即時報告レベル",
 urgencyType: "danger",
 checkPoint: "数日間排便がない、下腹部がパンパンに張っている、吐き気や嘔吐がある場合は直ちに看護師へ連絡。摘便や浣腸、受診の判断を仰ぎます。",
 isDisease: false
 },

 // 外傷・骨
 "圧迫骨折": {
 term: "圧迫骨折",
 ruby: "あっぱくこっせつ",
 meaning: "骨粗鬆症で弱くなった背骨が、尻もちやくしゃみ等の軽微な衝撃でつぶれる骨折。",
 urgency: " 腰背部の急な激痛は即報告",
 urgencyType: "warning",
 checkPoint: "『起き上がるときに腰や背中が激痛で動けない』と訴えたら無理に立たせず、本人が楽な姿勢で安静を保ち、看護師へ報告します。",
 isDisease: false
 },
 "大腿骨頸部骨折": {
 term: "大腿骨頸部骨折",
 ruby: "だいたいこつけいぶこっせつ",
 meaning: "太ももの骨の付け根の骨折。転倒によって発生し、歩行困難になる重大骨折。",
 urgency: " 即時報告レベル (無理に動かさない)",
 urgencyType: "danger",
 checkPoint: "転倒後、立ち上がれない、足の向きが外側を向いて左右の長さが違う、足の付け根を押すと激痛があるときは骨折の疑いが強い状態です。歩かせずに看護師・医師へ連絡します。",
 isDisease: false
 },
 "良肢位": {
 term: "良肢位",
 ruby: "りょうしい",
 meaning: "万が一関節が固まって動かなくなっても、日常生活の支障が最も少なくなる自然な姿勢。",
 urgency: " 現場介護でしてよい安全ケア",
 urgencyType: "info",
 checkPoint: "肩は軽く広げ、肘は直角に近く、手首は少し反らせ、足首は直角（つま先が下を向かない）にクッション等で保ちます。尖足（つま先下向き）予防が特に重要です。",
 isDisease: false
 },
 "免荷": {
 term: "免荷",
 ruby: "めんか",
 meaning: "骨折や傷のある手足に体重や負荷をかけないようにすること。",
 urgency: " 現場介護で守るべき介助ルール",
 urgencyType: "info",
 checkPoint: "医師から『左足免荷』の指示がある場合、立ち上がりや移乗時に患側の足で床を踏ん張らせてはいけません。健側の足だけで支える介助を行います。",
 isDisease: false
 },
 "褥瘡": {
 term: "褥瘡",
 ruby: "じょくそう (とこづれ)",
 meaning: "寝たきり等で骨の出っ張り部分が長時間圧迫され、皮膚の血流が途絶えて組織が壊死する傷。",
 urgency: " 赤み・水疱発見時は即報告",
 urgencyType: "warning",
 checkPoint: "仙骨部（お尻中央）やかかと、大転子（太ももの骨の上端の外側の出っ張り。横向きに寝たとき下になる腰の横）の皮膚に『赤み（除圧しても消えない赤色）』を発見したら初期段階。看護師へ報告し、体位変換（原則2時間ごと。体圧分散マットレス使用時は指示に従う）とクッション除圧を徹底します。",
 isDisease: false
 },
 "脱水": {
 term: "脱水",
 ruby: "だっすい",
 meaning: "体内の水分や電解質が不足した状態。高齢者は自覚症状なく進行しやすい。",
 urgency: " 微熱・活気低下時は即報告",
 urgencyType: "warning",
 checkPoint: "口腔内の乾燥、皮膚をつまんで戻りが遅い（ツルゴール低下。高齢者は脱水がなくても遅いことがあるため他のサインと合わせて判断）、微熱、ぼんやりしている、尿の色が濃く量が少ない時は要注意。水分補給と看護師共有を行います。",
 isDisease: false
 },

 // 主要関連病名 (isDisease: true)
 "糖尿病": {
 term: "糖尿病",
 ruby: "とうにょうびょう",
 meaning: "すい臓から出るインスリンが不足したり、効きにくくなったりして、血液中のブドウ糖（血糖）が高い状態が続く病気。",
 urgency: " 低血糖発作は即報告",
 urgencyType: "warning",
 checkPoint: "冷汗・手の震えなどの低血糖、足先の傷、食事の欠食・残食に注意します。",
 isDisease: true
 },
 "心不全": {
 term: "心不全",
 ruby: "しんふぜん",
 meaning: "心臓のポンプ機能が低下し、全身に十分な血液を送り出せなくなる心臓の病態。",
 urgency: " 息切れ・起座呼吸・体重急増時は即報告",
 urgencyType: "danger",
 checkPoint: "横になると苦しい起座呼吸、足の急激なむくみ、数日〜1週間で2kg以上の体重増加が兆候です（2〜3日で2kgとする資料もあり、主治医の指示値があればそれを優先）。",
 isDisease: true
 },
 "誤嚥性肺炎": {
 term: "誤嚥性肺炎",
 ruby: "ごえんせいはいえん",
 meaning: "唾液や食物が誤って気管に入り、細菌が肺で繁殖して起こる、高齢者に多い肺炎。",
 urgency: " 発熱・痰の急増時は即報告",
 urgencyType: "danger",
 checkPoint: "食事時の姿勢保持（背上げ・顎引き）、食形態の厳守、食後すぐに横にならないこと（時間は施設・主治医の指示に従う）、口腔ケアが最重要です。",
 isDisease: true
 },
 "嚥下障害": {
 term: "嚥下障害",
 ruby: "えんげしょうがい",
 meaning: "食べ物や水分を噛んで喉へ送り込み、胃へスムーズに飲み込む働きが低下した状態。",
 urgency: " むせ・湿性嗄声は要注意",
 urgencyType: "warning",
 checkPoint: "一口量を少なくする、とろみをつける、食事に集中できる環境を整えます。",
 isDisease: true
 },
 "脳梗塞": {
 term: "脳梗塞",
 ruby: "のうこうそく",
 meaning: "脳の血管が詰まり、脳細胞へ酸素が届かなくなって麻痺や言語障害が起きる病気。",
 urgency: " 片麻痺・ろれつ不良の新規出現は即救急要請",
 urgencyType: "danger",
 checkPoint: "『顔のゆがみ』『腕の脱力』『ろれつ不良』のいずれかが出たら一刻を争う救急搬送が必要です。",
 isDisease: true
 },
 "パーキンソン病": {
 term: "パーキンソン病",
 ruby: "ぱーきんそんびょう",
 meaning: "脳の神経伝達物質（ドパミン）が減少し、手足の震えや筋肉のこわばり、歩行障害が起きる難病。",
 urgency: " 転倒・すくみ足・内服時間厳守",
 urgencyType: "warning",
 checkPoint: "薬の効き目時間によって動ける時間と動けない時間が分かれます。移動時の見守り徹底が大切です。",
 isDisease: true
 },
 "骨粗鬆症": {
 term: "骨粗鬆症",
 ruby: "こつそしょうしょう",
 meaning: "骨の密度が低下してスカスカになり、わずかな衝撃でも骨折しやすくなる病気。",
 urgency: " 転倒予防徹底 / 骨折疑いは即報告",
 urgencyType: "warning",
 checkPoint: "ベッドからの起き上がりや移乗介助時に腕や足を強く引っ張ったりひねったりしてはいけません。",
 isDisease: true
 },
 "認知症": {
 term: "認知症",
 ruby: "にんちしょう",
 meaning: "脳の病気や障害により、記憶力や判断力が低下して日常生活に支障をきたす状態。",
 urgency: "ℹ 傾聴・安心感の提供 / 急変時は報告",
 urgencyType: "info",
 checkPoint: "否定や説得をせず共感して接します。急なせん妄や興奮は感染症や脱水が原因のことがあります。",
 isDisease: true
 },
 "COPD": {
 term: "COPD",
 ruby: "しーおーぴーでぃー (まんせいへいそくせいはいしっかん)",
 meaning: "長年の喫煙等で気道や肺胞が破壊され、慢性的な息切れや咳・痰が続く肺の病気。",
 urgency: " SpO2低下・呼吸苦は即報告",
 urgencyType: "danger",
 checkPoint: "動作を急がせず深呼吸を誘導。HOT（在宅酸素）のカニューラ外れがないか確認します。",
 isDisease: true
 },
 "狭心症": {
 term: "狭心症",
 ruby: "きょうしんしょう",
 meaning: "冠動脈（心臓の血管）が動脈硬化等で狭くなり、一時的に心筋へ血液が不足して胸痛が起きる病気。",
 urgency: " 締め付けられる胸痛は直ちに報告・安静",
 urgencyType: "danger",
 checkPoint: "胸の圧迫感や左肩への放散痛が典型的。発作時は安静にし、指示薬（ニトロ舌下錠等）を確認します。",
 isDisease: true
 },
 "心筋梗塞": {
 term: "心筋梗塞",
 ruby: "しんきんこうそく",
 meaning: "冠動脈が完全に閉塞し、心筋の一部が壊死する、命に関わる急性疾患。",
 urgency: " 激しい胸痛・冷汗・顔面蒼白は即救急要請",
 urgencyType: "danger",
 checkPoint: "安静にしても治まらない強い胸痛が続く（目安15〜20分以上）、ニトロが効かない胸痛、冷汗、嘔吐、意識朦朧は心筋梗塞疑い。直ちに119番です。",
 isDisease: true
 },
 "慢性腎不全": {
 term: "慢性腎不全",
 ruby: "まんせいじんふぜん",
 meaning: "腎臓の老廃物排泄や水分調整の機能が何ヶ月・何年もかけて徐々に低下した状態。",
 urgency: " 浮腫・呼吸苦・倦怠感時は報告",
 urgencyType: "warning",
 checkPoint: "水分制限や塩分制限の指示を守る。透析を行っている場合は、シャントのある腕で血圧を測らない・圧迫しないなど、シャント肢を守ります。",
 isDisease: true
 },
 // [Claude修正 2026-10-08] 追加した用語。各項目とも互いに独立した2つ以上の信頼できる情報源
 // (厚生労働省通知・学会資料・公的病院・MSDマニュアル・健康長寿ネット等) で内容を確認したものだけを記載。
 "浮腫": {
 term: "浮腫（むくみ）",
 ruby: "ふしゅ (むくみ)",
 meaning: "皮膚の下に余分な水分がたまって腫れた状態（むくみ）。",
 urgency: " 観察・報告（息苦しさ・片足だけ等は即報告）",
 urgencyType: "warning",
 checkPoint: "すねや足の甲を指で数秒押し、へこみが残るかを見ます。片足だけか全身か、いつからか、尿量や体重の変化も観察します。急に進む・体重も増えている・息苦しい・片足だけ・強い痛み・突然始まった場合はすぐ看護師へ報告します。衣服のきつい部分を緩め、足を高くするかどうかは看護師・医師の方針に従います。",
 isDisease: false
 },
 "頻脈": {
 term: "頻脈",
 ruby: "ひんみゃく",
 meaning: "安静時の脈が1分間に100回以上と速い状態。",
 urgency: " 観察・報告（症状を伴えば即報告）",
 urgencyType: "warning",
 checkPoint: "運動や緊張の直後は一時的に速くなるため、安静にしてから1分間測り直します。動悸・めまい・胸の痛み・息切れ・気が遠くなる・意識を失う場合はすぐ報告します。初めての頻脈や普段と違う場合も報告します（報告する数値は施設・主治医の基準に従う）。",
 isDisease: false
 },
 "徐脈": {
 term: "徐脈",
 ruby: "じょみゃく",
 meaning: "脈が普段より遅い状態。一般に1分間60回未満（50回以下とする資料もある）をいいます。",
 urgency: " 観察・報告（症状を伴えば即報告）",
 urgencyType: "warning",
 checkPoint: "めまい・息切れ・気が遠くなる・失神がある場合はすぐ報告します。初めての徐脈や普段より遅いときは、血圧も測って看護師へ報告します（報告する数値は施設・主治医の基準に従う）。",
 isDisease: false
 },
 "呼吸促迫": {
 term: "呼吸促迫",
 ruby: "こきゅうそくはく",
 meaning: "呼吸の回数が増えて浅く速くなり、息が苦しそうな状態。",
 urgency: " 即時報告レベル",
 urgencyType: "danger",
 checkPoint: "呼吸数は1分間静かに数えます。肩や首の筋肉を使って息をしている、冷や汗、落ち着きがない、唇や顔色が紫色（チアノーゼ）などがあれば、すぐ看護師へ報告します。",
 isDisease: false
 },
 "口すぼめ呼吸": {
 term: "口すぼめ呼吸",
 ruby: "くちすぼめこきゅう",
 meaning: "鼻から吸い、口を軽くすぼめてゆっくり吐く呼吸法。COPDなどの人の息切れを楽にします。",
 urgency: "ℹ 現場ケア知識",
 urgencyType: "info",
 checkPoint: "ろうそくの火を揺らす程度の強さで、本人のペースでゆっくり吐きます（火を消すほど強く吹かない）。介護職は声かけ・見守りを行い、方法は医師・理学療法士の指導に従います。",
 isDisease: false
 },
 "湿性咳嗽": {
 term: "湿性咳嗽",
 ruby: "しっせいがいそう",
 meaning: "痰がからんだ『ゴホゴホ』という咳。痰のない『コンコン』という咳は乾性咳嗽といいます。",
 urgency: " 観察・報告",
 urgencyType: "warning",
 checkPoint: "痰の色（白・黄色・さび色・血が混じる）や、いつからか、熱の有無を記録して看護師へ伝えます。たんの吸引は、研修を修了して認定を受けた介護職員が、登録された事業所で医師の指示のもとでのみ行えます。",
 isDisease: false
 },
 "悪寒戦慄": {
 term: "悪寒戦慄",
 ruby: "おかんせんりつ",
 meaning: "強い寒気とともに体がガタガタ震えること。血液に細菌が入っているサインのことがあります。",
 urgency: " 即時報告レベル",
 urgencyType: "danger",
 checkPoint: "『毛布をかぶっても全身が震える』など、震えの程度を具体的に伝えます。体温に加えて脈拍・血圧・呼吸の様子も測り、すぐ看護師へ報告します。",
 isDisease: false
 },
 "敗血症": {
 term: "敗血症",
 ruby: "はいけつしょう",
 meaning: "感染症をきっかけに全身に強い反応が起き、臓器がうまく働かなくなる命に関わる状態。",
 urgency: " 即時報告レベル (命に関わる)",
 urgencyType: "danger",
 checkPoint: "発熱または体温の低下、震えを伴う寒気、脈や呼吸が速い、ぼんやりする、尿が減る、皮膚が冷たくまだらになるなどがサインです。高齢者は熱が出ないこともあり『熱がない＝安心』ではありません。疑わしいときはすぐ看護師・医師へ報告します。",
 isDisease: false
 },
 "瞳孔不同": {
 term: "瞳孔不同",
 ruby: "どうこうふどう",
 meaning: "左右の瞳孔（黒目の中心）の大きさが違う状態。正常な瞳孔は丸く、左右の大きさが同じです。",
 urgency: " 気づいたら即報告",
 urgencyType: "danger",
 checkPoint: "左右の瞳孔の大きさに差があることに気づいたら、意識の様子もあわせて、すぐ看護師へ報告します。",
 isDisease: false
 },
 "感覚鈍麻": {
 term: "感覚鈍麻",
 ruby: "かんかくどんま",
 meaning: "触っても感じにくい、熱さ・冷たさや痛みを感じにくいなど、感覚が鈍くなっている状態。",
 urgency: " 突然・体の片側に出た時は即報告",
 urgencyType: "danger",
 checkPoint: "突然始まった、体の片側（片方の手足や顔の半分）に出た場合は脳卒中の可能性があり、すぐ看護師へ報告し救急要請を検討します。お尻まわりのしびれや、尿・便の失禁を伴う場合もすぐ報告します。",
 isDisease: false
 },
 "下顎呼吸": {
 term: "下顎呼吸",
 ruby: "かがくこきゅう",
 meaning: "顎を下に動かし、口を開けてあえぐように息をする呼吸。亡くなる間際にみられます。",
 urgency: " 即時報告（看取り期と急変で対応が異なる）",
 urgencyType: "danger",
 checkPoint: "看取り期の方では、お別れが近いことを示す呼吸です。慌てずに見守り、看護師・医師とご家族へ連絡します。看取りの方針がない方に突然この呼吸が出た場合は、心停止の直後にもみられる呼吸（死戦期呼吸）で普段どおりの呼吸ではないため、直ちに119番通報と胸骨圧迫を行います。",
 isDisease: false
 },
 "誤嚥": {
 term: "誤嚥",
 ruby: "ごえん",
 meaning: "飲食物や唾液が、食道ではなく気管（空気の通り道）に入ってしまうこと。",
 urgency: " 観察・報告（窒息は即対応）",
 urgencyType: "warning",
 checkPoint: "むせずに誤嚥することも多く、むせないから安全とは限りません。食後に痰がからむ、ゴロゴロした声、発熱をくり返す、体重が減る場合は看護師へ報告します。声や咳が出ず苦しそうなときは窒息として直ちに対応し、救急要請します。",
 isDisease: false
 },
 "むせ": {
 term: "むせ",
 ruby: "むせ",
 meaning: "気管に入りそうになった飲食物を、咳で外へ押し出そうとする体の防御反応。",
 urgency: " 観察・報告（咳も声も出なければ窒息）",
 urgencyType: "warning",
 checkPoint: "むせたときは咳を無理に止めず、背中をさするなどしてしっかり咳で出してもらいます。食事でむせることが続く、食後に咳が増える場合は飲み込む力の低下のサインなので看護師へ報告します。咳も声も出なくなったら窒息として直ちに対応します。",
 isDisease: false
 },
 "とろみ": {
 term: "とろみ",
 ruby: "とろみ",
 meaning: "飲み物の流れる速さをゆっくりにして誤嚥を防ぐため、専用の粉（とろみ調整食品）で付けるねばり。",
 urgency: "ℹ 現場ケア知識（濃さは指示どおり）",
 urgencyType: "info",
 checkPoint: "日本摂食嚥下リハビリテーション学会の分類では『薄いとろみ』『中間のとろみ』『濃いとろみ』の3段階があります。どの段階にするかは医師・言語聴覚士・管理栄養士などが決めるもので、介護職の判断で変えません。指示された濃さを守り、むせが増えたら報告します。",
 isDisease: false
 },
 "口腔ケア": {
 term: "口腔ケア",
 ruby: "こうくうけあ",
 meaning: "歯・舌・口の粘膜・入れ歯の汚れや細菌を取り除き、口の病気や誤嚥性肺炎を防ぐケア。",
 urgency: "ℹ 現場ケア知識",
 urgencyType: "info",
 checkPoint: "重度の歯周病などがない場合の、歯ブラシや綿棒などを使った日常の歯みがき・口の中の清拭は、介護職が行えるケアとされています。歯ぐきのまわりや入れ歯の汚れを観察し、重度の歯周病などがある場合は看護師や歯科職に相談します。",
 isDisease: false
 },
 "パタカラ体操": {
 term: "パタカラ体操",
 ruby: "ぱたからたいそう",
 meaning: "『パ・タ・カ・ラ』とはっきり発音して、唇や舌の筋肉を鍛える口の体操。",
 urgency: "ℹ 現場ケア知識",
 urgencyType: "info",
 checkPoint: "パは唇、タは舌の先、カは舌の奥、ラは舌を巻く力を使います。大きくはっきり発音し、唾液が出やすくなるため食事の前に行うと効果的とされています。",
 isDisease: false
 },
 "呑酸": {
 term: "呑酸",
 ruby: "どんさん",
 meaning: "胃の中身が逆流して、酸っぱい液がのどや口まで上がってくる感じ。胸やけと並ぶ胃食道逆流症（逆流性食道炎など）の代表的な症状です。",
 urgency: " 観察・報告（吐血・黒い便は即報告）",
 urgencyType: "warning",
 checkPoint: "横になると悪化しやすいため、食後すぐに横にならないようにします。飲み込みにくい、飲み込むと痛い、吐血、黒い便がある場合は看護師へ報告します。",
 isDisease: false
 },
 "タール便": {
 term: "タール便",
 ruby: "たーるべん",
 meaning: "胃や十二指腸などからの出血が消化されて、コールタールのように黒くドロッとした便。",
 urgency: " 即時報告レベル",
 urgencyType: "danger",
 checkPoint: "鉄剤や黒い食品でも便は黒くなりますが、介護職は自己判断せず、飲んでいる薬（鉄剤・血液をサラサラにする薬など）の情報を添えてすぐ看護師へ報告します。顔色が悪い、冷や汗、ふらつき、意識がぼんやりする場合は出血によるショックのおそれがあり、至急連絡します。",
 isDisease: false
 },
 "ツルゴール": {
 term: "ツルゴール",
 ruby: "つるごーる",
 meaning: "皮膚の張りのこと。つまんだ皮膚の戻りが遅いと『ツルゴール低下』といい、脱水の目安の一つになります。",
 urgency: " 観察・報告",
 urgencyType: "warning",
 checkPoint: "高齢者は脱水がなくても戻りが遅いことがあるため、これだけで判断しません。口や舌の乾燥、わきの下の乾燥、立ちくらみ、だるさ、食欲低下、ぼんやりするなどのサインと合わせて看護師へ報告します。",
 isDisease: false
 },
 "喀痰吸引": {
 term: "喀痰吸引",
 ruby: "かくたんきゅういん",
 meaning: "自分で出せない痰を、吸引器とチューブで吸い取る行為。原則として医行為です。",
 urgency: "ℹ 制度上の知識（条件を満たす職員のみ実施）",
 urgencyType: "info",
 checkPoint: "介護職が行えるのは、研修を修了して都道府県の認定を受けた介護職員など（または登録を受けた介護福祉士）が、登録された事業所で、医師の指示のもと、口の中・鼻の中（のどの手前まで）・気管カニューレ内部に限って行う場合だけです。条件を満たさない職員は行わず、看護職員へ依頼します。吸引後に呼吸が苦しそう、出血、顔色が悪い場合はすぐ報告します。",
 isDisease: false
 },
 "ニトロ": {
 term: "ニトロ",
 ruby: "にとろ (にとろぐりせりんぜっかじょう)",
 meaning: "狭心症の発作のときに、舌の下で溶かして使う薬（ニトログリセリン舌下錠など）。血管を広げて胸の痛みをやわらげます。",
 urgency: " 胸痛発作時は即報告",
 urgencyType: "danger",
 checkPoint: "飲み込むと効きません。血圧が下がって立ちくらみや失神を起こすことがあるため、座った状態で使います。使ってよいか・介助してよいかは施設の取り決めと看護師の指示に従います。一緒に使えない薬（勃起不全などの治療薬）があります。使っても効かない、痛みが長く続くときは直ちに看護師・医師へ連絡し、救急要請を検討します。",
 isDisease: false
 },
 "抗凝固薬": {
 term: "抗凝固薬",
 ruby: "こうぎょうこやく",
 meaning: "血液を固まりにくくして、脳梗塞などを防ぐ薬（ワルファリンなど）。その分、出血しやすく血が止まりにくくなります。",
 urgency: " 重い出血のサインは即報告",
 urgencyType: "warning",
 checkPoint: "あざが増える・広がる、歯ぐきや鼻からの出血は報告します。血便・黒い便・血尿・血を吐く・ひどい頭痛や嘔吐、止血しても止まらない出血はすぐ報告します。転倒して頭を打った場合も報告します。納豆などの食事制限はワルファリンだけの注意です。飲み忘れても2回分をまとめて飲ませません。",
 isDisease: false
 },
 "尿閉": {
 term: "尿閉",
 ruby: "にょうへい",
 meaning: "膀胱に尿がたまっているのに、まったく、またはほとんど出せない状態。",
 urgency: " 即時報告レベル",
 urgencyType: "danger",
 checkPoint: "下腹部が張って強く痛がる、長い時間尿が出ていない場合はすぐ看護師へ報告します。前立腺肥大や一部の薬、便秘がきっかけになることがあり、前立腺肥大の人では風邪薬や飲酒がきっかけになることもあります。管を入れて尿を出す処置は医療職が行います。",
 isDisease: false
 },
 "摘便": {
 term: "摘便",
 ruby: "てきべん",
 meaning: "自力で出せない直腸の硬い便を、指で取り出す処置。",
 urgency: "ℹ 介護職は実施しない（看護師が行う）",
 urgencyType: "info",
 checkPoint: "介護職が行える行為として国の通知に挙げられていないため、介護職は行わず看護師に依頼します。排便のない日数やお腹の張りを観察して看護師へ伝えます。",
 isDisease: false
 },
 "浣腸": {
 term: "浣腸",
 ruby: "かんちょう",
 meaning: "肛門から薬液を入れて排便をうながす方法。",
 urgency: "ℹ 現場ケア知識（条件付きで介護職も可）",
 urgencyType: "info",
 checkPoint: "市販の使い捨てグリセリン浣腸器（挿入部5〜6cm程度以内、濃度50%、成人用40g程度以下）を使う浣腸は、介護職が行える行為とされています。立ったままの浣腸は直腸を傷つける危険があるため、左側を下にした横向きで行い、抵抗を感じたら無理に進めません。体調が不安定なときは看護師に相談します。",
 isDisease: false
 },
 "導尿": {
 term: "導尿",
 ruby: "どうにょう",
 meaning: "尿道から膀胱に細い管（カテーテル）を入れて尿を出す処置。",
 urgency: "ℹ 介護職は管を入れない",
 urgencyType: "info",
 checkPoint: "介護職ができるのは、自分で導尿する人のために道具を準備したり体位を保ったりする補助までで、管を入れることは行いません。痛み、尿の濁り、血尿、管が入りにくいときは看護師へ相談します。",
 isDisease: false
 },
 "バルーン": {
 term: "バルーン",
 ruby: "ばるーん (ぼうこうりゅうちかてーてる)",
 meaning: "膀胱に管（膀胱留置カテーテル）を入れたままにして、尿を袋（蓄尿バッグ）にためる仕組み。",
 urgency: " 尿が流れずお腹が張る時は即報告",
 urgencyType: "warning",
 checkPoint: "介護職ができるのは、袋にたまった尿を捨てる、尿の量や色を確認する、外れたテープを決められた位置に貼り直すなどです。管の挿入・抜去・交換は行いません。袋は膀胱より低く床につけず、管が折れたり引っ張られたりしないようにします。尿が流れずお腹が張るときはすぐ、血尿・濁り・発熱は看護師へ報告します。",
 isDisease: false
 },
 "腎盂腎炎": {
 term: "腎盂腎炎",
 ruby: "じんうじんえん",
 meaning: "細菌が膀胱からさかのぼって腎臓に入って起こる感染症。",
 urgency: " 即時報告レベル",
 urgencyType: "danger",
 checkPoint: "寒気・発熱・腰の痛み・吐き気が典型的ですが、高齢者は尿の症状がなく、混乱や発熱だけのこともあります。重くなると敗血症になるおそれがあるため、発熱や意識の変化があればすぐ看護師へ報告します。膀胱留置カテーテルの人の発熱は特に注意します。",
 isDisease: false
 },
 "発赤": {
 term: "発赤",
 ruby: "ほっせき",
 meaning: "皮膚が赤くなっている状態。押しても消えない赤みは床ずれ（褥瘡）の始まりのサインです。",
 urgency: " 観察・報告",
 urgencyType: "warning",
 checkPoint: "赤い部分を指で軽く押し、白く消えるかを見ます。消えない赤みは褥瘡の初期として看護師へ報告し、その部分に圧がかからないようにします。褥瘡の処置は介護職は行いません。",
 isDisease: false
 },
 "水疱": {
 term: "水疱",
 ruby: "すいほう",
 meaning: "皮膚の下に液体がたまってできる水ぶくれ。",
 urgency: " 観察・報告",
 urgencyType: "warning",
 checkPoint: "床ずれ（褥瘡）が赤みの次に進むと水ぶくれになることがあります。高齢者では強いかゆみの後に大きな水ぶくれができる皮膚の病気もあります。見つけたら看護師へ報告し、処置は医療職が行います。",
 isDisease: false
 },
 "皮下出血": {
 term: "皮下出血",
 ruby: "ひかしゅっけつ",
 meaning: "皮膚の下で出血して、紫や青のあざになった状態。",
 urgency: " 観察・報告",
 urgencyType: "warning",
 checkPoint: "高齢者は皮膚や血管がもろく、軽くぶつけただけでもできます。血液をサラサラにする薬を飲んでいる人はできやすくなります。あざが増えた、鼻血・血尿・黒い便などがある場合は看護師へ報告します。原因のわからないあざは、形・色・場所・大きさを記録して報告します（虐待の早期発見の視点も大切です）。",
 isDisease: false
 },
 "スキンテア": {
 term: "スキンテア",
 ruby: "すきんてあ (ひふれっしょう)",
 meaning: "摩擦やずれによって、もろくなった皮膚が裂けるけが（皮膚裂傷）。",
 urgency: " 観察・報告",
 urgencyType: "warning",
 checkPoint: "ベッド柵や車いすにぶつけたとき、腕を持ち上げてこすれたときに起こりやすいです。保湿やアームカバー・長い靴下で予防します。起きたときは看護師へ報告し、処置は看護師の指示に従います。",
 isDisease: false
 },
 "背抜き": {
 term: "背抜き",
 ruby: "せぬき",
 meaning: "ベッドの背を上げた後、体をいったん少し浮かせて、背中のずれや圧を取り除く方法。",
 urgency: "ℹ 現場ケア知識",
 urgencyType: "info",
 checkPoint: "背上げをすると背中にずれが生じるため、背抜きでずれを解消し床ずれを予防します。背上げは先に足側、次に頭側を上げ、戻すときは頭側を下げてから足側を下げます。",
 isDisease: false
 },
 "見当識障害": {
 term: "見当識障害",
 ruby: "けんとうしきしょうがい",
 meaning: "今がいつか、ここがどこか、周りの人が誰かといった、自分の置かれた状況がわかりにくくなる状態。",
 urgency: "ℹ 現場ケア知識（急な悪化は報告）",
 urgencyType: "info",
 checkPoint: "多くは時間→場所→人の順にわかりにくくなります。時計やカレンダーで手がかりを補い、伝えたいことは会話の中で繰り返します。急に悪くなったときは、せん妄など体の病気が原因のことがあるため看護師へ報告します。",
 isDisease: false
 },
 "夕暮れ症候群": {
 term: "夕暮れ症候群",
 ruby: "ゆうぐれしょうこうぐん",
 meaning: "認知症の人が、夕方ごろに混乱したり不安になったり落ち着かなくなったりする状態（日没症候群）。",
 urgency: " 観察・報告",
 urgencyType: "warning",
 checkPoint: "午後早めに部屋を明るくし、騒音を減らして落ち着いた態度で接します。入浴などの予定は午前中にし、夕方に予定を詰めないようにします。行動の内容・きっかけ・時刻を記録し、痛み・便秘・尿閉・息苦しさなど体の原因がないか、いつもと違う変化は看護師へ報告します。",
 isDisease: false
 },
 "帰宅願望": {
 term: "帰宅願望",
 ruby: "きたくがんぼう",
 meaning: "施設などで暮らす認知症の人が『家に帰りたい』と繰り返し訴える状態。",
 urgency: "ℹ 現場ケア知識",
 urgencyType: "info",
 checkPoint: "無理に止めたり理屈で説得したりせず、まず本人の思いと理由を聞きます。生活習慣、騒音や明るさ、人間関係、排泄・睡眠・痛みなどの体調が関わることがあり、体調の変化が背景にありそうなときは看護師へ報告します。対応の前後の様子を記録します。",
 isDisease: false
 },
 "徘徊": {
 term: "徘徊",
 ruby: "はいかい",
 meaning: "認知症の人が一人で歩き回ったり外出したりして、道に迷うことがある状態。",
 urgency: " 所在不明時は即報告",
 urgencyType: "warning",
 checkPoint: "むやみに閉じ込めず、付き添って歩き、満足したら誘導します。声をかけるときは後ろから急に話しかけず、視野に入ってからゆっくり近づきます。外出後は脱水や足の痛みにも注意します。姿が見えなくなったら施設の手順に沿ってすぐ報告・捜索します。",
 isDisease: false
 },
 "不穏": {
 term: "不穏",
 ruby: "ふおん",
 meaning: "落ち着きがなく、行動が活発になっている状態。叫ぶ・暴れるなども含みます。",
 urgency: " 観察・報告（急な発症・危険時は即報告）",
 urgencyType: "warning",
 checkPoint: "不穏は病名ではなく行動を表す言葉で、痛み、息苦しさ、強い不安、便秘、尿閉、薬の影響、せん妄などが原因のことがあります。安全を確保し、具体的な行動・きっかけ・時刻を記録して看護師へ報告します。急に始まった、息苦しさがある、危険な行動がある場合はすぐ報告します。",
 isDisease: false
 },
 "心気症": {
 term: "心気症",
 ruby: "しんきしょう",
 meaning: "医学的に十分な説明がつかない体の症状について、『重い病気にかかっているのではないか』という恐怖や思い込みにとらわれる状態。高齢者によく見られる神経症のひとつです。",
 urgency: " 観察・報告",
 urgencyType: "warning",
 checkPoint: "訴えを『いつものこと』と決めつけず、新しい症状や今までと違う症状は看護師へ報告します。",
 isDisease: false
 },
 "間欠性跛行": {
 term: "間欠性跛行",
 ruby: "かんけつせいはこう",
 meaning: "しばらく歩くと足が痛む・しびれる・だるくなって歩けなくなり、少し休むとまた歩けるようになる状態。",
 urgency: " 観察・報告",
 urgencyType: "warning",
 checkPoint: "腰の神経が圧迫される腰部脊柱管狭窄症や、足の血管が細くなる閉塞性動脈硬化症が主な原因で、見分けるのは難しいとされます。歩ける距離、休むと治まるか、足の冷えや色を記録して看護師へ報告し、受診につなげます。",
 isDisease: false
 },
 "尖足": {
 term: "尖足",
 ruby: "せんそく",
 meaning: "足首がつま先の下がる方向に曲がったまま固まり、元に戻らなくなった状態。",
 urgency: "ℹ 現場ケア知識（予防）",
 urgencyType: "info",
 checkPoint: "寝ている人は掛け布団の重みが足の甲にかからないようにし、姿勢の工夫で予防します。ストレッチや装具は理学療法士・医師の指示に沿って行い、足首が硬くなってきたら報告します。",
 isDisease: false
 },
 "脱健着患": {
 term: "脱健着患",
 ruby: "だっけんちゃっかん (だっけんちゃくかん)",
 meaning: "片側にまひや痛みがある人の着替えの原則。脱ぐときは健側（まひのない側）から、着るときは患側（まひのある側）から行います。",
 urgency: "ℹ 現場ケア知識",
 urgencyType: "info",
 checkPoint: "まひや痛みのある側に負担をかけないための順序です。ズボンの上げ下ろしで手すりから手を離すと転びやすくなるため、立った姿勢が安定しているか確認します。",
 isDisease: false
 },
 "クロックポジション": {
 term: "クロックポジション",
 ruby: "くろっくぽじしょん",
 meaning: "目の不自由な人に、物の位置を時計の文字盤にたとえて伝える方法（例:『2時の方向にお茶』）。",
 urgency: "ℹ 現場ケア知識",
 urgencyType: "info",
 checkPoint: "食事のときは器や料理の位置を時計の時刻で伝えます。声をかけるときは背後からではなく斜め前から名前を呼び、いきなり手を取らず、『あれ』『これ』ではなく具体的に伝えます。",
 isDisease: false
 },
 "ACP": {
 term: "ACP",
 ruby: "えーしーぴー (じんせいかいぎ)",
 meaning: "もしものときに望む医療やケアについて、本人が前もって考え、家族や医療・ケアチームと繰り返し話し合って共有する取り組み（愛称『人生会議』）。",
 urgency: "ℹ 意思決定の支援",
 urgencyType: "info",
 checkPoint: "気持ちは変わりうるため、何度でも話し合います。本人の意思が基本で、確認できないときは家族などが推定した本人の意思を尊重し、多職種のチームで決めます。介護職は日々の会話で聞いた本人の思いを記録し、チームで共有します。",
 isDisease: false
 },
 "フレイル": {
 term: "フレイル",
 ruby: "ふれいる",
 meaning: "年をとって体や心の働き（予備力）が落ち、病気やけがをしやすくなった状態。健康な状態と介護が必要な状態の中間にあたる。",
 urgency: "ℹ 早めの気づきと予防",
 urgencyType: "info",
 checkPoint: "適切な支援で健康な状態に戻ることもあります。食事量・体重の減少、疲れやすさ、歩く速さの低下、活動量の低下に気づいたら記録し、看護師・ケアマネジャーと共有します。",
 isDisease: false
 },
 "サルコペニア": {
 term: "サルコペニア",
 ruby: "さるこぺにあ",
 meaning: "年齢や病気によって筋肉の量が減り、筋力や体の動きが落ちた状態。フレイルの大きな原因になる。",
 urgency: "ℹ 転倒・寝たきりに注意",
 urgencyType: "info",
 checkPoint: "転倒・骨折や寝たきりの原因になります。低栄養と強く関係するため、食事量の低下や体重の減少があれば看護師・栄養士へ共有します。",
 isDisease: false
 },
 "廃用症候群": {
 term: "廃用症候群",
 ruby: "はいようしょうこうぐん",
 meaning: "体を動かさない状態が続くことで、体や頭、心の働きが落ちる状態。生活不活発病とも呼ぶ。",
 urgency: " 安静のとりすぎに注意",
 urgencyType: "warning",
 checkPoint: "関節が固くなる（関節拘縮）、筋力低下、立ちくらみ、疲れやすさ、意欲の低下などが起こり、認知症と間違われることもあります。どこまで動いてよいかは医師・看護師の指示を確認し、できることはご本人に行ってもらいます。",
 isDisease: false
 },
 "JCS（ジャパン・コーマ・スケール）": {
 term: "JCS（ジャパン・コーマ・スケール）",
 ruby: "じぇーしーえす",
 meaning: "意識の状態を数字で表す方法。Ⅰ桁（1・2・3）は刺激しなくても目を覚ましている、Ⅱ桁（10・20・30）は刺激すると目を覚ます、Ⅲ桁（100・200・300）は刺激しても目を覚まさない状態。",
 urgency: " 意識の変化は即報告",
 urgencyType: "danger",
 checkPoint: "数字が大きいほど意識の状態が悪いことを示します。普段より呼びかけへの反応が悪い、目を覚まさないときは、直ちに看護師へ連絡します。",
 isDisease: false
 },
 "誤薬": {
 term: "誤薬",
 ruby: "ごやく",
 meaning: "違う薬を飲ませた、飲ませる時間や量を間違えた、飲ませ忘れた、薬を落としたなど、薬を正しく飲ませられなかったこと。",
 urgency: " 気づいたら即報告",
 urgencyType: "danger",
 checkPoint: "介護事故の報告の対象です。気づいたら直ちに看護師へ報告します。家族や市町村への報告は、施設の決まりと自治体の要領に従います。",
 isDisease: false
 }
};

// [Claude修正] 同じ意味の別の言い方でも同じ解説を表示する
MEDICAL_TERMS_DICTIONARY["むくみ"] = MEDICAL_TERMS_DICTIONARY["浮腫"];
MEDICAL_TERMS_DICTIONARY["吸引"] = MEDICAL_TERMS_DICTIONARY["喀痰吸引"];
MEDICAL_TERMS_DICTIONARY["生活不活発病"] = MEDICAL_TERMS_DICTIONARY["廃用症候群"];
MEDICAL_TERMS_DICTIONARY["JCS"] = MEDICAL_TERMS_DICTIONARY["JCS（ジャパン・コーマ・スケール）"];

// [Claude修正 2026-10-14] 医療・介護の説明は、互いに独立した2つ以上の資料で一致を確かめたもの、
// または国・公的機関・学会など医療として確証のある一次資料で確かめたものだけを、資料（URL）を記録して表示する（ユーザー指示「確定事項だけ。医療の誤情報は命にかかわる」）。
// この一覧にない語は説明を出さず、文中でも押せる語にしない（名前だけの普通の文字になる）。
// 資料で確かめて記録したら、ここに足して戻す。根拠の一覧: プロジェクトの claude/byoureki_sources_confirmed_20261014.tsv
const CP_VERIFIED_TERMS = new Set([
 "ヒートショック", "低血糖発作", "パーキンソン病", "心筋梗塞",
 "浮腫", "むくみ", "頻脈", "徐脈", "口すぼめ呼吸", "湿性咳嗽", "敗血症", "瞳孔不同", "感覚鈍麻",
 "誤嚥", "むせ", "口腔ケア", "呑酸", "タール便", "ツルゴール", "喀痰吸引", "吸引", "ニトロ", "尿閉", "摘便", "浣腸",
 "発赤", "水疱", "皮下出血", "背抜き", "見当識障害", "夕暮れ症候群", "徘徊", "心気症", "間欠性跛行",
 "ACP", "フレイル", "サルコペニア", "廃用症候群", "生活不活発病", "JCS（ジャパン・コーマ・スケール）", "JCS", "誤薬",
 // 国・公的機関・学会など、医療として確証のある一次資料1つで確かめた語（2026-10-14 ユーザーと決定）
 "SpO2", "HOT", "在宅酸素療法", "悪性症候群", "交互嚥下"
]);
Object.keys(MEDICAL_TERMS_DICTIONARY).forEach(k => {
 if (!CP_VERIFIED_TERMS.has(k)) delete MEDICAL_TERMS_DICTIONARY[k];
});

// 高齢者施設 現場ケア辞書 (主要疾患・症候群)
const DISEASE_GUIDE = {
 "糖尿病": {
 symptoms: "【低血糖】冷や汗・手のふるえ・動悸・強い空腹感など。進むと意識がなくなることがある。",
 care_points: "【現場介護の実践ケア】①いつもと様子が違う（冷や汗・ふるえ・ぼんやり）ときは低血糖を疑い、看護師へ伝える。②αグルコシダーゼ阻害薬（ベイスン・グルコバイ・セイブル）を飲んでいる方は、砂糖ではなくブドウ糖を使う。何をどれだけ口にするかは看護師・医師の指示に従う。報告の目安や対応は、施設・主治医・看護師の指示を優先する。",
 emergency: "【看護師・医師への報告基準】低血糖の症状があれば直ちに看護師へ。意識がない・呼びかけに反応しないときは病院の受診が必要（救急要請は施設の手順に従う）。"
 },
 "心不全": {
 symptoms: "息切れ、夜間の咳、足などのむくみ、急な体重の増加。",
 care_points: "【現場介護の実践ケア】①毎日体重を測り、1週間で2kg以上増えていないか確認する（主治医の指示値があればそれを優先）。②むくみ・息切れ・夜間の咳の変化を記録し看護師へ伝える。③水分・塩分の制限がある方は指示量を守る。報告の目安や対応は、施設・主治医・看護師の指示を優先する。",
 emergency: "【看護師・医師への報告基準】横になると苦しく座ると楽になる（起坐呼吸）、気を失った（失神）ときは急いで看護師・医師へ（救急要請は施設の手順に従う）。体重が1週間で2kg以上増えたときも看護師へ報告。"
 },
 "高血圧": {
 symptoms: "血圧の高い状態が続く病気。基準は診察室で140/90 mmHg以上、家庭で135/85 mmHg以上（どちらか一方でも満たせば高血圧）。放置すると脳卒中・心臓病・腎臓病などの原因になる。",
 care_points: "【現場介護の実践ケア】①食事は減塩が重要（形態・量は施設の食事指示に従う）。②血圧の薬は指示どおりに飲めているか確認する。③報告する血圧の数値は、看護師が設定したバイタル注意基準に従う。報告の目安や対応は、施設・主治医・看護師の指示を優先する。",
 emergency: "【看護師・医師への報告基準】顔の片側がゆがむ・片方の腕に力が入らない・言葉が出ない／ろれつが回らない、のどれか1つでもあれば脳卒中の疑い。様子を見ずに発症時刻を確認し、直ちに看護師へ連絡・119番。"
 },
 "誤嚥性肺炎": {
 symptoms: "高齢者では熱や咳などの典型的な症状が出ないことが多い。「元気がない」「食欲がない」「ぼんやりしている」が手がかりになる。食事中のむせ。",
 care_points: "【現場介護の実践ケア】①口腔ケアを丁寧に行う。②食事中のむせに注意する。③食後すぐに横にならない（時間は施設・主治医の指示に従う）。④食形態は施設の指示を守る。報告の目安や対応は、施設・主治医・看護師の指示を優先する。",
 emergency: "【看護師・医師への報告基準】元気がない・食欲がない・ぼんやりしている・むせが増えたなど、いつもと違うときは早めに看護師へ相談する。"
 },
 "誤嚥性肺炎既往": {
 symptoms: "過去に誤嚥性肺炎になったことがある。高齢者では熱や咳などの典型的な症状が出ないことが多く、「元気がない」「食欲がない」「ぼんやりしている」が再発の手がかりになる。",
 care_points: "【現場介護の実践ケア】①口腔ケアを丁寧に行う。②食事中のむせに注意する。③食後すぐに横にならない（時間は施設・主治医の指示に従う）。④食形態は施設の指示を守る。報告の目安や対応は、施設・主治医・看護師の指示を優先する。",
 emergency: "【看護師・医師への報告基準】元気がない・食欲がない・ぼんやりしている・むせが増えたなど、いつもと違うときは早めに看護師へ相談する。"
 },
 "嚥下障害": {
 symptoms: "食事中のむせ、食べこぼし、食事に時間がかかる、食後に口の中に食べ物が残る、痰が増える・咳込む、ガラガラ声、発熱を繰り返す（原因のわからない発熱）、体重が減る。",
 care_points: "【現場介護の実践ケア】①食形態（きざみ・とろみ等）と一口量は、嚥下の評価・施設の指示を守る。②食後に口の中に残っていないか確認し、口腔ケアを行う。③むせ・食べこぼし・食事時間の変化を記録する。報告の目安や対応は、施設・主治医・看護師の指示を優先する。",
 emergency: "【看護師・医師への報告基準】「主な症状」にあるような変化が見られたら、早めに看護師へ相談する。"
 },
 "脳梗塞後遺症": {
 symptoms: "運動障害（半身の麻痺など）、筋肉のこわばり、感覚障害、高次脳機能障害、精神機能の障害、排尿の障害などが、ひとつ、または重なって残ることがある。程度は人によって違う。",
 care_points: "【現場介護の実践ケア】①寝たきりが続くと、筋力の低下・床ずれ・起き上がったときのめまい・便秘・骨が弱くなるなど（廃用症候群）が起こりやすいので、活動を落とさない。②良い姿勢（良肢位）を保ち、体の向きを定期的に変える。③介助の方法・リハビリの内容はリハビリ職・看護師の指示に従う。報告の目安や対応は、施設・主治医・看護師の指示を優先する。",
 emergency: "【看護師・医師への報告基準】顔の片側がゆがむ・片方の腕に力が入らない・言葉が出ない／ろれつが回らない、のどれか1つでも新しく出たら再発（脳卒中）の疑い。様子を見ずに発症時刻を確認し、直ちに看護師へ連絡・119番。"
 },
 "パーキンソン病": {
 symptoms: "手足のふるえ、動作がゆっくりになる、筋肉のこわばり（筋固縮）、バランスがとりにくく転びやすい。便秘や睡眠の障害も起こりやすい。食後や排尿後に血圧が下がる（起立性低血圧）ことがあり、飲み込みにくくなることもある。",
 care_points: "【現場介護の実践ケア】①薬は自己判断でやめない・減らさない。指示どおりの時間に飲めているか確認する。②転びやすいため移動時は見守る。食後・排尿後の立ち上がりはふらつきに注意する。③食事中のむせに注意する。④幻覚が見られたら医師へ相談する（看護師を通して）。報告の目安や対応は、施設・主治医・看護師の指示を優先する。",
 emergency: "【看護師・医師への報告基準】薬を急にやめたあとなどに、高い熱・意識がはっきりしない・体が強くこわばる（悪性症候群の疑い）ときは直ちに看護師・医師へ。"
 },
 "骨粗鬆症": {
 symptoms: "骨がもろくなり、軽い衝撃でも背骨・手首・太ももの付け根（大腿骨頚部）などが骨折しやすい。",
 care_points: "【現場介護の実践ケア】①転倒を防ぐ環境づくり（足元を明るくする、電気コードなどつまずく物を片付ける）。②移乗や介助で無理な力をかけない。報告の目安や対応は、施設・主治医・看護師の指示を優先する。",
 emergency: "【看護師・医師への報告基準】転倒したときは動かさずに看護師へ連絡する（頭を打った場合は「転倒・頭部打撲後」のガイドも参照）。"
 },
 "認知症": {
 symptoms: "【中核症状】もの忘れ（新しいことを覚えられない、同じことを何度も言う・聞く）、見当識障害（時間・場所・季節がわからない、慣れた場所で迷う）、理解・判断力の障害、物事を順序立てて進められない（実行機能障害）。【行動・心理症状】不安・イライラ、物を盗られたという妄想、歩き回る、幻覚、昼夜逆転、気分の落ち込み、興奮。",
 care_points: "【現場介護の実践ケア】①まずは見守り、さりげなく様子を見る。②後ろから声をかけず、視野に入ってから声をかける。③やさしい口調で、おだやかにはっきり話す。④声かけはひとりで行い、複数で囲まない。⑤余裕をもって接し、一つずつ丁寧に伝える。⑥本人の言葉に耳を傾け、急かさない。報告の目安や対応は、施設・主治医・看護師の指示を優先する。",
 emergency: "【看護師・医師への報告基準】生活の中で「今までとちがう」と感じる変化があれば、看護師へ伝える。"
 },
 "骨折（大腿骨・圧迫骨折）": {
 symptoms: "高齢者では大腿骨頚部骨折・脊椎圧迫骨折・手首（橈骨遠位端）や肩（上腕骨）の骨折が多い。多くは転倒などをきっかけに痛みや変形が出る。変形が軽い、転んでいない、認知症で痛みがはっきりしない場合は、気づきにくいことがある。",
 care_points: "【現場介護の実践ケア】①長く安静にしていると、筋力の低下・認知症・肺炎・床ずれから寝たきりにつながることがあるため、リハビリは指示に沿って進める。②住環境を整え、転ばない環境をつくる。③骨粗鬆症の治療（薬）は指示どおり続ける。報告の目安や対応は、施設・主治医・看護師の指示を優先する。",
 emergency: "【看護師・医師への報告基準】転倒したときは動かさずに看護師へ連絡する（頭を打った場合は「転倒・頭部打撲後」のガイドも参照）。転んでいなくても、痛がる・動かしたがらない様子があれば看護師へ伝える。"
 },
 "慢性腎不全（CKD・透析）": {
 symptoms: "初期は症状がなく、少しずつ進む。進むと、むくみ・吐き気・食欲不振・眠れない・だるさ・不整脈などが出ることがある。",
 care_points: "【現場介護の実践ケア】①塩分・たんぱく質・カリウム・水分は、主治医・栄養士の指示量を守る（透析中の方の水分はできるだけ少なくとされる）。②シャントのある腕では血圧を測らない・採血しない。③シャントの音や振動（スリル）がいつもどおりかは、看護師の指示に沿って確認する。報告の目安や対応は、施設・主治医・看護師の指示を優先する。",
 emergency: "【看護師・医師への報告基準】むくみ・吐き気・食欲不振・だるさが強くなったとき、シャントの音や振動がいつもと違うときは看護師へ報告する。"
 },
 "慢性閉塞性肺疾患 (COPD・喘息)": {
 symptoms: "悪化（増悪）のサイン：動くと息切れがいつもより強く回復が遅い、咳や痰が増える・痰が切れにくい・色が変わる、安静時も息苦しい、ぜーぜー・ヒューヒューする、食欲が落ちる、だるくて動きたくない、口をすぼめて息をする。",
 care_points: "【現場介護の実践ケア】①吸入薬は指示どおりに使えているか確認する。②「主な症状」にある悪化のサインがないか毎日見る。報告の目安や対応は、施設・主治医・看護師の指示を優先する。",
 emergency: "【看護師・医師への報告基準】悪化のサインが1つでもあれば看護師へ報告する。SpO2がいつもより3〜4%低い、または90%未満のときも報告する（主治医の指示値があればそれを優先）。"
 },
 "不整脈・心房細動": {
 symptoms: "動悸、胸の痛みや不快感、ふらつき、全身のだるさ。心房細動では心臓に血のかたまりができ、脳の血管に詰まって脳梗塞を起こすことがある（広い範囲で重くなりやすい）。",
 care_points: "【現場介護の実践ケア】①血液をサラサラにする薬（抗凝固薬）は出血しやすくなるため、出血やあざに気をつける。②ワーファリンを飲んでいる方は、納豆・青汁・クロレラなどを避ける。③ほかの病院・診療科を受診するときは、この薬を飲んでいることを伝える。報告の目安や対応は、施設・主治医・看護師の指示を優先する。",
 emergency: "【看護師・医師への報告基準】手足のしびれ・見え方の異常・ろれつが回らないなど脳梗塞が疑われるときは、直ちに看護師へ連絡・119番。"
 },
 "白内障・緑内障（視覚障害）": {
 symptoms: "【白内障】かすむ・ぼやける、まぶしい、視力がゆっくり下がる、物が二重に見える、瞳が白く見える。【緑内障】見えない部分が少しずつ出て、見える範囲が狭くなる。初期は気づきにくく、失った視野は戻らない。",
 care_points: "【現場介護の実践ケア】①進行がゆっくりなので、見えにくさによる行動の変化（外出を避ける、趣味をやめる）に周囲が気づく。②目薬は指示どおりに使う。報告の目安や対応は、施設・主治医・看護師の指示を優先する。",
 emergency: "【看護師・医師への報告基準】目の痛み・充血・かすみ・頭痛・吐き気がそろって急に出たときは急性緑内障発作の疑い（一晩で失明することもある）。直ちに看護師へ連絡し、すぐ眼科の受診が必要。瞳が白くなったときも早めに看護師へ。"
 },
 "老人性難聴": {
 symptoms: "高い音から聞こえにくくなることが多い。本人は気づかないことが多く、聞き返し・聞き間違い・的外れな返事が増える。会話が減って孤独感から閉じこもりがちになることがある。",
 care_points: "【現場介護の実践ケア】①静かな場所で、顔・口元が見える明るい所で話す。②大きすぎない声で、ゆっくりはっきり、短い文で話す。③話しかける前に声かけや合図をし、話題を先に伝える。④筆談用のメモを用意する。⑤焦らず時間をかけて会話する。報告の目安や対応は、施設・主治医・看護師の指示を優先する。",
 emergency: "【看護師・医師への報告基準】聞こえ方が急に変わったときは看護師へ伝える。"
 },
 "狭心症・心筋梗塞既往": {
 symptoms: "【狭心症】胸の中央の圧迫感や締めつけられるような痛み（安定した狭心症では10分以内におさまる）。発作が頻繁になるときは不安定狭心症が疑われる。【心筋梗塞】急に冷や汗を伴う胸の痛み、経験したことのない強い胸苦しさ。",
 care_points: "【現場介護の実践ケア】①胸の痛みや苦しさの訴えがあれば、時間・続いた長さを記録し看護師へ伝える。②薬は指示どおりに飲めているか確認する。報告の目安や対応は、施設・主治医・看護師の指示を優先する。",
 emergency: "【看護師・医師への報告基準】冷や汗を伴う胸の痛み、経験したことのない強い胸苦しさは心筋梗塞の疑い。直ちに看護師へ連絡・119番。発作が頻繁になったときも看護師へ。"
 },
 "変形性関節症・リウマチ": {
 symptoms: "【変形性関節症】関節の変形と痛み。【関節リウマチ】朝起きたときに指や膝などの関節が腫れぼったく動かしにくい（こわばり、動かすうちに楽になる）、手首や指の関節が左右同時に腫れる、進むと関節が変形する。だるさ・食欲不振・発熱・貧血が出ることもある。",
 care_points: "【現場介護の実践ケア】①痛みが強いときは安静にし、関節に負担をかけない。②関節を冷やさず温める。③ベッド・椅子・洋式トイレなど、膝や股関節に負担の少ない生活にする。④杖は痛む関節の反対側の手で持つ。報告の目安や対応は、施設・主治医・看護師の指示を優先する。",
 emergency: "【看護師・医師への報告基準】痛み・腫れが強くなったとき、手足のしびれや麻痺が出たときは看護師へ伝える。"
 },
 "脊柱管狭窄症・腰痛症": {
 symptoms: "腰や背中の痛み、足の痛み・しびれ。歩くと太ももや膝から下に痛み・しびれが出て、前かがみになる・座ると楽になり、また歩ける（間欠性跛行）。進むと歩ける距離が短くなる。排尿・排便の障害が出ることもある。",
 care_points: "【現場介護の実践ケア】①杖やシルバーカーを使い、腰を少しかがめて歩くと楽になる。②重い物は体の近くで持ち、体をそらさない。③椅子には深く腰かけ、長時間座りっぱなしにしない。報告の目安や対応は、施設・主治医・看護師の指示を優先する。",
 emergency: "【看護師・医師への報告基準】歩ける距離が短くなった、安静時も痛み・しびれが強い、排尿・排便の障害が出たときは看護師へ伝える。"
 },
 "慢性便秘症・イレウス注意": {
 symptoms: "【便秘】お腹の不快感・張り・腹痛・吐き気・嘔吐。放置すると腸閉塞などを招くおそれがある。薬が原因になることもある。【腸閉塞（イレウス）】激しい腹痛、吐き気・嘔吐、お腹の張り、便やおならが出ない。お腹の手術をしたことがある方は起こりやすい。",
 care_points: "【現場介護の実践ケア】①食事のときや食間に水分をとる（制限のある方は指示量を守る）。②食物繊維と食事量を確保し、1日3食規則正しく。③毎朝一定の時間にトイレに行くなど、排便の習慣をつける。④適度な運動。⑤排便の記録をつける。報告の目安や対応は、施設・主治医・看護師の指示を優先する。",
 emergency: "【看護師・医師への報告基準】腹痛・吐き気・嘔吐・お腹の張りがあり便やおならが出ないときは腸閉塞の疑いで看護師へ。激しい痛み・発熱・ぐったりする・意識がおかしいときは直ちに看護師へ連絡（すぐに受診が必要）。"
 },
 "逆流性食道炎・胃潰瘍": {
 symptoms: "【逆流性食道炎】胸やけ、すっぱいものが上がってくる。胸の痛みや咳が出ることもある。【胃潰瘍】みぞおちの痛み、胸やけ、吐き気・嘔吐、食欲不振、貧血。出血すると吐血や黒い便（タール便）が出る。原因はピロリ菌と痛み止めの薬（NSAID）が多い。",
 care_points: "【現場介護の実践ケア】①薬は症状が消えても指示された期間続ける。②便の色（黒くないか）に気をつける。③胸の痛みは心臓の病気のこともあるので、自己判断せず看護師へ伝える。報告の目安や対応は、施設・主治医・看護師の指示を優先する。",
 emergency: "【看護師・医師への報告基準】吐血、黒い便（タール便）、ひどい腹痛があるときは直ちに看護師へ連絡。"
 },
 "脂質異常症（高脂血症）": {
 symptoms: "放置すると動脈硬化が進み、狭心症・心筋梗塞・脳梗塞・足の動脈が詰まる病気（閉塞性動脈硬化症）の原因になる。",
 care_points: "【現場介護の実践ケア】①食事療法（カロリーと脂質の制限）は施設の食事指示に従う。②適度な運動。③薬は指示どおりに飲めているか確認する。報告の目安や対応は、施設・主治医・看護師の指示を優先する。",
 emergency: "【看護師・医師への報告基準】薬を飲んでいる方で、筋肉の痛み・力が入らないなどの訴えがあれば看護師へ伝える（横紋筋融解症という副作用に注意とされる）。"
 },
 "尿路感染症・尿道カテーテル": {
 symptoms: "【膀胱炎】排尿時・排尿後の下腹部の痛み、残尿感、すぐにトイレに行きたくなる、尿が赤い。【腎盂腎炎】高い熱、片側の横腹や腰の痛み。高齢者では症状が出ないことも多い。",
 care_points: "【現場介護の実践ケア】【カテーテルを使っている方】①管が曲がる・つぶれる・引っ張られることがないようにする。②尿をためる袋は膀胱より低い位置に保ち、床につけない。報告の目安や対応は、施設・主治医・看護師の指示を優先する。",
 emergency: "【看護師・医師への報告基準】発熱があるとき（腎盂腎炎は早めの受診が大切）。カテーテルの方は、尿が流れずお腹が張っている、血尿、尿の濁りや熱が続くときは看護師へ報告する。"
 },
 "前立腺肥大症": {
 symptoms: "尿が出にくい・勢いが弱い・出るまで時間がかかる、トイレが近い・夜に何度も行く・我慢できない、排尿後もすっきりしない・少し漏れる。進むと尿が出なくなる（尿閉）ことがある。",
 care_points: "【現場介護の実践ケア】①アルコールや風邪薬で尿が出なくなる（尿閉）ことがあるため注意する。②排尿の回数や様子を記録する（排尿日誌）。報告の目安や対応は、施設・主治医・看護師の指示を優先する。",
 emergency: "【看護師・医師への報告基準】尿が出ない・出にくくお腹が張って苦しそうなとき、血尿のときは看護師へ報告する。"
 },
 "褥瘡（床ずれ）・皮膚剥離": {
 symptoms: "圧迫を受けた所が赤くなり、水ぶくれや紫色のあざが出る。赤い所を指で3秒ほど軽く押して、白くならず赤いままなら初期の床ずれの可能性がある。やせて骨が出ている所（お尻・かかと・背骨の下・肩甲骨・後頭部など）にできやすい。",
 care_points: "【現場介護の実践ケア】①除圧用のマットレスなどで圧迫を避ける。②スキンケアを適切に行う。③体の向きを変える間隔や方法は、施設・看護師の指示に従う。報告の目安や対応は、施設・主治医・看護師の指示を優先する。",
 emergency: "【看護師・医師への報告基準】指で押しても赤みが消えないとき、水ぶくれ・紫色のあざ・皮膚がむけているときは看護師へ報告する。"
 },
 "帯状疱疹": {
 symptoms: "体の片側に、痛みを伴う水ぶくれの発疹が帯のように出る。治ったあとも神経痛が残ることがある（帯状疱疹後神経痛）。",
 care_points: "【現場介護の実践ケア】①水ぼうそうにかかったことがない人にはうつる（水ぼうそうとして）ことがあるため、職員・面会者に注意する。②水ぶくれはつぶさない（ほかの菌が入るおそれ）。③患部は冷やさない。④薬は自己判断でやめない。報告の目安や対応は、施設・主治医・看護師の指示を優先する。",
 emergency: "【看護師・医師への報告基準】発疹の範囲が広がるとき、痛みが和らがないときは看護師へ伝える。"
 },
 "痛風（高尿酸血症）": {
 symptoms: "尿酸が結晶になって関節にたまり、激しい痛みが出る。起こりやすいのは足の親指の付け根・足首・膝・手首・肘。痛みは長くても1〜2週間でおさまるが、病気が治ったわけではない。",
 care_points: "【現場介護の実践ケア】①尿酸を下げる薬は、痛みがおさまっても指示どおり続ける。②プリン体の多い食品やアルコールは控える（食事は施設の指示に従う）。報告の目安や対応は、施設・主治医・看護師の指示を優先する。",
 emergency: "【看護師・医師への報告基準】関節が急に腫れて強く痛むときは看護師へ伝える。"
 },
 "てんかん・痙攣発作": {
 symptoms: "ひきつけ、手足のがくがく、意識がなくなる・一瞬途切れる、しびれ、汗をかく。高齢者は脳梗塞などのあとに起こることが多く、発作の形がいろいろで気づかれにくい。",
 care_points: "【現場介護の実践ケア】①薬は指示どおりに飲む（飲み始めは眠気やふらつきが出ることがある）。②発作が起きたら、そばを離れずに他の職員・看護師を呼び、始まった時刻と様子を記録する。報告の目安や対応は、施設・主治医・看護師の指示を優先する。",
 emergency: "【看護師・医師への報告基準】けいれんが5分以上続くとき、けがをしているときは119番（本人・家族と決めた対応がある場合はそれに従う）。発作があったときは必ず看護師へ報告する。"
 },
 "老年期うつ・適応障害": {
 symptoms: "朝に強い気分の落ち込み、意欲の低下、集中できない、自分を責める、死を考える。食欲の低下（または過食）、眠れない・早く目が覚める、だるさ、頭痛・胃痛・めまい・便秘など体の不調が目立つことも多く、認知症と間違われやすい。",
 care_points: "【現場介護の実践ケア】①「頑張れ」と励ます、原因を問いつめる、答えを急がせることは避ける。②ゆっくり休ませ、話したくなったときに耳を傾ける。③「死にたい」と言われたら話をそらさず、肯定も否定もせず、聞いている姿勢を示す。④散歩や軽い運動などで少しずつ人との関わりを促す。報告の目安や対応は、施設・主治医・看護師の指示を優先する。",
 emergency: "【看護師・医師への報告基準】「死にたい」などの訴えがあったときは、その日のうちに看護師・主治医へ報告する。対応に困ったときも主治医に相談する。"
 },
 "悪性腫瘍（緩和ケア・ターミナル）": {
 symptoms: "最期が近づくと、食べる量・飲む量が自然に減る、眠る時間が増える、呼びかけに返事をしなくなる、呼吸が不規則になり肩や顎で息をする（30秒ほど止まることもある）、喉がゴロゴロ鳴る、手足が冷たく紫色になる、尿が濃く少なくなる、つじつまの合わないことを言うなどの変化がある。",
 care_points: "【現場介護の実践ケア】①無理に食べさせず、食べたいものを少しずつ勧める。②無理に起こさず、ゆっくり眠らせる。③そばで手を握り、声をかけ、体をさする（返事がなくても聴覚と触覚は最期まで残るとされる）。④手足が冷たいときは、さすったり毛布をかけて温める。⑤口が乾いたら濡らしたガーゼや綿棒で湿らせる。⑥大きな音を立てず、つじつまの合わないことを訂正しない。報告の目安や対応は、施設・主治医・看護師の指示を優先する。",
 emergency: "【看護師・医師への報告基準】呼吸や意識の変化など、「主な症状」にあるような変化に気づいたら看護師へ伝え、本人・家族と決めた方針（看取りの計画）に沿って対応する。"
 },
 "インフルエンザ": {
 symptoms: "突然の発熱、全身のだるさ・筋肉痛・関節痛などの全身症状と、のどの痛み・咳・鼻水。潜伏期間は1〜3日程度。高齢者は肺炎を合併しやすい。",
 care_points: "【現場介護の実践ケア】①咳のある方とケアする職員はマスクを着け、ケアの前後に手洗いをする。②部屋の分け方・面会・職員が発症した時の休む期間は、施設の感染対策の決まりに従う。③寒さに配慮しながらこまめに換気する。④予防接種は流行前に（かからないためではなく、重症化を防ぐことが主な目的）。",
 emergency: "【看護師・医師への報告基準】発熱・咳・のどの痛みなどインフルエンザを疑う症状は早めに看護師へ（治療薬は発症から48時間以内に使う必要があるため）。息苦しさ、SpO2の低下、ぐったりして水分がとれない時は肺炎の恐れがあり、直ちに看護師・医師へ連絡。"
 },
 "新型コロナウイルス感染症": {
 symptoms: "発熱、のどの痛み、咳、痰など。高齢者施設は重症化しやすい方が多い。",
 care_points: "【現場介護の実践ケア】①療養期間の国の目安は「発症翌日から5日間、かつ症状が軽くなってから24時間」。施設・主治医・保健所の指示があればそれを優先する。②発症から10日間はウイルスが出ている可能性があるため、マスク・手洗い・換気を続け、重症化しやすい方との接触に注意する。③取り扱いは変わることがあるため、最新の国・保健所の情報と施設の決まりに従う。",
 emergency: "【看護師・医師への報告基準】発熱・咳・のどの痛みなどがあれば直ちに看護師へ。息苦しさ、SpO2の低下、ぐったりしている時はすぐに看護師・医師へ連絡。"
 },
 "ノロウイルス（感染性胃腸炎）": {
 symptoms: "吐き気・嘔吐・下痢・腹痛。発熱を伴うことがある。潜伏期間はおおむね1〜2日で、症状は通常1〜2日でおさまる。症状がおさまった後も、便からウイルスが出続けることがある（1週間〜1か月程度）。",
 care_points: "【現場介護の実践ケア】①嘔吐物・便の処理は、手袋・マスク・エプロンを着け、窓を開けて換気し、0.1%の次亜塩素酸ナトリウムで拭き取り・消毒する（アルコールは効きにくい）。②処理の後とケアの後は、石けんと流水で手を洗う。③汚れた衣類は他の洗濯物と分け、次亜塩素酸ナトリウムに浸けるか、85℃以上で1分以上の熱湯消毒をする。④部屋の分け方・入浴の順番は施設の感染対策の決まりに従う。",
 emergency: "【看護師・医師への報告基準】嘔吐・下痢を見つけたら直ちに看護師へ報告（冬は特にノロウイルスを疑う）。水分がとれない、ぐったりして反応が鈍い時は脱水の恐れがあり、すぐに看護師・医師へ連絡。"
 },
 "疥癬": {
 symptoms: "強いかゆみ（特に夜間）、赤いぶつぶつ（丘疹）。顔や頭を除く全身に出る。角化型（ノルウェー）疥癬は、厚い垢がついたような皮膚になり、ダニの数が非常に多く感染力が強い。潜伏期間は1〜2か月程度。",
 care_points: "【現場介護の実践ケア】①通常の疥癬は個室への隔離は不要。体や衣類・シーツに触れる時は使い捨ての手袋とガウンを使う。②角化型疥癬は個室で対応し、入浴は最後にする。③衣類・シーツはビニール袋に入れて運び、50℃以上・10分以上の熱処理（熱い湯に浸ける・乾燥機）をしてから洗う。④ほかの方にも同じ症状が出ていないか、しばらく皮膚の様子を見る。",
 emergency: "【看護師・医師への報告基準】夜間の強いかゆみや皮膚のぶつぶつなど疥癬が疑われる時は、早めに看護師へ報告し、皮膚科の受診につなぐ。"
 },
 "胃ろう・経管栄養": {
 symptoms: "【注意】経管栄養は医行為。研修を修了して登録された職員が、登録した施設で、医師の指示のもとで行う場合を除き、介護職は注入・チューブの操作をしない。胃ろうは、おなかの皮膚と胃をつなぐ穴（瘻孔）にチューブを入れ、栄養を入れる方法。注入中は吐き気・腹痛・おなかの張りが起きやすい。",
 care_points: "【現場介護の実践ケア】①経管栄養は医行為のため、医師の指示のもとで行う。介護職が行えるのは、研修を修了して登録された職員（認定特定行為業務従事者）で、かつ施設も登録している（登録特定行為事業者）場合だけ。それ以外の職員は、注入・チューブの操作をしない。②注入中・注入後の姿勢や時間は、施設・主治医の指示に従う。③移乗・体位変換・着替えの時は、チューブを体に巻き込んだり引っ張ったりしていないか確認する。",
 emergency: "【看護師・医師への報告基準】チューブが抜けた時は、穴が徐々に閉じてしまうため直ちに看護師へ連絡（介護職は自分で入れ直さない）。注入中の吐き気・嘔吐、おなかの強い張り、苦しそうな様子がある時は直ちに看護師へ。"
 },
 "脱水症": {
 symptoms: "口・唇・舌の乾燥、脇の下の乾燥、だるさ、立ちくらみ、なんとなく元気がない・反応が鈍い。高齢者はのどの渇きを感じにくく、症状がはっきり出ないこともある。",
 care_points: "【現場介護の実践ケア】①のどが渇いていなくても、こまめに少しずつ水分をすすめる（心臓・腎臓などで水分の指示がある方は、その量を守る）。②トイレを気にして水分を控えていないか声をかける。③下痢・嘔吐・発熱・多量の汗がある時は特に注意する。",
 emergency: "【看護師・医師への報告基準】水分がとれない、ぐったりして反応が鈍い、意識がおかしい時は直ちに看護師へ連絡。"
 },
 "熱中症": {
 symptoms: "めまい・立ちくらみ、大量の汗、筋肉のこむら返り、生あくび。高齢者は暑さやのどの渇きを感じにくく、室内でも起きる。",
 care_points: "【現場介護の実践ケア】①室温を測り、エアコン・扇風機で調整する。②のどが渇いていなくても、こまめに水分をすすめる（水分の指示がある方は、その量を守る）。",
 emergency: "【看護師・医師への報告基準】熱中症が疑われたら、涼しい場所へ移し、衣服をゆるめ、首の周り・脇の下・足の付け根を冷やして看護師へ連絡。自分で水が飲めない、呼びかけへの反応がおかしい・意識がない時は、すぐに救急要請。"
 },
 "転倒・頭部打撲後（慢性硬膜下血腫に注意）": {
 symptoms: "転倒などで頭を打った後、1〜2か月ほどかけて頭の中にゆっくり血がたまることがある（慢性硬膜下血腫）。頭痛、歩き方がおかしい（歩行障害）、片麻痺、うまく話せない、意識がぼんやりするなどが、打ってからしばらくたって出てくる。",
 care_points: "【現場介護の実践ケア】①頭を打った時は、日時・状況・打った場所を記録して看護師へ報告し、事故・ヒヤリハット報告書を作成する。②血液をサラサラにする薬（抗凝固薬・抗血小板薬）を飲んでいる方は起こりやすいため、特に注意して様子を見る。③打った後も数か月は、頭痛・歩き方・話し方・反応の変化に気をつける。④再び転ばないよう、環境を整える。",
 emergency: "【看護師・医師への報告基準】頭痛、片麻痺、歩き方の変化、話しにくさ、意識がぼんやりするなどがあれば、打ってから日数がたっていても直ちに看護師・医師へ連絡。"
 },
 "MRSA（薬剤耐性菌）": {
 symptoms: "菌を持っている（保菌）だけで症状がないことが多い。体力や抵抗力が落ちた方では感染症を起こしやすく、施設内で広がることがある。",
 care_points: "【現場介護の実践ケア】①菌を持っていることを理由に、入所や日常生活を制限しない（その人らしい生活を支える）。②手指衛生は誰に対しても行い、血液・体液・排泄物などを扱う時は手袋を着ける（標準予防策）。③咳・痰が多い、下痢・便失禁がある、褥瘡から膿が出ているなどの時は、ケアの際に手袋とエプロン（ガウン）を着ける。部屋の分け方は施設の感染対策の決まりに従う。",
 emergency: "【看護師・医師への報告基準】発熱、傷や褥瘡の悪化、痰の増加など感染症を疑う変化があれば看護師へ報告。"
 },
 "結核": {
 symptoms: "2週間以上続く咳・痰、微熱、体重減少、だるさ。空気感染するため、施設内で広がることがある。",
 care_points: "【現場介護の実践ケア】①2週間以上続く咳・痰などがある方は、看護師・嘱託医に早めに相談する。②結核の疑いがある方には、サージカルマスクを着けてもらい、個室で過ごしてもらう。職員が部屋に入る時はN95マスクを着ける。③日ごろから体温・体重・咳の変化を観察する。",
 emergency: "【看護師・医師への報告基準】2週間以上続く咳・痰、微熱、体重減少などがあれば看護師・嘱託医へ報告し、受診につなぐ。"
 },
 "白癬（水虫・爪白癬）": {
 symptoms: "足の指の間・足の裏・かかとに、赤み、小さな水ぶくれ、皮むけ、ただれ。かゆみはあることもないこともある。爪白癬は、爪が白や黄色に濁り、厚くなってぼろぼろになる。",
 care_points: "【現場介護の実践ケア】①入浴時に足の指の間や爪の状態を観察する。②足ふきマットやスリッパは感染のもとになりやすいため、こまめに洗ってよく乾かす。③足は洗った後よく乾かし、角質を傷つけないようにケアする。④塗り薬は医師・看護師の指示どおりに使う（症状が治まっても自己判断でやめない）。",
 emergency: "【看護師・医師への報告基準】足や爪に赤み・水ぶくれ・ただれ・爪の濁りなどを見つけたら看護師へ報告し、皮膚科の受診につなぐ。"
 },
 "低栄養": {
 symptoms: "食事の量が減る、食事を抜く、体重が減る（6か月で2〜3kgの減少が目安）。",
 care_points: "【現場介護の実践ケア】①毎回の食事量を記録し、減ってきたら看護師・管理栄養士へ共有する。②1日3食をきちんと食べられるよう支援する（食べにくさ・義歯の不具合がないかも確認）。③定期的に体重を測る（このポータルの体重急減バッジも参考にする）。",
 emergency: "【看護師・医師への報告基準】6か月で2〜3kg以上の体重減少や、食事量が続けて減っている時は、看護師・管理栄養士・医師へ相談。"
 },
 "おむつかぶれ（失禁関連皮膚炎）": {
 symptoms: "尿や便が皮膚に触れることで、陰部・おしり・肛門のまわりなどに赤み（紅斑）やただれ（びらん）が出る。",
 care_points: "【現場介護の実践ケア】①おむつ交換時は皮膚をこすらず、排泄物を洗い流し、水分は押さえ拭きする。②軟便・水様便の時は、便がつく部分に撥水性の保護剤（看護師の指示のもの）を塗る。③汚れたおむつ・パッドはなるべく早く交換する。",
 emergency: "【看護師・医師への報告基準】赤みやただれが広がる、痛がる、皮膚がむけている時は看護師へ報告。"
 }
};

// 病歴・既往歴のスマート解決関数（カスタム設定・完全一致・部分一致・同義語照合）
function resolveDiseaseGuideRaw(diseaseName) {
 const name = (diseaseName || "").trim();
 if (!name) return null;

 // 1. 施設独自のカスタムガイドがあれば最優先
 if (db && db.data && db.data.custom_disease_guides && db.data.custom_disease_guides[name]) {
 return { guide: db.data.custom_disease_guides[name], matchedName: name, isCustom: true };
 }

 // 2. 完全一致
 if (DISEASE_GUIDE[name]) {
 return { guide: DISEASE_GUIDE[name], matchedName: name, isCustom: false };
 }

 // 3. 部分一致（名称を含む・含まれる）
 const lower = name.toLowerCase();
 for (const [key, val] of Object.entries(DISEASE_GUIDE)) {
 if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) {
 return { guide: val, matchedName: key, isCustom: false };
 }
 }

 // 4. 同義語・類語照合辞書
 const SYNONYMS = [
 { patterns: ["転倒", "頭部打撲", "頭を打", "硬膜下"], target: "転倒・頭部打撲後（慢性硬膜下血腫に注意）" },
 { patterns: ["mrsa", "耐性菌", "esbl"], target: "MRSA（薬剤耐性菌）" },
 { patterns: ["結核"], target: "結核" },
 { patterns: ["白癬", "水虫", "爪白癬"], target: "白癬（水虫・爪白癬）" },
 { patterns: ["低栄養", "栄養不良", "体重減少"], target: "低栄養" },
 { patterns: ["おむつかぶれ", "失禁関連皮膚炎", "iad"], target: "おむつかぶれ（失禁関連皮膚炎）" },
 { patterns: ["インフル"], target: "インフルエンザ" },
 { patterns: ["コロナ", "covid"], target: "新型コロナウイルス感染症" },
 { patterns: ["ノロ", "感染性胃腸炎", "胃腸炎", "嘔吐下痢"], target: "ノロウイルス（感染性胃腸炎）" },
 { patterns: ["かいせん", "ヒゼンダニ", "ノルウェー疥癬"], target: "疥癬" },
 { patterns: ["胃ろう", "胃瘻", "peg", "経管", "経鼻", "腸ろう", "腸瘻"], target: "胃ろう・経管栄養" },
 { patterns: ["脱水"], target: "脱水症" },
 { patterns: ["熱中症", "熱射病", "日射病"], target: "熱中症" },
 { patterns: ["認知症", "アルツハイマー", "レビー", "血管性認知", "ピック", "長谷川", "物忘れ", "もの忘れ"], target: "認知症" },
 { patterns: ["心不全", "心疾患", "うっ血性"], target: "心不全" },
 { patterns: ["糖尿病", "高血糖", "低血糖", "インスリン", "dm", "血糖"], target: "糖尿病" },
 { patterns: ["高血圧", "血圧症", "ht", "高血圧症"], target: "高血圧" },
 { patterns: ["肺炎", "誤嚥", "誤嚥性"], target: "誤嚥性肺炎" },
 { patterns: ["脳梗塞", "脳出血", "脳卒中", "くも膜下", "クモ膜下", "片麻痺", "脳血管"], target: "脳梗塞後遺症" },
 { patterns: ["パーキンソン", "振戦", "固縮"], target: "パーキンソン病" },
 { patterns: ["骨粗鬆", "骨粗しょう", "骨脆弱"], target: "骨粗鬆症" },
 { patterns: ["骨折", "大腿骨", "圧迫骨折", "骨折後"], target: "骨折（大腿骨・圧迫骨折）" },
 { patterns: ["腎不全", "人工透析", "ckd", "透析"], target: "慢性腎不全（CKD・透析）" },
 { patterns: ["copd", "肺気腫", "喘息", "気管支喘息", "hot", "在宅酸素"], target: "慢性閉塞性肺疾患 (COPD・喘息)" },
 { patterns: ["不整脈", "心房細動", "ペースメーカー", "期外収縮"], target: "不整脈・心房細動" },
 { patterns: ["白内障", "緑内障", "黄斑", "視力低下", "視覚障害", "盲目"], target: "白内障・緑内障（視覚障害）" },
 { patterns: ["難聴", "補聴器", "耳が遠い"], target: "老人性難聴" },
 { patterns: ["狭心症", "心筋梗塞", "虚血性心疾患", "ニトロ"], target: "狭心症・心筋梗塞既往" },
 { patterns: ["関節症", "変形性膝関節症", "膝痛", "リウマチ", "関節痛"], target: "変形性関節症・リウマチ" },
 { patterns: ["狭窄症", "脊柱管", "腰痛", "坐骨神経痛", "ヘルニア"], target: "脊柱管狭窄症・腰痛症" },
 { patterns: ["便秘", "慢性便秘", "下剤", "イレウス", "腸閉塞"], target: "慢性便秘症・イレウス注意" },
 { patterns: ["食道炎", "逆流性", "胃潰瘍", "十二指腸潰瘍", "胃炎"], target: "逆流性食道炎・胃潰瘍" },
 { patterns: ["脂質", "高脂血症", "コレステロール"], target: "脂質異常症（高脂血症）" },
 { patterns: ["尿路感染", "膀胱炎", "腎盂腎炎", "バルーン", "カテーテル"], target: "尿路感染症・尿道カテーテル" },
 { patterns: ["前立腺", "排尿困難", "頻尿", "尿閉"], target: "前立腺肥大症" },
 { patterns: ["褥瘡", "床ずれ", "スキンテア", "皮膚剥離", "皮膚トラブル"], target: "褥瘡（床ずれ）・皮膚剥離" },
 { patterns: ["帯状疱疹", "ヘルペス"], target: "帯状疱疹" },
 { patterns: ["痛風", "尿酸"], target: "痛風（高尿酸血症）" },
 { patterns: ["てんかん", "痙攣", "けいれん", "発作"], target: "てんかん・痙攣発作" },
 { patterns: ["うつ", "鬱", "抑うつ", "不安症"], target: "老年期うつ・適応障害" },
 { patterns: ["がん", "悪性腫瘍", "癌", "ターミナル", "緩和ケア"], target: "悪性腫瘍（緩和ケア・ターミナル）" }
 ];

 for (const item of SYNONYMS) {
 if (item.patterns.some(p => lower.includes(p.toLowerCase()))) {
 if (DISEASE_GUIDE[item.target]) {
 return { guide: DISEASE_GUIDE[item.target], matchedName: item.target, isCustom: false };
 }
 }
 }

 // 5. 該当なし（標準の現場観察ガイド）
 return {
 guide: {
 symptoms: "日々のバイタル・顔色・呼吸状態・食欲・活気・歩行の安定性を観察してください。",
 care_points: "【現場介護の実践ケア】無理のない動作介助、定期的な水分補給、安全な移乗・転倒見守り、規則正しい生活リズムの維持。",
 emergency: "【看護師・医師への報告基準】意識障害、普段と違う言動、激しい痛み、発熱（おおむね38℃以上、または平熱より1℃以上の上昇。施設の基準を優先）、呼吸苦がみられた場合は直ちに安静を保ち看護師または医師へ連絡。"
 },
 matchedName: name,
 isCustom: false,
 isFallback: true
 };
}

// [Claude修正 2026-10-14] 病名ガイドも、2つ以上の資料で一致を確かめて記録したものだけを表示する。
// それ以外（もとの30件と、該当なしのときの標準の文）は「確認中」とだけ出す。施設独自のガイドはそのまま表示。
// 資料で確かめて記録したら、ここに足して戻す。根拠: claude/medical_check_20261008_evening.md ほか
const CP_VERIFIED_GUIDES = new Set([
 "インフルエンザ", "新型コロナウイルス感染症", "ノロウイルス（感染性胃腸炎）", "疥癬", "胃ろう・経管栄養",
 "脱水症", "熱中症", "転倒・頭部打撲後（慢性硬膜下血腫に注意）", "MRSA（薬剤耐性菌）", "結核",
 "白癬（水虫・爪白癬）", "低栄養", "おむつかぶれ（失禁関連皮膚炎）",
 "糖尿病", "高血圧", "心不全", "脳梗塞後遺症", "パーキンソン病", "骨粗鬆症", "誤嚥性肺炎", "誤嚥性肺炎既往", "嚥下障害",
 "認知症", "骨折（大腿骨・圧迫骨折）", "慢性腎不全（CKD・透析）", "慢性閉塞性肺疾患 (COPD・喘息)", "不整脈・心房細動", "白内障・緑内障（視覚障害）", "老人性難聴", "狭心症・心筋梗塞既往", "変形性関節症・リウマチ", "脊柱管狭窄症・腰痛症", "慢性便秘症・イレウス注意", "逆流性食道炎・胃潰瘍", "脂質異常症（高脂血症）", "尿路感染症・尿道カテーテル", "前立腺肥大症", "褥瘡（床ずれ）・皮膚剥離", "帯状疱疹", "痛風（高尿酸血症）", "てんかん・痙攣発作", "老年期うつ・適応障害", "悪性腫瘍（緩和ケア・ターミナル）"
]);
const CP_GUIDE_PENDING_TEXT = "この病気の現場ケアガイドは、根拠となる資料を確認中のため表示していません。体調の変化や判断に迷うときは、看護師・主治医の指示に従ってください。";
function resolveDiseaseGuide(diseaseName) {
 const res = resolveDiseaseGuideRaw(diseaseName);
 if (!res || res.isCustom) return res;
 if (res.isFallback || !CP_VERIFIED_GUIDES.has(res.matchedName)) {
 return { guide: { symptoms: "", care_points: "", emergency: "" }, matchedName: res.matchedName, isCustom: false, isFallback: !!res.isFallback, pending: true };
 }
 return res;
}

// [Claude修正] 日付は日本時間 (端末のローカル時刻) で求める。
// 旧実装の toISOString() は世界標準時のため、日本時間の 0:00〜8:59 は「前日」になり、
// 「今日」ボタンや初期表示日、深夜帯の記録日付が1日ずれていた。
function toLocalDateStr(d) {
 const x = (d instanceof Date) ? d : new Date(d);
 return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}
function toLocalDateTimeStr(d) {
 const x = (d instanceof Date) ? d : new Date(d);
 return `${toLocalDateStr(x)} ${String(x.getHours()).padStart(2, "0")}:${String(x.getMinutes()).padStart(2, "0")}`;
}

// [Claude修正] 施設名の取得を1か所にまとめ、画面・全帳票で「変更した施設名」が使われるようにする
function getFacilityName() {
 return (db && db.data && db.data.facility_name) ? db.data.facility_name : "陽だまりの家";
}

function editFacilityName() {
 openFacilityNameModal();
}

function openFacilityNameModal() {
 const currentName = getFacilityName();
 const input = document.getElementById("newFacilityNameInput");
 if (input) input.value = currentName;

 renderFacilityApproverSelects();
 const p1 = document.getElementById("facAdminPin");
 const p2 = document.getElementById("facOfficePin");
 if (p1) p1.value = "";
 if (p2) p2.value = "";

 openModal("facilityNameModal");
}

function renderFacilityApproverSelects() {
 const adminSel = document.getElementById("facApproverAdmin");
 const officeSel = document.getElementById("facApproverOffice");
 if (!adminSel || !officeSel) return;

 adminSel.innerHTML = "";
 officeSel.innerHTML = "";

 const accounts = db.data.staff_accounts || [];
 const roleOf = (name) => {
   const st = (db.data.stamps || []).find(x => (x.name || x) === name);
   return (st && st.role) ? st.role : "";
 };

 const admins = accounts.filter(a => /管理者|施設長/.test(roleOf(a.staff_name)));
 admins.forEach(a => {
   const opt = document.createElement("option");
   opt.value = a.staff_name;
   opt.textContent = `${a.staff_name} (${roleOf(a.staff_name) || "管理者"})`;
   adminSel.appendChild(opt);
 });

 const offices = accounts.filter(a => /事務/.test(roleOf(a.staff_name)));
 offices.forEach(a => {
   const opt = document.createElement("option");
   opt.value = a.staff_name;
   opt.textContent = `${a.staff_name} (${roleOf(a.staff_name) || "事務員"})`;
   officeSel.appendChild(opt);
 });
}

function executeFacilityNameChange() {
 const input = document.getElementById("newFacilityNameInput");
 const newName = input ? input.value.trim() : "";
 const adminStaff = document.getElementById("facApproverAdmin")?.value;
 const officeStaff = document.getElementById("facApproverOffice")?.value;
 const adminPin = (document.getElementById("facAdminPin")?.value || "").trim();
 const officePin = (document.getElementById("facOfficePin")?.value || "").trim();

 if (!newName) {
   alert("施設名を入力してください。");
   return;
 }

 const currentName = getFacilityName();
 if (newName === currentName) {
   alert("現在の施設名と同じです。変更する必要はありません。");
   return;
 }

 if (!adminStaff || !officeStaff) {
   alert("承認者（管理者および事務員）を選択してください。");
   return;
 }

 if (adminStaff === officeStaff) {
   alert("承認者1と承認者2には別の職員を選択してください（2名による承認が必要です）。");
   return;
 }

 // 承認者の暗証番号照合
 // [Claude修正] サーバー稼働時は、承認者の照合と施設名の変更をサーバーで行う
 if (db && db.isServerMode) {
 const confirmMsgSv = `【確認】\n施設名を以下の通り変更します。\n\n旧施設名: ${currentName}\n新施設名: ${newName}\n\n承認者1: ${adminStaff}\n承認者2: ${officeStaff}\n\nよろしいですか？`;
 if (!confirm(confirmMsgSv)) return;
 cpPostJson('/api/facility-name', { name: newName, admin: adminStaff, admin_pin: adminPin, office: officeStaff, office_pin: officePin }).then(r => {
 if (r.status === 423) { alert("失敗が続いたため、5分間ロックしています。"); return; }
 if (!r.ok) { alert("承認者の役職または暗証番号が一致しません。施設名は変更されませんでした。"); return; }
 db.data.facility_name = newName;
 updateFacilityNameUI();
 closeModal("facilityNameModal");
 alert(`施設名を「${newName}」に更新しました。\n全端末および各種印刷書類に反映されます。`);
 });
 return;
 }
 const stampOf = (name) => (db.data.stamps || []).find(x => (x.name || x) === name);
 const adminObj = stampOf(adminStaff);
 const officeObj = stampOf(officeStaff);

 if (!adminObj || !/管理者|施設長/.test(adminObj.role || "")) {
   alert("承認者1には管理者（施設長）を選択してください。");
   return;
 }
 if (!officeObj || !/事務/.test(officeObj.role || "")) {
   alert("承認者2には事務員を選択してください。");
   return;
 }
 if (adminPin !== String(adminObj.pin || "0000") || officePin !== String(officeObj.pin || "0000")) {
   alert("承認者の暗証番号が一致しません。施設名は変更されませんでした。");
   return;
 }

 const confirmMsg = `【確認】\n施設名を以下の通り変更します。\n\n旧施設名: ${currentName}\n新施設名: ${newName}\n\n承認者1: ${adminStaff}\n承認者2: ${officeStaff}\n\nよろしいですか？`;
 if (!confirm(confirmMsg)) return;

 if (!db.data) db.data = {};
 db.data.facility_name = newName;
 updateFacilityNameUI();
 db.saveToServer();
 closeModal("facilityNameModal");
 alert(`施設名を「${newName}」に更新しました。\n全端末および各種印刷書類に反映されます。`);
}

function updateFacilityNameUI() {
 const name = getFacilityName();
 const backupFacEl = document.getElementById("backupFacilityNameDisplay");
 if (backupFacEl) backupFacEl.textContent = name;
 const display = document.getElementById("facilityNameDisplay");
 if (display) display.textContent = name;
 document.title = `${name} 統合業務ポータルシステム`;
}

window.addEventListener("DOMContentLoaded", () => {
 updateFacilityNameUI();
 ensureStaffPinData();
 gState.stamps = sortStaffList(gState.stamps);
 renderStaffSelect();
 updateStaffRoleUI();
 renderResidentsStrip();
	initGlobalTimeSync();
	
 renderResidentDetail();
 updateRecordTargetBanner();
 updateRecordCharCount();
 renderQuickTemplates();
 renderCalendar();
 loadDateRecords(gState.selectedDate);
 checkGlobalAlerts();
 syncCategoryButtons();
 setupEventListeners();
});

// 職員セレクトボックス (役職・序列順)
function renderStaffSelect() {
 const sel = document.getElementById("currentStaff");
 if (!sel) return;
 const currentVal = sel.value;
 sel.innerHTML = "";

 // 常に役職・序列順（偉い人順）で整列
 gState.stamps = sortStaffList(gState.stamps);
 gState.stamps.forEach(s => {
 const opt = document.createElement("option");
 opt.value = s.name;
 opt.textContent = `${s.name} (${s.role || "職員"})`;
 sel.appendChild(opt);
 });

 if (currentVal && gState.stamps.some(s => s.name === currentVal)) {
 sel.value = currentVal;
 }
}

function onCurrentStaffChange() {
 const sel = document.getElementById("currentStaff");
 if (sel && sel.value) {
 gState.currentStaff = sel.value;
 }
 updateStaffRoleUI();
 renderNotebook();
 checkGlobalAlerts();
 if (gState.activePortal === "office" && gState.activeOfficeTab === "orders") {
 renderOfficeOrders();
 }
}

// 職員ロール判定（管理者または事務員）
function isStaffAdminOrClerk(staff) {
 if (!staff) return false;
 const staffObj = (gState.stamps || []).find(s => (s.name || s) === staff);
 const role = staffObj ? (staffObj.role || "") : "";
 const combined = `${role} ${staff}`.toLowerCase();
 return combined.includes("管理者") || combined.includes("施設長") || combined.includes("事務") || combined.includes("所長") || combined.includes("ホーム長") || combined.includes("院長") || combined.includes("理事") || combined.includes("事務長");
}

function isCurrentStaffAdminOrClerk() {
 const staffSelect = document.getElementById("currentStaff");
 const staff = (staffSelect ? staffSelect.value : "") || gState.currentStaff || "";
 return isStaffAdminOrClerk(staff);
}

// 権限に応じたUI表示切替 (＋職員管理ボタン、初期設定ボタン、事務所管理タブ)
function updateStaffRoleUI() {
 const isAdminOrClerk = isCurrentStaffAdminOrClerk();
 
 // 1. ＋職員管理ボタン (管理者・事務員のみ)
 const btnStaffManage = document.getElementById("btnHeaderStaffManage");
 if (btnStaffManage) {
 btnStaffManage.style.display = isAdminOrClerk ? "inline-block" : "none";
 }

 // 2. 現在選択職員の暗証番号初回設定ボタン
 const currentStaffName = (document.getElementById("currentStaff")?.value) || gState.currentStaff || "";
 const currentStaffObj = (gState.stamps || []).find(s => (s.name || s) === currentStaffName);
 const isInitial = currentStaffObj ? cpIsInitialPin(currentStaffObj) : false;
 const btnInitial = document.getElementById("btnSetInitialPin");
 if (btnInitial) {
 btnInitial.style.display = "none"; // [Claude修正] 中身のない互換用ボタンがヘッダーに空の四角で出ていた（初期設定の案内は「ID・PW設定」とお知らせで行う）
 }

 // 3. 事務所ポータルの管理者専用サブタブ行
 const adminRow = document.getElementById("officeAdminSecurityRow");
 if (adminRow) {
 adminRow.style.display = isAdminOrClerk ? "flex" : "none";
 }
 // [Antigravity実装 2026-10-16] 職種切り替え時に「経過記録」画面の表示項目も即時更新
 if (typeof renderSingleWriteScreen === "function" && gState.activeCareTab === "write_single") {
  renderSingleWriteScreen();
 }
}

// 管理者権限チェック (施設長または管理者ロール)
function isCurrentStaffAdmin() {
 const staffSelect = document.getElementById("currentStaff");
 if (!staffSelect) return false;
 const staff = staffSelect.value || "";
 if (!staff) return false;
 const staffObj = (gState.stamps || []).find(s => (s.name || s) === staff);
 const role = staffObj ? (staffObj.role || "") : "";
 const combined = `${role} ${staff}`.toLowerCase();
 if (combined.includes("管理者") || combined.includes("施設長") || combined.includes("所長") || combined.includes("ホーム長") || combined.includes("院長") || combined.includes("理事") || combined.includes("事務長")) {
 return true;
 }
 return false;
}

// ==========================================
// アラート完了・非表示（ディスミス）＆ 即時補充管理
// ==========================================
// [Claude修正] 旧実装は「閉じた」記録をその端末のメモリ (gState) にだけ持っていたため、
// 他の端末には反映されず、再読み込みすると復活していた。
// 閉じた記録をデータベース (dismissed_alerts) に保存し、サーバー経由で全端末に共有する。
// また、キーに日付や在庫数などの「その時点の状況」を含め、状況が変われば再びアラートが出るようにした。
function getDismissedAlertStore() {
 if (!db || !db.data) return {};
 const st = db.data.dismissed_alerts;
 if (!st || typeof st !== "object" || Array.isArray(st)) {
 db.data.dismissed_alerts = {};
 }
 return db.data.dismissed_alerts;
}

let pendingDismissData = null;

function dismissAlerts(alertKeys) {
 const store = getDismissedAlertStore();
 const staff = (gState.session && gState.session.staffName) ? gState.session.staffName : ((document.getElementById("currentStaff")?.value) || "担当者");
 const now = new Date();
 const nowStr = toLocalDateTimeStr(now);
 (alertKeys || []).forEach(k => {
   if (k) store[k] = { at: nowStr, by: staff };
 });
 // 120日より前の記録は削除してデータの肥大化を防ぐ
 const limit = new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000);
 Object.keys(store).forEach(k => {
   const at = store[k] && store[k].at ? new Date(store[k].at.replace(" ", "T")) : null;
   if (at && !isNaN(at) && at < limit) delete store[k];
 });
 db.save();
 checkGlobalAlerts();
}

function dismissAlert(alertKey, forceConfirmed, alertTitle, alertDetail) {
 if (!alertKey) return;
 if (!forceConfirmed) {
   // 確認ダイアログを開く (誤操作防止)
   pendingDismissData = {
     key: alertKey,
     title: alertTitle || `アラート [${alertKey}]`,
     detail: alertDetail || "このアラートを対応済みにします。"
   };
   const titleEl = document.getElementById("alertConfirmTitle");
   const detailEl = document.getElementById("alertConfirmDetail");
   if (titleEl) titleEl.textContent = pendingDismissData.title;
   if (detailEl) detailEl.textContent = pendingDismissData.detail;
   openModal("alertConfirmModal");
   return;
 }

 // 確定時
 dismissAlerts([alertKey]);
}

// [Claude修正] 同じ名前の関数がもう1つ後ろにあり、こちらは使われていなかった（後ろの定義が有効）ため削除: executeDismissAlert

function undismissAlert(alertKey) {
 const store = getDismissedAlertStore();
 delete store[alertKey];
}

function isAlertDismissed(alertKey) {
 const store = (db && db.data && db.data.dismissed_alerts && typeof db.data.dismissed_alerts === "object") ? db.data.dismissed_alerts : {};
 return Object.prototype.hasOwnProperty.call(store, alertKey);
}

function getRealTodayStr() {
 const d = new Date();
 return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dismissLowStockAll() {
 dismissAlerts(gState.lastLowStockAlertKeys || []);
}

function dismissCareExpiryAll() {
 dismissAlerts(gState.lastCareExpiryAlertKeys || []);
}

// アラートから直接ワンタップで在庫を平常時定数まで補充する
function quickReplenishStock(itemId) {
 const item = (gState.inventory || []).find(i => i.id === itemId);
 if (!item) return;

 const staff = (document.getElementById("currentStaff")?.value) || "現場担当";
 const now = new Date();
 const nowStr = `${toLocalDateStr(now)} ${now.toTimeString().slice(0, 5)}`;
 
 const normalStock = item.normal_stock || (item.safety_stock * 2);
 const addQty = Math.max(normalStock - item.current_stock, item.safety_stock);
 item.current_stock += addQty;

 if (!db.data.inventory_logs) db.data.inventory_logs = [];
 db.data.inventory_logs.unshift({
 id: Date.now(),
 timestamp: nowStr,
 item_id: item.id,
 item_name: item.name,
 action_type: "補充",
 change_qty: addQty,
 after_qty: item.current_stock,
 staff_name: staff,
 reason: "現場アラートより即時補充 (平常時定数達成)"
 });

 db.save();
 if (typeof renderOfficeInventory === 'function') renderOfficeInventory();
 checkGlobalAlerts();
 alert(`「${item.name}」を ${addQty}${item.unit} 補充しました！（平常時定数: ${normalStock}${item.unit} / 現在庫: ${item.current_stock}${item.unit}）\n要発注アラートを解除しました。`);
}

// すべての不足在庫を一括補充する
function quickReplenishAllStock() {
 const staff = (document.getElementById("currentStaff")?.value) || "現場担当";
 const now = new Date();
 const nowStr = `${toLocalDateStr(now)} ${now.toTimeString().slice(0, 5)}`;
 let replenishedNames = [];

 (gState.inventory || []).forEach(item => {
 if (item.current_stock <= item.safety_stock) {
 const normalStock = item.normal_stock || (item.safety_stock * 2);
 const addQty = Math.max(normalStock - item.current_stock, item.safety_stock);
 item.current_stock += addQty;
 replenishedNames.push(`${item.name} (+${addQty}${item.unit})`);

 if (!db.data.inventory_logs) db.data.inventory_logs = [];
 db.data.inventory_logs.unshift({
 id: Date.now() + Math.random(),
 timestamp: nowStr,
 item_id: item.id,
 item_name: item.name,
 action_type: "補充",
 change_qty: addQty,
 after_qty: item.current_stock,
 staff_name: staff,
 reason: "現場アラートより全品一括補充 (平常時定数達成)"
 });
 }
 });

 db.save();
 if (typeof renderOfficeInventory === 'function') renderOfficeInventory();
 checkGlobalAlerts();
 alert(`以下の消耗品を平常時定数まで一括補充しました！\n・${replenishedNames.join("\n・")}\n\n要発注アラートをすべて解除しました。`);
}

// 月間業務連絡を当職員分すべて一括確認済にする
function confirmAllMonthlyNoticesForStaff() {
 const staff = (document.getElementById("currentStaff")?.value) || "";
 if (!staff) return;
 const curMonth = (gState.selectedDate || toLocalDateStr(new Date())).slice(0, 7);
 (db.data.monthly_notices || []).filter(n => !n.voided).forEach(n => {
 if (n.month === curMonth) {
 if (!Array.isArray(n.confirmed_staff)) n.confirmed_staff = [];
 if (!n.confirmed_staff.includes(staff)) n.confirmed_staff.push(staff);
 }
 });
 db.save();
 if (typeof renderMonthlyNotices === 'function') renderMonthlyNotices();
 checkGlobalAlerts();
 alert(`${staff} さんの未確認連絡をすべて「確認済」にしました！未確認アラートを解除しました。`);
}

// アラート監視（管理者発注認証待ち・前月誕生日・非常食2週前・在庫補充・受診2週1週前・要介護期限・排便3日以上なし・月間連絡未確認）
// [Claude修正] 保存データ中の「???」(文字化け) をデータの種類ごとに数える
function findMojibakeTables() {
 const result = { total: 0, list: "" };
 if (!db || !db.data) return result;
 const parts = [];
 Object.keys(db.data).forEach(k => {
 if (k === "dismissed_alerts") return;
 // [Claude修正 2026-10-18] 文字にせず、中の文字だけを調べる（記録が多いと、通知を出すたびに重かった）
 let n = 0;
 const stack = [db.data[k]];
 while (stack.length) {
 const x = stack.pop();
 if (typeof x === "string") {
 if (x.indexOf("???") >= 0) { const m = x.match(/\?{3,}/g); if (m) n += m.length; }
 } else if (x && typeof x === "object") {
 if (Array.isArray(x)) { for (let i = 0; i < x.length; i++) stack.push(x[i]); }
 else { for (const kk in x) stack.push(x[kk]); }
 }
 }
 if (n > 0) {
 result.total += n;
 parts.push(`${k}: ${n}か所`);
 }
 });
 result.list = parts.join(" / ");
 return result;
}

// [Claude修正] お知らせの先頭の見出し【…】に notice-label を付ける (特殊指示の【特記】は除く)
function cpDecorateNoticeLabels(html) {
  if (!html) return html;
  return html.replace(/(<strong>\s*)?(【(?!特記)[^】<]{1,40}】)(\s*<\/strong>)?/g, '<strong class="notice-label">$2</strong>');
}

// [Claude追加] お知らせは畳んでおき、見出しに件数と種類ごとの数を出す（最初の画面がお知らせで埋まらないように）。
// 開いた・閉じたはこの端末だけに覚える
function cpUpdateAlertFold(kind) {
  const fold = document.getElementById(`${kind}AlertFold`);
  const box = document.getElementById(`${kind}AlertsContainer`);
  if (!fold || !box) return;
  const banners = [...box.querySelectorAll(":scope > .alert-banner")];
  const countEl = document.getElementById(`${kind}AlertCount`);
  const kindsEl = document.getElementById(`${kind}AlertKinds`);
  fold.dataset.empty = banners.length ? "0" : "1";
  if (countEl) countEl.textContent = banners.length ? `${banners.length}件` : "なし";
  const groups = {};
  banners.forEach(b => {
    const lab = b.querySelector(".notice-label");
    let name = lab ? lab.textContent.replace(/[【】]/g, "").trim() : "お知らせ";
    name = name.replace(/アラート$/, "");
    if (/^\d+週間前$|^前日$|^当日$|^\d+日前$/.test(name)) name = "受診";
    groups[name] = (groups[name] || 0) + 1;
  });
  if (kindsEl) kindsEl.textContent = Object.keys(groups).map(k => groups[k] > 1 ? `${k} ${groups[k]}` : k).join("、");
  if (!fold.dataset.bound) {
    fold.dataset.bound = "1";
    try { if (localStorage.getItem(`cpAlertFoldOpen_${kind}`) === "1") fold.open = true; } catch (e) {}
    fold.addEventListener("toggle", () => {
      try { localStorage.setItem(`cpAlertFoldOpen_${kind}`, fold.open ? "1" : "0"); } catch (e) {}
    });
  }
}

function checkGlobalAlerts() {
  const careContainer = document.getElementById("careAlertsContainer");
  const officeContainer = document.getElementById("officeAlertsContainer");
  const legacyContainer = document.getElementById("alertsContainer");
  if (!careContainer && !officeContainer && !legacyContainer) return;

  let careAlertHtml = "";
  let officeAlertHtml = "";
  const today = new Date();
  const todayStr = gState.selectedDate || toLocalDateStr(today);

  // [Claude修正] 文字化け (日本語が「???」になったデータ) の検出
  const mojibake = findMojibakeTables();
  const mojibakeKey = `mojibake_${toLocalDateStr(new Date())}_${mojibake.total}`;
  if (mojibake.total > 0 && !isAlertDismissed(mojibakeKey)) {
    const mHtml = `
      <div class="alert-banner alert-danger notice-card-urgent">
        <span> <strong>【文字化け検出】</strong> 保存データに「???」に化けた文字が ${mojibake.total} か所あります（${escapeHtml(mojibake.list)}）。スクリプト等でデータを書き込む場合は、必ずUTF-8で保存してください。</span>
        <button class="btn btn-secondary" style="padding:2px 8px; font-size:11px;" onclick="requestDismissAlertFromButton(this, '${mojibakeKey}')"> 確認済・閉じる</button>
      </div>
    `;
    careAlertHtml += mHtml;
    officeAlertHtml += mHtml;
  }

  // 0.0 【事務専用：初期パスワード未変更セキュリティ警告】
  const isAdminOrClerk = isCurrentStaffAdminOrClerk();
  const pinWarnKey = `initial_pin_warning_${getRealTodayStr()}`;
  if (isAdminOrClerk && !isAlertDismissed(pinWarnKey)) {
    const unconfigured = (gState.stamps || []).filter(s => cpIsInitialPin(s));
    if (unconfigured.length > 0) {
      const staffNames = unconfigured.map(s => escapeHtml(s.name || s)).join("、");
      officeAlertHtml += `
        <div class="alert-banner alert-warning notice-card-warning" style="background:#fef2f2; border-left:5px solid #dc2626; color:#991b1b;">
          <div style="width:100%;">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
              <span><strong>【セキュリティ設定警告】</strong> 初期暗証番号(0000)のままの職員が<strong>${unconfigured.length}名</strong>います（対象: ${staffNames}）。安全管理のため、事務所ポータルの「暗証番号管理」より変更を行ってください。</span>
              <div style="display:flex; gap:6px; align-items:center;">
                <button class="btn btn-secondary" style="padding:3px 10px; font-size:12px; background:#fee2e2; color:#991b1b; border-color:#fca5a5;" onclick="switchPortal('office'); switchOfficeTab('staff_auth');">暗証番号管理を開く</button>
                <button class="btn btn-secondary" style="padding:2px 8px; font-size:11px;" onclick="requestDismissAlertFromButton(this, '${pinWarnKey}')">閉じる</button>
              </div>
            </div>
          </div>
        </div>
      `;
    }
  }

  // 0. 【管理者専用：発注・在庫認証アラート (上司承認待ち)】
  const isAdmin = isCurrentStaffAdmin();
  const pendingOrders = (db.data.orders || []).filter(o => o.status === "申請中");
  if (isAdmin && pendingOrders.length > 0 && !isAlertDismissed('admin_pending_orders')) {
    const currentStaffName = (document.getElementById("currentStaff")?.value) || "管理者";
    const orderItemsSummary = pendingOrders.map(o => {
      return `
        <div style="display:flex; justify-content:space-between; align-items:center; background:#ffffff; padding:6px 12px; border-radius:6px; border:1px solid #fed7aa; margin-top:4px;">
          <div>
            <strong style="color:#c2410c;">【${escapeHtml(o.applicant || '職員')} 申請】</strong>
            <strong>${escapeHtml(o.item_name)}</strong> × <strong>${o.quantity}</strong>
            <span style="color:#5f6d66; font-size:12px;">(¥${(o.total_price || 0).toLocaleString()} / ${escapeHtml(o.supplier_name || '業者')})</span>
            <div style="font-size:11px; color:#78350f; margin-top:2px;">理由: ${escapeHtml(o.reason || '-')} / 申請日: ${o.ordered_at || '-'}</div>
          </div>
          <div style="display:flex; gap:6px; align-items:center; white-space:nowrap; margin-left:8px;">
            <button class="btn btn-primary" style="padding:3px 10px; font-size:12px; background:#16a34a; border-color:#15803d; color:#fff;" onclick="approveOrder(${o.id}, '承認済')"> 承認する</button>
            <button class="btn btn-danger" style="padding:3px 8px; font-size:12px; background:#ef4444; border-color:#dc2626; color:#fff;" onclick="approveOrder(${o.id}, '差戻し')"> 差戻し</button>
          </div>
        </div>
      `;
    }).join("");

    officeAlertHtml += `
      <div class="alert-banner alert-warning notice-card-warning" style="background:#fff7ed; border-left:5px solid #ea580c; color:#9a3412;">
        <div style="width:100%;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
            <span>  <strong>【要認証アラート】</strong> 管理者（<strong>${escapeHtml(currentStaffName)}</strong>）：スタッフから発注認証が求められています（承認待ち <strong>${pendingOrders.length}件</strong>）。<strong>誤承認防止のため、品名・数量・金額を1件ずつ目視確認の上で認証を行ってください。</strong></span>
            <div style="display:flex; gap:6px; align-items:center;">
              <button class="btn btn-secondary" style="padding:3px 10px; font-size:12px; background:#ffedd5; color:#9a3412; border-color:#fdba74;" onclick="switchPortal('office'); switchOfficeTab('orders');"> 発注台帳を開く</button>
              <button class="btn btn-secondary" style="padding:2px 8px; font-size:11px;" onclick="requestDismissAlertFromButton(this, 'admin_pending_orders')"> 閉じる</button>
            </div>
          </div>
          <div style="margin-top:6px; display:flex; flex-direction:column; gap:4px;">
            ${orderItemsSummary}
          </div>
        </div>
      </div>
    `;
  }

  // 1. 【介護専用：前月誕生日事前アラート】
  const nextMonthNum = (today.getMonth() + 1) % 12 + 1;
  const birthdayKey = `birthday_${today.getMonth() === 11 ? today.getFullYear() + 1 : today.getFullYear()}_${nextMonthNum}`;
  if (!isAlertDismissed(birthdayKey)) {
    const nextMonthBirthdays = [];
    cpCurrentResidents().forEach(r => {
      if (r.birth_date && typeof r.birth_date === 'string' && r.birth_date.includes("-")) {
        const parts = r.birth_date.split("-");
        if (parts.length >= 2) {
          const birthMonth = parseInt(parts[1], 10);
          if (birthMonth === nextMonthNum) {
            nextMonthBirthdays.push({ name: r.name, room: r.room_no, date: r.birth_date.slice(5) });
          }
        }
      }
    });
    if (nextMonthBirthdays.length > 0) {
      const list = nextMonthBirthdays.map(b => `${b.room}号室 ${b.name} 様 (${b.date})`).join(", ");
      careAlertHtml += `
        <div class="alert-banner alert-info notice-card-info" style="background:#e0e7ff; color:#3730a3; border-left:5px solid #6366f1;">
          <span> 【来月お誕生日事前アラート】来月(${nextMonthNum}月)お誕生日の利用者様：${list} 〜プレゼントや色紙等の準備を行ってください〜</span>
          <button class="btn btn-secondary" style="padding:2px 8px; font-size:11px;" onclick="requestDismissAlertFromButton(this, '${birthdayKey}')"> 準備確認・閉じる</button>
        </div>
      `;
    }
  }

  // 2. 【事務専用：非常食・防災備蓄 賞味期限2週間前アラート】
  (gState.emergencySupplies || []).filter(item => !cpEmgClosed(item)).forEach(item => { // [Claude修正 2026-10-16] 使い切った・破棄した品は出さない
    const emKey = `emergency_${item.id}_${item.expiry_date || ""}`;
    if (!isAlertDismissed(emKey) && item.expiry_date) {
      // [Claude修正] 日数を日付単位で計算し、当日・期限切れもアラートに出す (旧実装は期限切れが出なかった)
      const diffDays = cpDaysUntil(item.expiry_date);
      if (diffDays !== null && diffDays <= 14) {
        const emLabel = diffDays < 0 ? `【非常食・備蓄品 賞味期限切れ】『${escapeHtml(item.name)}』の賞味期限が${-diffDays}日過ぎています (${escapeHtml(item.expiry_date)})`
          : diffDays === 0 ? `【非常食・備蓄品 本日賞味期限】『${escapeHtml(item.name)}』の賞味期限は本日です (${escapeHtml(item.expiry_date)})`
          : `【非常食・備蓄品 賞味期限間近】『${escapeHtml(item.name)}』の賞味期限まであと${diffDays}日 (${escapeHtml(item.expiry_date)})`;
        officeAlertHtml += `
          <div class="alert-banner ${diffDays <= 0 ? 'alert-urgent notice-card-urgent' : 'alert-warning notice-card-warning'}">
            <span> ${emLabel} 〜消費・入れ替えを行ってください〜</span>
            <button class="btn btn-secondary" style="padding:2px 8px; font-size:11px;" onclick="requestDismissAlertFromButton(this, '${emKey}')"> 確認済・閉じる</button>
          </div>
        `;
      }
    }
  });

  // 3. 【事務専用：在庫補充アラート (要発注)】
  const pendingOrderNames = (db.data.orders || [])
    .filter(o => o.status === "申請中" || o.status === "承認済")
    .map(o => o.item_name);

  const lowStockItems = (gState.inventory || []).filter(i => {
    const threshold = (i.alert_threshold !== undefined && i.alert_threshold !== null && !isNaN(i.alert_threshold)) ? Number(i.alert_threshold) : i.safety_stock;
    if (i.current_stock > threshold) return false;
    if (pendingOrderNames.includes(i.name)) return false;
    if (isAlertDismissed(`stock_${i.id}_${i.current_stock}`)) return false;
    return true;
  });

  gState.lastLowStockAlertKeys = lowStockItems.map(i => `stock_${i.id}_${i.current_stock}`);
  if (lowStockItems.length > 0) {
    if (lowStockItems.length === 1) {
      const item = lowStockItems[0];
      const normalStock = item.normal_stock || (item.safety_stock * 2);
      const deficit = Math.max(1, normalStock - item.current_stock);
      officeAlertHtml += `
        <div class="alert-banner alert-danger notice-card-urgent">
          <span> <strong>【要発注アラート】</strong> 『<strong>${escapeHtml(item.name)}</strong>』の在庫が不足しています（現在庫: <strong>${item.current_stock}${item.unit}</strong> / 安全基準: ${item.safety_stock}${item.unit} / 平常時定数: <strong>${normalStock}${item.unit}</strong> → 不足: <strong>+${deficit}${item.unit}</strong>）</span>
          <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
            <button class="btn btn-primary" style="padding:3px 10px; font-size:12px; background:#1e5b47; color:#fff;" onclick="openOrderModalWithItem(${item.id})"> 『${escapeHtml(item.name)}』の発注を申請 (推奨+${deficit}${item.unit})</button>
            <button class="btn btn-secondary" style="padding:2px 8px; font-size:11px;" onclick="requestDismissAlertFromButton(this, 'stock_${item.id}_${item.current_stock}')"> 閉じる</button>
          </div>
        </div>
      `;
    } else {
      const itemListHtml = lowStockItems.map(item => {
        const normalStock = item.normal_stock || (item.safety_stock * 2);
        const deficit = Math.max(1, normalStock - item.current_stock);
        return `
          <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.85); padding:4px 8px; border-radius:4px; margin-top:4px; border:1px solid #fca5a5;">
            <span style="color:#991b1b;">・<strong>${escapeHtml(item.name)}</strong> (残: <strong>${item.current_stock}${item.unit}</strong> / 基準: ${item.safety_stock}${item.unit} / 平常定数: ${normalStock}${item.unit} → 不足: <strong>+${deficit}${item.unit}</strong>)</span>
            <div style="display:flex; gap:4px;">
              <button class="btn btn-primary" style="padding:2px 8px; font-size:11px; background:#1e5b47; color:#fff;" onclick="openOrderModalWithItem(${item.id})"> 発注申請 (+${deficit})</button>
            </div>
          </div>
        `;
      }).join("");

      officeAlertHtml += `
        <div class="alert-banner alert-danger notice-card-urgent">
          <div style="width:100%;">
            <span> <strong>【要発注アラート】</strong> 以下の消耗品が安全基準を下回っています（平常時定数まで発注申請を行ってください）：</span>
            <div style="margin-top:6px; display:flex; flex-direction:column; gap:4px;">
              ${itemListHtml}
            </div>
          </div>
          <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center; margin-top:8px;">
            <button class="btn btn-secondary" style="padding:2px 8px; font-size:11px;" onclick="requestDismissAlertFromButton(this, gState.lastLowStockAlertKeys || [])"> 全て閉じる</button>
          </div>
        </div>
      `;
    }
  }

  // 4. 【介護専用：受診2週前・1週前事前告知 ＆ 往診特殊指示アラート】
  cpCurrentResidents().forEach(r => {
    if (r.next_clinic_date) {
      const clinicDate = new Date(r.next_clinic_date);
      const diffDays = Math.ceil((clinicDate - today) / (1000 * 60 * 60 * 24));
      const specialNoteBadge = r.clinic_special_notes ? `<span class="notice-special"> 【特記】特殊指示: ${escapeHtml(r.clinic_special_notes)}</span>` : "";

      if (diffDays === 0 || r.next_clinic_date === todayStr) {
        // 当日往診
        const todayClinicKey = `clinic_today_${r.id}_${r.next_clinic_date}`;
        if (!isAlertDismissed(todayClinicKey)) {
          careAlertHtml += `
            <div class="alert-banner alert-danger notice-card-urgent" style="background:#fef2f2; border-left:5px solid #ef4444; color:#991b1b;">
              <span><strong>【本日受診・往診日】</strong> ${r.room_no}号室 ${r.name} 様 本日受診/往診です！${specialNoteBadge} 指示内容: ${escapeHtml(r.dr_instructions || '定期診察')}</span>
              <div style="display:flex; gap:6px; align-items:center;">
                <button class="btn btn-secondary" style="padding:2px 8px; font-size:12px; background:#fee2e2; color:#991b1b; border-color:#fca5a5;" onclick="openClinicInstructionModal(${r.id})">指示確認・変更</button>
                <button class="btn btn-secondary" style="padding:2px 8px; font-size:11px;" onclick="requestDismissAlertFromButton(this, '${todayClinicKey}')"> 受診対応完了</button>
              </div>
            </div>
          `;
        }
      } else if (diffDays > 0 && diffDays <= 14) {
        const upcomingKey = `clinic_upcoming_${r.id}_${r.next_clinic_date}_${diffDays <= 7 ? "w1" : "w2"}`;
        if (!isAlertDismissed(upcomingKey)) {
          const alertClass = diffDays <= 7 ? "alert-danger notice-card-urgent" : "alert-warning notice-card-warning";
          const tag = diffDays <= 7 ? "【1週間前】" : "【2週間前】";
          careAlertHtml += `
            <div class="alert-banner ${alertClass}">
              <span> ${tag} ${r.name}様 次回受診・往診日: ${r.next_clinic_date} (あと${diffDays}日) - 残薬確認・指示受け準備 ${specialNoteBadge}</span>
              <button class="btn btn-secondary" style="padding:2px 8px; font-size:11px;" onclick="requestDismissAlertFromButton(this, '${upcomingKey}')"> 確認済・閉じる</button>
            </div>
          `;
        }
      }
    }
  });

  // 5. 【介護専用：排便3日以上なしアラート (便秘コントロール)】
  const excretions = db.data.excretions || [];
  cpCurrentResidents().forEach(r => {
    if (r.status !== "在所") return;
    const resExcs = excretions.filter(e => e.resident_id === r.id && e.stool_amount && e.stool_amount !== "なし");
    resExcs.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    const stoolKey = `stool_${r.id}_${resExcs.length > 0 ? resExcs[0].date : "none"}`;
    if (isAlertDismissed(stoolKey)) return;

    let daysNoStool = 0;
    if (resExcs.length > 0) {
      const latestDateStr = resExcs[0].date;
      const latestDate = new Date(latestDateStr);
      const curDate = new Date(todayStr);
      daysNoStool = Math.floor((curDate - latestDate) / (1000 * 60 * 60 * 24));
    } else {
      // [Claude修正] 排便の記録が1件もないときは「3日目」と決めつけず、記録がないことを知らせる
      daysNoStool = null;
    }

    if (daysNoStool === null || daysNoStool >= 3) {
      const cpStoolMsg = daysNoStool === null
        ? `排便の記録がありません。排泄表で最後の排便を確認・記録し、看護師へ共有してください。`
        : `便が3日以上出ていません（現在 <strong>${daysNoStool}日目</strong>）。水分補給・腹部マッサージ・処方された下剤の服用を確認し、看護師へ共有してください。`;
      careAlertHtml += `
        <div class="alert-banner alert-danger notice-card-urgent" style="background:#fff1f2; border-left:5px solid #e11d48; color:#9f1239;">
          <span>  <strong>【排便アラート】</strong> ${r.room_no}号室 <strong>${r.name} 様</strong>：${cpStoolMsg}</span>
          <div style="display:flex; gap:6px; align-items:center;">
            <button class="btn btn-secondary" style="padding:2px 8px; font-size:12px; background:#ffe4e6; color:#9f1239; border-color:#f43f5e;" onclick="switchCareTab('excretion')">排泄表を開く</button>
            <button class="btn btn-secondary" style="padding:2px 8px; font-size:11px; background:#fff; color:#9f1239;" onclick="requestDismissAlertFromButton(this, '${stoolKey}')"> 処置・対応完了</button>
          </div>
        </div>
      `;
    }
  });

  // [Claude追加] 服薬: 予定時刻を1時間過ぎても記録がない方（今日・処方薬の一覧がある方）。責めるためではなく、早く気づいて確かめるため
  if (typeof cpMedMissingList === "function") {
    cpMedMissingList().forEach(g => {
      const mKey = `med_missing_${toLocalDateStr(new Date())}_${g.key}_${g.residents.map(r => r.id).join("-")}`;
      if (isAlertDismissed(mKey)) return;
      const names = g.residents.map(r => `${escapeHtml(r.room_no)}号室 ${escapeHtml(r.name)} 様`).join("、");
      careAlertHtml += `
        <div class="alert-banner alert-danger notice-card-urgent">
          <span><strong>【服薬の記録がない方】</strong> ${escapeHtml(g.key)}（予定 ${cpRxSlotTime(g.key)}）: ${names}。飲んだかを確かめて記録してください。</span>
          <div style="display:flex; gap:6px; align-items:center;">
            <button class="btn btn-secondary" onclick="enterPortal('care'); switchCareTab('med'); cpSelectMedTiming('${g.key}');">服薬表を開く</button>
            <button class="btn btn-secondary" onclick="requestDismissAlertFromButton(this, '${mKey}')">確認した・閉じる</button>
          </div>
        </div>
      `;
    });
  }

  // 6. 【介護専用：月間業務連絡 未確認アラート】
  const currentStaff = (document.getElementById("currentStaff") ? document.getElementById("currentStaff").value : "") || "";
  const curMonth = todayStr.slice(0, 7);
  const monthlyNotices = (db.data.monthly_notices || []).filter(n => !n.voided && n.month === curMonth);
  if (currentStaff && monthlyNotices.length > 0) {
    const unconfirmed = monthlyNotices.filter(n => !(n.confirmed_staff || []).includes(currentStaff));
    if (unconfirmed.length > 0 && !isAlertDismissed('monthly_notices_' + currentStaff)) {
      careAlertHtml += `
        <div class="alert-banner alert-warning notice-card-warning" style="background:#f5f3ff; border-left:5px solid #8b5cf6; color:#5b21b6;">
          <span>  <strong>【業務連絡 未確認】</strong> ${escapeHtml(currentStaff)} さん、${curMonth.split("-")[1]}月分の月間業務連絡に未確認が <strong>${unconfirmed.length}件</strong> あります！内容を確認し「確認済」を押してください。</span>
          <div style="display:flex; gap:6px; align-items:center;">
            <button class="btn btn-secondary" style="padding:2px 8px; font-size:12px; background:#ede9fe; color:#5b21b6; border-color:#8b5cf6;" onclick="switchCareTab('notebook')">連絡表を開く</button>
            <button class="btn btn-secondary" style="padding:2px 8px; font-size:11px; background:#fff; color:#5b21b6;" onclick="confirmAllMonthlyNoticesForStaff()"> 一括確認済にする</button>
          </div>
        </div>
      `;
    }
  }

  // 7. 【事務専用：要介護認定有効期限 (満了60日以内)】
  {
    const expiringResidents = [];
    cpCurrentResidents().forEach(r => {
      if (r.care_expiry_date) {
        const expiryDate = new Date(r.care_expiry_date);
        const diffDays = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
        if (diffDays > 0 && diffDays <= 60) {
          const expKey = `care_expiry_${r.id}_${r.care_expiry_date}`;
          if (!isAlertDismissed(expKey)) {
            expiringResidents.push({ id: r.id, name: r.name, level: r.care_level, date: r.care_expiry_date, days: diffDays, key: expKey });
          }
        }
      }
    });
    gState.lastCareExpiryAlertKeys = expiringResidents.map(e => e.key);
    if (expiringResidents.length > 0) {
      const list = expiringResidents.map(e => `${e.name}様 (${e.level}, 期限:${e.date}, あと${e.days}日)`).join(" / ");
      officeAlertHtml += `
        <div class="alert-banner alert-warning notice-card-warning">
          <span> 【要介護認定更新アラート】更新申請の手続きが必要です：${list}</span>
          <button class="btn btn-secondary" style="padding:2px 8px; font-size:11px;" onclick="requestDismissAlertFromButton(this, gState.lastCareExpiryAlertKeys || [])"> 申請手配済・閉じる</button>
        </div>
      `;
    }
  }

  // 介護現場ポータル コンテナへ描画
  // [Claude修正] お知らせの見出し【…】を共通の形にそろえる (色は style.css で指定)
  careAlertHtml = cpDecorateNoticeLabels(careAlertHtml);
  officeAlertHtml = cpDecorateNoticeLabels(officeAlertHtml);
  if (careContainer && careContainer.innerHTML !== careAlertHtml) {
    careContainer.innerHTML = careAlertHtml;
  }
  cpUpdateAlertFold("care");
  // 事務ポータル コンテナへ描画
  if (officeContainer && officeContainer.innerHTML !== officeAlertHtml) {
    officeContainer.innerHTML = officeAlertHtml;
  }
  cpUpdateAlertFold("office");
  // 旧コンテナが存在する場合の後方互換
  if (legacyContainer) {
    const combined = careAlertHtml + officeAlertHtml;
    if (legacyContainer.innerHTML !== combined) {
      legacyContainer.innerHTML = combined;
    }
  }
}

// ポータル切り替え
function switchPortal(portal) {
	gState.activePortal = portal;
	const homeSec = document.getElementById("portalHomeSection");
	if (homeSec) homeSec.style.display = "none";
	const btnCare = document.getElementById("btnNavCare");
	if (btnCare) btnCare.classList.toggle("active", portal === "care");
	const btnOffice = document.getElementById("btnNavOffice");
	if (btnOffice) btnOffice.classList.toggle("active", portal === "office");
	const careSec = document.getElementById("portalCareSection");
	if (careSec) careSec.style.display = portal === "care" ? "block" : "none";
	const officeSec = document.getElementById("portalOfficeSection");
	if (officeSec) officeSec.style.display = portal === "office" ? "block" : "none";

	if (portal === "office") {
		loadOfficeData();
	}
}

// 介護サブタブ切り替え
function switchCareTab(tab) {
 if (gState.activeCareTab === "med" && tab !== "med" && typeof cpMedPendingGuard === "function") cpMedPendingGuard();
 gState.activeCareTab = tab;
 if (typeof cpNavRecord === "function") cpNavRecord(); // [Claude修正 2026-10-16] 戻るボタン用の履歴
 const tabs = document.querySelectorAll("#portalCareSection .sub-tab-btn");
 tabs.forEach(btn => {
 btn.classList.remove("active");
 const oc = btn.getAttribute("onclick") || "";
 if (oc.includes(`'${tab}'`) || oc.includes(`"${tab}"`)) {
 btn.classList.add("active");
 }
 });

 // [Antigravity実装 2026-10-16] 見る画面（#tabCareRecord）と書く画面A（#tabCareWriteSingle）の切り替え・レイアウト維持
 const tabMap = {
 record: "tabCareRecord", write_single: "tabCareWriteSingle", daily_journal: "tabCareDailyJournal", vitals: "tabCareVitals", excretion: "tabCareExcretion",
 meal: "tabCareMeal", bath: "tabCareBath", oral: "tabCareOral", med: "tabCareMed",
 night: "tabCareNight", weight: "tabCareWeight", linen: "tabCareLinen",
 grooming: "tabCareGrooming", visit: "tabCareVisit", recreation: "tabCareRecreation",
 notebook: "tabCareNotebook", consume: "tabCareConsume", incidents: "tabCareIncidents", topical: "tabCareTopical"
 };

 Object.values(tabMap).forEach(id => {
 const el = document.getElementById(id);
 if (el) el.style.display = "none";
 });
 const target = document.getElementById(tabMap[tab]);
 if (target) {
 // [Claude修正 2026-10-16] 個別記録は2列の並びをやめ、中の切り替えタブで「カルテ」「記録を見る・検索」を出し分ける
 target.style.display = (tab === "record") ? "" : "block";
 }

 if (tab === "record") {
 renderSelectedDateRecords();
 renderResidentDetail();
 cpSwitchRecordPane(gState.recordPane || "karte"); // [Claude修正 2026-10-16]
 }
 if (tab === "write_single" && typeof renderSingleWriteScreen === "function") renderSingleWriteScreen();
 if (tab === "daily_journal") renderDailyJournal();
 if (tab === "vitals") renderVitalsTable();
 if (tab === "excretion") renderExcretionTable();
 if (tab === "meal") renderMealsTable();
 if (tab === "bath") renderBathTable();
 if (tab === "topical") renderTopicalTable();
 if (tab === "oral") renderOralTable();
 if (tab === "med") renderMedTable();
 if (tab === "night") renderNightTable();
 if (tab === "weight") renderWeightTable();
 if (tab === "linen") renderLinenTable();
 if (tab === "grooming") renderGroomingTable();
 if (tab === "recreation") renderRecreationTable();
 if (tab === "consume") renderQuickConsume();
 if (tab === "incidents") renderOfficeIncidents();
}

// カレンダー描画 (記録がある日に●印)
function renderCalendar() {
 const monthLabel = document.getElementById("calCurrentMonthLabel");
 const [year, month] = gState.currentMonth.split("-");
 if (monthLabel) monthLabel.textContent = `${year}年${parseInt(month)}月`;

 const recordedDates = new Set();
 (db.data.care_records || []).forEach(r => {
 if (r.voided) return; // [Claude修正] 取消済みは数えない
 const d = r.recorded_at || r.record_time;
 if (d && typeof d === 'string') recordedDates.add(d.slice(0, 10));
 });
 (db.data.vitals || []).forEach(r => { if (r.date && !r.voided) recordedDates.add(r.date); });
 (db.data.excretions || []).forEach(r => { if (r.date && !r.voided) recordedDates.add(r.date); });
 (db.data.meals || []).forEach(r => { if (r.date && !r.voided) recordedDates.add(r.date); });
 (db.data.notebooks || []).forEach(r => { if (r.date && !r.voided) recordedDates.add(r.date); });
 (db.data.daily_schedules || []).forEach(r => { if (r.date && !r.voided) recordedDates.add(r.date); }); // [Antigravity実装 2026-10-16]

 const daysRow = document.getElementById("calDaysRow");
 if (!daysRow) return;
 daysRow.innerHTML = "";
 const daysInMonth = new Date(year, month, 0).getDate();
 const weekDays = ["日", "月", "火", "水", "木", "金", "土"];

 for (let d = 1; d <= daysInMonth; d++) {
 const dayStr = String(d).padStart(2, "0");
 const fullDate = `${year}-${month}-${dayStr}`;
 const dateObj = new Date(year, month - 1, d);
 const w = weekDays[dateObj.getDay()];

 const cell = document.createElement("div");
 cell.className = `cal-day-cell ${fullDate === gState.selectedDate ? "selected" : ""}`;
 if (recordedDates.has(fullDate)) {
 cell.classList.add("has-record");
 }
 cell.onclick = () => selectDate(fullDate);

 cell.innerHTML = `
 <div class="day-num">${d}</div>
 <div class="day-week">${w}</div>
 `;
 daysRow.appendChild(cell);
 }
}

function changeMonth(offset) {
 const [y, m] = gState.currentMonth.split("-").map(Number);
 const newDate = new Date(y, m - 1 + offset, 1);
 gState.currentMonth = `${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, "0")}`;
 selectDate(`${gState.currentMonth}-01`);
 if (gState.activeCareTab === "weight") renderWeightTable();
}

function selectDate(dt) {
 gState.selectedDate = dt;
 renderCalendar();
 loadDateRecords(dt);
 const depDateInput = document.getElementById("depDate");
 if (depDateInput) {
 depDateInput.value = dt;
 }
}

function loadDateRecords(dt) {
 syncGlobalDatePicker(dt);
 if (typeof renderTodayShiftBar === "function") renderTodayShiftBar(dt);
 renderSelectedDateRecords();
 if (typeof renderSingleWriteScreen === "function" && gState.activeCareTab === "write_single") renderSingleWriteScreen();
 renderNotebook();
 if (gState.activeCareTab === "daily_journal") renderDailyJournal();
 if (gState.activeCareTab === "vitals") renderVitalsTable();
 if (gState.activeCareTab === "excretion") renderExcretionTable();
 if (gState.activeCareTab === "meal") renderMealsTable();
 if (gState.activeCareTab === "bath") renderBathTable();
 if (gState.activeCareTab === "topical") renderTopicalTable();
 if (gState.activeCareTab === "oral") renderOralTable();
 if (gState.activeCareTab === "med") renderMedTable();
 if (gState.activeCareTab === "night") renderNightTable();
 if (gState.activeCareTab === "weight") renderWeightTable();
 if (gState.activeCareTab === "linen") renderLinenTable();
 if (gState.activeCareTab === "grooming") renderGroomingTable();
 if (gState.activeCareTab === "recreation") renderRecreationTable();
 if (gState.activeCareTab === "consume") renderQuickConsume();
}

// 共通日付バーの同期・操作 (全タブ連動)
function syncGlobalDatePicker(dt) {
 const picker = document.getElementById("globalCareDatePicker");
 if (picker && picker.value !== dt) picker.value = dt;

 const label = document.getElementById("globalDateDisplayLabel");
 const countBadge = document.getElementById("globalDateRecordCountBadge");
 if (!label || !dt) return;

 const days = ["日", "月", "火", "水", "木", "金", "土"];
 const dObj = new Date(dt + "T00:00:00");
 const dayName = !isNaN(dObj.getDay()) ? days[dObj.getDay()] : "";
 const isToday = (dt === toLocalDateStr(new Date()));
 label.textContent = `${dt} (${dayName})` + (isToday ? " [本日]" : "");

 // 当日の記録件数を集計してバッジ表示
 let recCount = 0;
 (db.data.care_records || []).forEach(r => {
   if (r.voided) return; // [Claude修正] 取消済みは数えない
   const d = (r.recorded_at || r.record_time || "").slice(0, 10);
   if (d === dt) recCount++;
 });
 (db.data.vitals || []).forEach(r => { if (r.date === dt && !r.voided) recCount++; });
 (db.data.meals || []).forEach(r => { if (r.date === dt && !r.voided) recCount++; });
 (db.data.excretions || []).forEach(r => { if (r.date === dt && !r.voided) recCount++; });

 if (countBadge) {
   countBadge.textContent = `記録: 計 ${recCount} 件`;
 }
}



// 日付・時刻ワンタイムスナップショット機能 (ボタン押下時・初回のみ現在時刻を取得・継続自動更新なし)
function initGlobalTimeSync() {
	if (!gState.selectedTime) {
		const now = new Date();
		const hh = String(now.getHours()).padStart(2, '0');
		const mm = String(now.getMinutes()).padStart(2, '0');
		gState.selectedTime = `${hh}:${mm}`;
	}
	const timePicker = document.getElementById("globalCareTimePicker");
	if (timePicker && gState.selectedTime) {
		timePicker.value = gState.selectedTime;
	}
	updateRecordFormCustomTime();
}

function syncGlobalTimeToNow() {
	// ボタンを押した「その瞬間」の時刻を取得・一回のみ固定セット（継続タイマー更新なし）
	const now = new Date();
	const hh = String(now.getHours()).padStart(2, '0');
	const mm = String(now.getMinutes()).padStart(2, '0');
	const curTime = `${hh}:${mm}`;

	gState.selectedTime = curTime;
	gState.userOverrodeTime = true;

	const timePicker = document.getElementById("globalCareTimePicker");
	if (timePicker) timePicker.value = curTime;
	updateRecordFormCustomTime();
}

function onGlobalTimeChange(timeVal) {
	gState.userOverrodeTime = true;
	gState.selectedTime = timeVal;
	updateRecordFormCustomTime();
}

function updateRecordFormCustomTime() {
	const d = gState.selectedDate || toLocalDateStr(new Date());
	const t = gState.selectedTime || "09:00";
	const customTimeInput = document.getElementById("recordCustomTime");
	if (customTimeInput) {
		customTimeInput.value = `${d}T${t}`;
	}
}


function onGlobalDateChange(newDate) {
 if (!newDate) return;
 if (typeof cpMedPendingGuard === "function") cpMedPendingGuard();
 gState.selectedDate = newDate;
 gState.currentMonth = newDate.slice(0, 7);
 loadDateRecords(newDate);
}

function changeDateByDays(offset) {
 const cur = gState.selectedDate || toLocalDateStr(new Date());
 const d = new Date(cur + "T00:00:00");
 d.setDate(d.getDate() + offset);
 const y = d.getFullYear();
 const m = String(d.getMonth() + 1).padStart(2, "0");
 const day = String(d.getDate()).padStart(2, "0");
 const newDt = `${y}-${m}-${day}`;
 onGlobalDateChange(newDt);
}

function setTodayDate() {
 const today = toLocalDateStr(new Date());
 onGlobalDateChange(today);
}

// 利用者カード一覧
function selectResident(id) {
 gState.selectedResidentId = id;
 renderResidentsStrip();
	initGlobalTimeSync();
	
 renderResidentDetail();
 updateRecordTargetBanner();
  // [Antigravity実装 2026-10-15] 排泄チェック表の固定ヘッダー連動更新
  if (typeof updateExcretionStickyHeader === "function") updateExcretionStickyHeader();
 renderSelectedDateRecords();
 if (typeof renderSingleWriteScreen === "function" && gState.activeCareTab === "write_single") renderSingleWriteScreen();
 if (gState.activeCareTab === "consume") renderQuickConsume();
 if (gState.activeCareTab === "linen") renderLinenTable();
 renderOfficeDepositTable();
}

// 利用者カルテ (フェイスシート・病歴ガイド・看取りスタンプ・見守り注意・私物行追加・備品・写真保管)
function renderResidentDetail() {
 const r = gState.residents.find(x => x.id === gState.selectedResidentId);
 const container = document.getElementById("residentDetailCard");
 if (!r) {
 container.innerHTML = "<p>利用者を選択してください</p>";
 return;
 }

 const stampClass = r.policy_stamp === "看取り" ? "policy-mitori" : "policy-kyukyu";
 const diseasesList = (r.diseases || "").split(",").map(d => d.trim()).filter(Boolean);
 const diseaseTags = diseasesList.map(d => `
 <span class="disease-tag" style="cursor:pointer;" onclick="event.preventDefault(); event.stopPropagation(); openDiseaseGuide(this.getAttribute('data-disease')); return false;" data-disease="${escapeHtml(d)}">${escapeHtml(d)}</span>
 `).join("");

 // 私物行リスト
 const belongings = (db.data.belongings || []).filter(b => !b.voided && b.resident_id === r.id);
 let belongingsHtml = belongings.map(b => `
 <tr style="font-size:12px;">
 <td>${escapeHtml(b.category || '-')}</td>
 <td><strong>${escapeHtml(b.item_name || '-')}</strong></td>
 <td>
 <div style="display:inline-flex; align-items:center; gap:4px;">
 <button type="button" class="btn btn-secondary" style="padding:1px 6px; font-size:11px; line-height:1.1;" title="数量を1つ減らす（劣化・破棄時）" onclick="adjustBelongingQty(${b.id}, -1)">−</button>
 <span style="color:#0284c7; font-weight:bold; min-width:32px; text-align:center;">${escapeHtml(b.quantity || '1')}</span>
 <button type="button" class="btn btn-secondary" style="padding:1px 6px; font-size:11px; line-height:1.1;" title="数量を1つ増やす（追加持参時）" onclick="adjustBelongingQty(${b.id}, 1)">＋</button>
 </div>
 </td>
 <td>${b.marked ? ' 記名済' : '<span style="color:#dc2626;">未確認</span>'}</td>
 <td style="color:#5f6d66;">${escapeHtml(b.notes || '-')}</td>
 <td style="white-space:nowrap;">
 <button type="button" class="btn btn-secondary" style="padding:2px 6px; font-size:11px;" onclick="openBelongingModal(${b.id})"> 編集</button>
 <button type="button" class="btn btn-secondary" style="padding:2px 6px; font-size:11px; color:#dc2626;" onclick="deleteBelonging(${b.id})"> 削除</button>
 </td>
 </tr>
 `).join("");

 // 備品リスト
 const equipments = (db.data.equipments || []).filter(eq => !eq.voided && eq.resident_id === r.id);
 let equipmentsHtml = equipments.map(eq => `
 <span class="badge" style="background:#e0f2fe; color:#0369a1; padding:4px 8px; font-size:12px; margin-right:6px; margin-bottom:4px; display:inline-flex; align-items:center; gap:6px;">
 <span>${escapeHtml(eq.equipment_name)} (${escapeHtml(eq.ownership_type || '施設備品')})</span>
 <button type="button" style="border:none; background:none; color:#0369a1; cursor:pointer; font-size:13px; font-weight:bold; padding:0 2px;" title="使用解除・返却" onclick="deleteEquipment(${eq.id})"></button>
 </span>
 `).join("");

 // 写真・重要書類件数
 const resDocs = (db.data.photos || []).filter(p => !p.voided && p.resident_id === r.id && p.category === 'documents');
 const resPhotos = (db.data.photos || []).filter(p => !p.voided && p.resident_id === r.id && p.category === 'personal');

 // 点眼処方指示
 const resEyedrops = (db.data.eyedrop_orders || []).filter(e => e.resident_id === r.id && e.status !== '終了');
 let eyedropSummaryHtml = '';
 if (resEyedrops.length === 0 || resEyedrops.every(e => e.eye === '指示なし')) {
 eyedropSummaryHtml = '<span style="color:#5f6d66; font-size:12px;">定期点眼指示なし</span>';
 } else {
 eyedropSummaryHtml = resEyedrops.map(e => {
 const bColor = e.eye === '右のみ' ? '#173f33' : (e.eye === '左のみ' ? '#065f46' : '#36443e');
 const bText = `[${escapeHtml(e.eye)}]`;
 const tStr = (e.timing_slots || []).join('・');
 return `<div style="display:inline-flex; align-items:center; gap:4px; margin-right:8px; margin-top:2px;">
 <span class="badge" style="background:${bColor}; color:#ffffff; font-weight:bold; font-size:11px; padding:2px 6px;">${bText}</span>
 ${cpDrugLink(e.medicine_name, "drug-link-inline drug-link-strong", "目薬")}
 <span style="color:#1e5b47; font-size:11.5px;">(${escapeHtml(tStr)} ${escapeHtml(e.dosage || '用量未登録')})</span>
 </div>`;
 }).join('');
 }

 container.innerHTML = `
 <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
 <div>
 <span class="room-badge" style="font-size:13px;">${r.room_no}号室</span>
 <h2 style="font-size:20px; font-weight:bold; margin-top:4px;">${r.name} 様</h2>
 <span style="font-size:13px; color:var(--text-muted);">${r.care_level} / 生年月日: ${r.birth_date || "-"}</span>
 </div>
 <div style="text-align:right;">
 <div class="policy-stamp ${stampClass}" style="font-size:14px; padding:4px 10px;">［ ${r.policy_stamp} ］</div>
 ${cpIsDischarged(r) ? `
 <div class="discharge-banner">退所 ${escapeHtml(r.discharge_date || "")}（${escapeHtml(r.discharge_reason || "")}）${r.discharge_note ? `<br>${escapeHtml(r.discharge_note)}` : ""}<br><span class="discharge-by">手続き ${escapeHtml(r.discharged_at || "")} ${escapeHtml(r.discharged_by || "")}</span></div>
 <div style="margin-top:6px; display:flex; gap:6px; justify-content:flex-end;">
 <button type="button" class="btn btn-secondary" style="font-size:13px; padding:3px 8px;" onclick="openEditResidentModal(${r.id})"> 編集</button>
 <button type="button" class="btn btn-secondary" style="font-size:13px; padding:3px 8px;" onclick="cancelDischarge(${r.id})">退所を取り消す</button>
 </div>` : `
 <div style="margin-top:6px; display:flex; gap:6px; justify-content:flex-end; flex-wrap:wrap;">
 <select class="form-control" style="font-size:13px; padding:3px 6px; width:auto;" onchange="updateResidentStatus(${r.id}, this.value)">
 <option value="在所" ${r.status==='在所'?'selected':''}>在所</option>
 <option value="入院中" ${r.status==='入院中'?'selected':''}>入院中</option>
 <option value="外泊中" ${r.status==='外泊中'?'selected':''}>外泊中</option>
 </select>
 <button type="button" class="btn btn-secondary" style="font-size:13px; padding:3px 8px;" onclick="openEditResidentModal(${r.id})"> 編集</button>
 <button type="button" class="btn btn-secondary" style="font-size:13px; padding:3px 8px;" onclick="openDischargeModal(${r.id})">退所の手続き</button>
 </div>`}
 </div>
 </div>

 <!-- 介護サマリー ＆ 緊急搬送・受診申し送りサマリー アクションバー -->
 <div style="background:#f1f6f3; border:1px solid #c9e0d5; border-radius:8px; padding:10px 14px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
 <div>
 <div style="font-weight:bold; color:#1e5b47; font-size:13.5px; display:flex; align-items:center; gap:6px;">
 <span>介護サマリー ＆ 緊急搬送・受診申し送り</span>
 <span class="badge" style="background:#1e5b47; color:#ffffff; font-size:11px; padding:1px 6px;">生活・ADL・救急連携</span>
 </div>
 <div style="font-size:12px; color:#4a5852; margin-top:3px;">
 ${getResidentSummaryStatusText(r.id)}
 </div>
 </div>
 <div style="display:flex; gap:6px; flex-wrap:wrap;">
 <button type="button" class="btn btn-secondary" style="font-size:12px; padding:5px 12px; background:#ffffff; color:#1a4f3d; border:1px solid #a9cfbf; font-weight:bold;" onclick="event.preventDefault(); event.stopPropagation(); openCareSummaryModal(${r.id}); return false;">
 介護サマリー (詳細・新規・変更)
 </button>
				<button type="button" class="btn btn-secondary" style="font-size:12px; padding:5px 12px; background:var(--pine-tint); color:var(--pine); border:1px solid var(--pine-light); font-weight:bold;" onclick="event.preventDefault(); event.stopPropagation(); openCareSummaryCompareModal(${r.id}); return false;">介護サマリー 新旧比較</button>
 <button type="button" class="btn btn-danger" style="font-size:12px; padding:5px 12px; background:#dc2626; border-color:#dc2626; font-weight:bold;" onclick="event.preventDefault(); event.stopPropagation(); openEmergencySummaryModal(${r.id}); return false;">
 緊急搬送・受診サマリー
 </button>
 <button type="button" class="btn btn-dark" style="font-size:12px; padding:5px 12px; background:#1c2622; border-color:#1c2622; color:#ffffff; font-weight:bold;" onclick="event.preventDefault(); event.stopPropagation(); openBodySchemaModal(${r.id}); return false;">
 皮膚・身体シェーマ図 (軟膏・処置)
 </button>
 <button type="button" class="btn btn-secondary" style="font-size:12px; padding:5px 12px; font-weight:bold;" onclick="event.preventDefault(); event.stopPropagation(); openRxModal(${r.id}, 'meds'); return false;">
 処方箋と処方薬
 </button>
 </div>
 </div>

 <!-- 1. 基本方針・見守り注意・ケアプラン目標 (アコーディオン) -->
 <details class="care-accordion" open style="margin-bottom:10px; border:1px solid #dfe5e1; border-radius:8px; background:#fff; overflow:hidden;">
 <summary style="padding:10px 14px; background:#f6f8f6; font-weight:bold; cursor:pointer; font-size:13px; color:#173f33; border-bottom:1px solid #dfe5e1; display:flex; justify-content:space-between; align-items:center;">
 <span> 基本方針 ＆ ケアプラン目標・見守り注意</span>
 <div style="display:flex; align-items:center; gap:8px;">
 <button type="button" class="btn btn-secondary" style="padding:2px 8px; font-size:11px;" onclick="event.preventDefault(); event.stopPropagation(); openCarePlanModal(${r.id}); return false;"> 変更</button>
 <span style="font-size:11px; color:#5f6d66;">(開閉)</span>
 </div>
 </summary>
 <div style="padding:12px;">
 ${r.sensor_alert ? `
 <div style="background:#fee2e2; border-left:4px solid #ef4444; padding:8px 12px; border-radius:6px; margin-bottom:10px; font-weight:bold; color:#991b1b; font-size:13px; display:flex; justify-content:space-between; align-items:center;">
 <span>${escapeHtml(r.sensor_alert)}</span>
 <button type="button" class="btn btn-secondary" style="padding:2px 6px; font-size:10px; color:#dc2626;" onclick="event.preventDefault(); event.stopPropagation(); openCarePlanModal(${r.id}, 'sensor'); return false;">変更</button>
 </div>
 ` : ''}
 <div style="background:#f0fdf4; border-left:4px solid #16a34a; padding:10px; border-radius:6px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:flex-start;">
 <div>
 <div style="font-size:12px; font-weight:bold; color:#15803d;"> ケアプラン目標・注意事項:</div>
 <div style="font-size:13px; margin-top:2px;">${escapeHtml(r.care_plan_goal || "安全な日常生活の維持・転倒予防")}</div>
 </div>
 <button type="button" class="btn btn-secondary" style="padding:2px 6px; font-size:10px;" onclick="event.preventDefault(); event.stopPropagation(); openCarePlanModal(${r.id}); return false;">変更</button>
 </div>
 ${(r.bp_high_max || r.temp_max || r.spo2_min) ? `
 <div style="background:#fffbeb; border:1px solid #fef3c7; border-radius:6px; padding:8px 10px; font-size:12px; color:#92400e; display:flex; justify-content:space-between; align-items:center;">
 <div>
 <strong> 設定済バイタル注意基準:</strong>
 ${r.bp_high_max ? `最高血圧: ${r.bp_high_min || 90}〜${r.bp_high_max}mmHg ` : ''}
 ${r.temp_max ? `体温上限: ${r.temp_max}℃ ` : ''}
 ${r.spo2_min ? `SpO2下限: ${r.spo2_min}% ` : ''}
 </div>
 <button type="button" class="btn btn-secondary" style="padding:2px 6px; font-size:10px;" onclick="event.preventDefault(); event.stopPropagation(); openCarePlanModal(${r.id}); return false;">基準値変更</button>
 </div>
 ` : ''}
 </div>
 </details>

 <!-- 2. 身体状況・病歴・食形態・口腔状態 (アコーディオン) -->
 <details class="care-accordion" open style="margin-bottom:10px; border:1px solid #dfe5e1; border-radius:8px; background:#fff; overflow:hidden;">
 <summary style="padding:10px 14px; background:#f6f8f6; font-weight:bold; cursor:pointer; font-size:13px; color:#173f33; border-bottom:1px solid #dfe5e1; display:flex; justify-content:space-between; align-items:center;">
 <span>身体状況・病歴 ＆ 食形態・口腔状態</span>
 <div style="display:flex; align-items:center; gap:8px;">
 <button type="button" class="btn btn-secondary" style="padding:2px 8px; font-size:11px;" onclick="event.preventDefault(); event.stopPropagation(); openBodyConditionModal(${r.id}, 'all'); return false;"> 変更</button>
 <span style="font-size:11px; color:#5f6d66;">(開閉)</span>
 </div>
 </summary>
 <div style="padding:12px;">
 <div style="margin-bottom:10px;">
 <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
 <div style="font-size:12px; font-weight:bold; color:var(--text-muted);">病歴・既往歴 (タップで現場対応ガイド表示):</div>
 <button type="button" class="btn btn-secondary" style="padding:2px 8px; font-size:11px; color:#1e5b47; border-color:#a9cfbf; background:#f1f6f3;" onclick="event.preventDefault(); event.stopPropagation(); openBodyConditionModal(${r.id}, 'diseases'); return false;">病歴を変更</button>
 </div>
 <div>${diseaseTags || '<span style="font-size:13px; color:var(--text-muted);">特記事項なし</span>'}</div>
 </div>
 
 <!-- 身体状況・食形態情報カード -->
 <div style="background:#f6f8f6; border:1px solid #dfe5e1; border-radius:8px; padding:12px;">
 <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:13px; margin-bottom:10px;">
 <div><strong>身体・麻痺:</strong> ${escapeHtml(r.paralysis || "未登録")}</div>
 <div><strong>アレルギー:</strong> <span style="color:#dc2626; font-weight:bold;">${escapeHtml(r.allergies || "未登録")}</span></div>
 <div><strong>食形態:</strong> ${escapeHtml(r.diet_type || "未登録")}</div>
 <div><strong>口腔状態:</strong> ${escapeHtml(r.oral_state || "残歯のみ")}</div>
 </div>
 <div style="background:#ffffff; border:1px solid #cdd6d0; border-radius:6px; padding:8px 10px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
 <div style="font-size:12px; color:#22302b; flex:1; min-width:200px;">
 <strong>皮膚処置・軟膏ピン:</strong> ${renderSchemaSummaryBadges(r.id)}
 </div>
 <button type="button" class="btn btn-secondary" style="padding:2px 8px; font-size:11px; background:#eef2ef; color:#1c2622; border-color:#cdd6d0; font-weight:bold; white-space:nowrap;" onclick="event.preventDefault(); event.stopPropagation(); openBodySchemaModal(${r.id}); return false;">
 シェーマ図を開く
 </button>
 </div>
 <div style="background:#ffffff; border:1px solid #cdd6d0; border-radius:6px; padding:8px 10px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
 <div style="font-size:12px; color:#22302b; flex:1; min-width:200px;">
 <strong>点眼処方指示:</strong> ${eyedropSummaryHtml}
 </div>
 <button type="button" class="btn btn-secondary" style="padding:2px 8px; font-size:11px; background:#f1f6f3; color:#1e5b47; border-color:#a9cfbf; font-weight:bold; white-space:nowrap;" onclick="event.preventDefault(); event.stopPropagation(); openEyedropOrderModal(${r.id}); return false;">
 点眼指示を変更
 </button>
 </div>
 <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px dashed #cdd6d0; padding-top:8px;">
 <span style="font-size:11.5px; color:#5f6d66;">※身体状況（麻痺）・食形態・口腔状態・アレルギーを変更できます</span>
 <button type="button" class="btn btn-secondary" style="padding:4px 12px; font-size:12px; background:#f1f6f3; color:#1a4f3d; border:1px solid #a9cfbf; font-weight:bold; display:inline-flex; align-items:center; gap:4px;" onclick="event.preventDefault(); event.stopPropagation(); openBodyConditionModal(${r.id}, 'all'); return false;">
  身体状況・食形態を変更
 </button>
 </div>
 </div>
 </div>
 </details>

 <!-- 3. 往診医・受診時指示 ＆ 特殊指示 (アコーディオン) -->
 <details class="care-accordion" open style="margin-bottom:10px; border:1px solid #dfe5e1; border-radius:8px; background:#fff; overflow:hidden;">
 <summary style="padding:10px 14px; background:#f1f6f3; font-weight:bold; cursor:pointer; font-size:13px; color:#1e5b47; border-bottom:1px solid #c9e0d5; display:flex; justify-content:space-between; align-items:center;">
 <span> 往診医・受診時指示 ＆ 特殊指示 (絶食・薬のみ等)</span>
 <div style="display:flex; align-items:center; gap:8px;">
 <button type="button" class="btn btn-secondary" style="padding:2px 8px; font-size:11px; background:#dcebe3; color:#1e5b47; border-color:#a9cfbf;" onclick="event.preventDefault(); event.stopPropagation(); openClinicInstructionModal(${r.id}, 'all'); return false;">受診指示を変更</button>
 <span style="font-size:11px; color:#5f6d66;">(開閉)</span>
 </div>
 </summary>
 <div style="padding:12px;">
 <!-- 特殊指示ブロック -->
 <div style="margin-bottom:10px; display:flex; justify-content:space-between; align-items:center; background:#fef2f2; border:1px solid #fecaca; border-left:4px solid #ef4444; border-radius:6px; padding:8px 12px;">
 <div style="color:#991b1b; font-weight:bold; font-size:13px;">
  【往診・受診 特殊指示】: ${escapeHtml(r.clinic_special_notes || '未登録')}
 </div>
 <button type="button" class="btn btn-secondary" style="padding:2px 8px; font-size:11px; color:#dc2626; border-color:#fca5a5; white-space:nowrap; margin-left:8px;" onclick="event.preventDefault(); event.stopPropagation(); openClinicInstructionModal(${r.id}, 'special'); return false;">特殊指示を変更</button>
 </div>

 <!-- 医師の指示内容 (受診時コメント) -->
 <div style="font-size:13px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:flex-start; background:#f6f8f6; padding:8px 10px; border-radius:6px;">
 <div>
 <strong>医師の指示内容 (受診時コメント):</strong>
 <div style="margin-top:2px; color:#22302b; white-space:pre-wrap;">${escapeHtml(r.dr_instructions || '未登録')}</div>
 </div>
 <button type="button" class="btn btn-secondary" style="padding:2px 8px; font-size:11px; white-space:nowrap; margin-left:8px;" onclick="event.preventDefault(); event.stopPropagation(); openClinicInstructionModal(${r.id}, 'instructions'); return false;">指示内容を変更</button>
 </div>

 <!-- 次回予定日 -->
 <div style="font-size:13px; display:flex; justify-content:space-between; align-items:center; background:#f0f9ff; padding:8px 10px; border-radius:6px;">
 <div>
 <strong style="color:#0369a1;"> 次回受診・往診予定日:</strong>
 <span style="font-weight:bold; margin-left:6px; color:#0284c7;">${r.next_clinic_date || '未定'}</span>
 </div>
 <button type="button" class="btn btn-secondary" style="padding:2px 8px; font-size:11px; white-space:nowrap; margin-left:8px;" onclick="event.preventDefault(); event.stopPropagation(); openClinicInstructionModal(${r.id}, 'date'); return false;">予定日を変更</button>
 </div>
 </div>
 </details>

 <!-- 4. 福祉用具 ＆ 私物持ち込み品台帳 (アコーディオン) -->
 <details class="care-accordion" style="margin-bottom:10px; border:1px solid #dfe5e1; border-radius:8px; background:#fff; overflow:hidden;">
 <summary style="padding:10px 14px; background:#f6f8f6; font-weight:bold; cursor:pointer; font-size:13px; color:#173f33; border-bottom:1px solid #dfe5e1; display:flex; justify-content:space-between; align-items:center;">
 <span> 福祉用具 ＆ 私物・持ち込み品台帳 (${belongings.length}点)</span>
 <div style="display:flex; align-items:center; gap:8px;">
 <button class="btn btn-secondary" style="padding:2px 8px; font-size:11px;" onclick="event.stopPropagation(); openBelongingModal()">＋私物を追加</button>
 <span style="font-size:11px; color:#5f6d66;">(開閉)</span>
 </div>
 </summary>
 <div style="padding:12px;">
 <div style="margin-bottom:12px; font-size:13px; background:#f0fdf4; border:1px solid #bbf7d0; padding:8px 10px; border-radius:6px;">
 <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
 <strong style="color:#166534;"> 使用福祉用具・備品 (${equipments.length}点):</strong>
 <button class="btn btn-secondary" style="padding:2px 8px; font-size:11px; background:#dcfce7; color:#166534; border-color:#86efac;" onclick="openEquipmentModal()">＋福祉用具・備品を追加</button>
 </div>
 <div style="margin-top:4px;">${equipmentsHtml || '<span style="color:var(--text-muted); font-size:12px;">登録なし</span>'}</div>
 </div>
 <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
 <strong style="font-size:13px;">私物・持ち込み品一覧 (衣類・日用品・家具等):</strong>
 <button class="btn btn-secondary" style="padding:2px 8px; font-size:11px;" onclick="openBelongingModal()">＋私物行を追加</button>
 </div>
 <table class="data-table" style="font-size:12px; margin-top:4px;">
 <thead>
 <tr><th>区分</th><th>品名(物)</th><th>個数</th><th>記名</th><th>備考・劣化状態</th><th style="width:110px;">操作</th></tr>
 </thead>
 <tbody>
 ${belongingsHtml || '<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">登録なし</td></tr>'}
 </tbody>
 </table>
 </div>
 </details>

 <!-- 5. 同意書 ＆ 写真保管庫 (アコーディオン) -->
 <details class="care-accordion" style="margin-bottom:10px; border:1px solid #dfe5e1; border-radius:8px; background:#fff; overflow:hidden;">
 <summary style="padding:10px 14px; background:#f6f8f6; font-weight:bold; cursor:pointer; font-size:13px; color:#173f33; border-bottom:1px solid #dfe5e1; display:flex; justify-content:space-between; align-items:center;">
 <span> 契約・同意書類 ＆ 写真保管庫 ${cpContractMissingBadge(r)}</span>
 <span style="font-size:11px; color:#5f6d66;">(タップで開閉)</span>
 </summary>
 <div style="padding:12px;">
 ${cpContractSectionHtml(r)}
 <div style="display:flex; gap:8px; flex-wrap:wrap;">
 <button class="btn btn-secondary" style="font-size:12px; padding:6px 12px; display:inline-flex; align-items:center; gap:6px;" onclick="openPhotoModal('documents')">
 重要書類(同意書)
 <span style="background:#1e5b47; color:white; border-radius:10px; padding:1px 7px; font-size:11px; font-weight:bold;">${resDocs.length}件</span>
 </button>
 <button class="btn btn-secondary" style="font-size:12px; padding:6px 12px; display:inline-flex; align-items:center; gap:6px;" onclick="openPhotoModal('personal')">
 個人写真
 <span style="background:#10b981; color:white; border-radius:10px; padding:1px 7px; font-size:11px; font-weight:bold;">${resPhotos.length}件</span>
 </button>
 </div>
 </div>
 </details>

 <!-- 6. 緊急連絡先 ＆ 家族の要望・生活歴・こだわり (アコーディオン) -->
 <details class="care-accordion" open style="margin-bottom:10px; border:1px solid #dfe5e1; border-radius:8px; background:#fff; overflow:hidden;">
 <summary style="padding:10px 14px; background:#f6f8f6; font-weight:bold; cursor:pointer; font-size:13px; color:#173f33; border-bottom:1px solid #dfe5e1; display:flex; justify-content:space-between; align-items:center;">
 <span> 緊急連絡先 ＆ 家族の要望・生活歴・こだわり</span>
 <div style="display:flex; align-items:center; gap:8px;">
 <button class="btn btn-secondary" style="padding:2px 8px; font-size:11px;" onclick="event.stopPropagation(); openFamilyHistoryModal(${r.id})"> 変更・更新</button>
 <span style="font-size:11px; color:#5f6d66;">(開閉)</span>
 </div>
 </summary>
 <div style="padding:12px; font-size:13px;">
 <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
 <div style="flex:1;">
 <div><strong> 緊急連絡先 & 搬送・延命処置方針:</strong> <span style="font-weight:bold; color:#1c2622;">${escapeHtml(r.emergency_contact || "未登録")}</span></div>
 <div style="margin-top:6px;"><strong> 家族の要望 (ACP・看取り・面会・ケア希望):</strong> <span style="color:#36443e;">${escapeHtml(r.family_wishes || "特になし")}</span></div>
 </div>
 <button class="btn btn-secondary" style="padding:3px 10px; font-size:11px; background:#eef2ef; white-space:nowrap; margin-left:8px;" onclick="openFamilyHistoryModal(${r.id})"> 項目を編集</button>
 </div>
 <div style="background:#fffbeb; border:1px solid #fef3c7; padding:8px 10px; border-radius:6px; font-size:12px;">
 <strong> 生活歴・人生歴・こだわり (職歴・趣味・習慣・性格):</strong>
 <p style="margin-top:3px; color:#78350f; margin-bottom:0;">${escapeHtml(r.life_history || "未登録")}</p>
 </div>
 </details>

 <!-- 7. 介護サマリー (生活・ADL・介助注意点 13項目一覧) -->
 <details class="care-accordion" open style="margin-bottom:10px; border:1px solid #dfe5e1; border-radius:8px; background:#fff; overflow:hidden;">
 <summary style="padding:10px 14px; background:#f0fdf4; font-weight:bold; cursor:pointer; font-size:13px; color:#166534; border-bottom:1px solid #bbf7d0; display:flex; justify-content:space-between; align-items:center;">
 <span> 介護サマリー要約 (生活・ADL・介助注意点 13項目)</span>
 <div style="display:flex; align-items:center; gap:8px;">
 <button type="button" class="btn btn-secondary" style="padding:2px 8px; font-size:11px; background:#dcfce7; color:#166534; border-color:#86efac;" onclick="event.preventDefault(); event.stopPropagation(); openCareSummaryModal(${r.id}); return false;">サマリー編集・新規</button>
 <span style="font-size:11px; color:#5f6d66;">(開閉)</span>
 </div>
 </summary>
 <div style="padding:12px; font-size:12.5px;">
 ${renderResidentSummaryAccordionContent(r.id)}
 </div>
 </details>

 `;
 // [Claude修正 2026-10-16] カルテを画面いっぱいの幅で見せるとき、開閉できる枠を広い画面では2列に並べる
 const accs = container.querySelectorAll(":scope > details.care-accordion");
 if (accs.length) {
  const cols = document.createElement("div");
  cols.className = "cp-karte-cols";
  accs[0].before(cols);
  accs.forEach(a => cols.appendChild(a));
 }
}

// [Claude修正 2026-10-16] 個別記録の中の切り替え（カルテ／記録を見る・検索）。どんな人かを知ってから日々の記録を見る流れにするため、最初はカルテ
function cpSwitchRecordPane(pane) {
 gState.recordPane = (pane === "log") ? "log" : "karte";
 const k = document.getElementById("recordPaneKarte");
 const l = document.getElementById("recordPaneLog");
 if (k) k.style.display = gState.recordPane === "karte" ? "" : "none";
 if (l) l.style.display = gState.recordPane === "log" ? "" : "none";
 document.querySelectorAll("#recordPaneTabs button[data-pane]").forEach(b => {
  const on = b.getAttribute("data-pane") === gState.recordPane;
  b.classList.toggle("active", on);
  b.setAttribute("aria-selected", on ? "true" : "false");
 });
}
window.cpSwitchRecordPane = cpSwitchRecordPane;

// ======================================================================
// 現場介護向け 医療・症状・病名専門用語 アノテーション ＆ やさしい解説表示
// ======================================================================
function annotateMedicalTerms(text) {
 if (!text || typeof text !== "string") return "";
 const escaped = escapeHtml(text);
 
 // 長い用語から順にマッチさせて部分一致破壊（例: 大腿骨頸部骨折 vs 骨折）を確実に防止
 const termKeys = Object.keys(MEDICAL_TERMS_DICTIONARY).sort((a, b) => b.length - a.length);
 if (termKeys.length === 0) return escaped;

 const escapeRegex = s => s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
 const pattern = new RegExp(termKeys.map(escapeRegex).join("|"), "g");

 return escaped.replace(pattern, (match) => {
 return `<span class="term-link" onclick="openTermExplanation('${match}')" title="クリックしてやさしい解説・判断基準を表示">${match}</span>`;
 });
}

function openTermExplanation(termKey) {
 const info = MEDICAL_TERMS_DICTIONARY[termKey];
 if (!info) return;

 const card = document.getElementById("termExplainCard");
 if (!card) return;

 const titleEl = document.getElementById("termExplainTitle");
 if (titleEl) titleEl.textContent = info.term;

 const rubyEl = document.getElementById("termExplainRuby");
 if (rubyEl) rubyEl.textContent = info.ruby ? `(${info.ruby})` : "";

 const badgeEl = document.getElementById("termExplainUrgencyBadge");
 if (badgeEl) {
 badgeEl.textContent = info.urgency;
 if (info.urgencyType === "danger") {
 badgeEl.style.background = "#fee2e2";
 badgeEl.style.color = "#991b1b";
 badgeEl.style.border = "1px solid #fca5a5";
 } else if (info.urgencyType === "warning") {
 badgeEl.style.background = "#fef3c7";
 badgeEl.style.color = "#92400e";
 badgeEl.style.border = "1px solid #fcd34d";
 } else {
 badgeEl.style.background = "#e0f2fe";
 badgeEl.style.color = "#0369a1";
 badgeEl.style.border = "1px solid #bae6fd";
 }
 }

 const meaningEl = document.getElementById("termExplainMeaning");
 if (meaningEl) meaningEl.textContent = info.meaning;

 const checkpointEl = document.getElementById("termExplainCheckpoint");
 if (checkpointEl) checkpointEl.textContent = info.checkPoint;

 // [Claude修正] 病名でない用語のときにボタンの並び全体を隠していたため、「閉じる」も消えて閉じられなかった。
 // 隠すのはガイドへ進むボタンだけにする
 const btnJump = document.getElementById("btnJumpToDiseaseGuide");
 if (btnJump) {
 if (info.isDisease) {
 btnJump.style.display = "";
 btnJump.onclick = () => {
 openDiseaseGuide(info.term);
 };
 btnJump.textContent = `『${info.term}』の現場ケアガイドを開く`;
 } else {
 btnJump.style.display = "none";
 btnJump.onclick = null;
 }
 }

 // 画面の中央に固定して出す (以前の scrollIntoView は固定表示のカードには効かなかった)
 card.scrollTop = 0;
 card.style.display = "block";
}

function closeTermExplanation() {
 const card = document.getElementById("termExplainCard");
 if (card) {
 card.style.display = "none";
 }
}

// 病歴ガイド モーダル (現場実践・看護連携マニュアル＆施設独自編集対応)
function openDiseaseGuide(diseaseName) {
 closeTermExplanation();
 const name = (diseaseName || "").trim();
 const res = resolveDiseaseGuide(name);
 // [Claude修正 2026-10-14] 根拠を確かめていない標準の文（数値入り）は使わない
 const guide = (res && res.guide) ? res.guide : { symptoms: "", care_points: "", emergency: "" };
 const isPending = !res || !!res.pending;
 const matchedName = res ? res.matchedName : name;
 const isCustom = res ? res.isCustom : false;
 const isFallback = res ? res.isFallback : false;

 const titleEl = document.getElementById("diseaseModalTitle");
 if (titleEl) {
 let subInfo = "";
 if (isCustom) {
 subInfo = `<span style="font-size:12px; background:#fef3c7; color:#92400e; padding:2px 8px; border-radius:10px; margin-left:8px; font-weight:normal;"> 施設独自設定</span>`;
 } else if (matchedName && matchedName !== name) {
 subInfo = `<span style="font-size:12px; background:#e0f2fe; color:#0369a1; padding:2px 8px; border-radius:10px; margin-left:8px; font-weight:normal;"> 関連参照: ${escapeHtml(matchedName)}</span>`;
 } else if (isFallback) {
 subInfo = `<span style="font-size:12px; background:#eef2ef; color:#4a5852; padding:2px 8px; border-radius:10px; margin-left:8px; font-weight:normal;"> 基本見守り基準</span>`;
 }
 if (isPending) {
 subInfo = `<span style="font-size:13px; background:var(--caution-tint); color:var(--caution); padding:2px 8px; border-radius:10px; margin-left:8px; font-weight:normal;"> 資料を確認中</span>`;
 }
 titleEl.innerHTML = `【${escapeHtml(name)}】 現場ケアガイド ＆ 観察ポイント ${subInfo}`;
 }

 const contentEl = document.getElementById("diseaseModalContent");
 if (contentEl && isPending) {
 contentEl.innerHTML = `
 <div style="background:var(--caution-tint); border:1px solid var(--line); border-left:5px solid var(--caution); border-radius:8px; padding:12px; margin-bottom:12px;">
 <p style="font-size:14px; color:var(--ink); margin:0; line-height:1.7;">${escapeHtml(CP_GUIDE_PENDING_TEXT)}</p>
 </div>
 <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">
 <button class="btn btn-secondary" style="font-size:13px; padding:6px 10px;" onclick="toggleCustomDiseaseEdit(true)">施設独自の現場ケアを追加</button>
 <span style="font-size:13px; color:var(--ink-3);">※主治医指示が最優先されます</span>
 </div>
 `;
 } else if (contentEl) {
 contentEl.innerHTML = `
 <!-- 1. すぐに報告する基準 (最優先) -->
 <div style="background:#fef2f2; border:1px solid #fecaca; border-left:5px solid #dc2626; border-radius:8px; padding:12px; margin-bottom:12px;">
 <h4 style="font-size:13.5px; color:#991b1b; font-weight:bold; margin-bottom:6px; display:flex; align-items:center; gap:6px;">
 <span> すぐに看護師・医師へ報告する基準（危険レベル・具体的症状）:</span>
 </h4>
 <p style="font-size:13px; color:#7f1d1d; margin:0; line-height:1.6;" id="dispGuideEmergency">${annotateMedicalTerms(guide.emergency)}</p>
 </div>

 <!-- 2. 現場介護でしてよい対応・ケア (医療行為外の安全対応) -->
 <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-left:5px solid #16a34a; border-radius:8px; padding:12px; margin-bottom:12px;">
 <h4 style="font-size:13.5px; color:#166534; font-weight:bold; margin-bottom:6px; display:flex; align-items:center; gap:6px;">
 <span> 現場介護でしてよい対応・ケア（医療行為以外の安全な初期対応）:</span>
 </h4>
 <p style="font-size:13px; color:#14532d; margin:0; line-height:1.6;" id="dispGuideCare">${annotateMedicalTerms(guide.care_points)}</p>
 </div>

 <!-- 3. 主な症状・見守りの観察サイン -->
 <div style="background:#f6f8f6; border:1px solid #dfe5e1; border-left:5px solid #5f6d66; border-radius:8px; padding:12px; margin-bottom:12px;">
 <h4 style="font-size:13.5px; color:#1c2622; font-weight:bold; margin-bottom:6px; display:flex; align-items:center; gap:6px;">
 <span> 主な症状 ＆ 日常ケア時の観察サイン:</span>
 </h4>
 <p style="font-size:13px; color:#36443e; margin:0; line-height:1.6;" id="dispGuideSymptoms">${annotateMedicalTerms(guide.symptoms)}</p>
 </div>

 <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">
 <div style="display:flex; gap:8px;">
 <button class="btn btn-secondary" style="font-size:11.5px; padding:3px 8px; color:#1e5b47; border-color:#c9e0d5; background:#f1f6f3;" onclick="toggleCustomDiseaseEdit(true)">
  この病気の現場ケアを編集・追加
 </button>
 ${isCustom ? `
 <button class="btn btn-secondary" style="font-size:11.5px; padding:3px 8px; color:#dc2626; border-color:#fecaca;" onclick="resetCustomDiseaseGuide('${escapeHtml(name)}')">
 標準辞書に戻す
 </button>
 ` : ''}
 </div>
 <span style="font-size:11.5px; color:#5f6d66;">※主治医指示が最優先されます</span>
 </div>
 `;
 }

 // 静的編集フォーム初期化
 toggleCustomDiseaseEdit(false);
 const nameInp = document.getElementById("editGuideDiseaseName");
 if (nameInp) nameInp.value = name;
 const editTitle = document.getElementById("diseaseCustomEditTitle");
 if (editTitle) editTitle.textContent = ` 【${name}】の施設独自ケアガイドを編集・保存`;
 const symInp = document.getElementById("editGuideSymptoms");
 if (symInp) symInp.value = guide.symptoms;
 const careInp = document.getElementById("editGuideCare");
 if (careInp) careInp.value = guide.care_points;
 const emgInp = document.getElementById("editGuideEmergency");
 if (emgInp) emgInp.value = guide.emergency;

 const btnSearch = document.getElementById("btnSearchDiseaseRecords");
 if (btnSearch) {
 btnSearch.onclick = () => {
 closeModal("diseaseModal");
 const searchInp = document.getElementById("searchInput");
 if (searchInp) {
 searchInp.value = name;
 doSearch();
 }
 };
 }
 document.getElementById("diseaseModal").style.display = "flex";
}

function toggleCustomDiseaseEdit(show) {
 const el = document.getElementById("diseaseCustomEditArea");
 if (el) el.style.display = show ? "block" : "none";
}

function saveCustomDiseaseGuide() {
 const name = (document.getElementById("editGuideDiseaseName")?.value || "").trim();
 if (!name) return;
 const symptoms = (document.getElementById("editGuideSymptoms")?.value || "").trim();
 const care = (document.getElementById("editGuideCare")?.value || "").trim();
 const emergency = (document.getElementById("editGuideEmergency")?.value || "").trim();

 if (!db.data) db.data = {};
 if (!db.data.custom_disease_guides) db.data.custom_disease_guides = {};

 db.data.custom_disease_guides[name] = {
 symptoms: symptoms || "日々のバイタル・顔色を観察。",
 care_points: care || "現場での安全な見守り。",
 emergency: emergency || "異変時は看護師・医師へ連絡。"
 };

 db.save();
 alert(`【${name}】の現場ケアガイドを施設独自データとして保存しました！\n次回から自動で呼び出されます。`);
 openDiseaseGuide(name);
}

function resetCustomDiseaseGuide(diseaseName) {
 if (confirm(`【${diseaseName}】の現場ケアガイドを標準辞書の初期値に戻しますか？`)) {
 if (db.data && db.data.custom_disease_guides && db.data.custom_disease_guides[diseaseName]) {
 delete db.data.custom_disease_guides[diseaseName];
 db.save();
 alert(`【${diseaseName}】の現場ケアガイドを標準辞書の初期値に戻しました。`);
 openDiseaseGuide(diseaseName);
 }
 }
}

// 対象利用者バナーの更新
function updateRecordTargetBanner() {
 const bannerText = document.getElementById("recordTargetResidentText");
 const fsBadge = document.getElementById("fsResidentBadge");
 const res = gState.residents.find(x => x.id === gState.selectedResidentId);
 if (res) {
 const str = ` 対象: 【${escapeHtml(res.room_no)}号室 ${escapeHtml(res.name)} 様】の介護記録を作成中`;
 if (bannerText) bannerText.innerHTML = str;
 if (fsBadge) fsBadge.textContent = `${res.room_no}号室 ${res.name} 様`;
 } else {
 if (bannerText) bannerText.textContent = " 対象利用者: 未選択 (上部一覧から選択してください)";
 if (fsBadge) fsBadge.textContent = "対象: 未選択";
  }
  // [Antigravity実装 2026-10-15] 排泄チェック表の固定ヘッダーも連動更新
  if (typeof updateExcretionStickyHeader === "function") updateExcretionStickyHeader();
}

// [Claude修正 2026-10-16] 経過記録の「あったこと」欄（swEventContent）。前の個別記録の書く欄（recordContent）は経過記録の画面へまとめたためなくした
function cpRecordArea() {
 return document.getElementById("swEventContent") || document.getElementById("recordContent");
}

// [Claude修正 2026-10-16] 書いた量に合わせて欄を広げる（上限は画面の半分。それ以上は欄の中でスクロール）
function cpAutoGrowTextarea(el) {
 if (!el) return;
 el.style.height = "auto";
 const max = Math.round(window.innerHeight * 0.5);
 el.style.height = Math.min(el.scrollHeight + 2, max) + "px";
 el.style.overflowY = el.scrollHeight + 2 > max ? "auto" : "hidden";
}

// リアルタイム文字数カウンター
function updateRecordCharCount() {
 // [Claude修正 2026-10-16] 文字数だけ表示する（B5用紙の目安は、経過記録は「あったこと」を書くだけで字数を目指す必要がないため外した）
 const area = cpRecordArea();
 const fsArea = document.getElementById("fsRecordContent");
 const len = area ? area.value.length : (fsArea ? fsArea.value.length : 0);
 ["swEventCharCount", "recordCharCount", "fsCharCount"].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.textContent = len;
 });
 if (area && area.id === "swEventContent") cpAutoGrowTextarea(area);
}

// 日報・総合記録テンプレートの挿入
// [Claude修正 2026-10-16] 日報雛形（insertB5Template）はなくした。バイタル・食事・排泄はチェック表と経過記録の欄から記録に反映されるため、文章で打ち直すと二重入力・数字の食い違いになる

// 定型文ボタン
function renderQuickTemplates() {
 const container = document.getElementById("quickTemplatesList");
 if (!container) return;
 container.innerHTML = "";
 (gState.templates || []).forEach(t => {
 const btn = document.createElement("button");
 btn.className = "template-btn";
 btn.textContent = `＋ ${t.label}`;
 btn.type = "button";
 btn.onclick = () => {
 const area = cpRecordArea();
 if (area) {
 area.value = (area.value ? area.value + "\n" : "") + t.phrase;
 updateRecordCharCount();
 area.focus();
 }
 };
 container.appendChild(btn);
 });
}

// 全画面集中エディタ機能
function openFullscreenRecord() {
 updateRecordTargetBanner();
 const area = cpRecordArea();
 const fsArea = document.getElementById("fsRecordContent");
 if (area && fsArea) {
 fsArea.value = area.value;
 }
 renderFsQuickTemplates();
 updateRecordCharCount();
 const modal = document.getElementById("fullscreenRecordModal");
 if (modal) modal.style.display = "flex";
}

function closeFullscreenRecord() {
 const area = cpRecordArea();
 const fsArea = document.getElementById("fsRecordContent");
 if (area && fsArea) {
 area.value = fsArea.value;
 }
 updateRecordCharCount();
 const modal = document.getElementById("fullscreenRecordModal");
 if (modal) modal.style.display = "none";
}

function syncFromFullscreen() {
 const area = cpRecordArea();
 const fsArea = document.getElementById("fsRecordContent");
 if (area && fsArea) {
 area.value = fsArea.value;
 }
 updateRecordCharCount();
}

function renderFsQuickTemplates() {
 const container = document.getElementById("fsQuickTemplatesList");
 if (!container) return;
 container.innerHTML = "";
 (gState.templates || []).forEach(t => {
 const btn = document.createElement("button");
 btn.className = "template-btn";
 btn.textContent = `＋ ${t.label}`;
 btn.onclick = () => {
 const fsArea = document.getElementById("fsRecordContent");
 if (fsArea) {
 fsArea.value = (fsArea.value ? fsArea.value + "\n" : "") + t.phrase;
 syncFromFullscreen();
 }
 };
 container.appendChild(btn);
 });
}

function submitCareRecordFromFullscreen() {
 // [Claude修正 2026-10-16] 全画面で書いた文は経過記録の「あったこと」欄へ戻し、経過記録の保存（入力した欄だけ保存）で残す
 syncFromFullscreen();
 if (typeof saveSingleWriteScreen === "function" && document.getElementById("swEventContent")) saveSingleWriteScreen();
 const area = cpRecordArea();
 if (!area || !area.value) {
 const modal = document.getElementById("fullscreenRecordModal");
 if (modal) modal.style.display = "none";
 }
}

function clearRecordForm() {
 if (confirm("記録入力欄をクリアしますか？")) {
 const area = cpRecordArea();
 const customTime = document.getElementById("recordCustomTime");
 const fsArea = document.getElementById("fsRecordContent");
 if (area) area.value = "";
 if (customTime) customTime.value = "";
 if (fsArea) fsArea.value = "";
 updateRecordCharCount();
 }
}

// ======================================================================
// 登録後 介護記録・カルテの個別編集・修正・加筆・削除機能
// ======================================================================
function openEditCareRecordModal(recId) {
 const rec = (db.data.care_records || []).find(r => Number(r.id) === Number(recId));
 if (!rec) {
 alert("対象の介護記録が見つかりません。");
 return;
 }
 const res = gState.residents.find(x => x.id === rec.resident_id);
 const resName = (rec.resident_id === 0) ? "フロア全体・共通" : (res ? `${res.room_no}号室 ${res.name} 様` : "利用者未指定");

 const idEl = document.getElementById("editCrId");
 const nameEl = document.getElementById("editCrResidentName");
 const timeEl = document.getElementById("editCrDateTime");
 const catEl = document.getElementById("editCrCategory");
 const staffEl = document.getElementById("editCrStaff");
 const contentEl = document.getElementById("editCrContent");

 if (idEl) idEl.value = rec.id;
 if (nameEl) nameEl.value = resName;
 if (timeEl) timeEl.value = rec.recorded_at || rec.record_time || "";
 if (catEl) catEl.value = rec.category || "介護記録";
 if (staffEl) { staffEl.value = rec.staff_name || ""; staffEl.readOnly = true; } // [Claude修正] 記録者名は訂正で変えられないようにする
 if (contentEl) contentEl.value = rec.content || "";

 openModal("editCareRecordModal");
}

// [Claude修正] 介護記録の訂正: 直す前の内容を訂正履歴（edit_history）に残す。記録者名は変えられない。訂正の理由を必ず書く
function updateCareRecord() {
 const idEl = document.getElementById("editCrId");
 if (!idEl) return;
 const recId = Number(idEl.value); // [Claude修正] parseInt だと小数を含むIDの記録が見つからず保存できなかった
 const rec = (db.data.care_records || []).find(r => Number(r.id) === recId);
 if (!rec) {
 alert("更新対象の介護記録が見つかりません。");
 return;
 }
 if (rec.voided) {
 alert("取消済みの記録は訂正できません。先に「取消を戻す」を行ってください。");
 return;
 }

 const contentEl = document.getElementById("editCrContent");
 const newContent = contentEl ? contentEl.value.trim() : "";
 if (!newContent) {
 alert("記録内容を入力してください。");
 return;
 }

 const timeEl = document.getElementById("editCrDateTime");
 const catEl = document.getElementById("editCrCategory");
 const newTime = (timeEl && timeEl.value.trim()) ? timeEl.value.trim() : (rec.recorded_at || "");
 const newCat = catEl ? catEl.value : rec.category;

 const before = { recorded_at: rec.recorded_at || rec.record_time || "", category: rec.category || "", content: rec.content || "" };
 if (before.recorded_at === newTime && before.category === newCat && before.content === newContent) {
 alert("変更された内容がありません。");
 return;
 }
 const reason = prompt("訂正の理由を入力してください (例: 誤字の修正、時刻の入力間違い)\n直す前の内容は訂正履歴として残ります。", "");
 if (reason === null) return;
 if (!reason.trim()) { alert("訂正の理由を入力してください。保存は行っていません。"); return; }

 if (!Array.isArray(rec.edit_history)) rec.edit_history = [];
 rec.edit_history.push({ edited_at: toLocalDateTimeStr(new Date()), edited_by: cpLedgerStaff(), reason: reason.trim(), before: before });
 rec.recorded_at = newTime;
 rec.category = newCat;
 rec.content = newContent;

 db.save();
 closeModal("editCareRecordModal");
 renderSelectedDateRecords();
 if (typeof renderDailyJournal === "function") renderDailyJournal();
 alert("介護記録を訂正しました。直す前の内容は訂正履歴に残っています。");
}

// [Claude修正] 介護記録は削除せず「取消」にする（記録は残り、取消済みとして表示される）
function deleteCareRecord() {
 const idEl = document.getElementById("editCrId");
 if (!idEl) return;
 const recId = Number(idEl.value);
 const rec = (db.data.care_records || []).find(r => Number(r.id) === recId);
 if (!rec || rec.voided) return;
 const reason = prompt("この介護記録を「取消」にします。\n記録は消えずに、取消済みとして残ります。\n\n取消の理由を入力してください (例: 重複登録、利用者の選択間違い)", "");
 if (reason === null) return;
 if (!reason.trim()) { alert("取消の理由を入力してください。取消は行っていません。"); return; }
 rec.voided = true;
 rec.voided_at = toLocalDateTimeStr(new Date());
 rec.voided_by = cpLedgerStaff();
 rec.void_reason = reason.trim();
 db.save();
 closeModal("editCareRecordModal");
 renderSelectedDateRecords();
 if (typeof renderDailyJournal === "function") renderDailyJournal();
 alert("介護記録を取消にしました。");
}

// [Claude修正] 印刷時に取消・訂正の情報を本文の前に書く
function cpCareRecordPrintNote(r) {
 let s = "";
 if (r.voided) s += `【取消済 ${r.voided_at || ''} ${r.voided_by || ''} 理由: ${r.void_reason || '-'}】\n`;
 if (r.edit_history && r.edit_history.length) {
 const last = r.edit_history[r.edit_history.length - 1];
 s += `（訂正あり ${r.edit_history.length}回 / 最終: ${last.edited_at} ${last.edited_by} 理由: ${last.reason}）\n`;
 }
 return escapeHtml(s);
}

function cpRestoreCareRecord(recId) {
 const rec = (db.data.care_records || []).find(r => Number(r.id) === Number(recId));
 if (!rec || !rec.voided) return;
 if (!confirm(`この介護記録の取消を戻し、有効な記録に戻しますか？\n(取消理由: ${rec.void_reason || '-'})`)) return;
 if (!Array.isArray(rec.void_history)) rec.void_history = [];
 rec.void_history.push({ voided_at: rec.voided_at, voided_by: rec.voided_by, void_reason: rec.void_reason, restored_at: toLocalDateTimeStr(new Date()), restored_by: cpLedgerStaff() });
 rec.voided = false;
 db.save();
 renderSelectedDateRecords();
 if (typeof renderDailyJournal === "function") renderDailyJournal();
}

function cpShowCareRecordHistory(recId) {
 const rec = (db.data.care_records || []).find(r => Number(r.id) === Number(recId));
 if (!rec) return;
 const lines = [];
 (rec.edit_history || []).forEach((h, i) => {
 lines.push(`■ 訂正${i + 1}: ${h.edited_at} ${h.edited_by}\n理由: ${h.reason}\n直す前: [${h.before.recorded_at}] [${h.before.category}]\n${h.before.content}`);
 });
 (rec.void_history || []).forEach(h => {
 lines.push(`■ 取消: ${h.voided_at} ${h.voided_by} (理由: ${h.void_reason}) → 取消を戻す: ${h.restored_at} ${h.restored_by}`);
 });
 alert(lines.length ? `【訂正・取消の履歴】\n\n${lines.join("\n\n")}` : "訂正・取消の履歴はありません。");
}

// 記録カードの右上: 取消済みなら取消情報と「取消を戻す」、それ以外は「訂正・取消」と（あれば）「履歴」
function cpCareRecordActions(r) {
 const hasHist = (r.edit_history && r.edit_history.length) || (r.void_history && r.void_history.length);
 const histBtn = hasHist ? `<button type="button" class="btn btn-secondary" style="font-size:11px; padding:2px 8px; border:1px solid #cdd6d0;" onclick="cpShowCareRecordHistory(${r.id})">履歴${r.edit_history && r.edit_history.length ? `(訂正${r.edit_history.length})` : ''}</button>` : '';
 if (r.voided) {
 return `<span style="font-size:11px; color:#991b1b; font-weight:bold;">取消済 ${escapeHtml(r.voided_at || '')} ${escapeHtml(r.voided_by || '')} 理由: ${escapeHtml(r.void_reason || '-')}</span>
 <button type="button" class="btn btn-secondary" style="font-size:11px; padding:2px 8px; border:1px solid #cdd6d0;" onclick="cpRestoreCareRecord(${r.id})">取消を戻す</button>${histBtn}`;
 }
 return `<button type="button" class="btn btn-secondary" style="font-size:11px; padding:2px 8px; border:1px solid #cdd6d0;" onclick="openEditCareRecordModal(${r.id})">訂正・取消</button>${histBtn}`;
}

// ======================================================================
// 夜間巡視・体位変換 自動生成定型文テンプレート管理 (施設独自編集)
// ======================================================================
function getNightTurnTemplates() {
 if (!db.data.night_turn_templates || typeof db.data.night_turn_templates !== "object") {
 db.data.night_turn_templates = Object.assign({}, DEFAULT_NIGHT_TURN_TEMPLATES);
 }
 // [Claude修正] 以前の標準の文のままになっている項目は、新しい標準の文に置き換える（施設が書き換えた文はそのまま）
 Object.keys(CP_OLD_NIGHT_TURN_TEMPLATES).forEach(k => {
 if (db.data.night_turn_templates[k] === CP_OLD_NIGHT_TURN_TEMPLATES[k]) db.data.night_turn_templates[k] = DEFAULT_NIGHT_TURN_TEMPLATES[k];
 });
 return db.data.night_turn_templates;
}

function openNightTurnTemplateModal() {
 const tpls = getNightTurnTemplates();
 const sleepEl = document.getElementById("tplNightSleep");
 const leftEl = document.getElementById("tplNightLeft");
 const rightEl = document.getElementById("tplNightRight");
 const supineEl = document.getElementById("tplNightSupine");
 const diaperEl = document.getElementById("tplNightDiaper");

 if (sleepEl) sleepEl.value = tpls["安眠中"] || DEFAULT_NIGHT_TURN_TEMPLATES["安眠中"];
 if (leftEl) leftEl.value = tpls["左側臥位"] || DEFAULT_NIGHT_TURN_TEMPLATES["左側臥位"];
 if (rightEl) rightEl.value = tpls["右側臥位"] || DEFAULT_NIGHT_TURN_TEMPLATES["右側臥位"];
 if (supineEl) supineEl.value = tpls["仰臥位"] || DEFAULT_NIGHT_TURN_TEMPLATES["仰臥位"];
 if (diaperEl) diaperEl.value = tpls["おむつ交換"] || DEFAULT_NIGHT_TURN_TEMPLATES["おむつ交換"];

 openModal("nightTurnTemplateModal");
}

function submitNightTurnTemplates() {
 if (!db.data.night_turn_templates) db.data.night_turn_templates = {};
 const sleepEl = document.getElementById("tplNightSleep");
 const leftEl = document.getElementById("tplNightLeft");
 const rightEl = document.getElementById("tplNightRight");
 const supineEl = document.getElementById("tplNightSupine");
 const diaperEl = document.getElementById("tplNightDiaper");

 db.data.night_turn_templates["安眠中"] = (sleepEl && sleepEl.value.trim()) || DEFAULT_NIGHT_TURN_TEMPLATES["安眠中"];
 db.data.night_turn_templates["左側臥位"] = (leftEl && leftEl.value.trim()) || DEFAULT_NIGHT_TURN_TEMPLATES["左側臥位"];
 db.data.night_turn_templates["右側臥位"] = (rightEl && rightEl.value.trim()) || DEFAULT_NIGHT_TURN_TEMPLATES["右側臥位"];
 db.data.night_turn_templates["仰臥位"] = (supineEl && supineEl.value.trim()) || DEFAULT_NIGHT_TURN_TEMPLATES["仰臥位"];
 db.data.night_turn_templates["おむつ交換"] = (diaperEl && diaperEl.value.trim()) || DEFAULT_NIGHT_TURN_TEMPLATES["おむつ交換"];

 db.save();
 closeModal("nightTurnTemplateModal");
 alert("夜間巡視・体位変換の自動生成定型文を保存しました！\n今後の巡視記録保存時にこの設定文が適用されます。");
}

function resetNightTurnTemplates() {
 if (!confirm("巡視定型文をシステムの初期標準設定に戻しますか？")) return;
 db.data.night_turn_templates = Object.assign({}, DEFAULT_NIGHT_TURN_TEMPLATES);
 db.save();
 openNightTurnTemplateModal();
 alert("定型文を初期標準設定に戻しました。");
}

// ======================================================================
// よく使う定型文テンプレート管理・追加・変更機能
// ======================================================================
const DEFAULT_CARE_TEMPLATES = [
 { category: "巡視", label: "安眠中", phrase: "訪室確認。安眠中。呼吸状態安定。" },
 { category: "巡視", label: "左側臥位", phrase: "確認のため訪室。左側臥位にて入眠中。" },
 { category: "巡視", label: "ナースコール対応", phrase: "ナースコールあり訪室。排泄介助実施。" },
 { category: "食事", label: "全量摂取", phrase: "主食・副食ともに全量摂取。むせ込みなし。" },
 { category: "食事", label: "むせ込みあり", phrase: "水分摂取時にむせ込みあり。看護師へ報告。" },
 { category: "排泄", label: "普通便中量", phrase: "トイレ誘導にて排尿あり。普通便中等量排便あり。" },
 { category: "入浴", label: "軟膏塗布", phrase: "一般浴実施。背部・両下腿に保湿軟膏塗布。皮膚状態異常なし。" },
 { category: "バイタル", label: "発熱あり", phrase: "発熱あり（体温はバイタル欄に記録）。看護師へ報告。" },
 { category: "特変", label: "ふらつき見守り", phrase: "立ち上がり時に軽度のふらつきを認める。転倒なし。付き添い見守りを強化。" },
 { category: "申し送り", label: "受診指示引継ぎ", phrase: "往診医より指示あり。指示内容：" }
];

function openTemplateManageModal() {
 cancelTemplateEdit();
 renderTemplateManageList();
 const modal = document.getElementById("templateManageModal");
 if (modal) modal.style.display = "flex";
}

function renderTemplateManageList() {
 const tbody = document.getElementById("templateManageTableBody");
 const countLabel = document.getElementById("tplCountLabel");
 const templates = gState.templates || [];
 if (countLabel) countLabel.textContent = templates.length;
 if (!tbody) return;

 if (templates.length === 0) {
 tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#5f6d66; padding:16px;">登録された定型文はありません。</td></tr>';
 return;
 }

 tbody.innerHTML = templates.map((t, idx) => `
 <tr>
 <td><span class="badge" style="background:#e0f2fe; color:#0369a1; font-size:11px;">${escapeHtml(t.category || "共通")}</span></td>
 <td><strong>${escapeHtml(t.label || "")}</strong></td>
 <td style="color:#36443e; line-height:1.4;">${escapeHtml(t.phrase || "")}</td>
 <td style="text-align:center; white-space:nowrap;">
 <button type="button" class="btn btn-secondary" style="padding:2px 8px; font-size:11px;" onclick="startEditTemplate(${idx})">編集</button>
 <button type="button" class="btn btn-secondary" style="padding:2px 8px; font-size:11px; color:#dc2626; border-color:#fca5a5;" onclick="deleteTemplate(${idx})">削除</button>
 </td>
 </tr>
 `).join("");
}

function submitTemplateForm() {
 const catEl = document.getElementById("tplCategorySelect");
 const labelEl = document.getElementById("tplLabelInput");
 const phraseEl = document.getElementById("tplPhraseInput");
 const editIdxEl = document.getElementById("tplEditIndex");

 const category = catEl ? catEl.value.trim() : "その他";
 const label = labelEl ? labelEl.value.trim() : "";
 const phrase = phraseEl ? phraseEl.value.trim() : "";
 const editIdx = editIdxEl ? parseInt(editIdxEl.value, 10) : -1;

 if (!label || !phrase) {
 alert("ボタン表示名と定型文章の両方を入力してください。");
 return;
 }

 if (!Array.isArray(db.data.templates)) db.data.templates = [];

 if (editIdx >= 0 && editIdx < db.data.templates.length) {
 db.data.templates[editIdx] = { category, label, phrase };
 } else {
 db.data.templates.push({ category, label, phrase });
 }

 gState.templates = db.data.templates;
 db.save();
 renderQuickTemplates();
 renderFsQuickTemplates();
 renderTemplateManageList();
 cancelTemplateEdit();
}

function startEditTemplate(idx) {
 const templates = gState.templates || [];
 const t = templates[idx];
 if (!t) return;

 const catEl = document.getElementById("tplCategorySelect");
 const labelEl = document.getElementById("tplLabelInput");
 const phraseEl = document.getElementById("tplPhraseInput");
 const editIdxEl = document.getElementById("tplEditIndex");
 const headingEl = document.getElementById("tplFormHeading");
 const badgeEl = document.getElementById("tplEditingBadge");
 const saveBtn = document.getElementById("btnSaveTemplate");
 const cancelBtn = document.getElementById("btnCancelEditTemplate");

 if (catEl) catEl.value = t.category || "巡視";
 if (labelEl) labelEl.value = t.label || "";
 if (phraseEl) phraseEl.value = t.phrase || "";
 if (editIdxEl) editIdxEl.value = idx;
 if (headingEl) headingEl.textContent = `定型文の変更・編集 (${t.label})`;
 if (badgeEl) badgeEl.style.display = "inline-block";
 if (saveBtn) saveBtn.textContent = "変更を保存する";
 if (cancelBtn) cancelBtn.style.display = "inline-block";
}

function cancelTemplateEdit() {
 const labelEl = document.getElementById("tplLabelInput");
 const phraseEl = document.getElementById("tplPhraseInput");
 const editIdxEl = document.getElementById("tplEditIndex");
 const headingEl = document.getElementById("tplFormHeading");
 const badgeEl = document.getElementById("tplEditingBadge");
 const saveBtn = document.getElementById("btnSaveTemplate");
 const cancelBtn = document.getElementById("btnCancelEditTemplate");

 if (labelEl) labelEl.value = "";
 if (phraseEl) phraseEl.value = "";
 if (editIdxEl) editIdxEl.value = -1;
 if (headingEl) headingEl.textContent = "＋ 新しい定型文の登録";
 if (badgeEl) badgeEl.style.display = "none";
 if (saveBtn) saveBtn.textContent = "定型文を保存する";
 if (cancelBtn) cancelBtn.style.display = "none";
}

function deleteTemplate(idx) {
 const templates = gState.templates || [];
 const t = templates[idx];
 if (!t) return;
 if (!confirm(`定型文「${t.label}」を削除してもよろしいですか？`)) return;

 db.data.templates.splice(idx, 1);
 gState.templates = db.data.templates;
 db.save();
 renderQuickTemplates();
 renderFsQuickTemplates();
 renderTemplateManageList();
 cancelTemplateEdit();
}

function resetDefaultTemplates() {
 if (!confirm("定型文を標準の初期テンプレート一覧にリセットしますか？\n（追加された定型文は初期化されます）")) return;

 db.data.templates = JSON.parse(JSON.stringify(DEFAULT_CARE_TEMPLATES));
 gState.templates = db.data.templates;
 db.save();
 renderQuickTemplates();
 renderFsQuickTemplates();
 renderTemplateManageList();
 cancelTemplateEdit();
}

// ======================================================================
// 介護サマリー (生活・ADLアセスメント詳細 13項目)
// ======================================================================
function getResidentSummaryStatusText(residentId) {
 const rId = Number(residentId);
 const list = (db.data.care_summaries || []).filter(s => Number(s.resident_id) === rId);
 if (list.length === 0) {
 return "サマリー未登録 (入所時・入院後サマリーを新規作成できます)";
 }
 const latest = list[0];
 return `最新サマリー: ［${escapeHtml(latest.summary_type || "介護サマリー")}］ ${escapeHtml(latest.created_at || "")} 作成 (作成者: ${escapeHtml(latest.staff_name || "職員")})`;
}

function renderResidentSummaryAccordionContent(residentId) {
 const rId = Number(residentId);
 const list = (db.data.care_summaries || []).filter(s => Number(s.resident_id) === rId);
 if (list.length === 0) {
 return `
 <div style="background:#f6f8f6; border:1px dashed #cdd6d0; border-radius:6px; padding:14px; text-align:center; color:#5f6d66;">
 介護サマリーがまだ登録されていません。<br>
 「サマリー編集・新規」ボタンから、新規入所時または入院後再入所の生活・ADLアセスメントを作成できます。
 </div>
 `;
 }

 const s = list[0];
 return `
 <div style="margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; background:#f1f6f3; border:1px solid #c9e0d5; border-radius:6px; padding:6px 10px;">
 <div>
 <strong style="color:#1e5b47;">［${escapeHtml(s.summary_type || "介護サマリー")}］</strong>
 <span style="color:#4a5852; margin-left:6px;">作成日: ${escapeHtml(s.created_at || "")} (作成者: ${escapeHtml(s.staff_name || "職員")})</span>
 </div>
 <button type="button" class="btn btn-secondary" style="padding:2px 8px; font-size:11px;" onclick="openCareSummaryModal(${rId}, ${s.id})">詳細確認・変更</button>
 </div>
 <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:8px;">
 <div style="background:#f6f8f6; border:1px solid #dfe5e1; border-radius:6px; padding:8px 10px;">
 <strong style="color:#173f33; font-size:12px;">1. 基本情報:</strong>
 <div style="margin-top:2px; color:#36443e;">${escapeHtml(s.basic_info || "特記事項なし")}</div>
 </div>
 <div style="background:#f6f8f6; border:1px solid #dfe5e1; border-radius:6px; padding:8px 10px;">
 <strong style="color:#173f33; font-size:12px;">2. これまでの経過:</strong>
 <div style="margin-top:2px; color:#36443e;">${escapeHtml(s.background || "特記事項なし")}</div>
 </div>
 <div style="background:#f6f8f6; border:1px solid #dfe5e1; border-radius:6px; padding:8px 10px;">
 <strong style="color:#173f33; font-size:12px;">3. 現在の身体・認知状態:</strong>
 <div style="margin-top:2px; color:#36443e;">${escapeHtml(s.physical_cognitive || "特記事項なし")}</div>
 </div>
 <div style="background:#f6f8f6; border:1px solid #dfe5e1; border-radius:6px; padding:8px 10px;">
 <strong style="color:#173f33; font-size:12px;">4. ADL (日常生活動作):</strong>
 <div style="margin-top:2px; color:#36443e;">${escapeHtml(s.adl || "特記事項なし")}</div>
 </div>
 <div style="background:#f6f8f6; border:1px solid #dfe5e1; border-radius:6px; padding:8px 10px;">
 <strong style="color:#173f33; font-size:12px;">5. 食事・水分摂取:</strong>
 <div style="margin-top:2px; color:#36443e;">${escapeHtml(s.meals_hydration || "特記事項なし")}</div>
 </div>
 <div style="background:#f6f8f6; border:1px solid #dfe5e1; border-radius:6px; padding:8px 10px;">
 <strong style="color:#173f33; font-size:12px;">6. 排泄:</strong>
 <div style="margin-top:2px; color:#36443e;">${escapeHtml(s.excretion || "特記事項なし")}</div>
 </div>
 <div style="background:#f6f8f6; border:1px solid #dfe5e1; border-radius:6px; padding:8px 10px;">
 <strong style="color:#173f33; font-size:12px;">7. 睡眠:</strong>
 <div style="margin-top:2px; color:#36443e;">${escapeHtml(s.sleep || "特記事項なし")}</div>
 </div>
 <div style="background:#f6f8f6; border:1px solid #dfe5e1; border-radius:6px; padding:8px 10px;">
 <strong style="color:#173f33; font-size:12px;">8. 服薬:</strong>
 <div style="margin-top:2px; color:#36443e;">${escapeHtml(s.meds || "特記事項なし")}</div>
 </div>
 <div style="background:#f6f8f6; border:1px solid #dfe5e1; border-radius:6px; padding:8px 10px;">
 <strong style="color:#173f33; font-size:12px;">9. 医療的な処置:</strong>
 <div style="margin-top:2px; color:#36443e;">${escapeHtml(s.medical_care || "特記事項なし")}</div>
 </div>
 <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:6px; padding:8px 10px;">
 <strong style="color:#991b1b; font-size:12px;">10. 認知症の症状や行動 (BPSD):</strong>
 <div style="margin-top:2px; color:#7f1d1d;">${escapeHtml(s.dementia_behavior || "特記事項なし")}</div>
 </div>
 <div style="background:#fffbeb; border:1px solid #fef3c7; border-radius:6px; padding:8px 10px;">
 <strong style="color:#92400e; font-size:12px;">11. 介助方法・注意点:</strong>
 <div style="margin-top:2px; color:#78350f;">${escapeHtml(s.care_notes || "特記事項なし")}</div>
 </div>
 <div style="background:#f6f8f6; border:1px solid #dfe5e1; border-radius:6px; padding:8px 10px;">
 <strong style="color:#173f33; font-size:12px;">12. 家族の状況:</strong>
 <div style="margin-top:2px; color:#36443e;">${escapeHtml(s.family_info || "特記事項なし")}</div>
 </div>
 </div>
 <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:6px; padding:8px 10px; margin-top:10px;">
 <strong style="color:#166534; font-size:12px;">13. 今後の支援で気をつけること:</strong>
 <div style="margin-top:2px; color:#14532d;">${escapeHtml(s.future_goals || "特記事項なし")}</div>
 </div>
 `;
}

function openCareSummaryModal(resId, summaryId) {
 const targetId = (resId !== undefined && resId !== null && resId !== '') ? Number(resId) : Number(gState.selectedResidentId);
 const r = gState.residents ? gState.residents.find(x => Number(x.id) === targetId) : null;
 if (!r) {
 alert("利用者を選択してください。");
 return;
 }

 const badgeEl = document.getElementById("csResidentBadge");
 if (badgeEl) badgeEl.textContent = `${r.room_no}号室 ${r.name} 様 (${r.care_level})`;

 const resIdEl = document.getElementById("csResidentId");
 if (resIdEl) resIdEl.value = r.id;

 // 担当職員セレクトボックス
 const staffSelect = document.getElementById("csStaff");
 if (staffSelect) {
 staffSelect.innerHTML = (gState.stamps || []).map(s => {
 const name = s.name || s;
 return `<option value="${escapeHtml(name)}">${escapeHtml(name)} (${escapeHtml(s.role || "職員")})</option>`;
 }).join("");
 const curStaff = document.getElementById("currentStaff")?.value;
 if (curStaff) staffSelect.value = curStaff;
 }

 // 過去サマリー履歴セレクト
 const list = (db.data.care_summaries || []).filter(s => Number(s.resident_id) === r.id);
 const historySelect = document.getElementById("careSummaryHistorySelect");
 if (historySelect) {
 historySelect.innerHTML = "";
 if (list.length > 0) {
 list.forEach((s, idx) => {
 const opt = document.createElement("option");
 opt.value = String(s.id);
 opt.textContent = `${idx === 0 ? "［最新］" : ""} ${s.created_at} - ${s.summary_type} (${s.staff_name})`;
 historySelect.appendChild(opt);
 });
 const newOpt = document.createElement("option");
 newOpt.value = "new";
 newOpt.textContent = "＋ 新規サマリー作成 (新規入所・入院後再入所等)";
 historySelect.appendChild(newOpt);
 } else {
 const opt = document.createElement("option");
 opt.value = "new";
 opt.textContent = "新規サマリー作成 (未登録)";
 historySelect.appendChild(opt);
 }
 }

 if (summaryId) {
 switchCareSummaryRecord(String(summaryId));
 } else if (list.length > 0) {
 switchCareSummaryRecord(String(list[0].id));
 } else {
 startNewCareSummary("新規入所時サマリー");
 }

 const modal = document.getElementById("careSummaryModal");
 if (modal) modal.style.display = "flex";
}

function switchCareSummaryRecord(summaryVal) {
 const historySelect = document.getElementById("careSummaryHistorySelect");
 if (historySelect) historySelect.value = summaryVal;

 if (summaryVal === "new") {
 startNewCareSummary("新規入所時サマリー");
 return;
 }

 const sid = Number(summaryVal);
 const s = (db.data.care_summaries || []).find(x => x.id === sid);
 if (!s) return;

 const idEl = document.getElementById("csSummaryId");
 const typeEl = document.getElementById("csSummaryType");
 const dateEl = document.getElementById("csDate");
 const staffEl = document.getElementById("csStaff");

 if (idEl) idEl.value = s.id;
 if (typeEl) typeEl.value = s.summary_type || "新規入所時サマリー";
 if (dateEl) dateEl.value = s.created_at || toLocalDateStr(new Date());
 if (staffEl && s.staff_name) staffEl.value = s.staff_name;

 const fields = [
 "csBasicInfo", "csBackground", "csPhysicalCognitive", "csAdl",
 "csMealsHydration", "csExcretion", "csSleep", "csMeds",
 "csMedicalCare", "csDementiaBehavior", "csCareNotes", "csFamilyInfo", "csFutureGoals"
 ];
 const keys = [
 "basic_info", "background", "physical_cognitive", "adl",
 "meals_hydration", "excretion", "sleep", "meds",
 "medical_care", "dementia_behavior", "care_notes", "family_info", "future_goals"
 ];

 fields.forEach((fId, i) => {
 const el = document.getElementById(fId);
 if (el) el.value = s[keys[i]] || "";
 });
}

function startNewCareSummary(summaryType = "新規入所時サマリー") {
 const rId = Number(document.getElementById("csResidentId")?.value) || gState.selectedResidentId;
 const r = gState.residents ? gState.residents.find(x => Number(x.id) === rId) : null;
 const historySelect = document.getElementById("careSummaryHistorySelect");
 if (historySelect) historySelect.value = "new";

 const idEl = document.getElementById("csSummaryId");
 const typeEl = document.getElementById("csSummaryType");
 const dateEl = document.getElementById("csDate");

 if (idEl) idEl.value = "";
 if (typeEl) typeEl.value = summaryType;
 if (dateEl) dateEl.value = toLocalDateStr(new Date());

 const list = (db.data.care_summaries || []).filter(s => Number(s.resident_id) === rId);
 const prev = list.length > 0 ? list[0] : null;

 const basicText = prev ? prev.basic_info : `${r ? r.name : ""} 様。${r ? r.care_level : ""}。生年月日: ${r ? (r.birth_date || "未登録") : ""}。緊急連絡先: ${r ? (r.emergency_contact || "未登録") : ""}。看取り方針: ［${r ? (r.policy_stamp || "未設定") : ""}］。`;
 // [Claude修正] 前回のサマリーがないときは、登録済みの情報だけを入れ、それ以外は空欄にする（誰も書いていない例文を入れない）
 const backgroundText = prev ? prev.background : "";
 const physicalText = prev ? prev.physical_cognitive : `麻痺: ${r ? (r.paralysis || "未登録") : "未登録"}。病歴: ${r ? (r.diseases || "未登録") : "未登録"}。`;
 const adlText = prev ? prev.adl : "";
 const mealsText = prev ? prev.meals_hydration : `食形態: ${r ? (r.diet_type || "未登録") : "未登録"}。口腔: ${r ? (r.oral_state || "未登録") : "未登録"}。アレルギー: ${r ? (r.allergies || "未登録") : "未登録"}。`;
 const excretionText = prev ? prev.excretion : "";
 const sleepText = prev ? prev.sleep : "";
 const medsText = prev ? prev.meds : "";
 const medicalText = prev ? prev.medical_care : (r && r.dr_instructions ? r.dr_instructions : "");
 const dementiaText = prev ? prev.dementia_behavior : "";
 const notesText = prev ? prev.care_notes : (r && r.life_history ? "人生歴: " + r.life_history : "");
 const familyText = prev ? prev.family_info : (r && r.family_wishes ? "家族の意向: " + r.family_wishes : "");
 const goalsText = prev ? prev.future_goals : (r && r.care_plan_goal ? r.care_plan_goal : "");

 const fields = [
 { id: "csBasicInfo", val: basicText },
 { id: "csBackground", val: backgroundText },
 { id: "csPhysicalCognitive", val: physicalText },
 { id: "csAdl", val: adlText },
 { id: "csMealsHydration", val: mealsText },
 { id: "csExcretion", val: excretionText },
 { id: "csSleep", val: sleepText },
 { id: "csMeds", val: medsText },
 { id: "csMedicalCare", val: medicalText },
 { id: "csDementiaBehavior", val: dementiaText },
 { id: "csCareNotes", val: notesText },
 { id: "csFamilyInfo", val: familyText },
 { id: "csFutureGoals", val: goalsText }
 ];

 fields.forEach(f => {
 const el = document.getElementById(f.id);
 if (el) el.value = f.val;
 });
}

function submitCareSummary() {
 const rId = Number(document.getElementById("csResidentId")?.value) || gState.selectedResidentId;
 const sid = document.getElementById("csSummaryId")?.value;
 const summaryType = document.getElementById("csSummaryType")?.value || "新規入所時サマリー";
 const dateVal = document.getElementById("csDate")?.value || toLocalDateStr(new Date());
 const staffVal = document.getElementById("csStaff")?.value || "職員";

 const basicInfo = document.getElementById("csBasicInfo")?.value || "";
 const background = document.getElementById("csBackground")?.value || "";
 const physicalCognitive = document.getElementById("csPhysicalCognitive")?.value || "";
 const adl = document.getElementById("csAdl")?.value || "";
 const mealsHydration = document.getElementById("csMealsHydration")?.value || "";
 const excretion = document.getElementById("csExcretion")?.value || "";
 const sleep = document.getElementById("csSleep")?.value || "";
 const meds = document.getElementById("csMeds")?.value || "";
 const medicalCare = document.getElementById("csMedicalCare")?.value || "";
 const dementiaBehavior = document.getElementById("csDementiaBehavior")?.value || "";
 const careNotes = document.getElementById("csCareNotes")?.value || "";
 const familyInfo = document.getElementById("csFamilyInfo")?.value || "";
 const futureGoals = document.getElementById("csFutureGoals")?.value || "";

 if (!Array.isArray(db.data.care_summaries)) db.data.care_summaries = [];

 // [Claude修正] 既存サマリーの「変更」は上書きせず、新しい版として保存する。
 // 旧実装は上書きのため更新前の内容が消え、「新規時と更新時の比較」ができなかった。
 const existingForVersion = (sid && sid.trim() !== "") ? db.data.care_summaries.find(x => Number(x.id) === Number(sid)) : null;
 if (existingForVersion) {
 const fieldsNow = { summary_type: summaryType, basic_info: basicInfo, background: background, physical_cognitive: physicalCognitive, adl: adl, meals_hydration: mealsHydration, excretion: excretion, sleep: sleep, meds: meds, medical_care: medicalCare, dementia_behavior: dementiaBehavior, care_notes: careNotes, family_info: familyInfo, future_goals: futureGoals };
 const changed = Object.keys(fieldsNow).some(k => (existingForVersion[k] || "") !== (fieldsNow[k] || ""));
 if (!changed) {
 alert("変更された項目がないため、保存は行いませんでした。");
 return;
 }
 // 日付欄が元の版のままなら、更新した日 (今日) を新しい版の日付にする (同じ日付の版が並ぶと見分けられないため)
 const versionDate = (dateVal === (existingForVersion.created_at || existingForVersion.date || "")) ? toLocalDateStr(new Date()) : dateVal;
 db.data.care_summaries.unshift(Object.assign({
 id: Date.now(),
 resident_id: rId,
 created_at: versionDate,
 updated_at: versionDate,
 staff_name: staffVal,
 previous_id: existingForVersion.id
 }, fieldsNow));
 } else {
 const newSummary = {
 id: Date.now(),
 resident_id: rId,
 created_at: dateVal,
 updated_at: dateVal,
 staff_name: staffVal,
 summary_type: summaryType,
 basic_info: basicInfo,
 background: background,
 physical_cognitive: physicalCognitive,
 adl: adl,
 meals_hydration: mealsHydration,
 excretion: excretion,
 sleep: sleep,
 meds: meds,
 medical_care: medicalCare,
 dementia_behavior: dementiaBehavior,
 care_notes: careNotes,
 family_info: familyInfo,
 future_goals: futureGoals
 };
 db.data.care_summaries.unshift(newSummary);
 }

 gState.care_summaries = db.data.care_summaries;
 db.save();
 renderResidentDetail();
 alert("介護サマリーを保存しました。");
 closeModal("careSummaryModal");
}

// ======================================================================
// [Claude修正] 印刷共通処理 runPrintJob
// 旧実装の問題:
//  - 画面全体を visibility:hidden で隠すだけだったため、見えない画面の分だけ白紙ページが出ていた
//  - 全帳票が A4横 固定 (@page) で、縦向き帳票が2枚目にはみ出していた
//  - 勤務表・請求明細の印刷ボタンは帳票を作らず window.print() を呼ぶだけだったため、
//    直前に別タブで印刷した書類 (#printArea の残り) がそのまま出ていた
// 新実装: 帳票HTMLを #printArea に入れ、用紙サイズを帳票ごとに指定し、
//          1枚に収める帳票は用紙に合わせて縮小してから印刷する。印刷後は #printArea を空に戻す。
// ======================================================================
const PRINT_PAGE_SIZES_MM = {
 "A4 portrait": [210, 297],
 "A4 landscape": [297, 210]
};
const PRINT_MARGIN_MM = 10;

function runPrintJob(html, options) {
 const opts = Object.assign({ page: "A4 portrait", fitOnePage: true, minScale: 0.5 }, options || {});
 const printArea = document.getElementById("printArea");
 if (!printArea) {
 alert("印刷コンテナが見つかりません。");
 return;
 }
 // 帳票は body 直下に置く (印刷CSSが body 直下の帳票以外を非表示にするため)
 if (printArea.parentElement !== document.body) {
 document.body.appendChild(printArea);
 }

 // 用紙サイズを帳票ごとに設定
 let pageStyle = document.getElementById("printPageSizeStyle");
 if (!pageStyle) {
 pageStyle = document.createElement("style");
 pageStyle.id = "printPageSizeStyle";
 document.head.appendChild(pageStyle);
 }
 pageStyle.textContent = `@page { size: ${opts.page}; margin: ${PRINT_MARGIN_MM}mm; }`;

 printArea.innerHTML = html;
 printArea.style.zoom = "";

 // 1枚に収める帳票は、印刷可能範囲に対する実寸を測って縮小率を決める
 if (opts.fitOnePage) {
 const mm = PRINT_PAGE_SIZES_MM[opts.page] || PRINT_PAGE_SIZES_MM["A4 portrait"];
 const pxPerMm = 96 / 25.4;
 const availW = (mm[0] - PRINT_MARGIN_MM * 2) * pxPerMm;
 const availH = (mm[1] - PRINT_MARGIN_MM * 2) * pxPerMm;
 const prev = printArea.getAttribute("style") || "";
 printArea.setAttribute("style", `display:block; position:absolute; left:-30000px; top:0; width:${availW}px; visibility:hidden;`);
 const contentW = Math.max(printArea.scrollWidth, availW);
 const contentH = printArea.scrollHeight;
 printArea.setAttribute("style", prev);
 const scale = Math.min(1, availW / contentW, availH / contentH) * 0.98;
 if (scale < 0.98 && scale >= opts.minScale) {
 printArea.style.zoom = String(scale);
 }
 }

 const cleanup = () => {
 printArea.innerHTML = "";
 printArea.style.zoom = "";
 window.removeEventListener("afterprint", cleanup);
 };
 window.addEventListener("afterprint", cleanup);
 window.print();
}

// =====================================================================
// [Claude修正] 監査用: 記録の取消・訂正・確認の履歴を一覧にする
// 記録は削除せず voided / edit_history / void_history / confirm_log などで残しているため、それを集めて表示する
// =====================================================================
const CP_AUDIT_SOURCES = [
 { key: "care_records", label: "介護記録", summary: r => `[${r.category || ""}] ${r.recorded_at || ""} ${r.content || ""}` },
 { key: "meds", label: "服薬・点眼", summary: r => `${r.date || ""} ${r.timing_key || r.slot || ""} ${r.status || ""}${r.given_time ? ` 飲んだ${r.given_time}` : ""}${r.recorded_at ? ` 記録${r.recorded_at}` : ""}` },
 { key: "prescriptions", label: "処方箋の画像", summary: r => `${r.issued_date || ""} の処方箋 (登録 ${r.uploaded_by || ""})` },
 { key: "resident_medications", label: "処方薬の一覧", summary: r => `${r.name || ""} ${(r.timings || []).map(t => t.key + t.count).join("・")}${r.status === "中止" ? " 中止" : ""}` },
 { key: "vitals", label: "バイタル", summary: r => `${r.date || ""} 体温${r.temperature ?? "-"} 血圧${r.bp_high ?? "-"}/${r.bp_low ?? "-"} 脈${r.pulse ?? "-"} SpO2 ${r.spo2 ?? "-"}` },
 { key: "weight_records", label: "体重", summary: r => `${r.date || r.month || ""} ${r.weight ?? "-"}kg` },
 { key: "topical_records", label: "塗布薬・湿布", summary: r => `${r.date || ""} ${r.timing || ""} ${r.item_name || ""} (${r.site_name || ""})` },
 { key: "baths", label: "入浴", summary: r => `${r.date || ""} ${r.bath_type || ""} ${r.ointment_notes || ""}` },
 { key: "groomings", label: "整容", summary: r => `${r.date || ""} 爪${r.nail_done ? "○" : "-"} 髭${r.shave_done ? "○" : "-"} 耳${r.ear_done ? "○" : "-"} ${r.notes || ""}` },
 { key: "turns", label: "夜間巡視・体位変換", summary: r => `${r.date || ""} ${r.time || ""} ${r.action || ""}` },
 { key: "linens", label: "シーツ交換", summary: r => `${r.date || ""} ${r.exchange_type || ""} ${r.notes || ""}` },
 { key: "notebooks", label: "申し送り", summary: r => `${r.date || ""} ${r.content || r.title || ""}` },
 { key: "daily_schedules", label: "日課・業務スケジュール", summary: r => `${r.date || ""} ${r.time || ""} ${r.title || ""} ${r.content || ""}` }, // [Antigravity実装 2026-10-16]
 { key: "monthly_notices", label: "業務連絡（月間）", summary: r => `${r.month || ""} ${r.title || ""} ${r.content || ""}` },
 { key: "notebook_stamps", label: "業務日誌の確認印", summary: r => `${r.date || ""} ${r.staff_name || ""}` },
 { key: "committees", label: "委員会・研修", summary: r => `${r.date || ""} ${r.committee_name || r.name || ""}` },
 { key: "incidents", label: "事故・ヒヤリハット", summary: r => `${r.occurred_at || ""} ${r.report_type || ""} ${r.situation || ""}` },
 { key: "vaccines", label: "予防接種", summary: r => `${r.date || ""} ${r.vaccine_name || ""}` },
 { key: "fire_drills", label: "消防・避難訓練", summary: r => `${r.date || ""} ${r.drill_type || ""}` },
 { key: "recreations", label: "レクリエーション", summary: r => `${r.date || ""} ${r.title || r.program_type || ""}` },
 { key: "belongings", label: "預かり品", summary: r => `${r.item_name || ""} (${r.quantity || ""})` },
 { key: "equipments", label: "福祉用具", summary: r => `${r.equipment_name || ""} (${r.ownership_type || ""})` },
 { key: "photos", label: "写真・書類", summary: r => `${r.title || r.file_name || r.name || ""}` },
 { key: "eyedrop_orders", label: "点眼指示", summary: r => `${r.medicine_name || ""} ${r.eye || ""}` },
 { key: "body_schema_pins", label: "身体図（処置）", summary: r => `${r.site_name || ""} ${r.item_name || ""}` },
 { key: "contract_docs", label: "契約・同意書類", summary: r => `${r.type_name || ""} 交わした日 ${r.signed_date || "-"}${r.renewal_due ? " 次の更新 " + r.renewal_due : ""}` },
 { key: "consumptions", label: "消耗品の請求", summary: r => `${r.consumed_at || ""} ${r.item_name || ""} ×${r.quantity ?? ""}` },
 { key: "residents", label: "利用者情報", summary: r => `${r.room_no || ""}号室 ${r.name || ""}` }
];

function cpAuditBeforeText(before) {
 if (!before || typeof before !== "object") return "";
 return Object.keys(before).map(k => {
 const v = before[k];
 const s = (v !== null && typeof v === "object") ? JSON.stringify(v) : String(v ?? "");
 return `${k}: ${s.length > 80 ? s.slice(0, 80) + "…" : s}`;
 }).join(" / ");
}

function cpCollectAuditEntries() {
 const out = [];
 const resName = id => {
 const r = (gState.residents || []).find(x => Number(x.id) === Number(id));
 return r ? `${r.room_no}号室 ${r.name}` : "";
 };
 CP_AUDIT_SOURCES.forEach(src => {
 (db.data[src.key] || []).forEach(rec => {
 if (!rec || typeof rec !== "object") return;
 let sum = "";
 try { sum = src.summary(rec); } catch (e) { sum = ""; }
 const rn = src.key === "residents" ? resName(rec.id) : resName(rec.resident_id);
 const base = { kind: src.label, resident: rn, residentId: src.key === "residents" ? rec.id : rec.resident_id, summary: sum };
 (rec.void_history || []).forEach(h => {
 out.push(Object.assign({}, base, { at: h.voided_at, type: "取消", by: h.voided_by, detail: `理由: ${h.void_reason || "-"}` }));
 out.push(Object.assign({}, base, { at: h.restored_at, type: "取消を戻す", by: h.restored_by, detail: "" }));
 });
 if (rec.voided) out.push(Object.assign({}, base, { at: rec.voided_at, type: "取消", by: rec.voided_by, detail: `理由: ${rec.void_reason || "-"}` }));
 else if (rec.restored_at && !(rec.void_history || []).length) out.push(Object.assign({}, base, { at: rec.restored_at, type: "取消を戻す", by: rec.restored_by, detail: rec.void_reason ? `前回の取消理由: ${rec.void_reason}` : "" }));
 (rec.edit_history || []).forEach(h => {
 out.push(Object.assign({}, base, { at: h.edited_at, type: "訂正・変更", by: h.edited_by, detail: `${h.reason ? "理由: " + h.reason + " / " : ""}訂正前: ${cpAuditBeforeText(h.before)}` }));
 });
 (rec.confirm_log || []).forEach(h => {
 out.push(Object.assign({}, base, { at: h.at, type: h.action === "確認" ? "確認" : "確認を取消", by: h.staff, detail: "" }));
 });
 if (src.key === "eyedrop_orders" && rec.ended_at) out.push(Object.assign({}, base, { at: rec.ended_at, type: "終了", by: rec.ended_by, detail: "点眼指示を終了" }));
 if (src.key === "recreations" && rec.updated_at && !(rec.edit_history || []).length) out.push(Object.assign({}, base, { at: rec.updated_at, type: "訂正・変更", by: rec.updated_by, detail: "（訂正前の内容は記録されていない古い訂正）" }));
 });
 });
 (db.data.alert_logs || []).forEach(l => {
 out.push({ kind: "アラート対応", resident: "", residentId: null, summary: l.alert_title || "", at: l.dismissed_at, type: "アラートを閉じた", by: l.staff_name, detail: l.alert_detail || "" });
 if (l.restored_at) out.push({ kind: "アラート対応", resident: "", residentId: null, summary: l.alert_title || "", at: l.restored_at, type: "未対応に戻した", by: l.restored_by, detail: "" });
 });
 (db.data.settings_logs || []).forEach(l => {
 out.push({ kind: l.kind || "設定", resident: "", residentId: null, summary: l.detail || "", at: l.at, type: l.action || "変更", by: l.by, detail: "" });
 });
 (db.data.unit_logs || []).forEach(l => {
 out.push({ kind: "区分の設定", resident: "", residentId: null, summary: l.detail || "", at: l.at, type: l.action || "", by: l.by, detail: "" });
 });
 (db.data.staff_archive || []).forEach(a => {
 out.push({ kind: "職員名簿", resident: "", residentId: null, summary: `${a.staff && a.staff.name ? a.staff.name : ""} (${a.staff && a.staff.role ? a.staff.role : ""})`, at: a.removed_at, type: "職員を名簿から外した", by: a.removed_by, detail: "" });
 });
 return out.filter(e => e.at).sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

function cpFilteredAuditEntries() {
 const t = document.getElementById("auditFilterType")?.value || "";
 const k = document.getElementById("auditFilterKind")?.value || "";
 const rid = document.getElementById("auditFilterResident")?.value || "";
 const from = document.getElementById("auditFilterFrom")?.value || "";
 const to = document.getElementById("auditFilterTo")?.value || "";
 const w = (document.getElementById("auditFilterWord")?.value || "").trim();
 return cpCollectAuditEntries().filter(e => {
 if (t === "確認" && !(e.type === "確認" || e.type === "確認を取消")) return false;
 if (t === "その他" && ["取消", "取消を戻す", "訂正・変更", "確認", "確認を取消"].includes(e.type)) return false;
 if (t && t !== "確認" && t !== "その他" && e.type !== t) return false;
 if (k && e.kind !== k) return false;
 if (rid && String(e.residentId) !== rid) return false;
 const d = String(e.at).slice(0, 10);
 if (from && d < from) return false;
 if (to && d > to) return false;
 if (w && !`${e.by || ""} ${e.detail || ""} ${e.summary || ""} ${e.resident || ""}`.includes(w)) return false;
 return true;
 });
}

function openAuditLogModal() {
 const kSel = document.getElementById("auditFilterKind");
 if (kSel && kSel.options.length <= 1) {
 CP_AUDIT_SOURCES.map(s => s.label).concat(["アラート対応", "職員名簿", "区分の設定", "勤務の最低人数", "利用者の移動・退所", "契約・同意書類の種類", "請求の設定"]).forEach(l => {
 const o = document.createElement("option"); o.value = l; o.textContent = l; kSel.appendChild(o);
 });
 }
 const rSel = document.getElementById("auditFilterResident");
 if (rSel) {
 const cur = rSel.value;
 rSel.innerHTML = '<option value="">すべて</option>';
 (gState.residents || []).forEach(r => {
 const o = document.createElement("option"); o.value = String(r.id); o.textContent = `${r.room_no}号室 ${r.name}`; rSel.appendChild(o);
 });
 rSel.value = cur;
 }
 renderAuditLog();
 openModal("auditLogModal");
}

function renderAuditLog() {
 const tbody = document.getElementById("auditLogTableBody");
 if (!tbody) return;
 const list = cpFilteredAuditEntries();
 const cnt = document.getElementById("auditLogCount");
 if (cnt) cnt.textContent = `${list.length} 件`;
 if (list.length === 0) {
 tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#5f6d66; padding:16px;">該当する履歴はありません。</td></tr>`;
 return;
 }
 const color = t => t === "取消" ? "#991b1b" : (t === "訂正・変更" ? "#92400e" : (t === "取消を戻す" ? "#1a4f3d" : "#36443e"));
 // [Claude修正] スマホなど幅が狭い画面では、表ではなくカードで表示する（表だと横にはみ出し、行が縦に長くなるため）
 const narrow = window.innerWidth < 700;
 const thead = tbody.parentElement ? tbody.parentElement.querySelector("thead") : null;
 if (thead) thead.style.display = narrow ? "none" : "";
 if (narrow) {
 tbody.innerHTML = list.slice(0, 1000).map(e => `
 <tr><td colspan="7" style="padding:8px 10px; border-bottom:1px solid #dfe5e1;">
 <div style="display:flex; justify-content:space-between; gap:6px; flex-wrap:wrap;"><strong style="color:${color(e.type)};">${escapeHtml(e.type)}</strong><span style="color:#5f6d66;">${escapeHtml(e.at || "")}</span></div>
 <div style="margin-top:2px;">${escapeHtml(e.kind)}${e.resident ? " / " + escapeHtml(e.resident) : ""} / 職員: ${escapeHtml(e.by || "-")}</div>
 <div style="margin-top:2px; color:#36443e; white-space:pre-wrap;">${escapeHtml((e.summary || "").slice(0, 120))}</div>
 ${e.detail ? `<div style="margin-top:2px; color:#4a5852; white-space:pre-wrap;">${escapeHtml((e.detail || "").slice(0, 300))}</div>` : ""}
 </td></tr>`).join("") + (list.length > 1000 ? `<tr><td colspan="7" style="text-align:center; color:#5f6d66;">先頭1000件を表示しています。条件で絞り込んでください。</td></tr>` : "");
 return;
 }
 tbody.innerHTML = list.slice(0, 1000).map(e => `
 <tr>
 <td>${escapeHtml(e.at || "")}</td>
 <td style="font-weight:bold; color:${color(e.type)};">${escapeHtml(e.type)}</td>
 <td>${escapeHtml(e.kind)}</td>
 <td>${escapeHtml(e.resident || "-")}</td>
 <td>${escapeHtml(e.by || "-")}</td>
 <td style="white-space:pre-wrap; max-width:280px;">${escapeHtml((e.summary || "").slice(0, 160))}</td>
 <td style="white-space:pre-wrap; max-width:320px;">${escapeHtml((e.detail || "").slice(0, 400))}</td>
 </tr>`).join("") + (list.length > 1000 ? `<tr><td colspan="7" style="text-align:center; color:#5f6d66;">先頭1000件を表示しています。条件で絞り込んでください。</td></tr>` : "");
}

function printAuditLog() {
 const list = cpFilteredAuditEntries();
 const nowStr = toLocalDateTimeStr(new Date());
 const rows = list.map(e => `<tr><td>${escapeHtml(e.at || "")}</td><td>${escapeHtml(e.type)}</td><td>${escapeHtml(e.kind)}</td><td>${escapeHtml(e.resident || "-")}</td><td>${escapeHtml(e.by || "-")}</td><td style="white-space:pre-wrap;">${escapeHtml(e.summary || "")}</td><td style="white-space:pre-wrap;">${escapeHtml(e.detail || "")}</td></tr>`).join("");
 const html = `
 <div style="font-family:'Hiragino Kaku Gothic ProN','Meiryo',sans-serif; color:#000; font-size:11px;">
 <h1 style="font-size:18px; margin:0 0 4px 0;">記録の取消・訂正・確認の履歴</h1>
 <div style="font-size:11px; margin-bottom:8px;">施設名: ${escapeHtml(getFacilityName())} / 印刷日時: ${escapeHtml(nowStr)} / 出力担当者: ${escapeHtml(cpLedgerStaff())} / ${list.length} 件</div>
 <table style="width:100%; border-collapse:collapse;" border="1" cellpadding="3">
 <thead><tr style="background:#eee;"><th>操作日時</th><th>操作</th><th>記録の種類</th><th>利用者</th><th>操作した職員</th><th>記録の内容</th><th>理由・訂正前の内容</th></tr></thead>
 <tbody>${rows || '<tr><td colspan="7">該当なし</td></tr>'}</tbody>
 </table>
 </div>`;
 runPrintJob(html, { page: "A4 landscape", fitOnePage: false });
}

// =====================================================================
// [Claude修正] 利用者別・期間を指定して記録を印刷（監査で「この方のこの期間の記録」を求められた時用）
// =====================================================================
function openPeriodPrintModal() {
 const sel = document.getElementById("ppResident");
 if (sel) {
 sel.innerHTML = "";
 (gState.residents || []).forEach(r => {
 const o = document.createElement("option"); o.value = String(r.id); o.textContent = `${r.room_no}号室 ${r.name}`; sel.appendChild(o);
 });
 if (gState.selectedResidentId) sel.value = String(gState.selectedResidentId);
 }
 const today = toLocalDateStr(new Date());
 const f = document.getElementById("ppFrom"), t = document.getElementById("ppTo");
 if (f && !f.value) f.value = today.slice(0, 8) + "01";
 if (t && !t.value) t.value = today;
 openModal("periodPrintModal");
}

function printPeriodRecords() {
 const rid = Number(document.getElementById("ppResident")?.value);
 const from = document.getElementById("ppFrom")?.value || "";
 const to = document.getElementById("ppTo")?.value || "";
 const incVoid = !!document.getElementById("ppIncludeVoided")?.checked;
 const r = (gState.residents || []).find(x => Number(x.id) === rid);
 if (!r) { alert("利用者を選んでください。"); return; }
 if (!from || !to || from > to) { alert("開始日と終了日を正しく入れてください。"); return; }
 const inRange = d => { const s = String(d || "").slice(0, 10); return s >= from && s <= to; };
 const vmark = x => x.voided ? `<div style="color:#991b1b; font-weight:bold;">【取消済 ${escapeHtml(x.voided_at || "")} ${escapeHtml(x.voided_by || "")} 理由: ${escapeHtml(x.void_reason || "-")}】</div>` : "";
 const keep = x => incVoid || !x.voided;
 const th = 'style="background:#eee; border:1px solid #999; padding:3px;"';
 const td = 'style="border:1px solid #999; padding:3px; vertical-align:top;"';
 let body = "";

 if (document.getElementById("ppCare")?.checked) {
 const recs = (db.data.care_records || []).filter(c => Number(c.resident_id) === rid && inRange(c.recorded_at || c.record_time) && keep(c))
 .sort((a, b) => String(a.recorded_at || "").localeCompare(String(b.recorded_at || "")));
 body += `<h2 style="font-size:14px; margin:12px 0 4px 0;">介護記録（経過記録） ${recs.length}件</h2>
 <table style="width:100%; border-collapse:collapse; font-size:11px;"><tr><th ${th}>日時</th><th ${th}>区分</th><th ${th}>内容</th><th ${th}>記録者</th></tr>
 ${recs.map(c => `<tr style="${c.voided ? 'color:#777;' : ''}"><td ${td}>${escapeHtml(c.recorded_at || "")}</td><td ${td}>${escapeHtml(c.category || "")}</td><td ${td}><div style="white-space:pre-wrap;">${cpCareRecordPrintNote(c)}${escapeHtml(c.content || "")}</div></td><td ${td}>${escapeHtml(c.staff_name || "")}</td></tr>`).join("") || `<tr><td ${td} colspan="4">記録なし</td></tr>`}</table>`;
 }
 if (document.getElementById("ppVitals")?.checked) {
 const vs = (db.data.vitals || []).filter(v => Number(v.resident_id) === rid && inRange(v.date)).sort((a, b) => `${a.date} ${a.time || ""}`.localeCompare(`${b.date} ${b.time || ""}`));
 body += `<h2 style="font-size:14px; margin:12px 0 4px 0;">バイタル ${vs.length}件</h2>
 <table style="width:100%; border-collapse:collapse; font-size:11px;"><tr><th ${th}>日付</th><th ${th}>時刻</th><th ${th}>体温</th><th ${th}>血圧</th><th ${th}>脈拍</th><th ${th}>SpO2</th><th ${th}>いつもと違う</th><th ${th}>記録者</th><th ${th}>訂正</th></tr>
 ${vs.map(v => `<tr><td ${td}>${escapeHtml(v.date || "")}</td><td ${td}>${escapeHtml(v.time || "")}</td><td ${td}>${v.temperature ?? "-"}</td><td ${td}>${v.bp_high ?? "-"}/${v.bp_low ?? "-"}</td><td ${td}>${v.pulse ?? "-"}</td><td ${td}>${v.spo2 ?? "-"}</td><td ${td}>${v.is_unusual ? "○" : ""}</td><td ${td}>${escapeHtml(v.staff_name || "")}</td><td ${td}>${(v.edit_history || []).length ? `${v.edit_history.length}回（最終 ${escapeHtml(v.edit_history[v.edit_history.length - 1].edited_at)} ${escapeHtml(v.edit_history[v.edit_history.length - 1].edited_by)}）` : ""}</td></tr>`).join("") || `<tr><td ${td} colspan="9">記録なし</td></tr>`}</table>`;
 }
 if (document.getElementById("ppMeds")?.checked) {
 const ms = (db.data.meds || []).filter(m => Number(m.resident_id) === rid && inRange(m.date) && keep(m)).sort((a, b) => `${a.date} ${a.slot}`.localeCompare(`${b.date} ${b.slot}`));
 body += `<h2 style="font-size:14px; margin:12px 0 4px 0;">服薬・点眼 ${ms.length}件</h2>
 <table style="width:100%; border-collapse:collapse; font-size:11px;"><tr><th ${th}>日付</th><th ${th}>時間帯</th><th ${th}>状態</th><th ${th}>飲んだ時刻</th><th ${th}>記録した時刻</th><th ${th}>記録者</th></tr>
 ${ms.map(m => `<tr style="${m.voided ? 'color:#777;' : ''}"><td ${td}>${escapeHtml(m.date || "")}</td><td ${td}>${escapeHtml(m.timing_key || m.slot || "")}</td><td ${td}>${vmark(m)}${escapeHtml(m.status || "")}${m.bag ? `（袋の中 ${escapeHtml(m.bag)}）` : ""}</td><td ${td}>${escapeHtml(m.given_time || "")}${m.given_on_time ? "（時間どおり）" : ""}</td><td ${td}>${escapeHtml(m.recorded_at || "")}</td><td ${td}>${escapeHtml(m.staff_name || "")}</td></tr>`).join("") || `<tr><td ${td} colspan="6">記録なし</td></tr>`}</table>`;
 }
 if (document.getElementById("ppTopical")?.checked) {
 const tps = (db.data.topical_records || []).filter(t => Number(t.resident_id) === rid && inRange(t.date) && keep(t)).sort((a, b) => String(a.done_at || "").localeCompare(String(b.done_at || "")));
 body += `<h2 style="font-size:14px; margin:12px 0 4px 0;">塗布薬・湿布 ${tps.length}件</h2>
 <table style="width:100%; border-collapse:collapse; font-size:11px;"><tr><th ${th}>日付</th><th ${th}>時間帯</th><th ${th}>薬</th><th ${th}>部位</th><th ${th}>記録時刻</th><th ${th}>記録者</th></tr>
 ${tps.map(t => `<tr style="${t.voided ? 'color:#777;' : ''}"><td ${td}>${escapeHtml(t.date || "")}</td><td ${td}>${escapeHtml(t.timing || "")}</td><td ${td}>${vmark(t)}${escapeHtml(t.item_name || "")}</td><td ${td}>${escapeHtml(t.site_name || "")}</td><td ${td}>${escapeHtml(String(t.done_at || "").slice(11, 16))}</td><td ${td}>${escapeHtml(t.staff_name || "")}</td></tr>`).join("") || `<tr><td ${td} colspan="6">記録なし</td></tr>`}</table>`;
 }
 if (document.getElementById("ppTurns")?.checked) {
 const ts = (db.data.turns || []).filter(t => Number(t.resident_id) === rid && inRange(t.date) && keep(t)).sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
 body += `<h2 style="font-size:14px; margin:12px 0 4px 0;">夜間巡視・体位変換 ${ts.length}件</h2>
 <table style="width:100%; border-collapse:collapse; font-size:11px;"><tr><th ${th}>日付</th><th ${th}>時刻</th><th ${th}>内容</th><th ${th}>記録者</th></tr>
 ${ts.map(t => `<tr style="${t.voided ? 'color:#777;' : ''}"><td ${td}>${escapeHtml(t.date || "")}</td><td ${td}>${escapeHtml(t.time || "")}</td><td ${td}>${vmark(t)}${escapeHtml(t.action || "")}</td><td ${td}>${escapeHtml(t.staff_name || "")}</td></tr>`).join("") || `<tr><td ${td} colspan="4">記録なし</td></tr>`}</table>`;
 }
 const html = `
 <div style="font-family:'Hiragino Kaku Gothic ProN','Meiryo',sans-serif; color:#000;">
 <div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid #173f33; padding-bottom:6px;">
 <div><h1 style="font-size:18px; margin:0;">個別記録（期間指定）</h1>
 <div style="font-size:12px;">対象利用者: <strong>${escapeHtml(r.room_no + "号室 " + r.name)} 様</strong> (${escapeHtml(r.care_level || "")}) / 期間: ${escapeHtml(from)} 〜 ${escapeHtml(to)}${incVoid ? " / 取消済みを含む" : ""}</div></div>
 <div style="font-size:11px; text-align:right;">施設名: ${escapeHtml(getFacilityName())}<br>印刷日時: ${escapeHtml(toLocalDateTimeStr(new Date()))}<br>出力担当者: ${escapeHtml(cpLedgerStaff())}</div>
 </div>
 ${body || "<p>印刷する記録が選ばれていません。</p>"}
 <div style="margin-top:16px; font-size:11px; display:flex; justify-content:space-between;"><span>ケアポータル 統合管理システム（期間指定印刷）</span><span>確認印: __________________</span></div>
 </div>`;
 closeModal("periodPrintModal");
 runPrintJob(html, { page: "A4 portrait", fitOnePage: false });
}

// 勤務表 (A4横・1枚) の印刷
function printShiftTable() {
 const table = document.getElementById("shiftMatrixTable");
 if (!table) {
 alert("勤務表が見つかりません。");
 return;
 }
 const ym = (typeof getShiftYearMonth === "function") ? getShiftYearMonth() : "";
 const [y, m] = ym.split("-");
 const facility = getFacilityName();
 const clone = table.cloneNode(true);
 clone.removeAttribute("id");
 clone.querySelectorAll("[id]").forEach(el => el.removeAttribute("id"));
 clone.querySelectorAll("[onclick],[ondblclick]").forEach(el => { el.removeAttribute("onclick"); el.removeAttribute("ondblclick"); });
 clone.style.minWidth = "0";
 clone.style.width = "100%";
 const html = `
 <div style="font-family:'Hiragino Kaku Gothic ProN', 'Meiryo', sans-serif; color:#000;">
 <div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid #000; padding-bottom:6px; margin-bottom:8px;">
 <h1 style="font-size:18px; margin:0;">${escapeHtml(facility)} 月間勤務表 ${y ? `${escapeHtml(y)}年${Number(m)}月` : ""}</h1>
 <div style="font-size:11px;">印刷日時: ${new Date().toLocaleString("ja-JP")}</div>
 </div>
 ${clone.outerHTML}
 </div>`;
 runPrintJob(html, { page: "A4 landscape", fitOnePage: true, minScale: 0.3 });
}

// 利用者別 月末請求明細 (A4縦・1枚) の印刷
function printBillingDetail() {
 // [Claude修正] 表示中の明細（全員の一覧、または選んだ利用者）を、対象の月を入れて印刷する
 const area = document.getElementById("billingDetailArea");
 if (!area || !area.innerHTML.trim()) {
  renderBillingDetail();
 }
 if (!area || !area.innerHTML.trim()) { alert("印刷する明細がありません。"); return; }
 const facility = getFacilityName();
 const body = area.innerHTML.replace(/<td class="no-print">[\s\S]*?<\/td>/g, "").replace(/<th class="no-print"><\/th>/g, "");
 const html = `
 <div style="font-family:'BIZ UDPGothic','Meiryo',sans-serif; color:#000;">
  <div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid #000; padding-bottom:8px; margin-bottom:14px;">
   <h1 style="font-size:20px; margin:0;">物品使用明細</h1>
   <div style="text-align:right; font-size:12px;"><div>${escapeHtml(facility)}</div><div>印刷日時: ${new Date().toLocaleString("ja-JP")}</div></div>
  </div>
  ${body}
 </div>`;
 runPrintJob(html, { page: "A4 portrait", fitOnePage: false });
}

function printCareSummary() {
 const rId = Number(document.getElementById("csResidentId")?.value) || gState.selectedResidentId;
 const r = gState.residents ? gState.residents.find(x => Number(x.id) === rId) : null;
 const printArea = document.getElementById("printArea");
 if (!printArea) {
 alert("印刷コンテナが見つかりません。");
 return;
 }

 const summaryType = document.getElementById("csSummaryType")?.value || "介護サマリー";
 const dateVal = document.getElementById("csDate")?.value || toLocalDateStr(new Date());
 const staffVal = document.getElementById("csStaff")?.value || "職員";
 const basicInfo = document.getElementById("csBasicInfo")?.value || "-";
 const background = document.getElementById("csBackground")?.value || "-";
 const physicalCognitive = document.getElementById("csPhysicalCognitive")?.value || "-";
 const adl = document.getElementById("csAdl")?.value || "-";
 const mealsHydration = document.getElementById("csMealsHydration")?.value || "-";
 const excretion = document.getElementById("csExcretion")?.value || "-";
 const sleep = document.getElementById("csSleep")?.value || "-";
 const meds = document.getElementById("csMeds")?.value || "-";
 const medicalCare = document.getElementById("csMedicalCare")?.value || "-";
 const dementiaBehavior = document.getElementById("csDementiaBehavior")?.value || "-";
 const careNotes = document.getElementById("csCareNotes")?.value || "-";
 const familyInfo = document.getElementById("csFamilyInfo")?.value || "-";
 const futureGoals = document.getElementById("csFutureGoals")?.value || "-";

 printArea.innerHTML = `
 <div style="font-family:'Hiragino Kaku Gothic ProN', 'Meiryo', sans-serif; color:#000; padding:10px;">
 <div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid #173f33; padding-bottom:8px; margin-bottom:12px;">
 <div>
 <h1 style="font-size:22px; margin:0; color:#173f33;">介護サマリー (生活・ADLアセスメント詳細)</h1>
 <p style="font-size:13px; color:#36443e; margin:4px 0 0 0;">
 対象利用者: <strong>${r ? escapeHtml(r.name) : ""} 様</strong> (${r ? escapeHtml(r.room_no) : ""}号室 / ${r ? escapeHtml(r.care_level) : ""})
 / サマリー種別: <strong>${escapeHtml(summaryType)}</strong>
 </p>
 </div>
 <div style="text-align:right; font-size:12px; color:#4a5852;">
 <div>作成日: ${escapeHtml(dateVal)}</div>
 <div>作成者: ${escapeHtml(staffVal)}</div>
 </div>
 </div>

 <table style="width:100%; border-collapse:collapse; font-size:12px; margin-bottom:10px;" border="1">
 <tr>
 <th style="width:160px; background:#eef2ef; padding:6px; text-align:left;">1. 基本情報</th>
 <td style="padding:6px; white-space:pre-wrap;">${escapeHtml(basicInfo)}</td>
 </tr>
 <tr>
 <th style="background:#eef2ef; padding:6px; text-align:left;">2. これまでの経過</th>
 <td style="padding:6px; white-space:pre-wrap;">${escapeHtml(background)}</td>
 </tr>
 <tr>
 <th style="background:#eef2ef; padding:6px; text-align:left;">3. 現在の身体・認知状態</th>
 <td style="padding:6px; white-space:pre-wrap;">${escapeHtml(physicalCognitive)}</td>
 </tr>
 <tr>
 <th style="background:#eef2ef; padding:6px; text-align:left;">4. ADL (日常生活動作)</th>
 <td style="padding:6px; white-space:pre-wrap;">${escapeHtml(adl)}</td>
 </tr>
 <tr>
 <th style="background:#eef2ef; padding:6px; text-align:left;">5. 食事・水分摂取</th>
 <td style="padding:6px; white-space:pre-wrap;">${escapeHtml(mealsHydration)}</td>
 </tr>
 <tr>
 <th style="background:#eef2ef; padding:6px; text-align:left;">6. 排泄</th>
 <td style="padding:6px; white-space:pre-wrap;">${escapeHtml(excretion)}</td>
 </tr>
 <tr>
 <th style="background:#eef2ef; padding:6px; text-align:left;">7. 睡眠</th>
 <td style="padding:6px; white-space:pre-wrap;">${escapeHtml(sleep)}</td>
 </tr>
 <tr>
 <th style="background:#eef2ef; padding:6px; text-align:left;">8. 服薬</th>
 <td style="padding:6px; white-space:pre-wrap;">${escapeHtml(meds)}</td>
 </tr>
 <tr>
 <th style="background:#eef2ef; padding:6px; text-align:left;">9. 医療的な処置</th>
 <td style="padding:6px; white-space:pre-wrap;">${escapeHtml(medicalCare)}</td>
 </tr>
 <tr>
 <th style="background:#eef2ef; padding:6px; text-align:left;">10. 認知症の症状や行動</th>
 <td style="padding:6px; white-space:pre-wrap;">${escapeHtml(dementiaBehavior)}</td>
 </tr>
 <tr>
 <th style="background:#eef2ef; padding:6px; text-align:left;">11. 介助方法・注意点</th>
 <td style="padding:6px; white-space:pre-wrap;">${escapeHtml(careNotes)}</td>
 </tr>
 <tr>
 <th style="background:#eef2ef; padding:6px; text-align:left;">12. 家族の状況</th>
 <td style="padding:6px; white-space:pre-wrap;">${escapeHtml(familyInfo)}</td>
 </tr>
 <tr>
 <th style="background:#eef2ef; padding:6px; text-align:left;">13. 今後の支援で気をつけること</th>
 <td style="padding:6px; white-space:pre-wrap;">${escapeHtml(futureGoals)}</td>
 </tr>
 </table>
 </div>
 `;
 runPrintJob(printArea.innerHTML, { page: "A4 portrait", fitOnePage: true });
}

// ======================================================================
// 緊急搬送・受診申し送りサマリー機能
// ======================================================================
function openEmergencySummaryModal(resId) {
 const targetId = (resId !== undefined && resId !== null && resId !== '') ? Number(resId) : Number(gState.selectedResidentId);
 const r = gState.residents ? gState.residents.find(x => Number(x.id) === targetId) : null;
 if (!r) {
 alert("利用者を選択してください。");
 return;
 }

 const badgeEl = document.getElementById("emgResidentBadge");
 if (badgeEl) badgeEl.textContent = `${r.room_no}号室 ${r.name} 様 (${r.care_level}) 救急隊・受診医療機関提出用`;

 const reasonInput = document.getElementById("emgReasonInput");
 if (reasonInput) {
 if (!reasonInput.value) {
 reasonInput.value = "";
 }
 }

 renderEmergencySummaryPreview(r);

 const modal = document.getElementById("emergencySummaryModal");
 if (modal) modal.style.display = "flex";
}

function updateEmergencyPreviewReason() {
 const rId = gState.selectedResidentId;
 const r = gState.residents ? gState.residents.find(x => Number(x.id) === Number(rId)) : null;
 if (r) renderEmergencySummaryPreview(r);
}

function renderEmergencySummaryPreview(r) {
 const container = document.getElementById("emergencySummarySheetPreview");
 if (!container || !r) return;

 const reasonText = document.getElementById("emgReasonInput")?.value || "（未記入・特変発生状況または受診理由を記載してください）";
 const nowStr = new Date().toLocaleString("ja-JP");
 const staffName = document.getElementById("currentStaff")?.value || "職員";
 const facility = getFacilityName(); // [Claude修正] 未設定の gState.facilityName を参照しており、変更した施設名が反映されていなかった

 // [Claude修正] 配列の最後ではなく、日付・時刻がいちばん新しいバイタルを出す（編集すると配列の順番と日付の順番がずれるため）
 const vitals = (db.data.vitals || []).filter(v => Number(v.resident_id) === Number(r.id))
 .slice().sort((a, b) => `${a.date || ""} ${a.time || ""}`.localeCompare(`${b.date || ""} ${b.time || ""}`));
 const latestVital = vitals.length > 0 ? vitals[vitals.length - 1] : null;
 const vitalStr = latestVital ? `体温: ${latestVital.temperature || "-"}℃ / 血圧: ${latestVital.bp_high || "-"}/${latestVital.bp_low || "-"} mmHg / 脈拍: ${latestVital.pulse || "-"} / SpO2: ${latestVital.spo2 || "-"}% (${latestVital.measured_at || latestVital.date || ""})` : "記録なし";

 const records = (db.data.care_records || []).filter(c => !c.voided && Number(c.resident_id) === Number(r.id) && (c.category === "特変" || c.category === "バイタル" || c.category === "巡視")).slice(0, 3);
 const recordsHtml = records.length > 0 ? records.map(rc => `<div>・[${escapeHtml(rc.recorded_at || "")}] [${escapeHtml(rc.category || "")}] ${escapeHtml(rc.content || "")} (${escapeHtml(rc.staff_name || "")})</div>`).join("") : "<div>特変記録なし</div>";

 const summaries = (db.data.care_summaries || []).filter(s => Number(s.resident_id) === Number(r.id));
 const latestSummary = summaries.length > 0 ? summaries[0] : null;

 container.innerHTML = `
 <div style="font-family:'Hiragino Kaku Gothic ProN', 'Meiryo', sans-serif; color:#1c2622;">
 <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #dc2626; padding-bottom:8px; margin-bottom:12px;">
 <div>
 <h2 style="font-size:20px; font-weight:bold; margin:0; color:#b91c1c;">緊急搬送・受診 申し送りサマリー</h2>
 <div style="font-size:12.5px; color:#4a5852; margin-top:2px;">施設名: <strong>${escapeHtml(facility)}</strong></div>
 </div>
 <div style="text-align:right; font-size:12px; color:#5f6d66;">
 <div>作成日時: <strong>${nowStr}</strong></div>
 <div>作成担当職員: <strong>${escapeHtml(staffName)}</strong></div>
 </div>
 </div>

 <div style="background:#fef2f2; border:2px solid #ef4444; border-radius:6px; padding:10px 12px; margin-bottom:12px;">
 <div style="font-weight:bold; color:#991b1b; font-size:13px; margin-bottom:3px;">【本日の救急搬送・受診理由 ＆ 発生状況】</div>
 <div style="font-size:13px; color:#22302b; white-space:pre-wrap; line-height:1.5;">${escapeHtml(reasonText)}</div>
 </div>

 <table style="width:100%; border-collapse:collapse; font-size:12px; margin-bottom:10px;" border="1">
 <tr>
 <th style="width:120px; background:#f6f8f6; padding:6px; text-align:left;">氏名</th>
 <td style="padding:6px; font-weight:bold; font-size:14px;">${escapeHtml(r.name)} 様 (${r.room_no}号室)</td>
 <th style="width:100px; background:#f6f8f6; padding:6px; text-align:left;">要介護度</th>
 <td style="padding:6px; font-weight:bold;">${escapeHtml(r.care_level)}</td>
 </tr>
 <tr>
 <th style="background:#f6f8f6; padding:6px; text-align:left;">生年月日 / 年齢</th>
 <td style="padding:6px;">${escapeHtml(r.birth_date || "-")}</td>
 <th style="background:#f6f8f6; padding:6px; text-align:left;">基本方針</th>
 <td style="padding:6px; font-weight:bold; color:${r.policy_stamp === '看取り' ? '#b91c1c' : '#1a4f3d'};">［ ${escapeHtml(r.policy_stamp || "未設定")} ］</td>
 </tr>
 <tr>
 <th style="background:#f6f8f6; padding:6px; text-align:left;">緊急連絡先</th>
 <td colspan="3" style="padding:6px; font-weight:bold; color:#1c2622;">${escapeHtml(r.emergency_contact || "未登録")}</td>
 </tr>
 <tr>
 <th style="background:#f6f8f6; padding:6px; text-align:left;">家族要望・ACP</th>
 <td colspan="3" style="padding:6px;">${escapeHtml(r.family_wishes || "未登録")}</td>
 </tr>
 </table>

 <table style="width:100%; border-collapse:collapse; font-size:12px; margin-bottom:10px;" border="1">
 <tr style="background:#fff1f2;">
 <th style="width:120px; color:#991b1b; padding:6px; text-align:left;">アレルギー</th>
 <td colspan="3" style="padding:6px; color:#dc2626; font-weight:bold; font-size:13px;">${escapeHtml(r.allergies || "未登録")}</td>
 </tr>
 <tr>
 <th style="width:120px; background:#f6f8f6; padding:6px; text-align:left;">既往歴・病歴</th>
 <td colspan="3" style="padding:6px;">${escapeHtml(r.diseases || "未登録")}</td>
 </tr>
 <tr>
 <th style="background:#f6f8f6; padding:6px; text-align:left;">往診医・受診指示</th>
 <td colspan="3" style="padding:6px;">${escapeHtml(r.dr_instructions || "未登録")}</td>
 </tr>
 <tr>
 <th style="background:#f6f8f6; padding:6px; text-align:left;">身体麻痺・状態</th>
 <td style="padding:6px;">${escapeHtml(r.paralysis || "未登録")}</td>
 <th style="width:100px; background:#f6f8f6; padding:6px; text-align:left;">食形態・口腔</th>
 <td style="padding:6px;">${escapeHtml(r.diet_type || "未登録")} / ${escapeHtml(r.oral_state || "未登録")}</td>
 </tr>
 <tr>
 <th style="background:#f6f8f6; padding:6px; text-align:left;">最新バイタル</th>
 <td colspan="3" style="padding:6px; font-weight:bold;">${escapeHtml(vitalStr)}</td>
 </tr>
 </table>

 <div style="background:#f6f8f6; border:1px solid #cdd6d0; border-radius:6px; padding:8px 10px; margin-bottom:10px; font-size:12px;">
 <strong style="color:#173f33;">【生活動作・ADL・介助注意点 (介護サマリー抜粋)】:</strong>
 <div style="margin-top:3px; line-height:1.4;">
 <strong>ADL:</strong> ${latestSummary ? escapeHtml(latestSummary.adl) : '未登録（介護サマリー未作成）'} /
 <strong>排泄:</strong> ${latestSummary ? escapeHtml(latestSummary.excretion) : '未登録（介護サマリー未作成）'} /
 <strong>認知症・BPSD:</strong> ${latestSummary ? escapeHtml(latestSummary.dementia_behavior) : '未登録（介護サマリー未作成）'}
 </div>
 </div>

 <div style="background:#f6f8f6; border:1px solid #cdd6d0; border-radius:6px; padding:8px 10px; font-size:12px;">
 <strong style="color:#173f33;">【施設内 直近の経過・特変記録抜粋】:</strong>
 <div style="margin-top:3px; line-height:1.4;">${recordsHtml}</div>
 </div>
 </div>
 `;
}

function printEmergencySummary() {
 const container = document.getElementById("emergencySummarySheetPreview");
 const printArea = document.getElementById("printArea");
 if (!container || !printArea) {
 alert("印刷コンテナが見つかりません。");
 return;
 }
 printArea.innerHTML = container.innerHTML;
 runPrintJob(printArea.innerHTML, { page: "A4 portrait", fitOnePage: true });
}

function copyEmergencySummaryText() {
 const rId = gState.selectedResidentId;
 const r = gState.residents ? gState.residents.find(x => Number(x.id) === Number(rId)) : null;
 if (!r) return;

 const reasonText = document.getElementById("emgReasonInput")?.value || "（未記入）";
 const facility = getFacilityName(); // [Claude修正] 未設定の gState.facilityName を参照しており、変更した施設名が反映されていなかった
 const nowStr = new Date().toLocaleString("ja-JP");
 const staffName = document.getElementById("currentStaff")?.value || "職員";

 const summaries = (db.data.care_summaries || []).filter(s => Number(s.resident_id) === Number(r.id));
 const s = summaries.length > 0 ? summaries[0] : null;

 const text = `【緊急搬送・受診 申し送り書】
施設名: ${facility}
作成日時: ${nowStr}
作成者: ${staffName}

■ 救急要請・受診理由
${reasonText}

■ 基本情報
氏名: ${r.name} 様 (${r.room_no}号室)
要介護度: ${r.care_level}
生年月日: ${r.birth_date || "-"}
基本方針: ［${r.policy_stamp || "未設定"}］
緊急連絡先: ${r.emergency_contact || "未登録"}
家族要望: ${r.family_wishes || "未登録"}

■ 医療・身体状態
アレルギー: ${r.allergies || "未登録"}
既往歴: ${r.diseases || "未登録"}
麻痺: ${r.paralysis || "未登録"}
食形態・口腔: ${r.diet_type || "未登録"} / ${r.oral_state || "未登録"}
往診医指示: ${r.dr_instructions || "未登録"}

■ 生活・ADL抜粋
ADL: ${s ? s.adl : "未登録（介護サマリー未作成）"}
排泄: ${s ? s.excretion : "未登録（介護サマリー未作成）"}
認知機能・注意点: ${s ? s.care_notes : "未登録（介護サマリー未作成）"}
`;

 if (navigator.clipboard && navigator.clipboard.writeText) {
 navigator.clipboard.writeText(text).then(() => {
 alert("緊急搬送・申し送りサマリーをクリップボードにコピーしました。");
 }).catch(() => {
 alert("コピーに失敗しました。画面のプレビューより選択してコピーしてください。");
 });
 } else {
 alert("クリップボードAPI非対応環境です。");
 }
}

// ======================================================================
// 皮膚・身体シェーマ図 (軟膏塗布・処置ピン・A4モノクロ印刷)
// ======================================================================

function renderSchemaSummaryBadges(residentId) {
 const rId = Number(residentId);
 const allPins = ((db && db.data && db.data.body_schema_pins) ? db.data.body_schema_pins : []).filter(p => !p.voided); // [Claude修正] 取消済みは表示しない
 const pins = allPins.filter(p => Number(p.resident_id) === rId && p.status !== "治癒・終了");
 if (pins.length === 0) {
 return `<span style="color:#5f6d66; font-size:11.5px;">特記処置なし</span>`;
 }
 pins.sort((a, b) => (Number(a.pin_no) || 0) - (Number(b.pin_no) || 0));
 return pins.map(p => `
 <span style="display:inline-flex; align-items:center; gap:3px; background:#eef2ef; border:1px solid #cdd6d0; border-radius:4px; padding:1px 6px; font-size:11px; margin-right:4px;">
 <span style="display:inline-block; width:15px; height:15px; line-height:15px; border-radius:50%; background:#000000; color:#ffffff; font-size:9.5px; text-align:center; font-weight:bold;">${p.pin_no}</span>
 <strong>${escapeHtml(p.site_name)}:</strong> ${cpDrugLink(p.item_name, "drug-link-inline")}
 </span>
 `).join("");
}

function openBodySchemaModal(residentId) {
 const rId = Number(residentId || gState.selectedResidentId || 1);
 gState.schemaResidentId = rId;

 const r = (gState.residents || []).find(x => Number(x.id) === rId);
 const badge = document.getElementById("schemaResidentBadge");
 if (badge) {
 if (r) {
 badge.textContent = `${r.name} 様 (${r.room_no}号室 / ${r.care_level})`;
 } else {
 badge.textContent = "利用者情報";
 }
 }

 resetSchemaPinForm();
 renderBodySchemaPins();
 openModal("bodySchemaModal");
}

function openBodySchemaForIncident() {
 const sel = document.getElementById("incResidentSelect");
 const rId = sel ? Number(sel.value) : Number(gState.selectedResidentId);
 openBodySchemaModal(rId || gState.selectedResidentId);
}

function renderBodySchemaPins() {
 const overlay = document.getElementById("schemaPinsOverlay");
 const tableContainer = document.getElementById("schemaPinsTableContainer");
 const countTitle = document.getElementById("schemaPinsCountTitle");
 if (!overlay || !tableContainer) return;

 const rId = Number(gState.schemaResidentId || gState.selectedResidentId);
 const allPins = ((db && db.data && db.data.body_schema_pins) ? db.data.body_schema_pins : []).filter(p => !p.voided); // [Claude修正] 取消済みは表示しない
 const pins = allPins.filter(p => Number(p.resident_id) === rId);

 pins.sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));
 pins.forEach((p, idx) => { p.pin_no = idx + 1; });

 if (countTitle) {
 countTitle.textContent = `登録中の処置・ピン一覧 (${pins.length}件)`;
 }

 const activeEditId = Number(document.getElementById("schemaEditPinId")?.value || 0);
 let pinsHtml = "";
 pins.forEach(p => {
 const isSelected = activeEditId === Number(p.id);
 const selectedStyle = isSelected
 ? "background:#ffffff; color:#000000; border:2px solid #000000; transform:scale(1.25); z-index:25; box-shadow:0 0 8px rgba(0,0,0,0.9);"
 : "background:#000000; color:#ffffff; border:2px solid #ffffff; z-index:10; box-shadow:0 2px 5px rgba(0,0,0,0.7);";

 pinsHtml += `
 <div class="schema-pin-badge" id="schemaPinEl_${p.id}"
 style="position:absolute; left:${p.x_pct}%; top:${p.y_pct}%; width:26px; height:26px; margin-left:-13px; margin-top:-13px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:13px; cursor:pointer; pointer-events:auto; user-select:none; transition:transform 0.15s ease; ${selectedStyle}"
 title="[${p.pin_no}] ${escapeHtml(p.site_name)}: ${escapeHtml(p.item_name)} (${escapeHtml(p.frequency || '-')})"
 onclick="event.stopPropagation(); editSchemaPin(${p.id});">
 ${p.pin_no}
 </div>
 `;
 });
 overlay.innerHTML = pinsHtml;

 if (pins.length === 0) {
 tableContainer.innerHTML = `
 <div style="text-align:center; padding:24px 10px; color:#5f6d66; font-size:12px;">
 現在登録されている処置ピンはありません。<br>
 左の人体図（正面・背面）をクリックしてピンを配置してください。
 </div>
 `;
 return;
 }

 let tableHtml = `
 <table class="table" style="width:100%; font-size:12px; margin-bottom:0; border-collapse:collapse;">
 <thead>
 <tr style="background:#eef2ef; color:#1c2622; border-bottom:2px solid #cdd6d0;">
 <th style="padding:6px 8px; width:40px; text-align:center;">番号</th>
 <th style="padding:6px 8px; width:85px;">部位</th>
 <th style="padding:6px 8px;">処置内容・薬剤名</th>
 <th style="padding:6px 8px; width:80px;">頻度</th>
 <th style="padding:6px 8px; width:65px; text-align:center;">状態</th>
 <th style="padding:6px 8px; width:95px; text-align:center;">操作</th>
 </tr>
 </thead>
 <tbody>
 `;

 pins.forEach(p => {
 const isSelected = activeEditId === Number(p.id);
 const rowBg = isSelected ? "background:#fef3c7;" : "";
 tableHtml += `
 <tr style="border-bottom:1px solid #dfe5e1; ${rowBg}">
 <td style="padding:6px 8px; text-align:center;">
 <span style="display:inline-block; width:22px; height:22px; line-height:20px; border-radius:50%; background:#000000; color:#ffffff; font-weight:bold; font-size:12px; text-align:center;">
 ${p.pin_no}
 </span>
 </td>
 <td style="padding:6px 8px;">
 <strong>${escapeHtml(p.site_name || '-')}</strong>
 <div style="font-size:10px; color:#5f6d66;">${escapeHtml(p.category || '-')}</div>
 </td>
 <td style="padding:6px 8px;">
 <div style="font-weight:bold; color:#1c2622;">${escapeHtml(p.item_name || '-')}</div>
 ${p.notes ? `<div style="font-size:11px; color:#4a5852; margin-top:2px;">${escapeHtml(p.notes)}</div>` : ''}
 </td>
 <td style="padding:6px 8px; font-size:11px; color:#36443e;">
 ${escapeHtml(p.frequency || '-')}
 </td>
 <td style="padding:6px 8px; text-align:center;">
 <span style="font-size:10.5px; padding:2px 5px; border-radius:4px; font-weight:bold; background:${p.status === '継続中' ? '#dfe5e1' : '#dcfce7'}; color:#1c2622; border:1px solid #94a19a;">
 ${escapeHtml(p.status || '継続中')}
 </span>
 </td>
 <td style="padding:6px 8px; text-align:center; white-space:nowrap;">
 <button type="button" class="btn btn-secondary" style="font-size:11px; padding:2px 7px;" onclick="editSchemaPin(${p.id})">訂正</button>
 <button type="button" class="btn btn-danger" style="font-size:11px; padding:2px 7px; margin-left:3px;" onclick="deleteSchemaPinById(${p.id})">削除</button>
 </td>
 </tr>
 `;
 });

 tableHtml += `</tbody></table>`;
 tableContainer.innerHTML = tableHtml;
}

function handleSchemaImageClick(event) {
 const wrapper = document.getElementById("schemaImageWrapper");
 if (!wrapper) return;

 const rect = wrapper.getBoundingClientRect();
 const clickX = event.clientX - rect.left;
 const clickY = event.clientY - rect.top;

 let xPct = (clickX / rect.width) * 100;
 let yPct = (clickY / rect.height) * 100;

 xPct = Math.max(2, Math.min(98, Math.round(xPct * 10) / 10));
 yPct = Math.max(2, Math.min(98, Math.round(yPct * 10) / 10));

 const isFront = xPct < 50;
 const viewName = isFront ? "正面図" : "背面図";

 let suggestedSite = "";
 if (yPct < 16) {
 suggestedSite = isFront ? "頭部・顔面" : "後頭部・頚部";
 } else if (yPct < 35) {
 suggestedSite = isFront ? "胸部・上肢" : "背部・肩甲骨部";
 } else if (yPct < 50) {
 suggestedSite = isFront ? "腹部・前腕" : "腰部・仙骨部";
 } else if (yPct < 75) {
 suggestedSite = isFront ? "大腿部・膝" : "臀部・大腿後面";
 } else {
 suggestedSite = isFront ? "下腿・足部" : "下腿後面・踵部";
 }

 const idInput = document.getElementById("schemaEditPinId");

 // [Claude修正] 既存ピンの「訂正」中に図をクリックした場合は、新規ピンにせず、そのピンの移動先として扱う。
 // (旧実装は訂正中でも新規登録に切り替わり、位置を直すには新規追加と削除をやり直す必要があった)
 const editingId = idInput ? Number(idInput.value || 0) : 0;
 if (editingId > 0) {
 const xIn = document.getElementById("schemaEditPinXPct");
 const yIn = document.getElementById("schemaEditPinYPct");
 if (xIn) xIn.value = xPct;
 if (yIn) yIn.value = yPct;
 const pinEl = document.getElementById(`schemaPinEl_${editingId}`);
 if (pinEl) {
 pinEl.style.left = `${xPct}%`;
 pinEl.style.top = `${yPct}%`;
 pinEl.style.border = "2px dashed #000000";
 }
 const badge = document.getElementById("schemaPinCoordsBadge");
 if (badge) {
 badge.textContent = `移動先: ${viewName} (${xPct}%, ${yPct}%) - まだ保存されていません。保存ボタンで位置も更新されます`;
 }
 return;
 }

 if (idInput) idInput.value = "";

 const xInput = document.getElementById("schemaEditPinXPct");
 if (xInput) xInput.value = xPct;

 const yInput = document.getElementById("schemaEditPinYPct");
 if (yInput) yInput.value = yPct;

 const siteInput = document.getElementById("schemaPinSite");
 if (siteInput && !siteInput.value.trim()) {
 siteInput.value = suggestedSite;
 }

 const coordsBadge = document.getElementById("schemaPinCoordsBadge");
 if (coordsBadge) {
 coordsBadge.textContent = `位置: ${viewName} (${xPct}%, ${yPct}%)`;
 }

 const titleEl = document.getElementById("schemaPinEditTitle");
 if (titleEl) {
 titleEl.textContent = `新規ピン登録 (${viewName}: ${suggestedSite} 付近)`;
 }

 const delBtn = document.getElementById("btnDeleteSchemaPin");
 if (delBtn) delBtn.style.display = "none";

 const overlay = document.getElementById("schemaPinsOverlay");
 if (overlay) {
 const existingTemp = document.querySelector(".schema-temp-click-pin");
 if (existingTemp) existingTemp.remove();

 const tempDiv = document.createElement("div");
 tempDiv.className = "schema-temp-click-pin";
 tempDiv.style.cssText = `position:absolute; left:${xPct}%; top:${yPct}%; width:26px; height:26px; margin-left:-13px; margin-top:-13px; background:#000000; color:#ffffff; border:2px dashed #ffffff; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:12px; pointer-events:none; z-index:30; animation:pulseTemp 1s infinite alternate;`;
 tempDiv.textContent = "+";
 overlay.appendChild(tempDiv);
 }

 const itemInput = document.getElementById("schemaPinItem");
 if (itemInput) itemInput.focus();
}

function saveSchemaPin() {
 const rId = Number(gState.schemaResidentId || gState.selectedResidentId);
 const editId = Number(document.getElementById("schemaEditPinId")?.value || 0);
 const xPct = parseFloat(document.getElementById("schemaEditPinXPct")?.value || 0);
 const yPct = parseFloat(document.getElementById("schemaEditPinYPct")?.value || 0);
 const site = document.getElementById("schemaPinSite")?.value.trim() || "";
 const category = document.getElementById("schemaPinCategory")?.value || "軟膏塗布";
 const item = document.getElementById("schemaPinItem")?.value.trim() || "";
 const frequency = document.getElementById("schemaPinFrequency")?.value.trim() || "入浴後";
 const status = document.getElementById("schemaPinStatus")?.value || "継続中";
 const notes = document.getElementById("schemaPinNotes")?.value.trim() || "";

 if (!site) {
 alert("部位名を入力または選択してください (例: 背部, 仙骨部, 右膝等)。");
 document.getElementById("schemaPinSite")?.focus();
 return;
 }
 if (!item) {
 alert("処置内容・薬剤名を入力または選択してください (例: ヒルドイドソフト, プロペト等)。");
 document.getElementById("schemaPinItem")?.focus();
 return;
 }
 if (xPct === 0 && yPct === 0 && !editId) {
 alert("左の人体図（シェーマ図）をクリックしてピンの位置を指定してください。");
 return;
 }

 if (!db.data.body_schema_pins) db.data.body_schema_pins = [];
 const staffName = document.getElementById("currentStaff")?.value || "職員";
 const now = new Date();
 const nowStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

 if (editId > 0) {
 const pin = db.data.body_schema_pins.find(p => Number(p.id) === editId);
 if (pin) {
 const cpOld = Object.assign({}, pin); // [Claude修正] 変更前の内容を履歴に残す
 pin.site_name = site;
 pin.category = category;
 pin.item_name = item;
 pin.frequency = frequency;
 pin.status = status;
 pin.notes = notes;
 pin.updated_at = nowStr;
 pin.staff_name = staffName;
 if (xPct > 0 && yPct > 0) {
 pin.x_pct = xPct;
 pin.y_pct = yPct;
 }
 cpAppendEditHistory(pin, cpOld, ["site_name", "category", "item_name", "frequency", "status", "notes", "x_pct", "y_pct"]);
 }
 } else {
 const newId = db.data.body_schema_pins.length > 0
 ? Math.max(...db.data.body_schema_pins.map(p => Number(p.id) || 0)) + 1
 : 1;

 const resPins = db.data.body_schema_pins.filter(p => !p.voided && Number(p.resident_id) === rId);
 const pinNo = resPins.length + 1;

 db.data.body_schema_pins.push({
 id: newId,
 resident_id: rId,
 pin_no: pinNo,
 category: category,
 site_name: site,
 item_name: item,
 frequency: frequency,
 status: status,
 notes: notes,
 doctor_name: "担当医",
 x_pct: xPct,
 y_pct: yPct,
 created_at: nowStr,
 updated_at: nowStr,
 staff_name: staffName
 });
 }

 gState.body_schema_pins = db.data.body_schema_pins;
 if (typeof db.save === 'function') db.save();

 resetSchemaPinForm();
 renderBodySchemaPins();
 if (typeof renderResidentDetail === 'function') renderResidentDetail();

 const toastMsg = editId > 0 ? "処置ピンの内容を訂正・更新しました。" : "新しい処置ピンを登録しました。";
 if (typeof showToast === 'function') {
 showToast(toastMsg);
 } else {
 alert(toastMsg);
 }
}

function editSchemaPin(pinId) {
 const pin = (db.data.body_schema_pins || []).find(p => Number(p.id) === Number(pinId));
 if (!pin) return;

 const idInput = document.getElementById("schemaEditPinId");
 if (idInput) idInput.value = pin.id;

 const xInput = document.getElementById("schemaEditPinXPct");
 if (xInput) xInput.value = pin.x_pct;

 const yInput = document.getElementById("schemaEditPinYPct");
 if (yInput) yInput.value = pin.y_pct;

 const siteInput = document.getElementById("schemaPinSite");
 if (siteInput) siteInput.value = pin.site_name || "";

 const catSelect = document.getElementById("schemaPinCategory");
 if (catSelect) catSelect.value = pin.category || "軟膏塗布";

 const itemInput = document.getElementById("schemaPinItem");
 if (itemInput) itemInput.value = pin.item_name || "";

 const freqInput = document.getElementById("schemaPinFrequency");
 if (freqInput) freqInput.value = pin.frequency || "入浴後";

 const statusSelect = document.getElementById("schemaPinStatus");
 if (statusSelect) statusSelect.value = pin.status || "継続中";

 const notesInput = document.getElementById("schemaPinNotes");
 if (notesInput) notesInput.value = pin.notes || "";

 const titleEl = document.getElementById("schemaPinEditTitle");
 if (titleEl) titleEl.textContent = `ピン訂正・編集 (No. ${pin.pin_no}: ${pin.site_name})`;

 const coordsBadge = document.getElementById("schemaPinCoordsBadge");
 if (coordsBadge) {
 const isFront = pin.x_pct < 50;
 coordsBadge.textContent = `位置: ${isFront ? "正面図" : "背面図"} (${pin.x_pct}%, ${pin.y_pct}%) - ピンを動かす場合は、図の正しい位置をクリックしてから保存してください`;
 }

 const delBtn = document.getElementById("btnDeleteSchemaPin");
 if (delBtn) delBtn.style.display = "inline-block";

 const tempPin = document.querySelector(".schema-temp-click-pin");
 if (tempPin) tempPin.remove();

 renderBodySchemaPins();
}

function deleteSchemaPin() {
 const editId = Number(document.getElementById("schemaEditPinId")?.value || 0);
 if (!editId) return;
 deleteSchemaPinById(editId);
}

function deleteSchemaPinById(pinId) {
 const pin = (db.data.body_schema_pins || []).find(p => Number(p.id) === Number(pinId));
 if (!pin) return;

 // [Claude修正] ピン（処置の指示）は消さずに「取消」として残す（理由必須）。処置が終わった場合は状態を「治癒・終了」にする
 if (!cpVoidRecord(pin, "", `No. ${pin.pin_no}「${pin.site_name}: ${pin.item_name}」のピンを取消にします。\n記録は消えずに残ります。\n（処置が終わった場合は、取消ではなく状態を「治癒・終了」に変更してください）\n\n取消の理由を入力してください (例: 位置の間違い、重複登録)`)) return;

 const rId = pin.resident_id;
 const resPins = db.data.body_schema_pins.filter(p => !p.voided && Number(p.resident_id) === Number(rId));
 resPins.sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));
 resPins.forEach((p, idx) => { p.pin_no = idx + 1; });

 gState.body_schema_pins = db.data.body_schema_pins;
 if (typeof db.save === 'function') db.save();

 resetSchemaPinForm();
 renderBodySchemaPins();
 if (typeof renderResidentDetail === 'function') renderResidentDetail();

 if (typeof showToast === 'function') {
 showToast("ピンを削除しました。");
 } else {
 alert("ピンを削除しました。");
 }
}

function resetSchemaPinForm() {
 const idInput = document.getElementById("schemaEditPinId");
 if (idInput) idInput.value = "";

 const xInput = document.getElementById("schemaEditPinXPct");
 if (xInput) xInput.value = "";

 const yInput = document.getElementById("schemaEditPinYPct");
 if (yInput) yInput.value = "";

 const siteInput = document.getElementById("schemaPinSite");
 if (siteInput) siteInput.value = "";

 const catSelect = document.getElementById("schemaPinCategory");
 if (catSelect) catSelect.value = "軟膏塗布";

 const itemInput = document.getElementById("schemaPinItem");
 if (itemInput) itemInput.value = "";

 const freqInput = document.getElementById("schemaPinFrequency");
 if (freqInput) freqInput.value = "入浴後";

 const statusSelect = document.getElementById("schemaPinStatus");
 if (statusSelect) statusSelect.value = "継続中";

 const notesInput = document.getElementById("schemaPinNotes");
 if (notesInput) notesInput.value = "";

 const titleEl = document.getElementById("schemaPinEditTitle");
 if (titleEl) titleEl.textContent = "新規ピン登録 (図をクリックして位置を指定)";

 const coordsBadge = document.getElementById("schemaPinCoordsBadge");
 if (coordsBadge) coordsBadge.textContent = "";

 const delBtn = document.getElementById("btnDeleteSchemaPin");
 if (delBtn) delBtn.style.display = "none";

 const tempPin = document.querySelector(".schema-temp-click-pin");
 if (tempPin) tempPin.remove();

 // [Claude修正] 訂正を取りやめた場合に、保存していない移動先の表示を元の位置に戻す
 if (typeof renderBodySchemaPins === "function") renderBodySchemaPins();
}

function setSchemaSite(site) {
 const input = document.getElementById("schemaPinSite");
 if (input) {
 input.value = site;
 input.focus();
 }
}

function setSchemaItem(item, cat) {
 const input = document.getElementById("schemaPinItem");
 if (input) {
 input.value = item;
 input.focus();
 }
 if (cat) {
 const catSelect = document.getElementById("schemaPinCategory");
 if (catSelect) catSelect.value = cat;
 }
}

function setSchemaFrequency(freq) {
 const input = document.getElementById("schemaPinFrequency");
 if (input) {
 input.value = freq;
 input.focus();
 }
}

function printBodySchema() {
 const rId = Number(gState.schemaResidentId || gState.selectedResidentId);
 const r = (gState.residents || []).find(x => Number(x.id) === rId);
 const printArea = document.getElementById("printArea");
 if (!printArea) {
 alert("印刷コンテナが見つかりません。");
 return;
 }

 const facility = getFacilityName();
 const now = new Date();
 const printDateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
 const staffName = document.getElementById("currentStaff")?.value || "担当職員";

 const allPins = ((db && db.data && db.data.body_schema_pins) ? db.data.body_schema_pins : []).filter(p => !p.voided); // [Claude修正] 取消済みは表示しない
 const pins = allPins.filter(p => Number(p.resident_id) === rId);
 pins.sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));
 pins.forEach((p, idx) => { p.pin_no = idx + 1; });

 let ageText = "-";
 if (r && r.birth_date) {
 const bYear = parseInt(r.birth_date.split("-")[0], 10);
 if (!isNaN(bYear)) ageText = `${2026 - bYear}歳`;
 }

 let pinsOverlayHtml = "";
 pins.forEach(p => {
 pinsOverlayHtml += `
 <div style="position:absolute; left:${p.x_pct}%; top:${p.y_pct}%; width:20px; height:20px; margin-left:-10px; margin-top:-10px; border-radius:50%; background:#000000 !important; color:#ffffff !important; border:2px solid #000000 !important; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:11px; -webkit-print-color-adjust:exact; print-color-adjust:exact;">
 ${p.pin_no}
 </div>
 `;
 });

 let tableRowsHtml = "";
 if (pins.length === 0) {
 tableRowsHtml = `
 <tr>
 <td colspan="6" style="padding:10px; text-align:center; border:1px solid #000; font-size:11px;">
 現在登録されている皮膚処置・外用薬ピンはありません。
 </td>
 </tr>
 `;
 } else {
 pins.forEach(p => {
 tableRowsHtml += `
 <tr style="border-bottom:1px solid #000;">
 <td style="padding:5px 6px; text-align:center; border:1px solid #000; font-weight:bold; font-size:12px;">
 ${p.pin_no}
 </td>
 <td style="padding:5px 6px; border:1px solid #000; font-weight:bold; font-size:11px;">
 ${escapeHtml(p.site_name || '-')}
 <div style="font-size:9.5px; font-weight:normal;">(${escapeHtml(p.category || '-')})</div>
 </td>
 <td style="padding:5px 6px; border:1px solid #000; font-size:11px;">
 <strong>${escapeHtml(p.item_name || '-')}</strong>
 </td>
 <td style="padding:5px 6px; border:1px solid #000; font-size:10.5px; text-align:center;">
 ${escapeHtml(p.frequency || '-')}
 </td>
 <td style="padding:5px 6px; border:1px solid #000; font-size:10.5px;">
 ${escapeHtml(p.notes || '-')}
 </td>
 <td style="padding:5px 6px; border:1px solid #000; font-size:10.5px; text-align:center;">
 ${escapeHtml(p.status || '継続中')}
 </td>
 </tr>
 `;
 });
 }

 printArea.innerHTML = `
 <div style="font-family:'Hiragino Kaku Gothic ProN', 'Meiryo', sans-serif; color:#000; padding:4px; max-width:820px; margin:0 auto; font-size:11px; line-height:1.35;">
 <div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid #000; padding-bottom:6px; margin-bottom:8px;">
 <div>
 <div style="font-size:10px; font-weight:bold; letter-spacing:1px;">介護施設・医療機関連携 共通記録シート</div>
 <h1 style="font-size:19px; margin:2px 0 0 0; font-weight:bold; letter-spacing:0.5px;">【皮膚処置・身体シェーマ指示書】 (皮膚科・往診連携用)</h1>
 </div>
 <div style="text-align:right; font-size:10px; line-height:1.4;">
 <div>施設名: <strong>${escapeHtml(facility)}</strong></div>
 <div>発行日: ${printDateStr}</div>
 <div>記録者: ${escapeHtml(staffName)}</div>
 </div>
 </div>

 <table style="width:100%; border-collapse:collapse; margin-bottom:8px; border:1px solid #000; font-size:11px;">
 <tr style="background:#eef2ef; -webkit-print-color-adjust:exact;">
 <th style="padding:4px 6px; border:1px solid #000; width:12%; text-align:left;">利用者氏名</th>
 <td style="padding:4px 6px; border:1px solid #000; width:28%; font-size:13px; font-weight:bold;">${r ? escapeHtml(r.name) : '-'} 様</td>
 <th style="padding:4px 6px; border:1px solid #000; width:10%; text-align:left;">居室 / 介護度</th>
 <td style="padding:4px 6px; border:1px solid #000; width:20%;">${r ? escapeHtml(r.room_no) : '-'}号室 / ${r ? escapeHtml(r.care_level) : '-'}</td>
 <th style="padding:4px 6px; border:1px solid #000; width:10%; text-align:left;">年齢 / 生年月日</th>
 <td style="padding:4px 6px; border:1px solid #000; width:20%;">${ageText} (${r ? escapeHtml(r.birth_date || '-') : '-'})</td>
 </tr>
 <tr>
 <th style="padding:4px 6px; border:1px solid #000; text-align:left;">病名・既往歴</th>
 <td style="padding:4px 6px; border:1px solid #000;">${r ? escapeHtml(r.diseases || '-') : '-'}</td>
 <th style="padding:4px 6px; border:1px solid #000; text-align:left;">アレルギー</th>
 <td style="padding:4px 6px; border:1px solid #000; font-weight:bold;">${r && r.allergies ? escapeHtml(r.allergies) : '特になし'}</td>
 <th style="padding:4px 6px; border:1px solid #000; text-align:left;">身体状況</th>
 <td style="padding:4px 6px; border:1px solid #000;">${r ? escapeHtml(r.paralysis || '-') : '-'}</td>
 </tr>
 </table>

 <div style="border:1px solid #000; padding:6px; margin-bottom:8px; text-align:center; background:#ffffff;">
 <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:10px; margin-bottom:4px; padding:0 30px;">
 <span>【正面図】 (前面・左右)</span>
 <span>【背面図】 (背面・左右)</span>
 </div>
 <div style="position:relative; display:inline-block; max-width:440px; width:100%;">
 <img src="assets/body_schema.jpg" alt="人体シェーマ図" style="width:100%; height:auto; display:block; border:1px solid #ccc;">
 ${pinsOverlayHtml}
 </div>
 <div style="font-size:9.5px; color:#333; margin-top:2px;">
 ※図上の黒丸番号 (1, 2, 3...) は、下記の処置一覧テーブルの番号と対応しています。
 </div>
 </div>

 <div style="margin-bottom:8px;">
 <div style="font-weight:bold; font-size:11px; margin-bottom:3px; display:flex; justify-content:space-between;">
 <span>■ 登録中の皮膚処置・外用薬・貼付剤 一覧</span>
 <span style="font-size:10px;">(計 ${pins.length} 件)</span>
 </div>
 <table style="width:100%; border-collapse:collapse; border:1px solid #000; font-size:10.5px;">
 <thead>
 <tr style="background:#dfe5e1; font-weight:bold; -webkit-print-color-adjust:exact;">
 <th style="padding:4px 5px; border:1px solid #000; width:35px; text-align:center;">No.</th>
 <th style="padding:4px 5px; border:1px solid #000; width:110px;">部位 (区分)</th>
 <th style="padding:4px 5px; border:1px solid #000; width:160px;">処置内容・薬剤名</th>
 <th style="padding:4px 5px; border:1px solid #000; width:80px; text-align:center;">頻度・タイミング</th>
 <th style="padding:4px 5px; border:1px solid #000;">症状・目的・特記事項</th>
 <th style="padding:4px 5px; border:1px solid #000; width:55px; text-align:center;">状態</th>
 </tr>
 </thead>
 <tbody>
 ${tableRowsHtml}
 </tbody>
 </table>
 </div>

 <div style="display:grid; grid-template-columns: 2fr 1fr; gap:8px; margin-top:6px;">
 <div style="border:1.5px solid #000; padding:6px; min-height:85px; position:relative;">
 <div style="font-weight:bold; font-size:10.5px; border-bottom:1px solid #000; padding-bottom:2px; margin-bottom:4px;">
 【皮膚科・往診医 指示・処方変更 記入欄】 (医師記入)
 </div>
 <div style="font-size:9.5px; color:#555; line-height:2.2;">
 ・処置・軟膏の変更 / 中止指示:<br>
 ・次回受診・再評価の目安:<br>
 ・特記事項:
 </div>
 <div style="position:absolute; bottom:4px; right:8px; font-size:10px;">
 医師署名: ____________________ 印
 </div>
 </div>

 <div style="border:1.5px solid #000; padding:6px; min-height:85px; display:flex; flex-direction:column; justify-content:space-between;">
 <div style="font-weight:bold; font-size:10.5px; border-bottom:1px solid #000; padding-bottom:2px;">
 【施設看護・介護 確認欄】
 </div>
 <div style="font-size:9.5px; line-height:1.6; margin-top:2px;">
 指示受託者: _______________<br>
 記録反映確認: _______________<br>
 受託日時: _____/_____ (_____)
 </div>
 <div style="text-align:right; font-size:9px; color:#666;">
 ※受診後カルテへ即日反映
 </div>
 </div>
 </div>
 </div>
 `;

 runPrintJob(printArea.innerHTML, { page: "A4 portrait", fitOnePage: true });
}

// 介護記録の追加
function submitCareRecord() {
 const content = document.getElementById("recordContent").value.trim();
 if (!content) {
 alert("記録内容を入力してください。");
 return;
 }
 const customTime = document.getElementById("recordCustomTime").value;
 const staff = document.getElementById("currentStaff").value;
 const category = document.getElementById("recordCategory").value;
 const now = new Date();
 const tm = now.toTimeString().slice(0, 5);
 const recordedAt = customTime ? customTime.replace("T", " ") : `${gState.selectedDate} ${tm}`;

 const newRec = {
 id: Date.now(),
 recorded_at: recordedAt,
 resident_id: gState.selectedResidentId,
 category: category,
 content: content,
 staff_name: staff
 };

 db.data.care_records.unshift(newRec);

 // 特変または連絡の場合は、申し送り（連絡帳）へも自動追加
 if (category === "特変" || category === "連絡") {
 if (!Array.isArray(db.data.notebooks)) db.data.notebooks = [];
 const res = gState.residents.find(x => x.id === gState.selectedResidentId);
 const resName = res ? `${res.room_no}号室 ${res.name} 様` : "";
 db.data.notebooks.unshift({
 id: Date.now() + 1,
 date: gState.selectedDate,
 resident_id: gState.selectedResidentId,
 content: `［${category}］(${resName}) ${content}`,
 staff_name: staff,
 status: "未対応"
 });
 }

 db.save();

 document.getElementById("recordContent").value = "";
 document.getElementById("recordCustomTime").value = "";
 const fsArea = document.getElementById("fsRecordContent");
 if (fsArea) fsArea.value = "";
 updateRecordCharCount();

 loadDateRecords(gState.selectedDate);
 renderCalendar();
 alert("介護記録を保存しました！");
}

// 記録区分（介護・特変・連絡・看護・リハビリ・家族・巡視等）のワンタップ選択
function selectRecordCategory(cat) {
 const sel = document.getElementById("recordCategory");
 if (sel) {
 sel.value = cat;
 }
 syncCategoryButtons();

 // 特変・連絡選択時、本文が空なら即座に雛形をサジェスト＆フォーカス
 const contentArea = cpRecordArea();
 if (contentArea) {
 if (!contentArea.value.trim()) {
 if (cat === "特変") {
 const tm = new Date().toTimeString().slice(0, 5);
 contentArea.value = `【特変】${tm}頃、`;
 } else if (cat === "連絡") {
 contentArea.value = `【連絡】`;
 } else if (cat === "看護") {
 contentArea.value = `【看護処置】`;
 } else if (cat === "リハビリ") {
 contentArea.value = `【リハビリ】`;
 }
 }
 contentArea.focus();
 updateRecordCharCount();
 }
}

// 区分セレクターボタングループのアクティブ表示同期
function syncCategoryButtons() {
 const sel = document.getElementById("recordCategory");
 if (!sel) return;
 const currentCat = sel.value;

 const btnContainer = document.getElementById("categoryQuickButtons");
 if (!btnContainer) return;
 const buttons = btnContainer.querySelectorAll("button[data-cat]");

 const activeStyles = {
 "介護": { bg: "#1e5b47", fg: "#ffffff", border: "#c9e0d5" },
 "特変": { bg: "#dc2626", fg: "#ffffff", border: "#fca5a5" },
 "連絡": { bg: "#ca8a04", fg: "#ffffff", border: "#fde047" },
 "看護": { bg: "#16a34a", fg: "#ffffff", border: "#bbf7d0" },
 "リハビリ": { bg: "#7c3aed", fg: "#ffffff", border: "#ddd6fe" },
 "家族": { bg: "#ea580c", fg: "#ffffff", border: "#fed7aa" },
 "巡視": { bg: "#4a5852", fg: "#ffffff", border: "#cdd6d0" }
 };

 buttons.forEach(btn => {
 const bCat = btn.getAttribute("data-cat");
 if (bCat === currentCat) {
 btn.classList.add("active");
 const style = activeStyles[bCat] || { bg: "#1e5b47", fg: "#ffffff", border: "#c9e0d5" };
 btn.style.background = style.bg;
 btn.style.color = style.fg;
 btn.style.borderColor = style.border;
 btn.style.fontWeight = "bold";
 } else {
 btn.classList.remove("active");
 const style = activeStyles[bCat] || { bg: "#ffffff", fg: "#36443e", border: "#cdd6d0" };
 btn.style.background = "#ffffff";
 btn.style.color = style.bg;
 btn.style.borderColor = style.border;
 btn.style.fontWeight = "bold";
 }
 });
}

// 長文記録の展開・折りたたみ状態管理
const gExpandedRecordIds = new Set();
function toggleRecordExpand(recId) {
 if (gExpandedRecordIds.has(recId)) {
 gExpandedRecordIds.delete(recId);
 } else {
 gExpandedRecordIds.add(recId);
 }
 renderSelectedDateRecords();
}

// 記録表示範囲の切り替え（指定日のみ ⇄ 全過去履歴）
function toggleRecordScope() {
 gState.recordScope = (gState.recordScope === "all") ? "today" : "all";
 const btn = document.getElementById("btnToggleRecordScope");
 if (btn) {
 if (gState.recordScope === "all") {
 btn.textContent = " 指定日の記録のみ表示";
 btn.style.background = "#f1f6f3";
 btn.style.color = "#1a4f3d";
 btn.style.border = "1px solid #a9cfbf";
 } else {
 btn.textContent = " すべての過去履歴を表示";
 btn.style.background = "#f0fdf4";
 btn.style.color = "#166534";
 btn.style.border = "1px solid #bbf7d0";
 }
 }
 renderSelectedDateRecords();
}

// 年月アコーディオン開閉状態 Set & 選択中月フィルター
const gOpenMonthAccordions = new Set();
let gSelectedHistoryMonth = "all";

// [Claude修正 2026-10-16] 開くのは一度に1か月だけ（別の月を開くと前の月は閉じる）。
// 以前は「開いている月がなくなったら一番新しい月を開く」処理が閉じた直後にも働き、一番新しい月が閉じられなかった
let gMonthAccordionInited = false;
function toggleMonthAccordion(ym) {
 const wasOpen = gOpenMonthAccordions.has(ym);
 gOpenMonthAccordions.clear();
 if (!wasOpen) gOpenMonthAccordions.add(ym);
 gMonthAccordionInited = true;
 renderSelectedDateRecords();
}

function filterHistoryMonth(ym) {
 gSelectedHistoryMonth = ym;
 if (ym !== "all") {
 gOpenMonthAccordions.clear(); // [Claude修正 2026-10-16] 1か月だけ開く
 gOpenMonthAccordions.add(ym);
 gMonthAccordionInited = true;
 }
 renderSelectedDateRecords();
}

// ======================================================================
// 個人カルテ専用 月間カレンダー & 統合デイリーサマリー & 連動編集
// ======================================================================

function getWeekDayJp(dateStr) {
 if (!dateStr) return "";
 const days = ["日", "月", "火", "水", "木", "金", "土"];
 const d = new Date(dateStr + "T00:00:00");
 return isNaN(d.getDay()) ? "" : days[d.getDay()];
}

function renderPersonalCalendar() {
 const container = document.getElementById("personalCalendarContainer");
 if (!container) return;

 const res = gState.residents.find(x => x.id === gState.selectedResidentId);
 if (!res) {
 container.innerHTML = "";
 return;
 }

 // 表示対象年月 (未設定なら選択中日付の年月、それもなければ今日)
 const currentYm = gState.personalCalendarYearMonth || (gState.selectedDate ? gState.selectedDate.slice(0, 7) : getTodayStr().slice(0, 7));
 const [yearStr, monthStr] = currentYm.split("-");
 const year = parseInt(yearStr, 10);
 const month = parseInt(monthStr, 10); // 1-12

 // 当月の初日・末日・日数
 const firstDay = new Date(year, month - 1, 1);
 const startDayOfWeek = firstDay.getDay(); // 0(日) - 6(土)
 const daysInMonth = new Date(year, month, 0).getDate();

 // カレンダーヘッダー
 let html = `
 <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:8px;">
 <div style="display:flex; align-items:center; gap:6px;">
 <span style="font-size:13px; font-weight:bold; color:#173f33;"> 【${escapeHtml(res.name)} 様】の個人記録カレンダー:</span>
 <button type="button" class="btn btn-secondary" style="padding:2px 8px; font-size:11px;" onclick="changePersonalCalendarMonth(-1)">◀ 前月</button>
 <strong style="font-size:14px; color:#1c2622; min-width:90px; text-align:center;">${year}年 ${month}月</strong>
 <button type="button" class="btn btn-secondary" style="padding:2px 8px; font-size:11px;" onclick="changePersonalCalendarMonth(1)">次月 ▶</button>
 <button type="button" class="btn btn-secondary" style="padding:2px 8px; font-size:11px; margin-left:4px; background:#f1f6f3; color:#1a4f3d; border-color:#c9e0d5;" onclick="jumpPersonalCalendarToday()">今日</button>
 </div>
 <div style="display:flex; gap:10px; align-items:center; font-size:11px; color:#5f6d66;">
 <span><span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#1e5b47; margin-right:3px;"></span>バイタル</span>
 <span><span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#16a34a; margin-right:3px;"></span>経過記録</span>
 <span><span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#dc2626; margin-right:3px;"></span>特変</span>
 <span><span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#d97706; margin-right:3px;"></span>入院中</span>
 </div>
 </div>
 `;

 // カレンダーテーブル
 html += `
 <div style="overflow-x:auto;">
 <table style="width:100%; border-collapse:collapse; text-align:center; font-size:12px; background:#fff; border-radius:6px; overflow:hidden; border:1px solid #dfe5e1;">
 <thead>
 <tr style="background:#eef2ef; color:#4a5852; font-weight:bold; height:26px;">
 <th style="color:#dc2626; width:14.28%;">日</th>
 <th style="width:14.28%;">月</th>
 <th style="width:14.28%;">火</th>
 <th style="width:14.28%;">水</th>
 <th style="width:14.28%;">木</th>
 <th style="width:14.28%;">金</th>
 <th style="color:#1e5b47; width:14.28%;">土</th>
 </tr>
 </thead>
 <tbody>
 `;

 let dayCounter = 1;
 const totalRows = Math.ceil((startDayOfWeek + daysInMonth) / 7);

 for (let r = 0; r < totalRows; r++) {
 html += `<tr style="height:46px;">`;
 for (let c = 0; c < 7; c++) {
 const cellIndex = r * 7 + c;
 if (cellIndex < startDayOfWeek || dayCounter > daysInMonth) {
 html += `<td style="background:#f6f8f6; border:1px solid #eef2ef;"></td>`;
 } else {
 const curDay = dayCounter;
 const curDateStr = `${year}-${String(month).padStart(2, "0")}-${String(curDay).padStart(2, "0")}`;
 const isSelected = curDateStr === gState.selectedDate;

 // 記録判定
 const hasVital = (db.data.vitals || []).some(v => v.resident_id === res.id && v.date === curDateStr);
 const dayRecs = (db.data.care_records || []).filter(cr => !cr.voided && cr.resident_id === res.id && (cr.recorded_at || cr.record_time || "").startsWith(curDateStr));
 const recCount = dayRecs.length;
 const hasTokukan = dayRecs.some(cr => cr.category === "特変");
 const isHospitalized = (res.status === "入院中" && (!res.hospital_date || curDateStr >= res.hospital_date)); // [Claude修正] 入院日が未登録のとき仮の日付 2026-08-25 を使っていた

 let cellBg = isSelected ? "#dcebe3" : "#ffffff";
 let cellBorder = isSelected ? "2px solid #1e5b47" : "1px solid #dfe5e1";
 if (isHospitalized && !isSelected) cellBg = "#fffbeb";

 let dotsHtml = "";
 if (isHospitalized) {
 dotsHtml = `<span style="font-size:9.5px; background:#fef3c7; color:#92400e; padding:1px 3px; border-radius:3px; font-weight:bold;">入院中</span>`;
 } else {
 if (hasVital) dotsHtml += `<span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#1e5b47; margin:0 1px;" title="バイタル記録あり"></span>`;
 if (recCount > 0) dotsHtml += `<span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#16a34a; margin:0 1px;" title="介護記録 ${recCount}件"></span>`;
 if (hasTokukan) dotsHtml += `<span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#dc2626; margin:0 1px;" title="特変あり"></span>`;
 }

 let textColor = c === 0 ? "#dc2626" : (c === 6 ? "#1e5b47" : "#22302b");
 if (isSelected) textColor = "#1e5b47";

 html += `
 <td onclick="selectPersonalCalendarDate('${curDateStr}')" style="background:${cellBg}; border:${cellBorder}; cursor:pointer; vertical-align:top; padding:4px 2px; transition:background 0.15s;" onmouseover="if(!${isSelected})this.style.background='#eef2ef';" onmouseout="if(!${isSelected})this.style.background='${cellBg}';">
 <div style="font-size:12.5px; font-weight:${isSelected ? 'bold' : 'normal'}; color:${textColor};">${curDay}</div>
 <div style="margin-top:2px; min-height:12px; display:flex; justify-content:center; align-items:center; gap:2px;">
 ${dotsHtml}
 </div>
 </td>
 `;
 dayCounter++;
 }
 }
 html += `</tr>`;
 }

 html += `
 </tbody>
 </table>
 </div>
 `;

 container.innerHTML = html;
}

function changePersonalCalendarMonth(delta) {
 const currentYm = gState.personalCalendarYearMonth || (gState.selectedDate ? gState.selectedDate.slice(0, 7) : getTodayStr().slice(0, 7));
 const [yearStr, monthStr] = currentYm.split("-");
 let year = parseInt(yearStr, 10);
 let month = parseInt(monthStr, 10) + delta;

 if (month < 1) {
 month = 12;
 year -= 1;
 } else if (month > 12) {
 month = 1;
 year += 1;
 }

 gState.personalCalendarYearMonth = `${year}-${String(month).padStart(2, "0")}`;
 renderPersonalCalendar();
}

function jumpPersonalCalendarToday() {
 const today = getTodayStr();
 gState.personalCalendarYearMonth = today.slice(0, 7);
 selectPersonalCalendarDate(today);
}

function selectPersonalCalendarDate(dateStr) {
 gState.selectedDate = dateStr;
	updateRecordFormCustomTime();
 // [Antigravity実装 2026-10-16] recordScopeの値を "today" に統一し、ボタン表示も同期
 gState.recordScope = "today";
 const scopeBtn = document.getElementById("btnToggleRecordScope");
 if (scopeBtn) {
  scopeBtn.textContent = " すべての過去履歴を表示";
  scopeBtn.style.background = "#f0fdf4";
  scopeBtn.style.color = "#166534";
  scopeBtn.style.border = "1px solid #bbf7d0";
 }
 gState.personalCalendarYearMonth = dateStr.slice(0, 7);

 renderCalendar(); // 全体上部カレンダー同期
 renderSelectedDateRecords(); // 個人記録再描画
 if (typeof renderSingleWriteScreen === "function" && gState.activeCareTab === "write_single") renderSingleWriteScreen();
 if (gState.activeCareTab === "daily_journal") renderDailyJournal();
 if (gState.activeCareTab === "vitals") renderVitalsTable();
 if (gState.activeCareTab === "meal") renderMealsTable();
 if (gState.activeCareTab === "excretion") renderExcretionTable();
 if (gState.activeCareTab === "bath") renderBathTable();
}

// 当日の個人データ集約サマリーカード（血圧、体温、脈拍、SpO2、体重、食事、排泄、入浴、服薬）
function renderPersonalDailySummary(res, dateStr) {
 const area = document.getElementById("personalDailySummaryArea");
 if (!area) return;

 if (!res) {
 area.innerHTML = "";
 return;
 }

 const isHospitalized = (res.status === "入院中" && (!res.hospital_date || dateStr >= res.hospital_date));

 if (isHospitalized) {
 area.innerHTML = `
 <div style="background:#fef3c7; border:2px solid #f59e0b; border-radius:8px; padding:12px 16px; margin-bottom:12px;">
 <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
 <div style="display:flex; align-items:center; gap:8px;">
 <span style="font-size:22px;"></span>
 <div>
 <strong style="font-size:14.5px; color:#92400e;">【入院加療中】 ${escapeHtml(res.hospital_name || '入院先未登録')}</strong>
 <div style="font-size:12px; color:#b45309; margin-top:2px;">
 理由: <strong>${escapeHtml(res.hospital_reason || '未登録')}</strong> (入院開始: ${escapeHtml(res.hospital_date || '未登録')})
 </div>
 </div>
 </div>
 <span style="font-size:12px; background:#fff; border:1px solid #d97706; color:#b45309; padding:4px 12px; border-radius:12px; font-weight:bold;">施設外 入院継続</span>
 </div>
 <div style="font-size:12px; color:#78350f; margin-top:8px; line-height:1.5; background:rgba(255,255,255,0.7); padding:8px 12px; border-radius:6px;">
 ※病院にて加療中のため施設内での直接ケアは休止中です。病院連携・病状確認・リハビリ進捗・家族面談・退院受入調整は下記の個別カルテ記録に集約されています。
 </div>
 </div>
 `;
 return;
 }

 // 1. バイタル検索
 // [Claude修正 2026-10-16] 再測定があればいちばん新しい値を出し、測定回数も出す
 const vital = cpLatestVital(res.id, dateStr);
 const vitalCount = cpDayVitals(res.id, dateStr).length;

 // 2. 最新・当月の体重検索
 const weightRecords = (db.data.weight_records || []).filter(w => w.resident_id === res.id).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
 const exactWeight = weightRecords.find(w => w.date === dateStr);
 const latestWeight = exactWeight || weightRecords[0] || null;

 // 3. 食事検索
 // [Claude修正 2026-10-16] 取消・訂正で外した記録（voided）は数えない。おやつ・その他は1日に何件でもあるので全部出す
 const dayMeals = (db.data.meals || []).filter(m => !m.voided && m.resident_id === res.id && m.date === dateStr);
 const snacks = dayMeals.filter(m => m.meal_type === "おやつ");
 const others = dayMeals.filter(m => m.meal_type === "その他");
 const breakfast = dayMeals.find(m => m.meal_type === "朝食");
 const lunch = dayMeals.find(m => m.meal_type === "昼食");
 const dinner = dayMeals.find(m => m.meal_type === "夕食");
 const totalWater = dayMeals.reduce((sum, m) => sum + (m.water_ml || 0), 0);

 // 4. 排泄検索
 const dayExcretions = (db.data.excretions || []).filter(e => !e.voided && e.resident_id === res.id && e.date === dateStr);
 const urineCount = dayExcretions.filter(e => e.urine_flag).length;
 const stoolCount = dayExcretions.filter(e => e.stool_condition && e.stool_condition !== "なし").length;
 const stoolSample = dayExcretions.find(e => e.stool_condition && e.stool_condition !== "なし");

 // 5. 入浴検索
 const bath = (db.data.baths || []).find(b => !b.voided && b.resident_id === res.id && b.date === dateStr);

 // 6. 服薬・口腔ケア検索
 const dayMeds = (db.data.meds || []).filter(m => !m.voided && m.resident_id === res.id && m.date === dateStr);
 const dayOrals = (db.data.oral_cares || []).filter(o => !o.voided && o.resident_id === res.id && o.date === dateStr);

 // 血圧のハイライトスタイル
 let bpHtml = `<span style="color:#94a19a; font-size:12px;">未測定</span>`;
 if (vital && vital.bp_high !== null && vital.bp_low !== null) {
 const isHigh = vital.bp_high >= 145 || vital.bp_low >= 90;
 const bpColor = isHigh ? "#dc2626" : "#22302b";
 bpHtml = `<strong style="font-size:15px; color:${bpColor};">${vital.bp_high} / ${vital.bp_low}</strong> <span style="font-size:11px; color:#5f6d66;">mmHg</span>`;
 }

 // 体温のハイライトスタイル
 let tempHtml = `<span style="color:#94a19a; font-size:12px;">未測定</span>`;
 if (vital && vital.temperature !== null) {
 const isFever = vital.temperature >= 37.3;
 const tempColor = isFever ? "#dc2626" : "#22302b";
 tempHtml = `<strong style="font-size:15px; color:${tempColor};">${vital.temperature.toFixed(1)}</strong> <span style="font-size:11px; color:#5f6d66;">℃</span>`;
 }

 // 脈拍 & SpO2
 let pulseSpo2Html = `<span style="color:#94a19a; font-size:11px;">未測定</span>`;
 if (vital) {
 const pStr = vital.pulse ? `脈拍: <strong>${vital.pulse}</strong> bpm` : "";
 const sStr = vital.spo2 ? `SpO2: <strong>${vital.spo2}</strong> %` : "";
 pulseSpo2Html = [pStr, sStr].filter(Boolean).join(" | ");
 }

 // 体重表示
 let weightHtml = `<span style="color:#94a19a; font-size:12px;">未測定</span>`;
 if (latestWeight) {
 const isExact = exactWeight ? " (本日測定)" : ` [${latestWeight.date.slice(5)}測定]`;
 weightHtml = `<strong style="font-size:14px; color:#22302b;">${latestWeight.weight} kg</strong> <span style="font-size:11px; color:#5f6d66;">(${latestWeight.diff_prev || '前回比なし'})${isExact}</span>`;
 }

 area.innerHTML = `
 <div style="background:#ffffff; border:1px solid #cdd6d0; border-radius:8px; padding:12px 14px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
 <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:1px solid #eef2ef; padding-bottom:6px;">
 <span style="font-size:13.5px; font-weight:bold; color:#1e5b47; display:flex; align-items:center; gap:6px;">
 <span> 【${dateStr}】 個人記録・身体状況サマリー</span>
 </span>
 <button type="button" class="btn btn-secondary" style="font-size:11.5px; padding:2px 8px; color:#1e5b47; border-color:#a9cfbf; background:#f1f6f3;" onclick="openPersonalVitalModal()">
  バイタル・体重を変更/追記
 </button>
 </div>

 <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:10px;">
 <!-- 1. バイタル & 血圧 & 体重 -->
 <div style="background:#f6f8f6; border:1px solid #dfe5e1; border-radius:6px; padding:8px 10px;">
 <div style="font-size:11px; font-weight:bold; color:#4a5852; margin-bottom:4px; display:flex; justify-content:space-between;">
 <span>バイタル & 身体測定</span>
 <span style="font-size:10px; color:#5f6d66;">${vital ? (vital.time || '') : ''}${vitalCount > 1 ? `（本日${vitalCount}回測定・最新）` : ''}</span>
 </div>
 <div style="display:flex; flex-direction:column; gap:3px;">
 <div><span style="font-size:11.5px; color:#5f6d66;">血圧:</span> ${bpHtml}</div>
 <div><span style="font-size:11.5px; color:#5f6d66;">体温:</span> ${tempHtml}</div>
 <div style="font-size:11.5px; color:#36443e;">${pulseSpo2Html}</div>
 <div style="margin-top:2px; border-top:1px dashed #cdd6d0; padding-top:2px;">
 <span style="font-size:11.5px; color:#5f6d66;"> 体重:</span> ${weightHtml}
 </div>
 </div>
 </div>

 <!-- 2. 食事 & 水分 -->
 <div style="background:#f6f8f6; border:1px solid #dfe5e1; border-radius:6px; padding:8px 10px;">
 <div style="font-size:11px; font-weight:bold; color:#4a5852; margin-bottom:4px;">
 食事 ＆ 水分摂取
 </div>
 <div style="font-size:11.5px; color:#36443e; line-height:1.5;">
  <div>朝: ${cpFormatMealRatio(breakfast)}</div>
  <div>昼: ${cpFormatMealRatio(lunch)}</div>
  <div>夕: ${cpFormatMealRatio(dinner)}</div>
  ${snacks.length ? `<div>おやつ: ${snacks.map(m => cpFormatMealRatio(m)).join("・")}</div>` : ""}
  ${others.length ? `<div>その他（水分）: ${others.map(m => `${m.water_ml || 0}ml`).join("・")}</div>` : ""}
 <div style="margin-top:2px; border-top:1px dashed #cdd6d0; padding-top:2px; color:#1e5b47; font-weight:bold;">
 1日合計水分: ${totalWater} ml
 </div>
 </div>
 </div>

 <!-- 3. 排泄 & 入浴 -->
 <div style="background:#f6f8f6; border:1px solid #dfe5e1; border-radius:6px; padding:8px 10px;">
 <div style="font-size:11px; font-weight:bold; color:#4a5852; margin-bottom:4px;">
 排泄 ＆ 入浴
 </div>
 <div style="font-size:11.5px; color:#36443e; line-height:1.5;">
 ${dayExcretions.length === 0 ? `<div style="color:#94a19a;">排泄: 未記入</div>` : `<div>排尿: <strong>${urineCount}</strong> 回 | 排便: <strong>${stoolCount}</strong> 回</div>
 <div style="font-size:11px; color:#5f6d66;">便状態: ${stoolSample ? `${escapeHtml(stoolSample.stool_condition)}${stoolSample.stool_amount ? ` (${escapeHtml(stoolSample.stool_amount)})` : ""}` : (dayExcretions.some(e => e.stool_amount === "なし") ? "排便なし" : "未記入")}</div>`}
 <div style="margin-top:2px; border-top:1px dashed #cdd6d0; padding-top:2px;">
 入浴: ${bath ? `<strong style="color:#16a34a;">${escapeHtml(bath.bath_type || "")}${bath.bath_type === "見合わせ" ? "" : " 実施"}</strong> ${bath.ointment_notes ? `(${escapeHtml(bath.ointment_notes)})` : ''}` : '<span style="color:#94a19a;">本日入浴なし</span>'}
 </div>
 </div>
 </div>

 <!-- 4. 服薬 & 口腔ケア -->
 <div style="background:#f6f8f6; border:1px solid #dfe5e1; border-radius:6px; padding:8px 10px;">
 <div style="font-size:11px; font-weight:bold; color:#4a5852; margin-bottom:4px;">
 服薬確認 ＆ 口腔ケア
 </div>
 <div style="font-size:11.5px; color:#36443e; line-height:1.5;">
 <div>服薬: ${(() => { const ok = dayMeds.filter(m => (m.status || "済") === "済"); const ng = dayMeds.filter(m => m.status && m.status !== "済"); return (ok.length ? `<span style="color:#16a34a; font-weight:bold;">済 (${ok.map(m => escapeHtml(m.timing_key || m.slot)).join('・')})</span>` : '<span style="color:#94a19a;">未記録</span>') + (ng.length ? ` <span style="color:#b3261e; font-weight:bold;">${ng.map(m => escapeHtml((m.timing_key || m.slot) + ' ' + m.status)).join('・')}</span>` : ''); })()}</div>
 <div>口腔ケア: ${dayOrals.length > 0 ? `<span style="color:#16a34a; font-weight:bold;"> 実施済 (${dayOrals.length}回)</span>` : '<span style="color:#94a19a;">未記録</span>'}</div>
 <div style="font-size:11px; color:#5f6d66; margin-top:2px;">
 食形態: ${escapeHtml(res.diet_type || '未登録')}
 </div>
 </div>
 </div>
 </div>
 </div>
 `;
}

// 個人バイタル・体重編集モーダルのオープン
function openPersonalVitalModal(vitalId) {
 // [Claude修正 2026-10-16] 記録を指定したときはその記録の訂正、指定がなければ新しい測定（再測定）の入力
 const target = vitalId ? (db.data.vitals || []).find(v => Number(v.id) === Number(vitalId) && !v.voided) : null;
 window._cpPvmTargetId = target ? target.id : null;
 const res = target ? gState.residents.find(x => Number(x.id) === Number(target.resident_id)) : gState.residents.find(x => x.id === gState.selectedResidentId);
 if (!res) {
 alert("利用者が選択されていません。");
 return;
 }

 const dt = target ? target.date : (gState.selectedDate || getTodayStr());

 document.getElementById("personalVitalModalResidentName").textContent = `${res.room_no}号室 ${res.name} 様`;
 document.getElementById("personalVitalModalDate").textContent = `${dt} (${getWeekDayJp(dt)})${target ? `　${target.time || ""} の測定を訂正` : "　新しい測定"}`;
 document.getElementById("personalVitalDate").value = dt;
 document.getElementById("personalVitalResidentId").value = res.id;

 // 既存データ事前充填
 const vital = target;
 const weightRec = (db.data.weight_records || []).find(w => w.resident_id === res.id && w.date === dt);

 document.getElementById("pvmTemp").value = (vital && vital.temperature !== null) ? vital.temperature : "";
 document.getElementById("pvmPulse").value = (vital && vital.pulse !== null) ? vital.pulse : "";
 document.getElementById("pvmBpHigher").value = (vital && vital.bp_high !== null) ? vital.bp_high : "";
 document.getElementById("pvmBpLower").value = (vital && vital.bp_low !== null) ? vital.bp_low : "";
 document.getElementById("pvmSpo2").value = (vital && vital.spo2 !== null) ? vital.spo2 : "";
 document.getElementById("pvmWeight").value = weightRec ? weightRec.weight : "";
 document.getElementById("pvmNotes").value = (vital && vital.notes) ? vital.notes : "";

 document.getElementById("personalVitalModal").style.display = "flex";
}

// [Claude修正] 「いつもと違う」の判定（項目ごとに、個別注意基準値があればそれを、なければ共通の値を使う）
// 共通の値（血圧150以上・体温37.5℃以上・SpO2 92%以下）はサンプル。看護師と決めた値ではない
function cpIsUnusualVital(res, v) {
 const r = res || {};
 const has = x => x !== null && x !== undefined && x !== "" && !isNaN(Number(x));
 const n = x => Number(x);
 if (has(v.temperature)) {
 if (has(r.temp_max) ? n(v.temperature) > n(r.temp_max) : n(v.temperature) >= 37.5) return 1;
 }
 if (has(v.bp_high)) {
 if (has(r.bp_high_max) ? n(v.bp_high) > n(r.bp_high_max) : n(v.bp_high) >= 150) return 1;
 if (has(r.bp_high_min) && n(v.bp_high) < n(r.bp_high_min)) return 1;
 }
 if (has(v.spo2)) {
 if (has(r.spo2_min) ? n(v.spo2) < n(r.spo2_min) : n(v.spo2) <= 92) return 1;
 }
 if (has(v.pulse)) {
 if (has(r.pulse_max) && n(v.pulse) > n(r.pulse_max)) return 1;
 if (has(r.pulse_min) && n(v.pulse) < n(r.pulse_min)) return 1;
 }
 return 0;
}

// 個人バイタル・体重編集モーダルの保存（全体連動） [Antigravity実装 2026-10-16]
function submitPersonalVitalModal() {
 const resId = parseInt(document.getElementById("personalVitalResidentId").value, 10);
 const dt = document.getElementById("personalVitalDate").value;
 const staff = cpLedgerStaff();

 const tempVal = normalizeTempValue(document.getElementById("pvmTemp").value);
 const pulseVal = document.getElementById("pvmPulse").value;
 const bpHighVal = document.getElementById("pvmBpHigher").value;
 const bpLowVal = document.getElementById("pvmBpLower").value;
 const spo2Val = document.getElementById("pvmSpo2").value;
 const weightVal = document.getElementById("pvmWeight").value;
 const notesVal = document.getElementById("pvmNotes").value.trim();

 if (!tempVal && !bpHighVal && !bpLowVal && !pulseVal && !spo2Val && !weightVal && !notesVal) {
  alert("バイタルまたは体重のいずれかを入力してください。");
  return;
 }

 if (!Array.isArray(db.data.vitals)) db.data.vitals = [];
 if (!Array.isArray(db.data.weight_records)) db.data.weight_records = [];

 const existingVital = window._cpPvmTargetId ? db.data.vitals.find(v => !v.voided && Number(v.id) === Number(window._cpPvmTargetId)) : null;
 const existingWeight = db.data.weight_records.find(w => !w.voided && w.resident_id === resId && w.date === dt);

 const newTemp = tempVal ? parseFloat(tempVal) : null;
 const newBpH = bpHighVal ? parseInt(bpHighVal, 10) : null;
 const newBpL = bpLowVal ? parseInt(bpLowVal, 10) : null;
 const newPulse = pulseVal ? parseInt(pulseVal, 10) : null;
 const newSpo2 = spo2Val ? parseInt(spo2Val, 10) : null;
 const newWeight = weightVal ? parseFloat(weightVal) : null;

 const vitalChanged = existingVital && (
  (existingVital.temperature ?? null) !== newTemp ||
  (existingVital.bp_high ?? null) !== newBpH ||
  (existingVital.bp_low ?? null) !== newBpL ||
  (existingVital.pulse ?? null) !== newPulse ||
  (existingVital.spo2 ?? null) !== newSpo2 ||
  (existingVital.notes || "") !== notesVal
 );
 const weightChanged = existingWeight && newWeight !== null && (existingWeight.weight ?? null) !== newWeight;

 let editReason = null;
 if (vitalChanged || weightChanged) {
  editReason = cpPromptEditReason("バイタル・体重記録", existingVital ? cpFormatVitalBrief(existingVital) : `体重 ${existingWeight ? existingWeight.weight + 'kg' : ''}`);
  if (editReason === null) return;
 }

 // [Claude修正] バイタルに空欄の項目があれば、保存してよいか確認する
 const blankLabels = [];
 if (!tempVal) blankLabels.push("体温");
 if (!bpHighVal) blankLabels.push("最高血圧");
 if (!bpLowVal) blankLabels.push("最低血圧");
 if (!pulseVal) blankLabels.push("脈拍");
 if (!spo2Val) blankLabels.push("SpO2");
 if ((tempVal || bpHighVal || bpLowVal || pulseVal || spo2Val) && blankLabels.length > 0 && !confirm(`次の項目が空欄です。\n${blankLabels.join("、")}\n\nこのまま保存しますか？`)) return;

 const nowTime = new Date().toTimeString().slice(0, 5);
 const pvmRes = ((gState && gState.residents) || (db.data.residents || [])).find(x => x.id === resId);

 // バイタル更新または追加（既存のidを保ったまま書き換える）
 if (existingVital && vitalChanged) {
  const oldCopy = JSON.parse(JSON.stringify(existingVital));
  existingVital.time = nowTime;
  existingVital.temperature = newTemp;
  existingVital.bp_high = newBpH;
  existingVital.bp_low = newBpL;
  existingVital.pulse = newPulse;
  existingVital.spo2 = newSpo2;
  existingVital.notes = notesVal;
  existingVital.is_unusual = cpIsUnusualVital(pvmRes, existingVital);
  existingVital.staff_name = staff;
  cpAppendEditHistory(existingVital, oldCopy, ["time", "temperature", "bp_high", "bp_low", "pulse", "spo2", "is_unusual", "notes"], editReason);
 } else if (!existingVital && !window._cpPvmTargetId && (tempVal || bpHighVal || bpLowVal || pulseVal || spo2Val || notesVal)) {
  const vitalObj = {
   id: Date.now(),
   date: dt,
   time: nowTime,
   resident_id: resId,
   temperature: newTemp,
   bp_high: newBpH,
   bp_low: newBpL,
   pulse: newPulse,
   spo2: newSpo2,
   is_unusual: 0,
   staff_name: staff,
   notes: notesVal
  };
  vitalObj.is_unusual = cpIsUnusualVital(pvmRes, vitalObj);
  db.data.vitals.push(vitalObj);
 }

 // 体重更新または追加（既存のidを保ったまま書き換える）
 if (newWeight !== null) {
  const prevWeightObj = db.data.weight_records
   .filter(w => !w.voided && w.resident_id === resId && w.date < dt)
   .sort((a, b) => b.date.localeCompare(a.date))[0];

  let diffStr = "±0.0kg";
  if (prevWeightObj && prevWeightObj.weight) {
   const d = (newWeight - prevWeightObj.weight).toFixed(1);
   diffStr = d >= 0 ? `+${d}kg` : `${d}kg`;
  }

  if (existingWeight && weightChanged) {
   const oldW = JSON.parse(JSON.stringify(existingWeight));
   existingWeight.weight = newWeight;
   existingWeight.diff_prev = diffStr;
   existingWeight.staff_name = staff;
   cpAppendEditHistory(existingWeight, oldW, ["weight", "diff_prev"], editReason);
  } else if (!existingWeight) {
   db.data.weight_records.push({
    id: Date.now() + 5,
    date: dt,
    month: dt.slice(0, 7),
    resident_id: resId,
    weight: newWeight,
    diff_prev: diffStr,
    staff_name: staff
   });
  }
 }

 db.save();
 closeModal("personalVitalModal");

 loadDateRecords(dt);
 if (typeof renderWeightTable === "function") renderWeightTable();
 if (typeof renderWeightChart === "function") renderWeightChart();

 alert("バイタル・身体測定を保存しました！各画面に連動反映されました。");
}

// 区分に応じたバッジ装飾スタイル（日誌・個別カルテ共通） [Antigravity実装 2026-10-16]
function getCategoryBadgeStyle(cat) {
 if (cat === "特変") return "background:#fee2e2; color:#991b1b; font-weight:bold; border:1px solid #fca5a5;";
 if (cat === "連絡") return "background:#fef9c3; color:#854d0e; font-weight:bold; border:1px solid #fde047;";
 if (cat === "看護") return "background:#dcfce7; color:#166534; font-weight:bold; border:1px solid #bbf7d0;";
 if (cat === "リハビリ") return "background:#ede9fe; color:#6b21a8; font-weight:bold; border:1px solid #ddd6fe;";
 if (cat === "家族") return "background:#ffedd5; color:#c2410c; font-weight:bold; border:1px solid #fed7aa;";
 if (cat === "巡視" || cat === "体位変換") return "background:#eef2ef; color:#4a5852; border:1px solid #cdd6d0;";
 if (cat === "バイタル") return "background:#fef3c7; color:#92400e; border:1px solid #fde68a;";
 if (cat === "食事・水分") return "background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd;";
 if (cat === "排泄") return "background:#fefce8; color:#854d0e; border:1px solid #fef08a;";
 if (cat === "入浴") return "background:#ecfeff; color:#0e7490; border:1px solid #a5f3fc;";
 if (cat === "服薬" || cat === "頓服服用") return "background:#f3e8ff; color:#6b21a8; border:1px solid #e9d5ff;";
 return "background:#e0f2fe; color:#0369a1; border:1px solid #c9e0d5;"; // 介護・デフォルト
}

// [Antigravity実装 2026-10-16] その人の記録（食事・水分・排泄・バイタル・体位変換・入浴・様子など）を日付と時間の順に1本に並べる共通関数
function cpDefaultMealTime(mealType) {
 if (mealType === "朝食") return "08:00";
 if (mealType === "昼食") return "12:00";
 if (mealType === "おやつ") return "15:00";
 if (mealType === "夕食") return "18:00";
 return "10:00";
}

function cpBuildUnifiedResidentRecords(resId, targetDate, isAllScope) {
 if (!resId) return [];
 const items = [];
 const matchDate = (d) => isAllScope ? Boolean(d) : (d === targetDate);

 // 1. 様子・経過記録 (care_records)
 (db.data.care_records || []).forEach(r => {
  if (r.resident_id !== resId) return;
  // 体位変換から自動生成された「巡視」は turns 側と重複するため除外（ただし手動記録や特変は残す）
  if (r.auto_night_turn && r.category === "巡視") return;
  const dtStr = r.recorded_at || r.record_time || "";
  const dPart = dtStr.slice(0, 10);
  if (!matchDate(dPart)) return;
  items.push({
   uid: `care_${r.id}`,
   raw_id: r.id,
   source_type: "care_records",
   recorded_at: dtStr.length === 10 ? `${dtStr} 00:00` : dtStr,
   date: dPart,
   category: r.category || "介護",
   content: r.content || "",
   staff_name: r.staff_name || "未記録",
   voided: Boolean(r.voided),
   voided_at: r.voided_at,
   voided_by: r.voided_by,
   void_reason: r.void_reason,
   edit_history: r.edit_history,
   void_history: r.void_history,
   raw: r
  });
 });

 // 2. バイタル (vitals)
 (db.data.vitals || []).forEach(v => {
  if (v.resident_id !== resId || v.voided) return;
  if (!matchDate(v.date)) return;
  const tm = v.time || "09:00";
  items.push({
   uid: `vital_${v.id}`,
   raw_id: v.id,
   source_type: "vitals",
   recorded_at: `${v.date} ${tm}`,
   date: v.date,
   category: "バイタル",
   content: cpFormatVitalBrief(v) + (v.notes ? ` （${v.notes}）` : ""),
   staff_name: v.staff_name || "未記録",
   edit_history: v.edit_history,
   raw: v
  });
 });

 // 3. 食事・水分 (meals)
 (db.data.meals || []).forEach(m => {
  if (m.resident_id !== resId || m.voided) return;
  if (!matchDate(m.date)) return;
  const tm = m.time || cpDefaultMealTime(m.meal_type);
  items.push({
   uid: `meal_${m.id}`,
   raw_id: m.id,
   source_type: "meals",
   recorded_at: `${m.date} ${tm}`,
   date: m.date,
   category: "食事・水分",
   content: cpFormatMealDetail(m),
   staff_name: m.staff_name || "未記録",
   edit_history: m.edit_history,
   raw: m
  });
 });

 // 4. 排泄 (excretions)
 (db.data.excretions || []).forEach(e => {
  if (e.resident_id !== resId || e.voided) return;
  if (!matchDate(e.date)) return;
  const tm = e.time || "10:00";
  items.push({
   uid: `exc_${e.id}`,
   raw_id: e.id,
   source_type: "excretions",
   recorded_at: `${e.date} ${tm}`,
   date: e.date,
   category: "排泄",
   content: cpFormatExcretionDetail(e),
   staff_name: e.staff_name || "未記録",
   edit_history: e.edit_history,
   raw: e
  });
 });

 // 5. 入浴 (baths)
 (db.data.baths || []).forEach(b => {
  if (b.resident_id !== resId || b.voided) return;
  if (!matchDate(b.date)) return;
  const tm = b.time || "14:00";
  items.push({
   uid: `bath_${b.id}`,
   raw_id: b.id,
   source_type: "baths",
   recorded_at: `${b.date} ${tm}`,
   date: b.date,
   category: "入浴",
   content: cpFormatBathDetail(b),
   staff_name: b.staff_name || "未記録",
   edit_history: b.edit_history,
   raw: b
  });
 });

 // 6. 体位変換・夜間巡視 (turns)
 (db.data.turns || []).forEach(t => {
  if (t.resident_id !== resId || t.voided) return;
  if (!matchDate(t.date)) return;
  const tm = t.time || "00:00";
  items.push({
   uid: `turn_${t.id}`,
   raw_id: t.id,
   source_type: "turns",
   recorded_at: `${t.date} ${tm}`,
   date: t.date,
   category: "体位変換",
   content: `【${tm} 体位変換・巡視】${t.action || ""}${t.note ? " 【様子】" + t.note : ""}`,
   staff_name: t.staff_name || "未記録",
   edit_history: t.edit_history,
   raw: t
  });
 });

 // 7. 服薬 (meds)
 (db.data.meds || []).forEach(m => {
  if (m.resident_id !== resId || m.voided) return;
  if (!matchDate(m.date)) return;
  const label = m.timing_key || m.slot || "服薬";
  const tm = m.actual_time || m.recorded_time || (typeof cpRxSlotTime === "function" ? cpRxSlotTime(label) : "08:00");
  items.push({
   uid: `med_${m.id}`,
   raw_id: m.id,
   source_type: "meds",
   recorded_at: `${m.date} ${tm}`,
   date: m.date,
   category: "服薬",
   content: `【${label}】${m.status || "済"}${m.medicine_name ? " (" + m.medicine_name + ")" : ""}${m.note ? " " + m.note : ""}`,
   staff_name: m.staff_name || "未記録",
   edit_history: m.edit_history,
   raw: m
  });
 });

 // 8. 口腔ケア (oral_cares)
 (db.data.oral_cares || []).forEach(o => {
  if (o.resident_id !== resId || o.voided) return;
  if (!matchDate(o.date)) return;
  const tm = o.time || "08:30";
  const slots = [];
  if (o.morning) slots.push("朝");
  if (o.noon) slots.push("昼");
  if (o.evening) slots.push("夕");
  if (o.bedtime) slots.push("眠前");
  const detail = slots.length ? `実施 (${slots.join("・")})` : (o.status || "実施済");
  items.push({
   uid: `oral_${o.id}`,
   raw_id: o.id,
   source_type: "oral_cares",
   recorded_at: `${o.date} ${tm}`,
   date: o.date,
   category: "口腔ケア",
   content: `口腔ケア ${detail}${o.denture_cleaned ? "・義歯洗浄済" : ""}${o.mucosa_status ? " (" + o.mucosa_status + ")" : ""}${o.notes ? " " + o.notes : ""}`,
   staff_name: o.staff_name || "未記録",
   edit_history: o.edit_history,
   raw: o
  });
 });

 // 日付と時間の順（新しい順）に1本に並べる
 items.sort((a, b) => (b.recorded_at || "").localeCompare(a.recorded_at || ""));
 return items;
}

// [Antigravity実装 2026-10-16] 統合タイムライン上の各記録カードに対する操作ボタン（訂正・履歴表示）
function cpUnifiedRecordActions(item) {
 if (item.source_type === "care_records") {
  return cpCareRecordActions(item.raw);
 }
 const histCount = (item.edit_history && item.edit_history.length) ? item.edit_history.length : 0;
 const histBtn = histCount > 0
  ? `<button type="button" class="btn btn-secondary" style="font-size:11px; padding:2px 8px; border:1px solid #cdd6d0;" onclick="cpShowGenericEditHistory('${item.source_type}', ${Number(item.raw_id)})">履歴(訂正${histCount})</button>`
  : "";
 let editBtn = "";
 if (item.source_type === "vitals") {
  editBtn = `<button type="button" class="btn btn-secondary" style="font-size:11px; padding:2px 8px; border:1px solid #cdd6d0;" onclick="openPersonalVitalModal(${Number(item.raw_id)})">訂正</button>`;
 } else if (item.source_type === "meals") {
  editBtn = `<button type="button" class="btn btn-secondary" style="font-size:11px; padding:2px 8px; border:1px solid #cdd6d0;" onclick="cpQuickEditMealRecord(${Number(item.raw_id)})">訂正</button>`;
 } else if (item.source_type === "excretions") {
  editBtn = `<button type="button" class="btn btn-secondary" style="font-size:11px; padding:2px 8px; border:1px solid #cdd6d0;" onclick="editExcretionRecord(${Number(item.raw_id)})">訂正</button>`;
 } else if (item.source_type === "baths") {
  editBtn = `<button type="button" class="btn btn-secondary" style="font-size:11px; padding:2px 8px; border:1px solid #cdd6d0;" onclick="cpQuickEditBathRecord(${Number(item.raw_id)})">訂正</button>`;
 } else if (item.source_type === "turns") {
  editBtn = `<button type="button" class="btn btn-secondary" style="font-size:11px; padding:2px 8px; border:1px solid #cdd6d0;" onclick="editSavedNightTurn(${Number(item.raw_id)})">訂正</button>`;
 }
 return `${editBtn}${histBtn}`;
}

function cpShowGenericEditHistory(sourceType, rawId) {
 const arr = db.data[sourceType] || [];
 const rec = arr.find(x => Number(x.id) === Number(rawId));
 if (!rec || !rec.edit_history || !rec.edit_history.length) {
  alert("訂正の履歴はありません。");
  return;
 }
 const lines = rec.edit_history.map((h, i) => {
  const beforeStr = h.before ? Object.entries(h.before).map(([k, v]) => `${k}: ${v ?? "空"}`).join(", ") : "";
  return `■ 訂正${i + 1}: ${h.edited_at || ""} (${h.edited_by || "未記録"})\n理由: ${h.reason || "記載なし"}\n変更前: ${beforeStr}`;
 });
 alert(`【訂正の履歴】\n\n${lines.join("\n\n")}`);
}

function cpQuickEditMealRecord(mealId) {
 const m = (db.data.meals || []).find(x => Number(x.id) === Number(mealId));
 if (!m || m.voided) return;
 const res = gState.residents.find(r => r.id === m.resident_id);
 const type = m.meal_type || "朝食";
 let newMain = m.main_dish_ratio;
 let newSide = m.side_dish_ratio;
 if (type !== "その他") {
  const mainIn = prompt(`【${res ? res.name + " 様" : ""} ${type}】主食の量(0〜10割)を入力してください:`, m.main_dish_ratio ?? "");
  if (mainIn === null) return;
  newMain = mainIn.trim() !== "" && !isNaN(parseInt(mainIn, 10)) ? parseInt(mainIn, 10) : null;
 }
 if (type !== "おやつ" && type !== "その他") {
  const sideIn = prompt(`【${res ? res.name + " 様" : ""} ${type}】副食の量(0〜10割)を入力してください:`, m.side_dish_ratio ?? "");
  if (sideIn === null) return;
  newSide = sideIn.trim() !== "" && !isNaN(parseInt(sideIn, 10)) ? parseInt(sideIn, 10) : null;
 }
 const waterIn = prompt(`【${res ? res.name + " 様" : ""} ${type}】水分量(ml)を入力してください:`, m.water_ml ?? 0);
 if (waterIn === null) return;
 const newWater = waterIn.trim() !== "" && !isNaN(parseInt(waterIn, 10)) ? parseInt(waterIn, 10) : 0;

 if ((m.main_dish_ratio ?? null) === newMain && (m.side_dish_ratio ?? null) === newSide && (m.water_ml ?? 0) === newWater) {
  alert("変更された内容がありません。");
  return;
 }
 const reason = cpPromptEditReason(`${type}の記録`, cpFormatMealDetail(m));
 if (reason === null) return;
 const oldCopy = JSON.parse(JSON.stringify(m));
 m.main_dish_ratio = newMain;
 m.side_dish_ratio = newSide;
 m.water_ml = newWater;
 m.time = new Date().toTimeString().slice(0, 5);
 m.staff_name = cpLedgerStaff();
 cpAppendEditHistory(m, oldCopy, ["main_dish_ratio", "side_dish_ratio", "water_ml", "time"], reason);
 db.save();
 loadDateRecords(gState.selectedDate);
 alert(`${type}の記録を訂正しました。`);
}

function cpQuickEditBathRecord(bathId) {
 const b = (db.data.baths || []).find(x => Number(x.id) === Number(bathId));
 if (!b || b.voided) return;
 const res = gState.residents.find(r => r.id === b.resident_id);
 const newType = prompt(`【${res ? res.name + " 様" : ""}】入浴方法を変更してください (一般浴 / 特浴 / 清拭 / 見合わせ):`, b.bath_type || "");
 if (newType === null || !newType.trim()) return;
 const newNotes = prompt(`処置・軟膏・様子を入力してください:`, b.ointment_notes || "");
 if (newNotes === null) return;
 if (newType.trim() === (b.bath_type || "") && newNotes.trim() === (b.ointment_notes || "")) {
  alert("変更された内容がありません。");
  return;
 }
 const reason = cpPromptEditReason("入浴記録", cpFormatBathDetail(b));
 if (reason === null) return;
 const oldCopy = JSON.parse(JSON.stringify(b));
 b.bath_type = newType.trim();
 b.ointment_notes = newNotes.trim();
 b.time = new Date().toTimeString().slice(0, 5);
 b.staff_name = cpLedgerStaff();
 cpAppendEditHistory(b, oldCopy, ["bath_type", "ointment_notes", "time"], reason);
 db.save();
 loadDateRecords(gState.selectedDate);
 alert("入浴記録を訂正しました。");
}

// 選択中利用者の個別介護記録一覧表示 (見る画面：すべての種類の記録を日付と時間の順に1本に並べる) [Antigravity実装 2026-10-16]
function renderSelectedDateRecords() {
 const list = document.getElementById("selectedDateRecordsList");
 if (!list) return;
 const titleEl = document.getElementById("selectedDateRecordsTitle");
 const res = gState.residents.find(x => x.id === gState.selectedResidentId);
 const resName = res ? `${res.room_no}号室 ${res.name} 様` : "利用者未指定";

 const dateBadge = document.getElementById("personalSelectedDateBadge");
 if (dateBadge) {
  dateBadge.textContent = `${gState.selectedDate} (${getWeekDayJp(gState.selectedDate)})`;
 }

 const isAllScope = gState.recordScope === "all";
 if (titleEl) {
  titleEl.textContent = isAllScope
   ? ` 【${resName}】の個別記録（見る） (年月別アーカイブ)`
   : ` 【${resName}】の個別記録（見る）`;
 }

 // 1. 個人記録カレンダーを描画
 renderPersonalCalendar();

 // 2. 当日の個人データ集約サマリーカードを描画
 if (!isAllScope) {
  renderPersonalDailySummary(res, gState.selectedDate);
 } else {
  const summaryArea = document.getElementById("personalDailySummaryArea");
  if (summaryArea) summaryArea.innerHTML = "";
 }

 list.innerHTML = "";

 // 選択中利用者の全種類の記録を日付と時間の順に統合
 const allUserRecords = cpBuildUnifiedResidentRecords(gState.selectedResidentId, gState.selectedDate, true);
 const records = isAllScope
  ? allUserRecords
  : cpBuildUnifiedResidentRecords(gState.selectedResidentId, gState.selectedDate, false);

 if (records.length === 0) {
  if (!isAllScope && allUserRecords.length > 0) {
   list.innerHTML = `
   <div style="padding:20px; text-align:center; background:#f6f8f6; border-radius:6px; border:1px dashed #cdd6d0;">
   <p style="font-size:14px; color:#5f6d66; margin-bottom:8px;">【${escapeHtml(gState.selectedDate)}】の記録はまだ登録されていません。</p>
   <p style="font-size:13px; color:#1e5b47; margin-bottom:12px;">（※この利用者様には過去の記録が計 ${allUserRecords.length} 件あります）</p>
   <div style="display:flex; gap:8px; justify-content:center; flex-wrap:wrap;">
    <button type="button" class="btn btn-secondary" style="font-size:12px; background:#f1f6f3; color:#1a4f3d; border:1px solid #a9cfbf;" onclick="toggleRecordScope()">
     すべての過去履歴を表示する
    </button>
    <button type="button" class="btn btn-primary" style="font-size:12px;" onclick="switchCareTab('write_single')">
     経過記録へ
    </button>
   </div>
   </div>
   `;
  } else {
   list.innerHTML = '<p style="font-size:14px; color:var(--text-muted); padding:20px; text-align:center;">この利用者様の記録はありません。</p>';
  }
  return;
 }

 // レコード単体の描画ヘルパー関数
 const createRecordItem = (r) => {
  const item = document.createElement("div");
  item.className = "care-record-card";

  const catBadgeStyle = getCategoryBadgeStyle(r.category);

  const timeDisplay = r.recorded_at || "時間未記録";
  const rawContent = r.content || "";
  const charLen = rawContent.length;
  const isLong = charLen > 400;
  const expandKey = r.uid || r.id;
  const isExpanded = gExpandedRecordIds.has(expandKey);

  let displayContent = rawContent;
  let toggleBtnHtml = "";
  if (isLong && !isExpanded) {
   displayContent = rawContent.slice(0, 300) + "……";
   toggleBtnHtml = `<button type="button" class="btn btn-secondary" style="font-size:12px; padding:3px 10px; margin-top:6px; align-self:flex-start;" onclick="toggleRecordExpand('${expandKey}')"> 全文を表示 (${charLen}文字)</button>`;
  } else if (isLong && isExpanded) {
   toggleBtnHtml = `<button type="button" class="btn btn-secondary" style="font-size:12px; padding:3px 10px; margin-top:6px; align-self:flex-start;" onclick="toggleRecordExpand('${expandKey}')">▲ 一部を折りたたむ</button>`;
  }

  item.innerHTML = `
  <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
  <div style="display:flex; align-items:center; gap:8px;">
  <span style="font-size:12px; padding:3px 8px; border-radius:4px; ${catBadgeStyle}">［${escapeHtml(r.category || '介護記録')}］</span>
  <strong style="font-size:14px; color:#22302b;">${escapeHtml(resName)}</strong>
  ${isLong ? `<span style="font-size:11px; background:#eef2ef; color:#4a5852; padding:2px 6px; border-radius:10px;">(${charLen}字)</span>` : ''}
  </div>
  <div style="display:flex; align-items:center; gap:6px;">
  <span style="font-size:12px; color:var(--text-muted);">${escapeHtml(timeDisplay)} (記録者: ${escapeHtml(r.staff_name || '未記録')})</span>
  ${cpUnifiedRecordActions(r)}
  </div>
  </div>
  <div class="care-record-body" style="${r.voided ? 'text-decoration:line-through; color:#94a19a;' : ''}">${escapeHtml(displayContent)}</div>
  ${toggleBtnHtml}
  `;
  return item;
 };

 // 全履歴表示（isAllScope）の場合は年月別アコーディオンでグループ化
 if (isAllScope) {
  const monthGroups = {};
  allUserRecords.forEach(r => {
   const timeStr = r.recorded_at || "";
   const ym = timeStr.slice(0, 7) || "その他";
   if (!monthGroups[ym]) monthGroups[ym] = [];
   monthGroups[ym].push(r);
  });

  const ymList = Object.keys(monthGroups).sort().reverse(); // 新しい月順

  if (!gMonthAccordionInited && ymList.length > 0) {
   gOpenMonthAccordions.add(ymList[0]);
   gMonthAccordionInited = true;
  }

  const filterBar = document.createElement("div");
  filterBar.style.cssText = "display:flex; gap:6px; margin-bottom:12px; flex-wrap:wrap; align-items:center;";
  filterBar.innerHTML = `
  <span style="font-size:12px; font-weight:bold; color:#4a5852; margin-right:4px;">月別表示:</span>
  <button type="button" class="btn btn-secondary" style="font-size:11px; padding:3px 9px; ${gSelectedHistoryMonth === 'all' ? 'background:#1a4f3d; color:#fff; font-weight:bold;' : ''}" onclick="filterHistoryMonth('all')">すべて (計${allUserRecords.length}件)</button>
  ${ymList.map(ym => {
   const parts = ym.split("-");
   const label = parts.length === 2 ? `${parts[0]}年${parseInt(parts[1])}月 (${monthGroups[ym].length}件)` : ym;
   const active = gSelectedHistoryMonth === ym;
   return `<button type="button" class="btn btn-secondary" style="font-size:11px; padding:3px 9px; ${active ? 'background:#1a4f3d; color:#fff; font-weight:bold;' : ''}" onclick="filterHistoryMonth('${ym}')">${label}</button>`;
  }).join("")}
  `;
  list.appendChild(filterBar);

  ymList.forEach(ym => {
   if (gSelectedHistoryMonth !== "all" && gSelectedHistoryMonth !== ym) return;

   const parts = ym.split("-");
   const ymTitle = parts.length === 2 ? `${parts[0]}年${parseInt(parts[1])}月` : ym;
   const mRecs = monthGroups[ym];
   const isOpen = gOpenMonthAccordions.has(ym);

   const accordionContainer = document.createElement("div");
   accordionContainer.style.cssText = "margin-bottom:12px; border:1px solid #dfe5e1; border-radius:6px; overflow:hidden; background:#fff;";

   const header = document.createElement("div");
   header.style.cssText = "display:flex; justify-content:space-between; align-items:center; background:#f6f8f6; padding:10px 14px; cursor:pointer; user-select:none; border-left:4px solid #3d8a6e; transition:background 0.2s;";
   header.onmouseover = () => header.style.background = "#eef2ef";
   header.onmouseout = () => header.style.background = "#f6f8f6";
   header.onclick = () => toggleMonthAccordion(ym);

   header.innerHTML = `
   <div style="display:flex; align-items:center; gap:8px;">
   <span style="font-size:14px; font-weight:bold; color:#173f33;"> ${ymTitle}</span>
   <span style="font-size:11px; background:#f1f6f3; color:#1a4f3d; padding:2px 8px; border-radius:10px; font-weight:bold;">${mRecs.length} 件</span>
   </div>
   <span style="font-size:12px; color:#5f6d66; font-weight:bold;">
   ${isOpen ? '▲ 折りたたむ' : '▼ 展開して表示'}
   </span>
   `;
   accordionContainer.appendChild(header);

   if (isOpen) {
    const body = document.createElement("div");
    body.style.cssText = "padding:10px; background:#ffffff; border-top:1px solid #dfe5e1;";
    mRecs.forEach(r => {
     body.appendChild(createRecordItem(r));
    });
    accordionContainer.appendChild(body);
   }

   list.appendChild(accordionContainer);
  });

 } else {
  records.forEach(r => {
   list.appendChild(createRecordItem(r));
  });
 }
}

// 選択中利用者の個別カルテ記録を印刷 [Antigravity実装 2026-10-16]
function printSelectedDateRecords() {
 const res = gState.residents.find(x => x.id === gState.selectedResidentId);
 const resName = res ? `${res.room_no}号室 ${res.name} 様` : "利用者未指定";

 const isAllScope = gState.recordScope === "all";
 const records = cpBuildUnifiedResidentRecords(gState.selectedResidentId, gState.selectedDate, isAllScope);

 if (records.length === 0) {
  alert(`【${resName}】の対象記録はありません。印刷するデータがありません。`);
  return;
 }

 const printArea = document.getElementById("printArea");
 if (!printArea) {
  alert("印刷コンテナが見つかりません。");
  return;
 }

 const staffName = document.getElementById("currentStaff").value || "未記録";
 const nowStr = new Date().toLocaleString("ja-JP");

 let recordsHtml = records.map((r, idx) => {
  const timeDisplay = r.recorded_at || "時間未記録";
  return `
  <div style="margin-bottom:18px; border:1px solid #cdd6d0; border-radius:6px; padding:12px; page-break-inside:avoid; background:#fff;">
  <div style="display:flex; justify-content:space-between; border-bottom:1px solid #dfe5e1; padding-bottom:6px; margin-bottom:8px; font-size:13px;">
  <div>
  <span style="font-weight:bold; background:#dfe5e1; padding:2px 6px; border-radius:3px;">#${idx + 1} ［${escapeHtml(r.category || '介護記録')}］</span>
  <strong style="font-size:15px; margin-left:8px;">${escapeHtml(resName)}</strong>
  </div>
  <div style="color:#5f6d66;">
  <span>日時: ${escapeHtml(timeDisplay)}</span>
  <span style="margin-left:12px;">記録者: ${escapeHtml(r.staff_name || '未記録')}</span>
  </div>
  </div>
  <div style="white-space:pre-wrap; font-size:13.5px; line-height:1.7; color:#22302b; padding:4px 2px;">
${cpCareRecordPrintNote(r)}${escapeHtml(r.content || '')}
  </div>
  </div>
  `;
 }).join("");

 printArea.innerHTML = `
 <div style="font-family:'Hiragino Kaku Gothic ProN', 'Meiryo', sans-serif; color:#000;">
 <div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid #173f33; padding-bottom:10px; margin-bottom:16px;">
 <div>
 <h1 style="font-size:22px; margin:0; color:#173f33;">個別介護記録・カルテ報告書</h1>
 <p style="font-size:13px; color:#4a5852; margin:4px 0 0 0;">対象利用者: <strong>${escapeHtml(resName)}</strong> (${res ? res.care_level : ''}) / 対象日: <strong>${isAllScope ? '全期間履歴' : escapeHtml(gState.selectedDate)}</strong></p>
 </div>
 <div style="text-align:right; font-size:12px; color:#5f6d66;">
 <div>印刷日時: ${nowStr}</div>
 <div>出力担当者: ${escapeHtml(staffName)}</div>
 <div>記録件数: 計 ${records.length} 件</div>
 </div>
 </div>

 <div style="margin-top:12px;">
 ${recordsHtml}
 </div>

 <div style="margin-top:24px; border-top:1px solid #cdd6d0; padding-top:8px; display:flex; justify-content:space-between; font-size:11px; color:#94a19a;">
 <span>ケアポータル 統合管理システム (個別カルテ印刷)</span>
 <span>確認印: __________________</span>
 </div>
 </div>
 `;

 runPrintJob(printArea.innerHTML, { page: "A4 portrait", fitOnePage: true, minScale: 0.75 });
}

// ============================================================
// 施設・フロア 業務日誌 (一日の記録・日課スケジュール ＆ 特変日報)
// ============================================================
function renderDailyJournal() {
 const titleEl = document.getElementById("dailyJournalTitle");
 if (titleEl) {
 titleEl.textContent = ` 【${gState.selectedDate}】施設・フロア 業務日誌 (一日の記録)`;
 }

 // 1. サマリーバー（勤務体制 ＆ 利用者概況 ＆ 記録件数）
 const summaryBar = document.getElementById("dailyJournalSummaryBar");
 if (summaryBar) {
 const presentCount = gState.residents.filter(r => r.status === "在所").length;
 const hospitalCount = gState.residents.filter(r => r.status === "入院中").length;

 const dayRecords = (db.data.care_records || []).filter(r => {
 if (r.voided) return false; // [Claude修正] 取消済みは数えない
 const timeStr = r.recorded_at || r.record_time || "";
 return timeStr.startsWith(gState.selectedDate);
 });
 const tokukanCount = dayRecords.filter(r => r.category === "特変").length;

 const roster = (typeof getDailyShiftRoster === "function") ? getDailyShiftRoster(gState.selectedDate) : null;
 let shiftSummaryText = "";
 let journalDateTitle = "本日のフロア勤務体制:";
 if (roster) {
  let dirT = "木村";
  if (roster.director.length > 0) {
   const dir = roster.director[0];
   dirT = dir.shift === "休" ? `${dir.shortName}(公休)` : dir.shortName;
  }
  const nurseT = roster.nurse.length > 0 ? roster.nurse.map(n => n.shortName).join("・") : "(オンコール)";
  const officeT = roster.office.length > 0 ? roster.office.map(o => o.shortName).join("・") : "(公休)";
  const fmt = l => l.length > 0 ? l.map(s => s.displayName).join("・") : "-";
  shiftSummaryText = `管理者: ${dirT} | 看護: ${nurseT} | 早出: ${fmt(roster.early)} | 日勤: ${fmt(roster.dayCare)} | 遅出: ${fmt(roster.late)} | 夜勤: ${fmt(roster.night)} | 明け: ${fmt(roster.dawn)} | 事務: ${officeT}`;
  journalDateTitle = `【${roster.month}月${roster.day}日】フロア勤務体制（勤務表連動）:`;
 } else {
  const shiftText = (document.getElementById("todayShiftBar") ? document.getElementById("todayShiftBar").innerText : "").replace(" 本日の勤務体制:", "").trim();
  shiftSummaryText = shiftText || "管理者: 木村 | 看護: 鈴木 | 介護体制確認中";
  journalDateTitle = "本日のフロア勤務体制:";
 }

 summaryBar.innerHTML = `
 <div style="display:flex; flex-direction:column; gap:4px; max-width:65%;">
 <div style="font-size:13px; color:#1e5b47; font-weight:bold;"> ${journalDateTitle}</div>
 <div style="font-size:12.5px; color:#22302b; line-height:1.5;">${escapeHtml(shiftSummaryText)}</div>
 </div>
 <div style="display:flex; gap:16px; align-items:center; flex-wrap:wrap;">
 <div style="background:#fff; border:1px solid #cdd6d0; padding:6px 14px; border-radius:6px; text-align:center;">
 <div style="font-size:11px; color:#5f6d66;">入居者状況</div>
 <div style="font-size:14px; font-weight:bold; color:#22302b;">在所 ${presentCount}名 / 入院 ${hospitalCount}名</div>
 </div>
 <div style="background:#fff; border:1px solid #cdd6d0; padding:6px 14px; border-radius:6px; text-align:center;">
 <div style="font-size:11px; color:#5f6d66;">本日の介護記録</div>
 <div style="font-size:14px; font-weight:bold; color:#1e5b47;">計 ${dayRecords.length} 件</div>
 </div>
 <div style="background:#fff; border:1px solid #cdd6d0; padding:6px 14px; border-radius:6px; text-align:center;">
 <div style="font-size:11px; color:#5f6d66;">特変・要申送</div>
 <div style="font-size:14px; font-weight:bold; color:${tokukanCount > 0 ? '#dc2626' : '#16a34a'};">${tokukanCount} 件</div>
 </div>
 </div>
 `;
 }

 // 2. 施設・フロア 一日の日課スケジュールタイムライン (何時に何を行ったか)
 renderDailyScheduleTimeline();

 // 3. 指定日のフロア特変・申し送り記録一覧 (個別の体位交換「左側臥位」等は除外)
 const recordsListEl = document.getElementById("dailyJournalRecordsList");
 if (recordsListEl) {
 const allRecords = (db.data.care_records || [])
 .filter(r => {
 const timeStr = r.recorded_at || r.record_time || "";
 if (!timeStr.startsWith(gState.selectedDate)) return false;
 // 個別の体位変換・巡視記録(左側臥位等)は日誌の一日の記録から除外
 if (r.category === "巡視" && (r.content || "").includes("夜間巡視")) return false;
 return true;
 })
 .sort((a, b) => {
 const ta = a.recorded_at || a.record_time || "";
 const tb = b.recorded_at || b.record_time || "";
 return ta.localeCompare(tb);
 });

 if (allRecords.length === 0) {
 recordsListEl.innerHTML = '<p style="font-size:13px; color:var(--text-muted); padding:12px; text-align:center; background:#f6f8f6; border-radius:6px;">この日の特変・特記事項はありません。</p>';
 } else {
 recordsListEl.innerHTML = "";
 allRecords.forEach(r => {
 const res = (r.resident_id === 0) ? null : gState.residents.find(x => x.id === r.resident_id);
 const resName = (r.resident_id === 0) ? "フロア全体・共通" : (res ? `${res.room_no}号室 ${res.name} 様` : "利用者未指定");
 const timeDisplay = r.recorded_at || r.record_time || "時間未記録";
 const catBadgeStyle = getCategoryBadgeStyle(r.category);

 const item = document.createElement("div");
 item.className = "care-record-card";
 item.innerHTML = `
 <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
 <div style="display:flex; align-items:center; gap:8px;">
 <span style="font-size:12px; padding:3px 8px; border-radius:4px; ${catBadgeStyle}">［${escapeHtml(r.category || '介護記録')}］</span>
 <strong style="font-size:14px; color:#22302b;">${escapeHtml(resName)}</strong>
 </div>
 <div style="display:flex; align-items:center; gap:6px;">
 <span style="font-size:12px; color:var(--text-muted);">${escapeHtml(timeDisplay)} (記録者: ${escapeHtml(r.staff_name || '未記録')})</span>
 ${cpCareRecordActions(r)}
 </div>
 </div>
 <div class="care-record-body" style="margin-top:6px; ${r.voided ? 'text-decoration:line-through; color:#94a19a;' : ''}">${escapeHtml(r.content || '')}</div>
 `;
 recordsListEl.appendChild(item);
 });
 }
 }

 // 3. フロア全体ケアサマリー表 (バイタル・食事・排泄・入浴)
 const summaryTableEl = document.getElementById("dailyJournalCareSummaryTable");
 if (summaryTableEl) {
 let rowsHtml = cpResidentsOn(gState.selectedDate).map(r => {
 // 本日のバイタル
 const vit = cpLatestVital(r.id, gState.selectedDate);
 const vitStr = vit ? `${vit.temperature}℃ / ${vit.bp_high}-${vit.bp_low} / P:${vit.pulse} / SpO2:${vit.spo2}%` : "未検温";

 // 本日の食事 (朝・昼)
 const morningMeal = (db.data.meals || []).find(m => m.resident_id === r.id && m.date === gState.selectedDate && m.meal_type === "朝食");
 const noonMeal = (db.data.meals || []).find(m => m.resident_id === r.id && m.date === gState.selectedDate && m.meal_type === "昼食");
  const cpBriefMeal = m => (!m ? "-" : ((m.main_dish_ratio === null && m.side_dish_ratio === null) ? "ー" : (m.main_dish_ratio === null ? `副:${m.side_dish_ratio}割` : `${m.main_dish_ratio}割`)));
  const mealStr = `朝:${cpBriefMeal(morningMeal)} / 昼:${cpBriefMeal(noonMeal)}`; // [Antigravity実装 2026-10-15]

 // 本日の排泄
 const excs = (db.data.excretions || []).filter(e => e.resident_id === r.id && e.date === gState.selectedDate);
 const stoolCount = excs.filter(e => e.stool_amount && e.stool_amount !== "なし").length;
 const excStr = excs.length > 0 ? `排尿:${excs.length}回 / 排便:${stoolCount}回` : "記録なし";

 // 本日の入浴
 const bath = (db.data.baths || []).find(b => b.resident_id === r.id && b.date === gState.selectedDate);
 const bathStr = bath ? `${bath.bath_type} 済` : (r.status === "入院中" ? "入院中" : "なし");

 return `
 <tr>
 <td style="font-weight:bold; white-space:nowrap;">${escapeHtml(r.room_no)}号室</td>
 <td style="font-weight:bold; white-space:nowrap;">${escapeHtml(r.name)} 様</td>
 <td style="font-size:12px; white-space:nowrap;">${escapeHtml(r.care_level)}</td>
 <td style="font-size:12px;">${escapeHtml(vitStr)}</td>
 <td style="font-size:12px;">${escapeHtml(mealStr)}</td>
 <td style="font-size:12px;">${escapeHtml(excStr)}</td>
 <td style="font-size:12px; white-space:nowrap;">${escapeHtml(bathStr)}</td>
 </tr>
 `;
 }).join("");

 summaryTableEl.innerHTML = `
 <table class="data-table" style="font-size:13px; width:100%;">
 <thead>
 <tr>
 <th>居室</th>
 <th>氏名</th>
 <th>介護度</th>
 <th>バイタル (体温/血圧/脈拍/SpO2)</th>
 <th>食事摂取量 (主食)</th>
 <th>排泄状況</th>
 <th>入浴実施</th>
 </tr>
 </thead>
 <tbody>
 ${rowsHtml}
 </tbody>
 </table>
 `;
 }
}

// 施設・フロア業務日誌 (一日の記録) の印刷
function printDailyJournal() {
 const records = (db.data.care_records || [])
 .filter(r => {
 const timeStr = r.recorded_at || r.record_time || "";
 return timeStr.startsWith(gState.selectedDate);
 })
 .sort((a, b) => {
 const ta = a.recorded_at || a.record_time || "";
 const tb = b.recorded_at || b.record_time || "";
 return ta.localeCompare(tb);
 });

 const printArea = document.getElementById("printArea");
 if (!printArea) {
 alert("印刷コンテナが見つかりません。");
 return;
 }

 const staffName = document.getElementById("currentStaff").value || "未記録";
 const nowStr = new Date().toLocaleString("ja-JP");
 const facilityName = getFacilityName();

 const roster = (typeof getDailyShiftRoster === "function") ? getDailyShiftRoster(gState.selectedDate) : null;
 let printRosterHtml = "";
 if (roster) {
  let dirT = "木村";
  if (roster.director.length > 0) {
   const dir = roster.director[0];
   dirT = dir.shift === "休" ? `${dir.shortName}(公休)` : dir.shortName;
  }
  const nurseT = roster.nurse.length > 0 ? roster.nurse.map(n => n.shortName).join("・") : "(オンコール)";
  const officeT = roster.office.length > 0 ? roster.office.map(o => o.shortName).join("・") : "(公休)";
  const fmt = l => l.length > 0 ? l.map(s => s.displayName).join("・") : "-";

  printRosterHtml = `
  <div style="background:#f6f8f6; border:1px solid #cdd6d0; border-radius:4px; padding:6px 12px; margin-bottom:14px; font-size:11px; color:#22302b;">
   <strong style="color:#1e5b47;">【本日の勤務体制】</strong>
   <span>管理者: ${escapeHtml(dirT)}</span> | 
   <span>看護: ${escapeHtml(nurseT)}</span> | 
   <span>早出: ${escapeHtml(fmt(roster.early))}</span> | 
   <span>日勤: ${escapeHtml(fmt(roster.dayCare))}</span> | 
   <span>遅出: ${escapeHtml(fmt(roster.late))}</span> | 
   <span>夜勤: ${escapeHtml(fmt(roster.night))}</span> | 
   <span>明け: ${escapeHtml(fmt(roster.dawn))}</span> | 
   <span>事務: ${escapeHtml(officeT)}</span>
  </div>
  `;
 }

 let summaryTableRows = cpResidentsOn(gState.selectedDate).map(r => {
 const vit = cpLatestVital(r.id, gState.selectedDate);
 const vitStr = vit ? `${vit.temperature}℃ / ${vit.bp_high}-${vit.bp_low} / P:${vit.pulse} / SpO2:${vit.spo2}%` : "未検温";
 const morningMeal = (db.data.meals || []).find(m => m.resident_id === r.id && m.date === gState.selectedDate && m.meal_type === "朝食");
 const noonMeal = (db.data.meals || []).find(m => m.resident_id === r.id && m.date === gState.selectedDate && m.meal_type === "昼食");
  const cpBriefMeal = m => (!m ? "-" : ((m.main_dish_ratio === null && m.side_dish_ratio === null) ? "ー" : (m.main_dish_ratio === null ? `副:${m.side_dish_ratio}割` : `${m.main_dish_ratio}割`)));
  const mealStr = `朝:${cpBriefMeal(morningMeal)} / 昼:${cpBriefMeal(noonMeal)}`; // [Antigravity実装 2026-10-15]
 const excs = (db.data.excretions || []).filter(e => e.resident_id === r.id && e.date === gState.selectedDate);
 const stoolCount = excs.filter(e => e.stool_amount && e.stool_amount !== "なし").length;
 const excStr = excs.length > 0 ? `尿:${excs.length}回 便:${stoolCount}回` : "記録なし";
 const bath = (db.data.baths || []).find(b => b.resident_id === r.id && b.date === gState.selectedDate);
 const bathStr = bath ? `${bath.bath_type} 済` : (r.status === "入院中" ? "入院中" : "なし");

 return `
 <tr>
 <td style="border:1px solid #94a19a; padding:5px 8px; font-weight:bold;">${escapeHtml(r.room_no)}号室 ${escapeHtml(r.name)} 様</td>
 <td style="border:1px solid #94a19a; padding:5px 8px;">${escapeHtml(r.care_level)}</td>
 <td style="border:1px solid #94a19a; padding:5px 8px;">${escapeHtml(vitStr)}</td>
 <td style="border:1px solid #94a19a; padding:5px 8px;">${escapeHtml(mealStr)}</td>
 <td style="border:1px solid #94a19a; padding:5px 8px;">${escapeHtml(excStr)}</td>
 <td style="border:1px solid #94a19a; padding:5px 8px;">${escapeHtml(bathStr)}</td>
 </tr>
 `;
 }).join("");

 let recordsHtml = records.map((r, idx) => {
 const res = gState.residents.find(x => x.id === r.resident_id);
 const resName = res ? `${res.room_no}号室 ${res.name} 様` : "利用者未指定";
 const timeDisplay = r.recorded_at || r.record_time || "時間未記録";

 return `
 <div style="margin-bottom:12px; border:1px solid #cdd6d0; border-radius:4px; padding:10px; page-break-inside:avoid;">
 <div style="display:flex; justify-content:space-between; border-bottom:1px solid #dfe5e1; padding-bottom:4px; margin-bottom:6px; font-size:12px;">
 <div>
 <span style="font-weight:bold; background:#dfe5e1; padding:2px 6px; border-radius:3px;">#${idx + 1} ［${escapeHtml(r.category || '介護記録')}］</span>
 <strong style="font-size:14px; margin-left:6px;">${escapeHtml(resName)}</strong>
 </div>
 <div style="color:#5f6d66;">
 <span>${escapeHtml(timeDisplay)}</span> / <span>記録者: ${escapeHtml(r.staff_name || '未記録')}</span>
 </div>
 </div>
 <div style="white-space:pre-wrap; font-size:13px; line-height:1.6; color:#22302b;">
${cpCareRecordPrintNote(r)}${escapeHtml(r.content || '')}
 </div>
 </div>
 `;
 }).join("");

 printArea.innerHTML = `
 <div style="font-family:'Hiragino Kaku Gothic ProN', 'Meiryo', sans-serif; color:#000;">
 <div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid #173f33; padding-bottom:8px; margin-bottom:14px;">
 <div>
 <h1 style="font-size:20px; margin:0; color:#173f33;"> ${escapeHtml(facilityName)} フロア業務日誌 (一日の記録)</h1>
 <p style="font-size:12px; color:#4a5852; margin:4px 0 0 0;">対象日: <strong>${escapeHtml(gState.selectedDate)}</strong> / 日報管理書類</p>
 </div>
 <div style="text-align:right; font-size:11px; color:#5f6d66;">
 <div>印刷日時: ${nowStr}</div>
 <div>出力者: ${escapeHtml(staffName)}</div>
 </div>
 </div>

 ${printRosterHtml}

 <h3 style="font-size:14px; margin:12px 0 6px 0; color:#173f33;">1. フロア全体 ケア実施サマリー表</h3>
 <table style="width:100%; border-collapse:collapse; font-size:11.5px; margin-bottom:16px;">
 <thead>
 <tr style="background:#eef2ef;">
 <th style="border:1px solid #94a19a; padding:5px 8px;">氏名・居室</th>
 <th style="border:1px solid #94a19a; padding:5px 8px;">介護度</th>
 <th style="border:1px solid #94a19a; padding:5px 8px;">バイタル</th>
 <th style="border:1px solid #94a19a; padding:5px 8px;">食事</th>
 <th style="border:1px solid #94a19a; padding:5px 8px;">排泄</th>
 <th style="border:1px solid #94a19a; padding:5px 8px;">入浴</th>
 </tr>
 </thead>
 <tbody>
 ${summaryTableRows}
 </tbody>
 </table>

 <!-- 一日の日課・業務スケジュール実施記録 (印刷欄) [Antigravity実装 2026-10-16] -->
 <h3 style="font-size:14px; margin:16px 0 6px 0; color:#173f33;">2. フロア一日の日課・業務スケジュール実施記録</h3>
 <table style="width:100%; border-collapse:collapse; font-size:11.5px; margin-bottom:16px;">
 <thead>
 <tr style="background:#eef2ef;">
 <th style="border:1px solid #94a19a; padding:5px 8px; width:70px;">時間</th>
 <th style="border:1px solid #94a19a; padding:5px 8px; width:150px;">日課・行事項目</th>
 <th style="border:1px solid #94a19a; padding:5px 8px;">実施内容・様子</th>
 <th style="border:1px solid #94a19a; padding:5px 8px; width:100px;">担当</th>
 </tr>
 </thead>
 <tbody>
 ${(db.data.daily_schedules || []).filter(s => !s.voided && s.date === gState.selectedDate).slice().sort((a,b) => (a.time||'').localeCompare(b.time||'')).map(s => `
 <tr>
 <td style="border:1px solid #94a19a; padding:5px 8px; font-weight:bold; text-align:center;">${escapeHtml(s.time || '')}</td>
 <td style="border:1px solid #94a19a; padding:5px 8px; font-weight:bold;">${escapeHtml(s.title)}</td>
 <td style="border:1px solid #94a19a; padding:5px 8px;">${escapeHtml(s.content || '-')}</td>
 <td style="border:1px solid #94a19a; padding:5px 8px;">${escapeHtml(s.staff_name || '-')}</td>
 </tr>
 `).join("") || '<tr><td colspan="4" style="text-align:center; padding:8px;">スケジュール記録なし</td></tr>'}
 </tbody>
 </table>

 <h3 style="font-size:14px; margin:14px 0 6px 0; color:#173f33;">3. 特変・申し送り記録 (計 ${records.length} 件)</h3>
 <div>
 ${recordsHtml || '<p style="padding:10px; font-size:12px; color:#5f6d66;">記録なし</p>'}
 </div>

 <div style="margin-top:24px; border-top:1px solid #cdd6d0; padding-top:8px; display:flex; justify-content:space-between; font-size:11px; color:#94a19a;">
 <span>ケアポータル 統合管理システム (フロア日報印刷)</span>
 <span>施設長印: __________________ / リーダー印: __________________</span>
 </div>
 </div>
 `;

 runPrintJob(printArea.innerHTML, { page: "A4 portrait", fitOnePage: true, minScale: 0.75 });
}

// [Antigravity実装 2026-10-16] 施設・フロア 一日の日課・業務スケジュール（デモ見本表示の切り替え）
function toggleDailyScheduleDemo() {
 gState.showDailyScheduleDemo = !gState.showDailyScheduleDemo;
 renderDailyScheduleTimeline();
}

// 施設・フロア 一日の日課・業務スケジュール [Antigravity実装 2026-10-16]
function renderDailyScheduleTimeline() {
 const container = document.getElementById("dailyScheduleTimeline");
 if (!container) return;
 const targetDate = gState.selectedDate;
 const demoBtn = document.getElementById("btnToggleDailyScheduleDemo");
 if (demoBtn) {
  demoBtn.textContent = gState.showDailyScheduleDemo ? "デモを閉じる" : "デモ";
  demoBtn.setAttribute("aria-pressed", gState.showDailyScheduleDemo ? "true" : "false");
  if (gState.showDailyScheduleDemo) {
   demoBtn.style.background = "#fef3c7";
   demoBtn.style.color = "#92400e";
   demoBtn.style.borderColor = "#f59e0b";
  } else {
   demoBtn.style.background = "#fffbeb";
   demoBtn.style.color = "#b45309";
   demoBtn.style.borderColor = "#fcd34d";
  }
 }

 // 選んでいる日（gState.selectedDate）の取消していない記録だけを表示（日付のない見本データは記録としては表示しない）
 const list = (db.data.daily_schedules || [])
  .filter(s => !s.voided && s.date === targetDate)
  .slice()
  .sort((a, b) => (a.time || "").localeCompare(b.time || ""));

 let html = "";
 if (list.length === 0) {
  html += `<p style="font-size:13px; color:var(--text-muted); margin:0;">【${escapeHtml(targetDate)}】に登録された日課・業務スケジュールはありません。「＋ 日課・業務を追加」から追加できます。</p>`;
 } else {
  html += '<div style="display:flex; flex-direction:column; gap:8px;">';
  list.forEach(s => {
   html += `
   <div class="daily-schedule-item" style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; padding:8px 12px; background:#f6f8f6; border:1px solid #dfe5e1; border-radius:6px; font-size:13px;">
    <div style="display:flex; gap:10px; align-items:flex-start; min-width:0; flex:1;">
     <span style="background:#1e5b47; color:#ffffff; font-weight:bold; font-size:12px; padding:2px 8px; border-radius:4px; white-space:nowrap; flex-shrink:0;">
      ${escapeHtml(s.time || "")}
     </span>
     <div style="min-width:0; flex:1; word-break:break-word;">
      <strong style="color:#1c2622; font-size:14px;">${escapeHtml(s.title)}</strong>
      ${s.content ? `<div style="font-size:12.5px; color:#4a5852; margin-top:2px;">${escapeHtml(s.content)}</div>` : ''}
      ${s.staff_name ? `<div style="font-size:11px; color:#5f6d66; margin-top:2px;">担当: ${escapeHtml(s.staff_name)}</div>` : ''}
     </div>
    </div>
    <button type="button" class="btn btn-secondary" style="padding:2px 8px; font-size:11px; color:#991b1b; border-color:#fca5a5; flex-shrink:0;" onclick="deleteDailySchedule(${Number(s.id)})">取消</button>
   </div>
   `;
  });
  html += '</div>';
 }

 // [Antigravity実装 2026-10-16] デモボタン押下時は、日付のない見本12件を記録とは別の枠（色を変え「見本」と表示）に出す
 if (gState.showDailyScheduleDemo) {
  const sampleList = (db.data.daily_schedules || [])
   .filter(s => !s.date && !s.voided)
   .slice()
   .sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  html += `
  <div id="dailyScheduleDemoBox" class="daily-schedule-demo-box no-print" style="margin-top:12px; padding:12px; background:#fffbeb; border:2px dashed #f59e0b; border-radius:8px;">
   <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; margin-bottom:8px;">
    <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
     <span style="background:#d97706; color:#ffffff; font-weight:bold; font-size:11px; padding:2px 8px; border-radius:4px;">見本</span>
     <strong style="font-size:13px; color:#92400e;">こんな感じで記録できます（一日の日課・業務スケジュールの記入例 ${sampleList.length}件）</strong>
    </div>
    <span style="font-size:11.5px; color:#b45309;">※この見本は保存・印刷されず、記録の件数にも数えません</span>
   </div>
   <div style="display:flex; flex-direction:column; gap:6px;">
    ${sampleList.map(s => `
    <div style="display:flex; gap:10px; align-items:flex-start; padding:6px 10px; background:#fef3c7; border:1px solid #fde68a; border-radius:6px; font-size:12.5px;">
     <span style="background:#b45309; color:#ffffff; font-weight:bold; font-size:11.5px; padding:2px 7px; border-radius:4px; white-space:nowrap; flex-shrink:0;">
      ${escapeHtml(s.time || "")}
     </span>
     <div style="min-width:0; flex:1; word-break:break-word;">
      <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
       <span style="font-size:10.5px; background:#fde68a; color:#92400e; padding:1px 5px; border-radius:3px; font-weight:bold;">見本</span>
       <strong style="color:#78350f; font-size:13px;">${escapeHtml(s.title)}</strong>
      </div>
      ${s.content ? `<div style="font-size:12px; color:#92400e; margin-top:2px;">${escapeHtml(s.content)}</div>` : ''}
      ${s.staff_name ? `<div style="font-size:11px; color:#b45309; margin-top:2px;">担当例: ${escapeHtml(s.staff_name)}</div>` : ''}
     </div>
    </div>
    `).join("")}
   </div>
  </div>
  `;
 }

 container.innerHTML = html;
}

function openDailyScheduleModal() {
 const tm = new Date().toTimeString().slice(0, 5);
 document.getElementById("schedTime").value = tm;
 document.getElementById("schedTitle").value = "";
 document.getElementById("schedContent").value = "";
 const staff = document.getElementById("currentStaff").value || "";
 document.getElementById("schedStaff").value = staff;
 // [Antigravity実装 2026-10-16] 追加モーダルに対象日（選んでいる日付）を表示
 const dateLabel = document.getElementById("schedTargetDateLabel");
 if (dateLabel) dateLabel.textContent = gState.selectedDate;
 document.getElementById("dailyScheduleModal").style.display = "flex";
}

function submitDailySchedule() {
 const tm = document.getElementById("schedTime").value;
 const title = document.getElementById("schedTitle").value.trim();
 const content = document.getElementById("schedContent").value.trim();
 const staff = document.getElementById("schedStaff").value.trim();

 if (!tm || !title) {
 alert("時間と日課・項目名は必須入力です。");
 return;
 }

 // [Antigravity実装 2026-10-16] その時に選んでいる日付（gState.selectedDate）で保存する
 if (!Array.isArray(db.data.daily_schedules)) db.data.daily_schedules = [];
 db.data.daily_schedules.push({
 id: Date.now(),
 date: gState.selectedDate,
 time: tm,
 title: title,
 content: content,
 staff_name: staff
 });

 db.save();
 closeModal("dailyScheduleModal");
 renderDailyScheduleTimeline();
 renderCalendar();
 alert(`【${gState.selectedDate}】の日課スケジュール「${title}」を追加しました！`);
}

// [Antigravity実装 2026-10-16] 削除はやめて「取消」にし、理由・取消者・取消日時をデータに残す
function deleteDailySchedule(id) {
 const rec = (db.data.daily_schedules || []).find(s => Number(s.id) === Number(id));
 if (!rec || rec.voided) return;
 const reason = prompt(`日課・業務スケジュール「${rec.title || ""}」を「取消」にします。\n記録は消えずに、取消済みとして残ります。\n\n取消の理由を入力してください (例: 入力間違い、予定変更)`, "");
 if (reason === null) return;
 if (!reason.trim()) {
  alert("取消の理由を入力してください。取消は行っていません。");
  return;
 }
 rec.voided = true;
 rec.void_reason = reason.trim();
 rec.voided_by = cpLedgerStaff();
 rec.voided_at = toLocalDateTimeStr(new Date());
 db.save();
 renderDailyScheduleTimeline();
 renderCalendar();
 alert(`日課スケジュール「${rec.title || ""}」を取消にしました。`);
}

// 業務日誌 特変・申送り・連絡追加 モーダル
function openDailyJournalAddRecordModal(prefillCategory) {
 const modal = document.getElementById("dailyJournalAddRecordModal");
 if (!modal) return;

 // 1. 対象利用者セレクトの同期
 const resSelect = document.getElementById("djmResidentSelect");
 if (resSelect && Array.isArray(gState.residents)) {
 let opts = cpCurrentResidents().map(r => `<option value="${r.id}">${escapeHtml(r.room_no)}号室 ${escapeHtml(r.name)} 様</option>`);
 opts.push('<option value="0">【全体・フロア共通】（特定入居者なし）</option>');
 resSelect.innerHTML = opts.join("");
 if (gState.selectedResidentId) {
 resSelect.value = String(gState.selectedResidentId);
 }
 }

 // 2. 区分初期値
 const targetCat = prefillCategory || "特変";
 selectDailyJournalCategory(targetCat);

 // 3. 日時初期値 (現在日時に合わせる)
 const now = new Date();
 const pad = n => String(n).padStart(2, "0");
 const defaultDate = gState.selectedDate || `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
 const defaultTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
 const dtInput = document.getElementById("djmDateTime");
 if (dtInput) {
 dtInput.value = `${defaultDate}T${defaultTime}`;
 }

 // 4. 職員名
 const staffInput = document.getElementById("djmStaff");
 const curStaff = (document.getElementById("currentStaff") ? document.getElementById("currentStaff").value : "") || "木村 健一";
 if (staffInput) {
 staffInput.value = curStaff;
 }

 // 5. 本文初期化 & 雛形セット
 const contentArea = document.getElementById("djmContent");
 if (contentArea) {
 contentArea.value = "";
 insertDailyJournalTemplate(targetCat);
 }

 modal.style.display = "flex";
}

function selectDailyJournalCategory(cat) {
 const sel = document.getElementById("djmCategorySelect");
 if (sel) sel.value = cat;

 const btnContainer = document.getElementById("djmCategoryButtons");
 if (!btnContainer) return;
 const buttons = btnContainer.querySelectorAll("button[data-cat]");

 const activeStyles = {
 "特変": { bg: "#dc2626", fg: "#ffffff", border: "#fca5a5" },
 "連絡": { bg: "#ca8a04", fg: "#ffffff", border: "#fde047" },
 "介護": { bg: "#1e5b47", fg: "#ffffff", border: "#c9e0d5" },
 "看護": { bg: "#16a34a", fg: "#ffffff", border: "#bbf7d0" },
 "リハビリ": { bg: "#7c3aed", fg: "#ffffff", border: "#ddd6fe" }
 };

 buttons.forEach(btn => {
 const bCat = btn.getAttribute("data-cat");
 if (bCat === cat) {
 btn.classList.add("active");
 const style = activeStyles[bCat] || { bg: "#1e5b47", fg: "#ffffff", border: "#c9e0d5" };
 btn.style.background = style.bg;
 btn.style.color = style.fg;
 btn.style.borderColor = style.border;
 btn.style.fontWeight = "bold";
 } else {
 btn.classList.remove("active");
 const style = activeStyles[bCat] || { bg: "#ffffff", fg: "#36443e", border: "#cdd6d0" };
 btn.style.background = "#ffffff";
 btn.style.color = style.bg;
 btn.style.borderColor = style.border;
 btn.style.fontWeight = "bold";
 }
 });
}

function syncDailyJournalCategoryButtons() {
 const sel = document.getElementById("djmCategorySelect");
 if (sel) selectDailyJournalCategory(sel.value);
}

function insertDailyJournalTemplate(cat) {
 const textarea = document.getElementById("djmContent");
 if (!textarea) return;
 const now = new Date();
 const pad = n => String(n).padStart(2, "0");
 const tm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

 let tpl = "";
 if (cat === "特変") {
 tpl = `【特変】${tm}頃、`;
 } else if (cat === "連絡") {
 tpl = `【連絡・申送り】`;
 } else if (cat === "看護") {
 tpl = `【看護処置】${tm}実施。`;
 } else if (cat === "リハビリ") {
 tpl = `【機能訓練】`;
 } else if (cat === "介護") {
 tpl = `【日常ケア・日報】様子良好。`;
 }

 if (textarea.value.trim() === "" || textarea.value.startsWith("【")) {
 textarea.value = tpl;
 } else {
 textarea.value = tpl + "\n" + textarea.value;
 }
 textarea.focus();
}

function submitDailyJournalRecordModal() {
 const resSelect = document.getElementById("djmResidentSelect");
 const catSelect = document.getElementById("djmCategorySelect");
 const dtInput = document.getElementById("djmDateTime");
 const staffInput = document.getElementById("djmStaff");
 const contentArea = document.getElementById("djmContent");

 const content = contentArea ? contentArea.value.trim() : "";
 if (!content) {
 alert("記録内容を入力してください。");
 if (contentArea) contentArea.focus();
 return;
 }

 const resId = resSelect ? parseInt(resSelect.value, 10) : 0;
 const cat = catSelect ? catSelect.value : "特変";
 const dtVal = (dtInput && dtInput.value) ? dtInput.value : `${gState.selectedDate}T12:00`;
 const recordedAt = dtVal.replace("T", " ");
 const dateStr = dtVal.split("T")[0];
 const staff = (staffInput && staffInput.value.trim()) ? staffInput.value.trim() : "職員";

 if (!Array.isArray(db.data.care_records)) db.data.care_records = [];

 // 1. 介護記録テーブルへ追加
 const newRec = {
 id: Date.now(),
 recorded_at: recordedAt,
 resident_id: resId,
 category: cat,
 content: content,
 staff_name: staff
 };
 db.data.care_records.unshift(newRec);

 // 2. 特変または連絡の場合は、申し送り（連絡帳）へも自動追加
 if (cat === "特変" || cat === "連絡") {
 if (!Array.isArray(db.data.notebooks)) db.data.notebooks = [];
 const resObj = (resId === 0) ? null : gState.residents.find(r => r.id === resId);
 const resName = (resId === 0) ? "フロア全体" : (resObj ? `${resObj.room_no}号室 ${resObj.name}様` : "");
 db.data.notebooks.unshift({
 id: Date.now() + 1,
 date: dateStr,
 resident_id: resId,
 content: `［${cat}］(${resName}) ${content}`,
 staff_name: staff,
 status: "未対応"
 });
 }

 db.save();
 closeModal("dailyJournalAddRecordModal");

 // 再描画（日誌・申し送り・個別カルテ・カレンダー）
 loadDateRecords(dateStr);
 if (gState.activeCareTab === "daily_journal") {
 renderDailyJournal();
 }
 renderCalendar();

 alert(`［${cat}］記録を登録しました！日誌・カルテ・申し送りに連動反映されました。`);
}

// 文字検索機能 (何月何日何時の記録か一発検索)
function doSearch() {
 const q = document.getElementById("searchInput").value.trim().toLowerCase();
 if (!q) return;
 // [Claude修正 2026-10-16] 検索結果は「記録を見る・検索」側に出るので切り替える（カルテの病名ガイドから検索したときなど）
 if (typeof cpSwitchRecordPane === "function") cpSwitchRecordPane("log");

 const results = (db.data.care_records || []).filter(r => {
 const res = gState.residents.find(x => x.id === r.resident_id);
 const resName = res ? res.name.toLowerCase() : "";
 const content = (r.content || "").toLowerCase();
 const cat = (r.category || "").toLowerCase();
 return content.includes(q) || cat.includes(q) || resName.includes(q);
 });

 const container = document.getElementById("searchResults");
 container.style.display = "block";
 container.innerHTML = `
 <div style="font-size:14px; font-weight:bold; margin-bottom:8px; color:var(--primary-color);">
 『${q}』の検索結果: ${results.length}件ヒット (何月何日何時何分の記録か)
 </div>
 `;

 if (results.length === 0) {
 container.innerHTML += '<p style="font-size:13px; color:var(--text-muted);">該当する記録は見つかりませんでした。</p>';
 return;
 }

 results.forEach(r => {
 const res = gState.residents.find(x => x.id === r.resident_id);
 const card = document.createElement("div");
 card.style.background = "#f6f8f6";
 card.style.border = "1px solid #cdd6d0";
 card.style.borderRadius = "8px";
 card.style.padding = "10px 14px";
 card.style.marginBottom = "8px";

 const timeDisplay = r.recorded_at || r.record_time || "時間未記録";
 // 検索語ハイライト (安全なHTMLエスケープ後にハイライト適用)
 let contentHtml = escapeHtml(r.content || "");
 try {
 const escapedQ = escapeHtml(q).replace(new RegExp("[.*+?^${}()|[\\]\\\\]", "g"), "\\$&");
 const regex = new RegExp(`(${escapedQ})`, 'gi');
 contentHtml = contentHtml.replace(regex, '<mark style="background:#fef08a; padding:1px 4px; border-radius:2px; font-weight:bold;">$1</mark>');
 } catch(e) {}

 card.innerHTML = `
 <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:4px; flex-wrap:wrap; gap:4px;">
 <span style="font-weight:bold; color:#1a4f3d;"> ${escapeHtml(timeDisplay)} 【${escapeHtml(r.category || '記録')}】</span>
 <strong>${res ? escapeHtml(res.room_no) + '号室 ' + escapeHtml(res.name) + ' 様' : ''}</strong>
 <span style="color:var(--text-muted);">担当: ${escapeHtml(r.staff_name || '未設定')}</span>
 </div>
 <div style="font-size:14px; line-height:1.7; white-space:pre-wrap; margin-top:4px; padding:6px; background:#fff; border-radius:4px;">${contentHtml}</div>
 <div style="margin-top:6px; display:flex; justify-content:flex-end;">
 <button class="btn btn-secondary" style="padding:2px 8px; font-size:11px;" onclick="jumpToDateRecord('${escapeHtml(timeDisplay.slice(0, 10))}')"> この日の記録一覧へジャンプ</button>
 </div>
 `;
 container.appendChild(card);
 });
}

function jumpToDateRecord(dateStr) {
 if (!dateStr || dateStr.length < 10) return;
 const targetDate = dateStr.slice(0, 10);
 gState.currentMonth = targetDate.slice(0, 7);
 selectDate(targetDate);
 switchCareTab('record');
 cpSwitchRecordPane("log"); // [Claude修正 2026-10-16]
 window.scrollTo({ top: 300, behavior: 'smooth' });
}

function clearSearch() {
 document.getElementById("searchInput").value = "";
 document.getElementById("searchResults").style.display = "none";
}

// 体温入力の自動小数点変換 (例: 365 -> 36.5, 370 -> 37.0)
function formatTempInput(el) {
 if (!el) return;
 let val = String(el.value).trim();
 if (!val) return;
 const num = parseFloat(val);
 if (!isNaN(num) && num >= 300 && num <= 450 && !val.includes(".")) {
   el.value = (num / 10).toFixed(1);
 }
}

function normalizeTempValue(val) {
 if (!val) return "";
 let s = String(val).trim();
 const num = parseFloat(s);
 if (!isNaN(num) && num >= 300 && num <= 450 && !s.includes(".")) {
   return (num / 10).toFixed(1);
 }
 return s;
}

// [Antigravity実装 2026-10-16] 記入済み表示用の共通バッジ・訂正理由入力ヘルパー
function cpFilledBadgeHtml(summaryText, staffName, timeText, editHistory) {
 const st = staffName ? `記録者: ${escapeHtml(staffName)}` : "記録者: 未記録";
 const tm = timeText ? `（${escapeHtml(timeText)}）` : "";
 const editTag = (Array.isArray(editHistory) && editHistory.length > 0)
  ? `<span style="color:#b45309; font-weight:bold; font-size:10.5px; margin-left:4px;">[訂正${editHistory.length}回]</span>`
  : "";
 return `<div class="cp-filled-info-box" style="background:#f0fdf4; border:1px solid #86efac; border-radius:6px; padding:4px 8px; margin-bottom:4px; font-size:11.5px; color:#14532d; line-height:1.4;">
  <span style="display:inline-block; background:#16a34a; color:#fff; font-weight:bold; font-size:10.5px; padding:1px 6px; border-radius:4px; margin-right:4px;">記入済み</span>
  <strong>${escapeHtml(summaryText)}</strong>
  <span style="color:#166534; font-size:11px; margin-left:4px;">${st}${tm}</span>${editTag}
 </div>`;
}

function cpPromptEditReason(label, beforeSummary) {
 const msg = `${label}（記入済み: ${beforeSummary}）を訂正します。\n直す前の内容・直した人・日時・理由は訂正履歴（edit_history）に残ります。\n\n訂正の理由を入力してください (必須):`;
 const reason = prompt(msg, "");
 if (reason === null) return null;
 if (!reason.trim()) {
  alert("訂正の理由を入力してください。理由がない場合は変更できません。");
  return null;
 }
 return reason.trim();
}

// [Claude修正 2026-10-16] バイタルは1日に何回でも記録できる（再測定）。その日の記録を時間順に／いちばん新しい記録
function cpDayVitals(resId, dateStr) {
 return (db.data.vitals || []).filter(v => !v.voided && Number(v.resident_id) === Number(resId) && v.date === dateStr)
  .sort((a, b) => (a.time || "").localeCompare(b.time || "") || (Number(a.id) || 0) - (Number(b.id) || 0));
}
function cpLatestVital(resId, dateStr) {
 const list = cpDayVitals(resId, dateStr);
 return list.length ? list[list.length - 1] : null;
}

function cpFormatVitalBrief(v) {
 if (!v) return "";
 const p = [];
 if (v.temperature !== null && v.temperature !== undefined && v.temperature !== "") p.push(`体温${v.temperature}℃`);
 if ((v.bp_high !== null && v.bp_high !== undefined && v.bp_high !== "") || (v.bp_low !== null && v.bp_low !== undefined && v.bp_low !== "")) p.push(`血圧${v.bp_high ?? "-"}/${v.bp_low ?? "-"}`);
 if (v.pulse !== null && v.pulse !== undefined && v.pulse !== "") p.push(`脈拍${v.pulse}`);
 if (v.spo2 !== null && v.spo2 !== undefined && v.spo2 !== "") p.push(`SpO2 ${v.spo2}%`);
 if (v.is_unusual) p.push("特変あり");
 if (v.notes) p.push(`(${v.notes})`);
 return p.join("・") || "記録あり";
}

function cpFormatMealDetail(m) {
 if (!m) return "";
 const type = m.meal_type || "食事";
 const mainHas = m.main_dish_ratio !== null && m.main_dish_ratio !== undefined && m.main_dish_ratio !== "";
 const sideHas = m.side_dish_ratio !== null && m.side_dish_ratio !== undefined && m.side_dish_ratio !== "";
 const parts = [];
 if (type === "おやつ") {
  if (mainHas) parts.push(`主食(おやつ量)${m.main_dish_ratio}割`);
  parts.push(`副食ー`);
 } else if (type === "その他") {
  parts.push(`主食ー・副食ー`);
 } else {
  parts.push(`主食${mainHas ? m.main_dish_ratio + "割" : "ー"}`);
  parts.push(`副食${sideHas ? m.side_dish_ratio + "割" : "ー"}`);
 }
 if (m.water_ml !== null && m.water_ml !== undefined && m.water_ml !== "") {
  parts.push(`水分${m.water_ml}ml`);
 }
 return `${type} ${parts.join("・")}`;
}

function cpFormatExcretionDetail(e) {
 if (!e) return "";
 // [Claude修正 2026-10-16] 書いていない欄は表示しない（「なし」と決めつけない）
 const u = e.urine_flag === 1 ? "排尿あり(＋)" : (e.urine_flag === 2 ? "バルーン" : (e.urine_flag === 0 ? "排尿なし(ー)" : ""));
 const s = (e.stool_amount && e.stool_amount !== "なし") ? `排便:${e.stool_amount}(${e.stool_condition || "-"})` : (e.stool_amount === "なし" ? "排便なし" : "");
 return `${[u, s].filter(Boolean).join("・") || "（排尿・排便は未記入）"}${e.notes ? " (" + e.notes + ")" : ""}`;
}

function cpFormatBathDetail(b) {
 if (!b) return "";
 return `${b.bath_type || "入浴"}${b.ointment_notes ? "（" + b.ointment_notes + "）" : ""}`;
}

// 1. バイタル表 [Antigravity実装 2026-10-16]
function renderVitalsTable() {
 const tbody = document.querySelector("#vitalsTable tbody");
 if (!tbody) return;
 tbody.innerHTML = "";
 const vitals = (db.data.vitals || []).filter(v => !v.voided && v.date === gState.selectedDate);

 cpResidentsOn(gState.selectedDate).forEach(r => {
   // [Claude修正 2026-10-16] 再測定は新しい記録として追加する。入力欄はいつも空欄。記録済みは全部出し、打ち間違いはそれぞれの「訂正」から直す
   const vList = cpDayVitals(r.id, gState.selectedDate);
   const v = null;
   const tr = document.createElement("tr");
   if (r.status !== "在所") tr.style.opacity = "0.5";
   const filledHtml = vList.map(x => `<div style="display:flex; align-items:center; gap:4px; flex-wrap:wrap; margin-top:2px;">${cpFilledBadgeHtml(cpFormatVitalBrief(x), x.staff_name, x.time || "", x.edit_history)}<button type="button" class="btn btn-secondary" style="font-size:11px; padding:1px 6px;" onclick="openPersonalVitalModal(${Number(x.id)})">訂正</button></div>`).join("");

   tr.innerHTML = `
     <td>${r.room_no}</td>
     <td>
       <strong>${r.name} 様</strong> ${r.status !== '在所' ? `(${r.status})` : ''}
       ${filledHtml}
     </td>
     <td><input type="number" step="0.1" class="form-control" style="width:85px;" id="vTemp_${r.id}" value="${v && v.temperature !== null && v.temperature !== undefined ? v.temperature : ''}" placeholder="体温" onblur="formatTempInput(this)" oninput="formatTempInput(this)"></td>
     <td style="display:flex; gap:4px; align-items:center;">
       <input type="number" class="form-control" style="width:70px;" id="vBpHigh_${r.id}" value="${v && v.bp_high !== null && v.bp_high !== undefined ? v.bp_high : ''}" placeholder="上">
       /
       <input type="number" class="form-control" style="width:70px;" id="vBpLow_${r.id}" value="${v && v.bp_low !== null && v.bp_low !== undefined ? v.bp_low : ''}" placeholder="下">
     </td>
     <td><input type="number" class="form-control" style="width:75px;" id="vPulse_${r.id}" value="${v && v.pulse !== null && v.pulse !== undefined ? v.pulse : ''}" placeholder="脈拍"></td>
     <td><input type="number" class="form-control" style="width:75px;" id="vSpo2_${r.id}" value="${v && v.spo2 !== null && v.spo2 !== undefined ? v.spo2 : ''}" placeholder="SpO2"></td>
     <td><label><input type="checkbox" id="vUnusual_${r.id}" ${v && v.is_unusual ? 'checked' : ''}> 特変</label></td>
     <td><button class="btn btn-primary" style="padding:6px 12px; font-size:13px;" onclick="saveVital(${r.id})">${vList.length ? '再測定を登録' : '登録'}</button></td>
   `;
   tbody.appendChild(tr);
 });
}

function saveVital(resId) {
 const tempInput = document.getElementById(`vTemp_${resId}`);
 if (tempInput) formatTempInput(tempInput);
 const temp = normalizeTempValue(tempInput ? tempInput.value : "");
 const bpHigh = document.getElementById(`vBpHigh_${resId}`).value;
 const bpLow = document.getElementById(`vBpLow_${resId}`).value;
 const pulse = document.getElementById(`vPulse_${resId}`).value;
 const spo2 = document.getElementById(`vSpo2_${resId}`).value;
 const isUnusual = document.getElementById(`vUnusual_${resId}`).checked;

 if (!temp && !bpHigh && !bpLow && !pulse && !spo2) {
   alert("体温・血圧・脈拍・SpO2のいずれかを入力してください。");
   return;
 }

 // [Claude修正 2026-10-16] 2回目以降は再測定として新しく追加する（前の測定も残る）。打ち間違いは記録済みの「訂正」から直す
 const existingVital = null;
 let editReason = null;

 // [Claude修正] 一部の項目が空欄なら、保存してよいか確認する（個人バイタル編集画面と同じ）
 const cpBlankLabels = [];
 if (!temp) cpBlankLabels.push("体温");
 if (!bpHigh) cpBlankLabels.push("最高血圧");
 if (!bpLow) cpBlankLabels.push("最低血圧");
 if (!pulse) cpBlankLabels.push("脈拍");
 if (!spo2) cpBlankLabels.push("SpO2");
 if (cpBlankLabels.length > 0) {
   const cpResName = (gState.residents.find(x => x.id === resId) || {}).name || "";
   if (!confirm(`${cpResName} 様\n次の項目が空欄です。\n${cpBlankLabels.join("、")}\n\nこのまま登録しますか？`)) return;
 }

 // 個別注意基準値チェック (いつもより外れている場合の確認警告)
 const res = gState.residents.find(x => x.id === resId);
 if (res) {
   const warnings = [];
   const tNum = temp ? parseFloat(temp) : null;
   const bpHNum = bpHigh ? parseInt(bpHigh, 10) : null;
   const bpLNum = bpLow ? parseInt(bpLow, 10) : null;
   const spNum = spo2 ? parseInt(spo2, 10) : null;
   const pNum = pulse ? parseInt(pulse, 10) : null;

   if (tNum !== null && res.temp_max && tNum > res.temp_max) {
     warnings.push(`体温が個別上限(${res.temp_max}℃)を超えています (測定値: ${tNum}℃)`);
   }
   if (bpHNum !== null && res.bp_high_max && bpHNum > res.bp_high_max) {
     warnings.push(`最高血圧が個別上限(${res.bp_high_max}mmHg)を超えています (測定値: ${bpHNum}mmHg)`);
   }
   if (bpHNum !== null && res.bp_high_min && bpHNum < res.bp_high_min) {
     warnings.push(`最高血圧が個別下限(${res.bp_high_min}mmHg)を下回っています (測定値: ${bpHNum}mmHg)`);
   }
   if (spNum !== null && res.spo2_min && spNum < res.spo2_min) {
     warnings.push(`SpO2が個別下限(${res.spo2_min}%)を下回っています (測定値: ${spNum}%)`);
   }
   if (pNum !== null && res.pulse_max && pNum > res.pulse_max) {
     warnings.push(`脈拍が個別上限(${res.pulse_max}bpm)を超えています (測定値: ${pNum}bpm)`);
   }
   if (pNum !== null && res.pulse_min && pNum < res.pulse_min) {
     warnings.push(`脈拍が個別下限(${res.pulse_min}bpm)を下回っています (測定値: ${pNum}bpm)`);
   }

   if (warnings.length > 0) {
     const msg = `【個別注意基準値の警告】\n${res.name} 様\n\n` + warnings.join("\n") + "\n\nこのまま登録しますか？";
     if (!confirm(msg)) return;
   }
 }

 const staff = cpLedgerStaff();
 const now = new Date();
 const timeStr = now.toTimeString().slice(0, 5);

 // [Antigravity実装 2026-10-16] 既存の記録オブジェクトを直接書き換え（idは変えない）、訂正履歴に理由を残す
 if (existingVital) {
   const oldCopy = JSON.parse(JSON.stringify(existingVital));
   existingVital.time = timeStr;
   existingVital.temperature = temp ? parseFloat(temp) : null;
   existingVital.bp_high = bpHigh ? parseInt(bpHigh, 10) : null;
   existingVital.bp_low = bpLow ? parseInt(bpLow, 10) : null;
   existingVital.pulse = pulse ? parseInt(pulse, 10) : null;
   existingVital.spo2 = spo2 ? parseInt(spo2, 10) : null;
   existingVital.is_unusual = isUnusual ? 1 : 0;
   existingVital.staff_name = staff;
   cpAppendEditHistory(existingVital, oldCopy, ["time", "temperature", "bp_high", "bp_low", "pulse", "spo2", "is_unusual"], editReason);
 } else {
   db.data.vitals.push({
     id: Date.now(),
     resident_id: resId,
     date: gState.selectedDate,
     time: timeStr,
     temperature: temp ? parseFloat(temp) : null,
     bp_high: bpHigh ? parseInt(bpHigh, 10) : null,
     bp_low: bpLow ? parseInt(bpLow, 10) : null,
     pulse: pulse ? parseInt(pulse, 10) : null,
     spo2: spo2 ? parseInt(spo2, 10) : null,
     is_unusual: isUnusual ? 1 : 0,
     staff_name: staff
   });
 }

 const parts = [];
 if (temp) parts.push(`体温 ${temp}℃`);
 if (bpHigh || bpLow) parts.push(`血圧 ${bpHigh || '-'}/${bpLow || '-'}`);
 if (pulse) parts.push(`脈拍 ${pulse}bpm`);
 if (spo2) parts.push(`SpO2 ${spo2}%`);
 if (isUnusual) parts.push(`【特変あり】`);

 // 特変の場合は連絡帳・申し送りへも自動転記
 if (isUnusual) {
   db.data.notebooks.unshift({
     id: Date.now() + 2,
     date: gState.selectedDate,
     category: "特変・バイタル異常",
     priority: "重要",
     status: "未対応",
     content: `【バイタル特変】${res ? res.name : ''} 様: ${parts.join(', ')}`,
     staff_name: staff
   });
 }

 db.save();
 loadDateRecords(gState.selectedDate);
 alert(`${res ? res.name : '利用者'}様のバイタルを${existingVital ? '訂正' : '登録'}しました！`);
}
// [Antigravity実装 2026-10-15] 排泄チェック表の固定ヘッダー（対象者表示・選択肢）を更新
function updateExcretionStickyHeader() {
  const textEl = document.getElementById("excretionTargetResidentText");
  const selectEl = document.getElementById("excretionResidentSelect");
  if (!textEl && !selectEl) return;
  const res = gState.residents.find(r => r.id === gState.selectedResidentId);
  if (textEl) {
    textEl.textContent = res ? `${res.name} 様（${res.room_no}号室）` : "未選択";
  }
  if (selectEl) {
    if (selectEl.options.length <= 1) {
      selectEl.innerHTML = '<option value="">-- 利用者を選択 --</option>';
      const activeResidents = (gState.residents || []).filter(r => r.status !== "退所");
      activeResidents.forEach(r => {
        const opt = document.createElement("option");
        opt.value = r.id;
        opt.textContent = `${r.room_no}号室 ${r.name} 様`;
        selectEl.appendChild(opt);
      });
    }
    selectEl.value = res ? String(res.id) : "";
  }
}

function renderExcretionTable() {
  // [Antigravity実装 2026-10-15] 固定ヘッダーの同期
  updateExcretionStickyHeader();
 const tbody = document.querySelector("#excretionHistoryTable tbody");
 if (!tbody) return;
 tbody.innerHTML = "";
 // [Claude修正] 保存した順ではなく、記録の時刻順に並べる (後から早い時刻を記録しても正しい位置に入る)
 const excretions = (db.data.excretions || []).filter(e => !e.voided && e.date === gState.selectedDate)
 .slice().sort((a, b) => (a.time || "").localeCompare(b.time || ""));

 excretions.forEach(e => {
 const res = gState.residents.find(r => r.id === e.resident_id);
 const tr = document.createElement("tr");
 const editCount = (e.edit_history && e.edit_history.length) ? `<div style="font-size:10.5px; color:#b45309;">訂正${e.edit_history.length}回</div>` : "";
 tr.innerHTML = `
 <td><strong>${escapeHtml(e.time || "")}</strong></td>
 <td>${res ? escapeHtml(res.name) + ' 様' : '-'}</td>
 <td>${e.urine_flag === 1 ? 'あり (＋)' : (e.urine_flag === 2 ? 'バルーン' : (e.urine_flag === 0 ? 'なし' : '-'))}</td>
 <td><span style="font-weight:bold; color:#b45309;">${escapeHtml(e.stool_amount || "-")}</span></td>
 <td>${escapeHtml(e.stool_condition || "-")}</td>
 <td>${escapeHtml(e.notes || '-')}</td>
 <td>
  <span style="display:inline-block; background:#dcfce7; color:#15803d; font-size:10.5px; font-weight:bold; padding:1px 5px; border-radius:4px; margin-right:4px;">記入済み</span>
  ${escapeHtml(e.staff_name || "未記録")}
  ${editCount}
 </td>
 <td style="white-space:nowrap;">
  <button type="button" class="btn btn-secondary" style="font-size:11px; padding:2px 8px;" onclick="editExcretionRecord(${Number(e.id)})">訂正</button>
 </td>
 `;
 tbody.appendChild(tr);
 });
}

// [Antigravity実装 2026-10-16] 排泄記録の訂正（理由必須・edit_history保存・同じidの中身を書き換え）
function editExcretionRecord(excId) {
 const rec = (db.data.excretions || []).find(e => Number(e.id) === Number(excId));
 if (!rec || rec.voided) return;
 const res = gState.residents.find(r => r.id === rec.resident_id);
 const newTime = prompt(`【${res ? res.name + " 様" : ""}】排泄記録の時間を入力してください (HH:MM):`, rec.time || "");
 if (newTime === null) return;
 const newUrineStr = prompt(`排尿を入力してください (1=あり, 0=なし, 2=バルーン):`, String(rec.urine_flag ?? 1));
 if (newUrineStr === null) return;
 const newAmount = prompt(`便の量を入力してください (なし / 付着 / 微量 / 少量 / 中量 / 多量):`, rec.stool_amount || "なし");
 if (newAmount === null) return;
 const newCond = prompt(`便の性状を入力してください (なし / 普通便 / 軟便 / 水様便 / 泥状便 / 硬便):`, rec.stool_condition || "なし");
 if (newCond === null) return;
 const newNotes = prompt(`備考を入力してください:`, rec.notes || "");
 if (newNotes === null) return;

 const parsedUrine = [0, 1, 2].includes(parseInt(newUrineStr, 10)) ? parseInt(newUrineStr, 10) : rec.urine_flag;
 const isSame = (rec.time || "") === newTime.trim() &&
   rec.urine_flag === parsedUrine &&
   (rec.stool_amount || "") === newAmount.trim() &&
   (rec.stool_condition || "") === newCond.trim() &&
   (rec.notes || "") === newNotes.trim();
 if (isSame) {
   alert("変更された内容がありません。");
   return;
 }
 const reason = cpPromptEditReason("排泄記録", `${rec.time || ""} ${cpFormatExcretionDetail(rec)}`);
 if (reason === null) return;

 const oldCopy = JSON.parse(JSON.stringify(rec));
 rec.time = newTime.trim() || rec.time;
 rec.urine_flag = parsedUrine;
 rec.stool_amount = newAmount.trim() || "なし";
 rec.stool_condition = newCond.trim() || "なし";
 rec.notes = newNotes.trim();
 rec.staff_name = cpLedgerStaff();
 cpAppendEditHistory(rec, oldCopy, ["time", "urine_flag", "stool_amount", "stool_condition", "notes"], reason);
 db.save();
 loadDateRecords(gState.selectedDate);
 alert("排泄記録を訂正しました。");
}

function submitExcretion() {
  // [Antigravity実装 2026-10-15] 利用者が選ばれていないときは保存できないようにする
  const targetRes = gState.residents.find(r => r.id === gState.selectedResidentId);
  if (!targetRes) {
    alert("利用者が選択されていません。上部の選択欄から入力する方を選んでください。");
    return;
  }
 const tmEl = document.getElementById("exTime");
 const urineEl = document.getElementById("exUrine");
 const amountEl = document.getElementById("exStoolAmount");
 const condEl = document.getElementById("exStoolCond");
 const notesEl = document.getElementById("exNotes");

 const tm = (tmEl ? tmEl.value : "") || new Date().toTimeString().slice(0, 5);
 const urineVal = urineEl ? urineEl.value : "";
 const amountVal = amountEl ? amountEl.value : "";
 const condVal = condEl ? condEl.value : "";
 const notes = notesEl ? notesEl.value.trim() : "";

 if (urineVal === "" && amountVal === "" && condVal === "" && !notes) {
   alert("排尿・便の量・性状・備考のいずれかを入力してください。");
   return;
 }
 // [Claude修正 2026-10-16] 書いていない欄は「未記入」のまま残す（以前は空欄が「排尿なし」「便なし」「普通便」として記録されていた）
 const urine = urineVal !== "" ? parseInt(urineVal, 10) : null;
 const amount = amountVal;
 const cond = condVal || (amount === "なし" ? "なし" : "");
 const staff = cpLedgerStaff();

 db.data.excretions.unshift({
 id: Date.now(),
 date: gState.selectedDate,
 time: tm,
 resident_id: gState.selectedResidentId,
 urine_flag: urine,
 stool_amount: amount,
 stool_condition: cond,
 notes: notes,
 staff_name: staff
 });
 db.save();

 if (tmEl) tmEl.value = "";
 if (urineEl) urineEl.value = "";
 if (amountEl) amountEl.value = "";
 if (condEl) condEl.value = "";
 if (notesEl) notesEl.value = "";
 loadDateRecords(gState.selectedDate);
 alert("排泄記録を保存しました！");
}

// 3. 食事 ＆ 水分表 (1日累計自動計算)
// [Antigravity実装 2026-10-15] 食事摂取量の表示フォーマット（nullを「ー」と表示し0割やundefinedを防止）
function cpFormatMealRatio(m) {
  if (!m) return '<span style="color:#94a19a;">-</span>';
  const mainVal = (m.main_dish_ratio === null || m.main_dish_ratio === undefined) ? "ー" : `${m.main_dish_ratio}割`;
  const sideVal = (m.side_dish_ratio === null || m.side_dish_ratio === undefined) ? "ー" : `${m.side_dish_ratio}割`;
  let ratioStr = "";
  if (m.main_dish_ratio === null && m.side_dish_ratio === null) {
    ratioStr = "ー";
  } else if (m.side_dish_ratio === null) {
    ratioStr = mainVal;
  } else if (m.main_dish_ratio === null) {
    ratioStr = `副:${sideVal}`;
  } else {
    ratioStr = `${m.main_dish_ratio}/${m.side_dish_ratio}割`;
  }
  return `${ratioStr} (${m.water_ml || 0}ml)`;
}

// [Antigravity実装 2026-10-16] 食事区分の切り替え即時ハンドラ（既存記録があれば記入済み表示＆値を反映、なければ空欄から始める）
function cpOnMealTypeChange(resId) {
  const typeEl = document.getElementById(`mType_${resId}`);
  const mainEl = document.getElementById(`mMain_${resId}`);
  const sideEl = document.getElementById(`mSide_${resId}`);
  const waterEl = document.getElementById(`mWater_${resId}`);
  const statusEl = document.getElementById(`mStatus_${resId}`);
  const btnEl = document.getElementById(`mSaveBtn_${resId}`);
  if (!typeEl || !mainEl || !sideEl) return;
  const type = typeEl.value;
  // [Claude修正 2026-10-16] 記入済み・訂正になるのは朝食・昼食・夕食だけ。おやつ・その他（水分）は毎回新しい記録なので前の値を入れない
  const existing = ["朝食", "昼食", "夕食"].includes(type) ? (db.data.meals || []).find(m => !m.voided && m.date === gState.selectedDate && m.resident_id === resId && m.meal_type === type) : null;

  if (statusEl) {
    statusEl.innerHTML = existing ? cpFilledBadgeHtml(cpFormatMealDetail(existing), existing.staff_name, existing.time || "", existing.edit_history) : "";
  }
  if (btnEl) {
    btnEl.textContent = existing ? "訂正して保存" : "記録";
  }

  if (type === "その他") {
    mainEl.type = "text"; mainEl.value = "ー"; mainEl.disabled = true;
    mainEl.style.background = "#f1f5f9"; mainEl.style.color = "#64748b";
    sideEl.type = "text"; sideEl.value = "ー"; sideEl.disabled = true;
    sideEl.style.background = "#f1f5f9"; sideEl.style.color = "#64748b";
  } else if (type === "おやつ") {
    mainEl.disabled = false; mainEl.type = "number";
    mainEl.min = "0"; mainEl.max = "10";
    mainEl.style.background = ""; mainEl.style.color = "";
    mainEl.value = (existing && existing.main_dish_ratio !== null && existing.main_dish_ratio !== undefined) ? existing.main_dish_ratio : "";
    sideEl.type = "text"; sideEl.value = "ー"; sideEl.disabled = true;
    sideEl.style.background = "#f1f5f9"; sideEl.style.color = "#64748b";
  } else {
    mainEl.disabled = false; mainEl.type = "number";
    mainEl.min = "0"; mainEl.max = "10";
    mainEl.style.background = ""; mainEl.style.color = "";
    mainEl.value = (existing && existing.main_dish_ratio !== null && existing.main_dish_ratio !== undefined) ? existing.main_dish_ratio : "";
    sideEl.disabled = false; sideEl.type = "number";
    sideEl.min = "0"; sideEl.max = "10";
    sideEl.style.background = ""; sideEl.style.color = "";
    sideEl.value = (existing && existing.side_dish_ratio !== null && existing.side_dish_ratio !== undefined) ? existing.side_dish_ratio : "";
  }
  if (waterEl) {
    waterEl.value = (existing && existing.water_ml !== null && existing.water_ml !== undefined) ? existing.water_ml : "";
  }
}

function renderMealsTable() {
 const tbody = document.querySelector("#mealsTable tbody");
 if (!tbody) return;
 tbody.innerHTML = "";
 const meals = (db.data.meals || []).filter(m => !m.voided && m.date === gState.selectedDate);

 cpResidentsOn(gState.selectedDate).forEach(r => {
 const userMeals = meals.filter(m => m.resident_id === r.id);
 const totalWater = userMeals.reduce((acc, cur) => acc + (cur.water_ml || 0), 0);
 const tr = document.createElement("tr");
 if (r.status !== "在所") tr.style.opacity = "0.5";

 // 既に記録されている時間帯の一覧表示
 const allMealsSummaryHtml = userMeals.length > 0
   ? `<div style="margin-top:4px; display:flex; flex-direction:column; gap:3px;">${userMeals.map(m => cpFilledBadgeHtml(cpFormatMealDetail(m), m.staff_name, m.time || "", m.edit_history)).join("")}</div>`
   : "";

 tr.innerHTML = `
 <td>${r.room_no}</td>
 <td>
   <strong>${r.name} 様</strong>
   ${allMealsSummaryHtml}
   <div id="mStatus_${r.id}"></div>
 </td>
 <td style="font-size:12px;">${escapeHtml(r.diet_type || '未登録')} / <span style="color:#dc2626;">${escapeHtml(r.allergies || '未登録')}</span></td>
 <td>
 <select id="mType_${r.id}" class="form-control" style="width:95px;" onchange="cpOnMealTypeChange(${r.id})">
  <option value="朝食">朝食</option>
  <option value="昼食">昼食</option>
  <option value="夕食">夕食</option>
  <option value="おやつ">おやつ</option>
  <option value="その他">その他</option>
</select>
 </td>
 <td><input type="number" id="mMain_${r.id}" class="form-control" style="width:70px;" value="" min="0" max="10" placeholder="0-10"></td>
 <td><input type="number" id="mSide_${r.id}" class="form-control" style="width:70px;" value="" min="0" max="10" placeholder="0-10"></td>
 <td><input type="number" id="mWater_${r.id}" class="form-control" style="width:85px;" value="" step="50" placeholder="ml"></td>
 <td><strong style="color:#0284c7; font-size:15px;">${totalWater} ml</strong></td>
 <td><button id="mSaveBtn_${r.id}" class="btn btn-primary" style="padding:6px 12px; font-size:13px;" onclick="saveMeal(${r.id})">記録</button></td>
 `;
 tbody.appendChild(tr);
 cpOnMealTypeChange(r.id);
 });
}

function saveMeal(resId) {
  const type = document.getElementById(`mType_${resId}`).value;
  const mainEl = document.getElementById(`mMain_${resId}`);
  const sideEl = document.getElementById(`mSide_${resId}`);
  const waterEl = document.getElementById(`mWater_${resId}`);
  const mainRaw = mainEl ? String(mainEl.value).trim() : "";
  const sideRaw = sideEl ? String(sideEl.value).trim() : "";
  const waterRaw = waterEl ? String(waterEl.value).trim() : "";

  let main = null;
  let side = null;
  // [Antigravity実装 2026-10-16] 入力欄は空欄から始め、入れていないときは保存しない
  if (type === "その他") {
    if (waterRaw === "" || isNaN(parseInt(waterRaw, 10))) {
      alert("「その他」の水分量(ml)を入力してください。");
      return;
    }
    main = null;
    side = null;
  } else if (type === "おやつ") {
    if ((mainRaw === "" || mainRaw === "ー") && waterRaw === "") {
      alert("おやつの量（主食欄）または水分量を入力してください。");
      return;
    }
    main = (mainRaw !== "" && mainRaw !== "ー" && !isNaN(parseInt(mainRaw, 10))) ? parseInt(mainRaw, 10) : null;
    side = null;
  } else {
    if ((mainRaw === "" || mainRaw === "ー") && (sideRaw === "" || sideRaw === "ー") && waterRaw === "") {
      alert(`${type}の主食・副食・水分のいずれかを入力してください。`);
      return;
    }
    main = (mainRaw !== "" && mainRaw !== "ー" && !isNaN(parseInt(mainRaw, 10))) ? parseInt(mainRaw, 10) : null;
    side = (sideRaw !== "" && sideRaw !== "ー" && !isNaN(parseInt(sideRaw, 10))) ? parseInt(sideRaw, 10) : null;
  }
  const water = (waterRaw !== "" && !isNaN(parseInt(waterRaw, 10))) ? parseInt(waterRaw, 10) : 0;
  const staff = cpLedgerStaff();
  const nowTime = new Date().toTimeString().slice(0, 5);

  // [Claude修正 2026-10-16] 1日1回なのは朝食・昼食・夕食だけ。その他（水分）・おやつは何度でも記録できる
  // （以前は2回目の水分が1回目の「訂正」になって上書きされ、1日の水分の合計も合わなかった）
  const existing = ["朝食", "昼食", "夕食"].includes(type) ? (db.data.meals || []).find(m => !m.voided && m.date === gState.selectedDate && m.resident_id === resId && m.meal_type === type) : null;
  if (existing) {
    const isSame = (existing.main_dish_ratio ?? null) === main &&
      (existing.side_dish_ratio ?? null) === side &&
      (existing.water_ml ?? 0) === water;
    if (isSame) {
      alert("変更された内容がありません。");
      return;
    }
    const reason = cpPromptEditReason(`${type}の記録`, cpFormatMealDetail(existing));
    if (reason === null) return;
    const oldCopy = JSON.parse(JSON.stringify(existing));
    existing.main_dish_ratio = main;
    existing.side_dish_ratio = side;
    existing.water_ml = water;
    existing.time = nowTime;
    existing.staff_name = staff;
    cpAppendEditHistory(existing, oldCopy, ["main_dish_ratio", "side_dish_ratio", "water_ml", "time"], reason);
  } else {
    db.data.meals.push({
      id: Date.now(),
      date: gState.selectedDate,
      time: nowTime,
      meal_type: type,
      resident_id: resId,
      main_dish_ratio: main,
      side_dish_ratio: side,
      water_ml: water,
      staff_name: staff
    });
  }
  db.save();

  loadDateRecords(gState.selectedDate);
  alert(`${type}の食事・水分摂取量を${existing ? '訂正' : '記録'}しました！`);
}

// 4. 入浴 ＆ 塗布薬 [Antigravity実装 2026-10-16]
function renderBathTable() {
 const tbody = document.querySelector("#bathTable tbody");
 if (!tbody) return;
 tbody.innerHTML = "";
 const baths = (db.data.baths || []).filter(b => !b.voided && b.date === gState.selectedDate);
 const bathTypes = [["一般浴", "一般浴"], ["特浴", "特浴(機械浴)"], ["清拭", "清拭"], ["見合わせ", "見合わせ"]];

 cpResidentsOn(gState.selectedDate).forEach(r => {
 const b = baths.find(x => x.resident_id === r.id);
 const cur = b ? (b.bath_type || "") : "";
 let opts = `<option value="" ${cur === "" ? "selected" : ""}>選んでください</option>`;
 opts += bathTypes.map(([v, label]) => `<option value="${v}" ${cur === v ? "selected" : ""}>${label}</option>`).join("");
 if (cur && !bathTypes.some(([v]) => v === cur)) opts += `<option value="${escapeHtml(cur)}" selected>${escapeHtml(cur)}</option>`;
 const tr = document.createElement("tr");
 const filledHtml = b ? cpFilledBadgeHtml(cpFormatBathDetail(b), b.staff_name, b.time || "") : "";

 tr.innerHTML = `
 <td>${r.room_no}</td>
 <td>
   <strong>${r.name} 様</strong>
   ${filledHtml}
 </td>
 <td>
 <select id="bathType_${r.id}" class="form-control" style="width:130px;">${opts}</select>
 </td>
 <td><input type="text" id="bathNotes_${r.id}" class="form-control" value="${escapeHtml(b ? (b.ointment_notes || "") : "")}" placeholder="入浴時の皮膚の様子など"></td>
 <td><button class="btn btn-primary" style="padding:6px 12px; font-size:13px;" onclick="saveBath(${r.id})">${b ? '訂正して保存' : '保存'}</button></td>
 `;
 tbody.appendChild(tr);
 });
}

function saveBath(resId) {
 const type = document.getElementById(`bathType_${resId}`).value;
 const notes = document.getElementById(`bathNotes_${resId}`).value.trim();
 const staff = cpLedgerStaff();
 const nowTime = new Date().toTimeString().slice(0, 5);
 if (!type) {
 alert("入浴区分（一般浴・特浴・清拭・見合わせ）を選んでから保存してください。\n塗り薬・湿布は「塗布薬・湿布」のタブで記録します。");
 return;
 }

 let existing = (db.data.baths || []).find(b => !b.voided && b.date === gState.selectedDate && b.resident_id === resId);
 if (existing) {
 const isSame = (existing.bath_type || "") === type && (existing.ointment_notes || "") === notes;
 if (isSame) {
   alert("変更された内容がありません。");
   return;
 }
 const reason = cpPromptEditReason("入浴記録", cpFormatBathDetail(existing));
 if (reason === null) return;
 const cpOldBath = JSON.parse(JSON.stringify(existing));
 existing.bath_type = type;
 existing.ointment_notes = notes;
 existing.time = nowTime;
 existing.staff_name = staff;
 cpAppendEditHistory(existing, cpOldBath, ["bath_type", "ointment_notes", "time"], reason);
 } else {
 db.data.baths.push({
 id: Date.now(),
 date: gState.selectedDate,
 time: nowTime,
 resident_id: resId,
 bath_type: type,
 ointment_notes: notes,
 staff_name: staff
 });
 }
 db.save();

 loadDateRecords(gState.selectedDate);
 alert(`入浴記録を${existing ? '訂正' : '保存'}しました。`);
}

// [Claude追加] 塗布薬・湿布（入浴から分けた）。
// 皮膚・身体シェーマ図に登録した塗り薬・湿布を利用者ごとに並べ、指示の時間ごとに記録する。
// 湿布は1回押すと「その時間に貼布対応した（前の湿布をはがして貼った）」の意味（ユーザーと決定: はがした・貼ったを別々に押すのは手間）。
// 記録は消さずに取消（理由必須）。褥瘡・発赤、打撲・創傷は「看護師・主治医の指示に従う」と表示する
// （根拠: 医政発第0726005号「皮膚への軟膏の塗布（褥瘡の処置を除く。）」。持続する発赤は褥瘡の段階に含まれる。claude/medical_check_20261009_evening.md）
const CP_TOPICAL_TIMINGS = ["朝", "昼", "夕", "就寝前", "入浴後"];
const CP_TOPICAL_NURSE_CATEGORIES = ["褥瘡・発赤", "打撲・創傷"];

function cpTopicalPins(resId) {
 return (db.data.body_schema_pins || []).filter(p => p && Number(p.resident_id) === Number(resId)
 && p.status !== "治癒・終了" && p.category !== "麻痺・拘縮" && String(p.item_name || "").trim());
}

function cpTopicalSlots(pin) {
 const f = String(pin.frequency || "");
 const hit = [];
 if (/朝/.test(f)) hit.push("朝");
 if (/昼/.test(f)) hit.push("昼");
 if (/夕/.test(f)) hit.push("夕");
 if (/就寝|眠前|寝る前/.test(f)) hit.push("就寝前");
 if (/入浴/.test(f)) hit.push("入浴後");
 // [Claude修正] 湿布は、お風呂の日に朝はがして入浴後に貼り直すことがある（現場の流れ・ユーザー）。指示に書いていなくても「入浴後」を出す
 if (pin.category === "湿布・貼付剤" && hit.length && !hit.includes("入浴後")) hit.push("入浴後");
 return hit.length ? hit : CP_TOPICAL_TIMINGS;
}

function cpTopicalFind(resId, pinId, slot) {
 return (db.data.topical_records || []).find(t => !t.voided && t.date === gState.selectedDate
 && Number(t.resident_id) === Number(resId) && Number(t.pin_id) === Number(pinId) && t.timing === slot);
}

function renderTopicalTable() {
 const tbody = document.querySelector("#topicalTable tbody");
 if (!tbody) return;
 tbody.innerHTML = "";
 cpResidentsOn(gState.selectedDate).forEach(r => {
 const pins = cpTopicalPins(r.id);
 if (!pins.length) {
 const tr = document.createElement("tr");
 tr.innerHTML = `<td>${r.room_no}</td><td><strong>${escapeHtml(r.name)} 様</strong></td>
 <td colspan="2" class="topical-empty">塗り薬・湿布の登録なし</td>`;
 tbody.appendChild(tr);
 return;
 }
 pins.forEach((p, i) => {
 const tr = document.createElement("tr");
 const nurse = CP_TOPICAL_NURSE_CATEGORIES.includes(p.category)
 ? `<div class="topical-nurse">看護師・主治医の指示に従って行う</div>` : "";
 // 根拠: 看護roo!「同じ場所に貼付すると、皮膚のトラブルを起こしやすくなる」、EPARKくすりの窓口（薬剤師）「毎回貼る位置をずらし」。
 // 「あれば看護師へ」はこのアプリの決まり（介護職の判断を超えるものは看護師・主治医へ）。claude/medical_check_20261009_evening.md
 const patchNote = p.category === "湿布・貼付剤"
 ? `<div class="topical-patch-note">前の湿布をはがし、位置を少しずらして貼る（同じ場所だとかぶれやすい）。はがしたときに、かゆみ・赤みがあれば看護師へ</div>` : "";
 const slots = cpTopicalSlots(p).map(slot => {
 const done = cpTopicalFind(r.id, p.id, slot);
 if (done) {
 const t = String(done.done_at || "").slice(11, 16);
 return `<button type="button" class="topical-slot is-done" onclick="toggleTopical(${r.id}, ${p.id}, '${slot}')" title="押すと取消（理由を入力）">${slot} 済 ${escapeHtml(t)} ${escapeHtml(done.staff_name || "")}</button>`;
 }
 return `<button type="button" class="topical-slot" onclick="toggleTopical(${r.id}, ${p.id}, '${slot}')">${slot}</button>`;
 }).join("");
 tr.innerHTML = `
 ${i === 0 ? `<td rowspan="${pins.length}">${r.room_no}</td><td rowspan="${pins.length}"><strong>${escapeHtml(r.name)} 様</strong></td>` : ""}
 <td>
 ${cpDrugLink(p.item_name, "topical-item rx-med-name")}
 <div class="topical-meta">${escapeHtml(p.category || "")} ／ ${escapeHtml(p.site_name || "")}${p.frequency ? ` ／ 指示: ${escapeHtml(p.frequency)}` : ""}</div>
 ${nurse}${patchNote}
 </td>
 <td><div class="topical-slots">${slots}</div></td>`;
 tbody.appendChild(tr);
 });
 });
}

function toggleTopical(resId, pinId, slot) {
 const r = (gState.residents || []).find(x => Number(x.id) === Number(resId));
 const p = (db.data.body_schema_pins || []).find(x => Number(x.id) === Number(pinId));
 if (!p) { alert("シェーマ図の登録が見つかりません。画面を開き直してください。"); return; }
 if (!Array.isArray(db.data.topical_records)) db.data.topical_records = [];
 const name = r ? r.name : "利用者";
 const done = cpTopicalFind(resId, pinId, slot);
 if (done) {
 if (cpVoidMedRecord(done, `${name}様の【${p.item_name}・${slot}】の記録`)) {
 db.save();
 renderTopicalTable();
 }
 return;
 }
 db.data.topical_records.push({
 id: Date.now(),
 date: gState.selectedDate,
 resident_id: Number(resId),
 pin_id: Number(pinId),
 category: p.category || "",
 site_name: p.site_name || "",
 item_name: p.item_name || "",
 timing: slot,
 done_at: toLocalDateTimeStr(new Date()),
 staff_name: document.getElementById("currentStaff").value
 });
 db.save();
 renderTopicalTable();
}

// 5. 口腔ケア
function renderOralTable() {
 const tbody = document.querySelector("#oralTable tbody");
 tbody.innerHTML = "";
 const oralCares = (db.data.oral_cares || []).filter(o => o.date === gState.selectedDate);

 cpResidentsOn(gState.selectedDate).forEach(r => {
 const tr = document.createElement("tr");

 const getOralBtn = (timing) => {
 const done = oralCares.find(o => o.resident_id === r.id && o.timing === timing);
 if (done) {
 return `<span style="display:inline-block; padding:4px 8px; font-size:12px; font-weight:bold; color:#15803d; background:#dcfce7; border-radius:4px; border:1px solid #86efac;"> 済 (${done.staff_name || '済'})</span>`;
 }
 return `<button class="btn btn-secondary" style="padding:4px 8px; font-size:12px;" onclick="saveOralCare(${r.id}, '${timing}')">${timing} 食後 </button>`;
 };

 tr.innerHTML = `
 <td>${r.room_no}</td>
 <td><strong>${r.name} 様</strong></td>
 <td style="font-size:12px; font-weight:bold; color:#0369a1;">${escapeHtml(r.oral_state || '未登録')}</td>
 <td>${getOralBtn("朝")}</td>
 <td>${getOralBtn("昼")}</td>
 <td>${getOralBtn("夕")}</td>
 <td><input type="text" id="oralNotes_${r.id}" class="form-control" placeholder="口内炎、残渣なし等" style="font-size:12px;"></td>
 `;
 tbody.appendChild(tr);
 });
}

function saveOralCare(resId, timing) {
 const r = gState.residents.find(x => x.id === resId);
 const exists = (db.data.oral_cares || []).some(o => o.date === gState.selectedDate && o.resident_id === resId && o.timing === timing);
 if (exists) {
 alert(`この方の【${timing}】の口腔ケアはすでに完了記録があります。`);
 return;
 }

 const notesEl = document.getElementById(`oralNotes_${resId}`);
 const notes = notesEl ? notesEl.value : "";
 const staff = document.getElementById("currentStaff").value;

 db.data.oral_cares.push({
 id: Date.now(), date: gState.selectedDate, timing: timing, resident_id: resId,
 oral_done: 1, denture_done: 1, notes: notes, staff_name: staff
 });
 db.save();
 renderOralTable();
 loadDateRecords(gState.selectedDate);
 alert(`${r ? r.name : '利用者'}様の【${timing}】口腔ケア・義歯洗浄を記録しました！`);
}

// 6. 服薬・点眼
function setMedTimingFilter(slot) {
 gState.medTimingFilter = slot;
 renderMedTable();
}

function renderMedTable() {
 // [Claude修正] 飲み薬は renderMedOral（時間帯ごとにまとめて記録）。この表は点眼だけ
 if (typeof renderMedOral === "function") renderMedOral();
 const tbody = document.querySelector("#medTable tbody");
 if (!tbody) return;
 tbody.innerHTML = "";
 const meds = (db.data.meds || []).filter(m => !m.voided && m.date === gState.selectedDate); // [Claude修正] 取消済みは表示しない
 const eyedropOrders = db.data.eyedrop_orders || [];

 cpResidentsOn(gState.selectedDate).forEach(r => {
 const tr = document.createElement("tr");
 // 点眼欄生成 (絵ではなく「右のみ」「左のみ」「両眼」を高コントラストバッジ明示、時間帯別切り替え対応)
 const order = eyedropOrders.find(e => e.resident_id === r.id && e.status !== "終了");
 let eyedropCellHtml = "";

 if (!order || order.eye === "指示なし") {
 eyedropCellHtml = `
 <div style="display:flex; justify-content:space-between; align-items:center;">
 <span style="color:#94a19a; font-size:12px;">指示なし</span>
 <button class="btn btn-secondary" style="font-size:11px; padding:2px 6px;" onclick="openEyedropOrderModal(${r.id})">指示追加</button>
 </div>
 `;
 } else {
 const eyeBadge = order.eye === "右のみ"
 ? `<span class="badge" style="background:#173f33; color:#ffffff; font-weight:bold; font-size:11px; padding:2px 6px;">[右のみ]</span>`
 : (order.eye === "左のみ"
 ? `<span class="badge" style="background:#065f46; color:#ffffff; font-weight:bold; font-size:11px; padding:2px 6px;">[左のみ]</span>`
 : `<span class="badge" style="background:#36443e; color:#ffffff; font-weight:bold; font-size:11px; padding:2px 6px;">[両眼]</span>`);

 const medTitle = cpDrugLink(order.medicine_name, "drug-link-inline drug-link-strong", "目薬");


 {
 // すべて表示時: 指示されている時間帯のボタンを並べて表示
 const targetSlots = order.timing_slots && order.timing_slots.length > 0 ? order.timing_slots : ["眠前"];
 const slotButtonsHtml = targetSlots.map(slot => {
 const done = meds.find(m => m.resident_id === r.id && (m.slot === `点眼(${slot})` || m.slot === `点眼_${slot}` || (m.slot === "点眼" && slot === "眠前")));
 if (done) {
 return `<button class="btn" style="background:#dcfce7; color:#15803d; border:1px solid #86efac; font-weight:bold; font-size:11px; padding:2px 6px; margin:2px;" onclick="toggleEyedrop(${r.id}, '${slot}')" title="クリックで解除">済 ${slot} (${done.staff_name || '済'})</button>`;
 }
 return `<button class="btn btn-outline" style="border-color:#1e5b47; color:#1a4f3d; font-size:11px; padding:2px 6px; margin:2px;" onclick="toggleEyedrop(${r.id}, '${slot}')">未 ${slot}</button>`;
 }).join("");

 eyedropCellHtml = `
 <div>
 <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:3px;">
 <div>${eyeBadge} ${medTitle}</div>
 <button class="btn btn-secondary" style="font-size:11px; padding:2px 6px;" onclick="openEyedropOrderModal(${r.id})" title="点眼処方指示を変更">変更</button>
 </div>
 <div style="display:flex; gap:2px; flex-wrap:wrap; align-items:center;">
 <span style="font-size:11px; color:#5f6d66; margin-right:2px;">実施:</span>
 ${slotButtonsHtml}
 </div>
 </div>
 `;
 }
 }

 tr.innerHTML = `
 <td>${r.room_no}</td>
 <td><strong>${r.name} 様</strong></td>
 <td>${eyedropCellHtml}</td>
 `;
 tbody.appendChild(tr);
 });
}

// [Claude修正] 記録を「取消」にする共通処理（消さずに、取消の日時・職員・理由を残す）
function cpVoidRecord(rec, label, customMsg) {
 if (!customMsg) return cpVoidMedRecord(rec, label);
 if (!rec || rec.voided) return false;
 const reason = prompt(customMsg, "");
 if (reason === null) return false;
 if (!reason.trim()) { alert("理由を入力してください。何も変更していません。"); return false; }
 rec.voided = true;
 rec.voided_at = toLocalDateTimeStr(new Date());
 rec.voided_by = cpLedgerStaff();
 rec.void_reason = reason.trim();
 return true;
}

// [Claude修正] 服薬・点眼の実施記録を「取消」にする（消さずに、取消の日時・職員・理由を残す）
function cpVoidMedRecord(rec, label) {
 if (!rec || rec.voided) return false;
 const reason = prompt(`${label}を「取消」にします。\n記録は消えずに、取消済みとして残ります。\n\n取消の理由を入力してください (例: 押し間違い、別の方の記録)`, "");
 if (reason === null) return false;
 if (!reason.trim()) { alert("取消の理由を入力してください。取消は行っていません。"); return false; }
 rec.voided = true;
 rec.voided_at = toLocalDateTimeStr(new Date());
 rec.voided_by = cpLedgerStaff();
 rec.void_reason = reason.trim();
 return true;
}

// [Claude修正] 日々の記録を上書きするとき、直す前の値を edit_history に残す（誰が・いつ・何から直したか）
// [Antigravity実装 2026-10-16] 訂正理由（reason）も edit_history に保存できるように拡張
function cpAppendEditHistory(target, old, fields, reason) {
 if (!target || !old) return;
 const norm = v => (v === undefined || v === "" ? null : v);
 const before = {};
 fields.forEach(f => { const x = norm(old[f]); before[f] = (x !== null && typeof x === "object") ? JSON.parse(JSON.stringify(x)) : x; });
 if (old.staff_name !== undefined) before.staff_name = norm(old.staff_name);
 const key = v => { const x = norm(v); return (x !== null && typeof x === "object") ? JSON.stringify(x) : String(x); };
 const changed = fields.some(f => key(old[f]) !== key(target[f]));
 const hist = Array.isArray(old.edit_history) ? old.edit_history.slice() : [];
 if (changed) {
  const entry = { edited_at: toLocalDateTimeStr(new Date()), edited_by: cpLedgerStaff(), before: before };
  if (reason) entry.reason = reason;
  hist.push(entry);
 }
 if (hist.length) target.edit_history = hist;
}

function saveMed(resId, slot) {
 const r = gState.residents.find(x => x.id === resId);
 const exists = (db.data.meds || []).some(m => !m.voided && m.date === gState.selectedDate && m.resident_id === resId && m.slot === slot);
 if (exists) {
 alert(`この方の【${slot}】の服薬はすでに完了記録があります。`);
 return;
 }

 const staff = document.getElementById("currentStaff").value;
 db.data.meds.push({
 id: Date.now(), date: gState.selectedDate, slot: slot, resident_id: resId, status: "済", staff_name: staff
 });
 db.save();
 renderMedTable();
 loadDateRecords(gState.selectedDate);
 alert(`${r ? r.name : '利用者'}様の【${slot}】服薬完了を記録しました！`);
}

function toggleMed(resId, slot) {
 const r = gState.residents.find(x => x.id === resId);
 const idx = (db.data.meds || []).findIndex(m => !m.voided && m.date === gState.selectedDate && m.resident_id === resId && m.slot === slot);
 if (idx >= 0) {
 // [Claude修正] 服薬記録は消さずに「取消」にする（理由必須・記録は残る）
 if (cpVoidMedRecord(db.data.meds[idx], `${r ? r.name : '利用者'}様の【${slot}】服薬記録`)) {
 db.save();
 renderMedTable();
 loadDateRecords(gState.selectedDate);
 }
 return;
 }
 saveMed(resId, slot);
}

function toggleEyedrop(resId, slot) {
 const r = gState.residents.find(x => x.id === resId);
 const staff = document.getElementById("currentStaff")?.value || "職員";
 const meds = db.data.meds || [];
 const targetSlotKey = `点眼(${slot})`;
 const altKey = `点眼_${slot}`;
 const idx = meds.findIndex(m => !m.voided && m.date === gState.selectedDate && m.resident_id === resId && (m.slot === targetSlotKey || m.slot === altKey || (m.slot === "点眼" && slot === "眠前")));

 if (idx >= 0) {
 // [Claude修正] 点眼記録は消さずに「取消」にする（理由必須・記録は残る）
 if (cpVoidMedRecord(meds[idx], `${r ? r.name : '利用者'}様の【${slot}】点眼実施記録`)) {
 db.save();
 renderMedTable();
 loadDateRecords(gState.selectedDate);
 }
 return;
 }

 const order = (db.data.eyedrop_orders || []).find(e => e.resident_id === resId && e.status !== '終了');
 const eyeSide = order ? order.eye : "指示";
 const medName = order ? order.medicine_name : "点眼薬";

 db.data.meds.push({
 id: Date.now(),
 date: gState.selectedDate,
 slot: targetSlotKey,
 resident_id: resId,
 status: "済",
 staff_name: staff,
 eye: eyeSide,
 medicine_name: medName
 });
 db.save();
 renderMedTable();
 loadDateRecords(gState.selectedDate);
 alert(`${r ? r.name : '利用者'}様の【${slot}】点眼 (${eyeSide}・${medName}) 完了を記録しました！`);
}

// ==========================================
// [Claude追加 2026-10-09] 処方箋の画像・処方薬の一覧・飲み薬のまとめて記録
// ユーザーと決めたこと（claude/dev_log.md 19:42〜20:02）
// - 処方箋は日付ごとに画像で残し、2つの日付を左右に並べて見比べる（押すと拡大）
// - 処方薬の一覧（薬名・時間・1回の数・目的・資料）は看護師だけが書き込める。追加した人・日時・資料を残す
// - 介護職の確認は「袋の中の合計の数」だけ。足りないときは「数が合わない」で看護師へ報告（何が足りないかの確認と対応は看護師）
// - 飲み薬は時間帯ごとにまとめて付けて、最後に「保存」。保存前なら押し直すだけで直せる
// - 時刻は「記録した時刻（自動）」と「飲んだ時刻（時間どおり＝予定時刻、ずれたときだけ入力）」を分けて残す
// - 予定から2時間以上たって記録するときは「飲ませたことを確かめましたか？」。分からなければ「済」にせず看護師へ報告
// - 予定時刻を1時間過ぎても記録がない方は、お知らせに出す
// ==========================================
const CP_RX_TIMINGS = [
 { key: "起床時", slot: "起床時", time: "06:30" },
 { key: "朝食前", slot: "朝食前", time: "07:30" },
 { key: "朝食後", slot: "朝", time: "08:00" },
 { key: "昼食前", slot: "昼食前", time: "11:30" },
 { key: "昼食後", slot: "昼", time: "12:30" },
 { key: "夕食前", slot: "夕食前", time: "17:30" },
 { key: "夕食後", slot: "夕", time: "18:30" },
 { key: "眠前", slot: "眠前", time: "20:30" }
];
// 処方薬の一覧がまだない方は、これまでどおりの4つの時間帯で記録する
const CP_RX_FALLBACK_TIMINGS = ["朝食後", "昼食後", "夕食後", "眠前"];
const CP_RX_UNITS = ["錠", "包", "カプセル"];
const CP_RX_SOURCES = ["処方箋", "お薬手帳", "医師・看護師の指示", "その他"];
const CP_MED_LATE_MINUTES = 120;
const CP_MED_MISSING_MINUTES = 60;

function cpRxTiming(key) { return CP_RX_TIMINGS.find(t => t.key === key) || null; }
function cpRxTimingBySlot(slot) { return CP_RX_TIMINGS.find(t => t.slot === slot) || null; }
function cpRxSlotTime(key) {
 const custom = db.data.med_slot_times && db.data.med_slot_times[key];
 if (custom && /^\d{2}:\d{2}$/.test(custom)) return custom;
 const t = cpRxTiming(key);
 return t ? t.time : "00:00";
}
function cpLoginStaffName() {
 return (gState.session && gState.session.staffName) || cpLedgerStaff();
}
function cpStaffRoleOf(name) {
 const st = (gState.stamps || []).find(s => (s && (s.name || s)) === name);
 return st && st.role ? String(st.role) : "";
}
function cpIsNurseStaff(name) { return cpStaffRoleOf(name).includes("看護"); }
function cpIsCurrentNurse() { return cpIsNurseStaff(cpLoginStaffName()); }
function cpResidentIsHere(r) { return r && r.status !== "入院中" && r.status !== "退所"; }
function cpNowHHMM() { return toLocalDateTimeStr(new Date()).slice(11, 16); }
function cpMinutes(hhmm) { const m = String(hhmm || "").match(/^(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; }

// ---------- 処方薬の一覧 ----------
function cpActiveRxMeds(resId) {
 return (db.data.resident_medications || []).filter(m => m && !m.voided && m.status !== "中止" && Number(m.resident_id) === Number(resId));
}
// 時間の決まった薬（頓服だけの薬は服薬チェック表に出さない）
function cpScheduledRxMeds(resId) {
 return cpActiveRxMeds(resId).filter(m => (m.timings || []).some(t => t && Number(t.count) > 0));
}
function cpResidentHasRxList(resId) { return cpScheduledRxMeds(resId).length > 0; }
function cpResidentTimings(resId) {
 const meds = cpScheduledRxMeds(resId);
 if (!meds.length) return CP_RX_FALLBACK_TIMINGS.slice();
 const used = new Set();
 meds.forEach(m => (m.timings || []).forEach(t => { if (t && Number(t.count) > 0) used.add(t.key); }));
 return CP_RX_TIMINGS.map(t => t.key).filter(k => used.has(k));
}
// 袋の中の合計（単位ごと）。例: 「3錠・1包」
function cpBagText(resId, timingKey) {
 const sum = {};
 cpActiveRxMeds(resId).forEach(m => (m.timings || []).forEach(t => {
 if (t.key === timingKey && Number(t.count) > 0) { const u = m.unit || "錠"; sum[u] = (sum[u] || 0) + Number(t.count); }
 }));
 const parts = CP_RX_UNITS.filter(u => sum[u]).map(u => `${sum[u]}${u}`);
 Object.keys(sum).filter(u => !CP_RX_UNITS.includes(u)).forEach(u => parts.push(`${sum[u]}${u}`));
 return parts.join("・");
}

// ---------- 処方箋と処方薬 モーダル ----------
let cpRxState = { resId: null, tab: "meds", pickedDataUrl: "", editId: null, cmpLeft: null, cmpRight: null };

function openRxModal(resId, tab) {
 const r = (gState.residents || []).find(x => Number(x.id) === Number(resId || gState.selectedResidentId));
 if (!r) { alert("利用者を選んでください。"); return; }
 cpRxState = { resId: r.id, tab: tab || "meds", pickedDataUrl: "", editId: null, cmpLeft: null, cmpRight: null };
 const title = document.getElementById("rxModalTitle");
 if (title) title.textContent = `${r.room_no}号室 ${r.name} 様の処方箋と処方薬`;
 const modal = document.getElementById("rxModal");
 if (modal) modal.style.display = "flex";
 renderRxModal();
}

function switchRxTab(tab) {
 cpRxState.tab = tab;
 cpRxState.editId = null;
 renderRxModal();
}

function cpRxList(resId) {
 return (db.data.prescriptions || []).filter(p => p && !p.voided && Number(p.resident_id) === Number(resId))
 .sort((a, b) => `${b.issued_date} ${b.uploaded_at}`.localeCompare(`${a.issued_date} ${a.uploaded_at}`));
}
function cpRxSrc(p) { return p.url || p.data_url || ""; }

function renderRxModal() {
 const body = document.getElementById("rxModalBody");
 if (!body) return;
 ["Meds", "Rx"].forEach(k => {
 const b = document.getElementById(`rxTab${k}`);
 if (b) b.classList.toggle("active", cpRxState.tab === k.toLowerCase());
 });
 body.innerHTML = cpRxState.tab === "rx" ? cpRenderRxImages() : cpRenderRxMeds();
}

function cpRenderRxImages() {
 const list = cpRxList(cpRxState.resId);
 const today = gState.selectedDate || toLocalDateStr(new Date());
 const opts = sel => list.map(p => `<option value="${p.id}" ${String(p.id) === String(sel) ? "selected" : ""}>${escapeHtml(p.issued_date)} の処方箋</option>`).join("");
 if (cpRxState.cmpLeft === null && list[1]) cpRxState.cmpLeft = list[1].id;
 if (cpRxState.cmpRight === null && list[0]) cpRxState.cmpRight = list[0].id;
 const pane = id => {
 const p = list.find(x => String(x.id) === String(id));
 if (!p) return `<div class="rx-cmp-empty">処方箋を選んでください</div>`;
 const cap = `${p.issued_date} の処方箋（登録 ${p.uploaded_at} ${p.uploaded_by || ""}）`;
 return `<button type="button" class="rx-cmp-img" onclick="openLightbox('${escapeHtml(cpRxSrc(p))}', '${escapeHtml(cap)}')" title="押すと大きく表示">
 <img src="${escapeHtml(cpRxSrc(p))}" alt="${escapeHtml(cap)}"></button>
 <div class="rx-cmp-cap">${escapeHtml(cap)}</div>`;
 };
 const cards = list.map(p => `
 <div class="rx-item">
 <button type="button" class="rx-thumb" onclick="openLightbox('${escapeHtml(cpRxSrc(p))}', '${escapeHtml(p.issued_date)} の処方箋')"><img src="${escapeHtml(cpRxSrc(p))}" alt="${escapeHtml(p.issued_date)} の処方箋"></button>
 <div class="rx-item-meta">
 <div><strong>${escapeHtml(p.issued_date)}</strong> の処方箋</div>
 <div class="rx-sub">登録 ${escapeHtml(p.uploaded_at || "")} ${escapeHtml(p.uploaded_by || "")}${p.note ? ` ／ ${escapeHtml(p.note)}` : ""}</div>
 <button type="button" class="btn btn-secondary rx-small" onclick="voidRxImage(${p.id})">取消</button>
 </div>
 </div>`).join("");
 return `
 <section class="rx-section">
 <h4>見比べる</h4>
 ${list.length >= 1 ? `
 <div class="rx-cmp-selects">
 <select class="form-control" onchange="cpRxState.cmpLeft=this.value; renderRxModal();">${opts(cpRxState.cmpLeft)}</select>
 <select class="form-control" onchange="cpRxState.cmpRight=this.value; renderRxModal();">${opts(cpRxState.cmpRight)}</select>
 </div>
 <div class="rx-cmp">
 <div class="rx-cmp-pane">${pane(cpRxState.cmpLeft)}</div>
 <div class="rx-cmp-pane">${pane(cpRxState.cmpRight)}</div>
 </div>
 <p class="panel-note">画像を押すと大きく表示します。薬の写真を見比べて、ある日とない日の違いを確かめられます。</p>`
 : `<p class="panel-note">まだ処方箋が登録されていません。下から追加してください。</p>`}
 </section>
 <section class="rx-section">
 <h4>処方箋を追加する</h4>
 <div class="rx-add">
 <label>処方日 <input type="date" id="rxIssuedDate" class="form-control" value="${escapeHtml(today)}"></label>
 <label>画像 <input type="file" id="rxFileInput" accept="image/*" class="form-control" onchange="cpPickRxFile(event)"></label>
 <label>メモ（任意） <input type="text" id="rxNote" class="form-control" maxlength="100"></label>
 <button type="button" class="btn btn-primary" onclick="saveRxImage()">登録する</button>
 </div>
 <img id="rxPreview" class="rx-preview" alt="" style="display:none;">
 </section>
 <section class="rx-section">
 <h4>登録した処方箋（新しい順）</h4>
 ${cards || `<p class="panel-note">まだありません。</p>`}
 </section>`;
}

function cpPickRxFile(event) {
 const file = event.target.files && event.target.files[0];
 cpRxState.pickedDataUrl = "";
 if (!file) return;
 const reader = new FileReader();
 reader.onload = e => {
 const img = new Image();
 img.onload = () => {
 // 処方箋の文字と薬の写真が読める大きさ（長い辺 1600px）にそろえる
 const maxDim = 1600;
 let w = img.width, h = img.height;
 if (w > maxDim || h > maxDim) { if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; } else { w = Math.round(w * maxDim / h); h = maxDim; } }
 const canvas = document.createElement("canvas");
 canvas.width = w; canvas.height = h;
 canvas.getContext("2d").drawImage(img, 0, 0, w, h);
 cpRxState.pickedDataUrl = canvas.toDataURL("image/jpeg", 0.85);
 const pv = document.getElementById("rxPreview");
 if (pv) { pv.src = cpRxState.pickedDataUrl; pv.style.display = "block"; }
 };
 img.src = e.target.result;
 };
 reader.readAsDataURL(file);
}

async function saveRxImage() {
 const date = (document.getElementById("rxIssuedDate") || {}).value || "";
 const note = ((document.getElementById("rxNote") || {}).value || "").trim();
 if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { alert("処方日を入れてください。"); return; }
 if (!cpRxState.pickedDataUrl) { alert("処方箋の画像を選んでください。"); return; }
 const rec = { id: Date.now(), resident_id: cpRxState.resId, issued_date: date, note: note, uploaded_at: toLocalDateTimeStr(new Date()), uploaded_by: cpLoginStaffName() };
 if (db.isServerMode) {
 // サーバー接続時は画像をファイルとして保存し、全データには保存場所だけを入れる
 try {
 const res = await cpApiFetch("/api/prescription-upload", {
 method: "POST", headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ resident_id: cpRxState.resId, date: date, data: cpRxState.pickedDataUrl })
 });
 if (!res.ok) { alert("処方箋の画像を保存できませんでした。通信を確かめて、もう一度登録してください。"); return; }
 const j = await res.json();
 rec.url = j.url;
 if (j.uploaded_by) rec.uploaded_by = j.uploaded_by;
 } catch (e) {
 alert("処方箋の画像を保存できませんでした。通信を確かめて、もう一度登録してください。");
 return;
 }
 } else {
 rec.data_url = cpRxState.pickedDataUrl; // 単体起動（このPCだけ）のときはデータの中に入れる
 }
 if (!Array.isArray(db.data.prescriptions)) db.data.prescriptions = [];
 db.data.prescriptions.push(rec);
 db.save();
 cpRxState.pickedDataUrl = "";
 cpRxState.cmpLeft = null; cpRxState.cmpRight = null;
 renderRxModal();
 alert(`${date} の処方箋を登録しました。`);
}

function voidRxImage(id) {
 const p = (db.data.prescriptions || []).find(x => Number(x.id) === Number(id));
 if (!p) return;
 if (cpVoidMedRecord(p, `${p.issued_date} の処方箋の画像`)) {
 db.save();
 cpRxState.cmpLeft = null; cpRxState.cmpRight = null;
 renderRxModal();
 }
}

// ---------- 処方薬の一覧（看護師だけ書き込める） ----------
function cpRenderRxMeds() {
 const nurse = cpIsCurrentNurse();
 const all = (db.data.resident_medications || []).filter(m => m && !m.voided && Number(m.resident_id) === Number(cpRxState.resId));
 const active = all.filter(m => m.status !== "中止");
 const stopped = all.filter(m => m.status === "中止");
 const timingText = m => (m.timings || []).filter(t => Number(t.count) > 0).map(t => `${t.key} ${t.count}${m.unit || "錠"}`)
 .concat(m.prn && Number(m.prn.count) > 0 ? [`頓服 1回${m.prn.count}${m.unit || "錠"}（${m.prn.when || "指示のとき"}）`] : []).join("、");
 const row = (m, isActive) => `
 <div class="rx-med ${isActive ? "" : "is-stopped"}">
 <div class="rx-med-main">
 ${cpDrugLink(m.name, "rx-med-name")}
 <div class="rx-sub">${escapeHtml(timingText(m))}</div>
 ${m.purpose ? `<div>何のため: ${escapeHtml(m.purpose)}</div>` : ""}
 ${m.prn && Number(m.prn.count) > 0 ? `<div class="rx-prn-note">頓服は服薬チェック表には出ません。使うときは看護師・主治医の指示に従ってください。</div>` : ""}
 <div class="rx-sub">資料: ${escapeHtml(m.source_type || "")}${m.source_detail ? `（${escapeHtml(m.source_detail)}）` : ""} ／ 追加 ${escapeHtml(m.added_at || "")} ${escapeHtml(m.added_by || "")}${(m.edit_history || []).length ? ` ／ 変更 ${m.edit_history.length}回` : ""}</div>
 ${isActive ? "" : `<div class="rx-sub">中止 ${escapeHtml(m.stopped_at || "")} ${escapeHtml(m.stopped_by || "")}（理由: ${escapeHtml(m.stop_reason || "-")}）</div>`}
 </div>
 ${nurse && isActive ? `<div class="rx-med-actions"><button type="button" class="btn btn-secondary rx-small" onclick="editRxMed(${m.id})">変更</button><button type="button" class="btn btn-secondary rx-small" onclick="stopRxMed(${m.id})">中止</button></div>` : ""}
 </div>`;
 const editing = nurse && cpRxState.editId !== null ? all.find(m => Number(m.id) === Number(cpRxState.editId)) : null;
 return `
 ${nurse ? "" : `<div class="rx-locked">処方薬の追加・変更は看護師だけができます。追加・変更したいときは看護師に依頼してください。</div>`}
 <section class="rx-section">
 <h4>飲んでいる薬（${active.length}）</h4>
 ${active.map(m => row(m, true)).join("") || `<p class="panel-note">まだ登録されていません。登録されるまで、服薬チェック表は「朝食後・昼食後・夕食後・眠前」で記録します。</p>`}
 </section>
 ${nurse ? cpRenderRxMedForm(editing) : ""}
 ${stopped.length ? `<details class="rx-section"><summary>中止した薬（${stopped.length}）</summary>${stopped.map(m => row(m, false)).join("")}</details>` : ""}`;
}

function cpRenderRxMedForm(m) {
 const rxDates = cpRxList(cpRxState.resId).map(p => p.issued_date);
 const cnt = key => { const t = m && (m.timings || []).find(x => x.key === key); return t ? t.count : ""; };
 const src = m ? m.source_type : "処方箋";
 return `
 <section class="rx-section rx-form">
 <h4>${m ? "薬の内容を変える" : "薬を追加する"}</h4>
 <div class="rx-form-grid">
 <label>薬の名前（処方箋のとおり） <input type="text" id="rxMedName" class="form-control" maxlength="80" value="${m ? escapeHtml(m.name) : ""}"></label>
 <label>単位 <select id="rxMedUnit" class="form-control">${CP_RX_UNITS.map(u => `<option ${m && m.unit === u ? "selected" : ""}>${u}</option>`).join("")}</select></label>
 </div>
 <div class="rx-timing-grid">
 ${CP_RX_TIMINGS.map(t => `<label>${t.key}<input type="number" min="0" max="20" step="0.5" inputmode="decimal" id="rxMedCnt_${t.key}" class="form-control" value="${escapeHtml(String(cnt(t.key)))}"></label>`).join("")}
 </div>
 <p class="panel-note">飲む時間帯に、1回に飲む数を入れます（飲まない時間帯は空欄）。</p>
 <div class="rx-form-grid rx-prn-grid">
 <label>頓服（1回の数） <input type="number" min="0" max="20" step="0.5" inputmode="decimal" id="rxMedPrnCount" class="form-control" value="${m && m.prn ? escapeHtml(String(m.prn.count)) : ""}"></label>
 <label>頓服を使うとき（処方箋のとおり） <input type="text" id="rxMedPrnWhen" class="form-control" maxlength="60" value="${m && m.prn ? escapeHtml(m.prn.when || "") : ""}"></label>
 </div>
 <p class="panel-note">頓服（決まった時間ではなく、必要なときに使う薬）は、服薬チェック表には出ません。</p>
 <label class="rx-block">何のため（処方箋や薬の説明書きのとおり） <input type="text" id="rxMedPurpose" class="form-control" maxlength="120" value="${m ? escapeHtml(m.purpose || "") : ""}"></label>
 <div class="rx-form-grid">
 <label>何を見て書いたか <select id="rxMedSource" class="form-control">${CP_RX_SOURCES.map(s => `<option ${src === s ? "selected" : ""}>${s}</option>`).join("")}</select></label>
 <label>資料の詳しい内容（処方日など） <input type="text" id="rxMedSourceDetail" class="form-control" list="rxMedSourceDates" maxlength="80" value="${m ? escapeHtml(m.source_detail || "") : (rxDates[0] ? `${rxDates[0]} の処方箋` : "")}">
 <datalist id="rxMedSourceDates">${rxDates.map(d => `<option value="${escapeHtml(d)} の処方箋">`).join("")}</datalist></label>
 </div>
 ${m ? `<label class="rx-block">変更の理由 <input type="text" id="rxMedEditReason" class="form-control" maxlength="120"></label>` : ""}
 <div class="rx-form-actions">
 ${m ? `<button type="button" class="btn btn-secondary" onclick="cpRxState.editId=null; renderRxModal();">やめる</button>` : ""}
 <button type="button" class="btn btn-primary" onclick="saveRxMed()">${m ? "変更を保存" : "追加する"}</button>
 </div>
 </section>`;
}

function editRxMed(id) {
 if (!cpIsCurrentNurse()) { alert("処方薬の変更は看護師だけができます。看護師に依頼してください。"); return; }
 cpRxState.editId = id;
 renderRxModal();
 const f = document.querySelector("#rxModalBody .rx-form");
 if (f) f.scrollIntoView({ block: "start" });
}

function saveRxMed() {
 // 画面のボタンを隠すだけでなく、保存の処理でも看護師かどうかを確かめる
 if (!cpIsCurrentNurse()) { alert("処方薬の追加・変更は看護師だけができます。看護師に依頼してください。"); return; }
 const val = id => ((document.getElementById(id) || {}).value || "").trim();
 const name = val("rxMedName");
 if (!name) { alert("薬の名前を入れてください。"); return; }
 const timings = [];
 for (const t of CP_RX_TIMINGS) {
 const raw = val(`rxMedCnt_${t.key}`);
 if (!raw) continue;
 const n = Number(raw);
 if (!(n > 0) || n > 20) { alert(`${t.key}の数を正しく入れてください（0より大きい数）。`); return; }
 timings.push({ key: t.key, count: n });
 }
 const prnRaw = val("rxMedPrnCount");
 const prnWhen = val("rxMedPrnWhen");
 let prn = null;
 if (prnRaw) {
 const pc = Number(prnRaw);
 if (!(pc > 0) || pc > 20) { alert("頓服の1回の数を正しく入れてください（0より大きい数）。"); return; }
 if (!prnWhen) { alert("頓服を使うとき（例: 処方箋に書かれた「〇〇のとき」）を入れてください。"); return; }
 prn = { count: pc, when: prnWhen };
 } else if (prnWhen) { alert("頓服の1回の数を入れてください。頓服でなければ「使うとき」を空欄にしてください。"); return; }
 if (!timings.length && !prn) { alert("飲む時間帯と1回の数、または頓服を、少なくとも1つ入れてください。"); return; }
 const sourceType = val("rxMedSource");
 const sourceDetail = val("rxMedSourceDetail");
 if (!sourceType) { alert("何を見て書いたかを選んでください。"); return; }
 if (!Array.isArray(db.data.resident_medications)) db.data.resident_medications = [];
 const now = toLocalDateTimeStr(new Date());
 const who = cpLoginStaffName();
 const fields = { name: name, unit: val("rxMedUnit") || "錠", timings: timings, prn: prn, purpose: val("rxMedPurpose"), source_type: sourceType, source_detail: sourceDetail };
 if (cpRxState.editId !== null) {
 const target = db.data.resident_medications.find(m => Number(m.id) === Number(cpRxState.editId));
 if (!target) { alert("変更する薬が見つかりません。画面を開き直してください。"); return; }
 const reason = val("rxMedEditReason");
 if (!reason) { alert("変更の理由を入れてください（例: 処方変更 10/9）。"); return; }
 const old = JSON.parse(JSON.stringify(target));
 const before = (target.edit_history || []).length;
 Object.assign(target, fields);
 cpAppendEditHistory(target, old, Object.keys(fields));
 if ((target.edit_history || []).length > before) target.edit_history[target.edit_history.length - 1].reason = reason;
 else { alert("内容が変わっていません。"); return; }
 cpRxState.editId = null;
 } else {
 db.data.resident_medications.push(Object.assign({ id: Date.now(), resident_id: cpRxState.resId, status: "服用中", added_at: now, added_by: who }, fields));
 }
 db.save();
 renderRxModal();
 if (gState.activeCareTab === "med") renderMedTable();
}

function stopRxMed(id) {
 if (!cpIsCurrentNurse()) { alert("処方薬の中止は看護師だけができます。看護師に依頼してください。"); return; }
 const m = (db.data.resident_medications || []).find(x => Number(x.id) === Number(id));
 if (!m) return;
 const reason = prompt(`「${m.name}」を中止にします。記録は消えずに「中止した薬」に残ります。\n\n中止の理由を入れてください（例: 処方終了 10/9）`, "");
 if (reason === null) return;
 if (!reason.trim()) { alert("中止の理由を入れてください。何も変えていません。"); return; }
 m.status = "中止"; m.stopped_at = toLocalDateTimeStr(new Date()); m.stopped_by = cpLoginStaffName(); m.stop_reason = reason.trim();
 db.save();
 renderRxModal();
 if (gState.activeCareTab === "med") renderMedTable();
}

// ---------- 飲み薬のまとめて記録 ----------
// 未保存の印: キー「日付|利用者ID|時間帯」→ { status: "済" | "未確認", time: "" (時間どおり) | "HH:MM" }
if (!gState.medPending) gState.medPending = {};

function cpMedPendingCount() { return Object.keys(gState.medPending || {}).length; }
function cpMedKey(date, resId, timingKey) { return `${date}|${resId}|${timingKey}`; }
function cpMedSavedRecord(date, resId, timingKey) {
 const t = cpRxTiming(timingKey);
 const slot = t ? t.slot : timingKey;
 return (db.data.meds || []).find(m => !m.voided && m.date === date && Number(m.resident_id) === Number(resId) && m.slot === slot);
}
function cpMedIsLate(date, timingKey) {
 const today = toLocalDateStr(new Date());
 if (date < today) return true;
 if (date > today) return false;
 const sched = cpMinutes(cpRxSlotTime(timingKey));
 return sched !== null && cpMinutes(cpNowHHMM()) > sched + CP_MED_LATE_MINUTES;
}
function cpMedTimingsInUse() {
 const used = new Set();
 (gState.residents || []).filter(cpResidentIsHere).forEach(r => cpResidentTimings(r.id).forEach(k => used.add(k)));
 return CP_RX_TIMINGS.map(t => t.key).filter(k => used.has(k));
}
function cpMedDefaultTiming(keys) {
 if (!keys.length) return null;
 const now = cpMinutes(cpNowHHMM());
 let pick = keys[0];
 keys.forEach(k => { if (cpMinutes(cpRxSlotTime(k)) <= now + 30) pick = k; });
 return pick;
}

function renderMedOral() {
 const area = document.getElementById("medOralArea");
 if (!area) return;
 const date = gState.selectedDate;
 const keys = cpMedTimingsInUse();
 if (!keys.includes(gState.medTiming)) gState.medTiming = cpMedDefaultTiming(keys);
 const cur = gState.medTiming;
 const here = (gState.residents || []).filter(cpResidentIsHere);
 const away = (gState.residents || []).filter(r => !cpResidentIsHere(r) && !cpIsDischarged(r));
 const chips = keys.map(k => {
 const targets = here.filter(r => cpResidentTimings(r.id).includes(k));
 const done = targets.filter(r => cpMedSavedRecord(date, r.id, k)).length;
 return `<button type="button" class="med-slot ${k === cur ? "active" : ""}" onclick="cpSelectMedTiming('${k}')">${k}<span class="med-slot-sub">${cpRxSlotTime(k)}・記録 ${done}/${targets.length}</span></button>`;
 }).join("");
 const late = cur ? cpMedIsLate(date, cur) : false;
 const rows = cur ? here.filter(r => cpResidentTimings(r.id).includes(cur)).map(r => cpMedRowHtml(r, cur, date, late)).join("") : "";
 const pending = cpMedPendingCount();
 area.innerHTML = `
 <div class="med-slots" role="tablist" aria-label="時間帯">${chips}</div>
 ${cur ? `
 <div class="med-toolbar">
 <div><strong>${escapeHtml(cur)}</strong>（予定 ${cpRxSlotTime(cur)}）${late ? `<span class="med-late-note">予定から2時間以上たっています。飲ませたことを確かめてから付けてください。</span>` : ""}</div>
 <button type="button" class="btn btn-secondary" onclick="cpMedMarkAll()">まだ付けていない方に「済」を付ける</button>
 </div>
 <div class="med-rows">${rows || `<p class="panel-note">この時間帯に飲む方はいません。</p>`}</div>
 ${away.length ? `<p class="panel-note">入院中・退所の方（${away.map(r => escapeHtml(r.name)).join("、")}）は表示していません。</p>` : ""}
 <p class="panel-note">袋の中の数を数えて、合っていれば「済」。押しただけではまだ保存されません。最後に「保存する」を押してください。数が足りないときは「数が合わない」（すぐに看護師への報告として記録されます）。</p>`
 : `<p class="panel-note">記録する時間帯がありません。</p>`}
 <div class="med-savebar ${pending ? "has-pending" : ""}">
 <span>${pending ? `未保存 ${pending}件` : "未保存はありません"}</span>
 <div>
 ${pending ? `<button type="button" class="btn btn-secondary" onclick="cpMedDiscardPending()">未保存を消す</button>` : ""}
 <button type="button" class="btn btn-primary" ${pending ? "" : "disabled"} onclick="saveMedPending()">保存する</button>
 </div>
 </div>`;
}

function cpMedRowHtml(r, k, date, late) {
 const hasList = cpResidentHasRxList(r.id);
 const bag = hasList ? cpBagText(r.id, k) : "";
 const bagHtml = hasList ? `<span class="med-bag">袋の中 <strong>${escapeHtml(bag)}</strong></span>` : `<span class="med-bag is-none">処方薬の一覧が未登録</span>`;
 const saved = cpMedSavedRecord(date, r.id, k);
 let action = "";
 if (saved) {
 const st = saved.status || "済";
 const given = saved.given_time ? `飲んだ ${escapeHtml(saved.given_time)}${saved.given_on_time ? "（時間どおり）" : ""}` : "";
 const label = st === "済" ? `済 ${given}` : (st === "数が合わない" ? "数が合わない（看護師へ報告済み）" : (st === "未確認" ? "飲ませたか分からない（看護師へ報告済み）" : escapeHtml(st)));
 const rec = saved.recorded_at ? `記録 ${escapeHtml(String(saved.recorded_at).slice(5, 16))}` : "";
 action = `<button type="button" class="med-saved ${st === "済" ? "is-done" : "is-alert"}" onclick="voidOralMed(${saved.id})" title="押すと取消（理由を入力）">${label}<span class="med-saved-sub">${rec} ${escapeHtml(saved.staff_name || "")}</span></button>`;
 } else {
 const key = cpMedKey(date, r.id, k);
 const p = gState.medPending[key];
 const timeInput = p && p.status === "済"
 ? `<label class="med-time">飲んだ時刻 <select onchange="cpMedSetTimeMode('${key}', this.value)"><option value="" ${!p.time ? "selected" : ""}>時間どおり（${cpRxSlotTime(k)}）</option><option value="other" ${p.time ? "selected" : ""}>ずれた</option></select>${p.time ? `<input type="time" value="${escapeHtml(p.time)}" onchange="cpMedSetTime('${key}', this.value)">` : ""}</label>` : "";
 action = `
 <button type="button" class="med-btn ${p && p.status === "済" ? "is-pending" : ""}" onclick="cpMedToggle('${key}', '済')">${p && p.status === "済" ? "済（未保存）" : "済"}</button>
 ${late ? `<button type="button" class="med-btn ${p && p.status === "未確認" ? "is-pending-alert" : ""}" onclick="cpMedToggle('${key}', '未確認')">${p && p.status === "未確認" ? "分からない（未保存）" : "分からない"}</button>` : ""}
 <button type="button" class="med-btn is-mismatch" onclick="reportMedCountMismatch(${r.id}, '${k}')">数が合わない</button>
 ${timeInput}`;
 }
 return `<div class="med-row"><div class="med-who"><strong>${escapeHtml(r.room_no)} ${escapeHtml(r.name)} 様</strong>${bagHtml}${hasList ? `<button type="button" class="tool-link" onclick="openRxModal(${r.id}, 'meds')">処方薬</button>` : ""}</div><div class="med-actions">${action}</div></div>`;
}

function cpSelectMedTiming(k) { gState.medTiming = k; renderMedOral(); }
function cpMedToggle(key, status) {
 const p = gState.medPending[key];
 if (p && p.status === status) delete gState.medPending[key];
 else gState.medPending[key] = { status: status, time: "" };
 renderMedOral();
}
function cpMedSetTimeMode(key, mode) {
 const p = gState.medPending[key];
 if (!p) return;
 p.time = mode === "other" ? cpNowHHMM() : "";
 renderMedOral();
}
function cpMedSetTime(key, v) { const p = gState.medPending[key]; if (p) p.time = v; }
function cpMedMarkAll() {
 const date = gState.selectedDate, k = gState.medTiming;
 if (!k) return;
 (gState.residents || []).filter(cpResidentIsHere).filter(r => cpResidentTimings(r.id).includes(k)).forEach(r => {
 const key = cpMedKey(date, r.id, k);
 if (!cpMedSavedRecord(date, r.id, k) && !gState.medPending[key]) gState.medPending[key] = { status: "済", time: "" };
 });
 renderMedOral();
}
function cpMedDiscardPending() {
 if (!confirm(`未保存の ${cpMedPendingCount()}件 を消します。よろしいですか？`)) return;
 gState.medPending = {};
 renderMedOral();
}

function cpMedCareRecord(resId, date, content, medId) {
 if (!Array.isArray(db.data.care_records)) db.data.care_records = [];
 const rec = { id: medId + 1, recorded_at: `${date} ${cpNowHHMM()}`, resident_id: Number(resId), category: "連絡", content: content, staff_name: cpLoginStaffName(), source_med_id: medId };
 db.data.care_records.unshift(rec);
}

function saveMedPending() {
 const keys = Object.keys(gState.medPending || {});
 if (!keys.length) return true;
 const lateDone = keys.filter(key => { const [d, , k] = key.split("|"); return gState.medPending[key].status === "済" && cpMedIsLate(d, k); });
 if (lateDone.length && !confirm(`予定の時間から2時間以上たってから付ける記録が ${lateDone.length}件あります。\n飲ませたことを確かめましたか？（空の袋、本人、一緒にいた職員など）\n\nOK：確かめた（保存する）\nキャンセル：戻る（分からない方は「分からない」を選んでください）`)) return false;
 const now = toLocalDateTimeStr(new Date());
 const who = cpLoginStaffName();
 let n = 0;
 keys.forEach(key => {
 const [date, rid, k] = key.split("|");
 const p = gState.medPending[key];
 if (cpMedSavedRecord(date, rid, k)) return; // 別の端末で先に記録されていたら重ねない
 const t = cpRxTiming(k);
 const id = Date.now() + n * 10;
 const rec = { id: id, date: date, slot: t ? t.slot : k, timing_key: k, resident_id: Number(rid), status: p.status, staff_name: who, recorded_at: now };
 const bag = cpResidentHasRxList(rid) ? cpBagText(rid, k) : "";
 if (bag) rec.bag = bag;
 if (p.status === "済") {
 rec.given_time = p.time || cpRxSlotTime(k);
 rec.given_on_time = !p.time;
 } else {
 cpMedCareRecord(rid, date, `服薬（${k}）: 飲ませたか確かめられなかったため「済」にせず、看護師へ報告。`, id);
 }
 db.data.meds.push(rec);
 n++;
 });
 gState.medPending = {};
 db.save();
 renderMedOral();
 loadDateRecords(gState.selectedDate);
 if (typeof checkGlobalAlerts === "function") checkGlobalAlerts();
 return true;
}

function reportMedCountMismatch(resId, k) {
 const r = (gState.residents || []).find(x => Number(x.id) === Number(resId));
 const date = gState.selectedDate;
 if (cpMedSavedRecord(date, resId, k)) { alert("この時間帯はすでに記録があります。直すときは、記録を押して取消にしてから付け直してください。"); return; }
 const bag = cpResidentHasRxList(resId) ? cpBagText(resId, k) : "";
 if (!confirm(`${r ? r.name : "利用者"}様の【${k}】の袋の中の数が合わないことを、看護師への報告として記録します。よろしいですか？\n${bag ? `（予定: ${bag}）\n` : ""}何が足りないかの確認と、その後の対応は看護師が行います。`)) return;
 const t = cpRxTiming(k);
 const id = Date.now();
 const rec = { id: id, date: date, slot: t ? t.slot : k, timing_key: k, resident_id: Number(resId), status: "数が合わない", staff_name: cpLoginStaffName(), recorded_at: toLocalDateTimeStr(new Date()) };
 if (bag) rec.bag = bag;
 db.data.meds.push(rec);
 cpMedCareRecord(resId, date, `服薬（${k}）: 袋の中の数が合わない${bag ? `（予定 ${bag}）` : ""}。看護師へ報告。`, id);
 delete gState.medPending[cpMedKey(date, resId, k)];
 db.save();
 renderMedOral();
 loadDateRecords(gState.selectedDate);
 if (typeof checkGlobalAlerts === "function") checkGlobalAlerts();
}

function voidOralMed(id) {
 const m = (db.data.meds || []).find(x => Number(x.id) === Number(id));
 if (!m) return;
 const r = (gState.residents || []).find(x => Number(x.id) === Number(m.resident_id));
 const label = `${r ? r.name : "利用者"}様の【${m.timing_key || m.slot}】服薬記録（${m.status || "済"}）`;
 if (!cpVoidMedRecord(m, label)) return;
 // 連動した介護記録も取消にする（消さずに残す）
 (db.data.care_records || []).forEach(c => {
 if (Number(c.source_med_id) === Number(id) && !c.voided) {
 c.voided = true; c.voided_at = m.voided_at; c.voided_by = m.voided_by; c.void_reason = `服薬記録の取消: ${m.void_reason}`;
 }
 });
 db.save();
 renderMedOral();
 loadDateRecords(gState.selectedDate);
 if (typeof checkGlobalAlerts === "function") checkGlobalAlerts();
}

// 画面を離れるときに未保存があれば聞く（OK: 保存する／キャンセル: 保存せずに進む）
function cpMedPendingGuard() {
 const n = cpMedPendingCount();
 if (!n) return;
 if (confirm(`未保存の服薬記録が ${n}件 あります。保存しますか？\n\nOK：保存する\nキャンセル：保存せずに進む（未保存の印は消えます）`)) {
 if (saveMedPending()) return;
 }
 gState.medPending = {};
}

// 予定時刻を1時間過ぎても記録がない方（今日の分・処方薬の一覧がある方だけ）
function cpMedMissingList() {
 const today = toLocalDateStr(new Date());
 const now = cpMinutes(cpNowHHMM());
 const out = [];
 CP_RX_TIMINGS.forEach(t => {
 if (cpMinutes(cpRxSlotTime(t.key)) + CP_MED_MISSING_MINUTES > now) return;
 const who = (gState.residents || []).filter(cpResidentIsHere).filter(r => cpResidentHasRxList(r.id) && cpResidentTimings(r.id).includes(t.key) && !cpMedSavedRecord(today, r.id, t.key));
 if (who.length) out.push({ key: t.key, residents: who });
 });
 return out;
}

// 予定時刻の変更（看護師・管理者）
function openMedSlotTimesEditor() {
 const name = cpLoginStaffName();
 if (!cpIsNurseStaff(name) && !(typeof isStaffAdminOrClerk === "function" && isStaffAdminOrClerk(name))) {
 alert("予定時刻の変更は、看護師・管理者だけができます。");
 return;
 }
 const cur = CP_RX_TIMINGS.map(t => `${t.key}=${cpRxSlotTime(t.key)}`).join(", ");
 const input = prompt(`服薬の予定時刻を変えます（施設の決まりに合わせてください）。\n「時間帯=時刻」をカンマで区切って入れます。\n\n今の設定:\n${cur}`, cur);
 if (input === null) return;
 const next = {};
 for (const part of input.split(",")) {
 const m = part.trim().match(/^(\S+?)=(\d{1,2}):(\d{2})$/);
 if (!m) continue;
 if (!cpRxTiming(m[1])) continue;
 const hh = Number(m[2]), mm = Number(m[3]);
 if (hh > 23 || mm > 59) continue;
 next[m[1]] = `${String(hh).padStart(2, "0")}:${m[3]}`;
 }
 if (!Object.keys(next).length) { alert("読み取れませんでした。何も変えていません。"); return; }
 const old = Object.assign({}, db.data.med_slot_times || {});
 db.data.med_slot_times = Object.assign({}, old, next);
 if (!Array.isArray(db.data.med_slot_times_history)) db.data.med_slot_times_history = [];
 db.data.med_slot_times_history.push({ edited_at: toLocalDateTimeStr(new Date()), edited_by: name, before: old });
 db.save();
 renderMedOral();
}

// [Claude追加 2026-10-09] 薬の説明（介護でよく出る薬）。
// 決まり: 互いに別の、信頼できる資料2つ以上で内容が一致したものだけを書く（1つだけの資料の内容は書かない）。
// 一致を確かめた資料と文は claude/drug_guide_sources.md に残してある。ここにない薬は「看護師に確認」と出す。
// what: どんな薬か / watch: 気をつけたい様子（見つけたら看護師へ） / how: 飲ませ方・使い方の注意
const CP_DRUG_GUIDE = [
 { name: "酸化マグネシウム", aliases: ["酸化マグネシウム", "マグミット", "重カマ"], kind: "飲み薬",
 what: "便秘の薬。腸の中に水分を保って便をやわらかくし、出しやすくする。",
 watch: ["吐き気・吐く", "脈が遅い", "力が入りにくい", "うとうとする（傾眠）", "（上の4つは、血液のマグネシウムが増えすぎたとき＝高マグネシウム血症の初めの様子。高齢の方・腎臓が悪い方・長く飲んでいる方は特に起きやすい）"],
 how: [],
 sources: [["厚生労働省 医薬品・医療機器等安全性情報 No.328（2015年12月）", "https://www.mhlw.go.jp/file/06-Seisakujouhou-11120000-Iyakushokuhinkyoku/0000185078.pdf"], ["酸化マグネシウム製剤を服用中の患者さん・ご家族の方へ（PMDA掲載、2020年8月改訂）", "https://www.pmda.go.jp/files/000235890.pdf"], ["さがみ野中央病院 薬剤科だより 2025年2・3月号", "https://www.fureai-g.or.jp/sagamino/download/hospital/pharmacy-mail/pharmacy_202502.pdf"]] },
 { name: "ピコスルファートナトリウム", aliases: ["ピコスルファート", "ラキソベロン"], kind: "飲み薬",
 what: "便秘の薬（腸を刺激して便を出す種類＝刺激性下剤）。",
 watch: ["お腹の痛み", "吐き気・吐く", "下痢"],
 how: ["長く続けて使うと効きにくくなったり、薬に頼りがちになることがある"],
 sources: [["PMDA 医療用医薬品の添付文書（ピコスルファートナトリウム内用液）", "https://www.pmda.go.jp/PmdaSearch/iyakuDetail/450064_2359005S1291_1_04"], ["一般用医薬品の添付文書（ピコスルファートナトリウム水和物の錠剤）", "https://www.info.pmda.go.jp/downfiles/otc/PDF/J0601003282_02_A.pdf"], ["さがみ野中央病院 薬剤科だより 2025年2・3月号", "https://www.fureai-g.or.jp/sagamino/download/hospital/pharmacy-mail/pharmacy_202502.pdf"], ["信州大学医学部附属病院 薬剤部 便秘症の薬の資料（2025年3月）", "https://www.shinshu-u.ac.jp/faculty/medicine/department/master/i-pharm/Constipation202606.pdf"]] },
 { name: "センノシド", aliases: ["センノシド", "プルゼニド"], kind: "飲み薬",
 what: "便秘の薬（腸を刺激して便を出す種類＝刺激性下剤）。",
 watch: ["お腹の痛み", "尿の色が黄褐色〜赤色になることがある（薬によるもの）"],
 how: ["長く続けて使うと効きにくくなることがある"],
 sources: [["PMDA 医療用医薬品の添付文書（センノシド錠）", "https://www.pmda.go.jp/PmdaSearch/iyakuDetail/581120_2354003F2464_1_04"], ["旭川赤十字病院 クロス・レター 第41号（2021年1月）", "https://www.asahikawa.jrc.or.jp/app/wp-content/uploads/2021/08/CrossLetter-041.pdf"], ["さがみ野中央病院 薬剤科だより 2025年2・3月号", "https://www.fureai-g.or.jp/sagamino/download/hospital/pharmacy-mail/pharmacy_202502.pdf"]] },
 { name: "アムロジピン", aliases: ["アムロジピン", "アムロジン", "ノルバスク"], kind: "飲み薬",
 what: "血圧を下げる薬（カルシウム拮抗薬）。",
 watch: ["めまい・ふらつき", "足のむくみ", "顔のほてり", "歯ぐきの腫れ", "脈が速い・動悸"],
 how: ["グレープフルーツジュースと一緒に飲まない（薬が効きすぎて血圧が下がりすぎるおそれ）"],
 sources: [["PMDA 医療用医薬品の添付文書（アムロジピン）", "https://www.pmda.go.jp/PmdaSearch/iyakuDetail/830001_2171022F3110_1_20"]] },
 { name: "カンデサルタン", aliases: ["カンデサルタン", "ブロプレス"], kind: "飲み薬",
 what: "血圧を下げる薬（アンジオテンシンⅡ受容体拮抗薬）。",
 watch: ["めまい・ふらつき", "唇や顔が急に腫れる（すぐ看護師へ）", "血液のカリウムが増えることがある（体のしびれ・力が入らない・吐き気・吐く・下痢・お腹が張るなど）"],
 how: [],
 sources: [["患者向医薬品ガイド（カンデサルタン錠、2023年5月）", "https://www.info.pmda.go.jp/downfiles/ph/GUI/400278_2149040F2138_2_01G.pdf"]] },
 { name: "アスピリン（血をかたまりにくくする少量のもの）", aliases: ["バイアスピリン", "アスピリン腸溶", "アスピリン"], kind: "飲み薬",
 what: "血液をかたまりにくくして、血のかたまり（血栓）ができるのを防ぐ薬。",
 watch: ["鼻血・歯ぐきからの出血", "あざができる", "黒い便・血が混じった便", "尿に血が混じる", "胃の不快感・胸やけ・吐き気"],
 how: ["割ったり砕いたりせず、かまずにそのまま飲む（腸で溶ける錠剤のため）", "空腹時に飲むのは避ける"],
 sources: [["PMDA 医療用医薬品の添付文書（バイアスピリン錠）", "https://www.pmda.go.jp/PmdaSearch/iyakuDetail/630004_3399007H1021_1_21"], ["厚生労働省 重篤副作用疾患別対応マニュアル（血液疾患に関するマニュアル）", "https://www.mhlw.go.jp/topics/2006/11/dl/tp1122-1f11.pdf"]] },
 { name: "ワルファリン", aliases: ["ワルファリン", "ワーファリン"], kind: "飲み薬",
 what: "血液をかたまりにくくする薬（血栓ができるのを防ぐ）。",
 watch: ["鼻血・歯ぐきからの出血", "あざができる", "尿に血が混じる", "便が黒い・便に血が混じる"],
 how: ["納豆・青汁・クロレラは薬の効き目を弱めるので食べない（ビタミンKが多い）", "緑黄色野菜を一度にたくさん食べない"],
 sources: [["患者向医薬品ガイド（ワルファリンK錠）", "https://www.info.pmda.go.jp/downfiles/ph/GUI/581120_3332001F1130_1_56G.pdf"], ["名古屋大学医学部附属病院 薬剤部 ワルファリンの説明書", "https://www.med.nagoya-u.ac.jp/pharmacy/pdf/warfarin_text_1.pdf"], ["厚生労働省 重篤副作用疾患別対応マニュアル（血液疾患に関するマニュアル）", "https://www.mhlw.go.jp/topics/2006/11/dl/tp1122-1f11.pdf"]] },
 { name: "アピキサバン", aliases: ["アピキサバン", "エリキュース"], kind: "飲み薬",
 what: "血液をかたまりにくくして、脳梗塞などを防ぐ薬。",
 watch: ["鼻血・歯ぐきからの出血", "あざができる", "尿に血が混じる", "便に血が混じる・黒い便", "血を吐く（どれか気づいたら看護師へ）"],
 how: [],
 sources: [["患者向医薬品ガイド（エリキュース錠）", "https://www.info.pmda.go.jp/downfiles/ph/GUI/670605_3339004F1029_1_00G.pdf"], ["PMDA アピキサバンの使用上の注意の改訂について（2013年10月）", "https://www.pmda.go.jp/files/000146113.pdf"], ["病院薬剤科 DI室「直接経口抗凝固薬（DOAC）一覧」（2020年12月）", "https://www.tmhp.jp/tama/shared/files/010678/att_0000019.pdf"]] },
 { name: "ランソプラゾール", aliases: ["ランソプラゾール", "タケプロン"], kind: "飲み薬",
 what: "胃酸の分泌を抑える胃の薬（胃潰瘍・逆流性食道炎など）。",
 watch: ["下痢・便秘（下痢が続くときは看護師へ）"],
 how: [],
 sources: [["PMDA 医療用医薬品の添付文書（ランソプラゾール）", "https://www.pmda.go.jp/PmdaSearch/iyakuDetail/400042_2329023F1047_3_09"], ["上尾中央総合病院 PPI&P-CAB フォーミュラリー", "https://ach.or.jp/partnership/doc/ppi-and-p-cab-formulary.pdf"]] },
 { name: "ファモチジン", aliases: ["ファモチジン", "ガスター"], kind: "飲み薬",
 what: "胃酸を減らす胃の薬（H2受容体拮抗薬）。",
 watch: ["意識がぼんやりする・混乱する（せん妄）。高齢の方や腎臓が悪い方で起きやすい"],
 how: [],
 sources: [["PMDA 医療用医薬品の添付文書（ファモチジン）", "https://www.pmda.go.jp/PmdaSearch/iyakuDetail/380087_2325003F1393_1_04"], ["日本老年医学会「高齢者の処方適正化スクリーニングツール」（厚生労働省 検討会資料）", "https://www.mhlw.go.jp/content/11125000/0000162475.pdf"], ["一宮市立市民病院 DIニュース（2020年3月）", "https://municipal-hospital.ichinomiya.aichi.jp/data/media/ichinomiya-hp/page/medical/druginformation/dinews2020.3.pdf"]] },
 { name: "ドネペジル", aliases: ["ドネペジル", "アリセプト"], kind: "飲み薬",
 what: "認知症の症状の進行を遅らせる薬。",
 watch: ["吐き気・吐く", "食欲が落ちる", "下痢", "脈が遅い・めまい・気を失う"],
 how: [],
 sources: [["患者向医薬品ガイド（ドネペジル塩酸塩錠）", "https://www.info.pmda.go.jp/downfiles/ph/GUI/460028_1190012F1107_1_00G.pdf"], ["厚生労働省 検討会資料「スイッチOTC医薬品の候補となる成分の成分情報等」", "https://www.mhlw.go.jp/content/11121000/000429048.pdf"], ["長寿科学振興財団「ケアの立場からみた薬物療法の選択」（中村祐）", "https://www.tyojyu.or.jp/kankoubutsu/gyoseki/pdf/h30-5-2.pdf"]] },
 { name: "メマンチン", aliases: ["メマンチン", "メマリー"], kind: "飲み薬",
 what: "認知症の症状の進行を抑える薬。",
 watch: ["めまい・ふらつき・眠気（転びやすくなる）", "けいれん", "興奮する・落ち着かない", "便秘"],
 how: [],
 sources: [["患者向医薬品ガイド（メマンチン塩酸塩OD錠）", "https://www.info.pmda.go.jp/downfiles/ph/GUI/830001_1190018F4081_1_77G.pdf"], ["厚生労働省 検討会資料「スイッチOTC医薬品の候補となる成分の成分情報等」", "https://www.mhlw.go.jp/content/11121000/000429048.pdf"], ["長寿科学振興財団「ケアの立場からみた薬物療法の選択」（中村祐）", "https://www.tyojyu.or.jp/kankoubutsu/gyoseki/pdf/h30-5-2.pdf"]] },
 { name: "ゾルピデム", aliases: ["ゾルピデム", "マイスリー"], kind: "飲み薬",
 what: "眠るための薬（睡眠導入剤）。",
 watch: ["ふらつき・転ぶ", "意識がもうろうとする", "眠ったまま歩く・食べるなど、あとで覚えていない行動", "翌朝の眠気"],
 how: ["飲んだらすぐ床につく（飲んだあと起きて活動しない）"],
 sources: [["患者向医薬品ガイド（ゾルピデム酒石酸塩錠）", "https://www.info.pmda.go.jp/downfiles/ph/GUI/300166_1129009F1351_1_03G.pdf"], ["PMDA 医療用医薬品の添付文書（ゾルピデム酒石酸塩錠）", "https://www.pmda.go.jp/PmdaSearch/iyakuDetail/380087_1129009F1181_1_13"], ["PMDA ゾルピデム酒石酸塩の使用上の注意の改訂（別紙）", "https://www.pmda.go.jp/files/000247533.pdf"], ["日本老年医学会「高齢者の処方適正化スクリーニングツール」（厚生労働省 検討会資料）", "https://www.mhlw.go.jp/content/11125000/0000162475.pdf"]] },
 { name: "抑肝散", aliases: ["抑肝散"], kind: "飲み薬",
 what: "漢方薬。神経がたかぶるときや眠れないときなどに使う。",
 watch: ["むくみ", "力が抜ける（偽アルドステロン症という副作用の様子）"],
 how: [],
 sources: [["PMDA 医療用医薬品の添付文書（ツムラ抑肝散エキス顆粒）", "https://www.pmda.go.jp/PmdaSearch/iyakuDetail/460026_5200139D1037_1_19"], ["厚生労働省 重篤副作用疾患別対応マニュアル（偽アルドステロン症）", "https://www.mhlw.go.jp/topics/2006/11/dl/tp1122-1d01.pdf"]] },
 { name: "フロセミド", aliases: ["フロセミド", "ラシックス"], kind: "飲み薬",
 what: "尿を増やして、むくみをとったり血圧を下げたりする薬（利尿薬）。",
 watch: ["立ちくらみ・ふらつき（転びやすい）", "尿の回数・量が増える", "血液のカリウムが減ることがある", "のどが渇く"],
 how: [],
 sources: [["PMDA 医療用医薬品の添付文書（フロセミド錠）", "https://www.pmda.go.jp/PmdaSearch/iyakuDetail/340409_2139005F1095_1_08"], ["日本老年医学会「高齢者の処方適正化スクリーニングツール」（厚生労働省 検討会資料）", "https://www.mhlw.go.jp/content/11125000/0000162475.pdf"]] },
 { name: "アレンドロン酸", aliases: ["アレンドロン酸", "フォサマック", "ボナロン"], kind: "飲み薬",
 what: "骨粗しょう症の薬。",
 watch: ["歯の治療の予定があるときは看護師へ（あごの骨の副作用があるため）"],
 how: ["起床時に、水約180mLと一緒に飲む", "飲んだあと少なくとも30分は横にならない", "飲んだあと30分は、水以外の飲食とほかの飲み薬を避ける（処方の指示に従う）"],
 sources: [["PMDA 医療用医薬品の添付文書（アレンドロン酸錠35mg）", "https://www.pmda.go.jp/PmdaSearch/iyakuDetail/581120_3999018F2192_1_04"], ["健康長寿ネット「骨粗鬆症の治療」", "https://www.tyojyu.or.jp/net/byouki/kotsu-soshoushou/care.html"], ["小川赤十字病院 薬剤部 資料", "https://www.ogawa.jrc.or.jp/bumon/yakuzai/kotu.pdf"]] },
 { name: "エルデカルシトール", aliases: ["エルデカルシトール", "エディロール"], kind: "飲み薬",
 what: "骨粗しょう症の薬。",
 watch: ["のどが渇く", "意識がぼんやりする（上の2つは、血液のカルシウムが増えすぎたときの様子）"],
 how: [],
 sources: [["患者向医薬品ガイド（エルデカルシトール）", "https://www.info.pmda.go.jp/downfiles/ph/GUI/450045_3112006F1023_1_00G.pdf"], ["PMDA 適正使用のお願い No.13（2020年10月）", "https://www.pmda.go.jp/files/000237206.pdf"], ["健康長寿ネット「骨粗鬆症の治療」", "https://www.tyojyu.or.jp/net/byouki/kotsu-soshoushou/care.html"]] },
 { name: "アセトアミノフェン", aliases: ["アセトアミノフェン", "カロナール"], kind: "飲み薬",
 what: "熱を下げ、痛みをやわらげる薬。",
 watch: [],
 how: ["ほかのアセトアミノフェンを含む薬（市販のかぜ薬など）と一緒に飲まない（飲みすぎると肝臓を傷めるおそれ）"],
 sources: [["PMDA 医療用医薬品の添付文書（カロナール）", "https://www.pmda.go.jp/PmdaSearch/iyakuDetail/172190_1141007C1075_5_06"], ["大分大学 保健管理センター「カロナール錠について」", "https://www.oita-u.ac.jp/000053660.pdf"]] },
 { name: "タムスロシン", aliases: ["タムスロシン", "ハルナール"], kind: "飲み薬",
 what: "前立腺肥大症で、尿を出しやすくする薬。",
 watch: ["めまい・ふらつき・立ちくらみ（血圧が下がることがある）"],
 how: ["かみ砕かずに飲む", "OD錠（口の中で溶ける錠剤）でも、寝たままの姿勢で水なしでは飲ませない"],
 sources: [["PMDA 医療用医薬品の添付文書（タムスロシン）", "https://www.pmda.go.jp/PmdaSearch/iyakuDetail/780009_2590008F1093_1_07"], ["健康長寿ネット「前立腺肥大症の治療」", "https://www.tyojyu.or.jp/net/byouki/zenritsusenhidaishou/chiryo.html"]] },
 { name: "メトホルミン", aliases: ["メトホルミン", "メトグルコ"], kind: "飲み薬",
 what: "糖尿病の薬。",
 watch: ["お腹の不調（吐き気・下痢など）・だるい・筋肉が痛い・呼吸が荒い（乳酸アシドーシスという副作用の初めの様子のことがある。看護師へ）"],
 how: ["熱がある・下痢・吐く・食事がとれないとき（シックデイ）は、飲ませる前に看護師へ（いったん中止して医師に相談することになっている）"],
 sources: [["PMDA 医療用医薬品の添付文書（メトホルミン）", "https://www.pmda.go.jp/PmdaSearch/iyakuDetail/340409_3962002F1110_2_10"], ["ビグアナイド薬の適正使用に関する委員会「メトホルミンの適正使用に関するRecommendation」（2020年3月改訂）", "https://www.nittokyo.or.jp/uploads/files/recommendation_metformin_200318.pdf"]] },
 { name: "シタグリプチン", aliases: ["シタグリプチン", "ジャヌビア", "グラクティブ"], kind: "飲み薬",
 what: "糖尿病の薬（DPP-4阻害薬）。",
 watch: ["低血糖（ほかの糖尿病の薬と一緒に飲んでいるときに起きやすい）。冷や汗・手足のふるえ・顔色が悪い・頭痛など"],
 how: [],
 sources: [["くすりのしおり（シタグリプチン錠）", "https://medical.nihon-generic.co.jp/uploadfiles/newproduct/SITAG10_SHIORI_2608.pdf"], ["厚生労働省 医薬品・医療機器等安全性情報 No.275（2010年12月）", "https://www.mhlw.go.jp/www1/kinkyu/iyaku_j/iyaku_j/anzenseijyouhou/275.pdf"], ["低血糖の様子: 健康長寿ネット「低血糖」", "https://www.tyojyu.or.jp/net/byouki/tounyoubyou/tei-kettou.html"], ["低血糖の様子: 国立病院機構 三重病院のたより", "https://mie.hosp.go.jp/common/letter/nl_1306_03.pdf"]] },
 { name: "ヘパリン類似物質（塗り薬）", aliases: ["ヘパリン類似物質", "ヒルドイド"], kind: "塗り薬",
 what: "保湿の塗り薬。水分を保つ成分を皮膚に補って、乾燥をやわらげる。",
 watch: ["塗った所が赤くなる・かゆい・発疹"],
 how: ["ただれた所・傷（潰瘍）に直接塗らない", "血が止まりにくい病気（血友病・血小板減少症など）の方には使わない薬（看護師・主治医の指示に従う）"],
 sources: [["PMDA 医療用医薬品の添付文書（ヒルドイド）", "https://www.pmda.go.jp/PmdaSearch/iyakuDetail/730155_3339950M1137_1_13"], ["東京都立北療育医療センター 薬剤検査科「保湿剤の使い方」（2017年2月）", "https://www.fukushi.metro.tokyo.lg.jp/documents/d/fukushi/hositu"]] },
 { name: "白色ワセリン（塗り薬）", aliases: ["白色ワセリン", "プロペト", "ワセリン"], kind: "塗り薬",
 what: "皮膚の表面を膜で覆って水分が逃げるのを防ぐ、保護・保湿の塗り薬。",
 watch: [],
 how: [],
 sources: [["PMDA 医療用医薬品の添付文書（白色ワセリン）", "https://www.pmda.go.jp/PmdaSearch/iyakuDetail/480199_7121703X1186_1_12"], ["東京都立北療育医療センター 薬剤検査科「保湿剤の使い方」（2017年2月）", "https://www.fukushi.metro.tokyo.lg.jp/documents/d/fukushi/hositu"]] },
 { name: "ケトプロフェン（湿布）", aliases: ["ケトプロフェン", "モーラス"], kind: "湿布",
 what: "痛みや炎症をやわらげる湿布。",
 watch: ["貼った所が赤くなる・かゆい・腫れる・水ぶくれ（日光に当たったあとに出ることがある）"],
 how: ["貼った所を日光（紫外線）に当てない。外に出るときは天気にかかわらず、衣服やサポーターで覆う", "はがした後も少なくとも4週間は同じように注意する"],
 sources: [["PMDA 医療用医薬品の添付文書（モーラステープL40mg）", "https://www.pmda.go.jp/PmdaSearch/iyakuDetail/650034_2649729S3084_1_20"], ["PMDA ケトプロフェン（テープ剤）使用上の注意の改訂", "https://www.pmda.go.jp/safety/info-services/drugs/calling-attention/revision-of-precautions/0052.html"], ["久光製薬「使用上のご注意」（ケトプロフェン外用剤、2020年9月）", "https://www.hisamitsu.co.jp/medical/data/hisamitsu-no41.pdf"], ["一宮市立市民病院 DIニュース（2021年8月）", "https://municipal-hospital.ichinomiya.aichi.jp/data/media/ichinomiya-hp/page/medical/druginformation/dinews2021.8.pdf"]] },
 { name: "ロキソプロフェン（湿布）", aliases: ["ロキソプロフェン", "ロキソニンテープ", "ロキソニンパップ"], kind: "湿布",
 what: "痛みや炎症をやわらげる湿布。",
 watch: ["貼った所のかゆみ・赤み・かぶれ・発疹"],
 how: ["傷のある所・湿疹や発疹のある所には貼らない"],
 sources: [["PMDA 医療用医薬品の添付文書（ロキソニンパップ）", "https://www.pmda.go.jp/PmdaSearch/iyakuDetail/850028_2649735S1028_1_16"], ["一宮市立市民病院 DIニュース（2021年8月）", "https://municipal-hospital.ichinomiya.aichi.jp/data/media/ichinomiya-hp/page/medical/druginformation/dinews2021.8.pdf"]] },
 { name: "レバミピド", aliases: ["レバミピド", "ムコスタ"], kind: "飲み薬",
 what: "胃の粘膜を守り、胃潰瘍や胃炎のただれ・出血などを治す薬。",
 watch: ["発疹・かゆみ", "便秘・下痢・お腹が張る"],
 how: [],
 sources: [["PMDA 医療用医薬品の添付文書（レバミピド錠100mg）", "https://www.pmda.go.jp/PmdaSearch/iyakuDetail/530372_2329021F1137_1_03"]] },
 { name: "アズノール軟膏（ジメチルイソプロピルアズレン）", aliases: ["アズノール", "ジメチルイソプロピルアズレン"], kind: "塗り薬",
 what: "湿疹や、ただれ・潰瘍・やけどに使う塗り薬。",
 watch: ["塗った所がかぶれる・ヒリヒリする（このときは看護師へ）"],
 how: [],
 sources: [["PMDA 医療用医薬品の添付文書（0.033%アズノール軟膏）", "https://www.pmda.go.jp/PmdaSearch/iyakuDetail/ResultDataSetPDF/530263_2649716M1042_1_03"]] },
 { name: "亜鉛華単軟膏", aliases: ["亜鉛華単軟膏", "亜鉛華軟膏", "サトウザルベ"], kind: "塗り薬",
 what: "皮膚を保護し、炎症をやわらげる塗り薬（湿疹・皮膚炎・ただれなど）。",
 watch: ["発疹・ヒリヒリする（このときは看護師へ）"],
 how: ["ひどい・広い範囲のやけどには使わない"],
 sources: [["PMDA 医療用医薬品の添付文書（亜鉛華(10%)単軟膏）", "https://www.pmda.go.jp/PmdaSearch/iyakuDetail/530090_2649710M2050_1_05"]] },
 // ---- 目薬（介護でよく使われるもの。メーカーの正式な資料＝添付文書・患者向医薬品ガイド・くすりのしおりで確かめた内容） ----
 { name: "ラタノプロスト（目薬）", aliases: ["ラタノプロスト", "キサラタン"], kind: "目薬",
 what: "緑内障・高眼圧症で、目の中の圧（眼圧）を下げる目薬。",
 watch: ["黒目（虹彩）の色が濃くなる", "まぶた・目のまわりが黒っぽくなる", "まつ毛が長く・太く・濃くなる"],
 how: ["まぶたや目のまわりの皮膚に付いた液は、すぐにふき取る"],
 sources: [["PMDA 患者向医薬品ガイド（キサラタン点眼液）", "https://www.info.pmda.go.jp/downfiles/ph/GUI/671450_1319739Q1037_4_00G.pdf"], ["PMDA 医療用医薬品の添付文書（キサラタン点眼液）", "https://www.pmda.go.jp/PmdaSearch/iyakuDetail/671450_1319739Q1037_4_02"]] },
 { name: "チモロール（目薬）", aliases: ["チモロール", "チモプトール"], kind: "目薬",
 what: "緑内障・高眼圧症で、眼圧を下げる目薬。喘息や心臓の病気（脈が遅いなど）がある人には使えない・注意が必要な薬なので、使うかどうかは看護師・主治医の指示に従う。",
 watch: ["目がしみる・かゆい・ゴロゴロする", "息切れ・ゼーゼーする・息が苦しい", "めまい・気を失う（心臓や脳への影響のことがある）"],
 how: [],
 sources: [["PMDA 医療用医薬品の添付文書（チモロール点眼液）", "https://www.pmda.go.jp/PmdaSearch/iyakuDetail/530113_1319702Q1140_1_03"], ["わかもと製薬 くすりのしおり（チモロール点眼液0.25%「わかもと」）", "https://www.wakamoto-pharm.co.jp/upd/medic/0000000025_03.pdf"]] },
 { name: "ヒアルロン酸ナトリウム（目薬）", aliases: ["ヒアルロン酸", "ヒアレイン"], kind: "目薬",
 what: "ドライアイなどで傷ついた目の表面（角膜・結膜）を治す目薬。",
 watch: ["目のかゆみ"],
 how: [],
 sources: [["わかもと製薬 くすりのしおり（ヒアルロン酸Na点眼液）", "https://www.wakamoto-pharm.co.jp/upd/medic/0000000083_03.pdf"], ["PMDA 医療用医薬品の添付文書（ヒアルロン酸ナトリウム点眼液）", "https://www.pmda.go.jp/PmdaSearch/iyakuDetail/530304_1319720Q3132_1_12"]] },
 { name: "シアノコバラミン（目薬）", aliases: ["シアノコバラミン点眼", "サンコバ"], eyeAliases: ["シアノコバラミン"], kind: "目薬",
 what: "目の疲れ（ピントを合わせる働きの疲れ）をやわらげる目薬。",
 watch: ["アレルギーのような症状（過敏症状）"],
 how: ["液が赤い色（薬の色で、異常ではない）"],
 sources: [["PMDA 医療用医薬品の添付文書（サンコバ点眼液0.02%）", "https://www.pmda.go.jp/PmdaSearch/iyakuDetail/300237_1319710Q2078_1_06"]] },
 { name: "ピレノキシン（目薬）", aliases: ["ピレノキシン", "カタリン"], kind: "目薬",
 what: "初期の老人性白内障に使う目薬。",
 watch: ["目の充血・かゆみ・しみる", "かすんで見える・目やに・涙が出る"],
 how: ["錠剤（顆粒）を付いている液に溶かしてから使う", "溶かした後は冷所・遮光で保存し、3週間以内に使う", "冷やしていた液は続けて落ちることがあるので、手で少し温めてからさす"],
 sources: [["PMDA 医療用医薬品の添付文書（カタリン点眼用0.005%）", "https://www.pmda.go.jp/PmdaSearch/iyakuDetail/380086_1319706Q2039_1_08"]] },
 { name: "レボフロキサシン（目薬）", aliases: ["クラビット点眼", "レボフロキサシン点眼"], eyeAliases: ["クラビット", "レボフロキサシン"], kind: "目薬",
 what: "細菌による目の感染症（結膜炎・まぶたの炎症・ものもらいなど）を治す目薬。効かない菌を増やさないため、使う期間は必要な間だけ（期間は主治医の指示に従う）。",
 watch: [],
 how: [],
 sources: [["PMDA 医療用医薬品の添付文書（クラビット点眼液1.5%）", "https://www.pmda.go.jp/PmdaSearch/iyakuDetail/300237_1319742Q2027_1_11"]] }
];
const CP_EYEDROP_COMMON = {
 how: ["さす前に手を洗う", "容器の先が目・まつ毛・まぶたに触れないようにする", "さした後は目を閉じ、目頭を軽く押さえる", "あふれた液はガーゼやティッシュでふき取る", "2種類以上の目薬をさすときは、5分以上あける"],
 sources: [["さいたま市民医療センター「目薬の正しいさし方」", "https://www.saimiya.com/images/stories/content/miyanowa/miyanowa48/4803.pdf"], ["わかもと製薬「目薬の正しいさし方」", "https://www.wakamoto-pharm.co.jp/upd/pdf/0000000759_1.pdf"]]
};
// 薬の説明のもとにした製品と製造販売元（2026-10-15 添付文書等で確認。同じ成分でも会社によって説明が違うことがあるため表示）
const CP_DRUG_BASIS = {
 "酸化マグネシウム": "特定の製品ではなく、酸化マグネシウム製剤に共通の注意（PMDA掲載の患者さん向け資料・厚生労働省の安全性情報）",
 "ピコスルファートナトリウム": "ピコスルファートナトリウム内用液0.75%「JG」（長生堂製薬株式会社）の添付文書",
 "センノシド": "センノシド錠12mg「NIG」（日医工岐阜工場株式会社）の添付文書",
 "アムロジピン": "アムロジピンOD錠「YD」（陽進堂ホールディングス株式会社）の添付文書",
 "カンデサルタン": "カンデサルタン錠「TCK」（辰巳化学株式会社）の患者向医薬品ガイド",
 "アスピリン（血をかたまりにくくする少量のもの）": "バイアスピリン錠100mg（バイエル薬品株式会社）の添付文書",
 "ワルファリン": "ワルファリンK錠「NIG」（日医工岐阜工場株式会社）の患者向医薬品ガイド",
 "アピキサバン": "エリキュース錠（ブリストル・マイヤーズ スクイブ株式会社）の患者向医薬品ガイド",
 "ランソプラゾール": "ランソプラゾールOD錠15mg「DK」（大興製薬株式会社）の添付文書",
 "ファモチジン": "ファモチジン錠「ZE」（全星薬品工業株式会社）の添付文書",
 "ドネペジル": "ドネペジル塩酸塩錠「TSU」（鶴原製薬株式会社）の患者向医薬品ガイド",
 "メマンチン": "メマンチン塩酸塩OD錠「YD」（株式会社陽進堂）の患者向医薬品ガイド",
 "ゾルピデム": "ゾルピデム酒石酸塩錠「KMP」（共創未来ファーマ株式会社）の患者向医薬品ガイド",
 "抑肝散": "ツムラ抑肝散エキス顆粒（医療用）（株式会社ツムラ）の添付文書",
 "フロセミド": "フロセミド錠「SN」（シオノケミカル株式会社）の添付文書",
 "アレンドロン酸": "アレンドロン酸錠35mg「NIG」（日医工岐阜工場株式会社）の添付文書",
 "エルデカルシトール": "エディロール錠（中外製薬株式会社）の患者向医薬品ガイド",
 "アセトアミノフェン": "カロナール細粒（あゆみ製薬株式会社）の添付文書",
 "タムスロシン": "タムスロシン塩酸塩OD錠「明治」（Meiji Seika ファルマ株式会社）の添付文書",
 "メトホルミン": "メトホルミン塩酸塩錠250mg「SN」（シオノケミカル株式会社）の添付文書",
 "シタグリプチン": "シタグリプチン錠100mg「JG」（日本ジェネリック株式会社）のくすりのしおり",
 "ヘパリン類似物質（塗り薬）": "ヒルドイド（マルホ株式会社）の添付文書",
 "白色ワセリン（塗り薬）": "白色ワセリン（東洋製薬化成株式会社）の添付文書",
 "ケトプロフェン（湿布）": "モーラステープL40mg（久光製薬株式会社）の添付文書・使用上のご注意",
 "ロキソプロフェン（湿布）": "ロキソニンパップ100mg（リードケミカル株式会社）の添付文書",
 "レバミピド": "レバミピド錠100mg「NPI」（日本薬品工業株式会社）の添付文書",
 "アズノール軟膏（ジメチルイソプロピルアズレン）": "0.033%アズノール軟膏（日本新薬株式会社）の添付文書",
 "亜鉛華単軟膏": "亜鉛華(10%)単軟膏「ニッコー」（日興製薬株式会社）の添付文書",
 "ラタノプロスト（目薬）": "キサラタン点眼液0.005%（ヴィアトリス製薬合同会社）の患者向医薬品ガイド・添付文書",
 "チモロール（目薬）": "チモロール点眼液「日新」（日新製薬株式会社）の添付文書と、チモロール点眼液0.25%「わかもと」（わかもと製薬株式会社）のくすりのしおり",
 "ヒアルロン酸ナトリウム（目薬）": "ヒアルロン酸Na点眼液（わかもと製薬株式会社）のくすりのしおりと、ヒアルロン酸ナトリウム点眼液「日点」（ロートニッテン株式会社）の添付文書",
 "シアノコバラミン（目薬）": "サンコバ点眼液0.02%（参天製薬株式会社）の添付文書",
 "ピレノキシン（目薬）": "カタリン点眼用0.005%（千寿製薬株式会社）の添付文書",
 "レボフロキサシン（目薬）": "クラビット点眼液1.5%（参天製薬株式会社）の添付文書"
};
const CP_DRUG_GUIDE_CHECKED = "2026-10-09（追記 2026-10-15）";

function cpNormDrugName(s) {
 return String(s || "").replace(/[\s　]/g, "").replace(/[（(][^）)]*[）)]/g, "").toLowerCase();
}
function cpFindDrugGuide(name, kindHint) {
 const n = cpNormDrugName(name);
 if (!n) return null;
 // 目薬の欄から開いたとき・名前に「点眼」「目薬」があるときは、目薬の説明だけを探す
 // （クラビットのように飲み薬と目薬で同じ名前のものがあるため。eyeAliases はこのときだけ使う）
 const eyeCtx = kindHint === "目薬" || /点眼|目薬/.test(String(name || ""));
 let best = null, bestLen = 0;
 CP_DRUG_GUIDE.forEach(g => {
 if (eyeCtx && g.kind !== "目薬") return;
 const names = (g.aliases || []).concat(eyeCtx ? (g.eyeAliases || []) : []);
 names.forEach(a => {
 const k = cpNormDrugName(a);
 if (k && n.includes(k) && k.length > bestLen) { best = g; bestLen = k.length; }
 });
 });
 return best;
}
// 薬の名前を「押すと説明が出る」ボタンにする（名前は data 属性で渡す。' や \ が入っても壊れない）
function cpDrugLink(name, cls, kindHint) {
 const nm = String(name || "");
 if (!nm.trim()) return "";
 return `<button type="button" class="${cls || "rx-med-name"}" data-drug="${escapeHtml(nm)}"${kindHint ? ` data-kind="${escapeHtml(kindHint)}"` : ""} onclick="event.preventDefault(); event.stopPropagation(); openDrugInfo(this.dataset.drug, this.dataset.kind);" title="押すと薬の説明">${escapeHtml(nm)}</button>`;
}
function cpShowDrugGuide(g, shownName) {
 const modal = document.getElementById("drugInfoModal");
 const body = document.getElementById("drugInfoBody");
 if (!modal || !body) return;
 const list = arr => arr && arr.length ? `<ul>${arr.map(x => `<li>${escapeHtml(x)}</li>`).join("")}</ul>` : `<p class="panel-note">資料で確かめられた内容はありません。</p>`;
 const isEye = g.kind === "目薬";
 // 目薬は共通のさし方の資料も一緒に出す（同じURLは1回だけ）
 const srcs = [];
 (g.sources || []).concat(isEye ? CP_EYEDROP_COMMON.sources : []).forEach(x => { if (!srcs.some(y => y[1] === x[1])) srcs.push(x); });
 body.innerHTML = `
 <h3 class="drug-title">${escapeHtml(shownName || g.name)}</h3>
 <p class="drug-kind">${escapeHtml(g.kind)}・${escapeHtml(g.name)}</p>
 ${CP_DRUG_BASIS[g.name] ? `<p class="drug-basis">この説明のもと：${escapeHtml(CP_DRUG_BASIS[g.name])}<br>同じ成分の薬でも、製品（会社）によって説明が少し違うことがあります。手元の薬の説明書もあわせて確認してください。</p>` : ""}
 <section><h4>どんな薬か</h4><p>${escapeHtml(g.what)}</p></section>
 <section><h4>気をつけたい様子（見つけたら看護師へ）</h4>${list(g.watch)}</section>
 ${g.how && g.how.length ? `<section><h4>${g.kind === "飲み薬" ? "飲ませ方" : (g.kind === "目薬" ? "さし方" : "使い方")}の注意</h4>${list(g.how)}</section>` : ""}
 ${isEye ? `<section class="drug-eye-common"><h4>目薬のさし方（どの目薬でも共通）</h4>${list(CP_EYEDROP_COMMON.how)}</section>` : ""}
 <div class="drug-rule">
 <p>これは一般的な説明です。この方に何のために使っているかは、処方薬の一覧（処方箋）を見てください。</p>
 <p>${isEye ? "いつもと違う様子があれば看護師へ。さす目・回数は点眼指示に従ってください。" : "いつもと違う様子があれば看護師へ。薬を砕く・つぶす・溶かすときは、看護師・薬剤師に確認してください。"}</p>
 </div>
 <details class="drug-sources"><summary>この説明の資料（${CP_DRUG_GUIDE_CHECKED} に確認）</summary>
 <ul>${srcs.map(s => `<li><a href="${escapeHtml(s[1])}" target="_blank" rel="noopener">${escapeHtml(s[0])}</a></li>`).join("")}</ul>
 <p class="panel-note">薬を作っている会社の正式な資料（添付文書・患者向医薬品ガイド・くすりのしおり）と、国・病院の資料で確かめた内容だけを載せています。</p>
 </details>`;
 modal.style.display = "flex";
}

// 薬の説明（メーカーの正式な資料＝添付文書・患者向医薬品ガイド・くすりのしおり、または国・病院の資料で確かめた内容だけ。2026-10-15 ユーザーと決定。CP_DRUG_GUIDE に登録がない薬は看護師に確認してもらう）
function openDrugInfo(name, kindHint) {
 const g = (typeof cpFindDrugGuide === "function") ? cpFindDrugGuide(name, kindHint) : null;
 if (!g) {
 alert(`「${name}」の説明は、まだ登録されていません。\nどんな薬か・気をつけることは、看護師に確認してください。`);
 return;
 }
 if (typeof cpShowDrugGuide === "function") cpShowDrugGuide(g, name);
}

// 点眼指示モーダル制御
function openEyedropOrderModal(residentId) {
 const modal = document.getElementById("eyedropOrderModal");
 if (!modal) return;

 const resSelect = document.getElementById("eoResidentSelect");
 if (resSelect) {
 resSelect.innerHTML = cpCurrentResidents().map(r => `
 <option value="${r.id}" ${r.id === (residentId || gState.selectedResidentId) ? 'selected' : ''}>${r.room_no}号室: ${r.name} 様</option>
 `).join("");
 }

 const targetId = residentId || (resSelect ? parseInt(resSelect.value, 10) : gState.selectedResidentId);
 loadEyedropOrderFormData(targetId);

 modal.style.display = "flex";
}

function onEyedropResidentChange() {
 const sel = document.getElementById("eoResidentSelect");
 if (sel) {
 loadEyedropOrderFormData(parseInt(sel.value, 10));
 }
}

function loadEyedropOrderFormData(resId) {
 const order = (db.data.eyedrop_orders || []).find(e => e.resident_id === resId && e.status !== '終了') || {};

 const eye = order.eye || "右のみ";
 const rRight = document.getElementById("eoEyeRight");
 const rLeft = document.getElementById("eoEyeLeft");
 const rBoth = document.getElementById("eoEyeBoth");
 const rNone = document.getElementById("eoEyeNone");
 if (rRight) rRight.checked = (eye === "右のみ");
 if (rLeft) rLeft.checked = (eye === "左のみ");
 if (rBoth) rBoth.checked = (eye === "両眼");
 if (rNone) rNone.checked = (eye === "指示なし");

 const medEl = document.getElementById("eoMedicineName");
 if (medEl) medEl.value = order.medicine_name || "";

 const slots = order.timing_slots || [];
 const cbMorn = document.getElementById("eoSlotMorning");
 const cbNoon = document.getElementById("eoSlotNoon");
 const cbEve = document.getElementById("eoSlotEvening");
 const cbBed = document.getElementById("eoSlotBed");
 if (cbMorn) cbMorn.checked = slots.includes("朝");
 if (cbNoon) cbNoon.checked = slots.includes("昼");
 if (cbEve) cbEve.checked = slots.includes("夕");
 if (cbBed) cbBed.checked = slots.includes("眠前");

 const doseEl = document.getElementById("eoDosage");
 if (doseEl) doseEl.value = order.dosage || "1回1滴";
 const docEl = document.getElementById("eoDoctor");
 if (docEl) docEl.value = order.doctor_name || "眼科クリニック";
 const noteEl = document.getElementById("eoNotes");
 if (noteEl) noteEl.value = order.notes || "";
 const stEl = document.getElementById("eoStatus");
 if (stEl) stEl.value = order.status || "継続中";
}

function quickFillEyedropMed(medName) {
 const el = document.getElementById("eoMedicineName");
 if (el) el.value = medName;
}

function submitEyedropOrder() {
 const sel = document.getElementById("eoResidentSelect");
 if (!sel) return;
 const resId = parseInt(sel.value, 10);
 const r = gState.residents.find(x => x.id === resId);

 let eyeSide = "右のみ";
 if (document.getElementById("eoEyeLeft")?.checked) eyeSide = "左のみ";
 else if (document.getElementById("eoEyeBoth")?.checked) eyeSide = "両眼";
 else if (document.getElementById("eoEyeNone")?.checked) eyeSide = "指示なし";

 const medName = document.getElementById("eoMedicineName")?.value.trim() || "";
 if (eyeSide !== "指示なし" && !medName) {
 alert("点眼薬の薬品名を入力してください（または『指示なし』を選択してください）。");
 return;
 }

 const timingSlots = [];
 if (document.getElementById("eoSlotMorning")?.checked) timingSlots.push("朝");
 if (document.getElementById("eoSlotNoon")?.checked) timingSlots.push("昼");
 if (document.getElementById("eoSlotEvening")?.checked) timingSlots.push("夕");
 if (document.getElementById("eoSlotBed")?.checked) timingSlots.push("眠前");

 if (eyeSide !== "指示なし" && timingSlots.length === 0) {
 alert("投与する時間帯（朝・昼・夕・就寝前）を1つ以上選択してください。");
 return;
 }

 const dosage = document.getElementById("eoDosage")?.value.trim() || "1回1滴";
 const doctor = document.getElementById("eoDoctor")?.value.trim() || "";
 const notes = document.getElementById("eoNotes")?.value.trim() || "";
 const status = document.getElementById("eoStatus")?.value || "継続中";

 if (!db.data.eyedrop_orders) db.data.eyedrop_orders = [];
 const existingIdx = db.data.eyedrop_orders.findIndex(e => e.resident_id === resId && e.status !== '終了');

 const newOrder = {
 id: existingIdx >= 0 ? db.data.eyedrop_orders[existingIdx].id : Date.now(),
 resident_id: resId,
 eye: eyeSide,
 medicine_name: medName,
 timing_slots: timingSlots,
 dosage: dosage,
 doctor_name: doctor,
 notes: notes,
 status: status,
 updated_at: toLocalDateStr(new Date())
 };

 if (existingIdx >= 0) {
 cpAppendEditHistory(newOrder, db.data.eyedrop_orders[existingIdx], ["eye", "medicine_name", "timing_slots", "dosage", "notes", "doctor_name", "status"]); // [Claude修正] 変更前の指示を残す
 db.data.eyedrop_orders[existingIdx] = newOrder;
 } else {
 db.data.eyedrop_orders.push(newOrder);
 }

 db.save();
 closeModal("eyedropOrderModal");
 renderMedTable();
 if (typeof renderResidentDetail === "function" && gState.selectedResidentId === resId) {
 renderResidentDetail();
 }
 alert(`${r ? r.name : '利用者'}様の点眼指示（${eyeSide}・${medName || '指示なし'}）を保存しました！`);
}

function deleteEyedropOrder() {
 const sel = document.getElementById("eoResidentSelect");
 if (!sel) return;
 const resId = parseInt(sel.value, 10);
 const r = gState.residents.find(x => x.id === resId);

 if (!confirm(`${r ? r.name : '利用者'}様の点眼指示を解除（指示なし）にしますか？`)) return;

 // [Claude修正] 点眼指示は消さずに「終了」として、日時・職員を残す
 const nowStr = toLocalDateTimeStr(new Date());
 (db.data.eyedrop_orders || []).forEach(e => {
 if (e.resident_id === resId && e.status !== '終了') { e.status = '終了'; e.ended_at = nowStr; e.ended_by = cpLedgerStaff(); }
 });
 db.save();
 closeModal("eyedropOrderModal");
 renderMedTable();
 if (typeof renderResidentDetail === "function" && gState.selectedResidentId === resId) {
 renderResidentDetail();
 }
 alert(`${r ? r.name : '利用者'}様の点眼指示を解除しました。`);
}

// 7. 夜勤体位変換 トグル解除 ＆ 一括確定 (個人記録自動転記)
gState.nightTurnDate = null;
gState.nightTurnDrafts = null;

function initNightTurnDrafts(force) {
 if (!force && gState.nightTurnDate === gState.selectedDate && gState.nightTurnDrafts !== null) {
 return;
 }
 gState.nightTurnDate = gState.selectedDate;
 gState.nightTurnDrafts = {};
  // [Antigravity実装 2026-10-15] 夜勤体位変換の様子・特変メモの初期化
  gState.nightTurnNotes = {};
 const turns = (db.data.turns || []).filter(t => !t.voided && t.date === gState.selectedDate);
 turns.forEach(t => {
 gState.nightTurnDrafts[`${t.resident_id}_${t.time}`] = t.action;
    if (t.note) gState.nightTurnNotes[`${t.resident_id}_${t.time}`] = t.note;
 });
}

// [Claude修正] 夜間の巡視・体位変換は、解除しても消さずに「取消」として残す（理由必須）。連動した巡視の介護記録も取消にする
function cpActiveTurnsForDate(date) {
 return (db.data.turns || []).filter(t => !t.voided && t.date === date);
}

function cpVoidTurns(list, reason) {
 const now = toLocalDateTimeStr(new Date());
 const by = cpLedgerStaff();
 list.forEach(t => {
 t.voided = true; t.voided_at = now; t.voided_by = by; t.void_reason = reason;
 (db.data.care_records || []).forEach(rec => {
 // [Claude修正 2026-10-15] 特変は、このチェックから自動で作った記録（auto_night_turn）だけを取消す。同じ時刻に職員が手で書いた特変は取消さない
 if (!rec.voided && (rec.category === "巡視" || (rec.category === "特変" && rec.auto_night_turn)) && rec.resident_id === t.resident_id && rec.recorded_at === `${t.date} ${t.time}`) {
 rec.voided = true; rec.voided_at = now; rec.voided_by = by; rec.void_reason = `巡視チェックの解除: ${reason}`;
 }
 });
 });
}

function cpAskTurnVoidReason(count) {
 const reason = prompt(`保存済みの巡視・体位変換のチェック ${count}件を解除します。\n記録は消えずに、取消済みとして残ります。\n\n解除の理由を入力してください (例: 押し間違い、別の方の欄に入れた)`, "");
 if (reason === null) return null;
 if (!reason.trim()) { alert("解除の理由を入力してください。解除は行っていません。"); return null; }
 return reason.trim();
}

// [Antigravity実装 2026-10-15] 夜勤体位変換の様子・特変メモを保持
function cpSetNightTurnNote(resId, time, note) {
  if (!gState.nightTurnNotes) gState.nightTurnNotes = {};
  gState.nightTurnNotes[`${resId}_${time}`] = note;
  const el = document.getElementById(`night_note_${resId}_${time}`);
  if (el && el.value !== note) el.value = note;
}

function setNightTurnAction(resId, time, action) {
 const key = `${resId}_${time}`;
 if (!gState.nightTurnDrafts) gState.nightTurnDrafts = {};
 if (!action) {
 toggleNightTurnAction(resId, time);
 return;
 }
 gState.nightTurnDrafts[key] = action;
 renderNightTable();
}

function toggleNightTurnAction(resId, time) {
 const key = `${resId}_${time}`;
 const saved = cpActiveTurnsForDate(gState.selectedDate).filter(t => t.resident_id === resId && t.time === time);
 if (saved.length > 0) {
 const reason = cpAskTurnVoidReason(saved.length);
 if (reason === null) { renderNightTable(); return; }
 cpVoidTurns(saved, reason);
 db.save();
 loadDateRecords(gState.selectedDate);
 }
 if (gState.nightTurnDrafts) delete gState.nightTurnDrafts[key];
 renderNightTable();
}

function clearAllNightTurnsForDate() {
 if (!confirm(`${gState.selectedDate} の夜間体位変換・巡視チェックを全て解除しますか？`)) return;
 const saved = cpActiveTurnsForDate(gState.selectedDate);
 if (saved.length > 0) {
 const reason = cpAskTurnVoidReason(saved.length);
 if (reason === null) return;
 cpVoidTurns(saved, reason);
 db.save();
 loadDateRecords(gState.selectedDate);
 }
 gState.nightTurnDrafts = {};
 renderNightTable();
 alert(`${gState.selectedDate} の体位変換チェックをすべて解除しました。（保存済みの分は取消として残っています）`);
}

// [Claude修正] まとめて保存: 前の保存分は消さない。新しく付けたチェックだけ記録し、外した・変えたチェックは理由を書いて取消にする。
// 以前は保存のたびに日付分を全部消して作り直していたため、前の記録者名・時刻が保存した人に書き換わっていた
function submitNightTurnsBatch() {
  // [Antigravity実装 2026-10-15] 入力欄から最新の様子・特変メモを収集
  if (!gState.nightTurnNotes) gState.nightTurnNotes = {};
  document.querySelectorAll('input[id^="night_note_"]').forEach(inp => {
    const k = inp.id.replace("night_note_", "");
    gState.nightTurnNotes[k] = inp.value; // [Claude修正 2026-10-15] 空にしたときも反映する（前の文が残らないように）
  });
 const staff = document.getElementById("currentStaff").value;
 const date = gState.selectedDate;
 if (!Array.isArray(db.data.turns)) db.data.turns = [];
 const drafts = gState.nightTurnDrafts || {};
 const active = cpActiveTurnsForDate(date);

 const toVoid = active.filter(t => drafts[`${t.resident_id}_${t.time}`] !== t.action);
 if (toVoid.length > 0) {
 const reason = cpAskTurnVoidReason(toVoid.length);
 if (reason === null) return;
 cpVoidTurns(toVoid, reason);
 }

 const added = [];
 const lateNotes = []; // [Claude修正 2026-10-15] 保存済みのチェックにあとから書いた様子
 Object.keys(drafts).forEach(key => {
 const action = drafts[key];
 if (!action) return;
 const parts = key.split("_");
 const resId = parseInt(parts[0], 10);
 const time = parts[1];
 const savedSame = cpActiveTurnsForDate(date).find(t => t.resident_id === resId && t.time === time && t.action === action);
 if (savedSame) {
  // [Claude修正 2026-10-15] 保存済みのチェックに、あとから「様子・特変」を書き足したときは、その分だけ特変として残す
  // （以前は「新しく保存するチェックはありませんでした」となり、書いた様子が保存されなかった）
  const lateNote = (gState.nightTurnNotes && gState.nightTurnNotes[key]) ? gState.nightTurnNotes[key].trim() : "";
  if (lateNote && lateNote !== (savedSame.note || "")) {
   savedSame.note = lateNote;
   lateNotes.push({ resId: resId, time: time, action: action, note: lateNote });
  }
  return; // チェック自体は保存済みのまま
 }
 db.data.turns.push({
 id: Date.now() + Math.floor(Math.random() * 1000),
 date: date,
 time: time,
 resident_id: resId,
 action: action,
      note: (gState.nightTurnNotes && gState.nightTurnNotes[key]) ? gState.nightTurnNotes[key].trim() : "", // [Antigravity実装 2026-10-15]
 staff_name: staff
 });
    const curNote = (gState.nightTurnNotes && gState.nightTurnNotes[key]) ? gState.nightTurnNotes[key].trim() : "";
    added.push({ resId: resId, time: time, action: action, note: curNote }); // [Antigravity実装 2026-10-15]
 });

 const tpls = getNightTurnTemplates();
 let totalRecordsCreated = 0;
 added.forEach((item, index) => {
 const r = gState.residents.find(x => x.id === item.resId);
 if (!r || r.status !== "在所") return; // 安全ガード: 入院中・不在の利用者は巡視記録の自動生成から除外
 const tpl = tpls[item.action] || DEFAULT_NIGHT_TURN_TEMPLATES[item.action] || `【{time} 定時巡視・体位変換】訪室確認。${item.action}実施。`;
    let contentText = tpl.replace(/\{time\}/g, item.time).replace(/\{action\}/g, item.action);
    // [Antigravity実装 2026-10-15] 書いたときは自動定型文の後ろに「【様子】（書いた内容）」を付与
    if (item.note) {
      contentText += ` 【様子】${item.note}`;
    }
 db.data.care_records.unshift({
 id: Date.now() + Math.floor(Math.random() * 100000) + index,
 recorded_at: `${date} ${item.time}`,
 resident_id: item.resId,
 category: "巡視",
 content: contentText,
 staff_name: staff,
 auto_night_turn: true
 });
 totalRecordsCreated++;
    // [Antigravity実装 2026-10-15] 同じ時刻・同じ内容で category:"特変" の記録も1件作成し特変一覧に表示
    if (item.note) {
      db.data.care_records.unshift({
        id: Date.now() + Math.floor(Math.random() * 100000) + index + 50000,
        recorded_at: `${date} ${item.time}`,
        resident_id: item.resId,
        category: "特変",
        content: contentText,
        staff_name: staff,
        auto_night_turn: true
      });
    }
 });

 // [Claude修正 2026-10-15] あとから書いた様子は、特変として1件ずつ残す（巡視の記録は書き換えない）
 lateNotes.forEach((item, index) => {
  const r = gState.residents.find(x => x.id === item.resId);
  if (!r || r.status !== "在所") return;
  db.data.care_records.unshift({
   id: Date.now() + Math.floor(Math.random() * 100000) + index + 70000,
   recorded_at: `${date} ${item.time}`,
   resident_id: item.resId,
   category: "特変",
   content: `【${item.time} 定時巡視・${item.action}】【様子】${item.note}`,
   staff_name: staff,
   auto_night_turn: true
  });
  totalRecordsCreated++;
 });

 db.save();
 initNightTurnDrafts(true);
 renderNightTable();
 loadDateRecords(date);
 if (totalRecordsCreated > 0) {
 alert(lateNotes.length ? `保存しました（新しいチェック ${added.length}回分、あとから書いた様子 ${lateNotes.length}件を特変として記録）。` : `体位変換・夜間巡視のチェック（新しく付けた${totalRecordsCreated}回分）を保存・カルテへ転記しました！`); // [Claude修正 2026-10-15]
 } else if (toVoid.length > 0) {
 alert("外したチェックを取消として保存しました。");
 } else {
 alert("新しく保存するチェックはありませんでした。");
 }
}

function renderNightTable() {
 const tbody = document.querySelector("#nightTable tbody");
 if (!tbody) return;
  // [Antigravity実装 2026-10-15] 再描画前に入力中のメモを保持
  if (!gState.nightTurnNotes) gState.nightTurnNotes = {};
  document.querySelectorAll('input[id^="night_note_"]').forEach(inp => {
    const k = inp.id.replace("night_note_", "");
    gState.nightTurnNotes[k] = inp.value; // [Claude修正 2026-10-15] 空にしたときも反映する（前の文が残らないように）
  });
 tbody.innerHTML = "";
 if (gState.nightTurnDate !== gState.selectedDate || gState.nightTurnDrafts === null) {
 initNightTurnDrafts();
 }

 const times = ["22:00", "00:00", "02:00", "04:00", "06:00"];
 const activeTurns = cpActiveTurnsForDate(gState.selectedDate);

 cpResidentsOn(gState.selectedDate).forEach(r => {
 const isHospital = r.status === "入院中" || r.status === "ショート終了" || r.status !== "在所";
 const tr = document.createElement("tr");

 if (isHospital) {
 tr.style.background = "#f6f8f6";
 tr.style.opacity = "0.7";
 const cells = times.map(() => `<td style="text-align:center; color:#94a19a; font-size:11px;">(対象外)</td>`).join("");
 tr.innerHTML = `
 <td>${r.room_no}</td>
 <td><strong>${escapeHtml(r.name)} 様</strong> <span class="badge" style="background:#5f6d66; color:#fff; font-size:10px; margin-left:4px;">${escapeHtml(r.status)}</span></td>
 ${cells}
 `;
 tbody.appendChild(tr);
 return;
 }

    const cells = times.map(tm => {
      const key = `${r.id}_${tm}`;
      const curAction = gState.nightTurnDrafts[key];
      const curNote = (gState.nightTurnNotes && gState.nightTurnNotes[key]) || "";
      const savedTurn = activeTurns.find(t => t.resident_id === r.id && t.time === tm);
      // [Antigravity実装 2026-10-15] 各利用者・各時刻のチェックに任意で「様子・特変」を書ける欄を配置
      const noteInpHtml = `<input type="text" id="night_note_${r.id}_${tm}" class="form-control" placeholder="様子・特変" value="${escapeHtml(curNote)}" style="font-size:10.5px; padding:2px 4px; margin-top:3px; width:100%; min-width:85px; max-width:130px; box-sizing:border-box;" oninput="cpSetNightTurnNote(${r.id}, '${tm}', this.value)">`;
      if (curAction) {
        // [Antigravity実装 2026-10-16] 保存済みの体位変換には「記入済み」・中身・書いた人・時刻と訂正ボタンを表示
        const savedInfoHtml = savedTurn
          ? `<div style="font-size:10px; color:#15803d; margin-top:2px; line-height:1.3;">
              <span style="background:#dcfce7; border:1px solid #86efac; padding:0 4px; border-radius:3px; font-weight:bold;">記入済み</span>
              ${escapeHtml(savedTurn.staff_name || "未記録")} (${escapeHtml(savedTurn.time || tm)})
              ${savedTurn.edit_history && savedTurn.edit_history.length ? `<span style="color:#b45309;">[訂正${savedTurn.edit_history.length}]</span>` : ""}
              <button type="button" class="btn btn-secondary" style="font-size:9.5px; padding:1px 4px; margin-left:2px;" onclick="editSavedNightTurn(${Number(savedTurn.id)})">訂正</button>
            </div>`
          : `<div style="font-size:10px; color:#b45309; margin-top:2px;">未保存(選択中)</div>`;
        return `
        <td style="text-align:center; vertical-align:top; padding:4px 3px;">
          <button class="btn btn-secondary" style="background:#dcfce7; color:#15803d; border:1px solid #86efac; font-weight:bold; font-size:11px; padding:3px 6px; width:100%; max-width:130px;" onclick="toggleNightTurnAction(${r.id}, '${tm}')" title="クリックで取消">
            ${escapeHtml(curAction)} 
          </button>
          ${savedInfoHtml}
          ${noteInpHtml}
        </td>
        `;
      }
      return `
      <td style="vertical-align:top; padding:4px 3px;">
        <select class="form-control" style="font-size:11px; padding:2px; width:100%; max-width:130px;" onchange="setNightTurnAction(${r.id}, '${tm}', this.value)">
          <option value="">選択</option>
          <option value="安眠中">安眠中</option>
          <option value="左側臥位">左側臥位</option>
          <option value="右側臥位">右側臥位</option>
          <option value="仰臥位">仰臥位</option>
          <option value="おむつ交換">おむつ交換</option>
        </select>
        ${noteInpHtml}
      </td>
      `;
    }).join("");

 tr.innerHTML = `
 <td>${r.room_no}</td>
 <td><strong>${r.name} 様</strong></td>
 ${cells}
 `;
 tbody.appendChild(tr);
 });
}

// [Antigravity実装 2026-10-16] 保存済みの体位変換記録の訂正（理由必須・edit_history保存・同じidの中身を書き換え）
function editSavedNightTurn(turnId) {
 const t = (db.data.turns || []).find(x => Number(x.id) === Number(turnId));
 if (!t || t.voided) return;
 const res = gState.residents.find(r => r.id === t.resident_id);
 const newAction = prompt(`【${res ? res.name + " 様" : ""} ${t.time}】体位変換・巡視の内容を入力してください\n(安眠中 / 左側臥位 / 右側臥位 / 仰臥位 / おむつ交換):`, t.action || "");
 if (newAction === null) return;
 if (!newAction.trim()) {
  alert("内容を入力してください（解除する場合はボタンをクリックして取消してください）。");
  return;
 }
 const newNote = prompt(`様子・特変メモを入力してください（空欄可）:`, t.note || "");
 if (newNote === null) return;
 if (newAction.trim() === (t.action || "") && newNote.trim() === (t.note || "")) {
  alert("変更された内容がありません。");
  return;
 }
 const reason = cpPromptEditReason(`${t.time}の体位変換記録`, `${t.action}${t.note ? " (" + t.note + ")" : ""}`);
 if (reason === null) return;

 const oldCopy = JSON.parse(JSON.stringify(t));
 t.action = newAction.trim();
 t.note = newNote.trim();
 t.staff_name = cpLedgerStaff();
 cpAppendEditHistory(t, oldCopy, ["action", "note"], reason);

 // 連動している自動巡視記録も更新
 const tpls = getNightTurnTemplates();
 const tpl = tpls[t.action] || DEFAULT_NIGHT_TURN_TEMPLATES[t.action] || `【{time} 定時巡視・体位変換】訪室確認。${t.action}実施。`;
 let contentText = tpl.replace(/\{time\}/g, t.time).replace(/\{action\}/g, t.action);
 if (t.note) contentText += ` 【様子】${t.note}`;
 (db.data.care_records || []).forEach(rec => {
  if (!rec.voided && rec.auto_night_turn && rec.resident_id === t.resident_id && rec.recorded_at === `${t.date} ${t.time}`) {
   const oldRec = JSON.parse(JSON.stringify(rec));
   rec.content = contentText;
   rec.staff_name = t.staff_name;
   cpAppendEditHistory(rec, oldRec, ["content"], reason);
  }
 });

 db.save();
 initNightTurnDrafts(true);
 loadDateRecords(gState.selectedDate);
 alert("体位変換・巡視の記録を訂正しました。");
}

function saveNightTurn(resId, time, action) {
 setNightTurnAction(resId, time, action);
}

// 8. 月次体重 (前月比 ＆ 前々月比 ＆ 1年推移グラフ)
function renderWeightTable() {
 const tbody = document.querySelector("#weightTable tbody");
 if (!tbody) return;
 tbody.innerHTML = "";
 const records = db.data.weight_records || [];
 
 const [y, m] = gState.currentMonth.split("-").map(Number);
 const prevDate = new Date(y, m - 2, 1);
 const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
 const prev2Date = new Date(y, m - 3, 1);
 const prev2Month = `${prev2Date.getFullYear()}-${String(prev2Date.getMonth() + 1).padStart(2, "0")}`;

 cpResidentsOn(gState.selectedDate).forEach(r => {
 const currentRec = records.filter(w => w.resident_id === r.id && (w.month === gState.currentMonth || (w.date && w.date.startsWith(gState.currentMonth)))).sort((a,b) => b.id - a.id)[0];
 const prevRec = records.filter(w => w.resident_id === r.id && (w.month === prevMonth || (w.date && w.date.startsWith(prevMonth)))).sort((a,b) => b.id - a.id)[0];
 const prev2Rec = records.filter(w => w.resident_id === r.id && (w.month === prev2Month || (w.date && w.date.startsWith(prev2Month)))).sort((a,b) => b.id - a.id)[0];

 // 前月比
 let diffDisplay = "-";
 if (currentRec && prevRec) {
 const diff = (currentRec.weight - prevRec.weight).toFixed(1);
 const diffNum = parseFloat(diff);
 const diffStr = diffNum > 0 ? `+${diff} kg` : (diffNum < 0 ? `${diff} kg` : `±0.0 kg`);
 const color = diffNum > 0 ? '#16a34a' : (diffNum < 0 ? '#dc2626' : '#5f6d66');
			let alertBadge = "";
			if (diffNum <= -2.0) {
				alertBadge = `<span style="display:inline-block; font-size:10.5px; background:#fee2e2; color:#991b1b; padding:1px 5px; border-radius:4px; font-weight:bold; margin-left:4px;">急減注意</span>`;
			} else if (diffNum >= 2.0) {
				alertBadge = `<span style="display:inline-block; font-size:10.5px; background:#f1f6f3; color:#1e5b47; padding:1px 5px; border-radius:4px; font-weight:bold; margin-left:4px;">急増注意</span>`;
			}
			diffDisplay = `<strong style="color:${color}; font-size:13px;">${diffStr}</strong> <span style="font-size:11px; color:var(--text-muted);">(${prevRec.weight}k)</span>${alertBadge}`;
 } else if (currentRec) {
 diffDisplay = `<span style="font-size:11px; color:var(--text-muted);">- (前月なし)</span>`;
 } else if (prevRec) {
 diffDisplay = `<span style="font-size:11px; color:var(--text-muted);">前月: ${prevRec.weight}k</span>`;
 }

 // 前々月比
 let diff2Display = "-";
 if (currentRec && prev2Rec) {
 const diff2 = (currentRec.weight - prev2Rec.weight).toFixed(1);
 const diff2Num = parseFloat(diff2);
 const diff2Str = diff2Num > 0 ? `+${diff2} kg` : (diff2Num < 0 ? `${diff2} kg` : `±0.0 kg`);
 const color2 = diff2Num > 0 ? '#16a34a' : (diff2Num < 0 ? '#dc2626' : '#5f6d66');
 diff2Display = `<strong style="color:${color2}; font-size:13px;">${diff2Str}</strong> <span style="font-size:11px; color:var(--text-muted);">(${prev2Rec.weight}k)</span>`;
 } else if (currentRec) {
 diff2Display = `<span style="font-size:11px; color:var(--text-muted);">-</span>`;
 }

 const currentVal = currentRec ? currentRec.weight : "";

 const tr = document.createElement("tr");
 tr.innerHTML = `
 <td>${r.room_no}</td>
 <td><strong>${r.name} 様</strong></td>
 <td>${gState.currentMonth}</td>
 <td><input type="number" step="0.1" class="form-control" style="width:90px;" id="wVal_${r.id}" value="${currentVal}" placeholder="52.4"></td>
 <td>${diffDisplay}</td>
 <td>${diff2Display}</td>
 <td><button class="btn btn-primary" style="padding:4px 10px; font-size:12px;" onclick="saveWeight(${r.id})">測定登録</button></td>
 `;
 tbody.appendChild(tr);
 });

 renderWeightChart();
}

function renderWeightChart(selectedResId = null) {
 const container = document.getElementById("weightChartContainer");
 if (!container) return;

 const targetResId = selectedResId || gState.selectedResidentId || (gState.residents[0] ? gState.residents[0].id : 1);
 const targetRes = gState.residents.find(r => r.id === targetResId);
 const records = (db.data.weight_records || []).filter(w => w.resident_id === targetResId);

 // 過去12ヶ月の月リスト生成 (例: 2025-11 〜 2026-10)
 const [curY, curM] = gState.currentMonth.split("-").map(Number);
 const months = [];
 for (let i = 11; i >= 0; i--) {
 const d = new Date(curY, curM - 1 - i, 1);
 months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
 }

 // 各月の最新体重を取得
 const points = months.map(mStr => {
 const rec = records.filter(w => (w.month === mStr || (w.date && w.date.startsWith(mStr)))).sort((a,b) => b.id - a.id)[0];
 return { month: mStr, weight: rec ? rec.weight : null };
 });

 // 利用者切り替えボタン
 const resButtons = cpCurrentResidents().map(r => `
 <button class="btn ${r.id === targetResId ? 'btn-primary' : 'btn-secondary'}" style="padding:3px 10px; font-size:12px;" onclick="renderWeightChart(${r.id})">
 ${r.room_no}号室 ${r.name}様
 </button>
 `).join("");

 // グラフ描画用スケール計算
 const validWeights = points.filter(p => p.weight !== null).map(p => p.weight);
 const minW = validWeights.length > 0 ? Math.floor(Math.min(...validWeights) - 2) : 40;
 const maxW = validWeights.length > 0 ? Math.ceil(Math.max(...validWeights) + 2) : 70;
 const range = maxW - minW || 10;

 const svgW = 760;
 const svgH = 220;
 const padL = 50;
 const padR = 30;
 const padT = 30;
 const padB = 40;
 const graphW = svgW - padL - padR;
 const graphH = svgH - padT - padB;

 // グリッド線
 let gridLines = "";
 const steps = 4;
 for (let s = 0; s <= steps; s++) {
 const val = (minW + (range / steps) * s).toFixed(1);
 const yPos = padT + graphH - (s / steps) * graphH;
 gridLines += `
 <line x1="${padL}" y1="${yPos}" x2="${svgW - padR}" y2="${yPos}" stroke="#dfe5e1" stroke-dasharray="3,3" />
 <text x="${padL - 8}" y="${yPos + 4}" font-size="11" fill="#5f6d66" text-anchor="end">${val}kg</text>
 `;
 }

 // 折れ線と点
 let pathD = "";
 let dotsHtml = "";
 let monthLabelsHtml = "";
 const numPts = points.length;

 points.forEach((pt, idx) => {
 const xPos = padL + (idx / (numPts - 1)) * graphW;
 const shortM = pt.month.slice(5) + "月";
 monthLabelsHtml += `<text x="${xPos}" y="${svgH - padB + 18}" font-size="11" fill="#4a5852" text-anchor="middle">${shortM}</text>`;

 if (pt.weight !== null) {
 const yPos = padT + graphH - ((pt.weight - minW) / range) * graphH;
 if (!pathD) {
 pathD = `M ${xPos} ${yPos}`;
 } else {
 pathD += ` L ${xPos} ${yPos}`;
 }
 dotsHtml += `
 <circle cx="${xPos}" cy="${yPos}" r="5" fill="#1e5b47" stroke="#ffffff" stroke-width="2" />
 <text x="${xPos}" y="${yPos - 9}" font-size="11" font-weight="bold" fill="#173f33" text-anchor="middle">${Number(pt.weight).toFixed(1)}kg</text>
 `;
 }
 });

 container.innerHTML = `
 <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
 <div style="font-weight:bold; font-size:14px; color:#173f33;">
 過去1年間の体重推移グラフ (${targetRes ? `${targetRes.name} 様` : ''})
 </div>
 <div style="display:flex; gap:6px; flex-wrap:wrap;">
 ${resButtons}
 </div>
 </div>
 <div style="overflow-x:auto;">
 <svg viewBox="0 0 ${svgW} ${svgH}" style="width:100%; max-width:${svgW}px; height:auto; background:#f6f8f6; border-radius:6px; display:block;">
 ${gridLines}
 ${pathD ? `<path d="${pathD}" fill="none" stroke="#1e5b47" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />` : ''}
 ${dotsHtml}
 ${monthLabelsHtml}
 </svg>
 </div>
 `;
}

function saveWeight(resId) {
 const r = gState.residents.find(x => x.id === resId);
 const inputEl = document.getElementById(`wVal_${resId}`);
 if (!r || !inputEl) return;

 const w = parseFloat(inputEl.value.trim());
 if (isNaN(w) || w <= 0 || w > 300) {
 alert("正しい体重の数値（例: 52.4）を入力してください。");
 return;
 }

 // 前月データ取得して前月比を計算
 const records = db.data.weight_records || [];
 const [y, m] = gState.currentMonth.split("-").map(Number);
 const prevDate = new Date(y, m - 2, 1);
 const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
 const prevRec = records.filter(item => item.resident_id === resId && (item.month === prevMonth || (item.date && item.date.startsWith(prevMonth)))).sort((a,b) => b.id - a.id)[0];

 let diffStr = "";
 if (prevRec) {
 const diff = (w - prevRec.weight).toFixed(1);
 const diffNum = parseFloat(diff);
 diffStr = diffNum > 0 ? `+${diff}kg` : (diffNum < 0 ? `${diff}kg` : `±0.0kg`);
 }

 const staff = document.getElementById("currentStaff").value;
 const tm = new Date().toTimeString().slice(0, 5);

 db.data.weight_records.unshift({
 id: Date.now(),
 date: gState.selectedDate,
 month: gState.currentMonth,
 resident_id: resId,
 weight: w,
 diff_prev: diffStr || null,
 staff_name: staff
 });

 // 個人記録（介護記録）へ自動転記
 const diffNote = diffStr ? ` (前月比: ${diffStr})` : "";
 db.data.care_records.unshift({
 id: Date.now() + 1,
 recorded_at: `${gState.selectedDate} ${tm}`,
 resident_id: resId,
 category: "測定",
 content: `月次体重測定: ${w.toFixed(1)}kg${diffNote}`,
 staff_name: staff
 });

 db.save();
 renderWeightTable();
 loadDateRecords(gState.selectedDate);
 alert(`${r.name} 様の体重（${w.toFixed(1)}kg${diffNote}）を登録しました！個人記録へ自動転記されました。`);
}

// 9. シーツ交換チェック (利用者切り替え ＆ 取消機能)
function renderLinenTable() {
 const r = gState.residents.find(x => x.id === gState.selectedResidentId);
 const resNameEl = document.getElementById("linenResidentName");
 if (resNameEl) resNameEl.textContent = r ? r.name : "利用者";

 // 利用者セレクトボックスの同期
 const sel = document.getElementById("linenResidentSelect");
 if (sel) {
   sel.innerHTML = "";
   cpResidentsOn(gState.selectedDate).forEach(res => {
     const opt = document.createElement("option");
     opt.value = res.id;
     opt.textContent = `${res.room_no}号室 ${res.name} 様 (${res.status})`;
     if (res.id === gState.selectedResidentId) opt.selected = true;
     sel.appendChild(opt);
   });
 }

 const tbody = document.querySelector("#linenTable tbody");
 if (!tbody) return;
 tbody.innerHTML = "";
 const linens = cpLedgerOrder((db.data.linens || []).filter(l => l.date === gState.selectedDate));

 if (linens.length === 0) {
   tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:16px;">本日のシーツ・リネン交換記録はありません。上のボタンから記録できます。</td></tr>`;
   return;
 }

 linens.forEach(l => {
   const res = gState.residents.find(x => x.id === l.resident_id);
   const tr = document.createElement("tr");
   const actionHtml = l.voided
     ? `<div style="font-size:11px; color:#991b1b; font-weight:bold;">取消済</div><div style="font-size:10.5px; color:#5f6d66; white-space:normal;">${escapeHtml(l.voided_at || '')} ${escapeHtml(l.voided_by || '')}<br>理由: ${escapeHtml(l.void_reason || '-')}</div>`
     : `<button type="button" class="btn btn-secondary" style="font-size:11px; padding:2px 8px; color:#dc2626; border-color:#fca5a5;" onclick="deleteLinenRecord(${l.id})">取消</button>`;
   tr.innerHTML = `
     <td>${escapeHtml(l.date || '')}</td>
     <td><strong>${res ? escapeHtml(res.room_no + '号室 ' + res.name + ' 様') : '-'}</strong></td>
     <td><span style="font-weight:bold; color:#0284c7; background:#e0f2fe; padding:2px 8px; border-radius:4px;">${escapeHtml(l.exchange_type || '')}</span></td>
     <td>${escapeHtml(l.notes || '-')}</td>
     <td>${escapeHtml(l.staff_name || '-')}</td>
     <td style="text-align:center;">${actionHtml}</td>
   `;
   if (l.voided) cpMarkVoidedRow(tr);
   tbody.appendChild(tr);
 });
}

function changeLinenResident(resId) {
 selectResident(Number(resId));
}

function saveLinen(type) {
 const staff = document.getElementById("currentStaff").value;
 const tm = new Date().toTimeString().slice(0, 5);
 const r = gState.residents.find(x => x.id === gState.selectedResidentId);
 const linenId = Date.now();

 db.data.linens.unshift({
   id: linenId,
   date: gState.selectedDate,
   resident_id: gState.selectedResidentId,
   exchange_type: type,
   notes: "",
   staff_name: staff
 });

 // 個人記録へ自動転記 (連動IDを持たせる)
 db.data.care_records.unshift({
   id: linenId + 1,
   recorded_at: `${gState.selectedDate} ${tm}`,
   resident_id: gState.selectedResidentId,
   category: "環境整備",
   content: `シーツ・リネン交換 (${type}) 実施`,
   staff_name: staff,
   source_linen_id: linenId
 });

 db.save();
 loadDateRecords(gState.selectedDate);
 alert(`${r ? r.name : '利用者'}様のシーツ交換（${type}）を記録しました！個人記録へ自動転記されました。`);
}

function deleteLinenRecord(linenId) {
 const target = (db.data.linens || []).find(l => l.id === linenId);
 if (!target) return;
 const res = gState.residents.find(x => x.id === target.resident_id);
 const resName = res ? res.name + " 様" : "対象利用者";

 if (target.voided) return;
 // [Claude修正] シーツ交換記録と連動した介護記録は、消さずに「取消」として残す（理由必須）
 const reason = prompt(`${resName}のシーツ交換記録（${target.exchange_type}）を「取消」にします。\n連動した介護記録も取消になります。記録は消えずに残ります。\n\n取消の理由を入力してください (例: 押し間違い、別の方の記録)`, "");
 if (reason === null) return;
 if (!reason.trim()) { alert("取消の理由を入力してください。取消は行っていません。"); return; }
 const now = toLocalDateTimeStr(new Date());
 const by = cpLedgerStaff();
 target.voided = true; target.voided_at = now; target.voided_by = by; target.void_reason = reason.trim();
 (db.data.care_records || []).forEach(c => {
 if (c.source_linen_id === linenId && !c.voided) {
 c.voided = true; c.voided_at = now; c.voided_by = by; c.void_reason = `シーツ交換記録の取消: ${reason.trim()}`;
 }
 });

 db.save();
 loadDateRecords(gState.selectedDate);
 alert(`${resName}のシーツ交換記録を取り消しました。`);
}

// 10. 身だしなみチェック
function renderGroomingTable() {
 const tbody = document.querySelector("#groomingTable tbody");
 tbody.innerHTML = "";
 const groomings = (db.data.groomings || []).filter(g => g.date === gState.selectedDate);

 cpResidentsOn(gState.selectedDate).forEach(r => {
 const g = groomings.find(x => x.resident_id === r.id);
 const tr = document.createElement("tr");
 tr.innerHTML = `
 <td>${r.room_no}</td>
 <td><strong>${r.name} 様</strong></td>
 <td><label><input type="checkbox" id="gNail_${r.id}" ${g && g.nail_done ? 'checked' : ''}> 爪切り済</label></td>
 <td><label><input type="checkbox" id="gShave_${r.id}" ${g && g.shave_done ? 'checked' : ''}> 髭剃り済</label></td>
 <td><label><input type="checkbox" id="gEar_${r.id}" ${g && g.ear_done ? 'checked' : ''}> 耳掃除済</label></td>
 <td><input type="text" id="gNotes_${r.id}" class="form-control" style="font-size:12px;" value="${g ? g.notes : ''}" placeholder="深爪注意、巻き爪等"></td>
 <td><button class="btn btn-primary" style="padding:4px 10px; font-size:12px;" onclick="saveGrooming(${r.id})">保存</button></td>
 `;
 tbody.appendChild(tr);
 });
}

function saveGrooming(resId) {
 const nail = document.getElementById(`gNail_${resId}`).checked ? 1 : 0;
 const shave = document.getElementById(`gShave_${resId}`).checked ? 1 : 0;
 const ear = document.getElementById(`gEar_${resId}`).checked ? 1 : 0;
 const notes = document.getElementById(`gNotes_${resId}`).value;
 const staff = document.getElementById("currentStaff").value;

 let existing = (db.data.groomings || []).find(g => g.date === gState.selectedDate && g.resident_id === resId);
 if (existing) {
 const cpOldGroom = Object.assign({}, existing);
 existing.nail_done = nail;
 existing.shave_done = shave;
 existing.ear_done = ear;
 existing.notes = notes;
 existing.staff_name = staff;
 cpAppendEditHistory(existing, cpOldGroom, ["nail_done", "shave_done", "ear_done", "notes"]);
 } else {
 db.data.groomings.push({
 id: Date.now(), date: gState.selectedDate, resident_id: resId, nail_done: nail, shave_done: shave, ear_done: ear, notes: notes, staff_name: staff
 });
 }
 db.save();
 loadDateRecords(gState.selectedDate);
 alert("身だしなみチェックを保存しました！");
}

function submitGroomingsBatch() {
 const staff = document.getElementById("currentStaff").value;
 const nowTm = new Date().toTimeString().slice(0, 5);
 let savedCount = 0;

 cpResidentsOn(gState.selectedDate).forEach(r => {
 const nailEl = document.getElementById(`gNail_${r.id}`);
 const shaveEl = document.getElementById(`gShave_${r.id}`);
 const earEl = document.getElementById(`gEar_${r.id}`);
 const notesEl = document.getElementById(`gNotes_${r.id}`);
 if (!nailEl || !shaveEl || !earEl) return;

 const nail = nailEl.checked ? 1 : 0;
 const shave = shaveEl.checked ? 1 : 0;
 const ear = earEl.checked ? 1 : 0;
 const notes = notesEl ? notesEl.value.trim() : "";

 if (nail || shave || ear || notes) {
 let existing = (db.data.groomings || []).find(g => g.date === gState.selectedDate && g.resident_id === r.id);
 if (existing) {
 const cpOldGroom = Object.assign({}, existing);
 existing.nail_done = nail;
 existing.shave_done = shave;
 existing.ear_done = ear;
 existing.notes = notes;
 existing.staff_name = staff;
 cpAppendEditHistory(existing, cpOldGroom, ["nail_done", "shave_done", "ear_done", "notes"]);
 } else {
 db.data.groomings.push({
 id: Date.now() + Math.floor(Math.random() * 1000),
 date: gState.selectedDate,
 resident_id: r.id,
 nail_done: nail,
 shave_done: shave,
 ear_done: ear,
 notes: notes,
 staff_name: staff
 });
 }

 const parts = [];
 if (nail) parts.push("爪切り");
 if (shave) parts.push("髭剃り");
 if (ear) parts.push("耳掃除");
 if (notes) parts.push(`特記:${notes}`);
 
 db.data.care_records.unshift({
 id: Date.now() + Math.floor(Math.random() * 10000),
 recorded_at: `${gState.selectedDate} ${nowTm}`,
 resident_id: r.id,
 category: "身だしなみ",
 content: `身だしなみケア実施: ${parts.join(", ")}`,
 staff_name: staff
 });
 savedCount++;
 }
 });

 db.save();
 renderGroomingTable();
 loadDateRecords(gState.selectedDate);
 alert(`身だしなみチェックを一括確定しました（${savedCount}名分のケアを個人記録へ転記完了）！`);
}

// 11. レク履歴
function renderRecreationTable() {
	const tbody = document.querySelector("#recreationTable tbody");
	if (!tbody) return;
	tbody.innerHTML = "";
	const list = db.data.recreations || [];
	if (list.length === 0) {
		tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:var(--text-muted); padding:16px;">レクリエーション実施記録はありません。</td></tr>`;
		return;
	}
	cpLedgerOrder(list).forEach(rec => {
		const tr = document.createElement("tr");
		tr.innerHTML = `
			<td>${escapeHtml(rec.date || '')}</td>
			<td><span class="badge" style="background:#f1f6f3; color:#1e5b47;">${escapeHtml(rec.program_type || '機能訓練')}</span></td>
			<td><strong>${escapeHtml(rec.title || '')}</strong></td>
			<td>${rec.participants_count ? `${escapeHtml(String(rec.participants_count))}名` : '-'}</td>
			<td>${escapeHtml(rec.content || '-')}</td>
			<td style="color:#1c2622;">${escapeHtml(rec.reaction || '-')}</td>
			<td>${escapeHtml(rec.notes || '-')}</td>
			<td>${escapeHtml(rec.staff_name || '担当')}</td>
			<td style="text-align:center; white-space:nowrap;">
				${cpLedgerActions('recreations', rec, 'openRecreationModal')}
			</td>
		`;
		if (rec.voided) cpMarkVoidedRow(tr);
		tbody.appendChild(tr);
	});
}

function openRecreationModal(editId = null) {
	const idEl = document.getElementById("recEditId");
	const dateEl = document.getElementById("recDate");
	const typeEl = document.getElementById("recType");
	const titleEl = document.getElementById("recTitle");
	const partEl = document.getElementById("recParticipants");
	const contEl = document.getElementById("recContent");
	const reactEl = document.getElementById("recReaction");
	const notesEl = document.getElementById("recNotes");

	if (editId) {
		const rec = (db.data.recreations || []).find(r => r.id === editId);
		if (!rec) return;
		idEl.value = rec.id;
		dateEl.value = rec.date || toLocalDateStr(new Date());
		typeEl.value = rec.program_type || "機能訓練体操";
		titleEl.value = rec.title || "";
		partEl.value = rec.participants_count || "";
		contEl.value = rec.content || "";
		reactEl.value = rec.reaction || "";
		notesEl.value = rec.notes || "";
	} else {
		idEl.value = "";
		dateEl.value = gState.selectedDate || toLocalDateStr(new Date());
		typeEl.value = "機能訓練体操";
		titleEl.value = "";
		partEl.value = "";
		contEl.value = "";
		reactEl.value = "";
		notesEl.value = "";
	}
	openModal("recreationModal");
}

function submitRecreationRecord() {
	const editId = document.getElementById("recEditId")?.value;
	const date = document.getElementById("recDate")?.value;
	const type = document.getElementById("recType")?.value;
	const title = document.getElementById("recTitle")?.value.trim();
	const part = document.getElementById("recParticipants")?.value;
	const cont = document.getElementById("recContent")?.value.trim();
	const react = document.getElementById("recReaction")?.value.trim();
	const notes = document.getElementById("recNotes")?.value.trim();
	const staff = document.getElementById("currentStaff")?.value || "担当職員";

	if (!date || !title) {
		alert("実施日とプログラム名を入力してください。");
		return;
	}

	if (!Array.isArray(db.data.recreations)) db.data.recreations = [];

	if (editId) {
		const rec = db.data.recreations.find(r => r.id === Number(editId));
		if (rec) {
			const cpOld = Object.assign({}, rec); // [Claude修正] 訂正前の内容を履歴に残す
			rec.date = date; rec.program_type = type; rec.title = title;
			rec.participants_count = part; rec.content = cont; rec.reaction = react;
			rec.notes = notes;
			cpAppendEditHistory(rec, cpOld, ["date", "program_type", "title", "participants_count", "content", "reaction", "notes"]);
			// [Claude修正] 記録者は最初の記録者のまま残し、訂正者は別に記録する
			if (!rec.staff_name) rec.staff_name = staff;
			rec.updated_by = staff; rec.updated_at = toLocalDateTimeStr(new Date());
		}
	} else {
		db.data.recreations.unshift({
			id: Date.now(), date: date, program_type: type, title: title,
			participants_count: part, content: cont, reaction: react,
			notes: notes, staff_name: staff
		});
	}

	db.save();
	closeModal("recreationModal");
	renderRecreationTable();
	alert("レクリエーション実施記録を保存しました！");
}

function deleteRecreationRecord(id) {
	// [Claude修正] 削除せず取消にする
	cpVoidLedgerRecord('recreations', id);
}
// 12. 面会 ＆ 荷物受付
function submitVisitation() {
 const visitor = document.getElementById("visitVisitor").value.trim();
 const items = document.getElementById("visitItems").value.trim();
 const storage = document.getElementById("visitStorage").value.trim();
 const notes = document.getElementById("visitNotes").value.trim();
 const staff = document.getElementById("currentStaff").value;
 const now = new Date();
 const nowStr = `${toLocalDateStr(now)} ${now.toTimeString().slice(0, 5)}`;

 if (!visitor) {
 alert("面会者のお名前・続柄を入力してください。");
 return;
 }

 db.data.visitations.unshift({
 id: Date.now(), recorded_at: nowStr, resident_id: gState.selectedResidentId,
 visitor_name: visitor, items: items, storage_place: storage, notes: notes, staff_name: staff
 });

 // 個人記録へ自動転記
 db.data.care_records.unshift({
 id: Date.now() + 1, recorded_at: nowStr, resident_id: gState.selectedResidentId, category: "面会",
 content: `ご面会 (${visitor}様)。持参品: ${items} (保管: ${storage})。${notes}`, staff_name: staff
 });

 db.save();

 document.getElementById("visitVisitor").value = "";
 document.getElementById("visitItems").value = "";
 document.getElementById("visitStorage").value = "";
 document.getElementById("visitNotes").value = "";
 loadDateRecords(gState.selectedDate);
 alert("面会・差し入れ荷物を登録しました！個人記録へ自動転記されました。");
}



// 日々申し送りの確認状況チェック (追記・更新判定付き)
function getDailyNotebookConfirmationStatus(nb, currentStaff) {
	if (!currentStaff) return { confirmed: false, hasNewUpdate: false };

	const lastUpdated = nb.last_updated_at || nb.created_at;
	if (nb.confirmed_versions && nb.confirmed_versions[currentStaff]) {
		const confirmedTime = nb.confirmed_versions[currentStaff];
		if (lastUpdated && confirmedTime < lastUpdated) {
			return { confirmed: false, hasNewUpdate: true };
		}
		return { confirmed: true, hasNewUpdate: false };
	}

	const isConfirmed = Array.isArray(nb.confirmed_staff) && nb.confirmed_staff.includes(currentStaff);
	if (isConfirmed && nb.last_updated_at) {
		if (nb.last_updated_by === currentStaff) {
			return { confirmed: true, hasNewUpdate: false };
		}
		return { confirmed: false, hasNewUpdate: true };
	}

	return { confirmed: isConfirmed, hasNewUpdate: false };
}

// 13. 連絡・申送り ＆ 月間業務連絡表
function renderNotebook() {
	renderMonthlyNotices();

	const list = document.getElementById("notebookList");
	if (!list) return;
	list.innerHTML = "";
	const notebooks = (db.data.notebooks || []).filter(nb => !nb.voided && nb.date === gState.selectedDate); // [Claude修正] 取消済みは表示しない（データには残る）
	const currentStaff = (document.getElementById("currentStaff") ? document.getElementById("currentStaff").value : "") || "";

	if (notebooks.length === 0) {
		list.innerHTML = '<p style="font-size:13px; color:var(--text-muted); padding:10px 0;">本日の引継ぎ・申し送り事項はありません。</p>';
	} else {
		notebooks.forEach(nb => {
			const stStatus = getDailyNotebookConfirmationStatus(nb, currentStaff);

			const card = document.createElement("div");
			card.style.background = stStatus.confirmed ? "#f6f8f6" : (nb.status === "未対応" ? "#ffffff" : "#f0fdf4");
			card.style.border = stStatus.hasNewUpdate ? "2px solid #f59e0b" : (stStatus.confirmed ? "1px solid #cdd6d0" : (nb.status === "未対応" ? "2px solid #1e5b47" : "1px solid #bbf7d0"));
			card.style.borderRadius = "8px";
			card.style.padding = "12px 14px";
			card.style.marginBottom = "10px";
			card.style.boxShadow = stStatus.confirmed ? "none" : "0 2px 5px rgba(37,99,235,0.12)";

			let statusBadgeHtml = "";
			if (stStatus.hasNewUpdate) {
				statusBadgeHtml = `<span class="badge" style="background:#fef3c7; color:#92400e; font-size:11.5px; padding:2px 8px; font-weight:bold; border:1px solid #fde68a;">☐ 追記あり (要再確認)</span>`;
			} else if (stStatus.confirmed) {
				statusBadgeHtml = `<span class="badge" style="background:#dcfce7; color:#166534; font-size:11.5px; padding:2px 8px; font-weight:bold; border:1px solid #86efac;">✓ 確認済み</span>`;
			} else {
				statusBadgeHtml = `<span class="badge" style="background:#fee2e2; color:#991b1b; font-size:11.5px; padding:2px 8px; font-weight:bold; border:1px solid #fca5a5;">☐ 未確認</span>`;
			}

			const taskBadgeHtml = nb.status === '未対応'
				? `<span class="badge" style="background:#fef3c7; color:#92400e; font-size:11px; padding:2px 6px; font-weight:bold;">要対応</span>`
				: `<span class="badge" style="background:#dcfce7; color:#166534; font-size:11px; padding:2px 6px; font-weight:bold;">完了</span>`;

			const confirmedPills = (nb.confirmed_staff && nb.confirmed_staff.length > 0)
				? nb.confirmed_staff.map(s => `<span style="background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd; padding:1px 7px; border-radius:4px; font-size:11.5px; font-weight:bold; white-space:nowrap;">${escapeHtml(s)}</span>`).join(" ")
				: `<span style="color:#94a19a; font-size:11.5px;">未確認</span>`;

			let updatesHtml = "";
			if (Array.isArray(nb.updates) && nb.updates.length > 0) {
				updatesHtml += `<div style="background:#fffbeb; border:1px solid #fef3c7; border-radius:6px; padding:8px 10px; margin:8px 0 6px 0;">`;
				updatesHtml += `<div style="font-weight:bold; font-size:11.5px; color:#b45309; margin-bottom:4px;"> 【追記・変更事項】 (計 ${nb.updates.length}件)</div>`;
				nb.updates.forEach(u => {
					updatesHtml += `
						<div style="font-size:12px; color:#78350f; margin-top:4px; padding-top:4px; border-top:1px dashed #fde68a;">
							<span style="font-weight:bold; color:#92400e;">[${escapeHtml(u.created_at || '')} 追記 by ${escapeHtml(u.staff_name || '職員')}]:</span>
							<div style="white-space:pre-wrap; margin-top:2px;">${escapeHtml(u.content)}</div>
						</div>
					`;
				});
				updatesHtml += `</div>`;
			}

			card.innerHTML = `
				<div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:8px;">
					<div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
						${taskBadgeHtml}
						${statusBadgeHtml}
						<strong style="font-size:14.5px; color:#22302b; margin-left:4px;">${escapeHtml(nb.content)}</strong>
					</div>
					<div style="display:flex; gap:6px; align-items:center;">
						<span style="font-size:11px; color:#5f6d66;">記入: ${escapeHtml(nb.staff_name || '')} ${nb.resolved_staff ? `/ 対応: ${escapeHtml(nb.resolved_staff)}` : ''}</span>
						<button class="btn btn-secondary" style="padding:2px 8px; font-size:11px; color:#1e5b47; border-color:#a9cfbf; background:#f1f6f3;" onclick="openAddDailyNotebookUpdateModal(${nb.id})">＋ 追記</button>
						${nb.status === '未対応' ? `<button class="btn btn-success" style="padding:2px 8px; font-size:11px;" onclick="resolveNotebook(${nb.id})">完了にする</button>` : ''}
						<button class="btn btn-secondary" style="padding:2px 6px; font-size:11px; color:#dc2626; border-color:#fca5a5;" onclick="deleteDailyNotebookItem(${nb.id})">削除</button>
					</div>
				</div>
				${updatesHtml}
				<div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; border-top:1px dashed #dfe5e1; margin-top:8px; padding-top:8px; font-size:12px; line-height:1.6;">
					<div style="display:flex; align-items:center; flex-wrap:wrap; gap:6px; flex:1;">
						<strong style="color:#4a5852; white-space:nowrap;">確認済職員:</strong>
						<div style="display:flex; flex-wrap:wrap; gap:4px; align-items:center;">${confirmedPills}</div>
					</div>
					<div>
						${stStatus.hasNewUpdate ? `
							<button class="btn btn-primary" style="padding:4px 14px; font-size:12.5px; font-weight:bold; background:#d97706; border-color:#b45309;" onclick="confirmDailyNotebookItem(${nb.id})">
								☑ 追記も含めて確認済みにする
							</button>
						` : (stStatus.confirmed ? `
							<button class="btn btn-secondary" style="padding:4px 12px; font-size:12px; background:#dcfce7; color:#166534; border-color:#86efac; font-weight:bold;" onclick="confirmDailyNotebookItem(${nb.id})">
								✓ 確認済み (解除)
							</button>
						` : `
							<button class="btn btn-primary" style="padding:4px 14px; font-size:12.5px; font-weight:bold; background:#1e5b47; border-color:#1a4f3d;" onclick="confirmDailyNotebookItem(${nb.id})">
								☑ 確認済みにする
							</button>
						`)}
					</div>
				</div>
			`;
			list.appendChild(card);
		});
	}

	// 一括確認ボタン
	const stampBtn = document.getElementById("notebookStampBtn");
	if (stampBtn && currentStaff) {
		// [Claude修正 2026-10-16] 全部確認済みで名前もあるときは「確認済み」と出す（新しい申し送り・追記があれば押し直せる）
		const allDone = notebooks.every(nb => getDailyNotebookConfirmationStatus(nb, currentStaff).confirmed);
		const stamped = (db.data.notebook_stamps || []).some(x => !x.voided && x.date === gState.selectedDate && x.staff_name === currentStaff);
		stampBtn.textContent = (allDone && stamped) ? `✓ ［${currentStaff}］本日の申し送りは確認済みです` : `☑ 本日の全項目を［${currentStaff}］で一括確認済みにする`;
		stampBtn.className = (allDone && stamped) ? "btn btn-secondary" : "btn btn-primary";
		stampBtn.style.padding = "8px 18px";
		stampBtn.style.fontSize = "13px";
		stampBtn.style.fontWeight = "bold";
	}
	renderNotebookStamps(); // [Claude修正 2026-10-16]
}

// 月間業務連絡表
// [Claude修正] 同じ名前の関数がもう1つ後ろにあり、こちらは使われていなかった（後ろの定義が有効）ため削除: renderMonthlyNotices

// 一括確認機能（ボタン押下時に全項目に現在の職員名を反映）
// [Claude修正] 同じ名前の関数がもう1つ後ろにあり、こちらは使われていなかった（後ろの定義が有効）ため削除: toggleNotebookStamp


function confirmDailyNotebookItem(id) {
	const currentStaff = document.getElementById("currentStaff") ? document.getElementById("currentStaff").value : "";
	if (!currentStaff) {
		alert("担当職員を選択してください。");
		return;
	}

	const nb = (db.data.notebooks || []).find(x => x.id === id);
	if (!nb) return;
	if (!Array.isArray(nb.confirmed_staff)) nb.confirmed_staff = [];
	if (!nb.confirmed_versions) nb.confirmed_versions = {};

	const stStatus = getDailyNotebookConfirmationStatus(nb, currentStaff);

	if (stStatus.confirmed) {
		const idx = nb.confirmed_staff.indexOf(currentStaff);
		if (idx !== -1) nb.confirmed_staff.splice(idx, 1);
		delete nb.confirmed_versions[currentStaff];
		cpLogConfirm(nb, currentStaff, "確認を取消");
	} else {
		if (!nb.confirmed_staff.includes(currentStaff)) {
			nb.confirmed_staff.push(currentStaff);
		}
		cpLogConfirm(nb, currentStaff, "確認");
		const nowStr = nb.last_updated_at || nb.created_at || new Date().toISOString();
		nb.confirmed_versions[currentStaff] = nowStr;
	}

	db.save();
	renderNotebook();
}

function openAddDailyNotebookUpdateModal(id) {
	const nb = (db.data.notebooks || []).find(x => x.id === id);
	if (!nb) return;
	document.getElementById("dailyNotebookUpdateParentId").value = id;
	document.getElementById("dailyNotebookUpdateTargetTitle").textContent = nb.content;
	document.getElementById("dailyNotebookUpdateContent").value = "";
	document.getElementById("dailyNotebookUpdateModal").style.display = "flex";
}

function submitDailyNotebookUpdate() {
	const id = parseInt(document.getElementById("dailyNotebookUpdateParentId").value, 10);
	const content = document.getElementById("dailyNotebookUpdateContent").value.trim();
	const currentStaff = document.getElementById("currentStaff") ? document.getElementById("currentStaff").value : "職員";

	if (!content) {
		alert("追記・変更内容を入力してください。");
		return;
	}

	const nb = (db.data.notebooks || []).find(x => x.id === id);
	if (!nb) return;

	if (!Array.isArray(nb.updates)) nb.updates = [];
	const now = new Date();
	const nowStr = `${toLocalDateStr(now)} ${now.toTimeString().slice(0, 5)}`;

	nb.updates.push({
		id: Date.now(),
		staff_name: currentStaff,
		content: content,
		created_at: nowStr
	});

	// [Claude修正 2026-10-16] 確認済みかどうかの比較に使うため秒まで記録する（分単位だと、同じ分に確認した職員に「追記あり」が出なかった。月間業務連絡と同じ直し）
	const stamp = nowStr + ":" + String(now.getSeconds()).padStart(2, "0");
	nb.last_updated_at = stamp;
	nb.last_updated_by = currentStaff;

	if (!nb.confirmed_staff) nb.confirmed_staff = [];
	if (!nb.confirmed_staff.includes(currentStaff)) nb.confirmed_staff.push(currentStaff);
	if (!nb.confirmed_versions) nb.confirmed_versions = {};
	nb.confirmed_versions[currentStaff] = stamp;

	db.save();
	closeModal("dailyNotebookUpdateModal");
	renderNotebook();
	alert("申し送り事項に追記を登録しました。他職員へ再確認が表示されます。");
}

// [Claude修正] 申し送り・業務連絡の「確認」「確認の取消」を、日時つきで記録に残す
function cpLogConfirm(item, staff, action) {
 if (!item) return;
 if (!Array.isArray(item.confirm_log)) item.confirm_log = [];
 item.confirm_log.push({ staff: staff, action: action, at: toLocalDateTimeStr(new Date()) });
}

function deleteDailyNotebookItem(id) {
	// [Claude修正] 申し送りは消さずに「取消」として残す（理由必須）
	const nb = (db.data.notebooks || []).find(x => x.id === id);
	if (!cpVoidRecord(nb, "この申し送り事項")) return;
	db.save();
	renderNotebook();
}

function submitNotebook() {
	const content = document.getElementById("notebookContent").value.trim();
	if (!content) return;
	const staff = document.getElementById("currentStaff").value || "担当職員";
	const now = new Date();
	const nowStr = `${toLocalDateStr(now)} ${now.toTimeString().slice(0, 5)}`;

	if (!Array.isArray(db.data.notebooks)) db.data.notebooks = [];
	db.data.notebooks.unshift({
		id: Date.now(),
		date: gState.selectedDate,
		category: "申し送り",
		content: content,
		status: "未対応",
		staff_name: staff,
		created_at: nowStr,
		resolved_staff: null,
		confirmed_staff: [staff],
		confirmed_versions: { [staff]: nowStr }
	});
	db.save();
	document.getElementById("notebookContent").value = "";
	renderNotebook();
}


function resolveNotebook(id) {
 const staff = document.getElementById("currentStaff").value;
 const nb = db.data.notebooks.find(x => x.id === id);
 if (nb) {
 nb.status = "完了";
 nb.resolved_staff = staff;
 db.save();
 loadDateRecords(gState.selectedDate);
 }
}

// [Claude修正 2026-10-16] 「本日の全項目を一括確認済みにする」を押しても、確認者一覧に名前が出ず（一覧を描く処理がなかった）、
// 各申し送りも「未確認」のままだった。押すと、その日の申し送りを全部（追記も含めて）確認済みにし、確認者一覧に名前を出す。
// 名前の取り消しは確認者一覧の名前を押して行う（ボタンで外れないように、押し直しても取り消しにはしない）
function toggleNotebookStamp() {
 const staff = (document.getElementById("currentStaff") || {}).value || "";
 if (!staff) {
  alert("担当職員を選択してください。");
  return;
 }
 const items = (db.data.notebooks || []).filter(nb => !nb.voided && nb.date === gState.selectedDate);
 items.forEach(nb => {
  const st = getDailyNotebookConfirmationStatus(nb, staff);
  if (st.confirmed) return;
  if (!Array.isArray(nb.confirmed_staff)) nb.confirmed_staff = [];
  if (!nb.confirmed_versions || typeof nb.confirmed_versions !== "object") nb.confirmed_versions = {};
  if (!nb.confirmed_staff.includes(staff)) nb.confirmed_staff.push(staff);
  nb.confirmed_versions[staff] = nb.last_updated_at || nb.created_at || toLocalDateTimeStr(new Date());
  cpLogConfirm(nb, staff, "確認（一括）");
 });
 if (!Array.isArray(db.data.notebook_stamps)) db.data.notebook_stamps = [];
 const nowStr = toLocalDateTimeStr(new Date());
 const stamp = db.data.notebook_stamps.find(x => !x.voided && x.date === gState.selectedDate && x.staff_name === staff);
 if (stamp) stamp.stamped_at = nowStr;
 else db.data.notebook_stamps.push({ id: Date.now(), date: gState.selectedDate, staff_name: staff, stamped_at: nowStr });
 db.save();
 renderNotebook();
}

// [Claude修正 2026-10-16] 本日の申し送り確認（確認者一覧）を描く。名前を押すとその確認を取り消せる
function renderNotebookStamps() {
 const area = document.getElementById("hankoStampArea");
 if (!area) return;
 const stamps = (db.data.notebook_stamps || []).filter(x => !x.voided && x.date === gState.selectedDate);
 area.innerHTML = "";
 if (!stamps.length) {
  area.innerHTML = '<span style="font-size:13px; color:#94a19a;">まだ確認した職員はいません。</span>';
  return;
 }
 stamps.forEach(x => {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "cp-hanko-name";
  b.title = "押すとこの確認を取り消せます";
  b.innerHTML = `${escapeHtml(x.staff_name || "")} <span class="cp-hanko-time">${escapeHtml((x.stamped_at || "").slice(11, 16))}</span>`;
  b.onclick = () => removeNotebookStamp(gState.selectedDate, x.staff_name);
  area.appendChild(b);
 });
}

function stampNotebook() {
 const staff = document.getElementById("currentStaff").value;
 const exists = (db.data.notebook_stamps || []).some(s => !s.voided && s.date === gState.selectedDate && s.staff_name === staff);
 if (!exists) {
 db.data.notebook_stamps.push({ id: Date.now(), date: gState.selectedDate, staff_name: staff, stamped_at: toLocalDateTimeStr(new Date()) });
 db.save();
 loadDateRecords(gState.selectedDate);
 }
}

function removeNotebookStamp(date, staffName) {
 if (confirm(`「${staffName}」の確認を取り消しますか？`)) {
 // [Claude修正] 確認印は消さずに、取り消した日時と職員を残す
 const now = toLocalDateTimeStr(new Date());
 (db.data.notebook_stamps || []).forEach(s => { if (!s.voided && s.date === date && s.staff_name === staffName) { s.voided = true; s.voided_at = now; s.voided_by = cpLedgerStaff(); } });
 db.save();
 loadDateRecords(date);
 }
}


// 月間業務連絡の確認状況チェック (追記・更新判定付き)
function getNoticeConfirmationStatus(n, currentStaff) {
	if (!currentStaff) return { confirmed: false, hasNewUpdate: false };

	const lastUpdated = n.last_updated_at || n.created_at;
	if (n.confirmed_versions && n.confirmed_versions[currentStaff]) {
		const confirmedTime = n.confirmed_versions[currentStaff];
		if (lastUpdated && confirmedTime < lastUpdated) {
			return { confirmed: false, hasNewUpdate: true };
		}
		return { confirmed: true, hasNewUpdate: false };
	}

	const isConfirmed = Array.isArray(n.confirmed_staff) && n.confirmed_staff.includes(currentStaff);
	if (isConfirmed && n.last_updated_at) {
		if (n.last_updated_by === currentStaff) {
			return { confirmed: true, hasNewUpdate: false };
		}
		return { confirmed: false, hasNewUpdate: true };
	}

	return { confirmed: isConfirmed, hasNewUpdate: false };
}


// 月間業務連絡表 (全館・当月1ヶ月間継続掲示・変更事項等)
function renderMonthlyNotices() {
	const container = document.getElementById("monthlyNoticeList");
	const alertArea = document.getElementById("monthlyNoticeAlertArea");
	if (!container) return;
	container.innerHTML = "";
	if (alertArea) alertArea.innerHTML = "";

	const curMonth = (gState.selectedDate || toLocalDateStr(new Date())).slice(0, 7);
	const notices = (db.data.monthly_notices || []).filter(n => !n.voided && n.month === curMonth); // [Claude修正] 取消済みは表示しない（データには残る）
	const currentStaff = (document.getElementById("currentStaff") ? document.getElementById("currentStaff").value : "") || "";

	// 未確認アラート表示
	if (currentStaff && notices.length > 0) {
		const unconfirmed = notices.filter(n => {
			const st = getNoticeConfirmationStatus(n, currentStaff);
			return !st.confirmed;
		});
		if (unconfirmed.length > 0 && alertArea) {
			alertArea.innerHTML = `
			<div style="background:#fee2e2; border:1px solid #fecaca; border-radius:6px; padding:10px 14px; margin-bottom:12px; color:#991b1b; font-size:13px; font-weight:bold;">
				 ${escapeHtml(currentStaff)} さん、${curMonth.split("-")[1]}月分の「見ました」未チェック連絡が <strong>${unconfirmed.length}件</strong> あります。各項目の「☑ 見ました」ボタンを押してください。
			</div>
			`;
		}
	}

	if (notices.length === 0) {
		container.innerHTML = `<p style="font-size:13px; color:var(--text-muted); margin:8px 0;">${curMonth}月の業務連絡はありません。「＋ 業務連絡を追加」から追加できます。</p>`;
		return;
	}

	notices.forEach(n => {
		const stStatus = getNoticeConfirmationStatus(n, currentStaff);
		let prioStyle = "background:#eef2ef; color:#4a5852;";
		if (n.priority === "至急") prioStyle = "background:#fee2e2; color:#991b1b; font-weight:bold;";
		else if (n.priority === "重要") prioStyle = "background:#fef3c7; color:#92400e; font-weight:bold;";

		const confirmedListStr = (n.confirmed_staff || []).length > 0
			? (n.confirmed_staff || []).join("・")
			: "未確認";

		const card = document.createElement("div");
		card.style.background = stStatus.confirmed ? "#f6f8f6" : "#ffffff";
		card.style.border = stStatus.hasNewUpdate ? "2px solid #f59e0b" : (stStatus.confirmed ? "1px solid #cdd6d0" : "2px solid #1e5b47");
		card.style.borderRadius = "8px";
		card.style.padding = "14px 16px";
		card.style.marginBottom = "12px";
		card.style.boxShadow = stStatus.confirmed ? "none" : "0 2px 8px rgba(37,99,235,0.12)";

		let statusBadgeHtml = "";
		if (stStatus.hasNewUpdate) {
			statusBadgeHtml = `<span class="badge" style="background:#fef3c7; color:#92400e; font-size:12px; padding:3px 10px; font-weight:bold; border:1px solid #fde68a;">☐ 追記あり (要再チェック)</span>`;
		} else if (stStatus.confirmed) {
			statusBadgeHtml = `<span class="badge" style="background:#dcfce7; color:#166534; font-size:12px; padding:3px 10px; font-weight:bold; border:1px solid #86efac;">☑ 見ました (確認済)</span>`;
		} else {
			statusBadgeHtml = `<span class="badge" style="background:#fee2e2; color:#991b1b; font-size:12px; padding:3px 10px; font-weight:bold; border:1px solid #fca5a5;">☐ 未確認 (未チェック)</span>`;
		}

		// 追記（Updates）リストのレンダリング
		let updatesHtml = "";
		if (Array.isArray(n.updates) && n.updates.length > 0) {
			updatesHtml += `<div style="background:#fffbeb; border:1px solid #fef3c7; border-radius:6px; padding:10px 12px; margin:10px 0 6px 0;">`;
			updatesHtml += `<div style="font-weight:bold; font-size:12px; color:#b45309; margin-bottom:4px; display:flex; align-items:center; gap:4px;"> 【追記・変更事項】 (計 ${n.updates.length}件)</div>`;
			n.updates.forEach(u => {
				updatesHtml += `
					<div style="font-size:12.5px; color:#78350f; margin-top:6px; padding-top:6px; border-top:1px dashed #fde68a;">
						<span style="font-weight:bold; color:#92400e;">[${escapeHtml(u.created_at || '')} 追記 by ${escapeHtml(u.staff_name || '職員')}]:</span>
						<div style="white-space:pre-wrap; margin-top:2px;">${escapeHtml(u.content)}</div>
					</div>
				`;
			});
			updatesHtml += `</div>`;
		}

		card.innerHTML = `
			<div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:8px;">
				<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
					<span style="font-size:11px; padding:2px 8px; border-radius:4px; ${prioStyle}">［${escapeHtml(n.priority || '通常')}］</span>
					<strong style="font-size:15px; color:#22302b;">${escapeHtml(n.title)}</strong>
					${statusBadgeHtml}
				</div>
				<div style="display:flex; gap:6px; align-items:center;">
					<span style="font-size:11px; color:#5f6d66;">投稿: ${escapeHtml(n.staff_name || '')} (${escapeHtml(n.created_at || '')})</span>
					<button class="btn btn-secondary" style="padding:3px 8px; font-size:11.5px; color:#1e5b47; border-color:#a9cfbf; background:#f1f6f3;" onclick="openAddMonthlyNoticeUpdateModal(${n.id})">＋ 追記を追加</button>
					<button class="btn btn-secondary" style="padding:3px 6px; font-size:11.5px; color:#dc2626; border-color:#fca5a5;" onclick="deleteMonthlyNotice(${n.id})">削除</button>
				</div>
			</div>
			<div style="font-size:14px; line-height:1.7; color:#36443e; margin:10px 0; white-space:pre-wrap;">${escapeHtml(n.content)}</div>
			${updatesHtml}
			<div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; border-top:1px dashed #cdd6d0; padding-top:10px; margin-top:10px; font-size:12.5px;">
				<div style="color:#4a5852;">
					<strong>☑ 「見ました」確認済職員:</strong> <span style="color:#166534; font-weight:bold;">${escapeHtml(confirmedListStr)}</span>
				</div>
				<div>
					${stStatus.hasNewUpdate ? `
						<button class="btn btn-primary" style="padding:6px 18px; font-size:13px; font-weight:bold; background:#d97706; border-color:#b45309;" onclick="confirmMonthlyNotice(${n.id})">
							☑ 追記も見ました (再チェック)
						</button>
					` : (stStatus.confirmed ? `
						<button class="btn btn-secondary" style="padding:5px 14px; font-size:12.5px; background:#dcfce7; color:#166534; border-color:#86efac; font-weight:bold;" onclick="confirmMonthlyNotice(${n.id})">
							☑ 「見ました」済 (クリックで解除)
						</button>
					` : `
						<button class="btn btn-primary" style="padding:6px 18px; font-size:13px; font-weight:bold; background:#1e5b47; border-color:#1a4f3d;" onclick="confirmMonthlyNotice(${n.id})">
							☑ 見ました
						</button>
					`)}
				</div>
			</div>
		`;
		container.appendChild(card);
	});
}


function openMonthlyNoticeModal() {
 const curMonth = (gState.selectedDate || toLocalDateStr(new Date())).slice(0, 7);
 document.getElementById("noticeMonth").value = curMonth;
 document.getElementById("noticePriority").value = "重要";
 document.getElementById("noticeTitle").value = "";
 document.getElementById("noticeContent").value = "";
 document.getElementById("monthlyNoticeModal").style.display = "flex";
}

function submitMonthlyNotice() {
 const m = document.getElementById("noticeMonth").value;
 const prio = document.getElementById("noticePriority").value;
 const title = document.getElementById("noticeTitle").value.trim();
 const content = document.getElementById("noticeContent").value.trim();
 const staff = document.getElementById("currentStaff").value || "施設長";

 if (!m || !title || !content) {
 alert("対象月、件名、連絡内容は必須入力です。");
 return;
 }

 const now = new Date();
 const nowStr = `${toLocalDateStr(now)} ${now.toTimeString().slice(0, 5)}`;

 if (!Array.isArray(db.data.monthly_notices)) db.data.monthly_notices = [];
 db.data.monthly_notices.unshift({
 id: Date.now(),
 month: m,
 priority: prio,
 title: title,
 content: content,
 staff_name: staff,
 created_at: nowStr,
 confirmed_staff: [staff]
 });

 db.save();
 closeModal("monthlyNoticeModal");
 renderMonthlyNotices();
 checkGlobalAlerts();
 alert(`月間業務連絡「${title}」を登録しました！全職員に1ヶ月間掲示されます。`);
}

function confirmMonthlyNotice(id) {
 const currentStaff = document.getElementById("currentStaff") ? document.getElementById("currentStaff").value : "";
 if (!currentStaff) {
 alert("担当職員を選択してください。");
 return;
 }

 const notice = (db.data.monthly_notices || []).find(n => n.id === id);
 if (!notice) return;
 if (!Array.isArray(notice.confirmed_staff)) notice.confirmed_staff = [];
 if (!notice.confirmed_versions || typeof notice.confirmed_versions !== "object") notice.confirmed_versions = {};

 // [Claude修正] 旧実装は押すたびに確認済み/未確認を切り替えていたため、
 // 追記後に「追記も見ました（再チェック）」を押すと、逆に確認が外れていた。
 // 確認済みの時だけ取り消し、それ以外 (未確認・追記あり) は最新の内容を確認したことにする
 const st = getNoticeConfirmationStatus(notice, currentStaff);
 if (st.confirmed) {
 const idx = notice.confirmed_staff.indexOf(currentStaff);
 if (idx !== -1) notice.confirmed_staff.splice(idx, 1);
 delete notice.confirmed_versions[currentStaff];
 cpLogConfirm(notice, currentStaff, "確認を取消");
 } else {
 if (!notice.confirmed_staff.includes(currentStaff)) notice.confirmed_staff.push(currentStaff);
 cpLogConfirm(notice, currentStaff, "確認");
 notice.confirmed_versions[currentStaff] = notice.last_updated_at || notice.created_at || toLocalDateTimeStr(new Date());
 }

 db.save();
 renderMonthlyNotices();
 checkGlobalAlerts();
}

// [Claude修正] 業務連絡への追記。ボタンと入力画面はあったが、処理 (関数) が作られておらず押しても何も起きなかった。
// 申し送りの追記 (openAddDailyNotebookUpdateModal / submitDailyNotebookUpdate) と同じ仕組みにした
function openAddMonthlyNoticeUpdateModal(id) {
 const n = (db.data.monthly_notices || []).find(x => x.id === id);
 if (!n) return;
 document.getElementById("noticeUpdateParentId").value = id;
 document.getElementById("noticeUpdateTargetTitle").textContent = n.title || "";
 document.getElementById("noticeUpdateContent").value = "";
 openModal("monthlyNoticeUpdateModal");
}

function submitMonthlyNoticeUpdate() {
 const id = Number(document.getElementById("noticeUpdateParentId").value);
 const content = (document.getElementById("noticeUpdateContent").value || "").trim();
 const currentStaff = (document.getElementById("currentStaff") ? document.getElementById("currentStaff").value : "") || "職員";
 if (!content) {
 alert("追記・変更内容を入力してください。");
 return;
 }
 const n = (db.data.monthly_notices || []).find(x => x.id === id);
 if (!n) return;
 if (!Array.isArray(n.updates)) n.updates = [];
 const now = new Date();
 const nowStr = toLocalDateTimeStr(now);
 n.updates.push({ id: Date.now(), staff_name: currentStaff, content: content, created_at: nowStr });
 // 確認済みかどうかの比較に使うため秒まで記録する (分単位だと、同じ分に確認した職員に「追記あり」が出なかった)
 const stamp = nowStr + ":" + String(now.getSeconds()).padStart(2, "0");
 n.last_updated_at = stamp;
 n.last_updated_by = currentStaff;
 // 追記した本人は確認済み。ほかの職員には「追記あり（要再チェック）」と表示される
 if (!Array.isArray(n.confirmed_staff)) n.confirmed_staff = [];
 if (!n.confirmed_staff.includes(currentStaff)) n.confirmed_staff.push(currentStaff);
 if (!n.confirmed_versions || typeof n.confirmed_versions !== "object") n.confirmed_versions = {};
 n.confirmed_versions[currentStaff] = stamp;
 db.save();
 closeModal("monthlyNoticeUpdateModal");
 renderMonthlyNotices();
 if (typeof checkGlobalAlerts === "function") checkGlobalAlerts();
 alert("業務連絡に追記を登録しました。ほかの職員には再確認が表示されます。");
}

function deleteMonthlyNotice(id) {
 // [Claude修正] 業務連絡は消さずに「取消」として残す（理由必須）
 const n = (db.data.monthly_notices || []).find(x => x.id === id);
 if (!cpVoidRecord(n, "この月間業務連絡")) return;
 db.save();
 renderMonthlyNotices();
 checkGlobalAlerts();
}

// 14. 現場クイック消費 (優しい「修正」ボタン付き)
let gPendingConsume = null;

function renderQuickConsume() {
 const r = gState.residents.find(x => x.id === gState.selectedResidentId);
 const nameEl = document.getElementById("consumeResidentName");
 if (nameEl) nameEl.textContent = r ? r.name : "利用者";

 // 利用者切り替えドロップダウンの同期
 const sel = document.getElementById("consumeResidentSelect");
 if (sel) {
 sel.innerHTML = cpCurrentResidents().map(res => `
 <option value="${res.id}" ${res.id === gState.selectedResidentId ? 'selected' : ''}>
 ${res.room_no}号室 ${res.name} 様
 </option>
 `).join("");
 }

 const grid = document.getElementById("quickConsumeGrid");
 if (!grid) return;
 grid.innerHTML = "";

 gState.inventory.forEach(item => {
 const card = document.createElement("div");
 card.style.background = "white";
 card.style.border = "1px solid var(--border-color)";
 card.style.borderRadius = "8px";
 card.style.padding = "12px";
 card.style.display = "flex";
 card.style.flexDirection = "column";
 card.style.justifyContent = "space-between";

 card.innerHTML = `
 <div>
 <div style="font-weight:bold; font-size:14px; color:#22302b;">${item.name}</div>
 <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">
 現在庫: <strong>${item.current_stock}</strong> ${item.unit} | 単価: ¥${(item.unit_price || 0).toLocaleString()}
 ${cpBillingModeFor(gState.selectedResidentId, item).mode === 'personal' ? '<span style="color:#0284c7; font-weight:bold;">[個人請求対象]</span>' : '<span style="color:#16a34a; font-weight:bold;">[施設負担]</span>'}
 </div>
 </div>
 <div style="margin-top:10px;">
 <button class="btn btn-primary" style="width:100%; padding:8px; font-size:13px; font-weight:bold;" onclick="consumeItem(${item.id}, 1)"> 1${item.unit}使用する</button>
 </div>
 `;
 grid.appendChild(card);
 });

 renderRecentConsumeLogs();
}

function onConsumeResidentChange() {
 const sel = document.getElementById("consumeResidentSelect");
 if (!sel) return;
 const newId = parseInt(sel.value, 10);
 if (!isNaN(newId)) {
 gState.selectedResidentId = newId;
 renderResidentsStrip();
	initGlobalTimeSync();
	
 renderResidentDetail();
 updateRecordTargetBanner();
 renderQuickConsume();
 }
}

function consumeItem(itemId, qty) {
 const item = gState.inventory.find(i => i.id === itemId);
 const res = gState.residents.find(r => r.id === gState.selectedResidentId);
 if (!item || !res) return;

  const billInfo = cpBillingModeFor(res.id, item);
  gPendingConsume = { itemId, qty, resId: res.id, billingMode: billInfo.mode, billingBasis: billInfo.basis };

  const billNote = billInfo.mode === "personal"
    ? `<div style="margin-top:8px; font-size:12px; color:#0284c7; background:#f0f9ff; padding:6px 10px; border-radius:4px;">※ 個人購入（${escapeHtml(billInfo.basis)}）として月次請求明細に 1${item.unit} (¥${item.unit_price.toLocaleString()}) 自動計上されます。<br>（預かり金出納帳の残高からは引かれません）</div>`
    : `<div style="margin-top:8px; font-size:12px; color:#15803d; background:#f0fdf4; padding:6px 10px; border-radius:4px;">※ 施設負担備品（${escapeHtml(billInfo.basis)}）として在庫から消費されます。</div>`;

 const msgEl = document.getElementById("confirmConsumeMsg");
 if (msgEl) {
 msgEl.innerHTML = `
 <strong style="font-size:16px; color:#173f33;">${res.room_no}号室 ${res.name} 様</strong> に<br>
 【<strong>${item.name}</strong>】 を <strong>${qty} ${item.unit}</strong> 使用します。<br><br>
 対象者と物品はお間違いないですか？
 ${billNote}
 `;
 document.getElementById("confirmConsumeModal").style.display = "flex";
 } else {
 // モーダルがない場合のフォールバック
 if (confirm(`${res.name}様に「${item.name}」を${qty}${item.unit}使用します。よろしいですか？`)) {
 executeConsume();
 }
 }
}

function executeConsume() {
 if (!gPendingConsume) return;
 const { itemId, qty, resId } = gPendingConsume;
 const item = gState.inventory.find(i => i.id === itemId);
 const res = gState.residents.find(r => r.id === resId);
 const staff = document.getElementById("currentStaff").value;
 const now = new Date();
 const nowStr = `${toLocalDateStr(now)} ${now.toTimeString().slice(0, 5)}`;

 if (item) {
 item.current_stock -= qty;

    const billInfo = (gPendingConsume && gPendingConsume.billingMode)
      ? { mode: gPendingConsume.billingMode, basis: gPendingConsume.billingBasis }
      : cpBillingModeFor(resId, item);
    const isPersonal = billInfo.mode === "personal";
    var cpConsId = null;

    if (isPersonal) {
      cpConsId = Date.now();
      db.data.consumptions.unshift({
        id: cpConsId,
        consumed_at: nowStr,
        resident_id: resId,
        item_id: item.id,
        item_name: item.name,
        quantity: qty,
        unit_price: item.unit_price,
        subtotal: item.unit_price * qty,
        staff_name: staff,
        billing_basis: billInfo.basis
      });
    }

    const logId = Date.now() + 1;
    db.data.inventory_logs.unshift({
      id: logId,
      timestamp: nowStr,
      item_id: item.id,
      item_name: item.name,
      action_type: "消費",
      change_qty: -qty,
      after_qty: item.current_stock,
      resident_id: resId,
      resident_name: res ? res.name : "",
      staff_name: staff,
      reason: "現場ケア時使用",
      consumption_id: (isPersonal && cpConsId) ? cpConsId : null
 });

 db.save();
 renderQuickConsume();
 checkGlobalAlerts();
 closeModal("confirmConsumeModal");
 alert(`${res ? res.name : ''}様に ${item.name} を ${qty}${item.unit} 消費記録しました！`);
 }
 gPendingConsume = null;
}

function renderRecentConsumeLogs() {
 const container = document.getElementById("recentConsumeList");
 container.innerHTML = "";
 const logs = (db.data.inventory_logs || []).filter(l => l.action_type === "消費").slice(0, 5);

 if (logs.length === 0) {
 container.innerHTML = '<span style="font-size:13px; color:var(--text-muted);">直近の消費履歴はありません。</span>';
 return;
 }

 logs.forEach(l => {
 const row = document.createElement("div");
 row.style.display = "flex";
 row.style.justifyContent = "space-between";
 row.style.alignItems = "center";
 row.style.padding = "6px 10px";
 row.style.background = "#f6f8f6";
 row.style.border = "1px solid #dfe5e1";
 row.style.borderRadius = "6px";
 row.style.marginBottom = "6px";
 row.style.fontSize = "13px";

 const rawTime = l.timestamp || l.log_time || "";
 const timeDisplay = rawTime.length >= 16 ? rawTime.slice(11, 16) : rawTime;

 row.innerHTML = `
 <div>
 <span> ${timeDisplay} <strong>${l.resident_name || ''} 様</strong>: ${l.item_name} (${Math.abs(l.change_qty)})</span>
 <span style="color:var(--text-muted); margin-left:8px;">担当: ${l.staff_name || '未設定'}</span>
 </div>
 <div>
 <button class="btn btn-secondary" style="padding:3px 8px; font-size:12px;" onclick="rollbackConsume(${l.id})">［ 修正 ］</button>
 </div>
 `;
 container.appendChild(row);
 });
}

function rollbackConsume(logId) {
 if (!confirm("直前の消費入力を取り消して、在庫と請求を元に戻しますか？")) return;
 const log = (db.data.inventory_logs || []).find(x => x.id === logId);
 const staff = document.getElementById("currentStaff").value;
 const now = new Date();
 const nowStr = `${toLocalDateStr(now)} ${now.toTimeString().slice(0, 5)}`;

 if (log && log.action_type === "消費") {
 const item = gState.inventory.find(i => i.id === log.item_id);
 const addQty = Math.abs(log.change_qty);
 if (item) item.current_stock += addQty;

 // 請求から削除
 // [Claude修正] 請求の行は消さずに「取消」にする。以前は同じ利用者・品目の別の行を消すことがあった
 const cons = (db.data.consumptions || []).find(c => !c.voided && (log.consumption_id ? Number(c.id) === Number(log.consumption_id) : (c.resident_id === log.resident_id && c.item_id === log.item_id)));
 if (cons) { cons.voided = true; cons.voided_at = nowStr; cons.voided_by = staff; cons.void_reason = "消費入力の取消"; }

 db.data.inventory_logs.unshift({
 id: Date.now(),
 timestamp: nowStr,
 item_id: log.item_id,
 item_name: log.item_name,
 action_type: "修正取消",
 change_qty: addQty,
 after_qty: item ? item.current_stock : 0,
 resident_id: log.resident_id,
 resident_name: log.resident_name,
 staff_name: staff,
 reason: "押し直し修正"
 });

 db.save();
 renderQuickConsume();
 checkGlobalAlerts();
 alert("入力を修正・取消しました！");
 }
}

// -------------------------------------------------------------
// 【事務所ポータル】
// -------------------------------------------------------------
function loadOfficeData() {
 renderOfficeInventory();
 renderOfficeEmergencySupplies();
 renderOfficeOrders();
 renderOfficeSuppliers();
 renderOfficeBillingSelect();
 renderOfficeDepositTable();
 renderShiftTable(gState.currentShiftMonth || toLocalDateStr(new Date()).slice(0, 7)); // [Claude修正] 開いたときは今月（以前は 2026-10 固定）
 renderOfficeVehicleLogs();
 renderOfficeFireDrills();
 renderOfficeCommittees();
 renderOfficeComplaints();
 renderOfficeIncidents();
 renderCareExpiryNotes();
	renderOfficeVaccines();
}

function switchOfficeTab(tab) {
 if (tab === "backup" || tab === "staff_auth" || tab === "units") {
 if (!isCurrentStaffAdminOrClerk()) {
 alert("このタブは管理者および事務員のみアクセス可能です。");
 switchOfficeTab("inventory");
 return;
 }
 }

 gState.activeOfficeTab = tab;
 if (typeof cpNavRecord === "function") cpNavRecord(); // [Claude修正 2026-10-16] 戻るボタン用の履歴
 const tabs = document.querySelectorAll("#portalOfficeSection .sub-tab-btn");
 tabs.forEach(btn => {
 btn.classList.remove("active");
 const oc = btn.getAttribute("onclick") || "";
 if (oc.includes(`'${tab}'`) || oc.includes(`"${tab}"`)) {
 btn.classList.add("active");
 }
 });

 const tabMap = {
 inventory: "tabOfficeInventory", emergency: "tabOfficeEmergency", orders: "tabOfficeOrders",
 suppliers: "tabOfficeSuppliers", billing: "tabOfficeBilling", deposit: "tabOfficeDeposit",
 shift: "tabOfficeShift", vehicle: "tabOfficeVehicle", vaccine: "tabOfficeVaccine",
 fire: "tabOfficeFire", committee: "tabOfficeCommittee", complaint: "tabOfficeComplaint",
 care_renewal: "tabOfficeCareRenewal",
 backup: "tabOfficeBackup", staff_auth: "tabOfficeStaffAuth", units: "tabOfficeUnits",
 contracts: "tabOfficeContracts"
 };

 Object.values(tabMap).forEach(id => {
 const el = document.getElementById(id);
 if (el) el.style.display = "none";
 });
 const target = document.getElementById(tabMap[tab]);
 if (target) {
 target.style.display = "block";
 if (tab === "shift") {
 renderShiftTable(gState.currentShiftMonth || toLocalDateStr(new Date()).slice(0, 7)); // [Claude修正] 開いたときは今月（以前は 2026-10 固定）
 } else if (tab === "backup") {
 renderOfficeBackup();
 } else if (tab === "care_renewal") {
  renderOfficeCareRenewal();
  } else if (tab === "staff_auth") {
 renderOfficeStaffAuth();
 } else if (tab === "units") {
 renderOfficeUnits();
 } else if (tab === "contracts") {
 renderOfficeContracts();
 } else if (tab === "billing") {
 renderOfficeBillingSelect(); // [Claude修正] 請求の設定を変えたあとに開いても、古い表示のままにならないように
 }
 }
}

// 在庫一覧 ＆ 棚卸し実数合わせ
// ==========================================
// [Antigravity追加] 物品の請求設定（施設形態・区分・品物・利用者別）
// ==========================================
function cpGetBillingSettings() {
  const def = {
    facility_type: "gh",
    personal_enabled: true,
    personal_categories: ["オムツ・パッド", "衛生用品", "食事関連"]
  };
  const s = db.data.billing_settings;
  if (!s || typeof s !== "object") return def;
  return {
    facility_type: s.facility_type || def.facility_type,
    personal_enabled: (s.personal_enabled !== undefined) ? !!s.personal_enabled : def.personal_enabled,
    personal_categories: Array.isArray(s.personal_categories) ? s.personal_categories.slice() : def.personal_categories.slice()
  };
}

function cpSaveBillingSettings(newSettings, logDetail) {
  if (!isCurrentStaffAdminOrClerk()) {
    alert("請求設定の変更は、管理者・事務員のみ可能です。");
    return false;
  }
  const oldSettings = cpGetBillingSettings();
  db.data.billing_settings = {
    facility_type: newSettings.facility_type || oldSettings.facility_type,
    personal_enabled: (newSettings.personal_enabled !== undefined) ? !!newSettings.personal_enabled : oldSettings.personal_enabled,
    personal_categories: Array.isArray(newSettings.personal_categories) ? newSettings.personal_categories.slice() : oldSettings.personal_categories.slice()
  };
  if (!Array.isArray(db.data.settings_logs)) db.data.settings_logs = [];
  db.data.settings_logs.push({
    id: Date.now() + Math.floor(Math.random() * 1000),
    at: toLocalDateTimeStr(new Date()),
    by: cpLoginStaffName(),
    kind: "請求の設定",
    action: "変更",
    detail: logDetail || "請求設定を更新"
  });
  db.save();
  return true;
}

function cpBillingModeFor(resId, item) {
  if (!item) return { mode: "facility", basis: "品物の設定" };
  const settings = cpGetBillingSettings();
  // 1. personal_enabled が false なら、施設負担
  if (!settings.personal_enabled) {
    return { mode: "facility", basis: "施設の設定" };
  }
  // 2. 品物の区分が personal_categories に入っていなければ、施設負担（掃除用品・消毒などは、いつも施設負担）
  const cat = item.category || "";
  if (!settings.personal_categories.includes(cat)) {
    return { mode: "facility", basis: "区分" };
  }
  // 3. その利用者・品物の取消されていない例外があれば、それに従う
  if (resId !== undefined && resId !== null && resId !== "") {
    const overrides = Array.isArray(db.data.billing_overrides) ? db.data.billing_overrides : [];
    const ov = overrides.find(o => !o.voided && Number(o.resident_id) === Number(resId) && Number(o.item_id) === Number(item.id));
    if (ov && (ov.mode === "personal" || ov.mode === "facility")) {
      return { mode: ov.mode, basis: "利用者ごとの設定" };
    }
  }
  // 4. なければ、品物の is_personal_billable に従う
  if (item.is_personal_billable) {
    return { mode: "personal", basis: "品物の設定" };
  }
  return { mode: "facility", basis: "品物の設定" };
}

function renderOfficeBillingSettings() {
  const container = document.getElementById("officeBillingSettingsContainer");
  if (!container) return;
  const canEdit = isCurrentStaffAdminOrClerk();
  const settings = cpGetBillingSettings();

  // 1. 施設形態ラベル
  const typeLabels = {
    "public": "特養・老健など",
    "gh": "グループホーム・有料老人ホーム",
    "day": "デイサービス・デイケア"
  };

  // 2. 区分一覧
  const allCategories = [];
  (gState.inventory || []).forEach(i => {
    if (i.category && !allCategories.includes(i.category)) allCategories.push(i.category);
  });
  ["オムツ・パッド", "衛生用品", "食事関連", "消毒"].forEach(c => {
    if (!allCategories.includes(c)) allCategories.push(c);
  });

  const catRows = allCategories.map(cat => {
    const isPersonalCat = settings.personal_categories.includes(cat);
    return `
      <tr>
        <td style="font-weight:bold;">${escapeHtml(cat)}</td>
        <td>
          ${isPersonalCat
            ? '<span style="color:#0284c7; font-weight:bold;">利用者に関わる用品（個人請求にできる）</span>'
            : '<span style="color:#16a34a; font-weight:bold;">施設の備品（いつも施設負担）</span>'}
        </td>
        <td style="text-align:right;">
          ${canEdit
            ? `<button type="button" class="btn btn-secondary" style="padding:3px 10px; font-size:12px;" onclick="cpToggleCategoryBilling('${escapeHtml(cat)}')">${isPersonalCat ? '施設の備品に変更' : '利用者用品に変更'}</button>`
            : '<span style="font-size:12px; color:#5f6d66;">-</span>'}
        </td>
      </tr>
    `;
  }).join("");

  // 3. 個人請求にできる区分の品物一覧
  const targetItems = (gState.inventory || []).filter(i => settings.personal_categories.includes(i.category));
  const itemRows = targetItems.map(item => {
    const isPersonal = !!item.is_personal_billable;
    return `
      <tr>
        <td style="font-weight:bold;">${escapeHtml(item.name)}</td>
        <td>${escapeHtml(item.category || "-")}</td>
        <td>
          ${isPersonal
            ? '<span style="color:#0284c7; font-weight:bold;">個人請求</span>'
            : '<span style="color:#16a34a; font-weight:bold;">施設負担</span>'}
        </td>
        <td style="text-align:right;">
          ${canEdit
            ? `<button type="button" class="btn btn-secondary" style="padding:3px 10px; font-size:12px;" onclick="cpToggleItemBilling(${item.id})">${isPersonal ? '施設負担に変更' : '個人請求に変更'}</button>`
            : '<span style="font-size:12px; color:#5f6d66;">-</span>'}
        </td>
      </tr>
    `;
  }).join("");

  // 4. 利用者ごとの例外一覧
  const activeOverrides = (db.data.billing_overrides || []).filter(o => !o.voided);
  const overrideRows = activeOverrides.map(o => {
    const res = (gState.residents || []).find(r => Number(r.id) === Number(o.resident_id));
    const item = (gState.inventory || []).find(i => Number(i.id) === Number(o.item_id));
    const isPersonal = o.mode === "personal";
    return `
      <tr>
        <td>${res ? `${escapeHtml(res.room_no)}号室 ${escapeHtml(res.name)} 様` : `ID:${o.resident_id}`}</td>
        <td>${item ? escapeHtml(item.name) : `ID:${o.item_id}`}</td>
        <td>
          ${isPersonal
            ? '<span style="color:#0284c7; font-weight:bold;">この方は個人請求</span>'
            : '<span style="color:#16a34a; font-weight:bold;">この方は施設負担</span>'}
        </td>
        <td style="font-size:12px; color:#5f6d66;">${escapeHtml(o.set_by || "-")} (${escapeHtml(String(o.set_at || "").slice(0, 16))})</td>
        <td style="text-align:right;">
          ${canEdit
            ? `<button type="button" class="btn btn-secondary" style="padding:2px 8px; font-size:12px; color:#991b1b;" onclick="cpVoidBillingOverride(${o.id})">取消</button>`
            : '<span style="font-size:12px; color:#5f6d66;">-</span>'}
        </td>
      </tr>
    `;
  }).join("");

  const resOptions = (gState.residents || []).slice()
    .sort((a, b) => String(a.room_no).localeCompare(String(b.room_no), "ja", { numeric: true }))
    .map(r => `<option value="${r.id}">${escapeHtml(r.room_no)}号室 ${escapeHtml(r.name)} 様</option>`).join("");
  // [Claude修正] 例外を選べるのは「利用者に関わる用品」の区分の品物だけ（施設の備品の区分は判定で必ず施設負担になり、例外を付けても効かないため）
  const itemOptions = (gState.inventory || []).filter(i => settings.personal_categories.includes(i.category)).map(i => `<option value="${i.id}">${escapeHtml(i.name)} (${escapeHtml(i.category || "")})</option>`).join("");

  container.innerHTML = `
    <details class="billing-settings-card" open style="background:#ffffff; border:1px solid #dfe5e1; border-radius:8px; padding:14px 16px; margin-bottom:18px;">
      <summary style="cursor:pointer; font-size:15px; font-weight:bold; color:#173f33; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
        <span>請求の設定（施設・区分・品物・利用者別）</span>
        <span style="font-size:12px; font-weight:normal; color:${canEdit ? '#15803d' : '#854d0e'}; background:${canEdit ? '#f0fdf4' : '#fefce8'}; padding:2px 8px; border-radius:4px; border:1px solid ${canEdit ? '#bbf7d0' : '#fef08a'};">
          ${canEdit ? '管理者・事務員：変更可能' : '登録・変更は管理者・事務員のみ'}
        </span>
      </summary>

      <div style="margin-top:14px; border-top:1px solid #edf1ee; padding-top:12px;">
        <!-- 1. 施設形態 & 個人請求の利用 -->
        <div style="background:#f8faf9; padding:12px 14px; border-radius:6px; border:1px solid #e2e8e4; margin-bottom:16px;">
          <div style="display:flex; flex-wrap:wrap; gap:20px; align-items:center;">
            <div>
              <label style="font-weight:bold; font-size:13px; color:#22302b; margin-right:8px;">施設の形態:</label>
              <select id="billingFacilityTypeSelect" class="form-control" style="width:auto; display:inline-block; font-size:13px;" ${canEdit ? '' : 'disabled'} onchange="cpOnChangeFacilityType(this.value)">
                <option value="gh" ${settings.facility_type === "gh" ? "selected" : ""}>グループホーム・有料老人ホーム</option>
                <option value="public" ${settings.facility_type === "public" ? "selected" : ""}>特養・老健など</option>
                <option value="day" ${settings.facility_type === "day" ? "selected" : ""}>デイサービス・デイケア</option>
              </select>
            </div>
            <div>
              <label style="display:inline-flex; align-items:center; gap:6px; font-size:13px; font-weight:bold; cursor:pointer;">
                <input type="checkbox" id="billingPersonalEnabledCheck" ${settings.personal_enabled ? 'checked' : ''} ${canEdit ? '' : 'disabled'} onchange="cpOnChangePersonalEnabled(this.checked)">
                利用者の個人請求を使う
              </label>
            </div>
          </div>
          <p style="margin:6px 0 0; font-size:12px; color:#5f6d66;">
            ※「利用者の個人請求を使う」がオフの場合、施設全体ですべての品物が施設負担となります。形態を変更すると、その形態の初期値を入れてよいか確認してから反映します。
          </p>
        </div>

        <!-- 2. 区分ごとの設定 -->
        <div style="margin-bottom:16px;">
          <h4 style="font-size:14px; margin:0 0 8px; color:#22302b;">① 在庫区分ごとの請求設定</h4>
          <table class="data-table" style="font-size:13px;">
            <thead>
              <tr><th style="width:180px;">区分名</th><th>設定</th><th style="width:160px; text-align:right;">操作</th></tr>
            </thead>
            <tbody>
              ${catRows}
            </tbody>
          </table>
        </div>

        <!-- 3. 品物ごとの初期値設定 -->
        <div style="margin-bottom:16px;">
          <h4 style="font-size:14px; margin:0 0 8px; color:#22302b;">② 品物ごとの初期値設定（個人請求にできる区分のみ）</h4>
          ${itemRows ? `
            <table class="data-table" style="font-size:13px;">
              <thead>
                <tr><th style="width:200px;">品名</th><th style="width:140px;">区分</th><th>施設としての扱い</th><th style="width:160px; text-align:right;">操作</th></tr>
              </thead>
              <tbody>
                ${itemRows}
              </tbody>
            </table>
          ` : '<p style="font-size:13px; color:#5f6d66; margin:4px 0;">個人請求対象の区分に設定された品物はありません。</p>'}
        </div>

        <!-- 4. 利用者ごとの例外設定 -->
        <div>
          <h4 style="font-size:14px; margin:0 0 8px; color:#22302b;">③ 利用者ごとの例外設定</h4>
          <table class="data-table" style="font-size:13px; margin-bottom:10px;">
            <thead>
              <tr><th>利用者</th><th>品名</th><th>この方の設定</th><th>登録者 (日時)</th><th style="width:80px; text-align:right;">操作</th></tr>
            </thead>
            <tbody>
              ${overrideRows || '<tr><td colspan="5" style="text-align:center; color:#5f6d66; padding:10px;">登録されている個別例外設定はありません。</td></tr>'}
            </tbody>
          </table>

          ${canEdit ? `
            <div style="background:#f4f6f4; border:1px solid #dfe5e1; border-radius:6px; padding:10px 14px; display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
              <span style="font-size:13px; font-weight:bold; color:#173f33;">例外の追加:</span>
              <select id="billingOverrideResidentSelect" class="form-control" style="width:auto; font-size:12px;">
                <option value="">利用者を選択...</option>
                ${resOptions}
              </select>
              <select id="billingOverrideItemSelect" class="form-control" style="width:auto; font-size:12px;">
                <option value="">品物を選択...</option>
                ${itemOptions}
              </select>
              <select id="billingOverrideModeSelect" class="form-control" style="width:auto; font-size:12px;">
                <option value="personal">この方は個人請求</option>
                <option value="facility">この方は施設負担</option>
              </select>
              <button type="button" class="btn btn-primary" style="padding:4px 12px; font-size:12px;" onclick="cpSubmitBillingOverride()">例外設定を保存</button>
            </div>
          ` : '<p style="font-size:12px; color:#5f6d66; margin:4px 0;">※利用者ごとの例外の追加・取消は管理者・事務員が行います。</p>'}
        </div>
      </div>
    </details>
  `;
}

function cpOnChangeFacilityType(newType) {
  if (!isCurrentStaffAdminOrClerk()) {
    alert("請求設定の変更は、管理者・事務員のみ可能です。");
    renderOfficeBillingSettings();
    return;
  }
  const typeLabels = {
    "public": "特養・老健など",
    "gh": "グループホーム・有料老人ホーム",
    "day": "デイサービス・デイケア"
  };
  const typeName = typeLabels[newType] || newType;
  if (!confirm(`施設の形態を「${typeName}」に変更しますか？\n\nOKを押すと、その形態の推奨初期値が反映されます。\n・特養・老健など：個人請求を使わない（施設負担）\n・グループホーム・有料老人ホーム：個人請求を使う（オムツ・パッド／衛生用品／食事関連）\n・デイサービス・デイケア：個人請求を使う（オムツ・パッド／衛生用品／食事関連）\n※勝手な上書きを防ぐため、確認しています。`)) {
    renderOfficeBillingSettings();
    return;
  }
  const oldSettings = cpGetBillingSettings();
  let enabled = oldSettings.personal_enabled;
  let cats = oldSettings.personal_categories;
  if (newType === "public") {
    enabled = false;
  } else if (newType === "gh" || newType === "day") {
    enabled = true;
    cats = ["オムツ・パッド", "衛生用品", "食事関連"];
  }
  const oldLabel = typeLabels[oldSettings.facility_type] || oldSettings.facility_type;
  cpSaveBillingSettings({
    facility_type: newType,
    personal_enabled: enabled,
    personal_categories: cats
  }, `施設形態を「${oldLabel}」から「${typeName}」に変更（推奨初期値を反映）`);
  renderOfficeInventory();
  renderQuickConsume();
}

function cpOnChangePersonalEnabled(checked) {
  if (!isCurrentStaffAdminOrClerk()) {
    alert("請求設定の変更は、管理者・事務員のみ可能です。");
    renderOfficeBillingSettings();
    return;
  }
  const actionText = checked ? "「利用者の個人請求を使う」を有効" : "「利用者の個人請求を使う」を無効（すべての物品を施設負担）";
  if (!confirm(`${actionText}に変更しますか？`)) {
    renderOfficeBillingSettings();
    return;
  }
  const oldSettings = cpGetBillingSettings();
  cpSaveBillingSettings({
    personal_enabled: checked
  }, `利用者の個人請求を「${oldSettings.personal_enabled ? "有効" : "無効"}」から「${checked ? "有効" : "無効"}」に変更`);
  renderOfficeInventory();
  renderQuickConsume();
}

function cpToggleCategoryBilling(catName) {
  if (!isCurrentStaffAdminOrClerk()) {
    alert("請求設定の変更は、管理者・事務員のみ可能です。");
    return;
  }
  const settings = cpGetBillingSettings();
  const inList = settings.personal_categories.includes(catName);
  const nextInList = !inList;
  const targetLabel = nextInList ? "利用者に関わる用品（個人請求にできる）" : "施設の備品（いつも施設負担）";
  if (!confirm(`区分「${catName}」の扱いを【${targetLabel}】に変更しますか？`)) return;

  let newCats = settings.personal_categories.slice();
  if (nextInList) {
    if (!newCats.includes(catName)) newCats.push(catName);
  } else {
    newCats = newCats.filter(c => c !== catName);
  }
  cpSaveBillingSettings({
    personal_categories: newCats
  }, `区分「${catName}」を「${inList ? "利用者用品" : "施設備品"}」から「${nextInList ? "利用者用品" : "施設備品"}」に変更`);
  renderOfficeInventory();
  renderQuickConsume();
}

function cpToggleItemBilling(itemId) {
  if (!isCurrentStaffAdminOrClerk()) {
    alert("請求設定の変更は、管理者・事務員のみ可能です。");
    return;
  }
  const item = (gState.inventory || []).find(i => Number(i.id) === Number(itemId));
  if (!item) return;
  const oldVal = !!item.is_personal_billable;
  const newVal = !oldVal;
  const label = newVal ? "個人請求" : "施設負担";
  if (!confirm(`品物「${item.name}」の施設としての基本設定を【${label}】に変更しますか？`)) return;

  item.is_personal_billable = newVal ? 1 : 0;
  const dbItem = (db.data.inventory || []).find(i => Number(i.id) === Number(itemId));
  if (dbItem) dbItem.is_personal_billable = newVal ? 1 : 0;

  if (!Array.isArray(db.data.settings_logs)) db.data.settings_logs = [];
  db.data.settings_logs.push({
    id: Date.now() + Math.floor(Math.random() * 1000),
    at: toLocalDateTimeStr(new Date()),
    by: cpLoginStaffName(),
    kind: "請求の設定",
    action: "変更",
    detail: `品物「${item.name}」の基本設定を「${oldVal ? "個人請求" : "施設負担"}」から「${label}」に変更`
  });
  db.save();
  renderOfficeInventory();
  renderQuickConsume();
}

function cpSubmitBillingOverride() {
  if (!isCurrentStaffAdminOrClerk()) {
    alert("請求設定の変更は、管理者・事務員のみ可能です。");
    return;
  }
  const resSel = document.getElementById("billingOverrideResidentSelect");
  const itemSel = document.getElementById("billingOverrideItemSelect");
  const modeSel = document.getElementById("billingOverrideModeSelect");
  if (!resSel || !itemSel || !modeSel) return;
  const resId = resSel.value;
  const itemId = itemSel.value;
  const mode = modeSel.value;
  if (!resId || !itemId || !mode) {
    alert("利用者、品物、設定内容をすべて選択してください。");
    return;
  }
  const res = (gState.residents || []).find(r => Number(r.id) === Number(resId));
  const item = (gState.inventory || []).find(i => Number(i.id) === Number(itemId));
  if (!res || !item) return;
  if (!cpGetBillingSettings().personal_categories.includes(item.category)) {
    alert(`「${item.name}」の区分（${item.category || "なし"}）は施設の備品の扱いなので、利用者ごとの例外は付けられません。`);
    return;
  }

  if (!Array.isArray(db.data.billing_overrides)) db.data.billing_overrides = [];
  const existing = db.data.billing_overrides.find(o => !o.voided && Number(o.resident_id) === Number(resId) && Number(o.item_id) === Number(itemId));
  const now = toLocalDateTimeStr(new Date());
  const who = cpLoginStaffName();
  const modeLabel = mode === "personal" ? "個人請求" : "施設負担";

  if (existing) {
    if (existing.mode === mode) {
      alert("既に同じ例外設定が登録されています。");
      return;
    }
    const currentLabel = existing.mode === "personal" ? "個人請求" : "施設負担";
    if (!confirm(`${res.name} 様の「${item.name}」は現在「${currentLabel}」に設定されています。\n「${modeLabel}」に変更しますか？`)) return;
    const old = JSON.parse(JSON.stringify(existing));
    existing.mode = mode;
    existing.set_by = who;
    existing.set_at = now;
    cpAppendEditHistory(existing, old, ["resident_id", "item_id", "mode"]);
    if (!Array.isArray(db.data.settings_logs)) db.data.settings_logs = [];
    db.data.settings_logs.push({
      id: Date.now() + Math.floor(Math.random() * 1000),
      at: now,
      by: who,
      kind: "請求の設定",
      action: "訂正・変更",
      detail: `利用者例外設定の変更（${res.name} 様 / ${item.name} → ${modeLabel}）`
    });
  } else {
    const newOv = {
      id: Date.now(),
      resident_id: Number(resId),
      item_id: Number(itemId),
      mode: mode,
      set_by: who,
      set_at: now,
      edit_history: []
    };
    db.data.billing_overrides.push(newOv);
    if (!Array.isArray(db.data.settings_logs)) db.data.settings_logs = [];
    db.data.settings_logs.push({
      id: Date.now() + Math.floor(Math.random() * 1000),
      at: now,
      by: who,
      kind: "請求の設定",
      action: "登録",
      detail: `利用者例外設定の追加（${res.name} 様 / ${item.name} → ${modeLabel}）`
    });
  }
  db.save();
  renderOfficeInventory();
  renderQuickConsume();
  alert(`${res.name} 様の「${item.name}」を「${modeLabel}」として保存しました。`);
}

function cpVoidBillingOverride(id) {
  if (!isCurrentStaffAdminOrClerk()) {
    alert("請求設定の変更は、管理者・事務員のみ可能です。");
    return;
  }
  if (!Array.isArray(db.data.billing_overrides)) return;
  const target = db.data.billing_overrides.find(o => Number(o.id) === Number(id));
  if (!target || target.voided) return;
  const res = (gState.residents || []).find(r => Number(r.id) === Number(target.resident_id));
  const item = (gState.inventory || []).find(i => Number(i.id) === Number(target.item_id));

  const reason = prompt(`利用者「${res ? res.name : ''} 様」の「${item ? item.name : ''}」の例外設定を取り消します。\n取消の理由を入力してください（必須）：\n※取消後も履歴は監査用に残ります。`, "");
  if (reason === null) return;
  if (!reason.trim()) {
    alert("取消の理由を入力してください。取消は行われませんでした。");
    return;
  }
  const now = toLocalDateTimeStr(new Date());
  const who = cpLoginStaffName();
  target.voided = true;
  target.voided_at = now;
  target.voided_by = who;
  target.void_reason = reason.trim();

  if (!Array.isArray(db.data.settings_logs)) db.data.settings_logs = [];
  db.data.settings_logs.push({
    id: Date.now() + Math.floor(Math.random() * 1000),
    at: now,
    by: who,
    kind: "請求の設定",
    action: "取消",
    detail: `利用者例外設定の取消（${res ? res.name : ''} 様 / ${item ? item.name : ''} / 理由: ${reason.trim()}）`
  });
  db.save();
  renderOfficeInventory();
  renderQuickConsume();
  alert("例外設定を取り消しました。");
}


function renderOfficeInventory() {
  renderOfficeBillingSettings();
 const tbody = document.querySelector("#officeInventoryTable tbody");
 if (!tbody) return;
 tbody.innerHTML = "";

 gState.inventory.forEach(i => {
   const tr = document.createElement("tr");
   const alertThreshold = (i.alert_threshold !== undefined && i.alert_threshold !== null && !isNaN(i.alert_threshold)) ? Number(i.alert_threshold) : i.safety_stock;
   const isLow = i.current_stock <= alertThreshold;
   if (isLow) tr.style.backgroundColor = "#fee2e2";

   tr.innerHTML = `
     <td><strong>${i.name}</strong></td>
     <td>${cpBillingModeFor(null, i).mode === "personal" ? '<span style="color:#0284c7; font-weight:bold;">個人対象</span>' : '<span style="color:#16a34a; font-weight:bold;">施設負担</span>'}</td>
     <td><strong style="font-size:16px; ${isLow?'color:#dc2626;':''}">${i.current_stock}</strong> ${i.unit}</td>
     <td>
       <div style="display:inline-flex; align-items:center; gap:4px;">
         <input type="number" class="form-control" style="width:70px; font-size:12px; padding:2px 6px;" value="${alertThreshold}" min="0" onchange="updateItemAlertThreshold(${i.id}, this.value)" title="在庫がこの数を下回るとアラートが出ます">
         <span style="font-size:12px; color:#5f6d66;">${i.unit}</span>
       </div>
     </td>
     <td>¥${Number(i.unit_price || 0).toLocaleString()}</td>
     <td>${isLow ? '<span style="color:#dc2626; font-weight:bold;"> 要補充</span>' : '<span style="color:#16a34a;">適正</span>'}</td>
     <td>${i.supplier_name || '-'}</td>
     <td style="display:flex; gap:6px;">
       <button class="btn btn-secondary" style="padding:4px 8px; font-size:12px;" onclick="openOrderModalWithItem(${i.id})">発注起案</button>
       <button class="btn btn-secondary" style="padding:4px 8px; font-size:12px;" onclick="openInventoryAdjustModal(${i.id}, '${i.name}', ${i.current_stock})">棚卸</button>
     </td>
   `;
   tbody.appendChild(tr);
 });

 const logTbody = document.querySelector("#inventoryLogsTable tbody");
 if (logTbody) {
   logTbody.innerHTML = "";
   (db.data.inventory_logs || []).slice(0, 30).forEach(l => {
     const tr = document.createElement("tr");
     tr.innerHTML = `
       <td>${l.timestamp}</td>
       <td><strong>${l.item_name}</strong></td>
       <td><span class="badge" style="${l.action_type==='出庫'?'background:#fee2e2;color:#991b1b;':'background:#dcfce7;color:#166534;'}">${l.action_type}</span></td>
       <td>${l.change_qty > 0 ? '+' : ''}${l.change_qty}</td>
       <td><strong>${l.after_qty}</strong></td>
       <td>${l.resident_name ? l.resident_name + ' 様' : '-'}</td>
       <td><strong>${l.staff_name}</strong></td>
       <td>${l.reason || '-'}</td>
     `;
     logTbody.appendChild(tr);
   });
 }
}

function updateItemAlertThreshold(itemId, newVal) {
 const item = (gState.inventory || []).find(i => i.id === itemId);
 if (!item) return;
 const val = parseInt(newVal, 10);
 if (isNaN(val) || val < 0) {
   alert("有効な数値を入力してください。");
   renderOfficeInventory();
   return;
 }
 item.alert_threshold = val;
 db.save();
 checkGlobalAlerts();
 renderOfficeInventory();
}

function openInventoryAdjustModal(itemId, itemName, currentStock) {
 document.getElementById("invAdjustItemId").value = itemId;
 document.getElementById("invAdjustItemName").value = itemName;
 document.getElementById("invAdjustCurrent").value = currentStock;
 document.getElementById("invAdjustActual").value = currentStock;
 document.getElementById("inventoryAdjustModal").style.display = "flex";
}

function submitInventoryAdjust() {
 const itemId = parseInt(document.getElementById("invAdjustItemId").value);
 const actualStr = document.getElementById("invAdjustActual").value;
 const actual = parseInt(actualStr, 10);
 if (isNaN(actual) || actual < 0) {
 alert("実際の倉庫在庫数（0以上の数値）を入力してください。");
 return;
 }
 const reason = document.getElementById("invAdjustReason").value || "実数合わせ";
 const staff = document.getElementById("currentStaff").value;
 const item = gState.inventory.find(i => i.id === itemId);
 const now = new Date();
 const nowStr = `${toLocalDateStr(now)} ${now.toTimeString().slice(0, 5)}`;

 if (item) {
 const diff = actual - item.current_stock;
 item.current_stock = actual;

 db.data.inventory_logs.unshift({
 id: Date.now(), timestamp: nowStr, item_id: item.id, item_name: item.name,
 action_type: "棚卸し修正", change_qty: diff, after_qty: actual, staff_name: staff, reason: reason
 });

 db.save();
 closeModal("inventoryAdjustModal");
 loadOfficeData();
 checkGlobalAlerts();
 alert("棚卸し実在庫数に合わせました！");
 }
}

// 非常食・防災備蓄
function renderOfficeEmergencySupplies() {
	const tbody = document.querySelector("#emergencyTable tbody");
	if (!tbody) return;
	tbody.innerHTML = "";
	const today = new Date();
	// [Claude修正 2026-10-16] 使い切った・すべて破棄した品は一覧から外す（データと「使用・破棄の記録」には残る）
	const list = (db.data.emergency_supplies || gState.emergencySupplies || []).filter(x => !cpEmgClosed(x));
	renderEmergencyUsageLog();

	if (list.length === 0) {
		tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-muted); padding:16px;">非常食・備蓄品の登録はありません。</td></tr>`;
		return;
	}

	list.forEach(item => {
		// [Claude修正] 日付単位で計算 (旧実装は1日ずれ、当日が「あと1日」と表示されていた)
		const dd = cpDaysUntil(item.expiry_date);
		const diffDays = dd === null ? 999 : dd;
		const isExpired = diffDays < 0;
		const isClose = diffDays >= 0 && diffDays <= 14;
		let statusHtml = '<span style="color:#16a34a; font-weight:bold;">正常保管</span>';
		if (isExpired) {
			statusHtml = `<span class="badge" style="background:#fee2e2; color:#991b1b; font-weight:bold;">期限切れ (${Math.abs(diffDays)}日超過)</span>`;
		} else if (diffDays === 0) {
			statusHtml = `<span class="badge" style="background:#fee2e2; color:#991b1b; font-weight:bold;">本日期限</span>`;
		} else if (isClose) {
			statusHtml = `<span class="badge" style="background:#fef3c7; color:#92400e; font-weight:bold;">期限間近 (あと${diffDays}日)</span>`;
		}

		const tr = document.createElement("tr");
		if (isClose || isExpired) tr.style.backgroundColor = isExpired ? "#fff1f2" : "#fffbeb";

		tr.innerHTML = `
			<td><strong>${escapeHtml(item.name || '')}</strong></td>
			<td><span class="badge" style="background:#eef2ef; color:#4a5852;">${escapeHtml(item.category || '主食')}</span></td>
			<td><strong style="font-size:14px;">${item.quantity || 0}</strong></td>
			<td>${escapeHtml(item.unit || '個')}</td>
			<td><span style="${isClose || isExpired ? 'color:#dc2626; font-weight:bold;' : ''}">${item.expiry_date || '-'}</span></td>
			<td>${statusHtml}</td>
			<td>${escapeHtml(item.storage_place || item.notes || '-')}</td>
			<td style="text-align:center; white-space:nowrap;">
				<button type="button" class="btn btn-secondary" style="font-size:11px; padding:2px 7px;" onclick="openEmergencySupplyModal(${item.id})">訂正</button>
				<button type="button" class="btn btn-secondary" style="font-size:11px; padding:2px 7px; margin-left:3px; border-color:#ea580c; color:#c2410c;" onclick="openEmergencyUseModal(${item.id})">使用・破棄</button>
			</td>
		`;
		tbody.appendChild(tr);
	});
}

function openEmergencySupplyModal(editId = null) {
	const idEl = document.getElementById("emgEditId");
	const nameEl = document.getElementById("emgName");
	const catEl = document.getElementById("emgCat");
	const qtyEl = document.getElementById("emgQty");
	const unitEl = document.getElementById("emgUnit");
	const expEl = document.getElementById("emgExpiry");
	const placeEl = document.getElementById("emgPlace");
	const notesEl = document.getElementById("emgNotes");

	if (editId) {
		const item = (db.data.emergency_supplies || []).find(x => x.id === editId);
		if (!item) return;
		idEl.value = item.id;
		nameEl.value = item.name || "";
		catEl.value = item.category || "主食";
		qtyEl.value = item.quantity || "";
		unitEl.value = item.unit || "食";
		expEl.value = item.expiry_date || "";
		placeEl.value = item.storage_place || "";
		notesEl.value = item.notes || "";
	} else {
		idEl.value = "";
		nameEl.value = "";
		catEl.value = "主食";
		qtyEl.value = "";
		unitEl.value = "食";
		expEl.value = "";
		placeEl.value = "";
		notesEl.value = "";
	}
	openModal("emergencySupplyModal");
}

function submitEmergencySupplyRecord() {
	const editId = document.getElementById("emgEditId")?.value;
	const name = document.getElementById("emgName")?.value.trim();
	const cat = document.getElementById("emgCat")?.value;
	const qty = parseInt(document.getElementById("emgQty")?.value, 10);
	const unit = document.getElementById("emgUnit")?.value.trim();
	const exp = document.getElementById("emgExpiry")?.value;
	const place = document.getElementById("emgPlace")?.value.trim();
	const notes = document.getElementById("emgNotes")?.value.trim();

	if (!name || isNaN(qty) || !exp) {
		alert("品名・数量・賞味期限を入力してください。");
		return;
	}

	if (!Array.isArray(db.data.emergency_supplies)) db.data.emergency_supplies = [];

	if (editId) {
		const item = db.data.emergency_supplies.find(x => x.id === Number(editId));
		if (item) {
			item.name = name; item.category = cat; item.quantity = qty;
			item.unit = unit; item.expiry_date = exp; item.storage_place = place; item.notes = notes;
		}
	} else {
		db.data.emergency_supplies.unshift({
			id: Date.now(), name: name, category: cat, quantity: qty,
			unit: unit, expiry_date: exp, storage_place: place, notes: notes
		});
	}

	db.save();
	gState.emergencySupplies = db.data.emergency_supplies;
	closeModal("emergencySupplyModal");
	renderOfficeEmergencySupplies();
	if (typeof checkGlobalAlerts === "function") checkGlobalAlerts();
	alert("非常食・備蓄品を保存しました！");
}

// [Claude修正 2026-10-16] 非常食は「削除」をやめ、「使用済み」「破棄」を選んで記録する（期限内に使うこともあるため）。
// いつ・だれ・どちらか・何個・理由（破棄は必須）／用途（使用は任意）を usage_log に残し、数量を減らす。
// 一部だけ使ったときは残りの数量で一覧に残る。0になったら一覧から外す（データは消さない）
function cpEmgClosed(item) {
	return !!item && (item.closed === true || (Array.isArray(item.usage_log) && item.usage_log.length > 0 && Number(item.quantity) <= 0));
}
function deleteEmergencySupplyRecord(id) { openEmergencyUseModal(id); }
function openEmergencyUseModal(id) {
	const item = (db.data.emergency_supplies || []).find(x => x.id === id);
	if (!item) return;
	document.getElementById("emgUseId").value = item.id;
	document.getElementById("emgUseTarget").textContent = `${item.name || ""}（残り ${item.quantity || 0}${item.unit || ""}・賞味期限 ${item.expiry_date || "-"}）`;
	document.querySelectorAll('input[name="emgUseType"]').forEach(r => { r.checked = false; });
	const q = document.getElementById("emgUseQty");
	q.value = item.quantity || 0; q.max = item.quantity || 0; q.min = 1;
	document.getElementById("emgUseUnit").textContent = item.unit || "";
	document.getElementById("emgUseDate").value = toLocalDateStr(new Date());
	document.getElementById("emgUseReasonSel").value = "";
	document.getElementById("emgUseReason").value = "";
	cpEmgUseTypeChanged();
	openModal("emergencyUseModal");
}
function cpEmgUseTypeChanged() {
	const t = (document.querySelector('input[name="emgUseType"]:checked') || {}).value || "";
	const sel = document.getElementById("emgUseReasonSel");
	const lbl = document.getElementById("emgUseReasonLabel");
	sel.innerHTML = t === "破棄"
		? '<option value="">選んでください（必須）</option><option>賞味期限切れ</option><option>破損・汚れ</option><option>その他</option>'
		: '<option value="">選んでください（任意）</option><option>防災訓練</option><option>おやつ・食事で消費</option><option>災害・停電時に使用</option><option>その他</option>';
	if (lbl) lbl.textContent = t === "破棄" ? "破棄の理由（必須）:" : "使った用途（任意）:";
}
function submitEmergencyUse() {
	const id = Number(document.getElementById("emgUseId").value);
	const item = (db.data.emergency_supplies || []).find(x => x.id === id);
	if (!item) return;
	const type = (document.querySelector('input[name="emgUseType"]:checked') || {}).value || "";
	const qty = parseInt(cpToHalfWidth(document.getElementById("emgUseQty").value), 10);
	const date = document.getElementById("emgUseDate").value;
	const sel = document.getElementById("emgUseReasonSel").value;
	const memo = document.getElementById("emgUseReason").value.trim();
	const have = Number(item.quantity) || 0;
	if (!type) { alert("「使用済み」か「破棄」を選んでください。"); return; }
	if (isNaN(qty) || qty < 1 || qty > have) { alert(`数量は1〜${have}の間で入力してください。`); return; }
	if (!date) { alert("日付を入力してください。"); return; }
	if (type === "破棄" && !sel) { alert("破棄の理由を選んでください。"); return; }
	if (sel === "その他" && !memo) { alert("「その他」のときは内容を書いてください。"); return; }
	const reason = [sel, memo].filter(Boolean).join("：");
	if (!Array.isArray(item.usage_log)) item.usage_log = [];
	item.usage_log.push({ id: Date.now(), date, type, qty, reason, staff_name: cpLedgerStaff(), recorded_at: toLocalDateTimeStr(new Date()), before_qty: have });
	item.quantity = have - qty;
	if (item.quantity <= 0) { item.quantity = 0; item.closed = true; item.closed_type = type; item.closed_at = toLocalDateTimeStr(new Date()); }
	db.save();
	gState.emergencySupplies = db.data.emergency_supplies;
	closeModal("emergencyUseModal");
	renderOfficeEmergencySupplies();
	if (typeof checkGlobalAlerts === "function") checkGlobalAlerts();
	alert(item.quantity > 0 ? `${type}として ${qty}${item.unit || ""} を記録しました（残り ${item.quantity}${item.unit || ""}）。` : `${type}として記録しました。残りがなくなったので一覧から外しました（記録は下の「使用・破棄の記録」に残ります）。`);
}
function renderEmergencyUsageLog() {
	const box = document.getElementById("emergencyUsageLog");
	if (!box) return;
	const rows = [];
	(db.data.emergency_supplies || []).forEach(it => (it.usage_log || []).forEach(l => rows.push({ it, l })));
	rows.sort((a, b) => (b.l.date + b.l.recorded_at).localeCompare(a.l.date + a.l.recorded_at));
	box.innerHTML = `<details class="emg-usage"${rows.length ? "" : ""}><summary>使用・破棄の記録（${rows.length}件）</summary>` +
		(rows.length ? `<div style="overflow-x:auto;"><table class="data-table"><thead><tr><th>日付</th><th>品名</th><th>区分</th><th>数量</th><th>理由・用途</th><th>記録した人</th><th>記録日時</th></tr></thead><tbody>` +
		rows.map(({ it, l }) => `<tr><td>${escapeHtml(l.date || "")}</td><td>${escapeHtml(it.name || "")}</td><td><span class="badge" style="${l.type === "破棄" ? "background:#fee2e2; color:#991b1b;" : "background:#dcfce7; color:#166534;"}">${escapeHtml(l.type)}</span></td><td>${l.qty}${escapeHtml(it.unit || "")}</td><td>${escapeHtml(l.reason || "-")}</td><td>${escapeHtml(l.staff_name || "")}</td><td>${escapeHtml(l.recorded_at || "")}</td></tr>`).join("") +
		`</tbody></table></div>` : `<p style="font-size:13px; color:var(--text-muted); margin:8px 0;">まだ記録はありません。</p>`) + `</details>`;
}
window.openEmergencyUseModal = openEmergencyUseModal;
window.submitEmergencyUse = submitEmergencyUse;
window.cpEmgUseTypeChanged = cpEmgUseTypeChanged;
// 車両運行管理簿
function renderOfficeVehicleLogs() {
 const tbody = document.querySelector("#vehicleLogsTable tbody");
 tbody.innerHTML = "";
 (db.data.vehicle_logs || []).forEach(l => {
 const tr = document.createElement("tr");
 tr.innerHTML = `
 <td>${l.date}</td>
 <td><strong>${l.vehicle_name}</strong></td>
 <td>${l.driver_name}</td>
 <td>${l.purpose}</td>
 <td>${l.start_km} km</td>
 <td>${l.end_km} km</td>
 <td><strong style="color:#0284c7;">${l.distance_km} km</strong></td>
 <td>${l.key_returned ? ' 返却確認済' : '未返却'}</td>
 <td>${l.notes || '-'}</td>
 `;
 tbody.appendChild(tr);
 });
}

function submitVehicleLog() {
 const vname = document.getElementById("vehName").value;
 const driver = document.getElementById("vehDriver").value;
 const purpose = document.getElementById("vehPurpose").value;
 const startKm = parseInt(document.getElementById("vehStartKm").value);
 const endKm = parseInt(document.getElementById("vehEndKm").value);

 if (!purpose || isNaN(startKm) || isNaN(endKm) || endKm < startKm) {
 alert("運行情報およびメーター数値を正しく入力してください。");
 return;
 }

 db.data.vehicle_logs.unshift({
 id: Date.now(), date: toLocalDateStr(new Date()), vehicle_name: vname,
 driver_name: driver, purpose: purpose, start_km: startKm, end_km: endKm,
 distance_km: endKm - startKm, key_returned: 1, notes: ""
 });
 db.save();

 document.getElementById("vehPurpose").value = "";
 loadOfficeData();
 alert("車両運行管理簿に記録しました！走行距離が自動計算されました。");
}

// 消防訓練
function renderOfficeFireDrills() {
	const tbody = document.querySelector("#fireTable tbody");
	if (!tbody) return;
	tbody.innerHTML = "";
	const list = db.data.fire_drills || [];

	if (list.length === 0) {
		tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-muted); padding:16px;">消防・避難訓練の実施記録はありません。</td></tr>`;
		return;
	}

	cpLedgerOrder(list).forEach(d => {
		const tr = document.createElement("tr");
		tr.innerHTML = `
			<td>${escapeHtml(d.date || '')}</td>
			<td><span class="badge" style="background:#fef3c7; color:#92400e;">${escapeHtml(d.drill_type || '火災訓練')}</span></td>
			<td>${escapeHtml(d.participants_count || '-')}</td>
			<td>${d.duration ? `<strong>${escapeHtml(d.duration)}</strong>` : '-'}</td>
			<td>${escapeHtml(d.scenario || '-')}</td>
			<td>${escapeHtml(d.notes || '-')}</td>
			<td>${escapeHtml(d.reported_to_fire_dept || '-')}</td>
			<td>${escapeHtml(d.supervisor || '-')}</td>
			<td style="text-align:center; white-space:nowrap;">
				${cpLedgerActions('fire_drills', d, 'openFireDrillModal')}
			</td>
		`;
		if (d.voided) cpMarkVoidedRow(tr);
		tbody.appendChild(tr);
	});
}

function openFireDrillModal(editId = null) {
	const idEl = document.getElementById("fireEditId");
	const dateEl = document.getElementById("fireDate");
	const typeEl = document.getElementById("fireType");
	const partEl = document.getElementById("fireParticipants");
	const durEl = document.getElementById("fireDuration");
	const scenEl = document.getElementById("fireScenario");
	const notesEl = document.getElementById("fireNotes");
	const repEl = document.getElementById("fireReported");
	const supEl = document.getElementById("fireSupervisor");

	if (editId) {
		const d = (db.data.fire_drills || []).find(x => x.id === editId);
		if (!d) return;
		idEl.value = d.id;
		dateEl.value = d.date || toLocalDateStr(new Date());
		typeEl.value = d.drill_type || "昼間火災想定訓練";
		partEl.value = d.participants_count || "";
		durEl.value = d.duration || "";
		scenEl.value = d.scenario || "";
		notesEl.value = d.notes || "";
		repEl.value = d.reported_to_fire_dept || "";
		supEl.value = d.supervisor || "施設長";
	} else {
		idEl.value = "";
		dateEl.value = toLocalDateStr(new Date());
		typeEl.value = "昼間火災想定訓練";
		// [Claude修正] 旧実装は参加人数・所要時間・所見・通報状況に例文が入っており、
		// そのまま保存すると実施していない内容が公式記録になっていた。空欄で開く
		partEl.value = "";
		durEl.value = "";
		scenEl.value = "";
		notesEl.value = "";
		repEl.value = "";
		supEl.value = "施設長";
	}
	openModal("fireDrillModal");
}

function submitFireDrillRecord() {
	const editId = document.getElementById("fireEditId")?.value;
	const date = document.getElementById("fireDate")?.value;
	const type = document.getElementById("fireType")?.value;
	const part = document.getElementById("fireParticipants")?.value.trim();
	const dur = document.getElementById("fireDuration")?.value.trim();
	const scen = document.getElementById("fireScenario")?.value.trim();
	const notes = document.getElementById("fireNotes")?.value.trim();
	const rep = document.getElementById("fireReported")?.value.trim();
	const sup = document.getElementById("fireSupervisor")?.value.trim();

	if (!date || !type) {
		alert("実施日と訓練種別を入力してください。");
		return;
	}

	if (!Array.isArray(db.data.fire_drills)) db.data.fire_drills = [];

	if (editId) {
		const d = db.data.fire_drills.find(x => x.id === Number(editId));
		if (d) {
			const cpOld = Object.assign({}, d); // [Claude修正] 訂正前の内容を履歴に残す
			d.date = date; d.drill_type = type; d.participants_count = part;
			d.duration = dur; d.scenario = scen; d.notes = notes;
			d.reported_to_fire_dept = rep; d.supervisor = sup;
			cpAppendEditHistory(d, cpOld, ["date", "drill_type", "participants_count", "duration", "scenario", "notes", "reported_to_fire_dept", "supervisor"]);
		}
	} else {
		db.data.fire_drills.unshift({
			id: Date.now(), date: date, drill_type: type, participants_count: part,
			duration: dur, scenario: scen, notes: notes, reported_to_fire_dept: rep,
			supervisor: sup
		});
	}

	db.save();
	closeModal("fireDrillModal");
	renderOfficeFireDrills();
	alert("消防・避難訓練記録を保存しました！");
}

function deleteFireDrillRecord(id) {
	// [Claude修正] 削除せず取消にする
	cpVoidLedgerRecord('fire_drills', id);
}
// 法定委員会・研修記録
function renderOfficeCommittees() {
 const tbody = document.querySelector("#committeeTable tbody");
 if (!tbody) return;
 tbody.innerHTML = "";
 const list = cpLedgerOrder(db.data.committees || []); // [Claude修正] 取消済みは後ろに並べる
 if (list.length === 0) {
 const tr = document.createElement("tr");
 tr.innerHTML = `<td colspan="7" style="text-align:center; color:#5f6d66; padding:20px;">登録された委員会・研修記録はありません。「+ 委員会・研修登録」から追加できます。</td>`;
 tbody.appendChild(tr);
 return;
 }

 list.forEach(c => {
 const tr = document.createElement("tr");
 const cat = c.category || "法定委員会";
 let catBadgeColor = "#1e5b47";
 let catBgColor = "#dcebe3";
 if (cat === "施設内研修") {
 catBadgeColor = "#166534";
 catBgColor = "#dcfce7";
 } else if (cat === "外部研修") {
 catBadgeColor = "#7c2d12";
 catBgColor = "#ffedd5";
 } else if (cat === "その他業務項目") {
 catBadgeColor = "#4b5563";
 catBgColor = "#f3f4f6";
 }

 // [Claude修正] 削除をやめて「取消」に（理由必須・記録は残る）
 const actionHtml = c.voided
 ? `<div style="font-size:11px; color:#991b1b; font-weight:bold;">取消済</div><div style="font-size:10.5px; color:#5f6d66; white-space:normal; max-width:180px;">${escapeHtml(c.voided_at || '')} ${escapeHtml(c.voided_by || '')}<br>理由: ${escapeHtml(c.void_reason || '-')}</div><button type="button" class="btn btn-secondary" style="font-size:11px; padding:2px 7px; margin-top:3px;" onclick="cpRestoreLedgerRecord('committees', ${Number(c.id)})">取消を戻す</button>`
 : `<button class="btn btn-secondary" style="padding:3px 8px; font-size:12px; color:#991b1b; border-color:#fca5a5;" onclick="deleteCommittee(${Number(c.id)})">取消</button>`;
 tr.innerHTML = `
 <td>${escapeHtml(c.date || '-')}</td>
 <td><span class="badge" style="background:${catBgColor}; color:${catBadgeColor}; font-weight:bold;">${escapeHtml(cat)}</span></td>
 <td><strong>${escapeHtml(c.committee_name || c.name || '-')}</strong></td>
 <td>${escapeHtml(c.attendees || '-')}</td>
 <td>${escapeHtml(c.agenda || '-')}</td>
 <td style="max-width:280px; white-space:pre-wrap; font-size:13px;">${escapeHtml(c.content || '-')}</td>
 <td>${actionHtml}</td>
 `;
 if (c.voided) cpMarkVoidedRow(tr);
 tbody.appendChild(tr);
 });
}

function openCommitteeModal() {
 const today = toLocalDateStr(new Date());
 const dateInput = document.getElementById("comDate");
 if (dateInput) dateInput.value = today;
 const nameInput = document.getElementById("comName");
 if (nameInput) nameInput.value = "";
 const attendeesInput = document.getElementById("comAttendees");
 if (attendeesInput) {
 const curStaff = document.getElementById("currentStaff")?.value || "";
 attendeesInput.value = curStaff;
 }
 const agendaInput = document.getElementById("comAgenda");
 if (agendaInput) agendaInput.value = "";
 const contentInput = document.getElementById("comContent");
 if (contentInput) contentInput.value = "";
 const catInput = document.getElementById("comCategory");
 if (catInput) catInput.value = "法定委員会";

 const modal = document.getElementById("committeeModal");
 if (modal) modal.style.display = "flex";
}

function submitCommittee() {
 const date = document.getElementById("comDate")?.value;
 const category = document.getElementById("comCategory")?.value || "法定委員会";
 const name = document.getElementById("comName")?.value?.trim();
 const attendees = document.getElementById("comAttendees")?.value?.trim() || "-";
 const agenda = document.getElementById("comAgenda")?.value?.trim() || "-";
 const content = document.getElementById("comContent")?.value?.trim();

 if (!date || !name || !content) {
 alert("開催日、委員会・研修名、および協議内容は必須項目です。");
 return;
 }

 if (!db.data.committees) db.data.committees = [];
 const newRecord = {
 id: Date.now(),
 date: date,
 category: category,
 committee_name: name,
 attendees: attendees,
 agenda: agenda,
 content: content,
 created_at: toLocalDateTimeStr(new Date())
 };
 db.data.committees.unshift(newRecord);
 db.save();
 closeModal("committeeModal");
 renderOfficeCommittees();
 alert("法定委員会・研修記録を登録・保存しました！");
}

function deleteCommittee(id) {
 cpVoidLedgerRecord("committees", id);
}

// 発注 ＆ 上司承認 (管理者のみ認証・閲覧制限)
function renderOfficeOrders() {
 const tbody = document.querySelector("#ordersTable tbody");
 if (!tbody) return;
 tbody.innerHTML = "";
 const isAdmin = isCurrentStaffAdmin();

 (db.data.orders || []).forEach(o => {
 const tr = document.createElement("tr");
 let badgeColor = "#fef3c7; color:#92400e;";
 if (o.status === "承認済") badgeColor = "#dcebe3; color:#1e5b47;";
 if (o.status === "納品完了") badgeColor = "#dcfce7; color:#166534;";
 if (o.status === "差戻し") badgeColor = "#fee2e2; color:#991b1b;";

 let actionButtons = "";
 if (o.status === "申請中") {
 if (isAdmin) {
 actionButtons = `
 <button class="btn btn-primary" style="padding:4px 8px; font-size:12px;" onclick="approveOrder(${o.id}, '承認済')">上司承認</button>
 <button class="btn btn-danger" style="padding:4px 8px; font-size:12px;" onclick="approveOrder(${o.id}, '差戻し')">差戻し</button>
 `;
 } else {
 actionButtons = `<span style="font-size:11px; color:#94a19a; background:#eef2ef; padding:3px 6px; border-radius:4px;">※ 承認権限: 管理者のみ</span>`;
 }
 } else if (o.status === "承認済") {
 actionButtons = `
 <button class="btn btn-success" style="padding:4px 8px; font-size:12px;" onclick="receiveOrder(${o.id})">納品受取 (在庫加算)</button>
 `;
 }

 tr.innerHTML = `
 <td>${o.ordered_at || o.order_date || '-'}${o.received_at ? `<div style="font-size:11px; color:#166534;">受取: ${o.received_at}</div>` : ''}</td>
 <td><strong>${o.item_name}</strong></td>
 <td>${o.quantity}</td>
 <td>¥${(o.total_price || 0).toLocaleString()}</td>
 <td>${o.supplier_name || '-'}</td>
 <td>${o.reason || '-'}</td>
 <td><span style="font-size:12px; font-weight:bold; padding:2px 8px; border-radius:4px; background:${badgeColor}">${o.status}</span></td>
 <td>${o.applicant} / ${o.approver || '-'}</td>
 <td>${actionButtons}</td>
 `;
 tbody.appendChild(tr);
 });
}

function approveOrder(id, status) {
 if (!isCurrentStaffAdmin()) {
 alert(" 発注申請の承認・差戻しは管理者（施設長）のみが行えます。\n担当職員を管理者に切り替えてください。");
 return;
 }
 const staff = document.getElementById("currentStaff").value;
 const o = db.data.orders.find(x => x.id === id);
 if (!o) return;

 const actionLabel = status === "承認済" ? "承認" : "差戻し";
 const ok = confirm(`【発注申請 ${actionLabel}】\n・申請者: ${o.applicant || '職員'}\n・品名: ${o.item_name}\n・数量: ${o.quantity}\n・金額: ¥${(o.total_price || 0).toLocaleString()}\n・業者: ${o.supplier_name || '-'}\n・理由: ${o.reason || '特記なし'}`);
 if (!ok) return;

 o.status = status;
 o.approver = staff;
 o.approved_at = toLocalDateStr(new Date());
 db.save();
 renderOfficeIncidents();
	if (gState.activePortal === "office") loadOfficeData();
 checkGlobalAlerts();
 alert(`発注申請（${o.item_name} × ${o.quantity}）を「${status}」にしました。`);
}

function receiveOrder(id) {
 const o = db.data.orders.find(x => x.id === id);
 const staff = document.getElementById("currentStaff").value;
 const now = new Date();
 const nowStr = `${toLocalDateStr(now)} ${now.toTimeString().slice(0, 5)}`;

 if (o) {
 // [Claude修正] 誤タップで在庫が増えないよう確認を入れ、受取日と受取者を記録する
 if (o.status !== "承認済") {
 alert("この発注はすでに処理済みです。");
 return;
 }
 const recvStaff = (gState.session && gState.session.staffName) ? gState.session.staffName : staff;
 if (!confirm(`【納品受取の確認】\n・品名: ${o.item_name}\n・数量: ${o.quantity}\n・発注日: ${o.ordered_at || o.order_date || '-'}\n\n品物が届いたことを確認し、在庫に加算します。よろしいですか？`)) return;
 o.status = "納品完了";
 o.received_at = toLocalDateStr(now);
 o.received_by = recvStaff;
 const item = gState.inventory.find(i => i.name === o.item_name);
 if (item) {
 item.current_stock += o.quantity;
 db.data.inventory_logs.unshift({
 id: Date.now(), timestamp: nowStr, item_id: item.id, item_name: item.name,
 action_type: "納品", change_qty: o.quantity, after_qty: item.current_stock, staff_name: staff, reason: "発注受取納品"
 });
 }
 db.save();
 loadOfficeData();
 checkGlobalAlerts();
 alert("納品を受領し、在庫に加算しました！");
 }
}

// 取引先マスタ
// 4. 取引先マスタ ＆ 個別取扱商品管理
function renderOfficeSuppliers() {
 const container = document.getElementById("suppliersContainer");
 if (!container) return;
 container.innerHTML = "";

 if (!Array.isArray(gState.suppliers) || gState.suppliers.length === 0) {
   container.innerHTML = `
     <div style="background:#ffffff; border:1px dashed #cdd6d0; border-radius:8px; padding:32px; text-align:center; color:var(--text-muted);">
       <p style="font-size:14px; margin-bottom:10px;">登録されている取引先がありません。</p>
       <button type="button" class="btn btn-primary" style="font-size:13px;" onclick="openSupplierModal()">＋ 新規取引先を追加</button>
     </div>
   `;
   return;
 }

 gState.suppliers.forEach(s => {
   const card = document.createElement("div");
   card.className = "supplier-card";
   card.style.background = "#ffffff";
   card.style.border = "1px solid #dfe5e1";
   card.style.borderRadius = "8px";
   card.style.padding = "16px";
   card.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)";

   const items = Array.isArray(s.items) ? s.items : [];

   let itemsRows = "";
   if (items.length === 0) {
     itemsRows = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:12px; font-size:12.5px;">登録されている取扱商品はありません。「＋ 取扱商品を追加」ボタンから登録してください。</td></tr>`;
   } else {
     items.forEach(it => {
       itemsRows += `
         <tr>
           <td style="font-weight:bold; font-size:13px; color:#22302b;">${escapeHtml(it.name)}</td>
           <td style="font-weight:bold; font-size:13px; color:#0284c7;">¥${Number(it.unit_price || 0).toLocaleString()}</td>
           <td style="font-size:12.5px; color:#4a5852;">${escapeHtml(it.unit || '個')}</td>
           <td style="text-align:right; white-space:nowrap;">
             <button type="button" class="btn btn-secondary" style="font-size:11px; padding:2px 8px; margin-right:4px;" onclick="openSupplierItemModal(${s.id}, ${Number(it.id)})">編集</button>
             <button type="button" class="btn btn-secondary" style="font-size:11px; padding:2px 8px; color:#dc2626; border-color:#fca5a5;" onclick="deleteSupplierItem(${s.id}, ${Number(it.id)})">削除</button>
           </td>
         </tr>
       `;
     });
   }

   card.innerHTML = `
     <!-- 取引先ヘッダー -->
     <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px; border-bottom:1px solid #eef2ef; padding-bottom:12px; margin-bottom:12px;">
       <div>
         <div style="display:flex; align-items:center; gap:8px;">
           <h4 style="margin:0; font-size:16px; color:#1c2622; font-weight:bold;">${escapeHtml(s.name)}</h4>
         </div>
         <div style="display:flex; gap:16px; flex-wrap:wrap; margin-top:6px; font-size:12.5px; color:#4a5852;">
           <span><strong>担当者:</strong> ${escapeHtml(s.contact_person || '未設定')}</span>
           <span><strong>TEL:</strong> ${escapeHtml(s.phone || '未設定')}</span>
           <span><strong>E-mail:</strong> ${escapeHtml(s.email || '未設定')}</span>
         </div>
       </div>
       <div style="display:flex; gap:6px;">
         <button type="button" class="btn btn-secondary" style="font-size:12px; padding:4px 10px;" onclick="openSupplierModal(${s.id})">取引先情報を編集</button>
         <button type="button" class="btn btn-secondary" style="font-size:12px; padding:4px 10px; color:#dc2626; border-color:#fca5a5;" onclick="deleteSupplier(${s.id})">取引先を削除</button>
       </div>
     </div>

     <!-- 取扱商品セクション -->
     <div style="background:#f6f8f6; border:1px solid #dfe5e1; border-radius:6px; padding:12px;">
       <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
         <span style="font-size:13px; font-weight:bold; color:#36443e;">取扱商品一覧 (${items.length}品目)</span>
         <button type="button" class="btn btn-primary" style="font-size:12px; padding:4px 12px; background:#0284c7; border-color:#0284c7;" onclick="openSupplierItemModal(${s.id})">＋ 取扱商品を追加</button>
       </div>
       <table class="data-table" style="background:#ffffff; margin:0;">
         <thead>
           <tr style="background:#eef2ef;">
             <th>商品名</th>
             <th style="width:110px;">単価</th>
             <th style="width:90px;">単位</th>
             <th style="width:110px; text-align:right;">商品操作</th>
           </tr>
         </thead>
         <tbody>
           ${itemsRows}
         </tbody>
       </table>
     </div>
   `;

   container.appendChild(card);
 });
}

// 取引先 親項目の登録・編集
function openSupplierModal(suppId) {
 const titleEl = document.getElementById("supplierModalTitle");
 const idEl = document.getElementById("editSupplierId");
 const nameEl = document.getElementById("suppName");
 const contactEl = document.getElementById("suppContact");
 const phoneEl = document.getElementById("suppPhone");
 const emailEl = document.getElementById("suppEmail");

 if (suppId) {
   const s = gState.suppliers.find(x => x.id === suppId);
   if (!s) return;
   if (titleEl) titleEl.textContent = "取引先情報の編集";
   idEl.value = s.id;
   nameEl.value = s.name || "";
   contactEl.value = s.contact_person || "";
   phoneEl.value = s.phone || "";
   emailEl.value = s.email || "";
 } else {
   if (titleEl) titleEl.textContent = "新規取引先の登録";
   idEl.value = "";
   nameEl.value = "";
   contactEl.value = "";
   phoneEl.value = "";
   emailEl.value = "";
 }
 openModal("supplierModal");
}

function submitSupplierModal() {
 const idVal = document.getElementById("editSupplierId").value;
 const name = document.getElementById("suppName").value.trim();
 const contact = document.getElementById("suppContact").value.trim();
 const phone = document.getElementById("suppPhone").value.trim();
 const email = document.getElementById("suppEmail").value.trim();

 if (!name) {
   alert("取引先名を入力してください。");
   return;
 }

 if (idVal) {
   // 既存更新
   const s = gState.suppliers.find(x => x.id === Number(idVal));
   if (s) {
     s.name = name;
     s.contact_person = contact;
     s.phone = phone;
     s.email = email;
     alert(`取引先「${name}」の情報を更新しました。`);
   }
 } else {
   // 新規作成
   const newSupplier = {
     id: Date.now(),
     name: name,
     contact_person: contact,
     phone: phone,
     email: email,
     items: []
   };
   gState.suppliers.push(newSupplier);
   alert(`新規取引先「${name}」を登録しました！`);
 }

 db.data.suppliers = gState.suppliers;
 db.save();
 renderOfficeSuppliers();
 closeModal("supplierModal");
}

function deleteSupplier(suppId) {
 const s = gState.suppliers.find(x => x.id === suppId);
 if (!s) return;
 if (!confirm(`【警告】\n取引先「${s.name}」および登録されている全取扱商品を削除しますか？`)) {
   return;
 }
 gState.suppliers = gState.suppliers.filter(x => x.id !== suppId);
 db.data.suppliers = gState.suppliers;
 db.save();
 renderOfficeSuppliers();
 alert(`取引先「${s.name}」を削除しました。`);
}

// 取扱商品 子項目の追加・編集
function openSupplierItemModal(suppId, itemId) {
 const s = gState.suppliers.find(x => x.id === suppId);
 if (!s) return;

 document.getElementById("targetSupplierId").value = suppId;
 document.getElementById("supplierItemModalSuppName").textContent = s.name;
 const titleEl = document.getElementById("supplierItemModalTitle");
 const idEl = document.getElementById("editSupplierItemId");
 const nameEl = document.getElementById("itemModalName");
 const priceEl = document.getElementById("itemModalPrice");
 const unitEl = document.getElementById("itemModalUnit");

 if (itemId) {
   const it = (s.items || []).find(x => (Number(x.id) === Number(itemId) || x.name === itemId));
   if (it) {
     if (titleEl) titleEl.textContent = "取扱商品の編集";
     idEl.value = it.id || it.name;
     nameEl.value = it.name || "";
     priceEl.value = it.unit_price || 0;
     unitEl.value = it.unit || "個";
   }
 } else {
   if (titleEl) titleEl.textContent = "新規取扱商品の追加";
   idEl.value = "";
   nameEl.value = "";
   priceEl.value = "";
   unitEl.value = "個";
 }

 openModal("supplierItemModal");
}

function submitSupplierItemModal() {
 const suppId = Number(document.getElementById("targetSupplierId").value);
 const itemIdVal = document.getElementById("editSupplierItemId").value;
 const name = document.getElementById("itemModalName").value.trim();
 const priceStr = document.getElementById("itemModalPrice").value.trim();
 const unit = document.getElementById("itemModalUnit").value.trim() || "個";

 if (!name) {
   alert("商品名を入力してください。");
   return;
 }
 const price = parseInt(priceStr, 10);
 if (isNaN(price) || price < 0) {
   alert("有効な単価を入力してください。");
   return;
 }

 const s = gState.suppliers.find(x => x.id === suppId);
 if (!s) return;
 if (!Array.isArray(s.items)) s.items = [];

 if (itemIdVal) {
   // 既存編集
   const it = s.items.find(x => String(x.id) === String(itemIdVal) || x.name === itemIdVal);
   if (it) {
     it.name = name;
     it.unit_price = price;
     it.unit = unit;
     alert(`商品「${name}」を更新しました。`);
   }
 } else {
   // 新規商品追加
   s.items.push({
     id: Date.now(),
     name: name,
     unit_price: price,
     unit: unit
   });
   alert(`「${s.name}」に商品「${name}」を追加しました！`);
 }

 db.data.suppliers = gState.suppliers;
 db.save();
 renderOfficeSuppliers();
 closeModal("supplierItemModal");
}

function deleteSupplierItem(suppId, itemId) {
 const s = gState.suppliers.find(x => x.id === suppId);
 if (!s || !Array.isArray(s.items)) return;
 const it = s.items.find(x => (Number(x.id) === Number(itemId) || x.name === itemId));
 if (!it) {
   alert("対象の商品が見つかりません。画面を再読み込みしてから操作してください。");
   return;
 }
 const itemName = it.name;

 if (!confirm(`取扱商品「${itemName}」を削除しますか？`)) return;

 s.items = s.items.filter(x => x !== it);
 db.data.suppliers = gState.suppliers;
 db.save();
 renderOfficeSuppliers();
 alert(`商品「${itemName}」を削除しました。`);
}

// 月末請求明細
// [Claude修正] 月末の物品使用明細
// - 対象の月で区切る（以前は「今月」と表示しながら全期間を合計していた）
// - 「全員の一覧」で誰がいくらかを一覧、利用者を選ぶと品目ごとの合計と使用日の内訳
// - 同じ品名でも単価が違えば別の行にする（以前は最初の単価で計算していた）
// - 退所した方も、その月に使用記録があれば対象にする（精算があるため）
const CP_BILLING_ALL = "__all__";
function cpBillingMonth() {
 const el = document.getElementById("billingMonth");
 if (el && !el.value) el.value = toLocalDateStr(new Date()).slice(0, 7);
 return el ? el.value : toLocalDateStr(new Date()).slice(0, 7);
}
function cpBillingMonthLabel(ym) {
 const m = String(ym || "").match(/^(\d{4})-(\d{2})$/);
 return m ? `${m[1]}年${Number(m[2])}月` : String(ym || "");
}
function cpBillingRecords(ym, resId) {
 return (db.data.consumptions || []).filter(c => c && !c.voided
  && String(c.consumed_at || "").slice(0, 7) === ym
  && (resId === undefined || Number(c.resident_id) === Number(resId)))
  .sort((x, y) => String(x.consumed_at || "").localeCompare(String(y.consumed_at || "")));
}
function cpBillingAmount(c) {
 const unitPrice = Number(c.unit_price) || 0;
 const qty = Number(c.quantity) || 0;
 return (typeof c.subtotal === "number") ? c.subtotal : unitPrice * qty;
}
function cpBillingUnitOf(c) {
 const item = (db.data.inventory || []).find(i => Number(i.id) === Number(c.item_id));
 return item && item.unit ? item.unit : "";
}
function renderOfficeBillingSelect() {
 const sel = document.getElementById("billingResidentSelect");
 if (!sel) return;
 const keep = sel.value;
 const list = (gState.residents || []).slice().sort((x, y) => String(x.room_no).localeCompare(String(y.room_no), "ja", { numeric: true }));
 sel.innerHTML = `<option value="${CP_BILLING_ALL}">全員の一覧</option>` + list.map(r =>
  `<option value="${r.id}">${escapeHtml(r.room_no)}号室 ${escapeHtml(r.name)} 様${r.status === "退所" ? "（退所）" : ""}</option>`).join("");
 if (keep && [...sel.options].some(o => o.value === keep)) sel.value = keep;
 cpBillingMonth();
 renderBillingDetail();
}
function cpOpenBillingResident(resId) {
 const sel = document.getElementById("billingResidentSelect");
 if (sel) sel.value = String(resId);
 renderBillingDetail();
}
function renderBillingDetail() {
  const bSettings = cpGetBillingSettings();
  const facilityNotice = !bSettings.personal_enabled
    ? `<div style="background:#fef3c7; border:1px solid #f59e0b; color:#92400e; padding:10px 14px; border-radius:6px; margin-bottom:14px; font-weight:bold; font-size:13px;">この施設は利用者の個人請求を使わない設定です</div>`
    : "";
 const sel = document.getElementById("billingResidentSelect");
 const area = document.getElementById("billingDetailArea");
 if (!sel || !area) return;
 const ym = cpBillingMonth();
 const label = cpBillingMonthLabel(ym);
 if (!sel.value || sel.value === CP_BILLING_ALL) {
  const recs = cpBillingRecords(ym);
  const by = {};
  recs.forEach(c => {
   const k = String(c.resident_id);
   if (!by[k]) by[k] = { count: 0, total: 0 };
   by[k].count += 1;
   by[k].total += cpBillingAmount(c);
  });
  const rows = (gState.residents || []).filter(r => by[String(r.id)])
   .sort((x, y) => String(x.room_no).localeCompare(String(y.room_no), "ja", { numeric: true }))
   .map(r => {
    const v = by[String(r.id)];
    return `<tr><td>${escapeHtml(r.room_no)}</td><td>${escapeHtml(r.name)} 様${r.status === "退所" ? "（退所）" : ""}</td><td class="num">${v.count}件</td><td class="num"><strong>¥${v.total.toLocaleString()}</strong></td>
     <td class="no-print"><button type="button" class="tool-link" onclick="cpOpenBillingResident(${Number(r.id)})">内訳を見る</button></td></tr>`;
   });
  const unknown = recs.filter(c => !(gState.residents || []).some(r => Number(r.id) === Number(c.resident_id)));
  const grand = recs.reduce((s, c) => s + cpBillingAmount(c), 0);
  area.innerHTML = `
   <div class="billing-sheet">
    ${facilityNotice}
    <h3>${escapeHtml(label)}　物品使用明細（全員の一覧）</h3>
    <table class="data-table billing-table">
     <thead><tr><th>部屋</th><th>利用者</th><th class="num">使用の記録</th><th class="num">合計</th><th class="no-print"></th></tr></thead>
     <tbody>${rows.join("") || `<tr><td colspan="5" class="billing-empty">${escapeHtml(label)}の、個人に請求する品物の使用記録はありません。</td></tr>`}</tbody>
     <tfoot><tr><td colspan="3" class="num">全員の合計</td><td class="num"><strong>¥${grand.toLocaleString()}</strong></td><td class="no-print"></td></tr></tfoot>
    </table>
    ${unknown.length ? `<p class="billing-warn">利用者の登録がない使用記録が ${unknown.length}件 あります（全員の合計には含めています）。</p>` : ""}
   </div>`;
  return;
 }
 const resId = Number(sel.value);
 const r = (gState.residents || []).find(x => Number(x.id) === resId);
 if (!r) { area.innerHTML = ""; return; }
 const recs = cpBillingRecords(ym, resId);
 const summary = {};
 recs.forEach(c => {
  const name = c.item_name || "品名なし";
  const price = Number(c.unit_price) || 0;
  const k = name + "|" + price;
  if (!summary[k]) summary[k] = { name: name, unit: cpBillingUnitOf(c), price: price, qty: 0, total: 0 };
  summary[k].qty += Number(c.quantity) || 0;
  summary[k].total += cpBillingAmount(c);
 });
 const total = recs.reduce((s, c) => s + cpBillingAmount(c), 0);
 const sumRows = Object.values(summary).map(v =>
  `<tr><td>${escapeHtml(v.name)}</td><td class="num">${v.qty}${escapeHtml(v.unit)}</td><td class="num">¥${v.price.toLocaleString()}</td><td class="num"><strong>¥${v.total.toLocaleString()}</strong></td></tr>`).join("");
 const detRows = recs.map(c =>
  `<tr><td>${escapeHtml(String(c.consumed_at || "").slice(5, 16).replace("-", "/"))}</td><td>${escapeHtml(c.item_name || "")}</td><td class="num">${Number(c.quantity) || 0}${escapeHtml(cpBillingUnitOf(c))}</td><td class="num">¥${cpBillingAmount(c).toLocaleString()}</td><td>${escapeHtml(c.staff_name || "")}</td></tr>`).join("");
 area.innerHTML = `
  <div class="billing-sheet">
    ${facilityNotice}
   <h3>${escapeHtml(label)}　${escapeHtml(r.room_no)}号室 ${escapeHtml(r.name)} 様　物品使用明細${r.status === "退所" ? "（退所）" : ""}</h3>
   <table class="data-table billing-table">
    <thead><tr><th>品名</th><th class="num">数量</th><th class="num">単価</th><th class="num">小計</th></tr></thead>
    <tbody>${sumRows || `<tr><td colspan="4" class="billing-empty">${escapeHtml(label)}の、個人に請求する品物の使用記録はありません。</td></tr>`}</tbody>
    <tfoot><tr><td colspan="3" class="num">合計</td><td class="num"><strong>¥${total.toLocaleString()}</strong></td></tr></tfoot>
   </table>
   ${recs.length ? `<h4>使用日の内訳</h4>
   <table class="data-table billing-table">
    <thead><tr><th>日時</th><th>品名</th><th class="num">数量</th><th class="num">金額</th><th>記録した職員</th></tr></thead>
    <tbody>${detRows}</tbody>
   </table>` : ""}
  </div>`;
}
// ==========================================
// [Claude追加] 契約・同意書類の管理（2026-10-15 ユーザー「追加だね」2026-10-13）
// - 書類ごとに「交わした日（契約・説明・同意した日）」「次の更新日（あれば）」を記録する
// - 書類の種類は施設で決める（事務ポータル「契約・同意書類」で追加・名前の変更・削除）。
//   最初は 利用契約書・重要事項説明書・個人情報の利用に関する同意書 を例として出す（施設に合わせて変える前提）
// - 書類そのもの（画像）は、これまでどおり「重要書類（同意書）」に保管する
// - 記録は消さない: 直すときは理由を入れて訂正（前の内容を履歴に残す）、間違いは取消（理由必須）
// - 登録・訂正・取消は 管理者・事務員 だけ。見るのは全員
// ==========================================
const CP_CONTRACT_DEFAULT_TYPES = [
 { id: 1, name: "利用契約書", renewal: true, order: 1 },
 { id: 2, name: "重要事項説明書", renewal: false, order: 2 },
 { id: 3, name: "個人情報の利用に関する同意書", renewal: false, order: 3 }
];
const CP_CONTRACT_SOON_DAYS = 30;
function cpContractTypes() {
 const list = Array.isArray(db.data.contract_doc_types) && db.data.contract_doc_types.length ? db.data.contract_doc_types : CP_CONTRACT_DEFAULT_TYPES;
 return list.filter(t => t && !t.deleted).slice().sort((x, y) => (x.order || 0) - (y.order || 0));
}
function cpContractTypesMaterialize() {
 if (!Array.isArray(db.data.contract_doc_types) || !db.data.contract_doc_types.length) {
  db.data.contract_doc_types = CP_CONTRACT_DEFAULT_TYPES.map(t => Object.assign({}, t));
 }
 return db.data.contract_doc_types;
}
function cpCanEditContracts() {
 return typeof isStaffAdminOrClerk === "function" && isStaffAdminOrClerk(cpLoginStaffName());
}
function cpContractRecord(resId, typeId) {
 return (db.data.contract_docs || []).find(d => d && !d.voided && Number(d.resident_id) === Number(resId) && Number(d.type_id) === Number(typeId)) || null;
}
// 状態: none（未登録）/ overdue（更新日を過ぎた）/ soon（30日以内）/ ok
function cpContractState(rec) {
 if (!rec) return { key: "none", text: "未登録" };
 if (rec.renewal_due) {
  const days = cpDaysUntil(rec.renewal_due);
  if (days !== null && days < 0) return { key: "overdue", text: "更新日を過ぎています" };
  if (days !== null && days <= CP_CONTRACT_SOON_DAYS) return { key: "soon", text: `まもなく更新（あと${days}日）` };
 }
 return { key: "ok", text: "登録済み" };
}
function cpContractProblems(r) {
 return cpContractTypes().map(t => ({ t: t, rec: cpContractRecord(r.id, t.id) }))
  .map(x => Object.assign(x, { st: cpContractState(x.rec) }))
  .filter(x => x.st.key !== "ok");
}
function cpContractMissingBadge(r) {
 const n = cpContractProblems(r).filter(x => x.st.key === "none" || x.st.key === "overdue").length;
 return n ? `<span class="contract-badge is-alert">確認が必要 ${n}件</span>` : "";
}
function cpContractSectionHtml(r) {
 const can = cpCanEditContracts() && !cpIsDischarged(r);
 const rows = cpContractTypes().map(t => {
  const rec = cpContractRecord(r.id, t.id);
  const st = cpContractState(rec);
  return `<tr>
   <td>${escapeHtml(t.name)}</td>
   <td>${rec ? escapeHtml(rec.signed_date) : "-"}</td>
   <td>${rec && rec.renewal_due ? escapeHtml(rec.renewal_due) : (t.renewal ? "-" : "（更新なし）")}</td>
   <td><span class="contract-state is-${st.key}">${escapeHtml(st.text)}</span></td>
   <td>${can ? `<button type="button" class="tool-link" onclick="openContractDocModal(${Number(r.id)}, ${Number(t.id)})">${rec ? "訂正・更新" : "登録"}</button>${rec ? ` <button type="button" class="tool-link" onclick="voidContractDoc(${Number(rec.id)})">取消</button>` : ""}` : ""}</td>
  </tr>`;
 }).join("");
 return `<div class="contract-box">
  <div class="contract-head"><strong>契約・同意書類</strong><span>${cpCanEditContracts() ? "登録・訂正は管理者・事務員" : "登録・訂正は管理者・事務員が行います"}</span></div>
  <div class="contract-scroll"><table class="data-table contract-table">
   <thead><tr><th>書類</th><th>交わした日</th><th>次の更新日</th><th>状態</th><th></th></tr></thead>
   <tbody>${rows}</tbody>
  </table></div>
  <p class="contract-note">書類の画像は下の「重要書類(同意書)」に保管します。</p>
 </div>`;
}
let cpContractEdit = null;
function openContractDocModal(resId, typeId) {
 if (!cpCanEditContracts()) { alert("契約・同意書類の登録・訂正は、管理者・事務員だけができます。"); return; }
 const r = (gState.residents || []).find(x => Number(x.id) === Number(resId));
 const t = cpContractTypes().find(x => Number(x.id) === Number(typeId));
 if (!r || !t) return;
 const rec = cpContractRecord(resId, typeId);
 cpContractEdit = { resId: r.id, typeId: t.id, recId: rec ? rec.id : null };
 const set = (id, v) => { const e = document.getElementById(id); if (e) e.value = v; };
 document.getElementById("contractDocTitle").textContent = `${r.room_no}号室 ${r.name} 様：${t.name}`;
 set("contractSignedDate", rec ? rec.signed_date : "");
 set("contractRenewalDue", rec && rec.renewal_due ? rec.renewal_due : "");
 set("contractNote", rec && rec.note ? rec.note : "");
 set("contractEditReason", "");
 const sd = document.getElementById("contractSignedDate"); if (sd) sd.max = toLocalDateStr(new Date());
 document.getElementById("contractReasonRow").style.display = rec ? "" : "none";
 document.getElementById("contractRenewalRow").style.display = (t.renewal || (rec && rec.renewal_due)) ? "" : "none";
 openModal("contractDocModal");
}
function submitContractDoc() {
 if (!cpContractEdit) return;
 if (!cpCanEditContracts()) { alert("契約・同意書類の登録・訂正は、管理者・事務員だけができます。"); return; }
 const val = id => ((document.getElementById(id) || {}).value || "").trim();
 const signed = val("contractSignedDate"), due = val("contractRenewalDue"), note = val("contractNote"), reason = val("contractEditReason");
 if (!/^\d{4}-\d{2}-\d{2}$/.test(signed)) { alert("交わした日（契約・説明・同意した日）を入れてください。"); return; }
 if (signed > toLocalDateStr(new Date())) { alert("交わした日に、これから先の日付は入れられません。"); return; }
 if (due && due <= signed) { alert("次の更新日は、交わした日より後の日付にしてください。"); return; }
 const t = cpContractTypes().find(x => Number(x.id) === Number(cpContractEdit.typeId));
 if (!Array.isArray(db.data.contract_docs)) db.data.contract_docs = [];
 const now = toLocalDateTimeStr(new Date()), who = cpLoginStaffName();
 const rec = cpContractEdit.recId ? db.data.contract_docs.find(d => Number(d.id) === Number(cpContractEdit.recId)) : null;
 if (rec) {
  if (rec.signed_date === signed && (rec.renewal_due || "") === due && (rec.note || "") === note) { closeModal("contractDocModal"); return; }
  if (!reason) { alert("訂正・更新の理由を入れてください（例: 契約を更新した、日付の入れ間違い）。"); return; }
  const old = JSON.parse(JSON.stringify(rec));
  rec.signed_date = signed; rec.renewal_due = due; rec.note = note;
  rec.updated_at = now; rec.updated_by = who;
  cpAppendEditHistory(rec, old, ["signed_date", "renewal_due", "note"]);
  if (rec.edit_history && rec.edit_history.length) rec.edit_history[rec.edit_history.length - 1].reason = reason;
 } else {
  db.data.contract_docs.push({ id: Date.now(), resident_id: Number(cpContractEdit.resId), type_id: Number(cpContractEdit.typeId), type_name: t ? t.name : "",
   signed_date: signed, renewal_due: due, note: note, recorded_at: now, recorded_by: who });
 }
 db.save();
 closeModal("contractDocModal");
 cpContractRefresh();
}
function voidContractDoc(id) {
 if (!cpCanEditContracts()) { alert("契約・同意書類の取消は、管理者・事務員だけができます。"); return; }
 const rec = (db.data.contract_docs || []).find(d => Number(d.id) === Number(id));
 if (!rec) return;
 if (!cpVoidRecord(rec, "", `「${rec.type_name}」（交わした日 ${rec.signed_date}）の記録を取消にします。\n記録は消えずに、取消済みとして残ります。\n\n取消の理由を入れてください（例: 別の方の書類と間違えた）`)) return;
 db.save();
 cpContractRefresh();
}
function cpContractRefresh() {
 if (typeof renderResidentDetail === "function") renderResidentDetail();
 if (gState.activePortal === "office" && gState.activeOfficeTab === "contracts") renderOfficeContracts();
}
// 事務: 誰のどの書類がそろっていないか
function renderOfficeContracts() {
 const area = document.getElementById("officeContractsArea");
 if (!area) return;
 const onlyMissing = !!(document.getElementById("contractOnlyMissing") || {}).checked;
 const types = cpContractTypes();
 const res = cpCurrentResidents().slice().sort((x, y) => String(x.room_no).localeCompare(String(y.room_no), "ja", { numeric: true }));
 let missingPeople = 0, missingDocs = 0, soonDocs = 0;
 const rows = res.map(r => {
  let rowMissing = false;
  const cells = types.map(t => {
   const rec = cpContractRecord(r.id, t.id);
   const st = cpContractState(rec);
   if (st.key === "none" || st.key === "overdue") { rowMissing = true; missingDocs++; }
   if (st.key === "soon") soonDocs++;
   const txt = rec ? `${escapeHtml(rec.signed_date)}${rec.renewal_due ? `<br><small>更新 ${escapeHtml(rec.renewal_due)}</small>` : ""}` : "";
   return `<td class="contract-cell is-${st.key}">${txt}<div class="contract-state is-${st.key}">${escapeHtml(st.text)}</div></td>`;
  }).join("");
  if (rowMissing) missingPeople++;
  if (onlyMissing && !rowMissing) return "";
  return `<tr><td>${escapeHtml(r.room_no)}</td><td><button type="button" class="tool-link" onclick="cpOpenResidentFromOffice(${Number(r.id)})">${escapeHtml(r.name)} 様</button></td>${cells}</tr>`;
 }).join("");
 const canEdit = cpCanEditContracts();
 area.innerHTML = `
  <div class="contract-summary">
   <span class="${missingPeople ? "is-alert" : ""}">確認が必要な方 <strong>${missingPeople}名</strong>（未登録・更新日を過ぎた書類 ${missingDocs}件）</span>
   <span>まもなく更新 ${soonDocs}件（${CP_CONTRACT_SOON_DAYS}日以内）</span>
  </div>
  <div class="contract-scroll"><table class="data-table contract-table">
   <thead><tr><th>部屋</th><th>利用者</th>${types.map(t => `<th>${escapeHtml(t.name)}</th>`).join("")}</tr></thead>
   <tbody>${rows || `<tr><td colspan="${types.length + 2}" class="billing-empty">${onlyMissing ? "確認が必要な方はいません。" : "在所の利用者がいません。"}</td></tr>`}</tbody>
  </table></div>
  <p class="contract-note">日付の登録・訂正は、利用者の名前を押してカルテの「契約・同意書類」から行います。退所した方は一覧に出しません。</p>
  <details class="contract-types"${canEdit ? "" : " hidden"}>
   <summary>書類の種類を設定する（管理者・事務員）</summary>
   <table class="data-table contract-table">
    <thead><tr><th>書類の名前</th><th>更新がある</th><th>記録の件数</th><th></th></tr></thead>
    <tbody>${types.map(t => {
     const used = (db.data.contract_docs || []).filter(d => !d.voided && Number(d.type_id) === Number(t.id)).length;
     return `<tr><td>${escapeHtml(t.name)}</td><td><input type="checkbox" ${t.renewal ? "checked" : ""} onchange="cpContractTypeRenewal(${Number(t.id)}, this.checked)" aria-label="${escapeHtml(t.name)}の更新"></td><td>${used}件</td>
      <td><button type="button" class="tool-link" onclick="cpContractTypeRename(${Number(t.id)})">名前を変える</button> <button type="button" class="tool-link" onclick="cpContractTypeDelete(${Number(t.id)})">削除</button></td></tr>`;
    }).join("")}</tbody>
   </table>
   <button type="button" class="btn btn-secondary" onclick="cpContractTypeAdd()">書類の種類を追加</button>
  </details>`;
}
function cpOpenResidentFromOffice(resId) {
 if (typeof enterPortal === "function") enterPortal("care");
 if (typeof selectResident === "function") selectResident(resId);
}
function cpContractTypeLog(action, detail) {
 if (!Array.isArray(db.data.settings_logs)) db.data.settings_logs = [];
 db.data.settings_logs.push({ id: Date.now() + Math.floor(Math.random() * 1000), at: toLocalDateTimeStr(new Date()), by: cpLoginStaffName(), kind: "契約・同意書類の種類", action: action, detail: detail });
}
function cpContractTypeAdd() {
 if (!cpCanEditContracts()) { alert("書類の種類の設定は、管理者・事務員だけができます。"); return; }
 const name = (prompt("追加する書類の名前を入れてください（例: 看取りに関する指針の同意書）", "") || "").trim();
 if (!name) return;
 const list = cpContractTypesMaterialize();
 if (list.some(t => !t.deleted && t.name === name)) { alert("同じ名前の書類がすでにあります。"); return; }
 const id = list.reduce((m, t) => Math.max(m, Number(t.id) || 0), 0) + 1;
 list.push({ id: id, name: name, renewal: false, order: list.reduce((m, t) => Math.max(m, t.order || 0), 0) + 1 });
 cpContractTypeLog("追加", name);
 db.save(); renderOfficeContracts();
}
function cpContractTypeRename(id) {
 if (!cpCanEditContracts()) { alert("書類の種類の設定は、管理者・事務員だけができます。"); return; }
 const list = cpContractTypesMaterialize();
 const t = list.find(x => Number(x.id) === Number(id)); if (!t) return;
 const name = (prompt("新しい名前を入れてください", t.name) || "").trim();
 if (!name || name === t.name) return;
 if (list.some(x => !x.deleted && x.name === name)) { alert("同じ名前の書類がすでにあります。"); return; }
 cpContractTypeLog("名前の変更", `${t.name} → ${name}`);
 t.name = name;
 (db.data.contract_docs || []).forEach(d => { if (Number(d.type_id) === Number(id)) d.type_name = name; });
 db.save(); renderOfficeContracts();
}
function cpContractTypeRenewal(id, on) {
 if (!cpCanEditContracts()) { alert("書類の種類の設定は、管理者・事務員だけができます。"); renderOfficeContracts(); return; }
 const t = cpContractTypesMaterialize().find(x => Number(x.id) === Number(id)); if (!t) return;
 t.renewal = !!on;
 cpContractTypeLog("更新の有無", `${t.name}: ${on ? "更新あり" : "更新なし"}`);
 db.save(); renderOfficeContracts();
}
function cpContractTypeDelete(id) {
 if (!cpCanEditContracts()) { alert("書類の種類の設定は、管理者・事務員だけができます。"); return; }
 const t = cpContractTypesMaterialize().find(x => Number(x.id) === Number(id)); if (!t) return;
 const used = (db.data.contract_docs || []).filter(d => !d.voided && Number(d.type_id) === Number(id)).length;
 if (used) { alert(`「${t.name}」は ${used}件 の記録で使われているため削除できません。\n使わなくなった場合は、名前を変えるか、記録を取消にしてから削除してください。`); return; }
 if (!confirm(`書類の種類「${t.name}」を削除します。よろしいですか？`)) return;
 t.deleted = true;
 cpContractTypeLog("削除", t.name);
 db.save(); renderOfficeContracts();
}

// 預かり金出納帳 (利用者切り替え・日付連動・履歴絞り込み)
let gDepositFilterMode = "resident"; // "resident" (選択中利用者のみ) or "all" (全利用者)

function onDepositResidentChange() {
 const sel = document.getElementById("depResidentSelect");
 if (sel) {
 gState.selectedResidentId = parseInt(sel.value, 10);
 renderOfficeDepositTable();
 }
}

function toggleDepositFilter() {
 gDepositFilterMode = gDepositFilterMode === "resident" ? "all" : "resident";
 renderOfficeDepositTable();
}

function renderOfficeDepositTable() {
 const sel = document.getElementById("depResidentSelect");
 if (!sel) return;

 // セレクトボックスの選択肢構築
 const currentVal = parseInt(sel.value, 10) || gState.selectedResidentId;
 sel.innerHTML = "";
 gState.residents.forEach(r => {
 const opt = document.createElement("option");
 opt.value = r.id;
 opt.textContent = `${r.room_no}号室 ${r.name} 様`;
 if (r.id === currentVal) opt.selected = true;
 sel.appendChild(opt);
 });

 // 日付の初期セット (選択中の日付に連動)
 const dateInput = document.getElementById("depDate");
 if (dateInput && !dateInput.value) {
 dateInput.value = gState.selectedDate || toLocalDateStr(new Date());
 }

 // 選択中の利用者情報と残高サマリー更新
 const activeResidentId = parseInt(sel.value, 10) || gState.selectedResidentId;
 const activeRes = gState.residents.find(x => x.id === activeResidentId);

 const nameEl = document.getElementById("depResidentName");
 const balEl = document.getElementById("depResidentBalance");
 const badgeEl = document.getElementById("depFilterStatusBadge");
 const btnEl = document.getElementById("depFilterToggleBtn");

 if (activeRes) {
 if (nameEl) nameEl.textContent = `【${activeRes.room_no}号室 ${activeRes.name} 様】`;
 if (balEl) balEl.textContent = `¥${(activeRes.deposit_balance || 0).toLocaleString()}`;
 }

 if (btnEl && badgeEl) {
 if (gDepositFilterMode === "resident") {
 btnEl.textContent = "全利用者の履歴を表示";
 badgeEl.textContent = "この利用者の出納を表示中";
 badgeEl.style.background = "#dcebe3";
 badgeEl.style.color = "#1a4f3d";
 } else {
 btnEl.textContent = "この利用者のみに絞り込む";
 badgeEl.textContent = "全利用者の出納を表示中";
 badgeEl.style.background = "#eef2ef";
 badgeEl.style.color = "#4a5852";
 }
 }

 // 出納履歴の描画 (絞り込み)
 const tbody = document.querySelector("#depositTable tbody");
 if (!tbody) return;
 tbody.innerHTML = "";

 const allDeposits = db.data.deposits || [];
 const targetDeposits = gDepositFilterMode === "resident"
 ? allDeposits.filter(d => d.resident_id === activeResidentId)
 : allDeposits;

 if (targetDeposits.length === 0) {
 tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-muted); padding:16px;">出納記録はありません。</td></tr>`;
 return;
 }

 targetDeposits.forEach(d => {
 const res = gState.residents.find(x => x.id === d.resident_id);
 const tr = document.createElement("tr");
 const dType = d.type || d.transaction_type || '入金';
 const dCat = d.category || d.reason || 'お小遣い';
 const dAmount = typeof d.amount === 'number' ? d.amount : 0;
 const dBal = typeof d.balance === 'number' ? d.balance : (typeof d.balance_after === 'number' ? d.balance_after : 0);

 tr.innerHTML = `
 <td>${escapeHtml(d.date || '')}</td>
 <td><strong>${res ? escapeHtml(res.name) : ''} 様</strong></td>
 <td><span style="font-weight:bold; ${dType==='出金'?'color:#dc2626;':'color:#16a34a;'}">${escapeHtml(dType)}</span></td>
 <td>${escapeHtml(dCat)}</td>
 <td>¥${dAmount.toLocaleString()}</td>
 <td><strong>¥${dBal.toLocaleString()}</strong></td>
 <td>${escapeHtml(d.notes || d.reason || '-')}</td>
 <td>${escapeHtml(d.staff_name || '未設定')}</td>
 `;
 tbody.appendChild(tr);
 });
}

function submitDeposit() {
 const resId = parseInt(document.getElementById("depResidentSelect").value, 10);
 const dateInput = document.getElementById("depDate");
 const depDate = (dateInput && dateInput.value) ? dateInput.value : toLocalDateStr(new Date());
 const type = document.getElementById("depType").value;
 const category = document.getElementById("depCategory").value;
 const amount = parseInt(document.getElementById("depAmount").value, 10);
 const notes = document.getElementById("depNotes").value;
 const staff = document.getElementById("currentStaff").value;
 const r = gState.residents.find(x => x.id === resId);

 if (!amount || amount <= 0 || !r) {
 alert("金額を正しく入力してください。");
 return;
 }

 const currentBal = r.deposit_balance || 0;
 const newBal = type === "入金" ? (currentBal + amount) : (currentBal - amount);
 r.deposit_balance = newBal;

 db.data.deposits.unshift({
 id: Date.now(),
 date: depDate,
 resident_id: resId,
 type: type,
 category: category,
 amount: amount,
 balance: newBal,
 notes: notes,
 staff_name: staff
 });
 db.save();

 document.getElementById("depAmount").value = "";
 document.getElementById("depNotes").value = "";
 renderOfficeDepositTable();
 alert("預かり金出納を記録しました！");
}

// 苦情受付簿
function renderOfficeComplaints() {
 const tbody = document.querySelector("#complaintsTable tbody");
 tbody.innerHTML = "";
 (db.data.complaints || []).forEach(c => {
 const res = gState.residents.find(x => x.id === c.resident_id);
 const tr = document.createElement("tr");
 tr.innerHTML = `
 <td>${c.received_at}</td>
 <td><strong>${c.claimant}</strong></td>
 <td>${res ? res.name + ' 様' : '全体'}</td>
 <td>${c.content}</td>
 <td>${c.investigation || '-'}</td>
 <td>${c.improvement_plan || '-'}</td>
 <td>${c.reported_at || '-'}</td>
 <td><span style="font-weight:bold; color:#d97706;">${c.status}</span></td>
 `;
 tbody.appendChild(tr);
 });
}

function openComplaintModal() {
 const resSel = document.getElementById("compResidentSelect");
 resSel.innerHTML = '<option value="">全体（対象者特定なし）</option>';
 gState.residents.forEach(r => {
 const opt = document.createElement("option");
 opt.value = r.id;
 opt.textContent = `${r.room_no}号室 ${r.name} 様`;
 resSel.appendChild(opt);
 });
 document.getElementById("complaintModal").style.display = "flex";
}

function submitComplaint() {
 const claimant = document.getElementById("compClaimant").value.trim();
 const resId = document.getElementById("compResidentSelect").value || null;
 const content = document.getElementById("compContent").value.trim();
 const investigation = document.getElementById("compInvestigation").value.trim();
 const improvement = document.getElementById("compImprovement").value.trim();
 const staff = document.getElementById("currentStaff").value;

 if (!claimant || !content) {
 alert("申出者と苦情内容を入力してください。");
 return;
 }

 db.data.complaints.unshift({
 id: Date.now(), received_at: toLocalDateStr(new Date()), claimant: claimant,
 resident_id: resId ? parseInt(resId) : null, content: content, investigation: investigation,
 improvement_plan: improvement, reported_at: "", status: "対応中", staff_name: staff
 });
 db.save();

 closeModal("complaintModal");
 loadOfficeData();
 alert("苦情・ご要望を受付台帳に登録しました！");
}

// 事故・ヒヤリハット

function openNewIncidentModal() {
	try {
		const incId = document.getElementById("incId");
		if (incId) incId.value = "";
		const incType = document.getElementById("incType");
		if (incType) incType.value = "ヒヤリハット";
		const incPlace = document.getElementById("incPlace");
		if (incPlace) incPlace.value = "";
		const now = new Date();
		const nowIsoStr = typeof toLocalDateTimeStr === "function"
			? toLocalDateTimeStr(now).slice(0, 16).replace(" ", "T")
			: now.toISOString().slice(0, 16);
		const incOccurredAt = document.getElementById("incOccurredAt");
		if (incOccurredAt) incOccurredAt.value = nowIsoStr;
		const incSit = document.getElementById("incSituation");
		if (incSit) incSit.value = "";
		const incCause = document.getElementById("incCause");
		if (incCause) incCause.value = "";
		const incPrev = document.getElementById("incPrevention");
		if (incPrev) incPrev.value = "";
		const incSup = document.getElementById("incSupervisor");
		if (incSup) incSup.value = "";
		gState.currentIncidentInjuryPins = [];
		if (typeof updateIncidentPinsSummaryUI === "function") updateIncidentPinsSummaryUI();

		const sel = document.getElementById("incResidentSelect");
		if (sel) {
			sel.innerHTML = "";
			cpCurrentResidents().forEach(r => {
				const opt = document.createElement("option");
				opt.value = r.id;
				opt.textContent = `${r.room_no}号室 ${r.name} 様`;
				if (gState.selectedResidentId && r.id === gState.selectedResidentId) opt.selected = true;
				sel.appendChild(opt);
			});
		}
		const modal = document.getElementById("incidentModal");
		if (modal) modal.style.display = "flex";
	} catch (e) {
		console.error("openNewIncidentModal error:", e);
	}
}

function deleteIncident(id) {
	// [Claude修正] 事故・ヒヤリハット報告書は記録として残すため、削除せず取消にする
	cpVoidLedgerRecord('incidents', id);
}

function renderOfficeIncidents() {
	const tbodies = document.querySelectorAll("#incidentsTable tbody, #careIncidentsTable tbody");
	if (!tbodies || tbodies.length === 0) return;
	const list = db.data.incidents || [];

	tbodies.forEach(tbody => {
		tbody.innerHTML = "";
		if (list.length === 0) {
			tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:var(--text-muted); padding:16px;">事故・ヒヤリハット報告はありません。</td></tr>`;
			return;
		}

		cpLedgerOrder(list).forEach(inc => {
			const res = (gState.residents || []).find(x => x.id === inc.resident_id);
			const timeDisplay = inc.occurred_at || inc.date || '-';
			const repType = inc.report_type || inc.level || 'ヒヤリハット';
			const situ = inc.situation || '-';
			const prev = inc.prevention || inc.countermeasure || '-';
			const supervisor = inc.supervisor_comment || inc.factor || '-';
			const st = inc.status || '報告済';
			const pinsCount = (inc.injury_pins && Array.isArray(inc.injury_pins)) ? inc.injury_pins.length : 0;
			const pinBadge = pinsCount > 0 ? `<span class="badge" style="background:#fee2e2; color:#991b1b; font-size:10.5px; padding:2px 6px; margin-left:4px; font-weight:bold;">外傷ピン ${pinsCount}件</span>` : '';

			const tr = document.createElement("tr");
			tr.innerHTML = `
				<td>${escapeHtml(timeDisplay)}</td>
				<td><span class="badge" style="background:#fee2e2; color:#991b1b;">${escapeHtml(repType)}</span>${pinBadge}</td>
				<td><strong>${res ? escapeHtml(res.name) + ' 様' : escapeHtml(inc.resident_name || '')}</strong></td>
				<td>${escapeHtml(inc.place || '居室')}</td>
				<td>${escapeHtml(situ)}</td>
				<td>${escapeHtml(prev)}</td>
				<td>${escapeHtml(supervisor)}</td>
				<td><span class="badge" style="background:#dcebe3; color:#1e5b47;">${escapeHtml(st)}</span></td>
				<td style="white-space:nowrap; text-align:center;">
					${cpLedgerActions('incidents', inc, 'editIncident').replace('訂正', '修正・追記')}
					<button class="btn btn-secondary" style="padding:3px 8px; font-size:11.5px; margin-left:3px; background:#f6f8f6; border:1px solid #cdd6d0;" onclick="printIncidentReport(${inc.id})">印刷</button>
				</td>
			`;
			if (inc.voided) cpMarkVoidedRow(tr);
			tbody.appendChild(tr);
		});
	});
}


function updateIncidentPinsSummaryUI() {
	const summaryEl = document.getElementById("incInjuryPinsSummary");
	if (!summaryEl) return;
	const pins = gState.currentIncidentInjuryPins || [];
	if (pins.length === 0) {
		summaryEl.innerHTML = `現在、登録されている負傷ピンはありません（必要な場合は上のボタンから受傷部位をピン留めできます）`;
		return;
	}
	let html = "";
	pins.forEach((p, idx) => {
		html += `
			<span style="display:inline-flex; align-items:center; gap:4px; background:#fef2f2; border:1px solid #fecaca; color:#991b1b; padding:2px 8px; border-radius:12px; font-size:11.5px; font-weight:bold;">
				<span style="background:#dc2626; color:#ffffff; border-radius:50%; width:16px; height:16px; display:inline-flex; align-items:center; justify-content:center; font-size:10px;">${idx + 1}</span>
				${escapeHtml(p.site_name || '部位')}: ${escapeHtml(p.injury_type || '外傷')} (${escapeHtml(p.treatment || '処置')})
			</span>
		`;
	});
	summaryEl.innerHTML = html;
}

function openIncidentFromRecord() {
	// [Claude修正 2026-10-16] 経過記録の「あったこと」欄から作る
	const contentArea = cpRecordArea();
	const content = contentArea ? contentArea.value : "";
	const resId = gState.selectedResidentId;
	const now = new Date();
	const nowStr = toLocalDateTimeStr(now).replace(" ", "T");

	document.getElementById("incId").value = "";
	// [Claude修正] 前回開いた報告書の種別・場所が残っていたため初期化する
	document.getElementById("incType").value = "ヒヤリハット";
	document.getElementById("incPlace").value = "";
	document.getElementById("incOccurredAt").value = nowStr;
	document.getElementById("incSituation").value = content;
	document.getElementById("incCause").value = "";
	document.getElementById("incPrevention").value = "";
	document.getElementById("incSupervisor").value = "";
	gState.currentIncidentInjuryPins = [];
	updateIncidentPinsSummaryUI();

	const sel = document.getElementById("incResidentSelect");
	sel.innerHTML = "";
	cpCurrentResidents().forEach(r => {
		const opt = document.createElement("option");
		opt.value = r.id;
		opt.textContent = `${r.room_no}号室 ${r.name} 様`;
		if (r.id === resId) opt.selected = true;
		sel.appendChild(opt);
	});
	document.getElementById("incidentModal").style.display = "flex";
}

function editIncident(id) {
	const inc = db.data.incidents.find(x => x.id === id);
	if (!inc) return;

	document.getElementById("incId").value = inc.id;
	document.getElementById("incType").value = inc.report_type || inc.level || "ヒヤリハット";
	const occTime = inc.occurred_at || (inc.date ? `${inc.date}T09:00` : "");
	document.getElementById("incOccurredAt").value = occTime.replace(" ", "T");
	document.getElementById("incPlace").value = inc.place || "居室";
	document.getElementById("incSituation").value = inc.situation || "";
	document.getElementById("incCause").value = inc.cause || inc.factor || "";
	document.getElementById("incPrevention").value = inc.prevention || inc.countermeasure || "";
	document.getElementById("incSupervisor").value = inc.supervisor_comment || "";

	// 負傷ピンの読み込み
	gState.currentIncidentInjuryPins = (inc.injury_pins && Array.isArray(inc.injury_pins))
		? JSON.parse(JSON.stringify(inc.injury_pins))
		: [];
	updateIncidentPinsSummaryUI();

	const sel = document.getElementById("incResidentSelect");
	sel.innerHTML = "";
	gState.residents.forEach(r => {
		const opt = document.createElement("option");
		opt.value = r.id;
		opt.textContent = `${r.room_no}号室 ${r.name} 様`;
		if (r.id === inc.resident_id) opt.selected = true;
		sel.appendChild(opt);
	});
	document.getElementById("incidentModal").style.display = "flex";
}

function saveIncidentReport() {
	const id = document.getElementById("incId").value;
	const type = document.getElementById("incType").value;
	const occurredAt = document.getElementById("incOccurredAt").value.replace("T", " ");
	const resSelectVal = document.getElementById("incResidentSelect").value;
	const resId = resSelectVal ? parseInt(resSelectVal, 10) : null;
	const place = document.getElementById("incPlace").value;
	const situation = document.getElementById("incSituation").value.trim();
	const cause = document.getElementById("incCause").value;
	const prevention = document.getElementById("incPrevention").value;
	const supervisor = document.getElementById("incSupervisor").value;
	const staff = document.getElementById("currentStaff")?.value || "担当職員";
	const injuryPins = gState.currentIncidentInjuryPins || [];

	if (!situation) {
		alert("事故・ヒヤリハットの発生状況を入力してください。");
		return;
	}

	if (!Array.isArray(db.data.incidents)) db.data.incidents = [];

	if (id) {
		const inc = db.data.incidents.find(x => x.id === parseInt(id));
		if (inc) {
			const cpOld = JSON.parse(JSON.stringify(inc)); // [Claude修正] 訂正前の内容を履歴に残す
			inc.report_type = type; inc.occurred_at = occurredAt; inc.resident_id = resId;
			inc.place = place; inc.situation = situation; inc.cause = cause;
			inc.prevention = prevention; inc.supervisor_comment = supervisor;
			inc.injury_pins = injuryPins;
			cpAppendEditHistory(inc, cpOld, ["report_type", "occurred_at", "resident_id", "place", "situation", "cause", "prevention", "supervisor_comment", "injury_pins"]);
		}
	} else {
		db.data.incidents.unshift({
			id: Date.now(), report_type: type, occurred_at: occurredAt, resident_id: resId,
			place: place, situation: situation, cause: cause, prevention: prevention,
			supervisor_comment: supervisor, status: "作成済", staff_name: staff,
			injury_pins: injuryPins
		});
	}

	db.save();
	closeModal("incidentModal");
	renderOfficeIncidents();
	if (gState.activePortal === "office") loadOfficeData();
	alert("報告書を保存しました！");
}

// =====================================================================
// 事故・ヒヤリハット 受傷部位シェーマ図ロジック (事故専用外傷ピン)
// =====================================================================

function openIncidentInjurySchemaModal() {
	const resSelectVal = document.getElementById("incResidentSelect")?.value;
	const resId = resSelectVal ? Number(resSelectVal) : Number(gState.selectedResidentId);
	const r = (gState.residents || []).find(x => Number(x.id) === resId);

	const badge = document.getElementById("incInjuryResidentBadge");
	if (badge) badge.textContent = r ? `${r.room_no}号室 ${r.name} 様 (${r.care_level})` : "利用者情報";

	if (!Array.isArray(gState.currentIncidentInjuryPins)) {
		gState.currentIncidentInjuryPins = [];
	}

	resetIncidentInjuryForm();
	renderIncidentInjuryPins();
	openModal("incidentInjurySchemaModal");
}

function handleIncidentInjuryImageClick(e) {
	const wrapper = document.getElementById("incInjuryImageWrapper");
	if (!wrapper) return;
	const rect = wrapper.getBoundingClientRect();
	const x = e.clientX - rect.left;
	const y = e.clientY - rect.top;

	const xPct = Math.max(0, Math.min(100, Math.round((x / rect.width) * 1000) / 10));
	const yPct = Math.max(0, Math.min(100, Math.round((y / rect.height) * 1000) / 10));

	document.getElementById("incInjuryXPct").value = xPct;
	document.getElementById("incInjuryYPct").value = yPct;

	const coordsBadge = document.getElementById("incInjuryCoordsBadge");
	if (coordsBadge) coordsBadge.textContent = `(位置: X:${xPct}%, Y:${yPct}%)`;

	// 仮ピンのハイライト表示
	const overlay = document.getElementById("incInjuryPinsOverlay");
	if (overlay) {
		const tempPin = document.getElementById("incInjuryTempPin");
		if (tempPin) tempPin.remove();
		const div = document.createElement("div");
		div.id = "incInjuryTempPin";
		div.style.cssText = `position:absolute; left:${xPct}%; top:${yPct}%; width:24px; height:24px; margin-left:-12px; margin-top:-12px; border-radius:50%; background:#dc2626; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:12px; border:2px solid #fff; box-shadow:0 0 8px rgba(220,38,38,0.8); z-index:30; pointer-events:none;`;
		div.textContent = "＋";
		overlay.appendChild(div);
	}
}

function renderIncidentInjuryPins() {
	const overlay = document.getElementById("incInjuryPinsOverlay");
	const tableContainer = document.getElementById("incInjuryPinsTableContainer");
	const countTitle = document.getElementById("incInjuryPinsCountTitle");
	if (!overlay || !tableContainer) return;

	const pins = gState.currentIncidentInjuryPins || [];
	pins.forEach((p, idx) => { p.pin_no = idx + 1; });

	if (countTitle) countTitle.textContent = `登録中の受傷ピン (${pins.length}件)`;

	const activeEditId = Number(document.getElementById("incInjuryEditPinId")?.value || 0);

	let pinsHtml = "";
	pins.forEach(p => {
		const isSelected = activeEditId === Number(p.id);
		const style = isSelected
			? "background:#ffffff; color:#dc2626; border:2px solid #dc2626; transform:scale(1.25); z-index:25; box-shadow:0 0 8px rgba(220,38,38,0.9);"
			: "background:#dc2626; color:#ffffff; border:2px solid #ffffff; z-index:10; box-shadow:0 2px 5px rgba(0,0,0,0.6);";

		pinsHtml += `
			<div style="position:absolute; left:${p.x_pct}%; top:${p.y_pct}%; width:26px; height:26px; margin-left:-13px; margin-top:-13px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:13px; cursor:pointer; pointer-events:auto; user-select:none; transition:transform 0.15s ease; ${style}"
				title="[${p.pin_no}] ${escapeHtml(p.site_name)}: ${escapeHtml(p.injury_type)} (${escapeHtml(p.treatment || '-')})"
				onclick="event.stopPropagation(); editIncidentInjuryPin(${p.id});">
				${p.pin_no}
			</div>
		`;
	});
	overlay.innerHTML = pinsHtml;

	if (pins.length === 0) {
		tableContainer.innerHTML = `
			<div style="text-align:center; padding:20px 10px; color:#5f6d66; font-size:12px;">
				登録されている受傷ピンはありません。<br>
				左の人体図（正面・背面）をクリックして位置を指定してください。
			</div>
		`;
		return;
	}

	let tableHtml = `
		<table class="table" style="width:100%; font-size:12px; margin-bottom:0; border-collapse:collapse;">
			<thead>
				<tr style="background:#fee2e2; color:#991b1b; border-bottom:2px solid #fca5a5;">
					<th style="padding:6px 8px; width:40px; text-align:center;">番号</th>
					<th style="padding:6px 8px; width:85px;">部位</th>
					<th style="padding:6px 8px;">外傷種別・処置</th>
					<th style="padding:6px 8px; width:80px;">程度</th>
					<th style="padding:6px 8px; width:85px; text-align:center;">操作</th>
				</tr>
			</thead>
			<tbody>
	`;

	pins.forEach(p => {
		const isSelected = activeEditId === Number(p.id);
		tableHtml += `
			<tr style="border-bottom:1px solid #dfe5e1; ${isSelected ? 'background:#fef2f2;' : ''}">
				<td style="padding:6px 8px; text-align:center;">
					<span style="display:inline-block; width:20px; height:20px; line-height:20px; border-radius:50%; background:#dc2626; color:#ffffff; font-weight:bold; font-size:11.5px; text-align:center;">
						${p.pin_no}
					</span>
				</td>
				<td style="padding:6px 8px;"><strong>${escapeHtml(p.site_name || '-')}</strong></td>
				<td style="padding:6px 8px;">
					<div style="font-weight:bold; color:#1c2622;">${escapeHtml(p.injury_type || '-')}</div>
					<div style="font-size:11px; color:#4a5852;">処置: ${escapeHtml(p.treatment || '-')}</div>
				</td>
				<td style="padding:6px 8px; font-size:11px; color:#5f6d66;">${escapeHtml(p.severity || '-')}</td>
				<td style="padding:6px 8px; text-align:center; white-space:nowrap;">
					<button type="button" class="btn btn-secondary" style="font-size:11px; padding:2px 6px;" onclick="editIncidentInjuryPin(${p.id})">訂正</button>
					<button type="button" class="btn btn-danger" style="font-size:11px; padding:2px 6px; margin-left:3px;" onclick="deleteIncidentInjuryPin(${p.id})">削除</button>
				</td>
			</tr>
		`;
	});

	tableHtml += `</tbody></table>`;
	tableContainer.innerHTML = tableHtml;
}

function resetIncidentInjuryForm() {
	document.getElementById("incInjuryEditPinId").value = "";
	document.getElementById("incInjuryXPct").value = "50";
	document.getElementById("incInjuryYPct").value = "50";
	document.getElementById("incInjurySiteName").value = "";
	document.getElementById("incInjuryType").value = ""; // [Claude修正] 選ばずに「擦過傷・軽微」で登録されないように
	document.getElementById("incInjurySeverity").value = "";
	document.getElementById("incInjuryTreatment").value = "";
	document.getElementById("incInjuryNotes").value = "";
	const badge = document.getElementById("incInjuryCoordsBadge");
	if (badge) badge.textContent = "";
	const tempPin = document.getElementById("incInjuryTempPin");
	if (tempPin) tempPin.remove();
}

function editIncidentInjuryPin(pinId) {
	const pins = gState.currentIncidentInjuryPins || [];
	const p = pins.find(x => x.id === Number(pinId));
	if (!p) return;

	document.getElementById("incInjuryEditPinId").value = p.id;
	document.getElementById("incInjuryXPct").value = p.x_pct;
	document.getElementById("incInjuryYPct").value = p.y_pct;
	document.getElementById("incInjurySiteName").value = p.site_name || "";
	document.getElementById("incInjuryType").value = p.injury_type || "擦過傷 (すり傷)";
	document.getElementById("incInjurySeverity").value = p.severity || "軽微 (発赤・小擦過傷)";
	document.getElementById("incInjuryTreatment").value = p.treatment || "";
	document.getElementById("incInjuryNotes").value = p.notes || "";

	const badge = document.getElementById("incInjuryCoordsBadge");
	if (badge) badge.textContent = `(位置: X:${p.x_pct}%, Y:${p.y_pct}%) [編集モード]`;

	renderIncidentInjuryPins();
}

function saveIncidentInjuryPin() {
	const editId = document.getElementById("incInjuryEditPinId")?.value;
	const site = document.getElementById("incInjurySiteName")?.value.trim();
	const type = document.getElementById("incInjuryType")?.value;
	const sev = document.getElementById("incInjurySeverity")?.value;
	const treat = document.getElementById("incInjuryTreatment")?.value.trim();
	const notes = document.getElementById("incInjuryNotes")?.value.trim();
	const xPct = parseFloat(document.getElementById("incInjuryXPct")?.value) || 50;
	const yPct = parseFloat(document.getElementById("incInjuryYPct")?.value) || 50;

	if (!site) {
		alert("負傷部位名（例: 右膝、左手首など）を入力してください。");
		return;
	}
	if (!type || !sev) {
		alert("傷の種類と程度を選んでください。");
		return;
	}
	// [Claude修正] 図をクリックせずに登録すると、図の中央 (50%, 50%) に誤ったピンが立っていた
	if (!editId && !document.getElementById("incInjuryTempPin")) {
		alert("先に人体図をクリックして、負傷した位置を指定してください。");
		return;
	}

	if (!Array.isArray(gState.currentIncidentInjuryPins)) {
		gState.currentIncidentInjuryPins = [];
	}

	if (editId) {
		const p = gState.currentIncidentInjuryPins.find(x => x.id === Number(editId));
		if (p) {
			p.site_name = site; p.injury_type = type; p.severity = sev;
			p.treatment = treat; p.notes = notes; p.x_pct = xPct; p.y_pct = yPct;
		}
	} else {
		gState.currentIncidentInjuryPins.push({
			id: Date.now(), pin_no: gState.currentIncidentInjuryPins.length + 1,
			site_name: site, injury_type: type, severity: sev,
			treatment: treat, notes: notes, x_pct: xPct, y_pct: yPct
		});
	}

	resetIncidentInjuryForm();
	renderIncidentInjuryPins();
}

function deleteIncidentInjuryPin(pinId) {
	if (!confirm("この受傷ピンを削除しますか？")) return;
	gState.currentIncidentInjuryPins = (gState.currentIncidentInjuryPins || []).filter(x => x.id !== Number(pinId));
	resetIncidentInjuryForm();
	renderIncidentInjuryPins();
}

function commitIncidentInjuryPins() {
	updateIncidentPinsSummaryUI();
	closeModal("incidentInjurySchemaModal");
}

function printIncidentReport(incId) {
	const inc = (db.data.incidents || []).find(x => x.id === incId);
	if (!inc) {
		alert("対象の事故報告書が見つかりません。");
		return;
	}
	const res = (gState.residents || []).find(r => r.id === inc.resident_id);
	const pins = inc.injury_pins || [];
	const facilityName = (typeof getFacilityName === "function") ? getFacilityName() : "陽だまりの家";

	let pinsTableRows = "";
	pins.forEach((p, idx) => {
		pinsTableRows += `
			<tr>
				<td style="text-align:center; font-weight:bold; border:1px solid #333; padding:5px;">${idx + 1}</td>
				<td style="border:1px solid #333; padding:5px; font-weight:bold;">${escapeHtml(p.site_name || '-')}</td>
				<td style="border:1px solid #333; padding:5px;">${escapeHtml(p.injury_type || '-')}</td>
				<td style="border:1px solid #333; padding:5px;">${escapeHtml(p.severity || '-')}</td>
				<td style="border:1px solid #333; padding:5px;">${escapeHtml(p.treatment || '-')}</td>
				<td style="border:1px solid #333; padding:5px;">${escapeHtml(p.notes || '-')}</td>
			</tr>
		`;
	});

	let pinsOverlayHtml = "";
	pins.forEach((p, idx) => {
		pinsOverlayHtml += `
			<div style="position:absolute; left:${p.x_pct}%; top:${p.y_pct}%; width:22px; height:22px; margin-left:-11px; margin-top:-11px; border-radius:50%; background:#dc2626; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:12px; border:2px solid #fff;">
				${idx + 1}
			</div>
		`;
	});

	const printHtml = `
		<!DOCTYPE html>
		<html lang="ja">
		<head>
			<meta charset="UTF-8">
			<title>事故・ヒヤリハット報告書 - ${escapeHtml(res ? res.name : '利用者')}</title>
			<style>
				/* [Claude修正 2026-10-16] A4で2枚目にはみ出していた（ページの余白と本文の余白が二重・承認欄の見出しが3行に折り返し・負傷箇所の表の見出しが縦に1文字ずつ折り返し）。
				   余白を1つにし、詰めて、それでも入らないときは少しだけ縮めて1枚に収める（cpFitOnePage） */
				body { font-family: "Hiragino Kaku Gothic ProN", Meiryo, sans-serif; font-size: 10pt; color: #111; margin: 0 auto; max-width: 190mm; line-height: 1.4; }
				table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
				th, td { border: 1px solid #333; padding: 4px 6px; font-size: 9.5pt; }
				th { background: #eef2ef; text-align: left; }
				.h-title { text-align: center; font-size: 15pt; font-weight: bold; margin-bottom: 6px; border-bottom: 2px solid #333; padding-bottom: 3px; }
				.stamp-box th { white-space: nowrap; text-align: center; font-size: 8.5pt; padding: 2px 4px; }
				.stamp-box td { height: 36px; width: 25%; text-align: center; vertical-align: top; font-size: 9pt; }
				.pin-table th { white-space: nowrap; }
				body { position: relative; }
				.sec { break-inside: avoid; page-break-inside: avoid; }
				.cont-note { text-align: right; font-size: 9pt; color: #333; margin: 2px 0 0 0; }
				.cont-head { break-before: page; page-break-before: always; border-bottom: 2px solid #333; padding-bottom: 4px; margin-bottom: 8px; }
				.cont-head .t { font-size: 13pt; font-weight: bold; }
				.cont-head .i { font-size: 10pt; margin-top: 2px; }
				@page { size: A4 portrait; margin: 10mm; }
				@media print {
					body { margin: 0; max-width: none; }
				}
			</style>
			<script>
				// [Claude修正 2026-10-16] 1枚（A4縦・余白10mm＝高さ277mm）に入らないときは、まず0.75倍まで縮めて1枚に収める。
				// それでも入らないときは元の大きさに戻し、入りきらない項目は途中で切らずに項目ごと2枚目へ移す。
				// 1枚目の下に「（2枚目に続きます）」、2枚目の上に「（2枚目）」と利用者名・部屋番号・発生日時・種別を入れる
				window.cpFitOnePage = function () {
					var b = document.body; b.style.zoom = "";
					Array.prototype.slice.call(document.querySelectorAll(".cp-auto")).forEach(function (e) { e.parentNode.removeChild(e); });
					var avail = 277 * 96 / 25.4 - 4;
					var h = b.scrollHeight;
					if (h <= avail) return 1;
					if (avail / h >= 0.75) { b.style.zoom = String((avail / h).toFixed(3)); return 1; }
					var info = (document.getElementById("cpContInfo") || {}).textContent || "";
					var secs = document.querySelectorAll(".sec");
					var pageStart = 0, page = 1, noteH = 24;
					for (var k = 0; k < secs.length; k++) {
						var sc = secs[k];
						var top = sc.offsetTop, bottom = top + sc.offsetHeight;
						if (bottom - pageStart > avail - noteH && top > pageStart + 1) {
							var note = document.createElement("div");
							note.className = "cp-auto cont-note";
							note.textContent = "（" + (page + 1) + "枚目に続きます）";
							sc.parentNode.insertBefore(note, sc);
							var head = document.createElement("div");
							head.className = "cp-auto cont-head";
							var t = document.createElement("div"); t.className = "t"; t.textContent = "事故・ヒヤリハット報告書（" + (page + 1) + "枚目）";
							var i2 = document.createElement("div"); i2.className = "i"; i2.textContent = info;
							head.appendChild(t); head.appendChild(i2);
							sc.parentNode.insertBefore(head, sc);
							pageStart = head.offsetTop;
							page++;
						}
					}
					return page;
				};
			</script>
		</head>
		<body>
			<div id="cpContInfo" style="display:none;">${res ? `${escapeHtml(res.room_no)}号室　${escapeHtml(res.name)} 様` : "利用者"}　発生日時: ${escapeHtml(inc.occurred_at || "-")}　種別: ${escapeHtml(inc.report_type || "-")}</div>
			<div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
				<div style="font-size:11pt; font-weight:bold;">${escapeHtml(facilityName)}</div>
				<table style="width:300px; margin-bottom:0;" class="stamp-box">
					<tr><th>施設長</th><th>管理者</th><th>看護師長</th><th>報告者</th></tr>
					<tr><td></td><td></td><td></td><td></td></tr>
				</table>
			</div>

			<div class="h-title">事故・ヒヤリハット報告書 (${escapeHtml(inc.report_type || '報告書')})</div>

			<table>
				<tr>
					<th style="width:15%;">発生日時</th>
					<td style="width:35%;">${escapeHtml(inc.occurred_at || '-')}</td>
					<th style="width:15%;">発生場所</th>
					<td style="width:35%;">${escapeHtml(inc.place || '-')}</td>
				</tr>
				<tr>
					<th>対象利用者</th>
					<td>${res ? `${escapeHtml(res.room_no)}号室 <strong>${escapeHtml(res.name)} 様</strong> (${escapeHtml(res.care_level)})` : '-'}</td>
					<th>報告者氏名</th>
					<td>${escapeHtml(inc.staff_name || '担当職員')}</td>
				</tr>
			</table>

			<div class="sec">
			<table>
				<tr><th style="background:#eef2ef;">1. 発生状況 (何が起きたか・発見時の状態)</th></tr>
				<tr><td style="min-height:70px; padding:10px;">${escapeHtml(inc.situation || '-').replace(/\n/g, '<br>')}</td></tr>
			</table>
			</div>

			<div class="sec">
			<!-- 受傷部位シェーマ図 ＆ 外傷ピン一覧 -->
			<div style="border:1px solid #333; padding:8px; margin-bottom:8px; page-break-inside:avoid;">
				<div style="font-weight:bold; font-size:10.5pt; margin-bottom:6px; border-bottom:1px solid #cdd6d0; padding-bottom:3px;">
					2. 受傷部位シェーマ図 ＆ 負傷箇所一覧 (${pins.length}か所)
				</div>
				<div style="display:flex; gap:16px; align-items:flex-start;">
					<div style="position:relative; width:200px; flex:0 0 200px; border:1px solid #cdd6d0; background:#fafafa; text-align:center;">
						<img src="assets/body_schema.jpg" style="width:100%; display:block;">
						<div style="position:absolute; top:0; left:0; width:100%; height:100%;">${pinsOverlayHtml}</div>
					</div>
					<div style="flex:1;">
						<table class="pin-table" style="margin:0; font-size:9pt;">
							<thead>
								<tr style="background:#f6f8f6;">
									<th style="text-align:center;">番号</th>
									<th>部位</th>
									<th>外傷種別</th>
									<th>重症度</th>
									<th>応急処置・対応</th>
									<th>特記</th>
								</tr>
							</thead>
							<tbody>
								${pinsTableRows || '<tr><td colspan="6" style="text-align:center; color:#666;">受傷部位ピンの登録なし</td></tr>'}
							</tbody>
						</table>
					</div>
				</div>
			</div>
			</div>

			<div class="sec">
			<table>
				<tr><th style="background:#eef2ef;">3. 原因の分析 (なぜ起きたか・人的/環境要因)</th></tr>
				<tr><td style="min-height:50px; padding:8px;">${escapeHtml(inc.cause || '-').replace(/\n/g, '<br>')}</td></tr>
			</table>
			</div>

			<div class="sec">
			<table>
				<tr><th style="background:#eef2ef;">4. 再発防止策 ＆ 今後の対応方針</th></tr>
				<tr><td style="min-height:50px; padding:8px;">${escapeHtml(inc.prevention || '-').replace(/\n/g, '<br>')}</td></tr>
			</table>
			</div>

			<div class="sec">
			<table>
				<tr><th style="background:#eef2ef;">5. 施設長・管理者コメント ＆ 指導事項</th></tr>
				<tr><td style="min-height:40px; padding:8px;">${escapeHtml(inc.supervisor_comment || '').replace(/\n/g, '<br>')}</td></tr>
			</table>
			</div>
		</body>
		</html>
	`;

	const win = window.open("", "_blank");
	if (win) {
		win.document.open();
		win.document.write(printHtml);
		win.document.close();
		// [Claude修正] 人体図の読み込みを待ってから印刷 (読み込み前だと図が白紙になる)
		let printed = false;
		const doPrint = () => { if (!printed) { printed = true; try { if (win.cpFitOnePage) win.cpFitOnePage(); } catch (e) {} win.focus(); win.print(); } };
		const img = win.document.querySelector("img");
		if (img && !img.complete) { img.onload = doPrint; img.onerror = doPrint; setTimeout(doPrint, 3000); }
		else setTimeout(doPrint, 300);
	} else {
		alert("印刷用の画面を開けませんでした。ブラウザのポップアップ設定を確認してください。");
	}
}

// =====================================================================
// ワクチン予防接種管理 (動的レンダリング ＆ 登録・更新)
// =====================================================================

function renderOfficeVaccines() {
	const tbody = document.querySelector("#vaccineTable tbody");
	if (!tbody) return;
	tbody.innerHTML = "";

	// [Claude修正] 旧実装は台帳が空になると例文の接種記録 (同意済・ロット番号・副反応なし等) を
	// 実データとして書き込んでいた。全件削除しても例文が復活していた。空のまま表示する

	const list = db.data.vaccines || [];
	if (list.length === 0) {
		tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; color:var(--text-muted); padding:16px;">予防接種の記録はありません。</td></tr>`;
		return;
	}
	cpLedgerOrder(list).forEach(v => {
		const res = (gState.residents || []).find(r => r.id === v.resident_id);
		const consentColor = v.consent === "同意受領済" ? "#16a34a" : (v.consent === "接種見送り (辞退)" ? "#dc2626" : "#b45309");

		const tr = document.createElement("tr");
		tr.innerHTML = `
			<td>${res ? escapeHtml(res.room_no) : '-'}</td>
			<td><strong>${res ? escapeHtml(res.name) + ' 様' : '-'}</strong></td>
			<td><span class="badge" style="background:#f1f6f3; color:#1e5b47;">${escapeHtml(v.vaccine_name || '-')}</span></td>
			<td>${escapeHtml(v.dose || '-')}</td>
			<td><strong style="color:${consentColor};">${escapeHtml(v.consent || '-')}</strong></td>
			<td>${escapeHtml(v.date || '-')}</td>
			<td>${escapeHtml(v.doctor || '-')}</td>
			<td>${escapeHtml(v.lot || '-')}</td>
			<td>${escapeHtml(v.reactions || '-')}</td>
			<td><span class="badge" style="background:#eef2ef; color:#36443e;">${escapeHtml(v.status || '登録済')}</span></td>
			<td style="white-space:nowrap; text-align:center;">
				${cpLedgerActions('vaccines', v, 'openVaccineModal')}
			</td>
		`;
		if (v.voided) cpMarkVoidedRow(tr);
		tbody.appendChild(tr);
	});
}

function openVaccineModal(editId = null) {
	const idEl = document.getElementById("vacEditId");
	const selEl = document.getElementById("vacResidentSelect");
	const typeEl = document.getElementById("vacType");
	const doseEl = document.getElementById("vacDose");
	const conEl = document.getElementById("vacConsent");
	const dateEl = document.getElementById("vacDate");
	const docEl = document.getElementById("vacDoctor");
	const lotEl = document.getElementById("vacLot");
	const reactEl = document.getElementById("vacReactions");

	selEl.innerHTML = "";
	cpCurrentResidents().forEach(r => {
		const opt = document.createElement("option");
		opt.value = r.id;
		opt.textContent = `${r.room_no}号室 ${r.name} 様`;
		selEl.appendChild(opt);
	});

	if (editId) {
		const v = (db.data.vaccines || []).find(x => x.id === editId);
		if (!v) return;
		idEl.value = v.id;
		selEl.value = v.resident_id;
		typeEl.value = v.vaccine_name || "季節性インフルエンザ";
		doseEl.value = v.dose || "定期接種";
		// [Claude修正] 同意の欄が空のとき「同意受領済」を選んだ状態で開いていた（誰も確かめていないのに同意済みで保存されるおそれ）。
		// 空や一覧にない値なら「選んでください」から始める
		conEl.value = [...conEl.options].some(o => o.value && o.value === v.consent) ? v.consent : "";
		// [Claude修正] 「2026-10-15予定」のような予定日を今日の日付に書き換えていたため、日付部分を残す
		const vd = String(v.date || "").match(/\d{4}-\d{2}-\d{2}/);
		dateEl.value = vd ? vd[0] : "";
		docEl.value = v.doctor || "";
		lotEl.value = v.lot || "";
		reactEl.value = v.reactions || "";
	} else {
		idEl.value = "";
		selEl.value = gState.selectedResidentId || (gState.residents[0] ? gState.residents[0].id : 1);
		typeEl.value = "季節性インフルエンザ";
		doseEl.value = "定期接種";
		// [Claude修正] 同意・ロット番号・副反応に例文が入っていたため、確認前の内容が記録される恐れがあった
		conEl.value = ""; // [Claude修正] 新規も「選んでください」から
		dateEl.value = "";
		docEl.value = "";
		lotEl.value = "";
		reactEl.value = "";
	}
	openModal("vaccineModal");
}

function submitVaccineRecord() {
	const editId = document.getElementById("vacEditId")?.value;
	const resId = Number(document.getElementById("vacResidentSelect")?.value);
	const type = document.getElementById("vacType")?.value;
	const dose = document.getElementById("vacDose")?.value.trim();
	const con = document.getElementById("vacConsent")?.value;
	const date = document.getElementById("vacDate")?.value;
	const doc = document.getElementById("vacDoctor")?.value.trim();
	const lot = document.getElementById("vacLot")?.value.trim();
	const react = document.getElementById("vacReactions")?.value.trim();

	if (!resId || !type) {
		alert("対象利用者とワクチン種別を選択してください。");
		return;
	}
	if (!con) {
		alert("家族同意状況を選んでください。");
		return;
	}

	if (!Array.isArray(db.data.vaccines)) db.data.vaccines = [];

	// [Claude修正] 状態の判定: 同意済でも接種日が未来・未入力なら「接種予定」。旧実装は同意済なら一律「接種完了」だった
	const vacDays = cpDaysUntil(date);
	const vacStatus = con === "接種見送り (辞退)" ? "見送り"
		: con !== "同意受領済" ? "確認中"
		: (vacDays !== null && vacDays <= 0) ? "接種完了" : "接種予定";

	if (editId) {
		const v = db.data.vaccines.find(x => x.id === Number(editId));
		if (v) {
			const cpOld = Object.assign({}, v); // [Claude修正] 訂正前の内容を履歴に残す
			v.resident_id = resId; v.vaccine_name = type; v.dose = dose;
			v.consent = con; v.date = date; v.doctor = doc; v.lot = lot;
			v.reactions = react; v.status = vacStatus;
			cpAppendEditHistory(v, cpOld, ["resident_id", "vaccine_name", "dose", "consent", "date", "doctor", "lot", "reactions", "status"]);
		}
	} else {
		db.data.vaccines.unshift({
			id: Date.now(), resident_id: resId, vaccine_name: type, dose: dose,
			consent: con, date: date, doctor: doc, lot: lot, reactions: react,
			status: vacStatus
		});
	}

	db.save();
	closeModal("vaccineModal");
	renderOfficeVaccines();
	alert("予防接種記録を保存しました！");
}

function deleteVaccineRecord(id) {
	// [Claude修正] 削除せず取消にする
	cpVoidLedgerRecord('vaccines', id);
}

// グローバル公開 (第3段階・後半)
window.openIncidentInjurySchemaModal = openIncidentInjurySchemaModal;
window.handleIncidentInjuryImageClick = handleIncidentInjuryImageClick;
window.saveIncidentInjuryPin = saveIncidentInjuryPin;
window.deleteIncidentInjuryPin = deleteIncidentInjuryPin;
window.editIncidentInjuryPin = editIncidentInjuryPin;
window.resetIncidentInjuryForm = resetIncidentInjuryForm;
window.commitIncidentInjuryPins = commitIncidentInjuryPins;
window.printIncidentReport = printIncidentReport;
window.openNewIncidentModal = openNewIncidentModal;
window.deleteIncident = deleteIncident;
window.openRecreationModal = openRecreationModal;
window.submitRecreationRecord = submitRecreationRecord;
window.deleteRecreationRecord = deleteRecreationRecord;
window.openFireDrillModal = openFireDrillModal;
window.submitFireDrillRecord = submitFireDrillRecord;
window.deleteFireDrillRecord = deleteFireDrillRecord;
window.openEmergencySupplyModal = openEmergencySupplyModal;
window.submitEmergencySupplyRecord = submitEmergencySupplyRecord;
window.deleteEmergencySupplyRecord = deleteEmergencySupplyRecord;
window.renderOfficeVaccines = renderOfficeVaccines;
window.openVaccineModal = openVaccineModal;
window.submitVaccineRecord = submitVaccineRecord;
window.deleteVaccineRecord = deleteVaccineRecord;
window.cpVoidLedgerRecord = cpVoidLedgerRecord;
window.cpRestoreLedgerRecord = cpRestoreLedgerRecord;// 私物行 追加・編集
function openBelongingModal(editId = null) {
 const modal = document.getElementById("belongingModal");
 if (!modal) return;
 const titleEl = document.getElementById("belModalTitle");
 const submitBtn = document.getElementById("belSubmitBtn");
 const editIdEl = document.getElementById("belEditId");

 if (editId) {
 const b = (db.data.belongings || []).find(x => x.id === editId);
 if (!b) return;
 if (editIdEl) editIdEl.value = b.id;
 if (titleEl) titleEl.textContent = ` 私物・持ち込み品の編集 (${b.item_name})`;
 if (submitBtn) submitBtn.textContent = "私物情報を更新・保存";
 document.getElementById("belCat").value = b.category || "衣類・日用品";
 document.getElementById("belItemName").value = b.item_name || "";
 document.getElementById("belQty").value = b.quantity || "";
 document.getElementById("belNotes").value = b.notes || "";
 } else {
 if (editIdEl) editIdEl.value = "";
 if (titleEl) titleEl.textContent = " 私物・持ち込み品の追加 (品名と個数)";
 if (submitBtn) submitBtn.textContent = "私物台帳へ追加";
 document.getElementById("belCat").value = "衣類・日用品";
 document.getElementById("belItemName").value = "";
 document.getElementById("belQty").value = "";
 document.getElementById("belNotes").value = "";
 }
 modal.style.display = "flex";
}

function submitBelonging() {
 const editId = document.getElementById("belEditId")?.value;
 const cat = document.getElementById("belCat").value;
 const name = document.getElementById("belItemName").value.trim();
 const qty = document.getElementById("belQty").value.trim();
 const notes = document.getElementById("belNotes").value.trim();

 if (!name || !qty) {
 alert("品名と個数を入力してください。");
 return;
 }

 if (!db.data.belongings) db.data.belongings = [];

 if (editId) {
 const b = db.data.belongings.find(x => x.id == editId);
 if (b) {
 const ok = confirm(`『${b.item_name}』の登録内容を変更しますか？\n\n・品名: ${b.item_name} → ${name}\n・個数: ${b.quantity} → ${qty}\n・区分: ${b.category} → ${cat}\n・備考: ${b.notes || 'なし'} → ${notes || 'なし'}`);
 if (!ok) return;

 const cpOldBel = Object.assign({}, b);
 b.category = cat;
 b.item_name = name;
 b.quantity = qty;
 b.notes = notes;
 cpAppendEditHistory(b, cpOldBel, ["category", "item_name", "quantity", "notes"]); // [Claude修正] 変更前の内容を残す
 }
 alert(`私物『${name}』の情報を更新しました。`);
 } else {
 db.data.belongings.push({
 id: Date.now(),
 resident_id: gState.selectedResidentId,
 category: cat,
 item_name: name,
 quantity: qty,
 marked: 1,
 notes: notes
 });
 alert(`私物台帳に『${name}』を追加しました。`);
 }
 db.save();

 closeModal("belongingModal");
 document.getElementById("belItemName").value = "";
 document.getElementById("belQty").value = "";
 document.getElementById("belNotes").value = "";
 if (document.getElementById("belEditId")) document.getElementById("belEditId").value = "";
 renderResidentDetail();
}

// 数量クイック調整 (衣類破棄・劣化・買い足し時)
function adjustBelongingQty(id, delta) {
 const b = (db.data.belongings || []).find(x => x.id === id);
 if (!b) return;

 const currentStr = String(b.quantity || "1").trim();
 const numMatch = currentStr.match(/\d+/);
 let curNum = numMatch ? parseInt(numMatch[0], 10) : 1;
 const unit = currentStr.replace(/\d+/g, "").trim() || "点";

 const nextNum = curNum + delta;
 if (nextNum <= 0) {
 // [Claude修正] 数量が0になる時も、消さずに「返却・破棄」として残す
 deleteBelonging(id, false);
 return;
 }

 const ok = confirm(`『${b.item_name}』の数量を変更しますか？\n\n【 変更前 】 ${b.quantity}\n　　↓\n【 変更後 】 ${nextNum}${unit}`);
 if (!ok) return;

 const cpOldQty = Object.assign({}, b);
 b.quantity = `${nextNum}${unit}`;
 cpAppendEditHistory(b, cpOldQty, ["quantity"]); // [Claude修正] 変更前の数量を残す
 db.save();
 renderResidentDetail();
}

// 私物の削除 (廃棄・持ち帰り)
function deleteBelonging(id, needConfirm = true) {
 const b = (db.data.belongings || []).find(x => x.id === id);
 if (!b) return;

 // [Claude修正] 預かり品は台帳から消さずに「返却・破棄・誤登録」などの理由を残して外す
 if (!cpVoidRecord(b, "", `『${b.item_name} (${b.quantity})』を預かり品台帳から外します。\n記録は消えずに残ります。\n\n理由を入力してください (例: ご家族へ返却、破損のため破棄、誤登録)`)) return;
 db.save();
 renderResidentDetail();
 alert(`『${b.item_name}』を台帳から外しました（記録は残っています）。`);
}

// 福祉用具・備品 追加
function openEquipmentModal() {
 const modal = document.getElementById("equipmentModal");
 if (!modal) return;
 document.getElementById("eqName").value = "";
 document.getElementById("eqOwnership").value = "施設備品";
 document.getElementById("eqNotes").value = "";
 modal.style.display = "flex";
}

function submitEquipment() {
 const name = document.getElementById("eqName").value.trim();
 const ownership = document.getElementById("eqOwnership").value;
 const notes = document.getElementById("eqNotes").value.trim();

 if (!name) {
 alert("用具・備品名を入力してください。");
 return;
 }

 if (!db.data.equipments) db.data.equipments = [];
 db.data.equipments.push({
 id: Date.now(),
 resident_id: gState.selectedResidentId,
 equipment_name: name,
 ownership_type: ownership,
 notes: notes
 });
 db.save();

 closeModal("equipmentModal");
 renderResidentDetail();
 alert(`福祉用具『${name}』を登録しました。`);
}

// 福祉用具・備品の解除・返却
function deleteEquipment(id) {
 const eq = (db.data.equipments || []).find(x => x.id === id);
 if (!eq) return;

 const ok = confirm(`福祉用具『${eq.equipment_name} (${eq.ownership_type})』の使用を終了（解除）しますか？`);
 if (!ok) return;

 // [Claude修正] 消さずに、使用終了の日時・職員・理由を残す
 eq.voided = true;
 eq.voided_at = toLocalDateTimeStr(new Date());
 eq.voided_by = cpLedgerStaff();
 eq.void_reason = "使用終了・解除";
 db.save();
 renderResidentDetail();
 alert(`『${eq.equipment_name}』の使用を終了・解除しました。`);
}

// 緊急連絡先 ＆ 家族の要望・生活歴・看取り方針 クイック変更モーダル
function openFamilyHistoryModal(residentId) {
 const r = (gState.residents || []).find(x => x.id === residentId);
 if (!r) return;

 const modal = document.getElementById("familyHistoryModal");
 if (!modal) return;

 document.getElementById("familyHistoryModalTitle").textContent = ` 緊急連絡先 ＆ 家族の要望・生活歴・看取り方針の変更 (${r.name} 様)`;
 document.getElementById("fhResidentId").value = r.id;
 document.getElementById("fhEmergencyContact").value = r.emergency_contact || "";
 document.getElementById("fhPolicyStamp").value = r.policy_stamp || "緊急搬送";
 document.getElementById("fhSensorAlert").value = r.sensor_alert || "";
 document.getElementById("fhFamilyWishes").value = r.family_wishes || "";
 document.getElementById("fhLifeHistory").value = r.life_history || "";

 modal.style.display = "flex";
}

function submitFamilyHistory() {
 const resId = parseInt(document.getElementById("fhResidentId").value, 10);
 const r = (gState.residents || []).find(x => x.id === resId);
 if (!r) return;

 const staff = (document.getElementById("currentStaff")?.value) || "担当職員";
 const now = new Date();
 const nowStr = `${toLocalDateStr(now)} ${now.toTimeString().slice(0, 5)}`;

 const newContact = document.getElementById("fhEmergencyContact").value.trim();
 const newStamp = document.getElementById("fhPolicyStamp").value;
 const newSensor = document.getElementById("fhSensorAlert").value.trim();
 const newWishes = document.getElementById("fhFamilyWishes").value.trim();
 const newHistory = document.getElementById("fhLifeHistory").value.trim();

 // 変更前と比較して差分チェック
 const changes = [];
 if (r.emergency_contact !== newContact) changes.push(`・緊急連絡/延命方針: ${r.emergency_contact || '未登録'} → ${newContact || 'なし'}`);
 if (r.policy_stamp !== newStamp) changes.push(`・基本方針: ［${r.policy_stamp}］→［${newStamp}］`);
 if (r.family_wishes !== newWishes) changes.push(`・家族の要望: ${r.family_wishes || 'なし'} → ${newWishes || 'なし'}`);
 if (r.life_history !== newHistory) changes.push(`・生活歴/こだわりを更新`);
 if (r.sensor_alert !== newSensor) changes.push(`・見守り/センサー: ${r.sensor_alert || 'なし'} → ${newSensor || 'なし'}`);

 if (changes.length > 0) {
 const ok = confirm(`『${r.name} 様』の登録情報を変更しますか？\n\n${changes.join("\n")}`);
 if (!ok) return;
 }



 r.emergency_contact = newContact;
 r.policy_stamp = newStamp;
 r.sensor_alert = newSensor;
 r.family_wishes = newWishes;
 r.life_history = newHistory;

 if (changes.length > 0) {
 if (!db.data.care_records) db.data.care_records = [];
 db.data.care_records.unshift({
 id: Date.now(),
 resident_id: r.id,
 category: "特変",
 recorded_at: nowStr,
 content: `【基本情報更新】家族要望・緊急連絡先・看取り方針等の更新 (${changes.join(" / ")})`,
 staff_name: staff
 });
 }

 db.save();
 closeModal("familyHistoryModal");
 renderResidentDetail();
 checkGlobalAlerts();
 alert(`『${r.name} 様』の緊急連絡先・家族要望・看取り方針を最新状態に更新・保存しました！`);
}


// 新規利用者登録・編集
function openAddResidentModal() {
 document.getElementById("resModalTitle").textContent = " 新規利用者の登録";
 document.getElementById("resEditId").value = "";
 document.getElementById("resRoomNo").value = "";
  if (document.getElementById("resUnit")) document.getElementById("resUnit").innerHTML = cpUnitOptionsHtml("", cpUnits().length ? "選んでください" : "区分なし（区分の設定で追加できます）");
 document.getElementById("resName").value = "";
 document.getElementById("resCareLevel").value = ""; // [Claude修正] 未選択のまま「要介護3」で登録されないように
 document.getElementById("resStatus").value = "在所";
 document.getElementById("resBirthDate").value = "";
 document.getElementById("resPolicyStamp").value = ""; // [Claude修正] 未選択のまま「緊急搬送」で登録されないように
 document.getElementById("resDietType").value = ""; // [Claude修正] 未選択のまま「普通食 (一口大)」で登録されないように
 document.getElementById("resAllergies").value = "";
 document.getElementById("resParalysis").value = "";
 document.getElementById("resOralState").value = "";
 document.getElementById("resDiseases").value = "";
 document.getElementById("resEmergencyContact").value = "";
 document.getElementById("resSensorAlert").value = "";
 document.getElementById("resCarePlanGoal").value = "";
 document.getElementById("resFamilyWishes").value = "";
 document.getElementById("resLifeHistory").value = "";
 document.getElementById("resDrInstructions").value = "";
 document.getElementById("resNextClinicDate").value = "";
 document.getElementById("resCareExpiryDate").value = "";
 document.getElementById("resClinicSpecialNotes").value = "";
 document.getElementById("resBpHighMax").value = "";
 document.getElementById("resBpHighMin").value = "";
 document.getElementById("resTempMax").value = "";
 document.getElementById("resSpo2Min").value = "";
 document.getElementById("resPulseMax").value = "";
 document.getElementById("resPulseMin").value = "";

 document.getElementById("residentModal").style.display = "flex";
}

function openEditResidentModal(id) {
 const r = gState.residents.find(x => x.id === id);
 if (!r) return;

 document.getElementById("resModalTitle").textContent = ` 利用者情報の編集 (${r.name} 様)`;
 document.getElementById("resEditId").value = r.id;
 document.getElementById("resRoomNo").value = r.room_no || "";
  if (document.getElementById("resUnit")) document.getElementById("resUnit").innerHTML = cpUnitOptionsHtml(r.unit_id, cpUnits().length ? "選んでください" : "区分なし（区分の設定で追加できます）");
 document.getElementById("resName").value = r.name || "";
 document.getElementById("resCareLevel").value = r.care_level || "要介護3";
 document.getElementById("resStatus").value = r.status || "在所";
 document.getElementById("resBirthDate").value = r.birth_date || "";
 document.getElementById("resPolicyStamp").value = r.policy_stamp || "緊急搬送";
 document.getElementById("resDietType").value = r.diet_type || "";
 document.getElementById("resAllergies").value = r.allergies || "";
 document.getElementById("resParalysis").value = r.paralysis || "";
 document.getElementById("resOralState").value = r.oral_state || "";
 document.getElementById("resDiseases").value = r.diseases || "";
 document.getElementById("resEmergencyContact").value = r.emergency_contact || "";
 document.getElementById("resSensorAlert").value = r.sensor_alert || "";
 document.getElementById("resCarePlanGoal").value = r.care_plan_goal || "";
 document.getElementById("resFamilyWishes").value = r.family_wishes || "";
 document.getElementById("resLifeHistory").value = r.life_history || "";
 document.getElementById("resDrInstructions").value = r.dr_instructions || "";
 document.getElementById("resNextClinicDate").value = r.next_clinic_date || "";
 document.getElementById("resCareExpiryDate").value = r.care_expiry_date || "";
 document.getElementById("resClinicSpecialNotes").value = r.clinic_special_notes || "";
 document.getElementById("resBpHighMax").value = r.bp_high_max || "";
 document.getElementById("resBpHighMin").value = r.bp_high_min || "";
 document.getElementById("resTempMax").value = r.temp_max || "";
 document.getElementById("resSpo2Min").value = r.spo2_min || "";
 document.getElementById("resPulseMax").value = r.pulse_max || "";
 document.getElementById("resPulseMin").value = r.pulse_min || "";

 document.getElementById("residentModal").style.display = "flex";
}

function submitResidentForm() {
 const roomNo = document.getElementById("resRoomNo").value.trim();
 const name = document.getElementById("resName").value.trim();
 if (!roomNo || !name) {
 alert("居室番号と氏名は必須入力です。");
 return;
 }
 // [Claude修正] 要介護度と基本方針（看取り・緊急搬送）は、選ばずに登録できないようにする
 if (!document.getElementById("resCareLevel").value) {
 alert("要介護度を選んでください。");
 return;
 }
 if (!document.getElementById("resPolicyStamp").value) {
 alert("基本方針（緊急搬送・看取りなど）を選んでください。");
 return;
 }
 // [Claude修正] 区分（ユニット・フロアなど）があるときは、選ばずに登録できないようにする
 const cpUnitSel = document.getElementById("resUnit");
 if (cpUnitSel && cpUnits().length && !cpUnitSel.value) {
 alert("区分（ユニット・フロアなど）を選んでください。");
 return;
 }

 const editId = document.getElementById("resEditId").value;
 // [Claude追加] 退所は「退所の手続き」から（退所日・理由を残すため）。退所の取り消しも専用のボタンから
 let cpUnitAfterMove;
 {
 const stVal = document.getElementById("resStatus").value;
 const cur = editId ? gState.residents.find(x => x.id === parseInt(editId)) : null;
 if (cur && cpIsDischarged(cur) && stVal !== "退所") { alert("退所した方を戻すときは、カルテの「退所を取り消す」から行ってください。"); return; }
 if ((!cur || !cpIsDischarged(cur)) && stVal === "退所") { alert("退所は、カルテの「退所の手続き」から行ってください（退所日と理由を残すため）。"); return; }
 // 新しく登録する方の部屋に、すでに別の方がいないか
 if (!cur) {
 const occ = cpRoomOccupant(roomNo, null);
 if (occ) { alert(`${roomNo}号室には ${occ.name} 様がいます。別の部屋番号を入れてください。`); return; }
 } else if (!cpIsDischarged(cur)) {
 // 部屋・区分が変わるときは、入れ替えを確かめて先に移す
 const newUnit = (cpUnitSel && cpUnitSel.value) ? Number(cpUnitSel.value) : (cpUnits().length ? null : (cur.unit_id ?? null));
 if (String(cur.room_no) !== String(roomNo) || String(cur.unit_id ?? "") !== String(newUnit ?? "")) {
 if (cpMoveResident(cur, roomNo, newUnit) === null) return;
 cpUnitAfterMove = cur.unit_id ?? null; // 入れ替えで相手の区分に合わせた場合も、その区分を使う
 }
 }
 }
 const residentData = {
 room_no: roomNo,
 unit_id: (cpUnitSel && cpUnitSel.value) ? Number(cpUnitSel.value) : null,
 name: name,
 care_level: document.getElementById("resCareLevel").value,
 status: document.getElementById("resStatus").value,
 birth_date: document.getElementById("resBirthDate").value,
 policy_stamp: document.getElementById("resPolicyStamp").value,
 diet_type: document.getElementById("resDietType").value,
 allergies: document.getElementById("resAllergies").value.trim(),
 paralysis: document.getElementById("resParalysis").value.trim(),
 oral_state: document.getElementById("resOralState").value.trim(),
 diseases: document.getElementById("resDiseases").value.trim(),
 emergency_contact: document.getElementById("resEmergencyContact").value.trim(),
 sensor_alert: document.getElementById("resSensorAlert").value.trim(),
 care_plan_goal: document.getElementById("resCarePlanGoal").value.trim(),
 family_wishes: document.getElementById("resFamilyWishes").value.trim(),
 life_history: document.getElementById("resLifeHistory").value.trim(),
 dr_instructions: document.getElementById("resDrInstructions").value.trim(),
 next_clinic_date: document.getElementById("resNextClinicDate").value,
 care_expiry_date: document.getElementById("resCareExpiryDate").value,
 clinic_special_notes: document.getElementById("resClinicSpecialNotes").value.trim(),
 bp_high_max: document.getElementById("resBpHighMax").value ? parseInt(document.getElementById("resBpHighMax").value, 10) : null,
 bp_high_min: document.getElementById("resBpHighMin").value ? parseInt(document.getElementById("resBpHighMin").value, 10) : null,
 temp_max: document.getElementById("resTempMax").value ? parseFloat(document.getElementById("resTempMax").value) : null,
 spo2_min: document.getElementById("resSpo2Min").value ? parseInt(document.getElementById("resSpo2Min").value, 10) : null,
 pulse_max: document.getElementById("resPulseMax").value ? parseInt(document.getElementById("resPulseMax").value, 10) : null,
 pulse_min: document.getElementById("resPulseMin").value ? parseInt(document.getElementById("resPulseMin").value, 10) : null
 };
 if (cpUnitAfterMove !== undefined) residentData.unit_id = cpUnitAfterMove;

 let targetId;
 if (editId) {
 targetId = parseInt(editId);
 const idx = gState.residents.findIndex(x => x.id === targetId);
 if (idx !== -1) {
 const cpOld = gState.residents[idx];
 gState.residents[idx] = Object.assign({}, gState.residents[idx], residentData);

 cpAppendEditHistory(gState.residents[idx], cpOld, ["name", "room_no", "unit_id", "care_level", "status", "birth_date", "policy_stamp", "emergency_contact", "family_wishes", "life_history", "diseases", "paralysis", "allergies", "diet_type", "oral_state", "dr_instructions", "care_plan_goal", "sensor_alert", "bp_high_max", "bp_high_min", "temp_max", "spo2_min", "pulse_max", "pulse_min"]); // [Claude修正] 変更前の登録内容を利用者の変更履歴に残す
 }
 } else {
 targetId = Date.now();
 residentData.id = targetId;
 residentData.deposit_balance = 0;
 gState.residents.push(residentData);
 }

 db.data.residents = gState.residents;
 db.save();

 closeModal("residentModal");
 renderResidentsStrip();
	initGlobalTimeSync();
	
 selectResident(targetId);
 renderOfficeBillingSelect();
 if (typeof onDepositResidentChange === "function") {
 onDepositResidentChange();
 }
 checkGlobalAlerts();

 alert(editId ? `「${name} 様」の登録情報を更新しました！` : `新規利用者「${name} 様」を登録しました！`);
}

// ==========================================
// 往診医・受診時指示＆特殊指示 項目別クイック編集機能
// ==========================================
function insertQuickSpecialNote(text) {
 const input = document.getElementById("quickClinicSpecialNotes");
 if (!input) return;
 if (!input.value) {
 input.value = text;
 } else if (!input.value.includes(text)) {
 input.value = input.value + "、" + text;
 }
}

function openClinicInstructionModal(resId, focusField = 'all') {
 const targetId = (resId !== undefined && resId !== null && resId !== '') ? Number(resId) : Number(gState.selectedResidentId);
 const r = gState.residents ? gState.residents.find(x => Number(x.id) === targetId) : null;
 if (!r) {
 console.warn("[openClinicInstructionModal] Resident not found:", resId, gState.selectedResidentId);
 return;
 }

 const titleEl = document.getElementById("clinicModalTitle");
 if (titleEl) titleEl.textContent = ` 往診医・受診時指示 ＆ 特殊指示の変更 (${r.name} 様)`;
 const idEl = document.getElementById("clinicResidentId");
 if (idEl) idEl.value = r.id;
 const specEl = document.getElementById("quickClinicSpecialNotes");
 if (specEl) specEl.value = r.clinic_special_notes || "";
 const drEl = document.getElementById("quickDrInstructions");
 if (drEl) drEl.value = r.dr_instructions || "";
 const dateEl = document.getElementById("quickNextClinicDate");
 if (dateEl) dateEl.value = r.next_clinic_date || "";

 const modal = document.getElementById("clinicInstructionModal");
 if (modal) {
 modal.style.display = "flex";
 modal.style.zIndex = "2500";
 }

 setTimeout(() => {
 if (focusField === 'special' && specEl) {
 specEl.focus();
 specEl.select?.();
 } else if (focusField === 'instructions' && drEl) {
 drEl.focus();
 drEl.select?.();
 } else if (focusField === 'date' && dateEl) {
 dateEl.focus();
 }
 }, 100);
}

function submitClinicInstructions() {
 const idEl = document.getElementById("clinicResidentId");
 if (!idEl) return;
 const id = parseInt(idEl.value, 10);
 const r = gState.residents ? gState.residents.find(x => Number(x.id) === id) : null;
 if (!r) return;

 const specialNotes = document.getElementById("quickClinicSpecialNotes").value.trim();
 const drInstructions = document.getElementById("quickDrInstructions").value.trim();
 const nextClinicDate = document.getElementById("quickNextClinicDate").value;

 r.clinic_special_notes = specialNotes;
 r.dr_instructions = drInstructions;
 r.next_clinic_date = nextClinicDate;

 // 介護記録にも往診・受診指示変更の記録を自動記録（変更履歴の保持）
 const staff = (document.getElementById("currentStaff")?.value) || "看護師";
 const now = new Date();
 const nowStr = `${toLocalDateStr(now)} ${now.toTimeString().slice(0, 5)}`;
 if (!db.data.care_records) db.data.care_records = [];
 db.data.care_records.unshift({
 id: Date.now(),
 resident_id: r.id,
 category: "受診",
 recorded_at: nowStr,
 content: `【往診・受診指示変更】医師指示: ${drInstructions || '特記なし'} / 特殊指示: ${specialNotes || 'なし'} / 次回予定: ${nextClinicDate || '未定'}`,
 staff_name: staff
 });

 db.save();
 closeModal("clinicInstructionModal");
 renderResidentDetail();
 checkGlobalAlerts();
 alert(`${r.name} 様の受診時指示および特殊指示を保存しました！個人記録へも変更履歴を自動転記しました。`);
}

// ==========================================
// 基本方針・見守り注意 クイック編集機能
// ==========================================
function openCarePlanModal(resId, focusField = '') {
 const targetId = (resId !== undefined && resId !== null && resId !== '') ? Number(resId) : Number(gState.selectedResidentId);
 const r = gState.residents ? gState.residents.find(x => Number(x.id) === targetId) : null;
 if (!r) {
 console.warn("[openCarePlanModal] Resident not found:", resId, gState.selectedResidentId);
 return;
 }

 const titleEl = document.getElementById("carePlanModalTitle");
 if (titleEl) titleEl.textContent = ` 基本方針 ＆ ケアプラン目標の変更 (${r.name} 様)`;
 const idEl = document.getElementById("carePlanResidentId");
 if (idEl) idEl.value = r.id;
 const goalEl = document.getElementById("quickCarePlanGoal");
 if (goalEl) goalEl.value = r.care_plan_goal || "";
 const sensorEl = document.getElementById("quickSensorAlert");
 if (sensorEl) sensorEl.value = r.sensor_alert || "";
 const bphMaxEl = document.getElementById("quickBpHMax");
 if (bphMaxEl) bphMaxEl.value = r.bp_high_max || "";
 const bphMinEl = document.getElementById("quickBpHMin");
 if (bphMinEl) bphMinEl.value = r.bp_high_min || "";
 const tempEl = document.getElementById("quickTempMax");
 if (tempEl) tempEl.value = r.temp_max || "";
 const spo2El = document.getElementById("quickSpo2Min");
 if (spo2El) spo2El.value = r.spo2_min || "";

 const modal = document.getElementById("carePlanModal");
 if (modal) {
 modal.style.display = "flex";
 modal.style.zIndex = "2500";
 }

 setTimeout(() => {
 if (focusField === 'sensor' && sensorEl) {
 sensorEl.focus();
 sensorEl.select?.();
 } else if (goalEl) {
 goalEl.focus();
 }
 }, 100);
}

function submitCarePlanModal() {
 const idEl = document.getElementById("carePlanResidentId");
 if (!idEl) return;
 const id = parseInt(idEl.value, 10);
 const r = gState.residents ? gState.residents.find(x => Number(x.id) === id) : null;
 if (!r) return;

 const cpOld = Object.assign({}, r); // [Claude修正] 変更前の内容を利用者の変更履歴に残す
 r.care_plan_goal = document.getElementById("quickCarePlanGoal").value.trim();
 r.sensor_alert = document.getElementById("quickSensorAlert").value.trim();
 r.bp_high_max = document.getElementById("quickBpHMax").value ? parseInt(document.getElementById("quickBpHMax").value, 10) : null;
 r.bp_high_min = document.getElementById("quickBpHMin").value ? parseInt(document.getElementById("quickBpHMin").value, 10) : null;
 r.temp_max = document.getElementById("quickTempMax").value ? parseFloat(document.getElementById("quickTempMax").value) : null;
 r.spo2_min = document.getElementById("quickSpo2Min").value ? parseInt(document.getElementById("quickSpo2Min").value, 10) : null;

 cpAppendEditHistory(r, cpOld, ["name", "room_no", "care_level", "status", "birth_date", "policy_stamp", "emergency_contact", "family_wishes", "life_history", "diseases", "paralysis", "allergies", "diet_type", "oral_state", "dr_instructions", "care_plan_goal", "sensor_alert", "bp_high_max", "bp_high_min", "temp_max", "spo2_min", "pulse_max", "pulse_min"]);
 db.save();
 closeModal("carePlanModal");
 renderResidentDetail();
 alert(`${r.name} 様の基本方針・ケアプラン目標・バイタル基準値を更新しました！`);
}

// ==========================================
// 身体状況・食形態 クイック編集機能
// ==========================================
function openBodyConditionModal(resId, focusField = '') {
 const targetId = (resId !== undefined && resId !== null && resId !== '') ? Number(resId) : Number(gState.selectedResidentId);
 const r = gState.residents ? gState.residents.find(x => Number(x.id) === targetId) : null;
 if (!r) {
 console.warn("[openBodyConditionModal] Resident not found:", resId, gState.selectedResidentId);
 return;
 }

 const titleEl = document.getElementById("bodyConditionModalTitle");
 if (titleEl) titleEl.textContent = `身体状況 ＆ 食形態・口腔状態・病歴の変更 (${r.name} 様)`;
 
 const idEl = document.getElementById("bodyConditionResidentId");
 if (idEl) idEl.value = r.id;
 
 const disEl = document.getElementById("quickDiseases");
 if (disEl) disEl.value = r.diseases || "";
 
 const parEl = document.getElementById("quickParalysis");
 if (parEl) parEl.value = r.paralysis || "";
 
 const algEl = document.getElementById("quickAllergies");
 if (algEl) algEl.value = r.allergies || "";
 
 const dietSel = document.getElementById("quickDietType");
 if (dietSel) {
 let found = false;
 for (let i = 0; i < dietSel.options.length; i++) {
 if (dietSel.options[i].value === r.diet_type) {
 dietSel.selectedIndex = i;
 found = true;
 break;
 }
 }
 if (!found && r.diet_type) {
 const opt = document.createElement("option");
 opt.value = r.diet_type;
 opt.textContent = r.diet_type;
 dietSel.appendChild(opt);
 dietSel.value = r.diet_type;
 } else if (!r.diet_type) {
 dietSel.value = ""; // [Claude修正] 未登録を「普通食」と表示しない
 }
 }

 const oralEl = document.getElementById("quickOralState");
 if (oralEl) oralEl.value = r.oral_state || "";

 const modal = document.getElementById("bodyConditionModal");
 if (modal) {
 modal.style.display = "flex";
 modal.style.zIndex = "2500";
 }

 setTimeout(() => {
 if (focusField === 'diseases' && disEl) {
 disEl.focus();
 disEl.select?.();
 } else if (focusField === 'paralysis' && parEl) {
 parEl.focus();
 parEl.select?.();
 } else if (focusField === 'allergies' && algEl) {
 algEl.focus();
 algEl.select?.();
 } else if (disEl) {
 disEl.focus();
 }
 }, 100);
}

function submitBodyConditionModal() {
 const idEl = document.getElementById("bodyConditionResidentId");
 if (!idEl) return;
 const id = parseInt(idEl.value, 10);
 const r = gState.residents ? gState.residents.find(x => Number(x.id) === id) : null;
 if (!r) return;

 const disEl = document.getElementById("quickDiseases");
 const parEl = document.getElementById("quickParalysis");
 const algEl = document.getElementById("quickAllergies");
 const dietEl = document.getElementById("quickDietType");
 const oralEl = document.getElementById("quickOralState");

 const cpOld = Object.assign({}, r); // [Claude修正] 変更前の内容（病歴・アレルギー等）を利用者の変更履歴に残す
 if (disEl) r.diseases = disEl.value.trim();
 if (parEl) r.paralysis = parEl.value.trim();
 if (algEl) r.allergies = algEl.value.trim();
 if (dietEl) r.diet_type = dietEl.value;
 if (oralEl) r.oral_state = oralEl.value.trim();
 cpAppendEditHistory(r, cpOld, ["name", "room_no", "care_level", "status", "birth_date", "policy_stamp", "emergency_contact", "family_wishes", "life_history", "diseases", "paralysis", "allergies", "diet_type", "oral_state", "dr_instructions", "care_plan_goal", "sensor_alert", "bp_high_max", "bp_high_min", "temp_max", "spo2_min", "pulse_max", "pulse_min"]);

 db.save();
 closeModal("bodyConditionModal");
 renderResidentDetail();
 alert(`${r.name} 様の身体状況・食形態・病歴を更新しました！`);
}

// 職員・認印管理
function openStaffModal() {
 if (!isCurrentStaffAdminOrClerk()) {
 alert("職員管理は管理者または事務員のみ操作可能です。");
 return;
 }
 document.getElementById("newStaffName").value = "";
 document.getElementById("newStaffRole").value = "";
 if (document.getElementById("newStaffUnit")) document.getElementById("newStaffUnit").innerHTML = cpUnitOptionsHtml("", "担当の区分なし");
 renderStaffModalList();
 document.getElementById("staffModal").style.display = "flex";
}

function renderStaffModalList() {
 const container = document.getElementById("staffModalList");
 if (!container) return;
 container.innerHTML = "";

 if (!gState.stamps || gState.stamps.length === 0) {
 container.innerHTML = '<div style="padding:10px; color:var(--text-muted); font-size:13px;">登録されている職員はいません。</div>';
 return;
 }

 gState.stamps.forEach((s, idx) => {
 const row = document.createElement("div");
 row.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding:8px 12px; border-bottom:1px solid #eef2ef; gap:8px;";

 // 役職バッジの色分け
 const rank = getStaffRoleRank(s.role, s.name);
 let badgeStyle = "background:#eef2ef; color:#4a5852;";
 if (rank === 1) badgeStyle = "background:#fef3c7; color:#92400e; font-weight:bold;";
 else if (rank <= 4) badgeStyle = "background:#f1f6f3; color:#1a4f3d; font-weight:bold;";
 else if (rank === 5) badgeStyle = "background:#f0fdf4; color:#15803d; font-weight:bold;";
 else if (rank <= 8) badgeStyle = "background:#faf5ff; color:#7e22ce;";

 row.innerHTML = `
 <div style="display:flex; align-items:center; gap:10px; flex:1; min-width:0;">
 <span class="hanko-stamp" style="height:26px; min-width:48px; padding:2px 8px; font-size:12px; letter-spacing:1px;">${escapeHtml(s.name)}</span>
 <strong style="font-size:14px; white-space:nowrap;">${escapeHtml(s.name)}</strong>
 <span style="font-size:13px; padding:2px 8px; border-radius:4px; ${badgeStyle} white-space:nowrap;">${escapeHtml(s.role || '職員')}</span>
 ${cpUnits().length ? `<select class="form-control staff-unit-sel" data-staff="${escapeHtml(s.name)}" aria-label="${escapeHtml(s.name)}の担当の区分" onchange="moveStaffUnit(this.dataset.staff, this.value)">${cpUnitOptionsHtml(s.unit_id, "担当の区分なし")}</select>` : ""}
 </div>
 <div style="display:flex; align-items:center; gap:4px;">
 <button class="btn btn-secondary" style="font-size:11px; padding:2px 6px;" title="上へ移動" onclick="moveStaffOrder(${idx}, -1)" ${idx === 0 ? 'disabled style="opacity:0.4; padding:2px 6px;"' : ''}>▲</button>
 <button class="btn btn-secondary" style="font-size:11px; padding:2px 6px;" title="下へ移動" onclick="moveStaffOrder(${idx}, 1)" ${idx === gState.stamps.length - 1 ? 'disabled style="opacity:0.4; padding:2px 6px;"' : ''}>▼</button>
 <button class="btn btn-secondary" style="font-size:11px; padding:2px 8px; color:#dc2626;" onclick="deleteStaffStamp(${idx})">削除</button>
 </div>
 `;
 container.appendChild(row);
 });
}

function autoSortStaffByRank() {
 gState.stamps = sortStaffList(gState.stamps);
 db.data.stamps = gState.stamps;
 db.save();
 renderStaffSelect();
 renderStaffModalList();
 alert("登録職員を役職・序列順（施設長・管理者 → リーダー → 看護 → 介護 → 事務）に整列しました！");
}

function moveStaffOrder(index, direction) {
 const newIndex = index + direction;
 if (newIndex < 0 || newIndex >= gState.stamps.length) return;
 const temp = gState.stamps[index];
 gState.stamps[index] = gState.stamps[newIndex];
 gState.stamps[newIndex] = temp;
 db.data.stamps = gState.stamps;
 db.save();
 renderStaffSelect();
 renderStaffModalList();
}

function submitNewStaffStamp() {
 const name = document.getElementById("newStaffName").value.trim();
 const role = document.getElementById("newStaffRole").value.trim();
 const unitSel = document.getElementById("newStaffUnit");
 const unitId = unitSel && unitSel.value ? Number(unitSel.value) : null;
 if (!name) {
 alert("職員名を入力してください。");
 return;
 }
 // [Claude修正] 役職を選ばずに追加すると「介護職員」になっていた → 選んでもらう
 if (!role) {
 alert("役職を選んでください。");
 return;
 }

 const exists = gState.stamps.some(s => s.name === name);
 if (exists) {
 alert(`「${name}」は既に登録されています。`);
 return;
 }

 const cpNewStaff = { name: name, role: role, pin: "0000", is_initial_pin: true };
 if (unitId) cpNewStaff.unit_id = unitId;
 gState.stamps.push(cpNewStaff);
 // 役職・序列順（偉い人順）に自動整列
 gState.stamps = sortStaffList(gState.stamps);
 db.data.stamps = gState.stamps;
 db.save();

 renderStaffSelect();
 renderStaffModalList();
 document.getElementById("newStaffName").value = "";
 document.getElementById("newStaffRole").value = "";
 alert(`「${name} (${role})」を登録しました！（役職・序列順に配置されました）`);
}

function deleteStaffStamp(index) {
 if (gState.stamps.length <= 1) {
 alert("最低1名の職員が必要です。");
 return;
 }
 const target = gState.stamps[index];
 if (!target) return;
 if (confirm(`職員「${target.name}」を削除しますか？\n（退職などの記録として、削除した日時と職員は残ります）`)) {
 // [Claude修正] 職員名簿から外した記録を staff_archive に残す（過去の記録の記録者が誰だったか確認できるように）
 if (!Array.isArray(db.data.staff_archive)) db.data.staff_archive = [];
 const cpArch = JSON.parse(JSON.stringify(target)); delete cpArch.pin; delete cpArch.password; delete cpArch.pin_hash;
 db.data.staff_archive.push({ id: Date.now(), staff: cpArch, removed_at: toLocalDateTimeStr(new Date()), removed_by: cpLedgerStaff() });
 gState.stamps.splice(index, 1);
 db.data.stamps = gState.stamps;
 db.save();
 renderStaffSelect();
 renderStaffModalList();
 }
}

// 発注申請
function openOrderModal() {
 const dateInput = document.getElementById("orderDateInput");
 if (dateInput) dateInput.value = toLocalDateStr(new Date());

 const suppSel = document.getElementById("orderSupplierSelect");
 if (suppSel) {
   suppSel.innerHTML = "";
   gState.suppliers.forEach(s => {
     const opt = document.createElement("option");
     opt.value = s.id;
     opt.textContent = s.name;
     suppSel.appendChild(opt);
   });
 }
 onSupplierChangeInOrder();
 document.getElementById("orderModal").style.display = "flex";
}

function openOrderModalWithItem(itemId) {
 openOrderModal();
 const item = (gState.inventory || []).find(i => i.id === itemId);
 if (item) {
 if (item.supplier_id) {
 document.getElementById("orderSupplierSelect").value = item.supplier_id;
 onSupplierChangeInOrder();
 }
 document.getElementById("orderItemSelect").value = item.name;
 
 // 平常時までの不足数を初期発注数量として自動算出
 const normalStock = item.normal_stock || (item.safety_stock * 2);
 const deficit = Math.max(1, normalStock - item.current_stock);
 const qtyEl = document.getElementById("orderQty");
 if (qtyEl) qtyEl.value = deficit;

 const reasonEl = document.getElementById("orderReason");
 if (reasonEl) reasonEl.value = `平常時定数(${normalStock}${item.unit})までの補充発注 (現在庫: ${item.current_stock}${item.unit})`;

 onItemChangeInOrder();
 calcOrderTotal();
 }
}

function adjustOrderQty(delta) {
 const el = document.getElementById("orderQty");
 if (!el) return;
 let cur = parseInt(el.value, 10) || 1;
 cur = Math.max(1, cur + delta);
 el.value = cur;
 calcOrderTotal();
}

function setOrderQtyToNormalDeficit() {
 const itemName = document.getElementById("orderItemSelect")?.value;
 const item = (gState.inventory || []).find(i => i.name === itemName);
 if (item) {
 const normalStock = item.normal_stock || (item.safety_stock * 2);
 const deficit = Math.max(1, normalStock - item.current_stock);
 const el = document.getElementById("orderQty");
 if (el) {
 el.value = deficit;
 calcOrderTotal();
 }
 }
}

function onSupplierChangeInOrder() {
 const suppId = parseInt(document.getElementById("orderSupplierSelect").value, 10);
 const supp = gState.suppliers.find(s => s.id === suppId);
 const itemSel = document.getElementById("orderItemSelect");
 itemSel.innerHTML = "";

 if (supp && supp.items) {
 supp.items.forEach(i => {
 const opt = document.createElement("option");
 opt.value = i.name;
 opt.textContent = `${i.name} (¥${i.unit_price}/${i.unit})`;
 opt.dataset.price = i.unit_price;
 itemSel.appendChild(opt);
 });
 }
 onItemChangeInOrder();
}

function onItemChangeInOrder() {
 const itemSel = document.getElementById("orderItemSelect");
 const selectedOpt = itemSel.selectedOptions[0];
 const price = selectedOpt ? parseInt(selectedOpt.dataset.price || 0, 10) : 0;
 document.getElementById("orderUnitPrice").value = price;

 const itemName = itemSel.value;
 const invItem = (gState.inventory || []).find(i => i.name === itemName);
 const hintEl = document.getElementById("orderStockHint");
 const qtyEl = document.getElementById("orderQty");

 if (invItem) {
 const normalStock = invItem.normal_stock || (invItem.safety_stock * 2);
 const deficit = Math.max(1, normalStock - invItem.current_stock);

 if (qtyEl && (!qtyEl.value || qtyEl.value === "0")) {
 qtyEl.value = deficit;
 }

 if (hintEl) {
 hintEl.style.display = "block";
 const isLow = invItem.current_stock <= invItem.safety_stock;
 const headerEl = document.getElementById("orderStockHintHeader");
 if (headerEl) {
 headerEl.innerHTML = `
 <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:4px;">
 <span> <strong>在庫現況:</strong> 現在庫: <strong style="${isLow ? 'color:#dc2626;' : ''}">${invItem.current_stock}${invItem.unit}</strong> / 安全基準: ${invItem.safety_stock}${invItem.unit} / 平常時定数: <strong>${normalStock}${invItem.unit}</strong></span>
 <span style="font-weight:bold; color:#1a4f3d;"> 平常時不足: +${deficit}${invItem.unit}</span>
 </div>
 `;
 }
 }
 } else {
 if (hintEl) hintEl.style.display = "none";
 }

 calcOrderTotal();
}

function calcOrderTotal() {
 const qtyEl = document.getElementById("orderQty");
 const qty = parseInt(qtyEl?.value || 1, 10);
 const price = parseInt(document.getElementById("orderUnitPrice").value || 0, 10);
 document.getElementById("orderTotalPrice").value = qty * price;

 const itemName = document.getElementById("orderItemSelect")?.value;
 const invItem = (gState.inventory || []).find(i => i.name === itemName);
 const projText = document.getElementById("orderProjectedStockText");
 if (invItem && projText) {
 const normalStock = invItem.normal_stock || (invItem.safety_stock * 2);
 const after = invItem.current_stock + qty;
 const diffToNormal = after - normalStock;
 let note = diffToNormal === 0 ? "（平常時定数とピッタリ一致 ）" : (diffToNormal > 0 ? `（平常時定数より ＋${diffToNormal}${invItem.unit} 多め）` : `（平常時定数まであと ${Math.abs(diffToNormal)}${invItem.unit} 不足）`);
 projText.innerHTML = `※ 発注納品後の想定在庫: <strong>${after}${invItem.unit}</strong> <span style="color:#0369a1; font-weight:bold;">${note}</span>`;
 }
}

function submitOrderApply() {
 const suppId = parseInt(document.getElementById("orderSupplierSelect").value, 10);
 const supp = gState.suppliers.find(s => s.id === suppId);
 const itemName = document.getElementById("orderItemSelect").value;
 const qty = parseInt(document.getElementById("orderQty").value, 10) || 1;
 const unitPrice = parseInt(document.getElementById("orderUnitPrice").value, 10) || 0;
 const totalPrice = qty * unitPrice;
 const reason = document.getElementById("orderReason").value;
 const applicant = (gState.session && gState.session.staffName) ? gState.session.staffName : ((document.getElementById("currentStaff")?.value) || "担当者");
 const orderDate = (document.getElementById("orderDateInput")?.value) || toLocalDateStr(new Date());

 db.data.orders.unshift({
   id: Date.now(),
   ordered_at: orderDate,
   order_date: orderDate,
   supplier_id: suppId,
   supplier_name: supp ? supp.name : "",
   item_name: itemName,
   quantity: qty,
   unit_price: unitPrice,
   total_price: totalPrice,
   reason: reason,
   applicant: applicant,
   status: "申請中"
 });
 
 // 新規申請時は管理者向け未承認アラートの非表示を解除
 undismissAlert('admin_pending_orders');

 db.save();

 closeModal("orderModal");
 loadOfficeData();
 checkGlobalAlerts();
 alert("発注申請を提出しました（上司承認待ちへ）！要発注アラートを発注手配済みに更新し、管理者の認証アラートへ通知しました。");
}

function updateResidentStatus(resId, status) {
 const r = gState.residents.find(x => x.id === resId);
 if (r && cpIsDischarged(r)) { alert("退所した方を戻すときは「退所を取り消す」から行ってください。"); renderResidentDetail(); return; }
 if (r) {
 r.status = status;
 db.save();
 renderResidentsStrip();
	initGlobalTimeSync();
	
 renderResidentDetail();
 if (gState.activeCareTab === "vitals") renderVitalsTable();
 if (gState.activeCareTab === "meal") renderMealsTable();
 alert(`在籍ステータスを「${status}」に更新しました`);
 }
}

function renderCareExpiryNotes() {
 const area = document.getElementById("careExpiryNotesArea");
 // [Claude修正] この表示欄は「要介護認定・更新管理」タブへの作り替えで無くなったため、無い場合は何もしない
 // (旧実装のままだと、事務ポータルを開いた時点でエラーになり画面が表示されなかった)
 if (!area) return;
 area.innerHTML = "";
 const today = new Date();

 cpCurrentResidents().forEach(r => {
 if (r.care_expiry_date) {
 const expiryDate = new Date(r.care_expiry_date);
 const diffDays = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
 const isUrgent = diffDays <= 30;

 const item = document.createElement("div");
 item.style.padding = "8px 12px";
 item.style.borderRadius = "6px";
 item.style.background = isUrgent ? "#fee2e2" : "#fef3c7";
 item.style.border = `1px solid ${isUrgent ? '#fca5a5' : '#fde68a'}`;
 item.style.display = "flex";
 item.style.justifyContent = "space-between";
 item.style.alignItems = "center";

 item.innerHTML = `
 <div>
 <strong>${r.room_no}号室 ${r.name} 様</strong> (${r.care_level})
 <span style="margin-left:12px;">満了日: ${r.care_expiry_date}</span>
 </div>
 <div>
 <strong style="${isUrgent ? 'color:#dc2626;' : 'color:#b45309;'}">あと ${diffDays} 日で満了</strong>
 </div>
 `;
 area.appendChild(item);
 }
 });
}

// [Claude修正] openModal() が未定義のまま呼ばれており、介護記録の編集・巡視定型文の編集・
// 皮膚シェーマ図の各画面がエラーで開かなかった。他のモーダルと同じ表示方法で定義する。
function openModal(id) {
 const el = document.getElementById(id);
 if (!el) {
 alert("画面が見つかりません: " + id);
 return;
 }
 el.style.display = "flex";
}

function closeModal(id) {
 const el = document.getElementById(id);
 if (el) el.style.display = "none";
 if (id === "diseaseModal" && typeof closeTermExplanation === "function") {
 closeTermExplanation();
 }
}

async function openShareModal() {
 const modal = document.getElementById("shareModal");
 if (!modal) return;
 modal.style.display = "flex";
 if (db) {
 db.renderShareModalUrls();
 if (!db.isServerMode) return; // [Claude修正] 単体起動ではサーバーに問い合わせない
 try {
 const res = await cpApiFetch('/api/ip');
 if (res.ok) {
 const data = await res.json();
 if (data.tunnel_url && data.tunnel_url.trim() !== "") {
 const prev = localStorage.getItem("care_portal_tunnel_url") || "";
 if (prev !== data.tunnel_url.trim()) {
 localStorage.setItem("care_portal_tunnel_url", data.tunnel_url.trim());
 db.renderShareModalUrls();
 }
 }
 }
 } catch (_) {}
 }
}

function copyShareUrl(url) {
 if (navigator.clipboard) {
 navigator.clipboard.writeText(url).then(() => {
 alert(" 接続URLをコピーしました！\n" + url + "\n\nスマホやタブレット等のブラウザに貼り付けて開いてください。\nどこからでも同じデータがリアルタイムで共有されます。");
 }).catch(() => {
 prompt("以下の接続URLをコピーして開いてください:", url);
 });
 } else {
 prompt("以下の接続URLをコピーして開いてください:", url);
 }
}

async function promptChangeTunnelUrl() {
 const current = localStorage.getItem("care_portal_tunnel_url") || (window.location.protocol === "https:" ? window.location.origin : "");
 const newUrl = prompt("外部接続用のCloudflare Tunnel URLを入力してください:", current);
 if (newUrl && newUrl.trim() !== "") {
 const cleanUrl = newUrl.trim();
 localStorage.setItem("care_portal_tunnel_url", cleanUrl);
 if (db) db.renderShareModalUrls();
 try {
 await cpApiFetch('/api/ip', {
 method: 'POST',
 headers: { 'Content-Type': 'text/plain; charset=utf-8' },
 body: cleanUrl
 });
 } catch (_) {}
 alert("接続URLとQRコードを更新しました！\n" + cleanUrl);
 }
}

function reloadStateFromDb() {
 if (!db || !db.data) return;
 updateFacilityNameUI();
 // [Claude修正] ログイン画面の表示中にサーバーのデータが届いたら、職員一覧を最新に作り直す
 // (起動直後は端末内の古いデータで一覧が作られ、新しい職員がログインできないことがあった)
 const loginSecEl = document.getElementById("loginSection");
 if (loginSecEl && loginSecEl.style.display !== "none" && typeof renderLoginStaffSelect === "function") {
 const selEl = document.getElementById("loginStaffSelect");
 const prevSel = selEl ? selEl.value : "";
 renderLoginStaffSelect();
 if (selEl && prevSel && [...selEl.options].some(o => o.value === prevSel)) selEl.value = prevSel;
 }
 gState.residents = db.data.residents;
 gState.inventory = db.data.inventory;
 gState.suppliers = db.data.suppliers;
 gState.stamps = db.data.stamps;
 ensureStaffPinData();
 updateStaffRoleUI();
 gState.templates = db.data.templates;
 gState.recreations = db.data.recreations;
 gState.emergencySupplies = db.data.emergency_supplies;
 gState.care_summaries = db.data.care_summaries;
 gState.body_schema_pins = db.data.body_schema_pins || [];

 if (typeof renderBodySchemaPins === 'function') renderBodySchemaPins();
 if (typeof renderQuickTemplates === 'function') renderQuickTemplates();
 if (typeof renderFsQuickTemplates === 'function') renderFsQuickTemplates();
 if (typeof renderStaffSelect === 'function') renderStaffSelect();
 if (typeof renderResidentsStrip === 'function') renderResidentsStrip();
	initGlobalTimeSync();
	
 if (typeof renderResidentDetail === 'function') renderResidentDetail();
 if (typeof renderCalendar === 'function') renderCalendar();
 if (typeof loadDateRecords === 'function') loadDateRecords(gState.selectedDate);
 if (typeof checkGlobalAlerts === 'function') checkGlobalAlerts();
 if (gState.activePortal === "office") {
 if (typeof loadOfficeData === 'function') loadOfficeData();
 }
}

function setupEventListeners() {
 setInterval(() => {
 const preview = document.getElementById("recordTimePreview");
 if (preview) {
 const cur = new Date();
 const timeStr = cur.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
 preview.textContent = "現在: " + cur.toLocaleDateString() + " " + timeStr;
 }
 }, 1000);
}

// ==========================================
// 写真・重要書類保管庫 管理機能
// ==========================================
let currentPhotoCategory = 'documents';
let currentPickedPhotoDataUrl = null;

function openPhotoModal(category) {
 const modal = document.getElementById("photoModal");
 if (!modal) return;
 const res = gState.residents ? gState.residents.find(x => x.id === gState.selectedResidentId) : null;
 const titleEl = document.getElementById("photoModalTitle");
 if (titleEl) {
 titleEl.textContent = res ? ` ${res.name} 様の写真・重要書類保管庫` : " 写真・重要書類保管庫";
 }

 const formArea = document.getElementById("addPhotoFormArea");
 if (formArea) formArea.style.display = "none";
 resetPhotoForm();

 switchPhotoCategory(category || 'documents');
 modal.style.display = "flex";
}

function switchPhotoCategory(cat) {
 currentPhotoCategory = cat;
 const btnDoc = document.getElementById("tabBtnDocPhotos");
 const btnPersonal = document.getElementById("tabBtnPersonalPhotos");
 if (btnDoc && btnPersonal) {
 if (cat === "documents") {
 btnDoc.className = "btn btn-primary";
 btnPersonal.className = "btn btn-outline";
 } else {
 btnDoc.className = "btn btn-outline";
 btnPersonal.className = "btn btn-primary";
 }
 }
 const selectCat = document.getElementById("photoNewCategory");
 if (selectCat) selectCat.value = cat;

 renderPhotoGrid();
}

function renderPhotoGrid() {
 const grid = document.getElementById("photoGridArea");
 if (!grid) return;
 grid.innerHTML = "";

 const photos = (db.data.photos || []).filter(p => 
 !p.voided && p.resident_id === gState.selectedResidentId && p.category === currentPhotoCategory
 );

 if (photos.length === 0) {
 const isDoc = currentPhotoCategory === 'documents';
 grid.innerHTML = `
 <div style="grid-column: 1 / -1; text-align:center; padding:36px 12px; color:var(--text-muted); background:#f6f8f6; border-radius:8px; border:1px dashed #cdd6d0;">
 <div style="font-size:32px; margin-bottom:8px;">${isDoc ? '' : ''}</div>
 <div style="font-weight:bold; font-size:14px; margin-bottom:4px;">
 ${isDoc ? '重要書類・同意書はまだありません' : '個人写真はまだありません'}
 </div>
 <div style="font-size:12px;">右上の「 写真・書類の追加」から撮影・アップロードするか、<br>PCの保存フォルダに直接ファイルを入れてください。</div>
 </div>
 `;
 return;
 }

 photos.forEach(p => {
 const card = document.createElement("div");
 card.style.cssText = "background:#fff; border:1px solid #dfe5e1; border-radius:8px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.06); display:flex; flex-direction:column; transition:transform 0.15s, box-shadow 0.15s;";
 card.onmouseenter = () => { card.style.transform = "translateY(-2px)"; card.style.boxShadow = "0 4px 10px rgba(0,0,0,0.12)"; };
 card.onmouseleave = () => { card.style.transform = "none"; card.style.boxShadow = "0 1px 3px rgba(0,0,0,0.06)"; };

 const safeTitle = (p.title || "").replace(/'/g, "\\'");
 card.innerHTML = `
 <div style="position:relative; width:100%; height:130px; background:#1c2622; cursor:pointer; overflow:hidden; display:flex; align-items:center; justify-content:center;" onclick="openLightbox('${p.url}', '${safeTitle}')">
 <img src="${p.url}" alt="${p.title || '写真'}" style="width:100%; height:100%; object-fit:cover;" onerror="this.onerror=null; this.src=''; this.parentElement.innerHTML='<span style=\\'color:#94a19a; font-size:12px;\\'> 画像読込エラー</span>';">
 <div style="position:absolute; bottom:4px; right:4px; background:rgba(0,0,0,0.6); color:white; font-size:10px; padding:2px 6px; border-radius:4px;"> 拡大</div>
 </div>
 <div style="padding:10px; flex:1; display:flex; flex-direction:column; justify-content:space-between;">
 <div>
 <div style="font-weight:bold; font-size:13px; color:#22302b; margin-bottom:4px; line-height:1.3; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;" title="${p.title || ''}">
 ${p.title || "名称未設定"}
 </div>
 <div style="font-size:11px; color:#5f6d66;"> ${p.uploaded_at || "-"}</div>
 <div style="font-size:11px; color:#5f6d66;"> 担当: ${p.uploader || "-"}</div>
 </div>
 <div style="margin-top:8px; display:flex; justify-content:space-between; align-items:center; border-top:1px solid #eef2ef; padding-top:6px;">
 <button class="btn btn-secondary" style="font-size:11px; padding:3px 8px;" onclick="openLightbox('${p.url}', '${safeTitle}')">拡大表示</button>
 <button class="btn" style="background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5; font-size:11px; padding:3px 8px;" onclick="deletePhoto(${p.id})">削除</button>
 </div>
 </div>
 `;
 grid.appendChild(card);
 });
}

function toggleAddPhotoForm() {
 const form = document.getElementById("addPhotoFormArea");
 if (!form) return;
 if (form.style.display === "none" || !form.style.display) {
 resetPhotoForm();
 form.style.display = "block";
 const titleInput = document.getElementById("photoNewTitle");
 if (titleInput) titleInput.focus();
 } else {
 form.style.display = "none";
 }
}

function resetPhotoForm() {
 currentPickedPhotoDataUrl = null;
 const titleInput = document.getElementById("photoNewTitle");
 if (titleInput) titleInput.value = "";
 const fileInput = document.getElementById("photoFileInput");
 if (fileInput) fileInput.value = "";
 const previewContainer = document.getElementById("photoPreviewContainer");
 if (previewContainer) previewContainer.style.display = "none";
 const previewImg = document.getElementById("photoPreviewImg");
 if (previewImg) previewImg.src = "";
 const selectCat = document.getElementById("photoNewCategory");
 if (selectCat) selectCat.value = currentPhotoCategory;
}

function onPhotoFilePicked(event) {
 const file = event.target.files && event.target.files[0];
 if (!file) return;

 const titleInput = document.getElementById("photoNewTitle");
 if (titleInput && !titleInput.value.trim()) {
 const baseName = file.name.replace(/\.[^/.]+$/, "");
 titleInput.value = baseName;
 }

 const reader = new FileReader();
 reader.onload = function(e) {
 const rawDataUrl = e.target.result;
 const img = new Image();
 img.onload = function() {
 const maxDim = 1200;
 let w = img.width;
 let h = img.height;
 if (w > maxDim || h > maxDim) {
 if (w > h) {
 h = Math.round((h * maxDim) / w);
 w = maxDim;
 } else {
 w = Math.round((w * maxDim) / h);
 h = maxDim;
 }
 }
 const canvas = document.createElement("canvas");
 canvas.width = w;
 canvas.height = h;
 const ctx = canvas.getContext("2d");
 ctx.drawImage(img, 0, 0, w, h);
 currentPickedPhotoDataUrl = canvas.toDataURL("image/jpeg", 0.82);

 const previewContainer = document.getElementById("photoPreviewContainer");
 const previewImg = document.getElementById("photoPreviewImg");
 if (previewContainer && previewImg) {
 previewImg.src = currentPickedPhotoDataUrl;
 previewContainer.style.display = "block";
 }
 };
 img.src = rawDataUrl;
 };
 reader.readAsDataURL(file);
}

function saveNewPhoto() {
 if (!currentPickedPhotoDataUrl) {
 alert("写真または書類の画像ファイルを選択してください。");
 return;
 }

 const cat = document.getElementById("photoNewCategory").value || currentPhotoCategory;
 let title = document.getElementById("photoNewTitle").value.trim();
 if (!title) {
 title = (cat === "documents" ? "重要書類 " : "写真 ") + new Date().toLocaleDateString();
 }

 const staff = (document.getElementById("currentStaff") && document.getElementById("currentStaff").value) || "職員";
 const d = new Date();
 const nowStr = d.getFullYear() + "-" +
 String(d.getMonth() + 1).padStart(2, "0") + "-" +
 String(d.getDate()).padStart(2, "0") + " " +
 String(d.getHours()).padStart(2, "0") + ":" +
 String(d.getMinutes()).padStart(2, "0");

 if (!db.data.photos) db.data.photos = [];

 const newPhoto = {
 id: Date.now(),
 resident_id: gState.selectedResidentId,
 category: cat,
 title: title,
 url: currentPickedPhotoDataUrl,
 uploaded_at: nowStr,
 uploader: staff
 };

 db.data.photos.unshift(newPhoto);
 db.save();

 resetPhotoForm();
 const formArea = document.getElementById("addPhotoFormArea");
 if (formArea) formArea.style.display = "none";

 currentPhotoCategory = cat;
 switchPhotoCategory(cat);
 if (typeof renderResidentDetail === 'function') renderResidentDetail();

 alert(" " + (cat === "documents" ? "重要書類" : "写真") + "を登録・保存しました！");
}

function deletePhoto(id) {
 // [Claude修正] 写真・書類は消さずに「取消」として残す（理由必須）
 const ph = (db.data.photos || []).find(p => p.id === id);
 if (!cpVoidRecord(ph, "この写真・書類")) return;
 db.save();
 renderPhotoGrid();
 if (typeof renderResidentDetail === 'function') renderResidentDetail();
}

function openPCFolder() {
 cpApiFetch("/api/open-folder?type=" + encodeURIComponent(currentPhotoCategory))
 .then(r => r.json())
 .then(data => {
 if (data && data.success) {
 alert(" PCのエクスプローラーで保存フォルダを開きました。\nファイルを直接追加・確認できます。");
 } else {
 alert("フォルダ場所:\ncare_portal\\data\\photos\\" + currentPhotoCategory);
 }
 })
 .catch(() => {
 alert("フォルダ場所:\ncare_portal\\data\\photos\\" + currentPhotoCategory);
 });
}

function openLightbox(src, caption) {
 const modal = document.getElementById("lightboxModal");
 const img = document.getElementById("lightboxImg");
 const cap = document.getElementById("lightboxCaption");
 if (!modal || !img) return;

 img.src = src;
 if (cap) cap.textContent = caption || "";
 modal.style.display = "flex";
}

// ==========================================
// 7. 月間勤務表・シフト管理 (自動生成・手動修正・特例配慮・週休2日・夜勤2名)
// ==========================================

let gShiftEditingCell = { staffName: null, day: null, yearMonth: null };

function getShiftYearMonth() {
 const sel = document.getElementById("shiftMonthSelector");
 if (sel && sel.value) {
 gState.currentShiftMonth = sel.value;
 return sel.value;
 }
 const defaultYm = gState.currentShiftMonth || toLocalDateStr(new Date()).slice(0, 7);
 gState.currentShiftMonth = defaultYm;
 if (sel) sel.value = defaultYm;
 return defaultYm;
}

function changeShiftMonth(delta) {
 const ym = getShiftYearMonth();
 const [yearStr, monthStr] = ym.split("-");
 let y = parseInt(yearStr, 10);
 let m = parseInt(monthStr, 10) + delta;
 if (m < 1) {
 m = 12;
 y--;
 } else if (m > 12) {
 m = 1;
 y++;
 }
 const newYm = `${y}-${String(m).padStart(2, '0')}`;
 gState.currentShiftMonth = newYm;
 const sel = document.getElementById("shiftMonthSelector");
 if (sel) sel.value = newYm;
 renderShiftTable(newYm);
}

function onShiftMonthChange() {
 const sel = document.getElementById("shiftMonthSelector");
 if (sel && sel.value) {
 gState.currentShiftMonth = sel.value;
 renderShiftTable(sel.value);
 }
}

function generateMonthlyShiftAction() {
 const ym = getShiftYearMonth();
 const [y, m] = ym.split("-");
 const hopeCount = (db.data.shift_hope_offs || []).filter(h => h.year_month === ym).length;
 const hopeNotice = hopeCount > 0 ? `\n（登録済みの希望休 ${hopeCount}件 も最優先公休として自動反映されます）` : "";
 if (db.data.monthly_shifts && db.data.monthly_shifts[ym]) {
  if (!confirm(`${y}年${parseInt(m, 10)}月の勤務表シフトを再生成しますか？${hopeNotice}\n（手動修正された内容もリセットされます）`)) {
   return;
  }
 }
 generateMonthlyShiftData(ym);
 renderShiftTable(ym);
 alert(` ${y}年${parseInt(m, 10)}月の勤務表シフトを自動生成しました！\n・希望休配慮：全${hopeCount}件を最優先公休「休」として確定配置\n・最低人数：早出${cpStaffing().early}・日勤${cpStaffing().day}・遅出${cpStaffing().late}・夜勤${cpStaffing().night}・明け${cpStaffing().night}（同番NG配慮済）\n・管理者・計画作成担当者・相談員・事務員：日勤専従（土日祝・年末年始休み）\n・夜勤：区分（ユニット・フロア）ごとに1人ずつを優先\n・人数が足りない日は、表の下の集計が赤くなります`);
}

// 国民の祝日 ＆ 年末年始 (12/29〜1/3) 判定関数
function isHolidayOrYearEnd(year, month, day) {
 // 年末年始休暇: 12月29日〜12月31日、1月1日〜1月3日
 if (month === 12 && day >= 29) return { isHoliday: true, name: "年末休暇" };
 if (month === 1 && day <= 3) return { isHoliday: true, name: (day === 1 ? "元日" : "年始休暇") };

 // 春分・秋分の計算 (2000年〜2099年)
 const getVernalEquinox = y => Math.floor(20.8431 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
 const getAutumnEquinox = y => Math.floor(23.2488 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));

 // ハッピーマンデー (第N月曜日の日付)
 const getNthMonday = (y, m, n) => {
 const firstDow = new Date(y, m - 1, 1).getDay();
 const firstMonday = (firstDow <= 1) ? (1 - firstDow + 1) : (8 - firstDow + 1);
 return firstMonday + (n - 1) * 7;
 };

 let name = null;

 if (month === 1) {
 if (day === 1) name = "元日";
 else if (day === getNthMonday(year, 1, 2)) name = "成人の日";
 } else if (month === 2) {
 if (day === 11) name = "建国記念の日";
 else if (day === 23) name = "天皇誕生日";
 else if (day === 24 && new Date(year, 1, 23).getDay() === 0) name = "振替休日";
 } else if (month === 3) {
 const ve = getVernalEquinox(year);
 if (day === ve) name = "春分の日";
 else if (day === ve + 1 && new Date(year, 2, ve).getDay() === 0) name = "振替休日";
 } else if (month === 4) {
 if (day === 29) name = "昭和の日";
 else if (day === 30 && new Date(year, 3, 29).getDay() === 0) name = "振替休日";
 } else if (month === 5) {
 if (day === 3) name = "憲法記念日";
 else if (day === 4) name = "みどりの日";
 else if (day === 5) name = "こどもの日";
 else if (day === 6) {
 const d3 = new Date(year, 4, 3).getDay();
 const d4 = new Date(year, 4, 4).getDay();
 const d5 = new Date(year, 4, 5).getDay();
 if (d3 === 0 || d4 === 0 || d5 === 0) name = "振替休日";
 }
 } else if (month === 7) {
 if (day === getNthMonday(year, 7, 3)) name = "海の日";
 } else if (month === 8) {
 if (day === 11) name = "山の日";
 else if (day === 12 && new Date(year, 7, 11).getDay() === 0) name = "振替休日";
 } else if (month === 9) {
 const respectDay = getNthMonday(year, 9, 3);
 const ae = getAutumnEquinox(year);
 if (day === respectDay) name = "敬老の日";
 else if (day === ae) name = "秋分の日";
 else if (day === ae + 1 && new Date(year, 8, ae).getDay() === 0) name = "振替休日";
 else if (respectDay + 2 === ae && day === respectDay + 1) name = "国民の休日";
 } else if (month === 10) {
 if (day === getNthMonday(year, 10, 2)) name = "スポーツの日";
 } else if (month === 11) {
 if (day === 3) name = "文化の日";
 else if (day === 4 && new Date(year, 10, 3).getDay() === 0) name = "振替休日";
 else if (day === 23) name = "勤労感謝の日";
 else if (day === 24 && new Date(year, 10, 23).getDay() === 0) name = "振替休日";
 }

 if (name) {
 return { isHoliday: true, name: name };
 }
 return { isHoliday: false, name: null };
}

// 職員の職種カテゴリ判定 (director:施設長, office:事務員, nurse:看護師, care:介護職員)
// =====================================================================
// 区分（ユニット・フロア）の設定と切り替え ＆ 職員・保有資格の一覧 ＆ シフト職種識別マーク
// =====================================================================

// ==========================================
// [Claude追加] 区分（ユニット・フロア・棟）の設定
// - 区分の名前は施設が自由に決める（東棟・3階・ひまわりユニットなど）。利用者・職員は区分の番号（unit_id）で紐づける
// - 区分は運営の設定なので消せる。ただし利用者・職員が1人でもいる区分は消せない（先に別の区分へ移す）
// - 追加・名前の変更・並べ替え・削除・利用者や職員の移動は unit_logs に残し、操作履歴に出す
// - 勤務表の自動生成は、夜勤を区分の数だけ（区分ごとに1人ずつ）割り当てる
// ==========================================
// [Antigravity実装 2026-10-15] 区分（ユニット）ごとの色定義（応援印と見分けがつく淡色背景＋濃色文字＋枠線）
const CP_UNIT_PALETTE = [
  { bg: "#e0f2fe", text: "#0369a1", border: "#7dd3fc" }, // 水色
  { bg: "#fef3c7", text: "#92400e", border: "#fcd34d" }, // 琥珀色
  { bg: "#fce7f3", text: "#be185d", border: "#f472b6" }, // ローズ
  { bg: "#ede9fe", text: "#6d28d9", border: "#c4b5fd" }, // 紫
  { bg: "#dcfce7", text: "#15803d", border: "#86efac" }, // 薄緑
  { bg: "#ffedd5", text: "#c2410c", border: "#fdba74" }  // 橙
];

function cpGetUnitColor(unitId) {
  const units = cpUnits();
  const idx = units.findIndex(u => Number(u.id) === Number(unitId));
  if (idx >= 0) return CP_UNIT_PALETTE[idx % CP_UNIT_PALETTE.length];
  return { bg: "#f1f5f9", text: "#475569", border: "#cbd5e1" };
}

function cpUnits() {
 return (db.data.units || []).filter(u => u && u.id !== undefined).slice().sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || Number(a.id) - Number(b.id));
}
function cpUnitName(id) {
 if (id === undefined || id === null || id === "") return "";
 const u = (db.data.units || []).find(x => Number(x.id) === Number(id));
 return u ? u.name : "";
}
function cpUnitResidents(id) {
 // 退所した方は数えない（退所した方しかいない区分は消せる）
 return (gState.residents || db.data.residents || []).filter(r => r && r.status !== "退所" && Number(r.unit_id) === Number(id));
}
function cpUnitStaff(id) {
 return (db.data.stamps || []).filter(s => s && typeof s === "object" && Number(s.unit_id) === Number(id));
}
// [Claude追加] 勤務の最低人数（介護職）。事務ポータル「勤務表・シフト」の設定で変えられる
// 夜勤は、設定がなければ区分の数（区分ごとに1人）。区分もなければ2人。明けは夜勤と同じ人数
const CP_STAFFING_DEFAULT = { early: 2, day: 2, late: 2 };
function cpStaffing() {
 const st = (db.data.shift_staffing && typeof db.data.shift_staffing === "object") ? db.data.shift_staffing : {};
 const num = (v, d) => { const n = Number(v); return Number.isInteger(n) && n >= 0 && n <= 30 ? n : d; };
 const units = cpUnits().length;
 return {
 early: num(st.early, CP_STAFFING_DEFAULT.early),
 day: num(st.day, CP_STAFFING_DEFAULT.day),
 late: num(st.late, CP_STAFFING_DEFAULT.late),
 night: (st.night === null || st.night === undefined || st.night === "") ? (units > 0 ? units : 2) : num(st.night, units > 0 ? units : 2),
 nightAuto: (st.night === null || st.night === undefined || st.night === "")
 };
}
function cpNightTarget() { return cpStaffing().night; }
function cpCareStaffCount() { return (db.data.stamps || []).filter(st => getStaffRoleCategory(st.name || st) === "care").length; }

function renderShiftStaffingSettings() {
 const box = document.getElementById("shiftStaffingBody");
 if (!box) return;
 const m = cpStaffing();
 const units = cpUnits().length;
 const care = cpCareStaffCount();
 const need = m.early + m.day + m.late + m.night * 2;
 const off = care - need;
 const canEdit = typeof isCurrentStaffAdminOrClerk === "function" ? isCurrentStaffAdminOrClerk() : true;
 const inp = (id, label, v) => `<label class="staffing-field">${label}<input type="number" min="0" max="30" step="1" inputmode="numeric" id="${id}" class="form-control" value="${v}" ${canEdit ? "" : "disabled"}></label>`;
 box.innerHTML = `
 <div class="staffing-grid">
 ${inp("staffMinEarly", "早出", m.early)}
 ${inp("staffMinDay", "日勤", m.day)}
 ${inp("staffMinLate", "遅出", m.late)}
 <label class="staffing-field">夜勤<input type="number" min="0" max="30" step="1" inputmode="numeric" id="staffMinNight" class="form-control" value="${m.nightAuto ? "" : m.night}" placeholder="区分の数（${units > 0 ? units : 2}名）" ${canEdit ? "" : "disabled"}></label>
 </div>
 <p class="panel-note">介護職の1日の最低人数です。自動生成はこの人数を必ず入れ、残りの人を公休にします。多い日（研修・行事など）は、表のマスを押して手で足してください。夜勤を空欄にすると区分の数（区分ごとに1人）になります。明けは夜勤と同じ人数です。</p>
 <div class="staffing-calc ${off < 0 ? "is-short" : ""}">介護職 ${care}名 − 毎日必要 ${need}名（早出${m.early}・日勤${m.day}・遅出${m.late}・夜勤${m.night}・明け${m.night}）＝ 1日の公休 ${Math.max(0, off)}名${off < 0 ? `　→ ${-off}名足りません。最低人数を満たせない日が出ます` : `（1人あたり月およそ${care > 0 ? Math.round(off * 30 / care) : 0}日）`}</div>
 ${units > 0 && m.night < units ? `<div class="staffing-calc is-short">夜勤 ${m.night}名は、区分の数（${units}）より少ない設定です。</div>` : ""}
 ${canEdit ? `<div class="rx-form-actions"><button type="button" class="btn btn-primary" onclick="saveShiftStaffing()">最低人数を保存</button></div>` : `<p class="panel-note">変更は管理者・事務員だけができます。</p>`}`;
}
function saveShiftStaffing() {
 if (typeof isCurrentStaffAdminOrClerk === "function" && !isCurrentStaffAdminOrClerk()) { alert("勤務の最低人数は、管理者と事務員だけが変更できます。"); return; }
 const val = id => ((document.getElementById(id) || {}).value || "").trim();
 const next = {};
 for (const [k, id, label] of [["early", "staffMinEarly", "早出"], ["day", "staffMinDay", "日勤"], ["late", "staffMinLate", "遅出"], ["night", "staffMinNight", "夜勤"]]) {
 const raw = val(id);
 if (raw === "") {
 if (k === "night") { next.night = null; continue; }
 alert(`${label}の人数を入れてください。`); return;
 }
 const n = Number(raw);
 if (!Number.isInteger(n) || n < 0 || n > 30) { alert(`${label}の人数は0〜30の整数で入れてください。`); return; }
 next[k] = n;
 }
 const before = cpStaffing();
 db.data.shift_staffing = next;
 const after = cpStaffing();
 const fmt = x => `早出${x.early}・日勤${x.day}・遅出${x.late}・夜勤${x.night}${x.nightAuto ? "（区分の数）" : ""}`;
 if (fmt(before) === fmt(after)) { renderShiftStaffingSettings(); return; }
 if (!Array.isArray(db.data.settings_logs)) db.data.settings_logs = [];
 db.data.settings_logs.push({ id: Date.now(), at: toLocalDateTimeStr(new Date()), by: cpLoginStaffName(), kind: "勤務の最低人数", action: "変更", detail: `${fmt(before)} → ${fmt(after)}` });
 db.save();
 renderShiftStaffingSettings();
 renderShiftTable(gState.currentShiftMonth || getShiftYearMonth());
 alert("勤務の最低人数を保存しました。すでに作った月の勤務表は変わりません。必要なら「1ヶ月シフト自動生成」で作り直してください。");
}
function cpUnitLog(action, detail) {
 if (!Array.isArray(db.data.unit_logs)) db.data.unit_logs = [];
 db.data.unit_logs.push({ id: Date.now() + Math.floor(Math.random() * 1000), at: toLocalDateTimeStr(new Date()), by: cpLoginStaffName(), action: action, detail: detail });
}
function cpUnitOptionsHtml(selectedId, firstLabel) {
 const sel = selectedId === undefined || selectedId === null ? "" : String(selectedId);
 return `<option value="">${escapeHtml(firstLabel)}</option>` + cpUnits().map(u => `<option value="${u.id}" ${String(u.id) === sel ? "selected" : ""}>${escapeHtml(u.name)}</option>`).join("");
}
function cpCanEditUnits() {
 if (typeof isCurrentStaffAdminOrClerk === "function" && !isCurrentStaffAdminOrClerk()) {
 alert("区分の設定は、管理者と事務員だけが変更できます。");
 return false;
 }
 return true;
}

// 事務ポータル「区分の設定」
function renderOfficeUnits() {
 const box = document.getElementById("officeUnitsBody");
 if (!box) return;
 const units = cpUnits();
 const others = id => units.filter(u => Number(u.id) !== Number(id));
 const memberRow = (label, name, curId, onchange, attrs) => `
 <div class="unit-member">
 <span>${escapeHtml(label)}</span>
 <select class="form-control unit-move" aria-label="${escapeHtml(name)}の区分を移す" onchange="${onchange}" ${attrs || ""}>
 <option value="">移す先を選ぶ</option>
 ${others(curId).map(u => `<option value="${u.id}">${escapeHtml(u.name)}へ移す</option>`).join("")}
 </select>
 </div>`;
 const rows = units.map((u, i) => {
 const res = cpUnitResidents(u.id);
 const st = cpUnitStaff(u.id);
 return `
 <div class="unit-card">
 <div class="unit-head">
 <input type="text" class="form-control unit-name-input" id="unitName_${u.id}" maxlength="20" value="${escapeHtml(u.name)}" aria-label="区分の名前">
 <button type="button" class="btn btn-secondary" onclick="renameUnit(${u.id})">名前を変える</button>
 <button type="button" class="btn btn-secondary" onclick="moveUnitOrder(${u.id}, -1)" ${i === 0 ? "disabled" : ""} title="上へ">↑</button>
 <button type="button" class="btn btn-secondary" onclick="moveUnitOrder(${u.id}, 1)" ${i === units.length - 1 ? "disabled" : ""} title="下へ">↓</button>
 <button type="button" class="btn btn-secondary unit-del" onclick="deleteUnit(${u.id})">削除</button>
 </div>
 <div class="unit-count">利用者 ${res.length}名・職員 ${st.length}名</div>
 ${res.length || st.length ? `<details class="unit-members"><summary>この区分の利用者・職員（別の区分へ移す）</summary>
 ${res.map(r => memberRow(`${r.room_no || ""}号室 ${r.name} 様`, r.name, u.id, `moveResidentUnit(${r.id}, this.value)`)).join("")}
 ${st.map(s => memberRow(`${s.name}（${s.role || "職員"}）`, s.name, u.id, "moveStaffUnit(this.dataset.staff, this.value)", `data-staff="${escapeHtml(s.name)}"`)).join("")}
 </details>` : ""}
 </div>`;
 }).join("");
 const noUnit = cpCurrentResidents().filter(r => !cpUnitName(r.unit_id));
 box.innerHTML = `
 ${rows || `<p class="panel-note">区分はまだありません。区分がないあいだは、利用者一覧の切り替えは出ません。</p>`}
 ${units.length && noUnit.length ? `<div class="unit-card unit-none"><div class="unit-count">区分が決まっていない利用者 ${noUnit.length}名</div>
 ${noUnit.map(r => `<div class="unit-member"><span>${escapeHtml(`${r.room_no || ""}号室 ${r.name} 様`)}</span><select class="form-control unit-move" onchange="moveResidentUnit(${r.id}, this.value)"><option value="">区分を選ぶ</option>${units.map(u => `<option value="${u.id}">${escapeHtml(u.name)}</option>`).join("")}</select></div>`).join("")}</div>` : ""}
 <div class="unit-add">
 <input type="text" class="form-control" id="newUnitName" maxlength="20" aria-label="追加する区分の名前">
 <button type="button" class="btn btn-primary" onclick="addUnit()">区分を追加</button>
 </div>`;
}

function cpUnitNameCheck(name, exceptId) {
 if (!name) { alert("区分の名前を入れてください。"); return false; }
 if (name.length > 20) { alert("区分の名前は20文字までにしてください。"); return false; }
 if ((db.data.units || []).some(u => u.name === name && Number(u.id) !== Number(exceptId))) { alert(`「${name}」はすでにあります。`); return false; }
 return true;
}
function addUnit() {
 if (!cpCanEditUnits()) return;
 const el = document.getElementById("newUnitName");
 const name = (el ? el.value : "").trim();
 if (!cpUnitNameCheck(name, null)) return;
 if (!Array.isArray(db.data.units)) db.data.units = [];
 const maxId = db.data.units.reduce((m, u) => Math.max(m, Number(u.id) || 0), 0);
 const maxOrder = db.data.units.reduce((m, u) => Math.max(m, Number(u.order) || 0), 0);
 db.data.units.push({ id: maxId + 1, name: name, order: maxOrder + 1 });
 cpUnitLog("区分を追加", name);
 db.save();
 cpAfterUnitChange();
}
function renameUnit(id) {
 if (!cpCanEditUnits()) return;
 const u = (db.data.units || []).find(x => Number(x.id) === Number(id));
 const el = document.getElementById(`unitName_${id}`);
 if (!u || !el) return;
 const name = el.value.trim();
 if (name === u.name) return;
 if (!cpUnitNameCheck(name, id)) { el.value = u.name; return; }
 cpUnitLog("区分の名前を変更", `${u.name} → ${name}`);
 u.name = name;
 db.save();
 cpAfterUnitChange();
}
function moveUnitOrder(id, dir) {
 if (!cpCanEditUnits()) return;
 const units = cpUnits();
 const i = units.findIndex(u => Number(u.id) === Number(id));
 const j = i + dir;
 if (i < 0 || j < 0 || j >= units.length) return;
 const a = units[i], b = units[j];
 units.forEach((u, k) => { u.order = k + 1; });
 const t = a.order; a.order = b.order; b.order = t;
 db.save();
 cpAfterUnitChange();
}
function deleteUnit(id) {
 if (!cpCanEditUnits()) return;
 const u = (db.data.units || []).find(x => Number(x.id) === Number(id));
 if (!u) return;
 const res = cpUnitResidents(id), st = cpUnitStaff(id);
 if (res.length || st.length) {
 alert(`「${u.name}」には利用者${res.length}名・職員${st.length}名がいるので消せません。\n先に別の区分へ移してください。`);
 return;
 }
 if (!confirm(`区分「${u.name}」を消します。よろしいですか？`)) return;
 db.data.units = (db.data.units || []).filter(x => Number(x.id) !== Number(id));
 cpUnitLog("区分を削除", u.name);
 if (String(gState.selectedUnit) === String(id)) gState.selectedUnit = "all";
 db.save();
 cpAfterUnitChange();
}
function moveResidentUnit(residentId, newUnitId) {
 if (!newUnitId) return;
 const r = (gState.residents || []).find(x => Number(x.id) === Number(residentId));
 if (!r) return;
 const to = cpUnitName(newUnitId);
 const room = prompt(`${r.name} 様を「${cpUnitName(r.unit_id) || "区分なし"}」から「${to}」へ移します。\n新しい部屋番号を入れてください（変えないときはそのまま「OK」）`, r.room_no || "");
 if (room === null) { renderOfficeUnits(); return; }
 const done = cpMoveResident(r, room, Number(newUnitId));
 if (!done) { renderOfficeUnits(); return; }
 db.data.residents = gState.residents;
 db.save();
 cpAfterUnitChange();
 if (typeof renderResidentDetail === "function") renderResidentDetail();
}
function moveStaffUnit(staffName, newUnitId) {
 if (!cpCanEditUnits()) { renderOfficeUnits(); return; }
 const s = (db.data.stamps || []).find(x => x && x.name === staffName);
 if (!s) return;
 const from = cpUnitName(s.unit_id) || "区分なし";
 const to = newUnitId ? cpUnitName(newUnitId) : "区分なし";
 if (from === to) return;
 if (!confirm(`${s.name} さんの担当を「${from}」から「${to}」へ変えます。よろしいですか？`)) { cpAfterUnitChange(); return; }
 if (newUnitId) s.unit_id = Number(newUnitId); else delete s.unit_id;
 cpUnitLog("職員の担当区分を変更", `${s.name}：${from} → ${to}`);
 db.save();
 cpAfterUnitChange();
}
function cpAfterUnitChange() {
 renderOfficeUnits();
 if (typeof renderResidentsStrip === "function") renderResidentsStrip();
 if (typeof renderStaffModalList === "function" && document.getElementById("staffModal") && document.getElementById("staffModal").style.display === "flex") renderStaffModalList();
 if (typeof renderStaffQualificationsTable === "function") renderStaffQualificationsTable();
}

// 利用者一覧の上の切り替え（区分の数だけボタンを出す。区分が1つ以下なら出さない）
gState.selectedUnit = "all";
function filterResidentsByUnit(unitId) {
 gState.selectedUnit = unitId === undefined || unitId === null || unitId === "" ? "all" : String(unitId);
 renderResidentsStrip();
 const shown = cpResidentsInSelectedUnit();
 if (shown.length > 0 && !shown.some(r => r.id === gState.selectedResidentId)) selectResident(shown[0].id);
}
function cpResidentsInSelectedUnit() {
 const all = cpCurrentResidents();
 if (gState.selectedUnit === "all" || !cpUnitName(gState.selectedUnit)) return all;
 return all.filter(r => String(r.unit_id) === String(gState.selectedUnit));
}
function renderUnitFilterNav() {
 const nav = document.getElementById("unitFilterNav");
 if (!nav) return;
 const units = cpUnits();
 if (units.length <= 1) { nav.innerHTML = ""; nav.style.display = "none"; return; }
 if (gState.selectedUnit !== "all" && !cpUnitName(gState.selectedUnit)) gState.selectedUnit = "all";
 const all = cpCurrentResidents();
 const btn = (val, label, n) => `<button type="button" class="unit-filter-btn" data-state="${String(gState.selectedUnit) === String(val) ? "on" : "off"}" onclick="filterResidentsByUnit('${val}')">${escapeHtml(label)} <span class="unit-filter-count">${n}名</span></button>`;
 nav.style.display = "flex";
 nav.innerHTML = `<span class="unit-filter-label">区分:</span>` + btn("all", "すべて", all.length) + units.map(u => btn(u.id, u.name, all.filter(r => String(r.unit_id) === String(u.id)).length)).join("");
}
function renderResidentsStrip() {
 const strip = document.getElementById("residentsStrip");
 if (!strip) return;
 renderUnitFilterNav();
 const all = cpCurrentResidents();
 const shown = cpResidentsInSelectedUnit();
 const countLabel = document.getElementById("residentCountLabel");
 if (countLabel) countLabel.textContent = shown.length === all.length ? `登録利用者: ${all.length}名` : `表示中: ${cpUnitName(gState.selectedUnit)} ${shown.length}名（全${all.length}名）`;
 strip.innerHTML = "";
 const discharged = (gState.residents || []).filter(cpIsDischarged).sort((a, b) => String(b.discharge_date || "").localeCompare(String(a.discharge_date || "")));
 // 退所した方の一覧（押すと表示・非表示）。記録は残っているので、カルテや過去の記録を見られる
 const appendDischarged = () => {
 if (!discharged.length) return;
 const t = document.createElement("button");
 t.type = "button";
 t.className = "discharged-toggle";
 t.textContent = gState.showDischarged ? `退所した方を閉じる` : `退所した方（${discharged.length}名）`;
 t.onclick = toggleDischargedList;
 strip.appendChild(t);
 if (!gState.showDischarged) return;
 discharged.forEach(r => {
 const card = document.createElement("div");
 card.className = `resident-card inactive discharged ${r.id === gState.selectedResidentId ? "selected" : ""}`;
 card.onclick = () => selectResident(r.id);
 card.innerHTML = `<div class="card-top"><span class="room-badge">${escapeHtml(r.room_no)}号室</span><span class="discharge-badge">退所</span></div>
 <div class="res-name">${escapeHtml(r.name)} 様</div><div class="discharge-date">${escapeHtml(r.discharge_date || "")} ${escapeHtml(r.discharge_reason || "")}</div>`;
 strip.appendChild(card);
 });
 };
 if (!shown.length) {
 strip.innerHTML = '<div class="panel-note">この区分の利用者はいません。</div>';
 appendDischarged();
 return;
 }
 const showBadge = cpUnits().length > 1;
 shown.forEach(r => {
 const card = document.createElement("div");
 card.className = `resident-card ${r.id === gState.selectedResidentId ? "selected" : ""} ${r.status !== "在所" ? "inactive" : ""}`;
 card.onclick = () => selectResident(r.id);
 const un = cpUnitName(r.unit_id);
 card.innerHTML = `
 <div class="card-top">
 <span class="room-badge">${escapeHtml(r.room_no)}号室</span>
 ${showBadge && un ? `<span class="unit-badge">${escapeHtml(un)}</span>` : ""}
 </div>
 <div class="res-name">${escapeHtml(r.name)} 様</div>`;
 strip.appendChild(card);
 });
 appendDischarged();
}
// ==========================================
// [Claude追加] 部屋の入れ替え・退所の手続き
// - 移す先の部屋に別の方がいるときは、部屋（と区分）を入れ替えるか確かめる。入れ替えは2人とも変更履歴に残す
// - 退所は「退所の手続き」から。退所日・理由（死亡退所など）を必須にする。記録は消さない
// - 退所した方は、利用者一覧・毎日の表・お知らせ・区分の人数から外す（退所日までの日付の表には出る）
// - 間違えたときは「退所を取り消す」（理由は必須）。前の退所の内容は discharge_history に残す
// ==========================================
const CP_DISCHARGE_REASONS = ["死亡退所", "入院による退所", "他施設へ", "自宅へ", "その他"];
function cpIsDischarged(r) { return !!r && r.status === "退所"; }
function cpCurrentResidents() { return (gState.residents || []).filter(r => r && !cpIsDischarged(r)); }
// その日にホームにいた利用者（退所した方は、退所日まで出す）
function cpResidentsOn(dateStr) {
 const d = dateStr || gState.selectedDate || toLocalDateStr(new Date());
 return (gState.residents || []).filter(r => r && (!cpIsDischarged(r) || (r.discharge_date && d <= r.discharge_date)));
}
function cpRoomOccupant(room, exceptId) {
 const k = String(room || "").trim();
 if (!k) return null;
 return cpCurrentResidents().find(r => String(r.room_no || "").trim() === k && Number(r.id) !== Number(exceptId)) || null;
}
function cpRoomUnitText(room, unitId) { return `${room}号室${cpUnitName(unitId) ? "・" + cpUnitName(unitId) : ""}`; }
function cpResidentLog(action, detail) {
 if (!Array.isArray(db.data.settings_logs)) db.data.settings_logs = [];
 db.data.settings_logs.push({ id: Date.now() + Math.floor(Math.random() * 1000), at: toLocalDateTimeStr(new Date()), by: cpLoginStaffName(), kind: "利用者の移動・退所", action: action, detail: detail });
}
// 利用者を別の部屋・区分へ移す。戻り値: true=変更した / false=変更なし / null=やめた
function cpMoveResident(r, newRoom, newUnitId) {
 const oldRoom = r.room_no, oldUnit = (r.unit_id === undefined ? null : r.unit_id);
 const room = String(newRoom || "").trim() || oldRoom;
 const unit = (newUnitId === undefined ? oldUnit : newUnitId);
 if (String(room) === String(oldRoom) && String(unit ?? "") === String(oldUnit ?? "")) return false;
 const other = String(room) !== String(oldRoom) ? cpRoomOccupant(room, r.id) : null;
 let unitAfter = unit;
 if (other) {
 if (!confirm(`${room}号室には ${other.name} 様がいます。\n${r.name} 様と部屋を入れ替えますか？\n（${other.name} 様は ${cpRoomUnitText(oldRoom, oldUnit)} へ移ります）`)) return null;
 // 区分を選び直していないときは、入れ替える相手の区分に合わせる（部屋と区分がずれないように）
 if (String(unit ?? "") === String(oldUnit ?? "")) unitAfter = (other.unit_id === undefined ? null : other.unit_id);
 const oOld = JSON.parse(JSON.stringify(other));
 other.room_no = oldRoom;
 other.unit_id = oldUnit;
 cpAppendEditHistory(other, oOld, ["room_no", "unit_id"]);
 cpResidentLog("部屋の入れ替え", `${other.name} 様：${cpRoomUnitText(oOld.room_no, oOld.unit_id)} → ${cpRoomUnitText(oldRoom, oldUnit)}（${r.name} 様と入れ替え）`);
 }
 const rOld = JSON.parse(JSON.stringify(r));
 r.room_no = room;
 r.unit_id = unitAfter;
 cpAppendEditHistory(r, rOld, ["room_no", "unit_id"]);
 cpResidentLog(other ? "部屋の入れ替え" : "利用者の移動", `${r.name} 様：${cpRoomUnitText(rOld.room_no, rOld.unit_id)} → ${cpRoomUnitText(room, unitAfter)}`);
 return true;
}

// 退所の手続き
let cpDischargeTargetId = null;
function openDischargeModal(resId) {
 const r = (gState.residents || []).find(x => Number(x.id) === Number(resId));
 if (!r || cpIsDischarged(r)) return;
 cpDischargeTargetId = r.id;
 const t = document.getElementById("dischargeTitle");
 if (t) t.textContent = `${r.room_no}号室 ${r.name} 様の退所の手続き`;
 const d = document.getElementById("dischargeDate"); if (d) { d.value = ""; d.max = toLocalDateStr(new Date()); }
 const s = document.getElementById("dischargeReason"); if (s) s.innerHTML = `<option value="">選んでください</option>` + CP_DISCHARGE_REASONS.map(x => `<option value="${x}">${x}</option>`).join("");
 const n = document.getElementById("dischargeNote"); if (n) n.value = "";
 openModal("dischargeModal");
}
function submitDischarge() {
 const r = (gState.residents || []).find(x => Number(x.id) === Number(cpDischargeTargetId));
 if (!r) return;
 const date = (document.getElementById("dischargeDate") || {}).value || "";
 const reason = (document.getElementById("dischargeReason") || {}).value || "";
 const note = ((document.getElementById("dischargeNote") || {}).value || "").trim();
 if (!date) { alert("退所日を入れてください。"); return; }
 if (date > toLocalDateStr(new Date())) { alert("退所日に、これから先の日付は入れられません。"); return; }
 if (!reason) { alert("退所の理由を選んでください。"); return; }
 if (reason === "その他" && !note) { alert("「その他」のときは、内容を書いてください。"); return; }
 if (!confirm(`${r.name} 様を ${date} 付けで退所（${reason}）にします。\n\n記録は消えません。「退所した方」からいつでも見られます。\n間違えたときは「退所を取り消す」で戻せます。`)) return;
 const old = JSON.parse(JSON.stringify(r));
 r.status_before_discharge = r.status;
 r.status = "退所";
 r.discharge_date = date;
 r.discharge_reason = reason;
 r.discharge_note = note;
 r.discharged_at = toLocalDateTimeStr(new Date());
 r.discharged_by = cpLoginStaffName();
 cpAppendEditHistory(r, old, ["status", "discharge_date", "discharge_reason", "discharge_note"]);
 cpResidentLog("退所の手続き", `${r.name} 様（${old.room_no}号室）：${date} ${reason}${note ? "（" + note + "）" : ""}`);
 db.data.residents = gState.residents;
 db.save();
 closeModal("dischargeModal");
 const next = cpCurrentResidents()[0];
 if (next) selectResident(next.id); else { renderResidentsStrip(); renderResidentDetail(); }
 if (typeof checkGlobalAlerts === "function") checkGlobalAlerts();
}
function cancelDischarge(resId) {
 const r = (gState.residents || []).find(x => Number(x.id) === Number(resId));
 if (!r || !cpIsDischarged(r)) return;
 const reason = prompt(`${r.name} 様の退所を取り消して、在所に戻します。\n取り消す理由を入れてください（例: 間違えて退所にした）`, "");
 if (reason === null) return;
 if (!reason.trim()) { alert("取り消す理由を入れてください。何も変えていません。"); return; }
 let room = r.room_no;
 const other = cpRoomOccupant(room, r.id);
 if (other) {
 const nr = prompt(`${room}号室には今 ${other.name} 様がいます。\n戻る部屋番号を入れてください。`, "");
 if (nr === null) return;
 if (!nr.trim()) { alert("部屋番号を入れてください。何も変えていません。"); return; }
 const o2 = cpRoomOccupant(nr.trim(), r.id);
 if (o2) { alert(`${nr.trim()}号室には ${o2.name} 様がいます。何も変えていません。`); return; }
 room = nr.trim();
 }
 const old = JSON.parse(JSON.stringify(r));
 if (!Array.isArray(r.discharge_history)) r.discharge_history = [];
 r.discharge_history.push({ discharge_date: r.discharge_date, discharge_reason: r.discharge_reason, discharge_note: r.discharge_note || "", discharged_at: r.discharged_at, discharged_by: r.discharged_by, canceled_at: toLocalDateTimeStr(new Date()), canceled_by: cpLoginStaffName(), cancel_reason: reason.trim() });
 r.status = r.status_before_discharge && r.status_before_discharge !== "退所" ? r.status_before_discharge : "在所";
 r.room_no = room;
 ["discharge_date", "discharge_reason", "discharge_note", "discharged_at", "discharged_by", "status_before_discharge"].forEach(k => { delete r[k]; });
 cpAppendEditHistory(r, old, ["status", "room_no", "discharge_date", "discharge_reason", "discharge_note"]);
 cpResidentLog("退所の取り消し", `${r.name} 様：${old.discharge_date || ""} ${old.discharge_reason || ""} を取り消し（理由: ${reason.trim()}）${room !== old.room_no ? ` ${room}号室へ` : ""}`);
 db.data.residents = gState.residents;
 db.save();
 gState.showDischarged = false;
 selectResident(r.id);
 if (typeof checkGlobalAlerts === "function") checkGlobalAlerts();
}
function toggleDischargedList() {
 gState.showDischarged = !gState.showDischarged;
 renderResidentsStrip();
}

window.filterResidentsByUnit = filterResidentsByUnit;
window.renderResidentsStrip = renderResidentsStrip;

// 2. 職員の職種識別マークとカテゴリ判定
function getStaffRoleCategory(staffName) {
  // [Claude修正] 役職（role）で判定する。名前での判定（「鈴木」「加藤」なら看護師など）は、役職が空のときだけ使う
  const allStamps = db.data.stamps || [];
  const staff = allStamps.find(s => (s.name || s) === staffName);
  const role = staff && staff.role ? staff.role : "";
  if (role) {
    if (role.includes("施設長") || role.includes("管理者")) return "director";
    if (role.includes("計画作成") || role.includes("介護支援専門員") || role.includes("ケアマネ")) return "caremanager";
    if (role.includes("相談員")) return "counselor";
    if (role.includes("看護")) return "nurse";
    if (role.includes("事務") && role.includes("パート")) return "parttime";
    if (role.includes("事務")) return "office";
    return "care";
  }
  const name = staffName || "";
  if (name.includes("木村")) return "director";
  if (name.includes("鈴木 美智子") || name.includes("加藤 由美")) return "nurse";
  if (name.includes("田中 慎一") || name.includes("松本 陽子")) return "office";
  return "care";
}

// 職種識別バッジ生成ヘルパー (管, 生, ケ, 看, リ, 介, 事, パ)
function getStaffRoleBadgeHtml(staffName) {
  const allStamps = db.data.stamps || [];
  const staff = allStamps.find(s => (s.name || s) === staffName);
  const role = staff && staff.role ? staff.role : "";

  if (role.includes("管理者") || role.includes("施設長")) {
    return `<span class="badge" style="background:var(--pine-dark); color:#ffffff; font-size:13px; padding:1px 5px; border-radius:3px; margin-right:4px; font-weight:bold;" title="管理者">管</span>`;
  }
  if (role.includes("相談員")) {
    return `<span class="badge" style="background:#c2410c; color:#ffffff; font-size:13px; padding:1px 5px; border-radius:3px; margin-right:4px; font-weight:bold;" title="生活相談員">生</span>`;
  }
  if (role.includes("計画作成") || role.includes("介護支援専門員") || role.includes("ケアマネ")) {
    return `<span class="badge" style="background:#7c2d12; color:#ffffff; font-size:13px; padding:1px 5px; border-radius:3px; margin-right:4px; font-weight:bold;" title="計画作成担当者 (ケアマネ)">ケ</span>`;
  }
  if (role.includes("看護")) {
    return `<span class="badge" style="background:#047857; color:#ffffff; font-size:13px; padding:1px 5px; border-radius:3px; margin-right:4px; font-weight:bold;" title="看護師">看</span>`;
  }
  if (role.includes("リーダー")) {
    return `<span class="badge" style="background:#0f766e; color:#ffffff; font-size:13px; padding:1px 5px; border-radius:3px; margin-right:4px; font-weight:bold;" title="ユニットリーダー">リ</span>`;
  }
  if (role.includes("パート")) {
    return `<span class="badge" style="background:#d97706; color:#ffffff; font-size:13px; padding:1px 5px; border-radius:3px; margin-right:4px; font-weight:bold;" title="パート事務">パ</span>`;
  }
  if (role.includes("事務")) {
    return `<span class="badge" style="background:#4b5563; color:#ffffff; font-size:13px; padding:1px 5px; border-radius:3px; margin-right:4px; font-weight:bold;" title="事務員 (常勤)">事</span>`;
  }
  return `<span class="badge" style="background:var(--pine); color:#ffffff; font-size:13px; padding:1px 5px; border-radius:3px; margin-right:4px; font-weight:bold;" title="介護職員">介</span>`;
}
window.getStaffRoleBadgeHtml = getStaffRoleBadgeHtml;

// 3. 事務ポータル：職員・保有資格の一覧
function renderStaffQualificationsTable() {
  const tbody = document.querySelector("#staffQualificationsTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const allStamps = sortStaffList(db.data.stamps || []);
  let careCount = 0;
  let certifiedCareWorkerCount = 0;
  let fullTimeCount = 0;
  let partTimeCount = 0;

  allStamps.forEach(s => {
    const isCareStaff = getStaffRoleCategory(s.name) === "care"; // [Claude修正] 役職名に「介護」が入る計画作成担当者（介護支援専門員）を介護職に数えない
    if (isCareStaff) {
      careCount++;
      if ((s.qualifications || "").includes("介護福祉士")) certifiedCareWorkerCount++;
    }
    if ((s.employment_type || "常勤").includes("パート") || (s.employment_type || "").includes("非常勤")) {
      partTimeCount++;
    } else {
      fullTimeCount++;
    }

    const tr = document.createElement("tr");
    const badgeHtml = getStaffRoleBadgeHtml(s.name);
    const wingText = cpUnitName(s.unit_id) ? `<span style="font-size:13px; color:var(--ink-3); margin-left:4px;">(${escapeHtml(cpUnitName(s.unit_id))})</span>` : "";

    tr.innerHTML = `
      <td style="text-align:center;">${badgeHtml}</td>
      <td><strong>${escapeHtml(s.name)}</strong></td>
      <td>${escapeHtml(s.role || '職員')}${wingText}</td>
      <td style="text-align:center;"><span class="badge" style="font-size:13px; padding:2px 6px; ${s.employment_type === '非常勤 (パート)' ? 'background:#fef3c7; color:#92400e;' : 'background:#eef2ef; color:var(--ink);'}">${escapeHtml(s.employment_type || '常勤')}</span></td>
      <td style="text-align:center;"><span class="badge" style="font-size:13px; padding:2px 6px; ${s.duty_type === '日勤専従' ? 'background:#e0f2fe; color:#0369a1;' : 'background:#f0fdf4; color:#15803d;'}">${escapeHtml(s.duty_type || '交替勤務')}</span></td>
      <td>${escapeHtml(s.qualifications || '—')}</td>
    `;
    tbody.appendChild(tr);
  });

  // [Claude修正] 「基準適合」「専任配置済」の断定をやめ、数だけを出す（グループホームの人員基準は自治体の資料で確かめる）
  const badgeContainer = document.getElementById("qualificationSummaryBadges");
  if (badgeContainer) {
    const carePct = careCount > 0 ? ((certifiedCareWorkerCount / careCount) * 100).toFixed(1) : "0";
    const planners = allStamps.filter(s => getStaffRoleCategory(s.name) === "caremanager");
    const plannerCm = planners.filter(s => (s.qualifications || "").includes("介護支援専門員")).length;
    badgeContainer.innerHTML = `
      <span class="badge qual-badge">全職員 ${allStamps.length}名（常勤${fullTimeCount}名・パート${partTimeCount}名）</span>
      <span class="badge qual-badge">介護職のうち介護福祉士 ${certifiedCareWorkerCount}/${careCount}名（${carePct}%）</span>
      <span class="badge qual-badge">計画作成担当者 ${planners.length}名（うち介護支援専門員 ${plannerCm}名）</span>
    `;
  }
}
window.renderStaffQualificationsTable = renderStaffQualificationsTable;

// 4. 月間シフト自動生成ロジックの拡張 (22名体制: 相談員・ケアマネ日勤、介護15名毎日公休5名)
function generateMonthlyShiftData(yearMonth) {
 if (!yearMonth) yearMonth = getShiftYearMonth();
 const [yearStr, monthStr] = yearMonth.split("-");
 const year = parseInt(yearStr, 10);
 const month = parseInt(monthStr, 10);
 const daysInMonth = new Date(year, month, 0).getDate();

 // 1. スタッフ分類（役職で判定。管理者・計画作成担当者・相談員・事務は日勤専従）
 const allStamps = sortStaffList(db.data.stamps || []);
 const staffList = allStamps.map(s => typeof s === "string" ? { name: s, role: "介護職員" } : s);

 const isDirector = s => ["director", "caremanager", "counselor"].includes(getStaffRoleCategory(s.name));
 const isOffice = s => ["office", "parttime"].includes(getStaffRoleCategory(s.name));
 const isNurse = s => getStaffRoleCategory(s.name) === "nurse";
 const isCare = s => getStaffRoleCategory(s.name) === "care";

 const directors = staffList.filter(isDirector);
 const officeStaff = staffList.filter(isOffice);
 const nurses = staffList.filter(isNurse);
 const careStaff = staffList.filter(isCare);

 // NGペアチェック関数
 const ngPairs = db.data.shift_ng_pairs || [];
 const isNgPair = (name1, name2) => {
  return ngPairs.some(p => 
   (p.staff1 === name1 && p.staff2 === name2) || 
   (p.staff1 === name2 && p.staff2 === name1)
  );
 };

 // 希望休データの取得と索引化 (対象年月)
 const hopeOffList = (db.data.shift_hope_offs || []).filter(h => h.year_month === yearMonth);
 const staffHopeDays = {};
 hopeOffList.forEach(h => {
  if (!staffHopeDays[h.staff_name]) staffHopeDays[h.staff_name] = new Set();
  staffHopeDays[h.staff_name].add(parseInt(h.day, 10));
 });
 const isHopeOff = (name, day) => {
  return Boolean(staffHopeDays[name] && staffHopeDays[name].has(day));
 };

 const shiftData = {};
 staffList.forEach(s => {
  shiftData[s.name] = {};
 });

 // 2. 施設長 (木村 健一): 日勤専従 ＆ 週休2日 (土日・祝日・年末年始12/29〜1/3は公休「休」、希望休配慮)
 directors.forEach(s => {
  for (let d = 1; d <= daysInMonth; d++) {
   const dow = new Date(year, month - 1, d).getDay();
   const hol = isHolidayOrYearEnd(year, month, d);
   if (dow === 0 || dow === 6 || hol.isHoliday || isHopeOff(s.name, d)) {
    shiftData[s.name][d] = "休";
   } else {
    shiftData[s.name][d] = "日";
   }
  }
 });

 // 3. 事務員 (2名体制: 田中 慎一、松本 陽子): 日勤専従 ＆ 週休2日 (土日・祝日・年末年始12/29〜1/3は公休「休」、希望休配慮)
 officeStaff.forEach((s) => {
  for (let d = 1; d <= daysInMonth; d++) {
   const dow = new Date(year, month - 1, d).getDay();
   const hol = isHolidayOrYearEnd(year, month, d);
   if (dow === 0 || dow === 6 || hol.isHoliday || isHopeOff(s.name, d)) {
    shiftData[s.name][d] = "休";
   } else {
    shiftData[s.name][d] = "日";
   }
  }
 });

 // 4. 看護師 (2名体制: 鈴木 美智子、加藤 由美): 日勤専従 ＆ 週休2日 (相互カバーで毎日配置、希望休配慮)
 nurses.forEach((s, idx) => {
  for (let d = 1; d <= daysInMonth; d++) {
   const dow = new Date(year, month - 1, d).getDay();
   const defOff = (idx === 0) ? (dow === 0 || dow === 3) : (dow === 4 || dow === 6);
   if (isHopeOff(s.name, d) || defOff) {
    shiftData[s.name][d] = "休";
   } else {
    shiftData[s.name][d] = "日";
   }
  }
 });

 // 5. 介護職員 (14名体制): 毎日必ず「早出2名」「遅出2名」「日勤2名」「夜勤2名」「明け2名」「公休4名」
 if (careStaff.length > 0) {
  const careNames = careStaff.map(s => s.name);
  const nightCount = {};
  const earlyCount = {};
  const lateCount = {};
  const dayCount = {};
  const holidayCount = {};
  careNames.forEach(n => {
   nightCount[n] = 0;
   earlyCount[n] = 0;
   lateCount[n] = 0;
   dayCount[n] = 0;
   holidayCount[n] = 0;
  });

  // 月間公休目標 (14名体制で毎日4名公休: 31日の場合 31*4=124人日。124/14 = 8日休み2名、9日休み12名)
  // [Claude修正] 人数は「勤務の最低人数」の設定から（夜勤は設定がなければ区分の数）
  // 1日の公休の人数 = 介護職の人数 − (早出＋日勤＋遅出 ＋ 夜勤×2（明けも同じ人数）)
  const MIN = cpStaffing();
  const NIGHTS = MIN.night, EARLY = MIN.early, LATE = MIN.late, DAYMIN = MIN.day;
  const OFF_PER_DAY = Math.max(0, careNames.length - (EARLY + LATE + DAYMIN + NIGHTS * 2));
  const totalMonthHolidays = daysInMonth * OFF_PER_DAY;
  const baseTarget = Math.floor(totalMonthHolidays / careNames.length);
  const extraHolidays = totalMonthHolidays % careNames.length;
  const targetHolidays = {};
  careNames.forEach((n, idx) => {
   targetHolidays[n] = baseTarget + (idx < extraHolidays ? 1 : 0);
  });

  const dailyCareHolidays = {};
  for (let d = 1; d <= daysInMonth; d++) dailyCareHolidays[d] = 0;

  // 【希望休の事前確定】介護職員の希望休を最優先で公休「休」としてロック
  careNames.forEach(n => {
   if (staffHopeDays[n]) {
    staffHopeDays[n].forEach(d => {
     if (d >= 1 && d <= daysInMonth) {
      shiftData[n][d] = "休";
      holidayCount[n]++;
      dailyCareHolidays[d]++;
     }
    });
   }
  });

  // 初日 (1日) の明け2名設定 (前月最終日からの夜勤明け引き継ぎ)
  // ※ 1日に希望休を出している職員は初日明けから除外
  if (careNames.length >= NIGHTS) {
   const availForAke1 = careNames.filter(n => !isHopeOff(n, 1));
   const prevNightStaff = (availForAke1.length >= NIGHTS ? availForAke1 : careNames).slice(-NIGHTS);
   prevNightStaff.forEach(pn => {
    shiftData[pn][1] = "明";
   });
  }

  // Step A: 毎日夜勤2名の選定 (1日〜daysInMonth)
  for (let d = 1; d <= daysInMonth; d++) {
   // 候補者選定:
   // ・当日すでに「休」（希望休等）または「明」でない人
   // ・当日希望休でない人
   // ・翌日希望休でない人 (※当夜勤に入ると翌日が「明」となり希望休が潰れるため回避)
   // ・前日夜勤でない人 (※前日夜勤＝当日明のため夜勤不可)
   let candidates = careNames.filter(name => {
    if (isHopeOff(name, d)) return false;
    if (d + 1 <= daysInMonth && isHopeOff(name, d + 1)) return false;
    if (shiftData[name][d] === "休") return false;
    if (shiftData[name][d] === "明") return false;
    if (d > 1 && shiftData[name][d - 1] === "夜") return false;
    return true;
   });

   // 万一候補が2名未満の場合は翌日希望休ガードのみ緩和
   if (candidates.length < NIGHTS) {
    candidates = careNames.filter(name => {
     if (isHopeOff(name, d)) return false;
     if (shiftData[name][d] === "休") return false;
     if (shiftData[name][d] === "明") return false;
     if (d > 1 && shiftData[name][d - 1] === "夜") return false;
     return true;
    });
   }

   // 夜勤回数が少なく、前々日夜勤でない人を優先
   candidates.sort((a, b) => {
    const countDiff = nightCount[a] - nightCount[b];
    if (countDiff !== 0) return countDiff;
    const aPrev2 = (d > 2 && shiftData[a][d - 2] === "夜") ? 1 : 0;
    const bPrev2 = (d > 2 && shiftData[b][d - 2] === "夜") ? 1 : 0;
    if (aPrev2 !== bPrev2) return aPrev2 - bPrev2;
    return (careNames.indexOf(a) * 7 + d) % careNames.length - (careNames.indexOf(b) * 7 + d) % careNames.length;
   });

   // [Claude修正] 夜勤を区分の数だけ選ぶ。①区分ごとに1人ずつ（同日夜勤NGの組み合わせは避ける）②足りなければNGを避けて補う ③それでも足りなければ補う
   const unitOfStaff = n => { const st = staffList.find(x => x.name === n); return st && st.unit_id !== undefined && st.unit_id !== null ? String(st.unit_id) : ""; };
   const selectedPair = [];
   const okWith = n => !selectedPair.includes(n) && !selectedPair.some(x => isNgPair(x, n));
   cpUnits().forEach(u => {
    if (selectedPair.length >= NIGHTS) return;
    const c = candidates.find(n => unitOfStaff(n) === String(u.id) && okWith(n));
    if (c) selectedPair.push(c);
   });
   for (const n of candidates) { if (selectedPair.length >= NIGHTS) break; if (okWith(n)) selectedPair.push(n); }
   for (const n of candidates) { if (selectedPair.length >= NIGHTS) break; if (!selectedPair.includes(n)) selectedPair.push(n); }

   selectedPair.forEach(n => {
    shiftData[n][d] = "夜";
    nightCount[n]++;
    if (d + 1 <= daysInMonth) {
     shiftData[n][d + 1] = "明";
    }
   });
  }

  // Step B: 公休「休」の配分 (毎日必ず4名)
  // 優先1: 夜勤明けの翌日を優先して「休」とする
  for (let d = 1; d <= daysInMonth; d++) {
   careNames.forEach(n => {
    if (!shiftData[n][d]) {
     if (d > 1 && shiftData[n][d - 1] === "明" && holidayCount[n] < targetHolidays[n] && dailyCareHolidays[d] < OFF_PER_DAY) {
      shiftData[n][d] = "休";
      holidayCount[n]++;
      dailyCareHolidays[d]++;
     }
    }
   });
  }

  // 優先2: 各日に公休をバランス配分 (1日4名になるまで)
  for (let d = 1; d <= daysInMonth; d++) {
   if (dailyCareHolidays[d] < OFF_PER_DAY) {
    const sortedCare = [...careNames].sort((a, b) => holidayCount[a] - holidayCount[b]);
    for (const n of sortedCare) {
     if (holidayCount[n] < targetHolidays[n] && !shiftData[n][d] && dailyCareHolidays[d] < OFF_PER_DAY) {
      shiftData[n][d] = "休";
      holidayCount[n]++;
      dailyCareHolidays[d]++;
     }
    }
   }
  }

  // 4名未満の日があれば空いている人を公休に充当して毎日必ず4名にする
  for (let d = 1; d <= daysInMonth; d++) {
   while (dailyCareHolidays[d] < OFF_PER_DAY) {
    const unassigned = careNames.filter(n => !shiftData[n][d]);
    if (unassigned.length > 0) {
     unassigned.sort((a, b) => holidayCount[a] - holidayCount[b]);
     const pick = unassigned[0];
     shiftData[pick][d] = "休";
     holidayCount[pick]++;
     dailyCareHolidays[d]++;
    } else {
     break;
    }
   }
  }

  // Step C: 出勤できる人から、早出・遅出を最低人数ずつ、残りを日勤に割り当て
  for (let d = 1; d <= daysInMonth; d++) {
   const avail = careNames.filter(n => !shiftData[n][d]);

   // 早出の選定 (2名選定): 前日遅番でない人を最優先し、月間早出回数が少ない人を割り当て
   const earlyCandidates = [...avail].sort((a, b) => {
    const aPrevLate = (d > 1 && shiftData[a][d - 1] === "遅") ? 1 : 0;
    const bPrevLate = (d > 1 && shiftData[b][d - 1] === "遅") ? 1 : 0;
    if (aPrevLate !== bPrevLate) return aPrevLate - bPrevLate;
    const eDiff = earlyCount[a] - earlyCount[b];
    if (eDiff !== 0) return eDiff;
    return (careNames.indexOf(a) * 3 + d) % careNames.length - (careNames.indexOf(b) * 3 + d) % careNames.length;
   });
   const pickedEarly = earlyCandidates.slice(0, EARLY);
   pickedEarly.forEach(n => {
    shiftData[n][d] = "早";
    earlyCount[n]++;
   });

   // 遅出の選定 (2名選定): 早出以外の候補者から、月間遅出回数が少ない人を割り当て
   const lateCandidates = avail.filter(n => !pickedEarly.includes(n)).sort((a, b) => {
    const lDiff = lateCount[a] - lateCount[b];
    if (lDiff !== 0) return lDiff;
    return (careNames.indexOf(a) * 5 + d) % careNames.length - (careNames.indexOf(b) * 5 + d) % careNames.length;
   });
   const pickedLate = lateCandidates.slice(0, LATE);
   pickedLate.forEach(n => {
    shiftData[n][d] = "遅";
    lateCount[n]++;
   });

   // 残りの介護職員はすべて「日」（日勤）
   const remainingDay = avail.filter(n => !pickedEarly.includes(n) && !pickedLate.includes(n));
   remainingDay.forEach(n => {
    shiftData[n][d] = "日";
    dayCount[n]++;
   });
  }

  // Step D: 最低人数に足りない日を直す（日勤から早出・遅出へ、公休から日勤へ）
  // ※ 希望休の職員は絶対に日勤・早番・遅番へ転換しない
  for (let d = 1; d <= daysInMonth; d++) {
   let eCount = careNames.filter(n => shiftData[n][d] === "早").length;
   let lCount = careNames.filter(n => shiftData[n][d] === "遅").length;
   let dCount = careNames.filter(n => shiftData[n][d] === "日").length;

   // 早出を最低人数に
   while (eCount < EARLY) {
    const cand = careNames.find(n => shiftData[n][d] === "日" && !isHopeOff(n, d));
    if (cand) { shiftData[cand][d] = "早"; eCount++; dCount--; } else break;
   }
   // 遅出を最低人数に
   while (lCount < LATE) {
    const cand = careNames.find(n => shiftData[n][d] === "日" && !isHopeOff(n, d));
    if (cand) { shiftData[cand][d] = "遅"; lCount++; dCount--; } else break;
   }
   // 日勤を最低人数に (希望休でない公休職員のみ日勤へ充当)
   while (dCount < DAYMIN) {
    const cand = careNames.find(n => shiftData[n][d] === "休" && !isHopeOff(n, d));
    if (cand) { shiftData[cand][d] = "日"; dCount++; } else break;
   }
  }
 }

 if (!db.data.monthly_shifts) db.data.monthly_shifts = {};
 db.data.monthly_shifts[yearMonth] = shiftData;
 db.save();
 if (typeof renderTodayShiftBar === "function") renderTodayShiftBar();
 if (typeof renderDailyJournal === "function" && gState.activeCareTab === "daily_journal") renderDailyJournal();
 return shiftData;
}


function renderShiftTable(yearMonth) {
 // [Claude修正] 早出・日勤・遅出・夜勤（明け）の基準は「勤務の最低人数」の設定、介護公休の基準は残りの人数（勤務表の自動生成と同じ考え方）
 const cpMin = cpStaffing();
 const nightTarget = cpMin.night;
 const careOffTarget = Math.max(0, cpCareStaffCount() - (cpMin.early + cpMin.day + cpMin.late + nightTarget * 2));
 if (typeof renderShiftStaffingSettings === "function") renderShiftStaffingSettings();
 const ym = yearMonth || getShiftYearMonth();
 // [Claude修正] 表示している月を、上の月の欄にも出す（勤務表を開いた直後は欄が空のままだった）
 { const sel = document.getElementById("shiftMonthSelector"); if (sel && sel.value !== ym) sel.value = ym; gState.currentShiftMonth = ym; }
 const [yearStr, monthStr] = ym.split("-");
 const year = parseInt(yearStr, 10);
 const month = parseInt(monthStr, 10);
 const daysInMonth = new Date(year, month, 0).getDate();

 const allStamps = sortStaffList(db.data.stamps || []);
 const staffList = allStamps.map(s => typeof s === "string" ? { name: s, role: "介護職員" } : s);
 const isCare = s => getStaffRoleCategory(s.name) === "care";
 const careStaffNames = staffList.filter(isCare).map(s => s.name);

 // シフトデータの存在および完全性チェック (全日「早2・遅2・日2・夜2・明2」を満たしているか、最新職員が含まれているか)
 let needRegen = false;
 const currentData = db.data.monthly_shifts && db.data.monthly_shifts[ym];
 if (!currentData || Object.keys(currentData).length === 0) {
 needRegen = true;
 } else {
 const missingStaff = careStaffNames.some(name => !currentData[name]);
 if (missingStaff) {
 needRegen = true;
 }
 }
 if (!needRegen && currentData) {
 const hopeList = (db.data.shift_hope_offs || []).filter(h => h.year_month === ym);
 const unreflectedHope = hopeList.some(h => currentData[h.staff_name] && currentData[h.staff_name][h.day] !== "休");
 if (unreflectedHope) {
 needRegen = true;
 }
 }

 if (needRegen) {
 generateMonthlyShiftData(ym);
 }
 const shiftData = db.data.monthly_shifts[ym] || {};

 const table = document.getElementById("shiftMatrixTable");
 if (!table) return;

 // [Antigravity実装 2026-10-15] 区分が複数ある施設で表の上に色見本を表示（1つしかない施設では出さない）
 const cpFacilityUnits = cpUnits();
 const unitLegendEl = document.getElementById("shiftUnitLegendContainer");
 if (unitLegendEl) {
   if (cpFacilityUnits.length > 1) {
     const badges = cpFacilityUnits.map(u => {
       const col = cpGetUnitColor(u.id);
       return `<span class="shift-staff-unit-badge" style="background:${col.bg}; color:${col.text}; border:1px solid ${col.border}; font-size:11px; padding:2px 6px;">${escapeHtml(u.name)}</span>`;
     }).join(" ");
     unitLegendEl.innerHTML = `<span style="font-size:12px; font-weight:bold; color:var(--text-muted); margin-left:8px;">所属区分:</span> ${badges}`;
     unitLegendEl.style.display = "inline-flex";
   } else {
     unitLegendEl.innerHTML = "";
     unitLegendEl.style.display = "none";
   }
 }

 const dowNames = ["日", "月", "火", "水", "木", "金", "土"];

 // 日別統計用 (介護職: 早出2名・遅出2名・夜勤2名・明け2名・日勤2名・公休4名)
 const dailyEarlyCount = new Array(daysInMonth + 1).fill(0);
 const dailyLateCount = new Array(daysInMonth + 1).fill(0);
 const dailyNightCount = new Array(daysInMonth + 1).fill(0);
 const dailyAkeCount = new Array(daysInMonth + 1).fill(0);
 const dailyCareDayCount = new Array(daysInMonth + 1).fill(0);
 const dailyDayCount = new Array(daysInMonth + 1).fill(0);
 const dailyHolidayCount = new Array(daysInMonth + 1).fill(0);

 // 1. ヘッダー生成
 let theadHtml = `
 <thead>
 <tr>
 <th rowspan="2" style="position:sticky; left:0; z-index:4; background:#173f33; color:#fff; width:130px; min-width:130px; border:1px solid #3d8a6e;">職員氏名</th>
 <th rowspan="2" style="background:#173f33; color:#fff; width:80px; min-width:80px; border:1px solid #3d8a6e;">役職</th>
 `;

 for (let d = 1; d <= daysInMonth; d++) {
 const dow = new Date(year, month - 1, d).getDay();
 const hol = isHolidayOrYearEnd(year, month, d);
 const isSat = dow === 6;
 const isSun = dow === 0 || hol.isHoliday;
 const bg = isSun ? "#ef4444" : (isSat ? "#1e5b47" : "#3d8a6e");
 const titleAttr = hol.isHoliday ? `title="${hol.name}"` : '';
 theadHtml += `<th style="background:${bg}; color:#fff; padding:4px 2px; min-width:32px; border:1px solid rgba(255,255,255,0.3); font-weight:bold;" ${titleAttr}>${d}</th>`;
 }

 theadHtml += `
 <th rowspan="2" style="background:#173f33; color:#fff; min-width:38px; border:1px solid #3d8a6e;" title="出勤日数">出勤</th>
 <th rowspan="2" style="background:#173f33; color:#fff; min-width:38px; border:1px solid #3d8a6e;" title="夜勤回数">夜勤</th>
 <th rowspan="2" style="background:#173f33; color:#fff; min-width:38px; border:1px solid #3d8a6e;" title="公休日数">公休</th>
 </tr>
 <tr>
 `;

 for (let d = 1; d <= daysInMonth; d++) {
 const dow = new Date(year, month - 1, d).getDay();
 const hol = isHolidayOrYearEnd(year, month, d);
 const isSat = dow === 6;
 const isSun = dow === 0 || hol.isHoliday;
 const bg = isSun ? "#fee2e2" : (isSat ? "#dcebe3" : "#eef2ef");
 const color = isSun ? "#b91c1c" : (isSat ? "#1a4f3d" : "#4a5852");
 const dowLabel = hol.isHoliday ? (hol.name.length <= 3 ? hol.name : "祝") : dowNames[dow];
 const titleAttr = hol.isHoliday ? `title="${hol.name}"` : '';
 theadHtml += `<th style="background:${bg}; color:${color}; padding:2px; font-size:10.5px; font-weight:bold; border:1px solid #cdd6d0;" ${titleAttr}>${dowLabel}</th>`;
 }

  theadHtml += `
  </tr>
  <!-- 行事・予定行 -->
  <tr class="shift-event-row">
  <th colspan="2" class="shift-event-head" style="position:sticky; left:0; z-index:4; text-align:left;">行事・予定</th>
  `;

  const shiftEvents = (db.data.shift_events && db.data.shift_events[ym]) || {};
  for (let d = 1; d <= daysInMonth; d++) {
    const hol = isHolidayOrYearEnd(year, month, d);
    const customEvt = shiftEvents[d] || "";
    const evtText = customEvt || (hol.isHoliday ? hol.name : "");
    const titleAttr = evtText ? `title="${escapeHtml(evtText)} (クリックして編集)"` : 'title="クリックして行事・予定を登録"';
    theadHtml += `<th class="shift-event-cell" ${titleAttr} onclick="openShiftEventModal('${ym}', ${d})">${escapeHtml(evtText)}</th>`; // [Antigravity実装 2026-10-15]
  }

  theadHtml += `
  <th colspan="3" class="shift-event-head">行事</th>
  </tr>
  </thead>
  `;

 // 2. ボディ行（各職員）生成
 let tbodyHtml = "<tbody>";

 const hopeOffs = (db.data.shift_hope_offs || []).filter(h => h.year_month === ym);
 const hopeOffMap = {};
 hopeOffs.forEach(h => {
  hopeOffMap[`${h.staff_name}_${h.day}`] = h;
 });
 staffList.forEach(st => {
 const staffShifts = shiftData[st.name] || {};
 const isCareStaff = getStaffRoleCategory(st.name) === "care";
 let workDays = 0;
 let nightDays = 0;
 let holidays = 0;

 let roleColor = "#5f6d66";
 let roleBg = "#eef2ef";
 if (st.role.includes("施設長") || st.role.includes("管理者")) {
 roleColor = "#92400e"; roleBg = "#fef3c7";
 } else if (st.role.includes("事務")) {
 roleColor = "#065f46"; roleBg = "#d1fae5";
 } else if (st.role.includes("看護")) {
 roleColor = "#0369a1"; roleBg = "#e0f2fe";
 } else if (st.role.includes("リーダー")) {
 roleColor = "#6d28d9"; roleBg = "#ede9fe";
 }

 // [Antigravity実装 2026-10-15] 職員名の欄に基本区分印を表示（区分が1つの施設では出さない。応援印と見分けがつくデザイン）
 let staffUnitBadge = "";
 if (cpUnits().length > 1 && st.unit_id !== undefined && st.unit_id !== null && st.unit_id !== "") {
   const uName = cpUnitName(st.unit_id);
   if (uName) {
     const col = cpGetUnitColor(st.unit_id);
     staffUnitBadge = `<span class="shift-staff-unit-badge" style="background:${col.bg}; color:${col.text}; border:1px solid ${col.border};" title="所属区分: ${escapeHtml(uName)}">${escapeHtml(uName)}</span>`;
   }
 }

 tbodyHtml += `
 <tr>
 <td style="position:sticky; left:0; z-index:2; background:#ffffff; font-weight:bold; color:#22302b; text-align:left; padding:6px 8px; border:1px solid #cdd6d0; white-space:nowrap; box-shadow: 2px 0 4px rgba(0,0,0,0.04);">
 ${getStaffRoleBadgeHtml(st.name)} ${escapeHtml(st.name)}${staffUnitBadge}
 </td>
 <td style="border:1px solid #cdd6d0; padding:4px 2px; white-space:nowrap;">
 <span style="display:inline-block; font-size:11px; padding:2px 4px; border-radius:4px; font-weight:bold; background:${roleBg}; color:${roleColor};">${st.role || '介護'}</span>
 </td>
 `;

 for (let d = 1; d <= daysInMonth; d++) {
 const sym = staffShifts[d] || "";
   const isHope = Boolean(hopeOffMap[`${st.name}_${d}`]);
   const hopeInfo = hopeOffMap[`${st.name}_${d}`];
   let hopeTag = "";
   if (isHope) {
    hopeTag = `<span class="shift-hope-tag">希望</span>`;
   }
 const dow = new Date(year, month - 1, d).getDay();
 const hol = isHolidayOrYearEnd(year, month, d);
 const isSat = dow === 6;
 const isSun = dow === 0 || hol.isHoliday;

 let cellBg = isSun ? "#fff5f5" : (isSat ? "#f6f8f6" : "#ffffff");
   if (isHope) cellBg = "#fef2f2";
 let badgeClass = "";
 if (sym === "早") {
 badgeClass = "shift-badge shift-haya";
 workDays++;
 dailyEarlyCount[d]++;
 } else if (sym === "日") {
 badgeClass = "shift-badge shift-nichi";
 workDays++;
 dailyDayCount[d]++;
 if (isCareStaff) dailyCareDayCount[d]++;
 } else if (sym === "遅") {
 badgeClass = "shift-badge shift-osoba";
 workDays++;
 dailyLateCount[d]++;
 } else if (sym === "夜") {
 badgeClass = "shift-badge shift-yakan";
 workDays++;
 nightDays++;
 dailyNightCount[d]++;
 } else if (sym === "明") {
 badgeClass = "shift-badge shift-ake";
 workDays++;
 dailyAkeCount[d]++;
 } else if (sym === "休") {
 badgeClass = "shift-badge shift-kyu";
 holidays++;
 if (isCareStaff) dailyHolidayCount[d]++;
 }

 const safeName = escapeHtml(st.name);
  const customUnitId = (db.data.monthly_shift_units && db.data.monthly_shift_units[ym] && db.data.monthly_shift_units[ym][st.name]) ? db.data.monthly_shift_units[ym][st.name][d] : null;
  let unitTag = "";
  // [Claude修正] 応援の印は早出・日勤・遅出・夜勤の日だけ（公休の日に「休東棟」と出ていた）
  if (customUnitId !== null && customUnitId !== undefined && customUnitId !== "" && cpIsWorkShift(sym)) {
    const uName = cpUnitName(customUnitId);
    if (uName) {
      unitTag = `<span class="shift-help-unit-tag" title="応援・担当: ${escapeHtml(uName)}">${escapeHtml(uName)}</span>`;
    }
  }
  tbodyHtml += `
    <td class="shift-cell ${hol.isHoliday ? 'shift-holiday-col' : ''} ${isHope ? 'shift-cell-hope' : ''}" style="background:${cellBg};" onclick="openShiftCellPopover(event, '${safeName}', ${d}, '${sym}')" ondblclick="cycleShiftCell('${safeName}', ${d})" title="${st.name} ${month}月${d}日: ${isHope ? '【希望休】' + (hopeInfo.reason || '申請済') + ' - ' : ''}クリックして即時変更">
    ${sym ? `<span class="${badgeClass}">${sym}</span>${unitTag}${hopeTag}` : `<span style="color:#cdd6d0;">-</span>`}
  </td>
  `;
 }

 tbodyHtml += `
 <td style="border:1px solid #cdd6d0; font-weight:bold; color:#22302b; background:#f6f8f6;">${workDays}</td>
 <td style="border:1px solid #cdd6d0; font-weight:bold; color:#3730a3; background:#f6f8f6;">${nightDays}</td>
 <td style="border:1px solid #cdd6d0; font-weight:bold; color:#b91c1c; background:#f6f8f6;">${holidays}</td>
 </tr>
 `;
 });

 tbodyHtml += "</tbody>";

 // 3. フッター集計行 (早出2名・遅出2名・夜勤2名・明け2名・介護日勤2名・全体日勤・介護公休4名)
 let tfootHtml = `
 <tfoot>
 <!-- 早出人数チェック行 （最低人数は設定から） -->
 <tr style="background:#ffedd5; font-weight:bold; border-top:2px solid #ea580c;">
 <td style="position:sticky; left:0; z-index:2; background:#ffedd5; text-align:left; padding:5px 8px; border:1px solid #fed7aa; color:#9a3412;" colspan="2">
 早出体制 (最低: ${cpMin.early}名)
 </td>
 `;
 for (let d = 1; d <= daysInMonth; d++) {
 const cnt = dailyEarlyCount[d];
 let badgeStyle = "color:#16a34a; font-weight:bold; font-size:12.5px;";
 if (cnt >= cpMin.early) {
 badgeStyle = "color:#16a34a; font-weight:bold; font-size:12.5px;";
 } else if (cnt < cpMin.early) {
 badgeStyle = "color:#dc2626; font-weight:bold; background:#fee2e2; border-radius:3px; padding:1px 3px; font-size:12.5px;";
 } else {
 badgeStyle = "color:#b45309; font-weight:bold; background:#fef3c7; border-radius:3px; padding:1px 3px; font-size:12.5px;";
 }
 tfootHtml += `<td style="border:1px solid #fed7aa; padding:3px 2px;"><span style="${badgeStyle}">${cnt}</span></td>`;
 }
 tfootHtml += `
 <td colspan="3" style="border:1px solid #fed7aa; color:#9a3412; font-size:11px;">最低${cpMin.early}名</td>
 </tr>

 <!-- 遅出人数チェック行 （最低人数は設定から） -->
 <tr style="background:#ede9fe; font-weight:bold;">
 <td style="position:sticky; left:0; z-index:2; background:#ede9fe; text-align:left; padding:5px 8px; border:1px solid #ddd6fe; color:#5b21b6;" colspan="2">
 遅出体制 (最低: ${cpMin.late}名)
 </td>
 `;
 for (let d = 1; d <= daysInMonth; d++) {
 const cnt = dailyLateCount[d];
 let badgeStyle = "color:#16a34a; font-weight:bold; font-size:12.5px;";
 if (cnt >= cpMin.late) {
 badgeStyle = "color:#16a34a; font-weight:bold; font-size:12.5px;";
 } else if (cnt < cpMin.late) {
 badgeStyle = "color:#dc2626; font-weight:bold; background:#fee2e2; border-radius:3px; padding:1px 3px; font-size:12.5px;";
 } else {
 badgeStyle = "color:#b45309; font-weight:bold; background:#fef3c7; border-radius:3px; padding:1px 3px; font-size:12.5px;";
 }
 tfootHtml += `<td style="border:1px solid #ddd6fe; padding:3px 2px;"><span style="${badgeStyle}">${cnt}</span></td>`;
 }
 tfootHtml += `
 <td colspan="3" style="border:1px solid #ddd6fe; color:#5b21b6; font-size:11px;">最低${cpMin.late}名</td>
 </tr>

 <!-- 夜勤人数チェック行（基準は区分の数） -->
 <tr style="background:#e0e7ff; font-weight:bold;">
 <td style="position:sticky; left:0; z-index:2; background:#e0e7ff; text-align:left; padding:5px 8px; border:1px solid #c7d2fe; color:#3730a3;" colspan="2">
 夜勤体制 (最低: ${nightTarget}名)
 </td>
 `;
 for (let d = 1; d <= daysInMonth; d++) {
 const cnt = dailyNightCount[d];
 let badgeStyle = "color:#16a34a; font-weight:bold; font-size:12.5px;";
 if (cnt >= nightTarget) {
 badgeStyle = "color:#16a34a; font-weight:bold; font-size:12.5px;";
 } else if (cnt < nightTarget) {
 badgeStyle = "color:#dc2626; font-weight:bold; background:#fee2e2; border-radius:3px; padding:1px 3px; font-size:12.5px;";
 } else {
 badgeStyle = "color:#b45309; font-weight:bold; background:#fef3c7; border-radius:3px; padding:1px 3px; font-size:12.5px;";
 }
 tfootHtml += `<td style="border:1px solid #c7d2fe; padding:3px 2px;"><span style="${badgeStyle}">${cnt}</span></td>`;
 }
 tfootHtml += `
 <td colspan="3" style="border:1px solid #c7d2fe; color:#3730a3; font-size:11px;">最低${nightTarget}名</td>
 </tr>

 <!-- 明け人数チェック行（基準は区分の数） -->
 <tr style="background:#fef9c3; font-weight:bold;">
 <td style="position:sticky; left:0; z-index:2; background:#fef9c3; text-align:left; padding:5px 8px; border:1px solid #fef08a; color:#854d0e;" colspan="2">
 明け体制 (最低: ${nightTarget}名)
 </td>
 `;
 for (let d = 1; d <= daysInMonth; d++) {
 const cnt = dailyAkeCount[d];
 let badgeStyle = "color:#16a34a; font-weight:bold; font-size:12.5px;";
 if (cnt >= nightTarget) {
 badgeStyle = "color:#16a34a; font-weight:bold; font-size:12.5px;";
 } else if (cnt < nightTarget) {
 badgeStyle = "color:#dc2626; font-weight:bold; background:#fee2e2; border-radius:3px; padding:1px 3px; font-size:12.5px;";
 } else {
 badgeStyle = "color:#b45309; font-weight:bold; background:#fef3c7; border-radius:3px; padding:1px 3px; font-size:12.5px;";
 }
 tfootHtml += `<td style="border:1px solid #fef08a; padding:3px 2px;"><span style="${badgeStyle}">${cnt}</span></td>`;
 }
 tfootHtml += `
 <td colspan="3" style="border:1px solid #fef08a; color:#854d0e; font-size:11px;">最低${nightTarget}名</td>
 </tr>

 <!-- 介護日勤人数行 （最低人数は設定から） -->
 <tr style="background:#e0f2fe; font-weight:bold;">
 <td style="position:sticky; left:0; z-index:2; background:#e0f2fe; text-align:left; padding:5px 8px; border:1px solid #bae6fd; color:#0369a1;" colspan="2">
  介護日勤 (最低: ${cpMin.day}名)
 </td>
 `;
 for (let d = 1; d <= daysInMonth; d++) {
 const cnt = dailyCareDayCount[d];
 let badgeStyle = "color:#16a34a; font-weight:bold; font-size:12.5px;";
 if (cnt >= cpMin.day) {
 badgeStyle = "color:#16a34a; font-weight:bold; font-size:12.5px;";
 } else if (cnt < cpMin.day) {
 badgeStyle = "color:#dc2626; font-weight:bold; background:#fee2e2; border-radius:3px; padding:1px 3px; font-size:12.5px;";
 } else {
 badgeStyle = "color:#b45309; font-weight:bold; background:#fef3c7; border-radius:3px; padding:1px 3px; font-size:12.5px;";
 }
 tfootHtml += `<td style="border:1px solid #bae6fd; padding:3px 2px;"><span style="${badgeStyle}">${cnt}</span></td>`;
 }
 tfootHtml += `
 <td colspan="3" style="border:1px solid #bae6fd; color:#0369a1; font-size:11px;">最低${cpMin.day}名</td>
 </tr>

 <!-- 全体日勤人数行 -->
 <tr style="background:#eef2ef; font-weight:bold;">
 <td style="position:sticky; left:0; z-index:2; background:#eef2ef; text-align:left; padding:5px 8px; border:1px solid #cdd6d0; color:#36443e;" colspan="2">
 全体日勤 (管理者・計画作成・相談員・事務・看護含む)
 </td>
 `;
 for (let d = 1; d <= daysInMonth; d++) {
 const cnt = dailyDayCount[d];
 tfootHtml += `<td style="border:1px solid #cdd6d0; padding:3px 2px; color:#36443e;">${cnt}</td>`;
 }
 tfootHtml += `
 <td colspan="3" style="border:1px solid #cdd6d0; color:#5f6d66; font-size:11px;">施設全体</td>
 </tr>

 <!-- 介護公休人数行（基準は介護職の人数−10） -->
 <tr style="background:#fef2f2; font-weight:bold;">
 <td style="position:sticky; left:0; z-index:2; background:#fef2f2; text-align:left; padding:5px 8px; border:1px solid #fecaca; color:#991b1b;" colspan="2">
 介護公休 (基準: ${careOffTarget}名)
 </td>
 `;
 for (let d = 1; d <= daysInMonth; d++) {
 const cnt = dailyHolidayCount[d];
 let badgeStyle = "color:#16a34a; font-weight:bold; font-size:12.5px;";
 if (cnt === careOffTarget) {
 badgeStyle = "color:#16a34a; font-weight:bold; font-size:12.5px;";
 } else {
 badgeStyle = "color:#b45309; font-weight:bold; background:#fef3c7; border-radius:3px; padding:1px 3px; font-size:12.5px;";
 }
 tfootHtml += `<td style="border:1px solid #fecaca; padding:3px 2px;"><span style="${badgeStyle}">${cnt}</span></td>`;
 }
 tfootHtml += `
 <td colspan="3" style="border:1px solid #fecaca; color:#991b1b; font-size:11px;">公休合計</td>
 </tr>
 </tfoot>
 `;

 table.innerHTML = theadHtml + tbodyHtml + tfootHtml;
}

// クイック変更ポップオーバー (セル直下で職種別安全選択)
function openShiftCellPopover(event, staffName, day, currentSymbol) {
 if (event) event.stopPropagation();
 const ym = getShiftYearMonth();
 const [yearStr, monthStr] = ym.split("-");
 const year = parseInt(yearStr, 10);
 const month = parseInt(monthStr, 10);
 const dowNames = ["日", "月", "火", "水", "木", "金", "土"];
 const dow = new Date(year, month - 1, day).getDay();
 const hol = isHolidayOrYearEnd(year, month, day);

 gShiftEditingCell = { staffName, day, yearMonth: ym };
 const isHope = (db.data.shift_hope_offs || []).some(h => 
  h.year_month === ym && h.staff_name === staffName && parseInt(h.day, 10) === day
 );

 let popover = document.getElementById("shiftCellPopover");
 if (!popover) {
 popover = document.createElement("div");
 popover.id = "shiftCellPopover";
 popover.className = "shift-cell-popover";
 document.body.appendChild(popover);
 }

 const rect = event ? event.currentTarget.getBoundingClientRect() : { top: 200, bottom: 230, left: 200 };
 const dateInfo = hol.isHoliday ? `${month}/${day}(${dowNames[dow]}・${hol.name})` : `${month}/${day}(${dowNames[dow]})`;
 const roleCategory = getStaffRoleCategory(staffName);

 let roleBadgeLabel = "介護職員";
 if (roleCategory === "director") roleBadgeLabel = "管理者（日勤専従）";
 else if (roleCategory === "caremanager") roleBadgeLabel = "計画作成担当者（日勤専従）";
 else if (roleCategory === "counselor") roleBadgeLabel = "相談員（日勤専従）";
 else if (roleCategory === "office" || roleCategory === "parttime") roleBadgeLabel = "事務員（日勤専従）";
 else if (roleCategory === "nurse") roleBadgeLabel = "看護師（日勤専従）";

 let contentHtml = "";

 if (roleCategory !== "care") {
 // 施設長・事務員・看護師: 日勤または公休のみ！夜勤・早・遅は完全除外で誤操作を絶対防止
 contentHtml = `
 <div class="shift-popover-header">
 <div>
 <strong style="color:#173f33;">${escapeHtml(staffName)}</strong> 
 <span style="color:#5f6d66; font-size:11.5px; margin-left:4px;">${dateInfo}</span>
 </div>
 <button onclick="closeShiftPopover()" style="border:none; background:none; font-size:16px; cursor:pointer; color:#94a19a; line-height:1;">&times;</button>
 </div>
 <div style="font-size:11px; color:#0369a1; background:#f0f9ff; border:1px solid #bae6fd; border-radius:4px; padding:3px 6px; margin-bottom:8px;">
 <strong>${roleBadgeLabel}</strong><br>日勤または公休のみ選択可能です（夜勤・早遅は自動ガード）
 </div>
 <div class="shift-popover-grid" style="grid-template-columns: 1fr 1fr;">
 <button class="shift-popover-btn btn-nichi" onclick="executeShiftCellEdit('日')"> 日勤</button>
 <button class="shift-popover-btn btn-kyu" onclick="executeShiftCellEdit('休')"> 公休</button>
 <button class="shift-popover-btn btn-clear" onclick="executeShiftCellEdit('')" style="grid-column: span 2;"> クリア</button>
 </div>
   <!-- 区分（担当・応援ヘルプ）切り替えボタン -->
  ${(() => {
    const uList = cpUnits();
    if (!uList || uList.length === 0) return '';
    // [Claude修正] 応援は勤務の日だけ設定できる（公休・明けの日に応援を付けられていた）
    if (!cpIsWorkShift(currentSymbol)) return `<div class="shift-help-note">応援の区分は、早出・日勤・遅出・夜勤の日だけ設定できます。</div>`;
    const stObj = (db.data.stamps || []).find(x => (x.name || x) === staffName);
    const baseUnitId = (stObj && stObj.unit_id !== undefined && stObj.unit_id !== null) ? stObj.unit_id : null;
    const customUnit = (db.data.monthly_shift_units && db.data.monthly_shift_units[ym] && db.data.monthly_shift_units[ym][staffName]) ? db.data.monthly_shift_units[ym][staffName][day] : undefined;
    const activeUnitId = (customUnit !== undefined && customUnit !== null) ? customUnit : baseUnitId;

    let uBtns = uList.map(u => {
      const isSelected = String(u.id) === String(activeUnitId);
      const isBase = String(u.id) === String(baseUnitId);
      const suffix = isBase ? ' (基本)' : ' (応援)';
      // [Claude修正] 色は見た目の決まりの変数、文字13px・高さ36px（style.css の .shift-unit-btn）
      return `<button type="button" class="shift-unit-btn${isSelected ? ' is-active' : ''}" onclick="changeShiftCellUnit('${escapeHtml(staffName)}', ${day}, ${u.id})">${escapeHtml(u.name)}${suffix}</button>`;
    }).join('');

    return `
    <div style="margin-top:6px; padding-top:6px; border-top:1px dashed #cdd6d0;">
      <div class="shift-unit-label">担当区分・応援切り替え:</div>
      <div style="display:flex; gap:4px; flex-wrap:wrap;">
        ${uBtns}
        <button type="button" class="shift-unit-btn shift-unit-reset" onclick="changeShiftCellUnit('${escapeHtml(staffName)}', ${day}, null)">基本に戻す</button>
      </div>
    </div>
    `;
  })()}
  <div style="margin-top:8px; padding-top:6px; border-top:1px solid #dfe5e1; display:flex; justify-content:space-between; align-items:center;">
   <button type="button" class="btn btn-outline" style="font-size:11px; padding:3px 8px; ${isHope ? 'background:#fee2e2; color:#b91c1c; border-color:#fca5a5; font-weight:bold;' : 'background:#f6f8f6; color:#4a5852;'}" onclick="toggleShiftHopeOff('${escapeHtml(staffName)}', ${day})">${isHope ? '希望休の解除' : '＋ この日を希望休に設定'}</button>
 <a href="javascript:void(0)" onclick="closeShiftPopover(); openShiftCellModal('${escapeHtml(staffName)}', ${day})" style="font-size:11px; color:#1e5b47; text-decoration:underline;"> 詳細設定</a>
 </div>
 `;
 } else {
 // 介護職員: 全シフト選択可能
 contentHtml = `
 <div class="shift-popover-header">
 <div>
 <strong style="color:#173f33;">${escapeHtml(staffName)}</strong> 
 <span style="color:#5f6d66; font-size:11.5px; margin-left:4px;">${dateInfo}</span>
 </div>
 <button onclick="closeShiftPopover()" style="border:none; background:none; font-size:16px; cursor:pointer; color:#94a19a; line-height:1;">&times;</button>
 </div>
 <div style="font-size:11px; color:#4a5852; margin-bottom:6px;">
 介護職員シフト（基準: 早出1名・遅出1名・夜勤2名体制）
 </div>
 <div class="shift-popover-grid">
 <button class="shift-popover-btn btn-haya" onclick="executeShiftCellEdit('早')"> 早番</button>
 <button class="shift-popover-btn btn-nichi" onclick="executeShiftCellEdit('日')"> 日勤</button>
 <button class="shift-popover-btn btn-osoba" onclick="executeShiftCellEdit('遅')"> 遅番</button>
 <button class="shift-popover-btn btn-yakan" onclick="executeShiftCellEdit('夜')"> 夜勤</button>
 <button class="shift-popover-btn btn-ake" onclick="executeShiftCellEdit('明')"> 明け</button>
 <button class="shift-popover-btn btn-kyu" onclick="executeShiftCellEdit('休')"> 公休</button>
 <button class="shift-popover-btn btn-clear" onclick="executeShiftCellEdit('')" style="grid-column: span 2;"> クリア</button>
 </div>
   <!-- 区分（担当・応援ヘルプ）切り替えボタン -->
  ${(() => {
    const uList = cpUnits();
    if (!uList || uList.length === 0) return '';
    // [Claude修正] 応援は勤務の日だけ設定できる（公休・明けの日に応援を付けられていた）
    if (!cpIsWorkShift(currentSymbol)) return `<div class="shift-help-note">応援の区分は、早出・日勤・遅出・夜勤の日だけ設定できます。</div>`;
    const stObj = (db.data.stamps || []).find(x => (x.name || x) === staffName);
    const baseUnitId = (stObj && stObj.unit_id !== undefined && stObj.unit_id !== null) ? stObj.unit_id : null;
    const customUnit = (db.data.monthly_shift_units && db.data.monthly_shift_units[ym] && db.data.monthly_shift_units[ym][staffName]) ? db.data.monthly_shift_units[ym][staffName][day] : undefined;
    const activeUnitId = (customUnit !== undefined && customUnit !== null) ? customUnit : baseUnitId;

    let uBtns = uList.map(u => {
      const isSelected = String(u.id) === String(activeUnitId);
      const isBase = String(u.id) === String(baseUnitId);
      const suffix = isBase ? ' (基本)' : ' (応援)';
      // [Claude修正] 色は見た目の決まりの変数、文字13px・高さ36px（style.css の .shift-unit-btn）
      return `<button type="button" class="shift-unit-btn${isSelected ? ' is-active' : ''}" onclick="changeShiftCellUnit('${escapeHtml(staffName)}', ${day}, ${u.id})">${escapeHtml(u.name)}${suffix}</button>`;
    }).join('');

    return `
    <div style="margin-top:6px; padding-top:6px; border-top:1px dashed #cdd6d0;">
      <div class="shift-unit-label">担当区分・応援切り替え:</div>
      <div style="display:flex; gap:4px; flex-wrap:wrap;">
        ${uBtns}
        <button type="button" class="shift-unit-btn shift-unit-reset" onclick="changeShiftCellUnit('${escapeHtml(staffName)}', ${day}, null)">基本に戻す</button>
      </div>
    </div>
    `;
  })()}
  <div style="margin-top:8px; padding-top:6px; border-top:1px solid #dfe5e1; display:flex; justify-content:space-between; align-items:center;">
   <button type="button" class="btn btn-outline" style="font-size:11px; padding:3px 8px; ${isHope ? 'background:#fee2e2; color:#b91c1c; border-color:#fca5a5; font-weight:bold;' : 'background:#f6f8f6; color:#4a5852;'}" onclick="toggleShiftHopeOff('${escapeHtml(staffName)}', ${day})">${isHope ? '希望休の解除' : '＋ この日を希望休に設定'}</button>
 <a href="javascript:void(0)" onclick="closeShiftPopover(); openShiftCellModal('${escapeHtml(staffName)}', ${day})" style="font-size:11px; color:#1e5b47; text-decoration:underline;"> 詳細設定</a>
 </div>
 `;
 }

 popover.innerHTML = contentHtml;

 // 画面位置の調整 (画面外はみ出し防止)
 let top = rect.bottom + window.scrollY + 6;
 let left = rect.left + window.scrollX - 60;
 if (left < 10) left = 10;
 if (left + 270 > window.innerWidth) left = window.innerWidth - 280;
 if (rect.bottom + 160 > window.innerHeight) {
 top = rect.top + window.scrollY - 150;
 }

 popover.style.top = `${top}px`;
 popover.style.left = `${left}px`;
 popover.style.display = "block";
}

function closeShiftPopover() {
 const p = document.getElementById("shiftCellPopover");
 if (p) p.style.display = "none";
}

function executeShiftCellEdit(symbol) {
 applyShiftCellEdit(symbol);
 closeShiftPopover();
}

// ダブルクリックで安全な切り替え (事務・施設長・看護師は「日 ⇄ 休」のみ、介護職も日勤・公休安全トグルで夜勤誤爆を完全防止)
function cycleShiftCell(staffName, day) {
 const ym = getShiftYearMonth();
 if (!db.data.monthly_shifts) db.data.monthly_shifts = {};
 if (!db.data.monthly_shifts[ym]) db.data.monthly_shifts[ym] = {};
 if (!db.data.monthly_shifts[ym][staffName]) db.data.monthly_shifts[ym][staffName] = {};

 const cur = db.data.monthly_shifts[ym][staffName][day] || "";
 const roleCategory = getStaffRoleCategory(staffName);

 let nextSym = "日";
 if (roleCategory !== "care") {
 // 施設長・事務員・看護師: 「日 ⇄ 休」のみ安全にトグル！決して夜勤や早出・遅出にならない！
 nextSym = (cur === "日") ? "休" : "日";
 } else {
 // 介護職員: 誤操作で夜勤にならないよう安全に「日 ⇄ 休」をトグル
 // 夜勤・早番・遅番への変更はポップオーバーから明示的に選択
 if (cur === "日") nextSym = "休";
 else if (cur === "休") nextSym = "日";
 else if (cur === "早" || cur === "遅" || cur === "夜") nextSym = "日";
 else if (cur === "明") nextSym = "休";
 else nextSym = "日";
 }

 gShiftEditingCell = { staffName, day, yearMonth: ym };
 applyShiftCellEdit(nextSym);
}

// ポップオーバー外側クリックで閉じるリスナー
if (typeof window !== "undefined") {
 document.addEventListener("click", (e) => {
 const popover = document.getElementById("shiftCellPopover");
 if (popover && popover.style.display !== "none") {
 if (!popover.contains(e.target) && !e.target.closest(".shift-cell")) {
 popover.style.display = "none";
 }
 }
 });
}

// 手動セル編集モーダル (職種別ガード付き)
function openShiftCellModal(staffName, day) {
 const ym = getShiftYearMonth();
 const [yearStr, monthStr] = ym.split("-");
 const year = parseInt(yearStr, 10);
 const month = parseInt(monthStr, 10);
 const dowNames = ["日", "月", "火", "水", "木", "金", "土"];
 const dow = new Date(year, month - 1, day).getDay();
 const hol = isHolidayOrYearEnd(year, month, day);

 gShiftEditingCell = { staffName, day, yearMonth: ym };

 const targetText = document.getElementById("shiftEditTargetText");
 if (targetText) {
 const dateLabel = hol.isHoliday ? `${month}月${day}日(${dowNames[dow]}・${hol.name})` : `${month}月${day}日(${dowNames[dow]})`;
 targetText.textContent = `${staffName} - ${dateLabel}`;
 }

 const roleCategory = getStaffRoleCategory(staffName);
 const notice = document.getElementById("shiftEditRoleNotice");
 const btnEarly = document.querySelector("#shiftEditButtonsContainer button:nth-child(1)");
 const btnDay = document.querySelector("#shiftEditButtonsContainer button:nth-child(2)");
 const btnLate = document.querySelector("#shiftEditButtonsContainer button:nth-child(3)");
 const btnNight = document.querySelector("#shiftEditButtonsContainer button:nth-child(4)");
 const btnDawn = document.querySelector("#shiftEditButtonsContainer button:nth-child(5)");
 const btnHoliday = document.querySelector("#shiftEditButtonsContainer button:nth-child(6)");

 if (roleCategory !== "care") {
 if (notice) notice.innerHTML = "<span style='color:#0369a1; font-weight:bold;'> 日勤専従の職種（管理者・計画作成担当者・相談員・看護師・事務員）は日勤専従（土日祝・年末年始休み）です。<br>日勤または公休のみ選択可能です。</span>";
 if (btnEarly) { btnEarly.disabled = true; btnEarly.style.opacity = "0.35"; btnEarly.style.pointerEvents = "none"; }
 if (btnLate) { btnLate.disabled = true; btnLate.style.opacity = "0.35"; btnLate.style.pointerEvents = "none"; }
 if (btnNight) { btnNight.disabled = true; btnNight.style.opacity = "0.35"; btnNight.style.pointerEvents = "none"; }
 if (btnDawn) { btnDawn.disabled = true; btnDawn.style.opacity = "0.35"; btnDawn.style.pointerEvents = "none"; }
 if (btnDay) { btnDay.disabled = false; btnDay.style.opacity = "1"; btnDay.style.pointerEvents = "auto"; }
 if (btnHoliday) { btnHoliday.disabled = false; btnHoliday.style.opacity = "1"; btnHoliday.style.pointerEvents = "auto"; }
 } else {
 if (notice) notice.innerHTML = "<span style='color:#4a5852;'> 介護職員（基準: 毎日早出1名・遅出1名・夜勤2名体制）</span>";
 [btnEarly, btnDay, btnLate, btnNight, btnDawn, btnHoliday].forEach(btn => {
 if (btn) { btn.disabled = false; btn.style.opacity = "1"; btn.style.pointerEvents = "auto"; }
 });
 }

 const modal = document.getElementById("shiftEditModal");
 if (modal) modal.style.display = "flex";
}

function applyShiftCellEdit(symbol) {
 if (!gShiftEditingCell) return;
 const { staffName, day, yearMonth } = gShiftEditingCell;
 if (!staffName || !day || !yearMonth) return;

 const roleCategory = getStaffRoleCategory(staffName);

 // 職種制約ガード: 施設長・事務員・看護師は「日」「休」「クリア」以外を厳格に拒絶
 if (roleCategory !== "care" && symbol && symbol !== "日" && symbol !== "休") {
 alert(` 【職種制約ガード】\n${staffName} は日勤専従のため、「日勤」または「公休」のみ設定可能です。\n（夜勤・早番・遅番・明けへの誤変更を防止しました）`);
 return;
 }

 if (!db.data.monthly_shifts) db.data.monthly_shifts = {};
 if (!db.data.monthly_shifts[yearMonth]) db.data.monthly_shifts[yearMonth] = {};
 if (!db.data.monthly_shifts[yearMonth][staffName]) db.data.monthly_shifts[yearMonth][staffName] = {};

 db.data.monthly_shifts[yearMonth][staffName][day] = symbol;
 // [Claude修正] 公休・明けなど勤務でない日に変えたら、その日の応援の区分も外す
 if (!cpIsWorkShift(symbol)) cpClearShiftHelp(yearMonth, staffName, day);

 // 介護職で夜勤に手動変更した場合、翌日が当月内であれば「明」にする連動アシスト
 if (roleCategory === "care" && symbol === "夜") {
 const [yStr, mStr] = yearMonth.split("-");
 const daysInMonth = new Date(parseInt(yStr, 10), parseInt(mStr, 10), 0).getDate();
 if (day + 1 <= daysInMonth) {
 const curNext = db.data.monthly_shifts[yearMonth][staffName][day + 1];
 if (!curNext || curNext === "日" || curNext === "早" || curNext === "遅") {
 db.data.monthly_shifts[yearMonth][staffName][day + 1] = "明";
 cpClearShiftHelp(yearMonth, staffName, day + 1);
 }
 }
 }

 db.save();
 closeModal("shiftEditModal");
 closeShiftPopover();
 renderShiftTable(yearMonth);
 if (typeof renderTodayShiftBar === "function") renderTodayShiftBar();
 if (typeof renderDailyJournal === "function" && gState.activeCareTab === "daily_journal") renderDailyJournal();
}

// 特例配慮設定 (同番NG) モーダル
function openShiftNgModal() {
 const stamps = sortStaffList(db.data.stamps || []);
 const staffList = stamps.map(s => typeof s === "string" ? { name: s, role: "介護職員" } : s);

 const sel1 = document.getElementById("shiftNgStaff1");
 const sel2 = document.getElementById("shiftNgStaff2");

 if (sel1 && sel2) {
 const optionsHtml = staffList.map(s => `<option value="${s.name}">${s.name} (${s.role || '介護職員'})</option>`).join("");
 sel1.innerHTML = optionsHtml;
 sel2.innerHTML = optionsHtml;
 if (staffList.length > 1) {
 sel2.selectedIndex = 1;
 }
 }

 renderShiftNgList();
 const modal = document.getElementById("shiftNgModal");
 if (modal) modal.style.display = "flex";
}

function renderShiftNgList() {
 const container = document.getElementById("shiftNgPairList");
 if (!container) return;

 const pairs = db.data.shift_ng_pairs || [];
 if (pairs.length === 0) {
 container.innerHTML = `<div style="padding:14px; text-align:center; color:#94a19a; font-size:12px;">登録された配慮ペアはありません。</div>`;
 return;
 }

 let html = `<ul style="list-style:none; padding:0; margin:0;">`;
 pairs.forEach(p => {
 html += `
 <li style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; border-bottom:1px solid #eef2ef; font-size:12.5px;">
 <div>
 <strong style="color:#22302b;">${escapeHtml(p.staff1)}</strong> 
 <span style="color:#dc2626; font-weight:bold; margin:0 4px;"></span> 
 <strong style="color:#22302b;">${escapeHtml(p.staff2)}</strong>
 <span style="color:#5f6d66; font-size:11.5px; margin-left:8px;">(${escapeHtml(p.reason || '相性配慮')})</span>
 </div>
 <button class="btn btn-outline" style="padding:2px 8px; font-size:11px; color:#ef4444; border-color:#fca5a5;" onclick="deleteShiftNgPair(${p.id})">削除</button>
 </li>
 `;
 });
 html += `</ul>`;
 container.innerHTML = html;
}

function submitShiftNgPair() {
 const sel1 = document.getElementById("shiftNgStaff1");
 const sel2 = document.getElementById("shiftNgStaff2");
 const reasonInput = document.getElementById("shiftNgReason");

 if (!sel1 || !sel2) return;
 const s1 = sel1.value;
 const s2 = sel2.value;
 const reason = reasonInput ? (reasonInput.value.trim() || "相性配慮 (同日夜勤NG)") : "相性配慮 (同日夜勤NG)";

 if (s1 === s2) {
 alert("異なる職員を選択してください。");
 return;
 }

 if (!Array.isArray(db.data.shift_ng_pairs)) db.data.shift_ng_pairs = [];

 const exists = db.data.shift_ng_pairs.some(p => 
 (p.staff1 === s1 && p.staff2 === s2) || 
 (p.staff1 === s2 && p.staff2 === s1)
 );

 if (exists) {
 alert("このペアは既に登録されています。");
 return;
 }

 db.data.shift_ng_pairs.push({
 id: Date.now(),
 staff1: s1,
 staff2: s2,
 reason: reason
 });

 db.save();
 renderShiftNgList();
 if (reasonInput) reasonInput.value = "";
}

function deleteShiftNgPair(id) {
 if (!confirm("この配慮ルールを削除しますか？")) return;
 db.data.shift_ng_pairs = (db.data.shift_ng_pairs || []).filter(p => p.id !== id);
 db.save();
 renderShiftNgList();
}

// 希望休・事前要望管理機能
function openShiftHopeModal() {
 const ym = getShiftYearMonth();
 const [yearStr, monthStr] = ym.split("-");
 const year = parseInt(yearStr, 10);
 const month = parseInt(monthStr, 10);
 const daysInMonth = new Date(year, month, 0).getDate();

 const allStamps = sortStaffList(db.data.stamps || []);
 const staffList = allStamps.map(s => typeof s === "string" ? { name: s, role: "介護職員" } : s);

 const staffSel = document.getElementById("shiftHopeStaff");
 if (staffSel) {
  staffSel.innerHTML = staffList.map(s => `<option value="${escapeHtml(s.name)}">${escapeHtml(s.name)} (${escapeHtml(s.role || "介護職員")})</option>`).join("");
 }

 const daySel = document.getElementById("shiftHopeDay");
 if (daySel) {
  const dowNames = ["日", "月", "火", "水", "木", "金", "土"];
  let dayOptions = "";
  for (let d = 1; d <= daysInMonth; d++) {
   const dow = new Date(year, month - 1, d).getDay();
   const hol = isHolidayOrYearEnd(year, month, d);
   const label = hol.isHoliday ? `${d}日 (${dowNames[dow]}・祝)` : `${d}日 (${dowNames[dow]})`;
   dayOptions += `<option value="${d}">${label}</option>`;
  }
  daySel.innerHTML = dayOptions;
 }

 renderShiftHopeList();
 const modal = document.getElementById("shiftHopeModal");
 if (modal) modal.style.display = "flex";
}

function renderShiftHopeList() {
 const container = document.getElementById("shiftHopeList");
 const countLabel = document.getElementById("shiftHopeCountLabel");
 if (!container) return;

 const ym = getShiftYearMonth();
 const [yearStr, monthStr] = ym.split("-");
 const year = parseInt(yearStr, 10);
 const month = parseInt(monthStr, 10);
 const dowNames = ["日", "月", "火", "水", "木", "金", "土"];

 if (!Array.isArray(db.data.shift_hope_offs)) db.data.shift_hope_offs = [];
 const hopeOffs = db.data.shift_hope_offs.filter(h => h.year_month === ym);

 if (countLabel) {
  countLabel.textContent = `${year}年${month}月の登録済み希望休一覧 (${hopeOffs.length}件):`;
 }

 if (hopeOffs.length === 0) {
  container.innerHTML = `<div style="padding:16px; text-align:center; color:#94a19a; font-size:12px;">今月の登録済み希望休はありません（各スタッフ月2〜3日程度の希望休を受け付けられます）。</div>`;
  return;
 }

 const sorted = [...hopeOffs].sort((a, b) => {
  if (a.day !== b.day) return a.day - b.day;
  return a.staff_name.localeCompare(b.staff_name);
 });

 let html = `<ul style="list-style:none; padding:0; margin:0;">`;
 sorted.forEach(h => {
  const dow = new Date(year, month - 1, h.day).getDay();
  const hol = isHolidayOrYearEnd(year, month, h.day);
  const dateStr = `${month}月${h.day}日 (${dowNames[dow]}${hol.isHoliday ? "・祝" : ""})`;
  html += `
   <li style="display:flex; justify-content:space-between; align-items:center; padding:9px 12px; border-bottom:1px solid #eef2ef; font-size:12.5px;">
    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
     <span style="display:inline-block; font-weight:bold; color:#b91c1c; background:#fee2e2; border:1px solid #fecaca; border-radius:4px; padding:2px 8px; font-size:11.5px;">
      ${dateStr}
     </span>
     <strong style="color:#22302b;">${escapeHtml(h.staff_name)}</strong>
     <span style="color:#5f6d66; font-size:11.5px;">理由: ${escapeHtml(h.reason || "私用")}</span>
    </div>
    <button class="btn btn-outline" style="padding:2px 8px; font-size:11px; color:#ef4444; border-color:#fca5a5;" onclick="deleteShiftHopeOff(${h.id})">削除</button>
   </li>
  `;
 });
 html += `</ul>`;
 container.innerHTML = html;
}

function submitShiftHopeOff() {
 const staffSel = document.getElementById("shiftHopeStaff");
 const daySel = document.getElementById("shiftHopeDay");
 const reasonInput = document.getElementById("shiftHopeReason");

 if (!staffSel || !daySel) return;
 const staffName = staffSel.value;
 const day = parseInt(daySel.value, 10);
 const reason = reasonInput ? (reasonInput.value.trim() || "希望休申請") : "希望休申請";
 const ym = getShiftYearMonth();

 if (!Array.isArray(db.data.shift_hope_offs)) db.data.shift_hope_offs = [];

 const exists = db.data.shift_hope_offs.some(h => 
  h.year_month === ym && h.staff_name === staffName && parseInt(h.day, 10) === day
 );

 if (exists) {
  alert(`${staffName} さんの ${day}日はすでに希望休に登録されています。`);
  return;
 }

 const newHope = {
  id: Date.now(),
  year_month: ym,
  staff_name: staffName,
  day: day,
  reason: reason,
  created_at: new Date().toISOString()
 };

 db.data.shift_hope_offs.push(newHope);

 if (db.data.monthly_shifts && db.data.monthly_shifts[ym] && db.data.monthly_shifts[ym][staffName]) {
  db.data.monthly_shifts[ym][staffName][day] = "休";
 }

 db.save();
 if (reasonInput) reasonInput.value = "";
 renderShiftHopeList();
 renderShiftTable(ym);
 if (typeof renderTodayShiftBar === "function") renderTodayShiftBar();
}

function deleteShiftHopeOff(id) {
 if (!confirm("この希望休設定を削除しますか？")) return;
 const ym = getShiftYearMonth();
 db.data.shift_hope_offs = (db.data.shift_hope_offs || []).filter(h => h.id !== id);
 db.save();
 renderShiftHopeList();
 renderShiftTable(ym);
 if (typeof renderTodayShiftBar === "function") renderTodayShiftBar();
}

function toggleShiftHopeOff(staffName, day) {
 const ym = getShiftYearMonth();
 if (!Array.isArray(db.data.shift_hope_offs)) db.data.shift_hope_offs = [];

 const existingIdx = db.data.shift_hope_offs.findIndex(h => 
  h.year_month === ym && h.staff_name === staffName && parseInt(h.day, 10) === day
 );

 if (existingIdx >= 0) {
  db.data.shift_hope_offs.splice(existingIdx, 1);
 } else {
  db.data.shift_hope_offs.push({
   id: Date.now(),
   year_month: ym,
   staff_name: staffName,
   day: day,
   reason: "希望休申請",
   created_at: new Date().toISOString()
  });
  if (db.data.monthly_shifts && db.data.monthly_shifts[ym] && db.data.monthly_shifts[ym][staffName]) {
   db.data.monthly_shifts[ym][staffName][day] = "休";
  }
 }

 db.save();
 closeShiftPopover();
 renderShiftTable(ym);
 if (typeof renderTodayShiftBar === "function") renderTodayShiftBar();
}

function applyHopeOffsAndRegenerate() {
 const ym = getShiftYearMonth();
 const [y, m] = ym.split("-");
 const hopeCount = (db.data.shift_hope_offs || []).filter(h => h.year_month === ym).length;
 if (!confirm(`${y}年${parseInt(m, 10)}月の希望休（全${hopeCount}件）を反映して、勤務表シフトを再生成しますか？`)) {
  return;
 }
 generateMonthlyShiftData(ym);
 renderShiftTable(ym);
 renderShiftHopeList();
 alert(`${y}年${parseInt(m, 10)}月の希望休（全${hopeCount}件）を全て優先公休「休」として反映し、勤務表シフトを再生成しました！`);
}

// 勤務体制（月間シフト表・職種・希望休と完全自動連動）
function getDailyShiftRoster(targetDateStr) {
 const today = new Date();
 const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
 const targetDate = targetDateStr || gState.selectedDate || todayStr;
 const [yStr, mStr, dStr] = targetDate.split("-");
 const ym = `${yStr}-${mStr}`;
 const day = parseInt(dStr, 10);

 if (!db.data.monthly_shifts) db.data.monthly_shifts = {};
 if (!db.data.monthly_shifts[ym] || Object.keys(db.data.monthly_shifts[ym]).length === 0) {
  generateMonthlyShiftData(ym);
 }
 const monthShifts = db.data.monthly_shifts[ym] || {};

 const allStamps = sortStaffList(db.data.stamps || []);

 const roster = {
  dateStr: targetDate,
  year: parseInt(yStr, 10),
  month: parseInt(mStr, 10),
  day: day,
  isToday: (targetDate === todayStr),
  director: [],
  planner: [],
  nurse: [],
  office: [],
  early: [],
  dayCare: [],
  late: [],
  night: [],
  dawn: [],
  off: [],
  hopeOffs: []
 };

 const todayHopes = (db.data.shift_hope_offs || []).filter(h => h.year_month === ym && parseInt(h.day, 10) === day);
 roster.hopeOffs = todayHopes;

 allStamps.forEach(s => {
  const name = typeof s === "string" ? s : s.name;
  const role = typeof s === "string" ? "介護職員" : (s.role || "職員");
  const cat = getStaffRoleCategory(name);
  const shift = monthShifts[name] ? monthShifts[name][day] : "";
  const shortName = name.split(" ")[0] || name;
  const isLeader = role.includes("リーダー");
  const isHope = todayHopes.some(h => h.staff_name === name);
  const hopeReason = (todayHopes.find(h => h.staff_name === name) || {}).reason || "";

  const staffInfo = {
   name,
   shortName,
   displayName: isLeader ? `${shortName}(L)` : shortName,
   role,
   category: cat,
   shift,
   isLeader,
   isHope,
   hopeReason
  };

  if (cat === "director") {
   roster.director.push(staffInfo);
  } else if (cat === "caremanager" || cat === "counselor") {
   if (shift === "日") roster.planner.push(staffInfo);
  } else if (cat === "nurse") {
   if (shift === "日") {
    roster.nurse.push(staffInfo);
   }
  } else if (cat === "office" || cat === "parttime") {
   if (shift === "日") {
    roster.office.push(staffInfo);
   }
  } else if (cat === "care") {
   if (shift === "早") roster.early.push(staffInfo);
   else if (shift === "日") roster.dayCare.push(staffInfo);
   else if (shift === "遅") roster.late.push(staffInfo);
   else if (shift === "夜") roster.night.push(staffInfo);
   else if (shift === "明") roster.dawn.push(staffInfo);
   else if (shift === "休") roster.off.push(staffInfo);
  }
 });

 return roster;
}

function renderTodayShiftBar(targetDateStr) {
 const bar = document.getElementById("todayShiftBar");
 if (!bar) return;

 const roster = getDailyShiftRoster(targetDateStr);

 // 管理者テキスト
 let directorText = "-"; // [Claude修正] 管理者がいないときに架空の「木村」と出していた
 if (roster.director.length > 0) {
  const dir = roster.director[0];
  directorText = dir.shift === "休" ? `${dir.shortName}(公休)` : dir.shortName;
 }

 // 看護師テキスト
 const nurseNames = roster.nurse.map(n => n.shortName);
 const nurseText = nurseNames.length > 0 ? nurseNames.join("・") : "(オンコール)";

 // 事務テキスト
 const officeNames = roster.office.map(o => o.shortName);
 const officeText = officeNames.length > 0 ? officeNames.join("・") : "(公休)";

 // 介護フロア体制テキスト
 const formatStaffList = list => list.length > 0 ? list.map(s => s.displayName).join("・") : "-";

 const earlyText = formatStaffList(roster.early);
 const dayCareText = formatStaffList(roster.dayCare);
 const lateText = formatStaffList(roster.late);
 const nightText = formatStaffList(roster.night);
 const dawnText = formatStaffList(roster.dawn);

 // 希望休の言及
 let hopeOffBadge = "";
 if (roster.hopeOffs.length > 0) {
  const hopeNames = roster.hopeOffs.map(h => (h.staff_name.split(" ")[0] || h.staff_name)).join("・");
  hopeOffBadge = `<span class="shift-hope" title="希望休取得: ${roster.hopeOffs.map(h => h.staff_name + '(' + (h.reason || '申請') + ')').join(', ')}">希望休: ${hopeNames}</span>`;
 }

 const dateLabel = roster.isToday ? `今日 ${roster.month}/${roster.day}` : `${roster.month}/${roster.day}（選択した日）`;
 // [Claude修正] 見た目を作り直し（色は style.css の .shift-chip-*）。スマホでは1行で横にスクロール。
 // 「勤務表を開く」が switchOfficeTab('shifts') になっていて何も開かなかった → 'shift'
 const chip = (cls, label, text) => `<span class="shift-item"><span class="shift-chip shift-chip-${cls}">${label}</span>${escapeHtml(text)}</span>`;
 bar.innerHTML = `
  <span class="shift-bar-title">${escapeHtml(dateLabel)}の勤務</span><!-- [Claude修正 2026-10-16] 押すと事務ポータルの勤務表へ移り、元の画面に戻れなかったため、ただの見出しにした（変更は勤務表から） -->
  <div class="shift-bar-list">
   <span class="shift-item"><span class="shift-role">管理者</span>${escapeHtml(directorText)}</span>
   ${roster.planner.length ? `<span class="shift-item"><span class="shift-role">計画・相談</span>${escapeHtml(roster.planner.map(p => p.shortName).join("・"))}</span>` : ""}
   <span class="shift-item"><span class="shift-role">看護</span>${escapeHtml(nurseText)}</span>
   <span class="shift-item"><span class="shift-role">事務</span>${escapeHtml(officeText)}</span>
   ${chip("early", "早出", earlyText)}
   ${chip("day", "日勤", dayCareText)}
   ${chip("late", "遅出", lateText)}
   ${chip("night", "夜勤", nightText)}
   ${chip("dawn", "明け", dawnText)}
   ${hopeOffBadge}
  </div>
 `;
}

// 自動バックアップ稼働状況・手動保存機能
function openBackupStatusModal() {
 const modal = document.getElementById("backupStatusModal");
 if (!modal) return;

 const timeEl = document.getElementById("backupModalLastTime");
 const resEl = document.getElementById("backupModalResidentCount");
 const recEl = document.getElementById("backupModalRecordCount");
 const noticeEl = document.getElementById("backupManualNotice");

 if (timeEl) {
  const badge = document.getElementById("backupStatusBadge");
  const badgeText = badge ? badge.textContent : "";
  const match = badgeText.match(/\(([^)]+)\)/);
  timeEl.textContent = match ? match[1] : (new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
 }
 if (resEl) {
  const resCount = (gState.residents || []).length;
  resEl.textContent = `${resCount}名`;
 }
 if (recEl) {
  const recCount = (db.data.care_records || []).length;
  recEl.textContent = `${recCount}件`;
 }
 const tblEl = document.getElementById("backupModalTableCount");
 if (tblEl) tblEl.textContent = `${Object.keys(db.data || {}).filter(k => Array.isArray(db.data[k])).length}種類`; // [Claude修正] 固定の「34テーブル」ではなく実際の数
 if (noticeEl) {
  noticeEl.textContent = "";
 }

 if (typeof loadExternalBackupStatus === "function") {
  loadExternalBackupStatus();
 }

 modal.style.display = "flex";
}

function triggerManualBackup() {
 if (typeof db !== "undefined" && db.saveToServer) {
  db.saveToServer();
  const noticeEl = document.getElementById("backupManualNotice");
  if (noticeEl) {
   const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
   noticeEl.textContent = `親機PCおよび世代保管庫 (data/backup/) に最新データを保管しました (${now})`;
  }
 }
}

function downloadBackupJson() {
 if (typeof db === "undefined" || !db.data) return;
 try {
  const jsonStr = JSON.stringify(db.data, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  a.href = url;
  a.download = `care_portal_backup_${y}${m}${d}_${hh}${mm}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  const noticeEl = document.getElementById("backupManualNotice");
  if (noticeEl) {
   noticeEl.textContent = "この端末へのバックアップJSONダウンロードが完了しました。";
  }
 } catch (e) {
  alert("バックアップファイルの生成に失敗しました: " + e.message);
 }
}

// 職員暗証番号初期化・整合性確保
function ensureStaffPinData() {
 if (!gState.stamps || !Array.isArray(gState.stamps)) return;
 let modified = false;
 gState.stamps.forEach(s => {
 if (typeof s === "object" && s !== null) {
 if (!s.pin && !(db && db.isServerMode)) {
 s.pin = "0000";
 modified = true;
 }
 if (typeof s.is_initial_pin === "undefined") {
 s.is_initial_pin = (s.pin === "0000");
 modified = true;
 }
 }
 });
 if (modified && typeof db !== "undefined" && db.data) {
 db.data.stamps = gState.stamps;
 }
}

// 職員セレクト変更トリガー (4桁PIN認証へ誘導)
let gAuthTargetStaff = "";
let gEnteredPin = "";

function onStaffSelectChange(sel) {
 const targetStaff = sel.value;
 if (!targetStaff) return;
 const currentStaff = gState.currentStaff || "";
 if (targetStaff === currentStaff) return;

 // 認証完了までセレクト表示を元の職員に戻す
 if (currentStaff) {
 sel.value = currentStaff;
 }
 openStaffPinAuthModal(targetStaff);
}

function openStaffPinAuthModal(targetStaff) {
 gAuthTargetStaff = targetStaff;
 gEnteredPin = "";
 const modal = document.getElementById("staffPinAuthModal");
 if (!modal) return;

 const title = document.getElementById("staffPinAuthTitle");
 if (title) title.textContent = `職員認証: 【${targetStaff}】`;
 const desc = document.getElementById("staffPinAuthDesc");
 if (desc) desc.textContent = "暗証番号（数字4桁）を入力してください (初期値: 0000)";
 const err = document.getElementById("staffPinError");
 if (err) err.textContent = "";

 updatePinDots();
 renderRandomKeypad();
 modal.style.display = "flex";
}

// ランダム配置テンキー (毎回0〜9の数字位置をシャッフル)
function renderRandomKeypad() {
 const container = document.getElementById("staffPinKeypad");
 if (!container) return;
 container.innerHTML = "";

 const nums = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
 for (let i = nums.length - 1; i > 0; i--) {
 const j = Math.floor(Math.random() * (i + 1));
 [nums[i], nums[j]] = [nums[j], nums[i]];
 }

 nums.forEach(n => {
 const btn = document.createElement("button");
 btn.type = "button";
 btn.className = "btn btn-outline pin-key-btn";
 btn.style.cssText = "font-size:18px; font-weight:bold; padding:12px 0; background:#f6f8f6; border:1px solid #cdd6d0; border-radius:8px; cursor:pointer;";
 btn.textContent = String(n);
 btn.onclick = () => onPinKeyPress(String(n));
 container.appendChild(btn);
 });
}

function onPinKeyPress(digit) {
 if (gEnteredPin.length >= 4) return;
 gEnteredPin += digit;
 updatePinDots();
 if (gEnteredPin.length === 4) {
 setTimeout(verifyStaffPin, 100);
 }
}

function backspaceStaffPin() {
 if (gEnteredPin.length > 0) {
 gEnteredPin = gEnteredPin.slice(0, -1);
 updatePinDots();
 }
}

function cancelStaffPinAuth() {
 closeModal("staffPinAuthModal");
 const sel = document.getElementById("currentStaff");
 if (sel && gState.currentStaff) {
 sel.value = gState.currentStaff;
 }
 gEnteredPin = "";
}

function updatePinDots() {
 for (let i = 0; i < 4; i++) {
 const dot = document.getElementById(`pinDot${i}`);
 if (dot) {
 if (i < gEnteredPin.length) {
 dot.style.background = "#1e5b47";
 dot.style.borderColor = "#1a4f3d";
 } else {
 dot.style.background = "#ffffff";
 dot.style.borderColor = "#94a19a";
 }
 }
 }
}

async function verifyStaffPin() {
 if (db && db.isServerMode) {
 const r = await cpPostJson('/api/verify-pin', { name: gAuthTargetStaff, pin: gEnteredPin });
 if (r.ok) {
 gState.currentStaff = gAuthTargetStaff;
 const sel = document.getElementById("currentStaff");
 if (sel) sel.value = gAuthTargetStaff;
 closeModal("staffPinAuthModal");
 onCurrentStaffChange();
 gEnteredPin = "";
 } else {
 const err = document.getElementById("staffPinError");
 if (err) err.textContent = r.status === 423 ? "失敗が続いたため5分間ロック中です" : (r.info && r.info.error === "suspended") ? "このアカウントはロック（休止中）されています" : "暗証番号が一致しません";
 gEnteredPin = "";
 updatePinDots();
 renderRandomKeypad();
 }
 return;
 }
 const staffObj = (gState.stamps || []).find(s => (s.name || s) === gAuthTargetStaff);
 const correctPin = staffObj && staffObj.pin ? staffObj.pin : "0000";
 if (gEnteredPin === correctPin) {
 gState.currentStaff = gAuthTargetStaff;
 const sel = document.getElementById("currentStaff");
 if (sel) sel.value = gAuthTargetStaff;
 closeModal("staffPinAuthModal");
 onCurrentStaffChange();
 gEnteredPin = "";
 } else {
 const err = document.getElementById("staffPinError");
 if (err) err.textContent = "暗証番号が一致しません (初期値: 0000)";
 gEnteredPin = "";
 updatePinDots();
 renderRandomKeypad();
 }
}

// 職員自己暗証番号変更 (初回設定用)
function openInitialPinModal() {
 const currentStaff = gState.currentStaff || (document.getElementById("currentStaff")?.value) || "";
 const modal = document.getElementById("initialPinModal");
 if (!modal) return;
 const nameInput = document.getElementById("initialPinStaffName");
 if (nameInput) nameInput.value = currentStaff;
 const curInput = document.getElementById("initialPinCurrent");
 if (curInput) curInput.value = "";
 const newInput = document.getElementById("initialPinNew");
 if (newInput) newInput.value = "";
 const confInput = document.getElementById("initialPinConfirm");
 if (confInput) confInput.value = "";
 modal.style.display = "flex";
}

function submitInitialPinModal() {
 const staffName = document.getElementById("initialPinStaffName")?.value || "";
 const curPin = (document.getElementById("initialPinCurrent")?.value || "").trim();
 const newPin = (document.getElementById("initialPinNew")?.value || "").trim();
 const confPin = (document.getElementById("initialPinConfirm")?.value || "").trim();

 const staffObj = (gState.stamps || []).find(s => (s.name || s) === staffName);
 if (!staffObj) {
 alert("職員が見つかりません。");
 return;
 }
 if (db && db.isServerMode) {
 if (!/^\d{4}$/.test(newPin)) { alert("新しい暗証番号は数字4桁で入力してください。"); return; }
 if (newPin !== confPin) { alert("新しい暗証番号と確認入力が一致しません。"); return; }
 cpPostJson('/api/pin-change', { name: staffName, current: curPin, new_pin: newPin }).then(r => {
 if (r.status === 423) { alert("失敗が続いたため、5分間ロックしています。"); return; }
 if (r.info && r.info.error === "not_self") { alert("暗証番号は本人がログインしている時だけ変更できます。"); return; }
 if (!r.ok) { alert("現在の暗証番号が一致しません。"); return; }
 staffObj.is_initial_pin = false;
 closeModal("initialPinModal");
 updateStaffRoleUI();
 checkGlobalAlerts();
 alert(`【${staffName}】の暗証番号を更新しました。次回から新しい暗証番号をご使用ください。`);
 });
 return;
 }
 const realCurrent = staffObj.pin || "0000";
 if (curPin !== realCurrent) {
 alert("現在の暗証番号が一致しません。");
 return;
 }
 if (!/^\d{4}$/.test(newPin)) {
 alert("新しい暗証番号は数字4桁で入力してください。");
 return;
 }
 if (newPin !== confPin) {
 alert("新しい暗証番号と確認入力が一致しません。");
 return;
 }

 staffObj.pin = newPin;
 staffObj.is_initial_pin = false;
 if (typeof db !== "undefined" && db.data) {
 db.data.stamps = gState.stamps;
 db.save();
 }
 closeModal("initialPinModal");
 updateStaffRoleUI();
 checkGlobalAlerts();
 alert(`【${staffName}】の暗証番号を更新しました。次回から新しい暗証番号をご使用ください。`);
}

// 事務所ポータル：データ保管・バックアップ表示
function renderOfficeBackup() {
 const notice = document.getElementById("officeBackupNotice");
 if (notice) notice.textContent = "";
 if (typeof loadExternalBackupStatus === "function") {
  loadExternalBackupStatus();
 }
}

// [Claude修正] サーバーの返す記号（forbidden_role など）を、職員に分かる言葉にする
function cpExtBackupErrorText(result) {
  const code = result && result.error;
  if (result && result.message) return result.message;
  if (code === "forbidden_role") return "外部バックアップの設定・実行は、管理者・事務の職員だけができます。";
  if (code === "unauthorized") return "ログインの有効期限が切れています。ログインし直してください。";
  if (code === "bad_request") return "送った内容を読み取れませんでした。画面を開き直してください。";
  if (code === "no_data") return "データを読み込めませんでした。";
  if (code === "save_failed") return "設定を保存できませんでした。";
  return code || "エラー";
}

// [Antigravity追加] 外部への自動二重バックアップ
async function loadExternalBackupStatus() {
  // [Claude修正] 単体起動（サーバーなし）では外部バックアップの状態は取れないので、問い合わせない
  if (!db || !db.isServerMode) {
    const bc = document.getElementById("extBackupStatusBadgeContainer");
    if (bc) bc.textContent = "単体起動のときは使えません（サーバーで起動したときに使えます）";
    return;
  }
  try {
    const res = await cpApiFetch("/api/external-backup-status");
    if (!res.ok) return;
    const data = await res.json();

    const pathInput = document.getElementById("extBackupDestPath");
    const retInput = document.getElementById("extBackupRetention");
    const lastSuccEl = document.getElementById("extBackupLastSuccess");
    const lastAttEl = document.getElementById("extBackupLastAttempt");
    const badgeContainer = document.getElementById("extBackupStatusBadgeContainer");
    const errInfo = document.getElementById("extBackupErrorInfo");
    const errTime = document.getElementById("extBackupErrorTime");
    const errReason = document.getElementById("extBackupErrorReason");

    if (pathInput && document.activeElement !== pathInput) {
      pathInput.value = data.destination_path || "";
    }
    if (retInput && document.activeElement !== retInput) {
      retInput.value = data.max_generations || 30;
    }
    if (lastSuccEl) {
      lastSuccEl.textContent = data.last_success_at || "未実行";
      lastSuccEl.style.color = data.last_success_at ? "var(--pine)" : "var(--ink-3)";
    }
    if (lastAttEl) {
      lastAttEl.textContent = data.last_attempt_at || "-";
    }

    if (errInfo) {
      if (data.last_status === "failed") {
        errInfo.style.display = "block";
        if (errTime) errTime.textContent = data.last_attempt_at || "-";
        if (errReason) errReason.textContent = data.last_error || "外部共有フォルダへの保存に失敗しました";
      } else {
        errInfo.style.display = "none";
      }
    }

    if (badgeContainer) {
      if (data.last_status === "failed") {
        badgeContainer.innerHTML = `<span class="badge" style="background:var(--alert-tint); color:var(--alert); border:1px solid var(--alert); padding:4px 10px; font-size:12px; font-weight:bold;">外部保存 失敗</span>`;
      } else if (data.last_status === "success" && data.last_success_at) {
        badgeContainer.innerHTML = `<span class="badge" style="background:var(--pine-tint); color:var(--pine); border:1px solid var(--pine); padding:4px 10px; font-size:12px; font-weight:bold;">外部二重保管 稼働中</span>`;
      } else if (data.destination_path) {
        badgeContainer.innerHTML = `<span class="badge" style="background:var(--caution-tint); color:var(--caution); border:1px solid var(--sun); padding:4px 10px; font-size:12px; font-weight:bold;">外部保存 設定済 (未実行)</span>`;
      } else {
        badgeContainer.innerHTML = `<span class="badge" style="background:var(--ground); color:var(--ink-3); border:1px solid var(--line); padding:4px 10px; font-size:12px;">外部保存 未設定</span>`;
      }
    }

    // モーダル内の情報更新
    const modalExtStat = document.getElementById("backupModalExtStatus");
    const modalExtSucc = document.getElementById("backupModalExtSuccess");
    const modalExtErrRow = document.getElementById("backupModalExtErrRow");
    const modalExtErrTime = document.getElementById("backupModalExtErrTime");
    const modalExtErrMsg = document.getElementById("backupModalExtErrMsg");

    if (modalExtStat) {
      if (data.last_status === "failed") {
        modalExtStat.textContent = "保存失敗 (エラー)";
        modalExtStat.style.color = "var(--alert)";
      } else if (data.last_status === "success") {
        modalExtStat.textContent = "正常稼働中";
        modalExtStat.style.color = "var(--pine)";
      } else if (data.destination_path) {
        modalExtStat.textContent = "設定済み (未実行)";
        modalExtStat.style.color = "var(--caution)";
      } else {
        modalExtStat.textContent = "未設定";
        modalExtStat.style.color = "var(--ink-3)";
      }
    }
    if (modalExtSucc) {
      modalExtSucc.textContent = data.last_success_at || "未実行";
    }
    if (modalExtErrRow) {
      if (data.last_status === "failed") {
        modalExtErrRow.style.display = "block";
        if (modalExtErrTime) modalExtErrTime.textContent = data.last_attempt_at || "-";
        if (modalExtErrMsg) modalExtErrMsg.textContent = data.last_error || "エラー";
      } else {
        modalExtErrRow.style.display = "none";
      }
    }
  } catch (e) {
    console.error("loadExternalBackupStatus error", e);
  }
}

async function saveExternalBackupConfig() {
  const pathEl = document.getElementById("extBackupDestPath");
  const retEl = document.getElementById("extBackupRetention");
  const noticeEl = document.getElementById("extBackupSaveNotice");
  if (!pathEl || !retEl) return;

  const destPath = pathEl.value.trim();
  const maxGen = parseInt(retEl.value, 10) || 30;

  if (noticeEl) {
    noticeEl.style.color = "var(--ink-2)";
    noticeEl.textContent = "設定を保存中...";
  }

  try {
    const res = await cpApiFetch("/api/external-backup-config", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        destination_path: destPath,
        max_generations: maxGen
      })
    });
    const result = await res.json();
    if (res.ok && result.success) {
      if (noticeEl) {
        noticeEl.style.color = "var(--pine)";
        noticeEl.textContent = "外部バックアップ設定を保存しました。";
        setTimeout(() => { if (noticeEl) noticeEl.textContent = ""; }, 4000);
      }
      await loadExternalBackupStatus();
    } else {
      if (noticeEl) {
        noticeEl.style.color = "var(--alert)";
        noticeEl.textContent = "保存できませんでした: " + cpExtBackupErrorText(result);
      }
    }
  } catch (e) {
    if (noticeEl) {
      noticeEl.style.color = "var(--alert)";
      noticeEl.textContent = "通信エラー: " + e.message;
    }
  }
}

async function runManualExternalBackup() {
  const noticeEl = document.getElementById("extBackupRunNotice");
  const modalNoticeEl = document.getElementById("backupManualNotice");
  const btn = document.getElementById("btnRunExtBackup");

  const setNotice = (msg, isErr) => {
    if (noticeEl) {
      noticeEl.style.color = isErr ? "var(--alert)" : "var(--pine)";
      noticeEl.textContent = msg;
    }
    if (modalNoticeEl) {
      modalNoticeEl.style.color = isErr ? "var(--alert)" : "var(--pine)";
      modalNoticeEl.textContent = msg;
    }
  };

  setNotice("外部共有フォルダへバックアップ中... (全データと写真をコピーしています)", false);
  if (btn) btn.disabled = true;

  try {
    const res = await cpApiFetch("/api/external-backup-run", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: "{}"
    });
    const result = await res.json();
    if (res.ok && result.success) {
      setNotice(`外部バックアップに成功しました（保管フォルダ: ${result.backup_dir}、合計 ${result.files_count} ファイル）`, false);
      await loadExternalBackupStatus();
    } else {
      setNotice(`外部バックアップに失敗しました: ${cpExtBackupErrorText(result)}`, true);
      await loadExternalBackupStatus();
    }
  } catch (e) {
    setNotice("通信エラー: " + e.message, true);
  } finally {
    if (btn) btn.disabled = false;
  }
}

// 事務所ポータル：職員アカウント・暗証番号管理

function renderOfficeStaffAuth() {
  if (typeof renderStaffQualificationsTable === "function") renderStaffQualificationsTable();
  const tbody = document.querySelector("#staffAuthTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const stamps = sortStaffList(gState.stamps || []);
  stamps.forEach(s => {
    const isInit = cpIsInitialPin(s);
    const isSuspended = s.status === "休止中";
    const tr = document.createElement("tr");

    const statusBadge = isSuspended
      ? `<span class="badge" style="background:#fee2e2; color:#991b1b; border:1px solid #fca5a5; padding:3px 8px; font-size:12px;">休止中 (ロック)</span>`
      : `<span class="badge" style="background:#dcfce7; color:#166534; border:1px solid #bbf7d0; padding:3px 8px; font-size:12px;">正常 (利用可能)</span>`;

    const pinBadge = isInit
      ? `<span class="badge" style="background:#fef3c7; color:#92400e; border:1px solid #fde68a; padding:3px 8px; font-size:12px;">初期値(0000)</span>`
      : `<span class="badge" style="background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd; padding:3px 8px; font-size:12px;">設定変更済み</span>`;

    const lockBtnLabel = isSuspended ? "ロック解除 (正常へ)" : "ロック (休止中へ)";
    const lockBtnStyle = isSuspended
      ? "background:#dcfce7; color:#166534; border-color:#86efac;"
      : "background:#fee2e2; color:#991b1b; border-color:#fca5a5;";

    tr.innerHTML = `
      <td><strong>${escapeHtml(s.name)}</strong></td>
      <td><span style="font-size:12px; color:#4a5852;">${escapeHtml(s.role || "職員")}</span></td>
      <td>${statusBadge}</td>
      <td>${pinBadge}</td>
      <td>
        <div style="display:inline-flex; gap:6px; flex-wrap:wrap;">
          <button type="button" class="btn btn-secondary" style="font-size:11.5px; padding:3px 8px; ${lockBtnStyle}" onclick="toggleStaffAccountStatus('${escapeHtml(s.name)}')">${lockBtnLabel}</button>
          <button type="button" class="btn btn-secondary" style="font-size:11.5px; padding:3px 8px; background:#f6f8f6;" onclick="openResetStaffPinModal('${escapeHtml(s.name)}')">暗証番号を初期化</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  const currentStaff = (document.getElementById("currentStaff")?.value) || gState.currentStaff || "管理者";
  const app1Disp = document.getElementById("staffAuthApprover1NameDisplay");
  if (app1Disp) app1Disp.textContent = currentStaff;

  const app2Sel = document.getElementById("staffAuthApprover2Select");
  if (app2Sel) {
    app2Sel.innerHTML = "";
    const adminClerks = (gState.stamps || []).filter(st => {
      const r = st.role || "";
      const isAC = r.includes("管理者") || r.includes("施設長") || r.includes("事務");
      return isAC && st.name !== currentStaff;
    });

    const candidates = adminClerks.length > 0 ? adminClerks : (gState.stamps || []).filter(st => st.name !== currentStaff);
    candidates.forEach(st => {
      const opt = document.createElement("option");
      opt.value = st.name;
      opt.textContent = `${st.name} (${st.role || '職員'})`;
      app2Sel.appendChild(opt);
    });
  }
}

function toggleStaffAccountStatus(staffName) {
  const s = (gState.stamps || []).find(x => (x.name || x) === staffName);
  if (!s) return;
  const newStatus = s.status === "休止中" ? "正常" : "休止中";
  // [Claude修正] 操作中の本人をロックすると、その場で使えなくなるため止める
  const me = (document.getElementById("currentStaff")?.value) || gState.currentStaff || "";
  if (newStatus === "休止中" && staffName === me) { alert("ご自身のアカウントはロックできません。別の管理者・事務員が操作してください。"); return; }
  if (!confirm(`【${staffName}】様のアカウントを「${newStatus}」にしますか？` + (newStatus === "休止中" ? "\nロック中はログインと職員切り替えができなくなります。" : ""))) return;
  s.status = newStatus;
  db.data.stamps = gState.stamps;
  db.save();
  renderOfficeStaffAuth();
  if (typeof updateStaffRoleUI === "function") updateStaffRoleUI();
  alert(`【アカウント状態変更】\n【${staffName}】様のアカウント状態を「${newStatus}」に変更しました。`);
}

function openResetStaffPinModal(staffName) {
  const s = (gState.stamps || []).find(x => (x.name || x) === staffName);
  if (!s) return;
  document.getElementById("resetTargetStaffHidden").value = staffName;
  document.getElementById("resetTargetStaffDisplay").textContent = `${s.name} (${s.role || '職員'})`;
  document.getElementById("staffAuthApprover1Pin").value = "";
  document.getElementById("staffAuthApprover2Pin").value = "";
  
  renderOfficeStaffAuth();
  openModal("resetStaffPinModal");
}

function submitTwoPersonReset() {
  const targetName = document.getElementById("resetTargetStaffHidden")?.value;
  if (!targetName) {
    alert("初期化対象の職員が選択されていません。");
    return;
  }

  const currentStaff = (document.getElementById("currentStaff")?.value) || gState.currentStaff || "";
  const app1Pin = document.getElementById("staffAuthApprover1Pin")?.value || "";
  const app2Name = document.getElementById("staffAuthApprover2Select")?.value || "";
  const app2Pin = document.getElementById("staffAuthApprover2Pin")?.value || "";

  if (!app1Pin || app1Pin.length !== 4) {
    alert("操作者の暗証番号(4桁)を入力してください。");
    return;
  }
  if (!app2Name) {
    alert("立ち会い承認者を選択してください。");
    return;
  }
  if (!app2Pin || app2Pin.length !== 4) {
    alert("立ち会い承認者の暗証番号(4桁)を入力してください。");
    return;
  }

  // [Claude修正] サーバー稼働時は暗証番号を端末に持たないため、照合と初期化はサーバーで行う
  // (端末で照合すると、暗証番号を変更済みの職員は一致せず、初期化もサーバーに反映されなかった)
  if (db && db.isServerMode) {
    if (currentStaff === app2Name) { alert("操作者と立ち会い承認者は別の2名にしてください。"); return; }
    if (!confirm(`【2名承認の確認】\n操作者: ${currentStaff}\n立ち会い承認者: ${app2Name}\n\n対象職員「${targetName}」の暗証番号を「0000」にリセットしますか？`)) return;
    cpPostJson('/api/pin-reset', { target: targetName, approver1: currentStaff, approver1_pin: app1Pin, approver2: app2Name, approver2_pin: app2Pin }).then(r => {
      if (r.status === 423) { alert("失敗が続いたため、5分間ロックしています。"); return; }
      if (r.info && r.info.error === "pin_mismatch_2") { alert("立ち会い承認者（承認者2）の暗証番号が正しくありません。"); return; }
      if (r.info && r.info.error === "pin_mismatch") { alert("操作者（承認者1）の暗証番号が正しくありません。"); return; }
      if (!r.ok) { alert("承認者の役職（管理者・事務員）または入力内容が正しくありません。初期化は行っていません。"); return; }
      const t = (gState.stamps || []).find(s => (s.name || s) === targetName);
      if (t) t.is_initial_pin = true;
      closeModal("resetStaffPinModal");
      renderOfficeStaffAuth();
      if (typeof updateStaffRoleUI === "function") updateStaffRoleUI();
      if (typeof checkGlobalAlerts === "function") checkGlobalAlerts();
      alert(`【2名承認リセット完了】\n【${targetName}】様の暗証番号を「0000」に初期化しました。`);
    });
    return;
  }

  const app1Obj = (gState.stamps || []).find(s => (s.name || s) === currentStaff);
  const realApp1Pin = app1Obj ? (app1Obj.pin || "0000") : "0000";
  if (app1Pin !== realApp1Pin) {
    alert("操作者（承認者1）の暗証番号が正しくありません。");
    return;
  }

  const app2Obj = (gState.stamps || []).find(s => (s.name || s) === app2Name);
  const realApp2Pin = app2Obj ? (app2Obj.pin || "0000") : "0000";
  if (app2Pin !== realApp2Pin) {
    alert("立ち会い承認者（承認者2）の暗証番号が正しくありません。");
    return;
  }

  if (!confirm(`【2名承認の確認】\n操作者: ${currentStaff}\n立ち会い承認者: ${app2Name}\n\n対象職員「${targetName}」の暗証番号を「0000」にリセットしますか？`)) {
    return;
  }

  const targetObj = (gState.stamps || []).find(s => (s.name || s) === targetName);
  if (targetObj) {
    targetObj.pin = "0000";
    targetObj.is_initial_pin = true;
    db.data.stamps = gState.stamps;
    db.save();
  }

  closeModal("resetStaffPinModal");
  renderOfficeStaffAuth();
  if (typeof updateStaffRoleUI === "function") updateStaffRoleUI();
  if (typeof checkGlobalAlerts === "function") checkGlobalAlerts();

  alert(`【2名承認リセット完了】\n【${targetName}】様の暗証番号を「0000」に初期化しました。\n対象職員本人が次回ログイン時に新しい暗証番号を設定できるようになりました。`);
}


function resetStaffPin(staffName) {
 if (db && db.isServerMode) {
 alert("暗証番号の初期化は、2名承認の画面から行ってください。");
 return;
 }
 const targetObj = (gState.stamps || []).find(s => (s.name || s) === staffName);
 if (!targetObj) return;
 targetObj.pin = "0000";
 targetObj.is_initial_pin = true;
 if (typeof db !== "undefined" && db.data) {
 db.data.stamps = gState.stamps;
 db.save();
 }
 renderOfficeStaffAuth();
 updateStaffRoleUI();
 checkGlobalAlerts();
}

// グローバル関数公開 (インラインonclick等の即時呼出保証)
if (typeof window !== "undefined") {
 window.openClinicInstructionModal = openClinicInstructionModal;
 window.submitClinicInstructions = submitClinicInstructions;
 window.openCarePlanModal = openCarePlanModal;
 window.submitCarePlanModal = submitCarePlanModal;
 window.openBodyConditionModal = openBodyConditionModal;
 window.submitBodyConditionModal = submitBodyConditionModal;
 window.openDiseaseGuide = openDiseaseGuide;
 window.toggleCustomDiseaseEdit = toggleCustomDiseaseEdit;
 window.saveCustomDiseaseGuide = saveCustomDiseaseGuide;
 window.resetCustomDiseaseGuide = resetCustomDiseaseGuide;
 window.annotateMedicalTerms = annotateMedicalTerms;
 window.openTermExplanation = openTermExplanation;
 window.closeTermExplanation = closeTermExplanation;
 window.MEDICAL_TERMS_DICTIONARY = MEDICAL_TERMS_DICTIONARY;
 window.changePersonalCalendarMonth = changePersonalCalendarMonth;
 window.jumpPersonalCalendarToday = jumpPersonalCalendarToday;
 window.selectPersonalCalendarDate = selectPersonalCalendarDate;
 window.openPersonalVitalModal = openPersonalVitalModal;
 window.submitPersonalVitalModal = submitPersonalVitalModal;
 window.renderPersonalCalendar = renderPersonalCalendar;
 window.renderPersonalDailySummary = renderPersonalDailySummary;
 window.getCategoryBadgeStyle = getCategoryBadgeStyle;
 window.selectRecordCategory = selectRecordCategory;
 window.syncCategoryButtons = syncCategoryButtons;
 window.openDailyJournalAddRecordModal = openDailyJournalAddRecordModal;
 window.selectDailyJournalCategory = selectDailyJournalCategory;
 window.syncDailyJournalCategoryButtons = syncDailyJournalCategoryButtons;
 window.insertDailyJournalTemplate = insertDailyJournalTemplate;
 window.submitDailyJournalRecordModal = submitDailyJournalRecordModal;
 window.openShiftHopeModal = openShiftHopeModal;
 window.renderShiftHopeList = renderShiftHopeList;
 window.submitShiftHopeOff = submitShiftHopeOff;
 window.deleteShiftHopeOff = deleteShiftHopeOff;
 window.toggleShiftHopeOff = toggleShiftHopeOff;
 window.applyHopeOffsAndRegenerate = applyHopeOffsAndRegenerate;
 window.getDailyShiftRoster = getDailyShiftRoster;
 window.renderTodayShiftBar = renderTodayShiftBar;
 window.openBackupStatusModal = openBackupStatusModal;
 window.triggerManualBackup = triggerManualBackup;
 window.downloadBackupJson = downloadBackupJson;
 window.isStaffAdminOrClerk = isStaffAdminOrClerk;
 window.isCurrentStaffAdminOrClerk = isCurrentStaffAdminOrClerk;
 window.updateStaffRoleUI = updateStaffRoleUI;
 window.ensureStaffPinData = ensureStaffPinData;
 window.onStaffSelectChange = onStaffSelectChange;
 window.openStaffPinAuthModal = openStaffPinAuthModal;
 window.renderRandomKeypad = renderRandomKeypad;
 window.onPinKeyPress = onPinKeyPress;
 window.backspaceStaffPin = backspaceStaffPin;
 window.cancelStaffPinAuth = cancelStaffPinAuth;
 window.verifyStaffPin = verifyStaffPin;
 window.openInitialPinModal = openInitialPinModal;
 window.submitInitialPinModal = submitInitialPinModal;
 window.renderOfficeBackup = renderOfficeBackup;
 window.loadExternalBackupStatus = loadExternalBackupStatus;
 window.saveExternalBackupConfig = saveExternalBackupConfig;
 window.runManualExternalBackup = runManualExternalBackup;
 window.renderOfficeStaffAuth = renderOfficeStaffAuth;
 window.submitTwoPersonReset = submitTwoPersonReset;
 window.resetStaffPin = resetStaffPin;
 window.openTemplateManageModal = openTemplateManageModal;
 window.renderTemplateManageList = renderTemplateManageList;
 window.submitTemplateForm = submitTemplateForm;
 window.startEditTemplate = startEditTemplate;
 window.cancelTemplateEdit = cancelTemplateEdit;
 window.deleteTemplate = deleteTemplate;
 window.resetDefaultTemplates = resetDefaultTemplates;
 window.getResidentSummaryStatusText = getResidentSummaryStatusText;
 window.renderResidentSummaryAccordionContent = renderResidentSummaryAccordionContent;
 window.openCareSummaryModal = openCareSummaryModal;
 window.switchCareSummaryRecord = switchCareSummaryRecord;
 window.startNewCareSummary = startNewCareSummary;
 window.submitCareSummary = submitCareSummary;
 window.printCareSummary = printCareSummary;
 window.openEmergencySummaryModal = openEmergencySummaryModal;
 window.updateEmergencyPreviewReason = updateEmergencyPreviewReason;
 window.renderEmergencySummaryPreview = renderEmergencySummaryPreview;
 window.printEmergencySummary = printEmergencySummary;
 window.copyEmergencySummaryText = copyEmergencySummaryText;
}

// グローバル公開 (新規追加分)
window.formatTempInput = formatTempInput;
window.normalizeTempValue = normalizeTempValue;
window.onGlobalDateChange = onGlobalDateChange;
window.changeDateByDays = changeDateByDays;
window.setTodayDate = setTodayDate;
window.changeLinenResident = changeLinenResident;
window.deleteLinenRecord = deleteLinenRecord;

// ==========================================================
// 要介護認定 有効期限・更新手続き進捗管理機能
// ==========================================================
function renderOfficeCareRenewal() {
  const tbody = document.querySelector("#careRenewalTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const filter = document.getElementById("careRenewalFilterSelect")?.value || "all";
  const search = (document.getElementById("careRenewalSearchInput")?.value || "").trim().toLowerCase();

  const today = new Date();
  today.setHours(0,0,0,0);

  let totalCount = 0;
  let urgentCount = 0;
  let warningCount = 0;
  let inProgressCount = 0;
  let completedCount = 0;

  cpCurrentResidents().forEach(r => {
    totalCount++;
    r.renewal_steps = r.renewal_steps || {
      application_submitted: false,
      visit_scheduled: false,
      doctor_statement: false,
      result_pending: false,
      completed: false
    };

    let daysDiff = 999;
    if (r.care_expiry_date) {
      const exp = new Date(r.care_expiry_date);
      exp.setHours(0,0,0,0);
      daysDiff = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));
    }

    if (daysDiff <= 30) urgentCount++;
    else if (daysDiff <= 60) warningCount++;

    const isStepsStarted = Object.values(r.renewal_steps).some(v => v === true);
    if (r.renewal_steps.completed) {
      completedCount++;
    } else if (isStepsStarted) {
      inProgressCount++;
    }

    // Filter matching
    if (search) {
      const matchName = (r.name || "").toLowerCase().includes(search);
      const matchRoom = (r.room_no || "").toLowerCase().includes(search);
      if (!matchName && !matchRoom) return;
    }

    if (filter === "urgent" && daysDiff > 30) return;
    if (filter === "warning" && (daysDiff <= 30 || daysDiff > 60)) return;
    if (filter === "in_progress" && (!isStepsStarted || r.renewal_steps.completed)) return;
    if (filter === "completed" && !r.renewal_steps.completed) return;

    // Render row
    const tr = document.createElement("tr");

    let daysBadge = "";
    if (r.care_expiry_date) {
      if (daysDiff < 0) {
        daysBadge = `<span class="badge" style="background:#dc2626; color:#fff;">期限切れ (${Math.abs(daysDiff)}日前)</span>`;
      } else if (daysDiff <= 30) {
        daysBadge = `<span class="badge" style="background:#dc2626; color:#fff;">残り ${daysDiff}日 (至急申請)</span>`;
      } else if (daysDiff <= 60) {
        daysBadge = `<span class="badge" style="background:#ea580c; color:#fff;">残り ${daysDiff}日 (注意)</span>`;
      } else {
        daysBadge = `<span class="badge" style="background:#16a34a; color:#fff;">残り ${daysDiff}日</span>`;
      }
    } else {
      daysBadge = `<span class="badge" style="background:#94a19a; color:#fff;">期限未設定</span>`;
    }

    const s = r.renewal_steps;

    tr.innerHTML = `
      <td><strong>${escapeHtml(r.room_no || '-')}号室</strong><br><span style="font-size:14px; font-weight:bold;">${escapeHtml(r.name || '-')}</span> 様</td>
      <td><span class="badge" style="background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd;">${escapeHtml(r.care_level || '要介護3')}</span></td>
      <td><strong>${r.care_expiry_date || '未設定'}</strong></td>
      <td>${daysBadge}</td>
      <td>
        <div style="display:flex; flex-wrap:wrap; gap:6px 12px; font-size:12px;">
          <label style="cursor:pointer; display:inline-flex; align-items:center; gap:3px;">
            <input type="checkbox" ${s.application_submitted ? 'checked' : ''} onchange="toggleCareRenewalStep(${r.id}, 'application_submitted')">
            <span>① 申請提出済</span>
          </label>
          <label style="cursor:pointer; display:inline-flex; align-items:center; gap:3px;">
            <input type="checkbox" ${s.visit_scheduled ? 'checked' : ''} onchange="toggleCareRenewalStep(${r.id}, 'visit_scheduled')">
            <span>② 訪問調査確定</span>
          </label>
          <label style="cursor:pointer; display:inline-flex; align-items:center; gap:3px;">
            <input type="checkbox" ${s.doctor_statement ? 'checked' : ''} onchange="toggleCareRenewalStep(${r.id}, 'doctor_statement')">
            <span>③ 意見書依頼済</span>
          </label>
          <label style="cursor:pointer; display:inline-flex; align-items:center; gap:3px;">
            <input type="checkbox" ${s.result_pending ? 'checked' : ''} onchange="toggleCareRenewalStep(${r.id}, 'result_pending')">
            <span>④ 認定結果待ち</span>
          </label>
          <label style="cursor:pointer; display:inline-flex; align-items:center; gap:3px; font-weight:bold; color:${s.completed?'#16a34a':'#4a5852'};">
            <input type="checkbox" ${s.completed ? 'checked' : ''} onchange="toggleCareRenewalStep(${r.id}, 'completed')">
            <span>⑤ 新認定反映完了</span>
          </label>
        </div>
      </td>
      <td>
        <button type="button" class="btn btn-primary" style="font-size:12px; padding:4px 10px; background:#0284c7; border-color:#0284c7;" onclick="openUpdateCareLevelModal(${r.id})">
          新認定へ更新
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  const summaryEl = document.getElementById("careRenewalSummaryCards");
  if (summaryEl) {
    summaryEl.innerHTML = `
      <div style="background:#ffffff; border:1px solid #dfe5e1; border-radius:8px; padding:12px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
        <div style="font-size:12px; color:#5f6d66;">対象利用者 総数</div>
        <div style="font-size:22px; font-weight:bold; color:#1c2622; margin-top:2px;">${totalCount} 名</div>
      </div>
      <div style="background:#fef2f2; border:1px solid #fca5a5; border-radius:8px; padding:12px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
        <div style="font-size:12px; color:#991b1b; font-weight:bold;">期限30日以内 (至急申請)</div>
        <div style="font-size:22px; font-weight:bold; color:#dc2626; margin-top:2px;">${urgentCount} 名</div>
      </div>
      <div style="background:#fff7ed; border:1px solid #fdba74; border-radius:8px; padding:12px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
        <div style="font-size:12px; color:#9a3412; font-weight:bold;">期限60日以内 (注意)</div>
        <div style="font-size:22px; font-weight:bold; color:#ea580c; margin-top:2px;">${warningCount} 名</div>
      </div>
      <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:12px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
        <div style="font-size:12px; color:#166534; font-weight:bold;">更新手続き完了</div>
        <div style="font-size:22px; font-weight:bold; color:#16a34a; margin-top:2px;">${completedCount} 名</div>
      </div>
    `;
  }
}

function toggleCareRenewalStep(residentId, stepKey) {
  const r = gState.residents.find(x => x.id === residentId);
  if (!r) return;
  r.renewal_steps = r.renewal_steps || {};
  r.renewal_steps[stepKey] = !r.renewal_steps[stepKey];
  db.data.residents = gState.residents;
  db.save();
  renderOfficeCareRenewal();
}

function openUpdateCareLevelModal(residentId) {
  const r = gState.residents.find(x => x.id === residentId);
  if (!r) return;
  document.getElementById("updateCareLevelResidentId").value = r.id;
  document.getElementById("updateCareLevelModalTitle").textContent = `要介護認定の更新登録 (${r.name} 様)`;
  document.getElementById("newCareLevelSelect").value = r.care_level || "要介護3";
  
  const defaultNextYear = new Date();
  defaultNextYear.setFullYear(defaultNextYear.getFullYear() + 1);
  const yyyy = defaultNextYear.getFullYear();
  const mm = String(defaultNextYear.getMonth() + 1).padStart(2, '0');
  const dd = String(defaultNextYear.getDate()).padStart(2, '0');
  document.getElementById("newCareExpiryDateInput").value = `${yyyy}-${mm}-${dd}`;

  openModal("updateCareLevelModal");
}

function submitUpdateCareLevelModal() {
  const residentId = Number(document.getElementById("updateCareLevelResidentId").value);
  const r = gState.residents.find(x => x.id === residentId);
  if (!r) return;

  const newLevel = document.getElementById("newCareLevelSelect").value;
  const newExpiry = document.getElementById("newCareExpiryDateInput").value;

  if (!newExpiry) {
    alert("新しい認定有効期限を入力してください。");
    return;
  }

  r.care_level = newLevel;
  r.care_expiry_date = newExpiry;
  r.renewal_steps = {
    application_submitted: true,
    visit_scheduled: true,
    doctor_statement: true,
    result_pending: true,
    completed: true
  };

  db.data.residents = gState.residents;
  db.save();

  renderOfficeCareRenewal();
  if (typeof renderResidentsStrip === "function") renderResidentsStrip();
	initGlobalTimeSync();
	
  closeModal("updateCareLevelModal");
  alert(`【認定更新完了】\n${r.name} 様の要介護度を「${newLevel}」、有効期限を「${newExpiry}」に更新いたしました。`);
}

function printCareRenewalList() {
  window.print();
}


window.renderOfficeCareRenewal = renderOfficeCareRenewal;
window.toggleCareRenewalStep = toggleCareRenewalStep;
window.openUpdateCareLevelModal = openUpdateCareLevelModal;
window.submitUpdateCareLevelModal = submitUpdateCareLevelModal;
window.printCareRenewalList = printCareRenewalList;

window.openSupplierModal = openSupplierModal;
window.submitSupplierModal = submitSupplierModal;
window.deleteSupplier = deleteSupplier;
window.openSupplierItemModal = openSupplierItemModal;
window.submitSupplierItemModal = submitSupplierItemModal;
window.deleteSupplierItem = deleteSupplierItem;
// =====================================================================
// 【新規実装】認証・ホーム画面・アラート確認・対応ログ管理
// =====================================================================

// セッション状態
if (!gState.session) {
  gState.session = null;
}

// 自動ログアウトタイマー
let autoLogoutTimerId = null;
const AUTO_LOGOUT_MS = 15 * 60 * 1000; // 15分無操作で自動ログアウト

function startAutoLogoutTimer() {
  clearAutoLogoutTimer();
  autoLogoutTimerId = setTimeout(() => {
    // [Claude修正] 先に画面を閉じてから知らせる
    // (以前はお知らせのOKが押されるまで、利用者の情報が画面に出たままだった)
    handleLogout({ reason: "auto" });
  }, AUTO_LOGOUT_MS);
}

function clearAutoLogoutTimer() {
  if (autoLogoutTimerId) {
    clearTimeout(autoLogoutTimerId);
    autoLogoutTimerId = null;
  }
}

function resetAutoLogoutTimer() {
  if (gState.session) {
    startAutoLogoutTimer();
  }
}

// ユーザー操作イベントの監視 (15分延長)
["mousemove", "keydown", "touchstart", "click"].forEach(evt => {
  window.addEventListener(evt, () => resetAutoLogoutTimer(), { passive: true });
});

// 職員アカウントデータの初期化 (初期値: aaaa / 0000)
function initStaffAccounts() {
  if (!Array.isArray(db.data.staff_accounts) || db.data.staff_accounts.length === 0) {
    const staffList = (db.data.stamps || []).map(s => s.name || s);
    const defaults = staffList.length > 0 ? staffList : [
      "木村 健一", "鈴木 美智子", "山田 孝之", "佐藤 健太", "加藤 由美",
      "高橋 直樹", "伊藤 翔太", "渡辺 拓也", "中村 大輔", "小林 亮",
      "斉藤 翼", "吉田 誠", "清水 翔平", "田中 慎一", "松本 陽子"
    ];
    db.data.staff_accounts = defaults.map(name => ({
      id: name,
      staff_name: name,
      staff_id: "aaaa",
      password: "0000",
      is_custom: false,
      updated_at: toLocalDateTimeStr(new Date())
    }));
  }
}

// ログイン画面の職員セレクトボックス描画

function renderLoginStaffSelect() {
  const sel = document.getElementById("loginStaffSelect");
  if (!sel) return;

  const prevVal = sel.value;
  let staffList = [];

  if (typeof gState !== "undefined" && Array.isArray(gState.stamps) && gState.stamps.length > 0) {
    staffList = gState.stamps.map(s => ({
      name: s.name || s,
      role: s.role || "職員",
      status: s.status || "正常",
      is_custom: typeof cpIsInitialPin === "function" ? !cpIsInitialPin(s) : false
    }));
  } else if (typeof db !== "undefined" && db.data && Array.isArray(db.data.staff_accounts) && db.data.staff_accounts.length > 0) {
    staffList = db.data.staff_accounts.map(a => ({
      name: a.staff_name,
      role: "職員",
      status: a.status || "正常",
      is_custom: a.is_custom || false
    }));
  } else {
    const defaults = [
      "木村 健一", "鈴木 美智子", "加藤 由美", "山田 孝之", "伊藤 翔太",
      "井上 蓮", "吉田 誠", "高橋 直樹", "佐藤 健太", "小林 亮",
      "松田 健二", "清水 翔平", "斉藤 翼", "石川 太陽", "中村 大輔",
      "渡辺 拓也", "野村 拓海", "松本 陽子", "田中 慎一"
    ];
    staffList = defaults.map(name => ({ name, role: "職員", status: "正常", is_custom: false }));
  }

  sel.innerHTML = "";
  staffList.forEach(st => {
    if (st.status === "休止中") return; // 休止中アカウントはログイン選択肢から除外
    const opt = document.createElement("option");
    opt.value = st.name;
    opt.textContent = `${st.name} 様` + (st.is_custom ? "" : " (初期設定)");
    sel.appendChild(opt);
  });

  if (prevVal && [...sel.options].some(o => o.value === prevVal)) {
    sel.value = prevVal;
  }

  // サーバーモード時はバックグラウンドで最新情報を取得
  if (typeof db !== "undefined" && db.isServerMode && typeof cpApiFetch === "function") {
    cpApiFetch('/api/login-info', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(info => {
      if (!info || !Array.isArray(info.staff)) return;
      gState.loginStaffInfo = info.staff;
      const currentVal = sel.value;
      sel.innerHTML = "";
      info.staff.forEach(st => {
        if (st.status === "休止中") return;
        const opt = document.createElement("option");
        opt.value = st.name;
        opt.textContent = `${st.name} 様` + (st.is_custom ? "" : " (初期設定)");
        sel.appendChild(opt);
      });
      if (currentVal && info.staff.some(st => st.name === currentVal)) sel.value = currentVal;
    }).catch(() => {});
  }
}


function onLoginStaffSelectChange(staffName) {
  const acc = (db.data.staff_accounts || []).find(a => a.staff_name === staffName);
  const idInput = document.getElementById("loginStaffIdInput");
  const pwInput = document.getElementById("loginPasswordInput");
  if (idInput) idInput.value = "";
  if (pwInput) pwInput.value = "";
  if (acc && !acc.is_custom && idInput) {
    idInput.placeholder = "初期ID: aaaa";
  }
}

// [Claude修正] サーバー稼働時は、ID・パスワードをサーバーで照合する
// (旧実装は端末内のデータで照合していたため、画面を通さずにデータを取得できた)
// [Claude修正 2026-10-16] ID・パスワード・暗証番号の欄：全角で打った英数字をその場で半角に直し、かな（日本語入力）になっていたら知らせる。
// パソコンの日本語入力をページ側から強制的に半角にすることはブラウザの決まりでできないため
const CP_HALFWIDTH_IDS = ["loginStaffIdInput", "loginPasswordInput", "staffAuthApprover1Pin", "staffAuthApprover2Pin",
  "initialPinCurrent", "initialPinNew", "initialPinConfirm", "accSetNewId", "accSetNewPw1", "accSetNewPw2",
  "resetAdminPin", "resetOfficePin", "facAdminPin", "facOfficePin"];
function cpToHalfWidth(str) {
  return String(str || "").replace(/[\uFF01-\uFF5E]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)).replace(/\u3000/g, " ");
}
function cpIsHalfwidthField(el) {
  return !!el && el.tagName === "INPUT" && (CP_HALFWIDTH_IDS.includes(el.id) || el.type === "password" || el.hasAttribute("data-cp-halfwidth"));
}
function cpImeWarn(el, show) {
  const box = (el.closest(".cp-pw-wrap") || el).parentNode;
  let w = box ? box.querySelector(`.cp-ime-warn[data-for="${el.id}"]`) : null;
  if (show && !w && box) {
    w = document.createElement("div");
    w.className = "cp-ime-warn";
    w.setAttribute("data-for", el.id);
    w.setAttribute("role", "alert");
    w.textContent = "日本語入力（全角・かな）になっています。キーボードの「半角/全角」キーで切り替えてください。";
    const after = el.closest(".cp-pw-wrap") || el;
    after.insertAdjacentElement("afterend", w);
  }
  if (w) w.style.display = show ? "" : "none";
}
function cpFixHalfwidth(el) {
  if (!cpIsHalfwidthField(el)) return;
  const v = el.value;
  const nv = cpToHalfWidth(v);
  if (nv !== v) {
    const pos = el.selectionStart;
    el.value = nv;
    try { if (pos !== null && el.type !== "password") el.setSelectionRange(pos, pos); } catch (e) {}
  }
  cpImeWarn(el, /[\u3040-\u30FF\u4E00-\u9FFF\uFF66-\uFF9F]/.test(el.value));
}
document.addEventListener("input", (e) => {
  if (e.isComposing) return;
  cpFixHalfwidth(e.target);
}, true);
document.addEventListener("compositionstart", (e) => {
  if (cpIsHalfwidthField(e.target)) cpImeWarn(e.target, true);
}, true);
document.addEventListener("compositionend", (e) => {
  if (cpIsHalfwidthField(e.target)) setTimeout(() => cpFixHalfwidth(e.target), 0);
}, true);
function cpHalfwidthAll() {
  CP_HALFWIDTH_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el && el.value) el.value = cpToHalfWidth(el.value);
  });
}
// ログインIDの「表示／隠す」
function cpToggleLoginIdVisible(btn) {
  const el = document.getElementById("loginStaffIdInput");
  if (!el) return;
  const show = el.type === "password";
  el.type = show ? "text" : "password";
  if (btn) {
    btn.textContent = show ? "隠す" : "表示";
    btn.setAttribute("aria-pressed", show ? "true" : "false");
  }
  el.focus();
}
window.cpToggleLoginIdVisible = cpToggleLoginIdVisible;

async function handleLoginSubmit() {
  cpHalfwidthAll();
  if (!db || !db.isServerMode) return handleLoginSubmitLocal();
  const staffName = document.getElementById("loginStaffSelect").value;
  const staffId = (document.getElementById("loginStaffIdInput").value || "").trim();
  const password = (document.getElementById("loginPasswordInput").value || "").trim();
  if (!staffName) { alert("職員名を選択してください。"); return; }
  if (!staffId || !/^[a-zA-Z]{4,}$/.test(staffId)) {
    alert("職員IDは半角英字（ローマ字）4文字以上で入力してください。（初期IDは aaaa です）");
    return;
  }
  if (!password || !/^\d{4}$/.test(password)) {
    alert("パスワードは半角数字4桁で入力してください。（初期パスワードは 0000 です）");
    return;
  }
  let res;
  try {
    res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ staff_name: staffName, staff_id: staffId, password: password })
    });
  } catch (e) {
    alert("サーバーに接続できませんでした。親機PCのサーバーが起動しているか確認してください。");
    return;
  }
  let info = {};
  try { info = await res.json(); } catch (e) {}
  if (res.status === 423) {
    alert(`ログインに続けて失敗したため、一時的にロックしています。\n約${Math.ceil((info.retry_after || 300) / 60)}分後にもう一度お試しください。`);
    return;
  }
  // [Claude修正] 休止中 (ロック中) のアカウント
  if (res.status === 403 && info.error === "suspended") {
    alert("このアカウントは現在ロック（休止中）されています。\n管理者または事務員にお問い合わせください。");
    return;
  }
  if (!res.ok || !info.token) {
    const left = (typeof info.remaining === "number") ? `\n（あと${info.remaining}回失敗すると、5分間ログインできなくなります）` : "";
    alert("職員IDまたはパスワードが正しくありません。\nお忘れの場合は「ID・パスワード初期化申請」をご利用ください。" + left);
    return;
  }
  cpSetToken(info.token);
  await db.initServerSync();
  if (typeof reloadStateFromDb === "function") reloadStateFromDb();
  finishLoginUi(staffName, staffId, !!info.is_custom);
}

// ログイン成功後の画面切り替え (サーバー照合・端末照合で共通)
function finishLoginUi(staffName, staffId, isCustom) {
  gState.session = {
    staffName: staffName,
    staffId: staffId,
    is_custom: isCustom,
    loggedInAt: toLocalDateTimeStr(new Date())
  };
  try {
    sessionStorage.setItem("carePortalSession", JSON.stringify(gState.session));
  } catch(e) {}
  const curStaffSelect = document.getElementById("currentStaff");
  if (curStaffSelect) curStaffSelect.value = staffName;
  const headerName = document.getElementById("headerStaffName");
  if (headerName) headerName.textContent = `${staffName} 様`;
  const btnSettings = document.getElementById("btnHeaderAccountSettings");
  if (btnSettings) btnSettings.style.display = !isCustom ? "inline-block" : "none";
  const loginSec = document.getElementById("loginSection");
  const mainWrap = document.getElementById("appMainWrapper");
  if (loginSec) loginSec.style.display = "none";
  if (mainWrap) mainWrap.style.display = "block";
  document.body.style.overflow = "";
  const pwInput = document.getElementById("loginPasswordInput");
  if (pwInput) pwInput.value = "";
  goToHome();
  startAutoLogoutTimer();
}

// ログイン実行 (サーバーを使わない単体動作時)
function handleLoginSubmitLocal() {
  cpHalfwidthAll(); // [Claude修正 2026-10-16]
  const staffName = document.getElementById("loginStaffSelect").value;
  const staffId = (document.getElementById("loginStaffIdInput").value || "").trim();
  const password = (document.getElementById("loginPasswordInput").value || "").trim();

  if (!staffName) {
    alert("職員名を選択してください。");
    return;
  }

  // ローマ字4文字以上チェック
  if (!staffId || !/^[a-zA-Z]{4,}$/.test(staffId)) {
    alert("職員IDは半角英字（ローマ字）4文字以上で入力してください。（初期IDは aaaa です）");
    return;
  }

  // 数字4文字チェック
  if (!password || !/^\d{4}$/.test(password)) {
    alert("パスワードは半角数字4桁で入力してください。（初期パスワードは 0000 です）");
    return;
  }

  initStaffAccounts();
  const acc = (db.data.staff_accounts || []).find(a => a.staff_name === staffName);

  if (!acc) {
    alert("職員情報が見つかりません。");
    return;
  }

  // IDとパスワードの照合
  if (acc.staff_id !== staffId || acc.password !== password) {
    alert("職員IDまたはパスワードが正しくありません。\nお忘れの場合は「ID・パスワード初期化申請」をご利用ください。");
    return;
  }

  // ログイン成功
  gState.session = {
    staffName: acc.staff_name,
    staffId: acc.staff_id,
    is_custom: acc.is_custom,
    loggedInAt: toLocalDateTimeStr(new Date())
  };

  try {
    sessionStorage.setItem("carePortalSession", JSON.stringify(gState.session));
  } catch(e) {}

  // 担当職員をログイン者に自動固定
  const curStaffSelect = document.getElementById("currentStaff");
  if (curStaffSelect) {
    curStaffSelect.value = acc.staff_name;
  }

  // ヘッダー情報更新
  const headerName = document.getElementById("headerStaffName");
  if (headerName) headerName.textContent = `${acc.staff_name} 様`;

  // 初期値の時のみ「ID・PW設定」ボタンを表示
  const btnSettings = document.getElementById("btnHeaderAccountSettings");
  if (btnSettings) {
    btnSettings.style.display = (!acc.is_custom || (acc.staff_id === "aaaa" && acc.password === "0000")) ? "inline-block" : "none";
  }

  // 画面切り替え: ログイン画面を非表示、本体ラッパーを表示
  const loginSec = document.getElementById("loginSection");
  const mainWrap = document.getElementById("appMainWrapper");
  if (loginSec) loginSec.style.display = "none";
  if (mainWrap) mainWrap.style.display = "block";
  document.body.style.overflow = "";

  // ホーム画面を表示
  goToHome();

  // 自動ログアウトタイマー開始
  startAutoLogoutTimer();
}

// ログアウト実行
// [Claude修正] ログアウト (手動・15分の自動・ログインの有効期限切れ)
// ・まだ親機へ送れていない記録があれば、送り切ってからログアウトする。
//   手動のときに送れなければ、ログアウトするか確かめる (キャンセルで画面に戻る)
// ・自動・期限切れのときは、先に画面を閉じてから送る (席を外している間に情報が出たままにならないように)
// ・サーバー接続時は、端末に残った控えを消し、ページを読み込み直してメモリ上のデータも消す
let cpLogoutInProgress = false;
const CP_LOGOUT_NOTICE_KEY = "carePortalLogoutNotice";

function cpHideAppForLogout() {
  const mainWrap = document.getElementById("appMainWrapper");
  const loginSec = document.getElementById("loginSection");
  if (mainWrap) mainWrap.style.display = "none";
  if (loginSec) loginSec.style.display = "flex";
  document.body.style.overflow = "hidden";
  document.querySelectorAll(".modal-overlay").forEach(m => { m.style.display = "none"; });
}

function cpLogoutNoticeText(reason, unsentLost) {
  const parts = [];
  if (reason === "auto") parts.push("一定時間（15分）操作がなかったため、自動でログアウトしました。");
  if (reason === "expired") parts.push("ログインの有効期限が切れたか、サーバーが再起動されたため、ログアウトしました。\nお手数ですが、もう一度ログインしてください。");
  if (unsentLost) parts.push("【注意】親機に送れていない記録がありました（通信が切れていた可能性があります）。\nログイン後、入力した内容が記録に残っているかを確かめ、残っていなければ入力し直してください。");
  return parts.join("\n\n");
}

async function handleLogout(opts) {
  const reason = (opts && opts.reason) || "manual";
  if (cpLogoutInProgress) return;
  // [Claude追加] 未保存の服薬記録: 手動のログアウトでは聞く。自動ログアウト・期限切れでは消す（記録がない方はお知らせで気づける）
  if (reason === "manual" && typeof cpMedPendingGuard === "function") cpMedPendingGuard();
  if (gState.medPending) gState.medPending = {};
  cpLogoutInProgress = true;
  clearAutoLogoutTimer();
  try {
    const serverMode = !!(db && db.isServerMode);
    let unsentLost = false;
    if (serverMode) {
      if (reason === "manual") {
        const sent = await db.flushUnsentChanges();
        if (!sent) {
          const go = confirm("まだ親機に送れていない記録があります（通信が切れている可能性があります）。\n\nこのままログアウトすると、この端末で入力した未送信の記録は消えます。\n\n［OK］ログアウトする\n［キャンセル］ログアウトせずに戻る（通信を確かめてから、もう一度ログアウトしてください）");
          if (!go) {
            cpLogoutInProgress = false;
            startAutoLogoutTimer();
            return;
          }
          unsentLost = true;
        }
        cpHideAppForLogout();
      } else {
        cpHideAppForLogout();
        // 期限切れのときはサーバーが受け付けないので送らない
        const sent = (reason === "auto") ? await db.flushUnsentChanges() : !db.hasUnsentChanges();
        unsentLost = !sent;
      }
      // サーバー側のセッションも破棄する
      if (cpGetToken()) {
        try { await fetch('/api/logout', { method: 'POST', headers: { 'X-Session-Token': cpGetToken() }, credentials: 'same-origin', keepalive: true }); } catch (e) {}
      }
    } else {
      cpHideAppForLogout();
    }

    cpSetToken("");
    gState.session = null;
    try {
      sessionStorage.removeItem("carePortalSession");
    } catch(e) {}

    const notice = cpLogoutNoticeText(reason, unsentLost);
    if (serverMode) {
      // 端末の控えを消し、ページを読み込み直してメモリ上のデータも消す。お知らせは読み込み後に出す
      try { if (notice) sessionStorage.setItem(CP_LOGOUT_NOTICE_KEY, notice); } catch (e) {}
      db.clearLocalCopy();
      window.location.reload();
      return;
    }

    const idInput = document.getElementById("loginStaffIdInput");
    const pwInput = document.getElementById("loginPasswordInput");
    if (idInput) idInput.value = "";
    if (pwInput) pwInput.value = "";

    renderLoginStaffSelect();
    cpLogoutInProgress = false;
    if (notice) alert(notice);
  } catch (e) {
    cpLogoutInProgress = false;
    console.warn("Logout error:", e);
  }
}

// [Claude修正] ログアウトで読み込み直した後に、お知らせを出す (ログイン画面の上に出る)
function cpShowLogoutNoticeOnLoad() {
  let msg = "";
  try {
    msg = sessionStorage.getItem(CP_LOGOUT_NOTICE_KEY) || "";
    sessionStorage.removeItem(CP_LOGOUT_NOTICE_KEY);
  } catch (e) {}
  if (msg) setTimeout(() => alert(msg), 300);
}

// ホーム画面への遷移
// [Claude修正 2026-10-16] ブラウザ・タブレットの「戻る」でアプリの外へ出てしまい、書きかけも消えていた。
// 画面を移るたびに履歴を残し、「戻る」でアプリの中の1つ前の画面（ホーム・ポータル・タブ）へ戻す。
// ホームでさらに「戻る」を押したときは「アプリを閉じますか？」と確認する。ログアウト中は画面を戻さない
let cpNavInited = false;
let cpNavRestoring = false;
let cpNavTimer = null;
function cpNavSnapshot() {
  const homeSec = document.getElementById("portalHomeSection");
  const atHome = homeSec && homeSec.style.display !== "none" && homeSec.offsetParent !== null;
  return atHome ? { p: "home" } : { p: gState.activePortal || "home", c: gState.activeCareTab || "", o: gState.activeOfficeTab || "" };
}
function cpNavSame(a, b) {
  return !!a && !!b && a.p === b.p && (a.p === "home" || a.p === "guard" || (a.p === "care" ? a.c === b.c : a.o === b.o));
}
function cpNavInit() {
  if (cpNavInited || !gState.session || !window.history || !history.pushState) return;
  cpNavInited = true;
  history.replaceState({ cp: { p: "guard" } }, "");
  history.pushState({ cp: cpNavSnapshot() }, "");
}
function cpNavRecord() {
  if (!cpNavInited || cpNavRestoring) return;
  clearTimeout(cpNavTimer);
  // 1回の操作で複数の切り替えが続くことがあるので、落ち着いてから1つだけ残す
  cpNavTimer = setTimeout(() => {
    if (cpNavRestoring || !gState.session) return;
    const snap = cpNavSnapshot();
    const cur = history.state && history.state.cp;
    if (cpNavSame(cur, snap)) return;
    history.pushState({ cp: snap }, "");
  }, 0);
}
window.addEventListener("popstate", (e) => {
  const st = e.state && e.state.cp;
  if (!st || !cpNavInited) return;
  if (!gState.session) return; // ログアウト中は画面を戻さない
  // 開いている画面（入力の小窓）があるときは、閉じずにそのまま（入力が消えないように）
  const openModal = [...document.querySelectorAll(".modal-overlay")].some(m => m.style.display && m.style.display !== "none");
  if (openModal) {
    history.pushState({ cp: cpNavSnapshot() }, "");
    return;
  }
  if (st.p === "guard") {
    if (confirm("アプリを閉じますか？\n（書きかけの内容は保存されません）")) {
      cpNavInited = false;
      history.back();
    } else {
      history.pushState({ cp: cpNavSnapshot() }, "");
    }
    return;
  }
  cpNavRestoring = true;
  try {
    if (st.p === "home") {
      goToHome();
    } else if (st.p === "care") {
      enterPortal("care");
      if (st.c && gState.activeCareTab !== st.c) switchCareTab(st.c);
    } else if (st.p === "office") {
      enterPortal("office");
      if (st.o && gState.activeOfficeTab !== st.o) switchOfficeTab(st.o);
    }
  } finally {
    setTimeout(() => { cpNavRestoring = false; }, 0);
  }
});

function goToHome() {
  if (typeof cpMedPendingGuard === "function") cpMedPendingGuard();
  const homeSec = document.getElementById("portalHomeSection");
  const careSec = document.getElementById("portalCareSection");
  const officeSec = document.getElementById("portalOfficeSection");

  if (homeSec) homeSec.style.display = "block";
  if (careSec) careSec.style.display = "none";
  if (officeSec) officeSec.style.display = "none";

  // ホーム画面情報の更新
  const homeFac = document.getElementById("homeFacilityNameDisplay");
  if (homeFac && typeof getFacilityName === "function") {
    homeFac.textContent = getFacilityName();
  }

  const homeDate = document.getElementById("homeTodayDateDisplay");
  if (homeDate) {
    homeDate.textContent = toLocalDateStr(new Date());
  }

  const homeStaff = document.getElementById("homeLoggedInStaffDisplay");
  if (homeStaff && gState.session) {
    homeStaff.textContent = `${gState.session.staffName} 様`;
  }
  // [Claude修正 2026-10-16] 戻るボタン用の履歴（ホームを表示してから記録する）
  cpNavInit();
  cpNavRecord();
}

// ポータルへ入る
function enterPortal(portalType) {
  if (portalType !== "care" && typeof cpMedPendingGuard === "function") cpMedPendingGuard();
  cpNavRecord(); // [Claude修正 2026-10-16] 戻るボタン用の履歴
  const homeSec = document.getElementById("portalHomeSection");
  const careSec = document.getElementById("portalCareSection");
  const officeSec = document.getElementById("portalOfficeSection");

  if (portalType === "care") {
    if (homeSec) homeSec.style.display = "none";
    if (careSec) careSec.style.display = "block";
    if (officeSec) officeSec.style.display = "none";
    gState.activePortal = "care";
    if (typeof loadDateRecords === "function") loadDateRecords(gState.selectedDate || toLocalDateStr(new Date()));
  } else if (portalType === "office") {
    if (homeSec) homeSec.style.display = "none";
    if (careSec) careSec.style.display = "none";
    if (officeSec) officeSec.style.display = "block";
    gState.activePortal = "office";
    if (typeof loadOfficeData === "function") loadOfficeData();
  }
}

// ---------------------------------------------------------------------
// ID・パスワードの個別設定 (設定完了後は非表示)
// ---------------------------------------------------------------------
function openAccountSettingsModal() {
  if (!gState.session) {
    alert("ログインが必要です。");
    return;
  }
  document.getElementById("accSetStaffName").textContent = `${gState.session.staffName} 様`;
  document.getElementById("accSetNewId").value = "";
  document.getElementById("accSetNewPw1").value = "";
  document.getElementById("accSetNewPw2").value = "";
  openModal("accountSettingsModal");
}

function submitAccountSettings() {
  if (!gState.session) return;
  const staffName = gState.session.staffName;
  const newId = (document.getElementById("accSetNewId").value || "").trim();
  const pw1 = (document.getElementById("accSetNewPw1").value || "").trim();
  const pw2 = (document.getElementById("accSetNewPw2").value || "").trim();

  // バリデーション
  if (!newId || !/^[a-zA-Z]{4,}$/.test(newId)) {
    alert("新しいIDは半角英字（ローマ字）4文字以上で入力してください。");
    return;
  }
  if (!pw1 || !/^\d{4}$/.test(pw1)) {
    alert("新しいパスワードは半角数字4桁で入力してください。");
    return;
  }
  if (pw1 !== pw2) {
    alert("パスワードが確認用と一致しません。再度ご確認ください。");
    return;
  }

  // 確認ダイアログ
  const confirmMsg = `【確認】\n職員名: ${staffName}\n新しいID: ${newId}\n新しいパスワード: ****\n\nこの内容で設定します。よろしいですか？\n※設定完了後は画面上の変更ボタンが非表示になります。`;
  if (!confirm(confirmMsg)) return;

  initStaffAccounts();
  const acc = (db.data.staff_accounts || []).find(a => a.staff_name === staffName);
  if (acc) {
    acc.staff_id = newId;
    acc.password = pw1;
    acc.is_custom = true;
    acc.updated_at = toLocalDateTimeStr(new Date());
  }

  gState.session.staffId = newId;
  gState.session.is_custom = true;

  try {
    sessionStorage.setItem("carePortalSession", JSON.stringify(gState.session));
  } catch(e) {}

  db.save();

  // 設定ボタンを非表示化
  const btnSettings = document.getElementById("btnHeaderAccountSettings");
  if (btnSettings) btnSettings.style.display = "none";

  closeModal("accountSettingsModal");
  alert(`ID・パスワードの設定が完了しました！\n次回からは 新ID「${newId}」でログインしてください。`);
}

// ---------------------------------------------------------------------
// 2名承認によるID・パスワード初期化 (リセット)
// ---------------------------------------------------------------------
function renderResetStaffSelects() {
  const targetSel = document.getElementById("resetTargetStaffSelect");
  const adminSel = document.getElementById("resetApproverAdmin");
  const officeSel = document.getElementById("resetApproverOffice");
  if (!targetSel || !adminSel || !officeSel) return;

  targetSel.innerHTML = "";
  adminSel.innerHTML = "";
  officeSel.innerHTML = "";

  // [Claude修正] サーバー稼働時は、サーバーから取得した職員一覧 (名前と役職) を使う
  const useServerList = db && db.isServerMode && Array.isArray(gState.loginStaffInfo);
  const accounts = useServerList ? gState.loginStaffInfo.map(x => ({ staff_name: x.name })) : (db.data.staff_accounts || []);
  accounts.forEach(a => {
    const opt1 = document.createElement("option");
    opt1.value = a.staff_name;
    opt1.textContent = a.staff_name;
    targetSel.appendChild(opt1);
  });

  // [Claude修正] 承認者は職員マスタの役職で絞り込む (旧実装は全職員が「管理者」「事務員」として表示されていた)
  const roleOf = (name) => {
    if (useServerList) {
      const si = gState.loginStaffInfo.find(x => x.name === name);
      return si ? (si.role || "") : "";
    }
    const st = (db.data.stamps || []).find(x => (x.name || x) === name);
    return (st && st.role) ? st.role : "";
  };
  const admins = accounts.filter(a => /管理者|施設長/.test(roleOf(a.staff_name)));
  admins.forEach(a => {
    const opt = document.createElement("option");
    opt.value = a.staff_name;
    opt.textContent = `${a.staff_name} (${roleOf(a.staff_name) || "管理者"})`;
    adminSel.appendChild(opt);
  });

  const offices = accounts.filter(a => /事務/.test(roleOf(a.staff_name)));
  offices.forEach(a => {
    const opt = document.createElement("option");
    opt.value = a.staff_name;
    opt.textContent = `${a.staff_name} (${roleOf(a.staff_name) || "事務員"})`;
    officeSel.appendChild(opt);
  });
}

function openAccountResetModal() {
  initStaffAccounts();
  renderResetStaffSelects();
  const p1 = document.getElementById("resetAdminPin");
  const p2 = document.getElementById("resetOfficePin");
  if (p1) p1.value = "";
  if (p2) p2.value = "";
  openModal("accountResetModal");
}

function executeAccountReset() {
  const targetStaff = document.getElementById("resetTargetStaffSelect").value;
  const adminStaff = document.getElementById("resetApproverAdmin").value;
  const officeStaff = document.getElementById("resetApproverOffice").value;
  const adminPin = (document.getElementById("resetAdminPin").value || "").trim();
  const officePin = (document.getElementById("resetOfficePin").value || "").trim();

  if (!targetStaff) {
    alert("初期化する対象職員を選択してください。");
    return;
  }

  // 暗証番号チェック (数字4桁)
  if (!adminPin || adminPin.length !== 4 || !officePin || officePin.length !== 4) {
    alert("管理者・事務員それぞれの暗証番号（4桁）を入力してください。");
    return;
  }

  if (adminStaff === officeStaff) {
    alert("承認者1と承認者2には別の職員を選択してください（2名による承認が必要です）。");
    return;
  }

  // [Claude修正] サーバー稼働時は、承認者の暗証番号の照合と初期化をサーバーで行う
  if (db && db.isServerMode) {
    executeAccountResetOnServer(targetStaff, adminStaff, adminPin, officeStaff, officePin);
    return;
  }

  // [Claude修正] 旧実装は4桁であればどの番号でも通っていた。承認者それぞれの暗証番号 (職員マスタ) と照合する
  const stampOf = (name) => (db.data.stamps || []).find(x => (x.name || x) === name);
  const adminObj = stampOf(adminStaff);
  const officeObj = stampOf(officeStaff);
  if (!adminObj || !/管理者|施設長/.test(adminObj.role || "")) {
    alert("承認者1には管理者（施設長）を選択してください。");
    return;
  }
  if (!officeObj || !/事務/.test(officeObj.role || "")) {
    alert("承認者2には事務員を選択してください。");
    return;
  }
  if (adminPin !== String(adminObj.pin || "0000") || officePin !== String(officeObj.pin || "0000")) {
    alert("承認者の暗証番号が一致しません。初期化は行っていません。");
    return;
  }

  const confirmMsg = `【重大確認】\n対象職員「${targetStaff}」様のIDおよびパスワードを初期化します。\n初期化後: ID「aaaa」/ パスワード「0000」\n\n承認者1: ${adminStaff}\n承認者2: ${officeStaff}\n\n実行してよろしいですか？`;
  if (!confirm(confirmMsg)) return;

  initStaffAccounts();
  const acc = (db.data.staff_accounts || []).find(a => a.staff_name === targetStaff);
  if (acc) {
    acc.staff_id = "aaaa";
    acc.password = "0000";
    acc.is_custom = false;
    acc.updated_at = toLocalDateTimeStr(new Date());
  }

  // もし現在ログイン中ならボタンを再表示
  if (gState.session && gState.session.staffName === targetStaff) {
    gState.session.is_custom = false;
    gState.session.staffId = "aaaa";
    const btnSettings = document.getElementById("btnHeaderAccountSettings");
    if (btnSettings) btnSettings.style.display = "inline-block";
  }

  db.save();
  closeModal("accountResetModal");
  alert(`「${targetStaff}」様のIDおよびパスワードを初期化しました。\n初期ID「aaaa」/ 初期パスワード「0000」でログイン後、再設定を行ってください。`);
  renderLoginStaffSelect();
}

async function executeAccountResetOnServer(targetStaff, adminStaff, adminPin, officeStaff, officePin) {
  const confirmMsg = `【重大確認】\n対象職員「${targetStaff}」様のIDおよびパスワードを初期化します。\n初期化後: ID「aaaa」/ パスワード「0000」\n\n承認者1: ${adminStaff}\n承認者2: ${officeStaff}\n\n実行してよろしいですか？`;
  if (!confirm(confirmMsg)) return;
  let res;
  try {
    res = await fetch('/api/account-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: targetStaff, admin: adminStaff, admin_pin: adminPin, office: officeStaff, office_pin: officePin })
    });
  } catch (e) {
    alert("サーバーに接続できませんでした。");
    return;
  }
  if (res.status === 423) {
    alert("承認の失敗が続いたため、一時的にロックしています。5分ほどおいてからお試しください。");
    return;
  }
  if (!res.ok) {
    alert("承認者の暗証番号が一致しないか、承認者の役職が正しくありません。初期化は行っていません。");
    return;
  }
  closeModal("accountResetModal");
  alert(`「${targetStaff}」様のIDおよびパスワードを初期化しました。\n初期ID「aaaa」/ 初期パスワード「0000」でログイン後、再設定を行ってください。`);
  renderLoginStaffSelect();
}

// ---------------------------------------------------------------------
// アラート閉じる確認モーダル ＆ アラートログ・復旧
// ---------------------------------------------------------------------
let pendingDismissAlertData = null;

function requestDismissAlert(alertKey, alertTitle, alertDetail) {
  pendingDismissAlertData = {
    key: alertKey,
    title: alertTitle || "警告アラート",
    detail: alertDetail || "内容の確認"
  };

  const keyEl = document.getElementById("pendingAlertDismissKey");
  const titleEl = document.getElementById("alertConfirmTitle");
  const detailEl = document.getElementById("alertConfirmDetail");

  if (keyEl) keyEl.value = alertKey;
  if (titleEl) titleEl.textContent = pendingDismissAlertData.title;
  if (detailEl) detailEl.textContent = pendingDismissAlertData.detail;

  openModal("alertConfirmModal");
}

function executeDismissAlert() {
  if (!pendingDismissAlertData) {
    closeModal("alertConfirmModal");
    return;
  }

  const key = pendingDismissAlertData.key;
  const title = pendingDismissAlertData.title;
  const detail = pendingDismissAlertData.detail;
  const staffName = (gState.session && gState.session.staffName) ? gState.session.staffName : "担当者";

  // 1. 対応ログに記録 (誰が・いつ閉じたか)
  if (!Array.isArray(db.data.alert_logs)) {
    db.data.alert_logs = [];
  }

  db.data.alert_logs.unshift({
    id: Date.now(),
    alert_key: key,
    alert_title: title,
    alert_detail: detail,
    staff_name: staffName,
    dismissed_at: toLocalDateTimeStr(new Date())
  });

  // 2. アラートを閉じる (保存も行われる)。「全て閉じる」は複数のキーをまとめて閉じる
  const keys = Array.isArray(key) ? key : [key];
  if (typeof dismissAlerts === "function") {
    dismissAlerts(keys);
  } else {
    db.save();
  }
  closeModal("alertConfirmModal");
  pendingDismissAlertData = null;

  // アラート再描画
  if (typeof checkGlobalAlerts === "function") {
    checkGlobalAlerts();
  }
}

// アラート対応ログ一覧の表示
function openAlertLogModal() {
  const tbody = document.getElementById("alertLogTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const logs = db.data.alert_logs || [];
  if (logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:20px;">閉じたアラートの履歴はありません。</td></tr>`;
  } else {
    logs.forEach(l => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>
          <div style="font-weight:bold; font-size:12.5px; color:#22302b;">${escapeHtml(l.alert_title)}</div>
          <div style="font-size:11.5px; color:#5f6d66; margin-top:2px;">${escapeHtml(l.alert_detail || String(l.alert_key))}</div>
        </td>
        <td style="font-size:12px; font-weight:bold; color:#1c2622;">${escapeHtml(l.staff_name)}</td>
        <td style="font-size:11.5px; color:#5f6d66;">${escapeHtml(l.dismissed_at)}</td>
        <td style="text-align:center;">
          ${l.restored_at ? `<div style="font-size:11px; color:#5f6d66;">未対応に戻した<br>${escapeHtml(l.restored_at)} ${escapeHtml(l.restored_by || '')}</div>` : `<button type="button" class="btn btn-secondary" style="font-size:11px; padding:2px 8px; color:#0284c7; border-color:#bae6fd;" onclick="restoreAlert(${l.id})">復旧</button>`}
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  openModal("alertLogModal");
}

// [Claude修正] アラートの「閉じる」ボタンから確認画面を開く。
// (確認画面と対応ログの仕組みは作られていたが、どのボタンからも呼ばれておらず、
//  閉じても確認が出ず、対応ログにも記録されていなかった)
function requestDismissAlertFromButton(btn, keyOrKeys) {
  const banner = btn && btn.closest ? btn.closest(".alert-banner") : null;
  let detail = "";
  if (banner) {
    const clone = banner.cloneNode(true);
    clone.querySelectorAll("button").forEach(b => b.remove());
    detail = (clone.innerText || clone.textContent || "").replace(/\s+/g, " ").trim();
  }
  const m = detail.match(/【([^】]+)】/);
  const title = m ? m[1] : "警告アラート";
  requestDismissAlert(keyOrKeys, title, detail);
}

// アラートの復旧 (未対応状態に戻す)
function restoreAlert(logId) {
  const logs = db.data.alert_logs || [];
  const target = logs.find(l => l.id === logId);
  if (!target || target.restored_at) return;

  if (!confirm(`【確認】\nこのアラート（${target.alert_title}）を未対応状態に戻しますか？\n画面上に再び警告が表示されます。`)) {
    return;
  }

  // undismissAlert で復旧 (複数キーの場合はすべて)
  if (typeof undismissAlert === "function") {
    (Array.isArray(target.alert_key) ? target.alert_key : [target.alert_key]).forEach(k => undismissAlert(k));
  }

  // [Claude修正] ログは消さずに「未対応に戻した」日時と職員を残す
  target.restored_at = toLocalDateTimeStr(new Date());
  target.restored_by = cpLedgerStaff();
  db.save();

  openAlertLogModal(); // ログ表の更新
  if (typeof checkGlobalAlerts === "function") {
    checkGlobalAlerts(); // 画面上アラートの復活
  }

  alert("アラートを未対応状態に復旧しました。画面上に再表示されます。");
}

// ---------------------------------------------------------------------
// 既存セッションの復元 (リロード対策)
// ---------------------------------------------------------------------
function restoreSessionOnLoad() {
  cpShowLogoutNoticeOnLoad();
  try {
    const saved = sessionStorage.getItem("carePortalSession");
    // [Claude修正] サーバー稼働時は、サーバーの鍵 (トークン) が無ければログイン画面に戻す
    if (saved && db && db.isServerMode && !cpGetToken()) {
      sessionStorage.removeItem("carePortalSession");
    } else if (saved) {
      const sess = JSON.parse(saved);
      if (sess && sess.staffName) {
        gState.session = sess;

        const curStaffSelect = document.getElementById("currentStaff");
        if (curStaffSelect) curStaffSelect.value = sess.staffName;

        const headerName = document.getElementById("headerStaffName");
        if (headerName) headerName.textContent = `${sess.staffName} 様`;

        const btnSettings = document.getElementById("btnHeaderAccountSettings");
        if (btnSettings) {
          btnSettings.style.display = (!sess.is_custom || (sess.staffId === "aaaa")) ? "inline-block" : "none";
        }

        const loginSec = document.getElementById("loginSection");
        const mainWrap = document.getElementById("appMainWrapper");
        if (loginSec) loginSec.style.display = "none";
        if (mainWrap) mainWrap.style.display = "block";

        goToHome();
        startAutoLogoutTimer();
        return;
      }
    }
  } catch(e) {}

  // 未ログイン時
  const loginSec = document.getElementById("loginSection");
  const mainWrap = document.getElementById("appMainWrapper");
  if (loginSec) loginSec.style.display = "flex";
  if (mainWrap) mainWrap.style.display = "none";
  document.body.style.overflow = "hidden";
  renderLoginStaffSelect();
}

// アプリ初期化時にセッション復元
window.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => {
    restoreSessionOnLoad();
  }, 100);
});

// グローバル公開
window.handleLoginSubmit = handleLoginSubmit;
window.handleLogout = handleLogout;
window.goToHome = goToHome;
window.enterPortal = enterPortal;
window.openAccountSettingsModal = openAccountSettingsModal;
window.submitAccountSettings = submitAccountSettings;
window.openAccountResetModal = openAccountResetModal;
window.executeAccountReset = executeAccountReset;
window.requestDismissAlert = requestDismissAlert;
window.executeDismissAlert = executeDismissAlert;
window.openAlertLogModal = openAlertLogModal;
window.restoreAlert = restoreAlert;
window.onLoginStaffSelectChange = onLoginStaffSelectChange;
// 第2段階 グローバル公開
window.openFacilityNameModal = openFacilityNameModal;
window.executeFacilityNameChange = executeFacilityNameChange;
window.updateItemAlertThreshold = updateItemAlertThreshold;
// =====================================================================
// 介護サマリー 新旧比較機能 (左右任意日付選択・例文プレビュー)
// =====================================================================

function openCareSummaryCompareModal(targetResId) {
  if (targetResId !== undefined && targetResId !== null && targetResId !== "") {
    gState.selectedResidentId = Number(targetResId);
  }
  const r = (gState.residents || []).find(x => Number(x.id) === Number(gState.selectedResidentId));
  const badge = document.getElementById("compareResidentBadge");
  if (badge) badge.textContent = r ? `${r.room_no}号室 ${r.name} 様` : "利用者";

  const sel1 = document.getElementById("compareSelect1") || document.getElementById("compareSelectLeft");
  const sel2 = document.getElementById("compareSelect2") || document.getElementById("compareSelectRight");
  const sel3 = document.getElementById("compareSelect3");
  if (!sel1 || !sel2) return;

  sel1.innerHTML = "";
  sel2.innerHTML = "";
  if (sel3) sel3.innerHTML = "";

  // 対象利用者のサマリー履歴を取得
  let summaries = (db.data.care_summaries || []).filter(s => Number(s.resident_id) === Number(gState.selectedResidentId));

  if (summaries.length === 0) {
    alert("この利用者の介護サマリーはまだありません。サマリーを作成すると比較ができます。");
    return;
  }
  // ソート (古い順)
  summaries.sort((a, b) => (a.created_at || a.date || "").localeCompare(b.created_at || b.date || "") || (Number(a.id) - Number(b.id)));

  summaries.forEach((s) => {
    const text = `[${s.created_at || s.date || '-'}] ${s.summary_type || 'サマリー'}${s.previous_id ? ' (更新版)' : ''} (${s.staff_name || '担当'})`;
    const opt1 = document.createElement("option"); opt1.value = s.id; opt1.textContent = text; sel1.appendChild(opt1);
    const opt2 = document.createElement("option"); opt2.value = s.id; opt2.textContent = text; sel2.appendChild(opt2);
    if (sel3) {
      const opt3 = document.createElement("option"); opt3.value = s.id; opt3.textContent = text; sel3.appendChild(opt3);
    }
  });

  if (sel3) {
    const optNone = document.createElement("option");
    optNone.value = "none";
    optNone.textContent = "（なし - 2列で比較）";
    sel3.appendChild(optNone);
  }

  // 初期選択:
  // 3件以上ある場合: 1st=最古(初回), 2nd=中間, 3rd=最新
  if (summaries.length >= 3) {
    // [Claude修正] 4件以上でも「初回・最新の1つ前・最新」を選ぶ（以前は先頭から3件で、最新が出なかった）
    sel1.selectedIndex = 0;
    sel2.selectedIndex = summaries.length - 2;
    if (sel3) {
      sel3.selectedIndex = summaries.length - 1;
    }
  } else if (summaries.length === 2) {
    sel1.selectedIndex = 0;
    sel2.selectedIndex = 1;
    if (sel3) sel3.value = "none";
  } else {
    sel1.selectedIndex = 0;
    sel2.selectedIndex = 0;
    if (sel3) sel3.value = "none";
  }

  renderCompareView();
  openModal("careSummaryCompareModal");
  if (summaries.length === 1) {
    alert("この利用者の介護サマリーは1件のみです。サマリーを更新（新規作成）すると、新旧を比較できます。");
  }
}

function renderCompareView() {
  const sel1 = document.getElementById("compareSelect1") || document.getElementById("compareSelectLeft");
  const sel2 = document.getElementById("compareSelect2") || document.getElementById("compareSelectRight");
  const sel3 = document.getElementById("compareSelect3");
  const container = document.getElementById("compareContentContainer");
  if (!container || !sel1 || !sel2) return;

  const id1 = Number(sel1.value);
  const id2 = Number(sel2.value);
  const id3 = sel3 && sel3.value !== "none" ? Number(sel3.value) : null;

  const s1 = (db.data.care_summaries || []).find(s => Number(s.id) === id1);
  const s2 = (db.data.care_summaries || []).find(s => Number(s.id) === id2);
  const s3 = id3 ? (db.data.care_summaries || []).find(s => Number(s.id) === id3) : null;

  const has3Cols = s3 !== null && s3 !== undefined;

  const sections = [
    { title: "1. サマリー基本情報・区分", key: "basic_info", sub: "要介護度、生年月日、キーパーソン、自立度区分" },
    { title: "2. 入所の経緯・病歴", key: "background", sub: "既往歴、骨折・入院経緯、在宅時状況" },
    { title: "3. 身体機能 ＆ 認知機能", key: "physical_cognitive", sub: "麻痺、拘縮、歩行能力、記憶、見当識" },
    { title: "4. ADL (日常生活動作)", key: "adl", sub: "移動、移乗、立ち上がり、更衣、整容、入浴" },
    { title: "5. 食事 ＆ 水分摂取", key: "meals_hydration", sub: "食形態、自力摂取、むせ、嚥下、目標水分量" },
    { title: "6. 排泄状況", key: "excretion", sub: "トイレ誘導、リハパン・パッド、排便リズム、失禁状況" },
    { title: "7. 睡眠リズム", key: "sleep", sub: "就寝・起床時間、夜間覚醒、センサーマット、良眠度" },
    { title: "8. 定期服薬", key: "meds", sub: "処方薬、配薬確認、自己内服、服薬ゼリー等" },
    { title: "9. 医療処置・創傷ケア", key: "medical_care", sub: "バイタル測定、術創、褥瘡・発赤、軟膏・湿布" },
    { title: "10. 認知症BPSD・心理特徴", key: "dementia_behavior", sub: "帰宅願望、せん妄、不安時の対応方法" },
    { title: "11. ケア上の留意事項", key: "care_notes", sub: "転倒予防、声かけの注意点、好み・職人歴等" },
    { title: "12. 家族意向・連絡方針", key: "family_info", sub: "面会頻度、緊急連絡先、看取り合意方針" },
    { title: "13. 今後のケア目標", key: "future_goals", sub: "自立支援、ADL維持目標、社会参加・レク" }
  ];

  let rowsHtml = "";
  sections.forEach((sec, idx) => {
    const v1 = s1 ? (s1[sec.key] || "（未記入）") : "—";
    const v2 = s2 ? (s2[sec.key] || "（未記入）") : "—";
    const v3 = has3Cols ? (s3 ? (s3[sec.key] || "（未記入）") : "—") : null;

    const diff12 = v1 !== v2;
    const diff23 = has3Cols && (v2 !== v3);

    let badgeHtml = "";
    if (diff12 && diff23) {
      badgeHtml = `<span class="badge" style="display:inline-block; font-size:10.5px; background:var(--sun-tint); color:var(--ink); padding:2px 6px; border-radius:10px; font-weight:bold; margin-top:4px;">各時期で変化あり</span>`;
    } else if (diff12) {
      badgeHtml = `<span class="badge" style="display:inline-block; font-size:10.5px; background:var(--pine-tint); color:var(--pine); padding:2px 6px; border-radius:10px; font-weight:bold; margin-top:4px;">①→②で変化</span>`;
    } else if (diff23) {
      badgeHtml = `<span class="badge" style="display:inline-block; font-size:10.5px; background:var(--caution-tint); color:var(--caution); padding:2px 6px; border-radius:10px; font-weight:bold; margin-top:4px;">②→③で変化</span>`;
    }

    const fmtText = (val) => {
      return escapeHtml(val).replace(/\n/g, '<br>');
    };

    rowsHtml += `
      <tr style="${idx % 2 === 1 ? 'background:#f9faf9;' : 'background:#ffffff;'}">
        <td style="width:160px; min-width:140px; vertical-align:top; border-right:1px solid var(--line); padding:10px 12px;">
          <div style="font-weight:bold; font-size:13px; color:var(--ink);">${escapeHtml(sec.title)}</div>
          <div style="font-size:11px; color:var(--ink-3); margin-top:2px;">${escapeHtml(sec.sub)}</div>
          ${badgeHtml}
        </td>
        <td style="vertical-align:top; border-right:1px solid var(--line); padding:10px 12px; font-size:12.5px; color:var(--ink); line-height:1.6; background:${diff12 ? 'var(--ground)' : 'transparent'};">
          ${fmtText(v1)}
        </td>
        <td style="vertical-align:top; ${has3Cols ? 'border-right:1px solid var(--line);' : ''} padding:10px 12px; font-size:12.5px; color:var(--ink); line-height:1.6; background:${diff12 ? 'var(--pine-tint-2)' : 'transparent'};">
          ${fmtText(v2)}
        </td>
        ${has3Cols ? `
        <td style="vertical-align:top; padding:10px 12px; font-size:12.5px; color:var(--ink); line-height:1.6; background:${diff23 ? 'var(--caution-tint)' : (diff12 ? 'var(--pine-tint-2)' : 'transparent')};">
          ${fmtText(v3)}
        </td>` : ''}
      </tr>
    `;
  });

  const header1 = s1 ? `${escapeHtml(s1.summary_type)} [${escapeHtml(s1.created_at || s1.date || '')}] (${escapeHtml(s1.staff_name || '')})` : '-';
  const header2 = s2 ? `${escapeHtml(s2.summary_type)} [${escapeHtml(s2.created_at || s2.date || '')}] (${escapeHtml(s2.staff_name || '')})` : '-';
  const header3 = has3Cols && s3 ? `${escapeHtml(s3.summary_type)} [${escapeHtml(s3.created_at || s3.date || '')}] (${escapeHtml(s3.staff_name || '')})` : '-';

  container.innerHTML = `
    <table class="data-table" style="margin:0; width:100%; border-collapse:collapse;">
      <thead>
        <tr style="background:#eef2ef; border-bottom:2px solid var(--line-2);">
          <th style="width:160px; min-width:140px; font-size:12.5px;">評価項目</th>
          <th style="font-size:12.5px; color:var(--pine-dark); text-align:left;">【比較1】${header1}</th>
          <th style="font-size:12.5px; color:var(--pine); text-align:left;">【比較2】${header2}</th>
          ${has3Cols ? `<th style="font-size:12.5px; color:#9a3412; text-align:left;">【比較3】${header3}</th>` : ''}
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
  `;
}


window.openCareSummaryCompareModal = openCareSummaryCompareModal;
window.renderCompareView = renderCompareView;
if (typeof window !== "undefined") {
  window.toggleStaffAccountStatus = toggleStaffAccountStatus;
  window.openResetStaffPinModal = openResetStaffPinModal;
  window.submitTwoPersonReset = submitTwoPersonReset;
}

window.openAddMonthlyNoticeUpdateModal = openAddMonthlyNoticeUpdateModal;
window.submitMonthlyNoticeUpdate = submitMonthlyNoticeUpdate;

window.confirmDailyNotebookItem = confirmDailyNotebookItem;
window.openAddDailyNotebookUpdateModal = openAddDailyNotebookUpdateModal;
window.submitDailyNotebookUpdate = submitDailyNotebookUpdate;
window.deleteDailyNotebookItem = deleteDailyNotebookItem;
window.syncGlobalTimeToNow = syncGlobalTimeToNow;
window.onGlobalTimeChange = onGlobalTimeChange;
window.initGlobalTimeSync = initGlobalTimeSync;
// 行事・予定の登録モーダル
function openShiftEventModal(yearMonth, day) {
  const ym = yearMonth || getShiftYearMonth();
  const [yearStr, monthStr] = ym.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const dowNames = ["日", "月", "火", "水", "木", "金", "土"];
  const dow = new Date(year, month - 1, day).getDay();
  const hol = isHolidayOrYearEnd(year, month, day);
  const holName = hol.isHoliday ? ` (${hol.name})` : "";

  if (!db.data.shift_events) db.data.shift_events = {};
  if (!db.data.shift_events[ym]) db.data.shift_events[ym] = {};
  const currentEvt = db.data.shift_events[ym][day] || "";

  const val = prompt(`${month}月${day}日(${dowNames[dow]})${holName} の行事・予定を入力してください\n（例: 防災訓練、敬老会、健康診断、秋祭り、全体研修 など）\n※空にしてOKを押すと削除されます`, currentEvt);
  if (val === null) return;

  const trimmed = val.trim();
  if (trimmed) {
    db.data.shift_events[ym][day] = trimmed;
  } else {
    delete db.data.shift_events[ym][day];
  }
  db.save();
  renderShiftTable(ym);
}
window.openShiftEventModal = openShiftEventModal;

// [Claude追加] 応援の区分を付けられる勤務（早出・日勤・遅出・夜勤）
const CP_SHIFT_WORK_SYMBOLS = ["早", "日", "遅", "夜"];
function cpIsWorkShift(sym) { return CP_SHIFT_WORK_SYMBOLS.includes(String(sym || "").trim()); }
// [Claude追加] その日の応援の区分を外す（空になった入れ物も消す）
function cpClearShiftHelp(ym, staffName, day) {
  const m = db.data.monthly_shift_units;
  if (!m || !m[ym] || !m[ym][staffName]) return;
  delete m[ym][staffName][day];
  if (Object.keys(m[ym][staffName]).length === 0) delete m[ym][staffName];
}

// 勤務マスごとの担当区分（応援）変更
function changeShiftCellUnit(staffName, day, unitId) {
  const ym = getShiftYearMonth();
  // [Claude修正] 勤務でない日には応援を付けない
  const curSym = (((db.data.monthly_shifts || {})[ym] || {})[staffName] || {})[day] || "";
  if (unitId !== null && unitId !== undefined && !cpIsWorkShift(curSym)) {
    alert("応援の区分は、早出・日勤・遅出・夜勤の日だけ設定できます。");
    return;
  }
  if (!db.data.monthly_shift_units) db.data.monthly_shift_units = {};
  if (!db.data.monthly_shift_units[ym]) db.data.monthly_shift_units[ym] = {};
  if (!db.data.monthly_shift_units[ym][staffName]) db.data.monthly_shift_units[ym][staffName] = {};

  const stObj = (db.data.stamps || []).find(x => (x.name || x) === staffName);
  const baseUnitId = (stObj && stObj.unit_id !== undefined && stObj.unit_id !== null) ? stObj.unit_id : null;

  if (unitId === null || unitId === undefined || String(unitId) === String(baseUnitId)) {
    delete db.data.monthly_shift_units[ym][staffName][day];
    if (Object.keys(db.data.monthly_shift_units[ym][staffName]).length === 0) {
      delete db.data.monthly_shift_units[ym][staffName];
    }
  } else {
    db.data.monthly_shift_units[ym][staffName][day] = Number(unitId);
  }

  db.save();
  closeShiftPopover();
  renderShiftTable(ym);
  if (typeof renderTodayShiftBar === "function") renderTodayShiftBar();
  if (typeof renderDailyJournal === "function" && gState.activeCareTab === "daily_journal") renderDailyJournal();
}
window.changeShiftCellUnit = changeShiftCellUnit;

// [Antigravity追加] 請求設定関連の外部公開
window.cpGetBillingSettings = cpGetBillingSettings;
window.cpSaveBillingSettings = cpSaveBillingSettings;
window.cpBillingModeFor = cpBillingModeFor;
window.renderOfficeBillingSettings = renderOfficeBillingSettings;
window.cpOnChangeFacilityType = cpOnChangeFacilityType;
window.cpOnChangePersonalEnabled = cpOnChangePersonalEnabled;
window.cpToggleCategoryBilling = cpToggleCategoryBilling;
window.cpToggleItemBilling = cpToggleItemBilling;
window.cpSubmitBillingOverride = cpSubmitBillingOverride;
window.cpVoidBillingOverride = cpVoidBillingOverride;

// ======================================================================
// [Antigravity実装 2026-10-16] 書く画面A：1人分をまとめて書く画面（看護師・介護職の共通）
// - 利用者を1人選ぶと、その人のその日の分（食事量・水分・排泄・バイタル・入浴・体位変換・様子など）を1画面で書ける
// - バイタル（体温・血圧・脈拍・SpO2）は看護師・介護職の両方に表示し、「看護の処置・観察」は看護師にのみ表示
// - 入力欄はすべて空欄から始め、入れていない欄は保存しない
// - チェック表（書く画面B）と双方向連動し、すでに書かれた欄は「記入済み」・中身・書いた人・時刻を表示し、理由必須で訂正できる
// ======================================================================
function cpOnSingleWriteMealTypeChange() {
  const typeEl = document.getElementById("swMealType");
  const mainEl = document.getElementById("swMealMain");
  const sideEl = document.getElementById("swMealSide");
  const waterEl = document.getElementById("swMealWater");
  const statusEl = document.getElementById("swMealCurrentStatus");
  if (!typeEl || !mainEl || !sideEl) return;
  const resId = gState.selectedResidentId;
  const type = typeEl.value;
  // [Claude修正 2026-10-16] 訂正になるのは朝食・昼食・夕食だけ（おやつ・その他は毎回新しい記録）
  const existing = (type && resId && ["朝食", "昼食", "夕食"].includes(type))
    ? (db.data.meals || []).find(m => !m.voided && m.date === gState.selectedDate && m.resident_id === resId && m.meal_type === type)
    : null;

  if (statusEl) {
    statusEl.innerHTML = existing
      ? `<div style="margin-top:6px;">${cpFilledBadgeHtml(cpFormatMealDetail(existing), existing.staff_name, existing.time || "")} <span style="font-size:11px; color:#b45309; margin-left:4px;">※下の欄に入力して保存すると訂正（理由入力）になります</span></div>`
      : "";
  }

  if (type === "その他") {
    mainEl.type = "text"; mainEl.value = "ー"; mainEl.disabled = true;
    mainEl.style.background = "#f1f5f9"; mainEl.style.color = "#64748b";
    sideEl.type = "text"; sideEl.value = "ー"; sideEl.disabled = true;
    sideEl.style.background = "#f1f5f9"; sideEl.style.color = "#64748b";
  } else if (type === "おやつ") {
    mainEl.disabled = false; mainEl.type = "number";
    mainEl.min = "0"; mainEl.max = "10";
    mainEl.style.background = ""; mainEl.style.color = "";
    mainEl.value = "";
    sideEl.type = "text"; sideEl.value = "ー"; sideEl.disabled = true;
    sideEl.style.background = "#f1f5f9"; sideEl.style.color = "#64748b";
  } else {
    mainEl.disabled = false; mainEl.type = "number";
    mainEl.min = "0"; mainEl.max = "10";
    mainEl.style.background = ""; mainEl.style.color = "";
    mainEl.value = "";
    sideEl.disabled = false; sideEl.type = "number";
    sideEl.min = "0"; sideEl.max = "10";
    sideEl.style.background = ""; sideEl.style.color = "";
    sideEl.value = "";
  }
  if (waterEl) waterEl.value = "";
}

function renderSingleWriteScreen() {
  const container = document.getElementById("singleWriteContainer");
  if (!container) return;
  // [Claude修正 2026-10-16] 書きかけを消さない。ほかの端末が保存すると、入力欄から指が離れている間にこの画面が描き直され、書いた途中の文や数字が消えていた。
  // 同じ方・同じ日の描き直しなら入力中の値を戻す（保存した項目の欄と、方・日を変えたときは空欄に戻す）
  const swKey = `${gState.selectedResidentId || ""}|${gState.selectedDate || ""}`;
  const swKeep = {};
  const swClear = window._cpSwClearIds || [];
  window._cpSwClearIds = null;
  if (container.dataset.swKey === swKey) {
    container.querySelectorAll("input[id^='sw'], select[id^='sw'], textarea[id^='sw']").forEach(el => {
      if (el.id === "swResidentSelect" || el.disabled || swClear.includes(el.id)) return;
      if (el.type === "checkbox") { if (el.checked) swKeep[el.id] = true; }
      else if (el.value !== "") swKeep[el.id] = el.value;
    });
  }
  container.dataset.swKey = swKey;
  cpRenderSingleWriteScreenInner(container);
  if (Object.keys(swKeep).length) {
    if (swKeep.swMealType !== undefined) {
      const t = document.getElementById("swMealType");
      if (t) { t.value = swKeep.swMealType; cpOnSingleWriteMealTypeChange(); }
    }
    Object.keys(swKeep).forEach(id => {
      if (id === "swMealType") return;
      const el = document.getElementById(id);
      if (!el || el.disabled) return;
      if (el.type === "checkbox") el.checked = true; else el.value = swKeep[id];
    });
  }
  if (typeof renderQuickTemplates === "function") renderQuickTemplates();
  updateRecordCharCount();
}

function cpRenderSingleWriteScreenInner(container) {

  const res = gState.residents.find(r => r.id === gState.selectedResidentId);
  const activeResidents = (gState.residents || []).filter(r => r.status !== "退所");
  const dateStr = gState.selectedDate || getTodayStr();
  const staffName = cpLoginStaffName();
  const roleStr = cpStaffRoleOf(staffName) || "介護職";
  const isNurse = cpIsCurrentNurse();

  const resOptionsHtml = `<option value="">-- 利用者を選択 --</option>` + activeResidents.map(r =>
    `<option value="${r.id}" ${res && r.id === res.id ? "selected" : ""}>${escapeHtml(r.room_no)}号室 ${escapeHtml(r.name)} 様${r.status !== "在所" ? " (" + escapeHtml(r.status) + ")" : ""}</option>`
  ).join("");

  if (!res) {
    container.innerHTML = `
      <div class="cp-sw-sticky-bar">
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
          <span style="font-size:14px; font-weight:bold; color:#173f33;">入力する方：未選択</span>
          <select class="form-control" style="width:auto; min-width:210px; font-weight:bold;" onchange="if(this.value) selectResident(Number(this.value))">
            ${resOptionsHtml}
          </select>
        </div>
      </div>
      <div style="padding:28px; text-align:center; background:#f8faf9; border:1px dashed #cdd6d0; border-radius:8px; margin-top:12px;">
        <p style="font-size:14px; color:#4a5852; margin:0;">上の選択欄、または左の一覧から記録する利用者様を選んでください。</p>
      </div>
    `;
    return;
  }

  // 既存記録の取得（当日・対象利用者・取消されていないもの）
  const dayMeals = (db.data.meals || []).filter(m => !m.voided && m.resident_id === res.id && m.date === dateStr);
  const dayExcretions = (db.data.excretions || []).filter(e => !e.voided && e.resident_id === res.id && e.date === dateStr)
    .slice().sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  const dayVitals = cpDayVitals(res.id, dateStr);
  const dayBath = (db.data.baths || []).find(b => !b.voided && b.resident_id === res.id && b.date === dateStr);
  const dayTurns = (db.data.turns || []).filter(t => !t.voided && t.resident_id === res.id && t.date === dateStr)
    .slice().sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  const dayCareRecords = (db.data.care_records || []).filter(c => !c.voided && c.resident_id === res.id && (c.recorded_at || "").startsWith(dateStr))
    .slice().sort((a, b) => (b.recorded_at || "").localeCompare(a.recorded_at || ""));
  const dayNurseRecords = dayCareRecords.filter(c => c.category === "看護");

  // 1. 食事・水分の記入済み表示
  const mealsFilledHtml = dayMeals.length > 0
    ? `<div class="cp-filled-info-box">
        <div style="font-size:11.5px; font-weight:bold; color:#15803d; margin-bottom:4px;">【本日の記入済み（食事・水分）】</div>
        <div style="display:flex; flex-direction:column; gap:4px;">
          ${dayMeals.map(m => `
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; background:#fff; padding:4px 8px; border-radius:4px; border:1px solid #bbf7d0;">
              <div>${cpFilledBadgeHtml(cpFormatMealDetail(m), m.staff_name, m.time || "", m.edit_history)}</div>
              <button type="button" class="btn btn-secondary" style="font-size:11px; padding:2px 8px;" onclick="cpQuickEditMealRecord(${Number(m.id)})">訂正</button>
            </div>
          `).join("")}
        </div>
      </div>`
    : `<div style="font-size:11.5px; color:#64748b; margin-bottom:6px;">本日の食事・水分記録はまだありません。</div>`;

  // 2. 排泄の記入済み表示
  const excFilledHtml = dayExcretions.length > 0
    ? `<div class="cp-filled-info-box">
        <div style="font-size:11.5px; font-weight:bold; color:#15803d; margin-bottom:4px;">【本日の記入済み（排泄 ${dayExcretions.length}件）】</div>
        <div style="display:flex; flex-direction:column; gap:4px;">
          ${dayExcretions.map(e => `
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; background:#fff; padding:4px 8px; border-radius:4px; border:1px solid #bbf7d0;">
              <div>${cpFilledBadgeHtml((e.time ? e.time + " " : "") + cpFormatExcretionDetail(e), e.staff_name, e.time || "", e.edit_history)}</div>
              <button type="button" class="btn btn-secondary" style="font-size:11px; padding:2px 8px;" onclick="editExcretionRecord(${Number(e.id)})">訂正</button>
            </div>
          `).join("")}
        </div>
      </div>`
    : `<div style="font-size:11.5px; color:#64748b; margin-bottom:6px;">本日の排泄記録はまだありません。</div>`;

  // 3. バイタルの記入済み表示（看護師・介護職ともに表示）
  // [Claude修正 2026-10-16] バイタルは再測定ごとに追加。記録済みを全部出し、それぞれ「訂正」できる
  const vitalFilledHtml = dayVitals.length
    ? `<div class="cp-filled-info-box">
        <div style="font-size:11.5px; font-weight:bold; color:#15803d; margin-bottom:4px;">【本日の記入済み（バイタル ${dayVitals.length}回）】</div>
        <div style="display:flex; flex-direction:column; gap:4px;">
          ${dayVitals.map(v => `
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; background:#fff; padding:4px 8px; border-radius:4px; border:1px solid #bbf7d0;">
              <div>${cpFilledBadgeHtml(cpFormatVitalBrief(v) + (v.notes ? " (" + v.notes + ")" : ""), v.staff_name, v.time || "", v.edit_history)}</div>
              <button type="button" class="btn btn-secondary" style="font-size:11px; padding:2px 8px;" onclick="openPersonalVitalModal(${Number(v.id)})">訂正</button>
            </div>`).join("")}
        </div>
        <div style="font-size:11px; color:#5f6d66; margin-top:4px;">再測定は下の欄に入れて保存すると、別の記録として追加されます（前の測定も残ります）。打ち間違いは「訂正」から直してください。</div>
      </div>`
    : `<div style="font-size:11.5px; color:#64748b; margin-bottom:6px;">本日のバイタル記録はまだありません。</div>`;

  // 4. 入浴・体位変換の記入済み表示
  const bathFilledHtml = dayBath
    ? `<div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; background:#fff; padding:4px 8px; border-radius:4px; border:1px solid #bbf7d0; margin-bottom:4px;">
        <div>${cpFilledBadgeHtml(cpFormatBathDetail(dayBath), dayBath.staff_name, dayBath.time || "", dayBath.edit_history)}</div>
        <button type="button" class="btn btn-secondary" style="font-size:11px; padding:2px 8px;" onclick="cpQuickEditBathRecord(${Number(dayBath.id)})">訂正</button>
      </div>`
    : `<div style="font-size:11.5px; color:#64748b; margin-bottom:4px;">本日の入浴記録はまだありません。</div>`;

  const turnsFilledHtml = dayTurns.length > 0
    ? `<div style="display:flex; flex-direction:column; gap:4px; margin-top:4px;">
        ${dayTurns.map(t => `
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; background:#fff; padding:4px 8px; border-radius:4px; border:1px solid #bbf7d0;">
            <div>${cpFilledBadgeHtml(`${t.time || ""} 体位変換:${t.action || ""}${t.note ? " (" + t.note + ")" : ""}`, t.staff_name, t.time || "", t.edit_history)}</div>
            <button type="button" class="btn btn-secondary" style="font-size:11px; padding:2px 8px;" onclick="editSavedNightTurn(${Number(t.id)})">訂正</button>
          </div>
        `).join("")}
      </div>`
    : `<div style="font-size:11.5px; color:#64748b;">本日の体位変換記録はまだありません。</div>`;

  // 5. 時間＋あったこと（様子・特変）の記入済み表示
  const eventsFilledHtml = dayCareRecords.length > 0
    ? `<div class="cp-filled-info-box">
        <div style="font-size:11.5px; font-weight:bold; color:#15803d; margin-bottom:4px;">【本日の記入済み（様子・出来事・特変 ${dayCareRecords.length}件）】</div>
        <div style="display:flex; flex-direction:column; gap:4px;">
          ${dayCareRecords.map(c => {
            const tm = (c.recorded_at || "").slice(11, 16);
            return `
              <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; background:#fff; padding:4px 8px; border-radius:4px; border:1px solid #bbf7d0;">
                <div>${cpFilledBadgeHtml(`[${c.category || "介護"}] ${c.content || ""}`, c.staff_name, tm, c.edit_history)}</div>
                <button type="button" class="btn btn-secondary" style="font-size:11px; padding:2px 8px;" onclick="openEditCareRecordModal(${Number(c.id)})">訂正・取消</button>
              </div>
            `;
          }).join("")}
        </div>
      </div>`
    : `<div style="font-size:11.5px; color:#64748b; margin-bottom:6px;">本日の様子・出来事の記録はまだありません。</div>`;

  // 6. 看護の処置・観察セクション（看護師のみ表示）
  const nurseSectionHtml = isNurse
    ? `
      <div class="cp-sw-section" style="border-color:#86efac; background:#f0fdf4;">
        <div class="cp-sw-section-title" style="color:#166534;">
          <span>⑦ 看護の処置・観察（看護師専用欄）</span>
          <span class="badge" style="background:#166534; color:#fff; font-size:11px; padding:2px 8px;">看護師のみ表示</span>
        </div>
        ${dayNurseRecords.length > 0 ? `
          <div style="margin-bottom:8px; font-size:11.5px; color:#166534;">
            記入済みの看護記録: ${dayNurseRecords.length}件（上の様子・出来事欄または見る画面から訂正できます）
          </div>
        ` : ""}
        <div class="cp-sw-grid">
          <div>
            <label class="cp-sw-label">処置・観察の時刻（空欄なら現在時刻）</label>
            <input type="time" id="swNurseTime" class="form-control" value="">
          </div>
          <div>
            <label class="cp-sw-label">処置区分（任意）</label>
            <select id="swNurseType" class="form-control">
              <option value="" selected>選んでください（任意）</option>
              <option value="創傷・皮膚処置">創傷・皮膚処置</option>
              <option value="吸引・吸入">吸引・吸入</option>
              <option value="血糖測定・インスリン">血糖測定・インスリン</option>
              <option value="摘便・浣腸">摘便・浣腸</option>
              <option value="点滴・医療管理">点滴・医療管理</option>
              <option value="全身状態・症状観察">全身状態・症状観察</option>
              <option value="医師連絡・往診対応">医師連絡・往診対応</option>
            </select>
          </div>
        </div>
        <div style="margin-top:8px;">
          <label class="cp-sw-label">看護の処置・観察内容</label>
          <textarea id="swNurseContent" class="form-control" rows="2" placeholder="例: 仙骨部発赤に対しアズノール軟膏塗布・ガーゼ保護。呼吸音清、喘鳴なし。" style="width:100%;"></textarea>
        </div>
        <div class="cp-sw-section-save"><button type="button" class="btn btn-secondary" style="font-size:12.5px; padding:4px 14px; border:1px solid #1e5b47; color:#1e5b47; background:#fff; font-weight:bold;" onclick="saveSingleWriteScreen('nurse')">この項目だけ保存</button></div>
      </div>
    `
    : "";

  container.innerHTML = `
    <!-- スクロールしても上に残る対象利用者・日付バー -->
    <div class="cp-sw-sticky-bar">
      <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
        <span style="font-size:14.5px; font-weight:bold; color:#173f33;">
          入力する方：<span style="color:#0284c7; text-decoration:underline;">${escapeHtml(res.name)} 様（${escapeHtml(res.room_no)}号室）</span>
        </span>
        <select id="swResidentSelect" class="form-control" style="width:auto; min-width:200px; font-size:13px; font-weight:bold; padding:4px 8px;" onchange="if(this.value) selectResident(Number(this.value))">
          ${resOptionsHtml}
        </select>
      </div>
      <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
        <span style="font-size:12px; background:#eef2ef; color:#22302b; padding:3px 8px; border-radius:4px; font-weight:bold;">
          対象日: ${escapeHtml(dateStr)} (${getWeekDayJp(dateStr)})
        </span>
        <span style="font-size:12px; background:${isNurse ? '#dcfce7' : '#e0f2fe'}; color:${isNurse ? '#166534' : '#0369a1'}; padding:3px 8px; border-radius:4px; font-weight:bold;">
          記録者: ${escapeHtml(staffName)}（${escapeHtml(roleStr)}）
        </span>
        <button type="button" class="btn btn-secondary" style="font-size:12px; padding:4px 10px;" onclick="switchCareTab('record')">
          個別記録（見る）へ切替
        </button>
      </div>
    </div>

    <p style="font-size:12.5px; color:#4a5852; margin:8px 0 12px 0; line-height:1.5;">
      ※すべての入力欄は<strong>空欄</strong>から始まります。<strong>入力した項目だけ</strong>が保存され、空欄の項目は保存されません。すでにチェック表などで書かれた項目は「記入済み」と表示されます。
    </p>

    <!-- 1. 時間＋あったこと（様子・出来事・特変） -->
    <div class="cp-sw-section" style="border-left:4px solid #1e5b47;">
      <div class="cp-sw-section-title">
        <span>① 時間＋あったこと（様子・出来事・特変）</span>
        <span style="font-size:11.5px; font-weight:normal; color:#5f6d66;">個別記録（見る）に出ます</span>
      </div>
      ${eventsFilledHtml}
      <div class="cp-sw-grid" style="align-items:end;">
        <div>
          <label class="cp-sw-label">時間（例: 14:20 / 空欄なら現在時刻）</label>
          <input type="time" id="swEventTime" class="form-control" value="">
        </div>
        <div>
          <label class="cp-sw-label">区分（特変に印を付けると自動で「特変」になります）</label>
          <select id="swEventCategory" class="form-control">
            <option value="介護" selected>介護（日常の様子）</option>
            <option value="連絡">連絡</option>
            <option value="家族">家族</option>
            <option value="リハビリ">リハビリ</option>
            <option value="巡視">巡視</option>
            ${isNurse ? `<option value="看護">看護</option>` : ""}
          </select>
        </div>
        <div>
          <label style="display:inline-flex; align-items:center; gap:6px; background:#fee2e2; color:#991b1b; border:1px solid #fca5a5; padding:7px 12px; border-radius:6px; font-weight:bold; font-size:13px; cursor:pointer;">
            <input type="checkbox" id="swEventTokukan" style="width:16px; height:16px;">
            特変の印を付ける
          </label>
        </div>
      </div>
      <!-- [Claude修正 2026-10-16] 定型文・全画面・ヒヤリハットの作成をここへまとめた（前は下にたたんだ補助の欄にあった） -->
      <div style="margin-top:8px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; margin-bottom:4px;">
          <label class="cp-sw-label" style="margin:0;">あったこと・様子（例：14:20 居室で転びそうになり職員が支えた）</label>
          <span style="font-size:12px; color:var(--text-muted);">文字数: <strong id="swEventCharCount" style="color:#1e5b47;">0</strong> 字</span>
        </div>
        <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center; margin-bottom:6px;">
          <span style="font-size:12px; color:#4a5852; font-weight:bold;">定型文:</span>
          <div class="templates-list" id="quickTemplatesList" style="margin:0; display:inline-flex; flex-wrap:wrap; gap:4px;"></div>
          <button type="button" class="btn btn-secondary" style="font-size:12px; padding:2px 8px; background:#f1f6f3; color:#1a4f3d; border:1px solid #c9e0d5;" onclick="openTemplateManageModal()">定型文の編集・追加</button>
        </div>
        <textarea id="swEventContent" class="form-control" rows="3" placeholder="例：14:20 居室で転びそうになり職員が支えた" style="width:100%; resize:vertical; overflow-y:hidden; line-height:1.6;" oninput="updateRecordCharCount()"></textarea>
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:6px;">
          <button type="button" class="btn btn-secondary" style="font-size:12.5px; background:#f1f6f3; color:#1a4f3d; border:1px solid #c9e0d5;" onclick="openFullscreenRecord()">全画面で大きく書く</button>
          <button type="button" class="btn btn-secondary" style="font-size:12.5px;" onclick="openIncidentFromRecord()">ヒヤリハット・事故報告書を作成</button>
        </div>
      </div>
      <div class="cp-sw-section-save"><button type="button" class="btn btn-secondary" style="font-size:12.5px; padding:4px 14px; border:1px solid #1e5b47; color:#1e5b47; background:#fff; font-weight:bold;" onclick="saveSingleWriteScreen('event')">この項目だけ保存</button></div>
    </div>

    <!-- 2. バイタル（看護師・介護職ともに表示） -->
    <div class="cp-sw-section">
      <div class="cp-sw-section-title">
        <span>② バイタル（体温・血圧・脈拍・SpO2）</span>
        <span style="font-size:11.5px; font-weight:normal; color:#5f6d66;">バイタルチェック表と連動（看護師・介護職共通）</span>
      </div>
      ${vitalFilledHtml}
      <div class="cp-sw-grid">
        <div>
          <label class="cp-sw-label">体温 (℃)</label>
          <input type="number" step="0.1" id="swVitalTemp" class="form-control" value="" placeholder="例: 36.5" onblur="formatTempInput(this)" oninput="formatTempInput(this)">
        </div>
        <div>
          <label class="cp-sw-label">血圧 上 (mmHg)</label>
          <input type="number" id="swVitalBpHigh" class="form-control" value="" placeholder="上 (例: 128)">
        </div>
        <div>
          <label class="cp-sw-label">血圧 下 (mmHg)</label>
          <input type="number" id="swVitalBpLow" class="form-control" value="" placeholder="下 (例: 74)">
        </div>
        <div>
          <label class="cp-sw-label">脈拍 (bpm)</label>
          <input type="number" id="swVitalPulse" class="form-control" value="" placeholder="例: 72">
        </div>
        <div>
          <label class="cp-sw-label">SpO2 (%)</label>
          <input type="number" id="swVitalSpo2" class="form-control" value="" placeholder="例: 97">
        </div>
        <div style="display:flex; align-items:flex-end;">
          <label style="display:inline-flex; align-items:center; gap:6px; padding:7px 10px; background:#fef3c7; color:#92400e; border:1px solid #fde68a; border-radius:6px; font-size:12.5px; font-weight:bold; cursor:pointer;">
            <input type="checkbox" id="swVitalUnusual"> バイタル特変
          </label>
        </div>
      </div>
      <div class="cp-sw-section-save"><button type="button" class="btn btn-secondary" style="font-size:12.5px; padding:4px 14px; border:1px solid #1e5b47; color:#1e5b47; background:#fff; font-weight:bold;" onclick="saveSingleWriteScreen('vital')">この項目だけ保存</button></div>
    </div>

    <!-- 3. 食事・水分 -->
    <div class="cp-sw-section">
      <div class="cp-sw-section-title">
        <span>③ 食事量・水分</span>
        <span style="font-size:11.5px; font-weight:normal; color:#5f6d66;">食事・水分チェック表と連動</span>
      </div>
      ${mealsFilledHtml}
      <div id="swMealCurrentStatus"></div>
      <div class="cp-sw-grid" style="margin-top:6px;">
        <div>
          <label class="cp-sw-label">食事区分</label>
          <select id="swMealType" class="form-control" onchange="cpOnSingleWriteMealTypeChange()">
            <option value="" selected>選んでください</option>
            <option value="朝食">朝食</option>
            <option value="昼食">昼食</option>
            <option value="夕食">夕食</option>
            <option value="おやつ">おやつ</option>
            <option value="その他">その他（水分のみ）</option>
          </select>
        </div>
        <div>
          <label class="cp-sw-label">主食（0〜10割 / おやつ量）</label>
          <input type="number" id="swMealMain" class="form-control" min="0" max="10" value="" placeholder="0-10">
        </div>
        <div>
          <label class="cp-sw-label">副食（0〜10割）</label>
          <input type="number" id="swMealSide" class="form-control" min="0" max="10" value="" placeholder="0-10">
        </div>
        <div>
          <label class="cp-sw-label">水分量 (ml)</label>
          <input type="number" id="swMealWater" class="form-control" step="50" value="" placeholder="例: 200">
        </div>
      </div>
      <div class="cp-sw-section-save"><button type="button" class="btn btn-secondary" style="font-size:12.5px; padding:4px 14px; border:1px solid #1e5b47; color:#1e5b47; background:#fff; font-weight:bold;" onclick="saveSingleWriteScreen('meal')">この項目だけ保存</button></div>
    </div>

    <!-- 4. 排泄 -->
    <div class="cp-sw-section">
      <div class="cp-sw-section-title">
        <span>④ 排泄</span>
        <span style="font-size:11.5px; font-weight:normal; color:#5f6d66;">排泄チェック表と連動</span>
      </div>
      ${excFilledHtml}
      <div class="cp-sw-grid">
        <div>
          <label class="cp-sw-label">時間（空欄なら現在時刻）</label>
          <input type="time" id="swExcTime" class="form-control" value="">
        </div>
        <div>
          <label class="cp-sw-label">排尿</label>
          <select id="swExcUrine" class="form-control">
            <option value="" selected>選んでください</option>
            <option value="1">あり (＋)</option>
            <option value="0">なし (ー)</option>
            <option value="2">バルーン測定</option>
          </select>
        </div>
        <div>
          <label class="cp-sw-label">便の量</label>
          <select id="swExcStoolAmount" class="form-control">
            <option value="" selected>選んでください</option>
            <option value="なし">なし</option>
            <option value="付着">付着</option>
            <option value="微量">微量</option>
            <option value="少量">少量</option>
            <option value="中量">中量</option>
            <option value="多量">多量</option>
          </select>
        </div>
        <div>
          <label class="cp-sw-label">便の性状</label>
          <select id="swExcStoolCond" class="form-control">
            <option value="" selected>選んでください</option>
            <option value="なし">なし</option>
            <option value="普通便">普通便</option>
            <option value="軟便">軟便</option>
            <option value="水様便">水様便</option>
            <option value="泥状便">泥状便</option>
            <option value="硬便">硬便 (コロコロ)</option>
          </select>
        </div>
        <div>
          <label class="cp-sw-label">備考（失禁・パッド交換など）</label>
          <input type="text" id="swExcNotes" class="form-control" value="" placeholder="備考">
        </div>
      </div>
      <div class="cp-sw-section-save"><button type="button" class="btn btn-secondary" style="font-size:12.5px; padding:4px 14px; border:1px solid #1e5b47; color:#1e5b47; background:#fff; font-weight:bold;" onclick="saveSingleWriteScreen('exc')">この項目だけ保存</button></div>
    </div>

    <!-- 5. 入浴 （[Claude修正 2026-10-16] 入浴と体位変換は別のことなので分けた） -->
    <div class="cp-sw-section">
      <div class="cp-sw-section-title">
        <span>⑤ 入浴</span>
        <span style="font-size:11.5px; font-weight:normal; color:#5f6d66;">入浴チェック表と連動</span>
      </div>
      <div class="cp-filled-info-box">
        ${bathFilledHtml}
      </div>
      <div class="cp-sw-grid">
        <div>
          <label class="cp-sw-label">入浴方法</label>
          <select id="swBathType" class="form-control">
            <option value="" selected>選んでください</option>
            <option value="一般浴">一般浴</option>
            <option value="特浴">特浴(機械浴)</option>
            <option value="清拭">清拭</option>
            <option value="見合わせ">見合わせ</option>
          </select>
        </div>
        <div>
          <label class="cp-sw-label">入浴時の処置・軟膏・様子</label>
          <input type="text" id="swBathNotes" class="form-control" value="" placeholder="例: 仙骨部プロペト塗布">
        </div>
      </div>
      <div class="cp-sw-section-save"><button type="button" class="btn btn-secondary" style="font-size:12.5px; padding:4px 14px; border:1px solid #1e5b47; color:#1e5b47; background:#fff; font-weight:bold;" onclick="saveSingleWriteScreen('bath')">この項目だけ保存</button></div>
    </div>

    <!-- 6. 体位変換 -->
    <div class="cp-sw-section">
      <div class="cp-sw-section-title">
        <span>⑥ 体位変換</span>
        <span style="font-size:11.5px; font-weight:normal; color:#5f6d66;">体位変換表と連動</span>
      </div>
      <div class="cp-filled-info-box">
        ${turnsFilledHtml}
      </div>
      <div class="cp-sw-grid">
        <div>
          <label class="cp-sw-label">体位変換（時間帯）</label>
          <select id="swTurnTime" class="form-control">
            <option value="" selected>選んでください</option>
            <option value="22:00">22:00</option>
            <option value="00:00">00:00</option>
            <option value="02:00">02:00</option>
            <option value="04:00">04:00</option>
            <option value="06:00">06:00</option>
          </select>
        </div>
        <div>
          <label class="cp-sw-label">体位変換（向き・内容）</label>
          <select id="swTurnAction" class="form-control">
            <option value="" selected>選んでください</option>
            <option value="安眠中">安眠中</option>
            <option value="左側臥位">左側臥位</option>
            <option value="右側臥位">右側臥位</option>
            <option value="仰臥位">仰臥位</option>
            <option value="おむつ交換">おむつ交換</option>
          </select>
        </div>
        <div>
          <label class="cp-sw-label">体位変換時の様子・特変メモ</label>
          <input type="text" id="swTurnNote" class="form-control" value="" placeholder="例: 呼吸状態落ち着いている">
        </div>
      </div>
      <div class="cp-sw-section-save"><button type="button" class="btn btn-secondary" style="font-size:12.5px; padding:4px 14px; border:1px solid #1e5b47; color:#1e5b47; background:#fff; font-weight:bold;" onclick="saveSingleWriteScreen('turn')">この項目だけ保存</button></div>
    </div>

    <!-- 7. 看護の処置・観察（看護師のみ） -->
    ${nurseSectionHtml}

    <!-- まとめて保存ボタン -->
    <div style="margin-top:14px; display:flex; justify-content:flex-end; gap:10px; align-items:center; flex-wrap:wrap; padding:12px 16px; background:#f1f6f3; border:1px solid #a9cfbf; border-radius:8px;">
      <span style="font-size:12.5px; color:#173f33; font-weight:bold;">入力した欄だけをまとめて保存します（空欄の項目は保存しません）</span>
      <button type="button" id="btnSaveSingleWrite" class="btn btn-primary" style="font-size:14px; font-weight:bold; padding:10px 24px;" onclick="saveSingleWriteScreen()">
        入力した項目をまとめて保存
      </button>
    </div>
  `;
}

// [Claude修正 2026-10-16] 項目ごとに保存できるようにした（only に項目名: event/vital/meal/exc/bath/turn/nurse）。
// まとめて保存で途中の項目が止まっても、ほかの項目は保存し、止まった項目の入力は残す
const CP_SW_SECTION_IDS = {
  event: ["swEventTime", "swEventCategory", "swEventTokukan", "swEventContent"],
  vital: ["swVitalTemp", "swVitalBpHigh", "swVitalBpLow", "swVitalPulse", "swVitalSpo2", "swVitalUnusual"],
  meal: ["swMealType", "swMealMain", "swMealSide", "swMealWater"],
  exc: ["swExcTime", "swExcUrine", "swExcStoolAmount", "swExcStoolCond", "swExcNotes"],
  bath: ["swBathType", "swBathNotes"],
  turn: ["swTurnTime", "swTurnAction", "swTurnNote"],
  nurse: ["swNurseTime", "swNurseType", "swNurseContent"]
};
const CP_SW_SECTION_LABELS = { event: "様子・出来事", vital: "バイタル", meal: "食事・水分", exc: "排泄", bath: "入浴", turn: "体位変換", nurse: "看護の処置・観察" };

function saveSingleWriteScreen(only) {
  const res = gState.residents.find(r => r.id === gState.selectedResidentId);
  if (!res) {
    alert("記録する利用者を選択してください。");
    return;
  }
  const resId = res.id;
  const dateStr = gState.selectedDate || getTodayStr();
  const staff = cpLedgerStaff();
  const nowTime = new Date().toTimeString().slice(0, 5);
  const savedItems = [];
  let idOffset = 1;

  const sec = {};
  sec.event = () => {
    // 1. 時間＋あったこと（様子・特変）
    const evtTime = (document.getElementById("swEventTime")?.value || "").trim();
    const evtCatSel = (document.getElementById("swEventCategory")?.value || "介護").trim();
    const evtTokukan = Boolean(document.getElementById("swEventTokukan")?.checked);
    const evtContent = (document.getElementById("swEventContent")?.value || "").trim();

    if (evtContent) {
      const finalCat = evtTokukan ? "特変" : (evtCatSel || "介護");
      const recTime = evtTime || nowTime;
      if (!Array.isArray(db.data.care_records)) db.data.care_records = [];
      db.data.care_records.unshift({
        id: Date.now() + (idOffset++),
        recorded_at: `${dateStr} ${recTime}`,
        resident_id: resId,
        category: finalCat,
        content: evtContent,
        staff_name: staff
      });
      if (finalCat === "特変" || finalCat === "連絡") {
        if (!Array.isArray(db.data.notebooks)) db.data.notebooks = [];
        db.data.notebooks.unshift({
          id: Date.now() + (idOffset++),
          date: dateStr,
          resident_id: resId,
          content: `［${finalCat}］(${res.room_no}号室 ${res.name} 様) ${evtContent}`,
          staff_name: staff,
          status: "未対応"
        });
      }
      savedItems.push(`様子・出来事（${finalCat}）`);
    }
  };
  sec.vital = () => {
    // 2. バイタル（看護師・介護職共通）
    const tempInput = document.getElementById("swVitalTemp");
    if (tempInput) formatTempInput(tempInput);
    const vTemp = normalizeTempValue(tempInput ? tempInput.value : "");
    const vBpH = (document.getElementById("swVitalBpHigh")?.value || "").trim();
    const vBpL = (document.getElementById("swVitalBpLow")?.value || "").trim();
    const vPulse = (document.getElementById("swVitalPulse")?.value || "").trim();
    const vSpo2 = (document.getElementById("swVitalSpo2")?.value || "").trim();
    const vUnusual = Boolean(document.getElementById("swVitalUnusual")?.checked);

    if (vTemp || vBpH || vBpL || vPulse || vSpo2) {
      if (!Array.isArray(db.data.vitals)) db.data.vitals = [];
      // [Claude修正 2026-10-16] 再測定は新しい記録として追加する（前の測定も残る。打ち間違いは記入済みの「訂正」から）
      const existingVital = null;
      const newTemp = vTemp ? parseFloat(vTemp) : (existingVital ? existingVital.temperature : null);
      const newBpH = vBpH ? parseInt(vBpH, 10) : (existingVital ? existingVital.bp_high : null);
      const newBpL = vBpL ? parseInt(vBpL, 10) : (existingVital ? existingVital.bp_low : null);
      const newPulse = vPulse ? parseInt(vPulse, 10) : (existingVital ? existingVital.pulse : null);
      const newSpo2 = vSpo2 ? parseInt(vSpo2, 10) : (existingVital ? existingVital.spo2 : null);

      if (existingVital) {
        const reason = cpPromptEditReason("バイタル記録", cpFormatVitalBrief(existingVital));
        if (reason === null) return "abort";
        const oldCopy = JSON.parse(JSON.stringify(existingVital));
        existingVital.time = nowTime;
        existingVital.temperature = newTemp;
        existingVital.bp_high = newBpH;
        existingVital.bp_low = newBpL;
        existingVital.pulse = newPulse;
        existingVital.spo2 = newSpo2;
        existingVital.is_unusual = (vUnusual || cpIsUnusualVital(res, existingVital)) ? 1 : 0;
        existingVital.staff_name = staff;
        cpAppendEditHistory(existingVital, oldCopy, ["time", "temperature", "bp_high", "bp_low", "pulse", "spo2", "is_unusual"], reason);
        savedItems.push("バイタル（訂正）");
      } else {
        const vitalObj = {
          id: Date.now() + (idOffset++),
          resident_id: resId,
          date: dateStr,
          time: nowTime,
          temperature: newTemp,
          bp_high: newBpH,
          bp_low: newBpL,
          pulse: newPulse,
          spo2: newSpo2,
          is_unusual: 0,
          staff_name: staff
        };
        vitalObj.is_unusual = (vUnusual || cpIsUnusualVital(res, vitalObj)) ? 1 : 0;
        db.data.vitals.push(vitalObj);
        savedItems.push("バイタル");
      }
    }
  };
  sec.meal = () => {
    // 3. 食事・水分
    const mType = (document.getElementById("swMealType")?.value || "").trim();
    const mMainRaw = (document.getElementById("swMealMain")?.value || "").trim();
    const mSideRaw = (document.getElementById("swMealSide")?.value || "").trim();
    const mWaterRaw = (document.getElementById("swMealWater")?.value || "").trim();
    const hasMealInput = (mMainRaw !== "" && mMainRaw !== "ー") || (mSideRaw !== "" && mSideRaw !== "ー") || mWaterRaw !== "";

    if (mType && hasMealInput) {
      if (!Array.isArray(db.data.meals)) db.data.meals = [];
      let mainVal = null;
      let sideVal = null;
      if (mType === "その他") {
        mainVal = null;
        sideVal = null;
      } else if (mType === "おやつ") {
        mainVal = (mMainRaw !== "" && mMainRaw !== "ー" && !isNaN(parseInt(mMainRaw, 10))) ? parseInt(mMainRaw, 10) : null;
        sideVal = null;
      } else {
        mainVal = (mMainRaw !== "" && mMainRaw !== "ー" && !isNaN(parseInt(mMainRaw, 10))) ? parseInt(mMainRaw, 10) : null;
        sideVal = (mSideRaw !== "" && mSideRaw !== "ー" && !isNaN(parseInt(mSideRaw, 10))) ? parseInt(mSideRaw, 10) : null;
      }
      const waterVal = (mWaterRaw !== "" && !isNaN(parseInt(mWaterRaw, 10))) ? parseInt(mWaterRaw, 10) : 0;

      // [Claude修正 2026-10-16] 1日1回なのは朝食・昼食・夕食だけ。その他（水分）・おやつは何度でも記録できる
      const existingMeal = ["朝食", "昼食", "夕食"].includes(mType) ? db.data.meals.find(m => !m.voided && m.date === dateStr && m.resident_id === resId && m.meal_type === mType) : null;
      if (existingMeal) {
        const reason = cpPromptEditReason(`${mType}の記録`, cpFormatMealDetail(existingMeal));
        if (reason === null) return "abort";
        const oldCopy = JSON.parse(JSON.stringify(existingMeal));
        existingMeal.main_dish_ratio = mainVal;
        existingMeal.side_dish_ratio = sideVal;
        existingMeal.water_ml = waterVal;
        existingMeal.time = nowTime;
        existingMeal.staff_name = staff;
        cpAppendEditHistory(existingMeal, oldCopy, ["main_dish_ratio", "side_dish_ratio", "water_ml", "time"], reason);
        savedItems.push(`${mType}（訂正）`);
      } else {
        db.data.meals.push({
          id: Date.now() + (idOffset++),
          date: dateStr,
          time: nowTime,
          meal_type: mType,
          resident_id: resId,
          main_dish_ratio: mainVal,
          side_dish_ratio: sideVal,
          water_ml: waterVal,
          staff_name: staff
        });
        savedItems.push(mType);
      }
    } else if (!mType && hasMealInput) {
      alert("食事量または水分量を入力した場合は、「食事区分（朝食・昼食など）」も選んでください。");
      return "abort";
    }
  };
  sec.exc = () => {
    // 4. 排泄
    const eTime = (document.getElementById("swExcTime")?.value || "").trim();
    const eUrine = (document.getElementById("swExcUrine")?.value || "").trim();
    const eAmount = (document.getElementById("swExcStoolAmount")?.value || "").trim();
    const eCond = (document.getElementById("swExcStoolCond")?.value || "").trim();
    const eNotes = (document.getElementById("swExcNotes")?.value || "").trim();

    if (eUrine !== "" || eAmount !== "" || eCond !== "" || eNotes !== "") {
      if (!Array.isArray(db.data.excretions)) db.data.excretions = [];
      // [Claude修正 2026-10-16] 書いていない欄は「未記入」のまま残す（空欄を「排尿なし」「便なし」「普通便」にしない）
      const amount = eAmount;
      const cond = eCond || (amount === "なし" ? "なし" : "");
      db.data.excretions.unshift({
        id: Date.now() + (idOffset++),
        date: dateStr,
        time: eTime || nowTime,
        resident_id: resId,
        urine_flag: eUrine !== "" ? parseInt(eUrine, 10) : null,
        stool_amount: amount,
        stool_condition: cond,
        notes: eNotes,
        staff_name: staff
      });
      savedItems.push("排泄");
    }
  };
  sec.bath = () => {
    // 5. 入浴
    const bType = (document.getElementById("swBathType")?.value || "").trim();
    const bNotes = (document.getElementById("swBathNotes")?.value || "").trim();
    if (bType !== "" || bNotes !== "") {
      if (!bType) {
        alert("入浴の処置・様子を入力した場合は、「入浴方法」も選んでください。");
        return "abort";
      }
      if (!Array.isArray(db.data.baths)) db.data.baths = [];
      const existingBath = db.data.baths.find(b => !b.voided && b.date === dateStr && b.resident_id === resId);
      if (existingBath) {
        const reason = cpPromptEditReason("入浴記録", cpFormatBathDetail(existingBath));
        if (reason === null) return "abort";
        const oldCopy = JSON.parse(JSON.stringify(existingBath));
        existingBath.bath_type = bType;
        existingBath.ointment_notes = bNotes;
        existingBath.time = nowTime;
        existingBath.staff_name = staff;
        cpAppendEditHistory(existingBath, oldCopy, ["bath_type", "ointment_notes", "time"], reason);
        savedItems.push("入浴（訂正）");
      } else {
        db.data.baths.push({
          id: Date.now() + (idOffset++),
          date: dateStr,
          time: nowTime,
          resident_id: resId,
          bath_type: bType,
          ointment_notes: bNotes,
          staff_name: staff
        });
        savedItems.push("入浴");
      }
    }
  };
  sec.turn = () => {
    // 6. 体位変換
    const tTime = (document.getElementById("swTurnTime")?.value || "").trim();
    const tAction = (document.getElementById("swTurnAction")?.value || "").trim();
    const tNote = (document.getElementById("swTurnNote")?.value || "").trim();
    if (tTime !== "" || tAction !== "" || tNote !== "") {
      if (!tTime || !tAction) {
        alert("体位変換を記録する場合は、「時間帯」と「向き・内容」の両方を選んでください。");
        return "abort";
      }
      if (!Array.isArray(db.data.turns)) db.data.turns = [];
      const existingTurn = db.data.turns.find(t => !t.voided && t.date === dateStr && t.resident_id === resId && t.time === tTime);
      const tpls = getNightTurnTemplates();
      const tpl = tpls[tAction] || DEFAULT_NIGHT_TURN_TEMPLATES[tAction] || `【{time} 定時巡視・体位変換】訪室確認。${tAction}実施。`;
      let contentText = tpl.replace(/\{time\}/g, tTime).replace(/\{action\}/g, tAction);
      if (tNote) contentText += ` 【様子】${tNote}`;

      if (existingTurn) {
        const reason = cpPromptEditReason(`${tTime}の体位変換記録`, `${existingTurn.action}${existingTurn.note ? " (" + existingTurn.note + ")" : ""}`);
        if (reason === null) return "abort";
        const oldCopy = JSON.parse(JSON.stringify(existingTurn));
        existingTurn.action = tAction;
        existingTurn.note = tNote;
        existingTurn.staff_name = staff;
        cpAppendEditHistory(existingTurn, oldCopy, ["action", "note"], reason);
        savedItems.push(`体位変換 ${tTime}（訂正）`);
      } else {
        db.data.turns.push({
          id: Date.now() + (idOffset++),
          date: dateStr,
          time: tTime,
          resident_id: resId,
          action: tAction,
          note: tNote,
          staff_name: staff
        });
        db.data.care_records.unshift({
          id: Date.now() + (idOffset++),
          recorded_at: `${dateStr} ${tTime}`,
          resident_id: resId,
          category: "巡視",
          content: contentText,
          staff_name: staff,
          auto_night_turn: true
        });
        if (tNote) {
          db.data.care_records.unshift({
            id: Date.now() + (idOffset++),
            recorded_at: `${dateStr} ${tTime}`,
            resident_id: resId,
            category: "特変",
            content: contentText,
            staff_name: staff,
            auto_night_turn: true
          });
        }
        savedItems.push(`体位変換 ${tTime}`);
      }
      initNightTurnDrafts(true);
    }
  };
  sec.nurse = () => {
    // 7. 看護の処置・観察（看護師のみ）
    if (cpIsCurrentNurse()) {
      const nTime = (document.getElementById("swNurseTime")?.value || "").trim();
      const nType = (document.getElementById("swNurseType")?.value || "").trim();
      const nContent = (document.getElementById("swNurseContent")?.value || "").trim();
      if (nContent) {
        const prefix = nType ? `【${nType}】` : "【看護処置・観察】";
        db.data.care_records.unshift({
          id: Date.now() + (idOffset++),
          recorded_at: `${dateStr} ${nTime || nowTime}`,
          resident_id: resId,
          category: "看護",
          content: `${prefix}${nContent}`,
          staff_name: staff
        });
        savedItems.push("看護の処置・観察");
      }
    }
  };

  const keys = (only && CP_SW_SECTION_IDS[only]) ? [only] : Object.keys(CP_SW_SECTION_IDS);
  const savedKeys = [];
  const stoppedKeys = [];
  for (const k of keys) {
    const n0 = savedItems.length;
    if (sec[k]() === "abort") { stoppedKeys.push(k); continue; }
    if (savedItems.length > n0) savedKeys.push(k);
  }

  if (savedItems.length === 0) {
    if (stoppedKeys.length === 0) {
      alert(only ? `「${CP_SW_SECTION_LABELS[only]}」の欄に入力してから保存してください。` : "入力された項目がありません。記録したい欄に入力してから保存してください（空欄の項目は保存されません）。");
    }
    return;
  }

  db.save();
  // 保存した項目の欄だけ空欄に戻す（ほかの項目の書きかけは残す）
  window._cpSwClearIds = savedKeys.reduce((a, k) => a.concat(CP_SW_SECTION_IDS[k]), []);
  loadDateRecords(dateStr);
  renderCalendar();
  alert(`【${res.name} 様】の記録（${savedItems.join("・")}）を保存しました！` + (stoppedKeys.length ? `\n\n保存しなかった項目（${stoppedKeys.map(k => CP_SW_SECTION_LABELS[k]).join("・")}）の入力は残っています。` : ""));
}

window.renderSingleWriteScreen = renderSingleWriteScreen;
window.saveSingleWriteScreen = saveSingleWriteScreen;
window.cpOnSingleWriteMealTypeChange = cpOnSingleWriteMealTypeChange;
window.cpBuildUnifiedResidentRecords = cpBuildUnifiedResidentRecords;
window.cpQuickEditMealRecord = cpQuickEditMealRecord;
window.cpQuickEditBathRecord = cpQuickEditBathRecord;
window.cpShowGenericEditHistory = cpShowGenericEditHistory;
window.editExcretionRecord = editExcretionRecord;
window.editSavedNightTurn = editSavedNightTurn;

