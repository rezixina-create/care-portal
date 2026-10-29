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
 ${res.map(r => memberRow(`${escapeHtml(r.room_no || "")}号室 ${escapeHtml(r.name)} 様`, r.name, u.id, `moveResidentUnit(${r.id}, this.value)`)).join("")}
 ${st.map(s => memberRow(`${escapeHtml(s.name)}（${escapeHtml(s.role || "職員")}）`, s.name, u.id, "moveStaffUnit(this.dataset.staff, this.value)", `data-staff="${escapeHtml(s.name)}"`)).join("")}
 </details>` : ""}
 </div>`;
 }).join("");
 const noUnit = cpCurrentResidents().filter(r => !cpUnitName(r.unit_id));
 box.innerHTML = `
 ${rows || `<p class="panel-note">区分はまだありません。区分がないあいだは、利用者一覧の切り替えは出ません。</p>`}
 ${units.length && noUnit.length ? `<div class="unit-card unit-none"><div class="unit-count">区分が決まっていない利用者 ${noUnit.length}名</div>
 ${noUnit.map(r => `<div class="unit-member"><span>${escapeHtml(`${escapeHtml(r.room_no || "")}号室 ${escapeHtml(r.name)} 様`)}</span><select class="form-control unit-move" onchange="moveResidentUnit(${r.id}, this.value)"><option value="">区分を選ぶ</option>${units.map(u => `<option value="${u.id}">${escapeHtml(u.name)}</option>`).join("")}</select></div>`).join("")}</div>` : ""}
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
 card.className = `resident-card ${r.id === gState.selectedResidentId ? "selected" : ""} ${cpStatusOn(r, gState.selectedDate) !== "在所" ? "inactive" : ""}`;
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
// その日にホームにいた利用者（退所した方は、退所日まで出す。[Claude追加 2026-10-18] 入居日より前の日には出さない）
function cpResidentsOn(dateStr) {
 const d = dateStr || gState.selectedDate || toLocalDateStr(new Date());
 return (gState.residents || []).filter(r => r && (!r.admission_date || d >= r.admission_date) && (!cpIsDischarged(r) || (r.discharge_date && d <= r.discharge_date)));
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
  const allStamps = db.data.stamps || [];
  const staff = allStamps.find(s => (s.name || s) === staffName);
  const role = staff && staff.role ? staff.role : "";
  if (role) {
    if (role.includes("施設長") || role.includes("管理者")) return "director";
    if (role.includes("計画作成") || role.includes("支援専門") || role.includes("ケアマネ")) return "caremanager";
    if (role.includes("相談員")) return "counselor";
    if (role.includes("看護")) return "nurse";
    if (role.includes("事務") && role.includes("パート")) return "parttime";
    if (role.includes("事務")) return "office";
    return "care";
  }
  return "";
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

  const canEdit = typeof isCurrentStaffAdminOrClerk === "function" && isCurrentStaffAdminOrClerk();
  const btnStaffManage = document.getElementById("btnOpenStaffManageFromOffice");
  if (btnStaffManage) btnStaffManage.style.display = canEdit ? "" : "none";
  const btnQualMaster = document.getElementById("btnOpenQualMasterModal");
  if (btnQualMaster) btnQualMaster.style.display = canEdit ? "" : "none";
  const readOnlyNote = document.getElementById("qualSectionReadOnlyNote");
  if (readOnlyNote) readOnlyNote.style.display = canEdit ? "none" : "";

  const allStamps = sortStaffList(db.data.stamps || []);
  const qMaster = cpGetQualificationMaster();

  const masterCounts = {};
  qMaster.forEach(m => { masterCounts[m.id] = 0; });

  let careCount = 0;
  let certifiedCareWorkerCount = 0;
  let fullTimeCount = 0;
  let partTimeCount = 0;

  allStamps.forEach(s => {
    const isCareStaff = getStaffRoleCategory(s.name) === "care";
    if (isCareStaff) {
      careCount++;
      if (cpStaffHasMasterQualification(s, 1)) certifiedCareWorkerCount++;
    }
    const emp = s.employment_type || "";
    if (emp.includes("非常勤") || emp.includes("パート")) {
      partTimeCount++;
    } else if (emp.includes("常勤")) {
      fullTimeCount++;
    }

    qMaster.forEach(m => {
      if (cpStaffHasMasterQualification(s, m.id)) {
        masterCounts[m.id] = (masterCounts[m.id] || 0) + 1;
      }
    });

    const tr = document.createElement("tr");
    const badgeHtml = getStaffRoleBadgeHtml(s.name);
    const wingText = cpUnitName(s.unit_id) ? `<span style="font-size:13px; color:var(--ink-3); margin-left:4px;">(${escapeHtml(cpUnitName(s.unit_id))})</span>` : "";

    const quals = cpGetStaffQualifications(s);
    let qualItemsHtml = "";
    if (quals.length === 0) {
      qualItemsHtml = `<span style="color:var(--ink-3);">—</span>`;
    } else {
      qualItemsHtml = quals.map(q => {
        if (q.status === "取消" || q.voided) {
          return `<span class="badge qual-other-badge" style="opacity:0.6; text-decoration:line-through; margin:2px 4px 2px 0;" title="取消理由: ${escapeHtml(q.cancel_reason || "")}">[取消] ${escapeHtml(q.name)}</span>`;
        }
        if (q.is_other) {
          return `<span class="badge qual-other-badge" style="margin:2px 4px 2px 0;" title="マスタ外の資格・研修（集計対象外）">${escapeHtml(q.name)} (その他)</span>`;
        }
        const m = qMaster.find(x => x.id === q.master_id);
        const verTag = q.verified_date ? `<span class="badge qual-verified-badge" title="確認日: ${escapeHtml(q.verified_date)}${q.verified_by ? ' ／ 確認者: ' + escapeHtml(q.verified_by) : ''}">確認済</span>` : "";
        let markTag = "";
        if (m && m.has_mark === "あり") {
          const sourceLinks = cpFormatQualSourceLinksHtml(m.source_url);
          markTag = `<span class="badge qual-mark-badge" style="margin-left:4px;">★基準: ${escapeHtml(m.mark_detail || "")}${sourceLinks ? " " + sourceLinks : ""}</span>`;
        }
        return `<span class="badge" style="background:var(--ground); color:var(--ink); border:1px solid var(--line-2); font-size:13px; padding:2px 6px; margin:2px 4px 2px 0; display:inline-flex; align-items:center; gap:4px; flex-wrap:wrap;"><strong>${escapeHtml(q.name)}</strong>${verTag}${markTag}</span>`;
      }).join("");
    }

    const opHtml = canEdit ? `<button type="button" class="btn btn-secondary" style="font-size:13px; padding:2px 8px;" onclick="openStaffEditModal('${escapeHtml(s.name)}')">資格を編集</button>` : `<span style="color:var(--ink-3); font-size:13px;">—</span>`;

    tr.innerHTML = `
      <td style="text-align:center;">${badgeHtml}</td>
      <td><strong>${escapeHtml(s.name)}</strong></td>
      <td>${escapeHtml(s.role || '職員')}${wingText}</td>
      <td style="text-align:center;"><span class="badge" style="font-size:13px; padding:2px 6px; ${s.employment_type === '非常勤 (パート)' ? 'background:var(--caution-tint); color:var(--caution);' : 'background:var(--ground); color:var(--ink);'}">${escapeHtml(s.employment_type || '未設定')}</span></td>
      <td style="text-align:center; font-size:13px;">${escapeHtml(s.hire_date || '—')}</td>
      <td style="text-align:center;"><span class="badge" style="font-size:13px; padding:2px 6px; ${s.duty_type === '日勤専従' ? 'background:var(--pine-tint-2); color:var(--secondary-color);' : 'background:var(--pine-tint); color:var(--pine-dark);'}">${escapeHtml(s.duty_type || '未設定')}</span></td>
      <td>${qualItemsHtml}</td>
      <td style="text-align:center;">${opHtml}</td>
    `;
    tbody.appendChild(tr);
  });

  const badgeContainer = document.getElementById("qualificationSummaryBadges");
  if (badgeContainer) {
    const carePct = careCount > 0 ? ((certifiedCareWorkerCount / careCount) * 100).toFixed(1) : "0";
    const planners = allStamps.filter(s => getStaffRoleCategory(s.name) === "caremanager");
    const plannerCm = planners.filter(s => cpStaffHasMasterQualification(s, 4)).length;
    badgeContainer.innerHTML = `
      <span class="badge qual-badge">全職員 ${allStamps.length}名（常勤${fullTimeCount}名・非常勤${partTimeCount}名）</span>
      <span class="badge qual-badge">介護職のうち介護福祉士 ${certifiedCareWorkerCount}/${careCount}名（${carePct}%）</span>
      <span class="badge qual-badge">計画作成担当者 ${planners.length}名（うち介護支援専門員 ${plannerCm}名）</span>
    `;
  }

  const area = document.getElementById("qualificationMasterSummaryArea");
  if (area) {
    const activeMasters = qMaster.filter(m => m.status !== "使わない");
    const listItemsHtml = activeMasters.map(m => {
      const cnt = masterCounts[m.id] || 0;
      return `<span class="badge" style="background:var(--ground); color:var(--ink); border:1px solid var(--line-2); font-size:13px; padding:3px 8px;">${escapeHtml(m.name)}: <strong>${cnt}名</strong></span>`;
    }).join(" ");

    const markedMasters = activeMasters.filter(m => m.has_mark === "あり");
    const markedCardsHtml = markedMasters.map(m => {
      const holders = allStamps.filter(s => cpStaffHasMasterQualification(s, m.id)).map(s => `${s.name}（${s.role || "職員"}）`);
      const holderText = holders.length > 0 ? holders.join("、") : "該当者なし";
      const links = cpFormatQualSourceLinksHtml(m.source_url);
      return `
        <div class="qual-master-card" style="margin-bottom:8px; padding:10px 12px; background:var(--pine-tint-2); border:1px solid var(--line-2); border-left:4px solid var(--pine); border-radius:4px;">
          <div style="font-size:13px; font-weight:bold; color:var(--ink); display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <span>${escapeHtml(m.name)}</span>
            <span class="badge qual-mark-badge">★基準の印</span>
            <span style="font-weight:normal; font-size:13px; color:var(--ink-2);">【${escapeHtml(m.mark_detail || "")}】</span>
          </div>
          <div style="font-size:13px; color:var(--ink-2); margin-top:4px;">
            <strong>保有者 (${holders.length}名):</strong> ${escapeHtml(holderText)}
          </div>
          <div style="font-size:13px; color:var(--ink-3); margin-top:2px;">
            <strong>出典URL:</strong> ${links || escapeHtml(m.source_url || "未設定")}
          </div>
        </div>
      `;
    }).join("");

    area.innerHTML = `
      <div style="border:1px solid var(--line-2); border-radius:6px; padding:12px; background:var(--surface);">
        <div style="font-weight:bold; font-size:14px; margin-bottom:8px; color:var(--ink);">マスタ登録資格・研修の集計と基準の印</div>
        <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px;">${listItemsHtml}</div>
        <div style="font-size:13px; font-weight:bold; color:var(--ink-2); margin-bottom:6px;">【人員基準・加算に関する資格・研修と公的根拠】</div>
        ${markedCardsHtml || `<div style="font-size:13px; color:var(--ink-3);">印のある資格・研修はありません。</div>`}
      </div>
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

 // [Claude修正] すでに勤務表がある月は、自動で作り直さない（夜勤の確定・記録を書いた職員と合わなくなるため）
 // 足りない職員・反映されていない希望休は、表の上に知らせる。作り直すときは「1ヶ月シフト自動生成」を押す
 const cpShiftIssues = [];
 if (currentData && Object.keys(currentData).length > 0) {
 careStaffNames.filter(name => !currentData[name]).forEach(name => cpShiftIssues.push(`${name} さんの勤務がこの月の表にありません`));
 (db.data.shift_hope_offs || []).filter(h => h.year_month === ym).forEach(h => {
 if (currentData[h.staff_name] && currentData[h.staff_name][h.day] !== "休") cpShiftIssues.push(`${h.staff_name} さんの希望休（${h.day}日）が「休」になっていません`);
 });
 needRegen = false;
 }
 if (needRegen) {
 generateMonthlyShiftData(ym);
 }
 const shiftData = db.data.monthly_shifts[ym] || {};

 const table = document.getElementById("shiftMatrixTable");
 if (!table) return;
 {
 let notice = document.getElementById("shiftRegenNotice");
 if (!notice) {
 notice = document.createElement("div");
 notice.id = "shiftRegenNotice";
 table.parentNode.insertBefore(notice, table);
 }
 notice.innerHTML = cpShiftIssues.length ? `<div style="background:var(--caution-tint); border:1px solid var(--line-2); border-radius:6px; padding:8px 12px; margin-bottom:8px; font-size:13px; color:var(--ink);"><strong>この月の勤務表で確かめてほしいこと（自動では作り直していません）</strong><br>${cpShiftIssues.map(t => "・" + escapeHtml(t)).join("<br>")}<br>直すときは表のマスを押して変えるか、「1ヶ月シフト自動生成」で作り直してください（作り直すと、この月の勤務は全部入れ替わります）。</div>` : "";
 }

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
 <span style="display:inline-block; font-size:11px; padding:2px 4px; border-radius:4px; font-weight:bold; background:${roleBg}; color:${roleColor};">${escapeHtml(st.role || '介護')}</span>
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
    <td class="shift-cell ${hol.isHoliday ? 'shift-holiday-col' : ''} ${isHope ? 'shift-cell-hope' : ''}" style="background:${cellBg};" onclick="openShiftCellPopover(event, '${safeName}', ${d}, '${sym}')" ondblclick="cycleShiftCell('${safeName}', ${d})" title="${escapeHtml(st.name)} ${month}月${d}日: ${isHope ? '【希望休】' + (hopeInfo.reason || '申請済') + ' - ' : ''}クリックして即時変更">
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

 if (roleCategory && roleCategory !== "care") {
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
 if (roleCategory && roleCategory !== "care") {
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

 if (roleCategory && roleCategory !== "care") {
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
 if (roleCategory && roleCategory !== "care" && symbol && symbol !== "日" && symbol !== "休") {
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
// [Claude追加 2026-10-22] 保存のときもサーバーが職種を見るので、画面でも先に止める（勤務表づくりは管理者・事務員、希望休は本人）
function cpShiftAdminOnly(what) {
 if (typeof isCurrentStaffAdminOrClerk === "function" && !isCurrentStaffAdminOrClerk()) {
  alert(`${what}は、管理者と事務員だけが変更できます。`);
  return false;
 }
 return true;
}
function cpHopeOffOwnOnly(staffName) {
 if (typeof isCurrentStaffAdminOrClerk === "function" && isCurrentStaffAdminOrClerk()) return true;
 if (staffName && staffName === cpLoginStaffName()) return true;
 alert("希望休は、ご本人の分だけ登録・解除できます（ほかの方の分は管理者・事務員）。");
 return false;
}
function openShiftNgModal() {
 if (!cpShiftAdminOnly("同じ勤務にしない組み合わせ")) return;
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
 if (!cpShiftAdminOnly("同じ勤務にしない組み合わせ")) return;
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
 if (!cpShiftAdminOnly("同じ勤務にしない組み合わせ")) return;
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
  const canAll = typeof isCurrentStaffAdminOrClerk === "function" && isCurrentStaffAdminOrClerk();
  const me = cpLoginStaffName();
  const shown = canAll ? staffList : staffList.filter(s => s.name === me); // 管理者・事務員でなければ本人だけ
  staffSel.innerHTML = shown.map(s => `<option value="${escapeHtml(s.name)}">${escapeHtml(s.name)} (${escapeHtml(s.role || "介護職員")})</option>`).join("");
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
 if (!cpHopeOffOwnOnly(staffName)) return;
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
 const hx = (db.data.shift_hope_offs || []).find(h => h.id === id);
 if (hx && !cpHopeOffOwnOnly(hx.staff_name)) return;
 if (!confirm("この希望休設定を削除しますか？")) return;
 const ym = getShiftYearMonth();
 db.data.shift_hope_offs = (db.data.shift_hope_offs || []).filter(h => h.id !== id);
 db.save();
 renderShiftHopeList();
 renderShiftTable(ym);
 if (typeof renderTodayShiftBar === "function") renderTodayShiftBar();
}

function toggleShiftHopeOff(staffName, day) {
 if (!cpHopeOffOwnOnly(staffName)) return;
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
 // [Claude修正] 職員がいないとき（ログイン前の空のデータなど）は作らない（作る→表示→作る…と止まらなくなる）
 if ((!db.data.monthly_shifts[ym] || Object.keys(db.data.monthly_shifts[ym]).length === 0) && (db.data.stamps || []).length > 0) {
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
   noticeEl.textContent = `親機PCと日時ごとの控えに最新データを保管しました (${now})`;
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
 if (desc) desc.textContent = "暗証番号（数字4桁）を入力してください";
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
 if (err) err.textContent = "暗証番号が一致しません";
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
 if (typeof renderOfficeCareRecordsExport === "function") {
  renderOfficeCareRecordsExport();
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
      ? `<span class="badge" style="background:#fef3c7; color:#92400e; border:1px solid #fde68a; padding:3px 8px; font-size:12px;">初期値のまま</span>`
      : `<span class="badge" style="background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd; padding:3px 8px; font-size:12px;">設定変更済み</span>`;

    const lockBtnLabel = isSuspended ? "ロック解除 (正常へ)" : "ロック (休止中へ)";
    const lockBtnStyle = isSuspended
      ? "background:#dcfce7; color:#166534; border-color:#86efac;"
      : "background:#fee2e2; color:#991b1b; border-color:#fca5a5;";

    const loginAcc = (db.data.staff_accounts || []).find(a => a && a.staff_name === s.name);
    tr.innerHTML = `
      <td><strong>${escapeHtml(s.name)}</strong></td>
      <td><code style="font-size:13px;">${escapeHtml((loginAcc && loginAcc.staff_id) || "-")}</code></td>
      <td><span style="font-size:12px; color:#4a5852;">${escapeHtml(s.role || "職員")}</span></td>
      <td>${statusBadge}</td>
      <td>${pinBadge}</td>
      <td>
        <div style="display:inline-flex; gap:6px; flex-wrap:wrap;">
          <button type="button" class="btn btn-secondary" style="font-size:11.5px; padding:3px 8px; ${lockBtnStyle}" onclick="toggleStaffAccountStatus('${escapeHtml(s.name)}')">${lockBtnLabel}</button>
          <button type="button" class="btn btn-secondary" style="font-size:11.5px; padding:3px 8px; background:#f6f8f6;" onclick="openResetStaffPinModal('${escapeHtml(s.name)}')">暗証番号を初期化</button>
          <button type="button" class="btn btn-secondary" style="font-size:11.5px; padding:3px 8px; background:#f6f8f6;" onclick="openAccountResetModal('${escapeHtml(s.name)}')">パスワードを初期化</button>
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
    if (!confirm(`【2名承認の確認】\n操作者: ${currentStaff}\n立ち会い承認者: ${app2Name}\n\n対象職員「${targetName}」の暗証番号を初期値に戻しますか？`)) return;
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
      alert(`【2名承認リセット完了】\n【${targetName}】様の暗証番号を初期値に戻しました。`);
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

  if (!confirm(`【2名承認の確認】\n操作者: ${currentStaff}\n立ち会い承認者: ${app2Name}\n\n対象職員「${targetName}」の暗証番号を初期値に戻しますか？`)) {
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

  alert(`【2名承認リセット完了】\n【${targetName}】様の暗証番号を初期値に戻しました。\n対象職員本人が次回ログイン時に新しい暗証番号を設定できるようになりました。`);
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



// ======================================================================
// 事務所ポータル：記録の書き出し（CSV・印刷・管理者および事務員専用） [Antigravity実装]
// ======================================================================

function cpCanExportCareRecords() {
 // [Claude修正] 職種の決まりを2か所に書かない。ほかの管理者・事務員だけの機能と同じ isStaffAdminOrClerk で、ログインした本人を見る
 if (!gState || !gState.session || !gState.session.staffName) return false;
 return isStaffAdminOrClerk(gState.session.staffName);
}

function cpPopulateExportResidentSelect() {
 const sel = document.getElementById("exportRecordResidentSelect");
 if (!sel) return;
 const curVal = sel.value;
 sel.innerHTML = `<option value="">選んでください</option><option value="ALL">全員（その期間に入居していた方）</option>`;
 const residents = (db && db.data && Array.isArray(db.data.residents)) ? db.data.residents : ((gState && Array.isArray(gState.residents)) ? gState.residents : []);
 const sorted = [...residents].sort((a, b) => String(a.room_no || "").localeCompare(String(b.room_no || ""), undefined, { numeric: true }));
 sorted.forEach(r => {
  const statusNote = (r.status && r.status !== "在所") ? ` (${r.status})` : "";
  const opt = document.createElement("option");
  opt.value = String(r.id);
  opt.textContent = `${r.room_no || "-"}号室 ${r.name || "名称未設定"} 様${statusNote}`;
  sel.appendChild(opt);
 });
 if (curVal) sel.value = curVal;
}

function renderOfficeCareRecordsExport() {
 const sec = document.getElementById("officeCareRecordsExportSection");
 if (!sec) return;
 if (!cpCanExportCareRecords()) {
  sec.style.display = "none";
  return;
 }
 sec.style.display = "block";
 cpPopulateExportResidentSelect();
}

function cpExportToggleAllTypes(checkAll) {
 const typeKeys = ["care_records", "vitals", "meals", "oral_cares", "excretions", "baths", "turns", "meds"];
 typeKeys.forEach(k => {
  const chk = document.getElementById(`chkExport_${k}`);
  if (chk) chk.checked = Boolean(checkAll);
 });
}

function cpGetSelectedTypeLabels(selectedTypes) {
 const labelMap = {
  care_records: "介護記録",
  vitals: "バイタル",
  meals: "食事・水分",
  oral_cares: "口腔ケア",
  excretions: "排泄",
  baths: "入浴",
  turns: "体位変換",
  meds: "服薬"
 };
 const labels = [];
 const keys = ["care_records", "vitals", "meals", "oral_cares", "excretions", "baths", "turns", "meds"];
 keys.forEach(k => {
  if (selectedTypes.has(k)) labels.push(labelMap[k]);
 });
 return labels;
}

function cpIsRecordTypeSelected(item, selectedTypes) {
 const src = item.source_type;
 if (selectedTypes.has("care_records") && (src === "care_records" || (!src && item.category !== "バイタル" && item.category !== "食事・水分" && item.category !== "口腔ケア" && item.category !== "排泄" && item.category !== "入浴" && item.category !== "体位変換" && item.category !== "服薬"))) return true;
 if (selectedTypes.has("vitals") && (src === "vitals" || item.category === "バイタル")) return true;
 if (selectedTypes.has("meals") && (src === "meals" || item.category === "食事・水分")) return true;
 if (selectedTypes.has("oral_cares") && (src === "oral_cares" || item.category === "口腔ケア")) return true;
 if (selectedTypes.has("excretions") && (src === "excretions" || item.category === "排泄")) return true;
 if (selectedTypes.has("baths") && (src === "baths" || item.category === "入浴")) return true;
 if (selectedTypes.has("turns") && (src === "turns" || item.category === "体位変換")) return true;
 if (selectedTypes.has("meds") && (src === "meds" || item.category === "服薬")) return true;
 return false;
}

function cpValidateExportInputs() {
 if (!cpCanExportCareRecords()) {
  alert("権限がありません。記録の書き出し・印刷は管理者および事務員のみ実行できます。");
  return null;
 }
 const selRes = document.getElementById("exportRecordResidentSelect");
 const resVal = selRes ? selRes.value : "";
 if (!resVal) {
  alert("利用者を選択してください（「選んでください」のままでは書き出せません）。");
  return null;
 }

 const startDateInput = document.getElementById("exportRecordStartDate");
 const endDateInput = document.getElementById("exportRecordEndDate");
 const startDate = startDateInput ? startDateInput.value.trim() : "";
 const endDate = endDateInput ? endDateInput.value.trim() : "";

 if (!startDate || !endDate) {
  alert("期間（開始日および終了日）を入力してください。");
  return null;
 }
 if (startDate > endDate) {
  alert("開始日は終了日以前の日付を指定してください。");
  return null;
 }
 const today = (typeof toLocalDateStr === "function") ? toLocalDateStr(new Date()) : new Date().toISOString().slice(0, 10);
 if (startDate > today || endDate > today) {
  alert("未来の日付は指定できません（本日以前の日付を指定してください）。");
  return null;
 }

 const dStart = new Date(startDate + "T00:00:00");
 const dEnd = new Date(endDate + "T00:00:00");
 const diffDays = Math.round((dEnd.getTime() - dStart.getTime()) / (1000 * 60 * 60 * 24));
 if (diffDays > 366) {
  alert("期間は最長1年以内で指定してください。");
  return null;
 }

 const selectedTypes = new Set();
 const typeKeys = ["care_records", "vitals", "meals", "oral_cares", "excretions", "baths", "turns", "meds"];
 typeKeys.forEach(k => {
  const chk = document.getElementById(`chkExport_${k}`);
  if (chk && chk.checked) {
   selectedTypes.add(k);
  }
 });
 if (selectedTypes.size === 0) {
  alert("記録の種類を1つ以上選択してください。");
  return null;
 }

 const includeVoided = Boolean(document.getElementById("exportRecordIncludeVoided")?.checked);

 return {
  resVal,
  startDate,
  endDate,
  selectedTypes,
  includeVoided
 };
}

function cpCollectExportRecords(inputs) {
 const { resVal, startDate, endDate, selectedTypes, includeVoided } = inputs;
 const residents = (db && db.data && Array.isArray(db.data.residents)) ? db.data.residents : ((gState && Array.isArray(gState.residents)) ? gState.residents : []);

 let targetResidents = [];
 if (resVal === "ALL") {
  targetResidents = residents.filter(r => {
   if (!r) return false;
   if (r.admission_date && r.admission_date > endDate) return false;
   if (typeof cpIsDischarged === "function" && cpIsDischarged(r) && r.discharge_date && r.discharge_date < startDate) return false;
   if (r.status === "退居" && r.discharge_date && r.discharge_date < startDate) return false;
   return true;
  });
  targetResidents.sort((a, b) => String(a.room_no || "").localeCompare(String(b.room_no || ""), undefined, { numeric: true }));
 } else {
  const single = residents.find(r => String(r.id) === String(resVal));
  if (single) targetResidents.push(single);
 }

 const allRecords = [];

 targetResidents.forEach(res => {
  // [Antigravity改善] 日数×人数の探し直しを解消するため、利用者ごとに全期間（isAllScope=true）で1回だけ取得し、
  // メモリ上で期間（startDate〜endDate）および入居日・退居日の範囲内に絞り込む
  const unifiedItems = (typeof cpBuildUnifiedResidentRecords === "function")
   ? cpBuildUnifiedResidentRecords(res.id, null, true, includeVoided)
   : [];

  unifiedItems.forEach(item => {
   const itemDate = item.date || (item.recorded_at ? item.recorded_at.slice(0, 10) : "");
   if (!itemDate || itemDate < startDate || itemDate > endDate) return;
   if (res.admission_date && itemDate < res.admission_date) return;
   if (res.discharge_date && itemDate > res.discharge_date) return;
   if (!includeVoided && item.voided) return;
   if (!cpIsRecordTypeSelected(item, selectedTypes)) return;

   allRecords.push({
    resident_id: res.id,
    room_no: res.room_no || "",
    resident_name: res.name || "",
    date: item.date || itemDate,
    time: item.time || (item.recorded_at && item.recorded_at.length >= 16 ? item.recorded_at.slice(11, 16) : "00:00"),
    recorded_at: item.recorded_at || (itemDate ? `${itemDate} 00:00` : "00:00"),
    category: item.category || "介護記録",
    content: item.content || "",
    staff_name: item.staff_name || "未記録",
    voided: Boolean(item.voided),
    void_reason: item.void_reason || "",
    voided_by: item.voided_by || "",
    voided_at: item.voided_at || "",
    raw: item
   });
  });
 });

 if (resVal === "ALL") {
  allRecords.sort((a, b) => {
   const roomCmp = String(a.room_no || "").localeCompare(String(b.room_no || ""), undefined, { numeric: true });
   if (roomCmp !== 0) return roomCmp;
   if (a.resident_id !== b.resident_id) return a.resident_id - b.resident_id;
   return (a.recorded_at || "").localeCompare(b.recorded_at || "");
  });
 } else {
  allRecords.sort((a, b) => (a.recorded_at || "").localeCompare(b.recorded_at || ""));
 }

 return { targetResidents, allRecords };
}

function cpEscapeCsvField(val) {
 if (val === null || val === undefined) return "";
 let s = String(val);
 if (s.includes('"') || s.includes(",") || s.includes("\r") || s.includes("\n")) {
  s = '"' + s.replace(/"/g, '""') + '"';
 }
 return s;
}

function cpBuildCareRecordsCsv(records) {
 const bom = "\uFEFF";
 const lines = [];
 lines.push(["部屋番号", "利用者名", "日付", "時刻", "種類", "内容", "記録者", "取消"].map(cpEscapeCsvField).join(","));

 (records || []).forEach(r => {
  if (!r) return;
  let voidCol = "";
  if (r.voided) {
   const reasonPart = r.void_reason ? `理由: ${r.void_reason}` : "理由: なし";
   const whoPart = r.voided_by ? `取消者: ${r.voided_by}` : "取消者: 未記録";
   voidCol = `取消（${reasonPart} / ${whoPart}）`;
  }
  const row = [
   r.room_no || "",
   r.resident_name || "",
   r.date || "",
   r.time || "",
   r.category || "",
   r.content || "",
   r.staff_name || "",
   voidCol
  ];
  lines.push(row.map(cpEscapeCsvField).join(","));
 });

 return bom + lines.join("\r\n") + "\r\n";
}

function cpBuildCareRecordsPrintHtml(collected, inputs) {
 // [Claude修正] facility_settings という項目はなく、いつも「介護付きグループホーム」と出ていた。施設名は getFacilityName（設定の施設名）から
 const facilityName = (typeof getFacilityName === "function") ? getFacilityName() : "";
 let targetLabel = "全員（期間中の全入居者）";
 if (inputs.resVal !== "ALL") {
  const r = collected.targetResidents[0];
  targetLabel = r ? `${r.room_no || "-"}号室 ${r.name} 様` : "個別利用者";
 }
 const typeLabels = cpGetSelectedTypeLabels(inputs.selectedTypes);
 const staffName = (gState.session && gState.session.staffName) ? gState.session.staffName : (typeof cpLoginStaffName === "function" ? cpLoginStaffName() : "管理者");
 const nowStr = (typeof toLocalDateTimeStr === "function") ? toLocalDateTimeStr(new Date()) : new Date().toLocaleString("ja-JP");

 const recordsByRes = new Map();
 collected.targetResidents.forEach(res => {
  recordsByRes.set(res.id, []);
 });
 collected.allRecords.forEach(r => {
  if (!recordsByRes.has(r.resident_id)) recordsByRes.set(r.resident_id, []);
  recordsByRes.get(r.resident_id).push(r);
 });

 const residentSectionsHtml = [];
 let resIndex = 0;

 recordsByRes.forEach((recs, rId) => {
  const res = collected.targetResidents.find(x => x.id === rId);
  const room = res ? (res.room_no || "-") : "-";
  const name = res ? res.name : "利用者";
  const isFirst = (resIndex === 0);
  resIndex++;

  const pageBreakStyle = isFirst ? "" : "page-break-before: always; break-before: page; margin-top: 24px;";

  let rowsHtml = "";
  if (recs.length === 0) {
   rowsHtml = `<tr><td colspan="5" style="padding:10px; text-align:center; color:var(--ink-3); font-size:13px;">期間内の対象記録はありません</td></tr>`;
  } else {
   rowsHtml = recs.map(r => {
    let voidText = "";
    let contentStyle = "";
    if (r.voided) {
     contentStyle = "text-decoration: line-through; color: var(--ink-3);";
     const reasonPart = r.void_reason ? `理由: ${r.void_reason}` : "理由: なし";
     const whoPart = r.voided_by ? `取消者: ${r.voided_by}` : "取消者: 未記録";
     voidText = `<span style="display:inline-block; font-size:13px; color:var(--alert); font-weight:bold;">［取消: ${escapeHtml(reasonPart)} / ${escapeHtml(whoPart)}］</span>`;
    }
    return `
     <tr style="break-inside: avoid; page-break-inside: avoid; border-bottom: 1px solid var(--line);">
      <td style="padding: 6px 8px; font-size: 13px; white-space: nowrap; vertical-align: top; color: var(--ink);">${escapeHtml(r.date)} ${escapeHtml(r.time)}</td>
      <td style="padding: 6px 8px; font-size: 13px; white-space: nowrap; vertical-align: top; color: var(--pine-dark); font-weight: bold;">${escapeHtml(r.category)}</td>
      <td style="padding: 6px 8px; font-size: 13px; vertical-align: top; line-height: 1.5; color: var(--ink); ${contentStyle}">${escapeHtml(r.content)} ${voidText}</td>
      <td style="padding: 6px 8px; font-size: 13px; white-space: nowrap; vertical-align: top; color: var(--ink);">${escapeHtml(r.staff_name)}</td>
      <td style="padding: 6px 8px; font-size: 13px; white-space: nowrap; vertical-align: top; color: var(--ink); text-align: center;">${r.voided ? '<span style="color:var(--alert); font-weight:bold;">取消</span>' : '-'}</td>
     </tr>
    `;
   }).join("");
  }

  residentSectionsHtml.push(`
   <div style="${pageBreakStyle}">
    <div style="background: var(--surface-2); border: 1px solid var(--line); border-radius: 4px; padding: 8px 12px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
     <strong style="font-size: 15px; color: var(--pine-dark);">【${escapeHtml(room)}号室 ${escapeHtml(name)} 様】 記録一覧</strong>
     <span style="font-size: 13px; color: var(--ink-2);">対象件数: ${recs.length} 件</span>
    </div>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px; border: 1px solid var(--line);">
     <thead>
      <tr style="background: var(--ground); border-bottom: 2px solid var(--pine);">
       <th style="padding: 6px 8px; font-size: 13px; text-align: left; width: 15%; color: var(--ink);">日時</th>
       <th style="padding: 6px 8px; font-size: 13px; text-align: left; width: 13%; color: var(--ink);">種類</th>
       <th style="padding: 6px 8px; font-size: 13px; text-align: left; width: 52%; color: var(--ink);">内容</th>
       <th style="padding: 6px 8px; font-size: 13px; text-align: left; width: 12%; color: var(--ink);">記録者</th>
       <th style="padding: 6px 8px; font-size: 13px; text-align: center; width: 8%; color: var(--ink);">状態</th>
      </tr>
     </thead>
     <tbody>
      ${rowsHtml}
     </tbody>
    </table>
   </div>
  `);
 });

 return `
  <div style="font-family: var(--font-family); color: var(--ink); background: var(--surface); padding: 12px; box-sizing: border-box;">
   <!-- 1ページ目上部ヘッダー -->
   <div style="border-bottom: 2px solid var(--pine); padding-bottom: 10px; margin-bottom: 16px;">
    <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 8px;">
     <div>
      <h2 style="font-size: 18px; font-weight: bold; color: var(--pine-dark); margin: 0 0 6px 0;">介護記録出力一覧</h2>
      <div style="font-size: 13px; color: var(--ink-2);">施設名: <strong>${escapeHtml(facilityName)}</strong></div>
     </div>
     <div style="text-align: right; font-size: 13px; color: var(--ink-2);">
      <div>印刷日時: ${escapeHtml(nowStr)}</div>
      <div>印刷担当者: <strong>${escapeHtml(staffName)}</strong></div>
      <div>総出力件数: 計 <strong>${collected.allRecords.length}</strong> 件</div>
     </div>
    </div>
    <div style="margin-top: 10px; background: var(--ground); border: 1px solid var(--line); border-radius: 4px; padding: 8px 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 13px;">
     <div>対象利用者: <strong>${escapeHtml(targetLabel)}</strong></div>
     <div>対象期間: <strong>${escapeHtml(inputs.startDate)} 〜 ${escapeHtml(inputs.endDate)}</strong></div>
     <div style="grid-column: 1 / -1;">出力種類: <strong>${escapeHtml(typeLabels.join("、"))}</strong> ${inputs.includeVoided ? '<span style="color:var(--alert); margin-left:8px;">(取消記録含む)</span>' : ''}</div>
    </div>
   </div>

   <!-- 利用者別レコードセクション (改ページ対応) -->
   ${residentSectionsHtml.join("")}

   <div style="margin-top: 24px; border-top: 1px solid var(--line); padding-top: 8px; display: flex; justify-content: space-between; font-size: 13px; color: var(--ink-3);">
    <span>ケアポータル 統合管理システム (介護記録出力)</span>
    <span>確認印: __________________</span>
   </div>
  </div>
 `;
}

function cpLogCareRecordsExport(actionType, targetResidentName, startDate, endDate, typeLabels, count) {
 if (!db || !db.data) return;
 if (!Array.isArray(db.data.settings_logs)) db.data.settings_logs = [];
 const staffName = (gState.session && gState.session.staffName) ? gState.session.staffName : (typeof cpLoginStaffName === "function" ? cpLoginStaffName() : "管理者");
 const nowStr = (typeof toLocalDateTimeStr === "function") ? toLocalDateTimeStr(new Date()) : new Date().toLocaleString("ja-JP");

 db.data.settings_logs.push({
  id: Date.now() + Math.floor(Math.random() * 1000),
  at: nowStr,
  by: staffName,
  kind: "記録の書き出し",
  action: actionType,
  detail: `出力形式: ${actionType} / 利用者: ${targetResidentName} / 期間: ${startDate}〜${endDate} / 種類: ${typeLabels.join("、")} / 件数: ${count}件`
 });
 if (typeof db.save === "function") db.save();
}

function cpExportCareRecordsCsv() {
 if (!cpCanExportCareRecords()) {
  alert("権限がありません。記録の書き出しは管理者および事務員のみ実行できます。");
  return;
 }
 const inputs = cpValidateExportInputs();
 if (!inputs) return;

 const collected = cpCollectExportRecords(inputs);
 if (collected.allRecords.length === 0) {
  alert("指定された期間・条件に該当する記録がありません。");
  return;
 }

 const csvString = cpBuildCareRecordsCsv(collected.allRecords);
 const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });

 let targetLabel = "全員";
 if (inputs.resVal !== "ALL") {
  const r = collected.targetResidents[0];
  targetLabel = r ? r.name.replace(/[\s\r\n\t]/g, "") : "個別";
 }
 const filename = `記録_${targetLabel}_${inputs.startDate}_${inputs.endDate}.csv`;

 const link = document.createElement("a");
 link.href = URL.createObjectURL(blob);
 link.download = filename;
 document.body.appendChild(link);
 link.click();
 document.body.removeChild(link);
 URL.revokeObjectURL(link.href);

 const typeLabels = cpGetSelectedTypeLabels(inputs.selectedTypes);
 cpLogCareRecordsExport("CSV出力", (inputs.resVal === "ALL" ? "全員" : (collected.targetResidents[0] ? collected.targetResidents[0].name : "個別")), inputs.startDate, inputs.endDate, typeLabels, collected.allRecords.length);

 const statusEl = document.getElementById("exportRecordStatusNotice");
 if (statusEl) {
  statusEl.textContent = `CSVファイルを書き出しました（計 ${collected.allRecords.length} 件）`;
  setTimeout(() => { if (statusEl) statusEl.textContent = ""; }, 5000);
 }
}

function cpPrintCareRecords() {
 if (!cpCanExportCareRecords()) {
  alert("権限がありません。記録の印刷は管理者および事務員のみ実行できます。");
  return;
 }
 const inputs = cpValidateExportInputs();
 if (!inputs) return;

 const collected = cpCollectExportRecords(inputs);
 if (collected.allRecords.length === 0) {
  alert("指定された期間・条件に該当する記録がありません。");
  return;
 }

 // [Antigravity追加] 1万件を超える場合の確認（印刷ページ数目安の案内とCSV推奨）
 if (collected.allRecords.length > 10000) {
  const estPages = Math.ceil(collected.allRecords.length / 25);
  const ok = confirm(`${collected.allRecords.length}件あります。時間がかかったり、印刷すると${estPages}ページ以上になります。CSV での書き出しをおすすめします。続けますか？`);
  if (!ok) return;
 }

 const html = cpBuildCareRecordsPrintHtml(collected, inputs);
 if (typeof runPrintJob === "function") {
  runPrintJob(html, { page: "A4 portrait", fitOnePage: false });
 } else {
  alert("印刷機能の初期化に失敗しました。");
  return;
 }

 const typeLabels = cpGetSelectedTypeLabels(inputs.selectedTypes);
 cpLogCareRecordsExport("印刷", (inputs.resVal === "ALL" ? "全員" : (collected.targetResidents[0] ? collected.targetResidents[0].name : "個別")), inputs.startDate, inputs.endDate, typeLabels, collected.allRecords.length);

 const statusEl = document.getElementById("exportRecordStatusNotice");
 if (statusEl) {
  statusEl.textContent = `印刷データを準備しました（計 ${collected.allRecords.length} 件）`;
  setTimeout(() => { if (statusEl) statusEl.textContent = ""; }, 5000);
 }
}

window.cpCanExportCareRecords = cpCanExportCareRecords;
window.cpPopulateExportResidentSelect = cpPopulateExportResidentSelect;
window.renderOfficeCareRecordsExport = renderOfficeCareRecordsExport;
window.cpExportToggleAllTypes = cpExportToggleAllTypes;
window.cpGetSelectedTypeLabels = cpGetSelectedTypeLabels;
window.cpIsRecordTypeSelected = cpIsRecordTypeSelected;
window.cpValidateExportInputs = cpValidateExportInputs;
window.cpCollectExportRecords = cpCollectExportRecords;
window.cpEscapeCsvField = cpEscapeCsvField;
window.cpBuildCareRecordsCsv = cpBuildCareRecordsCsv;
window.cpBuildCareRecordsPrintHtml = cpBuildCareRecordsPrintHtml;
window.cpLogCareRecordsExport = cpLogCareRecordsExport;
window.cpExportCareRecordsCsv = cpExportCareRecordsCsv;
window.cpPrintCareRecords = cpPrintCareRecords;
