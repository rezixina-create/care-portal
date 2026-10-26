// ======================================================================
// [Antigravity実装 2026-10-19] ケアプランタブ（アセスメント・話し合い・計画・説明と同意・モニタリング・見直し・印刷）
// ======================================================================
function cpEnsureCarePlansArray() {
  if (!db || !db.data) return [];
  if (!Array.isArray(db.data.care_plans)) db.data.care_plans = [];
  gState.care_plans = db.data.care_plans;
  return db.data.care_plans;
}

function cpGetPlansForResident(resId) {
  const list = cpEnsureCarePlansArray().filter(p => p && !p.voided && Number(p.resident_id) === Number(resId));
  list.sort((a, b) => (Number(b.version) || 0) - (Number(a.version) || 0));
  return list;
}

function cpGetSelectedCarePlan(resId) {
  const list = cpGetPlansForResident(resId);
  if (!list.length) return null;
  if (gState.selectedCarePlanId) {
    const found = list.find(p => Number(p.id) === Number(gState.selectedCarePlanId));
    if (found) return found;
  }
  const active = list.find(p => p.status === "実施中");
  const chosen = active || list[0];
  gState.selectedCarePlanId = chosen.id;
  return chosen;
}

function cpCarePlanPeriodText(plan) {
  if (!plan || !Array.isArray(plan.needs) || !plan.needs.length) return "未設定";
  const froms = [];
  const tos = [];
  plan.needs.forEach(n => {
    if (!n) return;
    if (n.long_from) froms.push(n.long_from);
    if (n.short_from) froms.push(n.short_from);
    if (n.long_to) tos.push(n.long_to);
    if (n.short_to) tos.push(n.short_to);
  });
  if (!froms.length && !tos.length) return "未設定";
  froms.sort();
  tos.sort();
  const minFrom = froms.length ? froms[0] : "未定";
  const maxTo = tos.length ? tos[tos.length - 1] : "未定";
  return `${minFrom} 〜 ${maxTo}`;
}

function cpCarePlanStatusBadgeHtml(status) {
  const st = status || "作成中";
  if (st === "実施中") return `<span class="cp-plan-badge cp-plan-badge-active">実施中</span>`;
  if (st === "同意待ち") return `<span class="cp-plan-badge cp-plan-badge-wait">同意待ち</span>`;
  if (st === "終了") return `<span class="cp-plan-badge cp-plan-badge-ended">終了</span>`;
  return `<span class="cp-plan-badge cp-plan-badge-draft">作成中</span>`;
}

function cpSelectCarePlanVersion(planId) {
  gState.selectedCarePlanId = Number(planId);
  renderCarePlanTab();
}

function cpOnCarePlanResidentChange(val) {
  const id = Number(val);
  if (!id) return;
  gState.selectedCarePlanId = null;
  selectResident(id);
}

// [Claude修正 2026-10-19] 実施中・終了の版の中身（アセスメント・方針・課題・サービス）は変えない。
// 本人・家族に説明して同意をもらった内容が、あとから黙って変わらないようにするため。変えるときは「見直して新しい版を作る」
function cpCarePlanContentEditable(plan) {
  return !!plan && (plan.status === "作成中" || plan.status === "同意待ち" || !plan.status);
}
function cpCarePlanLockedMsg(plan) {
  return plan && plan.status === "実施中"
    ? "実施中の計画の中身は変えられません（説明・同意をもらった内容のため）。変えるときは「見直して新しい版を作る」から新しい版を作ってください。"
    : "終了した版は変えられません。";
}
// [Claude修正 2026-10-19] 説明・同意の前にそろっていないといけないもの（アセスメント・方針・課題と目標・サービス・話し合いの記録）
function cpCarePlanMissingForConsent(plan) {
  const miss = [];
  const a = (plan && plan.assessment) || {};
  if (!a.person_wish || !a.family_wish || !a.strengths || !a.issues) miss.push("① アセスメント");
  if (!plan.policy) miss.push("② 総合的な援助の方針");
  const needs = Array.isArray(plan.needs) ? plan.needs : [];
  if (!needs.length) miss.push("③ 課題（ニーズ）と目標");
  else if (needs.some(n => !Array.isArray(n.services) || !n.services.length)) miss.push("③ それぞれの課題のサービス内容");
  if (!Array.isArray(plan.meetings) || !plan.meetings.length) miss.push("④ ほかの職員との話し合いの記録");
  return miss;
}
// [Claude修正 2026-10-19] まだ実施中になっていない新しい版（作成中・同意待ち）があるか
function cpCarePlanHasDraft(resId) {
  return cpGetPlansForResident(resId).some(p => p.status === "作成中" || p.status === "同意待ち");
}

// 1. 新しいケアプラン（第1版など）を作成
function cpCreateInitialCarePlan() {
  if (!cpCanEditCarePlanGoal()) {
    alert("ケアプランを作成できるのは計画作成担当者（ケアマネ）です。");
    return;
  }
  const resId = Number(gState.selectedResidentId);
  const r = (gState.residents || []).find(x => Number(x.id) === resId);
  if (!r) {
    alert("利用者を選択してください。");
    return;
  }
  const existing = cpGetPlansForResident(resId);
  if (existing.length) { // [Claude修正 2026-10-19] 2つ目からは「見直して新しい版を作る」で（前の版から写し、理由を残す）
    alert("この方にはすでにケアプランがあります。新しい版は「見直して新しい版を作る」から作ってください。");
    return;
  }
  const nextVer = 1;
  const nowStr = toLocalDateStr(new Date());
  const staff = cpLedgerStaff();
  const newPlan = {
    id: Date.now(),
    resident_id: resId,
    version: nextVer,
    status: "作成中",
    created_at: nowStr,
    created_by: staff,
    assessment: {
      person_wish: "",
      family_wish: "",
      strengths: "",
      issues: "",
      summary_id: null
    },
    policy: "",
    needs: [],
    meetings: [],
    consent: {
      explained_on: "",
      explained_to: "",
      relation: "",
      consented_on: "",
      delivered_on: ""
    },
    monitorings: [],
    ended_at: "",
    end_reason: "",
    edit_history: []
  };
  cpEnsureCarePlansArray().unshift(newPlan);
  gState.selectedCarePlanId = newPlan.id;
  db.save();
  renderCarePlanTab();
  renderResidentDetail();
  checkGlobalAlerts();
  alert(`${r.name} 様のケアプラン（第${nextVer}版・作成中）を作成しました。①アセスメントから順に記入してください。`);
}

// 2. 見直して新しい版を作る（今の版を写して次の版を作成、理由必須）
function cpReviewAndCreateNextVersion(planId) {
  if (!cpCanEditCarePlanGoal()) {
    alert("ケアプランを見直して新しい版を作れるのは計画作成担当者（ケアマネ）です。");
    return;
  }
  const list = cpEnsureCarePlansArray();
  const src = list.find(p => Number(p.id) === Number(planId));
  if (!src) return;
  // [Claude修正 2026-10-19] 見直しは、実施中か終了の版から。まだ実施中になっていない新しい版があるときは、そちらを仕上げる（作成中の版が2つにならないように）
  if (cpCarePlanHasDraft(src.resident_id)) {
    alert("まだ実施中になっていない新しい版（作成中・同意待ち）があります。先にその版を仕上げるか、終了にしてください。");
    return;
  }
  if (src.status !== "実施中" && src.status !== "終了") {
    alert("見直しは、実施中か終了の版から行ってください。");
    return;
  }
  const r = (gState.residents || []).find(x => Number(x.id) === Number(src.resident_id));
  const reason = prompt(`第${src.version}版を見直して、新しい版（作成中）を作ります。\n（※新しい版が「実施中」になった時点で、前の版は自動で「終了」になります）\n\n見直しの理由を入力してください（必須）：`, "");
  if (reason === null) return;
  if (!reason.trim()) {
    alert("見直しの理由を入力してください。空欄のまま新しい版を作ることはできません。");
    return;
  }
  const resPlans = cpGetPlansForResident(src.resident_id);
  const nextVer = resPlans.length ? Math.max(...resPlans.map(p => Number(p.version) || 0)) + 1 : (Number(src.version) || 1) + 1;
  const nowStr = toLocalDateStr(new Date());
  const staff = cpLedgerStaff();
  let idSeq = Date.now();
  const copiedNeeds = (Array.isArray(src.needs) ? src.needs : []).map(n => ({
    id: ++idSeq,
    need: n.need || "",
    long_goal: n.long_goal || "",
    long_from: n.long_from || "",
    long_to: n.long_to || "",
    short_goal: n.short_goal || "",
    short_from: n.short_from || "",
    short_to: n.short_to || "",
    services: (Array.isArray(n.services) ? n.services : []).map(s => ({
      id: ++idSeq,
      content: s.content || "",
      who: s.who || "",
      frequency: s.frequency || ""
    }))
  }));
  const srcAssess = src.assessment || {};
  const newPlan = {
    id: ++idSeq,
    resident_id: Number(src.resident_id),
    version: nextVer,
    status: "作成中",
    created_at: nowStr,
    created_by: staff,
    review_reason: reason.trim(),
    previous_version_id: src.id,
    assessment: {
      person_wish: srcAssess.person_wish || "",
      family_wish: srcAssess.family_wish || "",
      strengths: srcAssess.strengths || "",
      issues: srcAssess.issues || "",
      summary_id: srcAssess.summary_id || null
    },
    policy: src.policy || "",
    needs: copiedNeeds,
    meetings: [],
    consent: {
      explained_on: "",
      explained_to: "",
      relation: "",
      consented_on: "",
      delivered_on: ""
    },
    monitorings: [],
    ended_at: "",
    end_reason: "",
    edit_history: [
      {
        edited_at: toLocalDateTimeStr(new Date()),
        edited_by: staff,
        reason: `第${src.version}版からの見直し作成（理由: ${reason.trim()}）`,
        before: { previous_version: src.version }
      }
    ]
  };
  list.unshift(newPlan);
  gState.selectedCarePlanId = newPlan.id;
  db.save();
  renderCarePlanTab();
  renderResidentDetail();
  checkGlobalAlerts();
  alert(`${r ? r.name + " 様の" : ""}第${nextVer}版（作成中）を作成しました。\n第${src.version}版の内容を写しています。見直し箇所を変更し、説明・同意・交付の日を入力すると第${nextVer}版が「実施中」になり、前の版は自動で「終了」になります。`);
}

// 3. 計画を手動で「終了」にする（理由必須）
function cpEndCarePlanManually(planId) {
  if (!cpCanEditCarePlanGoal()) {
    alert("ケアプランを終了できるのは計画作成担当者（ケアマネ）です。");
    return;
  }
  const plan = cpEnsureCarePlansArray().find(p => Number(p.id) === Number(planId));
  if (!plan || plan.status === "終了") return;
  const reason = prompt(`第${plan.version}版を「終了」にします（記録は消えずに残ります）。\n\n終了の理由を入力してください（必須）：`, "");
  if (reason === null) return;
  if (!reason.trim()) {
    alert("終了の理由を入力してください。");
    return;
  }
  const oldCopy = JSON.parse(JSON.stringify(plan));
  plan.status = "終了";
  plan.ended_at = toLocalDateStr(new Date());
  plan.end_reason = reason.trim();
  cpAppendEditHistory(plan, oldCopy, ["status", "ended_at", "end_reason"], reason.trim());
  db.save();
  renderCarePlanTab();
  renderResidentDetail();
  checkGlobalAlerts();
  alert(`第${plan.version}版を「終了」にしました。`);
}

