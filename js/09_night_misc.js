// 7. 夜勤体位変換 トグル解除 ＆ 一括確定 (個人記録自動転記)
gState.nightTurnDate = null;
gState.nightTurnDrafts = null;

function initNightTurnDrafts(force) {
 if (!force && gState.nightTurnDate === gState.selectedDate && gState.nightTurnDrafts !== null) {
 return;
 }
 gState.nightTurnDate = gState.selectedDate;
 gState.nightTurnDrafts = {};
  // [Antigravity実装 2026-10-15] 夜勤体位変換の様子・特変メモの初期化
  gState.nightTurnNotes = {};
 const turns = (db.data.turns || []).filter(t => !t.voided && t.date === gState.selectedDate);
 turns.forEach(t => {
 gState.nightTurnDrafts[`${t.resident_id}_${t.time}`] = t.action;
    if (t.note) gState.nightTurnNotes[`${t.resident_id}_${t.time}`] = t.note;
 });
}

// [Claude修正] 夜間の巡視・体位変換は、解除しても消さずに「取消」として残す（理由必須）。連動した巡視の介護記録も取消にする
function cpActiveTurnsForDate(date) {
 return (db.data.turns || []).filter(t => !t.voided && t.date === date);
}

function cpVoidTurns(list, reason) {
 const now = toLocalDateTimeStr(new Date());
 const by = cpLedgerStaff();
 list.forEach(t => {
 t.voided = true; t.voided_at = now; t.voided_by = by; t.void_reason = reason;
 (db.data.care_records || []).forEach(rec => {
 // [Claude修正 2026-10-15] 特変は、このチェックから自動で作った記録（auto_night_turn）だけを取消す。同じ時刻に職員が手で書いた特変は取消さない
 if (!rec.voided && (rec.category === "巡視" || (rec.category === "特変" && rec.auto_night_turn)) && rec.resident_id === t.resident_id && rec.recorded_at === `${t.date} ${t.time}`) {
 rec.voided = true; rec.voided_at = now; rec.voided_by = by; rec.void_reason = `巡視チェックの解除: ${reason}`;
 }
 });
 });
}

function cpAskTurnVoidReason(count) {
 const reason = prompt(`保存済みの巡視・体位変換のチェック ${count}件を解除します。\n記録は消えずに、取消済みとして残ります。\n\n解除の理由を入力してください (例: 押し間違い、別の方の欄に入れた)`, "");
 if (reason === null) return null;
 if (!reason.trim()) { alert("解除の理由を入力してください。解除は行っていません。"); return null; }
 return reason.trim();
}

// [Antigravity実装 2026-10-15] 夜勤体位変換の様子・特変メモを保持
function cpSetNightTurnNote(resId, time, note) {
  if (!gState.nightTurnNotes) gState.nightTurnNotes = {};
  gState.nightTurnNotes[`${resId}_${time}`] = note;
  const el = document.getElementById(`night_note_${resId}_${time}`);
  if (el && el.value !== note) el.value = note;
}

function setNightTurnAction(resId, time, action) {
 const key = `${resId}_${time}`;
 if (!gState.nightTurnDrafts) gState.nightTurnDrafts = {};
 if (!action) {
 toggleNightTurnAction(resId, time);
 return;
 }
 gState.nightTurnDrafts[key] = action;
 renderNightTable();
}

function toggleNightTurnAction(resId, time) {
 const key = `${resId}_${time}`;
 const saved = cpActiveTurnsForDate(gState.selectedDate).filter(t => t.resident_id === resId && t.time === time);
 if (saved.length > 0) {
 const reason = cpAskTurnVoidReason(saved.length);
 if (reason === null) { renderNightTable(); return; }
 cpVoidTurns(saved, reason);
 db.save();
 loadDateRecords(gState.selectedDate);
 }
 if (gState.nightTurnDrafts) delete gState.nightTurnDrafts[key];
 renderNightTable();
}

function clearAllNightTurnsForDate() {
 if (!confirm(`${gState.selectedDate} の夜間体位変換・巡視チェックを全て解除しますか？`)) return;
 const saved = cpActiveTurnsForDate(gState.selectedDate);
 if (saved.length > 0) {
 const reason = cpAskTurnVoidReason(saved.length);
 if (reason === null) return;
 cpVoidTurns(saved, reason);
 db.save();
 loadDateRecords(gState.selectedDate);
 }
 gState.nightTurnDrafts = {};
 renderNightTable();
 alert(`${gState.selectedDate} の体位変換チェックをすべて解除しました。（保存済みの分は取消として残っています）`);
}

// [Claude修正] まとめて保存: 前の保存分は消さない。新しく付けたチェックだけ記録し、外した・変えたチェックは理由を書いて取消にする。
// 以前は保存のたびに日付分を全部消して作り直していたため、前の記録者名・時刻が保存した人に書き換わっていた
function submitNightTurnsBatch() {
  // [Antigravity実装 2026-10-15] 入力欄から最新の様子・特変メモを収集
  if (!gState.nightTurnNotes) gState.nightTurnNotes = {};
  document.querySelectorAll('input[id^="night_note_"]').forEach(inp => {
    const k = inp.id.replace("night_note_", "");
    gState.nightTurnNotes[k] = inp.value; // [Claude修正 2026-10-15] 空にしたときも反映する（前の文が残らないように）
  });
 const staff = document.getElementById("currentStaff").value;
 const date = gState.selectedDate;
 if (!Array.isArray(db.data.turns)) db.data.turns = [];
 const drafts = gState.nightTurnDrafts || {};
 const active = cpActiveTurnsForDate(date);

 const toVoid = active.filter(t => drafts[`${t.resident_id}_${t.time}`] !== t.action);
 if (toVoid.length > 0) {
 const reason = cpAskTurnVoidReason(toVoid.length);
 if (reason === null) return;
 cpVoidTurns(toVoid, reason);
 }

 const added = [];
 const lateNotes = []; // [Claude修正 2026-10-15] 保存済みのチェックにあとから書いた様子
 Object.keys(drafts).forEach(key => {
 const action = drafts[key];
 if (!action) return;
 const parts = key.split("_");
 const resId = parseInt(parts[0], 10);
 const time = parts[1];
 const savedSame = cpActiveTurnsForDate(date).find(t => t.resident_id === resId && t.time === time && t.action === action);
 if (savedSame) {
  // [Claude修正 2026-10-15] 保存済みのチェックに、あとから「様子・特変」を書き足したときは、その分だけ特変として残す
  // （以前は「新しく保存するチェックはありませんでした」となり、書いた様子が保存されなかった）
  const lateNote = (gState.nightTurnNotes && gState.nightTurnNotes[key]) ? gState.nightTurnNotes[key].trim() : "";
  if (lateNote && lateNote !== (savedSame.note || "")) {
   savedSame.note = lateNote;
   lateNotes.push({ resId: resId, time: time, action: action, note: lateNote });
  }
  return; // チェック自体は保存済みのまま
 }
 db.data.turns.push({
 id: Date.now() + Math.floor(Math.random() * 1000),
 date: date,
 time: time,
 resident_id: resId,
 action: action,
      note: (gState.nightTurnNotes && gState.nightTurnNotes[key]) ? gState.nightTurnNotes[key].trim() : "", // [Antigravity実装 2026-10-15]
 staff_name: staff
 });
    const curNote = (gState.nightTurnNotes && gState.nightTurnNotes[key]) ? gState.nightTurnNotes[key].trim() : "";
    added.push({ resId: resId, time: time, action: action, note: curNote }); // [Antigravity実装 2026-10-15]
 });

 const tpls = getNightTurnTemplates();
 let totalRecordsCreated = 0;
 added.forEach((item, index) => {
 const r = gState.residents.find(x => x.id === item.resId);
 if (!r || cpStatusOn(r, date) !== "在所") return; // 安全ガード: 入院中・不在の利用者は巡視記録の自動生成から除外
 const tpl = tpls[item.action] || DEFAULT_NIGHT_TURN_TEMPLATES[item.action] || `【{time} 定時巡視・体位変換】訪室確認。${item.action}実施。`;
    let contentText = tpl.replace(/\{time\}/g, item.time).replace(/\{action\}/g, item.action);
    // [Antigravity実装 2026-10-15] 書いたときは自動定型文の後ろに「【様子】（書いた内容）」を付与
    if (item.note) {
      contentText += ` 【様子】${item.note}`;
    }
 db.data.care_records.unshift({
 id: Date.now() + Math.floor(Math.random() * 100000) + index,
 recorded_at: `${date} ${item.time}`,
 resident_id: item.resId,
 category: "巡視",
 content: contentText,
 staff_name: staff,
 auto_night_turn: true
 });
 totalRecordsCreated++;
    // [Antigravity実装 2026-10-15] 同じ時刻・同じ内容で category:"特変" の記録も1件作成し特変一覧に表示
    if (item.note) {
      db.data.care_records.unshift({
        id: Date.now() + Math.floor(Math.random() * 100000) + index + 50000,
        recorded_at: `${date} ${item.time}`,
        resident_id: item.resId,
        category: "特変",
        content: contentText,
        staff_name: staff,
        auto_night_turn: true
      });
    }
 });

 // [Claude修正 2026-10-15] あとから書いた様子は、特変として1件ずつ残す（巡視の記録は書き換えない）
 lateNotes.forEach((item, index) => {
  const r = gState.residents.find(x => x.id === item.resId);
  if (!r || cpStatusOn(r, date) !== "在所") return;
  db.data.care_records.unshift({
   id: Date.now() + Math.floor(Math.random() * 100000) + index + 70000,
   recorded_at: `${date} ${item.time}`,
   resident_id: item.resId,
   category: "特変",
   content: `【${item.time} 定時巡視・${item.action}】【様子】${item.note}`,
   staff_name: staff,
   auto_night_turn: true
  });
  totalRecordsCreated++;
 });

 db.save();
 initNightTurnDrafts(true);
 renderNightTable();
 loadDateRecords(date);
 if (totalRecordsCreated > 0) {
 alert(lateNotes.length ? `保存しました（新しいチェック ${added.length}回分、あとから書いた様子 ${lateNotes.length}件を特変として記録）。` : `体位変換・夜間巡視のチェック（新しく付けた${totalRecordsCreated}回分）を保存・カルテへ転記しました！`); // [Claude修正 2026-10-15]
 } else if (toVoid.length > 0) {
 alert("外したチェックを取消として保存しました。");
 } else {
 alert("新しく保存するチェックはありませんでした。");
 }
}

