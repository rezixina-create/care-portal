// ==========================================
// [Antigravity実装 2026-10-19] 入院の期間リスト (r.hospitalizations) の管理・カルテ表示・入退院手続き
// ==========================================
function cpSyncResidentHospitalFields(r) {
 if (!r) return;
 const list = cpGetHospitalizations(r).slice().sort((a, b) => String(a.admission_date || "").localeCompare(String(b.admission_date || "")));
 const ongoing = list.find(h => !h.discharge_date);
 if (ongoing) {
 if (!cpIsDischarged(r)) r.status = "入院中";
 r.hospital_date = ongoing.admission_date || "";
 r.hospital_name = ongoing.hospital_name || "";
 r.hospital_reason = ongoing.reason || "";
 } else {
 if (r.status === "入院中") r.status = "在所";
 const latest = list[list.length - 1];
 if (latest) {
 r.hospital_date = latest.admission_date || "";
 r.hospital_name = latest.hospital_name || "";
 r.hospital_reason = latest.reason || "";
 } else {
 r.hospital_date = "";
 r.hospital_name = "";
 r.hospital_reason = "";
 }
 }
}

function cpCanEditHospitalRecord(hosp) {
 const me = cpLoginStaffName();
 const f = typeof cpRoleFlags === "function" ? cpRoleFlags(me) : {};
 if (f.director || f.nurse || f.caremanager) return true;
 if (hosp && hosp.created_by && hosp.created_by === me) return true;
 return false;
}

function cpHospitalHistorySectionHtml(r) {
 if (!r) return "";
 const list = cpGetHospitalizations(r).slice().sort((a, b) => String(b.admission_date || "").localeCompare(String(a.admission_date || "")));
 const ongoing = list.find(h => !h.discharge_date);
 const summaryText = ongoing
 ? `現在入院中（${escapeHtml(ongoing.admission_date)}〜 ／ ${escapeHtml(ongoing.hospital_name || "入院先未登録")}）`
 : (list.length ? `過去 ${list.length}回` : "記録なし");

 const rowsHtml = list.length === 0
 ? `<div style="font-size:13px; color:var(--text-muted); padding:4px 0;">入院の記録はありません。</div>`
 : `<div class="cp-hosp-list">` + list.map(h => {
 const isOngoing = !h.discharge_date;
 const periodStr = `${escapeHtml(h.admission_date || "未登録")} 〜 ${isOngoing ? "<strong>入院中（継続）</strong>" : escapeHtml(h.discharge_date)}`;
 const histCount = (h.edit_history || []).length;
 const canEdit = cpCanEditHospitalRecord(h);
 return `<div class="cp-hosp-item ${isOngoing ? "is-ongoing" : ""}">
 <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:6px;">
 <div>
 <div style="font-size:14px;">
 <span class="badge" style="background:${isOngoing ? "var(--caution)" : "var(--pine-dark)"}; color:#fff; font-size:13px; padding:2px 8px; margin-right:6px;">${isOngoing ? "入院中" : "退院済"}</span>
 <span>期間: ${periodStr}</span>
 </div>
 <div style="font-size:13px; margin-top:4px; color:var(--text-main);">
 <strong>入院先:</strong> ${escapeHtml(h.hospital_name || "未登録")} ／ <strong>理由:</strong> ${escapeHtml(h.reason || "未登録")}
 </div>
 ${(h.created_by || histCount) ? `<div style="font-size:13px; color:var(--text-muted); margin-top:2px;">${h.created_by ? "記録: " + escapeHtml(h.created_by) : ""}${h.discharged_by ? " ／ 退院手続き: " + escapeHtml(h.discharged_by) : ""}${histCount ? ` ／ 訂正 ${histCount}回` : ""}</div>` : ""}
 </div>
 <div style="display:flex; gap:6px; flex-wrap:wrap;">
 ${isOngoing && !cpIsDischarged(r) ? `<button type="button" class="btn btn-primary" style="font-size:13px; padding:3px 10px;" onclick="event.preventDefault(); event.stopPropagation(); openHospitalDischargeModal(${r.id}, ${h.id}); return false;">退院日を入れる（在所へ戻す）</button>` : ""}
 ${canEdit ? `<button type="button" class="btn btn-secondary" style="font-size:13px; padding:3px 10px;" onclick="event.preventDefault(); event.stopPropagation(); openHospitalModal(${r.id}, ${h.id}); return false;">内容・期間を訂正</button>` : `<span style="font-size:13px; color:var(--text-muted);">訂正は記録者・看護師・管理者</span>`}
 </div>
 </div>
 </div>`;
 }).join("") + `</div>`;

 return `<details class="care-accordion" ${ongoing || list.length ? "open" : ""} style="margin-bottom:10px; border:1px solid var(--border-color); border-radius:8px; background:var(--card-bg); overflow:hidden;">
 <summary style="padding:10px 14px; background:var(--bg-color); font-weight:bold; cursor:pointer; font-size:13px; color:var(--pine-dark); border-bottom:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
 <span>入院の歴（期間の一覧） <span style="font-weight:normal; color:var(--text-muted); margin-left:6px;">${summaryText}</span></span>
 <div style="display:flex; align-items:center; gap:6px;">
 ${!ongoing && !cpIsDischarged(r) ? `<button type="button" class="btn btn-secondary" style="padding:3px 10px; font-size:13px;" onclick="event.preventDefault(); event.stopPropagation(); openHospitalModal(${r.id}, null); return false;">+ 入院を登録</button>` : ""}
 <span style="font-size:13px; color:var(--text-muted);">(開閉)</span>
 </div>
 </summary>
 <div style="padding:12px;">
 ${rowsHtml}
 </div>
 </details>`;
}