// ① アセスメント：介護サマリーから引用
function cpQuoteCareSummaryToAssessment(planId) {
  if (!cpCanEditCarePlanGoal()) return;
  const plan = cpEnsureCarePlansArray().find(p => Number(p.id) === Number(planId));
  if (!plan) return;
  if (!cpCarePlanContentEditable(plan)) { alert(cpCarePlanLockedMsg(plan)); return; } // [Claude修正 2026-10-19]
  const selEl = document.getElementById("cpQuoteSummarySelect");
  const summaries = cpSummariesOfResident(plan.resident_id).filter(s => !s.voided); // [Claude修正] 新しい順
  if (!summaries.length) {
    alert("この方の介護サマリーがまだ登録されていません。");
    return;
  }
  let targetSummary = summaries[0];
  if (selEl && selEl.value) {
    const found = summaries.find(s => Number(s.id) === Number(selEl.value));
    if (found) targetSummary = found;
  }
  const personEl = document.getElementById("cpAssessPersonWish");
  const familyEl = document.getElementById("cpAssessFamilyWish");
  const strengthsEl = document.getElementById("cpAssessStrengths");
  const issuesEl = document.getElementById("cpAssessIssues");
  const sumIdEl = document.getElementById("cpAssessSummaryId");

  // [Claude修正 2026-10-19] 介護サマリーには「本人の意向」の欄がないので、本人の意向は写さない（目標やケアの注意を本人の言葉として残さないため）。
  // 写すときは、どの欄から写したかを【　】で付ける
  const lbl = (name, v) => { const t = (v || "").trim(); return t ? `【介護サマリー：${name}】${t}` : ""; };
  const familyParts = [lbl("家族の状況・要望", targetSummary.family_info)].filter(Boolean);
  const strengthParts = [lbl("生活歴", targetSummary.background), lbl("ADL", targetSummary.adl)].filter(Boolean);
  const issueParts = [lbl("身体・認知", targetSummary.physical_cognitive), lbl("食事・水分", targetSummary.meals_hydration), lbl("排泄", targetSummary.excretion), lbl("睡眠", targetSummary.sleep), lbl("認知症の様子", targetSummary.dementia_behavior), lbl("医療・看護", targetSummary.medical_care)].filter(Boolean);

  if (familyEl && familyParts.length) familyEl.value = familyParts.join("\n");
  if (strengthsEl && strengthParts.length) strengthsEl.value = strengthParts.join("\n");
  if (issuesEl && issueParts.length) issuesEl.value = issueParts.join("\n");
  if (sumIdEl) sumIdEl.value = String(targetSummary.id);

  alert(`介護サマリー（${targetSummary.created_at || ""} ${targetSummary.summary_type || ""}）から、家族の意向・できること・困っていることの欄へ写しました（どの欄から写したかを【　】で付けています）。\n本人の意向は介護サマリーに欄がないため写していません。本人から聞き取って書いてください。\n内容を書き直してから「アセスメントを保存」を押してください。`);
}

// ① アセスメント保存
function cpSaveCarePlanAssessment(planId) {
  if (!cpCanEditCarePlanGoal()) {
    alert("アセスメントを保存できるのは計画作成担当者（ケアマネ）です。");
    return;
  }
  const plan = cpEnsureCarePlansArray().find(p => Number(p.id) === Number(planId));
  if (!plan) return;
  if (!cpCarePlanContentEditable(plan)) { alert(cpCarePlanLockedMsg(plan)); return; } // [Claude修正 2026-10-19]
  const personWish = (document.getElementById("cpAssessPersonWish")?.value || "").trim();
  const familyWish = (document.getElementById("cpAssessFamilyWish")?.value || "").trim();
  const strengths = (document.getElementById("cpAssessStrengths")?.value || "").trim();
  const issues = (document.getElementById("cpAssessIssues")?.value || "").trim();
  const summaryIdRaw = (document.getElementById("cpAssessSummaryId")?.value || "").trim();

  const missing = [];
  if (!personWish) missing.push("本人の意向");
  if (!familyWish) missing.push("家族の意向");
  if (!strengths) missing.push("できること・好きなこと");
  if (!issues) missing.push("困っていること");
  if (missing.length > 0) {
    alert(`アセスメントの以下の欄が空です。入力してから保存してください：\n・${missing.join("\n・")}`);
    return;
  }

  const prev = plan.assessment || {};
  const hadPrev = Boolean(prev.person_wish || prev.family_wish || prev.strengths || prev.issues);
  const isSame = (prev.person_wish || "") === personWish &&
    (prev.family_wish || "") === familyWish &&
    (prev.strengths || "") === strengths &&
    (prev.issues || "") === issues &&
    String(prev.summary_id || "") === String(summaryIdRaw || "");
  if (isSame) {
    alert("変更された項目がありません。");
    return;
  }

  let reason = "";
  if (hadPrev) {
    const rInput = cpPromptEditReason("アセスメント", `本人:${prev.person_wish || ""} / 家族:${prev.family_wish || ""}`);
    if (rInput === null) return;
    reason = rInput;
  }

  const oldCopy = JSON.parse(JSON.stringify(plan));
  if (!plan.assessment || typeof plan.assessment !== "object") plan.assessment = {};
  plan.assessment.person_wish = personWish;
  plan.assessment.family_wish = familyWish;
  plan.assessment.strengths = strengths;
  plan.assessment.issues = issues;
  plan.assessment.summary_id = summaryIdRaw ? Number(summaryIdRaw) : null;
  if (hadPrev) {
    cpAppendEditHistory(plan, oldCopy, ["assessment"], reason);
  }
  db.save();
  renderCarePlanTab();
  alert("アセスメントを保存しました。");
}

// ② 総合的な援助の方針 保存
function cpSaveCarePlanPolicy(planId) {
  if (!cpCanEditCarePlanGoal()) {
    alert("総合的な援助の方針を保存できるのは計画作成担当者（ケアマネ）です。");
    return;
  }
  const plan = cpEnsureCarePlansArray().find(p => Number(p.id) === Number(planId));
  if (!plan) return;
  if (!cpCarePlanContentEditable(plan)) { alert(cpCarePlanLockedMsg(plan)); return; } // [Claude修正 2026-10-19]
  const val = (document.getElementById("cpPolicyInput")?.value || "").trim();
  if (!val) {
    alert("「総合的な援助の方針」が空です。入力してから保存してください。");
    return;
  }
  const prev = (plan.policy || "").trim();
  if (prev === val) {
    alert("変更された項目がありません。");
    return;
  }
  let reason = "";
  if (prev) {
    const rInput = cpPromptEditReason("総合的な援助の方針", prev);
    if (rInput === null) return;
    reason = rInput;
  }
  const oldCopy = JSON.parse(JSON.stringify(plan));
  plan.policy = val;
  if (prev) {
    cpAppendEditHistory(plan, oldCopy, ["policy"], reason);
  }
  db.save();
  renderCarePlanTab();
  alert("総合的な援助の方針を保存しました。");
}

// ③ 課題ごとの目標とサービス：課題の追加・変更
function cpSaveCarePlanNeed(planId, needId) {
  if (!cpCanEditCarePlanGoal()) {
    alert("課題と目標を保存できるのは計画作成担当者（ケアマネ）です。");
    return;
  }
  const plan = cpEnsureCarePlansArray().find(p => Number(p.id) === Number(planId));
  if (!plan) return;
  if (!cpCarePlanContentEditable(plan)) { alert(cpCarePlanLockedMsg(plan)); return; } // [Claude修正 2026-10-19]
  if (!Array.isArray(plan.needs)) plan.needs = [];

  const prefix = needId ? `cpNeedEdit_${needId}_` : `cpNeedNew_`;
  const needText = (document.getElementById(prefix + "need")?.value || "").trim();
  const longGoal = (document.getElementById(prefix + "long_goal")?.value || "").trim();
  const longFrom = (document.getElementById(prefix + "long_from")?.value || "").trim();
  const longTo = (document.getElementById(prefix + "long_to")?.value || "").trim();
  const shortGoal = (document.getElementById(prefix + "short_goal")?.value || "").trim();
  const shortFrom = (document.getElementById(prefix + "short_from")?.value || "").trim();
  const shortTo = (document.getElementById(prefix + "short_to")?.value || "").trim();

  const missing = [];
  if (!needText) missing.push("課題（ニーズ）");
  if (!longGoal) missing.push("長期目標");
  if (!longFrom) missing.push("長期目標の開始日");
  if (!longTo) missing.push("長期目標の終了日");
  if (!shortGoal) missing.push("短期目標");
  if (!shortFrom) missing.push("短期目標の開始日");
  if (!shortTo) missing.push("短期目標の終了日");
  if (missing.length > 0) {
    alert(`以下の欄が空です。入力してから保存してください：\n・${missing.join("\n・")}`);
    return;
  }
  if (longFrom > longTo) {
    alert("長期目標の終了日は、開始日以降の日付にしてください。");
    return;
  }
  if (shortFrom > shortTo) {
    alert("短期目標の終了日は、開始日以降の日付にしてください。");
    return;
  }

  if (needId) {
    const targetNeed = plan.needs.find(n => Number(n.id) === Number(needId));
    if (!targetNeed) return;
    const isSame = (targetNeed.need || "") === needText &&
      (targetNeed.long_goal || "") === longGoal &&
      (targetNeed.long_from || "") === longFrom &&
      (targetNeed.long_to || "") === longTo &&
      (targetNeed.short_goal || "") === shortGoal &&
      (targetNeed.short_from || "") === shortFrom &&
      (targetNeed.short_to || "") === shortTo;
    if (isSame) {
      alert("変更された項目がありません。");
      return;
    }
    const reason = cpPromptEditReason("課題・目標", `${targetNeed.need} / 短期目標: ${targetNeed.short_goal}`);
    if (reason === null) return;
    const oldCopy = JSON.parse(JSON.stringify(plan));
    targetNeed.need = needText;
    targetNeed.long_goal = longGoal;
    targetNeed.long_from = longFrom;
    targetNeed.long_to = longTo;
    targetNeed.short_goal = shortGoal;
    targetNeed.short_from = shortFrom;
    targetNeed.short_to = shortTo;
    cpAppendEditHistory(plan, oldCopy, ["needs"], reason);
    gState.editingCarePlanNeedId = null;
  } else {
    plan.needs.push({
      id: Date.now(),
      need: needText,
      long_goal: longGoal,
      long_from: longFrom,
      long_to: longTo,
      short_goal: shortGoal,
      short_from: shortFrom,
      short_to: shortTo,
      services: []
    });
  }

  db.save();
  renderCarePlanTab();
  renderResidentDetail();
  checkGlobalAlerts();
  alert(needId ? "課題・目標を変更しました。" : "課題・目標を追加しました。続けてこの課題に対するサービス内容を追加できます。");
}

function cpStartEditCarePlanNeed(needId) {
  gState.editingCarePlanNeedId = needId ? Number(needId) : null;
  renderCarePlanTab();
}

