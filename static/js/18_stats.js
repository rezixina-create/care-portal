// ======================================================================
// 18_stats.js: 稼働率・売上の集計（事務ポータル「集計」タブ）
// ======================================================================

// 選択中の年度
let gStatsSelectedYear = null;
let gStatsCachedResults = null;
let gStatsUncomputableMap = {};

// 1. 年度・日付の補助関数
function cpGetCurrentFiscalYear() {
  const today = toLocalDateStr(new Date());
  const y = parseInt(today.slice(0, 4), 10);
  const m = parseInt(today.slice(5, 7), 10);
  return m >= 4 ? y : y - 1;
}

function cpGetFiscalYearMonths(fiscalYear) {
  const y = parseInt(fiscalYear, 10);
  const months = [];
  for (let m = 4; m <= 12; m++) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
  }
  for (let m = 1; m <= 3; m++) {
    months.push(`${y + 1}-${String(m).padStart(2, "0")}`);
  }
  return months;
}

// 2. 年度の集計計算
function cpComputeYearStats(fiscalYear) {
  if (typeof isCurrentStaffAdminOrClerk === "function" && !isCurrentStaffAdminOrClerk()) {
    return null;
  }

  const fYear = parseInt(fiscalYear, 10) || cpGetCurrentFiscalYear();
  const months = cpGetFiscalYearMonths(fYear);
  const settings = (typeof cpGetKasanSettings === "function")
    ? cpGetKasanSettings()
    : ((db && db.data && db.data.kasan_settings) || {});
  const capacity = (settings.capacity && parseInt(settings.capacity, 10) > 0) ? parseInt(settings.capacity, 10) : null;

  // 地域区分の単価（整数計算用: 10.00 -> 1000, 10.90 -> 1090）
  const regionObj = (typeof CP_KASAN_REGION_RATES !== "undefined")
    ? CP_KASAN_REGION_RATES.find(r => r.key === settings.region_type)
    : null;
  const unitPriceInt = regionObj ? Math.round(regionObj.rate * 100) : null;

  const allResidents = (db && db.data && Array.isArray(db.data.residents)) ? db.data.residents : [];
  const todayStr = toLocalDateStr(new Date());
  const thisMonthStr = todayStr.slice(0, 7);

  const monthRows = [];
  const uncomputableMap = {};

  let sumStayDays = 0;
  let sumPresentDays = 0;
  let sumHospDays = 0;
  let sumShortStayDays = 0;
  let sumCapacityDays = 0;
  let sumNewAdmissions = 0;
  let sumDischarges = 0;
  let sumDischargeDeaths = 0;
  let sumTotalUnits = 0;
  let sumCost100 = 0;
  let sumHokenDemand = 0;
  let sumUserBurden = 0;
  let sumShoguUnits = 0;

  let elapsedMonthCount = 0;
  let sumEndOfMonthResidents = 0;

  months.forEach(ym => {
    const [yStr, mStr] = ym.split("-");
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10);
    const daysInMonth = new Date(y, m, 0).getDate();
    const isFuture = (ym > thisMonthStr);
    const monthLabel = (ym === thisMonthStr) ? `${m}月（見込み）` : `${m}月`; // [Claude修正] 今月は今日より後の日も今の状態が続くとして数えるので「見込み」

    if (isFuture) {
      monthRows.push({
        ym: ym,
        monthLabel: monthLabel,
        daysInMonth: daysInMonth,
        isFuture: true,
        shortStayDays: 0,
        capacity: capacity,
        unitPriceInt: unitPriceInt
      });
      return;
    }

    elapsedMonthCount++;

    // 入居数・在所数・入院数・短期利用数の日次集計
    let monthStayDays = 0;
    let monthPresentDays = 0;
    let monthHospDays = 0;
    let monthShortStayDays = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const dStr = `${ym}-${String(d).padStart(2, "0")}`;
      allResidents.forEach(r => {
        const isShort = (r.usage_type === "short");
        const st = (typeof cpStatusOn === "function") ? cpStatusOn(r, dStr) : (r.status || "");
        if (st !== "入居前" && st !== "退所") {
          // [Claude修正] 短期利用の人も定員の中で居室を使うので、延べ入居日数・稼働率に含め、「うち短期利用」を別に出す
          monthStayDays++;
          if (isShort) monthShortStayDays++;
          if (typeof cpResidentIsHere === "function" && cpResidentIsHere(r, dStr)) {
            monthPresentDays++;
          }
          if (st === "入院中") {
            monthHospDays++;
          }
        }
      });
    }
    sumShortStayDays += monthShortStayDays;

    // 月末入居者数
    const lastDayStr = `${ym}-${String(daysInMonth).padStart(2, "0")}`;
    let endOfMonthCount = 0;
    allResidents.forEach(r => {
      const st = (typeof cpStatusOn === "function") ? cpStatusOn(r, lastDayStr) : (r.status || "");
      if (st !== "入居前" && st !== "退所") {
        endOfMonthCount++;
      }
    });
    sumEndOfMonthResidents += endOfMonthCount;

    // 稼働率
    let occupancyStay = null;
    let occupancyPresent = null;
    if (capacity !== null) {
      const capDays = capacity * daysInMonth;
      occupancyStay = (monthStayDays / capDays) * 100;
      occupancyPresent = (monthPresentDays / capDays) * 100;
      sumCapacityDays += capDays;
    }

    // 新規入居・退居
    let newAdmissions = 0;
    let discharges = 0;
    let dischargeDeaths = 0;
    allResidents.forEach(r => {
      if (r.admission_date && r.admission_date.slice(0, 7) === ym) {
        newAdmissions++;
      }
      if (r.status === "退所" && r.discharge_date && r.discharge_date.slice(0, 7) === ym) {
        discharges++;
        if (r.discharge_reason === "死亡退所") {
          dischargeDeaths++;
        }
      }
    });

    // 売上（介護保険）の集計
    let monthUnits = 0;
    let monthCost100 = 0;
    let monthHoken = 0;
    let monthBurden = 0;
    let monthShogu = 0;
    const uncomputableList = [];

    allResidents.forEach(r => {
      if (typeof cpComputeMonthlyKasan === "function") {
        const calc = cpComputeMonthlyKasan(r, ym);
        if (calc.basicDays === 0 && calc.hospDays === 0 && (!calc.items || calc.items.length === 0)) {
          return;
        }

        // [Claude修正] 地域区分が未設定だと全員が「計算対象外」になり、単位数まで0になっていた。
        // 単位数は要介護度があれば数える。100％の金額は地域区分、保険請求額・利用者負担は保険給付率が要る
        if (calc.levelMissing || !r.care_level) {
          uncomputableList.push({ resident: r, reasons: ["要介護度未登録"] });
          return;
        }
        const uTotal = calc.totalUnits || 0;
        let sUnits = 0;
        if (Array.isArray(calc.items)) {
          calc.items.forEach(it => {
            if (!it.candidate && (it.category === "処遇改善" || ["6108", "6183", "6107", "6184", "6104", "6380"].includes(String(it.code)))) {
              sUnits += it.subtotal;
            }
          });
        }
        monthUnits += uTotal;
        monthShogu += sUnits;
        if (unitPriceInt === null) return; // 金額は出さない（画面に「地域区分未設定」）
        const c100 = Math.floor(uTotal * unitPriceInt / 100);
        monthCost100 += c100;
        const bRate = parseInt(String(r.benefit_rate), 10);
        if (![90, 80, 70].includes(bRate)) {
          uncomputableList.push({ resident: r, reasons: ["保険給付率未設定（100％の金額には入れ、保険請求額・利用者負担には入れていません）"] });
          return;
        }
        const hDemand = Math.floor(c100 * bRate / 100);
        monthHoken += hDemand;
        monthBurden += (c100 - hDemand);
      }
    });

    uncomputableMap[ym] = uncomputableList;

    sumStayDays += monthStayDays;
    sumPresentDays += monthPresentDays;
    sumHospDays += monthHospDays;
    sumNewAdmissions += newAdmissions;
    sumDischarges += discharges;
    sumDischargeDeaths += dischargeDeaths;
    sumTotalUnits += monthUnits;
    sumCost100 += monthCost100;
    sumHokenDemand += monthHoken;
    sumUserBurden += monthBurden;
    sumShoguUnits += monthShogu;

    monthRows.push({
      ym: ym,
      monthLabel: monthLabel,
      daysInMonth: daysInMonth,
      isFuture: false,
      capacity: capacity,
      unitPriceInt: unitPriceInt,
      endOfMonthCount: endOfMonthCount,
      stayDays: monthStayDays,
      presentDays: monthPresentDays,
      hospDays: monthHospDays,
      shortStayDays: monthShortStayDays,
      occupancyStay: occupancyStay,
      occupancyPresent: occupancyPresent,
      newAdmissions: newAdmissions,
      discharges: discharges,
      dischargeDeaths: dischargeDeaths,
      totalUnits: monthUnits,
      cost100: monthCost100,
      hokenDemand: monthHoken,
      userBurden: monthBurden,
      shoguUnits: monthShogu,
      uncomputableCount: uncomputableList.length
    });
  });

  const avgEndOfMonth = elapsedMonthCount > 0 ? (sumEndOfMonthResidents / elapsedMonthCount).toFixed(1) : "-";
  const yearOccupancyStay = (capacity !== null && sumCapacityDays > 0) ? ((sumStayDays / sumCapacityDays) * 100) : null;
  const yearOccupancyPresent = (capacity !== null && sumCapacityDays > 0) ? ((sumPresentDays / sumCapacityDays) * 100) : null;

  const totalRow = {
    label: "年度合計・平均",
    isTotal: true,
    capacity: capacity,
    unitPriceInt: unitPriceInt,
    avgEndOfMonth: avgEndOfMonth,
    stayDays: sumStayDays,
    presentDays: sumPresentDays,
    hospDays: sumHospDays,
    shortStayDays: sumShortStayDays,
    occupancyStay: yearOccupancyStay,
    occupancyPresent: yearOccupancyPresent,
    newAdmissions: sumNewAdmissions,
    discharges: sumDischarges,
    dischargeDeaths: sumDischargeDeaths,
    totalUnits: sumTotalUnits,
    cost100: sumCost100,
    hokenDemand: sumHokenDemand,
    userBurden: sumUserBurden,
    shoguUnits: sumShoguUnits
  };

  gStatsUncomputableMap = uncomputableMap;
  return {
    fiscalYear: fYear,
    capacity: capacity,
    unitPriceInt: unitPriceInt,
    regionType: settings.region_type || "",
    monthRows: monthRows,
    totalRow: totalRow,
    uncomputableMap: uncomputableMap
  };
}

