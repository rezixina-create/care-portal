# -*- coding: utf-8 -*-
"""
tools/migrate_vault_photos.py

保管庫（db.data.photos）の旧形式の記録（url に data:image/...;base64,... が入っており filename がない記録）を、
親機のフォルダ（data/photos/vault/<category>/）のファイルへ書き出し、記録を filename 形式に移し替える道具。

使い方（サーバーを止めてから実行）:
    python tools/migrate_vault_photos.py data/portal_database.json
"""
import sys
import os
import re
import json
import base64
import hashlib
from datetime import datetime


VALID_CATEGORIES = ("documents", "personal")


def detect_image_ext(img_bytes, mime_subtype):
    """
    画像バイト列のマジックバイト（先頭シグネチャ）と MIME サブタイプを検査し、
    正常であれば (拡張子, None) を返す。壊れている場合は (None, 理由) を返す。
    JPEG 以外の画像（PNG / GIF / WebP / BMP）は元の画像形式のまま拡張子を合わせる。
    """
    if not img_bytes or len(img_bytes) < 8:
        return None, "画像データが短すぎます（壊れている）"

    sub = (mime_subtype or "").strip().lower()
    if ";" in sub:
        sub = sub.split(";", 1)[0].strip()

    actual_ext = None
    if img_bytes[:3] == b"\xff\xd8\xff":
        actual_ext = ".jpg"
    elif img_bytes[:8] == b"\x89PNG\r\n\x1a\n":
        actual_ext = ".png"
    elif img_bytes[:6] in (b"GIF87a", b"GIF89a"):
        actual_ext = ".gif"
    elif len(img_bytes) >= 12 and img_bytes[:4] == b"RIFF" and img_bytes[8:12] == b"WEBP":
        actual_ext = ".webp"
    elif img_bytes[:2] == b"BM" and len(img_bytes) >= 14:
        actual_ext = ".bmp"

    if actual_ext is None:
        return None, "画像の中身（マジックバイト）が壊れているか未対応の形式です"

    expected_map = {
        "jpeg": ".jpg",
        "jpg": ".jpg",
        "pjpeg": ".jpg",
        "png": ".png",
        "gif": ".gif",
        "webp": ".webp",
        "bmp": ".bmp",
        "x-ms-bmp": ".bmp",
    }
    if sub in expected_map and expected_map[sub] != actual_ext:
        return None, f"data URL の形式 (image/{sub}) と実際の画像の中身 ({actual_ext}) が一致しません"

    return actual_ext, None


def parse_and_validate_data_url(url_str):
    """
    data:image/...;base64,... を解析・検証する。
    成功時: (img_bytes, ext, None)
    失敗時: (None, None, reason_str)
    """
    if not isinstance(url_str, str):
        return None, None, "url が文字列ではありません"

    s = url_str.strip()
    m = re.match(r"^data:image/([a-zA-Z0-9.+_-]+);base64,(.*)$", s, re.IGNORECASE | re.DOTALL)
    if not m:
        return None, None, "data URL の形式が不正です（data:image/...;base64,... ではありません）"

    mime_subtype = m.group(1)
    b64_payload = re.sub(r"\s+", "", m.group(2))
    if not b64_payload:
        return None, None, "base64 の中身が空です"

    try:
        img_bytes = base64.b64decode(b64_payload, validate=True)
    except Exception:
        return None, None, "base64 のデコードに失敗しました（画像の中身が壊れています）"

    ext, err = detect_image_ext(img_bytes, mime_subtype)
    if err:
        return None, None, err

    return img_bytes, ext, None


def extract_timestamp_str(uploaded_at):
    """
    記録の uploaded_at（例: '2026-10-15 14:30' や '2026-10-15 14:30:22'）から
    ファイル名用の 'YYYYMMDD_HHMMSS' を取り出す。取れない場合は現在時刻を使う。
    """
    if isinstance(uploaded_at, str) and uploaded_at.strip():
        s = uploaded_at.strip()
        m = re.search(r"(\d{4})[-/](\d{1,2})[-/](\d{1,2})[\sT]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?", s)
        if m:
            y, mo, d, hh, mm, ss = (
                int(m.group(1)),
                int(m.group(2)),
                int(m.group(3)),
                int(m.group(4)),
                int(m.group(5)),
                int(m.group(6)) if m.group(6) is not None else 0,
            )
            try:
                dt = datetime(y, mo, d, hh, mm, ss)
                return dt.strftime("%Y%m%d_%H%M%S")
            except ValueError:
                pass
        m_date = re.search(r"(\d{4})[-/](\d{1,2})[-/](\d{1,2})", s)
        if m_date:
            try:
                dt = datetime(int(m_date.group(1)), int(m_date.group(2)), int(m_date.group(3)), 0, 0, 0)
                return dt.strftime("%Y%m%d_%H%M%S")
            except ValueError:
                pass
    return datetime.now().strftime("%Y%m%d_%H%M%S")


