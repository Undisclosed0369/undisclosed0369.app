/* ===================================================================
   online.js — MediaInfo, in the browser

   WHAT THIS IS

   MediaInfoLib compiled to WebAssembly. The same library the Mac app
   shells out to, running inside the page. No server is involved at any
   point: the file is read by the browser, handed to the WASM module in
   chunks, and the report comes back. Nothing is uploaded, and there is
   nothing here to upload it to — this site is static files.

   That is not a promise that has to be taken on trust. Open the network
   tab and drop a file in; nothing goes out.

   WHY CHUNKED READING MATTERS

   `analyzeData` asks for the file's size and then requests slices as it
   needs them. A 40 GB disc image never enters memory whole — MediaInfo
   reads the header, seeks to where the trailer should be, and stops.
   Reading the whole file into an ArrayBuffer would crash the tab on
   anything large, which is the usual way this gets built wrong.

   WHY THE WASM LOADS LATE

   2.5 MB, fetched only when someone picks a file. Most people who open
   this page are reading it, not using it.
   =================================================================== */

(function () {
    'use strict';

    var FORMATS = ['text', 'HTML', 'XML', 'JSON'];

    var EXTENSIONS = {
        text: 'txt',
        HTML: 'html',
        XML: 'xml',
        JSON: 'json'
    };

    var MIME = {
        text: 'text/plain;charset=utf-8',
        HTML: 'text/html;charset=utf-8',
        XML: 'application/xml;charset=utf-8',
        JSON: 'application/json;charset=utf-8'
    };

    var drop = document.getElementById('drop');
    var input = document.getElementById('file-input');
    var status = document.getElementById('status');
    var statusText = document.getElementById('status-text');
    var result = document.getElementById('result');
    var output = document.getElementById('output');
    var render = document.getElementById('render');
    var paneText = document.getElementById('pane-text');
    var paneHtml = document.getElementById('pane-html');
    var formatBar = document.getElementById('formats');
    var thumb = document.getElementById('formats-thumb');
    var copyBtn = document.getElementById('copy-btn');
    var downloadBtn = document.getElementById('download-btn');
    var downloadPanel = document.getElementById('download-panel');
    var downloadMenu = document.getElementById('download-menu');

    if (!drop || !input) { return; }

    var currentFile = null;
    var currentFormat = 'text';
    var reports = {};
    var busy = false;

    // ---------------------------------------------------------------
    // Small helpers
    // ---------------------------------------------------------------

    function setStatus(state, message) {
        status.className = 'status' + (state ? ' is-' + state : '');
        statusText.innerHTML = message;
    }

    function formatBytes(bytes) {
        if (bytes < 1024) { return bytes + ' B'; }
        var units = ['KiB', 'MiB', 'GiB', 'TiB'];
        var value = bytes;
        var i = -1;
        do {
            value /= 1024;
            i += 1;
        } while (value >= 1024 && i < units.length - 1);
        return (value >= 10 ? Math.round(value) : value.toFixed(1)) + ' ' + units[i];
    }

    // Everything reaching the status line comes from a filename, so it is
    // escaped. `<img onerror=…>.mkv` is a perfectly legal filename and
    // this page will not run it.
    function escapeHtml(text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function baseName() {
        if (!currentFile) { return 'mediainfo'; }
        return currentFile.name.replace(/\.[^.]+$/, '') || 'mediainfo';
    }

    // ---------------------------------------------------------------
    // Button feedback
    //
    // One place, so Copy and Download behave identically: swap the
    // label, colour the button, put it back after a moment.
    // ---------------------------------------------------------------

    function flash(button, label, failed) {
        var text = button.querySelector('.btn-act__label');
        var original = text.dataset.original || text.textContent;
        text.dataset.original = original;

        button.classList.remove('is-done', 'is-failed');
        // Reading offsetWidth restarts the animation when the same state
        // is applied twice in a row; without it, a second press does
        // nothing visible.
        void button.offsetWidth;
        button.classList.add(failed ? 'is-failed' : 'is-done');
        text.textContent = label;

        clearTimeout(button._flashTimer);
        button._flashTimer = setTimeout(function () {
            button.classList.remove('is-done', 'is-failed');
            text.textContent = original;
        }, 1600);
    }

    // ---------------------------------------------------------------
    // The WASM module
    // ---------------------------------------------------------------

    var scriptPromise = null;
    var instances = {};

    function loadScript() {
        if (scriptPromise) { return scriptPromise; }

        scriptPromise = new Promise(function (resolve, reject) {
            var el = document.createElement('script');
            el.src = '../assets/vendor/mediainfo/mediainfo.min.js';
            el.onload = resolve;
            el.onerror = function () {
                scriptPromise = null;
                reject(new Error('The analyser could not be loaded.'));
            };
            document.head.appendChild(el);
        });

        return scriptPromise;
    }

    function getInstance(format) {
        if (instances[format]) { return instances[format]; }

        instances[format] = loadScript().then(function () {
            if (!window.MediaInfo || !window.MediaInfo.mediaInfoFactory) {
                throw new Error('The analyser could not be loaded.');
            }

            return window.MediaInfo.mediaInfoFactory({
                format: format,
                chunkSize: 256 * 1024,
                coverData: false,
                locateFile: function () {
                    return '../assets/vendor/mediainfo/MediaInfoModule.wasm';
                }
            });
        }).catch(function (error) {
            // A rejected promise must not stay cached, or every retry
            // returns the same failure and the button appears dead.
            delete instances[format];
            throw error;
        });

        return instances[format];
    }

    function readChunk(file) {
        return function (chunkSize, offset) {
            return new Promise(function (resolve, reject) {
                var reader = new FileReader();

                reader.onload = function (event) {
                    if (event.target.error) {
                        reject(event.target.error);
                        return;
                    }
                    resolve(new Uint8Array(event.target.result));
                };

                reader.onerror = function () {
                    reject(reader.error || new Error('The file could not be read.'));
                };

                reader.readAsArrayBuffer(file.slice(offset, offset + chunkSize));
            });
        };
    }

    // ---------------------------------------------------------------
    // Putting the filename back
    //
    // MediaInfo normally prints a "Complete name" at the top of the
    // General section. It cannot here: the browser hands over a file
    // with no path and no name attached — `analyzeData` is given bytes
    // and a length, nothing else — so the field simply never appears.
    //
    // That is a real loss. A report you saved six months ago is far less
    // use when it does not say which file it describes, and the app's
    // reports all carry it.
    //
    // So it is written back in, per format, in the place MediaInfo would
    // have put it. The name only — not a path, because there is not one,
    // and inventing one would be worse than leaving it out.
    // ---------------------------------------------------------------

    function xmlEscape(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function nameIntoText(report, name) {
        // The colon column is taken from the report itself rather than
        // assumed: MediaInfo pads field names to the longest one present,
        // so the alignment differs from file to file.
        var match = report.match(/^[^\n:]+?(\s+): /m);
        var column = match ? match[0].indexOf(':') : 41;

        var label = 'Complete name';
        var padding = Math.max(1, column - label.length);
        var line = label + new Array(padding + 1).join(' ') + ': ' + name;

        // Straight after the first section heading, which is where
        // MediaInfo puts it.
        if (/^General\s*$/m.test(report)) {
            return report.replace(/^(General[^\n]*\n)/m, '$1' + line + '\n');
        }
        return line + '\n' + report;
    }

    function nameIntoJson(report, name) {
        try {
            var data = JSON.parse(report);
            if (data && data.media) {
                data.media['@ref'] = name;

                var tracks = data.media.track;
                if (Object.prototype.toString.call(tracks) === '[object Array]') {
                    for (var i = 0; i < tracks.length; i += 1) {
                        if (tracks[i]['@type'] === 'General') {
                            tracks[i].CompleteName = name;
                            tracks[i].FileName = name.replace(/\.[^.]+$/, '');
                            break;
                        }
                    }
                }
            }
            return JSON.stringify(data, null, 2);
        } catch (error) {
            // Malformed JSON is MediaInfo's business, not ours. Better to
            // hand back exactly what it produced than to mangle it.
            return report;
        }
    }

    function nameIntoXml(report, name) {
        var safe = xmlEscape(name);

        if (/<media\b[^>]*\bref="/i.test(report)) {
            return report.replace(/(<media\b[^>]*\bref=")([^"]*)(")/i, '$1' + safe + '$3');
        }
        if (/<media\b/i.test(report)) {
            return report.replace(/<media\b/i, '<media ref="' + safe + '"');
        }
        return report;
    }

    function nameIntoHtml(report, name) {
        var safe = xmlEscape(name);
        var row = '<tr><td>Complete name</td><td>' + safe + '</td></tr>';

        // MediaInfo's HTML puts the "General" heading OUTSIDE the table of
        // fields, not in a row of it. Inserting after the first <table>
        // therefore lands the row above the heading, orphaned — which is
        // exactly what it did on the first attempt.
        //
        // So the anchor is the heading itself: find where "General" is
        // announced, then insert before the first row that follows it. That
        // puts Complete name at the top of the General fields, which is
        // where MediaInfo would have printed it.
        var heading = report.search(/<(?:h[1-6]|caption|th|td|p|div|strong|b)[^>]*>\s*General\b/i);

        if (heading !== -1) {
            var firstRow = report.indexOf('<tr', heading);
            if (firstRow !== -1) {
                return report.slice(0, firstRow) + row + report.slice(firstRow);
            }
        }

        // No recognisable General block — put it at the top of the first
        // table rather than dropping the name entirely.
        if (/<table[^>]*>/i.test(report)) {
            return report.replace(/(<table[^>]*>\s*(?:<tbody[^>]*>\s*)?)/i, '$1' + row);
        }

        return report;
    }

    function withFileName(format, report, name) {
        if (!name) { return report; }

        if (format === 'text') { return nameIntoText(report, name); }
        if (format === 'JSON') { return nameIntoJson(report, name); }
        if (format === 'XML')  { return nameIntoXml(report, name); }
        if (format === 'HTML') { return nameIntoHtml(report, name); }
        return report;
    }

    function analyse(file, format) {
        return getInstance(format).then(function (mediainfo) {
            return mediainfo.analyzeData(function () { return file.size; }, readChunk(file));
        }).then(function (report) {
            var text = typeof report === 'string' ? report : String(report);
            return withFileName(format, text, file.name);
        });
    }

    // ---------------------------------------------------------------
    // The rendered HTML view
    //
    // MediaInfo's HTML output is a bare document: tables, headings, no
    // styling worth the name. The app wraps it in a stylesheet before
    // handing it to WebKit, and this does the same, with the same
    // palette — so the report looks the same in a browser tab as it
    // does in the app.
    //
    // It goes into a frame with `sandbox` and no `allow-scripts`, which
    // means no script in that document can run, whatever ends up in it.
    // ---------------------------------------------------------------

    function isDark() {
        var explicit = document.documentElement.getAttribute('data-theme');
        if (explicit === 'dark') { return true; }
        if (explicit === 'light') { return false; }
        return window.matchMedia &&
               window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    function reportStyles(dark) {
        var fg          = dark ? '#ededf5' : '#1a1a2e';
        var fgSecondary = dark ? '#d0d0e4' : '#3a3a5c';
        var border      = dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.10)';
        var headerBg    = dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.025)';
        var hoverBg     = dark ? 'rgba(130,100,255,0.10)' : 'rgba(130,100,255,0.05)';
        var titleBg     = dark ? 'rgba(130,100,255,0.12)' : 'rgba(130,100,255,0.07)';
        var titleBorder = dark ? 'rgba(160,130,255,0.6)'  : 'rgba(130,100,255,0.4)';
        var accent      = dark ? '#c4b5fd' : '#7c3aed';
        var valueFg     = dark ? '#f8f8ff' : '#111128';
        var tableBg     = dark ? 'rgba(30,30,50,0.95)'    : '#ffffff';
        var pageBg      = dark ? '#16161c' : '#fbfbfd';
        var shadow      = dark
            ? '0 2px 8px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.05)'
            : '0 1px 4px rgba(0,0,0,0.06)';

        return [
            '* { box-sizing: border-box; }',

            '::-webkit-scrollbar { width: 8px; height: 8px; }',
            '::-webkit-scrollbar-track { background: ' + (dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)') + '; border-radius: 4px; }',
            '::-webkit-scrollbar-thumb { background: ' + (dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)') + '; border-radius: 4px; }',
            '::-webkit-scrollbar-thumb:hover { background: ' + (dark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)') + '; }',

            'body {',
            '  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif;',
            '  font-size: 12px; line-height: 1.5; margin: 0; padding: 16px;',
            '  background: ' + pageBg + '; color: ' + fg + ';',
            '  -webkit-font-smoothing: antialiased;',
            '}',

            'h1, h2, h3, .track-title {',
            '  font-size: 14px; font-weight: 700; letter-spacing: 0.03em;',
            '  color: ' + accent + '; margin: 24px 0 10px 0; padding: 10px 16px;',
            '  background: ' + titleBg + '; border-left: 3px solid ' + titleBorder + ';',
            '  border-radius: 0 8px 8px 0;',
            '}',
            'h1:first-child, h2:first-child, h3:first-child { margin-top: 0; }',

            'table {',
            '  border-collapse: separate; border-spacing: 0; width: 100%;',
            '  margin: 0 0 20px 0; border: 1px solid ' + border + ';',
            '  border-radius: 10px; overflow: hidden; background: ' + tableBg + ';',
            '  box-shadow: ' + shadow + ';',
            '}',

            'td, th {',
            '  padding: 9px 16px; border-bottom: 1px solid ' + border + ';',
            '  text-align: left; vertical-align: top; transition: background 0.12s ease;',
            '}',
            'tr:last-child td { border-bottom: none; }',

            'td:first-child {',
            '  font-weight: 600; font-size: 12.5px; color: ' + fgSecondary + ';',
            '  white-space: nowrap; width: 30%; min-width: 140px;',
            '}',
            'td:last-child {',
            '  font-size: 12.5px; font-weight: 500; color: ' + valueFg + ';',
            '  word-break: break-word;',
            '}',

            'th {',
            '  font-weight: 700; font-size: 11.5px; letter-spacing: 0.04em;',
            '  text-transform: uppercase; background: ' + headerBg + ';',
            '  color: ' + fgSecondary + ';',
            '}',

            'tr:nth-child(even) td { background: ' + headerBg + '; }',
            'tr:hover td { background: ' + hoverBg + '; }',

            'a { color: ' + accent + '; text-decoration: none; }',
            'a:hover { text-decoration: underline; }',

            'hr { border: none; border-top: 1px solid ' + border + '; margin: 16px 0; }',

            'pre, code {',
            '  font-family: "SF Mono", Menlo, monospace; font-size: 11.5px;',
            '  background: ' + headerBg + '; border-radius: 4px; padding: 2px 5px;',
            '}',
            'pre { padding: 12px 14px; overflow-x: auto; border: 1px solid ' + border + '; }',

            '@media (prefers-reduced-motion: reduce) { td, th { transition: none; } }'
        ].join('\n');
    }

    function paint(html) {
        var style = '<style>' + reportStyles(isDark()) + '</style>';

        // MediaInfo returns a whole document. The stylesheet goes last so
        // it wins against anything the library shipped inline; if there
        // is no head to put it in, the document is wrapped in one.
        var doc;
        if (/<\/head>/i.test(html)) {
            doc = html.replace(/<\/head>/i, style + '</head>');
        } else if (/<body[^>]*>/i.test(html)) {
            doc = html.replace(/<body([^>]*)>/i, '<body$1>' + style);
        } else {
            doc = '<!DOCTYPE html><html><head><meta charset="utf-8">' + style +
                  '</head><body>' + html + '</body></html>';
        }

        render.srcdoc = doc;
    }

    // Repaint on theme change so the report follows the site rather than
    // sitting there in yesterday's colours.
    var themeObserver = new MutationObserver(function () {
        if (currentFormat === 'HTML' && reports.HTML) { paint(reports.HTML); }
    });
    themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme']
    });

    if (window.matchMedia) {
        var systemDark = window.matchMedia('(prefers-color-scheme: dark)');
        var onSystemChange = function () {
            if (currentFormat === 'HTML' && reports.HTML) { paint(reports.HTML); }
        };
        if (systemDark.addEventListener) {
            systemDark.addEventListener('change', onSystemChange);
        } else if (systemDark.addListener) {
            systemDark.addListener(onSystemChange);
        }
    }

    // ---------------------------------------------------------------
    // Showing a report
    // ---------------------------------------------------------------

    var FORMAT_COLOURS = {
        text: 'var(--violet)',
        HTML: 'var(--pink)',
        XML: 'var(--blue)',
        JSON: 'var(--teal)'
    };

    function moveThumb() {
        var active = formatBar.querySelector('[aria-selected="true"]');
        if (!active) { return; }

        thumb.style.setProperty('--thumb-w', active.offsetWidth + 'px');
        thumb.style.setProperty('--thumb-x', active.offsetLeft + 'px');
        thumb.style.setProperty('--thumb-c', FORMAT_COLOURS[active.dataset.format]);
        thumb.classList.add('is-ready');
    }

    function showPane(format) {
        var wantsHtml = format === 'HTML';

        // Re-adding the pane element's animation class is what makes the
        // fade run again on every switch.
        paneText.hidden = wantsHtml;
        paneHtml.hidden = !wantsHtml;

        var pane = wantsHtml ? paneHtml : paneText;
        pane.style.animation = 'none';
        void pane.offsetWidth;
        pane.style.animation = '';
    }

    function readyMessage() {
        return '<span class="status__file">' + escapeHtml(currentFile.name) + '</span> · ' +
               formatBytes(currentFile.size);
    }

    function display(format) {
        var text = reports[format];

        if (format === 'HTML') {
            paint(text);
        } else {
            output.textContent = text;
        }

        showPane(format);
        setStatus('done', readyMessage());
    }

    function select(format) {
        currentFormat = format;

        Array.prototype.forEach.call(
            formatBar.querySelectorAll('.formats__btn'),
            function (btn) {
                btn.setAttribute(
                    'aria-selected',
                    btn.dataset.format === format ? 'true' : 'false'
                );
            }
        );

        moveThumb();

        if (!currentFile) { return; }

        if (reports[format] !== undefined) {
            display(format);
            return;
        }

        run(format);
    }

    function run(format) {
        if (busy) { return; }
        busy = true;

        result.hidden = false;
        moveThumb();
        setStatus('working', 'Reading ' + escapeHtml(currentFile.name) + '…');

        var file = currentFile;

        analyse(file, format).then(function (text) {
            if (file !== currentFile) { return; }

            if (!text.trim()) {
                setStatus('error',
                    'MediaInfo found nothing to report in this file. It may not be a ' +
                    'media file, or it may be damaged.');
                return;
            }

            reports[format] = text;
            display(format);
        }).catch(function (error) {
            if (file !== currentFile) { return; }
            output.textContent = '';
            setStatus('error', escapeHtml(
                error && error.message ? error.message
                                       : 'Something went wrong reading that file.'
            ));
        }).then(function () {
            busy = false;
        });
    }

    function accept(file) {
        if (!file) { return; }
        currentFile = file;
        reports = {};
        select(currentFormat);
    }

    // ---------------------------------------------------------------
    // Input
    // ---------------------------------------------------------------

    drop.addEventListener('click', function () { input.click(); });

    drop.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            input.click();
        }
    });

    input.addEventListener('change', function () {
        accept(input.files && input.files[0]);
        // Cleared so picking the same file twice still fires a change.
        input.value = '';
    });

    // Bound to the window rather than the drop zone, so a file dragged
    // anywhere over the page is caught. Someone who has scrolled past
    // the target should not have to scroll back to it.
    var dragDepth = 0;

    function hasFiles(event) {
        return event.dataTransfer &&
               Array.prototype.indexOf.call(event.dataTransfer.types || [], 'Files') !== -1;
    }

    window.addEventListener('dragenter', function (event) {
        if (!hasFiles(event)) { return; }
        event.preventDefault();
        dragDepth += 1;
        drop.classList.add('is-over');
    });

    window.addEventListener('dragover', function (event) {
        if (!hasFiles(event)) { return; }
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
    });

    // Counted rather than toggled: dragging across a child fires leave on
    // the parent, and a naive handler flickers the whole way down.
    window.addEventListener('dragleave', function () {
        dragDepth = Math.max(0, dragDepth - 1);
        if (dragDepth === 0) { drop.classList.remove('is-over'); }
    });

    window.addEventListener('drop', function (event) {
        if (!hasFiles(event)) { return; }
        event.preventDefault();
        dragDepth = 0;
        drop.classList.remove('is-over');

        var files = event.dataTransfer.files;
        if (files && files.length) { accept(files[0]); }
    });

    // ---------------------------------------------------------------
    // Format tabs
    // ---------------------------------------------------------------

    formatBar.addEventListener('click', function (event) {
        var btn = event.target.closest('.formats__btn');
        if (!btn || busy) { return; }
        select(btn.dataset.format);
    });

    formatBar.addEventListener('keydown', function (event) {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') { return; }

        var index = FORMATS.indexOf(currentFormat);
        var next = event.key === 'ArrowRight'
            ? (index + 1) % FORMATS.length
            : (index - 1 + FORMATS.length) % FORMATS.length;

        event.preventDefault();
        select(FORMATS[next]);
        formatBar.querySelector('[data-format="' + FORMATS[next] + '"]').focus();
    });

    // The thumb is positioned in pixels, so it has to be re-measured when
    // the tabs change width.
    window.addEventListener('resize', moveThumb);

    // ---------------------------------------------------------------
    // Copy
    //
    // The Clipboard API is the right way and fails in more situations
    // than its reputation suggests — an unfocused document is enough. So
    // the old `execCommand` path stays as a fallback, and if both fail
    // the button says so rather than doing nothing.
    // ---------------------------------------------------------------

    function legacyCopy(text) {
        var area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.top = '0';
        area.style.left = '-9999px';
        document.body.appendChild(area);

        area.select();
        area.setSelectionRange(0, text.length);

        var ok = false;
        try {
            ok = document.execCommand('copy');
        } catch (error) {
            ok = false;
        }

        document.body.removeChild(area);
        return ok;
    }

    copyBtn.addEventListener('click', function () {
        var text = reports[currentFormat];

        if (!text) {
            flash(copyBtn, 'Nothing yet', true);
            return;
        }

        function fallback() {
            var ok = legacyCopy(text);
            flash(copyBtn, ok ? 'Copied' : 'Blocked', !ok);
        }

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () {
                flash(copyBtn, 'Copied');
            }).catch(fallback);
            return;
        }

        fallback();
    });

    // ---------------------------------------------------------------
    // ZIP
    //
    // Written here rather than pulled in as a library. A zip of four text
    // files with no compression is about sixty lines of header writing,
    // and the alternative was a third-party dependency on a page whose
    // entire argument is that nothing goes anywhere.
    //
    // Stored, not deflated. Four text files compress well, but adding an
    // implementation of DEFLATE to save a few kilobytes on a download
    // measured in kilobytes is not a trade worth making.
    // ---------------------------------------------------------------

    var CRC_TABLE = (function () {
        var table = new Uint32Array(256);
        for (var n = 0; n < 256; n += 1) {
            var c = n;
            for (var k = 0; k < 8; k += 1) {
                c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            }
            table[n] = c >>> 0;
        }
        return table;
    }());

    function crc32(bytes) {
        var crc = 0xFFFFFFFF;
        for (var i = 0; i < bytes.length; i += 1) {
            crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
        }
        return (crc ^ 0xFFFFFFFF) >>> 0;
    }

    function zip(entries) {
        var encoder = new TextEncoder();
        var parts = [];
        var central = [];
        var offset = 0;

        function u16(value) { return [value & 0xFF, (value >>> 8) & 0xFF]; }
        function u32(value) {
            return [value & 0xFF, (value >>> 8) & 0xFF,
                    (value >>> 16) & 0xFF, (value >>> 24) & 0xFF];
        }

        entries.forEach(function (entry) {
            var nameBytes = encoder.encode(entry.name);
            var dataBytes = encoder.encode(entry.data);
            var sum = crc32(dataBytes);

            // Local file header. Version 2.0, UTF-8 flag set (bit 11),
            // stored method, zeroed timestamp — the date on a file
            // generated a second ago tells nobody anything.
            var local = [].concat(
                u32(0x04034B50), u16(20), u16(0x0800), u16(0),
                u16(0), u16(0),
                u32(sum), u32(dataBytes.length), u32(dataBytes.length),
                u16(nameBytes.length), u16(0)
            );

            parts.push(new Uint8Array(local), nameBytes, dataBytes);

            central.push({
                name: nameBytes,
                crc: sum,
                size: dataBytes.length,
                offset: offset
            });

            offset += local.length + nameBytes.length + dataBytes.length;
        });

        var directoryStart = offset;
        var directorySize = 0;

        central.forEach(function (entry) {
            var header = [].concat(
                u32(0x02014B50), u16(20), u16(20), u16(0x0800), u16(0),
                u16(0), u16(0),
                u32(entry.crc), u32(entry.size), u32(entry.size),
                u16(entry.name.length), u16(0), u16(0),
                u16(0), u16(0), u32(0),
                u32(entry.offset)
            );

            parts.push(new Uint8Array(header), entry.name);
            directorySize += header.length + entry.name.length;
        });

        parts.push(new Uint8Array([].concat(
            u32(0x06054B50), u16(0), u16(0),
            u16(central.length), u16(central.length),
            u32(directorySize), u32(directoryStart), u16(0)
        )));

        return new Blob(parts, { type: 'application/zip' });
    }

    // ---------------------------------------------------------------
    // Download
    // ---------------------------------------------------------------

    function save(blob, filename) {
        var url = URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Revoked on a later tick: doing it immediately can cancel the
        // download in some browsers before it has begun.
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }

    // Every format the user asks to save, computed if it has not been
    // already. Downloading all four from a standing start means three
    // analyses, and the status line says so rather than the page
    // appearing to hang.
    function ensure(formats) {
        var missing = formats.filter(function (f) { return reports[f] === undefined; });
        if (!missing.length) { return Promise.resolve(); }

        setStatus('working', 'Preparing ' + missing.join(', ') + '…');

        return missing.reduce(function (chain, format) {
            return chain.then(function () {
                return analyse(currentFile, format).then(function (text) {
                    reports[format] = text;
                });
            });
        }, Promise.resolve());
    }

    function closeMenu() {
        downloadPanel.hidden = true;
        downloadBtn.setAttribute('aria-expanded', 'false');
    }

    function openMenu() {
        downloadPanel.hidden = false;
        downloadBtn.setAttribute('aria-expanded', 'true');
    }

    downloadBtn.addEventListener('click', function (event) {
        event.stopPropagation();
        if (downloadPanel.hidden) { openMenu(); } else { closeMenu(); }
    });

    downloadPanel.addEventListener('click', function (event) {
        var item = event.target.closest('.menu__item');
        if (!item || !currentFile) { return; }

        var choice = item.dataset.download;
        closeMenu();

        var wanted = choice === 'all' ? FORMATS.slice() : [choice];

        ensure(wanted).then(function () {
            if (choice === 'all') {
                var entries = FORMATS.map(function (format) {
                    return {
                        name: baseName() + '-mediainfo.' + EXTENSIONS[format],
                        data: reports[format]
                    };
                });
                save(zip(entries), baseName() + '-mediainfo.zip');
            } else {
                save(
                    new Blob([reports[choice]], { type: MIME[choice] }),
                    baseName() + '-mediainfo.' + EXTENSIONS[choice]
                );
            }

            setStatus('done', readyMessage());
            flash(downloadBtn, 'Saved');
        }).catch(function (error) {
            setStatus('error', escapeHtml(
                error && error.message ? error.message : 'That could not be prepared.'
            ));
            flash(downloadBtn, 'Failed', true);
        });
    });

    // A menu that does not close when you click elsewhere, or press
    // Escape, is a menu people learn to distrust.
    document.addEventListener('click', function (event) {
        if (!downloadMenu.contains(event.target)) { closeMenu(); }
    });

    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && !downloadPanel.hidden) {
            closeMenu();
            downloadBtn.focus();
        }
    });
}());