// ======================================================================
// 介護サマリー (生活・ADLアセスメント詳細 13項目)
// ======================================================================
const CP_SUMMARY_ADL_ACTIONS = [
	{ key: "move", name: "移動" },
	{ key: "transfer", name: "移乗" },
	{ key: "eating", name: "食事" },
	{ key: "excretion", name: "排泄" },
	{ key: "bathing", name: "入浴" },
	{ key: "dressing", name: "更衣" },
	{ key: "grooming", name: "整容（歯みがき・洗面）" }
];

function cpSummaryAdlBadgeClass(level) {
	if (level === "自立") return "badge-ok";
	if (level === "見守り") return "badge-info";
	if (level === "一部介助") return "badge-warn";
	if (level === "全介助") return "badge-alert";
	return "badge-secondary";
}
// [Claude修正] その方のサマリーを新しい順に並べる。保存の順番ではなく作成日で決める
// （デモのデータは古い順に入っているので、[0] を「最新」とすると前の版が最新に見えていた）
function cpSummariesOfResident(residentId) {
 const rId = Number(residentId);
 return (db.data.care_summaries || [])
  .filter(s => Number(s.resident_id) === rId)
  .slice()
  .sort((a, b) => String(b.created_at || "").slice(0, 10).localeCompare(String(a.created_at || "").slice(0, 10)) || (Number(b.id) - Number(a.id)));
}
window.cpSummariesOfResident = cpSummariesOfResident;

function getResidentSummaryStatusText(residentId) {
 const rId = Number(residentId);
 const list = cpSummariesOfResident(rId);
 if (list.length === 0) {
 return "サマリー未登録 (入所時・入院後サマリーを新規作成できます)";
 }
 const latest = list[0];
 return `最新サマリー: ［${escapeHtml(latest.summary_type || "介護サマリー")}］ ${escapeHtml(latest.created_at || "")} 作成 (作成者: ${escapeHtml(latest.staff_name || "職員")})`;
}

function renderResidentSummaryAccordionContent(residentId) {
 const rId = Number(residentId);
 const list = cpSummariesOfResident(rId);
 if (list.length === 0) {
 return `
 <div style="background:#f6f8f6; border:1px dashed #cdd6d0; border-radius:6px; padding:14px; text-align:center; color:#5f6d66;">
 介護サマリーがまだ登録されていません。<br>
 「サマリー編集・新規」ボタンから、新規入所時または入院後再入所の生活・ADLアセスメントを作成できます。
 </div>
 `;
 }

 const s = list[0];
 return `
 <div style="margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; background:#f1f6f3; border:1px solid #c9e0d5; border-radius:6px; padding:6px 10px;">
 <div>
 <strong style="color:#1e5b47;">［${escapeHtml(s.summary_type || "介護サマリー")}］</strong>
 <span style="color:#4a5852; margin-left:6px;">作成日: ${escapeHtml(s.created_at || "")} (作成者: ${escapeHtml(s.staff_name || "職員")})</span>
 </div>
 ${(typeof cpRoleFlags === "function" && cpRoleFlags().caremanager) ? `<button type="button" class="btn btn-secondary" style="padding:2px 8px; font-size:11px; background:var(--surface); color:var(--pine-dark); border:1px solid var(--line);" onclick="openCareSummaryModal(${rId}, ${s.id})">詳細確認・変更</button>` : `<button type="button" class="btn btn-secondary" style="padding:2px 8px; font-size:11px; background:var(--surface); color:var(--ink); border:1px solid var(--line);" onclick="openCareSummaryModal(${rId}, ${s.id})">詳細確認</button>`}
 </div>
 <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:8px;">
 <div style="background:#f6f8f6; border:1px solid #dfe5e1; border-radius:6px; padding:8px 10px;">
 <strong style="color:#173f33; font-size:12px;">1. 基本情報:</strong>
 <div style="margin-top:2px; color:#36443e;">${escapeHtml(s.basic_info || "未記入")}</div>
 </div>
 <div style="background:#f6f8f6; border:1px solid #dfe5e1; border-radius:6px; padding:8px 10px;">
 <strong style="color:#173f33; font-size:12px;">2. これまでの経過:</strong>
 <div style="margin-top:2px; color:#36443e;">${escapeHtml(s.background || "未記入")}</div>
 </div>
 <div style="background:#f6f8f6; border:1px solid #dfe5e1; border-radius:6px; padding:8px 10px;">
 <strong style="color:#173f33; font-size:12px;">3. 現在の身体・認知状態:</strong>
 <div style="margin-top:2px; color:#36443e;">${escapeHtml(s.physical_cognitive || "未記入")}</div>
 </div>
 <div style="background:var(--ground); border:1px solid var(--line); border-radius:6px; padding:8px 10px;">
				<strong style="color:var(--pine-dark); font-size:12px;">4. ADL (日常生活動作):</strong>
				${(() => {
					if (Array.isArray(s.adl_items) && s.adl_items.length > 0) {
						const trs = s.adl_items.map(it => `
							<tr style="border-bottom:1px solid var(--line-2);">
								<td style="padding:4px 6px; font-weight:bold; color:var(--ink); font-size:12px;">${escapeHtml(it.action || it.key)}</td>
								<td style="padding:4px 6px;"><span class="badge ${cpSummaryAdlBadgeClass(it.level)}" style="font-size:11px;">${escapeHtml(it.level || "-")}</span></td>
								<td style="padding:4px 6px; color:var(--ink-2); font-size:12px;">${escapeHtml(it.method || "-")}</td>
							</tr>
						`).join("");
						return `
							<div style="overflow-x:auto; margin-top:4px;">
								<table class="table" style="width:100%; border-collapse:collapse; font-size:12px; background:var(--surface);">
									<thead>
										<tr style="background:var(--ground); border-bottom:1px solid var(--line);">
											<th style="width:26%; padding:4px 6px; text-align:left; color:var(--ink);">動作</th>
											<th style="width:26%; padding:4px 6px; text-align:left; color:var(--ink);">段階</th>
											<th style="padding:4px 6px; text-align:left; color:var(--ink);">介助のやり方</th>
										</tr>
									</thead>
									<tbody>${trs}</tbody>
								</table>
							</div>
						`;
					}
					return `
						<div style="margin-top:2px; color:var(--ink-2); font-size:12px;">
							<span class="badge" style="background:var(--pine-tint); color:var(--pine); font-size:11px; margin-right:6px; font-weight:bold;">前の書き方（文章）</span>
							${escapeHtml(s.adl || "未記入")}
						</div>
					`;
				})()}
			</div>
 <div style="background:#f6f8f6; border:1px solid #dfe5e1; border-radius:6px; padding:8px 10px;">
 <strong style="color:#173f33; font-size:12px;">5. 食事・水分摂取:</strong>
 <div style="margin-top:2px; color:#36443e;">${escapeHtml(s.meals_hydration || "未記入")}</div>
 </div>
 <div style="background:#f6f8f6; border:1px solid #dfe5e1; border-radius:6px; padding:8px 10px;">
 <strong style="color:#173f33; font-size:12px;">6. 排泄:</strong>
 <div style="margin-top:2px; color:#36443e;">${escapeHtml(s.excretion || "未記入")}</div>
 </div>
 <div style="background:#f6f8f6; border:1px solid #dfe5e1; border-radius:6px; padding:8px 10px;">
 <strong style="color:#173f33; font-size:12px;">7. 睡眠:</strong>
 <div style="margin-top:2px; color:#36443e;">${escapeHtml(s.sleep || "未記入")}</div>
 </div>
 <div style="background:#f6f8f6; border:1px solid #dfe5e1; border-radius:6px; padding:8px 10px;">
 <strong style="color:#173f33; font-size:12px;">8. 服薬:</strong>
 <div style="margin-top:2px; color:#36443e;">${escapeHtml(s.meds || "未記入")}</div>
 </div>
 <div style="background:#f6f8f6; border:1px solid #dfe5e1; border-radius:6px; padding:8px 10px;">
 <strong style="color:#173f33; font-size:12px;">9. 医療的な処置:</strong>
 <div style="margin-top:2px; color:#36443e;">${escapeHtml(s.medical_care || "未記入")}</div>
 </div>
 <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:6px; padding:8px 10px;">
 <strong style="color:#991b1b; font-size:12px;">10. 認知症の症状や行動 (BPSD):</strong>
 <div style="margin-top:2px; color:#7f1d1d;">${escapeHtml(s.dementia_behavior || "未記入")}</div>
 </div>
 <div style="background:#fffbeb; border:1px solid #fef3c7; border-radius:6px; padding:8px 10px;">
 <strong style="color:#92400e; font-size:12px;">11. 介助方法・注意点:</strong>
 <div style="margin-top:2px; color:#78350f;">${escapeHtml(s.care_notes || "未記入")}</div>
 </div>
 <div style="background:#f6f8f6; border:1px solid #dfe5e1; border-radius:6px; padding:8px 10px;">
 <strong style="color:#173f33; font-size:12px;">12. 家族の状況:</strong>
 <div style="margin-top:2px; color:#36443e;">${escapeHtml(s.family_info || "未記入")}</div>
 </div>
 </div>
 <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:6px; padding:8px 10px; margin-top:10px;">
 <strong style="color:#166534; font-size:12px;">13. 今後の支援で気をつけること:</strong>
 <div style="margin-top:2px; color:#14532d;">${escapeHtml(s.future_goals || "未記入")}</div>
 </div>
 `;
}