// 3. SVGグラフ生成（外部ライブラリなし、viewBoxによる完全レスポンシブ）
function cpGenerateStatsGraphSvg(stats) {
  if (!stats || !stats.monthRows) return "";

  const svgW = 760;
  const svgH = 320;
  const padLeft = 85;
  const padRight = 65;
  const padTop = 45;
  const padBottom = 45;
  const plotW = svgW - padLeft - padRight;
  const plotH = svgH - padTop - padBottom;
  const plotBottom = padTop + plotH;

  // 最大金額の算出（棒グラフのスケール用）
  let maxCost = 0;
  stats.monthRows.forEach(r => {
    if (!r.isFuture && r.cost100 > maxCost) {
      maxCost = r.cost100;
    }
  });
  if (maxCost <= 0) maxCost = 3000000;
  // 切りのいい最大値に丸め（100万単位など）
  const magnitude = Math.pow(10, Math.floor(Math.log10(maxCost)));
  const maxScaleMoney = Math.ceil((maxCost * 1.15) / magnitude) * magnitude;

  // 12か月のX座標ステップ
  const colW = plotW / 12;

  // グリッド線とY軸目盛り（稼働率: 0%, 25%, 50%, 75%, 100% / 金額目盛り）
  const gridSteps = [0, 0.25, 0.5, 0.75, 1.0];
  const gridLines = gridSteps.map(ratio => {
    const yPos = plotBottom - (ratio * plotH);
    const pctLabel = `${Math.round(ratio * 100)}%`;
    const moneyVal = Math.round(ratio * maxScaleMoney);
    const moneyLabel = stats.unitPriceInt ? `${(moneyVal / 10000).toFixed(0)}万` : "";
    return `
      <line x1="${padLeft}" y1="${yPos}" x2="${svgW - padRight}" y2="${yPos}" stroke="var(--line-2)" stroke-dasharray="3,3" />
      <text x="${padLeft - 8}" y="${yPos + 4}" text-anchor="end" fill="var(--ink-2)" font-size="13">${moneyLabel}</text>
      <text x="${svgW - padRight + 8}" y="${yPos + 4}" text-anchor="start" fill="var(--ink-2)" font-size="13">${pctLabel}</text>
    `;
  }).join("");

  // 棒グラフ（100％金額）と折れ線（稼働率）の描画
  let barsHtml = "";
  const stayPoints = [];
  const presentPoints = [];
  let monthLabelsHtml = "";

  stats.monthRows.forEach((r, idx) => {
    const cx = padLeft + (idx + 0.5) * colW;
    monthLabelsHtml += `<text x="${cx}" y="${plotBottom + 20}" text-anchor="middle" fill="var(--ink)" font-size="13">${escapeHtml(r.monthLabel)}</text>`;

    if (!r.isFuture) {
      // 100%金額棒グラフ
      if (stats.unitPriceInt && r.cost100 > 0) {
        const barH = (r.cost100 / maxScaleMoney) * plotH;
        const barW = Math.max(8, colW * 0.44);
        const bx = cx - (barW / 2);
        const by = plotBottom - barH;
        barsHtml += `<rect x="${bx}" y="${by}" width="${barW}" height="${barH}" fill="var(--pine-tint)" stroke="var(--pine)" stroke-width="1.5" rx="3" />`;
      }

      // 稼働率（入居）
      if (r.occupancyStay !== null) {
        const yStay = plotBottom - (Math.min(100, r.occupancyStay) / 100) * plotH;
        stayPoints.push({ cx: cx, cy: yStay, val: r.occupancyStay });
      }

      // 稼働率（在所）
      if (r.occupancyPresent !== null) {
        const yPres = plotBottom - (Math.min(100, r.occupancyPresent) / 100) * plotH;
        presentPoints.push({ cx: cx, cy: yPres, val: r.occupancyPresent });
      }
    }
  });

  // 折れ線パス
  let stayLinePath = "";
  let stayDotsHtml = "";
  if (stayPoints.length > 0) {
    stayLinePath = stayPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.cx} ${p.cy}`).join(" ");
    stayDotsHtml = stayPoints.map(p => `<circle cx="${p.cx}" cy="${p.cy}" r="4" fill="var(--pine-dark)" />`).join("");
  }

  let presLinePath = "";
  let presDotsHtml = "";
  if (presentPoints.length > 0) {
    presLinePath = presentPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.cx} ${p.cy}`).join(" ");
    presDotsHtml = presentPoints.map(p => `<circle cx="${p.cx}" cy="${p.cy}" r="3.5" fill="var(--sun)" />`).join("");
  }

  // 凡例
  const legendHtml = `
    <g transform="translate(${padLeft}, 20)">
      <rect x="0" y="-10" width="14" height="12" fill="var(--pine-tint)" stroke="var(--pine)" stroke-width="1.5" rx="2" />
      <text x="18" y="1" fill="var(--ink-2)" font-size="13">100％金額（円）</text>

      <line x1="140" y1="-4" x2="160" y2="-4" stroke="var(--pine-dark)" stroke-width="2.5" />
      <circle cx="150" cy="-4" r="3.5" fill="var(--pine-dark)" />
      <text x="166" y="1" fill="var(--ink-2)" font-size="13">稼働率（入居）</text>

      <line x1="280" y1="-4" x2="300" y2="-4" stroke="var(--sun)" stroke-width="2.5" />
      <circle cx="290" cy="-4" r="3.5" fill="var(--sun)" />
      <text x="306" y="1" fill="var(--ink-2)" font-size="13">稼働率（在所）</text>
    </g>
  `;

  return `
    <svg viewBox="0 0 ${svgW} ${svgH}" style="width:100%; height:auto; max-width:100%; background:var(--surface); border:1px solid var(--line-2); border-radius:6px; display:block;">
      ${legendHtml}
      ${gridLines}
      <line x1="${padLeft}" y1="${plotBottom}" x2="${svgW - padRight}" y2="${plotBottom}" stroke="var(--line)" stroke-width="1.5" />
      ${barsHtml}
      ${stayLinePath ? `<path d="${stayLinePath}" fill="none" stroke="var(--pine-dark)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />` : ""}
      ${presLinePath ? `<path d="${presLinePath}" fill="none" stroke="var(--sun)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />` : ""}
      ${stayDotsHtml}
      ${presDotsHtml}
      ${monthLabelsHtml}
    </svg>
  `;
}

// 4. 画面描画（事務ポータル「集計」タブ）
function renderOfficeStatsTab() {
  const container = document.getElementById("tabOfficeStats");
  if (!container) return;

  if (typeof isCurrentStaffAdminOrClerk === "function" && !isCurrentStaffAdminOrClerk()) {
    container.innerHTML = `<div class="panel-card" style="padding:20px; text-align:center; color:var(--ink-3); font-size:13px;">稼働率・売上の集計は、管理者および事務のみ閲覧可能です。</div>`;
    return;
  }

  if (!gStatsSelectedYear) {
    gStatsSelectedYear = cpGetCurrentFiscalYear();
  }

  const stats = cpComputeYearStats(gStatsSelectedYear);
  gStatsCachedResults = stats;

  const currentFYear = cpGetCurrentFiscalYear();
  const yearOptions = [];
  for (let fy = currentFYear + 1; fy >= currentFYear - 2; fy--) {
    yearOptions.push(`<option value="${fy}" ${fy === stats.fiscalYear ? "selected" : ""}>${fy}年度（${fy}年4月〜${fy + 1}年3月）</option>`);
  }

  // 利用定員バッジ
  const capacityBadge = stats.capacity !== null
    ? `<span class="badge" style="background:var(--pine-tint-2); color:var(--pine-dark); font-size:13px; padding:4px 8px; border:1px solid var(--line-2);">利用定員: <strong>${stats.capacity}名</strong></span>`
    : `<span class="badge" style="background:var(--caution-tint); color:var(--caution); font-size:13px; padding:4px 8px; border:1px solid var(--line-2);">利用定員: <strong>未登録</strong>（加算設定で定員を設定すると稼働率が算出されます）</span>`;

  // 地域区分バッジ
  const regionBadge = stats.unitPriceInt !== null
    ? `<span class="badge" style="background:var(--pine-tint-2); color:var(--pine-dark); font-size:13px; padding:4px 8px; border:1px solid var(--line-2);">地域区分: <strong>${escapeHtml(stats.regionType)}</strong> (単価比率 ${(stats.unitPriceInt / 100).toFixed(2)}円)</span>`
    : `<span class="badge" style="background:var(--caution-tint); color:var(--caution); font-size:13px; padding:4px 8px; border:1px solid var(--line-2);">地域区分: <strong>未設定</strong>（金額は表示されません）</span>`;

  // 表の各月行
  const rowsHtml = stats.monthRows.map(r => {
    if (r.isFuture) {
      return `
        <tr>
          <td style="font-weight:bold; white-space:nowrap; text-align:center;">${escapeHtml(r.monthLabel)}</td>
          <td style="text-align:right;">-</td>
          <td style="text-align:right;">-</td>
          <td style="text-align:right;">-</td>
          <td style="text-align:right;">-</td>
          <td style="text-align:right;">-</td>
          <td style="text-align:right;">-</td>
          <td style="text-align:right;">-</td>
          <td style="text-align:right;">-</td>
          <td style="text-align:right;">-</td>
          <td style="text-align:right;">-</td>
          <td style="text-align:right;">-</td>
          <td style="text-align:right;">-</td>
          <td style="text-align:right;">-</td>
          <td style="text-align:right;">-</td>
        </tr>
      `;
    }

    const stayRateStr = r.occupancyStay !== null ? `${r.occupancyStay.toFixed(1)}%` : `<span style="color:var(--ink-3);">未登録</span>`;
    const presRateStr = r.occupancyPresent !== null ? `${r.occupancyPresent.toFixed(1)}%` : `<span style="color:var(--ink-3);">未登録</span>`;
    const dischargeStr = r.discharges > 0
      ? `${r.discharges}名 ${r.dischargeDeaths > 0 ? `<span style="font-size:13px; color:var(--ink-3);">(うち死亡${r.dischargeDeaths})</span>` : ""}`
      : "0名";

    // 金額列の表示
    let cost100Str = "-";
    let hokenStr = "-";
    let burdenStr = "-";
    if (stats.unitPriceInt !== null) {
      cost100Str = `${r.cost100.toLocaleString()}円`;
      hokenStr = `${r.hokenDemand.toLocaleString()}円`;
      burdenStr = `${r.userBurden.toLocaleString()}円`;
    } else {
      cost100Str = `<span style="color:var(--caution); font-size:13px;">地域区分未設定</span>`;
      hokenStr = `<span style="color:var(--caution); font-size:13px;">地域区分未設定</span>`;
      burdenStr = `<span style="color:var(--caution); font-size:13px;">地域区分未設定</span>`;
    }

    // 計算できない人
    let uncompBadge = "";
    if (r.uncomputableCount > 0) {
      uncompBadge = `
        <button type="button" class="btn btn-outline" style="font-size:13px; padding:2px 6px; border-color:var(--caution); color:var(--caution); background:var(--caution-tint);" onclick="openStatsUncomputableModal('${r.ym}')">
          計算対象外 ${r.uncomputableCount}名
        </button>
      `;
    }

    return `
      <tr>
        <td style="font-weight:bold; white-space:nowrap; text-align:center;">${escapeHtml(r.monthLabel)}</td>
        <td style="text-align:right; white-space:nowrap;">${r.endOfMonthCount}名</td>
        <td style="text-align:right; white-space:nowrap;">${r.stayDays}日${r.shortStayDays > 0 ? `<div style="font-size:13px; color:var(--ink-3);">うち短期 ${r.shortStayDays}日</div>` : ""}</td>
        <td style="text-align:right; white-space:nowrap;">${r.presentDays}日</td>
        <td style="text-align:right; font-weight:bold; color:var(--pine-dark); white-space:nowrap;">${stayRateStr}</td>
        <td style="text-align:right; font-weight:bold; color:var(--sun); white-space:nowrap;">${presRateStr}</td>
        <td style="text-align:right; white-space:nowrap;">${r.newAdmissions}名</td>
        <td style="text-align:right; white-space:nowrap;">${dischargeStr}</td>
        <td style="text-align:right; white-space:nowrap;">${r.hospDays > 0 ? `${r.hospDays}日` : "0日"}</td>
        <td style="text-align:right; font-weight:bold; white-space:nowrap;">${r.totalUnits.toLocaleString()}単位</td>
        <td style="text-align:right; font-weight:bold; color:var(--pine-dark); white-space:nowrap;">${cost100Str}</td>
        <td style="text-align:right; white-space:nowrap;">${hokenStr}</td>
        <td style="text-align:right; white-space:nowrap;">${burdenStr}</td>
        <td style="text-align:right; white-space:nowrap;">${r.shoguUnits.toLocaleString()}単位</td>
        <td style="white-space:nowrap;">${uncompBadge || `<span style="color:var(--ink-3); font-size:13px;">-</span>`}</td>
      </tr>
    `;
  }).join("");

  // 合計・平均行
  const tot = stats.totalRow;
  const totStayRateStr = tot.occupancyStay !== null ? `${tot.occupancyStay.toFixed(1)}%` : `<span style="color:var(--ink-3);">未登録</span>`;
  const totPresRateStr = tot.occupancyPresent !== null ? `${tot.occupancyPresent.toFixed(1)}%` : `<span style="color:var(--ink-3);">未登録</span>`;
  const totDischargeStr = tot.discharges > 0
    ? `${tot.discharges}名 ${tot.dischargeDeaths > 0 ? `<span style="font-size:13px; color:var(--ink-3);">(うち死亡${tot.dischargeDeaths})</span>` : ""}`
    : "0名";

  let totCost100Str = "-";
  let totHokenStr = "-";
  let totBurdenStr = "-";
  if (stats.unitPriceInt !== null) {
    totCost100Str = `${tot.cost100.toLocaleString()}円`;
    totHokenStr = `${tot.hokenDemand.toLocaleString()}円`;
    totBurdenStr = `${tot.userBurden.toLocaleString()}円`;
  } else {
    totCost100Str = `<span style="color:var(--caution); font-size:13px;">地域区分未設定</span>`;
    totHokenStr = `<span style="color:var(--caution); font-size:13px;">地域区分未設定</span>`;
    totBurdenStr = `<span style="color:var(--caution); font-size:13px;">地域区分未設定</span>`;
  }

  const svgGraphHtml = cpGenerateStatsGraphSvg(stats);

  container.innerHTML = `
    <div class="panel-title" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
      <span>稼働率・売上の集計（年度集計表）</span>
      <div style="display:flex; gap:6px; flex-wrap:wrap;">
        <button type="button" class="btn btn-primary" onclick="cpExportStatsCsv()">表を書き出す（CSV）</button>
        <button type="button" class="btn btn-secondary" onclick="cpPrintStats()">印刷</button>
      </div>
    </div>

    <!-- 期間選択とバッジ -->
    <div style="display:flex; align-items:center; gap:10px; margin:10px 0 12px; flex-wrap:wrap;">
      <label style="font-weight:bold; font-size:13px; color:var(--ink-2); display:flex; align-items:center; gap:6px;">
        集計年度:
        <select id="statsYearSelector" class="form-control" style="font-size:13px; width:220px;" onchange="onStatsYearChange(this.value)">
          <option value="">選んでください</option>
          ${yearOptions.join("")}
        </select>
      </label>
      ${capacityBadge}
      ${regionBadge}
    </div>

    <!-- 注意事項（必須表示） -->
    <div style="background:var(--pine-tint-2); border:1px solid var(--line); border-radius:6px; padding:12px; margin-bottom:14px; font-size:13px; color:var(--ink-2); line-height:1.7;">
      <div style="font-weight:bold; color:var(--pine-dark); margin-bottom:4px;">集計の基準と留意事項</div>
      ・<strong>稼働率は国が決めた数え方ではありません。この画面では上の式で数えています。</strong><br>
      ・<strong>金額は介護保険の分の目安です。家賃・食費・光熱水費などはまだ入っていません。月遅れ・返戻は入っていません。</strong><br>
      ・<strong>介護保険（32・37）および短期利用（38・39）の請求が入っています。</strong><br>
      ※入居延べ日数は入院中・外泊中の日数も含み、在所延べ日数は施設内に滞在していた実日数です。
    </div>

    <!-- グラフエリア（SVGレスポンシブ） -->
    <div style="margin-bottom:16px;">
      <h4 style="margin:0 0 8px 0; font-size:14px; color:var(--pine-dark);">年度月次推移グラフ（100％売上金額・稼働率）</h4>
      <div style="overflow-x:auto;">
        ${svgGraphHtml}
      </div>
    </div>

    <!-- 月ごとの集計表 -->
    <div style="overflow-x:auto;">
      <table class="data-table" id="statsMonthlyTable" style="width:100%; font-size:13px; min-width:980px;">
        <thead>
          <tr style="background:var(--pine-tint-2);">
            <th style="width:60px; text-align:center;">月</th>
            <th style="width:85px; text-align:right;">月末入居者</th>
            <th style="width:85px; text-align:right;">延べ入居日数</th>
            <th style="width:85px; text-align:right;">延べ在所日数</th>
            <th style="width:90px; text-align:right; color:var(--pine-dark);">稼働率(入居)</th>
            <th style="width:90px; text-align:right; color:var(--sun);">稼働率(在所)</th>
            <th style="width:75px; text-align:right;">新規入居</th>
            <th style="width:110px; text-align:right;">退居(死亡)</th>
            <th style="width:85px; text-align:right;">入院延べ日数</th>
            <th style="width:95px; text-align:right;">単位数合計</th>
            <th style="width:115px; text-align:right; color:var(--pine-dark);">100％金額</th>
            <th style="width:105px; text-align:right;">保険請求額</th>
            <th style="width:105px; text-align:right;">利用者負担額</th>
            <th style="width:95px; text-align:right;">処遇改善単位</th>
            <th style="width:110px;">計算対象外</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
        <tfoot>
          <tr style="background:var(--pine-tint); font-weight:bold;">
            <td style="text-align:center;">年度計・平均</td>
            <td style="text-align:right;">平均 ${tot.avgEndOfMonth}名</td>
            <td style="text-align:right;">${tot.stayDays.toLocaleString()}日${tot.shortStayDays > 0 ? `<div style="font-size:13px; color:var(--ink-3);">うち短期 ${tot.shortStayDays}日</div>` : ""}</td>
            <td style="text-align:right;">${tot.presentDays.toLocaleString()}日</td>
            <td style="text-align:right; color:var(--pine-dark); font-size:14px;">${totStayRateStr}</td>
            <td style="text-align:right; color:var(--sun); font-size:14px;">${totPresRateStr}</td>
            <td style="text-align:right;">${tot.newAdmissions}名</td>
            <td style="text-align:right;">${totDischargeStr}</td>
            <td style="text-align:right;">${tot.hospDays.toLocaleString()}日</td>
            <td style="text-align:right; font-size:14px;">${tot.totalUnits.toLocaleString()}単位</td>
            <td style="text-align:right; font-size:14px; color:var(--pine-dark);">${totCost100Str}</td>
            <td style="text-align:right; font-size:14px;">${totHokenStr}</td>
            <td style="text-align:right; font-size:14px;">${totBurdenStr}</td>
            <td style="text-align:right;">${tot.shoguUnits.toLocaleString()}単位</td>
            <td style="text-align:center;">-</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- 画面下の必須注意書き -->
    <div style="margin-top:16px; background:var(--pine-tint-2); border:1px solid var(--line); border-radius:6px; padding:14px; font-size:13px; color:var(--ink-2); line-height:1.7;">
      <div style="font-weight:bold; color:var(--pine-dark); margin-bottom:6px;">【集計に関する注意書き】</div>
      <ul style="margin:0; padding-left:20px;">
        <li>介護保険の売上は、事業所の体制の加算・減算と利用者の区分から計算した「目安」です。実際の請求・入金とは異なる場合があります</li>
        <li>1円未満の端数の処理（四捨五入か切り捨てか）や、保険請求と利用者負担の端数の合わせ方によって、1円〜数円ずれることがあります</li>
        <li>正式な請求額は、国保連に送る請求データ（CSV）と、国保連からの支払決定通知書で確かめてください</li>
        <li>稼働率は概算ではありません。この画面では毎日の実績で数えています</li>
        <li>金額は介護保険の分の目安です。家賃・食費・水光熱費などは入っていません。立替・返金は入っていません</li>
        <li>介護保険（32・37）および短期利用（38・39）の金額が入っています</li>
        <li>入居日は入院・外泊の日を含み、在所日は施設内に滞在していた日です</li>
      </ul>
    </div>
  `;
}

// 5. 年度切り替えハンドラ
function onStatsYearChange(val) {
  gStatsSelectedYear = parseInt(val, 10) || cpGetCurrentFiscalYear();
  renderOfficeStatsTab();
}

// 6. 計算対象外詳細モーダル表示
function openStatsUncomputableModal(ym) {
  if (typeof isCurrentStaffAdminOrClerk === "function" && !isCurrentStaffAdminOrClerk()) {
    alert("管理者または事務のみ操作可能です。");
    return;
  }

  const modal = document.getElementById("statsUncomputableModal");
  if (!modal) return;

  const list = (gStatsUncomputableMap && gStatsUncomputableMap[ym]) || [];
  const titleEl = document.getElementById("statsUncomputableModalTitle");
  if (titleEl) titleEl.textContent = `${ym} 計算対象外の利用者詳細（計 ${list.length}名）`;

  const container = document.getElementById("statsUncomputableListContainer");
  if (container) {
    if (list.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding:16px; color:var(--ink-3); font-size:13px;">計算対象外の利用者はいません。</div>`;
    } else {
      const rows = list.map(item => `
        <div style="border-bottom:1px solid var(--line-2); padding:8px 0; font-size:13px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
          <div>
            <strong>${escapeHtml(item.resident.name || "名称未登録")}</strong>
            <span style="color:var(--ink-2); font-size:13px; margin-left:6px;">(居室: ${escapeHtml(item.resident.room_no || "-")})</span>
          </div>
          <div>
            ${item.reasons.map(rs => `<span class="badge" style="background:var(--alert-tint); color:var(--alert); font-size:13px; padding:2px 6px; margin-left:4px;">${escapeHtml(rs)}</span>`).join("")}
          </div>
        </div>
      `).join("");
      container.innerHTML = `<div style="max-height:300px; overflow-y:auto;">${rows}</div>`;
    }
  }

  modal.style.display = "flex";
}

