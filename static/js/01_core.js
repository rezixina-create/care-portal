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
 "units", "unit_logs", "settings_logs", "contract_docs", "contract_doc_types", "billing_overrides",
 "care_plans", "qualification_master", "dementia_assessments", // [Antigravity実装 2026-10-21] ケアプラン・資格研修マスタ・認知症高齢者自立度
 "life_assessments" // [Claude修正] LIFE の評価（ログイン直後から入れ物があるようにして、画面を開いただけで変更扱いにならないようにする）
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
 // [Claude修正 2026-10-18] ログインは職員IDとパスワードだけで行うので、職員ごとに別のIDを振る（aaaa, bbbb, … の順で空いているもの）
 d.staff_accounts.push({ id: nm, staff_name: nm, staff_id: cpNextFreeLoginId(d.staff_accounts), password: "0000", is_custom: false, updated_at: "" });
 }
 });
 cpDedupeLoginIds(d.staff_accounts);
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
 // [Claude修正] 短い名前の置き換えと見本の職員の追加は、職員が0人のとき（初めて起動したとき。ログインできるように）と、短い名前の職員がいる古い形のデータのときだけにする（毎回だと、削除した職員が読み込みのたびに戻っていた）
 const cpLegacyShortNames = ["施設長", "木村", "田中", "鈴木", "山田", "佐藤", "高橋", "伊藤", "渡辺", "中村", "小林"];
 if (d.stamps.length === 0 || d.stamps.some(s => cpLegacyShortNames.includes(s && (s.name || s)))) {
 // 既存の短縮名をフルネームに置換
 d.stamps.forEach(s => {
 const curName = s.name || s;
 if (nameMap[curName]) {
 s.name = nameMap[curName];
 }
 });

 // 15名フルネーム体制の定義（＋計画作成担当者）
 const fullStaffDefaults = [
 { name: "木村 健一", role: "管理者" },
 { name: "鈴木 美智子", role: "主任看護師" },
 { name: "加藤 由美", role: "看護師" },
 { name: "小林 恵子", role: "計画作成担当者（ケアマネ）" }, // [Antigravity実装 2026-10-19]
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
 }
 d.stamps = sortStaffList(d.stamps);
 }

 if (!d.monthly_shifts || typeof d.monthly_shifts !== "object") {
 d.monthly_shifts = {};
 }
 // [Claude修正] 希望休・同じ日に入れない組の見本を本番のデータに入れない（見本は initSeedData へ。実在しない職員の希望休も入っていた）
 if (!Array.isArray(d.shift_hope_offs)) {
  d.shift_hope_offs = [];
 }
 if (!Array.isArray(d.shift_ng_pairs)) {
 d.shift_ng_pairs = [];
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
  life_assessments: "LIFE の評価", residents: "利用者の情報（バイタルの目安・ケアプラン目標・基本方針）", care_plans: "ケアプラン",
  stamps: "職員の登録", staff_accounts: "ID・パスワード", shift_hope_offs: "希望休" };
 const label = LABEL[k] || k;
 const who = (info && info.who) || "決まった職種の方";
 if (!this._forbidShown) this._forbidShown = {};
 if (!this._forbidShown[k]) {
  this._forbidShown[k] = true;
  setTimeout(() => alert(`保存できない変更がありました。\n「${label}」を変えられるのは${who}です。\nこの端末での変更は元に戻しました。`), 0);
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
    billing_overrides: [],
    care_plans: [] // [Antigravity実装 2026-10-19] ケアプラン（版ごとの記録）
 };
 this.storeLocalCopy(JSON.stringify(seed));
  // [Claude修正] 希望休・同じ日に入れない組の見本は、初めて起動したデモのときだけ
  seed.shift_hope_offs = [
   { id: 1, year_month: "2026-10", staff_name: "佐藤 健太", day: 15, reason: "通院のため" },
   { id: 2, year_month: "2026-10", staff_name: "小林 亮", day: 25, reason: "冠婚葬祭" },
   { id: 3, year_month: "2026-10", staff_name: "渡辺 拓也", day: 8, reason: "家族行事" }
  ];
  seed.shift_ng_pairs = [{ id: 1, staff1: "佐藤 健太", staff2: "高橋 直樹", reason: "相性配慮 (同日夜勤NG)" }];
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
// 同じIDが重なっていたら（以前の初期値 aaaa のまま など）、並びで先の方を残し、後の方に空いているIDを振る。
// どの端末でも同じ結果になる（サーバーのログインも、重なっているときは先の方で照合する）
function cpDedupeLoginIds(accounts) {
 if (!Array.isArray(accounts)) return;
 const seen = new Set();
 accounts.forEach(a => {
  if (!a) return;
  const k = String(a.staff_id || "").toLowerCase();
  if (!k || seen.has(k)) { a.staff_id = cpNextFreeLoginId(accounts.filter(x => x !== a)); }
  seen.add(String(a.staff_id).toLowerCase());
 });
}
// [Claude整理 2026-10-19] 14_auth_home.js から移した（データの読み込み時に使うため）
// [Claude追加 2026-10-18] 空いているログインID（aaaa, bbbb, … zzzz, aaaaa, …）
function cpNextFreeLoginId(accounts) {
 const used = new Set((accounts || []).map(a => String((a && a.staff_id) || "").toLowerCase()));
 for (let len = 4; len < 10; len++) {
  for (let c = 0; c < 26; c++) {
   const id = String.fromCharCode(97 + c).repeat(len);
   if (!used.has(id)) return id;
  }
 }
 return "staff" + Date.now().toString(36).replace(/[0-9]/g, x => String.fromCharCode(97 + Number(x)));
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
