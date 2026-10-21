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
// [Claude修正 2026-10-18] 欄ごとに変えられる人を分ける（ユーザーと決定）
// ・ケアプラン目標: 計画作成担当者（ケアマネ）だけ。本人・家族に説明して同意をもらった日を必ず入れる
//   （根拠: 指定地域密着型サービス基準。計画作成担当者が作成し、利用者または家族に説明して同意を得て交付する。変更も同じ）
// ・バイタルの注意の目安: 看護師だけ（主治医の指示を入れる）
// ・基本方針（急変時・看取り）: 管理者・計画作成担当者・看護師
// ・見守りの注意: 全員
// 変えた内容は利用者の変更履歴に残す
function cpRoleFlags(name) {
 const role = cpStaffRoleOf(name || cpLoginStaffName());
 return {
  director: /施設長|管理者/.test(role),
  caremanager: /計画作成|介護支援専門員|ケアマネ/.test(role),
  nurse: role.includes("看護")
 };
}
function cpCanEditCarePlanGoal() { return cpRoleFlags().caremanager; }
function cpCanEditVitalLimits() { return cpRoleFlags().nurse; }
function cpCanEditPolicy() { const f = cpRoleFlags(); return f.director || f.caremanager || f.nurse; }
const CP_CAREPLAN_PARTS = {
 policy: { label: "基本方針", who: "管理者・計画作成担当者・看護師", can: () => cpCanEditPolicy() },
 sensor: { label: "見守りの注意", who: "全員", can: () => true },
 vital: { label: "バイタルの注意の目安", who: "看護師", can: () => cpCanEditVitalLimits() }
};
function cpVitalLimitsText(r) {
 const v = (x, unit) => (x === null || x === undefined || x === "") ? "未設定" : `${x}${unit}`;
 return [
  `最高血圧 上限 ${v(r.bp_high_max, "mmHg")}・下限 ${v(r.bp_high_min, "mmHg")}`,
  `体温 上限 ${v(r.temp_max, "℃")}`,
  `SpO2 下限 ${v(r.spo2_min, "%")}`,
  `脈拍 上限 ${v(r.pulse_max, "回/分")}・下限 ${v(r.pulse_min, "回/分")}`
 ];
}
// [Antigravity実装 2026-10-19] 選択中・指定利用者の「実施中」のケアプランを取得
function cpGetActiveCarePlanForResident(resId) {
 const list = (db && db.data && Array.isArray(db.data.care_plans)) ? db.data.care_plans : [];
 const matches = list.filter(p => p && !p.voided && Number(p.resident_id) === Number(resId) && p.status === "実施中");
 if (!matches.length) return null;
 matches.sort((a, b) => (Number(b.version) || 0) - (Number(a.version) || 0));
 return matches[0];
}

function cpCarePlanSectionHtml(r) {
 const activePlan = cpGetActiveCarePlanForResident(r.id); // [Antigravity実装 2026-10-19]
 const btn = (part) => CP_CAREPLAN_PARTS[part].can()
  ? `<button type="button" class="btn btn-secondary cp-part-btn" onclick="event.preventDefault(); event.stopPropagation(); openCarePlanModal(${r.id}, '${part}'); return false;">変更</button>`
  : `<span class="cp-part-who">変更は${CP_CAREPLAN_PARTS[part].who}</span>`;
 const val = (x) => x ? escapeHtml(String(x)) : `<span class="cp-unset">未設定</span>`;
 const consent = r.care_plan_goal ? (r.care_plan_consent_date ? `<div class="cp-part-sub">本人・家族への説明と同意: ${escapeHtml(r.care_plan_consent_date)}</div>` : `<div class="cp-part-sub">本人・家族への説明と同意: 未記入</div>`) : "";
 const vitalLines = cpVitalLimitsText(r);
 const vitalSet = [r.bp_high_max, r.bp_high_min, r.temp_max, r.spo2_min, r.pulse_max, r.pulse_min].some(x => x !== null && x !== undefined && x !== "");

 // [Claude修正 2026-10-19] ケアプラン目標はケアプランのタブからだけ出す（カルテで直接は変えない）。課題ごとに長期・短期目標と期間を出す
 // ユーザー「ケアプランみなさんの作成しないと目標に入っているのはおかしい」「長期と短期目標があるはず」
 const legacyGoal = r.care_plan_goal ? `<div class="cp-part-sub">以前のケアプラン目標（参考・ケアプランのタブができる前の記録）: ${escapeHtml(r.care_plan_goal)}${r.care_plan_consent_date ? "（同意日 " + escapeHtml(r.care_plan_consent_date) + "）" : ""}</div>` : "";
 const openPlanBtn = `<div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px; flex-shrink:0;"><span class="cp-part-who">ケアプランのタブで変えます</span><button type="button" class="btn btn-secondary cp-part-btn" onclick="event.preventDefault(); event.stopPropagation(); selectResident(${r.id}); switchCareTab('careplan'); return false;">ケアプランを開く</button></div>`;
 let goalRowHtml = "";
 if (activePlan) {
  const per = (f, t) => (f || t) ? `（${escapeHtml(f || "未定")}〜${escapeHtml(t || "未定")}）` : "";
  const needsHtml = (Array.isArray(activePlan.needs) ? activePlan.needs : []).filter(n => n).map(n => `<div class="cp-goal-need">
   <div class="cp-goal-need-title">${escapeHtml(n.need || "課題（未記入）")}</div>
   <div><span class="cp-goal-kind">長期</span>${n.long_goal ? escapeHtml(n.long_goal) : '<span class="cp-unset">未記入</span>'} <span class="cp-part-sub" style="display:inline;">${per(n.long_from, n.long_to)}</span></div>
   <div><span class="cp-goal-kind">短期</span>${n.short_goal ? escapeHtml(n.short_goal) : '<span class="cp-unset">未記入</span>'} <span class="cp-part-sub" style="display:inline;">${per(n.short_from, n.short_to)}</span></div>
  </div>`.replace(/>\s+</g, "><")).join(""); // 欄が pre-wrap なので、タグの間の改行・空白を詰める
  const consentDate = (activePlan.consent && activePlan.consent.consented_on) ? activePlan.consent.consented_on : "";
  const consentSub = `<div class="cp-part-sub">実施中: 第${Number(activePlan.version) || 1}版${consentDate ? " ／ 本人・家族への説明と同意: " + escapeHtml(consentDate) : ""}</div>`;
  goalRowHtml = `<div class="cp-part-row"><div style="flex:1; min-width:0;"><div class="cp-part-label">ケアプラン目標</div><div class="cp-part-val">${needsHtml || '<span class="cp-unset">課題・目標が未記入</span>'}</div>${consentSub}</div>${openPlanBtn}</div>`;
 } else {
  const plans = (db && db.data && Array.isArray(db.data.care_plans)) ? db.data.care_plans.filter(p => p && !p.voided && Number(p.resident_id) === Number(r.id)) : [];
  const draft = plans.find(p => p.status === "作成中" || p.status === "同意待ち");
  const msg = draft ? `第${Number(draft.version) || 1}版を${escapeHtml(draft.status)}（実施中のケアプランはありません）` : (plans.length ? "実施中のケアプランはありません（前の版は終了）" : "ケアプラン未作成（ケアプランのタブで作成してください）");
  goalRowHtml = `<div class="cp-part-row"><div style="flex:1; min-width:0;"><div class="cp-part-label">ケアプラン目標</div><div class="cp-part-val"><span class="cp-unset">${msg}</span></div>${legacyGoal}</div>${openPlanBtn}</div>`;
 }
 if (activePlan && legacyGoal) goalRowHtml = goalRowHtml.replace('</div>' + openPlanBtn, legacyGoal + '</div>' + openPlanBtn);

 return `<details class="care-accordion cp-part-acc" open>
 <summary class="cp-part-summary">
 <span>基本方針・ケアプラン目標・見守り注意</span>
 <span class="cp-part-summary-vital">バイタルの注意の目安: ${vitalSet ? escapeHtml(vitalLines.join(" ／ ")) : "未設定"}</span>
 <span style="display:flex; align-items:center; gap:8px;">
 <button type="button" class="btn btn-secondary cp-part-btn" onclick="event.preventDefault(); event.stopPropagation(); openCarePlanModal(${r.id}, 'all'); return false;">まとめて変更</button>
 <span class="cp-part-who">(開閉)</span>
 </span>
 </summary>
 <div class="cp-part-body">
 <div class="cp-part-row"><div><div class="cp-part-label">基本方針</div><div class="cp-part-val">${val(r.policy_stamp)}</div></div>${btn("policy")}</div>
 ${goalRowHtml}
 <div class="cp-part-row${(r.sensor_alert && !/^(なし|無し|特になし)$/.test(String(r.sensor_alert).trim())) ? " cp-part-row-alert" : ""}"><div><div class="cp-part-label">見守りの注意（離床センサーなど）</div><div class="cp-part-val">${val(r.sensor_alert)}</div></div>${btn("sensor")}</div>
 <div class="cp-part-row"><div><div class="cp-part-label">バイタルの注意の目安</div><div class="cp-part-val">${vitalLines.map(escapeHtml).join("<br>")}</div></div>${btn("vital")}</div>
 </div>
 </details>`;
}

function openCarePlanModal(resId, part = 'all') {
 const targetId = (resId !== undefined && resId !== null && resId !== '') ? Number(resId) : Number(gState.selectedResidentId);
 const r = gState.residents ? gState.residents.find(x => Number(x.id) === targetId) : null;
 if (!r) return;
 if (part === 'sensor_focus') part = 'sensor';
 const activePlan = cpGetActiveCarePlanForResident(r.id); // [Antigravity実装 2026-10-19]
 if (part === 'goal') { // [Claude修正 2026-10-19] ケアプラン目標はカルテでは変えない
  alert("ケアプラン目標は「ケアプラン」のタブで作ります・変えます。");
  selectResident(r.id);
  switchCareTab('careplan');
  return;
 }
 const parts = (part === 'all' ? Object.keys(CP_CAREPLAN_PARTS) : [part]).filter(p => {
  if (p === 'goal' && activePlan) return false; // [Antigravity実装 2026-10-19] 実施中の版があるときはカルテから変えない
  return CP_CAREPLAN_PARTS[p] && CP_CAREPLAN_PARTS[p].can();
 });
 if (!parts.length) {
  alert(`${CP_CAREPLAN_PARTS[part] ? CP_CAREPLAN_PARTS[part].label + "を変えられるのは" + CP_CAREPLAN_PARTS[part].who + "です。" : "変えられる項目がありません。"}`);
  return;
 }
 const titleEl = document.getElementById("carePlanModalTitle");
 if (titleEl) titleEl.textContent = `${parts.length === 1 ? CP_CAREPLAN_PARTS[parts[0]].label : "基本方針・見守り注意・バイタルの目安"}の変更（${r.name} 様）`;
 document.getElementById("carePlanResidentId").value = r.id;
 document.getElementById("carePlanParts").value = parts.join(",");
 Object.keys(CP_CAREPLAN_PARTS).forEach(p => {
  const box = document.getElementById("cpmPart_" + p);
  if (box) box.style.display = parts.includes(p) ? "" : "none";
 });
 const note = document.getElementById("cpmNotAllowed");
 if (note) {
  const hidden = part === 'all' ? Object.keys(CP_CAREPLAN_PARTS).filter(p => !parts.includes(p)) : [];
  note.textContent = hidden.length ? hidden.map(p => (p === 'goal' && activePlan) ? "ケアプラン目標はケアプランのタブで変えます。" : `${CP_CAREPLAN_PARTS[p].label}は${CP_CAREPLAN_PARTS[p].who}が変えます。`).join("") : "";
  note.style.display = hidden.length ? "" : "none";
 }
 const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = (v === null || v === undefined) ? "" : v; };
 set("quickPolicyStamp", r.policy_stamp || "");
 set("quickCarePlanGoal", r.care_plan_goal || "");
 set("quickCarePlanConsentDate", "");
 const lastConsent = document.getElementById("quickCarePlanConsentLast");
 if (lastConsent) lastConsent.textContent = r.care_plan_consent_date ? `前回の説明と同意: ${r.care_plan_consent_date}` : "";
 set("quickSensorAlert", r.sensor_alert || "");
 set("quickBpHMax", r.bp_high_max); set("quickBpHMin", r.bp_high_min);
 set("quickTempMax", r.temp_max); set("quickSpo2Min", r.spo2_min);
 set("quickPulseMax", r.pulse_max); set("quickPulseMin", r.pulse_min);
 const modal = document.getElementById("carePlanModal");
 if (modal) { modal.style.display = "flex"; modal.style.zIndex = "2500"; }
 setTimeout(() => {
  const first = { policy: "quickPolicyStamp", goal: "quickCarePlanGoal", sensor: "quickSensorAlert", vital: "quickBpHMax" }[parts[0]];
  const el = document.getElementById(first); if (el) el.focus();
 }, 100);
}

