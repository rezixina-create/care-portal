/**
 * 介護施設 統合業務ポータルシステム (Care Portal)
 * 【施設内Wi-Fiクラウド共有 ＆ スタンドアロン両対応版】
 * ・サーバー稼働時: 親機PCに全データが一元保存され、タブレット等の他端末とリアルタイム共有
 * ・単体起動時: ブラウザのlocalStorageで永久保存
 */

// HTMLエスケープヘルパー (XSS防止・表示崩れ防止)
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// 役職序列判定（偉い人順: 施設長・管理者 → リーダー・相談員 → 看護師 → 介護職員 → 事務員）
function getStaffRoleRank(role, name) {
  const text = `${role || ""} ${name || ""}`.toLowerCase();
  if (text.includes("施設長") || text.includes("管理者") || text.includes("所長") || text.includes("ホーム長") || text.includes("院長") || text.includes("理事")) return 1;
  if (text.includes("副施設長") || text.includes("副管理者") || text.includes("事務長")) return 2;
  if (text.includes("相談員") || text.includes("ケアマネ") || text.includes("サービス提供") || text.includes("サ責")) return 3;
  if (text.includes("看護師長") || text.includes("主任看護") || text.includes("看護リーダー")) return 4;
  if (text.includes("看護")) return 5;
  if (text.includes("リーダー") || text.includes("主任") || text.includes("チーフ")) return 6;
  if (text.includes("機能訓練") || text.includes("理学療法") || text.includes("作業療法")) return 7;
  if (text.includes("介護") || text.includes("ケア") || text.includes("ヘルパー")) return 8;
  if (text.includes("事務")) return 9;
  return 10;
}

function sortStaffList(list) {
  if (!Array.isArray(list)) return [];
  return list.sort((a, b) => {
    const rankA = getStaffRoleRank(a.role, a.name);
    const rankB = getStaffRoleRank(b.role, b.name);
    if (rankA !== rankB) return rankA - rankB;
    return (a.name || "").localeCompare(b.name || "", "ja");
  });
}

// データベース管理クラス (ハイブリッド: サーバー同期 ＋ ローカル保存)
class LocalDB {
  constructor() {
    this.key = "CARE_PORTAL_DATABASE_V1";
    this.isServerMode = window.location.protocol.startsWith("http");
    this.data = this.loadLocal();
    this.serverIPs = [];
    this.serverPort = window.location.port || 8888;
    this.lastSavedJson = JSON.stringify(this.data);

    if (this.isServerMode) {
      this.initServerSync();
    }
  }

  loadLocal() {
    const raw = localStorage.getItem(this.key);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        return this.ensureDefaultArrays(parsed);
      } catch (e) {}
    }
    return this.initSeedData();
  }

  ensureDefaultArrays(d) {
    if (!d || typeof d !== "object") return this.initSeedData();
    const arrayKeys = [
      "residents", "stamps", "templates", "suppliers", "inventory",
      "emergency_supplies", "belongings", "equipments", "recreations",
      "vehicle_logs", "fire_drills", "committees", "care_records",
      "shifts", "notebooks", "notebook_stamps", "vitals", "excretions",
      "meals", "oral_cares", "baths", "meds", "turns", "linens",
      "groomings", "weight_records", "visitations", "inventory_logs",
      "consumptions", "orders", "deposits", "complaints", "incidents", "photos"
    ];
    arrayKeys.forEach(k => {
      if (!Array.isArray(d[k])) d[k] = [];
    });
    if (Array.isArray(d.stamps)) {
      d.stamps = sortStaffList(d.stamps);
    }
    return d;
  }

  save() {
    // 1. ローカルストレージに即時保険保存
    try {
      localStorage.setItem(this.key, JSON.stringify(this.data));
    } catch (e) {}

    // 2. サーバーモードなら親機へ即時送信
    if (this.isServerMode) {
      this.saveToServer();
    }
  }

  async saveToServer() {
    try {
      const payload = JSON.stringify(this.data);
      this.lastSavedJson = payload;
      const res = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload
      });
      if (res.ok) {
        this.updateSyncBadge(true);
      } else {
        this.updateSyncBadge(false);
      }
    } catch (err) {
      console.warn("Server save error:", err);
      this.updateSyncBadge(false);
    }
  }

  async initServerSync() {
    // サーバーのローカルIP一覧を取得
    try {
      const resIp = await fetch('/api/ip');
      if (resIp.ok) {
        const ipData = await resIp.json();
        this.serverIPs = ipData.ips || [];
        this.serverPort = ipData.port || window.location.port || 8888;
        if (ipData.tunnel_url && ipData.tunnel_url.trim() !== "") {
          localStorage.setItem("care_portal_tunnel_url", ipData.tunnel_url.trim());
        }
        this.renderShareModalUrls();
      }
    } catch (e) {}

    // サーバー上の最新DBを取得
    try {
      const res = await fetch('/api/data');
      if (res.ok) {
        const text = await res.text();
        if (text && text.trim() !== "" && text.trim() !== "{}") {
          const serverData = JSON.parse(text);
          if (serverData && serverData.residents && serverData.residents.length > 0) {
            this.data = this.ensureDefaultArrays(serverData);
            this.lastSavedJson = JSON.stringify(this.data);
            try { localStorage.setItem(this.key, this.lastSavedJson); } catch (e) {}
            // 画面を再初期化して最新データを表示
            setTimeout(() => {
              if (typeof reloadStateFromDb === 'function') {
                reloadStateFromDb();
              }
            }, 100);
          }
        } else {
          // サーバーが空ならローカル初期データをサーバーへ初回登録
          await this.saveToServer();
        }
        this.updateSyncBadge(true);
      }
    } catch (e) {
      console.warn("Init sync failed, running in local mode:", e);
      this.updateSyncBadge(false);
    }

    // 5秒ごとのバックグラウンド同期 (他端末からの入力を反映)
    setInterval(() => this.pollServerUpdates(), 5000);
  }

  async pollServerUpdates() {
    if (!this.isServerMode) return;
    try {
      const res = await fetch('/api/data');
      if (!res.ok) return;
      const text = await res.text();
      if (!text || text.trim() === "" || text === "{}" || text === this.lastSavedJson) return;

      const serverData = JSON.parse(text);
      if (serverData && serverData.residents) {
        this.data = this.ensureDefaultArrays(serverData);
        this.lastSavedJson = JSON.stringify(this.data);
        try { localStorage.setItem(this.key, this.lastSavedJson); } catch (e) {}
        this.updateSyncBadge(true);

        // 職員が編集中でない場合に限りビューを更新
        const activeTag = document.activeElement ? document.activeElement.tagName : "";
        if (activeTag !== "INPUT" && activeTag !== "TEXTAREA" && activeTag !== "SELECT") {
          if (typeof reloadStateFromDb === 'function') {
            reloadStateFromDb();
          }
        }
      }
    } catch (e) {
      this.updateSyncBadge(false);
    }
  }

  updateSyncBadge(isOnline) {
    const badge = document.getElementById("syncStatusBadge");
    if (!badge) return;
    if (this.isServerMode) {
      if (isOnline) {
        badge.innerHTML = "📶 施設内Wi-Fi共有中";
        badge.style.background = "#2563eb";
        badge.title = "施設内Wi-Fiで他端末とリアルタイム共有中 (クリックで接続URL表示)";
      } else {
        badge.innerHTML = "⚠️ 親機サーバー通信切断";
        badge.style.background = "#dc2626";
        badge.title = "親機サーバーとの通信が一時途絶しています (ローカル保存中)";
      }
    } else {
      badge.innerHTML = "💾 単体ローカル動作中";
      badge.style.background = "#64748b";
      badge.title = "このPC単体で動作しています (他端末共有にはサーバー起動が必要です)";
    }
  }

  renderShareModalUrls() {
    const container = document.getElementById("shareUrlList");
    if (!container) return;
    container.innerHTML = "";

    const port = this.serverPort || 8888;
    let ipsToShow = [...this.serverIPs];
    const currentHost = window.location.hostname;
    if (currentHost && currentHost !== "localhost" && currentHost !== "127.0.0.1" && !ipsToShow.includes(currentHost)) {
      ipsToShow.unshift(currentHost);
    }
    if (ipsToShow.length === 0) {
      ipsToShow.push("192.168.11.17");
    }
    const primaryIp = ipsToShow[0];
    const localUrl = `http://${primaryIp}:${port}`;
    const localQrUrl = "https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=" + encodeURIComponent(localUrl);

    // 保存されているCloudflare URL（初期値は学校設定のURL）
    let cloudflareUrl = localStorage.getItem("care_portal_tunnel_url") || "https://percentage-freelance-unwrap-spatial.trycloudflare.com";
    const cloudQrUrl = "https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=" + encodeURIComponent(cloudflareUrl);

    // 1. 【🏠 ご自宅・同一Wi-Fi接続 (今すぐ繋がる・推奨)】
    const localDiv = document.createElement("div");
    localDiv.style.cssText = "display:flex; gap:16px; align-items:center; background:#f0fdf4; border:2px solid #22c55e; border-radius:10px; padding:14px 16px; margin-bottom:12px; box-shadow:0 2px 6px rgba(34,197,94,0.15);";
    localDiv.innerHTML = `
      <div style="flex-shrink:0; text-align:center;">
        <img src="${localQrUrl}" alt="自宅Wi-Fi接続QRコード" style="width:120px; height:120px; border-radius:8px; border:2px solid #86efac; background:#fff; display:block; padding:4px;">
        <span style="font-size:11px; color:#15803d; font-weight:bold; margin-top:5px; display:block;">📱 自宅スマホ用</span>
      </div>
      <div style="flex:1; min-width:0;">
        <div style="display:inline-flex; align-items:center; gap:6px; background:#16a34a; color:#ffffff; font-size:11px; font-weight:bold; padding:3px 8px; border-radius:4px; margin-bottom:6px;">
          🏠 ご自宅・施設内Wi-Fi（即時接続・推奨）
        </div>
        <div style="font-size:13px; font-weight:bold; color:#14532d; margin-bottom:4px;">自宅PCと同じWi-Fiにつなぐだけ！</div>
        <div style="font-family:monospace; font-size:14px; font-weight:bold; color:#15803d; margin-bottom:8px; word-break:break-all; background:#ffffff; padding:6px 10px; border-radius:6px; border:1px solid #bbf7d0;">
          ${localUrl}
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
          <button class="btn btn-success" style="padding:6px 14px; font-size:13px; font-weight:bold; background:#16a34a; border-color:#16a34a; color:#fff;" onclick="copyShareUrl('${localUrl}')">📋 自宅URLをコピー</button>
          <a href="${localUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary" style="padding:6px 12px; font-size:13px; text-decoration:none; display:inline-flex; align-items:center;">🔗 ブラウザで開く</a>
        </div>
        <div style="font-size:11.5px; color:#374151; margin-top:6px; line-height:1.4;">
          ※ スマホをご自宅PCと同じWi-Fi（同一ルーター）につないでこのQRコードを読み取ってください。一発で高速に開けます。
        </div>
      </div>
    `;
    container.appendChild(localDiv);

    // 2. 【🌐 学校Wi-Fi・外出先用 (Cloudflare Tunnel)】
    const cloudDiv = document.createElement("div");
    cloudDiv.style.cssText = "display:flex; gap:16px; align-items:center; background:#eff6ff; border:2px solid #3b82f6; border-radius:10px; padding:14px 16px; margin-bottom:12px; box-shadow:0 2px 6px rgba(59,130,246,0.15);";
    cloudDiv.innerHTML = `
      <div style="flex-shrink:0; text-align:center;">
        <img src="${cloudQrUrl}" alt="Cloudflare接続QRコード" style="width:120px; height:120px; border-radius:8px; border:2px solid #93c5fd; background:#fff; display:block; padding:4px;">
        <span style="font-size:11px; color:#1e40af; font-weight:bold; margin-top:5px; display:block;">📱 学校・外出先用</span>
      </div>
      <div style="flex:1; min-width:0;">
        <div style="display:inline-flex; align-items:center; gap:6px; background:#2563eb; color:#ffffff; font-size:11px; font-weight:bold; padding:3px 8px; border-radius:4px; margin-bottom:6px;">
          🌐 学校Wi-Fi・外出先 (Cloudflare Tunnel)
        </div>
        <div style="font-size:13px; font-weight:bold; color:#1e293b; margin-bottom:4px;">学校PC起動時・クラウド暗号化トンネル</div>
        <div style="font-family:monospace; font-size:13px; font-weight:bold; color:#1d4ed8; margin-bottom:8px; word-break:break-all; background:#ffffff; padding:6px 10px; border-radius:6px; border:1px solid #bfdbfe;">
          ${cloudflareUrl}
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:6px;">
          <button class="btn btn-primary" style="padding:6px 14px; font-size:13px; font-weight:bold;" onclick="copyShareUrl('${cloudflareUrl}')">📋 学校URLをコピー</button>
          <button class="btn btn-secondary" style="padding:6px 12px; font-size:12px;" onclick="promptChangeTunnelUrl()">✏️ URL変更</button>
        </div>
        <div style="font-size:11.5px; color:#b91c1c; font-weight:bold; margin-top:4px; line-height:1.4;">
          ⚠️ 注意: 学校PCでCloudflareトンネルが起動している間のみ繋がります。学校PCが終了・スリープしていると「つなげない」と表示されます。
        </div>
      </div>
    `;
    container.appendChild(cloudDiv);
  }

  initSeedData() {
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const nowStr = `${todayStr} ${today.toTimeString().slice(0, 5)}`;

    const seed = {
      residents: [
        { id: 1, name: "佐藤 太郎", room_no: "101", care_level: "要介護3", status: "在所", birth_date: "1940-10-15", policy_stamp: "看取り", sensor_alert: "⚠️ 離床センサーマット使用中 (ベッド脇)", emergency_contact: "長男: 佐藤 一郎 (090-1111-2222)", family_wishes: "本人が穏やかに過ごせるようにお願いします。", life_history: "元大工職人。相撲観戦が大好き。頑固だが笑顔が優しい。", paralysis: "右片麻痺 (左側からの介助推奨)", allergies: "卵アレルギー", diet_type: "普通食 (一口大)", oral_state: "上部義歯 (下残歯あり)", diseases: "糖尿病, 脳梗塞後遺症", care_plan_goal: "歩行器での安全な移動。食事時のむせ込み予防。", dr_instructions: "次回採血予定。低血糖症状に留意。", next_clinic_date: "2026-10-14", care_expiry_date: "2026-11-15", deposit_balance: 35000 },
        { id: 2, name: "田中 ハナ", room_no: "102", care_level: "要介護2", status: "在所", birth_date: "1938-11-20", policy_stamp: "緊急搬送", sensor_alert: "⚠️ ナースコール常時手元配置", emergency_contact: "長女: 田中 美咲 (090-3333-4444)", family_wishes: "足元の冷えを気にするので温かくしてください。", life_history: "元教員。読書と手芸が趣味。几帳面な性格。", paralysis: "麻痺なし (膝痛あり)", allergies: "なし", diet_type: "軟飯・一口刻み", oral_state: "総義歯", diseases: "心不全, 高血圧", care_plan_goal: "下肢の浮腫チェック。水分管理 (1日1200ml程度)。", dr_instructions: "利尿剤の継続。体重増加時は連絡。", next_clinic_date: "2026-10-07", care_expiry_date: "2026-10-25", deposit_balance: 28000 },
        { id: 3, name: "鈴木 一郎", room_no: "103", care_level: "要介護3", status: "在所", birth_date: "1935-02-15", policy_stamp: "看取り", sensor_alert: "⚠️ 離床・転倒防止センサーマット (ベッド脇・端座位見守り)", emergency_contact: "妻: 鈴木 和子 (090-5555-6666)", family_wishes: "できるだけ居室で静かに休ませてあげてください。", life_history: "元農業。穏やかな性格。家族思い。", paralysis: "左片麻痺 (端座位保持可・移乗軽介助)", allergies: "そばアレルギー", diet_type: "極小刻み (とろみ中)", oral_state: "残歯のみ", diseases: "パーキンソン病, 嚥下障害, 誤嚥性肺炎既往", care_plan_goal: "ベッド上での安定した端座位保持を活かし、介助による車椅子移乗・離床機会の確保。残存機能の維持と誤嚥予防。", dr_instructions: "抗パーキンソン薬の定時内服厳守。", next_clinic_date: "2026-10-20", care_expiry_date: "2027-04-30", deposit_balance: 42000 },
        { id: 4, name: "高橋 トメ", room_no: "105", care_level: "要介護1", status: "入院中", birth_date: "1942-08-01", policy_stamp: "緊急搬送", sensor_alert: "特記なし", emergency_contact: "長男: 高橋 健 (090-7777-8888)", family_wishes: "退院時期が決まったらすぐ連絡します。", life_history: "元商店経営。明るく社交的。", paralysis: "麻痺なし", allergies: "なし", diet_type: "普通食", oral_state: "総義歯", diseases: "骨粗鬆症", care_plan_goal: "転倒予防の見守り。", dr_instructions: "大腿骨経過観察中。", next_clinic_date: "2026-10-10", care_expiry_date: "2027-01-15", deposit_balance: 15000 }
      ],
      stamps: [
        { name: "施設長", role: "管理者" },
        { name: "山田", role: "介護リーダー" },
        { name: "鈴木", role: "看護師" },
        { name: "佐藤", role: "介護職員" },
        { name: "田中", role: "事務員" }
      ],
      templates: [
        { category: "巡視", label: "安眠中", phrase: "訪室確認。安眠中。呼吸状態安定。" },
        { category: "巡視", label: "左側臥位", phrase: "確認のため訪室。左側臥位にて入眠中。" },
        { category: "巡視", label: "ナースコール対応", phrase: "ナースコールあり訪室。排泄介助実施。" },
        { category: "食事", label: "全量摂取", phrase: "主食・副食ともに全量摂取。むせ込みなし。" },
        { category: "排泄", label: "普通便中量", phrase: "トイレ誘導にて排尿あり。普通便中等量排便あり。" },
        { category: "入浴", label: "軟膏塗布", phrase: "一般浴実施。背部・両下腿に保湿軟膏塗布。皮膚状態異常なし。" }
      ],
      suppliers: [
        { id: 1, name: "ケアサポート商事", phone: "03-1234-5678", contact_person: "佐々木", items: [
          { name: "テープ止めオムツ L", unit_price: 2600, unit: "パック" },
          { name: "テープ止めオムツ M", unit_price: 2400, unit: "パック" },
          { name: "尿取りパッド 4回分", unit_price: 1400, unit: "パック" },
          { name: "使い捨てプラスチック手袋 M", unit_price: 650, unit: "箱" }
        ]},
        { id: 2, name: "メディカル薬品", phone: "03-9876-5432", contact_person: "木村", items: [
          { name: "ヒルドイドソフト軟膏 100g", unit_price: 1800, unit: "本" },
          { name: "手指消毒用アルコール 1L", unit_price: 1200, unit: "本" },
          { name: "とろみ調整剤 1kg", unit_price: 2800, unit: "袋" }
        ]}
      ],
      inventory: [
        { id: 1, name: "テープ止めオムツ L", category: "オムツ・パッド", current_stock: 2, safety_stock: 5, unit: "パック", unit_price: 2600, is_personal_billable: 1, supplier_id: 1, supplier_name: "ケアサポート商事" },
        { id: 2, name: "テープ止めオムツ M", category: "オムツ・パッド", current_stock: 8, safety_stock: 5, unit: "パック", unit_price: 2400, is_personal_billable: 1, supplier_id: 1, supplier_name: "ケアサポート商事" },
        { id: 3, name: "尿取りパッド 4回分", category: "オムツ・パッド", current_stock: 3, safety_stock: 6, unit: "パック", unit_price: 1400, is_personal_billable: 1, supplier_id: 1, supplier_name: "ケアサポート商事" },
        { id: 4, name: "使い捨てプラスチック手袋 M", category: "衛生用品", current_stock: 15, safety_stock: 10, unit: "箱", unit_price: 650, is_personal_billable: 0, supplier_id: 1, supplier_name: "ケアサポート商事" },
        { id: 5, name: "手指消毒用アルコール 1L", category: "消毒", current_stock: 4, safety_stock: 3, unit: "本", unit_price: 1200, is_personal_billable: 0, supplier_id: 2, supplier_name: "メディカル薬品" },
        { id: 6, name: "とろみ調整剤 1kg", category: "食事関連", current_stock: 6, safety_stock: 4, unit: "袋", unit_price: 2800, is_personal_billable: 1, supplier_id: 2, supplier_name: "メディカル薬品" }
      ],
      emergency_supplies: [
        { id: 1, name: "保存水 2L (6本入)", quantity: 30, unit: "箱", expiry_date: "2028-09-30", notes: "地下備蓄庫" },
        { id: 2, name: "アルファ米 白飯 50食", quantity: 10, unit: "箱", expiry_date: "2026-10-10", notes: "賞味期限間近・おやつ等で順次消費推奨" },
        { id: 3, name: "缶詰パン チョコ味", quantity: 40, unit: "缶", expiry_date: "2027-03-31", notes: "1階備蓄庫" }
      ],
      belongings: [
        { id: 1, resident_id: 1, category: "衣類・日用品", item_name: "長袖シャツ", quantity: "5枚", marked: 1, notes: "全品記名あり" },
        { id: 2, resident_id: 1, category: "衣類・日用品", item_name: "ズボン", quantity: "4本", marked: 1, notes: "ウエストゴム" },
        { id: 3, resident_id: 1, category: "家具・家電・私物", item_name: "液晶テレビ 24型", quantity: "1台", marked: 1, notes: "居室テレビ台設置" },
        { id: 4, resident_id: 2, category: "衣類・日用品", item_name: "カーディガン", quantity: "3着", marked: 1, notes: "娘様持参品" }
      ],
      equipments: [
        { id: 1, resident_id: 1, equipment_name: "標準自走式車椅子", ownership_type: "施設備品", notes: "ノーパンクタイヤ" },
        { id: 2, resident_id: 1, equipment_name: "エアマット (ここちあ)", ownership_type: "個人レンタル", notes: "床ずれ防止用・介護保険レンタル" },
        { id: 3, resident_id: 2, equipment_name: "歩行器 (四輪)", ownership_type: "施設備品", notes: "歩行訓練用" }
      ],
      recreations: [
        { id: 1, date: "2026-09-28", title: "風船バレー大会", content: "1階食堂にて開催。参加12名。大いに盛り上がる。", staff_name: "山田" },
        { id: 2, date: "2026-09-29", title: "秋の歌 音楽療法", content: "紅葉、赤とんぼ等の合唱。鈴やカスタネット演奏。", staff_name: "佐藤" }
      ],
      vehicle_logs: [
        { id: 1, date: "2026-09-29", vehicle_name: "キャラバン1号", driver_name: "山田", purpose: "佐藤様・田中様 眼科受診送迎", start_km: 14520, end_km: 14535, distance_km: 15, key_returned: 1, notes: "給油なし・異常なし" }
      ],
      fire_drills: [
        { id: 1, date: "2026-05-20", drill_type: "昼間想定 避難・消火訓練", participants_count: 14, scenario: "1階厨房からの出火想定。全員避難完了タイム4分12秒。", notes: "消火器放射訓練実施。", supervisor: "施設長" }
      ],
      committees: [
        { id: 1, date: "2026-09-15", committee_name: "身体拘束廃止委員会", attendees: "施設長、山田、鈴木、田中", agenda: "スピーチロックの防止とセンサーマット適切な使用", content: "不要な拘束ゼロの継続確認。各ケース検討。" }
      ],
      care_records: [
        { id: 1, recorded_at: nowStr, resident_id: 1, category: "バイタル", content: "体温 37.8度。少し悪寒の訴えあり。水分補給を促しクーリング実施。", staff_name: "山田" },
        { id: 2, recorded_at: nowStr, resident_id: 2, category: "特変", content: "居室にて立ち上がり時にふらつきあり。転倒はなし。見守りを強化。", staff_name: "佐藤" }
      ],
      notebooks: [
        { id: 1, date: todayStr, category: "特変申し送り", content: "佐藤様 14:00頃 体温37.8度の発熱あり。夕方の検温と水分摂取に要留意。", status: "未対応", staff_name: "山田", resolved_staff: null },
        { id: 2, date: todayStr, category: "依頼事項", content: "田中様のご家族より面会時に靴下の差し入れ預かり。居室へ保管済。", status: "完了", staff_name: "佐藤", resolved_staff: "佐藤" }
      ],
      notebook_stamps: [
        { date: todayStr, staff_name: "山田" }
      ],
      vitals: [],
      excretions: [],
      meals: [],
      oral_cares: [],
      baths: [],
      meds: [],
      turns: [],
      linens: [],
      groomings: [],
      weight_records: [
        { id: 101, date: "2026-08-15", month: "2026-08", resident_id: 1, weight: 52.2, diff_prev: "+0.1kg", staff_name: "山田" },
        { id: 102, date: "2026-08-15", month: "2026-08", resident_id: 2, weight: 46.0, diff_prev: "-0.2kg", staff_name: "佐藤" },
        { id: 103, date: "2026-08-15", month: "2026-08", resident_id: 3, weight: 58.5, diff_prev: "±0.0kg", staff_name: "鈴木" },
        { id: 104, date: "2026-08-15", month: "2026-08", resident_id: 4, weight: 43.8, diff_prev: "-0.4kg", staff_name: "山田" }
      ],
      visitations: [],
      inventory_logs: [],
      consumptions: [],
      orders: [],
      deposits: [],
      complaints: [],
      incidents: []
    };
    localStorage.setItem(this.key, JSON.stringify(seed));
    return seed;
  }
}