function openCareSummaryModal(resId, summaryId) {
	const targetId = (resId !== undefined && resId !== null && resId !== '') ? Number(resId) : Number(gState.selectedResidentId);
	const r = gState.residents ? gState.residents.find(x => Number(x.id) === targetId) : null;
	if (!r) {
		alert("利用者を選択してください。");
		return;
	}

	const canEdit = typeof cpRoleFlags === "function" ? !!cpRoleFlags().caremanager : false;
	const newBox = document.getElementById("careSummaryNewButtons"); if (newBox) newBox.style.display = canEdit ? "flex" : "none";
	const b1 = document.getElementById("btnCsNewEntry"); if (b1) b1.style.display = canEdit ? "inline-block" : "none";
	const b2 = document.getElementById("btnCsNewReentry"); if (b2) b2.style.display = canEdit ? "inline-block" : "none";
	const b3 = document.getElementById("btnCsNewChange"); if (b3) b3.style.display = canEdit ? "inline-block" : "none";
	const submitBtn = document.getElementById("btnSubmitCareSummary"); if (submitBtn) submitBtn.style.display = canEdit ? "inline-block" : "none";

	const fieldsToToggle = [
		"csSummaryType", "csDate",
		"csBasicInfo", "csBackground", "csPhysicalCognitive",
		"csMealsHydration", "csExcretion", "csSleep", "csMeds",
		"csMedicalCare", "csDementiaBehavior", "csCareNotes", "csFamilyInfo", "csFutureGoals"
	];
	fieldsToToggle.forEach(fId => {
		const el = document.getElementById(fId);
		if (el) el.disabled = !canEdit;
	});
	CP_SUMMARY_ADL_ACTIONS.forEach(act => {
		const lvlEl = document.getElementById(`csAdlLevel_${act.key}`);
		const mtdEl = document.getElementById(`csAdlMethod_${act.key}`);
		if (lvlEl) lvlEl.disabled = !canEdit;
		if (mtdEl) mtdEl.disabled = !canEdit;
	});

 const badgeEl = document.getElementById("csResidentBadge");
 if (badgeEl) badgeEl.textContent = `${r.room_no}号室 ${r.name} 様 (${r.care_level})`;

 const resIdEl = document.getElementById("csResidentId");
 if (resIdEl) resIdEl.value = r.id;

 // 担当職員セレクトボックス
 const staffSelect = document.getElementById("csStaff");
 if (staffSelect) {
 // [Claude修正 2026-10-22] 作成担当はログインした本人に固定（あなた「記録者はログイン本人に固定だね」）
 const loginName = (typeof cpLoginStaffName === "function" && cpLoginStaffName()) || document.getElementById("currentStaff")?.value || "";
 const me = (gState.stamps || []).find(s => (s.name || s) === loginName);
 staffSelect.innerHTML = `<option value="${escapeHtml(loginName)}">${escapeHtml(loginName)}${me && me.role ? ` (${escapeHtml(me.role)})` : ""}</option>`;
 staffSelect.value = loginName;
 staffSelect.disabled = true;
 }

 // 過去サマリー履歴セレクト
 const list = cpSummariesOfResident(r.id);
 const historySelect = document.getElementById("careSummaryHistorySelect");
 if (historySelect) {
 historySelect.innerHTML = "";
 if (list.length > 0) {
			list.forEach((s, idx) => {
				const opt = document.createElement("option");
				opt.value = String(s.id);
				opt.textContent = `${idx === 0 ? "［最新］" : ""} ${s.created_at} - ${s.summary_type} (${s.staff_name})`;
				historySelect.appendChild(opt);
			});
			if (canEdit) {
				const newOpt = document.createElement("option");
				newOpt.value = "new";
				newOpt.textContent = "＋ 新規サマリー作成 (新規入所・入院後再入所等)";
				historySelect.appendChild(newOpt);
			}
		} else {
			if (canEdit) {
				const opt = document.createElement("option");
				opt.value = "new";
				opt.textContent = "新規サマリー作成 (未登録)";
				historySelect.appendChild(opt);
			} else {
				const opt = document.createElement("option");
				opt.value = "";
				opt.textContent = "サマリー未登録 (閲覧のみ)";
				historySelect.appendChild(opt);
			}
		}
 }

 if (summaryId) {
		switchCareSummaryRecord(String(summaryId));
	} else if (list.length > 0) {
		switchCareSummaryRecord(String(list[0].id));
	} else if (canEdit) {
		startNewCareSummary("新規入所時サマリー");
	}

 const modal = document.getElementById("careSummaryModal");
 if (modal) modal.style.display = "flex";
}

function switchCareSummaryRecord(summaryVal) {
 const historySelect = document.getElementById("careSummaryHistorySelect");
 if (historySelect) historySelect.value = summaryVal;

 if (summaryVal === "new") {
 startNewCareSummary("新規入所時サマリー");
 return;
 }

 const sid = Number(summaryVal);
 const s = (db.data.care_summaries || []).find(x => x.id === sid);
 if (!s) return;

 const idEl = document.getElementById("csSummaryId");
 const typeEl = document.getElementById("csSummaryType");
 const dateEl = document.getElementById("csDate");
 const staffEl = document.getElementById("csStaff");

 if (idEl) idEl.value = s.id;
 if (typeEl) typeEl.value = s.summary_type || "新規入所時サマリー";
 if (dateEl) dateEl.value = s.created_at || toLocalDateStr(new Date());
 // [Claude修正 2026-10-22] 作成担当はログインした本人のまま（前の版を書いた人は前の版に残っている）

 const fields = [
 "csBasicInfo", "csBackground", "csPhysicalCognitive", "csAdl",
 "csMealsHydration", "csExcretion", "csSleep", "csMeds",
 "csMedicalCare", "csDementiaBehavior", "csCareNotes", "csFamilyInfo", "csFutureGoals"
 ];
 const keys = [
 "basic_info", "background", "physical_cognitive", "adl",
 "meals_hydration", "excretion", "sleep", "meds",
 "medical_care", "dementia_behavior", "care_notes", "family_info", "future_goals"
 ];

 fields.forEach((fId, i) => {
		const el = document.getElementById(fId);
		if (el) el.value = s[keys[i]] || "";
	});

	// ADL動作別項目の反映
	const refBox = document.getElementById("csAdlPrevRefBox");
	if (Array.isArray(s.adl_items) && s.adl_items.length > 0) {
		if (refBox) { refBox.style.display = "none"; refBox.innerHTML = ""; }
		CP_SUMMARY_ADL_ACTIONS.forEach(act => {
			const it = s.adl_items.find(x => x.key === act.key || x.action === act.name);
			const lvlEl = document.getElementById(`csAdlLevel_${act.key}`);
			const mtdEl = document.getElementById(`csAdlMethod_${act.key}`);
		if (lvlEl) lvlEl.value = it ? (it.level || "") : "";
		if (mtdEl) mtdEl.value = it ? (it.method || "") : "";
		});
	} else {
		if (refBox) {
			refBox.style.display = "block";
			refBox.innerHTML = `<div style="font-weight:bold; margin-bottom:4px; color:var(--pine-dark);">前の書き方（文章）</div><div style="white-space:pre-wrap;">${escapeHtml(s.adl || "未記入")}</div>`;
		}
		CP_SUMMARY_ADL_ACTIONS.forEach(act => {
			const lvlEl = document.getElementById(`csAdlLevel_${act.key}`);
			const mtdEl = document.getElementById(`csAdlMethod_${act.key}`);
		if (lvlEl) lvlEl.value = "";
		if (mtdEl) mtdEl.value = "";
		});
	}
	const csAdlEl = document.getElementById("csAdl");
	if (csAdlEl) csAdlEl.value = s.adl || "";
}

function startNewCareSummary(summaryType = "新規入所時サマリー") {
	if (typeof cpRoleFlags === "function" && !cpRoleFlags().caremanager) {
		alert("介護サマリーの作成は計画作成担当者のみ行えます。");
		return;
	}
	const rId = Number(document.getElementById("csResidentId")?.value) || gState.selectedResidentId;
 const r = gState.residents ? gState.residents.find(x => Number(x.id) === rId) : null;
 const historySelect = document.getElementById("careSummaryHistorySelect");
 if (historySelect) historySelect.value = "new";

 const idEl = document.getElementById("csSummaryId");
 const typeEl = document.getElementById("csSummaryType");
 const dateEl = document.getElementById("csDate");

 if (idEl) idEl.value = "";
 if (typeEl) typeEl.value = summaryType;
 if (dateEl) dateEl.value = toLocalDateStr(new Date());

 const list = cpSummariesOfResident(rId);
 const prev = list.length > 0 ? list[0] : null;

 const basicText = prev ? prev.basic_info : `${r ? r.name : ""} 様。${r ? r.care_level : ""}。生年月日: ${r ? (r.birth_date || "未登録") : ""}。緊急連絡先: ${r ? (r.emergency_contact || "未登録") : ""}。看取り方針: ［${r ? (r.policy_stamp || "未設定") : ""}］。`;
 // [Claude修正] 前回のサマリーがないときは、登録済みの情報だけを入れ、それ以外は空欄にする（誰も書いていない例文を入れない）
 const backgroundText = prev ? prev.background : "";
 const physicalText = prev ? prev.physical_cognitive : `麻痺: ${r ? (r.paralysis || "未登録") : "未登録"}。病歴: ${r ? (r.diseases || "未登録") : "未登録"}。`;
 const adlText = prev ? prev.adl : "";
 const mealsText = prev ? prev.meals_hydration : `食形態: ${r ? (r.diet_type || "未登録") : "未登録"}。口腔: ${r ? (r.oral_state || "未登録") : "未登録"}。アレルギー: ${r ? (r.allergies || "未登録") : "未登録"}。`;
 const excretionText = prev ? prev.excretion : "";
 const sleepText = prev ? prev.sleep : "";
 const medsText = prev ? prev.meds : "";
 const medicalText = prev ? prev.medical_care : (r && r.dr_instructions ? r.dr_instructions : "");
 const dementiaText = prev ? prev.dementia_behavior : "";
 const notesText = prev ? prev.care_notes : (r && r.life_history ? "人生歴: " + r.life_history : "");
 const familyText = prev ? prev.family_info : (r && r.family_wishes ? "家族の意向: " + r.family_wishes : "");
 // [Claude修正 2026-10-19] 将来の目標は、実施中のケアプランの長期・短期目標を写す（出どころの版を付ける）。ケアプランがなければ前のサマリー、なければ以前のケアプラン目標
 const cpActPlan = (r && typeof cpGetActiveCarePlanForResident === "function") ? cpGetActiveCarePlanForResident(r.id) : null;
 const cpPlanGoals = cpActPlan ? `（第${Number(cpActPlan.version) || 1}版のケアプランより）` + (cpActPlan.needs || []).filter(x => x).map(x => `【${x.need || "課題"}】長期: ${x.long_goal || "未記入"}（${x.long_from || "未定"}〜${x.long_to || "未定"}）／短期: ${x.short_goal || "未記入"}（${x.short_from || "未定"}〜${x.short_to || "未定"}）`).join(" ") : "";
 const goalsText = cpPlanGoals || (prev ? prev.future_goals : (r && r.care_plan_goal ? "（以前のケアプラン目標）" + r.care_plan_goal : ""));

 const fields = [
 { id: "csBasicInfo", val: basicText },
 { id: "csBackground", val: backgroundText },
 { id: "csPhysicalCognitive", val: physicalText },
 { id: "csAdl", val: adlText },
 { id: "csMealsHydration", val: mealsText },
 { id: "csExcretion", val: excretionText },
 { id: "csSleep", val: sleepText },
 { id: "csMeds", val: medsText },
 { id: "csMedicalCare", val: medicalText },
 { id: "csDementiaBehavior", val: dementiaText },
 { id: "csCareNotes", val: notesText },
 { id: "csFamilyInfo", val: familyText },
 { id: "csFutureGoals", val: goalsText }
 ];

 fields.forEach(f => {
		const el = document.getElementById(f.id);
		if (el) el.value = f.val;
	});

	// ADL動作別欄の初期化（前回のサマリーに adl_items があれば引継ぎ、なければ参考文章として表示し動作欄は空から開始）
	const refBox = document.getElementById("csAdlPrevRefBox");
	const csAdlEl = document.getElementById("csAdl");
	if (csAdlEl) csAdlEl.value = "";

	if (prev && Array.isArray(prev.adl_items) && prev.adl_items.length > 0) {
		if (refBox) { refBox.style.display = "none"; refBox.innerHTML = ""; }
		CP_SUMMARY_ADL_ACTIONS.forEach(act => {
			const it = prev.adl_items.find(x => x.key === act.key || x.action === act.name);
			const lvlEl = document.getElementById(`csAdlLevel_${act.key}`);
			const mtdEl = document.getElementById(`csAdlMethod_${act.key}`);
			if (lvlEl) lvlEl.value = it ? (it.level || "") : "";
			if (mtdEl) mtdEl.value = it ? (it.method || "") : "";
		});
	} else {
		if (prev && prev.adl) {
			if (refBox) {
				refBox.style.display = "block";
				refBox.innerHTML = `<div style="font-weight:bold; margin-bottom:4px; color:var(--pine-dark);">参考：前回のサマリーの文章</div><div style="white-space:pre-wrap;">${escapeHtml(prev.adl)}</div>`;
			}
		} else {
			if (refBox) { refBox.style.display = "none"; refBox.innerHTML = ""; }
		}
		CP_SUMMARY_ADL_ACTIONS.forEach(act => {
			const lvlEl = document.getElementById(`csAdlLevel_${act.key}`);
			const mtdEl = document.getElementById(`csAdlMethod_${act.key}`);
			if (lvlEl) lvlEl.value = "";
			if (mtdEl) mtdEl.value = "";
		});
	}
}