function submitCarePlanModal() {
 const id = parseInt(document.getElementById("carePlanResidentId").value, 10);
 const r = gState.residents ? gState.residents.find(x => Number(x.id) === id) : null;
 if (!r) return;
 const parts = (document.getElementById("carePlanParts").value || "").split(",").filter(p => CP_CAREPLAN_PARTS[p]);
 // 開いたあとで変える権限がなくなった項目は保存しない
 for (const p of parts) {
  if (!CP_CAREPLAN_PARTS[p].can()) { alert(`${CP_CAREPLAN_PARTS[p].label}を変えられるのは${CP_CAREPLAN_PARTS[p].who}です。`); return; }
 }
 const num = (elId, isFloat) => { const v = document.getElementById(elId).value.trim(); if (v === "") return null; const n = isFloat ? parseFloat(v) : parseInt(v, 10); return isNaN(n) ? NaN : n; };
 const next = {};
 if (parts.includes("policy")) {
  if (!cpRequireSelect("quickPolicyStamp", "基本方針")) return;
  next.policy_stamp = document.getElementById("quickPolicyStamp").value;
 }
 if (parts.includes("goal")) {
  next.care_plan_goal = document.getElementById("quickCarePlanGoal").value.trim();
  if (next.care_plan_goal !== (r.care_plan_goal || "")) {
   const cd = document.getElementById("quickCarePlanConsentDate").value;
   if (!cd) { alert("ケアプラン目標を変えるときは、本人・家族に説明して同意をもらった日を入れてください。"); document.getElementById("quickCarePlanConsentDate").focus(); return; }
   if (cd > toLocalDateStr(new Date())) { alert("説明と同意の日に、先の日付は入れられません。"); return; }
   next.care_plan_consent_date = cd;
  }
 }
 if (parts.includes("sensor")) next.sensor_alert = document.getElementById("quickSensorAlert").value.trim();
 if (parts.includes("vital")) {
  next.bp_high_max = num("quickBpHMax"); next.bp_high_min = num("quickBpHMin");
  next.temp_max = num("quickTempMax", true); next.spo2_min = num("quickSpo2Min");
  next.pulse_max = num("quickPulseMax"); next.pulse_min = num("quickPulseMin");
  if (["bp_high_max", "bp_high_min", "temp_max", "spo2_min", "pulse_max", "pulse_min"].some(k => Number.isNaN(next[k]))) { alert("バイタルの注意の目安には数字を入れてください。"); return; }
  if (next.bp_high_max !== null && next.bp_high_min !== null && next.bp_high_min >= next.bp_high_max) { alert("最高血圧の下限は、上限より小さい数字にしてください。"); return; }
  if (next.pulse_max !== null && next.pulse_min !== null && next.pulse_min >= next.pulse_max) { alert("脈拍の下限は、上限より小さい数字にしてください。"); return; }
 }
 const norm = v => (v === undefined || v === "" ? null : v);
 const changedKeys = Object.keys(next).filter(k => norm(r[k]) !== norm(next[k]));
 if (!changedKeys.length) { closeModal("carePlanModal"); alert("変わったところはありません。"); return; }
 const cpOld = Object.assign({}, r);
 changedKeys.forEach(k => { r[k] = next[k]; });
 cpAppendEditHistory(r, cpOld, ["policy_stamp", "care_plan_goal", "care_plan_consent_date", "sensor_alert", "bp_high_max", "bp_high_min", "temp_max", "spo2_min", "pulse_max", "pulse_min"]);
 db.save();
 closeModal("carePlanModal");
 renderResidentDetail();
 const labels = [...new Set(changedKeys.map(k => k === "policy_stamp" ? "基本方針" : (k === "care_plan_goal" || k === "care_plan_consent_date") ? "ケアプラン目標" : k === "sensor_alert" ? "見守りの注意" : "バイタルの注意の目安"))];
 alert(`${r.name} 様の${labels.join("・")}を保存しました。`);
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
 cpAppendEditHistory(r, cpOld, ["name", "room_no", "care_level", "status", "birth_date", "admission_date", "policy_stamp", "emergency_contact", "family_wishes", "life_history", "diseases", "paralysis", "allergies", "diet_type", "oral_state", "dr_instructions", "care_plan_goal", "sensor_alert", "bp_high_max", "bp_high_min", "temp_max", "spo2_min", "pulse_max", "pulse_min"]);

 db.save();
 closeModal("bodyConditionModal");
 renderResidentDetail();
 alert(`${r.name} 様の身体状況・食形態・病歴を更新しました！`);
}

// ======================================================================
// [Antigravity実装 2026-10-19] 職員の入社日・常勤/非常勤・資格と研修マスタ管理・資格証確認・取消
// ======================================================================
const CP_INITIAL_QUALIFICATION_MASTER = [
 { id: 1, name: "介護福祉士", kana: "かいごふくしし", kind: "資格", has_mark: "なし", mark_detail: "", source_url: "", created_by: "初期登録", created_at: "", status: "有効" },
 { id: 2, name: "実務者研修", kana: "じつむしゃけんしゅう", kind: "研修", has_mark: "なし", mark_detail: "", source_url: "", created_by: "初期登録", created_at: "", status: "有効" },
 { id: 3, name: "介護職員初任者研修", kana: "かいごしょくいんしょにんしゃけんしゅう", kind: "研修", has_mark: "なし", mark_detail: "", source_url: "", created_by: "初期登録", created_at: "", status: "有効" },
 { id: 4, name: "介護支援専門員", kana: "かいごしえんせんもんいん", kind: "資格", has_mark: "あり", mark_detail: "計画作成担当者のうち1人以上に必要（人員基準）", source_url: "https://www.pref.hiroshima.lg.jp/uploaded/attachment/511579.pdf https://www.city.kuki.lg.jp/_res/projects/default_project/_page_/001/007/698/1007698_022.pdf", created_by: "初期登録", created_at: "", status: "有効" },
 { id: 5, name: "看護師", kana: "かんごし", kind: "資格", has_mark: "なし", mark_detail: "", source_url: "", created_by: "初期登録", created_at: "", status: "有効" },
 { id: 6, name: "准看護師", kana: "じゅんかんごし", kind: "資格", has_mark: "なし", mark_detail: "", source_url: "", created_by: "初期登録", created_at: "", status: "有効" },
 { id: 7, name: "社会福祉士", kana: "しゃかいふくしし", kind: "資格", has_mark: "なし", mark_detail: "", source_url: "", created_by: "初期登録", created_at: "", status: "有効" },
 { id: 8, name: "社会福祉主事", kana: "しゃかいふくししゅじ", kind: "資格", has_mark: "なし", mark_detail: "", source_url: "", created_by: "初期登録", created_at: "", status: "有効" },
 { id: 9, name: "認知症介護実践者研修", kana: "にんちしょうかいごじっせんしゃけんしゅう", kind: "研修", has_mark: "あり", mark_detail: "計画作成担当者に必要（人員基準）", source_url: "https://www.pref.hiroshima.lg.jp/uploaded/attachment/511579.pdf https://www.city.kuki.lg.jp/_res/projects/default_project/_page_/001/007/698/1007698_022.pdf", created_by: "初期登録", created_at: "", status: "有効" },
 { id: 10, name: "認知症対応型サービス事業管理者研修", kana: "にんちしょうたいおうがたさーびすじぎょうかんりしゃけんしゅう", kind: "研修", has_mark: "あり", mark_detail: "管理者に必要（人員基準）", source_url: "https://www.pref.hiroshima.lg.jp/uploaded/attachment/511579.pdf https://www.city.kuki.lg.jp/_res/projects/default_project/_page_/001/007/698/1007698_022.pdf", created_by: "初期登録", created_at: "", status: "有効" }
];

function cpToHiragana(str) {
 return String(str || "").replace(/[\u30a1-\u30f6]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60)).toLowerCase().trim();
}

function cpGetQualificationMaster() {
 if (typeof db !== "undefined" && db.data && Array.isArray(db.data.qualification_master) && db.data.qualification_master.length > 0) {
  return db.data.qualification_master;
 }
 return CP_INITIAL_QUALIFICATION_MASTER;
}

function cpActiveQualificationMaster() {
 return cpGetQualificationMaster().filter(m => m && m.status !== "使わない");
}

function cpMatchQualificationMaster(rawToken) {
 const raw = String(rawToken || "").trim();
 if (!raw) return null;
 const masterList = cpGetQualificationMaster();
 // 1. 完全一致
 let found = masterList.find(m => m && m.name === raw);
 if (found) return found;
 // 2. 括弧書き（「看護師 (正看護師)」など）や末尾の「修了」を除いて照合
 let norm = raw.replace(/[\s　]*[（(][^）)]*[）)]\s*$/, "").trim();
 norm = norm.replace(/修了$/, "").trim();
 found = masterList.find(m => m && m.name === norm);
 if (found) return found;
 // 3. 略称・表記ゆれの照合
 const aliasMap = {
  "初任者研修": "介護職員初任者研修",
  "介護職員初任者研修": "介護職員初任者研修",
  "介護職員実務者研修": "実務者研修",
  "実務者研修": "実務者研修",
  "正看護師": "看護師",
  "社会福祉主事任用資格": "社会福祉主事"
 };
 if (aliasMap[norm]) {
  found = masterList.find(m => m && m.name === aliasMap[norm]);
  if (found) return found;
 }
 return null;
}

