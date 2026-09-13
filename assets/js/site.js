/* ==========================================================================
   SwiftMediaInfo — site script

   Three jobs, no dependencies, no framework.

     1. Theme — system, light or dark, remembered between visits
     2. Navigation hairline
     3. Scroll driver — one loop that sets --p on every scrubbed element

   Everything except the theme is an enhancement. With JavaScript off the page
   is fully readable and every element sits in its finished state; the
   stylesheet only takes over once this file marks the document as scripted.
   ========================================================================== */

/* --------------------------------------------------------------------------
   Theme — runs immediately, before paint

   Deliberately outside the DOMContentLoaded handler and loaded in <head>. If
   the stored theme were applied after first paint, a reader who chose dark
   would get a white flash on every page load. That flash is the single most
   common tell of a theme switcher bolted on afterwards.
   -------------------------------------------------------------------------- */

(function () {
    "use strict";

    var KEY = "smi-theme";
    var root = document.documentElement;

    root.classList.add("js");

    function apply(choice) {
        if (choice === "light" || choice === "dark") {
            root.setAttribute("data-theme", choice);
        } else {
            /* No attribute at all, so the stylesheet's
               `html:not([data-theme])` media query takes over and the
               operating system decides. "System" is the absence of a choice,
               not a third set of colours. */
            root.removeAttribute("data-theme");
        }
    }

    var stored = null;
    try { stored = localStorage.getItem(KEY); } catch (e) { /* private mode */ }
    apply(stored || "system");

    /* Exposed so the controls below can reach it once the DOM exists. */
    window.__smiTheme = {
        get: function () { return stored || "system"; },
        set: function (choice) {
            stored = choice;
            try { localStorage.setItem(KEY, choice); } catch (e) {}
            apply(choice);
        }
    };
})();


