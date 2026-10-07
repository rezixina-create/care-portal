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

// 夜間巡視・体位変換 自動生成定型文の標準初期値 (施設・現場ごとのカスタマイズ対応)
const DEFAULT_NIGHT_TURN_TEMPLATES = {
 "安眠中": "【{time} 定時巡視】訪室確認。静かに安眠中、呼吸状態安定。掛物の乱れを整え、ナースコールを手元に確認。異常なし。",
 "左側臥位": "【{time} 定時巡視・体位変換】訪室確認。仰臥位から左側臥位へ体位変換実施。仙骨部除圧クッションを背部・膝間に挿入。良肢位保持、寝具を整える。",
 "右側臥位": "【{time} 定時巡視・体位変換】訪室確認。左側臥位から右側臥位へ体位変換実施。除圧クッション配置し安楽な姿勢を保持。呼吸落ち着き安眠継続。",
 "仰臥位": "【{time} 定時巡視・体位変換】訪室確認。側臥位から仰臥位へ体位変換実施。背部・仙骨部の皮膚状態確認（発赤悪化なし）。膝下クッション配置。",
 "おむつ交換": "【{time} 定時巡視・おむつ交換】訪室確認。おむつ汚染（排尿あり）確認しパッド交換実施。陰部清拭、皮膚保護処置。寝具交換なし、安眠。"
};

// データベース管理クラス (ハイブリッド: サーバー同期 ＋ ローカル保存)
class LocalDB {
 constructor() {
 this.key = "CARE_PORTAL_DATABASE_V1";
 this.isServerMode = window.location.protocol.startsWith("http");
 this.data = this.loadLocal();
 this.serverIPs = [];
 this.serverPort = window.location.port || 8888;
 this.hasSyncedWithServer = !this.isServerMode;
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
 "consumptions", "orders", "deposits", "complaints", "incidents", "photos",
 "daily_schedules", "monthly_notices", "care_summaries", "body_schema_pins",
 "eyedrop_orders"
 ];
 arrayKeys.forEach(k => {
 if (!Array.isArray(d[k])) d[k] = [];
 });
 if (!d.night_turn_templates || typeof d.night_turn_templates !== "object") {
 d.night_turn_templates = Object.assign({}, DEFAULT_NIGHT_TURN_TEMPLATES);
 }
 if (!Array.isArray(d.care_summaries) || d.care_summaries.length === 0) {
 d.care_summaries = [
 {
 id: 1,
 resident_id: 1,
 created_at: "2026-10-01",
 updated_at: "2026-10-01",
 staff_name: "山田 孝之",
 summary_type: "新規入所時サマリー",
 basic_info: "要介護3。生年月日: 1940-10-15 (85歳)。キーパーソン: 長男・佐藤 一郎様 (090-1111-2222)。認知症高齢者の日常生活自立度IIb。障害高齢者の日常生活自立度B1。",
 background: "自宅にて長男家族と同居していたが、2026年8月に自宅内で転倒し右大腿骨頸部骨折。急性期病院にて骨接合術施行。リハビリ継続の上、在宅介護困難となり当施設へ新規入所。",
 physical_cognitive: "右股関節可動域制限・右下肢軽度筋力低下あり。歩行時にすり足・ふらつき認める。短期記憶の低下あるが、見当識はおおむね保たれており穏やかに意思疎通可能。",
 adl: "寝返り・起き上がり自立。立ち上がり・車椅子移乗は見守り・一部軽介助。歩行器歩行にて20m程度自立移動可能。更衣・整容は一部介助（ボタン留め・靴下着脱等）。入浴は一般浴にて洗身・洗髪見守り介助。",
 meals_hydration: "普通食 (一口大)。スプーンおよび箸使用にて自力摂取可能（むせ込み見守り）。水分目標量1,200ml/日。下顎軽度引き気味での嚥下を声かけ。",
 excretion: "日中はトイレ誘導にて排尿自立・見守り。夜間はリハビリパンツ＋尿取りパッド使用。定時声かけにて失禁ほぼなし。便秘傾向のため水分摂取促す。",
 sleep: "21:00就寝、6:00起床。夜間1〜2回トイレ覚醒あり。中途覚醒時は転倒注意のため離床センサーマット使用。声かけにて再入眠良好。",
 meds: "降圧薬・血糖降下薬内服中。朝・夕食後。看護師・介護職員による配薬・服薬確認にて全量自己内服。",
 medical_care: "右大腿骨部術創治癒・異常なし。毎日のバイタルチェック（血圧・体温・脈拍・SpO2）。褥瘡・皮膚剥離なし。保湿剤塗布継続。",
 dementia_behavior: "夕方時に「そろそろ帰らないと」と帰宅願望が時折出現。お茶を勧め、大工職人時代の仕事や大相撲の話題を傾聴することで落ち着かれる。",
 care_notes: "急がせる声かけは焦りを生み転倒リスクとなるため、ゆっくりとしたペースで対応する。右側からの声かけ・介助時は荷重痛に配慮。大工道具や相撲の話題を好まれる。",
 family_info: "長男様が週1回程度面会来訪。何かあれば長男様へ連絡希望。看取り方針については自然な経過での見守りを希望（施設での看取り・DNAR合意済）。",
 future_goals: "歩行器による安全な自立歩行を維持し、転倒防止を図る。食事摂取量を維持し低血糖・脱水を予防。他入所者とのレクリエーション参加を促す。"
 },
 {
 id: 2,
 resident_id: 4,
 created_at: "2026-10-02",
 updated_at: "2026-10-02",
 staff_name: "鈴木 美智子",
 summary_type: "入院後再入所サマリー",
 basic_info: "要介護1。生年月日: 1942-08-01 (84歳)。キーパーソン: 長男・高橋 健様 (090-7777-8888)。現在一時入院中（大腿骨経過観察・点滴加療）。退院復帰予定。",
 background: "骨粗鬆症の治療および精査のため協力病院へ一時入院。病状軽快に伴い再入所調整中。",
 physical_cognitive: "四肢麻痺なし。軽度認知機能低下あるが会話明瞭。歩行器使用にて自立歩行可能。",
 adl: "移動・更衣・排泄自立。入浴時見守り。立ち上がり時のふらつき予防。",
 meals_hydration: "普通食全量摂取。むせ込みなし。水分摂取良好。",
 excretion: "トイレ排泄自立。夜間念のためパッド使用。",
 sleep: "睡眠良好。夜間覚醒時も自力トイレ歩行可能。",
 meds: "骨粗鬆症治療薬・ビタミン剤内服。",
 medical_care: "特別な医療処置なし。定期受診・骨密度測定フォロー。",
 dementia_behavior: "目立ったBPSDなし。明るく社交的。",
 care_notes: "活動的なため無理な早歩きによる転倒に留意。適度な休憩を促す。",
 family_info: "長男様がこまめに連絡対応。退院日決定次第共有いただく手はず。",
 future_goals: "再入所後のADL低下を防ぎ、自立した日常動作を維持する。"
 },
 {
 id: 3,
 resident_id: 2,
 created_at: "2026-10-02",
 updated_at: "2026-10-02",
 staff_name: "佐藤 恵美",
 summary_type: "定期見直しサマリー",
 basic_info: "要介護2。生年月日: 1938-11-20 (87歳)。キーパーソン: 長女・田中 美咲様 (090-3333-4444)。認知症自立度I。障害自立度A2。心不全・高血圧・両変形性膝関節症あり。",
 background: "元小学校教員。夫他界後、長女近隣にて一人暮らしをしていたが、心不全による緊急入院を契機に下肢筋力低下。退院後、在宅療養見守りのため当施設へ入所され6ヶ月経過。定期見直し実施。",
 physical_cognitive: "認知機能はおおむね良好で日常会話・意思疎通明瞭。几帳面な性格。両膝関節に変形性膝関節症に伴う荷重痛あり。歩行時は手すりまたはシルバーカー使用。軽度心不全による下腿浮腫傾向。",
 adl: "室内移動は手すり伝い歩行またはシルバーカーにて自立・見守り。立ち上がり時に膝痛のため手押し動作必要。更衣・整容は自立。入浴は一般浴・見守りにて洗身・洗髪実施（浴槽出入り時軽介助）。",
 meals_hydration: "軟飯・一口大刻み食。自力全量摂取可能。心不全管理のため塩分制限・水分管理目標（1日1,000〜1,200ml程度）。計量カップにて水分摂取量を記録。",
 excretion: "日中・夜間ともにポータブルトイレまたは居室トイレにて自立排泄。夜間1回排泄覚醒あり。利尿剤内服中のため午前中の尿量増加に配慮。",
 sleep: "21:30就寝、6:30起床。足元の冷えを訴えることがあり、保温靴下や毛布にて調整。入眠良好。中途覚醒時もナースコール対応にて安全確認。",
 meds: "降圧薬・利尿剤・胃薬を定期内服中。朝・夕食後。職員による配薬と服用確認にて自己内服確実。",
 medical_care: "心不全管理のための毎朝体重測定（前日比+1.5kg以上で往診医報告基準）。バイタル測定。両膝関節へのモーラステープ貼付（朝貼付・夕入浴前剥離）。両下腿へのヒルドイドローション塗布。",
 dementia_behavior: "目立ったBPSD・周辺症状なし。読書や手芸を楽しまれ、落ち着いて穏やかに過ごされている。几帳面ゆえに持ち物の位置等にこだわりあり傾聴。",
 care_notes: "立ち上がりや歩行時は膝への負担軽減のため焦らせず見守る。下肢浮腫・呼吸苦・体重増加の早期発見に努める。手芸や読書等の活動を尊重。",
 family_info: "長女様が週1〜2回面会および日用品補充に来訪。家族関係極めて良好。何かあれば長女様へ連絡。救急搬送方針（心不全悪化時は早期搬送希望）。",
 future_goals: "心不全の安定維持（体重・浮腫・血圧コントロール）。両膝の疼痛を緩和し、室内歩行・活動性を維持して穏やかな生活を支援。"
 },
 {
 id: 4,
 resident_id: 3,
 created_at: "2026-10-01",
 updated_at: "2026-10-01",
 staff_name: "山田 孝之",
 summary_type: "新規入所時サマリー",
 basic_info: "要介護3。生年月日: 1935-02-15 (91歳)。キーパーソン: 妻・鈴木 和子様 (090-5555-6666)。認知症自立度IIa。障害自立度B2。パーキンソン病、嚥下障害、誤嚥性肺炎既往、左片麻痺。",
 background: "元農業。真面目で温厚な性格。10年前にパーキンソン病と診断。在宅にて妻が介護していたが、誤嚥性肺炎で入院加療。退院にあたり経口摂取支援と専門的介護を要するため当施設へ新規入所。",
 physical_cognitive: "左片麻痺およびパーキンソン病による無動・振戦・筋強剛あり。小刻み歩行・突進歩行のリスク高く、自立歩行は不可。車椅子移動。意思疎通は可能だが発語が小声で聞き取りに傾聴を要する。",
 adl: "ベッド上での寝返り・起き上がりは軽介助。端座位保持は数分可能。車椅子への移乗は職員1名による軽介助〜一部介助。更衣・整容は全介助。入浴は機械浴（リフト浴）にて全身清拭・洗身介助。",
 meals_hydration: "極小刻み食（トロミ中）。嚥下反射の遅延あり、食事時は頭頸部前屈位（顎引き）を保持。スプーンにて一口ずつ全介助。水分は全量トロミ茶。1日目標1,000ml。むせ込み・湿性咳嗽に厳重警戒。",
 excretion: "リハビリパンツ＋尿取りパッド使用。定時おむつ交換および車椅子移乗時にポータブルトイレ誘導（成功率約50%）。排便は2〜3日に1回、緩下剤調整にて管理。",
 sleep: "20:30就寝、6:00起床。夜間体位変換（3時間ごと）実施。仙骨部発赤予防のため体圧分散エアマット使用。離床センサー設置。夜間覚醒時は穏やかに声かけ。",
 meds: "抗パーキンソン薬（レボドパ合剤）、便秘薬、胃薬。定時内服厳守（薬効オン・オフ現象あり、時間厳守が動作に直結）。トロミ水または服薬ゼリーにて全介助服薬。",
 medical_care: "誤嚥性肺炎予防の口腔ケア徹底（毎食後）。仙骨部発赤予防（アズノール軟膏塗布＋体交）。左肘スキンテア処置（亜鉛華軟膏＋ガーゼ保護）。背部乾燥へのプロペト塗布。",
 dementia_behavior: "夜間に小声での独語やせん妄傾向が稀に見られるが、職員の手を握り優しく声かけすることで入眠。暴言や拒絶はなし。",
 care_notes: "抗パーキンソン薬の内服時間を厳守すること。食事介助は絶対に急がず一口ごとの嚥下を確認。車椅子座位時の姿勢崩れ（左傾き）にクッションで補正。",
 family_info: "高齢の奥様が週1回面会。介護負担軽減に感謝されている。看取り方針合意済（DNAR、施設での平穏な看取り希望）。緊急連絡先は長男様（副）。",
 future_goals: "誤嚥性肺炎の再発防止と安全な経口摂取の継続。褥瘡を発生させず、車椅子移乗による離床機会を確保して寝たきり化を予防。"
 }
 ];
 }
 if (!Array.isArray(d.body_schema_pins) || d.body_schema_pins.length === 0) {
 d.body_schema_pins = [
 { id: 1, resident_id: 1, pin_no: 1, category: "軟膏塗布", site_name: "背部 (肩甲骨間〜腰部)", item_name: "ヒルドイドソフト軟膏 0.3%", frequency: "入浴後", status: "継続中", notes: "乾燥・掻痒予防。入浴後に擦らず薄く広げて塗布すること。", doctor_name: "さくら皮膚科", x_pct: 75.5, y_pct: 32.0, created_at: "2026-10-01 10:00", updated_at: "2026-10-01 10:00", staff_name: "山田 孝之" },
 { id: 2, resident_id: 1, pin_no: 2, category: "褥瘡・発赤", site_name: "仙骨部", item_name: "アズノール軟膏 0.033%", frequency: "朝・夕 (1日2回)", status: "継続中", notes: "軽度発赤あり。除圧マット使用中。車椅子座位長引かないよう声かけ。", doctor_name: "さくら往診クリニック", x_pct: 75.0, y_pct: 46.5, created_at: "2026-10-01 10:15", updated_at: "2026-10-01 10:15", staff_name: "山田 孝之" },
 { id: 3, resident_id: 1, pin_no: 3, category: "軟膏塗布", site_name: "右足背・踵部", item_name: "プロペト (白色ワセリン)", frequency: "入浴後", status: "継続中", notes: "角質硬化・亀裂予防。靴下着用前に塗布。", doctor_name: "さくら皮膚科", x_pct: 38.0, y_pct: 92.0, created_at: "2026-10-02 09:30", updated_at: "2026-10-02 09:30", staff_name: "佐藤 恵美" },
 { id: 4, resident_id: 2, pin_no: 1, category: "湿布・貼付剤", site_name: "右膝関節部 (前面〜側方)", item_name: "モーラステープL 40mg", frequency: "1日1回 朝", status: "継続中", notes: "変形性膝関節症の疼痛緩和。入浴前（夕方）に剥がす。日光過敏・かぶれ確認。", doctor_name: "中央整形外科", x_pct: 20.5, y_pct: 66.5, created_at: "2026-10-01 11:00", updated_at: "2026-10-01 11:00", staff_name: "佐藤 恵美" },
 { id: 5, resident_id: 2, pin_no: 2, category: "湿布・貼付剤", site_name: "左膝関節部 (前面〜側方)", item_name: "モーラステープL 40mg", frequency: "1日1回 朝", status: "継続中", notes: "立ち上がり時の疼痛軽減。皮膚発赤ないか剥離時に確認。", doctor_name: "中央整形外科", x_pct: 30.5, y_pct: 66.5, created_at: "2026-10-01 11:05", updated_at: "2026-10-01 11:05", staff_name: "佐藤 恵美" },
 { id: 6, resident_id: 2, pin_no: 3, category: "軟膏塗布", site_name: "両下腿 (すね〜ふくらはぎ)", item_name: "ヒルドイドローション 0.3%", frequency: "入浴後", status: "継続中", notes: "下肢乾燥・軽度浮腫ケア。下から上へ優しくなじませるように塗布。", doctor_name: "さくら皮膚科", x_pct: 25.5, y_pct: 78.0, created_at: "2026-10-02 14:00", updated_at: "2026-10-02 14:00", staff_name: "山田 孝之" },
 { id: 7, resident_id: 3, pin_no: 1, category: "褥瘡・発赤", site_name: "仙骨部〜尾骨部", item_name: "アズノール軟膏 0.033% ＋ フィルム保護", frequency: "朝・夕・就寝前 (1日3回)", status: "継続中", notes: "車椅子自走なし・座位姿勢が崩れやすく発赤リスク大。定期的な体位変換と除圧クッション確認。", doctor_name: "さくら往診クリニック", x_pct: 75.0, y_pct: 46.5, created_at: "2026-09-28 10:00", updated_at: "2026-10-02 15:00", staff_name: "山田 孝之" },
 { id: 8, resident_id: 3, pin_no: 2, category: "打撲・創傷", site_name: "左肘頭部 (外側)", item_name: "亜鉛華単軟膏 ＋ メロリンガーゼ被覆", frequency: "1日1回 朝処置", status: "継続中", notes: "車椅子手すり接触による皮膚剥離（スキンテア・約1cm）。浸出液少、上皮化傾向。テープ固定は弱粘着使用。", doctor_name: "さくら往診クリニック", x_pct: 91.0, y_pct: 35.0, created_at: "2026-09-30 08:30", updated_at: "2026-10-03 09:00", staff_name: "鈴木 美智子" },
 { id: 9, resident_id: 3, pin_no: 3, category: "軟膏塗布", site_name: "背部全体 (胸椎〜腰椎部)", item_name: "プロペト (白色ワセリン)", frequency: "入浴後", status: "継続中", notes: "老人性乾皮症による痒み訴えあり。入浴後に水分を拭き取り次第すぐ塗布。", doctor_name: "さくら皮膚科", x_pct: 75.0, y_pct: 30.0, created_at: "2026-10-01 16:30", updated_at: "2026-10-01 16:30", staff_name: "山田 孝之" },
 { id: 10, resident_id: 4, pin_no: 1, category: "打撲・創傷", site_name: "右大腿外側 (骨折手術創部)", item_name: "ヘパリン類似物質油性クリーム ＋ 保護ガーゼ", frequency: "1日1回 朝", status: "継続中", notes: "手術創治癒後瘢痕の皮膚ツッパリ・乾燥予防。強く揉まないこと。創部発赤・熱感なし。", doctor_name: "さくら総合病院 整形外科", x_pct: 18.0, y_pct: 49.0, created_at: "2026-10-02 11:00", updated_at: "2026-10-02 11:00", staff_name: "鈴木 美智子" },
 { id: 11, resident_id: 4, pin_no: 2, category: "湿布・貼付剤", site_name: "腰部中央 (L3〜L5付近)", item_name: "ロキソニンテープ 50mg", frequency: "1日1回 朝貼付", status: "継続中", notes: "腰背部痛緩和。1日1回朝食後貼付、入浴時剥離。皮膚かぶれ注視。", doctor_name: "さくら総合病院 整形外科", x_pct: 75.0, y_pct: 40.0, created_at: "2026-10-02 11:15", updated_at: "2026-10-02 11:15", staff_name: "鈴木 美智子" },
 { id: 12, resident_id: 4, pin_no: 3, category: "褥瘡・発赤", site_name: "右踵部 (かかと)", item_name: "アズノール軟膏 ＋ かかと保護パッド", frequency: "1日1回 就寝前", status: "継続中", notes: "臥床時の持続圧迫による発赤予防。除圧クッションを足首下に配置。", doctor_name: "さくら往診クリニック", x_pct: 38.0, y_pct: 95.0, created_at: "2026-10-02 11:30", updated_at: "2026-10-02 11:30", staff_name: "鈴木 美智子" }
 ];
 }
 if (Array.isArray(d.stamps)) {
 const nameMap = {
 "施設長": "木村 健一",
 "木村": "木村 健一",
 "田中": "田中 慎一",
 "鈴木": "鈴木 美智子",
 "山田": "山田 孝之",
 "佐藤": "佐藤 健太",
 "高橋": "高橋 直樹",
 "伊藤": "伊藤 翔太",
 "渡辺": "渡辺 拓也",
 "中村": "中村 大輔",
 "小林": "小林 亮"
 };
 // 既存の短縮名をフルネームに置換
 d.stamps.forEach(s => {
 const curName = s.name || s;
 if (nameMap[curName]) {
 s.name = nameMap[curName];
 }
 });

 // 15名フルネーム体制の定義
 const fullStaffDefaults = [
 { name: "木村 健一", role: "管理者" },
 { name: "鈴木 美智子", role: "主任看護師" },
 { name: "加藤 由美", role: "看護師" },
 { name: "山田 孝之", role: "介護リーダー" },
 { name: "佐藤 健太", role: "介護職員" },
 { name: "高橋 直樹", role: "介護職員" },
 { name: "伊藤 翔太", role: "介護職員" },
 { name: "渡辺 拓也", role: "介護職員" },
 { name: "中村 大輔", role: "介護職員" },
 { name: "小林 亮", role: "介護職員" },
 { name: "斉藤 翼", role: "介護職員" },
 { name: "吉田 誠", role: "介護職員" },
 { name: "清水 翔平", role: "介護職員" },
 { name: "田中 慎一", role: "事務員" },
 { name: "松本 陽子", role: "事務員" }
 ];
 fullStaffDefaults.forEach(s => {
 if (!d.stamps.some(existing => (existing.name || existing) === s.name)) {
 d.stamps.push(s);
 }
 });
 d.stamps = sortStaffList(d.stamps);
 }

 if (!d.monthly_shifts || typeof d.monthly_shifts !== "object") {
 d.monthly_shifts = {};
 }
 if (!Array.isArray(d.shift_hope_offs)) {
  d.shift_hope_offs = [
   { id: 1, year_month: "2026-10", staff_name: "佐藤 健太", day: 15, reason: "通院のため" },
   { id: 2, year_month: "2026-10", staff_name: "小林 誠", day: 25, reason: "冠婚葬祭" },
   { id: 3, year_month: "2026-10", staff_name: "渡辺 拓也", day: 8, reason: "家族行事" }
  ];
 }
 if (!Array.isArray(d.shift_ng_pairs)) {
 d.shift_ng_pairs = [
 { id: 1, staff1: "佐藤 健太", staff2: "高橋 直樹", reason: "相性配慮 (同日夜勤NG)" }
 ];
 } else {
 // 既存の短縮名をフルネームに更新
 d.shift_ng_pairs.forEach(p => {
 if (p.staff1 === "佐藤") p.staff1 = "佐藤 健太";
 if (p.staff1 === "高橋") p.staff1 = "高橋 直樹";
 if (p.staff2 === "佐藤") p.staff2 = "佐藤 健太";
 if (p.staff2 === "高橋") p.staff2 = "高橋 直樹";
 });
 }

 // 消耗品マスター・アイテム同期＆移行 (手袋S/L追加、尿取りパッド名称統一、ワイドパッド追加)
 if (Array.isArray(d.inventory)) {
 d.inventory.forEach(i => {
 if (i.name === "尿取りパッド 4回分") i.name = "尿取りパッド";
 });
 if (!d.inventory.some(i => i.name === "ワイドパッド")) {
 d.inventory.push({
 id: 401,
 name: "ワイドパッド",
 category: "オムツ・パッド",
 current_stock: 4,
 safety_stock: 5,
 normal_stock: 10,
 unit: "パック",
 unit_price: 1600,
 is_personal_billable: 1,
 supplier_id: 1,
 supplier_name: "ケアサポート商事"
 });
 }
 if (!d.inventory.some(i => i.name === "使い捨てプラスチック手袋 S")) {
 d.inventory.push({
 id: 402,
 name: "使い捨てプラスチック手袋 S",
 category: "衛生用品",
 current_stock: 12,
 safety_stock: 8,
 normal_stock: 16,
 unit: "箱",
 unit_price: 650,
 is_personal_billable: 0,
 supplier_id: 1,
 supplier_name: "ケアサポート商事"
 });
 }
 if (!d.inventory.some(i => i.name === "使い捨てプラスチック手袋 L")) {
 d.inventory.push({
 id: 403,
 name: "使い捨てプラスチック手袋 L",
 category: "衛生用品",
 current_stock: 10,
 safety_stock: 8,
 normal_stock: 16,
 unit: "箱",
 unit_price: 650,
 is_personal_billable: 0,
 supplier_id: 1,
 supplier_name: "ケアサポート商事"
 });
 }
 }

 // 取引先 (suppliers) の取扱品目同期
 if (Array.isArray(d.suppliers)) {
 const careSupp = d.suppliers.find(s => s.id === 1 || (s.name || "").includes("ケアサポート"));
 if (careSupp && Array.isArray(careSupp.items)) {
 careSupp.items.forEach(i => {
 if (i.name === "尿取りパッド 4回分") i.name = "尿取りパッド";
 });
 if (!careSupp.items.some(i => i.name === "ワイドパッド")) {
 careSupp.items.push({ name: "ワイドパッド", unit_price: 1600, unit: "パック" });
 }
 if (!careSupp.items.some(i => i.name === "使い捨てプラスチック手袋 S")) {
 careSupp.items.push({ name: "使い捨てプラスチック手袋 S", unit_price: 650, unit: "箱" });
 }
 if (!careSupp.items.some(i => i.name === "使い捨てプラスチック手袋 L")) {
 careSupp.items.push({ name: "使い捨てプラスチック手袋 L", unit_price: 650, unit: "箱" });
 }
 }
 }

 // 過去履歴内の旧表記更新
 ["orders", "consumptions", "inventory_logs"].forEach(tblKey => {
 if (Array.isArray(d[tblKey])) {
 d[tblKey].forEach(row => {
 if (row.item_name === "尿取りパッド 4回分") row.item_name = "尿取りパッド";
 });
 }
 });

 if (!Array.isArray(d.eyedrop_orders) || d.eyedrop_orders.length === 0) {
 d.eyedrop_orders = [
 {
 id: 1,
 resident_id: 1,
 eye: "右のみ",
 medicine_name: "キサラタン点眼液 0.005%",
 timing_slots: ["眠前"],
 dosage: "1回1滴",
 notes: "緑内障治療。就寝前に右眼へ1滴点眼。点眼後しばらく目を閉じ涙嚢部を軽く圧迫。",
 doctor_name: "さくら眼科クリニック",
 status: "継続中",
 updated_at: "2026-10-01"
 },
 {
 id: 2,
 resident_id: 2,
 eye: "両眼",
 medicine_name: "ヒアレイン点眼液 0.1%",
 timing_slots: ["朝", "昼", "夕"],
 dosage: "1回1滴",
 notes: "角結膜上皮障害・ドライアイ。朝食後・昼食後・夕食後に両眼へ各1滴点眼。",
 doctor_name: "中央眼科医院",
 status: "継続中",
 updated_at: "2026-10-01"
 },
 {
 id: 3,
 resident_id: 3,
 eye: "左のみ",
 medicine_name: "サンコバ点眼液 0.02%",
 timing_slots: ["朝", "夕"],
 dosage: "1回1滴",
 notes: "調節機能改善・眼精疲労。朝食後・夕食後に左眼のみ1滴点眼。",
 doctor_name: "さくら眼科クリニック",
 status: "継続中",
 updated_at: "2026-10-01"
 },
 {
 id: 4,
 resident_id: 4,
 eye: "両眼",
 medicine_name: "クラビット点眼液 1.5%",
 timing_slots: ["朝", "昼", "夕"],
 dosage: "1回1滴",
 notes: "結膜炎・角膜感染症予防。朝食後・昼食後・夕食後に両眼へ各1滴点眼。容器先端がまつ毛に触れないよう清潔操作。",
 doctor_name: "総合病院眼科",
 status: "継続中",
 updated_at: "2026-10-01"
 }
 ];
 }

 return d;
 }

 save() {
 // 1. ローカルストレージに即時保険保存
 try {
 localStorage.setItem(this.key, JSON.stringify(this.data));
 } catch (e) {}

 // 2. サーバーモードなら親機へ即時送信 (初回同期完了後のみ)
 if (this.isServerMode && this.hasSyncedWithServer) {
 this.saveToServer();
 }
 }

 async saveToServer() {
 if (this.isServerMode && !this.hasSyncedWithServer) return;
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
 try {
 const resp = await res.json();
 this.updateBackupBadge(resp.saved_at || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
 } catch (e) {
 this.updateBackupBadge(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
 }
 } else {
 this.updateSyncBadge(false);
 }
 } catch (err) {
 console.warn("Server save error:", err);
 this.updateSyncBadge(false);
 }
 }

 updateBackupBadge(timeStr) {
 const b = document.getElementById("backupStatusBadge");
 if (!b) return;
 b.textContent = ` 自動バックアップ済 (${timeStr})`;
 b.style.background = "#10b981";
 b.title = `最新データは ${timeStr} に自動3重バックアップ保管されました (PC・USB内完結)`;
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
 } else {
 // トンネル起動直後のURL遅延取得に対応（自動リトライ）
 setTimeout(() => this.retryFetchTunnelUrl(1), 3000);
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
 this.hasSyncedWithServer = true;
 await this.saveToServer();
 }
 this.hasSyncedWithServer = true;
 this.updateSyncBadge(true);
 }
 } catch (e) {
 console.warn("Init sync failed, running in local mode:", e);
 this.updateSyncBadge(false);
 }

 // 5秒ごとのバックグラウンド同期 (他端末からの入力を反映)
 setInterval(() => this.pollServerUpdates(), 5000);
 }

 async retryFetchTunnelUrl(attempt) {
 if (attempt > 3) return;
 try {
 const res = await fetch('/api/ip');
 if (res.ok) {
 const data = await res.json();
 if (data.tunnel_url && data.tunnel_url.trim() !== "") {
 localStorage.setItem("care_portal_tunnel_url", data.tunnel_url.trim());
 this.renderShareModalUrls();
 return;
 }
 }
 } catch (_) {}
 if (attempt < 3) {
 setTimeout(() => this.retryFetchTunnelUrl(attempt + 1), 4000);
 }
 }

 async pollServerUpdates() {
 if (!this.isServerMode) return;

 // トンネル接続先URLの変更検知とQRコード自動更新 (サーバー側のtunnel_url.txtの変更に自動追従)
 this.pollCycleCount = (this.pollCycleCount || 0) + 1;
 if (this.pollCycleCount % 2 === 0) {
 try {
 const resIp = await fetch('/api/ip');
 if (resIp.ok) {
 const ipData = await resIp.json();
 if (ipData.tunnel_url && ipData.tunnel_url.trim() !== "") {
 const currentTunnel = localStorage.getItem("care_portal_tunnel_url") || "";
 if (ipData.tunnel_url.trim() !== currentTunnel) {
 localStorage.setItem("care_portal_tunnel_url", ipData.tunnel_url.trim());
 this.renderShareModalUrls();
 }
 }
 }
 } catch (_) {}
 }

 try {
 const res = await fetch('/api/data');
 if (!res.ok) return;
 const text = await res.text();
 if (!text || text.trim() === "" || text === "{}") return;

 const serverData = JSON.parse(text);
 if (!serverData || !serverData.residents) return;

 const normalizedJson = JSON.stringify(serverData);
 if (normalizedJson === this.lastSavedJson) {
 this.updateSyncBadge(true);
 return;
 }

 this.data = this.ensureDefaultArrays(serverData);
 this.lastSavedJson = normalizedJson;
 try { localStorage.setItem(this.key, this.lastSavedJson); } catch (e) {}
 this.updateSyncBadge(true);

 // 職員が編集中でない場合に限りビューを更新
 const activeTag = document.activeElement ? document.activeElement.tagName : "";
 if (activeTag !== "INPUT" && activeTag !== "TEXTAREA" && activeTag !== "SELECT") {
 if (typeof reloadStateFromDb === 'function') {
 reloadStateFromDb();
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
 badge.innerHTML = " 施設内Wi-Fi共有中";
 badge.style.background = "#2563eb";
 badge.title = "施設内Wi-Fiで他端末とリアルタイム共有中 (クリックで接続URL表示)";
 } else {
 badge.innerHTML = " 親機サーバー通信切断";
 badge.style.background = "#dc2626";
 badge.title = "親機サーバーとの通信が一時途絶しています (ローカル保存中)";
 }
 } else {
 badge.innerHTML = " 単体ローカル動作中";
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

 // トンネルURL（最新取得値 または 保存値）
 let cloudflareUrl = localStorage.getItem("care_portal_tunnel_url") || "https://inside-mustang-test-demographic.trycloudflare.com";
 const isTunnel = Boolean(cloudflareUrl && cloudflareUrl.trim() !== "");
 const unifiedUrl = isTunnel ? cloudflareUrl.trim() : localUrl;
 const unifiedQrUrl = "https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=" + encodeURIComponent(unifiedUrl);

 // スマホ・他端末 外部接続用（統一案内 1つに統合）
 const cardDiv = document.createElement("div");
 cardDiv.style.cssText = "display:flex; gap:18px; align-items:center; background:#f8fafc; border:2px solid #2563eb; border-radius:12px; padding:16px 18px; box-shadow:0 3px 10px rgba(37,99,235,0.12); flex-wrap:wrap;";
 cardDiv.innerHTML = `
 <div style="flex-shrink:0; text-align:center; margin:0 auto;">
 <img src="${unifiedQrUrl}" alt="統一接続QRコード" style="width:130px; height:130px; border-radius:8px; border:2px solid #93c5fd; background:#fff; display:block; padding:4px;">
 <span style="font-size:11px; color:#1e40af; font-weight:bold; margin-top:5px; display:block;">カメラでスキャン</span>
 </div>
 <div style="flex:1; min-width:260px;">
 <div style="font-family:monospace; font-size:14px; font-weight:bold; color:#1d4ed8; margin-bottom:12px; word-break:break-all; background:#ffffff; padding:8px 12px; border-radius:6px; border:1px solid #bfdbfe;">
 ${unifiedUrl}
 </div>
 <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
 <button class="btn btn-primary" style="padding:7px 18px; font-size:13px; font-weight:bold; background:#2563eb; border-color:#2563eb;" onclick="copyShareUrl('${unifiedUrl}')">接続URLをコピー</button>
 <a href="${unifiedUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary" style="padding:7px 12px; font-size:12px; text-decoration:none; display:inline-flex; align-items:center;">ブラウザで開く</a>
 <button class="btn btn-outline" style="padding:6px 10px; font-size:12px; color:#475569;" onclick="promptChangeTunnelUrl()">URL変更</button>
 </div>
 ${isTunnel ? `
 <div style="margin-top:10px; padding-top:8px; border-top:1px dashed #cbd5e1; font-size:11px; color:#64748b; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:4px;">
 <span>同一Wi-Fi内 直接アクセス: <code style="color:#334155;">${localUrl}</code></span>
 </div>` : ''}
 </div>
 `;
 container.appendChild(cardDiv);
 }

 initSeedData() {
 const today = new Date();
 const todayStr = today.toISOString().split("T")[0];
 const nowStr = `${todayStr} ${today.toTimeString().slice(0, 5)}`;

 const seed = {
 residents: [
 { id: 1, name: "佐藤 太郎", room_no: "101", care_level: "要介護3", status: "在所", birth_date: "1940-10-15", policy_stamp: "看取り", sensor_alert: " 離床センサーマット使用中 (ベッド脇)", emergency_contact: "長男: 佐藤 一郎 (090-1111-2222)", family_wishes: "本人が穏やかに過ごせるようにお願いします。", life_history: "元大工職人。相撲観戦が大好き。頑固だが笑顔が優しい。", paralysis: "右片麻痺 (左側からの介助推奨)", allergies: "卵アレルギー", diet_type: "普通食 (一口大)", oral_state: "上部義歯 (下残歯あり)", diseases: "糖尿病, 脳梗塞後遺症", care_plan_goal: "歩行器での安全な移動。食事時のむせ込み予防。", dr_instructions: "次回採血予定。低血糖症状に留意。", next_clinic_date: "2026-10-14", care_expiry_date: "2026-11-15", deposit_balance: 35000 },
 { id: 2, name: "田中 ハナ", room_no: "102", care_level: "要介護2", status: "在所", birth_date: "1938-11-20", policy_stamp: "緊急搬送", sensor_alert: " ナースコール常時手元配置", emergency_contact: "長女: 田中 美咲 (090-3333-4444)", family_wishes: "足元の冷えを気にするので温かくしてください。", life_history: "元教員。読書と手芸が趣味。几帳面な性格。", paralysis: "麻痺なし (膝痛あり)", allergies: "なし", diet_type: "軟飯・一口刻み", oral_state: "総義歯", diseases: "心不全, 高血圧", care_plan_goal: "下肢の浮腫チェック。水分管理 (1日1200ml程度)。", dr_instructions: "利尿剤の継続。体重増加時は連絡。", next_clinic_date: "2026-10-07", care_expiry_date: "2026-10-25", deposit_balance: 28000 },
 { id: 3, name: "鈴木 一郎", room_no: "103", care_level: "要介護3", status: "在所", birth_date: "1935-02-15", policy_stamp: "看取り", sensor_alert: " 離床・転倒防止センサーマット (ベッド脇・端座位見守り)", emergency_contact: "妻: 鈴木 和子 (090-5555-6666)", family_wishes: "できるだけ居室で静かに休ませてあげてください。", life_history: "元農業。穏やかな性格。家族思い。", paralysis: "左片麻痺 (端座位保持可・移乗軽介助)", allergies: "そばアレルギー", diet_type: "極小刻み (とろみ中)", oral_state: "残歯のみ", diseases: "パーキンソン病, 嚥下障害, 誤嚥性肺炎既往", care_plan_goal: "ベッド上での安定した端座位保持を活かし、介助による車椅子移乗・離床機会の確保。残存機能の維持と誤嚥予防。", dr_instructions: "抗パーキンソン薬の定時内服厳守。", next_clinic_date: "2026-10-20", care_expiry_date: "2027-04-30", deposit_balance: 42000 },
 { id: 4, name: "高橋 トメ", room_no: "105", care_level: "要介護1", status: "入院中", birth_date: "1942-08-01", policy_stamp: "緊急搬送", sensor_alert: "特記なし", emergency_contact: "長男: 高橋 健 (090-7777-8888)", family_wishes: "退院時期が決まったらすぐ連絡します。", life_history: "元商店経営。明るく社交的。", paralysis: "麻痺なし", allergies: "なし", diet_type: "普通食", oral_state: "総義歯", diseases: "骨粗鬆症", care_plan_goal: "転倒予防の見守り。", dr_instructions: "大腿骨経過観察中。", next_clinic_date: "2026-10-10", care_expiry_date: "2027-01-15", deposit_balance: 15000 }
 ],
 stamps: [
 { name: "木村 健一", role: "管理者" },
 { name: "鈴木 美智子", role: "主任看護師" },
 { name: "加藤 由美", role: "看護師" },
 { name: "山田 孝之", role: "介護リーダー" },
 { name: "佐藤 健太", role: "介護職員" },
 { name: "高橋 直樹", role: "介護職員" },
 { name: "伊藤 翔太", role: "介護職員" },
 { name: "渡辺 拓也", role: "介護職員" },
 { name: "中村 大輔", role: "介護職員" },
 { name: "小林 亮", role: "介護職員" },
 { name: "斉藤 翼", role: "介護職員" },
 { name: "吉田 誠", role: "介護職員" },
 { name: "清水 翔平", role: "介護職員" },
 { name: "田中 慎一", role: "事務員" },
 { name: "松本 陽子", role: "事務員" }
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
 { name: "尿取りパッド", unit_price: 1400, unit: "パック" },
 { name: "ワイドパッド", unit_price: 1600, unit: "パック" },
 { name: "使い捨てプラスチック手袋 S", unit_price: 650, unit: "箱" },
 { name: "使い捨てプラスチック手袋 M", unit_price: 650, unit: "箱" },
 { name: "使い捨てプラスチック手袋 L", unit_price: 650, unit: "箱" }
 ]},
 { id: 2, name: "メディカル薬品", phone: "03-9876-5432", contact_person: "木村", items: [
 { name: "ヒルドイドソフト軟膏 100g", unit_price: 1800, unit: "本" },
 { name: "手指消毒用アルコール 1L", unit_price: 1200, unit: "本" },
 { name: "とろみ調整剤 1kg", unit_price: 2800, unit: "袋" }
 ]}
 ],
 inventory: [
 { id: 1, name: "テープ止めオムツ L", category: "オムツ・パッド", current_stock: 2, safety_stock: 5, normal_stock: 10, unit: "パック", unit_price: 2600, is_personal_billable: 1, supplier_id: 1, supplier_name: "ケアサポート商事" },
 { id: 2, name: "テープ止めオムツ M", category: "オムツ・パッド", current_stock: 8, safety_stock: 5, normal_stock: 10, unit: "パック", unit_price: 2400, is_personal_billable: 1, supplier_id: 1, supplier_name: "ケアサポート商事" },
 { id: 3, name: "尿取りパッド", category: "オムツ・パッド", current_stock: 3, safety_stock: 6, normal_stock: 12, unit: "パック", unit_price: 1400, is_personal_billable: 1, supplier_id: 1, supplier_name: "ケアサポート商事" },
 { id: 4, name: "ワイドパッド", category: "オムツ・パッド", current_stock: 4, safety_stock: 5, normal_stock: 10, unit: "パック", unit_price: 1600, is_personal_billable: 1, supplier_id: 1, supplier_name: "ケアサポート商事" },
 { id: 5, name: "使い捨てプラスチック手袋 S", category: "衛生用品", current_stock: 12, safety_stock: 8, normal_stock: 16, unit: "箱", unit_price: 650, is_personal_billable: 0, supplier_id: 1, supplier_name: "ケアサポート商事" },
 { id: 6, name: "使い捨てプラスチック手袋 M", category: "衛生用品", current_stock: 15, safety_stock: 10, normal_stock: 20, unit: "箱", unit_price: 650, is_personal_billable: 0, supplier_id: 1, supplier_name: "ケアサポート商事" },
 { id: 7, name: "使い捨てプラスチック手袋 L", category: "衛生用品", current_stock: 10, safety_stock: 8, normal_stock: 16, unit: "箱", unit_price: 650, is_personal_billable: 0, supplier_id: 1, supplier_name: "ケアサポート商事" },
 { id: 8, name: "手指消毒用アルコール 1L", category: "消毒", current_stock: 4, safety_stock: 3, normal_stock: 8, unit: "本", unit_price: 1200, is_personal_billable: 0, supplier_id: 2, supplier_name: "メディカル薬品" },
 { id: 9, name: "とろみ調整剤 1kg", category: "食事関連", current_stock: 6, safety_stock: 4, normal_stock: 10, unit: "袋", unit_price: 2800, is_personal_billable: 1, supplier_id: 2, supplier_name: "メディカル薬品" }
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
 incidents: [],
 care_summaries: [],
 body_schema_pins: [],
 eyedrop_orders: []
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
 care_summaries: db.data.care_summaries,
 body_schema_pins: db.data.body_schema_pins || [],
 schemaResidentId: 1,
 eyedrop_orders: db.data.eyedrop_orders || [],
 medTimingFilter: "all",
 selectedResidentId: 1,
 selectedDate: new Date().toISOString().split("T")[0],
 currentMonth: new Date().toISOString().slice(0, 7),
 activePortal: "care",
 activeCareTab: "record",
 activeOfficeTab: "inventory",
 currentShiftMonth: new Date().toISOString().slice(0, 7),
 recordScope: "today"
};

// ======================================================================
// 現場介護向け 医療・症状・ケア専門用語 やさしい解説辞書
// ======================================================================
const MEDICAL_TERMS_DICTIONARY = {
 // 呼吸・循環器
 "起座呼吸": {
 term: "起座呼吸",
 ruby: "きざこきゅう",
 meaning: "横になると息苦しくなり、体を起こして座ると呼吸が楽になる状態。",
 urgency: " 即時報告レベル",
 urgencyType: "danger",
 checkPoint: "ベッドに横になるのを嫌がり前かがみで座りたがるときは心不全の悪化が疑われます。無理に寝かせず、背上げ（起座・座位）を保ち、直ちに看護師へ連絡してください。",
 isDisease: false
 },
 "チアノーゼ": {
 term: "チアノーゼ",
 ruby: "ちあのーぜ",
 meaning: "血液中の酸素が不足し、唇・爪・顔色が青紫色になる危険サイン。",
 urgency: " 即時報告レベル",
 urgencyType: "danger",
 checkPoint: "直ちに酸素吸入（指示がある場合）の確認、呼吸状態の確保、SpO2測定を行い、大至急看護師または医師へ報告してください。",
 isDisease: false
 },
 "湿性嗄声": {
 term: "湿性嗄声",
 ruby: "しっせいさせい",
 meaning: "声帯や喉に唾液・痰・水分が絡んでガラガラ・ゴロゴロ鳴る湿った声。",
 urgency: " 即時報告レベル",
 urgencyType: "danger",
 checkPoint: "喉に食物や痰が溜まって誤嚥の危険が極めて高い状態です。飲食を直ちに止め、前傾姿勢で咳払いを促し、必要に応じて看護師へ吸引を依頼してください。",
 isDisease: false
 },
 "ガラガラ声": {
 term: "ガラガラ声",
 ruby: "がらがらごえ",
 meaning: "喉に唾液や食べ物、痰が残留しているときの湿った声（湿性嗄声）。",
 urgency: " 即時報告レベル",
 urgencyType: "danger",
 checkPoint: "誤嚥の典型的な初期サインです。飲食を中断し、頭を前に倒して咳き込ませ、看護師へ連絡してください。",
 isDisease: false
 },
 "喘鳴": {
 term: "喘鳴",
 ruby: "ぜんめい",
 meaning: "呼吸をするときに『ゼーゼー』『ヒューヒュー』と苦しそうな音がすること。",
 urgency: " 即時報告レベル",
 urgencyType: "danger",
 checkPoint: "気道が狭くなっているか心不全で肺に水が溜まっているサインです。衣類を緩め、背上げ（座位）にして直ちに看護師へ連絡してください。",
 isDisease: false
 },
 "SpO2": {
 term: "SpO2",
 ruby: "えすぴーおーつー",
 meaning: "パルスオキシメーターで指先等から測定する『動脈血酸素飽和度』。",
 urgency: " 93%未満は要注意・90%以下は即報告",
 urgencyType: "danger",
 checkPoint: "正常値は96〜99%です。普段より3%以上低下、または93%未満のときは直ちに看護師へ報告。測定時は指先の冷えや血流不良がないかも確認します。",
 isDisease: false
 },
 "HOT": {
 term: "HOT",
 ruby: "ほっと (ざいたくさんそりょうほう)",
 meaning: "在宅酸素療法。機械やボンベから鼻カニューラを通して持続的に酸素を吸入する治療。",
 urgency: "ℹ 現場ケア知識・火気厳禁",
 urgencyType: "info",
 checkPoint: "カニューラが鼻から外れていないか、チューブが折れ曲がっていないか毎時確認。周囲2m以内は火気厳禁です。流量変更は介護職では行わず看護師へ伝えます。",
 isDisease: false
 },
 "在宅酸素療法": {
 term: "在宅酸素療法",
 ruby: "ざいたくさんそりょうほう",
 meaning: "機械やボンベから鼻カニューラを通して持続的に酸素を吸入する治療（HOT）。",
 urgency: "ℹ 現場ケア知識・火気厳禁",
 urgencyType: "info",
 checkPoint: "カニューラのズレ・チューブの折れ曲がり・流量設定を毎時確認します。火気厳禁を徹底してください。",
 isDisease: false
 },
 "起座位": {
 term: "起座位",
 ruby: "きざい",
 meaning: "ベッドの背を70〜90度近くまで起こし、前かがみ等で座らせる姿勢。",
 urgency: " 現場介護でしてよい安全ケア",
 urgencyType: "info",
 checkPoint: "心不全や呼吸困難があるとき、横たわるより座る方が肺が広がり呼吸が楽になります。オーバーテーブルにクッションを置きもたれかからせる姿勢も有効です。",
 isDisease: false
 },
 "ファーラー位": {
 term: "ファーラー位",
 ruby: "ふぁーらーい",
 meaning: "ベッドの背上げを45度程度にした半座位（安楽な半身起こし姿勢）。",
 urgency: " 現場介護でしてよい安全ケア",
 urgencyType: "info",
 checkPoint: "食後の逆流・誤嚥予防や、呼吸が少し苦しいときの安静姿勢として安全・最適です。膝裏にも軽くクッションを入れて体がずり落ちないように支えます。",
 isDisease: false
 },
 "放散痛": {
 term: "放散痛",
 ruby: "ほうさんつう",
 meaning: "心臓など痛みの原因箇所から離れた場所（左肩・背中・顎・みぞおち）に広がる痛み。",
 urgency: " 即時報告レベル",
 urgencyType: "danger",
 checkPoint: "『左肩が急に重痛い』『顎や歯が痛い』と訴える場合、心筋梗塞・狭心症の放散痛の可能性があります。直ちにバイタルを測り看護師・救急要請を検討します。",
 isDisease: false
 },
 "不整脈": {
 term: "不整脈",
 ruby: "ふせいみゃく",
 meaning: "心臓の拍動リズムが不規則になったり、脈が極端に速い（頻脈）・遅い（徐脈）状態。",
 urgency: " めまい・動悸・胸痛伴う時は即報告",
 urgencyType: "warning",
 checkPoint: "検脈でリズムがバラバラ、または安静時脈拍が120以上または45以下の場合は直ちに看護師へ連絡。ふらつき・転倒に厳重警戒してください。",
 isDisease: false
 },
 "ヒートショック": {
 term: "ヒートショック",
 ruby: "ひーとしょっく",
 meaning: "暖かい居室から寒い脱衣所・浴室への移動で血圧が急変動し、脳卒中や心筋梗塞を起こす現象。",
 urgency: " 現場介護での予防が重要",
 urgencyType: "info",
 checkPoint: "冬場の入浴時は脱衣所・浴室をあらかじめ暖房等で温めておく、湯船の温度を40度以下にする、急に立ち上がらせない等の予防が必須です。",
 isDisease: false
 },
 "肺水腫": {
 term: "肺水腫",
 ruby: "はいすいしゅ",
 meaning: "心不全などが原因で肺に水が染み出し、溺れたような激しい呼吸苦を起こす危険状態。",
 urgency: " 即時報告レベル (緊急搬送)",
 urgencyType: "danger",
 checkPoint: "横になれず激しく息苦しがる、ピンク色の泡状痰、ゼーゼー音がサイン。直ちに体を起こして座らせ（起座位）、大至急看護師・救急要請してください。",
 isDisease: false
 },

 // 脳・神経・意識
 "片麻痺": {
 term: "片麻痺",
 ruby: "かたまひ",
 meaning: "身体の左右どちらか半分（右手と右足、または左手と左足）に力が入らない状態。",
 urgency: " 急な悪化・新規出現は即報告 (脳梗塞疑い)",
 urgencyType: "danger",
 checkPoint: "普段より急に力が入らなくなった、腕が上がらない、顔の半分が下がっている場合は脳血管障害の再発疑い。直ちに看護師・救急要請します。日常ケアは健側から介助します。",
 isDisease: false
 },
 "構音障害": {
 term: "構音障害",
 ruby: "こうおんしょうがい",
 meaning: "舌や唇の筋肉麻痺により、ろれつが回らなくなったり言葉が不明瞭になる状態。",
 urgency: " 急な出現・悪化は即報告",
 urgencyType: "danger",
 checkPoint: "『イー』『パ・タ・カ・ラ』を発音してもらい、急にろれつが回らないときは脳梗塞の疑い。直ちに看護師へ報告してください。",
 isDisease: false
 },
 "ろれつ不良": {
 term: "ろれつ不良",
 ruby: "ろれつふりょう",
 meaning: "舌がもつれて言葉がはっきりと喋れなくなる症状（構音障害）。",
 urgency: " 即時報告レベル",
 urgencyType: "danger",
 checkPoint: "脳梗塞の代表的サインです。片麻痺や顔面のゆがみがないかも確認し、直ちに安静を保ち看護師へ報告してください。",
 isDisease: false
 },
 "意識混濁": {
 term: "意識混濁",
 ruby: "いしきこんだく",
 meaning: "呼びかけに対する反応が鈍い、ボーッとして辻褄が合わない、意識が朦朧としている状態。",
 urgency: " 即時報告レベル",
 urgencyType: "danger",
 checkPoint: "低血糖、脳血管障害、重篤な脱水、高熱などの危険なサインです。安全な姿勢（誤嚥防止の横向き・側臥位）にし直ちに看護師・医師へ連絡します。",
 isDisease: false
 },
 "意識障害": {
 term: "意識障害",
 ruby: "いしきしょうがい",
 meaning: "目を開けない、呼びかけに反応しない、会話が成り立たないなど意識レベルが低下した状態。",
 urgency: " 即時報告レベル (緊急)",
 urgencyType: "danger",
 checkPoint: "飲食は絶対に避け、気道確保（横向き寝・側臥位）を行い、大声で周囲の職員・看護師を呼び直ちに医師連絡・救急要請を行います。",
 isDisease: false
 },
 "せん妄": {
 term: "せん妄",
 ruby: "せんもう",
 meaning: "脱水・感染症・環境変化等で、数時間〜数日の間に急に時間や場所がわからなくなり幻覚や興奮が起きる一時的な意識障害。",
 urgency: " 看護師へ報告 (原因疾患の探索)",
 urgencyType: "warning",
 checkPoint: "認知症の悪化に見えますが、発熱・尿路感染・脱水・便秘・薬剤副作用が原因であることが多いです。体温測定・水分摂取確認を行い看護師へ報告します。",
 isDisease: false
 },
 "半側空間無視": {
 term: "半側空間無視",
 ruby: "はんそくくうかんむし",
 meaning: "脳の損傷により、麻痺側（多くは左側）にある人や物、配膳された食事に気づかなくなる障害。",
 urgency: "ℹ 現場ケア知識",
 urgencyType: "info",
 checkPoint: "本人は見えていない自覚がありません。声かけや食事の配膳は気づきやすい側（健側）から行い、麻痺側にある食事や障害物へ優しく注意を促します。",
 isDisease: false
 },
 "感情失禁": {
 term: "感情失禁",
 ruby: "かんじょうしっきん",
 meaning: "脳血管障害などの後遺症で、些細な刺激や理由もないのに急に泣いたり大笑いしたりする症状。",
 urgency: "ℹ 現場ケア知識",
 urgencyType: "info",
 checkPoint: "本人の意思でコントロールできません。動揺せず『大丈夫ですよ』と落ち着いた声かけをし、背中を優しくさすって安心感を促します。",
 isDisease: false
 },
 "悪性症候群": {
 term: "悪性症候群",
 ruby: "あくせいしょうこうぐん",
 meaning: "向精神薬や抗パーキンソン病薬の副作用・急な服薬中断等で起きる高熱・全身のこわばり・意識障害。",
 urgency: " 即時報告レベル (生命の危険)",
 urgencyType: "danger",
 checkPoint: "38℃以上の急な高熱、筋肉の強い硬直、大量の発汗、意識低下が見られたら直ちに看護師・医師へ連絡。冷却処置を行い救急対応が必要です。",
 isDisease: false
 },

 // 運動・パーキンソン
 "振戦": {
 term: "振戦",
 ruby: "しんせん",
 meaning: "手や指、足、顎などが自分の意思と無関係に細かくリズミカルに震える症状。",
 urgency: " 低血糖の震えは即報告 / パーキンソン症状は観察",
 urgencyType: "warning",
 checkPoint: "冷汗や脱力を伴う場合は低血糖の疑い（即報告）。安静時に手をもみほぐすように震える場合はパーキンソン病の症状で、内服時間通りに服薬できているか確認します。",
 isDisease: false
 },
 "筋固縮": {
 term: "筋固縮",
 ruby: "きんこしゅく",
 meaning: "他人が関節を曲げ伸ばししようとした際、筋肉が鉛の管のように硬く抵抗する症状。",
 urgency: "ℹ 現場ケア知識",
 urgencyType: "info",
 checkPoint: "移乗や更衣の際に無理に力を入れて引っ張ると骨折や筋損傷の原因になります。ゆっくりと本人の動きに合わせて優しく介助します。",
 isDisease: false
 },
 "すくみ足": {
 term: "すくみ足",
 ruby: "すくみあし",
 meaning: "歩き始めや方向転換の際に、足の裏が床に接着剤で張り付いたように一歩目が出なくなる症状。",
 urgency: " 現場介護でしてよい安全ケア",
 urgencyType: "info",
 checkPoint: "無理に引っ張ると転倒します。『いち、に』とリズムカルに声をかけたり、職員の足をまたいでもらう、床に線を引くなど視覚・聴覚の合図が極めて有効です。",
 isDisease: false
 },
 "突進現象": {
 term: "突進現象",
 ruby: "とっしんげんしょう",
 meaning: "歩き始めると前傾姿勢のまま小刻みに足が加速し、自分の意思で止まれなくなる症状。",
 urgency: " 転倒高リスク (見守り必須)",
 urgencyType: "warning",
 checkPoint: "壁や物に激突して重傷を負うリスクがあります。歩行時は必ず前方・側方に付き添い、止まる際は正面から肩を優しく支えて制動します。",
 isDisease: false
 },

 // 代謝・消化・嚥下
 "低血糖発作": {
 term: "低血糖発作",
 ruby: "ていけっとうほっさ",
 meaning: "血糖値が過度に低下し、冷汗・手指の震え・動悸・激しい空腹感・生あくび・ふらつきを起こす状態。",
 urgency: " 即時報告レベル (昏睡リスク)",
 urgencyType: "danger",
 checkPoint: "放置すると意識消失・脳障害に繋がります。直ちに安静を保ち看護師へ報告。指示に基づきブドウ糖やジュース等の糖分を迅速に補給します。",
 isDisease: false
 },
 "チョークサイン": {
 term: "チョークサイン",
 ruby: "ちょーくさいん",
 meaning: "食べ物が喉に詰まり声が出せないとき、自分の喉元を両手で強く押さえる窒息の世界共通サイン。",
 urgency: " 超緊急 (即時窒息解除・救急)",
 urgencyType: "danger",
 checkPoint: "1分1秒を争う窒息状態です。直ちに大声で周囲を呼び、背部叩打法（肩甲骨の間を手のひらで強く叩く）やハイムリック法を実施し、119番通報してください。",
 isDisease: false
 },
 "交互嚥下": {
 term: "交互嚥下",
 ruby: "こうごえんげ",
 meaning: "主食やおかずを食べたあとに、お茶やゼリー、とろみ水を挟んで飲み込ませる介助法。",
 urgency: " 現場介護でしてよい安全ケア",
 urgencyType: "info",
 checkPoint: "喉の奥に残留した固形物を水分やゼリーが押し流してくれるため、食後のむせや誤嚥性肺炎の予防に極めて高い効果があります。",
 isDisease: false
 },
 "爪白癬": {
 term: "爪白癬",
 ruby: "つめはくせん",
 meaning: "爪の水虫。爪が白濁・肥厚して脆くなる真菌感染症。",
 urgency: "ℹ 現場ケア知識 (足病変チェック)",
 urgencyType: "info",
 checkPoint: "糖尿病の利用者は足の感覚が鈍く、爪の割れや靴擦れから細菌が入り足壊疽（切断）に繋がることがあります。入浴時に足先の傷や赤みがないか必ず観察します。",
 isDisease: false
 },
 "シャント": {
 term: "シャント",
 ruby: "しゃんと",
 meaning: "人工透析のために、手術で腕の動脈と静脈を直接つなぎ合わせて血流を増やした血管。",
 urgency: " 圧迫厳禁 / 拍動停止時は即報告",
 urgencyType: "warning",
 checkPoint: "シャントがある腕での血圧測定、採血、腕枕、重い荷物の把持、腕時計・ゴムバンドの装着は厳禁。耳を近づけて『ザーザー』という血流音が聞こえるか確認します。",
 isDisease: false
 },
 "宿便性イレウス": {
 term: "宿便性イレウス",
 ruby: "しゅくべんせいいれうす",
 meaning: "直腸に硬い便が大量に詰まり、腸閉塞を起こして激しい腹痛や嘔吐を起こす状態。",
 urgency: " 即時報告レベル",
 urgencyType: "danger",
 checkPoint: "数日間排便がない、下腹部がパンパンに張っている、吐き気や嘔吐がある場合は直ちに看護師へ連絡。摘便や浣腸、受診の判断を仰ぎます。",
 isDisease: false
 },

 // 外傷・骨
 "圧迫骨折": {
 term: "圧迫骨折",
 ruby: "あっぱくこっせつ",
 meaning: "骨粗鬆症で弱くなった背骨が、尻もちやくしゃみ等の軽微な衝撃でつぶれる骨折。",
 urgency: " 腰背部の急な激痛は即報告",
 urgencyType: "warning",
 checkPoint: "『起き上がるときに腰や背中が激痛で動けない』と訴えたら無理に立たせず、横向きで膝を曲げて丸くなる姿勢で安静を保ち、看護師へ報告します。",
 isDisease: false
 },
 "大腿骨頸部骨折": {
 term: "大腿骨頸部骨折",
 ruby: "だいたいこつけいぶこっせつ",
 meaning: "太ももの骨の付け根の骨折。転倒によって発生し、歩行困難になる重大骨折。",
 urgency: " 即時報告レベル (無理に動かさない)",
 urgencyType: "danger",
 checkPoint: "転倒後、立ち上がれない、足の向きが外側を向いて左右の長さが違う、足の付け根を押すと激痛があるときは骨折確定疑い。絶対に歩かせず看護師・医師へ連絡します。",
 isDisease: false
 },
 "良肢位": {
 term: "良肢位",
 ruby: "りょうしい",
 meaning: "万が一関節が固まって動かなくなっても、日常生活の支障が最も少なくなる自然な姿勢。",
 urgency: " 現場介護でしてよい安全ケア",
 urgencyType: "info",
 checkPoint: "肩は軽く広げ、肘は直角に近く、手首は少し反らせ、足首は直角（つま先が下を向かない）にクッション等で保ちます。尖足（つま先下向き）予防が特に重要です。",
 isDisease: false
 },
 "免荷": {
 term: "免荷",
 ruby: "めんか",
 meaning: "骨折や傷のある手足に体重や負荷をかけないようにすること。",
 urgency: " 現場介護で守るべき介助ルール",
 urgencyType: "info",
 checkPoint: "医師から『左足免荷』の指示がある場合、立ち上がりや移乗時に患側の足で床を踏ん張らせてはいけません。健側の足だけで支える介助を行います。",
 isDisease: false
 },
 "褥瘡": {
 term: "褥瘡",
 ruby: "じょくそう (とこづれ)",
 meaning: "寝たきり等で骨の出っ張り部分が長時間圧迫され、皮膚の血流が途絶えて組織が壊死する傷。",
 urgency: " 赤み・水疱発見時は即報告",
 urgencyType: "warning",
 checkPoint: "仙骨部（お尻中央）やかかと、大転子（腰横）の皮膚に『赤み（除圧しても消えない赤色）』を発見したら初期段階。2時間毎の体位変換とクッション除圧を徹底します。",
 isDisease: false
 },
 "脱水": {
 term: "脱水",
 ruby: "だっすい",
 meaning: "体内の水分や電解質が不足した状態。高齢者は自覚症状なく進行しやすい。",
 urgency: " 微熱・活気低下時は即報告",
 urgencyType: "warning",
 checkPoint: "口腔内の乾燥、手の甲の皮膚をつまんで戻りが遅い（ツルゴール低下）、微熱、ぼんやりしている、尿の色が濃く量が少ない時は要注意。水分補給と看護師共有を行います。",
 isDisease: false
 },

 // 主要関連病名 (isDisease: true)
 "糖尿病": {
 term: "糖尿病",
 ruby: "とうにょうびょう",
 meaning: "すい臓から出るインスリンが不足し、血液中のブドウ糖が増え続ける生活習慣病。",
 urgency: " 低血糖発作は即報告",
 urgencyType: "warning",
 checkPoint: "冷汗・手の震えなどの低血糖、足先の傷、食事の欠食・残食に注意します。",
 isDisease: true
 },
 "心不全": {
 term: "心不全",
 ruby: "しんふぜん",
 meaning: "心臓のポンプ機能が低下し、全身に十分な血液を送り出せなくなる心臓の病態。",
 urgency: " 息切れ・起座呼吸・体重急増時は即報告",
 urgencyType: "danger",
 checkPoint: "横になると苦しい起座呼吸、足の急激なむくみ、1週間で2kg以上の急な体重増加が兆候です。",
 isDisease: true
 },
 "誤嚥性肺炎": {
 term: "誤嚥性肺炎",
 ruby: "ごえんせいはいえん",
 meaning: "唾液や食物が誤って気管に入り、細菌が肺で繁殖して起こる高齢者に極めて多い肺炎。",
 urgency: " 37.5℃以上の発熱・痰急増時は即報告",
 urgencyType: "danger",
 checkPoint: "食事時の姿勢保持（背上げ・顎引き）、食形態の厳守、食後30分以上の座位保持、口腔ケアが最重要です。",
 isDisease: true
 },
 "嚥下障害": {
 term: "嚥下障害",
 ruby: "えんげしょうがい",
 meaning: "食べ物や水分を噛んで喉へ送り込み、胃へスムーズに飲み込む働きが低下した状態。",
 urgency: " むせ・湿性嗄声は要注意",
 urgencyType: "warning",
 checkPoint: "一口量を少なくする、とろみをつける、食事に集中できる環境を整えます。",
 isDisease: true
 },
 "脳梗塞": {
 term: "脳梗塞",
 ruby: "のうこうそく",
 meaning: "脳の血管が詰まり、脳細胞へ酸素が届かなくなって麻痺や言語障害が起きる病気。",
 urgency: " 片麻痺・ろれつ不良の新規出現は即救急要請",
 urgencyType: "danger",
 checkPoint: "『顔のゆがみ』『腕の脱力』『ろれつ不良』のいずれかが出たら一刻を争う救急搬送が必要です。",
 isDisease: true
 },
 "パーキンソン病": {
 term: "パーキンソン病",
 ruby: "ぱーきんそんびょう",
 meaning: "脳の神経伝達物質（ドパミン）が減少し、手足の震えや筋肉のこわばり、歩行障害が起きる難病。",
 urgency: " 転倒・すくみ足・内服時間厳守",
 urgencyType: "warning",
 checkPoint: "薬の効き目時間によって動ける時間と動けない時間が分かれます。移動時の見守り徹底が大切です。",
 isDisease: true
 },
 "骨粗鬆症": {
 term: "骨粗鬆症",
 ruby: "こつそしょうしょう",
 meaning: "骨の密度が低下してスカスカになり、わずかな衝撃でも骨折しやすくなる病気。",
 urgency: " 転倒予防徹底 / 骨折疑いは即報告",
 urgencyType: "warning",
 checkPoint: "ベッドからの起き上がりや移乗介助時に腕や足を強く引っ張ったりひねったりしてはいけません。",
 isDisease: true
 },
 "認知症": {
 term: "認知症",
 ruby: "にんちしょう",
 meaning: "脳の病気や障害により、記憶力や判断力が低下して日常生活に支障をきたす状態。",
 urgency: "ℹ 傾聴・安心感の提供 / 急変時は報告",
 urgencyType: "info",
 checkPoint: "否定や説得をせず共感して接します。急なせん妄や興奮は感染症や脱水が原因のことがあります。",
 isDisease: true
 },
 "COPD": {
 term: "COPD",
 ruby: "しーおーぴーでぃー (まんせいへいそくせいはいしっかん)",
 meaning: "長年の喫煙等で気道や肺胞が破壊され、慢性的な息切れや咳・痰が続く肺の病気。",
 urgency: " SpO2低下・呼吸苦は即報告",
 urgencyType: "danger",
 checkPoint: "動作を急がせず深呼吸を誘導。HOT（在宅酸素）のカニューラ外れがないか確認します。",
 isDisease: true
 },
 "狭心症": {
 term: "狭心症",
 ruby: "きょうしんしょう",
 meaning: "冠動脈（心臓の血管）が動脈硬化等で狭くなり、一時的に心筋へ血液が不足して胸痛が起きる病気。",
 urgency: " 締め付けられる胸痛は直ちに報告・安静",
 urgencyType: "danger",
 checkPoint: "胸の圧迫感や左肩への放散痛が典型的。発作時は安静にし、指示薬（ニトロ舌下錠等）を確認します。",
 isDisease: true
 },
 "心筋梗塞": {
 term: "心筋梗塞",
 ruby: "しんきんこうそく",
 meaning: "冠動脈が完全に閉塞し、心筋の一部が壊死する極めて危険な急性疾患。",
 urgency: " 激しい胸痛・冷汗・顔面蒼白は即救急要請",
 urgencyType: "danger",
 checkPoint: "ニトロが効かない15分以上続く激痛、冷汗、嘔吐、意識朦朧は心筋梗塞疑い。直ちに119番です。",
 isDisease: true
 },
 "慢性腎不全": {
 term: "慢性腎不全",
 ruby: "まんせいじんふぜん",
 meaning: "腎臓の老廃物排泄や水分調整の機能が何ヶ月・何年もかけて徐々に低下した状態。",
 urgency: " 浮腫・呼吸苦・倦怠感時は報告",
 urgencyType: "warning",
 checkPoint: "水分制限や塩分制限の指示を守る。透析を行っている場合はシャント肢の保護が絶対です。",
 isDisease: true
 }
};

// 高齢者施設 現場ケア辞書 (30大主要疾患・症候群)
const DISEASE_GUIDE = {
 "糖尿病": {
 symptoms: "【高血糖時】強い口渇・頻尿・倦怠感・ぼんやりする。【低血糖時】冷や汗・動悸・手指の震え・急な脱力感・生あくび・ふらつき。",
 care_points: "【現場介護の実践ケア】①食事時間と提供量の厳守（欠食・大量残食時は看護師へ共有）。②入浴時に足先の傷・爪白癬・靴擦れの早期発見と保湿ケア。③間食は施設・主治医ルールを厳守。",
 emergency: "【看護師・医師への報告基準】冷や汗・手指の震え・意識混濁などの低血糖発作時は安静を保ち、直ちに看護師へ連絡（指示に基づきブドウ糖や甘い飲料を摂取）。"
 },
 "心不全": {
 symptoms: "動いた時の息切れ・起座呼吸（横になると苦しく起き上がると楽になる）・下肢の浮腫・急激な体重増加・倦怠感。",
 care_points: "【現場介護の実践ケア】①毎日の体重測定（1週間で2kg以上の急増がないか確認）。②下肢のむくみチェック（靴下ゴム跡・靴がきつくないか）。③水分補給は制限指示量を厳守し過剰摂取を避ける。",
 emergency: "【看護師・医師への報告基準】安静時にも激しい息切れがある、ゼーゼーした苦しい呼吸、ピンク色の泡状痰、SpO2 92%以下への急低下時は起座位を保ち直ちに看護師・往診医または救急要請。"
 },
 "高血圧": {
 symptoms: "頭痛・めまい・肩こり・のぼせ・悪心。自覚症状がないことも多い。",
 care_points: "【現場介護の実践ケア】①入浴時・排泄時の急激な血圧変動（ヒートショック）予防（脱衣所・浴室の保温）。②排便時のいきみすぎ予防（水分補給・排便記録確認）。③急な立ち上がりを避ける声かけ。",
 emergency: "【看護師・医師への報告基準】収縮期血圧180mmHg以上、激しい頭痛、嘔吐、麻痺、ろれつが回らない症状がある場合は脳血管障害の疑い。頭部を少し高くして安静を保ち直ちに看護師へ連絡。"
 },
 "誤嚥性肺炎": {
 symptoms: "37.5℃以上の発熱、湿性咳嗽、食事中の激しいむせ、ガラガラ声（湿性嗄声）、痰の増加、呼吸促迫、元気がない（活気低下）。",
 care_points: "【現場介護の実践ケア】①食事姿勢の徹底（背上げ30〜60度、軽度前傾・顎引き姿勢）。②食形態（刻み・とろみ）の厳守。一口量を少量にしペースを守る。③食後30分〜1時間は横にならず座位を保持する。④食後の丁寧な口腔ケアと義歯洗浄を徹底。",
 emergency: "【看護師・医師への報告基準】37.8℃以上の発熱、呼吸数24回/分以上、SpO2 92%以下への低下、喘鳴が続く場合は直ちに看護師・往診医へ報告。"
 },
 "誤嚥性肺炎既往": {
 symptoms: "過去に誤嚥性肺炎の罹患歴あり。活気低下、微熱、食事摂取量の低下、食後の痰がらみなどの初期兆候に留意。",
 care_points: "【現場介護の実践ケア】再発予防が最重要。①食形態の厳守。②食後の丁寧な口腔清拭・義歯洗浄。③毎食後の座位保持（30分〜1時間）。④必要時の喀痰吸引準備と看護師連携。",
 emergency: "【看護師・医師への報告基準】37.5℃以上の発熱、SpO2低下、痰の急増が見られた場合は初期段階で看護師・往診医へ報告。"
 },
 "嚥下障害": {
 symptoms: "食事中のむせ、飲み込みの遅れ、口腔内への食物残留、湿性嗄声（ガラガラ声）、食欲低下。",
 care_points: "【現場介護の実践ケア】①食事形態の厳守（刻み食・とろみ調整）。②交互嚥下（固形物と水分）を促す。③一口量を適量（スプーン半分）にする。④食前の口腔体操（パタカラ体操）の実施。",
 emergency: "【看護師・医師への報告基準】気道閉塞（チョークサイン、声が出ない、顔色蒼白・チアノーゼ）時は直ちに背部叩打法等を実施し大声で他スタッフ・看護師を呼び救急要請。"
 },
 "脳梗塞後遺症": {
 symptoms: "片麻痺、構音障害（ろれつ不良）、嚥下障害、感覚鈍麻、感情失禁、半側空間無視。",
 care_points: "【現場介護の実践ケア】①健側（麻痺のない側）からのアプローチ・声かけ・介助。②麻痺側への転倒・ずり落ち・巻き込み防止。③良肢位の保持と定期的な体位変換。④食事時の麻痺側ポケット（食物残留）確認。",
 emergency: "【看護師・医師への報告基準】麻痺の急激な悪化、意識障害、左右の瞳孔不同、激しい嘔吐は再発の疑い。直ちに安静を保ち看護師・救急搬送要請。"
 },
 "パーキンソン病": {
 symptoms: "安静時振戦（手の震え）、筋固縮、動作緩慢、姿勢反射障害（小刻み歩行、突進現象、すくみ足）。",
 care_points: "【現場介護の実践ケア】①抗パーキンソン薬の内服時間を厳守する。②歩行時の転倒リスクが極めて高いため移動時の付き添い・見守り徹底。③すくみ足にはリズミカルな声かけ（『いち、に』）や足元の視覚刺激が有効。",
 emergency: "【看護師・医師への報告基準】高熱、著しい全身のこわばり、意識混濁（悪性症候群の疑い）、または転倒による骨折疑い時は直ちに安静にして看護師・医師へ連絡。"
 },
 "骨粗鬆症": {
 symptoms: "骨脆弱化。軽微な衝撃やベッドからの立ち上がり時の転倒で大腿骨頸部骨折、圧迫骨折を起こしやすい。",
 care_points: "【現場介護の実践ケア】①転倒・転落防止が最優先（ベッド柵の適切な使用、ナースコール手元配置、床の障害物撤去）。②移乗時やオムツ交換時に腕や足を無理に引っ張らない・ひねらない。③かかとのある靴を使用。",
 emergency: "【看護師・医師への報告基準】転倒後に立ち上がれない、股関節や腰背部に激痛を訴える、足の向きが外側に向いている場合は骨折の疑い。無理に動かさず直ちに看護師・医師へ連絡。"
 },
 "認知症": {
 symptoms: "もの忘れ、見当識障害（時間・場所の誤認）、夕暮れ症候群（夕方の焦燥・不穏）、帰宅願望、徘徊リスク。",
 care_points: "【現場介護の実践ケア】①否定や叱責をせず、本人の不安・気持ちに共感して傾聴する。②急な行動変更を避け、穏やかに『〜しましょうね』と具体的に声をかける。③日中に適度な覚醒と日光浴・レクを行い、昼夜逆転を予防。④離床センサー・見守り体制の確認。",
 emergency: "【看護師・医師への報告基準】急激なせん妄・意識レベル低下、極度の興奮・パニック、食事・水分の完全拒否が続く場合は、脱水や感染症（尿路感染等）の二次症状の可能性があるため看護師へ報告。"
 },
 "骨折（大腿骨・圧迫骨折）": {
 symptoms: "患部の強い痛み、起立・歩行不能、患肢の短縮や外旋（外側を向く）、体動時の顔のゆがみ。",
 care_points: "【現場介護の実践ケア】①安静と免荷（体重をかけない介助）。②ベッド上での良肢位保持（クッションによる患部保護）。③体位変換時の無理な牽引・捻転の回避。④痛みに配慮した声かけ。",
 emergency: "【看護師・医師への報告基準】激痛の増悪、患部の著しい腫脹・熱感、神経麻痺（足指が動かない）時は直ちに看護師・往診医へ連絡。"
 },
 "慢性腎不全（CKD・透析）": {
 symptoms: "全身倦怠感、食欲不振、浮腫（足・顔面）、皮膚の乾燥・かゆみ、貧血によるふらつき。",
 care_points: "【現場介護の実践ケア】①水分・塩分・カリウム・リンの摂取指示の厳守（間食に注意）。②シャント肢での血圧測定・圧迫・重い荷物の把持は厳禁。③皮膚の保清と保湿ローション塗布。",
 emergency: "【看護師・医師への報告基準】呼吸困難、強い吐き気、不整脈、意識障害、シャント部の拍動停止（ザーザー音がしない）時は直ちに看護師・主治医へ緊急連絡。"
 },
 "慢性閉塞性肺疾患 (COPD・喘息)": {
 symptoms: "労作時の息切れ、慢性的な咳・痰、喘鳴（ゼーゼー音）、口すぼめ呼吸。",
 care_points: "【現場介護の実践ケア】①動作時は急がせず、深呼吸（鼻から吸って口から長く吐く）を促す。②在宅酸素療法（HOT）中はカニューラのズレ・折れ曲がり・流量設定を毎時確認。③禁煙・感染予防（手洗い・加湿）。",
 emergency: "【看護師・医師への報告基準】SpO2 90%以下への急低下、唇や爪のチアノーゼ（紫色）、強い呼吸困難・会話困難時は座位を保ち酸素吸入を確認のうえ看護師・医師へ連絡。"
 },
 "不整脈・心房細動": {
 symptoms: "動悸、脈の乱れ（脈が飛ぶ・不規則）、めまい、立ちくらみ、失神、胸の違和感。",
 care_points: "【現場介護の実践ケア】①バイタル測定時に検脈（1分間の整・不整の確認）。②抗凝固薬（血液サラサラの薬）服用中は皮下出血（青あざ）や歯肉出血に注意し転倒を徹底予防。",
 emergency: "【看護師・医師への報告基準】突然の意識消失、脈拍120以上または45以下の極端な徐脈、胸痛、ふらつきを伴う激しい動悸時は安静にし直ちに看護師・医師へ連絡。"
 },
 "白内障・緑内障（視覚障害）": {
 symptoms: "視力低下、目のかすみ、視野狭窄（見えない範囲がある）、まぶしさ、段差の踏み外し。",
 care_points: "【現場介護の実践ケア】①居室・廊下の照度確保、足元の障害物・コード類の徹底排除。②食事の配膳位置を時計の針（クロックポジション）で声かけ説明。③介助時は必ず声かけをしてから触れる。",
 emergency: "【看護師・医師への報告基準】急激な眼痛、激しい頭痛、吐き気、急な視野消失は急性緑内障発作の疑い。失明のリスクがあるため直ちに眼科受診・看護師へ報告。"
 },
 "老人性難聴": {
 symptoms: "呼びかけへの無反応、聞き返しが多い、テレビの音量が大きい、会話への参加減少。",
 care_points: "【現場介護の実践ケア】①正面から視線を合わせ、口元を見せながら低めの落ち着いた声ではっきりと話す。②補聴器の使用確認・電池チェック。③身振り手振りや筆談・文字ボードの活用。",
 emergency: "【看護師・医師への報告基準】耳だれ（耳漏）、耳の激しい痛み、急激な片耳の聞こえの悪化（突発性難聴疑い）時は看護師へ報告。"
 },
 "狭心症・心筋梗塞既往": {
 symptoms: "胸部圧迫感（締め付けられるような痛み）、左肩や顎への放散痛、冷や汗、息切れ。",
 care_points: "【現場介護の実践ケア】①急な寒冷刺激（入浴時の脱衣所・トイレ）を避け室温管理。②興奮・強いストレス・過労の予防。③発作時の指示薬（ニトロペン舌下錠など）の保管場所確認。",
 emergency: "【看護師・医師への報告基準】15分以上続く強い胸痛、冷や汗、顔面蒼白、ニトロ使用後も治まらない痛みは急性心筋梗塞の疑い。直ちに救急要請・看護師連絡。"
 },
 "変形性関節症・リウマチ": {
 symptoms: "膝や股関節、手指の関節痛、朝のこわばり、関節の変形、歩行時の疼痛・跛行。",
 care_points: "【現場介護の実践ケア】①関節を冷やさず保温（膝当て・ブランケット）。②立ち上がり時・移乗時の手すり把持誘導。③無理な正座や深い屈曲動作を避ける。④杖や歩行器の適切な使用支援。",
 emergency: "【看護師・医師への報告基準】関節の急激な熱感・腫脹・激痛、体重をかけられないほどの激しい疼痛増悪時は看護師へ報告。"
 },
 "脊柱管狭窄症・腰痛症": {
 symptoms: "腰痛、臀部から下肢へのしびれ・痛み、間欠性跛行（少し歩くと痛むが前かがみで休むと楽になる）。",
 care_points: "【現場介護の実践ケア】①歩行時はシルバーカーや歩行器などの前傾姿勢での移動を支援。②重い物の持ち上げや長時間の直立を避ける。③ベッドからの起き上がり時は横向きを経由する。",
 emergency: "【看護師・医師への報告基準】両足の急激な麻痺、排尿・排便障害（失禁や尿閉）が出現した場合は重篤な神経圧迫の疑い。直ちに看護師・医師へ連絡。"
 },
 "慢性便秘症・イレウス注意": {
 symptoms: "排便停止、腹部膨満感（お腹の張り）、腹痛、嘔吐、げっぷの増加、食欲不振。",
 care_points: "【現場介護の実践ケア】①排便日・便形状・量の記録徹底（3日以上排便なし時は要注意）。②水分補給の促進、朝食後のトイレ誘導。③処方された緩下剤の適切な服用支援。",
 emergency: "【看護師・医師への報告基準】激しい腹痛、嘔吐（特に便臭のある嘔吐）、排ガス（おなら）停止、高度な腹部膨満時は腸閉塞（イレウス）の疑い。直ちに絶飲食とし看護師・往診医へ連絡。"
 },
 "逆流性食道炎・胃潰瘍": {
 symptoms: "胸焼け、呑酸（酸っぱいものが上がってくる）、食後の胃痛、吐き気、黒色便（タール便）。",
 care_points: "【現場介護の実践ケア】①食後すぐに横にならず、最低30分は座位または背上げ（ギャッジアップ）を保つ。②早食い・食べ過ぎ・脂っこい食事を避ける。③就寝時の頭部挙上。",
 emergency: "【看護師・医師への報告基準】吐血（コーヒー残渣様）、黒色便（タール便）、激しいみぞおちの痛みがある時は消化管出血の疑い。直ちに看護師へ連絡。"
 },
 "脂質異常症（高脂血症）": {
 symptoms: "自覚症状はほとんどない。動脈硬化を進行させ心筋梗塞や脳梗塞の原因となる。",
 care_points: "【現場介護の実践ケア】①施設給食の摂取バランスの維持（油もの・糖分の過剰間食の制限）。②適度な日常運動（体操・散歩レク）。③定期的な採血・処方薬の内服確認。",
 emergency: "【看護師・医師への報告基準】急な胸痛や片麻痺など血管障害のサインが見られた場合は直ちに救急対応・看護師連絡。"
 },
 "尿路感染症・尿道カテーテル": {
 symptoms: "37.5℃以上の発熱、悪寒・戦慄（震え）、尿のにごり・血尿・異臭、排尿痛、不穏。",
 care_points: "【現場介護の実践ケア】①十分な水分補給（尿量を保ち菌を流す）。②陰部の保清（オムツ交換時の清拭・シャワー浴）。③バルーン留置中は蓄尿バッグを膀胱より下に保ち逆流を防止。",
 emergency: "【看護師・医師への報告基準】高熱（38℃以上）、激しい震え（悪寒戦慄）、尿の強い混濁や血尿、カテーテルの閉塞・尿量激減時は腎盂腎炎・敗血症の恐れあり。直ちに看護師・医師へ連絡。"
 },
 "前立腺肥大症": {
 symptoms: "頻尿（特に夜間）、尿が出にくい（排尿開始の遅れ）、残尿感、尿意切迫感。",
 care_points: "【現場介護の実践ケア】①夜間のトイレ誘導計画（転倒予防）。②排便管理（便秘による尿道圧迫防止）。③体を冷やさない保温。",
 emergency: "【看護師・医師への報告基準】強い尿意があるのに全く尿が出ない（急性尿閉）、下腹部の強い張り・激痛時は導尿が必要となるため直ちに看護師へ連絡。"
 },
 "褥瘡（床ずれ）・皮膚剥離": {
 symptoms: "骨突出部（仙骨・踵・大転子等）の発赤・水疱・びらん、皮膚の裂傷（スキンテア）。",
 care_points: "【現場介護の実践ケア】①定期的な体位変換（除圧）。②ベッド背上げ時の背抜き・圧抜き介助。③皮膚の清潔・保湿ケア。④衣服・車椅子の摩擦・ずれの防止。",
 emergency: "【看護師・医師への報告基準】皮膚の開放創、悪臭を伴う浸出液、創部の拡大、周囲の発熱・発赤時は感染や深部褥瘡の恐れ。直ちに看護師へ処置要請。"
 },
 "帯状疱疹": {
 symptoms: "身体の片側にピリピリとした神経痛、帯状に現れる赤い発疹・小水疱、微熱。",
 care_points: "【現場介護の実践ケア】①水疱を破らないよう愛護的に保護（摩擦を避ける）。②患部を冷やさず保温。③免疫低下時の兆候のため十分な休息と栄養を支援。",
 emergency: "【看護師・医師への報告基準】顔面や眼の周囲の発疹（角膜障害の恐れ）、激しい神経痛、発熱時は早期の抗ウイルス薬投与が必要。直ちに看護師・医師へ連絡。"
 },
 "痛風（高尿酸血症）": {
 symptoms: "足の親指の付け根などの関節の突然の激痛、赤く腫れる（痛風発作）。",
 care_points: "【現場介護の実践ケア】①十分な水分摂取（尿酸排泄）。②発作患部に毛布や靴下が触れないよう保護。③アルコールやプリン体の多い食品を制限。",
 emergency: "【看護師・医師への報告基準】関節の激しい腫脹・熱感・耐えがたい激痛時は痛風発作の疑い。患部を高くして冷やし、無理に歩かせず看護師へ連絡。"
 },
 "てんかん・痙攣発作": {
 symptoms: "突然の意識消失、手足の強直・間代性痙攣（ガクガク震える）、眼球上転、口から泡を吹く。",
 care_points: "【現場介護の実践ケア】①周囲の危険物（家具・硬い物）を遠ざけ頭部を保護。②衣服の襟元を緩め、吐瀉物による窒息を防ぐため顔を横に向ける。③無理に押さえつけたり口に物を噛ませない。",
 emergency: "【看護師・医師への報告基準】発作が5分以上続く、連続して発作が起きる、発作後に意識が戻らない、頭部を強打した時は直ちに救急要請・看護師連絡。"
 },
 "老年期うつ・適応障害": {
 symptoms: "気力の低下、不眠、食欲不振、悲観的な発言、身体の不調の強い訴え（心気症）。",
 care_points: "【現場介護の実践ケア】①無理に励ましたり焦らせたりせず、本人の辛さに共感し穏やかに寄り添う。②小さな日常の喜びや安心できる時間を共有。③安全配慮と見守り。",
 emergency: "【看護師・医師への報告基準】死を口にする、極端な絶食・水分拒否、強い焦燥感が見られる場合は速やかに看護師・往診医・ご家族へ情報共有。"
 },
 "悪性腫瘍（緩和ケア・ターミナル）": {
 symptoms: "全身倦怠感、疼痛（痛み）、食欲低下、体重減少、浮腫、呼吸苦。",
 care_points: "【現場介護の実践ケア】①痛みの少ない安楽な体位の工夫（クッション調整）。②本人の希望・好みを尊重した食事・水分ケア。③尊厳を守る丁寧な声かけとスキンシップ。",
 emergency: "【看護師・医師への報告基準】痛みの急激な増悪、呼吸困難、意識の混濁、終末期徴候（下顎呼吸・尿量減少）時は看取り方針（ACP）に基づき直ちに看護師・往診医・ご家族へ連絡。"
 }
};

// 病歴・既往歴のスマート解決関数（カスタム設定・完全一致・部分一致・同義語照合）
function resolveDiseaseGuide(diseaseName) {
 const name = (diseaseName || "").trim();
 if (!name) return null;

 // 1. 施設独自のカスタムガイドがあれば最優先
 if (db && db.data && db.data.custom_disease_guides && db.data.custom_disease_guides[name]) {
 return { guide: db.data.custom_disease_guides[name], matchedName: name, isCustom: true };
 }

 // 2. 完全一致
 if (DISEASE_GUIDE[name]) {
 return { guide: DISEASE_GUIDE[name], matchedName: name, isCustom: false };
 }

 // 3. 部分一致（名称を含む・含まれる）
 const lower = name.toLowerCase();
 for (const [key, val] of Object.entries(DISEASE_GUIDE)) {
 if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) {
 return { guide: val, matchedName: key, isCustom: false };
 }
 }

 // 4. 同義語・類語照合辞書
 const SYNONYMS = [
 { patterns: ["認知症", "アルツハイマー", "レビー", "血管性認知", "ピック", "長谷川", "物忘れ", "もの忘れ"], target: "認知症" },
 { patterns: ["心不全", "心疾患", "うっ血性"], target: "心不全" },
 { patterns: ["糖尿病", "高血糖", "低血糖", "インスリン", "dm", "血糖"], target: "糖尿病" },
 { patterns: ["高血圧", "血圧症", "ht", "高血圧症"], target: "高血圧" },
 { patterns: ["肺炎", "誤嚥", "誤嚥性"], target: "誤嚥性肺炎" },
 { patterns: ["脳梗塞", "脳出血", "脳卒中", "くも膜下", "クモ膜下", "片麻痺", "脳血管"], target: "脳梗塞後遺症" },
 { patterns: ["パーキンソン", "振戦", "固縮"], target: "パーキンソン病" },
 { patterns: ["骨粗鬆", "骨粗しょう", "骨脆弱"], target: "骨粗鬆症" },
 { patterns: ["骨折", "大腿骨", "圧迫骨折", "骨折後"], target: "骨折（大腿骨・圧迫骨折）" },
 { patterns: ["腎不全", "人工透析", "ckd", "透析"], target: "慢性腎不全（CKD・透析）" },
 { patterns: ["copd", "肺気腫", "喘息", "気管支喘息", "hot", "在宅酸素"], target: "慢性閉塞性肺疾患 (COPD・喘息)" },
 { patterns: ["不整脈", "心房細動", "ペースメーカー", "期外収縮"], target: "不整脈・心房細動" },
 { patterns: ["白内障", "緑内障", "黄斑", "視力低下", "視覚障害", "盲目"], target: "白内障・緑内障（視覚障害）" },
 { patterns: ["難聴", "補聴器", "耳が遠い"], target: "老人性難聴" },
 { patterns: ["狭心症", "心筋梗塞", "虚血性心疾患", "ニトロ"], target: "狭心症・心筋梗塞既往" },
 { patterns: ["関節症", "変形性膝関節症", "膝痛", "リウマチ", "関節痛"], target: "変形性関節症・リウマチ" },
 { patterns: ["狭窄症", "脊柱管", "腰痛", "坐骨神経痛", "ヘルニア"], target: "脊柱管狭窄症・腰痛症" },
 { patterns: ["便秘", "慢性便秘", "下剤", "イレウス", "腸閉塞"], target: "慢性便秘症・イレウス注意" },
 { patterns: ["食道炎", "逆流性", "胃潰瘍", "十二指腸潰瘍", "胃炎"], target: "逆流性食道炎・胃潰瘍" },
 { patterns: ["脂質", "高脂血症", "コレステロール"], target: "脂質異常症（高脂血症）" },
 { patterns: ["尿路感染", "膀胱炎", "腎盂腎炎", "バルーン", "カテーテル"], target: "尿路感染症・尿道カテーテル" },
 { patterns: ["前立腺", "排尿困難", "頻尿", "尿閉"], target: "前立腺肥大症" },
 { patterns: ["褥瘡", "床ずれ", "スキンテア", "皮膚剥離", "皮膚トラブル"], target: "褥瘡（床ずれ）・皮膚剥離" },
 { patterns: ["帯状疱疹", "ヘルペス"], target: "帯状疱疹" },
 { patterns: ["痛風", "尿酸"], target: "痛風（高尿酸血症）" },
 { patterns: ["てんかん", "痙攣", "けいれん", "発作"], target: "てんかん・痙攣発作" },
 { patterns: ["うつ", "鬱", "抑うつ", "不安症"], target: "老年期うつ・適応障害" },
 { patterns: ["がん", "悪性腫瘍", "癌", "ターミナル", "緩和ケア"], target: "悪性腫瘍（緩和ケア・ターミナル）" }
 ];

 for (const item of SYNONYMS) {
 if (item.patterns.some(p => lower.includes(p.toLowerCase()))) {
 if (DISEASE_GUIDE[item.target]) {
 return { guide: DISEASE_GUIDE[item.target], matchedName: item.target, isCustom: false };
 }
 }
 }

 // 5. 該当なし（標準の現場観察ガイド）
 return {
 guide: {
 symptoms: "日々のバイタル・顔色・呼吸状態・食欲・活気・歩行の安定性を観察してください。",
 care_points: "【現場介護の実践ケア】無理のない動作介助、定期的な水分補給、安全な移乗・転倒見守り、規則正しい生活リズムの維持。",
 emergency: "【看護師・医師への報告基準】意識障害、普段と違う言動、激しい痛み、37.5℃以上の発熱、呼吸苦がみられた場合は直ちに安静を保ち看護師または医師へ連絡。"
 },
 matchedName: name,
 isCustom: false,
 isFallback: true
 };
}

// [Claude修正] 施設名の取得を1か所にまとめ、画面・全帳票で「変更した施設名」が使われるようにする
function getFacilityName() {
 return (db && db.data && db.data.facility_name) ? db.data.facility_name : "陽だまりの家";
}

function editFacilityName() {
 const currentName = getFacilityName();
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
 const name = getFacilityName();
 const display = document.getElementById("facilityNameDisplay");
 if (display) display.textContent = name;
 document.title = `${name} 統合業務ポータルシステム`;
}

window.addEventListener("DOMContentLoaded", () => {
 updateFacilityNameUI();
 ensureStaffPinData();
 gState.stamps = sortStaffList(gState.stamps);
 renderStaffSelect();
 updateStaffRoleUI();
 renderResidentsStrip();
 renderResidentDetail();
 updateRecordTargetBanner();
 updateRecordCharCount();
 renderQuickTemplates();
 renderCalendar();
 loadDateRecords(gState.selectedDate);
 checkGlobalAlerts();
 syncCategoryButtons();
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
 const sel = document.getElementById("currentStaff");
 if (sel && sel.value) {
 gState.currentStaff = sel.value;
 }
 updateStaffRoleUI();
 renderNotebook();
 checkGlobalAlerts();
 if (gState.activePortal === "office" && gState.activeOfficeTab === "orders") {
 renderOfficeOrders();
 }
}

// 職員ロール判定（管理者または事務員）
function isStaffAdminOrClerk(staff) {
 if (!staff) return false;
 const staffObj = (gState.stamps || []).find(s => (s.name || s) === staff);
 const role = staffObj ? (staffObj.role || "") : "";
 const combined = `${role} ${staff}`.toLowerCase();
 return combined.includes("管理者") || combined.includes("施設長") || combined.includes("事務") || combined.includes("所長") || combined.includes("ホーム長") || combined.includes("院長") || combined.includes("理事") || combined.includes("事務長");
}

function isCurrentStaffAdminOrClerk() {
 const staffSelect = document.getElementById("currentStaff");
 const staff = (staffSelect ? staffSelect.value : "") || gState.currentStaff || "";
 return isStaffAdminOrClerk(staff);
}

// 権限に応じたUI表示切替 (＋職員管理ボタン、初期設定ボタン、事務所管理タブ)
function updateStaffRoleUI() {
 const isAdminOrClerk = isCurrentStaffAdminOrClerk();
 
 // 1. ＋職員管理ボタン (管理者・事務員のみ)
 const btnStaffManage = document.getElementById("btnHeaderStaffManage");
 if (btnStaffManage) {
 btnStaffManage.style.display = isAdminOrClerk ? "inline-block" : "none";
 }

 // 2. 現在選択職員の暗証番号初回設定ボタン
 const currentStaffName = (document.getElementById("currentStaff")?.value) || gState.currentStaff || "";
 const currentStaffObj = (gState.stamps || []).find(s => (s.name || s) === currentStaffName);
 const isInitial = currentStaffObj ? ((currentStaffObj.pin || "0000") === "0000" || currentStaffObj.is_initial_pin !== false) : false;
 const btnInitial = document.getElementById("btnSetInitialPin");
 if (btnInitial) {
 btnInitial.style.display = isInitial ? "inline-block" : "none";
 }

 // 3. 事務所ポータルの管理者専用サブタブ行
 const adminRow = document.getElementById("officeAdminSecurityRow");
 if (adminRow) {
 adminRow.style.display = isAdminOrClerk ? "flex" : "none";
 }
}

// 管理者権限チェック (施設長または管理者ロール)
function isCurrentStaffAdmin() {
 const staffSelect = document.getElementById("currentStaff");
 if (!staffSelect) return false;
 const staff = staffSelect.value || "";
 if (!staff) return false;
 const staffObj = (gState.stamps || []).find(s => (s.name || s) === staff);
 const role = staffObj ? (staffObj.role || "") : "";
 const combined = `${role} ${staff}`.toLowerCase();
 if (combined.includes("管理者") || combined.includes("施設長") || combined.includes("所長") || combined.includes("ホーム長") || combined.includes("院長") || combined.includes("理事") || combined.includes("事務長")) {
 return true;
 }
 return false;
}

// ==========================================
// アラート完了・非表示（ディスミス）＆ 即時補充管理
// ==========================================
// [Claude修正] 旧実装は「閉じた」記録をその端末のメモリ (gState) にだけ持っていたため、
// 他の端末には反映されず、再読み込みすると復活していた。
// 閉じた記録をデータベース (dismissed_alerts) に保存し、サーバー経由で全端末に共有する。
// また、キーに日付や在庫数などの「その時点の状況」を含め、状況が変われば再びアラートが出るようにした。
function getDismissedAlertStore() {
 if (!db || !db.data) return {};
 const st = db.data.dismissed_alerts;
 if (!st || typeof st !== "object" || Array.isArray(st)) {
 db.data.dismissed_alerts = {};
 }
 return db.data.dismissed_alerts;
}

function dismissAlerts(alertKeys) {
 const store = getDismissedAlertStore();
 const staff = (document.getElementById("currentStaff")?.value) || "";
 const now = new Date();
 const nowStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${now.toTimeString().slice(0, 5)}`;
 (alertKeys || []).forEach(k => {
 if (k) store[k] = { at: nowStr, by: staff };
 });
 // 120日より前の記録は削除してデータの肥大化を防ぐ
 const limit = new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000);
 Object.keys(store).forEach(k => {
 const at = store[k] && store[k].at ? new Date(store[k].at.replace(" ", "T")) : null;
 if (at && !isNaN(at) && at < limit) delete store[k];
 });
 db.save();
 checkGlobalAlerts();
}

function dismissAlert(alertKey) {
 dismissAlerts([alertKey]);
}

function undismissAlert(alertKey) {
 const store = getDismissedAlertStore();
 delete store[alertKey];
}

function isAlertDismissed(alertKey) {
 const store = (db && db.data && db.data.dismissed_alerts && typeof db.data.dismissed_alerts === "object") ? db.data.dismissed_alerts : {};
 return Object.prototype.hasOwnProperty.call(store, alertKey);
}

function getRealTodayStr() {
 const d = new Date();
 return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dismissLowStockAll() {
 dismissAlerts(gState.lastLowStockAlertKeys || []);
}

function dismissCareExpiryAll() {
 dismissAlerts(gState.lastCareExpiryAlertKeys || []);
}

// アラートから直接ワンタップで在庫を平常時定数まで補充する
function quickReplenishStock(itemId) {
 const item = (gState.inventory || []).find(i => i.id === itemId);
 if (!item) return;

 const staff = (document.getElementById("currentStaff")?.value) || "現場担当";
 const now = new Date();
 const nowStr = `${now.toISOString().split("T")[0]} ${now.toTimeString().slice(0, 5)}`;
 
 const normalStock = item.normal_stock || (item.safety_stock * 2);
 const addQty = Math.max(normalStock - item.current_stock, item.safety_stock);
 item.current_stock += addQty;

 if (!db.data.inventory_logs) db.data.inventory_logs = [];
 db.data.inventory_logs.unshift({
 id: Date.now(),
 timestamp: nowStr,
 item_id: item.id,
 item_name: item.name,
 action_type: "補充",
 change_qty: addQty,
 after_qty: item.current_stock,
 staff_name: staff,
 reason: "現場アラートより即時補充 (平常時定数達成)"
 });

 db.save();
 if (typeof renderOfficeInventory === 'function') renderOfficeInventory();
 checkGlobalAlerts();
 alert(`「${item.name}」を ${addQty}${item.unit} 補充しました！（平常時定数: ${normalStock}${item.unit} / 現在庫: ${item.current_stock}${item.unit}）\n要発注アラートを解除しました。`);
}

// すべての不足在庫を一括補充する
function quickReplenishAllStock() {
 const staff = (document.getElementById("currentStaff")?.value) || "現場担当";
 const now = new Date();
 const nowStr = `${now.toISOString().split("T")[0]} ${now.toTimeString().slice(0, 5)}`;
 let replenishedNames = [];

 (gState.inventory || []).forEach(item => {
 if (item.current_stock <= item.safety_stock) {
 const normalStock = item.normal_stock || (item.safety_stock * 2);
 const addQty = Math.max(normalStock - item.current_stock, item.safety_stock);
 item.current_stock += addQty;
 replenishedNames.push(`${item.name} (+${addQty}${item.unit})`);

 if (!db.data.inventory_logs) db.data.inventory_logs = [];
 db.data.inventory_logs.unshift({
 id: Date.now() + Math.random(),
 timestamp: nowStr,
 item_id: item.id,
 item_name: item.name,
 action_type: "補充",
 change_qty: addQty,
 after_qty: item.current_stock,
 staff_name: staff,
 reason: "現場アラートより全品一括補充 (平常時定数達成)"
 });
 }
 });

 db.save();
 if (typeof renderOfficeInventory === 'function') renderOfficeInventory();
 checkGlobalAlerts();
 alert(`以下の消耗品を平常時定数まで一括補充しました！\n・${replenishedNames.join("\n・")}\n\n要発注アラートをすべて解除しました。`);
}

// 月間業務連絡を当職員分すべて一括確認済にする
function confirmAllMonthlyNoticesForStaff() {
 const staff = (document.getElementById("currentStaff")?.value) || "";
 if (!staff) return;
 const curMonth = (gState.selectedDate || new Date().toISOString()).slice(0, 7);
 (db.data.monthly_notices || []).forEach(n => {
 if (n.month === curMonth) {
 if (!Array.isArray(n.confirmed_staff)) n.confirmed_staff = [];
 if (!n.confirmed_staff.includes(staff)) n.confirmed_staff.push(staff);
 }
 });
 db.save();
 if (typeof renderMonthlyNotices === 'function') renderMonthlyNotices();
 checkGlobalAlerts();
 alert(`${staff} さんの未確認連絡をすべて「確認済」にしました！未確認アラートを解除しました。`);
}

// アラート監視（管理者発注認証待ち・前月誕生日・非常食2週前・在庫補充・受診2週1週前・要介護期限・排便3日以上なし・月間連絡未確認）
function checkGlobalAlerts() {
 const container = document.getElementById("alertsContainer");
 if (!container) return;
 let alertHtml = "";
 const today = new Date();
 const todayStr = gState.selectedDate || today.toISOString().split("T")[0];

 // 0.0 【管理者・事務員専用：初期パスワード未変更セキュリティ警告】
 const isAdminOrClerk = isCurrentStaffAdminOrClerk();
 const pinWarnKey = `initial_pin_warning_${getRealTodayStr()}`;
 if (isAdminOrClerk && !isAlertDismissed(pinWarnKey)) {
 const unconfigured = (gState.stamps || []).filter(s => {
 const pin = s.pin || "0000";
 return pin === "0000" || s.is_initial_pin !== false;
 });
 if (unconfigured.length > 0) {
 const staffNames = unconfigured.map(s => escapeHtml(s.name || s)).join("、");
 alertHtml += `
 <div class="alert-banner alert-warning" style="background:#fef2f2; border-left:5px solid #dc2626; color:#991b1b;">
 <div style="width:100%;">
 <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
 <span><strong>【セキュリティ設定警告】</strong> 初期暗証番号(0000)のままの職員が<strong>${unconfigured.length}名</strong>います（対象: ${staffNames}）。安全管理のため、事務所ポータルの「暗証番号管理」より変更を行ってください。</span>
 <div style="display:flex; gap:6px; align-items:center;">
 <button class="btn btn-secondary" style="padding:3px 10px; font-size:12px; background:#fee2e2; color:#991b1b; border-color:#fca5a5;" onclick="switchPortal('office'); switchOfficeTab('staff_auth');">暗証番号管理を開く</button>
 <button class="btn btn-secondary" style="padding:2px 8px; font-size:11px;" onclick="dismissAlert('${pinWarnKey}')">閉じる</button>
 </div>
 </div>
 </div>
 </div>
 `;
 }
 }

 // 0. 【管理者専用：発注・在庫認証アラート (上司承認待ち)】
 const isAdmin = isCurrentStaffAdmin();
 const pendingOrders = (db.data.orders || []).filter(o => o.status === "申請中");
 if (isAdmin && pendingOrders.length > 0 && !isAlertDismissed('admin_pending_orders')) {
 const currentStaffName = (document.getElementById("currentStaff")?.value) || "管理者";
 const orderItemsSummary = pendingOrders.map(o => {
 return `
 <div style="display:flex; justify-content:space-between; align-items:center; background:#ffffff; padding:6px 12px; border-radius:6px; border:1px solid #fed7aa; margin-top:4px;">
 <div>
 <strong style="color:#c2410c;">【${escapeHtml(o.applicant || '職員')} 申請】</strong>
 <strong>${escapeHtml(o.item_name)}</strong> × <strong>${o.quantity}</strong>
 <span style="color:#64748b; font-size:12px;">(¥${(o.total_price || 0).toLocaleString()} / ${escapeHtml(o.supplier_name || '業者')})</span>
 <div style="font-size:11px; color:#78350f; margin-top:2px;">理由: ${escapeHtml(o.reason || '補充発注')} / 申請日: ${o.ordered_at || '-'}</div>
 </div>
 <div style="display:flex; gap:6px; align-items:center; white-space:nowrap; margin-left:8px;">
 <button class="btn btn-primary" style="padding:3px 10px; font-size:12px; background:#16a34a; border-color:#15803d; color:#fff;" onclick="approveOrder(${o.id}, '承認済')"> 承認する</button>
 <button class="btn btn-danger" style="padding:3px 8px; font-size:12px; background:#ef4444; border-color:#dc2626; color:#fff;" onclick="approveOrder(${o.id}, '差戻し')"> 差戻し</button>
 </div>
 </div>
 `;
 }).join("");

 alertHtml += `
 <div class="alert-banner alert-warning" style="background:#fff7ed; border-left:5px solid #ea580c; color:#9a3412;">
 <div style="width:100%;">
 <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
 <span>  <strong>【要認証アラート】</strong> 管理者（<strong>${escapeHtml(currentStaffName)}</strong>）：スタッフから発注認証が求められています（承認待ち <strong>${pendingOrders.length}件</strong>）。<strong>誤承認防止のため、品名・数量・金額を1件ずつ目視確認の上で認証を行ってください。</strong></span>
 <div style="display:flex; gap:6px; align-items:center;">
 <button class="btn btn-secondary" style="padding:3px 10px; font-size:12px; background:#ffedd5; color:#9a3412; border-color:#fdba74;" onclick="switchPortal('office'); switchOfficeTab('orders');"> 発注台帳を開く</button>
 <button class="btn btn-secondary" style="padding:2px 8px; font-size:11px;" onclick="dismissAlert('admin_pending_orders')"> 閉じる</button>
 </div>
 </div>
 <div style="margin-top:6px; display:flex; flex-direction:column; gap:4px;">
 ${orderItemsSummary}
 </div>
 </div>
 </div>
 `;
 }

 // 1. 【前月誕生日事前アラート】
 const nextMonthNum = (today.getMonth() + 1) % 12 + 1;
 const birthdayKey = `birthday_${today.getMonth() === 11 ? today.getFullYear() + 1 : today.getFullYear()}_${nextMonthNum}`;
 if (!isAlertDismissed(birthdayKey)) {
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
 alertHtml += `
 <div class="alert-banner alert-info" style="background:#e0e7ff; color:#3730a3; border-left:5px solid #6366f1;">
 <span> 【来月お誕生日事前アラート】来月(${nextMonthNum}月)お誕生日の利用者様：${list} 〜プレゼントや色紙等の準備を行ってください〜</span>
 <button class="btn btn-secondary" style="padding:2px 8px; font-size:11px;" onclick="dismissAlert('${birthdayKey}')"> 準備確認・閉じる</button>
 </div>
 `;
 }
 }

 // 2. 【非常食・防災備蓄 賞味期限2週間前アラート】
 (gState.emergencySupplies || []).forEach(item => {
 const emKey = `emergency_${item.id}_${item.expiry_date || ""}`;
 if (!isAlertDismissed(emKey) && item.expiry_date) {
 const expDate = new Date(item.expiry_date);
 const diffDays = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));
 if (diffDays > 0 && diffDays <= 14) {
 alertHtml += `
 <div class="alert-banner alert-warning">
 <span> 【非常食・備蓄品 賞味期限間近】『${item.name}』の賞味期限まであと${diffDays}日 (${item.expiry_date}) 〜消費・入れ替えを行ってください〜</span>
 <button class="btn btn-secondary" style="padding:2px 8px; font-size:11px;" onclick="dismissAlert('${emKey}')"> 確認済・閉じる</button>
 </div>
 `;
 }
 }
 });

 // 3. 【在庫補充アラート (要発注)】
 // すでに発注申請中・承認済の品目は「発注手配中」として要発注アラートから自動解除
 const pendingOrderNames = (db.data.orders || [])
 .filter(o => o.status === "申請中" || o.status === "承認済")
 .map(o => o.item_name);

 const lowStockItems = (gState.inventory || []).filter(i => {
 if (i.current_stock > i.safety_stock) return false;
 if (pendingOrderNames.includes(i.name)) return false; // すでに発注済ならアラート解除
 if (isAlertDismissed(`stock_${i.id}_${i.current_stock}`)) return false; // スタッフが手動完了・非表示にした場合
 return true;
 });

 gState.lastLowStockAlertKeys = lowStockItems.map(i => `stock_${i.id}_${i.current_stock}`);
 if (lowStockItems.length > 0) {
 if (lowStockItems.length === 1) {
 const item = lowStockItems[0];
 const normalStock = item.normal_stock || (item.safety_stock * 2);
 const deficit = Math.max(1, normalStock - item.current_stock);
 alertHtml += `
 <div class="alert-banner alert-danger">
 <span> <strong>【要発注アラート】</strong> 『<strong>${escapeHtml(item.name)}</strong>』の在庫が不足しています（現在庫: <strong>${item.current_stock}${item.unit}</strong> / 安全基準: ${item.safety_stock}${item.unit} / 平常時定数: <strong>${normalStock}${item.unit}</strong> → 不足: <strong>+${deficit}${item.unit}</strong>）</span>
 <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
 <button class="btn btn-primary" style="padding:3px 10px; font-size:12px; background:#2563eb; color:#fff;" onclick="openOrderModalWithItem(${item.id})"> 『${escapeHtml(item.name)}』の発注を申請 (推奨+${deficit}${item.unit})</button>
 <button class="btn btn-secondary" style="padding:2px 8px; font-size:11px;" onclick="dismissAlert('stock_${item.id}_${item.current_stock}')"> 閉じる</button>
 </div>
 </div>
 `;
 } else {
 const itemListHtml = lowStockItems.map(item => {
 const normalStock = item.normal_stock || (item.safety_stock * 2);
 const deficit = Math.max(1, normalStock - item.current_stock);
 return `
 <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.85); padding:4px 8px; border-radius:4px; margin-top:4px; border:1px solid #fca5a5;">
 <span style="color:#991b1b;">・<strong>${escapeHtml(item.name)}</strong> (残: <strong>${item.current_stock}${item.unit}</strong> / 基準: ${item.safety_stock}${item.unit} / 平常定数: ${normalStock}${item.unit} → 不足: <strong>+${deficit}${item.unit}</strong>)</span>
 <div style="display:flex; gap:4px;">
 <button class="btn btn-primary" style="padding:2px 8px; font-size:11px; background:#2563eb; color:#fff;" onclick="openOrderModalWithItem(${item.id})"> 発注申請 (+${deficit})</button>
 </div>
 </div>
 `;
 }).join("");

 alertHtml += `
 <div class="alert-banner alert-danger">
 <div style="width:100%;">
 <span> <strong>【要発注アラート】</strong> 以下の消耗品が安全基準を下回っています（平常時定数まで発注申請を行ってください）：</span>
 <div style="margin-top:6px; display:flex; flex-direction:column; gap:4px;">
 ${itemListHtml}
 </div>
 </div>
 <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center; margin-top:8px;">
 <button class="btn btn-secondary" style="padding:2px 8px; font-size:11px;" onclick="dismissLowStockAll()"> 全て閉じる</button>
 </div>
 </div>
 `;
 }
 }


 // 4. 受診2週前・1週前事前告知 ＆ 往診特殊指示アラート (絶食・薬のみ等)
 gState.residents.forEach(r => {
 if (r.next_clinic_date) {
 const clinicDate = new Date(r.next_clinic_date);
 const diffDays = Math.ceil((clinicDate - today) / (1000 * 60 * 60 * 24));
 const specialNoteBadge = r.clinic_special_notes ? `<span style="background:#dc2626; color:#ffffff; padding:2px 8px; border-radius:4px; font-weight:bold; margin-left:8px;"> 特殊指示: ${escapeHtml(r.clinic_special_notes)}</span>` : "";
 
 if (diffDays === 0 || r.next_clinic_date === todayStr) {
 // 当日往診
 const todayClinicKey = `clinic_today_${r.id}_${r.next_clinic_date}`;
 if (!isAlertDismissed(todayClinicKey)) {
 alertHtml += `
 <div class="alert-banner alert-danger" style="background:#fef2f2; border-left:5px solid #ef4444; color:#991b1b;">
 <span><strong>【本日受診・往診日】</strong> ${r.room_no}号室 ${r.name} 様 本日受診/往診です！${specialNoteBadge} 指示内容: ${escapeHtml(r.dr_instructions || '定期診察')}</span>
 <div style="display:flex; gap:6px; align-items:center;">
 <button class="btn btn-secondary" style="padding:2px 8px; font-size:12px; background:#fee2e2; color:#991b1b; border-color:#fca5a5;" onclick="openClinicInstructionModal(${r.id})">指示確認・変更</button>
 <button class="btn btn-secondary" style="padding:2px 8px; font-size:11px;" onclick="dismissAlert('${todayClinicKey}')"> 受診対応完了</button>
 </div>
 </div>
 `;
 }
 } else if (diffDays > 0 && diffDays <= 14) {
 const upcomingKey = `clinic_upcoming_${r.id}_${r.next_clinic_date}_${diffDays <= 7 ? "w1" : "w2"}`;
 if (!isAlertDismissed(upcomingKey)) {
 const alertType = diffDays <= 7 ? "alert-danger" : "alert-warning";
 const tag = diffDays <= 7 ? "【1週間前】" : "【2週間前】";
 alertHtml += `
 <div class="alert-banner ${alertType}">
 <span> ${tag} ${r.name}様 次回受診・往診日: ${r.next_clinic_date} (あと${diffDays}日) - 残薬確認・指示受け準備 ${specialNoteBadge}</span>
 <button class="btn btn-secondary" style="padding:2px 8px; font-size:11px;" onclick="dismissAlert('${upcomingKey}')"> 確認済・閉じる</button>
 </div>
 `;
 }
 }
 }
 });

 // 5. 【排便3日以上なしアラート (便秘コントロール)】
 const excretions = db.data.excretions || [];
 gState.residents.forEach(r => {
 if (r.status !== "在所") return;
 const resExcs = excretions.filter(e => e.resident_id === r.id && e.stool_amount && e.stool_amount !== "なし");
 resExcs.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
 // [Claude修正] 利用者ごと・最終排便日ごとのキー。対応完了は その利用者の今回分 だけを閉じる
 const stoolKey = `stool_${r.id}_${resExcs.length > 0 ? resExcs[0].date : "none"}`;
 if (isAlertDismissed(stoolKey)) return;

 let daysNoStool = 0;
 if (resExcs.length > 0) {
 const latestDateStr = resExcs[0].date;
 const latestDate = new Date(latestDateStr);
 const curDate = new Date(todayStr);
 daysNoStool = Math.floor((curDate - latestDate) / (1000 * 60 * 60 * 24));
 } else {
 daysNoStool = 3;
 }

 if (daysNoStool >= 3) {
 alertHtml += `
 <div class="alert-banner alert-danger" style="background:#fff1f2; border-left:5px solid #e11d48; color:#9f1239;">
 <span>  <strong>【排便アラート】</strong> ${r.room_no}号室 <strong>${r.name} 様</strong>：便が3日以上出ていません（現在 <strong>${daysNoStool}日目</strong>）！水分補給・腹部マッサージ・下剤服用の確認を行ってください。</span>
 <div style="display:flex; gap:6px; align-items:center;">
 <button class="btn btn-secondary" style="padding:2px 8px; font-size:12px; background:#ffe4e6; color:#9f1239; border-color:#f43f5e;" onclick="switchCareTab('excretion')">排泄表を開く</button>
 <button class="btn btn-secondary" style="padding:2px 8px; font-size:11px; background:#fff; color:#9f1239;" onclick="dismissAlert('${stoolKey}')"> 処置・対応完了</button>
 </div>
 </div>
 `;
 }
 });

 // 6. 【月間業務連絡 未確認アラート】
 const currentStaff = (document.getElementById("currentStaff") ? document.getElementById("currentStaff").value : "") || "";
 const curMonth = todayStr.slice(0, 7);
 const monthlyNotices = (db.data.monthly_notices || []).filter(n => n.month === curMonth);
 if (currentStaff && monthlyNotices.length > 0) {
 const unconfirmed = monthlyNotices.filter(n => !(n.confirmed_staff || []).includes(currentStaff));
 if (unconfirmed.length > 0 && !isAlertDismissed('monthly_notices_' + currentStaff)) {
 alertHtml += `
 <div class="alert-banner alert-warning" style="background:#f5f3ff; border-left:5px solid #8b5cf6; color:#5b21b6;">
 <span>  <strong>【業務連絡 未確認】</strong> ${escapeHtml(currentStaff)} さん、${curMonth.split("-")[1]}月分の月間業務連絡に未確認が <strong>${unconfirmed.length}件</strong> あります！内容を確認し「確認済」を押してください。</span>
 <div style="display:flex; gap:6px; align-items:center;">
 <button class="btn btn-secondary" style="padding:2px 8px; font-size:12px; background:#ede9fe; color:#5b21b6; border-color:#8b5cf6;" onclick="switchCareTab('notebook')">連絡表を開く</button>
 <button class="btn btn-secondary" style="padding:2px 8px; font-size:11px; background:#fff; color:#5b21b6;" onclick="confirmAllMonthlyNoticesForStaff()"> 一括確認済にする</button>
 </div>
 </div>
 `;
 }
 }

 // 7. 要介護認定有効期限 (満了60日以内)
 {
 const expiringResidents = [];
 gState.residents.forEach(r => {
 if (r.care_expiry_date) {
 const expiryDate = new Date(r.care_expiry_date);
 const diffDays = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
 if (diffDays > 0 && diffDays <= 60) {
 const expKey = `care_expiry_${r.id}_${r.care_expiry_date}`;
 if (!isAlertDismissed(expKey)) {
 expiringResidents.push({ id: r.id, name: r.name, level: r.care_level, date: r.care_expiry_date, days: diffDays, key: expKey });
 }
 }
 }
 });
 gState.lastCareExpiryAlertKeys = expiringResidents.map(e => e.key);
 if (expiringResidents.length > 0) {
 const list = expiringResidents.map(e => `${e.name}様 (${e.level}, 期限:${e.date}, あと${e.days}日)`).join(" / ");
 alertHtml += `
 <div class="alert-banner alert-warning">
 <span> 【要介護認定更新アラート】更新申請の手続きが必要です：${list}</span>
 <button class="btn btn-secondary" style="padding:2px 8px; font-size:11px;" onclick="dismissCareExpiryAll()"> 申請手配済・閉じる</button>
 </div>
 `;
 }
 }

 if (container.innerHTML !== alertHtml) {
 container.innerHTML = alertHtml;
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
 syncGlobalDatePicker(dt);
 if (typeof renderTodayShiftBar === "function") renderTodayShiftBar(dt);
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

// 共通日付バーの同期・操作 (全タブ連動)
function syncGlobalDatePicker(dt) {
 const picker = document.getElementById("globalCareDatePicker");
 if (picker && picker.value !== dt) picker.value = dt;

 const label = document.getElementById("globalDateDisplayLabel");
 const countBadge = document.getElementById("globalDateRecordCountBadge");
 if (!label || !dt) return;

 const days = ["日", "月", "火", "水", "木", "金", "土"];
 const dObj = new Date(dt + "T00:00:00");
 const dayName = !isNaN(dObj.getDay()) ? days[dObj.getDay()] : "";
 const isToday = (dt === new Date().toISOString().split("T")[0]);
 label.textContent = `${dt} (${dayName})` + (isToday ? " [本日]" : "");

 // 当日の記録件数を集計してバッジ表示
 let recCount = 0;
 (db.data.care_records || []).forEach(r => {
   const d = (r.recorded_at || r.record_time || "").slice(0, 10);
   if (d === dt) recCount++;
 });
 (db.data.vitals || []).forEach(r => { if (r.date === dt) recCount++; });
 (db.data.meals || []).forEach(r => { if (r.date === dt) recCount++; });
 (db.data.excretions || []).forEach(r => { if (r.date === dt) recCount++; });

 if (countBadge) {
   countBadge.textContent = `記録: 計 ${recCount} 件`;
 }
}

function onGlobalDateChange(newDate) {
 if (!newDate) return;
 gState.selectedDate = newDate;
 gState.currentMonth = newDate.slice(0, 7);
 loadDateRecords(newDate);
}

function changeDateByDays(offset) {
 const cur = gState.selectedDate || new Date().toISOString().split("T")[0];
 const d = new Date(cur + "T00:00:00");
 d.setDate(d.getDate() + offset);
 const y = d.getFullYear();
 const m = String(d.getMonth() + 1).padStart(2, "0");
 const day = String(d.getDate()).padStart(2, "0");
 const newDt = `${y}-${m}-${day}`;
 onGlobalDateChange(newDt);
}

function setTodayDate() {
 const today = new Date().toISOString().split("T")[0];
 onGlobalDateChange(today);
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

// 利用者カルテ (フェイスシート・病歴ガイド・看取りスタンプ・見守り注意・私物行追加・備品・写真保管)
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
 <span class="disease-tag" style="cursor:pointer;" onclick="event.preventDefault(); event.stopPropagation(); openDiseaseGuide(this.getAttribute('data-disease')); return false;" data-disease="${escapeHtml(d)}">${escapeHtml(d)}</span>
 `).join("");

 // 私物行リスト
 const belongings = (db.data.belongings || []).filter(b => b.resident_id === r.id);
 let belongingsHtml = belongings.map(b => `
 <tr style="font-size:12px;">
 <td>${escapeHtml(b.category || '-')}</td>
 <td><strong>${escapeHtml(b.item_name || '-')}</strong></td>
 <td>
 <div style="display:inline-flex; align-items:center; gap:4px;">
 <button type="button" class="btn btn-secondary" style="padding:1px 6px; font-size:11px; line-height:1.1;" title="数量を1つ減らす（劣化・破棄時）" onclick="adjustBelongingQty(${b.id}, -1)">−</button>
 <span style="color:#0284c7; font-weight:bold; min-width:32px; text-align:center;">${escapeHtml(b.quantity || '1')}</span>
 <button type="button" class="btn btn-secondary" style="padding:1px 6px; font-size:11px; line-height:1.1;" title="数量を1つ増やす（追加持参時）" onclick="adjustBelongingQty(${b.id}, 1)">＋</button>
 </div>
 </td>
 <td>${b.marked ? ' 記名済' : '<span style="color:#dc2626;">未確認</span>'}</td>
 <td style="color:#64748b;">${escapeHtml(b.notes || '-')}</td>
 <td style="white-space:nowrap;">
 <button type="button" class="btn btn-secondary" style="padding:2px 6px; font-size:11px;" onclick="openBelongingModal(${b.id})"> 編集</button>
 <button type="button" class="btn btn-secondary" style="padding:2px 6px; font-size:11px; color:#dc2626;" onclick="deleteBelonging(${b.id})"> 削除</button>
 </td>
 </tr>
 `).join("");

 // 備品リスト
 const equipments = (db.data.equipments || []).filter(eq => eq.resident_id === r.id);
 let equipmentsHtml = equipments.map(eq => `
 <span class="badge" style="background:#e0f2fe; color:#0369a1; padding:4px 8px; font-size:12px; margin-right:6px; margin-bottom:4px; display:inline-flex; align-items:center; gap:6px;">
 <span>${escapeHtml(eq.equipment_name)} (${escapeHtml(eq.ownership_type || '施設備品')})</span>
 <button type="button" style="border:none; background:none; color:#0369a1; cursor:pointer; font-size:13px; font-weight:bold; padding:0 2px;" title="使用解除・返却" onclick="deleteEquipment(${eq.id})"></button>
 </span>
 `).join("");

 // 写真・重要書類件数
 const resDocs = (db.data.photos || []).filter(p => p.resident_id === r.id && p.category === 'documents');
 const resPhotos = (db.data.photos || []).filter(p => p.resident_id === r.id && p.category === 'personal');

 // 点眼処方指示
 const resEyedrops = (db.data.eyedrop_orders || []).filter(e => e.resident_id === r.id && e.status !== '終了');
 let eyedropSummaryHtml = '';
 if (resEyedrops.length === 0 || resEyedrops.every(e => e.eye === '指示なし')) {
 eyedropSummaryHtml = '<span style="color:#64748b; font-size:12px;">定期点眼指示なし</span>';
 } else {
 eyedropSummaryHtml = resEyedrops.map(e => {
 const bColor = e.eye === '右のみ' ? '#1e3a8a' : (e.eye === '左のみ' ? '#065f46' : '#334155');
 const bText = `[${escapeHtml(e.eye)}]`;
 const tStr = (e.timing_slots || []).join('・');
 return `<div style="display:inline-flex; align-items:center; gap:4px; margin-right:8px; margin-top:2px;">
 <span class="badge" style="background:${bColor}; color:#ffffff; font-weight:bold; font-size:11px; padding:2px 6px;">${bText}</span>
 <strong>${escapeHtml(e.medicine_name)}</strong>
 <span style="color:#2563eb; font-size:11.5px;">(${escapeHtml(tStr)} ${escapeHtml(e.dosage || '1回1滴')})</span>
 </div>`;
 }).join('');
 }

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
 <button type="button" class="btn btn-secondary" style="font-size:12px; padding:3px 8px;" onclick="openEditResidentModal(${r.id})"> 編集</button>
 </div>
 </div>
 </div>

 <!-- 介護サマリー ＆ 緊急搬送・受診申し送りサマリー アクションバー -->
 <div style="background:linear-gradient(135deg, #f0fdf4 0%, #eff6ff 100%); border:1px solid #bfdbfe; border-radius:8px; padding:10px 14px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
 <div>
 <div style="font-weight:bold; color:#1e40af; font-size:13.5px; display:flex; align-items:center; gap:6px;">
 <span>介護サマリー ＆ 緊急搬送・受診申し送り</span>
 <span class="badge" style="background:#2563eb; color:#ffffff; font-size:11px; padding:1px 6px;">生活・ADL・救急連携</span>
 </div>
 <div style="font-size:12px; color:#475569; margin-top:3px;">
 ${getResidentSummaryStatusText(r.id)}
 </div>
 </div>
 <div style="display:flex; gap:6px; flex-wrap:wrap;">
 <button type="button" class="btn btn-secondary" style="font-size:12px; padding:5px 12px; background:#ffffff; color:#1d4ed8; border:1px solid #93c5fd; font-weight:bold;" onclick="event.preventDefault(); event.stopPropagation(); openCareSummaryModal(${r.id}); return false;">
 介護サマリー (詳細・新規・変更)
 </button>
 <button type="button" class="btn btn-danger" style="font-size:12px; padding:5px 12px; background:#dc2626; border-color:#dc2626; font-weight:bold;" onclick="event.preventDefault(); event.stopPropagation(); openEmergencySummaryModal(${r.id}); return false;">
 緊急搬送・受診サマリー
 </button>
 <button type="button" class="btn btn-dark" style="font-size:12px; padding:5px 12px; background:#0f172a; border-color:#0f172a; color:#ffffff; font-weight:bold;" onclick="event.preventDefault(); event.stopPropagation(); openBodySchemaModal(${r.id}); return false;">
 皮膚・身体シェーマ図 (軟膏・処置)
 </button>
 </div>
 </div>

 <!-- 1. 基本方針・見守り注意・ケアプラン目標 (アコーディオン) -->
 <details class="care-accordion" open style="margin-bottom:10px; border:1px solid #e2e8f0; border-radius:8px; background:#fff; overflow:hidden;">
 <summary style="padding:10px 14px; background:#f8fafc; font-weight:bold; cursor:pointer; font-size:13px; color:#1e3a8a; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
 <span> 基本方針 ＆ ケアプラン目標・見守り注意</span>
 <div style="display:flex; align-items:center; gap:8px;">
 <button type="button" class="btn btn-secondary" style="padding:2px 8px; font-size:11px;" onclick="event.preventDefault(); event.stopPropagation(); openCarePlanModal(${r.id}); return false;"> 変更</button>
 <span style="font-size:11px; color:#64748b;">(開閉)</span>
 </div>
 </summary>
 <div style="padding:12px;">
 ${r.sensor_alert ? `
 <div style="background:#fee2e2; border-left:4px solid #ef4444; padding:8px 12px; border-radius:6px; margin-bottom:10px; font-weight:bold; color:#991b1b; font-size:13px; display:flex; justify-content:space-between; align-items:center;">
 <span>${escapeHtml(r.sensor_alert)}</span>
 <button type="button" class="btn btn-secondary" style="padding:2px 6px; font-size:10px; color:#dc2626;" onclick="event.preventDefault(); event.stopPropagation(); openCarePlanModal(${r.id}, 'sensor'); return false;">変更</button>
 </div>
 ` : ''}
 <div style="background:#f0fdf4; border-left:4px solid #16a34a; padding:10px; border-radius:6px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:flex-start;">
 <div>
 <div style="font-size:12px; font-weight:bold; color:#15803d;"> ケアプラン目標・注意事項:</div>
 <div style="font-size:13px; margin-top:2px;">${escapeHtml(r.care_plan_goal || "安全な日常生活の維持・転倒予防")}</div>
 </div>
 <button type="button" class="btn btn-secondary" style="padding:2px 6px; font-size:10px;" onclick="event.preventDefault(); event.stopPropagation(); openCarePlanModal(${r.id}); return false;">変更</button>
 </div>
 ${(r.bp_high_max || r.temp_max || r.spo2_min) ? `
 <div style="background:#fffbeb; border:1px solid #fef3c7; border-radius:6px; padding:8px 10px; font-size:12px; color:#92400e; display:flex; justify-content:space-between; align-items:center;">
 <div>
 <strong> 設定済バイタル注意基準:</strong>
 ${r.bp_high_max ? `最高血圧: ${r.bp_high_min || 90}〜${r.bp_high_max}mmHg ` : ''}
 ${r.temp_max ? `体温上限: ${r.temp_max}℃ ` : ''}
 ${r.spo2_min ? `SpO2下限: ${r.spo2_min}% ` : ''}
 </div>
 <button type="button" class="btn btn-secondary" style="padding:2px 6px; font-size:10px;" onclick="event.preventDefault(); event.stopPropagation(); openCarePlanModal(${r.id}); return false;">基準値変更</button>
 </div>
 ` : ''}
 </div>
 </details>

 <!-- 2. 身体状況・病歴・食形態・口腔状態 (アコーディオン) -->
 <details class="care-accordion" open style="margin-bottom:10px; border:1px solid #e2e8f0; border-radius:8px; background:#fff; overflow:hidden;">
 <summary style="padding:10px 14px; background:#f8fafc; font-weight:bold; cursor:pointer; font-size:13px; color:#1e3a8a; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
 <span>身体状況・病歴 ＆ 食形態・口腔状態</span>
 <div style="display:flex; align-items:center; gap:8px;">
 <button type="button" class="btn btn-secondary" style="padding:2px 8px; font-size:11px;" onclick="event.preventDefault(); event.stopPropagation(); openBodyConditionModal(${r.id}, 'all'); return false;"> 変更</button>
 <span style="font-size:11px; color:#64748b;">(開閉)</span>
 </div>
 </summary>
 <div style="padding:12px;">
 <div style="margin-bottom:10px;">
 <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
 <div style="font-size:12px; font-weight:bold; color:var(--text-muted);">病歴・既往歴 (タップで現場対応ガイド表示):</div>
 <button type="button" class="btn btn-secondary" style="padding:2px 8px; font-size:11px; color:#1e40af; border-color:#93c5fd; background:#eff6ff;" onclick="event.preventDefault(); event.stopPropagation(); openBodyConditionModal(${r.id}, 'diseases'); return false;">病歴を変更</button>
 </div>
 <div>${diseaseTags || '<span style="font-size:13px; color:var(--text-muted);">特記事項なし</span>'}</div>
 </div>
 
 <!-- 身体状況・食形態情報カード -->
 <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px;">
 <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:13px; margin-bottom:10px;">
 <div><strong>身体・麻痺:</strong> ${escapeHtml(r.paralysis || "特記なし")}</div>
 <div><strong>アレルギー:</strong> <span style="color:#dc2626; font-weight:bold;">${escapeHtml(r.allergies || "なし")}</span></div>
 <div><strong>食形態:</strong> ${escapeHtml(r.diet_type || "普通食")}</div>
 <div><strong>口腔状態:</strong> ${escapeHtml(r.oral_state || "残歯のみ")}</div>
 </div>
 <div style="background:#ffffff; border:1px solid #cbd5e1; border-radius:6px; padding:8px 10px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
 <div style="font-size:12px; color:#1e293b; flex:1; min-width:200px;">
 <strong>皮膚処置・軟膏ピン:</strong> ${renderSchemaSummaryBadges(r.id)}
 </div>
 <button type="button" class="btn btn-secondary" style="padding:2px 8px; font-size:11px; background:#f1f5f9; color:#0f172a; border-color:#cbd5e1; font-weight:bold; white-space:nowrap;" onclick="event.preventDefault(); event.stopPropagation(); openBodySchemaModal(${r.id}); return false;">
 シェーマ図を開く
 </button>
 </div>
 <div style="background:#ffffff; border:1px solid #cbd5e1; border-radius:6px; padding:8px 10px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
 <div style="font-size:12px; color:#1e293b; flex:1; min-width:200px;">
 <strong>点眼処方指示:</strong> ${eyedropSummaryHtml}
 </div>
 <button type="button" class="btn btn-secondary" style="padding:2px 8px; font-size:11px; background:#eff6ff; color:#1e40af; border-color:#93c5fd; font-weight:bold; white-space:nowrap;" onclick="event.preventDefault(); event.stopPropagation(); openEyedropOrderModal(${r.id}); return false;">
 点眼指示を変更
 </button>
 </div>
 <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px dashed #cbd5e1; padding-top:8px;">
 <span style="font-size:11.5px; color:#64748b;">※身体状況（麻痺）・食形態・口腔状態・アレルギーを変更できます</span>
 <button type="button" class="btn btn-secondary" style="padding:4px 12px; font-size:12px; background:#eff6ff; color:#1d4ed8; border:1px solid #93c5fd; font-weight:bold; display:inline-flex; align-items:center; gap:4px;" onclick="event.preventDefault(); event.stopPropagation(); openBodyConditionModal(${r.id}, 'all'); return false;">
  身体状況・食形態を変更
 </button>
 </div>
 </div>
 </div>
 </details>

 <!-- 3. 往診医・受診時指示 ＆ 特殊指示 (アコーディオン) -->
 <details class="care-accordion" open style="margin-bottom:10px; border:1px solid #e2e8f0; border-radius:8px; background:#fff; overflow:hidden;">
 <summary style="padding:10px 14px; background:#eff6ff; font-weight:bold; cursor:pointer; font-size:13px; color:#1e40af; border-bottom:1px solid #bfdbfe; display:flex; justify-content:space-between; align-items:center;">
 <span> 往診医・受診時指示 ＆ 特殊指示 (絶食・薬のみ等)</span>
 <div style="display:flex; align-items:center; gap:8px;">
 <button type="button" class="btn btn-secondary" style="padding:2px 8px; font-size:11px; background:#dbeafe; color:#1e40af; border-color:#93c5fd;" onclick="event.preventDefault(); event.stopPropagation(); openClinicInstructionModal(${r.id}, 'all'); return false;">受診指示を変更</button>
 <span style="font-size:11px; color:#64748b;">(開閉)</span>
 </div>
 </summary>
 <div style="padding:12px;">
 <!-- 特殊指示ブロック -->
 <div style="margin-bottom:10px; display:flex; justify-content:space-between; align-items:center; background:#fef2f2; border:1px solid #fecaca; border-left:4px solid #ef4444; border-radius:6px; padding:8px 12px;">
 <div style="color:#991b1b; font-weight:bold; font-size:13px;">
  【往診・受診 特殊指示】: ${escapeHtml(r.clinic_special_notes || '特段の指示なし (通常対応)')}
 </div>
 <button type="button" class="btn btn-secondary" style="padding:2px 8px; font-size:11px; color:#dc2626; border-color:#fca5a5; white-space:nowrap; margin-left:8px;" onclick="event.preventDefault(); event.stopPropagation(); openClinicInstructionModal(${r.id}, 'special'); return false;">特殊指示を変更</button>
 </div>

 <!-- 医師の指示内容 (受診時コメント) -->
 <div style="font-size:13px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:flex-start; background:#f8fafc; padding:8px 10px; border-radius:6px;">
 <div>
 <strong>医師の指示内容 (受診時コメント):</strong>
 <div style="margin-top:2px; color:#1e293b; white-space:pre-wrap;">${escapeHtml(r.dr_instructions || '定期採血・血圧コントロール')}</div>
 </div>
 <button type="button" class="btn btn-secondary" style="padding:2px 8px; font-size:11px; white-space:nowrap; margin-left:8px;" onclick="event.preventDefault(); event.stopPropagation(); openClinicInstructionModal(${r.id}, 'instructions'); return false;">指示内容を変更</button>
 </div>

 <!-- 次回予定日 -->
 <div style="font-size:13px; display:flex; justify-content:space-between; align-items:center; background:#f0f9ff; padding:8px 10px; border-radius:6px;">
 <div>
 <strong style="color:#0369a1;"> 次回受診・往診予定日:</strong>
 <span style="font-weight:bold; margin-left:6px; color:#0284c7;">${r.next_clinic_date || '未定'}</span>
 </div>
 <button type="button" class="btn btn-secondary" style="padding:2px 8px; font-size:11px; white-space:nowrap; margin-left:8px;" onclick="event.preventDefault(); event.stopPropagation(); openClinicInstructionModal(${r.id}, 'date'); return false;">予定日を変更</button>
 </div>
 </div>
 </details>

 <!-- 4. 福祉用具 ＆ 私物持ち込み品台帳 (アコーディオン) -->
 <details class="care-accordion" style="margin-bottom:10px; border:1px solid #e2e8f0; border-radius:8px; background:#fff; overflow:hidden;">
 <summary style="padding:10px 14px; background:#f8fafc; font-weight:bold; cursor:pointer; font-size:13px; color:#1e3a8a; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
 <span> 福祉用具 ＆ 私物・持ち込み品台帳 (${belongings.length}点)</span>
 <div style="display:flex; align-items:center; gap:8px;">
 <button class="btn btn-secondary" style="padding:2px 8px; font-size:11px;" onclick="event.stopPropagation(); openBelongingModal()">＋私物を追加</button>
 <span style="font-size:11px; color:#64748b;">(開閉)</span>
 </div>
 </summary>
 <div style="padding:12px;">
 <div style="margin-bottom:12px; font-size:13px; background:#f0fdf4; border:1px solid #bbf7d0; padding:8px 10px; border-radius:6px;">
 <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
 <strong style="color:#166534;"> 使用福祉用具・備品 (${equipments.length}点):</strong>
 <button class="btn btn-secondary" style="padding:2px 8px; font-size:11px; background:#dcfce7; color:#166534; border-color:#86efac;" onclick="openEquipmentModal()">＋福祉用具・備品を追加</button>
 </div>
 <div style="margin-top:4px;">${equipmentsHtml || '<span style="color:var(--text-muted); font-size:12px;">登録なし</span>'}</div>
 </div>
 <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
 <strong style="font-size:13px;">私物・持ち込み品一覧 (衣類・日用品・家具等):</strong>
 <button class="btn btn-secondary" style="padding:2px 8px; font-size:11px;" onclick="openBelongingModal()">＋私物行を追加</button>
 </div>
 <table class="data-table" style="font-size:12px; margin-top:4px;">
 <thead>
 <tr><th>区分</th><th>品名(物)</th><th>個数</th><th>記名</th><th>備考・劣化状態</th><th style="width:110px;">操作</th></tr>
 </thead>
 <tbody>
 ${belongingsHtml || '<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">登録なし</td></tr>'}
 </tbody>
 </table>
 </div>
 </details>

 <!-- 5. 同意書 ＆ 写真保管庫 (アコーディオン) -->
 <details class="care-accordion" style="margin-bottom:10px; border:1px solid #e2e8f0; border-radius:8px; background:#fff; overflow:hidden;">
 <summary style="padding:10px 14px; background:#f8fafc; font-weight:bold; cursor:pointer; font-size:13px; color:#1e3a8a; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
 <span> 重要書類(同意書) ＆ 写真保管庫 (${resDocs.length + resPhotos.length}件)</span>
 <span style="font-size:11px; color:#64748b;">(タップで開閉)</span>
 </summary>
 <div style="padding:12px;">
 <div style="display:flex; gap:8px; flex-wrap:wrap;">
 <button class="btn btn-secondary" style="font-size:12px; padding:6px 12px; display:inline-flex; align-items:center; gap:6px;" onclick="openPhotoModal('documents')">
 重要書類(同意書)
 <span style="background:#2563eb; color:white; border-radius:10px; padding:1px 7px; font-size:11px; font-weight:bold;">${resDocs.length}件</span>
 </button>
 <button class="btn btn-secondary" style="font-size:12px; padding:6px 12px; display:inline-flex; align-items:center; gap:6px;" onclick="openPhotoModal('personal')">
 個人写真
 <span style="background:#10b981; color:white; border-radius:10px; padding:1px 7px; font-size:11px; font-weight:bold;">${resPhotos.length}件</span>
 </button>
 </div>
 </div>
 </details>

 <!-- 6. 緊急連絡先 ＆ 家族の要望・生活歴・こだわり (アコーディオン) -->
 <details class="care-accordion" open style="margin-bottom:10px; border:1px solid #e2e8f0; border-radius:8px; background:#fff; overflow:hidden;">
 <summary style="padding:10px 14px; background:#f8fafc; font-weight:bold; cursor:pointer; font-size:13px; color:#1e3a8a; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
 <span> 緊急連絡先 ＆ 家族の要望・生活歴・こだわり</span>
 <div style="display:flex; align-items:center; gap:8px;">
 <button class="btn btn-secondary" style="padding:2px 8px; font-size:11px;" onclick="event.stopPropagation(); openFamilyHistoryModal(${r.id})"> 変更・更新</button>
 <span style="font-size:11px; color:#64748b;">(開閉)</span>
 </div>
 </summary>
 <div style="padding:12px; font-size:13px;">
 <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
 <div style="flex:1;">
 <div><strong> 緊急連絡先 & 搬送・延命処置方針:</strong> <span style="font-weight:bold; color:#0f172a;">${escapeHtml(r.emergency_contact || "未登録")}</span></div>
 <div style="margin-top:6px;"><strong> 家族の要望 (ACP・看取り・面会・ケア希望):</strong> <span style="color:#334155;">${escapeHtml(r.family_wishes || "特になし")}</span></div>
 </div>
 <button class="btn btn-secondary" style="padding:3px 10px; font-size:11px; background:#f1f5f9; white-space:nowrap; margin-left:8px;" onclick="openFamilyHistoryModal(${r.id})"> 項目を編集</button>
 </div>
 <div style="background:#fffbeb; border:1px solid #fef3c7; padding:8px 10px; border-radius:6px; font-size:12px;">
 <strong> 生活歴・人生歴・こだわり (職歴・趣味・習慣・性格):</strong>
 <p style="margin-top:3px; color:#78350f; margin-bottom:0;">${escapeHtml(r.life_history || "穏やかな生活を好まれる。")}</p>
 </div>
 </details>

 <!-- 7. 介護サマリー (生活・ADL・介助注意点 13項目一覧) -->
 <details class="care-accordion" open style="margin-bottom:10px; border:1px solid #e2e8f0; border-radius:8px; background:#fff; overflow:hidden;">
 <summary style="padding:10px 14px; background:#f0fdf4; font-weight:bold; cursor:pointer; font-size:13px; color:#166534; border-bottom:1px solid #bbf7d0; display:flex; justify-content:space-between; align-items:center;">
 <span> 介護サマリー要約 (生活・ADL・介助注意点 13項目)</span>
 <div style="display:flex; align-items:center; gap:8px;">
 <button type="button" class="btn btn-secondary" style="padding:2px 8px; font-size:11px; background:#dcfce7; color:#166534; border-color:#86efac;" onclick="event.preventDefault(); event.stopPropagation(); openCareSummaryModal(${r.id}); return false;">サマリー編集・新規</button>
 <span style="font-size:11px; color:#64748b;">(開閉)</span>
 </div>
 </summary>
 <div style="padding:12px; font-size:12.5px;">
 ${renderResidentSummaryAccordionContent(r.id)}
 </div>
 </details>

 `;
}

// ======================================================================
// 現場介護向け 医療・症状・病名専門用語 アノテーション ＆ やさしい解説表示
// ======================================================================
function annotateMedicalTerms(text) {
 if (!text || typeof text !== "string") return "";
 const escaped = escapeHtml(text);
 
 // 長い用語から順にマッチさせて部分一致破壊（例: 大腿骨頸部骨折 vs 骨折）を確実に防止
 const termKeys = Object.keys(MEDICAL_TERMS_DICTIONARY).sort((a, b) => b.length - a.length);
 if (termKeys.length === 0) return escaped;

 const escapeRegex = s => s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
 const pattern = new RegExp(termKeys.map(escapeRegex).join("|"), "g");

 return escaped.replace(pattern, (match) => {
 return `<span class="term-link" onclick="openTermExplanation('${match}')" title="クリックしてやさしい解説・判断基準を表示">${match}</span>`;
 });
}

function openTermExplanation(termKey) {
 const info = MEDICAL_TERMS_DICTIONARY[termKey];
 if (!info) return;

 const card = document.getElementById("termExplainCard");
 if (!card) return;

 const titleEl = document.getElementById("termExplainTitle");
 if (titleEl) titleEl.textContent = info.term;

 const rubyEl = document.getElementById("termExplainRuby");
 if (rubyEl) rubyEl.textContent = info.ruby ? `(${info.ruby})` : "";

 const badgeEl = document.getElementById("termExplainUrgencyBadge");
 if (badgeEl) {
 badgeEl.textContent = info.urgency;
 if (info.urgencyType === "danger") {
 badgeEl.style.background = "#fee2e2";
 badgeEl.style.color = "#991b1b";
 badgeEl.style.border = "1px solid #fca5a5";
 } else if (info.urgencyType === "warning") {
 badgeEl.style.background = "#fef3c7";
 badgeEl.style.color = "#92400e";
 badgeEl.style.border = "1px solid #fcd34d";
 } else {
 badgeEl.style.background = "#e0f2fe";
 badgeEl.style.color = "#0369a1";
 badgeEl.style.border = "1px solid #bae6fd";
 }
 }

 const meaningEl = document.getElementById("termExplainMeaning");
 if (meaningEl) meaningEl.textContent = info.meaning;

 const checkpointEl = document.getElementById("termExplainCheckpoint");
 if (checkpointEl) checkpointEl.textContent = info.checkPoint;

 const linkArea = document.getElementById("termDiseaseLinkArea");
 const btnJump = document.getElementById("btnJumpToDiseaseGuide");
 if (linkArea && btnJump) {
 if (info.isDisease) {
 linkArea.style.display = "block";
 btnJump.onclick = () => {
 openDiseaseGuide(info.term);
 };
 btnJump.textContent = `『${info.term}』の現場ケアガイドを開く`;
 } else {
 linkArea.style.display = "none";
 }
 }

 card.style.display = "block";
 try {
 card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
 } catch (e) {}
}

function closeTermExplanation() {
 const card = document.getElementById("termExplainCard");
 if (card) {
 card.style.display = "none";
 }
}

// 病歴ガイド モーダル (現場実践・看護連携マニュアル＆施設独自編集対応)
function openDiseaseGuide(diseaseName) {
 closeTermExplanation();
 const name = (diseaseName || "").trim();
 const res = resolveDiseaseGuide(name);
 const guide = res ? res.guide : {
 emergency: "【即時報告基準】体温37.5℃以上（または平熱+1℃以上）、SpO2 93%未満、収縮期血圧160以上または急低下、激しい痛み・嘔吐・冷汗、意識障害・呼びかけへの反応鈍麻時は、直ちに安静を保ち看護師または医師へ連絡してください。",
 care_points: "【現場介護でしてよい安全な初期対応】①無理に動かさず安楽な姿勢（背上げ・側臥位・クッション除圧）を保持。②衣類・ベルトを緩めて呼吸を楽にする。③室温調整・掛け物での保温またはクーリング。④バイタル（体温・血圧・脈拍・SpO2）を再測定して記録。⑤むせがないか確認し、医師・看護師の指示があるまで不用意な飲食・投薬は行わない。",
 symptoms: "日々のバイタル、顔色・表情・口唇色、呼吸のリズム、食事摂取量・水分の進み具合、歩行時のふらつき、活気・傾眠傾向を観察してください。"
 };
 const matchedName = res ? res.matchedName : name;
 const isCustom = res ? res.isCustom : false;
 const isFallback = res ? res.isFallback : false;

 const titleEl = document.getElementById("diseaseModalTitle");
 if (titleEl) {
 let subInfo = "";
 if (isCustom) {
 subInfo = `<span style="font-size:12px; background:#fef3c7; color:#92400e; padding:2px 8px; border-radius:10px; margin-left:8px; font-weight:normal;"> 施設独自設定</span>`;
 } else if (matchedName && matchedName !== name) {
 subInfo = `<span style="font-size:12px; background:#e0f2fe; color:#0369a1; padding:2px 8px; border-radius:10px; margin-left:8px; font-weight:normal;"> 関連参照: ${escapeHtml(matchedName)}</span>`;
 } else if (isFallback) {
 subInfo = `<span style="font-size:12px; background:#f1f5f9; color:#475569; padding:2px 8px; border-radius:10px; margin-left:8px; font-weight:normal;"> 基本見守り基準</span>`;
 }
 titleEl.innerHTML = `【${escapeHtml(name)}】 現場ケアガイド ＆ 観察ポイント ${subInfo}`;
 }

 const contentEl = document.getElementById("diseaseModalContent");
 if (contentEl) {
 contentEl.innerHTML = `
 <!-- 1. すぐに報告する基準 (最優先) -->
 <div style="background:#fef2f2; border:1px solid #fecaca; border-left:5px solid #dc2626; border-radius:8px; padding:12px; margin-bottom:12px;">
 <h4 style="font-size:13.5px; color:#991b1b; font-weight:bold; margin-bottom:6px; display:flex; align-items:center; gap:6px;">
 <span> すぐに看護師・医師へ報告する基準（危険レベル・具体的症状）:</span>
 </h4>
 <p style="font-size:13px; color:#7f1d1d; margin:0; line-height:1.6;" id="dispGuideEmergency">${annotateMedicalTerms(guide.emergency)}</p>
 </div>

 <!-- 2. 現場介護でしてよい対応・ケア (医療行為外の安全対応) -->
 <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-left:5px solid #16a34a; border-radius:8px; padding:12px; margin-bottom:12px;">
 <h4 style="font-size:13.5px; color:#166534; font-weight:bold; margin-bottom:6px; display:flex; align-items:center; gap:6px;">
 <span> 現場介護でしてよい対応・ケア（医療行為以外の安全な初期対応）:</span>
 </h4>
 <p style="font-size:13px; color:#14532d; margin:0; line-height:1.6;" id="dispGuideCare">${annotateMedicalTerms(guide.care_points)}</p>
 </div>

 <!-- 3. 主な症状・見守りの観察サイン -->
 <div style="background:#f8fafc; border:1px solid #e2e8f0; border-left:5px solid #64748b; border-radius:8px; padding:12px; margin-bottom:12px;">
 <h4 style="font-size:13.5px; color:#0f172a; font-weight:bold; margin-bottom:6px; display:flex; align-items:center; gap:6px;">
 <span> 主な症状 ＆ 日常ケア時の観察サイン:</span>
 </h4>
 <p style="font-size:13px; color:#334155; margin:0; line-height:1.6;" id="dispGuideSymptoms">${annotateMedicalTerms(guide.symptoms)}</p>
 </div>

 <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">
 <div style="display:flex; gap:8px;">
 <button class="btn btn-secondary" style="font-size:11.5px; padding:3px 8px; color:#1e40af; border-color:#bfdbfe; background:#eff6ff;" onclick="toggleCustomDiseaseEdit(true)">
  この病気の現場ケアを編集・追加
 </button>
 ${isCustom ? `
 <button class="btn btn-secondary" style="font-size:11.5px; padding:3px 8px; color:#dc2626; border-color:#fecaca;" onclick="resetCustomDiseaseGuide('${escapeHtml(name)}')">
 標準辞書に戻す
 </button>
 ` : ''}
 </div>
 <span style="font-size:11.5px; color:#64748b;">※主治医指示が最優先されます</span>
 </div>
 `;
 }

 // 静的編集フォーム初期化
 toggleCustomDiseaseEdit(false);
 const nameInp = document.getElementById("editGuideDiseaseName");
 if (nameInp) nameInp.value = name;
 const editTitle = document.getElementById("diseaseCustomEditTitle");
 if (editTitle) editTitle.textContent = ` 【${name}】の施設独自ケアガイドを編集・保存`;
 const symInp = document.getElementById("editGuideSymptoms");
 if (symInp) symInp.value = guide.symptoms;
 const careInp = document.getElementById("editGuideCare");
 if (careInp) careInp.value = guide.care_points;
 const emgInp = document.getElementById("editGuideEmergency");
 if (emgInp) emgInp.value = guide.emergency;

 const btnSearch = document.getElementById("btnSearchDiseaseRecords");
 if (btnSearch) {
 btnSearch.onclick = () => {
 closeModal("diseaseModal");
 const searchInp = document.getElementById("searchInput");
 if (searchInp) {
 searchInp.value = name;
 doSearch();
 }
 };
 }
 document.getElementById("diseaseModal").style.display = "flex";
}

function toggleCustomDiseaseEdit(show) {
 const el = document.getElementById("diseaseCustomEditArea");
 if (el) el.style.display = show ? "block" : "none";
}

function saveCustomDiseaseGuide() {
 const name = (document.getElementById("editGuideDiseaseName")?.value || "").trim();
 if (!name) return;
 const symptoms = (document.getElementById("editGuideSymptoms")?.value || "").trim();
 const care = (document.getElementById("editGuideCare")?.value || "").trim();
 const emergency = (document.getElementById("editGuideEmergency")?.value || "").trim();

 if (!db.data) db.data = {};
 if (!db.data.custom_disease_guides) db.data.custom_disease_guides = {};

 db.data.custom_disease_guides[name] = {
 symptoms: symptoms || "日々のバイタル・顔色を観察。",
 care_points: care || "現場での安全な見守り。",
 emergency: emergency || "異変時は看護師・医師へ連絡。"
 };

 db.save();
 alert(`【${name}】の現場ケアガイドを施設独自データとして保存しました！\n次回から自動で呼び出されます。`);
 openDiseaseGuide(name);
}

function resetCustomDiseaseGuide(diseaseName) {
 if (confirm(`【${diseaseName}】の現場ケアガイドを標準辞書の初期値に戻しますか？`)) {
 if (db.data && db.data.custom_disease_guides && db.data.custom_disease_guides[diseaseName]) {
 delete db.data.custom_disease_guides[diseaseName];
 db.save();
 alert(`【${diseaseName}】の現場ケアガイドを標準辞書の初期値に戻しました。`);
 openDiseaseGuide(diseaseName);
 }
 }
}

// 対象利用者バナーの更新
function updateRecordTargetBanner() {
 const bannerText = document.getElementById("recordTargetResidentText");
 const fsBadge = document.getElementById("fsResidentBadge");
 const res = gState.residents.find(x => x.id === gState.selectedResidentId);
 if (res) {
 const str = ` 対象: 【${escapeHtml(res.room_no)}号室 ${escapeHtml(res.name)} 様】の介護記録を作成中`;
 if (bannerText) bannerText.innerHTML = str;
 if (fsBadge) fsBadge.textContent = `${res.room_no}号室 ${res.name} 様`;
 } else {
 if (bannerText) bannerText.textContent = " 対象利用者: 未選択 (上部一覧から選択してください)";
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

 let badgeText = "";
 let badgeBg = "#64748b";

 if (len === 0) {
 if (badgeEl) badgeEl.style.display = "none";
 if (fsBadgeEl) fsBadgeEl.style.display = "none";
 return;
 } else if (len < 400) {
 badgeText = " B5目安: 約1/3枚";
 badgeBg = "#64748b";
 } else if (len < 700) {
 badgeText = " B5目安: 約半分";
 badgeBg = "#0284c7";
 } else if (len <= 1000) {
 badgeText = " B5用紙1枚適量 (推奨)";
 badgeBg = "#16a34a";
 } else {
 badgeText = " B5用紙1枚超過 (2枚目へ)";
 badgeBg = "#d97706";
 }

 if (badgeEl) {
 badgeEl.textContent = badgeText;
 badgeEl.style.background = badgeBg;
 badgeEl.style.display = "inline-block";
 }
 if (fsBadgeEl) {
 fsBadgeEl.textContent = badgeText;
 fsBadgeEl.style.background = badgeBg;
 fsBadgeEl.style.display = "inline-block";
 }
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

// ======================================================================
// 登録後 介護記録・カルテの個別編集・修正・加筆・削除機能
// ======================================================================
function openEditCareRecordModal(recId) {
 const rec = (db.data.care_records || []).find(r => Number(r.id) === Number(recId));
 if (!rec) {
 alert("対象の介護記録が見つかりません。");
 return;
 }
 const res = gState.residents.find(x => x.id === rec.resident_id);
 const resName = (rec.resident_id === 0) ? "フロア全体・共通" : (res ? `${res.room_no}号室 ${res.name} 様` : "利用者未指定");

 const idEl = document.getElementById("editCrId");
 const nameEl = document.getElementById("editCrResidentName");
 const timeEl = document.getElementById("editCrDateTime");
 const catEl = document.getElementById("editCrCategory");
 const staffEl = document.getElementById("editCrStaff");
 const contentEl = document.getElementById("editCrContent");

 if (idEl) idEl.value = rec.id;
 if (nameEl) nameEl.value = resName;
 if (timeEl) timeEl.value = rec.recorded_at || rec.record_time || "";
 if (catEl) catEl.value = rec.category || "介護記録";
 if (staffEl) staffEl.value = rec.staff_name || "";
 if (contentEl) contentEl.value = rec.content || "";

 openModal("editCareRecordModal");
}

function updateCareRecord() {
 const idEl = document.getElementById("editCrId");
 if (!idEl) return;
 const recId = Number(idEl.value); // [Claude修正] parseInt だと小数を含むIDの記録が見つからず保存できなかった
 const rec = (db.data.care_records || []).find(r => Number(r.id) === recId);
 if (!rec) {
 alert("更新対象の介護記録が見つかりません。");
 return;
 }

 const contentEl = document.getElementById("editCrContent");
 const newContent = contentEl ? contentEl.value.trim() : "";
 if (!newContent) {
 alert("記録内容を入力してください。");
 return;
 }

 const timeEl = document.getElementById("editCrDateTime");
 const catEl = document.getElementById("editCrCategory");
 const staffEl = document.getElementById("editCrStaff");

 if (timeEl && timeEl.value.trim()) {
 rec.recorded_at = timeEl.value.trim();
 }
 if (catEl) rec.category = catEl.value;
 if (staffEl && staffEl.value.trim()) {
 rec.staff_name = staffEl.value.trim();
 }
 rec.content = newContent;

 db.save();
 closeModal("editCareRecordModal");
 renderSelectedDateRecords();
 if (typeof renderDailyJournal === "function") renderDailyJournal();
 alert("介護記録の編集内容を保存しました！");
}

function deleteCareRecord() {
 const idEl = document.getElementById("editCrId");
 if (!idEl) return;
 const recId = Number(idEl.value);
 if (!confirm("この介護記録を削除してもよろしいですか？\n※ 削除した記録は元に戻せません。")) return;

 if (db.data.care_records) {
 db.data.care_records = db.data.care_records.filter(r => Number(r.id) !== recId);
 db.save();
 }
 closeModal("editCareRecordModal");
 renderSelectedDateRecords();
 if (typeof renderDailyJournal === "function") renderDailyJournal();
 alert("介護記録を削除しました。");
}

// ======================================================================
// 夜間巡視・体位変換 自動生成定型文テンプレート管理 (施設独自編集)
// ======================================================================
function getNightTurnTemplates() {
 if (!db.data.night_turn_templates || typeof db.data.night_turn_templates !== "object") {
 db.data.night_turn_templates = Object.assign({}, DEFAULT_NIGHT_TURN_TEMPLATES);
 }
 return db.data.night_turn_templates;
}

function openNightTurnTemplateModal() {
 const tpls = getNightTurnTemplates();
 const sleepEl = document.getElementById("tplNightSleep");
 const leftEl = document.getElementById("tplNightLeft");
 const rightEl = document.getElementById("tplNightRight");
 const supineEl = document.getElementById("tplNightSupine");
 const diaperEl = document.getElementById("tplNightDiaper");

 if (sleepEl) sleepEl.value = tpls["安眠中"] || DEFAULT_NIGHT_TURN_TEMPLATES["安眠中"];
 if (leftEl) leftEl.value = tpls["左側臥位"] || DEFAULT_NIGHT_TURN_TEMPLATES["左側臥位"];
 if (rightEl) rightEl.value = tpls["右側臥位"] || DEFAULT_NIGHT_TURN_TEMPLATES["右側臥位"];
 if (supineEl) supineEl.value = tpls["仰臥位"] || DEFAULT_NIGHT_TURN_TEMPLATES["仰臥位"];
 if (diaperEl) diaperEl.value = tpls["おむつ交換"] || DEFAULT_NIGHT_TURN_TEMPLATES["おむつ交換"];

 openModal("nightTurnTemplateModal");
}

function submitNightTurnTemplates() {
 if (!db.data.night_turn_templates) db.data.night_turn_templates = {};
 const sleepEl = document.getElementById("tplNightSleep");
 const leftEl = document.getElementById("tplNightLeft");
 const rightEl = document.getElementById("tplNightRight");
 const supineEl = document.getElementById("tplNightSupine");
 const diaperEl = document.getElementById("tplNightDiaper");

 db.data.night_turn_templates["安眠中"] = (sleepEl && sleepEl.value.trim()) || DEFAULT_NIGHT_TURN_TEMPLATES["安眠中"];
 db.data.night_turn_templates["左側臥位"] = (leftEl && leftEl.value.trim()) || DEFAULT_NIGHT_TURN_TEMPLATES["左側臥位"];
 db.data.night_turn_templates["右側臥位"] = (rightEl && rightEl.value.trim()) || DEFAULT_NIGHT_TURN_TEMPLATES["右側臥位"];
 db.data.night_turn_templates["仰臥位"] = (supineEl && supineEl.value.trim()) || DEFAULT_NIGHT_TURN_TEMPLATES["仰臥位"];
 db.data.night_turn_templates["おむつ交換"] = (diaperEl && diaperEl.value.trim()) || DEFAULT_NIGHT_TURN_TEMPLATES["おむつ交換"];

 db.save();
 closeModal("nightTurnTemplateModal");
 alert("夜間巡視・体位変換の自動生成定型文を保存しました！\n今後の巡視記録保存時にこの設定文が適用されます。");
}

function resetNightTurnTemplates() {
 if (!confirm("巡視定型文をシステムの初期標準設定に戻しますか？")) return;
 db.data.night_turn_templates = Object.assign({}, DEFAULT_NIGHT_TURN_TEMPLATES);
 db.save();
 openNightTurnTemplateModal();
 alert("定型文を初期標準設定に戻しました。");
}

// ======================================================================
// よく使う定型文テンプレート管理・追加・変更機能
// ======================================================================
const DEFAULT_CARE_TEMPLATES = [
 { category: "巡視", label: "安眠中", phrase: "訪室確認。安眠中。呼吸状態安定。" },
 { category: "巡視", label: "左側臥位", phrase: "確認のため訪室。左側臥位にて入眠中。" },
 { category: "巡視", label: "ナースコール対応", phrase: "ナースコールあり訪室。排泄介助実施。" },
 { category: "食事", label: "全量摂取", phrase: "主食・副食ともに全量摂取。むせ込みなし。" },
 { category: "食事", label: "むせ込みあり", phrase: "水分摂取時に軽度のむせ込みあり。とろみ濃度を一段階上げて対応。誤嚥徴候なし。" },
 { category: "排泄", label: "普通便中量", phrase: "トイレ誘導にて排尿あり。普通便中等量排便あり。" },
 { category: "入浴", label: "軟膏塗布", phrase: "一般浴実施。背部・両下腿に保湿軟膏塗布。皮膚状態異常なし。" },
 { category: "バイタル", label: "発熱クーリング", phrase: "37.8度の発熱あり。悪寒なし。水分補給実施し頸部クーリング対応。" },
 { category: "特変", label: "ふらつき見守り", phrase: "立ち上がり時に軽度のふらつきを認める。転倒なし。付き添い見守りを強化。" },
 { category: "申し送り", label: "受診指示引継ぎ", phrase: "往診医より指示あり。次回採血まで水分摂取を促し経過観察。" }
];

function openTemplateManageModal() {
 cancelTemplateEdit();
 renderTemplateManageList();
 const modal = document.getElementById("templateManageModal");
 if (modal) modal.style.display = "flex";
}

function renderTemplateManageList() {
 const tbody = document.getElementById("templateManageTableBody");
 const countLabel = document.getElementById("tplCountLabel");
 const templates = gState.templates || [];
 if (countLabel) countLabel.textContent = templates.length;
 if (!tbody) return;

 if (templates.length === 0) {
 tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#64748b; padding:16px;">登録された定型文はありません。</td></tr>';
 return;
 }

 tbody.innerHTML = templates.map((t, idx) => `
 <tr>
 <td><span class="badge" style="background:#e0f2fe; color:#0369a1; font-size:11px;">${escapeHtml(t.category || "共通")}</span></td>
 <td><strong>${escapeHtml(t.label || "")}</strong></td>
 <td style="color:#334155; line-height:1.4;">${escapeHtml(t.phrase || "")}</td>
 <td style="text-align:center; white-space:nowrap;">
 <button type="button" class="btn btn-secondary" style="padding:2px 8px; font-size:11px;" onclick="startEditTemplate(${idx})">編集</button>
 <button type="button" class="btn btn-secondary" style="padding:2px 8px; font-size:11px; color:#dc2626; border-color:#fca5a5;" onclick="deleteTemplate(${idx})">削除</button>
 </td>
 </tr>
 `).join("");
}

function submitTemplateForm() {
 const catEl = document.getElementById("tplCategorySelect");
 const labelEl = document.getElementById("tplLabelInput");
 const phraseEl = document.getElementById("tplPhraseInput");
 const editIdxEl = document.getElementById("tplEditIndex");

 const category = catEl ? catEl.value.trim() : "その他";
 const label = labelEl ? labelEl.value.trim() : "";
 const phrase = phraseEl ? phraseEl.value.trim() : "";
 const editIdx = editIdxEl ? parseInt(editIdxEl.value, 10) : -1;

 if (!label || !phrase) {
 alert("ボタン表示名と定型文章の両方を入力してください。");
 return;
 }

 if (!Array.isArray(db.data.templates)) db.data.templates = [];

 if (editIdx >= 0 && editIdx < db.data.templates.length) {
 db.data.templates[editIdx] = { category, label, phrase };
 } else {
 db.data.templates.push({ category, label, phrase });
 }

 gState.templates = db.data.templates;
 db.save();
 renderQuickTemplates();
 renderFsQuickTemplates();
 renderTemplateManageList();
 cancelTemplateEdit();
}

function startEditTemplate(idx) {
 const templates = gState.templates || [];
 const t = templates[idx];
 if (!t) return;

 const catEl = document.getElementById("tplCategorySelect");
 const labelEl = document.getElementById("tplLabelInput");
 const phraseEl = document.getElementById("tplPhraseInput");
 const editIdxEl = document.getElementById("tplEditIndex");
 const headingEl = document.getElementById("tplFormHeading");
 const badgeEl = document.getElementById("tplEditingBadge");
 const saveBtn = document.getElementById("btnSaveTemplate");
 const cancelBtn = document.getElementById("btnCancelEditTemplate");

 if (catEl) catEl.value = t.category || "巡視";
 if (labelEl) labelEl.value = t.label || "";
 if (phraseEl) phraseEl.value = t.phrase || "";
 if (editIdxEl) editIdxEl.value = idx;
 if (headingEl) headingEl.textContent = `定型文の変更・編集 (${t.label})`;
 if (badgeEl) badgeEl.style.display = "inline-block";
 if (saveBtn) saveBtn.textContent = "変更を保存する";
 if (cancelBtn) cancelBtn.style.display = "inline-block";
}

function cancelTemplateEdit() {
 const labelEl = document.getElementById("tplLabelInput");
 const phraseEl = document.getElementById("tplPhraseInput");
 const editIdxEl = document.getElementById("tplEditIndex");
 const headingEl = document.getElementById("tplFormHeading");
 const badgeEl = document.getElementById("tplEditingBadge");
 const saveBtn = document.getElementById("btnSaveTemplate");
 const cancelBtn = document.getElementById("btnCancelEditTemplate");

 if (labelEl) labelEl.value = "";
 if (phraseEl) phraseEl.value = "";
 if (editIdxEl) editIdxEl.value = -1;
 if (headingEl) headingEl.textContent = "＋ 新しい定型文の登録";
 if (badgeEl) badgeEl.style.display = "none";
 if (saveBtn) saveBtn.textContent = "定型文を保存する";
 if (cancelBtn) cancelBtn.style.display = "none";
}

function deleteTemplate(idx) {
 const templates = gState.templates || [];
 const t = templates[idx];
 if (!t) return;
 if (!confirm(`定型文「${t.label}」を削除してもよろしいですか？`)) return;

 db.data.templates.splice(idx, 1);
 gState.templates = db.data.templates;
 db.save();
 renderQuickTemplates();
 renderFsQuickTemplates();
 renderTemplateManageList();
 cancelTemplateEdit();
}

function resetDefaultTemplates() {
 if (!confirm("定型文を標準の初期テンプレート一覧にリセットしますか？\n（追加された定型文は初期化されます）")) return;

 db.data.templates = JSON.parse(JSON.stringify(DEFAULT_CARE_TEMPLATES));
 gState.templates = db.data.templates;
 db.save();
 renderQuickTemplates();
 renderFsQuickTemplates();
 renderTemplateManageList();
 cancelTemplateEdit();
}

// ======================================================================
// 介護サマリー (生活・ADLアセスメント詳細 13項目)
// ======================================================================
function getResidentSummaryStatusText(residentId) {
 const rId = Number(residentId);
 const list = (db.data.care_summaries || []).filter(s => Number(s.resident_id) === rId);
 if (list.length === 0) {
 return "サマリー未登録 (入所時・入院後サマリーを新規作成できます)";
 }
 const latest = list[0];
 return `最新サマリー: ［${escapeHtml(latest.summary_type || "介護サマリー")}］ ${escapeHtml(latest.created_at || "")} 作成 (作成者: ${escapeHtml(latest.staff_name || "職員")})`;
}

function renderResidentSummaryAccordionContent(residentId) {
 const rId = Number(residentId);
 const list = (db.data.care_summaries || []).filter(s => Number(s.resident_id) === rId);
 if (list.length === 0) {
 return `
 <div style="background:#f8fafc; border:1px dashed #cbd5e1; border-radius:6px; padding:14px; text-align:center; color:#64748b;">
 介護サマリーがまだ登録されていません。<br>
 「サマリー編集・新規」ボタンから、新規入所時または入院後再入所の生活・ADLアセスメントを作成できます。
 </div>
 `;
 }

 const s = list[0];
 return `
 <div style="margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; background:#eff6ff; border:1px solid #bfdbfe; border-radius:6px; padding:6px 10px;">
 <div>
 <strong style="color:#1e40af;">［${escapeHtml(s.summary_type || "介護サマリー")}］</strong>
 <span style="color:#475569; margin-left:6px;">作成日: ${escapeHtml(s.created_at || "")} (作成者: ${escapeHtml(s.staff_name || "職員")})</span>
 </div>
 <button type="button" class="btn btn-secondary" style="padding:2px 8px; font-size:11px;" onclick="openCareSummaryModal(${rId}, ${s.id})">詳細確認・変更</button>
 </div>
 <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:8px;">
 <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:8px 10px;">
 <strong style="color:#1e3a8a; font-size:12px;">1. 基本情報:</strong>
 <div style="margin-top:2px; color:#334155;">${escapeHtml(s.basic_info || "特記事項なし")}</div>
 </div>
 <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:8px 10px;">
 <strong style="color:#1e3a8a; font-size:12px;">2. これまでの経過:</strong>
 <div style="margin-top:2px; color:#334155;">${escapeHtml(s.background || "特記事項なし")}</div>
 </div>
 <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:8px 10px;">
 <strong style="color:#1e3a8a; font-size:12px;">3. 現在の身体・認知状態:</strong>
 <div style="margin-top:2px; color:#334155;">${escapeHtml(s.physical_cognitive || "特記事項なし")}</div>
 </div>
 <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:8px 10px;">
 <strong style="color:#1e3a8a; font-size:12px;">4. ADL (日常生活動作):</strong>
 <div style="margin-top:2px; color:#334155;">${escapeHtml(s.adl || "特記事項なし")}</div>
 </div>
 <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:8px 10px;">
 <strong style="color:#1e3a8a; font-size:12px;">5. 食事・水分摂取:</strong>
 <div style="margin-top:2px; color:#334155;">${escapeHtml(s.meals_hydration || "特記事項なし")}</div>
 </div>
 <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:8px 10px;">
 <strong style="color:#1e3a8a; font-size:12px;">6. 排泄:</strong>
 <div style="margin-top:2px; color:#334155;">${escapeHtml(s.excretion || "特記事項なし")}</div>
 </div>
 <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:8px 10px;">
 <strong style="color:#1e3a8a; font-size:12px;">7. 睡眠:</strong>
 <div style="margin-top:2px; color:#334155;">${escapeHtml(s.sleep || "特記事項なし")}</div>
 </div>
 <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:8px 10px;">
 <strong style="color:#1e3a8a; font-size:12px;">8. 服薬:</strong>
 <div style="margin-top:2px; color:#334155;">${escapeHtml(s.meds || "特記事項なし")}</div>
 </div>
 <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:8px 10px;">
 <strong style="color:#1e3a8a; font-size:12px;">9. 医療的な処置:</strong>
 <div style="margin-top:2px; color:#334155;">${escapeHtml(s.medical_care || "特記事項なし")}</div>
 </div>
 <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:6px; padding:8px 10px;">
 <strong style="color:#991b1b; font-size:12px;">10. 認知症の症状や行動 (BPSD):</strong>
 <div style="margin-top:2px; color:#7f1d1d;">${escapeHtml(s.dementia_behavior || "特記事項なし")}</div>
 </div>
 <div style="background:#fffbeb; border:1px solid #fef3c7; border-radius:6px; padding:8px 10px;">
 <strong style="color:#92400e; font-size:12px;">11. 介助方法・注意点:</strong>
 <div style="margin-top:2px; color:#78350f;">${escapeHtml(s.care_notes || "特記事項なし")}</div>
 </div>
 <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:8px 10px;">
 <strong style="color:#1e3a8a; font-size:12px;">12. 家族の状況:</strong>
 <div style="margin-top:2px; color:#334155;">${escapeHtml(s.family_info || "特記事項なし")}</div>
 </div>
 </div>
 <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:6px; padding:8px 10px; margin-top:10px;">
 <strong style="color:#166534; font-size:12px;">13. 今後の支援で気をつけること:</strong>
 <div style="margin-top:2px; color:#14532d;">${escapeHtml(s.future_goals || "特記事項なし")}</div>
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

 const badgeEl = document.getElementById("csResidentBadge");
 if (badgeEl) badgeEl.textContent = `${r.room_no}号室 ${r.name} 様 (${r.care_level})`;

 const resIdEl = document.getElementById("csResidentId");
 if (resIdEl) resIdEl.value = r.id;

 // 担当職員セレクトボックス
 const staffSelect = document.getElementById("csStaff");
 if (staffSelect) {
 staffSelect.innerHTML = (gState.stamps || []).map(s => {
 const name = s.name || s;
 return `<option value="${escapeHtml(name)}">${escapeHtml(name)} (${escapeHtml(s.role || "職員")})</option>`;
 }).join("");
 const curStaff = document.getElementById("currentStaff")?.value;
 if (curStaff) staffSelect.value = curStaff;
 }

 // 過去サマリー履歴セレクト
 const list = (db.data.care_summaries || []).filter(s => Number(s.resident_id) === r.id);
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
 const newOpt = document.createElement("option");
 newOpt.value = "new";
 newOpt.textContent = "＋ 新規サマリー作成 (新規入所・入院後再入所等)";
 historySelect.appendChild(newOpt);
 } else {
 const opt = document.createElement("option");
 opt.value = "new";
 opt.textContent = "新規サマリー作成 (未登録)";
 historySelect.appendChild(opt);
 }
 }

 if (summaryId) {
 switchCareSummaryRecord(String(summaryId));
 } else if (list.length > 0) {
 switchCareSummaryRecord(String(list[0].id));
 } else {
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
 if (dateEl) dateEl.value = s.created_at || new Date().toISOString().split("T")[0];
 if (staffEl && s.staff_name) staffEl.value = s.staff_name;

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
}

function startNewCareSummary(summaryType = "新規入所時サマリー") {
 const rId = Number(document.getElementById("csResidentId")?.value) || gState.selectedResidentId;
 const r = gState.residents ? gState.residents.find(x => Number(x.id) === rId) : null;
 const historySelect = document.getElementById("careSummaryHistorySelect");
 if (historySelect) historySelect.value = "new";

 const idEl = document.getElementById("csSummaryId");
 const typeEl = document.getElementById("csSummaryType");
 const dateEl = document.getElementById("csDate");

 if (idEl) idEl.value = "";
 if (typeEl) typeEl.value = summaryType;
 if (dateEl) dateEl.value = new Date().toISOString().split("T")[0];

 const list = (db.data.care_summaries || []).filter(s => Number(s.resident_id) === rId);
 const prev = list.length > 0 ? list[0] : null;

 const basicText = prev ? prev.basic_info : `${r ? r.name : ""} 様。${r ? r.care_level : ""}。生年月日: ${r ? (r.birth_date || "未登録") : ""}。緊急連絡先: ${r ? (r.emergency_contact || "未登録") : ""}。看取り方針: ［${r ? (r.policy_stamp || "未設定") : ""}］。`;
 const backgroundText = prev ? prev.background : `${summaryType === "入院後再入所サマリー" ? "協力病院へ一時入院後、病状軽快に伴い退院・再入所。" : "自宅での生活が困難となり当施設へ入所。"}`;
 const physicalText = prev ? prev.physical_cognitive : `麻痺: ${r ? (r.paralysis || "特記なし") : "特記なし"}。病歴: ${r ? (r.diseases || "特記なし") : "特記なし"}。`;
 const adlText = prev ? prev.adl : "寝返り・起き上がり自立。立ち上がり・車椅子移乗は見守り。歩行器歩行にて室内移動。更衣一部介助。入浴見守り。";
 const mealsText = prev ? prev.meals_hydration : `食形態: ${r ? (r.diet_type || "普通食") : "普通食"}。口腔: ${r ? (r.oral_state || "良好") : "良好"}。アレルギー: ${r ? (r.allergies || "なし") : "なし"}。水分目標1200ml/日。`;
 const excretionText = prev ? prev.excretion : "日中はトイレ誘導にて排泄見守り。夜間はパッド使用。定時声かけ。";
 const sleepText = prev ? prev.sleep : "21:00就寝、6:00起床。夜間中途覚醒1〜2回あり。センサー対応。";
 const medsText = prev ? prev.meds : "内服薬あり。看護師・職員による配薬管理および確認。";
 const medicalText = prev ? prev.medical_care : `${r ? (r.dr_instructions || "定期採血・バイタルチェック") : "定期バイタルチェック"}`;
 const dementiaText = prev ? prev.dementia_behavior : "夕方に軽度の帰宅願望や不穏が見られることがある。昔の話題の傾聴により落ち着かれる。";
 const notesText = prev ? prev.care_notes : `急がせる声かけは避ける。${r ? (r.life_history ? "人生歴: " + r.life_history : "") : ""}`;
 const familyText = prev ? prev.family_info : `${r ? (r.family_wishes ? "家族の意向: " + r.family_wishes : "定期面会あり") : "定期面会あり"}`;
 const goalsText = prev ? prev.future_goals : `${r ? (r.care_plan_goal || "安全な日常生活の維持・自立支援") : "安全な日常生活の維持・自立支援"}`;

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
}

function submitCareSummary() {
 const rId = Number(document.getElementById("csResidentId")?.value) || gState.selectedResidentId;
 const sid = document.getElementById("csSummaryId")?.value;
 const summaryType = document.getElementById("csSummaryType")?.value || "新規入所時サマリー";
 const dateVal = document.getElementById("csDate")?.value || new Date().toISOString().split("T")[0];
 const staffVal = document.getElementById("csStaff")?.value || "職員";

 const basicInfo = document.getElementById("csBasicInfo")?.value || "";
 const background = document.getElementById("csBackground")?.value || "";
 const physicalCognitive = document.getElementById("csPhysicalCognitive")?.value || "";
 const adl = document.getElementById("csAdl")?.value || "";
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

 if (sid && sid.trim() !== "") {
 const existing = db.data.care_summaries.find(x => x.id === Number(sid));
 if (existing) {
 existing.summary_type = summaryType;
 existing.updated_at = dateVal;
 existing.staff_name = staffVal;
 existing.basic_info = basicInfo;
 existing.background = background;
 existing.physical_cognitive = physicalCognitive;
 existing.adl = adl;
 existing.meals_hydration = mealsHydration;
 existing.excretion = excretion;
 existing.sleep = sleep;
 existing.meds = meds;
 existing.medical_care = medicalCare;
 existing.dementia_behavior = dementiaBehavior;
 existing.care_notes = careNotes;
 existing.family_info = familyInfo;
 existing.future_goals = futureGoals;
 }
 } else {
 const newSummary = {
 id: Date.now(),
 resident_id: rId,
 created_at: dateVal,
 updated_at: dateVal,
 staff_name: staffVal,
 summary_type: summaryType,
 basic_info: basicInfo,
 background: background,
 physical_cognitive: physicalCognitive,
 adl: adl,
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
 db.data.care_summaries.unshift(newSummary);
 }

 gState.care_summaries = db.data.care_summaries;
 db.save();
 renderResidentDetail();
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
 const sel = document.getElementById("billingResidentSelect");
 const area = document.getElementById("billingDetailArea");
 const resId = sel ? parseInt(sel.value) : NaN;
 const r = (gState.residents || []).find(x => x.id === resId);
 if (!r || !area || !area.innerHTML.trim()) {
 alert("請求明細を印刷する利用者を選択してください。");
 return;
 }
 const facility = getFacilityName();
 const html = `
 <div style="font-family:'Hiragino Kaku Gothic ProN', 'Meiryo', sans-serif; color:#000;">
 <div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid #000; padding-bottom:8px; margin-bottom:14px;">
 <div>
 <h1 style="font-size:20px; margin:0;">月末消耗品 請求明細書</h1>
 <p style="font-size:13px; margin:4px 0 0 0;">対象利用者: <strong>${escapeHtml(r.room_no)}号室 ${escapeHtml(r.name)} 様</strong></p>
 </div>
 <div style="text-align:right; font-size:12px;">
 <div>${escapeHtml(facility)}</div>
 <div>印刷日時: ${new Date().toLocaleString("ja-JP")}</div>
 </div>
 </div>
 ${area.innerHTML}
 </div>`;
 runPrintJob(html, { page: "A4 portrait", fitOnePage: true });
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
 const dateVal = document.getElementById("csDate")?.value || new Date().toISOString().split("T")[0];
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
 <div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid #1e3a8a; padding-bottom:8px; margin-bottom:12px;">
 <div>
 <h1 style="font-size:22px; margin:0; color:#1e3a8a;">介護サマリー (生活・ADLアセスメント詳細)</h1>
 <p style="font-size:13px; color:#334155; margin:4px 0 0 0;">
 対象利用者: <strong>${r ? escapeHtml(r.name) : ""} 様</strong> (${r ? escapeHtml(r.room_no) : ""}号室 / ${r ? escapeHtml(r.care_level) : ""})
 / サマリー種別: <strong>${escapeHtml(summaryType)}</strong>
 </p>
 </div>
 <div style="text-align:right; font-size:12px; color:#475569;">
 <div>作成日: ${escapeHtml(dateVal)}</div>
 <div>作成者: ${escapeHtml(staffVal)}</div>
 </div>
 </div>

 <table style="width:100%; border-collapse:collapse; font-size:12px; margin-bottom:10px;" border="1">
 <tr>
 <th style="width:160px; background:#f1f5f9; padding:6px; text-align:left;">1. 基本情報</th>
 <td style="padding:6px; white-space:pre-wrap;">${escapeHtml(basicInfo)}</td>
 </tr>
 <tr>
 <th style="background:#f1f5f9; padding:6px; text-align:left;">2. これまでの経過</th>
 <td style="padding:6px; white-space:pre-wrap;">${escapeHtml(background)}</td>
 </tr>
 <tr>
 <th style="background:#f1f5f9; padding:6px; text-align:left;">3. 現在の身体・認知状態</th>
 <td style="padding:6px; white-space:pre-wrap;">${escapeHtml(physicalCognitive)}</td>
 </tr>
 <tr>
 <th style="background:#f1f5f9; padding:6px; text-align:left;">4. ADL (日常生活動作)</th>
 <td style="padding:6px; white-space:pre-wrap;">${escapeHtml(adl)}</td>
 </tr>
 <tr>
 <th style="background:#f1f5f9; padding:6px; text-align:left;">5. 食事・水分摂取</th>
 <td style="padding:6px; white-space:pre-wrap;">${escapeHtml(mealsHydration)}</td>
 </tr>
 <tr>
 <th style="background:#f1f5f9; padding:6px; text-align:left;">6. 排泄</th>
 <td style="padding:6px; white-space:pre-wrap;">${escapeHtml(excretion)}</td>
 </tr>
 <tr>
 <th style="background:#f1f5f9; padding:6px; text-align:left;">7. 睡眠</th>
 <td style="padding:6px; white-space:pre-wrap;">${escapeHtml(sleep)}</td>
 </tr>
 <tr>
 <th style="background:#f1f5f9; padding:6px; text-align:left;">8. 服薬</th>
 <td style="padding:6px; white-space:pre-wrap;">${escapeHtml(meds)}</td>
 </tr>
 <tr>
 <th style="background:#f1f5f9; padding:6px; text-align:left;">9. 医療的な処置</th>
 <td style="padding:6px; white-space:pre-wrap;">${escapeHtml(medicalCare)}</td>
 </tr>
 <tr>
 <th style="background:#f1f5f9; padding:6px; text-align:left;">10. 認知症の症状や行動</th>
 <td style="padding:6px; white-space:pre-wrap;">${escapeHtml(dementiaBehavior)}</td>
 </tr>
 <tr>
 <th style="background:#f1f5f9; padding:6px; text-align:left;">11. 介助方法・注意点</th>
 <td style="padding:6px; white-space:pre-wrap;">${escapeHtml(careNotes)}</td>
 </tr>
 <tr>
 <th style="background:#f1f5f9; padding:6px; text-align:left;">12. 家族の状況</th>
 <td style="padding:6px; white-space:pre-wrap;">${escapeHtml(familyInfo)}</td>
 </tr>
 <tr>
 <th style="background:#f1f5f9; padding:6px; text-align:left;">13. 今後の支援で気をつけること</th>
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

 const vitals = (db.data.vitals || []).filter(v => Number(v.resident_id) === Number(r.id));
 const latestVital = vitals.length > 0 ? vitals[vitals.length - 1] : null;
 const vitalStr = latestVital ? `体温: ${latestVital.temperature || "-"}℃ / 血圧: ${latestVital.bp_high || "-"}/${latestVital.bp_low || "-"} mmHg / 脈拍: ${latestVital.pulse || "-"} / SpO2: ${latestVital.spo2 || "-"}% (${latestVital.measured_at || latestVital.date || ""})` : "記録なし";

 const records = (db.data.care_records || []).filter(c => Number(c.resident_id) === Number(r.id) && (c.category === "特変" || c.category === "バイタル" || c.category === "巡視")).slice(0, 3);
 const recordsHtml = records.length > 0 ? records.map(rc => `<div>・[${escapeHtml(rc.recorded_at || "")}] [${escapeHtml(rc.category || "")}] ${escapeHtml(rc.content || "")} (${escapeHtml(rc.staff_name || "")})</div>`).join("") : "<div>特変記録なし</div>";

 const summaries = (db.data.care_summaries || []).filter(s => Number(s.resident_id) === Number(r.id));
 const latestSummary = summaries.length > 0 ? summaries[0] : null;

 container.innerHTML = `
 <div style="font-family:'Hiragino Kaku Gothic ProN', 'Meiryo', sans-serif; color:#0f172a;">
 <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #dc2626; padding-bottom:8px; margin-bottom:12px;">
 <div>
 <h2 style="font-size:20px; font-weight:bold; margin:0; color:#b91c1c;">緊急搬送・受診 申し送りサマリー</h2>
 <div style="font-size:12.5px; color:#475569; margin-top:2px;">施設名: <strong>${escapeHtml(facility)}</strong></div>
 </div>
 <div style="text-align:right; font-size:12px; color:#64748b;">
 <div>作成日時: <strong>${nowStr}</strong></div>
 <div>作成担当職員: <strong>${escapeHtml(staffName)}</strong></div>
 </div>
 </div>

 <div style="background:#fef2f2; border:2px solid #ef4444; border-radius:6px; padding:10px 12px; margin-bottom:12px;">
 <div style="font-weight:bold; color:#991b1b; font-size:13px; margin-bottom:3px;">【本日の救急搬送・受診理由 ＆ 発生状況】</div>
 <div style="font-size:13px; color:#1e293b; white-space:pre-wrap; line-height:1.5;">${escapeHtml(reasonText)}</div>
 </div>

 <table style="width:100%; border-collapse:collapse; font-size:12px; margin-bottom:10px;" border="1">
 <tr>
 <th style="width:120px; background:#f8fafc; padding:6px; text-align:left;">氏名</th>
 <td style="padding:6px; font-weight:bold; font-size:14px;">${escapeHtml(r.name)} 様 (${r.room_no}号室)</td>
 <th style="width:100px; background:#f8fafc; padding:6px; text-align:left;">要介護度</th>
 <td style="padding:6px; font-weight:bold;">${escapeHtml(r.care_level)}</td>
 </tr>
 <tr>
 <th style="background:#f8fafc; padding:6px; text-align:left;">生年月日 / 年齢</th>
 <td style="padding:6px;">${escapeHtml(r.birth_date || "-")}</td>
 <th style="background:#f8fafc; padding:6px; text-align:left;">基本方針</th>
 <td style="padding:6px; font-weight:bold; color:${r.policy_stamp === '看取り' ? '#b91c1c' : '#1d4ed8'};">［ ${escapeHtml(r.policy_stamp || "未設定")} ］</td>
 </tr>
 <tr>
 <th style="background:#f8fafc; padding:6px; text-align:left;">緊急連絡先</th>
 <td colspan="3" style="padding:6px; font-weight:bold; color:#0f172a;">${escapeHtml(r.emergency_contact || "未登録")}</td>
 </tr>
 <tr>
 <th style="background:#f8fafc; padding:6px; text-align:left;">家族要望・ACP</th>
 <td colspan="3" style="padding:6px;">${escapeHtml(r.family_wishes || "特記事項なし")}</td>
 </tr>
 </table>

 <table style="width:100%; border-collapse:collapse; font-size:12px; margin-bottom:10px;" border="1">
 <tr style="background:#fff1f2;">
 <th style="width:120px; color:#991b1b; padding:6px; text-align:left;">アレルギー</th>
 <td colspan="3" style="padding:6px; color:#dc2626; font-weight:bold; font-size:13px;">${escapeHtml(r.allergies || "なし")}</td>
 </tr>
 <tr>
 <th style="width:120px; background:#f8fafc; padding:6px; text-align:left;">既往歴・病歴</th>
 <td colspan="3" style="padding:6px;">${escapeHtml(r.diseases || "特記なし")}</td>
 </tr>
 <tr>
 <th style="background:#f8fafc; padding:6px; text-align:left;">往診医・受診指示</th>
 <td colspan="3" style="padding:6px;">${escapeHtml(r.dr_instructions || "特記なし")}</td>
 </tr>
 <tr>
 <th style="background:#f8fafc; padding:6px; text-align:left;">身体麻痺・状態</th>
 <td style="padding:6px;">${escapeHtml(r.paralysis || "特記なし")}</td>
 <th style="width:100px; background:#f8fafc; padding:6px; text-align:left;">食形態・口腔</th>
 <td style="padding:6px;">${escapeHtml(r.diet_type || "普通食")} / ${escapeHtml(r.oral_state || "良好")}</td>
 </tr>
 <tr>
 <th style="background:#f8fafc; padding:6px; text-align:left;">最新バイタル</th>
 <td colspan="3" style="padding:6px; font-weight:bold;">${escapeHtml(vitalStr)}</td>
 </tr>
 </table>

 <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:6px; padding:8px 10px; margin-bottom:10px; font-size:12px;">
 <strong style="color:#1e3a8a;">【生活動作・ADL・介助注意点 (介護サマリー抜粋)】:</strong>
 <div style="margin-top:3px; line-height:1.4;">
 <strong>ADL:</strong> ${latestSummary ? escapeHtml(latestSummary.adl) : '寝返り・起き上がり自立、移動見守り'} /
 <strong>排泄:</strong> ${latestSummary ? escapeHtml(latestSummary.excretion) : 'トイレ誘導見守り'} /
 <strong>認知症・BPSD:</strong> ${latestSummary ? escapeHtml(latestSummary.dementia_behavior) : '特記なし'}
 </div>
 </div>

 <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:6px; padding:8px 10px; font-size:12px;">
 <strong style="color:#1e3a8a;">【施設内 直近の経過・特変記録抜粋】:</strong>
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

 const summaries = (db.data.care_summaries || []).filter(s => Number(s.resident_id) === Number(r.id));
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
家族要望: ${r.family_wishes || "特記事項なし"}

■ 医療・身体状態
アレルギー: ${r.allergies || "なし"}
既往歴: ${r.diseases || "特記なし"}
麻痺: ${r.paralysis || "特記なし"}
食形態・口腔: ${r.diet_type || "普通食"} / ${r.oral_state || "良好"}
往診医指示: ${r.dr_instructions || "特記なし"}

■ 生活・ADL抜粋
ADL: ${s ? s.adl : "寝返り・起き上がり自立、移動見守り"}
排泄: ${s ? s.excretion : "トイレ誘導"}
認知機能・注意点: ${s ? s.care_notes : "急がせる声かけを避ける"}
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

// ======================================================================
// 皮膚・身体シェーマ図 (軟膏塗布・処置ピン・A4モノクロ印刷)
// ======================================================================

function renderSchemaSummaryBadges(residentId) {
 const rId = Number(residentId);
 const allPins = (db && db.data && db.data.body_schema_pins) ? db.data.body_schema_pins : [];
 const pins = allPins.filter(p => Number(p.resident_id) === rId && p.status !== "治癒・終了");
 if (pins.length === 0) {
 return `<span style="color:#64748b; font-size:11.5px;">特記処置なし</span>`;
 }
 pins.sort((a, b) => (Number(a.pin_no) || 0) - (Number(b.pin_no) || 0));
 return pins.map(p => `
 <span style="display:inline-flex; align-items:center; gap:3px; background:#f1f5f9; border:1px solid #cbd5e1; border-radius:4px; padding:1px 6px; font-size:11px; margin-right:4px;">
 <span style="display:inline-block; width:15px; height:15px; line-height:15px; border-radius:50%; background:#000000; color:#ffffff; font-size:9.5px; text-align:center; font-weight:bold;">${p.pin_no}</span>
 <strong>${escapeHtml(p.site_name)}:</strong> ${escapeHtml(p.item_name)}
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
 const allPins = (db && db.data && db.data.body_schema_pins) ? db.data.body_schema_pins : [];
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
 <div style="text-align:center; padding:24px 10px; color:#64748b; font-size:12px;">
 現在登録されている処置ピンはありません。<br>
 左の人体図（正面・背面）をクリックしてピンを配置してください。
 </div>
 `;
 return;
 }

 let tableHtml = `
 <table class="table" style="width:100%; font-size:12px; margin-bottom:0; border-collapse:collapse;">
 <thead>
 <tr style="background:#f1f5f9; color:#0f172a; border-bottom:2px solid #cbd5e1;">
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
 <tr style="border-bottom:1px solid #e2e8f0; ${rowBg}">
 <td style="padding:6px 8px; text-align:center;">
 <span style="display:inline-block; width:22px; height:22px; line-height:20px; border-radius:50%; background:#000000; color:#ffffff; font-weight:bold; font-size:12px; text-align:center;">
 ${p.pin_no}
 </span>
 </td>
 <td style="padding:6px 8px;">
 <strong>${escapeHtml(p.site_name || '-')}</strong>
 <div style="font-size:10px; color:#64748b;">${escapeHtml(p.category || '-')}</div>
 </td>
 <td style="padding:6px 8px;">
 <div style="font-weight:bold; color:#0f172a;">${escapeHtml(p.item_name || '-')}</div>
 ${p.notes ? `<div style="font-size:11px; color:#475569; margin-top:2px;">${escapeHtml(p.notes)}</div>` : ''}
 </td>
 <td style="padding:6px 8px; font-size:11px; color:#334155;">
 ${escapeHtml(p.frequency || '-')}
 </td>
 <td style="padding:6px 8px; text-align:center;">
 <span style="font-size:10.5px; padding:2px 5px; border-radius:4px; font-weight:bold; background:${p.status === '継続中' ? '#e2e8f0' : '#dcfce7'}; color:#0f172a; border:1px solid #94a3b8;">
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
 }
 } else {
 const newId = db.data.body_schema_pins.length > 0
 ? Math.max(...db.data.body_schema_pins.map(p => Number(p.id) || 0)) + 1
 : 1;

 const resPins = db.data.body_schema_pins.filter(p => Number(p.resident_id) === rId);
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
 coordsBadge.textContent = `位置: ${isFront ? "正面図" : "背面図"} (${pin.x_pct}%, ${pin.y_pct}%) - 図をクリックで位置再指定可`;
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

 const confirmMsg = `No. ${pin.pin_no}「${pin.site_name}: ${pin.item_name}」のピンを削除しますか？\n（※処置が終了した場合は、状態を「治癒・終了」に変更して記録を残すことも可能です）`;
 if (!confirm(confirmMsg)) return;

 const rId = pin.resident_id;
 db.data.body_schema_pins = (db.data.body_schema_pins || []).filter(p => Number(p.id) !== Number(pinId));

 const resPins = db.data.body_schema_pins.filter(p => Number(p.resident_id) === Number(rId));
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

 const allPins = (db && db.data && db.data.body_schema_pins) ? db.data.body_schema_pins : [];
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
 <tr style="background:#f1f5f9; -webkit-print-color-adjust:exact;">
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
 <tr style="background:#e2e8f0; font-weight:bold; -webkit-print-color-adjust:exact;">
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
 const contentArea = document.getElementById("recordContent");
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
 "介護": { bg: "#2563eb", fg: "#ffffff", border: "#bfdbfe" },
 "特変": { bg: "#dc2626", fg: "#ffffff", border: "#fca5a5" },
 "連絡": { bg: "#ca8a04", fg: "#ffffff", border: "#fde047" },
 "看護": { bg: "#16a34a", fg: "#ffffff", border: "#bbf7d0" },
 "リハビリ": { bg: "#7c3aed", fg: "#ffffff", border: "#ddd6fe" },
 "家族": { bg: "#ea580c", fg: "#ffffff", border: "#fed7aa" },
 "巡視": { bg: "#475569", fg: "#ffffff", border: "#cbd5e1" }
 };

 buttons.forEach(btn => {
 const bCat = btn.getAttribute("data-cat");
 if (bCat === currentCat) {
 btn.classList.add("active");
 const style = activeStyles[bCat] || { bg: "#2563eb", fg: "#ffffff", border: "#bfdbfe" };
 btn.style.background = style.bg;
 btn.style.color = style.fg;
 btn.style.borderColor = style.border;
 btn.style.fontWeight = "bold";
 } else {
 btn.classList.remove("active");
 const style = activeStyles[bCat] || { bg: "#ffffff", fg: "#334155", border: "#cbd5e1" };
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
 btn.style.background = "#eff6ff";
 btn.style.color = "#1d4ed8";
 btn.style.border = "1px solid #93c5fd";
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
 <span style="font-size:13px; font-weight:bold; color:#1e3a8a;"> 【${escapeHtml(res.name)} 様】の個人記録カレンダー:</span>
 <button type="button" class="btn btn-secondary" style="padding:2px 8px; font-size:11px;" onclick="changePersonalCalendarMonth(-1)">◀ 前月</button>
 <strong style="font-size:14px; color:#0f172a; min-width:90px; text-align:center;">${year}年 ${month}月</strong>
 <button type="button" class="btn btn-secondary" style="padding:2px 8px; font-size:11px;" onclick="changePersonalCalendarMonth(1)">次月 ▶</button>
 <button type="button" class="btn btn-secondary" style="padding:2px 8px; font-size:11px; margin-left:4px; background:#eff6ff; color:#1d4ed8; border-color:#bfdbfe;" onclick="jumpPersonalCalendarToday()">今日</button>
 </div>
 <div style="display:flex; gap:10px; align-items:center; font-size:11px; color:#64748b;">
 <span><span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#2563eb; margin-right:3px;"></span>バイタル</span>
 <span><span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#16a34a; margin-right:3px;"></span>経過記録</span>
 <span><span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#dc2626; margin-right:3px;"></span>特変</span>
 <span><span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#d97706; margin-right:3px;"></span>入院中</span>
 </div>
 </div>
 `;

 // カレンダーテーブル
 html += `
 <div style="overflow-x:auto;">
 <table style="width:100%; border-collapse:collapse; text-align:center; font-size:12px; background:#fff; border-radius:6px; overflow:hidden; border:1px solid #e2e8f0;">
 <thead>
 <tr style="background:#f1f5f9; color:#475569; font-weight:bold; height:26px;">
 <th style="color:#dc2626; width:14.28%;">日</th>
 <th style="width:14.28%;">月</th>
 <th style="width:14.28%;">火</th>
 <th style="width:14.28%;">水</th>
 <th style="width:14.28%;">木</th>
 <th style="width:14.28%;">金</th>
 <th style="color:#2563eb; width:14.28%;">土</th>
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
 html += `<td style="background:#f8fafc; border:1px solid #f1f5f9;"></td>`;
 } else {
 const curDay = dayCounter;
 const curDateStr = `${year}-${String(month).padStart(2, "0")}-${String(curDay).padStart(2, "0")}`;
 const isSelected = curDateStr === gState.selectedDate;

 // 記録判定
 const hasVital = (db.data.vitals || []).some(v => v.resident_id === res.id && v.date === curDateStr);
 const dayRecs = (db.data.care_records || []).filter(cr => cr.resident_id === res.id && (cr.recorded_at || cr.record_time || "").startsWith(curDateStr));
 const recCount = dayRecs.length;
 const hasTokukan = dayRecs.some(cr => cr.category === "特変");
 const isHospitalized = (res.status === "入院中" && curDateStr >= (res.hospital_date || "2026-08-25"));

 let cellBg = isSelected ? "#dbeafe" : "#ffffff";
 let cellBorder = isSelected ? "2px solid #2563eb" : "1px solid #e2e8f0";
 if (isHospitalized && !isSelected) cellBg = "#fffbeb";

 let dotsHtml = "";
 if (isHospitalized) {
 dotsHtml = `<span style="font-size:9.5px; background:#fef3c7; color:#92400e; padding:1px 3px; border-radius:3px; font-weight:bold;">入院中</span>`;
 } else {
 if (hasVital) dotsHtml += `<span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#2563eb; margin:0 1px;" title="バイタル記録あり"></span>`;
 if (recCount > 0) dotsHtml += `<span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#16a34a; margin:0 1px;" title="介護記録 ${recCount}件"></span>`;
 if (hasTokukan) dotsHtml += `<span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#dc2626; margin:0 1px;" title="特変あり"></span>`;
 }

 let textColor = c === 0 ? "#dc2626" : (c === 6 ? "#2563eb" : "#1e293b");
 if (isSelected) textColor = "#1e40af";

 html += `
 <td onclick="selectPersonalCalendarDate('${curDateStr}')" style="background:${cellBg}; border:${cellBorder}; cursor:pointer; vertical-align:top; padding:4px 2px; transition:background 0.15s;" onmouseover="if(!${isSelected})this.style.background='#f1f5f9';" onmouseout="if(!${isSelected})this.style.background='${cellBg}';">
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
 gState.recordScope = "daily";
 gState.personalCalendarYearMonth = dateStr.slice(0, 7);

 renderCalendar(); // 全体上部カレンダー同期
 renderSelectedDateRecords(); // 個人記録再描画
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

 const isHospitalized = (res.status === "入院中" && dateStr >= (res.hospital_date || "2026-08-25"));

 if (isHospitalized) {
 area.innerHTML = `
 <div style="background:#fef3c7; border:2px solid #f59e0b; border-radius:8px; padding:12px 16px; margin-bottom:12px;">
 <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
 <div style="display:flex; align-items:center; gap:8px;">
 <span style="font-size:22px;"></span>
 <div>
 <strong style="font-size:14.5px; color:#92400e;">【入院加療中】 ${escapeHtml(res.hospital_name || 'さくら総合病院')}</strong>
 <div style="font-size:12px; color:#b45309; margin-top:2px;">
 理由: <strong>${escapeHtml(res.hospital_reason || '右大腿骨頸部骨折 (術後リハビリ加療中)')}</strong> (入院開始: ${res.hospital_date || '2026-08-25'})
 </div>
 </div>
 </div>
 <span style="font-size:12px; background:#fff; border:1px solid #d97706; color:#b45309; padding:4px 12px; border-radius:12px; font-weight:bold;">施設外 入院継続</span>
 </div>
 <div style="font-size:12px; color:#78350f; margin-top:8px; line-height:1.5; background:rgba(255,255,255,0.7); padding:8px 12px; border-radius:6px;">
 ※病院にて加療中のため施設内での直接ケアは休止中です。病院連携・病状確認・リハビリ進捗・家族面談・退院受入調整は下記の個別カルテ記録に集約されています。
 </div>
 </div>
 `;
 return;
 }

 // 1. バイタル検索
 const vital = (db.data.vitals || []).find(v => v.resident_id === res.id && v.date === dateStr);

 // 2. 最新・当月の体重検索
 const weightRecords = (db.data.weight_records || []).filter(w => w.resident_id === res.id).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
 const exactWeight = weightRecords.find(w => w.date === dateStr);
 const latestWeight = exactWeight || weightRecords[0] || null;

 // 3. 食事検索
 const dayMeals = (db.data.meals || []).filter(m => m.resident_id === res.id && m.date === dateStr);
 const breakfast = dayMeals.find(m => m.meal_type === "朝食");
 const lunch = dayMeals.find(m => m.meal_type === "昼食");
 const dinner = dayMeals.find(m => m.meal_type === "夕食");
 const totalWater = dayMeals.reduce((sum, m) => sum + (m.water_ml || 0), 0);

 // 4. 排泄検索
 const dayExcretions = (db.data.excretions || []).filter(e => e.resident_id === res.id && e.date === dateStr);
 const urineCount = dayExcretions.filter(e => e.urine_flag).length;
 const stoolCount = dayExcretions.filter(e => e.stool_condition && e.stool_condition !== "なし").length;
 const stoolSample = dayExcretions.find(e => e.stool_condition && e.stool_condition !== "なし");

 // 5. 入浴検索
 const bath = (db.data.baths || []).find(b => b.resident_id === res.id && b.date === dateStr);

 // 6. 服薬・口腔ケア検索
 const dayMeds = (db.data.meds || []).filter(m => m.resident_id === res.id && m.date === dateStr);
 const dayOrals = (db.data.oral_cares || []).filter(o => o.resident_id === res.id && o.date === dateStr);

 // 血圧のハイライトスタイル
 let bpHtml = `<span style="color:#94a3b8; font-size:12px;">未測定</span>`;
 if (vital && vital.bp_high !== null && vital.bp_low !== null) {
 const isHigh = vital.bp_high >= 145 || vital.bp_low >= 90;
 const bpColor = isHigh ? "#dc2626" : "#1e293b";
 bpHtml = `<strong style="font-size:15px; color:${bpColor};">${vital.bp_high} / ${vital.bp_low}</strong> <span style="font-size:11px; color:#64748b;">mmHg</span>`;
 }

 // 体温のハイライトスタイル
 let tempHtml = `<span style="color:#94a3b8; font-size:12px;">未測定</span>`;
 if (vital && vital.temperature !== null) {
 const isFever = vital.temperature >= 37.3;
 const tempColor = isFever ? "#dc2626" : "#1e293b";
 tempHtml = `<strong style="font-size:15px; color:${tempColor};">${vital.temperature.toFixed(1)}</strong> <span style="font-size:11px; color:#64748b;">℃</span>`;
 }

 // 脈拍 & SpO2
 let pulseSpo2Html = `<span style="color:#94a3b8; font-size:11px;">未測定</span>`;
 if (vital) {
 const pStr = vital.pulse ? `脈拍: <strong>${vital.pulse}</strong> bpm` : "";
 const sStr = vital.spo2 ? `SpO2: <strong>${vital.spo2}</strong> %` : "";
 pulseSpo2Html = [pStr, sStr].filter(Boolean).join(" | ");
 }

 // 体重表示
 let weightHtml = `<span style="color:#94a3b8; font-size:12px;">未測定</span>`;
 if (latestWeight) {
 const isExact = exactWeight ? " (本日測定)" : ` [${latestWeight.date.slice(5)}測定]`;
 weightHtml = `<strong style="font-size:14px; color:#1e293b;">${latestWeight.weight} kg</strong> <span style="font-size:11px; color:#64748b;">(${latestWeight.diff_prev || '±0.0kg'})${isExact}</span>`;
 }

 area.innerHTML = `
 <div style="background:#ffffff; border:1px solid #cbd5e1; border-radius:8px; padding:12px 14px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
 <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:1px solid #f1f5f9; padding-bottom:6px;">
 <span style="font-size:13.5px; font-weight:bold; color:#1e40af; display:flex; align-items:center; gap:6px;">
 <span> 【${dateStr}】 個人記録・身体状況サマリー</span>
 </span>
 <button type="button" class="btn btn-secondary" style="font-size:11.5px; padding:2px 8px; color:#2563eb; border-color:#93c5fd; background:#eff6ff;" onclick="openPersonalVitalModal()">
  バイタル・体重を変更/追記
 </button>
 </div>

 <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:10px;">
 <!-- 1. バイタル & 血圧 & 体重 -->
 <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:8px 10px;">
 <div style="font-size:11px; font-weight:bold; color:#475569; margin-bottom:4px; display:flex; justify-content:space-between;">
 <span>バイタル & 身体測定</span>
 <span style="font-size:10px; color:#64748b;">${vital ? (vital.time || '') : ''}</span>
 </div>
 <div style="display:flex; flex-direction:column; gap:3px;">
 <div><span style="font-size:11.5px; color:#64748b;">血圧:</span> ${bpHtml}</div>
 <div><span style="font-size:11.5px; color:#64748b;">体温:</span> ${tempHtml}</div>
 <div style="font-size:11.5px; color:#334155;">${pulseSpo2Html}</div>
 <div style="margin-top:2px; border-top:1px dashed #cbd5e1; padding-top:2px;">
 <span style="font-size:11.5px; color:#64748b;"> 体重:</span> ${weightHtml}
 </div>
 </div>
 </div>

 <!-- 2. 食事 & 水分 -->
 <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:8px 10px;">
 <div style="font-size:11px; font-weight:bold; color:#475569; margin-bottom:4px;">
 食事 ＆ 水分摂取
 </div>
 <div style="font-size:11.5px; color:#334155; line-height:1.5;">
 <div>朝: ${breakfast ? `${breakfast.main_dish_ratio}/${breakfast.side_dish_ratio}割 (${breakfast.water_ml || 0}ml)` : '<span style="color:#94a3b8;">-</span>'}</div>
 <div>昼: ${lunch ? `${lunch.main_dish_ratio}/${lunch.side_dish_ratio}割 (${lunch.water_ml || 0}ml)` : '<span style="color:#94a3b8;">-</span>'}</div>
 <div>夕: ${dinner ? `${dinner.main_dish_ratio}/${dinner.side_dish_ratio}割 (${dinner.water_ml || 0}ml)` : '<span style="color:#94a3b8;">-</span>'}</div>
 <div style="margin-top:2px; border-top:1px dashed #cbd5e1; padding-top:2px; color:#1e40af; font-weight:bold;">
 1日合計水分: ${totalWater} ml
 </div>
 </div>
 </div>

 <!-- 3. 排泄 & 入浴 -->
 <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:8px 10px;">
 <div style="font-size:11px; font-weight:bold; color:#475569; margin-bottom:4px;">
 排泄 ＆ 入浴
 </div>
 <div style="font-size:11.5px; color:#334155; line-height:1.5;">
 <div>排尿: <strong>${urineCount}</strong> 回 | 排便: <strong>${stoolCount}</strong> 回</div>
 <div style="font-size:11px; color:#64748b;">便状態: ${stoolSample ? `${stoolSample.stool_condition} (${stoolSample.stool_amount || ''})` : '特記なし'}</div>
 <div style="margin-top:2px; border-top:1px dashed #cbd5e1; padding-top:2px;">
 入浴: ${bath ? `<strong style="color:#16a34a;">${bath.bath_type} 実施</strong> (${escapeHtml(bath.ointment_notes || '処置済')})` : '<span style="color:#94a3b8;">本日入浴なし</span>'}
 </div>
 </div>
 </div>

 <!-- 4. 服薬 & 口腔ケア -->
 <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:8px 10px;">
 <div style="font-size:11px; font-weight:bold; color:#475569; margin-bottom:4px;">
 服薬確認 ＆ 口腔ケア
 </div>
 <div style="font-size:11.5px; color:#334155; line-height:1.5;">
 <div>服薬: ${dayMeds.length > 0 ? `<span style="color:#16a34a; font-weight:bold;"> 実施済 (${dayMeds.map(m=>m.slot).join('・')})</span>` : '<span style="color:#94a3b8;">未記録</span>'}</div>
 <div>口腔ケア: ${dayOrals.length > 0 ? `<span style="color:#16a34a; font-weight:bold;"> 実施済 (${dayOrals.length}回)</span>` : '<span style="color:#94a3b8;">未記録</span>'}</div>
 <div style="font-size:11px; color:#64748b; margin-top:2px;">
 食形態: ${escapeHtml(res.diet_type || '普通食')}
 </div>
 </div>
 </div>
 </div>
 </div>
 `;
}

// 個人バイタル・体重編集モーダルのオープン
function openPersonalVitalModal() {
 const res = gState.residents.find(x => x.id === gState.selectedResidentId);
 if (!res) {
 alert("利用者が選択されていません。");
 return;
 }

 const dt = gState.selectedDate || getTodayStr();

 document.getElementById("personalVitalModalResidentName").textContent = `${res.room_no}号室 ${res.name} 様`;
 document.getElementById("personalVitalModalDate").textContent = `${dt} (${getWeekDayJp(dt)})`;
 document.getElementById("personalVitalDate").value = dt;
 document.getElementById("personalVitalResidentId").value = res.id;

 // 既存データ事前充填
 const vital = (db.data.vitals || []).find(v => v.resident_id === res.id && v.date === dt);
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

// 個人バイタル・体重編集モーダルの保存（全体連動）
function submitPersonalVitalModal() {
 const resId = parseInt(document.getElementById("personalVitalResidentId").value, 10);
 const dt = document.getElementById("personalVitalDate").value;
 const staff = document.getElementById("currentStaff").value || "木村 健一";

 const tempVal = normalizeTempValue(document.getElementById("pvmTemp").value);
 const pulseVal = document.getElementById("pvmPulse").value;
 const bpHighVal = document.getElementById("pvmBpHigher").value;
 const bpLowVal = document.getElementById("pvmBpLower").value;
 const spo2Val = document.getElementById("pvmSpo2").value;
 const weightVal = document.getElementById("pvmWeight").value;
 const notesVal = document.getElementById("pvmNotes").value.trim();

 if (!Array.isArray(db.data.vitals)) db.data.vitals = [];
 if (!Array.isArray(db.data.weight_records)) db.data.weight_records = [];
 if (!Array.isArray(db.data.care_records)) db.data.care_records = [];

 // バイタル更新または追加
 const existingVitalIndex = db.data.vitals.findIndex(v => v.resident_id === resId && v.date === dt);
 const nowTime = new Date().toTimeString().slice(0, 5);

 const vitalObj = {
 id: existingVitalIndex >= 0 ? db.data.vitals[existingVitalIndex].id : Date.now(),
 date: dt,
 time: existingVitalIndex >= 0 ? (db.data.vitals[existingVitalIndex].time || nowTime) : nowTime,
 resident_id: resId,
 temperature: tempVal ? parseFloat(tempVal) : null,
 bp_high: bpHighVal ? parseInt(bpHighVal, 10) : null,
 bp_low: bpLowVal ? parseInt(bpLowVal, 10) : null,
 pulse: pulseVal ? parseInt(pulseVal, 10) : null,
 spo2: spo2Val ? parseInt(spo2Val, 10) : null,
 is_unusual: (bpHighVal >= 150 || tempVal >= 37.5 || spo2Val <= 92) ? 1 : 0,
 staff_name: staff,
 notes: notesVal
 };

 if (existingVitalIndex >= 0) {
 db.data.vitals[existingVitalIndex] = vitalObj;
 } else if (tempVal || bpHighVal || pulseVal || spo2Val) {
 db.data.vitals.push(vitalObj);
 }

 // 体重更新または追加
 if (weightVal) {
 const wNum = parseFloat(weightVal);
 const existingWeightIndex = db.data.weight_records.findIndex(w => w.resident_id === resId && w.date === dt);
 const prevWeightObj = db.data.weight_records
 .filter(w => w.resident_id === resId && w.date < dt)
 .sort((a, b) => b.date.localeCompare(a.date))[0];

 let diffStr = "±0.0kg";
 if (prevWeightObj && prevWeightObj.weight) {
 const d = (wNum - prevWeightObj.weight).toFixed(1);
 diffStr = d >= 0 ? `+${d}kg` : `${d}kg`;
 }

 const weightObj = {
 id: existingWeightIndex >= 0 ? db.data.weight_records[existingWeightIndex].id : (Date.now() + 5),
 date: dt,
 month: dt.slice(0, 7),
 resident_id: resId,
 weight: wNum,
 diff_prev: diffStr,
 staff_name: staff
 };

 if (existingWeightIndex >= 0) {
 db.data.weight_records[existingWeightIndex] = weightObj;
 } else {
 db.data.weight_records.push(weightObj);
 }
 }

 // 介護経過記録へも連動追加
 const vitalSummaryText = `【バイタル＆身体測定】体温:${tempVal || '-'}℃, 血圧:${bpHighVal || '-'}/${bpLowVal || '-'}mmHg, 脈拍:${pulseVal || '-'}bpm, SpO2:${spo2Val || '-'}%${weightVal ? `, 体重:${weightVal}kg` : ''}${notesVal ? ` (${notesVal})` : ''}`;

 db.data.care_records.unshift({
 id: Date.now() + 10,
 recorded_at: `${dt} ${nowTime}`,
 resident_id: resId,
 category: "バイタル",
 content: vitalSummaryText,
 staff_name: staff
 });

 db.save();
 closeModal("personalVitalModal");

 // 全体連動再描画！
 loadDateRecords(dt);
 if (typeof renderWeightTable === "function") renderWeightTable();
 if (typeof renderWeightChart === "function") renderWeightChart();

 alert("バイタル＆身体測定を保存しました！個人記録と全体タブの両方に連動反映されました。");
}

// 区分に応じたバッジ装飾スタイル（日誌・個別カルテ共通）
function getCategoryBadgeStyle(cat) {
 if (cat === "特変") return "background:#fee2e2; color:#991b1b; font-weight:bold; border:1px solid #fca5a5;";
 if (cat === "連絡") return "background:#fef9c3; color:#854d0e; font-weight:bold; border:1px solid #fde047;";
 if (cat === "看護") return "background:#dcfce7; color:#166534; font-weight:bold; border:1px solid #bbf7d0;";
 if (cat === "リハビリ") return "background:#ede9fe; color:#6b21a8; font-weight:bold; border:1px solid #ddd6fe;";
 if (cat === "家族") return "background:#ffedd5; color:#c2410c; font-weight:bold; border:1px solid #fed7aa;";
 if (cat === "巡視") return "background:#f1f5f9; color:#475569; border:1px solid #cbd5e1;";
 if (cat === "バイタル") return "background:#fef3c7; color:#92400e; border:1px solid #fde68a;";
 if (cat === "頓服服用") return "background:#f3e8ff; color:#6b21a8; border:1px solid #e9d5ff;";
 return "background:#e0f2fe; color:#0369a1; border:1px solid #bfdbfe;"; // 介護・デフォルト
}

// 選択中利用者の個別介護記録一覧表示 (個別カルテ・長文対応・年月別アコーディオン)
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
 ? ` 【${resName}】の個別カルテ履歴 (年月別アーカイブ)`
 : ` 【${resName}】の個人カルテ統合シート`;
 }

 // 1. 個人記録カレンダーを描画
 renderPersonalCalendar();

 // 2. 当日の個人データ集約サマリーカードを描画（血圧、体温、脈拍、SpO2、体重、食事、排泄、入浴、服薬）
 if (!isAllScope) {
 renderPersonalDailySummary(res, gState.selectedDate);
 } else {
 const summaryArea = document.getElementById("personalDailySummaryArea");
 if (summaryArea) summaryArea.innerHTML = "";
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
 すべての過去履歴を表示する
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

 const catBadgeStyle = getCategoryBadgeStyle(r.category);

 const timeDisplay = r.recorded_at || r.record_time || "時間未記録";
 const rawContent = r.content || "";
 const charLen = rawContent.length;
 const isLong = charLen > 400;
 const isExpanded = gExpandedRecordIds.has(r.id);

 let displayContent = rawContent;
 let toggleBtnHtml = "";
 if (isLong && !isExpanded) {
 displayContent = rawContent.slice(0, 300) + "……";
 toggleBtnHtml = `<button type="button" class="btn btn-secondary" style="font-size:12px; padding:3px 10px; margin-top:6px; align-self:flex-start;" onclick="toggleRecordExpand(${r.id})"> 全文を表示 (${charLen}文字)</button>`;
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
 <div style="display:flex; align-items:center; gap:6px;">
 <span style="font-size:12px; color:var(--text-muted);">${escapeHtml(timeDisplay)} (記録者: ${escapeHtml(r.staff_name || '未記録')})</span>
 <button type="button" class="btn btn-secondary" style="font-size:11px; padding:2px 8px; border:1px solid #cbd5e1;" onclick="openEditCareRecordModal(${r.id})">編集</button>
 </div>
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
 <span style="font-size:14px; font-weight:bold; color:#1e3a8a;"> ${ymTitle}</span>
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
 <h1 style="font-size:22px; margin:0; color:#1e3a8a;">個別介護記録・カルテ報告書</h1>
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

 runPrintJob(printArea.innerHTML, { page: "A4 portrait", fitOnePage: true, minScale: 0.75 });
}

// ============================================================
// 施設・フロア 業務日誌 (一日の記録・日課スケジュール ＆ 特変日報)
// ============================================================
function renderDailyJournal() {
 const titleEl = document.getElementById("dailyJournalTitle");
 if (titleEl) {
 titleEl.textContent = ` 【${gState.selectedDate}】施設・フロア 業務日誌 (一日の記録)`;
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

 const roster = (typeof getDailyShiftRoster === "function") ? getDailyShiftRoster(gState.selectedDate) : null;
 let shiftSummaryText = "";
 let journalDateTitle = "本日のフロア勤務体制:";
 if (roster) {
  let dirT = "木村";
  if (roster.director.length > 0) {
   const dir = roster.director[0];
   dirT = dir.shift === "休" ? `${dir.shortName}(公休)` : dir.shortName;
  }
  const nurseT = roster.nurse.length > 0 ? roster.nurse.map(n => n.shortName).join("・") : "(オンコール)";
  const officeT = roster.office.length > 0 ? roster.office.map(o => o.shortName).join("・") : "(公休)";
  const fmt = l => l.length > 0 ? l.map(s => s.displayName).join("・") : "-";
  shiftSummaryText = `管理者: ${dirT} | 看護: ${nurseT} | 早出: ${fmt(roster.early)} | 日勤: ${fmt(roster.dayCare)} | 遅出: ${fmt(roster.late)} | 夜勤: ${fmt(roster.night)} | 明け: ${fmt(roster.dawn)} | 事務: ${officeT}`;
  journalDateTitle = `【${roster.month}月${roster.day}日】フロア勤務体制（勤務表連動）:`;
 } else {
  const shiftText = (document.getElementById("todayShiftBar") ? document.getElementById("todayShiftBar").innerText : "").replace(" 本日の勤務体制:", "").trim();
  shiftSummaryText = shiftText || "管理者: 木村 | 看護: 鈴木 | 介護体制確認中";
  journalDateTitle = "本日のフロア勤務体制:";
 }

 summaryBar.innerHTML = `
 <div style="display:flex; flex-direction:column; gap:4px; max-width:65%;">
 <div style="font-size:13px; color:#1e40af; font-weight:bold;"> ${journalDateTitle}</div>
 <div style="font-size:12.5px; color:#1e293b; line-height:1.5;">${escapeHtml(shiftSummaryText)}</div>
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

 // 2. 施設・フロア 一日の日課スケジュールタイムライン (何時に何を行ったか)
 renderDailyScheduleTimeline();

 // 3. 指定日のフロア特変・申し送り記録一覧 (個別の体位交換「左側臥位」等は除外)
 const recordsListEl = document.getElementById("dailyJournalRecordsList");
 if (recordsListEl) {
 const allRecords = (db.data.care_records || [])
 .filter(r => {
 const timeStr = r.recorded_at || r.record_time || "";
 if (!timeStr.startsWith(gState.selectedDate)) return false;
 // 個別の体位変換・巡視記録(左側臥位等)は日誌の一日の記録から除外
 if (r.category === "巡視" && (r.content || "").includes("夜間巡視")) return false;
 return true;
 })
 .sort((a, b) => {
 const ta = a.recorded_at || a.record_time || "";
 const tb = b.recorded_at || b.record_time || "";
 return ta.localeCompare(tb);
 });

 if (allRecords.length === 0) {
 recordsListEl.innerHTML = '<p style="font-size:13px; color:var(--text-muted); padding:12px; text-align:center; background:#f8fafc; border-radius:6px;">この日の特変・特記事項はありません。</p>';
 } else {
 recordsListEl.innerHTML = "";
 allRecords.forEach(r => {
 const res = (r.resident_id === 0) ? null : gState.residents.find(x => x.id === r.resident_id);
 const resName = (r.resident_id === 0) ? "フロア全体・共通" : (res ? `${res.room_no}号室 ${res.name} 様` : "利用者未指定");
 const timeDisplay = r.recorded_at || r.record_time || "時間未記録";
 const catBadgeStyle = getCategoryBadgeStyle(r.category);

 const item = document.createElement("div");
 item.className = "care-record-card";
 item.innerHTML = `
 <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
 <div style="display:flex; align-items:center; gap:8px;">
 <span style="font-size:12px; padding:3px 8px; border-radius:4px; ${catBadgeStyle}">［${escapeHtml(r.category || '介護記録')}］</span>
 <strong style="font-size:14px; color:#1e293b;">${escapeHtml(resName)}</strong>
 </div>
 <div style="display:flex; align-items:center; gap:6px;">
 <span style="font-size:12px; color:var(--text-muted);">${escapeHtml(timeDisplay)} (記録者: ${escapeHtml(r.staff_name || '未記録')})</span>
 <button type="button" class="btn btn-secondary" style="font-size:11px; padding:2px 8px; border:1px solid #cbd5e1;" onclick="openEditCareRecordModal(${r.id})">編集</button>
 </div>
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
 const facilityName = getFacilityName();

 const roster = (typeof getDailyShiftRoster === "function") ? getDailyShiftRoster(gState.selectedDate) : null;
 let printRosterHtml = "";
 if (roster) {
  let dirT = "木村";
  if (roster.director.length > 0) {
   const dir = roster.director[0];
   dirT = dir.shift === "休" ? `${dir.shortName}(公休)` : dir.shortName;
  }
  const nurseT = roster.nurse.length > 0 ? roster.nurse.map(n => n.shortName).join("・") : "(オンコール)";
  const officeT = roster.office.length > 0 ? roster.office.map(o => o.shortName).join("・") : "(公休)";
  const fmt = l => l.length > 0 ? l.map(s => s.displayName).join("・") : "-";

  printRosterHtml = `
  <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:4px; padding:6px 12px; margin-bottom:14px; font-size:11px; color:#1e293b;">
   <strong style="color:#1e40af;">【本日の勤務体制】</strong>
   <span>管理者: ${escapeHtml(dirT)}</span> | 
   <span>看護: ${escapeHtml(nurseT)}</span> | 
   <span>早出: ${escapeHtml(fmt(roster.early))}</span> | 
   <span>日勤: ${escapeHtml(fmt(roster.dayCare))}</span> | 
   <span>遅出: ${escapeHtml(fmt(roster.late))}</span> | 
   <span>夜勤: ${escapeHtml(fmt(roster.night))}</span> | 
   <span>明け: ${escapeHtml(fmt(roster.dawn))}</span> | 
   <span>事務: ${escapeHtml(officeT)}</span>
  </div>
  `;
 }

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
 <h1 style="font-size:20px; margin:0; color:#1e3a8a;"> ${escapeHtml(facilityName)} フロア業務日誌 (一日の記録)</h1>
 <p style="font-size:12px; color:#475569; margin:4px 0 0 0;">対象日: <strong>${escapeHtml(gState.selectedDate)}</strong> / 日報管理書類</p>
 </div>
 <div style="text-align:right; font-size:11px; color:#64748b;">
 <div>印刷日時: ${nowStr}</div>
 <div>出力者: ${escapeHtml(staffName)}</div>
 </div>
 </div>

 ${printRosterHtml}

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

 <!-- 一日の日課・業務スケジュール実施記録 (印刷欄) -->
 <h3 style="font-size:14px; margin:16px 0 6px 0; color:#1e3a8a;">2. フロア一日の日課・業務スケジュール実施記録</h3>
 <table style="width:100%; border-collapse:collapse; font-size:11.5px; margin-bottom:16px;">
 <thead>
 <tr style="background:#f1f5f9;">
 <th style="border:1px solid #94a3b8; padding:5px 8px; width:70px;">時間</th>
 <th style="border:1px solid #94a3b8; padding:5px 8px; width:150px;">日課・行事項目</th>
 <th style="border:1px solid #94a3b8; padding:5px 8px;">実施内容・様子</th>
 <th style="border:1px solid #94a3b8; padding:5px 8px; width:100px;">担当</th>
 </tr>
 </thead>
 <tbody>
 ${(db.data.daily_schedules || []).slice().sort((a,b) => (a.time||'').localeCompare(b.time||'')).map(s => `
 <tr>
 <td style="border:1px solid #94a3b8; padding:5px 8px; font-weight:bold; text-align:center;">${s.time}</td>
 <td style="border:1px solid #94a3b8; padding:5px 8px; font-weight:bold;">${escapeHtml(s.title)}</td>
 <td style="border:1px solid #94a3b8; padding:5px 8px;">${escapeHtml(s.content || '-')}</td>
 <td style="border:1px solid #94a3b8; padding:5px 8px;">${escapeHtml(s.staff_name || '-')}</td>
 </tr>
 `).join("") || '<tr><td colspan="4" style="text-align:center; padding:8px;">スケジュール記録なし</td></tr>'}
 </tbody>
 </table>

 <h3 style="font-size:14px; margin:14px 0 6px 0; color:#1e3a8a;">3. 特変・申し送り記録 (計 ${records.length} 件)</h3>
 <div>
 ${recordsHtml || '<p style="padding:10px; font-size:12px; color:#64748b;">記録なし</p>'}
 </div>

 <div style="margin-top:24px; border-top:1px solid #cbd5e1; padding-top:8px; display:flex; justify-content:space-between; font-size:11px; color:#94a3b8;">
 <span>ケアポータル 統合管理システム (フロア日報印刷)</span>
 <span>施設長印: __________________ / リーダー印: __________________</span>
 </div>
 </div>
 `;

 runPrintJob(printArea.innerHTML, { page: "A4 portrait", fitOnePage: true, minScale: 0.75 });
}

// 施設・フロア 一日の日課・業務スケジュール
function renderDailyScheduleTimeline() {
 const container = document.getElementById("dailyScheduleTimeline");
 if (!container) return;
 const list = (db.data.daily_schedules || []).slice().sort((a, b) => (a.time || "").localeCompare(b.time || ""));
 
 if (list.length === 0) {
 container.innerHTML = '<p style="font-size:13px; color:var(--text-muted); margin:0;">登録された日課・行事スケジュールはありません。「＋ 日課・業務を追加」から追加できます。</p>';
 return;
 }

 let html = '<div style="display:flex; flex-direction:column; gap:8px;">';
 list.forEach(s => {
 html += `
 <div style="display:flex; justify-content:space-between; align-items:flex-start; padding:8px 12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; font-size:13px;">
 <div style="display:flex; gap:12px; align-items:flex-start;">
 <span style="background:#1e40af; color:#ffffff; font-weight:bold; font-size:12px; padding:2px 8px; border-radius:4px; white-space:nowrap;">
 ${s.time}
 </span>
 <div>
 <strong style="color:#0f172a; font-size:14px;">${escapeHtml(s.title)}</strong>
 ${s.content ? `<div style="font-size:12.5px; color:#475569; margin-top:2px;">${escapeHtml(s.content)}</div>` : ''}
 ${s.staff_name ? `<div style="font-size:11px; color:#64748b; margin-top:2px;">担当: ${escapeHtml(s.staff_name)}</div>` : ''}
 </div>
 </div>
 <button class="btn btn-secondary" style="padding:2px 8px; font-size:11px; color:#dc2626; border-color:#fca5a5;" onclick="deleteDailySchedule(${s.id})">削除</button>
 </div>
 `;
 });
 html += '</div>';
 container.innerHTML = html;
}

function openDailyScheduleModal() {
 const tm = new Date().toTimeString().slice(0, 5);
 document.getElementById("schedTime").value = tm;
 document.getElementById("schedTitle").value = "";
 document.getElementById("schedContent").value = "";
 const staff = document.getElementById("currentStaff").value || "";
 document.getElementById("schedStaff").value = staff;
 document.getElementById("dailyScheduleModal").style.display = "flex";
}

function submitDailySchedule() {
 const tm = document.getElementById("schedTime").value;
 const title = document.getElementById("schedTitle").value.trim();
 const content = document.getElementById("schedContent").value.trim();
 const staff = document.getElementById("schedStaff").value.trim();

 if (!tm || !title) {
 alert("時間と日課・項目名は必須入力です。");
 return;
 }

 if (!Array.isArray(db.data.daily_schedules)) db.data.daily_schedules = [];
 db.data.daily_schedules.push({
 id: Date.now(),
 time: tm,
 title: title,
 content: content,
 staff_name: staff
 });

 db.save();
 closeModal("dailyScheduleModal");
 renderDailyScheduleTimeline();
 alert(`日課スケジュール「${title}」を追加しました！`);
}

function deleteDailySchedule(id) {
 if (!confirm("この日課スケジュールを削除してもよろしいですか？")) return;
 db.data.daily_schedules = (db.data.daily_schedules || []).filter(s => s.id !== id);
 db.save();
 renderDailyScheduleTimeline();
}

// 業務日誌 特変・申送り・連絡追加 モーダル
function openDailyJournalAddRecordModal(prefillCategory) {
 const modal = document.getElementById("dailyJournalAddRecordModal");
 if (!modal) return;

 // 1. 対象利用者セレクトの同期
 const resSelect = document.getElementById("djmResidentSelect");
 if (resSelect && Array.isArray(gState.residents)) {
 let opts = gState.residents.map(r => `<option value="${r.id}">${escapeHtml(r.room_no)}号室 ${escapeHtml(r.name)} 様</option>`);
 opts.push('<option value="0">【全体・フロア共通】（特定入居者なし）</option>');
 resSelect.innerHTML = opts.join("");
 if (gState.selectedResidentId) {
 resSelect.value = String(gState.selectedResidentId);
 }
 }

 // 2. 区分初期値
 const targetCat = prefillCategory || "特変";
 selectDailyJournalCategory(targetCat);

 // 3. 日時初期値 (現在日時に合わせる)
 const now = new Date();
 const pad = n => String(n).padStart(2, "0");
 const defaultDate = gState.selectedDate || `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
 const defaultTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
 const dtInput = document.getElementById("djmDateTime");
 if (dtInput) {
 dtInput.value = `${defaultDate}T${defaultTime}`;
 }

 // 4. 職員名
 const staffInput = document.getElementById("djmStaff");
 const curStaff = (document.getElementById("currentStaff") ? document.getElementById("currentStaff").value : "") || "木村 健一";
 if (staffInput) {
 staffInput.value = curStaff;
 }

 // 5. 本文初期化 & 雛形セット
 const contentArea = document.getElementById("djmContent");
 if (contentArea) {
 contentArea.value = "";
 insertDailyJournalTemplate(targetCat);
 }

 modal.style.display = "flex";
}

function selectDailyJournalCategory(cat) {
 const sel = document.getElementById("djmCategorySelect");
 if (sel) sel.value = cat;

 const btnContainer = document.getElementById("djmCategoryButtons");
 if (!btnContainer) return;
 const buttons = btnContainer.querySelectorAll("button[data-cat]");

 const activeStyles = {
 "特変": { bg: "#dc2626", fg: "#ffffff", border: "#fca5a5" },
 "連絡": { bg: "#ca8a04", fg: "#ffffff", border: "#fde047" },
 "介護": { bg: "#2563eb", fg: "#ffffff", border: "#bfdbfe" },
 "看護": { bg: "#16a34a", fg: "#ffffff", border: "#bbf7d0" },
 "リハビリ": { bg: "#7c3aed", fg: "#ffffff", border: "#ddd6fe" }
 };

 buttons.forEach(btn => {
 const bCat = btn.getAttribute("data-cat");
 if (bCat === cat) {
 btn.classList.add("active");
 const style = activeStyles[bCat] || { bg: "#2563eb", fg: "#ffffff", border: "#bfdbfe" };
 btn.style.background = style.bg;
 btn.style.color = style.fg;
 btn.style.borderColor = style.border;
 btn.style.fontWeight = "bold";
 } else {
 btn.classList.remove("active");
 const style = activeStyles[bCat] || { bg: "#ffffff", fg: "#334155", border: "#cbd5e1" };
 btn.style.background = "#ffffff";
 btn.style.color = style.bg;
 btn.style.borderColor = style.border;
 btn.style.fontWeight = "bold";
 }
 });
}

function syncDailyJournalCategoryButtons() {
 const sel = document.getElementById("djmCategorySelect");
 if (sel) selectDailyJournalCategory(sel.value);
}

function insertDailyJournalTemplate(cat) {
 const textarea = document.getElementById("djmContent");
 if (!textarea) return;
 const now = new Date();
 const pad = n => String(n).padStart(2, "0");
 const tm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

 let tpl = "";
 if (cat === "特変") {
 tpl = `【特変】${tm}頃、`;
 } else if (cat === "連絡") {
 tpl = `【連絡・申送り】`;
 } else if (cat === "看護") {
 tpl = `【看護処置】${tm}実施。`;
 } else if (cat === "リハビリ") {
 tpl = `【機能訓練】`;
 } else if (cat === "介護") {
 tpl = `【日常ケア・日報】様子良好。`;
 }

 if (textarea.value.trim() === "" || textarea.value.startsWith("【")) {
 textarea.value = tpl;
 } else {
 textarea.value = tpl + "\n" + textarea.value;
 }
 textarea.focus();
}

function submitDailyJournalRecordModal() {
 const resSelect = document.getElementById("djmResidentSelect");
 const catSelect = document.getElementById("djmCategorySelect");
 const dtInput = document.getElementById("djmDateTime");
 const staffInput = document.getElementById("djmStaff");
 const contentArea = document.getElementById("djmContent");

 const content = contentArea ? contentArea.value.trim() : "";
 if (!content) {
 alert("記録内容を入力してください。");
 if (contentArea) contentArea.focus();
 return;
 }

 const resId = resSelect ? parseInt(resSelect.value, 10) : 0;
 const cat = catSelect ? catSelect.value : "特変";
 const dtVal = (dtInput && dtInput.value) ? dtInput.value : `${gState.selectedDate}T12:00`;
 const recordedAt = dtVal.replace("T", " ");
 const dateStr = dtVal.split("T")[0];
 const staff = (staffInput && staffInput.value.trim()) ? staffInput.value.trim() : "職員";

 if (!Array.isArray(db.data.care_records)) db.data.care_records = [];

 // 1. 介護記録テーブルへ追加
 const newRec = {
 id: Date.now(),
 recorded_at: recordedAt,
 resident_id: resId,
 category: cat,
 content: content,
 staff_name: staff
 };
 db.data.care_records.unshift(newRec);

 // 2. 特変または連絡の場合は、申し送り（連絡帳）へも自動追加
 if (cat === "特変" || cat === "連絡") {
 if (!Array.isArray(db.data.notebooks)) db.data.notebooks = [];
 const resObj = (resId === 0) ? null : gState.residents.find(r => r.id === resId);
 const resName = (resId === 0) ? "フロア全体" : (resObj ? `${resObj.room_no}号室 ${resObj.name}様` : "");
 db.data.notebooks.unshift({
 id: Date.now() + 1,
 date: dateStr,
 resident_id: resId,
 content: `［${cat}］(${resName}) ${content}`,
 staff_name: staff,
 status: "未対応"
 });
 }

 db.save();
 closeModal("dailyJournalAddRecordModal");

 // 再描画（日誌・申し送り・個別カルテ・カレンダー）
 loadDateRecords(dateStr);
 if (gState.activeCareTab === "daily_journal") {
 renderDailyJournal();
 }
 renderCalendar();

 alert(`［${cat}］記録を登録しました！日誌・カルテ・申し送りに連動反映されました。`);
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
 『${q}』の検索結果: ${results.length}件ヒット (何月何日何時何分の記録か)
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
 <span style="font-weight:bold; color:#1d4ed8;"> ${escapeHtml(timeDisplay)} 【${escapeHtml(r.category || '記録')}】</span>
 <strong>${res ? escapeHtml(res.room_no) + '号室 ' + escapeHtml(res.name) + ' 様' : ''}</strong>
 <span style="color:var(--text-muted);">担当: ${escapeHtml(r.staff_name || '未設定')}</span>
 </div>
 <div style="font-size:14px; line-height:1.7; white-space:pre-wrap; margin-top:4px; padding:6px; background:#fff; border-radius:4px;">${contentHtml}</div>
 <div style="margin-top:6px; display:flex; justify-content:flex-end;">
 <button class="btn btn-secondary" style="padding:2px 8px; font-size:11px;" onclick="jumpToDateRecord('${escapeHtml(timeDisplay.slice(0, 10))}')"> この日の記録一覧へジャンプ</button>
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

// 体温入力の自動小数点変換 (例: 365 -> 36.5, 370 -> 37.0)
function formatTempInput(el) {
 if (!el) return;
 let val = String(el.value).trim();
 if (!val) return;
 const num = parseFloat(val);
 if (!isNaN(num) && num >= 300 && num <= 450 && !val.includes(".")) {
   el.value = (num / 10).toFixed(1);
 }
}

function normalizeTempValue(val) {
 if (!val) return "";
 let s = String(val).trim();
 const num = parseFloat(s);
 if (!isNaN(num) && num >= 300 && num <= 450 && !s.includes(".")) {
   return (num / 10).toFixed(1);
 }
 return s;
}

// 1. バイタル表
function renderVitalsTable() {
 const tbody = document.querySelector("#vitalsTable tbody");
 if (!tbody) return;
 tbody.innerHTML = "";
 const vitals = (db.data.vitals || []).filter(v => v.date === gState.selectedDate);

 gState.residents.forEach(r => {
   const v = vitals.find(x => x.resident_id === r.id);
   const tr = document.createElement("tr");
   if (r.status !== "在所") tr.style.opacity = "0.5";

   tr.innerHTML = `
     <td>${r.room_no}</td>
     <td><strong>${r.name} 様</strong> ${r.status !== '在所' ? `(${r.status})` : ''}</td>
     <td><input type="number" step="0.1" class="form-control" style="width:85px;" id="vTemp_${r.id}" value="${v ? v.temperature || '' : ''}" placeholder="36.5" onblur="formatTempInput(this)" oninput="formatTempInput(this)"></td>
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
 const tempInput = document.getElementById(`vTemp_${resId}`);
 if (tempInput) formatTempInput(tempInput);
 const temp = normalizeTempValue(tempInput ? tempInput.value : "");
 const bpHigh = document.getElementById(`vBpHigh_${resId}`).value;
 const bpLow = document.getElementById(`vBpLow_${resId}`).value;
 const pulse = document.getElementById(`vPulse_${resId}`).value;
 const spo2 = document.getElementById(`vSpo2_${resId}`).value;
 const isUnusual = document.getElementById(`vUnusual_${resId}`).checked;

 if (!temp && !bpHigh && !bpLow && !pulse && !spo2) {
   alert("体温・血圧・脈拍・SpO2のいずれかを入力してください。");
   return;
 }

 // 個別注意基準値チェック (いつもより外れている場合の確認警告)
 const res = gState.residents.find(x => x.id === resId);
 if (res) {
   const warnings = [];
   const tNum = temp ? parseFloat(temp) : null;
   const bpHNum = bpHigh ? parseInt(bpHigh, 10) : null;
   const bpLNum = bpLow ? parseInt(bpLow, 10) : null;
   const spNum = spo2 ? parseInt(spo2, 10) : null;
   const pNum = pulse ? parseInt(pulse, 10) : null;

   if (tNum !== null && res.temp_max && tNum > res.temp_max) {
     warnings.push(`体温が個別上限(${res.temp_max}℃)を超えています (測定値: ${tNum}℃)`);
   }
   if (bpHNum !== null && res.bp_high_max && bpHNum > res.bp_high_max) {
     warnings.push(`最高血圧が個別上限(${res.bp_high_max}mmHg)を超えています (測定値: ${bpHNum}mmHg)`);
   }
   if (bpHNum !== null && res.bp_high_min && bpHNum < res.bp_high_min) {
     warnings.push(`最高血圧が個別下限(${res.bp_high_min}mmHg)を下回っています (測定値: ${bpHNum}mmHg)`);
   }
   if (spNum !== null && res.spo2_min && spNum < res.spo2_min) {
     warnings.push(`SpO2が個別下限(${res.spo2_min}%)を下回っています (測定値: ${spNum}%)`);
   }
   if (pNum !== null && res.pulse_max && pNum > res.pulse_max) {
     warnings.push(`脈拍が個別上限(${res.pulse_max}bpm)を超えています (測定値: ${pNum}bpm)`);
   }
   if (pNum !== null && res.pulse_min && pNum < res.pulse_min) {
     warnings.push(`脈拍が個別下限(${res.pulse_min}bpm)を下回っています (測定値: ${pNum}bpm)`);
   }

   if (warnings.length > 0) {
     const msg = `【個別注意基準値の警告】\n${res.name} 様\n\n` + warnings.join("\n") + "\n\nこのまま登録しますか？";
     if (!confirm(msg)) return;
   }
 }

 const staff = document.getElementById("currentStaff").value;
 const now = new Date();
 const timeStr = now.toTimeString().slice(0, 5);

 db.data.vitals = db.data.vitals.filter(x => !(x.resident_id === resId && x.date === gState.selectedDate));
 db.data.vitals.push({
   id: Date.now(),
   resident_id: resId,
   date: gState.selectedDate,
   time: timeStr,
   temperature: temp ? parseFloat(temp) : null,
   bp_high: bpHigh ? parseInt(bpHigh, 10) : null,
   bp_low: bpLow ? parseInt(bpLow, 10) : null,
   pulse: pulse ? parseInt(pulse, 10) : null,
   spo2: spo2 ? parseInt(spo2, 10) : null,
   is_unusual: isUnusual,
   staff_name: staff
 });

 // 個人記録へ自動転記
 const parts = [];
 if (temp) parts.push(`体温 ${temp}℃`);
 if (bpHigh || bpLow) parts.push(`血圧 ${bpHigh || '-'}/${bpLow || '-'}`);
 if (pulse) parts.push(`脈拍 ${pulse}bpm`);
 if (spo2) parts.push(`SpO2 ${spo2}%`);
 if (isUnusual) parts.push(`【特変あり】`);

 db.data.care_records.unshift({
   id: Date.now() + 1,
   recorded_at: `${gState.selectedDate} ${timeStr}`,
   resident_id: resId,
   category: "バイタル",
   content: parts.join(", "),
   staff_name: staff
 });

 // 特変の場合は連絡帳・申し送りへも自動転記
 if (isUnusual) {
   db.data.notebooks.unshift({
     id: Date.now() + 2,
     date: gState.selectedDate,
     category: "特変・バイタル異常",
     priority: "重要",
     status: "未対応",
     content: `【バイタル特変】${res ? res.name : ''} 様: ${parts.join(', ')}`,
     staff_name: staff
   });
 }

 db.save();
 loadDateRecords(gState.selectedDate);
 alert(`${res ? res.name : '利用者'}様のバイタルを登録しました！`);
}
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
 <select id="mType_${r.id}" class="form-control" style="width:95px;">
  <option value="朝">朝食</option>
  <option value="昼">昼食</option>
  <option value="夕">夕食</option>
  <option value="おやつ">おやつ</option>
  <option value="その他">その他</option>
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
 return `<span style="display:inline-block; padding:4px 8px; font-size:12px; font-weight:bold; color:#15803d; background:#dcfce7; border-radius:4px; border:1px solid #86efac;"> 済 (${done.staff_name || '済'})</span>`;
 }
 return `<button class="btn btn-secondary" style="padding:4px 8px; font-size:12px;" onclick="saveOralCare(${r.id}, '${timing}')">${timing} 食後 </button>`;
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
function setMedTimingFilter(slot) {
 gState.medTimingFilter = slot;
 renderMedTable();
}

function renderMedTable() {
 const tbody = document.querySelector("#medTable tbody");
 if (!tbody) return;
 tbody.innerHTML = "";
 const theadRow = document.getElementById("medTableHeaderRow");
 const filter = gState.medTimingFilter || "all";

 // テーブルヘッダーの動的切り替え
 if (theadRow) {
 if (filter === "all") {
 theadRow.innerHTML = `
 <th>居室</th>
 <th>氏名</th>
 <th>朝食後</th>
 <th>昼食後</th>
 <th>夕食後</th>
 <th>就寝前</th>
 <th>点眼 (眼指定・指示内容・時間帯別実施)</th>
 `;
 } else {
 const slotLabel = filter === "朝" ? "朝食後" : (filter === "昼" ? "昼食後" : (filter === "夕" ? "夕食後" : "就寝前"));
 theadRow.innerHTML = `
 <th>居室</th>
 <th>氏名</th>
 <th>${slotLabel} (内服薬)</th>
 <th>点眼 [${filter}] (眼指定・指示内容・実施)</th>
 `;
 }
 }

 // フィルターボタンのアクティブ表示切替
 const filterBtns = [
 { id: "btnMedFilterAll", key: "all" },
 { id: "btnMedFilterMorn", key: "朝" },
 { id: "btnMedFilterNoon", key: "昼" },
 { id: "btnMedFilterEve", key: "夕" },
 { id: "btnMedFilterBed", key: "眠前" }
 ];
 filterBtns.forEach(b => {
 const el = document.getElementById(b.id);
 if (el) {
 if (filter === b.key) {
 el.className = "btn btn-primary";
 } else {
 el.className = "btn btn-secondary";
 }
 }
 });

 const meds = (db.data.meds || []).filter(m => m.date === gState.selectedDate);
 const eyedropOrders = db.data.eyedrop_orders || [];

 gState.residents.forEach(r => {
 const tr = document.createElement("tr");

 // 内服薬ボタン生成
 const getOralMedBtn = (slot, label) => {
 const done = meds.find(m => m.resident_id === r.id && m.slot === slot);
 if (done) {
 return `<button class="btn" style="background:#dcfce7; color:#15803d; border:1px solid #86efac; font-weight:bold; font-size:11px; padding:3px 8px;" onclick="toggleMed(${r.id}, '${slot}')" title="クリックで解除">済 (${done.staff_name || '済'})</button>`;
 }
 return `<button class="btn btn-secondary" style="padding:4px 8px; font-size:12px;" onclick="saveMed(${r.id}, '${slot}')">${label}</button>`;
 };

 // 点眼欄生成 (絵ではなく「右のみ」「左のみ」「両眼」を高コントラストバッジ明示、時間帯別切り替え対応)
 const order = eyedropOrders.find(e => e.resident_id === r.id && e.status !== "終了");
 let eyedropCellHtml = "";

 if (!order || order.eye === "指示なし") {
 eyedropCellHtml = `
 <div style="display:flex; justify-content:space-between; align-items:center;">
 <span style="color:#94a3b8; font-size:12px;">指示なし</span>
 <button class="btn btn-secondary" style="font-size:11px; padding:2px 6px;" onclick="openEyedropOrderModal(${r.id})">指示追加</button>
 </div>
 `;
 } else {
 const eyeBadge = order.eye === "右のみ"
 ? `<span class="badge" style="background:#1e3a8a; color:#ffffff; font-weight:bold; font-size:11px; padding:2px 6px;">[右のみ]</span>`
 : (order.eye === "左のみ"
 ? `<span class="badge" style="background:#065f46; color:#ffffff; font-weight:bold; font-size:11px; padding:2px 6px;">[左のみ]</span>`
 : `<span class="badge" style="background:#334155; color:#ffffff; font-weight:bold; font-size:11px; padding:2px 6px;">[両眼]</span>`);

 const medTitle = `<span style="font-weight:bold; font-size:12px; margin-left:4px; color:#0f172a;">${escapeHtml(order.medicine_name)}</span>`;

 if (filter === "all") {
 // すべて表示時: 指示されている時間帯のボタンを並べて表示
 const targetSlots = order.timing_slots && order.timing_slots.length > 0 ? order.timing_slots : ["眠前"];
 const slotButtonsHtml = targetSlots.map(slot => {
 const done = meds.find(m => m.resident_id === r.id && (m.slot === `点眼(${slot})` || m.slot === `点眼_${slot}` || (m.slot === "点眼" && slot === "眠前")));
 if (done) {
 return `<button class="btn" style="background:#dcfce7; color:#15803d; border:1px solid #86efac; font-weight:bold; font-size:11px; padding:2px 6px; margin:2px;" onclick="toggleEyedrop(${r.id}, '${slot}')" title="クリックで解除">済 ${slot} (${done.staff_name || '済'})</button>`;
 }
 return `<button class="btn btn-outline" style="border-color:#2563eb; color:#1d4ed8; font-size:11px; padding:2px 6px; margin:2px;" onclick="toggleEyedrop(${r.id}, '${slot}')">未 ${slot}</button>`;
 }).join("");

 eyedropCellHtml = `
 <div>
 <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:3px;">
 <div>${eyeBadge} ${medTitle}</div>
 <button class="btn btn-secondary" style="font-size:11px; padding:2px 6px;" onclick="openEyedropOrderModal(${r.id})" title="点眼処方指示を変更">変更</button>
 </div>
 <div style="display:flex; gap:2px; flex-wrap:wrap; align-items:center;">
 <span style="font-size:11px; color:#64748b; margin-right:2px;">実施:</span>
 ${slotButtonsHtml}
 </div>
 </div>
 `;
 } else {
 // 特定の時間帯フィルター時 (朝・昼・夕・眠前)
 const isTargetSlot = order.timing_slots && order.timing_slots.includes(filter);
 if (isTargetSlot) {
 const done = meds.find(m => m.resident_id === r.id && (m.slot === `点眼(${filter})` || m.slot === `点眼_${filter}` || (m.slot === "点眼" && filter === "眠前")));
 const actionBtn = done
 ? `<button class="btn" style="background:#dcfce7; color:#15803d; border:1px solid #86efac; font-weight:bold; font-size:11px; padding:3px 8px;" onclick="toggleEyedrop(${r.id}, '${filter}')" title="クリックで解除">済 [${filter}] (${done.staff_name || '済'})</button>`
 : `<button class="btn btn-primary" style="font-size:11px; padding:3px 8px;" onclick="toggleEyedrop(${r.id}, '${filter}')">未 [${filter}] 実施する</button>`;

 eyedropCellHtml = `
 <div style="display:flex; justify-content:space-between; align-items:center;">
 <div>${eyeBadge} ${medTitle}</div>
 <div style="display:flex; align-items:center; gap:4px;">
 ${actionBtn}
 <button class="btn btn-secondary" style="font-size:11px; padding:2px 6px;" onclick="openEyedropOrderModal(${r.id})" title="点眼処方指示を変更">変更</button>
 </div>
 </div>
 `;
 } else {
 eyedropCellHtml = `
 <div style="display:flex; justify-content:space-between; align-items:center;">
 <span style="color:#64748b; font-size:12px;">この時間帯の指示なし (${order.eye} ${order.timing_slots.join('・')})</span>
 <button class="btn btn-secondary" style="font-size:11px; padding:2px 6px;" onclick="openEyedropOrderModal(${r.id})" title="点眼処方指示を変更">変更</button>
 </div>
 `;
 }
 }
 }

 if (filter === "all") {
 tr.innerHTML = `
 <td>${r.room_no}</td>
 <td><strong>${r.name} 様</strong></td>
 <td>${getOralMedBtn("朝", "朝食後")}</td>
 <td>${getOralMedBtn("昼", "昼食後")}</td>
 <td>${getOralMedBtn("夕", "夕食後")}</td>
 <td>${getOralMedBtn("眠前", "眠前")}</td>
 <td>${eyedropCellHtml}</td>
 `;
 } else {
 const slotLabel = filter === "朝" ? "朝食後" : (filter === "昼" ? "昼食後" : (filter === "夕" ? "夕食後" : "就寝前"));
 tr.innerHTML = `
 <td>${r.room_no}</td>
 <td><strong>${r.name} 様</strong></td>
 <td>${getOralMedBtn(filter, slotLabel)}</td>
 <td>${eyedropCellHtml}</td>
 `;
 }

 tbody.appendChild(tr);
 });
}

function saveMed(resId, slot) {
 const r = gState.residents.find(x => x.id === resId);
 const exists = (db.data.meds || []).some(m => m.date === gState.selectedDate && m.resident_id === resId && m.slot === slot);
 if (exists) {
 alert(`この方の【${slot}】の服薬はすでに完了記録があります。`);
 return;
 }

 const staff = document.getElementById("currentStaff").value;
 db.data.meds.push({
 id: Date.now(), date: gState.selectedDate, slot: slot, resident_id: resId, status: "済", staff_name: staff
 });
 db.save();
 renderMedTable();
 loadDateRecords(gState.selectedDate);
 alert(`${r ? r.name : '利用者'}様の【${slot}】服薬完了を記録しました！`);
}

function toggleMed(resId, slot) {
 const r = gState.residents.find(x => x.id === resId);
 const idx = (db.data.meds || []).findIndex(m => m.date === gState.selectedDate && m.resident_id === resId && m.slot === slot);
 if (idx >= 0) {
 if (confirm(`${r ? r.name : '利用者'}様の【${slot}】服薬記録を取り消しますか？`)) {
 db.data.meds.splice(idx, 1);
 db.save();
 renderMedTable();
 loadDateRecords(gState.selectedDate);
 }
 return;
 }
 saveMed(resId, slot);
}

function toggleEyedrop(resId, slot) {
 const r = gState.residents.find(x => x.id === resId);
 const staff = document.getElementById("currentStaff")?.value || "職員";
 const meds = db.data.meds || [];
 const targetSlotKey = `点眼(${slot})`;
 const altKey = `点眼_${slot}`;
 const idx = meds.findIndex(m => m.date === gState.selectedDate && m.resident_id === resId && (m.slot === targetSlotKey || m.slot === altKey || (m.slot === "点眼" && slot === "眠前")));

 if (idx >= 0) {
 if (confirm(`${r ? r.name : '利用者'}様の【${slot}】点眼実施記録を取り消しますか？`)) {
 db.data.meds.splice(idx, 1);
 db.save();
 renderMedTable();
 loadDateRecords(gState.selectedDate);
 }
 return;
 }

 const order = (db.data.eyedrop_orders || []).find(e => e.resident_id === resId);
 const eyeSide = order ? order.eye : "指示";
 const medName = order ? order.medicine_name : "点眼薬";

 db.data.meds.push({
 id: Date.now(),
 date: gState.selectedDate,
 slot: targetSlotKey,
 resident_id: resId,
 status: "済",
 staff_name: staff,
 eye: eyeSide,
 medicine_name: medName
 });
 db.save();
 renderMedTable();
 loadDateRecords(gState.selectedDate);
 alert(`${r ? r.name : '利用者'}様の【${slot}】点眼 (${eyeSide}・${medName}) 完了を記録しました！`);
}

// 点眼指示モーダル制御
function openEyedropOrderModal(residentId) {
 const modal = document.getElementById("eyedropOrderModal");
 if (!modal) return;

 const resSelect = document.getElementById("eoResidentSelect");
 if (resSelect) {
 resSelect.innerHTML = gState.residents.map(r => `
 <option value="${r.id}" ${r.id === (residentId || gState.selectedResidentId) ? 'selected' : ''}>${r.room_no}号室: ${r.name} 様</option>
 `).join("");
 }

 const targetId = residentId || (resSelect ? parseInt(resSelect.value, 10) : gState.selectedResidentId);
 loadEyedropOrderFormData(targetId);

 modal.style.display = "flex";
}

function onEyedropResidentChange() {
 const sel = document.getElementById("eoResidentSelect");
 if (sel) {
 loadEyedropOrderFormData(parseInt(sel.value, 10));
 }
}

function loadEyedropOrderFormData(resId) {
 const order = (db.data.eyedrop_orders || []).find(e => e.resident_id === resId) || {};

 const eye = order.eye || "右のみ";
 const rRight = document.getElementById("eoEyeRight");
 const rLeft = document.getElementById("eoEyeLeft");
 const rBoth = document.getElementById("eoEyeBoth");
 const rNone = document.getElementById("eoEyeNone");
 if (rRight) rRight.checked = (eye === "右のみ");
 if (rLeft) rLeft.checked = (eye === "左のみ");
 if (rBoth) rBoth.checked = (eye === "両眼");
 if (rNone) rNone.checked = (eye === "指示なし");

 const medEl = document.getElementById("eoMedicineName");
 if (medEl) medEl.value = order.medicine_name || "";

 const slots = order.timing_slots || [];
 const cbMorn = document.getElementById("eoSlotMorning");
 const cbNoon = document.getElementById("eoSlotNoon");
 const cbEve = document.getElementById("eoSlotEvening");
 const cbBed = document.getElementById("eoSlotBed");
 if (cbMorn) cbMorn.checked = slots.includes("朝");
 if (cbNoon) cbNoon.checked = slots.includes("昼");
 if (cbEve) cbEve.checked = slots.includes("夕");
 if (cbBed) cbBed.checked = slots.includes("眠前");

 const doseEl = document.getElementById("eoDosage");
 if (doseEl) doseEl.value = order.dosage || "1回1滴";
 const docEl = document.getElementById("eoDoctor");
 if (docEl) docEl.value = order.doctor_name || "眼科クリニック";
 const noteEl = document.getElementById("eoNotes");
 if (noteEl) noteEl.value = order.notes || "";
 const stEl = document.getElementById("eoStatus");
 if (stEl) stEl.value = order.status || "継続中";
}

function quickFillEyedropMed(medName) {
 const el = document.getElementById("eoMedicineName");
 if (el) el.value = medName;
}

function submitEyedropOrder() {
 const sel = document.getElementById("eoResidentSelect");
 if (!sel) return;
 const resId = parseInt(sel.value, 10);
 const r = gState.residents.find(x => x.id === resId);

 let eyeSide = "右のみ";
 if (document.getElementById("eoEyeLeft")?.checked) eyeSide = "左のみ";
 else if (document.getElementById("eoEyeBoth")?.checked) eyeSide = "両眼";
 else if (document.getElementById("eoEyeNone")?.checked) eyeSide = "指示なし";

 const medName = document.getElementById("eoMedicineName")?.value.trim() || "";
 if (eyeSide !== "指示なし" && !medName) {
 alert("点眼薬の薬品名を入力してください（または『指示なし』を選択してください）。");
 return;
 }

 const timingSlots = [];
 if (document.getElementById("eoSlotMorning")?.checked) timingSlots.push("朝");
 if (document.getElementById("eoSlotNoon")?.checked) timingSlots.push("昼");
 if (document.getElementById("eoSlotEvening")?.checked) timingSlots.push("夕");
 if (document.getElementById("eoSlotBed")?.checked) timingSlots.push("眠前");

 if (eyeSide !== "指示なし" && timingSlots.length === 0) {
 alert("投与する時間帯（朝・昼・夕・就寝前）を1つ以上選択してください。");
 return;
 }

 const dosage = document.getElementById("eoDosage")?.value.trim() || "1回1滴";
 const doctor = document.getElementById("eoDoctor")?.value.trim() || "";
 const notes = document.getElementById("eoNotes")?.value.trim() || "";
 const status = document.getElementById("eoStatus")?.value || "継続中";

 if (!db.data.eyedrop_orders) db.data.eyedrop_orders = [];
 const existingIdx = db.data.eyedrop_orders.findIndex(e => e.resident_id === resId);

 const newOrder = {
 id: existingIdx >= 0 ? db.data.eyedrop_orders[existingIdx].id : Date.now(),
 resident_id: resId,
 eye: eyeSide,
 medicine_name: medName,
 timing_slots: timingSlots,
 dosage: dosage,
 doctor_name: doctor,
 notes: notes,
 status: status,
 updated_at: new Date().toISOString().split("T")[0]
 };

 if (existingIdx >= 0) {
 db.data.eyedrop_orders[existingIdx] = newOrder;
 } else {
 db.data.eyedrop_orders.push(newOrder);
 }

 db.save();
 closeModal("eyedropOrderModal");
 renderMedTable();
 if (typeof renderResidentDetail === "function" && gState.selectedResidentId === resId) {
 renderResidentDetail();
 }
 alert(`${r ? r.name : '利用者'}様の点眼指示（${eyeSide}・${medName || '指示なし'}）を保存しました！`);
}

function deleteEyedropOrder() {
 const sel = document.getElementById("eoResidentSelect");
 if (!sel) return;
 const resId = parseInt(sel.value, 10);
 const r = gState.residents.find(x => x.id === resId);

 if (!confirm(`${r ? r.name : '利用者'}様の点眼指示を解除（指示なし）にしますか？`)) return;

 if (db.data.eyedrop_orders) {
 db.data.eyedrop_orders = db.data.eyedrop_orders.filter(e => e.resident_id !== resId);
 db.save();
 }
 closeModal("eyedropOrderModal");
 renderMedTable();
 if (typeof renderResidentDetail === "function" && gState.selectedResidentId === resId) {
 renderResidentDetail();
 }
 alert(`${r ? r.name : '利用者'}様の点眼指示を解除しました。`);
}

// 7. 夜勤体位変換 トグル解除 ＆ 一括確定 (個人記録自動転記)
gState.nightTurnDate = null;
gState.nightTurnDrafts = null;

function initNightTurnDrafts(force) {
 if (!force && gState.nightTurnDate === gState.selectedDate && gState.nightTurnDrafts !== null) {
 return;
 }
 gState.nightTurnDate = gState.selectedDate;
 gState.nightTurnDrafts = {};
 const turns = (db.data.turns || []).filter(t => t.date === gState.selectedDate);
 turns.forEach(t => {
 gState.nightTurnDrafts[`${t.resident_id}_${t.time}`] = t.action;
 });
}

function setNightTurnAction(resId, time, action) {
 const key = `${resId}_${time}`;
 if (!gState.nightTurnDrafts) gState.nightTurnDrafts = {};
 if (!action) {
 delete gState.nightTurnDrafts[key];
 if (db.data.turns) {
 db.data.turns = db.data.turns.filter(t => !(t.resident_id === resId && t.date === gState.selectedDate && t.time === time));
 db.save();
 }
 } else {
 gState.nightTurnDrafts[key] = action;
 }
 renderNightTable();
}

function toggleNightTurnAction(resId, time) {
 const key = `${resId}_${time}`;
 if (gState.nightTurnDrafts) {
 delete gState.nightTurnDrafts[key];
 }
 // 確定済みのデータからも即座に削除・永続保存（解除したものが復活するのを完全防止）
 if (db.data.turns) {
 db.data.turns = db.data.turns.filter(t => !(t.resident_id === resId && t.date === gState.selectedDate && t.time === time));
 db.save();
 }
 renderNightTable();
}

function clearAllNightTurnsForDate() {
 if (!confirm(`${gState.selectedDate} の夜間体位変換・巡視チェックを全て解除しますか？`)) return;
 gState.nightTurnDrafts = {};
 if (db.data.turns) {
 db.data.turns = db.data.turns.filter(t => t.date !== gState.selectedDate);
 db.save();
 }
 renderNightTable();
 alert(`${gState.selectedDate} の体位変換チェックをすべて解除しました。`);
}

function submitNightTurnsBatch() {
 const staff = document.getElementById("currentStaff").value;
 const turns = db.data.turns || [];
 db.data.turns = turns.filter(t => t.date !== gState.selectedDate);

 const resActionsMap = {};

 if (gState.nightTurnDrafts) {
 Object.keys(gState.nightTurnDrafts).forEach(key => {
 const parts = key.split("_");
 const resId = parseInt(parts[0], 10);
 const time = parts[1];
 const action = gState.nightTurnDrafts[key];
 if (action) {
 db.data.turns.push({
 id: Date.now() + Math.floor(Math.random() * 1000),
 date: gState.selectedDate,
 time: time,
 resident_id: resId,
 action: action,
 staff_name: staff
 });
 if (!resActionsMap[resId]) resActionsMap[resId] = [];
 resActionsMap[resId].push({ time: time, action: action });
 }
 });
 }

 const timeOrder = ["22:00", "00:00", "02:00", "04:00", "06:00"];
 let totalRecordsCreated = 0;

 Object.keys(resActionsMap).forEach(resIdStr => {
 const resId = parseInt(resIdStr, 10);
 const r = gState.residents.find(x => x.id === resId);
 if (!r || r.status !== "在所") {
 // 安全ガード: 入院中・不在の利用者は巡視記録の自動生成から完全除外
 return;
 }
 const actionsList = resActionsMap[resId];
 if (!actionsList || actionsList.length === 0) return;

 // 前回の自動生成レコード（定時巡視・夜間巡視）を削除して最新状態に更新
 db.data.care_records = (db.data.care_records || []).filter(rec => !(
 rec.resident_id === resId &&
 rec.category === "巡視" &&
 rec.recorded_at.startsWith(gState.selectedDate) &&
 // [Claude修正] 定型文を施設独自の文に変えると旧判定 (本文の文字一致) に掛からず、
 // 保存し直すたびに巡視記録が重複していた。自動生成フラグでも判定する。
 (rec.auto_night_turn === true || rec.content.includes("定時巡視") || rec.content.includes("夜間巡視・体位変換") || rec.content.includes("夜間巡視:"))
 ));

 // 時間順にソート (22:00 -> 00:00 -> 02:00 -> 04:00 -> 06:00)
 actionsList.sort((a, b) => {
 const idxA = timeOrder.indexOf(a.time);
 const idxB = timeOrder.indexOf(b.time);
 return (idxA >= 0 ? idxA : 99) - (idxB >= 0 ? idxB : 99);
 });

 const tpls = getNightTurnTemplates();

 // 巡視した時間すべてについて、設定された定型文に基づき個別に介護記録を作成
 actionsList.forEach((item, index) => {
 const tpl = tpls[item.action] || DEFAULT_NIGHT_TURN_TEMPLATES[item.action] || `【{time} 定時巡視・体位変換】訪室確認。${item.action}実施。全身状態・呼吸安定、安眠。`;
 const contentText = tpl.replace(/\{time\}/g, item.time).replace(/\{action\}/g, item.action);

 db.data.care_records.unshift({
 id: Date.now() + Math.floor(Math.random() * 100000) + index,
 recorded_at: `${gState.selectedDate} ${item.time}`,
 resident_id: resId,
 category: "巡視",
 content: contentText,
 staff_name: staff,
 auto_night_turn: true
 });
 totalRecordsCreated++;
 });
 });

 db.save();
 renderNightTable();
 loadDateRecords(gState.selectedDate);
 if (totalRecordsCreated > 0) {
 alert(`体位変換・夜間巡視のチェック入力分（計${totalRecordsCreated}回）を保存・カルテへ転記しました！`);
 } else {
 alert("体位変換・夜間巡視のチェック解除状態を確定・保存しました。");
 }
}

function renderNightTable() {
 const tbody = document.querySelector("#nightTable tbody");
 if (!tbody) return;
 tbody.innerHTML = "";
 if (gState.nightTurnDate !== gState.selectedDate || gState.nightTurnDrafts === null) {
 initNightTurnDrafts();
 }

 const times = ["22:00", "00:00", "02:00", "04:00", "06:00"];

 gState.residents.forEach(r => {
 const isHospital = r.status === "入院中" || r.status === "ショート終了" || r.status !== "在所";
 const tr = document.createElement("tr");

 if (isHospital) {
 tr.style.background = "#f8fafc";
 tr.style.opacity = "0.7";
 const cells = times.map(() => `<td style="text-align:center; color:#94a3b8; font-size:11px;">(対象外)</td>`).join("");
 tr.innerHTML = `
 <td>${r.room_no}</td>
 <td><strong>${escapeHtml(r.name)} 様</strong> <span class="badge" style="background:#64748b; color:#fff; font-size:10px; margin-left:4px;">${escapeHtml(r.status)}</span></td>
 ${cells}
 `;
 tbody.appendChild(tr);
 return;
 }

 const cells = times.map(tm => {
 const key = `${r.id}_${tm}`;
 const curAction = gState.nightTurnDrafts[key];
 if (curAction) {
 return `
 <td style="text-align:center;">
 <button class="btn btn-secondary" style="background:#dcfce7; color:#15803d; border:1px solid #86efac; font-weight:bold; font-size:11px; padding:3px 6px;" onclick="toggleNightTurnAction(${r.id}, '${tm}')" title="クリックで解除">
 ${curAction} 
 </button>
 </td>
 `;
 }
 return `
 <td>
 <select class="form-control" style="font-size:11px; padding:2px;" onchange="setNightTurnAction(${r.id}, '${tm}', this.value)">
 <option value="">選択</option>
 <option value="安眠中">安眠中</option>
 <option value="左側臥位">左側臥位</option>
 <option value="右側臥位">右側臥位</option>
 <option value="仰臥位">仰臥位</option>
 <option value="おむつ交換">おむつ交換</option>
 </select>
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

 gState.residents.forEach(r => {
 const currentRec = records.filter(w => w.resident_id === r.id && (w.month === gState.currentMonth || (w.date && w.date.startsWith(gState.currentMonth)))).sort((a,b) => b.id - a.id)[0];
 const prevRec = records.filter(w => w.resident_id === r.id && (w.month === prevMonth || (w.date && w.date.startsWith(prevMonth)))).sort((a,b) => b.id - a.id)[0];
 const prev2Rec = records.filter(w => w.resident_id === r.id && (w.month === prev2Month || (w.date && w.date.startsWith(prev2Month)))).sort((a,b) => b.id - a.id)[0];

 // 前月比
 let diffDisplay = "-";
 if (currentRec && prevRec) {
 const diff = (currentRec.weight - prevRec.weight).toFixed(1);
 const diffNum = parseFloat(diff);
 const diffStr = diffNum > 0 ? `+${diff} kg` : (diffNum < 0 ? `${diff} kg` : `±0.0 kg`);
 const color = diffNum > 0 ? '#16a34a' : (diffNum < 0 ? '#dc2626' : '#64748b');
 diffDisplay = `<strong style="color:${color}; font-size:13px;">${diffStr}</strong> <span style="font-size:11px; color:var(--text-muted);">(${prevRec.weight}k)</span>`;
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
 const color2 = diff2Num > 0 ? '#16a34a' : (diff2Num < 0 ? '#dc2626' : '#64748b');
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
 <td><input type="number" step="0.1" class="form-control" style="width:90px;" id="wVal_${r.id}" value="${currentVal}" placeholder="52.4"></td>
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
 const resButtons = gState.residents.map(r => `
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
 <line x1="${padL}" y1="${yPos}" x2="${svgW - padR}" y2="${yPos}" stroke="#e2e8f0" stroke-dasharray="3,3" />
 <text x="${padL - 8}" y="${yPos + 4}" font-size="11" fill="#64748b" text-anchor="end">${val}kg</text>
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
 monthLabelsHtml += `<text x="${xPos}" y="${svgH - padB + 18}" font-size="11" fill="#475569" text-anchor="middle">${shortM}</text>`;

 if (pt.weight !== null) {
 const yPos = padT + graphH - ((pt.weight - minW) / range) * graphH;
 if (!pathD) {
 pathD = `M ${xPos} ${yPos}`;
 } else {
 pathD += ` L ${xPos} ${yPos}`;
 }
 dotsHtml += `
 <circle cx="${xPos}" cy="${yPos}" r="5" fill="#2563eb" stroke="#ffffff" stroke-width="2" />
 <text x="${xPos}" y="${yPos - 9}" font-size="11" font-weight="bold" fill="#1e3a8a" text-anchor="middle">${pt.weight}kg</text>
 `;
 }
 });

 container.innerHTML = `
 <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
 <div style="font-weight:bold; font-size:14px; color:#1e3a8a;">
 過去1年間の体重推移グラフ (${targetRes ? `${targetRes.name} 様` : ''})
 </div>
 <div style="display:flex; gap:6px; flex-wrap:wrap;">
 ${resButtons}
 </div>
 </div>
 <div style="overflow-x:auto;">
 <svg viewBox="0 0 ${svgW} ${svgH}" style="width:100%; max-width:${svgW}px; height:auto; background:#f8fafc; border-radius:6px; display:block;">
 ${gridLines}
 ${pathD ? `<path d="${pathD}" fill="none" stroke="#2563eb" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />` : ''}
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
   gState.residents.forEach(res => {
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
 const linens = (db.data.linens || []).filter(l => l.date === gState.selectedDate);

 if (linens.length === 0) {
   tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:16px;">本日のシーツ・リネン交換記録はありません。上のボタンから記録できます。</td></tr>`;
   return;
 }

 linens.forEach(l => {
   const res = gState.residents.find(x => x.id === l.resident_id);
   const tr = document.createElement("tr");
   tr.innerHTML = `
     <td>${l.date}</td>
     <td><strong>${res ? res.room_no + '号室 ' + res.name + ' 様' : '-'}</strong></td>
     <td><span style="font-weight:bold; color:#0284c7; background:#e0f2fe; padding:2px 8px; border-radius:4px;">${l.exchange_type}</span></td>
     <td>${l.notes || '-'}</td>
     <td>${l.staff_name || '-'}</td>
     <td style="text-align:center;">
       <button type="button" class="btn btn-secondary" style="font-size:11px; padding:2px 8px; color:#dc2626; border-color:#fca5a5;" onclick="deleteLinenRecord(${l.id})">取消</button>
     </td>
   `;
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

 if (!confirm(`【確認】\n${resName}のシーツ交換記録（${target.exchange_type}）を取り消しますか？\n連動した介護記録も削除されます。`)) {
   return;
 }

 // シーツ記録を削除
 db.data.linens = (db.data.linens || []).filter(l => l.id !== linenId);

 // 連動する介護記録を削除
 db.data.care_records = (db.data.care_records || []).filter(c => c.source_linen_id !== linenId && c.id !== (linenId + 1));

 db.save();
 loadDateRecords(gState.selectedDate);
 alert(`${resName}のシーツ交換記録を取り消しました。`);
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

function submitGroomingsBatch() {
 const staff = document.getElementById("currentStaff").value;
 const nowTm = new Date().toTimeString().slice(0, 5);
 let savedCount = 0;

 gState.residents.forEach(r => {
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
 existing.nail_done = nail;
 existing.shave_done = shave;
 existing.ear_done = ear;
 existing.notes = notes;
 existing.staff_name = staff;
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

// 13. 連絡帳 ＆ 【認】名前スタンプ ＆ 月間業務連絡表 (完全分離)
function renderNotebook() {
 renderMonthlyNotices();

 const list = document.getElementById("notebookList");
 if (!list) return;
 list.innerHTML = "";
 const notebooks = (db.data.notebooks || []).filter(nb => nb.date === gState.selectedDate);

 if (notebooks.length === 0) {
 list.innerHTML = '<p style="font-size:13px; color:var(--text-muted);">本日の引継ぎ・申し送り事項はありません。</p>';
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
 ${nb.status === '未対応' ? ' 未対応' : ' 完了'}
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
 stampBtn.textContent = `↩ ［${currentStaff}］の確認を取り消す`;
 stampBtn.className = "btn btn-secondary";
 stampBtn.style.color = "#dc2626";
 } else {
 stampBtn.textContent = " 確認済みにする";
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

// 月間業務連絡表 (全館・当月1ヶ月間継続掲示・変更事項等)
function renderMonthlyNotices() {
 const container = document.getElementById("monthlyNoticeList");
 const alertArea = document.getElementById("monthlyNoticeAlertArea");
 if (!container) return;
 container.innerHTML = "";
 if (alertArea) alertArea.innerHTML = "";

 const curMonth = (gState.selectedDate || new Date().toISOString().split("T")[0]).slice(0, 7);
 const notices = (db.data.monthly_notices || []).filter(n => n.month === curMonth);
 const currentStaff = (document.getElementById("currentStaff") ? document.getElementById("currentStaff").value : "") || "";

 // 未確認アラート表示
 if (currentStaff && notices.length > 0) {
 const unconfirmed = notices.filter(n => !(n.confirmed_staff || []).includes(currentStaff));
 if (unconfirmed.length > 0 && alertArea) {
 alertArea.innerHTML = `
 <div style="background:#fee2e2; border:1px solid #fecaca; border-radius:6px; padding:10px 14px; margin-bottom:12px; color:#991b1b; font-size:13px; font-weight:bold;">
  ${escapeHtml(currentStaff)} さん、${curMonth.split("-")[1]}月分の未確認業務連絡が <strong>${unconfirmed.length}件</strong> あります。各項目の「 確認済にする」を押してください。
 </div>
 `;
 }
 }

 if (notices.length === 0) {
 container.innerHTML = `<p style="font-size:13px; color:var(--text-muted); margin:8px 0;">${curMonth}月の業務連絡はありません。「＋ 業務連絡を追加」から追加できます。</p>`;
 return;
 }

 notices.forEach(n => {
 const isConfirmedByMe = currentStaff && (n.confirmed_staff || []).includes(currentStaff);
 let prioStyle = "background:#f1f5f9; color:#475569;";
 if (n.priority === "至急") prioStyle = "background:#fee2e2; color:#991b1b; font-weight:bold;";
 else if (n.priority === "重要") prioStyle = "background:#fef3c7; color:#92400e; font-weight:bold;";

 const confirmedListStr = (n.confirmed_staff || []).length > 0
 ? (n.confirmed_staff || []).join("・")
 : "未確認";

 const card = document.createElement("div");
 card.style.background = isConfirmedByMe ? "#f8fafc" : "#ffffff";
 card.style.border = isConfirmedByMe ? "1px solid #cbd5e1" : "2px solid #818cf8";
 card.style.borderRadius = "8px";
 card.style.padding = "12px 14px";
 card.style.marginBottom = "10px";
 card.style.boxShadow = isConfirmedByMe ? "none" : "0 2px 6px rgba(99,102,241,0.15)";

 card.innerHTML = `
 <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:8px;">
 <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
 <span style="font-size:11px; padding:2px 8px; border-radius:4px; ${prioStyle}">［${escapeHtml(n.priority || '通常')}］</span>
 <strong style="font-size:15px; color:#1e293b;">${escapeHtml(n.title)}</strong>
 </div>
 <div style="display:flex; gap:6px; align-items:center;">
 <span style="font-size:11px; color:#64748b;">投稿: ${escapeHtml(n.staff_name || '')} (${escapeHtml(n.created_at || '')})</span>
 <button class="btn btn-secondary" style="padding:2px 6px; font-size:11px; color:#dc2626; border-color:#fca5a5;" onclick="deleteMonthlyNotice(${n.id})">削除</button>
 </div>
 </div>
 <div style="font-size:13.5px; line-height:1.7; color:#334155; margin:8px 0; white-space:pre-wrap;">${escapeHtml(n.content)}</div>
 <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; border-top:1px dashed #e2e8f0; padding-top:8px; font-size:12px;">
 <div style="color:#64748b;">
 <strong>確認済職員:</strong> <span style="color:#166534; font-weight:bold;">${escapeHtml(confirmedListStr)}</span>
 </div>
 <div>
 ${isConfirmedByMe ? `
 <button class="btn btn-secondary" style="padding:3px 10px; font-size:12px; background:#dcfce7; color:#166534; border-color:#86efac;" onclick="confirmMonthlyNotice(${n.id})">
 確認済 (解除する)
 </button>
 ` : `
 <button class="btn btn-primary" style="padding:4px 14px; font-size:12px; font-weight:bold;" onclick="confirmMonthlyNotice(${n.id})">
 私が確認済みにする
 </button>
 `}
 </div>
 </div>
 `;
 container.appendChild(card);
 });
}

function openMonthlyNoticeModal() {
 const curMonth = (gState.selectedDate || new Date().toISOString().split("T")[0]).slice(0, 7);
 document.getElementById("noticeMonth").value = curMonth;
 document.getElementById("noticePriority").value = "重要";
 document.getElementById("noticeTitle").value = "";
 document.getElementById("noticeContent").value = "";
 document.getElementById("monthlyNoticeModal").style.display = "flex";
}

function submitMonthlyNotice() {
 const m = document.getElementById("noticeMonth").value;
 const prio = document.getElementById("noticePriority").value;
 const title = document.getElementById("noticeTitle").value.trim();
 const content = document.getElementById("noticeContent").value.trim();
 const staff = document.getElementById("currentStaff").value || "施設長";

 if (!m || !title || !content) {
 alert("対象月、件名、連絡内容は必須入力です。");
 return;
 }

 const now = new Date();
 const nowStr = `${now.toISOString().split("T")[0]} ${now.toTimeString().slice(0, 5)}`;

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

 const idx = notice.confirmed_staff.indexOf(currentStaff);
 if (idx !== -1) {
 notice.confirmed_staff.splice(idx, 1);
 } else {
 notice.confirmed_staff.push(currentStaff);
 }

 db.save();
 renderMonthlyNotices();
 checkGlobalAlerts();
}

function deleteMonthlyNotice(id) {
 if (!confirm("この月間業務連絡を削除してもよろしいですか？")) return;
 db.data.monthly_notices = (db.data.monthly_notices || []).filter(n => n.id !== id);
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
 sel.innerHTML = gState.residents.map(res => `
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
 <div style="font-weight:bold; font-size:14px; color:#1e293b;">${item.name}</div>
 <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">
 現在庫: <strong>${item.current_stock}</strong> ${item.unit} | 単価: ¥${(item.unit_price || 0).toLocaleString()}
 ${item.is_personal_billable ? '<span style="color:#0284c7; font-weight:bold;">[個人請求対象]</span>' : '<span style="color:#16a34a; font-weight:bold;">[施設負担]</span>'}
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
 renderResidentDetail();
 updateRecordTargetBanner();
 renderQuickConsume();
 }
}

function consumeItem(itemId, qty) {
 const item = gState.inventory.find(i => i.id === itemId);
 const res = gState.residents.find(r => r.id === gState.selectedResidentId);
 if (!item || !res) return;

 gPendingConsume = { itemId, qty, resId: res.id };

 const billNote = item.is_personal_billable
 ? `<div style="margin-top:8px; font-size:12px; color:#0284c7; background:#f0f9ff; padding:6px 10px; border-radius:4px;">※ 個人購入として月次請求明細に 1${item.unit} (¥${item.unit_price.toLocaleString()}) 自動計上されます。<br>（預かり金出納帳の残高からは引かれません）</div>`
 : `<div style="margin-top:8px; font-size:12px; color:#15803d; background:#f0fdf4; padding:6px 10px; border-radius:4px;">※ 施設負担備品として在庫から消費されます。</div>`;

 const msgEl = document.getElementById("confirmConsumeMsg");
 if (msgEl) {
 msgEl.innerHTML = `
 <strong style="font-size:16px; color:#1e3a8a;">${res.room_no}号室 ${res.name} 様</strong> に<br>
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
 const nowStr = `${now.toISOString().split("T")[0]} ${now.toTimeString().slice(0, 5)}`;

 if (item) {
 item.current_stock -= qty;

 if (item.is_personal_billable === 1) {
 db.data.consumptions.unshift({
 id: Date.now(),
 consumed_at: nowStr,
 resident_id: resId,
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
 resident_id: resId,
 resident_name: res ? res.name : "",
 staff_name: staff,
 reason: "現場ケア時使用"
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
 row.style.background = "#f8fafc";
 row.style.border = "1px solid #e2e8f0";
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
 renderShiftTable(gState.currentShiftMonth || "2026-10");
 renderOfficeVehicleLogs();
 renderOfficeFireDrills();
 renderOfficeCommittees();
 renderOfficeComplaints();
 renderOfficeIncidents();
 renderCareExpiryNotes();
}

function switchOfficeTab(tab) {
 if (tab === "backup" || tab === "staff_auth") {
 if (!isCurrentStaffAdminOrClerk()) {
 alert("このタブは管理者および事務員のみアクセス可能です。");
 switchOfficeTab("inventory");
 return;
 }
 }

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
 incidents: "tabOfficeIncidents",
 backup: "tabOfficeBackup", staff_auth: "tabOfficeStaffAuth"
 };

 Object.values(tabMap).forEach(id => {
 const el = document.getElementById(id);
 if (el) el.style.display = "none";
 });
 const target = document.getElementById(tabMap[tab]);
 if (target) {
 target.style.display = "block";
 if (tab === "shift") {
 renderShiftTable(gState.currentShiftMonth || "2026-10");
 } else if (tab === "backup") {
 renderOfficeBackup();
 } else if (tab === "staff_auth") {
 renderOfficeStaffAuth();
 }
 }
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
 <td>${isLow ? '<span style="color:#dc2626; font-weight:bold;"> 要発注</span>' : '<span style="color:#16a34a;">正常</span>'}</td>
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
 <td>${isClose ? `<strong style="color:#d97706;"> あと${diffDays}日 (順次消費推奨)</strong>` : '<span style="color:#16a34a;">正常保管</span>'}</td>
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
 <td>${l.key_returned ? ' 返却確認済' : '未返却'}</td>
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

// 法定委員会・研修記録
function renderOfficeCommittees() {
 const tbody = document.querySelector("#committeeTable tbody");
 if (!tbody) return;
 tbody.innerHTML = "";
 const list = db.data.committees || [];
 if (list.length === 0) {
 const tr = document.createElement("tr");
 tr.innerHTML = `<td colspan="7" style="text-align:center; color:#64748b; padding:20px;">登録された委員会・研修記録はありません。「+ 委員会・研修登録」から追加できます。</td>`;
 tbody.appendChild(tr);
 return;
 }

 list.forEach(c => {
 const tr = document.createElement("tr");
 const cat = c.category || "法定委員会";
 let catBadgeColor = "#2563eb";
 let catBgColor = "#dbeafe";
 if (cat === "施設内研修") {
 catBadgeColor = "#166534";
 catBgColor = "#dcfce7";
 } else if (cat === "外部研修") {
 catBadgeColor = "#7c2d12";
 catBgColor = "#ffedd5";
 } else if (cat === "その他業務項目") {
 catBadgeColor = "#4b5563";
 catBgColor = "#f3f4f6";
 }

 tr.innerHTML = `
 <td>${c.date || '-'}</td>
 <td><span class="badge" style="background:${catBgColor}; color:${catBadgeColor}; font-weight:bold;">${cat}</span></td>
 <td><strong>${c.committee_name || c.name || '-'}</strong></td>
 <td>${c.attendees || '-'}</td>
 <td>${c.agenda || '-'}</td>
 <td style="max-width:280px; white-space:pre-wrap; font-size:13px;">${c.content || '-'}</td>
 <td>
 <button class="btn btn-secondary" style="padding:3px 8px; font-size:12px; color:#dc2626;" onclick="deleteCommittee(${c.id})">削除</button>
 </td>
 `;
 tbody.appendChild(tr);
 });
}

function openCommitteeModal() {
 const today = new Date().toISOString().split("T")[0];
 const dateInput = document.getElementById("comDate");
 if (dateInput) dateInput.value = today;
 const nameInput = document.getElementById("comName");
 if (nameInput) nameInput.value = "";
 const attendeesInput = document.getElementById("comAttendees");
 if (attendeesInput) {
 const curStaff = document.getElementById("currentStaff")?.value || "";
 attendeesInput.value = curStaff;
 }
 const agendaInput = document.getElementById("comAgenda");
 if (agendaInput) agendaInput.value = "";
 const contentInput = document.getElementById("comContent");
 if (contentInput) contentInput.value = "";
 const catInput = document.getElementById("comCategory");
 if (catInput) catInput.value = "法定委員会";

 const modal = document.getElementById("committeeModal");
 if (modal) modal.style.display = "flex";
}

function submitCommittee() {
 const date = document.getElementById("comDate")?.value;
 const category = document.getElementById("comCategory")?.value || "法定委員会";
 const name = document.getElementById("comName")?.value?.trim();
 const attendees = document.getElementById("comAttendees")?.value?.trim() || "-";
 const agenda = document.getElementById("comAgenda")?.value?.trim() || "-";
 const content = document.getElementById("comContent")?.value?.trim();

 if (!date || !name || !content) {
 alert("開催日、委員会・研修名、および協議内容は必須項目です。");
 return;
 }

 if (!db.data.committees) db.data.committees = [];
 const newRecord = {
 id: Date.now(),
 date: date,
 category: category,
 committee_name: name,
 attendees: attendees,
 agenda: agenda,
 content: content,
 created_at: new Date().toISOString().replace("T", " ").slice(0, 16)
 };
 db.data.committees.unshift(newRecord);
 db.save();
 closeModal("committeeModal");
 renderOfficeCommittees();
 alert("法定委員会・研修記録を登録・保存しました！");
}

function deleteCommittee(id) {
 if (!confirm("この委員会・研修記録を削除してもよろしいですか？")) return;
 if (!db.data.committees) return;
 db.data.committees = db.data.committees.filter(c => c.id !== id);
 db.save();
 renderOfficeCommittees();
}

// 発注 ＆ 上司承認 (管理者のみ認証・閲覧制限)
function renderOfficeOrders() {
 const tbody = document.querySelector("#ordersTable tbody");
 if (!tbody) return;
 tbody.innerHTML = "";
 const isAdmin = isCurrentStaffAdmin();

 (db.data.orders || []).forEach(o => {
 const tr = document.createElement("tr");
 let badgeColor = "#fef3c7; color:#92400e;";
 if (o.status === "承認済") badgeColor = "#dbeafe; color:#1e40af;";
 if (o.status === "納品完了") badgeColor = "#dcfce7; color:#166534;";
 if (o.status === "差戻し") badgeColor = "#fee2e2; color:#991b1b;";

 let actionButtons = "";
 if (o.status === "申請中") {
 if (isAdmin) {
 actionButtons = `
 <button class="btn btn-primary" style="padding:4px 8px; font-size:12px;" onclick="approveOrder(${o.id}, '承認済')">上司承認</button>
 <button class="btn btn-danger" style="padding:4px 8px; font-size:12px;" onclick="approveOrder(${o.id}, '差戻し')">差戻し</button>
 `;
 } else {
 actionButtons = `<span style="font-size:11px; color:#94a3b8; background:#f1f5f9; padding:3px 6px; border-radius:4px;">※ 承認権限: 管理者のみ</span>`;
 }
 } else if (o.status === "承認済") {
 actionButtons = `
 <button class="btn btn-success" style="padding:4px 8px; font-size:12px;" onclick="receiveOrder(${o.id})">納品受取 (在庫加算)</button>
 `;
 }

 tr.innerHTML = `
 <td>${o.ordered_at || o.order_date || '-'}</td>
 <td><strong>${o.item_name}</strong></td>
 <td>${o.quantity}</td>
 <td>¥${(o.total_price || 0).toLocaleString()}</td>
 <td>${o.supplier_name || '-'}</td>
 <td>${o.reason || '-'}</td>
 <td><span style="font-size:12px; font-weight:bold; padding:2px 8px; border-radius:4px; background:${badgeColor}">${o.status}</span></td>
 <td>${o.applicant} / ${o.approver || '-'}</td>
 <td>${actionButtons}</td>
 `;
 tbody.appendChild(tr);
 });
}

function approveOrder(id, status) {
 if (!isCurrentStaffAdmin()) {
 alert(" 発注申請の承認・差戻しは管理者（施設長）のみが行えます。\n担当職員を管理者に切り替えてください。");
 return;
 }
 const staff = document.getElementById("currentStaff").value;
 const o = db.data.orders.find(x => x.id === id);
 if (!o) return;

 const actionLabel = status === "承認済" ? "承認" : "差戻し";
 const ok = confirm(`【発注申請 ${actionLabel}】\n・申請者: ${o.applicant || '職員'}\n・品名: ${o.item_name}\n・数量: ${o.quantity}\n・金額: ¥${(o.total_price || 0).toLocaleString()}\n・業者: ${o.supplier_name || '-'}\n・理由: ${o.reason || '特記なし'}`);
 if (!ok) return;

 o.status = status;
 o.approver = staff;
 o.approved_at = new Date().toISOString().split("T")[0];
 db.save();
 if (gState.activePortal === "office") loadOfficeData();
 checkGlobalAlerts();
 alert(`発注申請（${o.item_name} × ${o.quantity}）を「${status}」にしました。`);
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
// 4. 取引先マスタ ＆ 個別取扱商品管理
function renderOfficeSuppliers() {
 const container = document.getElementById("suppliersContainer");
 if (!container) return;
 container.innerHTML = "";

 if (!Array.isArray(gState.suppliers) || gState.suppliers.length === 0) {
   container.innerHTML = `
     <div style="background:#ffffff; border:1px dashed #cbd5e1; border-radius:8px; padding:32px; text-align:center; color:var(--text-muted);">
       <p style="font-size:14px; margin-bottom:10px;">登録されている取引先がありません。</p>
       <button type="button" class="btn btn-primary" style="font-size:13px;" onclick="openSupplierModal()">＋ 新規取引先を追加</button>
     </div>
   `;
   return;
 }

 gState.suppliers.forEach(s => {
   const card = document.createElement("div");
   card.className = "supplier-card";
   card.style.background = "#ffffff";
   card.style.border = "1px solid #e2e8f0";
   card.style.borderRadius = "8px";
   card.style.padding = "16px";
   card.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)";

   const items = Array.isArray(s.items) ? s.items : [];

   let itemsRows = "";
   if (items.length === 0) {
     itemsRows = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:12px; font-size:12.5px;">登録されている取扱商品はありません。「＋ 取扱商品を追加」ボタンから登録してください。</td></tr>`;
   } else {
     items.forEach(it => {
       itemsRows += `
         <tr>
           <td style="font-weight:bold; font-size:13px; color:#1e293b;">${escapeHtml(it.name)}</td>
           <td style="font-weight:bold; font-size:13px; color:#0284c7;">¥${Number(it.unit_price || 0).toLocaleString()}</td>
           <td style="font-size:12.5px; color:#475569;">${escapeHtml(it.unit || '個')}</td>
           <td style="text-align:right; white-space:nowrap;">
             <button type="button" class="btn btn-secondary" style="font-size:11px; padding:2px 8px; margin-right:4px;" onclick="openSupplierItemModal(${s.id}, ${it.id || 0})">編集</button>
             <button type="button" class="btn btn-secondary" style="font-size:11px; padding:2px 8px; color:#dc2626; border-color:#fca5a5;" onclick="deleteSupplierItem(${s.id}, ${it.id || 0})">削除</button>
           </td>
         </tr>
       `;
     });
   }

   card.innerHTML = `
     <!-- 取引先ヘッダー -->
     <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px; border-bottom:1px solid #f1f5f9; padding-bottom:12px; margin-bottom:12px;">
       <div>
         <div style="display:flex; align-items:center; gap:8px;">
           <h4 style="margin:0; font-size:16px; color:#0f172a; font-weight:bold;">${escapeHtml(s.name)}</h4>
         </div>
         <div style="display:flex; gap:16px; flex-wrap:wrap; margin-top:6px; font-size:12.5px; color:#475569;">
           <span><strong>担当者:</strong> ${escapeHtml(s.contact_person || '未設定')}</span>
           <span><strong>TEL:</strong> ${escapeHtml(s.phone || '未設定')}</span>
           <span><strong>E-mail:</strong> ${escapeHtml(s.email || '未設定')}</span>
         </div>
       </div>
       <div style="display:flex; gap:6px;">
         <button type="button" class="btn btn-secondary" style="font-size:12px; padding:4px 10px;" onclick="openSupplierModal(${s.id})">取引先情報を編集</button>
         <button type="button" class="btn btn-secondary" style="font-size:12px; padding:4px 10px; color:#dc2626; border-color:#fca5a5;" onclick="deleteSupplier(${s.id})">取引先を削除</button>
       </div>
     </div>

     <!-- 取扱商品セクション -->
     <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:12px;">
       <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
         <span style="font-size:13px; font-weight:bold; color:#334155;">取扱商品一覧 (${items.length}品目)</span>
         <button type="button" class="btn btn-primary" style="font-size:12px; padding:4px 12px; background:#0284c7; border-color:#0284c7;" onclick="openSupplierItemModal(${s.id})">＋ 取扱商品を追加</button>
       </div>
       <table class="data-table" style="background:#ffffff; margin:0;">
         <thead>
           <tr style="background:#f1f5f9;">
             <th>商品名</th>
             <th style="width:110px;">単価</th>
             <th style="width:90px;">単位</th>
             <th style="width:110px; text-align:right;">商品操作</th>
           </tr>
         </thead>
         <tbody>
           ${itemsRows}
         </tbody>
       </table>
     </div>
   `;

   container.appendChild(card);
 });
}

// 取引先 親項目の登録・編集
function openSupplierModal(suppId) {
 const titleEl = document.getElementById("supplierModalTitle");
 const idEl = document.getElementById("editSupplierId");
 const nameEl = document.getElementById("suppName");
 const contactEl = document.getElementById("suppContact");
 const phoneEl = document.getElementById("suppPhone");
 const emailEl = document.getElementById("suppEmail");

 if (suppId) {
   const s = gState.suppliers.find(x => x.id === suppId);
   if (!s) return;
   if (titleEl) titleEl.textContent = "取引先情報の編集";
   idEl.value = s.id;
   nameEl.value = s.name || "";
   contactEl.value = s.contact_person || "";
   phoneEl.value = s.phone || "";
   emailEl.value = s.email || "";
 } else {
   if (titleEl) titleEl.textContent = "新規取引先の登録";
   idEl.value = "";
   nameEl.value = "";
   contactEl.value = "";
   phoneEl.value = "";
   emailEl.value = "";
 }
 openModal("supplierModal");
}

function submitSupplierModal() {
 const idVal = document.getElementById("editSupplierId").value;
 const name = document.getElementById("suppName").value.trim();
 const contact = document.getElementById("suppContact").value.trim();
 const phone = document.getElementById("suppPhone").value.trim();
 const email = document.getElementById("suppEmail").value.trim();

 if (!name) {
   alert("取引先名を入力してください。");
   return;
 }

 if (idVal) {
   // 既存更新
   const s = gState.suppliers.find(x => x.id === Number(idVal));
   if (s) {
     s.name = name;
     s.contact_person = contact;
     s.phone = phone;
     s.email = email;
     alert(`取引先「${name}」の情報を更新しました。`);
   }
 } else {
   // 新規作成
   const newSupplier = {
     id: Date.now(),
     name: name,
     contact_person: contact,
     phone: phone,
     email: email,
     items: []
   };
   gState.suppliers.push(newSupplier);
   alert(`新規取引先「${name}」を登録しました！`);
 }

 db.data.suppliers = gState.suppliers;
 db.save();
 renderOfficeSuppliers();
 closeModal("supplierModal");
}

function deleteSupplier(suppId) {
 const s = gState.suppliers.find(x => x.id === suppId);
 if (!s) return;
 if (!confirm(`【警告】\n取引先「${s.name}」および登録されている全取扱商品を削除しますか？`)) {
   return;
 }
 gState.suppliers = gState.suppliers.filter(x => x.id !== suppId);
 db.data.suppliers = gState.suppliers;
 db.save();
 renderOfficeSuppliers();
 alert(`取引先「${s.name}」を削除しました。`);
}

// 取扱商品 子項目の追加・編集
function openSupplierItemModal(suppId, itemId) {
 const s = gState.suppliers.find(x => x.id === suppId);
 if (!s) return;

 document.getElementById("targetSupplierId").value = suppId;
 document.getElementById("supplierItemModalSuppName").textContent = s.name;
 const titleEl = document.getElementById("supplierItemModalTitle");
 const idEl = document.getElementById("editSupplierItemId");
 const nameEl = document.getElementById("itemModalName");
 const priceEl = document.getElementById("itemModalPrice");
 const unitEl = document.getElementById("itemModalUnit");

 if (itemId) {
   const it = (s.items || []).find(x => (x.id === itemId || x.name === itemId));
   if (it) {
     if (titleEl) titleEl.textContent = "取扱商品の編集";
     idEl.value = it.id || it.name;
     nameEl.value = it.name || "";
     priceEl.value = it.unit_price || 0;
     unitEl.value = it.unit || "個";
   }
 } else {
   if (titleEl) titleEl.textContent = "新規取扱商品の追加";
   idEl.value = "";
   nameEl.value = "";
   priceEl.value = "";
   unitEl.value = "個";
 }

 openModal("supplierItemModal");
}

function submitSupplierItemModal() {
 const suppId = Number(document.getElementById("targetSupplierId").value);
 const itemIdVal = document.getElementById("editSupplierItemId").value;
 const name = document.getElementById("itemModalName").value.trim();
 const priceStr = document.getElementById("itemModalPrice").value.trim();
 const unit = document.getElementById("itemModalUnit").value.trim() || "個";

 if (!name) {
   alert("商品名を入力してください。");
   return;
 }
 const price = parseInt(priceStr, 10);
 if (isNaN(price) || price < 0) {
   alert("有効な単価を入力してください。");
   return;
 }

 const s = gState.suppliers.find(x => x.id === suppId);
 if (!s) return;
 if (!Array.isArray(s.items)) s.items = [];

 if (itemIdVal) {
   // 既存編集
   const it = s.items.find(x => String(x.id) === String(itemIdVal) || x.name === itemIdVal);
   if (it) {
     it.name = name;
     it.unit_price = price;
     it.unit = unit;
     alert(`商品「${name}」を更新しました。`);
   }
 } else {
   // 新規商品追加
   s.items.push({
     id: Date.now(),
     name: name,
     unit_price: price,
     unit: unit
   });
   alert(`「${s.name}」に商品「${name}」を追加しました！`);
 }

 db.data.suppliers = gState.suppliers;
 db.save();
 renderOfficeSuppliers();
 closeModal("supplierItemModal");
}

function deleteSupplierItem(suppId, itemId) {
 const s = gState.suppliers.find(x => x.id === suppId);
 if (!s || !Array.isArray(s.items)) return;
 const it = s.items.find(x => (x.id === itemId || x.name === itemId));
 const itemName = it ? it.name : "商品";

 if (!confirm(`取扱商品「${itemName}」を削除しますか？`)) return;

 s.items = s.items.filter(x => !(x.id === itemId || x.name === itemId));
 db.data.suppliers = gState.suppliers;
 db.save();
 renderOfficeSuppliers();
 alert(`商品「${itemName}」を削除しました。`);
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

// 私物行 追加・編集
function openBelongingModal(editId = null) {
 const modal = document.getElementById("belongingModal");
 if (!modal) return;
 const titleEl = document.getElementById("belModalTitle");
 const submitBtn = document.getElementById("belSubmitBtn");
 const editIdEl = document.getElementById("belEditId");

 if (editId) {
 const b = (db.data.belongings || []).find(x => x.id === editId);
 if (!b) return;
 if (editIdEl) editIdEl.value = b.id;
 if (titleEl) titleEl.textContent = ` 私物・持ち込み品の編集 (${b.item_name})`;
 if (submitBtn) submitBtn.textContent = "私物情報を更新・保存";
 document.getElementById("belCat").value = b.category || "衣類・日用品";
 document.getElementById("belItemName").value = b.item_name || "";
 document.getElementById("belQty").value = b.quantity || "";
 document.getElementById("belNotes").value = b.notes || "";
 } else {
 if (editIdEl) editIdEl.value = "";
 if (titleEl) titleEl.textContent = " 私物・持ち込み品の追加 (品名と個数)";
 if (submitBtn) submitBtn.textContent = "私物台帳へ追加";
 document.getElementById("belCat").value = "衣類・日用品";
 document.getElementById("belItemName").value = "";
 document.getElementById("belQty").value = "";
 document.getElementById("belNotes").value = "";
 }
 modal.style.display = "flex";
}

function submitBelonging() {
 const editId = document.getElementById("belEditId")?.value;
 const cat = document.getElementById("belCat").value;
 const name = document.getElementById("belItemName").value.trim();
 const qty = document.getElementById("belQty").value.trim();
 const notes = document.getElementById("belNotes").value.trim();

 if (!name || !qty) {
 alert("品名と個数を入力してください。");
 return;
 }

 if (!db.data.belongings) db.data.belongings = [];

 if (editId) {
 const b = db.data.belongings.find(x => x.id == editId);
 if (b) {
 const ok = confirm(`『${b.item_name}』の登録内容を変更しますか？\n\n・品名: ${b.item_name} → ${name}\n・個数: ${b.quantity} → ${qty}\n・区分: ${b.category} → ${cat}\n・備考: ${b.notes || 'なし'} → ${notes || 'なし'}`);
 if (!ok) return;

 b.category = cat;
 b.item_name = name;
 b.quantity = qty;
 b.notes = notes;
 }
 alert(`私物『${name}』の情報を更新しました。`);
 } else {
 db.data.belongings.push({
 id: Date.now(),
 resident_id: gState.selectedResidentId,
 category: cat,
 item_name: name,
 quantity: qty,
 marked: 1,
 notes: notes
 });
 alert(`私物台帳に『${name}』を追加しました。`);
 }
 db.save();

 closeModal("belongingModal");
 document.getElementById("belItemName").value = "";
 document.getElementById("belQty").value = "";
 document.getElementById("belNotes").value = "";
 if (document.getElementById("belEditId")) document.getElementById("belEditId").value = "";
 renderResidentDetail();
}

// 数量クイック調整 (衣類破棄・劣化・買い足し時)
function adjustBelongingQty(id, delta) {
 const b = (db.data.belongings || []).find(x => x.id === id);
 if (!b) return;

 const currentStr = String(b.quantity || "1").trim();
 const numMatch = currentStr.match(/\d+/);
 let curNum = numMatch ? parseInt(numMatch[0], 10) : 1;
 const unit = currentStr.replace(/\d+/g, "").trim() || "点";

 const nextNum = curNum + delta;
 if (nextNum <= 0) {
 const ok = confirm(`『${b.item_name}』の数量が0になります。台帳から削除しますか？`);
 if (ok) {
 deleteBelonging(id, false);
 }
 return;
 }

 const ok = confirm(`『${b.item_name}』の数量を変更しますか？\n\n【 変更前 】 ${b.quantity}\n　　↓\n【 変更後 】 ${nextNum}${unit}`);
 if (!ok) return;

 b.quantity = `${nextNum}${unit}`;
 db.save();
 renderResidentDetail();
}

// 私物の削除 (廃棄・持ち帰り)
function deleteBelonging(id, needConfirm = true) {
 const b = (db.data.belongings || []).find(x => x.id === id);
 if (!b) return;

 if (needConfirm) {
 const ok = confirm(`『${b.item_name} (${b.quantity})』を台帳から削除しますか？`);
 if (!ok) return;
 }

 db.data.belongings = (db.data.belongings || []).filter(x => x.id !== id);
 db.save();
 renderResidentDetail();
 alert(`『${b.item_name}』を台帳から削除しました。`);
}

// 福祉用具・備品 追加
function openEquipmentModal() {
 const modal = document.getElementById("equipmentModal");
 if (!modal) return;
 document.getElementById("eqName").value = "";
 document.getElementById("eqOwnership").value = "施設備品";
 document.getElementById("eqNotes").value = "";
 modal.style.display = "flex";
}

function submitEquipment() {
 const name = document.getElementById("eqName").value.trim();
 const ownership = document.getElementById("eqOwnership").value;
 const notes = document.getElementById("eqNotes").value.trim();

 if (!name) {
 alert("用具・備品名を入力してください。");
 return;
 }

 if (!db.data.equipments) db.data.equipments = [];
 db.data.equipments.push({
 id: Date.now(),
 resident_id: gState.selectedResidentId,
 equipment_name: name,
 ownership_type: ownership,
 notes: notes
 });
 db.save();

 closeModal("equipmentModal");
 renderResidentDetail();
 alert(`福祉用具『${name}』を登録しました。`);
}

// 福祉用具・備品の解除・返却
function deleteEquipment(id) {
 const eq = (db.data.equipments || []).find(x => x.id === id);
 if (!eq) return;

 const ok = confirm(`福祉用具『${eq.equipment_name} (${eq.ownership_type})』の使用を終了（解除）しますか？`);
 if (!ok) return;

 db.data.equipments = (db.data.equipments || []).filter(x => x.id !== id);
 db.save();
 renderResidentDetail();
 alert(`『${eq.equipment_name}』の使用を終了・解除しました。`);
}

// 緊急連絡先 ＆ 家族の要望・生活歴・看取り方針 クイック変更モーダル
function openFamilyHistoryModal(residentId) {
 const r = (gState.residents || []).find(x => x.id === residentId);
 if (!r) return;

 const modal = document.getElementById("familyHistoryModal");
 if (!modal) return;

 document.getElementById("familyHistoryModalTitle").textContent = ` 緊急連絡先 ＆ 家族の要望・生活歴・看取り方針の変更 (${r.name} 様)`;
 document.getElementById("fhResidentId").value = r.id;
 document.getElementById("fhEmergencyContact").value = r.emergency_contact || "";
 document.getElementById("fhPolicyStamp").value = r.policy_stamp || "緊急搬送";
 document.getElementById("fhSensorAlert").value = r.sensor_alert || "";
 document.getElementById("fhFamilyWishes").value = r.family_wishes || "";
 document.getElementById("fhLifeHistory").value = r.life_history || "";

 modal.style.display = "flex";
}

function submitFamilyHistory() {
 const resId = parseInt(document.getElementById("fhResidentId").value, 10);
 const r = (gState.residents || []).find(x => x.id === resId);
 if (!r) return;

 const staff = (document.getElementById("currentStaff")?.value) || "担当職員";
 const now = new Date();
 const nowStr = `${now.toISOString().split("T")[0]} ${now.toTimeString().slice(0, 5)}`;

 const newContact = document.getElementById("fhEmergencyContact").value.trim();
 const newStamp = document.getElementById("fhPolicyStamp").value;
 const newSensor = document.getElementById("fhSensorAlert").value.trim();
 const newWishes = document.getElementById("fhFamilyWishes").value.trim();
 const newHistory = document.getElementById("fhLifeHistory").value.trim();

 // 変更前と比較して差分チェック
 const changes = [];
 if (r.emergency_contact !== newContact) changes.push(`・緊急連絡/延命方針: ${r.emergency_contact || '未登録'} → ${newContact || 'なし'}`);
 if (r.policy_stamp !== newStamp) changes.push(`・基本方針: ［${r.policy_stamp}］→［${newStamp}］`);
 if (r.family_wishes !== newWishes) changes.push(`・家族の要望: ${r.family_wishes || 'なし'} → ${newWishes || 'なし'}`);
 if (r.life_history !== newHistory) changes.push(`・生活歴/こだわりを更新`);
 if (r.sensor_alert !== newSensor) changes.push(`・見守り/センサー: ${r.sensor_alert || 'なし'} → ${newSensor || 'なし'}`);

 if (changes.length > 0) {
 const ok = confirm(`『${r.name} 様』の登録情報を変更しますか？\n\n${changes.join("\n")}`);
 if (!ok) return;
 }



 r.emergency_contact = newContact;
 r.policy_stamp = newStamp;
 r.sensor_alert = newSensor;
 r.family_wishes = newWishes;
 r.life_history = newHistory;

 if (changes.length > 0) {
 if (!db.data.care_records) db.data.care_records = [];
 db.data.care_records.unshift({
 id: Date.now(),
 resident_id: r.id,
 category: "特変",
 recorded_at: nowStr,
 content: `【基本情報更新】家族要望・緊急連絡先・看取り方針等の更新 (${changes.join(" / ")})`,
 staff_name: staff
 });
 }

 db.save();
 closeModal("familyHistoryModal");
 renderResidentDetail();
 checkGlobalAlerts();
 alert(`『${r.name} 様』の緊急連絡先・家族要望・看取り方針を最新状態に更新・保存しました！`);
}


// 新規利用者登録・編集
function openAddResidentModal() {
 document.getElementById("resModalTitle").textContent = " 新規利用者の登録";
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
 document.getElementById("resClinicSpecialNotes").value = "";
 document.getElementById("resBpHighMax").value = "";
 document.getElementById("resBpHighMin").value = "";
 document.getElementById("resTempMax").value = "";
 document.getElementById("resSpo2Min").value = "";
 document.getElementById("resPulseMax").value = "";
 document.getElementById("resPulseMin").value = "";

 document.getElementById("residentModal").style.display = "flex";
}

function openEditResidentModal(id) {
 const r = gState.residents.find(x => x.id === id);
 if (!r) return;

 document.getElementById("resModalTitle").textContent = ` 利用者情報の編集 (${r.name} 様)`;
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
 document.getElementById("resClinicSpecialNotes").value = r.clinic_special_notes || "";
 document.getElementById("resBpHighMax").value = r.bp_high_max || "";
 document.getElementById("resBpHighMin").value = r.bp_high_min || "";
 document.getElementById("resTempMax").value = r.temp_max || "";
 document.getElementById("resSpo2Min").value = r.spo2_min || "";
 document.getElementById("resPulseMax").value = r.pulse_max || "";
 document.getElementById("resPulseMin").value = r.pulse_min || "";

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
 care_expiry_date: document.getElementById("resCareExpiryDate").value,
 clinic_special_notes: document.getElementById("resClinicSpecialNotes").value.trim(),
 bp_high_max: document.getElementById("resBpHighMax").value ? parseInt(document.getElementById("resBpHighMax").value, 10) : null,
 bp_high_min: document.getElementById("resBpHighMin").value ? parseInt(document.getElementById("resBpHighMin").value, 10) : null,
 temp_max: document.getElementById("resTempMax").value ? parseFloat(document.getElementById("resTempMax").value) : null,
 spo2_min: document.getElementById("resSpo2Min").value ? parseInt(document.getElementById("resSpo2Min").value, 10) : null,
 pulse_max: document.getElementById("resPulseMax").value ? parseInt(document.getElementById("resPulseMax").value, 10) : null,
 pulse_min: document.getElementById("resPulseMin").value ? parseInt(document.getElementById("resPulseMin").value, 10) : null
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

// ==========================================
// 往診医・受診時指示＆特殊指示 項目別クイック編集機能
// ==========================================
function insertQuickSpecialNote(text) {
 const input = document.getElementById("quickClinicSpecialNotes");
 if (!input) return;
 if (!input.value) {
 input.value = text;
 } else if (!input.value.includes(text)) {
 input.value = input.value + "、" + text;
 }
}

function openClinicInstructionModal(resId, focusField = 'all') {
 const targetId = (resId !== undefined && resId !== null && resId !== '') ? Number(resId) : Number(gState.selectedResidentId);
 const r = gState.residents ? gState.residents.find(x => Number(x.id) === targetId) : null;
 if (!r) {
 console.warn("[openClinicInstructionModal] Resident not found:", resId, gState.selectedResidentId);
 return;
 }

 const titleEl = document.getElementById("clinicModalTitle");
 if (titleEl) titleEl.textContent = ` 往診医・受診時指示 ＆ 特殊指示の変更 (${r.name} 様)`;
 const idEl = document.getElementById("clinicResidentId");
 if (idEl) idEl.value = r.id;
 const specEl = document.getElementById("quickClinicSpecialNotes");
 if (specEl) specEl.value = r.clinic_special_notes || "";
 const drEl = document.getElementById("quickDrInstructions");
 if (drEl) drEl.value = r.dr_instructions || "";
 const dateEl = document.getElementById("quickNextClinicDate");
 if (dateEl) dateEl.value = r.next_clinic_date || "";

 const modal = document.getElementById("clinicInstructionModal");
 if (modal) {
 modal.style.display = "flex";
 modal.style.zIndex = "2500";
 }

 setTimeout(() => {
 if (focusField === 'special' && specEl) {
 specEl.focus();
 specEl.select?.();
 } else if (focusField === 'instructions' && drEl) {
 drEl.focus();
 drEl.select?.();
 } else if (focusField === 'date' && dateEl) {
 dateEl.focus();
 }
 }, 100);
}

function submitClinicInstructions() {
 const idEl = document.getElementById("clinicResidentId");
 if (!idEl) return;
 const id = parseInt(idEl.value, 10);
 const r = gState.residents ? gState.residents.find(x => Number(x.id) === id) : null;
 if (!r) return;

 const specialNotes = document.getElementById("quickClinicSpecialNotes").value.trim();
 const drInstructions = document.getElementById("quickDrInstructions").value.trim();
 const nextClinicDate = document.getElementById("quickNextClinicDate").value;

 r.clinic_special_notes = specialNotes;
 r.dr_instructions = drInstructions;
 r.next_clinic_date = nextClinicDate;

 // 介護記録にも往診・受診指示変更の記録を自動記録（変更履歴の保持）
 const staff = (document.getElementById("currentStaff")?.value) || "看護師";
 const now = new Date();
 const nowStr = `${now.toISOString().split("T")[0]} ${now.toTimeString().slice(0, 5)}`;
 if (!db.data.care_records) db.data.care_records = [];
 db.data.care_records.unshift({
 id: Date.now(),
 resident_id: r.id,
 category: "受診",
 recorded_at: nowStr,
 content: `【往診・受診指示変更】医師指示: ${drInstructions || '特記なし'} / 特殊指示: ${specialNotes || 'なし'} / 次回予定: ${nextClinicDate || '未定'}`,
 staff_name: staff
 });

 db.save();
 closeModal("clinicInstructionModal");
 renderResidentDetail();
 checkGlobalAlerts();
 alert(`${r.name} 様の受診時指示および特殊指示を保存しました！個人記録へも変更履歴を自動転記しました。`);
}

// ==========================================
// 基本方針・見守り注意 クイック編集機能
// ==========================================
function openCarePlanModal(resId, focusField = '') {
 const targetId = (resId !== undefined && resId !== null && resId !== '') ? Number(resId) : Number(gState.selectedResidentId);
 const r = gState.residents ? gState.residents.find(x => Number(x.id) === targetId) : null;
 if (!r) {
 console.warn("[openCarePlanModal] Resident not found:", resId, gState.selectedResidentId);
 return;
 }

 const titleEl = document.getElementById("carePlanModalTitle");
 if (titleEl) titleEl.textContent = ` 基本方針 ＆ ケアプラン目標の変更 (${r.name} 様)`;
 const idEl = document.getElementById("carePlanResidentId");
 if (idEl) idEl.value = r.id;
 const goalEl = document.getElementById("quickCarePlanGoal");
 if (goalEl) goalEl.value = r.care_plan_goal || "";
 const sensorEl = document.getElementById("quickSensorAlert");
 if (sensorEl) sensorEl.value = r.sensor_alert || "";
 const bphMaxEl = document.getElementById("quickBpHMax");
 if (bphMaxEl) bphMaxEl.value = r.bp_high_max || "";
 const bphMinEl = document.getElementById("quickBpHMin");
 if (bphMinEl) bphMinEl.value = r.bp_high_min || "";
 const tempEl = document.getElementById("quickTempMax");
 if (tempEl) tempEl.value = r.temp_max || "";
 const spo2El = document.getElementById("quickSpo2Min");
 if (spo2El) spo2El.value = r.spo2_min || "";

 const modal = document.getElementById("carePlanModal");
 if (modal) {
 modal.style.display = "flex";
 modal.style.zIndex = "2500";
 }

 setTimeout(() => {
 if (focusField === 'sensor' && sensorEl) {
 sensorEl.focus();
 sensorEl.select?.();
 } else if (goalEl) {
 goalEl.focus();
 }
 }, 100);
}

function submitCarePlanModal() {
 const idEl = document.getElementById("carePlanResidentId");
 if (!idEl) return;
 const id = parseInt(idEl.value, 10);
 const r = gState.residents ? gState.residents.find(x => Number(x.id) === id) : null;
 if (!r) return;

 r.care_plan_goal = document.getElementById("quickCarePlanGoal").value.trim();
 r.sensor_alert = document.getElementById("quickSensorAlert").value.trim();
 r.bp_high_max = document.getElementById("quickBpHMax").value ? parseInt(document.getElementById("quickBpHMax").value, 10) : null;
 r.bp_high_min = document.getElementById("quickBpHMin").value ? parseInt(document.getElementById("quickBpHMin").value, 10) : null;
 r.temp_max = document.getElementById("quickTempMax").value ? parseFloat(document.getElementById("quickTempMax").value) : null;
 r.spo2_min = document.getElementById("quickSpo2Min").value ? parseInt(document.getElementById("quickSpo2Min").value, 10) : null;

 db.save();
 closeModal("carePlanModal");
 renderResidentDetail();
 alert(`${r.name} 様の基本方針・ケアプラン目標・バイタル基準値を更新しました！`);
}

// ==========================================
// 身体状況・食形態 クイック編集機能
// ==========================================
function openBodyConditionModal(resId, focusField = '') {
 const targetId = (resId !== undefined && resId !== null && resId !== '') ? Number(resId) : Number(gState.selectedResidentId);
 const r = gState.residents ? gState.residents.find(x => Number(x.id) === targetId) : null;
 if (!r) {
 console.warn("[openBodyConditionModal] Resident not found:", resId, gState.selectedResidentId);
 return;
 }

 const titleEl = document.getElementById("bodyConditionModalTitle");
 if (titleEl) titleEl.textContent = `身体状況 ＆ 食形態・口腔状態・病歴の変更 (${r.name} 様)`;
 
 const idEl = document.getElementById("bodyConditionResidentId");
 if (idEl) idEl.value = r.id;
 
 const disEl = document.getElementById("quickDiseases");
 if (disEl) disEl.value = r.diseases || "";
 
 const parEl = document.getElementById("quickParalysis");
 if (parEl) parEl.value = r.paralysis || "";
 
 const algEl = document.getElementById("quickAllergies");
 if (algEl) algEl.value = r.allergies || "";
 
 const dietSel = document.getElementById("quickDietType");
 if (dietSel) {
 let found = false;
 for (let i = 0; i < dietSel.options.length; i++) {
 if (dietSel.options[i].value === r.diet_type) {
 dietSel.selectedIndex = i;
 found = true;
 break;
 }
 }
 if (!found && r.diet_type) {
 const opt = document.createElement("option");
 opt.value = r.diet_type;
 opt.textContent = r.diet_type;
 dietSel.appendChild(opt);
 dietSel.value = r.diet_type;
 } else if (!r.diet_type) {
 dietSel.value = "普通食";
 }
 }

 const oralEl = document.getElementById("quickOralState");
 if (oralEl) oralEl.value = r.oral_state || "";

 const modal = document.getElementById("bodyConditionModal");
 if (modal) {
 modal.style.display = "flex";
 modal.style.zIndex = "2500";
 }

 setTimeout(() => {
 if (focusField === 'diseases' && disEl) {
 disEl.focus();
 disEl.select?.();
 } else if (focusField === 'paralysis' && parEl) {
 parEl.focus();
 parEl.select?.();
 } else if (focusField === 'allergies' && algEl) {
 algEl.focus();
 algEl.select?.();
 } else if (disEl) {
 disEl.focus();
 }
 }, 100);
}

function submitBodyConditionModal() {
 const idEl = document.getElementById("bodyConditionResidentId");
 if (!idEl) return;
 const id = parseInt(idEl.value, 10);
 const r = gState.residents ? gState.residents.find(x => Number(x.id) === id) : null;
 if (!r) return;

 const disEl = document.getElementById("quickDiseases");
 const parEl = document.getElementById("quickParalysis");
 const algEl = document.getElementById("quickAllergies");
 const dietEl = document.getElementById("quickDietType");
 const oralEl = document.getElementById("quickOralState");

 if (disEl) r.diseases = disEl.value.trim();
 if (parEl) r.paralysis = parEl.value.trim();
 if (algEl) r.allergies = algEl.value.trim();
 if (dietEl) r.diet_type = dietEl.value;
 if (oralEl) r.oral_state = oralEl.value.trim();

 db.save();
 closeModal("bodyConditionModal");
 renderResidentDetail();
 alert(`${r.name} 様の身体状況・食形態・病歴を更新しました！`);
}

// 職員・認印管理
function openStaffModal() {
 if (!isCurrentStaffAdminOrClerk()) {
 alert("職員管理は管理者または事務員のみ操作可能です。");
 return;
 }
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

 gState.stamps.push({ name: name, role: role, pin: "0000", is_initial_pin: true });
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
 const item = (gState.inventory || []).find(i => i.id === itemId);
 if (item) {
 if (item.supplier_id) {
 document.getElementById("orderSupplierSelect").value = item.supplier_id;
 onSupplierChangeInOrder();
 }
 document.getElementById("orderItemSelect").value = item.name;
 
 // 平常時までの不足数を初期発注数量として自動算出
 const normalStock = item.normal_stock || (item.safety_stock * 2);
 const deficit = Math.max(1, normalStock - item.current_stock);
 const qtyEl = document.getElementById("orderQty");
 if (qtyEl) qtyEl.value = deficit;

 const reasonEl = document.getElementById("orderReason");
 if (reasonEl) reasonEl.value = `平常時定数(${normalStock}${item.unit})までの補充発注 (現在庫: ${item.current_stock}${item.unit})`;

 onItemChangeInOrder();
 calcOrderTotal();
 }
}

function adjustOrderQty(delta) {
 const el = document.getElementById("orderQty");
 if (!el) return;
 let cur = parseInt(el.value, 10) || 1;
 cur = Math.max(1, cur + delta);
 el.value = cur;
 calcOrderTotal();
}

function setOrderQtyToNormalDeficit() {
 const itemName = document.getElementById("orderItemSelect")?.value;
 const item = (gState.inventory || []).find(i => i.name === itemName);
 if (item) {
 const normalStock = item.normal_stock || (item.safety_stock * 2);
 const deficit = Math.max(1, normalStock - item.current_stock);
 const el = document.getElementById("orderQty");
 if (el) {
 el.value = deficit;
 calcOrderTotal();
 }
 }
}

function onSupplierChangeInOrder() {
 const suppId = parseInt(document.getElementById("orderSupplierSelect").value, 10);
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
 const price = selectedOpt ? parseInt(selectedOpt.dataset.price || 0, 10) : 0;
 document.getElementById("orderUnitPrice").value = price;

 const itemName = itemSel.value;
 const invItem = (gState.inventory || []).find(i => i.name === itemName);
 const hintEl = document.getElementById("orderStockHint");
 const qtyEl = document.getElementById("orderQty");

 if (invItem) {
 const normalStock = invItem.normal_stock || (invItem.safety_stock * 2);
 const deficit = Math.max(1, normalStock - invItem.current_stock);

 if (qtyEl && (!qtyEl.value || qtyEl.value === "0")) {
 qtyEl.value = deficit;
 }

 if (hintEl) {
 hintEl.style.display = "block";
 const isLow = invItem.current_stock <= invItem.safety_stock;
 const headerEl = document.getElementById("orderStockHintHeader");
 if (headerEl) {
 headerEl.innerHTML = `
 <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:4px;">
 <span> <strong>在庫現況:</strong> 現在庫: <strong style="${isLow ? 'color:#dc2626;' : ''}">${invItem.current_stock}${invItem.unit}</strong> / 安全基準: ${invItem.safety_stock}${invItem.unit} / 平常時定数: <strong>${normalStock}${invItem.unit}</strong></span>
 <span style="font-weight:bold; color:#1d4ed8;"> 平常時不足: +${deficit}${invItem.unit}</span>
 </div>
 `;
 }
 }
 } else {
 if (hintEl) hintEl.style.display = "none";
 }

 calcOrderTotal();
}

function calcOrderTotal() {
 const qtyEl = document.getElementById("orderQty");
 const qty = parseInt(qtyEl?.value || 1, 10);
 const price = parseInt(document.getElementById("orderUnitPrice").value || 0, 10);
 document.getElementById("orderTotalPrice").value = qty * price;

 const itemName = document.getElementById("orderItemSelect")?.value;
 const invItem = (gState.inventory || []).find(i => i.name === itemName);
 const projText = document.getElementById("orderProjectedStockText");
 if (invItem && projText) {
 const normalStock = invItem.normal_stock || (invItem.safety_stock * 2);
 const after = invItem.current_stock + qty;
 const diffToNormal = after - normalStock;
 let note = diffToNormal === 0 ? "（平常時定数とピッタリ一致 ）" : (diffToNormal > 0 ? `（平常時定数より ＋${diffToNormal}${invItem.unit} 多め）` : `（平常時定数まであと ${Math.abs(diffToNormal)}${invItem.unit} 不足）`);
 projText.innerHTML = `※ 発注納品後の想定在庫: <strong>${after}${invItem.unit}</strong> <span style="color:#0369a1; font-weight:bold;">${note}</span>`;
 }
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
 });
 
 // 新規申請時は管理者向け未承認アラートの非表示を解除
 undismissAlert('admin_pending_orders');

 db.save();

 closeModal("orderModal");
 loadOfficeData();
 checkGlobalAlerts();
 alert("発注申請を提出しました（上司承認待ちへ）！要発注アラートを発注手配済みに更新し、管理者の認証アラートへ通知しました。");
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

// [Claude修正] openModal() が未定義のまま呼ばれており、介護記録の編集・巡視定型文の編集・
// 皮膚シェーマ図の各画面がエラーで開かなかった。他のモーダルと同じ表示方法で定義する。
function openModal(id) {
 const el = document.getElementById(id);
 if (!el) {
 alert("画面が見つかりません: " + id);
 return;
 }
 el.style.display = "flex";
}

function closeModal(id) {
 const el = document.getElementById(id);
 if (el) el.style.display = "none";
 if (id === "diseaseModal" && typeof closeTermExplanation === "function") {
 closeTermExplanation();
 }
}

async function openShareModal() {
 const modal = document.getElementById("shareModal");
 if (!modal) return;
 modal.style.display = "flex";
 if (db) {
 db.renderShareModalUrls();
 try {
 const res = await fetch('/api/ip');
 if (res.ok) {
 const data = await res.json();
 if (data.tunnel_url && data.tunnel_url.trim() !== "") {
 const prev = localStorage.getItem("care_portal_tunnel_url") || "";
 if (prev !== data.tunnel_url.trim()) {
 localStorage.setItem("care_portal_tunnel_url", data.tunnel_url.trim());
 db.renderShareModalUrls();
 }
 }
 }
 } catch (_) {}
 }
}

function copyShareUrl(url) {
 if (navigator.clipboard) {
 navigator.clipboard.writeText(url).then(() => {
 alert(" 接続URLをコピーしました！\n" + url + "\n\nスマホやタブレット等のブラウザに貼り付けて開いてください。\nどこからでも同じデータがリアルタイムで共有されます。");
 }).catch(() => {
 prompt("以下の接続URLをコピーして開いてください:", url);
 });
 } else {
 prompt("以下の接続URLをコピーして開いてください:", url);
 }
}

async function promptChangeTunnelUrl() {
 const current = localStorage.getItem("care_portal_tunnel_url") || "https://inside-mustang-test-demographic.trycloudflare.com";
 const newUrl = prompt("外部接続用のCloudflare Tunnel URLを入力してください:", current);
 if (newUrl && newUrl.trim() !== "") {
 const cleanUrl = newUrl.trim();
 localStorage.setItem("care_portal_tunnel_url", cleanUrl);
 if (db) db.renderShareModalUrls();
 try {
 await fetch('/api/ip', {
 method: 'POST',
 headers: { 'Content-Type': 'text/plain; charset=utf-8' },
 body: cleanUrl
 });
 } catch (_) {}
 alert("接続URLとQRコードを更新しました！\n" + cleanUrl);
 }
}

function reloadStateFromDb() {
 if (!db || !db.data) return;
 updateFacilityNameUI();
 gState.residents = db.data.residents;
 gState.inventory = db.data.inventory;
 gState.suppliers = db.data.suppliers;
 gState.stamps = db.data.stamps;
 ensureStaffPinData();
 updateStaffRoleUI();
 gState.templates = db.data.templates;
 gState.recreations = db.data.recreations;
 gState.emergencySupplies = db.data.emergency_supplies;
 gState.care_summaries = db.data.care_summaries;
 gState.body_schema_pins = db.data.body_schema_pins || [];

 if (typeof renderBodySchemaPins === 'function') renderBodySchemaPins();
 if (typeof renderQuickTemplates === 'function') renderQuickTemplates();
 if (typeof renderFsQuickTemplates === 'function') renderFsQuickTemplates();
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
 titleEl.textContent = res ? ` ${res.name} 様の写真・重要書類保管庫` : " 写真・重要書類保管庫";
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
 <div style="font-size:32px; margin-bottom:8px;">${isDoc ? '' : ''}</div>
 <div style="font-weight:bold; font-size:14px; margin-bottom:4px;">
 ${isDoc ? '重要書類・同意書はまだありません' : '個人写真はまだありません'}
 </div>
 <div style="font-size:12px;">右上の「 写真・書類の追加」から撮影・アップロードするか、<br>PCの保存フォルダに直接ファイルを入れてください。</div>
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
 <img src="${p.url}" alt="${p.title || '写真'}" style="width:100%; height:100%; object-fit:cover;" onerror="this.onerror=null; this.src=''; this.parentElement.innerHTML='<span style=\\'color:#94a3b8; font-size:12px;\\'> 画像読込エラー</span>';">
 <div style="position:absolute; bottom:4px; right:4px; background:rgba(0,0,0,0.6); color:white; font-size:10px; padding:2px 6px; border-radius:4px;"> 拡大</div>
 </div>
 <div style="padding:10px; flex:1; display:flex; flex-direction:column; justify-content:space-between;">
 <div>
 <div style="font-weight:bold; font-size:13px; color:#1e293b; margin-bottom:4px; line-height:1.3; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;" title="${p.title || ''}">
 ${p.title || "名称未設定"}
 </div>
 <div style="font-size:11px; color:#64748b;"> ${p.uploaded_at || "-"}</div>
 <div style="font-size:11px; color:#64748b;"> 担当: ${p.uploader || "-"}</div>
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

 alert(" " + (cat === "documents" ? "重要書類" : "写真") + "を登録・保存しました！");
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
 alert(" PCのエクスプローラーで保存フォルダを開きました。\nファイルを直接追加・確認できます。");
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

// ==========================================
// 7. 月間勤務表・シフト管理 (自動生成・手動修正・特例配慮・週休2日・夜勤2名)
// ==========================================

let gShiftEditingCell = { staffName: null, day: null, yearMonth: null };

function getShiftYearMonth() {
 const sel = document.getElementById("shiftMonthSelector");
 if (sel && sel.value) {
 gState.currentShiftMonth = sel.value;
 return sel.value;
 }
 const defaultYm = gState.currentShiftMonth || new Date().toISOString().slice(0, 7);
 gState.currentShiftMonth = defaultYm;
 if (sel) sel.value = defaultYm;
 return defaultYm;
}

function changeShiftMonth(delta) {
 const ym = getShiftYearMonth();
 const [yearStr, monthStr] = ym.split("-");
 let y = parseInt(yearStr, 10);
 let m = parseInt(monthStr, 10) + delta;
 if (m < 1) {
 m = 12;
 y--;
 } else if (m > 12) {
 m = 1;
 y++;
 }
 const newYm = `${y}-${String(m).padStart(2, '0')}`;
 gState.currentShiftMonth = newYm;
 const sel = document.getElementById("shiftMonthSelector");
 if (sel) sel.value = newYm;
 renderShiftTable(newYm);
}

function onShiftMonthChange() {
 const sel = document.getElementById("shiftMonthSelector");
 if (sel && sel.value) {
 gState.currentShiftMonth = sel.value;
 renderShiftTable(sel.value);
 }
}

function generateMonthlyShiftAction() {
 const ym = getShiftYearMonth();
 const [y, m] = ym.split("-");
 const hopeCount = (db.data.shift_hope_offs || []).filter(h => h.year_month === ym).length;
 const hopeNotice = hopeCount > 0 ? `\n（登録済みの希望休 ${hopeCount}件 も最優先公休として自動反映されます）` : "";
 if (db.data.monthly_shifts && db.data.monthly_shifts[ym]) {
  if (!confirm(`${y}年${parseInt(m, 10)}月の勤務表シフトを再生成しますか？${hopeNotice}\n（手動修正された内容もリセットされます）`)) {
   return;
  }
 }
 generateMonthlyShiftData(ym);
 renderShiftTable(ym);
 alert(` ${y}年${parseInt(m, 10)}月の勤務表シフトを自動生成しました！\n・希望休配慮：全${hopeCount}件を最優先公休「休」として確定配置\n・早出・遅出：毎日必ず各2名体制（配置済）\n・夜勤：毎日2名体制（同番NG配慮済）\n・施設長・事務員：日勤専従（土日祝・年末年始休み）\n・公休：全員週休2日配分`);
}

// 国民の祝日 ＆ 年末年始 (12/29〜1/3) 判定関数
function isHolidayOrYearEnd(year, month, day) {
 // 年末年始休暇: 12月29日〜12月31日、1月1日〜1月3日
 if (month === 12 && day >= 29) return { isHoliday: true, name: "年末休暇" };
 if (month === 1 && day <= 3) return { isHoliday: true, name: (day === 1 ? "元日" : "年始休暇") };

 // 春分・秋分の計算 (2000年〜2099年)
 const getVernalEquinox = y => Math.floor(20.8431 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
 const getAutumnEquinox = y => Math.floor(23.2488 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));

 // ハッピーマンデー (第N月曜日の日付)
 const getNthMonday = (y, m, n) => {
 const firstDow = new Date(y, m - 1, 1).getDay();
 const firstMonday = (firstDow <= 1) ? (1 - firstDow + 1) : (8 - firstDow + 1);
 return firstMonday + (n - 1) * 7;
 };

 let name = null;

 if (month === 1) {
 if (day === 1) name = "元日";
 else if (day === getNthMonday(year, 1, 2)) name = "成人の日";
 } else if (month === 2) {
 if (day === 11) name = "建国記念の日";
 else if (day === 23) name = "天皇誕生日";
 else if (day === 24 && new Date(year, 1, 23).getDay() === 0) name = "振替休日";
 } else if (month === 3) {
 const ve = getVernalEquinox(year);
 if (day === ve) name = "春分の日";
 else if (day === ve + 1 && new Date(year, 2, ve).getDay() === 0) name = "振替休日";
 } else if (month === 4) {
 if (day === 29) name = "昭和の日";
 else if (day === 30 && new Date(year, 3, 29).getDay() === 0) name = "振替休日";
 } else if (month === 5) {
 if (day === 3) name = "憲法記念日";
 else if (day === 4) name = "みどりの日";
 else if (day === 5) name = "こどもの日";
 else if (day === 6) {
 const d3 = new Date(year, 4, 3).getDay();
 const d4 = new Date(year, 4, 4).getDay();
 const d5 = new Date(year, 4, 5).getDay();
 if (d3 === 0 || d4 === 0 || d5 === 0) name = "振替休日";
 }
 } else if (month === 7) {
 if (day === getNthMonday(year, 7, 3)) name = "海の日";
 } else if (month === 8) {
 if (day === 11) name = "山の日";
 else if (day === 12 && new Date(year, 7, 11).getDay() === 0) name = "振替休日";
 } else if (month === 9) {
 const respectDay = getNthMonday(year, 9, 3);
 const ae = getAutumnEquinox(year);
 if (day === respectDay) name = "敬老の日";
 else if (day === ae) name = "秋分の日";
 else if (day === ae + 1 && new Date(year, 8, ae).getDay() === 0) name = "振替休日";
 else if (respectDay + 2 === ae && day === respectDay + 1) name = "国民の休日";
 } else if (month === 10) {
 if (day === getNthMonday(year, 10, 2)) name = "スポーツの日";
 } else if (month === 11) {
 if (day === 3) name = "文化の日";
 else if (day === 4 && new Date(year, 10, 3).getDay() === 0) name = "振替休日";
 else if (day === 23) name = "勤労感謝の日";
 else if (day === 24 && new Date(year, 10, 23).getDay() === 0) name = "振替休日";
 }

 if (name) {
 return { isHoliday: true, name: name };
 }
 return { isHoliday: false, name: null };
}

// 職員の職種カテゴリ判定 (director:施設長, office:事務員, nurse:看護師, care:介護職員)
function getStaffRoleCategory(staffName) {
 const allStamps = db.data.stamps || [];
 const staff = allStamps.find(s => (s.name || s) === staffName);
 const role = staff && staff.role ? staff.role : "";
 const name = staffName || "";
 if (role.includes("施設長") || role.includes("管理者") || name.includes("施設長") || name.includes("木村")) {
 return "director";
 }
 if (role.includes("事務") || name.includes("田中") || name.includes("松本")) {
 return "office";
 }
 if (role.includes("看護") || name.includes("鈴木") || name.includes("加藤")) {
 return "nurse";
 }
 return "care";
}

function generateMonthlyShiftData(yearMonth) {
 if (!yearMonth) yearMonth = getShiftYearMonth();
 const [yearStr, monthStr] = yearMonth.split("-");
 const year = parseInt(yearStr, 10);
 const month = parseInt(monthStr, 10);
 const daysInMonth = new Date(year, month, 0).getDate();

 // 1. スタッフ分類 (19名体制: 管理者1, 看護2, 介護14, 事務2)
 const allStamps = sortStaffList(db.data.stamps || []);
 const staffList = allStamps.map(s => typeof s === "string" ? { name: s, role: "介護職員" } : s);

 const isDirector = s => getStaffRoleCategory(s.name) === "director";
 const isOffice = s => getStaffRoleCategory(s.name) === "office";
 const isNurse = s => getStaffRoleCategory(s.name) === "nurse";
 const isCare = s => getStaffRoleCategory(s.name) === "care";

 const directors = staffList.filter(isDirector);
 const officeStaff = staffList.filter(isOffice);
 const nurses = staffList.filter(isNurse);
 const careStaff = staffList.filter(isCare);

 // NGペアチェック関数
 const ngPairs = db.data.shift_ng_pairs || [];
 const isNgPair = (name1, name2) => {
  return ngPairs.some(p => 
   (p.staff1 === name1 && p.staff2 === name2) || 
   (p.staff1 === name2 && p.staff2 === name1)
  );
 };

 // 希望休データの取得と索引化 (対象年月)
 const hopeOffList = (db.data.shift_hope_offs || []).filter(h => h.year_month === yearMonth);
 const staffHopeDays = {};
 hopeOffList.forEach(h => {
  if (!staffHopeDays[h.staff_name]) staffHopeDays[h.staff_name] = new Set();
  staffHopeDays[h.staff_name].add(parseInt(h.day, 10));
 });
 const isHopeOff = (name, day) => {
  return Boolean(staffHopeDays[name] && staffHopeDays[name].has(day));
 };

 const shiftData = {};
 staffList.forEach(s => {
  shiftData[s.name] = {};
 });

 // 2. 施設長 (木村 健一): 日勤専従 ＆ 週休2日 (土日・祝日・年末年始12/29〜1/3は公休「休」、希望休配慮)
 directors.forEach(s => {
  for (let d = 1; d <= daysInMonth; d++) {
   const dow = new Date(year, month - 1, d).getDay();
   const hol = isHolidayOrYearEnd(year, month, d);
   if (dow === 0 || dow === 6 || hol.isHoliday || isHopeOff(s.name, d)) {
    shiftData[s.name][d] = "休";
   } else {
    shiftData[s.name][d] = "日";
   }
  }
 });

 // 3. 事務員 (2名体制: 田中 慎一、松本 陽子): 日勤専従 ＆ 週休2日 (土日・祝日・年末年始12/29〜1/3は公休「休」、希望休配慮)
 officeStaff.forEach((s) => {
  for (let d = 1; d <= daysInMonth; d++) {
   const dow = new Date(year, month - 1, d).getDay();
   const hol = isHolidayOrYearEnd(year, month, d);
   if (dow === 0 || dow === 6 || hol.isHoliday || isHopeOff(s.name, d)) {
    shiftData[s.name][d] = "休";
   } else {
    shiftData[s.name][d] = "日";
   }
  }
 });

 // 4. 看護師 (2名体制: 鈴木 美智子、加藤 由美): 日勤専従 ＆ 週休2日 (相互カバーで毎日配置、希望休配慮)
 nurses.forEach((s, idx) => {
  for (let d = 1; d <= daysInMonth; d++) {
   const dow = new Date(year, month - 1, d).getDay();
   const defOff = (idx === 0) ? (dow === 0 || dow === 3) : (dow === 4 || dow === 6);
   if (isHopeOff(s.name, d) || defOff) {
    shiftData[s.name][d] = "休";
   } else {
    shiftData[s.name][d] = "日";
   }
  }
 });

 // 5. 介護職員 (14名体制): 毎日必ず「早出2名」「遅出2名」「日勤2名」「夜勤2名」「明け2名」「公休4名」
 if (careStaff.length > 0) {
  const careNames = careStaff.map(s => s.name);
  const nightCount = {};
  const earlyCount = {};
  const lateCount = {};
  const dayCount = {};
  const holidayCount = {};
  careNames.forEach(n => {
   nightCount[n] = 0;
   earlyCount[n] = 0;
   lateCount[n] = 0;
   dayCount[n] = 0;
   holidayCount[n] = 0;
  });

  // 月間公休目標 (14名体制で毎日4名公休: 31日の場合 31*4=124人日。124/14 = 8日休み2名、9日休み12名)
  const totalMonthHolidays = daysInMonth * 4;
  const baseTarget = Math.floor(totalMonthHolidays / careNames.length);
  const extraHolidays = totalMonthHolidays % careNames.length;
  const targetHolidays = {};
  careNames.forEach((n, idx) => {
   targetHolidays[n] = baseTarget + (idx < extraHolidays ? 1 : 0);
  });

  const dailyCareHolidays = {};
  for (let d = 1; d <= daysInMonth; d++) dailyCareHolidays[d] = 0;

  // 【希望休の事前確定】介護職員の希望休を最優先で公休「休」としてロック
  careNames.forEach(n => {
   if (staffHopeDays[n]) {
    staffHopeDays[n].forEach(d => {
     if (d >= 1 && d <= daysInMonth) {
      shiftData[n][d] = "休";
      holidayCount[n]++;
      dailyCareHolidays[d]++;
     }
    });
   }
  });

  // 初日 (1日) の明け2名設定 (前月最終日からの夜勤明け引き継ぎ)
  // ※ 1日に希望休を出している職員は初日明けから除外
  if (careNames.length >= 2) {
   const availForAke1 = careNames.filter(n => !isHopeOff(n, 1));
   const prevNightStaff = (availForAke1.length >= 2 ? availForAke1 : careNames).slice(-2);
   prevNightStaff.forEach(pn => {
    shiftData[pn][1] = "明";
   });
  }

  // Step A: 毎日夜勤2名の選定 (1日〜daysInMonth)
  for (let d = 1; d <= daysInMonth; d++) {
   // 候補者選定:
   // ・当日すでに「休」（希望休等）または「明」でない人
   // ・当日希望休でない人
   // ・翌日希望休でない人 (※当夜勤に入ると翌日が「明」となり希望休が潰れるため回避)
   // ・前日夜勤でない人 (※前日夜勤＝当日明のため夜勤不可)
   let candidates = careNames.filter(name => {
    if (isHopeOff(name, d)) return false;
    if (d + 1 <= daysInMonth && isHopeOff(name, d + 1)) return false;
    if (shiftData[name][d] === "休") return false;
    if (shiftData[name][d] === "明") return false;
    if (d > 1 && shiftData[name][d - 1] === "夜") return false;
    return true;
   });

   // 万一候補が2名未満の場合は翌日希望休ガードのみ緩和
   if (candidates.length < 2) {
    candidates = careNames.filter(name => {
     if (isHopeOff(name, d)) return false;
     if (shiftData[name][d] === "休") return false;
     if (shiftData[name][d] === "明") return false;
     if (d > 1 && shiftData[name][d - 1] === "夜") return false;
     return true;
    });
   }

   // 夜勤回数が少なく、前々日夜勤でない人を優先
   candidates.sort((a, b) => {
    const countDiff = nightCount[a] - nightCount[b];
    if (countDiff !== 0) return countDiff;
    const aPrev2 = (d > 2 && shiftData[a][d - 2] === "夜") ? 1 : 0;
    const bPrev2 = (d > 2 && shiftData[b][d - 2] === "夜") ? 1 : 0;
    if (aPrev2 !== bPrev2) return aPrev2 - bPrev2;
    return (careNames.indexOf(a) * 7 + d) % careNames.length - (careNames.indexOf(b) * 7 + d) % careNames.length;
   });

   // 特例配慮(NGペア: 佐藤 健太 高橋 直樹)を回避する2名を選出
   let selectedPair = null;
   for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
     const c1 = candidates[i];
     const c2 = candidates[j];
     if (!isNgPair(c1, c2)) {
      selectedPair = [c1, c2];
      break;
     }
    }
    if (selectedPair) break;
   }
   if (!selectedPair) {
    selectedPair = [candidates[0], candidates[1] || candidates[0]];
   }

   selectedPair.forEach(n => {
    shiftData[n][d] = "夜";
    nightCount[n]++;
    if (d + 1 <= daysInMonth) {
     shiftData[n][d + 1] = "明";
    }
   });
  }

  // Step B: 公休「休」の配分 (毎日必ず4名)
  // 優先1: 夜勤明けの翌日を優先して「休」とする
  for (let d = 1; d <= daysInMonth; d++) {
   careNames.forEach(n => {
    if (!shiftData[n][d]) {
     if (d > 1 && shiftData[n][d - 1] === "明" && holidayCount[n] < targetHolidays[n] && dailyCareHolidays[d] < 4) {
      shiftData[n][d] = "休";
      holidayCount[n]++;
      dailyCareHolidays[d]++;
     }
    }
   });
  }

  // 優先2: 各日に公休をバランス配分 (1日4名になるまで)
  for (let d = 1; d <= daysInMonth; d++) {
   if (dailyCareHolidays[d] < 4) {
    const sortedCare = [...careNames].sort((a, b) => holidayCount[a] - holidayCount[b]);
    for (const n of sortedCare) {
     if (holidayCount[n] < targetHolidays[n] && !shiftData[n][d] && dailyCareHolidays[d] < 4) {
      shiftData[n][d] = "休";
      holidayCount[n]++;
      dailyCareHolidays[d]++;
     }
    }
   }
  }

  // 4名未満の日があれば空いている人を公休に充当して毎日必ず4名にする
  for (let d = 1; d <= daysInMonth; d++) {
   while (dailyCareHolidays[d] < 4) {
    const unassigned = careNames.filter(n => !shiftData[n][d]);
    if (unassigned.length > 0) {
     unassigned.sort((a, b) => holidayCount[a] - holidayCount[b]);
     const pick = unassigned[0];
     shiftData[pick][d] = "休";
     holidayCount[pick]++;
     dailyCareHolidays[d]++;
    } else {
     break;
    }
   }
  }

  // Step C: 出勤可能者（毎日ちょうど6名）から「早出2名」「遅出2名」「日勤2名」を割り当て
  for (let d = 1; d <= daysInMonth; d++) {
   const avail = careNames.filter(n => !shiftData[n][d]);

   // 早出の選定 (2名選定): 前日遅番でない人を最優先し、月間早出回数が少ない人を割り当て
   const earlyCandidates = [...avail].sort((a, b) => {
    const aPrevLate = (d > 1 && shiftData[a][d - 1] === "遅") ? 1 : 0;
    const bPrevLate = (d > 1 && shiftData[b][d - 1] === "遅") ? 1 : 0;
    if (aPrevLate !== bPrevLate) return aPrevLate - bPrevLate;
    const eDiff = earlyCount[a] - earlyCount[b];
    if (eDiff !== 0) return eDiff;
    return (careNames.indexOf(a) * 3 + d) % careNames.length - (careNames.indexOf(b) * 3 + d) % careNames.length;
   });
   const pickedEarly = earlyCandidates.slice(0, 2);
   pickedEarly.forEach(n => {
    shiftData[n][d] = "早";
    earlyCount[n]++;
   });

   // 遅出の選定 (2名選定): 早出以外の候補者から、月間遅出回数が少ない人を割り当て
   const lateCandidates = avail.filter(n => !pickedEarly.includes(n)).sort((a, b) => {
    const lDiff = lateCount[a] - lateCount[b];
    if (lDiff !== 0) return lDiff;
    return (careNames.indexOf(a) * 5 + d) % careNames.length - (careNames.indexOf(b) * 5 + d) % careNames.length;
   });
   const pickedLate = lateCandidates.slice(0, 2);
   pickedLate.forEach(n => {
    shiftData[n][d] = "遅";
    lateCount[n]++;
   });

   // 残りの介護職員（2名）はすべて「日」（日勤）
   const remainingDay = avail.filter(n => !pickedEarly.includes(n) && !pickedLate.includes(n));
   remainingDay.forEach(n => {
    shiftData[n][d] = "日";
    dayCount[n]++;
   });
  }

  // Step D: 最終厳格バリデーション ＆ オートリペア (全日「早2・遅2・日2・夜2・明2」を100%完全保証)
  // ※ 希望休の職員は絶対に日勤・早番・遅番へ転換しない
  for (let d = 1; d <= daysInMonth; d++) {
   let eCount = careNames.filter(n => shiftData[n][d] === "早").length;
   let lCount = careNames.filter(n => shiftData[n][d] === "遅").length;
   let dCount = careNames.filter(n => shiftData[n][d] === "日").length;

   // 早出を2名に
   while (eCount < 2) {
    const cand = careNames.find(n => shiftData[n][d] === "日" && !isHopeOff(n, d));
    if (cand) { shiftData[cand][d] = "早"; eCount++; dCount--; } else break;
   }
   // 遅出を2名に
   while (lCount < 2) {
    const cand = careNames.find(n => shiftData[n][d] === "日" && !isHopeOff(n, d));
    if (cand) { shiftData[cand][d] = "遅"; lCount++; dCount--; } else break;
   }
   // 日勤を2名に (希望休でない公休職員のみ日勤へ充当)
   while (dCount < 2) {
    const cand = careNames.find(n => shiftData[n][d] === "休" && !isHopeOff(n, d));
    if (cand) { shiftData[cand][d] = "日"; dCount++; } else break;
   }
  }
 }

 if (!db.data.monthly_shifts) db.data.monthly_shifts = {};
 db.data.monthly_shifts[yearMonth] = shiftData;
 db.save();
 if (typeof renderTodayShiftBar === "function") renderTodayShiftBar();
 if (typeof renderDailyJournal === "function" && gState.activeCareTab === "daily_journal") renderDailyJournal();
 return shiftData;
}

function renderShiftTable(yearMonth) {
 const ym = yearMonth || getShiftYearMonth();
 const [yearStr, monthStr] = ym.split("-");
 const year = parseInt(yearStr, 10);
 const month = parseInt(monthStr, 10);
 const daysInMonth = new Date(year, month, 0).getDate();

 const allStamps = sortStaffList(db.data.stamps || []);
 const staffList = allStamps.map(s => typeof s === "string" ? { name: s, role: "介護職員" } : s);
 const isCare = s => getStaffRoleCategory(s.name) === "care";
 const careStaffNames = staffList.filter(isCare).map(s => s.name);

 // シフトデータの存在および完全性チェック (全日「早2・遅2・日2・夜2・明2」を満たしているか、最新職員が含まれているか)
 let needRegen = false;
 const currentData = db.data.monthly_shifts && db.data.monthly_shifts[ym];
 if (!currentData || Object.keys(currentData).length === 0) {
 needRegen = true;
 } else {
 const missingStaff = careStaffNames.some(name => !currentData[name]);
 if (missingStaff) {
 needRegen = true;
 }
 }
 if (!needRegen && currentData) {
 const hopeList = (db.data.shift_hope_offs || []).filter(h => h.year_month === ym);
 const unreflectedHope = hopeList.some(h => currentData[h.staff_name] && currentData[h.staff_name][h.day] !== "休");
 if (unreflectedHope) {
 needRegen = true;
 }
 }

 if (needRegen) {
 generateMonthlyShiftData(ym);
 }
 const shiftData = db.data.monthly_shifts[ym] || {};

 const table = document.getElementById("shiftMatrixTable");
 if (!table) return;

 const dowNames = ["日", "月", "火", "水", "木", "金", "土"];

 // 日別統計用 (介護職: 早出2名・遅出2名・夜勤2名・明け2名・日勤2名・公休4名)
 const dailyEarlyCount = new Array(daysInMonth + 1).fill(0);
 const dailyLateCount = new Array(daysInMonth + 1).fill(0);
 const dailyNightCount = new Array(daysInMonth + 1).fill(0);
 const dailyAkeCount = new Array(daysInMonth + 1).fill(0);
 const dailyCareDayCount = new Array(daysInMonth + 1).fill(0);
 const dailyDayCount = new Array(daysInMonth + 1).fill(0);
 const dailyHolidayCount = new Array(daysInMonth + 1).fill(0);

 // 1. ヘッダー生成
 let theadHtml = `
 <thead>
 <tr>
 <th rowspan="2" style="position:sticky; left:0; z-index:4; background:#1e3a8a; color:#fff; width:130px; min-width:130px; border:1px solid #3b82f6;">職員氏名</th>
 <th rowspan="2" style="background:#1e3a8a; color:#fff; width:80px; min-width:80px; border:1px solid #3b82f6;">役職</th>
 `;

 for (let d = 1; d <= daysInMonth; d++) {
 const dow = new Date(year, month - 1, d).getDay();
 const hol = isHolidayOrYearEnd(year, month, d);
 const isSat = dow === 6;
 const isSun = dow === 0 || hol.isHoliday;
 const bg = isSun ? "#ef4444" : (isSat ? "#2563eb" : "#3b82f6");
 const titleAttr = hol.isHoliday ? `title="${hol.name}"` : '';
 theadHtml += `<th style="background:${bg}; color:#fff; padding:4px 2px; min-width:32px; border:1px solid rgba(255,255,255,0.3); font-weight:bold;" ${titleAttr}>${d}</th>`;
 }

 theadHtml += `
 <th rowspan="2" style="background:#1e3a8a; color:#fff; min-width:38px; border:1px solid #3b82f6;" title="出勤日数">出勤</th>
 <th rowspan="2" style="background:#1e3a8a; color:#fff; min-width:38px; border:1px solid #3b82f6;" title="夜勤回数">夜勤</th>
 <th rowspan="2" style="background:#1e3a8a; color:#fff; min-width:38px; border:1px solid #3b82f6;" title="公休日数">公休</th>
 </tr>
 <tr>
 `;

 for (let d = 1; d <= daysInMonth; d++) {
 const dow = new Date(year, month - 1, d).getDay();
 const hol = isHolidayOrYearEnd(year, month, d);
 const isSat = dow === 6;
 const isSun = dow === 0 || hol.isHoliday;
 const bg = isSun ? "#fee2e2" : (isSat ? "#dbeafe" : "#f1f5f9");
 const color = isSun ? "#b91c1c" : (isSat ? "#1d4ed8" : "#475569");
 const dowLabel = hol.isHoliday ? (hol.name.length <= 3 ? hol.name : "祝") : dowNames[dow];
 const titleAttr = hol.isHoliday ? `title="${hol.name}"` : '';
 theadHtml += `<th style="background:${bg}; color:${color}; padding:2px; font-size:10.5px; font-weight:bold; border:1px solid #cbd5e1;" ${titleAttr}>${dowLabel}</th>`;
 }

 theadHtml += `
 </tr>
 </thead>
 `;

 // 2. ボディ行（各職員）生成
 let tbodyHtml = "<tbody>";

 const hopeOffs = (db.data.shift_hope_offs || []).filter(h => h.year_month === ym);
 const hopeOffMap = {};
 hopeOffs.forEach(h => {
  hopeOffMap[`${h.staff_name}_${h.day}`] = h;
 });
 staffList.forEach(st => {
 const staffShifts = shiftData[st.name] || {};
 const isCareStaff = getStaffRoleCategory(st.name) === "care";
 let workDays = 0;
 let nightDays = 0;
 let holidays = 0;

 let roleColor = "#64748b";
 let roleBg = "#f1f5f9";
 if (st.role.includes("施設長") || st.role.includes("管理者")) {
 roleColor = "#92400e"; roleBg = "#fef3c7";
 } else if (st.role.includes("事務")) {
 roleColor = "#065f46"; roleBg = "#d1fae5";
 } else if (st.role.includes("看護")) {
 roleColor = "#0369a1"; roleBg = "#e0f2fe";
 } else if (st.role.includes("リーダー")) {
 roleColor = "#6d28d9"; roleBg = "#ede9fe";
 }

 tbodyHtml += `
 <tr>
 <td style="position:sticky; left:0; z-index:2; background:#ffffff; font-weight:bold; color:#1e293b; text-align:left; padding:6px 8px; border:1px solid #cbd5e1; white-space:nowrap; box-shadow: 2px 0 4px rgba(0,0,0,0.04);">
 ${escapeHtml(st.name)}
 </td>
 <td style="border:1px solid #cbd5e1; padding:4px 2px; white-space:nowrap;">
 <span style="display:inline-block; font-size:11px; padding:2px 4px; border-radius:4px; font-weight:bold; background:${roleBg}; color:${roleColor};">${st.role || '介護'}</span>
 </td>
 `;

 for (let d = 1; d <= daysInMonth; d++) {
 const sym = staffShifts[d] || "";
   const isHope = Boolean(hopeOffMap[`${st.name}_${d}`]);
   const hopeInfo = hopeOffMap[`${st.name}_${d}`];
   let hopeTag = "";
   if (isHope) {
    hopeTag = `<span class="shift-hope-tag">希望</span>`;
   }
 const dow = new Date(year, month - 1, d).getDay();
 const hol = isHolidayOrYearEnd(year, month, d);
 const isSat = dow === 6;
 const isSun = dow === 0 || hol.isHoliday;

 let cellBg = isSun ? "#fff5f5" : (isSat ? "#f8fafc" : "#ffffff");
   if (isHope) cellBg = "#fef2f2";
 let badgeClass = "";
 if (sym === "早") {
 badgeClass = "shift-badge shift-haya";
 workDays++;
 dailyEarlyCount[d]++;
 } else if (sym === "日") {
 badgeClass = "shift-badge shift-nichi";
 workDays++;
 dailyDayCount[d]++;
 if (isCareStaff) dailyCareDayCount[d]++;
 } else if (sym === "遅") {
 badgeClass = "shift-badge shift-osoba";
 workDays++;
 dailyLateCount[d]++;
 } else if (sym === "夜") {
 badgeClass = "shift-badge shift-yakan";
 workDays++;
 nightDays++;
 dailyNightCount[d]++;
 } else if (sym === "明") {
 badgeClass = "shift-badge shift-ake";
 workDays++;
 dailyAkeCount[d]++;
 } else if (sym === "休") {
 badgeClass = "shift-badge shift-kyu";
 holidays++;
 if (isCareStaff) dailyHolidayCount[d]++;
 }

 const safeName = escapeHtml(st.name);
 tbodyHtml += `
   <td class="shift-cell ${hol.isHoliday ? 'shift-holiday-col' : ''} ${isHope ? 'shift-cell-hope' : ''}" style="background:${cellBg};" onclick="openShiftCellPopover(event, '${safeName}', ${d}, '${sym}')" ondblclick="cycleShiftCell('${safeName}', ${d})" title="${st.name} ${month}月${d}日: ${isHope ? '【希望休】' + (hopeInfo.reason || '申請済') + ' - ' : ''}クリックして即時変更">
   ${sym ? `<span class="${badgeClass}">${sym}</span>${hopeTag}` : `<span style="color:#cbd5e1;">-</span>`}
 </td>
 `;
 }

 tbodyHtml += `
 <td style="border:1px solid #cbd5e1; font-weight:bold; color:#1e293b; background:#f8fafc;">${workDays}</td>
 <td style="border:1px solid #cbd5e1; font-weight:bold; color:#3730a3; background:#f8fafc;">${nightDays}</td>
 <td style="border:1px solid #cbd5e1; font-weight:bold; color:#b91c1c; background:#f8fafc;">${holidays}</td>
 </tr>
 `;
 });

 tbodyHtml += "</tbody>";

 // 3. フッター集計行 (早出2名・遅出2名・夜勤2名・明け2名・介護日勤2名・全体日勤・介護公休4名)
 let tfootHtml = `
 <tfoot>
 <!-- 早出人数チェック行 (基準: 2名) -->
 <tr style="background:#ffedd5; font-weight:bold; border-top:2px solid #ea580c;">
 <td style="position:sticky; left:0; z-index:2; background:#ffedd5; text-align:left; padding:5px 8px; border:1px solid #fed7aa; color:#9a3412;" colspan="2">
 早出体制 (基準: 2名)
 </td>
 `;
 for (let d = 1; d <= daysInMonth; d++) {
 const cnt = dailyEarlyCount[d];
 let badgeStyle = "color:#16a34a; font-weight:bold; font-size:12.5px;";
 if (cnt === 2) {
 badgeStyle = "color:#16a34a; font-weight:bold; font-size:12.5px;";
 } else if (cnt < 2) {
 badgeStyle = "color:#dc2626; font-weight:bold; background:#fee2e2; border-radius:3px; padding:1px 3px; font-size:12.5px;";
 } else {
 badgeStyle = "color:#b45309; font-weight:bold; background:#fef3c7; border-radius:3px; padding:1px 3px; font-size:12.5px;";
 }
 tfootHtml += `<td style="border:1px solid #fed7aa; padding:3px 2px;"><span style="${badgeStyle}">${cnt}</span></td>`;
 }
 tfootHtml += `
 <td colspan="3" style="border:1px solid #fed7aa; color:#9a3412; font-size:11px;">毎日2名</td>
 </tr>

 <!-- 遅出人数チェック行 (基準: 2名) -->
 <tr style="background:#ede9fe; font-weight:bold;">
 <td style="position:sticky; left:0; z-index:2; background:#ede9fe; text-align:left; padding:5px 8px; border:1px solid #ddd6fe; color:#5b21b6;" colspan="2">
 遅出体制 (基準: 2名)
 </td>
 `;
 for (let d = 1; d <= daysInMonth; d++) {
 const cnt = dailyLateCount[d];
 let badgeStyle = "color:#16a34a; font-weight:bold; font-size:12.5px;";
 if (cnt === 2) {
 badgeStyle = "color:#16a34a; font-weight:bold; font-size:12.5px;";
 } else if (cnt < 2) {
 badgeStyle = "color:#dc2626; font-weight:bold; background:#fee2e2; border-radius:3px; padding:1px 3px; font-size:12.5px;";
 } else {
 badgeStyle = "color:#b45309; font-weight:bold; background:#fef3c7; border-radius:3px; padding:1px 3px; font-size:12.5px;";
 }
 tfootHtml += `<td style="border:1px solid #ddd6fe; padding:3px 2px;"><span style="${badgeStyle}">${cnt}</span></td>`;
 }
 tfootHtml += `
 <td colspan="3" style="border:1px solid #ddd6fe; color:#5b21b6; font-size:11px;">毎日2名</td>
 </tr>

 <!-- 夜勤人数チェック行 (基準: 2名) -->
 <tr style="background:#e0e7ff; font-weight:bold;">
 <td style="position:sticky; left:0; z-index:2; background:#e0e7ff; text-align:left; padding:5px 8px; border:1px solid #c7d2fe; color:#3730a3;" colspan="2">
 夜勤体制 (基準: 2名)
 </td>
 `;
 for (let d = 1; d <= daysInMonth; d++) {
 const cnt = dailyNightCount[d];
 let badgeStyle = "color:#16a34a; font-weight:bold; font-size:12.5px;";
 if (cnt === 2) {
 badgeStyle = "color:#16a34a; font-weight:bold; font-size:12.5px;";
 } else if (cnt < 2) {
 badgeStyle = "color:#dc2626; font-weight:bold; background:#fee2e2; border-radius:3px; padding:1px 3px; font-size:12.5px;";
 } else {
 badgeStyle = "color:#b45309; font-weight:bold; background:#fef3c7; border-radius:3px; padding:1px 3px; font-size:12.5px;";
 }
 tfootHtml += `<td style="border:1px solid #c7d2fe; padding:3px 2px;"><span style="${badgeStyle}">${cnt}</span></td>`;
 }
 tfootHtml += `
 <td colspan="3" style="border:1px solid #c7d2fe; color:#3730a3; font-size:11px;">毎日2名</td>
 </tr>

 <!-- 明け人数チェック行 (基準: 2名) -->
 <tr style="background:#fef9c3; font-weight:bold;">
 <td style="position:sticky; left:0; z-index:2; background:#fef9c3; text-align:left; padding:5px 8px; border:1px solid #fef08a; color:#854d0e;" colspan="2">
 明け体制 (基準: 2名)
 </td>
 `;
 for (let d = 1; d <= daysInMonth; d++) {
 const cnt = dailyAkeCount[d];
 let badgeStyle = "color:#16a34a; font-weight:bold; font-size:12.5px;";
 if (cnt === 2) {
 badgeStyle = "color:#16a34a; font-weight:bold; font-size:12.5px;";
 } else if (cnt < 2) {
 badgeStyle = "color:#dc2626; font-weight:bold; background:#fee2e2; border-radius:3px; padding:1px 3px; font-size:12.5px;";
 } else {
 badgeStyle = "color:#b45309; font-weight:bold; background:#fef3c7; border-radius:3px; padding:1px 3px; font-size:12.5px;";
 }
 tfootHtml += `<td style="border:1px solid #fef08a; padding:3px 2px;"><span style="${badgeStyle}">${cnt}</span></td>`;
 }
 tfootHtml += `
 <td colspan="3" style="border:1px solid #fef08a; color:#854d0e; font-size:11px;">毎日2名</td>
 </tr>

 <!-- 介護日勤人数行 (基準: 2名) -->
 <tr style="background:#e0f2fe; font-weight:bold;">
 <td style="position:sticky; left:0; z-index:2; background:#e0f2fe; text-align:left; padding:5px 8px; border:1px solid #bae6fd; color:#0369a1;" colspan="2">
  介護日勤 (基準: 2名)
 </td>
 `;
 for (let d = 1; d <= daysInMonth; d++) {
 const cnt = dailyCareDayCount[d];
 let badgeStyle = "color:#16a34a; font-weight:bold; font-size:12.5px;";
 if (cnt === 2) {
 badgeStyle = "color:#16a34a; font-weight:bold; font-size:12.5px;";
 } else if (cnt < 2) {
 badgeStyle = "color:#dc2626; font-weight:bold; background:#fee2e2; border-radius:3px; padding:1px 3px; font-size:12.5px;";
 } else {
 badgeStyle = "color:#b45309; font-weight:bold; background:#fef3c7; border-radius:3px; padding:1px 3px; font-size:12.5px;";
 }
 tfootHtml += `<td style="border:1px solid #bae6fd; padding:3px 2px;"><span style="${badgeStyle}">${cnt}</span></td>`;
 }
 tfootHtml += `
 <td colspan="3" style="border:1px solid #bae6fd; color:#0369a1; font-size:11px;">毎日2名</td>
 </tr>

 <!-- 全体日勤人数行 (施設長・事務・看護含む) -->
 <tr style="background:#f1f5f9; font-weight:bold;">
 <td style="position:sticky; left:0; z-index:2; background:#f1f5f9; text-align:left; padding:5px 8px; border:1px solid #cbd5e1; color:#334155;" colspan="2">
 全体日勤 (施設長・事務・看護含む)
 </td>
 `;
 for (let d = 1; d <= daysInMonth; d++) {
 const cnt = dailyDayCount[d];
 tfootHtml += `<td style="border:1px solid #cbd5e1; padding:3px 2px; color:#334155;">${cnt}</td>`;
 }
 tfootHtml += `
 <td colspan="3" style="border:1px solid #cbd5e1; color:#64748b; font-size:11px;">施設全体</td>
 </tr>

 <!-- 介護公休人数行 (基準: 4名) -->
 <tr style="background:#fef2f2; font-weight:bold;">
 <td style="position:sticky; left:0; z-index:2; background:#fef2f2; text-align:left; padding:5px 8px; border:1px solid #fecaca; color:#991b1b;" colspan="2">
 介護公休 (週休2日・基準: 4名)
 </td>
 `;
 for (let d = 1; d <= daysInMonth; d++) {
 const cnt = dailyHolidayCount[d];
 let badgeStyle = "color:#16a34a; font-weight:bold; font-size:12.5px;";
 if (cnt === 4) {
 badgeStyle = "color:#16a34a; font-weight:bold; font-size:12.5px;";
 } else {
 badgeStyle = "color:#b45309; font-weight:bold; background:#fef3c7; border-radius:3px; padding:1px 3px; font-size:12.5px;";
 }
 tfootHtml += `<td style="border:1px solid #fecaca; padding:3px 2px;"><span style="${badgeStyle}">${cnt}</span></td>`;
 }
 tfootHtml += `
 <td colspan="3" style="border:1px solid #fecaca; color:#991b1b; font-size:11px;">公休合計</td>
 </tr>
 </tfoot>
 `;

 table.innerHTML = theadHtml + tbodyHtml + tfootHtml;
}

// クイック変更ポップオーバー (セル直下で職種別安全選択)
function openShiftCellPopover(event, staffName, day, currentSymbol) {
 if (event) event.stopPropagation();
 const ym = getShiftYearMonth();
 const [yearStr, monthStr] = ym.split("-");
 const year = parseInt(yearStr, 10);
 const month = parseInt(monthStr, 10);
 const dowNames = ["日", "月", "火", "水", "木", "金", "土"];
 const dow = new Date(year, month - 1, day).getDay();
 const hol = isHolidayOrYearEnd(year, month, day);

 gShiftEditingCell = { staffName, day, yearMonth: ym };
 const isHope = (db.data.shift_hope_offs || []).some(h => 
  h.year_month === ym && h.staff_name === staffName && parseInt(h.day, 10) === day
 );

 let popover = document.getElementById("shiftCellPopover");
 if (!popover) {
 popover = document.createElement("div");
 popover.id = "shiftCellPopover";
 popover.className = "shift-cell-popover";
 document.body.appendChild(popover);
 }

 const rect = event ? event.currentTarget.getBoundingClientRect() : { top: 200, bottom: 230, left: 200 };
 const dateInfo = hol.isHoliday ? `${month}/${day}(${dowNames[dow]}・${hol.name})` : `${month}/${day}(${dowNames[dow]})`;
 const roleCategory = getStaffRoleCategory(staffName);

 let roleBadgeLabel = "介護職員";
 if (roleCategory === "director") roleBadgeLabel = "施設長（日勤専従）";
 else if (roleCategory === "office") roleBadgeLabel = "事務員（日勤専従）";
 else if (roleCategory === "nurse") roleBadgeLabel = "看護師（日勤専従）";

 let contentHtml = "";

 if (roleCategory !== "care") {
 // 施設長・事務員・看護師: 日勤または公休のみ！夜勤・早・遅は完全除外で誤操作を絶対防止
 contentHtml = `
 <div class="shift-popover-header">
 <div>
 <strong style="color:#1e3a8a;">${escapeHtml(staffName)}</strong> 
 <span style="color:#64748b; font-size:11.5px; margin-left:4px;">${dateInfo}</span>
 </div>
 <button onclick="closeShiftPopover()" style="border:none; background:none; font-size:16px; cursor:pointer; color:#94a3b8; line-height:1;">&times;</button>
 </div>
 <div style="font-size:11px; color:#0369a1; background:#f0f9ff; border:1px solid #bae6fd; border-radius:4px; padding:3px 6px; margin-bottom:8px;">
 <strong>${roleBadgeLabel}</strong><br>日勤または公休のみ選択可能です（夜勤・早遅は自動ガード）
 </div>
 <div class="shift-popover-grid" style="grid-template-columns: 1fr 1fr;">
 <button class="shift-popover-btn btn-nichi" onclick="executeShiftCellEdit('日')"> 日勤</button>
 <button class="shift-popover-btn btn-kyu" onclick="executeShiftCellEdit('休')"> 公休</button>
 <button class="shift-popover-btn btn-clear" onclick="executeShiftCellEdit('')" style="grid-column: span 2;"> クリア</button>
 </div>
   <div style="margin-top:8px; padding-top:6px; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
   <button type="button" class="btn btn-outline" style="font-size:11px; padding:3px 8px; ${isHope ? 'background:#fee2e2; color:#b91c1c; border-color:#fca5a5; font-weight:bold;' : 'background:#f8fafc; color:#475569;'}" onclick="toggleShiftHopeOff('${escapeHtml(staffName)}', ${day})">${isHope ? '希望休の解除' : '＋ この日を希望休に設定'}</button>
 <a href="javascript:void(0)" onclick="closeShiftPopover(); openShiftCellModal('${escapeHtml(staffName)}', ${day})" style="font-size:11px; color:#2563eb; text-decoration:underline;"> 詳細設定</a>
 </div>
 `;
 } else {
 // 介護職員: 全シフト選択可能
 contentHtml = `
 <div class="shift-popover-header">
 <div>
 <strong style="color:#1e3a8a;">${escapeHtml(staffName)}</strong> 
 <span style="color:#64748b; font-size:11.5px; margin-left:4px;">${dateInfo}</span>
 </div>
 <button onclick="closeShiftPopover()" style="border:none; background:none; font-size:16px; cursor:pointer; color:#94a3b8; line-height:1;">&times;</button>
 </div>
 <div style="font-size:11px; color:#475569; margin-bottom:6px;">
 介護職員シフト（基準: 早出1名・遅出1名・夜勤2名体制）
 </div>
 <div class="shift-popover-grid">
 <button class="shift-popover-btn btn-haya" onclick="executeShiftCellEdit('早')"> 早番</button>
 <button class="shift-popover-btn btn-nichi" onclick="executeShiftCellEdit('日')"> 日勤</button>
 <button class="shift-popover-btn btn-osoba" onclick="executeShiftCellEdit('遅')"> 遅番</button>
 <button class="shift-popover-btn btn-yakan" onclick="executeShiftCellEdit('夜')"> 夜勤</button>
 <button class="shift-popover-btn btn-ake" onclick="executeShiftCellEdit('明')"> 明け</button>
 <button class="shift-popover-btn btn-kyu" onclick="executeShiftCellEdit('休')"> 公休</button>
 <button class="shift-popover-btn btn-clear" onclick="executeShiftCellEdit('')" style="grid-column: span 2;"> クリア</button>
 </div>
   <div style="margin-top:8px; padding-top:6px; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
   <button type="button" class="btn btn-outline" style="font-size:11px; padding:3px 8px; ${isHope ? 'background:#fee2e2; color:#b91c1c; border-color:#fca5a5; font-weight:bold;' : 'background:#f8fafc; color:#475569;'}" onclick="toggleShiftHopeOff('${escapeHtml(staffName)}', ${day})">${isHope ? '希望休の解除' : '＋ この日を希望休に設定'}</button>
 <a href="javascript:void(0)" onclick="closeShiftPopover(); openShiftCellModal('${escapeHtml(staffName)}', ${day})" style="font-size:11px; color:#2563eb; text-decoration:underline;"> 詳細設定</a>
 </div>
 `;
 }

 popover.innerHTML = contentHtml;

 // 画面位置の調整 (画面外はみ出し防止)
 let top = rect.bottom + window.scrollY + 6;
 let left = rect.left + window.scrollX - 60;
 if (left < 10) left = 10;
 if (left + 270 > window.innerWidth) left = window.innerWidth - 280;
 if (rect.bottom + 160 > window.innerHeight) {
 top = rect.top + window.scrollY - 150;
 }

 popover.style.top = `${top}px`;
 popover.style.left = `${left}px`;
 popover.style.display = "block";
}

function closeShiftPopover() {
 const p = document.getElementById("shiftCellPopover");
 if (p) p.style.display = "none";
}

function executeShiftCellEdit(symbol) {
 applyShiftCellEdit(symbol);
 closeShiftPopover();
}

// ダブルクリックで安全な切り替え (事務・施設長・看護師は「日 ⇄ 休」のみ、介護職も日勤・公休安全トグルで夜勤誤爆を完全防止)
function cycleShiftCell(staffName, day) {
 const ym = getShiftYearMonth();
 if (!db.data.monthly_shifts) db.data.monthly_shifts = {};
 if (!db.data.monthly_shifts[ym]) db.data.monthly_shifts[ym] = {};
 if (!db.data.monthly_shifts[ym][staffName]) db.data.monthly_shifts[ym][staffName] = {};

 const cur = db.data.monthly_shifts[ym][staffName][day] || "";
 const roleCategory = getStaffRoleCategory(staffName);

 let nextSym = "日";
 if (roleCategory !== "care") {
 // 施設長・事務員・看護師: 「日 ⇄ 休」のみ安全にトグル！決して夜勤や早出・遅出にならない！
 nextSym = (cur === "日") ? "休" : "日";
 } else {
 // 介護職員: 誤操作で夜勤にならないよう安全に「日 ⇄ 休」をトグル
 // 夜勤・早番・遅番への変更はポップオーバーから明示的に選択
 if (cur === "日") nextSym = "休";
 else if (cur === "休") nextSym = "日";
 else if (cur === "早" || cur === "遅" || cur === "夜") nextSym = "日";
 else if (cur === "明") nextSym = "休";
 else nextSym = "日";
 }

 gShiftEditingCell = { staffName, day, yearMonth: ym };
 applyShiftCellEdit(nextSym);
}

// ポップオーバー外側クリックで閉じるリスナー
if (typeof window !== "undefined") {
 document.addEventListener("click", (e) => {
 const popover = document.getElementById("shiftCellPopover");
 if (popover && popover.style.display !== "none") {
 if (!popover.contains(e.target) && !e.target.closest(".shift-cell")) {
 popover.style.display = "none";
 }
 }
 });
}

// 手動セル編集モーダル (職種別ガード付き)
function openShiftCellModal(staffName, day) {
 const ym = getShiftYearMonth();
 const [yearStr, monthStr] = ym.split("-");
 const year = parseInt(yearStr, 10);
 const month = parseInt(monthStr, 10);
 const dowNames = ["日", "月", "火", "水", "木", "金", "土"];
 const dow = new Date(year, month - 1, day).getDay();
 const hol = isHolidayOrYearEnd(year, month, day);

 gShiftEditingCell = { staffName, day, yearMonth: ym };

 const targetText = document.getElementById("shiftEditTargetText");
 if (targetText) {
 const dateLabel = hol.isHoliday ? `${month}月${day}日(${dowNames[dow]}・${hol.name})` : `${month}月${day}日(${dowNames[dow]})`;
 targetText.textContent = `${staffName} - ${dateLabel}`;
 }

 const roleCategory = getStaffRoleCategory(staffName);
 const notice = document.getElementById("shiftEditRoleNotice");
 const btnEarly = document.querySelector("#shiftEditButtonsContainer button:nth-child(1)");
 const btnDay = document.querySelector("#shiftEditButtonsContainer button:nth-child(2)");
 const btnLate = document.querySelector("#shiftEditButtonsContainer button:nth-child(3)");
 const btnNight = document.querySelector("#shiftEditButtonsContainer button:nth-child(4)");
 const btnDawn = document.querySelector("#shiftEditButtonsContainer button:nth-child(5)");
 const btnHoliday = document.querySelector("#shiftEditButtonsContainer button:nth-child(6)");

 if (roleCategory !== "care") {
 if (notice) notice.innerHTML = "<span style='color:#0369a1; font-weight:bold;'> 施設長・事務員・看護師は日勤専従（土日祝・年末年始休み）です。<br>日勤または公休のみ選択可能です。</span>";
 if (btnEarly) { btnEarly.disabled = true; btnEarly.style.opacity = "0.35"; btnEarly.style.pointerEvents = "none"; }
 if (btnLate) { btnLate.disabled = true; btnLate.style.opacity = "0.35"; btnLate.style.pointerEvents = "none"; }
 if (btnNight) { btnNight.disabled = true; btnNight.style.opacity = "0.35"; btnNight.style.pointerEvents = "none"; }
 if (btnDawn) { btnDawn.disabled = true; btnDawn.style.opacity = "0.35"; btnDawn.style.pointerEvents = "none"; }
 if (btnDay) { btnDay.disabled = false; btnDay.style.opacity = "1"; btnDay.style.pointerEvents = "auto"; }
 if (btnHoliday) { btnHoliday.disabled = false; btnHoliday.style.opacity = "1"; btnHoliday.style.pointerEvents = "auto"; }
 } else {
 if (notice) notice.innerHTML = "<span style='color:#475569;'> 介護職員（基準: 毎日早出1名・遅出1名・夜勤2名体制）</span>";
 [btnEarly, btnDay, btnLate, btnNight, btnDawn, btnHoliday].forEach(btn => {
 if (btn) { btn.disabled = false; btn.style.opacity = "1"; btn.style.pointerEvents = "auto"; }
 });
 }

 const modal = document.getElementById("shiftEditModal");
 if (modal) modal.style.display = "flex";
}

function applyShiftCellEdit(symbol) {
 if (!gShiftEditingCell) return;
 const { staffName, day, yearMonth } = gShiftEditingCell;
 if (!staffName || !day || !yearMonth) return;

 const roleCategory = getStaffRoleCategory(staffName);

 // 職種制約ガード: 施設長・事務員・看護師は「日」「休」「クリア」以外を厳格に拒絶
 if (roleCategory !== "care" && symbol && symbol !== "日" && symbol !== "休") {
 alert(` 【職種制約ガード】\n${staffName} は日勤専従のため、「日勤」または「公休」のみ設定可能です。\n（夜勤・早番・遅番・明けへの誤変更を防止しました）`);
 return;
 }

 if (!db.data.monthly_shifts) db.data.monthly_shifts = {};
 if (!db.data.monthly_shifts[yearMonth]) db.data.monthly_shifts[yearMonth] = {};
 if (!db.data.monthly_shifts[yearMonth][staffName]) db.data.monthly_shifts[yearMonth][staffName] = {};

 db.data.monthly_shifts[yearMonth][staffName][day] = symbol;

 // 介護職で夜勤に手動変更した場合、翌日が当月内であれば「明」にする連動アシスト
 if (roleCategory === "care" && symbol === "夜") {
 const [yStr, mStr] = yearMonth.split("-");
 const daysInMonth = new Date(parseInt(yStr, 10), parseInt(mStr, 10), 0).getDate();
 if (day + 1 <= daysInMonth) {
 const curNext = db.data.monthly_shifts[yearMonth][staffName][day + 1];
 if (!curNext || curNext === "日" || curNext === "早" || curNext === "遅") {
 db.data.monthly_shifts[yearMonth][staffName][day + 1] = "明";
 }
 }
 }

 db.save();
 closeModal("shiftEditModal");
 closeShiftPopover();
 renderShiftTable(yearMonth);
 if (typeof renderTodayShiftBar === "function") renderTodayShiftBar();
 if (typeof renderDailyJournal === "function" && gState.activeCareTab === "daily_journal") renderDailyJournal();
}

// 特例配慮設定 (同番NG) モーダル
function openShiftNgModal() {
 const stamps = sortStaffList(db.data.stamps || []);
 const staffList = stamps.map(s => typeof s === "string" ? { name: s, role: "介護職員" } : s);

 const sel1 = document.getElementById("shiftNgStaff1");
 const sel2 = document.getElementById("shiftNgStaff2");

 if (sel1 && sel2) {
 const optionsHtml = staffList.map(s => `<option value="${s.name}">${s.name} (${s.role || '介護職員'})</option>`).join("");
 sel1.innerHTML = optionsHtml;
 sel2.innerHTML = optionsHtml;
 if (staffList.length > 1) {
 sel2.selectedIndex = 1;
 }
 }

 renderShiftNgList();
 const modal = document.getElementById("shiftNgModal");
 if (modal) modal.style.display = "flex";
}

function renderShiftNgList() {
 const container = document.getElementById("shiftNgPairList");
 if (!container) return;

 const pairs = db.data.shift_ng_pairs || [];
 if (pairs.length === 0) {
 container.innerHTML = `<div style="padding:14px; text-align:center; color:#94a3b8; font-size:12px;">登録された配慮ペアはありません。</div>`;
 return;
 }

 let html = `<ul style="list-style:none; padding:0; margin:0;">`;
 pairs.forEach(p => {
 html += `
 <li style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; border-bottom:1px solid #f1f5f9; font-size:12.5px;">
 <div>
 <strong style="color:#1e293b;">${escapeHtml(p.staff1)}</strong> 
 <span style="color:#dc2626; font-weight:bold; margin:0 4px;"></span> 
 <strong style="color:#1e293b;">${escapeHtml(p.staff2)}</strong>
 <span style="color:#64748b; font-size:11.5px; margin-left:8px;">(${escapeHtml(p.reason || '相性配慮')})</span>
 </div>
 <button class="btn btn-outline" style="padding:2px 8px; font-size:11px; color:#ef4444; border-color:#fca5a5;" onclick="deleteShiftNgPair(${p.id})">削除</button>
 </li>
 `;
 });
 html += `</ul>`;
 container.innerHTML = html;
}

function submitShiftNgPair() {
 const sel1 = document.getElementById("shiftNgStaff1");
 const sel2 = document.getElementById("shiftNgStaff2");
 const reasonInput = document.getElementById("shiftNgReason");

 if (!sel1 || !sel2) return;
 const s1 = sel1.value;
 const s2 = sel2.value;
 const reason = reasonInput ? (reasonInput.value.trim() || "相性配慮 (同日夜勤NG)") : "相性配慮 (同日夜勤NG)";

 if (s1 === s2) {
 alert("異なる職員を選択してください。");
 return;
 }

 if (!Array.isArray(db.data.shift_ng_pairs)) db.data.shift_ng_pairs = [];

 const exists = db.data.shift_ng_pairs.some(p => 
 (p.staff1 === s1 && p.staff2 === s2) || 
 (p.staff1 === s2 && p.staff2 === s1)
 );

 if (exists) {
 alert("このペアは既に登録されています。");
 return;
 }

 db.data.shift_ng_pairs.push({
 id: Date.now(),
 staff1: s1,
 staff2: s2,
 reason: reason
 });

 db.save();
 renderShiftNgList();
 if (reasonInput) reasonInput.value = "";
}

function deleteShiftNgPair(id) {
 if (!confirm("この配慮ルールを削除しますか？")) return;
 db.data.shift_ng_pairs = (db.data.shift_ng_pairs || []).filter(p => p.id !== id);
 db.save();
 renderShiftNgList();
}

// 希望休・事前要望管理機能
function openShiftHopeModal() {
 const ym = getShiftYearMonth();
 const [yearStr, monthStr] = ym.split("-");
 const year = parseInt(yearStr, 10);
 const month = parseInt(monthStr, 10);
 const daysInMonth = new Date(year, month, 0).getDate();

 const allStamps = sortStaffList(db.data.stamps || []);
 const staffList = allStamps.map(s => typeof s === "string" ? { name: s, role: "介護職員" } : s);

 const staffSel = document.getElementById("shiftHopeStaff");
 if (staffSel) {
  staffSel.innerHTML = staffList.map(s => `<option value="${escapeHtml(s.name)}">${escapeHtml(s.name)} (${escapeHtml(s.role || "介護職員")})</option>`).join("");
 }

 const daySel = document.getElementById("shiftHopeDay");
 if (daySel) {
  const dowNames = ["日", "月", "火", "水", "木", "金", "土"];
  let dayOptions = "";
  for (let d = 1; d <= daysInMonth; d++) {
   const dow = new Date(year, month - 1, d).getDay();
   const hol = isHolidayOrYearEnd(year, month, d);
   const label = hol.isHoliday ? `${d}日 (${dowNames[dow]}・祝)` : `${d}日 (${dowNames[dow]})`;
   dayOptions += `<option value="${d}">${label}</option>`;
  }
  daySel.innerHTML = dayOptions;
 }

 renderShiftHopeList();
 const modal = document.getElementById("shiftHopeModal");
 if (modal) modal.style.display = "flex";
}

function renderShiftHopeList() {
 const container = document.getElementById("shiftHopeList");
 const countLabel = document.getElementById("shiftHopeCountLabel");
 if (!container) return;

 const ym = getShiftYearMonth();
 const [yearStr, monthStr] = ym.split("-");
 const year = parseInt(yearStr, 10);
 const month = parseInt(monthStr, 10);
 const dowNames = ["日", "月", "火", "水", "木", "金", "土"];

 if (!Array.isArray(db.data.shift_hope_offs)) db.data.shift_hope_offs = [];
 const hopeOffs = db.data.shift_hope_offs.filter(h => h.year_month === ym);

 if (countLabel) {
  countLabel.textContent = `${year}年${month}月の登録済み希望休一覧 (${hopeOffs.length}件):`;
 }

 if (hopeOffs.length === 0) {
  container.innerHTML = `<div style="padding:16px; text-align:center; color:#94a3b8; font-size:12px;">今月の登録済み希望休はありません（各スタッフ月2〜3日程度の希望休を受け付けられます）。</div>`;
  return;
 }

 const sorted = [...hopeOffs].sort((a, b) => {
  if (a.day !== b.day) return a.day - b.day;
  return a.staff_name.localeCompare(b.staff_name);
 });

 let html = `<ul style="list-style:none; padding:0; margin:0;">`;
 sorted.forEach(h => {
  const dow = new Date(year, month - 1, h.day).getDay();
  const hol = isHolidayOrYearEnd(year, month, h.day);
  const dateStr = `${month}月${h.day}日 (${dowNames[dow]}${hol.isHoliday ? "・祝" : ""})`;
  html += `
   <li style="display:flex; justify-content:space-between; align-items:center; padding:9px 12px; border-bottom:1px solid #f1f5f9; font-size:12.5px;">
    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
     <span style="display:inline-block; font-weight:bold; color:#b91c1c; background:#fee2e2; border:1px solid #fecaca; border-radius:4px; padding:2px 8px; font-size:11.5px;">
      ${dateStr}
     </span>
     <strong style="color:#1e293b;">${escapeHtml(h.staff_name)}</strong>
     <span style="color:#64748b; font-size:11.5px;">理由: ${escapeHtml(h.reason || "私用")}</span>
    </div>
    <button class="btn btn-outline" style="padding:2px 8px; font-size:11px; color:#ef4444; border-color:#fca5a5;" onclick="deleteShiftHopeOff(${h.id})">削除</button>
   </li>
  `;
 });
 html += `</ul>`;
 container.innerHTML = html;
}

function submitShiftHopeOff() {
 const staffSel = document.getElementById("shiftHopeStaff");
 const daySel = document.getElementById("shiftHopeDay");
 const reasonInput = document.getElementById("shiftHopeReason");

 if (!staffSel || !daySel) return;
 const staffName = staffSel.value;
 const day = parseInt(daySel.value, 10);
 const reason = reasonInput ? (reasonInput.value.trim() || "希望休申請") : "希望休申請";
 const ym = getShiftYearMonth();

 if (!Array.isArray(db.data.shift_hope_offs)) db.data.shift_hope_offs = [];

 const exists = db.data.shift_hope_offs.some(h => 
  h.year_month === ym && h.staff_name === staffName && parseInt(h.day, 10) === day
 );

 if (exists) {
  alert(`${staffName} さんの ${day}日はすでに希望休に登録されています。`);
  return;
 }

 const newHope = {
  id: Date.now(),
  year_month: ym,
  staff_name: staffName,
  day: day,
  reason: reason,
  created_at: new Date().toISOString()
 };

 db.data.shift_hope_offs.push(newHope);

 if (db.data.monthly_shifts && db.data.monthly_shifts[ym] && db.data.monthly_shifts[ym][staffName]) {
  db.data.monthly_shifts[ym][staffName][day] = "休";
 }

 db.save();
 if (reasonInput) reasonInput.value = "";
 renderShiftHopeList();
 renderShiftTable(ym);
 if (typeof renderTodayShiftBar === "function") renderTodayShiftBar();
}

function deleteShiftHopeOff(id) {
 if (!confirm("この希望休設定を削除しますか？")) return;
 const ym = getShiftYearMonth();
 db.data.shift_hope_offs = (db.data.shift_hope_offs || []).filter(h => h.id !== id);
 db.save();
 renderShiftHopeList();
 renderShiftTable(ym);
 if (typeof renderTodayShiftBar === "function") renderTodayShiftBar();
}

function toggleShiftHopeOff(staffName, day) {
 const ym = getShiftYearMonth();
 if (!Array.isArray(db.data.shift_hope_offs)) db.data.shift_hope_offs = [];

 const existingIdx = db.data.shift_hope_offs.findIndex(h => 
  h.year_month === ym && h.staff_name === staffName && parseInt(h.day, 10) === day
 );

 if (existingIdx >= 0) {
  db.data.shift_hope_offs.splice(existingIdx, 1);
 } else {
  db.data.shift_hope_offs.push({
   id: Date.now(),
   year_month: ym,
   staff_name: staffName,
   day: day,
   reason: "希望休申請",
   created_at: new Date().toISOString()
  });
  if (db.data.monthly_shifts && db.data.monthly_shifts[ym] && db.data.monthly_shifts[ym][staffName]) {
   db.data.monthly_shifts[ym][staffName][day] = "休";
  }
 }

 db.save();
 closeShiftPopover();
 renderShiftTable(ym);
 if (typeof renderTodayShiftBar === "function") renderTodayShiftBar();
}

function applyHopeOffsAndRegenerate() {
 const ym = getShiftYearMonth();
 const [y, m] = ym.split("-");
 const hopeCount = (db.data.shift_hope_offs || []).filter(h => h.year_month === ym).length;
 if (!confirm(`${y}年${parseInt(m, 10)}月の希望休（全${hopeCount}件）を反映して、勤務表シフトを再生成しますか？`)) {
  return;
 }
 generateMonthlyShiftData(ym);
 renderShiftTable(ym);
 renderShiftHopeList();
 alert(`${y}年${parseInt(m, 10)}月の希望休（全${hopeCount}件）を全て優先公休「休」として反映し、勤務表シフトを再生成しました！`);
}

// 勤務体制（月間シフト表・職種・希望休と完全自動連動）
function getDailyShiftRoster(targetDateStr) {
 const today = new Date();
 const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
 const targetDate = targetDateStr || gState.selectedDate || todayStr;
 const [yStr, mStr, dStr] = targetDate.split("-");
 const ym = `${yStr}-${mStr}`;
 const day = parseInt(dStr, 10);

 if (!db.data.monthly_shifts) db.data.monthly_shifts = {};
 if (!db.data.monthly_shifts[ym] || Object.keys(db.data.monthly_shifts[ym]).length === 0) {
  generateMonthlyShiftData(ym);
 }
 const monthShifts = db.data.monthly_shifts[ym] || {};

 const allStamps = sortStaffList(db.data.stamps || []);

 const roster = {
  dateStr: targetDate,
  year: parseInt(yStr, 10),
  month: parseInt(mStr, 10),
  day: day,
  isToday: (targetDate === todayStr),
  director: [],
  nurse: [],
  office: [],
  early: [],
  dayCare: [],
  late: [],
  night: [],
  dawn: [],
  off: [],
  hopeOffs: []
 };

 const todayHopes = (db.data.shift_hope_offs || []).filter(h => h.year_month === ym && parseInt(h.day, 10) === day);
 roster.hopeOffs = todayHopes;

 allStamps.forEach(s => {
  const name = typeof s === "string" ? s : s.name;
  const role = typeof s === "string" ? "介護職員" : (s.role || "職員");
  const cat = getStaffRoleCategory(name);
  const shift = monthShifts[name] ? monthShifts[name][day] : "";
  const shortName = name.split(" ")[0] || name;
  const isLeader = role.includes("リーダー");
  const isHope = todayHopes.some(h => h.staff_name === name);
  const hopeReason = (todayHopes.find(h => h.staff_name === name) || {}).reason || "";

  const staffInfo = {
   name,
   shortName,
   displayName: isLeader ? `${shortName}(L)` : shortName,
   role,
   category: cat,
   shift,
   isLeader,
   isHope,
   hopeReason
  };

  if (cat === "director") {
   roster.director.push(staffInfo);
  } else if (cat === "nurse") {
   if (shift === "日") {
    roster.nurse.push(staffInfo);
   }
  } else if (cat === "office") {
   if (shift === "日") {
    roster.office.push(staffInfo);
   }
  } else if (cat === "care") {
   if (shift === "早") roster.early.push(staffInfo);
   else if (shift === "日") roster.dayCare.push(staffInfo);
   else if (shift === "遅") roster.late.push(staffInfo);
   else if (shift === "夜") roster.night.push(staffInfo);
   else if (shift === "明") roster.dawn.push(staffInfo);
   else if (shift === "休") roster.off.push(staffInfo);
  }
 });

 return roster;
}

function renderTodayShiftBar(targetDateStr) {
 const bar = document.getElementById("todayShiftBar");
 if (!bar) return;

 const roster = getDailyShiftRoster(targetDateStr);

 // 管理者テキスト
 let directorText = "木村";
 if (roster.director.length > 0) {
  const dir = roster.director[0];
  directorText = dir.shift === "休" ? `${dir.shortName}(公休)` : dir.shortName;
 }

 // 看護師テキスト
 const nurseNames = roster.nurse.map(n => n.shortName);
 const nurseText = nurseNames.length > 0 ? nurseNames.join("・") : "(オンコール)";

 // 事務テキスト
 const officeNames = roster.office.map(o => o.shortName);
 const officeText = officeNames.length > 0 ? officeNames.join("・") : "(公休)";

 // 介護フロア体制テキスト
 const formatStaffList = list => list.length > 0 ? list.map(s => s.displayName).join("・") : "-";

 const earlyText = formatStaffList(roster.early);
 const dayCareText = formatStaffList(roster.dayCare);
 const lateText = formatStaffList(roster.late);
 const nightText = formatStaffList(roster.night);
 const dawnText = formatStaffList(roster.dawn);

 // 希望休の言及
 let hopeOffBadge = "";
 if (roster.hopeOffs.length > 0) {
  const hopeNames = roster.hopeOffs.map(h => (h.staff_name.split(" ")[0] || h.staff_name)).join("・");
  hopeOffBadge = `<span style="background:#fee2e2; color:#b91c1c; border:1px solid #fecaca; border-radius:4px; padding:1px 6px; font-size:11px;" title="希望休取得: ${roster.hopeOffs.map(h => h.staff_name + '(' + (h.reason || '申請') + ')').join(', ')}">希望休: ${hopeNames}</span>`;
 }

 const dateLabel = roster.isToday ? `本日 (${roster.month}/${roster.day})` : `${roster.month}月${roster.day}日 (選択日)`;

 bar.innerHTML = `
  <div style="display:flex; align-items:center; gap:8px;">
   <strong style="color:#1e40af; cursor:pointer; display:inline-flex; align-items:center; gap:4px;" onclick="switchPortal('office'); switchOfficeTab('shifts');" title="クリックで勤務表（シフト表）を開く">
    [勤務体制: ${dateLabel}]
   </strong>
  </div>
  <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; font-size:12.5px;">
   <span><span style="color:#64748b; font-size:11px;">管理者:</span> <strong>${escapeHtml(directorText)}</strong></span>
   <span><span style="color:#64748b; font-size:11px;">看護:</span> <strong>${escapeHtml(nurseText)}</strong></span>
   <span><span style="color:#64748b; font-size:11px;">事務:</span> <strong>${escapeHtml(officeText)}</strong></span>
   <span style="color:#cbd5e1;">|</span>
   <span style="display:inline-flex; align-items:center; gap:3px;">
    <span style="background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd; padding:1px 5px; border-radius:3px; font-size:11px; font-weight:bold;">早出</span>
    <strong style="color:#0f172a;">${escapeHtml(earlyText)}</strong>
   </span>
   <span style="display:inline-flex; align-items:center; gap:3px;">
    <span style="background:#f0fdf4; color:#15803d; border:1px solid #bbf7d0; padding:1px 5px; border-radius:3px; font-size:11px; font-weight:bold;">日勤</span>
    <strong style="color:#0f172a;">${escapeHtml(dayCareText)}</strong>
   </span>
   <span style="display:inline-flex; align-items:center; gap:3px;">
    <span style="background:#fef3c7; color:#b45309; border:1px solid #fde68a; padding:1px 5px; border-radius:3px; font-size:11px; font-weight:bold;">遅出</span>
    <strong style="color:#0f172a;">${escapeHtml(lateText)}</strong>
   </span>
   <span style="display:inline-flex; align-items:center; gap:3px;">
    <span style="background:#fee2e2; color:#b91c1c; border:1px solid #fecaca; padding:1px 5px; border-radius:3px; font-size:11px; font-weight:bold;">夜勤</span>
    <strong style="color:#0f172a;">${escapeHtml(nightText)}</strong>
   </span>
   <span style="display:inline-flex; align-items:center; gap:3px;">
    <span style="background:#f3e8ff; color:#7e22ce; border:1px solid #e9d5ff; padding:1px 5px; border-radius:3px; font-size:11px; font-weight:bold;">明け</span>
    <strong style="color:#0f172a;">${escapeHtml(dawnText)}</strong>
   </span>
   ${hopeOffBadge}
  </div>
  <button class="btn btn-outline" style="padding:2px 8px; font-size:11px; margin-left:auto; color:#2563eb; border-color:#93c5fd; background:#eff6ff; cursor:pointer;" onclick="switchPortal('office'); switchOfficeTab('shifts');" title="月間勤務表シフトを開きます">
   勤務表シフトを開く
  </button>
 `;
}

// 自動バックアップ稼働状況・手動保存機能
function openBackupStatusModal() {
 const modal = document.getElementById("backupStatusModal");
 if (!modal) return;

 const timeEl = document.getElementById("backupModalLastTime");
 const resEl = document.getElementById("backupModalResidentCount");
 const recEl = document.getElementById("backupModalRecordCount");
 const noticeEl = document.getElementById("backupManualNotice");

 if (timeEl) {
  const badge = document.getElementById("backupStatusBadge");
  const badgeText = badge ? badge.textContent : "";
  const match = badgeText.match(/\(([^)]+)\)/);
  timeEl.textContent = match ? match[1] : (new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
 }
 if (resEl) {
  const resCount = (gState.residents || []).length;
  resEl.textContent = `${resCount}名`;
 }
 if (recEl) {
  const recCount = (db.data.care_records || []).length;
  recEl.textContent = `${recCount}件`;
 }
 if (noticeEl) {
  noticeEl.textContent = "";
 }

 modal.style.display = "flex";
}

function triggerManualBackup() {
 if (typeof db !== "undefined" && db.saveToServer) {
  db.saveToServer();
  const noticeEl = document.getElementById("backupManualNotice");
  if (noticeEl) {
   const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
   noticeEl.textContent = `親機PCおよび世代保管庫 (data/backup/) に最新データを保管しました (${now})`;
  }
 }
}

function downloadBackupJson() {
 if (typeof db === "undefined" || !db.data) return;
 try {
  const jsonStr = JSON.stringify(db.data, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  a.href = url;
  a.download = `care_portal_backup_${y}${m}${d}_${hh}${mm}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  const noticeEl = document.getElementById("backupManualNotice");
  if (noticeEl) {
   noticeEl.textContent = "この端末へのバックアップJSONダウンロードが完了しました。";
  }
 } catch (e) {
  alert("バックアップファイルの生成に失敗しました: " + e.message);
 }
}

// 職員暗証番号初期化・整合性確保
function ensureStaffPinData() {
 if (!gState.stamps || !Array.isArray(gState.stamps)) return;
 let modified = false;
 gState.stamps.forEach(s => {
 if (typeof s === "object" && s !== null) {
 if (!s.pin) {
 s.pin = "0000";
 modified = true;
 }
 if (typeof s.is_initial_pin === "undefined") {
 s.is_initial_pin = (s.pin === "0000");
 modified = true;
 }
 }
 });
 if (modified && typeof db !== "undefined" && db.data) {
 db.data.stamps = gState.stamps;
 }
}

// 職員セレクト変更トリガー (4桁PIN認証へ誘導)
let gAuthTargetStaff = "";
let gEnteredPin = "";

function onStaffSelectChange(sel) {
 const targetStaff = sel.value;
 if (!targetStaff) return;
 const currentStaff = gState.currentStaff || "";
 if (targetStaff === currentStaff) return;

 // 認証完了までセレクト表示を元の職員に戻す
 if (currentStaff) {
 sel.value = currentStaff;
 }
 openStaffPinAuthModal(targetStaff);
}

function openStaffPinAuthModal(targetStaff) {
 gAuthTargetStaff = targetStaff;
 gEnteredPin = "";
 const modal = document.getElementById("staffPinAuthModal");
 if (!modal) return;

 const title = document.getElementById("staffPinAuthTitle");
 if (title) title.textContent = `職員認証: 【${targetStaff}】`;
 const desc = document.getElementById("staffPinAuthDesc");
 if (desc) desc.textContent = "暗証番号（数字4桁）を入力してください (初期値: 0000)";
 const err = document.getElementById("staffPinError");
 if (err) err.textContent = "";

 updatePinDots();
 renderRandomKeypad();
 modal.style.display = "flex";
}

// ランダム配置テンキー (毎回0〜9の数字位置をシャッフル)
function renderRandomKeypad() {
 const container = document.getElementById("staffPinKeypad");
 if (!container) return;
 container.innerHTML = "";

 const nums = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
 for (let i = nums.length - 1; i > 0; i--) {
 const j = Math.floor(Math.random() * (i + 1));
 [nums[i], nums[j]] = [nums[j], nums[i]];
 }

 nums.forEach(n => {
 const btn = document.createElement("button");
 btn.type = "button";
 btn.className = "btn btn-outline pin-key-btn";
 btn.style.cssText = "font-size:18px; font-weight:bold; padding:12px 0; background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; cursor:pointer;";
 btn.textContent = String(n);
 btn.onclick = () => onPinKeyPress(String(n));
 container.appendChild(btn);
 });
}

function onPinKeyPress(digit) {
 if (gEnteredPin.length >= 4) return;
 gEnteredPin += digit;
 updatePinDots();
 if (gEnteredPin.length === 4) {
 setTimeout(verifyStaffPin, 100);
 }
}

function backspaceStaffPin() {
 if (gEnteredPin.length > 0) {
 gEnteredPin = gEnteredPin.slice(0, -1);
 updatePinDots();
 }
}

function cancelStaffPinAuth() {
 closeModal("staffPinAuthModal");
 const sel = document.getElementById("currentStaff");
 if (sel && gState.currentStaff) {
 sel.value = gState.currentStaff;
 }
 gEnteredPin = "";
}

function updatePinDots() {
 for (let i = 0; i < 4; i++) {
 const dot = document.getElementById(`pinDot${i}`);
 if (dot) {
 if (i < gEnteredPin.length) {
 dot.style.background = "#2563eb";
 dot.style.borderColor = "#1d4ed8";
 } else {
 dot.style.background = "#ffffff";
 dot.style.borderColor = "#94a3b8";
 }
 }
 }
}

function verifyStaffPin() {
 const staffObj = (gState.stamps || []).find(s => (s.name || s) === gAuthTargetStaff);
 const correctPin = staffObj && staffObj.pin ? staffObj.pin : "0000";
 if (gEnteredPin === correctPin) {
 gState.currentStaff = gAuthTargetStaff;
 const sel = document.getElementById("currentStaff");
 if (sel) sel.value = gAuthTargetStaff;
 closeModal("staffPinAuthModal");
 onCurrentStaffChange();
 gEnteredPin = "";
 } else {
 const err = document.getElementById("staffPinError");
 if (err) err.textContent = "暗証番号が一致しません (初期値: 0000)";
 gEnteredPin = "";
 updatePinDots();
 renderRandomKeypad();
 }
}

// 職員自己暗証番号変更 (初回設定用)
function openInitialPinModal() {
 const currentStaff = gState.currentStaff || (document.getElementById("currentStaff")?.value) || "";
 const modal = document.getElementById("initialPinModal");
 if (!modal) return;
 const nameInput = document.getElementById("initialPinStaffName");
 if (nameInput) nameInput.value = currentStaff;
 const curInput = document.getElementById("initialPinCurrent");
 if (curInput) curInput.value = "";
 const newInput = document.getElementById("initialPinNew");
 if (newInput) newInput.value = "";
 const confInput = document.getElementById("initialPinConfirm");
 if (confInput) confInput.value = "";
 modal.style.display = "flex";
}

function submitInitialPinModal() {
 const staffName = document.getElementById("initialPinStaffName")?.value || "";
 const curPin = (document.getElementById("initialPinCurrent")?.value || "").trim();
 const newPin = (document.getElementById("initialPinNew")?.value || "").trim();
 const confPin = (document.getElementById("initialPinConfirm")?.value || "").trim();

 const staffObj = (gState.stamps || []).find(s => (s.name || s) === staffName);
 if (!staffObj) {
 alert("職員が見つかりません。");
 return;
 }
 const realCurrent = staffObj.pin || "0000";
 if (curPin !== realCurrent) {
 alert("現在の暗証番号が一致しません。");
 return;
 }
 if (!/^\d{4}$/.test(newPin)) {
 alert("新しい暗証番号は数字4桁で入力してください。");
 return;
 }
 if (newPin !== confPin) {
 alert("新しい暗証番号と確認入力が一致しません。");
 return;
 }

 staffObj.pin = newPin;
 staffObj.is_initial_pin = false;
 if (typeof db !== "undefined" && db.data) {
 db.data.stamps = gState.stamps;
 db.save();
 }
 closeModal("initialPinModal");
 updateStaffRoleUI();
 checkGlobalAlerts();
 alert(`【${staffName}】の暗証番号を更新しました。次回から新しい暗証番号をご使用ください。`);
}

// 事務所ポータル：データ保管・バックアップ表示
function renderOfficeBackup() {
 const notice = document.getElementById("officeBackupNotice");
 if (notice) notice.textContent = "";
}

// 事務所ポータル：職員アカウント・暗証番号管理
function renderOfficeStaffAuth() {
 const tbody = document.querySelector("#staffAuthTable tbody");
 if (!tbody) return;
 tbody.innerHTML = "";

 const stamps = sortStaffList(gState.stamps || []);
 stamps.forEach(s => {
 const isInit = (s.pin || "0000") === "0000" || s.is_initial_pin !== false;
 const tr = document.createElement("tr");
 tr.innerHTML = `
 <td><strong>${escapeHtml(s.name)}</strong></td>
 <td><span style="font-size:12px; color:#475569;">${escapeHtml(s.role || "職員")}</span></td>
 <td>
 ${isInit 
 ? '<span class="badge" style="background:#fee2e2; color:#991b1b; padding:2px 6px; font-size:11.5px;">初期値(0000) 要設定</span>'
 : '<span class="badge" style="background:#dcfce7; color:#166534; padding:2px 6px; font-size:11.5px;">設定済み</span>'}
 </td>
 <td>
 <button class="btn btn-secondary" style="font-size:11.5px; padding:3px 8px;" onclick="selectTargetForReset('${escapeHtml(s.name)}')">初期化フォームへ選択</button>
 </td>
 `;
 tbody.appendChild(tr);
 });

 // 対象職員セレクトボックス
 const targetSel = document.getElementById("staffAuthTargetSelect");
 if (targetSel) {
 targetSel.innerHTML = "";
 stamps.forEach(s => {
 const opt = document.createElement("option");
 opt.value = s.name;
 opt.textContent = `${s.name} (${s.role || "職員"})`;
 targetSel.appendChild(opt);
 });
 }

 // 承認者1（操作者）の表示
 const currentStaff = (document.getElementById("currentStaff")?.value) || gState.currentStaff || "管理者";
 const currentStaffObj = (gState.stamps || []).find(s => (s.name || s) === currentStaff);
 const app1Display = document.getElementById("staffAuthApprover1NameDisplay");
 if (app1Display) {
 app1Display.textContent = `${currentStaff} (${currentStaffObj?.role || "管理者・事務"})`;
 }

 // 承認者2（立ち会い承認者）のセレクトボックス
 const app2Sel = document.getElementById("staffAuthApprover2Select");
 if (app2Sel) {
 app2Sel.innerHTML = "";
 const approvers = (gState.stamps || []).filter(s => {
 return isStaffAdminOrClerk(s.name) && s.name !== currentStaff;
 });
 approvers.forEach(a => {
 const opt = document.createElement("option");
 opt.value = a.name;
 opt.textContent = `${a.name} (${a.role || "管理者・事務"})`;
 app2Sel.appendChild(opt);
 });
 }
}

function selectTargetForReset(staffName) {
 const targetSel = document.getElementById("staffAuthTargetSelect");
 if (targetSel) {
 targetSel.value = staffName;
 targetSel.scrollIntoView({ behavior: 'smooth', block: 'center' });
 }
}

function submitTwoPersonReset() {
 const targetSel = document.getElementById("staffAuthTargetSelect");
 const targetName = targetSel ? targetSel.value : "";
 if (!targetName) {
 alert("初期化する対象職員を選択してください。");
 return;
 }

 const currentStaff = (document.getElementById("currentStaff")?.value) || gState.currentStaff || "";
 const app1Pin = (document.getElementById("staffAuthApprover1Pin")?.value || "").trim();
 const app2Sel = document.getElementById("staffAuthApprover2Select");
 const app2Name = app2Sel ? app2Sel.value : "";
 const app2Pin = (document.getElementById("staffAuthApprover2Pin")?.value || "").trim();

 if (!app2Name) {
 alert("立ち会い承認者（管理者または別の事務員）を選択してください。");
 return;
 }
 if (currentStaff === app2Name) {
 alert("承認者1と承認者2は異なる2名である必要があります。");
 return;
 }

 // 承認者1の認証
 const app1Obj = (gState.stamps || []).find(s => (s.name || s) === currentStaff);
 const realApp1Pin = app1Obj ? (app1Obj.pin || "0000") : "0000";
 if (app1Pin !== realApp1Pin) {
 alert("承認者1（操作者）の暗証番号が正しくありません。");
 return;
 }

 // 承認者2の認証
 const app2Obj = (gState.stamps || []).find(s => (s.name || s) === app2Name);
 const realApp2Pin = app2Obj ? (app2Obj.pin || "0000") : "0000";
 if (app2Pin !== realApp2Pin) {
 alert("承認者2（立ち会い承認者）の暗証番号が正しくありません。");
 return;
 }

 if (!confirm(`【2名承認の確認】\n操作者: ${currentStaff}\n立ち会い承認者: ${app2Name}\n\n対象職員「${targetName}」の暗証番号を「0000」にリセットしますか？\nリセット後は対象者本人が新しい暗証番号を初回設定します。`)) {
 return;
 }

 const targetObj = (gState.stamps || []).find(s => (s.name || s) === targetName);
 if (!targetObj) return;
 targetObj.pin = "0000";
 targetObj.is_initial_pin = true;
 if (typeof db !== "undefined" && db.data) {
 db.data.stamps = gState.stamps;
 db.save();
 }

 const p1 = document.getElementById("staffAuthApprover1Pin");
 if (p1) p1.value = "";
 const p2 = document.getElementById("staffAuthApprover2Pin");
 if (p2) p2.value = "";

 renderOfficeStaffAuth();
 updateStaffRoleUI();
 checkGlobalAlerts();
 alert(`【2名承認リセット完了】\n【${targetName}】の暗証番号を「0000」に初期化しました。\n対象職員本人が新しい暗証番号を設定できるようになりました。`);
}

// 後方互換・直接呼び出し用
function resetStaffPin(staffName) {
 const targetObj = (gState.stamps || []).find(s => (s.name || s) === staffName);
 if (!targetObj) return;
 targetObj.pin = "0000";
 targetObj.is_initial_pin = true;
 if (typeof db !== "undefined" && db.data) {
 db.data.stamps = gState.stamps;
 db.save();
 }
 renderOfficeStaffAuth();
 updateStaffRoleUI();
 checkGlobalAlerts();
}

// グローバル関数公開 (インラインonclick等の即時呼出保証)
if (typeof window !== "undefined") {
 window.openClinicInstructionModal = openClinicInstructionModal;
 window.submitClinicInstructions = submitClinicInstructions;
 window.openCarePlanModal = openCarePlanModal;
 window.submitCarePlanModal = submitCarePlanModal;
 window.openBodyConditionModal = openBodyConditionModal;
 window.submitBodyConditionModal = submitBodyConditionModal;
 window.openDiseaseGuide = openDiseaseGuide;
 window.toggleCustomDiseaseEdit = toggleCustomDiseaseEdit;
 window.saveCustomDiseaseGuide = saveCustomDiseaseGuide;
 window.resetCustomDiseaseGuide = resetCustomDiseaseGuide;
 window.annotateMedicalTerms = annotateMedicalTerms;
 window.openTermExplanation = openTermExplanation;
 window.closeTermExplanation = closeTermExplanation;
 window.MEDICAL_TERMS_DICTIONARY = MEDICAL_TERMS_DICTIONARY;
 window.changePersonalCalendarMonth = changePersonalCalendarMonth;
 window.jumpPersonalCalendarToday = jumpPersonalCalendarToday;
 window.selectPersonalCalendarDate = selectPersonalCalendarDate;
 window.openPersonalVitalModal = openPersonalVitalModal;
 window.submitPersonalVitalModal = submitPersonalVitalModal;
 window.renderPersonalCalendar = renderPersonalCalendar;
 window.renderPersonalDailySummary = renderPersonalDailySummary;
 window.getCategoryBadgeStyle = getCategoryBadgeStyle;
 window.selectRecordCategory = selectRecordCategory;
 window.syncCategoryButtons = syncCategoryButtons;
 window.openDailyJournalAddRecordModal = openDailyJournalAddRecordModal;
 window.selectDailyJournalCategory = selectDailyJournalCategory;
 window.syncDailyJournalCategoryButtons = syncDailyJournalCategoryButtons;
 window.insertDailyJournalTemplate = insertDailyJournalTemplate;
 window.submitDailyJournalRecordModal = submitDailyJournalRecordModal;
 window.openShiftHopeModal = openShiftHopeModal;
 window.renderShiftHopeList = renderShiftHopeList;
 window.submitShiftHopeOff = submitShiftHopeOff;
 window.deleteShiftHopeOff = deleteShiftHopeOff;
 window.toggleShiftHopeOff = toggleShiftHopeOff;
 window.applyHopeOffsAndRegenerate = applyHopeOffsAndRegenerate;
 window.getDailyShiftRoster = getDailyShiftRoster;
 window.renderTodayShiftBar = renderTodayShiftBar;
 window.openBackupStatusModal = openBackupStatusModal;
 window.triggerManualBackup = triggerManualBackup;
 window.downloadBackupJson = downloadBackupJson;
 window.isStaffAdminOrClerk = isStaffAdminOrClerk;
 window.isCurrentStaffAdminOrClerk = isCurrentStaffAdminOrClerk;
 window.updateStaffRoleUI = updateStaffRoleUI;
 window.ensureStaffPinData = ensureStaffPinData;
 window.onStaffSelectChange = onStaffSelectChange;
 window.openStaffPinAuthModal = openStaffPinAuthModal;
 window.renderRandomKeypad = renderRandomKeypad;
 window.onPinKeyPress = onPinKeyPress;
 window.backspaceStaffPin = backspaceStaffPin;
 window.cancelStaffPinAuth = cancelStaffPinAuth;
 window.verifyStaffPin = verifyStaffPin;
 window.openInitialPinModal = openInitialPinModal;
 window.submitInitialPinModal = submitInitialPinModal;
 window.renderOfficeBackup = renderOfficeBackup;
 window.renderOfficeStaffAuth = renderOfficeStaffAuth;
 window.selectTargetForReset = selectTargetForReset;
 window.submitTwoPersonReset = submitTwoPersonReset;
 window.resetStaffPin = resetStaffPin;
 window.openTemplateManageModal = openTemplateManageModal;
 window.renderTemplateManageList = renderTemplateManageList;
 window.submitTemplateForm = submitTemplateForm;
 window.startEditTemplate = startEditTemplate;
 window.cancelTemplateEdit = cancelTemplateEdit;
 window.deleteTemplate = deleteTemplate;
 window.resetDefaultTemplates = resetDefaultTemplates;
 window.getResidentSummaryStatusText = getResidentSummaryStatusText;
 window.renderResidentSummaryAccordionContent = renderResidentSummaryAccordionContent;
 window.openCareSummaryModal = openCareSummaryModal;
 window.switchCareSummaryRecord = switchCareSummaryRecord;
 window.startNewCareSummary = startNewCareSummary;
 window.submitCareSummary = submitCareSummary;
 window.printCareSummary = printCareSummary;
 window.openEmergencySummaryModal = openEmergencySummaryModal;
 window.updateEmergencyPreviewReason = updateEmergencyPreviewReason;
 window.renderEmergencySummaryPreview = renderEmergencySummaryPreview;
 window.printEmergencySummary = printEmergencySummary;
 window.copyEmergencySummaryText = copyEmergencySummaryText;
}

// グローバル公開 (新規追加分)
window.formatTempInput = formatTempInput;
window.normalizeTempValue = normalizeTempValue;
window.onGlobalDateChange = onGlobalDateChange;
window.changeDateByDays = changeDateByDays;
window.setTodayDate = setTodayDate;
window.changeLinenResident = changeLinenResident;
window.deleteLinenRecord = deleteLinenRecord;
window.openSupplierModal = openSupplierModal;
window.submitSupplierModal = submitSupplierModal;
window.deleteSupplier = deleteSupplier;
window.openSupplierItemModal = openSupplierItemModal;
window.submitSupplierItemModal = submitSupplierItemModal;
window.deleteSupplierItem = deleteSupplierItem;