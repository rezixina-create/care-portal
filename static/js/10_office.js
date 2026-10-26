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
 if (tab === "backup" || tab === "staff_auth" || tab === "units" || tab === "kasan" || tab === "stats" || tab === "life" || tab === "invoice") {
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
 contracts: "tabOfficeContracts", kasan: "tabOfficeKasan", stats: "tabOfficeStats", life: "tabOfficeLife", invoice: "tabOfficeInvoice",
 incidents: "tabOfficeIncidents"
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
 } else if (tab === "kasan") {
 if (typeof renderOfficeKasanTab === "function") renderOfficeKasanTab();
 } else if (tab === "stats") {
 if (typeof renderOfficeStatsTab === "function") renderOfficeStatsTab();
 } else if (tab === "life") {
 if (typeof renderOfficeLifeTab === "function") renderOfficeLifeTab();
 } else if (tab === "invoice") {
		if (typeof renderOfficeInvoiceTab === "function") renderOfficeInvoiceTab();
	} else if (tab === "incidents") {
		renderOfficeIncidents();
	}
	}
}

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
  // [Claude修正 2026-10-22] 請求の設定は管理者・事務員だけが変えるので、見るのも管理者・事務員だけにする（ほかの職員には出さない）
  if (!canEdit) {
    container.innerHTML = "";
    container.style.display = "none";
    return;
  }
  container.style.display = "";
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
		catEl.value = item.category || "";
		qtyEl.value = item.quantity || "";
		unitEl.value = item.unit || "食";
		expEl.value = item.expiry_date || "";
		placeEl.value = item.storage_place || "";
		notesEl.value = item.notes || "";
	} else {
		idEl.value = "";
		nameEl.value = "";
		catEl.value = "";
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
	if (!cpRequireSelect("emgCat", "品目の分類")) return;
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
 // [Claude修正 2026-10-22] 運転者はログインした本人を入れておく（ほかの人が運転したときは書き換える）。新しい日付を上に
 const drv = document.getElementById("vehDriver");
 if (drv && !drv.value) drv.value = cpLoginStaffName();
 (db.data.vehicle_logs || []).slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || (Number(b.id) || 0) - (Number(a.id) || 0)).forEach(l => {
 const tr = document.createElement("tr");
 tr.innerHTML = `
 <td>${escapeHtml(l.date || "")}</td>
 <td><strong>${escapeHtml(l.vehicle_name || "")}</strong></td>
 <td>${escapeHtml(l.driver_name || "")}</td>
 <td>${escapeHtml(l.purpose || "")}</td>
 <td>${l.start_km} km</td>
 <td>${l.end_km} km</td>
 <td><strong style="color:#0284c7;">${l.distance_km} km</strong></td>
 <td>${l.key_returned ? ' 返却確認済' : '未返却'}</td>
 <td>${escapeHtml(l.notes || '-')}</td>
 `;
 tbody.appendChild(tr);
 });
}

function submitVehicleLog() {
 if (!cpRequireSelect("vehName", "車両")) return;
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
		typeEl.value = d.drill_type || "";
		partEl.value = d.participants_count || "";
		durEl.value = d.duration || "";
		scenEl.value = d.scenario || "";
		notesEl.value = d.notes || "";
		repEl.value = d.reported_to_fire_dept || "";
		supEl.value = d.supervisor || "施設長";
	} else {
		idEl.value = "";
		dateEl.value = toLocalDateStr(new Date());
		typeEl.value = "";
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
	if (!cpRequireSelect("fireType", "訓練の種類")) return;
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
const CP_COMMITTEE_STANDARD_ITEMS = [
	{
		key: "restraint_committee",
		name: "身体的拘束等の適正化のための委員会",
		category: "委員会",
		frequency_type: "interval",
		interval_months: 3,
		rule_desc: "3か月ごと",
		display_rule: "3月に1回以上",
		approx: false,
		penalty_subject: "身体拘束"
	},
	{
		key: "restraint_training",
		name: "身体拘束の研修",
		category: "研修",
		frequency_type: "annual",
		required_count: 2,
		rule_desc: "年度に2回",
		display_rule: "年2回以上（新規採用時も）",
		approx: false,
		penalty_subject: "身体拘束"
	},
	{
		key: "abuse_committee",
		name: "虐待防止検討委員会",
		category: "委員会",
		frequency_type: "annual",
		required_count: 1,
		rule_desc: "年度に1回",
		display_rule: "年1回以上（定期的に）",
		approx: false,
		penalty_subject: "虐待防止"
	},
	{
		key: "abuse_training",
		name: "虐待防止の研修",
		category: "研修",
		frequency_type: "annual",
		required_count: 2,
		rule_desc: "年度に2回",
		display_rule: "年2回以上",
		approx: false,
		penalty_subject: "虐待防止"
	},
	{
		key: "infection_committee",
		name: "感染対策委員会",
		category: "委員会",
		frequency_type: "interval",
		interval_months: 6,
		rule_desc: "6か月ごと",
		display_rule: "おおむね6月に1回以上",
		approx: true,
		penalty_subject: ""
	},
	{
		key: "infection_training",
		name: "感染対策の研修",
		category: "研修",
		frequency_type: "annual",
		required_count: 2,
		rule_desc: "年度に2回",
		display_rule: "年2回以上",
		approx: false,
		penalty_subject: ""
	},
	{
		key: "infection_drill",
		name: "感染対策の訓練",
		category: "訓練",
		frequency_type: "annual",
		required_count: 2,
		rule_desc: "年度に2回",
		display_rule: "年2回以上",
		approx: false,
		penalty_subject: ""
	},
	{
		key: "bcp_training",
		name: "業務継続計画（BCP）の研修",
		category: "研修",
		frequency_type: "annual",
		required_count: 2,
		rule_desc: "年度に2回",
		display_rule: "年2回以上",
		approx: false,
		penalty_subject: ""
	},
	{
		key: "bcp_drill",
		name: "業務継続計画（BCP）の訓練",
		category: "訓練",
		frequency_type: "annual",
		required_count: 2,
		rule_desc: "年度に2回",
		display_rule: "年2回以上",
		approx: false,
		penalty_subject: ""
	},
	{
		key: "promotion_meeting",
		name: "運営推進会議",
		category: "会議",
		frequency_type: "interval",
		interval_months: 2,
		rule_desc: "2か月ごと",
		display_rule: "おおむね2月に1回以上",
		approx: true,
		penalty_subject: ""
	}
];
window.CP_COMMITTEE_STANDARD_ITEMS = CP_COMMITTEE_STANDARD_ITEMS;

// 古い記録の項目判定（データを書き換えず表示・計算時のみ判定）
function cpResolveCommitteeItemKey(c) {
	if (!c) return "";
	if (c.item_key) return c.item_key;
	const name = String(c.committee_name || c.name || "").trim();
	if (name === "身体拘束適正化委員会") return "restraint_committee";
	if (name === "感染症対策委員会") return "infection_committee";
	if (name === "虐待防止委員会") return "abuse_committee";
	if (name === "虐待防止研修") return "abuse_training";
	return ""; // それ以外は未設定として数えない
}
window.cpResolveCommitteeItemKey = cpResolveCommitteeItemKey;

// 日付に月を加算（月末日あふれを安全に調整）
function cpAddMonthsToDateStr(dateStr, months) {
	if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
	const parts = dateStr.split("-").map(Number);
	const y = parts[0];
	const m = parts[1] - 1;
	const d = parts[2];
	const targetMonthIndex = m + months;
	const targetYear = y + Math.floor(targetMonthIndex / 12);
	const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
	const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
	const targetDay = Math.min(d, lastDay);
	const pad = n => String(n).padStart(2, "0");
	return `${targetYear}-${pad(targetMonth + 1)}-${pad(targetDay)}`;
}
window.cpAddMonthsToDateStr = cpAddMonthsToDateStr;

// 決まりの回数・実施状況の計算共通関数（表・お知らせで一元利用）
function cpGetCommitteeComplianceStatus(refDate) {
	const today = refDate ? new Date(refDate) : new Date();
	const todayStr = toLocalDateStr(today);

	// 今年度（4月1日〜翌年3月31日）
	const tYear = today.getFullYear();
	const tMonth = today.getMonth() + 1; // 1-12
	const fy = tMonth >= 4 ? tYear : tYear - 1;
	const fyStart = `${fy}-04-01`;
	const fyEnd = `${fy + 1}-03-31`;

	// 年度の残り月数（3月末まで）: 1月=3, 2月=2, 3月=1, 4月以降=15-tMonth
	const remainingMonths = tMonth >= 4 ? (15 - tMonth) : (4 - tMonth);

	const committees = (db && db.data && Array.isArray(db.data.committees)) ? db.data.committees : [];
	const validCommittees = committees.filter(c => !c.voided);

	return CP_COMMITTEE_STANDARD_ITEMS.map(item => {
		const matchingRecords = validCommittees.filter(c => cpResolveCommitteeItemKey(c) === item.key);
		matchingRecords.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || (Number(b.id) - Number(a.id)));

		const lastRecord = matchingRecords[0] || null;
		const lastDate = lastRecord ? String(lastRecord.date || "").slice(0, 10) : "";

		let status = "";
		let nextDeadline = "";
		let fyCount = 0;

		if (item.frequency_type === "interval") {
			if (!lastDate) {
				status = "記録なし";
			} else {
				nextDeadline = cpAddMonthsToDateStr(lastDate, item.interval_months);
				if (nextDeadline < todayStr) {
					status = "期限を過ぎている";
				} else {
					const diffDays = Math.round((new Date(nextDeadline) - new Date(todayStr)) / (24 * 3600 * 1000));
					if (diffDays <= 30) {
						status = "30日以内に期限";
					} else {
						status = "期限内";
					}
				}
			}
		} else if (item.frequency_type === "annual") {
			const fyRecords = matchingRecords.filter(c => {
				const d = String(c.date || "").slice(0, 10);
				return d >= fyStart && d <= fyEnd;
			});
			fyCount = fyRecords.length;

			if (fyCount >= item.required_count) {
				status = "足りている";
			} else if (fyCount === 0) {
				status = "記録なし";
			} else {
				if (remainingMonths <= 3) {
					status = `まだ足りない（残り${remainingMonths}か月）`;
				} else {
					status = "まだ足りない";
				}
			}
		}

		const isUnmet = (status === "期限を過ぎている" || status === "記録なし");

		return {
			item: item,
			key: item.key,
			name: item.name,
			category: item.category,
			display_rule: item.display_rule,
			rule_desc: item.rule_desc,
			frequency_type: item.frequency_type,
			approx: item.approx,
			penalty_subject: item.penalty_subject,
			last_date: lastDate,
			next_deadline: nextDeadline,
			fy: fy,
			fy_count: fyCount,
			required_count: item.required_count,
			status: status,
			is_unmet: isUnmet
		};
	});
}
window.cpGetCommitteeComplianceStatus = cpGetCommitteeComplianceStatus;

