#!/usr/bin/env python3
"""
Preview the site locally, served the way GitHub Pages serves it.

WHY NOT `python3 -m http.server`

The site links to pages without their extension (/swiftmediainfo/faq is
faq.html) and relies on the 404 page to send mixed-case addresses to their
lowercase form. Python's built-in server does neither, and on a Mac it also
matches paths regardless of case, because the disk does. So links that work
on the live site break locally, and a case mistake that would 404 online
loads fine here. This server behaves like GitHub Pages instead:

  - paths match exactly, letter case included
  - a page loads with or without .html (faq and faq.html are the same page)
  - a folder without its trailing slash redirects to it (/swiftmediainfo)
  - a folder serves its index.html
  - anything else gets 404.html, with a real 404 status

Nothing is cached, so an edit shows on the next reload.

USAGE

    python3 tools/preview.py                      # http://127.0.0.1:8000
    python3 tools/preview.py 192.168.1.52 8014    # reachable from a phone on the same network

Stop it with Control-C.
"""

import http.server
import os
import sys
import urllib.parse

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def exact(relative):
    """The file or folder at `relative`, matched with exact letter case, or None."""
    current = ROOT
    for part in [p for p in relative.split("/") if p]:
        try:
            names = os.listdir(current)
        except (NotADirectoryError, FileNotFoundError):
            return None
        if part not in names:
            return None
        current = os.path.join(current, part)
    return current


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_HEAD(self):
        self.respond(body=False)

    def do_GET(self):
        self.respond(body=True)

    def respond(self, body):
        url = urllib.parse.urlsplit(self.path)
        relative = urllib.parse.unquote(url.path)
        found = exact(relative)

        if found and os.path.isdir(found):
            if not relative.endswith("/"):
                query = ("?" + url.query) if url.query else ""
                self.send_response(301)
                self.send_header("Location", url.path + "/" + query)
                self.end_headers()
                return
            found = exact(relative + "index.html")

        if found is None and not relative.endswith(".html"):
            found = exact(relative + ".html")

        if found and os.path.isfile(found):
            self.send_file(found, 200, body)
        else:
            self.send_file(os.path.join(ROOT, "404.html"), 404, body)

    def send_file(self, path, status, body):
        with open(path, "rb") as f:
            data = f.read()
        self.send_response(status)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if body:
            self.wfile.write(data)


def main():
    host = sys.argv[1] if len(sys.argv) > 1 else "127.0.0.1"
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 8000
    server = http.server.ThreadingHTTPServer((host, port), Handler)
    print("Serving %s at http://%s:%d/  (Control-C to stop)" % (ROOT, host, port))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
