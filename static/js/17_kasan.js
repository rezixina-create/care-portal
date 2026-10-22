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

// 処遇改善加算の定義（WAM/市川市手引き準拠）
const CP_KASAN_SHOGU_DEFS = {
  "1_a": { code: "6108", rate: 210, name: "介護職員等処遇改善加算（Ⅰ）イ" },
  "1_b": { code: "6183", rate: 228, name: "介護職員等処遇改善加算（Ⅰ）ロ" },
  "2_a": { code: "6107", rate: 202, name: "介護職員等処遇改善加算（Ⅱ）イ" },
  "2_b": { code: "6184", rate: 220, name: "介護職員等処遇改善加算（Ⅱ）ロ" },
  "3": { code: "6104", rate: 179, name: "介護職員等処遇改善加算（Ⅲ）" },
  "4": { code: "6380", rate: 149, name: "介護職員等処遇改善加算（Ⅳ）" }
};

// 減算基本サービスコード表（WAMサービスコード表 令和8年6月・8月版準拠）
const CP_KASAN_REDUCED_BASIC_CODES = {
  unit1: {
    yagen: {
      "要介護1": { code: "1113", units: 742, name: "認知症対応型共同生活介護費（Ⅰ）夜勤減算・要介護1" },
      "要介護2": { code: "1123", units: 777, name: "認知症対応型共同生活介護費（Ⅰ）夜勤減算・要介護2" },
      "要介護3": { code: "1133", units: 799, name: "認知症対応型共同生活介護費（Ⅰ）夜勤減算・要介護3" },
      "要介護4": { code: "1143", units: 816, name: "認知症対応型共同生活介護費（Ⅰ）夜勤減算・要介護4" },
      "要介護5": { code: "1153", units: 833, name: "認知症対応型共同生活介護費（Ⅰ）夜勤減算・要介護5" }
    },
    cho: {
      "要介護1": { code: "8001", units: 536, name: "認知症対応型共同生活介護費（Ⅰ）定員超過・要介護1" },
      "要介護2": { code: "8011", units: 561, name: "認知症対応型共同生活介護費（Ⅰ）定員超過・要介護2" },
      "要介護3": { code: "8021", units: 577, name: "認知症対応型共同生活介護費（Ⅰ）定員超過・要介護3" },
      "要介護4": { code: "8031", units: 589, name: "認知症対応型共同生活介護費（Ⅰ）定員超過・要介護4" },
      "要介護5": { code: "8041", units: 601, name: "認知症対応型共同生活介護費（Ⅰ）定員超過・要介護5" }
    },
    yagen_cho: {
      "要介護1": { code: "8003", units: 519, name: "認知症対応型共同生活介護費（Ⅰ）夜減・超過・要介護1" },
      "要介護2": { code: "8013", units: 544, name: "認知症対応型共同生活介護費（Ⅰ）夜減・超過・要介護2" },
      "要介護3": { code: "8023", units: 559, name: "認知症対応型共同生活介護費（Ⅰ）夜減・超過・要介護3" },
      "要介護4": { code: "8033", units: 571, name: "認知症対応型共同生活介護費（Ⅰ）夜減・超過・要介護4" },
      "要介護5": { code: "8043", units: 583, name: "認知症対応型共同生活介護費（Ⅰ）夜減・超過・要介護5" }
    },
    ketsu: {
      "要介護1": { code: "9001", units: 536, name: "認知症対応型共同生活介護費（Ⅰ）人員欠如・要介護1" },
      "要介護2": { code: "9011", units: 561, name: "認知症対応型共同生活介護費（Ⅰ）人員欠如・要介護2" },
      "要介護3": { code: "9021", units: 577, name: "認知症対応型共同生活介護費（Ⅰ）人員欠如・要介護3" },
      "要介護4": { code: "9031", units: 589, name: "認知症対応型共同生活介護費（Ⅰ）人員欠如・要介護4" },
      "要介護5": { code: "9041", units: 601, name: "認知症対応型共同生活介護費（Ⅰ）人員欠如・要介護5" }
    },
    yagen_ketsu: {
      "要介護1": { code: "9003", units: 519, name: "認知症対応型共同生活介護費（Ⅰ）夜減・欠如・要介護1" },
      "要介護2": { code: "9013", units: 544, name: "認知症対応型共同生活介護費（Ⅰ）夜減・欠如・要介護2" },
      "要介護3": { code: "9023", units: 559, name: "認知症対応型共同生活介護費（Ⅰ）夜減・欠如・要介護3" },
      "要介護4": { code: "9033", units: 571, name: "認知症対応型共同生活介護費（Ⅰ）夜減・欠如・要介護4" },
      "要介護5": { code: "9043", units: 583, name: "認知症対応型共同生活介護費（Ⅰ）夜減・欠如・要介護5" }
    }
  },
  unit2: {
    yagen: {
      "要介護1": { code: "2113", units: 730, name: "認知症対応型共同生活介護費（Ⅱ）夜勤減算・要介護1" },
      "要介護2": { code: "2123", units: 764, name: "認知症対応型共同生活介護費（Ⅱ）夜勤減算・要介護2" },
      "要介護3": { code: "2133", units: 788, name: "認知症対応型共同生活介護費（Ⅱ）夜勤減算・要介護3" },
      "要介護4": { code: "2143", units: 803, name: "認知症対応型共同生活介護費（Ⅱ）夜勤減算・要介護4" },
      "要介護5": { code: "2153", units: 820, name: "認知症対応型共同生活介護費（Ⅱ）夜勤減算・要介護5" }
    },
    cho: {
      "要介護1": { code: "8101", units: 527, name: "認知症対応型共同生活介護費（Ⅱ）定員超過・要介護1" },
      "要介護2": { code: "8111", units: 552, name: "認知症対応型共同生活介護費（Ⅱ）定員超過・要介護2" },
      "要介護3": { code: "8121", units: 568, name: "認知症対応型共同生活介護費（Ⅱ）定員超過・要介護3" },
      "要介護4": { code: "8131", units: 580, name: "認知症対応型共同生活介護費（Ⅱ）定員超過・要介護4" },
      "要介護5": { code: "8141", units: 592, name: "認知症対応型共同生活介護費（Ⅱ）定員超過・要介護5" }
    },
    yagen_cho: {
      "要介護1": { code: "8103", units: 511, name: "認知症対応型共同生活介護費（Ⅱ）夜減・超過・要介護1" },
      "要介護2": { code: "8113", units: 535, name: "認知症対応型共同生活介護費（Ⅱ）夜減・超過・要介護2" },
      "要介護3": { code: "8123", units: 552, name: "認知症対応型共同生活介護費（Ⅱ）夜減・超過・要介護3" },
      "要介護4": { code: "8133", units: 562, name: "認知症対応型共同生活介護費（Ⅱ）夜減・超過・要介護4" },
      "要介護5": { code: "8143", units: 574, name: "認知症対応型共同生活介護費（Ⅱ）夜減・超過・要介護5" }
    },
    ketsu: {
      "要介護1": { code: "9101", units: 527, name: "認知症対応型共同生活介護費（Ⅱ）人員欠如・要介護1" },
      "要介護2": { code: "9111", units: 552, name: "認知症対応型共同生活介護費（Ⅱ）人員欠如・要介護2" },
      "要介護3": { code: "9121", units: 568, name: "認知症対応型共同生活介護費（Ⅱ）人員欠如・要介護3" },
      "要介護4": { code: "9131", units: 580, name: "認知症対応型共同生活介護費（Ⅱ）人員欠如・要介護4" },
      "要介護5": { code: "9141", units: 592, name: "認知症対応型共同生活介護費（Ⅱ）人員欠如・要介護5" }
    },
    yagen_ketsu: {
      "要介護1": { code: "9103", units: 511, name: "認知症対応型共同生活介護費（Ⅱ）夜減・欠如・要介護1" },
      "要介護2": { code: "9113", units: 535, name: "認知症対応型共同生活介護費（Ⅱ）夜減・欠如・要介護2" },
      "要介護3": { code: "9123", units: 552, name: "認知症対応型共同生活介護費（Ⅱ）夜減・欠如・要介護3" },
      "要介護4": { code: "9133", units: 562, name: "認知症対応型共同生活介護費（Ⅱ）夜減・欠如・要介護4" },
      "要介護5": { code: "9143", units: 574, name: "認知症対応型共同生活介護費（Ⅱ）夜減・欠如・要介護5" }
    }
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
      { key: "1_c", label: "医療連携体制加算（Ⅰ）ハ", code: "1600", units: 37 }
    ]
  },
  // [Claude修正] （Ⅱ）は（Ⅰ）と一緒に付けられる（（Ⅰ）のどれかを算定していることが条件）ので、別の選択にする
  // 岡山市「令和６年度制度改正の概要（施設・居住系サービス編）」「加算（Ⅰ）と（Ⅱ）の併算定は可。加算（Ⅰ）のイ、ロ、ハの併算定は不可。」、市川市 運営の手引き・鹿児島市 自己点検シート
  {
    id: "medical_coop2",
    name: "医療連携体制加算（Ⅱ）",
    unit_type: "日",
    requires_medical_coop1: true,
    options: [
      { key: "none", label: "届出なし", code: null, units: 0 },
      { key: "1", label: "医療連携体制加算（Ⅱ）", code: "1603", units: 5 }
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
    requires_medical_coop1: true, // [Claude修正] 医療連携体制加算を算定していない場合は算定できない（市川市 運営の手引き）
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
    label: "市川市 運営の手引き「処遇改善加算: 基本単位に加算減算を加えた単位数の1000分の210に相当する単位数」",
    url: "https://www.city.ichikawa.lg.jp/uploaded/attachment/55858.pdf"
  },
  {
    label: "WAM 令和8年6月改定 明細書の様式記載例（Ⅲ-資料３）「(442＋300)×21／1000＝15.582→16」",
    url: "https://www.wam.go.jp/gyoseiShiryou-files/documents/2026/0420143053543/20260416_024.pdf"
  },
  {
    label: "WAM サービスコード表（地域密着型）令和8年6月・8月施行版（夜減・超過・人員欠如・夜減超過・夜減欠如）",
    url: "https://www.wam.go.jp/gyoseiShiryou-files/documents/2026/0520081927889/20260522_005.pdf"
  },
  {
    label: "鹿児島市 自己点検シート（R8）「定員超過・人員基準欠如の月に算定不可となる体制加算」",
    url: "https://www.city.kagoshima.lg.jp/kenkofukushi/chouju/shidoukansa/kenko/fukushi/kansa/documents/r8-kasan-gh.pdf"
  },
  {
    label: "厚生労働省 留意事項通知 第2の1⑹⑻⑼「定員超過・人員基準欠如・夜間勤務条件基準の減算要件」",
    url: "https://www.mhlw.go.jp/content/12300000/001283858.pdf"
  },
  {
    label: "厚生労働省 給付費分科会 「地域区分について」令和6年12月23日",
    url: "https://www.mhlw.go.jp/content/12300000/001477917.pdf"
  }
];

// 2. 記録を読む共通の関数
// 処遇改善単位数の計算（他算定単位数合計 × 率 ÷ 1000、四捨五入）
function cpComputeShoguUnits(sumOtherUnits, ratePerThousand) {
  if (!sumOtherUnits || !ratePerThousand) return 0;
  return Math.round((sumOtherUnits * ratePerThousand) / 1000);
}

function cpGetPrevYm(ym) {
  if (!ym || typeof ym !== "string") return "";
  const [yStr, mStr] = ym.split("-");
  let y = parseInt(yStr, 10);
  let m = parseInt(mStr, 10) - 1;
  if (isNaN(y) || isNaN(m)) return "";
  if (m < 1) { m = 12; y -= 1; }
  return `${y}-${String(m).padStart(2, "0")}`;
}

function cpGetNextYm(ym) {
  if (!ym || typeof ym !== "string") return "";
  const [yStr, mStr] = ym.split("-");
  let y = parseInt(yStr, 10);
  let m = parseInt(mStr, 10) + 1;
  if (isNaN(y) || isNaN(m)) return "";
  if (m > 12) { m = 1; y += 1; }
  return `${y}-${String(m).padStart(2, "0")}`;
}

// count か月前の年月
function cpAddMonthsBack(ym, count) {
  let res = ym;
  for (let i = 0; i < count; i++) res = cpGetPrevYm(res);
  return res;
}

function cpAddMonths(ym, count) {
  let res = ym;
  for (let i = 0; i < count; i++) {
    res = cpGetNextYm(res);
  }
  return res;
}

// ==============================================================
// 認知症の2つの加算の「対象者の割合」算定機能
// 根拠: 厚生労働省「介護サービス関係Q&A集」施設サービス共通／認知症専門ケア加算（平成21年 Q&A vol.1 問114）
// 「届出日の属する月の前３月の各月末時点の入所者又は利用者数の平均で算定する。」
// ==============================================================

function cpGetLastDateOfMonth(ym) {
  if (!ym || typeof ym !== "string") return "";
  const [yStr, mStr] = ym.split("-");
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(y) || isNaN(m)) return "";
  const lastDay = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

function cpDementiaRatioForMonth(ym) {
  if (!ym || typeof ym !== "string") {
    return {
      ym: "",
      lastDate: "",
      totalCount: 0,
      rank3Count: 0,
      rank2Count: 0,
      unregisteredCount: 0,
      hospitalizedCount: 0,
      rank3Ratio: 0,
      rank2Ratio: 0,
      unregisteredResidentIds: []
    };
  }

  const lastDate = cpGetLastDateOfMonth(ym);
  const allResidents = (typeof db !== "undefined" && db && db.data && Array.isArray(db.data.residents)) ? db.data.residents : [];

  let totalCount = 0;
  let rank3Count = 0;
  let rank2Count = 0;
  let unregisteredCount = 0;
  let hospitalizedCount = 0;
  const unregisteredResidentIds = [];

  allResidents.forEach(r => {
    if (!r) return;
    const s = (typeof cpStatusOn === "function") ? cpStatusOn(r, lastDate) : (r.status || "在所");
    // その月の末日に入居している人（「入居前」「退所」以外。入院中・外泊中も入居は続いているので数に入れる）
    if (s === "入居前" || s === "退所") return;

    totalCount++;
    if (s === "入院中") {
      hospitalizedCount++;
    }

    const assess = (typeof cpGetDementiaRankOn === "function") ? cpGetDementiaRankOn(r.id, lastDate) : null;
    if (!assess || !assess.rank) {
      // 未登録の人は「Ⅲ以上ではない」「Ⅱ以上ではない」として数える（推測で決めない）
      unregisteredCount++;
      unregisteredResidentIds.push(r.id);
    } else {
      const rank = String(assess.rank).trim();
      // Ⅲ以上: Ⅲa・Ⅲb・Ⅳ・M
      if (["Ⅲa", "Ⅲb", "Ⅳ", "M"].includes(rank)) {
        rank3Count++;
        rank2Count++;
      } else if (["Ⅱa", "Ⅱb"].includes(rank)) {
        // Ⅱ以上: Ⅱa・Ⅱb・Ⅲa・Ⅲb・Ⅳ・M
        rank2Count++;
      }
    }
  });

  const rank3Ratio = totalCount > 0 ? (rank3Count / totalCount) : 0;
  const rank2Ratio = totalCount > 0 ? (rank2Count / totalCount) : 0;

  return {
    ym,
    lastDate,
    totalCount,
    rank3Count,
    rank2Count,
    unregisteredCount,
    hospitalizedCount,
    rank3Ratio,
    rank2Ratio,
    unregisteredResidentIds
  };
}