function renderNightTable() {
 const tbody = document.querySelector("#nightTable tbody");
 if (!tbody) return;
  // [Antigravity実装 2026-10-15] 再描画前に入力中のメモを保持
  if (!gState.nightTurnNotes) gState.nightTurnNotes = {};
  document.querySelectorAll('input[id^="night_note_"]').forEach(inp => {
    const k = inp.id.replace("night_note_", "");
    gState.nightTurnNotes[k] = inp.value; // [Claude修正 2026-10-15] 空にしたときも反映する（前の文が残らないように）
  });
 tbody.innerHTML = "";
 if (gState.nightTurnDate !== gState.selectedDate || gState.nightTurnDrafts === null) {
 initNightTurnDrafts();
 }

 const times = ["22:00", "00:00", "02:00", "04:00", "06:00"];
 const activeTurns = cpActiveTurnsForDate(gState.selectedDate);

 cpResidentsOn(gState.selectedDate).forEach(r => {
 const isHospital = cpStatusOn(r, gState.selectedDate) !== "在所";
 const tr = document.createElement("tr");

 if (isHospital) {
 tr.style.background = "#f6f8f6";
 tr.style.opacity = "0.7";
 const cells = times.map(() => `<td style="text-align:center; color:#94a19a; font-size:11px;">(対象外)</td>`).join("");
 tr.innerHTML = `
 <td>${r.room_no}</td>
 <td><strong>${escapeHtml(r.name)} 様</strong> <span class="badge" style="background:#5f6d66; color:#fff; font-size:10px; margin-left:4px;">${escapeHtml(r.status)}</span></td>
 ${cells}
 `;
 tbody.appendChild(tr);
 return;
 }

    const cells = times.map(tm => {
      const key = `${r.id}_${tm}`;
      const curAction = gState.nightTurnDrafts[key];
      const curNote = (gState.nightTurnNotes && gState.nightTurnNotes[key]) || "";
      const savedTurn = activeTurns.find(t => t.resident_id === r.id && t.time === tm);
      // [Antigravity実装 2026-10-15] 各利用者・各時刻のチェックに任意で「様子・特変」を書ける欄を配置
      const noteInpHtml = `<input type="text" id="night_note_${r.id}_${tm}" class="form-control" placeholder="様子・特変" value="${escapeHtml(curNote)}" style="font-size:10.5px; padding:2px 4px; margin-top:3px; width:100%; min-width:85px; max-width:130px; box-sizing:border-box;" oninput="cpSetNightTurnNote(${r.id}, '${tm}', this.value)">`;
      if (curAction) {
        // [Antigravity実装 2026-10-16] 保存済みの体位変換には「記入済み」・中身・書いた人・時刻と訂正ボタンを表示
        const savedInfoHtml = savedTurn
          ? `<div style="font-size:10px; color:#15803d; margin-top:2px; line-height:1.3;">
              <span style="background:#dcfce7; border:1px solid #86efac; padding:0 4px; border-radius:3px; font-weight:bold;">記入済み</span>
              ${escapeHtml(savedTurn.staff_name || "未記録")} (${escapeHtml(savedTurn.time || tm)})
              ${savedTurn.edit_history && savedTurn.edit_history.length ? `<span style="color:#b45309;">[訂正${savedTurn.edit_history.length}]</span>` : ""}
              <button type="button" class="btn btn-secondary" style="font-size:9.5px; padding:1px 4px; margin-left:2px;" onclick="editSavedNightTurn(${Number(savedTurn.id)})">訂正</button>
            </div>`
          : `<div style="font-size:10px; color:#b45309; margin-top:2px;">未保存(選択中)</div>`;
        return `
        <td style="text-align:center; vertical-align:top; padding:4px 3px;">
          <button class="btn btn-secondary" style="background:#dcfce7; color:#15803d; border:1px solid #86efac; font-weight:bold; font-size:11px; padding:3px 6px; width:100%; max-width:130px;" onclick="toggleNightTurnAction(${r.id}, '${tm}')" title="クリックで取消">
            ${escapeHtml(curAction)} 
          </button>
          ${savedInfoHtml}
          ${noteInpHtml}
        </td>
        `;
      }
      return `
      <td style="vertical-align:top; padding:4px 3px;">
        <select class="form-control" style="font-size:11px; padding:2px; width:100%; max-width:130px;" onchange="setNightTurnAction(${r.id}, '${tm}', this.value)">
          <option value="">選択</option>
          <option value="安眠中">安眠中</option>
          <option value="左側臥位">左側臥位</option>
          <option value="右側臥位">右側臥位</option>
          <option value="仰臥位">仰臥位</option>
          <option value="おむつ交換">おむつ交換</option>
        </select>
        ${noteInpHtml}
      </td>
      `;
    }).join("");

 tr.innerHTML = `
 <td>${r.room_no}</td>
 <td><strong>${r.name} 様</strong></td>
 ${cells}
 `;
 tbody.appendChild(tr);
 });
}

// [Antigravity実装 2026-10-16] 保存済みの体位変換記録の訂正（理由必須・edit_history保存・同じidの中身を書き換え）
function editSavedNightTurn(turnId) {
 const t = (db.data.turns || []).find(x => Number(x.id) === Number(turnId));
 if (!t || t.voided) return;
 const res = gState.residents.find(r => r.id === t.resident_id);
 const newAction = prompt(`【${res ? res.name + " 様" : ""} ${t.time}】体位変換・巡視の内容を入力してください\n(安眠中 / 左側臥位 / 右側臥位 / 仰臥位 / おむつ交換):`, t.action || "");
 if (newAction === null) return;
 if (!newAction.trim()) {
  alert("内容を入力してください（解除する場合はボタンをクリックして取消してください）。");
  return;
 }
 const newNote = prompt(`様子・特変メモを入力してください（空欄可）:`, t.note || "");
 if (newNote === null) return;
 if (newAction.trim() === (t.action || "") && newNote.trim() === (t.note || "")) {
  alert("変更された内容がありません。");
  return;
 }
 const reason = cpPromptEditReason(`${t.time}の体位変換記録`, `${t.action}${t.note ? " (" + t.note + ")" : ""}`);
 if (reason === null) return;

 const oldCopy = JSON.parse(JSON.stringify(t));
 t.action = newAction.trim();
 t.note = newNote.trim();
 t.staff_name = cpLedgerStaff();
 cpAppendEditHistory(t, oldCopy, ["action", "note"], reason);

 // 連動している自動巡視記録も更新
 const tpls = getNightTurnTemplates();
 const tpl = tpls[t.action] || DEFAULT_NIGHT_TURN_TEMPLATES[t.action] || `【{time} 定時巡視・体位変換】訪室確認。${t.action}実施。`;
 let contentText = tpl.replace(/\{time\}/g, t.time).replace(/\{action\}/g, t.action);
 if (t.note) contentText += ` 【様子】${t.note}`;
 (db.data.care_records || []).forEach(rec => {
  if (!rec.voided && rec.auto_night_turn && rec.resident_id === t.resident_id && rec.recorded_at === `${t.date} ${t.time}`) {
   const oldRec = JSON.parse(JSON.stringify(rec));
   rec.content = contentText;
   rec.staff_name = t.staff_name;
   cpAppendEditHistory(rec, oldRec, ["content"], reason);
  }
 });

 db.save();
 initNightTurnDrafts(true);
 loadDateRecords(gState.selectedDate);
 alert("体位変換・巡視の記録を訂正しました。");
}

function saveNightTurn(resId, time, action) {
 setNightTurnAction(resId, time, action);
}

// 8. 月次体重 (前月比 ＆ 前々月比 ＆ 1年推移グラフ)
function renderWeightTable() {
 const tbody = document.querySelector("#weightTable tbody");
 if (!tbody) return;
 tbody.innerHTML = "";
 const records = db.data.weight_records || [];
 
 const [y, m] = gState.currentMonth.split("-").map(Number);
 const prevDate = new Date(y, m - 2, 1);
 const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
 const prev2Date = new Date(y, m - 3, 1);
 const prev2Month = `${prev2Date.getFullYear()}-${String(prev2Date.getMonth() + 1).padStart(2, "0")}`;

 cpResidentsOn(gState.selectedDate).forEach(r => {
 const currentRec = records.filter(w => w.resident_id === r.id && (w.month === gState.currentMonth || (w.date && w.date.startsWith(gState.currentMonth)))).sort((a,b) => b.id - a.id)[0];
 const prevRec = records.filter(w => w.resident_id === r.id && (w.month === prevMonth || (w.date && w.date.startsWith(prevMonth)))).sort((a,b) => b.id - a.id)[0];
 const prev2Rec = records.filter(w => w.resident_id === r.id && (w.month === prev2Month || (w.date && w.date.startsWith(prev2Month)))).sort((a,b) => b.id - a.id)[0];

 // 前月比
 let diffDisplay = "-";
 if (currentRec && prevRec) {
 const diff = (currentRec.weight - prevRec.weight).toFixed(1);
 const diffNum = parseFloat(diff);
 const diffStr = diffNum > 0 ? `+${diff} kg` : (diffNum < 0 ? `${diff} kg` : `±0.0 kg`);
 const color = diffNum > 0 ? '#16a34a' : (diffNum < 0 ? '#dc2626' : '#5f6d66');
			let alertBadge = "";
			if (diffNum <= -2.0) {
				alertBadge = `<span style="display:inline-block; font-size:10.5px; background:#fee2e2; color:#991b1b; padding:1px 5px; border-radius:4px; font-weight:bold; margin-left:4px;">急減注意</span>`;
			} else if (diffNum >= 2.0) {
				alertBadge = `<span style="display:inline-block; font-size:10.5px; background:#f1f6f3; color:#1e5b47; padding:1px 5px; border-radius:4px; font-weight:bold; margin-left:4px;">急増注意</span>`;
			}
			diffDisplay = `<strong style="color:${color}; font-size:13px;">${diffStr}</strong> <span style="font-size:11px; color:var(--text-muted);">(${prevRec.weight}k)</span>${alertBadge}`;
 } else if (currentRec) {
 diffDisplay = `<span style="font-size:11px; color:var(--text-muted);">- (前月なし)</span>`;
 } else if (prevRec) {
 diffDisplay = `<span style="font-size:11px; color:var(--text-muted);">前月: ${prevRec.weight}k</span>`;
 }

 // 前々月比
 let diff2Display = "-";
 if (currentRec && prev2Rec) {
 const diff2 = (currentRec.weight - prev2Rec.weight).toFixed(1);
 const diff2Num = parseFloat(diff2);
 const diff2Str = diff2Num > 0 ? `+${diff2} kg` : (diff2Num < 0 ? `${diff2} kg` : `±0.0 kg`);
 const color2 = diff2Num > 0 ? '#16a34a' : (diff2Num < 0 ? '#dc2626' : '#5f6d66');
 diff2Display = `<strong style="color:${color2}; font-size:13px;">${diff2Str}</strong> <span style="font-size:11px; color:var(--text-muted);">(${prev2Rec.weight}k)</span>`;
 } else if (currentRec) {
 diff2Display = `<span style="font-size:11px; color:var(--text-muted);">-</span>`;
 }

 const currentVal = currentRec ? currentRec.weight : "";

 const tr = document.createElement("tr");
 tr.innerHTML = `
 <td>${r.room_no}</td>
 <td><strong>${r.name} 様</strong></td>
 <td>${gState.currentMonth}</td>
 <td><input type="number" step="0.1" class="form-control" style="width:90px;" id="wVal_${r.id}" value="${currentVal}"></td>
 <td>${diffDisplay}</td>
 <td>${diff2Display}</td>
 <td><button class="btn btn-primary" style="padding:4px 10px; font-size:12px;" onclick="saveWeight(${r.id})">測定登録</button></td>
 `;
 tbody.appendChild(tr);
 });

 renderWeightChart();
}

