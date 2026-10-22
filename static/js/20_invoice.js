// ==========================================
// [Claude追加 2026-10-23] 利用者への請求書・入金・領収書
// あなた「機能足して先に」（候補: 利用者への請求書 → 料金表・月の請求書・入金・領収書）
// 調べ: プロジェクトの claude/research_invoice_20261022.md
//  - 受け取れるのは、介護保険の利用者負担のほか、食材料費・理美容代・おむつ代・その他の日常生活費（市川市 手引き⑺・練馬区 運営指導基準 第5の3(3)）。
//    家賃・光熱水費・管理費等は、介護サービス情報公表システムで公表する項目。あらかじめ説明して同意を得る
//  - 領収証は、保険給付の対象の額と、その他の費用の額を分けて書く（介護保険法施行規則 第65条の5・第65条）
//  - グループホームの自己負担は医療費控除の対象外（国税庁 タックスアンサー No.1127）→ 領収書に医療費控除の額を書かない
//  - 消費税・家賃や食費の日割り・入院中の扱いを決めた国の資料は見つけていない → 計算しない／施設で選ぶ設定にする
// 記録は消さない: 料金表は「○月から」の版を足していく。請求書は確定したら変えず、直すときは理由を入れて取り消して作り直す
// 使うのは管理者・事務員だけ（お金の記録のため）
// ==========================================
let gInvoiceMonth = "";

