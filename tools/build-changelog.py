#!/usr/bin/env python3
"""
Regenerate swiftmediainfo/changelog.html from the project's GitHub Releases.

WHY STATIC HTML AND NOT A FETCH IN THE BROWSER

Fetching the API from the page would have been less work and worse in three
ways: the content would not exist in the HTML, so search engines would never
see it; it would break with scripts disabled; and every visitor would pay a
network round-trip to GitHub before the page finished. Generating the file
means one request for one document that is already complete.

WHY IT NEEDS NO TOKEN

The releases are public, and the public API allows unauthenticated reads. The
only write is to this repository, which the Action's own GITHUB_TOKEN covers.
There is nothing to configure and no secret to leak.

Run it by hand with:  python3 tools/build-changelog.py
"""

import html
import json
import os
import re
import sys
import urllib.request
from datetime import datetime

REPO = os.environ.get("SMI_REPO", "Undisclosed0369/SwiftMediaInfo")
PAGE = os.path.join(os.path.dirname(__file__), "..", "swiftmediainfo", "changelog.html")

START = "<!-- RELEASES:START"
END = "<!-- RELEASES:END -->"


# ---------------------------------------------------------------------------
# Markdown
#
# A deliberately small subset: headings, bullets, tables, bold, italic, inline
# code and links. Release notes are written by one person in a known style, so a
# full parser would be several hundred lines to handle syntax that will never
# appear.
#
# Tables were added after the v2.0 notes shipped with two of them and the page
# printed the raw pipes. They reuse the `.compare` styling from the features
# page rather than introducing a second table style — the two are the same
# object doing the same job, and one of them is already responsive.
#
# Everything is escaped BEFORE any markup is added, so a release note containing
# a stray angle bracket cannot inject anything into the page. That ordering is
# the only security-relevant line in this file.
# ---------------------------------------------------------------------------