function renderWeightChart(selectedResId = null) {
 const container = document.getElementById("weightChartContainer");
 if (!container) return;

 const targetResId = selectedResId || gState.selectedResidentId || (gState.residents[0] ? gState.residents[0].id : 1);
 const targetRes = gState.residents.find(r => r.id === targetResId);
 const records = (db.data.weight_records || []).filter(w => w.resident_id === targetResId);

 // 過去12ヶ月の月リスト生成 (例: 2025-11 〜 2026-10)
 const [curY, curM] = gState.currentMonth.split("-").map(Number);
 const months = [];
 for (let i = 11; i >= 0; i--) {
 const d = new Date(curY, curM - 1 - i, 1);
 months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
 }

 // 各月の最新体重を取得
 const points = months.map(mStr => {
 const rec = records.filter(w => (w.month === mStr || (w.date && w.date.startsWith(mStr)))).sort((a,b) => b.id - a.id)[0];
 return { month: mStr, weight: rec ? rec.weight : null };
 });

 // 利用者切り替えボタン
 const resButtons = cpCurrentResidents().map(r => `
 <button class="btn ${r.id === targetResId ? 'btn-primary' : 'btn-secondary'}" style="padding:3px 10px; font-size:12px;" onclick="renderWeightChart(${r.id})">
 ${r.room_no}号室 ${r.name}様
 </button>
 `).join("");

 // グラフ描画用スケール計算
 const validWeights = points.filter(p => p.weight !== null).map(p => p.weight);
 const minW = validWeights.length > 0 ? Math.floor(Math.min(...validWeights) - 2) : 40;
 const maxW = validWeights.length > 0 ? Math.ceil(Math.max(...validWeights) + 2) : 70;
 const range = maxW - minW || 10;

 const svgW = 760;
 const svgH = 220;
 const padL = 50;
 const padR = 30;
 const padT = 30;
 const padB = 40;
 const graphW = svgW - padL - padR;
 const graphH = svgH - padT - padB;

 // グリッド線
 let gridLines = "";
 const steps = 4;
 for (let s = 0; s <= steps; s++) {
 const val = (minW + (range / steps) * s).toFixed(1);
 const yPos = padT + graphH - (s / steps) * graphH;
 gridLines += `
 <line x1="${padL}" y1="${yPos}" x2="${svgW - padR}" y2="${yPos}" stroke="#dfe5e1" stroke-dasharray="3,3" />
 <text x="${padL - 8}" y="${yPos + 4}" font-size="11" fill="#5f6d66" text-anchor="end">${val}kg</text>
 `;
 }

 // 折れ線と点
 let pathD = "";
 let dotsHtml = "";
 let monthLabelsHtml = "";
 const numPts = points.length;

 points.forEach((pt, idx) => {
 const xPos = padL + (idx / (numPts - 1)) * graphW;
 const shortM = pt.month.slice(5) + "月";
 monthLabelsHtml += `<text x="${xPos}" y="${svgH - padB + 18}" font-size="11" fill="#4a5852" text-anchor="middle">${shortM}</text>`;

 if (pt.weight !== null) {
 const yPos = padT + graphH - ((pt.weight - minW) / range) * graphH;
 if (!pathD) {
 pathD = `M ${xPos} ${yPos}`;
 } else {
 pathD += ` L ${xPos} ${yPos}`;
 }
 dotsHtml += `
 <circle cx="${xPos}" cy="${yPos}" r="5" fill="#1e5b47" stroke="#ffffff" stroke-width="2" />
 <text x="${xPos}" y="${yPos - 9}" font-size="11" font-weight="bold" fill="#173f33" text-anchor="middle">${Number(pt.weight).toFixed(1)}kg</text>
 `;
 }
 });

 container.innerHTML = `
 <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
 <div style="font-weight:bold; font-size:14px; color:#173f33;">
 過去1年間の体重推移グラフ (${targetRes ? `${targetRes.name} 様` : ''})
 </div>
 <div style="display:flex; gap:6px; flex-wrap:wrap;">
 ${resButtons}
 </div>
 </div>
 <div style="overflow-x:auto;">
 <svg viewBox="0 0 ${svgW} ${svgH}" style="width:100%; max-width:${svgW}px; height:auto; background:#f6f8f6; border-radius:6px; display:block;">
 ${gridLines}
 ${pathD ? `<path d="${pathD}" fill="none" stroke="#1e5b47" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />` : ''}
 ${dotsHtml}
 ${monthLabelsHtml}
 </svg>
 </div>
 `;
}

function saveWeight(resId) {
 const r = gState.residents.find(x => x.id === resId);
 const inputEl = document.getElementById(`wVal_${resId}`);
 if (!r || !inputEl) return;

 const w = parseFloat(inputEl.value.trim());
 if (isNaN(w) || w <= 0 || w > 300) {
 alert("正しい体重の数値（例: 52.4）を入力してください。");
 return;
 }

 // 前月データ取得して前月比を計算
 const records = db.data.weight_records || [];
 const [y, m] = gState.currentMonth.split("-").map(Number);
 const prevDate = new Date(y, m - 2, 1);
 const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
 const prevRec = records.filter(item => item.resident_id === resId && (item.month === prevMonth || (item.date && item.date.startsWith(prevMonth)))).sort((a,b) => b.id - a.id)[0];

 let diffStr = "";
 if (prevRec) {
 const diff = (w - prevRec.weight).toFixed(1);
 const diffNum = parseFloat(diff);
 diffStr = diffNum > 0 ? `+${diff}kg` : (diffNum < 0 ? `${diff}kg` : `±0.0kg`);
 }

 const staff = document.getElementById("currentStaff").value;
 const tm = new Date().toTimeString().slice(0, 5);

 db.data.weight_records.unshift({
 id: Date.now(),
 date: gState.selectedDate,
 month: gState.currentMonth,
 resident_id: resId,
 weight: w,
 diff_prev: diffStr || null,
 staff_name: staff
 });

 // 個人記録（介護記録）へ自動転記
 const diffNote = diffStr ? ` (前月比: ${diffStr})` : "";
 db.data.care_records.unshift({
 id: Date.now() + 1,
 recorded_at: `${gState.selectedDate} ${tm}`,
 resident_id: resId,
 category: "測定",
 content: `月次体重測定: ${w.toFixed(1)}kg${diffNote}`,
 staff_name: staff
 });

 db.save();
 renderWeightTable();
 loadDateRecords(gState.selectedDate);
 alert(`${r.name} 様の体重（${w.toFixed(1)}kg${diffNote}）を登録しました！個人記録へ自動転記されました。`);
}

// 9. シーツ交換チェック (利用者切り替え ＆ 取消機能)
function renderLinenTable() {
 const r = gState.residents.find(x => x.id === gState.selectedResidentId);
 const resNameEl = document.getElementById("linenResidentName");
 if (resNameEl) resNameEl.textContent = r ? r.name : "利用者";

 // 利用者セレクトボックスの同期
 const sel = document.getElementById("linenResidentSelect");
 if (sel) {
   sel.innerHTML = "";
   cpResidentsOn(gState.selectedDate).forEach(res => {
     const opt = document.createElement("option");
     opt.value = res.id;
     opt.textContent = `${res.room_no}号室 ${res.name} 様 (${res.status})`;
     if (res.id === gState.selectedResidentId) opt.selected = true;
     sel.appendChild(opt);
   });
 }

 const tbody = document.querySelector("#linenTable tbody");
 if (!tbody) return;
 tbody.innerHTML = "";
 const linens = cpLedgerOrder((db.data.linens || []).filter(l => l.date === gState.selectedDate));

 if (linens.length === 0) {
   tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:16px;">本日のシーツ・リネン交換記録はありません。上のボタンから記録できます。</td></tr>`;
   return;
 }

 linens.forEach(l => {
   const res = gState.residents.find(x => x.id === l.resident_id);
   const tr = document.createElement("tr");
   const actionHtml = l.voided
     ? `<div style="font-size:11px; color:#991b1b; font-weight:bold;">取消済</div><div style="font-size:10.5px; color:#5f6d66; white-space:normal;">${escapeHtml(l.voided_at || '')} ${escapeHtml(l.voided_by || '')}<br>理由: ${escapeHtml(l.void_reason || '-')}</div>`
     : `<button type="button" class="btn btn-secondary" style="font-size:11px; padding:2px 8px; color:#dc2626; border-color:#fca5a5;" onclick="deleteLinenRecord(${l.id})">取消</button>`;
   tr.innerHTML = `
     <td>${escapeHtml(l.date || '')}</td>
     <td><strong>${res ? escapeHtml(res.room_no + '号室 ' + res.name + ' 様') : '-'}</strong></td>
     <td><span style="font-weight:bold; color:#0284c7; background:#e0f2fe; padding:2px 8px; border-radius:4px;">${escapeHtml(l.exchange_type || '')}</span></td>
     <td>${escapeHtml(l.notes || '-')}</td>
     <td>${escapeHtml(l.staff_name || '-')}</td>
     <td style="text-align:center;">${actionHtml}</td>
   `;
   if (l.voided) cpMarkVoidedRow(tr);
   tbody.appendChild(tr);
 });
}

function changeLinenResident(resId) {
 selectResident(Number(resId));
}

function saveLinen(type) {
 const staff = document.getElementById("currentStaff").value;
 const tm = new Date().toTimeString().slice(0, 5);
 const r = gState.residents.find(x => x.id === gState.selectedResidentId);
 const linenId = Date.now();

 db.data.linens.unshift({
   id: linenId,
   date: gState.selectedDate,
   resident_id: gState.selectedResidentId,
   exchange_type: type,
   notes: "",
   staff_name: staff
 });

 // 個人記録へ自動転記 (連動IDを持たせる)
 db.data.care_records.unshift({
   id: linenId + 1,
   recorded_at: `${gState.selectedDate} ${tm}`,
   resident_id: gState.selectedResidentId,
   category: "環境整備",
   content: `シーツ・リネン交換 (${type}) 実施`,
   staff_name: staff,
   source_linen_id: linenId
 });

 db.save();
 loadDateRecords(gState.selectedDate);
 alert(`${r ? r.name : '利用者'}様のシーツ交換（${type}）を記録しました！個人記録へ自動転記されました。`);
}

