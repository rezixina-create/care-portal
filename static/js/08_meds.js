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
// [Claude修正 2026-10-18] その日の在所状況。以前は今の状況（status）だけで決めていたため、
// 過去の日付の表でも、いま入院中の方が「入院中」になったり、入居前・退所後の方が出たりしていた
// [Antigravity実装 2026-10-19] 入院の期間リスト (r.hospitalizations) を見て、過去の入院期間もその日は「入院中」、退院後は「在所」と判定する
function cpGetHospitalizations(r) {
 if (!r || typeof r !== "object") return [];
 if (!Array.isArray(r.hospitalizations)) r.hospitalizations = [];
 if (r.hospital_date && r.hospitalizations.length === 0 && (r.status === "入院中" || (r.status === "退所" && r.status_before_discharge === "入院中"))) { // [Claude修正] 在所の方に残った古い入院日で、今日まで入院中にしない
 r.hospitalizations.push({
 id: Number(r.id) * 10000 + 1,
 resident_id: r.id,
 admission_date: r.hospital_date,
 discharge_date: "",
 hospital_name: r.hospital_name || "",
 reason: r.hospital_reason || "",
 created_by: r.updated_by || "",
 created_at: r.hospital_date
 });
 }
 return r.hospitalizations.filter(h => h && !h.voided);
}

function cpHospitalizationOn(r, dateStr) {
 if (!r) return null;
 const d = (typeof dateStr === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) ? dateStr : (gState.selectedDate || toLocalDateStr(new Date()));
 const list = cpGetHospitalizations(r);
 for (let i = list.length - 1; i >= 0; i--) {
 const h = list[i];
 if (!h || !h.admission_date) continue;
 if (d >= h.admission_date && (!h.discharge_date || d <= h.discharge_date)) return h;
 }
 return null;
}

function cpOutingOn(r, dateStr) {
 if (!r) return null;
 const d = (typeof dateStr === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) ? dateStr : (gState.selectedDate || toLocalDateStr(new Date()));
 const list = (typeof cpGetOutings === "function") ? cpGetOutings(r) : (Array.isArray(r.outings) ? r.outings.filter(o => o && !o.voided) : []);
 for (let i = list.length - 1; i >= 0; i--) {
 const o = list[i];
 if (!o || !o.start_date) continue;
 if (d >= o.start_date && (!o.end_date || d <= o.end_date)) return o;
 }
 return null;
}