function closeStatsUncomputableModal() {
  const modal = document.getElementById("statsUncomputableModal");
  if (modal) modal.style.display = "none";
}

// 7. CSV出力（UTF-8 BOM付き・CRLF改行・settings_logs記録）
function cpExportStatsCsv() {
  if (typeof isCurrentStaffAdminOrClerk === "function" && !isCurrentStaffAdminOrClerk()) {
    alert("集計ファイルの書き出しは、管理者および事務のみ操作可能です。");
    return;
  }

  const stats = cpComputeYearStats(gStatsSelectedYear);
  if (!stats) {
    alert("集計データの取得に失敗しました。");
    return;
  }

  const fYear = stats.fiscalYear;
  const lines = [];

  // ヘッダー行
  const headers = [
    "月",
    "利用定員",
    "月末入居者数",
    "延べ入居日数",
    "うち短期利用の延べ日数",
    "延べ在所日数",
    "稼働率（入居）",
    "稼働率（在所）",
    "新規入居人数",
    "退居人数",
    "うち死亡退所",
    "入院延べ日数",
    "単位数合計",
    "100％金額（円）",
    "保険請求額（円）",
    "利用者負担額（円）",
    "処遇改善加算単位数",
    "計算対象外人数"
  ];
  lines.push(headers.join(","));

  // 各月行
  stats.monthRows.forEach(r => {
    if (r.isFuture) {
      lines.push([
        r.monthLabel,
        r.capacity !== null ? String(r.capacity) : "未登録",
        "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-"
      ].join(","));
    } else {
      lines.push([
        r.monthLabel,
        r.capacity !== null ? String(r.capacity) : "未登録",
        String(r.endOfMonthCount),
        String(r.stayDays),
        String(r.shortStayDays || 0),
        String(r.presentDays),
        r.occupancyStay !== null ? `${r.occupancyStay.toFixed(1)}%` : "未登録",
        r.occupancyPresent !== null ? `${r.occupancyPresent.toFixed(1)}%` : "未登録",
        String(r.newAdmissions),
        String(r.discharges),
        String(r.dischargeDeaths),
        String(r.hospDays),
        String(r.totalUnits),
        stats.unitPriceInt !== null ? String(r.cost100) : "地域区分未設定",
        stats.unitPriceInt !== null ? String(r.hokenDemand) : "地域区分未設定",
        stats.unitPriceInt !== null ? String(r.userBurden) : "地域区分未設定",
        String(r.shoguUnits),
        String(r.uncomputableCount)
      ].join(","));
    }
  });

  // 合計行
  const tot = stats.totalRow;
  lines.push([
    "年度合計・平均",
    tot.capacity !== null ? String(tot.capacity) : "未登録",
    String(tot.avgEndOfMonth),
    String(tot.stayDays),
    String(tot.shortStayDays || 0),
    String(tot.presentDays),
    tot.occupancyStay !== null ? `${tot.occupancyStay.toFixed(1)}%` : "未登録",
    tot.occupancyPresent !== null ? `${tot.occupancyPresent.toFixed(1)}%` : "未登録",
    String(tot.newAdmissions),
    String(tot.discharges),
    String(tot.dischargeDeaths),
    String(tot.hospDays),
    String(tot.totalUnits),
    stats.unitPriceInt !== null ? String(tot.cost100) : "地域区分未設定",
    stats.unitPriceInt !== null ? String(tot.hokenDemand) : "地域区分未設定",
    stats.unitPriceInt !== null ? String(tot.userBurden) : "地域区分未設定",
    String(tot.shoguUnits),
    "-"
  ].join(","));

  // BOM付加とCRLF結合
  const csvContent = "\uFEFF" + lines.join("\r\n") + "\r\n";
  const fileName = `集計_${fYear}年度.csv`;

  try {
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // settings_logs に記録
    if (!Array.isArray(db.data.settings_logs)) db.data.settings_logs = [];
    db.data.settings_logs.push({
      id: Date.now(),
      at: toLocalDateTimeStr(new Date()),
      by: cpLoginStaffName(),
      kind: "集計CSV出力",
      action: "出力",
      detail: `${fYear}年度の稼働率・売上集計CSVを出力`
    });
    db.save();

    alert(`${fileName} を書き出しました。`);
  } catch (e) {
    alert("CSVの書き出しに失敗しました: " + (e.message || e));
  }
}