function deleteLinenRecord(linenId) {
 const target = (db.data.linens || []).find(l => l.id === linenId);
 if (!target) return;
 const res = gState.residents.find(x => x.id === target.resident_id);
 const resName = res ? res.name + " 様" : "対象利用者";

 if (target.voided) return;
 // [Claude修正] シーツ交換記録と連動した介護記録は、消さずに「取消」として残す（理由必須）
 const reason = prompt(`${resName}のシーツ交換記録（${target.exchange_type}）を「取消」にします。\n連動した介護記録も取消になります。記録は消えずに残ります。\n\n取消の理由を入力してください (例: 押し間違い、別の方の記録)`, "");
 if (reason === null) return;
 if (!reason.trim()) { alert("取消の理由を入力してください。取消は行っていません。"); return; }
 const now = toLocalDateTimeStr(new Date());
 const by = cpLedgerStaff();
 target.voided = true; target.voided_at = now; target.voided_by = by; target.void_reason = reason.trim();
 (db.data.care_records || []).forEach(c => {
 if (c.source_linen_id === linenId && !c.voided) {
 c.voided = true; c.voided_at = now; c.voided_by = by; c.void_reason = `シーツ交換記録の取消: ${reason.trim()}`;
 }
 });

 db.save();
 loadDateRecords(gState.selectedDate);
 alert(`${resName}のシーツ交換記録を取り消しました。`);
}

// 10. 身だしなみチェック
function renderGroomingTable() {
 const tbody = document.querySelector("#groomingTable tbody");
 tbody.innerHTML = "";
 const groomings = (db.data.groomings || []).filter(g => g.date === gState.selectedDate);

 cpResidentsOn(gState.selectedDate).forEach(r => {
 const g = groomings.find(x => x.resident_id === r.id);
 const tr = document.createElement("tr");
 tr.innerHTML = `
 <td>${r.room_no}</td>
 <td><strong>${r.name} 様</strong></td>
 <td><label><input type="checkbox" id="gNail_${r.id}" ${g && g.nail_done ? 'checked' : ''}> 爪切り済</label></td>
 <td><label><input type="checkbox" id="gShave_${r.id}" ${g && g.shave_done ? 'checked' : ''}> 髭剃り済</label></td>
 <td><label><input type="checkbox" id="gEar_${r.id}" ${g && g.ear_done ? 'checked' : ''}> 耳掃除済</label></td>
 <td><input type="text" id="gNotes_${r.id}" class="form-control" style="font-size:12px;" value="${g ? g.notes : ''}"></td>
 <td><button class="btn btn-primary" style="padding:4px 10px; font-size:12px;" onclick="saveGrooming(${r.id})">保存</button></td>
 `;
 tbody.appendChild(tr);
 });
}

function saveGrooming(resId) {
 const nail = document.getElementById(`gNail_${resId}`).checked ? 1 : 0;
 const shave = document.getElementById(`gShave_${resId}`).checked ? 1 : 0;
 const ear = document.getElementById(`gEar_${resId}`).checked ? 1 : 0;
 const notes = document.getElementById(`gNotes_${resId}`).value;
 const staff = document.getElementById("currentStaff").value;

 let existing = (db.data.groomings || []).find(g => g.date === gState.selectedDate && g.resident_id === resId);
 if (existing) {
 const cpOldGroom = Object.assign({}, existing);
 existing.nail_done = nail;
 existing.shave_done = shave;
 existing.ear_done = ear;
 existing.notes = notes;
 existing.staff_name = staff;
 cpAppendEditHistory(existing, cpOldGroom, ["nail_done", "shave_done", "ear_done", "notes"]);
 } else {
 db.data.groomings.push({
 id: Date.now(), date: gState.selectedDate, resident_id: resId, nail_done: nail, shave_done: shave, ear_done: ear, notes: notes, staff_name: staff
 });
 }
 db.save();
 loadDateRecords(gState.selectedDate);
 alert("身だしなみチェックを保存しました！");
}

function submitGroomingsBatch() {
 const staff = document.getElementById("currentStaff").value;
 const nowTm = new Date().toTimeString().slice(0, 5);
 let savedCount = 0;

 cpResidentsOn(gState.selectedDate).forEach(r => {
 const nailEl = document.getElementById(`gNail_${r.id}`);
 const shaveEl = document.getElementById(`gShave_${r.id}`);
 const earEl = document.getElementById(`gEar_${r.id}`);
 const notesEl = document.getElementById(`gNotes_${r.id}`);
 if (!nailEl || !shaveEl || !earEl) return;

 const nail = nailEl.checked ? 1 : 0;
 const shave = shaveEl.checked ? 1 : 0;
 const ear = earEl.checked ? 1 : 0;
 const notes = notesEl ? notesEl.value.trim() : "";

 if (nail || shave || ear || notes) {
 let existing = (db.data.groomings || []).find(g => g.date === gState.selectedDate && g.resident_id === r.id);
 if (existing) {
 const cpOldGroom = Object.assign({}, existing);
 existing.nail_done = nail;
 existing.shave_done = shave;
 existing.ear_done = ear;
 existing.notes = notes;
 existing.staff_name = staff;
 cpAppendEditHistory(existing, cpOldGroom, ["nail_done", "shave_done", "ear_done", "notes"]);
 } else {
 db.data.groomings.push({
 id: Date.now() + Math.floor(Math.random() * 1000),
 date: gState.selectedDate,
 resident_id: r.id,
 nail_done: nail,
 shave_done: shave,
 ear_done: ear,
 notes: notes,
 staff_name: staff
 });
 }

 const parts = [];
 if (nail) parts.push("爪切り");
 if (shave) parts.push("髭剃り");
 if (ear) parts.push("耳掃除");
 if (notes) parts.push(`特記:${notes}`);
 
 db.data.care_records.unshift({
 id: Date.now() + Math.floor(Math.random() * 10000),
 recorded_at: `${gState.selectedDate} ${nowTm}`,
 resident_id: r.id,
 category: "身だしなみ",
 content: `身だしなみケア実施: ${parts.join(", ")}`,
 staff_name: staff
 });
 savedCount++;
 }
 });

 db.save();
 renderGroomingTable();
 loadDateRecords(gState.selectedDate);
 alert(`身だしなみチェックを一括確定しました（${savedCount}名分のケアを個人記録へ転記完了）！`);
}

// 11. レク履歴
function renderRecreationTable() {
	const tbody = document.querySelector("#recreationTable tbody");
	if (!tbody) return;
	tbody.innerHTML = "";
	const list = db.data.recreations || [];
	if (list.length === 0) {
		tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:var(--text-muted); padding:16px;">レクリエーション実施記録はありません。</td></tr>`;
		return;
	}
	cpLedgerOrder(list).forEach(rec => {
		const tr = document.createElement("tr");
		tr.innerHTML = `
			<td>${escapeHtml(rec.date || '')}</td>
			<td><span class="badge" style="background:#f1f6f3; color:#1e5b47;">${escapeHtml(rec.program_type || '機能訓練')}</span></td>
			<td><strong>${escapeHtml(rec.title || '')}</strong></td>
			<td>${rec.participants_count ? `${escapeHtml(String(rec.participants_count))}名` : '-'}</td>
			<td>${escapeHtml(rec.content || '-')}</td>
			<td style="color:#1c2622;">${escapeHtml(rec.reaction || '-')}</td>
			<td>${escapeHtml(rec.notes || '-')}</td>
			<td>${escapeHtml(rec.staff_name || '担当')}</td>
			<td style="text-align:center; white-space:nowrap;">
				${cpLedgerActions('recreations', rec, 'openRecreationModal')}
			</td>
		`;
		if (rec.voided) cpMarkVoidedRow(tr);
		tbody.appendChild(tr);
	});
}

function openRecreationModal(editId = null) {
	const idEl = document.getElementById("recEditId");
	const dateEl = document.getElementById("recDate");
	const typeEl = document.getElementById("recType");
	const titleEl = document.getElementById("recTitle");
	const partEl = document.getElementById("recParticipants");
	const contEl = document.getElementById("recContent");
	const reactEl = document.getElementById("recReaction");
	const notesEl = document.getElementById("recNotes");

	if (editId) {
		const rec = (db.data.recreations || []).find(r => r.id === editId);
		if (!rec) return;
		idEl.value = rec.id;
		dateEl.value = rec.date || toLocalDateStr(new Date());
		typeEl.value = rec.program_type || "";
		titleEl.value = rec.title || "";
		partEl.value = rec.participants_count || "";
		contEl.value = rec.content || "";
		reactEl.value = rec.reaction || "";
		notesEl.value = rec.notes || "";
	} else {
		idEl.value = "";
		dateEl.value = gState.selectedDate || toLocalDateStr(new Date());
		typeEl.value = "";
		titleEl.value = "";
		partEl.value = "";
		contEl.value = "";
		reactEl.value = "";
		notesEl.value = "";
	}
	openModal("recreationModal");
}

function submitRecreationRecord() {
	const editId = document.getElementById("recEditId")?.value;
	const date = document.getElementById("recDate")?.value;
	if (!cpRequireSelect("recType", "レクの種類")) return;
	const type = document.getElementById("recType")?.value;
	const title = document.getElementById("recTitle")?.value.trim();
	const part = document.getElementById("recParticipants")?.value;
	const cont = document.getElementById("recContent")?.value.trim();
	const react = document.getElementById("recReaction")?.value.trim();
	const notes = document.getElementById("recNotes")?.value.trim();
	const staff = document.getElementById("currentStaff")?.value || "担当職員";

	if (!date || !title) {
		alert("実施日とプログラム名を入力してください。");
		return;
	}

	if (!Array.isArray(db.data.recreations)) db.data.recreations = [];

	if (editId) {
		const rec = db.data.recreations.find(r => r.id === Number(editId));
		if (rec) {
			const cpOld = Object.assign({}, rec); // [Claude修正] 訂正前の内容を履歴に残す
			rec.date = date; rec.program_type = type; rec.title = title;
			rec.participants_count = part; rec.content = cont; rec.reaction = react;
			rec.notes = notes;
			cpAppendEditHistory(rec, cpOld, ["date", "program_type", "title", "participants_count", "content", "reaction", "notes"]);
			// [Claude修正] 記録者は最初の記録者のまま残し、訂正者は別に記録する
			if (!rec.staff_name) rec.staff_name = staff;
			rec.updated_by = staff; rec.updated_at = toLocalDateTimeStr(new Date());
		}
	} else {
		db.data.recreations.unshift({
			id: Date.now(), date: date, program_type: type, title: title,
			participants_count: part, content: cont, reaction: react,
			notes: notes, staff_name: staff
		});
	}

	db.save();
	closeModal("recreationModal");
	renderRecreationTable();
	alert("レクリエーション実施記録を保存しました！");
}

