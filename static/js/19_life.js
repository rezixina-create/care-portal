// ======================================================================
// 19_life.js: 科学的介護推進体制加算（LIFE）の評価入力・提出用CSV書き出し
// 厚生労働省 介護保険最新情報 Vol.1216（令和6年3月15日）別紙様式1
// CSV連携仕様書(LIFE) 3.10版（令和8年5月）
// 外部インターフェース項目一覧（310版）準拠
// ======================================================================

// 1. 定数・コード定義
// ----------------------------------------------------------------------
const CP_LIFE_SPEC_VERSION = "0310";
const CP_LIFE_FACILITY_CATEGORY = "2"; // 2: 通所・居住サービス (グループホーム)
const CP_LIFE_SERVICE_CODE_GH = "32";  // 認知症対応型共同生活介護
const CP_LIFE_SERVICE_CODE_PREV = "37"; // 介護予防認知症対応型共同生活介護

const CP_LIFE_DOC_URLS = {
  vol1216: "https://www.mhlw.go.jp/content/001227726.pdf",
  spec: "https://www.mhlw.go.jp/content/12301000/001698660.pdf",
  items: "https://www.mhlw.go.jp/content/12301000/001504021.xlsx"
};

// 全角カタカナ -> 半角カタカナ変換マップ
const CP_ZEN_TO_HAN_KANA_MAP = {
  "ガ": "ｶﾞ", "ギ": "ｷﾞ", "グ": "ｸﾞ", "ゲ": "ｹﾞ", "ゴ": "ｺﾞ",
  "ザ": "ｻﾞ", "ジ": "ｼﾞ", "ズ": "ｽﾞ", "ゼ": "ｾﾞ", "ゾ": "ｿﾞ",
  "ダ": "ﾀﾞ", "ヂ": "ﾁﾞ", "ヅ": "ﾂﾞ", "デ": "ﾃﾞ", "ド": "ﾄﾞ",
  "バ": "ﾊﾞ", "ビ": "ﾋﾞ", "ブ": "ﾌﾞ", "ベ": "ﾍﾞ", "ボ": "ﾎﾞ",
  "パ": "ﾊﾟ", "ピ": "ﾋﾟ", "プ": "ﾌﾟ", "ペ": "ﾍﾟ", "ポ": "ﾎﾟ",
  "ヴ": "ｳﾞ", "ヷ": "ﾜﾞ", "ヺ": "ｦﾞ",
  "ア": "ｱ", "イ": "ｲ", "ウ": "ｳ", "エ": "ｴ", "オ": "ｵ",
  "カ": "ｶ", "キ": "ｷ", "ク": "ｸ", "ケ": "ｹ", "コ": "ｺ",
  "サ": "ｻ", "シ": "ｼ", "ス": "ｽ", "セ": "ｾ", "ソ": "ｿ",
  "タ": "ﾀ", "チ": "ﾁ", "ツ": "ﾂ", "テ": "ﾃ", "ト": "ﾄ",
  "ナ": "ﾅ", "ニ": "ﾆ", "ヌ": "ﾇ", "ネ": "ﾈ", "ノ": "ﾉ",
  "ハ": "ﾊ", "ヒ": "ﾋ", "フ": "ﾌ", "ヘ": "ﾍ", "ホ": "ﾎ",
  "マ": "ﾏ", "ミ": "ﾐ", "ム": "ﾑ", "メ": "ﾒ", "モ": "ﾓ",
  "ヤ": "ﾔ", "ユ": "ﾕ", "ヨ": "ﾖ",
  "ラ": "ﾗ", "リ": "ﾘ", "ル": "ﾙ", "レ": "ﾚ", "ロ": "ﾛ",
  "ワ": "ﾜ", "ヲ": "ｦ", "ン": "ﾝ",
  "ァ": "ｧ", "ィ": "ｨ", "ゥ": "ｩ", "ェ": "ｪ", "ォ": "ｫ",
  "ッ": "ｯ", "ャ": "ｬ", "ュ": "ｭ", "ョ": "ｮ",
  "ー": "ｰ", "・": "･", " ": "", "　": ""
};

function cpToHalfWidthKana(str) {
  if (!str) return "";
  // ひらがなをカタカナに事前変換
  let s = String(str).replace(/[\u3041-\u3096]/g, ch => String.fromCharCode(ch.charCodeAt(0) + 0x60));
  let res = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    res += CP_ZEN_TO_HAN_KANA_MAP[ch] !== undefined ? CP_ZEN_TO_HAN_KANA_MAP[ch] : ch;
  }
  return res.replace(/[\s\u3000]/g, "");
}

// 利用者情報CSVの22列定義（物理名）
const CP_LIFE_USER_INFO_COLS = [
  "care_facility_id",
  "service_code",
  "external_system_management_number",
  "insurer_no",
  "insured_no",
  "last_name",
  "first_name",
  "last_name_kana",
  "first_name_kana",
  "gender",
  "birthday",
  "certified_date",
  "care_period_start",
  "care_period_end",
  "care_level",
  "impaired_elderly_independence_degree",
  "dementia_elderly_independence_degree",
  "start_date",
  "end_date",
  "death_date",
  "remarks",
  "version"
];

// 科学的介護推進評価CSVの114列定義（物理名）
const CP_LIFE_EVALUATION_COLS = [
  "care_facility_id",
  "service_code",
  "insurer_no",
  "insured_no",
  "external_system_management_number",
  "facility_outpatient_category",
  "care_level",
  "impaired_elderly_independence_degree",
  "dementia_elderly_independence_degree",
  "evaluate_date",
  "status",
  "emergency_hospitalization_date_01",
  "emergency_hospitalization_complaint_fever_01",
  "emergency_hospitalization_complaint_fall_down_01",
  "emergency_hospitalization_complaint_other_01",
  "emergency_hospitalization_complaint_other_content_01",
  "emergency_hospitalization_date_02",
  "emergency_hospitalization_complaint_fever_02",
  "emergency_hospitalization_complaint_fall_down_02",
  "emergency_hospitalization_complaint_other_02",
  "emergency_hospitalization_complaint_other_content_02",
  "emergency_hospitalization_date_03",
  "emergency_hospitalization_complaint_fever_03",
  "emergency_hospitalization_complaint_fall_down_03",
  "emergency_hospitalization_complaint_other_03",
  "emergency_hospitalization_complaint_other_content_03",
  "emergency_hospitalization_date_04",
  "emergency_hospitalization_complaint_fever_04",
  "emergency_hospitalization_complaint_fall_down_04",
  "emergency_hospitalization_complaint_other_04",
  "emergency_hospitalization_complaint_other_content_04",
  "emergency_hospitalization_date_05",
  "emergency_hospitalization_complaint_fever_05",
  "emergency_hospitalization_complaint_fall_down_05",
  "emergency_hospitalization_complaint_other_05",
  "emergency_hospitalization_complaint_other_content_05",
  "family",
  "barthel_index_meal",
  "barthel_transfer",
  "barthel_index_personal_hygiene_and_adjustment",
  "barthel_index_toilet_activity",
  "barthel_index_bathing",
  "barthel_index_flat_ground_walking",
  "barthel_index_stair_movement",
  "barthel_index_changing_clothes",
  "barthel_index_defecation_manage",
  "barthel_index_urination_manage",
  "departure_date",
  "departure",
  "height",
  "weight",
  "low_operating_risk_level",
  "food_form_ingestion",
  "is_nutrition_supply_method_enteral_nutrition",
  "is_nutrition_supply_method_parenteral_nutrition",
  "meal_form",
  "thickening",
  "dietary_intake",
  "staple_food_intake",
  "side_dish_intake",
  "required_nutrients_energy",
  "required_nutrients_protein",
  "provided_nutrients_energy",
  "provided_nutrients_protein",
  "bedsore",
  "denture",
  "choke",
  "stains_on_teeth",
  "condition_of_gums",
  "diagnosis_of_dementia_01",
  "diagnosis_of_dementia_02",
  "diagnosis_of_dementia_03",
  "diagnosis_of_dementia_other",
  "diagnosis_of_dementia_other_name",
  "diagnosis_of_dementia_evaluate_1_1",
  "diagnosis_of_dementia_evaluate_1_2",
  "diagnosis_of_dementia_evaluate_2",
  "diagnosis_of_dementia_evaluate_3",
  "diagnosis_of_dementia_evaluate_4",
  "diagnosis_of_dementia_evaluate_5",
  "diagnosis_of_dementia_evaluate_6",
  "vitality_index_01",
  "vitality_index_02",
  "vitality_index_03",
  "vitality_index_04",
  "vitality_index_05",
  "dbd13_01",
  "dbd13_02",
  "dbd13_03",
  "dbd13_04",
  "dbd13_05",
  "dbd13_06",
  "dbd13_07",
  "dbd13_08",
  "dbd13_09",
  "dbd13_10",
  "dbd13_11",
  "dbd13_12",
  "dbd13_13",
  "basic_operation",
  "walking_moving",
  "cognitive_orientation",
  "cognitive_communication",
  "cognitive_mental_activity",
  "swallowing_function",
  "eating_assistance",
  "excretion",
  "bathing",
  "oral_care",
  "dressing",
  "dressing_action",
  "leisure",
  "communication",
  "version"
];

// 2. 状態管理・ユーティリティ
// ----------------------------------------------------------------------
let gLifeSelectedMonth = "";

function cpInitLifeAssessments() {
  if (!db || !db.data) return;
  if (!Array.isArray(db.data.life_assessments)) {
    db.data.life_assessments = [];
  }
}