// ③-2 課題ごとのサービスの追加・変更
function cpSaveCarePlanService(planId, needId, serviceId) {
  if (!cpCanEditCarePlanGoal()) {
    alert("サービス内容を保存できるのは計画作成担当者（ケアマネ）です。");
    return;
  }
  const plan = cpEnsureCarePlansArray().find(p => Number(p.id) === Number(planId));
  if (!plan || !Array.isArray(plan.needs)) return;
  if (!cpCarePlanContentEditable(plan)) { alert(cpCarePlanLockedMsg(plan)); return; } // [Claude修正 2026-10-19]
  const targetNeed = plan.needs.find(n => Number(n.id) === Number(needId));
  if (!targetNeed) return;
  if (!Array.isArray(targetNeed.services)) targetNeed.services = [];

  const prefix = serviceId ? `cpSvcEdit_${needId}_${serviceId}_` : `cpSvcNew_${needId}_`;
  const content = (document.getElementById(prefix + "content")?.value || "").trim();
  const who = (document.getElementById(prefix + "who")?.value || "").trim();
  const frequency = (document.getElementById(prefix + "frequency")?.value || "").trim();

  const missing = [];
  if (!content) missing.push("サービス内容");
  if (!who) missing.push("担当（職種など）");
  if (!frequency) missing.push("頻度");
  if (missing.length > 0) {
    alert(`サービスの以下の欄が空です。入力・選択してから保存してください：\n・${missing.join("\n・")}`);
    return;
  }

  if (serviceId) {
    const svc = targetNeed.services.find(s => Number(s.id) === Number(serviceId));
    if (!svc) return;
    if ((svc.content || "") === content && (svc.who || "") === who && (svc.frequency || "") === frequency) {
      alert("変更された項目がありません。");
      return;
    }
    const reason = cpPromptEditReason("サービス内容", `${svc.content} (${svc.who}・${svc.frequency})`);
    if (reason === null) return;
    const oldCopy = JSON.parse(JSON.stringify(plan));
    svc.content = content;
    svc.who = who;
    svc.frequency = frequency;
    cpAppendEditHistory(plan, oldCopy, ["needs"], reason);
    gState.editingCarePlanServiceKey = null;
  } else {
    targetNeed.services.push({
      id: Date.now(),
      content: content,
      who: who,
      frequency: frequency
    });
  }

  db.save();
  renderCarePlanTab();
  alert(serviceId ? "サービス内容を変更しました。" : "サービス内容を追加しました。");
}

function cpStartEditCarePlanService(needId, serviceId) {
  gState.editingCarePlanServiceKey = (needId && serviceId) ? `${needId}_${serviceId}` : null;
  renderCarePlanTab();
}

// ④ 話し合いの記録：職員全員が意見・記録を書ける
function cpAddCarePlanMeeting(planId) {
  const plan = cpEnsureCarePlansArray().find(p => Number(p.id) === Number(planId));
  if (!plan) return;
  if (!Array.isArray(plan.meetings)) plan.meetings = [];

  const dateVal = (document.getElementById("cpMeetDate")?.value || "").trim();
  const attendeesVal = (document.getElementById("cpMeetAttendees")?.value || "").trim();
  const opinionsVal = (document.getElementById("cpMeetOpinions")?.value || "").trim();

  if (plan.status === "終了") { alert("終了した版には足せません。"); return; } // [Claude修正 2026-10-19]
  if (dateVal && dateVal > toLocalDateStr(new Date())) { alert("話し合いの日に、先の日付は入れられません。"); return; } // [Claude修正 2026-10-19]
  const missing = [];
  if (!dateVal) missing.push("話し合いの日");
  if (!attendeesVal) missing.push("参加した職員");
  if (!opinionsVal) missing.push("出た意見");
  if (missing.length > 0) {
    alert(`話し合いの記録で以下の欄が空です。入力してから保存してください：\n・${missing.join("\n・")}`);
    return;
  }

  plan.meetings.push({
    id: Date.now(),
    date: dateVal,
    attendees: attendeesVal,
    opinions: opinionsVal,
    recorded_by: cpLedgerStaff()
  });

  db.save();
  renderCarePlanTab();
  alert("話し合いの記録を追加しました。");
}

// ④-2 既存の話し合いの記録に意見を追記・変更（職員全員が意見を書ける。idは変えない）
function cpAppendOpinionToMeeting(planId, meetingId) {
  const plan = cpEnsureCarePlansArray().find(p => Number(p.id) === Number(planId));
  if (!plan || !Array.isArray(plan.meetings)) return;
  const mt = plan.meetings.find(m => Number(m.id) === Number(meetingId));
  if (!mt) return;
  const inputEl = document.getElementById(`cpMeetAddOpinion_${meetingId}`);
  const addText = (inputEl ? inputEl.value : "").trim();
  if (!addText) {
    alert("追加する意見を入力してください。");
    if (inputEl) inputEl.focus();
    return;
  }
  if (plan.status === "終了") { alert("終了した版には足せません。"); return; } // [Claude修正 2026-10-19]
  const staff = cpLedgerStaff();
  const oldCopy = JSON.parse(JSON.stringify(plan));
  // [Claude修正 2026-10-19] あとから意見を足した人を「参加した職員」に足さない（その場にいなかった人を参加者として残さないため）。足した日時を付ける
  const line = `[${toLocalDateTimeStr(new Date())} ${staff}（あとから追記）] ${addText}`;
  mt.opinions = mt.opinions ? `${mt.opinions}\n${line}` : line;
  cpAppendEditHistory(plan, oldCopy, ["meetings"], `${staff}が話し合いの意見を追記`);
  db.save();
  renderCarePlanTab();
  alert("話し合いの記録に意見を追加しました。");
}

function cpEditCarePlanMeeting(planId, meetingId) {
  const plan = cpEnsureCarePlansArray().find(p => Number(p.id) === Number(planId));
  if (!plan || !Array.isArray(plan.meetings)) return;
  const mt = plan.meetings.find(m => Number(m.id) === Number(meetingId));
  if (!mt) return;
  // [Claude修正 2026-10-19] 話し合いの記録の書き直しは、記録した本人か計画作成担当者だけ（ほかの人の書いた意見を書き換えられないように）
  if (plan.status === "終了") { alert("終了した版は変えられません。"); return; }
  if (!(cpCanEditCarePlanGoal() || (mt.recorded_by && mt.recorded_by === cpLedgerStaff()))) {
    alert("話し合いの記録を訂正できるのは、記録した本人か計画作成担当者です。意見は「意見を追加」から足してください。");
    return;
  }
  const newOpinions = prompt(`話し合いの記録（${mt.date}）の「出た意見」を訂正します。\n訂正後の内容を入力してください：`, mt.opinions || "");
  if (newOpinions === null) return;
  if (!newOpinions.trim()) {
    alert("出た意見を空欄にはできません。");
    return;
  }
  if (newOpinions.trim() === (mt.opinions || "").trim()) {
    alert("変更された箇所がありません。");
    return;
  }
  const reason = cpPromptEditReason(`${mt.date}の話し合いの意見`, mt.opinions || "");
  if (reason === null) return;
  const oldCopy = JSON.parse(JSON.stringify(plan));
  mt.opinions = newOpinions.trim();
  cpAppendEditHistory(plan, oldCopy, ["meetings"], reason);
  db.save();
  renderCarePlanTab();
  alert("話し合いの記録を訂正しました。");
}

// ⑤ 説明・同意・交付の保存 ＆ 状態遷移（作成中／同意待ち → 説明・同意・交付がそろったら実施中、前の実施中版は自動で終了）
function cpSaveCarePlanConsent(planId) {
  if (!cpCanEditCarePlanGoal()) {
    alert("説明・同意・交付を記録できるのは計画作成担当者（ケアマネ）です。");
    return;
  }
  const list = cpEnsureCarePlansArray();
  const plan = list.find(p => Number(p.id) === Number(planId));
  if (!plan) return;

  const explainedOn = (document.getElementById("cpConsentExplainedOn")?.value || "").trim();
  const explainedTo = (document.getElementById("cpConsentExplainedTo")?.value || "").trim();
  const relation = (document.getElementById("cpConsentRelation")?.value || "").trim();
  const consentedOn = (document.getElementById("cpConsentConsentedOn")?.value || "").trim();
  const deliveredOn = (document.getElementById("cpConsentDeliveredOn")?.value || "").trim();

  if (!explainedOn && !explainedTo && !relation && !consentedOn && !deliveredOn) {
    alert("説明・同意・交付の欄がすべて空です。入力してから保存してください。");
    return;
  }
  if (explainedOn && !explainedTo) {
    alert("説明した相手（本人／家族）を選んでください。");
    return;
  }
  if (explainedTo && explainedTo.includes("家族") && !relation) {
    alert("家族へ説明した場合は「家族の続柄」を入力してください。");
    return;
  }

  const todayStr = toLocalDateStr(new Date());
  if (plan.status === "終了") { alert("終了した版は変えられません。"); return; } // [Claude修正 2026-10-19]
  // [Claude修正 2026-10-19] 日付の順番: 計画を作った日 ≦ 説明した日 ≦ 同意の日 ≦ 交付日
  const createdDay = String(plan.created_at || "").slice(0, 10);
  if (explainedOn && createdDay && explainedOn < createdDay) { alert(`説明した日は、この版を作った日（${createdDay}）より前にはできません。`); return; }
  if (consentedOn && !explainedOn) { alert("同意の日を入れるときは、先に説明した日を入れてください。"); return; }
  if (deliveredOn && !consentedOn) { alert("交付日を入れるときは、先に同意の日を入れてください。"); return; }
  if (consentedOn && explainedOn && consentedOn < explainedOn) { alert("同意の日は、説明した日より前にはできません。"); return; }
  if (deliveredOn && consentedOn && deliveredOn < consentedOn) { alert("交付日は、同意の日より前にはできません。"); return; }
  // [Claude修正 2026-10-19] 同意をもらう前に、計画の中身がそろっていること
  if (consentedOn && plan.status !== "実施中") {
    const miss = cpCarePlanMissingForConsent(plan);
    if (miss.length) { alert(`同意の日を入れる前に、次のものをそろえてください：\n・${miss.join("\n・")}`); return; }
  }
  // [Claude修正 2026-10-19] 実施中の版は、日付の訂正だけ（3つとも入れたまま・理由が必要）。状態は実施中のまま
  if (plan.status === "実施中" && !(explainedOn && consentedOn && deliveredOn)) {
    alert("実施中の版では、説明した日・同意の日・交付日を空にはできません（日付の訂正だけできます）。");
    return;
  }
  if (explainedOn && explainedOn > todayStr) {
    alert("説明した日に、先の日付は入れられません。");
    return;
  }
  if (consentedOn && consentedOn > todayStr) {
    alert("同意の日に、先の日付は入れられません。");
    return;
  }
  if (deliveredOn && deliveredOn > todayStr) {
    alert("交付日に、先の日付は入れられません。");
    return;
  }

  const prevC = plan.consent || {};
  const hadPrev = Boolean(prevC.explained_on || prevC.explained_to || prevC.relation || prevC.consented_on || prevC.delivered_on);
  const isSame = (prevC.explained_on || "") === explainedOn &&
    (prevC.explained_to || "") === explainedTo &&
    (prevC.relation || "") === relation &&
    (prevC.consented_on || "") === consentedOn &&
    (prevC.delivered_on || "") === deliveredOn;
  if (isSame) {
    alert("変更された項目がありません。");
    return;
  }

  let reason = "";
  // [Claude修正 2026-10-19] 理由を聞くのは、すでに入っていた日付・相手を変える（消す）ときだけ。空の欄を埋めていくときは聞かない
  const changedFilled = ["explained_on", "explained_to", "relation", "consented_on", "delivered_on"].some(k => (prevC[k] || "") !== "" && (prevC[k] || "") !== ({ explained_on: explainedOn, explained_to: explainedTo, relation: relation, consented_on: consentedOn, delivered_on: deliveredOn })[k]);
  if (hadPrev && changedFilled) {
    const rInput = cpPromptEditReason("説明・同意・交付の記録", `説明:${prevC.explained_on || "未"} / 同意:${prevC.consented_on || "未"} / 交付:${prevC.delivered_on || "未"}`);
    if (rInput === null) return;
    reason = rInput;
  }

  const oldCopy = JSON.parse(JSON.stringify(plan));
  if (!plan.consent || typeof plan.consent !== "object") plan.consent = {};
  plan.consent.explained_on = explainedOn;
  plan.consent.explained_to = explainedTo;
  plan.consent.relation = relation;
  plan.consent.consented_on = consentedOn;
  plan.consent.delivered_on = deliveredOn;

  const endedPrevVersions = [];
  if (plan.status !== "終了" && plan.status !== "実施中") {
    if (explainedOn && consentedOn && deliveredOn) {
      plan.status = "実施中";
      // 新しい版が実施中になったら、前の実施中の版は自動で「終了」（終了日と理由を残す）
      list.forEach(other => {
        if (other && other.id !== plan.id && !other.voided && Number(other.resident_id) === Number(plan.resident_id) && other.status === "実施中") {
          const oldOther = JSON.parse(JSON.stringify(other));
          other.status = "終了";
          other.ended_at = consentedOn || todayStr;
          other.end_reason = plan.review_reason
            ? `第${plan.version}版の実施開始に伴い終了（見直し理由: ${plan.review_reason}）`
            : `第${plan.version}版の実施開始に伴い終了`;
          cpAppendEditHistory(other, oldOther, ["status", "ended_at", "end_reason"], other.end_reason);
          endedPrevVersions.push(other.version);
        }
      });
    } else if (explainedOn) {
      plan.status = "同意待ち"; // [Claude修正 2026-10-19] 説明したあと、同意・交付がそろうまでは「同意待ち」
    } else {
      plan.status = "作成中";
    }
  }

  if (hadPrev && reason) {
    cpAppendEditHistory(plan, oldCopy, ["consent", "status"], reason);
  }
  db.save();
  renderCarePlanTab();
  renderResidentDetail();
  checkGlobalAlerts();

  let msg = `説明・同意・交付を保存しました（現在の状態: ${plan.status}）。`;
  if (endedPrevVersions.length > 0) {
    msg += `\n第${plan.version}版が「実施中」になったため、前の第${endedPrevVersions.join("・")}版を自動で「終了」にしました。`;
  }
  alert(msg);
}