function openHospitalModal(resId, hospId) {
 const r = (gState.residents || []).find(x => Number(x.id) === Number(resId || gState.selectedResidentId));
 if (!r) return;
 if (cpIsDischarged(r) && !hospId) {
 alert("退所した方に新しい入院は登録できません。");
 return;
 }
 const list = cpGetHospitalizations(r);
 const editing = (hospId !== null && hospId !== undefined && hospId !== "")
 ? list.find(h => Number(h.id) === Number(hospId))
 : null;

 if (!editing) {
 const ongoing = list.find(h => !h.discharge_date);
 if (ongoing || r.status === "入院中") {
 alert("すでに入院中の記録があります。新しく入院を登録する前に、現在の入院に退院日を入れてください（内容を直すときは「内容・期間を訂正」を使ってください）。");
 renderResidentDetail();
 return;
 }
 } else {
 if (!cpCanEditHospitalRecord(editing)) {
 alert("ほかの職員が登録した入院記録を訂正できるのは、記録した本人または管理者・看護師・計画作成担当者だけです。");
 return;
 }
 }

 document.getElementById("hospResidentId").value = String(r.id);
 document.getElementById("hospRecordId").value = editing ? String(editing.id) : "";
 const titleEl = document.getElementById("hospitalModalTitle");
 if (titleEl) titleEl.textContent = editing ? `入院の期間・内容の訂正（${r.name} 様）` : `入院の登録（${r.name} 様）`;

 const today = gState.selectedDate || toLocalDateStr(new Date());
 document.getElementById("hospAdmissionDate").value = editing ? (editing.admission_date || "") : today;
 document.getElementById("hospDischargeDate").value = editing ? (editing.discharge_date || "") : "";
 document.getElementById("hospName").value = editing ? (editing.hospital_name || "") : "";
 document.getElementById("hospReason").value = editing ? (editing.reason || "") : "";

 const disWrap = document.getElementById("hospDischargeDateWrap");
 if (disWrap) disWrap.style.display = editing ? "block" : "none";

 const reasonWrap = document.getElementById("hospEditReasonWrap");
 const reasonEl = document.getElementById("hospEditReason");
 if (reasonWrap) reasonWrap.style.display = editing ? "block" : "none";
 if (reasonEl) reasonEl.value = "";

 openModal("hospitalModal");
}

function submitHospitalModal() {
 const resId = Number((document.getElementById("hospResidentId") || {}).value);
 const recIdRaw = ((document.getElementById("hospRecordId") || {}).value || "").trim();
 const editingId = recIdRaw ? Number(recIdRaw) : null;
 const r = (gState.residents || []).find(x => Number(x.id) === resId);
 if (!r) return;

 const admDate = ((document.getElementById("hospAdmissionDate") || {}).value || "").trim();
 const disDate = editingId !== null ? ((document.getElementById("hospDischargeDate") || {}).value || "").trim() : "";
 const hName = ((document.getElementById("hospName") || {}).value || "").trim();
 const hReason = ((document.getElementById("hospReason") || {}).value || "").trim();
 const editReason = ((document.getElementById("hospEditReason") || {}).value || "").trim();
 const today = toLocalDateStr(new Date());

 if (!/^\d{4}-\d{2}-\d{2}$/.test(admDate)) {
 alert("入院日を入力してください。");
 return;
 }
 if (admDate > today) {
 alert("入院日に先の日付は入れられません。");
 return;
 }
 if (r.admission_date && admDate < r.admission_date) {
 alert(`入院日が施設の入居日（${r.admission_date}）より前になっています。`);
 return;
 }
 if (disDate) {
 if (!/^\d{4}-\d{2}-\d{2}$/.test(disDate)) {
 alert("退院日を正しく入力してください。");
 return;
 }
 if (disDate > today) {
 alert("退院日に先の日付は入れられません。");
 return;
 }
 if (disDate < admDate) {
 alert("退院日が入院日より前になっています。入院日以降の日付を入れてください。");
 return;
 }
 }
 if (!hName) {
 alert("入院先（病院名）を入力してください。");
 return;
 }
 if (!hReason) {
 alert("入院の理由を入力してください。");
 return;
 }

 const list = cpMaterializeHospitalizations(r); // [Claude修正 2026-10-22] 書き換えるときだけ入院の期間リストを作る
 // ほかの入院期間との重なりを確かめる
 const effEnd = disDate || "9999-12-31";
 const overlap = list.find(h => {
 if (editingId !== null && Number(h.id) === editingId) return false;
 const oStart = h.admission_date || "";
 const oEnd = h.discharge_date || "9999-12-31";
 return admDate <= oEnd && oStart <= effEnd;
 });
 if (overlap) {
 alert(`別の入院期間（${overlap.admission_date}〜${overlap.discharge_date || "入院中"}）と日付が重なっています。日付を確かめてください。`);
 return;
 }

 const outings = (typeof cpGetOutings === "function") ? cpGetOutings(r) : (r.outings || []);
 const outingOverlap = outings.find(o => {
 if (!o || !o.start_date) return false;
 const oEnd = o.end_date || "9999-12-31";
 return admDate <= oEnd && o.start_date <= effEnd;
 });
 if (outingOverlap) {
 alert(`外泊の期間（${outingOverlap.start_date}〜${outingOverlap.end_date || "外泊中"}）と入院の期間が重複しています。重複する登録はできません。日付を確かめてください。`);
 return;
 }

 const who = cpLoginStaffName();
 const nowStr = toLocalDateTimeStr(new Date());

 if (editingId !== null) {
 const target = r.hospitalizations.find(h => h && Number(h.id) === editingId);
 if (!target) {
 alert("訂正する入院記録が見つかりません。");
 return;
 }
 if (!cpCanEditHospitalRecord(target)) {
 alert("ほかの職員が登録した入院記録を訂正できるのは、記録した本人または管理者・看護師・計画作成担当者だけです。");
 return;
 }
 if (!editReason) {
 alert("訂正の理由を入力してください。");
 return;
 }
 const oldRec = JSON.parse(JSON.stringify(target));
 const beforeLen = (target.edit_history || []).length;
 target.admission_date = admDate;
 target.discharge_date = disDate;
 target.hospital_name = hName;
 target.reason = hReason;
 cpAppendEditHistory(target, oldRec, ["admission_date", "discharge_date", "hospital_name", "reason"], editReason);
 if ((target.edit_history || []).length <= beforeLen) {
 alert("内容が変わっていません。");
 return;
 }
 } else {
 const ongoing = list.find(h => !h.discharge_date);
 if (ongoing) {
 alert("すでに入院中の記録があります。二重に登録はできません。");
 return;
 }
 let newId = Date.now();
 while (r.hospitalizations.some(h => h && Number(h.id) === newId)) newId++;
 r.hospitalizations.push({
 id: newId,
 resident_id: r.id,
 admission_date: admDate,
 discharge_date: "",
 hospital_name: hName,
 reason: hReason,
 created_by: who,
 created_at: nowStr
 });
 if (!Array.isArray(db.data.care_records)) db.data.care_records = [];
 db.data.care_records.unshift({
 id: Date.now() + 1,
 resident_id: r.id,
 category: "受診",
 recorded_at: `${admDate} ${cpNowHHMM()}`,
 content: `【入院】入院先: ${hName} ／ 理由: ${hReason}（入院日: ${admDate}）`,
 staff_name: who
 });
 }

 cpSyncResidentHospitalFields(r);
 db.data.residents = gState.residents;
 db.save();
 closeModal("hospitalModal");
 renderResidentsStrip();
 initGlobalTimeSync();
 renderResidentDetail();
 renderPersonalCalendar();
 loadDateRecords(gState.selectedDate);
 if (gState.activeCareTab === "vitals") renderVitalsTable();
 if (gState.activeCareTab === "meal") renderMealsTable();
 if (gState.activeCareTab === "med") renderMedTable();
 alert(editingId !== null ? `${r.name} 様の入院記録を訂正しました。` : `${r.name} 様の入院（${admDate}〜・${hName}）を登録しました。`);
}