function cpDementiaCareEligibility(ym) {
  if (!ym || typeof ym !== "string") {
    return {
      ym: "",
      months: [],
      details: [],
      avgRatio3: 0,
      isEligible: false,
      avgRatio2: 0,
      totalUnregisteredResidents: 0
    };
  }

  // ym の前3か月（例: 2026-10 なら 2026-07, 2026-08, 2026-09）
  const m3 = cpAddMonthsBack(ym, 3);
  const m2 = cpAddMonthsBack(ym, 2);
  const m1 = cpAddMonthsBack(ym, 1);
  const months = [m3, m2, m1];

  const details = months.map(m => cpDementiaRatioForMonth(m));
  const sumRatio3 = details.reduce((sum, d) => sum + d.rank3Ratio, 0);
  const avgRatio3 = sumRatio3 / 3;
  // 浮動小数点誤差を救済しつつ 1/2 以上かを判定（例: 1/2・2/3・1/3 の平均 1/2 で満たす）
  const isEligible = (avgRatio3 + 1e-9) >= 0.5;

  const sumRatio2 = details.reduce((sum, d) => sum + d.rank2Ratio, 0);
  const avgRatio2 = sumRatio2 / 3;
  // [Claude修正] チームケア推進加算も同じ数え方（令和６年度介護報酬改定Q&A Vol.2 問7）
  const isEligible2 = (avgRatio2 + 1e-9) >= 0.5;

  const unregIdSet = new Set();
  details.forEach(d => {
    (d.unregisteredResidentIds || []).forEach(id => unregIdSet.add(id));
  });

  return {
    ym,
    months,
    details,
    avgRatio3,
    isEligible,
    avgRatio2,
    isEligible2,
    totalUnregisteredResidents: unregIdSet.size
  };
}

// 夜勤人員不足候補の判定
function cpDetectNightShortageCandidate(yearMonth) {
  if (!yearMonth) return { shortageDays: [], count: 0, hasConsecutive2: false, consecutivePairs: [], isCandidate: false, standard: 1 };
  const [yStr, mStr] = yearMonth.split("-");
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(y) || isNaN(m)) return { shortageDays: [], count: 0, hasConsecutive2: false, consecutivePairs: [], isCandidate: false, standard: 1 };
  const daysInMonth = new Date(y, m, 0).getDate();

  // [Claude修正] 夜勤の人数はユニット（区分）ごとに見る。1つのユニットに2人・もう1つに0人の日は不足
  // 夜勤職員の基準は「ユニットごとに1人以上」（留意事項通知 第2の1⑼、市川市 運営の手引き）。3ユニットで2人の特例は扱っていない
  const units = (db && db.data && Array.isArray(db.data.units)) ? db.data.units.filter(u => u && u.id !== undefined) : [];
  const standard = Math.max(1, units.length);
  const stamps = (db && db.data && Array.isArray(db.data.stamps)) ? db.data.stamps : [];
  const unitOfStaff = {};
  stamps.forEach(s => { if (s && s.name) unitOfStaff[s.name] = (s.unit_id !== undefined && s.unit_id !== null && s.unit_id !== "") ? Number(s.unit_id) : null; });

  const monthShifts = (db && db.data && db.data.monthly_shifts && db.data.monthly_shifts[yearMonth]) || {};
  const shortageDays = [];
  const unenteredDays = []; // [Claude修正] 勤務表がまだ入っていない日は「不足」と数えず、別に知らせる

  for (let d = 1; d <= daysInMonth; d++) {
    let nightCount = 0;
    let entered = false;
    const staffNames = [];
    const perUnit = {};
    units.forEach(u => { perUnit[Number(u.id)] = 0; });
    Object.keys(monthShifts).forEach(sName => {
      const v = monthShifts[sName] ? (monthShifts[sName][d] !== undefined ? monthShifts[sName][d] : monthShifts[sName][String(d)]) : null;
      if (v) entered = true;
      if (v === "夜") {
        nightCount++;
        staffNames.push(sName);
        const uId = unitOfStaff[sName];
        if (uId !== null && uId !== undefined && perUnit[uId] !== undefined) perUnit[uId]++;
      }
    });
    const dateStr = `${yearMonth}-${String(d).padStart(2, "0")}`;
    if (!entered) {
      unenteredDays.push(dateStr);
      continue;
    }
    const lackingUnits = units.length > 0
      ? units.filter(u => perUnit[Number(u.id)] < 1).map(u => u.name || String(u.id))
      : (nightCount < 1 ? ["事業所"] : []);
    if (lackingUnits.length > 0) {
      shortageDays.push({
        day: d,
        date: dateStr,
        count: nightCount,
        staffNames: staffNames,
        lackingUnits: lackingUnits
      });
    }
  }

  const dayNums = shortageDays.map(x => x.day).sort((a, b) => a - b);
  const consecutivePairs = [];
  for (let i = 0; i < dayNums.length - 1; i++) {
    if (dayNums[i + 1] === dayNums[i] + 1) {
      consecutivePairs.push([dayNums[i], dayNums[i + 1]]);
    }
  }
  const hasConsecutive2 = consecutivePairs.length > 0;
  const isCandidate = hasConsecutive2 || (dayNums.length >= 4);

  return {
    yearMonth: yearMonth,
    shortageDays: shortageDays,
    count: shortageDays.length,
    hasConsecutive2: hasConsecutive2,
    consecutivePairs: consecutivePairs,
    isCandidate: isCandidate,
    standard: standard,
    unenteredDays: unenteredDays
  };
}

// 定員超過判定用：月平均入居者数算出
function cpCalcMonthlyAvgResidents(yearMonth) {
  if (!yearMonth) return { totalPersonDays: 0, daysInMonth: 30, avg: 0 };
  const [yStr, mStr] = yearMonth.split("-");
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(y) || isNaN(m)) return { totalPersonDays: 0, daysInMonth: 30, avg: 0 };
  const daysInMonth = new Date(y, m, 0).getDate();

  const allResidents = (db && db.data && Array.isArray(db.data.residents)) ? db.data.residents : [];
  let totalPersonDays = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const dStr = `${yearMonth}-${String(d).padStart(2, "0")}`;
    let dayCount = 0;
    allResidents.forEach(r => {
      if (!r.admission_date || r.admission_date > dStr) return;
      if (r.status === "退所" && r.discharge_date && r.discharge_date < dStr) return;
      dayCount++;
    });
    totalPersonDays += dayCount;
  }

  const avg = Math.ceil(totalPersonDays / daysInMonth);
  return {
    yearMonth: yearMonth,
    totalPersonDays: totalPersonDays,
    daysInMonth: daysInMonth,
    avg: avg
  };
}

function cpGetStaffShortageTypeLabel(type) {
  switch (type) {
    case "care_over_10": return "介護従業者欠如（1割超）";
    case "care_under_10": return "介護従業者欠如（1割以内）";
    case "planner":
    case "plan_maker": return "計画作成担当者欠如"; // [Claude修正] 画面の選択肢が plan_maker になっていた（今は planner）
    default: return type || "人員基準欠如";
  }
}

// [Claude修正] 人員基準欠如の減算が始まる月
// 1割超 → 翌月から／1割以内・計画作成担当者 → 翌々月から（留意事項通知 第2の1⑻、市川市 運営の手引き）
// 特例（突発的なやむを得ない事情。1割以内と計画作成担当者だけ・年1回・市町村へ報告）は、減算をなくすのではなく猶予。
// 猶予の終わりは市町村が認めた月を入れてもらい（アプリでは決めない）、その翌月から減算する
function cpStaffShortageReductionStartYm(rec) {
  if (!rec || !rec.start_ym) return "";
  let startRedYm = (rec.type === "care_over_10") ? cpGetNextYm(rec.start_ym) : cpAddMonths(rec.start_ym, 2);
  if (rec.is_waiver && rec.type !== "care_over_10" && rec.waiver_until_ym) {
    const afterWaiver = cpGetNextYm(rec.waiver_until_ym);
    if (afterWaiver > startRedYm) startRedYm = afterWaiver;
  }
  return startRedYm;
}

// 減算判定
function cpGetActiveReductions(yearMonth) {
  const settings = cpGetKasanSettings();
  let has_yagen = false;
  let yagen_reason = "";
  let yagen_unconfirmed = false;
  let prevShortageCount = 0;

  // 1. 夜勤減算（前月の確定による）
  const prevYm = cpGetPrevYm(yearMonth);
  if (prevYm && settings.night_shortage && settings.night_shortage[prevYm]) {
    const prevConf = settings.night_shortage[prevYm];
    if (prevConf.confirmed && prevConf.condition_met) {
      has_yagen = true;
      yagen_reason = `前月（${prevYm}）の夜勤人員不足確定による（${prevConf.condition_reason || "基準該当"}）`;
    }
  }
  if (prevYm) {
    const cand = cpDetectNightShortageCandidate(prevYm);
    if (cand.isCandidate && (!settings.night_shortage || !settings.night_shortage[prevYm] || !settings.night_shortage[prevYm].confirmed)) {
      yagen_unconfirmed = true;
      prevShortageCount = cand.count;
    }
  }

  // 2. 定員超過減算
  let has_cho = false;
  let cho_reason = "";
  const capacity = (settings.capacity && parseInt(settings.capacity, 10) > 0) ? parseInt(settings.capacity, 10) : 0;
  if (capacity > 0 && settings.capacity_excess) {
    Object.keys(settings.capacity_excess).forEach(ymKey => {
      const rec = settings.capacity_excess[ymKey];
      // [Claude修正] 「定員内」で確定した月（is_excess: false）は減算しない
      if (!rec || !rec.confirmed || rec.is_excess === false) return;
      let startRedYm = "";
      if (rec.is_disaster_grace) {
        startRedYm = cpAddMonths(ymKey, 2);
      } else {
        startRedYm = cpGetNextYm(ymKey);
      }
      const resolvedYm = rec.resolved_ym || "";
      if (yearMonth >= startRedYm && (!resolvedYm || yearMonth <= resolvedYm)) {
        has_cho = true;
        cho_reason = `${ymKey}定員超過確定（平均${rec.avg_residents}名/定員${rec.capacity}名）による（解消月: ${resolvedYm || "継続中"}）`;
      }
    });
  }

  let cho_candidate = false;
  let cho_avg = 0;
  if (capacity > 0) {
    const mCalc = cpCalcMonthlyAvgResidents(yearMonth);
    cho_avg = mCalc.avg;
    if (cho_avg > capacity) {
      cho_candidate = true;
    }
  }

  // 3. 人員基準欠如減算
  let has_ketsu = false;
  let ketsu_reason = "";
  const staffShortages = Array.isArray(settings.staff_shortage) ? settings.staff_shortage : [];
  staffShortages.forEach(rec => {
    if (!rec || !rec.start_ym) return;
    if (rec.voided) return;
    if (rec.type === "care_under_10" && rec.waiver_next_month_end) return;

    const startRedYm = cpStaffShortageReductionStartYm(rec);
    const resolvedYm = rec.resolved_ym || "";
    if (yearMonth >= startRedYm && (!resolvedYm || yearMonth <= resolvedYm)) {
      has_ketsu = true;
      ketsu_reason = `${cpGetStaffShortageTypeLabel(rec.type)}（${rec.start_ym}発生）による（解消月: ${resolvedYm || "継続中"}）`;
    }
  });

  const conflict = has_cho && has_ketsu;

  return {
    yearMonth: yearMonth,
    has_yagen: has_yagen,
    yagen_reason: yagen_reason,
    yagen_unconfirmed: yagen_unconfirmed,
    prevYm: prevYm,
    prevShortageCount: prevShortageCount,
    has_cho: has_cho,
    cho_reason: cho_reason,
    cho_candidate: cho_candidate,
    cho_avg: cho_avg,
    capacity: capacity,
    has_ketsu: has_ketsu,
    ketsu_reason: ketsu_reason,
    conflict: conflict
  };
}

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
// [Claude修正] 前の形（医療連携体制加算の選択の中に（Ⅱ）があった）で保存された設定を、今の形で読む
function cpKasanNormalizeTaiseiItems(rawItems) {
  const items = Object.assign({}, rawItems || {});
  const mc = items.medical_coop;
  if (mc && mc.option_key === "2") {
    if (!items.medical_coop2 || !items.medical_coop2.option_key) {
      items.medical_coop2 = { option_key: "1", notified_date: mc.notified_date || "" };
    }
    items.medical_coop = { option_key: "", notified_date: "" };
  }
  return items;
}

// 医療連携体制加算（Ⅰ）イ・ロ・ハ のどれかを届け出ているか
function cpKasanHasMedicalCoop1(taiseiItems) {
  const mc = taiseiItems && taiseiItems.medical_coop;
  return !!(mc && ["1_a", "1_b", "1_c"].includes(mc.option_key));
}

function cpKasanIsNotified(item) {
  return !!(item && item.option_key && item.option_key !== "none");
}