def inline(text):
    text = html.escape(text)
    text = re.sub(r"`([^`]+)`", r"<code>\1</code>", text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<em>\1</em>", text)
    text = re.sub(
        r"\[([^\]]+)\]\((https?://[^\s)]+)\)",
        r'<a href="\2" rel="noopener">\1</a>',
        text,
    )
    # Bare URLs, but only ones not already inside an href.
    text = re.sub(
        r'(?<!href=")(?<!">)(https?://[^\s<]+)(?![^<]*</a>)',
        r'<a href="\1" rel="noopener">\1</a>',
        text,
    )
    return text


def is_table_row(line):
    """A line that could be part of a table: it has a pipe and starts with one."""
    return line.lstrip().startswith("|") and "|" in line.strip()[1:]


def is_table_divider(line):
    """The `| --- | --- |` line that turns the row above it into a header."""
    stripped = line.strip()
    if not stripped.startswith("|"):
        return False
    return bool(re.match(r"^\|[\s:|-]+\|?$", stripped)) and "-" in stripped


def split_row(line):
    """Cells from one table row, outer pipes discarded."""
    stripped = line.strip()
    if stripped.startswith("|"):
        stripped = stripped[1:]
    if stripped.endswith("|"):
        stripped = stripped[:-1]
    return [cell.strip() for cell in stripped.split("|")]


def render_table(rows):
    """
    One table, wrapped so it can scroll sideways on a phone.

    The first column becomes a row header rather than an ordinary cell. In
    every table these notes contain it is the label — a shortcut, a feature
    name — and the styling already treats that column as the thing you scan
    down.

    A header row of entirely empty cells is dropped. Markdown needs the row to
    exist so the divider has something to sit under; rendering it would draw a
    hairline under nothing.
    """
    header = rows[0]
    body = rows[1:]

    out = ['<div class="compare-wrap">', '<table class="compare release__table">']

    if any(cell for cell in header):
        cells = "".join(
            f'<th scope="col">{inline(cell) if cell else "&nbsp;"}</th>'
            for cell in header
        )
        out.append(f"<thead><tr>{cells}</tr></thead>")

    out.append("<tbody>")
    for row in body:
        if not row:
            continue
        first = f'<th scope="row">{inline(row[0])}</th>'
        rest = "".join(f"<td>{inline(cell)}</td>" for cell in row[1:])
        out.append(f"<tr>{first}{rest}</tr>")
    out.append("</tbody>")

    out.append("</table>")
    out.append("</div>")
    return "\n".join(out)


def to_html(markdown):
    out = []
    bullets = []

    def flush():
        if bullets:
            out.append("<ul>" + "".join(f"<li>{b}</li>" for b in bullets) + "</ul>")
            bullets.clear()

    lines = (markdown or "").replace("\r\n", "\n").split("\n")

    # An index rather than a plain loop, because a table can only be
    # recognised by looking at the line AFTER the one in hand: a row of pipes
    # is only a table if a divider follows it. Everything else here is still
    # decided one line at a time.
    i = -1
    while True:
        i += 1
        if i >= len(lines):
            break
        raw = lines[i]
        line = raw.rstrip()

        if not line.strip():
            flush()
            continue

        # A horizontal rule.
        #
        # These used to fall through to the paragraph branch and render as a
        # literal "---" in the middle of the notes. Markdown means it as a
        # divider, so it becomes one — drawn in the site's spectrum, which is
        # what the app uses wherever it separates one thing from another.
        if re.match(r"^\s*([-*_])\s*(\1\s*){2,}$", line):
            flush()
            out.append('<hr class="release__rule">')
            continue

        # A table. Recognised only when a divider follows the first row, which
        # is what stops a sentence containing a pipe from becoming one.
        if is_table_row(line) and i + 1 < len(lines) and is_table_divider(lines[i + 1]):
            flush()
            rows = [split_row(line)]
            i += 2
            while i < len(lines) and is_table_row(lines[i]):
                rows.append(split_row(lines[i]))
                i += 1
            i -= 1
            out.append(render_table(rows))
            continue

        heading = re.match(r"^(#{1,6})\s+(.*)$", line)
        if heading:
            flush()
            # The level is kept rather than flattened. Release notes are
            # written with structure — a title, then sections, then
            # subsections — and collapsing all of it to one size throws away
            # the shape the author gave it.
            depth = len(heading.group(1))
            tag = "h2" if depth <= 2 else ("h3" if depth == 3 else "h4")
            out.append(f"<{tag}>{inline(heading.group(2))}</{tag}>")
            continue

        bullet = re.match(r"^\s*[-*+]\s+(.*)$", line)
        if bullet:
            bullets.append(inline(bullet.group(1)))
            continue

        flush()
        out.append(f"<p>{inline(line)}</p>")

    flush()
    return "\n".join(out)


def slug(text):
    """A stable, readable anchor for a release, used by the contents list."""
    value = re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()
    return "release-" + (value or "untitled")


# ---------------------------------------------------------------------------
# Fetch and render
# ---------------------------------------------------------------------------

def fetch_releases():
    url = f"https://api.github.com/repos/{REPO}/releases?per_page=50"
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/vnd.github+json",
            # The API rejects requests with no user agent.
            "User-Agent": "swiftmediainfo-changelog-builder",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def render(releases):
    # Drafts are unpublished by definition. Prereleases are excluded too: this
    # page is what a user reads to decide whether to update, and a beta they
    # cannot install from the download page would only confuse that.
    releases = [r for r in releases if not r.get("draft") and not r.get("prerelease")]

    if not releases:
        return (
            '<div class="releases__empty">\n'
            "    <p>No releases yet.</p>\n"
            '    <p class="mt-1">\n'
            "        This page fills itself from\n"
            f'        <a class="link-brand" href="https://github.com/{REPO}/releases">GitHub Releases</a>\n'
            "        once the first one is published.\n"
            "    </p>\n"
            "</div>"
        )

    entries = []

    for index, release in enumerate(releases):
        name = release.get("name") or release.get("tag_name") or "Untitled"
        tag = release.get("tag_name") or ""
        url = release.get("html_url") or f"https://github.com/{REPO}/releases"

        published = release.get("published_at") or ""
        try:
            stamp = datetime.strptime(published, "%Y-%m-%dT%H:%M:%SZ")
            date = stamp.strftime("%-d %B %Y")
            short = stamp.strftime("%b %Y")
        except ValueError:
            date = short = ""

        entries.append({
            "name": name,
            "anchor": slug(tag or name),
            "date": date,
            "short": short,
            "url": url,
            "body": to_html(release.get("body")) or "<p>No notes for this release.</p>",
            "latest": index == 0,
        })

    # ----- Contents -------------------------------------------------------
    #
    # Sticky beside the releases on a wide screen, stacked above them on a
    # narrow one. With a dozen versions this page runs several screens long,
    # and what most people want is one specific version rather than a read
    # from the top.

    links = []
    for e in entries:
        latest = " toc__link--latest" if e["latest"] else ""
        links.append(
            '                <li>\n'
            f'                    <a class="toc__link{latest}" href="#{e["anchor"]}">\n'
            f'                        <span class="toc__name">{html.escape(e["name"])}</span>\n'
            f'                        <span class="toc__date">{html.escape(e["short"])}</span>\n'
            '                    </a>\n'
            '                </li>'
        )

    cards = []
    for e in entries:
        latest = " release--latest" if e["latest"] else ""
        cards.append(
            f'        <article class="release{latest}" id="{e["anchor"]}">\n'
            '            <header class="release__head">\n'
            f'                <h2 class="release__version">{html.escape(e["name"])}</h2>\n'
            f'                <span class="release__date">{html.escape(e["date"])}</span>\n'
            f'                <a class="release__link link-brand" href="{html.escape(e["url"])}" rel="noopener">On GitHub</a>\n'
            '            </header>\n'
            '            <div class="release__body">\n'
            f'{e["body"]}\n'
            '            </div>\n'
            '        </article>'
        )

    return (
        '<div class="changelog">\n'
        '    <nav class="toc" aria-label="Releases">\n'
        '        <p class="toc__title">Releases</p>\n'
        '        <ol class="toc__list">\n'
        + "\n".join(links) + "\n"
        '        </ol>\n'
        '    </nav>\n\n'
        '    <div class="releases">\n'
        + "\n".join(cards) + "\n"
        '    </div>\n'
        '</div>'
    )


def main():
    try:
        releases = fetch_releases()
    except Exception as error:
        # A failed fetch must not blank the page. Leaving yesterday's list in
        # place is always better than replacing it with an error.
        print(f"Could not reach the GitHub API: {error}", file=sys.stderr)
        return 1

    page = open(PAGE, encoding="utf-8").read()

    start = page.index(START)
    start = page.index("-->", start) + 3
    end = page.index(END)

    updated = page[:start] + "\n" + render(releases) + "\n            " + page[end:]

    if updated == page:
        print("No change.")
        return 0

    open(PAGE, "w", encoding="utf-8").write(updated)
    print(f"Wrote {len(releases)} release(s) to changelog.html")
    return 0


if __name__ == "__main__":
    sys.exit(main())