function openHospitalDischargeModal(resId, hospId) {
 const r = (gState.residents || []).find(x => Number(x.id) === Number(resId || gState.selectedResidentId));
 if (!r) return;
 const list = cpGetHospitalizations(r);
 const target = hospId ? list.find(h => Number(h.id) === Number(hospId)) : list.find(h => !h.discharge_date);
 if (!target) {
 alert("現在入院中の記録が見つかりません。");
 return;
 }
 document.getElementById("hospDisResidentId").value = String(r.id);
 document.getElementById("hospDisRecordId").value = String(target.id);
 const infoEl = document.getElementById("hospDischargeCurrentInfo");
 if (infoEl) {
 infoEl.innerHTML = `<strong>${escapeHtml(r.name)} 様</strong><br>入院日: <strong>${escapeHtml(target.admission_date || "-")}</strong> ／ 入院先: <strong>${escapeHtml(target.hospital_name || "未登録")}</strong><br>理由: ${escapeHtml(target.reason || "未登録")}`;
 }
 const today = gState.selectedDate || toLocalDateStr(new Date());
 document.getElementById("hospDischargeInputDate").value = today >= (target.admission_date || "") ? today : (target.admission_date || today);
 document.getElementById("hospDischargeNote").value = "";
 openModal("hospitalDischargeModal");
}

function submitHospitalDischarge() {
 const resId = Number((document.getElementById("hospDisResidentId") || {}).value);
 const recId = Number((document.getElementById("hospDisRecordId") || {}).value);
 const r = (gState.residents || []).find(x => Number(x.id) === resId);
 if (!r) return;
 cpMaterializeHospitalizations(r);
 const target = (r.hospitalizations || []).find(h => h && Number(h.id) === recId);
 if (!target) {
 alert("対象の入院記録が見つかりません。");
 return;
 }
 if (target.discharge_date) {
 alert("すでに退院日が登録されています。");
 return;
 }
 const disDate = ((document.getElementById("hospDischargeInputDate") || {}).value || "").trim();
 const note = ((document.getElementById("hospDischargeNote") || {}).value || "").trim();
 const today = toLocalDateStr(new Date());
 if (!/^\d{4}-\d{2}-\d{2}$/.test(disDate)) {
 alert("退院日を入力してください。");
 return;
 }
 if (disDate > today) {
 alert("退院日に先の日付は入れられません。");
 return;
 }
 if (target.admission_date && disDate < target.admission_date) {
 alert(`退院日（${disDate}）が入院日（${target.admission_date}）より前になっています。入院日以降の日付を入れてください。`);
 return;
 }

 const outings = (typeof cpGetOutings === "function") ? cpGetOutings(r) : (r.outings || []);
 const outingOverlap = outings.find(o => {
 if (!o || !o.start_date) return false;
 const oEnd = o.end_date || "9999-12-31";
 return (target.admission_date || "") <= oEnd && o.start_date <= disDate;
 });
 if (outingOverlap) {
 alert(`外泊の期間（${outingOverlap.start_date}〜${outingOverlap.end_date || "外泊中"}）と退院日を含む入院期間が重複しています。日付を確かめてください。`);
 return;
 }
 const who = cpLoginStaffName();
 const nowStr = toLocalDateTimeStr(new Date());
 target.discharge_date = disDate;
 target.discharged_by = who;
 target.discharged_at = nowStr;
 if (note) target.discharge_note = note;

 cpSyncResidentHospitalFields(r);
 r.status = "在所";

 if (!Array.isArray(db.data.care_records)) db.data.care_records = [];
 db.data.care_records.unshift({
 id: Date.now() + 1,
 resident_id: r.id,
 category: "受診",
 recorded_at: `${disDate} ${cpNowHHMM()}`,
 content: `【退院】${target.hospital_name || "病院"}より退院（入院期間: ${target.admission_date}〜${disDate}）${note ? " ／ " + note : ""}`,
 staff_name: who
 });

 db.data.residents = gState.residents;
 db.save();
 closeModal("hospitalDischargeModal");
 renderResidentsStrip();
 initGlobalTimeSync();
 renderResidentDetail();
 renderPersonalCalendar();
 loadDateRecords(gState.selectedDate);
 if (gState.activeCareTab === "vitals") renderVitalsTable();
 if (gState.activeCareTab === "meal") renderMealsTable();
 if (gState.activeCareTab === "med") renderMedTable();
 alert(`${r.name} 様の退院（${disDate}）を記録し、在所へ戻しました。入院期間（${target.admission_date}〜${disDate}）は履歴に残ります。`);
}