// 職員の資格・研修リストを取得（読み込んだだけでは db.data.stamps を書き換えない）
function cpGetStaffQualifications(staffObj) {
 if (!staffObj || typeof staffObj !== "object") return [];
 if (Array.isArray(staffObj.qualification_records)) {
  return staffObj.qualification_records;
 }
 const rawStr = String(staffObj.qualifications || "").trim();
 if (!rawStr) return [];
 const tokens = rawStr.split("・").map(t => t.trim()).filter(Boolean);
 return tokens.map((tok, idx) => {
  const m = cpMatchQualificationMaster(tok);
  if (m) {
   return {
    id: idx + 1,
    is_other: false,
    master_id: m.id,
    name: m.name,
    raw_text: tok,
    kind: m.kind || "資格",
    acquired_date: "",
    verified_date: "",
    verified_by: "",
    status: "有効",
    voided: false
   };
  }
  return {
   id: idx + 1,
   is_other: true,
   master_id: null,
   name: tok,
   raw_text: tok,
   kind: "その他",
   acquired_date: "",
   verified_date: "",
   verified_by: "",
   status: "有効",
   voided: false
  };
 });
}

// 職員の資格を追加・確認・取消するときだけ配列を実体化する（元の qualifications の文字は消さない）
function cpEnsureStaffQualificationRecords(staffObj) {
 if (!staffObj || typeof staffObj !== "object") return [];
 if (!Array.isArray(staffObj.qualification_records)) {
  staffObj.qualification_records = cpGetStaffQualifications(staffObj).map(x => Object.assign({}, x));
 }
 return staffObj.qualification_records;
}

// 指定した職員が、マスタの特定の資格・研修（有効・取消でない・「その他」でない）を持っているか
function cpStaffHasMasterQualification(staffObj, masterNameOrId) {
 const recs = cpGetStaffQualifications(staffObj).filter(q => q && !q.voided && !q.is_other);
 const masterList = cpGetQualificationMaster();
 return recs.some(q => {
  if (typeof masterNameOrId === "number" || /^\d+$/.test(String(masterNameOrId))) {
   return Number(q.master_id) === Number(masterNameOrId);
  }
  const m = masterList.find(x => Number(x.id) === Number(q.master_id));
  const mName = m ? m.name : q.name;
  return mName === String(masterNameOrId);
 });
}

function cpFormatQualSourceLinksHtml(sourceUrl) {
 const raw = String(sourceUrl || "").trim();
 if (!raw) return "";
 const urls = raw.match(/https?:\/\/[^\s/$.?#].[^\s]*/gi) || [raw];
 return urls.map(u => {
  let label = u;
  if (u.includes("pref.hiroshima.lg.jp")) label = "広島県 資料";
  else if (u.includes("city.kuki.lg.jp")) label = "久喜市 資料";
  return `<a href="${escapeHtml(u)}" target="_blank" rel="noopener noreferrer" style="color:var(--pine); text-decoration:underline; margin-right:6px;">${escapeHtml(label)}</a>`;
 }).join("");
}

// 職員・認印管理
function openStaffModal() {
 if (!isCurrentStaffAdminOrClerk()) {
  alert("職員管理は管理者または事務員のみ操作可能です。");
  return false;
 }
 const today = toLocalDateStr(new Date());
 const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
 setVal("newStaffName", "");
 setVal("newStaffRole", "");
 setVal("newStaffEmploymentType", "");
 setVal("newStaffDutyType", "");
 const hd = document.getElementById("newStaffHireDate");
 if (hd) { hd.value = ""; hd.max = today; }
 if (document.getElementById("newStaffUnit")) document.getElementById("newStaffUnit").innerHTML = cpUnitOptionsHtml("", "担当の区分なし");
 renderStaffModalList();
 document.getElementById("staffModal").style.display = "flex";
 return true;
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
  row.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding:8px 12px; border-bottom:1px solid var(--line-2); gap:8px; flex-wrap:wrap;";

  const rank = getStaffRoleRank(s.role, s.name);
  let badgeStyle = "background:var(--ground); color:var(--ink-2);";
  if (rank === 1) badgeStyle = "background:var(--caution-tint); color:var(--caution); font-weight:bold;";
  else if (rank <= 5) badgeStyle = "background:var(--pine-tint-2); color:var(--pine-dark); font-weight:bold;";

  const empText = s.employment_type || "常勤・非常勤: 未設定";
  const hireText = s.hire_date ? `入社: ${escapeHtml(s.hire_date)}` : "入社日: 未設定";

  row.innerHTML = `
  <div style="display:flex; align-items:center; gap:8px; flex:1; min-width:200px; flex-wrap:wrap;">
   <span class="hanko-stamp" style="height:26px; min-width:48px; padding:2px 8px; font-size:13px; letter-spacing:1px;">${escapeHtml(s.name)}</span>
   <strong style="font-size:14px; white-space:nowrap;">${escapeHtml(s.name)}</strong>
   <span style="font-size:13px; padding:2px 8px; border-radius:4px; ${badgeStyle} white-space:nowrap;">${escapeHtml(s.role || '職員')}</span>
   <span style="font-size:13px; color:var(--ink-2); white-space:nowrap;">[${escapeHtml(empText)} / ${hireText}]</span>
   ${cpUnits().length ? `<select class="form-control staff-unit-sel" data-staff="${escapeHtml(s.name)}" aria-label="${escapeHtml(s.name)}の担当の区分" onchange="moveStaffUnit(this.dataset.staff, this.value)">${cpUnitOptionsHtml(s.unit_id, "担当の区分なし")}</select>` : ""}
  </div>
  <div style="display:flex; align-items:center; gap:4px; flex-wrap:wrap;">
   <button type="button" class="btn btn-secondary" style="font-size:13px; padding:3px 8px;" onclick="openStaffEditModal('${escapeHtml(s.name)}')">変更・資格</button>
   <button type="button" class="btn btn-secondary" style="font-size:13px; padding:2px 6px;" title="上へ移動" onclick="moveStaffOrder(${idx}, -1)" ${idx === 0 ? 'disabled style="opacity:0.4; padding:2px 6px; font-size:13px;"' : ''}>▲</button>
   <button type="button" class="btn btn-secondary" style="font-size:13px; padding:2px 6px;" title="下へ移動" onclick="moveStaffOrder(${idx}, 1)" ${idx === gState.stamps.length - 1 ? 'disabled style="opacity:0.4; padding:2px 6px; font-size:13px;"' : ''}>▼</button>
   <button type="button" class="btn btn-secondary" style="font-size:13px; padding:2px 8px; color:var(--alert);" onclick="deleteStaffStamp(${idx})">削除</button>
  </div>
  `;
  container.appendChild(row);
 });
}

function autoSortStaffByRank() {
 if (!isCurrentStaffAdminOrClerk()) { alert("職員管理は管理者または事務員のみ操作可能です。"); return false; }
 gState.stamps = sortStaffList(gState.stamps);
 db.data.stamps = gState.stamps;
 db.save();
 renderStaffSelect();
 renderStaffModalList();
 if (typeof renderStaffQualificationsTable === "function") renderStaffQualificationsTable();
 alert("登録職員を役職・序列順（施設長・管理者 → リーダー → 看護 → 介護 → 事務）に整列しました！");
}

function moveStaffOrder(index, direction) {
 if (!isCurrentStaffAdminOrClerk()) { alert("職員管理は管理者または事務員のみ操作可能です。"); return false; }
 const newIndex = index + direction;
 if (newIndex < 0 || newIndex >= gState.stamps.length) return;
 const temp = gState.stamps[index];
 gState.stamps[index] = gState.stamps[newIndex];
 gState.stamps[newIndex] = temp;
 db.data.stamps = gState.stamps;
 db.save();
 renderStaffSelect();
 renderStaffModalList();
 if (typeof renderStaffQualificationsTable === "function") renderStaffQualificationsTable();
}

function submitNewStaffStamp() {
 if (!isCurrentStaffAdminOrClerk()) {
  alert("職員の登録は管理者または事務員のみ操作可能です。");
  return false;
 }
 const name = (document.getElementById("newStaffName")?.value || "").trim();
 if (!name) {
  alert("職員名を入力してください。");
  return false;
 }
 if (!cpRequireSelect("newStaffRole", "役職")) return false;
 if (!cpRequireSelect("newStaffEmploymentType", "常勤・非常勤")) return false;

 const role = document.getElementById("newStaffRole").value.trim();
 const empType = document.getElementById("newStaffEmploymentType").value.trim();
 // [Claude修正 2026-10-19] 勤務形態を選ばないとき、役職から決めて入れていた → 選んでもらう
 if (!cpRequireSelect("newStaffDutyType", "勤務形態")) return false;
 const dutyType = document.getElementById("newStaffDutyType").value.trim();
 const hireDate = (document.getElementById("newStaffHireDate")?.value || "").trim();
 const today = toLocalDateStr(new Date());
 if (hireDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hireDate)) {
   alert("入社日の形式が正しくありません。");
   return false;
  }
  if (hireDate > today) {
   alert("入社日に、これから先の日付は入れられません。");
   return false;
  }
 }
 const unitSel = document.getElementById("newStaffUnit");
 const unitId = unitSel && unitSel.value ? Number(unitSel.value) : null;

 const exists = (gState.stamps || []).some(s => (s.name || s) === name);
 if (exists) {
  alert(`「${name}」は既に登録されています。`);
  return false;
 }

 const cpNewStaff = {
  name: name,
  role: role,
  employment_type: empType,
  duty_type: dutyType,
  qualifications: "",
  pin: "0000",
  is_initial_pin: true
 };
 if (hireDate) cpNewStaff.hire_date = hireDate;
 if (unitId) cpNewStaff.unit_id = unitId;
 gState.stamps.push(cpNewStaff);
 gState.stamps = sortStaffList(gState.stamps);
 db.data.stamps = gState.stamps;
 db.save();

 renderStaffSelect();
 renderStaffModalList();
 if (typeof renderStaffQualificationsTable === "function") renderStaffQualificationsTable();
 document.getElementById("newStaffName").value = "";
 document.getElementById("newStaffRole").value = "";
 if (document.getElementById("newStaffEmploymentType")) document.getElementById("newStaffEmploymentType").value = "";
 if (document.getElementById("newStaffDutyType")) document.getElementById("newStaffDutyType").value = "";
 if (document.getElementById("newStaffHireDate")) document.getElementById("newStaffHireDate").value = "";
 alert(`「${name} (${role})」を登録しました。`);
 return true;
}

function deleteStaffStamp(index) {
 if (!isCurrentStaffAdminOrClerk()) {
  alert("職員の削除は管理者または事務員のみ操作可能です。");
  return false;
 }
 if (gState.stamps.length <= 1) {
  alert("最低1名の職員が必要です。");
  return false;
 }
 const target = gState.stamps[index];
 if (!target) return false;
 if (confirm(`職員「${target.name}」を削除しますか？\n（退職などの記録として、削除した日時と職員は残ります）`)) {
  if (!Array.isArray(db.data.staff_archive)) db.data.staff_archive = [];
  const cpArch = JSON.parse(JSON.stringify(target)); delete cpArch.pin; delete cpArch.password; delete cpArch.pin_hash;
  db.data.staff_archive.push({ id: Date.now(), staff: cpArch, removed_at: toLocalDateTimeStr(new Date()), removed_by: cpLedgerStaff() });
  gState.stamps.splice(index, 1);
  db.data.stamps = gState.stamps;
  db.save();
  renderStaffSelect();
  renderStaffModalList();
  if (typeof renderStaffQualificationsTable === "function") renderStaffQualificationsTable();
 }
 return true;
}