// 要介護度文字列 -> LIFEコード
function cpCareLevelToLifeCode(careLevel) {
  if (!careLevel) return "";
  const cl = String(careLevel).trim();
  if (cl.includes("要支援1")) return "12";
  if (cl.includes("要支援2")) return "13";
  if (cl.includes("要介護1")) return "21";
  if (cl.includes("要介護2")) return "22";
  if (cl.includes("要介護3")) return "23";
  if (cl.includes("要介護4")) return "24";
  if (cl.includes("要介護5")) return "25";
  return "";
}

// 認知症高齢者自立度ランク文字列 -> LIFEコード
const CP_DEMENTIA_RANK_TO_LIFE_CODE = {
  "自立": "1",
  "Ⅰ": "2", "I": "2", "1": "2",
  "Ⅱa": "3", "IIa": "3", "2a": "3",
  "Ⅱb": "4", "IIb": "4", "2b": "4",
  "Ⅲa": "5", "IIIa": "5", "3a": "5",
  "Ⅲb": "6", "IIIb": "6", "3b": "6",
  "Ⅳ": "7", "IV": "7", "4": "7",
  "M": "8", "m": "8"
};

function cpDementiaRankToLifeCode(rankStr) {
  if (!rankStr) return "";
  const r = String(rankStr).trim();
  return CP_DEMENTIA_RANK_TO_LIFE_CODE[r] || "";
}

// 障害高齢者自立度コード -> ラベル
const CP_IMPAIRED_DEGREE_LABELS = {
  "1": "自立",
  "2": "J1",
  "3": "J2",
  "4": "A1",
  "5": "A2",
  "6": "B1",
  "7": "B2",
  "8": "C1",
  "9": "C2"
};

// ADL(Barthel Index)の得点計算（0〜100点）
function cpCalcBarthelIndex(vals) {
  if (!vals) return 0;
  let total = 0;
  // 食事: 2->10, 1->5, 0->0
  const meal = parseInt(vals.barthel_index_meal, 10);
  if (meal === 2) total += 10; else if (meal === 1) total += 5;

  // 移乗: 3->15, 2->10, 1->5, 0->0
  const trans = parseInt(vals.barthel_transfer, 10);
  if (trans === 3) total += 15; else if (trans === 2) total += 10; else if (trans === 1) total += 5;

  // 整容: 2->5, 1->0, 0->0
  const hyg = parseInt(vals.barthel_index_personal_hygiene_and_adjustment, 10);
  if (hyg === 2) total += 5;

  // トイレ: 2->10, 1->5, 0->0
  const toilet = parseInt(vals.barthel_index_toilet_activity, 10);
  if (toilet === 2) total += 10; else if (toilet === 1) total += 5;

  // 入浴: 2->5, 1->0, 0->0
  const bath = parseInt(vals.barthel_index_bathing, 10);
  if (bath === 2) total += 5;

  // 平地歩行: 3->15, 2->10, 1->5, 0->0
  const walk = parseInt(vals.barthel_index_flat_ground_walking, 10);
  if (walk === 3) total += 15; else if (walk === 2) total += 10; else if (walk === 1) total += 5;

  // 階段: 2->10, 1->5, 0->0
  const stair = parseInt(vals.barthel_index_stair_movement, 10);
  if (stair === 2) total += 10; else if (stair === 1) total += 5;

  // 更衣: 2->10, 1->5, 0->0
  const dress = parseInt(vals.barthel_index_changing_clothes, 10);
  if (dress === 2) total += 10; else if (dress === 1) total += 5;

  // 排便: 2->10, 1->5, 0->0
  const defec = parseInt(vals.barthel_index_defecation_manage, 10);
  if (defec === 2) total += 10; else if (defec === 1) total += 5;

  // 排尿: 2->10, 1->5, 0->0
  const urin = parseInt(vals.barthel_index_urination_manage, 10);
  if (urin === 2) total += 10; else if (urin === 1) total += 5;

  return total;
}

