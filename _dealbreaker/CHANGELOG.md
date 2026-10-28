# Deal Breaker — Changelog

Newest first.

## 2026-10-28 — Clean-up

### Removed
- Everything temporary from the sound work: the three audition pages and their 400-odd candidate sounds, the voice samplers, the voice engine and its downloads (about 2.3 GB, all outside the project), test storage and leftover empty rooms on the local server, and macOS `.DS_Store` files.

### Kept
- The game's sounds, Bella's recordings and their sources, and the scripts that build them: `_dealbreaker/tools/build-sounds.py` and the new `_dealbreaker/tools/voice/record-bella.py`, so a sound or a line can still be changed later.


## 2026-10-28 — Rules highlight stays on the section you picked

### Fixed
- **Rules on a phone held sideways: after jumping to a section, the highlighted chip slipped back** to the one before (Houses & hotels → Action cards). A section counted as "being read" a third of the way down the screen, which on a short landscape screen is above where a jump lands it, just under the bar. It now counts from where a jump lands, the section you picked stays highlighted once you arrive, and at the very bottom of the page the last section lights up.


## 2026-10-28 — Rules jump straight to a section; clear of the Dynamic Island

### Fixed
- **Rules on a phone: tapping a section in the top bar jumped back** to an earlier section (usually one of the first few). While the page glided to the section, the "you're here" highlight followed along and scrolled the chip row with a call that, on iPhones, also stopped the page's glide halfway. The chip row now scrolls itself only, the page glides straight to the section, and the highlight waits until it lands. The contents list on wide screens works the same way.
- **The Dynamic Island covered the edge of the rules** inside the game (a page in a frame can't see the phone's safe areas). The rules now keep clear of the island and the rounded corners, as the rest of the game already did; nothing is cropped, the page just sits inside the safe area. The rules page opened on its own does the same.
- The chat drawer also keeps clear of the island when the phone is turned the other way round (island on the right).


## 2026-10-28 — Rules in the game, quiet buttons, centred Leave

### Changed
- **How to play opens inside the game**, full screen, from the start screen, the lobby and the menu. The game never leaves the page, so the music doesn't stop; "← Table" or Esc closes it.
- **Buttons no longer make a sound.** The click on every button, tile, tab, toggle and menu is gone; game moments (cards, money, actions, chat, errors) still sound as before, and so do the slider's notches and PIN digits.
- Bella's birthday line has a shorter pause ("Surprise! It's my birthday again.… Somehow."), and the Debt Collector line is now "Debt Collector!… Pay up, please.… Cash, property, or tears."

### Fixed
- On the game-over screen, a player's "Leave the table" sat off to one side next to the waiting line. The line now sits on its own, with the button centred under it.


## 2026-10-28 — No more double tap

### Fixed
- **"Open the room" (or "Take a seat") played its tap twice with a PIN-locked name**: once for the click, and again a moment later as the PIN pad slid in. The PIN pad is silent now.
- The same kind of double tap on menu tiles that open another sheet (Sound & music, My stats, Players & bans, Lock my name). The sound engine now plays a sound asked for twice at the same moment only once; quick typing still clicks on every digit.


## 2026-10-28 — Debt Collector line, music in one tab only

### Added
- **Bella calls Debt Collectors**: "Debt Collector!… Five million, please.… Cash, property, or tears."

### Changed
- Double the Rent is now just "Double rent!", and the birthday line is "Surprise! It's my birthday again.… Somehow."
- **Music plays in one tab at a time.** With the game open in two tabs (or a tab left open from earlier), each used to play its own copy, heard as the music playing twice. Now the tab you used last plays and the other one stops; a tap there brings it back to that tab.


## 2026-10-28 — Bella, and the last five sounds

### Changed
- **One voice: Bella**, "the all-seeing croupier. She calls it as she sees it." The male voice and the second takes are gone; each moment has one line, the one picked by ear. Sound & music now has a simple Bella on/off switch.
- New lines: Just Say No is "Nope!… Denied.", birthdays are "Surprise! It's birthday again… Somehow.", and when your time runs out it's "Time's up!… The robot's got this one now.", each with a real pause in the middle.
- **The last five sounds are in**: a party popper with a party horn and a "yay" for birthdays, a collect chime for a finished set, a clock's tick-tock through your last ten seconds (every other second, since one clip is a tick and a tock), a fantasia sting for winning and a "fail" jingle for losing. Every game sound is now a recording.


## 2026-10-28 — New sounds, two announcers, background music