// データベースインスタンスの生成
const db = new LocalDB();

// グローバル状態
let gState = {
  residents: db.data.residents,
  inventory: db.data.inventory,
  suppliers: db.data.suppliers,
  stamps: db.data.stamps,
  templates: db.data.templates,
  recreations: db.data.recreations,
  emergencySupplies: db.data.emergency_supplies,
  selectedResidentId: 1,
  selectedDate: new Date().toISOString().split("T")[0],
  currentMonth: new Date().toISOString().slice(0, 7),
  activePortal: "care",
  activeCareTab: "record",
  activeOfficeTab: "inventory",
  recordScope: "today"
};

// 病歴ガイド辞書
const DISEASE_GUIDE = {
  "糖尿病": {
    symptoms: "高血糖時：口渇、多尿、倦怠感、意識障害。低血糖時：冷や汗、動悸、手指の震え、脱力感、ふらつき、あくび。",
    care_points: "食事の摂取時間と摂取量の厳守。足の血流障害や壊疽に注意し、入浴時に足先の傷や爪白癬をチェックする。",
    emergency: "冷や汗・手指の震え・意識混濁などの低血糖発作時は、直ちにブドウ糖（または砂糖水・ジュース）を飲ませ、看護師・医師へ連絡。"
  },
  "心不全": {
    symptoms: "息切れ、呼吸苦（起座呼吸）、動悸、下肢の浮腫、急激な体重増加、倦怠感。",
    care_points: "毎日の体重測定（1週間で2kg以上増えていないか）、下肢のむくみチェック。過剰な水分摂取や塩分摂取に注意。",
    emergency: "安静時にも激しい息切れがある、ゼーゼーした呼吸、ピンク色の泡状の痰が出る場合は急性心不全の疑い。座位を保ち直ちに救急要請または往診医へ連絡。"
  },
  "高血圧": {
    symptoms: "頭痛、めまい、肩こり、のぼせ。自覚症状がないことも多い。",
    care_points: "入浴時・排便時の急激な血圧変動（ヒートショック）に注意。脱衣所や浴室の温度差をなくし、排便時のいきみすぎを予防。",
    emergency: "収縮期血圧180以上で激しい頭痛、嘔吐、麻痺、ろれつが回らない症状がある場合は脳血管障害の疑い。直ちに安静にして救急対応。"
  },
  "誤嚥性肺炎": {
    symptoms: "発熱、湿性咳嗽、食欲低下、食事中の激しいむせ、痰の増加、呼吸促迫、元気がない（活気低下）。",
    care_points: "食事中の姿勢（軽度前傾・顎引き）、食形態（きざみ・とろみ）の徹底。一口量を少なくしペースを守る。食後30分は横にならず座位を保持する。食後の口腔ケアと義歯洗浄を徹底。",
    emergency: "38度以上の発熱、呼吸数24回/分以上、SpO2低下（90%以下）、喘鳴が続く場合は直ちに医師へ報告。"
  },
  "誤嚥性肺炎既往": {
    symptoms: "過去に誤嚥性肺炎の罹患歴あり。活気低下、微熱、食事摂取量の低下などの初期徴候に留意。",
    care_points: "再発予防が最重要。食後の丁寧な口腔ケア・義歯清掃、毎食後の座位保持（30分〜1時間）、喀痰吸引の準備。",
    emergency: "37.5℃以上の発熱、SpO2低下、痰の増加が見られた場合は初期段階で看護師・往診医へ報告。"
  },
  "嚥下障害": {
    symptoms: "食事中のむせ、湿性嗄声（ガラガラ声）、口腔内への食物残留、飲み込みの遅れ、食欲低下。",
    care_points: "食事形態の厳守（刻み食・とろみ調整）。一口量を適量にし、交互嚥下（固形物と水分）を促す。食後30分は座位保持を徹底。",
    emergency: "食物の気道閉塞（チョークサイン、チアノーゼ、声が出ない）時は直ちに背部叩打法またはハイムリック法を実施し救急要請。"
  },
  "脳梗塞後遺症": {
    symptoms: "片麻痺、構音障害（ろれつ不良）、嚥下障害、感覚鈍麻、感情失禁、半側空間無視。",
    care_points: "麻痺側からの転倒・ずり落ち防止。健側からのアプローチ・食事介助。拘縮予防のための良肢位保持と定期的な体位変換。",
    emergency: "麻痺の急激な悪化、意識障害、左右の瞳孔不同、激しい嘔吐は再発の疑い。直ちに救急搬送。"
  },
  "パーキンソン病": {
    symptoms: "安静時振戦（手の震え）、筋固縮、無動（動作緩慢）、姿勢反射障害（小刻み歩行、突進現象、すくみ足）。",
    care_points: "内服時間を厳守する。歩行時の転倒リスクが極めて高いため見守り・付き添い徹底。すくみ足にはリズミカルな声かけや視覚刺激が有効。",
    emergency: "抗パーキンソン薬の急な中断や脱水による「悪性症候群」（高熱、意識混濁、著しい筋固縮）に注意。"
  },
  "骨粗鬆症": {
    symptoms: "骨脆弱化。軽微な衝撃や転倒での大腿骨頚部骨折、圧迫骨折。",
    care_points: "転倒予防が最優先。車椅子への移乗介助時やオムツ交換時の無理な引っ張り・捻りを避ける。履物はかかとのある靴を使用。",
    emergency: "転倒後に立ち上がれない、股関節や腰背部に激痛を訴える場合は骨折の疑い。患部を動かさず医師へ連絡。"
  }
};

function editFacilityName() {
  const currentName = (db && db.data && db.data.facility_name) ? db.data.facility_name : "陽だまりの家";
  const newName = prompt("施設名・事業所名を入力してください:", currentName);
  if (newName !== null) {
    const trimmed = newName.trim();
    if (trimmed !== "" && trimmed !== currentName) {
      if (!db.data) db.data = {};
      db.data.facility_name = trimmed;
      updateFacilityNameUI();
      db.saveToServer();
      alert("施設名を「" + trimmed + "」に更新しました。\n（このPCおよび接続しているタブレット・スマホにも自動反映されます）");
    }
  }
}

function updateFacilityNameUI() {
  const name = (db && db.data && db.data.facility_name) ? db.data.facility_name : "陽だまりの家";
  const display = document.getElementById("facilityNameDisplay");
  if (display) display.textContent = name;
  document.title = `${name} 統合業務ポータルシステム`;
}

window.addEventListener("DOMContentLoaded", () => {
  updateFacilityNameUI();
  gState.stamps = sortStaffList(gState.stamps);
  db.data.stamps = gState.stamps;
  db.save();
  renderStaffSelect();
  renderResidentsStrip();
  renderResidentDetail();
  updateRecordTargetBanner();
  updateRecordCharCount();
  renderQuickTemplates();
  renderCalendar();
  loadDateRecords(gState.selectedDate);
  checkGlobalAlerts();
  setupEventListeners();
});

// 職員セレクトボックス (役職・序列順)
function renderStaffSelect() {
  const sel = document.getElementById("currentStaff");
  if (!sel) return;
  const currentVal = sel.value;
  sel.innerHTML = "";

  // 常に役職・序列順（偉い人順）で整列
  gState.stamps = sortStaffList(gState.stamps);
  gState.stamps.forEach(s => {
    const opt = document.createElement("option");
    opt.value = s.name;
    opt.textContent = `${s.name} (${s.role || "職員"})`;
    sel.appendChild(opt);
  });

  if (currentVal && gState.stamps.some(s => s.name === currentVal)) {
    sel.value = currentVal;
  }
}

function onCurrentStaffChange() {
  renderNotebook();
}

// アラート監視（前月誕生日・非常食2週前・在庫補充・受診2週1週前・要介護期限）
function checkGlobalAlerts() {
  const container = document.getElementById("alertsContainer");
  container.innerHTML = "";
  const today = new Date();

  // 1. 【前月誕生日事前アラート】
  const nextMonthNum = (today.getMonth() + 1) % 12 + 1;
  const nextMonthBirthdays = [];
  gState.residents.forEach(r => {
    if (r.birth_date && typeof r.birth_date === 'string' && r.birth_date.includes("-")) {
      const parts = r.birth_date.split("-");
      if (parts.length >= 2) {
        const birthMonth = parseInt(parts[1], 10);
        if (birthMonth === nextMonthNum) {
          nextMonthBirthdays.push({ name: r.name, room: r.room_no, date: r.birth_date.slice(5) });
        }
      }
    }
  });
  if (nextMonthBirthdays.length > 0) {
    const list = nextMonthBirthdays.map(b => `${b.room}号室 ${b.name} 様 (${b.date})`).join(", ");
    container.innerHTML += `
      <div class="alert-banner alert-info" style="background:#e0e7ff; color:#3730a3; border-left:5px solid #6366f1;">
        <span>🎂 【来月お誕生日事前アラート】来月(${nextMonthNum}月)お誕生日の利用者様：${list} 〜プレゼントや色紙等の準備を行ってください〜</span>
      </div>
    `;
  }

  // 2. 【非常食・防災備蓄 賞味期限2週間前アラート】
  gState.emergencySupplies.forEach(item => {
    if (item.expiry_date) {
      const expDate = new Date(item.expiry_date);
      const diffDays = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));
      if (diffDays > 0 && diffDays <= 14) {
        container.innerHTML += `
          <div class="alert-banner alert-warning">
            <span>🥫 【非常食・備蓄品 賞味期限間近】『${item.name}』の賞味期限まであと${diffDays}日 (${item.expiry_date}) 〜消費・入れ替えを行ってください〜</span>
          </div>
        `;
      }
    }
  });

  // 3. 在庫補充アラート
  const lowStockItems = gState.inventory.filter(i => i.current_stock <= i.safety_stock);
  if (lowStockItems.length > 0) {
    const names = lowStockItems.map(i => `${i.name} (残${i.current_stock}${i.unit}/基準${i.safety_stock})`).join(", ");
    container.innerHTML += `
      <div class="alert-banner alert-danger">
        <span>⚠️ 【要発注アラート】以下の消耗品の補充が必要です：${names}</span>
        <button class="btn btn-secondary" style="padding:2px 8px; font-size:12px;" onclick="switchPortal('office'); switchOfficeTab('orders'); openOrderModal();">発注申請へ</button>
      </div>
    `;
  }

  // 4. 受診2週前・1週前事前告知
  gState.residents.forEach(r => {
    if (r.next_clinic_date) {
      const clinicDate = new Date(r.next_clinic_date);
      const diffDays = Math.ceil((clinicDate - today) / (1000 * 60 * 60 * 24));
      if (diffDays > 0 && diffDays <= 14) {
        const alertType = diffDays <= 7 ? "alert-danger" : "alert-warning";
        const tag = diffDays <= 7 ? "【1週間前】" : "【2週間前】";
        container.innerHTML += `
          <div class="alert-banner ${alertType}">
            <span>🏥 ${tag} ${r.name}様 次回受診・往診日: ${r.next_clinic_date} (あと${diffDays}日) - 残薬確認・指示受け準備</span>
          </div>
        `;
      }
    }
  });

  // 5. 要介護認定有効期限 (満了60日以内)
  const expiringResidents = [];
  gState.residents.forEach(r => {
    if (r.care_expiry_date) {
      const expiryDate = new Date(r.care_expiry_date);
      const diffDays = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
      if (diffDays > 0 && diffDays <= 60) {
        expiringResidents.push({ name: r.name, level: r.care_level, date: r.care_expiry_date, days: diffDays });
      }
    }
  });
  if (expiringResidents.length > 0) {
    const list = expiringResidents.map(e => `${e.name}様 (${e.level}, 期限:${e.date}, あと${e.days}日)`).join(" / ");
    container.innerHTML += `
      <div class="alert-banner alert-warning">
        <span>📋 【要介護認定更新アラート】更新申請の手続きが必要です：${list}</span>
      </div>
    `;
  }
}

// ポータル切り替え
function switchPortal(portal) {
  gState.activePortal = portal;
  document.getElementById("btnNavCare").classList.toggle("active", portal === "care");
  document.getElementById("btnNavOffice").classList.toggle("active", portal === "office");
  document.getElementById("portalCareSection").style.display = portal === "care" ? "block" : "none";
  document.getElementById("portalOfficeSection").style.display = portal === "office" ? "block" : "none";

  if (portal === "office") {
    loadOfficeData();
  }
}

// 介護サブタブ切り替え
function switchCareTab(tab) {
  gState.activeCareTab = tab;
  const tabs = document.querySelectorAll("#portalCareSection .sub-tab-btn");
  tabs.forEach(btn => {
    btn.classList.remove("active");
    const oc = btn.getAttribute("onclick") || "";
    if (oc.includes(`'${tab}'`) || oc.includes(`"${tab}"`)) {
      btn.classList.add("active");
    }
  });

  const tabMap = {
    record: "tabCareRecord", daily_journal: "tabCareDailyJournal", vitals: "tabCareVitals", excretion: "tabCareExcretion",
    meal: "tabCareMeal", bath: "tabCareBath", oral: "tabCareOral", med: "tabCareMed",
    night: "tabCareNight", weight: "tabCareWeight", linen: "tabCareLinen",
    grooming: "tabCareGrooming", visit: "tabCareVisit", recreation: "tabCareRecreation",
    notebook: "tabCareNotebook", consume: "tabCareConsume"
  };

  Object.values(tabMap).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });
  const target = document.getElementById(tabMap[tab]);
  if (target) target.style.display = "block";

  if (tab === "record") renderSelectedDateRecords();
  if (tab === "daily_journal") renderDailyJournal();
  if (tab === "vitals") renderVitalsTable();
  if (tab === "excretion") renderExcretionTable();
  if (tab === "meal") renderMealsTable();
  if (tab === "bath") renderBathTable();
  if (tab === "oral") renderOralTable();
  if (tab === "med") renderMedTable();
  if (tab === "night") renderNightTable();
  if (tab === "weight") renderWeightTable();
  if (tab === "linen") renderLinenTable();
  if (tab === "grooming") renderGroomingTable();
  if (tab === "recreation") renderRecreationTable();
  if (tab === "consume") renderQuickConsume();
}

// カレンダー描画 (記録がある日に●印)
function renderCalendar() {
  const monthLabel = document.getElementById("calCurrentMonthLabel");
  const [year, month] = gState.currentMonth.split("-");
  if (monthLabel) monthLabel.textContent = `${year}年${parseInt(month)}月`;

  const recordedDates = new Set();
  (db.data.care_records || []).forEach(r => {
    const d = r.recorded_at || r.record_time;
    if (d && typeof d === 'string') recordedDates.add(d.slice(0, 10));
  });
  (db.data.vitals || []).forEach(r => { if (r.date) recordedDates.add(r.date); });
  (db.data.excretions || []).forEach(r => { if (r.date) recordedDates.add(r.date); });
  (db.data.meals || []).forEach(r => { if (r.date) recordedDates.add(r.date); });
  (db.data.notebooks || []).forEach(r => { if (r.date) recordedDates.add(r.date); });

  const daysRow = document.getElementById("calDaysRow");
  if (!daysRow) return;
  daysRow.innerHTML = "";
  const daysInMonth = new Date(year, month, 0).getDate();
  const weekDays = ["日", "月", "火", "水", "木", "金", "土"];

  for (let d = 1; d <= daysInMonth; d++) {
    const dayStr = String(d).padStart(2, "0");
    const fullDate = `${year}-${month}-${dayStr}`;
    const dateObj = new Date(year, month - 1, d);
    const w = weekDays[dateObj.getDay()];

    const cell = document.createElement("div");
    cell.className = `cal-day-cell ${fullDate === gState.selectedDate ? "selected" : ""}`;
    if (recordedDates.has(fullDate)) {
      cell.classList.add("has-record");
    }
    cell.onclick = () => selectDate(fullDate);

    cell.innerHTML = `
      <div class="day-num">${d}</div>
      <div class="day-week">${w}</div>
    `;
    daysRow.appendChild(cell);
  }
}

function changeMonth(offset) {
  const [y, m] = gState.currentMonth.split("-").map(Number);
  const newDate = new Date(y, m - 1 + offset, 1);
  gState.currentMonth = `${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, "0")}`;
  selectDate(`${gState.currentMonth}-01`);
  if (gState.activeCareTab === "weight") renderWeightTable();
}

function selectDate(dt) {
  gState.selectedDate = dt;
  renderCalendar();
  loadDateRecords(dt);
  const depDateInput = document.getElementById("depDate");
  if (depDateInput) {
    depDateInput.value = dt;
  }
}

function loadDateRecords(dt) {
  renderSelectedDateRecords();
  renderNotebook();
  if (gState.activeCareTab === "daily_journal") renderDailyJournal();
  if (gState.activeCareTab === "vitals") renderVitalsTable();
  if (gState.activeCareTab === "excretion") renderExcretionTable();
  if (gState.activeCareTab === "meal") renderMealsTable();
  if (gState.activeCareTab === "bath") renderBathTable();
  if (gState.activeCareTab === "oral") renderOralTable();
  if (gState.activeCareTab === "med") renderMedTable();
  if (gState.activeCareTab === "night") renderNightTable();
  if (gState.activeCareTab === "weight") renderWeightTable();
  if (gState.activeCareTab === "linen") renderLinenTable();
  if (gState.activeCareTab === "grooming") renderGroomingTable();
  if (gState.activeCareTab === "recreation") renderRecreationTable();
  if (gState.activeCareTab === "consume") renderQuickConsume();
}

// 利用者カード一覧
function renderResidentsStrip() {
  const strip = document.getElementById("residentsStrip");
  strip.innerHTML = "";
  const countLabel = document.getElementById("residentCountLabel");
  if (countLabel) countLabel.textContent = `登録利用者: ${gState.residents.length}名`;

  gState.residents.forEach(r => {
    const card = document.createElement("div");
    card.className = `resident-card ${r.id === gState.selectedResidentId ? "selected" : ""} ${r.status !== "在所" ? "inactive" : ""}`;
    card.onclick = () => selectResident(r.id);

    card.innerHTML = `
      <div class="card-top">
        <span class="room-badge">${r.room_no}号室</span>
      </div>
      <div class="res-name">${r.name} 様</div>
      <div class="res-meta">${r.care_level} | ${r.status}</div>
      ${r.sensor_alert ? `<div style="font-size:11px; color:#dc2626; font-weight:bold; margin-top:2px;">${r.sensor_alert}</div>` : ''}
    `;
    strip.appendChild(card);
  });
}

function selectResident(id) {
  gState.selectedResidentId = id;
  renderResidentsStrip();
  renderResidentDetail();
  updateRecordTargetBanner();
  renderSelectedDateRecords();
  if (gState.activeCareTab === "consume") renderQuickConsume();
  if (gState.activeCareTab === "linen") renderLinenTable();
  renderOfficeDepositTable();
}