function deleteRecreationRecord(id) {
	// [Claude修正] 削除せず取消にする
	cpVoidLedgerRecord('recreations', id);
}
// 12. 面会 ＆ 荷物受付
function submitVisitation() {
 const visitor = document.getElementById("visitVisitor").value.trim();
 const items = document.getElementById("visitItems").value.trim();
 const storage = document.getElementById("visitStorage").value.trim();
 const notes = document.getElementById("visitNotes").value.trim();
 const staff = document.getElementById("currentStaff").value;
 const now = new Date();
 const nowStr = `${toLocalDateStr(now)} ${now.toTimeString().slice(0, 5)}`;

 if (!visitor) {
 alert("面会者のお名前・続柄を入力してください。");
 return;
 }

 db.data.visitations.unshift({
 id: Date.now(), recorded_at: nowStr, resident_id: gState.selectedResidentId,
 visitor_name: visitor, items: items, storage_place: storage, notes: notes, staff_name: staff
 });

 // 個人記録へ自動転記
 db.data.care_records.unshift({
 id: Date.now() + 1, recorded_at: nowStr, resident_id: gState.selectedResidentId, category: "面会",
 content: `ご面会 (${visitor}様)。持参品: ${items} (保管: ${storage})。${notes}`, staff_name: staff
 });

 db.save();

 document.getElementById("visitVisitor").value = "";
 document.getElementById("visitItems").value = "";
 document.getElementById("visitStorage").value = "";
 document.getElementById("visitNotes").value = "";
 loadDateRecords(gState.selectedDate);
 alert("面会・差し入れ荷物を登録しました！個人記録へ自動転記されました。");
}



// 日々申し送りの確認状況チェック (追記・更新判定付き)
function getDailyNotebookConfirmationStatus(nb, currentStaff) {
	if (!currentStaff) return { confirmed: false, hasNewUpdate: false };

	const lastUpdated = nb.last_updated_at || nb.created_at;
	if (nb.confirmed_versions && nb.confirmed_versions[currentStaff]) {
		const confirmedTime = nb.confirmed_versions[currentStaff];
		if (lastUpdated && confirmedTime < lastUpdated) {
			return { confirmed: false, hasNewUpdate: true };
		}
		return { confirmed: true, hasNewUpdate: false };
	}

	const isConfirmed = Array.isArray(nb.confirmed_staff) && nb.confirmed_staff.includes(currentStaff);
	if (isConfirmed && nb.last_updated_at) {
		if (nb.last_updated_by === currentStaff) {
			return { confirmed: true, hasNewUpdate: false };
		}
		return { confirmed: false, hasNewUpdate: true };
	}

	return { confirmed: isConfirmed, hasNewUpdate: false };
}

// 13. 連絡・申送り ＆ 月間業務連絡表
function renderNotebook() {
	renderMonthlyNotices();

	const list = document.getElementById("notebookList");
	if (!list) return;
	list.innerHTML = "";
	const notebooks = (db.data.notebooks || []).filter(nb => !nb.voided && nb.date === gState.selectedDate); // [Claude修正] 取消済みは表示しない（データには残る）
	const activeStaff = cpLoginStaffName();

	if (notebooks.length === 0) {
		list.innerHTML = '<p style="font-size:13px; color:var(--ink-3); padding:10px 0;">本日の引継ぎ・申し送り事項はありません。</p>';
	} else {
		notebooks.forEach(nb => {
			const stStatus = getDailyNotebookConfirmationStatus(nb, activeStaff);

			const card = document.createElement("div");
			card.style.background = stStatus.confirmed ? "#f6f8f6" : (nb.status === "未対応" ? "#ffffff" : "#f0fdf4");
			card.style.border = stStatus.hasNewUpdate ? "2px solid #f59e0b" : (stStatus.confirmed ? "1px solid #cdd6d0" : (nb.status === "未対応" ? "2px solid #1e5b47" : "1px solid #bbf7d0"));
			card.style.borderRadius = "8px";
			card.style.padding = "12px 14px";
			card.style.marginBottom = "10px";
			card.style.boxShadow = stStatus.confirmed ? "none" : "0 2px 5px rgba(37,99,235,0.12)";

			let statusBadgeHtml = "";
			if (stStatus.hasNewUpdate) {
				statusBadgeHtml = `<span class="badge" style="background:#fef3c7; color:#92400e; font-size:11.5px; padding:2px 8px; font-weight:bold; border:1px solid #fde68a;">☐ 追記あり (要再確認)</span>`;
			} else if (stStatus.confirmed) {
				statusBadgeHtml = `<span class="badge" style="background:#dcfce7; color:#166534; font-size:11.5px; padding:2px 8px; font-weight:bold; border:1px solid #86efac;">✓ 確認済み</span>`;
			} else {
				statusBadgeHtml = `<span class="badge" style="background:#fee2e2; color:#991b1b; font-size:11.5px; padding:2px 8px; font-weight:bold; border:1px solid #fca5a5;">☐ 未確認</span>`;
			}

			const taskBadgeHtml = nb.status === '未対応'
				? `<span class="badge" style="background:#fef3c7; color:#92400e; font-size:11px; padding:2px 6px; font-weight:bold;">要対応</span>`
				: `<span class="badge" style="background:#dcfce7; color:#166534; font-size:11px; padding:2px 6px; font-weight:bold;">完了</span>`;

			const confirmedPills = (nb.confirmed_staff && nb.confirmed_staff.length > 0)
				? nb.confirmed_staff.map(s => `<span style="background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd; padding:1px 7px; border-radius:4px; font-size:13px; font-weight:bold; white-space:nowrap;">${escapeHtml(s)}</span>`).join(" ")
				: `<span style="color:var(--ink-3); font-size:13px;">未確認</span>`;

			let updatesHtml = "";
			if (Array.isArray(nb.updates) && nb.updates.length > 0) {
				updatesHtml += `<div style="background:#fffbeb; border:1px solid #fef3c7; border-radius:6px; padding:8px 10px; margin:8px 0 6px 0;">`;
				updatesHtml += `<div style="font-weight:bold; font-size:11.5px; color:#b45309; margin-bottom:4px;"> 【追記・変更事項】 (計 ${nb.updates.length}件)</div>`;
				nb.updates.forEach(u => {
					updatesHtml += `
						<div style="font-size:12px; color:#78350f; margin-top:4px; padding-top:4px; border-top:1px dashed #fde68a;">
							<span style="font-weight:bold; color:#92400e;">[${escapeHtml(u.created_at || '')} 追記 by ${escapeHtml(u.staff_name || '職員')}]:</span>
							<div style="white-space:pre-wrap; margin-top:2px;">${escapeHtml(u.content)}</div>
						</div>
					`;
				});
				updatesHtml += `</div>`;
			}

			card.innerHTML = `
				<div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:8px;">
					<div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
						${taskBadgeHtml}
						${statusBadgeHtml}
						<strong style="font-size:14.5px; color:var(--ink); margin-left:4px;">${escapeHtml(nb.content)}</strong>
					</div>
					<div style="display:flex; gap:6px; align-items:center;">
						<span style="font-size:13px; color:var(--ink-2);">記入: ${escapeHtml(nb.staff_name || '')} ${nb.resolved_staff ? `/ 対応: ${escapeHtml(nb.resolved_staff)}` : ''}</span>
						<button class="btn btn-secondary" style="padding:2px 8px; font-size:11px; color:#1e5b47; border-color:#a9cfbf; background:#f1f6f3;" onclick="openAddDailyNotebookUpdateModal(${nb.id})">＋ 追記</button>
						${nb.status === '未対応' ? `<button class="btn btn-success" style="padding:2px 8px; font-size:11px;" onclick="resolveNotebook(${nb.id})">完了にする</button>` : ''}
						<button class="btn btn-secondary" style="padding:2px 6px; font-size:11px; color:#dc2626; border-color:#fca5a5;" onclick="deleteDailyNotebookItem(${nb.id})">削除</button>
					</div>
				</div>
				${updatesHtml}
				<div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; border-top:1px dashed var(--line); margin-top:8px; padding-top:8px; font-size:13px; line-height:1.6;">
					<div style="display:flex; align-items:center; flex-wrap:wrap; gap:6px; flex:1;">
						<strong style="color:var(--ink-2); white-space:nowrap;">確認済職員:</strong>
						<div style="display:flex; flex-wrap:wrap; gap:4px; align-items:center;">${confirmedPills}</div>
					</div>
					<div>
						${stStatus.hasNewUpdate ? `
							<button class="btn btn-primary" style="padding:4px 14px; font-size:13px; font-weight:bold; background:#d97706; border-color:#b45309;" onclick="confirmDailyNotebookItem(${nb.id})">
								☑ 追記も含めて確認済みにする
							</button>
						` : (stStatus.confirmed ? `
							<button class="btn btn-secondary" style="padding:4px 12px; font-size:13px; background:#dcfce7; color:#166534; border-color:#86efac; font-weight:bold;" onclick="confirmDailyNotebookItem(${nb.id})">
								✓ 確認済み (解除)
							</button>
						` : `
							<button class="btn btn-primary" style="padding:4px 14px; font-size:13px; font-weight:bold; background:#1e5b47; border-color:#1a4f3d;" onclick="confirmDailyNotebookItem(${nb.id})">
								☑ 確認済みにする
							</button>
						`)}
					</div>
				</div>
			`;
			list.appendChild(card);
		});
	}

	renderNotebookStamps();
}

// 月間業務連絡表
// [Claude修正] 同じ名前の関数がもう1つ後ろにあり、こちらは使われていなかった（後ろの定義が有効）ため削除: renderMonthlyNotices

// 一括確認機能（ボタン押下時に全項目に現在の職員名を反映）
// [Claude修正] 同じ名前の関数がもう1つ後ろにあり、こちらは使われていなかった（後ろの定義が有効）ため削除: toggleNotebookStamp


// 日々の申し送りをすべて確認したか判定（単一の判定関数）
function cpHasStaffConfirmedAllNotebookItems(date, staffName) {
	if (!staffName) return false;
	const targetDate = date || gState.selectedDate;
	const items = (db.data.notebooks || []).filter(nb => !nb.voided && nb.date === targetDate);
	if (!items.length) return false;
	return items.every(nb => getDailyNotebookConfirmationStatus(nb, staffName).confirmed);
}