function submitCareSummary() {
	if (typeof cpRoleFlags === "function" && !cpRoleFlags().caremanager) {
		alert("介護サマリーの保存は計画作成担当者のみ行えます。");
		return;
	}
	const rId = Number(document.getElementById("csResidentId")?.value) || gState.selectedResidentId;
 const sid = document.getElementById("csSummaryId")?.value;
 const summaryType = document.getElementById("csSummaryType")?.value || "新規入所時サマリー";
 const dateVal = document.getElementById("csDate")?.value || toLocalDateStr(new Date());
 const staffVal = document.getElementById("csStaff")?.value || "職員";

 // ADL動作別の検査
	const adl_items = [];
	for (const act of CP_SUMMARY_ADL_ACTIONS) {
		const lvl = (document.getElementById(`csAdlLevel_${act.key}`)?.value || "").trim();
		const mtd = (document.getElementById(`csAdlMethod_${act.key}`)?.value || "").trim();
		if (!lvl) {
			alert(`「${act.name}」の段階を選んでください。`);
			document.getElementById(`csAdlLevel_${act.key}`)?.focus();
			return;
		}
		if (lvl !== "自立" && !mtd) {
			alert(`「${act.name}」は${lvl}のため、介助のやり方を具体的に記入してください。`);
			document.getElementById(`csAdlMethod_${act.key}`)?.focus();
			return;
		}
		adl_items.push({
			key: act.key,
			action: act.name,
			level: lvl,
			method: mtd
		});
	}

	// 動作ごとの内容から文章 adl を構築
	const adl = adl_items.map(it => {
		return `${it.action}: ${it.level}${it.method ? `（${it.method}）` : ""}`;
	}).join("。") + "。";
	const csAdlEl = document.getElementById("csAdl");
	if (csAdlEl) csAdlEl.value = adl;

	const basicInfo = document.getElementById("csBasicInfo")?.value || "";
	const background = document.getElementById("csBackground")?.value || "";
	const physicalCognitive = document.getElementById("csPhysicalCognitive")?.value || "";
	const mealsHydration = document.getElementById("csMealsHydration")?.value || "";
	const excretion = document.getElementById("csExcretion")?.value || "";
	const sleep = document.getElementById("csSleep")?.value || "";
	const meds = document.getElementById("csMeds")?.value || "";
	const medicalCare = document.getElementById("csMedicalCare")?.value || "";
	const dementiaBehavior = document.getElementById("csDementiaBehavior")?.value || "";
	const careNotes = document.getElementById("csCareNotes")?.value || "";
	const familyInfo = document.getElementById("csFamilyInfo")?.value || "";
	const futureGoals = document.getElementById("csFutureGoals")?.value || "";

	if (!Array.isArray(db.data.care_summaries)) db.data.care_summaries = [];

	const existingForVersion = (sid && sid.trim() !== "") ? db.data.care_summaries.find(x => Number(x.id) === Number(sid)) : null;
	const prevLatest = cpSummariesOfResident(rId)[0] || null;

	const fieldsNow = {
		summary_type: summaryType,
		basic_info: basicInfo,
		background: background,
		physical_cognitive: physicalCognitive,
		adl: adl,
		adl_items: adl_items,
		meals_hydration: mealsHydration,
		excretion: excretion,
		sleep: sleep,
		meds: meds,
		medical_care: medicalCare,
		dementia_behavior: dementiaBehavior,
		care_notes: careNotes,
		family_info: familyInfo,
		future_goals: futureGoals
	};

	if (existingForVersion) {
		const changed = Object.keys(fieldsNow).some(k => {
			if (k === "adl_items") {
				return JSON.stringify(existingForVersion.adl_items || []) !== JSON.stringify(adl_items);
			}
			return (existingForVersion[k] || "") !== (fieldsNow[k] || "");
		});
		if (!changed) {
			alert("変更された項目がないため、保存は行いませんでした。");
			return;
		}
		const versionDate = (dateVal === (existingForVersion.created_at || existingForVersion.date || "")) ? toLocalDateStr(new Date()) : dateVal;
		db.data.care_summaries.unshift(Object.assign({
			id: Date.now(),
			resident_id: rId,
			created_at: versionDate,
			updated_at: versionDate,
			staff_name: staffVal,
			previous_id: existingForVersion.id
		}, fieldsNow));
	} else {
		const newSummary = Object.assign({
			id: Date.now(),
			resident_id: rId,
			created_at: dateVal,
			updated_at: dateVal,
			staff_name: staffVal,
			previous_id: prevLatest ? prevLatest.id : null
		}, fieldsNow);
		db.data.care_summaries.unshift(newSummary);
	}

	gState.care_summaries = db.data.care_summaries;
	db.save();
	renderResidentDetail();
	if (typeof checkGlobalAlerts === "function") {
		checkGlobalAlerts();
	}
	alert("介護サマリーを保存しました。");
	closeModal("careSummaryModal");
}

// ======================================================================
// [Claude修正] 印刷共通処理 runPrintJob
// 旧実装の問題:
//  - 画面全体を visibility:hidden で隠すだけだったため、見えない画面の分だけ白紙ページが出ていた
//  - 全帳票が A4横 固定 (@page) で、縦向き帳票が2枚目にはみ出していた
//  - 勤務表・請求明細の印刷ボタンは帳票を作らず window.print() を呼ぶだけだったため、
//    直前に別タブで印刷した書類 (#printArea の残り) がそのまま出ていた
// 新実装: 帳票HTMLを #printArea に入れ、用紙サイズを帳票ごとに指定し、
//          1枚に収める帳票は用紙に合わせて縮小してから印刷する。印刷後は #printArea を空に戻す。
// ======================================================================
const PRINT_PAGE_SIZES_MM = {
 "A4 portrait": [210, 297],
 "A4 landscape": [297, 210]
};
const PRINT_MARGIN_MM = 10;

function runPrintJob(html, options) {
 const opts = Object.assign({ page: "A4 portrait", fitOnePage: true, minScale: 0.5 }, options || {});
 const printArea = document.getElementById("printArea");
 if (!printArea) {
 alert("印刷コンテナが見つかりません。");
 return;
 }
 // 帳票は body 直下に置く (印刷CSSが body 直下の帳票以外を非表示にするため)
 if (printArea.parentElement !== document.body) {
 document.body.appendChild(printArea);
 }

 // 用紙サイズを帳票ごとに設定
 let pageStyle = document.getElementById("printPageSizeStyle");
 if (!pageStyle) {
 pageStyle = document.createElement("style");
 pageStyle.id = "printPageSizeStyle";
 document.head.appendChild(pageStyle);
 }
 pageStyle.textContent = `@page { size: ${opts.page}; margin: ${PRINT_MARGIN_MM}mm; }`;

 printArea.innerHTML = html;
 printArea.style.zoom = "";

 // 1枚に収める帳票は、印刷可能範囲に対する実寸を測って縮小率を決める
 if (opts.fitOnePage) {
 const mm = PRINT_PAGE_SIZES_MM[opts.page] || PRINT_PAGE_SIZES_MM["A4 portrait"];
 const pxPerMm = 96 / 25.4;
 const availW = (mm[0] - PRINT_MARGIN_MM * 2) * pxPerMm;
 const availH = (mm[1] - PRINT_MARGIN_MM * 2) * pxPerMm;
 const prev = printArea.getAttribute("style") || "";
 printArea.setAttribute("style", `display:block; position:absolute; left:-30000px; top:0; width:${availW}px; visibility:hidden;`);
 const contentW = Math.max(printArea.scrollWidth, availW);
 const contentH = printArea.scrollHeight;
 printArea.setAttribute("style", prev);
 const scale = Math.min(1, availW / contentW, availH / contentH) * 0.98;
 if (scale < 0.98 && scale >= opts.minScale) {
 printArea.style.zoom = String(scale);
 }
 }

 const cleanup = () => {
 printArea.innerHTML = "";
 printArea.style.zoom = "";
 window.removeEventListener("afterprint", cleanup);
 };
 window.addEventListener("afterprint", cleanup);
 window.print();
}

