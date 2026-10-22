// ==========================================================
// 要介護認定 有効期限・更新手続き進捗管理機能
// ==========================================================
function renderOfficeCareRenewal() {
  const tbody = document.querySelector("#careRenewalTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const filter = document.getElementById("careRenewalFilterSelect")?.value || "all";
  const search = (document.getElementById("careRenewalSearchInput")?.value || "").trim().toLowerCase();

  const today = new Date();
  today.setHours(0,0,0,0);

  let totalCount = 0;
  let urgentCount = 0;
  let warningCount = 0;
  let inProgressCount = 0;
  let completedCount = 0;

  cpCurrentResidents().forEach(r => {
    totalCount++;
    r.renewal_steps = r.renewal_steps || {
      application_submitted: false,
      visit_scheduled: false,
      doctor_statement: false,
      result_pending: false,
      completed: false
    };

    let daysDiff = 999;
    if (r.care_expiry_date) {
      const exp = new Date(r.care_expiry_date);
      exp.setHours(0,0,0,0);
      daysDiff = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));
    }

    if (daysDiff <= 30) urgentCount++;
    else if (daysDiff <= 60) warningCount++;

    const isStepsStarted = Object.values(r.renewal_steps).some(v => v === true);
    if (r.renewal_steps.completed) {
      completedCount++;
    } else if (isStepsStarted) {
      inProgressCount++;
    }

    // Filter matching
    if (search) {
      const matchName = (r.name || "").toLowerCase().includes(search);
      const matchRoom = (r.room_no || "").toLowerCase().includes(search);
      if (!matchName && !matchRoom) return;
    }

    if (filter === "urgent" && daysDiff > 30) return;
    if (filter === "warning" && (daysDiff <= 30 || daysDiff > 60)) return;
    if (filter === "in_progress" && (!isStepsStarted || r.renewal_steps.completed)) return;
    if (filter === "completed" && !r.renewal_steps.completed) return;

    // Render row
    const tr = document.createElement("tr");

    let daysBadge = "";
    if (r.care_expiry_date) {
      if (daysDiff < 0) {
        daysBadge = `<span class="badge" style="background:#dc2626; color:#fff;">期限切れ (${Math.abs(daysDiff)}日前)</span>`;
      } else if (daysDiff <= 30) {
        daysBadge = `<span class="badge" style="background:#dc2626; color:#fff;">残り ${daysDiff}日 (至急申請)</span>`;
      } else if (daysDiff <= 60) {
        daysBadge = `<span class="badge" style="background:#ea580c; color:#fff;">残り ${daysDiff}日 (注意)</span>`;
      } else {
        daysBadge = `<span class="badge" style="background:#16a34a; color:#fff;">残り ${daysDiff}日</span>`;
      }
    } else {
      daysBadge = `<span class="badge" style="background:#94a19a; color:#fff;">期限未設定</span>`;
    }

    const s = r.renewal_steps;

    tr.innerHTML = `
      <td><strong>${escapeHtml(r.room_no || '-')}号室</strong><br><span style="font-size:14px; font-weight:bold;">${escapeHtml(r.name || '-')}</span> 様</td>
      <td><span class="badge" style="background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd;">${escapeHtml(r.care_level || '要介護3')}</span></td>
      <td><strong>${r.care_expiry_date || '未設定'}</strong></td>
      <td>${daysBadge}</td>
      <td>
        <div style="display:flex; flex-wrap:wrap; gap:6px 12px; font-size:12px;">
          <label style="cursor:pointer; display:inline-flex; align-items:center; gap:3px;">
            <input type="checkbox" ${s.application_submitted ? 'checked' : ''} onchange="toggleCareRenewalStep(${r.id}, 'application_submitted')">
            <span>① 申請提出済</span>
          </label>
          <label style="cursor:pointer; display:inline-flex; align-items:center; gap:3px;">
            <input type="checkbox" ${s.visit_scheduled ? 'checked' : ''} onchange="toggleCareRenewalStep(${r.id}, 'visit_scheduled')">
            <span>② 訪問調査確定</span>
          </label>
          <label style="cursor:pointer; display:inline-flex; align-items:center; gap:3px;">
            <input type="checkbox" ${s.doctor_statement ? 'checked' : ''} onchange="toggleCareRenewalStep(${r.id}, 'doctor_statement')">
            <span>③ 意見書依頼済</span>
          </label>
          <label style="cursor:pointer; display:inline-flex; align-items:center; gap:3px;">
            <input type="checkbox" ${s.result_pending ? 'checked' : ''} onchange="toggleCareRenewalStep(${r.id}, 'result_pending')">
            <span>④ 認定結果待ち</span>
          </label>
          <label style="cursor:pointer; display:inline-flex; align-items:center; gap:3px; font-weight:bold; color:${s.completed?'#16a34a':'#4a5852'};">
            <input type="checkbox" ${s.completed ? 'checked' : ''} onchange="toggleCareRenewalStep(${r.id}, 'completed')">
            <span>⑤ 新認定反映完了</span>
          </label>
        </div>
      </td>
      <td>
        <button type="button" class="btn btn-primary" style="font-size:12px; padding:4px 10px; background:#0284c7; border-color:#0284c7;" onclick="openUpdateCareLevelModal(${r.id})">
          新認定へ更新
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  const summaryEl = document.getElementById("careRenewalSummaryCards");
  if (summaryEl) {
    summaryEl.innerHTML = `
      <div style="background:#ffffff; border:1px solid #dfe5e1; border-radius:8px; padding:12px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
        <div style="font-size:12px; color:#5f6d66;">対象利用者 総数</div>
        <div style="font-size:22px; font-weight:bold; color:#1c2622; margin-top:2px;">${totalCount} 名</div>
      </div>
      <div style="background:#fef2f2; border:1px solid #fca5a5; border-radius:8px; padding:12px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
        <div style="font-size:12px; color:#991b1b; font-weight:bold;">期限30日以内 (至急申請)</div>
        <div style="font-size:22px; font-weight:bold; color:#dc2626; margin-top:2px;">${urgentCount} 名</div>
      </div>
      <div style="background:#fff7ed; border:1px solid #fdba74; border-radius:8px; padding:12px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
        <div style="font-size:12px; color:#9a3412; font-weight:bold;">期限60日以内 (注意)</div>
        <div style="font-size:22px; font-weight:bold; color:#ea580c; margin-top:2px;">${warningCount} 名</div>
      </div>
      <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:12px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
        <div style="font-size:12px; color:#166534; font-weight:bold;">更新手続き完了</div>
        <div style="font-size:22px; font-weight:bold; color:#16a34a; margin-top:2px;">${completedCount} 名</div>
      </div>
    `;
  }
}

function toggleCareRenewalStep(residentId, stepKey) {
  const r = gState.residents.find(x => x.id === residentId);
  if (!r) return;
  r.renewal_steps = r.renewal_steps || {};
  r.renewal_steps[stepKey] = !r.renewal_steps[stepKey];
  db.data.residents = gState.residents;
  db.save();
  renderOfficeCareRenewal();
}

function openUpdateCareLevelModal(residentId) {
  const r = gState.residents.find(x => x.id === residentId);
  if (!r) return;
  document.getElementById("updateCareLevelResidentId").value = r.id;
  document.getElementById("updateCareLevelModalTitle").textContent = `要介護認定の更新登録 (${r.name} 様)`;
  document.getElementById("newCareLevelSelect").value = r.care_level || "";
  
  const defaultNextYear = new Date();
  defaultNextYear.setFullYear(defaultNextYear.getFullYear() + 1);
  const yyyy = defaultNextYear.getFullYear();
  const mm = String(defaultNextYear.getMonth() + 1).padStart(2, '0');
  const dd = String(defaultNextYear.getDate()).padStart(2, '0');
  document.getElementById("newCareExpiryDateInput").value = `${yyyy}-${mm}-${dd}`;

  openModal("updateCareLevelModal");
}

function submitUpdateCareLevelModal() {
  const residentId = Number(document.getElementById("updateCareLevelResidentId").value);
  const r = gState.residents.find(x => x.id === residentId);
  if (!r) return;

  if (!cpRequireSelect("newCareLevelSelect", "要介護度")) return;
  const newLevel = document.getElementById("newCareLevelSelect").value;
  const newExpiry = document.getElementById("newCareExpiryDateInput").value;

  if (!newExpiry) {
    alert("新しい認定有効期限を入力してください。");
    return;
  }

  r.care_level = newLevel;
  r.care_expiry_date = newExpiry;
  r.renewal_steps = {
    application_submitted: true,
    visit_scheduled: true,
    doctor_statement: true,
    result_pending: true,
    completed: true
  };

  db.data.residents = gState.residents;
  db.save();

  renderOfficeCareRenewal();
  if (typeof renderResidentsStrip === "function") renderResidentsStrip();
	initGlobalTimeSync();
	
  closeModal("updateCareLevelModal");
  alert(`【認定更新完了】\n${r.name} 様の要介護度を「${newLevel}」、有効期限を「${newExpiry}」に更新いたしました。`);
}

function printCareRenewalList() {
  window.print();
}


window.renderOfficeCareRenewal = renderOfficeCareRenewal;
window.toggleCareRenewalStep = toggleCareRenewalStep;
window.openUpdateCareLevelModal = openUpdateCareLevelModal;
window.submitUpdateCareLevelModal = submitUpdateCareLevelModal;
window.printCareRenewalList = printCareRenewalList;

window.openSupplierModal = openSupplierModal;
window.submitSupplierModal = submitSupplierModal;
window.deleteSupplier = deleteSupplier;
window.openSupplierItemModal = openSupplierItemModal;
window.submitSupplierItemModal = submitSupplierItemModal;
window.deleteSupplierItem = deleteSupplierItem;
// =====================================================================
// 【新規実装】認証・ホーム画面・アラート確認・対応ログ管理
// =====================================================================

// セッション状態
if (!gState.session) {
  gState.session = null;
}

// 自動ログアウトタイマー
let autoLogoutTimerId = null;
const AUTO_LOGOUT_MS = 15 * 60 * 1000; // 15分無操作で自動ログアウト

function startAutoLogoutTimer() {
  clearAutoLogoutTimer();
  autoLogoutTimerId = setTimeout(() => {
    // [Claude修正] 先に画面を閉じてから知らせる
    // (以前はお知らせのOKが押されるまで、利用者の情報が画面に出たままだった)
    handleLogout({ reason: "auto" });
  }, AUTO_LOGOUT_MS);
}

function clearAutoLogoutTimer() {
  if (autoLogoutTimerId) {
    clearTimeout(autoLogoutTimerId);
    autoLogoutTimerId = null;
  }
}

function resetAutoLogoutTimer() {
  if (gState.session) {
    startAutoLogoutTimer();
  }
}

// ユーザー操作イベントの監視 (15分延長)
["mousemove", "keydown", "touchstart", "click"].forEach(evt => {
  window.addEventListener(evt, () => resetAutoLogoutTimer(), { passive: true });
});


// 職員アカウントデータの初期化
function initStaffAccounts() {
  if (!Array.isArray(db.data.staff_accounts) || db.data.staff_accounts.length === 0) {
    const staffList = (db.data.stamps || []).map(s => s.name || s);
    const defaults = staffList.length > 0 ? staffList : [
      "木村 健一", "鈴木 美智子", "山田 孝之", "佐藤 健太", "加藤 由美",
      "高橋 直樹", "伊藤 翔太", "渡辺 拓也", "中村 大輔", "小林 亮",
      "斉藤 翼", "吉田 誠", "清水 翔平", "田中 慎一", "松本 陽子"
    ];
    db.data.staff_accounts = [];
    defaults.forEach(name => db.data.staff_accounts.push({
      id: name,
      staff_name: name,
      staff_id: cpNextFreeLoginId(db.data.staff_accounts),
      password: "0000",
      is_custom: false,
      updated_at: toLocalDateTimeStr(new Date())
    }));
  }
}

// ログイン画面の職員セレクトボックス描画

// [Claude修正 2026-10-18] ログイン画面に職員の名前の一覧は出さない（職員IDとパスワードだけでログイン）。施設名だけ出す
function renderLoginStaffSelect() {
  const facEl = document.getElementById("loginFacilityNameDisplay");
  if (!facEl) return;
  if (typeof db !== "undefined" && db.isServerMode && typeof cpApiFetch === "function") {
    cpApiFetch('/api/login-info', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(info => {
      if (info && info.facility_name) facEl.textContent = info.facility_name;
    }).catch(() => {});
  } else if (typeof db !== "undefined" && db.data && db.data.facility_name) {
    facEl.textContent = db.data.facility_name;
  }
}

// IDやパスワードを忘れたとき
function cpForgotLoginInfo() {
  alert("IDやパスワードを忘れたときは、管理者か事務員に伝えてください。\n\n管理者（または事務員）がログインして「職員アカウント・暗証番号管理」を開くと、IDを確かめたり、2名の承認でパスワードを初期値に戻したりできます。");
}
window.cpForgotLoginInfo = cpForgotLoginInfo;

// [Claude修正] サーバー稼働時は、ID・パスワードをサーバーで照合する
// (旧実装は端末内のデータで照合していたため、画面を通さずにデータを取得できた)
// [Claude修正 2026-10-16] ID・パスワード・暗証番号の欄：全角で打った英数字をその場で半角に直し、かな（日本語入力）になっていたら知らせる。
// パソコンの日本語入力をページ側から強制的に半角にすることはブラウザの決まりでできないため
const CP_HALFWIDTH_IDS = ["loginStaffIdInput", "loginPasswordInput", "staffAuthApprover1Pin", "staffAuthApprover2Pin",
  "initialPinCurrent", "initialPinNew", "initialPinConfirm", "accSetNewId", "accSetNewPw1", "accSetNewPw2",
  "resetAdminPin", "resetOfficePin", "facAdminPin", "facOfficePin"];
function cpToHalfWidth(str) {
  return String(str || "").replace(/[\uFF01-\uFF5E]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)).replace(/\u3000/g, " ");
}
function cpIsHalfwidthField(el) {
  return !!el && el.tagName === "INPUT" && (CP_HALFWIDTH_IDS.includes(el.id) || el.type === "password" || el.hasAttribute("data-cp-halfwidth"));
}
function cpImeWarn(el, show) {
  const box = (el.closest(".cp-pw-wrap") || el).parentNode;
  let w = box ? box.querySelector(`.cp-ime-warn[data-for="${el.id}"]`) : null;
  if (show && !w && box) {
    w = document.createElement("div");
    w.className = "cp-ime-warn";
    w.setAttribute("data-for", el.id);
    w.setAttribute("role", "alert");
    w.textContent = "日本語入力（全角・かな）になっています。キーボードの「半角/全角」キーで切り替えてください。";
    const after = el.closest(".cp-pw-wrap") || el;
    after.insertAdjacentElement("afterend", w);
  }
  if (w) w.style.display = show ? "" : "none";
}
function cpFixHalfwidth(el) {
  if (!cpIsHalfwidthField(el)) return;
  const v = el.value;
  const nv = cpToHalfWidth(v);
  if (nv !== v) {
    const pos = el.selectionStart;
    el.value = nv;
    try { if (pos !== null && el.type !== "password") el.setSelectionRange(pos, pos); } catch (e) {}
  }
  cpImeWarn(el, /[\u3040-\u30FF\u4E00-\u9FFF\uFF66-\uFF9F]/.test(el.value));
}
document.addEventListener("input", (e) => {
  if (e.isComposing) return;
  cpFixHalfwidth(e.target);
}, true);
document.addEventListener("compositionstart", (e) => {
  if (cpIsHalfwidthField(e.target)) cpImeWarn(e.target, true);
}, true);
document.addEventListener("compositionend", (e) => {
  if (cpIsHalfwidthField(e.target)) setTimeout(() => cpFixHalfwidth(e.target), 0);
}, true);
function cpHalfwidthAll() {
  CP_HALFWIDTH_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el && el.value) el.value = cpToHalfWidth(el.value);
  });
}
// ログインIDの「表示／隠す」
function cpToggleLoginIdVisible(btn) {
  const el = document.getElementById("loginStaffIdInput");
  if (!el) return;
  const show = el.type === "password";
  el.type = show ? "text" : "password";
  if (btn) {
    btn.textContent = show ? "隠す" : "表示";
    btn.setAttribute("aria-pressed", show ? "true" : "false");
  }
  el.focus();
}
window.cpToggleLoginIdVisible = cpToggleLoginIdVisible;

async function handleLoginSubmit() {
  cpHalfwidthAll();
  if (!db || !db.isServerMode) return handleLoginSubmitLocal();
  const staffId = (document.getElementById("loginStaffIdInput").value || "").trim();
  const password = (document.getElementById("loginPasswordInput").value || "").trim();
  if (!staffId) { alert("職員IDを入力してください。"); return; }
  if (!password || !/^\d{4}$/.test(password)) {
    alert("パスワードは半角数字4桁で入力してください。");
    return;
  }
  let res;
  try {
    res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ staff_id: staffId, password: password })
    });
  } catch (e) {
    alert("サーバーに接続できませんでした。親機PCのサーバーが起動しているか確認してください。");
    return;
  }
  let info = {};
  try { info = await res.json(); } catch (e) {}
  if (res.status === 423) {
    alert(`このIDは、10分のうちに5回まちがえたため、一時的に止めています。\n約${Math.ceil((info.retry_after || 300) / 60)}分後にもう一度お試しください。\n\n自分でまちがえた覚えがないときは、ほかの人が試した可能性があります。管理者に伝えてください。`);
    return;
  }
  // [Claude修正] 休止中 (ロック中) のアカウント
  if (res.status === 403 && info.error === "suspended") {
    alert("このアカウントは現在ロック（休止中）されています。\n管理者または事務員にお問い合わせください。");
    return;
  }
  if (!res.ok || !info.token) {
    const left = (typeof info.remaining === "number") ? `\n（10分のうちにあと${info.remaining}回まちがえると、このIDは5分間ログインできなくなります）` : "";
    alert("職員IDまたはパスワードが正しくありません。\nお忘れの場合は、管理者か事務員に伝えてください。" + left);
    return;
  }
  cpSetToken(info.token);
  await db.initServerSync();
  if (typeof reloadStateFromDb === "function") reloadStateFromDb();
  finishLoginUi(info.staff_name, staffId, !!info.is_custom);
}

// ログイン成功後の画面切り替え (サーバー照合・端末照合で共通)
function finishLoginUi(staffName, staffId, isCustom) {
  gState.session = {
    staffName: staffName,
    staffId: staffId,
    is_custom: isCustom,
    loggedInAt: toLocalDateTimeStr(new Date())
  };
  try {
    sessionStorage.setItem("carePortalSession", JSON.stringify(gState.session));
  } catch(e) {}
  const curStaffSelect = document.getElementById("currentStaff");
  if (curStaffSelect) curStaffSelect.value = staffName;
  const headerName = document.getElementById("headerStaffName");
  if (headerName) headerName.textContent = `${staffName} 様`;
  const btnSettings = document.getElementById("btnHeaderAccountSettings");
  if (btnSettings) btnSettings.style.display = !isCustom ? "inline-block" : "none";
  const loginSec = document.getElementById("loginSection");
  const mainWrap = document.getElementById("appMainWrapper");
  if (loginSec) loginSec.style.display = "none";
  if (mainWrap) mainWrap.style.display = "block";
  document.body.style.overflow = "";
  const pwInput = document.getElementById("loginPasswordInput");
  if (pwInput) pwInput.value = "";
  goToHome();
  startAutoLogoutTimer();
}

// ログイン実行 (サーバーを使わない単体動作時)
function handleLoginSubmitLocal() {
  cpHalfwidthAll(); // [Claude修正 2026-10-16]
  const staffId = (document.getElementById("loginStaffIdInput").value || "").trim();
  const password = (document.getElementById("loginPasswordInput").value || "").trim();

  if (!staffId) {
    alert("職員IDを入力してください。");
    return;
  }

  // 数字4文字チェック
  if (!password || !/^\d{4}$/.test(password)) {
    alert("パスワードは半角数字4桁で入力してください。");
    return;
  }

  initStaffAccounts();
  // [Claude修正 2026-10-18] 職員IDで本人を探す（同じIDが重なっていれば先の方）
  const acc = (db.data.staff_accounts || []).find(a => String(a.staff_id || "").toLowerCase() === staffId.toLowerCase());

  // IDとパスワードの照合（どちらが違うかは出さない）
  if (!acc || (acc.password || "0000") !== password || !(db.data.stamps || []).some(st => (st.name || st) === acc.staff_name)) {
    alert("職員IDまたはパスワードが正しくありません。\nお忘れの場合は、管理者か事務員に伝えてください。");
    return;
  }

  // ログイン成功
  gState.session = {
    staffName: acc.staff_name,
    staffId: acc.staff_id,
    is_custom: acc.is_custom,
    loggedInAt: toLocalDateTimeStr(new Date())
  };

  try {
    sessionStorage.setItem("carePortalSession", JSON.stringify(gState.session));
  } catch(e) {}

  // 担当職員をログイン者に自動固定
  const curStaffSelect = document.getElementById("currentStaff");
  if (curStaffSelect) {
    curStaffSelect.value = acc.staff_name;
  }

  // ヘッダー情報更新
  const headerName = document.getElementById("headerStaffName");
  if (headerName) headerName.textContent = `${acc.staff_name} 様`;

  // 初期値の時のみ「ID・PW設定」ボタンを表示
  const btnSettings = document.getElementById("btnHeaderAccountSettings");
  if (btnSettings) {
    btnSettings.style.display = !acc.is_custom ? "inline-block" : "none";
  }

  // 画面切り替え: ログイン画面を非表示、本体ラッパーを表示
  const loginSec = document.getElementById("loginSection");
  const mainWrap = document.getElementById("appMainWrapper");
  if (loginSec) loginSec.style.display = "none";
  if (mainWrap) mainWrap.style.display = "block";
  document.body.style.overflow = "";

  // ホーム画面を表示
  goToHome();

  // 自動ログアウトタイマー開始
  startAutoLogoutTimer();
}

// ログアウト実行
// [Claude修正] ログアウト (手動・15分の自動・ログインの有効期限切れ)
// ・まだ親機へ送れていない記録があれば、送り切ってからログアウトする。
//   手動のときに送れなければ、ログアウトするか確かめる (キャンセルで画面に戻る)
// ・自動・期限切れのときは、先に画面を閉じてから送る (席を外している間に情報が出たままにならないように)
// ・サーバー接続時は、端末に残った控えを消し、ページを読み込み直してメモリ上のデータも消す
let cpLogoutInProgress = false;
const CP_LOGOUT_NOTICE_KEY = "carePortalLogoutNotice";

function cpHideAppForLogout() {
  const mainWrap = document.getElementById("appMainWrapper");
  const loginSec = document.getElementById("loginSection");
  if (mainWrap) mainWrap.style.display = "none";
  if (loginSec) loginSec.style.display = "flex";
  document.body.style.overflow = "hidden";
  document.querySelectorAll(".modal-overlay").forEach(m => { m.style.display = "none"; });
}

// [Claude追加] ログアウトを押してから、記録を親機へ送り切るまで数秒〜十数秒かかることがあり、何も出ないので「押しても無反応」に見えていた
function cpShowLogoutBusy(show) {
 let el = document.getElementById("cpLogoutBusy");
 if (show) {
  if (!el) {
   el = document.createElement("div");
   el.id = "cpLogoutBusy";
   el.className = "cp-busy-overlay";
   el.setAttribute("role", "status");
   el.innerHTML = `<div class="cp-busy-box">ログアウトしています…<div class="cp-busy-sub">入力した記録を親機へ送っています。画面を閉じずにお待ちください。</div></div>`;
   document.body.appendChild(el);
  }
  el.style.display = "flex";
 } else if (el) {
  el.style.display = "none";
 }
}

function cpLogoutNoticeText(reason, unsentLost) {
  const parts = [];
  if (reason === "auto") parts.push("一定時間（15分）操作がなかったため、自動でログアウトしました。");
  if (reason === "expired") parts.push("ログインの有効期限が切れたか、サーバーが再起動されたため、ログアウトしました。\nお手数ですが、もう一度ログインしてください。");
  if (unsentLost) parts.push("【注意】親機に送れていない記録がありました（通信が切れていた可能性があります）。\nログイン後、入力した内容が記録に残っているかを確かめ、残っていなければ入力し直してください。");
  return parts.join("\n\n");
}

async function handleLogout(opts) {
  const reason = (opts && opts.reason) || "manual";
  if (cpLogoutInProgress) return;
  // [Claude追加] 未保存の服薬記録: 手動のログアウトでは聞く。自動ログアウト・期限切れでは消す（記録がない方はお知らせで気づける）
  if (reason === "manual" && typeof cpMedPendingGuard === "function") cpMedPendingGuard();
  if (gState.medPending) gState.medPending = {};
  cpLogoutInProgress = true;
  clearAutoLogoutTimer();
  try {
    const serverMode = !!(db && db.isServerMode);
    let unsentLost = false;
    if (serverMode) {
      if (reason === "manual") {
        cpShowLogoutBusy(true);
        let sent = false;
        try { sent = await db.flushUnsentChanges(); } finally { cpShowLogoutBusy(false); }
        if (!sent) {
          const go = confirm("まだ親機に送れていない記録があります（通信が切れている可能性があります）。\n\nこのままログアウトすると、この端末で入力した未送信の記録は消えます。\n\n［OK］ログアウトする\n［キャンセル］ログアウトせずに戻る（通信を確かめてから、もう一度ログアウトしてください）");
          if (!go) {
            cpLogoutInProgress = false;
            startAutoLogoutTimer();
            return;
          }
          unsentLost = true;
        }
        cpHideAppForLogout();
      } else {
        cpHideAppForLogout();
        // 期限切れのときはサーバーが受け付けないので送らない
        const sent = (reason === "auto") ? await db.flushUnsentChanges() : !db.hasUnsentChanges();
        unsentLost = !sent;
      }
      // サーバー側のセッションも破棄する
      if (cpGetToken()) {
        try { await fetch('/api/logout', { method: 'POST', headers: { 'X-Session-Token': cpGetToken() }, credentials: 'same-origin', keepalive: true }); } catch (e) {}
      }
    } else {
      cpHideAppForLogout();
    }

    cpSetToken("");
    gState.session = null;
    try {
      sessionStorage.removeItem("carePortalSession");
    } catch(e) {}

    const notice = cpLogoutNoticeText(reason, unsentLost);
    if (serverMode) {
      // 端末の控えを消し、ページを読み込み直してメモリ上のデータも消す。お知らせは読み込み後に出す
      try { if (notice) sessionStorage.setItem(CP_LOGOUT_NOTICE_KEY, notice); } catch (e) {}
      db.clearLocalCopy();
      window.location.reload();
      return;
    }

    const idInput = document.getElementById("loginStaffIdInput");
    const pwInput = document.getElementById("loginPasswordInput");
    if (idInput) idInput.value = "";
    if (pwInput) pwInput.value = "";

    renderLoginStaffSelect();
    cpLogoutInProgress = false;
    if (notice) alert(notice);
  } catch (e) {
    cpLogoutInProgress = false;
    console.warn("Logout error:", e);
  }
}

// [Claude修正] ログアウトで読み込み直した後に、お知らせを出す (ログイン画面の上に出る)
function cpShowLogoutNoticeOnLoad() {
  let msg = "";
  try {
    msg = sessionStorage.getItem(CP_LOGOUT_NOTICE_KEY) || "";
    sessionStorage.removeItem(CP_LOGOUT_NOTICE_KEY);
  } catch (e) {}
  if (msg) setTimeout(() => alert(msg), 300);
}

// ホーム画面への遷移
// [Claude修正 2026-10-16] ブラウザ・タブレットの「戻る」でアプリの外へ出てしまい、書きかけも消えていた。
// 画面を移るたびに履歴を残し、「戻る」でアプリの中の1つ前の画面（ホーム・ポータル・タブ）へ戻す。
// ホームでさらに「戻る」を押したときは「アプリを閉じますか？」と確認する。ログアウト中は画面を戻さない
let cpNavInited = false;
let cpNavRestoring = false;
let cpNavTimer = null;
function cpNavSnapshot() {
  const homeSec = document.getElementById("portalHomeSection");
  const atHome = homeSec && homeSec.style.display !== "none" && homeSec.offsetParent !== null;
  return atHome ? { p: "home" } : { p: gState.activePortal || "home", c: gState.activeCareTab || "", o: gState.activeOfficeTab || "" };
}
function cpNavSame(a, b) {
  return !!a && !!b && a.p === b.p && (a.p === "home" || a.p === "guard" || (a.p === "care" ? a.c === b.c : a.o === b.o));
}
function cpNavInit() {
  if (cpNavInited || !gState.session || !window.history || !history.pushState) return;
  cpNavInited = true;
  history.replaceState({ cp: { p: "guard" } }, "");
  history.pushState({ cp: cpNavSnapshot() }, "");
}
function cpNavRecord() {
  if (!cpNavInited || cpNavRestoring) return;
  clearTimeout(cpNavTimer);
  // 1回の操作で複数の切り替えが続くことがあるので、落ち着いてから1つだけ残す
  cpNavTimer = setTimeout(() => {
    if (cpNavRestoring || !gState.session) return;
    const snap = cpNavSnapshot();
    const cur = history.state && history.state.cp;
    if (cpNavSame(cur, snap)) return;
    history.pushState({ cp: snap }, "");
  }, 0);
}
window.addEventListener("popstate", (e) => {
  const st = e.state && e.state.cp;
  if (!st || !cpNavInited) return;
  if (!gState.session) return; // ログアウト中は画面を戻さない
  // 開いている画面（入力の小窓）があるときは、閉じずにそのまま（入力が消えないように）
  const openModal = [...document.querySelectorAll(".modal-overlay")].some(m => m.style.display && m.style.display !== "none");
  if (openModal) {
    history.pushState({ cp: cpNavSnapshot() }, "");
    return;
  }
  if (st.p === "guard") {
    if (confirm("アプリを閉じますか？\n（書きかけの内容は保存されません）")) {
      cpNavInited = false;
      history.back();
    } else {
      history.pushState({ cp: cpNavSnapshot() }, "");
    }
    return;
  }
  cpNavRestoring = true;
  try {
    if (st.p === "home") {
      goToHome();
    } else if (st.p === "care") {
      enterPortal("care");
      if (st.c && gState.activeCareTab !== st.c) switchCareTab(st.c);
    } else if (st.p === "office") {
      enterPortal("office");
      if (st.o && gState.activeOfficeTab !== st.o) switchOfficeTab(st.o);
    }
  } finally {
    setTimeout(() => { cpNavRestoring = false; }, 0);
  }
});

function goToHome() {
  if (typeof cpMedPendingGuard === "function") cpMedPendingGuard();
  const homeSec = document.getElementById("portalHomeSection");
  const careSec = document.getElementById("portalCareSection");
  const officeSec = document.getElementById("portalOfficeSection");

  if (homeSec) homeSec.style.display = "block";
  if (careSec) careSec.style.display = "none";
  if (officeSec) officeSec.style.display = "none";

  // ホーム画面情報の更新
  const homeFac = document.getElementById("homeFacilityNameDisplay");
  if (homeFac && typeof getFacilityName === "function") {
    homeFac.textContent = getFacilityName();
  }

  const homeDate = document.getElementById("homeTodayDateDisplay");
  if (homeDate) {
    homeDate.textContent = toLocalDateStr(new Date());
  }

  const homeStaff = document.getElementById("homeLoggedInStaffDisplay");
  if (homeStaff && gState.session) {
    homeStaff.textContent = `${gState.session.staffName} 様`;
  }
  // [Claude修正 2026-10-16] 戻るボタン用の履歴（ホームを表示してから記録する）
  cpNavInit();
  cpNavRecord();
}

// ポータルへ入る
function enterPortal(portalType) {
  if (portalType !== "care" && typeof cpMedPendingGuard === "function") cpMedPendingGuard();
  cpNavRecord(); // [Claude修正 2026-10-16] 戻るボタン用の履歴
  const homeSec = document.getElementById("portalHomeSection");
  const careSec = document.getElementById("portalCareSection");
  const officeSec = document.getElementById("portalOfficeSection");

  if (portalType === "care") {
    if (homeSec) homeSec.style.display = "none";
    if (careSec) careSec.style.display = "block";
    if (officeSec) officeSec.style.display = "none";
    gState.activePortal = "care";
    if (typeof loadDateRecords === "function") loadDateRecords(gState.selectedDate || toLocalDateStr(new Date()));
  } else if (portalType === "office") {
    if (homeSec) homeSec.style.display = "none";
    if (careSec) careSec.style.display = "none";
    if (officeSec) officeSec.style.display = "block";
    gState.activePortal = "office";
    if (typeof loadOfficeData === "function") loadOfficeData();
  }
}

// ---------------------------------------------------------------------
// ID・パスワードの個別設定 (設定完了後は非表示)
// ---------------------------------------------------------------------
function openAccountSettingsModal() {
  if (!gState.session) {
    alert("ログインが必要です。");
    return;
  }
  document.getElementById("accSetStaffName").textContent = `${gState.session.staffName} 様`;
  document.getElementById("accSetNewId").value = "";
  document.getElementById("accSetNewPw1").value = "";
  document.getElementById("accSetNewPw2").value = "";
  openModal("accountSettingsModal");
}

function submitAccountSettings() {
  if (!gState.session) return;
  const staffName = gState.session.staffName;
  const newId = (document.getElementById("accSetNewId").value || "").trim();
  const pw1 = (document.getElementById("accSetNewPw1").value || "").trim();
  const pw2 = (document.getElementById("accSetNewPw2").value || "").trim();

  // バリデーション
  if (!newId || !/^[a-zA-Z]{4,}$/.test(newId)) {
    alert("新しいIDは半角英字（ローマ字）4文字以上で入力してください。");
    return;
  }
  if (!pw1 || !/^\d{4}$/.test(pw1)) {
    alert("新しいパスワードは半角数字4桁で入力してください。");
    return;
  }
  if (pw1 !== pw2) {
    alert("パスワードが確認用と一致しません。再度ご確認ください。");
    return;
  }
  // [Claude追加 2026-10-18] ほかの職員と同じIDは使えない（IDで本人を決めるため）
  if ((db.data.staff_accounts || []).some(a => a && a.staff_name !== staffName && String(a.staff_id || "").toLowerCase() === newId.toLowerCase())) {
    alert("そのIDは、ほかの職員が使っています。別のIDにしてください。");
    return;
  }

  // 確認ダイアログ
  const confirmMsg = `【確認】\n職員名: ${staffName}\n新しいID: ${newId}\n新しいパスワード: ****\n\nこの内容で設定します。よろしいですか？\n※設定完了後は画面上の変更ボタンが非表示になります。`;
  if (!confirm(confirmMsg)) return;

  initStaffAccounts();
  const acc = (db.data.staff_accounts || []).find(a => a.staff_name === staffName);
  if (acc) {
    acc.staff_id = newId;
    acc.password = pw1;
    acc.is_custom = true;
    acc.updated_at = toLocalDateTimeStr(new Date());
  }

  gState.session.staffId = newId;
  gState.session.is_custom = true;

  try {
    sessionStorage.setItem("carePortalSession", JSON.stringify(gState.session));
  } catch(e) {}

  db.save();

  // 設定ボタンを非表示化
  const btnSettings = document.getElementById("btnHeaderAccountSettings");
  if (btnSettings) btnSettings.style.display = "none";

  closeModal("accountSettingsModal");
  alert(`ID・パスワードの設定が完了しました！\n次回からは 新ID「${newId}」でログインしてください。`);
}

// ---------------------------------------------------------------------
// 2名承認によるID・パスワード初期化 (リセット)
// ---------------------------------------------------------------------
function renderResetStaffSelects() {
  const targetSel = document.getElementById("resetTargetStaffSelect");
  const adminSel = document.getElementById("resetApproverAdmin");
  const officeSel = document.getElementById("resetApproverOffice");
  if (!targetSel || !adminSel || !officeSel) return;

  adminSel.innerHTML = "<option value=\"\">選んでください</option>";
  officeSel.innerHTML = "<option value=\"\">選んでください</option>";

  // [Claude修正 2026-10-18] ログインしてから使う（職員の一覧はログイン前に出さない）
  const useServerList = false;
  const accounts = db.data.staff_accounts || [];

  // [Claude修正] 承認者は職員マスタの役職で絞り込む (旧実装は全職員が「管理者」「事務員」として表示されていた)
  const roleOf = (name) => {
    if (useServerList) {
      const si = gState.loginStaffInfo.find(x => x.name === name);
      return si ? (si.role || "") : "";
    }
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

function openAccountResetModal(targetName) {
  if (!gState.session) { cpForgotLoginInfo(); return; }
  if (!targetName) return;
  initStaffAccounts();
  renderResetStaffSelects();
  const tSel = document.getElementById("resetTargetStaffSelect");
  if (tSel) tSel.value = targetName;
  const tName = document.getElementById("resetTargetStaffName");
  if (tName) tName.textContent = `${targetName} 様`;
  const p1 = document.getElementById("resetAdminPin");
  const p2 = document.getElementById("resetOfficePin");
  if (p1) p1.value = "";
  if (p2) p2.value = "";
  openModal("accountResetModal");
}

function executeAccountReset() {
  const targetStaff = document.getElementById("resetTargetStaffSelect").value;
  const adminStaff = document.getElementById("resetApproverAdmin").value;
  const officeStaff = document.getElementById("resetApproverOffice").value;
  const adminPin = (document.getElementById("resetAdminPin").value || "").trim();
  const officePin = (document.getElementById("resetOfficePin").value || "").trim();

  if (!targetStaff) {
    alert("初期化する対象職員を選択してください。");
    return;
  }

  // 暗証番号チェック (数字4桁)
  if (!adminPin || adminPin.length !== 4 || !officePin || officePin.length !== 4) {
    alert("管理者・事務員それぞれの暗証番号（4桁）を入力してください。");
    return;
  }

  if (!adminStaff || !officeStaff) {
    alert("承認者（管理者・事務員）を選んでください。");
    return;
  }
  if (adminStaff === officeStaff) {
    alert("承認者1と承認者2には別の職員を選択してください（2名による承認が必要です）。");
    return;
  }

  // [Claude修正] サーバー稼働時は、承認者の暗証番号の照合と初期化をサーバーで行う
  if (db && db.isServerMode) {
    executeAccountResetOnServer(targetStaff, adminStaff, adminPin, officeStaff, officePin);
    return;
  }

  // [Claude修正] 旧実装は4桁であればどの番号でも通っていた。承認者それぞれの暗証番号 (職員マスタ) と照合する
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
    alert("承認者の暗証番号が一致しません。初期化は行っていません。");
    return;
  }

  const confirmMsg = `【重大確認】\n対象職員「${targetStaff}」様のパスワードを初期値に戻します（IDはそのまま）。\n\n承認者1: ${adminStaff}\n承認者2: ${officeStaff}\n\n実行してよろしいですか？`;
  if (!confirm(confirmMsg)) return;

  initStaffAccounts();
  const acc = (db.data.staff_accounts || []).find(a => a.staff_name === targetStaff);
  if (acc) {
    acc.password = "0000"; // [Claude修正 2026-10-18] IDはそのまま、パスワードだけ初期値に
    acc.is_custom = false;
    acc.updated_at = toLocalDateTimeStr(new Date());
  }

  // もし現在ログイン中ならボタンを再表示
  if (gState.session && gState.session.staffName === targetStaff) {
    gState.session.is_custom = false;
    const btnSettings = document.getElementById("btnHeaderAccountSettings");
    if (btnSettings) btnSettings.style.display = "inline-block";
  }

  db.save();
  closeModal("accountResetModal");
  alert(`「${targetStaff}」様のパスワードを初期値に戻しました。\nIDはそのままです。初期のパスワード（取扱説明書を参照）でログインしたあと、新しく設定してもらってください。`);
  renderLoginStaffSelect();
}

async function executeAccountResetOnServer(targetStaff, adminStaff, adminPin, officeStaff, officePin) {
  const confirmMsg = `【重大確認】\n対象職員「${targetStaff}」様のパスワードを初期値に戻します（IDはそのまま）。\n\n承認者1: ${adminStaff}\n承認者2: ${officeStaff}\n\n実行してよろしいですか？`;
  if (!confirm(confirmMsg)) return;
  let res;
  try {
    res = await fetch('/api/account-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: targetStaff, admin: adminStaff, admin_pin: adminPin, office: officeStaff, office_pin: officePin })
    });
  } catch (e) {
    alert("サーバーに接続できませんでした。");
    return;
  }
  if (res.status === 423) {
    alert("承認の失敗が続いたため、一時的にロックしています。5分ほどおいてからお試しください。");
    return;
  }
  if (!res.ok) {
    alert("承認者の暗証番号が一致しないか、承認者の役職が正しくありません。初期化は行っていません。");
    return;
  }
  closeModal("accountResetModal");
  alert(`「${targetStaff}」様のパスワードを初期値に戻しました。\nIDはそのままです。初期のパスワード（取扱説明書を参照）でログインしたあと、新しく設定してもらってください。`);
  renderLoginStaffSelect();
}

// ---------------------------------------------------------------------
// アラート閉じる確認モーダル ＆ アラートログ・復旧
// ---------------------------------------------------------------------
let pendingDismissAlertData = null;

function requestDismissAlert(alertKey, alertTitle, alertDetail) {
  pendingDismissAlertData = {
    key: alertKey,
    title: alertTitle || "警告アラート",
    detail: alertDetail || "内容の確認"
  };

  const keyEl = document.getElementById("pendingAlertDismissKey");
  const titleEl = document.getElementById("alertConfirmTitle");
  const detailEl = document.getElementById("alertConfirmDetail");

  if (keyEl) keyEl.value = alertKey;
  if (titleEl) titleEl.textContent = pendingDismissAlertData.title;
  if (detailEl) detailEl.textContent = pendingDismissAlertData.detail;

  openModal("alertConfirmModal");
}

function executeDismissAlert() {
  if (!pendingDismissAlertData) {
    closeModal("alertConfirmModal");
    return;
  }

  const key = pendingDismissAlertData.key;
  const title = pendingDismissAlertData.title;
  const detail = pendingDismissAlertData.detail;
  const staffName = (gState.session && gState.session.staffName) ? gState.session.staffName : "担当者";

  // 1. 対応ログに記録 (誰が・いつ閉じたか)
  if (!Array.isArray(db.data.alert_logs)) {
    db.data.alert_logs = [];
  }

  db.data.alert_logs.unshift({
    id: Date.now(),
    alert_key: key,
    alert_title: title,
    alert_detail: detail,
    staff_name: staffName,
    dismissed_at: toLocalDateTimeStr(new Date())
  });

  // 2. アラートを閉じる (保存も行われる)。「全て閉じる」は複数のキーをまとめて閉じる
  const keys = Array.isArray(key) ? key : [key];
  if (typeof dismissAlerts === "function") {
    dismissAlerts(keys);
  } else {
    db.save();
  }
  closeModal("alertConfirmModal");
  pendingDismissAlertData = null;

  // アラート再描画
  if (typeof checkGlobalAlerts === "function") {
    checkGlobalAlerts();
  }
}

// アラート対応ログ一覧の表示
function openAlertLogModal() {
  const tbody = document.getElementById("alertLogTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const logs = db.data.alert_logs || [];
  if (logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:20px;">閉じたアラートの履歴はありません。</td></tr>`;
  } else {
    logs.forEach(l => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>
          <div style="font-weight:bold; font-size:12.5px; color:#22302b;">${escapeHtml(l.alert_title)}</div>
          <div style="font-size:11.5px; color:#5f6d66; margin-top:2px;">${escapeHtml(l.alert_detail || String(l.alert_key))}</div>
        </td>
        <td style="font-size:12px; font-weight:bold; color:#1c2622;">${escapeHtml(l.staff_name)}</td>
        <td style="font-size:11.5px; color:#5f6d66;">${escapeHtml(l.dismissed_at)}</td>
        <td style="text-align:center;">
          ${l.restored_at ? `<div style="font-size:11px; color:#5f6d66;">未対応に戻した<br>${escapeHtml(l.restored_at)} ${escapeHtml(l.restored_by || '')}</div>` : `<button type="button" class="btn btn-secondary" style="font-size:11px; padding:2px 8px; color:#0284c7; border-color:#bae6fd;" onclick="restoreAlert(${l.id})">復旧</button>`}
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  openModal("alertLogModal");
}

// [Claude修正] アラートの「閉じる」ボタンから確認画面を開く。
// (確認画面と対応ログの仕組みは作られていたが、どのボタンからも呼ばれておらず、
//  閉じても確認が出ず、対応ログにも記録されていなかった)
function requestDismissAlertFromButton(btn, keyOrKeys) {
  const banner = btn && btn.closest ? btn.closest(".alert-banner") : null;
  let detail = "";
  if (banner) {
    const clone = banner.cloneNode(true);
    clone.querySelectorAll("button").forEach(b => b.remove());
    detail = (clone.innerText || clone.textContent || "").replace(/\s+/g, " ").trim();
  }
  const m = detail.match(/【([^】]+)】/);
  const title = m ? m[1] : "警告アラート";
  requestDismissAlert(keyOrKeys, title, detail);
}

// アラートの復旧 (未対応状態に戻す)
function restoreAlert(logId) {
  const logs = db.data.alert_logs || [];
  const target = logs.find(l => l.id === logId);
  if (!target || target.restored_at) return;

  if (!confirm(`【確認】\nこのアラート（${target.alert_title}）を未対応状態に戻しますか？\n画面上に再び警告が表示されます。`)) {
    return;
  }

  // undismissAlert で復旧 (複数キーの場合はすべて)
  if (typeof undismissAlert === "function") {
    (Array.isArray(target.alert_key) ? target.alert_key : [target.alert_key]).forEach(k => undismissAlert(k));
  }

  // [Claude修正] ログは消さずに「未対応に戻した」日時と職員を残す
  target.restored_at = toLocalDateTimeStr(new Date());
  target.restored_by = cpLedgerStaff();
  db.save();

  openAlertLogModal(); // ログ表の更新
  if (typeof checkGlobalAlerts === "function") {
    checkGlobalAlerts(); // 画面上アラートの復活
  }

  alert("アラートを未対応状態に復旧しました。画面上に再表示されます。");
}

// ---------------------------------------------------------------------
// 既存セッションの復元 (リロード対策)
// ---------------------------------------------------------------------
function restoreSessionOnLoad() {
  cpShowLogoutNoticeOnLoad();
  try {
    const saved = sessionStorage.getItem("carePortalSession");
    // [Claude修正] サーバー稼働時は、サーバーの鍵 (トークン) が無ければログイン画面に戻す
    if (saved && db && db.isServerMode && !cpGetToken()) {
      sessionStorage.removeItem("carePortalSession");
    } else if (saved) {
      const sess = JSON.parse(saved);
      if (sess && sess.staffName) {
        gState.session = sess;

        const curStaffSelect = document.getElementById("currentStaff");
        if (curStaffSelect) curStaffSelect.value = sess.staffName;

        const headerName = document.getElementById("headerStaffName");
        if (headerName) headerName.textContent = `${sess.staffName} 様`;

        const btnSettings = document.getElementById("btnHeaderAccountSettings");
        if (btnSettings) {
          btnSettings.style.display = (!sess.is_custom || (sess.staffId === "aaaa")) ? "inline-block" : "none";
        }

        const loginSec = document.getElementById("loginSection");
        const mainWrap = document.getElementById("appMainWrapper");
        if (loginSec) loginSec.style.display = "none";
        if (mainWrap) mainWrap.style.display = "block";

        goToHome();
        startAutoLogoutTimer();
        return;
      }
    }
  } catch(e) {}

  // 未ログイン時
  const loginSec = document.getElementById("loginSection");
  const mainWrap = document.getElementById("appMainWrapper");
  if (loginSec) loginSec.style.display = "flex";
  if (mainWrap) mainWrap.style.display = "none";
  document.body.style.overflow = "hidden";
  renderLoginStaffSelect();
}

// アプリ初期化時にセッション復元
window.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => {
    restoreSessionOnLoad();
  }, 100);
});

