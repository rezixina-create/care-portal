// ============================================================
// 施設・フロア 業務日誌 (一日の記録・日課スケジュール ＆ 特変日報)
// ============================================================
// [Claude修正 2026-10-22] 業務日誌に出すのは「特記」だけ（特変・申し送り・連絡・家族への連絡・フロア全体の記録）。
// 一人ひとりの介護記録（食事・巡視・体位変換など）は、利用者ごとの記録の画面で見る
// あなた「利用者ごとの表はいらない。それは業務ではなく個人記録を見てくださいだね。特記は残す感じでもいいかもね」
const CP_JOURNAL_CATEGORIES = ["特変", "申し送り", "連絡", "家族"];
function cpJournalRecordsOn(dateStr) {
 return (db.data.care_records || [])
  .filter(r => {
   if (r.voided) return false;
   const timeStr = r.recorded_at || r.record_time || "";
   if (!timeStr.startsWith(dateStr)) return false;
   return Number(r.resident_id) === 0 || CP_JOURNAL_CATEGORIES.includes(r.category);
  })
  .sort((a, b) => (a.recorded_at || a.record_time || "").localeCompare(b.recorded_at || b.record_time || ""));
}

function renderDailyJournal() {
 const titleEl = document.getElementById("dailyJournalTitle");
 if (titleEl) {
 titleEl.textContent = ` 【${gState.selectedDate}】施設・フロア 業務日誌 (一日の記録)`;
 }

 // 1. サマリーバー（勤務体制 ＆ 利用者概況 ＆ 記録件数）
 const summaryBar = document.getElementById("dailyJournalSummaryBar");
 if (summaryBar) {
 const presentCount = cpResidentsOn(gState.selectedDate).filter(r => cpStatusOn(r, gState.selectedDate) === "在所").length;
 const hospitalCount = cpResidentsOn(gState.selectedDate).filter(r => cpStatusOn(r, gState.selectedDate) === "入院中").length;

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
 const allRecords = cpJournalRecordsOn(gState.selectedDate);

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

}

// 施設・フロア業務日誌 (一日の記録) の印刷
function printDailyJournal() {
 const records = cpJournalRecordsOn(gState.selectedDate);

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



 <!-- 一日の日課・業務スケジュール実施記録 (印刷欄) [Antigravity実装 2026-10-16] -->
 <h3 style="font-size:14px; margin:16px 0 6px 0; color:#173f33;">1. 一日の流れ（日課・業務の実施記録）</h3>
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

 <h3 style="font-size:14px; margin:14px 0 6px 0; color:#173f33;">2. 特記（特変・申し送り・連絡） (計 ${records.length} 件)</h3>
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


// 施設・フロア 一日の日課・業務スケジュール [Antigravity実装 2026-10-16]
function renderDailyScheduleTimeline() {
 const container = document.getElementById("dailyScheduleTimeline");
 if (!container) return;
 const targetDate = gState.selectedDate;


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
 staff_name: staff,
 recorded_by: (typeof cpLoginStaffName === "function" && cpLoginStaffName()) || "" // [Claude追加 2026-10-22] 入れた人はログインした本人
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
 // [Claude修正 2026-10-22] 記録者はログインした本人に固定（あなた「記録者はログイン本人に固定だね」）
 const staffInput = document.getElementById("djmStaff");
 const curStaff = (typeof cpLoginStaffName === "function" && cpLoginStaffName()) || (document.getElementById("currentStaff") ? document.getElementById("currentStaff").value : "");
 if (staffInput) {
 staffInput.value = curStaff;
 staffInput.readOnly = true;
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
 const staff = (typeof cpLoginStaffName === "function" && cpLoginStaffName()) || ((staffInput && staffInput.value.trim()) ? staffInput.value.trim() : "職員"); // [Claude修正 2026-10-22] ログインした本人

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

 const results = (db.data.care_records || []).filter(r => !r.voided).filter(r => {
 const res = gState.residents.find(x => x.id === r.resident_id);
 const resName = res ? res.name.toLowerCase() : "";
 const content = (r.content || "").toLowerCase();
 const cat = (r.category || "").toLowerCase();
 return content.includes(q) || cat.includes(q) || resName.includes(q);
 }).map(r => Object.assign({}, r));

 // [Antigravity実装 2026-10-19] 処方薬の一覧（飲む日の表記「週1回（月曜）」などを含む）や服薬・点眼記録も検索対象にする
 (db.data.resident_medications || []).forEach(rm => {
 if (!rm || rm.voided) return;
 const res = gState.residents.find(x => x.id === rm.resident_id);
 const resName = res ? res.name.toLowerCase() : "";
 const sched = typeof cpRxScheduleText === "function" ? cpRxScheduleText(rm) : "毎日";
 const timingsStr = (rm.timings || []).map(t => `${t.key}${t.count}${rm.unit || "錠"}`).join("・");
 const text = `【処方薬】${rm.name || ""} / 飲む日: ${sched} / 用法: ${timingsStr}${rm.effect ? " / 効能: " + rm.effect : ""}${rm.start_date ? " / 開始: " + rm.start_date : ""}${rm.status === "中止" ? " (中止: " + (rm.stop_reason || "") + ")" : ""}`;
 if (text.toLowerCase().includes(q) || resName.includes(q)) {
 results.push({
 resident_id: rm.resident_id,
 recorded_at: rm.start_date || rm.added_at || gState.selectedDate || "",
 category: "処方薬",
 content: text,
 staff_name: rm.added_by || "処方登録"
 });
 }
 });
 (db.data.meds || []).forEach(m => {
 if (!m || m.voided) return;
 const res = gState.residents.find(x => x.id === m.resident_id);
 const resName = res ? res.name.toLowerCase() : "";
 const tk = m.timing_key || m.slot || "服薬";
 let detail = m.bag || "";
 if (!detail && m.medicine_name) detail = `${m.eye ? "[" + m.eye + "] " : ""}${m.medicine_name}`;
 else if (!detail && typeof cpBagText === "function" && m.date && tk) detail = cpBagText(m.resident_id, tk, m.date);
 const text = `【${tk}】${m.status || ""}${detail ? " (" + detail + ")" : ""}${m.given_time ? " 服用時刻:" + m.given_time : ""}`;
 if (text.toLowerCase().includes(q) || resName.includes(q)) {
 results.push({
 resident_id: m.resident_id,
 recorded_at: `${m.date || ""} ${m.given_time || ""}`.trim(),
 category: "服薬・点眼",
 content: text,
 staff_name: m.staff_name || "未設定"
 });
 }
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
     const filledHtml = vList.map(x => `<div style="display:flex; align-items:center; gap:4px; flex-wrap:wrap; margin-top:2px;">${cpFilledBadgeHtml(cpFormatVitalBrief(x), x.staff_name, x.time || "", x.edit_history)}<button type="button" class="btn btn-secondary" style="font-size:11px; padding:1px 6px;" onclick="openPersonalVitalModal(${Number(x.id)})">訂正</button></div>`).join("");

   tr.innerHTML = `
     <td>${r.room_no}</td>
     <td>
       <strong>${r.name} 様</strong> ${cpStatusOn(r, gState.selectedDate) !== '在所' ? `(${cpStatusOn(r, gState.selectedDate)})` : ''}
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
   cpLockRowIfAway(tr, r, gState.selectedDate);
 });
}

function saveVital(resId) {
  { const _cpR = gState.residents.find(x => Number(x.id) === Number(resId)); if (_cpR && cpBlockIfAway(_cpR, gState.selectedDate)) return; } // [Claude修正 2026-10-28] 一日ずっと入院・外泊の日は記録しない
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
  if (cpBlockIfAway(targetRes, gState.selectedDate)) return; // [Claude修正 2026-10-28]
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

  // [Claude修正 2026-10-28] 記録済みの時間帯は、上の一覧と同じ記録をもう一度出さない。入力欄は止めて、直すときは「訂正」（理由を残す）
  if (statusEl) {
    statusEl.innerHTML = existing ? `<div class="cp-meal-done-note">${escapeHtml(type)}は記録済みです。直すときは右の「訂正」を押してください。</div>` : "";
  }
  if (btnEl) {
    btnEl.textContent = existing ? "訂正" : "記録";
    btnEl.onclick = existing ? (() => cpQuickEditMealRecord(Number(existing.id))) : (() => saveMeal(resId));
  }
  if (existing) {
    [mainEl, sideEl, waterEl].forEach(el => {
      if (!el) return;
      el.type = "text"; el.value = ""; el.placeholder = "記録済み"; el.disabled = true;
      el.style.background = "#f1f5f9"; el.style.color = "#64748b";
    });
    return;
  }
  if (waterEl) { waterEl.disabled = false; waterEl.type = "number"; waterEl.placeholder = "ml"; waterEl.style.background = ""; waterEl.style.color = ""; }

  if (type === "その他") {
    mainEl.type = "text"; mainEl.value = "ー"; mainEl.disabled = true;
    mainEl.style.background = "#f1f5f9"; mainEl.style.color = "#64748b";
    sideEl.type = "text"; sideEl.value = "ー"; sideEl.disabled = true;
    sideEl.style.background = "#f1f5f9"; sideEl.style.color = "#64748b";
  } else if (type === "おやつ") {
    mainEl.disabled = false; mainEl.type = "number"; mainEl.placeholder = "0-10";
    mainEl.min = "0"; mainEl.max = "10";
    mainEl.style.background = ""; mainEl.style.color = "";
    mainEl.value = (existing && existing.main_dish_ratio !== null && existing.main_dish_ratio !== undefined) ? existing.main_dish_ratio : "";
    sideEl.type = "text"; sideEl.value = "ー"; sideEl.disabled = true;
    sideEl.style.background = "#f1f5f9"; sideEl.style.color = "#64748b";
  } else {
    mainEl.disabled = false; mainEl.type = "number"; mainEl.placeholder = "0-10";
    mainEl.min = "0"; mainEl.max = "10";
    mainEl.style.background = ""; mainEl.style.color = "";
    mainEl.value = (existing && existing.main_dish_ratio !== null && existing.main_dish_ratio !== undefined) ? existing.main_dish_ratio : "";
    sideEl.disabled = false; sideEl.type = "number"; sideEl.placeholder = "0-10";
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
 cpLockRowIfAway(tr, r, gState.selectedDate);
 });
}

function saveMeal(resId) {
  { const _cpR = gState.residents.find(x => Number(x.id) === Number(resId)); if (_cpR && cpBlockIfAway(_cpR, gState.selectedDate)) return; } // [Claude修正 2026-10-28] 一日ずっと入院・外泊の日は記録しない
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
 cpLockRowIfAway(tr, r, gState.selectedDate);
 });
}

function saveBath(resId) {
  { const _cpR = gState.residents.find(x => Number(x.id) === Number(resId)); if (_cpR && cpBlockIfAway(_cpR, gState.selectedDate)) return; } // [Claude修正 2026-10-28] 一日ずっと入院・外泊の日は記録しない
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
 cpLockRowIfAway(tr, r, gState.selectedDate);
 });
 });
}

function toggleTopical(resId, pinId, slot) {
  { const _cpR = gState.residents.find(x => Number(x.id) === Number(resId)); if (_cpR && cpBlockIfAway(_cpR, gState.selectedDate)) return; } // [Claude修正 2026-10-28] 一日ずっと入院・外泊の日は記録しない
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
// [Antigravity実装 2026-10-26] 最新サマリーから整容の段階と介助のやり方を取得する共通関数
function cpGetResidentGroomingInfo(residentId) {
 const summaries = (typeof cpSummariesOfResident === "function") ? cpSummariesOfResident(residentId) : [];
 const latest = (summaries && summaries.length > 0) ? summaries[0] : null;
 if (!latest || !Array.isArray(latest.adl_items) || latest.adl_items.length === 0) {
  return "整容: サマリー未記入";
 }
 const item = latest.adl_items.find(x => x && (x.key === "grooming" || (x.action && x.action.includes("整容"))));
 if (!item || !item.level) {
  return "整容: サマリー未記入";
 }
 const level = String(item.level).trim();
 const method = String(item.method || "").trim();
 if (method) {
  return `整容: ${level}（${method}）`;
 }
 return `整容: ${level}`;
}
window.cpGetResidentGroomingInfo = cpGetResidentGroomingInfo;

function renderOralTable() {
 let tbody = document.querySelector("#oralTable tbody");
 if (!tbody) {
  const tbl = document.getElementById("oralTable");
  if (tbl) {
   tbody = document.createElement("tbody");
   tbl.appendChild(tbody);
  } else {
   return;
  }
 }
 tbody.innerHTML = "";
 const oralCares = (db.data.oral_cares || []).filter(o => !o.voided && o.date === gState.selectedDate);

 cpResidentsOn(gState.selectedDate).forEach(r => {
  const tr = document.createElement("tr");

  const getOralBtn = (slot) => {
   const done = oralCares.find(o => Number(o.resident_id) === Number(r.id) && ((typeof cpNormalizeOralTiming === "function") ? cpNormalizeOralTiming(o.timing) : o.timing) === slot);
   if (done) {
    const staff = escapeHtml(done.staff_name || '済');
    const denturePart = (Number(done.denture_done) === 1) ? '・義歯' : '';
    return `<span style="display:inline-block; padding:4px 8px; font-size:13px; font-weight:bold; color:var(--pine-dark); background:var(--pine-tint); border-radius:4px; border:1px solid var(--pine-light);">済 (${staff}${denturePart})</span>`;
   }
   return `<button type="button" class="btn btn-secondary" style="padding:4px 8px; font-size:13px;" onclick="saveOralCare(${r.id}, '${slot}')">${slot}</button>`;
  };

  const groomingText = cpGetResidentGroomingInfo(r.id);

  tr.innerHTML = `
   <td>${escapeHtml(r.room_no || '')}</td>
   <td>
    <div><strong>${escapeHtml(r.name || '')} 様</strong></div>
    <div style="margin-top:4px; font-size:13px; color:var(--ink-2); line-height:1.4;">
     <div>食形態: ${escapeHtml(r.diet_type || '未登録')}</div>
     <div>${escapeHtml(groomingText)}</div>
    </div>
   </td>
   <td style="font-size:13px; color:var(--ink);">
    <div style="font-weight:bold; color:var(--pine-dark);">${escapeHtml(r.oral_state || '未登録')}</div>
    <label style="display:inline-flex; align-items:center; gap:4px; margin-top:4px; font-size:13px; font-weight:normal; color:var(--ink-2); cursor:pointer;">
     <input type="checkbox" id="oralDenture_${r.id}" style="width:16px; height:16px; cursor:pointer;">
     入れ歯の洗浄もした
    </label>
   </td>
   <td>${getOralBtn("朝食後")}</td>
   <td>${getOralBtn("昼食後")}</td>
   <td>${getOralBtn("夕食後")}</td>
   <td><input type="text" id="oralNotes_${r.id}" class="form-control" style="font-size:13px;"></td>
  `;
  tbody.appendChild(tr);
 cpLockRowIfAway(tr, r, gState.selectedDate);
 });
}

function saveOralCare(resId, timing) {
  { const _cpR = gState.residents.find(x => Number(x.id) === Number(resId)); if (_cpR && cpBlockIfAway(_cpR, gState.selectedDate)) return; } // [Claude修正 2026-10-28] 一日ずっと入院・外泊の日は記録しない
 const r = (gState.residents || []).find(x => Number(x.id) === Number(resId));
 const normTiming = (typeof cpNormalizeOralTiming === "function") ? cpNormalizeOralTiming(timing) : timing;
 const exists = (db.data.oral_cares || []).some(o =>
  !o.voided &&
  o.date === gState.selectedDate &&
  Number(o.resident_id) === Number(resId) &&
  ((typeof cpNormalizeOralTiming === "function") ? cpNormalizeOralTiming(o.timing) : o.timing) === normTiming
 );
 if (exists) {
  alert(`この方の【${normTiming}】の口腔ケアはすでに完了記録があります。`);
  return;
 }

 const dentureChk = document.getElementById(`oralDenture_${resId}`);
 const dentureDone = (dentureChk && dentureChk.checked) ? 1 : 0;

 const notesEl = document.getElementById(`oralNotes_${resId}`);
 const notes = notesEl ? notesEl.value.trim() : "";
 const staff = (typeof cpLoginStaffName === "function" && cpLoginStaffName())
  ? cpLoginStaffName()
  : ((document.getElementById("currentStaff") && document.getElementById("currentStaff").value) || "未記録");

 if (!Array.isArray(db.data.oral_cares)) {
  db.data.oral_cares = [];
 }

 db.data.oral_cares.push({
  id: Date.now(),
  date: gState.selectedDate,
  timing: normTiming,
  resident_id: Number(resId),
  oral_done: 1,
  denture_done: dentureDone,
  notes: notes,
  staff_name: staff
 });
 db.save();
 renderOralTable();
 if (typeof loadDateRecords === "function") {
  loadDateRecords(gState.selectedDate);
 }
 const residentLabel = r ? `${r.name} 様` : "利用者様";
 const actionLabel = (dentureDone === 1) ? "口腔ケア・入れ歯の洗浄" : "口腔ケア";
 alert(`${residentLabel}の【${normTiming}】${actionLabel}を記録しました！`);
}

// 6. 服薬・点眼
function setMedTimingFilter(slot) {
 gState.medTimingFilter = slot;
 renderMedTable();
}

function renderMedTable() {
 // [Claude修正] 飲み薬は renderMedOral（時間帯ごとにまとめて記録）。この表は点眼だけ
 // [Antigravity実装 2026-10-19] 1人に複数の目薬指示がある場合も、それぞれの薬・左右・時間帯ごとに記録できるように対応
 if (typeof renderMedOral === "function") renderMedOral();
 const tbody = document.querySelector("#medTable tbody");
 if (!tbody) return;
 tbody.innerHTML = "";
 const meds = (db.data.meds || []).filter(m => !m.voided && m.date === gState.selectedDate); // [Claude修正] 取消済みは表示しない
 const eyedropOrders = db.data.eyedrop_orders || [];

 cpResidentsOn(gState.selectedDate).forEach(r => {
 const tr = document.createElement("tr");
 const activeOrders = eyedropOrders.filter(e => e && Number(e.resident_id) === Number(r.id) && e.status !== "終了" && e.eye !== "指示なし");
 let eyedropCellHtml = "";

 if (activeOrders.length === 0) {
 eyedropCellHtml = `
 <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
 <span style="color:var(--text-muted); font-size:13px;">指示なし</span>
 <button type="button" class="btn btn-secondary" style="font-size:13px; padding:3px 8px;" onclick="openEyedropOrderModal(${r.id}, null)">指示追加</button>
 </div>
 `;
 } else {
 const rowsHtml = activeOrders.map((order, idx) => {
 const eyeBadge = order.eye === "右のみ"
 ? `<span class="badge" style="background:var(--pine-dark); color:#ffffff; font-weight:bold; font-size:13px; padding:2px 6px;">[右のみ]</span>`
 : (order.eye === "左のみ"
 ? `<span class="badge" style="background:var(--pine); color:#ffffff; font-weight:bold; font-size:13px; padding:2px 6px;">[左のみ]</span>`
 : `<span class="badge" style="background:var(--ink-2); color:#ffffff; font-weight:bold; font-size:13px; padding:2px 6px;">[両眼]</span>`);

 const medTitle = cpDrugLink(order.medicine_name, "drug-link-inline drug-link-strong", "目薬");
 const doseText = order.dosage ? `<span style="font-size:13px; color:var(--text-muted); margin-left:4px;">(${escapeHtml(order.dosage)})</span>` : "";
 const isPaused = order.status === "休薬中" || order.status === "一時休止"; // [Claude修正] 選択肢は「休薬中」
 const targetSlots = order.timing_slots && order.timing_slots.length > 0 ? order.timing_slots : ["眠前"];

 const slotButtonsHtml = isPaused
 ? `<span style="font-size:13px; color:var(--caution); font-weight:bold;">休薬中</span>`
 : targetSlots.map(slot => {
 const done = meds.find(m => {
 if (Number(m.resident_id) !== Number(r.id)) return false;
 const slotMatch = (m.slot === `点眼(${slot})` || m.slot === `点眼_${slot}` || (m.slot === "点眼" && slot === "眠前"));
 if (!slotMatch) return false;
 if (m.order_id !== undefined && m.order_id !== null) return Number(m.order_id) === Number(order.id);
 if (m.medicine_name && order.medicine_name) return m.medicine_name === order.medicine_name && (!m.eye || m.eye === order.eye);
 return idx === 0;
 });
 if (done) {
 return `<button type="button" class="btn" style="background:var(--pine-tint); color:var(--pine); border:1px solid var(--pine-light); font-weight:bold; font-size:13px; padding:3px 8px; margin:2px;" onclick="toggleEyedrop(${r.id}, '${escapeHtml(slot)}', ${order.id})" title="クリックで取消">済 ${escapeHtml(slot)} (${escapeHtml(done.staff_name || '済')})</button>`;
 }
 return `<button type="button" class="btn btn-outline" style="border-color:var(--pine); color:var(--pine); font-size:13px; padding:3px 8px; margin:2px;" onclick="toggleEyedrop(${r.id}, '${escapeHtml(slot)}', ${order.id})">未 ${escapeHtml(slot)}</button>`;
 }).join("");

 return `
 <div class="cp-eo-check-row">
 <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:4px; margin-bottom:4px;">
 <div>${eyeBadge} ${medTitle}${doseText}</div>
 <div style="display:flex; gap:4px;">
 <button type="button" class="btn btn-secondary" style="font-size:13px; padding:2px 8px;" onclick="openEyedropOrderModal(${r.id}, ${order.id})" title="この点眼指示を変更">変更</button>
 <button type="button" class="btn btn-secondary" style="font-size:13px; padding:2px 8px;" onclick="endEyedropOrder(${order.id})" title="この点眼指示を終了">終了</button>
 </div>
 </div>
 <div style="display:flex; gap:4px; flex-wrap:wrap; align-items:center;">
 <span style="font-size:13px; color:var(--text-muted); margin-right:2px;">実施:</span>
 ${slotButtonsHtml}
 </div>
 </div>`;
 }).join("");

 eyedropCellHtml = `
 <div>
 ${rowsHtml}
 <div style="margin-top:6px; text-align:right;">
 <button type="button" class="btn btn-secondary" style="font-size:13px; padding:2px 8px;" onclick="openEyedropOrderModal(${r.id}, null)">+ 指示追加</button>
 </div>
 </div>
 `;
 }

 tr.innerHTML = `
 <td>${r.room_no}</td>
 <td><strong>${r.name} 様</strong></td>
 <td>${eyedropCellHtml}</td>
 `;
 tbody.appendChild(tr);
 cpLockRowIfAway(tr, r, gState.selectedDate);
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
 const norm = (v, f) => {
  if (f === "usage_type") return (v === undefined || v === "" || v === "resident") ? "resident" : v;
  if (f === "short_emergency_confirmed") return (!v) ? false : true;
  if (f === "short_plan_units") return (Array.isArray(v) && v.length === 0) ? null : (v === undefined || v === "" ? null : v);
  return (v === undefined || v === "" ? null : v);
 };
 const before = {};
 fields.forEach(f => { const x = norm(old[f], f); before[f] = (x !== null && typeof x === "object") ? JSON.parse(JSON.stringify(x)) : x; });
 if (old.staff_name !== undefined) before.staff_name = norm(old.staff_name, "staff_name");
 const key = (v, f) => { const x = norm(v, f); return (x !== null && typeof x === "object") ? JSON.stringify(x) : String(x); };
 const changed = fields.some(f => key(old[f], f) !== key(target[f], f));
 const hist = Array.isArray(old.edit_history) ? old.edit_history.slice() : [];
 if (changed) {
  const entry = { edited_at: toLocalDateTimeStr(new Date()), edited_by: cpLedgerStaff(), before: before };
  if (reason) entry.reason = reason;
  hist.push(entry);
 }
 if (hist.length) target.edit_history = hist;
}

function saveMed(resId, slot) {
  { const _cpR = gState.residents.find(x => Number(x.id) === Number(resId)); if (_cpR && cpBlockIfAway(_cpR, gState.selectedDate)) return; } // [Claude修正 2026-10-28] 一日ずっと入院・外泊の日は記録しない
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
  { const _cpR = gState.residents.find(x => Number(x.id) === Number(resId)); if (_cpR && cpBlockIfAway(_cpR, gState.selectedDate)) return; } // [Claude修正 2026-10-28] 一日ずっと入院・外泊の日は記録しない
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

// [Antigravity実装 2026-10-19] 複数の目薬がある場合も、それぞれの指示 (orderId) ごとに実施・取消を記録する
function toggleEyedrop(resId, slot, orderId) {
  { const _cpR = gState.residents.find(x => Number(x.id) === Number(resId)); if (_cpR && cpBlockIfAway(_cpR, gState.selectedDate)) return; } // [Claude修正 2026-10-28] 一日ずっと入院・外泊の日は記録しない
 const r = gState.residents.find(x => Number(x.id) === Number(resId));
 const staff = document.getElementById("currentStaff")?.value || "職員";
 const meds = db.data.meds || [];
 const targetSlotKey = `点眼(${slot})`;
 const altKey = `点眼_${slot}`;
 const activeOrders = (db.data.eyedrop_orders || []).filter(e => e && Number(e.resident_id) === Number(resId) && e.status !== "終了" && e.eye !== "指示なし");
 const order = orderId ? (db.data.eyedrop_orders || []).find(e => e && Number(e.id) === Number(orderId)) : activeOrders[0];

 const idx = meds.findIndex(m => {
 if (m.voided || m.date !== gState.selectedDate || Number(m.resident_id) !== Number(resId)) return false;
 const slotMatch = (m.slot === targetSlotKey || m.slot === altKey || (m.slot === "点眼" && slot === "眠前"));
 if (!slotMatch) return false;
 if (order) {
 if (m.order_id !== undefined && m.order_id !== null) return Number(m.order_id) === Number(order.id);
 if (m.medicine_name && order.medicine_name) return m.medicine_name === order.medicine_name && (!m.eye || m.eye === order.eye);
 return activeOrders.indexOf(order) <= 0;
 }
 return true;
 });

 if (idx >= 0) {
 const rec = meds[idx];
 const labelMed = rec.medicine_name ? `（${rec.eye ? rec.eye + "・" : ""}${rec.medicine_name}）` : "";
 if (cpVoidMedRecord(rec, `${r ? r.name : '利用者'}様の【${slot}】点眼実施記録${labelMed}`)) {
 db.save();
 renderMedTable();
 loadDateRecords(gState.selectedDate);
 }
 return;
 }

 if (!order) {
 alert("有効な点眼指示が見つかりません。");
 return;
 }
 if (order.status === "終了") {
 alert("終了した点眼指示には実施記録を付けられません。");
 return;
 }
 if (order.status === "休薬中" || order.status === "一時休止") {
 alert("休薬中の点眼指示には実施記録を付けられません。");
 return;
 }

 const eyeSide = order.eye || "両眼";
 const medName = order.medicine_name || "点眼薬";

 let newMedId = Date.now();
 while (meds.some(x => x && Number(x.id) === newMedId)) newMedId++;
 db.data.meds.push({
 id: newMedId,
 date: gState.selectedDate,
 slot: targetSlotKey,
 resident_id: Number(resId),
 order_id: order.id,
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

