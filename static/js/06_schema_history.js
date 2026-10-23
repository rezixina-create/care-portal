// ======================================================================
// 皮膚・身体シェーマ図 (軟膏塗布・処置ピン・A4モノクロ印刷)
// ======================================================================

function renderSchemaSummaryBadges(residentId) {
 const rId = Number(residentId);
 const allPins = ((db && db.data && db.data.body_schema_pins) ? db.data.body_schema_pins : []).filter(p => !p.voided); // [Claude修正] 取消済みは表示しない
 const pins = allPins.filter(p => Number(p.resident_id) === rId && p.status !== "治癒・終了");
 if (pins.length === 0) {
 return `<span style="color:#5f6d66; font-size:11.5px;">特記処置なし</span>`;
 }
 pins.sort((a, b) => (Number(a.pin_no) || 0) - (Number(b.pin_no) || 0));
 return pins.map(p => `
 <span style="display:inline-flex; align-items:center; gap:3px; background:#eef2ef; border:1px solid #cdd6d0; border-radius:4px; padding:1px 6px; font-size:11px; margin-right:4px;">
 <span style="display:inline-block; width:15px; height:15px; line-height:15px; border-radius:50%; background:#000000; color:#ffffff; font-size:9.5px; text-align:center; font-weight:bold;">${p.pin_no}</span>
 <strong>${escapeHtml(p.site_name)}:</strong> ${cpDrugLink(p.item_name, "drug-link-inline")}
 </span>
 `).join("");
}

function openBodySchemaModal(residentId) {
 const rId = Number(residentId || gState.selectedResidentId || 1);
 gState.schemaResidentId = rId;

 const r = (gState.residents || []).find(x => Number(x.id) === rId);
 const badge = document.getElementById("schemaResidentBadge");
 if (badge) {
 if (r) {
 badge.textContent = `${r.name} 様 (${r.room_no}号室 / ${r.care_level})`;
 } else {
 badge.textContent = "利用者情報";
 }
 }

 resetSchemaPinForm();
 renderBodySchemaPins();
 openModal("bodySchemaModal");
}

function openBodySchemaForIncident() {
 const sel = document.getElementById("incResidentSelect");
 const rId = sel ? Number(sel.value) : Number(gState.selectedResidentId);
 openBodySchemaModal(rId || gState.selectedResidentId);
}

function renderBodySchemaPins() {
 const overlay = document.getElementById("schemaPinsOverlay");
 const tableContainer = document.getElementById("schemaPinsTableContainer");
 const countTitle = document.getElementById("schemaPinsCountTitle");
 if (!overlay || !tableContainer) return;

 const rId = Number(gState.schemaResidentId || gState.selectedResidentId);
 const allPins = ((db && db.data && db.data.body_schema_pins) ? db.data.body_schema_pins : []).filter(p => !p.voided); // [Claude修正] 取消済みは表示しない
 const pins = allPins.filter(p => Number(p.resident_id) === rId);

 pins.sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));
 pins.forEach((p, idx) => { p.pin_no = idx + 1; });

 if (countTitle) {
 countTitle.textContent = `登録中の処置・ピン一覧 (${pins.length}件)`;
 }

 const activeEditId = Number(document.getElementById("schemaEditPinId")?.value || 0);
 let pinsHtml = "";
 pins.forEach(p => {
 const isSelected = activeEditId === Number(p.id);
 const selectedStyle = isSelected
 ? "background:#ffffff; color:#000000; border:2px solid #000000; transform:scale(1.25); z-index:25; box-shadow:0 0 8px rgba(0,0,0,0.9);"
 : "background:#000000; color:#ffffff; border:2px solid #ffffff; z-index:10; box-shadow:0 2px 5px rgba(0,0,0,0.7);";

 pinsHtml += `
 <div class="schema-pin-badge" id="schemaPinEl_${p.id}"
 style="position:absolute; left:${p.x_pct}%; top:${p.y_pct}%; width:26px; height:26px; margin-left:-13px; margin-top:-13px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:13px; cursor:pointer; pointer-events:auto; user-select:none; transition:transform 0.15s ease; ${selectedStyle}"
 title="[${p.pin_no}] ${escapeHtml(p.site_name)}: ${escapeHtml(p.item_name)} (${escapeHtml(p.frequency || '-')})"
 onclick="event.stopPropagation(); editSchemaPin(${p.id});">
 ${p.pin_no}
 </div>
 `;
 });
 overlay.innerHTML = pinsHtml;

 if (pins.length === 0) {
 tableContainer.innerHTML = `
 <div style="text-align:center; padding:24px 10px; color:#5f6d66; font-size:12px;">
 現在登録されている処置ピンはありません。<br>
 左の人体図（正面・背面）をクリックしてピンを配置してください。
 </div>
 `;
 return;
 }

 let tableHtml = `
 <table class="table" style="width:100%; font-size:12px; margin-bottom:0; border-collapse:collapse;">
 <thead>
 <tr style="background:#eef2ef; color:#1c2622; border-bottom:2px solid #cdd6d0;">
 <th style="padding:6px 8px; width:40px; text-align:center;">番号</th>
 <th style="padding:6px 8px; width:85px;">部位</th>
 <th style="padding:6px 8px;">処置内容・薬剤名</th>
 <th style="padding:6px 8px; width:80px;">頻度</th>
 <th style="padding:6px 8px; width:65px; text-align:center;">状態</th>
 <th style="padding:6px 8px; width:95px; text-align:center;">操作</th>
 </tr>
 </thead>
 <tbody>
 `;

 pins.forEach(p => {
 const isSelected = activeEditId === Number(p.id);
 const rowBg = isSelected ? "background:#fef3c7;" : "";
 tableHtml += `
 <tr style="border-bottom:1px solid #dfe5e1; ${rowBg}">
 <td style="padding:6px 8px; text-align:center;">
 <span style="display:inline-block; width:22px; height:22px; line-height:20px; border-radius:50%; background:#000000; color:#ffffff; font-weight:bold; font-size:12px; text-align:center;">
 ${p.pin_no}
 </span>
 </td>
 <td style="padding:6px 8px;">
 <strong>${escapeHtml(p.site_name || '-')}</strong>
 <div style="font-size:10px; color:#5f6d66;">${escapeHtml(p.category || '-')}</div>
 </td>
 <td style="padding:6px 8px;">
 <div style="font-weight:bold; color:#1c2622;">${escapeHtml(p.item_name || '-')}</div>
 ${p.notes ? `<div style="font-size:11px; color:#4a5852; margin-top:2px;">${escapeHtml(p.notes)}</div>` : ''}
 </td>
 <td style="padding:6px 8px; font-size:11px; color:#36443e;">
 ${escapeHtml(p.frequency || '-')}
 </td>
 <td style="padding:6px 8px; text-align:center;">
 <span style="font-size:10.5px; padding:2px 5px; border-radius:4px; font-weight:bold; background:${p.status === '継続中' ? '#dfe5e1' : '#dcfce7'}; color:#1c2622; border:1px solid #94a19a;">
 ${escapeHtml(p.status || '継続中')}
 </span>
 </td>
 <td style="padding:6px 8px; text-align:center; white-space:nowrap;">
 <button type="button" class="btn btn-secondary" style="font-size:11px; padding:2px 7px;" onclick="editSchemaPin(${p.id})">訂正</button>
 <button type="button" class="btn btn-danger" style="font-size:11px; padding:2px 7px; margin-left:3px;" onclick="deleteSchemaPinById(${p.id})">削除</button>
 </td>
 </tr>
 `;
 });

 tableHtml += `</tbody></table>`;
 tableContainer.innerHTML = tableHtml;
}

function handleSchemaImageClick(event) {
 const wrapper = document.getElementById("schemaImageWrapper");
 if (!wrapper) return;

 const rect = wrapper.getBoundingClientRect();
 const clickX = event.clientX - rect.left;
 const clickY = event.clientY - rect.top;

 let xPct = (clickX / rect.width) * 100;
 let yPct = (clickY / rect.height) * 100;

 xPct = Math.max(2, Math.min(98, Math.round(xPct * 10) / 10));
 yPct = Math.max(2, Math.min(98, Math.round(yPct * 10) / 10));

 const isFront = xPct < 50;
 const viewName = isFront ? "正面図" : "背面図";

 let suggestedSite = "";
 if (yPct < 16) {
 suggestedSite = isFront ? "頭部・顔面" : "後頭部・頚部";
 } else if (yPct < 35) {
 suggestedSite = isFront ? "胸部・上肢" : "背部・肩甲骨部";
 } else if (yPct < 50) {
 suggestedSite = isFront ? "腹部・前腕" : "腰部・仙骨部";
 } else if (yPct < 75) {
 suggestedSite = isFront ? "大腿部・膝" : "臀部・大腿後面";
 } else {
 suggestedSite = isFront ? "下腿・足部" : "下腿後面・踵部";
 }

 const idInput = document.getElementById("schemaEditPinId");

 // [Claude修正] 既存ピンの「訂正」中に図をクリックした場合は、新規ピンにせず、そのピンの移動先として扱う。
 // (旧実装は訂正中でも新規登録に切り替わり、位置を直すには新規追加と削除をやり直す必要があった)
 const editingId = idInput ? Number(idInput.value || 0) : 0;
 if (editingId > 0) {
 const xIn = document.getElementById("schemaEditPinXPct");
 const yIn = document.getElementById("schemaEditPinYPct");
 if (xIn) xIn.value = xPct;
 if (yIn) yIn.value = yPct;
 const pinEl = document.getElementById(`schemaPinEl_${editingId}`);
 if (pinEl) {
 pinEl.style.left = `${xPct}%`;
 pinEl.style.top = `${yPct}%`;
 pinEl.style.border = "2px dashed #000000";
 }
 const badge = document.getElementById("schemaPinCoordsBadge");
 if (badge) {
 badge.textContent = `移動先: ${viewName} (${xPct}%, ${yPct}%) - まだ保存されていません。保存ボタンで位置も更新されます`;
 }
 return;
 }

 if (idInput) idInput.value = "";

 const xInput = document.getElementById("schemaEditPinXPct");
 if (xInput) xInput.value = xPct;

 const yInput = document.getElementById("schemaEditPinYPct");
 if (yInput) yInput.value = yPct;

 const siteInput = document.getElementById("schemaPinSite");
 if (siteInput && !siteInput.value.trim()) {
 siteInput.value = suggestedSite;
 }

 const coordsBadge = document.getElementById("schemaPinCoordsBadge");
 if (coordsBadge) {
 coordsBadge.textContent = `位置: ${viewName} (${xPct}%, ${yPct}%)`;
 }

 const titleEl = document.getElementById("schemaPinEditTitle");
 if (titleEl) {
 titleEl.textContent = `新規ピン登録 (${viewName}: ${suggestedSite} 付近)`;
 }

 const delBtn = document.getElementById("btnDeleteSchemaPin");
 if (delBtn) delBtn.style.display = "none";

 const overlay = document.getElementById("schemaPinsOverlay");
 if (overlay) {
 const existingTemp = document.querySelector(".schema-temp-click-pin");
 if (existingTemp) existingTemp.remove();

 const tempDiv = document.createElement("div");
 tempDiv.className = "schema-temp-click-pin";
 tempDiv.style.cssText = `position:absolute; left:${xPct}%; top:${yPct}%; width:26px; height:26px; margin-left:-13px; margin-top:-13px; background:#000000; color:#ffffff; border:2px dashed #ffffff; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:12px; pointer-events:none; z-index:30; animation:pulseTemp 1s infinite alternate;`;
 tempDiv.textContent = "+";
 overlay.appendChild(tempDiv);
 }

 const itemInput = document.getElementById("schemaPinItem");
 if (itemInput) itemInput.focus();
}

function saveSchemaPin() {
 const rId = Number(gState.schemaResidentId || gState.selectedResidentId);
 const editId = Number(document.getElementById("schemaEditPinId")?.value || 0);
 const xPct = parseFloat(document.getElementById("schemaEditPinXPct")?.value || 0);
 const yPct = parseFloat(document.getElementById("schemaEditPinYPct")?.value || 0);
 const site = document.getElementById("schemaPinSite")?.value.trim() || "";
 const category = document.getElementById("schemaPinCategory")?.value || "軟膏塗布";
 const item = document.getElementById("schemaPinItem")?.value.trim() || "";
 const frequency = document.getElementById("schemaPinFrequency")?.value.trim() || "入浴後";
 const status = document.getElementById("schemaPinStatus")?.value || "継続中";
 const notes = document.getElementById("schemaPinNotes")?.value.trim() || "";

 if (!site) {
 alert("部位名を入力または選択してください (例: 背部, 仙骨部, 右膝等)。");
 document.getElementById("schemaPinSite")?.focus();
 return;
 }
 if (!item) {
 alert("処置内容・薬剤名を入力または選択してください (例: ヒルドイドソフト, プロペト等)。");
 document.getElementById("schemaPinItem")?.focus();
 return;
 }
 if (xPct === 0 && yPct === 0 && !editId) {
 alert("左の人体図（シェーマ図）をクリックしてピンの位置を指定してください。");
 return;
 }

 if (!db.data.body_schema_pins) db.data.body_schema_pins = [];
 const staffName = document.getElementById("currentStaff")?.value || "職員";
 const now = new Date();
 const nowStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

 if (editId > 0) {
 const pin = db.data.body_schema_pins.find(p => Number(p.id) === editId);
 if (pin) {
 const cpOld = Object.assign({}, pin); // [Claude修正] 変更前の内容を履歴に残す
 pin.site_name = site;
 pin.category = category;
 pin.item_name = item;
 pin.frequency = frequency;
 pin.status = status;
 pin.notes = notes;
 pin.updated_at = nowStr;
 pin.staff_name = staffName;
 if (xPct > 0 && yPct > 0) {
 pin.x_pct = xPct;
 pin.y_pct = yPct;
 }
 cpAppendEditHistory(pin, cpOld, ["site_name", "category", "item_name", "frequency", "status", "notes", "x_pct", "y_pct"]);
 }
 } else {
 const newId = db.data.body_schema_pins.length > 0
 ? Math.max(...db.data.body_schema_pins.map(p => Number(p.id) || 0)) + 1
 : 1;

 const resPins = db.data.body_schema_pins.filter(p => !p.voided && Number(p.resident_id) === rId);
 const pinNo = resPins.length + 1;

 db.data.body_schema_pins.push({
 id: newId,
 resident_id: rId,
 pin_no: pinNo,
 category: category,
 site_name: site,
 item_name: item,
 frequency: frequency,
 status: status,
 notes: notes,
 doctor_name: "担当医",
 x_pct: xPct,
 y_pct: yPct,
 created_at: nowStr,
 updated_at: nowStr,
 staff_name: staffName
 });
 }

 gState.body_schema_pins = db.data.body_schema_pins;
 if (typeof db.save === 'function') db.save();

 resetSchemaPinForm();
 renderBodySchemaPins();
 if (typeof renderResidentDetail === 'function') renderResidentDetail();

 const toastMsg = editId > 0 ? "処置ピンの内容を訂正・更新しました。" : "新しい処置ピンを登録しました。";
 if (typeof showToast === 'function') {
 showToast(toastMsg);
 } else {
 alert(toastMsg);
 }
}