// ----------------------------------------------------------------------
// 職員情報の変更・資格と研修の記録モーダル (#staffEditModal)
// ----------------------------------------------------------------------
function cpFindStaffObj(staffName) {
 const list = (gState.stamps && gState.stamps.length) ? gState.stamps : (db.data.stamps || []);
 return list.find(s => s && (s.name || s) === staffName) || null;
}

function populateStaffQualMasterSelect(selectedVal) {
 const sel = document.getElementById("staffQualMasterSelect");
 if (!sel) return;
 const activeMaster = cpActiveQualificationMaster();
 sel.innerHTML = `<option value="">選んでください</option>` +
  activeMaster.map(m => `<option value="${Number(m.id)}">${escapeHtml(m.name)}（${escapeHtml(m.kind || "資格")}${m.has_mark === "あり" ? "・基準/加算の印あり" : ""}）</option>`).join("") +
  `<option value="other">その他（一覧にない資格・研修を自由記入）</option>`;
 if (selectedVal !== undefined && selectedVal !== null) {
  sel.value = String(selectedVal);
 }
 onStaffQualMasterSelectChange();
}

function openStaffEditModal(staffName) {
 if (!isCurrentStaffAdminOrClerk()) {
  alert("職員情報および資格・研修の変更は、管理者または事務員のみ操作可能です。");
  return false;
 }
 const s = cpFindStaffObj(staffName);
 if (!s) {
  alert("対象の職員が見つかりません。");
  return false;
 }
 const today = toLocalDateStr(new Date());
 const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
 setVal("editStaffTargetName", s.name);
 const titleEl = document.getElementById("staffEditModalTitle");
 if (titleEl) titleEl.textContent = `${s.name} さんの情報変更・資格と研修の記録`;

 setVal("editStaffRole", s.role || "");
 setVal("editStaffEmploymentType", s.employment_type || "");
 setVal("editStaffDutyType", s.duty_type || "");
 const hd = document.getElementById("editStaffHireDate");
 if (hd) { hd.value = s.hire_date || ""; hd.max = today; }
 const unitSel = document.getElementById("editStaffUnit");
 if (unitSel) unitSel.innerHTML = cpUnitOptionsHtml(s.unit_id, "担当の区分なし");
 setVal("editStaffReason", "");

 setVal("staffQualSearchInput", "");
 const candEl = document.getElementById("staffQualCandidateList");
 if (candEl) { candEl.innerHTML = ""; candEl.style.display = "none"; }
 populateStaffQualMasterSelect("");
 setVal("staffQualOtherName", "");
 const acqEl = document.getElementById("staffQualAcquiredDate");
 if (acqEl) { acqEl.value = ""; acqEl.max = today; }

 renderStaffEditQualRecordsList(s);
 openModal("staffEditModal");
 return true;
}

function saveStaffBasicInfo() {
 if (!isCurrentStaffAdminOrClerk()) {
  alert("職員情報の変更は、管理者または事務員のみ操作可能です。");
  return false;
 }
 const staffName = (document.getElementById("editStaffTargetName")?.value || "").trim();
 const s = cpFindStaffObj(staffName);
 if (!s) return false;

 if (!cpRequireSelect("editStaffRole", "役職")) return false;
 if (!cpRequireSelect("editStaffEmploymentType", "常勤・非常勤")) return false;
 if (!cpRequireSelect("editStaffDutyType", "勤務形態")) return false;

 const role = document.getElementById("editStaffRole").value.trim();
 const empType = document.getElementById("editStaffEmploymentType").value.trim();
 const dutyType = document.getElementById("editStaffDutyType").value.trim();
 const hireDate = (document.getElementById("editStaffHireDate")?.value || "").trim();
 const unitVal = (document.getElementById("editStaffUnit")?.value || "").trim();
 const newUnitId = unitVal ? Number(unitVal) : undefined;
 const reason = (document.getElementById("editStaffReason")?.value || "").trim();
 const today = toLocalDateStr(new Date());

 if (hireDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hireDate)) {
   alert("入社日の形式が正しくありません。");
   return false;
  }
  if (hireDate > today) {
   alert("入社日に、これから先の日付は入れられません。");
   return false;
  }
  // 資格証の確認日との前後チェック（入社日が既存の資格証確認日より後になるのを防ぐ）
  const recs = cpGetStaffQualifications(s).filter(q => q && !q.voided && q.verified_date);
  const conflictRec = recs.find(q => hireDate > q.verified_date);
  if (conflictRec) {
   alert(`入社日（${hireDate}）が、すでに記録されている「${conflictRec.name}」の資格証確認日（${conflictRec.verified_date}）より後になっています。日付の順番を確認してください。`);
   return false;
  }
 }

 const oldRole = s.role || "";
 const oldEmp = s.employment_type || "";
 const oldDuty = s.duty_type || "";
 const oldHire = s.hire_date || "";
 const oldUnit = s.unit_id ? String(s.unit_id) : "";
 const newUnitStr = newUnitId ? String(newUnitId) : "";

 // 何も変えずに保存したときは変更履歴を増やさない
 if (oldRole === role && oldEmp === empType && oldDuty === dutyType && oldHire === hireDate && oldUnit === newUnitStr) {
  alert("変更された項目はありません。");
  return true;
 }

 // 既存の値（空でない欄）を書き換える場合は理由を必須にする（空だった入社日を初めて埋めるだけのときは理由不要）
 const changedExistingField =
  (oldRole && oldRole !== role) ||
  (oldEmp && oldEmp !== empType) ||
  (oldDuty && oldDuty !== dutyType) ||
  (oldHire && oldHire !== hireDate) ||
  (oldUnit !== newUnitStr);

 if (changedExistingField && !reason) {
  alert("既存の登録内容を変更するときは、「変更の理由」を入力してください。");
  return false;
 }

 // [Claude修正 2026-10-19] 自分の役職は自分で変えられない（事務員が自分を管理者にする、などを防ぐ）
 if (oldRole !== role && s.name === cpLoginStaffName()) {
  alert("自分の役職は変えられません。ほかの管理者・事務員に変えてもらってください。");
  return false;
 }
 const oldCopy = JSON.parse(JSON.stringify(s));
 if (oldCopy.hire_date === undefined) oldCopy.hire_date = "";
 s.role = role;
 s.employment_type = empType;
 s.duty_type = dutyType;
 if (hireDate) s.hire_date = hireDate;
 else delete s.hire_date;
 if (newUnitId) s.unit_id = newUnitId;
 else delete s.unit_id;

 if (changedExistingField || reason) {
  const compareTarget = Object.assign({}, s, { hire_date: s.hire_date || "" });
  cpAppendEditHistory(compareTarget, oldCopy, ["role", "employment_type", "duty_type", "unit_id", "hire_date"], reason || "入社日の登録");
  s.edit_history = compareTarget.edit_history;
 }

 db.data.stamps = gState.stamps;
 db.save();
 if (document.getElementById("editStaffReason")) document.getElementById("editStaffReason").value = "";
 renderStaffModalList();
 if (typeof renderStaffQualificationsTable === "function") renderStaffQualificationsTable();
 if (typeof renderStaffSelect === "function") renderStaffSelect();
 alert(`${s.name} さんの基本情報を保存しました。`);
 return true;
}

function onStaffQualSearchInput() {
 const inputEl = document.getElementById("staffQualSearchInput");
 const listEl = document.getElementById("staffQualCandidateList");
 if (!inputEl || !listEl) return;
 const rawQ = (inputEl.value || "").trim();
 if (!rawQ) {
  listEl.innerHTML = "";
  listEl.style.display = "none";
  return;
 }
 const hiraQ = cpToHiragana(rawQ);
 const lowerQ = rawQ.toLowerCase();
 const activeMaster = cpActiveQualificationMaster();
 const matched = activeMaster.filter(m => {
  const nameMatch = String(m.name || "").toLowerCase().includes(lowerQ) || cpToHiragana(m.name || "").includes(hiraQ);
  const kanaMatch = cpToHiragana(m.kana || "").includes(hiraQ);
  return nameMatch || kanaMatch;
 }).sort((a, b) => {
  const aStarts = String(a.name || "").startsWith(rawQ) || cpToHiragana(a.kana || "").startsWith(hiraQ) ? 0 : 1;
  const bStarts = String(b.name || "").startsWith(rawQ) || cpToHiragana(b.kana || "").startsWith(hiraQ) ? 0 : 1;
  if (aStarts !== bStarts) return aStarts - bStarts;
  return Number(a.id) - Number(b.id);
 });

 listEl.style.display = "flex";
 const btns = matched.map(m =>
  `<button type="button" class="qual-candidate-btn" onclick="selectStaffQualCandidate('${Number(m.id)}')"><strong>${escapeHtml(m.name)}</strong> <span style="font-size:13px; color:var(--ink-2);">（${escapeHtml(m.kana || "")}・${escapeHtml(m.kind || "資格")}）</span></button>`
 );
 btns.push(`<button type="button" class="qual-candidate-btn" style="background:var(--ground); color:var(--ink);" onclick="selectStaffQualCandidate('other')">一覧にない資格：「${escapeHtml(rawQ)}」を『その他』として自由記入する</button>`);
 listEl.innerHTML = btns.join("");
}

function selectStaffQualCandidate(val) {
 const sel = document.getElementById("staffQualMasterSelect");
 if (!sel) return;
 sel.value = String(val);
 onStaffQualMasterSelectChange();
 if (val === "other") {
  const rawQ = (document.getElementById("staffQualSearchInput")?.value || "").trim();
  const otherEl = document.getElementById("staffQualOtherName");
  if (otherEl && rawQ && !otherEl.value) otherEl.value = rawQ;
 }
}

function onStaffQualMasterSelectChange() {
 const sel = document.getElementById("staffQualMasterSelect");
 const wrap = document.getElementById("staffQualOtherWrap");
 if (!sel || !wrap) return;
 wrap.style.display = sel.value === "other" ? "block" : "none";
}