// グローバル公開
window.handleLoginSubmit = handleLoginSubmit;
window.handleLogout = handleLogout;
window.goToHome = goToHome;
window.enterPortal = enterPortal;
window.openAccountSettingsModal = openAccountSettingsModal;
window.submitAccountSettings = submitAccountSettings;
window.openAccountResetModal = openAccountResetModal;
window.executeAccountReset = executeAccountReset;
window.requestDismissAlert = requestDismissAlert;
window.executeDismissAlert = executeDismissAlert;
window.openAlertLogModal = openAlertLogModal;
window.restoreAlert = restoreAlert;
// （職員名の選択はなくなった 2026-10-18）
// 第2段階 グローバル公開
window.openFacilityNameModal = openFacilityNameModal;
window.executeFacilityNameChange = executeFacilityNameChange;
window.updateItemAlertThreshold = updateItemAlertThreshold;
// =====================================================================
// 介護サマリー 新旧比較機能 (左右任意日付選択・例文プレビュー)
// =====================================================================

function openCareSummaryCompareModal(targetResId) {
  if (targetResId !== undefined && targetResId !== null && targetResId !== "") {
    gState.selectedResidentId = Number(targetResId);
  }
  const r = (gState.residents || []).find(x => Number(x.id) === Number(gState.selectedResidentId));
  const badge = document.getElementById("compareResidentBadge");
  if (badge) badge.textContent = r ? `${r.room_no}号室 ${r.name} 様` : "利用者";

  const sel1 = document.getElementById("compareSelect1") || document.getElementById("compareSelectLeft");
  const sel2 = document.getElementById("compareSelect2") || document.getElementById("compareSelectRight");
  const sel3 = document.getElementById("compareSelect3");
  if (!sel1 || !sel2) return;

  sel1.innerHTML = "";
  sel2.innerHTML = "";
  if (sel3) sel3.innerHTML = "";

  // 対象利用者のサマリー履歴を取得
  let summaries = (db.data.care_summaries || []).filter(s => Number(s.resident_id) === Number(gState.selectedResidentId));

  if (summaries.length === 0) {
    alert("この利用者の介護サマリーはまだありません。サマリーを作成すると比較ができます。");
    return;
  }
  // ソート (古い順)
  summaries.sort((a, b) => (a.created_at || a.date || "").localeCompare(b.created_at || b.date || "") || (Number(a.id) - Number(b.id)));

  summaries.forEach((s) => {
    const text = `[${s.created_at || s.date || '-'}] ${s.summary_type || 'サマリー'}${s.previous_id ? ' (更新版)' : ''} (${s.staff_name || '担当'})`;
    const opt1 = document.createElement("option"); opt1.value = s.id; opt1.textContent = text; sel1.appendChild(opt1);
    const opt2 = document.createElement("option"); opt2.value = s.id; opt2.textContent = text; sel2.appendChild(opt2);
    if (sel3) {
      const opt3 = document.createElement("option"); opt3.value = s.id; opt3.textContent = text; sel3.appendChild(opt3);
    }
  });

  if (sel3) {
    const optNone = document.createElement("option");
    optNone.value = "none";
    optNone.textContent = "（なし - 2列で比較）";
    sel3.appendChild(optNone);
  }

  // 初期選択:
  // 3件以上ある場合: 1st=最古(初回), 2nd=中間, 3rd=最新
  if (summaries.length >= 3) {
    // [Claude修正] 4件以上でも「初回・最新の1つ前・最新」を選ぶ（以前は先頭から3件で、最新が出なかった）
    sel1.selectedIndex = 0;
    sel2.selectedIndex = summaries.length - 2;
    if (sel3) {
      sel3.selectedIndex = summaries.length - 1;
    }
  } else if (summaries.length === 2) {
    sel1.selectedIndex = 0;
    sel2.selectedIndex = 1;
    if (sel3) sel3.value = "none";
  } else {
    sel1.selectedIndex = 0;
    sel2.selectedIndex = 0;
    if (sel3) sel3.value = "none";
  }

  renderCompareView();
  openModal("careSummaryCompareModal");
  if (summaries.length === 1) {
    alert("この利用者の介護サマリーは1件のみです。サマリーを更新（新規作成）すると、新旧を比較できます。");
  }
}

