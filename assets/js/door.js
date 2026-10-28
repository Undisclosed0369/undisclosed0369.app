/* ==========================================================================
   The door — secret codes behind the SwiftMediaInfo icon
   --------------------------------------------------------------------------
   Tap the icon five times and a dialog asks for a secret word.

   HOW CODES WORK

   There is no list of codes in this file. A code is normalised (trimmed,
   upper-cased), hashed with SHA-256, and the first sixteen hex characters
   name a folder: /x/<id>/. If that folder exists, the code was right. Adding
   a code is therefore just adding a folder — see tools/door-id.py — and
   reading this file tells nobody what the codes are.

   A page that wants different wording on the way in says so with a marker in
   its source: data-door="leader".

   The song codes and the jokes are the exception. They are meant to be found,
   so they sit here in plain sight.
   ========================================================================== */

(function () {
    "use strict";

    var TAPS = 5;
    var TAP_GAP = 2000;
    var WAIT = 3500;        // reading time before a right code moves on
    var SONG_WAIT = 4000;
    var STRIKES = 5;        // wrong guesses in a row before a nap
    var NAP = 10;           // seconds

    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    var LINES = {
        wrong: [
            "Nope. The door remains unimpressed.",
            "That's not it. But I admire the confidence.",
            "Access denied. The bouncer has been notified. (There is no bouncer.)",
            "Wrong. Try 'please'. (That won't work either.)",
            "Incorrect. This incident will be reported to absolutely no one.",
            "The door looked at that and laughed. Out loud.",
            "Close! (It wasn't close.)",
            "Error 418: the door is a teapot.",
            "Have you tried turning your guess off and on again?",
            "That's a word, sure. Just not the word.",
            "My grandma guesses better, and she thinks the internet is a place.",
            "Wrong. The door has seen better attempts from a cat on a keyboard.",
            "Nice try, hacker. Please put the hoodie back.",
            "Denied. Somewhere, a tiny violin plays for you.",
            "No. And frankly, the door is a little offended.",
            "Plot twist: that's not it."
        ],
        right: [
            "…fine. Wipe your feet.",
            "Correct. Act natural.",
            "You're in. Nobody saw anything.",
            "Welcome. Please don't touch the exhibits.",
            "Access granted. Try not to look so smug.",
            "Hm. Someone's been talking.",
            "The door sighs and creaks open.",
            "Right answer. Your prize is: a door. Enjoy.",
            "Correct. The secret handshake comes later.",
            "Fine, fine. Come in before anyone notices.",
            "Correct! Hold still while the door scans your vibe.",
            "Ding ding ding. Come on in.",
            "Password accepted. Shoes optional.",
            "You may enter. The snacks are imaginary.",
            "Correct. Your secret is safe with me. Probably."
        ],
        leader: [
            "Oh, it's you. Welcome back, boss.",
            "Rolling out the red carpet. It's more of a red rug, but still.",
            "All rise. The dealer has entered the building.",
            "Boss detected. Everyone look busy.",
            "Ah, the one who makes the rules. And breaks them.",
            "Welcome back, Your Dealness.",
            "The house always wins. And you are the house.",
            "Fetching the fancy chair for you…",
            "Shh, everyone. The leader is here.",
            "Back again? The cards missed you. (They didn't say so, but they did.)",
            "Clearing the VIP section. All of it. For you.",
            "The leader has arrived. Cue dramatic music.",
            "Boss mode: enabled. Mercy mode: disabled.",
            "Welcome back. The other players have been warned."
        ],
        placeholder: [
            "Whisper it here…",
            "The password is not 'password'",
            "Type carefully. It's watching.",
            "Speak, friend, and enter"
        ]
    };

    var EGGS = {
        "PLEASE": "Manners noted. Still no.",
        "OPEN SESAME": "Wrong franchise."
    };

    /* Easter eggs with a picture. Each is still a wrong password (and a
       strike): the picture plays above the line, then it's back to guessing. */
    var EGG_DIR = "assets/img/eggs/";
    var MEDIA_EGGS = [
        { codes: ["69", "SEX", "SEXY", "SIXTY NINE", "SIX NINE"], media: "sex-or-69.mp4", lines: [
            "Nice. …Also, wrong password.",
            "The door blushed. Then said no. Wrong password.",
            "Bold opening move. Wrong password, though."] },
        { codes: ["67", "6 7", "SIX SEVEN", "SIXSEVEN"], media: "six-seven.mp4", lines: [
            "Six… seven. The door refuses to participate. Wrong password.",
            "The kids would be proud. The door is not. Wrong password.",
            "Mason, put the phone down. Wrong password."] },
        { codes: ["FUCK", "FUCK YOU", "FUCK OFF", "FK", "FFS", "WTF", "SHIT", "DAMN"], media: "language.mp4", lines: [
            "Whoa. Language! This is a family door. Wrong password.",
            "You kiss your keyboard with that mouth? Wrong password.",
            "The door is clutching its pearls. Wrong password."] },
        { codes: ["HORNY", "DADDY", "BABE", "BABY", "KISS", "LOVE YOU", "I LOVE YOU", "MARRY ME"], media: "down-bad.png", lines: [
            "Down bad AND wrong. Impressive combo.",
            "The door is flattered. The door is also taken. Wrong password.",
            "Sir, this is a door. Wrong password."] },
        { codes: ["RAGEBAIT", "RAGE BAIT", "BAIT", "TROLL", "LOL", "LMAO", "XD", "SKILL ISSUE"], media: "ragebait.mp4", lines: [
            "0/10 ragebait. The door didn't even flinch. Wrong password.",
            "Nice try. The door has seen worse comment sections. Wrong password.",
            "Not even mildly enraged. Wrong password."] },
        { codes: ["PASSWORD", "PASS", "HINT", "HELP", "TELL ME", "WHAT IS IT", "WHATS THE PASSWORD", "SECRET"], media: "psst.jpg", lines: [
            "Psst… come closer. The password is… not that.",
            "Psst. I'll tell you the password. …Kidding. Wrong.",
            "Psst. Rumor has it the password isn't 'password'."] }
    ];
    /* Aunt May. */
    MEDIA_EGGS.push({ codes: ["MAY", "AUNT MAY"], media: "lost-may.jpg", lines: [
        "You know, I'm something of a wrong password myself.",
        "May is gone, and so is your chance. Wrong password.",
        "With great power comes great… wrong password."] });
    /* Any other wrong guess, and the nap after too many. */
    var PLAIN = ["nope.mp4", "duly-noted.jpg", "request-rejected.jpg"];
    var NAPS = ["shaq-timeout.jpg", "cut-it-out-1.mp4", "cut-it-out-2.mp4"];
    var lastFile = {};
    function anyOf(list) {
        var i, key = list.join();
        do { i = Math.floor(Math.random() * list.length); } while (list.length > 1 && i === lastFile[key]);
        lastFile[key] = i;
        return list[i];
    }
    /* Typing the same wrong thing twice in a row. */
    var AGAIN = { media: "same-password.mp4", lines: [
        "Same wrong password. Again. Bold strategy.",
        "That didn't work 5 seconds ago either.",
        "Insanity is typing the same password and expecting the door to change its mind."] };
    /* Keyboard mashing, number runs and the classics on everyone's luggage. */
    var MASH = { media: "monkey.mp4", lines: [
        "Hard at work, I see. Still wrong.",
        "That's the code on your luggage, isn't it? Wrong password.",
        "Ah yes, the ancient art of mashing. Wrong password."] };
    var MASHES = ["1234", "12345", "123456", "1234567", "12345678", "123456789", "0000", "1111", "QWERTY", "ASDF", "ASDFGH", "ASDFGHJKL", "ZXCV", "QWERTYUIOP", "ABC", "ABCD", "AAAA"];

    function isMash(code) {
        var bare = code.replace(/\s+/g, "");
        if (MASHES.indexOf(bare) >= 0) return true;
        if (/^(.)\1{3,}$/.test(bare)) return true;                     // AAAAAA, 777777
        if (bare.length >= 7 && !/[AEIOUY0-9]/.test(bare)) return true;  // SDFGHJKL, XCVBNM…
        return false;
    }
    function mediaEgg(code) {
        var bare = code.replace(/\s+/g, "");
        for (var i = 0; i < MEDIA_EGGS.length; i++) {
            for (var j = 0; j < MEDIA_EGGS[i].codes.length; j++) {
                if (MEDIA_EGGS[i].codes[j].replace(/\s+/g, "") === bare) return MEDIA_EGGS[i];
            }
        }
        return null;
    }
    var lastEggLine = {};
    function eggLine(egg) {
        var i;
        do { i = Math.floor(Math.random() * egg.lines.length); } while (egg.lines.length > 1 && i === lastEggLine[egg.media]);
        lastEggLine[egg.media] = i;
        return egg.lines[i];
    }

    /* Each song: the line, its YouTube video, and how long its clip is (in
       seconds). The clip (assets/audio/songs/<code>.mp3) plays from this page
       while the song's tab opens; the tab waits out the clip, then goes to
       YouTube, so the two never play over each other. EVERFLOW has a video
       instead, played right here in the door (see SONG_VIDEOS). */
    var SONG_DIR = "assets/audio/songs/";
    var SONG_VIDEOS = { "EVERFLOW": "everflow.mp4" };
    var SONGS = {
        "RICK": ["🎵You know the rules. And so do I🎵", "dQw4w9WgXcQ", 5],
        "SOMETHING": ["🎵There's something in the way you do it🎵", "hOT2XC9nmSU", 4.8],
        "MIDDLE": ["🎵I'm stuck in the middle with you🎵", "89zwKGlc7Yw", 5],
        "SEPTEMBER": ["🎵I just wanna get it right🎵", "_tkb95pZCeA", 5],
        "GREEDY": ["🎵So sure of yourself. Baby, don't get greedy🎵", "ZzeNFsJ8c_E", 5],
        "SUMMER": ["🎵I see it in your face, I'm relief. I'm your summer girl🎵", "ZjuA_o6Jzyo", 7],
        "RIO": ["🎵Let me take you to Rio, Rio. Fly'o the ocean like an eagle🎵", "taIeJaL6nR0", 5],
        "EVERFLOW": ["🎵There's freedom in hearts that dream... And a trust that's bestowed in him🎵", "emYdNXFSSjE", 18.1],
        "BRB": ["🎵If you feel a little lost, maybe, a little off-track.... Just remember where you came from, I'll be right back🎵", "vtZgwKb5Bkw", 8.4],
        "PARALLEL": ["🎵You and I, we heal together... Fall down and get up together... Laugh so hard, we cry together... You and I ride the tide together🎵", "aowaqtQWN1c", 15],
        "SUNFLOWER": ["🎵Then you're left in the dust... Unless I stuck by ya... You're the sunflower🎵", "figEzfMTwQQ", 10]
    };

    document.addEventListener("DOMContentLoaded", function () {
        var icon = document.querySelector(".work__card--smi .work__icon");
        if (icon) setupTaps(icon);
    });

    /* Find a song or joke for a code, ignoring spaces ("OPEN SESAME" and
       "OPENSESAME" are the same joke). */
    function lookup(map, code) {
        var bare = code.replace(/\s+/g, "");
        for (var key in map) {
            if (key.replace(/\s+/g, "") === bare) return map[key];
        }
        return null;
    }

    /* Pick a line, never the same one twice in a row. */
    var lastPick = {};
    function pick(kind) {
        var list = LINES[kind], i;
        do { i = Math.floor(Math.random() * list.length); } while (list.length > 1 && i === lastPick[kind]);
        lastPick[kind] = i;
        return list[i];
    }

    /* ----------------------------------------------------------------------
       The taps
       ---------------------------------------------------------------------- */

    function setupTaps(icon) {
        var count = 0, last = 0, bubble = null, bubbleTimer = 0;

        icon.setAttribute("draggable", "false");

        icon.addEventListener("click", function () {
            var now = Date.now();
            count = now - last > TAP_GAP ? 1 : count + 1;
            last = now;

            if (count >= TAPS) {
                count = 0;
                hideBubble();
                openDoor(icon);
                return;
            }

            icon.style.setProperty("--poke", count);
            icon.classList.remove("is-poked");
            void icon.offsetWidth;  // restart the animation
            icon.classList.add("is-poked");

            if (count === 3) say("Hey.");
            if (count === 4) say("Stop poking me.");
        });

        function say(text) {
            if (!bubble) {
                bubble = document.createElement("span");
                bubble.className = "door-bubble";
                bubble.setAttribute("aria-hidden", "true");
                icon.parentNode.appendChild(bubble);
            }
            bubble.textContent = text;
            bubble.style.left = (icon.offsetLeft + icon.offsetWidth - 6) + "px";
            bubble.style.top = (icon.offsetTop - 20) + "px";
            bubble.classList.add("is-on");
            clearTimeout(bubbleTimer);
            bubbleTimer = setTimeout(hideBubble, 1600);
        }

        function hideBubble() {
            if (bubble) bubble.classList.remove("is-on");
        }
    }

    /* ----------------------------------------------------------------------
       The dialog
       ---------------------------------------------------------------------- */

    var door = null;

    function openDoor(returnFocus) {
        if (door) return;

        door = document.createElement("div");
        door.className = "door";
        door.setAttribute("role", "dialog");
        door.setAttribute("aria-modal", "true");
        door.setAttribute("aria-labelledby", "door-title");
        door.innerHTML =
            '<div class="door__panel">' +
                '<div class="door__glow" aria-hidden="true"></div>' +
                '<h2 class="door__title" id="door-title">Oh. You found the door.</h2>' +
                '<p class="door__sub">Most people just click “Open” like a normal person. Not you.</p>' +
                '<form class="door__form" novalidate>' +
                    '<input class="door__input" type="text" autocomplete="off" autocorrect="off" ' +
                        'autocapitalize="characters" spellcheck="false" enterkeyhint="go" ' +
                        'aria-label="Secret word" maxlength="40">' +
                    '<button class="btn btn--primary door__go" type="submit">Let me in</button>' +
                '</form>' +
                '<div class="door__media" aria-hidden="true"></div>' +
                '<p class="door__line" aria-live="polite"></p>' +
                '<div class="door__bar" aria-hidden="true"><span></span></div>' +
                '<button class="door__never" type="button">' +
                    '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">' +
                        '<path d="M2.5 2.5l7 7M9.5 2.5l-7 7"/></svg>' +
                    'I was never here</button>' +
            '</div>';
        document.body.appendChild(door);

        var input = door.querySelector(".door__input");
        var go = door.querySelector(".door__go");
        var line = door.querySelector(".door__line");
        var media = door.querySelector(".door__media");
        var strikes = 0, busy = false, napTimer = 0, lastWrong = null;

        input.placeholder = pick("placeholder");

        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                door.classList.add("is-open");
                input.focus({ preventScroll: true });
            });
        });

        function show(text) {
            line.classList.remove("is-on");
            line.textContent = text;
            void line.offsetWidth;
            line.classList.add("is-on");
        }

        /* An easter egg's picture above the line (videos play muted and loop,
           like a GIF). Anything else clears it. */
        function picture(file, opts) {
            var sound = !!(opts && opts.sound);
            if (!file) {
                media.classList.remove("is-on");
                media.replaceChildren();
                return;
            }
            var el;
            if (/\.mp4$/.test(file)) {
                el = document.createElement("video");
                /* A GIF-like egg plays muted on a loop; a song's video once, with sound. */
                el.muted = !sound; el.loop = !sound; el.autoplay = true;
                el.setAttribute("playsinline", "");
                if (!sound) el.setAttribute("muted", "");
                el.src = EGG_DIR + file;
            } else {
                el = document.createElement("img");
                el.alt = "";
                el.src = EGG_DIR + file;
            }
            media.replaceChildren(el);
            media.classList.remove("is-on");
            void media.offsetWidth;
            media.classList.add("is-on");
            if (el.play) { var p = el.play(); if (p && p.catch) p.catch(function () {}); }
            return el;
        }

        function wrong(text, file) {
            picture(file || null);
            strikes++;
            door.classList.remove("is-wrong");
            void door.offsetWidth;
            door.classList.add("is-wrong");
            input.select();

            if (strikes >= STRIKES) {
                picture(anyOf(NAPS));
                show("Okay, I'm taking a " + NAP + "-second nap. Think about what you've done.");
                nap();
            } else {
                show(text);
            }
        }

        function nap() {
            var left = NAP;
            busy = true;
            input.disabled = go.disabled = true;
            go.textContent = "Zzz… " + left;
            napTimer = setInterval(function () {
                left--;
                go.textContent = "Zzz… " + left;
                if (left > 0) return;
                clearInterval(napTimer);
                strikes = 0;
                busy = false;
                input.disabled = go.disabled = false;
                go.textContent = "Let me in";
                input.value = "";
                input.focus();
                picture(null);
                show("I'm awake. Try again. Nicely.");
            }, 1000);
        }

        /* A right code: show the line long enough to read it, then go. */
        function enter(text, leader, href) {
            busy = true;
            input.disabled = go.disabled = true;
            door.classList.remove("is-wrong");
            door.classList.toggle("is-leader", leader);
            door.style.setProperty("--door-wait", (WAIT / 1000) + "s");
            show(text);
            requestAnimationFrame(function () { door.classList.add("is-going"); });
            setTimeout(function () {
                door.classList.add("is-leaving");
                setTimeout(function () { window.location.href = href; }, reduceMotion.matches ? 0 : 450);
            }, WAIT);
        }

        var tune = null;   /* the song clip playing, if any */
        function stopTune() {
            if (tune) { tune.pause(); tune = null; }
        }

        function song(code, entry) {
            var text = entry[0];
            var url = "https://www.youtube.com/watch?v=" + entry[1];
            var wait = Math.max(SONG_WAIT, Math.round(entry[2] * 1000) + 400);
            var key = code.replace(/\s+/g, "");
            stopTune();
            if (SONG_VIDEOS[key]) { songVideo(text, url, SONG_VIDEOS[key]); return; }
            picture(null);   /* and stops EVERFLOW's video, if it's still going */

            /* Started inside the tap, which is what lets it play with sound. */
            var clip = new Audio(SONG_DIR + key.toLowerCase() + ".mp3");
            tune = clip;
            var playing = clip.play();
            if (playing && playing.catch) playing.catch(function () {});
            clip.addEventListener("ended", function () { if (tune === clip) tune = null; });

            /* The tab has to be opened now, inside the tap, or the browser
               treats it as a pop-up. It shows the line itself while it waits,
               which also covers iPhone Safari jumping straight to new tabs. */
            var tab = window.open("", "_blank");
            if (tab) {
                tab.opener = null;
                tab.document.write(songPage(text, url, wait));
                tab.document.close();
                show(text);
                input.value = "";
                return;
            }

            busy = true;
            input.disabled = go.disabled = true;
            show(text);
            setTimeout(function () { window.location.href = url; }, wait);
        }

        /* EVERFLOW: its video plays right here, with sound, and when it's over
           the song opens in a new tab. A tab opened that long after the tap
           may be stopped as a pop-up, so then a link takes its place. */
        function songVideo(text, url, file) {
            show(text);
            input.value = "";
            var video = picture(file, { sound: true });
            video.addEventListener("ended", function () {
                var tab = window.open(url, "_blank");
                if (tab) { tab.opener = null; return; }
                var link = document.createElement("a");
                link.className = "door__link";
                link.href = url;
                link.target = "_blank";
                link.rel = "noopener";
                link.textContent = "Play it on YouTube ↗";
                line.append(" ", link);
            });
        }

        door.querySelector(".door__form").addEventListener("submit", function (e) {
            e.preventDefault();
            if (busy) return;

            var code = input.value.trim().replace(/\s+/g, " ").toUpperCase();

            if (!code) {
                wrong("You have to actually type something. That's how this works.");
                return;
            }
            if (lookup(SONGS, code)) {
                strikes = 0;
                song(code, lookup(SONGS, code));
                return;
            }
            var again = code === lastWrong;
            lastWrong = code;
            var egg = mediaEgg(code);
            if (egg) { wrong(eggLine(egg), egg.media); return; }
            if (lookup(EGGS, code)) { wrong(lookup(EGGS, code)); return; }
            if (again) { wrong(eggLine(AGAIN), AGAIN.media); return; }
            if (isMash(code)) { wrong(eggLine(MASH), MASH.media); return; }

            busy = true;
            go.textContent = "Checking…";
            go.classList.add("is-busy");
            check(code).then(function (found) {
                go.textContent = "Let me in";
                go.classList.remove("is-busy");
                busy = false;
                if (!found) {
                    wrong(pick("wrong"), anyOf(PLAIN));
                    return;
                }
                picture(null);
                try { sessionStorage.setItem("door:code", code); } catch (err) { /* private mode */ }
                enter(pick(found.leader ? "leader" : "right"), found.leader, found.href);
            });
        });

        door.querySelector(".door__never").addEventListener("click", close);
        door.addEventListener("click", function (e) { if (e.target === door) close(); });
        document.addEventListener("keydown", onKey);

        function onKey(e) {
            if (e.key === "Escape") close();
            /* Keep Tab inside the dialog. */
            if (e.key === "Tab") {
                var items = door.querySelectorAll("input:not([disabled]), button:not([disabled])");
                var first = items[0], lastItem = items[items.length - 1];
                if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastItem.focus(); }
                else if (!e.shiftKey && document.activeElement === lastItem) { e.preventDefault(); first.focus(); }
            }
        }

        function close() {
            if (door.classList.contains("is-going")) return;
            clearInterval(napTimer);
            stopTune();
            document.removeEventListener("keydown", onKey);
            door.classList.remove("is-open");
            var gone = door;
            door = null;
            setTimeout(function () { gone.remove(); }, reduceMotion.matches ? 0 : 350);
            if (returnFocus) returnFocus.focus && returnFocus.focus({ preventScroll: true });
        }
    }

    /* ----------------------------------------------------------------------
       Checking a code
       ---------------------------------------------------------------------- */

    /* Spaces never matter: "DEAL BREAKER" opens the same door as
       "DEALBREAKER". Must match tools/door-id.py. */
    function doorId(code) {
        var bytes = new TextEncoder().encode("undisclosed-door:" + code.replace(/\s+/g, ""));
        var hashed = window.crypto && crypto.subtle
            ? crypto.subtle.digest("SHA-256", bytes).then(function (buf) { return new Uint8Array(buf); })
            : Promise.resolve(sha256(bytes));
        return hashed.then(function (hash) {
            return Array.prototype.map.call(hash, function (b) {
                return ("0" + b.toString(16)).slice(-2);
            }).join("").slice(0, 16);
        });
    }

    /* Resolves to { href, leader } when a page exists for the code, or null.
       Always resolves, and within a few seconds: a slow or failed network
       counts as a wrong guess rather than leaving the door stuck. */
    function check(code) {
        var started = Date.now();
        var lookup = Promise.resolve().then(function () {
            return doorId(code);
        }).then(function (id) {
            var href = "/x/" + id + "/";
            var abort = window.AbortController ? new AbortController() : null;
            if (abort) setTimeout(function () { abort.abort(); }, 6000);
            return fetch(href, { cache: "no-store", signal: abort && abort.signal }).then(function (res) {
                if (!res.ok) return null;
                return res.text().then(function (html) {
                    return { href: href, leader: /data-door="leader"/.test(html) };
                });
            });
        });
        var giveUp = new Promise(function (resolve) { setTimeout(function () { resolve(null); }, 8000); });

        return Promise.race([lookup, giveUp]).catch(function () {
            return null;
        }).then(function (found) {
            /* Never answer instantly: a short beat of suspense, and wrong
               guesses cannot be told apart from right ones by speed. */
            var wait = Math.max(0, 450 - (Date.now() - started));
            return new Promise(function (resolve) { setTimeout(function () { resolve(found); }, wait); });
        });
    }

    /* SHA-256 for when the browser keeps crypto.subtle to itself.

       Browsers only offer the built-in hash on secure pages: https, or
       exactly localhost. The live site is https, but a preview opened at a
       network address (http://192.168…, or python's http://[::]:8000) is
       not, and without this the door could never answer there. */
    function sha256(bytes) {
        var K = [
            0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
            0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
            0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
            0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
            0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
            0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
            0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
            0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
        ];
        var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
        var len = bytes.length;
        var padded = new Uint8Array(((len + 9 + 63) >> 6) << 6);
        padded.set(bytes);
        padded[len] = 0x80;
        var bits = len * 8;
        for (var p = 0; p < 4; p++) padded[padded.length - 1 - p] = (bits >>> (8 * p)) & 0xff;

        var w = new Array(64);
        var rotr = function (x, n) { return (x >>> n) | (x << (32 - n)); };
        for (var off = 0; off < padded.length; off += 64) {
            for (var i = 0; i < 16; i++) {
                w[i] = (padded[off + i * 4] << 24) | (padded[off + i * 4 + 1] << 16) |
                       (padded[off + i * 4 + 2] << 8) | padded[off + i * 4 + 3];
            }
            for (i = 16; i < 64; i++) {
                var s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
                var s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
                w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
            }
            var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
            for (i = 0; i < 64; i++) {
                var t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
                var t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
                h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
            }
            H = [H[0] + a, H[1] + b, H[2] + c, H[3] + d, H[4] + e, H[5] + f, H[6] + g, H[7] + h].map(function (v) { return v | 0; });
        }

        var out = new Uint8Array(32);
        for (i = 0; i < 8; i++) {
            out[i * 4] = H[i] >>> 24; out[i * 4 + 1] = (H[i] >>> 16) & 0xff;
            out[i * 4 + 2] = (H[i] >>> 8) & 0xff; out[i * 4 + 3] = H[i] & 0xff;
        }
        return out;
    }

    /* ----------------------------------------------------------------------
       The song tab
       ---------------------------------------------------------------------- */

    function songPage(text, url, wait) {
        var safe = text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
        return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
            '<meta name="viewport" content="width=device-width, initial-scale=1">' +
            '<title>One moment…</title><style>' +
            'html,body{height:100%;margin:0}' +
            'body{display:grid;place-items:center;background:#0d0d10;color:#f5f5f7;' +
            'font:600 clamp(1.25rem,3.4vw,2rem)/1.35 -apple-system,BlinkMacSystemFont,"SF Pro Display",system-ui,sans-serif;' +
            'text-align:center;padding:2rem;overflow:hidden}' +
            'body:before{content:"";position:fixed;inset:-40%;background:conic-gradient(#8d42f5,#e042f5,#42a1f5,#42e0f5,#8d42f5);' +
            'filter:blur(90px);opacity:.28;animation:s 6s linear infinite}' +
            'p{position:relative;max-width:28ch;text-wrap:balance;animation:in .6s cubic-bezier(.32,.72,0,1) both}' +
            'small{display:block;margin-top:1rem;font-size:.9rem;font-weight:500;color:#a8a8ad}' +
            '@keyframes s{to{transform:rotate(1turn)}}' +
            '@keyframes in{from{opacity:0;transform:translateY(10px) scale(.97)}}' +
            '</style></head><body><p>' + safe + '<small>Taking you there…</small></p>' +
            '<script>setTimeout(function(){location.replace(' + JSON.stringify(url) + ')},' + wait + ')<\/script>' +
            '</body></html>';
    }
}());