// =====================================================================
// [Claude修正] 監査用: 記録の取消・訂正・確認の履歴を一覧にする
// 記録は削除せず voided / edit_history / void_history / confirm_log などで残しているため、それを集めて表示する
// =====================================================================
const CP_AUDIT_SOURCES = [
 { key: "care_records", label: "介護記録", summary: r => `[${r.category || ""}] ${r.recorded_at || ""} ${r.content || ""}` },
 { key: "meds", label: "服薬・点眼", summary: r => `${r.date || ""} ${r.timing_key || r.slot || ""} ${r.status || ""}${r.given_time ? ` 飲んだ${r.given_time}` : ""}${r.recorded_at ? ` 記録${r.recorded_at}` : ""}` },
 { key: "prescriptions", label: "処方箋の画像", summary: r => `${r.issued_date || ""} の処方箋 (登録 ${r.uploaded_by || ""})` },
 { key: "resident_medications", label: "処方薬の一覧", summary: r => `${r.name || ""} ${(typeof cpRxScheduleText === "function" ? cpRxScheduleText(r) + " " : "")}${(r.timings || []).map(t => t.key + t.count).join("・")}${r.status === "中止" ? " 中止" : ""}` }, // [Antigravity実装 2026-10-19]
 { key: "vitals", label: "バイタル", summary: r => `${r.date || ""} 体温${r.temperature ?? "-"} 血圧${r.bp_high ?? "-"}/${r.bp_low ?? "-"} 脈${r.pulse ?? "-"} SpO2 ${r.spo2 ?? "-"}` },
 { key: "weight_records", label: "体重", summary: r => `${r.date || r.month || ""} ${r.weight ?? "-"}kg` },
 { key: "topical_records", label: "塗布薬・湿布", summary: r => `${r.date || ""} ${r.timing || ""} ${r.item_name || ""} (${r.site_name || ""})` },
 { key: "baths", label: "入浴", summary: r => `${r.date || ""} ${r.bath_type || ""} ${r.ointment_notes || ""}` },
 { key: "groomings", label: "整容", summary: r => `${r.date || ""} 爪${r.nail_done ? "○" : "-"} 髭${r.shave_done ? "○" : "-"} 耳${r.ear_done ? "○" : "-"} ${r.notes || ""}` },
 { key: "turns", label: "夜間巡視・体位変換", summary: r => `${r.date || ""} ${r.time || ""} ${r.action || ""}` },
 { key: "linens", label: "シーツ交換", summary: r => `${r.date || ""} ${r.exchange_type || ""} ${r.notes || ""}` },
 { key: "notebooks", label: "申し送り", summary: r => `${r.date || ""} ${r.content || r.title || ""}` },
 { key: "daily_schedules", label: "日課・業務スケジュール", summary: r => `${r.date || ""} ${r.time || ""} ${r.title || ""} ${r.content || ""}` }, // [Antigravity実装 2026-10-16]
 { key: "monthly_notices", label: "業務連絡（月間）", summary: r => `${r.month || ""} ${r.title || ""} ${r.content || ""}` },
 { key: "notebook_stamps", label: "業務日誌の確認印", summary: r => `${r.date || ""} ${r.staff_name || ""}` },
 { key: "committees", label: "委員会・研修", summary: r => `${r.date || ""} ${r.committee_name || r.name || ""}` },
 { key: "incidents", label: "事故・ヒヤリハット", summary: r => `${r.occurred_at || ""} ${r.report_type || ""} ${r.situation || ""}` },
 { key: "vaccines", label: "予防接種", summary: r => `${r.date || ""} ${r.vaccine_name || ""}` },
 { key: "fire_drills", label: "消防・避難訓練", summary: r => `${r.date || ""} ${r.drill_type || ""}` },
 { key: "recreations", label: "レクリエーション", summary: r => `${r.date || ""} ${r.title || r.program_type || ""}` },
 { key: "belongings", label: "預かり品", summary: r => `${r.item_name || ""} (${r.quantity || ""})` },
 { key: "equipments", label: "福祉用具", summary: r => `${r.equipment_name || ""} (${r.ownership_type || ""})` },
 { key: "photos", label: "写真・書類", summary: r => `${r.title || r.file_name || r.name || ""}` },
 { key: "eyedrop_orders", label: "点眼指示", summary: r => `${r.medicine_name || ""} ${r.eye || ""}` },
 { key: "body_schema_pins", label: "身体図（処置）", summary: r => `${r.site_name || ""} ${r.item_name || ""}` },
 { key: "contract_docs", label: "契約・同意書類", summary: r => `${r.type_name || ""} 交わした日 ${r.signed_date || "-"}${r.renewal_due ? " 次の更新 " + r.renewal_due : ""}` },
 { key: "consumptions", label: "消耗品の請求", summary: r => `${r.consumed_at || ""} ${r.item_name || ""} ×${r.quantity ?? ""}` },
 { key: "care_plans", label: "ケアプラン", summary: r => `第${r.version || 1}版 (${r.status || ""})` }, // [Antigravity実装 2026-10-19]
 { key: "residents", label: "利用者情報", summary: r => `${r.room_no || ""}号室 ${r.name || ""}` }
];

function cpAuditBeforeText(before) {
 if (!before || typeof before !== "object") return "";
 return Object.keys(before).map(k => {
 const v = before[k];
 const s = (v !== null && typeof v === "object") ? JSON.stringify(v) : String(v ?? "");
 return `${k}: ${s.length > 80 ? s.slice(0, 80) + "…" : s}`;
 }).join(" / ");
}