// その日の申し送りをすべて確認した職員の一覧と最終確認時刻を取得
function cpGetConfirmedStaffForDate(date) {
	const targetDate = date || gState.selectedDate;
	const items = (db.data.notebooks || []).filter(nb => !nb.voided && nb.date === targetDate);
	if (!items.length) return [];

	const staffSet = new Set();
	items.forEach(nb => {
		if (Array.isArray(nb.confirmed_staff)) {
			nb.confirmed_staff.forEach(s => { if (s) staffSet.add(s); });
		}
		if (nb.confirmed_versions && typeof nb.confirmed_versions === "object") {
			Object.keys(nb.confirmed_versions).forEach(s => { if (s) staffSet.add(s); });
		}
	});

	const result = [];
	staffSet.forEach(staff => {
		if (cpHasStaffConfirmedAllNotebookItems(targetDate, staff)) {
			let latestStamp = "";
			items.forEach(nb => {
				let t = "";
				if (Array.isArray(nb.confirm_log)) {
					for (let i = nb.confirm_log.length - 1; i >= 0; i--) {
						const log = nb.confirm_log[i];
						if (log && log.by === staff && typeof log.action === "string" && log.action.includes("確認") && !log.action.includes("取消")) {
							t = log.at || "";
							break;
						}
					}
				}
				if (!t && nb.confirmed_versions && nb.confirmed_versions[staff]) {
					t = nb.confirmed_versions[staff];
				}
				if (!t && nb.created_at) {
					t = nb.created_at;
				}
				if (t && (!latestStamp || t > latestStamp)) {
					latestStamp = t;
				}
			});

			let timeFormatted = "";
			if (latestStamp) {
				const m = latestStamp.match(/(\d{2}:\d{2})/);
				if (m) timeFormatted = m[1];
			}

			result.push({
				staff: staff,
				time: timeFormatted,
				timestamp: latestStamp
			});
		}
	});

	result.sort((a, b) => (a.timestamp > b.timestamp ? 1 : (a.timestamp < b.timestamp ? -1 : a.staff.localeCompare(b.staff))));
	return result;
}

function confirmDailyNotebookItem(id) {
	const loginStaff = cpLoginStaffName();
	if (!loginStaff) {
		alert("ログイン中の職員が取得できません。ログインし直してください。");
		return;
	}

	const nb = (db.data.notebooks || []).find(x => x.id === id);
	if (!nb) return;
	if (!Array.isArray(nb.confirmed_staff)) nb.confirmed_staff = [];
	if (!nb.confirmed_versions || typeof nb.confirmed_versions !== "object") nb.confirmed_versions = {};

	const stStatus = getDailyNotebookConfirmationStatus(nb, loginStaff);

	if (stStatus.confirmed) {
		const idx = nb.confirmed_staff.indexOf(loginStaff);
		if (idx !== -1) nb.confirmed_staff.splice(idx, 1);
		delete nb.confirmed_versions[loginStaff];
		cpLogConfirm(nb, loginStaff, "確認を取消");
	} else {
		if (!nb.confirmed_staff.includes(loginStaff)) {
			nb.confirmed_staff.push(loginStaff);
		}
		cpLogConfirm(nb, loginStaff, "確認");
		const now = new Date();
		const stamp = `${toLocalDateStr(now)} ${now.toTimeString().slice(0, 5)}:${String(now.getSeconds()).padStart(2, "0")}`;
		nb.confirmed_versions[loginStaff] = stamp;
	}

	db.save();
	renderNotebook();
}

function openAddDailyNotebookUpdateModal(id) {
	const nb = (db.data.notebooks || []).find(x => x.id === id);
	if (!nb) return;
	document.getElementById("dailyNotebookUpdateParentId").value = id;
	document.getElementById("dailyNotebookUpdateTargetTitle").textContent = nb.content;
	document.getElementById("dailyNotebookUpdateContent").value = "";
	document.getElementById("dailyNotebookUpdateModal").style.display = "flex";
}

function submitDailyNotebookUpdate() {
	const id = parseInt(document.getElementById("dailyNotebookUpdateParentId").value, 10);
	const content = document.getElementById("dailyNotebookUpdateContent").value.trim();
	const currentStaff = document.getElementById("currentStaff") ? document.getElementById("currentStaff").value : "職員";

	if (!content) {
		alert("追記・変更内容を入力してください。");
		return;
	}

	const nb = (db.data.notebooks || []).find(x => x.id === id);
	if (!nb) return;

	if (!Array.isArray(nb.updates)) nb.updates = [];
	const now = new Date();
	const nowStr = `${toLocalDateStr(now)} ${now.toTimeString().slice(0, 5)}`;

	nb.updates.push({
		id: Date.now(),
		staff_name: currentStaff,
		content: content,
		created_at: nowStr
	});

	// [Claude修正 2026-10-16] 確認済みかどうかの比較に使うため秒まで記録する（分単位だと、同じ分に確認した職員に「追記あり」が出なかった。月間業務連絡と同じ直し）
	const stamp = nowStr + ":" + String(now.getSeconds()).padStart(2, "0");
	nb.last_updated_at = stamp;
	nb.last_updated_by = currentStaff;

	if (!nb.confirmed_staff) nb.confirmed_staff = [];
	if (!nb.confirmed_staff.includes(currentStaff)) nb.confirmed_staff.push(currentStaff);
	if (!nb.confirmed_versions) nb.confirmed_versions = {};
	nb.confirmed_versions[currentStaff] = stamp;

	db.save();
	closeModal("dailyNotebookUpdateModal");
	renderNotebook();
	alert("申し送り事項に追記を登録しました。他職員へ再確認が表示されます。");
}

// [Claude修正] 申し送り・業務連絡の「確認」「確認の取消」を、日時つきで記録に残す
function cpLogConfirm(item, staff, action) {
 if (!item) return;
 if (!Array.isArray(item.confirm_log)) item.confirm_log = [];
 item.confirm_log.push({ staff: staff, action: action, at: toLocalDateTimeStr(new Date()) });
}

function deleteDailyNotebookItem(id) {
	// [Claude修正] 申し送りは消さずに「取消」として残す（理由必須）
	const nb = (db.data.notebooks || []).find(x => x.id === id);
	if (!cpVoidRecord(nb, "この申し送り事項")) return;
	db.save();
	renderNotebook();
}

function submitNotebook() {
	const content = document.getElementById("notebookContent").value.trim();
	if (!content) return;
	const staff = document.getElementById("currentStaff").value || "担当職員";
	const now = new Date();
	const nowStr = `${toLocalDateStr(now)} ${now.toTimeString().slice(0, 5)}`;

	if (!Array.isArray(db.data.notebooks)) db.data.notebooks = [];
	db.data.notebooks.unshift({
		id: Date.now(),
		date: gState.selectedDate,
		category: "申し送り",
		content: content,
		status: "未対応",
		staff_name: staff,
		created_at: nowStr,
		resolved_staff: null,
		confirmed_staff: [staff],
		confirmed_versions: { [staff]: nowStr }
	});
	db.save();
	document.getElementById("notebookContent").value = "";
	renderNotebook();
}


function resolveNotebook(id) {
 const staff = document.getElementById("currentStaff").value;
 const nb = db.data.notebooks.find(x => x.id === id);
 if (nb) {
 nb.status = "完了";
 nb.resolved_staff = staff;
 db.save();
 loadDateRecords(gState.selectedDate);
 }
}

// 一括確認は廃止。直接呼ばれた場合もデータ変更せず注意喚起
function toggleNotebookStamp() {
	alert("申し送りは1件ずつ確認してください");
}

// 本日の申し送り確認（確認者一覧）を描く。全項目を確認した職員を自動集計して表示
function renderNotebookStamps() {
	const area = document.getElementById("hankoStampArea");
	if (!area) return;
	area.innerHTML = "";

	const items = (db.data.notebooks || []).filter(nb => !nb.voided && nb.date === gState.selectedDate);
	if (!items.length) {
		area.innerHTML = '<span style="font-size:13px; color:var(--ink-2);">本日の申し送りはありません</span>';
		return;
	}

	const confirmedList = cpGetConfirmedStaffForDate(gState.selectedDate);
	if (!confirmedList.length) {
		area.innerHTML = '<span style="font-size:13px; color:var(--ink-3);">まだ確認した職員はいません。</span>';
		return;
	}

	confirmedList.forEach(x => {
		const badge = document.createElement("span");
		badge.className = "cp-hanko-name";
		badge.style.cursor = "default";
		badge.style.fontSize = "13px";
		const timeHtml = x.time ? ` <span class="cp-hanko-time" style="font-size:13px; color:var(--ink-2); font-weight:normal;">${escapeHtml(x.time)}</span>` : "";
		badge.innerHTML = `${escapeHtml(x.staff)}${timeHtml}`;
		area.appendChild(badge);
	});
}

function stampNotebook() {
 const staff = document.getElementById("currentStaff").value;
 const exists = (db.data.notebook_stamps || []).some(s => !s.voided && s.date === gState.selectedDate && s.staff_name === staff);
 if (!exists) {
 db.data.notebook_stamps.push({ id: Date.now(), date: gState.selectedDate, staff_name: staff, stamped_at: toLocalDateTimeStr(new Date()) });
 db.save();
 loadDateRecords(gState.selectedDate);
 }
}

function removeNotebookStamp(date, staffName) {
 if (confirm(`「${staffName}」の確認を取り消しますか？`)) {
 // [Claude修正] 確認印は消さずに、取り消した日時と職員を残す
 const now = toLocalDateTimeStr(new Date());
 (db.data.notebook_stamps || []).forEach(s => { if (!s.voided && s.date === date && s.staff_name === staffName) { s.voided = true; s.voided_at = now; s.voided_by = cpLedgerStaff(); } });
 db.save();
 loadDateRecords(date);
 }
}


// 月間業務連絡の確認状況チェック (追記・更新判定付き)
function getNoticeConfirmationStatus(n, currentStaff) {
	if (!currentStaff) return { confirmed: false, hasNewUpdate: false };

	const lastUpdated = n.last_updated_at || n.created_at;
	if (n.confirmed_versions && n.confirmed_versions[currentStaff]) {
		const confirmedTime = n.confirmed_versions[currentStaff];
		if (lastUpdated && confirmedTime < lastUpdated) {
			return { confirmed: false, hasNewUpdate: true };
		}
		return { confirmed: true, hasNewUpdate: false };
	}

	const isConfirmed = Array.isArray(n.confirmed_staff) && n.confirmed_staff.includes(currentStaff);
	if (isConfirmed && n.last_updated_at) {
		if (n.last_updated_by === currentStaff) {
			return { confirmed: true, hasNewUpdate: false };
		}
		return { confirmed: false, hasNewUpdate: true };
	}

	return { confirmed: isConfirmed, hasNewUpdate: false };
}