// 3. 要る月（評価対象月）の判定
// Vol.1216 第2の1:
// - 入所・利用を開始した日の属する月
// - 算定を開始する月（届出日の属する月）
// - 少なくとも3月に1回
// - 退所・利用を終了した日の属する月
// ----------------------------------------------------------------------
function cpIsLifeAssessmentRequiredMonth(resident, yearMonth, optSettings) {
  if (!resident || !yearMonth) return false;
  if (resident.usage_type === "short") return false;
  const ym = String(yearMonth).trim();
  const settings = optSettings || (typeof cpGetKasanSettings === "function" ? cpGetKasanSettings() : ((db && db.data && db.data.kasan_settings) || {}));

  // 対象月に在籍しているか（入居日<=月末 かつ (退居日なし or 退居日>=月初)）
  const y = parseInt(ym.slice(0, 4), 10);
  const m = parseInt(ym.slice(5, 7), 10);
  const startDay = `${ym}-01`;
  const lastDay = `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;

  if (!resident.admission_date || resident.admission_date > lastDay) return false;
  if (resident.discharge_date && resident.discharge_date < startDay) return false;

  // 1. 利用開始月
  if (resident.admission_date && resident.admission_date.slice(0, 7) === ym) {
    return true;
  }

  // 2. 利用終了月
  if (resident.discharge_date && resident.discharge_date.slice(0, 7) === ym) {
    return true;
  }

  // 3. 算定を開始する月（届出日の属する月）
  const notifDate = settings && settings.taisei_items && settings.taisei_items.life && settings.taisei_items.life.notified_date;
  const notifYm = notifDate ? notifDate.slice(0, 7) : "";
  if (notifYm && notifYm === ym) {
    return true;
  }

  // 4. その後少なくとも3か月ごと
  // 起点月: 届出月以降に入居した人は入居月、届出月より前に入居した人は届出月（届出未設定時は入居月）
  let baseYm = resident.admission_date.slice(0, 7);
  if (notifYm && notifYm > baseYm) {
    baseYm = notifYm;
  }

  if (ym < baseYm) return false;

  const baseY = parseInt(baseYm.slice(0, 4), 10);
  const baseM = parseInt(baseYm.slice(5, 7), 10);
  const diffMonths = ((y - baseY) * 12) + (m - baseM);

  return (diffMonths >= 0 && diffMonths % 3 === 0);
}

// 評価対象理由のテキスト取得
function cpGetLifeRequiredReasonText(resident, yearMonth, optSettings) {
  const ym = String(yearMonth).trim();
  const settings = optSettings || (typeof cpGetKasanSettings === "function" ? cpGetKasanSettings() : ((db && db.data && db.data.kasan_settings) || {}));

  if (resident.admission_date && resident.admission_date.slice(0, 7) === ym) {
    return "利用開始月";
  }
  if (resident.discharge_date && resident.discharge_date.slice(0, 7) === ym) {
    return "利用終了月";
  }
  const notifDate = settings && settings.taisei_items && settings.taisei_items.life && settings.taisei_items.life.notified_date;
  const notifYm = notifDate ? notifDate.slice(0, 7) : "";
  if (notifYm && notifYm === ym) {
    return "算定開始月（届出月）";
  }
  return "定期評価（3か月ごと）";
}

// 対象月の評価記録を取得（有効な最新）
function cpGetLifeAssessmentForResidentInMonth(residentId, yearMonth) {
  cpInitLifeAssessments();
  const list = db.data.life_assessments.filter(a =>
    Number(a.resident_id) === Number(residentId) &&
    !a.cancelled &&
    a.evaluate_date &&
    a.evaluate_date.slice(0, 7) === yearMonth
  );
  if (!list.length) return null;
  list.sort((a, b) => String(b.evaluate_date).localeCompare(String(a.evaluate_date)) || (Number(b.id || 0) - Number(a.id || 0)));
  return list[0];
}

// 4. 事務ポータル「LIFE」タブ描画
// ----------------------------------------------------------------------
function renderOfficeLifeTab() {
  const container = document.getElementById("tabOfficeLife");
  if (!container) return;
  cpInitLifeAssessments();

  if (!gLifeSelectedMonth) {
    gLifeSelectedMonth = toLocalDateStr(new Date()).slice(0, 7);
  }

  const ym = gLifeSelectedMonth;
  const settings = (typeof cpGetKasanSettings === "function")
    ? cpGetKasanSettings()
    : ((db && db.data && db.data.kasan_settings) || {});

  const isLifeNotified = (settings.taisei_items && settings.taisei_items.life && settings.taisei_items.life.option_key === "1");
  const canInput = typeof cpCanEditPolicy === "function" && cpCanEditPolicy();
  const canExport = typeof isCurrentStaffAdminOrClerk === "function" && isCurrentStaffAdminOrClerk();

  // 月選択肢（前後12か月分）
  const curYm = toLocalDateStr(new Date()).slice(0, 7);
  const curYear = parseInt(curYm.slice(0, 4), 10);
  const curMonth = parseInt(curYm.slice(5, 7), 10);
  const monthOptions = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let m = 1; m <= 12; m++) {
      const optYm = `${curYear + dy}-${String(m).padStart(2, "0")}`;
      const isSel = (optYm === ym) ? "selected" : "";
      monthOptions.push(`<option value="${optYm}" ${isSel}>${curYear + dy}年${m}月</option>`);
    }
  }

  // 対象者の抽出
  const allResidents = (gState && gState.residents) ? gState.residents : ((db && db.data && db.data.residents) || []);
  const rows = [];
  let reqCount = 0;
  let assessedCount = 0;
  let unassessedCount = 0;

  allResidents.forEach(r => {
    const isReq = cpIsLifeAssessmentRequiredMonth(r, ym, settings);
    const assess = cpGetLifeAssessmentForResidentInMonth(r.id, ym);
    if (isReq) {
      reqCount++;
      if (assess) assessedCount++;
      else unassessedCount++;
    }
    // 表示は「要る月の人」または「この月に評価が入力されている人」
    if (isReq || assess) {
      rows.push({
        resident: r,
        isRequired: isReq,
        reasonText: isReq ? cpGetLifeRequiredReasonText(r, ym, settings) : "任意入力",
        assessment: assess
      });
    }
  });

  // 届出状態バッジ
  const statusBadge = isLifeNotified
    ? `<span class="badge" style="background:var(--pine-tint); color:var(--pine-dark); border:1px solid var(--line); font-size:13px; padding:4px 8px;">届出あり（40単位/月）</span>`
    : `<span class="badge" style="background:var(--caution-tint); color:var(--caution); border:1px solid var(--line); font-size:13px; padding:4px 8px;">届出なし（未算定）</span>`;

  // 未入力警告帯
  let alertBand = "";
  if (isLifeNotified && unassessedCount > 0) {
    alertBand = `
      <div style="background:var(--alert-tint); color:var(--alert); border:1px solid var(--line); border-radius:6px; padding:12px; margin-bottom:14px; font-size:13px; line-height:1.6;">
        <strong>[警告] 科学的介護推進体制加算</strong>: ${ym} に評価が必要な方のうち <strong>${unassessedCount}名</strong> が未入力です。<br>
        加算の算定には厚生労働省への提出が必要です。「評価を入力」ボタンから入力を行ってください。
      </div>
    `;
  }

  // テーブル行HTML
  let tableRowsHtml = "";
  if (rows.length === 0) {
    tableRowsHtml = `<tr><td colspan="7" style="text-align:center; padding:24px; color:var(--ink-3);">この月に評価が要る対象者はいません。</td></tr>`;
  } else {
    tableRowsHtml = rows.map(item => {
      const r = item.resident;
      const a = item.assessment;
      const roomStr = r.room_no ? `${escapeHtml(r.room_no)}号室` : "-";
      const careLevelStr = (typeof cpCurrentCareLevel === "function" ? cpCurrentCareLevel(r) : "") || "-";

      let statusHtml = "";
      let adlStr = "-";
      let evalDateStr = "-";

      if (a) {
        statusHtml = `<span class="badge" style="background:var(--pine-tint); color:var(--pine-dark); font-size:13px; padding:3px 8px;">入力済</span>`;
        adlStr = `${a.adl_total_score ?? cpCalcBarthelIndex(a)}点 / 100点`;
        evalDateStr = escapeHtml(a.evaluate_date || "-");
      } else {
        statusHtml = `<span class="badge" style="background:var(--alert-tint); color:var(--alert); font-size:13px; padding:3px 8px;">未入力</span>`;
      }

      // ボタン制御
      let actionButtons = "";
      if (canInput) {
        if (!a) {
          actionButtons = `
            <button type="button" class="btn btn-primary" style="font-size:13px; padding:4px 10px;" onclick="openLifeAssessmentModal(${r.id}, '${ym}-01')">
              ＋ 評価を入力
            </button>
          `;
        } else {
          actionButtons = `
            <button type="button" class="btn btn-secondary" style="font-size:13px; padding:4px 8px;" onclick="openLifeAssessmentModal(${r.id}, null, ${a.id})">
              編集
            </button>
            <button type="button" class="btn btn-secondary" style="font-size:13px; padding:4px 8px; color:var(--alert);" onclick="cancelLifeAssessmentPrompt(${a.id})">
              取消
            </button>
          `;
        }
      } else {
        actionButtons = `<span style="font-size:13px; color:var(--ink-3);">（閲覧のみ）</span>`;
      }

      const historyButton = `
        <button type="button" class="btn btn-secondary" style="font-size:13px; padding:4px 8px;" onclick="openLifeAssessmentHistoryModal(${r.id})">
          履歴
        </button>
      `;

      return `
        <tr>
          <td><strong>${escapeHtml(r.name || "")}</strong> <span style="font-size:13px; color:var(--ink-3);">(${roomStr})</span></td>
          <td>${escapeHtml(careLevelStr)}</td>
          <td>${escapeHtml(item.reasonText)}</td>
          <td>${statusHtml}</td>
          <td>${evalDateStr}</td>
          <td>${adlStr}</td>
          <td style="white-space:nowrap;">
            <div style="display:flex; gap:4px; align-items:center; flex-wrap:wrap;">
              ${actionButtons}
              ${historyButton}
            </div>
          </td>
        </tr>
      `;
    }).join("");
  }

  container.innerHTML = `
    <div class="panel-title" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
      <span>科学的介護推進（LIFE）の評価と提出</span>
      <div style="display:flex; gap:6px; flex-wrap:wrap;">
        ${canExport ? `
          <button type="button" class="btn btn-primary" style="font-size:13px;" onclick="cpExportLifeCsv()">
            提出用ファイル書き出し（CSV）
          </button>
        ` : `
          <button type="button" class="btn btn-secondary" style="font-size:13px;" disabled title="管理者および事務員のみ書き出し可能">
            提出用ファイル書き出し（事務・管理者のみ）
          </button>
        `}
      </div>
    </div>

    <!-- 月選択とステータスバッジ -->
    <div style="display:flex; align-items:center; gap:10px; margin:10px 0 12px; flex-wrap:wrap;">
      <label style="font-weight:bold; font-size:13px; color:var(--ink-2); display:flex; align-items:center; gap:6px;">
        対象年月:
        <select id="lifeMonthSelector" class="form-control" style="font-size:13px; width:160px;" onchange="onLifeMonthChange(this.value)">
          <option value="">選んでください</option>
          ${monthOptions.join("")}
        </select>
      </label>
      ${statusBadge}
      <span style="font-size:13px; color:var(--ink-2); margin-left:auto;">
        評価対象: <strong>${reqCount}名</strong> （入力済: <strong style="color:var(--pine-dark);">${assessedCount}名</strong> ／ 未入力: <strong style="color:var(--alert);">${unassessedCount}名</strong>）
      </span>
    </div>

    ${alertBand}

    <!-- 対象者一覧テーブル -->
    <div class="table-responsive" style="margin-top:10px; overflow-x:auto;">
      <table style="width:100%; border-collapse:collapse; font-size:13px;">
        <thead>
          <tr style="background:var(--ground); color:var(--ink); border-bottom:1px solid var(--line);">
            <th style="padding:8px 10px; text-align:left;">氏名（居室）</th>
            <th style="padding:8px 10px; text-align:left;">要介護度</th>
            <th style="padding:8px 10px; text-align:left;">対象理由</th>
            <th style="padding:8px 10px; text-align:left;">状態</th>
            <th style="padding:8px 10px; text-align:left;">評価日</th>
            <th style="padding:8px 10px; text-align:left;">ADL合計</th>
            <th style="padding:8px 10px; text-align:left;">操作</th>
          </tr>
        </thead>
        <tbody>
          ${tableRowsHtml}
        </tbody>
      </table>
    </div>

    <!-- 資料・根拠案内 -->
    <div style="margin-top:16px; background:var(--pine-tint-2); border:1px solid var(--line); border-radius:6px; padding:12px 14px; font-size:13px; color:var(--ink-2); line-height:1.7;">
      <div style="font-weight:bold; color:var(--pine-dark); margin-bottom:4px;">【資料・根拠】</div>
      <div>・厚生労働省 介護保険最新情報 Vol.1216（令和6年3月15日）第2の1・別紙様式1「科学的介護推進に関する評価（通所・居住サービス）」
        <a href="${CP_LIFE_DOC_URLS.vol1216}" target="_blank" rel="noopener noreferrer" style="color:var(--pine); text-decoration:underline;">[PDF]</a>
      </div>
      <div>・厚生労働省 CSV連携仕様書(LIFE) 3.10版（令和8年5月）
        <a href="${CP_LIFE_DOC_URLS.spec}" target="_blank" rel="noopener noreferrer" style="color:var(--pine); text-decoration:underline;">[PDF]</a>
      </div>
      <div>・別紙_外部インターフェース項目一覧（310版）グループホーム32・介護予防37「通所・居住」
        <a href="${CP_LIFE_DOC_URLS.items}" target="_blank" rel="noopener noreferrer" style="color:var(--pine); text-decoration:underline;">[Excel]</a>
      </div>
      <div style="margin-top:6px; font-size:13px; color:var(--ink-3);">
        ※評価の追加・訂正は管理者・計画作成担当者・看護師のみ可能です。書き出しは管理者および事務員のみ実行可能です。<br>
        ※グループホーム（通所・居住）では栄養管理の項目（52〜65）およびDBD13・ICF・診断名・服薬コードはLIFE仕様書に基づき空欄（未設定）で書き出されます。
      </div>
    </div>
  `;
}

function onLifeMonthChange(val) {
  gLifeSelectedMonth = val || toLocalDateStr(new Date()).slice(0, 7);
  renderOfficeLifeTab();
}

// 5. LIFE評価入力モーダル（開閉・入力・保存）
// ----------------------------------------------------------------------
function openLifeAssessmentModal(residentId, defaultDate, assessmentId) {
  if (typeof cpCanEditPolicy === "function" && !cpCanEditPolicy()) {
    alert("科学的介護推進（LIFE）の評価は、管理者・計画作成担当者・看護師のみ入力可能です。");
    return;
  }

  const allResidents = (gState && gState.residents) ? gState.residents : ((db && db.data && db.data.residents) || []);
  const r = allResidents.find(x => Number(x.id) === Number(residentId));
  if (!r) {
    alert("利用者情報が見つかりません。");
    return;
  }

  cpInitLifeAssessments();
  const existing = assessmentId ? db.data.life_assessments.find(a => Number(a.id) === Number(assessmentId)) : null;

  const modal = document.getElementById("lifeAssessmentModal");
  if (!modal) return;

  // 評価日の初期値
  let evalDate = existing ? existing.evaluate_date : (defaultDate || toLocalDateStr(new Date()));
  if (evalDate.length === 7) evalDate = `${evalDate}-01`;

  // フォーム初期化
  document.getElementById("lifeEvalResidentId").value = r.id;
  document.getElementById("lifeEvalAssessmentId").value = existing ? existing.id : "";
  document.getElementById("lifeEvalModalTitle").textContent = existing
    ? `LIFE評価の編集 (${r.name} 様)`
    : `LIFE評価の新規登録 (${r.name} 様)`;

  document.getElementById("lifeEvalDate").value = evalDate;
  document.getElementById("lifeEvalStatus").value = existing ? existing.status : (r.discharge_date && r.discharge_date.slice(0, 7) === evalDate.slice(0, 7) ? "3" : (r.admission_date && r.admission_date.slice(0, 7) === evalDate.slice(0, 7) ? "1" : "2"));

  // 障害高齢者自立度
  document.getElementById("lifeEvalImpairedDegree").value = existing ? existing.impaired_elderly_independence_degree : "";

  // 認知症自立度の参照
  updateLifeModalDementiaRank(r.id, evalDate);

  // 要介護度（表示のみ・登録から取得）
  const lCert = (typeof cpCareCertOn === "function") ? cpCareCertOn(r, evalDate) : { level: "" };
    document.getElementById("lifeEvalCareLevelDisplay").textContent = lCert.level || "未登録";

  // ADL 10項目
  const adlFields = [
    "barthel_index_meal", "barthel_transfer", "barthel_index_personal_hygiene_and_adjustment",
    "barthel_index_toilet_activity", "barthel_index_bathing", "barthel_index_flat_ground_walking",
    "barthel_index_stair_movement", "barthel_index_changing_clothes", "barthel_index_defecation_manage",
    "barthel_index_urination_manage"
  ];
  adlFields.forEach(f => {
    const el = document.getElementById(`life_${f}`);
    if (el) el.value = (existing && existing[f] !== undefined) ? String(existing[f]) : "";
  });
  updateLifeAdlScoreDisplay();

  // 身長・体重（体重の最新を初期値）
  let initWeight = existing ? existing.weight : "";
  if (!initWeight && Array.isArray(db.data.weight_records)) {
    const wList = db.data.weight_records.filter(w => Number(w.resident_id) === Number(r.id) && w.weight > 0);
    if (wList.length > 0) {
      wList.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
      initWeight = wList[0].weight;
    }
  }
  document.getElementById("life_height").value = (existing && existing.height) ? existing.height : "";
  document.getElementById("life_weight").value = initWeight || "";

  // 口腔・歯肉
  ["denture", "choke", "stains_on_teeth", "condition_of_gums"].forEach(f => {
    const el = document.getElementById(`life_${f}`);
    if (el) el.value = (existing && existing[f] !== undefined) ? String(existing[f]) : "";
  });

  // 認知症診断
  ["diagnosis_of_dementia_01", "diagnosis_of_dementia_02", "diagnosis_of_dementia_03", "diagnosis_of_dementia_other"].forEach(f => {
    const el = document.getElementById(`life_${f}`);
    if (el) el.checked = !!(existing && existing[f] == 1);
  });
  document.getElementById("life_diagnosis_of_dementia_other_name").value = (existing && existing.diagnosis_of_dementia_other_name) || "";

  // 生活・認知機能尺度 7問
  [
    "diagnosis_of_dementia_evaluate_1_1", "diagnosis_of_dementia_evaluate_1_2",
    "diagnosis_of_dementia_evaluate_2", "diagnosis_of_dementia_evaluate_3",
    "diagnosis_of_dementia_evaluate_4", "diagnosis_of_dementia_evaluate_5",
    "diagnosis_of_dementia_evaluate_6"
  ].forEach(f => {
    const el = document.getElementById(`life_${f}`);
    if (el) el.value = (existing && existing[f] !== undefined) ? String(existing[f]) : "";
  });

  // Vitality index
  ["vitality_index_01", "vitality_index_02", "vitality_index_03", "vitality_index_04", "vitality_index_05"].forEach(f => {
    const el = document.getElementById(`life_${f}`);
    if (el) el.value = (existing && existing[f] !== undefined) ? String(existing[f]) : "";
  });

  // 家族の状況・終了日
  document.getElementById("life_family").value = (existing && existing.family) ? String(existing.family) : "";
  document.getElementById("life_departure_date").value = (existing && existing.departure_date) || (r.discharge_date || "");
  document.getElementById("life_departure").value = (existing && existing.departure) ? String(existing.departure) : "";
  onLifeStatusChange();

  // 編集理由欄
  const reasonWrap = document.getElementById("lifeEvalEditReasonWrap");
  if (reasonWrap) {
    reasonWrap.style.display = existing ? "block" : "none";
    document.getElementById("lifeEvalEditReason").value = "";
  }

  modal.style.display = "flex";
}

// 評価日変更時の自立度再読み込み
function onLifeEvalDateChange(newDate) {
  const resId = document.getElementById("lifeEvalResidentId").value;
  if (!resId || !newDate) return;
  updateLifeModalDementiaRank(resId, newDate);
}

// 評価時点変更時の終了項目表示連動
function onLifeStatusChange() {
  const st = document.getElementById("lifeEvalStatus").value;
  const depRow = document.getElementById("lifeDepartureFieldsRow");
  if (depRow) {
    depRow.style.display = (st === "3") ? "grid" : "none";
  }
}

// 認知症自立度の参照表示更新
function updateLifeModalDementiaRank(residentId, evalDate) {
  const rankEl = document.getElementById("lifeEvalDementiaRankDisplay");
  const hiddenCodeEl = document.getElementById("lifeEvalDementiaRankCode");
  const warnEl = document.getElementById("lifeEvalDementiaRankWarning");

  if (!rankEl || !hiddenCodeEl) return;

  const assess = (typeof cpGetDementiaRankOn === "function") ? cpGetDementiaRankOn(residentId, evalDate) : null;
  if (assess && assess.rank) {
    const code = cpDementiaRankToLifeCode(assess.rank);
    rankEl.textContent = `${assess.rank}（コード: ${code}、判定日: ${assess.assessed_on}）`;
    hiddenCodeEl.value = code;
    if (warnEl) warnEl.style.display = "none";
  } else {
    rankEl.textContent = "未判定";
    hiddenCodeEl.value = "";
    if (warnEl) warnEl.style.display = "block";
  }
}

// ADL点数のリアルタイム再計算
function updateLifeAdlScoreDisplay() {
  const vals = {
    barthel_index_meal: document.getElementById("life_barthel_index_meal")?.value,
    barthel_transfer: document.getElementById("life_barthel_transfer")?.value,
    barthel_index_personal_hygiene_and_adjustment: document.getElementById("life_barthel_index_personal_hygiene_and_adjustment")?.value,
    barthel_index_toilet_activity: document.getElementById("life_barthel_index_toilet_activity")?.value,
    barthel_index_bathing: document.getElementById("life_barthel_index_bathing")?.value,
    barthel_index_flat_ground_walking: document.getElementById("life_barthel_index_flat_ground_walking")?.value,
    barthel_index_stair_movement: document.getElementById("life_barthel_index_stair_movement")?.value,
    barthel_index_changing_clothes: document.getElementById("life_barthel_index_changing_clothes")?.value,
    barthel_index_defecation_manage: document.getElementById("life_barthel_index_defecation_manage")?.value,
    barthel_index_urination_manage: document.getElementById("life_barthel_index_urination_manage")?.value
  };

  const score = cpCalcBarthelIndex(vals);
  const dispEl = document.getElementById("lifeAdlTotalScoreDisplay");
  if (dispEl) {
    dispEl.textContent = `${score} 点 / 100点`;
  }
}

function closeLifeAssessmentModal() {
  const modal = document.getElementById("lifeAssessmentModal");
  if (modal) modal.style.display = "none";
}

// 評価の保存
function submitLifeAssessment() {
  if (typeof cpCanEditPolicy === "function" && !cpCanEditPolicy()) {
    alert("科学的介護推進（LIFE）の評価は、管理者・計画作成担当者・看護師のみ入力可能です。");
    return;
  }

  const resId = Number(document.getElementById("lifeEvalResidentId").value);
  const assessId = document.getElementById("lifeEvalAssessmentId").value;
  const evalDate = document.getElementById("lifeEvalDate").value.trim();
  const status = document.getElementById("lifeEvalStatus").value;
  const impairedDegree = document.getElementById("lifeEvalImpairedDegree").value;
  const dementiaCode = document.getElementById("lifeEvalDementiaRankCode").value;

  if (!evalDate) {
    alert("評価日を入力してください。");
    return;
  }
  const today = toLocalDateStr(new Date());
  if (evalDate > today) {
    alert("未来の日付は評価日として入力できません。");
    return;
  }

  // 認知症自立度チェック
  if (!dementiaCode) {
    alert("先に自立度の欄に判定を入れてください");
    return;
  }

  if (!status) {
    alert("評価時点を選択してください。");
    return;
  }
  if (!impairedDegree) {
    alert("障害高齢者の日常生活自立度を選択してください。");
    return;
  }

  // ADL 10項目チェック
  const adlFields = [
    "barthel_index_meal", "barthel_transfer", "barthel_index_personal_hygiene_and_adjustment",
    "barthel_index_toilet_activity", "barthel_index_bathing", "barthel_index_flat_ground_walking",
    "barthel_index_stair_movement", "barthel_index_changing_clothes", "barthel_index_defecation_manage",
    "barthel_index_urination_manage"
  ];
  for (const f of adlFields) {
    const val = document.getElementById(`life_${f}`)?.value;
    if (val === "" || val === undefined) {
      alert("ADL（Barthel Index）の全10項目を選択してください。");
      return;
    }
  }

  // 認知機能尺度 7問チェック
  const cogFields = [
    "diagnosis_of_dementia_evaluate_1_1", "diagnosis_of_dementia_evaluate_1_2",
    "diagnosis_of_dementia_evaluate_2", "diagnosis_of_dementia_evaluate_3",
    "diagnosis_of_dementia_evaluate_4", "diagnosis_of_dementia_evaluate_5",
    "diagnosis_of_dementia_evaluate_6"
  ];
  for (const f of cogFields) {
    const val = document.getElementById(`life_${f}`)?.value;
    if (val === "" || val === undefined) {
      alert("生活・認知機能尺度の7問をすべて選択してください。");
      return;
    }
  }

  // Vitality index 01 (意思疎通)
  const vit01 = document.getElementById("life_vitality_index_01")?.value;
  if (vit01 === "" || vit01 === undefined) {
    alert("Vitality Index の「意思疎通」を選択してください。");
    return;
  }

  // 終了時項目
  let depDate = "";
  let depReason = "";
  if (status === "3") {
    depDate = (document.getElementById("life_departure_date")?.value || "").trim();
    depReason = (document.getElementById("life_departure")?.value || "").trim();
    if (!depDate) {
      alert("サービス利用終了時（状態3）の場合は終了日を入力してください。");
      return;
    }
    // [Claude修正] 項目一覧: 終了日が評価日より後だと取り込みでエラーになる
    if (depDate > evalDate) {
      alert("サービス利用終了日は、評価日と同じ日か、それより前の日にしてください（評価日より後だと LIFE の取り込みでエラーになります）。");
      return;
    }
  }

  // 身長・体重
  const heightVal = parseFloat(document.getElementById("life_height")?.value) || null;
  const weightVal = parseFloat(document.getElementById("life_weight")?.value) || null;
  // [Claude修正] 項目一覧の範囲（身長 10.0〜300.0cm・体重 10.0〜200.0kg）。小数は1桁に丸める
  if (heightVal !== null && (heightVal < 10 || heightVal > 300)) { alert("身長は 10.0〜300.0 cm の間で入れてください。"); return; }
  if (weightVal !== null && (weightVal < 10 || weightVal > 200)) { alert("体重は 10.0〜200.0 kg の間で入れてください。"); return; }

  // 利用者情報取得
  const allResidents = (gState && gState.residents) ? gState.residents : ((db && db.data && db.data.residents) || []);
  const r = allResidents.find(x => Number(x.id) === resId);
  const lCertSubmit = (typeof cpCareCertOn === "function") ? cpCareCertOn(r, evalDate) : { level: "" };
  const careLevelCode = cpCareLevelToLifeCode(lCertSubmit.level || "");
  // [Claude修正] 入居日より前の評価日は入れない
  if (r && r.admission_date && evalDate < r.admission_date) {
    alert("評価日が入居日（" + r.admission_date + "）より前になっています。");
    return;
  }
  const otherChecked = !!document.getElementById("life_diagnosis_of_dementia_other")?.checked;

  // ADL合計点
  const adlVals = {};
  adlFields.forEach(f => { adlVals[f] = document.getElementById(`life_${f}`).value; });
  const totalAdlScore = cpCalcBarthelIndex(adlVals);

  // 編集時理由チェック
  const editReason = (document.getElementById("lifeEvalEditReason")?.value || "").trim();
  if (assessId && !editReason) {
    alert("評価内容を訂正する場合は、変更理由を必ず入力してください。");
    return;
  }

  cpInitLifeAssessments();

  const assessmentData = {
    resident_id: resId,
    evaluate_date: evalDate,
    status: status,
    care_level: careLevelCode,
    impaired_elderly_independence_degree: impairedDegree,
    dementia_elderly_independence_degree: dementiaCode,
    barthel_index_meal: parseInt(document.getElementById("life_barthel_index_meal").value, 10),
    barthel_transfer: parseInt(document.getElementById("life_barthel_transfer").value, 10),
    barthel_index_personal_hygiene_and_adjustment: parseInt(document.getElementById("life_barthel_index_personal_hygiene_and_adjustment").value, 10),
    barthel_index_toilet_activity: parseInt(document.getElementById("life_barthel_index_toilet_activity").value, 10),
    barthel_index_bathing: parseInt(document.getElementById("life_barthel_index_bathing").value, 10),
    barthel_index_flat_ground_walking: parseInt(document.getElementById("life_barthel_index_flat_ground_walking").value, 10),
    barthel_index_stair_movement: parseInt(document.getElementById("life_barthel_index_stair_movement").value, 10),
    barthel_index_changing_clothes: parseInt(document.getElementById("life_barthel_index_changing_clothes").value, 10),
    barthel_index_defecation_manage: parseInt(document.getElementById("life_barthel_index_defecation_manage").value, 10),
    barthel_index_urination_manage: parseInt(document.getElementById("life_barthel_index_urination_manage").value, 10),
    adl_total_score: totalAdlScore,
    height: heightVal === null ? null : Math.round(heightVal * 10) / 10,
    weight: weightVal === null ? null : Math.round(weightVal * 10) / 10,
    denture: document.getElementById("life_denture")?.value !== "" ? parseInt(document.getElementById("life_denture").value, 10) : null,
    choke: document.getElementById("life_choke")?.value !== "" ? parseInt(document.getElementById("life_choke").value, 10) : null,
    stains_on_teeth: document.getElementById("life_stains_on_teeth")?.value !== "" ? parseInt(document.getElementById("life_stains_on_teeth").value, 10) : null,
    condition_of_gums: document.getElementById("life_condition_of_gums")?.value !== "" ? parseInt(document.getElementById("life_condition_of_gums").value, 10) : null,
    diagnosis_of_dementia_01: document.getElementById("life_diagnosis_of_dementia_01")?.checked ? 1 : 0,
    diagnosis_of_dementia_02: document.getElementById("life_diagnosis_of_dementia_02")?.checked ? 1 : 0,
    diagnosis_of_dementia_03: document.getElementById("life_diagnosis_of_dementia_03")?.checked ? 1 : 0,
    diagnosis_of_dementia_other: document.getElementById("life_diagnosis_of_dementia_other")?.checked ? 1 : 0,
    diagnosis_of_dementia_other_name: otherChecked ? (document.getElementById("life_diagnosis_of_dementia_other_name")?.value || "").trim().slice(0, 50) : "",
    diagnosis_of_dementia_evaluate_1_1: parseInt(document.getElementById("life_diagnosis_of_dementia_evaluate_1_1").value, 10),
    diagnosis_of_dementia_evaluate_1_2: parseInt(document.getElementById("life_diagnosis_of_dementia_evaluate_1_2").value, 10),
    diagnosis_of_dementia_evaluate_2: parseInt(document.getElementById("life_diagnosis_of_dementia_evaluate_2").value, 10),
    diagnosis_of_dementia_evaluate_3: parseInt(document.getElementById("life_diagnosis_of_dementia_evaluate_3").value, 10),
    diagnosis_of_dementia_evaluate_4: parseInt(document.getElementById("life_diagnosis_of_dementia_evaluate_4").value, 10),
    diagnosis_of_dementia_evaluate_5: parseInt(document.getElementById("life_diagnosis_of_dementia_evaluate_5").value, 10),
    diagnosis_of_dementia_evaluate_6: parseInt(document.getElementById("life_diagnosis_of_dementia_evaluate_6").value, 10),
    vitality_index_01: parseInt(vit01, 10),
    vitality_index_02: document.getElementById("life_vitality_index_02")?.value !== "" ? parseInt(document.getElementById("life_vitality_index_02").value, 10) : null,
    vitality_index_03: document.getElementById("life_vitality_index_03")?.value !== "" ? parseInt(document.getElementById("life_vitality_index_03").value, 10) : null,
    vitality_index_04: document.getElementById("life_vitality_index_04")?.value !== "" ? parseInt(document.getElementById("life_vitality_index_04").value, 10) : null,
    vitality_index_05: document.getElementById("life_vitality_index_05")?.value !== "" ? parseInt(document.getElementById("life_vitality_index_05").value, 10) : null,
    family: document.getElementById("life_family")?.value !== "" ? parseInt(document.getElementById("life_family").value, 10) : null,
    departure_date: depDate,
    departure: depReason,
    cancelled: false
  };

  const fieldsForHistory = Object.keys(assessmentData);

  if (assessId) {
    const idx = db.data.life_assessments.findIndex(a => Number(a.id) === Number(assessId));
    if (idx !== -1) {
      const oldAss = Object.assign({}, db.data.life_assessments[idx]);
      db.data.life_assessments[idx] = Object.assign({}, db.data.life_assessments[idx], assessmentData, {
        updated_at: toLocalDateTimeStr(new Date()),
        updated_by: typeof cpLedgerStaff === "function" ? cpLedgerStaff() : ""
      });
      if (typeof cpAppendEditHistory === "function") {
        cpAppendEditHistory(db.data.life_assessments[idx], oldAss, fieldsForHistory, editReason);
      }
    }
  } else {
    assessmentData.id = Date.now() + Math.floor(Math.random() * 1000);
    assessmentData.created_at = toLocalDateTimeStr(new Date());
    assessmentData.created_by = typeof cpLedgerStaff === "function" ? cpLedgerStaff() : "";
    assessmentData.edit_history = [];
    db.data.life_assessments.push(assessmentData);
  }

  db.save();
  closeLifeAssessmentModal();
  renderOfficeLifeTab();
  if (typeof renderResidentDetail === "function" && gState && gState.selectedResidentId === resId) {
    renderResidentDetail();
  }
  alert("LIFE評価を保存しました。");
}

// 評価の取消（消さずに理由つき取消）
function cancelLifeAssessmentPrompt(assessmentId) {
  if (typeof cpCanEditPolicy === "function" && !cpCanEditPolicy()) {
    alert("科学的介護推進（LIFE）の評価の取消は、管理者・計画作成担当者・看護師のみ実行可能です。");
    return;
  }

  cpInitLifeAssessments();
  const assess = db.data.life_assessments.find(a => Number(a.id) === Number(assessmentId));
  if (!assess || assess.cancelled) return;

  const reason = prompt("このLIFE評価を取り消す理由を入力してください（必須）:");
  if (reason === null) return;
  if (!reason.trim()) {
    alert("取消理由が入力されていないため、取消を中止しました。");
    return;
  }

  assess.cancelled = true;
  assess.cancelled_at = toLocalDateTimeStr(new Date());
  assess.cancelled_by = typeof cpLedgerStaff === "function" ? cpLedgerStaff() : "";
  assess.cancel_reason = reason.trim();

  db.save();
  renderOfficeLifeTab();
  if (typeof renderResidentDetail === "function" && gState && gState.selectedResidentId === assess.resident_id) {
    renderResidentDetail();
  }
  alert("LIFE評価を取り消しました。");
}

// 評価履歴モーダル表示
function openLifeAssessmentHistoryModal(residentId) {
  const allResidents = (gState && gState.residents) ? gState.residents : ((db && db.data && db.data.residents) || []);
  const r = allResidents.find(x => Number(x.id) === Number(residentId));
  if (!r) return;

  cpInitLifeAssessments();
  const list = db.data.life_assessments.filter(a => Number(a.resident_id) === Number(residentId));
  list.sort((a, b) => String(b.evaluate_date || "").localeCompare(String(a.evaluate_date || "")) || (Number(b.id || 0) - Number(a.id || 0)));

  const container = document.getElementById("lifeAssessmentHistoryContainer");
  const titleEl = document.getElementById("lifeAssessmentHistoryTitle");
  if (titleEl) titleEl.textContent = `LIFE評価履歴 (${r.name} 様)`;

  if (!container) return;

  if (list.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding:20px; color:var(--ink-3);">評価の記録はありません。</div>`;
  } else {
    container.innerHTML = list.map(a => {
      const cancelBadge = a.cancelled
        ? `<span class="badge" style="background:var(--alert-tint); color:var(--alert); margin-left:6px;">取消済 (${escapeHtml(a.cancel_reason || "")})</span>`
        : "";
      const statusLabel = a.status === "1" ? "利用開始時" : (a.status === "3" ? "利用終了時" : "サービス利用中");
      const adlScore = a.adl_total_score ?? cpCalcBarthelIndex(a);

      let histHtml = "";
      if (Array.isArray(a.edit_history) && a.edit_history.length > 0) {
        histHtml = `
          <div style="margin-top:6px; padding:6px 8px; background:var(--pine-tint-2); border-radius:4px; font-size:13px; color:var(--ink-2);">
            <strong>変更履歴 (${a.edit_history.length}件):</strong>
            ${a.edit_history.map(h => `<div style="margin-top:2px;">・${escapeHtml(h.edited_at || "")} by ${escapeHtml(h.edited_by || "")}: 理由「${escapeHtml(h.reason || "理由記載なし")}」</div>`).join("")}
          </div>
        `;
      }

      return `
        <div style="border:1px solid var(--line); border-radius:6px; padding:10px 12px; margin-bottom:10px; background:var(--surface);">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap;">
            <div>
              <strong>評価日: ${escapeHtml(a.evaluate_date || "-")}</strong>
              <span style="margin-left:8px; color:var(--ink-2);">時点: ${statusLabel}</span>
              ${cancelBadge}
            </div>
            <div style="font-size:13px; color:var(--ink-2);">
              登録: ${escapeHtml(a.created_at || "-")} (${escapeHtml(a.created_by || "-")})
            </div>
          </div>
          <div style="margin-top:6px; font-size:13px; color:var(--ink-2); display:flex; gap:16px; flex-wrap:wrap;">
            <span>ADL: <strong>${adlScore}点</strong> / 100点</span>
            <span>障害自立度: <strong>${CP_IMPAIRED_DEGREE_LABELS[a.impaired_elderly_independence_degree] || a.impaired_elderly_independence_degree || "-"}</strong></span>
            <span>認知症自立度コード: <strong>${escapeHtml(a.dementia_elderly_independence_degree || "-")}</strong></span>
            <span>身長/体重: ${a.height ? `${a.height}cm` : "-"} / ${a.weight ? `${a.weight}kg` : "-"}</span>
          </div>
          ${histHtml}
        </div>
      `;
    }).join("");
  }

  const modal = document.getElementById("lifeAssessmentHistoryModal");
  if (modal) modal.style.display = "flex";
}

