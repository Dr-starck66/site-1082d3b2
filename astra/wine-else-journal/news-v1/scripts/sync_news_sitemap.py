#!/usr/bin/env python3
"""WINE ELSE: idempotent, zero-dependency 48-hour Google News sitemap synchronizer.

The permanent sitemap-journal.xml is authoritative for URLs and is NEVER modified.
Each eligible NewsArticle must have local HTML and valid JSON-LD datePublished.
Older articles are removed only from sitemap-news.xml, NOT the journal sitemap.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
import json
from pathlib import Path
import sys
import xml.etree.ElementTree as ET
from urllib.parse import unquote, urlsplit

NS = "http://www.sitemaps.org/schemas/sitemap/0.9"
NEWS = "http://www.google.com/schemas/sitemap-news/0.9"
HOST = "else.wine"
WINDOW = timedelta(hours=48)
ET.register_namespace("", NS)
ET.register_namespace("news", NEWS)


class Metadata(HTMLParser):
    def __init__(self):
        super().__init__()
        self.canonical = None
        self.jsonld: list[str] = []
        self._in_json = False

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag == "link" and attributes.get("rel") == "canonical":
            self.canonical = attributes.get("href")
        if tag == "script" and attributes.get("type") == "application/ld+json":
            self._in_json = True
            self.jsonld.append("")

    def handle_data(self, data):
        if self._in_json:
            self.jsonld[-1] += data

    def handle_endtag(self, tag):
        if tag == "script":
            self._in_json = False


def utc_date(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError(f"Publication timestamp needs explicit timezone: {value}")
    return parsed.astimezone(timezone.utc)


def article_file(root: Path, canonical: str) -> Path | None:
    parsed = urlsplit(canonical)
    if parsed.scheme != "https" or parsed.netloc != HOST or parsed.query or parsed.fragment:
        raise ValueError(f"Invalid canonical URL in journal sitemap: {canonical}")
    base = "/blog/"
    if not parsed.path.startswith(base):
        raise ValueError(f"Unexpected non-blog archive URL: {canonical}")
    slug = unquote(parsed.path[len(base):].strip("/"))
    if not slug:
        return None
    pieces = slug.split("/")
    if any(not p or p in (".", "..") or not all(c.isalnum() or c in "-_" for c in p) for p in pieces):
        raise ValueError(f"Invalid article path: {canonical}")
    return root.joinpath(*pieces, "index.html")


def read_news_article(path: Path, canonical: str) -> tuple[str, datetime, str] | None:
    parser = Metadata()
    parser.feed(path.read_text(encoding="utf-8"))
    if parser.canonical != canonical:
        raise ValueError(f"Canonical mismatch in {path}: {parser.canonical!r} != {canonical!r}")
    candidates = []
    for raw in parser.jsonld:
        data = json.loads(raw)
        queue = data if isinstance(data, list) else [data]
        for element in queue:
            if not isinstance(element, dict):
                continue
            graphs = element.get("@graph", [])
            candidates.extend(graphs if isinstance(graphs, list) else [])
            candidates.append(element)
    for article in candidates:
        if not isinstance(article, dict):
            continue
        types = article.get("@type", [])
        if isinstance(types, str):
            types = [types]
        if "NewsArticle" not in types:
            continue
        published = article.get("datePublished")
        title = article.get("headline")
        language = article.get("inLanguage", "en")
        if not isinstance(published, str) or not isinstance(title, str) or not title.strip():
            raise ValueError(f"Invalid NewsArticle metadata in {path}")
        if language != "en":
            raise ValueError(f"Unexpected NewsArticle language in {path}: {language}")
        return title, utc_date(published), published
    return None


def generate(root: Path, now: datetime) -> tuple[bytes, dict]:
    if now.tzinfo is None:
        raise ValueError("--at must be UTC offset-aware")
    now = now.astimezone(timezone.utc)
    archive = root / "sitemap-journal.xml"
    tree = ET.parse(archive)
    urls = []
    for entry in tree.getroot().findall(f"{{{NS}}}url"):
        loc = entry.findtext(f"{{{NS}}}loc")
        if not loc:
            raise ValueError("Archive sitemap has empty URL")
        urls.append(loc)
    if not urls or len(urls) != len(set(urls)):
        raise ValueError("Archive empty or contains duplicate URLs")
    kept, expired, future, legacy = [], [], [], []
    for url in urls:
        candidate = article_file(root, url)
        if candidate is None or not candidate.exists():
            legacy.append(url)
            continue
        parsed = read_news_article(candidate, url)
        if parsed is None:
            legacy.append(url)
            continue
        title, published, original = parsed
        age = now - published
        if age < timedelta(0):
            future.append(url)
        elif age <= WINDOW:
            kept.append((published, url, title, original))
        else:
            expired.append(url)
    if future:
        raise ValueError(f"Future-dated NewsArticle(s); refusing to write: {future}")
    if len(kept) > 1000:
        raise ValueError("Google News limit of 1,000 entries exceeded")
    out = ET.Element(f"{{{NS}}}urlset")
    for _, url, title, published in sorted(kept, key=lambda x: (-x[0].timestamp(), x[1])):
        item = ET.SubElement(out, f"{{{NS}}}url")
        ET.SubElement(item, f"{{{NS}}}loc").text = url
        news = ET.SubElement(item, f"{{{NEWS}}}news")
        publication = ET.SubElement(news, f"{{{NEWS}}}publication")
        ET.SubElement(publication, f"{{{NEWS}}}name").text = "WINE ELSE Journal"
        ET.SubElement(publication, f"{{{NEWS}}}language").text = "en"
        ET.SubElement(news, f"{{{NEWS}}}publication_date").text = published
        ET.SubElement(news, f"{{{NEWS}}}title").text = title
    ET.indent(out, space="  ")
    content = ET.tostring(out, encoding="utf-8", xml_declaration=True) + b"\n"
    summary = {"utc_now": now.isoformat(), "archive_urls_unchanged": len(urls),
               "news_retained": len(kept), "news_expired": len(expired),
               "news_expired_urls": sorted(expired), "non_news_or_legacy_urls": len(legacy)}
    return content, summary


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--at", default=datetime.now(timezone.utc).isoformat(),
                        help="For reproducible tests: ISO UTC instant, e.g. 2026-11-03T07:43:00Z")
    parser.add_argument("--check", action="store_true", help="Exit 2 if News sitemap needs updating")
    args = parser.parse_args(argv)
    content, report = generate(args.root, utc_date(args.at))
    target = args.root / "sitemap-news.xml"
    existing = target.read_bytes() if target.exists() else b""
    changed = existing != content
    report["changed"] = changed
    report["status"] = "STALE" if changed and args.check else "PASS"
    if changed and not args.check:
        target.write_bytes(content)
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 2 if changed and args.check else 0


if __name__ == "__main__":
    sys.exit(main())