function addStaffQualificationRecord() {
 if (!isCurrentStaffAdminOrClerk()) {
  alert("職員の資格・研修の追加は、管理者または事務員のみ操作可能です。");
  return false;
 }
 const staffName = (document.getElementById("editStaffTargetName")?.value || "").trim();
 const s = cpFindStaffObj(staffName);
 if (!s) return false;

 if (!cpRequireSelect("staffQualMasterSelect", "追加する資格・研修")) return false;
 const selVal = document.getElementById("staffQualMasterSelect").value;
 const acquiredDate = (document.getElementById("staffQualAcquiredDate")?.value || "").trim();
 const today = toLocalDateStr(new Date());

 if (acquiredDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(acquiredDate)) {
   alert("取得日の形式が正しくありません。");
   return false;
  }
  if (acquiredDate > today) {
   alert("取得日に、これから先の日付は入れられません。");
   return false;
  }
 }

 const existingList = cpGetStaffQualifications(s);
 let newRec = null;

 if (selVal === "other") {
  const otherName = (document.getElementById("staffQualOtherName")?.value || "").trim();
  if (!otherName) {
   alert("その他の資格・研修名を入力してください。");
   return false;
  }
  // [Claude修正 2026-10-19] 一覧にある資格を「その他」で入れると、集計から外れてしまう
  const cpSame = cpMatchQualificationMaster(otherName);
  if (cpSame) {
   alert(cpSame.status === "使わない" ? `「${cpSame.name}」は一覧で「使わない」になっています。管理者・事務員に一覧を確かめてもらってください。` : `「${cpSame.name}」は一覧にあります。「その他」ではなく、一覧から選んでください。`);
   return false;
  }
  if (existingList.some(q => !q.voided && q.is_other && q.name === otherName)) {
   alert(`「${otherName}」はすでに登録されています。`);
   return false;
  }
  const recs = cpEnsureStaffQualificationRecords(s);
  let nextId = Math.max(Date.now(), recs.reduce((mx, r) => Math.max(mx, Number(r.id) || 0), 0) + 1); // [Claude修正 2026-10-19] 2台で同時に足しても番号が重ならないように
  newRec = {
   id: nextId,
   is_other: true,
   master_id: null,
   name: otherName,
   raw_text: "",
   kind: "その他",
   acquired_date: acquiredDate,
   verified_date: "",
   verified_by: "",
   created_at: toLocalDateTimeStr(new Date()),
   created_by: cpLoginStaffName(),
   status: "有効",
   voided: false
  };
  recs.push(newRec);
 } else {
  const masterId = Number(selVal);
  const m = cpGetQualificationMaster().find(x => Number(x.id) === masterId);
  if (!m || m.status === "使わない") {
   alert("「使わない」に設定されている資格・研修は追加できません。");
   return false;
  }
  if (existingList.some(q => !q.voided && !q.is_other && Number(q.master_id) === masterId)) {
   alert(`「${m.name}」はすでにこの職員に登録されています。`);
   return false;
  }
  const recs = cpEnsureStaffQualificationRecords(s);
  let nextId = Math.max(Date.now(), recs.reduce((mx, r) => Math.max(mx, Number(r.id) || 0), 0) + 1); // [Claude修正 2026-10-19] 2台で同時に足しても番号が重ならないように
  newRec = {
   id: nextId,
   is_other: false,
   master_id: m.id,
   name: m.name,
   raw_text: "",
   kind: m.kind || "資格",
   acquired_date: acquiredDate,
   verified_date: "",
   verified_by: "",
   created_at: toLocalDateTimeStr(new Date()),
   created_by: cpLoginStaffName(),
   status: "有効",
   voided: false
  };
  recs.push(newRec);
 }

 db.data.stamps = gState.stamps;
 db.save();

 if (document.getElementById("staffQualSearchInput")) document.getElementById("staffQualSearchInput").value = "";
 const candEl = document.getElementById("staffQualCandidateList");
 if (candEl) { candEl.innerHTML = ""; candEl.style.display = "none"; }
 if (document.getElementById("staffQualMasterSelect")) document.getElementById("staffQualMasterSelect").value = "";
 if (document.getElementById("staffQualOtherName")) document.getElementById("staffQualOtherName").value = "";
 if (document.getElementById("staffQualAcquiredDate")) document.getElementById("staffQualAcquiredDate").value = "";
 onStaffQualMasterSelectChange();

 renderStaffEditQualRecordsList(s);
 if (typeof renderStaffQualificationsTable === "function") renderStaffQualificationsTable();
 return true;
}

function saveStaffQualAcquiredDate(recId) {
 if (!isCurrentStaffAdminOrClerk()) {
  alert("資格・研修の変更は、管理者または事務員のみ操作可能です。");
  return false;
 }
 const staffName = (document.getElementById("editStaffTargetName")?.value || "").trim();
 const s = cpFindStaffObj(staffName);
 if (!s) return false;
 const inputEl = document.getElementById(`staffQualAcqDate_${recId}`);
 const newDate = (inputEl ? inputEl.value : "").trim();
 const today = toLocalDateStr(new Date());

 if (newDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
   alert("取得日の形式が正しくありません。");
   return false;
  }
  if (newDate > today) {
   alert("取得日に、これから先の日付は入れられません。");
   return false;
  }
 }

 const previewRecs = cpGetStaffQualifications(s);
 const previewTarget = previewRecs.find(r => Number(r.id) === Number(recId));
 if (!previewTarget) return false;
 if (previewTarget.voided) {
  alert("取消済みの資格・研修は変更できません。");
  return false;
 }
 if (previewTarget.verified_date && newDate && newDate > previewTarget.verified_date) {
  alert(`取得日（${newDate}）は、資格証を確認した日（${previewTarget.verified_date}）以前の日付にしてください。`);
  return false;
 }
 const oldDate = previewTarget.acquired_date || "";
 if (oldDate === newDate) {
  return true; // 無変更時は履歴を増やさない
 }

 let reason = "";
 if (oldDate) {
  const r = prompt(`「${previewTarget.name}」の取得日を「${oldDate}」から「${newDate || "未設定"}」へ変更します。\n変更の理由を入力してください。`, "");
  if (r === null) {
   if (inputEl) inputEl.value = oldDate;
   return false;
  }
  if (!r.trim()) {
   alert("変更の理由を入力してください。");
   if (inputEl) inputEl.value = oldDate;
   return false;
  }
  reason = r.trim();
 }

 const recs = cpEnsureStaffQualificationRecords(s);
 const target = recs.find(r => Number(r.id) === Number(recId));
 if (!target) return false;
 const oldCopy = JSON.parse(JSON.stringify(target));
 target.acquired_date = newDate;
 if (oldDate && reason) {
  cpAppendEditHistory(target, oldCopy, ["acquired_date"], reason);
 }
 db.data.stamps = gState.stamps;
 db.save();
 renderStaffEditQualRecordsList(s);
 if (typeof renderStaffQualificationsTable === "function") renderStaffQualificationsTable();
 return true;
}

function verifyStaffQualificationCert(recId) {
 if (!isCurrentStaffAdminOrClerk()) {
  alert("資格証の確認記録は、管理者または事務員のみ操作可能です。");
  return false;
 }
 const staffName = (document.getElementById("editStaffTargetName")?.value || "").trim();
 const s = cpFindStaffObj(staffName);
 if (!s) return false;

 const today = toLocalDateStr(new Date());
 const verifier = cpLoginStaffName();
 const previewRecs = cpGetStaffQualifications(s);
 const previewTarget = previewRecs.find(r => Number(r.id) === Number(recId));
 if (!previewTarget) return false;
 if (previewTarget.voided) {
  alert("取消済みの資格・研修は確認できません。");
  return false;
 }
 if (previewTarget.verified_date) {
  alert("この資格証はすでに確認済みです。");
  return false;
 }
 if (s.hire_date && s.hire_date > today) {
  alert(`入社日（${s.hire_date}）が確認日（${today}）より後になっています。`);
  return false;
 }
 const pendingAcqInput = document.getElementById(`staffQualAcqDate_${recId}`);
 const acqDate = (pendingAcqInput && pendingAcqInput.value ? pendingAcqInput.value.trim() : "") || previewTarget.acquired_date || "";
 if (acqDate && acqDate > today) {
  alert(`取得日（${acqDate}）が確認日（${today}）より後になっています。`);
  return false;
 }

 const recs = cpEnsureStaffQualificationRecords(s);
 const target = recs.find(r => Number(r.id) === Number(recId));
 if (!target) return false;
 if (acqDate && !target.acquired_date) target.acquired_date = acqDate;
 target.verified_date = today;
 target.verified_by = verifier;

 db.data.stamps = gState.stamps;
 db.save();
 renderStaffEditQualRecordsList(s);
 if (typeof renderStaffQualificationsTable === "function") renderStaffQualificationsTable();
 return true;
}

function voidStaffQualificationRecord(recId, reasonOpt) {
 if (!isCurrentStaffAdminOrClerk()) {
  alert("資格・研修の取消は、管理者または事務員のみ操作可能です。");
  return false;
 }
 const staffName = (document.getElementById("editStaffTargetName")?.value || "").trim();
 const s = cpFindStaffObj(staffName);
 if (!s) return false;

 const previewRecs = cpGetStaffQualifications(s);
 const previewTarget = previewRecs.find(r => Number(r.id) === Number(recId));
 if (!previewTarget || previewTarget.voided) return false;

 const reason = reasonOpt !== undefined
  ? String(reasonOpt)
  : prompt(`「${previewTarget.name}」を取消にします。\n記録は消えずに、取消済みとして一覧に残ります。\n\n取消の理由を入力してください。`, "");
 if (reason === null) return false;
 if (!String(reason).trim()) {
  alert("取消の理由を入力してください。取消は行っていません。");
  return false;
 }

 const recs = cpEnsureStaffQualificationRecords(s);
 const target = recs.find(r => Number(r.id) === Number(recId));
 if (!target) return false;
 target.voided = true;
 target.status = "取消";
 target.voided_at = toLocalDateTimeStr(new Date());
 target.voided_by = cpLoginStaffName();
 target.void_reason = String(reason).trim();
 target.cancel_reason = String(reason).trim();

 db.data.stamps = gState.stamps;
 db.save();
 renderStaffEditQualRecordsList(s);
 if (typeof renderStaffQualificationsTable === "function") renderStaffQualificationsTable();
 return true;
}