function cpInvCanEdit() { return typeof isCurrentStaffAdminOrClerk === "function" && isCurrentStaffAdminOrClerk(); }
function cpInvYen(n) { return (n === null || n === undefined || isNaN(n)) ? "─" : "¥" + Number(n).toLocaleString(); }
function cpInvYmLabel(ym) { const m = String(ym || "").match(/^(\d{4})-(\d{2})$/); return m ? `${m[1]}年${Number(m[2])}月` : String(ym || ""); }
function cpInvPrevYm(ym) { const [y, m] = ym.split("-").map(Number); const d = new Date(y, m - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }

// ---- 料金表（版ごと。from_ym の月から使う） ----
function cpInvFeeTables() {
  return (Array.isArray(db.data.invoice_fee_tables) ? db.data.invoice_fee_tables : []).filter(t => t && !t.voided)
    .slice().sort((a, b) => String(a.from_ym).localeCompare(String(b.from_ym)) || (Number(a.id) || 0) - (Number(b.id) || 0));
}
function cpInvFeeFor(ym) {
  const list = cpInvFeeTables().filter(t => String(t.from_ym) <= ym);
  return list.length ? list[list.length - 1] : null;
}

// ---- その月の在所の日数（加算の計算と同じ日の区分を使う） ----
function cpInvStay(r, ym) {
  const calc = (typeof cpKasanBasicDays === "function") ? cpKasanBasicDays(r, ym) : { details: {} };
  const det = calc.details || {};
  let enrolled = 0, here = 0, away = 0;
  Object.keys(det).forEach(d => {
    const v = det[d];
    if (v === "NOT_ENROLLED" || v === "DISCHARGED") return;
    enrolled++;
    if (v === "BASIC") here++; else away++;
  });
  const [y, m] = ym.split("-").map(Number);
  return { enrolled, here, away, daysInMonth: new Date(y, m, 0).getDate() };
}

// ---- 1人・1か月の請求の中身を計算する（確定前の見込み） ----
function cpInvCompute(r, ym) {
  const fee = cpInvFeeFor(ym);
  const stay = cpInvStay(r, ym);
  const lines = [];
  const problems = [];
  if (stay.enrolled === 0) return { lines, problems: ["この月は入居の期間ではありません"], total: 0, fee, stay };
  if (ym >= toLocalDateStr(new Date()).slice(0, 7)) problems.push("月がまだ終わっていません（終わってから確定します。下の金額は今日までの記録での見込み）");

  // 1. 介護保険の利用者負担（国保連の請求ファイルと同じ計算: 単位数×単価の1円未満切り捨て、保険給付は給付率で切り捨て、残りが利用者負担）
  let care = null;
  try {
    const calc = (typeof cpComputeMonthlyKasan === "function") ? cpComputeMonthlyKasan(r, ym) : null;
    const settings = (typeof cpGetKasanSettings === "function") ? cpGetKasanSettings() : {};
    const regionObj = (typeof CP_KASAN_REGION_RATES !== "undefined") ? CP_KASAN_REGION_RATES.find(x => x.key === settings.region_type) : null;
    const rate = parseInt(String(r.benefit_rate || ""), 10);
    if (!calc || calc.levelMissing) problems.push("要介護度が登録されていないため、介護保険の分を計算できません");
    else if (!regionObj) problems.push("地域区分が設定されていないため、介護保険の分を計算できません（加算・減算の設定）");
    else if (![90, 80, 70].includes(rate)) problems.push("保険給付率（9割・8割・7割）が登録されていないため、介護保険の分を計算できません");
    else {
      const unitPriceInt = Math.round(regionObj.rate * 100);
      const cost100 = Math.floor(calc.totalUnits * unitPriceInt / 100);
      const hoken = Math.floor(cost100 * rate / 100);
      care = cost100 - hoken;
      lines.push({ kind: "care", label: `介護保険の利用者負担（${(100 - rate) / 10}割）`, insurance: true, amount: care,
        detail: `${calc.totalUnits.toLocaleString()}単位 × ${regionObj.rate.toFixed(2)}円 = 費用 ${cost100.toLocaleString()}円、保険給付 ${hoken.toLocaleString()}円` });
    }
  } catch (e) { problems.push("介護保険の分の計算でエラーが出ました"); }

  if (!fee) {
    problems.push(`${cpInvYmLabel(ym)}に使う料金表がありません（下の「料金表」で作ってください）`);
  } else {
    const prorate = (monthly, mode) => {
      if (!monthly) return { amount: 0, note: "" };
      let days = stay.enrolled;
      let note = "";
      if (fee.away_rule === "取らない") { days = stay.here; if (stay.away) note = `入院・外泊の${stay.away}日を除く`; }
      if (mode === "日割り" && days < stay.daysInMonth) {
        const amt = Math.floor(monthly * days / stay.daysInMonth);
        return { amount: amt, note: `${monthly.toLocaleString()}円 × ${days}日 ÷ ${stay.daysInMonth}日` + (note ? `（${note}）` : "") };
      }
      if (days === 0) return { amount: 0, note: note };
      return { amount: monthly, note: "月額" };
    };
    // 2. 家賃
    const rent = prorate(Number(fee.rent_monthly) || 0, fee.prorate);
    lines.push({ kind: "rent", label: "家賃", insurance: false, amount: rent.amount, detail: rent.note });
    // 3. 食材料費
    if (fee.food_mode === "1食ごと") {
      const cnt = { "朝食": 0, "昼食": 0, "夕食": 0, "おやつ": 0 };
      (db.data.meals || []).forEach(m => {
        if (!m || m.voided || Number(m.resident_id) !== Number(r.id) || String(m.date || "").slice(0, 7) !== ym) return;
        if (cnt[m.meal_type] !== undefined) cnt[m.meal_type]++;
      });
      const price = { "朝食": Number(fee.food_breakfast) || 0, "昼食": Number(fee.food_lunch) || 0, "夕食": Number(fee.food_dinner) || 0, "おやつ": Number(fee.food_snack) || 0 };
      const amt = Object.keys(cnt).reduce((s, k) => s + cnt[k] * price[k], 0);
      lines.push({ kind: "food", label: "食材料費", insurance: false, amount: amt,
        detail: Object.keys(cnt).filter(k => cnt[k]).map(k => `${k}${cnt[k]}回×${price[k]}円`).join("・") + "（食事の記録の数）" });
    } else {
      const daily = Number(fee.food_daily) || 0;
      lines.push({ kind: "food", label: "食材料費", insurance: false, amount: daily * stay.here, detail: `${daily.toLocaleString()}円 × ホームにいた${stay.here}日` });
    }
    // 4. 光熱水費・5. 管理費等
    const util = prorate(Number(fee.utility_monthly) || 0, fee.prorate);
    lines.push({ kind: "utility", label: "光熱水費", insurance: false, amount: util.amount, detail: util.note });
    if (Number(fee.mgmt_monthly) > 0) {
      const mg = prorate(Number(fee.mgmt_monthly) || 0, fee.prorate);
      lines.push({ kind: "mgmt", label: "管理費等", insurance: false, amount: mg.amount, detail: mg.note });
    }
  }
  // 6. 個人に請求する品物（月末請求明細と同じ記録）
  const goods = (typeof cpBillingRecords === "function") ? cpBillingRecords(ym, r.id) : [];
  const gsum = goods.reduce((s, c) => s + ((typeof cpBillingAmount === "function") ? cpBillingAmount(c) : 0), 0);
  if (goods.length) lines.push({ kind: "goods", label: "おむつ代など（個人に請求する品物）", insurance: false, amount: gsum, detail: `使用の記録 ${goods.length}件（月末請求明細）` });

  const total = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  return { lines, problems, total, fee, stay };
}

function cpInvoices() { return Array.isArray(db.data.invoices) ? db.data.invoices : []; }
function cpInvoiceOf(resId, ym) { return cpInvoices().find(v => v && !v.voided && Number(v.resident_id) === Number(resId) && v.ym === ym) || null; }
function cpInvPaid(inv) { return (inv.payments || []).filter(p => p && !p.voided).reduce((s, p) => s + (Number(p.amount) || 0), 0); }
function cpInvState(inv) {
  if (!inv) return { key: "none", text: "未確定" };
  const paid = cpInvPaid(inv);
  if (paid >= inv.total) return { key: "paid", text: "入金済" };
  if (paid > 0) return { key: "part", text: `一部入金（残り ${cpInvYen(inv.total - paid)}）` };
  return { key: "issued", text: "請求済・入金待ち" };
}
function cpInvResidents(ym) {
  return (gState.residents || []).filter(r => r && cpInvStay(r, ym).enrolled > 0)
    .sort((a, b) => String(a.room_no).localeCompare(String(b.room_no), "ja", { numeric: true }));
}

// ---- 画面 ----
function renderOfficeInvoiceTab() {
  const box = document.getElementById("tabOfficeInvoice");
  if (!box) return;
  if (!cpInvCanEdit()) { box.innerHTML = `<p class="panel-note">利用者への請求書は、管理者・事務員だけが使えます。</p>`; return; }
  if (!gInvoiceMonth) gInvoiceMonth = cpInvPrevYm(toLocalDateStr(new Date()).slice(0, 7)); // ふだんは前の月（月が終わってから作る）
  const ym = gInvoiceMonth;
  const rows = cpInvResidents(ym).map(r => {
    const inv = cpInvoiceOf(r.id, ym);
    const c = inv ? null : cpInvCompute(r, ym);
    const total = inv ? inv.total : c.total;
    const st = cpInvState(inv);
    const warn = (!inv && c.problems.length) ? `<div class="inv-warn">${c.problems.map(escapeHtml).join("<br>")}</div>` : "";
    const btns = inv
      ? `<button type="button" class="btn btn-secondary inv-btn" onclick="cpInvPrint(${Number(inv.id)}, 'invoice')">請求書</button>
         ${st.key !== "paid" ? `<button type="button" class="btn btn-secondary inv-btn" onclick="cpInvOpenPayment(${Number(inv.id)})">入金を記録</button>` : ""}
         ${cpInvPaid(inv) > 0 ? `<button type="button" class="btn btn-secondary inv-btn" onclick="cpInvPrint(${Number(inv.id)}, 'receipt')">領収書</button>` : ""}
         <button type="button" class="tool-link" onclick="cpInvVoid(${Number(inv.id)})">取り消して作り直す</button>`
      : `<button type="button" class="btn btn-primary inv-btn" ${c.problems.length ? "disabled" : ""} onclick="cpInvIssue(${Number(r.id)})">確定する</button>
         <button type="button" class="tool-link" onclick="cpInvShowDetail(${Number(r.id)})">内訳</button>`;
    return `<tr><td>${escapeHtml(r.room_no || "")}</td><td>${escapeHtml(r.name || "")} 様${r.usage_type === "short" ? "（短期利用）" : ""}</td>
      <td class="num"><strong>${cpInvYen(total)}</strong></td><td><span class="inv-state inv-${st.key}">${escapeHtml(st.text)}</span>${warn}</td><td>${btns}</td></tr>`;
  }).join("");
  const anyIssuable = cpInvResidents(ym).some(r => !cpInvoiceOf(r.id, ym) && !cpInvCompute(r, ym).problems.length);
  box.innerHTML = `
    <div class="panel-title"><span>利用者への請求書・入金・領収書</span></div>
    <p class="panel-note">介護保険の利用者負担と、家賃・食材料費・光熱水費・おむつ代などをまとめて請求します。月が終わってから、その月の分を確定してください。確定した請求書は変わりません（直すときは理由を入れて取り消し、作り直します）。<br>
    消費税は計算しません（入れた金額のまま）。高額介護サービス費は、あとで市町村からご本人に払い戻される分なので、請求書では差し引きません。グループホームの費用は医療費控除の対象外のため、領収書に医療費控除の額は書きません。</p>
    <div class="inv-bar">
      <label for="invMonth">請求する月</label>
      <input type="month" id="invMonth" class="form-control inv-month" value="${escapeHtml(ym)}" onchange="gInvoiceMonth=this.value || gInvoiceMonth; renderOfficeInvoiceTab();">
      <button type="button" class="btn btn-primary" ${anyIssuable ? "" : "disabled"} onclick="cpInvIssueAll()">計算できた方をまとめて確定</button>
    </div>
    <table class="data-table billing-table">
      <thead><tr><th>部屋</th><th>利用者</th><th class="num">請求額</th><th>状態</th><th></th></tr></thead>
      <tbody>${rows || `<tr><td colspan="5" class="billing-empty">${escapeHtml(cpInvYmLabel(ym))}に入居していた方はいません。</td></tr>`}</tbody>
    </table>
    <div id="invDetailArea"></div>
    ${cpInvFeeTableHtml()}`;
}

function cpInvShowDetail(resId) {
  const r = (gState.residents || []).find(x => Number(x.id) === Number(resId));
  const area = document.getElementById("invDetailArea");
  if (!r || !area) return;
  const c = cpInvCompute(r, gInvoiceMonth);
  area.innerHTML = `<div class="billing-sheet inv-detail">
    <h3>${escapeHtml(cpInvYmLabel(gInvoiceMonth))}　${escapeHtml(r.room_no || "")}号室 ${escapeHtml(r.name)} 様（確定前の見込み）</h3>
    ${cpInvLinesTable(c.lines, c.total)}
    <p class="panel-note">ホームにいた日 ${c.stay.here}日・入院や外泊の日 ${c.stay.away}日（入居していた日 ${c.stay.enrolled}日／${c.stay.daysInMonth}日）</p>
    ${c.problems.length ? `<div class="inv-warn">${c.problems.map(escapeHtml).join("<br>")}</div>` : ""}
  </div>`;
}

function cpInvLinesTable(lines, total) {
  const ins = lines.filter(l => l.insurance).reduce((s, l) => s + (Number(l.amount) || 0), 0);
  return `<table class="data-table billing-table">
    <thead><tr><th>項目</th><th>計算</th><th class="num">金額</th></tr></thead>
    <tbody>${lines.map(l => `<tr><td>${escapeHtml(l.label)}${l.insurance ? "（保険給付の対象）" : ""}</td><td>${escapeHtml(l.detail || "")}</td><td class="num">${cpInvYen(l.amount)}</td></tr>`).join("")}</tbody>
    <tfoot>
      <tr><td colspan="2" class="num">うち 介護保険の利用者負担</td><td class="num">${cpInvYen(ins)}</td></tr>
      <tr><td colspan="2" class="num">うち その他の費用</td><td class="num">${cpInvYen(total - ins)}</td></tr>
      <tr><td colspan="2" class="num">ご請求額</td><td class="num"><strong>${cpInvYen(total)}</strong></td></tr>
    </tfoot></table>`;
}

// ---- 確定 ----
function cpInvMakeRecord(r, ym, c) {
  const ins = c.lines.filter(l => l.insurance).reduce((s, l) => s + (Number(l.amount) || 0), 0);
  let id = Date.now();
  while (cpInvoices().some(v => Number(v.id) === id)) id++;
  return {
    id: id, resident_id: r.id, resident_name: r.name, room_no: r.room_no, ym: ym,
    invoice_no: `${ym.replace("-", "")}-${String(r.room_no || r.id)}` + (cpInvoices().filter(v => v && v.voided && Number(v.resident_id) === Number(r.id) && v.ym === ym).length ? `-${cpInvoices().filter(v => v && v.voided && Number(v.resident_id) === Number(r.id) && v.ym === ym).length + 1}` : ""),
    lines: JSON.parse(JSON.stringify(c.lines)), insurance_total: ins, other_total: c.total - ins, total: c.total,
    fee_table_id: c.fee ? c.fee.id : null, issued_at: toLocalDateTimeStr(new Date()), issued_by: cpLoginStaffName(), payments: []
  };
}
function cpInvIssue(resId) {
  if (!cpInvCanEdit()) { alert("請求書の確定は、管理者・事務員だけができます。"); return; }
  const ym = gInvoiceMonth;
  const r = (gState.residents || []).find(x => Number(x.id) === Number(resId));
  if (!r) return;
  if (cpInvoiceOf(r.id, ym)) { alert("この月の請求書は、すでに確定しています。"); return; }
  const c = cpInvCompute(r, ym);
  if (c.problems.length) { alert("確定できません。\n" + c.problems.join("\n")); return; }
  if (!confirm(`${r.name} 様の${cpInvYmLabel(ym)}分の請求書を ${cpInvYen(c.total)} で確定します。確定したあとは変わりません。よろしいですか？`)) return;
  if (!Array.isArray(db.data.invoices)) db.data.invoices = [];
  db.data.invoices.push(cpInvMakeRecord(r, ym, c));
  db.save();
  renderOfficeInvoiceTab();
}
function cpInvIssueAll() {
  if (!cpInvCanEdit()) { alert("請求書の確定は、管理者・事務員だけができます。"); return; }
  const ym = gInvoiceMonth;
  const targets = cpInvResidents(ym).filter(r => !cpInvoiceOf(r.id, ym)).map(r => ({ r, c: cpInvCompute(r, ym) })).filter(x => !x.c.problems.length);
  if (!targets.length) { alert("確定できる請求書はありません。"); return; }
  if (!confirm(`${cpInvYmLabel(ym)}分の請求書を ${targets.length}人分 確定します（計算できなかった方は残します）。よろしいですか？`)) return;
  if (!Array.isArray(db.data.invoices)) db.data.invoices = [];
  targets.forEach(x => db.data.invoices.push(cpInvMakeRecord(x.r, ym, x.c)));
  db.save();
  renderOfficeInvoiceTab();
}
function cpInvVoid(invId) {
  if (!cpInvCanEdit()) { alert("請求書の取り消しは、管理者・事務員だけができます。"); return; }
  const inv = cpInvoices().find(v => Number(v.id) === Number(invId));
  if (!inv) return;
  if (cpInvPaid(inv) > 0) { alert("入金の記録がある請求書は取り消せません。先に入金の記録を取り消してください（入金を記録の画面）。"); return; }
  const reason = (prompt("取り消す理由を入れてください（記録に残ります）") || "").trim();
  if (!reason) return;
  inv.voided = true; inv.void_reason = reason; inv.voided_by = cpLoginStaffName(); inv.voided_at = toLocalDateTimeStr(new Date());
  db.save();
  renderOfficeInvoiceTab();
}

// ---- 入金 ----
function cpInvOpenPayment(invId) {
  const inv = cpInvoices().find(v => Number(v.id) === Number(invId));
  const area = document.getElementById("invDetailArea");
  if (!inv || !area) return;
  const rest = inv.total - cpInvPaid(inv);
  const hist = (inv.payments || []).map(p => `<tr><td>${escapeHtml(p.date)}</td><td class="num">${cpInvYen(p.amount)}</td><td>${escapeHtml(p.method)}</td><td>${escapeHtml(p.recorded_by || "")}</td>
    <td>${p.voided ? `取消（${escapeHtml(p.void_reason || "")}）` : `<button type="button" class="tool-link" onclick="cpInvVoidPayment(${Number(inv.id)}, ${Number(p.id)})">取り消す</button>`}</td></tr>`).join("");
  area.innerHTML = `<div class="billing-sheet inv-detail">
    <h3>入金を記録　${escapeHtml(inv.room_no || "")}号室 ${escapeHtml(inv.resident_name || "")} 様　${escapeHtml(cpInvYmLabel(inv.ym))}分（請求額 ${cpInvYen(inv.total)}・残り ${cpInvYen(rest)}）</h3>
    <div class="inv-pay-form">
      <label>入金の日 <input type="date" id="invPayDate" class="form-control" max="${toLocalDateStr(new Date())}"></label>
      <label>金額（円） <input type="number" id="invPayAmount" class="form-control" min="1" step="1"></label>
      <label>払い方 <select id="invPayMethod" class="form-control"><option value="">選んでください</option><option>口座振替</option><option>振込</option><option>現金</option></select></label>
      <button type="button" class="btn btn-primary" onclick="cpInvSavePayment(${Number(inv.id)})">記録する</button>
    </div>
    ${hist ? `<table class="data-table billing-table"><thead><tr><th>入金の日</th><th class="num">金額</th><th>払い方</th><th>記録した職員</th><th></th></tr></thead><tbody>${hist}</tbody></table>` : ""}
  </div>`;
}
function cpInvSavePayment(invId) {
  if (!cpInvCanEdit()) { alert("入金の記録は、管理者・事務員だけができます。"); return; }
  const inv = cpInvoices().find(v => Number(v.id) === Number(invId));
  if (!inv) return;
  const date = (document.getElementById("invPayDate").value || "").trim();
  const amount = parseInt(document.getElementById("invPayAmount").value, 10);
  const method = document.getElementById("invPayMethod").value;
  const today = toLocalDateStr(new Date());
  if (!date) { alert("入金の日を入れてください。"); return; }
  if (date > today) { alert("入金の日に、先の日付は入れられません。"); return; }
  if (!amount || amount <= 0) { alert("金額を入れてください。"); return; }
  if (!method) { alert("払い方を選んでください。"); return; }
  const rest = inv.total - cpInvPaid(inv);
  if (amount > rest) { alert(`請求の残り（${cpInvYen(rest)}）より多い金額は記録できません。`); return; }
  if (!Array.isArray(inv.payments)) inv.payments = [];
  let id = Date.now();
  while (inv.payments.some(p => Number(p.id) === id)) id++;
  inv.payments.push({ id: id, date: date, amount: amount, method: method, recorded_by: cpLoginStaffName(), recorded_at: toLocalDateTimeStr(new Date()) });
  db.save();
  renderOfficeInvoiceTab();
  cpInvOpenPayment(invId);
}
function cpInvVoidPayment(invId, payId) {
  if (!cpInvCanEdit()) return;
  const inv = cpInvoices().find(v => Number(v.id) === Number(invId));
  const p = inv && (inv.payments || []).find(x => Number(x.id) === Number(payId));
  if (!p) return;
  const reason = (prompt("入金の記録を取り消す理由を入れてください（記録に残ります）") || "").trim();
  if (!reason) return;
  p.voided = true; p.void_reason = reason; p.voided_by = cpLoginStaffName(); p.voided_at = toLocalDateTimeStr(new Date());
  db.save();
  renderOfficeInvoiceTab();
  cpInvOpenPayment(invId);
}

// ---- 印刷（請求書・領収書） ----
function cpInvPrint(invId, kind) {
  const inv = cpInvoices().find(v => Number(v.id) === Number(invId));
  if (!inv) return;
  const fac = (db.data && db.data.facility_name) || "";
  const officeNo = ((db.data && db.data.kasan_settings) || {}).office_no || "";
  const paid = cpInvPaid(inv);
  const lastPay = (inv.payments || []).filter(p => !p.voided).slice(-1)[0];
  const rows = inv.lines.map(l => `<tr><td>${escapeHtml(l.label)}</td><td class="d">${escapeHtml(l.detail || "")}</td><td class="n">${cpInvYen(l.amount)}</td></tr>`).join("");
  const body = kind === "receipt"
    ? `<h1>領収書</h1>
       <p class="to">${escapeHtml(inv.resident_name || "")} 様</p>
       <p class="big">金額　${cpInvYen(paid)}</p>
       <p>${escapeHtml(cpInvYmLabel(inv.ym))}分のご利用料として、上記のとおり領収しました。${paid < inv.total ? `（ご請求額 ${cpInvYen(inv.total)} のうち）` : ""}</p>
       <table><tr><th>内訳</th><th class="n">金額</th></tr>
         <tr><td>介護保険の対象となるサービスの利用者負担額</td><td class="n">${cpInvYen(Math.min(paid, inv.insurance_total))}</td></tr>
         <tr><td>その他の費用（家賃・食材料費・光熱水費・おむつ代など）</td><td class="n">${cpInvYen(Math.max(0, paid - inv.insurance_total))}</td></tr></table>
       <p class="note">入金の日: ${escapeHtml(lastPay ? lastPay.date : "")}　領収書番号: ${escapeHtml(inv.invoice_no)}</p>`
    : `<h1>ご利用料金 請求書</h1>
       <p class="to">${escapeHtml(inv.resident_name || "")} 様（${escapeHtml(inv.room_no || "")}号室）</p>
       <p>${escapeHtml(cpInvYmLabel(inv.ym))}分のご利用料金を、次のとおりご請求いたします。</p>
       <p class="big">ご請求額　${cpInvYen(inv.total)}</p>
       <table><tr><th>項目</th><th>内容</th><th class="n">金額</th></tr>${rows}
         <tr class="sum"><td colspan="2">うち 介護保険の対象となるサービスの利用者負担額</td><td class="n">${cpInvYen(inv.insurance_total)}</td></tr>
         <tr class="sum"><td colspan="2">うち その他の費用</td><td class="n">${cpInvYen(inv.other_total)}</td></tr></table>
       <p class="note">請求書番号: ${escapeHtml(inv.invoice_no)}　確定日: ${escapeHtml(String(inv.issued_at || "").slice(0, 10))}</p>`;
  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>${kind === "receipt" ? "領収書" : "請求書"} ${escapeHtml(inv.resident_name || "")}</title>
    <style>:root{--ink:#22302b;--line:#8a948f;--head:#eef2ee;--sum:#f5f5f2;}body{font-family:"BIZ UDPGothic","Meiryo",sans-serif;font-size:14px;color:var(--ink);margin:24px;}h1{font-size:22px;text-align:center;letter-spacing:4px;}
    .to{font-size:18px;border-bottom:1px solid var(--ink);display:inline-block;padding:0 24px 2px 0;}.big{font-size:20px;font-weight:bold;border:1px solid var(--ink);padding:8px 12px;display:inline-block;}
    table{border-collapse:collapse;width:100%;margin:12px 0;}th,td{border:1px solid var(--line);padding:6px 8px;font-size:13px;}th{background:var(--head);}.n{text-align:right;white-space:nowrap;}.d{font-size:13px;}
    .sum td{background:var(--sum);}.note{font-size:13px;}.from{margin-top:24px;text-align:right;font-size:14px;}</style></head>
    <body>${body}<div class="from">${escapeHtml(fac)}${officeNo ? `<br>事業所番号 ${escapeHtml(officeNo)}` : ""}<br>認知症対応型共同生活介護</div></body></html>`;
  const win = window.open("", "_blank");
  if (!win) { alert("印刷用の画面を開けませんでした。ブラウザのポップアップ設定を確認してください。"); return; }
  win.document.open(); win.document.write(html); win.document.close();
  setTimeout(() => { win.focus(); win.print(); }, 300);
}

// ---- 料金表 ----
function cpInvFeeTableHtml() {
  const list = cpInvFeeTables().slice().reverse();
  const fmt = t => `家賃 ${cpInvYen(t.rent_monthly)}／月・光熱水費 ${cpInvYen(t.utility_monthly)}／月` + (Number(t.mgmt_monthly) > 0 ? `・管理費等 ${cpInvYen(t.mgmt_monthly)}／月` : "") +
    `・食材料費 ` + (t.food_mode === "1食ごと" ? `朝${t.food_breakfast}円・昼${t.food_lunch}円・夕${t.food_dinner}円・おやつ${t.food_snack}円（1食ごと）` : `${cpInvYen(t.food_daily)}／日`) +
    `・入居・退居の月: ${escapeHtml(t.prorate)}・入院や外泊の日の家賃など: ${escapeHtml(t.away_rule)}`;
  return `<div class="inv-fee">
    <h4>料金表（○月分から使う、の版を足していきます）</h4>
    ${list.length ? `<ul class="inv-fee-list">${list.map(t => `<li><strong>${escapeHtml(cpInvYmLabel(t.from_ym))}分から</strong>　${fmt(t)}<span class="inv-fee-by">（${escapeHtml(t.created_by || "")} ${escapeHtml(String(t.created_at || "").slice(0, 10))}）</span></li>`).join("")}</ul>` : `<p class="panel-note">料金表はまだありません。</p>`}
    <details class="inv-fee-form"><summary>新しい料金表を作る</summary>
      <p class="panel-note">重要事項説明書・運営規程の金額と同じにしてください（利用者・家族へ説明し、同意をもらった金額）。</p>
      <div class="inv-grid">
        <label>何月分から <input type="month" id="invFeeFrom" class="form-control"></label>
        <label>家賃（月額・円） <input type="number" id="invFeeRent" class="form-control" min="0" step="1"></label>
        <label>光熱水費（月額・円） <input type="number" id="invFeeUtil" class="form-control" min="0" step="1"></label>
        <label>管理費等（月額・円。なければ0） <input type="number" id="invFeeMgmt" class="form-control" min="0" step="1"></label>
        <label>入居・退居の月の家賃・光熱水費 <select id="invFeeProrate" class="form-control"><option value="">選んでください</option><option>日割り</option><option>月額のまま</option></select></label>
        <label>入院・外泊の日の家賃・光熱水費 <select id="invFeeAway" class="form-control"><option value="">選んでください</option><option>取る</option><option>取らない</option></select></label>
        <label>食材料費の数え方 <select id="invFeeFoodMode" class="form-control" onchange="cpInvFoodModeChanged()"><option value="">選んでください</option><option>1日ごと</option><option>1食ごと</option></select></label>
        <label class="inv-food-day">食材料費（1日・円） <input type="number" id="invFeeFoodDaily" class="form-control" min="0" step="1"></label>
        <label class="inv-food-meal">朝食（円） <input type="number" id="invFeeFoodB" class="form-control" min="0" step="1"></label>
        <label class="inv-food-meal">昼食（円） <input type="number" id="invFeeFoodL" class="form-control" min="0" step="1"></label>
        <label class="inv-food-meal">夕食（円） <input type="number" id="invFeeFoodD" class="form-control" min="0" step="1"></label>
        <label class="inv-food-meal">おやつ（円） <input type="number" id="invFeeFoodS" class="form-control" min="0" step="1"></label>
      </div>
      <button type="button" class="btn btn-primary" onclick="cpInvSaveFeeTable()">この料金表を足す</button>
    </details></div>`;
}
function cpInvFoodModeChanged() {
  const mode = (document.getElementById("invFeeFoodMode") || {}).value;
  document.querySelectorAll(".inv-food-day").forEach(e => { e.style.display = mode === "1食ごと" ? "none" : ""; });
  document.querySelectorAll(".inv-food-meal").forEach(e => { e.style.display = mode === "1日ごと" ? "none" : ""; });
}
function cpInvSaveFeeTable() {
  if (!cpInvCanEdit()) { alert("料金表は、管理者・事務員だけが作れます。"); return; }
  const v = id => (document.getElementById(id) || {}).value;
  const num = id => { const x = String(v(id) || "").trim(); if (x === "") return NaN; const n = Number(x); return (Number.isInteger(n) && n >= 0) ? n : NaN; };
  const from = v("invFeeFrom"), prorate = v("invFeeProrate"), away = v("invFeeAway"), mode = v("invFeeFoodMode");
  const miss = [];
  if (!from) miss.push("何月分から");
  [["invFeeRent", "家賃"], ["invFeeUtil", "光熱水費"], ["invFeeMgmt", "管理費等"]].forEach(([id, l]) => { if (isNaN(num(id))) miss.push(l); });
  if (!prorate) miss.push("入居・退居の月");
  if (!away) miss.push("入院・外泊の日");
  if (!mode) miss.push("食材料費の数え方");
  if (mode === "1日ごと" && isNaN(num("invFeeFoodDaily"))) miss.push("食材料費（1日）");
  if (mode === "1食ごと") [["invFeeFoodB", "朝食"], ["invFeeFoodL", "昼食"], ["invFeeFoodD", "夕食"], ["invFeeFoodS", "おやつ"]].forEach(([id, l]) => { if (isNaN(num(id))) miss.push(l); });
  if (miss.length) { alert("次を入れてください（0以上の整数）:\n" + miss.join("、")); return; }
  if (cpInvoices().some(x => !x.voided && x.ym >= from)) {
    if (!confirm(`${cpInvYmLabel(from)}分より後で、もう確定した請求書があります。確定した請求書は変わりません（新しい料金表は、これから確定する分に使います）。続けますか？`)) return;
  }
  if (!Array.isArray(db.data.invoice_fee_tables)) db.data.invoice_fee_tables = [];
  let id = Date.now();
  while (db.data.invoice_fee_tables.some(t => Number(t.id) === id)) id++;
  db.data.invoice_fee_tables.push({
    id: id, from_ym: from, rent_monthly: num("invFeeRent"), utility_monthly: num("invFeeUtil"), mgmt_monthly: num("invFeeMgmt"),
    prorate: prorate, away_rule: away, food_mode: mode,
    food_daily: mode === "1日ごと" ? num("invFeeFoodDaily") : null,
    food_breakfast: mode === "1食ごと" ? num("invFeeFoodB") : null, food_lunch: mode === "1食ごと" ? num("invFeeFoodL") : null,
    food_dinner: mode === "1食ごと" ? num("invFeeFoodD") : null, food_snack: mode === "1食ごと" ? num("invFeeFoodS") : null,
    created_at: toLocalDateTimeStr(new Date()), created_by: cpLoginStaffName()
  });
  if (!Array.isArray(db.data.settings_logs)) db.data.settings_logs = [];
  db.data.settings_logs.push({ id: id + 1, at: toLocalDateTimeStr(new Date()), by: cpLoginStaffName(), kind: "利用者への請求の料金表", action: "追加", detail: `${cpInvYmLabel(from)}分からの料金表` });
  db.save();
  renderOfficeInvoiceTab();
}

window.renderOfficeInvoiceTab = renderOfficeInvoiceTab;
window.cpInvShowDetail = cpInvShowDetail;
window.cpInvIssue = cpInvIssue;
window.cpInvIssueAll = cpInvIssueAll;
window.cpInvVoid = cpInvVoid;
window.cpInvOpenPayment = cpInvOpenPayment;
window.cpInvSavePayment = cpInvSavePayment;
window.cpInvVoidPayment = cpInvVoidPayment;
window.cpInvPrint = cpInvPrint;
window.cpInvSaveFeeTable = cpInvSaveFeeTable;
window.cpInvFoodModeChanged = cpInvFoodModeChanged;