// ⑥ モニタリングの追加・変更
function cpSaveCarePlanMonitoring(planId, monitoringId) {
  if (!cpCanEditCarePlanGoal()) {
    alert("モニタリングを記録できるのは計画作成担当者（ケアマネ）です。");
    return;
  }
  const plan = cpEnsureCarePlansArray().find(p => Number(p.id) === Number(planId));
  if (!plan) return;
  if (plan.status !== "実施中") { alert("モニタリングは、実施中の版で記録します。"); return; } // [Claude修正 2026-10-19]
  if (!Array.isArray(plan.monitorings)) plan.monitorings = [];
  const needs = Array.isArray(plan.needs) ? plan.needs : [];
  if (!needs.length) {
    alert("モニタリングを行う前に、「③ 課題ごとの目標とサービス」で課題・短期目標を登録してください。");
    return;
  }

  const prefix = monitoringId ? `cpMonEdit_${monitoringId}_` : `cpMonNew_`;
  const dateVal = (document.getElementById(prefix + "date")?.value || "").trim();
  const reviewNeeded = (document.getElementById(prefix + "review_needed")?.value || "").trim();
  const overallNote = (document.getElementById(prefix + "note")?.value || "").trim();

  if (dateVal && dateVal > toLocalDateStr(new Date())) { alert("モニタリングの日に、先の日付は入れられません。"); return; } // [Claude修正 2026-10-19]
  const missing = [];
  if (!dateVal) missing.push("モニタリング実施日");
  if (!reviewNeeded) missing.push("見直しが必要か");

  const items = [];
  needs.forEach((n, idx) => {
    const resVal = (document.getElementById(`${prefix}res_${n.id}`)?.value || "").trim();
    const noteVal = (document.getElementById(`${prefix}note_${n.id}`)?.value || "").trim();
    if (!resVal) missing.push(`短期目標${idx + 1}の評価（達成／一部／まだ）`);
    if (!noteVal) missing.push(`短期目標${idx + 1}の様子`);
    items.push({
      need_id: n.id,
      result: resVal,
      note: noteVal
    });
  });

  if (!overallNote) missing.push("全体のまとめ・今後の方針");
  if (missing.length > 0) {
    alert(`モニタリングで以下の欄が空です。入力・選択してから保存してください：\n・${missing.join("\n・")}`);
    return;
  }

  if (monitoringId) {
    const mon = plan.monitorings.find(m => Number(m.id) === Number(monitoringId));
    if (!mon) return;
    const reason = cpPromptEditReason(`${mon.date}のモニタリング記録`, mon.note || "");
    if (reason === null) return;
    const oldCopy = JSON.parse(JSON.stringify(plan));
    mon.date = dateVal;
    mon.by = cpLedgerStaff();
    mon.items = items;
    mon.review_needed = reviewNeeded;
    mon.note = overallNote;
    cpAppendEditHistory(plan, oldCopy, ["monitorings"], reason);
    gState.editingCarePlanMonitoringId = null;
  } else {
    plan.monitorings.push({
      id: Date.now(),
      date: dateVal,
      by: cpLedgerStaff(),
      items: items,
      review_needed: reviewNeeded,
      note: overallNote
    });
  }

  db.save();
  renderCarePlanTab();
  alert(monitoringId ? "モニタリング記録を変更しました。" : "モニタリング記録を保存しました。");
}

function cpStartEditCarePlanMonitoring(monId) {
  gState.editingCarePlanMonitoringId = monId ? Number(monId) : null;
  renderCarePlanTab();
}

// 6. ケアプラン計画書のA4印刷（最後に「説明を受け、同意しました」の日付・署名欄）
function printCarePlanDocument(planId) {
  const plan = cpEnsureCarePlansArray().find(p => Number(p.id) === Number(planId));
  if (!plan) {
    alert("印刷するケアプランが見つかりません。");
    return;
  }
  const r = (gState.residents || []).find(x => Number(x.id) === Number(plan.resident_id));
  const resName = r ? `${r.name} 様` : "利用者様";
  const roomNo = r && r.room_no ? `${r.room_no}号室` : "";
  const careLevel = r && r.care_level ? r.care_level : "";
  const birthDate = r && r.birth_date ? r.birth_date : "";
  const facName = typeof getFacilityName === "function" ? getFacilityName() : "介護施設";
  const periodStr = cpCarePlanPeriodText(plan);
  const assess = plan.assessment || {};
  const consent = plan.consent || {};
  const needs = Array.isArray(plan.needs) ? plan.needs : [];

  const needsRowsHtml = needs.length > 0 ? needs.map((n, idx) => {
    const svcs = Array.isArray(n.services) && n.services.length > 0 ? n.services : [{ content: "", who: "", frequency: "" }];
    return svcs.map((s, sIdx) => `
      <tr>
        ${sIdx === 0 ? `
          <td rowspan="${svcs.length}" style="border:1px solid #22302b; padding:5px; vertical-align:top;"><strong>${idx + 1}.</strong> ${escapeHtml(n.need || "")}</td>
          <td rowspan="${svcs.length}" style="border:1px solid #22302b; padding:5px; vertical-align:top;">
            <div>${escapeHtml(n.long_goal || "")}</div>
            <div style="font-size:11px; color:#4a5852; margin-top:2px;">(${escapeHtml(n.long_from || "")}〜${escapeHtml(n.long_to || "")})</div>
          </td>
          <td rowspan="${svcs.length}" style="border:1px solid #22302b; padding:5px; vertical-align:top;">
            <div>${escapeHtml(n.short_goal || "")}</div>
            <div style="font-size:11px; color:#4a5852; margin-top:2px;">(${escapeHtml(n.short_from || "")}〜${escapeHtml(n.short_to || "")})</div>
          </td>
        ` : ""}
        <td style="border:1px solid #22302b; padding:5px; vertical-align:top;">${escapeHtml(s.content || "")}</td>
        <td style="border:1px solid #22302b; padding:5px; vertical-align:top; text-align:center;">${escapeHtml(s.who || "")}</td>
        <td style="border:1px solid #22302b; padding:5px; vertical-align:top; text-align:center;">${escapeHtml(s.frequency || "")}</td>
      </tr>
    `).join("");
  }).join("") : `<tr><td colspan="6" style="border:1px solid #22302b; padding:8px; text-align:center;">課題・目標・サービスは未記入です</td></tr>`;

  const html = `
    <div style="font-family:var(--font-family); color:#22302b; font-size:12px; line-height:1.45; padding:4px;">
      <div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid #173f33; padding-bottom:6px; margin-bottom:8px;">
        <div>
          <div style="font-size:11px; color:#4a5852;">${escapeHtml(facName)}</div>
          <h2 style="font-size:18px; margin:2px 0 0 0; color:#173f33;">${(cpGetBillingSettings().facility_type === "public") ? "施設サービス計画書" : "介護計画書"}（ケアプラン）</h2>
        </div>
        <div style="text-align:right; font-size:12px;">
          <div><strong>第${Number(plan.version) || 1}版</strong>（状態: ${escapeHtml(plan.status || "作成中")}）</div>
          <div>作成日: ${escapeHtml(plan.created_at || "")} ／ 計画作成担当者: ${escapeHtml(plan.created_by || "")}</div>
        </div>
      </div>

      <table style="width:100%; border-collapse:collapse; margin-bottom:8px; font-size:12px;">
        <tr>
          <th style="border:1px solid #22302b; background:#f1f6f3; padding:4px 6px; width:13%; text-align:left;">利用者氏名</th>
          <td style="border:1px solid #22302b; padding:4px 6px; width:25%; font-weight:bold; font-size:13px;">${escapeHtml(roomNo)} ${escapeHtml(resName)}</td>
          <th style="border:1px solid #22302b; background:#f1f6f3; padding:4px 6px; width:12%; text-align:left;">生年月日</th>
          <td style="border:1px solid #22302b; padding:4px 6px; width:18%;">${escapeHtml(birthDate)}</td>
          <th style="border:1px solid #22302b; background:#f1f6f3; padding:4px 6px; width:12%; text-align:left;">要介護度</th>
          <td style="border:1px solid #22302b; padding:4px 6px; width:20%;">${escapeHtml(careLevel)}</td>
        </tr>
        <tr>
          <th style="border:1px solid #22302b; background:#f1f6f3; padding:4px 6px; text-align:left;">計画期間</th>
          <td colspan="5" style="border:1px solid #22302b; padding:4px 6px;">${escapeHtml(periodStr)}</td>
        </tr>
      </table>

      <table style="width:100%; border-collapse:collapse; margin-bottom:8px; font-size:12px;">
        <tr>
          <th style="border:1px solid #22302b; background:#f1f6f3; padding:4px 6px; width:20%; text-align:left;">本人の意向</th>
          <td style="border:1px solid #22302b; padding:4px 6px; width:30%; white-space:pre-wrap;">${escapeHtml(assess.person_wish || "")}</td>
          <th style="border:1px solid #22302b; background:#f1f6f3; padding:4px 6px; width:20%; text-align:left;">家族の意向</th>
          <td style="border:1px solid #22302b; padding:4px 6px; width:30%; white-space:pre-wrap;">${escapeHtml(assess.family_wish || "")}</td>
        </tr>
        <tr>
          <th style="border:1px solid #22302b; background:#f1f6f3; padding:4px 6px; text-align:left;">できること・好きなこと</th>
          <td style="border:1px solid #22302b; padding:4px 6px; white-space:pre-wrap;">${escapeHtml(assess.strengths || "")}</td>
          <th style="border:1px solid #22302b; background:#f1f6f3; padding:4px 6px; text-align:left;">困っていること（課題の背景）</th>
          <td style="border:1px solid #22302b; padding:4px 6px; white-space:pre-wrap;">${escapeHtml(assess.issues || "")}</td>
        </tr>
        <tr>
          <th style="border:1px solid #22302b; background:#f1f6f3; padding:4px 6px; text-align:left;">総合的な援助の方針</th>
          <td colspan="3" style="border:1px solid #22302b; padding:5px 6px; white-space:pre-wrap;">${escapeHtml(plan.policy || "")}</td>
        </tr>
      </table>

      <div style="font-weight:bold; font-size:12.5px; color:#173f33; margin-bottom:4px;">■ 課題（ニーズ）・目標・サービス内容</div>
      <table style="width:100%; border-collapse:collapse; margin-bottom:10px; font-size:11.5px;">
        <thead>
          <tr style="background:#f1f6f3;">
            <th style="border:1px solid #22302b; padding:4px 5px; width:18%; text-align:left;">生活全般の解決すべき課題（ニーズ）</th>
            <th style="border:1px solid #22302b; padding:4px 5px; width:19%; text-align:left;">長期目標（期間）</th>
            <th style="border:1px solid #22302b; padding:4px 5px; width:19%; text-align:left;">短期目標（期間）</th>
            <th style="border:1px solid #22302b; padding:4px 5px; width:26%; text-align:left;">サービス内容</th>
            <th style="border:1px solid #22302b; padding:4px 5px; width:9%; text-align:center;">担当</th>
            <th style="border:1px solid #22302b; padding:4px 5px; width:9%; text-align:center;">頻度</th>
          </tr>
        </thead>
        <tbody>
          ${needsRowsHtml}
        </tbody>
      </table>

      <table style="width:100%; border-collapse:collapse; margin-bottom:12px; font-size:12px;">
        <tr>
          <th style="border:1px solid #22302b; background:#f1f6f3; padding:4px 6px; width:16%; text-align:left;">説明日</th>
          <td style="border:1px solid #22302b; padding:4px 6px; width:17%;">${escapeHtml(consent.explained_on || "")}</td>
          <th style="border:1px solid #22302b; background:#f1f6f3; padding:4px 6px; width:16%; text-align:left;">説明した相手</th>
          <td style="border:1px solid #22302b; padding:4px 6px; width:18%;">${escapeHtml(consent.explained_to || "")}${consent.relation ? "（" + escapeHtml(consent.relation) + "）" : ""}</td>
          <th style="border:1px solid #22302b; background:#f1f6f3; padding:4px 6px; width:15%; text-align:left;">同意日・交付日</th>
          <td style="border:1px solid #22302b; padding:4px 6px; width:18%;">同意: ${escapeHtml(consent.consented_on || "")}<br>交付: ${escapeHtml(consent.delivered_on || "")}</td>
        </tr>
      </table>

      <div style="border:1px solid #22302b; padding:10px 12px; margin-top:8px;">
        <div style="font-weight:bold; font-size:13px; margin-bottom:10px;">上記計画について説明を受け、同意し、交付を受けました。</div>
        <div style="display:flex; justify-content:space-between; align-items:flex-end; gap:16px; flex-wrap:wrap; font-size:12.5px;">
          <div>同意日：　　　　年　　　月　　　日</div>
          <div>利用者氏名（署名）：<u>　　　　　　　　　　　　　　　</u></div>
          <div>家族・代理人氏名（署名）：<u>　　　　　　　　　　　　　</u>（続柄：　　　　）</div>
        </div>
      </div>
    </div>
  `;
  runPrintJob(html, { page: "A4 portrait", fitOnePage: true, minScale: 0.8 }); // [Claude修正 2026-10-19] 小さくしすぎない（入らなければ2枚に続ける）
}

