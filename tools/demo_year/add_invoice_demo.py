# デモに、利用者への請求の料金表と、2025年11月分〜2026年9月分の請求書・入金を入れる（2026-10-23 あなた「機能足して先に」）
# 請求書の中身は、アプリの計算（js/20_invoice.js の cpInvCompute。介護保険の分は加算の計算と同じ）をブラウザで動かして作ったもの（invoice_demo_seed.json）
#  - 料金表: 2025年4月分から 家賃 35,000円／月・光熱水費 12,000円／月・食材料費 1,200円／日・入居退居の月は日割り・入院や外泊の日も家賃などは取る（デモの金額）
#  - 確定は翌月5日ごろ（事務員 松本 陽子 の出勤日）、入金は翌月27日ごろ（口座振替。5の倍数の部屋は振込）。2026年9月分は 10/27 の振替前なので入金待ち
# 使い方: python add_invoice_demo.py data/portal_database.json （入っている請求書・料金表は入れ替える）
import sys, os, json
path = sys.argv[1]
seed = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "invoice_demo_seed.json"), encoding="utf-8"))
d = json.load(open(path, encoding="utf-8-sig"))
d["invoice_fee_tables"] = seed["invoice_fee_tables"]
d["invoices"] = seed["invoices"]
if isinstance(d.get("_rev"), int): d["_rev"] += 1
tmp = path + ".tmp_write"
with open(tmp, "w", encoding="utf-8-sig", newline="") as f:
    f.write(json.dumps(d, ensure_ascii=False, separators=(",", ":")))
os.replace(tmp, path)
print("請求書", len(d["invoices"]), "件・料金表", len(d["invoice_fee_tables"]), "件")