function renderCompareView() {
  const sel1 = document.getElementById("compareSelect1") || document.getElementById("compareSelectLeft");
  const sel2 = document.getElementById("compareSelect2") || document.getElementById("compareSelectRight");
  const sel3 = document.getElementById("compareSelect3");
  const container = document.getElementById("compareContentContainer");
  if (!container || !sel1 || !sel2) return;

  const id1 = Number(sel1.value);
  const id2 = Number(sel2.value);
  const id3 = sel3 && sel3.value !== "none" ? Number(sel3.value) : null;

  const s1 = (db.data.care_summaries || []).find(s => Number(s.id) === id1);
  const s2 = (db.data.care_summaries || []).find(s => Number(s.id) === id2);
  const s3 = id3 ? (db.data.care_summaries || []).find(s => Number(s.id) === id3) : null;

  const has3Cols = s3 !== null && s3 !== undefined;

  const sections = [
    { title: "1. サマリー基本情報・区分", key: "basic_info", sub: "要介護度、生年月日、キーパーソン、自立度区分" },
    { title: "2. 入所の経緯・病歴", key: "background", sub: "既往歴、骨折・入院経緯、在宅時状況" },
    { title: "3. 身体機能 ＆ 認知機能", key: "physical_cognitive", sub: "麻痺、拘縮、歩行能力、記憶、見当識" },
    { title: "4. ADL (日常生活動作)", key: "adl", sub: "移動、移乗、立ち上がり、更衣、整容、入浴" },
    { title: "5. 食事 ＆ 水分摂取", key: "meals_hydration", sub: "食形態、自力摂取、むせ、嚥下、目標水分量" },
    { title: "6. 排泄状況", key: "excretion", sub: "トイレ誘導、リハパン・パッド、排便リズム、失禁状況" },
    { title: "7. 睡眠リズム", key: "sleep", sub: "就寝・起床時間、夜間覚醒、センサーマット、良眠度" },
    { title: "8. 定期服薬", key: "meds", sub: "処方薬、配薬確認、自己内服、服薬ゼリー等" },
    { title: "9. 医療処置・創傷ケア", key: "medical_care", sub: "バイタル測定、術創、褥瘡・発赤、軟膏・湿布" },
    { title: "10. 認知症BPSD・心理特徴", key: "dementia_behavior", sub: "帰宅願望、せん妄、不安時の対応方法" },
    { title: "11. ケア上の留意事項", key: "care_notes", sub: "転倒予防、声かけの注意点、好み・職人歴等" },
    { title: "12. 家族意向・連絡方針", key: "family_info", sub: "面会頻度、緊急連絡先、看取り合意方針" },
    { title: "13. 今後のケア目標", key: "future_goals", sub: "自立支援、ADL維持目標、社会参加・レク" }
  ];

  let rowsHtml = "";
  sections.forEach((sec, idx) => {
    const v1 = s1 ? (s1[sec.key] || "（未記入）") : "—";
    const v2 = s2 ? (s2[sec.key] || "（未記入）") : "—";
    const v3 = has3Cols ? (s3 ? (s3[sec.key] || "（未記入）") : "—") : null;

    const diff12 = v1 !== v2;
    const diff23 = has3Cols && (v2 !== v3);

    let badgeHtml = "";
    if (diff12 && diff23) {
      badgeHtml = `<span class="badge" style="display:inline-block; font-size:10.5px; background:var(--sun-tint); color:var(--ink); padding:2px 6px; border-radius:10px; font-weight:bold; margin-top:4px;">各時期で変化あり</span>`;
    } else if (diff12) {
      badgeHtml = `<span class="badge" style="display:inline-block; font-size:10.5px; background:var(--pine-tint); color:var(--pine); padding:2px 6px; border-radius:10px; font-weight:bold; margin-top:4px;">①→②で変化</span>`;
    } else if (diff23) {
      badgeHtml = `<span class="badge" style="display:inline-block; font-size:10.5px; background:var(--caution-tint); color:var(--caution); padding:2px 6px; border-radius:10px; font-weight:bold; margin-top:4px;">②→③で変化</span>`;
    }

    const fmtText = (val) => {
      return escapeHtml(val).replace(/\n/g, '<br>');
    };

    rowsHtml += `
      <tr style="${idx % 2 === 1 ? 'background:#f9faf9;' : 'background:#ffffff;'}">
        <td style="width:160px; min-width:140px; vertical-align:top; border-right:1px solid var(--line); padding:10px 12px;">
          <div style="font-weight:bold; font-size:13px; color:var(--ink);">${escapeHtml(sec.title)}</div>
          <div style="font-size:11px; color:var(--ink-3); margin-top:2px;">${escapeHtml(sec.sub)}</div>
          ${badgeHtml}
        </td>
        <td style="vertical-align:top; border-right:1px solid var(--line); padding:10px 12px; font-size:12.5px; color:var(--ink); line-height:1.6; background:${diff12 ? 'var(--ground)' : 'transparent'};">
          ${fmtText(v1)}
        </td>
        <td style="vertical-align:top; ${has3Cols ? 'border-right:1px solid var(--line);' : ''} padding:10px 12px; font-size:12.5px; color:var(--ink); line-height:1.6; background:${diff12 ? 'var(--pine-tint-2)' : 'transparent'};">
          ${fmtText(v2)}
        </td>
        ${has3Cols ? `
        <td style="vertical-align:top; padding:10px 12px; font-size:12.5px; color:var(--ink); line-height:1.6; background:${diff23 ? 'var(--caution-tint)' : (diff12 ? 'var(--pine-tint-2)' : 'transparent')};">
          ${fmtText(v3)}
        </td>` : ''}
      </tr>
    `;
  });

  const header1 = s1 ? `${escapeHtml(s1.summary_type)} [${escapeHtml(s1.created_at || s1.date || '')}] (${escapeHtml(s1.staff_name || '')})` : '-';
  const header2 = s2 ? `${escapeHtml(s2.summary_type)} [${escapeHtml(s2.created_at || s2.date || '')}] (${escapeHtml(s2.staff_name || '')})` : '-';
  const header3 = has3Cols && s3 ? `${escapeHtml(s3.summary_type)} [${escapeHtml(s3.created_at || s3.date || '')}] (${escapeHtml(s3.staff_name || '')})` : '-';

  container.innerHTML = `
    <table class="data-table" style="margin:0; width:100%; border-collapse:collapse;">
      <thead>
        <tr style="background:#eef2ef; border-bottom:2px solid var(--line-2);">
          <th style="width:160px; min-width:140px; font-size:12.5px;">評価項目</th>
          <th style="font-size:12.5px; color:var(--pine-dark); text-align:left;">【比較1】${header1}</th>
          <th style="font-size:12.5px; color:var(--pine); text-align:left;">【比較2】${header2}</th>
          ${has3Cols ? `<th style="font-size:12.5px; color:#9a3412; text-align:left;">【比較3】${header3}</th>` : ''}
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
  `;
}