### Added
- **Recorded sound effects** for the game, picked by ear from CC0 libraries (Kenney's casino set for the cards; Freesound for the rest): shuffles and card slides, poker chips and coins, a cash register for rent, a reward sting for Double the Rent, a cinematic impact for Deal Breaker, a game-show "wrong answer" for Just Say No, and new button, chat and turn sounds. They're levelled in groups, so button taps stay quiet and the big moments land loudest. The game downloads them (about 0.5 MB) on your first tap, and not at all with sound off.
- **Two announcers**, the Grimoire (a pompous old spellbook) and the Announcer (warm, game-show), each with two takes per line: game start, rent, Double the Rent, Deal Breaker, Sly Deal, Forced Deal, Just Say No, birthdays, "one set away", "hurry up" at 20 seconds left on your turn, your time running out, and winning or losing. Choose Both, either one, or Off.
- **Background music**: six tracks, "Luxury Hotel Lounge" (smooth jazz, 100 minutes) by default, plus Shop Theme, Sunny Side Up, Pollie Soft, Funky Menu and Happy Clappy. It plays through the lobby and the game without a break, dips under the announcers, pauses in a hidden tab and picks up where you left it. Turning it off stops it completely: nothing more downloads.
- **Sound & music** sheet (the ♪ in the lobby, and in the menu): sound effects on or off, voices, music on or off, music volume and track. All of it is per device.

### Changed
- The menu's "Sound" switch became the "Sound & music" tile.
- The birthday, set-complete, last-ten-seconds, win and lose sounds are still the old synthesised ones until their new picks are in.


## 2026-10-27 — Song codes play a clip; EVERFLOW plays its video

### Added
- **Every song code at the secret door now plays a short clip of the song** (RICK, SOMETHING, MIDDLE, SEPTEMBER, GREEDY, SUMMER, RIO, BRB, PARALLEL, SUNFLOWER). The clip plays from the door page while the song's tab opens; that tab now waits for the clip to finish before going to YouTube, so the two never play at once.
- **EVERFLOW plays its video right in the door, with sound**, and when it ends opens the song on YouTube in a new tab. If the browser won't open a tab that long after the tap, a "Play it on YouTube ↗" link appears instead.
- Closing the door stops a clip; typing another code stops the video.

### Changed
- The EVERFLOW video was converted from HEVC to H.264 (same 1080p) so every browser can play it.


## 2026-10-27 — GIFs play on the whole row, sets scroll while you drag

### Changed
- **A GIF picture plays when you point anywhere on that player's row or seat**, not only on the picture itself: lobby seats, seats at the table, the menu's player list, the results, Players & bans and chat messages. It stops when the pointer leaves the row (and keeps playing on the seat whose turn it is, as before).

### Fixed
- **A long row of your sets couldn't be reached while dragging a card.** Hold a card near either end of the row (or just past it) and the row now scrolls that way, faster the closer you get, until the card moves away, the row ends, or you let go. Works with a mouse and with a finger, from your hand or from another set.


## 2026-10-27 — Phase 7B: lighter on phones

Nothing looks or behaves differently; the game and the site just do less work for the same picture.

### Changed
- **The table only redraws what changed.** A robot's turn redraws that robot's seat, not the whole table: about 75% less rebuilding per update, and a few new card images instead of a dozen.
- **The background glows** on every page move 30 times a second instead of at the screen's full rate (60 or 120). They're slow, soft shapes, so it can't be seen, but the phone no longer redraws the whole screen, and re-blurs every frosted-glass panel, as fast as it can for as long as the page is open.
- **The shine on a complete set** and **the spinning ring** in a player's view are now done by the graphics chip alone, instead of being repainted on every frame.
- The game clock only updates the page when a number changes.
- The card build tools that need the deleted source material are gone (the app icon builder stays, as `npm run icons`).


## 2026-10-27 — Phase 7A: consolidation; 7C: clean-up

Nothing looks or behaves differently; this is all under the hood.

### Changed
- The game's main script is split into focused parts (state, overlays, lobby, announcer, menu and results), half its old size. Helpers that were copied into several files now live in one place.
- Unused code and styles removed from the game, the site and the hidden pages (a dozen dead selectors and an unused card-fan animation, a few unused variables).
- Every site page was compared style by style before and after, on desktop, phone and phone-sideways sizes: identical.

### Removed
- Temp files (macOS `.DS_Store`, wrangler temp bundles, test-server storage) and the local test data (test players, their pictures, 358 old test rooms). Your local labrat and Mobile profiles stay.
- The card source material (the Monopoly Deal PDF, the card back photo, the scans and the traced art), now that the built cards are signed off. All 59 finished cards were exported as SVGs to `polished cards` on the Desktop. The card gallery's "Compare with scans" view is gone with the scans.


## 2026-10-27 — Return ends a finished turn, skin tones fit

### Added
- **Return ends your turn** on a keyboard once you have no plays left (when End turn starts pulsing). The button shows a ↩ keycap then. Return does one thing at a time: at the start of your turn it only draws; it only ends the turn after you've drawn and used your plays; and it does nothing while you're typing, while a sheet, dialog or the emoji menu is open, while someone still owes you, or for a beat (0.7 s) after a sheet closes or a draw, so the Return that pressed "Pay" or drew can't also end your turn.

### Fixed
- The emoji menu's skin tone button and its menu were cut off at the panel's right edge in some desktop browsers: the search field wouldn't shrink below its natural width. The top row now makes the field give way.


## 2026-10-27 — Door pictures for every miss, Tab to pick, lost pictures back

### Added
- **The door shows a picture for every wrong code** now, not just the easter eggs: a plain wrong guess gets one of three at random (the "nope" GIF, "duly noted and ignored", "requestus rejectus"), and the 10-second nap after 5 misses gets one of three timeouts (Shaq's timeout, two "cut it out" clips). The pictures are never the same twice in a row.
- **`may` at the door:** Willem Dafoe's "lost May", with a Spider-Man line ("You know, I'm something of a wrong password myself.").
- **Tab picks for you** when paying: on the pay sheet, Tab presses "Pick for me" (marked with a "tab" keycap), like Return presses Pay.
- The emoji menu's categories fold open and shut smoothly instead of snapping (only the part you can see is animated, so even People folds at a readable pace).

### Fixed
- **Pictures set before the picture update vanished** (a built-in like the top hat showed your initial instead). They were saved in the first picture format, which the new code skipped. Old pictures are now upgraded as they're read, and nothing that can still be drawn is ever dropped for its shape.
- **After the server restarted, an old lobby came back to life:** players who were there before still looked online (so reopening the room kept its old robots and rules instead of starting fresh). Players are now only online while they're really connected; anyone left over from before a restart is treated as just dropped.
- The studio home page, on a phone held sideways: the "scroll down" hint sat on top of the last line. It now has its own strip at the bottom, and the title sizes to the screen's height too.

### Changed
- Server tests run against their own storage (`npm run test:server`, port 8788), so test players never show up in, or touch, your local players and pictures.


## 2026-10-27 — Emoji menu, typing dots, richer pictures, new door eggs

### Added
- **Emoji menu** in the chat, Discord style: the smiley in the message field (a new face every time you point at it) opens search ("Find the perfect emoji"), a skin tone picker, categories down the side, every emoji in a scrolling grid with sticky, collapsible headers, your most-used ones first ("Frequently used"), and a preview of the hovered emoji and its :name: at the bottom. Click to add (Shift-click to add several), Return picks the first search result, arrow keys move around, Esc closes. The list (1,903 emoji) only loads the first time it opens.
- **"… is typing"** in the chat: bouncing dots and "Bossy is typing" (or "Bossy and Pinny are typing", "Several people are typing") under the conversation, and a small "•••" on the chat button while it's closed. It clears when their message arrives, or by itself after a few seconds.
- **Pictures, richer:** three kinds: Built-in, **Emoji** (any emoji, searchable, on any of 14 backgrounds or your own two colors) and **Photo or GIF**. Any of them can have a **ring**: Gold, Neon, Rainbow, Fire, Ice, Mint, Rose or Silver.
- **GIF pictures:** framed like photos; they show a still until they're worth watching: on the seat of the player whose turn it is, under the mouse, and on the player's full-screen view and stats.
- **Full-size view:** tap a big picture (a player's full-screen view, or stats) to see it as big as it really is, or as big as the screen allows, whichever is smaller. Esc or a tap closes it.
- **New easter eggs at the secret door**, each with a picture and still a wrong password: `69` / `sex`, `67`, swearing (`fuck`, `wtf`, …), `horny` / `daddy` / `marry me`, `ragebait` / `troll` / `lol`, and `password` / `hint` / `help`. Typing the same wrong code twice in a row gets the tomato ("new password can't be your old password"), and keyboard mashing or `1234` / `qwerty` gets the typing monkey.

### Changed
- Pictures are much sharper: avatars use a 384 px still (was 160 px), and the original is kept (up to 5 MB) for the full-size view. Photos upload over HTTP with your seat's token, and are served under random, never-changing addresses that browsers cache for good.
- The door's GIFs are stored as small MP4 videos (same look, 2.5 MB in total instead of 16.6 MB), and only load when they're triggered.


## 2026-10-27 — Phase 6D: profile pictures

### Added
- **My picture**: pick one of 16 built-in, card-themed pictures (property colors with an emoji: top hat, diamond, house, hotel, cake, detective, briefcase, railroad, light bulb, water drop, cash, crown, Just Say No hand, Deal Breaker boom, dice, rocket), use your own photo, or go back to your initial.
- Photos are framed on your device: drag to move, pinch, scroll or use the zoom bar; only the circle is kept. It's shrunk to 160 × 160 before it's sent (a few KB), and browsers cache it for good.
- Your picture shows everywhere your name does: lobby, table seats, chat, menu, results, stats and Players & bans. It's tied to your name, so it follows you into every room. Robots stay robots.
- Ways in: "My picture" on your own full-screen view (tap yourself in the lobby or at the table), or the ✏️ on your picture in My stats.
- A locked name's picture can only be changed by whoever got in with its PIN. The leader can clear anyone's picture from their profile ("Reset picture").


## 2026-10-27 — Steadier lobby, seats that always fit, stats fixes

### Changed
- Seats show the sets towards the win as numbers only (e.g. 2/3), never cut off. A seat that's too narrow drops the words ("in hand", "Bank") first, then the little fan of card backs; it re-checks whenever a seat changes size.
- On the stats screen, Esc goes back one step when it was opened from somewhere (Players & bans, a player's view, the game-over screen), and closes it otherwise.

### Fixed
- Changing a table rule in the lobby (the turn timer, say) made the whole players list slide in again. Only new rows animate now; the rest stay put.
- A stray "null" at the bottom of the stats screen (and, in some cases, a player's full-screen view).


## 2026-10-27 — Phase 6C: Player Statistics on screen

### Added
- **Player Statistics**, full screen: overall (games, wins, win rate, DNFs, time played), then Deal Breaker: finishes by place as an animated bar chart (gold, silver, bronze, red for DNFs), win streak (now and best), favorite color, nemesis, favorite victim, action cards used, rent collected and paid, biggest rent, cash banked, sets completed, and the last 10 games as chips. Numbers count up as it opens.
- Funny lines where they fit: no games yet, zero wins, never used a Deal Breaker, lots of DNFs, or a win rate over 50%.
- Ways in: the new stats button in the lobby (next to the lock), "My stats" in the game menu, "See mine →" on the game-over screen ("Stats updated. History will remember this."), and a "{name}'s stats" tile on anyone's full-screen view (tap them in the lobby or at the table; robots keep no stats).
- Leader, Players & bans: each row shows games, wins and win rate; sort by last played, games, wins or win rate; search says "Find a suspect…"; tap any row for that player's full stats (locked or not), with "← Players & bans" back to the same tab, search and sort. On a profile the leader can reset stats, unlock or delete, each asking in place.

### Changed
- In the lobby, anyone can tap a player to open their full-screen view (it was the leader's ••• only).
- Game menu: "My stats" sits beside "Lock my name"; "Players & bans" has its own row.


## 2026-10-26 — Phase 6B: stats are recorded

### Added
- Every finished game is now saved to each human player's profile: games, wins, finishing position, DNFs, time played, win streaks (current and best), and the last 20 games.
- Counted as you play: Deal Breakers, Just Say Nos, Sly Deals, Forced Deals, Debt Collectors, Birthdays, rent cards, Double the Rents, Pass Gos, houses and hotels used; rent collected and paid; the biggest single rent (one rent card, everyone it charged); cash put in the bank; sets completed and their colors; who you stole from and who stole from you.
- Only your own moves count: while an AI plays your seat, nothing it does is credited to you. A set taken whole with a Deal Breaker counts as a steal, not a set you built.
- Leaving mid-game (and not coming back before the end) or being kicked is a DNF: no position, no win, streak broken. A game the leader ends early records nothing for anyone. AI players have no profiles.
- The server can now show stats: yours and anyone's in your room (the leader: anyone), and the leader can reset a name's stats. The screens for all this come in 6C.


## 2026-10-26 — A real PIN screen, the leader's PIN, and a Pass Go check

### Added
- Dropping a Pass Go on your bank now asks first, in a small centered dialog: "Draw 2 instead" (green, Return) and "Bank it +1M" (gold) side by side, with a full-width "Never mind" (neutral glass, Esc) along the bottom that puts the card back in your hand. On phones the deck and the bank sit side by side, so this catches near misses. Picking "Bank" from the card's own menu doesn't ask. The rules page's Pass Go entry mentions it.

### Changed
- Joining with a locked name no longer shows an error and an extra field: the start panel slides into a PIN pad ("Enter your PIN"), and the 4th digit sends it. A wrong PIN shakes and clears with the tries left; the right one goes straight into the room. "← Not me" slides back to the form.
- Joining stays on the start screen while the server answers (the button says "Pulling up a chair…"), instead of flashing a waiting screen.
- The leader is asked for their name's PIN too: when opening a room, and when coming back with the leader code on a new device. Reconnecting to the same seat doesn't ask. The leader still can't be banned.


## 2026-10-26 — PIN on every join, a quicker pay sheet, and a new Phase 7

### Changed
- A locked name is now asked for its PIN every time it sits down in a room, on every device, including the one that set it. Reconnecting to the same seat (a dropped connection) doesn't ask again, and the leader is never asked.
- Plan: a new **Phase 7 — Consolidation & performance** (7A tidy and refactor the code, 7B cut CPU/GPU load, measured on the iPhone first), with no change to the look, feel or behaviour. Playtest & launch moves to Phase 8.

### Fixed
- On iPhone, the pay sheet's properties could stay blank for a moment (and while scrolling) before appearing. The locked "bank first" cards were dimmed with a color filter, which made Safari redraw every card image; they're now just faded.


## 2026-10-26 — The name lock is a PIN

### Changed
- Locking your name now uses a 4-digit PIN instead of a 4-letter word. The boxes bring up the number pad on phones, ignore anything that isn't a digit, and each digit shows for a moment before hiding behind a dot. The join screen's field is a PIN field too.
- All the wording follows: "What's its PIN?", "Wrong PIN. {n} tries left…", "Change the PIN", and the hint "Numbers only. Not 1234, we beg you."


## 2026-10-26 — Smoother paying, a typeable lock, a steadier players list

### Changed
- Charged with nothing on the table? You're skipped straight away, even if you hold a Just Say No (it stays in your hand).
- The pay sheet groups your properties by set, with each set's house and hotel right beside its cards (with a teal edge), labelled "house" / "house + hotel".
- Players & bans: Ban, Unban, Unlock and Delete ask "are you sure?" right on that row, sliding in without redrawing the list. Buttons have subtle tints: red for Ban and Delete, teal for Unban, gold for Unlock, and a matching Yes.

### Fixed
- Typing the secret word didn't work on some phones and browsers (the four boxes were drawn over one hidden field). They're now four real letter boxes, like a verification code: type and it moves on, Backspace goes back, arrows move, and pasting fills them all.


## 2026-10-26 — Phase 6A: names are people

### Added
- A shared player directory on the server: every name that has played, when it was first and last seen, and how many rooms it's sat in.
- Lock my name: a 4-letter secret word, from the lobby's lock button or the game menu. Anyone using the name on another device needs the word once; that device is then remembered. Change or remove it any time. Five wrong guesses lock the name for 10 minutes. The word itself is never stored.
- The join screen asks for the word only when it's needed, with a clear message (and tries left).
- Leader: Players & bans (lobby and game menu) lists everyone with Unlock, Ban/Unban and Delete; a Banned tab lists who, when and where. "Ban from Deal Breaker" on a player's full-screen view kicks and bans in one go. Banned names can't join any room. The leader is never asked for a word and can't be banned.
- When charged, the prompt shows the exact card that was played (the right rent card, doubled or not).
- Each seat shows its sets towards the win (e.g. 2/3), turning gold when one away; only complete sets in different colors count.

### Fixed
- After switching rooms, the old connection could raise a "Connection lost" banner that never went away.


## 2026-10-26 — Following the action

### Changed
- Cards changing hands are easy to follow: rent and payments, Sly Deals, Forced Deal swaps and Deal Breakers move one card at a time, slowly, on a high arc, pausing big at the top, glowing gold (payments), red (steals), blue (swaps) or magenta (Deal Breaker). The seat they leave and the seat they land on light up in the same colour.
- AI players take longer over each move (about 1.5 s to draw or pass, 2–3 s for a play, 3–3.5 s for a big one), so everyone can see what happened.

### Fixed
- The "•••" on a seat's options button sat slightly off-centre. The dots are now drawn on an exact grid and line up with "Options" when it slides out.
- On phones with players across the top, the deck strip (cards and play-by-play) could slide over their cards when space ran out. Phone sizes are tighter and the strip can't shrink below its cards; checked with 5 players at 844×390.


## 2026-10-26 — Second thoughts, seats, and room on phones

### Added
- Changed your mind about paying? "Pay up" now opens the pay sheet as a preview with a "← Back" button to your Just Say No. Nothing is decided until you press Pay ("Pick for me" works there too).

### Changed
- Tapping a player opens them full screen for everyone: their badges, counts and whole table (tap a card to see it big), plus the leader's Mute/Kick tiles. The old half-screen sheet is gone.
- The seat's "•••" button is now a small glass circle in the seat's corner that slides open to "Options" on hover, without squeezing the name or counts.
- Confirmations pair their choices: the one that ends something has a soft red tint, the way back ("Stay", "Keep playing", "Keep the drama") a soft teal one, both as full options with icons.

### Fixed
- On phones, none of the phone-size card settings were taking effect (the base sizes always won). With them working, a 5-player game fits on an iPhone even with Safari's bars showing: seats keep one line, the deck strip keeps its height, and your table always has room for a set and a house.


## 2026-10-26 — The deal, on-the-spot wins, seat options

### Added
- The deal: when a game starts, cards fly from the deck one at a time, five rounds round the table. Yours land face down in your hand and flip up; everyone else's glide into their seats. AI players wait until the last card lands.
- Drawing looks the same: your free cards, Pass Go, or five with an empty hand come off the deck face down and flip into your hand; other players' draws fly to their seats.
- The leader gets a "•••" Options button on every seat, which opens up to "Options" on hover and goes straight to that player's full-screen options.

### Changed
- A win now counts the moment it happens, on anyone's turn (house rule): if a Forced Deal or a payment finishes your last set, the game ends there and the results show. The AI never hands anyone their winning set in a Forced Deal. The rules page explains it.


## 2026-10-26 — Player cards, stacking fix, chat with the keyboard

### Changed
- Player options (the leader's mute and kick) open full screen: a profile with a glowing avatar ring, badges (Leader, AI and its skill, Online, Muted), their sets, bank, hand and table during a game, and big tiles. Kicking asks again right there instead of in a second pop-up.
- Chat on phones: when the keyboard is up, the chat fits exactly into the space above it, goes full width, and slims to a one-line header with the reactions tucked away, so the latest messages and the field stay in view. Android also resizes the page above the keyboard now.

### Fixed
- A wild card shown upside down (used as its second color) was drawn on top of the cards laid after it, hiding them: in a set with a dark blue property, a green/dark blue wild and a house, only the wild showed. Every card now stacks in order, everywhere.


## 2026-10-26 — Rainbow wilds can pay

### Changed
- House rule: a rainbow (ten-color) wild on the table is worth what a property of its color is worth (4M as green, 1M as brown, and so on), so it can be used to pay debts and rent. In your hand it's worth nothing. The rules page says so; the "can't be used to pay" notes are gone.

### Fixed
- The AI could pick between two different winning moves at random; it now always takes the simplest (an occasional test failure).


## 2026-10-26 — Kicking, timers, houses and Return to draw

### Added
- The leader can kick anyone, AI players included, at any time. In a game they leave the table for good: their cards go to the discard pile, anything aimed at them is dropped, and the last player standing wins. Kick from the lobby, by tapping a player's seat (Player options), or from the menu's player list. Removing an AI seat in the lobby is one tap.
- Return draws your cards when the deck is glowing (a ↩ on the "Tap to draw" hint).
- The pay sheet and the play-by-play now say when a rainbow (ten-color) wild can't be used to pay.

### Fixed
- Dropping a house, hotel or rent card onto a set did nothing (the set lit up, but the drop was ignored).
- Clicking a wild card on your own table could move it to its other color instead of opening it: a click that moved a few pixels counted as a drag onto your table. Cards on your table now need a real target and a deliberate drag.
- Changing the turn timer mid-turn only applied from the next turn. It now changes the running clock at once, keeping the time already used.

### Planned
- A ban list and an all-players list for the leader, added to Phase 6 (they need the shared player store that stats will use).


## 2026-10-26 — Phase 5: smarter AI

### Changed
- Normal AI plays like a decent human: it goes for the win when it can, finishes sets, keeps money in the bank, saves its Just Say No for the big hits and its Deal Breaker for full sets, picks on whoever is winning, and pays with what it can spare. It only sees what you'd see: its own hand and the table.
- Easy AI knows the cards now but plays loosely, so it's beatable without being random. Normal wins about 7 games in 10 against it.
- The AI pauses like a person: quick to draw or pass, longer over a Deal Breaker or a Just Say No.
- The table rules say what the two levels mean.

### Added
- A 1,000-game AI-versus-AI simulation (0 stuck games, 0 bugs) and 10 tests of the AI's decisions (67 engine tests in total).

## 2026-10-26 — Draw first, and Return to pay

### Added
- Draw first (a table rule, on by default): play anything before tapping the deck and that turn's draw is gone; it's back next turn. The play-by-play says so, and your counter reads "2 left · no draw". The leader can switch it in the lobby or from the in-game menu; everyone gets a chat line, and switching it off mid-turn gives back a draw that was just lost.

### Fixed
- Return didn't pay on the pay sheet: the money card you'd just clicked kept the key and toggled itself off. Return now goes to Pay unless you've tabbed to a button on purpose.


## 2026-10-26 — Closing rooms, chat formatting, emoji, keyboard

### Fixed
- Closing a room didn't always free its code: the app hung up before the server heard "leave", and a leader leaving mid-game left the room running. Now the app waits for the server to confirm, the leader gets a real "Close the room" (mid-game too), and reopening a code that's finished or empty always starts a fresh room.
- In the lobby, a player who dropped off (closed tab, new phone) can rejoin with their name instead of "Someone already took that name".

### Added
- Chat formatting, Discord style: **bold**, *italic*, __underline__, ~~strike~~, `code`, ||spoilers|| (tap to reveal) and clickable links.
- Emoji by name, Discord style: type `:cat:` for 🐱 (1,968 names, with `:skin-tone-1:` to `:skin-tone-5:`). Suggestions pop up as you type `:ca…`; arrows to move, Return or Tab to pick.
- Emoji in the chat always look like Apple's: Apple devices use their own, every other device gets Apple's emoji artwork.
- Keyboard: Return presses the main choice in any dialog (marked with a ↩ keycap), Esc cancels. Return also calls a rematch on the results screen, and Esc closes the menu.
- Server tests for closing mid-game and taking your name back (15 in total).


## 2026-10-26 — Your table on phones, the full play-by-play, plays left

### Fixed
- On phones, your own table could shrink to almost nothing when players sat on both sides. The deck, discard and play-by-play are now a slim strip on top, and your table always gets a full row below it.

### Changed
- The play-by-play names every card, from your side of the table: "Rita played Sly Deal on you, going for your Boardwalk", "You swapped your Baltic Avenue for Nilesh's light blue/brown wild", "Deal Bot took your whole green set: Pacific Avenue, North Carolina Avenue, Pennsylvania Avenue and the house", "Nilesh paid you 4M rent: 3M and Pass Go (1M)", "Rita played Just Say No on your Debt Collector!". The jokes moved to the card spotlight.

### Added
- Tap the play-by-play for the full activity of the game, newest first, with times; lines about you are highlighted.
- Plays left: a "●●● 3 left" badge on the seat of whoever's turn it is, and "2 plays left" (or "Draw first") under your own dots.
- A test that narrates thousands of random moves from two players' sides and checks every line (55 engine tests in total).


## 2026-10-25 — Play-by-play, clear chat, scrolling

### Added
- A live play-by-play in the middle of the table, told from your side: "Robo Rita paid you 3M rent", "You banked 5M", "Deal Bot turned a wild card to yellow". The last three lines stay on screen (fewer on phones), newest brightest; the big moments keep their jokes.
- Leader can clear the chat for everyone: a glass "Clear" button in the chat header, a confirmation with a funny question, messages swept away with an animation, and a funny line left behind.
- Drag sideways to scroll your sets when they don't fit (mouse, trackpad or finger), with momentum, fading edges and mouse-wheel scrolling. Grabbing a card you can move still picks the card up.
- The chat's quick reactions can be dragged sideways with a mouse too.

### Fixed
- Two-color wild cards always showed their first color on top. They now turn around to show the color they're used as, everywhere sets appear, with a spin when they change.
- The last quick reaction was cut off at the edge of the chat.
- In the menu, Leave now fills its row when it's on its own.


## 2026-10-25 — Seats, phones and fixes

### Changed
- Left and right opponents now sit down the sides of the table, not in a row across the top.
- Whoever's turn it is gets bigger cards and a wider seat; the others ease back. On your turn, your own sets grow.
- Chat and menu buttons moved next to End turn, so they never cover a player.
- Phones on their side: the deck and announcer sit beside your properties, seat headers are compact, and there's a tighter layout for when the browser's bars take up space.

### Fixed
- Tapping the room code did nothing on plain-http addresses (like a Mac's local IP on a phone). It now copies there too, pulses, and says so.
- The tail on received chat bubbles bit into the sender's picture. Tails are now proper Messages shapes.
- The chat stayed open after a desktop window was made narrow.

### Planned
- Profile pictures, added to Phase 6 (they need the name lock to keep them safe).


## 2026-10-25 — The table, rebuilt

### Added
- Drag and drop: pick up a card and drop it on your table, a set, your bank, the felt, or an opponent. Legal spots glow; anywhere else and it springs back. Tapping still works.
- Played-card spotlight: other players' action cards rise from their seat, flip up in the middle with a caption, and drop onto the discard pile. Answer prompts wait until you've seen the card.
- Leader can change the turn timer, sets to win and AI skill during a game, from the menu. Everyone sees a chat line about it.
- Full-screen menu (back to table, how to play, chat, sound, standings, table rules) and full-screen results.
- New sounds for draw, place, bank, rent, double rent, paying, getting paid, steal, swap, Just Say No, Deal Breaker, birthday, win and lose.
- "+4M" / "−4M" amounts float up from banks when money moves.
- First-person announcer lines for your own plays ("You doubled the rent").

### Changed
- Money first: you pay from your bank, and can add properties only once it's empty. Rules page, engine and pay sheet updated.
- Opponents sit around the felt (left, across, right) with their cards drawn larger.
- Chat looks like Messages: bubbles with tails, grouped runs, timestamps, "Delivered", big emoji.
- Buttons, tabs, sliders and switches redesigned with smooth spring animations, in the game and on the secret door.
- Apple system fonts with proper weights (Inter on other devices).
- A wild card that changes color slides into the matching set automatically.

### Fixed
- The rent prompt opened again every time another player answered.
- Other players stayed stuck on the results screen after a rematch.
- When the leader left after a match, the room stayed open and its code showed as taken.
- On phones the table was slightly wider than the screen, clipping "End turn".


## 2026-10-25 — Manual drawing & opponents' tables

### Changed
- Drawing is now manual: tap the glowing deck to draw your 2 cards (5 with an empty hand). Forget before your turn ends, or run out of time, and those cards are lost. AI players always draw. The rules page explains it.
- Opponents' sets and bank now show as real cards at the top of the table (on screens tall enough); phones on their side keep the compact chips.
- The table stays centered on very wide windows.
- Clearer "room doesn't exist" message: the leader has to open it first.

### Added
- Announcer lines for your turn ("tap the deck") and for forgetting to draw.
- Engine tests for drawing (51 in total).

### Fixed
- "One set away" line said "is is".

## 2026-10-24 — The game

### Added
- The full game in the browser (`x/7a3797625d3c2330/`), replacing the holding page: start screen, lobby with leader settings, the table, card choices and prompts, results with rematch, chat, menu.
- Every card glides between places on an arc; stamps, shockwaves and confetti for the big moments; synthesised sounds with a mute switch; announcer lines from COPY.md.
- Timer rings with a 10-second warning, "I'm back" after an AI takeover, leader prompts for rejoin requests.
- Chat docked on wide screens, a slide-over with an unread badge on phones, quick reactions.
- iPhone Home Screen app: manifest, icons made from the real cards, fullscreen landscape, install hint, screen kept awake while playing.
- "Rotate your device" screen for phones held upright.

### Changed
- The server now sends each player their legal moves with every update, so the screen only ever offers what the rules allow.

## 2026-10-24 — Rules page & game server

### Added
- Rules page (`x/7a3797625d3c2330/rules/`): 14 grouped sections, instant search with highlighting, a contents sidebar on desktop and section chips on phones, the real cards (tap to enlarge), and tables built straight from the deck data. Linked from the Deal Breaker page as "How to play".
- Game server (`_dealbreaker/server/`): rooms with leader-chosen codes, lobby settings, chat with mute and rate limits, the single game clock, 60-second discards, AI seats, AI takeover on disconnects and idle turns, leader-approved rejoins, rematch, room cleanup and rate limiting. Runs locally; launch needs a one-time Cloudflare login.
- First AI players (`engine/bot.js`), Easy and Normal.
- 10 end-to-end server tests over real WebSockets.

### Changed
- Card files are built straight into the game folder (`x/7a3797625d3c2330/cards/`).
- Owner confirmed the secret door works on iPhone and desktop.

## 2026-10-24 — Rules engine

### Added
- The complete Monopoly Deal rules engine (`x/7a3797625d3c2330/engine/rules.js`): every card, Just Say No chains, payments with no change, wild card rearranging, houses and hotels, hand limit with the 60-second discard window, the turn timer's automatic outcomes, and the 3–6 set win target.
- Each player's view hides other hands and the deck; final standings for player statistics.
- 48 automated tests and a 1,000-game random simulation (0 bugs).
- House rules for the cases the printed rules don't cover (listed in PHASES.md).

### Changed
- The deck data moved to `x/7a3797625d3c2330/engine/deck.js` so the game, the server and the card builder share one copy.
- Card files are no longer planned to be shrunk before launch (owner's call).

## 2026-10-24 — Secret door

### Added
- Tap the SwiftMediaInfo icon 5 times on the homepage to open the secret door (`assets/js/door.js`, `assets/css/door.css`).
- Funny lines, easter eggs, 11 song codes, a 10-second nap after 5 wrong tries, and gold styling for the leader.
- Hidden pages under `/x/`, named by each code's hash, so the site never lists the codes: Deal Breaker (holding page for now), the leader's entrance, and "coming soon" pages for Mercy and One.
- `tools/door-id.py` to create the folder name for a new code.
- `/x/` blocked in `robots.txt`; every hidden page is `noindex`.

### Fixed
- The door stuck on "Checking…" for every code when the site was opened at a non-secure address (such as `python -m http.server`'s `http://[::]:8000` or a network IP), because browsers hide their built-in hashing there. The door now has its own fallback and a time limit, so it always answers.
- Spaces in codes are ignored: `DEAL BREAKER` opens the same door as `DEALBREAKER`.

### Changed
- "I was never here" is now a glass pill with a close icon that lifts and glows on hover.
- "Back to the real world" is now a glass pill with a back arrow that nudges left on hover.
- Song codes show the owner's chosen song lines (wrapped in 🎵) for 4 seconds before opening the song; they work in any letter case.

## 2026-10-24 — Card art

### Added
- Deck data for all 106 cards (`cards/deck.js`), matching the owner's count.
- Every card rebuilt as vector art from the scans: 28 properties, 8 wild designs, 6 rent designs, 10 actions, 6 money cards and the card back (`cards/svg/`).
- Character illustrations vector-traced from the scans (`cards/art/`); small icons hand-drawn.
- Card builder (`npm run build` in `cards/`) that turns all text into outlines, so cards look the same on every device with no fonts to load.
- Review gallery with a "Compare with scans" mode (`npm run gallery` in `cards/`, then open `localhost:8765/gallery.html`).

## 2026-10-24 — Planning

### Added
- Planning docs: `PHASES.md` (checklist), `COPY.md` (all wording), and this changelog.

**Secret door**
- Entrance: tap the SwiftMediaInfo icon in the Work section 5 times to open the secret code dialog.
- Codes are not case-sensitive. A right or leader code shows a funny line for 3.5 s before moving on.
- Funny lines for wrong, right and leader codes, easter eggs, and a 10 s lockout after 5 wrong tries.
- 11 song codes (`RICK`, `SOMETHING`, `MIDDLE`, …) show a line for 2.5 s, then open YouTube in a new tab, or in the same tab if new tabs are blocked.

**Rooms & players**
- The leader picks the room code (letters only, 3–12). Many rooms can run at once.
- One leader per room, leader code checked on the server.
- Player names: letters and single spaces only, 2–16 characters, unique in the room.
- 2–5 players. Modes: AI Only, Players Only, Players + AI. AI difficulty: Easy or Normal.
- Win target: leader picks 3–6 complete sets (default 3).

**Timer**
- One leader-chosen timer for everything: 60–300 s in 15 s steps (default 120).
- When targeted, the attacker's clock pauses and the target gets a full clock. If it runs out, the card goes through and the server picks their payment.
- Over 7 cards at the end of a turn: the player picks their discards within 60 s while the next player's turn starts.

**Disconnects**
- Disconnect mid-game → AI takes over after a 15 s grace period.
- Rejoin mid-game: the leader gets a prompt to let the player back in.
- AI takes over after 3 timed-out turns; "I'm back" reclaims the seat.

**Game experience**
- Announcer lines for every card play and event (sets, payments, timers, wins).
- Room chat in the lobby and game. On desktop it's open by default and can be toggled. On mobile it stays closed with an unread badge. Includes quick reactions, history for rejoining players, a 200-character limit, a rate limit and leader mute.
- Premium look & feel matching the website: card motion, special effects, 60 fps on iPhone, Reduce Motion support.
- Landscape only, with a "rotate your device" screen in portrait.
- iPhone Home Screen app support (fullscreen, icon, install hint).

**Player statistics**
- Stats kept per name across all games and rooms: positions, DNFs, wins, cards used, rent collected and paid, cash banked, favorite game, plus nemesis, favorite victim and win streak.
- Ranking for 2nd–5th place: complete sets, then total table value.
- Profile button → Player Statistics. Players see their own stats and those of people in their room.
- Optional name lock: a 4-letter secret word, remembered by the device, with a 10-minute lockout after 5 wrong guesses.
- Leader bypasses name locks and gets an All Players directory to view, reset, delete or unlock any profile.

### Decided
- Real card art from the owner's scans.
- Hosting: GitHub Pages for the page; Cloudflare Workers + Durable Objects (free plan) for the game server at `dealbreaker.undisclosed0369.app`.