(function () {
    "use strict";

    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    document.addEventListener("DOMContentLoaded", function () {
        setupTheme();
        setupNav();
        setupFaq();
        setupToc();
        setupGlow();
        setupShowcase();
        setupCopy();
        setupScroll();
    });

    /* ----------------------------------------------------------------------
       Copy buttons on command blocks

       A shell command is the one thing on a page where a selection mistake
       costs real time — a half-copied command either fails loudly or, worse,
       runs and does something adjacent to what was intended.
       ---------------------------------------------------------------------- */

    function setupCopy() {
        var buttons = document.querySelectorAll(".cmd__copy");

        Array.prototype.forEach.call(buttons, function (btn) {
            btn.addEventListener("click", function () {
                var block = btn.closest(".cmd");
                var code = block && block.querySelector(".cmd__code");
                if (!code) return;

                /* The command comes from a data attribute, not from the
                   element's text. They are the same today, but the block draws
                   its `$` prompt through CSS and any future decoration — a
                   wrapped line, a comment — would end up in someone's
                   clipboard and then in their Terminal. The attribute is the
                   command; the text is a picture of it. */
                var text = (code.getAttribute("data-copy") || code.textContent).trim();

                function done() {
                    /* A class on the block, not new text in the button. The
                       button holds two SVGs and the stylesheet swaps which one
                       shows — writing textContent here would delete both. */
                    block.classList.add("is-copied");
                    btn.setAttribute("aria-label", "Copied");

                    window.clearTimeout(btn.__reset);
                    btn.__reset = window.setTimeout(function () {
                        block.classList.remove("is-copied");
                        btn.setAttribute("aria-label", "Copy command");
                    }, 1800);
                }

                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(text).then(done, function () {});
                    return;
                }

                /* Older Safari, and any page not served over HTTPS, has no
                   clipboard API at all — including a site being previewed from
                   a local address, which is exactly where these commands get
                   tested. The old selection trick still works there. */
                var field = document.createElement("textarea");
                field.value = text;
                field.setAttribute("readonly", "");
                field.style.position = "fixed";
                field.style.opacity = "0";
                document.body.appendChild(field);
                field.select();
                try { document.execCommand("copy"); done(); } catch (e) {}
                document.body.removeChild(field);
            });
        });
    }

    /* ----------------------------------------------------------------------
       Pill thumb

       Shared by the theme switch and the background-mode tabs.

       The thumb's position and width are MEASURED from the live button rather
       than calculated from an assumed button size. That is what lets one
       component serve three equal icon buttons and three text buttons of
       different widths — and it stays correct when the font renders wider on
       another platform, or when the text is translated.
       ---------------------------------------------------------------------- */

    function moveThumb(pill, button) {
        if (!pill || !button) return;

        var thumb = pill.querySelector(".pill__thumb");
        if (!thumb) return;

        /* THE FIRST PLACEMENT IS NOT A MOVE
        
           The thumb starts at zero, because that is where an unset `--x` puts
           it. On every page load it was then told where it actually belonged
           and, having a transition, it slid there — so anyone using dark mode
           watched the marker travel from "System" to "Dark" on arriving at
           every single page.
        
           It never moved. It was placed. The distinction matters because a
           transition animates any change to a property, and does not care
           whether that change represents something happening or merely the
           element being told the truth for the first time.
        
           Suppressing the transition needs a forced reflow between switching
           it off and switching it back on. Without that the browser coalesces
           all three style changes into one frame, sees only the final state —
           transition enabled, position changed — and animates anyway. */
        var first = !pill.__positioned;

        if (first) {
            thumb.style.transition = "none";
        }

        thumb.style.setProperty("--w", button.offsetWidth + "px");
        thumb.style.setProperty("--x", (button.offsetLeft - pill.clientLeft) + "px");

        if (first) {
            /* Reading a layout property forces the pending styles to be
               applied now rather than at the end of the frame. */
            void thumb.offsetWidth;
            thumb.style.transition = "";
            pill.__positioned = true;
            return;
        }

        /* The squash, held only while the thumb is travelling. */
        if (reduceMotion.matches) return;
        pill.classList.add("is-moving");
        window.clearTimeout(pill.__squash);
        pill.__squash = window.setTimeout(function () {
            pill.classList.remove("is-moving");
        }, 320);
    }

    /* ----------------------------------------------------------------------
       Theme controls
       ---------------------------------------------------------------------- */

    function setupTheme() {
        var group = document.querySelector(".theme");
        var buttons = document.querySelectorAll("[data-theme-choice]");
        if (!buttons.length) return;

        var order = ["system", "light", "dark"];
        var settleTimer = null;

        function sync() {
            var current = window.__smiTheme.get();

            buttons.forEach(function (btn) {
                var mine = btn.getAttribute("data-theme-choice");
                btn.setAttribute("aria-pressed", mine === current ? "true" : "false");
            });

            var index = order.indexOf(current);
            if (index < 0) index = 0;
            moveThumb(group, buttons[index]);
        }

        buttons.forEach(function (btn) {
            btn.addEventListener("click", function () {
                var choice = btn.getAttribute("data-theme-choice");

                function change() {
                    window.__smiTheme.set(choice);
                    sync();
                }

                /* No snapshot, no view transition. The stylesheet registers
                   the theme's colour variables with @property, which makes
                   them animatable — so adding this class lets the variables
                   themselves interpolate and every colour derived from them
                   moves together.

                   The DOM stays live the whole time, which is what keeps the
                   navigation's blur working and lets the thumb slide on its
                   own transition instead of being frozen into a picture. */
                var root = document.documentElement;
                root.classList.add("theming");

                window.clearTimeout(settleTimer);
                settleTimer = window.setTimeout(function () {
                    root.classList.remove("theming");
                }, 520);

                change();

                /* After the swap, not before — the video that needs starting
                   is the one revealed by the change. */
                if (window.__smiShowcaseRefresh) window.__smiShowcaseRefresh();
            });
        });

        /* When the choice is "system", the operating system changing its mind
           should move the page with it — someone on a schedule that flips at
           sunset expects the site to follow. */
        var systemPref = window.matchMedia("(prefers-color-scheme: dark)");
        if (systemPref.addEventListener) {
            systemPref.addEventListener("change", function () {
                if (window.__smiTheme.get() === "system") sync();
            });
        }

        sync();
    }

    /* ----------------------------------------------------------------------
       Scroll-driven frame sequence

       WHY IMAGES AND NOT A VIDEO

       A video has to seek, and seeking is the one thing browsers do badly —
       Safari in particular will not scrub smoothly unless every frame is a
       keyframe, which erases the size advantage that made video attractive in
       the first place. Decoded images are instant in both directions.

       WHY IT DOES NOT LOAD ON PAGE LOAD

       The desktop set is around 17 MB. Fetching that before the reader has
       scrolled anywhere near it would be indefensible on a phone. Loading
       starts only when the section is within two screens, and the poster
       carries the section until it is ready.

       WHY IT DRAWS FROM THE SCROLL LOOP

       Frames are drawn by the same measure() pass that moves everything else,
       so the whole page updates once per frame instead of several times.
       ---------------------------------------------------------------------- */

    function createSequence(figure) {
        var count = parseInt(figure.getAttribute("data-count"), 10) || 0;
        var canvas = figure.querySelector(".sequence__canvas");
        if (!count || !canvas || reduceMotion.matches) return null;

        /* A hold on the first frame before the sequence begins.
        
           Without it the frames start moving the instant the section pins,
           which means the reader is reading the opening line of copy while the
           picture beside it is already changing — two things asking for
           attention at the same moment. The hold lets the first panel land
           before anything moves.
        
           Counted in frames rather than in pixels or milliseconds so it stays
           proportional: it is the same share of the section at any scroll
           speed, on any screen height, forever.
        
           45 out of 250 — a little over a sixth of the section spent holding
           still before anything moves. Raised from 25 after testing; the
           shorter hold ended before the eye had finished arriving. */
        var lead = parseInt(figure.getAttribute("data-lead"), 10);
        if (isNaN(lead)) lead = 45;

        /* Chosen on viewport width. Desktops get the full-resolution set.
        
           A previous version picked by device pixels needed, which meant a wide
           1x monitor was served the smaller set — correct on the arithmetic,
           and not what is wanted here. The large set is the one that was shot,
           and it is what desktops get. */
        var narrow = window.innerWidth <= (parseInt(figure.getAttribute("data-breakpoint"), 10) || 1024);
        var base = figure.getAttribute(narrow ? "data-mobile" : "data-desktop");

        /* The file extension is a setting rather than a constant, so the
           sequence can be re-encoded to a better format without touching this
           file. WebP is the reason it exists: about a quarter smaller than
           JPEG at matched quality, which on 250 images is the difference
           between a sequence that loads on a phone and one that does not. */
        var ext = figure.getAttribute("data-ext") || ".jpg";
        if (ext.charAt(0) !== ".") ext = "." + ext;
        var ctx = canvas.getContext("2d", { alpha: false });
        var fill = figure.querySelector(".sequence__fill");

        var images = new Array(count);
        var settled = 0;   /* finished, either way */
        var ok = 0;        /* actually decoded */
        var started = false;
        var ready = false;
        var lastDrawn = -1;

        function pad(n) {
            var out = String(n);
            while (out.length < 4) out = "0" + out;
            return out;
        }

        function start() {
            if (started) return;
            started = true;
            figure.classList.add("is-loading");

            /* The canvas is sized from the first frame that decodes, rather
               than from the width and height attributes in the markup. Those
               are a guess made when the sequence was written; re-encoding at a
               different resolution would leave them wrong, and a mismatched
               canvas resamples every frame on every draw. */
            var sizer = new Image();
            sizer.onload = function () {
                if (!sizer.naturalWidth) return;
                canvas.width = sizer.naturalWidth;
                canvas.height = sizer.naturalHeight;
                lastDrawn = -1;
            };
            sizer.src = base + pad(1) + ext;

            for (var i = 0; i < count; i++) {
                (function (index) {
                    var img = new Image();
                    img.decoding = "async";
                    img.onload = function () {
                        ok++;
                        finish();
                    };

                    /* A failed load is NOT progress.
                    
                       The first version counted these together, and the result
                       was the worst possible failure: with a wrong count or a
                       wrong extension every request 404s, all of them settle,
                       the sequence declares itself ready, and the canvas fades
                       in over the poster with nothing drawn on it. Because the
                       context is opaque, that empty canvas paints solid black
                       — so a trivial filename mismatch produced a black
                       rectangle instead of simply falling back to the poster.
                    
                       Counting successes separately means a broken sequence
                       now does the honest thing: it stays invisible and the
                       poster carries the section, exactly as it does for
                       someone with reduced motion. */
                    img.onerror = function () {
                        finish();
                    };

                    function finish() {
                        settled++;
                        if (fill) fill.style.width = ((settled / count) * 100) + "%";

                        /* Ready at a quarter decoded rather than all of it. The
                           reader is at the top of a three-screen section; the
                           rest arrives long before they reach the end, and
                           waiting for every frame would mean staring at a
                           progress bar for no reason. */
                        if (!ready && ok > count * 0.25) {
                            ready = true;
                            draw(0);
                        }

                        if (settled === count) {
                            figure.classList.remove("is-loading");

                            if (ok === 0 && window.console) {
                                console.warn(
                                    "Frame sequence: none of the " + count +
                                    " frames loaded from " + base + " with extension " + ext +
                                    ". Check data-count, data-ext and the folder path."
                                );
                            }
                        }
                    }
                    img.src = base + pad(index + 1) + ext;
                    images[index] = img;
                })(i);
            }
        }

        function draw(p) {
            if (!ready) return;

            /* The scroll is spread across the hold plus the frames, then the
               hold is subtracted back off. Everything inside the lead-in
               resolves to a negative step and clamps to frame zero, so the
               first frame simply stays up until the hold is spent. */
            var steps = count + lead;
            var step = Math.round(p * (steps - 1));
            var index = Math.min(count - 1, Math.max(0, step - lead));

            if (index === lastDrawn) return;

            var img = images[index];
            /* A frame that has not arrived yet leaves the previous one on
               screen. Blanking the canvas would flicker, and the previous
               frame is by definition the closest thing to correct. */
            if (!img || !img.complete || !img.naturalWidth) return;

            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            lastDrawn = index;

            /* The canvas is revealed here and nowhere else — after a real
               frame has been painted onto it, never merely because loading
               finished. Until that happens the poster stays visible. */
            figure.classList.add("is-ready");
        }

        return { start: start, draw: draw };
    }

    /* ----------------------------------------------------------------------
       FAQ open and close

       A <details> has nothing to animate between: it goes from not rendered
       to rendered in one step, and there is no intermediate height for CSS to
       interpolate. So the browser's own toggle is intercepted, the answer is
       measured, and the height is driven from one real number to another.

       Everything native is kept. It is still a <details>, so it still works
       from the keyboard, still exposes its state to a screen reader, and its
       closed answers are still found by Cmd-F — which a div-based accordion
       would lose.
       ---------------------------------------------------------------------- */

    function setupFaq() {
        var items = document.querySelectorAll(".faq__item");
        if (!items.length) return;

        var DURATION = 340;

        Array.prototype.forEach.call(items, function (item) {
            var summary = item.querySelector(".faq__q");
            var answer = item.querySelector(".faq__a");
            if (!summary || !answer) return;

            function settle(open) {
                answer.style.transition = "";
                answer.style.height = "";
                answer.style.paddingTop = "";
                answer.style.paddingBottom = "";
                answer.style.overflow = "";
                if (!open) item.removeAttribute("open");
                item.__busy = false;
            }

            function animate(from, to, open) {
                /* PADDING IS WHY IT STUTTERED
                
                   Height was animated to zero while the answer kept its
                   padding — and an element with `box-sizing: border-box` and
                   `height: 0` is still as tall as its padding. So it collapsed
                   smoothly to about forty pixels, stopped, and then vanished
                   the instant the `open` attribute came off. That last jump was
                   the stutter.
                
                   Padding has to travel with the height, which is why it is
                   animated here rather than left alone. */
                var pad = window.getComputedStyle(answer);
                var padTop = open ? pad.paddingTop : "0px";
                var padBottom = open ? pad.paddingBottom : "0px";

                answer.style.overflow = "hidden";
                answer.style.transition = "none";
                answer.style.height = from + "px";
                if (!open) {
                    answer.style.paddingTop = pad.paddingTop;
                    answer.style.paddingBottom = pad.paddingBottom;
                } else {
                    answer.style.paddingTop = "0px";
                    answer.style.paddingBottom = "0px";
                }

                /* Forced reflow, so the starting values are registered as a
                   frame rather than folded into the same one as the end
                   values — which would skip the transition entirely. */
                void answer.offsetHeight;

                answer.style.transition =
                    "height " + DURATION + "ms cubic-bezier(0.32,0.72,0,1)," +
                    "padding " + DURATION + "ms cubic-bezier(0.32,0.72,0,1)";
                answer.style.height = to + "px";
                answer.style.paddingTop = padTop;
                answer.style.paddingBottom = padBottom;

                /* `transitionend` rather than a timer, so the cleanup happens
                   when the animation has actually finished rather than when a
                   number said it should have. The timer below is a fallback
                   for the case where the event never fires — a background tab,
                   or an interrupted transition. */
                var done = false;
                function finish(e) {
                    if (e && e.propertyName !== "height") return;
                    if (done) return;
                    done = true;
                    answer.removeEventListener("transitionend", finish);
                    settle(open);
                }
                answer.addEventListener("transitionend", finish);
                window.setTimeout(finish, DURATION + 60);
            }

            summary.addEventListener("click", function (e) {
                if (reduceMotion.matches) return;   /* let the browser do it */
                e.preventDefault();

                if (item.__busy) return;
                item.__busy = true;

                if (!item.hasAttribute("open")) {
                    /* The answer has no measurable height until the element is
                       open, so it is opened first and grown from zero. */
                    item.setAttribute("open", "");
                    animate(0, answer.scrollHeight, true);
                } else {
                    animate(answer.scrollHeight, 0, false);
                }
            });
        });
    }

    /* ----------------------------------------------------------------------
       Changelog contents

       Marks whichever release is currently in view. On a page of a dozen
       versions the list is the reader's sense of place, and a list that never
       responds is just a set of links.

       IntersectionObserver rather than the scroll loop: this needs to know
       which element is on screen, not how far down the page it is, and that
       is the question an observer answers directly.
       ---------------------------------------------------------------------- */

    function setupToc() {
        var toc = document.querySelector(".toc");
        if (!toc || !("IntersectionObserver" in window)) return;

        var links = {};
        Array.prototype.forEach.call(toc.querySelectorAll(".toc__link"), function (link) {
            var id = (link.getAttribute("href") || "").slice(1);
            if (id) links[id] = link;
        });

        var releases = document.querySelectorAll(".release[id]");
        if (!releases.length) return;

        function mark(id) {
            Object.keys(links).forEach(function (key) {
                links[key].classList.toggle("is-current", key === id);
            });
        }

        var observer = new IntersectionObserver(function (entries) {
            /* Several releases can be on screen at once, so the topmost one
               that is intersecting wins — that is the one being read. */
            var visible = entries.filter(function (e) { return e.isIntersecting; });
            if (!visible.length) return;

            visible.sort(function (a, b) {
                return a.boundingClientRect.top - b.boundingClientRect.top;
            });
            mark(visible[0].target.id);
        }, {
            /* A band across the upper third. Without narrowing it, a long
               release stays "current" while the next one fills the screen. */
            rootMargin: "-15% 0px -70% 0px",
            threshold: 0
        });

        Array.prototype.forEach.call(releases, function (r) { observer.observe(r); });
    }

    /* ----------------------------------------------------------------------
       Cursor glow

       The light lags the pointer slightly and catches up, rather than being
       pinned to it. Something that tracks a cursor exactly reads as part of
       the cursor; something that follows reads as a separate object being
       drawn along, which is the difference between a gimmick and atmosphere.

       The easing is a plain lerp — move a fixed fraction of the remaining
       distance each frame. Fast when far away, slow as it arrives, with no
       duration to tune and no way for it to overshoot.
       ---------------------------------------------------------------------- */

    function setupGlow() {
        /* A cursor glow needs a cursor. `hover: hover` and `pointer: fine`
           together mean a real pointing device, which excludes phones and
           tablets — where this would be a smudge left at the last tap. */
        var fine = window.matchMedia("(hover: hover) and (pointer: fine)");
        if (!fine.matches || reduceMotion.matches) return;

        var glow = document.createElement("div");
        glow.className = "cursor-glow";
        glow.setAttribute("aria-hidden", "true");
        document.body.appendChild(glow);

        var targetX = window.innerWidth / 2;
        var targetY = window.innerHeight / 2;
        var x = targetX;
        var y = targetY;
        var running = false;

        function frame() {
            /* 0.12 is the whole feel of it: lower drifts languidly and starts
               to look laggy, higher snaps to the cursor and stops reading as a
               separate thing. */
            x += (targetX - x) * 0.12;
            y += (targetY - y) * 0.12;

            glow.style.transform = "translate3d(" + x.toFixed(1) + "px," + y.toFixed(1) + "px,0)";

            /* Stop the loop once it has essentially arrived. A rAF running
               forever behind a still cursor is a background task nobody asked
               for, and on a laptop it is measurable. */
            if (Math.abs(targetX - x) < 0.5 && Math.abs(targetY - y) < 0.5) {
                running = false;
                return;
            }
            window.requestAnimationFrame(frame);
        }

        function start() {
            if (running) return;
            running = true;
            window.requestAnimationFrame(frame);
        }

        var idleTimer = null;

        window.addEventListener("pointermove", function (e) {
            if (e.pointerType !== "mouse") return;
            targetX = e.clientX;
            targetY = e.clientY;
            glow.classList.add("is-visible");
            glow.classList.remove("is-idle");
            start();

            /* The colour cycle is paused once the cursor has been still for a
               few seconds. It is a filter animation, so it runs on the GPU —
               but it runs forever, and a laptop should not spend battery on an
               effect nobody is currently watching change.
            
               Four seconds is long enough that it never pauses mid-gesture and
               short enough that a page left open costs nothing. */
            window.clearTimeout(idleTimer);
            idleTimer = window.setTimeout(function () {
                glow.classList.add("is-idle");
            }, 4000);
        }, { passive: true });

        /* Leaving the window fades it out rather than freezing it mid-page. */
        document.addEventListener("mouseleave", function () {
            glow.classList.remove("is-visible");
        });
        document.addEventListener("mouseenter", function () {
            glow.classList.add("is-visible");
        });
    }

    /* ----------------------------------------------------------------------
       Background showcase

       Three tabs, three panels. The Animated panel holds a video, and it is
       paused whenever it is not the visible one — a hidden <video> that keeps
       decoding frames is a battery drain nobody can see, and there is no
       reason to spend it on a panel the reader is not looking at.
       ---------------------------------------------------------------------- */

    function setupShowcase() {
        var root = document.querySelector("[data-showcase]");
        if (!root) return;

        var tabs = Array.prototype.slice.call(root.querySelectorAll(".showcase__tab"));
        var panels = Array.prototype.slice.call(root.querySelectorAll(".showcase__panel"));
        var note = root.querySelector(".showcase__note");

        function select(index) {
            tabs.forEach(function (tab, i) {
                tab.setAttribute("aria-selected", i === index ? "true" : "false");
                tab.setAttribute("tabindex", i === index ? "0" : "-1");
            });

            panels.forEach(function (panel, i) {
                var on = i === index;
                panel.classList.toggle("is-active", on);

                /* ALL the videos in the panel, not the first one.
                
                   Each panel holds two — a light version and a dark one — and
                   `querySelector` returns whichever comes first in the markup
                   regardless of which is on screen. In dark mode that meant
                   calling play() on the hidden light video and leaving the
                   visible one paused on its poster. */
                var videos = panel.querySelectorAll("video");

                Array.prototype.forEach.call(videos, function (video) {
                    /* `offsetParent` is null for anything with
                       `display: none`, which is exactly how the two
                       appearances are switched. Only the visible one is worth
                       downloading, let alone decoding. */
                    var visible = video.offsetParent !== null;

                    if (on && visible && !reduceMotion.matches) {
                        var playing = video.play();
                        /* play() rejects where autoplay is restricted. The
                           poster still shows, so there is nothing to recover
                           from — but an unhandled rejection appears in the
                           console as an error, which it is not. */
                        if (playing && playing.catch) playing.catch(function () {});
                    } else {
                        video.pause();
                    }
                });
            });

            if (note && tabs[index]) {
                note.textContent = tabs[index].getAttribute("data-note") || "";
            }

            moveThumb(root.querySelector(".showcase__tabs"), tabs[index]);
        }

        tabs.forEach(function (tab, i) {
            tab.addEventListener("click", function () { select(i); });

            /* Arrow keys, because this is a tablist and a tablist that only
               responds to clicks is a row of buttons wearing a costume. */
            tab.addEventListener("keydown", function (e) {
                var next = null;
                if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
                if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
                if (next === null) return;
                e.preventDefault();
                select(next);
                tabs[next].focus();
            });
        });

        select(1);

        /* Switching appearance swaps which of the two videos is on screen, and
           the newly revealed one is sitting paused on its poster. Re-running
           the selection starts it and stops the one that just disappeared. */
        window.__smiShowcaseRefresh = function () {
            var current = tabs.findIndex(function (t) {
                return t.getAttribute("aria-selected") === "true";
            });
            select(current < 0 ? 0 : current);
        };

        /* Button widths change with the viewport, so the thumb has to be
           re-measured rather than left where it was. Without this it drifts
           off its button the moment the window is resized. */
        window.addEventListener("resize", function () {
            var current = tabs.findIndex(function (t) {
                return t.getAttribute("aria-selected") === "true";
            });
            moveThumb(root.querySelector(".showcase__tabs"), tabs[current < 0 ? 0 : current]);
        }, { passive: true });
    }

    /* ----------------------------------------------------------------------
       Navigation
       ---------------------------------------------------------------------- */

    function setupNav() {
        var nav = document.querySelector(".nav");
        if (!nav) return;
        window.__smiNav = function () {
            nav.classList.toggle("is-scrolled", window.scrollY > 8);
        };
        window.__smiNav();

        var button = nav.querySelector(".nav__menu");
        var panel = document.getElementById("nav-more");
        if (!button || !panel) return;

        function setOpen(open) {
            button.setAttribute("aria-expanded", open ? "true" : "false");
            panel.classList.toggle("is-open", open);
        }

        button.addEventListener("click", function (e) {
            e.stopPropagation();
            setOpen(button.getAttribute("aria-expanded") !== "true");
        });

        /* Escape and a click outside both close it. A menu that can only be
           dismissed by pressing the same button again is a menu people end up
           tapping around. */
        document.addEventListener("click", function (e) {
            if (!panel.contains(e.target)) setOpen(false);
        });

        document.addEventListener("keydown", function (e) {
            if (e.key !== "Escape") return;
            if (button.getAttribute("aria-expanded") !== "true") return;
            setOpen(false);
            button.focus();
        });

        /* Widening the window past the breakpoint reveals the links in the bar
           again, and a panel left open on top of them is nonsense. */
        window.addEventListener("resize", function () {
            if (window.innerWidth > 736) setOpen(false);
        }, { passive: true });
    }

    /* ----------------------------------------------------------------------
       Scroll driver

       ONE listener and ONE requestAnimationFrame loop for the whole page,
       rather than an observer per element. Every scrubbed element is measured
       in the same frame and written in the same frame, which is what keeps a
       long page smooth on a phone — interleaved reads and writes are what
       cause layout thrashing, and it is the usual reason scroll effects feel
       heavy.

       Each element gets --p between 0 and 1 describing how far it has
       travelled through its own window. The CSS decides what to do with that.
       ---------------------------------------------------------------------- */

    function setupScroll() {
        var items = Array.prototype.slice.call(document.querySelectorAll("[data-scroll]"));
        var pinned = Array.prototype.slice.call(document.querySelectorAll("[data-pinned]"));

        pinned.forEach(function (section) {
            var figure = section.querySelector("[data-sequence]");
            if (figure) section.__sequence = createSequence(figure);
        });

        if (reduceMotion.matches) {
            /* Show the finished state of everything and never listen for
               scroll at all. Someone who has asked for less motion should not
               be paying for a scroll handler either. */
            items.forEach(function (el) { el.style.setProperty("--p", "1"); });
            pinned.forEach(function (section) { setPanels(section, 0); });
            return;
        }

        var ticking = false;

        function measure() {
            var vh = window.innerHeight;

            /* THE LAST SECTION COULD NEVER FINISH REVEALING
            
               The entrance below completes when an element's top edge reaches
               46% of the viewport height. Anything near the bottom of the
               document cannot scroll that high — there is no page left to
               scroll — so the final section sat permanently part-revealed, at
               roughly half opacity, looking like a rendering fault.
            
               Once the reader is at the end of the page, everything on it has
               been reached by definition. Nothing should still be arriving. */
            var doc = document.documentElement;
            var atBottom = (window.scrollY + vh) >= (doc.scrollHeight - 4);

            items.forEach(function (el) {
                var mode = el.getAttribute("data-scroll");
                var r = el.getBoundingClientRect();
                var p;

                if (mode === "zoom") {
                    /* The hero's opening move, and the one effect measured
                       against the page rather than against the element. It
                       starts the instant the reader scrolls at all and
                       finishes half a viewport later, so the screenshot grows
                       into place as the page begins — which is the single
                       most recognisable thing Apple's product pages do. */
                    p = clamp(window.scrollY / (vh * 0.55), 0, 1);
                } else {
                    /* Entrance: begins when the element's top edge is one
                       fifth of a viewport from the bottom, completes by the
                       time it is halfway up. */
                    p = clamp((vh * 0.88 - r.top) / (vh * 0.42), 0, 1);
                }

                if (atBottom) p = 1;

                el.style.setProperty("--p", p.toFixed(3));
            });

            pinned.forEach(function (section) {
                var r = section.getBoundingClientRect();
                var travel = section.offsetHeight - vh;
                var p = travel > 0 ? clamp(-r.top / travel, 0, 1) : 0;
                setPanels(section, p);

                var seq = section.__sequence;
                if (seq) {
                    /* Begin fetching once the section is within two screens.
                       Close enough that it will be ready, far enough that a
                       reader who never scrolls this far never pays for it. */
                    if (r.top < vh * 2) seq.start();
                    seq.draw(p);
                }
            });

            if (window.__smiNav) window.__smiNav();
            ticking = false;
        }

        function onScroll() {
            if (ticking) return;
            ticking = true;
            window.requestAnimationFrame(measure);
        }

        window.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("resize", onScroll, { passive: true });

        /* Returning to a background tab needs one measurement, because the
           scroll position may have been restored while nothing was listening.
           Without it the sequence and the panels can come back out of step
           with where the page actually is. */
        document.addEventListener("visibilitychange", function () {
            if (!document.hidden) onScroll();
        });

        /* iOS resizes the visual viewport as the address bar hides and shows,
           which changes how tall a pinned section is relative to the screen
           without ever firing a normal resize. Without this the panels advance
           against a stale height and stop matching the scroll. */
        if (window.visualViewport) {
            window.visualViewport.addEventListener("resize", onScroll, { passive: true });
        }

        window.addEventListener("orientationchange", function () {
            window.setTimeout(measure, 200);
        });

        measure();
    }

    /* Which of a pinned section's panels is showing, and how full the rail is.
       The last panel is given a slightly wider slice so it is still on screen
       as the section releases — otherwise the third point flashes past at the
       exact moment the reader is scrolling away from it. */
    function setPanels(section, p) {
        var panels = section.querySelectorAll(".panel");
        var ticks = section.querySelectorAll(".rail__fill");
        var n = panels.length;
        if (!n) return;

        var index = Math.min(n - 1, Math.floor(p * n * 0.96));

        for (var i = 0; i < n; i++) {
            panels[i].classList.toggle("is-active", i === index);
            if (ticks[i]) {
                var local = clamp(p * n - i, 0, 1);
                ticks[i].style.width = (local * 100) + "%";
            }
        }
    }

    function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
})();

