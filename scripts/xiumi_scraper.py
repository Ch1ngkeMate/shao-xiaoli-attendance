#!/usr/bin/env python3
"""
秀米模板商城爬虫 — 爬取模板元数据 + 下载封面图 + 提取模板完整素材

用法:
  python xiumi_scraper.py scrape              # 爬取元数据 (默认3页)
  python xiumi_scraper.py scrape --pages 10 --type paper
  python xiumi_scraper.py scrape --pages 5 --freefilter free
  python xiumi_scraper.py download-covers     # 下载已爬取模板的封面图
  python xiumi_scraper.py fetch-template <goods_id>  # 提取单个模板的全部素材
  python xiumi_scraper.py stats               # 查看已有数据统计
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys
import time
import urllib.parse
from pathlib import Path

import httpx

API_BASE = "https://xiumi.us"
GOODSES_URL = f"{API_BASE}/api/show_goods/goodses"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://xiumi.us/",
}

OUTPUT_DIR = Path("C:/Users/95345/Desktop/toool/stgz/weitui/moban")
COVERS_DIR = OUTPUT_DIR / "covers"
TEMPLATES_DIR = OUTPUT_DIR / "templates"


def fetch_page(
    page: int,
    show_type: str = "paper",
    freefilter: str = "all",
    limit: int = 50,
    tag_id: int | None = None,
    search: str | None = None,
) -> dict:
    params: dict = {
        "show_type": show_type,
        "page": page,
        "freefilter": freefilter,
        "limit": limit,
    }
    if tag_id:
        params["tag_id"] = tag_id
    if search:
        params["search"] = search

    r = httpx.get(GOODSES_URL, params=params, headers=HEADERS, timeout=30)
    r.raise_for_status()
    data = r.json()
    if data["code"] != 0:
        raise RuntimeError(f"API error: {data['message']}")
    return data["data"]


def scrape_metadata(
    pages: int = 3,
    show_type: str = "paper",
    freefilter: str = "all",
    limit: int = 50,
    delay: float = 0.5,
):
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    all_items = []
    total_count = 0

    for page in range(pages):
        print(f"  Fetching page {page + 1}/{pages}...", end=" ", flush=True)
        try:
            data = fetch_page(page, show_type, freefilter, limit)
            items = data["goodses"]
            total_count = data["count"]
            all_items.extend(items)
            print(f"OK ({len(items)} items)")
        except Exception as e:
            print(f"FAILED: {e}")
            continue

        if page < pages - 1:
            time.sleep(delay)

    # 保存 JSON
    json_path = OUTPUT_DIR / "templates.json"
    json_path.write_text(
        json.dumps(all_items, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    # 保存 CSV
    csv_path = OUTPUT_DIR / "templates.csv"
    fieldnames = [
        "show_goods_id", "show_id", "title", "desc", "price",
        "copy_number", "collected_number", "cover_url",
        "seller_nickname", "seller_location", "seller_level",
        "show_url", "tags", "created_at", "updated_at",
    ]
    with open(csv_path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for item in all_items:
            show = item.get("show", {})
            seller = item.get("seller", {})
            tags = ",".join(show.get("tags", [])) if isinstance(show.get("tags"), list) else ""
            row = {
                "show_goods_id": item.get("show_goods_id"),
                "show_id": item.get("show_id"),
                "title": show.get("title", ""),
                "desc": show.get("desc", ""),
                "price": item.get("price"),
                "copy_number": item.get("copy_number"),
                "collected_number": item.get("collected_number"),
                "cover_url": "https:" + show.get("cover", "") if show.get("cover") else "",
                "seller_nickname": seller.get("nickname", ""),
                "seller_location": seller.get("location", ""),
                "seller_level": seller.get("level"),
                "show_url": show.get("show_url", ""),
                "tags": tags,
                "created_at": item.get("created_at", ""),
                "updated_at": item.get("updated_at", ""),
            }
            writer.writerow(row)

    print(f"\n  Done! Total available: {total_count}")
    print(f"  Scraped: {len(all_items)} items")
    print(f"  JSON: {json_path}")
    print(f"  CSV:  {csv_path}")


def download_covers(delay: float = 0.3):
    json_path = OUTPUT_DIR / "templates.json"
    if not json_path.exists():
        print("  No templates.json found. Run 'scrape' first.")
        return

    items = json.loads(json_path.read_text(encoding="utf-8"))
    COVERS_DIR.mkdir(parents=True, exist_ok=True)

    success = 0
    skip = 0
    fail = 0

    for i, item in enumerate(items):
        show = item.get("show", {})
        cover = show.get("cover", "")
        if not cover:
            skip += 1
            continue

        url = "https:" + cover
        goods_id = item.get("show_goods_id", f"unknown_{i}")
        ext = ".png" if ".png" in cover else ".jpg"
        filename = f"{goods_id}{ext}"
        filepath = COVERS_DIR / filename

        if filepath.exists():
            skip += 1
            continue

        try:
            r = httpx.get(url, headers=HEADERS, timeout=30)
            r.raise_for_status()
            filepath.write_bytes(r.content)
            success += 1
        except Exception as e:
            fail += 1
            print(f"  FAIL [{goods_id}]: {e}")

        if (i + 1) % 20 == 0:
            print(f"  Progress: {i+1}/{len(items)} (ok:{success} skip:{skip} fail:{fail})")

        time.sleep(delay)

    print(f"\n  Done! Success: {success}, Skipped: {skip}, Failed: {fail}")
    print(f"  Covers dir: {COVERS_DIR}")


def show_stats():
    json_path = OUTPUT_DIR / "templates.json"
    if not json_path.exists():
        print("  No data yet. Run 'scrape' first.")
        return

    items = json.loads(json_path.read_text(encoding="utf-8"))

    prices = [it.get("price", 0) for it in items]
    copies = [it.get("copy_number", 0) for it in items]
    collects = [it.get("collected_number", 0) for it in items]

    print(f"  Total items: {len(items)}")
    print(f"  Price range: {min(prices)} ~ {max(prices)} 米点")
    print(f"  Avg price: {sum(prices)/len(prices):.1f} 米点")
    print(f"  Total copies: {sum(copies)}")
    print(f"  Total collections: {sum(collects)}")

    covers_dir = COVERS_DIR
    if covers_dir.exists():
        imgs = list(covers_dir.glob("*"))
        print(f"  Downloaded covers: {len(imgs)}")


def fetch_template(goods_id: int, delay: float = 0.3):
    """提取单个模板的全部素材：文字、图片、组件结构、渲染HTML。"""
    print(f"  Fetching goods info for #{goods_id}...")

    # Step 1: 从 goods API 获取 show_url
    r = httpx.get(f"{GOODSES_URL}/{goods_id}", headers=HEADERS, timeout=30)
    r.raise_for_status()
    goods_data = r.json()
    if goods_data["code"] != 0:
        raise RuntimeError(f"Goods API error: {goods_data['message']}")

    show = goods_data["data"]["show"]
    show_url = show.get("show_url", "")
    title = show.get("title", "untitled")
    safe_title = re.sub(r'[\\/:*?"<>|]', '_', title)[:60]

    print(f"  Title: {title}")
    print(f"  Show URL: {show_url}")

    if not show_url:
        raise RuntimeError("No show_url found — template may not be published")

    # Step 2: 从 board 页面提取 show_data_url
    print(f"  Fetching board page...")
    time.sleep(delay)
    r = httpx.get(show_url, headers=HEADERS, timeout=30, follow_redirects=True)
    r.raise_for_status()
    html = r.text

    # 提取 injectedData.showInfo (URL-encoded JSON)
    match = re.search(
        r'injectedData\.showInfo\s*=\s*JSON\.parse\(decodeURIComponent\("([^"]+)"\)\)',
        html,
    )
    if not match:
        raise RuntimeError("Could not find showInfo in board page")

    show_info_raw = urllib.parse.unquote(match.group(1))
    show_info = json.loads(show_info_raw)
    show_data_url = show_info.get("show_data_url", "")

    if not show_data_url:
        raise RuntimeError("No show_data_url found in board page")
    if show_data_url.startswith("//"):
        show_data_url = "https:" + show_data_url

    print(f"  Data URL: {show_data_url}")

    # Step 3: 下载完整 JSON 数据
    print(f"  Downloading template data...")
    time.sleep(delay)
    r = httpx.get(show_data_url, headers=HEADERS, timeout=60)
    r.raise_for_status()
    data = r.json()
    print(f"  Data size: {len(r.text):,} bytes")

    # Step 4: 创建输出目录
    tmpl_dir = TEMPLATES_DIR / f"{goods_id}_{safe_title}"
    tmpl_dir.mkdir(parents=True, exist_ok=True)

    # 保存原始 JSON
    raw_path = tmpl_dir / "raw_data.json"
    raw_path.write_text(
        json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"  Raw JSON saved: {raw_path}")

    # Step 5: 提取文字内容
    texts = []
    _extract_texts(data, texts)
    unique_texts = list({t[1] for t in texts if len(t[1].strip()) > 1})

    # 清理 HTML 标签
    clean_texts = [_strip_html(t) for t in unique_texts]
    clean_texts = [t for t in clean_texts if t.strip()]

    text_path = tmpl_dir / "texts.txt"
    text_path.write_text("\n\n---\n\n".join(clean_texts), encoding="utf-8")
    print(f"  Texts extracted: {len(clean_texts)} items -> {text_path}")

    # Step 6: 提取图片
    images = []
    _extract_images(data, images)
    unique_images = list(set(images))
    print(f"  Image URLs found: {len(unique_images)}")

    images_dir = tmpl_dir / "images"
    images_dir.mkdir(exist_ok=True)

    img_success = 0
    img_fail = 0
    img_map = {}  # original_url -> local_filename
    for i, img_url in enumerate(unique_images):
        if img_url.startswith("//"):
            img_url = "https:" + img_url

        ext = ".png"
        for e in [".jpg", ".jpeg", ".gif", ".webp", ".svg", ".png"]:
            if e in img_url.lower().split("?")[0]:
                ext = e
                break

        filename = f"{i:03d}{ext}"
        filepath = images_dir / filename

        try:
            time.sleep(delay)
            r_img = httpx.get(img_url, headers=HEADERS, timeout=30)
            r_img.raise_for_status()
            filepath.write_bytes(r_img.content)
            img_map[img_url] = filename
            img_success += 1
        except Exception as e:
            img_fail += 1
            if img_fail <= 5:
                print(f"    FAIL image [{i}]: {e}")

        if (i + 1) % 10 == 0:
            print(f"    Images: {i+1}/{len(unique_images)} (ok:{img_success} fail:{img_fail})")

    # 保存图片映射
    img_map_path = tmpl_dir / "images.json"
    img_map_path.write_text(
        json.dumps(img_map, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"  Images downloaded: {img_success} ok, {img_fail} failed")

    # Step 7: 组件结构摘要
    comps_summary = _summarize_comps(data)

    # Step 8: 渲染 HTML (如果存在)
    html_preview = data.get("$appendix", {}).get("htmlForPreview", "")
    if html_preview:
        html_path = tmpl_dir / "preview.html"
        html_path.write_text(html_preview, encoding="utf-8")
        print(f"  HTML preview saved: {html_path}")

    # Step 9: 写入模板信息摘要
    summary = {
        "goods_id": goods_id,
        "show_id": show_info.get("show_id"),
        "title": title,
        "desc": show_info.get("desc", ""),
        "type": show_info.get("type_text", "paper"),
        "version": show_info.get("version"),
        "viewport": show_info.get("exif", {}).get("viewport", {}),
        "owner": show_info.get("owner", {}).get("nickname", ""),
        "created_at": show_info.get("created_at"),
        "text_count": len(clean_texts),
        "image_count": len(unique_images),
        "comp_count": len(comps_summary),
        "has_html_preview": bool(html_preview),
        "show_url": show_url,
    }
    summary_path = tmpl_dir / "summary.json"
    summary_path.write_text(
        json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    print(f"\n  Done! Output: {tmpl_dir}")
    print(f"  Summary: {json.dumps(summary, indent=2, ensure_ascii=False)}")


def _extract_texts(obj, texts: list, depth: int = 0):
    """递归提取所有文字字段."""
    if depth > 12:
        return
    if isinstance(obj, dict):
        for tf in ["txt1", "txt2", "txt3", "title", "content", "text", "desc"]:
            if tf in obj and isinstance(obj[tf], str) and len(obj[tf].strip()) > 1:
                texts.append((tf, obj[tf].strip()))
        for _, v in obj.items():
            _extract_texts(v, texts, depth + 1)
    elif isinstance(obj, list):
        for item in obj:
            _extract_texts(item, texts, depth + 1)


def _extract_images(obj, images: list, depth: int = 0):
    """递归提取所有图片URL."""
    if depth > 12:
        return
    if isinstance(obj, dict):
        s = json.dumps(obj, ensure_ascii=False)
        for m in re.finditer(r'url\(([^)]+)\)', s):
            url = m.group(1).strip("'\"")
            if url.startswith("//"):
                url = "https:" + url
            images.append(url)
        for m in re.finditer(
            r'"src":\s*"(//[^"]+\.(?:png|jpg|jpeg|gif|webp|svg)[^"]*)"', s, re.I
        ):
            images.append(m.group(1))
        for k in ["backgroundImage", "cover", "src", "loading_icon"]:
            if k in obj and isinstance(obj[k], str) and obj[k].startswith("//"):
                images.append(obj[k])
        for _, v in obj.items():
            _extract_images(v, images, depth + 1)
    elif isinstance(obj, list):
        for item in obj:
            _extract_images(item, images, depth + 1)


def _strip_html(text: str) -> str:
    """去除HTML标签，保留纯文本."""
    text = re.sub(r"<br\s*/?>", "\n", text)
    text = re.sub(r"</p>", "\n", text)
    text = re.sub(r"<[^>]+>", "", text)
    text = text.replace("&nbsp;", " ")
    text = text.replace("&lt;", "<")
    text = text.replace("&gt;", ">")
    text = text.replace("&amp;", "&")
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _summarize_comps(obj, depth: int = 0, limit: int = 80) -> list[dict]:
    """提取组件层级结构摘要."""
    result = []
    if depth > 6:
        return result

    if isinstance(obj, dict):
        comp = obj.get("_comp", {})
        if isinstance(comp, dict) and comp.get("tplId"):
            text_preview = ""
            for tf in ["txt1", "txt2", "txt3", "text", "title"]:
                if tf in obj and isinstance(obj[tf], str):
                    text_preview = _strip_html(obj[tf])[:limit]
                    break
            result.append({
                "tplId": comp["tplId"],
                "role": comp.get("constraint", {}).get("role", ""),
                "text_preview": text_preview,
            })

        for k, v in obj.items():
            if k == "_comp":
                continue
            result.extend(_summarize_comps(v, depth + 1, limit))

    elif isinstance(obj, list):
        for item in obj:
            result.extend(_summarize_comps(item, depth + 1, limit))

    return result


def main():
    parser = argparse.ArgumentParser(description="秀米模板商城爬虫")
    sub = parser.add_subparsers(dest="cmd")

    p_scrape = sub.add_parser("scrape", help="爬取模板元数据")
    p_scrape.add_argument("--pages", type=int, default=3, help="爬取页数 (每页50条)")
    p_scrape.add_argument("--type", dest="show_type", default="paper", help="模板类型")
    p_scrape.add_argument("--freefilter", default="all", choices=["all", "free"])
    p_scrape.add_argument("--limit", type=int, default=50)
    p_scrape.add_argument("--delay", type=float, default=0.5, help="请求间隔(秒)")

    p_dl = sub.add_parser("download-covers", help="下载封面图")
    p_dl.add_argument("--delay", type=float, default=0.3)

    p_ft = sub.add_parser("fetch-template", help="提取单个模板的全部素材")
    p_ft.add_argument("goods_id", type=int, help="模板 show_goods_id")
    p_ft.add_argument("--delay", type=float, default=0.3, help="请求间隔(秒)")

    sub.add_parser("stats", help="查看已有数据统计")

    args = parser.parse_args()

    if args.cmd == "scrape":
        scrape_metadata(
            pages=args.pages,
            show_type=args.show_type,
            freefilter=args.freefilter,
            limit=args.limit,
            delay=args.delay,
        )
    elif args.cmd == "download-covers":
        download_covers(delay=args.delay)
    elif args.cmd == "fetch-template":
        fetch_template(args.goods_id, delay=args.delay)
    elif args.cmd == "stats":
        show_stats()
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