def build_vault_filename(cat, rec, img_bytes, ext, target_dir):
    """
    サーバー（/api/vault-photo-upload）と同じ命名規則:
        <category>_<YYYYMMDD_HHMMSS>_<6文字の16進文字><ext>
    同じ記録・同じ画像からは同じファイル名になるように決定し、
    別画像の同名ファイルが既に存在する場合のみサフィックスを変えて衝突を避ける。
    """
    ts = extract_timestamp_str(rec.get("uploaded_at"))
    seed_prefix = f"{rec.get('id', '')}_{rec.get('resident_id', '')}_{rec.get('uploaded_at', '')}_".encode("utf-8")
    digest = hashlib.sha256(seed_prefix + img_bytes).hexdigest().lower()

    for idx in range(0, len(digest) - 6, 2):
        token = digest[idx:idx + 6]
        candidate = f"{cat}_{ts}_{token}{ext}"
        full_path = os.path.join(target_dir, candidate)
        if not os.path.exists(full_path):
            return candidate
        try:
            with open(full_path, "rb") as existing_f:
                if existing_f.read() == img_bytes:
                    return candidate
        except OSError:
            pass

    fallback_token = hashlib.sha256(seed_prefix + os.urandom(8)).hexdigest()[:6]
    return f"{cat}_{ts}_{fallback_token}{ext}"


def resolve_dirs(json_path):
    """
    JSON ファイルの場所から data/photos/vault と data/backup のパスを解決する。
    """
    json_abs = os.path.abspath(json_path)
    json_dir = os.path.dirname(json_abs)
    if (
        os.path.basename(json_dir).lower() == "data"
        or os.path.isdir(os.path.join(json_dir, "photos"))
        or os.path.isdir(os.path.join(json_dir, "backup"))
    ):
        data_dir = json_dir
    else:
        repo_data_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
        if os.path.isdir(repo_data_dir):
            data_dir = repo_data_dir
        else:
            data_dir = json_dir

    vault_base_dir = os.path.join(data_dir, "photos", "vault")
    backup_dir = os.path.join(data_dir, "backup")
    return vault_base_dir, backup_dir