function renderStaffEditQualRecordsList(s) {
 const listEl = document.getElementById("staffQualRecordsList");
 const origEl = document.getElementById("staffQualOriginalTextNote");
 if (origEl) {
  origEl.innerHTML = `前からの資格の書き方（消さずに残しています）: <strong>${escapeHtml(s.qualifications || "（なし）")}</strong>`;
 }
 if (!listEl) return;
 const recs = cpGetStaffQualifications(s);
 if (!recs.length) {
  listEl.innerHTML = `<div style="padding:10px; color:var(--ink-3); font-size:13px;">登録されている資格・研修はありません。</div>`;
  return;
 }
 const today = toLocalDateStr(new Date());
 const masterList = cpGetQualificationMaster();
 const ordered = recs.filter(r => !r.voided).concat(recs.filter(r => r.voided));

 listEl.innerHTML = ordered.map(rec => {
  const m = !rec.is_other ? masterList.find(x => Number(x.id) === Number(rec.master_id)) : null;
  const kindBadge = rec.is_other
   ? `<span class="qual-other-badge">その他（集計対象外）</span>`
   : `<span class="badge" style="background:var(--pine-tint); color:var(--pine-dark); font-size:13px; padding:2px 8px;">マスタ：${escapeHtml((m && m.kind) || rec.kind || "資格")}</span>`;
  const rawNote = (rec.raw_text && rec.raw_text !== rec.name)
   ? `<span style="font-size:13px; color:var(--ink-2);">（元の文字: ${escapeHtml(rec.raw_text)}）</span>`
   : "";
  const markHtml = (m && m.has_mark === "あり")
   ? `<div style="margin-top:4px;"><span class="qual-mark-badge">基準・加算の印：${escapeHtml(m.mark_detail)}</span> <span style="font-size:13px;">出典: ${cpFormatQualSourceLinksHtml(m.source_url)}</span></div>`
   : "";

  if (rec.voided) {
   return `<div class="qual-record-card is-voided">
    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
     <div style="text-decoration:line-through;">${kindBadge} <strong>${escapeHtml(rec.name)}</strong> ${rawNote}</div>
     <span style="color:var(--alert); font-weight:bold; font-size:13px;">取消済（${escapeHtml(rec.voided_at || "")} ${escapeHtml(rec.voided_by || "")} / 理由: ${escapeHtml(rec.void_reason || "")}）</span>
    </div>
   </div>`;
  }

  const verifiedHtml = rec.verified_date
   ? `<span class="qual-verified-badge">資格証確認済: ${escapeHtml(rec.verified_date)}（確認者: ${escapeHtml(rec.verified_by || "")}）</span>`
   : `<span style="font-size:13px; color:var(--ink-3);">資格証: 未確認</span>
      <button type="button" class="btn btn-secondary" style="font-size:13px; padding:3px 8px;" onclick="verifyStaffQualificationCert(${Number(rec.id)})">資格証を確認した</button>`;

  const histHtml = (Array.isArray(rec.edit_history) && rec.edit_history.length)
   ? `<div style="margin-top:4px; font-size:13px; color:var(--ink-3);">変更履歴: ${rec.edit_history.map(h => `${escapeHtml(h.edited_at)} ${escapeHtml(h.edited_by)}（理由: ${escapeHtml(h.reason || "")}）`).join(" / ")}</div>`
   : "";

  return `<div class="qual-record-card">
   <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:8px;">
    <div>
     <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
      ${kindBadge}
      <strong style="font-size:14px; color:var(--ink);">${escapeHtml(rec.name)}</strong>
      ${rawNote}
     </div>
     ${markHtml}
    </div>
    <button type="button" class="btn btn-secondary" style="font-size:13px; padding:2px 8px; color:var(--alert); border-color:var(--alert);" onclick="voidStaffQualificationRecord(${Number(rec.id)})">取消</button>
   </div>
   <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-top:8px; padding-top:8px; border-top:1px dashed var(--line-2);">
    <div style="display:flex; align-items:center; gap:6px;">
     <label style="font-size:13px; color:var(--ink-2);">取得日:</label>
     <input type="date" id="staffQualAcqDate_${Number(rec.id)}" class="form-control" style="width:145px; font-size:13px; padding:2px 6px;" value="${escapeHtml(rec.acquired_date || "")}" max="${today}" onchange="saveStaffQualAcquiredDate(${Number(rec.id)})">
    </div>
    <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
     ${verifiedHtml}
    </div>
   </div>
   ${histHtml}
  </div>`;
 }).join("");
}

// ----------------------------------------------------------------------
// 資格・研修の一覧（マスタ）管理モーダル (#qualificationMasterModal)
// ----------------------------------------------------------------------
function openQualificationMasterModal() {
 if (!isCurrentStaffAdminOrClerk()) {
  alert("資格・研修マスタの管理は、管理者または事務員のみ操作可能です。");
  return false;
 }
 resetQualificationMasterForm();
 renderQualificationMasterList();
 openModal("qualificationMasterModal");
 return true;
}

function onQmHasMarkChange() {
 const sel = document.getElementById("qmHasMark");
 const wrap = document.getElementById("qmMarkDetailWrap");
 if (!sel || !wrap) return;
 wrap.style.display = sel.value === "あり" ? "block" : "none";
}

function resetQualificationMasterForm() {
 const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
 setVal("qmEditId", "");
 setVal("qmName", "");
 setVal("qmKana", "");
 setVal("qmKind", "");
 setVal("qmHasMark", "");
 setVal("qmMarkDetail", "");
 setVal("qmSourceUrl", "");
 setVal("qmEditReason", "");
 onQmHasMarkChange();
 const titleEl = document.getElementById("qmFormModeTitle");
 if (titleEl) titleEl.textContent = "＋ マスタに資格・研修を追加";
 const submitBtn = document.getElementById("qmSubmitBtn");
 if (submitBtn) submitBtn.textContent = "マスタに追加";
 const cancelBtn = document.getElementById("qmCancelEditBtn");
 if (cancelBtn) cancelBtn.style.display = "none";
 const reasonWrap = document.getElementById("qmEditReasonWrap");
 if (reasonWrap) reasonWrap.style.display = "none";
}

function startEditQualificationMasterItem(id) {
 if (!isCurrentStaffAdminOrClerk()) {
  alert("資格・研修マスタの変更は、管理者または事務員のみ操作可能です。");
  return false;
 }
 const m = cpGetQualificationMaster().find(x => Number(x.id) === Number(id));
 if (!m) return false;
 if (m.status === "使わない") {
  alert("「使わない」になっている項目は変更できません。");
  return false;
 }
 const setVal = (elId, v) => { const el = document.getElementById(elId); if (el) el.value = v; };
 setVal("qmEditId", String(m.id));
 setVal("qmName", m.name || "");
 setVal("qmKana", m.kana || "");
 setVal("qmKind", m.kind || "資格");
 setVal("qmHasMark", m.has_mark || "なし");
 setVal("qmMarkDetail", m.mark_detail || "");
 setVal("qmSourceUrl", m.source_url || "");
 setVal("qmEditReason", "");
 onQmHasMarkChange();

 const titleEl = document.getElementById("qmFormModeTitle");
 if (titleEl) titleEl.textContent = `資格・研修マスタの変更：${m.name}`;
 const submitBtn = document.getElementById("qmSubmitBtn");
 if (submitBtn) submitBtn.textContent = "変更を保存";
 const cancelBtn = document.getElementById("qmCancelEditBtn");
 if (cancelBtn) cancelBtn.style.display = "inline-block";
 const reasonWrap = document.getElementById("qmEditReasonWrap");
 if (reasonWrap) reasonWrap.style.display = "block";
 renderQualificationMasterList();
 return true;
}

function saveQualificationMasterItem() {
 if (!isCurrentStaffAdminOrClerk()) {
  alert("資格・研修マスタの追加・変更は、管理者または事務員のみ操作可能です。");
  return false;
 }
 const editId = (document.getElementById("qmEditId")?.value || "").trim();
 const name = (document.getElementById("qmName")?.value || "").trim();
 const kana = (document.getElementById("qmKana")?.value || "").trim();
 if (!name) {
  alert("資格・研修の名前を入力してください。");
  return false;
 }
 if (!kana) {
  alert("読みがな（ひらがな）を入力してください。");
  return false;
 }
 if (!cpRequireSelect("qmKind", "種類（資格／研修）")) return false;
 if (!cpRequireSelect("qmHasMark", "基準や加算の印")) return false;

 const kind = document.getElementById("qmKind").value.trim();
 const hasMark = document.getElementById("qmHasMark").value.trim();
 const markDetail = hasMark === "あり" ? (document.getElementById("qmMarkDetail")?.value || "").trim() : "";
 const sourceUrl = hasMark === "あり" ? (document.getElementById("qmSourceUrl")?.value || "").trim() : "";

 if (hasMark === "あり") {
  if (!markDetail) {
   alert("基準や加算の印を「あり」にするときは、印の中身（何の基準・加算か）を入力してください。");
   return false;
  }
  if (!sourceUrl || !/^https?:\/\/\S+/i.test(sourceUrl)) {
   alert("基準や加算の印を「あり」にするときは、根拠となる出典URL（https://...）を入力してください（出典なしでは保存できません）。");
   return false;
  }
 }

 if (!Array.isArray(db.data.qualification_master) || db.data.qualification_master.length === 0) {
  db.data.qualification_master = CP_INITIAL_QUALIFICATION_MASTER.map(x => Object.assign({}, x));
 }
 const masterList = db.data.qualification_master;

 const dup = masterList.find(x => x && x.name === name && String(x.id) !== String(editId));
 if (dup) {
  alert(`「${name}」はすでにマスタに登録されています。`);
  return false;
 }

 if (editId) {
  const target = masterList.find(x => String(x.id) === String(editId));
  if (!target) return false;
  if (target.status === "使わない") {
   alert("「使わない」になっている項目は変更できません。");
   return false;
  }
  // 何も変わっていない場合は変更履歴を増やさない
  if (
   (target.name || "") === name &&
   (target.kana || "") === kana &&
   (target.kind || "資格") === kind &&
   (target.has_mark || "なし") === hasMark &&
   (target.mark_detail || "") === markDetail &&
   (target.source_url || "") === sourceUrl
  ) {
   resetQualificationMasterForm();
   renderQualificationMasterList();
   return true;
  }
  // [Claude修正 2026-10-19] 職員に付いている項目の名前・種類を変えると、その職員の資格の意味が変わってしまう → 新しい項目を作ってもらう
  if (((target.name || "") !== name || (target.kind || "資格") !== kind)) {
   const cpUsers = (db.data.stamps || []).filter(st => cpGetStaffQualifications(st).some(q => !q.is_other && Number(q.master_id) === Number(target.id)));
   if (cpUsers.length) {
    alert(`「${target.name}」は ${cpUsers.length}名の職員に付いているため、名前・種類は変えられません。\n別のものにするときは、新しい項目を追加して、この項目は「使わない」にしてください。`);
    return false;
   }
  }
  const editReason = (document.getElementById("qmEditReason")?.value || "").trim();
  if (!editReason) {
   alert("変更の理由を入力してください。");
   return false;
  }
  const oldCopy = JSON.parse(JSON.stringify(target));
  target.name = name;
  target.kana = kana;
  target.kind = kind;
  target.has_mark = hasMark;
  target.mark_detail = markDetail;
  target.source_url = sourceUrl;
  target.updated_at = toLocalDateTimeStr(new Date());
  target.updated_by = cpLoginStaffName();
  cpAppendEditHistory(target, oldCopy, ["name", "kana", "kind", "has_mark", "mark_detail", "source_url"], editReason);
 } else {
  const nextId = Math.max(Date.now(), masterList.reduce((mx, x) => Math.max(mx, Number(x.id) || 0), 0) + 1); // [Claude修正 2026-10-19] 2台で同時に足すと同じ番号（11）になり、職員の資格がどちらを指すか分からなくなっていた
  masterList.push({
   id: nextId,
   name: name,
   kana: kana,
   kind: kind,
   has_mark: hasMark,
   mark_detail: markDetail,
   source_url: sourceUrl,
   created_by: cpLoginStaffName(),
   created_at: toLocalDateTimeStr(new Date()),
   status: "有効"
  });
 }

 db.save();
 resetQualificationMasterForm();
 renderQualificationMasterList();
 populateStaffQualMasterSelect("");
 if (typeof renderStaffQualificationsTable === "function") renderStaffQualificationsTable();
 return true;
}

