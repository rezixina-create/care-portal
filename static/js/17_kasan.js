// ======================================================================
// 17_kasan.js: 加算・減算の「月の確認表」（第1段階）および停電に備えた印刷
// サービス種類 32: 認知症対応型共同生活介護
// ======================================================================

// 1. コード表（公的資料準拠の定数定義）
const CP_KASAN_BASIC_CODES = {
  unit1: {
    "要介護1": { code: "1111", units: 765, name: "認知症対応型共同生活介護費（Ⅰ）要介護1" },
    "要介護2": { code: "1121", units: 801, name: "認知症対応型共同生活介護費（Ⅰ）要介護2" },
    "要介護3": { code: "1131", units: 824, name: "認知症対応型共同生活介護費（Ⅰ）要介護3" },
    "要介護4": { code: "1141", units: 841, name: "認知症対応型共同生活介護費（Ⅰ）要介護4" },
    "要介護5": { code: "1151", units: 859, name: "認知症対応型共同生活介護費（Ⅰ）要介護5" }
  },
  unit2: {
    "要介護1": { code: "2111", units: 753, name: "認知症対応型共同生活介護費（Ⅱ）要介護1" },
    "要介護2": { code: "2121", units: 788, name: "認知症対応型共同生活介護費（Ⅱ）要介護2" },
    "要介護3": { code: "2131", units: 812, name: "認知症対応型共同生活介護費（Ⅱ）要介護3" },
    "要介護4": { code: "2141", units: 828, name: "認知症対応型共同生活介護費（Ⅱ）要介護4" },
    "要介護5": { code: "2151", units: 845, name: "認知症対応型共同生活介護費（Ⅱ）要介護5" }
  }
};

const CP_KASAN_RESIDENT_DEFS = {
  initial: { code: "1550", units: 30, unit_type: "日", name: "初期加算（30日以内）" },
  hospital: { code: "6400", units: 246, unit_type: "日", name: "入院時費用（初日最終日除外・月6日まで）" },
  mitori_31_45: { code: "6140", units: 72, unit_type: "日", name: "看取り介護加算（死亡日以前31〜45日）" },
  mitori_4_30: { code: "6142", units: 144, unit_type: "日", name: "看取り介護加算（死亡日以前4〜30日）" },
  mitori_2_3: { code: "6143", units: 680, unit_type: "日", name: "看取り介護加算（前日・前々日）" },
  mitori_death: { code: "6144", units: 1280, unit_type: "日", name: "看取り介護加算（死亡日）" },
  discharge_consult: { code: "6502", units: 400, unit_type: "回", name: "退居時相談援助加算（1回限り）" },
  discharge_info: { code: "6150", units: 250, unit_type: "回", name: "退居時情報提供加算" },
  life: { code: "6361", units: 40, unit_type: "月", name: "科学的介護推進体制加算" }
};

const CP_KASAN_TAISEI_DEFS = [
  {
    id: "night_support",
    name: "夜間支援体制加算",
    unit_type: "日",
    options: [
      { key: "none", label: "届出なし", code: null, units: 0 },
      { key: "1", label: "夜間支援体制加算（Ⅰ）", code: "6161", units: 50 },
      { key: "2", label: "夜間支援体制加算（Ⅱ）", code: "6171", units: 25 }
    ]
  },
  {
    id: "medical_coop",
    name: "医療連携体制加算",
    unit_type: "日",
    options: [
      { key: "none", label: "届出なし", code: null, units: 0 },
      { key: "1_a", label: "医療連携体制加算（Ⅰ）イ", code: "1602", units: 57 },
      { key: "1_b", label: "医療連携体制加算（Ⅰ）ロ", code: "1601", units: 47 },
      { key: "1_c", label: "医療連携体制加算（Ⅰ）ハ", code: "1600", units: 37 },
      { key: "2", label: "医療連携体制加算（Ⅱ）", code: "1603", units: 5 }
    ]
  },
  {
    id: "dementia_care",
    name: "認知症専門ケア加算",
    unit_type: "日",
    options: [
      { key: "none", label: "届出なし", code: null, units: 0 },
      { key: "1", label: "認知症専門ケア加算（Ⅰ）", code: "6133", units: 3 },
      { key: "2", label: "認知症専門ケア加算（Ⅱ）", code: "6134", units: 4 }
    ]
  },
  {
    id: "service_supply",
    name: "サービス提供体制強化加算",
    unit_type: "日",
    options: [
      { key: "none", label: "届出なし", code: null, units: 0 },
      { key: "1", label: "サービス提供体制強化加算（Ⅰ）", code: "6099", units: 22 },
      { key: "2", label: "サービス提供体制強化加算（Ⅱ）", code: "6100", units: 18 },
      { key: "3", label: "サービス提供体制強化加算（Ⅲ）", code: "6103", units: 6 }
    ]
  },
  {
    id: "coop_hospital",
    name: "協力医療機関連携加算",
    unit_type: "月",
    options: [
      { key: "none", label: "届出なし", code: null, units: 0 },
      { key: "1", label: "協力医療機関連携加算（1）", code: "6123", units: 100 },
      { key: "2", label: "協力医療機関連携加算（2）", code: "6124", units: 40 }
    ]
  },
  {
    id: "nutrition",
    name: "栄養管理体制加算",
    unit_type: "月",
    options: [
      { key: "none", label: "届出なし", code: null, units: 0 },
      { key: "1", label: "栄養管理体制加算", code: "6200", units: 30 }
    ]
  },
  {
    id: "oral",
    name: "口腔衛生管理体制加算",
    unit_type: "月",
    options: [
      { key: "none", label: "届出なし", code: null, units: 0 },
      { key: "1", label: "口腔衛生管理体制加算", code: "6122", units: 30 }
    ]
  },
  {
    id: "infection",
    name: "高齢者施設等感染対策向上加算",
    unit_type: "月",
    options: [
      { key: "none", label: "届出なし", code: null, units: 0 },
      { key: "1", label: "高齢者施設等感染対策向上加算（Ⅰ）", code: "6166", units: 10 },
      { key: "2", label: "高齢者施設等感染対策向上加算（Ⅱ）", code: "6167", units: 5 }
    ]
  },
  {
    id: "productivity",
    name: "生産性向上推進体制加算",
    unit_type: "月",
    options: [
      { key: "none", label: "届出なし", code: null, units: 0 },
      { key: "1", label: "生産性向上推進体制加算（Ⅰ）", code: "6237", units: 100 },
      { key: "2", label: "生産性向上推進体制加算（Ⅱ）", code: "6238", units: 10 }
    ]
  },
  {
    id: "life",
    name: "科学的介護推進体制加算",
    unit_type: "月",
    computed_elsewhere: true,
    options: [
      { key: "none", label: "届出なし", code: null, units: 0 },
      { key: "1", label: "科学的介護推進体制加算", code: "6361", units: 40 }
    ]
  },
  {
    id: "dementia_team",
    name: "認知症チームケア推進加算",
    unit_type: "月",
    options: [
      { key: "none", label: "届出なし", code: null, units: 0 },
      { key: "1", label: "認知症チームケア推進加算（Ⅰ）", code: "6153", units: 150 },
      { key: "2", label: "認知症チームケア推進加算（Ⅱ）", code: "6154", units: 120 }
    ]
  }
];

const CP_KASAN_GENSAN_DEFS = [
  {
    id: "restraint",
    name: "身体拘束廃止未実施減算",
    codes: {
      unit1: {
        "要介護1": { code: "6304", units: -77 },
        "要介護2": { code: "6305", units: -80 },
        "要介護3": { code: "6306", units: -82 },
        "要介護4": { code: "6307", units: -84 },
        "要介護5": { code: "6308", units: -86 }
      },
      unit2: {
        "要介護1": { code: "6309", units: -75 },
        "要介護2": { code: "6310", units: -79 },
        "要介護3": { code: "6311", units: -81 },
        "要介護4": { code: "6312", units: -83 },
        "要介護5": { code: "6313", units: -85 }
      }
    }
  },
  {
    id: "abuse",
    name: "高齢者虐待防止措置未実施減算",
    codes: {
      unit1: {
        "要介護1": { code: "C201", units: -8 },
        "要介護2": { code: "C202", units: -8 },
        "要介護3": { code: "C203", units: -8 },
        "要介護4": { code: "C204", units: -8 },
        "要介護5": { code: "C205", units: -9 }
      },
      unit2: {
        "要介護1": { code: "C206", units: -8 },
        "要介護2": { code: "C207", units: -8 },
        "要介護3": { code: "C208", units: -8 },
        "要介護4": { code: "C209", units: -8 },
        "要介護5": { code: "C210", units: -8 }
      }
    }
  },
  {
    id: "bcp",
    name: "業務継続計画未策定減算",
    codes: {
      unit1: {
        "要介護1": { code: "D201", units: -23 },
        "要介護2": { code: "D202", units: -24 },
        "要介護3": { code: "D203", units: -25 },
        "要介護4": { code: "D204", units: -25 },
        "要介護5": { code: "D205", units: -26 }
      },
      unit2: {
        "要介護1": { code: "D206", units: -23 },
        "要介護2": { code: "D207", units: -24 },
        "要介護3": { code: "D208", units: -24 },
        "要介護4": { code: "D209", units: -25 },
        "要介護5": { code: "D210", units: -25 }
      }
    }
  }
];