// 月間業務連絡表 (全館・当月1ヶ月間継続掲示・変更事項等)
function renderMonthlyNotices() {
	const container = document.getElementById("monthlyNoticeList");
	const alertArea = document.getElementById("monthlyNoticeAlertArea");
	if (!container) return;
	container.innerHTML = "";
	if (alertArea) alertArea.innerHTML = "";

	const curMonth = (gState.selectedDate || toLocalDateStr(new Date())).slice(0, 7);
	const notices = (db.data.monthly_notices || []).filter(n => !n.voided && n.month === curMonth); // [Claude修正] 取消済みは表示しない（データには残る）
	const currentStaff = (document.getElementById("currentStaff") ? document.getElementById("currentStaff").value : "") || "";

	// 未確認アラート表示
	if (currentStaff && notices.length > 0) {
		const unconfirmed = notices.filter(n => {
			const st = getNoticeConfirmationStatus(n, currentStaff);
			return !st.confirmed;
		});
		if (unconfirmed.length > 0 && alertArea) {
			alertArea.innerHTML = `
			<div style="background:#fee2e2; border:1px solid #fecaca; border-radius:6px; padding:10px 14px; margin-bottom:12px; color:#991b1b; font-size:13px; font-weight:bold;">
				 ${escapeHtml(currentStaff)} さん、${curMonth.split("-")[1]}月分の「見ました」未チェック連絡が <strong>${unconfirmed.length}件</strong> あります。各項目の「☑ 見ました」ボタンを押してください。
			</div>
			`;
		}
	}

	if (notices.length === 0) {
		container.innerHTML = `<p style="font-size:13px; color:var(--text-muted); margin:8px 0;">${curMonth}月の業務連絡はありません。「＋ 業務連絡を追加」から追加できます。</p>`;
		return;
	}

	notices.forEach(n => {
		const stStatus = getNoticeConfirmationStatus(n, currentStaff);
		let prioStyle = "background:#eef2ef; color:#4a5852;";
		if (n.priority === "至急") prioStyle = "background:#fee2e2; color:#991b1b; font-weight:bold;";
		else if (n.priority === "重要") prioStyle = "background:#fef3c7; color:#92400e; font-weight:bold;";

		const confirmedListStr = (n.confirmed_staff || []).length > 0
			? (n.confirmed_staff || []).join("・")
			: "未確認";

		const card = document.createElement("div");
		card.style.background = stStatus.confirmed ? "#f6f8f6" : "#ffffff";
		card.style.border = stStatus.hasNewUpdate ? "2px solid #f59e0b" : (stStatus.confirmed ? "1px solid #cdd6d0" : "2px solid #1e5b47");
		card.style.borderRadius = "8px";
		card.style.padding = "14px 16px";
		card.style.marginBottom = "12px";
		card.style.boxShadow = stStatus.confirmed ? "none" : "0 2px 8px rgba(37,99,235,0.12)";

		let statusBadgeHtml = "";
		if (stStatus.hasNewUpdate) {
			statusBadgeHtml = `<span class="badge" style="background:#fef3c7; color:#92400e; font-size:12px; padding:3px 10px; font-weight:bold; border:1px solid #fde68a;">☐ 追記あり (要再チェック)</span>`;
		} else if (stStatus.confirmed) {
			statusBadgeHtml = `<span class="badge" style="background:#dcfce7; color:#166534; font-size:12px; padding:3px 10px; font-weight:bold; border:1px solid #86efac;">☑ 見ました (確認済)</span>`;
		} else {
			statusBadgeHtml = `<span class="badge" style="background:#fee2e2; color:#991b1b; font-size:12px; padding:3px 10px; font-weight:bold; border:1px solid #fca5a5;">☐ 未確認 (未チェック)</span>`;
		}

		// 追記（Updates）リストのレンダリング
		let updatesHtml = "";
		if (Array.isArray(n.updates) && n.updates.length > 0) {
			updatesHtml += `<div style="background:#fffbeb; border:1px solid #fef3c7; border-radius:6px; padding:10px 12px; margin:10px 0 6px 0;">`;
			updatesHtml += `<div style="font-weight:bold; font-size:12px; color:#b45309; margin-bottom:4px; display:flex; align-items:center; gap:4px;"> 【追記・変更事項】 (計 ${n.updates.length}件)</div>`;
			n.updates.forEach(u => {
				updatesHtml += `
					<div style="font-size:12.5px; color:#78350f; margin-top:6px; padding-top:6px; border-top:1px dashed #fde68a;">
						<span style="font-weight:bold; color:#92400e;">[${escapeHtml(u.created_at || '')} 追記 by ${escapeHtml(u.staff_name || '職員')}]:</span>
						<div style="white-space:pre-wrap; margin-top:2px;">${escapeHtml(u.content)}</div>
					</div>
				`;
			});
			updatesHtml += `</div>`;
		}

		card.innerHTML = `
			<div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:8px;">
				<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
					<span style="font-size:11px; padding:2px 8px; border-radius:4px; ${prioStyle}">［${escapeHtml(n.priority || '通常')}］</span>
					<strong style="font-size:15px; color:#22302b;">${escapeHtml(n.title)}</strong>
					${statusBadgeHtml}
				</div>
				<div style="display:flex; gap:6px; align-items:center;">
					<span style="font-size:11px; color:#5f6d66;">投稿: ${escapeHtml(n.staff_name || '')} (${escapeHtml(n.created_at || '')})</span>
					<button class="btn btn-secondary" style="padding:3px 8px; font-size:11.5px; color:#1e5b47; border-color:#a9cfbf; background:#f1f6f3;" onclick="openAddMonthlyNoticeUpdateModal(${n.id})">＋ 追記を追加</button>
					<button class="btn btn-secondary" style="padding:3px 6px; font-size:11.5px; color:#dc2626; border-color:#fca5a5;" onclick="deleteMonthlyNotice(${n.id})">削除</button>
				</div>
			</div>
			<div style="font-size:14px; line-height:1.7; color:#36443e; margin:10px 0; white-space:pre-wrap;">${escapeHtml(n.content)}</div>
			${updatesHtml}
			<div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; border-top:1px dashed #cdd6d0; padding-top:10px; margin-top:10px; font-size:12.5px;">
				<div style="color:#4a5852;">
					<strong>☑ 「見ました」確認済職員:</strong> <span style="color:#166534; font-weight:bold;">${escapeHtml(confirmedListStr)}</span>
				</div>
				<div>
					${stStatus.hasNewUpdate ? `
						<button class="btn btn-primary" style="padding:6px 18px; font-size:13px; font-weight:bold; background:#d97706; border-color:#b45309;" onclick="confirmMonthlyNotice(${n.id})">
							☑ 追記も見ました (再チェック)
						</button>
					` : (stStatus.confirmed ? `
						<button class="btn btn-secondary" style="padding:5px 14px; font-size:12.5px; background:#dcfce7; color:#166534; border-color:#86efac; font-weight:bold;" onclick="confirmMonthlyNotice(${n.id})">
							☑ 「見ました」済 (クリックで解除)
						</button>
					` : `
						<button class="btn btn-primary" style="padding:6px 18px; font-size:13px; font-weight:bold; background:#1e5b47; border-color:#1a4f3d;" onclick="confirmMonthlyNotice(${n.id})">
							☑ 見ました
						</button>
					`)}
				</div>
			</div>
		`;
		container.appendChild(card);
	});
}


function openMonthlyNoticeModal() {
 const curMonth = (gState.selectedDate || toLocalDateStr(new Date())).slice(0, 7);
 document.getElementById("noticeMonth").value = curMonth;
 document.getElementById("noticePriority").value = "";
 document.getElementById("noticeTitle").value = "";
 document.getElementById("noticeContent").value = "";
 document.getElementById("monthlyNoticeModal").style.display = "flex";
}

function submitMonthlyNotice() {
 const m = document.getElementById("noticeMonth").value;
 if (!cpRequireSelect("noticePriority", "重要度")) return;
 const prio = document.getElementById("noticePriority").value;
 const title = document.getElementById("noticeTitle").value.trim();
 const content = document.getElementById("noticeContent").value.trim();
 const staff = document.getElementById("currentStaff").value || "施設長";

 if (!m || !title || !content) {
 alert("対象月、件名、連絡内容は必須入力です。");
 return;
 }

 const now = new Date();
 const nowStr = `${toLocalDateStr(now)} ${now.toTimeString().slice(0, 5)}`;

 if (!Array.isArray(db.data.monthly_notices)) db.data.monthly_notices = [];
 db.data.monthly_notices.unshift({
 id: Date.now(),
 month: m,
 priority: prio,
 title: title,
 content: content,
 staff_name: staff,
 created_at: nowStr,
 confirmed_staff: [staff]
 });

 db.save();
 closeModal("monthlyNoticeModal");
 renderMonthlyNotices();
 checkGlobalAlerts();
 alert(`月間業務連絡「${title}」を登録しました！全職員に1ヶ月間掲示されます。`);
}

function confirmMonthlyNotice(id) {
 const currentStaff = document.getElementById("currentStaff") ? document.getElementById("currentStaff").value : "";
 if (!currentStaff) {
 alert("担当職員を選択してください。");
 return;
 }

 const notice = (db.data.monthly_notices || []).find(n => n.id === id);
 if (!notice) return;
 if (!Array.isArray(notice.confirmed_staff)) notice.confirmed_staff = [];
 if (!notice.confirmed_versions || typeof notice.confirmed_versions !== "object") notice.confirmed_versions = {};

 // [Claude修正] 旧実装は押すたびに確認済み/未確認を切り替えていたため、
 // 追記後に「追記も見ました（再チェック）」を押すと、逆に確認が外れていた。
 // 確認済みの時だけ取り消し、それ以外 (未確認・追記あり) は最新の内容を確認したことにする
 const st = getNoticeConfirmationStatus(notice, currentStaff);
 if (st.confirmed) {
 const idx = notice.confirmed_staff.indexOf(currentStaff);
 if (idx !== -1) notice.confirmed_staff.splice(idx, 1);
 delete notice.confirmed_versions[currentStaff];
 cpLogConfirm(notice, currentStaff, "確認を取消");
 } else {
 if (!notice.confirmed_staff.includes(currentStaff)) notice.confirmed_staff.push(currentStaff);
 cpLogConfirm(notice, currentStaff, "確認");
 notice.confirmed_versions[currentStaff] = notice.last_updated_at || notice.created_at || toLocalDateTimeStr(new Date());
 }

 db.save();
 renderMonthlyNotices();
 checkGlobalAlerts();
}

// [Claude修正] 業務連絡への追記。ボタンと入力画面はあったが、処理 (関数) が作られておらず押しても何も起きなかった。
// 申し送りの追記 (openAddDailyNotebookUpdateModal / submitDailyNotebookUpdate) と同じ仕組みにした
function openAddMonthlyNoticeUpdateModal(id) {
 const n = (db.data.monthly_notices || []).find(x => x.id === id);
 if (!n) return;
 document.getElementById("noticeUpdateParentId").value = id;
 document.getElementById("noticeUpdateTargetTitle").textContent = n.title || "";
 document.getElementById("noticeUpdateContent").value = "";
 openModal("monthlyNoticeUpdateModal");
}