function cpGetKasanSettings() {
  const raw = (db && db.data && db.data.kasan_settings) || {};
  return {
    office_no: raw.office_no || "",
    media_code: raw.media_code || "",
    region_type: raw.region_type || "",
    capacity: (raw.capacity !== undefined && raw.capacity !== null && raw.capacity !== "") ? parseInt(raw.capacity, 10) : "",
    shogu_type: raw.shogu_type || "",
    night_shortage: Object.assign({}, raw.night_shortage || {}),
    capacity_excess: Object.assign({}, raw.capacity_excess || {}),
    staff_shortage: Array.isArray(raw.staff_shortage) ? raw.staff_shortage.slice() : [],
    taisei_items: cpKasanNormalizeTaiseiItems(raw.taisei_items),
    gensan_items: Object.assign({}, raw.gensan_items || {}),
    committee_rules: Array.isArray(raw.committee_rules) ? raw.committee_rules.slice() : [],
    edit_history: Array.isArray(raw.edit_history) ? raw.edit_history.slice() : []
  };
}function cpKasanUnitKey() {
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
  const reductions = cpGetActiveReductions(yearMonth);

  // 1. 基本サービスコード（減算コード置換）
  const careLevel = r.care_level || "";
  let basicCodeObj = null;
  let basicCategory = "基本";
  let basicNote = "";

  if (reductions.has_cho && reductions.has_ketsu) {
    basicCodeObj = reductions.has_yagen
      ? (CP_KASAN_REDUCED_BASIC_CODES[unitKey].yagen_cho[careLevel] || null)
      : (CP_KASAN_REDUCED_BASIC_CODES[unitKey].cho[careLevel] || null);
    basicCategory = "基本（減算）";
    basicNote = reductions.has_yagen ? "定員超過・人員欠如・夜勤減算重なり（要市町村確認）" : "定員超過・人員欠如重なり（要市町村確認）";
  } else if (reductions.has_cho) {
    basicCodeObj = reductions.has_yagen
      ? (CP_KASAN_REDUCED_BASIC_CODES[unitKey].yagen_cho[careLevel] || null)
      : (CP_KASAN_REDUCED_BASIC_CODES[unitKey].cho[careLevel] || null);
    basicCategory = "基本（減算）";
    basicNote = reductions.has_yagen ? "定員超過減算・夜勤減算" : "定員超過減算";
  } else if (reductions.has_ketsu) {
    basicCodeObj = reductions.has_yagen
      ? (CP_KASAN_REDUCED_BASIC_CODES[unitKey].yagen_ketsu[careLevel] || null)
      : (CP_KASAN_REDUCED_BASIC_CODES[unitKey].ketsu[careLevel] || null);
    basicCategory = "基本（減算）";
    basicNote = reductions.has_yagen ? "人員基準欠如減算・夜勤減算" : "人員基準欠如減算";
  } else if (reductions.has_yagen) {
    basicCodeObj = CP_KASAN_REDUCED_BASIC_CODES[unitKey].yagen[careLevel] || null;
    basicCategory = "基本（減算）";
    basicNote = "夜勤減算（97/100）";
  } else {
    basicCodeObj = CP_KASAN_BASIC_CODES[unitKey][careLevel] || null;
  }

  if (!basicCodeObj) {
    return { resident: r, yearMonth: yearMonth, unitKey: unitKey, basicDays: basicDays, hospDays: hospDaysCount, items: [], totalUnits: 0, regionType: settings.region_type, regionRate: null, estimatedYen: null, levelMissing: true, careLevel: careLevel, reductions: reductions };
  }
  if (basicDays > 0) {
    items.push({
      category: basicCategory,
      code: basicCodeObj.code,
      name: basicCodeObj.name,
      unit_price: basicCodeObj.units,
      count: basicDays,
      unit_label: "日",
      subtotal: basicCodeObj.units * basicDays,
      note: basicNote
    });
  }

  // 2. 利用者ごとの加算
  // a. 初期加算 1550 30単位/日: 入居日より30日以内
  if (r.admission_date) {
    // [Claude修正] 数え始める日: 入居日と、30日を超える入院から戻った日（退院した日）。それぞれから30日以内（入居日・戻った日を1日目）
    // 根拠: 市川市 運営の手引き（R8）「30日を超える病院または診療所への入院後に再入居した場合は、上記にかかわらず、初期加算が算定されます」、鹿児島市 自己点検シート（R8）
    // 入院の長さは「退院日 − 入院日」の日数で見る（数え方を名指しした資料はまだない → 表の注に出す）
    const initStarts = [{ date: r.admission_date, label: `入居 ${r.admission_date}` }];
    const hospList = (typeof cpGetHospitalizations === "function") ? cpGetHospitalizations(r) : (r.hospitalizations || []).filter(h => h && !h.voided);
    hospList.forEach(h => {
      if (!h || !h.admission_date || !h.discharge_date) return;
      const stay = Math.round((new Date(h.discharge_date) - new Date(h.admission_date)) / 86400000);
      if (stay > 30) initStarts.push({ date: h.discharge_date, label: `入院 ${h.admission_date}〜${h.discharge_date}（${stay}日）のあとの再入居` });
    });
    let initDays = 0;
    const usedStarts = new Set();
    for (let d = 1; d <= daysInMonth; d++) {
      const dStr = `${yStr}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (!(daysCalc.details && daysCalc.details[dStr] === "BASIC")) continue;
      const hit = initStarts.find(s => {
        if (dStr < s.date) return false;
        const diffDays = Math.round((new Date(dStr) - new Date(s.date)) / 86400000);
        return diffDays >= 0 && diffDays < 30;
      });
      if (hit) { initDays++; usedStarts.add(hit.label); }
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
        note: Array.from(usedStarts).join("／") + (Array.from(usedStarts).some(x => x.includes("再入居")) ? "（入院の長さの数え方は市町村に確かめてください）" : "") + "。過去3か月（自立度Ⅲ以上は1か月）にこの事業所に入居していたかは、記録がないので確かめていません"
      });
    }
  }

  // b. 入院時費用 6400 246単位/日
  if (hospDaysCount > 0) {
    items.push({
      category: "個別加算",
      code: CP_KASAN_RESIDENT_DEFS.hospital.code,
      name: CP_KASAN_RESIDENT_DEFS.hospital.name,
      unit_price: CP_KASAN_RESIDENT_DEFS.hospital.units,
      count: hospDaysCount,
      unit_label: "日",
      subtotal: CP_KASAN_RESIDENT_DEFS.hospital.units * hospDaysCount,
      note: "退院・再入居見込み"
    });
  }

  // c. 看取り介護加算
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
          note: `死亡日: ${r.discharge_date}（届出・医療連携の算定・同意などの要件は確認してください）`
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
          note: "死亡日前日・前々日"
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
          note: "死亡日前4〜30日"
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
          note: "死亡日前31〜45日"
        });
      }
    }
  }

  // d. 退居時相談援助加算（候補提示）
  // [Claude修正] 利用期間が1か月を超えること・死亡退居は対象外（33c3910 で抜けていた）
  let consultOverOneMonth = false;
  if (r.admission_date && r.discharge_date) {
    const a = new Date(r.admission_date + "T00:00:00");
    const oneMonthLater = new Date(a.getFullYear(), a.getMonth() + 1, a.getDate());
    consultOverOneMonth = new Date(r.discharge_date + "T00:00:00") > oneMonthLater;
  }
  if (r.status === "退所" && r.discharge_date && r.discharge_reason !== "死亡退所" && consultOverOneMonth) {
    const disMonth = r.discharge_date.slice(0, 7);
    if (disMonth === yearMonth) {
      items.push({
        category: "個別加算",
        code: CP_KASAN_RESIDENT_DEFS.discharge_consult.code,
        name: CP_KASAN_RESIDENT_DEFS.discharge_consult.name,
        unit_price: CP_KASAN_RESIDENT_DEFS.discharge_consult.units,
        count: 1,
        unit_label: "回",
        subtotal: 0,
        candidate: true,
        note: `候補（退居日 ${r.discharge_date}）。退居の日から2週間以内に、市町村と地域包括支援センター等へ情報を提供したか、退居先（病院・診療所への入院、介護保険施設・グループホーム・特定施設などは対象外）を確かめてから請求する。合計には入れていません`
      });
    }
  }

  // e. 科学的介護推進体制加算
  let lifeSubmitNote = "";
  if (r.admission_date) {
    const isStartMonth = (r.admission_date.slice(0, 7) === yearMonth);
    const isEndMonth = (r.discharge_date && r.discharge_date.slice(0, 7) === yearMonth);
    const startY = parseInt(r.admission_date.slice(0, 4), 10);
    const startM = parseInt(r.admission_date.slice(5, 7), 10);
    const diffMonths = ((y - startY) * 12) + (m - startM);
    if (basicDays > 0 && (isStartMonth || isEndMonth || (diffMonths >= 0 && diffMonths % 3 === 0))) {
      lifeSubmitNote = isStartMonth ? "LIFE 提出の月（利用開始）" : (isEndMonth ? "LIFE 提出の月（利用終了）" : "LIFE 提出の月（3月ごとの目安）");
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

  // 3. 事業所の体制加算
  CP_KASAN_TAISEI_DEFS.forEach(def => {
    const setItem = settings.taisei_items[def.id];
    if (def.computed_elsewhere) return;
    if (setItem && setItem.option_key && setItem.option_key !== "none") {
      const opt = def.options.find(o => o.key === setItem.option_key);
      if (opt && opt.code && opt.units > 0) {
        // [Claude修正] 医療連携体制加算（Ⅰ）を届け出ていないと付けない加算（医療連携体制加算（Ⅱ）・協力医療機関連携加算）
        if (def.requires_medical_coop1 && !cpKasanHasMedicalCoop1(settings.taisei_items)) {
          items.push({
            category: "体制加算",
            code: opt.code,
            name: opt.label,
            unit_price: 0,
            count: 1,
            unit_label: def.unit_type === "日" ? "日" : "月",
            subtotal: 0,
            candidate: true,
            note: "医療連携体制加算（Ⅰ）の届出がないため算定できません"
          });
          return;
        }
        // [Claude修正] 認知症専門ケア加算と認知症チームケア推進加算は一緒に付けられない（市川市 運営の手引き・鹿児島市 自己点検シート）
        if ((def.id === "dementia_care" || def.id === "dementia_team") &&
            cpKasanIsNotified(settings.taisei_items.dementia_care) && cpKasanIsNotified(settings.taisei_items.dementia_team)) {
          items.push({
            category: "体制加算",
            code: opt.code,
            name: opt.label,
            unit_price: 0,
            count: 1,
            unit_label: def.unit_type === "日" ? "日" : "月",
            subtotal: 0,
            candidate: true,
            note: "認知症専門ケア加算と認知症チームケア推進加算は一緒に算定できません。設定でどちらか一方にしてください"
          });
          return;
        }
        // 定員超過または人員欠如の月は除外される4加算
        if ((reductions.has_cho || reductions.has_ketsu) &&
            ["night_support", "service_supply", "oral", "nutrition"].includes(def.id)) {
          items.push({
            category: "体制加算",
            code: opt.code,
            name: opt.label,
            unit_price: 0,
            count: 1,
            unit_label: def.unit_type === "日" ? "日" : "月",
            subtotal: 0,
            candidate: true,
            note: "定員超過・人員欠如の月のため算定対象外（加算除外）"
          });
          return;
        }

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

  // 4. 既存個別減算（身体拘束廃止未実施減算等）
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

  // 5. 介護職員等処遇改善加算
  if (settings.shogu_type && settings.shogu_type !== "none" && basicDays > 0) {
    const shoguDef = CP_KASAN_SHOGU_DEFS[settings.shogu_type];
    if (shoguDef) {
      const sumOtherUnits = items.reduce((sum, it) => sum + (it.candidate ? 0 : it.subtotal), 0);
      const shoguUnits = cpComputeShoguUnits(sumOtherUnits, shoguDef.rate);
      items.push({
        category: "体制加算",
        code: shoguDef.code,
        name: shoguDef.name,
        unit_price: shoguUnits,
        count: 1,
        unit_label: "月",
        subtotal: shoguUnits,
        note: `他算定合計 ${sumOtherUnits}単位 × ${shoguDef.rate}/1000`
      });
    }
  }

  const totalUnits = items.reduce((sum, it) => sum + (it.candidate ? 0 : it.subtotal), 0);

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
    daysCalc: daysCalc,
    items: items,
    totalUnits: totalUnits,
    regionType: settings.region_type,
    regionRate: regionRate,
    estimatedYen: estimatedYen,
    reductions: reductions
  };
}

let gKasanSelectedMonth = "";
let gKasanInspectNightYm = "";
let gKasanInspectCapacityYm = "";

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
  const rawGensanCount = Object.values(settings.gensan_items).filter(x => {
    if (!x || x.has_gensan !== "あり") return false;
    return (!x.start_month || ym >= x.start_month) && (!x.end_month || ym <= x.end_month);
  }).length;
  const reds = cpGetActiveReductions(ym);
  let activeGensanCount = rawGensanCount;
  if (reds.has_yagen) activeGensanCount++;
  if (reds.has_cho) activeGensanCount++;
  if (reds.has_ketsu) activeGensanCount++;

  // 減算状態・警告バナーの作成
  const reductionItems = [];
  if (reds.has_yagen) {
    reductionItems.push(`<div style="margin-bottom:4px;">・<strong>夜勤職員の基準を満たさない減算（夜減・所定単位数の97/100）適用中</strong>: ${escapeHtml(reds.yagen_reason)}</div>`);
  }
  if (reds.has_cho) {
    reductionItems.push(`<div style="margin-bottom:4px;">・<strong>定員超過利用の減算（超・所定単位数の70/100）適用中</strong>: ${escapeHtml(reds.cho_reason)}</div>`);
  }
  if (reds.has_ketsu) {
    reductionItems.push(`<div style="margin-bottom:4px;">・<strong>人員基準欠如の減算（欠・所定単位数の70/100）適用中</strong>: ${escapeHtml(reds.ketsu_reason)}</div>`);
  }

  const warningItems = [];
  if (reds.yagen_unconfirmed) {
    warningItems.push(`<div style="margin-bottom:4px;">[警告] <strong>前月夜勤未確定の警告</strong>: 前月（${escapeHtml(reds.prevYm)}）の勤務表に夜勤不足が疑われる日（${reds.prevShortageCount}日）がありますが、夜勤状況が未確定です。「夜勤不足の確定」から確定を行ってください。</div>`);
  }
  if (reds.cho_candidate) {
    warningItems.push(`<div style="margin-bottom:4px;">[注意] <strong>当月定員超過注意</strong>: 当月（${escapeHtml(ym)}）の月平均入居者数（${reds.cho_avg}名）が定員（${reds.capacity}名）を超えています。翌月以降の定員超過減算の対象となる可能性があります。「定員超過の確定」から確認してください。</div>`);
  }
  if (reds.conflict) {
    warningItems.push(`<div style="margin-bottom:4px; font-weight:bold; color:var(--alert);">[警告] <strong>市町村確認注意</strong>: 定員超過減算と人員基準欠如減算が同時に該当しています。重複時の算定ルールや減算の適用順について、市町村に確かめてください。</div>`);
  }

  let reductionAlertHtml = "";
  if (reductionItems.length > 0) {
    reductionAlertHtml += `
      <div style="background:var(--alert-tint); color:var(--alert); border:1px solid var(--alert); border-radius:6px; padding:10px 14px; margin-bottom:10px; font-size:13px; line-height:1.6;">
        <div style="font-weight:bold; font-size:14px; margin-bottom:4px;">当月適用されている減算（計 ${reductionItems.length} 件）:</div>
        ${reductionItems.join("")}
      </div>
    `;
  }
  if (warningItems.length > 0) {
    reductionAlertHtml += `
      <div style="background:var(--caution-tint); color:var(--caution); border:1px solid var(--line); border-radius:6px; padding:10px 14px; margin-bottom:10px; font-size:13px; line-height:1.6;">
        <div style="font-weight:bold; font-size:14px; margin-bottom:4px;">減算に関する確認・警告事項:</div>
        ${warningItems.join("")}
      </div>
    `;
  }
  if (reductionItems.length === 0 && warningItems.length === 0) {
    reductionAlertHtml = `
      <div style="background:var(--pine-tint-2); color:var(--pine-dark); border:1px solid var(--line-2); border-radius:6px; padding:8px 14px; margin-bottom:10px; font-size:13px;">
        当月適用される夜間勤務等減算・定員超過減算・人員基準欠如減算はありません。
      </div>
    `;
  }

// 認知症の加算の対象者の割合（前3か月の各月末時点）の帯
  const dementiaEligibility = cpDementiaCareEligibility(ym);
  const isDementiaCareNotified = cpKasanIsNotified(settings.taisei_items && settings.taisei_items.dementia_care);

  const dementiaMonthRowsHtml = dementiaEligibility.details.map(d => {
    const r3Pct = d.totalCount > 0 ? (d.rank3Ratio * 100).toFixed(1) + "%" : "-";
    const r2Pct = d.totalCount > 0 ? (d.rank2Ratio * 100).toFixed(1) + "%" : "-";
    return `
      <tr style="border-bottom:1px solid var(--line-2);">
        <td style="padding:6px 10px; font-weight:bold; white-space:nowrap;">${escapeHtml(d.ym)} 末（${escapeHtml(d.lastDate)}）</td>
        <td style="padding:6px 10px; text-align:right; white-space:nowrap;">${d.totalCount} 名</td>
        <td style="padding:6px 10px; text-align:right; white-space:nowrap;"><strong>${d.rank3Count}</strong> 名 / ${d.totalCount} 名 (${r3Pct})</td>
        <td style="padding:6px 10px; text-align:right; white-space:nowrap;"><strong>${d.rank2Count}</strong> 名 / ${d.totalCount} 名 (${r2Pct})</td>
        <td style="padding:6px 10px; text-align:right; white-space:nowrap;">${d.hospitalizedCount > 0 ? `${d.hospitalizedCount} 名` : "0 名"}</td>
        <td style="padding:6px 10px; text-align:right; white-space:nowrap;">${d.unregisteredCount > 0 ? `<span style="color:var(--alert); font-weight:bold;">${d.unregisteredCount} 名</span>` : "0 名"}</td>
      </tr>
    `;
  }).join("");

  const avg3Pct = (dementiaEligibility.avgRatio3 * 100).toFixed(1) + "%";
  const avg2Pct = (dementiaEligibility.avgRatio2 * 100).toFixed(1) + "%";

  let dementiaCareNoticeHtml = "";
  if (isDementiaCareNotified) {
    if (!dementiaEligibility.isEligible) {
      dementiaCareNoticeHtml = `
        <div style="background:var(--alert-tint); color:var(--alert); border:1px solid var(--alert); border-radius:4px; padding:8px 12px; margin-top:8px; font-size:13px; line-height:1.6;">
          <strong>[警告] 認知症専門ケア加算</strong>: 対象者の割合が2分の1に届いていません（前3か月の各月末の平均: ${avg3Pct}）。※合計からは外していません（外すかどうかは市町村の判断のため、市町村に確かめてください）。
        </div>
      `;
    } else {
      dementiaCareNoticeHtml = `
        <div style="background:var(--pine-tint-2); color:var(--pine-dark); border:1px solid var(--line-2); border-radius:4px; padding:8px 12px; margin-top:8px; font-size:13px; line-height:1.6;">
          <strong>[適合] 認知症専門ケア加算</strong>: 前3か月の各月末の平均割合は ${avg3Pct} で、基準（2分の1以上）を満たしています。
        </div>
      `;
    }
  }

  // [Claude修正] チームケア推進加算も前3か月の各月末の平均で判定する（厚生労働省 令和６年度介護報酬改定に関するＱ＆Ａ（Vol.２）問7）
  const isDementiaTeamNotified = cpKasanIsNotified(settings.taisei_items && settings.taisei_items.dementia_team);
  let dementiaTeamNoticeHtml = "";
  if (isDementiaTeamNotified) {
    dementiaTeamNoticeHtml = dementiaEligibility.isEligible2
      ? `
    <div style="background:var(--pine-tint-2); color:var(--pine-dark); border:1px solid var(--line-2); border-radius:4px; padding:8px 12px; margin-top:8px; font-size:13px; line-height:1.6;">
      <strong>[適合] 認知症チームケア推進加算</strong>: 前3か月の各月末の自立度Ⅱ以上の平均割合は ${avg2Pct} で、基準（2分の1以上）を満たしています。
    </div>
  `
      : `
    <div style="background:var(--alert-tint); color:var(--alert); border:1px solid var(--alert); border-radius:4px; padding:8px 12px; margin-top:8px; font-size:13px; line-height:1.6;">
      <strong>[警告] 認知症チームケア推進加算</strong>: 自立度Ⅱ以上の割合が2分の1に届いていません（前3か月の各月末の平均: ${avg2Pct}）。※合計からは外していません（外すかどうかは市町村の判断のため、市町村に確かめてください）。
    </div>
  `;
  }
  dementiaTeamNoticeHtml += `
    <div style="color:var(--ink-3); font-size:13px; margin-top:6px; line-height:1.6;">
      数え方の根拠: 専門ケア加算 介護保険最新情報 vol.69（平成21年）問114、チームケア推進加算 令和６年度介護報酬改定に関するＱ＆Ａ（Vol.２）問7（どちらも「届出日の属する月の前３月の各月末時点の入所者等数の平均」）
    </div>
  `;

  let dementiaUnregisteredNoticeHtml = "";
  if (dementiaEligibility.totalUnregisteredResidents > 0) {
    dementiaUnregisteredNoticeHtml = `
      <div style="background:var(--caution-tint); color:var(--caution); border:1px solid var(--line-2); border-radius:4px; padding:8px 12px; margin-top:8px; font-size:13px; line-height:1.6;">
        <strong>[注意]</strong> 自立度が未登録の方が ${dementiaEligibility.totalUnregisteredResidents}名います（Ⅲ以上・Ⅱ以上に数えていません）。利用者のカルテ（利用者詳細の「認知症高齢者の日常生活自立度」）から登録できます。
      </div>
    `;
  }

  const dementiaRatioBandHtml = `
    <div class="panel-card" style="margin-bottom:12px; padding:12px 14px; border:1px solid var(--line); border-radius:6px; background:var(--surface);">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:8px;">
        <div style="font-weight:bold; font-size:14px; color:var(--pine-dark);">
          認知症の加算の対象者の割合（前3か月の各月末時点）
        </div>
        <div style="font-size:13px; color:var(--ink-3);">
          確認する年月: <strong>${escapeHtml(ym)}</strong>（前3か月: ${escapeHtml(dementiaEligibility.months.join(", "))}）
        </div>
      </div>
      <div style="overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:13px; min-width:620px;">
          <thead>
            <tr style="background:var(--pine-tint-2); border-bottom:1px solid var(--line);">
              <th style="padding:6px 10px; text-align:left;">対象月（各月末時点）</th>
              <th style="padding:6px 10px; text-align:right;">入居者総数</th>
              <th style="padding:6px 10px; text-align:right;">自立度Ⅲ以上（割合）</th>
              <th style="padding:6px 10px; text-align:right;">自立度Ⅱ以上（割合）</th>
              <th style="padding:6px 10px; text-align:right;">うち入院中</th>
              <th style="padding:6px 10px; text-align:right;">自立度未登録</th>
            </tr>
          </thead>
          <tbody>
            ${dementiaMonthRowsHtml}
          </tbody>
          <tfoot>
            <tr style="background:var(--pine-tint-2); font-weight:bold; border-top:1px solid var(--line);">
              <td style="padding:6px 10px;">前3か月の各月末の平均</td>
              <td style="padding:6px 10px; text-align:right;">-</td>
              <td style="padding:6px 10px; text-align:right; color:var(--pine-dark); font-size:14px;">${avg3Pct}</td>
              <td style="padding:6px 10px; text-align:right; color:var(--pine-dark); font-size:14px;">${avg2Pct}</td>
              <td style="padding:6px 10px; text-align:right;">-</td>
              <td style="padding:6px 10px; text-align:right;">${dementiaEligibility.totalUnregisteredResidents > 0 ? `<span style="color:var(--alert); font-weight:bold;">${dementiaEligibility.totalUnregisteredResidents}名</span>` : "0名"}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      ${dementiaCareNoticeHtml}
      ${dementiaTeamNoticeHtml}
      ${dementiaUnregisteredNoticeHtml}
    </div>
  `;

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
        <button type="button" class="btn btn-primary" onclick="openKasanCsvModal()">国保連へのファイルを作る</button>
        <button type="button" class="btn btn-secondary" onclick="printKasanMonthlyTable()">確認表をA4横印刷</button>
        <button type="button" class="btn btn-secondary" onclick="openKasanSettingsModal()">事業所の加算・減算設定</button>
        <button type="button" class="btn btn-secondary" onclick="openKasanNightConfirmModal()">夜勤不足の確定</button>
        <button type="button" class="btn btn-secondary" onclick="openKasanCapacityConfirmModal()">定員超過の確定</button>
        <button type="button" class="btn btn-secondary" onclick="openKasanStaffShortageModal()">人員基準欠如の登録</button>
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

    ${reductionAlertHtml}

    ${dementiaRatioBandHtml}

    <p class="panel-note" style="margin:4px 0 12px; line-height:1.6;">
      ※月ごと・利用者ごとに算定対象となる加算・減算の目安です。基本の日数および金額は「目安」と表示しています。
      入院した日・退院した日・外泊の日の基本日数への算入基準は確認中のため、確定値ではありません。
      短期利用（38）・介護予防（37・39）はまだ入っていません。夜勤・定員超過・人員基準欠如の減算は、上のボタンで確定・登録した内容から反映します。
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

  // 事業所番号・媒体区分
  const offEl = document.getElementById("kasanOfficeNo");
  if (offEl) offEl.value = settings.office_no || "";
  const medEl = document.getElementById("kasanMediaCode");
  if (medEl) medEl.value = settings.media_code || "";

  // 地域区分
  // 利用定員・処遇改善加算
  const capEl = document.getElementById("kasanCapacity");
  if (capEl) capEl.value = (settings.capacity !== "" && settings.capacity !== undefined && settings.capacity !== null) ? settings.capacity : "";
  const shoguEl = document.getElementById("kasanShoguSelect");
  if (shoguEl) shoguEl.value = settings.shogu_type || "";

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
  const officeNo = (document.getElementById("kasanOfficeNo")?.value || "").trim();
  const mediaCode = (document.getElementById("kasanMediaCode")?.value || "").trim();
  const capValRaw = (document.getElementById("kasanCapacity")?.value || "").trim();
  const capVal = capValRaw ? parseInt(capValRaw, 10) : "";
  const shoguVal = (document.getElementById("kasanShoguSelect")?.value || "").trim();

  let kasanError = "";
  if (capValRaw && (isNaN(capVal) || capVal <= 0)) {
    kasanError = "利用定員は1以上の数値を入力してください。";
  }
  if (officeNo && !/^[A-Za-z0-9]{10}$/.test(officeNo)) {
    kasanError = "事業所番号は英数字10桁ちょうどで入力してください。";
  }

  const nextSettings = {
    office_no: officeNo,
    media_code: mediaCode,
    region_type: (document.getElementById("kasanRegionSelect")?.value || "").trim(),
    capacity: capVal,
    shogu_type: shoguVal,
    night_shortage: curSettings.night_shortage || {},
    capacity_excess: curSettings.capacity_excess || {},
    staff_shortage: curSettings.staff_shortage || [],
    taisei_items: {},
    gensan_items: {},
    committee_rules: curSettings.committee_rules || [],
    edit_history: curSettings.edit_history || []
  };

  const kasanToday = toLocalDateStr(new Date());
  const kasanThisMonth = kasanToday.slice(0, 7);
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

  // [Claude修正] 加算どうしの決まり
  if (!kasanError) {
    const ti = nextSettings.taisei_items;
    const hasMc1 = cpKasanHasMedicalCoop1(ti);
    if (cpKasanIsNotified(ti.medical_coop2) && !hasMc1) kasanError = "医療連携体制加算（Ⅱ）は、医療連携体制加算（Ⅰ）イ・ロ・ハのどれかを届け出ている場合だけ選べます。";
    else if (cpKasanIsNotified(ti.coop_hospital) && !hasMc1) kasanError = "協力医療機関連携加算は、医療連携体制加算（Ⅰ）を届け出ている場合だけ選べます。";
    else if (cpKasanIsNotified(ti.dementia_care) && cpKasanIsNotified(ti.dementia_team)) kasanError = "認知症専門ケア加算と認知症チームケア推進加算は一緒に算定できません。どちらか一方を「届出なし」にしてください。";
  }

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
    const normTaisei = (raw) => {
    const res = {};
    CP_KASAN_TAISEI_DEFS.forEach(def => {
      const it = (raw && raw[def.id]) || {};
      res[def.id] = {
        option_key: it.option_key || "",
        notified_date: it.notified_date || ""
      };
    });
    return res;
  };

  const normGensan = (raw) => {
    const res = {};
    CP_KASAN_GENSAN_DEFS.forEach(def => {
      const it = (raw && raw[def.id]) || {};
      res[def.id] = {
        has_gensan: it.has_gensan || "なし",
        start_month: it.start_month || "",
        end_month: it.end_month || "",
        reason: it.reason || ""
      };
    });
    return res;
  };

  const curJson = JSON.stringify({
    office_no: curSettings.office_no || "",
    media_code: curSettings.media_code || "",
    region_type: curSettings.region_type || "",
    capacity: (curSettings.capacity !== "" && curSettings.capacity !== undefined && curSettings.capacity !== null) ? Number(curSettings.capacity) : "",
    shogu_type: curSettings.shogu_type || "",
    taisei_items: normTaisei(curSettings.taisei_items),
    gensan_items: normGensan(curSettings.gensan_items)
  });
  const nextJson = JSON.stringify({
    office_no: nextSettings.office_no || "",
    media_code: nextSettings.media_code || "",
    region_type: nextSettings.region_type || "",
    capacity: (nextSettings.capacity !== "" && nextSettings.capacity !== undefined && nextSettings.capacity !== null) ? Number(nextSettings.capacity) : "",
    shogu_type: nextSettings.shogu_type || "",
    taisei_items: normTaisei(nextSettings.taisei_items),
    gensan_items: normGensan(nextSettings.gensan_items)
  });

  if (curJson === nextJson) {
    alert("変更された項目がありません。");
    closeKasanSettingsModal();
    return;
  }

  const logDetail = `事業所番号: ${nextSettings.office_no || "未設定"}、媒体区分: ${nextSettings.media_code || "未設定"}、地域区分: ${nextSettings.region_type || "未設定"}、届出加算・減算更新`;
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


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. 国保連請求ファイル（CSV）作成機能（インタフェース仕様書 令和6年4月版 準拠）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let gKasanGeneratedCsvText = "";
let gKasanGeneratedCsvFileName = "";
let gKasanCsvValidationResult = null;

// 要介護状態区分コード マッピング（要介護1=21, 2=22, 3=23, 4=24, 5=25）
const CP_KASAN_CARE_LEVEL_CODES = {
  "要介護1": "21",
  "要介護2": "22",
  "要介護3": "23",
  "要介護4": "24",
  "要介護5": "25"
};

// モーダルを開く（権限チェック & 初期検証）
function openKasanCsvModal() {
  if (typeof isCurrentStaffAdminOrClerk === "function" && !isCurrentStaffAdminOrClerk()) {
    alert("国保連請求ファイルの作成は、管理者および事務員のみ操作可能です。");
    return;
  }

  const modal = document.getElementById("kasanCsvModal");
  if (!modal) return;

  const ym = gKasanSelectedMonth || toLocalDateStr(new Date()).slice(0, 7);
  const [yStr, mStr] = ym.split("-");
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  let nextY = y;
  let nextM = m + 1;
  if (nextM > 12) {
    nextM = 1;
    nextY += 1;
  }
  const nextYmFmt = `${nextY}年${nextM}月`;

  const ymDisp = document.getElementById("kasanCsvTargetYmDisp");
  if (ymDisp) ymDisp.textContent = `${yStr}年${mStr}月`;
  const nextDisp = document.getElementById("kasanCsvNextYmDisp");
  if (nextDisp) nextDisp.textContent = nextYmFmt;

  // 初期化
  gKasanGeneratedCsvText = "";
  gKasanGeneratedCsvFileName = "";
  const previewSec = document.getElementById("kasanCsvPreviewSection");
  if (previewSec) previewSec.style.display = "none";
  const dlBtn = document.getElementById("kasanCsvDownloadBtn");
  if (dlBtn) dlBtn.style.display = "none";
  const statusEl = document.getElementById("kasanCsvActionStatus");
  if (statusEl) statusEl.textContent = "";

  renderKasanCsvValidation(ym);
  modal.style.display = "flex";
}

function closeKasanCsvModal() {
  const modal = document.getElementById("kasanCsvModal");
  if (modal) modal.style.display = "none";
}

// 利用者ごとの必須情報チェック
function cpValidateResidentForKasanCsv(r, ym) {
  const missing = [];
  
  const insNo = (r.insured_no || "").trim();
  if (!insNo) {
    missing.push("被保険者番号");
  } else if (!/^[A-Za-z0-9]{1,10}$/.test(insNo)) {
    missing.push("被保険者番号（半角英数字10桁以内）");
  }

  const insurerNo = (r.insurer_no || "").trim();
  if (!insurerNo) {
    missing.push("証記載保険者番号");
  } else if (!/^\d{6}$/.test(insurerNo)) { // [Claude修正] 証記載保険者番号は数字6桁（共通編 1.4 コード一覧）
    missing.push("証記載保険者番号（数字6桁）");
  }

  if (!r.gender || (r.gender !== "1" && r.gender !== "2")) {
    missing.push("性別");
  }

  if (!r.benefit_rate || !["90", "80", "70"].includes(String(r.benefit_rate))) {
    missing.push("保険給付率");
  }

  if (!r.care_start_date) {
    missing.push("認定有効期間開始日");
  }
  if (!r.care_expiry_date) {
    missing.push("認定有効期間終了日（要介護認定有効期限）");
  }
  if (r.care_start_date && r.care_expiry_date && r.care_start_date >= r.care_expiry_date) {
    missing.push("認定有効期間（開始日が終了日以降）");
  }

  if (!r.birth_date) {
    missing.push("生年月日");
  }

  if (!r.admission_date) {
    missing.push("入所年月日（入居日）");
  }

  // 退所月の場合、退所後の状態が必要
  const isDischargeMonth = (r.status === "退所" && r.discharge_date && r.discharge_date.slice(0, 7) === ym);
  if (isDischargeMonth) {
    if (!r.post_discharge_status) {
      missing.push("退所後の状態");
    }
  }

  // 要介護度（1〜5であること）
  const careCode = CP_KASAN_CARE_LEVEL_CODES[r.care_level || ""];
  if (!careCode) {
    missing.push(`要介護度（要介護1〜5が必要: 現在 ${r.care_level || "未登録"}）`);
  }

  return {
    valid: missing.length === 0,
    missing: missing
  };
}

// モーダル内の検証一覧表示
function renderKasanCsvValidation(ym) {
  const settings = cpGetKasanSettings();
  const summaryEl = document.getElementById("kasanCsvValidationSummary");
  const listBody = document.getElementById("kasanCsvResidentListBody");
  const genBtn = document.getElementById("kasanCsvGenerateBtn");

  const officeErrors = [];
  if (!settings.office_no) {
    officeErrors.push("事業所番号が未設定です（加算・減算設定で登録してください）");
  } else if (!/^[A-Za-z0-9]{10}$/.test(settings.office_no)) {
    officeErrors.push("事業所番号が英数字10桁ではありません");
  }
  if (!settings.media_code) {
    officeErrors.push("媒体区分が未選択です（加算・減算設定で登録してください）");
  }
  if (!settings.region_type) {
    officeErrors.push("地域区分が未選択です（加算・減算設定で登録してください）");
  }

  const allResidents = (db && db.data && Array.isArray(db.data.residents)) ? db.data.residents : [];
  const candidateResults = [];
  let eligibleCount = 0;
  let ineligibleCount = 0;

  allResidents.forEach(r => {
    const calc = cpComputeMonthlyKasan(r, ym);
    if (calc.basicDays > 0 || calc.hospDays > 0 || calc.items.length > 0) {
      const v = cpValidateResidentForKasanCsv(r, ym);
      if (v.valid) eligibleCount++;
      else ineligibleCount++;
      candidateResults.push({
        resident: r,
        calc: calc,
        validation: v
      });
    }
  });

  gKasanCsvValidationResult = {
    ym: ym,
    settings: settings,
    officeErrors: officeErrors,
    candidates: candidateResults,
    eligibleCount: eligibleCount,
    ineligibleCount: ineligibleCount
  };

  let summaryHtml = "";
  if (officeErrors.length > 0) {
    summaryHtml += `
      <div style="background:var(--alert-tint); color:var(--alert); border:1px solid var(--alert); border-radius:4px; padding:8px 12px; font-size:13px; font-weight:bold; margin-bottom:8px;">
        【事業所情報のエラー】以下の設定を完了するまでCSVファイルを作成できません:<br>
        ${officeErrors.map(e => `・${escapeHtml(e)}`).join("<br>")}
      </div>
    `;
  } else {
    summaryHtml += `
      <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap; font-size:13px; margin-bottom:6px;">
        <span class="badge" style="background:var(--pine-tint); color:var(--pine-dark); padding:4px 8px;">事業所番号: <strong>${escapeHtml(settings.office_no)}</strong></span>
        <span class="badge" style="background:var(--pine-tint); color:var(--pine-dark); padding:4px 8px;">媒体区分: <strong>${escapeHtml(settings.media_code === "1" ? "1 伝送" : "7 伝送（インターネット）")}</strong></span>
        <span class="badge" style="background:var(--pine-tint); color:var(--pine-dark); padding:4px 8px;">作成可能: <strong>${eligibleCount}</strong> 名</span>
        ${ineligibleCount > 0 ? `<span class="badge" style="background:var(--caution-tint); color:var(--caution); padding:4px 8px; font-weight:bold;">情報不足（作成不可）: <strong>${ineligibleCount}</strong> 名</span>` : `<span class="badge" style="background:var(--pine-tint-2); color:var(--pine-dark); padding:4px 8px;">全員作成可能</span>`}
      </div>
    `;
    if (ineligibleCount > 0) {
      summaryHtml += `
        <div style="font-size:13px; color:var(--caution); margin-bottom:6px;">
          ※情報不足の利用者は除外され、作成可能な利用者（${eligibleCount}名）のみで請求CSVファイルが作成されます。
        </div>
      `;
    }
  }
  if (summaryEl) summaryEl.innerHTML = summaryHtml;

  if (listBody) {
    if (candidateResults.length === 0) {
      listBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:16px; color:var(--ink-3);">当月の算定対象となる利用者の記録はありません。</td></tr>`;
    } else {
      listBody.innerHTML = candidateResults.map(item => {
        const r = item.resident;
        const v = item.validation;
        const isOk = v.valid;
        const statusBadge = isOk
          ? `<span class="badge" style="background:var(--pine-tint); color:var(--pine-dark); font-size:13px; padding:2px 6px;">出せる</span>`
          : `<span class="badge" style="background:var(--alert-tint); color:var(--alert); font-size:13px; padding:2px 6px;">出せない</span>`;
        const missingText = isOk
          ? `<span style="color:var(--pine); font-size:13px;">必要項目が揃っています</span>`
          : `<span style="color:var(--alert); font-size:13px; font-weight:bold;">不足: ${escapeHtml(v.missing.join("、"))}</span>`;

        return `
          <tr>
            <td style="text-align:center; white-space:nowrap;">${statusBadge}</td>
            <td style="font-weight:bold; white-space:nowrap;">${escapeHtml(r.room_no || "-")}号室 ${escapeHtml(r.name)}</td>
            <td style="text-align:center; white-space:nowrap;">${escapeHtml(r.care_level || "未登録")}</td>
            <td style="text-align:right; font-weight:bold; white-space:nowrap;">${item.calc.totalUnits.toLocaleString()} 単位</td>
            <td>${missingText}</td>
          </tr>
        `;
      }).join("");
    }
  }

  if (genBtn) {
    genBtn.disabled = (officeErrors.length > 0 || eligibleCount === 0);
  }
}