// 決まりの回数の状況テーブル描画
function renderCommitteeComplianceTable() {
	const tbody = document.getElementById("committeeComplianceTableBody");
	if (!tbody) return;
	tbody.innerHTML = "";

	const statuses = cpGetCommitteeComplianceStatus();
	statuses.forEach(s => {
		const tr = document.createElement("tr");

		let catBadgeColor = "var(--pine-dark)";
		let catBgColor = "var(--pine-tint-2)";
		if (s.category === "研修") {
			catBadgeColor = "var(--pine)";
			catBgColor = "var(--pine-tint)";
		} else if (s.category === "訓練") {
			catBadgeColor = "var(--caution)";
			catBgColor = "var(--caution-tint)";
		} else if (s.category === "会議") {
			catBadgeColor = "var(--ink-2)";
			catBgColor = "var(--ground)";
		}

		let statusStyle = "";
		if (s.status === "期限内" || s.status === "足りている") {
			statusStyle = "background:var(--pine-tint); color:var(--pine-dark); border:1px solid var(--pine);";
		} else if (s.status === "30日以内に期限" || s.status.startsWith("まだ足りない")) {
			statusStyle = "background:var(--caution-tint); color:var(--caution); border:1px solid var(--caution);";
		} else {
			statusStyle = "background:var(--alert-tint); color:var(--alert); border:1px solid var(--alert);";
		}

		let nextOrFyHtml = "";
		if (s.frequency_type === "interval") {
			if (s.next_deadline) {
				nextOrFyHtml = `<strong>${escapeHtml(s.next_deadline)}</strong>${s.approx ? '<span style="font-size:11.5px; color:var(--ink-3); margin-left:4px;">（目安）</span>' : ''}`;
			} else {
				nextOrFyHtml = `<span style="color:var(--ink-3);">-</span>`;
			}
		} else {
			nextOrFyHtml = `今年度 <strong>${s.fy_count}／${s.required_count}回</strong>`;
		}

		let remarkHtml = "-";
		if (s.penalty_subject === "身体拘束") {
			remarkHtml = `<span style="font-size:11.5px; color:var(--alert);">※ 足りないと減算の対象になることがあります（身体拘束廃止未実施減算）</span>`;
		} else if (s.penalty_subject === "虐待防止") {
			remarkHtml = `<span style="font-size:11.5px; color:var(--alert);">※ 足りないと減算の対象になることがあります（高齢者虐待防止措置未実施減算）</span>`;
		}

		tr.innerHTML = `
			<td style="text-align:center;"><span class="badge" style="background:${catBgColor}; color:${catBadgeColor}; font-weight:bold; font-size:11.5px;">${escapeHtml(s.category)}</span></td>
			<td><strong>${escapeHtml(s.name)}</strong></td>
			<td style="font-size:12.5px;">${escapeHtml(s.display_rule)}</td>
			<td>${s.last_date ? escapeHtml(s.last_date) : '<span style="color:var(--ink-3);">-</span>'}</td>
			<td>${nextOrFyHtml}</td>
			<td style="text-align:center;"><span class="badge" style="${statusStyle} font-weight:bold; font-size:12px; padding:3px 8px;">${escapeHtml(s.status)}</span></td>
			<td style="font-size:12px;">${remarkHtml}</td>
		`;
		tbody.appendChild(tr);
	});
}
window.renderCommitteeComplianceTable = renderCommitteeComplianceTable;

