/* ==========================================================================
   undisclosed0369.app — studio behaviours
   --------------------------------------------------------------------------
   Loaded alongside site.js, which already provides the theme switch, the
   navigation menu, scroll reveals and the cursor glow. Only what is specific
   to this page lives here.
   ========================================================================== */

(function () {
    "use strict";

    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    document.addEventListener("DOMContentLoaded", function () {
        setupIntro();
        setupCue();
        setupCopy();
    });

    /* ----------------------------------------------------------------------
       The arrival

       The page-wide gradient is already drifting when the page loads. On every
       other page that is right — the reader arrived from somewhere and the
       wash is simply there. Here it is the first thing they see, and something
       that is already halfway through its animation reads as a page that was
       loading while they waited.

       So the blobs are held collapsed and dark for one frame, then released.
       They expand into place over a second and a half and carry straight on
       into their normal drift, which makes the arrival feel like the start of
       something rather than the middle of it.

       The whole effect is two CSS classes and a timer. It could have been a
       canvas simulation; it would not have looked better, and it would have
       cost a few hundred lines and a frame budget.
       ---------------------------------------------------------------------- */

    function setupIntro() {
        var bg = document.querySelector(".page-bg");
        if (!bg || reduceMotion.matches) return;

        bg.classList.add("is-arriving");

        /* Two frames, not one. A single rAF can still land inside the same
           style recalculation as the class above, and the transition would be
           skipped entirely — the same forced-reflow problem as the theme thumb,
           solved the same way. */
        window.requestAnimationFrame(function () {
            window.requestAnimationFrame(function () {
                bg.classList.add("is-here");
            });
        });

        /* The class is removed once it has served its purpose, so nothing is
           left holding a transition that will never run again. */
        window.setTimeout(function () {
            bg.classList.remove("is-arriving", "is-here");
        }, 2600);
    }

    /* ----------------------------------------------------------------------
       The scroll cue

       It disappears the moment the reader scrolls. Leaving it up would be
       telling someone to do the thing they are already doing.
       ---------------------------------------------------------------------- */

    function setupCue() {
        var cue = document.querySelector("[data-cue]");
        if (!cue) return;

        function check() {
            if (window.scrollY > 40) {
                cue.classList.add("is-gone");
                window.removeEventListener("scroll", check);
            }
        }

        window.addEventListener("scroll", check, { passive: true });
        check();
    }

    /* ----------------------------------------------------------------------
       Copy-to-clipboard for handles

       Shares the fallback logic with the install commands on the app's site,
       for the same reason: the Clipboard API needs a secure context, and a
       page served over plain http on a local address is not one.
       ---------------------------------------------------------------------- */

    function setupCopy() {
        var buttons = document.querySelectorAll("[data-copy-text]");
        if (!buttons.length) return;

        Array.prototype.forEach.call(buttons, function (button) {
            var action = button.querySelector(".elsewhere__action");
            var text = button.getAttribute("data-copy-text");
            var timer = null;

            button.addEventListener("click", function () {
                function done() {
                    button.classList.add("is-copied");
                    if (action) action.textContent = "Copied";
                    window.clearTimeout(timer);
                    timer = window.setTimeout(function () {
                        button.classList.remove("is-copied");
                        if (action) action.textContent = "Copy";
                    }, 1800);
                }

                function fallback() {
                    var field = document.createElement("textarea");
                    field.value = text;
                    field.setAttribute("readonly", "");
                    field.style.position = "fixed";
                    field.style.opacity = "0";
                    document.body.appendChild(field);
                    field.select();
                    try { document.execCommand("copy"); done(); } catch (e) {}
                    document.body.removeChild(field);
                }

                if (navigator.clipboard && window.isSecureContext) {
                    navigator.clipboard.writeText(text).then(done, fallback);
                } else {
                    fallback();
                }
            });
        });
    }
})();
