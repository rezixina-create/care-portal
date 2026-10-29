
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

// ==============================================================
// 全小窓 (modal-overlay) 共通の背景（外側）クリック閉鎖システム
// - 外側の暗い背景を押すと小窓の「×」「閉じる」と同じ処理で安全に閉じる
// - 中で押し始めて外で離したドラッグ操作（文字選択など）では閉じない
// - 開いてから入力・選択が変更されていれば確認ダイアログを表示（書きかけ保護）
// - 2名承認画面・パスワード/PIN設定画面・保存処理中は外側クリック閉鎖から除外
// ==============================================================

const CP_MODAL_BACKDROP_EXCLUDED = new Set([
  "resetStaffPinModal",     // 【2名承認制】暗証番号の初期化
  "accountResetModal",      // 2名承認によるID・パスワード初期化
  "facilityNameModal",      // 施設名変更（管理者・事務員2名承認）
  "staffPinAuthModal",      // 職員切り替え認証（暗証番号入力）
  "initialPinModal",        // 職員自己暗証番号変更（初回設定）
  "accountSettingsModal"    // ID・パスワード個別設定
]);

let _cpBackdropPointerDownTarget = null;

document.addEventListener("mousedown", (e) => {
  _cpBackdropPointerDownTarget = e.target;
}, true);

document.addEventListener("touchstart", (e) => {
  _cpBackdropPointerDownTarget = e.target;
}, { capture: true, passive: true });

document.addEventListener("input", (e) => {
  const modal = e.target && e.target.closest ? e.target.closest(".modal-overlay") : null;
  if (modal) modal._cpDirty = true;
}, true);

document.addEventListener("change", (e) => {
  const modal = e.target && e.target.closest ? e.target.closest(".modal-overlay") : null;
  if (modal) modal._cpDirty = true;
}, true);

document.addEventListener("focusin", (e) => {
  const modal = e.target && e.target.closest ? e.target.closest(".modal-overlay") : null;
  if (modal && !modal._cpSnapshot) {
    cpSnapshotModal(modal);
  }
}, true);

function cpGetElementKey(el, idx) {
  if (el.id) return "id:" + el.id;
  if (el.type === "radio") return "radio:" + (el.name || "") + ":" + el.value;
  if (el.name) return "name:" + el.name + "_" + idx;
  return "el:" + el.tagName + "_" + idx;
}

function cpSnapshotModal(modal) {
  if (!modal) return;
  const map = new Map();
  const els = modal.querySelectorAll("input, select, textarea");
  els.forEach((el, idx) => {
    if (el.type === "button" || el.type === "submit" || el.type === "reset" || el.type === "hidden") return;
    const key = cpGetElementKey(el, idx);
    if (el.type === "checkbox" || el.type === "radio") {
      map.set(key, el.checked);
    } else {
      map.set(key, el.value);
    }
  });
  modal._cpSnapshot = map;
}

function cpIsModalDirty(modal) {
  if (!modal) return false;
  if (!modal._cpDirty) return false;
  if (!modal._cpSnapshot) return true;

  const els = modal.querySelectorAll("input, select, textarea");
  for (let i = 0; i < els.length; i++) {
    const el = els[i];
    if (el.type === "button" || el.type === "submit" || el.type === "reset" || el.type === "hidden") continue;
    const key = cpGetElementKey(el, i);
    if (modal._cpSnapshot.has(key)) {
      const initial = modal._cpSnapshot.get(key);
      if (el.type === "checkbox" || el.type === "radio") {
        if (el.checked !== initial) return true;
      } else {
        if (el.value !== initial) return true;
      }
    } else {
      if (el.type === "checkbox" || el.type === "radio") {
        if (el.checked) return true;
      } else if (el.value && el.value.trim() !== "") {
        return true;
      }
    }
  }
  return false;
}

function cpDismissModal(modal) {
  if (!modal) return;
  const closeBtn = modal.querySelector(".close-btn, .modal-close-btn");
  if (closeBtn) {
    closeBtn.click();
  } else {
    const cancelBtn = modal.querySelector('button[onclick*="closeModal"], button[onclick*="close"]');
    if (cancelBtn) {
      cancelBtn.click();
    } else if (typeof closeModal === "function") {
      closeModal(modal.id);
    } else {
      modal.style.display = "none";
    }
  }

  if (modal.style.display !== "none" && getComputedStyle(modal).display !== "none") {
    if (typeof closeModal === "function") {
      closeModal(modal.id);
    } else {
      modal.style.display = "none";
    }
  }
}