window.openCareSummaryCompareModal = openCareSummaryCompareModal;
window.renderCompareView = renderCompareView;
if (typeof window !== "undefined") {
  window.toggleStaffAccountStatus = toggleStaffAccountStatus;
  window.openResetStaffPinModal = openResetStaffPinModal;
  window.submitTwoPersonReset = submitTwoPersonReset;
}

window.openAddMonthlyNoticeUpdateModal = openAddMonthlyNoticeUpdateModal;
window.submitMonthlyNoticeUpdate = submitMonthlyNoticeUpdate;

window.confirmDailyNotebookItem = confirmDailyNotebookItem;
window.openAddDailyNotebookUpdateModal = openAddDailyNotebookUpdateModal;
window.submitDailyNotebookUpdate = submitDailyNotebookUpdate;
window.deleteDailyNotebookItem = deleteDailyNotebookItem;
window.syncGlobalTimeToNow = syncGlobalTimeToNow;
window.onGlobalTimeChange = onGlobalTimeChange;
window.initGlobalTimeSync = initGlobalTimeSync;
// 行事・予定の登録モーダル
function openShiftEventModal(yearMonth, day) {
  if (typeof cpShiftAdminOnly === "function" && !cpShiftAdminOnly("勤務表の行事・予定")) return; // [Claude追加 2026-10-22]
  const ym = yearMonth || getShiftYearMonth();
  const [yearStr, monthStr] = ym.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const dowNames = ["日", "月", "火", "水", "木", "金", "土"];
  const dow = new Date(year, month - 1, day).getDay();
  const hol = isHolidayOrYearEnd(year, month, day);
  const holName = hol.isHoliday ? ` (${hol.name})` : "";

  if (!db.data.shift_events) db.data.shift_events = {};
  if (!db.data.shift_events[ym]) db.data.shift_events[ym] = {};
  const currentEvt = db.data.shift_events[ym][day] || "";

  const val = prompt(`${month}月${day}日(${dowNames[dow]})${holName} の行事・予定を入力してください\n（例: 防災訓練、敬老会、健康診断、秋祭り、全体研修 など）\n※空にしてOKを押すと削除されます`, currentEvt);
  if (val === null) return;

  const trimmed = val.trim();
  if (trimmed) {
    db.data.shift_events[ym][day] = trimmed;
  } else {
    delete db.data.shift_events[ym][day];
  }
  db.save();
  renderShiftTable(ym);
}
window.openShiftEventModal = openShiftEventModal;

