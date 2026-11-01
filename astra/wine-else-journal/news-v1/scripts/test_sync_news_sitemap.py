"""Regression tests for WINE ELSE News sitemap. stdlib unittest, no network."""
from __future__ import annotations
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import tempfile
import unittest
import xml.etree.ElementTree as ET
from sync_news_sitemap import NS, NEWS, generate, main

DATE = datetime(2026, 11, 3, 7, 42, 51, tzinfo=timezone.utc)
OLD_URL = "https://else.wine/blog/old-guide/"
NEWS_URL = "https://else.wine/blog/occitanie-2026-wine-harvest-rebound/"
NEW_URL = "https://else.wine/blog/news/a-new-story/"


class SitemapTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.archive = self.root / "sitemap-journal.xml"
        self.archive.write_text(
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            f'<urlset xmlns="{NS}">'
            f'<url><loc>{OLD_URL}</loc></url>'
            f'<url><loc>{NEWS_URL}</loc></url>'
            f'<url><loc>{NEW_URL}</loc></url></urlset>', encoding="utf-8")
        self.saved_archive = self.archive.read_bytes()
        self.create(NEWS_URL, DATE - timedelta(hours=48))
        self.create(NEW_URL, DATE - timedelta(minutes=1))

    def create(self, url, date):
        path = self.root / '/'.join(url.split('/')[4:]).strip('/') / 'index.html'
        path.parent.mkdir(parents=True, exist_ok=True)
        meta = {'@type':'NewsArticle','headline':'First wine story',
                'datePublished':date.isoformat().replace('+00:00','Z'), 'inLanguage':'en'}
        path.write_text(f'<html><head><link rel="canonical" href="{url}"><script type="application/ld+json">{json.dumps(meta)}</script></head></html>', encoding='utf-8')

    def list_news_urls(self, content):
        root=ET.fromstring(content)
        return [e.findtext(f'{{{NS}}}loc') for e in root.findall(f'{{{NS}}}url')]

    def test_48h_boundary_retains_and_next_second_expires(self):
        content, report = generate(self.root, DATE)
        self.assertEqual(set(self.list_news_urls(content)), {NEWS_URL, NEW_URL})
        self.assertEqual(report['news_retained'], 2)
        after, report2 = generate(self.root, DATE + timedelta(seconds=1))
        self.assertEqual(self.list_news_urls(after), [NEW_URL])
        self.assertEqual(report2['news_expired'], 1)

    def test_empty_news_ok_archive_untouched(self):
        content, report = generate(self.root, DATE + timedelta(days=3))
        self.assertEqual(self.list_news_urls(content), [])
        self.assertEqual(report['archive_urls_unchanged'], 3)
        self.assertEqual(self.archive.read_bytes(), self.saved_archive)

    def test_repeated_execution_is_idempotent(self):
        instant = DATE + timedelta(hours=1)
        self.assertEqual(main(['--root',str(self.root),'--at',instant.isoformat()]), 0)
        first = (self.root/'sitemap-news.xml').read_bytes()
        self.assertEqual(main(['--root',str(self.root),'--at',instant.isoformat(),'--check']),0)
        self.assertEqual((self.root/'sitemap-news.xml').read_bytes(), first)

    def test_archive_only_adds_new_eligible_article(self):
        self.assertTrue(NEW_URL in self.list_news_urls(generate(self.root, DATE)[0]))

    def test_future_article_fail_closed(self):
        self.create(NEWS_URL, DATE + timedelta(seconds=1))
        with self.assertRaisesRegex(ValueError,'Future-dated'):
            generate(self.root, DATE)

    def test_invalid_canonical_fail_closed(self):
        p=self.root/'occitanie-2026-wine-harvest-rebound/index.html'
        p.write_text(p.read_text().replace(f'href="{NEWS_URL}"','href="https://bad.invalid/"'))
        with self.assertRaisesRegex(ValueError,'Canonical mismatch'):
            generate(self.root, DATE)


if __name__ == '__main__':
    unittest.main()