function toggleQualificationMasterUnused(id, reasonOpt) {
 if (!isCurrentStaffAdminOrClerk()) {
  alert("資格・研修マスタの変更は、管理者または事務員のみ操作可能です。");
  return false;
 }
 if (!Array.isArray(db.data.qualification_master) || db.data.qualification_master.length === 0) {
  db.data.qualification_master = CP_INITIAL_QUALIFICATION_MASTER.map(x => Object.assign({}, x));
 }
 const target = db.data.qualification_master.find(x => Number(x.id) === Number(id));
 if (!target) return false;

 if (target.status === "使わない") {
  const r = reasonOpt !== undefined ? String(reasonOpt) : prompt(`「${target.name}」を再び「有効（使う）」に戻します。\n理由を入力してください。`, "");
  if (r === null) return false;
  if (!String(r).trim()) {
   alert("理由を入力してください。");
   return false;
  }
  const oldCopy = JSON.parse(JSON.stringify(target));
  target.status = "有効";
  cpAppendEditHistory(target, oldCopy, ["status"], String(r).trim());
 } else {
  const r = reasonOpt !== undefined ? String(reasonOpt) : prompt(`「${target.name}」を「使わない」にします（マスタからは消えず、履歴として残ります）。\n理由を入力してください。`, "");
  if (r === null) return false;
  if (!String(r).trim()) {
   alert("理由を入力してください。変更は行っていません。");
   return false;
  }
  const oldCopy = JSON.parse(JSON.stringify(target));
  target.status = "使わない";
  target.unused_at = toLocalDateTimeStr(new Date());
  target.unused_by = cpLoginStaffName();
  target.unused_reason = String(r).trim();
  cpAppendEditHistory(target, oldCopy, ["status", "unused_reason"], String(r).trim());
 }

 db.save();
 resetQualificationMasterForm();
 renderQualificationMasterList();
 populateStaffQualMasterSelect("");
 if (typeof renderStaffQualificationsTable === "function") renderStaffQualificationsTable();
 return true;
}