const CP_KASAN_REGION_RATES = [
  { key: "1級地", rate: 10.90 },
  { key: "2級地", rate: 10.72 },
  { key: "3級地", rate: 10.68 },
  { key: "4級地", rate: 10.54 },
  { key: "5級地", rate: 10.45 },
  { key: "6級地", rate: 10.27 },
  { key: "7級地", rate: 10.14 },
  { key: "その他", rate: 10.00 }
];

const CP_KASAN_SOURCES = [
  {
    label: "WAM 介護給付費単位数等サービスコード表（地域密着型サービス）令和8年6月・8月施行版",
    url: "https://www.wam.go.jp/gyoseiShiryou-files/documents/2026/0520081927889/20260522_005.pdf"
  },
  {
    label: "市川市 令和8年度 運営の手引き 認知症対応型共同生活介護",
    url: "https://www.city.ichikawa.lg.jp/uploaded/attachment/55858.pdf"
  },
  {
    label: "唐津市 令和7年度 集団指導資料 認知症対応型共同生活介護",
    url: "https://www.city.karatsu.lg.jp/uploaded/attachment/23365.pdf"
  },
  {
    label: "厚生労働省 介護給付費分科会 資料「地域区分について」令和6年12月23日",
    url: "https://www.mhlw.go.jp/content/12300000/001477917.pdf"
  }
];

// 2. 記録を読む共通の関数
function cpGetResidentRecordsForPeriod(residentId, fromDate, toDate, category) {
  const rId = Number(residentId);
  const records = (db && db.data && Array.isArray(db.data.care_records)) ? db.data.care_records : [];
  return records.filter(rec => {
    if (!rec || rec.voided) return false;
    if (Number(rec.resident_id) !== rId) return false;
    const d = (rec.date || (rec.recorded_at ? rec.recorded_at.slice(0, 10) : "") || "");
    if (!d) return false;
    if (fromDate && d < fromDate) return false;
    if (toDate && d > toDate) return false;
    if (category && rec.category !== category) return false;
    return true;
  });
}