function updateResidentStatus(resId, status) {
  const r = gState.residents.find(x => x.id === resId);
  if (r && cpIsDischarged(r)) { alert("退所者を戻すときは「退所取消」を行ってください。"); renderResidentDetail(); return; }
  if (!r) return;

  // 入院中への切り替え
  if (status === "入院中") {
    const ongoingHosp = cpGetHospitalizations(r).find(h => !h.discharge_date);
    if (ongoingHosp) {
      alert("既に入院中です。");
      renderResidentDetail();
      return;
    }
    const ongoingOuting = (typeof cpGetOutings === "function" ? cpGetOutings(r) : []).find(o => !o.end_date);
    if (ongoingOuting || r.status === "外泊中") {
      alert("外泊中の方は入院に変更できません。先に帰所（在所へ戻る）手続きを行ってください。");
      renderResidentDetail();
      return;
    }
    renderResidentDetail();
    openHospitalModal(r.id, null);
    return;
  }

  // 入院中から在所へ戻す
  if (r.status === "入院中" && status === "在所") {
    const ongoing = cpGetHospitalizations(r).find(h => !h.discharge_date);
    if (ongoing) {
      renderResidentDetail();
      openHospitalDischargeModal(r.id, ongoing.id);
      return;
    }
  }

  // 入院中から外泊中への直接変更
  if (r.status === "入院中" && status === "外泊中") {
    alert("入院中の方は外泊に変更できません。先に退院の手続き（退院日の入力）を行ってください。");
    renderResidentDetail();
    return;
  }

  // 外泊中への切り替え
  if (status === "外泊中") {
    const ongoingHosp = cpGetHospitalizations(r).find(h => !h.discharge_date);
    if (ongoingHosp || r.status === "入院中") {
      alert("入院中の方は外泊に変更できません。先に退院の手続き（退院日の入力）を行ってください。");
      renderResidentDetail();
      return;
    }
    const ongoingOuting = (typeof cpGetOutings === "function" ? cpGetOutings(r) : []).find(o => !o.end_date);
    if (ongoingOuting) {
      alert("既に外泊中です。");
      renderResidentDetail();
      return;
    }
    renderResidentDetail();
    openOutingModal(r.id, null);
    return;
  }

  // 外泊中から在所へ戻す
  if (r.status === "外泊中" && status === "在所") {
    const ongoing = (typeof cpGetOutings === "function" ? cpGetOutings(r) : []).find(o => !o.end_date);
    if (ongoing) {
      renderResidentDetail();
      openOutingReturnModal(r.id, ongoing.id);
      return;
    }
    // 外泊レコードがない場合は出かけた日の登録へ
    renderResidentDetail();
    openOutingModal(r.id, null);
    return;
  }

  // 外泊中から入院中への直接変更
  if (r.status === "外泊中" && status === "入院中") {
    alert("外泊中の方は入院に変更できません。先に帰所（在所へ戻る）手続きを行ってください。");
    renderResidentDetail();
    return;
  }

  r.status = status;
  db.save();
  renderResidentsStrip();
  initGlobalTimeSync();
  renderResidentDetail();
  if (gState.activeCareTab === "vitals") renderVitalsTable();
  if (gState.activeCareTab === "meal") renderMealsTable();
  alert(`在籍ステータスを「${status}」に更新しました`);
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
 <strong>${escapeHtml(r.room_no)}号室 ${escapeHtml(r.name)} 様</strong> (${escapeHtml((typeof cpCurrentCareLevel === "function" ? cpCurrentCareLevel(r) : "") || "-")})
 <span style="margin-left:12px;">満了日: ${escapeHtml(r.care_expiry_date)}</span>
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
 gState.care_plans = db.data.care_plans || []; // [Antigravity実装 2026-10-19]
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
let isVaultPhotoSubmitting = false;

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

	if (typeof cpCheckIsHost === "function") {
		cpCheckIsHost().then(() => {
			renderPhotoGrid();
		});
	}
}