function closeLifeAssessmentHistoryModal() {
  const modal = document.getElementById("lifeAssessmentHistoryModal");
  if (modal) modal.style.display = "none";
}

// 6. カルテ連携HTML（利用者カルテ詳細画面用）
// ----------------------------------------------------------------------
function cpLifeSectionHtml(r) {
  if (!r) return "";
  cpInitLifeAssessments();
  const canEdit = typeof cpCanEditPolicy === "function" && cpCanEditPolicy();

  const validAssessments = db.data.life_assessments.filter(a => Number(a.resident_id) === Number(r.id) && !a.cancelled);
  validAssessments.sort((a, b) => String(b.evaluate_date || "").localeCompare(String(a.evaluate_date || "")) || (Number(b.id || 0) - Number(a.id || 0)));
  const latest = validAssessments[0];

  let bodyHtml = "";
  if (!latest) {
    bodyHtml = `<div style="font-size:13px; color:var(--ink-3); padding:4px 0;">LIFE評価の記録はまだありません。</div>`;
  } else {
    const statusLabel = latest.status === "1" ? "利用開始時" : (latest.status === "3" ? "利用終了時" : "サービス利用中");
    const adlScore = latest.adl_total_score ?? cpCalcBarthelIndex(latest);
    bodyHtml = `
      <div style="font-size:13px; color:var(--ink-2); line-height:1.7;">
        <div>最新評価日: <strong>${escapeHtml(latest.evaluate_date)}</strong> （時点: ${statusLabel}）</div>
        <div style="display:flex; gap:14px; flex-wrap:wrap; margin-top:2px;">
          <span>ADL総合: <strong>${adlScore}点</strong> / 100点</span>
          <span>障害自立度: <strong>${CP_IMPAIRED_DEGREE_LABELS[latest.impaired_elderly_independence_degree] || latest.impaired_elderly_independence_degree || "-"}</strong></span>
          <span>認知症自立度コード: <strong>${escapeHtml(latest.dementia_elderly_independence_degree || "-")}</strong></span>
        </div>
      </div>
    `;
  }

  return `
    <div style="margin-bottom:10px; border:1px solid var(--line); border-radius:8px; background:var(--surface); padding:10px 14px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:6px;">
        <span style="font-weight:bold; font-size:14px; color:var(--pine-dark);">科学的介護推進（LIFE）の評価</span>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          ${canEdit ? `
            <button type="button" class="btn btn-secondary" style="font-size:13px; padding:3px 8px;" onclick="openLifeAssessmentModal(${r.id})">
              ＋ LIFE評価入力
            </button>
          ` : ""}
          <button type="button" class="btn btn-secondary" style="font-size:13px; padding:3px 8px;" onclick="openLifeAssessmentHistoryModal(${r.id})">
            評価履歴 (${validAssessments.length}件)
          </button>
        </div>
      </div>
      ${bodyHtml}
    </div>
  `;
}