// ケアプランタブの描画本体
function renderCarePlanTab() {
  const container = document.getElementById("carePlanTabContainer");
  if (!container) return;

  const residents = cpCurrentResidents();
  const resId = Number(gState.selectedResidentId);
  const r = (gState.residents || []).find(x => Number(x.id) === resId) || residents[0];
  if (!r) {
    container.innerHTML = `<p class="panel-note">利用者を選択してください。</p>`;
    return;
  }
  const canEdit = cpCanEditCarePlanGoal();
  const plans = cpGetPlansForResident(r.id);
  const curPlan = cpGetSelectedCarePlan(r.id);

  // 利用者切替セレクト
  const resOptions = residents.map(res =>
    `<option value="${res.id}" ${Number(res.id) === Number(r.id) ? "selected" : ""}>${escapeHtml(String(res.room_no || ""))}号室 ${escapeHtml(res.name || "")} 様</option>`
  ).join("");

  // 1. 版の一覧（新しい順）
  let versionListHtml = "";
  if (plans.length === 0) {
    versionListHtml = `
      <div class="cp-plan-empty">
        <div class="cp-plan-empty-text">${escapeHtml(r.name)} 様のケアプランはまだ作成されていません。</div>
        ${r.care_plan_goal ? `<div class="cp-plan-legacy-note">カルテの従来のケアプラン目標: ${escapeHtml(r.care_plan_goal)}${r.care_plan_consent_date ? "（同意日: " + escapeHtml(r.care_plan_consent_date) + "）" : ""}</div>` : ""}
        ${canEdit
          ? `<button type="button" class="btn btn-primary" onclick="cpCreateInitialCarePlan()">第1版のケアプランを作成する</button>`
          : `<div class="cp-plan-readonly-msg">計画作成担当者が書きます</div>`
        }
      </div>
    `;
  } else {
    const rows = plans.map(p => {
      const isSelected = curPlan && Number(curPlan.id) === Number(p.id);
      const isActive = p.status === "実施中";
      const consentDate = (p.consent && p.consent.consented_on) ? p.consent.consented_on : "未記入";
      const period = cpCarePlanPeriodText(p);
      return `
        <div class="cp-plan-ver-card ${isActive ? "cp-plan-ver-row-active" : ""} ${isSelected ? "cp-plan-ver-row-selected" : ""}" onclick="cpSelectCarePlanVersion(${p.id})">
          <div class="cp-plan-ver-card-main">
            <span class="cp-plan-ver-num">第${Number(p.version) || 1}版</span>
            ${cpCarePlanStatusBadgeHtml(p.status)}
            <span class="cp-plan-ver-meta">期間: ${escapeHtml(period)}</span>
            <span class="cp-plan-ver-meta">作成: ${escapeHtml(p.created_by || "未記入")}（${escapeHtml(p.created_at || "")}）</span>
            <span class="cp-plan-ver-meta">同意の日: ${escapeHtml(consentDate)}</span>
          </div>
          <div class="cp-plan-ver-card-act">
            <button type="button" class="btn ${isSelected ? "btn-primary" : "btn-secondary"} cp-plan-ver-btn" onclick="event.stopPropagation(); cpSelectCarePlanVersion(${p.id});">${isSelected ? "表示中" : "開く"}</button>
          </div>
        </div>
      `;
    }).join("");

    versionListHtml = `
      <div class="cp-plan-ver-list">
        ${rows}
      </div>
    `;
  }

  // 計画が選ばれているときの詳細（①〜⑥のアコーディオン）
  let detailHtml = "";
  if (curPlan) {
    const assess = curPlan.assessment || {};
    const consent = curPlan.consent || {};
    const needs = Array.isArray(curPlan.needs) ? curPlan.needs : [];
    const meetings = Array.isArray(curPlan.meetings) ? curPlan.meetings : [];
    const monitorings = Array.isArray(curPlan.monitorings) ? curPlan.monitorings : [];
    const summaries = cpSummariesOfResident(r.id).filter(s => !s.voided); // [Claude修正] 引用の選択肢も新しい順（一番上が最新）
    const quotedSummary = assess.summary_id ? summaries.find(s => Number(s.id) === Number(assess.summary_id)) : null;
    const isPlanEnded = curPlan.status === "終了";
    // [Claude修正 2026-10-19] 中身（①②③）は作成中・同意待ちの版だけ書ける。⑤は終了以外、⑥モニタリングは実施中の版だけ
    const canModifyThisPlan = canEdit && cpCarePlanContentEditable(curPlan);
    const canEditConsent = canEdit && !isPlanEnded;
    const canMonitor = canEdit && curPlan.status === "実施中";
    const lockNote = (canEdit && !canModifyThisPlan) ? `<div class="cp-plan-readonly-msg">${escapeHtml(cpCarePlanLockedMsg(curPlan))}</div>` : "";

    // ① アセスメント
    let sec1Body = "";
    if (canModifyThisPlan) {
      const summaryQuoteBar = summaries.length > 0 ? `
        <div class="cp-plan-quote-bar">
          <label for="cpQuoteSummarySelect" class="cp-plan-label-inline">介護サマリーから引用:</label>
          <select id="cpQuoteSummarySelect" class="form-control cp-plan-select-inline">
            ${summaries.map(s => `<option value="${s.id}" ${Number(assess.summary_id) === Number(s.id) ? "selected" : ""}>${escapeHtml(s.created_at || "")} ${escapeHtml(s.summary_type || "介護サマリー")}（${escapeHtml(s.staff_name || "")}）</option>`).join("")}
          </select>
          <button type="button" class="btn btn-secondary" onclick="cpQuoteCareSummaryToAssessment(${curPlan.id})">サマリーから引用</button>
        </div>
      ` : `<div class="cp-plan-subnote">※この方の介護サマリーが登録されると「サマリーから引用」ボタンで写せます。</div>`;

      sec1Body = `
        ${summaryQuoteBar}
        <input type="hidden" id="cpAssessSummaryId" value="${assess.summary_id ? escapeHtml(String(assess.summary_id)) : ""}">
        <div class="cp-plan-form-grid">
          <div>
            <label class="cp-plan-field-label" for="cpAssessPersonWish">本人の意向</label>
            <textarea id="cpAssessPersonWish" class="form-control" rows="2">${escapeHtml(assess.person_wish || "")}</textarea>
          </div>
          <div>
            <label class="cp-plan-field-label" for="cpAssessFamilyWish">家族の意向</label>
            <textarea id="cpAssessFamilyWish" class="form-control" rows="2">${escapeHtml(assess.family_wish || "")}</textarea>
          </div>
          <div>
            <label class="cp-plan-field-label" for="cpAssessStrengths">できること・好きなこと</label>
            <textarea id="cpAssessStrengths" class="form-control" rows="2">${escapeHtml(assess.strengths || "")}</textarea>
          </div>
          <div>
            <label class="cp-plan-field-label" for="cpAssessIssues">困っていること</label>
            <textarea id="cpAssessIssues" class="form-control" rows="2">${escapeHtml(assess.issues || "")}</textarea>
          </div>
        </div>
        <div class="cp-plan-action-row">
          <button type="button" class="btn btn-primary" onclick="cpSaveCarePlanAssessment(${curPlan.id})">アセスメントを保存</button>
        </div>
      `;
    } else {
      sec1Body = `
        ${!canEdit ? `<div class="cp-plan-readonly-msg">計画作成担当者が書きます</div>` : ""}
        ${quotedSummary ? `<div class="cp-plan-subnote">参考にした介護サマリー: ${escapeHtml(quotedSummary.created_at || "")} ${escapeHtml(quotedSummary.summary_type || "")}</div>` : ""}
        <div class="cp-plan-read-grid">
          <div class="cp-plan-read-box"><div class="cp-plan-field-label">本人の意向</div><div class="cp-plan-read-val">${assess.person_wish ? escapeHtml(assess.person_wish) : `<span class="cp-unset">未記入</span>`}</div></div>
          <div class="cp-plan-read-box"><div class="cp-plan-field-label">家族の意向</div><div class="cp-plan-read-val">${assess.family_wish ? escapeHtml(assess.family_wish) : `<span class="cp-unset">未記入</span>`}</div></div>
          <div class="cp-plan-read-box"><div class="cp-plan-field-label">できること・好きなこと</div><div class="cp-plan-read-val">${assess.strengths ? escapeHtml(assess.strengths) : `<span class="cp-unset">未記入</span>`}</div></div>
          <div class="cp-plan-read-box"><div class="cp-plan-field-label">困っていること</div><div class="cp-plan-read-val">${assess.issues ? escapeHtml(assess.issues) : `<span class="cp-unset">未記入</span>`}</div></div>
        </div>
      `;
    }

    // ② 総合的な援助の方針
    let sec2Body = "";
    if (canModifyThisPlan) {
      sec2Body = `
        <label class="cp-plan-field-label" for="cpPolicyInput">総合的な援助の方針</label>
        <textarea id="cpPolicyInput" class="form-control" rows="3">${escapeHtml(curPlan.policy || "")}</textarea>
        <div class="cp-plan-action-row">
          <button type="button" class="btn btn-primary" onclick="cpSaveCarePlanPolicy(${curPlan.id})">方針を保存</button>
        </div>
      `;
    } else {
      sec2Body = `
        ${!canEdit ? `<div class="cp-plan-readonly-msg">計画作成担当者が書きます</div>` : ""}
        <div class="cp-plan-read-box">
          <div class="cp-plan-read-val">${curPlan.policy ? escapeHtml(curPlan.policy) : `<span class="cp-unset">未記入</span>`}</div>
        </div>
      `;
    }

    // ③ 課題ごとの目標とサービス
    const needsCardsHtml = needs.length > 0 ? needs.map((n, idx) => {
      const isEditingNeed = canModifyThisPlan && Number(gState.editingCarePlanNeedId) === Number(n.id);
      const svcs = Array.isArray(n.services) ? n.services : [];
      const diffShort = n.short_to ? cpDaysUntil(n.short_to) : null;
      let shortBadge = "";
      if (curPlan.status === "実施中" && diffShort !== null && diffShort <= 14) {
        shortBadge = diffShort < 0
          ? `<span class="cp-plan-term-warn cp-plan-term-expired">期限切れ（${-diffShort}日超過）</span>`
          : `<span class="cp-plan-term-warn">期限まであと${diffShort}日</span>`;
      }

      const svcRows = svcs.length > 0 ? svcs.map(s => {
        const isEditingSvc = canModifyThisPlan && gState.editingCarePlanServiceKey === `${n.id}_${s.id}`;
        if (isEditingSvc) {
          return `
            <div class="cp-plan-svc-item cp-plan-svc-edit">
              <div class="cp-plan-form-grid-3">
                <div>
                  <label class="cp-plan-field-label">サービス内容</label>
                  <input type="text" id="cpSvcEdit_${n.id}_${s.id}_content" class="form-control" value="${escapeHtml(s.content || "")}">
                </div>
                <div>
                  <label class="cp-plan-field-label">担当</label>
                  <input type="text" id="cpSvcEdit_${n.id}_${s.id}_who" class="form-control" value="${escapeHtml(s.who || "")}">
                </div>
                <div>
                  <label class="cp-plan-field-label">頻度</label>
                  <input type="text" id="cpSvcEdit_${n.id}_${s.id}_frequency" class="form-control" value="${escapeHtml(s.frequency || "")}">
                </div>
              </div>
              <div class="cp-plan-action-row">
                <button type="button" class="btn btn-secondary" onclick="cpStartEditCarePlanService(null, null)">キャンセル</button>
                <button type="button" class="btn btn-primary" onclick="cpSaveCarePlanService(${curPlan.id}, ${n.id}, ${s.id})">サービスの変更を保存</button>
              </div>
            </div>
          `;
        }
        return `
          <div class="cp-plan-svc-item">
            <div class="cp-plan-svc-main">
              <strong>サービス内容:</strong> ${escapeHtml(s.content || "")}
              <span class="cp-plan-svc-meta">（担当: ${escapeHtml(s.who || "")} ／ 頻度: ${escapeHtml(s.frequency || "")}）</span>
            </div>
            ${canModifyThisPlan ? `<button type="button" class="btn btn-secondary cp-part-btn" onclick="cpStartEditCarePlanService(${n.id}, ${s.id})">変更</button>` : ""}
          </div>
        `;
      }).join("") : `<div class="cp-plan-subnote">サービス内容がまだ登録されていません。</div>`;

      const addSvcForm = canModifyThisPlan ? `
        <div class="cp-plan-svc-add">
          <div class="cp-plan-subhead">＋ この課題にサービスを足す</div>
          <div class="cp-plan-form-grid-3">
            <div>
              <label class="cp-plan-field-label" for="cpSvcNew_${n.id}_content">サービス内容</label>
              <input type="text" id="cpSvcNew_${n.id}_content" class="form-control">
            </div>
            <div>
              <label class="cp-plan-field-label" for="cpSvcNew_${n.id}_who">担当</label>
              <input type="text" id="cpSvcNew_${n.id}_who" class="form-control">
            </div>
            <div>
              <label class="cp-plan-field-label" for="cpSvcNew_${n.id}_frequency">頻度</label>
              <input type="text" id="cpSvcNew_${n.id}_frequency" class="form-control">
            </div>
          </div>
          <div class="cp-plan-action-row">
            <button type="button" class="btn btn-secondary" onclick="cpSaveCarePlanService(${curPlan.id}, ${n.id}, null)">サービスを追加</button>
          </div>
        </div>
      ` : "";

      if (isEditingNeed) {
        return `
          <div class="cp-plan-need-card">
            <div class="cp-plan-need-head"><strong>課題 ${idx + 1} の変更</strong></div>
            <div class="cp-plan-form-grid">
              <div style="grid-column: 1 / -1;">
                <label class="cp-plan-field-label">課題（ニーズ）</label>
                <input type="text" id="cpNeedEdit_${n.id}_need" class="form-control" value="${escapeHtml(n.need || "")}">
              </div>
              <div>
                <label class="cp-plan-field-label">長期目標</label>
                <input type="text" id="cpNeedEdit_${n.id}_long_goal" class="form-control" value="${escapeHtml(n.long_goal || "")}">
                <div class="cp-plan-date-pair">
                  <input type="date" id="cpNeedEdit_${n.id}_long_from" class="form-control" value="${escapeHtml(n.long_from || "")}">
                  <span>〜</span>
                  <input type="date" id="cpNeedEdit_${n.id}_long_to" class="form-control" value="${escapeHtml(n.long_to || "")}">
                </div>
              </div>
              <div>
                <label class="cp-plan-field-label">短期目標</label>
                <input type="text" id="cpNeedEdit_${n.id}_short_goal" class="form-control" value="${escapeHtml(n.short_goal || "")}">
                <div class="cp-plan-date-pair">
                  <input type="date" id="cpNeedEdit_${n.id}_short_from" class="form-control" value="${escapeHtml(n.short_from || "")}">
                  <span>〜</span>
                  <input type="date" id="cpNeedEdit_${n.id}_short_to" class="form-control" value="${escapeHtml(n.short_to || "")}">
                </div>
              </div>
            </div>
            <div class="cp-plan-action-row">
              <button type="button" class="btn btn-secondary" onclick="cpStartEditCarePlanNeed(null)">キャンセル</button>
              <button type="button" class="btn btn-primary" onclick="cpSaveCarePlanNeed(${curPlan.id}, ${n.id})">課題・目標の変更を保存</button>
            </div>
          </div>
        `;
      }

      return `
        <div class="cp-plan-need-card">
          <div class="cp-plan-need-head">
            <div><strong>課題 ${idx + 1}:</strong> ${escapeHtml(n.need || "")} ${shortBadge}</div>
            ${canModifyThisPlan ? `<button type="button" class="btn btn-secondary cp-part-btn" onclick="cpStartEditCarePlanNeed(${n.id})">課題・目標を変更</button>` : ""}
          </div>
          <div class="cp-plan-read-grid">
            <div class="cp-plan-read-box">
              <div class="cp-plan-field-label">長期目標（${escapeHtml(n.long_from || "")} 〜 ${escapeHtml(n.long_to || "")}）</div>
              <div class="cp-plan-read-val">${escapeHtml(n.long_goal || "")}</div>
            </div>
            <div class="cp-plan-read-box">
              <div class="cp-plan-field-label">短期目標（${escapeHtml(n.short_from || "")} 〜 ${escapeHtml(n.short_to || "")}）</div>
              <div class="cp-plan-read-val">${escapeHtml(n.short_goal || "")}</div>
            </div>
          </div>
          <div class="cp-plan-svc-list">
            <div class="cp-plan-field-label">サービス内容（${svcs.length}件）</div>
            ${svcRows}
            ${addSvcForm}
          </div>
        </div>
      `;
    }).join("") : `<div class="cp-plan-subnote">課題・目標はまだ登録されていません。</div>`;

    const addNeedFormHtml = canModifyThisPlan ? `
      <div class="cp-plan-add-box">
        <div class="cp-plan-subhead">＋ 新しい課題（ニーズ）と目標を足す</div>
        <div class="cp-plan-form-grid">
          <div style="grid-column: 1 / -1;">
            <label class="cp-plan-field-label" for="cpNeedNew_need">課題（ニーズ）</label>
            <input type="text" id="cpNeedNew_need" class="form-control">
          </div>
          <div>
            <label class="cp-plan-field-label" for="cpNeedNew_long_goal">長期目標</label>
            <input type="text" id="cpNeedNew_long_goal" class="form-control">
            <div class="cp-plan-date-pair">
              <label class="cp-plan-date-lbl">開始 <input type="date" id="cpNeedNew_long_from" class="form-control"></label>
              <label class="cp-plan-date-lbl">終了 <input type="date" id="cpNeedNew_long_to" class="form-control"></label>
            </div>
          </div>
          <div>
            <label class="cp-plan-field-label" for="cpNeedNew_short_goal">短期目標</label>
            <input type="text" id="cpNeedNew_short_goal" class="form-control">
            <div class="cp-plan-date-pair">
              <label class="cp-plan-date-lbl">開始 <input type="date" id="cpNeedNew_short_from" class="form-control"></label>
              <label class="cp-plan-date-lbl">終了 <input type="date" id="cpNeedNew_short_to" class="form-control"></label>
            </div>
          </div>
        </div>
        <div class="cp-plan-action-row">
          <button type="button" class="btn btn-primary" onclick="cpSaveCarePlanNeed(${curPlan.id}, null)">課題・目標を追加</button>
        </div>
      </div>
    ` : (!canEdit ? `<div class="cp-plan-readonly-msg">計画作成担当者が書きます</div>` : "");

    const sec3Body = `${needsCardsHtml}${addNeedFormHtml}`;

    // ④ 話し合いの記録（職員全員が意見を書ける）
    const meetingsListHtml = meetings.length > 0 ? meetings.map((m, idx) => `
      <div class="cp-plan-meet-card">
        <div class="cp-plan-need-head">
          <div><strong>第${idx + 1}回 話し合い</strong>（${escapeHtml(m.date || "")} ／ 記録: ${escapeHtml(m.recorded_by || "")}）</div>
          ${!isPlanEnded && (canEdit || (m.recorded_by && m.recorded_by === cpLedgerStaff())) ? `<button type="button" class="btn btn-secondary cp-part-btn" onclick="cpEditCarePlanMeeting(${curPlan.id}, ${m.id})">記録を訂正</button>` : ""}
        </div>
        <div class="cp-plan-subnote">参加した職員: ${escapeHtml(m.attendees || "")}</div>
        <div class="cp-plan-read-box" style="margin-top:6px;">
          <div class="cp-plan-field-label">出た意見</div>
          <div class="cp-plan-read-val">${escapeHtml(m.opinions || "")}</div>
        </div>
        ${!isPlanEnded ? `
          <div class="cp-plan-opinion-bar">
            <input type="text" id="cpMeetAddOpinion_${m.id}" class="form-control" aria-label="この話し合いに意見を追加">
            <button type="button" class="btn btn-secondary" onclick="cpAppendOpinionToMeeting(${curPlan.id}, ${m.id})">意見を追加</button>
          </div>
        ` : ""}
      </div>
    `).join("") : `<div class="cp-plan-subnote">話し合いの記録はまだありません。</div>`;

    const addMeetingFormHtml = !isPlanEnded ? `
      <div class="cp-plan-add-box">
        <div class="cp-plan-subhead">＋ 話し合いの記録・意見を足す（職員全員が書けます）</div>
        <div class="cp-plan-form-grid">
          <div>
            <label class="cp-plan-field-label" for="cpMeetDate">話し合いの日</label>
            <input type="date" id="cpMeetDate" class="form-control">
          </div>
          <div>
            <label class="cp-plan-field-label" for="cpMeetAttendees">参加した職員</label>
            <input type="text" id="cpMeetAttendees" class="form-control">
          </div>
          <div style="grid-column: 1 / -1;">
            <label class="cp-plan-field-label" for="cpMeetOpinions">出た意見</label>
            <textarea id="cpMeetOpinions" class="form-control" rows="2"></textarea>
          </div>
        </div>
        <div class="cp-plan-action-row">
          <button type="button" class="btn btn-primary" onclick="cpAddCarePlanMeeting(${curPlan.id})">話し合いの記録を保存</button>
        </div>
      </div>
    ` : "";

    const sec4Body = `${meetingsListHtml}${addMeetingFormHtml}`;

    // ⑤ 説明・同意・交付
    let sec5Body = "";
    const todayMax = toLocalDateStr(new Date());
    if (canEditConsent) {
      const missForConsent = curPlan.status !== "実施中" ? cpCarePlanMissingForConsent(curPlan) : [];
      sec5Body = `
        <div class="cp-plan-subnote">${curPlan.status === "実施中" ? "実施中の版です。日付を訂正するときは理由を入れます（空にはできません）。" : "説明日・同意日・交付日の3つがそろうと、この版の状態が「実施中」になります（先の日付は入れられません）。"}</div>
        ${missForConsent.length ? `<div class="cp-plan-readonly-msg">同意の日を入れる前に、次のものをそろえてください：${escapeHtml(missForConsent.join("、"))}</div>` : ""}
        <div class="cp-plan-form-grid-3">
          <div>
            <label class="cp-plan-field-label" for="cpConsentExplainedOn">説明した日</label>
            <input type="date" id="cpConsentExplainedOn" class="form-control" max="${todayMax}" value="${escapeHtml(consent.explained_on || "")}">
          </div>
          <div>
            <label class="cp-plan-field-label" for="cpConsentExplainedTo">説明した相手（本人／家族）</label>
            <select id="cpConsentExplainedTo" class="form-control">
              <option value="">選んでください</option>
              <option value="本人" ${consent.explained_to === "本人" ? "selected" : ""}>本人</option>
              <option value="家族" ${consent.explained_to === "家族" ? "selected" : ""}>家族</option>
              <option value="本人・家族" ${consent.explained_to === "本人・家族" ? "selected" : ""}>本人・家族</option>
            </select>
          </div>
          <div>
            <label class="cp-plan-field-label" for="cpConsentRelation">家族の続柄</label>
            <input type="text" id="cpConsentRelation" class="form-control" value="${escapeHtml(consent.relation || "")}">
          </div>
          <div>
            <label class="cp-plan-field-label" for="cpConsentConsentedOn">同意を得た日</label>
            <input type="date" id="cpConsentConsentedOn" class="form-control" max="${todayMax}" value="${escapeHtml(consent.consented_on || "")}">
          </div>
          <div>
            <label class="cp-plan-field-label" for="cpConsentDeliveredOn">交付日</label>
            <input type="date" id="cpConsentDeliveredOn" class="form-control" max="${todayMax}" value="${escapeHtml(consent.delivered_on || "")}">
          </div>
        </div>
        <div class="cp-plan-action-row">
          <button type="button" class="btn btn-primary" onclick="cpSaveCarePlanConsent(${curPlan.id})">説明・同意・交付を保存</button>
        </div>
      `;
    } else {
      sec5Body = `
        ${!canEdit ? `<div class="cp-plan-readonly-msg">計画作成担当者が書きます</div>` : ""}
        <div class="cp-plan-read-grid">
          <div class="cp-plan-read-box"><div class="cp-plan-field-label">説明した日</div><div class="cp-plan-read-val">${consent.explained_on ? escapeHtml(consent.explained_on) : `<span class="cp-unset">未記入</span>`}</div></div>
          <div class="cp-plan-read-box"><div class="cp-plan-field-label">説明した相手</div><div class="cp-plan-read-val">${consent.explained_to ? escapeHtml(consent.explained_to) + (consent.relation ? "（続柄: " + escapeHtml(consent.relation) + "）" : "") : `<span class="cp-unset">未記入</span>`}</div></div>
          <div class="cp-plan-read-box"><div class="cp-plan-field-label">同意を得た日</div><div class="cp-plan-read-val">${consent.consented_on ? escapeHtml(consent.consented_on) : `<span class="cp-unset">未記入</span>`}</div></div>
          <div class="cp-plan-read-box"><div class="cp-plan-field-label">交付日</div><div class="cp-plan-read-val">${consent.delivered_on ? escapeHtml(consent.delivered_on) : `<span class="cp-unset">未記入</span>`}</div></div>
        </div>
      `;
    }

    // ⑥ モニタリング
    const monListHtml = monitorings.length > 0 ? monitorings.map((m, idx) => {
      const isEditingMon = canMonitor && Number(gState.editingCarePlanMonitoringId) === Number(m.id);
      if (isEditingMon) {
        const editNeedRows = needs.map((n, nIdx) => {
          const itemObj = (Array.isArray(m.items) ? m.items : []).find(it => Number(it.need_id) === Number(n.id)) || {};
          return `
            <div class="cp-plan-mon-item-row">
              <div class="cp-plan-field-label">短期目標 ${nIdx + 1}: ${escapeHtml(n.short_goal || n.need || "")}</div>
              <div class="cp-plan-form-grid">
                <div>
                  <label class="cp-plan-field-label">評価</label>
                  <select id="cpMonEdit_${m.id}_res_${n.id}" class="form-control">
                    <option value="">選んでください</option>
                    <option value="達成" ${itemObj.result === "達成" ? "selected" : ""}>達成</option>
                    <option value="一部" ${itemObj.result === "一部" ? "selected" : ""}>一部</option>
                    <option value="まだ" ${itemObj.result === "まだ" ? "selected" : ""}>まだ</option>
                  </select>
                </div>
                <div>
                  <label class="cp-plan-field-label">様子</label>
                  <input type="text" id="cpMonEdit_${m.id}_note_${n.id}" class="form-control" value="${escapeHtml(itemObj.note || "")}">
                </div>
              </div>
            </div>
          `;
        }).join("");
        return `
          <div class="cp-plan-need-card">
            <div class="cp-plan-need-head"><strong>第${idx + 1}回 モニタリングの変更</strong></div>
            <div class="cp-plan-form-grid">
              <div>
                <label class="cp-plan-field-label">実施日</label>
                <input type="date" id="cpMonEdit_${m.id}_date" class="form-control" value="${escapeHtml(m.date || "")}">
              </div>
              <div>
                <label class="cp-plan-field-label">見直しが必要か</label>
                <select id="cpMonEdit_${m.id}_review_needed" class="form-control">
                  <option value="">選んでください</option>
                  <option value="継続（見直し不要）" ${m.review_needed === "継続（見直し不要）" ? "selected" : ""}>継続（見直し不要）</option>
                  <option value="見直し必要" ${m.review_needed === "見直し必要" ? "selected" : ""}>見直し必要</option>
                </select>
              </div>
            </div>
            ${editNeedRows}
            <div style="margin-top:8px;">
              <label class="cp-plan-field-label">全体のまとめ・今後の方針</label>
              <textarea id="cpMonEdit_${m.id}_note" class="form-control" rows="2">${escapeHtml(m.note || "")}</textarea>
            </div>
            <div class="cp-plan-action-row">
              <button type="button" class="btn btn-secondary" onclick="cpStartEditCarePlanMonitoring(null)">キャンセル</button>
              <button type="button" class="btn btn-primary" onclick="cpSaveCarePlanMonitoring(${curPlan.id}, ${m.id})">モニタリングの変更を保存</button>
            </div>
          </div>
        `;
      }

      const itemLines = (Array.isArray(m.items) ? m.items : []).map(it => {
        const nObj = needs.find(x => Number(x.id) === Number(it.need_id));
        const goalTitle = nObj ? (nObj.short_goal || nObj.need) : "短期目標";
        return `<div class="cp-plan-mon-eval-line">・<strong>${escapeHtml(goalTitle)}</strong>：評価【<strong>${escapeHtml(it.result || "")}</strong>】 ／ 様子: ${escapeHtml(it.note || "")}</div>`;
      }).join("");

      return `
        <div class="cp-plan-need-card">
          <div class="cp-plan-need-head">
            <div><strong>第${idx + 1}回 モニタリング</strong>（${escapeHtml(m.date || "")} ／ 担当: ${escapeHtml(m.by || "")} ／ 判定: <strong>${escapeHtml(m.review_needed || "")}</strong>）</div>
            ${canMonitor ? `<button type="button" class="btn btn-secondary cp-part-btn" onclick="cpStartEditCarePlanMonitoring(${m.id})">変更</button>` : ""}
          </div>
          <div>${itemLines}</div>
          <div class="cp-plan-read-box" style="margin-top:6px;">
            <div class="cp-plan-field-label">全体のまとめ・今後の方針</div>
            <div class="cp-plan-read-val">${escapeHtml(m.note || "")}</div>
          </div>
        </div>
      `;
    }).join("") : `<div class="cp-plan-subnote">モニタリングの記録はまだありません。</div>`;

    let addMonFormHtml = "";
    if (!canMonitor && canEdit && !isPlanEnded) addMonFormHtml = `<div class="cp-plan-subnote">モニタリングは、この版が実施中になってから記録します。</div>`; // [Claude修正 2026-10-19]
    if (canMonitor) {
      if (needs.length === 0) {
        addMonFormHtml = `<div class="cp-plan-subnote">※「③ 課題ごとの目標とサービス」に短期目標を登録すると、ここからモニタリングを記録できます。</div>`;
      } else {
        const newNeedRows = needs.map((n, nIdx) => `
          <div class="cp-plan-mon-item-row">
            <div class="cp-plan-field-label">短期目標 ${nIdx + 1}: ${escapeHtml(n.short_goal || n.need || "")}</div>
            <div class="cp-plan-form-grid">
              <div>
                <label class="cp-plan-field-label" for="cpMonNew_res_${n.id}">評価（達成／一部／まだ）</label>
                <select id="cpMonNew_res_${n.id}" class="form-control">
                  <option value="">選んでください</option>
                  <option value="達成">達成</option>
                  <option value="一部">一部</option>
                  <option value="まだ">まだ</option>
                </select>
              </div>
              <div>
                <label class="cp-plan-field-label" for="cpMonNew_note_${n.id}">様子</label>
                <input type="text" id="cpMonNew_note_${n.id}" class="form-control">
              </div>
            </div>
          </div>
        `).join("");

        addMonFormHtml = `
          <div class="cp-plan-add-box">
            <div class="cp-plan-subhead">＋ モニタリングを記録する</div>
            <div class="cp-plan-form-grid">
              <div>
                <label class="cp-plan-field-label" for="cpMonNew_date">実施日</label>
                <input type="date" id="cpMonNew_date" class="form-control">
              </div>
              <div>
                <label class="cp-plan-field-label" for="cpMonNew_review_needed">見直しが必要か</label>
                <select id="cpMonNew_review_needed" class="form-control">
                  <option value="">選んでください</option>
                  <option value="継続（見直し不要）">継続（見直し不要）</option>
                  <option value="見直し必要">見直し必要</option>
                </select>
              </div>
            </div>
            ${newNeedRows}
            <div style="margin-top:8px;">
              <label class="cp-plan-field-label" for="cpMonNew_note">全体のまとめ・今後の方針</label>
              <textarea id="cpMonNew_note" class="form-control" rows="2"></textarea>
            </div>
            <div class="cp-plan-action-row">
              <button type="button" class="btn btn-primary" onclick="cpSaveCarePlanMonitoring(${curPlan.id}, null)">モニタリングを保存</button>
            </div>
          </div>
        `;
      }
    } else if (!canEdit) {
      addMonFormHtml = `<div class="cp-plan-readonly-msg">計画作成担当者が書きます</div>`;
    }

    const sec6Body = `${monListHtml}${addMonFormHtml}`;

    const histCount = Array.isArray(curPlan.edit_history) ? curPlan.edit_history.length : 0;
    const endedBanner = curPlan.status === "終了" ? `
      <div class="cp-plan-ended-banner">
        <strong>この版（第${curPlan.version}版）は終了しています。</strong>
        終了日: ${escapeHtml(curPlan.ended_at || "未記録")} ／ 終了理由: ${escapeHtml(curPlan.end_reason || "未記録")}
      </div>
    ` : "";

    detailHtml = `
      <div class="cp-plan-detail-header">
        <div class="cp-plan-detail-title">
          <span><strong>${escapeHtml(r.name)} 様 第${Number(curPlan.version) || 1}版</strong></span>
          ${cpCarePlanStatusBadgeHtml(curPlan.status)}
          <span class="cp-plan-subnote">作成: ${escapeHtml(curPlan.created_at || "")}（${escapeHtml(curPlan.created_by || "")}）</span>
          ${curPlan.review_reason ? `<span class="cp-plan-subnote">／ 見直し理由: ${escapeHtml(curPlan.review_reason)}</span>` : ""}
        </div>
        <div class="cp-plan-detail-actions">
          <button type="button" class="btn btn-secondary" onclick="printCarePlanDocument(${curPlan.id})">計画書をA4印刷</button>
          ${histCount > 0 ? `<button type="button" class="btn btn-secondary" onclick="cpShowGenericEditHistory('care_plans', ${curPlan.id}, 'ケアプラン 第${curPlan.version}版')">変更履歴 (${histCount})</button>` : ""}
          ${canEdit && (curPlan.status === "実施中" || curPlan.status === "終了") && !cpCarePlanHasDraft(r.id) ? `<button type="button" class="btn btn-primary" onclick="cpReviewAndCreateNextVersion(${curPlan.id})">見直して新しい版を作る</button>` : ""}
          ${canEdit && curPlan.status !== "終了" ? `<button type="button" class="btn btn-secondary" onclick="cpEndCarePlanManually(${curPlan.id})">この版を終了にする</button>` : ""}
        </div>
      </div>
      ${endedBanner}
      ${curPlan.status === "実施中" ? lockNote : ""}

      <details class="care-accordion cp-plan-acc" open>
        <summary class="cp-plan-acc-summary">① アセスメント（本人・家族の意向、できること、困っていること）</summary>
        <div class="cp-plan-acc-body">${sec1Body}</div>
      </details>

      <details class="care-accordion cp-plan-acc" open>
        <summary class="cp-plan-acc-summary">② 総合的な援助の方針</summary>
        <div class="cp-plan-acc-body">${sec2Body}</div>
      </details>

      <details class="care-accordion cp-plan-acc" open>
        <summary class="cp-plan-acc-summary">③ 課題ごとの目標とサービス（${needs.length}件）</summary>
        <div class="cp-plan-acc-body">${sec3Body}</div>
      </details>

      <details class="care-accordion cp-plan-acc" open>
        <summary class="cp-plan-acc-summary">④ 話し合いの記録（${meetings.length}回）</summary>
        <div class="cp-plan-acc-body">${sec4Body}</div>
      </details>

      <details class="care-accordion cp-plan-acc" open>
        <summary class="cp-plan-acc-summary">⑤ 説明・同意・交付</summary>
        <div class="cp-plan-acc-body">${sec5Body}</div>
      </details>

      <details class="care-accordion cp-plan-acc" open>
        <summary class="cp-plan-acc-summary">⑥ モニタリング（${monitorings.length}回）</summary>
        <div class="cp-plan-acc-body">${sec6Body}</div>
      </details>
    `;
  }

  container.innerHTML = `
    <div class="cp-plan-top-bar">
      <div class="cp-plan-top-left">
        <span class="cp-plan-main-title">ケアプラン（施設サービス計画）</span>
        <label for="cpPlanResidentSelect" class="cp-plan-label-inline">対象利用者:</label>
        <select id="cpPlanResidentSelect" class="form-control cp-plan-res-select" onchange="cpOnCarePlanResidentChange(this.value)">
          ${resOptions}
        </select>
      </div>
      <div class="cp-plan-top-right">
        ${canEdit
          ? `<span class="cp-plan-role-badge">計画作成担当者として作成・変更できます</span>`
          : `<span class="cp-plan-readonly-msg">計画の作成・変更・説明と同意・モニタリングは計画作成担当者が書きます（話し合いの意見は全員書けます）</span>`
        }
      </div>
    </div>

    <div class="cp-plan-section-block">
      <div class="cp-plan-section-head">
        <span>${escapeHtml(r.name)} 様のケアプラン版一覧（新しい順）</span>
        ${canEdit && plans.length === 0 ? `<button type="button" class="btn btn-primary" onclick="cpCreateInitialCarePlan()">第1版を作成</button>` : ""}
      </div>
      ${versionListHtml}
    </div>

    ${detailHtml}
  `;
}