// 8. 印刷機能（A4横、表とグラフ）
function cpPrintStats() {
  if (typeof isCurrentStaffAdminOrClerk === "function" && !isCurrentStaffAdminOrClerk()) {
    alert("集計の印刷は、管理者および事務のみ操作可能です。");
    return;
  }

  const stats = cpComputeYearStats(gStatsSelectedYear);
  if (!stats) {
    alert("集計データの取得に失敗しました。");
    return;
  }

  const printTimeStr = toLocalDateTimeStr(new Date());
  const fYear = stats.fiscalYear;
  const svgHtml = cpGenerateStatsGraphSvg(stats);

  // 印刷用HTMLの構築
  const rowsHtml = stats.monthRows.map(r => {
    if (r.isFuture) {
      return `<tr><td style="text-align:center;">${escapeHtml(r.monthLabel)}</td><td>-</td><td>-</td><td>-</td><td>-</td><td>-</td><td>-</td><td>-</td><td>-</td><td>-</td><td>-</td><td>-</td><td>-</td><td>-</td></tr>`;
    }
    const stayRate = r.occupancyStay !== null ? `${r.occupancyStay.toFixed(1)}%` : "未登録";
    const presRate = r.occupancyPresent !== null ? `${r.occupancyPresent.toFixed(1)}%` : "未登録";
    const costStr = stats.unitPriceInt ? `${r.cost100.toLocaleString()}円` : "未設定";
    const hokenStr = stats.unitPriceInt ? `${r.hokenDemand.toLocaleString()}円` : "未設定";
    const burdenStr = stats.unitPriceInt ? `${r.userBurden.toLocaleString()}円` : "未設定";
    const disStr = `${r.discharges}名${r.dischargeDeaths > 0 ? ` (死${r.dischargeDeaths})` : ""}`;
    return `
      <tr>
        <td style="text-align:center; font-weight:bold;">${escapeHtml(r.monthLabel)}</td>
        <td style="text-align:right;">${r.endOfMonthCount}名</td>
        <td style="text-align:right;">${r.stayDays}日${r.shortStayDays > 0 ? `<div style="font-size:13px; color:var(--ink-3);">うち短期 ${r.shortStayDays}日</div>` : ""}</td>
        <td style="text-align:right;">${r.presentDays}日</td>
        <td style="text-align:right;">${stayRate}</td>
        <td style="text-align:right;">${presRate}</td>
        <td style="text-align:right;">${r.newAdmissions}名</td>
        <td style="text-align:right;">${disStr}</td>
        <td style="text-align:right;">${r.hospDays}日</td>
        <td style="text-align:right;">${r.totalUnits.toLocaleString()}</td>
        <td style="text-align:right;">${costStr}</td>
        <td style="text-align:right;">${hokenStr}</td>
        <td style="text-align:right;">${burdenStr}</td>
        <td style="text-align:right;">${r.shoguUnits.toLocaleString()}</td>
      </tr>
    `;
  }).join("");

  const tot = stats.totalRow;
  const totStayRate = tot.occupancyStay !== null ? `${tot.occupancyStay.toFixed(1)}%` : "未登録";
  const totPresRate = tot.occupancyPresent !== null ? `${tot.occupancyPresent.toFixed(1)}%` : "未登録";
  const totCostStr = stats.unitPriceInt ? `${tot.cost100.toLocaleString()}円` : "未設定";
  const totHokenStr = stats.unitPriceInt ? `${tot.hokenDemand.toLocaleString()}円` : "未設定";
  const totBurdenStr = stats.unitPriceInt ? `${tot.userBurden.toLocaleString()}円` : "未設定";
  const totDisStr = `${tot.discharges}名${tot.dischargeDeaths > 0 ? ` (死${tot.dischargeDeaths})` : ""}`;

  const win = window.open("", "_blank");
  if (!win) {
    alert("印刷ウィンドウを開けませんでした。ポップアップブロックを解除してください。");
    return;
  }

  win.document.write(`<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>${fYear}年度 稼働率・売上集計表</title>
  <link rel="stylesheet" href="style.css">
  <style>
    @page { size: landscape; margin: 10mm; }
    body { font-family: var(--font-family, sans-serif); font-size: 13px; color: var(--ink); margin: 0; padding: 10px; background: var(--surface); }
    h2 { margin: 0 0 6px 0; font-size: 18px; color: var(--pine-dark); }
    .print-meta { font-size: 13px; color: var(--ink-2); margin-bottom: 8px; display: flex; justify-content: space-between; }
    .print-notes { font-size: 13px; color: var(--ink-2); line-height: 1.5; margin: 8px 0; border: 1px solid var(--line); border-radius: 4px; padding: 6px 10px; background: var(--pine-tint-2); }
    table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 8px; }
    th, td { border: 1px solid var(--line-2); padding: 4px 6px; }
    th { background: var(--ground); color: var(--ink); }
    tfoot tr { font-weight: bold; background: var(--pine-tint); }
  </style>
</head>
<body>
  <h2>${fYear}年度 稼働率・売上集計表</h2>
  <div class="print-meta">
    <span>施設名称: ${(db && db.data && db.data.office_info && db.data.office_info.name) || "グループホーム"} (定員: ${stats.capacity !== null ? stats.capacity + "名" : "未登録"})</span>
    <span>印刷日時: ${printTimeStr}</span>
  </div>
  <div class="print-notes">
    <div><strong>【集計に関する注意書き】</strong></div>
    <div>・介護保険の売上は、事業所の体制の加算・減算と利用者の区分から計算した「目安」です。実際の請求・入金とは異なる場合があります</div>
    <div>・1円未満の端数の処理（四捨五入か切り捨てか）や、保険請求と利用者負担の端数の合わせ方によって、1円〜数円ずれることがあります</div>
    <div>・正式な請求額は、国保連に送る請求データ（CSV）と、国保連からの支払決定通知書で確かめてください</div>
    <div>・稼働率は概算ではありません。毎日の実績で数えています。食費・居住費などは含まれません。短期利用は延べ入居日数・稼働率に含めています。</div>
  </div>
  <div style="margin-bottom:12px;">
    ${svgHtml}
  </div>
  <table>
    <thead>
      <tr>
        <th>月</th>
        <th>月末入居</th>
        <th>延べ入居</th>
        <th>延べ在所</th>
        <th>稼働(入居)</th>
        <th>稼働(在所)</th>
        <th>新規</th>
        <th>退居(死)</th>
        <th>入院日数</th>
        <th>単位数</th>
        <th>100％金額</th>
        <th>保険請求額</th>
        <th>利用者負担</th>
        <th>処遇改善</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
    <tfoot>
      <tr>
        <td style="text-align:center;">年度計・平均</td>
        <td style="text-align:right;">平均 ${tot.avgEndOfMonth}名</td>
        <td style="text-align:right;">${tot.stayDays.toLocaleString()}日${tot.shortStayDays > 0 ? `<div style="font-size:13px; color:var(--ink-3);">うち短期 ${tot.shortStayDays}日</div>` : ""}</td>
        <td style="text-align:right;">${tot.presentDays.toLocaleString()}日</td>
        <td style="text-align:right;">${totStayRate}</td>
        <td style="text-align:right;">${totPresRate}</td>
        <td style="text-align:right;">${tot.newAdmissions}名</td>
        <td style="text-align:right;">${totDisStr}</td>
        <td style="text-align:right;">${tot.hospDays.toLocaleString()}日</td>
        <td style="text-align:right;">${tot.totalUnits.toLocaleString()}</td>
        <td style="text-align:right;">${totCostStr}</td>
        <td style="text-align:right;">${totHokenStr}</td>
        <td style="text-align:right;">${totBurdenStr}</td>
        <td style="text-align:right;">${tot.shoguUnits.toLocaleString()}</td>
      </tr>
    </tfoot>
  </table>
  <script>
    window.onload = function() { window.print(); };
  </script>
</body>
</html>`);
  win.document.close();
}

// 9. グローバル公開
window.cpGetCurrentFiscalYear = cpGetCurrentFiscalYear;
window.cpGetFiscalYearMonths = cpGetFiscalYearMonths;
window.cpComputeYearStats = cpComputeYearStats;
window.cpGenerateStatsGraphSvg = cpGenerateStatsGraphSvg;
window.renderOfficeStatsTab = renderOfficeStatsTab;
window.onStatsYearChange = onStatsYearChange;
window.openStatsUncomputableModal = openStatsUncomputableModal;
window.closeStatsUncomputableModal = closeStatsUncomputableModal;
window.cpExportStatsCsv = cpExportStatsCsv;
window.cpPrintStats = cpPrintStats;