function renderOfficeCommittees() {
	renderCommitteeComplianceTable();

	const canEdit = typeof isCurrentStaffAdminOrClerk === "function" ? isCurrentStaffAdminOrClerk() : false;
	const btnOpen = document.getElementById("btnOpenCommitteeModal");
	if (btnOpen) btnOpen.style.display = canEdit ? "inline-block" : "none";

	const tbody = document.querySelector("#committeeTable tbody");
	if (!tbody) return;
	tbody.innerHTML = "";
	const list = cpLedgerOrder(db.data.committees || []);
	if (list.length === 0) {
		const tr = document.createElement("tr");
		tr.innerHTML = `<td colspan="7" style="text-align:center; color:var(--ink-3); padding:20px;">登録された委員会・研修記録はありません。${canEdit ? '「+ 委員会・研修登録」から追加できます。' : ''}</td>`;
		tbody.appendChild(tr);
		return;
	}

	list.forEach(c => {
		const tr = document.createElement("tr");
		const cat = c.category || "法定委員会";
		let catBadgeColor = "var(--pine-dark)";
		let catBgColor = "var(--pine-tint-2)";
		if (cat === "施設内研修") {
			catBadgeColor = "var(--pine)";
			catBgColor = "var(--pine-tint)";
		} else if (cat === "外部研修") {
			catBadgeColor = "var(--caution)";
			catBgColor = "var(--caution-tint)";
		} else if (cat === "その他業務項目") {
			catBadgeColor = "var(--ink-2)";
			catBgColor = "var(--ground)";
		}

		const itemKey = cpResolveCommitteeItemKey(c);
		const stdItem = CP_COMMITTEE_STANDARD_ITEMS.find(it => it.key === itemKey);
		let itemBadgeHtml = "";
		if (stdItem) {
			itemBadgeHtml = `<span class="badge" style="background:var(--pine-tint); color:var(--pine-dark); font-size:11px; margin-left:6px; font-weight:bold;">${escapeHtml(stdItem.name)}</span>`;
		} else if (c.item_key === "other") {
			itemBadgeHtml = `<span class="badge" style="background:var(--ground); color:var(--ink-2); font-size:11px; margin-left:6px;">その他</span>`;
		} else {
			itemBadgeHtml = `<span class="badge" style="background:var(--ground); color:var(--ink-3); font-size:11px; margin-left:6px;">項目：未設定</span>`;
		}

		const actionHtml = c.voided
			? `<div style="font-size:11px; color:var(--alert); font-weight:bold;">取消済</div><div style="font-size:10.5px; color:var(--ink-3); white-space:normal; max-width:180px;">${escapeHtml(c.voided_at || '')} ${escapeHtml(c.voided_by || '')}<br>理由: ${escapeHtml(c.void_reason || '-')}</div>` +
				(canEdit ? `<button type="button" class="btn btn-secondary" style="font-size:11px; padding:2px 7px; margin-top:3px;" onclick="cpRestoreLedgerRecord('committees', ${Number(c.id)})">取消を戻す</button>` : '')
			: (canEdit
					? `<button class="btn btn-secondary" style="padding:3px 8px; font-size:12px; color:var(--alert); border-color:var(--alert-tint);" onclick="deleteCommittee(${Number(c.id)})">取消</button>`
					: `<span style="font-size:12px; color:var(--ink-3);">-</span>`);

		tr.innerHTML = `
			<td>${escapeHtml(c.date || '-')}</td>
			<td><span class="badge" style="background:${catBgColor}; color:${catBadgeColor}; font-weight:bold;">${escapeHtml(cat)}</span></td>
			<td><strong>${escapeHtml(c.committee_name || c.name || '-')}</strong>${itemBadgeHtml}</td>
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
	if (!isCurrentStaffAdminOrClerk()) {
		alert("委員会・研修記録の登録は管理者または事務員のみ可能です。");
		return;
	}
	const today = toLocalDateStr(new Date());
	const dateInput = document.getElementById("comDate");
	if (dateInput) dateInput.value = today;
	const nameInput = document.getElementById("comName");
	if (nameInput) nameInput.value = "";
	const stdInput = document.getElementById("comStandardItem");
	if (stdInput) stdInput.value = "";
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
	if (catInput) catInput.value = "";

	const modal = document.getElementById("committeeModal");
	if (modal) modal.style.display = "flex";
}

function submitCommittee() {
	if (!isCurrentStaffAdminOrClerk()) {
		alert("委員会・研修記録の登録・保存は管理者または事務員のみ可能です。");
		return;
	}
	const date = document.getElementById("comDate")?.value;
	if (!cpRequireSelect("comCategory", "種別")) return;
	const category = document.getElementById("comCategory")?.value;
	if (!cpRequireSelect("comStandardItem", "決まりの項目")) return;
	const itemKey = document.getElementById("comStandardItem")?.value;
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
		item_key: itemKey,
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
	if (typeof checkGlobalAlerts === "function") checkGlobalAlerts();
	alert("法定委員会・研修記録を登録・保存しました！");
}

function deleteCommittee(id) {
	if (!isCurrentStaffAdminOrClerk()) {
		alert("委員会・研修記録の取消は管理者または事務員のみ可能です。");
		return;
	}
	cpVoidLedgerRecord("committees", id);
	if (typeof checkGlobalAlerts === "function") checkGlobalAlerts();
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
 <td>${escapeHtml(o.applicant || '未記録')}</td>
 <td>${escapeHtml(o.approver || '-')}</td>
 <td>${escapeHtml(o.received_by || '-')}</td>
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
 // [Claude修正] 承認した人はログインした本人（記録者の選ぶ欄ではなく）
 const staff = (typeof cpLoginStaffName === "function" && cpLoginStaffName()) || document.getElementById("currentStaff").value;
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
 const staff = (typeof cpLoginStaffName === "function" && cpLoginStaffName()) || document.getElementById("currentStaff").value; // [Claude修正] 受け取った人はログインした本人
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
 if (!cpRequireSelect("depType", "入出金の種類")) return;
 const type = document.getElementById("depType").value;
 if (!cpRequireSelect("depCategory", "内訳")) return;
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
		if (incType) incType.value = "";
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
			const pinBadge = pinsCount > 0 ? `<span class="badge" style="background:var(--alert-tint); color:var(--alert); font-size:13px; padding:2px 6px; margin-left:4px; font-weight:bold;">外傷ピン ${pinsCount}件</span>` : '';

			const tr = document.createElement("tr");
			tr.style.cursor = "pointer";
			tr.setAttribute("onclick", `openIncidentDetailModal(${inc.id})`);
			tr.innerHTML = `
				<td>${escapeHtml(timeDisplay)}</td>
				<td><span class="badge" style="background:var(--alert-tint); color:var(--alert); font-size:13px;">${escapeHtml(repType)}</span>${pinBadge}</td>
				<td><strong>${res ? escapeHtml(res.name) + ' 様' : escapeHtml(inc.resident_name || '')}</strong></td>
				<td>${escapeHtml(inc.place || '—')}</td>
				<td>${escapeHtml(situ)}</td>
				<td>${escapeHtml(prev)}</td>
				<td>${escapeHtml(supervisor)}</td>
				<td><span class="badge" style="background:var(--pine-tint); color:var(--pine); font-size:13px;">${escapeHtml(st)}</span></td>
				<td style="white-space:nowrap; text-align:center;" onclick="event.stopPropagation();">
					${cpLedgerActions('incidents', inc, 'editIncident').replace('訂正', '修正・追記')}
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
	document.getElementById("incType").value = "";
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
	document.getElementById("incType").value = inc.report_type || inc.level || "";
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
	if (!cpRequireSelect("incType", "報告の種類（ヒヤリハット・事故報告書）")) return;
	const type = document.getElementById("incType").value;
	const occurredAt = document.getElementById("incOccurredAt").value.replace("T", " ");
	const resSelectVal = document.getElementById("incResidentSelect").value;
	const resId = resSelectVal ? parseInt(resSelectVal, 10) : null;
	const place = document.getElementById("incPlace").value;
	const situation = document.getElementById("incSituation").value.trim();
	const cause = document.getElementById("incCause").value;
	const prevention = document.getElementById("incPrevention").value;
	const supervisor = document.getElementById("incSupervisor").value;
	// [Claude修正] 記録者はログインした本人（記録者の選ぶ欄や「担当職員」の代わりの言葉にしない）
	const staff = (typeof cpLoginStaffName === "function" ? cpLoginStaffName() : "") || document.getElementById("currentStaff")?.value || "";
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

function renderIncidentInjuryPins(options) {
	const opts = options || {};
	const overlay = opts.overlay || document.getElementById("incInjuryPinsOverlay");
	const tableContainer = opts.tableContainer || document.getElementById("incInjuryPinsTableContainer");
	const countTitle = opts.countTitle || document.getElementById("incInjuryPinsCountTitle");
	if (!overlay || !tableContainer) return;

	// [Claude修正] 詳細（見るだけ）のときは、保存されている報告書のピンに番号を書き足さないよう写しを使う
	const pins = opts.pins ? opts.pins.map(p => Object.assign({}, p)) : (gState.currentIncidentInjuryPins || []);
	pins.forEach((p, idx) => { p.pin_no = idx + 1; });

	if (countTitle) countTitle.textContent = `登録済の受傷ピン (${pins.length}件)`;

	const isReadOnly = !!opts.readOnly;
	const activeEditId = isReadOnly ? 0 : Number(document.getElementById("incInjuryEditPinId")?.value || 0);

	let pinsHtml = "";
	pins.forEach(p => {
		const isSelected = !isReadOnly && activeEditId === Number(p.id);
		const style = isSelected
			? "background:var(--surface); color:var(--alert); border:2px solid var(--alert); transform:scale(1.25); z-index:25; box-shadow:0 0 8px rgba(179,38,30,0.9);"
			: "background:var(--alert); color:var(--surface); border:2px solid var(--surface); z-index:10; box-shadow:0 2px 5px rgba(0,0,0,0.6);";
		const clickAttr = isReadOnly ? "" : `onclick="event.stopPropagation(); editIncidentInjuryPin(${p.id});"`;
		const cursorStyle = isReadOnly ? "cursor:default;" : "cursor:pointer;";

		pinsHtml += `
			<div style="position:absolute; left:${p.x_pct}%; top:${p.y_pct}%; width:26px; height:26px; margin-left:-13px; margin-top:-13px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:13px; ${cursorStyle} pointer-events:auto; user-select:none; transition:transform 0.15s ease; ${style}"
				title="[${p.pin_no}] ${escapeHtml(p.site_name || '')}: ${escapeHtml(p.injury_type || '')} (${escapeHtml(p.treatment || '-')})"
				${clickAttr}>
				${p.pin_no}
			</div>
		`;
	});
	overlay.innerHTML = pinsHtml;

	if (pins.length === 0) {
		tableContainer.innerHTML = `
			<div style="text-align:center; padding:20px 10px; color:var(--ink-3); font-size:13px;">
				${isReadOnly ? '外傷ピンの登録はありません。' : '登録されている受傷ピンはありません。<br>左の人体図（前面・背面）をクリックして位置を指定してください。'}
			</div>
		`;
		return;
	}

	let tableHtml = `
		<table class="table" style="width:100%; font-size:13px; margin-bottom:0; border-collapse:collapse;">
			<thead>
				<tr style="background:var(--alert-tint); color:var(--alert); border-bottom:2px solid var(--line);">
					<th style="padding:6px 8px; width:40px; text-align:center;">番号</th>
					<th style="padding:6px 8px; width:85px;">部位</th>
					<th style="padding:6px 8px;">外傷種類・処置</th>
					<th style="padding:6px 8px; width:80px;">程度</th>
					${isReadOnly ? '' : '<th style="padding:6px 8px; width:85px; text-align:center;">操作</th>'}
				</tr>
			</thead>
			<tbody>
	`;

	pins.forEach(p => {
		const isSelected = !isReadOnly && activeEditId === Number(p.id);
		tableHtml += `
			<tr style="border-bottom:1px solid var(--line-2); ${isSelected ? 'background:var(--alert-tint);' : ''}">
				<td style="padding:6px 8px; text-align:center;">
					<span style="display:inline-block; width:20px; height:20px; line-height:20px; border-radius:50%; background:var(--alert); color:var(--surface); font-weight:bold; font-size:13px; text-align:center;">
						${p.pin_no}
					</span>
				</td>
				<td style="padding:6px 8px;"><strong>${escapeHtml(p.site_name || '-')}</strong></td>
				<td style="padding:6px 8px;">
					<div style="font-weight:bold; color:var(--ink);">${escapeHtml(p.injury_type || '-')}</div>
					<div style="font-size:13px; color:var(--ink-2);">処置: ${escapeHtml(p.treatment || '-')}</div>
				</td>
				<td style="padding:6px 8px; font-size:13px; color:var(--ink-3);">${escapeHtml(p.severity || '-')}</td>
				${isReadOnly ? '' : `
				<td style="padding:6px 8px; text-align:center; white-space:nowrap;">
					<button type="button" class="btn btn-secondary" style="font-size:13px; padding:2px 6px;" onclick="editIncidentInjuryPin(${p.id})">編集</button>
					<button type="button" class="btn btn-danger" style="font-size:13px; padding:2px 6px; margin-left:3px;" onclick="deleteIncidentInjuryPin(${p.id})">削除</button>
				</td>
				`}
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
		typeEl.value = v.vaccine_name || "";
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
	if (!cpRequireSelect("vacType", "ワクチンの種類")) return;
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
 document.getElementById("belCat").value = b.category || "";
 document.getElementById("belItemName").value = b.item_name || "";
 document.getElementById("belQty").value = b.quantity || "";
 document.getElementById("belNotes").value = b.notes || "";
 } else {
 if (editIdEl) editIdEl.value = "";
 if (titleEl) titleEl.textContent = " 私物・持ち込み品の追加 (品名と個数)";
 if (submitBtn) submitBtn.textContent = "私物台帳へ追加";
 document.getElementById("belCat").value = "";
 document.getElementById("belItemName").value = "";
 document.getElementById("belQty").value = "";
 document.getElementById("belNotes").value = "";
 }
 modal.style.display = "flex";
}

function submitBelonging() {
 const editId = document.getElementById("belEditId")?.value;
 if (!cpRequireSelect("belCat", "分類")) return;
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
 document.getElementById("eqOwnership").value = "";
 document.getElementById("eqNotes").value = "";
 modal.style.display = "flex";
}

function submitEquipment() {
 const name = document.getElementById("eqName").value.trim();
 if (!cpRequireSelect("eqOwnership", "所有区分")) return;
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
 document.getElementById("fhPolicyStamp").value = r.policy_stamp || "";
 { const ps = document.getElementById("fhPolicyStamp"); if (ps) { ps.disabled = !cpCanEditPolicy(); ps.title = ps.disabled ? "基本方針を変えられるのは管理者・計画作成担当者・看護師です" : ""; } }
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
 const newStamp = cpCanEditPolicy() ? document.getElementById("fhPolicyStamp").value : (r.policy_stamp || "");
 if (cpCanEditPolicy() && !cpRequireSelect("fhPolicyStamp", "基本方針")) return;
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
// 短期利用（ショートステイ）入力補助
let gResidentPlanUnitsTemp = [];

function onResidentUsageTypeChange(val) {
 const box = document.getElementById("resShortStayFields");
 if (box) box.style.display = (val === "short") ? "block" : "none";
}

function onResidentShortPlanTypeChange(val) {
 const grp = document.getElementById("resShortPlanOfficeNoGroup");
 if (!grp) return;
 const req = grp.querySelector("span");
 if (req) req.style.display = (val === "1" || val === "3") ? "inline" : "none";
}

function renderResidentPlanUnitsList() {
 const el = document.getElementById("resShortPlanUnitsList");
 if (!el) return;
 if (!gResidentPlanUnitsTemp || gResidentPlanUnitsTemp.length === 0) {
  el.innerHTML = '<span style="color:var(--ink-3); font-size:13px;">（登録された計画単位数はありません）</span>';
  return;
 }
 gResidentPlanUnitsTemp.sort((a, b) => (a.ym || "").localeCompare(b.ym || ""));
 let html = '<div style="display:flex; flex-direction:column; gap:4px; margin-top:4px;">';
 gResidentPlanUnitsTemp.forEach((item, idx) => {
  const ymText = item.ym ? `${item.ym.slice(0, 4)}年${item.ym.slice(5, 7)}月` : "-";
  const uText = Number(item.units || 0).toLocaleString();
  html += `<div style="display:flex; align-items:center; justify-content:space-between; background:var(--surface); border:1px solid var(--line); border-radius:4px; padding:4px 8px; font-size:13px;">`
   + `<span><strong>${escapeHtml(ymText)}</strong>: ${escapeHtml(uText)} 単位</span>`
   + `<button type="button" class="btn btn-secondary" style="font-size:13px; padding:2px 6px; color:var(--alert);" onclick="deleteResidentPlanUnit(${idx})">削除</button>`
   + `</div>`;
 });
 html += '</div>';
 el.innerHTML = html;
}

function addResidentPlanUnitsRow() {
 const ymInput = document.getElementById("resShortPlanYm");
 const valInput = document.getElementById("resShortPlanUnitsVal");
 if (!ymInput || !valInput) return;
 const ym = ymInput.value.trim();
 const valStr = valInput.value.trim();
 if (!ym) {
  alert("計画単位数の対象月を選んでください。");
  return;
 }
 if (!valStr || isNaN(Number(valStr)) || Number(valStr) < 0) {
  alert("計画単位数を0以上の整数で入力してください。");
  return;
 }
 const units = parseInt(valStr, 10);
 if (!Array.isArray(gResidentPlanUnitsTemp)) gResidentPlanUnitsTemp = [];
 const existingIdx = gResidentPlanUnitsTemp.findIndex(x => x.ym === ym);
 if (existingIdx >= 0) {
  gResidentPlanUnitsTemp[existingIdx].units = units;
 } else {
  gResidentPlanUnitsTemp.push({ ym: ym, units: units });
 }
 valInput.value = "";
 renderResidentPlanUnitsList();
}

function deleteResidentPlanUnit(idx) {
 if (!Array.isArray(gResidentPlanUnitsTemp)) return;
 gResidentPlanUnitsTemp.splice(idx, 1);
 renderResidentPlanUnitsList();
}

function openAddResidentModal() {
 document.getElementById("resModalTitle").textContent = " 新規利用者の登録";
 document.getElementById("resEditId").value = "";
 if (document.getElementById("resUsageType")) document.getElementById("resUsageType").value = "";
 if (document.getElementById("resShortStayFields")) document.getElementById("resShortStayFields").style.display = "none";
 if (document.getElementById("resShortEndDate")) document.getElementById("resShortEndDate").value = "";
 if (document.getElementById("resShortPlanType")) document.getElementById("resShortPlanType").value = "";
 if (document.getElementById("resShortPlanOfficeNo")) document.getElementById("resShortPlanOfficeNo").value = "";
 if (document.getElementById("resShortPlanYm")) document.getElementById("resShortPlanYm").value = "";
 if (document.getElementById("resShortPlanUnitsVal")) document.getElementById("resShortPlanUnitsVal").value = "";
 if (document.getElementById("resShortEmergencyDoctor")) document.getElementById("resShortEmergencyDoctor").value = "";
 if (document.getElementById("resShortEmergencyDate")) document.getElementById("resShortEmergencyDate").value = "";
 if (document.getElementById("resShortEmergencyConfirmed")) document.getElementById("resShortEmergencyConfirmed").checked = false;
 gResidentPlanUnitsTemp = [];
 renderResidentPlanUnitsList();
 document.getElementById("resRoomNo").value = "";
  if (document.getElementById("resUnit")) document.getElementById("resUnit").innerHTML = cpUnitOptionsHtml("", cpUnits().length ? "選んでください" : "区分なし（区分の設定で追加できます）");
 document.getElementById("resName").value = "";
 if (document.getElementById("resLastNameKana")) document.getElementById("resLastNameKana").value = "";
 if (document.getElementById("resFirstNameKana")) document.getElementById("resFirstNameKana").value = "";
 document.getElementById("resCareLevel").value = ""; // [Claude修正] 未選択のまま「要介護3」で登録されないように
 document.getElementById("resStatus").value = "在所";
 document.getElementById("resBirthDate").value = "";
 document.getElementById("resAdmissionDate").value = "";
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
 document.getElementById("resInsuredNo").value = "";
 document.getElementById("resInsurerNo").value = "";
 document.getElementById("resGender").value = "";
 document.getElementById("resBenefitRate").value = "";
 document.getElementById("resCareStartDate").value = "";
 document.getElementById("resPreAdmissionStatus").value = "";
 document.getElementById("resPostDischargeStatus").value = "";
 document.getElementById("resClinicSpecialNotes").value = "";
 document.getElementById("resBpHighMax").value = "";
 document.getElementById("resBpHighMin").value = "";
 document.getElementById("resTempMax").value = "";
 document.getElementById("resSpo2Min").value = "";
 document.getElementById("resPulseMax").value = "";
 document.getElementById("resPulseMin").value = "";

 cpLockResidentPlanFields();
 document.getElementById("residentModal").style.display = "flex";
}

function openEditResidentModal(id) {
 const r = gState.residents.find(x => x.id === id);
 if (!r) return;

 document.getElementById("resModalTitle").textContent = ` 利用者情報の編集 (${r.name} 様)`;
 document.getElementById("resEditId").value = r.id;
 const curUsageType = r.usage_type || "resident";
 if (document.getElementById("resUsageType")) document.getElementById("resUsageType").value = curUsageType;
 if (document.getElementById("resShortStayFields")) document.getElementById("resShortStayFields").style.display = (curUsageType === "short") ? "block" : "none";
 if (document.getElementById("resShortEndDate")) document.getElementById("resShortEndDate").value = r.short_end_date || "";
 if (document.getElementById("resShortPlanType")) document.getElementById("resShortPlanType").value = r.short_plan_type || "";
 if (typeof onResidentShortPlanTypeChange === "function") onResidentShortPlanTypeChange(r.short_plan_type || "");
 if (document.getElementById("resShortPlanOfficeNo")) document.getElementById("resShortPlanOfficeNo").value = r.short_plan_office_no || "";
 if (document.getElementById("resShortPlanYm")) document.getElementById("resShortPlanYm").value = "";
 if (document.getElementById("resShortPlanUnitsVal")) document.getElementById("resShortPlanUnitsVal").value = "";
 if (document.getElementById("resShortEmergencyDoctor")) document.getElementById("resShortEmergencyDoctor").value = r.short_emergency_doctor || "";
 if (document.getElementById("resShortEmergencyDate")) document.getElementById("resShortEmergencyDate").value = r.short_emergency_date || "";
 if (document.getElementById("resShortEmergencyConfirmed")) document.getElementById("resShortEmergencyConfirmed").checked = !!r.short_emergency_confirmed;
 gResidentPlanUnitsTemp = Array.isArray(r.short_plan_units) ? JSON.parse(JSON.stringify(r.short_plan_units)) : [];
 renderResidentPlanUnitsList();
 document.getElementById("resRoomNo").value = r.room_no || "";
  if (document.getElementById("resUnit")) document.getElementById("resUnit").innerHTML = cpUnitOptionsHtml(r.unit_id, cpUnits().length ? "選んでください" : "区分なし（区分の設定で追加できます）");
 document.getElementById("resName").value = r.name || "";
 if (document.getElementById("resLastNameKana")) document.getElementById("resLastNameKana").value = r.last_name_kana || "";
 if (document.getElementById("resFirstNameKana")) document.getElementById("resFirstNameKana").value = r.first_name_kana || "";
 document.getElementById("resCareLevel").value = r.care_level || ""; // [Claude修正 2026-10-18] 空のときに「要介護3」を入れない
 document.getElementById("resStatus").value = r.status || "在所";
 document.getElementById("resBirthDate").value = r.birth_date || "";
 document.getElementById("resAdmissionDate").value = r.admission_date || "";
 document.getElementById("resPolicyStamp").value = r.policy_stamp || ""; // [Claude修正 2026-10-18] 空のときに「緊急搬送」を入れない
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
 document.getElementById("resInsuredNo").value = r.insured_no || "";
 document.getElementById("resInsurerNo").value = r.insurer_no || "";
 document.getElementById("resGender").value = r.gender || "";
 document.getElementById("resBenefitRate").value = r.benefit_rate || "";
 document.getElementById("resCareStartDate").value = r.care_start_date || "";
 document.getElementById("resPreAdmissionStatus").value = r.pre_admission_status || "";
 document.getElementById("resPostDischargeStatus").value = r.post_discharge_status || "";
 document.getElementById("resClinicSpecialNotes").value = r.clinic_special_notes || "";
 document.getElementById("resBpHighMax").value = r.bp_high_max || "";
 document.getElementById("resBpHighMin").value = r.bp_high_min || "";
 document.getElementById("resTempMax").value = r.temp_max || "";
 document.getElementById("resSpo2Min").value = r.spo2_min || "";
 document.getElementById("resPulseMax").value = r.pulse_max || "";
 document.getElementById("resPulseMin").value = r.pulse_min || "";

 cpLockResidentPlanFields();
 document.getElementById("residentModal").style.display = "flex";
}

// [Claude追加 2026-10-18] 利用者の登録・編集の画面で、変える権限のない欄を押せなくする
function cpLockResidentPlanFields() {
 const lock = (ids, can, why) => ids.forEach(id => { const el = document.getElementById(id); if (el) { el.disabled = !can; el.title = can ? "" : why; } });
 lock(["resCarePlanGoal"], false, "ケアプランは「ケアプラン」のタブで計画作成担当者が作ります。この欄は以前の記録です");
 lock(["resPolicyStamp"], cpCanEditPolicy(), "基本方針を変えられるのは管理者・計画作成担当者・看護師です");
 lock(["resBpHighMax", "resBpHighMin", "resTempMax", "resSpo2Min", "resPulseMax", "resPulseMin"], cpCanEditVitalLimits(), "バイタルの注意の目安を変えられるのは看護師です");
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
 const usageType = (document.getElementById("resUsageType")?.value || "").trim();
 if (!usageType) {
  alert("利用の区分を選んでください。");
  return;
 }
 if (cpCanEditPolicy() && !document.getElementById("resPolicyStamp").value) {
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
 // [Claude追加 2026-10-18] 入居日: 新しく登録するときは必須。これから先の日付・退所日より後は入れられない
 {
 const ad = document.getElementById("resAdmissionDate").value;
 const curR = editId ? gState.residents.find(x => x.id === parseInt(editId)) : null;
 if (!editId && !ad) { alert("入居日を入れてください。"); return; }
 if (curR && curR.admission_date && !ad) { alert("入居日は消せません。直すときは正しい日付を入れてください。"); return; }
 if (ad && ad > toLocalDateStr(new Date())) { alert("入居日に、これから先の日付は入れられません。"); return; }
 if (ad && curR && curR.discharge_date && ad > curR.discharge_date) { alert("入居日が退所日より後になっています。"); return; }
 }
 // [Claude追加] 退所は「退所の手続き」から（退所日・理由を残すため）。退所の取り消しも専用のボタンから
 // [Antigravity実装 2026-10-19] 入院・退院もカルテの「入院の歴」または在籍状況欄から入院日・退院日を入れて行う
 let cpUnitAfterMove;
 {
 const stVal = document.getElementById("resStatus").value;
 const cur = editId ? gState.residents.find(x => x.id === parseInt(editId)) : null;
 if (cur && cpIsDischarged(cur) && stVal !== "退所") { alert("退所した方を戻すときは、カルテの「退所を取り消す」から行ってください。"); return; }
 if ((!cur || !cpIsDischarged(cur)) && stVal === "退所") { alert("退所は、カルテの「退所の手続き」から行ってください（退所日と理由を残すため）。"); return; }
 if ((!cur || cur.status !== "入院中") && stVal === "入院中") { alert("入院の登録は、カルテの「入院の歴」または在籍状況の切り替えから行ってください（入院日・入院先・理由を残すため）。"); return; }
 if (cur && cur.status === "入院中" && stVal !== "入院中") { alert("入院中の方の退院手続きは、カルテの「入院の歴」の「退院日を入れる」または在籍状況の切り替えから行ってください（退院日を残すため）。"); return; }
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
 {
  const csd = (document.getElementById("resCareStartDate")?.value || "").trim();
  const ced = (document.getElementById("resCareExpiryDate")?.value || "").trim();
  if (csd && ced && csd >= ced) {
   alert("認定有効期間の開始日は、有効期限（終了日）より前の日付を入れてください。");
   return;
  }
 }
 let shortEndDate = "";
 let shortPlanType = "";
 let shortPlanOfficeNo = "";
 let shortPlanUnits = [];
 let shortEmergencyDoctor = "";
 let shortEmergencyDate = "";
 let shortEmergencyConfirmed = false;

 if (usageType === "short") {
  shortEndDate = (document.getElementById("resShortEndDate")?.value || "").trim();
  const ad = (document.getElementById("resAdmissionDate")?.value || "").trim();
  if (!shortEndDate) {
   alert("利用終了予定日を入れてください。");
   return;
  }
  if (ad && shortEndDate < ad) {
   alert("利用終了予定日は、利用開始日以降の日付を入れてください。");
   return;
  }
  if (ad && shortEndDate) {
   const dStart = new Date(ad);
   const dEnd = new Date(shortEndDate);
   const diffDays = Math.round((dEnd - dStart) / 86400000) + 1;
   if (diffDays > 30) {
    alert("短期利用の利用期間はあらかじめ30日以内と定められています（手引き基準）。利用終了予定日を開始日から30日以内の日付にしてください。");
    return;
   }
  }

  shortPlanType = (document.getElementById("resShortPlanType")?.value || "").trim();
  if (!shortPlanType) {
   alert("居宅サービス計画作成区分を選んでください。");
   return;
  }
  shortPlanOfficeNo = (document.getElementById("resShortPlanOfficeNo")?.value || "").trim();
  if (shortPlanType === "1" || shortPlanType === "3") {
   if (!shortPlanOfficeNo || !/^[A-Za-z0-9]{10}$/.test(shortPlanOfficeNo)) {
    alert("居宅介護支援事業所等の事業所番号を半角英数字10桁で入れてください。");
    return;
   }
  }

  shortEmergencyDoctor = (document.getElementById("resShortEmergencyDoctor")?.value || "").trim();
  shortEmergencyDate = (document.getElementById("resShortEmergencyDate")?.value || "").trim();
  shortEmergencyConfirmed = !!document.getElementById("resShortEmergencyConfirmed")?.checked;
  shortPlanUnits = Array.isArray(gResidentPlanUnitsTemp) ? JSON.parse(JSON.stringify(gResidentPlanUnitsTemp)) : [];

  // 同じユニットに短期利用の人が同じ日に2人以上いたら警告（手引き: 1ユニット1名。緊急で定員を超える場合はユニットごとに1人まで）
  const curUnitId = (cpUnitSel && cpUnitSel.value) ? Number(cpUnitSel.value) : null;
  if (curUnitId !== null && ad && shortEndDate) {
   const overlaps = (gState.residents || []).filter(other => {
    if (editId && other.id === parseInt(editId, 10)) return false;
    if (other.usage_type !== "short") return false;
    if (cpIsDischarged(other)) return false;
    if (other.unit_id !== curUnitId) return false;
    const otherStart = other.admission_date;
    const otherEnd = other.short_end_date || other.discharge_date || otherStart;
    if (!otherStart || !otherEnd) return false;
    return !(shortEndDate < otherStart || ad > otherEnd);
   });
   if (overlaps.length > 0) {
    const names = overlaps.map(o => o.name).join("、");
    alert(`【注意】同じユニットに利用期間が重複する短期利用の利用者（${names} 様）が登録されています。\n手引き基準: 短期利用は1ユニット原則1名です（緊急時の受入れ等を除く）。`);
   }
  }
 }

 const lastNameKana = (document.getElementById("resLastNameKana")?.value || "").trim();
 const firstNameKana = (document.getElementById("resFirstNameKana")?.value || "").trim();
 // [Claude修正] カナはカタカナ（ひらがなも可）と長音だけ。LIFE の書き出しで半角カナにする
 if ((lastNameKana && !/^[\u30A1-\u30FC\u3041-\u3096\s\u3000]+$/.test(lastNameKana)) || (firstNameKana && !/^[\u30A1-\u30FC\u3041-\u3096\s\u3000]+$/.test(firstNameKana))) {
  alert("氏名カナは、カタカナで入れてください。");
  return;
 }
 const residentData = {
 room_no: roomNo,
 unit_id: (cpUnitSel && cpUnitSel.value) ? Number(cpUnitSel.value) : null,
 name: name,
 last_name_kana: lastNameKana,
 first_name_kana: firstNameKana,
 care_level: document.getElementById("resCareLevel").value,
 status: document.getElementById("resStatus").value,
 birth_date: document.getElementById("resBirthDate").value,
 admission_date: document.getElementById("resAdmissionDate").value,
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
 insured_no: (document.getElementById("resInsuredNo")?.value || "").trim(),
 insurer_no: (document.getElementById("resInsurerNo")?.value || "").trim(),
 gender: (document.getElementById("resGender")?.value || "").trim(),
 benefit_rate: (document.getElementById("resBenefitRate")?.value || "").trim(),
 care_start_date: (document.getElementById("resCareStartDate")?.value || "").trim(),
 pre_admission_status: (document.getElementById("resPreAdmissionStatus")?.value || "").trim(),
 post_discharge_status: (document.getElementById("resPostDischargeStatus")?.value || "").trim(),
 clinic_special_notes: document.getElementById("resClinicSpecialNotes").value.trim(),
 bp_high_max: document.getElementById("resBpHighMax").value ? parseInt(document.getElementById("resBpHighMax").value, 10) : null,
 bp_high_min: document.getElementById("resBpHighMin").value ? parseInt(document.getElementById("resBpHighMin").value, 10) : null,
 temp_max: document.getElementById("resTempMax").value ? parseFloat(document.getElementById("resTempMax").value) : null,
 spo2_min: document.getElementById("resSpo2Min").value ? parseInt(document.getElementById("resSpo2Min").value, 10) : null,
 pulse_max: document.getElementById("resPulseMax").value ? parseInt(document.getElementById("resPulseMax").value, 10) : null,
 pulse_min: document.getElementById("resPulseMin").value ? parseInt(document.getElementById("resPulseMin").value, 10) : null,
  usage_type: usageType,
  short_end_date: shortEndDate,
  short_plan_type: shortPlanType,
  short_plan_office_no: shortPlanOfficeNo,
  short_plan_units: shortPlanUnits,
  short_emergency_doctor: shortEmergencyDoctor,
  short_emergency_date: shortEmergencyDate,
  short_emergency_confirmed: shortEmergencyConfirmed
 };
 // [Claude修正 2026-10-18] 変える権限のない欄は、前の値のまま（新しく登録するときは空）にする。ケアプラン目標はカルテの欄から（説明と同意の日を入れるため）
 { const prev = editId ? (gState.residents.find(x => x.id === parseInt(editId)) || {}) : {};
  const keep = ks => ks.forEach(k2 => { residentData[k2] = (prev[k2] === undefined ? (k2 === "policy_stamp" || k2 === "care_plan_goal" ? "" : null) : prev[k2]); });
  keep(["care_plan_goal"]);
  if (!cpCanEditPolicy()) keep(["policy_stamp"]);
  if (!cpCanEditVitalLimits()) keep(["bp_high_max", "bp_high_min", "temp_max", "spo2_min", "pulse_max", "pulse_min"]); }
 if (cpUnitAfterMove !== undefined) residentData.unit_id = cpUnitAfterMove;

 let targetId;
 if (editId) {
 targetId = parseInt(editId);
 const idx = gState.residents.findIndex(x => x.id === targetId);
 if (idx !== -1) {
 const cpOld = gState.residents[idx];
 gState.residents[idx] = Object.assign({}, gState.residents[idx], residentData);

 cpAppendEditHistory(gState.residents[idx], cpOld, ["name", "last_name_kana", "first_name_kana", "room_no", "unit_id", "care_level", "status", "birth_date", "admission_date", "policy_stamp", "emergency_contact", "family_wishes", "life_history", "diseases", "paralysis", "allergies", "diet_type", "oral_state", "dr_instructions", "care_plan_goal", "sensor_alert", "bp_high_max", "bp_high_min", "temp_max", "spo2_min", "pulse_max", "pulse_min", "insured_no", "insurer_no", "gender", "benefit_rate", "care_start_date", "pre_admission_status", "post_discharge_status", "usage_type", "short_end_date", "short_plan_type", "short_plan_office_no", "short_plan_units", "short_emergency_doctor", "short_emergency_date", "short_emergency_confirmed"]); // [Claude修正] 変更前の登録内容を利用者の変更履歴に残す
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



// ==============================================================
// 事故・ヒヤリハット報告書 詳細モーダル表示 ＆ 印刷
// ==============================================================
function openIncidentDetailModal(incId) {
	const list = db.data.incidents || [];
	const inc = list.find(x => Number(x.id) === Number(incId));
	if (!inc) {
		alert("指定された報告書が見つかりません。");
		return;
	}

	gState.selectedIncidentDetailId = inc.id;

	// 取消状態の表示
	const voidBanner = document.getElementById("incDetailVoidedBanner");
	if (voidBanner) {
		if (inc.voided) {
			voidBanner.style.display = "block";
			const reason = inc.void_reason || "理由未記入";
			const staff = inc.voided_by || "記録者";
			const at = inc.voided_at || "";
			voidBanner.innerHTML = `【取消済】 取消理由: ${escapeHtml(reason)}（取消者: ${escapeHtml(staff)}${at ? ' / ' + escapeHtml(at) : ''}）`;
		} else {
			voidBanner.style.display = "none";
			voidBanner.innerHTML = "";
		}
	}

	// 利用者情報
	const res = (gState.residents || []).find(r => r.id === inc.resident_id);
	const resDisplay = res
		? `${escapeHtml(res.room_no || '')}号室 ${escapeHtml(res.name || '')} 様 (${escapeHtml(res.care_level || '-')})`
		: (escapeHtml(inc.resident_name || '未設定'));

	// 基本情報
	const timeDisplay = inc.occurred_at || inc.date || '-';
	const repType = inc.report_type || inc.level || 'ヒヤリハット';
	const statusDisplay = inc.status || '報告済';
	const staffDisplay = inc.staff_name || '未記録'; // [Claude修正] 記録者がないときに代わりの言葉を出さない

	const elTime = document.getElementById("incDetailOccurredAt");
	if (elTime) elTime.textContent = timeDisplay;
	const elType = document.getElementById("incDetailReportType");
	if (elType) elType.textContent = repType;
	const elRes = document.getElementById("incDetailResident");
	if (elRes) elRes.innerHTML = resDisplay;
	const elPlace = document.getElementById("incDetailPlace");
	if (elPlace) elPlace.textContent = inc.place || '—';
	const elStatus = document.getElementById("incDetailStatus");
	if (elStatus) elStatus.textContent = statusDisplay;
	const elStaff = document.getElementById("incDetailStaff");
	if (elStaff) elStaff.textContent = staffDisplay;

	// 各記述欄
	const elSitu = document.getElementById("incDetailSituation");
	if (elSitu) elSitu.textContent = inc.situation || '—';
	const elCause = document.getElementById("incDetailCause");
	if (elCause) elCause.textContent = inc.cause || inc.factor || '—';
	const elPrev = document.getElementById("incDetailPrevention");
	if (elPrev) elPrev.textContent = inc.prevention || inc.countermeasure || '—';
	const elSup = document.getElementById("incDetailSupervisor");
	if (elSup) elSup.textContent = inc.supervisor_comment || '—';

	// 受傷部位シェーマ図 ＆ 外傷ピン一覧の描画（読み取り専用）
	renderIncidentInjuryPins({
		overlay: document.getElementById("incidentDetailPinsOverlay"),
		tableContainer: document.getElementById("incidentDetailPinsTable"),
		pins: inc.injury_pins || [],
		readOnly: true
	});

	// モーダルを開く
	const modal = document.getElementById("incidentDetailModal");
	if (modal) modal.style.display = "flex";
}

function printCurrentIncidentDetail() {
	if (!gState.selectedIncidentDetailId) return;
	printIncidentReport(gState.selectedIncidentDetailId);
}

window.openIncidentDetailModal = openIncidentDetailModal;
window.printCurrentIncidentDetail = printCurrentIncidentDetail;