// 基本日数の数え方（目安・数え方は確認中）
function cpKasanBasicDays(resident, yearMonth) {
  if (!resident || !yearMonth) {
    const res = { basicDays: 0, hospDays: 0, details: {} };
    res.valueOf = function() { return this.basicDays; };
    return res;
  }
  const [yStr, mStr] = yearMonth.split("-");
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(y) || isNaN(m)) {
    const res = { basicDays: 0, hospDays: 0, details: {} };
    res.valueOf = function() { return this.basicDays; };
    return res;
  }

  const daysInMonth = new Date(y, m, 0).getDate();
  const hospitalizations = (typeof cpGetHospitalizations === "function") ? cpGetHospitalizations(resident) : (resident.hospitalizations || []);
  const outings = (typeof cpGetOutings === "function") ? cpGetOutings(resident) : (resident.outings || []);
  const admDate = resident.admission_date || resident.entry_date || "";
  const disDate = resident.discharge_date || "";

  // 1. 各入院の算定適格日を事前計算
  // 1回の入院について、初日(admission_date)翌日から起算
  // 各暦月につき最大6日。月をまたぐ場合は前月末日を含めて連続算定している場合に限り最大連続12日まで。
  const hospBilling = {}; // "YYYY-MM-DD" -> "HOSP_EXPENSE" | "HOSP_OVER"

  hospitalizations.forEach(h => {
    if (!h || !h.admission_date) return;
    const hAdm = h.admission_date;
    const hDis = h.discharge_date || "";

    const [ay, am, ad] = hAdm.split("-").map(Number);
    if (!ay || !am || !ad) return;

    let curDate = new Date(ay, am - 1, ad + 1);
    const endLimitDate = hDis ? (() => {
      const [dy, dm, dd] = hDis.split("-").map(Number);
      return new Date(dy, dm - 1, dd);
    })() : null;

    const monthCounts = {};
    let consecutiveBilled = 0;
    let prevDateWasBilled = false;

    for (let step = 0; step < 365; step++) {
      if (endLimitDate && curDate >= endLimitDate) break;

      const dStr = toLocalDateStr(curDate);
      const curYm = dStr.slice(0, 7);
      const curMCount = monthCounts[curYm] || 0;

      let canBill = false;
      if (curMCount < 6) {
        if (consecutiveBilled === 0) {
          canBill = true;
        } else {
          if (prevDateWasBilled && consecutiveBilled < 12) {
            canBill = true;
          } else {
            canBill = false;
          }
        }
      }

      if (canBill) {
        hospBilling[dStr] = "HOSP_EXPENSE";
        monthCounts[curYm] = curMCount + 1;
        consecutiveBilled++;
        prevDateWasBilled = true;
      } else {
        hospBilling[dStr] = "HOSP_OVER";
        prevDateWasBilled = false;
      }

      curDate.setDate(curDate.getDate() + 1);
    }
  });

  // 2. 月の各日(1日〜daysInMonth)を判定
  let basicDays = 0;
  let hospDays = 0;
  const details = {};

  for (let d = 1; d <= daysInMonth; d++) {
    const dStr = `${yStr}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

    // 入居前
    if (admDate && dStr < admDate) {
      details[dStr] = "NOT_ENROLLED";
      continue;
    }
    // 退所後
    if (disDate && dStr > disDate) {
      details[dStr] = "DISCHARGED";
      continue;
    }

    // 退所日当日: 入院期間中にそのまま退去した場合 (6日の中に入るときだけ)
    if (disDate && dStr === disDate) {
      const activeHosp = hospitalizations.find(h => h && h.admission_date && h.admission_date < disDate && (!h.discharge_date || disDate <= h.discharge_date));
      if (activeHosp && hospBilling[dStr] === "HOSP_EXPENSE") {
        hospDays++;
        details[dStr] = "HOSP_EXPENSE";
        continue;
      }
    }

    // 入院中判定
    let inHosp = false;
    let hospKind = null;
    for (let i = 0; i < hospitalizations.length; i++) {
      const h = hospitalizations[i];
      if (!h || !h.admission_date) continue;
      if (dStr === h.admission_date) {
        inHosp = true;
        hospKind = "BASIC"; // 入院初日は基本単位数
        break;
      }
      if (h.discharge_date && dStr === h.discharge_date) {
        inHosp = true;
        hospKind = "BASIC"; // 退院最終日は基本単位数
        break;
      }
      if (h.admission_date < dStr && (!h.discharge_date || dStr < h.discharge_date)) {
        inHosp = true;
        hospKind = hospBilling[dStr] || "HOSP_OVER";
        break;
      }
    }

    if (inHosp) {
      if (hospKind === "BASIC") {
        basicDays++;
        details[dStr] = "BASIC";
      } else if (hospKind === "HOSP_EXPENSE") {
        hospDays++;
        details[dStr] = "HOSP_EXPENSE";
      } else {
        details[dStr] = "HOSP_OVER";
      }
      continue;
    }

    // 外泊判定
    let inOuting = false;
    let outingKind = null;
    for (let i = 0; i < outings.length; i++) {
      const o = outings[i];
      if (!o || !o.start_date) continue;
      if (dStr === o.start_date) {
        inOuting = true;
        outingKind = "BASIC"; // 外泊初日（出かけた日）は基本単位数
        break;
      }
      if (o.end_date && dStr === o.end_date) {
        inOuting = true;
        outingKind = "BASIC"; // 戻った日は基本単位数
        break;
      }
      if (o.start_date < dStr && (!o.end_date || dStr < o.end_date)) {
        inOuting = true;
        outingKind = "OUTING_MID"; // 外泊の間の日は算定なし
        break;
      }
    }

    if (inOuting) {
      if (outingKind === "BASIC") {
        basicDays++;
        details[dStr] = "BASIC";
      } else {
        details[dStr] = "OUTING_MID";
      }
      continue;
    }

    // 在所
    basicDays++;
    details[dStr] = "BASIC";
  }

  const result = {
    basicDays: basicDays,
    hospDays: hospDays,
    details: details
  };
  result.valueOf = function() { return this.basicDays; };
  return result;
}
function cpGetKasanSettings() {
  const raw = (db && db.data && db.data.kasan_settings) || {};
  return {
    region_type: raw.region_type || "",
    taisei_items: Object.assign({}, raw.taisei_items || {}),
    gensan_items: Object.assign({}, raw.gensan_items || {}),
    committee_rules: Array.isArray(raw.committee_rules) ? raw.committee_rules.slice() : [],
    edit_history: Array.isArray(raw.edit_history) ? raw.edit_history.slice() : []
  };
}

// ユニット判定: 区分が1つなら（Ⅰ）、2つ以上なら（Ⅱ）
function cpKasanUnitKey() {
  const units = (db && db.data && Array.isArray(db.data.units)) ? db.data.units : [];
  return units.length >= 2 ? "unit2" : "unit1";
}

// 利用者ごとの月間加算・減算計算
function cpComputeMonthlyKasan(resident, yearMonth) {
  const r = resident;
  const unitKey = cpKasanUnitKey();
  const settings = cpGetKasanSettings();

  const [yStr, mStr] = yearMonth.split("-");
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  const daysInMonth = (!isNaN(y) && !isNaN(m)) ? new Date(y, m, 0).getDate() : 30;

  const daysCalc = cpKasanBasicDays(r, yearMonth);
  const basicDays = (typeof daysCalc === "number") ? daysCalc : daysCalc.basicDays;
  const hospDaysCount = (daysCalc && typeof daysCalc.hospDays === "number") ? daysCalc.hospDays : 0;

  const items = [];

  // 1. 基本サービスコード
  const careLevel = r.care_level || "";
  // [Claude修正] 要介護度が無い・要介護1〜5以外のときに「要介護3」として数えていた。決めつけずに付けない
  const basicCodeObj = CP_KASAN_BASIC_CODES[unitKey][careLevel] || null;
  if (!basicCodeObj) {
    return { resident: r, yearMonth: yearMonth, unitKey: unitKey, basicDays: basicDays, hospDays: hospDaysCount, items: [], totalUnits: 0, regionType: settings.region_type, regionRate: null, estimatedYen: null, levelMissing: true, careLevel: careLevel };
  }
  if (basicDays > 0) {
    items.push({
      category: "基本",
      code: basicCodeObj.code,
      name: basicCodeObj.name,
      unit_price: basicCodeObj.units,
      count: basicDays,
      unit_label: "日",
      subtotal: basicCodeObj.units * basicDays,
      note: ""
    });
  }

  // 2. 利用者ごとの加算
  // a. 初期加算 1550 30単位/日: 入居日から30日以内
  if (r.admission_date) {
    let initDays = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const dStr = `${yStr}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (dStr >= r.admission_date) {
        const diffMs = new Date(dStr) - new Date(r.admission_date);
        const diffDays = Math.floor(diffMs / 86400000);
        if (diffDays >= 0 && diffDays < 30 && daysCalc.details && daysCalc.details[dStr] === "BASIC") { // [Claude修正] 基本の単位数を付ける日だけ
          initDays++;
        }
      }
    }
    if (initDays > 0) {
      items.push({
        category: "個別加算",
        code: CP_KASAN_RESIDENT_DEFS.initial.code,
        name: CP_KASAN_RESIDENT_DEFS.initial.name,
        unit_price: CP_KASAN_RESIDENT_DEFS.initial.units,
        count: initDays,
        unit_label: "日",
        subtotal: CP_KASAN_RESIDENT_DEFS.initial.units * initDays,
        note: `入居日 ${r.admission_date}`
      });
    }
  }

  // b. 入院時費用 6400 246単位/日 [Claude修正] 数え方の関数 cpKasanBasicDays の結果（初日・最終日を除く、月6日、月またぎは連続12日まで）を使う
  if (hospDaysCount > 0) {
    items.push({
      category: "個別加算",
      code: CP_KASAN_RESIDENT_DEFS.hospital.code,
      name: CP_KASAN_RESIDENT_DEFS.hospital.name,
      unit_price: CP_KASAN_RESIDENT_DEFS.hospital.units,
      count: hospDaysCount,
      unit_label: "日",
      subtotal: CP_KASAN_RESIDENT_DEFS.hospital.units * hospDaysCount,
      note: "届出が要る"
    });
  }

  // c. 看取り介護加算（死亡日から数える。その45日の中で入院していた日は数えない。死亡した月にまとめて出す）
  if (r.discharge_reason === "死亡退所" && r.discharge_date) {
    const deathMonth = r.discharge_date.slice(0, 7);
    if (deathMonth === yearMonth) {
      const deathTime = new Date(r.discharge_date).getTime();
      let dCount = 0;
      let d2_3Count = 0;
      let d4_30Count = 0;
      let d31_45Count = 0;
      const mitoriDetails = {};

      for (let offset = 0; offset < 45; offset++) {
        const targetMs = deathTime - (offset * 86400000);
        const targetDateStr = toLocalDateStr(new Date(targetMs));
        // [Claude修正] 基本の単位数を付ける日だけ数える（入院・外泊の間の日は除く。前の月の日は前の月の数え方で見る）
        const tYm = targetDateStr.slice(0, 7);
        if (!mitoriDetails[tYm]) mitoriDetails[tYm] = cpKasanBasicDays(r, tYm).details || {};
        if (mitoriDetails[tYm][targetDateStr] !== "BASIC") continue;

        if (offset === 0) dCount++;
        else if (offset >= 1 && offset <= 2) d2_3Count++;
        else if (offset >= 3 && offset <= 29) d4_30Count++;
        else if (offset >= 30 && offset <= 44) d31_45Count++;
      }

      if (dCount > 0) {
        items.push({
          category: "看取り",
          code: CP_KASAN_RESIDENT_DEFS.mitori_death.code,
          name: CP_KASAN_RESIDENT_DEFS.mitori_death.name,
          unit_price: CP_KASAN_RESIDENT_DEFS.mitori_death.units,
          count: dCount,
          unit_label: "日",
          subtotal: CP_KASAN_RESIDENT_DEFS.mitori_death.units * dCount,
          note: `死亡日: ${r.discharge_date}（届出・医療連携体制加算・同意などの条件は確認してください）`
        });
      }
      if (d2_3Count > 0) {
        items.push({
          category: "看取り",
          code: CP_KASAN_RESIDENT_DEFS.mitori_2_3.code,
          name: CP_KASAN_RESIDENT_DEFS.mitori_2_3.name,
          unit_price: CP_KASAN_RESIDENT_DEFS.mitori_2_3.units,
          count: d2_3Count,
          unit_label: "日",
          subtotal: CP_KASAN_RESIDENT_DEFS.mitori_2_3.units * d2_3Count,
          note: ""
        });
      }
      if (d4_30Count > 0) {
        items.push({
          category: "看取り",
          code: CP_KASAN_RESIDENT_DEFS.mitori_4_30.code,
          name: CP_KASAN_RESIDENT_DEFS.mitori_4_30.name,
          unit_price: CP_KASAN_RESIDENT_DEFS.mitori_4_30.units,
          count: d4_30Count,
          unit_label: "日",
          subtotal: CP_KASAN_RESIDENT_DEFS.mitori_4_30.units * d4_30Count,
          note: ""
        });
      }
      if (d31_45Count > 0) {
        items.push({
          category: "看取り",
          code: CP_KASAN_RESIDENT_DEFS.mitori_31_45.code,
          name: CP_KASAN_RESIDENT_DEFS.mitori_31_45.name,
          unit_price: CP_KASAN_RESIDENT_DEFS.mitori_31_45.units,
          count: d31_45Count,
          unit_label: "日",
          subtotal: CP_KASAN_RESIDENT_DEFS.mitori_31_45.units * d31_45Count,
          note: ""
        });
      }
    }
  }

  // d. 退居時相談援助加算（利用1か月超、退居から2週間以内、死亡退所除外）
  if (r.status === "退所" && r.discharge_reason !== "死亡退所" && r.discharge_date) {
    if (r.discharge_date.slice(0, 7) === yearMonth && r.admission_date) {
      const stayDays = Math.floor((new Date(r.discharge_date) - new Date(r.admission_date)) / 86400000);
      if (stayDays > 30) {
        items.push({
          category: "個別加算",
          code: CP_KASAN_RESIDENT_DEFS.discharge_consult.code,
          name: CP_KASAN_RESIDENT_DEFS.discharge_consult.name,
          unit_price: CP_KASAN_RESIDENT_DEFS.discharge_consult.units,
          count: 1,
          unit_label: "回",
          subtotal: 0,
          candidate: true,
          note: `候補（退居日 ${r.discharge_date}）。退居から2週間以内に相談援助を行ったか、退居先（入院・他の介護保険施設は対象外）を確かめてから請求する。合計には入れていない`
        });
      }
    }
  }

  // e. 科学的介護推進体制加算 [Claude修正] 1月につき40単位（サービスコード表）。届出があれば毎月付く（提出の月だけではない）。
  //    LIFE への提出が要る月（利用開始月・少なくとも3か月ごと・終了月）は、別に「提出の月」として知らせる
  let lifeSubmitNote = "";
  if (r.admission_date) {
    const isStartMonth = (r.admission_date.slice(0, 7) === yearMonth);
    const isEndMonth = (r.discharge_date && r.discharge_date.slice(0, 7) === yearMonth);
    const startY = parseInt(r.admission_date.slice(0, 4), 10);
    const startM = parseInt(r.admission_date.slice(5, 7), 10);
    const diffMonths = ((y - startY) * 12) + (m - startM);
    if (basicDays > 0 && (isStartMonth || isEndMonth || (diffMonths >= 0 && diffMonths % 3 === 0))) {
      lifeSubmitNote = isStartMonth ? "LIFE 提出の月（利用開始月）" : (isEndMonth ? "LIFE 提出の月（利用終了月）" : "LIFE 提出の月（3か月ごとの目安）");
    }
  }
  const lifeSet = settings.taisei_items.life;
  if (lifeSet && lifeSet.option_key === "1" && basicDays > 0) {
    items.push({
      category: "体制加算",
      code: CP_KASAN_RESIDENT_DEFS.life.code,
      name: "科学的介護推進体制加算",
      unit_price: CP_KASAN_RESIDENT_DEFS.life.units,
      count: 1,
      unit_label: "月",
      subtotal: CP_KASAN_RESIDENT_DEFS.life.units,
      note: lifeSubmitNote
    });
  }

  // 3. 事業所体制の加算（届出済みで有効なもの）
  CP_KASAN_TAISEI_DEFS.forEach(def => {
    const setItem = settings.taisei_items[def.id];
    if (def.computed_elsewhere) return; // 科学的介護推進体制加算は上で数える
    if (setItem && setItem.option_key && setItem.option_key !== "none") {
      const opt = def.options.find(o => o.key === setItem.option_key);
      if (opt && opt.code && opt.units > 0) {
        if (def.unit_type === "日" && basicDays > 0) {
          items.push({
            category: "体制加算",
            code: opt.code,
            name: opt.label,
            unit_price: opt.units,
            count: basicDays,
            unit_label: "日",
            subtotal: opt.units * basicDays,
            note: ""
          });
        } else if (def.unit_type === "月" && basicDays > 0) {
          items.push({
            category: "体制加算",
            code: opt.code,
            name: opt.label,
            unit_price: opt.units,
            count: 1,
            unit_label: "月",
            subtotal: opt.units,
            note: ""
          });
        }
      }
    }
  });

  // 4. 減算（未実施期間に該当する場合）
  CP_KASAN_GENSAN_DEFS.forEach(def => {
    const gSet = settings.gensan_items[def.id];
    if (gSet && gSet.has_gensan === "あり" && basicDays > 0) {
      const inRange = (!gSet.start_month || yearMonth >= gSet.start_month) &&
                      (!gSet.end_month || yearMonth <= gSet.end_month);
      if (inRange) {
        const reductionObj = def.codes[unitKey] && def.codes[unitKey][careLevel];
        if (reductionObj) {
          items.push({
            category: "減算",
            code: reductionObj.code,
            name: `${def.name}（${careLevel}）`,
            unit_price: reductionObj.units,
            count: basicDays,
            unit_label: "日",
            subtotal: reductionObj.units * basicDays,
            note: gSet.reason || "未実施"
          });
        }
      }
    }
  });

  const totalUnits = items.reduce((sum, it) => sum + it.subtotal, 0);

  // 地域区分の単価計算
  const regionObj = CP_KASAN_REGION_RATES.find(r => r.key === settings.region_type);
  const regionRate = regionObj ? regionObj.rate : null;
  const estimatedYen = regionRate !== null ? Math.floor(totalUnits * regionRate) : null;

  return {
    resident: r,
    yearMonth: yearMonth,
    unitKey: unitKey,
    basicDays: basicDays,
    hospDays: hospDaysCount,
    items: items,
    totalUnits: totalUnits,
    regionType: settings.region_type,
    regionRate: regionRate,
    estimatedYen: estimatedYen
  };
}