// 7. 提出用ファイル書き出し（CSV）
// - 利用者情報_1_YYYYMMDD.csv
// - 科学的介護推進に関する評価_1_YYYYMMDD.csv
// ----------------------------------------------------------------------
function cpFormatDateToYmd8(dStr) {
  if (!dStr) return "";
  return String(dStr).replace(/[^0-9]/g, "").slice(0, 8);
}

// [Claude追加] 身長・体重は小数1桁（項目一覧: 身長 10.0〜300.0、体重 10.0〜200.0）。範囲外は空にする
function cpLifeFormatBody(v, min, max) {
  const n = parseFloat(v);
  if (!isFinite(n) || n < min || n > max) return "";
  return n.toFixed(1);
}

function cpEscapeLifeCsvValue(val) {
  if (val === null || val === undefined) return "";
  const s = String(val).trim();
  if (s.includes(",") || s.includes('"') || s.includes("\r") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// 利用者情報CSV行の組み立て
function cpBuildLifeUserCsvLines(validCandidatesOrResidents, officeNo = "1234567890") {
  const userInfoLines = [
    "SERVICE_USER_INFO",
    CP_LIFE_USER_INFO_COLS.join(",")
  ];

  validCandidatesOrResidents.forEach(item => {
    const r = item.resident ? item.resident : item;
    const a = item.assessment || {};

    const evalDateStr = a.evaluate_date || toLocalDateStr(new Date());
    const lCertCsv = (typeof cpCareCertOn === "function") ? cpCareCertOn(r, evalDateStr) : { level: "", start_date: "", end_date: "" };
    const certLevel = lCertCsv.level || "";
    const isPrevGH = (certLevel && certLevel.includes("要支援2"));
    const serviceCode = isPrevGH ? CP_LIFE_SERVICE_CODE_PREV : CP_LIFE_SERVICE_CODE_GH;
    const extNo = `${officeNo}${serviceCode}${r.id}`;

    // 氏名分割（空白があれば分割、なければ姓に全姓名）
    let lName = "";
    let fName = "";
    if (r.name) {
      const parts = r.name.trim().split(/[\s\u3000]+/);
      lName = parts[0] || "";
      fName = parts.slice(1).join("") || "";
    }
    // [Claude修正] 姓と名を分けていないときは、姓に全部を入れ、名は「００」（項目一覧 利用者名の備考）
    if (lName && !fName) fName = "００";

    const lKanaHan = cpToHalfWidthKana(r.last_name_kana);
    const fKanaHan = cpToHalfWidthKana(r.first_name_kana);

    const genderVal = (r.gender === "男" || r.gender === "1") ? "1" : "2";
    const bDayVal = cpFormatDateToYmd8(r.birth_date || r.birthday);
    // [Claude修正] 認定日は有効期間の開始日と同じとは限らないので、登録の欄ができるまで空にする（必須ではない）
    const certDateVal = cpFormatDateToYmd8(r.certified_date || "");
    const startPeriodVal = cpFormatDateToYmd8(lCertCsv.start_date || "");
    const endPeriodVal = cpFormatDateToYmd8(lCertCsv.end_date || "");
    const careLevelVal = cpCareLevelToLifeCode(lCertCsv.level || "");

    const startDateVal = cpFormatDateToYmd8(r.admission_date);
    const endDateVal = cpFormatDateToYmd8(r.discharge_date);

    // 死亡退所判定
    let deathDateVal = "";
    // [Claude修正] このアプリの退所の理由は「死亡退所」と入るので、「死亡」を含むかで見る
    if (r.discharge_date && (String(r.discharge_reason || "").includes("死亡") || String(r.post_discharge_status || "").includes("死亡"))) {
      deathDateVal = cpFormatDateToYmd8(r.death_date || r.discharge_date);
    }

    const paddedInsuredNo = String(r.insured_no || "").trim().padStart(10, "0");

    const row = [
      cpEscapeLifeCsvValue(officeNo),
      cpEscapeLifeCsvValue(serviceCode),
      cpEscapeLifeCsvValue(extNo),
      cpEscapeLifeCsvValue(r.insurer_no),
      cpEscapeLifeCsvValue(paddedInsuredNo),
      cpEscapeLifeCsvValue(lName),
      cpEscapeLifeCsvValue(fName),
      cpEscapeLifeCsvValue(lKanaHan),
      cpEscapeLifeCsvValue(fKanaHan),
      cpEscapeLifeCsvValue(genderVal),
      cpEscapeLifeCsvValue(bDayVal),
      cpEscapeLifeCsvValue(certDateVal),
      cpEscapeLifeCsvValue(startPeriodVal),
      cpEscapeLifeCsvValue(endPeriodVal),
      cpEscapeLifeCsvValue(careLevelVal),
      cpEscapeLifeCsvValue(a.impaired_elderly_independence_degree || ""),
      cpEscapeLifeCsvValue(a.dementia_elderly_independence_degree || ""),
      cpEscapeLifeCsvValue(startDateVal),
      cpEscapeLifeCsvValue(endDateVal),
      cpEscapeLifeCsvValue(deathDateVal),
      cpEscapeLifeCsvValue(r.remarks || ""),
      cpEscapeLifeCsvValue(CP_LIFE_SPEC_VERSION)
    ];

    userInfoLines.push(row.join(","));
  });

  return userInfoLines;
}

// 科学的介護推進に関する評価CSV行の組み立て
function cpBuildLifeEvalCsvLines(validCandidates, officeNo = "1234567890") {
  const evalLines = [
    "SCIENTIFIC_NURSING_CARE_PROMOTION_2024",
    CP_LIFE_EVALUATION_COLS.join(",")
  ];

  validCandidates.forEach(item => {
    const r = item.resident ? item.resident : item;
    const a = item.assessment || {};

    const evalDateStr = a.evaluate_date || toLocalDateStr(new Date());
    const lCertEval = (typeof cpCareCertOn === "function") ? cpCareCertOn(r, evalDateStr) : { level: "" };
    const certLevel = lCertEval.level || "";
    const isPrevGH = (certLevel && certLevel.includes("要支援2"));
    const serviceCode = isPrevGH ? CP_LIFE_SERVICE_CODE_PREV : CP_LIFE_SERVICE_CODE_GH;
    // [Claude修正] 外部システム管理番号は半角英数（項目一覧）。「_」をやめ、区切りは英字の A にする
    const extNo = `${officeNo}${serviceCode}${r.id}A${a.id || 0}`;
    const paddedInsuredNo = String(r.insured_no || "").trim().padStart(10, "0");
    const evalDateVal = cpFormatDateToYmd8(a.evaluate_date);

    const rowObj = {
      care_facility_id: officeNo,
      service_code: serviceCode,
      insurer_no: r.insurer_no,
      insured_no: paddedInsuredNo,
      external_system_management_number: extNo,
      facility_outpatient_category: CP_LIFE_FACILITY_CATEGORY,
      care_level: a.care_level || cpCareLevelToLifeCode(typeof cpCurrentCareLevel === "function" ? cpCurrentCareLevel(r, a.evaluate_date) : ""),
      impaired_elderly_independence_degree: a.impaired_elderly_independence_degree,
      dementia_elderly_independence_degree: a.dementia_elderly_independence_degree,
      evaluate_date: evalDateVal,
      status: a.status,
      // 12〜36: 救急搬送（空）
      emergency_hospitalization_date_01: "",
      emergency_hospitalization_complaint_fever_01: "",
      emergency_hospitalization_complaint_fall_down_01: "",
      emergency_hospitalization_complaint_other_01: "",
      emergency_hospitalization_complaint_other_content_01: "",
      emergency_hospitalization_date_02: "",
      emergency_hospitalization_complaint_fever_02: "",
      emergency_hospitalization_complaint_fall_down_02: "",
      emergency_hospitalization_complaint_other_02: "",
      emergency_hospitalization_complaint_other_content_02: "",
      emergency_hospitalization_date_03: "",
      emergency_hospitalization_complaint_fever_03: "",
      emergency_hospitalization_complaint_fall_down_03: "",
      emergency_hospitalization_complaint_other_03: "",
      emergency_hospitalization_complaint_other_content_03: "",
      emergency_hospitalization_date_04: "",
      emergency_hospitalization_complaint_fever_04: "",
      emergency_hospitalization_complaint_fall_down_04: "",
      emergency_hospitalization_complaint_other_04: "",
      emergency_hospitalization_complaint_other_content_04: "",
      emergency_hospitalization_date_05: "",
      emergency_hospitalization_complaint_fever_05: "",
      emergency_hospitalization_complaint_fall_down_05: "",
      emergency_hospitalization_complaint_other_05: "",
      emergency_hospitalization_complaint_other_content_05: "",
      family: a.family ? String(a.family) : "",
      barthel_index_meal: a.barthel_index_meal !== undefined ? String(a.barthel_index_meal) : "",
      barthel_transfer: a.barthel_transfer !== undefined ? String(a.barthel_transfer) : "",
      barthel_index_personal_hygiene_and_adjustment: a.barthel_index_personal_hygiene_and_adjustment !== undefined ? String(a.barthel_index_personal_hygiene_and_adjustment) : "",
      barthel_index_toilet_activity: a.barthel_index_toilet_activity !== undefined ? String(a.barthel_index_toilet_activity) : "",
      barthel_index_bathing: a.barthel_index_bathing !== undefined ? String(a.barthel_index_bathing) : "",
      barthel_index_flat_ground_walking: a.barthel_index_flat_ground_walking !== undefined ? String(a.barthel_index_flat_ground_walking) : "",
      barthel_index_stair_movement: a.barthel_index_stair_movement !== undefined ? String(a.barthel_index_stair_movement) : "",
      barthel_index_changing_clothes: a.barthel_index_changing_clothes !== undefined ? String(a.barthel_index_changing_clothes) : "",
      barthel_index_defecation_manage: a.barthel_index_defecation_manage !== undefined ? String(a.barthel_index_defecation_manage) : "",
      barthel_index_urination_manage: a.barthel_index_urination_manage !== undefined ? String(a.barthel_index_urination_manage) : "",
      departure_date: a.status === "3" ? cpFormatDateToYmd8(a.departure_date) : "",
      departure: a.status === "3" ? (a.departure || "") : "",
      height: cpLifeFormatBody(a.height, 10, 300),
      weight: cpLifeFormatBody(a.weight, 10, 200),
      // 52〜65: 栄養の項目（グループホームでは空）
      low_operating_risk_level: "",
      food_form_ingestion: "",
      is_nutrition_supply_method_enteral_nutrition: "",
      is_nutrition_supply_method_parenteral_nutrition: "",
      meal_form: "",
      thickening: "",
      dietary_intake: "",
      staple_food_intake: "",
      side_dish_intake: "",
      required_nutrients_energy: "",
      required_nutrients_protein: "",
      provided_nutrients_energy: "",
      provided_nutrients_protein: "",
      bedsore: "",
      denture: a.denture !== undefined && a.denture !== null ? String(a.denture) : "",
      choke: a.choke !== undefined && a.choke !== null ? String(a.choke) : "",
      stains_on_teeth: a.stains_on_teeth !== undefined && a.stains_on_teeth !== null ? String(a.stains_on_teeth) : "",
      condition_of_gums: a.condition_of_gums !== undefined && a.condition_of_gums !== null ? String(a.condition_of_gums) : "",
      diagnosis_of_dementia_01: a.diagnosis_of_dementia_01 !== undefined ? String(a.diagnosis_of_dementia_01) : "0",
      diagnosis_of_dementia_02: a.diagnosis_of_dementia_02 !== undefined ? String(a.diagnosis_of_dementia_02) : "0",
      diagnosis_of_dementia_03: a.diagnosis_of_dementia_03 !== undefined ? String(a.diagnosis_of_dementia_03) : "0",
      diagnosis_of_dementia_other: a.diagnosis_of_dementia_other !== undefined ? String(a.diagnosis_of_dementia_other) : "0",
      diagnosis_of_dementia_other_name: String(a.diagnosis_of_dementia_other) === "1" ? (a.diagnosis_of_dementia_other_name || "") : "",
      diagnosis_of_dementia_evaluate_1_1: a.diagnosis_of_dementia_evaluate_1_1 !== undefined ? String(a.diagnosis_of_dementia_evaluate_1_1) : "",
      diagnosis_of_dementia_evaluate_1_2: a.diagnosis_of_dementia_evaluate_1_2 !== undefined ? String(a.diagnosis_of_dementia_evaluate_1_2) : "",
      diagnosis_of_dementia_evaluate_2: a.diagnosis_of_dementia_evaluate_2 !== undefined ? String(a.diagnosis_of_dementia_evaluate_2) : "",
      diagnosis_of_dementia_evaluate_3: a.diagnosis_of_dementia_evaluate_3 !== undefined ? String(a.diagnosis_of_dementia_evaluate_3) : "",
      diagnosis_of_dementia_evaluate_4: a.diagnosis_of_dementia_evaluate_4 !== undefined ? String(a.diagnosis_of_dementia_evaluate_4) : "",
      diagnosis_of_dementia_evaluate_5: a.diagnosis_of_dementia_evaluate_5 !== undefined ? String(a.diagnosis_of_dementia_evaluate_5) : "",
      diagnosis_of_dementia_evaluate_6: a.diagnosis_of_dementia_evaluate_6 !== undefined ? String(a.diagnosis_of_dementia_evaluate_6) : "",
      vitality_index_01: a.vitality_index_01 !== undefined && a.vitality_index_01 !== null ? String(a.vitality_index_01) : "",
      vitality_index_02: a.vitality_index_02 !== undefined && a.vitality_index_02 !== null ? String(a.vitality_index_02) : "",
      vitality_index_03: a.vitality_index_03 !== undefined && a.vitality_index_03 !== null ? String(a.vitality_index_03) : "",
      vitality_index_04: a.vitality_index_04 !== undefined && a.vitality_index_04 !== null ? String(a.vitality_index_04) : "",
      vitality_index_05: a.vitality_index_05 !== undefined && a.vitality_index_05 !== null ? String(a.vitality_index_05) : "",
      // 87〜113: DBD13 & ICF（空）
      dbd13_01: "", dbd13_02: "", dbd13_03: "", dbd13_04: "", dbd13_05: "",
      dbd13_06: "", dbd13_07: "", dbd13_08: "", dbd13_09: "", dbd13_10: "",
      dbd13_11: "", dbd13_12: "", dbd13_13: "",
      basic_operation: "", walking_moving: "", cognitive_orientation: "",
      cognitive_communication: "", cognitive_mental_activity: "",
      swallowing_function: "", eating_assistance: "", excretion: "",
      bathing: "", oral_care: "", dressing: "", dressing_action: "",
      leisure: "", communication: "",
      version: CP_LIFE_SPEC_VERSION
    };

    const row = CP_LIFE_EVALUATION_COLS.map(cName => cpEscapeLifeCsvValue(rowObj[cName] !== undefined ? rowObj[cName] : ""));
    evalLines.push(row.join(","));
  });

  return evalLines;
}

function cpExportLifeCsv(targetMonth) {
  const ym = targetMonth || gLifeSelectedMonth || toLocalDateStr(new Date()).slice(0, 7);
  if (typeof isCurrentStaffAdminOrClerk === "function" && !isCurrentStaffAdminOrClerk()) {
    alert("LIFE提出用ファイルの書き出しは、管理者および事務員のみ実行可能です。");
    return;
  }

    const settings = (typeof cpGetKasanSettings === "function")
    ? cpGetKasanSettings()
    : ((db && db.data && db.data.kasan_settings) || {});

  const officeNo = (settings.office_no || "").trim();
  if (!officeNo || officeNo.length !== 10) {
    alert("事業所の体制加算設定で「事業所番号（10桁）」を正しく登録してください。");
    return;
  }

  cpInitLifeAssessments();
  const allResidents = (gState && gState.residents) ? gState.residents : ((db && db.data && db.data.residents) || []);

  // 対象月に評価がある、または要る月で評価済みの利用者を抽出
  const targetCandidates = [];
  allResidents.forEach(r => {
    if (r.usage_type === "short") return;
    const isReq = cpIsLifeAssessmentRequiredMonth(r, ym, settings);
    const a = cpGetLifeAssessmentForResidentInMonth(r.id, ym);
    if (a) {
      targetCandidates.push({ resident: r, assessment: a, isRequired: isReq });
    }
  });

  if (targetCandidates.length === 0) {
    alert(`${ym} に提出対象となるLIFE評価の記録（入力済み）がありません。`);
    return;
  }

  // ◎ 必須項目の事前検査
  const validCandidates = [];
  const invalidResidents = [];

  targetCandidates.forEach(item => {
    const r = item.resident;
    const a = item.assessment;
    const missing = [];

    // 氏名・カナ
    if (!r.name) missing.push("氏名");
    // [Claude修正] カナは半角カナにしたあと、半角カナ・英数字だけになっているかも見る
    const kanaOk = v => { const s = cpToHalfWidthKana(v); return !!s && s.length <= 30 && /^[\uFF61-\uFF9F0-9A-Za-z]+$/.test(s); };
    if (!r.last_name_kana) missing.push("姓カナ"); else if (!kanaOk(r.last_name_kana)) missing.push("姓カナ（カタカナで）");
    if (!r.first_name_kana) missing.push("名カナ"); else if (!kanaOk(r.first_name_kana)) missing.push("名カナ（カタカナで）");
    // 保険者・被保険者番号
    if (!/^\d{6}$/.test(String(r.insurer_no || "").trim())) missing.push("保険者番号（数字6桁）");
    if (!/^[0-9A-Za-z]{1,10}$/.test(String(r.insured_no || "").trim())) missing.push("被保険者番号（10桁以内の英数字）");
    // 性別・生年月日
    if (!r.gender) missing.push("性別");
    if (!r.birth_date && !r.birthday) missing.push("生年月日");
    // 要介護度
    const clCode = cpCareLevelToLifeCode(typeof cpCurrentCareLevel === "function" ? cpCurrentCareLevel(r, a.evaluate_date) : "");
    if (!clCode) missing.push("要介護度");
    // 評価日・自立度
    if (!a.evaluate_date) missing.push("評価日");
    if (!a.impaired_elderly_independence_degree) missing.push("障害高齢者自立度");
    if (!a.dementia_elderly_independence_degree) missing.push("認知症自立度");

    if (missing.length > 0) {
      invalidResidents.push({ resident: r, missing: missing });
    } else {
      validCandidates.push(item);
    }
  });

  // 不備がある人がいればモーダルで一覧表示
  if (invalidResidents.length > 0) {
    openLifeExportMissingModal(invalidResidents, validCandidates.length);
    if (validCandidates.length === 0) {
      return;
    }
  }

  // 有効なデータのみ書き出し実行
  const todayStrYmd = cpFormatDateToYmd8(toLocalDateStr(new Date()));

  // 1. 利用者情報CSV作成
  const userInfoLines = cpBuildLifeUserCsvLines(validCandidates, officeNo);

  // 2. 科学的介護推進に関する評価CSV作成
  const evalLines = cpBuildLifeEvalCsvLines(validCandidates, officeNo);
  // ダウンロード実行 (BOMあり + CRLF)
  const userCsvContent = "\uFEFF" + userInfoLines.join("\r\n") + "\r\n";
  const evalCsvContent = "\uFEFF" + evalLines.join("\r\n") + "\r\n";

  const userFileName = `利用者情報_1_${todayStrYmd}.csv`;
  const evalFileName = `科学的介護推進に関する評価_1_${todayStrYmd}.csv`;

  cpTriggerDownload(userFileName, userCsvContent);
  setTimeout(() => {
    cpTriggerDownload(evalFileName, evalCsvContent);
  }, 400);

  // settings_logs へ記録
  if (!Array.isArray(db.data.settings_logs)) db.data.settings_logs = [];
  db.data.settings_logs.push({
    id: Date.now(),
    at: toLocalDateTimeStr(new Date()),
    by: typeof cpLedgerStaff === "function" ? cpLedgerStaff() : "",
    kind: "LIFE提出CSV出力",
    action: `${ym} 評価提出CSV出力 (${validCandidates.length}名分)`
  });
  db.save();

  alert(`LIFE提出用CSVファイル（2ファイル、${validCandidates.length}名分）を書き出しました。\n・${userFileName}\n・${evalFileName}`);
}

function cpTriggerDownload(fileName, content) {
  try {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch(e) {
    console.error("Download failed:", e);
  }
}

// 不備一覧モーダル
function openLifeExportMissingModal(invalidList, validCount) {
  const modal = document.getElementById("lifeExportMissingModal");
  if (!modal) return;

  const countEl = document.getElementById("lifeExportMissingCountDisplay");
  if (countEl) countEl.textContent = `不足情報あり: ${invalidList.length}名 （出力可能: ${validCount}名）`;

  const container = document.getElementById("lifeExportMissingListContainer");
  if (container) {
    container.innerHTML = invalidList.map(item => `
      <div style="border-bottom:1px solid var(--line-2); padding:8px 0; font-size:13px;">
        <div style="font-weight:bold; color:var(--alert);">${escapeHtml(item.resident.name || "名称未登録")}</div>
        <div style="color:var(--ink-2); margin-top:2px;">不足項目: ${escapeHtml(item.missing.join("、"))}</div>
      </div>
    `).join("");
  }

  modal.style.display = "flex";
}

function closeLifeExportMissingModal() {
  const modal = document.getElementById("lifeExportMissingModal");
  if (modal) modal.style.display = "none";
}