function editSchemaPin(pinId) {
 const pin = (db.data.body_schema_pins || []).find(p => Number(p.id) === Number(pinId));
 if (!pin) return;

 const idInput = document.getElementById("schemaEditPinId");
 if (idInput) idInput.value = pin.id;

 const xInput = document.getElementById("schemaEditPinXPct");
 if (xInput) xInput.value = pin.x_pct;

 const yInput = document.getElementById("schemaEditPinYPct");
 if (yInput) yInput.value = pin.y_pct;

 const siteInput = document.getElementById("schemaPinSite");
 if (siteInput) siteInput.value = pin.site_name || "";

 const catSelect = document.getElementById("schemaPinCategory");
 if (catSelect) catSelect.value = pin.category || "軟膏塗布";

 const itemInput = document.getElementById("schemaPinItem");
 if (itemInput) itemInput.value = pin.item_name || "";

 const freqInput = document.getElementById("schemaPinFrequency");
 if (freqInput) freqInput.value = pin.frequency || "入浴後";

 const statusSelect = document.getElementById("schemaPinStatus");
 if (statusSelect) statusSelect.value = pin.status || "継続中";

 const notesInput = document.getElementById("schemaPinNotes");
 if (notesInput) notesInput.value = pin.notes || "";

 const titleEl = document.getElementById("schemaPinEditTitle");
 if (titleEl) titleEl.textContent = `ピン訂正・編集 (No. ${pin.pin_no}: ${pin.site_name})`;

 const coordsBadge = document.getElementById("schemaPinCoordsBadge");
 if (coordsBadge) {
 const isFront = pin.x_pct < 50;
 coordsBadge.textContent = `位置: ${isFront ? "正面図" : "背面図"} (${pin.x_pct}%, ${pin.y_pct}%) - ピンを動かす場合は、図の正しい位置をクリックしてから保存してください`;
 }

 const delBtn = document.getElementById("btnDeleteSchemaPin");
 if (delBtn) delBtn.style.display = "inline-block";

 const tempPin = document.querySelector(".schema-temp-click-pin");
 if (tempPin) tempPin.remove();

 renderBodySchemaPins();
}

function deleteSchemaPin() {
 const editId = Number(document.getElementById("schemaEditPinId")?.value || 0);
 if (!editId) return;
 deleteSchemaPinById(editId);
}

function deleteSchemaPinById(pinId) {
 const pin = (db.data.body_schema_pins || []).find(p => Number(p.id) === Number(pinId));
 if (!pin) return;

 // [Claude修正] ピン（処置の指示）は消さずに「取消」として残す（理由必須）。処置が終わった場合は状態を「治癒・終了」にする
 if (!cpVoidRecord(pin, "", `No. ${pin.pin_no}「${pin.site_name}: ${pin.item_name}」のピンを取消にします。\n記録は消えずに残ります。\n（処置が終わった場合は、取消ではなく状態を「治癒・終了」に変更してください）\n\n取消の理由を入力してください (例: 位置の間違い、重複登録)`)) return;

 const rId = pin.resident_id;
 const resPins = db.data.body_schema_pins.filter(p => !p.voided && Number(p.resident_id) === Number(rId));
 resPins.sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));
 resPins.forEach((p, idx) => { p.pin_no = idx + 1; });

 gState.body_schema_pins = db.data.body_schema_pins;
 if (typeof db.save === 'function') db.save();

 resetSchemaPinForm();
 renderBodySchemaPins();
 if (typeof renderResidentDetail === 'function') renderResidentDetail();

 if (typeof showToast === 'function') {
 showToast("ピンを削除しました。");
 } else {
 alert("ピンを削除しました。");
 }
}

function resetSchemaPinForm() {
 const idInput = document.getElementById("schemaEditPinId");
 if (idInput) idInput.value = "";

 const xInput = document.getElementById("schemaEditPinXPct");
 if (xInput) xInput.value = "";

 const yInput = document.getElementById("schemaEditPinYPct");
 if (yInput) yInput.value = "";

 const siteInput = document.getElementById("schemaPinSite");
 if (siteInput) siteInput.value = "";

 const catSelect = document.getElementById("schemaPinCategory");
 if (catSelect) catSelect.value = "軟膏塗布";

 const itemInput = document.getElementById("schemaPinItem");
 if (itemInput) itemInput.value = "";

 const freqInput = document.getElementById("schemaPinFrequency");
 if (freqInput) freqInput.value = "入浴後";

 const statusSelect = document.getElementById("schemaPinStatus");
 if (statusSelect) statusSelect.value = "継続中";

 const notesInput = document.getElementById("schemaPinNotes");
 if (notesInput) notesInput.value = "";

 const titleEl = document.getElementById("schemaPinEditTitle");
 if (titleEl) titleEl.textContent = "新規ピン登録 (図をクリックして位置を指定)";

 const coordsBadge = document.getElementById("schemaPinCoordsBadge");
 if (coordsBadge) coordsBadge.textContent = "";

 const delBtn = document.getElementById("btnDeleteSchemaPin");
 if (delBtn) delBtn.style.display = "none";

 const tempPin = document.querySelector(".schema-temp-click-pin");
 if (tempPin) tempPin.remove();

 // [Claude修正] 訂正を取りやめた場合に、保存していない移動先の表示を元の位置に戻す
 if (typeof renderBodySchemaPins === "function") renderBodySchemaPins();
}

function setSchemaSite(site) {
 const input = document.getElementById("schemaPinSite");
 if (input) {
 input.value = site;
 input.focus();
 }
}

function setSchemaItem(item, cat) {
 const input = document.getElementById("schemaPinItem");
 if (input) {
 input.value = item;
 input.focus();
 }
 if (cat) {
 const catSelect = document.getElementById("schemaPinCategory");
 if (catSelect) catSelect.value = cat;
 }
}

function setSchemaFrequency(freq) {
 const input = document.getElementById("schemaPinFrequency");
 if (input) {
 input.value = freq;
 input.focus();
 }
}

function printBodySchema() {
 const rId = Number(gState.schemaResidentId || gState.selectedResidentId);
 const r = (gState.residents || []).find(x => Number(x.id) === rId);
 const printArea = document.getElementById("printArea");
 if (!printArea) {
 alert("印刷コンテナが見つかりません。");
 return;
 }

 const facility = getFacilityName();
 const now = new Date();
 const printDateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
 const staffName = document.getElementById("currentStaff")?.value || "担当職員";

 const allPins = ((db && db.data && db.data.body_schema_pins) ? db.data.body_schema_pins : []).filter(p => !p.voided); // [Claude修正] 取消済みは表示しない
 const pins = allPins.filter(p => Number(p.resident_id) === rId);
 pins.sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));
 pins.forEach((p, idx) => { p.pin_no = idx + 1; });

 let ageText = "-";
 if (r && r.birth_date) {
 const bYear = parseInt(r.birth_date.split("-")[0], 10);
 if (!isNaN(bYear)) ageText = `${2026 - bYear}歳`;
 }

 let pinsOverlayHtml = "";
 pins.forEach(p => {
 pinsOverlayHtml += `
 <div style="position:absolute; left:${p.x_pct}%; top:${p.y_pct}%; width:20px; height:20px; margin-left:-10px; margin-top:-10px; border-radius:50%; background:#000000 !important; color:#ffffff !important; border:2px solid #000000 !important; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:11px; -webkit-print-color-adjust:exact; print-color-adjust:exact;">
 ${p.pin_no}
 </div>
 `;
 });

 let tableRowsHtml = "";
 if (pins.length === 0) {
 tableRowsHtml = `
 <tr>
 <td colspan="6" style="padding:10px; text-align:center; border:1px solid #000; font-size:11px;">
 現在登録されている皮膚処置・外用薬ピンはありません。
 </td>
 </tr>
 `;
 } else {
 pins.forEach(p => {
 tableRowsHtml += `
 <tr style="border-bottom:1px solid #000;">
 <td style="padding:5px 6px; text-align:center; border:1px solid #000; font-weight:bold; font-size:12px;">
 ${p.pin_no}
 </td>
 <td style="padding:5px 6px; border:1px solid #000; font-weight:bold; font-size:11px;">
 ${escapeHtml(p.site_name || '-')}
 <div style="font-size:9.5px; font-weight:normal;">(${escapeHtml(p.category || '-')})</div>
 </td>
 <td style="padding:5px 6px; border:1px solid #000; font-size:11px;">
 <strong>${escapeHtml(p.item_name || '-')}</strong>
 </td>
 <td style="padding:5px 6px; border:1px solid #000; font-size:10.5px; text-align:center;">
 ${escapeHtml(p.frequency || '-')}
 </td>
 <td style="padding:5px 6px; border:1px solid #000; font-size:10.5px;">
 ${escapeHtml(p.notes || '-')}
 </td>
 <td style="padding:5px 6px; border:1px solid #000; font-size:10.5px; text-align:center;">
 ${escapeHtml(p.status || '継続中')}
 </td>
 </tr>
 `;
 });
 }

 printArea.innerHTML = `
 <div style="font-family:'Hiragino Kaku Gothic ProN', 'Meiryo', sans-serif; color:#000; padding:4px; max-width:820px; margin:0 auto; font-size:11px; line-height:1.35;">
 <div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid #000; padding-bottom:6px; margin-bottom:8px;">
 <div>
 <div style="font-size:10px; font-weight:bold; letter-spacing:1px;">介護施設・医療機関連携 共通記録シート</div>
 <h1 style="font-size:19px; margin:2px 0 0 0; font-weight:bold; letter-spacing:0.5px;">【皮膚処置・身体シェーマ指示書】 (皮膚科・往診連携用)</h1>
 </div>
 <div style="text-align:right; font-size:10px; line-height:1.4;">
 <div>施設名: <strong>${escapeHtml(facility)}</strong></div>
 <div>発行日: ${printDateStr}</div>
 <div>記録者: ${escapeHtml(staffName)}</div>
 </div>
 </div>

 <table style="width:100%; border-collapse:collapse; margin-bottom:8px; border:1px solid #000; font-size:11px;">
 <tr style="background:#eef2ef; -webkit-print-color-adjust:exact;">
 <th style="padding:4px 6px; border:1px solid #000; width:12%; text-align:left;">利用者氏名</th>
 <td style="padding:4px 6px; border:1px solid #000; width:28%; font-size:13px; font-weight:bold;">${r ? escapeHtml(r.name) : '-'} 様</td>
 <th style="padding:4px 6px; border:1px solid #000; width:10%; text-align:left;">居室 / 介護度</th>
 <td style="padding:4px 6px; border:1px solid #000; width:20%;">${r ? escapeHtml(r.room_no) : '-'}号室 / ${r ? escapeHtml(r.care_level) : '-'}</td>
 <th style="padding:4px 6px; border:1px solid #000; width:10%; text-align:left;">年齢 / 生年月日</th>
 <td style="padding:4px 6px; border:1px solid #000; width:20%;">${ageText} (${r ? escapeHtml(r.birth_date || '-') : '-'})</td>
 </tr>
 <tr>
 <th style="padding:4px 6px; border:1px solid #000; text-align:left;">病名・既往歴</th>
 <td style="padding:4px 6px; border:1px solid #000;">${r ? escapeHtml(r.diseases || '-') : '-'}</td>
 <th style="padding:4px 6px; border:1px solid #000; text-align:left;">アレルギー</th>
 <td style="padding:4px 6px; border:1px solid #000; font-weight:bold;">${r && r.allergies ? escapeHtml(r.allergies) : '特になし'}</td>
 <th style="padding:4px 6px; border:1px solid #000; text-align:left;">身体状況</th>
 <td style="padding:4px 6px; border:1px solid #000;">${r ? escapeHtml(r.paralysis || '-') : '-'}</td>
 </tr>
 </table>

 <div style="border:1px solid #000; padding:6px; margin-bottom:8px; text-align:center; background:#ffffff;">
 <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:10px; margin-bottom:4px; padding:0 30px;">
 <span>【正面図】 (前面・左右)</span>
 <span>【背面図】 (背面・左右)</span>
 </div>
 <div style="position:relative; display:inline-block; max-width:440px; width:100%;">
 <img src="assets/body_schema.jpg" alt="人体シェーマ図" style="width:100%; height:auto; display:block; border:1px solid #ccc;">
 ${pinsOverlayHtml}
 </div>
 <div style="font-size:9.5px; color:#333; margin-top:2px;">
 ※図上の黒丸番号 (1, 2, 3...) は、下記の処置一覧テーブルの番号と対応しています。
 </div>
 </div>

 <div style="margin-bottom:8px;">
 <div style="font-weight:bold; font-size:11px; margin-bottom:3px; display:flex; justify-content:space-between;">
 <span>■ 登録中の皮膚処置・外用薬・貼付剤 一覧</span>
 <span style="font-size:10px;">(計 ${pins.length} 件)</span>
 </div>
 <table style="width:100%; border-collapse:collapse; border:1px solid #000; font-size:10.5px;">
 <thead>
 <tr style="background:#dfe5e1; font-weight:bold; -webkit-print-color-adjust:exact;">
 <th style="padding:4px 5px; border:1px solid #000; width:35px; text-align:center;">No.</th>
 <th style="padding:4px 5px; border:1px solid #000; width:110px;">部位 (区分)</th>
 <th style="padding:4px 5px; border:1px solid #000; width:160px;">処置内容・薬剤名</th>
 <th style="padding:4px 5px; border:1px solid #000; width:80px; text-align:center;">頻度・タイミング</th>
 <th style="padding:4px 5px; border:1px solid #000;">症状・目的・特記事項</th>
 <th style="padding:4px 5px; border:1px solid #000; width:55px; text-align:center;">状態</th>
 </tr>
 </thead>
 <tbody>
 ${tableRowsHtml}
 </tbody>
 </table>
 </div>

 <div style="display:grid; grid-template-columns: 2fr 1fr; gap:8px; margin-top:6px;">
 <div style="border:1.5px solid #000; padding:6px; min-height:85px; position:relative;">
 <div style="font-weight:bold; font-size:10.5px; border-bottom:1px solid #000; padding-bottom:2px; margin-bottom:4px;">
 【皮膚科・往診医 指示・処方変更 記入欄】 (医師記入)
 </div>
 <div style="font-size:9.5px; color:#555; line-height:2.2;">
 ・処置・軟膏の変更 / 中止指示:<br>
 ・次回受診・再評価の目安:<br>
 ・特記事項:
 </div>
 <div style="position:absolute; bottom:4px; right:8px; font-size:10px;">
 医師署名: ____________________ 印
 </div>
 </div>

 <div style="border:1.5px solid #000; padding:6px; min-height:85px; display:flex; flex-direction:column; justify-content:space-between;">
 <div style="font-weight:bold; font-size:10.5px; border-bottom:1px solid #000; padding-bottom:2px;">
 【施設看護・介護 確認欄】
 </div>
 <div style="font-size:9.5px; line-height:1.6; margin-top:2px;">
 指示受託者: _______________<br>
 記録反映確認: _______________<br>
 受託日時: _____/_____ (_____)
 </div>
 <div style="text-align:right; font-size:9px; color:#666;">
 ※受診後カルテへ即日反映
 </div>
 </div>
 </div>
 </div>
 `;

 runPrintJob(printArea.innerHTML, { page: "A4 portrait", fitOnePage: true });
}

// 介護記録の追加
function submitCareRecord() {
 const content = document.getElementById("recordContent").value.trim();
 if (!content) {
 alert("記録内容を入力してください。");
 return;
 }
 const customTime = document.getElementById("recordCustomTime").value;
 const staff = document.getElementById("currentStaff").value;
 const category = document.getElementById("recordCategory").value;
 const now = new Date();
 const tm = now.toTimeString().slice(0, 5);
 const recordedAt = customTime ? customTime.replace("T", " ") : `${gState.selectedDate} ${tm}`;

 const newRec = {
 id: Date.now(),
 recorded_at: recordedAt,
 resident_id: gState.selectedResidentId,
 category: category,
 content: content,
 staff_name: staff
 };

 db.data.care_records.unshift(newRec);

 // 特変または連絡の場合は、申し送り（連絡帳）へも自動追加
 if (category === "特変" || category === "連絡") {
 if (!Array.isArray(db.data.notebooks)) db.data.notebooks = [];
 const res = gState.residents.find(x => x.id === gState.selectedResidentId);
 const resName = res ? `${res.room_no}号室 ${res.name} 様` : "";
 db.data.notebooks.unshift({
 id: Date.now() + 1,
 date: gState.selectedDate,
 resident_id: gState.selectedResidentId,
 content: `［${category}］(${resName}) ${content}`,
 staff_name: staff,
 status: "未対応"
 });
 }

 db.save();

 document.getElementById("recordContent").value = "";
 document.getElementById("recordCustomTime").value = "";
 const fsArea = document.getElementById("fsRecordContent");
 if (fsArea) fsArea.value = "";
 updateRecordCharCount();

 loadDateRecords(gState.selectedDate);
 renderCalendar();
 alert("介護記録を保存しました！");
}