function cpStatusOn(r, dateStr) {
 if (!r) return "";
 const d = (typeof dateStr === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) ? dateStr : (gState.selectedDate || toLocalDateStr(new Date()));
 if (r.admission_date && d < r.admission_date) return "入居前";
 // [Claude修正] 短期利用の人は、終了予定日を過ぎた日は退所として扱う（退所の手続きを待たずに集計・稼働率から外す）
 if (r.usage_type === "short" && r.short_end_date && d > r.short_end_date) return "退所";
 if (r.status === "退所" && r.discharge_date && d > r.discharge_date) return "退所";
 const hosp = cpHospitalizationOn(r, d);
 if (hosp) return "入院中";
 const outing = cpOutingOn(r, d);
 if (outing) return "外泊中";
 const hasHospList = cpGetHospitalizations(r).length > 0;
 if (r.status === "退所") {
 if (r.discharge_date && d <= r.discharge_date) {
 const before = r.status_before_discharge && r.status_before_discharge !== "退所" ? r.status_before_discharge : "在所";
 if (before === "入院中" && hasHospList) return "在所";
 return before;
 }
 return "退所";
 }
 if (r.status === "入院中") {
 if (hasHospList) return "在所";
 return (r.hospital_date && d < r.hospital_date) ? "在所" : "入院中";
 }
 return r.status || "在所";
}
// [Claude追加 2026-10-18] 選ぶ欄は「選んでください」から始め、選ばずには保存できないようにする
function cpRequireSelect(id, label) {
 const el = document.getElementById(id);
 if (el && !el.value) { alert(`${label}を選んでください。`); try { el.focus(); } catch (e) {} return false; }
 return true;
}
function cpResidentIsHere(r, dateStr) { const s = cpStatusOn(r, dateStr); return !!r && s !== "入院中" && s !== "退所" && s !== "入居前" && s !== "外泊中"; }
function cpNowHHMM() { return toLocalDateTimeStr(new Date()).slice(11, 16); }
function cpMinutes(hhmm) { const m = String(hhmm || "").match(/^(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; }

// ---------- 処方薬の一覧 ----------
// [Antigravity実装 2026-10-19] 週1回・月1回・〇日ごとの薬の「飲む日」判定と表記
const CP_RX_WEEKDAYS = ["日曜", "月曜", "火曜", "水曜", "木曜", "金曜", "土曜"];

function cpRxScheduleText(m) {
 if (!m || !m.freq_type || m.freq_type === "daily") return "毎日";
 if (m.freq_type === "weekly") {
 const w = Number(m.freq_weekday);
 const wName = (w >= 0 && w <= 6) ? CP_RX_WEEKDAYS[w] : "";
 return `週1回（${wName || "曜日未設定"}）`;
 }
 if (m.freq_type === "monthly") {
 const day = Number(m.freq_day);
 return `月1回（${day}日）`;
 }
 if (m.freq_type === "interval") {
 const days = Number(m.freq_interval);
 const st = m.freq_start || m.start_date || "";
 return `${days}日ごと（${st ? st + "から" : "開始日未設定"}）`;
 }
 return "毎日";
}

function cpIsMedScheduledOnDate(m, dateStr) {
 if (!m) return false;
 const d = (typeof dateStr === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) ? dateStr : (gState.selectedDate || toLocalDateStr(new Date()));
 if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return true;
 const startLim = m.start_date || (m.freq_type === "interval" ? m.freq_start : "");
 if (startLim && /^\d{4}-\d{2}-\d{2}$/.test(startLim) && d < startLim) return false;
 if (!m.freq_type || m.freq_type === "daily") return true;
 const [yStr, mStr, dStr] = d.split("-");
 const yr = Number(yStr), mo = Number(mStr), dy = Number(dStr);
 if (m.freq_type === "weekly") {
 const dt = new Date(yr, mo - 1, dy);
 return dt.getDay() === Number(m.freq_weekday);
 }
 if (m.freq_type === "monthly") {
 const targetDay = Number(m.freq_day);
 if (!(targetDay >= 1 && targetDay <= 31)) return false;
 return dy === targetDay; // [Claude修正] その日がない月に勝手に月末へ動かさない（選べるのは1〜28日）
 }
 if (m.freq_type === "interval") {
 const interval = Number(m.freq_interval);
 const baseStr = m.freq_start || m.start_date || "";
 if (!(interval >= 2) || !/^\d{4}-\d{2}-\d{2}$/.test(baseStr)) return false;
 if (d < baseStr) return false;
 const [by, bm, bd] = baseStr.split("-").map(Number);
 const utcTarget = Date.UTC(yr, mo - 1, dy);
 const utcBase = Date.UTC(by, bm - 1, bd);
 const diffDays = Math.round((utcTarget - utcBase) / 86400000);
 return diffDays >= 0 && (diffDays % interval === 0);
 }
 return true;
}

function cpActiveRxMeds(resId) {
 return (db.data.resident_medications || []).filter(m => m && !m.voided && m.status !== "中止" && Number(m.resident_id) === Number(resId));
}
// 登録されているすべての時間の決まった薬（曜日・日付を問わず、処方薬一覧が登録されているかの判定用）
function cpAllScheduledRxMeds(resId) {
 return cpActiveRxMeds(resId).filter(m => (m.timings || []).some(t => t && Number(t.count) > 0));
}
// その日に飲む予定の時間の決まった薬（頓服だけの薬や、その日に飲まない週1回・月1回・〇日ごとの薬は服薬チェック表に出さない）
function cpScheduledRxMeds(resId, dateStr) {
 const d = (typeof dateStr === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) ? dateStr : (gState.selectedDate || toLocalDateStr(new Date()));
 return cpAllScheduledRxMeds(resId).filter(m => cpIsMedScheduledOnDate(m, d));
}
function cpResidentHasRxList(resId) { return cpAllScheduledRxMeds(resId).length > 0; }
function cpResidentTimings(resId, dateStr) {
 if (!cpResidentHasRxList(resId)) return CP_RX_FALLBACK_TIMINGS.slice();
 const meds = cpScheduledRxMeds(resId, dateStr);
 if (!meds.length) return [];
 const used = new Set();
 meds.forEach(m => (m.timings || []).forEach(t => { if (t && Number(t.count) > 0) used.add(t.key); }));
 return CP_RX_TIMINGS.map(t => t.key).filter(k => used.has(k));
}
// 袋の中の合計（単位ごと・その日に飲む薬だけを計算）。例: 「3錠・1包」
function cpBagText(resId, timingKey, dateStr) {
 const sum = {};
 cpScheduledRxMeds(resId, dateStr).forEach(m => (m.timings || []).forEach(t => {
 if (t.key === timingKey && Number(t.count) > 0) { const u = m.unit || "錠"; sum[u] = (sum[u] || 0) + Number(t.count); }
 }));
 const parts = CP_RX_UNITS.filter(u => sum[u]).map(u => `${sum[u]}${u}`);
 Object.keys(sum).filter(u => !CP_RX_UNITS.includes(u)).forEach(u => parts.push(`${sum[u]}${u}`));
 return parts.join("・");
}
// その日のその時間帯に飲む「毎日ではない薬」の案内表示用
function cpScheduledNonDailyText(resId, timingKey, dateStr) {
 const notes = [];
 cpScheduledRxMeds(resId, dateStr).forEach(m => {
 if (!m.freq_type || m.freq_type === "daily") return;
 const hasSlot = (m.timings || []).some(t => t.key === timingKey && Number(t.count) > 0);
 if (hasSlot) notes.push(`${m.name}（${cpRxScheduleText(m)}）`);
 });
 return notes.join("、");
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
 // [Antigravity実装 2026-10-19] 処方薬の一覧に「飲む日」（毎日／週1回（月曜）／月1回（31日・ない月は月末）など）を表示
 const row = (m, isActive) => {
 const sched = cpRxScheduleText(m);
 const isNonDaily = m.freq_type && m.freq_type !== "daily";
 return `
 <div class="rx-med ${isActive ? "" : "is-stopped"}">
 <div class="rx-med-main">
 <div style="display:flex; align-items:center; flex-wrap:wrap; gap:6px;">
 ${cpDrugLink(m.name, "rx-med-name")}
 <span class="rx-freq-badge ${isNonDaily ? "is-special" : ""}">飲む日: ${escapeHtml(sched)}</span>
 </div>
 <div class="rx-sub">${escapeHtml(timingText(m))}</div>
 ${(m.purpose || m.effect) ? `<div>何のため: ${escapeHtml(m.purpose || m.effect)}</div>` : ""}
 ${m.prn && Number(m.prn.count) > 0 ? `<div class="rx-prn-note">頓服は服薬チェック表には出ません。使うときは看護師・主治医の指示に従ってください。</div>` : ""}
 <div class="rx-sub">資料: ${escapeHtml(m.source_type || "")}${m.source_detail ? `（${escapeHtml(m.source_detail)}）` : ""} ／ 追加 ${escapeHtml(m.added_at || m.start_date || "")} ${escapeHtml(m.added_by || "")}${(m.edit_history || []).length ? ` ／ 変更 ${m.edit_history.length}回` : ""}</div>
 ${isActive ? "" : `<div class="rx-sub">中止 ${escapeHtml(m.stopped_at || "")} ${escapeHtml(m.stopped_by || "")}（理由: ${escapeHtml(m.stop_reason || "-")}）</div>`}
 </div>
 ${nurse && isActive ? `<div class="rx-med-actions"><button type="button" class="btn btn-secondary rx-small" onclick="editRxMed(${m.id})">変更</button><button type="button" class="btn btn-secondary rx-small" onclick="stopRxMed(${m.id})">中止</button></div>` : ""}
 </div>`;
 };
 const editing = nurse && cpRxState.editId !== null ? all.find(m => Number(m.id) === Number(cpRxState.editId)) : null;
 return `
 ${nurse ? "" : `<div class="rx-locked">処方薬の追加・変更は看護師だけができます。追加・変更したいときは看護師に依頼してください。</div>`}
 <section class="rx-section">
 <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
 <h4>飲んでいる薬（${active.length}）</h4>
 ${active.length ? `<button type="button" class="btn btn-secondary rx-small" onclick="printRxMedList(${cpRxState.resId})">処方薬・指定日の服薬予定を印刷</button>` : ""}
 </div>
 ${active.map(m => row(m, true)).join("") || `<p class="panel-note">まだ登録されていません。登録されるまで、服薬チェック表は「朝食後・昼食後・夕食後・眠前」で記録します。</p>`}
 </section>
 ${nurse ? cpRenderRxMedForm(editing) : ""}
 ${stopped.length ? `<details class="rx-section"><summary>中止した薬（${stopped.length}）</summary>${stopped.map(m => row(m, false)).join("")}</details>` : ""}`;
}

// [Antigravity実装 2026-10-19] 処方薬一覧と指定日に飲む薬の印刷（その日に飲む日の薬だけを対象に袋の中の錠数を計算）
function printRxMedList(resId) {
 const r = (gState.residents || []).find(x => Number(x.id) === Number(resId || cpRxState.resId));
 if (!r) return;
 const targetDate = gState.selectedDate || toLocalDateStr(new Date());
 const active = cpActiveRxMeds(r.id);
 const scheduledToday = cpScheduledRxMeds(r.id, targetDate);
 const th = 'style="background:#eee; border:1px solid #999; padding:4px; text-align:left;"';
 const td = 'style="border:1px solid #999; padding:4px; vertical-align:top;"';
 const rows = active.map(m => {
 const isToday = cpIsMedScheduledOnDate(m, targetDate);
 const tStr = (m.timings || []).filter(t => Number(t.count) > 0).map(t => `${t.key} ${t.count}${m.unit || "錠"}`).join("・") || (m.prn && Number(m.prn.count) > 0 ? `頓服 1回${m.prn.count}${m.unit || "錠"}（${m.prn.when || ""}）` : "-");
 return `<tr><td ${td}><strong>${escapeHtml(m.name || "")}</strong></td><td ${td}>${escapeHtml(cpRxScheduleText(m))}</td><td ${td}>${escapeHtml(tStr)}</td><td ${td}>${isToday ? "○（飲む日）" : "―（休薬日）"}</td><td ${td}>${escapeHtml(m.purpose || m.effect || "")}</td></tr>`;
 }).join("");
 const slotSummary = CP_RX_TIMINGS.map(t => {
 const bt = cpBagText(r.id, t.key, targetDate);
 return bt ? `${t.key}: ${bt}` : "";
 }).filter(Boolean).join(" ／ ") || "予定なし";
 const html = `<div style="font-family:'Hiragino Kaku Gothic ProN','Meiryo',sans-serif; color:#000; font-size:12px;">
 <h1 style="font-size:16px; margin:0 0 6px 0;">${escapeHtml(r.room_no)}号室 ${escapeHtml(r.name)} 様 処方薬一覧・${escapeHtml(targetDate)}の服薬予定</h1>
 <div style="margin-bottom:8px;"><strong>${escapeHtml(targetDate)} に飲む薬（${scheduledToday.length}剤）の袋の中合計:</strong> ${escapeHtml(slotSummary)}</div>
 <table style="width:100%; border-collapse:collapse; font-size:11px;">
 <thead><tr><th ${th}>薬の名前</th><th ${th}>飲む日</th><th ${th}>用法・用量</th><th ${th}>${escapeHtml(targetDate)}の予定</th><th ${th}>目的・効能</th></tr></thead>
 <tbody>${rows || `<tr><td ${td} colspan="5">登録なし</td></tr>`}</tbody>
 </table>
 </div>`;
 runPrintJob(html, { page: "A4 portrait", fitOnePage: false });
}

// [Antigravity実装 2026-10-19] 「飲む日」の選択肢の切り替え表示
function onRxFreqTypeChange() {
 const type = (document.getElementById("rxMedFreqType") || {}).value || "";
 const wBox = document.getElementById("rxFreqWeeklyBox");
 const mBox = document.getElementById("rxFreqMonthlyBox");
 const iBox = document.getElementById("rxFreqIntervalBox");
 if (wBox) wBox.style.display = type === "weekly" ? "block" : "none";
 if (mBox) mBox.style.display = type === "monthly" ? "block" : "none";
 if (iBox) iBox.style.display = type === "interval" ? "block" : "none";
}

function cpRenderRxMedForm(m) {
 const rxDates = cpRxList(cpRxState.resId).map(p => p.issued_date);
 const cnt = key => { const t = m && (m.timings || []).find(x => x.key === key); return t ? t.count : ""; };
 // [Antigravity実装 2026-10-19] 選ぶ欄は「選んでください」から始め、既存データは未設定なら daily として初期表示
 const freqType = m ? (m.freq_type || "daily") : "";
 const freqWeekday = (m && m.freq_weekday !== undefined && m.freq_weekday !== null && m.freq_weekday !== "") ? String(m.freq_weekday) : "";
 const freqDay = (m && m.freq_day !== undefined && m.freq_day !== null && m.freq_day !== "") ? String(m.freq_day) : "";
 const freqStart = (m && m.freq_start) ? String(m.freq_start) : (m && m.start_date ? String(m.start_date) : "");
 const freqInterval = (m && m.freq_interval) ? String(m.freq_interval) : "";
 const src = m ? (m.source_type || "") : "";
 return `
 <section class="rx-section rx-form">
 <h4>${m ? "薬の内容を変える" : "薬を追加する"}</h4>
 <div class="rx-form-grid">
 <label>薬の名前（処方箋のとおり） <input type="text" id="rxMedName" class="form-control" maxlength="80" value="${m ? escapeHtml(m.name) : ""}"></label>
 <label>単位 <select id="rxMedUnit" class="form-control"><option value="">選んでください</option>${CP_RX_UNITS.map(u => `<option value="${u}" ${m && m.unit === u ? "selected" : ""}>${u}</option>`).join("")}</select></label>
 </div>
 <!-- [Antigravity実装 2026-10-19] 飲む日（毎日／週1回／月1回／〇日ごと） -->
 <div class="rx-freq-box">
 <label class="rx-block">飲む日 <select id="rxMedFreqType" class="form-control" onchange="onRxFreqTypeChange()">
 <option value="">選んでください</option>
 <option value="daily" ${freqType === "daily" ? "selected" : ""}>毎日</option>
 <option value="weekly" ${freqType === "weekly" ? "selected" : ""}>週1回（曜日を選ぶ）</option>
 <option value="monthly" ${freqType === "monthly" ? "selected" : ""}>月1回（日を選ぶ）</option>
 <option value="interval" ${freqType === "interval" ? "selected" : ""}>〇日ごと（始める日と日数）</option>
 </select></label>
 <div id="rxFreqWeeklyBox" class="rx-freq-sub" style="display:${freqType === "weekly" ? "block" : "none"};">
 <label>飲む曜日 <select id="rxMedFreqWeekday" class="form-control">
 <option value="">選んでください</option>
 ${CP_RX_WEEKDAYS.map((w, idx) => `<option value="${idx}" ${freqWeekday === String(idx) ? "selected" : ""}>${w}</option>`).join("")}
 </select></label>
 </div>
 <div id="rxFreqMonthlyBox" class="rx-freq-sub" style="display:${freqType === "monthly" ? "block" : "none"};">
 <label>毎月何日に飲むか <select id="rxMedFreqDay" class="form-control">
 <option value="">選んでください</option>
 ${Array.from({ length: 28 }, (_, i) => i + 1).map(d => `<option value="${d}" ${freqDay === String(d) ? "selected" : ""}>毎月 ${d}日</option>`).join("")}
 </select></label>
 <p class="panel-note" style="margin-top:4px;">選べるのは1日〜28日です。29日〜31日の指示のときは、その日がない月にいつ飲むかを処方した医師に確かめてから登録してください。</p>
 </div>
 <div id="rxFreqIntervalBox" class="rx-freq-sub" style="display:${freqType === "interval" ? "block" : "none"};">
 <div class="rx-form-grid">
 <label>始める日 <input type="date" id="rxMedFreqStart" class="form-control" value="${escapeHtml(freqStart)}"></label>
 <label>何日ごとか（2以上） <input type="number" id="rxMedFreqInterval" class="form-control" min="2" max="365" step="1" inputmode="numeric" value="${escapeHtml(freqInterval)}"></label>
 </div>
 </div>
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
 <label class="rx-block">何のため（処方箋や薬の説明書きのとおり） <input type="text" id="rxMedPurpose" class="form-control" maxlength="120" value="${m ? escapeHtml(m.purpose || m.effect || "") : ""}"></label>
 <div class="rx-form-grid">
 <label>何を見て書いたか <select id="rxMedSource" class="form-control"><option value="">選んでください</option>${CP_RX_SOURCES.map(s => `<option value="${s}" ${src === s ? "selected" : ""}>${s}</option>`).join("")}</select></label>
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
 const target = (db.data.resident_medications || []).find(m => Number(m.id) === Number(id));
 if (target && target.status === "中止") { alert("中止した薬は変更できません。再開・変更するときは新しく追加してください。"); return; }
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
 const unit = val("rxMedUnit");
 if (!unit) { alert("単位を選んでください。"); return; }
 // [Antigravity実装 2026-10-19] 「飲む日」の検証
 const freqType = val("rxMedFreqType");
 if (!freqType) { alert("飲む日を選んでください。"); return; }
 let freqWeekday = null, freqDay = null, freqStart = "", freqInterval = null;
 if (freqType === "weekly") {
 const wRaw = val("rxMedFreqWeekday");
 if (wRaw === "") { alert("週1回の薬は、飲む曜日を選んでください。"); return; }
 freqWeekday = Number(wRaw);
 if (!(freqWeekday >= 0 && freqWeekday <= 6)) { alert("飲む曜日を正しく選んでください。"); return; }
 } else if (freqType === "monthly") {
 const dRaw = val("rxMedFreqDay");
 if (dRaw === "") { alert("月1回の薬は、毎月何日に飲むかを選んでください。"); return; }
 freqDay = Number(dRaw);
 if (!(freqDay >= 1 && freqDay <= 28)) { alert("飲む日は1日〜28日から選んでください（29日〜31日は、その日がない月にいつ飲むかを処方した医師に確かめてください）。"); return; }
 } else if (freqType === "interval") {
 freqStart = val("rxMedFreqStart");
 const iRaw = val("rxMedFreqInterval");
 if (!/^\d{4}-\d{2}-\d{2}$/.test(freqStart)) { alert("〇日ごとの薬は、始める日を入れてください。"); return; }
 freqInterval = Number(iRaw);
 if (!Number.isInteger(freqInterval) || freqInterval < 2 || freqInterval > 365) { alert("〇日ごとの日数は、2以上の整数（2〜365）を入れてください。"); return; }
 }
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
 if (!prnWhen) { alert("頓服を使うとき（処方箋に書かれた条件）を入れてください。"); return; }
 prn = { count: pc, when: prnWhen };
 } else if (prnWhen) { alert("頓服の1回の数を入れてください。頓服でなければ「使うとき」を空欄にしてください。"); return; }
 if (!timings.length && !prn) { alert("飲む時間帯と1回の数、または頓服を、少なくとも1つ入れてください。"); return; }
 const sourceType = val("rxMedSource");
 const sourceDetail = val("rxMedSourceDetail");
 if (!sourceType) { alert("何を見て書いたかを選んでください。"); return; }
 if (!Array.isArray(db.data.resident_medications)) db.data.resident_medications = [];
 // 二重登録の防止（同じ方に同じ薬名で服用中のものがすでにある場合）
 const dup = db.data.resident_medications.find(m => m && !m.voided && m.status !== "中止" && Number(m.resident_id) === Number(cpRxState.resId) && m.name === name && (cpRxState.editId === null || Number(m.id) !== Number(cpRxState.editId)));
 if (dup) { alert(`「${name}」はすでに飲んでいる薬に登録されています。内容を変えるときは既存の薬の「変更」から行ってください。`); return; }
 const now = toLocalDateTimeStr(new Date());
 const who = cpLoginStaffName();
 const fields = {
 name: name,
 unit: unit,
 freq_type: freqType,
 freq_weekday: freqWeekday,
 freq_day: freqDay,
 freq_start: freqStart,
 freq_interval: freqInterval,
 timings: timings,
 prn: prn,
 purpose: val("rxMedPurpose"),
 source_type: sourceType,
 source_detail: sourceDetail
 };
 if (cpRxState.editId !== null) {
 const target = db.data.resident_medications.find(m => Number(m.id) === Number(cpRxState.editId));
 if (!target) { alert("変更する薬が見つかりません。画面を開き直してください。"); return; }
 if (target.status === "中止") { alert("中止した薬は変更できません。"); return; }
 const reason = val("rxMedEditReason");
 if (!reason) { alert("変更の理由を入れてください。"); return; }
 const old = JSON.parse(JSON.stringify(target));
 if (!old.freq_type) old.freq_type = "daily"; // [Claude修正] 飲む日がない今までの薬は「毎日」と同じ
 const before = (target.edit_history || []).length;
 Object.assign(target, fields);
 cpAppendEditHistory(target, old, Object.keys(fields), reason);
 if ((target.edit_history || []).length <= before) { alert("内容が変わっていません。"); return; }
 cpRxState.editId = null;
 } else {
 let newRxId = Date.now();
 while (db.data.resident_medications.some(x => x && Number(x.id) === newRxId)) newRxId++;
 db.data.resident_medications.push(Object.assign({ id: newRxId, resident_id: cpRxState.resId, status: "服用中", added_at: now, added_by: who }, fields));
 }
 db.save();
 renderRxModal();
 if (gState.activeCareTab === "med") renderMedTable();
}

function stopRxMed(id) {
 if (!cpIsCurrentNurse()) { alert("処方薬の中止は看護師だけができます。看護師に依頼してください。"); return; }
 const m = (db.data.resident_medications || []).find(x => Number(x.id) === Number(id));
 if (!m) return;
 if (m.status === "中止") { alert("すでに中止されています。"); return; }
 const reason = prompt(`「${m.name}」を中止にします。記録は消えずに「中止した薬」に残ります。\n\n中止の理由を入れてください`, "");
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
function cpMedTimingsInUse(dateStr) {
 const d = (typeof dateStr === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) ? dateStr : (gState.selectedDate || toLocalDateStr(new Date()));
 const used = new Set();
 (gState.residents || []).filter(r => cpResidentIsHere(r, d)).forEach(r => cpResidentTimings(r.id, d).forEach(k => used.add(k)));
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
 const keys = cpMedTimingsInUse(date);
 if (!keys.includes(gState.medTiming)) gState.medTiming = cpMedDefaultTiming(keys);
 const cur = gState.medTiming;
 const here = (gState.residents || []).filter(r => cpResidentIsHere(r, date));
 const away = (gState.residents || []).filter(r => !cpResidentIsHere(r, date) && cpStatusOn(r, date) !== "退所" && cpStatusOn(r, date) !== "入居前");
 const chips = keys.map(k => {
 const targets = here.filter(r => cpResidentTimings(r.id, date).includes(k));
 const done = targets.filter(r => cpMedSavedRecord(date, r.id, k)).length;
 return `<button type="button" class="med-slot ${k === cur ? "active" : ""}" onclick="cpSelectMedTiming('${k}')">${k}<span class="med-slot-sub">${cpRxSlotTime(k)}・記録 ${done}/${targets.length}</span></button>`;
 }).join("");
 const late = cur ? cpMedIsLate(date, cur) : false;
 const rows = cur ? here.filter(r => cpResidentTimings(r.id, date).includes(cur)).map(r => cpMedRowHtml(r, cur, date, late)).join("") : "";
 const pending = cpMedPendingCount();
 area.innerHTML = `
 <div class="med-slots" role="tablist" aria-label="時間帯">${chips}</div>
 ${cur ? `
 <div class="med-toolbar">
 <div><strong>${escapeHtml(cur)}</strong>（予定 ${cpRxSlotTime(cur)}）${late ? `<span class="med-late-note">予定から2時間以上たっています。飲ませたことを確かめてから付けてください。</span>` : ""}</div>
 <button type="button" class="btn btn-secondary" onclick="cpMedMarkAll()">まだ付けていない方に「済」を付ける</button>
 </div>
 <div class="med-rows">${rows || `<p class="panel-note">この時間帯に飲む方はいません。</p>`}</div>
 ${away.length ? `<p class="panel-note">入院中・外泊中の方（${away.map(r => escapeHtml(r.name)).join("、")}）は表示していません。</p>` : ""}
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
 const bag = hasList ? cpBagText(r.id, k, date) : "";
 const nonDaily = hasList ? cpScheduledNonDailyText(r.id, k, date) : "";
 const bagHtml = hasList
 ? `<span class="med-bag">袋の中 <strong>${escapeHtml(bag)}</strong>${nonDaily ? ` <span class="med-bag-sched">（本日: ${escapeHtml(nonDaily)}）</span>` : ""}</span>`
 : `<span class="med-bag is-none">処方薬の一覧が未登録</span>`;
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
 (gState.residents || []).filter(r => cpResidentIsHere(r, date)).filter(r => cpResidentTimings(r.id, date).includes(k)).forEach(r => {
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
 const bag = cpResidentHasRxList(rid) ? cpBagText(rid, k, date) : "";
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
 const bag = cpResidentHasRxList(resId) ? cpBagText(resId, k, date) : "";
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

// 予定時刻を1時間過ぎても記録がない方（今日の分・処方薬の一覧がある方・かつ今日が飲む日の薬だけを対象にする）
function cpMedMissingList(dateOpt, nowHHMMOpt) {
 const today = (typeof dateOpt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateOpt)) ? dateOpt : toLocalDateStr(new Date());
 const now = cpMinutes((typeof nowHHMMOpt === "string" && /^\d{1,2}:\d{2}$/.test(nowHHMMOpt)) ? nowHHMMOpt : cpNowHHMM());
 const out = [];
 CP_RX_TIMINGS.forEach(t => {
 if (cpMinutes(cpRxSlotTime(t.key)) + CP_MED_MISSING_MINUTES > now) return;
 const who = (gState.residents || []).filter(r => cpResidentIsHere(r, today)).filter(r => cpResidentHasRxList(r.id) && cpResidentTimings(r.id, today).includes(t.key) && !cpMedSavedRecord(today, r.id, t.key));
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
 { name: "レボドパ・カルビドパ", aliases: ["レボドパ", "カルビドパ", "メネシット", "ネオドパストン"], kind: "飲み薬",
 what: "パーキンソン病の薬。脳の中で足りなくなったドパミンを補い、ふるえ・こわばり・動きの遅さ・歩きにくさをやわらげる。",
 watch: ["高い熱・体のこわばり・ふるえ・飲み込みにくい・意識がぼんやりする（悪性症候群）", "ないものが見える・聞こえる、混乱する", "前ぶれなく急に眠り込む", "気分の落ち込み・眠れない", "吐き気・お腹の痛み・黒い便", "急に動けなくなる・症状が急に変わる（長く飲んでいる方）"],
 how: ["自分の判断でやめたり量を変えたりしない（急にやめると悪くなることがある）。看護師・主治医の指示に従う", "飲み忘れても2回分を一度に飲ませない。どうするかは看護師に聞く"],
 sources: [["患者向医薬品ガイド（レボドパ・カルビドパ水和物錠）", "https://www.info.pmda.go.jp/downfiles/ph/GUI/672173_1169101F1154_2_01G.pdf"], ["国立病院機構 熊本医療センター「パーキンソン病の薬」", "https://kumamoto.hosp.go.jp/files/000208191.pdf"]] },
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
const CP_DRUG_GUIDE_CHECKED = "2026-10-09（追記 2026-10-15・2026-10-18）";

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

// [Antigravity実装 2026-10-19] 点眼指示モーダル制御（1人に複数の目薬指示を追加・変更・終了できる）
function cpCanManageEyedropOrder() {
 return cpIsCurrentNurse(); // [Claude修正] 処方薬と同じく看護師だけ（ユーザーの決まり: 薬の追加・変更は看護師）
}

function openEyedropOrderModal(residentId, orderId) {
 const modal = document.getElementById("eyedropOrderModal");
 if (!modal) return;

 const resSelect = document.getElementById("eoResidentSelect");
 const targetId = Number(residentId || gState.selectedResidentId || (resSelect ? resSelect.value : 0));
 if (resSelect) {
 resSelect.innerHTML = cpCurrentResidents().map(r => `
 <option value="${r.id}" ${Number(r.id) === targetId ? 'selected' : ''}>${r.room_no}号室: ${r.name} 様</option>
 `).join("");
 }

 renderEyedropOrdersModalList(targetId, orderId !== undefined ? orderId : null);
 modal.style.display = "flex";
}

function onEyedropResidentChange() {
 const sel = document.getElementById("eoResidentSelect");
 if (sel) {
 renderEyedropOrdersModalList(parseInt(sel.value, 10), null);
 }
}

function renderEyedropOrdersModalList(resId, editOrderId) {
 const area = document.getElementById("eoOrdersListArea");
 const all = (db.data.eyedrop_orders || []).filter(e => e && Number(e.resident_id) === Number(resId) && e.eye !== "指示なし");
 const active = all.filter(e => e.status !== "終了");
 const ended = all.filter(e => e.status === "終了");
 const canManage = cpCanManageEyedropOrder();

 if (area) {
 const cardHtml = (e, isEnded) => {
 const tStr = (e.timing_slots || []).join("・") || "-";
 const histLen = (e.edit_history || []).length;
 return `<div class="cp-eo-card ${isEnded ? "is-ended" : ""}">
 <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:6px;">
 <div>
 <span class="badge" style="background:${isEnded ? "var(--ink-2)" : "var(--pine-dark)"}; color:#fff; font-size:13px; padding:2px 6px;">[${escapeHtml(e.eye || "")}]</span>
 <strong style="font-size:14px; margin-left:4px;">${escapeHtml(e.medicine_name || "")}</strong>
 <span style="font-size:13px; color:var(--text-muted); margin-left:6px;">（${escapeHtml(tStr)} ／ ${escapeHtml(e.dosage || "")}${(e.status === "休薬中" || e.status === "一時休止") ? " ／ 休薬中" : ""}）</span>
 ${e.doctor_name ? `<div style="font-size:13px; color:var(--text-muted); margin-top:2px;">処方元: ${escapeHtml(e.doctor_name)}${e.notes ? " ／ 注意: " + escapeHtml(e.notes) : ""}${histLen ? ` ／ 変更 ${histLen}回` : ""}</div>` : (e.notes || histLen ? `<div style="font-size:13px; color:var(--text-muted); margin-top:2px;">${e.notes ? "注意: " + escapeHtml(e.notes) : ""}${histLen ? ` ／ 変更 ${histLen}回` : ""}</div>` : "")}
 ${isEnded ? `<div style="font-size:13px; color:var(--alert); margin-top:2px;">終了: ${escapeHtml(e.ended_at || "")} ${escapeHtml(e.ended_by || "")}（理由: ${escapeHtml(e.end_reason || "-")}）</div>` : ""}
 </div>
 ${!isEnded && canManage ? `<div style="display:flex; gap:6px;">
 <button type="button" class="btn btn-secondary" style="font-size:13px; padding:3px 8px;" onclick="startEditEyedropOrder(${e.id})">変更</button>
 <button type="button" class="btn btn-secondary" style="font-size:13px; padding:3px 8px;" onclick="endEyedropOrder(${e.id})">終了</button>
 </div>` : ""}
 </div>
 </div>`;
 };

 area.innerHTML = `
 ${canManage ? "" : `<div class="rx-locked" style="margin-bottom:8px;">点眼指示の追加・変更・終了は看護師だけができます。追加・変更したいときは看護師に依頼してください。</div>`}
 <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; margin-bottom:6px;">
 <strong style="font-size:14px; color:var(--pine-dark);">現在の点眼指示（${active.length}件）</strong>
 ${canManage ? `<button type="button" class="btn btn-secondary" style="font-size:13px; padding:3px 10px;" onclick="startNewEyedropOrder()">+ 新しい目薬を追加</button>` : ""}
 </div>
 ${active.length ? active.map(e => cardHtml(e, false)).join("") : `<div style="font-size:13px; color:var(--text-muted); padding:6px 0;">現在、継続中の点眼指示はありません。下の欄から追加できます。</div>`}
 ${ended.length ? `<details style="margin-top:8px;"><summary style="font-size:13px; cursor:pointer; color:var(--text-muted);">終了した点眼指示（${ended.length}件）</summary><div style="margin-top:6px;">${ended.map(e => cardHtml(e, true)).join("")}</div></details>` : ""}
 `;
 }

 loadEyedropOrderFormData(resId, editOrderId);
}

function startNewEyedropOrder() {
 const sel = document.getElementById("eoResidentSelect");
 const resId = sel ? parseInt(sel.value, 10) : gState.selectedResidentId;
 loadEyedropOrderFormData(resId, null);
}

function startEditEyedropOrder(orderId) {
 if (!cpCanManageEyedropOrder()) {
 alert("点眼指示の変更は看護師だけができます。");
 return;
 }
 const order = (db.data.eyedrop_orders || []).find(e => e && Number(e.id) === Number(orderId));
 if (!order) return;
 if (order.status === "終了") {
 alert("終了した点眼指示は変更できません。再開・変更するときは新しく追加してください。");
 return;
 }
 const sel = document.getElementById("eoResidentSelect");
 const resId = sel ? parseInt(sel.value, 10) : order.resident_id;
 loadEyedropOrderFormData(resId, order.id);
}

function loadEyedropOrderFormData(resId, orderId) {
 const order = (orderId !== null && orderId !== undefined && orderId !== "")
 ? (db.data.eyedrop_orders || []).find(e => e && Number(e.id) === Number(orderId) && Number(e.resident_id) === Number(resId))
 : null;

 if (order && order.status === "終了") {
 alert("終了した点眼指示は変更できません。");
 return loadEyedropOrderFormData(resId, null);
 }

 const idEl = document.getElementById("eoOrderId");
 if (idEl) idEl.value = order ? String(order.id) : "";

 const titleEl = document.getElementById("eoFormTitle");
 if (titleEl) titleEl.textContent = order ? `点眼指示の変更（${order.medicine_name || ""}）` : "新しい点眼指示を追加";

 const cancelBtn = document.getElementById("btnEoCancelEdit");
 if (cancelBtn) cancelBtn.style.display = order ? "inline-block" : "none";

 const endBtn = document.getElementById("btnDeleteEyedropOrder");
 if (endBtn) endBtn.style.display = order ? "inline-block" : "none";

 const reasonWrap = document.getElementById("eoEditReasonWrap");
 const reasonEl = document.getElementById("eoEditReason");
 if (reasonWrap) reasonWrap.style.display = order ? "block" : "none";
 if (reasonEl) reasonEl.value = "";
 const stWrap = document.getElementById("eoStatusWrap"); // [Claude修正] 変更のときは「継続中・休薬中」を選べる
 if (stWrap) stWrap.style.display = order ? "block" : "none";

 // 入力が空のときに勝手に「右のみ」「1回1滴」「眼科クリニック」などを入れない
 const eye = order ? (order.eye || "") : "";
 const rRight = document.getElementById("eoEyeRight");
 const rLeft = document.getElementById("eoEyeLeft");
 const rBoth = document.getElementById("eoEyeBoth");
 if (rRight) rRight.checked = (eye === "右のみ");
 if (rLeft) rLeft.checked = (eye === "左のみ");
 if (rBoth) rBoth.checked = (eye === "両眼");

 const medEl = document.getElementById("eoMedicineName");
 if (medEl) medEl.value = order ? (order.medicine_name || "") : "";

 const slots = order ? (order.timing_slots || []) : [];
 const cbMorn = document.getElementById("eoSlotMorning");
 const cbNoon = document.getElementById("eoSlotNoon");
 const cbEve = document.getElementById("eoSlotEvening");
 const cbBed = document.getElementById("eoSlotBed");
 if (cbMorn) cbMorn.checked = slots.includes("朝");
 if (cbNoon) cbNoon.checked = slots.includes("昼");
 if (cbEve) cbEve.checked = slots.includes("夕");
 if (cbBed) cbBed.checked = slots.includes("眠前");

 const doseEl = document.getElementById("eoDosage");
 if (doseEl) doseEl.value = order ? (order.dosage || "") : "";
 const docEl = document.getElementById("eoDoctor");
 if (docEl) docEl.value = order ? (order.doctor_name || "") : "";
 const noteEl = document.getElementById("eoNotes");
 if (noteEl) noteEl.value = order ? (order.notes || "") : "";
 const stEl = document.getElementById("eoStatus");
 if (stEl) stEl.value = order ? (order.status || "継続中") : "継続中";

 const formBox = document.getElementById("eoFormBox");
 if (formBox) {
 const canManage = cpCanManageEyedropOrder();
 formBox.style.display = canManage ? "block" : "none";
 }
 const submitBtn = document.getElementById("btnSubmitEyedropOrder");
 if (submitBtn) {
 submitBtn.style.display = cpCanManageEyedropOrder() ? "inline-block" : "none";
 submitBtn.textContent = order ? "変更を保存" : "点眼指示を追加";
 }
}

function quickFillEyedropMed(medName) {
 const el = document.getElementById("eoMedicineName");
 if (el) el.value = medName;
}

function submitEyedropOrder() {
 if (!cpCanManageEyedropOrder()) {
 alert("点眼指示の追加・変更は看護師だけができます。");
 return;
 }
 const sel = document.getElementById("eoResidentSelect");
 if (!sel) return;
 const resId = parseInt(sel.value, 10);
 const r = gState.residents.find(x => Number(x.id) === resId);
 const orderIdRaw = (document.getElementById("eoOrderId")?.value || "").trim();
 const editingId = orderIdRaw ? Number(orderIdRaw) : null;

 let eyeSide = "";
 if (document.getElementById("eoEyeRight")?.checked) eyeSide = "右のみ";
 else if (document.getElementById("eoEyeLeft")?.checked) eyeSide = "左のみ";
 else if (document.getElementById("eoEyeBoth")?.checked) eyeSide = "両眼";
 if (!eyeSide) {
 alert("点眼する目（右のみ・左のみ・両眼）を選んでください。");
 return;
 }

 const medName = document.getElementById("eoMedicineName")?.value.trim() || "";
 if (!medName) {
 alert("点眼薬の薬品名を入力してください。");
 return;
 }

 const timingSlots = [];
 if (document.getElementById("eoSlotMorning")?.checked) timingSlots.push("朝");
 if (document.getElementById("eoSlotNoon")?.checked) timingSlots.push("昼");
 if (document.getElementById("eoSlotEvening")?.checked) timingSlots.push("夕");
 if (document.getElementById("eoSlotBed")?.checked) timingSlots.push("眠前");

 if (timingSlots.length === 0) {
 alert("点眼する時間帯（朝・昼・夕・眠前）を1つ以上選んでください。");
 return;
 }

 // 入力が空のときに勝手に「1回1滴」などを入れない
 const dosage = document.getElementById("eoDosage")?.value.trim() || "";
 if (!dosage) {
 alert("1回あたりの点眼量（処方箋のとおりの滴数など）を入力してください。");
 return;
 }

 const doctor = document.getElementById("eoDoctor")?.value.trim() || "";
 const notes = document.getElementById("eoNotes")?.value.trim() || "";
 const status = document.getElementById("eoStatus")?.value || "";
 if (!status) {
 alert("指示ステータスを選んでください。");
 return;
 }

 if (!Array.isArray(db.data.eyedrop_orders)) db.data.eyedrop_orders = [];

 // 同じ方に同じ薬名で継続中・一時休止の指示がすでにある場合の二重登録防止
 const dup = db.data.eyedrop_orders.find(e => e && Number(e.resident_id) === resId && e.status !== "終了" && e.medicine_name === medName && e.eye === eyeSide && (editingId === null || Number(e.id) !== editingId));
 if (dup) {
 alert(`「${medName}（${eyeSide}）」はすでに登録されています。内容を変えるときは一覧の「変更」から行ってください。`);
 return;
 }

 if (editingId !== null) {
 const idx = db.data.eyedrop_orders.findIndex(e => e && Number(e.id) === editingId && Number(e.resident_id) === resId);
 if (idx < 0) {
 alert("変更する点眼指示が見つかりません。画面を開き直してください。");
 return;
 }
 const oldOrder = db.data.eyedrop_orders[idx];
 if (oldOrder.status === "終了") {
 alert("終了した点眼指示は変更できません。");
 return;
 }
 const editReason = (document.getElementById("eoEditReason")?.value || "").trim();
 if (!editReason) {
 alert("変更の理由を入力してください。");
 return;
 }
 const updatedOrder = Object.assign({}, oldOrder, {
 eye: eyeSide,
 medicine_name: medName,
 timing_slots: timingSlots,
 dosage: dosage,
 doctor_name: doctor,
 notes: notes,
 status: status,
 updated_at: toLocalDateStr(new Date())
 });
 const beforeLen = (oldOrder.edit_history || []).length;
 cpAppendEditHistory(updatedOrder, oldOrder, ["eye", "medicine_name", "timing_slots", "dosage", "notes", "doctor_name", "status"], editReason);
 if ((updatedOrder.edit_history || []).length <= beforeLen) {
 alert("内容が変わっていません。");
 return;
 }
 db.data.eyedrop_orders[idx] = updatedOrder;
 } else {
 let newId = Date.now();
 while (db.data.eyedrop_orders.some(e => e && Number(e.id) === newId)) newId++;
 db.data.eyedrop_orders.push({
 id: newId,
 resident_id: resId,
 eye: eyeSide,
 medicine_name: medName,
 timing_slots: timingSlots,
 dosage: dosage,
 doctor_name: doctor,
 notes: notes,
 status: status,
 added_at: toLocalDateTimeStr(new Date()),
 added_by: cpLoginStaffName(),
 updated_at: toLocalDateStr(new Date())
 });
 }

 db.save();
 renderEyedropOrdersModalList(resId, null);
 renderMedTable();
 if (typeof renderResidentDetail === "function" && Number(gState.selectedResidentId) === resId) {
 renderResidentDetail();
 }
 alert(`${r ? r.name : '利用者'}様の点眼指示（${eyeSide}・${medName}）を保存しました。`);
}

function endEyedropOrder(orderId) {
 if (!cpCanManageEyedropOrder()) {
 alert("点眼指示の終了は看護師だけができます。");
 return;
 }
 const targetId = orderId !== undefined && orderId !== null
 ? Number(orderId)
 : Number((document.getElementById("eoOrderId") || {}).value || 0);
 const order = (db.data.eyedrop_orders || []).find(e => e && Number(e.id) === targetId);
 if (!order) {
 alert("終了する点眼指示が見つかりません。");
 return;
 }
 if (order.status === "終了") {
 alert("この点眼指示はすでに終了しています。");
 return;
 }
 const r = gState.residents.find(x => Number(x.id) === Number(order.resident_id));
 const reason = prompt(`${r ? r.name : '利用者'}様の点眼指示「[${order.eye}] ${order.medicine_name}」を終了にします。\n記録は消えずに、終了した指示として残ります。\n\n終了の理由を入力してください`, "");
 if (reason === null) return;
 if (!reason.trim()) {
 alert("終了の理由を入力してください。何も変更していません。");
 return;
 }
 order.status = "終了";
 order.ended_at = toLocalDateTimeStr(new Date());
 order.ended_by = cpLedgerStaff();
 order.end_reason = reason.trim();
 db.save();
 const modal = document.getElementById("eyedropOrderModal");
 if (modal && modal.style.display === "flex") {
 renderEyedropOrdersModalList(order.resident_id, null);
 }
 renderMedTable();
 if (typeof renderResidentDetail === "function" && Number(gState.selectedResidentId) === Number(order.resident_id)) {
 renderResidentDetail();
 }
 alert(`点眼指示「${order.medicine_name}」を終了しました。`);
}

function deleteEyedropOrder() {
 const idRaw = (document.getElementById("eoOrderId") || {}).value || "";
 if (idRaw) return endEyedropOrder(Number(idRaw));
}