function cpCollectAuditEntries() {
 const out = [];
 const resName = id => {
 const r = (gState.residents || []).find(x => Number(x.id) === Number(id));
 return r ? `${r.room_no}号室 ${r.name}` : "";
 };
 CP_AUDIT_SOURCES.forEach(src => {
 (db.data[src.key] || []).forEach(rec => {
 if (!rec || typeof rec !== "object") return;
 let sum = "";
 try { sum = src.summary(rec); } catch (e) { sum = ""; }
 const rn = src.key === "residents" ? resName(rec.id) : resName(rec.resident_id);
 const base = { kind: src.label, resident: rn, residentId: src.key === "residents" ? rec.id : rec.resident_id, summary: sum };
 (rec.void_history || []).forEach(h => {
 out.push(Object.assign({}, base, { at: h.voided_at, type: "取消", by: h.voided_by, detail: `理由: ${h.void_reason || "-"}` }));
 out.push(Object.assign({}, base, { at: h.restored_at, type: "取消を戻す", by: h.restored_by, detail: "" }));
 });
 if (rec.voided) out.push(Object.assign({}, base, { at: rec.voided_at, type: "取消", by: rec.voided_by, detail: `理由: ${rec.void_reason || "-"}` }));
 else if (rec.restored_at && !(rec.void_history || []).length) out.push(Object.assign({}, base, { at: rec.restored_at, type: "取消を戻す", by: rec.restored_by, detail: rec.void_reason ? `前回の取消理由: ${rec.void_reason}` : "" }));
 (rec.edit_history || []).forEach(h => {
 out.push(Object.assign({}, base, { at: h.edited_at, type: "訂正・変更", by: h.edited_by, detail: `${h.reason ? "理由: " + h.reason + " / " : ""}訂正前: ${cpAuditBeforeText(h.before)}` }));
 });
 (rec.confirm_log || []).forEach(h => {
 out.push(Object.assign({}, base, { at: h.at, type: h.action === "確認" ? "確認" : "確認を取消", by: h.staff, detail: "" }));
 });
 if (src.key === "eyedrop_orders" && rec.ended_at) out.push(Object.assign({}, base, { at: rec.ended_at, type: "終了", by: rec.ended_by, detail: `点眼指示を終了${rec.end_reason ? "（理由: " + rec.end_reason + "）" : ""}` })); // [Antigravity実装 2026-10-19]
 if (src.key === "residents" && Array.isArray(rec.hospitalizations)) {
 // [Antigravity実装 2026-10-19] 入院の期間リストの訂正履歴も監査一覧に出す
 rec.hospitalizations.forEach(hp => {
 (hp.edit_history || []).forEach(h => {
 out.push({ kind: "入院の歴", resident: rn, residentId: rec.id, summary: `${hp.admission_date || ""}〜${hp.discharge_date || "入院中"} ${hp.hospital_name || ""}`, at: h.edited_at, type: "訂正・変更", by: h.edited_by, detail: `${h.reason ? "理由: " + h.reason + " / " : ""}訂正前: ${cpAuditBeforeText(h.before)}` });
 });
 });
 }
 if (src.key === "residents" && Array.isArray(rec.outings)) {
 // [Antigravity追加 2026-10-21] 外泊の歴の訂正・変更履歴
 rec.outings.forEach(op => {
 (op.edit_history || []).forEach(h => {
 out.push({ kind: "外泊の歴", resident: rn, residentId: rec.id, summary: `${op.start_date || ""}〜${op.end_date || "外泊中"} ${op.destination || ""}`, at: h.at || h.edited_at, type: "訂正・変更", by: h.by || h.edited_by, detail: `${h.reason ? "理由: " + h.reason + " / " : ""}${h.detail || ""}` });
 });
 });
 }
 if (src.key === "recreations" && rec.updated_at && !(rec.edit_history || []).length) out.push(Object.assign({}, base, { at: rec.updated_at, type: "訂正・変更", by: rec.updated_by, detail: "（訂正前の内容は記録されていない古い訂正）" }));
 });
 });
 (db.data.alert_logs || []).forEach(l => {
 out.push({ kind: "アラート対応", resident: "", residentId: null, summary: l.alert_title || "", at: l.dismissed_at, type: "アラートを閉じた", by: l.staff_name, detail: l.alert_detail || "" });
 if (l.restored_at) out.push({ kind: "アラート対応", resident: "", residentId: null, summary: l.alert_title || "", at: l.restored_at, type: "未対応に戻した", by: l.restored_by, detail: "" });
 });
 (db.data.settings_logs || []).forEach(l => {
 out.push({ kind: l.kind || "設定", resident: "", residentId: null, summary: l.detail || "", at: l.at, type: l.action || "変更", by: l.by, detail: "" });
 });
 (db.data.unit_logs || []).forEach(l => {
 out.push({ kind: "区分の設定", resident: "", residentId: null, summary: l.detail || "", at: l.at, type: l.action || "", by: l.by, detail: "" });
 });
 (db.data.staff_archive || []).forEach(a => {
 out.push({ kind: "職員名簿", resident: "", residentId: null, summary: `${a.staff && a.staff.name ? a.staff.name : ""} (${a.staff && a.staff.role ? a.staff.role : ""})`, at: a.removed_at, type: "職員を名簿から外した", by: a.removed_by, detail: "" });
 });
 return out.filter(e => e.at).sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

function cpFilteredAuditEntries() {
 const t = document.getElementById("auditFilterType")?.value || "";
 const k = document.getElementById("auditFilterKind")?.value || "";
 const rid = document.getElementById("auditFilterResident")?.value || "";
 const from = document.getElementById("auditFilterFrom")?.value || "";
 const to = document.getElementById("auditFilterTo")?.value || "";
 const w = (document.getElementById("auditFilterWord")?.value || "").trim();
 return cpCollectAuditEntries().filter(e => {
 if (t === "確認" && !(e.type === "確認" || e.type === "確認を取消")) return false;
 if (t === "その他" && ["取消", "取消を戻す", "訂正・変更", "確認", "確認を取消"].includes(e.type)) return false;
 if (t && t !== "確認" && t !== "その他" && e.type !== t) return false;
 if (k && e.kind !== k) return false;
 if (rid && String(e.residentId) !== rid) return false;
 const d = String(e.at).slice(0, 10);
 if (from && d < from) return false;
 if (to && d > to) return false;
 if (w && !`${e.by || ""} ${e.detail || ""} ${e.summary || ""} ${e.resident || ""}`.includes(w)) return false;
 return true;
 });
}

function openAuditLogModal() {
 const kSel = document.getElementById("auditFilterKind");
 if (kSel && kSel.options.length <= 1) {
 CP_AUDIT_SOURCES.map(s => s.label).concat(["入院の歴", "アラート対応", "職員名簿", "区分の設定", "勤務の最低人数", "利用者の移動・退所", "契約・同意書類の種類", "請求の設定"]).forEach(l => {
 const o = document.createElement("option"); o.value = l; o.textContent = l; kSel.appendChild(o);
 });
 }
 const rSel = document.getElementById("auditFilterResident");
 if (rSel) {
 const cur = rSel.value;
 rSel.innerHTML = '<option value="">すべて</option>';
 (gState.residents || []).forEach(r => {
 const o = document.createElement("option"); o.value = String(r.id); o.textContent = `${r.room_no}号室 ${r.name}`; rSel.appendChild(o);
 });
 rSel.value = cur;
 }
 renderAuditLog();
 openModal("auditLogModal");
}

function renderAuditLog() {
 const tbody = document.getElementById("auditLogTableBody");
 if (!tbody) return;
 const list = cpFilteredAuditEntries();
 const cnt = document.getElementById("auditLogCount");
 if (cnt) cnt.textContent = `${list.length} 件`;
 if (list.length === 0) {
 tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#5f6d66; padding:16px;">該当する履歴はありません。</td></tr>`;
 return;
 }
 const color = t => t === "取消" ? "#991b1b" : (t === "訂正・変更" ? "#92400e" : (t === "取消を戻す" ? "#1a4f3d" : "#36443e"));
 // [Claude修正] スマホなど幅が狭い画面では、表ではなくカードで表示する（表だと横にはみ出し、行が縦に長くなるため）
 const narrow = window.innerWidth < 700;
 const thead = tbody.parentElement ? tbody.parentElement.querySelector("thead") : null;
 if (thead) thead.style.display = narrow ? "none" : "";
 if (narrow) {
 tbody.innerHTML = list.slice(0, 1000).map(e => `
 <tr><td colspan="7" style="padding:8px 10px; border-bottom:1px solid #dfe5e1;">
 <div style="display:flex; justify-content:space-between; gap:6px; flex-wrap:wrap;"><strong style="color:${color(e.type)};">${escapeHtml(e.type)}</strong><span style="color:#5f6d66;">${escapeHtml(e.at || "")}</span></div>
 <div style="margin-top:2px;">${escapeHtml(e.kind)}${e.resident ? " / " + escapeHtml(e.resident) : ""} / 職員: ${escapeHtml(e.by || "-")}</div>
 <div style="margin-top:2px; color:#36443e; white-space:pre-wrap;">${escapeHtml((e.summary || "").slice(0, 120))}</div>
 ${e.detail ? `<div style="margin-top:2px; color:#4a5852; white-space:pre-wrap;">${escapeHtml((e.detail || "").slice(0, 300))}</div>` : ""}
 </td></tr>`).join("") + (list.length > 1000 ? `<tr><td colspan="7" style="text-align:center; color:#5f6d66;">先頭1000件を表示しています。条件で絞り込んでください。</td></tr>` : "");
 return;
 }
 tbody.innerHTML = list.slice(0, 1000).map(e => `
 <tr>
 <td>${escapeHtml(e.at || "")}</td>
 <td style="font-weight:bold; color:${color(e.type)};">${escapeHtml(e.type)}</td>
 <td>${escapeHtml(e.kind)}</td>
 <td>${escapeHtml(e.resident || "-")}</td>
 <td>${escapeHtml(e.by || "-")}</td>
 <td style="white-space:pre-wrap; max-width:280px;">${escapeHtml((e.summary || "").slice(0, 160))}</td>
 <td style="white-space:pre-wrap; max-width:320px;">${escapeHtml((e.detail || "").slice(0, 400))}</td>
 </tr>`).join("") + (list.length > 1000 ? `<tr><td colspan="7" style="text-align:center; color:#5f6d66;">先頭1000件を表示しています。条件で絞り込んでください。</td></tr>` : "");
}

function printAuditLog() {
 const list = cpFilteredAuditEntries();
 const nowStr = toLocalDateTimeStr(new Date());
 const rows = list.map(e => `<tr><td>${escapeHtml(e.at || "")}</td><td>${escapeHtml(e.type)}</td><td>${escapeHtml(e.kind)}</td><td>${escapeHtml(e.resident || "-")}</td><td>${escapeHtml(e.by || "-")}</td><td style="white-space:pre-wrap;">${escapeHtml(e.summary || "")}</td><td style="white-space:pre-wrap;">${escapeHtml(e.detail || "")}</td></tr>`).join("");
 const html = `
 <div style="font-family:'Hiragino Kaku Gothic ProN','Meiryo',sans-serif; color:#000; font-size:11px;">
 <h1 style="font-size:18px; margin:0 0 4px 0;">記録の取消・訂正・確認の履歴</h1>
 <div style="font-size:11px; margin-bottom:8px;">施設名: ${escapeHtml(getFacilityName())} / 印刷日時: ${escapeHtml(nowStr)} / 出力担当者: ${escapeHtml(cpLedgerStaff())} / ${list.length} 件</div>
 <table style="width:100%; border-collapse:collapse;" border="1" cellpadding="3">
 <thead><tr style="background:#eee;"><th>操作日時</th><th>操作</th><th>記録の種類</th><th>利用者</th><th>操作した職員</th><th>記録の内容</th><th>理由・訂正前の内容</th></tr></thead>
 <tbody>${rows || '<tr><td colspan="7">該当なし</td></tr>'}</tbody>
 </table>
 </div>`;
 runPrintJob(html, { page: "A4 landscape", fitOnePage: false });
}

// =====================================================================
// [Claude修正] 利用者別・期間を指定して記録を印刷（監査で「この方のこの期間の記録」を求められた時用）
// =====================================================================
function openPeriodPrintModal() {
 const sel = document.getElementById("ppResident");
 if (sel) {
 sel.innerHTML = "";
 (gState.residents || []).forEach(r => {
 const o = document.createElement("option"); o.value = String(r.id); o.textContent = `${r.room_no}号室 ${r.name}`; sel.appendChild(o);
 });
 if (gState.selectedResidentId) sel.value = String(gState.selectedResidentId);
 }
 const today = toLocalDateStr(new Date());
 const f = document.getElementById("ppFrom"), t = document.getElementById("ppTo");
 if (f && !f.value) f.value = today.slice(0, 8) + "01";
 if (t && !t.value) t.value = today;
 openModal("periodPrintModal");
}

function printPeriodRecords() {
 const rid = Number(document.getElementById("ppResident")?.value);
 const from = document.getElementById("ppFrom")?.value || "";
 const to = document.getElementById("ppTo")?.value || "";
 const incVoid = !!document.getElementById("ppIncludeVoided")?.checked;
 const r = (gState.residents || []).find(x => Number(x.id) === rid);
 if (!r) { alert("利用者を選んでください。"); return; }
 if (!from || !to || from > to) { alert("開始日と終了日を正しく入れてください。"); return; }
 const inRange = d => { const s = String(d || "").slice(0, 10); return s >= from && s <= to; };
 const vmark = x => x.voided ? `<div style="color:#991b1b; font-weight:bold;">【取消済 ${escapeHtml(x.voided_at || "")} ${escapeHtml(x.voided_by || "")} 理由: ${escapeHtml(x.void_reason || "-")}】</div>` : "";
 const keep = x => incVoid || !x.voided;
 const th = 'style="background:#eee; border:1px solid #999; padding:3px;"';
 const td = 'style="border:1px solid #999; padding:3px; vertical-align:top;"';
 let body = "";

 if (document.getElementById("ppCare")?.checked) {
 const recs = (db.data.care_records || []).filter(c => Number(c.resident_id) === rid && inRange(c.recorded_at || c.record_time) && keep(c))
 .sort((a, b) => String(a.recorded_at || "").localeCompare(String(b.recorded_at || "")));
 body += `<h2 style="font-size:14px; margin:12px 0 4px 0;">介護記録（経過記録） ${recs.length}件</h2>
 <table style="width:100%; border-collapse:collapse; font-size:11px;"><tr><th ${th}>日時</th><th ${th}>区分</th><th ${th}>内容</th><th ${th}>記録者</th></tr>
 ${recs.map(c => `<tr style="${c.voided ? 'color:#777;' : ''}"><td ${td}>${escapeHtml(c.recorded_at || "")}</td><td ${td}>${escapeHtml(c.category || "")}</td><td ${td}><div style="white-space:pre-wrap;">${cpCareRecordPrintNote(c)}${escapeHtml(c.content || "")}</div></td><td ${td}>${escapeHtml(c.staff_name || "")}</td></tr>`).join("") || `<tr><td ${td} colspan="4">記録なし</td></tr>`}</table>`;
 }
 if (document.getElementById("ppVitals")?.checked) {
 const vs = (db.data.vitals || []).filter(v => Number(v.resident_id) === rid && inRange(v.date)).sort((a, b) => `${a.date} ${a.time || ""}`.localeCompare(`${b.date} ${b.time || ""}`));
 body += `<h2 style="font-size:14px; margin:12px 0 4px 0;">バイタル ${vs.length}件</h2>
 <table style="width:100%; border-collapse:collapse; font-size:11px;"><tr><th ${th}>日付</th><th ${th}>時刻</th><th ${th}>体温</th><th ${th}>血圧</th><th ${th}>脈拍</th><th ${th}>SpO2</th><th ${th}>いつもと違う</th><th ${th}>記録者</th><th ${th}>訂正</th></tr>
 ${vs.map(v => `<tr><td ${td}>${escapeHtml(v.date || "")}</td><td ${td}>${escapeHtml(v.time || "")}</td><td ${td}>${v.temperature ?? "-"}</td><td ${td}>${v.bp_high ?? "-"}/${v.bp_low ?? "-"}</td><td ${td}>${v.pulse ?? "-"}</td><td ${td}>${v.spo2 ?? "-"}</td><td ${td}>${v.is_unusual ? "○" : ""}</td><td ${td}>${escapeHtml(v.staff_name || "")}</td><td ${td}>${(v.edit_history || []).length ? `${v.edit_history.length}回（最終 ${escapeHtml(v.edit_history[v.edit_history.length - 1].edited_at)} ${escapeHtml(v.edit_history[v.edit_history.length - 1].edited_by)}）` : ""}</td></tr>`).join("") || `<tr><td ${td} colspan="9">記録なし</td></tr>`}</table>`;
 }
 if (document.getElementById("ppMeds")?.checked) {
 // [Antigravity実装 2026-10-19] 印刷時もその日に飲む日の薬・目薬の内容を表示
 const ms = (db.data.meds || []).filter(m => Number(m.resident_id) === rid && inRange(m.date) && keep(m)).sort((a, b) => `${a.date} ${a.slot}`.localeCompare(`${b.date} ${b.slot}`));
 body += `<h2 style="font-size:14px; margin:12px 0 4px 0;">服薬・点眼 ${ms.length}件</h2>
 <table style="width:100%; border-collapse:collapse; font-size:11px;"><tr><th ${th}>日付</th><th ${th}>時間帯</th><th ${th}>状態・内容</th><th ${th}>飲んだ時刻</th><th ${th}>記録した時刻</th><th ${th}>記録者</th></tr>
 ${ms.map(m => {
 const tk = m.timing_key || m.slot || "";
 let detailStr = m.bag ? `（袋の中 ${m.bag}）` : "";
 if (!detailStr && m.medicine_name) {
 detailStr = `（${m.eye ? "[" + m.eye + "] " : ""}${m.medicine_name}）`;
 } else if (!detailStr && typeof cpBagText === "function" && m.date && tk) {
 const bt = cpBagText(rid, tk, m.date);
 if (bt) detailStr = `（袋の中 ${bt}）`;
 }
 return `<tr style="${m.voided ? 'color:#777;' : ''}"><td ${td}>${escapeHtml(m.date || "")}</td><td ${td}>${escapeHtml(tk)}</td><td ${td}>${vmark(m)}${escapeHtml(m.status || "")}${escapeHtml(detailStr)}</td><td ${td}>${escapeHtml(m.given_time || "")}${m.given_on_time ? "（時間どおり）" : ""}</td><td ${td}>${escapeHtml(m.recorded_at || "")}</td><td ${td}>${escapeHtml(m.staff_name || "")}</td></tr>`;
 }).join("") || `<tr><td ${td} colspan="6">記録なし</td></tr>`}</table>`;
 }
 if (document.getElementById("ppTopical")?.checked) {
 const tps = (db.data.topical_records || []).filter(t => Number(t.resident_id) === rid && inRange(t.date) && keep(t)).sort((a, b) => String(a.done_at || "").localeCompare(String(b.done_at || "")));
 body += `<h2 style="font-size:14px; margin:12px 0 4px 0;">塗布薬・湿布 ${tps.length}件</h2>
 <table style="width:100%; border-collapse:collapse; font-size:11px;"><tr><th ${th}>日付</th><th ${th}>時間帯</th><th ${th}>薬</th><th ${th}>部位</th><th ${th}>記録時刻</th><th ${th}>記録者</th></tr>
 ${tps.map(t => `<tr style="${t.voided ? 'color:#777;' : ''}"><td ${td}>${escapeHtml(t.date || "")}</td><td ${td}>${escapeHtml(t.timing || "")}</td><td ${td}>${vmark(t)}${escapeHtml(t.item_name || "")}</td><td ${td}>${escapeHtml(t.site_name || "")}</td><td ${td}>${escapeHtml(String(t.done_at || "").slice(11, 16))}</td><td ${td}>${escapeHtml(t.staff_name || "")}</td></tr>`).join("") || `<tr><td ${td} colspan="6">記録なし</td></tr>`}</table>`;
 }
 if (document.getElementById("ppTurns")?.checked) {
 const ts = (db.data.turns || []).filter(t => Number(t.resident_id) === rid && inRange(t.date) && keep(t)).sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
 body += `<h2 style="font-size:14px; margin:12px 0 4px 0;">夜間巡視・体位変換 ${ts.length}件</h2>
 <table style="width:100%; border-collapse:collapse; font-size:11px;"><tr><th ${th}>日付</th><th ${th}>時刻</th><th ${th}>内容</th><th ${th}>記録者</th></tr>
 ${ts.map(t => `<tr style="${t.voided ? 'color:#777;' : ''}"><td ${td}>${escapeHtml(t.date || "")}</td><td ${td}>${escapeHtml(t.time || "")}</td><td ${td}>${vmark(t)}${escapeHtml(t.action || "")}</td><td ${td}>${escapeHtml(t.staff_name || "")}</td></tr>`).join("") || `<tr><td ${td} colspan="4">記録なし</td></tr>`}</table>`;
 }
 const html = `
 <div style="font-family:'Hiragino Kaku Gothic ProN','Meiryo',sans-serif; color:#000;">
 <div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid #173f33; padding-bottom:6px;">
 <div><h1 style="font-size:18px; margin:0;">個別記録（期間指定）</h1>
 <div style="font-size:12px;">対象利用者: <strong>${escapeHtml(r.room_no + "号室 " + r.name)} 様</strong> (${escapeHtml(r.care_level || "")}) / 期間: ${escapeHtml(from)} 〜 ${escapeHtml(to)}${incVoid ? " / 取消済みを含む" : ""}</div></div>
 <div style="font-size:11px; text-align:right;">施設名: ${escapeHtml(getFacilityName())}<br>印刷日時: ${escapeHtml(toLocalDateTimeStr(new Date()))}<br>出力担当者: ${escapeHtml(cpLedgerStaff())}</div>
 </div>
 ${body || "<p>印刷する記録が選ばれていません。</p>"}
 <div style="margin-top:16px; font-size:11px; display:flex; justify-content:space-between;"><span>ケアポータル 統合管理システム（期間指定印刷）</span><span>確認印: __________________</span></div>
 </div>`;
 closeModal("periodPrintModal");
 runPrintJob(html, { page: "A4 portrait", fitOnePage: false });
}

// 勤務表 (A4横・1枚) の印刷
function printShiftTable() {
 const table = document.getElementById("shiftMatrixTable");
 if (!table) {
 alert("勤務表が見つかりません。");
 return;
 }
 const ym = (typeof getShiftYearMonth === "function") ? getShiftYearMonth() : "";
 const [y, m] = ym.split("-");
 const facility = getFacilityName();
 const clone = table.cloneNode(true);
 clone.removeAttribute("id");
 clone.querySelectorAll("[id]").forEach(el => el.removeAttribute("id"));
 clone.querySelectorAll("[onclick],[ondblclick]").forEach(el => { el.removeAttribute("onclick"); el.removeAttribute("ondblclick"); });
 clone.style.minWidth = "0";
 clone.style.width = "100%";
 const html = `
 <div style="font-family:'Hiragino Kaku Gothic ProN', 'Meiryo', sans-serif; color:#000;">
 <div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid #000; padding-bottom:6px; margin-bottom:8px;">
 <h1 style="font-size:18px; margin:0;">${escapeHtml(facility)} 月間勤務表 ${y ? `${escapeHtml(y)}年${Number(m)}月` : ""}</h1>
 <div style="font-size:11px;">印刷日時: ${new Date().toLocaleString("ja-JP")}</div>
 </div>
 ${clone.outerHTML}
 </div>`;
 runPrintJob(html, { page: "A4 landscape", fitOnePage: true, minScale: 0.3 });
}

// 利用者別 月末請求明細 (A4縦・1枚) の印刷
function printBillingDetail() {
 // [Claude修正] 表示中の明細（全員の一覧、または選んだ利用者）を、対象の月を入れて印刷する
 const area = document.getElementById("billingDetailArea");
 if (!area || !area.innerHTML.trim()) {
  renderBillingDetail();
 }
 if (!area || !area.innerHTML.trim()) { alert("印刷する明細がありません。"); return; }
 const facility = getFacilityName();
 const body = area.innerHTML.replace(/<td class="no-print">[\s\S]*?<\/td>/g, "").replace(/<th class="no-print"><\/th>/g, "");
 const html = `
 <div style="font-family:'BIZ UDPGothic','Meiryo',sans-serif; color:#000;">
  <div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid #000; padding-bottom:8px; margin-bottom:14px;">
   <h1 style="font-size:20px; margin:0;">物品使用明細</h1>
   <div style="text-align:right; font-size:12px;"><div>${escapeHtml(facility)}</div><div>印刷日時: ${new Date().toLocaleString("ja-JP")}</div></div>
  </div>
  ${body}
 </div>`;
 runPrintJob(html, { page: "A4 portrait", fitOnePage: false });
}

function printCareSummary() {
 const rId = Number(document.getElementById("csResidentId")?.value) || gState.selectedResidentId;
 const r = gState.residents ? gState.residents.find(x => Number(x.id) === rId) : null;
 const printArea = document.getElementById("printArea");
 if (!printArea) {
 alert("印刷コンテナが見つかりません。");
 return;
 }

 const summaryType = document.getElementById("csSummaryType")?.value || "介護サマリー";
 const dateVal = document.getElementById("csDate")?.value || toLocalDateStr(new Date());
 const staffVal = document.getElementById("csStaff")?.value || "職員";
 const basicInfo = document.getElementById("csBasicInfo")?.value || "-";
 const background = document.getElementById("csBackground")?.value || "-";
 const physicalCognitive = document.getElementById("csPhysicalCognitive")?.value || "-";
 const adl = document.getElementById("csAdl")?.value || "-";
 const mealsHydration = document.getElementById("csMealsHydration")?.value || "-";
 const excretion = document.getElementById("csExcretion")?.value || "-";
 const sleep = document.getElementById("csSleep")?.value || "-";
 const meds = document.getElementById("csMeds")?.value || "-";
 const medicalCare = document.getElementById("csMedicalCare")?.value || "-";
 const dementiaBehavior = document.getElementById("csDementiaBehavior")?.value || "-";
 const careNotes = document.getElementById("csCareNotes")?.value || "-";
 const familyInfo = document.getElementById("csFamilyInfo")?.value || "-";
 const futureGoals = document.getElementById("csFutureGoals")?.value || "-";

 printArea.innerHTML = `
 <div style="font-family:'Hiragino Kaku Gothic ProN', 'Meiryo', sans-serif; color:#000; padding:10px;">
 <div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid #173f33; padding-bottom:8px; margin-bottom:12px;">
 <div>
 <h1 style="font-size:22px; margin:0; color:#173f33;">介護サマリー (生活・ADLアセスメント詳細)</h1>
 <p style="font-size:13px; color:#36443e; margin:4px 0 0 0;">
 対象利用者: <strong>${r ? escapeHtml(r.name) : ""} 様</strong> (${r ? escapeHtml(r.room_no) : ""}号室 / ${r ? escapeHtml(r.care_level) : ""})
 / サマリー種別: <strong>${escapeHtml(summaryType)}</strong>
 </p>
 </div>
 <div style="text-align:right; font-size:12px; color:#4a5852;">
 <div>作成日: ${escapeHtml(dateVal)}</div>
 <div>作成者: ${escapeHtml(staffVal)}</div>
 </div>
 </div>

 <table style="width:100%; border-collapse:collapse; font-size:12px; margin-bottom:10px;" border="1">
 <tr>
 <th style="width:160px; background:#eef2ef; padding:6px; text-align:left;">1. 基本情報</th>
 <td style="padding:6px; white-space:pre-wrap;">${escapeHtml(basicInfo)}</td>
 </tr>
 <tr>
 <th style="background:#eef2ef; padding:6px; text-align:left;">2. これまでの経過</th>
 <td style="padding:6px; white-space:pre-wrap;">${escapeHtml(background)}</td>
 </tr>
 <tr>
 <th style="background:#eef2ef; padding:6px; text-align:left;">3. 現在の身体・認知状態</th>
 <td style="padding:6px; white-space:pre-wrap;">${escapeHtml(physicalCognitive)}</td>
 </tr>
 <tr>
				<th style="background:#eef2ef; padding:6px; text-align:left;">4. ADL (日常生活動作)</th>
				<td style="padding:6px; white-space:pre-wrap;">${(() => {
					const sid = document.getElementById("csSummaryId")?.value;
					const curSummary = sid ? (db.data.care_summaries || []).find(x => x.id === Number(sid)) : null;
					let activeItems = [];
					if (curSummary && Array.isArray(curSummary.adl_items) && curSummary.adl_items.length > 0) {
						activeItems = curSummary.adl_items;
					} else {
						const domItems = CP_SUMMARY_ADL_ACTIONS.map(act => ({
							key: act.key,
							action: act.name,
							level: document.getElementById(`csAdlLevel_${act.key}`)?.value || "",
							method: document.getElementById(`csAdlMethod_${act.key}`)?.value || ""
						}));
						if (domItems.some(it => it.level)) {
							activeItems = domItems;
						}
					}
					if (activeItems.length > 0 && activeItems.some(it => it.level)) {
						const trs = activeItems.map(it => `
							<tr>
								<td style="padding:4px 6px; font-weight:bold; border:1px solid #333;">${escapeHtml(it.action || it.key)}</td>
								<td style="padding:4px 6px; text-align:center; border:1px solid #333;">${escapeHtml(it.level || "-")}</td>
								<td style="padding:4px 6px; border:1px solid #333;">${escapeHtml(it.method || "-")}</td>
							</tr>
						`).join("");
						return `
							<table style="width:100%; border-collapse:collapse; font-size:11.5px; margin-top:2px;" border="1">
								<thead>
									<tr style="background:#eef2ef;">
										<th style="width:22%; padding:4px 6px; text-align:left; border:1px solid #333;">動作</th>
										<th style="width:20%; padding:4px 6px; text-align:center; border:1px solid #333;">段階</th>
										<th style="padding:4px 6px; text-align:left; border:1px solid #333;">介助のやり方</th>
									</tr>
								</thead>
								<tbody>${trs}</tbody>
							</table>
						`;
					}
					return `<div><span style="font-weight:bold; margin-right:4px;">［前の書き方（文章）］</span>${escapeHtml(adl)}</div>`;
				})()}</td>
			</tr>
 <tr>
 <th style="background:#eef2ef; padding:6px; text-align:left;">5. 食事・水分摂取</th>
 <td style="padding:6px; white-space:pre-wrap;">${escapeHtml(mealsHydration)}</td>
 </tr>
 <tr>
 <th style="background:#eef2ef; padding:6px; text-align:left;">6. 排泄</th>
 <td style="padding:6px; white-space:pre-wrap;">${escapeHtml(excretion)}</td>
 </tr>
 <tr>
 <th style="background:#eef2ef; padding:6px; text-align:left;">7. 睡眠</th>
 <td style="padding:6px; white-space:pre-wrap;">${escapeHtml(sleep)}</td>
 </tr>
 <tr>
 <th style="background:#eef2ef; padding:6px; text-align:left;">8. 服薬</th>
 <td style="padding:6px; white-space:pre-wrap;">${escapeHtml(meds)}</td>
 </tr>
 <tr>
 <th style="background:#eef2ef; padding:6px; text-align:left;">9. 医療的な処置</th>
 <td style="padding:6px; white-space:pre-wrap;">${escapeHtml(medicalCare)}</td>
 </tr>
 <tr>
 <th style="background:#eef2ef; padding:6px; text-align:left;">10. 認知症の症状や行動</th>
 <td style="padding:6px; white-space:pre-wrap;">${escapeHtml(dementiaBehavior)}</td>
 </tr>
 <tr>
 <th style="background:#eef2ef; padding:6px; text-align:left;">11. 介助方法・注意点</th>
 <td style="padding:6px; white-space:pre-wrap;">${escapeHtml(careNotes)}</td>
 </tr>
 <tr>
 <th style="background:#eef2ef; padding:6px; text-align:left;">12. 家族の状況</th>
 <td style="padding:6px; white-space:pre-wrap;">${escapeHtml(familyInfo)}</td>
 </tr>
 <tr>
 <th style="background:#eef2ef; padding:6px; text-align:left;">13. 今後の支援で気をつけること</th>
 <td style="padding:6px; white-space:pre-wrap;">${escapeHtml(futureGoals)}</td>
 </tr>
 </table>
 </div>
 `;
 runPrintJob(printArea.innerHTML, { page: "A4 portrait", fitOnePage: true });
}

// ======================================================================
// 緊急搬送・受診申し送りサマリー機能
// ======================================================================
function openEmergencySummaryModal(resId) {
 const targetId = (resId !== undefined && resId !== null && resId !== '') ? Number(resId) : Number(gState.selectedResidentId);
 const r = gState.residents ? gState.residents.find(x => Number(x.id) === targetId) : null;
 if (!r) {
 alert("利用者を選択してください。");
 return;
 }

 const badgeEl = document.getElementById("emgResidentBadge");
 if (badgeEl) badgeEl.textContent = `${r.room_no}号室 ${r.name} 様 (${r.care_level}) 救急隊・受診医療機関提出用`;

 const reasonInput = document.getElementById("emgReasonInput");
 if (reasonInput) {
 if (!reasonInput.value) {
 reasonInput.value = "";
 }
 }

 renderEmergencySummaryPreview(r);

 const modal = document.getElementById("emergencySummaryModal");
 if (modal) modal.style.display = "flex";
}

function updateEmergencyPreviewReason() {
 const rId = gState.selectedResidentId;
 const r = gState.residents ? gState.residents.find(x => Number(x.id) === Number(rId)) : null;
 if (r) renderEmergencySummaryPreview(r);
}

function renderEmergencySummaryPreview(r) {
 const container = document.getElementById("emergencySummarySheetPreview");
 if (!container || !r) return;

 const reasonText = document.getElementById("emgReasonInput")?.value || "（未記入・特変発生状況または受診理由を記載してください）";
 const nowStr = new Date().toLocaleString("ja-JP");
 const staffName = document.getElementById("currentStaff")?.value || "職員";
 const facility = getFacilityName(); // [Claude修正] 未設定の gState.facilityName を参照しており、変更した施設名が反映されていなかった

 // [Claude修正] 配列の最後ではなく、日付・時刻がいちばん新しいバイタルを出す（編集すると配列の順番と日付の順番がずれるため）
 const vitals = (db.data.vitals || []).filter(v => Number(v.resident_id) === Number(r.id))
 .slice().sort((a, b) => `${a.date || ""} ${a.time || ""}`.localeCompare(`${b.date || ""} ${b.time || ""}`));
 const latestVital = vitals.length > 0 ? vitals[vitals.length - 1] : null;
 const vitalStr = latestVital ? `体温: ${latestVital.temperature || "-"}℃ / 血圧: ${latestVital.bp_high || "-"}/${latestVital.bp_low || "-"} mmHg / 脈拍: ${latestVital.pulse || "-"} / SpO2: ${latestVital.spo2 || "-"}% (${latestVital.measured_at || latestVital.date || ""})` : "記録なし";

 const records = (db.data.care_records || []).filter(c => !c.voided && Number(c.resident_id) === Number(r.id) && (c.category === "特変" || c.category === "バイタル" || c.category === "巡視")).slice(0, 3);
 const recordsHtml = records.length > 0 ? records.map(rc => `<div>・[${escapeHtml(rc.recorded_at || "")}] [${escapeHtml(rc.category || "")}] ${escapeHtml(rc.content || "")} (${escapeHtml(rc.staff_name || "")})</div>`).join("") : "<div>特変記録なし</div>";

 const summaries = cpSummariesOfResident(r.id);
 const latestSummary = summaries.length > 0 ? summaries[0] : null;

 container.innerHTML = `
 <div style="font-family:'Hiragino Kaku Gothic ProN', 'Meiryo', sans-serif; color:#1c2622;">
 <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #dc2626; padding-bottom:8px; margin-bottom:12px;">
 <div>
 <h2 style="font-size:20px; font-weight:bold; margin:0; color:#b91c1c;">緊急搬送・受診 申し送りサマリー</h2>
 <div style="font-size:12.5px; color:#4a5852; margin-top:2px;">施設名: <strong>${escapeHtml(facility)}</strong></div>
 </div>
 <div style="text-align:right; font-size:12px; color:#5f6d66;">
 <div>作成日時: <strong>${nowStr}</strong></div>
 <div>作成担当職員: <strong>${escapeHtml(staffName)}</strong></div>
 </div>
 </div>

 <div style="background:#fef2f2; border:2px solid #ef4444; border-radius:6px; padding:10px 12px; margin-bottom:12px;">
 <div style="font-weight:bold; color:#991b1b; font-size:13px; margin-bottom:3px;">【本日の救急搬送・受診理由 ＆ 発生状況】</div>
 <div style="font-size:13px; color:#22302b; white-space:pre-wrap; line-height:1.5;">${escapeHtml(reasonText)}</div>
 </div>

 <table style="width:100%; border-collapse:collapse; font-size:12px; margin-bottom:10px;" border="1">
 <tr>
 <th style="width:120px; background:#f6f8f6; padding:6px; text-align:left;">氏名</th>
 <td style="padding:6px; font-weight:bold; font-size:14px;">${escapeHtml(r.name)} 様 (${r.room_no}号室)</td>
 <th style="width:100px; background:#f6f8f6; padding:6px; text-align:left;">要介護度</th>
 <td style="padding:6px; font-weight:bold;">${escapeHtml(r.care_level)}</td>
 </tr>
 <tr>
 <th style="background:#f6f8f6; padding:6px; text-align:left;">生年月日 / 年齢</th>
 <td style="padding:6px;">${escapeHtml(r.birth_date || "-")}</td>
 <th style="background:#f6f8f6; padding:6px; text-align:left;">基本方針</th>
 <td style="padding:6px; font-weight:bold; color:${r.policy_stamp === '看取り' ? '#b91c1c' : '#1a4f3d'};">［ ${escapeHtml(r.policy_stamp || "未設定")} ］</td>
 </tr>
 <tr>
 <th style="background:#f6f8f6; padding:6px; text-align:left;">緊急連絡先</th>
 <td colspan="3" style="padding:6px; font-weight:bold; color:#1c2622;">${escapeHtml(r.emergency_contact || "未登録")}</td>
 </tr>
 <tr>
 <th style="background:#f6f8f6; padding:6px; text-align:left;">家族要望・ACP</th>
 <td colspan="3" style="padding:6px;">${escapeHtml(r.family_wishes || "未登録")}</td>
 </tr>
 </table>

 <table style="width:100%; border-collapse:collapse; font-size:12px; margin-bottom:10px;" border="1">
 <tr style="background:#fff1f2;">
 <th style="width:120px; color:#991b1b; padding:6px; text-align:left;">アレルギー</th>
 <td colspan="3" style="padding:6px; color:#dc2626; font-weight:bold; font-size:13px;">${escapeHtml(r.allergies || "未登録")}</td>
 </tr>
 <tr>
 <th style="width:120px; background:#f6f8f6; padding:6px; text-align:left;">既往歴・病歴</th>
 <td colspan="3" style="padding:6px;">${escapeHtml(r.diseases || "未登録")}</td>
 </tr>
 <tr>
 <th style="background:#f6f8f6; padding:6px; text-align:left;">往診医・受診指示</th>
 <td colspan="3" style="padding:6px;">${escapeHtml(r.dr_instructions || "未登録")}</td>
 </tr>
 <tr>
 <th style="background:#f6f8f6; padding:6px; text-align:left;">身体麻痺・状態</th>
 <td style="padding:6px;">${escapeHtml(r.paralysis || "未登録")}</td>
 <th style="width:100px; background:#f6f8f6; padding:6px; text-align:left;">食形態・口腔</th>
 <td style="padding:6px;">${escapeHtml(r.diet_type || "未登録")} / ${escapeHtml(r.oral_state || "未登録")}</td>
 </tr>
 <tr>
 <th style="background:#f6f8f6; padding:6px; text-align:left;">最新バイタル</th>
 <td colspan="3" style="padding:6px; font-weight:bold;">${escapeHtml(vitalStr)}</td>
 </tr>
 </table>

 <div style="background:#f6f8f6; border:1px solid #cdd6d0; border-radius:6px; padding:8px 10px; margin-bottom:10px; font-size:12px;">
 <strong style="color:#173f33;">【生活動作・ADL・介助注意点 (介護サマリー抜粋)】:</strong>
 <div style="margin-top:3px; line-height:1.4;">
 <strong>ADL:</strong> ${latestSummary ? escapeHtml(latestSummary.adl) : '未登録（介護サマリー未作成）'} /
 <strong>排泄:</strong> ${latestSummary ? escapeHtml(latestSummary.excretion) : '未登録（介護サマリー未作成）'} /
 <strong>認知症・BPSD:</strong> ${latestSummary ? escapeHtml(latestSummary.dementia_behavior) : '未登録（介護サマリー未作成）'}
 </div>
 </div>

 <div style="background:#f6f8f6; border:1px solid #cdd6d0; border-radius:6px; padding:8px 10px; font-size:12px;">
 <strong style="color:#173f33;">【施設内 直近の経過・特変記録抜粋】:</strong>
 <div style="margin-top:3px; line-height:1.4;">${recordsHtml}</div>
 </div>
 </div>
 `;
}

function printEmergencySummary() {
 const container = document.getElementById("emergencySummarySheetPreview");
 const printArea = document.getElementById("printArea");
 if (!container || !printArea) {
 alert("印刷コンテナが見つかりません。");
 return;
 }
 printArea.innerHTML = container.innerHTML;
 runPrintJob(printArea.innerHTML, { page: "A4 portrait", fitOnePage: true });
}

function copyEmergencySummaryText() {
 const rId = gState.selectedResidentId;
 const r = gState.residents ? gState.residents.find(x => Number(x.id) === Number(rId)) : null;
 if (!r) return;

 const reasonText = document.getElementById("emgReasonInput")?.value || "（未記入）";
 const facility = getFacilityName(); // [Claude修正] 未設定の gState.facilityName を参照しており、変更した施設名が反映されていなかった
 const nowStr = new Date().toLocaleString("ja-JP");
 const staffName = document.getElementById("currentStaff")?.value || "職員";

 const summaries = cpSummariesOfResident(r.id);
 const s = summaries.length > 0 ? summaries[0] : null;

 const text = `【緊急搬送・受診 申し送り書】
施設名: ${facility}
作成日時: ${nowStr}
作成者: ${staffName}

■ 救急要請・受診理由
${reasonText}

■ 基本情報
氏名: ${r.name} 様 (${r.room_no}号室)
要介護度: ${r.care_level}
生年月日: ${r.birth_date || "-"}
基本方針: ［${r.policy_stamp || "未設定"}］
緊急連絡先: ${r.emergency_contact || "未登録"}
家族要望: ${r.family_wishes || "未登録"}

■ 医療・身体状態
アレルギー: ${r.allergies || "未登録"}
既往歴: ${r.diseases || "未登録"}
麻痺: ${r.paralysis || "未登録"}
食形態・口腔: ${r.diet_type || "未登録"} / ${r.oral_state || "未登録"}
往診医指示: ${r.dr_instructions || "未登録"}

■ 生活・ADL抜粋
ADL: ${s ? s.adl : "未登録（介護サマリー未作成）"}
排泄: ${s ? s.excretion : "未登録（介護サマリー未作成）"}
認知機能・注意点: ${s ? s.care_notes : "未登録（介護サマリー未作成）"}
`;

 if (navigator.clipboard && navigator.clipboard.writeText) {
 navigator.clipboard.writeText(text).then(() => {
 alert("緊急搬送・申し送りサマリーをクリップボードにコピーしました。");
 }).catch(() => {
 alert("コピーに失敗しました。画面のプレビューより選択してコピーしてください。");
 });
 } else {
 alert("クリップボードAPI非対応環境です。");
 }
}