/* ==========================================================================
   Peek — hover preview and Quick Look
   --------------------------------------------------------------------------
   Appended as its own module so the rest of studio.js stays readable.
   ========================================================================== */

(function () {
    "use strict";

    document.addEventListener("DOMContentLoaded", function () {
        var triggers = document.querySelectorAll("[data-peek], img.shot[data-peek-self]");
        if (!triggers.length) return;

        var fine = window.matchMedia("(hover: hover) and (pointer: fine)");
        var hover = null;
        var modal = null;
        var lastFocus = null;

        /* ------------------------------------------------------------------
           The floating preview
           ------------------------------------------------------------------ */

        function buildHover(src, alt) {
            var box = document.createElement("div");
            box.className = "peek-hover";
            box.setAttribute("aria-hidden", "true");

            var img = document.createElement("img");
            img.src = src;
            img.alt = "";
            box.appendChild(img);

            document.body.appendChild(box);
            return box;
        }

        function positionHover(e) {
            if (!hover) return;

            var pad = 16;
            var rect = hover.getBoundingClientRect();

            /* Above the cursor by default, because the phrase sits in running
               text and a preview below it would cover the line being read.
               Flipped when there is not room, which is the whole of the
               cleverness required here. */
            var x = e.clientX + pad;
            var y = e.clientY - rect.height - pad;

            if (x + rect.width > window.innerWidth - pad) {
                x = window.innerWidth - rect.width - pad;
            }
            if (y < pad) y = e.clientY + pad;

            hover.style.left = Math.max(pad, x) + "px";
            hover.style.top = y + "px";
        }

        /* ------------------------------------------------------------------
           The full view
           ------------------------------------------------------------------ */

        function open(src, alt) {
            if (modal) return;

            lastFocus = document.activeElement;

            modal = document.createElement("div");
            modal.className = "peek-modal";
            modal.setAttribute("role", "dialog");
            modal.setAttribute("aria-modal", "true");
            modal.setAttribute("aria-label", alt || "Image");

            var img = document.createElement("img");
            img.src = src;
            img.alt = alt || "";

            var close = document.createElement("button");
            close.type = "button";
            close.className = "peek-modal__close";
            close.setAttribute("aria-label", "Close");
            close.textContent = "\u2715";

            modal.appendChild(img);
            modal.appendChild(close);
            document.body.appendChild(modal);

            /* Scrolling the page behind an open overlay is disorienting, and on
               iOS it scrolls the page rather than the overlay. */
            document.body.style.overflow = "hidden";

            /* Two frames before adding the class, for the same reason as the
               arrival animation: one can still land inside the same style
               recalculation and skip the transition entirely. */
            requestAnimationFrame(function () {
                requestAnimationFrame(function () {
                    if (modal) modal.classList.add("is-open");
                });
            });

            close.focus();
            modal.addEventListener("click", dismiss);
            close.addEventListener("click", dismiss);
            document.addEventListener("keydown", onKey);
        }

        function dismiss() {
            if (!modal) return;

            var dying = modal;
            modal = null;

            dying.classList.remove("is-open");
            document.removeEventListener("keydown", onKey);
            document.body.style.overflow = "";

            window.setTimeout(function () {
                if (dying.parentNode) dying.parentNode.removeChild(dying);
            }, 320);

            /* Focus goes back where it came from. Leaving it on a removed
               element drops the keyboard user at the top of the document. */
            if (lastFocus && lastFocus.focus) lastFocus.focus();
        }

        function onKey(e) {
            if (e.key === "Escape") dismiss();

            /* The overlay holds exactly one focusable thing, so trapping focus
               is a matter of not letting Tab leave it. */
            if (e.key === "Tab" && modal) {
                e.preventDefault();
                var button = modal.querySelector(".peek-modal__close");
                if (button) button.focus();
            }
        }

        /* ------------------------------------------------------------------
           Wiring
           ------------------------------------------------------------------ */

        Array.prototype.forEach.call(triggers, function (trigger) {
            /* Two kinds of trigger. A phrase in running text carries the image
               path in `data-peek`; a screenshot IS the image, so it points at
               itself and lends its own alt text to the overlay. */
            var self = trigger.hasAttribute("data-peek-self");
            var src = self ? trigger.getAttribute("src") : trigger.getAttribute("data-peek");
            var alt = self
                ? (trigger.getAttribute("alt") || "")
                : (trigger.getAttribute("data-peek-alt") || "");

            trigger.addEventListener("click", function () { open(src, alt); });

            if (!fine.matches || self) return;

            trigger.addEventListener("mouseenter", function (e) {
                if (!hover) hover = buildHover(src, alt);
                positionHover(e);
                requestAnimationFrame(function () {
                    if (hover) hover.classList.add("is-open");
                });
            });

            trigger.addEventListener("mousemove", positionHover);

            trigger.addEventListener("mouseleave", function () {
                if (hover) hover.classList.remove("is-open");
            });

            /* The preview must not linger over the overlay it just opened. */
            trigger.addEventListener("click", function () {
                if (hover) hover.classList.remove("is-open");
            });
        });
    });
})();
