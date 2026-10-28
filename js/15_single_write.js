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
  cpSwLockIfAway();
  if (typeof renderQuickTemplates === "function") renderQuickTemplates();
  updateRecordCharCount();
}

// [Claude修正 2026-10-28] 一日ずっと入院・外泊の日は、「様子・出来事」だけ書ける（病院からの連絡など）。ほかの項目は止める
function cpSwLockIfAway() {
  const res = gState.residents.find(r => r.id === gState.selectedResidentId);
  const away = res ? cpAwayAllDay(res, gState.selectedDate) : "";
  if (!away) return;
  Object.keys(CP_SW_SECTION_IDS).forEach(k => {
    if (k === "event") return;
    CP_SW_SECTION_IDS[k].forEach(id => { const el = document.getElementById(id); if (el) el.disabled = true; });
    document.querySelectorAll(`button[onclick="saveSingleWriteScreen('${k}')"]`).forEach(b => { b.disabled = true; });
  });
  const container = document.getElementById("singleWriteContainer");
  if (container && !container.querySelector(".cp-away-note-box")) {
    container.insertAdjacentHTML("afterbegin", `<div class="cp-away-note-box">${escapeHtml(res.name)} 様は、この日は${away}です。バイタル・食事・排泄・入浴・体位変換・看護の処置は入力できません（${away === "入院中" ? "入院した日・退院した日" : "出かけた日・戻った日"}は入力できます）。${away}のようす（病院からの連絡など）は「様子・出来事」に書けます。</div>`);
  }
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
    .slice().sort((a, b) => (a.recorded_at || "").localeCompare(b.recorded_at || "")); // [Claude修正 2026-10-23] 古い順（時間の流れ）
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
          <textarea id="swNurseContent" class="form-control" rows="2" style="width:100%;"></textarea>
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
          <label class="cp-sw-label">時間（空欄なら今の時刻）</label>
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
          <label class="cp-sw-label" style="margin:0;">あったこと・様子</label>
          <span style="font-size:12px; color:var(--text-muted);">文字数: <strong id="swEventCharCount" style="color:#1e5b47;">0</strong> 字</span>
        </div>
        <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center; margin-bottom:6px;">
          <span style="font-size:12px; color:#4a5852; font-weight:bold;">定型文:</span>
          <div class="templates-list" id="quickTemplatesList" style="margin:0; display:inline-flex; flex-wrap:wrap; gap:4px;"></div>
          <button type="button" class="btn btn-secondary" style="font-size:12px; padding:2px 8px; background:#f1f6f3; color:#1a4f3d; border:1px solid #c9e0d5;" onclick="openTemplateManageModal()">定型文の編集・追加</button>
        </div>
        <textarea id="swEventContent" class="form-control" rows="3" style="width:100%; resize:vertical; overflow-y:hidden; line-height:1.6;" oninput="updateRecordCharCount()"></textarea>
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
      <!-- [Antigravity追加] バイタル「いつもと違う」印の判定基準とSpO2測定目安の案内 -->
      <div style="background:var(--pine-tint-2); border:1px solid var(--line); border-radius:6px; padding:10px 12px; margin-bottom:10px; font-size:13px; line-height:1.5; color:var(--ink);">
        <div style="font-weight:bold; color:var(--pine); margin-bottom:4px;">【「いつもと違う」印の判定の目安】</div>
        <div style="margin-bottom:6px;">
          看護師がこの方の目安を決めているときは、その目安で『いつもと違う』の印が付きます。決めていないときは次の数字で付きます：血圧 上135以上 または 下85以上（日本高血圧学会 家庭血圧の基準）、SpO2 90%未満（日本呼吸器学会）。熱は平熱が人によって違うため、看護師の目安がないときは印を付けません。
        </div>
        <div style="font-size:13px; color:var(--ink-2); border-top:1px dashed var(--line); padding-top:4px;">
          <strong>SpO2 の測り方の目安（日本呼吸器学会「よくわかるパルスオキシメータ」より）:</strong> 健康な方は 96〜99%。ふだんの値より 3〜4%低下したときは看護師へ報告します。指が冷たい・動かしているときは正しく測れません。
        </div>
      </div>
      <div class="cp-sw-grid">
        <div>
          <label class="cp-sw-label">体温 (℃)</label>
          <input type="number" step="0.1" id="swVitalTemp" class="form-control" value="" onblur="formatTempInput(this)" oninput="formatTempInput(this)">
        </div>
        <div>
          <label class="cp-sw-label">血圧 上 (mmHg)</label>
          <input type="number" id="swVitalBpHigh" class="form-control" value="" placeholder="上">
        </div>
        <div>
          <label class="cp-sw-label">血圧 下 (mmHg)</label>
          <input type="number" id="swVitalBpLow" class="form-control" value="" placeholder="下">
        </div>
        <div>
          <label class="cp-sw-label">脈拍 (bpm)</label>
          <input type="number" id="swVitalPulse" class="form-control" value="">
        </div>
        <div>
          <label class="cp-sw-label">SpO2 (%)</label>
          <input type="number" id="swVitalSpo2" class="form-control" value="">
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
          <input type="number" id="swMealWater" class="form-control" step="50" value="">
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
          <input type="text" id="swBathNotes" class="form-control" value="">
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
          <input type="text" id="swTurnNote" class="form-control" value="">
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

  let keys = (only && CP_SW_SECTION_IDS[only]) ? [only] : Object.keys(CP_SW_SECTION_IDS);
  // [Claude修正 2026-10-28] 一日ずっと入院・外泊の日は「様子・出来事」だけ保存する
  const swAway = cpAwayAllDay(res, dateStr);
  if (swAway) {
    if (only && only !== "event") { alert(cpAwayMessage(res, swAway)); return; }
    keys = keys.filter(k => k === "event");
  }
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