def migrate_vault_photos(json_path, vault_base_dir=None, backup_dir=None):
    """
    指定された JSON ファイル内の photos を検査し、旧形式（url が data:image/ で始まり filename がない記録）を
    親機のフォルダ（data/photos/vault/<category>/）に書き出して filename 形式に移し替える。
    """
    if not os.path.isfile(json_path):
        print(f"[エラー] ファイルが見つかりません: {json_path}", file=sys.stderr)
        return {"migrated": 0, "skipped": [], "backup_path": None}

    resolved_vault_dir, resolved_backup_dir = resolve_dirs(json_path)
    if vault_base_dir is None:
        vault_base_dir = resolved_vault_dir
    if backup_dir is None:
        backup_dir = resolved_backup_dir

    with open(json_path, "rb") as f:
        raw_bytes = f.read()

    has_bom = raw_bytes.startswith(b"\xef\xbb\xbf")
    text = raw_bytes[3:].decode("utf-8") if has_bom else raw_bytes.decode("utf-8")
    data = json.loads(text)

    residents = data.get("residents") if isinstance(data.get("residents"), list) else []
    res_name_map = {}
    for r in residents:
        if isinstance(r, dict) and "id" in r:
            res_name_map[str(r["id"])] = r.get("name") or ""

    photos = data.get("photos")
    if not isinstance(photos, list):
        print("移行対象の photos 配列がありません（0件）。")
        return {"migrated": 0, "skipped": [], "backup_path": None}

    to_migrate = []
    skipped = []

    for rec in photos:
        if not isinstance(rec, dict):
            continue

        fn = rec.get("filename")
        if isinstance(fn, str) and fn.strip():
            # すでに filename が入っている新しい作りの記録はそのまま
            continue

        url = rec.get("url")
        if not isinstance(url, str) or not url.strip():
            continue

        url_stripped = url.strip()
        # url が data:image/ で始まる記録（または壊れた data: / 未対応スキームで filename がない記録）を対象に検査
        rid = rec.get("resident_id")
        rname = res_name_map.get(str(rid), "")
        res_label = f"{rname} (ID:{rid})" if rname else f"ID:{rid}"
        rec_id = rec.get("id")
        title = rec.get("title") or ""
        cat = rec.get("category")

        if cat not in VALID_CATEGORIES:
            skipped.append({
                "id": rec_id,
                "resident": res_label,
                "title": title,
                "reason": f"category が documents・personal 以外です ({cat!r})"
            })
            continue

        if not url_stripped.lower().startswith("data:image/"):
            skipped.append({
                "id": rec_id,
                "resident": res_label,
                "title": title,
                "reason": "url が data:image/ で始まっていません（画像の中身が壊れています）"
            })
            continue

        img_bytes, ext, err = parse_and_validate_data_url(url_stripped)
        if err:
            skipped.append({
                "id": rec_id,
                "resident": res_label,
                "title": title,
                "reason": err
            })
            continue

        to_migrate.append((rec, cat, img_bytes, ext, res_label))

    # 壊れている記録・category が違う記録の一覧を黒い画面に出す
    if skipped:
        print("=== 移し替えずに残した記録（category 不正・画像破損） ===")
        for s in skipped:
            print(f"  - id: {s['id']} | 利用者: {s['resident']} | 題名: {s['title']} | 理由: {s['reason']}")
        print(f"計 {len(skipped)} 件を変えずに残しました。")

    if not to_migrate:
        print("新しく移し替える対象の記録はありません（0件）。ファイル・データの書き換えは行いませんでした。")
        return {"migrated": 0, "skipped": skipped, "backup_path": None}

    # 1. 書き出す前に元のデータの控えを data/backup/ に日時つきで作る
    os.makedirs(backup_dir, exist_ok=True)
    ts_now = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_filename = f"before_migrate_vault_photos_{ts_now}.json"
    backup_path = os.path.join(backup_dir, backup_filename)
    suffix_idx = 1
    while os.path.exists(backup_path):
        backup_filename = f"before_migrate_vault_photos_{ts_now}_{suffix_idx}.json"
        backup_path = os.path.join(backup_dir, backup_filename)
        suffix_idx += 1

    with open(backup_path, "wb") as bf:
        bf.write(raw_bytes)
    print(f"[控え作成] 元のデータの控えを保存しました: {backup_path}")

    # 2. 画像ファイルを書き出し、記録に filename を入れて url の中身（base64）を消す
    migrated_files = []
    for rec, cat, img_bytes, ext, res_label in to_migrate:
        cat_dir = os.path.join(vault_base_dir, cat)
        os.makedirs(cat_dir, exist_ok=True)
        new_filename = build_vault_filename(cat, rec, img_bytes, ext, cat_dir)
        out_file_path = os.path.join(cat_dir, new_filename)
        with open(out_file_path, "wb") as img_f:
            img_f.write(img_bytes)

        # 記録に filename を入れ、url の中身（base64）は消す。ほかの項目は一切変えない
        rec["filename"] = new_filename
        rec["url"] = ""
        migrated_files.append((rec.get("id"), res_label, rec.get("title") or "", out_file_path))

    # 3. データの書き出し（json.dumps(d, ensure_ascii=False, separators=(",", ":"))・BOM のあり・なしも元のまま）
    out_json_str = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    out_bytes = (b"\xef\xbb\xbf" if has_bom else b"") + out_json_str.encode("utf-8")

    tmp_path = json_path + ".tmp_migrate_vault"
    with open(tmp_path, "wb") as tf:
        tf.write(out_bytes)
    os.replace(tmp_path, json_path)

    print(f"=== 移し替え完了: {len(migrated_files)} 件 ===")
    for mid, mres, mtitle, mpath in migrated_files:
        print(f"  - id: {mid} | 利用者: {mres} | 題名: {mtitle} -> {mpath}")

    return {
        "migrated": len(migrated_files),
        "skipped": skipped,
        "backup_path": backup_path,
        "files": [m[3] for m in migrated_files],
    }


def main():
    json_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join("data", "portal_database.json")
    migrate_vault_photos(json_path)


if __name__ == "__main__":
    main()