function renderQualificationMasterList() {
 const listEl = document.getElementById("qualificationMasterList");
 if (!listEl) return;
 const editId = (document.getElementById("qmEditId")?.value || "").trim();
 const masterList = cpGetQualificationMaster();
 const ordered = masterList.filter(m => m && m.status !== "使わない").concat(masterList.filter(m => m && m.status === "使わない"));

 listEl.innerHTML = ordered.map(m => {
  const isUnused = m.status === "使わない";
  const isEditing = String(m.id) === String(editId);
  const markBadge = m.has_mark === "あり"
   ? `<div style="margin-top:4px;"><span class="qual-mark-badge">印あり：${escapeHtml(m.mark_detail)}</span> <span style="font-size:13px;">出典: ${cpFormatQualSourceLinksHtml(m.source_url)}</span></div>`
   : `<span style="font-size:13px; color:var(--ink-3);">基準・加算の印: なし</span>`;
  const regInfo = m.created_at
   ? `登録: ${escapeHtml(m.created_at)}（${escapeHtml(m.created_by || "")}）`
   : `初期登録マスタ`;
  const histHtml = (Array.isArray(m.edit_history) && m.edit_history.length)
   ? `<div style="margin-top:4px; font-size:13px; color:var(--ink-3);">変更履歴: ${m.edit_history.map(h => `${escapeHtml(h.edited_at)} ${escapeHtml(h.edited_by)}（理由: ${escapeHtml(h.reason || "")}）`).join(" / ")}</div>`
   : "";
  const unusedInfo = isUnused
   ? `<div style="margin-top:4px; color:var(--alert); font-weight:bold; font-size:13px;">使わない設定（${escapeHtml(m.unused_at || "")} ${escapeHtml(m.unused_by || "")} / 理由: ${escapeHtml(m.unused_reason || "")}）</div>`
   : "";

  return `<div class="qual-master-card ${isUnused ? "is-unused" : ""} ${isEditing ? "is-editing" : ""}">
   <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:8px;">
    <div>
     <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
      <span class="badge" style="background:var(--pine-tint); color:var(--pine-dark); font-size:13px; padding:2px 8px;">${escapeHtml(m.kind || "資格")}</span>
      <strong style="font-size:14px; color:var(--ink); ${isUnused ? "text-decoration:line-through;" : ""}">${escapeHtml(m.name)}</strong>
      <span style="font-size:13px; color:var(--ink-2);">（${escapeHtml(m.kana || "")}）</span>
      <span style="font-size:13px; color:var(--ink-3);">[${regInfo}]</span>
     </div>
     ${markBadge}
     ${unusedInfo}
     ${histHtml}
    </div>
    <div style="display:flex; gap:6px; flex-wrap:wrap;">
     ${!isUnused ? `<button type="button" class="btn btn-secondary" style="font-size:13px; padding:3px 8px;" onclick="startEditQualificationMasterItem(${Number(m.id)})">変更</button>` : ""}
     <button type="button" class="btn btn-secondary" style="font-size:13px; padding:3px 8px; ${isUnused ? "" : "color:var(--alert); border-color:var(--alert);"}" onclick="toggleQualificationMasterUnused(${Number(m.id)})">${isUnused ? "使うに戻す" : "使わないにする"}</button>
    </div>
   </div>
  </div>`;
 }).join("");
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



// ==========================================
// [Antigravity実装 2026-10-21] 認知症高齢者の日常生活自立度
// 厚生労働省留意事項通知準拠（医師の判定／主治医意見書／認定調査票）
// ==========================================

function cpGetDementiaAssessments(residentId) {
  const list = (db.data && Array.isArray(db.data.dementia_assessments)) ? db.data.dementia_assessments : [];
  if (residentId === undefined || residentId === null) return list;
  return list.filter(a => Number(a.resident_id) === Number(residentId));
}

function cpGetLatestDementiaAssessment(residentId) {
  if (!residentId) return null;
  const list = (db.data && Array.isArray(db.data.dementia_assessments)) ? db.data.dementia_assessments : [];
  const resId = Number(residentId);
  const valid = list.filter(a => Number(a.resident_id) === resId && !a.voided);
  if (!valid.length) return null;
  valid.sort((a, b) => {
    const cmp = String(b.assessed_on || "").localeCompare(String(a.assessed_on || ""));
    if (cmp !== 0) return cmp;
    const recA = String(a.recorded_at || "");
    const recB = String(b.recorded_at || "");
    if (recB !== recA) return recB.localeCompare(recA);
    return Number(b.id || 0) - Number(a.id || 0);
  });
  return valid[0];
}

function cpGetDementiaRankOn(residentId, dateStr) {
  if (!residentId || !dateStr) return null;
  const list = (db.data && Array.isArray(db.data.dementia_assessments)) ? db.data.dementia_assessments : [];
  const resId = Number(residentId);
  const targetDate = String(dateStr).trim();
  const valid = list.filter(a =>
    Number(a.resident_id) === resId &&
    !a.voided &&
    a.assessed_on &&
    String(a.assessed_on).trim() <= targetDate
  );
  if (!valid.length) return null;
  valid.sort((a, b) => {
    const cmp = String(b.assessed_on || "").localeCompare(String(a.assessed_on || ""));
    if (cmp !== 0) return cmp;
    const recA = String(a.recorded_at || "");
    const recB = String(b.recorded_at || "");
    if (recB !== recA) return recB.localeCompare(recA);
    return Number(b.id || 0) - Number(a.id || 0);
  });
  // [Claude修正] 保存している記録そのものに関数を足さない（返すのは判定の記録。ランクは .rank で読む）
  return valid[0];
}

function cpDementiaSectionHtml(r) {
  if (!r) return "";
  const latest = cpGetLatestDementiaAssessment(r.id);
  const canEdit = typeof cpCanEditPolicy === "function" && cpCanEditPolicy();

  let bodyHtml = "";
  if (!latest) {
    bodyHtml = '<div style="font-size:13px; color:var(--text-muted); padding:4px 0;">未登録</div>';
  } else {
    const doctorStr = latest.doctor_name ? `（医師: ${escapeHtml(latest.doctor_name)}）` : "";
    bodyHtml = `
      <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; font-size:13px;">
        <span style="display:inline-block; font-size:15px; font-weight:bold; color:var(--pine-dark); background:var(--pine-light); border:1px solid var(--pine); border-radius:4px; padding:2px 10px;">ランク ${escapeHtml(latest.rank)}</span>
        <span style="color:var(--ink);">判定日: <strong>${escapeHtml(latest.assessed_on)}</strong></span>
        <span style="color:var(--text-muted);">根拠: ${escapeHtml(latest.basis)}${doctorStr}</span>
      </div>
    `;
  }

  return `
    <div class="card" style="margin-bottom:12px; padding:12px; border:1px solid var(--line); border-radius:8px; background:var(--surface);">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:8px;">
        <div style="font-weight:bold; color:var(--pine); font-size:14px;">
          認知症高齢者の日常生活自立度
        </div>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          ${canEdit ? `<button type="button" class="btn btn-primary" style="font-size:13px; padding:3px 10px;" onclick="openDementiaAssessmentModal(${r.id})">判定を登録</button>` : ""}
          <button type="button" class="btn btn-secondary" style="font-size:13px; padding:3px 10px;" onclick="openDementiaAssessmentHistoryModal(${r.id})">履歴</button>
        </div>
      </div>
      <div>
        ${bodyHtml}
      </div>
    </div>
  `;
}

function openDementiaAssessmentModal(residentId) {
  if (typeof cpCanEditPolicy === "function" && !cpCanEditPolicy()) {
    alert("認知症高齢者の日常生活自立度を登録できるのは管理者・計画作成担当者・看護師です。");
    return;
  }
  const r = (gState.residents || []).find(x => Number(x.id) === Number(residentId));
  if (!r) {
    alert("利用者が見つかりません。");
    return;
  }
  const resIdEl = document.getElementById("dementiaResId");
  const resNameEl = document.getElementById("dementiaResName");
  const rankEl = document.getElementById("dementiaRank");
  const dateEl = document.getElementById("dementiaAssessedOn");
  const basisEl = document.getElementById("dementiaBasis");
  const docEl = document.getElementById("dementiaDoctorName");

  if (resIdEl) resIdEl.value = r.id;
  if (resNameEl) resNameEl.textContent = `${r.name} 様 (${r.room_no || "-"}号室)`;
  if (rankEl) rankEl.value = "";
  if (dateEl) {
    dateEl.value = "";
    dateEl.max = toLocalDateStr(new Date());
  }
  if (basisEl) basisEl.value = "";
  if (docEl) docEl.value = "";

  onDementiaBasisChange();

  const modal = document.getElementById("dementiaAssessmentModal");
  if (modal) modal.style.display = "flex";
}

function closeDementiaAssessmentModal() {
  const modal = document.getElementById("dementiaAssessmentModal");
  if (modal) modal.style.display = "none";
}

function onDementiaBasisChange() {
  const basisEl = document.getElementById("dementiaBasis");
  const rowEl = document.getElementById("dementiaDoctorRow");
  const labelEl = document.getElementById("dementiaDoctorLabel");
  if (!basisEl || !rowEl) return;
  const basis = basisEl.value;
  if (basis === "医師の判定" || basis === "主治医意見書") {
    rowEl.style.display = "block";
    if (labelEl) labelEl.textContent = "判定医師名 (必須)";
  } else if (basis === "認定調査票") {
    rowEl.style.display = "block";
    if (labelEl) labelEl.textContent = "判定医師名 (任意)";
  } else {
    rowEl.style.display = "none";
  }
}

function submitDementiaAssessment() {
  if (typeof cpCanEditPolicy === "function" && !cpCanEditPolicy()) {
    alert("認知症高齢者の日常生活自立度を登録できるのは管理者・計画作成担当者・看護師です。");
    return;
  }
  const resIdEl = document.getElementById("dementiaResId");
  const resId = resIdEl ? Number(resIdEl.value) : 0;
  if (!resId) {
    alert("利用者が選択されていません。");
    return;
  }
  const rankEl = document.getElementById("dementiaRank");
  const rank = rankEl ? rankEl.value.trim() : "";
  if (!rank) {
    alert("ランクを選んでください。");
    return;
  }
  const dateEl = document.getElementById("dementiaAssessedOn");
  const assessedOn = dateEl ? dateEl.value.trim() : "";
  if (!assessedOn) {
    alert("判定日を入力してください。");
    return;
  }
  const today = toLocalDateStr(new Date());
  if (assessedOn > today) {
    alert("判定日に未来の日付は指定できません。");
    return;
  }
  const basisEl = document.getElementById("dementiaBasis");
  const basis = basisEl ? basisEl.value.trim() : "";
  if (!basis) {
    alert("根拠を選んでください。");
    return;
  }
  const docEl = document.getElementById("dementiaDoctorName");
  const doctorName = docEl ? docEl.value.trim() : "";
  if ((basis === "医師の判定" || basis === "主治医意見書") && !doctorName) {
    alert("医師の判定または主治医意見書の場合は、判定した医師名を入力してください。");
    return;
  }

  if (!Array.isArray(db.data.dementia_assessments)) {
    db.data.dementia_assessments = [];
  }

  const now = new Date();
  const id = Date.now();
  const rec = {
    id: id,
    resident_id: resId,
    rank: rank,
    assessed_on: assessedOn,
    basis: basis,
    doctor_name: doctorName,
    recorded_by: (typeof cpLoginStaffName === "function") ? cpLoginStaffName() : "",
    recorded_at: toLocalDateTimeStr(now),
    voided: false,
    void_reason: "",
    voided_by: "",
    voided_at: ""
  };

  db.data.dementia_assessments.push(rec);
  db.save();

  closeDementiaAssessmentModal();
  if (typeof renderResidentDetail === "function") renderResidentDetail();
  alert("認知症高齢者の日常生活自立度を登録しました。");
}

function openDementiaAssessmentHistoryModal(residentId) {
  const r = (gState.residents || []).find(x => Number(x.id) === Number(residentId));
  if (!r) {
    alert("利用者が見つかりません。");
    return;
  }
  const titleEl = document.getElementById("dementiaHistResName");
  if (titleEl) titleEl.textContent = `${r.name} 様 (${r.room_no || "-"}号室) - 自立度判定履歴`;
  const hidEl = document.getElementById("dementiaHistResId");
  if (hidEl) hidEl.value = r.id;

  renderDementiaAssessmentHistoryList(r.id);

  const modal = document.getElementById("dementiaAssessmentHistoryModal");
  if (modal) modal.style.display = "flex";
}

function closeDementiaAssessmentHistoryModal() {
  const modal = document.getElementById("dementiaAssessmentHistoryModal");
  if (modal) modal.style.display = "none";
}

function renderDementiaAssessmentHistoryList(residentId) {
  const container = document.getElementById("dementiaHistoryListContainer");
  if (!container) return;
  const list = cpGetDementiaAssessments(residentId).slice();
  list.sort((a, b) => {
    const cmp = String(b.assessed_on || "").localeCompare(String(a.assessed_on || ""));
    if (cmp !== 0) return cmp;
    const recA = String(a.recorded_at || "");
    const recB = String(b.recorded_at || "");
    if (recB !== recA) return recB.localeCompare(recA);
    return Number(b.id || 0) - Number(a.id || 0);
  });

  if (!list.length) {
    container.innerHTML = '<div style="font-size:13px; color:var(--text-muted); text-align:center; padding:16px 0;">判定記録はありません。</div>';
    return;
  }

  const canEdit = typeof cpCanEditPolicy === "function" && cpCanEditPolicy();
  container.innerHTML = list.map(a => {
    const isVoided = !!a.voided;
    const docText = a.doctor_name ? ` (医師: ${escapeHtml(a.doctor_name)})` : "";
    return `
      <div style="border:1px solid var(--line); border-radius:6px; padding:10px 12px; margin-bottom:8px; background:${isVoided ? "var(--ground)" : "var(--surface)"}; opacity:${isVoided ? "0.75" : "1"};">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:8px;">
          <div>
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:4px;">
              ${isVoided ? '<span style="font-size:13px; font-weight:bold; color:var(--alert); background:var(--alert-tint); border:1px solid var(--alert); border-radius:4px; padding:1px 6px;">取消済</span>' : ""}
              <strong style="font-size:15px; color:${isVoided ? "var(--text-muted)" : "var(--pine-dark)"}; ${isVoided ? "text-decoration:line-through;" : ""}">ランク ${escapeHtml(a.rank)}</strong>
              <span style="font-size:13px; color:var(--ink);">判定日: ${escapeHtml(a.assessed_on)}</span>
            </div>
            <div style="font-size:13px; color:var(--text-muted);">
              根拠: ${escapeHtml(a.basis)}${docText}
            </div>
            <div style="font-size:13px; color:var(--text-muted); margin-top:2px;">
              登録者: ${escapeHtml(a.recorded_by || "-")} (${escapeHtml(a.recorded_at || "-")})
            </div>
            ${isVoided ? `
              <div style="margin-top:6px; padding:6px 8px; background:var(--alert-tint); border-left:3px solid var(--alert); font-size:13px;">
                <span style="font-weight:bold; color:var(--alert);">取消理由:</span> ${escapeHtml(a.void_reason || "-")}<br>
                <span style="color:var(--text-muted);">取消者: ${escapeHtml(a.voided_by || "-")} (${escapeHtml(a.voided_at || "-")})</span>
              </div>
            ` : ""}
          </div>
          <div>
            ${(!isVoided && canEdit) ? `
              <button type="button" id="voidBtn_${a.id}" class="btn btn-secondary" style="font-size:13px; padding:3px 8px; color:var(--alert); border-color:var(--line);" onclick="openVoidDementiaAssessment(${a.id})">取消</button>
            ` : ""}
          </div>
        </div>
        <div id="voidBox_${a.id}" style="display:none; margin-top:10px; padding:8px; border:1px solid var(--line); border-radius:4px; background:var(--ground);">
          <div style="font-size:13px; font-weight:bold; margin-bottom:4px; color:var(--alert);">この判定記録を取り消します</div>
          <input type="text" id="voidReason_${a.id}" class="form-control" style="font-size:13px; margin-bottom:6px; width:100%; box-sizing:border-box;" placeholder="取消の理由を入力してください">
          <div style="display:flex; gap:6px; justify-content:flex-end;">
            <button type="button" class="btn btn-secondary" style="font-size:13px; padding:3px 10px;" onclick="cancelVoidDementiaAssessment(${a.id})">戻る</button>
            <button type="button" class="btn btn-danger" style="font-size:13px; padding:3px 10px;" onclick="confirmVoidDementiaAssessment(${a.id})">取消を確定</button>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

function openVoidDementiaAssessment(assessmentId) {
  if (typeof cpCanEditPolicy === "function" && !cpCanEditPolicy()) {
    alert("認知症高齢者の日常生活自立度を取り消せるのは管理者・計画作成担当者・看護師です。");
    return;
  }
  const btn = document.getElementById(`voidBtn_${assessmentId}`);
  const box = document.getElementById(`voidBox_${assessmentId}`);
  if (btn) btn.style.display = "none";
  if (box) {
    box.style.display = "block";
    const inp = document.getElementById(`voidReason_${assessmentId}`);
    if (inp) {
      inp.value = "";
      inp.focus();
    }
  }
}

function cancelVoidDementiaAssessment(assessmentId) {
  const btn = document.getElementById(`voidBtn_${assessmentId}`);
  const box = document.getElementById(`voidBox_${assessmentId}`);
  if (btn) btn.style.display = "inline-block";
  if (box) box.style.display = "none";
}

function confirmVoidDementiaAssessment(assessmentId) {
  if (typeof cpCanEditPolicy === "function" && !cpCanEditPolicy()) {
    alert("認知症高齢者の日常生活自立度を取り消せるのは管理者・計画作成担当者・看護師です。");
    return;
  }
  const inp = document.getElementById(`voidReason_${assessmentId}`);
  const reason = inp ? inp.value.trim() : "";
  if (!reason) {
    alert("取消の理由を入力してください。");
    return;
  }
  submitVoidDementiaAssessment(assessmentId, reason);
}

function submitVoidDementiaAssessment(assessmentId, voidReason) {
  if (typeof cpCanEditPolicy === "function" && !cpCanEditPolicy()) {
    alert("認知症高齢者の日常生活自立度を取り消せるのは管理者・計画作成担当者・看護師です。");
    return;
  }
  const reason = (voidReason || "").trim();
  if (!reason) {
    alert("取消の理由を入力してください。");
    return;
  }
  const list = (db.data && Array.isArray(db.data.dementia_assessments)) ? db.data.dementia_assessments : [];
  const target = list.find(a => Number(a.id) === Number(assessmentId));
  if (!target) {
    alert("該当する判定記録が見つかりません。");
    return;
  }
  if (target.voided) {
    alert("既に取り消されています。");
    return;
  }
  const now = new Date();
  target.voided = true;
  target.void_reason = reason;
  target.voided_by = (typeof cpLoginStaffName === "function") ? cpLoginStaffName() : "";
  target.voided_at = toLocalDateTimeStr(now);

  db.save();

  if (typeof renderResidentDetail === "function") renderResidentDetail();
  renderDementiaAssessmentHistoryList(target.resident_id);
  alert("判定記録を取り消しました。");
}

window.cpGetDementiaAssessments = cpGetDementiaAssessments;
window.cpGetLatestDementiaAssessment = cpGetLatestDementiaAssessment;
window.cpGetDementiaRankOn = cpGetDementiaRankOn;
window.cpDementiaSectionHtml = cpDementiaSectionHtml;
window.openDementiaAssessmentModal = openDementiaAssessmentModal;
window.closeDementiaAssessmentModal = closeDementiaAssessmentModal;
window.onDementiaBasisChange = onDementiaBasisChange;
window.submitDementiaAssessment = submitDementiaAssessment;
window.openDementiaAssessmentHistoryModal = openDementiaAssessmentHistoryModal;
window.closeDementiaAssessmentHistoryModal = closeDementiaAssessmentHistoryModal;
window.renderDementiaAssessmentHistoryList = renderDementiaAssessmentHistoryList;
window.openVoidDementiaAssessment = openVoidDementiaAssessment;
window.cancelVoidDementiaAssessment = cancelVoidDementiaAssessment;
window.confirmVoidDementiaAssessment = confirmVoidDementiaAssessment;
window.submitVoidDementiaAssessment = submitVoidDementiaAssessment;