// 請求CSVファイルの生成処理
function generateKasanCsvFile() {
  if (typeof isCurrentStaffAdminOrClerk === "function" && !isCurrentStaffAdminOrClerk()) {
    alert("国保連請求ファイルの作成は、管理者および事務員のみ操作可能です。");
    return;
  }

  const val = gKasanCsvValidationResult;
  if (!val || val.officeErrors.length > 0) {
    alert("事業所情報に不備があるため作成できません。加算・減算設定をご確認ください。");
    return;
  }

  const reductions = cpGetActiveReductions(val.ym);
  if (reductions.conflict) {
    alert("定員超過と人員基準欠如が同じ月に重なっています。どちらで請求するか市町村に確かめてください。");
    return;
  }
  const eligibleItems = val.candidates.filter(c => c.validation.valid);
  if (eligibleItems.length === 0) {
    alert("作成可能な利用者が0名のため、請求ファイルを作成できません。利用者の請求情報を登録してください。");
    return;
  }

  const settings = val.settings;
  const ym = val.ym;
  const ymRaw = ym.replace("-", ""); // YYYYMM
  const [yStr, mStr] = ym.split("-");
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  let nextY = y;
  let nextM = m + 1;
  if (nextM > 12) {
    nextM = 1;
    nextY += 1;
  }
  const nextYmRaw = `${nextY}${String(nextM).padStart(2, "0")}`; // 審査年月

  const regionObj = CP_KASAN_REGION_RATES.find(r => r.key === settings.region_type);
  if (!regionObj) {
    alert("地域区分が正しく設定されていません。加算・減算設定をご確認ください。");
    return;
  }
  const unitPriceInt = Math.round(regionObj.rate * 100); // 10.00 -> 1000, 10.90 -> 1090

  const lines = [];
  const previewRows = [];
  let recordNumber = 1;

  // 1行目: コントロールレコード（12項目）
  // 1 レコード種別「1」, 2 レコード番号「1」, 3 ボリューム通番「0」, 4 データレコードの件数, 5 データ種別「711」, 6 福祉事務所特定番号「0」, 7 保険者番号「0」, 8 事業所番号, 9 都道府県番号「0」, 10 媒体区分, 11 処理対象年月, 12 ファイル管理番号「1」
  // 注意: データレコード件数はデータ行作成後に確定して代入する

  // 利用者ごとの計算データ準備
  let grandTotalUnits = 0;
  let grandCost100 = 0;
  let grandHokenDemand = 0;
  let grandUserBurden = 0;

  const residentBlocks = [];

  for (const item of eligibleItems) {
    const r = item.resident;
    const calc = item.calc;
    const benefitRateInt = parseInt(String(r.benefit_rate), 10) || 90;

    const totalUnits = calc.totalUnits;
    const cost100 = Math.floor(totalUnits * unitPriceInt / 100); // [Claude修正] 小数のかけ算だと誤差で1円少なくなることがあるので、整数で計算する
    const hokenDemand = Math.floor(cost100 * benefitRateInt / 100);
    const userBurden = cost100 - hokenDemand;

    grandTotalUnits += totalUnits;
    grandCost100 += cost100;
    grandHokenDemand += hokenDemand;
    grandUserBurden += userBurden;

    // 基本情報レコード 7171 01（56項目）
    const insNo10 = String(r.insured_no || "").trim().padStart(10, "0");
    const insurerNo8 = String(r.insurer_no || "").trim();
    const birthRaw = (r.birth_date || "").replace(/-/g, "");
    const genderCode = String(r.gender || "");
    const careCode = CP_KASAN_CARE_LEVEL_CODES[r.care_level || ""] || "";
    const careStartRaw = (r.care_start_date || "").replace(/-/g, "");
    const careExpiryRaw = (r.care_expiry_date || "").replace(/-/g, "");
    const preStatus = String(r.pre_admission_status || "");
    const admissionRaw = (r.admission_date || "").replace(/-/g, "");

    const isDischargeMonth = (r.status === "退所" && r.discharge_date && r.discharge_date.slice(0, 7) === ym);
    const dischargeRaw = isDischargeMonth ? (r.discharge_date || "").replace(/-/g, "") : "";
    const postStatus = isDischargeMonth ? String(r.post_discharge_status || "") : "";

    // 外泊日数の算出（外泊の歴 r.outings から、外泊した日・戻った日を除く間の日）
    let outingMidDays = 0;
    if (calc.daysCalc && calc.daysCalc.details) {
      Object.values(calc.daysCalc.details).forEach(kd => {
        if (kd === "OUTING_MID") outingMidDays++;
      });
    } else {
      const dCalc = cpKasanBasicDays(r, ym);
      if (dCalc && dCalc.details) {
        Object.values(dCalc.details).forEach(kd => {
          if (kd === "OUTING_MID") outingMidDays++;
        });
      }
    }
    const outingDaysStr = outingMidDays > 0 ? String(outingMidDays) : "";
    const inResidenceDaysStr = String(calc.basicDays);

    const r01_fields = [
      "7171", "01", ymRaw, settings.office_no, insurerNo8, insNo10,
      "", "", "", "", "", "", // 7..12 公費1〜3
      birthRaw, genderCode, careCode, "", // 13..16 (16: 空)
      careStartRaw, careExpiryRaw, // 17..18
      "", "", "", "", // 19..22 居宅サービス計画（空）
      "", admissionRaw, dischargeRaw, inResidenceDaysStr, outingDaysStr, postStatus, // 23..28 (23: 空, 24: 入居, 25: 退居, 26: 入居実日数, 27: 外泊日数, 28: 退居後状態)
      String(benefitRateInt), "", "", "", // 29..32 給付率
      String(totalUnits), String(hokenDemand), String(userBurden), "", "", "" // 33..38 (36..38: 空)
      // 39..56 公費の欄（18項目空。42..44, 48..50, 54..56 も空）
    ];
    while (r01_fields.length < 56) {
      r01_fields.push("");
    }

    // 明細情報レコード 7171 02（各行18項目。候補は出さない）
    const r02_list = [];
    calc.items.forEach(it => {
      if (it.candidate) return; // 候補は出さない
      const r02_fields = [
        "7171", "02", ymRaw, settings.office_no, insurerNo8, insNo10,
        "32", String(it.code), String(it.unit_price), String(it.count),
        "", "", "", // 11..13
        String(it.subtotal), // 14
        "", "", "", // 15..17
        "" // 18 摘要
      ];
      r02_list.push(r02_fields);
    });

    // 集計情報レコード 7171 10（38項目。サービス種類32準拠）
    // 8..13（実日数・計画単位数・限度額管理対象・対象外・短期入所日数）はすべて何も入れない（カンマのみ）
    // 14 保険 単位数合計, 15 単位数単価, 16 保険 請求額, 17 利用者負担額
    const r10_fields = [
      "7171", "10", ymRaw, settings.office_no, insurerNo8, insNo10,
      "32", "",
      "", "",
      "", "", "",
      String(totalUnits), String(unitPriceInt), String(hokenDemand), String(userBurden)
      // 18..38 （21項目空）
    ];
    while (r10_fields.length < 38) {
      r10_fields.push("");
    }

    residentBlocks.push({
      resident: r,
      r01: r01_fields,
      r02_list: r02_list,
      r10: r10_fields
    });
  }

  // 請求書レコード 7111（18項目）
  // 1「7111」 2 サービス提供年月 3 事業所番号 4「1」 5「0」 6「01」
  // 7 件数（人数） 8 単位数合計 9 費用合計（100％金額） 10 保険請求額 11 公費請求額「0」 12 利用者負担
  // 13〜18 特定入所者等はすべて「0」
  const r7111_fields = [
    "7111", ymRaw, settings.office_no, "1", "0", "01",
    String(eligibleItems.length), String(grandTotalUnits), String(grandCost100), String(grandHokenDemand), "0", String(grandUserBurden),
    "0", "0", "0", "0", "0", "0"
  ];

  // データレコード総数 = 請求書1件 + 各利用者の (01: 1件 + 02: N件 + 10: 1件)
  let dataRecordCount = 1; // 7111
  residentBlocks.forEach(b => {
    dataRecordCount += 1; // 01
    dataRecordCount += b.r02_list.length; // 02
    dataRecordCount += 1; // 10
  });

  // 1行目 コントロールレコード
  recordNumber = 1;
  const controlLine = `1,1,0,${dataRecordCount},711,0,0,${settings.office_no},0,${settings.media_code},${nextYmRaw},1`;
  lines.push(controlLine);
  previewRows.push({
    lineNo: 1,
    type: "コントロールレコード",
    content: controlLine
  });

  // 2行目 請求書レコード 7111
  recordNumber++;
  const line7111 = `2,${recordNumber},` + r7111_fields.join(",");
  lines.push(line7111);
  previewRows.push({
    lineNo: recordNumber,
    type: "請求書レコード (7111)",
    content: line7111
  });

  // 明細書レコード
  for (const block of residentBlocks) {
    // 01 基本情報
    recordNumber++;
    const line01 = `2,${recordNumber},` + block.r01.join(",");
    lines.push(line01);
    previewRows.push({
      lineNo: recordNumber,
      type: `明細書 基本 (7171-01: ${escapeHtml(block.resident.name)})`,
      content: line01
    });

    // 02 明細情報
    for (const r02 of block.r02_list) {
      recordNumber++;
      const line02 = `2,${recordNumber},` + r02.join(",");
      lines.push(line02);
      previewRows.push({
        lineNo: recordNumber,
        type: `明細書 明細 (7171-02: コード ${escapeHtml(r02[7])})`,
        content: line02
      });
    }

    // 10 集計情報
    recordNumber++;
    const line10 = `2,${recordNumber},` + block.r10.join(",");
    lines.push(line10);
    previewRows.push({
      lineNo: recordNumber,
      type: `明細書 集計 (7171-10: ${escapeHtml(block.resident.name)})`,
      content: line10
    });
  }

  // エンドレコード
  recordNumber++;
  const endLine = `3,${recordNumber}`;
  lines.push(endLine);
  previewRows.push({
    lineNo: recordNumber,
    type: "エンドレコード",
    content: endLine
  });

  const fullCsvText = lines.join("\r\n") + "\r\n"; // [Claude修正] 改行の文字が生のまま入って、ファイル全体が読み込めなくなっていた

  // 全角文字チェック（半角英数字・カンマ・CRLF以外が含まれていないか機械的検証）
  const nonAsciiMatch = fullCsvText.match(/[^\x20-\x7E\r\n,]/); // [Claude修正] 同上
  if (nonAsciiMatch) {
    alert(`ファイル内に半角英数字・記号以外の文字が含まれています: ${nonAsciiMatch[0]}`);
    return;
  }

  // ファイル名: 英字1文字＋年月6桁 (例: K202610.CSV) -> ベース7文字で8文字以内準拠
  const fileName = `K${ymRaw}.CSV`;

  gKasanGeneratedCsvText = fullCsvText;
  gKasanGeneratedCsvFileName = fileName;

  // 操作ログの記録
  const opLogDetail = `${ym} 請求CSV作成（${eligibleItems.length}名分、ファイル名: ${fileName}、レコード数: ${recordNumber}）`;
  if (!Array.isArray(db.data.settings_logs)) db.data.settings_logs = [];
  db.data.settings_logs.push({
    id: Date.now(),
    at: toLocalDateTimeStr(new Date()),
    by: cpLoginStaffName(),
    kind: "国保連請求ファイル",
    action: "作成",
    detail: opLogDetail
  });
  db.save();

  // プレビュー表示
  const previewSec = document.getElementById("kasanCsvPreviewSection");
  const fnDisp = document.getElementById("kasanCsvFileNameDisp");
  const tbody = document.getElementById("kasanCsvPreviewTableBody");
  const dlBtn = document.getElementById("kasanCsvDownloadBtn");
  const statusEl = document.getElementById("kasanCsvActionStatus");

  if (fnDisp) fnDisp.textContent = `ファイル名: ${fileName} (全${lines.length}行)`;
  if (tbody) {
    tbody.innerHTML = previewRows.map(pr => `
      <tr>
        <td style="text-align:right; font-family:monospace; color:var(--ink-2); white-space:nowrap;">${pr.lineNo}</td>
        <td style="font-weight:bold; white-space:nowrap; font-size:13px; color:var(--pine-dark);">${pr.type}</td>
        <td style="font-family:monospace; font-size:13px; word-break:break-all;">${escapeHtml(pr.content)}</td>
      </tr>
    `).join("");
  }
  if (previewSec) previewSec.style.display = "block";
  if (dlBtn) dlBtn.style.display = "inline-block";
  if (statusEl) {
    statusEl.innerHTML = `<span style="color:var(--pine); font-weight:bold;">CSVファイルを正常に作成しました（${eligibleItems.length}名分）。下のボタンから端末へ保存できます。</span>`;
  }
}