function switchPhotoCategory(cat) {
	currentPhotoCategory = cat;
	const btnDoc = document.getElementById("tabBtnDocPhotos");
	const btnPersonal = document.getElementById("tabBtnPersonalPhotos");
	const allResDocs = (db.data.photos || []).filter(p => !p.voided && p.resident_id === gState.selectedResidentId && p.category === 'documents');
	const allResPersonal = (db.data.photos || []).filter(p => !p.voided && p.resident_id === gState.selectedResidentId && p.category === 'personal');
	if (btnDoc && btnPersonal) {
		btnDoc.textContent = `重要書類・同意書 (${allResDocs.length}件)`;
		btnPersonal.textContent = `個人写真 (${allResPersonal.length}件)`;
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

	const isHost = typeof window !== "undefined" && !!window.gIsHostMachine;

	const photos = (db.data.photos || []).filter(p => 
		!p.voided && p.resident_id === gState.selectedResidentId && p.category === currentPhotoCategory
	);

	const btnDoc = document.getElementById("tabBtnDocPhotos");
	const btnPersonal = document.getElementById("tabBtnPersonalPhotos");
	const allResDocs = (db.data.photos || []).filter(p => !p.voided && p.resident_id === gState.selectedResidentId && p.category === 'documents');
	const allResPersonal = (db.data.photos || []).filter(p => !p.voided && p.resident_id === gState.selectedResidentId && p.category === 'personal');
	if (btnDoc) btnDoc.textContent = `重要書類・同意書 (${allResDocs.length}件)`;
	if (btnPersonal) btnPersonal.textContent = `個人写真 (${allResPersonal.length}件)`;

	if (photos.length === 0) {
		const isDoc = currentPhotoCategory === 'documents';
		grid.innerHTML = `
			<div style="grid-column: 1 / -1; text-align:center; padding:36px 12px; color:var(--ink-3); background:var(--ground); border-radius:8px; border:1px dashed var(--line);">
				<div style="font-weight:bold; font-size:14px; margin-bottom:4px; color:var(--ink);">
					${isDoc ? '重要書類・同意書はまだありません' : '個人写真はまだありません'}
				</div>
				<div style="font-size:12px; color:var(--ink-2);">
					右上の「写真・書類の追加」から撮影・アップロードしてください。
				</div>
			</div>
		`;
		return;
	}

	photos.forEach(p => {
		const card = document.createElement("div");
		card.style.cssText = "background:var(--surface); border:1px solid var(--line); border-radius:8px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.06); display:flex; flex-direction:column; transition:transform 0.15s, box-shadow 0.15s;";
		card.onmouseenter = () => { card.style.transform = "translateY(-2px)"; card.style.boxShadow = "0 4px 10px rgba(0,0,0,0.12)"; };
		card.onmouseleave = () => { card.style.transform = "none"; card.style.boxShadow = "0 1px 3px rgba(0,0,0,0.06)"; };

		if (isHost) {
			// 親機: 写真を表示し、拡大可能（過去の data: URL も互換表示）
			const photoSrc = p.filename ? `/api/vault-photo?type=${encodeURIComponent(p.category)}&file=${encodeURIComponent(p.filename)}` : (p.url || "");
			card.innerHTML = `
				<div style="position:relative; width:100%; height:130px; background:#1c2622; cursor:pointer; overflow:hidden; display:flex; align-items:center; justify-content:center;" data-u="${escapeHtml(photoSrc)}" data-t="${escapeHtml(p.title || '')}" onclick="openLightbox(this.dataset.u, this.dataset.t)">
					<img src="${escapeHtml(photoSrc)}" alt="${escapeHtml(p.title || '写真')}" style="width:100%; height:100%; object-fit:cover;" onerror="this.onerror=null; this.src=''; const s=document.createElement('span'); s.style.color='var(--ink-3)'; s.style.fontSize='12px'; s.textContent='画像読込エラー'; this.parentElement.appendChild(s); this.remove();">
					<div style="position:absolute; bottom:4px; right:4px; background:rgba(0,0,0,0.6); color:white; font-size:10px; padding:2px 6px; border-radius:4px;">拡大</div>
				</div>
				<div style="padding:10px; flex:1; display:flex; flex-direction:column; justify-content:space-between;">
					<div>
						<div style="font-weight:bold; font-size:13px; color:var(--ink); margin-bottom:4px; line-height:1.3; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;" title="${escapeHtml(p.title || '')}">
							${escapeHtml(p.title || "名称未設定")}
						</div>
						<div style="font-size:11px; color:var(--ink-2);">${escapeHtml(p.uploaded_at || "-")}</div>
						<div style="font-size:11px; color:var(--ink-2);">担当: ${escapeHtml(p.uploader || "-")}</div>
					</div>
					<div style="margin-top:8px; display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--line-2); padding-top:6px;">
						<button class="btn btn-secondary" style="font-size:11px; padding:3px 8px;" data-u="${escapeHtml(photoSrc)}" data-t="${escapeHtml(p.title || '')}" onclick="openLightbox(this.dataset.u, this.dataset.t)">拡大表示</button>
						<button class="btn" style="background:var(--alert-tint); color:var(--alert); border:1px solid var(--alert); font-size:11px; padding:3px 8px; border-radius:4px; cursor:pointer;" onclick="deletePhoto(${p.id})">取消</button>
					</div>
				</div>
			`;
		} else {
			// 親機以外: 写真は出さず、題名・日時・登録者と「写真は親機で確認できます」のみ
			card.innerHTML = `
				<div style="padding:16px 10px; background:var(--ground); color:var(--ink-2); font-size:12px; text-align:center; border-bottom:1px solid var(--line);">
					写真は親機で確認できます
				</div>
				<div style="padding:10px; flex:1; display:flex; flex-direction:column; justify-content:space-between;">
					<div>
						<div style="font-weight:bold; font-size:13px; color:var(--ink); margin-bottom:4px; line-height:1.3; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;" title="${escapeHtml(p.title || '')}">
							${escapeHtml(p.title || "名称未設定")}
						</div>
						<div style="font-size:11px; color:var(--ink-2);">${escapeHtml(p.uploaded_at || "-")}</div>
						<div style="font-size:11px; color:var(--ink-2);">担当: ${escapeHtml(p.uploader || "-")}</div>
					</div>
					<div style="margin-top:8px; display:flex; justify-content:flex-end; align-items:center; border-top:1px solid var(--line-2); padding-top:6px;">
						<button class="btn" style="background:var(--alert-tint); color:var(--alert); border:1px solid var(--alert); font-size:11px; padding:3px 8px; border-radius:4px; cursor:pointer;" onclick="deletePhoto(${p.id})">取消</button>
					</div>
				</div>
			`;
		}
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


	const reader = new FileReader();
	reader.onload = function(e) {
		const rawDataUrl = e.target.result;
		const img = new Image();
		img.onload = function() {
			const maxDim = 1600;
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
	if (isVaultPhotoSubmitting) return;

	if (!currentPickedPhotoDataUrl) {
		alert("写真または書類の画像ファイルを選択してください。");
		return;
	}

	const staff = (typeof cpLoginStaffName === "function" ? cpLoginStaffName() : "").trim();
	if (!staff) {
		alert("ログイン情報を取得できませんでした。ログインしてからやり直してください。");
		return;
	}

	if (!gState.selectedResidentId) {
		alert("利用者を選択してください。");
		return;
	}

	const cat = (document.getElementById("photoNewCategory") && document.getElementById("photoNewCategory").value) || currentPhotoCategory || 'documents';
	const title = (document.getElementById("photoNewTitle") && document.getElementById("photoNewTitle").value.trim()) || "";
	if (!title) {
		alert("題名を入れてください。");
		const titleInput = document.getElementById("photoNewTitle");
		if (titleInput) titleInput.focus();
		return;
	}

	isVaultPhotoSubmitting = true;

	cpApiFetch("/api/vault-photo-upload", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			photo_type: cat,
			data: currentPickedPhotoDataUrl
		})
	})
	.then(res => {
		if (!res.ok) {
			return res.json().then(j => Promise.reject(j), () => Promise.reject({ error: res.status }));
		}
		return res.json();
	})
	.then(resData => {
		if (!resData || !resData.filename) {
			throw new Error("アップロード結果が不正です。");
		}
		if (!Array.isArray(db.data.photos)) db.data.photos = [];

		const newPhoto = {
			id: Date.now(),
			resident_id: gState.selectedResidentId,
			category: cat,
			title: title,
			filename: resData.filename,
			uploaded_at: resData.uploaded_at || (typeof toLocalDateTimeStr === "function" ? toLocalDateTimeStr(new Date()) : new Date().toLocaleString()),
			uploader: staff,
			voided: false,
			void_reason: "",
			voided_by: "",
			voided_at: ""
		};

		db.data.photos.unshift(newPhoto);
		db.save();

		resetPhotoForm();
		const formArea = document.getElementById("addPhotoFormArea");
		if (formArea) formArea.style.display = "none";

		currentPhotoCategory = cat;
		switchPhotoCategory(cat);
		if (typeof renderResidentDetail === 'function') renderResidentDetail();

		alert((cat === "documents" ? "重要書類" : "写真") + "を登録・保存しました！");
	})
	.catch(err => {
		alert("写真の保存に失敗しました: " + ((err && (err.message || err.error)) || "通信エラー"));
	})
	.finally(() => {
		isVaultPhotoSubmitting = false;
	});
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
			alert("PCのエクスプローラーで保存フォルダを開きました。\nファイルを直接追加・確認できます。");
		} else {
			alert("フォルダ場所:\ncare_portal\\data\\photos\\vault\\" + currentPhotoCategory);
		}
	})
	.catch(() => {
		alert("フォルダ場所:\ncare_portal\\data\\photos\\vault\\" + currentPhotoCategory);
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
// [Antigravity追加 2026-10-21] 外泊の歴（r.outings）の管理・カルテ表示・帰所手続き
// ==========================================
function cpGetOutings(r) {
  if (!r || typeof r !== "object") return [];
  if (!Array.isArray(r.outings)) return [];
  return r.outings.filter(o => o && !o.voided);
}

function cpSyncResidentOutingFields(r) {
  if (!r) return;
  const list = cpGetOutings(r).slice().sort((a, b) => String(a.start_date || "").localeCompare(String(b.start_date || "")));
  const ongoing = list.find(o => !o.end_date);
  if (ongoing) {
    if (!cpIsDischarged(r) && r.status !== "入院中") r.status = "外泊中";
  } else {
    if (r.status === "外泊中" && list.length > 0) r.status = "在所";
  }
}

function cpOutingHistorySectionHtml(r) {
  if (!r) return "";
  const list = cpGetOutings(r).slice().sort((a, b) => String(b.start_date || "").localeCompare(String(a.start_date || "")));
  const ongoing = list.find(o => !o.end_date);
  const isStatusOuting = r.status === "外泊中";
  const missingStartDate = isStatusOuting && !ongoing;

  let summaryText = "";
  if (ongoing) {
    summaryText = `現在外泊中（${escapeHtml(ongoing.start_date)}〜 ・ ${escapeHtml(ongoing.destination || "行き先未登録")}）`;
  } else if (missingStartDate) {
    summaryText = `<span class="badge" style="background:var(--alert-tint); color:var(--alert); font-weight:bold;">外泊の始まりの日が未登録</span>`;
  } else if (list.length > 0) {
    summaryText = `過去 ${list.length}件`;
  } else {
    summaryText = "記録なし";
  }

  const rowsHtml = (list.length === 0 && !missingStartDate)
    ? `<div style="font-size:13px; color:var(--ink-3); padding:4px 0;">外泊の記録はありません。</div>`
    : (missingStartDate
      ? `<div style="padding:10px; background:var(--alert-tint); border:1px solid var(--alert); border-radius:6px; margin-bottom:8px; font-size:13px; color:var(--alert); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
           <div><strong>外泊の始まりの日が未登録です。</strong> 現在ステータスが「外泊中」ですが出かけた日の記録がありません。出かけた日と行き先を登録してください。</div>
           <button type="button" class="btn btn-primary" style="font-size:13px; padding:3px 10px;" onclick="event.preventDefault(); event.stopPropagation(); openOutingModal(${r.id}, null); return false;">出かけた日を登録する</button>
         </div>`
      : "") +
      (list.length > 0
        ? `<div class="cp-hosp-list">` + list.map(o => {
            const isOngoing = !o.end_date;
            const periodStr = `${escapeHtml(o.start_date || "未登録")} 〜 ${isOngoing ? "<strong>外泊中（継続）</strong>" : escapeHtml(o.end_date)}`;
            const histCount = (o.edit_history || []).length;
            return `<div class="cp-hosp-item ${isOngoing ? "is-ongoing" : ""}">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:6px;">
                <div>
                  <div style="font-size:14px;">
                    <span class="badge" style="background:${isOngoing ? "var(--caution)" : "var(--pine-dark)"}; color:#fff; font-size:13px; padding:2px 8px; margin-right:6px;">${isOngoing ? "外泊中" : "帰所済"}</span>
                    <span>期間: ${periodStr}</span>
                  </div>
                  <div style="font-size:13px; margin-top:4px; color:var(--ink);">
                    <strong>行き先:</strong> ${escapeHtml(o.destination || "未登録")}
                    ${o.reason ? ` / <strong>理由:</strong> ${escapeHtml(o.reason)}` : ""}
                  </div>
                  ${(o.created_by || histCount) ? `<div style="font-size:12px; color:var(--ink-3); margin-top:2px;">${o.created_by ? "記録: " + escapeHtml(o.created_by) + (o.created_at ? ` (${escapeHtml(o.created_at)})` : "") : ""}${o.returned_by ? " / 帰所登録: " + escapeHtml(o.returned_by) + (o.returned_at ? ` (${escapeHtml(o.returned_at)})` : "") : ""}${histCount ? ` / 訂正 ${histCount}回` : ""}</div>` : ""}
                  ${histCount > 0 ? `
                    <div style="font-size:11px; color:var(--ink-3); margin-top:4px; padding-left:8px; border-left:2px solid var(--line-2);">
                      ${o.edit_history.map(h => `<div>${escapeHtml(h.at || "")} ${escapeHtml(h.by || "")}: 理由[${escapeHtml(h.reason || "")}] ${escapeHtml(h.detail || "")}</div>`).join("")}
                    </div>
                  ` : ""}
                </div>
                <div style="display:flex; gap:6px; flex-wrap:wrap;">
                  ${isOngoing && !cpIsDischarged(r) ? `<button type="button" class="btn btn-primary" style="font-size:13px; padding:3px 10px;" onclick="event.preventDefault(); event.stopPropagation(); openOutingReturnModal(${r.id}, ${o.id}); return false;">帰所（在所へ戻る）</button>` : ""}
                  <button type="button" class="btn btn-secondary" style="font-size:13px; padding:3px 10px;" onclick="event.preventDefault(); event.stopPropagation(); openOutingModal(${r.id}, ${o.id}); return false;">内容・期間を直す</button>
                </div>
              </div>
            </div>`;
          }).join("") + `</div>`
        : "");

  return `<details class="care-accordion" ${ongoing || missingStartDate || list.length ? "open" : ""} style="margin-bottom:10px; border:1px solid var(--line); border-radius:8px; background:var(--surface); overflow:hidden;">
    <summary style="padding:10px 14px; background:var(--ground); font-weight:bold; cursor:pointer; font-size:13px; color:var(--pine-dark); border-bottom:1px solid var(--line); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
      <span>外泊の歴（期間の一覧） <span style="font-weight:normal; color:var(--ink-2); margin-left:6px;">${summaryText}</span></span>
      <div style="display:flex; align-items:center; gap:6px;">
        ${!ongoing && !cpIsDischarged(r) && r.status !== "入院中" ? `<button type="button" class="btn btn-secondary" style="padding:3px 10px; font-size:13px;" onclick="event.preventDefault(); event.stopPropagation(); openOutingModal(${r.id}, null); return false;">+ 外泊の登録</button>` : ""}
        <span style="font-size:13px; color:var(--ink-3);">(開閉)</span>
      </div>
    </summary>
    <div style="padding:12px;">
      ${rowsHtml}
    </div>
  </details>`;
}

function openOutingModal(resId, outingId) {
  const r = (gState.residents || []).find(x => Number(x.id) === Number(resId || gState.selectedResidentId));
  if (!r) return;
  if (cpIsDischarged(r) && !outingId) {
    alert("退所者に新しい外泊は登録できません。");
    return;
  }
  if (r.status === "入院中" && !outingId) {
    alert("入院中の方は外泊を登録できません。先に退院手続きを行ってください。");
    return;
  }

  const list = cpGetOutings(r);
  const editing = (outingId !== null && outingId !== undefined && outingId !== "")
    ? list.find(o => Number(o.id) === Number(outingId))
    : null;

  if (!editing) {
    const ongoing = list.find(o => !o.end_date);
    if (ongoing) {
      alert("既に外泊中の記録があります。新しい外泊を登録する前に帰所登録を行ってください。");
      renderResidentDetail();
      return;
    }
  }

  document.getElementById("outingResidentId").value = String(r.id);
  document.getElementById("outingRecordId").value = editing ? String(editing.id) : "";
  const titleEl = document.getElementById("outingModalTitle");
  if (titleEl) titleEl.textContent = editing ? `外泊の期間・内容の訂正（${r.name} 様）` : `外泊の登録（${r.name} 様）`;

  const today = toLocalDateStr(new Date());
  document.getElementById("outingStartDate").value = editing ? (editing.start_date || "") : today;
  document.getElementById("outingDestination").value = editing ? (editing.destination || "") : "";
  document.getElementById("outingReason").value = editing ? (editing.reason || "") : "";

  const endWrap = document.getElementById("outingEndDateWrap");
  const endEl = document.getElementById("outingEndDate");
  if (endWrap) endWrap.style.display = editing ? "block" : "none";
  if (endEl) endEl.value = editing ? (editing.end_date || "") : "";

  const reasonWrap = document.getElementById("outingEditReasonWrap");
  const reasonEl = document.getElementById("outingEditReason");
  if (reasonWrap) reasonWrap.style.display = editing ? "block" : "none";
  if (reasonEl) reasonEl.value = "";

  openModal("outingModal");
}

function submitOutingModal() {
  const resId = Number((document.getElementById("outingResidentId") || {}).value);
  const recIdRaw = ((document.getElementById("outingRecordId") || {}).value || "").trim();
  const editingId = recIdRaw ? Number(recIdRaw) : null;
  const r = (gState.residents || []).find(x => Number(x.id) === resId);
  if (!r) return;

  const startDate = ((document.getElementById("outingStartDate") || {}).value || "").trim();
  const endDate = editingId !== null ? ((document.getElementById("outingEndDate") || {}).value || "").trim() : "";
  const destination = ((document.getElementById("outingDestination") || {}).value || "").trim();
  const reason = ((document.getElementById("outingReason") || {}).value || "").trim();
  const editReason = ((document.getElementById("outingEditReason") || {}).value || "").trim();
  const today = toLocalDateStr(new Date());

  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    alert("出かけた日を入力してください。");
    return;
  }
  if (startDate > today) {
    alert("出かけた日に未来の日付は指定できません。");
    return;
  }
  if (r.admission_date && startDate < r.admission_date) {
    alert(`出かけた日が施設の入居日（${r.admission_date}）より前になっています。`);
    return;
  }
  if (endDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      alert("戻った日を正しい日付（YYYY-MM-DD）で入力してください。");
      return;
    }
    if (endDate > today) {
      alert("戻った日に未来の日付は指定できません。");
      return;
    }
    if (endDate < startDate) {
      alert("戻った日は出かけた日より前にできません。");
      return;
    }
  }
  if (!destination) {
    alert("行き先を入力してください。");
    return;
  }

  if (editingId !== null && !editReason) {
    alert("訂正理由を入力してください（必須です）。");
    return;
  }

  // 1. 他の外泊との重複チェック
  const curEnd = endDate || "9999-12-31";
  const otherOutings = (r.outings || []).filter(o => o && !o.voided && (editingId === null || Number(o.id) !== editingId));
  const outingOverlap = otherOutings.find(o => {
    const oEnd = o.end_date || "9999-12-31";
    return startDate <= oEnd && curEnd >= o.start_date;
  });
  if (outingOverlap) {
    alert(`他の外泊期間（${outingOverlap.start_date}〜${outingOverlap.end_date || "外泊中"}）と期間が重複しています。日付を確かめてください。`);
    return;
  }

  // 2. 入院期間との重複チェック
  const hospitalizations = (typeof cpGetHospitalizations === "function") ? cpGetHospitalizations(r) : (r.hospitalizations || []);
  const hospOverlap = hospitalizations.find(h => {
    if (!h || !h.admission_date) return false;
    const hEnd = h.discharge_date || "9999-12-31";
    return startDate <= hEnd && curEnd >= h.admission_date;
  });
  if (hospOverlap) {
    alert(`入院の期間（${hospOverlap.admission_date}〜${hospOverlap.discharge_date || "入院中"}）と外泊の期間が重複しています。重複する登録はできません。日付を確かめてください。`);
    return;
  }

  const who = cpLoginStaffName();
  const nowStr = toLocalDateTimeStr(new Date());
  if (!Array.isArray(r.outings)) r.outings = [];

  if (editingId !== null) {
    const target = r.outings.find(o => o && Number(o.id) === editingId);
    if (!target) return;
    const oldRec = Object.assign({}, target);
    if (!Array.isArray(target.edit_history)) target.edit_history = [];
    target.edit_history.push({
      at: nowStr,
      by: who,
      reason: editReason,
      detail: `出かけた日: ${oldRec.start_date}→${startDate}, 戻った日: ${oldRec.end_date || "継続"}→${endDate || "継続"}, 行き先: ${oldRec.destination}→${destination}`
    });
    target.start_date = startDate;
    target.end_date = endDate;
    target.destination = destination;
    target.reason = reason;
    target.updated_by = who;
    target.updated_at = nowStr;
  } else {
    let newId = Date.now();
    while (r.outings.some(o => o && Number(o.id) === newId)) newId++;
    r.outings.push({
      id: newId,
      resident_id: r.id,
      start_date: startDate,
      end_date: "",
      destination: destination,
      reason: reason,
      created_by: who,
      created_at: nowStr
    });
  }

  cpSyncResidentOutingFields(r);
  db.save();
  closeModal("outingModal");
  renderResidentsStrip();
  initGlobalTimeSync();
  renderResidentDetail();
  if (typeof renderOfficeKasanTab === "function" && gState.activeOfficeTab === "kasan") renderOfficeKasanTab();
  alert(editingId !== null ? "外泊の記録を訂正しました。" : "外泊を登録しステータスを「外泊中」に更新しました。");
}