window.renderCarePlanTab = renderCarePlanTab;
window.cpSelectCarePlanVersion = cpSelectCarePlanVersion;
window.cpOnCarePlanResidentChange = cpOnCarePlanResidentChange;
window.cpCreateInitialCarePlan = cpCreateInitialCarePlan;
window.cpReviewAndCreateNextVersion = cpReviewAndCreateNextVersion;
window.cpEndCarePlanManually = cpEndCarePlanManually;
window.cpQuoteCareSummaryToAssessment = cpQuoteCareSummaryToAssessment;
window.cpSaveCarePlanAssessment = cpSaveCarePlanAssessment;
window.cpSaveCarePlanPolicy = cpSaveCarePlanPolicy;
window.cpSaveCarePlanNeed = cpSaveCarePlanNeed;
window.cpStartEditCarePlanNeed = cpStartEditCarePlanNeed;
window.cpSaveCarePlanService = cpSaveCarePlanService;
window.cpStartEditCarePlanService = cpStartEditCarePlanService;
window.cpAddCarePlanMeeting = cpAddCarePlanMeeting;
window.cpAppendOpinionToMeeting = cpAppendOpinionToMeeting;
window.cpEditCarePlanMeeting = cpEditCarePlanMeeting;
window.cpSaveCarePlanConsent = cpSaveCarePlanConsent;
window.cpSaveCarePlanMonitoring = cpSaveCarePlanMonitoring;
window.cpStartEditCarePlanMonitoring = cpStartEditCarePlanMonitoring;
window.printCarePlanDocument = printCarePlanDocument;
window.cpGetActiveCarePlanForResident = cpGetActiveCarePlanForResident;