// [Claude追加] 応援の区分を付けられる勤務（早出・日勤・遅出・夜勤）
const CP_SHIFT_WORK_SYMBOLS = ["早", "日", "遅", "夜"];
function cpIsWorkShift(sym) { return CP_SHIFT_WORK_SYMBOLS.includes(String(sym || "").trim()); }
// [Claude追加] その日の応援の区分を外す（空になった入れ物も消す）
function cpClearShiftHelp(ym, staffName, day) {
  const m = db.data.monthly_shift_units;
  if (!m || !m[ym] || !m[ym][staffName]) return;
  delete m[ym][staffName][day];
  if (Object.keys(m[ym][staffName]).length === 0) delete m[ym][staffName];
}

// 勤務マスごとの担当区分（応援）変更
function changeShiftCellUnit(staffName, day, unitId) {
  if (typeof cpShiftAdminOnly === "function" && !cpShiftAdminOnly("勤務の区分（応援）")) return; // [Claude追加 2026-10-22]
  const ym = getShiftYearMonth();
  // [Claude修正] 勤務でない日には応援を付けない
  const curSym = (((db.data.monthly_shifts || {})[ym] || {})[staffName] || {})[day] || "";
  if (unitId !== null && unitId !== undefined && !cpIsWorkShift(curSym)) {
    alert("応援の区分は、早出・日勤・遅出・夜勤の日だけ設定できます。");
    return;
  }
  if (!db.data.monthly_shift_units) db.data.monthly_shift_units = {};
  if (!db.data.monthly_shift_units[ym]) db.data.monthly_shift_units[ym] = {};
  if (!db.data.monthly_shift_units[ym][staffName]) db.data.monthly_shift_units[ym][staffName] = {};

  const stObj = (db.data.stamps || []).find(x => (x.name || x) === staffName);
  const baseUnitId = (stObj && stObj.unit_id !== undefined && stObj.unit_id !== null) ? stObj.unit_id : null;

  if (unitId === null || unitId === undefined || String(unitId) === String(baseUnitId)) {
    delete db.data.monthly_shift_units[ym][staffName][day];
    if (Object.keys(db.data.monthly_shift_units[ym][staffName]).length === 0) {
      delete db.data.monthly_shift_units[ym][staffName];
    }
  } else {
    db.data.monthly_shift_units[ym][staffName][day] = Number(unitId);
  }

  db.save();
  closeShiftPopover();
  renderShiftTable(ym);
  if (typeof renderTodayShiftBar === "function") renderTodayShiftBar();
  if (typeof renderDailyJournal === "function" && gState.activeCareTab === "daily_journal") renderDailyJournal();
}
window.changeShiftCellUnit = changeShiftCellUnit;

// [Antigravity追加] 請求設定関連の外部公開
window.cpGetBillingSettings = cpGetBillingSettings;
window.cpSaveBillingSettings = cpSaveBillingSettings;
window.cpBillingModeFor = cpBillingModeFor;
window.renderOfficeBillingSettings = renderOfficeBillingSettings;
window.cpOnChangeFacilityType = cpOnChangeFacilityType;
window.cpOnChangePersonalEnabled = cpOnChangePersonalEnabled;
window.cpToggleCategoryBilling = cpToggleCategoryBilling;
window.cpToggleItemBilling = cpToggleItemBilling;
window.cpSubmitBillingOverride = cpSubmitBillingOverride;
window.cpVoidBillingOverride = cpVoidBillingOverride;

