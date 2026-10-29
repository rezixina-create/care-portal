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
 if (gState.activeCareTab === "careplan" && typeof renderCarePlanTab === "function") renderCarePlanTab(); // [Antigravity実装 2026-10-19]
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
 if (gState.activeCareTab === "careplan" && typeof renderCarePlanTab === "function") renderCarePlanTab(); // [Antigravity実装 2026-10-19]
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
 <button type="button" class="btn btn-secondary" style="padding:2px 6px; font-size:11px; color:#dc2626;" onclick="deleteBelonging(${b.id})">台帳から外す</button>
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
 <span class="room-badge" style="font-size:13px;">${escapeHtml(r.room_no)}号室</span>
 <h2 style="font-size:20px; font-weight:bold; margin-top:4px;">${escapeHtml(r.name)} 様</h2>
 <span style="font-size:13px; color:var(--text-muted);">${escapeHtml((typeof cpCareCertOn === "function" ? cpCareCertOn(r, toLocalDateStr(new Date())).level : "") || r.care_level || "未登録")} / 生年月日: ${r.birth_date || "-"} / 入居日: ${r.admission_date || "-"}</span>
 </div>
 <div style="text-align:right;">
 <div class="policy-stamp ${stampClass}" style="font-size:14px; padding:4px 10px;">［ ${escapeHtml(r.policy_stamp)} ］</div>
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
 <button type="button" class="btn btn-secondary" style="font-size:12px; padding:5px 12px; background:var(--surface); color:var(--pine-dark); border:1px solid var(--line); font-weight:bold;" onclick="event.preventDefault(); event.stopPropagation(); openCareSummaryModal(${r.id}); return false;">
					${(typeof cpRoleFlags === "function" && cpRoleFlags().caremanager) ? "介護サマリー (詳細・新規・変更)" : "介護サマリー (詳細確認)"}
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

 <!-- 1. 基本方針・ケアプラン目標・見守り注意・バイタルの注意の目安 (アコーディオン) -->
 ${cpCarePlanSectionHtml(r)}

 <!-- [Antigravity実装 2026-10-19] 入院の歴（期間の一覧） -->
 ${cpHospitalHistorySectionHtml(r)}

 <!-- [Antigravity追加 2026-10-21] 外泊の歴（期間の一覧） -->
 ${typeof cpOutingHistorySectionHtml === "function" ? cpOutingHistorySectionHtml(r) : ""}

 <!-- [Antigravity実装 2026-10-21] 認知症高齢者の日常生活自立度 -->
 ${typeof cpDementiaSectionHtml === "function" ? cpDementiaSectionHtml(r) : ""}

 <!-- [LIFE評価] 科学的介護推進体制加算 -->
 ${typeof cpLifeSectionHtml === "function" ? cpLifeSectionHtml(r) : ""}

 <!-- 2. 身体状況・病歴・食形態・口腔状態 (アコーディオン) -->
 <details class="care-accordion" open style="margin-bottom:10px; border:1px solid #dfe5e1; border-radius:8px; background:#fff; overflow:hidden;">
 <summary style="padding:10px 14px; background:#f6f8f6; font-weight:bold; cursor:pointer; font-size:13px; color:#173f33; border-bottom:1px solid #dfe5e1; display:flex; justify-content:space-between; align-items:center;">
 <span>身体状況・病歴 ＆ 食形態・口腔状態</span>
 <div style="display:flex; align-items:center; gap:8px;">
 <button type="button" class="btn btn-secondary" style="padding:2px 8px; font-size:13px;" onclick="event.preventDefault(); event.stopPropagation(); openBodyConditionModal(${r.id}, 'all'); return false;"> 変更</button>
 <span style="font-size:13px; color:var(--ink-3);">(開閉)</span>
 </div>
 </summary>
 <div style="padding:12px;">
 <div style="margin-bottom:10px;">
 <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
 <div style="font-size:13px; font-weight:bold; color:var(--text-muted);">病歴・既往歴 (タップで現場対応ガイド表示):</div>
 <button type="button" class="btn btn-secondary" style="padding:2px 8px; font-size:13px; color:var(--pine); border-color:var(--pine-light); background:var(--pine-tint-2);" onclick="event.preventDefault(); event.stopPropagation(); openBodyConditionModal(${r.id}, 'diseases'); return false;">病歴を変更</button>
 </div>
 <div>${diseaseTags || '<span style="font-size:13px; color:var(--text-muted);">特記事項なし</span>'}</div>
 </div>
 
 <!-- 身体状況・食形態情報カード -->
 <div style="background:var(--pine-tint-2); border:1px solid var(--line); border-radius:8px; padding:12px;">
 <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:13px; margin-bottom:10px;">
 <div><strong>身体・麻痺:</strong> ${escapeHtml(r.paralysis || "未登録")}</div>
 <div><strong>アレルギー:</strong> <span style="color:var(--alert); font-weight:bold;">${escapeHtml(r.allergies || "未登録")}</span></div>
 <div><strong>食形態:</strong> ${escapeHtml(r.diet_type || "未登録")}</div>
 <div><strong>口腔状態:</strong> ${escapeHtml(r.oral_state || "未登録")}</div>
 </div>
 <div style="background:var(--surface); border:1px solid var(--line); border-radius:6px; padding:8px 10px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
 <div style="font-size:13px; color:var(--ink); flex:1; min-width:200px;">
 <strong>皮膚処置・軟膏ピン:</strong> ${renderSchemaSummaryBadges(r.id)}
 </div>
 <button type="button" class="btn btn-secondary" style="padding:2px 8px; font-size:13px; background:var(--ground); color:var(--ink); border-color:var(--line); font-weight:bold; white-space:nowrap;" onclick="event.preventDefault(); event.stopPropagation(); openBodySchemaModal(${r.id}); return false;">
 シェーマ図を開く
 </button>
 </div>
 <div style="background:var(--surface); border:1px solid var(--line); border-radius:6px; padding:8px 10px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
 <div style="font-size:13px; color:var(--ink); flex:1; min-width:200px;">
 <strong>点眼処方指示:</strong> ${eyedropSummaryHtml}
 </div>
 <button type="button" class="btn btn-secondary" style="padding:2px 8px; font-size:13px; background:var(--pine-tint-2); color:var(--pine); border-color:var(--pine-light); font-weight:bold; white-space:nowrap;" onclick="event.preventDefault(); event.stopPropagation(); openEyedropOrderModal(${r.id}); return false;">
 点眼指示を管理（追加・変更・終了）
 </button>
 </div>
 <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px dashed var(--line); padding-top:8px;">
 <span style="font-size:13px; color:var(--ink-3);">※身体状況（麻痺）・食形態・口腔状態・アレルギーを変更できます</span>
 <button type="button" class="btn btn-secondary" style="padding:4px 12px; font-size:13px; background:var(--pine-tint-2); color:var(--pine-dark); border:1px solid var(--pine-light); font-weight:bold; display:inline-flex; align-items:center; gap:4px;" onclick="event.preventDefault(); event.stopPropagation(); openBodyConditionModal(${r.id}, 'all'); return false;">
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
 <span style="font-weight:bold; margin-left:6px; color:#0284c7;">${escapeHtml(r.next_clinic_date || '未定')}</span>
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
 <div><strong> 緊急連絡先 & 搬送・延命処置方針:</strong> <span style="font-weight:bold; color:var(--ink);">${escapeHtml(r.emergency_contact || "未登録")}</span></div>
 <div style="margin-top:6px;"><strong> 家族の要望 (ACP・看取り・面会・ケア希望):</strong> <span style="color:var(--ink-2);">${escapeHtml(r.family_wishes || "未登録")}</span></div>
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
 ${(typeof cpRoleFlags === "function" && cpRoleFlags().caremanager) ? `<button type="button" class="btn btn-secondary" style="padding:2px 8px; font-size:11px; background:var(--pine-tint); color:var(--pine-dark); border:1px solid var(--line);" onclick="event.preventDefault(); event.stopPropagation(); openCareSummaryModal(${r.id}); return false;">サマリー編集・新規</button>` : `<button type="button" class="btn btn-secondary" style="padding:2px 8px; font-size:11px; background:var(--surface); color:var(--ink); border:1px solid var(--line);" onclick="event.preventDefault(); event.stopPropagation(); openCareSummaryModal(${r.id}); return false;">サマリー詳細確認</button>`}
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
 if (gState.recordPane === "log" && typeof renderPersonalVitalChart === "function") {
  renderPersonalVitalChart();
 }
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

// [Claude追加] 用語の説明カードは、カードの外を押すか Esc でも閉じる（×を押さないと閉じられなかった）
document.addEventListener("click", (ev) => {
 const card = document.getElementById("termExplainCard");
 if (!card || card.style.display === "none" || card.style.display === "") return;
 if (card.contains(ev.target)) return;
 if (ev.target.closest && ev.target.closest(".term-link")) return; // 別の用語を押したときは、その用語に切り替える
 closeTermExplanation();
});
document.addEventListener("keydown", (ev) => {
 if (ev.key === "Escape") closeTermExplanation();
});

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