// 作成されたCSVファイルのダウンロード
function downloadGeneratedKasanCsv() {
  if (!gKasanGeneratedCsvText || !gKasanGeneratedCsvFileName) {
    alert("作成されたCSVファイルがありません。先に「CSVファイルを作成する」を実行してください。");
    return;
  }

  try {
    const blob = new Blob([gKasanGeneratedCsvText], { type: "text/csv;charset=shift_jis;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = gKasanGeneratedCsvFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    const statusEl = document.getElementById("kasanCsvActionStatus");
    if (statusEl) {
      statusEl.innerHTML = `<span style="color:var(--pine); font-weight:bold;">${escapeHtml(gKasanGeneratedCsvFileName)} を端末に保存しました。</span>`;
    }
  } catch (e) {
    alert("ファイルの保存中にエラーが発生しました: " + (e.message || e));
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
window.openKasanCsvModal = openKasanCsvModal;
window.closeKasanCsvModal = closeKasanCsvModal;
window.generateKasanCsvFile = generateKasanCsvFile;
window.downloadGeneratedKasanCsv = downloadGeneratedKasanCsv;
window.cpValidateResidentForKasanCsv = cpValidateResidentForKasanCsv;
window.CP_KASAN_SHOGU_DEFS = CP_KASAN_SHOGU_DEFS;
window.CP_KASAN_REDUCED_BASIC_CODES = CP_KASAN_REDUCED_BASIC_CODES;
window.cpComputeShoguUnits = cpComputeShoguUnits;
window.cpGetPrevYm = cpGetPrevYm;
window.cpGetNextYm = cpGetNextYm;
window.cpAddMonths = cpAddMonths;
window.cpDetectNightShortageCandidate = cpDetectNightShortageCandidate;
window.cpCalcMonthlyAvgResidents = cpCalcMonthlyAvgResidents;
window.cpGetActiveReductions = cpGetActiveReductions;
// =====================================================================
// 減算管理モーダル群（夜勤不足確定・定員超過確定・人員基準欠如管理）
// =====================================================================

// ---------------------------------------------------------------------
// 1. 夜勤職員配置加算・減算の確定モーダル
// ---------------------------------------------------------------------
function openKasanNightConfirmModal(optYm) {
  if (typeof isCurrentStaffAdminOrClerk === "function" && !isCurrentStaffAdminOrClerk()) {
    alert("管理者または事務のみ操作可能です。");
    return;
  }
  const modal = document.getElementById("kasanNightConfirmModal");
  if (!modal) return;
  const ym = optYm || document.getElementById("kasanYearMonth")?.value || toLocalDateStr(new Date()).slice(0, 7);
  const ymInput = document.getElementById("kasanNightTargetYm");
  if (ymInput) ymInput.value = ym;
  renderKasanNightConfirmView(ym);
  modal.style.display = "flex";
}

function closeKasanNightConfirmModal() {
  const m = document.getElementById("kasanNightConfirmModal");
  if (m) m.style.display = "none";
}

function onKasanNightTargetYmChange(ym) {
  renderKasanNightConfirmView(ym);
}

function renderKasanNightConfirmView(ym) {
  const detContainer = document.getElementById("kasanNightDetectionArea");
  if (!detContainer) return;
  if (!ym) {
    detContainer.innerHTML = '<p style="color:var(--ink-3); font-size:13px;">年月を選択してください。</p>';
    return;
  }
  const cand = cpDetectNightShortageCandidate(ym);
  const settings = cpGetKasanSettings();
  const existing = (settings.night_shortage && settings.night_shortage[ym]) || null;

  let candBadge = "";
  if (cand.isCandidate) {
    candBadge = `<div style="background:var(--alert-tint); color:var(--alert); border:1px solid var(--alert); padding:8px 12px; border-radius:4px; font-weight:bold; margin-bottom:10px; font-size:13px;">
      [警告] 減算候補：夜勤人員の不足（2日連続不足または月4日以上不足）に該当しています。事務による確定が必要です。
    </div>`;
  } else if (cand.count > 0) {
    candBadge = `<div style="background:var(--caution-tint); color:var(--caution); border:1px solid var(--line); padding:8px 12px; border-radius:4px; margin-bottom:10px; font-size:13px;">
      ※ 夜勤不足日が ${cand.count} 日ありますが、2日連続または月4日以上の条件には達していません。
    </div>`;
  } else {
    candBadge = `<div style="background:var(--pine-tint-2); color:var(--pine-dark); border:1px solid var(--line-2); padding:8px 12px; border-radius:4px; margin-bottom:10px; font-size:13px;">
      基準達成：当月に夜勤人員の不足日はありません（全日ユニットごとに1名以上配置済）。
    </div>`;
  }

  let shortageTableHtml = "";
  if (cand.shortageDays.length > 0) {
    shortageTableHtml = `
      <div style="margin:8px 0; overflow-x:auto;">
        <table class="data-table" style="width:100%; font-size:13px;">
          <thead>
            <tr style="background:var(--ground);">
              <th style="width:110px;">日付</th>
              <th style="width:80px; text-align:center;">夜勤人数</th>
              <th style="width:160px;">配置職員</th>
              <th>不足しているユニット</th>
            </tr>
          </thead>
          <tbody>
            ${cand.shortageDays.map(sd => `
              <tr>
                <td style="font-weight:bold;">${escapeHtml(sd.date)}</td>
                <td style="text-align:center; color:${sd.count < cand.standard ? 'var(--alert)' : 'var(--ink)'}; font-weight:bold;">${sd.count} 名</td>
                <td>${escapeHtml((sd.staffNames || []).join('、') || '（なし）')}</td>
                <td style="color:var(--alert); font-weight:bold;">${escapeHtml((sd.lackingUnits || []).join('、'))}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } else {
    shortageTableHtml = `<p style="font-size:13px; color:var(--ink-2); margin:4px 0;">不足日：なし</p>`;
  }

  let unenteredHtml = "";
  if (cand.unenteredDays && cand.unenteredDays.length > 0) {
    unenteredHtml = `
      <div style="background:var(--ground); border:1px solid var(--line); padding:8px 12px; border-radius:4px; font-size:13px; color:var(--ink-2); margin-top:8px;">
        <strong style="color:var(--caution);">勤務表の未入力日（${cand.unenteredDays.length}日）:</strong>
        <div style="margin-top:2px; font-size:13px; color:var(--ink-2);">${escapeHtml(cand.unenteredDays.join(', '))}</div>
        <div style="font-size:13px; color:var(--ink-3); margin-top:2px;">※勤務表がまだ入っていない日は不足とは数えません。</div>
      </div>
    `;
  }

  detContainer.innerHTML = `
    <div style="margin-bottom:12px;">
      <div style="font-size:13px; color:var(--ink-2); margin-bottom:6px;">
        配置基準: <strong>ユニットごとに1人以上（事業所定数: 最低 ${cand.standard} 名/日）</strong>
      </div>
      ${candBadge}
      <div style="font-weight:bold; font-size:13px; color:var(--pine-dark); margin-top:8px;">勤務表から検出された夜勤不足日（計 ${cand.count} 日）:</div>
      ${shortageTableHtml}
      ${unenteredHtml}
    </div>
  `;

  // フォーム値の設定
  // [Claude修正] まだ確定していない月は、判定を選んでいない状態から始める（勤務表から出した結果を自動で選ばない）
  const radioMet = document.getElementById("kasanNightStatusMet");
  const radioNotMet = document.getElementById("kasanNightStatusNotMet");
  if (radioMet) radioMet.checked = !!(existing && existing.confirmed && existing.condition_met);
  if (radioNotMet) radioNotMet.checked = !!(existing && existing.confirmed && !existing.condition_met);

  const reasonInput = document.getElementById("kasanNightReason");
  if (reasonInput) {
    // [Claude修正] 理由は自動で入れない（確定済みならその理由を出す）
    const defReason = (existing && existing.condition_reason) ? existing.condition_reason : "";
    reasonInput.value = defReason;
  }

  const notesInput = document.getElementById("kasanNightNotes");
  if (notesInput) notesInput.value = (existing && existing.notes) || "";

  // 変更理由欄と状態表示
  const editArea = document.getElementById("kasanNightEditReasonArea");
  const editInput = document.getElementById("kasanNightEditReason");
  const statusDisp = document.getElementById("kasanNightCurrentStatusDisp");
  if (editInput) editInput.value = "";
  if (existing && existing.confirmed) {
    if (statusDisp) {
      statusDisp.innerHTML = `
        <div style="background:var(--pine-tint); border:1px solid var(--pine); border-radius:4px; padding:6px 10px; margin-bottom:8px; font-size:13px;">
          <strong>確定済み</strong>: ${existing.condition_met ? '<span style="color:var(--alert); font-weight:bold;">夜勤不足に該当（翌月減算）</span>' : '<span style="color:var(--pine-dark); font-weight:bold;">基準適合（減算なし）</span>'}
          （確定日時: ${escapeHtml(existing.confirmed_at || '-')} / 確定者: ${escapeHtml(existing.confirmed_by || '-')})
        </div>
      `;
    }
    if (editArea) editArea.style.display = "block";
  } else {
    if (statusDisp) {
      statusDisp.innerHTML = `
        <div style="background:var(--caution-tint); border:1px solid var(--line); border-radius:4px; padding:6px 10px; margin-bottom:8px; font-size:13px; color:var(--caution);">
          <strong>未確定</strong>: 事務による確定を行ってください。
        </div>
      `;
    }
    if (editArea) editArea.style.display = "none";
  }

  // 履歴表示
  const histArea = document.getElementById("kasanNightHistoryArea");
  if (histArea) {
    if (existing && Array.isArray(existing.edit_history) && existing.edit_history.length > 0) {
      histArea.innerHTML = `
        <div style="margin-top:12px; border-top:1px solid var(--line-2); padding-top:8px;">
          <div style="font-weight:bold; font-size:13px; color:var(--ink-2); margin-bottom:4px;">変更履歴（過去の確定内容）:</div>
          <table class="data-table" style="width:100%; font-size:13px;">
            <thead>
              <tr style="background:var(--ground);">
                <th style="width:130px;">変更日時</th>
                <th style="width:100px;">変更者</th>
                <th style="width:120px;">変更前判定</th>
                <th>変更理由</th>
              </tr>
            </thead>
            <tbody>
              ${existing.edit_history.map(h => `
                <tr>
                  <td>${escapeHtml(h.edited_at || h.changed_at || '')}</td>
                  <td>${escapeHtml(h.edited_by || h.changed_by || '')}</td>
                  <td>${h.prev_condition_met ? '<span style="color:var(--alert);">減算該当</span>' : '基準適合'}</td>
                  <td>${escapeHtml(h.reason || '')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } else {
      histArea.innerHTML = "";
    }
  }
}

function submitKasanNightConfirm() {
  if (typeof isCurrentStaffAdminOrClerk === "function" && !isCurrentStaffAdminOrClerk()) {
    alert("管理者または事務のみ操作可能です。");
    return;
  }
  const ymInput = document.getElementById("kasanNightTargetYm");
  const ym = ymInput?.value;
  if (!ym) {
    alert("対象年月を選択してください。");
    return;
  }
  const radioMet = document.getElementById("kasanNightStatusMet");
  const radioNotMet = document.getElementById("kasanNightStatusNotMet");
  if (!(radioMet && radioMet.checked) && !(radioNotMet && radioNotMet.checked)) {
    alert("確定する判定（基準適合／夜勤不足に該当）を選んでください。");
    return;
  }
  const conditionMet = !!(radioMet && radioMet.checked);
  const reason = (document.getElementById("kasanNightReason")?.value || "").trim();
  const notes = (document.getElementById("kasanNightNotes")?.value || "").trim();

  if (conditionMet && !reason) {
    alert("夜勤不足に該当とする場合は、該当理由を入力してください。");
    return;
  }

  if (!db.data.kasan_settings) db.data.kasan_settings = {};
  if (!db.data.kasan_settings.night_shortage) db.data.kasan_settings.night_shortage = {};

  const existing = db.data.kasan_settings.night_shortage[ym] || null;
  const history = (existing && Array.isArray(existing.edit_history)) ? existing.edit_history.slice() : [];

  if (existing && existing.confirmed) {
    const editReason = (document.getElementById("kasanNightEditReason")?.value || "").trim();
    if (!editReason) {
      alert("確定済みの内容を変更する場合は、変更理由の入力が必須です。");
      return;
    }
    history.push({
      edited_at: toLocalDateTimeStr(new Date()),
      edited_by: (typeof cpLoginStaffName === "function" ? cpLoginStaffName() : "担当職員"),
      reason: editReason,
      prev_condition_met: existing.condition_met,
      prev_reason: existing.condition_reason || "",
      prev_notes: existing.notes || ""
    });
  }

  db.data.kasan_settings.night_shortage[ym] = {
    year_month: ym,
    confirmed: true,
    condition_met: conditionMet,
    condition_reason: conditionMet ? reason : "",
    notes: notes,
    confirmed_at: toLocalDateTimeStr(new Date()),
    confirmed_by: (typeof cpLoginStaffName === "function" ? cpLoginStaffName() : "担当職員"),
    edit_history: history
  };

  db.save();
  alert(`${ym} の夜勤人員状況を確定しました（${conditionMet ? '翌月減算該当' : '基準適合'}）。`);
  closeKasanNightConfirmModal();
  if (typeof renderOfficeKasanTab === "function") renderOfficeKasanTab();
}

// ---------------------------------------------------------------------
// 2. 定員超過の確定モーダル
// ---------------------------------------------------------------------
function openKasanCapacityConfirmModal(optYm) {
  if (typeof isCurrentStaffAdminOrClerk === "function" && !isCurrentStaffAdminOrClerk()) {
    alert("管理者または事務のみ操作可能です。");
    return;
  }
  const modal = document.getElementById("kasanCapacityConfirmModal");
  if (!modal) return;
  const ym = optYm || document.getElementById("kasanYearMonth")?.value || toLocalDateStr(new Date()).slice(0, 7);
  const ymInput = document.getElementById("kasanCapacityTargetYm");
  if (ymInput) ymInput.value = ym;
  renderKasanCapacityConfirmView(ym);
  modal.style.display = "flex";
}

function closeKasanCapacityConfirmModal() {
  const m = document.getElementById("kasanCapacityConfirmModal");
  if (m) m.style.display = "none";
}

function onKasanCapacityTargetYmChange(ym) {
  renderKasanCapacityConfirmView(ym);
}

function onKasanCapacityGraceChange() {
  const isG = document.getElementById("kasanCapacityDisasterGrace")?.checked;
  const b = document.getElementById("kasanCapacityGraceReasonBox");
  if (b) b.style.display = isG ? "block" : "none";
}

function renderKasanCapacityConfirmView(ym) {
  const calcContainer = document.getElementById("kasanCapacityCalcArea");
  if (!calcContainer) return;
  if (!ym) {
    calcContainer.innerHTML = '<p style="color:var(--ink-3); font-size:13px;">年月を選択してください。</p>';
    return;
  }
  const mCalc = cpCalcMonthlyAvgResidents(ym);
  const settings = cpGetKasanSettings();
  const capacity = (settings.capacity && parseInt(settings.capacity, 10) > 0) ? parseInt(settings.capacity, 10) : 0;
  const existing = (settings.capacity_excess && settings.capacity_excess[ym]) || null;
  const isExcessCalc = (capacity > 0 && mCalc.avg > capacity);

  let statusBadge = "";
  if (capacity <= 0) {
    statusBadge = `<div style="background:var(--caution-tint); color:var(--caution); padding:8px 12px; border-radius:4px; font-weight:bold; margin-bottom:10px; font-size:13px;">
      ※ 事業所定員が未設定です。事業所の加算・減算設定で定員を登録してください。
    </div>`;
  } else if (isExcessCalc) {
    statusBadge = `<div style="background:var(--alert-tint); color:var(--alert); border:1px solid var(--alert); padding:8px 12px; border-radius:4px; font-weight:bold; margin-bottom:10px; font-size:13px;">
      [警告] 定員超過：当月の月平均入居者数（${mCalc.avg}名）が定員（${capacity}名）を超えています。翌月（災害等の猶予時は翌々月）から解消月まで減算対象となります。
    </div>`;
  } else {
    statusBadge = `<div style="background:var(--pine-tint-2); color:var(--pine-dark); border:1px solid var(--line-2); padding:8px 12px; border-radius:4px; margin-bottom:10px; font-size:13px;">
      定員内：当月の月平均入居者数（${mCalc.avg}名）は定員（${capacity}名）以内です。
    </div>`;
  }

  calcContainer.innerHTML = `
    <div style="margin-bottom:12px;">
      ${statusBadge}
      <div style="background:var(--ground); border:1px solid var(--line); border-radius:4px; padding:10px 14px; font-size:13px; line-height:1.7;">
        <div>・当月延べ入居日数: <strong>${mCalc.totalPersonDays}</strong> 日人（日ごとの在所者数合計）</div>
        <div>・当月の日数: <strong>${mCalc.daysInMonth}</strong> 日</div>
        <div>・月平均入居者数: 延べ ${mCalc.totalPersonDays} ÷ ${mCalc.daysInMonth}日 ＝ ${(mCalc.totalPersonDays / mCalc.daysInMonth).toFixed(2)} → <strong>切り上げ: ${mCalc.avg} 名</strong></div>
        <div>・事業所定員: <strong>${capacity > 0 ? capacity + ' 名' : '未設定'}</strong></div>
      </div>
    </div>
  `;

  // フォーム値の設定
  // [Claude修正] まだ確定していない月は、判定を選んでいない状態から始める（計算の結果を自動で選ばない）
  const radioExcess = document.getElementById("kasanCapacityStatusExcess");
  const radioNormal = document.getElementById("kasanCapacityStatusNormal");
  if (radioExcess) radioExcess.checked = !!(existing && existing.confirmed && existing.is_excess !== false);
  if (radioNormal) radioNormal.checked = !!(existing && existing.confirmed && existing.is_excess === false);

  const graceCb = document.getElementById("kasanCapacityDisasterGrace");
  const graceReasonBox = document.getElementById("kasanCapacityGraceReasonBox");
  const graceReasonInput = document.getElementById("kasanCapacityGraceReason");
  if (graceCb) {
    graceCb.checked = !!(existing && existing.is_disaster_grace);
    if (graceReasonBox) graceReasonBox.style.display = graceCb.checked ? "block" : "none";
  }
  if (graceReasonInput) graceReasonInput.value = (existing && existing.disaster_reason) || "";

  const resolvedInput = document.getElementById("kasanCapacityResolvedYm");
  if (resolvedInput) resolvedInput.value = (existing && existing.resolved_ym) || "";

  const notesInput = document.getElementById("kasanCapacityNotes");
  if (notesInput) notesInput.value = (existing && existing.notes) || "";

  // 変更理由欄と状態表示
  const editArea = document.getElementById("kasanCapacityEditReasonArea");
  const editInput = document.getElementById("kasanCapacityEditReason");
  const statusDisp = document.getElementById("kasanCapacityCurrentStatusDisp");
  if (editInput) editInput.value = "";
  if (existing && existing.confirmed) {
    if (statusDisp) {
      statusDisp.innerHTML = `
        <div style="background:var(--pine-tint); border:1px solid var(--pine); border-radius:4px; padding:6px 10px; margin-bottom:8px; font-size:13px;">
          <strong>確定済み</strong>: ${existing.is_excess ? '<span style="color:var(--alert); font-weight:bold;">定員超過に該当</span>' : '<span style="color:var(--pine-dark); font-weight:bold;">定員内（減算なし）</span>'}
          （確定日時: ${escapeHtml(existing.confirmed_at || '-')} / 確定者: ${escapeHtml(existing.confirmed_by || '-')})
          ${existing.resolved_ym ? ` / 解消月: ${escapeHtml(existing.resolved_ym)}` : (existing.is_excess ? ' / 解消月: 継続中' : '')}
        </div>
      `;
    }
    if (editArea) editArea.style.display = "block";
  } else {
    if (statusDisp) {
      statusDisp.innerHTML = `
        <div style="background:var(--caution-tint); border:1px solid var(--line); border-radius:4px; padding:6px 10px; margin-bottom:8px; font-size:13px; color:var(--caution);">
          <strong>未確定</strong>: 事務による確定を行ってください。
        </div>
      `;
    }
    if (editArea) editArea.style.display = "none";
  }

  // 履歴表示
  const histArea = document.getElementById("kasanCapacityHistoryArea");
  if (histArea) {
    if (existing && Array.isArray(existing.edit_history) && existing.edit_history.length > 0) {
      histArea.innerHTML = `
        <div style="margin-top:12px; border-top:1px solid var(--line-2); padding-top:8px;">
          <div style="font-weight:bold; font-size:13px; color:var(--ink-2); margin-bottom:4px;">変更履歴（過去の確定内容）:</div>
          <table class="data-table" style="width:100%; font-size:13px;">
            <thead>
              <tr style="background:var(--ground);">
                <th style="width:130px;">変更日時</th>
                <th style="width:100px;">変更者</th>
                <th style="width:120px;">変更前判定</th>
                <th>変更理由</th>
              </tr>
            </thead>
            <tbody>
              ${existing.edit_history.map(h => `
                <tr>
                  <td>${escapeHtml(h.edited_at || h.changed_at || '')}</td>
                  <td>${escapeHtml(h.edited_by || h.changed_by || '')}</td>
                  <td>${h.prev_is_excess ? '<span style="color:var(--alert);">定員超過</span>' : '定員内'}</td>
                  <td>${escapeHtml(h.reason || '')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } else {
      histArea.innerHTML = "";
    }
  }
}

function submitKasanCapacityConfirm() {
  if (typeof isCurrentStaffAdminOrClerk === "function" && !isCurrentStaffAdminOrClerk()) {
    alert("管理者または事務のみ操作可能です。");
    return;
  }
  const ymInput = document.getElementById("kasanCapacityTargetYm");
  const ym = ymInput?.value;
  if (!ym) {
    alert("対象年月を選択してください。");
    return;
  }
  const radioExcess = document.getElementById("kasanCapacityStatusExcess");
  const radioNormal = document.getElementById("kasanCapacityStatusNormal");
  if (!(radioExcess && radioExcess.checked) && !(radioNormal && radioNormal.checked)) {
    alert("確定する判定（定員内／定員超過に該当）を選んでください。");
    return;
  }
  const isExcess = !!(radioExcess && radioExcess.checked);
  const isGrace = !!document.getElementById("kasanCapacityDisasterGrace")?.checked;
  const graceReason = (document.getElementById("kasanCapacityGraceReason")?.value || "").trim();
  const resolvedYm = (document.getElementById("kasanCapacityResolvedYm")?.value || "").trim();
  const notes = (document.getElementById("kasanCapacityNotes")?.value || "").trim();

  if (isGrace && !graceReason) {
    alert("災害等の猶予を適用する場合は、事由・理由を入力してください。");
    return;
  }
  if (resolvedYm && resolvedYm < ym) {
    alert("解消した年月は対象年月以降を指定してください。");
    return;
  }

  const mCalc = cpCalcMonthlyAvgResidents(ym);
  const settings = cpGetKasanSettings();
  const capacity = (settings.capacity && parseInt(settings.capacity, 10) > 0) ? parseInt(settings.capacity, 10) : 0;
  if (!capacity) {
    alert("利用定員が登録されていません。「事業所の加算・減算設定」で利用定員を登録してから確定してください。");
    return;
  }

  if (!db.data.kasan_settings) db.data.kasan_settings = {};
  if (!db.data.kasan_settings.capacity_excess) db.data.kasan_settings.capacity_excess = {};

  const existing = db.data.kasan_settings.capacity_excess[ym] || null;
  const history = (existing && Array.isArray(existing.edit_history)) ? existing.edit_history.slice() : [];

  if (existing && existing.confirmed) {
    const editReason = (document.getElementById("kasanCapacityEditReason")?.value || "").trim();
    if (!editReason) {
      alert("確定済みの内容を変更する場合は、変更理由の入力が必須です。");
      return;
    }
    history.push({
      edited_at: toLocalDateTimeStr(new Date()),
      edited_by: (typeof cpLoginStaffName === "function" ? cpLoginStaffName() : "担当職員"),
      reason: editReason,
      prev_is_excess: existing.is_excess,
      prev_resolved_ym: existing.resolved_ym || "",
      prev_notes: existing.notes || ""
    });
  }

  db.data.kasan_settings.capacity_excess[ym] = {
    year_month: ym,
    confirmed: true,
    avg_residents: mCalc.avg,
    total_person_days: mCalc.totalPersonDays,
    days_in_month: mCalc.daysInMonth,
    capacity: capacity,
    is_excess: isExcess,
    is_disaster_grace: isGrace,
    disaster_reason: isGrace ? graceReason : "",
    resolved_ym: resolvedYm,
    notes: notes,
    confirmed_at: toLocalDateTimeStr(new Date()),
    confirmed_by: (typeof cpLoginStaffName === "function" ? cpLoginStaffName() : "担当職員"),
    edit_history: history
  };

  db.save();
  alert(`${ym} の定員超過状況を確定しました（${isExcess ? '定員超過該当' : '定員内'}）。`);
  closeKasanCapacityConfirmModal();
  if (typeof renderOfficeKasanTab === "function") renderOfficeKasanTab();
}

// ---------------------------------------------------------------------
// 3. 人員基準欠如の登録・解消管理モーダル
// ---------------------------------------------------------------------
function openKasanStaffShortageModal() {
  if (typeof isCurrentStaffAdminOrClerk === "function" && !isCurrentStaffAdminOrClerk()) {
    alert("管理者または事務のみ操作可能です。");
    return;
  }
  const modal = document.getElementById("kasanStaffShortageModal");
  if (!modal) return;
  renderKasanStaffShortageList();
  // リセット
  const typeEl = document.getElementById("kasanStaffShortageType");
  if (typeEl) typeEl.value = "";
  const sYmEl = document.getElementById("kasanStaffShortageStartYm");
  if (sYmEl) sYmEl.value = ""; // [Claude修正] 始まった月は自動で入れない
  const rYmEl = document.getElementById("kasanStaffShortageResolvedYm");
  if (rYmEl) rYmEl.value = "";
  const rReasonEl = document.getElementById("kasanStaffShortageReason");
  if (rReasonEl) rReasonEl.value = "";
  const waiverCb = document.getElementById("kasanStaffShortageIsWaiver");
  if (waiverCb) waiverCb.checked = false;
  const wReasonEl = document.getElementById("kasanStaffShortageWaiverReason");
  if (wReasonEl) wReasonEl.value = "";
  ["kasanStaffShortageWaiverReportedOn", "kasanStaffShortageWaiverUntilYm"].forEach(fid => { const e = document.getElementById(fid); if (e) e.value = ""; });
  const wMonthEndCb = document.getElementById("kasanStaffShortageWaiverMonthEnd");
  if (wMonthEndCb) wMonthEndCb.checked = false;
  onKasanStaffShortageTypeChange();
  onKasanStaffShortageWaiverChange();
  cancelResolveStaffShortage();
  modal.style.display = "flex";
}

function closeKasanStaffShortageModal() {
  const m = document.getElementById("kasanStaffShortageModal");
  if (m) m.style.display = "none";
}

function onKasanStaffShortageTypeChange() {
  const t = document.getElementById("kasanStaffShortageType")?.value;
  const b = document.getElementById("kasanStaffShortageMonthEndBox");
  if (b) b.style.display = (t === "care_under_10") ? "block" : "none";
}

function onKasanStaffShortageWaiverChange() {
  const isW = document.getElementById("kasanStaffShortageIsWaiver")?.checked;
  const b = document.getElementById("kasanStaffShortageWaiverReasonBox");
  if (b) b.style.display = isW ? "block" : "none";
}

function renderKasanStaffShortageList() {
  const container = document.getElementById("kasanStaffShortageListArea");
  if (!container) return;
  const settings = cpGetKasanSettings();
  const list = Array.isArray(settings.staff_shortage) ? settings.staff_shortage : [];

  if (list.length === 0) {
    container.innerHTML = '<p style="font-size:13px; color:var(--ink-3); margin:4px 0 10px;">現在、登録された人員基準欠如の記録はありません。</p>';
    return;
  }

  container.innerHTML = `
    <div style="overflow-x:auto; margin-bottom:14px; max-height:240px; border:1px solid var(--line-2); border-radius:4px;">
      <table class="data-table" style="width:100%; font-size:13px; margin:0;">
        <thead>
          <tr style="background:var(--ground);">
            <th style="width:90px;">発生年月</th>
            <th style="width:170px;">欠如の種類</th>
            <th style="width:110px;">減算適用</th>
            <th>理由 / 特例</th>
            <th style="width:100px;">解消年月</th>
            <th style="width:130px; text-align:center;">操作</th>
          </tr>
        </thead>
        <tbody>
          ${list.map(item => {
            let startRedYm = cpStaffShortageReductionStartYm(item) + "〜";
            if (item.is_waiver) startRedYm += "（特例の猶予: " + (item.waiver_until_ym || "-") + "まで）";
            if (item.type === "care_under_10" && item.waiver_next_month_end) startRedYm = "翌月末解消除外";

            const resolvedText = item.resolved_ym ? escapeHtml(item.resolved_ym) : '<span style="color:var(--alert); font-weight:bold;">継続中</span>';
            const histCount = (Array.isArray(item.edit_history) && item.edit_history.length > 0) ? ` (履歴${item.edit_history.length}件)` : '';

            return `
              <tr>
                <td style="font-weight:bold;">${escapeHtml(item.start_ym)}</td>
                <td>${escapeHtml(cpGetStaffShortageTypeLabel(item.type))}</td>
                <td style="font-weight:bold; color:${startRedYm.includes('除外') ? 'var(--pine-dark)' : 'var(--alert)'};">${escapeHtml(startRedYm)}</td>
                <td>
                  <div>${escapeHtml(item.reason || '-')}</div>
                  ${item.is_waiver ? `<div style="color:var(--pine-dark); font-size:13px;">※特例の事情: ${escapeHtml(item.waiver_reason || '-')}（市町村へ報告: ${escapeHtml(item.waiver_reported_on || '-')}）</div>` : ''}
                  ${item.waiver_next_month_end ? `<div style="color:var(--pine-dark); font-size:13px;">※翌月末までに充足</div>` : ''}
                </td>
                <td>${resolvedText}${histCount}</td>
                <td style="text-align:center;">
                  ${item.voided ? `<div style="font-size:13px; color:var(--ink-3);">取消済み（${escapeHtml(item.void_reason || '-')}／${escapeHtml(item.voided_by || '-')} ${escapeHtml(item.voided_at || '')}）</div>` : `
                  <button type="button" class="btn btn-secondary" style="font-size:13px; padding:3px 8px;" onclick="openResolveStaffShortage('${escapeHtml(item.id)}')">解消月を追記/変更</button>
                  <button type="button" class="btn btn-secondary" style="font-size:13px; padding:3px 8px; margin-top:4px;" onclick="voidKasanStaffShortage('${escapeHtml(item.id)}')">取消</button>`}
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

let gResolvingStaffShortageId = null;

// [Claude修正] まちがえて登録した欠如の記録は、消さずに理由をつけて取り消す
function voidKasanStaffShortage(id) {
  if (typeof isCurrentStaffAdminOrClerk === "function" && !isCurrentStaffAdminOrClerk()) {
    alert("管理者または事務のみ操作可能です。");
    return;
  }
  const list = (db.data.kasan_settings && Array.isArray(db.data.kasan_settings.staff_shortage)) ? db.data.kasan_settings.staff_shortage : [];
  const target = list.find(x => x && x.id === id);
  if (!target || target.voided) return;
  const reason = (window.prompt("取り消す理由を入れてください（必須）", "") || "").trim();
  if (!reason) {
    alert("取り消す理由がないため、取り消していません。");
    return;
  }
  target.voided = true;
  target.void_reason = reason;
  target.voided_by = (typeof cpLoginStaffName === "function") ? cpLoginStaffName() : "";
  target.voided_at = toLocalDateTimeStr(new Date());
  if (!Array.isArray(target.edit_history)) target.edit_history = [];
  target.edit_history.push({ edited_at: target.voided_at, edited_by: target.voided_by, reason: "取消: " + reason });
  db.save();
  renderKasanStaffShortageList();
  if (typeof renderOfficeKasanTab === "function") renderOfficeKasanTab();
}

function openResolveStaffShortage(id) {
  gResolvingStaffShortageId = id;
  const settings = cpGetKasanSettings();
  const list = Array.isArray(settings.staff_shortage) ? settings.staff_shortage : [];
  const target = list.find(x => x && x.id === id);
  if (!target) return;

  const box = document.getElementById("kasanStaffShortageResolveBox");
  if (!box) return;
  box.style.display = "block";

  const infoEl = document.getElementById("kasanStaffShortageResolveTargetInfo");
  if (infoEl) {
    infoEl.innerHTML = `対象: <strong>${escapeHtml(target.start_ym)} 発生 ${escapeHtml(cpGetStaffShortageTypeLabel(target.type))}</strong>（現在の解消年月: ${target.resolved_ym ? escapeHtml(target.resolved_ym) : '継続中'}）`;
  }
  const ymInput = document.getElementById("kasanStaffShortageResolveYmInput");
  if (ymInput) ymInput.value = target.resolved_ym || "";
  const reasonInput = document.getElementById("kasanStaffShortageResolveReasonInput");
  if (reasonInput) reasonInput.value = "";
}

function cancelResolveStaffShortage() {
  gResolvingStaffShortageId = null;
  const box = document.getElementById("kasanStaffShortageResolveBox");
  if (box) box.style.display = "none";
}

function submitResolveStaffShortage() {
  if (typeof isCurrentStaffAdminOrClerk === "function" && !isCurrentStaffAdminOrClerk()) {
    alert("管理者または事務のみ操作可能です。");
    return;
  }
  if (!gResolvingStaffShortageId) return;
  const ymInput = document.getElementById("kasanStaffShortageResolveYmInput");
  const newResolvedYm = (ymInput?.value || "").trim();
  const reasonInput = document.getElementById("kasanStaffShortageResolveReasonInput");
  const reason = (reasonInput?.value || "").trim();

  if (!reason) {
    alert("解消月の登録または変更を行う場合は、理由の入力が必須です。");
    return;
  }

  if (!db.data.kasan_settings || !Array.isArray(db.data.kasan_settings.staff_shortage)) return;
  const target = db.data.kasan_settings.staff_shortage.find(x => x && x.id === gResolvingStaffShortageId);
  if (!target || target.voided) return;

  if (newResolvedYm && target.start_ym && newResolvedYm < target.start_ym) {
    alert("解消年月は発生年月以降を指定してください。");
    return;
  }

  if (!Array.isArray(target.edit_history)) target.edit_history = [];
  target.edit_history.push({
    edited_at: toLocalDateTimeStr(new Date()),
    edited_by: (typeof cpLoginStaffName === "function" ? cpLoginStaffName() : "担当職員"),
    reason: reason,
    prev_resolved_ym: target.resolved_ym || ""
  });

  target.resolved_ym = newResolvedYm;
  target.updated_at = toLocalDateTimeStr(new Date());
  target.updated_by = (typeof cpLoginStaffName === "function" ? cpLoginStaffName() : "担当職員");

  db.save();
  alert("人員基準欠如の解消年月を更新しました。");
  cancelResolveStaffShortage();
  renderKasanStaffShortageList();
  if (typeof renderOfficeKasanTab === "function") renderOfficeKasanTab();
}

function submitKasanStaffShortage() {
  if (typeof isCurrentStaffAdminOrClerk === "function" && !isCurrentStaffAdminOrClerk()) {
    alert("管理者または事務のみ操作可能です。");
    return;
  }
  const type = document.getElementById("kasanStaffShortageType")?.value;
  const sYm = document.getElementById("kasanStaffShortageStartYm")?.value;
  const rYm = document.getElementById("kasanStaffShortageResolvedYm")?.value;
  const reason = (document.getElementById("kasanStaffShortageReason")?.value || "").trim();
  const isW = document.getElementById("kasanStaffShortageIsWaiver")?.checked;
  const wReason = (document.getElementById("kasanStaffShortageWaiverReason")?.value || "").trim();
  const wMonthEnd = document.getElementById("kasanStaffShortageWaiverMonthEnd")?.checked;

  if (!type) { alert("欠如の種類を選択してください。"); return; }
  if (!sYm) { alert("始まった月を入力してください。"); return; }
  if (!reason) { alert("欠如の理由を入力してください。"); return; }
  if (sYm && rYm && sYm > rYm) { alert("始まった月と解消した月の順序が不正です。"); return; }
  // [Claude修正] 特例は「1割以内」と「計画作成担当者」だけ。年1回・市町村へ報告。猶予の終わりの月は市町村が認めた月
  const wReported = (document.getElementById("kasanStaffShortageWaiverReportedOn")?.value || "").trim();
  const wUntil = (document.getElementById("kasanStaffShortageWaiverUntilYm")?.value || "").trim();
  if (isW && type === "care_over_10") { alert("特例（減算の猶予）は、介護従業者が1割の範囲内で欠けたときと、計画作成担当者が欠けたときだけ使えます。"); return; }
  if (isW && !wReason) { alert("特例の事情を入力してください。"); return; }
  if (isW && !wReported) { alert("特例を使うときは、市町村へ報告した日を入れてください。"); return; }
  if (isW && wReported > toLocalDateStr(new Date())) { alert("市町村へ報告した日に先の日付は入れられません。"); return; }
  if (isW && !wUntil) { alert("特例を使うときは、市町村が認めた猶予の終わりの月を入れてください。"); return; }
  if (isW && wUntil < sYm) { alert("猶予の終わりの月は、始まった月より後にしてください。"); return; }
  if (isW) {
    const all = (db.data.kasan_settings && Array.isArray(db.data.kasan_settings.staff_shortage)) ? db.data.kasan_settings.staff_shortage : [];
    const y0 = cpAddMonths(sYm, 0);
    const recent = all.find(x => x && !x.voided && x.is_waiver && x.start_ym && x.start_ym > cpAddMonthsBack(y0, 12) && x.start_ym <= y0);
    if (recent) { alert(`特例は年1回までです（${recent.start_ym} に始まった欠如で使っています）。`); return; }
  }

  if (!db.data.kasan_settings) db.data.kasan_settings = {};
  if (!Array.isArray(db.data.kasan_settings.staff_shortage)) db.data.kasan_settings.staff_shortage = [];

  db.data.kasan_settings.staff_shortage.push({
    id: "ss_" + Date.now(),
    type: type,
    start_ym: sYm,
    resolved_ym: rYm || "",
    reason: reason,
    waiver_next_month_end: !!wMonthEnd,
    is_waiver: !!isW,
    waiver_reason: wReason,
    waiver_reported_on: isW ? wReported : "",
    waiver_until_ym: isW ? wUntil : "",
    created_at: toLocalDateTimeStr(new Date()),
    created_by: (typeof cpLoginStaffName === "function" ? cpLoginStaffName() : "担当職員"),
    edit_history: []
  });

  db.save();
  alert("人員基準欠如を登録しました。");
  renderKasanStaffShortageList();
  const typeEl = document.getElementById("kasanStaffShortageType");
  if (typeEl) typeEl.value = "";
  const reasonEl = document.getElementById("kasanStaffShortageReason");
  if (reasonEl) reasonEl.value = "";
  closeKasanStaffShortageModal();
  if (typeof renderOfficeKasanTab === "function") renderOfficeKasanTab();
}

window.openKasanNightConfirmModal = openKasanNightConfirmModal;
window.closeKasanNightConfirmModal = closeKasanNightConfirmModal;
window.onKasanNightTargetYmChange = onKasanNightTargetYmChange;
window.submitKasanNightConfirm = submitKasanNightConfirm;

window.openKasanCapacityConfirmModal = openKasanCapacityConfirmModal;
window.closeKasanCapacityConfirmModal = closeKasanCapacityConfirmModal;
window.onKasanCapacityTargetYmChange = onKasanCapacityTargetYmChange;
window.onKasanCapacityGraceChange = onKasanCapacityGraceChange;
window.submitKasanCapacityConfirm = submitKasanCapacityConfirm;

window.openKasanStaffShortageModal = openKasanStaffShortageModal;
window.closeKasanStaffShortageModal = closeKasanStaffShortageModal;
window.renderKasanStaffShortageList = renderKasanStaffShortageList;
window.openResolveStaffShortage = openResolveStaffShortage;
window.cancelResolveStaffShortage = cancelResolveStaffShortage;
window.submitResolveStaffShortage = submitResolveStaffShortage;
window.onKasanStaffShortageTypeChange = onKasanStaffShortageTypeChange;
window.onKasanStaffShortageWaiverChange = onKasanStaffShortageWaiverChange;
window.submitKasanStaffShortage = submitKasanStaffShortage;

window.cpKasanNormalizeTaiseiItems = cpKasanNormalizeTaiseiItems;
window.cpKasanHasMedicalCoop1 = cpKasanHasMedicalCoop1;
window.cpStaffShortageReductionStartYm = cpStaffShortageReductionStartYm;
window.voidKasanStaffShortage = voidKasanStaffShortage;