// 記録区分（介護・特変・連絡・看護・リハビリ・家族・巡視等）のワンタップ選択
function selectRecordCategory(cat) {
 const sel = document.getElementById("recordCategory");
 if (sel) {
 sel.value = cat;
 }
 syncCategoryButtons();

 // 特変・連絡選択時、本文が空なら即座に雛形をサジェスト＆フォーカス
 const contentArea = cpRecordArea();
 if (contentArea) {
 if (!contentArea.value.trim()) {
 if (cat === "特変") {
 const tm = new Date().toTimeString().slice(0, 5);
 contentArea.value = `【特変】${tm}頃、`;
 } else if (cat === "連絡") {
 contentArea.value = `【連絡】`;
 } else if (cat === "看護") {
 contentArea.value = `【看護処置】`;
 } else if (cat === "リハビリ") {
 contentArea.value = `【リハビリ】`;
 }
 }
 contentArea.focus();
 updateRecordCharCount();
 }
}

// 区分セレクターボタングループのアクティブ表示同期
function syncCategoryButtons() {
 const sel = document.getElementById("recordCategory");
 if (!sel) return;
 const currentCat = sel.value;

 const btnContainer = document.getElementById("categoryQuickButtons");
 if (!btnContainer) return;
 const buttons = btnContainer.querySelectorAll("button[data-cat]");

 const activeStyles = {
 "介護": { bg: "#1e5b47", fg: "#ffffff", border: "#c9e0d5" },
 "特変": { bg: "#dc2626", fg: "#ffffff", border: "#fca5a5" },
 "連絡": { bg: "#ca8a04", fg: "#ffffff", border: "#fde047" },
 "看護": { bg: "#16a34a", fg: "#ffffff", border: "#bbf7d0" },
 "リハビリ": { bg: "#7c3aed", fg: "#ffffff", border: "#ddd6fe" },
 "家族": { bg: "#ea580c", fg: "#ffffff", border: "#fed7aa" },
 "巡視": { bg: "#4a5852", fg: "#ffffff", border: "#cdd6d0" }
 };

 buttons.forEach(btn => {
 const bCat = btn.getAttribute("data-cat");
 if (bCat === currentCat) {
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

// 長文記録の展開・折りたたみ状態管理
const gExpandedRecordIds = new Set();
function toggleRecordExpand(recId) {
 if (gExpandedRecordIds.has(recId)) {
 gExpandedRecordIds.delete(recId);
 } else {
 gExpandedRecordIds.add(recId);
 }
 renderSelectedDateRecords();
}

// 記録表示範囲の切り替え（指定日のみ ⇄ 全過去履歴）
function toggleRecordScope() {
 gState.recordScope = (gState.recordScope === "all") ? "today" : "all";
 const btn = document.getElementById("btnToggleRecordScope");
 if (btn) {
 if (gState.recordScope === "all") {
 btn.textContent = " 指定日の記録のみ表示";
 btn.style.background = "#f1f6f3";
 btn.style.color = "#1a4f3d";
 btn.style.border = "1px solid #a9cfbf";
 } else {
 btn.textContent = " すべての過去履歴を表示";
 btn.style.background = "#f0fdf4";
 btn.style.color = "#166534";
 btn.style.border = "1px solid #bbf7d0";
 }
 }
 renderSelectedDateRecords();
}

// 年月アコーディオン開閉状態 Set & 選択中月フィルター
const gOpenMonthAccordions = new Set();
let gSelectedHistoryMonth = "all";

// [Claude修正 2026-10-16] 開くのは一度に1か月だけ（別の月を開くと前の月は閉じる）。
// 以前は「開いている月がなくなったら一番新しい月を開く」処理が閉じた直後にも働き、一番新しい月が閉じられなかった
let gMonthAccordionInited = false;
function toggleMonthAccordion(ym) {
 const wasOpen = gOpenMonthAccordions.has(ym);
 gOpenMonthAccordions.clear();
 if (!wasOpen) gOpenMonthAccordions.add(ym);
 gMonthAccordionInited = true;
 renderSelectedDateRecords();
}

function filterHistoryMonth(ym) {
 gSelectedHistoryMonth = ym;
 if (ym !== "all") {
 gOpenMonthAccordions.clear(); // [Claude修正 2026-10-16] 1か月だけ開く
 gOpenMonthAccordions.add(ym);
 gMonthAccordionInited = true;
 }
 renderSelectedDateRecords();
}

// ======================================================================
// 個人カルテ専用 月間カレンダー & 統合デイリーサマリー & 連動編集
// ======================================================================

function getWeekDayJp(dateStr) {
 if (!dateStr) return "";
 const days = ["日", "月", "火", "水", "木", "金", "土"];
 const d = new Date(dateStr + "T00:00:00");
 return isNaN(d.getDay()) ? "" : days[d.getDay()];
}

function renderPersonalCalendar() {
 const container = document.getElementById("personalCalendarContainer");
 if (!container) return;

 const res = gState.residents.find(x => x.id === gState.selectedResidentId);
 if (!res) {
 container.innerHTML = "";
 return;
 }

 // 表示対象年月 (未設定なら選択中日付の年月、それもなければ今日)
 const currentYm = gState.personalCalendarYearMonth || (gState.selectedDate ? gState.selectedDate.slice(0, 7) : getTodayStr().slice(0, 7));
 const [yearStr, monthStr] = currentYm.split("-");
 const year = parseInt(yearStr, 10);
 const month = parseInt(monthStr, 10); // 1-12

 // 当月の初日・末日・日数
 const firstDay = new Date(year, month - 1, 1);
 const startDayOfWeek = firstDay.getDay(); // 0(日) - 6(土)
 const daysInMonth = new Date(year, month, 0).getDate();

 // カレンダーヘッダー
 let html = `
 <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:8px;">
 <div style="display:flex; align-items:center; gap:6px;">
 <span style="font-size:13px; font-weight:bold; color:#173f33;"> 【${escapeHtml(res.name)} 様】の個人記録カレンダー:</span>
 <button type="button" class="btn btn-secondary" style="padding:2px 8px; font-size:11px;" onclick="changePersonalCalendarMonth(-1)">◀ 前月</button>
 <strong style="font-size:14px; color:#1c2622; min-width:90px; text-align:center;">${year}年 ${month}月</strong>
 <button type="button" class="btn btn-secondary" style="padding:2px 8px; font-size:11px;" onclick="changePersonalCalendarMonth(1)">次月 ▶</button>
 <button type="button" class="btn btn-secondary" style="padding:2px 8px; font-size:11px; margin-left:4px; background:#f1f6f3; color:#1a4f3d; border-color:#c9e0d5;" onclick="jumpPersonalCalendarToday()">今日</button>
 </div>
 <div style="display:flex; gap:10px; align-items:center; font-size:11px; color:#5f6d66;">
 <span><span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#1e5b47; margin-right:3px;"></span>バイタル</span>
 <span><span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#16a34a; margin-right:3px;"></span>経過記録</span>
 <span><span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#dc2626; margin-right:3px;"></span>特変</span>
 <span><span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#d97706; margin-right:3px;"></span>入院中</span>
 </div>
 </div>
 `;

 // カレンダーテーブル
 html += `
 <div style="overflow-x:auto;">
 <table style="width:100%; border-collapse:collapse; text-align:center; font-size:12px; background:#fff; border-radius:6px; overflow:hidden; border:1px solid #dfe5e1;">
 <thead>
 <tr style="background:#eef2ef; color:#4a5852; font-weight:bold; height:26px;">
 <th style="color:#dc2626; width:14.28%;">日</th>
 <th style="width:14.28%;">月</th>
 <th style="width:14.28%;">火</th>
 <th style="width:14.28%;">水</th>
 <th style="width:14.28%;">木</th>
 <th style="width:14.28%;">金</th>
 <th style="color:#1e5b47; width:14.28%;">土</th>
 </tr>
 </thead>
 <tbody>
 `;

 let dayCounter = 1;
 const totalRows = Math.ceil((startDayOfWeek + daysInMonth) / 7);

 for (let r = 0; r < totalRows; r++) {
 html += `<tr style="height:46px;">`;
 for (let c = 0; c < 7; c++) {
 const cellIndex = r * 7 + c;
 if (cellIndex < startDayOfWeek || dayCounter > daysInMonth) {
 html += `<td style="background:#f6f8f6; border:1px solid #eef2ef;"></td>`;
 } else {
 const curDay = dayCounter;
 const curDateStr = `${year}-${String(month).padStart(2, "0")}-${String(curDay).padStart(2, "0")}`;
 const isSelected = curDateStr === gState.selectedDate;

 // 記録判定
 const hasVital = (db.data.vitals || []).some(v => v.resident_id === res.id && v.date === curDateStr);
 const dayRecs = (db.data.care_records || []).filter(cr => !cr.voided && cr.resident_id === res.id && (cr.recorded_at || cr.record_time || "").startsWith(curDateStr));
 const recCount = dayRecs.length;
 const hasTokukan = dayRecs.some(cr => cr.category === "特変");
 // [Antigravity実装 2026-10-19] 過去の入院期間もカレンダー上で入院中として判定
 const isHospitalized = (typeof cpStatusOn === "function" ? cpStatusOn(res, curDateStr) === "入院中" : (res.status === "入院中" && (!res.hospital_date || curDateStr >= res.hospital_date)));

 let cellBg = isSelected ? "#dcebe3" : "#ffffff";
 let cellBorder = isSelected ? "2px solid #1e5b47" : "1px solid #dfe5e1";
 if (isHospitalized && !isSelected) cellBg = "#fffbeb";

 let dotsHtml = "";
 if (isHospitalized) {
 dotsHtml = `<span style="font-size:9.5px; background:#fef3c7; color:#92400e; padding:1px 3px; border-radius:3px; font-weight:bold;">入院中</span>`;
 } else {
 if (hasVital) dotsHtml += `<span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#1e5b47; margin:0 1px;" title="バイタル記録あり"></span>`;
 if (recCount > 0) dotsHtml += `<span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#16a34a; margin:0 1px;" title="介護記録 ${recCount}件"></span>`;
 if (hasTokukan) dotsHtml += `<span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#dc2626; margin:0 1px;" title="特変あり"></span>`;
 }

 let textColor = c === 0 ? "#dc2626" : (c === 6 ? "#1e5b47" : "#22302b");
 if (isSelected) textColor = "#1e5b47";

 html += `
 <td onclick="selectPersonalCalendarDate('${curDateStr}')" style="background:${cellBg}; border:${cellBorder}; cursor:pointer; vertical-align:top; padding:4px 2px; transition:background 0.15s;" onmouseover="if(!${isSelected})this.style.background='#eef2ef';" onmouseout="if(!${isSelected})this.style.background='${cellBg}';">
 <div style="font-size:12.5px; font-weight:${isSelected ? 'bold' : 'normal'}; color:${textColor};">${curDay}</div>
 <div style="margin-top:2px; min-height:12px; display:flex; justify-content:center; align-items:center; gap:2px;">
 ${dotsHtml}
 </div>
 </td>
 `;
 dayCounter++;
 }
 }
 html += `</tr>`;
 }

 html += `
 </tbody>
 </table>
 </div>
 `;

 container.innerHTML = html;
}

function changePersonalCalendarMonth(delta) {
 const currentYm = gState.personalCalendarYearMonth || (gState.selectedDate ? gState.selectedDate.slice(0, 7) : getTodayStr().slice(0, 7));
 const [yearStr, monthStr] = currentYm.split("-");
 let year = parseInt(yearStr, 10);
 let month = parseInt(monthStr, 10) + delta;

 if (month < 1) {
 month = 12;
 year -= 1;
 } else if (month > 12) {
 month = 1;
 year += 1;
 }

 gState.personalCalendarYearMonth = `${year}-${String(month).padStart(2, "0")}`;
 renderPersonalCalendar();
}

function jumpPersonalCalendarToday() {
 const today = getTodayStr();
 gState.personalCalendarYearMonth = today.slice(0, 7);
 selectPersonalCalendarDate(today);
}

function selectPersonalCalendarDate(dateStr) {
 gState.selectedDate = dateStr;
	updateRecordFormCustomTime();
 // [Antigravity実装 2026-10-16] recordScopeの値を "today" に統一し、ボタン表示も同期
 gState.recordScope = "today";
 const scopeBtn = document.getElementById("btnToggleRecordScope");
 if (scopeBtn) {
  scopeBtn.textContent = " すべての過去履歴を表示";
  scopeBtn.style.background = "#f0fdf4";
  scopeBtn.style.color = "#166534";
  scopeBtn.style.border = "1px solid #bbf7d0";
 }
 gState.personalCalendarYearMonth = dateStr.slice(0, 7);

 renderCalendar(); // 全体上部カレンダー同期
 renderSelectedDateRecords(); // 個人記録再描画
 if (typeof renderSingleWriteScreen === "function" && gState.activeCareTab === "write_single") renderSingleWriteScreen();
 if (gState.activeCareTab === "daily_journal") renderDailyJournal();
 if (gState.activeCareTab === "vitals") renderVitalsTable();
 if (gState.activeCareTab === "meal") renderMealsTable();
 if (gState.activeCareTab === "excretion") renderExcretionTable();
 if (gState.activeCareTab === "bath") renderBathTable();
}

// 当日の個人データ集約サマリーカード（血圧、体温、脈拍、SpO2、体重、食事、排泄、入浴、服薬）
function renderPersonalDailySummary(res, dateStr) {
 const area = document.getElementById("personalDailySummaryArea");
 if (!area) return;

 if (!res) {
 area.innerHTML = "";
 return;
 }

 // [Antigravity実装 2026-10-19] 過去の入院期間もその日の入院情報で表示
 const hospInfo = typeof cpHospitalizationOn === "function" ? cpHospitalizationOn(res, dateStr) : null;
 const isHospitalized = hospInfo !== null || (typeof cpStatusOn === "function" ? cpStatusOn(res, dateStr) === "入院中" : (res.status === "入院中" && (!res.hospital_date || dateStr >= res.hospital_date)));

 if (isHospitalized) {
 const hName = (hospInfo && hospInfo.hospital_name) || res.hospital_name || "入院先未登録";
 const hReason = (hospInfo && hospInfo.reason) || res.hospital_reason || "未登録";
 const hFrom = (hospInfo && hospInfo.admission_date) || res.hospital_date || "未登録";
 const hTo = (hospInfo && hospInfo.discharge_date) ? ` 〜 退院: ${escapeHtml(hospInfo.discharge_date)}` : "";
 area.innerHTML = `
 <div style="background:#fef3c7; border:2px solid #f59e0b; border-radius:8px; padding:12px 16px; margin-bottom:12px;">
 <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
 <div style="display:flex; align-items:center; gap:8px;">
 <span style="font-size:22px;"></span>
 <div>
 <strong style="font-size:14.5px; color:#92400e;">【入院加療中】 ${escapeHtml(hName)}</strong>
 <div style="font-size:12px; color:#b45309; margin-top:2px;">
 理由: <strong>${escapeHtml(hReason)}</strong> (入院開始: ${escapeHtml(hFrom)}${hTo})
 </div>
 </div>
 </div>
 <span style="font-size:12px; background:#fff; border:1px solid #d97706; color:#b45309; padding:4px 12px; border-radius:12px; font-weight:bold;">${hospInfo && hospInfo.discharge_date ? '入院期間（退院済）' : '施設外 入院継続'}</span>
 </div>
 <div style="font-size:12px; color:#78350f; margin-top:8px; line-height:1.5; background:rgba(255,255,255,0.7); padding:8px 12px; border-radius:6px;">
 ※病院にて加療中のため施設内での直接ケアは休止中です。病院連携・病状確認・リハビリ進捗・家族面談・退院受入調整は下記の個別カルテ記録に集約されています。
 </div>
 </div>
 `;
 return;
 }

 // 1. バイタル検索
 // [Claude修正 2026-10-16] 再測定があればいちばん新しい値を出し、測定回数も出す
 const vital = cpLatestVital(res.id, dateStr);
 const vitalCount = cpDayVitals(res.id, dateStr).length;

 // 2. 最新・当月の体重検索
 const weightRecords = (db.data.weight_records || []).filter(w => w.resident_id === res.id).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
 const exactWeight = weightRecords.find(w => w.date === dateStr);
 const latestWeight = exactWeight || weightRecords[0] || null;

 // 3. 食事検索
 // [Claude修正 2026-10-16] 取消・訂正で外した記録（voided）は数えない。おやつ・その他は1日に何件でもあるので全部出す
 const dayMeals = (db.data.meals || []).filter(m => !m.voided && m.resident_id === res.id && m.date === dateStr);
 const snacks = dayMeals.filter(m => m.meal_type === "おやつ");
 const others = dayMeals.filter(m => m.meal_type === "その他");
 const breakfast = dayMeals.find(m => m.meal_type === "朝食");
 const lunch = dayMeals.find(m => m.meal_type === "昼食");
 const dinner = dayMeals.find(m => m.meal_type === "夕食");
 const totalWater = dayMeals.reduce((sum, m) => sum + (m.water_ml || 0), 0);

 // 4. 排泄検索
 const dayExcretions = (db.data.excretions || []).filter(e => !e.voided && e.resident_id === res.id && e.date === dateStr);
 const urineCount = dayExcretions.filter(e => e.urine_flag).length;
 const stoolCount = dayExcretions.filter(e => e.stool_condition && e.stool_condition !== "なし").length;
 const stoolSample = dayExcretions.find(e => e.stool_condition && e.stool_condition !== "なし");

 // 5. 入浴検索
 const bath = (db.data.baths || []).find(b => !b.voided && b.resident_id === res.id && b.date === dateStr);

 // 6. 服薬・口腔ケア検索
 const dayMeds = (db.data.meds || []).filter(m => !m.voided && m.resident_id === res.id && m.date === dateStr);
 const dayOrals = (db.data.oral_cares || []).filter(o => !o.voided && o.resident_id === res.id && o.date === dateStr);

 // 血圧のハイライトスタイル
 let bpHtml = `<span style="color:#94a19a; font-size:12px;">未測定</span>`;
 if (vital && vital.bp_high !== null && vital.bp_low !== null) {
 const isHigh = vital.bp_high >= 145 || vital.bp_low >= 90;
 const bpColor = isHigh ? "#dc2626" : "#22302b";
 bpHtml = `<strong style="font-size:15px; color:${bpColor};">${vital.bp_high} / ${vital.bp_low}</strong> <span style="font-size:11px; color:#5f6d66;">mmHg</span>`;
 }

 // 体温のハイライトスタイル
 let tempHtml = `<span style="color:#94a19a; font-size:12px;">未測定</span>`;
 if (vital && vital.temperature !== null) {
 const isFever = vital.temperature >= 37.3;
 const tempColor = isFever ? "#dc2626" : "#22302b";
 tempHtml = `<strong style="font-size:15px; color:${tempColor};">${vital.temperature.toFixed(1)}</strong> <span style="font-size:11px; color:#5f6d66;">℃</span>`;
 }

 // 脈拍 & SpO2
 let pulseSpo2Html = `<span style="color:#94a19a; font-size:11px;">未測定</span>`;
 if (vital) {
 const pStr = vital.pulse ? `脈拍: <strong>${vital.pulse}</strong> bpm` : "";
 const sStr = vital.spo2 ? `SpO2: <strong>${vital.spo2}</strong> %` : "";
 pulseSpo2Html = [pStr, sStr].filter(Boolean).join(" | ");
 }

 // 体重表示
 let weightHtml = `<span style="color:#94a19a; font-size:12px;">未測定</span>`;
 if (latestWeight) {
 const isExact = exactWeight ? " (本日測定)" : ` [${latestWeight.date.slice(5)}測定]`;
 weightHtml = `<strong style="font-size:14px; color:#22302b;">${latestWeight.weight} kg</strong> <span style="font-size:11px; color:#5f6d66;">(${latestWeight.diff_prev || '前回比なし'})${isExact}</span>`;
 }

 area.innerHTML = `
 <div style="background:#ffffff; border:1px solid #cdd6d0; border-radius:8px; padding:12px 14px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
 <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:1px solid #eef2ef; padding-bottom:6px;">
 <span style="font-size:13.5px; font-weight:bold; color:#1e5b47; display:flex; align-items:center; gap:6px;">
 <span> 【${dateStr}】 個人記録・身体状況サマリー</span>
 </span>
 <button type="button" class="btn btn-secondary" style="font-size:11.5px; padding:2px 8px; color:#1e5b47; border-color:#a9cfbf; background:#f1f6f3;" onclick="openPersonalVitalModal()">
  バイタル・体重を変更/追記
 </button>
 </div>

 <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:10px;">
 <!-- 1. バイタル & 血圧 & 体重 -->
 <div style="background:#f6f8f6; border:1px solid #dfe5e1; border-radius:6px; padding:8px 10px;">
 <div style="font-size:11px; font-weight:bold; color:#4a5852; margin-bottom:4px; display:flex; justify-content:space-between;">
 <span>バイタル & 身体測定</span>
 <span style="font-size:10px; color:#5f6d66;">${vital ? (vital.time || '') : ''}${vitalCount > 1 ? `（本日${vitalCount}回測定・最新）` : ''}</span>
 </div>
 <div style="display:flex; flex-direction:column; gap:3px;">
 <div><span style="font-size:11.5px; color:#5f6d66;">血圧:</span> ${bpHtml}</div>
 <div><span style="font-size:11.5px; color:#5f6d66;">体温:</span> ${tempHtml}</div>
 <div style="font-size:11.5px; color:#36443e;">${pulseSpo2Html}</div>
 <div style="margin-top:2px; border-top:1px dashed #cdd6d0; padding-top:2px;">
 <span style="font-size:11.5px; color:#5f6d66;"> 体重:</span> ${weightHtml}
 </div>
 </div>
 </div>

 <!-- 2. 食事 & 水分 -->
 <div style="background:#f6f8f6; border:1px solid #dfe5e1; border-radius:6px; padding:8px 10px;">
 <div style="font-size:11px; font-weight:bold; color:#4a5852; margin-bottom:4px;">
 食事 ＆ 水分摂取
 </div>
 <div style="font-size:11.5px; color:#36443e; line-height:1.5;">
  <div>朝: ${cpFormatMealRatio(breakfast)}</div>
  <div>昼: ${cpFormatMealRatio(lunch)}</div>
  <div>夕: ${cpFormatMealRatio(dinner)}</div>
  ${snacks.length ? `<div>おやつ: ${snacks.map(m => cpFormatMealRatio(m)).join("・")}</div>` : ""}
  ${others.length ? `<div>その他（水分）: ${others.map(m => `${m.water_ml || 0}ml`).join("・")}</div>` : ""}
 <div style="margin-top:2px; border-top:1px dashed #cdd6d0; padding-top:2px; color:#1e5b47; font-weight:bold;">
 1日合計水分: ${totalWater} ml
 </div>
 </div>
 </div>

 <!-- 3. 排泄 & 入浴 -->
 <div style="background:#f6f8f6; border:1px solid #dfe5e1; border-radius:6px; padding:8px 10px;">
 <div style="font-size:11px; font-weight:bold; color:#4a5852; margin-bottom:4px;">
 排泄 ＆ 入浴
 </div>
 <div style="font-size:11.5px; color:#36443e; line-height:1.5;">
 ${dayExcretions.length === 0 ? `<div style="color:#94a19a;">排泄: 未記入</div>` : `<div>排尿: <strong>${urineCount}</strong> 回 | 排便: <strong>${stoolCount}</strong> 回</div>
 <div style="font-size:11px; color:#5f6d66;">便状態: ${stoolSample ? `${escapeHtml(stoolSample.stool_condition)}${stoolSample.stool_amount ? ` (${escapeHtml(stoolSample.stool_amount)})` : ""}` : (dayExcretions.some(e => e.stool_amount === "なし") ? "排便なし" : "未記入")}</div>`}
 <div style="margin-top:2px; border-top:1px dashed #cdd6d0; padding-top:2px;">
 入浴: ${bath ? `<strong style="color:#16a34a;">${escapeHtml(bath.bath_type || "")}${bath.bath_type === "見合わせ" ? "" : " 実施"}</strong> ${bath.ointment_notes ? `(${escapeHtml(bath.ointment_notes)})` : ''}` : '<span style="color:#94a19a;">本日入浴なし</span>'}
 </div>
 </div>
 </div>

 <!-- 4. 服薬 & 口腔ケア -->
 <div style="background:#f6f8f6; border:1px solid #dfe5e1; border-radius:6px; padding:8px 10px;">
 <div style="font-size:11px; font-weight:bold; color:#4a5852; margin-bottom:4px;">
 服薬確認 ＆ 口腔ケア
 </div>
 <div style="font-size:11.5px; color:#36443e; line-height:1.5;">
 <div>服薬: ${(() => { const ok = dayMeds.filter(m => (m.status || "済") === "済"); const ng = dayMeds.filter(m => m.status && m.status !== "済"); return (ok.length ? `<span style="color:#16a34a; font-weight:bold;">済 (${ok.map(m => escapeHtml(m.timing_key || m.slot)).join('・')})</span>` : '<span style="color:#94a19a;">未記録</span>') + (ng.length ? ` <span style="color:#b3261e; font-weight:bold;">${ng.map(m => escapeHtml((m.timing_key || m.slot) + ' ' + m.status)).join('・')}</span>` : ''); })()}</div>
 <div>口腔ケア: ${dayOrals.length > 0 ? `<span style="color:#16a34a; font-weight:bold;"> 実施済 (${dayOrals.length}回)</span>` : '<span style="color:#94a19a;">未記録</span>'}</div>
 <div style="font-size:11px; color:#5f6d66; margin-top:2px;">
 食形態: ${escapeHtml(res.diet_type || '未登録')}
 </div>
 </div>
 </div>
 </div>
 </div>
 `;
}

// 個人バイタル・体重編集モーダルのオープン
function openPersonalVitalModal(vitalId) {
 // [Claude修正 2026-10-16] 記録を指定したときはその記録の訂正、指定がなければ新しい測定（再測定）の入力
 const target = vitalId ? (db.data.vitals || []).find(v => Number(v.id) === Number(vitalId) && !v.voided) : null;
 window._cpPvmTargetId = target ? target.id : null;
 const res = target ? gState.residents.find(x => Number(x.id) === Number(target.resident_id)) : gState.residents.find(x => x.id === gState.selectedResidentId);
 if (!res) {
 alert("利用者が選択されていません。");
 return;
 }

 const dt = target ? target.date : (gState.selectedDate || getTodayStr());

 document.getElementById("personalVitalModalResidentName").textContent = `${res.room_no}号室 ${res.name} 様`;
 document.getElementById("personalVitalModalDate").textContent = `${dt} (${getWeekDayJp(dt)})${target ? `　${target.time || ""} の測定を訂正` : "　新しい測定"}`;
 document.getElementById("personalVitalDate").value = dt;
 document.getElementById("personalVitalResidentId").value = res.id;

 // 既存データ事前充填
 const vital = target;
 const weightRec = (db.data.weight_records || []).find(w => w.resident_id === res.id && w.date === dt);

 document.getElementById("pvmTemp").value = (vital && vital.temperature !== null) ? vital.temperature : "";
 document.getElementById("pvmPulse").value = (vital && vital.pulse !== null) ? vital.pulse : "";
 document.getElementById("pvmBpHigher").value = (vital && vital.bp_high !== null) ? vital.bp_high : "";
 document.getElementById("pvmBpLower").value = (vital && vital.bp_low !== null) ? vital.bp_low : "";
 document.getElementById("pvmSpo2").value = (vital && vital.spo2 !== null) ? vital.spo2 : "";
 document.getElementById("pvmWeight").value = weightRec ? weightRec.weight : "";
 document.getElementById("pvmNotes").value = (vital && vital.notes) ? vital.notes : "";

 document.getElementById("personalVitalModal").style.display = "flex";
}

// [Claude修正] 「いつもと違う」の判定（項目ごとに、個別注意基準値があればそれを、なければ共通の値を使う）
// 共通の値（血圧150以上・体温37.5℃以上・SpO2 92%以下）はサンプル。看護師と決めた値ではない
function cpIsUnusualVital(res, v) {
 const r = res || {};
 const has = x => x !== null && x !== undefined && x !== "" && !isNaN(Number(x));
 const n = x => Number(x);
 if (has(v.temperature)) {
 if (has(r.temp_max) ? n(v.temperature) > n(r.temp_max) : n(v.temperature) >= 37.5) return 1;
 }
 if (has(v.bp_high)) {
 if (has(r.bp_high_max) ? n(v.bp_high) > n(r.bp_high_max) : n(v.bp_high) >= 150) return 1;
 if (has(r.bp_high_min) && n(v.bp_high) < n(r.bp_high_min)) return 1;
 }
 if (has(v.spo2)) {
 if (has(r.spo2_min) ? n(v.spo2) < n(r.spo2_min) : n(v.spo2) <= 92) return 1;
 }
 if (has(v.pulse)) {
 if (has(r.pulse_max) && n(v.pulse) > n(r.pulse_max)) return 1;
 if (has(r.pulse_min) && n(v.pulse) < n(r.pulse_min)) return 1;
 }
 return 0;
}

// 個人バイタル・体重編集モーダルの保存（全体連動） [Antigravity実装 2026-10-16]
function submitPersonalVitalModal() {
 const resId = parseInt(document.getElementById("personalVitalResidentId").value, 10);
 const dt = document.getElementById("personalVitalDate").value;
 const staff = cpLedgerStaff();

 const tempVal = normalizeTempValue(document.getElementById("pvmTemp").value);
 const pulseVal = document.getElementById("pvmPulse").value;
 const bpHighVal = document.getElementById("pvmBpHigher").value;
 const bpLowVal = document.getElementById("pvmBpLower").value;
 const spo2Val = document.getElementById("pvmSpo2").value;
 const weightVal = document.getElementById("pvmWeight").value;
 const notesVal = document.getElementById("pvmNotes").value.trim();

 if (!tempVal && !bpHighVal && !bpLowVal && !pulseVal && !spo2Val && !weightVal && !notesVal) {
  alert("バイタルまたは体重のいずれかを入力してください。");
  return;
 }

 if (!Array.isArray(db.data.vitals)) db.data.vitals = [];
 if (!Array.isArray(db.data.weight_records)) db.data.weight_records = [];

 const existingVital = window._cpPvmTargetId ? db.data.vitals.find(v => !v.voided && Number(v.id) === Number(window._cpPvmTargetId)) : null;
 const existingWeight = db.data.weight_records.find(w => !w.voided && w.resident_id === resId && w.date === dt);

 const newTemp = tempVal ? parseFloat(tempVal) : null;
 const newBpH = bpHighVal ? parseInt(bpHighVal, 10) : null;
 const newBpL = bpLowVal ? parseInt(bpLowVal, 10) : null;
 const newPulse = pulseVal ? parseInt(pulseVal, 10) : null;
 const newSpo2 = spo2Val ? parseInt(spo2Val, 10) : null;
 const newWeight = weightVal ? parseFloat(weightVal) : null;

 const vitalChanged = existingVital && (
  (existingVital.temperature ?? null) !== newTemp ||
  (existingVital.bp_high ?? null) !== newBpH ||
  (existingVital.bp_low ?? null) !== newBpL ||
  (existingVital.pulse ?? null) !== newPulse ||
  (existingVital.spo2 ?? null) !== newSpo2 ||
  (existingVital.notes || "") !== notesVal
 );
 const weightChanged = existingWeight && newWeight !== null && (existingWeight.weight ?? null) !== newWeight;

 let editReason = null;
 if (vitalChanged || weightChanged) {
  editReason = cpPromptEditReason("バイタル・体重記録", existingVital ? cpFormatVitalBrief(existingVital) : `体重 ${existingWeight ? existingWeight.weight + 'kg' : ''}`);
  if (editReason === null) return;
 }

 // [Claude修正] バイタルに空欄の項目があれば、保存してよいか確認する
 const blankLabels = [];
 if (!tempVal) blankLabels.push("体温");
 if (!bpHighVal) blankLabels.push("最高血圧");
 if (!bpLowVal) blankLabels.push("最低血圧");
 if (!pulseVal) blankLabels.push("脈拍");
 if (!spo2Val) blankLabels.push("SpO2");
 if ((tempVal || bpHighVal || bpLowVal || pulseVal || spo2Val) && blankLabels.length > 0 && !confirm(`次の項目が空欄です。\n${blankLabels.join("、")}\n\nこのまま保存しますか？`)) return;

 const nowTime = new Date().toTimeString().slice(0, 5);
 const pvmRes = ((gState && gState.residents) || (db.data.residents || [])).find(x => x.id === resId);

 // バイタル更新または追加（既存のidを保ったまま書き換える）
 if (existingVital && vitalChanged) {
  const oldCopy = JSON.parse(JSON.stringify(existingVital));
  existingVital.time = nowTime;
  existingVital.temperature = newTemp;
  existingVital.bp_high = newBpH;
  existingVital.bp_low = newBpL;
  existingVital.pulse = newPulse;
  existingVital.spo2 = newSpo2;
  existingVital.notes = notesVal;
  existingVital.is_unusual = cpIsUnusualVital(pvmRes, existingVital);
  existingVital.staff_name = staff;
  cpAppendEditHistory(existingVital, oldCopy, ["time", "temperature", "bp_high", "bp_low", "pulse", "spo2", "is_unusual", "notes"], editReason);
 } else if (!existingVital && !window._cpPvmTargetId && (tempVal || bpHighVal || bpLowVal || pulseVal || spo2Val || notesVal)) {
  const vitalObj = {
   id: Date.now(),
   date: dt,
   time: nowTime,
   resident_id: resId,
   temperature: newTemp,
   bp_high: newBpH,
   bp_low: newBpL,
   pulse: newPulse,
   spo2: newSpo2,
   is_unusual: 0,
   staff_name: staff,
   notes: notesVal
  };
  vitalObj.is_unusual = cpIsUnusualVital(pvmRes, vitalObj);
  db.data.vitals.push(vitalObj);
 }

 // 体重更新または追加（既存のidを保ったまま書き換える）
 if (newWeight !== null) {
  const prevWeightObj = db.data.weight_records
   .filter(w => !w.voided && w.resident_id === resId && w.date < dt)
   .sort((a, b) => b.date.localeCompare(a.date))[0];

  let diffStr = "±0.0kg";
  if (prevWeightObj && prevWeightObj.weight) {
   const d = (newWeight - prevWeightObj.weight).toFixed(1);
   diffStr = d >= 0 ? `+${d}kg` : `${d}kg`;
  }

  if (existingWeight && weightChanged) {
   const oldW = JSON.parse(JSON.stringify(existingWeight));
   existingWeight.weight = newWeight;
   existingWeight.diff_prev = diffStr;
   existingWeight.staff_name = staff;
   cpAppendEditHistory(existingWeight, oldW, ["weight", "diff_prev"], editReason);
  } else if (!existingWeight) {
   db.data.weight_records.push({
    id: Date.now() + 5,
    date: dt,
    month: dt.slice(0, 7),
    resident_id: resId,
    weight: newWeight,
    diff_prev: diffStr,
    staff_name: staff
   });
  }
 }

 db.save();
 closeModal("personalVitalModal");

 loadDateRecords(dt);
 if (typeof renderWeightTable === "function") renderWeightTable();
 if (typeof renderWeightChart === "function") renderWeightChart();

 alert("バイタル・身体測定を保存しました！各画面に連動反映されました。");
}

// 区分に応じたバッジ装飾スタイル（日誌・個別カルテ共通） [Antigravity実装 2026-10-16]
function getCategoryBadgeStyle(cat) {
 if (cat === "特変") return "background:#fee2e2; color:#991b1b; font-weight:bold; border:1px solid #fca5a5;";
 if (cat === "連絡") return "background:#fef9c3; color:#854d0e; font-weight:bold; border:1px solid #fde047;";
 if (cat === "看護") return "background:#dcfce7; color:#166534; font-weight:bold; border:1px solid #bbf7d0;";
 if (cat === "リハビリ") return "background:#ede9fe; color:#6b21a8; font-weight:bold; border:1px solid #ddd6fe;";
 if (cat === "家族") return "background:#ffedd5; color:#c2410c; font-weight:bold; border:1px solid #fed7aa;";
 if (cat === "巡視" || cat === "体位変換") return "background:#eef2ef; color:#4a5852; border:1px solid #cdd6d0;";
 if (cat === "バイタル") return "background:#fef3c7; color:#92400e; border:1px solid #fde68a;";
 if (cat === "食事・水分") return "background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd;";
 if (cat === "排泄") return "background:#fefce8; color:#854d0e; border:1px solid #fef08a;";
 if (cat === "入浴") return "background:#ecfeff; color:#0e7490; border:1px solid #a5f3fc;";
 if (cat === "服薬" || cat === "頓服服用") return "background:#f3e8ff; color:#6b21a8; border:1px solid #e9d5ff;";
 return "background:#e0f2fe; color:#0369a1; border:1px solid #c9e0d5;"; // 介護・デフォルト
}

// [Antigravity実装 2026-10-16] その人の記録（食事・水分・排泄・バイタル・体位変換・入浴・様子など）を日付と時間の順に1本に並べる共通関数
function cpDefaultMealTime(mealType) {
 if (mealType === "朝食") return "08:00";
 if (mealType === "昼食") return "12:00";
 if (mealType === "おやつ") return "15:00";
 if (mealType === "夕食") return "18:00";
 return "10:00";
}

function cpBuildUnifiedResidentRecords(resId, targetDate, isAllScope, includeVoided) {
 if (!resId) return [];
 const items = [];
 const matchDate = (d) => isAllScope ? Boolean(d) : (d === targetDate);

 // 1. 様子・経過記録 (care_records)
 (db.data.care_records || []).forEach(r => {
  if (r.resident_id !== resId) return;
  if (includeVoided === false && r.voided) return;
  // 体位変換から自動生成された「巡視」は turns 側と重複するため除外（ただし手動記録や特変は残す）
  if (r.auto_night_turn && r.category === "巡視") return;
  const dtStr = r.recorded_at || r.record_time || "";
  const dPart = dtStr.slice(0, 10);
  if (!matchDate(dPart)) return;
  items.push({
   uid: `care_${r.id}`,
   raw_id: r.id,
   source_type: "care_records",
   recorded_at: dtStr.length === 10 ? `${dtStr} 00:00` : dtStr,
   date: dPart,
   time: dtStr.length >= 16 ? dtStr.slice(11, 16) : "00:00",
   category: r.category || "介護",
   content: r.content || "",
   staff_name: r.staff_name || "未記録",
   voided: Boolean(r.voided),
   voided_at: r.voided_at,
   voided_by: r.voided_by,
   void_reason: r.void_reason,
   edit_history: r.edit_history,
   void_history: r.void_history,
   raw: r
  });
 });

 // 2. バイタル (vitals)
 (db.data.vitals || []).forEach(v => {
  if (v.resident_id !== resId || (!includeVoided && v.voided)) return;
  if (!matchDate(v.date)) return;
  const tm = v.time || "09:00";
  items.push({
   uid: `vital_${v.id}`,
   raw_id: v.id,
   source_type: "vitals",
   recorded_at: `${v.date} ${tm}`,
   date: v.date,
   category: "バイタル",
   content: cpFormatVitalBrief(v) + (v.notes ? ` （${v.notes}）` : ""),
   staff_name: v.staff_name || "未記録",
   time: tm,
   voided: Boolean(v.voided),
   voided_at: v.voided_at,
   voided_by: v.voided_by,
   void_reason: v.void_reason,
   edit_history: v.edit_history,
   raw: v
  });
 });

 // 3. 食事・水分 (meals)
 (db.data.meals || []).forEach(m => {
  if (m.resident_id !== resId || (!includeVoided && m.voided)) return;
  if (!matchDate(m.date)) return;
  const tm = m.time || cpDefaultMealTime(m.meal_type);
  items.push({
   uid: `meal_${m.id}`,
   raw_id: m.id,
   source_type: "meals",
   recorded_at: `${m.date} ${tm}`,
   date: m.date,
   category: "食事・水分",
   content: cpFormatMealDetail(m),
   staff_name: m.staff_name || "未記録",
   time: tm,
   voided: Boolean(m.voided),
   voided_at: m.voided_at,
   voided_by: m.voided_by,
   void_reason: m.void_reason,
   edit_history: m.edit_history,
   raw: m
  });
 });

 // 4. 排泄 (excretions)
 (db.data.excretions || []).forEach(e => {
  if (e.resident_id !== resId || (!includeVoided && e.voided)) return;
  if (!matchDate(e.date)) return;
  const tm = e.time || "10:00";
  items.push({
   uid: `exc_${e.id}`,
   raw_id: e.id,
   source_type: "excretions",
   recorded_at: `${e.date} ${tm}`,
   date: e.date,
   category: "排泄",
   content: cpFormatExcretionDetail(e),
   staff_name: e.staff_name || "未記録",
   time: tm,
   voided: Boolean(e.voided),
   voided_at: e.voided_at,
   voided_by: e.voided_by,
   void_reason: e.void_reason,
   edit_history: e.edit_history,
   raw: e
  });
 });

 // 5. 入浴 (baths)
 (db.data.baths || []).forEach(b => {
  if (b.resident_id !== resId || (!includeVoided && b.voided)) return;
  if (!matchDate(b.date)) return;
  const tm = b.time || "14:00";
  items.push({
   uid: `bath_${b.id}`,
   raw_id: b.id,
   source_type: "baths",
   recorded_at: `${b.date} ${tm}`,
   date: b.date,
   category: "入浴",
   content: cpFormatBathDetail(b),
   staff_name: b.staff_name || "未記録",
   time: tm,
   voided: Boolean(b.voided),
   voided_at: b.voided_at,
   voided_by: b.voided_by,
   void_reason: b.void_reason,
   edit_history: b.edit_history,
   raw: b
  });
 });

 // 6. 体位変換・夜間巡視 (turns)
 (db.data.turns || []).forEach(t => {
  if (t.resident_id !== resId || (!includeVoided && t.voided)) return;
  if (!matchDate(t.date)) return;
  const tm = t.time || "00:00";
  items.push({
   uid: `turn_${t.id}`,
   raw_id: t.id,
   source_type: "turns",
   recorded_at: `${t.date} ${tm}`,
   date: t.date,
   category: "体位変換",
   content: `【${tm} 体位変換・巡視】${t.action || ""}${t.note ? " 【様子】" + t.note : ""}`,
   staff_name: t.staff_name || "未記録",
   time: tm,
   voided: Boolean(t.voided),
   voided_at: t.voided_at,
   voided_by: t.voided_by,
   void_reason: t.void_reason,
   edit_history: t.edit_history,
   raw: t
  });
 });

 // 7. 服薬 (meds)
 // [Antigravity実装 2026-10-19] 飲む日の表記や目薬の薬名・左右も統合記録に出す
 (db.data.meds || []).forEach(m => {
  if (m.resident_id !== resId || (!includeVoided && m.voided)) return;
  if (!matchDate(m.date)) return;
  const label = m.timing_key || m.slot || "服薬";
  const tm = m.actual_time || m.recorded_time || (typeof cpRxSlotTime === "function" ? cpRxSlotTime(label) : "08:00");
  let detail = "";
  if (m.medicine_name) {
   detail = ` (${m.eye ? "[" + m.eye + "] " : ""}${m.medicine_name})`;
  } else if (m.bag) {
   detail = ` (${m.bag})`;
  } else if (typeof cpBagText === "function" && m.date && label) {
   const bt = cpBagText(resId, label, m.date);
   if (bt) detail = ` (${bt})`;
  }
  items.push({
   uid: `med_${m.id}`,
   raw_id: m.id,
   source_type: "meds",
   recorded_at: `${m.date} ${tm}`,
   date: m.date,
   category: "服薬",
   content: `【${label}】${m.status || "済"}${detail}${m.note ? " " + m.note : ""}`,
   staff_name: m.staff_name || "未記録",
   time: tm,
   voided: Boolean(m.voided),
   voided_at: m.voided_at,
   voided_by: m.voided_by,
   void_reason: m.void_reason,
   edit_history: m.edit_history,
   raw: m
  });
 });

 // 8. 口腔ケア (oral_cares)
 (db.data.oral_cares || []).forEach(o => {
  if (o.resident_id !== resId || (!includeVoided && o.voided)) return;
  if (!matchDate(o.date)) return;
  const tm = o.time || "08:30";
  const slots = [];
  if (o.morning) slots.push("朝");
  if (o.noon) slots.push("昼");
  if (o.evening) slots.push("夕");
  if (o.bedtime) slots.push("眠前");
  const detail = slots.length ? `実施 (${slots.join("・")})` : (o.status || "実施済");
  items.push({
   uid: `oral_${o.id}`,
   raw_id: o.id,
   source_type: "oral_cares",
   recorded_at: `${o.date} ${tm}`,
   date: o.date,
   category: "口腔ケア",
   content: `口腔ケア ${detail}${o.denture_cleaned ? "・義歯洗浄済" : ""}${o.mucosa_status ? " (" + o.mucosa_status + ")" : ""}${o.notes ? " " + o.notes : ""}`,
   staff_name: o.staff_name || "未記録",
   time: tm,
   voided: Boolean(o.voided),
   voided_at: o.voided_at,
   voided_by: o.voided_by,
   void_reason: o.void_reason,
   edit_history: o.edit_history,
   raw: o
  });
 });

 // [Claude修正 2026-10-23] 日付と時間の順（古い順＝早い時間から遅い時間）に1本に並べる。上から読むと経過がたどれるように
 // （あなた「早い時間から遅い時間に流れて書かないと…辿って行って最終的にこれでしたってならないと」）。月の枠は新しい月が上のまま
 items.sort((a, b) => (a.recorded_at || "").localeCompare(b.recorded_at || ""));
 return items;
}

// [Antigravity実装 2026-10-16] 統合タイムライン上の各記録カードに対する操作ボタン（訂正・履歴表示）
function cpUnifiedRecordActions(item) {
 if (item.source_type === "care_records") {
  return cpCareRecordActions(item.raw);
 }
 const histCount = (item.edit_history && item.edit_history.length) ? item.edit_history.length : 0;
 const histBtn = histCount > 0
  ? `<button type="button" class="btn btn-secondary" style="font-size:11px; padding:2px 8px; border:1px solid #cdd6d0;" onclick="cpShowGenericEditHistory('${item.source_type}', ${Number(item.raw_id)})">履歴(訂正${histCount})</button>`
  : "";
 let editBtn = "";
 if (item.source_type === "vitals") {
  editBtn = `<button type="button" class="btn btn-secondary" style="font-size:11px; padding:2px 8px; border:1px solid #cdd6d0;" onclick="openPersonalVitalModal(${Number(item.raw_id)})">訂正</button>`;
 } else if (item.source_type === "meals") {
  editBtn = `<button type="button" class="btn btn-secondary" style="font-size:11px; padding:2px 8px; border:1px solid #cdd6d0;" onclick="cpQuickEditMealRecord(${Number(item.raw_id)})">訂正</button>`;
 } else if (item.source_type === "excretions") {
  editBtn = `<button type="button" class="btn btn-secondary" style="font-size:11px; padding:2px 8px; border:1px solid #cdd6d0;" onclick="editExcretionRecord(${Number(item.raw_id)})">訂正</button>`;
 } else if (item.source_type === "baths") {
  editBtn = `<button type="button" class="btn btn-secondary" style="font-size:11px; padding:2px 8px; border:1px solid #cdd6d0;" onclick="cpQuickEditBathRecord(${Number(item.raw_id)})">訂正</button>`;
 } else if (item.source_type === "turns") {
  editBtn = `<button type="button" class="btn btn-secondary" style="font-size:11px; padding:2px 8px; border:1px solid #cdd6d0;" onclick="editSavedNightTurn(${Number(item.raw_id)})">訂正</button>`;
 }
 return `${editBtn}${histBtn}`;
}

function cpShowGenericEditHistory(sourceType, rawId) {
 const arr = db.data[sourceType] || [];
 const rec = arr.find(x => Number(x.id) === Number(rawId));
 if (!rec || !rec.edit_history || !rec.edit_history.length) {
  alert("訂正の履歴はありません。");
  return;
 }
 const lines = rec.edit_history.map((h, i) => {
  const beforeStr = h.before ? Object.entries(h.before).map(([k, v]) => `${k}: ${v ?? "空"}`).join(", ") : "";
  return `■ 訂正${i + 1}: ${h.edited_at || ""} (${h.edited_by || "未記録"})\n理由: ${h.reason || "記載なし"}\n変更前: ${beforeStr}`;
 });
 alert(`【訂正の履歴】\n\n${lines.join("\n\n")}`);
}

function cpQuickEditMealRecord(mealId) {
 const m = (db.data.meals || []).find(x => Number(x.id) === Number(mealId));
 if (!m || m.voided) return;
 const res = gState.residents.find(r => r.id === m.resident_id);
 const type = m.meal_type || "朝食";
 let newMain = m.main_dish_ratio;
 let newSide = m.side_dish_ratio;
 if (type !== "その他") {
  const mainIn = prompt(`【${res ? res.name + " 様" : ""} ${type}】主食の量(0〜10割)を入力してください:`, m.main_dish_ratio ?? "");
  if (mainIn === null) return;
  newMain = mainIn.trim() !== "" && !isNaN(parseInt(mainIn, 10)) ? parseInt(mainIn, 10) : null;
 }
 if (type !== "おやつ" && type !== "その他") {
  const sideIn = prompt(`【${res ? res.name + " 様" : ""} ${type}】副食の量(0〜10割)を入力してください:`, m.side_dish_ratio ?? "");
  if (sideIn === null) return;
  newSide = sideIn.trim() !== "" && !isNaN(parseInt(sideIn, 10)) ? parseInt(sideIn, 10) : null;
 }
 const waterIn = prompt(`【${res ? res.name + " 様" : ""} ${type}】水分量(ml)を入力してください:`, m.water_ml ?? 0);
 if (waterIn === null) return;
 const newWater = waterIn.trim() !== "" && !isNaN(parseInt(waterIn, 10)) ? parseInt(waterIn, 10) : 0;

 if ((m.main_dish_ratio ?? null) === newMain && (m.side_dish_ratio ?? null) === newSide && (m.water_ml ?? 0) === newWater) {
  alert("変更された内容がありません。");
  return;
 }
 const reason = cpPromptEditReason(`${type}の記録`, cpFormatMealDetail(m));
 if (reason === null) return;
 const oldCopy = JSON.parse(JSON.stringify(m));
 m.main_dish_ratio = newMain;
 m.side_dish_ratio = newSide;
 m.water_ml = newWater;
 m.time = new Date().toTimeString().slice(0, 5);
 m.staff_name = cpLedgerStaff();
 cpAppendEditHistory(m, oldCopy, ["main_dish_ratio", "side_dish_ratio", "water_ml", "time"], reason);
 db.save();
 loadDateRecords(gState.selectedDate);
 alert(`${type}の記録を訂正しました。`);
}

function cpQuickEditBathRecord(bathId) {
 const b = (db.data.baths || []).find(x => Number(x.id) === Number(bathId));
 if (!b || b.voided) return;
 const res = gState.residents.find(r => r.id === b.resident_id);
 const newType = prompt(`【${res ? res.name + " 様" : ""}】入浴方法を変更してください (一般浴 / 特浴 / 清拭 / 見合わせ):`, b.bath_type || "");
 if (newType === null || !newType.trim()) return;
 const newNotes = prompt(`処置・軟膏・様子を入力してください:`, b.ointment_notes || "");
 if (newNotes === null) return;
 if (newType.trim() === (b.bath_type || "") && newNotes.trim() === (b.ointment_notes || "")) {
  alert("変更された内容がありません。");
  return;
 }
 const reason = cpPromptEditReason("入浴記録", cpFormatBathDetail(b));
 if (reason === null) return;
 const oldCopy = JSON.parse(JSON.stringify(b));
 b.bath_type = newType.trim();
 b.ointment_notes = newNotes.trim();
 b.time = new Date().toTimeString().slice(0, 5);
 b.staff_name = cpLedgerStaff();
 cpAppendEditHistory(b, oldCopy, ["bath_type", "ointment_notes", "time"], reason);
 db.save();
 loadDateRecords(gState.selectedDate);
 alert("入浴記録を訂正しました。");
}

// 選択中利用者の個別介護記録一覧表示 (見る画面：すべての種類の記録を日付と時間の順に1本に並べる) [Antigravity実装 2026-10-16]
function renderSelectedDateRecords() {
 const list = document.getElementById("selectedDateRecordsList");
 if (!list) return;
 const titleEl = document.getElementById("selectedDateRecordsTitle");
 const res = gState.residents.find(x => x.id === gState.selectedResidentId);
 const resName = res ? `${res.room_no}号室 ${res.name} 様` : "利用者未指定";

 const dateBadge = document.getElementById("personalSelectedDateBadge");
 if (dateBadge) {
  dateBadge.textContent = `${gState.selectedDate} (${getWeekDayJp(gState.selectedDate)})`;
 }

 const isAllScope = gState.recordScope === "all";
 if (titleEl) {
  titleEl.textContent = isAllScope
   ? ` 【${resName}】の個別記録（見る） (年月別アーカイブ)`
   : ` 【${resName}】の個別記録（見る）`;
 }

 // 1. 個人記録カレンダーを描画
 renderPersonalCalendar();

 // 2. 当日の個人データ集約サマリーカードを描画
 if (!isAllScope) {
  renderPersonalDailySummary(res, gState.selectedDate);
 } else {
  const summaryArea = document.getElementById("personalDailySummaryArea");
  if (summaryArea) summaryArea.innerHTML = "";
 }

 // 2b. バイタルのグラフを描画 [Antigravity実装]
 if (typeof renderPersonalVitalChart === "function") {
  renderPersonalVitalChart();
 }

 list.innerHTML = "";

 // 選択中利用者の全種類の記録を日付と時間の順に統合
 const allUserRecords = cpBuildUnifiedResidentRecords(gState.selectedResidentId, gState.selectedDate, true);
 const records = isAllScope
  ? allUserRecords
  : cpBuildUnifiedResidentRecords(gState.selectedResidentId, gState.selectedDate, false);

 if (records.length === 0) {
  if (!isAllScope && allUserRecords.length > 0) {
   list.innerHTML = `
   <div style="padding:20px; text-align:center; background:#f6f8f6; border-radius:6px; border:1px dashed #cdd6d0;">
   <p style="font-size:14px; color:#5f6d66; margin-bottom:8px;">【${escapeHtml(gState.selectedDate)}】の記録はまだ登録されていません。</p>
   <p style="font-size:13px; color:#1e5b47; margin-bottom:12px;">（※この利用者様には過去の記録が計 ${allUserRecords.length} 件あります）</p>
   <div style="display:flex; gap:8px; justify-content:center; flex-wrap:wrap;">
    <button type="button" class="btn btn-secondary" style="font-size:12px; background:#f1f6f3; color:#1a4f3d; border:1px solid #a9cfbf;" onclick="toggleRecordScope()">
     すべての過去履歴を表示する
    </button>
    <button type="button" class="btn btn-primary" style="font-size:12px;" onclick="switchCareTab('write_single')">
     経過記録へ
    </button>
   </div>
   </div>
   `;
  } else {
   list.innerHTML = '<p style="font-size:14px; color:var(--text-muted); padding:20px; text-align:center;">この利用者様の記録はありません。</p>';
  }
  return;
 }

 // レコード単体の描画ヘルパー関数
 const createRecordItem = (r) => {
  const item = document.createElement("div");
  item.className = "care-record-card";

  const catBadgeStyle = getCategoryBadgeStyle(r.category);

  const timeDisplay = r.recorded_at || "時間未記録";
  const rawContent = r.content || "";
  const charLen = rawContent.length;
  const isLong = charLen > 400;
  const expandKey = r.uid || r.id;
  const isExpanded = gExpandedRecordIds.has(expandKey);

  let displayContent = rawContent;
  let toggleBtnHtml = "";
  if (isLong && !isExpanded) {
   displayContent = rawContent.slice(0, 300) + "……";
   toggleBtnHtml = `<button type="button" class="btn btn-secondary" style="font-size:12px; padding:3px 10px; margin-top:6px; align-self:flex-start;" onclick="toggleRecordExpand('${expandKey}')"> 全文を表示 (${charLen}文字)</button>`;
  } else if (isLong && isExpanded) {
   toggleBtnHtml = `<button type="button" class="btn btn-secondary" style="font-size:12px; padding:3px 10px; margin-top:6px; align-self:flex-start;" onclick="toggleRecordExpand('${expandKey}')">▲ 一部を折りたたむ</button>`;
  }

  item.innerHTML = `
  <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
  <div style="display:flex; align-items:center; gap:8px;">
  <span style="font-size:12px; padding:3px 8px; border-radius:4px; ${catBadgeStyle}">［${escapeHtml(r.category || '介護記録')}］</span>
  <strong style="font-size:14px; color:#22302b;">${escapeHtml(resName)}</strong>
  ${isLong ? `<span style="font-size:11px; background:#eef2ef; color:#4a5852; padding:2px 6px; border-radius:10px;">(${charLen}字)</span>` : ''}
  </div>
  <div style="display:flex; align-items:center; gap:6px;">
  <span style="font-size:12px; color:var(--text-muted);">${escapeHtml(timeDisplay)} (記録者: ${escapeHtml(r.staff_name || '未記録')})</span>
  ${cpUnifiedRecordActions(r)}
  </div>
  </div>
  <div class="care-record-body" style="${r.voided ? 'text-decoration:line-through; color:#94a19a;' : ''}">${escapeHtml(displayContent)}</div>
  ${toggleBtnHtml}
  `;
  return item;
 };

 // 全履歴表示（isAllScope）の場合は年月別アコーディオンでグループ化
 if (isAllScope) {
  const monthGroups = {};
  allUserRecords.forEach(r => {
   const timeStr = r.recorded_at || "";
   const ym = timeStr.slice(0, 7) || "その他";
   if (!monthGroups[ym]) monthGroups[ym] = [];
   monthGroups[ym].push(r);
  });

  const ymList = Object.keys(monthGroups).sort().reverse(); // 新しい月順

  if (!gMonthAccordionInited && ymList.length > 0) {
   gOpenMonthAccordions.add(ymList[0]);
   gMonthAccordionInited = true;
  }

  const filterBar = document.createElement("div");
  filterBar.style.cssText = "display:flex; gap:6px; margin-bottom:12px; flex-wrap:wrap; align-items:center;";
  filterBar.innerHTML = `
  <span style="font-size:12px; font-weight:bold; color:#4a5852; margin-right:4px;">月別表示:</span>
  <button type="button" class="btn btn-secondary" style="font-size:11px; padding:3px 9px; ${gSelectedHistoryMonth === 'all' ? 'background:#1a4f3d; color:#fff; font-weight:bold;' : ''}" onclick="filterHistoryMonth('all')">すべて (計${allUserRecords.length}件)</button>
  ${ymList.map(ym => {
   const parts = ym.split("-");
   const label = parts.length === 2 ? `${parts[0]}年${parseInt(parts[1])}月 (${monthGroups[ym].length}件)` : ym;
   const active = gSelectedHistoryMonth === ym;
   return `<button type="button" class="btn btn-secondary" style="font-size:11px; padding:3px 9px; ${active ? 'background:#1a4f3d; color:#fff; font-weight:bold;' : ''}" onclick="filterHistoryMonth('${ym}')">${label}</button>`;
  }).join("")}
  `;
  list.appendChild(filterBar);

  ymList.forEach(ym => {
   if (gSelectedHistoryMonth !== "all" && gSelectedHistoryMonth !== ym) return;

   const parts = ym.split("-");
   const ymTitle = parts.length === 2 ? `${parts[0]}年${parseInt(parts[1])}月` : ym;
   const mRecs = monthGroups[ym];
   const isOpen = gOpenMonthAccordions.has(ym);

   const accordionContainer = document.createElement("div");
   accordionContainer.style.cssText = "margin-bottom:12px; border:1px solid #dfe5e1; border-radius:6px; overflow:hidden; background:#fff;";

   const header = document.createElement("div");
   header.style.cssText = "display:flex; justify-content:space-between; align-items:center; background:#f6f8f6; padding:10px 14px; cursor:pointer; user-select:none; border-left:4px solid #3d8a6e; transition:background 0.2s;";
   header.onmouseover = () => header.style.background = "#eef2ef";
   header.onmouseout = () => header.style.background = "#f6f8f6";
   header.onclick = () => toggleMonthAccordion(ym);

   header.innerHTML = `
   <div style="display:flex; align-items:center; gap:8px;">
   <span style="font-size:14px; font-weight:bold; color:#173f33;"> ${ymTitle}</span>
   <span style="font-size:11px; background:#f1f6f3; color:#1a4f3d; padding:2px 8px; border-radius:10px; font-weight:bold;">${mRecs.length} 件</span>
   </div>
   <span style="font-size:12px; color:#5f6d66; font-weight:bold;">
   ${isOpen ? '▲ 折りたたむ' : '▼ 展開して表示'}
   </span>
   `;
   accordionContainer.appendChild(header);

   if (isOpen) {
    const body = document.createElement("div");
    body.style.cssText = "padding:10px; background:#ffffff; border-top:1px solid #dfe5e1;";
    mRecs.forEach(r => {
     body.appendChild(createRecordItem(r));
    });
    accordionContainer.appendChild(body);
   }

   list.appendChild(accordionContainer);
  });

 } else {
  records.forEach(r => {
   list.appendChild(createRecordItem(r));
  });
 }
}

// 選択中利用者の個別カルテ記録を印刷 [Antigravity実装 2026-10-16]
function printSelectedDateRecords() {
 const res = gState.residents.find(x => x.id === gState.selectedResidentId);
 const resName = res ? `${res.room_no}号室 ${res.name} 様` : "利用者未指定";

 const isAllScope = gState.recordScope === "all";
 const records = cpBuildUnifiedResidentRecords(gState.selectedResidentId, gState.selectedDate, isAllScope);

 if (records.length === 0) {
  alert(`【${resName}】の対象記録はありません。印刷するデータがありません。`);
  return;
 }

 const printArea = document.getElementById("printArea");
 if (!printArea) {
  alert("印刷コンテナが見つかりません。");
  return;
 }

 const staffName = document.getElementById("currentStaff").value || "未記録";
 const nowStr = new Date().toLocaleString("ja-JP");

 let recordsHtml = records.map((r, idx) => {
  const timeDisplay = r.recorded_at || "時間未記録";
  return `
  <div style="margin-bottom:18px; border:1px solid #cdd6d0; border-radius:6px; padding:12px; page-break-inside:avoid; background:#fff;">
  <div style="display:flex; justify-content:space-between; border-bottom:1px solid #dfe5e1; padding-bottom:6px; margin-bottom:8px; font-size:13px;">
  <div>
  <span style="font-weight:bold; background:#dfe5e1; padding:2px 6px; border-radius:3px;">#${idx + 1} ［${escapeHtml(r.category || '介護記録')}］</span>
  <strong style="font-size:15px; margin-left:8px;">${escapeHtml(resName)}</strong>
  </div>
  <div style="color:#5f6d66;">
  <span>日時: ${escapeHtml(timeDisplay)}</span>
  <span style="margin-left:12px;">記録者: ${escapeHtml(r.staff_name || '未記録')}</span>
  </div>
  </div>
  <div style="white-space:pre-wrap; font-size:13.5px; line-height:1.7; color:#22302b; padding:4px 2px;">
${cpCareRecordPrintNote(r)}${escapeHtml(r.content || '')}
  </div>
  </div>
  `;
 }).join("");

 printArea.innerHTML = `
 <div style="font-family:'Hiragino Kaku Gothic ProN', 'Meiryo', sans-serif; color:#000;">
 <div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid #173f33; padding-bottom:10px; margin-bottom:16px;">
 <div>
 <h1 style="font-size:22px; margin:0; color:#173f33;">個別介護記録・カルテ報告書</h1>
 <p style="font-size:13px; color:#4a5852; margin:4px 0 0 0;">対象利用者: <strong>${escapeHtml(resName)}</strong> (${res ? res.care_level : ''}) / 対象日: <strong>${isAllScope ? '全期間履歴' : escapeHtml(gState.selectedDate)}</strong></p>
 </div>
 <div style="text-align:right; font-size:12px; color:#5f6d66;">
 <div>印刷日時: ${nowStr}</div>
 <div>出力担当者: ${escapeHtml(staffName)}</div>
 <div>記録件数: 計 ${records.length} 件</div>
 </div>
 </div>

 <div style="margin-top:12px;">
 ${recordsHtml}
 </div>

 <div style="margin-top:24px; border-top:1px solid #cdd6d0; padding-top:8px; display:flex; justify-content:space-between; font-size:11px; color:#94a19a;">
 <span>ケアポータル 統合管理システム (個別カルテ印刷)</span>
 <span>確認印: __________________</span>
 </div>
 </div>
 `;

 runPrintJob(printArea.innerHTML, { page: "A4 portrait", fitOnePage: true, minScale: 0.75 });
}



// ======================================================================
// 個別記録 バイタルのグラフ (体温・血圧・脈拍・SpO2) [Antigravity実装]
// ======================================================================

let gVitalChartPeriod = "1w"; // "1w" | "1m" | "3m"
let gVitalChartAnchorDate = null;
let gVitalChartLastResId = null;
let gVitalChartLastSelDate = null; // [Claude修正] 選んでいる日が変わったら、グラフの最後の日もそろえる
let gVitalChartSelectedPoint = null;

function cpAddDaysToStr(dateStr, days) {
 if (!dateStr) return "";
 const d = new Date(dateStr + "T00:00:00");
 if (isNaN(d.getTime())) return dateStr;
 d.setDate(d.getDate() + days);
 const y = d.getFullYear();
 const m = String(d.getMonth() + 1).padStart(2, "0");
 const day = String(d.getDate()).padStart(2, "0");
 return `${y}-${m}-${day}`;
}

function cpGetVitalChartRange(anchorDate, period) {
 const anchor = anchorDate || (gState && gState.selectedDate) || new Date().toISOString().slice(0, 10);
 const end = new Date(anchor + "T00:00:00");
 if (isNaN(end.getTime())) {
  const today = new Date();
  const fmtToday = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { startDate: fmtToday(today), endDate: fmtToday(today) };
 }
 const start = new Date(end);
 if (period === "1m") {
  start.setMonth(start.getMonth() - 1);
  start.setDate(start.getDate() + 1);
 } else if (period === "3m") {
  start.setMonth(start.getMonth() - 3);
  start.setDate(start.getDate() + 1);
 } else {
  // 1w (7日間)
  start.setDate(start.getDate() - 6);
 }
 const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
 return { startDate: fmt(start), endDate: fmt(end) };
}

// 看護師が決めた目安を超えた・下回ったか判定（共通関数）
function cpIsVitalExceedingLimit(type, val, resident) {
 if (val === null || val === undefined || val === "" || isNaN(val)) return false;
 if (!resident) return false;
 const num = Number(val);
 if (type === "temperature") {
  const max = (resident.temp_max != null && resident.temp_max !== "") ? Number(resident.temp_max) : null;
  if (max !== null && !isNaN(max) && num > max) return true;
  return false;
 }
 if (type === "bp_high") {
  const max = (resident.bp_high_max != null && resident.bp_high_max !== "") ? Number(resident.bp_high_max) : null;
  const min = (resident.bp_high_min != null && resident.bp_high_min !== "") ? Number(resident.bp_high_min) : null;
  if (max !== null && !isNaN(max) && num > max) return true;
  if (min !== null && !isNaN(min) && num < min) return true;
  return false;
 }
 if (type === "bp_low") {
  return false;
 }
 if (type === "pulse") {
  const max = (resident.pulse_max != null && resident.pulse_max !== "") ? Number(resident.pulse_max) : null;
  const min = (resident.pulse_min != null && resident.pulse_min !== "") ? Number(resident.pulse_min) : null;
  if (max !== null && !isNaN(max) && num > max) return true;
  if (min !== null && !isNaN(min) && num < min) return true;
  return false;
 }
 if (type === "spo2") {
  const min = (resident.spo2_min != null && resident.spo2_min !== "") ? Number(resident.spo2_min) : null;
  if (min !== null && !isNaN(min) && num < min) return true;
  return false;
 }
 return false;
}

// [Claude修正] その項目に看護師が決めた目安があるか（ないときは「範囲内」と言わない）
function cpHasVitalLimit(type, resident) {
 if (!resident) return false;
 const has = k => resident[k] != null && resident[k] !== "" && !isNaN(Number(resident[k]));
 if (type === "temperature") return has("temp_max");
 if (type === "bp_high") return has("bp_high_max") || has("bp_high_min");
 if (type === "pulse") return has("pulse_max") || has("pulse_min");
 if (type === "spo2") return has("spo2_min");
 return false; // 最低血圧には目安の欄がない
}

// 看護師が決めた目安の表示文言
function cpGetVitalLimitText(chartType, resident) {
 if (!resident) return "看護師が決めた目安：未設定";
 if (chartType === "temperature") {
  const max = (resident.temp_max != null && resident.temp_max !== "") ? Number(resident.temp_max) : null;
  if (max !== null && !isNaN(max)) return `看護師が決めた目安：${max}℃以下`;
  return "看護師が決めた目安：未設定";
 }
 if (chartType === "bp") {
  const max = (resident.bp_high_max != null && resident.bp_high_max !== "") ? Number(resident.bp_high_max) : null;
  const min = (resident.bp_high_min != null && resident.bp_high_min !== "") ? Number(resident.bp_high_min) : null;
  const parts = [];
  if (max !== null && !isNaN(max)) parts.push(`最高 ${max}以下`);
  if (min !== null && !isNaN(min)) parts.push(`最高 ${min}以上`);
  if (parts.length > 0) return `看護師が決めた目安：${parts.join("・")} mmHg`;
  return "看護師が決めた目安：未設定";
 }
 if (chartType === "pulse") {
  const max = (resident.pulse_max != null && resident.pulse_max !== "") ? Number(resident.pulse_max) : null;
  const min = (resident.pulse_min != null && resident.pulse_min !== "") ? Number(resident.pulse_min) : null;
  const parts = [];
  if (max !== null && !isNaN(max)) parts.push(`${max}以下`);
  if (min !== null && !isNaN(min)) parts.push(`${min}以上`);
  if (parts.length > 0) return `看護師が決めた目安：${parts.join("・")} 回/分`;
  return "看護師が決めた目安：未設定";
 }
 if (chartType === "spo2") {
  const min = (resident.spo2_min != null && resident.spo2_min !== "") ? Number(resident.spo2_min) : null;
  if (min !== null && !isNaN(min)) return `看護師が決めた目安：${min}%以上`;
  return "看護師が決めた目安：未設定";
 }
 return "看護師が決めた目安：未設定";
}

function cpChangeVitalPeriod(period) {
 gVitalChartPeriod = period;
 renderPersonalVitalChart();
}

function cpShiftVitalPeriod(delta) {
 if (!gVitalChartAnchorDate) {
  gVitalChartAnchorDate = (gState && gState.selectedDate) || new Date().toISOString().slice(0, 10);
 }
 const d = new Date(gVitalChartAnchorDate + "T00:00:00");
 if (isNaN(d.getTime())) return;
 if (gVitalChartPeriod === "1w") {
  d.setDate(d.getDate() + delta * 7);
 } else if (gVitalChartPeriod === "1m") {
  d.setMonth(d.getMonth() + delta);
 } else if (gVitalChartPeriod === "3m") {
  d.setMonth(d.getMonth() + delta * 3);
 }
 const fmt = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
 gVitalChartAnchorDate = fmt(d);
 renderPersonalVitalChart();
}

function cpResetVitalPeriod() {
 gVitalChartAnchorDate = (gState && gState.selectedDate) || new Date().toISOString().slice(0, 10);
 gVitalChartPeriod = "1w";
 renderPersonalVitalChart();
}

function cpSelectVitalPoint(encodedJson) {
 try {
  gVitalChartSelectedPoint = JSON.parse(decodeURIComponent(encodedJson));
 } catch (e) {
  gVitalChartSelectedPoint = null;
 }
 cpRenderVitalPointDetail();
}

function cpRenderVitalPointDetail() {
 const box = document.getElementById("personalVitalDetailBox");
 if (!box) return;
 if (!gVitalChartSelectedPoint) {
  box.innerHTML = `<span style="font-size:13px; color:var(--ink-3);">グラフ上の点をクリックまたはタップすると、測定日時・値・記録者の詳細が表示されます。</span>`;
  return;
 }
 const p = gVitalChartSelectedPoint;
 // [Claude修正] 「正常範囲」は医療の判断になるので使わない。目安がない項目は「未設定」と出す
 const exceedTag = p.exceeded
  ? `<span style="display:inline-block; font-size:13px; font-weight:bold; color:var(--alert); background:var(--alert-tint); padding:2px 8px; border-radius:4px; border:1px solid var(--alert); margin-left:8px;">看護師が決めた目安を超えています（上限より上、または下限より下）</span>`
  : (p.has_limit
   ? `<span style="display:inline-block; font-size:13px; color:var(--pine); background:var(--pine-tint); padding:2px 8px; border-radius:4px; border:1px solid var(--pine-light); margin-left:8px;">看護師が決めた目安の範囲内</span>`
   : `<span style="display:inline-block; font-size:13px; color:var(--ink-2); background:var(--surface); padding:2px 8px; border-radius:4px; border:1px solid var(--line); margin-left:8px;">看護師が決めた目安：未設定</span>`);

 box.innerHTML = `
  <div style="display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:8px;">
   <div>
    <span style="font-size:13px; font-weight:bold; color:var(--pine-dark); margin-right:12px;">【測定詳細】</span>
    <span style="font-size:13px; color:var(--ink); margin-right:12px;">日時: <strong>${escapeHtml(p.date)} ${escapeHtml(p.time || "--:--")}</strong></span>
    <span style="font-size:13px; color:var(--ink); margin-right:12px;">項目: <strong>${escapeHtml(p.label)} ${escapeHtml(String(p.val))} ${escapeHtml(p.unit)}</strong></span>
    <span style="font-size:13px; color:var(--ink);">記録者: <strong>${escapeHtml(p.staff_name || "未記録")}</strong></span>
    ${exceedTag}
   </div>
   <button type="button" class="btn btn-secondary" onclick="gVitalChartSelectedPoint=null; cpRenderVitalPointDetail();" style="font-size:13px; padding:2px 8px; background:var(--surface); border:1px solid var(--line); color:var(--ink-2); border-radius:4px; cursor:pointer;">
    閉じる
   </button>
  </div>
 `;
}

function cpBuildVitalSvgChart(chartType, resident, vitalsList, startDate, endDate) {
 const width = 560;
 const height = 220;
 const padLeft = 45;
 const padRight = 20;
 const padTop = 25;
 const padBottom = 35;
 const plotWidth = width - padLeft - padRight;
 const plotHeight = height - padTop - padBottom;

 const startMs = new Date(startDate + "T00:00:00").getTime();
 const endMs = new Date(endDate + "T23:59:59").getTime();
 const spanMs = Math.max(1, endMs - startMs);

 const calcX = (dateStr, timeStr) => {
  const t = timeStr ? (timeStr.length === 5 ? timeStr + ":00" : timeStr) : "12:00:00";
  const ms = new Date(`${dateStr}T${t}`).getTime();
  const frac = Math.max(0, Math.min(1, (ms - startMs) / spanMs));
  return padLeft + frac * plotWidth;
 };

 const linesData = [];
 if (chartType === "temperature") {
  const series = [];
  vitalsList.forEach(v => {
   if (v.temperature != null && v.temperature !== "" && !isNaN(v.temperature)) {
    const val = Number(v.temperature);
    series.push({
     date: v.date,
     time: v.time,
     val: val,
     type: "temperature",
     label: "体温",
     unit: "℃",
     staff_name: v.staff_name || "",
     exceeded: cpIsVitalExceedingLimit("temperature", val, resident)
    });
   }
  });
  linesData.push({ key: "temperature", color: "var(--pine)", series: series });
 } else if (chartType === "bp") {
  const sHigh = [];
  const sLow = [];
  vitalsList.forEach(v => {
   if (v.bp_high != null && v.bp_high !== "" && !isNaN(v.bp_high)) {
    const val = Number(v.bp_high);
    sHigh.push({
     date: v.date,
     time: v.time,
     val: val,
     type: "bp_high",
     label: "最高血圧",
     unit: "mmHg",
     staff_name: v.staff_name || "",
     exceeded: cpIsVitalExceedingLimit("bp_high", val, resident)
    });
   }
   if (v.bp_low != null && v.bp_low !== "" && !isNaN(v.bp_low)) {
    const val = Number(v.bp_low);
    sLow.push({
     date: v.date,
     time: v.time,
     val: val,
     type: "bp_low",
     label: "最低血圧",
     unit: "mmHg",
     staff_name: v.staff_name || "",
     exceeded: cpIsVitalExceedingLimit("bp_low", val, resident)
    });
   }
  });
  linesData.push({ key: "bp_high", color: "var(--pine)", series: sHigh, label: "最高" });
  linesData.push({ key: "bp_low", color: "var(--secondary-color)", series: sLow, label: "最低" });
 } else if (chartType === "pulse") {
  const series = [];
  vitalsList.forEach(v => {
   if (v.pulse != null && v.pulse !== "" && !isNaN(v.pulse)) {
    const val = Number(v.pulse);
    series.push({
     date: v.date,
     time: v.time,
     val: val,
     type: "pulse",
     label: "脈拍",
     unit: "回/分",
     staff_name: v.staff_name || "",
     exceeded: cpIsVitalExceedingLimit("pulse", val, resident)
    });
   }
  });
  linesData.push({ key: "pulse", color: "var(--pine)", series: series });
 } else if (chartType === "spo2") {
  const series = [];
  vitalsList.forEach(v => {
   if (v.spo2 != null && v.spo2 !== "" && !isNaN(v.spo2)) {
    const val = Number(v.spo2);
    series.push({
     date: v.date,
     time: v.time,
     val: val,
     type: "spo2",
     label: "SpO2",
     unit: "%",
     staff_name: v.staff_name || "",
     exceeded: cpIsVitalExceedingLimit("spo2", val, resident)
    });
   }
  });
  linesData.push({ key: "spo2", color: "var(--pine)", series: series });
 }

 let allVals = [];
 linesData.forEach(ld => {
  ld.series.forEach(pt => allVals.push(pt.val));
 });

 const nurseGuides = [];
 if (resident) {
  if (chartType === "temperature" && resident.temp_max != null && resident.temp_max !== "" && !isNaN(resident.temp_max)) {
   nurseGuides.push({ val: Number(resident.temp_max), label: `目安上限 ${resident.temp_max}℃` });
  }
  if (chartType === "bp") {
   if (resident.bp_high_max != null && resident.bp_high_max !== "" && !isNaN(resident.bp_high_max)) {
    nurseGuides.push({ val: Number(resident.bp_high_max), label: `目安上限 ${resident.bp_high_max}` });
   }
   if (resident.bp_high_min != null && resident.bp_high_min !== "" && !isNaN(resident.bp_high_min)) {
    nurseGuides.push({ val: Number(resident.bp_high_min), label: `目安下限 ${resident.bp_high_min}` });
   }
  }
  if (chartType === "pulse") {
   if (resident.pulse_max != null && resident.pulse_max !== "" && !isNaN(resident.pulse_max)) {
    nurseGuides.push({ val: Number(resident.pulse_max), label: `目安上限 ${resident.pulse_max}` });
   }
   if (resident.pulse_min != null && resident.pulse_min !== "" && !isNaN(resident.pulse_min)) {
    nurseGuides.push({ val: Number(resident.pulse_min), label: `目安下限 ${resident.pulse_min}` });
   }
  }
  if (chartType === "spo2" && resident.spo2_min != null && resident.spo2_min !== "" && !isNaN(resident.spo2_min)) {
   nurseGuides.push({ val: Number(resident.spo2_min), label: `目安下限 ${resident.spo2_min}%` });
  }
 }

 let yMin = 0;
 let yMax = 100;
 let yStep = 10;
 if (chartType === "temperature") {
  yMin = 35.0;
  yMax = 38.5;
  yStep = 0.5;
 } else if (chartType === "bp") {
  yMin = 50;
  yMax = 180;
  yStep = 30;
 } else if (chartType === "pulse") {
  yMin = 50;
  yMax = 120;
  yStep = 20;
 } else if (chartType === "spo2") {
  yMin = 88;
  yMax = 100;
  yStep = 2;
 }

 const allConsiderVals = [...allVals, ...nurseGuides.map(g => g.val)];
 if (allConsiderVals.length > 0) {
  const minV = Math.min(...allConsiderVals);
  const maxV = Math.max(...allConsiderVals);
  if (minV < yMin) yMin = Math.floor(minV);
  if (maxV > yMax) yMax = Math.ceil(maxV);
 }
 if (yMax <= yMin) yMax = yMin + 5;

 const calcY = val => {
  const frac = (val - yMin) / (yMax - yMin);
  return padTop + (1 - Math.max(0, Math.min(1, frac))) * plotHeight;
 };

 const gridLinesSvg = [];
 const yLabelsSvg = [];
 for (let yv = yMin; yv <= yMax + 0.0001; yv += yStep) {
  const y = calcY(yv);
  gridLinesSvg.push(`<line x1="${padLeft}" y1="${y}" x2="${padLeft + plotWidth}" y2="${y}" stroke="var(--line-2)" stroke-width="1" />`);
  const dispVal = (chartType === "temperature") ? yv.toFixed(1) : Math.round(yv);
  yLabelsSvg.push(`<text x="${padLeft - 6}" y="${y + 4}" text-anchor="end" font-size="13" fill="var(--ink-3)">${dispVal}</text>`);
 }

 const xTicksSvg = [];
 const startD = new Date(startDate + "T00:00:00");
 const endD = new Date(endDate + "T00:00:00");
 const diffDays = Math.round((endD.getTime() - startD.getTime()) / (1000 * 60 * 60 * 24));
 const stepDays = diffDays <= 7 ? 1 : (diffDays <= 31 ? 5 : 15);

 for (let i = 0; i <= diffDays; i += stepDays) {
  const curD = new Date(startD);
  curD.setDate(curD.getDate() + i);
  const ym = `${String(curD.getMonth() + 1).padStart(2, "0")}/${String(curD.getDate()).padStart(2, "0")}`;
  const x = padLeft + (i / Math.max(1, diffDays)) * plotWidth;
  gridLinesSvg.push(`<line x1="${x}" y1="${padTop}" x2="${x}" y2="${padTop + plotHeight}" stroke="var(--line-2)" stroke-width="1" stroke-dasharray="2,2" />`);
  xTicksSvg.push(`<text x="${x}" y="${padTop + plotHeight + 18}" text-anchor="middle" font-size="13" fill="var(--ink-3)">${ym}</text>`);
 }

 const guidesSvg = [];
 nurseGuides.forEach(g => {
  const y = calcY(g.val);
  guidesSvg.push(`
   <line x1="${padLeft}" y1="${y}" x2="${padLeft + plotWidth}" y2="${y}" stroke="var(--alert)" stroke-width="1.5" stroke-dasharray="4,4" />
   <text x="${padLeft + plotWidth - 4}" y="${y - 4}" text-anchor="end" font-size="13" fill="var(--alert)" font-weight="bold">${escapeHtml(g.label)}</text>
  `);
 });

 const seriesSvg = [];
 linesData.forEach(ld => {
  if (ld.series.length > 1) {
   const pts = ld.series.map(pt => `${calcX(pt.date, pt.time)},${calcY(pt.val)}`).join(" ");
   seriesSvg.push(`<polyline points="${pts}" fill="none" stroke="${ld.color}" stroke-width="2" />`);
  }
  ld.series.forEach(pt => {
   const px = calcX(pt.date, pt.time);
   const py = calcY(pt.val);
   pt.has_limit = cpHasVitalLimit(pt.type, resident);
   // [Claude修正] encodeURIComponent は ' を変えないので、onclick='…' が途中で切れないように %27 にする
   const enc = encodeURIComponent(JSON.stringify(pt)).replace(/'/g, "%27");
   const tip = `${pt.date} ${pt.time || ""} ${pt.label}: ${pt.val} ${pt.unit} (記録者: ${pt.staff_name || "未記録"})${pt.exceeded ? " [目安注意]" : ""}`;
   if (pt.exceeded) {
    seriesSvg.push(`
     <g onclick="cpSelectVitalPoint('${enc}')" style="cursor:pointer;">
      <title>${escapeHtml(tip)}</title>
      <polygon points="${px},${py - 6} ${px + 6},${py} ${px},${py + 6} ${px - 6},${py}" fill="var(--alert)" stroke="var(--surface)" stroke-width="1.5" />
      <circle cx="${px}" cy="${py}" r="12" fill="none" pointer-events="all" />
     </g>
    `);
   } else {
    seriesSvg.push(`
     <g onclick="cpSelectVitalPoint('${enc}')" style="cursor:pointer;">
      <title>${escapeHtml(tip)}</title>
      <circle cx="${px}" cy="${py}" r="4.5" fill="${ld.color}" stroke="var(--surface)" stroke-width="1.5" />
      <circle cx="${px}" cy="${py}" r="12" fill="none" pointer-events="all" />
     </g>
    `);
   }
  });
 });

 const emptySvg = (allVals.length === 0)
  ? `<text x="${width / 2}" y="${height / 2}" text-anchor="middle" font-size="13" fill="var(--ink-3)">期間内の測定記録はありません</text>`
  : "";

 return `
  <svg viewBox="0 0 ${width} ${height}" style="width:100%; height:auto; display:block; max-width:100%; overflow:visible;" aria-label="バイタルグラフ">
   <rect x="0" y="0" width="${width}" height="${height}" fill="var(--surface)" />
   <rect x="${padLeft}" y="${padTop}" width="${plotWidth}" height="${plotHeight}" fill="none" stroke="var(--line)" stroke-width="1" />
   ${gridLinesSvg.join("")}
   ${yLabelsSvg.join("")}
   ${xTicksSvg.join("")}
   ${guidesSvg.join("")}
   ${seriesSvg.join("")}
   ${emptySvg}
  </svg>
 `;
}

function renderPersonalVitalChart() {
 const area = document.getElementById("personalVitalChartArea");
 if (!area) return;

 const resId = gState ? gState.selectedResidentId : null;
 const resident = (gState && Array.isArray(gState.residents)) ? gState.residents.find(r => r.id === resId) : null;

 if (!resident) {
  area.innerHTML = "";
  return;
 }

 const selDate = (gState && gState.selectedDate) || new Date().toISOString().slice(0, 10);
 if (gVitalChartLastResId !== resId || gVitalChartLastSelDate !== selDate || !gVitalChartAnchorDate) {
  if (gVitalChartLastResId !== resId) gVitalChartSelectedPoint = null;
  gVitalChartLastResId = resId;
  gVitalChartLastSelDate = selDate;
  gVitalChartAnchorDate = selDate;
 }

 const range = cpGetVitalChartRange(gVitalChartAnchorDate, gVitalChartPeriod);
 // [Claude修正] db は let で作られていて window.db には載っていない。window.db を見ていたので、実際の画面では点が1つも出ていなかった
 const rawVitals = (typeof db !== "undefined" && db && db.data && Array.isArray(db.data.vitals)) ? db.data.vitals : [];
 const vitals = rawVitals.filter(v =>
  v &&
  Number(v.resident_id) === Number(resident.id) &&
  !v.voided &&
  v.date >= range.startDate &&
  v.date <= range.endDate
 );

 vitals.sort((a, b) => {
  if (a.date !== b.date) return a.date.localeCompare(b.date);
  return (a.time || "").localeCompare(b.time || "");
 });

 const periodLabel = (gVitalChartPeriod === "1m") ? "1か月" : ((gVitalChartPeriod === "3m") ? "3か月" : "1週間");
 const rangeText = `${range.startDate} 〜 ${range.endDate} (${periodLabel})`;

 const btnStyleActive = "font-size:13px; padding:4px 10px; background:var(--pine); color:var(--surface); border:1px solid var(--pine); border-radius:4px; font-weight:bold; cursor:pointer;";
 const btnStyleInactive = "font-size:13px; padding:4px 10px; background:var(--surface); color:var(--ink-2); border:1px solid var(--line); border-radius:4px; cursor:pointer;";
 const navBtnStyle = "font-size:13px; padding:4px 10px; background:var(--surface); color:var(--pine-dark); border:1px solid var(--line); border-radius:4px; font-weight:bold; cursor:pointer;";

 const svgTemp = cpBuildVitalSvgChart("temperature", resident, vitals, range.startDate, range.endDate);
 const svgBp = cpBuildVitalSvgChart("bp", resident, vitals, range.startDate, range.endDate);
 const svgPulse = cpBuildVitalSvgChart("pulse", resident, vitals, range.startDate, range.endDate);
 const svgSpo2 = cpBuildVitalSvgChart("spo2", resident, vitals, range.startDate, range.endDate);

 area.innerHTML = `
  <div style="background:var(--ground); border:1px solid var(--line); border-radius:8px; padding:12px; margin-bottom:14px;">
   <!-- グラフヘッダー: 期間・移動ナビゲーション -->
   <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
     <span style="font-size:15px; font-weight:bold; color:var(--pine-dark);">📈 バイタルの推移グラフ</span>
     <span style="font-size:13px; color:var(--ink-2); background:var(--surface); border:1px solid var(--line); padding:2px 8px; border-radius:4px;">${escapeHtml(rangeText)}</span>
    </div>
    <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
     <button type="button" onclick="cpShiftVitalPeriod(-1)" style="${navBtnStyle}" title="前の期間へ">◀ 前へ</button>
     <button type="button" onclick="cpChangeVitalPeriod('1w')" style="${gVitalChartPeriod === '1w' ? btnStyleActive : btnStyleInactive}">1週間</button>
     <button type="button" onclick="cpChangeVitalPeriod('1m')" style="${gVitalChartPeriod === '1m' ? btnStyleActive : btnStyleInactive}">1か月</button>
     <button type="button" onclick="cpChangeVitalPeriod('3m')" style="${gVitalChartPeriod === '3m' ? btnStyleActive : btnStyleInactive}">3か月</button>
     <button type="button" onclick="cpShiftVitalPeriod(1)" style="${navBtnStyle}" title="次の期間へ">次へ ▶</button>
     <button type="button" onclick="cpResetVitalPeriod()" style="font-size:13px; padding:4px 8px; background:var(--surface); color:var(--ink-3); border:1px solid var(--line); border-radius:4px; cursor:pointer;" title="選択日を末尾にする">選択日に戻す</button>
    </div>
   </div>

   <!-- 測定詳細表示ボックス -->
   <div id="personalVitalDetailBox" style="background:var(--surface-2); border:1px dashed var(--line); border-radius:6px; padding:8px 12px; margin-bottom:12px;">
    <span style="font-size:13px; color:var(--ink-3);">グラフ上の点をクリックまたはタップすると、測定日時・値・記録者の詳細が表示されます。</span>
   </div>

   <!-- 4つの折れ線グラフカード (2x2 グリッド・レスポンシブ) -->
   <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:12px;">
    <!-- 1. 体温 -->
    <div style="background:var(--surface); border:1px solid var(--line); border-radius:6px; padding:10px 12px;">
     <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; margin-bottom:6px; gap:4px;">
      <span style="font-weight:bold; font-size:14px; color:var(--pine-dark);">🌡️ 体温 (℃)</span>
      <span style="font-size:13px; color:var(--ink-2);">${escapeHtml(cpGetVitalLimitText("temperature", resident))}</span>
     </div>
     ${svgTemp}
    </div>

    <!-- 2. 最高 / 最低血圧 -->
    <div style="background:var(--surface); border:1px solid var(--line); border-radius:6px; padding:10px 12px;">
     <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; margin-bottom:6px; gap:4px;">
      <div style="display:flex; align-items:center; gap:8px;">
       <span style="font-weight:bold; font-size:14px; color:var(--pine-dark);">🩸 血圧 (mmHg)</span>
       <span style="font-size:13px; color:var(--pine);">● 最高</span>
       <span style="font-size:13px; color:var(--secondary-color);">● 最低</span>
      </div>
      <span style="font-size:13px; color:var(--ink-2);">${escapeHtml(cpGetVitalLimitText("bp", resident))}</span>
     </div>
     ${svgBp}
    </div>

    <!-- 3. 脈拍 -->
    <div style="background:var(--surface); border:1px solid var(--line); border-radius:6px; padding:10px 12px;">
     <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; margin-bottom:6px; gap:4px;">
      <span style="font-weight:bold; font-size:14px; color:var(--pine-dark);">💓 脈拍 (回/分)</span>
      <span style="font-size:13px; color:var(--ink-2);">${escapeHtml(cpGetVitalLimitText("pulse", resident))}</span>
     </div>
     ${svgPulse}
    </div>

    <!-- 4. SpO2 -->
    <div style="background:var(--surface); border:1px solid var(--line); border-radius:6px; padding:10px 12px;">
     <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; margin-bottom:6px; gap:4px;">
      <span style="font-weight:bold; font-size:14px; color:var(--pine-dark);">🫁 SpO2 (%)</span>
      <span style="font-size:13px; color:var(--ink-2);">${escapeHtml(cpGetVitalLimitText("spo2", resident))}</span>
     </div>
     ${svgSpo2}
    </div>
   </div>

   <!-- 体重タブへの案内とボタン -->
   <div style="background:var(--surface-2); border:1px solid var(--line); border-radius:6px; padding:10px 14px; margin-top:12px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
    <span style="font-size:13px; color:var(--ink-2);">※ 体重は「体重」タブに折れ線グラフがあります。</span>
    <button type="button" class="btn btn-secondary" onclick="if(typeof switchCareTab==='function')switchCareTab('weight');" style="font-size:13px; padding:6px 12px; background:var(--surface); border:1px solid var(--line); color:var(--pine); border-radius:4px; cursor:pointer;">
     体重のタブへ移動
    </button>
   </div>
  </div>
 `;
 // [Claude修正] ほかの端末の保存などで描き直しても、選んだ点の詳細を消さない
 if (gVitalChartSelectedPoint) cpRenderVitalPointDetail();
}

window.cpAddDaysToStr = cpAddDaysToStr;
window.cpGetVitalChartRange = cpGetVitalChartRange;
window.cpIsVitalExceedingLimit = cpIsVitalExceedingLimit;
window.cpHasVitalLimit = cpHasVitalLimit;
window.cpGetVitalLimitText = cpGetVitalLimitText;
window.cpChangeVitalPeriod = cpChangeVitalPeriod;
window.cpShiftVitalPeriod = cpShiftVitalPeriod;
window.cpResetVitalPeriod = cpResetVitalPeriod;
window.cpSelectVitalPoint = cpSelectVitalPoint;
window.cpRenderVitalPointDetail = cpRenderVitalPointDetail;
window.cpBuildVitalSvgChart = cpBuildVitalSvgChart;
window.renderPersonalVitalChart = renderPersonalVitalChart;