function cpHandleModalOverlayClick(e) {
  const modal = this;
  if (!modal) return;

  if (e._cpBackdropHandled) return;
  e._cpBackdropHandled = true;

  if (e.target !== modal) return;
  if (_cpBackdropPointerDownTarget !== modal) return;
  if (CP_MODAL_BACKDROP_EXCLUDED.has(modal.id)) return;
  // [Claude修正] db は const で作っているので window.db にはない（今まで止まっていなかった）
  if (typeof db !== "undefined" && db && db._saving) return;

  if (cpIsModalDirty(modal)) {
    if (!confirm("書きかけの内容があります。閉じますか？")) {
      return;
    }
  }

  cpDismissModal(modal);
}

function initModalBackdropDismissal() {
  if (window._cpModalBackdropInitialized) return;
  window._cpModalBackdropInitialized = true;

  const modals = document.querySelectorAll(".modal-overlay");
  modals.forEach((modal) => {
    modal.addEventListener("click", cpHandleModalOverlayClick);

    const isVisible = modal.style.display !== "none" && getComputedStyle(modal).display !== "none";
    modal._cpWasVisible = isVisible;
    if (isVisible) {
      cpSnapshotModal(modal);
    }

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "attributes" && (m.attributeName === "style" || m.attributeName === "class")) {
          const visible = modal.style.display !== "none" && getComputedStyle(modal).display !== "none";
          if (visible && !modal._cpWasVisible) {
            modal._cpWasVisible = true;
            modal._cpDirty = false;
            modal._cpSnapshot = null;
            setTimeout(() => {
              if (modal.style.display !== "none") {
                cpSnapshotModal(modal);
              }
            }, 30);
          } else if (!visible && modal._cpWasVisible) {
            modal._cpWasVisible = false;
            modal._cpDirty = false;
            modal._cpSnapshot = null;
          }
        }
      }
    });

    observer.observe(modal, { attributes: true, attributeFilter: ["style", "class"] });
  });
}

document.addEventListener("click", (e) => {
  const modal = e.target;
  if (!modal || !modal.classList || !modal.classList.contains("modal-overlay")) return;
  if (e._cpBackdropHandled) return;
  cpHandleModalOverlayClick.call(modal, e);
});

// 即時バインドおよびDOMContentLoaded時のバインド
initModalBackdropDismissal();

window.addEventListener("DOMContentLoaded", () => {
  initModalBackdropDismissal();
});


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
  initModalBackdropDismissal();
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
 const list = (gState.stamps && gState.stamps.length) ? gState.stamps : ((db && db.data && Array.isArray(db.data.stamps)) ? db.data.stamps : []);
 const staffObj = list.find(s => (s.name || s) === staff);
 const role = staffObj ? (staffObj.role || "") : "";
 const targetText = role ? role.toLowerCase() : `${role} ${staff}`.toLowerCase();
 return targetText.includes("管理者") || targetText.includes("施設長") || targetText.includes("事務") || targetText.includes("所長") || targetText.includes("ホーム長") || targetText.includes("院長") || targetText.includes("理事") || targetText.includes("事務長");
}

function isCurrentStaffAdminOrClerk() {
 // [Claude修正 2026-10-19] 権限はログインした本人で決める。記録者の選ぶ欄を管理者に変えるだけで、介護職員でも職員の管理や資格の一覧を変えられていた
 const staffSelect = document.getElementById("currentStaff");
 const staff = (gState.session && gState.session.staffName) || (staffSelect ? staffSelect.value : "") || gState.currentStaff || "";
 return isStaffAdminOrClerk(staff);
}

// 職員ロール判定（管理者・事務員・計画作成担当者）
function isStaffAdminOrClerkOrCm(staff) {
 if (!staff) return false;
 if (isStaffAdminOrClerk(staff)) return true;
 const list = (gState.stamps && gState.stamps.length) ? gState.stamps : ((db && db.data && Array.isArray(db.data.stamps)) ? db.data.stamps : []);
 const staffObj = list.find(s => (s.name || s) === staff);
 const role = staffObj ? (staffObj.role || "") : "";
 return /計画作成|介護支援専門員|ケアマネ/.test(role);
}