function submitMonthlyNoticeUpdate() {
 const id = Number(document.getElementById("noticeUpdateParentId").value);
 const content = (document.getElementById("noticeUpdateContent").value || "").trim();
 const currentStaff = (document.getElementById("currentStaff") ? document.getElementById("currentStaff").value : "") || "職員";
 if (!content) {
 alert("追記・変更内容を入力してください。");
 return;
 }
 const n = (db.data.monthly_notices || []).find(x => x.id === id);
 if (!n) return;
 if (!Array.isArray(n.updates)) n.updates = [];
 const now = new Date();
 const nowStr = toLocalDateTimeStr(now);
 n.updates.push({ id: Date.now(), staff_name: currentStaff, content: content, created_at: nowStr });
 // 確認済みかどうかの比較に使うため秒まで記録する (分単位だと、同じ分に確認した職員に「追記あり」が出なかった)
 const stamp = nowStr + ":" + String(now.getSeconds()).padStart(2, "0");
 n.last_updated_at = stamp;
 n.last_updated_by = currentStaff;
 // 追記した本人は確認済み。ほかの職員には「追記あり（要再チェック）」と表示される
 if (!Array.isArray(n.confirmed_staff)) n.confirmed_staff = [];
 if (!n.confirmed_staff.includes(currentStaff)) n.confirmed_staff.push(currentStaff);
 if (!n.confirmed_versions || typeof n.confirmed_versions !== "object") n.confirmed_versions = {};
 n.confirmed_versions[currentStaff] = stamp;
 db.save();
 closeModal("monthlyNoticeUpdateModal");
 renderMonthlyNotices();
 if (typeof checkGlobalAlerts === "function") checkGlobalAlerts();
 alert("業務連絡に追記を登録しました。ほかの職員には再確認が表示されます。");
}

function deleteMonthlyNotice(id) {
 // [Claude修正] 業務連絡は消さずに「取消」として残す（理由必須）
 const n = (db.data.monthly_notices || []).find(x => x.id === id);
 if (!cpVoidRecord(n, "この月間業務連絡")) return;
 db.save();
 renderMonthlyNotices();
 checkGlobalAlerts();
}

// 14. 現場クイック消費 (優しい「修正」ボタン付き)
let gPendingConsume = null;

function renderQuickConsume() {
 const r = gState.residents.find(x => x.id === gState.selectedResidentId);
 const nameEl = document.getElementById("consumeResidentName");
 if (nameEl) nameEl.textContent = r ? r.name : "利用者";

 // 利用者切り替えドロップダウンの同期
 const sel = document.getElementById("consumeResidentSelect");
 if (sel) {
 sel.innerHTML = cpCurrentResidents().map(res => `
 <option value="${res.id}" ${res.id === gState.selectedResidentId ? 'selected' : ''}>
 ${res.room_no}号室 ${res.name} 様
 </option>
 `).join("");
 }

 const grid = document.getElementById("quickConsumeGrid");
 if (!grid) return;
 grid.innerHTML = "";

 gState.inventory.forEach(item => {
 const card = document.createElement("div");
 card.style.background = "white";
 card.style.border = "1px solid var(--border-color)";
 card.style.borderRadius = "8px";
 card.style.padding = "12px";
 card.style.display = "flex";
 card.style.flexDirection = "column";
 card.style.justifyContent = "space-between";

 card.innerHTML = `
 <div>
 <div style="font-weight:bold; font-size:14px; color:#22302b;">${item.name}</div>
 <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">
 現在庫: <strong>${item.current_stock}</strong> ${item.unit} | 単価: ¥${(item.unit_price || 0).toLocaleString()}
 ${cpBillingModeFor(gState.selectedResidentId, item).mode === 'personal' ? '<span style="color:#0284c7; font-weight:bold;">[個人請求対象]</span>' : '<span style="color:#16a34a; font-weight:bold;">[施設負担]</span>'}
 </div>
 </div>
 <div style="margin-top:10px;">
 <button class="btn btn-primary" style="width:100%; padding:8px; font-size:13px; font-weight:bold;" onclick="consumeItem(${item.id}, 1)"> 1${item.unit}使用する</button>
 </div>
 `;
 grid.appendChild(card);
 });

 renderRecentConsumeLogs();
}

function onConsumeResidentChange() {
 const sel = document.getElementById("consumeResidentSelect");
 if (!sel) return;
 const newId = parseInt(sel.value, 10);
 if (!isNaN(newId)) {
 gState.selectedResidentId = newId;
 renderResidentsStrip();
	initGlobalTimeSync();
	
 renderResidentDetail();
 updateRecordTargetBanner();
 renderQuickConsume();
 }
}

function consumeItem(itemId, qty) {
 const item = gState.inventory.find(i => i.id === itemId);
 const res = gState.residents.find(r => r.id === gState.selectedResidentId);
 if (!item || !res) return;

  const billInfo = cpBillingModeFor(res.id, item);
  gPendingConsume = { itemId, qty, resId: res.id, billingMode: billInfo.mode, billingBasis: billInfo.basis };

  const billNote = billInfo.mode === "personal"
    ? `<div style="margin-top:8px; font-size:12px; color:#0284c7; background:#f0f9ff; padding:6px 10px; border-radius:4px;">※ 個人購入（${escapeHtml(billInfo.basis)}）として月次請求明細に 1${item.unit} (¥${item.unit_price.toLocaleString()}) 自動計上されます。<br>（預かり金出納帳の残高からは引かれません）</div>`
    : `<div style="margin-top:8px; font-size:12px; color:#15803d; background:#f0fdf4; padding:6px 10px; border-radius:4px;">※ 施設負担備品（${escapeHtml(billInfo.basis)}）として在庫から消費されます。</div>`;

 const msgEl = document.getElementById("confirmConsumeMsg");
 if (msgEl) {
 msgEl.innerHTML = `
 <strong style="font-size:16px; color:#173f33;">${res.room_no}号室 ${res.name} 様</strong> に<br>
 【<strong>${item.name}</strong>】 を <strong>${qty} ${item.unit}</strong> 使用します。<br><br>
 対象者と物品はお間違いないですか？
 ${billNote}
 `;
 document.getElementById("confirmConsumeModal").style.display = "flex";
 } else {
 // モーダルがない場合のフォールバック
 if (confirm(`${res.name}様に「${item.name}」を${qty}${item.unit}使用します。よろしいですか？`)) {
 executeConsume();
 }
 }
}

function executeConsume() {
 if (!gPendingConsume) return;
 const { itemId, qty, resId } = gPendingConsume;
 const item = gState.inventory.find(i => i.id === itemId);
 const res = gState.residents.find(r => r.id === resId);
 const staff = document.getElementById("currentStaff").value;
 const now = new Date();
 const nowStr = `${toLocalDateStr(now)} ${now.toTimeString().slice(0, 5)}`;

 if (item) {
 item.current_stock -= qty;

    const billInfo = (gPendingConsume && gPendingConsume.billingMode)
      ? { mode: gPendingConsume.billingMode, basis: gPendingConsume.billingBasis }
      : cpBillingModeFor(resId, item);
    const isPersonal = billInfo.mode === "personal";
    var cpConsId = null;

    if (isPersonal) {
      cpConsId = Date.now();
      db.data.consumptions.unshift({
        id: cpConsId,
        consumed_at: nowStr,
        resident_id: resId,
        item_id: item.id,
        item_name: item.name,
        quantity: qty,
        unit_price: item.unit_price,
        subtotal: item.unit_price * qty,
        staff_name: staff,
        billing_basis: billInfo.basis
      });
    }

    const logId = Date.now() + 1;
    db.data.inventory_logs.unshift({
      id: logId,
      timestamp: nowStr,
      item_id: item.id,
      item_name: item.name,
      action_type: "消費",
      change_qty: -qty,
      after_qty: item.current_stock,
      resident_id: resId,
      resident_name: res ? res.name : "",
      staff_name: staff,
      reason: "現場ケア時使用",
      consumption_id: (isPersonal && cpConsId) ? cpConsId : null
 });

 db.save();
 renderQuickConsume();
 checkGlobalAlerts();
 closeModal("confirmConsumeModal");
 alert(`${res ? res.name : ''}様に ${item.name} を ${qty}${item.unit} 消費記録しました！`);
 }
 gPendingConsume = null;
}

function renderRecentConsumeLogs() {
 const container = document.getElementById("recentConsumeList");
 container.innerHTML = "";
 const logs = (db.data.inventory_logs || []).filter(l => l.action_type === "消費").slice(0, 5);

 if (logs.length === 0) {
 container.innerHTML = '<span style="font-size:13px; color:var(--text-muted);">直近の消費履歴はありません。</span>';
 return;
 }

 logs.forEach(l => {
 const row = document.createElement("div");
 row.style.display = "flex";
 row.style.justifyContent = "space-between";
 row.style.alignItems = "center";
 row.style.padding = "6px 10px";
 row.style.background = "#f6f8f6";
 row.style.border = "1px solid #dfe5e1";
 row.style.borderRadius = "6px";
 row.style.marginBottom = "6px";
 row.style.fontSize = "13px";

 const rawTime = l.timestamp || l.log_time || "";
 const timeDisplay = rawTime.length >= 16 ? rawTime.slice(11, 16) : rawTime;

 row.innerHTML = `
 <div>
 <span> ${timeDisplay} <strong>${l.resident_name || ''} 様</strong>: ${l.item_name} (${Math.abs(l.change_qty)})</span>
 <span style="color:var(--text-muted); margin-left:8px;">担当: ${l.staff_name || '未設定'}</span>
 </div>
 <div>
 <button class="btn btn-secondary" style="padding:3px 8px; font-size:12px;" onclick="rollbackConsume(${l.id})">［ 修正 ］</button>
 </div>
 `;
 container.appendChild(row);
 });
}

function rollbackConsume(logId) {
 if (!confirm("直前の消費入力を取り消して、在庫と請求を元に戻しますか？")) return;
 const log = (db.data.inventory_logs || []).find(x => x.id === logId);
 const staff = document.getElementById("currentStaff").value;
 const now = new Date();
 const nowStr = `${toLocalDateStr(now)} ${now.toTimeString().slice(0, 5)}`;

 if (log && log.action_type === "消費") {
 const item = gState.inventory.find(i => i.id === log.item_id);
 const addQty = Math.abs(log.change_qty);
 if (item) item.current_stock += addQty;

 // 請求から削除
 // [Claude修正] 請求の行は消さずに「取消」にする。以前は同じ利用者・品目の別の行を消すことがあった
 const cons = (db.data.consumptions || []).find(c => !c.voided && (log.consumption_id ? Number(c.id) === Number(log.consumption_id) : (c.resident_id === log.resident_id && c.item_id === log.item_id)));
 if (cons) { cons.voided = true; cons.voided_at = nowStr; cons.voided_by = staff; cons.void_reason = "消費入力の取消"; }

 db.data.inventory_logs.unshift({
 id: Date.now(),
 timestamp: nowStr,
 item_id: log.item_id,
 item_name: log.item_name,
 action_type: "修正取消",
 change_qty: addQty,
 after_qty: item ? item.current_stock : 0,
 resident_id: log.resident_id,
 resident_name: log.resident_name,
 staff_name: staff,
 reason: "押し直し修正"
 });

 db.save();
 renderQuickConsume();
 checkGlobalAlerts();
 alert("入力を修正・取消しました！");
 }
}

