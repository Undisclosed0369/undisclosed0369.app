#!/usr/bin/env python3
"""
Tell search engines that pages on this site have changed.

WHAT INDEXNOW IS

A protocol, run jointly by Bing and Yandex and honoured by Naver and
Seznam, for announcing that a URL is new or has changed. One request to
api.indexnow.org reaches all of them. Bing in particular treats it as a
far stronger signal than a sitemap: a sitemap says "these pages exist";
IndexNow says "look at this one, now".

This exists because Bing read the sitemap once, found every page, indexed
the homepage, and then did not come back for a month.

HOW OWNERSHIP IS PROVED

A text file at the root of the site, named after a random key and
containing that key. IndexNow fetches it to confirm the request came from
whoever controls the domain. The key is not a secret — it is public by
design, sitting in a file anyone can read — so it lives in this script
rather than in a GitHub secret.

USAGE

    python3 tools/indexnow.py                     # every URL in sitemap.xml
    python3 tools/indexnow.py a.html b/c.html     # only these files

The second form is what the workflow uses: it passes the files a push
actually changed, so an edit to the FAQ announces the FAQ and nothing else.
Resubmitting unchanged pages is not harmful at nine URLs, but it is not
what the protocol asks for, and it would teach Bing to discount the pings.
"""

import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

HOST = "undisclosed0369.app"
KEY = "26006558f466b4d4f84238171dc1de4c"
ENDPOINT = "https://api.indexnow.org/indexnow"

ROOT = Path(__file__).resolve().parent.parent


def sitemap_urls():
    text = (ROOT / "sitemap.xml").read_text(encoding="utf-8")
    return re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", text)


def url_for(path):
    """
    The public URL for a file in the repository, or None if it is not a
    page anyone visits.

    Matches how GitHub Pages serves the site and how the site links to it:
    `index.html` is reached at its folder, everything else at its name without
    the extension (faq.html is /faq). The 404 page is skipped
    deliberately — announcing it would invite Bing to index an error page.
    """
    path = path.strip().lstrip("./")

    if not path.endswith(".html") or path == "404.html":
        return None

    if path == "index.html":
        return "https://%s/" % HOST
    if path.endswith("/index.html"):
        return "https://%s/%s" % (HOST, path[: -len("index.html")])
    return "https://%s/%s" % (HOST, path[: -len(".html")])


def submit(urls):
    payload = json.dumps({
        "host": HOST,
        "key": KEY,
        "keyLocation": "https://%s/%s.txt" % (HOST, KEY),
        "urlList": urls,
    }).encode("utf-8")

    request = urllib.request.Request(
        ENDPOINT,
        data=payload,
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status, ""
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode("utf-8", "replace")


def main():
    if len(sys.argv) > 1:
        urls = sorted({u for u in (url_for(p) for p in sys.argv[1:]) if u})
    else:
        urls = sitemap_urls()

    if not urls:
        print("No pages changed. Nothing to announce.")
        return 0

    print("Announcing %d URL%s:" % (len(urls), "" if len(urls) == 1 else "s"))
    for url in urls:
        print("  " + url)

    status, body = submit(urls)

    # 200 and 202 both mean accepted. 202 is what a key seen for the first
    # time gets back — IndexNow has queued the ownership check and will
    # process the URLs once the key file verifies.
    if status in (200, 202):
        print("Accepted (%d)." % status)
        return 0

    explanations = {
        400: "Malformed request.",
        403: "The key file could not be verified. Check it is live at the site root.",
        422: "A URL does not belong to %s, or the key does not match." % HOST,
        429: "Too many requests. Try again later.",
    }
    print("Rejected (%d). %s" % (status, explanations.get(status, "")))
    if body:
        print(body)
    return 1


if __name__ == "__main__":
    sys.exit(main())