// 利用者カルテ (フェイスシート・病歴ガイド・看取りスタンプ・見守り注意・私物行追加・備品・スクショ保管)
function renderResidentDetail() {
  const r = gState.residents.find(x => x.id === gState.selectedResidentId);
  const container = document.getElementById("residentDetailCard");
  if (!r) {
    container.innerHTML = "<p>利用者を選択してください</p>";
    return;
  }

  const stampClass = r.policy_stamp === "看取り" ? "policy-mitori" : "policy-kyukyu";
  const diseasesList = (r.diseases || "").split(",").map(d => d.trim()).filter(Boolean);
  const diseaseTags = diseasesList.map(d => `
    <span class="disease-tag" onclick="openDiseaseGuide('${d}')">🩺 ${d}</span>
  `).join("");

  // 私物行リスト
  const belongings = (db.data.belongings || []).filter(b => b.resident_id === r.id);
  let belongingsHtml = belongings.map(b => `
    <tr style="font-size:12px;">
      <td>${b.category}</td>
      <td><strong>${b.item_name}</strong></td>
      <td><span style="color:#0284c7; font-weight:bold;">${b.quantity}</span></td>
      <td>${b.marked ? '✓ 記名済' : '未確認'}</td>
      <td>${b.notes || '-'}</td>
    </tr>
  `).join("");

  // 備品リスト
  const equipments = (db.data.equipments || []).filter(eq => eq.resident_id === r.id);
  let equipmentsHtml = equipments.map(eq => `
    <span class="badge" style="background:#e0f2fe; color:#0369a1; padding:3px 8px; font-size:12px; margin-right:4px;">
      ${eq.equipment_name} (${eq.ownership_type})
    </span>
  `).join("");

  // 写真・重要書類件数
  const resDocs = (db.data.photos || []).filter(p => p.resident_id === r.id && p.category === 'documents');
  const resPhotos = (db.data.photos || []).filter(p => p.resident_id === r.id && p.category === 'personal');

  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
      <div>
        <span class="room-badge" style="font-size:13px;">${r.room_no}号室</span>
        <h2 style="font-size:20px; font-weight:bold; margin-top:4px;">${r.name} 様</h2>
        <span style="font-size:13px; color:var(--text-muted);">${r.care_level} / 生年月日: ${r.birth_date || "-"}</span>
      </div>
      <div style="text-align:right;">
        <div class="policy-stamp ${stampClass}" style="font-size:14px; padding:4px 10px;">［ ${r.policy_stamp} ］</div>
        <div style="margin-top:6px; display:flex; gap:6px; justify-content:flex-end;">
          <select class="form-control" style="font-size:12px; padding:3px 6px;" onchange="updateResidentStatus(${r.id}, this.value)">
            <option value="在所" ${r.status==='在所'?'selected':''}>在所</option>
            <option value="入院中" ${r.status==='入院中'?'selected':''}>入院中</option>
            <option value="外泊中" ${r.status==='外泊中'?'selected':''}>外泊中</option>
          </select>
          <button class="btn btn-secondary" style="font-size:12px; padding:3px 8px;" onclick="openEditResidentModal(${r.id})">✏️ 編集</button>
        </div>
      </div>
    </div>

    <!-- 見守り注意書きバッジ (新規スタッフ・夜勤転倒防止) -->
    ${r.sensor_alert ? `
      <div style="background:#fee2e2; border-left:4px solid #ef4444; padding:8px 12px; border-radius:6px; margin-bottom:12px; font-weight:bold; color:#991b1b; font-size:13px;">
        ${r.sensor_alert}
      </div>
    ` : ''}

    <!-- ケアマネのケアプラン目標 -->
    <div style="background:#f0fdf4; border-left:4px solid #16a34a; padding:10px; border-radius:6px; margin-bottom:12px;">
      <div style="font-size:12px; font-weight:bold; color:#15803d;">🎯 ケアプラン目標・注意事項:</div>
      <div style="font-size:13px; margin-top:2px;">${r.care_plan_goal || "安全な日常生活の維持・転倒予防"}</div>
    </div>

    <!-- 病歴ガイド -->
    <div style="margin-bottom:12px;">
      <div style="font-size:12px; font-weight:bold; color:var(--text-muted); margin-bottom:4px;">病歴・既往歴 (タップで症状ガイド表示):</div>
      <div>${diseaseTags || '<span style="font-size:13px; color:var(--text-muted);">特記事項なし</span>'}</div>
    </div>

    <!-- 身体状況・アレルギー・食形態・口腔状態 -->
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:13px; margin-bottom:12px; background:#f8fafc; padding:10px; border-radius:6px;">
      <div><strong>身体・麻痺:</strong> ${r.paralysis || "特記なし"}</div>
      <div><strong>アレルギー:</strong> <span style="color:#dc2626; font-weight:bold;">${r.allergies || "なし"}</span></div>
      <div><strong>食形態:</strong> ${r.diet_type || "普通食"}</div>
      <div><strong>口腔状態:</strong> ${r.oral_state || "残歯のみ"}</div>
    </div>

    <!-- 備品・福祉用具 (施設備品/個人レンタル/個人購入) -->
    <div style="margin-bottom:12px; font-size:13px;">
      <strong>🦼 使用福祉用具・備品:</strong>
      <div style="margin-top:4px;">${equipmentsHtml || '<span style="color:var(--text-muted);">登録なし</span>'}</div>
    </div>

    <!-- 私物・持ち込み品管理 (品名と個数の行追加テーブル) -->
    <div style="margin-bottom:12px; border:1px solid #e2e8f0; border-radius:8px; padding:10px; background:white;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
        <strong style="font-size:13px;">🧳 私物・持ち込み品台帳 (物と個数):</strong>
        <button class="btn btn-secondary" style="padding:2px 8px; font-size:11px;" onclick="openBelongingModal()">＋私物行を追加</button>
      </div>
      <table class="data-table" style="font-size:12px; margin-top:4px;">
        <thead>
          <tr><th>区分</th><th>品名(物)</th><th>個数</th><th>記名</th><th>備考</th></tr>
        </thead>
        <tbody>
          ${belongingsHtml || '<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">登録なし</td></tr>'}
        </tbody>
      </table>
    </div>

    <!-- 同意書・写真スクショ保管 -->
    <div style="margin-bottom:12px; border:1px solid #cbd5e1; border-radius:8px; padding:10px; background:#f8fafc;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; flex-wrap:wrap; gap:4px;">
        <strong style="font-size:13px; color:#1e3a8a;">📁 同意書 ＆ 写真スクショ保管庫:</strong>
        <span style="font-size:11px; color:#64748b;">タップで画像一覧・拡大表示・追加</span>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button class="btn btn-secondary" style="font-size:12px; padding:6px 12px; display:inline-flex; align-items:center; gap:6px;" onclick="openPhotoModal('documents')">
          📜 重要書類(同意書)
          <span style="background:#2563eb; color:white; border-radius:10px; padding:1px 7px; font-size:11px; font-weight:bold;">${resDocs.length}件</span>
        </button>
        <button class="btn btn-secondary" style="font-size:12px; padding:6px 12px; display:inline-flex; align-items:center; gap:6px;" onclick="openPhotoModal('personal')">
          📷 個人写真
          <span style="background:#10b981; color:white; border-radius:10px; padding:1px 7px; font-size:11px; font-weight:bold;">${resPhotos.length}件</span>
        </button>
      </div>
    </div>

    <!-- 往診医・受診時指示 -->
    <div style="background:#eff6ff; border-left:4px solid #2563eb; padding:10px; border-radius:6px; margin-bottom:12px;">
      <div style="font-size:12px; font-weight:bold; color:#1e40af;">🩺 往診医・受診時指示:</div>
      <div style="font-size:13px; margin-top:2px;">${r.dr_instructions || "定期採血・血圧コントロール"}</div>
      <div style="font-size:11px; color:#60a5fa; margin-top:4px;">次回予定日: ${r.next_clinic_date || "-"}</div>
    </div>

    <!-- 緊急連絡先 ＆ 家族の要望 -->
    <div style="font-size:13px; margin-bottom:12px;">
      <div><strong>📞 緊急連絡先:</strong> ${r.emergency_contact || "未登録"}</div>
      <div style="margin-top:4px;"><strong>👪 家族の要望:</strong> ${r.family_wishes || "特になし"}</div>
    </div>

    <!-- 生活歴・人生歴 -->
    <div style="font-size:12px; background:#fffbeb; border:1px solid #fef3c7; padding:8px; border-radius:6px;">
      <strong>📖 生活歴・人生歴・こだわり:</strong>
      <p style="margin-top:2px; color:#78350f;">${r.life_history || "穏やかな生活を好まれる。"}</p>
    </div>
  `;
}

// 病歴ガイド モーダル
function openDiseaseGuide(diseaseName) {
  const guide = DISEASE_GUIDE[diseaseName] || {
    symptoms: "日々のバイタル・顔色・呼吸状態を観察してください。",
    care_points: "無理のない動作介助、水分補給、規則正しい生活リズムの維持。",
    emergency: "意識障害、激しい痛み、高熱時は直ちに看護師または医師へ連絡。"
  };

  document.getElementById("diseaseModalTitle").textContent = `🩺 【${diseaseName}】 詳しい症状 ＆ 介護上の観察ポイント`;
  document.getElementById("diseaseModalContent").innerHTML = `
    <div style="margin-bottom:14px;">
      <h4 style="font-size:14px; color:#b91c1c; font-weight:bold;">🔍 主な症状・観察サイン:</h4>
      <p style="font-size:14px; margin-top:4px; line-height:1.6;">${guide.symptoms}</p>
    </div>
    <div style="margin-bottom:14px;">
      <h4 style="font-size:14px; color:#1e40af; font-weight:bold;">👀 介護時の観察ポイント・ケアの注意点:</h4>
      <p style="font-size:14px; margin-top:4px; line-height:1.6;">${guide.care_points}</p>
    </div>
    <div style="background:#fee2e2; border-left:4px solid #dc2626; padding:10px; border-radius:6px;">
      <h4 style="font-size:14px; color:#991b1b; font-weight:bold;">🚨 急変時の対応・注意点:</h4>
      <p style="font-size:13px; margin-top:4px; line-height:1.5;">${guide.emergency}</p>
    </div>
  `;

  document.getElementById("btnSearchDiseaseRecords").onclick = () => {
    closeModal("diseaseModal");
    document.getElementById("searchInput").value = diseaseName;
    doSearch();
  };
  document.getElementById("diseaseModal").style.display = "flex";
}

// 対象利用者バナーの更新
function updateRecordTargetBanner() {
  const bannerText = document.getElementById("recordTargetResidentText");
  const fsBadge = document.getElementById("fsResidentBadge");
  const res = gState.residents.find(x => x.id === gState.selectedResidentId);
  if (res) {
    const str = `✍️ 対象: 【${escapeHtml(res.room_no)}号室 ${escapeHtml(res.name)} 様】の介護記録を作成中`;
    if (bannerText) bannerText.innerHTML = str;
    if (fsBadge) fsBadge.textContent = `${res.room_no}号室 ${res.name} 様`;
  } else {
    if (bannerText) bannerText.textContent = "✍️ 対象利用者: 未選択 (上部一覧から選択してください)";
    if (fsBadge) fsBadge.textContent = "対象: 未選択";
  }
}

// リアルタイム文字数カウンター
function updateRecordCharCount() {
  const area = document.getElementById("recordContent");
  const countEl = document.getElementById("recordCharCount");
  const fsCountEl = document.getElementById("fsCharCount");
  const badgeEl = document.getElementById("recordB5Badge");
  const fsBadgeEl = document.getElementById("fsB5Badge");
  if (!area) return;

  const len = area.value.length;
  if (countEl) countEl.textContent = len;
  if (fsCountEl) fsCountEl.textContent = len;
  if (badgeEl) badgeEl.style.display = "none";
  if (fsBadgeEl) fsBadgeEl.style.display = "none";
}

// 日報・総合記録テンプレートの挿入
function insertB5Template(isFullscreen = false) {
  const targetId = isFullscreen ? "fsRecordContent" : "recordContent";
  const area = document.getElementById(targetId);
  if (!area) return;

  const template =
`【バイタル・全身状態】
体温: 36.5℃ / 血圧: 124/76 / 脈拍: 72 / SpO2: 98%
表情・活気: 顔色良好、活気あり。自覚症状・特段の主訴なし。

【食事・水分摂取】
朝食: 全量摂取 / 昼食: 8割摂取 / 夕食: 全量摂取
水分摂取量計: 約 1,200ml (嚥下良好、むせ・誤嚥傾向なし)

【排泄状況・介助】
日中排尿 4回 / 夜間 1回 / 排便: 1回 (普通便)
定時誘導にて失禁なくスムーズに自力歩行で排泄完了。

【活動・日中のご様子】
午前中はフロアでのラジオ体操およびちぎり絵レクリエーションに参加。他の利用者様と笑顔で談笑され、意欲的に取り組まれる。午後はリビングにて音楽鑑賞をされ穏やかに過ごされる。

【衛生・処置・皮膚状態】
14:00 一般入浴実施。全身清拭、頭髪洗髪完了。皮膚発赤や褥瘡等のトラブルなし。両下肢に保湿剤塗布。

【夜勤・申し送り事項】
21:00 消灯後、中途覚醒なく良眠。巡視時呼吸整、異常なし。
明日予定: 午前中 訪問歯科診療受診予定。`;

  if (area.value.trim().length > 0) {
    if (confirm("すでに入力されている文章があります。末尾に日報雛形を追加しますか？\n（[キャンセル]を押すと上書き確認に移ります）")) {
      area.value = area.value + "\n\n" + template;
    } else {
      if (confirm("現在の内容を消去して日報雛形を上書き挿入しますか？")) {
        area.value = template;
      } else {
        return;
      }
    }
  } else {
    area.value = template;
  }

  // 同期
  if (isFullscreen) {
    const normalArea = document.getElementById("recordContent");
    if (normalArea) normalArea.value = area.value;
  } else {
    const fsArea = document.getElementById("fsRecordContent");
    if (fsArea) fsArea.value = area.value;
  }
  updateRecordCharCount();
}

// 定型文ボタン
function renderQuickTemplates() {
  const container = document.getElementById("quickTemplatesList");
  if (!container) return;
  container.innerHTML = "";
  (gState.templates || []).forEach(t => {
    const btn = document.createElement("button");
    btn.className = "template-btn";
    btn.textContent = `＋ ${t.label}`;
    btn.onclick = () => {
      const area = document.getElementById("recordContent");
      if (area) {
        area.value = (area.value ? area.value + "\n" : "") + t.phrase;
        updateRecordCharCount();
      }
    };
    container.appendChild(btn);
  });
}

// 全画面集中エディタ機能
function openFullscreenRecord() {
  updateRecordTargetBanner();
  const area = document.getElementById("recordContent");
  const fsArea = document.getElementById("fsRecordContent");
  if (area && fsArea) {
    fsArea.value = area.value;
  }
  renderFsQuickTemplates();
  updateRecordCharCount();
  const modal = document.getElementById("fullscreenRecordModal");
  if (modal) modal.style.display = "flex";
}

function closeFullscreenRecord() {
  const area = document.getElementById("recordContent");
  const fsArea = document.getElementById("fsRecordContent");
  if (area && fsArea) {
    area.value = fsArea.value;
  }
  updateRecordCharCount();
  const modal = document.getElementById("fullscreenRecordModal");
  if (modal) modal.style.display = "none";
}

function syncFromFullscreen() {
  const area = document.getElementById("recordContent");
  const fsArea = document.getElementById("fsRecordContent");
  if (area && fsArea) {
    area.value = fsArea.value;
  }
  updateRecordCharCount();
}

function renderFsQuickTemplates() {
  const container = document.getElementById("fsQuickTemplatesList");
  if (!container) return;
  container.innerHTML = "";
  (gState.templates || []).forEach(t => {
    const btn = document.createElement("button");
    btn.className = "template-btn";
    btn.textContent = `＋ ${t.label}`;
    btn.onclick = () => {
      const fsArea = document.getElementById("fsRecordContent");
      if (fsArea) {
        fsArea.value = (fsArea.value ? fsArea.value + "\n" : "") + t.phrase;
        syncFromFullscreen();
      }
    };
    container.appendChild(btn);
  });
}

function submitCareRecordFromFullscreen() {
  syncFromFullscreen();
  submitCareRecord();
  // 保存に成功してフォームがクリアされていれば閉じる
  const area = document.getElementById("recordContent");
  if (area && !area.value) {
    const modal = document.getElementById("fullscreenRecordModal");
    if (modal) modal.style.display = "none";
  }
}

function clearRecordForm() {
  if (confirm("記録入力欄をクリアしますか？")) {
    const area = document.getElementById("recordContent");
    const customTime = document.getElementById("recordCustomTime");
    const fsArea = document.getElementById("fsRecordContent");
    if (area) area.value = "";
    if (customTime) customTime.value = "";
    if (fsArea) fsArea.value = "";
    updateRecordCharCount();
  }
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
      btn.textContent = "📅 指定日の記録のみ表示";
      btn.style.background = "#eff6ff";
      btn.style.color = "#1d4ed8";
      btn.style.border = "1px solid #93c5fd";
    } else {
      btn.textContent = "📖 すべての過去履歴を表示";
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

function toggleMonthAccordion(ym) {
  if (gOpenMonthAccordions.has(ym)) {
    gOpenMonthAccordions.delete(ym);
  } else {
    gOpenMonthAccordions.add(ym);
  }
  renderSelectedDateRecords();
}

function filterHistoryMonth(ym) {
  gSelectedHistoryMonth = ym;
  if (ym !== "all") {
    gOpenMonthAccordions.add(ym);
  }
  renderSelectedDateRecords();
}

// 選択中利用者の個別介護記録一覧表示 (個別カルテ・長文対応・年月別アコーディオン)
function renderSelectedDateRecords() {
  const list = document.getElementById("selectedDateRecordsList");
  if (!list) return;
  const titleEl = document.getElementById("selectedDateRecordsTitle");
  const res = gState.residents.find(x => x.id === gState.selectedResidentId);
  const resName = res ? `${res.room_no}号室 ${res.name} 様` : "利用者未指定";

  const isAllScope = gState.recordScope === "all";
  if (titleEl) {
    titleEl.textContent = isAllScope
      ? `👤 【${resName}】の個別カルテ履歴 (年月別アーカイブ)`
      : `👤 【${resName}】の個別介護記録 (${gState.selectedDate})`;
  }
  list.innerHTML = "";

  // 選択中利用者の記録のみに厳密絞り込み
  const allUserRecords = (db.data.care_records || [])
    .filter(r => r.resident_id === gState.selectedResidentId)
    .sort((a, b) => {
      const ta = a.recorded_at || a.record_time || "";
      const tb = b.recorded_at || b.record_time || "";
      return tb.localeCompare(ta); // 新しい順
    });

  const records = isAllScope
    ? allUserRecords
    : allUserRecords.filter(r => {
        const timeStr = r.recorded_at || r.record_time || "";
        return timeStr.startsWith(gState.selectedDate);
      });

  if (records.length === 0) {
    if (!isAllScope && allUserRecords.length > 0) {
      list.innerHTML = `
        <div style="padding:20px; text-align:center; background:#f8fafc; border-radius:6px; border:1px dashed #cbd5e1;">
          <p style="font-size:14px; color:#64748b; margin-bottom:8px;">【${escapeHtml(gState.selectedDate)}】の個別記録はまだ登録されていません。</p>
          <p style="font-size:13px; color:#2563eb; margin-bottom:12px;">（※この利用者様には過去のカルテ記録が計 ${allUserRecords.length} 件あります）</p>
          <button type="button" class="btn btn-secondary" style="font-size:12px; background:#eff6ff; color:#1d4ed8; border:1px solid #93c5fd;" onclick="toggleRecordScope()">
            📖 すべての過去履歴を表示する
          </button>
        </div>
      `;
    } else {
      list.innerHTML = '<p style="font-size:14px; color:var(--text-muted); padding:20px; text-align:center;">この利用者様の介護記録はありません。</p>';
    }
    return;
  }

  // レコード単体の描画ヘルパー関数
  const createRecordItem = (r) => {
    const item = document.createElement("div");
    item.className = "care-record-card";

    let catBadgeStyle = "background:#e0f2fe; color:#0369a1;";
    if (r.category === "特変") catBadgeStyle = "background:#fee2e2; color:#991b1b; font-weight:bold;";
    else if (r.category === "バイタル") catBadgeStyle = "background:#fef3c7; color:#92400e;";
    else if (r.category === "頓服服用") catBadgeStyle = "background:#f3e8ff; color:#6b21a8;";
    else if (r.category === "連絡") catBadgeStyle = "background:#fef9c3; color:#854d0e; font-weight:bold;";

    const timeDisplay = r.recorded_at || r.record_time || "時間未記録";
    const rawContent = r.content || "";
    const charLen = rawContent.length;
    const isLong = charLen > 400;
    const isExpanded = gExpandedRecordIds.has(r.id);

    let displayContent = rawContent;
    let toggleBtnHtml = "";
    if (isLong && !isExpanded) {
      displayContent = rawContent.slice(0, 300) + "……";
      toggleBtnHtml = `<button type="button" class="btn btn-secondary" style="font-size:12px; padding:3px 10px; margin-top:6px; align-self:flex-start;" onclick="toggleRecordExpand(${r.id})">📖 全文を表示 (${charLen}文字)</button>`;
    } else if (isLong && isExpanded) {
      toggleBtnHtml = `<button type="button" class="btn btn-secondary" style="font-size:12px; padding:3px 10px; margin-top:6px; align-self:flex-start;" onclick="toggleRecordExpand(${r.id})">▲ 一部を折りたたむ</button>`;
    }

    item.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:12px; padding:3px 8px; border-radius:4px; ${catBadgeStyle}">［${escapeHtml(r.category || '介護記録')}］</span>
          <strong style="font-size:14px; color:#1e293b;">${escapeHtml(resName)}</strong>
          ${isLong ? `<span style="font-size:11px; background:#f1f5f9; color:#475569; padding:2px 6px; border-radius:10px;">(${charLen}字)</span>` : ''}
        </div>
        <span style="font-size:12px; color:var(--text-muted);">${escapeHtml(timeDisplay)} (記録者: ${escapeHtml(r.staff_name || '未記録')})</span>
      </div>
      <div class="care-record-body">${escapeHtml(displayContent)}</div>
      ${toggleBtnHtml}
    `;
    return item;
  };

  // 全履歴表示（isAllScope）の場合は年月別アコーディオンでグループ化！
  if (isAllScope) {
    const monthGroups = {};
    allUserRecords.forEach(r => {
      const timeStr = r.recorded_at || r.record_time || "";
      const ym = timeStr.slice(0, 7) || "その他";
      if (!monthGroups[ym]) monthGroups[ym] = [];
      monthGroups[ym].push(r);
    });

    const ymList = Object.keys(monthGroups).sort().reverse(); // 新しい月順

    // デフォルトで最新の月を展開状態にしておく
    if (gOpenMonthAccordions.size === 0 && ymList.length > 0) {
      gOpenMonthAccordions.add(ymList[0]);
    }

    // 月別クイック絞り込みバー
    const filterBar = document.createElement("div");
    filterBar.style.cssText = "display:flex; gap:6px; margin-bottom:12px; flex-wrap:wrap; align-items:center;";
    filterBar.innerHTML = `
      <span style="font-size:12px; font-weight:bold; color:#475569; margin-right:4px;">月別表示:</span>
      <button type="button" class="btn btn-secondary" style="font-size:11px; padding:3px 9px; ${gSelectedHistoryMonth === 'all' ? 'background:#1d4ed8; color:#fff; font-weight:bold;' : ''}" onclick="filterHistoryMonth('all')">すべて (計${allUserRecords.length}件)</button>
      ${ymList.map(ym => {
        const parts = ym.split("-");
        const label = parts.length === 2 ? `${parts[0]}年${parseInt(parts[1])}月 (${monthGroups[ym].length}件)` : ym;
        const active = gSelectedHistoryMonth === ym;
        return `<button type="button" class="btn btn-secondary" style="font-size:11px; padding:3px 9px; ${active ? 'background:#1d4ed8; color:#fff; font-weight:bold;' : ''}" onclick="filterHistoryMonth('${ym}')">${label}</button>`;
      }).join("")}
    `;
    list.appendChild(filterBar);

    // 各月の描画
    ymList.forEach(ym => {
      if (gSelectedHistoryMonth !== "all" && gSelectedHistoryMonth !== ym) return;

      const parts = ym.split("-");
      const ymTitle = parts.length === 2 ? `${parts[0]}年${parseInt(parts[1])}月` : ym;
      const mRecs = monthGroups[ym];
      const isOpen = gOpenMonthAccordions.has(ym);

      const accordionContainer = document.createElement("div");
      accordionContainer.style.cssText = "margin-bottom:12px; border:1px solid #e2e8f0; border-radius:6px; overflow:hidden; background:#fff;";

      // アコーディオンヘッダー
      const header = document.createElement("div");
      header.style.cssText = "display:flex; justify-content:space-between; align-items:center; background:#f8fafc; padding:10px 14px; cursor:pointer; user-select:none; border-left:4px solid #3b82f6; transition:background 0.2s;";
      header.onmouseover = () => header.style.background = "#f1f5f9";
      header.onmouseout = () => header.style.background = "#f8fafc";
      header.onclick = () => toggleMonthAccordion(ym);

      header.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:14px; font-weight:bold; color:#1e3a8a;">📅 ${ymTitle}</span>
          <span style="font-size:11px; background:#eff6ff; color:#1d4ed8; padding:2px 8px; border-radius:10px; font-weight:bold;">${mRecs.length} 件</span>
        </div>
        <span style="font-size:12px; color:#64748b; font-weight:bold;">
          ${isOpen ? '▲ 折りたたむ' : '▼ 展開して表示'}
        </span>
      `;
      accordionContainer.appendChild(header);

      // アコーディオン中身（展開時のみ表示）
      if (isOpen) {
        const body = document.createElement("div");
        body.style.cssText = "padding:10px; background:#ffffff; border-top:1px solid #e2e8f0;";
        mRecs.forEach(r => {
          body.appendChild(createRecordItem(r));
        });
        accordionContainer.appendChild(body);
      }

      list.appendChild(accordionContainer);
    });

  } else {
    // 指定日モードの場合はそのまま表示
    records.forEach(r => {
      list.appendChild(createRecordItem(r));
    });
  }
}

// 選択中利用者の個別カルテ記録を印刷
function printSelectedDateRecords() {
  const res = gState.residents.find(x => x.id === gState.selectedResidentId);
  const resName = res ? `${res.room_no}号室 ${res.name} 様` : "利用者未指定";

  const isAllScope = gState.recordScope === "all";
  const records = (db.data.care_records || [])
    .filter(r => {
      if (r.resident_id !== gState.selectedResidentId) return false;
      if (isAllScope) return true;
      const timeStr = r.recorded_at || r.record_time || "";
      return timeStr.startsWith(gState.selectedDate);
    })
    .sort((a, b) => {
      const ta = a.recorded_at || a.record_time || "";
      const tb = b.recorded_at || b.record_time || "";
      return tb.localeCompare(ta);
    });

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
    const timeDisplay = r.recorded_at || r.record_time || "時間未記録";
    return `
      <div style="margin-bottom:18px; border:1px solid #cbd5e1; border-radius:6px; padding:12px; page-break-inside:avoid; background:#fff;">
        <div style="display:flex; justify-content:space-between; border-bottom:1px solid #e2e8f0; padding-bottom:6px; margin-bottom:8px; font-size:13px;">
          <div>
            <span style="font-weight:bold; background:#e2e8f0; padding:2px 6px; border-radius:3px;">#${idx + 1} ［${escapeHtml(r.category || '介護記録')}］</span>
            <strong style="font-size:15px; margin-left:8px;">${escapeHtml(resName)}</strong>
          </div>
          <div style="color:#64748b;">
            <span>日時: ${escapeHtml(timeDisplay)}</span>
            <span style="margin-left:12px;">記録者: ${escapeHtml(r.staff_name || '未記録')}</span>
          </div>
        </div>
        <div style="white-space:pre-wrap; font-size:13.5px; line-height:1.7; color:#1e293b; padding:4px 2px;">
${escapeHtml(r.content || '')}
        </div>
      </div>
    `;
  }).join("");

  printArea.innerHTML = `
    <div style="font-family:'Hiragino Kaku Gothic ProN', 'Meiryo', sans-serif; color:#000;">
      <div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid #1e3a8a; padding-bottom:10px; margin-bottom:16px;">
        <div>
          <h1 style="font-size:22px; margin:0; color:#1e3a8a;">📑 個別介護記録・カルテ報告書</h1>
          <p style="font-size:13px; color:#475569; margin:4px 0 0 0;">対象利用者: <strong>${escapeHtml(resName)}</strong> (${res ? res.care_level : ''}) / 対象日: <strong>${isAllScope ? '全期間履歴' : escapeHtml(gState.selectedDate)}</strong></p>
        </div>
        <div style="text-align:right; font-size:12px; color:#64748b;">
          <div>印刷日時: ${nowStr}</div>
          <div>出力担当者: ${escapeHtml(staffName)}</div>
          <div>記録件数: 計 ${records.length} 件</div>
        </div>
      </div>

      <div style="margin-top:12px;">
        ${recordsHtml}
      </div>

      <div style="margin-top:24px; border-top:1px solid #cbd5e1; padding-top:8px; display:flex; justify-content:space-between; font-size:11px; color:#94a3b8;">
        <span>ケアポータル 統合管理システム (個別カルテ印刷)</span>
        <span>確認印: __________________</span>
      </div>
    </div>
  `;

  window.print();
}

// ============================================================
// 📰 施設・フロア 業務日誌 (一日の記録) の描画 ＆ 印刷
// ============================================================
function renderDailyJournal() {
  const titleEl = document.getElementById("dailyJournalTitle");
  if (titleEl) {
    titleEl.textContent = `📰 【${gState.selectedDate}】施設・フロア 業務日誌 (一日の記録)`;
  }

  // 1. サマリーバー（勤務体制 ＆ 利用者概況 ＆ 記録件数）
  const summaryBar = document.getElementById("dailyJournalSummaryBar");
  if (summaryBar) {
    const presentCount = gState.residents.filter(r => r.status === "在所").length;
    const hospitalCount = gState.residents.filter(r => r.status === "入院中").length;

    const dayRecords = (db.data.care_records || []).filter(r => {
      const timeStr = r.recorded_at || r.record_time || "";
      return timeStr.startsWith(gState.selectedDate);
    });
    const tokukanCount = dayRecords.filter(r => r.category === "特変").length;

    const shiftText = (document.getElementById("todayShiftBar") ? document.getElementById("todayShiftBar").innerText : "").replace("🕒 本日の勤務体制:", "").trim();

    summaryBar.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:4px;">
        <div style="font-size:13px; color:#1e40af; font-weight:bold;">🕒 本日のフロア勤務体制:</div>
        <div style="font-size:13px; color:#334155;">${escapeHtml(shiftText || '管理者: 施設長 | リーダー: 山田 | 看護: 鈴木 | 介護: 佐藤 | 事務: 田中')}</div>
      </div>
      <div style="display:flex; gap:16px; align-items:center; flex-wrap:wrap;">
        <div style="background:#fff; border:1px solid #cbd5e1; padding:6px 14px; border-radius:6px; text-align:center;">
          <div style="font-size:11px; color:#64748b;">入居者状況</div>
          <div style="font-size:14px; font-weight:bold; color:#1e293b;">在所 ${presentCount}名 / 入院 ${hospitalCount}名</div>
        </div>
        <div style="background:#fff; border:1px solid #cbd5e1; padding:6px 14px; border-radius:6px; text-align:center;">
          <div style="font-size:11px; color:#64748b;">本日の介護記録</div>
          <div style="font-size:14px; font-weight:bold; color:#2563eb;">計 ${dayRecords.length} 件</div>
        </div>
        <div style="background:#fff; border:1px solid #cbd5e1; padding:6px 14px; border-radius:6px; text-align:center;">
          <div style="font-size:11px; color:#64748b;">特変・要申送</div>
          <div style="font-size:14px; font-weight:bold; color:${tokukanCount > 0 ? '#dc2626' : '#16a34a'};">${tokukanCount} 件</div>
        </div>
      </div>
    `;
  }

  // 2. 指定日の全入居者タイムライン記録一覧
  const recordsListEl = document.getElementById("dailyJournalRecordsList");
  if (recordsListEl) {
    const allRecords = (db.data.care_records || [])
      .filter(r => {
        const timeStr = r.recorded_at || r.record_time || "";
        return timeStr.startsWith(gState.selectedDate);
      })
      .sort((a, b) => {
        const ta = a.recorded_at || a.record_time || "";
        const tb = b.recorded_at || b.record_time || "";
        return ta.localeCompare(tb); // 朝から夜への時系列昇順
      });

    if (allRecords.length === 0) {
      recordsListEl.innerHTML = '<p style="font-size:14px; color:var(--text-muted); padding:16px; text-align:center; background:#f8fafc; border-radius:6px;">この日の介護記録はありません。</p>';
    } else {
      recordsListEl.innerHTML = "";
      allRecords.forEach(r => {
        const res = gState.residents.find(x => x.id === r.resident_id);
        const resName = res ? `${res.room_no}号室 ${res.name} 様` : "利用者未指定";
        const timeDisplay = r.recorded_at || r.record_time || "時間未記録";

        let catBadgeStyle = "background:#e0f2fe; color:#0369a1;";
        if (r.category === "特変") catBadgeStyle = "background:#fee2e2; color:#991b1b; font-weight:bold;";
        else if (r.category === "バイタル") catBadgeStyle = "background:#fef3c7; color:#92400e;";
        else if (r.category === "頓服服用") catBadgeStyle = "background:#f3e8ff; color:#6b21a8;";

        const item = document.createElement("div");
        item.className = "care-record-card";
        item.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:12px; padding:3px 8px; border-radius:4px; ${catBadgeStyle}">［${escapeHtml(r.category || '介護記録')}］</span>
              <strong style="font-size:14px; color:#1e293b;">${escapeHtml(resName)}</strong>
            </div>
            <span style="font-size:12px; color:var(--text-muted);">${escapeHtml(timeDisplay)} (記録者: ${escapeHtml(r.staff_name || '未記録')})</span>
          </div>
          <div class="care-record-body" style="margin-top:6px;">${escapeHtml(r.content || '')}</div>
        `;
        recordsListEl.appendChild(item);
      });
    }
  }

  // 3. フロア全体ケアサマリー表 (バイタル・食事・排泄・入浴)
  const summaryTableEl = document.getElementById("dailyJournalCareSummaryTable");
  if (summaryTableEl) {
    let rowsHtml = gState.residents.map(r => {
      // 本日のバイタル
      const vit = (db.data.vitals || []).find(v => v.resident_id === r.id && v.date === gState.selectedDate);
      const vitStr = vit ? `${vit.temperature}℃ / ${vit.bp_high}-${vit.bp_low} / P:${vit.pulse} / SpO2:${vit.spo2}%` : "未検温";

      // 本日の食事 (朝・昼)
      const morningMeal = (db.data.meals || []).find(m => m.resident_id === r.id && m.date === gState.selectedDate && m.meal_type === "朝食");
      const noonMeal = (db.data.meals || []).find(m => m.resident_id === r.id && m.date === gState.selectedDate && m.meal_type === "昼食");
      const mealStr = `朝:${morningMeal ? morningMeal.main_dish_ratio + '割' : '-'} / 昼:${noonMeal ? noonMeal.main_dish_ratio + '割' : '-'}`;

      // 本日の排泄
      const excs = (db.data.excretions || []).filter(e => e.resident_id === r.id && e.date === gState.selectedDate);
      const stoolCount = excs.filter(e => e.stool_amount && e.stool_amount !== "なし").length;
      const excStr = excs.length > 0 ? `排尿:${excs.length}回 / 排便:${stoolCount}回` : "記録なし";

      // 本日の入浴
      const bath = (db.data.baths || []).find(b => b.resident_id === r.id && b.date === gState.selectedDate);
      const bathStr = bath ? `${bath.bath_type} 済` : (r.status === "入院中" ? "入院中" : "なし");

      return `
        <tr>
          <td style="font-weight:bold; white-space:nowrap;">${escapeHtml(r.room_no)}号室</td>
          <td style="font-weight:bold; white-space:nowrap;">${escapeHtml(r.name)} 様</td>
          <td style="font-size:12px; white-space:nowrap;">${escapeHtml(r.care_level)}</td>
          <td style="font-size:12px;">${escapeHtml(vitStr)}</td>
          <td style="font-size:12px;">${escapeHtml(mealStr)}</td>
          <td style="font-size:12px;">${escapeHtml(excStr)}</td>
          <td style="font-size:12px; white-space:nowrap;">${escapeHtml(bathStr)}</td>
        </tr>
      `;
    }).join("");

    summaryTableEl.innerHTML = `
      <table class="data-table" style="font-size:13px; width:100%;">
        <thead>
          <tr>
            <th>居室</th>
            <th>氏名</th>
            <th>介護度</th>
            <th>バイタル (体温/血圧/脈拍/SpO2)</th>
            <th>食事摂取量 (主食)</th>
            <th>排泄状況</th>
            <th>入浴実施</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    `;
  }
}

// 施設・フロア業務日誌 (一日の記録) の印刷
function printDailyJournal() {
  const records = (db.data.care_records || [])
    .filter(r => {
      const timeStr = r.recorded_at || r.record_time || "";
      return timeStr.startsWith(gState.selectedDate);
    })
    .sort((a, b) => {
      const ta = a.recorded_at || a.record_time || "";
      const tb = b.recorded_at || b.record_time || "";
      return ta.localeCompare(tb);
    });

  const printArea = document.getElementById("printArea");
  if (!printArea) {
    alert("印刷コンテナが見つかりません。");
    return;
  }

  const staffName = document.getElementById("currentStaff").value || "未記録";
  const nowStr = new Date().toLocaleString("ja-JP");
  const facilityName = (db.data && db.data.facility_name) ? db.data.facility_name : "陽だまりの家";

  let summaryTableRows = gState.residents.map(r => {
    const vit = (db.data.vitals || []).find(v => v.resident_id === r.id && v.date === gState.selectedDate);
    const vitStr = vit ? `${vit.temperature}℃ / ${vit.bp_high}-${vit.bp_low} / P:${vit.pulse} / SpO2:${vit.spo2}%` : "未検温";
    const morningMeal = (db.data.meals || []).find(m => m.resident_id === r.id && m.date === gState.selectedDate && m.meal_type === "朝食");
    const noonMeal = (db.data.meals || []).find(m => m.resident_id === r.id && m.date === gState.selectedDate && m.meal_type === "昼食");
    const mealStr = `朝:${morningMeal ? morningMeal.main_dish_ratio + '割' : '-'} / 昼:${noonMeal ? noonMeal.main_dish_ratio + '割' : '-'}`;
    const excs = (db.data.excretions || []).filter(e => e.resident_id === r.id && e.date === gState.selectedDate);
    const stoolCount = excs.filter(e => e.stool_amount && e.stool_amount !== "なし").length;
    const excStr = excs.length > 0 ? `尿:${excs.length}回 便:${stoolCount}回` : "記録なし";
    const bath = (db.data.baths || []).find(b => b.resident_id === r.id && b.date === gState.selectedDate);
    const bathStr = bath ? `${bath.bath_type} 済` : (r.status === "入院中" ? "入院中" : "なし");

    return `
      <tr>
        <td style="border:1px solid #94a3b8; padding:5px 8px; font-weight:bold;">${escapeHtml(r.room_no)}号室 ${escapeHtml(r.name)} 様</td>
        <td style="border:1px solid #94a3b8; padding:5px 8px;">${escapeHtml(r.care_level)}</td>
        <td style="border:1px solid #94a3b8; padding:5px 8px;">${escapeHtml(vitStr)}</td>
        <td style="border:1px solid #94a3b8; padding:5px 8px;">${escapeHtml(mealStr)}</td>
        <td style="border:1px solid #94a3b8; padding:5px 8px;">${escapeHtml(excStr)}</td>
        <td style="border:1px solid #94a3b8; padding:5px 8px;">${escapeHtml(bathStr)}</td>
      </tr>
    `;
  }).join("");

  let recordsHtml = records.map((r, idx) => {
    const res = gState.residents.find(x => x.id === r.resident_id);
    const resName = res ? `${res.room_no}号室 ${res.name} 様` : "利用者未指定";
    const timeDisplay = r.recorded_at || r.record_time || "時間未記録";

    return `
      <div style="margin-bottom:12px; border:1px solid #cbd5e1; border-radius:4px; padding:10px; page-break-inside:avoid;">
        <div style="display:flex; justify-content:space-between; border-bottom:1px solid #e2e8f0; padding-bottom:4px; margin-bottom:6px; font-size:12px;">
          <div>
            <span style="font-weight:bold; background:#e2e8f0; padding:2px 6px; border-radius:3px;">#${idx + 1} ［${escapeHtml(r.category || '介護記録')}］</span>
            <strong style="font-size:14px; margin-left:6px;">${escapeHtml(resName)}</strong>
          </div>
          <div style="color:#64748b;">
            <span>${escapeHtml(timeDisplay)}</span> / <span>記録者: ${escapeHtml(r.staff_name || '未記録')}</span>
          </div>
        </div>
        <div style="white-space:pre-wrap; font-size:13px; line-height:1.6; color:#1e293b;">
${escapeHtml(r.content || '')}
        </div>
      </div>
    `;
  }).join("");

  printArea.innerHTML = `
    <div style="font-family:'Hiragino Kaku Gothic ProN', 'Meiryo', sans-serif; color:#000;">
      <div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid #1e3a8a; padding-bottom:8px; margin-bottom:14px;">
        <div>
          <h1 style="font-size:20px; margin:0; color:#1e3a8a;">📑 ${escapeHtml(facilityName)} フロア業務日誌 (一日の記録)</h1>
          <p style="font-size:12px; color:#475569; margin:4px 0 0 0;">対象日: <strong>${escapeHtml(gState.selectedDate)}</strong> / 日報管理書類</p>
        </div>
        <div style="text-align:right; font-size:11px; color:#64748b;">
          <div>印刷日時: ${nowStr}</div>
          <div>出力者: ${escapeHtml(staffName)}</div>
        </div>
      </div>

      <h3 style="font-size:14px; margin:12px 0 6px 0; color:#1e3a8a;">1. フロア全体 ケア実施サマリー表</h3>
      <table style="width:100%; border-collapse:collapse; font-size:11.5px; margin-bottom:16px;">
        <thead>
          <tr style="background:#f1f5f9;">
            <th style="border:1px solid #94a3b8; padding:5px 8px;">氏名・居室</th>
            <th style="border:1px solid #94a3b8; padding:5px 8px;">介護度</th>
            <th style="border:1px solid #94a3b8; padding:5px 8px;">バイタル</th>
            <th style="border:1px solid #94a3b8; padding:5px 8px;">食事</th>
            <th style="border:1px solid #94a3b8; padding:5px 8px;">排泄</th>
            <th style="border:1px solid #94a3b8; padding:5px 8px;">入浴</th>
          </tr>
        </thead>
        <tbody>
          ${summaryTableRows}
        </tbody>
      </table>

      <h3 style="font-size:14px; margin:14px 0 6px 0; color:#1e3a8a;">2. 全入居者 タイムライン介護記録 (計 ${records.length} 件)</h3>
      <div>
        ${recordsHtml || '<p style="padding:10px; font-size:12px; color:#64748b;">記録なし</p>'}
      </div>

      <div style="margin-top:24px; border-top:1px solid #cbd5e1; padding-top:8px; display:flex; justify-content:space-between; font-size:11px; color:#94a3b8;">
        <span>ケアポータル 統合管理システム (フロア日報印刷)</span>
        <span>施設長印: __________________ / リーダー印: __________________</span>
      </div>
    </div>
  `;

  window.print();
}

// 文字検索機能 (何月何日何時の記録か一発検索)
function doSearch() {
  const q = document.getElementById("searchInput").value.trim().toLowerCase();
  if (!q) return;

  const results = (db.data.care_records || []).filter(r => {
    const res = gState.residents.find(x => x.id === r.resident_id);
    const resName = res ? res.name.toLowerCase() : "";
    const content = (r.content || "").toLowerCase();
    const cat = (r.category || "").toLowerCase();
    return content.includes(q) || cat.includes(q) || resName.includes(q);
  });

  const container = document.getElementById("searchResults");
  container.style.display = "block";
  container.innerHTML = `
    <div style="font-size:14px; font-weight:bold; margin-bottom:8px; color:var(--primary-color);">
      🔍 『${q}』の検索結果: ${results.length}件ヒット (何月何日何時何分の記録か)
    </div>
  `;

  if (results.length === 0) {
    container.innerHTML += '<p style="font-size:13px; color:var(--text-muted);">該当する記録は見つかりませんでした。</p>';
    return;
  }

  results.forEach(r => {
    const res = gState.residents.find(x => x.id === r.resident_id);
    const card = document.createElement("div");
    card.style.background = "#f8fafc";
    card.style.border = "1px solid #cbd5e1";
    card.style.borderRadius = "8px";
    card.style.padding = "10px 14px";
    card.style.marginBottom = "8px";

    const timeDisplay = r.recorded_at || r.record_time || "時間未記録";
    // 検索語ハイライト (安全なHTMLエスケープ後にハイライト適用)
    let contentHtml = escapeHtml(r.content || "");
    try {
      const escapedQ = escapeHtml(q).replace(new RegExp("[.*+?^${}()|[\\]\\\\]", "g"), "\\$&");
      const regex = new RegExp(`(${escapedQ})`, 'gi');
      contentHtml = contentHtml.replace(regex, '<mark style="background:#fef08a; padding:1px 4px; border-radius:2px; font-weight:bold;">$1</mark>');
    } catch(e) {}

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:4px; flex-wrap:wrap; gap:4px;">
        <span style="font-weight:bold; color:#1d4ed8;">🕒 ${escapeHtml(timeDisplay)} 【${escapeHtml(r.category || '記録')}】</span>
        <strong>${res ? escapeHtml(res.room_no) + '号室 ' + escapeHtml(res.name) + ' 様' : ''}</strong>
        <span style="color:var(--text-muted);">担当: ${escapeHtml(r.staff_name || '未設定')}</span>
      </div>
      <div style="font-size:14px; line-height:1.7; white-space:pre-wrap; margin-top:4px; padding:6px; background:#fff; border-radius:4px;">${contentHtml}</div>
      <div style="margin-top:6px; display:flex; justify-content:flex-end;">
        <button class="btn btn-secondary" style="padding:2px 8px; font-size:11px;" onclick="jumpToDateRecord('${escapeHtml(timeDisplay.slice(0, 10))}')">📅 この日の記録一覧へジャンプ</button>
      </div>
    `;
    container.appendChild(card);
  });
}

function jumpToDateRecord(dateStr) {
  if (!dateStr || dateStr.length < 10) return;
  const targetDate = dateStr.slice(0, 10);
  gState.currentMonth = targetDate.slice(0, 7);
  selectDate(targetDate);
  switchCareTab('record');
  window.scrollTo({ top: 300, behavior: 'smooth' });
}

function clearSearch() {
  document.getElementById("searchInput").value = "";
  document.getElementById("searchResults").style.display = "none";
}

// 1. バイタル表
function renderVitalsTable() {
  const tbody = document.querySelector("#vitalsTable tbody");
  tbody.innerHTML = "";
  const vitals = (db.data.vitals || []).filter(v => v.date === gState.selectedDate);

  gState.residents.forEach(r => {
    const v = vitals.find(x => x.resident_id === r.id);
    const tr = document.createElement("tr");
    if (r.status !== "在所") tr.style.opacity = "0.5";

    tr.innerHTML = `
      <td>${r.room_no}</td>
      <td><strong>${r.name} 様</strong> ${r.status !== '在所' ? `(${r.status})` : ''}</td>
      <td><input type="number" step="0.1" class="form-control" style="width:85px;" id="vTemp_${r.id}" value="${v ? v.temperature || '' : ''}" placeholder="36.5"></td>
      <td style="display:flex; gap:4px; align-items:center;">
        <input type="number" class="form-control" style="width:70px;" id="vBpHigh_${r.id}" value="${v ? v.bp_high || '' : ''}" placeholder="120">
        /
        <input type="number" class="form-control" style="width:70px;" id="vBpLow_${r.id}" value="${v ? v.bp_low || '' : ''}" placeholder="70">
      </td>
      <td><input type="number" class="form-control" style="width:75px;" id="vPulse_${r.id}" value="${v ? v.pulse || '' : ''}" placeholder="72"></td>
      <td><input type="number" class="form-control" style="width:75px;" id="vSpo2_${r.id}" value="${v ? v.spo2 || '' : ''}" placeholder="98"></td>
      <td><label><input type="checkbox" id="vUnusual_${r.id}" ${v && v.is_unusual ? 'checked' : ''}> 特変</label></td>
      <td><button class="btn btn-primary" style="padding:6px 12px; font-size:13px;" onclick="saveVital(${r.id})">登録</button></td>
    `;
    tbody.appendChild(tr);
  });
}

function saveVital(resId) {
  const temp = document.getElementById(`vTemp_${resId}`).value;
  const bpHigh = document.getElementById(`vBpHigh_${resId}`).value;
  const bpLow = document.getElementById(`vBpLow_${resId}`).value;
  const pulse = document.getElementById(`vPulse_${resId}`).value;
  const spo2 = document.getElementById(`vSpo2_${resId}`).value;
  const isUnusual = document.getElementById(`vUnusual_${resId}`).checked;

  if (!temp && !bpHigh && !bpLow && !pulse && !spo2) {
    alert("体温・血圧・脈拍・SpO2のいずれかを入力してください。");
    return;
  }

  const staff = document.getElementById("currentStaff").value;
  const tm = new Date().toTimeString().slice(0, 5);

  const vitalObj = {
    id: Date.now(),
    date: gState.selectedDate,
    time: tm,
    resident_id: resId,
    temperature: temp ? parseFloat(temp) : null,
    bp_high: bpHigh ? parseInt(bpHigh) : null,
    bp_low: bpLow ? parseInt(bpLow) : null,
    pulse: pulse ? parseInt(pulse) : null,
    spo2: spo2 ? parseInt(spo2) : null,
    is_unusual: isUnusual ? 1 : 0,
    staff_name: staff
  };

  db.data.vitals.push(vitalObj);

  // 個人記録へ自動連動
  const res = gState.residents.find(x => x.id === resId);
  const vitalText = `バイタル測定: 体温${temp || '-'}℃, 血圧${bpHigh || '-'}/${bpLow || '-'}, 脈拍${pulse || '-'}, SpO2 ${spo2 || '-'}%`;
  db.data.care_records.unshift({
    id: Date.now() + 1,
    recorded_at: `${gState.selectedDate} ${tm}`,
    resident_id: resId,
    category: "バイタル",
    content: vitalText,
    staff_name: staff
  });

  // 特変チェック時は連絡帳へ自動転記
  if (isUnusual) {
    db.data.notebooks.unshift({
      id: Date.now() + 2,
      date: gState.selectedDate,
      category: "特変申し送り",
      content: `【特変】${res ? res.name : ''}様 ${vitalText} (通常値と差異あり)`,
      status: "未対応",
      staff_name: staff,
      resolved_staff: null
    });
  }

  db.save();
  loadDateRecords(gState.selectedDate);
  alert("バイタルを記録しました（個人記録・特変は連絡帳へ連動完了）！");
}

// 2. 排泄 (15分刻み・微小中大・水様便)
function renderExcretionTable() {
  const tbody = document.querySelector("#excretionHistoryTable tbody");
  tbody.innerHTML = "";
  const excretions = (db.data.excretions || []).filter(e => e.date === gState.selectedDate);

  excretions.forEach(e => {
    const res = gState.residents.find(r => r.id === e.resident_id);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${e.time}</strong></td>
      <td>${res ? res.name + ' 様' : '-'}</td>
      <td>${e.urine_flag === 1 ? 'あり (＋)' : (e.urine_flag === 2 ? 'バルーン' : 'なし')}</td>
      <td><span style="font-weight:bold; color:#b45309;">${e.stool_amount}</span></td>
      <td>${e.stool_condition}</td>
      <td>${e.notes || '-'}</td>
      <td>${e.staff_name}</td>
    `;
    tbody.appendChild(tr);
  });
}

function submitExcretion() {
  const tm = document.getElementById("exTime").value || new Date().toTimeString().slice(0, 5);
  const urine = parseInt(document.getElementById("exUrine").value, 10) || 0;
  const amount = document.getElementById("exStoolAmount").value;
  const cond = document.getElementById("exStoolCond").value;
  const notes = document.getElementById("exNotes").value;
  const staff = document.getElementById("currentStaff").value;

  db.data.excretions.unshift({
    id: Date.now(),
    date: gState.selectedDate,
    time: tm,
    resident_id: gState.selectedResidentId,
    urine_flag: urine,
    stool_amount: amount,
    stool_condition: cond,
    notes: notes,
    staff_name: staff
  });
  db.save();

  document.getElementById("exNotes").value = "";
  loadDateRecords(gState.selectedDate);
  alert("排泄記録を保存しました！");
}

// 3. 食事 ＆ 水分表 (1日累計自動計算)
function renderMealsTable() {
  const tbody = document.querySelector("#mealsTable tbody");
  tbody.innerHTML = "";
  const meals = (db.data.meals || []).filter(m => m.date === gState.selectedDate);

  gState.residents.forEach(r => {
    const userMeals = meals.filter(m => m.resident_id === r.id);
    const totalWater = userMeals.reduce((acc, cur) => acc + (cur.water_ml || 0), 0);
    const tr = document.createElement("tr");
    if (r.status !== "在所") tr.style.opacity = "0.5";

    tr.innerHTML = `
      <td>${r.room_no}</td>
      <td><strong>${r.name} 様</strong></td>
      <td style="font-size:12px;">${r.diet_type} / <span style="color:#dc2626;">${r.allergies || 'なし'}</span></td>
      <td>
        <select id="mType_${r.id}" class="form-control" style="width:90px;">
          <option value="昼">昼食</option>
          <option value="朝">朝食</option>
          <option value="夕">夕食</option>
          <option value="おやつ">おやつ</option>
        </select>
      </td>
      <td><input type="number" id="mMain_${r.id}" class="form-control" style="width:70px;" value="10" min="0" max="10"></td>
      <td><input type="number" id="mSide_${r.id}" class="form-control" style="width:70px;" value="10" min="0" max="10"></td>
      <td><input type="number" id="mWater_${r.id}" class="form-control" style="width:85px;" value="200" step="50"></td>
      <td><strong style="color:#0284c7; font-size:15px;">${totalWater} ml</strong></td>
      <td><button class="btn btn-primary" style="padding:6px 12px; font-size:13px;" onclick="saveMeal(${r.id})">記録</button></td>
    `;
    tbody.appendChild(tr);
  });
}

function saveMeal(resId) {
  const type = document.getElementById(`mType_${resId}`).value;
  const mainVal = parseInt(document.getElementById(`mMain_${resId}`).value, 10);
  const sideVal = parseInt(document.getElementById(`mSide_${resId}`).value, 10);
  const waterVal = parseInt(document.getElementById(`mWater_${resId}`).value, 10);
  const main = isNaN(mainVal) ? 10 : mainVal;
  const side = isNaN(sideVal) ? 10 : sideVal;
  const water = isNaN(waterVal) ? 200 : waterVal;
  const staff = document.getElementById("currentStaff").value;

  db.data.meals.push({
    id: Date.now(),
    date: gState.selectedDate,
    meal_type: type,
    resident_id: resId,
    main_dish_ratio: main,
    side_dish_ratio: side,
    water_ml: water,
    staff_name: staff
  });
  db.save();

  loadDateRecords(gState.selectedDate);
  alert("食事・水分摂取量を記録しました！");
}

// 4. 入浴 ＆ 塗布薬
function renderBathTable() {
  const tbody = document.querySelector("#bathTable tbody");
  tbody.innerHTML = "";
  const baths = (db.data.baths || []).filter(b => b.date === gState.selectedDate);

  gState.residents.forEach(r => {
    const b = baths.find(x => x.resident_id === r.id);
    const tr = document.createElement("tr");
    const defaultMedNote = r.id === 1 ? "背中・両下腿にヒルドイドソフト塗布（保湿）" : (r.id === 2 ? "両踵にプロペト塗布" : "特記なし");

    tr.innerHTML = `
      <td>${r.room_no}</td>
      <td><strong>${r.name} 様</strong></td>
      <td>
        <select id="bathType_${r.id}" class="form-control" style="width:110px;">
          <option value="一般浴" ${b && b.bath_type==='一般浴'?'selected':''}>一般浴</option>
          <option value="特浴" ${b && b.bath_type==='特浴'?'selected':''}>特浴(機械浴)</option>
          <option value="清拭" ${b && b.bath_type==='清拭'?'selected':''}>清拭</option>
          <option value="見合わせ" ${b && b.bath_type==='見合わせ'?'selected':''}>見合わせ</option>
        </select>
      </td>
      <td><input type="text" id="bathNotes_${r.id}" class="form-control" value="${b ? b.ointment_notes : defaultMedNote}"></td>
      <td><button class="btn btn-primary" style="padding:6px 12px; font-size:13px;" onclick="saveBath(${r.id})">保存</button></td>
    `;
    tbody.appendChild(tr);
  });
}

function saveBath(resId) {
  const type = document.getElementById(`bathType_${resId}`).value;
  const notes = document.getElementById(`bathNotes_${resId}`).value;
  const staff = document.getElementById("currentStaff").value;

  let existing = (db.data.baths || []).find(b => b.date === gState.selectedDate && b.resident_id === resId);
  if (existing) {
    existing.bath_type = type;
    existing.ointment_notes = notes;
    existing.staff_name = staff;
  } else {
    db.data.baths.push({
      id: Date.now(),
      date: gState.selectedDate,
      resident_id: resId,
      bath_type: type,
      ointment_notes: notes,
      staff_name: staff
    });
  }
  db.save();

  loadDateRecords(gState.selectedDate);
  alert("入浴・塗布薬記録を保存しました！");
}

// 5. 口腔ケア
function renderOralTable() {
  const tbody = document.querySelector("#oralTable tbody");
  tbody.innerHTML = "";
  const oralCares = (db.data.oral_cares || []).filter(o => o.date === gState.selectedDate);

  gState.residents.forEach(r => {
    const tr = document.createElement("tr");

    const getOralBtn = (timing) => {
      const done = oralCares.find(o => o.resident_id === r.id && o.timing === timing);
      if (done) {
        return `<span style="display:inline-block; padding:4px 8px; font-size:12px; font-weight:bold; color:#15803d; background:#dcfce7; border-radius:4px; border:1px solid #86efac;">✓ 済 (${done.staff_name || '済'})</span>`;
      }
      return `<button class="btn btn-secondary" style="padding:4px 8px; font-size:12px;" onclick="saveOralCare(${r.id}, '${timing}')">${timing} 食後 ✓</button>`;
    };

    tr.innerHTML = `
      <td>${r.room_no}</td>
      <td><strong>${r.name} 様</strong></td>
      <td style="font-size:12px; font-weight:bold; color:#0369a1;">${r.oral_state || '残歯'}</td>
      <td>${getOralBtn("朝")}</td>
      <td>${getOralBtn("昼")}</td>
      <td>${getOralBtn("夕")}</td>
      <td><input type="text" id="oralNotes_${r.id}" class="form-control" placeholder="口内炎、残渣なし等" style="font-size:12px;"></td>
    `;
    tbody.appendChild(tr);
  });
}

function saveOralCare(resId, timing) {
  const r = gState.residents.find(x => x.id === resId);
  const exists = (db.data.oral_cares || []).some(o => o.date === gState.selectedDate && o.resident_id === resId && o.timing === timing);
  if (exists) {
    alert(`この方の【${timing}】の口腔ケアはすでに完了記録があります。`);
    return;
  }

  const notesEl = document.getElementById(`oralNotes_${resId}`);
  const notes = notesEl ? notesEl.value : "";
  const staff = document.getElementById("currentStaff").value;

  db.data.oral_cares.push({
    id: Date.now(), date: gState.selectedDate, timing: timing, resident_id: resId,
    oral_done: 1, denture_done: 1, notes: notes, staff_name: staff
  });
  db.save();
  renderOralTable();
  loadDateRecords(gState.selectedDate);
  alert(`${r ? r.name : '利用者'}様の【${timing}】口腔ケア・義歯洗浄を記録しました！`);
}

// 6. 服薬・点眼
function renderMedTable() {
  const tbody = document.querySelector("#medTable tbody");
  tbody.innerHTML = "";
  const meds = (db.data.meds || []).filter(m => m.date === gState.selectedDate);

  gState.residents.forEach(r => {
    const tr = document.createElement("tr");

    const getMedBtn = (slot, label, isEyedrop = false) => {
      const done = meds.find(m => m.resident_id === r.id && m.slot === slot);
      if (done) {
        return `<span style="display:inline-block; padding:4px 8px; font-size:12px; font-weight:bold; color:#15803d; background:#dcfce7; border-radius:4px; border:1px solid #86efac;">✓ 済 (${done.staff_name || '済'})</span>`;
      }
      const btnClass = isEyedrop ? "btn btn-primary" : "btn btn-secondary";
      return `<button class="${btnClass}" style="padding:4px 8px; font-size:12px;" onclick="saveMed(${r.id}, '${slot}')">${label}</button>`;
    };

    tr.innerHTML = `
      <td>${r.room_no}</td>
      <td><strong>${r.name} 様</strong></td>
      <td>${getMedBtn("朝", "朝食後 ✓")}</td>
      <td>${getMedBtn("昼", "昼食後 ✓")}</td>
      <td>${getMedBtn("夕", "夕食後 ✓")}</td>
      <td>${getMedBtn("眠前", "眠前 ✓")}</td>
      <td>${getMedBtn("点眼", "点眼 (右キサラタン) ✓", true)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function saveMed(resId, slot) {
  const r = gState.residents.find(x => x.id === resId);
  const exists = (db.data.meds || []).some(m => m.date === gState.selectedDate && m.resident_id === resId && m.slot === slot);
  if (exists) {
    alert(`この方の【${slot}】の服薬/点眼はすでに完了記録があります。`);
    return;
  }

  const staff = document.getElementById("currentStaff").value;
  db.data.meds.push({
    id: Date.now(), date: gState.selectedDate, slot: slot, resident_id: resId, status: "済", staff_name: staff
  });
  db.save();
  renderMedTable();
  loadDateRecords(gState.selectedDate);
  alert(`${r ? r.name : '利用者'}様の【${slot}】服薬/点眼完了を記録しました！`);
}

// 7. 夜勤体位変換 ➔ 個人記録自動転記
function renderNightTable() {
  const tbody = document.querySelector("#nightTable tbody");
  tbody.innerHTML = "";
  const turns = (db.data.turns || []).filter(t => t.date === gState.selectedDate);

  gState.residents.forEach(r => {
    const tr = document.createElement("tr");
    const getActionBtn = (tm) => {
      const turn = turns.find(t => t.resident_id === r.id && t.time === tm);
      if (turn) return `<span style="color:#16a34a; font-weight:bold; font-size:12px;">✓ ${turn.action}</span>`;
      return `
        <select class="form-control" style="font-size:12px; padding:2px;" onchange="saveNightTurn(${r.id}, '${tm}', this.value)">
          <option value="">選択</option>
          <option value="安眠中">安眠中</option>
          <option value="左側臥位">左側臥位</option>
          <option value="右側臥位">右側臥位</option>
          <option value="仰臥位">仰臥位</option>
          <option value="おむつ交換">おむつ交換</option>
        </select>
      `;
    };

    tr.innerHTML = `
      <td>${r.room_no}</td>
      <td><strong>${r.name} 様</strong></td>
      <td>${getActionBtn("22:00")}</td>
      <td>${getActionBtn("00:00")}</td>
      <td>${getActionBtn("02:00")}</td>
      <td>${getActionBtn("04:00")}</td>
      <td>${getActionBtn("06:00")}</td>
    `;
    tbody.appendChild(tr);
  });
}

function saveNightTurn(resId, time, action) {
  if (!action) return;
  const staff = document.getElementById("currentStaff").value;
  let existing = (db.data.turns || []).find(t => t.date === gState.selectedDate && t.resident_id === resId && t.time === time);
  if (existing) {
    existing.action = action;
    existing.staff_name = staff;
  } else {
    db.data.turns.push({
      id: Date.now(), date: gState.selectedDate, time: time, resident_id: resId, action: action, staff_name: staff
    });
  }
  db.data.care_records.unshift({
    id: Date.now() + 1, recorded_at: `${gState.selectedDate} ${time}`, resident_id: resId, category: "巡視", content: `夜間巡視: ${action}`, staff_name: staff
  });
  db.save();
  loadDateRecords(gState.selectedDate);
  alert(`体位変換/巡視（${time}: ${action}）を記録しました！個人記録にも自動転記されました。`);
}

// 8. 月次体重
function renderWeightTable() {
  const tbody = document.querySelector("#weightTable tbody");
  tbody.innerHTML = "";
  const records = db.data.weight_records || [];
  
  // 前月の年月文字列を算出 (例: "2026-09" -> "2026-08")
  const [y, m] = gState.currentMonth.split("-").map(Number);
  const prevDate = new Date(y, m - 2, 1);
  const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;

  gState.residents.forEach(r => {
    // 当月と前月の最新レコードを取得
    const currentRec = records.filter(w => w.resident_id === r.id && (w.month === gState.currentMonth || (w.date && w.date.startsWith(gState.currentMonth)))).sort((a,b) => b.id - a.id)[0];
    const prevRec = records.filter(w => w.resident_id === r.id && (w.month === prevMonth || (w.date && w.date.startsWith(prevMonth)))).sort((a,b) => b.id - a.id)[0];

    let diffDisplay = "-";
    if (currentRec && prevRec) {
      const diff = (currentRec.weight - prevRec.weight).toFixed(1);
      const diffNum = parseFloat(diff);
      const diffStr = diffNum > 0 ? `+${diff} kg` : (diffNum < 0 ? `${diff} kg` : `±0.0 kg`);
      const color = diffNum > 0 ? '#16a34a' : (diffNum < 0 ? '#dc2626' : '#64748b');
      diffDisplay = `<strong style="color:${color}; font-size:14px;">${diffStr}</strong> <span style="font-size:11px; color:var(--text-muted);">(前月: ${prevRec.weight}kg)</span>`;
    } else if (currentRec) {
      diffDisplay = `<span style="font-size:12px; color:var(--text-muted);">- (前月なし)</span>`;
    } else if (prevRec) {
      diffDisplay = `<span style="font-size:12px; color:var(--text-muted);">前月: ${prevRec.weight}kg</span>`;
    }

    const currentVal = currentRec ? currentRec.weight : "";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.room_no}</td>
      <td><strong>${r.name} 様</strong></td>
      <td>${gState.currentMonth}</td>
      <td><input type="number" step="0.1" class="form-control" style="width:100px;" id="wVal_${r.id}" value="${currentVal}" placeholder="52.4"></td>
      <td>${diffDisplay}</td>
      <td><button class="btn btn-primary" style="padding:6px 12px; font-size:13px;" onclick="saveWeight(${r.id})">測定登録</button></td>
    `;
    tbody.appendChild(tr);
  });
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

// 9. シーツ交換チェック
function renderLinenTable() {
  const r = gState.residents.find(x => x.id === gState.selectedResidentId);
  document.getElementById("linenResidentName").textContent = r ? r.name : "利用者";

  const tbody = document.querySelector("#linenTable tbody");
  tbody.innerHTML = "";
  const linens = (db.data.linens || []).filter(l => l.date === gState.selectedDate);

  linens.forEach(l => {
    const res = gState.residents.find(x => x.id === l.resident_id);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${l.date}</td>
      <td>${res ? res.name + ' 様' : '-'}</td>
      <td><span style="font-weight:bold; color:#0284c7;">${l.exchange_type}</span></td>
      <td>${l.notes || '-'}</td>
      <td>${l.staff_name}</td>
    `;
    tbody.appendChild(tr);
  });
}

function saveLinen(type) {
  const staff = document.getElementById("currentStaff").value;
  const tm = new Date().toTimeString().slice(0, 5);
  const r = gState.residents.find(x => x.id === gState.selectedResidentId);

  db.data.linens.unshift({
    id: Date.now(), date: gState.selectedDate, resident_id: gState.selectedResidentId, exchange_type: type, notes: "", staff_name: staff
  });

  // 個人記録へ自動転記
  db.data.care_records.unshift({
    id: Date.now() + 1,
    recorded_at: `${gState.selectedDate} ${tm}`,
    resident_id: gState.selectedResidentId,
    category: "環境整備",
    content: `シーツ・リネン交換 (${type}) 実施`,
    staff_name: staff
  });

  db.save();
  loadDateRecords(gState.selectedDate);
  alert(`${r ? r.name : '利用者'}様のシーツ交換（${type}）を記録しました！個人記録へ自動転記されました。`);
}

// 10. 身だしなみチェック
function renderGroomingTable() {
  const tbody = document.querySelector("#groomingTable tbody");
  tbody.innerHTML = "";
  const groomings = (db.data.groomings || []).filter(g => g.date === gState.selectedDate);

  gState.residents.forEach(r => {
    const g = groomings.find(x => x.resident_id === r.id);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.room_no}</td>
      <td><strong>${r.name} 様</strong></td>
      <td><label><input type="checkbox" id="gNail_${r.id}" ${g && g.nail_done ? 'checked' : ''}> 爪切り済</label></td>
      <td><label><input type="checkbox" id="gShave_${r.id}" ${g && g.shave_done ? 'checked' : ''}> 髭剃り済</label></td>
      <td><label><input type="checkbox" id="gEar_${r.id}" ${g && g.ear_done ? 'checked' : ''}> 耳掃除済</label></td>
      <td><input type="text" id="gNotes_${r.id}" class="form-control" style="font-size:12px;" value="${g ? g.notes : ''}" placeholder="深爪注意、巻き爪等"></td>
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
    existing.nail_done = nail;
    existing.shave_done = shave;
    existing.ear_done = ear;
    existing.notes = notes;
    existing.staff_name = staff;
  } else {
    db.data.groomings.push({
      id: Date.now(), date: gState.selectedDate, resident_id: resId, nail_done: nail, shave_done: shave, ear_done: ear, notes: notes, staff_name: staff
    });
  }
  db.save();
  loadDateRecords(gState.selectedDate);
  alert("身だしなみチェックを保存しました！");
}

// 11. レク履歴
function renderRecreationTable() {
  const tbody = document.querySelector("#recreationTable tbody");
  tbody.innerHTML = "";
  (db.data.recreations || []).forEach(rec => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${rec.date}</td>
      <td><strong>${rec.title}</strong></td>
      <td>${rec.content || '-'}</td>
      <td>${rec.staff_name}</td>
    `;
    tbody.appendChild(tr);
  });
}

// 12. 面会 ＆ 荷物受付
function submitVisitation() {
  const visitor = document.getElementById("visitVisitor").value.trim();
  const items = document.getElementById("visitItems").value.trim();
  const storage = document.getElementById("visitStorage").value.trim();
  const notes = document.getElementById("visitNotes").value.trim();
  const staff = document.getElementById("currentStaff").value;
  const now = new Date();
  const nowStr = `${now.toISOString().split("T")[0]} ${now.toTimeString().slice(0, 5)}`;

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

// 13. 連絡帳 ＆ 【認】名前スタンプ (時間なし)
function renderNotebook() {
  const list = document.getElementById("notebookList");
  if (!list) return;
  list.innerHTML = "";
  const notebooks = (db.data.notebooks || []).filter(nb => nb.date === gState.selectedDate);

  if (notebooks.length === 0) {
    list.innerHTML = '<p style="font-size:13px; color:var(--text-muted);">本日の連絡事項・申し送りはありません。</p>';
  } else {
    notebooks.forEach(nb => {
      const card = document.createElement("div");
      card.style.background = nb.status === "未対応" ? "#fffbeb" : "#f0fdf4";
      card.style.border = `1px solid ${nb.status === "未対応" ? "#fde68a" : "#bbf7d0"}`;
      card.style.borderRadius = "8px";
      card.style.padding = "10px 12px";
      card.style.marginBottom = "8px";
      card.style.display = "flex";
      card.style.justifyContent = "space-between";
      card.style.alignItems = "center";

      card.innerHTML = `
        <div>
          <span style="font-size:12px; font-weight:bold; padding:2px 6px; border-radius:4px; ${nb.status==='未対応'?'background:#fef3c7; color:#92400e;':'background:#dcfce7; color:#166534;'}">
            ${nb.status === '未対応' ? '⚠️ 未対応' : '✓ 完了'}
          </span>
          <span style="font-size:14px; margin-left:8px;">${nb.content}</span>
          <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">記入: ${nb.staff_name} ${nb.resolved_staff ? `/ 対応者: ${nb.resolved_staff}` : ''}</div>
        </div>
        <div>
          ${nb.status === '未対応' ? `<button class="btn btn-success" style="padding:4px 10px; font-size:12px;" onclick="resolveNotebook(${nb.id})">対応完了にする</button>` : ''}
        </div>
      `;
      list.appendChild(card);
    });
  }

  const stampArea = document.getElementById("hankoStampArea");
  if (!stampArea) return;
  stampArea.innerHTML = "";
  const stamps = (db.data.notebook_stamps || []).filter(s => s.date === gState.selectedDate).map(s => s.staff_name);
  if (stamps.length === 0) {
    stampArea.innerHTML = '<span style="font-size:13px; color:var(--text-muted);">まだ確認した職員はいません。</span>';
  } else {
    stamps.forEach(s => {
      const stampEl = document.createElement("div");
      stampEl.className = "hanko-stamp";
      stampEl.textContent = s;
      stampEl.title = `「${s}」の確認を取り消す (クリックで解除)`;
      stampEl.onclick = () => removeNotebookStamp(gState.selectedDate, s);
      stampArea.appendChild(stampEl);
    });
  }

  // 選択中スタッフの確認状況に応じてボタン表示を動的更新
  const currentStaffEl = document.getElementById("currentStaff");
  const currentStaff = currentStaffEl ? currentStaffEl.value : "";
  const stampBtn = document.getElementById("notebookStampBtn");
  if (stampBtn && currentStaff) {
    const isStamped = stamps.includes(currentStaff);
    if (isStamped) {
      stampBtn.textContent = `↩️ ［${currentStaff}］の確認を取り消す`;
      stampBtn.className = "btn btn-secondary";
      stampBtn.style.color = "#dc2626";
    } else {
      stampBtn.textContent = "✓ 確認済みにする";
      stampBtn.className = "btn btn-primary";
      stampBtn.style.color = "";
    }
  }
}

function submitNotebook() {
  const content = document.getElementById("notebookContent").value.trim();
  if (!content) return;
  const staff = document.getElementById("currentStaff").value;
  db.data.notebooks.unshift({
    id: Date.now(), date: gState.selectedDate, category: "申し送り", content: content, status: "未対応", staff_name: staff, resolved_staff: null
  });
  db.save();
  document.getElementById("notebookContent").value = "";
  loadDateRecords(gState.selectedDate);
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

function toggleNotebookStamp() {
  const staff = document.getElementById("currentStaff").value;
  const isStamped = (db.data.notebook_stamps || []).some(s => s.date === gState.selectedDate && s.staff_name === staff);
  if (isStamped) {
    removeNotebookStamp(gState.selectedDate, staff);
  } else {
    stampNotebook();
  }
}

function stampNotebook() {
  const staff = document.getElementById("currentStaff").value;
  const exists = (db.data.notebook_stamps || []).some(s => s.date === gState.selectedDate && s.staff_name === staff);
  if (!exists) {
    db.data.notebook_stamps.push({ date: gState.selectedDate, staff_name: staff });
    db.save();
    loadDateRecords(gState.selectedDate);
  }
}

function removeNotebookStamp(date, staffName) {
  if (confirm(`「${staffName}」の確認を取り消しますか？`)) {
    db.data.notebook_stamps = (db.data.notebook_stamps || []).filter(s => !(s.date === date && s.staff_name === staffName));
    db.save();
    loadDateRecords(date);
  }
}

// 14. 現場クイック消費 (優しい「修正」ボタン付き)
function renderQuickConsume() {
  const r = gState.residents.find(x => x.id === gState.selectedResidentId);
  document.getElementById("consumeResidentName").textContent = r ? r.name : "利用者";

  const grid = document.getElementById("quickConsumeGrid");
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
        <div style="font-weight:bold; font-size:14px;">${item.name}</div>
        <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">
          現在庫: ${item.current_stock} ${item.unit} | 単価: ¥${item.unit_price}
          ${item.is_personal_billable ? '<span style="color:#0284c7;">[個人請求対象]</span>' : '<span style="color:#16a34a;">[施設負担]</span>'}
        </div>
      </div>
      <div style="margin-top:10px;">
        <button class="btn btn-primary" style="width:100%; padding:8px; font-size:14px;" onclick="consumeItem(${item.id}, 1)">➖ 1${item.unit}使用</button>
      </div>
    `;
    grid.appendChild(card);
  });

  renderRecentConsumeLogs();
}

function consumeItem(itemId, qty) {
  const item = gState.inventory.find(i => i.id === itemId);
  const res = gState.residents.find(r => r.id === gState.selectedResidentId);
  const staff = document.getElementById("currentStaff").value;
  const now = new Date();
  const nowStr = `${now.toISOString().split("T")[0]} ${now.toTimeString().slice(0, 5)}`;

  item.current_stock -= qty;

  if (item.is_personal_billable === 1) {
    db.data.consumptions.unshift({
      id: Date.now(),
      consumed_at: nowStr,
      resident_id: gState.selectedResidentId,
      item_id: item.id,
      item_name: item.name,
      quantity: qty,
      unit_price: item.unit_price,
      subtotal: item.unit_price * qty,
      staff_name: staff
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
    resident_id: gState.selectedResidentId,
    resident_name: res ? res.name : "",
    staff_name: staff,
    reason: "ケア時使用"
  });

  db.save();
  renderQuickConsume();
  checkGlobalAlerts();
  alert(`${item.name} を${qty}点消費しました！`);
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
    row.style.background = "#f8fafc";
    row.style.border = "1px solid #e2e8f0";
    row.style.borderRadius = "6px";
    row.style.marginBottom = "6px";
    row.style.fontSize = "13px";

    const rawTime = l.timestamp || l.log_time || "";
    const timeDisplay = rawTime.length >= 16 ? rawTime.slice(11, 16) : rawTime;

    row.innerHTML = `
      <div>
        <span>🕒 ${timeDisplay} <strong>${l.resident_name || ''} 様</strong>: ${l.item_name} (${Math.abs(l.change_qty)})</span>
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
  const nowStr = `${now.toISOString().split("T")[0]} ${now.toTimeString().slice(0, 5)}`;

  if (log && log.action_type === "消費") {
    const item = gState.inventory.find(i => i.id === log.item_id);
    const addQty = Math.abs(log.change_qty);
    if (item) item.current_stock += addQty;

    // 請求から削除
    const cIdx = db.data.consumptions.findIndex(c => c.resident_id === log.resident_id && c.item_id === log.item_id);
    if (cIdx >= 0) db.data.consumptions.splice(cIdx, 1);

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

// -------------------------------------------------------------
// 【事務所ポータル】
// -------------------------------------------------------------
function loadOfficeData() {
  renderOfficeInventory();
  renderOfficeEmergencySupplies();
  renderOfficeOrders();
  renderOfficeSuppliers();
  renderOfficeBillingSelect();
  renderOfficeDepositTable();
  renderOfficeVehicleLogs();
  renderOfficeFireDrills();
  renderOfficeCommittees();
  renderOfficeComplaints();
  renderOfficeIncidents();
  renderCareExpiryNotes();
}

function switchOfficeTab(tab) {
  gState.activeOfficeTab = tab;
  const tabs = document.querySelectorAll("#portalOfficeSection .sub-tab-btn");
  tabs.forEach(btn => {
    btn.classList.remove("active");
    const oc = btn.getAttribute("onclick") || "";
    if (oc.includes(`'${tab}'`) || oc.includes(`"${tab}"`)) {
      btn.classList.add("active");
    }
  });

  const tabMap = {
    inventory: "tabOfficeInventory", emergency: "tabOfficeEmergency", orders: "tabOfficeOrders",
    suppliers: "tabOfficeSuppliers", billing: "tabOfficeBilling", deposit: "tabOfficeDeposit",
    shift: "tabOfficeShift", vehicle: "tabOfficeVehicle", vaccine: "tabOfficeVaccine",
    fire: "tabOfficeFire", committee: "tabOfficeCommittee", complaint: "tabOfficeComplaint",
    incidents: "tabOfficeIncidents"
  };

  Object.values(tabMap).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });
  const target = document.getElementById(tabMap[tab]);
  if (target) target.style.display = "block";
}

// 在庫一覧 ＆ 棚卸し実数合わせ
function renderOfficeInventory() {
  const tbody = document.querySelector("#officeInventoryTable tbody");
  tbody.innerHTML = "";

  gState.inventory.forEach(i => {
    const tr = document.createElement("tr");
    const isLow = i.current_stock <= i.safety_stock;
    if (isLow) tr.style.backgroundColor = "#fee2e2";

    tr.innerHTML = `
      <td><strong>${i.name}</strong></td>
      <td>${i.is_personal_billable ? '<span style="color:#0284c7;">個人請求対象</span>' : '<span style="color:#16a34a;">施設負担</span>'}</td>
      <td><strong style="font-size:16px; ${isLow?'color:#dc2626;':''}">${i.current_stock}</strong> ${i.unit}</td>
      <td>${i.safety_stock} ${i.unit}</td>
      <td>¥${i.unit_price}</td>
      <td>${isLow ? '<span style="color:#dc2626; font-weight:bold;">⚠️ 要発注</span>' : '<span style="color:#16a34a;">正常</span>'}</td>
      <td>${i.supplier_name || '-'}</td>
      <td style="display:flex; gap:6px;">
        <button class="btn btn-secondary" style="padding:4px 8px; font-size:12px;" onclick="openOrderModalWithItem(${i.id})">発注起案</button>
        <button class="btn btn-secondary" style="padding:4px 8px; font-size:12px;" onclick="openInventoryAdjustModal(${i.id}, '${i.name}', ${i.current_stock})">棚卸し合わせ</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  const logTbody = document.querySelector("#inventoryLogsTable tbody");
  logTbody.innerHTML = "";
  (db.data.inventory_logs || []).slice(0, 30).forEach(l => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${l.timestamp}</td>
      <td><strong>${l.item_name}</strong></td>
      <td><span class="badge" style="${l.action_type==='消費'?'background:#fee2e2;color:#991b1b;':'background:#dcfce7;color:#166534;'}">${l.action_type}</span></td>
      <td>${l.change_qty > 0 ? '+' : ''}${l.change_qty}</td>
      <td><strong>${l.after_qty}</strong></td>
      <td>${l.resident_name ? l.resident_name + ' 様' : '-'}</td>
      <td><strong>${l.staff_name}</strong></td>
      <td>${l.reason || '-'}</td>
    `;
    logTbody.appendChild(tr);
  });
}

function openInventoryAdjustModal(itemId, itemName, currentStock) {
  document.getElementById("invAdjustItemId").value = itemId;
  document.getElementById("invAdjustItemName").value = itemName;
  document.getElementById("invAdjustCurrent").value = currentStock;
  document.getElementById("invAdjustActual").value = currentStock;
  document.getElementById("inventoryAdjustModal").style.display = "flex";
}

function submitInventoryAdjust() {
  const itemId = parseInt(document.getElementById("invAdjustItemId").value);
  const actualStr = document.getElementById("invAdjustActual").value;
  const actual = parseInt(actualStr, 10);
  if (isNaN(actual) || actual < 0) {
    alert("実際の倉庫在庫数（0以上の数値）を入力してください。");
    return;
  }
  const reason = document.getElementById("invAdjustReason").value || "実数合わせ";
  const staff = document.getElementById("currentStaff").value;
  const item = gState.inventory.find(i => i.id === itemId);
  const now = new Date();
  const nowStr = `${now.toISOString().split("T")[0]} ${now.toTimeString().slice(0, 5)}`;

  if (item) {
    const diff = actual - item.current_stock;
    item.current_stock = actual;

    db.data.inventory_logs.unshift({
      id: Date.now(), timestamp: nowStr, item_id: item.id, item_name: item.name,
      action_type: "棚卸し修正", change_qty: diff, after_qty: actual, staff_name: staff, reason: reason
    });

    db.save();
    closeModal("inventoryAdjustModal");
    loadOfficeData();
    checkGlobalAlerts();
    alert("棚卸し実在庫数に合わせました！");
  }
}

// 非常食・防災備蓄
function renderOfficeEmergencySupplies() {
  const tbody = document.querySelector("#emergencyTable tbody");
  tbody.innerHTML = "";
  const today = new Date();

  gState.emergencySupplies.forEach(item => {
    const expDate = new Date(item.expiry_date);
    const diffDays = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));
    const isClose = diffDays <= 14;

    const tr = document.createElement("tr");
    if (isClose) tr.style.backgroundColor = "#fef3c7";

    tr.innerHTML = `
      <td><strong>${item.name}</strong></td>
      <td><strong style="font-size:15px;">${item.quantity}</strong></td>
      <td>${item.unit}</td>
      <td><span style="${isClose?'color:#dc2626; font-weight:bold;':''}">${item.expiry_date}</span></td>
      <td>${isClose ? `<strong style="color:#d97706;">⚠️ あと${diffDays}日 (順次消費推奨)</strong>` : '<span style="color:#16a34a;">正常保管</span>'}</td>
      <td>${item.notes || '-'}</td>
    `;
    tbody.appendChild(tr);
  });
}

// 車両運行管理簿
function renderOfficeVehicleLogs() {
  const tbody = document.querySelector("#vehicleLogsTable tbody");
  tbody.innerHTML = "";
  (db.data.vehicle_logs || []).forEach(l => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${l.date}</td>
      <td><strong>${l.vehicle_name}</strong></td>
      <td>${l.driver_name}</td>
      <td>${l.purpose}</td>
      <td>${l.start_km} km</td>
      <td>${l.end_km} km</td>
      <td><strong style="color:#0284c7;">${l.distance_km} km</strong></td>
      <td>${l.key_returned ? '✓ 返却確認済' : '未返却'}</td>
      <td>${l.notes || '-'}</td>
    `;
    tbody.appendChild(tr);
  });
}

function submitVehicleLog() {
  const vname = document.getElementById("vehName").value;
  const driver = document.getElementById("vehDriver").value;
  const purpose = document.getElementById("vehPurpose").value;
  const startKm = parseInt(document.getElementById("vehStartKm").value);
  const endKm = parseInt(document.getElementById("vehEndKm").value);

  if (!purpose || isNaN(startKm) || isNaN(endKm) || endKm < startKm) {
    alert("運行情報およびメーター数値を正しく入力してください。");
    return;
  }

  db.data.vehicle_logs.unshift({
    id: Date.now(), date: new Date().toISOString().split("T")[0], vehicle_name: vname,
    driver_name: driver, purpose: purpose, start_km: startKm, end_km: endKm,
    distance_km: endKm - startKm, key_returned: 1, notes: ""
  });
  db.save();

  document.getElementById("vehPurpose").value = "";
  loadOfficeData();
  alert("車両運行管理簿に記録しました！走行距離が自動計算されました。");
}

// 消防訓練
function renderOfficeFireDrills() {
  const tbody = document.querySelector("#fireTable tbody");
  tbody.innerHTML = "";
  (db.data.fire_drills || []).forEach(d => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${d.date}</td>
      <td><strong>${d.drill_type}</strong></td>
      <td>${d.participants_count}名</td>
      <td>${d.scenario || '-'}</td>
      <td>${d.notes || '-'}</td>
      <td>${d.supervisor}</td>
    `;
    tbody.appendChild(tr);
  });
}

// 法定委員会
function renderOfficeCommittees() {
  const tbody = document.querySelector("#committeeTable tbody");
  tbody.innerHTML = "";
  const list = db.data.committees || db.data.committee_meetings || [];
  list.forEach(c => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${c.date}</td>
      <td><strong>${c.committee_name}</strong></td>
      <td>${c.attendees || '-'}</td>
      <td>${c.agenda || '-'}</td>
      <td>${c.content}</td>
    `;
    tbody.appendChild(tr);
  });
}

// 発注 ＆ 上司承認
function renderOfficeOrders() {
  const tbody = document.querySelector("#ordersTable tbody");
  tbody.innerHTML = "";
  (db.data.orders || []).forEach(o => {
    const tr = document.createElement("tr");
    let badgeColor = "#fef3c7; color:#92400e;";
    if (o.status === "承認済") badgeColor = "#dbeafe; color:#1e40af;";
    if (o.status === "納品完了") badgeColor = "#dcfce7; color:#166534;";
    if (o.status === "差戻し") badgeColor = "#fee2e2; color:#991b1b;";

    tr.innerHTML = `
      <td>${o.ordered_at || o.order_date || '-'}</td>
      <td><strong>${o.item_name}</strong></td>
      <td>${o.quantity}</td>
      <td>¥${(o.total_price || 0).toLocaleString()}</td>
      <td>${o.supplier_name || '-'}</td>
      <td>${o.reason || '-'}</td>
      <td><span style="font-size:12px; font-weight:bold; padding:2px 8px; border-radius:4px; background:${badgeColor}">${o.status}</span></td>
      <td>${o.applicant} / ${o.approver || '-'}</td>
      <td>
        ${o.status === '申請中' ? `
          <button class="btn btn-primary" style="padding:4px 8px; font-size:12px;" onclick="approveOrder(${o.id}, '承認済')">上司承認</button>
          <button class="btn btn-danger" style="padding:4px 8px; font-size:12px;" onclick="approveOrder(${o.id}, '差戻し')">差戻し</button>
        ` : ''}
        ${o.status === '承認済' ? `
          <button class="btn btn-success" style="padding:4px 8px; font-size:12px;" onclick="receiveOrder(${o.id})">納品受取 (在庫加算)</button>
        ` : ''}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function approveOrder(id, status) {
  const staff = document.getElementById("currentStaff").value;
  const o = db.data.orders.find(x => x.id === id);
  if (o) {
    o.status = status;
    o.approver = staff;
    db.save();
    loadOfficeData();
    alert(`発注申請を「${status}」にしました！`);
  }
}

function receiveOrder(id) {
  const o = db.data.orders.find(x => x.id === id);
  const staff = document.getElementById("currentStaff").value;
  const now = new Date();
  const nowStr = `${now.toISOString().split("T")[0]} ${now.toTimeString().slice(0, 5)}`;

  if (o) {
    o.status = "納品完了";
    const item = gState.inventory.find(i => i.name === o.item_name);
    if (item) {
      item.current_stock += o.quantity;
      db.data.inventory_logs.unshift({
        id: Date.now(), timestamp: nowStr, item_id: item.id, item_name: item.name,
        action_type: "納品", change_qty: o.quantity, after_qty: item.current_stock, staff_name: staff, reason: "発注受取納品"
      });
    }
    db.save();
    loadOfficeData();
    checkGlobalAlerts();
    alert("納品を受領し、在庫に加算しました！");
  }
}

// 取引先マスタ
function renderOfficeSuppliers() {
  const tbody = document.querySelector("#suppliersTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  gState.suppliers.forEach(s => {
    const tr = document.createElement("tr");
    const itemsList = (s.items || []).map(i => `${i.name} (¥${i.unit_price}/${i.unit})`).join(", ");
    tr.innerHTML = `
      <td><strong>${escapeHtml(s.name)}</strong></td>
      <td>${escapeHtml(s.phone || '-')}</td>
      <td>${escapeHtml(s.contact_person || '-')}</td>
      <td style="font-size:13px;">${escapeHtml(itemsList || '-')}</td>
      <td>
        <button class="btn btn-secondary" style="font-size:11px; padding:2px 8px; color:#dc2626;" onclick="deleteSupplier(${s.id})">削除</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function openSupplierModal() {
  document.getElementById("suppName").value = "";
  document.getElementById("suppPhone").value = "";
  document.getElementById("suppContact").value = "";
  document.getElementById("suppItems").value = "";
  document.getElementById("supplierModal").style.display = "flex";
}

function submitNewSupplier() {
  const name = document.getElementById("suppName").value.trim();
  const phone = document.getElementById("suppPhone").value.trim();
  const contact = document.getElementById("suppContact").value.trim();
  const itemsText = document.getElementById("suppItems").value.trim();

  if (!name) {
    alert("業者名を入力してください。");
    return;
  }

  const items = [];
  if (itemsText) {
    itemsText.split(/[\n,、]/).forEach(line => {
      const trimmed = line.trim();
      if (trimmed) {
        items.push({ name: trimmed, unit_price: 1000, unit: "個" });
      }
    });
  }

  const newSupplier = {
    id: Date.now(),
    name: name,
    phone: phone,
    contact_person: contact,
    items: items
  };

  gState.suppliers.push(newSupplier);
  db.data.suppliers = gState.suppliers;
  db.save();

  renderOfficeSuppliers();
  closeModal("supplierModal");
  alert(`「${name}」を取引先マスタに登録しました！`);
}

function deleteSupplier(id) {
  const s = gState.suppliers.find(x => x.id === id);
  if (!s) return;
  if (confirm(`取引先「${s.name}」を削除しますか？`)) {
    gState.suppliers = gState.suppliers.filter(x => x.id !== id);
    db.data.suppliers = gState.suppliers;
    db.save();
    renderOfficeSuppliers();
  }
}

// 月末請求明細
function renderOfficeBillingSelect() {
  const sel = document.getElementById("billingResidentSelect");
  sel.innerHTML = "";
  gState.residents.forEach(r => {
    const opt = document.createElement("option");
    opt.value = r.id;
    opt.textContent = `${r.room_no}号室 ${r.name} 様`;
    sel.appendChild(opt);
  });
  renderBillingDetail();
}

function renderBillingDetail() {
  const resId = parseInt(document.getElementById("billingResidentSelect").value);
  const r = gState.residents.find(x => x.id === resId);
  const consumptions = (db.data.consumptions || []).filter(c => c.resident_id === resId);
  const area = document.getElementById("billingDetailArea");

  if (!r) return;

  const summary = {};
  consumptions.forEach(c => {
    const itemName = c.item_name || "消耗品";
    const unitPrice = typeof c.unit_price === 'number' ? c.unit_price : 0;
    const qty = typeof c.quantity === 'number' ? c.quantity : 1;
    const subtotal = typeof c.subtotal === 'number' ? c.subtotal : (unitPrice * qty);

    if (!summary[itemName]) {
      summary[itemName] = { count: 0, unit_price: unitPrice, subtotal: 0 };
    }
    summary[itemName].count += qty;
    summary[itemName].subtotal += subtotal;
  });

  let totalAmount = 0;
  let rowsHtml = "";
  Object.keys(summary).forEach(itemName => {
    const item = summary[itemName];
    totalAmount += item.subtotal;
    rowsHtml += `
      <tr>
        <td>${itemName}</td>
        <td>${item.count}</td>
        <td>¥${item.unit_price.toLocaleString()}</td>
        <td><strong>¥${item.subtotal.toLocaleString()}</strong></td>
      </tr>
    `;
  });

  area.innerHTML = `
    <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:16px;">
      <h3 style="font-size:16px; margin-bottom:8px;">${r.room_no}号室 ${r.name} 様　消耗品ご請求明細書</h3>
      <table class="data-table" style="background:white;">
        <thead>
          <tr><th>品名</th><th>消費個数</th><th>単価</th><th>小計</th></tr>
        </thead>
        <tbody>
          ${rowsHtml || '<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">今月の個人請求対象の消費記録はありません。</td></tr>'}
        </tbody>
        <tfoot>
          <tr style="background:#f1f5f9; font-weight:bold; font-size:16px;">
            <td colspan="3" style="text-align:right;">総合計金額:</td>
            <td style="color:#dc2626;">¥${totalAmount.toLocaleString()}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;
}

// 預かり金出納帳 (利用者切り替え・日付連動・履歴絞り込み)
let gDepositFilterMode = "resident"; // "resident" (選択中利用者のみ) or "all" (全利用者)

function onDepositResidentChange() {
  const sel = document.getElementById("depResidentSelect");
  if (sel) {
    gState.selectedResidentId = parseInt(sel.value, 10);
    renderOfficeDepositTable();
  }
}

function toggleDepositFilter() {
  gDepositFilterMode = gDepositFilterMode === "resident" ? "all" : "resident";
  renderOfficeDepositTable();
}

function renderOfficeDepositTable() {
  const sel = document.getElementById("depResidentSelect");
  if (!sel) return;

  // セレクトボックスの選択肢構築
  const currentVal = parseInt(sel.value, 10) || gState.selectedResidentId;
  sel.innerHTML = "";
  gState.residents.forEach(r => {
    const opt = document.createElement("option");
    opt.value = r.id;
    opt.textContent = `${r.room_no}号室 ${r.name} 様`;
    if (r.id === currentVal) opt.selected = true;
    sel.appendChild(opt);
  });

  // 日付の初期セット (選択中の日付に連動)
  const dateInput = document.getElementById("depDate");
  if (dateInput && !dateInput.value) {
    dateInput.value = gState.selectedDate || new Date().toISOString().split("T")[0];
  }

  // 選択中の利用者情報と残高サマリー更新
  const activeResidentId = parseInt(sel.value, 10) || gState.selectedResidentId;
  const activeRes = gState.residents.find(x => x.id === activeResidentId);

  const nameEl = document.getElementById("depResidentName");
  const balEl = document.getElementById("depResidentBalance");
  const badgeEl = document.getElementById("depFilterStatusBadge");
  const btnEl = document.getElementById("depFilterToggleBtn");

  if (activeRes) {
    if (nameEl) nameEl.textContent = `【${activeRes.room_no}号室 ${activeRes.name} 様】`;
    if (balEl) balEl.textContent = `¥${(activeRes.deposit_balance || 0).toLocaleString()}`;
  }

  if (btnEl && badgeEl) {
    if (gDepositFilterMode === "resident") {
      btnEl.textContent = "全利用者の履歴を表示";
      badgeEl.textContent = "この利用者の出納を表示中";
      badgeEl.style.background = "#dbeafe";
      badgeEl.style.color = "#1d4ed8";
    } else {
      btnEl.textContent = "この利用者のみに絞り込む";
      badgeEl.textContent = "全利用者の出納を表示中";
      badgeEl.style.background = "#f1f5f9";
      badgeEl.style.color = "#475569";
    }
  }

  // 出納履歴の描画 (絞り込み)
  const tbody = document.querySelector("#depositTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const allDeposits = db.data.deposits || [];
  const targetDeposits = gDepositFilterMode === "resident"
    ? allDeposits.filter(d => d.resident_id === activeResidentId)
    : allDeposits;

  if (targetDeposits.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-muted); padding:16px;">出納記録はありません。</td></tr>`;
    return;
  }

  targetDeposits.forEach(d => {
    const res = gState.residents.find(x => x.id === d.resident_id);
    const tr = document.createElement("tr");
    const dType = d.type || d.transaction_type || '入金';
    const dCat = d.category || d.reason || 'お小遣い';
    const dAmount = typeof d.amount === 'number' ? d.amount : 0;
    const dBal = typeof d.balance === 'number' ? d.balance : (typeof d.balance_after === 'number' ? d.balance_after : 0);

    tr.innerHTML = `
      <td>${escapeHtml(d.date || '')}</td>
      <td><strong>${res ? escapeHtml(res.name) : ''} 様</strong></td>
      <td><span style="font-weight:bold; ${dType==='出金'?'color:#dc2626;':'color:#16a34a;'}">${escapeHtml(dType)}</span></td>
      <td>${escapeHtml(dCat)}</td>
      <td>¥${dAmount.toLocaleString()}</td>
      <td><strong>¥${dBal.toLocaleString()}</strong></td>
      <td>${escapeHtml(d.notes || d.reason || '-')}</td>
      <td>${escapeHtml(d.staff_name || '未設定')}</td>
    `;
    tbody.appendChild(tr);
  });
}

function submitDeposit() {
  const resId = parseInt(document.getElementById("depResidentSelect").value, 10);
  const dateInput = document.getElementById("depDate");
  const depDate = (dateInput && dateInput.value) ? dateInput.value : new Date().toISOString().split("T")[0];
  const type = document.getElementById("depType").value;
  const category = document.getElementById("depCategory").value;
  const amount = parseInt(document.getElementById("depAmount").value, 10);
  const notes = document.getElementById("depNotes").value;
  const staff = document.getElementById("currentStaff").value;
  const r = gState.residents.find(x => x.id === resId);

  if (!amount || amount <= 0 || !r) {
    alert("金額を正しく入力してください。");
    return;
  }

  const currentBal = r.deposit_balance || 0;
  const newBal = type === "入金" ? (currentBal + amount) : (currentBal - amount);
  r.deposit_balance = newBal;

  db.data.deposits.unshift({
    id: Date.now(),
    date: depDate,
    resident_id: resId,
    type: type,
    category: category,
    amount: amount,
    balance: newBal,
    notes: notes,
    staff_name: staff
  });
  db.save();

  document.getElementById("depAmount").value = "";
  document.getElementById("depNotes").value = "";
  renderOfficeDepositTable();
  alert("預かり金出納を記録しました！");
}

// 苦情受付簿
function renderOfficeComplaints() {
  const tbody = document.querySelector("#complaintsTable tbody");
  tbody.innerHTML = "";
  (db.data.complaints || []).forEach(c => {
    const res = gState.residents.find(x => x.id === c.resident_id);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${c.received_at}</td>
      <td><strong>${c.claimant}</strong></td>
      <td>${res ? res.name + ' 様' : '全体'}</td>
      <td>${c.content}</td>
      <td>${c.investigation || '-'}</td>
      <td>${c.improvement_plan || '-'}</td>
      <td>${c.reported_at || '-'}</td>
      <td><span style="font-weight:bold; color:#d97706;">${c.status}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

function openComplaintModal() {
  const resSel = document.getElementById("compResidentSelect");
  resSel.innerHTML = '<option value="">全体（対象者特定なし）</option>';
  gState.residents.forEach(r => {
    const opt = document.createElement("option");
    opt.value = r.id;
    opt.textContent = `${r.room_no}号室 ${r.name} 様`;
    resSel.appendChild(opt);
  });
  document.getElementById("complaintModal").style.display = "flex";
}

function submitComplaint() {
  const claimant = document.getElementById("compClaimant").value.trim();
  const resId = document.getElementById("compResidentSelect").value || null;
  const content = document.getElementById("compContent").value.trim();
  const investigation = document.getElementById("compInvestigation").value.trim();
  const improvement = document.getElementById("compImprovement").value.trim();
  const staff = document.getElementById("currentStaff").value;

  if (!claimant || !content) {
    alert("申出者と苦情内容を入力してください。");
    return;
  }

  db.data.complaints.unshift({
    id: Date.now(), received_at: new Date().toISOString().split("T")[0], claimant: claimant,
    resident_id: resId ? parseInt(resId) : null, content: content, investigation: investigation,
    improvement_plan: improvement, reported_at: "", status: "対応中", staff_name: staff
  });
  db.save();

  closeModal("complaintModal");
  loadOfficeData();
  alert("苦情・ご要望を受付台帳に登録しました！");
}

// 事故・ヒヤリハット
function renderOfficeIncidents() {
  const tbody = document.querySelector("#incidentsTable tbody");
  tbody.innerHTML = "";
  (db.data.incidents || []).forEach(inc => {
    const res = gState.residents.find(x => x.id === inc.resident_id);
    const timeDisplay = inc.occurred_at || inc.date || '-';
    const repType = inc.report_type || inc.level || 'ヒヤリハット';
    const situ = inc.situation || '-';
    const prev = inc.prevention || inc.countermeasure || '-';
    const supervisor = inc.supervisor_comment || inc.factor || '-';
    const st = inc.status || '報告済';

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${timeDisplay}</td>
      <td><span class="badge" style="background:#fee2e2; color:#991b1b;">${repType}</span></td>
      <td><strong>${res ? res.name + ' 様' : (inc.resident_name || '')}</strong></td>
      <td>${inc.place || '居室'}</td>
      <td>${situ}</td>
      <td>${prev}</td>
      <td>${supervisor}</td>
      <td><span class="badge" style="background:#dbeafe; color:#1e40af;">${st}</span></td>
      <td><button class="btn btn-secondary" style="padding:4px 8px; font-size:12px;" onclick="editIncident(${inc.id})">修正・追記</button></td>
    `;
    tbody.appendChild(tr);
  });
}

function openIncidentFromRecord() {
  const content = document.getElementById("recordContent").value;
  const resId = gState.selectedResidentId;
  const now = new Date();
  const nowStr = now.toISOString().slice(0, 16);

  document.getElementById("incId").value = "";
  document.getElementById("incOccurredAt").value = nowStr;
  document.getElementById("incSituation").value = content;
  document.getElementById("incCause").value = "";
  document.getElementById("incPrevention").value = "";
  document.getElementById("incSupervisor").value = "";

  const sel = document.getElementById("incResidentSelect");
  sel.innerHTML = "";
  gState.residents.forEach(r => {
    const opt = document.createElement("option");
    opt.value = r.id;
    opt.textContent = `${r.room_no}号室 ${r.name} 様`;
    if (r.id === resId) opt.selected = true;
    sel.appendChild(opt);
  });
  document.getElementById("incidentModal").style.display = "flex";
}

function editIncident(id) {
  const inc = db.data.incidents.find(x => x.id === id);
  if (!inc) return;

  document.getElementById("incId").value = inc.id;
  document.getElementById("incType").value = inc.report_type || inc.level || "ヒヤリハット";
  const occTime = inc.occurred_at || (inc.date ? `${inc.date}T09:00` : "");
  document.getElementById("incOccurredAt").value = occTime.replace(" ", "T");
  document.getElementById("incPlace").value = inc.place || "居室";
  document.getElementById("incSituation").value = inc.situation || "";
  document.getElementById("incCause").value = inc.cause || inc.factor || "";
  document.getElementById("incPrevention").value = inc.prevention || inc.countermeasure || "";
  document.getElementById("incSupervisor").value = inc.supervisor_comment || "";

  const sel = document.getElementById("incResidentSelect");
  sel.innerHTML = "";
  gState.residents.forEach(r => {
    const opt = document.createElement("option");
    opt.value = r.id;
    opt.textContent = `${r.room_no}号室 ${r.name} 様`;
    if (r.id === inc.resident_id) opt.selected = true;
    sel.appendChild(opt);
  });
  document.getElementById("incidentModal").style.display = "flex";
}

function saveIncidentReport() {
  const id = document.getElementById("incId").value;
  const type = document.getElementById("incType").value;
  const occurredAt = document.getElementById("incOccurredAt").value.replace("T", " ");
  const resSelectVal = document.getElementById("incResidentSelect").value;
  const resId = resSelectVal ? parseInt(resSelectVal, 10) : null;
  const place = document.getElementById("incPlace").value;
  const situation = document.getElementById("incSituation").value.trim();
  const cause = document.getElementById("incCause").value;
  const prevention = document.getElementById("incPrevention").value;
  const supervisor = document.getElementById("incSupervisor").value;
  const staff = document.getElementById("currentStaff").value;

  if (!situation) {
    alert("事故・ヒヤリハットの発生状況を入力してください。");
    return;
  }

  if (id) {
    const inc = db.data.incidents.find(x => x.id === parseInt(id));
    if (inc) {
      inc.report_type = type; inc.occurred_at = occurredAt; inc.resident_id = resId;
      inc.place = place; inc.situation = situation; inc.cause = cause;
      inc.prevention = prevention; inc.supervisor_comment = supervisor;
    }
  } else {
    db.data.incidents.unshift({
      id: Date.now(), report_type: type, occurred_at: occurredAt, resident_id: resId,
      place: place, situation: situation, cause: cause, prevention: prevention,
      supervisor_comment: supervisor, status: "作成済", staff_name: staff
    });
  }

  db.save();
  closeModal("incidentModal");
  if (gState.activePortal === "office") loadOfficeData();
  alert("報告書を保存しました！");
}

// 私物行追加
function openBelongingModal() {
  document.getElementById("belongingModal").style.display = "flex";
}
function submitBelonging() {
  const cat = document.getElementById("belCat").value;
  const name = document.getElementById("belItemName").value.trim();
  const qty = document.getElementById("belQty").value.trim();
  const notes = document.getElementById("belNotes").value.trim();

  if (!name || !qty) {
    alert("品名と個数を入力してください。");
    return;
  }

  db.data.belongings.push({
    id: Date.now(), resident_id: gState.selectedResidentId, category: cat,
    item_name: name, quantity: qty, marked: 1, notes: notes
  });
  db.save();

  closeModal("belongingModal");
  document.getElementById("belItemName").value = "";
  document.getElementById("belQty").value = "";
  document.getElementById("belNotes").value = "";
  renderResidentDetail();
  alert("私物台帳に行を追加しました！");
}

// 新規利用者登録・編集
function openAddResidentModal() {
  document.getElementById("resModalTitle").textContent = "👤 新規利用者の登録";
  document.getElementById("resEditId").value = "";
  document.getElementById("resRoomNo").value = "";
  document.getElementById("resName").value = "";
  document.getElementById("resCareLevel").value = "要介護3";
  document.getElementById("resStatus").value = "在所";
  document.getElementById("resBirthDate").value = "";
  document.getElementById("resPolicyStamp").value = "緊急搬送";
  document.getElementById("resDietType").value = "普通食 (一口大)";
  document.getElementById("resAllergies").value = "";
  document.getElementById("resParalysis").value = "";
  document.getElementById("resOralState").value = "残歯あり";
  document.getElementById("resDiseases").value = "";
  document.getElementById("resEmergencyContact").value = "";
  document.getElementById("resSensorAlert").value = "";
  document.getElementById("resCarePlanGoal").value = "";
  document.getElementById("resFamilyWishes").value = "";
  document.getElementById("resLifeHistory").value = "";
  document.getElementById("resDrInstructions").value = "";
  document.getElementById("resNextClinicDate").value = "";
  document.getElementById("resCareExpiryDate").value = "";

  document.getElementById("residentModal").style.display = "flex";
}

function openEditResidentModal(id) {
  const r = gState.residents.find(x => x.id === id);
  if (!r) return;

  document.getElementById("resModalTitle").textContent = `✏️ 利用者情報の編集 (${r.name} 様)`;
  document.getElementById("resEditId").value = r.id;
  document.getElementById("resRoomNo").value = r.room_no || "";
  document.getElementById("resName").value = r.name || "";
  document.getElementById("resCareLevel").value = r.care_level || "要介護3";
  document.getElementById("resStatus").value = r.status || "在所";
  document.getElementById("resBirthDate").value = r.birth_date || "";
  document.getElementById("resPolicyStamp").value = r.policy_stamp || "緊急搬送";
  document.getElementById("resDietType").value = r.diet_type || "普通食 (一口大)";
  document.getElementById("resAllergies").value = r.allergies || "";
  document.getElementById("resParalysis").value = r.paralysis || "";
  document.getElementById("resOralState").value = r.oral_state || "";
  document.getElementById("resDiseases").value = r.diseases || "";
  document.getElementById("resEmergencyContact").value = r.emergency_contact || "";
  document.getElementById("resSensorAlert").value = r.sensor_alert || "";
  document.getElementById("resCarePlanGoal").value = r.care_plan_goal || "";
  document.getElementById("resFamilyWishes").value = r.family_wishes || "";
  document.getElementById("resLifeHistory").value = r.life_history || "";
  document.getElementById("resDrInstructions").value = r.dr_instructions || "";
  document.getElementById("resNextClinicDate").value = r.next_clinic_date || "";
  document.getElementById("resCareExpiryDate").value = r.care_expiry_date || "";

  document.getElementById("residentModal").style.display = "flex";
}

function submitResidentForm() {
  const roomNo = document.getElementById("resRoomNo").value.trim();
  const name = document.getElementById("resName").value.trim();
  if (!roomNo || !name) {
    alert("居室番号と氏名は必須入力です。");
    return;
  }

  const editId = document.getElementById("resEditId").value;
  const residentData = {
    room_no: roomNo,
    name: name,
    care_level: document.getElementById("resCareLevel").value,
    status: document.getElementById("resStatus").value,
    birth_date: document.getElementById("resBirthDate").value,
    policy_stamp: document.getElementById("resPolicyStamp").value,
    diet_type: document.getElementById("resDietType").value,
    allergies: document.getElementById("resAllergies").value.trim(),
    paralysis: document.getElementById("resParalysis").value.trim(),
    oral_state: document.getElementById("resOralState").value.trim(),
    diseases: document.getElementById("resDiseases").value.trim(),
    emergency_contact: document.getElementById("resEmergencyContact").value.trim(),
    sensor_alert: document.getElementById("resSensorAlert").value.trim(),
    care_plan_goal: document.getElementById("resCarePlanGoal").value.trim(),
    family_wishes: document.getElementById("resFamilyWishes").value.trim(),
    life_history: document.getElementById("resLifeHistory").value.trim(),
    dr_instructions: document.getElementById("resDrInstructions").value.trim(),
    next_clinic_date: document.getElementById("resNextClinicDate").value,
    care_expiry_date: document.getElementById("resCareExpiryDate").value
  };

  let targetId;
  if (editId) {
    targetId = parseInt(editId);
    const idx = gState.residents.findIndex(x => x.id === targetId);
    if (idx !== -1) {
      gState.residents[idx] = Object.assign({}, gState.residents[idx], residentData);
    }
  } else {
    targetId = Date.now();
    residentData.id = targetId;
    residentData.deposit_balance = 0;
    gState.residents.push(residentData);
  }

  db.data.residents = gState.residents;
  db.save();

  closeModal("residentModal");
  renderResidentsStrip();
  selectResident(targetId);
  renderOfficeBillingSelect();
  if (typeof onDepositResidentChange === "function") {
    onDepositResidentChange();
  }
  checkGlobalAlerts();

  alert(editId ? `「${name} 様」の登録情報を更新しました！` : `新規利用者「${name} 様」を登録しました！`);
}

// 職員・認印管理
function openStaffModal() {
  document.getElementById("newStaffName").value = "";
  document.getElementById("newStaffRole").value = "";
  renderStaffModalList();
  document.getElementById("staffModal").style.display = "flex";
}

function renderStaffModalList() {
  const container = document.getElementById("staffModalList");
  if (!container) return;
  container.innerHTML = "";

  if (!gState.stamps || gState.stamps.length === 0) {
    container.innerHTML = '<div style="padding:10px; color:var(--text-muted); font-size:13px;">登録されている職員はいません。</div>';
    return;
  }

  gState.stamps.forEach((s, idx) => {
    const row = document.createElement("div");
    row.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding:8px 12px; border-bottom:1px solid #f1f5f9; gap:8px;";

    // 役職バッジの色分け
    const rank = getStaffRoleRank(s.role, s.name);
    let badgeStyle = "background:#f1f5f9; color:#475569;";
    if (rank === 1) badgeStyle = "background:#fef3c7; color:#92400e; font-weight:bold;";
    else if (rank <= 4) badgeStyle = "background:#eff6ff; color:#1d4ed8; font-weight:bold;";
    else if (rank === 5) badgeStyle = "background:#f0fdf4; color:#15803d; font-weight:bold;";
    else if (rank <= 8) badgeStyle = "background:#faf5ff; color:#7e22ce;";

    row.innerHTML = `
      <div style="display:flex; align-items:center; gap:10px; flex:1; min-width:0;">
        <span class="hanko-stamp" style="height:26px; min-width:48px; padding:2px 8px; font-size:12px; letter-spacing:1px;">${escapeHtml(s.name)}</span>
        <strong style="font-size:14px; white-space:nowrap;">${escapeHtml(s.name)}</strong>
        <span style="font-size:12px; padding:2px 8px; border-radius:4px; ${badgeStyle} white-space:nowrap;">${escapeHtml(s.role || '職員')}</span>
      </div>
      <div style="display:flex; align-items:center; gap:4px;">
        <button class="btn btn-secondary" style="font-size:11px; padding:2px 6px;" title="上へ移動" onclick="moveStaffOrder(${idx}, -1)" ${idx === 0 ? 'disabled style="opacity:0.4; padding:2px 6px;"' : ''}>▲</button>
        <button class="btn btn-secondary" style="font-size:11px; padding:2px 6px;" title="下へ移動" onclick="moveStaffOrder(${idx}, 1)" ${idx === gState.stamps.length - 1 ? 'disabled style="opacity:0.4; padding:2px 6px;"' : ''}>▼</button>
        <button class="btn btn-secondary" style="font-size:11px; padding:2px 8px; color:#dc2626;" onclick="deleteStaffStamp(${idx})">削除</button>
      </div>
    `;
    container.appendChild(row);
  });
}

function autoSortStaffByRank() {
  gState.stamps = sortStaffList(gState.stamps);
  db.data.stamps = gState.stamps;
  db.save();
  renderStaffSelect();
  renderStaffModalList();
  alert("登録職員を役職・序列順（施設長・管理者 → リーダー → 看護 → 介護 → 事務）に整列しました！");
}

function moveStaffOrder(index, direction) {
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= gState.stamps.length) return;
  const temp = gState.stamps[index];
  gState.stamps[index] = gState.stamps[newIndex];
  gState.stamps[newIndex] = temp;
  db.data.stamps = gState.stamps;
  db.save();
  renderStaffSelect();
  renderStaffModalList();
}

function submitNewStaffStamp() {
  const name = document.getElementById("newStaffName").value.trim();
  const role = document.getElementById("newStaffRole").value.trim() || "介護職員";
  if (!name) {
    alert("職員名を入力してください。");
    return;
  }

  const exists = gState.stamps.some(s => s.name === name);
  if (exists) {
    alert(`「${name}」は既に登録されています。`);
    return;
  }

  gState.stamps.push({ name: name, role: role });
  // 役職・序列順（偉い人順）に自動整列
  gState.stamps = sortStaffList(gState.stamps);
  db.data.stamps = gState.stamps;
  db.save();

  renderStaffSelect();
  renderStaffModalList();
  document.getElementById("newStaffName").value = "";
  document.getElementById("newStaffRole").value = "";
  alert(`「${name} (${role})」を登録しました！（役職・序列順に配置されました）`);
}

function deleteStaffStamp(index) {
  if (gState.stamps.length <= 1) {
    alert("最低1名の職員が必要です。");
    return;
  }
  const target = gState.stamps[index];
  if (!target) return;
  if (confirm(`職員「${target.name}」を削除しますか？`)) {
    gState.stamps.splice(index, 1);
    db.data.stamps = gState.stamps;
    db.save();
    renderStaffSelect();
    renderStaffModalList();
  }
}

// 発注申請
function openOrderModal() {
  const suppSel = document.getElementById("orderSupplierSelect");
  suppSel.innerHTML = "";
  gState.suppliers.forEach(s => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.name;
    suppSel.appendChild(opt);
  });
  onSupplierChangeInOrder();
  document.getElementById("orderModal").style.display = "flex";
}

function openOrderModalWithItem(itemId) {
  openOrderModal();
  const item = gState.inventory.find(i => i.id === itemId);
  if (item && item.supplier_id) {
    document.getElementById("orderSupplierSelect").value = item.supplier_id;
    onSupplierChangeInOrder();
    document.getElementById("orderItemSelect").value = item.name;
    onItemChangeInOrder();
  }
}

function onSupplierChangeInOrder() {
  const suppId = parseInt(document.getElementById("orderSupplierSelect").value);
  const supp = gState.suppliers.find(s => s.id === suppId);
  const itemSel = document.getElementById("orderItemSelect");
  itemSel.innerHTML = "";

  if (supp && supp.items) {
    supp.items.forEach(i => {
      const opt = document.createElement("option");
      opt.value = i.name;
      opt.textContent = `${i.name} (¥${i.unit_price}/${i.unit})`;
      opt.dataset.price = i.unit_price;
      itemSel.appendChild(opt);
    });
  }
  onItemChangeInOrder();
}

function onItemChangeInOrder() {
  const itemSel = document.getElementById("orderItemSelect");
  const selectedOpt = itemSel.selectedOptions[0];
  const price = selectedOpt ? parseInt(selectedOpt.dataset.price || 0) : 0;
  document.getElementById("orderUnitPrice").value = price;
  calcOrderTotal();
}

function calcOrderTotal() {
  const qty = parseInt(document.getElementById("orderQty").value || 1);
  const price = parseInt(document.getElementById("orderUnitPrice").value || 0);
  document.getElementById("orderTotalPrice").value = qty * price;
}

function submitOrderApply() {
  const suppId = parseInt(document.getElementById("orderSupplierSelect").value);
  const supp = gState.suppliers.find(s => s.id === suppId);
  const itemName = document.getElementById("orderItemSelect").value;
  const qty = parseInt(document.getElementById("orderQty").value) || 1;
  const unitPrice = parseInt(document.getElementById("orderUnitPrice").value) || 0;
  const totalPrice = qty * unitPrice;
  const reason = document.getElementById("orderReason").value;
  const applicant = document.getElementById("currentStaff").value;

  db.data.orders.unshift({
    id: Date.now(), ordered_at: new Date().toISOString().split("T")[0], supplier_id: suppId,
    supplier_name: supp ? supp.name : "", item_name: itemName, quantity: qty,
    unit_price: unitPrice, total_price: totalPrice, reason: reason, status: "申請中",
    applicant: applicant, approver: null, approved_at: null
  });
  db.save();

  closeModal("orderModal");
  loadOfficeData();
  alert("発注申請を提出しました（上司承認待ちへ）！");
}

function updateResidentStatus(resId, status) {
  const r = gState.residents.find(x => x.id === resId);
  if (r) {
    r.status = status;
    db.save();
    renderResidentsStrip();
    renderResidentDetail();
    if (gState.activeCareTab === "vitals") renderVitalsTable();
    if (gState.activeCareTab === "meal") renderMealsTable();
    alert(`在籍ステータスを「${status}」に更新しました`);
  }
}

function renderCareExpiryNotes() {
  const area = document.getElementById("careExpiryNotesArea");
  area.innerHTML = "";
  const today = new Date();

  gState.residents.forEach(r => {
    if (r.care_expiry_date) {
      const expiryDate = new Date(r.care_expiry_date);
      const diffDays = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
      const isUrgent = diffDays <= 30;

      const item = document.createElement("div");
      item.style.padding = "8px 12px";
      item.style.borderRadius = "6px";
      item.style.background = isUrgent ? "#fee2e2" : "#fef3c7";
      item.style.border = `1px solid ${isUrgent ? '#fca5a5' : '#fde68a'}`;
      item.style.display = "flex";
      item.style.justifyContent = "space-between";
      item.style.alignItems = "center";

      item.innerHTML = `
        <div>
          <strong>${r.room_no}号室 ${r.name} 様</strong> (${r.care_level})
          <span style="margin-left:12px;">満了日: ${r.care_expiry_date}</span>
        </div>
        <div>
          <strong style="${isUrgent ? 'color:#dc2626;' : 'color:#b45309;'}">あと ${diffDays} 日で満了</strong>
        </div>
      `;
      area.appendChild(item);
    }
  });
}

function closeModal(id) {
  document.getElementById(id).style.display = "none";
}

function openShareModal() {
  const modal = document.getElementById("shareModal");
  if (modal) {
    db.renderShareModalUrls();
    modal.style.display = "flex";
  }
}

function copyShareUrl(url) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => {
      alert("✅ URLをコピーしました！\n" + url + "\n\n施設内のタブレット（iPad等）のブラウザを開いて貼り付けてください。\n同じデータがリアルタイムで共有されます。");
    }).catch(() => {
      prompt("以下のURLをコピーしてタブレットで開いてください:", url);
    });
  } else {
    prompt("以下のURLをコピーしてタブレットで開いてください:", url);
  }
}

function promptChangeTunnelUrl() {
  const current = localStorage.getItem("care_portal_tunnel_url") || "https://percentage-freelance-unwrap-spatial.trycloudflare.com";
  const newUrl = prompt("学校PC側で発行された最新のCloudflare Tunnel URLを入力してください:", current);
  if (newUrl && newUrl.trim() !== "") {
    localStorage.setItem("care_portal_tunnel_url", newUrl.trim());
    if (db) db.renderShareModalUrls();
    alert("✅ クラウド共有URLとQRコードを更新しました！\n" + newUrl.trim());
  }
}

function reloadStateFromDb() {
  if (!db || !db.data) return;
  updateFacilityNameUI();
  gState.residents = db.data.residents;
  gState.inventory = db.data.inventory;
  gState.suppliers = db.data.suppliers;
  gState.stamps = db.data.stamps;
  gState.templates = db.data.templates;
  gState.recreations = db.data.recreations;
  gState.emergencySupplies = db.data.emergency_supplies;

  if (typeof renderStaffSelect === 'function') renderStaffSelect();
  if (typeof renderResidentsStrip === 'function') renderResidentsStrip();
  if (typeof renderResidentDetail === 'function') renderResidentDetail();
  if (typeof renderCalendar === 'function') renderCalendar();
  if (typeof loadDateRecords === 'function') loadDateRecords(gState.selectedDate);
  if (typeof checkGlobalAlerts === 'function') checkGlobalAlerts();
  if (gState.activePortal === "office") {
    if (typeof loadOfficeData === 'function') loadOfficeData();
  }
}

function setupEventListeners() {
  setInterval(() => {
    const preview = document.getElementById("recordTimePreview");
    if (preview) {
      const cur = new Date();
      const timeStr = cur.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      preview.textContent = "現在: " + cur.toLocaleDateString() + " " + timeStr;
    }
  }, 1000);
}

// ==========================================
// 写真・重要書類保管庫 管理機能
// ==========================================
let currentPhotoCategory = 'documents';
let currentPickedPhotoDataUrl = null;

function openPhotoModal(category) {
  const modal = document.getElementById("photoModal");
  if (!modal) return;
  const res = gState.residents ? gState.residents.find(x => x.id === gState.selectedResidentId) : null;
  const titleEl = document.getElementById("photoModalTitle");
  if (titleEl) {
    titleEl.textContent = res ? `📁 ${res.name} 様の写真・重要書類保管庫` : "📁 写真・重要書類保管庫";
  }

  const formArea = document.getElementById("addPhotoFormArea");
  if (formArea) formArea.style.display = "none";
  resetPhotoForm();

  switchPhotoCategory(category || 'documents');
  modal.style.display = "flex";
}

function switchPhotoCategory(cat) {
  currentPhotoCategory = cat;
  const btnDoc = document.getElementById("tabBtnDocPhotos");
  const btnPersonal = document.getElementById("tabBtnPersonalPhotos");
  if (btnDoc && btnPersonal) {
    if (cat === "documents") {
      btnDoc.className = "btn btn-primary";
      btnPersonal.className = "btn btn-outline";
    } else {
      btnDoc.className = "btn btn-outline";
      btnPersonal.className = "btn btn-primary";
    }
  }
  const selectCat = document.getElementById("photoNewCategory");
  if (selectCat) selectCat.value = cat;

  renderPhotoGrid();
}

function renderPhotoGrid() {
  const grid = document.getElementById("photoGridArea");
  if (!grid) return;
  grid.innerHTML = "";

  const photos = (db.data.photos || []).filter(p => 
    p.resident_id === gState.selectedResidentId && p.category === currentPhotoCategory
  );

  if (photos.length === 0) {
    const isDoc = currentPhotoCategory === 'documents';
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align:center; padding:36px 12px; color:var(--text-muted); background:#f8fafc; border-radius:8px; border:1px dashed #cbd5e1;">
        <div style="font-size:32px; margin-bottom:8px;">${isDoc ? '📜' : '📷'}</div>
        <div style="font-weight:bold; font-size:14px; margin-bottom:4px;">
          ${isDoc ? '重要書類・同意書はまだありません' : '個人写真はまだありません'}
        </div>
        <div style="font-size:12px;">右上の「➕ 写真・書類の追加」から撮影・アップロードするか、<br>PCの保存フォルダに直接ファイルを入れてください。</div>
      </div>
    `;
    return;
  }

  photos.forEach(p => {
    const card = document.createElement("div");
    card.style.cssText = "background:#fff; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.06); display:flex; flex-direction:column; transition:transform 0.15s, box-shadow 0.15s;";
    card.onmouseenter = () => { card.style.transform = "translateY(-2px)"; card.style.boxShadow = "0 4px 10px rgba(0,0,0,0.12)"; };
    card.onmouseleave = () => { card.style.transform = "none"; card.style.boxShadow = "0 1px 3px rgba(0,0,0,0.06)"; };

    const safeTitle = (p.title || "").replace(/'/g, "\\'");
    card.innerHTML = `
      <div style="position:relative; width:100%; height:130px; background:#0f172a; cursor:pointer; overflow:hidden; display:flex; align-items:center; justify-content:center;" onclick="openLightbox('${p.url}', '${safeTitle}')">
        <img src="${p.url}" alt="${p.title || '写真'}" style="width:100%; height:100%; object-fit:cover;" onerror="this.onerror=null; this.src=''; this.parentElement.innerHTML='<span style=\\'color:#94a3b8; font-size:12px;\\'>⚠️ 画像読込エラー</span>';">
        <div style="position:absolute; bottom:4px; right:4px; background:rgba(0,0,0,0.6); color:white; font-size:10px; padding:2px 6px; border-radius:4px;">🔍 拡大</div>
      </div>
      <div style="padding:10px; flex:1; display:flex; flex-direction:column; justify-content:space-between;">
        <div>
          <div style="font-weight:bold; font-size:13px; color:#1e293b; margin-bottom:4px; line-height:1.3; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;" title="${p.title || ''}">
            ${p.title || "名称未設定"}
          </div>
          <div style="font-size:11px; color:#64748b;">📅 ${p.uploaded_at || "-"}</div>
          <div style="font-size:11px; color:#64748b;">👤 担当: ${p.uploader || "-"}</div>
        </div>
        <div style="margin-top:8px; display:flex; justify-content:space-between; align-items:center; border-top:1px solid #f1f5f9; padding-top:6px;">
          <button class="btn btn-secondary" style="font-size:11px; padding:3px 8px;" onclick="openLightbox('${p.url}', '${safeTitle}')">拡大表示</button>
          <button class="btn" style="background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5; font-size:11px; padding:3px 8px;" onclick="deletePhoto(${p.id})">削除</button>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
}

function toggleAddPhotoForm() {
  const form = document.getElementById("addPhotoFormArea");
  if (!form) return;
  if (form.style.display === "none" || !form.style.display) {
    resetPhotoForm();
    form.style.display = "block";
    const titleInput = document.getElementById("photoNewTitle");
    if (titleInput) titleInput.focus();
  } else {
    form.style.display = "none";
  }
}

function resetPhotoForm() {
  currentPickedPhotoDataUrl = null;
  const titleInput = document.getElementById("photoNewTitle");
  if (titleInput) titleInput.value = "";
  const fileInput = document.getElementById("photoFileInput");
  if (fileInput) fileInput.value = "";
  const previewContainer = document.getElementById("photoPreviewContainer");
  if (previewContainer) previewContainer.style.display = "none";
  const previewImg = document.getElementById("photoPreviewImg");
  if (previewImg) previewImg.src = "";
  const selectCat = document.getElementById("photoNewCategory");
  if (selectCat) selectCat.value = currentPhotoCategory;
}

function onPhotoFilePicked(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const titleInput = document.getElementById("photoNewTitle");
  if (titleInput && !titleInput.value.trim()) {
    const baseName = file.name.replace(/\.[^/.]+$/, "");
    titleInput.value = baseName;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    const rawDataUrl = e.target.result;
    const img = new Image();
    img.onload = function() {
      const maxDim = 1200;
      let w = img.width;
      let h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      currentPickedPhotoDataUrl = canvas.toDataURL("image/jpeg", 0.82);

      const previewContainer = document.getElementById("photoPreviewContainer");
      const previewImg = document.getElementById("photoPreviewImg");
      if (previewContainer && previewImg) {
        previewImg.src = currentPickedPhotoDataUrl;
        previewContainer.style.display = "block";
      }
    };
    img.src = rawDataUrl;
  };
  reader.readAsDataURL(file);
}

function saveNewPhoto() {
  if (!currentPickedPhotoDataUrl) {
    alert("写真または書類の画像ファイルを選択してください。");
    return;
  }

  const cat = document.getElementById("photoNewCategory").value || currentPhotoCategory;
  let title = document.getElementById("photoNewTitle").value.trim();
  if (!title) {
    title = (cat === "documents" ? "重要書類 " : "写真 ") + new Date().toLocaleDateString();
  }

  const staff = (document.getElementById("currentStaff") && document.getElementById("currentStaff").value) || "職員";
  const d = new Date();
  const nowStr = d.getFullYear() + "-" +
    String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0") + " " +
    String(d.getHours()).padStart(2, "0") + ":" +
    String(d.getMinutes()).padStart(2, "0");

  if (!db.data.photos) db.data.photos = [];

  const newPhoto = {
    id: Date.now(),
    resident_id: gState.selectedResidentId,
    category: cat,
    title: title,
    url: currentPickedPhotoDataUrl,
    uploaded_at: nowStr,
    uploader: staff
  };

  db.data.photos.unshift(newPhoto);
  db.save();

  resetPhotoForm();
  const formArea = document.getElementById("addPhotoFormArea");
  if (formArea) formArea.style.display = "none";

  currentPhotoCategory = cat;
  switchPhotoCategory(cat);
  if (typeof renderResidentDetail === 'function') renderResidentDetail();

  alert("✅ " + (cat === "documents" ? "重要書類" : "写真") + "を登録・保存しました！");
}

function deletePhoto(id) {
  if (!confirm("この写真・書類を保管庫から削除してもよろしいですか？")) return;
  db.data.photos = (db.data.photos || []).filter(p => p.id !== id);
  db.save();
  renderPhotoGrid();
  if (typeof renderResidentDetail === 'function') renderResidentDetail();
}

function openPCFolder() {
  fetch("/api/open-folder?type=" + encodeURIComponent(currentPhotoCategory))
    .then(r => r.json())
    .then(data => {
      if (data && data.success) {
        alert("🖥️ PCのエクスプローラーで保存フォルダを開きました。\nファイルを直接追加・確認できます。");
      } else {
        alert("フォルダ場所:\ncare_portal\\data\\photos\\" + currentPhotoCategory);
      }
    })
    .catch(() => {
      alert("フォルダ場所:\ncare_portal\\data\\photos\\" + currentPhotoCategory);
    });
}

function openLightbox(src, caption) {
  const modal = document.getElementById("lightboxModal");
  const img = document.getElementById("lightboxImg");
  const cap = document.getElementById("lightboxCaption");
  if (!modal || !img) return;

  img.src = src;
  if (cap) cap.textContent = caption || "";
  modal.style.display = "flex";
}