// 3. 画面描画: 事務ポータル「加算・減算」タブ
let gKasanSelectedMonth = "";

function onKasanMonthChange(val) {
  gKasanSelectedMonth = val || toLocalDateStr(new Date()).slice(0, 7);
  renderOfficeKasanTab();
}

function renderOfficeKasanTab() {
  const container = document.getElementById("tabOfficeKasan");
  if (!container) return;

  if (typeof isCurrentStaffAdminOrClerk === "function" && !isCurrentStaffAdminOrClerk()) {
    container.innerHTML = `<div class="panel-card" style="padding:20px; text-align:center; color:var(--ink-3);">加算・減算の確認表は、管理者および事務員のみ閲覧可能です。</div>`;
    return;
  }

  if (!gKasanSelectedMonth) {
    gKasanSelectedMonth = toLocalDateStr(new Date()).slice(0, 7);
  }
  const ym = gKasanSelectedMonth;
  const unitKey = cpKasanUnitKey();
  const unitCount = (db && db.data && Array.isArray(db.data.units)) ? db.data.units.length : 0;
  const unitLabel = unitKey === "unit2" ? "認知症対応型共同生活介護費（Ⅱ）" : "認知症対応型共同生活介護費（Ⅰ）";

  const settings = cpGetKasanSettings();
  const regionObj = CP_KASAN_REGION_RATES.find(r => r.key === settings.region_type);

  // 体制加算件数
  const notifiedCount = Object.values(settings.taisei_items).filter(x => x && x.option_key && x.option_key !== "none").length;
  // 減算件数
  const activeGensanCount = Object.values(settings.gensan_items).filter(x => {
    if (!x || x.has_gensan !== "あり") return false;
    return (!x.start_month || ym >= x.start_month) && (!x.end_month || ym <= x.end_month);
  }).length;

  // 対象利用者の集計（退所者でも当月在所日・入院日・死亡退所がある場合は表に出す）
  const allResidents = (db && db.data && Array.isArray(db.data.residents)) ? db.data.residents : [];
  const monthlyResults = [];
  let grandTotalUnits = 0;
  let grandTotalYen = 0;

  allResidents.forEach(r => {
    const resCalc = cpComputeMonthlyKasan(r, ym);
    if (resCalc.basicDays > 0 || resCalc.hospDays > 0 || resCalc.items.length > 0) {
      monthlyResults.push(resCalc);
      grandTotalUnits += resCalc.totalUnits;
      if (resCalc.estimatedYen !== null) {
        grandTotalYen += resCalc.estimatedYen;
      }
    }
  });

  // 表の各行HTML
  const rowsHtml = monthlyResults.map(res => {
    const r = res.resident;
    const codesHtml = (res.levelMissing ? `<div style="font-size:13px; color:var(--caution); font-weight:bold;">要介護度が未登録か要介護1〜5ではないため、数えていません（${escapeHtml(res.careLevel || "未登録")}）</div>` : "") + res.items.map(it => {
      if (it.candidate) {
        return `<div style="font-size:13px; margin-bottom:2px; color:var(--caution);"><span class="badge" style="background:var(--ground); color:var(--ink-2); font-size:13px; padding:1px 5px;">${escapeHtml(it.code)}</span> <strong>${escapeHtml(it.name)}</strong>: ${it.unit_price}単位（${escapeHtml(it.note)}）</div>`;
      }
      const isMinus = it.subtotal < 0;
      const colorStyle = isMinus ? "color:var(--alert); font-weight:bold;" : "color:var(--ink);";
      const badgeStyle = isMinus ? "background:var(--alert-tint); color:var(--alert);" : "background:var(--pine-tint); color:var(--pine-dark);";
      return `
        <div style="font-size:13px; margin-bottom:2px; display:flex; align-items:center; gap:4px; flex-wrap:wrap;">
          <span class="badge" style="${badgeStyle} font-size:13px; padding:1px 5px;">${escapeHtml(it.code)}</span>
          <span style="font-weight:bold;">${escapeHtml(it.name)}</span>:
          <span>${it.unit_price}単位 × ${it.count}${escapeHtml(it.unit_label)} ＝</span>
          <span style="${colorStyle}">${it.subtotal.toLocaleString()}単位</span>
          ${it.note ? `<span style="color:var(--ink-3); font-size:13px;">(${escapeHtml(it.note)})</span>` : ""}
        </div>
      `;
    }).join("");

    const yenDisplay = res.estimatedYen !== null
      ? `<strong>${res.estimatedYen.toLocaleString()}</strong> 円`
      : `<span style="font-size:13px; color:var(--caution);">地域区分未選択</span>`;

    return `
      <tr>
        <td style="font-weight:bold; white-space:nowrap;">
          ${escapeHtml(r.room_no || "-")}号室 ${escapeHtml(r.name)}
          ${r.status === "退所" ? `<span class="badge" style="background:var(--ground); color:var(--ink-3); font-size:13px; margin-left:4px;">退所</span>` : ""}
        </td>
        <td style="text-align:center; white-space:nowrap;">${escapeHtml(r.care_level || "-")}</td>
        <td style="text-align:right; font-weight:bold; white-space:nowrap;">${res.basicDays} 日</td>
        <td style="text-align:right; white-space:nowrap;">${res.hospDays > 0 ? `${res.hospDays} 日` : "-"}</td>
        <td>${codesHtml || `<span style="color:var(--ink-3);">算定対象なし</span>`}</td>
        <td style="text-align:right; font-weight:bold; white-space:nowrap; font-size:14px; ${res.totalUnits < 0 ? 'color:var(--alert);' : 'color:var(--pine-dark);'}">
          ${res.totalUnits.toLocaleString()} 単位
        </td>
        <td style="text-align:right; white-space:nowrap; font-size:14px;">
          ${yenDisplay}
        </td>
      </tr>
    `;
  }).join("");

  const regionBadge = regionObj
    ? `<span class="badge" style="background:var(--pine-tint-2); color:var(--pine-dark); font-size:13px; padding:4px 8px; border:1px solid var(--line-2);">地域区分: <strong>${escapeHtml(regionObj.key)}</strong> (1単位 ${regionObj.rate}円)</span>`
    : `<span class="badge" style="background:var(--caution-tint); color:var(--caution); font-size:13px; padding:4px 8px; border:1px solid var(--line-2);">地域区分を選んでください（下の設定ボタンから登録）</span>`;

  container.innerHTML = `
    <div class="panel-title" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
      <span>加算・減算の月の確認表（認知症対応型共同生活介護）</span>
      <div style="display:flex; gap:6px; flex-wrap:wrap;">
        <button type="button" class="btn btn-secondary" onclick="printKasanMonthlyTable()">確認表をA4横印刷</button>
        <button type="button" class="btn btn-primary" onclick="openKasanSettingsModal()">事業所の加算・減算設定</button>
        <button type="button" class="btn btn-secondary" onclick="printEmergencyResidentSheets()">停電に備えた印刷</button>
      </div>
    </div>

    <div style="display:flex; align-items:center; gap:10px; margin:10px 0 12px; flex-wrap:wrap;">
      <label style="font-weight:bold; font-size:13px; color:var(--ink-2); display:flex; align-items:center; gap:6px;">
        確認する年月:
        <input type="month" id="kasanYearMonth" class="form-control" style="font-size:13px; width:160px;" value="${escapeHtml(ym)}" onchange="onKasanMonthChange(this.value)">
      </label>
      <span class="badge" style="background:var(--pine-tint-2); color:var(--pine-dark); font-size:13px; padding:4px 8px; border:1px solid var(--line-2);">
        区分: ${unitCount}区分（${escapeHtml(unitLabel)}）
      </span>
      ${regionBadge}
      <span class="badge" style="background:var(--pine-tint-2); color:var(--pine-dark); font-size:13px; padding:4px 8px; border:1px solid var(--line-2);">
        届出体制加算: ${notifiedCount}件
      </span>
      ${activeGensanCount > 0 ? `<span class="badge" style="background:var(--alert-tint); color:var(--alert); font-size:13px; padding:4px 8px; font-weight:bold;">適用中の減算: ${activeGensanCount}件あり</span>` : `<span class="badge" style="background:var(--pine-tint-2); color:var(--pine-dark); font-size:13px; padding:4px 8px; border:1px solid var(--line-2);">減算: なし</span>`}
    </div>

    <p class="panel-note" style="margin:4px 0 12px; line-height:1.6;">
      ※月ごと・利用者ごとに算定対象となる加算・減算の目安です。基本の日数および金額は「目安」と表示しています。
      入院した日・退院した日・外泊の日の基本日数への算入基準は確認中のため、確定値ではありません。
      処遇改善加算、「・超」「・欠」「・夜減」、短期利用（38）・介護予防（37・39）は第2段階として除外しています。
    </p>

    <div style="overflow-x:auto;">
      <table class="data-table" id="kasanMonthlyTable" style="width:100%; font-size:13px; min-width:820px;">
        <thead>
          <tr style="background:var(--pine-tint-2);">
            <th style="width:140px;">利用者名（居室）</th>
            <th style="width:70px; text-align:center;">要介護度</th>
            <th style="width:110px; text-align:right;">在所日数 (目安)<br><span style="font-size:13px; font-weight:normal; color:var(--ink-3);">※数え方は確認中</span></th>
            <th style="width:80px; text-align:right;">入院日数</th>
            <th>算定コード・日数/回数 内訳</th>
            <th style="width:120px; text-align:right;">単位数合計 (目安)</th>
            <th style="width:120px; text-align:right;">目安の金額</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || `<tr><td colspan="7" style="text-align:center; padding:16px; color:var(--ink-3);">対象となる利用者の記録はありません。</td></tr>`}
        </tbody>
        <tfoot>
          <tr style="background:var(--pine-tint); font-weight:bold;">
            <td colspan="4" style="text-align:center;">全利用者合計（${monthlyResults.length}名）</td>
            <td></td>
            <td style="text-align:right; font-size:15px; color:var(--pine-dark);">${grandTotalUnits.toLocaleString()} 単位</td>
            <td style="text-align:right; font-size:15px; color:var(--pine-dark);">${regionObj ? `${grandTotalYen.toLocaleString()} 円` : "地域区分未選択"}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <details class="care-accordion" style="margin-top:16px; border:1px solid var(--line-2); border-radius:6px; padding:8px 12px; background:var(--surface);">
      <summary style="font-weight:bold; font-size:13px; color:var(--pine-dark); cursor:pointer;">
        根拠・公的資料リンク（サービスコード表・運営手引き・地域区分）
      </summary>
      <div style="padding:10px 4px 4px; font-size:13px; line-height:1.8;">
        ${CP_KASAN_SOURCES.map(s => `<div>・<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer" style="color:var(--pine); text-decoration:underline;">${escapeHtml(s.label)}</a></div>`).join("")}
      </div>
    </details>
  `;
}

// 4. 設定モーダル（地域区分・体制加算・減算・委員会ルール）
function openKasanSettingsModal() {
  if (typeof isCurrentStaffAdminOrClerk === "function" && !isCurrentStaffAdminOrClerk()) {
    alert("加算・減算の設定は管理者および事務員のみ操作可能です。");
    return;
  }
  const modal = document.getElementById("kasanSettingsModal");
  if (!modal) return;

  const settings = cpGetKasanSettings();

  // 地域区分
  const regSel = document.getElementById("kasanRegionSelect");
  if (regSel) {
    regSel.innerHTML = `<option value="">選んでください</option>` + CP_KASAN_REGION_RATES.map(r => `
      <option value="${escapeHtml(r.key)}" ${r.key === settings.region_type ? "selected" : ""}>${escapeHtml(r.key)}（1単位 ${r.rate}円）</option>
    `).join("");
  }

  // 体制加算
  const taiseiContainer = document.getElementById("kasanTaiseiContainer");
  if (taiseiContainer) {
    taiseiContainer.innerHTML = CP_KASAN_TAISEI_DEFS.map(def => {
      const cur = settings.taisei_items[def.id] || { option_key: "", notified_date: "" };
      const optsHtml = `<option value="">選んでください</option>` + def.options.map(o => `
        <option value="${escapeHtml(o.key)}" ${o.key === cur.option_key ? "selected" : ""}>${escapeHtml(o.label)}${o.units ? ` (${o.units}単位/${def.unit_type})` : ""}</option>
      `).join("");

      return `
        <div style="padding:8px 10px; border:1px solid var(--line-2); border-radius:4px; margin-bottom:8px; background:var(--surface);">
          <div style="font-weight:bold; font-size:13px; color:var(--ink); margin-bottom:4px;">${escapeHtml(def.name)}（1${def.unit_type}につき）</div>
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <label style="font-size:13px; color:var(--ink-2); display:flex; align-items:center; gap:4px;">
              届出区分:
              <select class="form-control" id="kasanTaisei_${def.id}" style="font-size:13px; width:260px;">
                ${optsHtml}
              </select>
            </label>
            <label style="font-size:13px; color:var(--ink-2); display:flex; align-items:center; gap:4px;">
              届出日:
              <input type="date" class="form-control" id="kasanTaiseiDate_${def.id}" style="font-size:13px; width:150px;" value="${escapeHtml(cur.notified_date || "")}">
            </label>
          </div>
        </div>
      `;
    }).join("");
  }

  // 減算
  const gensanContainer = document.getElementById("kasanGensanContainer");
  if (gensanContainer) {
    gensanContainer.innerHTML = CP_KASAN_GENSAN_DEFS.map(def => {
      const cur = settings.gensan_items[def.id] || { has_gensan: "なし", start_month: "", end_month: "", reason: "" };
      return `
        <div style="padding:8px 10px; border:1px solid var(--line-2); border-radius:4px; margin-bottom:8px; background:var(--surface);">
          <div style="font-weight:bold; font-size:13px; color:var(--ink); margin-bottom:4px;">${escapeHtml(def.name)}</div>
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <label style="font-size:13px; color:var(--ink-2); display:flex; align-items:center; gap:4px;">
              減算の適用:
              <select class="form-control" id="kasanGensanHas_${def.id}" style="font-size:13px; width:110px;">
                <option value="なし" ${cur.has_gensan !== "あり" ? "selected" : ""}>なし</option>
                <option value="あり" ${cur.has_gensan === "あり" ? "selected" : ""}>あり</option>
              </select>
            </label>
            <label style="font-size:13px; color:var(--ink-2); display:flex; align-items:center; gap:4px;">
              期間:
              <input type="month" class="form-control" id="kasanGensanStart_${def.id}" style="font-size:13px; width:130px;" value="${escapeHtml(cur.start_month || "")}">
              〜
              <input type="month" class="form-control" id="kasanGensanEnd_${def.id}" style="font-size:13px; width:130px;" value="${escapeHtml(cur.end_month || "")}">
            </label>
            <label style="font-size:13px; color:var(--ink-2); display:flex; align-items:center; gap:4px; flex:1; min-width:200px;">
              理由:
              <input type="text" class="form-control" id="kasanGensanReason_${def.id}" style="font-size:13px; width:100%;" value="${escapeHtml(cur.reason || "")}">
            </label>
          </div>
        </div>
      `;
    }).join("");
  }

  // 委員会・研修ルール
  renderKasanCommitteeRulesList();

  // 変更履歴
  const histContainer = document.getElementById("kasanHistoryContainer");
  if (histContainer) {
    if (settings.edit_history && settings.edit_history.length > 0) {
      histContainer.innerHTML = settings.edit_history.map(h => `
        <div style="font-size:13px; color:var(--ink-2); padding:3px 0; border-bottom:1px dashed var(--line-2);">
          ${escapeHtml(h.at || "")} ${escapeHtml(h.by || "")}：${escapeHtml(h.detail || "")}
        </div>
      `).join("");
    } else {
      histContainer.innerHTML = `<span style="font-size:13px; color:var(--ink-3);">変更履歴はありません。</span>`;
    }
  }

  modal.style.display = "flex";
}

function closeKasanSettingsModal() {
  const modal = document.getElementById("kasanSettingsModal");
  if (modal) modal.style.display = "none";
}

function renderKasanCommitteeRulesList() {
  const listEl = document.getElementById("kasanCommitteeRulesList");
  if (!listEl) return;

  const settings = cpGetKasanSettings();
  const rules = settings.committee_rules || [];
  const committees = (db && db.data && Array.isArray(db.data.committees)) ? db.data.committees : [];
  const today = toLocalDateStr(new Date());

  if (!rules.length) {
    listEl.innerHTML = `<div style="font-size:13px; color:var(--ink-3); padding:6px 0;">登録された決まりはありません（管理者・事務員が出典URL付きで登録したときのみ表示されます）。</div>`;
    return;
  }

  listEl.innerHTML = rules.map(rule => {
    // 事務所の委員会記録と照合
    const matched = committees.filter(c => c && !c.voided && c.committee_name && c.committee_name.includes(rule.name)); // [Claude修正] 取消した記録は数えない
    matched.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));

    let lastHeld = "未開催";
    let nextDue = "未定";
    let isExpired = false;

    if (matched.length > 0 && matched[0].date) {
      lastHeld = matched[0].date;
      const [y, m, d] = lastHeld.split("-").map(Number);
      if (y && m && d) {
        const nextDate = new Date(y, m - 1 + Number(rule.interval_months), d);
        nextDue = toLocalDateStr(nextDate);
        if (nextDue < today) isExpired = true;
      }
    }

    const ruleOff = rule.status === "使わない";
    const badge = ruleOff
      ? `<span class="badge" style="background:var(--ground); color:var(--ink-2);">使わない（${escapeHtml(rule.ended_at || "")} ${escapeHtml(rule.ended_by || "")}・理由: ${escapeHtml(rule.end_reason || "")}）</span>`
      : isExpired
      ? `<span class="badge" style="background:var(--alert-tint); color:var(--alert); font-weight:bold;">期限超過（次回期限: ${nextDue}）</span>`
      : `<span class="badge" style="background:var(--pine-tint); color:var(--pine-dark);">次回期限: ${nextDue}</span>`;

    return `
      <div style="border:1px solid var(--line-2); border-radius:4px; padding:8px 10px; margin-bottom:6px; background:var(--surface); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
        <div>
          <div style="font-weight:bold; font-size:13px; color:var(--ink);">
            ${escapeHtml(rule.name)}
            <span style="font-size:13px; font-weight:normal; color:var(--ink-2); margin-left:6px;">(${rule.interval_months}か月に1回)</span>
            ${badge}
          </div>
          <div style="font-size:13px; color:var(--ink-2); margin-top:2px;">
            最終開催日: <strong>${escapeHtml(lastHeld)}</strong> ／
            出典: <a href="${escapeHtml(rule.source_url)}" target="_blank" rel="noopener noreferrer" style="color:var(--pine); text-decoration:underline;">公的資料リンク</a>
          </div>
        </div>
        ${ruleOff ? "" : `<button type="button" class="btn btn-secondary" style="font-size:13px; padding:2px 8px;" onclick="deleteKasanCommitteeRule(${rule.id})">使わない</button>`}
      </div>
    `;
  }).join("");
}

function addKasanCommitteeRule() {
  if (typeof isCurrentStaffAdminOrClerk === "function" && !isCurrentStaffAdminOrClerk()) {
    alert("決まりの追加は管理者および事務員のみ操作可能です。");
    return;
  }
  const nameEl = document.getElementById("kasanNewRuleName");
  const intEl = document.getElementById("kasanNewRuleInterval");
  const urlEl = document.getElementById("kasanNewRuleUrl");

  const name = (nameEl ? nameEl.value : "").trim();
  const interval = (intEl ? intEl.value : "").trim();
  const sourceUrl = (urlEl ? urlEl.value : "").trim();

  if (!name) { alert("委員会の名前を入力してください。"); return; }
  if (!interval) { alert("開催の頻度を選んでください。"); return; }
  if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) {
    alert("出典URL（https://... または http://...）を入れてください（出典なしでは保存できません）。");
    return;
  }

  const settings = cpGetKasanSettings();
  if (!Array.isArray(settings.committee_rules)) settings.committee_rules = [];
  settings.committee_rules.push({
    id: Date.now(),
    name: name,
    interval_months: parseInt(interval, 10),
    source_url: sourceUrl,
    created_at: toLocalDateTimeStr(new Date()),
    created_by: cpLoginStaffName()
  });

  if (!db.data.kasan_settings) db.data.kasan_settings = {};
  db.data.kasan_settings.committee_rules = settings.committee_rules;
  if (!Array.isArray(db.data.settings_logs)) db.data.settings_logs = [];
  db.data.settings_logs.push({ id: Date.now() + 1, at: toLocalDateTimeStr(new Date()), by: cpLoginStaffName(), kind: "加算・減算設定", action: "委員会の決まりを追加", detail: `${name}（${interval}か月に1回、出典 ${sourceUrl}）` });
  db.save();

  if (nameEl) nameEl.value = "";
  if (intEl) intEl.value = "";
  if (urlEl) urlEl.value = "";

  renderKasanCommitteeRulesList();
  renderOfficeKasanTab();
}

function deleteKasanCommitteeRule(ruleId) {
  // [Claude修正] 決まりは消さずに「使わない」にして、理由・日時・人を残す
  if (typeof isCurrentStaffAdminOrClerk === "function" && !isCurrentStaffAdminOrClerk()) {
    alert("決まりの変更は管理者および事務員のみ操作可能です。");
    return;
  }
  const settings = cpGetKasanSettings();
  const rule = (settings.committee_rules || []).find(r => Number(r.id) === Number(ruleId));
  if (!rule || rule.status === "使わない") return;
  const reason = prompt(`「${rule.name}」の決まりを「使わない」にします。記録は残ります。\n\n理由を入れてください`, "");
  if (reason === null) return;
  if (!reason.trim()) { alert("理由を入れてください。何も変えていません。"); return; }
  rule.status = "使わない";
  rule.ended_at = toLocalDateTimeStr(new Date());
  rule.ended_by = cpLoginStaffName();
  rule.end_reason = reason.trim();
  if (!db.data.kasan_settings) db.data.kasan_settings = {};
  db.data.kasan_settings.committee_rules = settings.committee_rules;
  if (!Array.isArray(db.data.settings_logs)) db.data.settings_logs = [];
  db.data.settings_logs.push({ id: Date.now(), at: rule.ended_at, by: rule.ended_by, kind: "加算・減算設定", action: "委員会の決まりを使わない", detail: `${rule.name}（理由: ${rule.end_reason}）` });
  db.save();
  renderKasanCommitteeRulesList();
  renderOfficeKasanTab();
}

function saveKasanSettings() {
  if (typeof isCurrentStaffAdminOrClerk === "function" && !isCurrentStaffAdminOrClerk()) {
    alert("加算・減算の設定は管理者および事務員のみ操作可能です。");
    return;
  }

  const curSettings = cpGetKasanSettings();
  const nextSettings = {
    region_type: (document.getElementById("kasanRegionSelect")?.value || "").trim(),
    taisei_items: {},
    gensan_items: {},
    committee_rules: curSettings.committee_rules || [],
    edit_history: curSettings.edit_history || []
  };

  const kasanToday = toLocalDateStr(new Date());
  const kasanThisMonth = kasanToday.slice(0, 7);
  let kasanError = "";
  CP_KASAN_TAISEI_DEFS.forEach(def => {
    const optKey = (document.getElementById(`kasanTaisei_${def.id}`)?.value || "").trim();
    const notifDate = (document.getElementById(`kasanTaiseiDate_${def.id}`)?.value || "").trim();
    // [Claude修正] 届出ありは届出の日を必須に。先の日付は不可
    if (!kasanError && optKey && optKey !== "none" && !notifDate) kasanError = `「${def.name}」の届出の日を入れてください。`;
    if (!kasanError && notifDate && notifDate > kasanToday) kasanError = `「${def.name}」の届出の日に先の日付は入れられません。`;
    nextSettings.taisei_items[def.id] = {
      option_key: optKey,
      notified_date: notifDate
    };
  });

  CP_KASAN_GENSAN_DEFS.forEach(def => {
    const hasGensan = (document.getElementById(`kasanGensanHas_${def.id}`)?.value || "なし").trim();
    const sMonth = (document.getElementById(`kasanGensanStart_${def.id}`)?.value || "").trim();
    const eMonth = (document.getElementById(`kasanGensanEnd_${def.id}`)?.value || "").trim();
    const reason = (document.getElementById(`kasanGensanReason_${def.id}`)?.value || "").trim();

    // [Claude修正] forEach の中の return では保存が止まっていなかった。まとめて確かめてから止める
    if (!kasanError && hasGensan === "あり" && !sMonth) kasanError = `「${def.name}」の始めの月を入れてください。`;
    if (!kasanError && hasGensan === "あり" && !reason) kasanError = `「${def.name}」の理由を入れてください。`;
    if (!kasanError && hasGensan === "あり" && sMonth && eMonth && sMonth > eMonth) kasanError = `「${def.name}」の期間（始めの月・改善した月）の順序が正しくありません。`;
    if (!kasanError && eMonth && eMonth > kasanThisMonth) kasanError = `「${def.name}」の改善した月に先の月は入れられません。`;

    nextSettings.gensan_items[def.id] = {
      has_gensan: hasGensan,
      start_month: sMonth,
      end_month: eMonth,
      reason: reason
    };
  });

  if (kasanError) { alert(kasanError); return; }

  // 変更の有無をチェック（無変更時は履歴を増やさない）
  const curJson = JSON.stringify({
    region_type: curSettings.region_type,
    taisei_items: curSettings.taisei_items,
    gensan_items: curSettings.gensan_items
  });
  const nextJson = JSON.stringify({
    region_type: nextSettings.region_type,
    taisei_items: nextSettings.taisei_items,
    gensan_items: nextSettings.gensan_items
  });

  if (curJson === nextJson) {
    alert("変更された項目がありません。");
    closeKasanSettingsModal();
    return;
  }

  const logDetail = `地域区分: ${nextSettings.region_type || "未設定"}、届出加算更新、減算設定更新`;
  nextSettings.edit_history.unshift({
    id: Date.now(),
    at: toLocalDateTimeStr(new Date()),
    by: cpLoginStaffName(),
    detail: logDetail,
    before: JSON.parse(curJson) // [Claude修正] 変更前の値も残す
  });

  if (!Array.isArray(db.data.settings_logs)) db.data.settings_logs = [];
  db.data.settings_logs.push({
    id: Date.now(),
    at: toLocalDateTimeStr(new Date()),
    by: cpLoginStaffName(),
    kind: "加算・減算設定",
    action: "変更",
    detail: logDetail
  });

  db.data.kasan_settings = nextSettings;
  db.save();

  alert("加算・減算の設定を保存しました。");
  closeKasanSettingsModal();
  renderOfficeKasanTab();
}

// 5. 確認表のA4横印刷
function printKasanMonthlyTable() {
  const ym = gKasanSelectedMonth || toLocalDateStr(new Date()).slice(0, 7);
  const tableEl = document.getElementById("kasanMonthlyTable");
  if (!tableEl) {
    alert("確認表が表示されていません。");
    return;
  }
  const unitKey = cpKasanUnitKey();
  const unitLabel = unitKey === "unit2" ? "認知症対応型共同生活介護費（Ⅱ）" : "認知症対応型共同生活介護費（Ⅰ）";
  const settings = cpGetKasanSettings();
  const regionObj = CP_KASAN_REGION_RATES.find(r => r.key === settings.region_type);
  const regionText = regionObj ? `${regionObj.key}（単価 ${regionObj.rate}円）` : "地域区分未選択";

  const printHtml = `
    <div style="font-family:sans-serif; color:#000000; padding:4px;">
      <div style="display:flex; justify-content:space-between; align-items:baseline; border-bottom:2px solid #333; padding-bottom:4px; margin-bottom:8px;">
        <h2 style="margin:0; font-size:16px;">加算・減算の月の確認表（${escapeHtml(ym)}）</h2>
        <div style="font-size:13px;">区分: ${escapeHtml(unitLabel)} ／ 地域区分: ${escapeHtml(regionText)} ／ 印刷: ${toLocalDateTimeStr(new Date())}</div>
      </div>
      <p style="font-size:13px; margin:0 0 8px; color:#555;">
        ※基本の日数および金額は目安です。国保連請求CSVデータではありません。在所日数の数え方は確認中、処遇改善加算等は第2段階除外。
      </p>
      <table style="width:100%; border-collapse:collapse; font-size:13px;" border="1">
        ${tableEl.innerHTML}
      </table>
    </div>
  `;

  if (typeof runPrintJob === "function") {
    runPrintJob(printHtml, { page: "A4 landscape", fitOnePage: false });
  } else {
    window.print();
  }
}

// 6. B. 停電に備えた印刷（非常時・停電時 利用者緊急シート）
function printEmergencyResidentSheets() {
  const residents = (db && db.data && Array.isArray(db.data.residents)) ? db.data.residents : [];
  const currentResidents = residents.filter(r => !cpIsDischarged(r));

  if (!currentResidents.length) {
    alert("在所中の利用者がいません。");
    return;
  }

  const ok = confirm("利用者の個人情報（医療・病歴・緊急連絡先など）が含まれます。\n印刷した用紙の保管場所に気をつけてください。\n\n全在所者の緊急時シートを印刷しますか？");
  if (!ok) return;

  // 印刷操作の記録を残す
  if (!Array.isArray(db.data.settings_logs)) db.data.settings_logs = [];
  db.data.settings_logs.push({
    id: Date.now(),
    at: toLocalDateTimeStr(new Date()),
    by: cpLoginStaffName(),
    kind: "停電に備えた印刷",
    action: "印刷",
    detail: `在所者 ${currentResidents.length}名分の非常時シートを印刷`
  });
  db.save();

  const now = new Date();
  const printTimeStr = toLocalDateTimeStr(now);
  const hourStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日${now.getHours()}時`;

  const allMeds = (db && db.data && Array.isArray(db.data.resident_medications)) ? db.data.resident_medications : [];
  const allEyedrops = (db && db.data && Array.isArray(db.data.eyedrop_orders)) ? db.data.eyedrop_orders : [];

  const sheetsHtml = currentResidents.map((r, idx) => {
    // 処方薬
    const rMeds = allMeds.filter(m => m && Number(m.resident_id) === Number(r.id) && m.status !== "中止" && !m.voided);
    const medLines = rMeds.map(m => {
      const timings = (m.timings || []).map(t => `${t.key}${t.count || ""}`).join("・");
      const sched = typeof cpRxScheduleText === "function" ? cpRxScheduleText(m) : "";
      return `・${escapeHtml(m.name || "未登録")} ［${escapeHtml(timings || "指示通り")}］${sched ? ` (${escapeHtml(sched)})` : ""}`;
    }).join("<br>") || "未登録";

    // 頓服薬（処方薬で「頓服」を含むもの）
    const prnMeds = rMeds.filter(m => (m.timings || []).some(t => t.key && t.key.includes("頓服")) || (m.name && m.name.includes("頓服")));
    const prnLines = prnMeds.map(m => `・${escapeHtml(m.name || "")}`).join("<br>") || "未登録";

    // 目薬
    const rEyes = allEyedrops.filter(e => e && Number(e.resident_id) === Number(r.id) && e.status !== "終了" && !e.voided);
    const eyeLines = rEyes.map(e => `・${escapeHtml(e.med_name || "点眼薬")} ［${escapeHtml(e.eye_side || "両眼")}］ ${escapeHtml(e.timing || "")} ${e.doctor_name ? `(医師: ${escapeHtml(e.doctor_name)})` : ""}`).join("<br>") || "未登録";

    // 塗り薬・外用薬
    const topicalLines = r.topical_instructions ? escapeHtml(r.topical_instructions) : "未登録";

    // ケアプラン目標
    const activePlan = (typeof cpGetActiveCarePlanForResident === "function") ? cpGetActiveCarePlanForResident(r.id) : null;
    let planGoalsText = "未登録";
    if (activePlan) {
      const goals = (activePlan.needs || []).map((n, nIdx) => {
        return `【課題${nIdx + 1}: ${escapeHtml(n.need || "")}】 長期: ${escapeHtml(n.long_goal || "未登録")} ／ 短期: ${escapeHtml(n.short_goal || "未登録")}`;
      }).join("<br>");
      planGoalsText = `（第${Number(activePlan.version) || 1}版 実施中）<br>${goals || escapeHtml(activePlan.policy || "方針あり")}`;
    } else if (r.care_plan_goal) {
      planGoalsText = `（目標）${escapeHtml(r.care_plan_goal)}`;
    }

    const val = (v) => (v !== undefined && v !== null && String(v).trim() !== "") ? escapeHtml(String(v).trim()) : "未登録";

    return `
      <div class="emergency-print-sheet" style="page-break-after:always; break-after:page; padding:6px; box-sizing:border-box; color:#000000; font-family:sans-serif;">
        <div style="border-bottom:2px solid #000; padding-bottom:4px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:baseline;">
          <div>
            <span style="font-size:18px; font-weight:bold;">【非常時・停電時 利用者緊急シート】</span>
            <span style="font-size:14px; font-weight:bold; margin-left:10px;">${escapeHtml(r.room_no || "-")}号室 ${escapeHtml(r.name)} 様</span>
          </div>
          <div style="font-size:13px;">${idx + 1} / ${currentResidents.length} 名</div>
        </div>

        <div style="background:#f0f0f0; border:1px solid #333; padding:4px 8px; font-size:13px; margin-bottom:8px;">
          <strong>※この紙は ${escapeHtml(hourStr)} の内容です。最新はアプリで確かめてください。</strong>（印刷日時: ${escapeHtml(printTimeStr)} ／ 印刷者: ${escapeHtml(cpLoginStaffName())}）
        </div>

        <table style="width:100%; border-collapse:collapse; margin-bottom:8px; font-size:13px;" border="1">
          <tr>
            <th style="width:18%; background:#f5f5f5; padding:4px 6px;">氏名 / 居室</th>
            <td style="width:32%; padding:4px 6px; font-weight:bold;">${val(r.name)}（${val(r.room_no)}号室）</td>
            <th style="width:18%; background:#f5f5f5; padding:4px 6px;">要介護度 / 生年月日</th>
            <td style="width:32%; padding:4px 6px;">${val(r.care_level)} ／ ${val(r.birth_date)}</td>
          </tr>
          <tr>
            <th style="background:#f5f5f5; padding:4px 6px;">緊急連絡先</th>
            <td colspan="3" style="padding:4px 6px; font-weight:bold;">${val(r.emergency_contact)}</td>
          </tr>
          <tr>
            <th style="background:#f5f5f5; padding:4px 6px;">アレルギー</th>
            <td style="padding:4px 6px; color:#b00; font-weight:bold;">${val(r.allergies)}</td>
            <th style="background:#f5f5f5; padding:4px 6px;">麻痺・拘縮</th>
            <td style="padding:4px 6px;">${val(r.paralysis)}</td>
          </tr>
          <tr>
            <th style="background:#f5f5f5; padding:4px 6px;">病歴・既往歴</th>
            <td colspan="3" style="padding:4px 6px;">${val(r.diseases)}</td>
          </tr>
          <tr>
            <th style="background:#f5f5f5; padding:4px 6px;">食事の形・とろみ</th>
            <td style="padding:4px 6px;">${val(r.diet_type)}</td>
            <th style="background:#f5f5f5; padding:4px 6px;">口腔・義歯</th>
            <td style="padding:4px 6px;">${val(r.oral_state)}</td>
          </tr>
          <tr>
            <th style="background:#f5f5f5; padding:4px 6px;">主治医の指示</th>
            <td colspan="3" style="padding:4px 6px;">${val(r.dr_instructions)}</td>
          </tr>
          <tr>
            <th style="background:#f5f5f5; padding:4px 6px;">次の受診日・特記</th>
            <td colspan="3" style="padding:4px 6px;">${val(r.next_clinic_date)} ${r.clinic_special_notes ? `(${escapeHtml(r.clinic_special_notes)})` : ""}</td>
          </tr>
        </table>

        <div style="font-weight:bold; font-size:13px; margin:8px 0 2px;">【服薬・点眼・外用薬の情報】</div>
        <table style="width:100%; border-collapse:collapse; margin-bottom:8px; font-size:13px;" border="1">
          <tr>
            <th style="width:25%; background:#f5f5f5; padding:4px 6px;">定期処方薬</th>
            <td style="padding:4px 6px; line-height:1.5;">${medLines}</td>
          </tr>
          <tr>
            <th style="background:#f5f5f5; padding:4px 6px;">頓服薬</th>
            <td style="padding:4px 6px;">${prnLines}</td>
          </tr>
          <tr>
            <th style="background:#f5f5f5; padding:4px 6px;">目薬の指示</th>
            <td style="padding:4px 6px; line-height:1.5;">${eyeLines}</td>
          </tr>
          <tr>
            <th style="background:#f5f5f5; padding:4px 6px;">塗り薬・湿布</th>
            <td style="padding:4px 6px;">${topicalLines}</td>
          </tr>
        </table>

        <div style="font-weight:bold; font-size:13px; margin:8px 0 2px;">【ケアプラン（実施中の目標）】</div>
        <div style="border:1px solid #333; padding:6px 8px; font-size:13px; line-height:1.5;">
          ${planGoalsText}
        </div>
      </div>
    `;
  }).join("");

  if (typeof runPrintJob === "function") {
    runPrintJob(sheetsHtml, { page: "A4 portrait", fitOnePage: false });
  } else {
    window.print();
  }
}