// 職員の資格・研修マスタおよび資格履歴の管理
window.openStaffModal = openStaffModal;
window.renderStaffModalList = renderStaffModalList;
window.submitNewStaffStamp = submitNewStaffStamp;
window.openStaffEditModal = openStaffEditModal;
window.saveStaffBasicInfo = saveStaffBasicInfo;
window.onStaffQualSearchInput = onStaffQualSearchInput;
window.selectStaffQualCandidate = selectStaffQualCandidate;
window.onStaffQualMasterSelectChange = onStaffQualMasterSelectChange;
window.addStaffQualificationRecord = addStaffQualificationRecord;
window.saveStaffQualAcquiredDate = saveStaffQualAcquiredDate;
window.verifyStaffQualificationCert = verifyStaffQualificationCert;
window.voidStaffQualificationRecord = voidStaffQualificationRecord;
window.renderStaffEditQualRecordsList = renderStaffEditQualRecordsList;
window.openQualificationMasterModal = openQualificationMasterModal;
window.onQmHasMarkChange = onQmHasMarkChange;
window.resetQualificationMasterForm = resetQualificationMasterForm;
window.startEditQualificationMasterItem = startEditQualificationMasterItem;
window.saveQualificationMasterItem = saveQualificationMasterItem;
window.toggleQualificationMasterUnused = toggleQualificationMasterUnused;
window.renderQualificationMasterList = renderQualificationMasterList;
window.cpGetQualificationMaster = cpGetQualificationMaster;
window.cpActiveQualificationMaster = cpActiveQualificationMaster;
window.cpMatchQualificationMaster = cpMatchQualificationMaster;
window.cpGetStaffQualifications = cpGetStaffQualifications;
window.cpStaffHasMasterQualification = cpStaffHasMasterQualification;
window.cpFormatQualSourceLinksHtml = cpFormatQualSourceLinksHtml;