function openOutingReturnModal(resId, outingId) {
  const r = (gState.residents || []).find(x => Number(x.id) === Number(resId || gState.selectedResidentId));
  if (!r) return;
  const list = cpGetOutings(r);
  const target = outingId ? list.find(o => Number(o.id) === Number(outingId)) : list.find(o => !o.end_date);
  if (!target) {
    alert("対象の外泊記録が見つかりません。");
    return;
  }

  document.getElementById("outingReturnResidentId").value = String(r.id);
  document.getElementById("outingReturnRecordId").value = String(target.id);
  const startDisp = document.getElementById("outingReturnStartDateDisp");
  if (startDisp) startDisp.textContent = target.start_date || "-";

  const today = toLocalDateStr(new Date());
  const returnInput = document.getElementById("outingReturnDate");
  if (returnInput) returnInput.value = (today >= (target.start_date || "")) ? today : (target.start_date || today);

  openModal("outingReturnModal");
}

function submitOutingReturnModal() {
  const resId = Number((document.getElementById("outingReturnResidentId") || {}).value);
  const recId = Number((document.getElementById("outingReturnRecordId") || {}).value);
  const r = (gState.residents || []).find(x => Number(x.id) === resId);
  if (!r) return;
  const target = (r.outings || []).find(o => o && Number(o.id) === recId);
  if (!target) return;

  const returnDate = ((document.getElementById("outingReturnDate") || {}).value || "").trim();
  const today = toLocalDateStr(new Date());

  if (!/^\d{4}-\d{2}-\d{2}$/.test(returnDate)) {
    alert("戻った日を入力してください。");
    return;
  }
  if (returnDate > today) {
    alert("戻った日に未来の日付は指定できません。");
    return;
  }
  if (target.start_date && returnDate < target.start_date) {
    alert(`戻った日が出かけた日（${target.start_date}）より前になっています。`);
    return;
  }

  // 他の外泊との重複チェック
  const otherOutings = (r.outings || []).filter(o => o && !o.voided && Number(o.id) !== Number(target.id));
  const outingOverlap = otherOutings.find(o => {
    const oEnd = o.end_date || "9999-12-31";
    return target.start_date <= oEnd && returnDate >= o.start_date;
  });
  if (outingOverlap) {
    alert(`他の外泊期間（${outingOverlap.start_date}〜${outingOverlap.end_date || "外泊中"}）と期間が重複しています。日付を確かめてください。`);
    return;
  }

  // 入院との重複チェック
  const hospitalizations = (typeof cpGetHospitalizations === "function") ? cpGetHospitalizations(r) : (r.hospitalizations || []);
  const hospOverlap = hospitalizations.find(h => {
    if (!h || !h.admission_date) return false;
    const hEnd = h.discharge_date || "9999-12-31";
    return target.start_date <= hEnd && returnDate >= h.admission_date;
  });
  if (hospOverlap) {
    alert(`入院の期間（${hospOverlap.admission_date}〜${hospOverlap.discharge_date || "入院中"}）と外泊の期間が重複しています。重複する登録はできません。日付を確かめてください。`);
    return;
  }

  const who = cpLoginStaffName();
  const nowStr = toLocalDateTimeStr(new Date());

  target.end_date = returnDate;
  target.returned_by = who;
  target.returned_at = nowStr;

  cpSyncResidentOutingFields(r);
  db.save();
  closeModal("outingReturnModal");
  renderResidentsStrip();
  initGlobalTimeSync();
  renderResidentDetail();
  if (typeof renderOfficeKasanTab === "function" && gState.activeOfficeTab === "kasan") renderOfficeKasanTab();
  alert(`帰所日（${returnDate}）を登録し、在所ステータスに戻しました。`);
}

window.cpGetOutings = cpGetOutings;
window.cpSyncResidentOutingFields = cpSyncResidentOutingFields;
window.cpOutingHistorySectionHtml = cpOutingHistorySectionHtml;
window.openOutingModal = openOutingModal;
window.submitOutingModal = submitOutingModal;
window.openOutingReturnModal = openOutingReturnModal;
window.submitOutingReturnModal = submitOutingReturnModal;