// グローバル公開
window.CP_KASAN_BASIC_CODES = CP_KASAN_BASIC_CODES;
window.CP_KASAN_RESIDENT_DEFS = CP_KASAN_RESIDENT_DEFS;
window.CP_KASAN_TAISEI_DEFS = CP_KASAN_TAISEI_DEFS;
window.CP_KASAN_GENSAN_DEFS = CP_KASAN_GENSAN_DEFS;
window.CP_KASAN_REGION_RATES = CP_KASAN_REGION_RATES;
window.CP_KASAN_SOURCES = CP_KASAN_SOURCES;
window.cpGetResidentRecordsForPeriod = cpGetResidentRecordsForPeriod;
window.cpKasanBasicDays = cpKasanBasicDays;
window.cpKasanUnitKey = cpKasanUnitKey;
window.cpGetKasanSettings = cpGetKasanSettings;
window.cpComputeMonthlyKasan = cpComputeMonthlyKasan;
window.onKasanMonthChange = onKasanMonthChange;
window.renderOfficeKasanTab = renderOfficeKasanTab;
window.openKasanSettingsModal = openKasanSettingsModal;
window.closeKasanSettingsModal = closeKasanSettingsModal;
window.renderKasanCommitteeRulesList = renderKasanCommitteeRulesList;
window.addKasanCommitteeRule = addKasanCommitteeRule;
window.deleteKasanCommitteeRule = deleteKasanCommitteeRule;
window.saveKasanSettings = saveKasanSettings;
window.printKasanMonthlyTable = printKasanMonthlyTable;
window.printEmergencyResidentSheets = printEmergencyResidentSheets;