function isCurrentStaffAdminOrClerkOrCm() {
 const staffSelect = document.getElementById("currentStaff");
 const staff = (gState.session && gState.session.staffName) || (staffSelect ? staffSelect.value : "") || gState.currentStaff || "";
 return isStaffAdminOrClerkOrCm(staff);
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
  // 記録の書き出し枠の表示制御（管理者・事務員専用） [Antigravity実装]
  const exportSection = document.getElementById("officeCareRecordsExportSection");
  if (exportSection) {
    exportSection.style.display = (typeof cpCanExportCareRecords === "function" && cpCanExportCareRecords()) ? "block" : "none";
  }
 // [Antigravity実装 2026-10-16] 職種切り替え時に「経過記録」画面の表示項目も即時更新
 if (typeof renderSingleWriteScreen === "function" && gState.activeCareTab === "write_single") {
  renderSingleWriteScreen();
 }
 // [Antigravity実装 2026-10-19] 職種切り替え時に「ケアプラン」タブの表示・権限も即時更新
 if (typeof renderCarePlanTab === "function" && gState.activeCareTab === "careplan") {
  renderCarePlanTab();
 }
 // [Antigravity実装 2026-10-19] 職種切り替え時に「職員・保有資格の一覧」の操作ボタン表示も即時更新
 if (typeof renderStaffQualificationsTable === "function") {
  renderStaffQualificationsTable();
 }
 // [Antigravity実装 2026-10-29] 職種切り替え時に「認定更新」画面の権限表示も即時更新
 if (typeof renderOfficeCareRenewal === "function" && gState.activePortal === "office" && gState.activeOfficeTab === "care_renewal") {
  renderOfficeCareRenewal();
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

function checkGlobalAlerts(baseDate) {
  const careContainer = document.getElementById("careAlertsContainer");
  const officeContainer = document.getElementById("officeAlertsContainer");
  const legacyContainer = document.getElementById("alertsContainer");
  if (!careContainer && !officeContainer && !legacyContainer) return;

  let careAlertHtml = "";
  let officeAlertHtml = "";
  const today = baseDate ? new Date(baseDate) : new Date();
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
              <span><strong>【セキュリティ設定警告】</strong> 初期の暗証番号のままの職員が<strong>${unconfigured.length}名</strong>います（対象: ${staffNames}）。安全管理のため、事務所ポータルの「暗証番号管理」より変更を行ってください。</span>
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

  // [Claude追加] 短期利用の終了予定日を過ぎたのに、退所の手続きがされていない人
  {
    const realToday = getRealTodayStr();
    const overdue = (gState.residents || []).filter(r => r && r.usage_type === "short" && r.short_end_date && r.short_end_date < realToday && !cpIsDischarged(r));
    const ssKey = `short_overdue_${realToday}_${overdue.map(r => r.id).join("_")}`;
    if (overdue.length > 0 && !isAlertDismissed(ssKey)) {
      const names = overdue.map(r => `${escapeHtml(r.name || "")}（終了予定日 ${escapeHtml(r.short_end_date)}）`).join("、");
      const ssHtml = `
        <div class="alert-banner alert-warning notice-card-warning">
          <span><strong>【短期利用】</strong> 利用の終了予定日を過ぎた方がいます: ${names}。退所の手続きをしてください（手続きをするまで、居室と一覧に残ります）。</span>
          <button class="btn btn-secondary" style="padding:2px 8px; font-size:13px;" onclick="requestDismissAlertFromButton(this, '${ssKey}')">確認済・閉じる</button>
        </div>
      `;
      careAlertHtml += ssHtml;
      officeAlertHtml += ssHtml;
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
            <button class="btn btn-primary" style="padding:3px 10px; font-size:12px;" onclick="approveOrder(${o.id}, '承認済')"> 承認する</button>
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

  // [Antigravity実装 2026-10-19] 6-2. 【介護専用：実施中のケアプラン 短期目標の期限（14日以内・期限切れ）お知らせ】
  if (Array.isArray(db.data.care_plans)) {
    cpCurrentResidents().forEach(r => {
      const activePlan = (db.data.care_plans || []).find(p => p && !p.voided && Number(p.resident_id) === Number(r.id) && p.status === "実施中");
      if (!activePlan || !Array.isArray(activePlan.needs)) return;
      activePlan.needs.forEach(n => {
        if (!n || !n.short_to) return;
        const diffDays = cpDaysUntil(n.short_to);
        if (diffDays === null || diffDays > 14) return;
        const cpKey = `careplan_short_${activePlan.id}_${n.id}_${n.short_to}_${diffDays < 0 ? "exp" : "soon"}`;
        if (isAlertDismissed(cpKey)) return;
        const isExpired = diffDays < 0;
        const alertClass = isExpired ? "alert-danger notice-card-urgent" : "alert-warning notice-card-warning";
        const tag = isExpired ? "【ケアプラン短期目標 期限切れ】" : "【ケアプラン短期目標 期限間近】";
        const dayText = isExpired
          ? `期限（${escapeHtml(n.short_to)}）を <strong>${-diffDays}日</strong> 過ぎています`
          : diffDays === 0
            ? `期限（${escapeHtml(n.short_to)}）は <strong>本日</strong> です`
            : `期限（${escapeHtml(n.short_to)}）まであと <strong>${diffDays}日</strong> です`;
        const goalLabel = n.short_goal ? `「${escapeHtml(n.short_goal)}」` : `（課題: ${escapeHtml(n.need || "未記入")}）`;
        careAlertHtml += `
          <div class="alert-banner ${alertClass}">
            <span><strong>${tag}</strong> ${escapeHtml(String(r.room_no || ""))}号室 <strong>${escapeHtml(r.name || "")} 様</strong>（第${Number(activePlan.version) || 1}版）：短期目標${goalLabel}の${dayText}。モニタリング・見直しを確認してください。</span>
            <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
              <button type="button" class="btn btn-secondary" onclick="enterPortal('care'); selectResident(${Number(r.id)}); switchCareTab('careplan');">ケアプランを開く</button>
              <button type="button" class="btn btn-secondary" onclick="requestDismissAlertFromButton(this, '${cpKey}')">確認済・閉じる</button>
            </div>
          </div>
        `;
      });
    });
  }

  // [Antigravity実装 2026-10-26] 6-3. 【介護・事務共通：介護サマリー ADL段階変更のお知らせ】
  if (Array.isArray(db.data.care_summaries)) {
    (typeof cpCurrentResidents === "function" ? cpCurrentResidents() : (gState.residents || [])).forEach(r => {
      if (!r || (typeof cpIsDischarged === "function" && cpIsDischarged(r))) return;
      // [Claude修正] 保存の順番ではなく作成日の新しい順で比べる
      const rSummaries = typeof cpSummariesOfResident === "function" ? cpSummariesOfResident(r.id) : (db.data.care_summaries || []).filter(s => Number(s.resident_id) === Number(r.id));
      if (rSummaries.length < 2) return;
      // [Claude修正] 最新と1つ前だけを比べると、段階を変えたあとに文章だけ直した版を保存したとき、
      // ケアプランを見直す前でも知らせが消えていた。新しい版からさかのぼり「最後に段階が変わった版」で知らせる
      // （知らせの印はその版の id。確認済・閉じるを押すまで残る）
      const hasAdl = s => s && Array.isArray(s.adl_items) && s.adl_items.length > 0;
      let latest = null;
      let changes = [];
      for (let i = 0; i < rSummaries.length - 1; i++) {
        const cur = rSummaries[i];
        const prev = rSummaries.find(s => s.id === cur.previous_id) || rSummaries[i + 1];
        if (!hasAdl(cur) || !hasAdl(prev)) break; // 前の書き方（文章）の版まで来たら比べない
        const found = [];
        cur.adl_items.forEach(currItem => {
          if (!currItem || !currItem.level) return;
          const prevItem = prev.adl_items.find(p => (p.key && p.key === currItem.key) || (p.action && p.action === currItem.action));
          if (prevItem && prevItem.level && prevItem.level !== currItem.level) {
            found.push(`${currItem.action || currItem.key} ${prevItem.level} → ${currItem.level}`);
          }
        });
        if (found.length > 0) { latest = cur; changes = found; break; }
      }
      if (!latest) return;

      if (changes.length > 0) {
        const adlAlertKey = `summary_adl_change_${latest.id}`;
        if (!isAlertDismissed(adlAlertKey)) {
          const adlNoticeHtml = `
            <div class="alert-banner alert-warning notice-card-warning">
              <span><strong>【ADL段階変更】</strong> ${escapeHtml(r.name || "")} 様：ADL の段階が変わりました（${changes.map(c => escapeHtml(c)).join("、")}）。ケアプランの見直しを検討してください。</span>
              <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
                <button type="button" class="btn btn-secondary" onclick="enterPortal('care'); selectResident(${Number(r.id)}); switchCareTab('careplan');">ケアプランを開く</button>
                <button type="button" class="btn btn-secondary" onclick="requestDismissAlertFromButton(this, '${adlAlertKey}')">確認済・閉じる</button>
              </div>
            </div>
          `;
          careAlertHtml += adlNoticeHtml;
          officeAlertHtml += adlNoticeHtml;
        }
      }
    });
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

  // 7. 【事務ポータル専用】法定委員会・研修 実施状況アラート [Antigravity実装]
  if (typeof cpGetCommitteeComplianceStatus === "function") {
    const comStatuses = cpGetCommitteeComplianceStatus();
    const unmet = comStatuses.filter(s => s.is_unmet);
    // [Claude修正] 印は数える関数が作ったもの（alert_key）を使う
    const activeUnmet = unmet.filter(s => !isAlertDismissed(s.alert_key));
    if (activeUnmet.length > 0) {
      const activeKeys = activeUnmet.map(s => s.alert_key);
      const hasPenaltySubject = activeUnmet.some(s => s.penalty_subject);
      const itemsListHtml = activeUnmet.map(s => {
        let detail = "";
        if (s.frequency_type === "annual") {
          detail = `（今年度 ${s.fy_count}／${s.required_count}回）`;
        } else if (s.status === "期限を過ぎている") {
          detail = `（期限 ${escapeHtml(s.next_deadline)}${s.approx ? '（目安）' : ''} を超過 - 最終: ${escapeHtml(s.last_date)}）`;
        } else {
          detail = `（記録なし - 決まり: ${escapeHtml(s.display_rule)}）`;
        }
        return `<div style="margin:2px 0;">・${escapeHtml(s.name)} ${detail}</div>`;
      }).join("");

      const penaltyNotice = hasPenaltySubject
        ? `<div style="font-size:12px; color:var(--alert); font-weight:bold; margin-top:4px;">※ 身体拘束・虐待防止の項目は、足りないと減算の対象になることがあります（身体拘束廃止未実施減算・高齢者虐待防止措置未実施減算）。</div>`
        : "";

      officeAlertHtml += `
        <div class="alert-banner alert-warning notice-card-warning" style="background:var(--alert-tint); border-left:5px solid var(--alert); color:var(--ink);">
          <div style="width:100%;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:8px;">
              <div>
                <strong style="color:var(--alert);">【委員会・研修】決まりの回数に足りていない項目があります：</strong>
                <div style="margin-top:6px; font-size:13px; line-height:1.5;">
                  ${itemsListHtml}
                </div>
                ${penaltyNotice}
              </div>
              <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin-top:4px;">
                <button type="button" class="btn btn-secondary" style="padding:3px 10px; font-size:12px; background:var(--surface); color:var(--pine-dark); border-color:var(--line);" onclick="enterPortal('office'); switchOfficeTab('committee');">委員会・研修を開く</button>
                <button type="button" class="btn btn-secondary" style="padding:3px 10px; font-size:12px; background:var(--surface); color:var(--ink-2); border-color:var(--line);" onclick="requestDismissAlertFromButton(this, ${escapeHtml(JSON.stringify(activeKeys))})">確認済・閉じる</button>
              </div>
            </div>
          </div>
        </div>
      `;
    }
  }

  // 8. 【事務ポータル用】国保連請求 返戻・過誤決定未再請求アラート [Antigravity追加 2026-10-26]
  const getUnresolvedClaimsFn = (typeof cpGetUnresolvedRemandAndKagoClaims === "function")
    ? cpGetUnresolvedRemandAndKagoClaims
    : (typeof cpGetUnresolvedRemandClaims === "function" ? () => cpGetUnresolvedRemandClaims().map(r => ({ type: "remand", record: r })) : null);

  if (getUnresolvedClaimsFn) {
    const unresItems = getUnresolvedClaimsFn();
    if (unresItems.length > 0) {
      const activeItems = unresItems.filter(it => !isAlertDismissed(`claim_${it.type}_${it.record.id}`));
      if (activeItems.length > 0) {
        const activeKeys = activeItems.map(it => `claim_${it.type}_${it.record.id}`);
        const allResidents = (db && db.data && Array.isArray(db.data.residents)) ? db.data.residents : [];
        const itemsListHtml = activeItems.map(it => {
          const rec = it.record;
          const res = allResidents.find(x => Number(x.id) === Number(rec.resident_id));
          const name = res ? res.name : `利用者ID:${rec.resident_id}`;
          const [y, m] = (rec.service_ym || "").split("-");
          const ymFmt = (y && m) ? `${y}年${parseInt(m, 10)}月分` : rec.service_ym;
          if (it.type === "kago_decided") {
            return `<div style="margin:2px 0;">・【過誤決定】${escapeHtml(name)} 様（${escapeHtml(ymFmt)}）: 決定通知確認済（${escapeHtml(rec.kago_decided_date || '-')}）</div>`;
          }
          return `<div style="margin:2px 0;">・【返戻】${escapeHtml(name)} 様（${escapeHtml(ymFmt)}）: ${escapeHtml(rec.remand_reason || '')}</div>`;
        }).join("");

        officeAlertHtml += `
          <div class="alert-banner alert-warning notice-card-warning" style="background:var(--alert-tint); border-left:5px solid var(--alert); color:var(--ink);">
            <div style="width:100%;">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:8px;">
                <div>
                  <strong style="color:var(--alert);">【請求】返戻のまま再請求していない明細があります（過誤決定含む）！</strong>
                  <div style="margin-top:6px; font-size:13px; line-height:1.5;">
                    ${itemsListHtml}
                  </div>
                  <div style="font-size:12px; color:var(--ink-2); margin-top:4px;">※ 内容を確認の上、国保連請求ファイル作成画面の「月遅れ分」から再請求を行ってください。</div>
                </div>
                <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin-top:4px;">
                  <button type="button" class="btn btn-secondary" style="padding:3px 10px; font-size:12px; background:var(--surface); color:var(--pine-dark); border-color:var(--line);" onclick="enterPortal('office'); switchOfficeTab('kasan');">請求の状況を開く</button>
                  <button type="button" class="btn btn-secondary" style="padding:3px 10px; font-size:12px; background:var(--surface); color:var(--ink-2); border-color:var(--line);" onclick="requestDismissAlertFromButton(this, ${escapeHtml(JSON.stringify(activeKeys))})">確認済・閉じる</button>
                </div>
              </div>
            </div>
          </div>
        `;
      }
    }
  }

  // 介護現場ポータル コンテナへ描画
  // [Claude修正] お知らせの見出し【…】を共通の形にそろえる (色は style.css で指定)
  // 9. 国保連請求 出し忘れ・受付期間アラート [Antigravity追加 2026-10-26]
  // 管理者・事務員のみ表示（介護職員・看護師には出さない）
  if (isCurrentStaffAdminOrClerk() && typeof cpGetRegularClaimProgress === "function") {
    const claimDate = baseDate ? new Date(baseDate) : today;
    const procYm = `${claimDate.getFullYear()}${String(claimDate.getMonth() + 1).padStart(2, "0")}`;
    const progress = cpGetRegularClaimProgress(procYm, claimDate);

    if (progress && progress.targetCount > 0 && !progress.isComplete) {
      const day = claimDate.getDate();
      let alertMsg = "";
      let dismissKey = "";
      let bannerBorder = "";
      let bannerTint = "";

      if (day >= 1 && day <= 10) {
        const remainingDays = 10 - day;
        const remainingText = (remainingDays === 0) ? "今日まで" : `あと${remainingDays}日`;
        alertMsg = `【請求】${progress.regularMonthNum}月分の国保連請求がまだ送られていません（受付は10日まで、${remainingText}）。`;
        dismissKey = `claim_regular_deadline_${procYm}_early`;
        bannerBorder = "var(--caution)";
        bannerTint = "var(--caution-tint)";
      } else {
        alertMsg = `【請求】${progress.regularMonthNum}月分の国保連請求は今月の受付（1日〜10日）に間に合いませんでした。来月1日〜10日に月遅れ分として出してください。`;
        dismissKey = `claim_regular_deadline_${procYm}_late`;
        bannerBorder = "var(--alert)";
        bannerTint = "var(--alert-tint)";
      }

      if (!isAlertDismissed(dismissKey)) {
        officeAlertHtml += `
          <div class="alert-banner alert-warning notice-card-warning" style="background:${bannerTint}; border-left:5px solid ${bannerBorder}; color:var(--ink); margin-bottom:8px;">
            <div style="width:100%;">
              <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                <div style="font-size:13px; line-height:1.5;">
                  <strong>${escapeHtml(alertMsg)}</strong>
                  <span style="font-size:13px; color:var(--ink-2); margin-left:6px;">（対象 ${progress.targetCount}名中、送付済 ${progress.submittedCount}名 / 未送付 ${progress.unsubmittedCount}名）</span>
                </div>
                <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
                  <button type="button" class="btn btn-secondary" style="padding:4px 10px; font-size:13px; background:var(--surface); color:var(--pine-dark); border:1px solid var(--line); border-radius:4px; cursor:pointer;" onclick="enterPortal('office'); switchOfficeTab('kasan');">加算・請求タブを開く</button>
                  <button type="button" class="btn btn-secondary" style="padding:4px 10px; font-size:13px; background:var(--surface); color:var(--ink-2); border:1px solid var(--line); border-radius:4px; cursor:pointer;" onclick="requestDismissAlertFromButton(this, '${escapeHtml(dismissKey)}')">確認済・閉じる</button>
                </div>
              </div>
            </div>
          </div>
        `;
      }
    }
  }

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
 // [Antigravity実装 2026-10-19] ケアプラン（#tabCarePlan）を追加
 const tabMap = {
 record: "tabCareRecord", write_single: "tabCareWriteSingle", daily_journal: "tabCareDailyJournal", vitals: "tabCareVitals", excretion: "tabCareExcretion",
 meal: "tabCareMeal", bath: "tabCareBath", oral: "tabCareOral", med: "tabCareMed",
 night: "tabCareNight", weight: "tabCareWeight", linen: "tabCareLinen",
 grooming: "tabCareGrooming", visit: "tabCareVisit", recreation: "tabCareRecreation",
 notebook: "tabCareNotebook", consume: "tabCareConsume", incidents: "tabCareIncidents", topical: "tabCareTopical",
 careplan: "tabCarePlan"
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
 if (tab === "careplan" && typeof renderCarePlanTab === "function") renderCarePlanTab(); // [Antigravity実装 2026-10-19]
}


// [Claude追加 2026-10-22] 横に並んだ一覧（利用者カードなど）を、マウスで押したまま左右に動かしてスクロールできるようにする
// - 押して5px以上動かしたときだけスクロール。そのときはカードを選ばない（ただのクリックは今までどおり選ぶ）
// - スマホ・タブレットの指のスクロールは今までどおり（マウスのときだけ動く）
const CP_DRAG_SCROLL_SELECTORS = [".residents-strip"];
let cpDragScroll = null;
let cpDragScrollSuppressClick = false;
document.addEventListener("mousedown", (e) => {
 if (e.button !== 0) return;
 const box = e.target && e.target.closest ? e.target.closest(CP_DRAG_SCROLL_SELECTORS.join(",")) : null;
 if (!box || box.scrollWidth <= box.clientWidth) return;
 if (e.target.closest("input, select, textarea")) return;
 cpDragScroll = { box: box, startX: e.clientX, startLeft: box.scrollLeft, moved: false };
});
document.addEventListener("mousemove", (e) => {
 if (!cpDragScroll) return;
 const dx = e.clientX - cpDragScroll.startX;
 if (!cpDragScroll.moved && Math.abs(dx) < 5) return;
 cpDragScroll.moved = true;
 cpDragScroll.box.classList.add("cp-drag-scrolling");
 cpDragScroll.box.scrollLeft = cpDragScroll.startLeft - dx;
 e.preventDefault(); // 文字が選ばれないように
});
document.addEventListener("mouseup", () => {
 if (!cpDragScroll) return;
 if (cpDragScroll.moved) {
  cpDragScrollSuppressClick = true;
  setTimeout(() => { cpDragScrollSuppressClick = false; }, 0);
 }
 cpDragScroll.box.classList.remove("cp-drag-scrolling");
 cpDragScroll = null;
});
document.addEventListener("click", (e) => {
 if (!cpDragScrollSuppressClick) return;
 cpDragScrollSuppressClick = false;
 e.stopPropagation();
 e.preventDefault();
}, true);
