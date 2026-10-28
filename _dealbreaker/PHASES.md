# Deal Breaker — Phases

A clone of Monopoly Deal, hidden behind a secret door on undisclosed0369.app.

Tick a box (`- [x]`) when it's done. Changes to the plan go in [CHANGELOG.md](CHANGELOG.md). All wording lives in [COPY.md](COPY.md).

---

## Decisions (locked in)

| Topic | Decision |
|---|---|
| Game | Monopoly Deal, standard rules, real card art (from scans) |
| Entrance | Tap the SwiftMediaInfo icon in the Work section 5 times → secret code dialog |
| Codes | Not case-sensitive. Right/leader code shows a funny line for **3.5 s** before moving on |
| Player code | `DEALBREAKER` → Deal Breaker page → enter room code + name |
| Leader code | `DEALBREAKER_Undisclosed` → create a room. One leader per room, checked on the server |
| Other codes | `MERCY`, `ONE`, … reserved for future pages ("coming soon" page for now) |
| Song codes | `RICK`, `SOMETHING`, `MIDDLE`, … show a line for 2.5 s, then open YouTube in a new tab (list in COPY.md) |
| Rooms | The leader picks the room code (letters only, 3–12). Many rooms can run at once |
| Names | Letters and single spaces only, 2–16 characters, unique in the room |
| Players | 2–5 per room. No sign-up |
| Modes | AI Only · Players Only · Players + AI (leader picks how many AI seats) |
| AI difficulty | Easy · Normal |
| Win target | Leader picks 3–6 complete sets of different colors (default 3) |
| Timer | One timer only: leader picks 60–300 s, in 15 s steps (default 120). See timer rules |
| Chat | Room chat in the lobby and during the game. Desktop: open by default, can be opened and closed. Mobile: closed unless the player opens it |
| Player stats | Kept per name, across all games and rooms. Shown under a Profile button → Player Statistics. See stats rules |
| Devices | PC, phone, tablet. Landscape only; portrait shows a "rotate your device" screen |
| iPhone app | Can be saved to the Home Screen and opens fullscreen like an app |
| Look & feel | Matches the website's theme; premium animations everywhere |
| Hosting | Page on GitHub Pages; game server on Cloudflare Workers + Durable Objects (free plan) |
| Server address | `dealbreaker.undisclosed0369.app` |

### Timer rules

There is only one timer length: the one the leader picks (60–300 s). There is no separate response timer.

- **Your turn:** the clock starts when your turn starts. If it runs out, your turn ends (cards already played stay played).
- **When someone plays a card against you** (rent, Birthday, Debt Collector, Sly Deal, Forced Deal, Deal Breaker):
  - The attacker's clock pauses and you get a full clock to respond: play Just Say No, or pick what to pay with.
  - If your clock runs out, the card goes through anyway. No Just Say No is played, and the server picks your payment: money first (smallest bills that cover it), then lowest-value properties.
  - When several players are charged (Birthday, two-color rent), they each get their own clock at the same time.
  - Just Say No chains: each person asked to respond gets a fresh clock.
- **Too many cards:** if you end your turn with more than 7 cards, you get **60 seconds** to choose which cards to discard. The next player starts their turn right away; they don't wait for you. If the 60 s run out, the server discards your lowest-value cards. You can still use a Just Say No from your hand while you're choosing.
- A warning pulse and sound at 10 seconds left.

### Disconnects, AI takeover and rejoining

- **Disconnected mid-game:** after a 15-second grace period, an AI takes over the seat and keeps playing. The grace period covers a page refresh or an iPhone briefly switching apps.
- **Still connected but idle:** if your clock runs out 3 turns in a row, an AI takes over. Tap "I'm back" to take your seat back at the start of your next turn. No approval is needed because you never left.
- **Rejoining after a disconnect:** enter the room code and your name. The leader gets a prompt ("Alex wants back in" → Let them in / Keep the robot). If the leader lets them in, the player gets their seat back from the AI, with whatever hand and table the AI left them. If the AI is in the middle of a move, the swap happens once that move is done.
- **Leader disconnects:** the AI plays their seat too. The leader rejoins with the leader code + room code; no approval needed. Rejoin requests wait until the leader is back.

### Stats rules

- **Same name = same profile.** Names match regardless of capitals or extra spaces ("undisclosed" = "Undisclosed"). There's no sign-up, so anyone who types an unlocked name plays as that profile.
- **Optional name lock:** a player can set a 4-digit PIN in their profile (numbers only). After that, joining with that name asks for the PIN.
  - Asked every time the name sits down in a room (reconnecting to the same seat doesn't ask again).
  - Changing or removing the PIN needs the current PIN (or being in the room after entering it).
  - Forgot it? The leader can remove the lock. Stats are kept.
  - 5 wrong guesses on a name locks it for 10 minutes.
  - Stored on the server as a salted hash, never in plain text.
  - Locked names show a 🔒 next to them in the profile.
- **Who can see what:**
  - Players see their own stats and the stats of anyone in their current room.
  - The leader sees **every** profile ever recorded, locked or not, from an "All Players" directory.
- **Leader and name locks.** A locked name asks the leader for its PIN like anyone else (when opening a room, or coming back with the leader code on a new device; not when reconnecting). The leader can't be banned, and can view, reset, delete or unlock any profile.
- **Shared across games:** one profile covers Deal Breaker now and Mercy, One, etc. later. Each game has its own stats section, plus an overall summary.
- **Finishing positions:** 1st is the winner. Everyone else is ranked by number of complete sets (different colors), then by total value on the table (properties + bank). Positions are relative to the table size; a 5th place only happens in 5-player games.
- **DNF (did not finish):** the player left or disconnected and an AI finished the game for them, or they were kicked. If they rejoin before the end, it counts as a normal finish.
- **Only your own moves count.** Anything the AI does while sitting in your seat isn't credited to you (no free Deal Breakers from the robot).
- **AI players have no profiles.** Their names aren't saved.
- **Abandoned games don't count.** If the leader ends a game early or everyone leaves, no stats are recorded.
- Stats are saved when the game ends, so a game in progress doesn't show up yet.

---

## Phase 0 — Assets

- [x] Owner scans one of each different card front (`Monopoly_Deal_Cards.pdf`, 34 pages, all 64 different fronts present)
- [x] Owner scans the card back (`back_cover.jpeg`)
- [x] Check the deck adds up to 106 playable cards (20 money, 47 action incl. 13 rent, 28 property, 11 wild)
- [x] Deck data for every card: type, color, value, quantity, rent tables (`cards/deck.js`)
- [x] Digitally recreate every card as crisp vector art, text converted to outlines (`cards/svg/`, 58 designs + back)
- [x] Vector-trace the character illustrations from the scans (`cards/art/`)
- [x] Hand-draw the small icons (train, faucet, light bulb, money stack, Pass Go lettering)
- [x] Recreate the card back
- [x] Review gallery with side-by-side scans (`cards/gallery.html`)
- [x] Owner reviews every card and lists any changes (approved as-is)

## Phase 1 — Secret door

- [x] 5-tap detection on the SwiftMediaInfo icon (2 s reset, works with mouse and touch)
- [x] Wiggle animation + speech bubble on taps 3 and 4
- [x] Secret code dialog in the site's style (glass, brand glow, light + dark), with premium open/close animation
- [x] Wrong / right / leader lines from COPY.md, random, no back-to-back repeats
- [x] 3.5 s pause on right and leader codes, with a shimmering progress bar (gold for the leader)
- [x] Easter eggs (`password`, `please`, `open sesame`, `1234`, empty)
- [x] Song codes: line for 2.5 s in a new tab that then opens YouTube; same-tab fallback when new tabs are blocked
- [x] 10 s nap after 5 wrong tries
- [x] Codes not case-sensitive; no code list anywhere. A code's SHA-256 names its folder: `/x/<id>/` (`tools/door-id.py`)
- [x] Leader code opens the Deal Breaker table in leader mode; typed code kept in `sessionStorage` for the server
- [x] Unlisted pages: `noindex`, not in `sitemap.xml`, `/x/` blocked in `robots.txt`
- [x] "Coming soon" pages for `MERCY` and `ONE`
- [x] Deal Breaker holding page (replaced by the game in Phase 4)
- [x] Keyboard and screen-reader friendly; Esc closes the dialog; focus stays inside it
- [x] Owner tries it on their own iPhone and computer

**Adding a code later:** run `python3 tools/door-id.py NEWCODE`, then create `x/<id>/index.html`. Deleting the folder retires the code.

## Phase 2 — Rules engine

Plain JavaScript (no build step), shared by the browser, the server and the tests: `x/7a3797625d3c2330/engine/rules.js`, with the deck in `engine/deck.js`.

- [x] Card data: full deck with quantities, values, colors, rent tables
- [x] Setup: shuffle, deal 5 each, random first player (seeded, so games can be replayed)
- [x] Drawing is manual: tap the deck to draw 2 (5 if your hand was empty when the turn began), no play used. Forget, and those cards are lost
- [x] Draw first (table rule, on by default, leader can switch it any time): any move before drawing gives up that turn's draw
- [x] Up to 3 plays per turn
- [x] Play to bank (money + action cards as money; properties can't be banked)
- [x] Play properties; build sets; full set sizes per color; extras start a new set
- [x] Property wild cards: two-color and ten-color; rearrange freely on your turn
- [x] Ten-color (rainbow) wild: worth a property of its color on the table, so it can pay (house rule); worth nothing in hand
- [x] Houses (full set only, not on railroads/utilities) and hotels (needs a house)
- [x] Rent cards: two-color (charge everyone) and wild rent (charge one player)
- [x] Double the Rent (each one uses a play; up to two for ×4)
- [x] Pass Go (draw 2)
- [x] It's My Birthday (everyone pays 2M)
- [x] Debt Collector (one player pays 5M)
- [x] Sly Deal (take one property, not from a full set)
- [x] Forced Deal (swap one property each, not from full sets)
- [x] Deal Breaker (take a full set, including its house/hotel)
- [x] Just Say No, including chains (Just Say No against a Just Say No); never uses a play
- [x] Paying: payer picks the cards, money first (properties only once the bank is empty), no change given, pay with whatever you have if you can't cover it
- [x] Paid properties go to the receiver's table (not their bank)
- [x] End of turn: discard down to 7. Player chooses within 60 s while the next turn runs
- [x] Empty draw pile → shuffle the discard pile into a new draw pile
- [x] Win check: N complete sets of different colors (N = 3–6), the moment anyone gets there, on anyone's turn
- [x] Timer rules: running out on your turn ends it; running out when charged means no Just Say No and an automatic payment
- [x] Each player only sees their own hand (`view`)
- [x] Final standings for stats: winner, then complete colors, then total value
- [x] 48 automated tests covering every card and edge case (`node --test _dealbreaker/tests/`)
- [x] 1,000 random full games: 2.7 million actions, 0 bugs (`node _dealbreaker/tests/simulate.mjs`)

### House rules (where the printed rules are silent)

- Houses and hotels can be used to pay (3M / 4M); they go to the receiver's bank.
- If a set with buildings stops being complete, its buildings drop into the owner's bank.
- Up to two Double the Rent cards on one Rent card (×4), using all three plays.
- Forced Deal can't take from, or give from, a complete set.
- A set made only of ten-color wilds charges no rent.
- A rainbow (ten-color) wild on the table is worth what a property of its color is worth, so it can be used to pay (owner's rule).
- A win counts the moment it happens, on anyone's turn (owner's rule): a Forced Deal or payment that finishes your last set ends the game on the spot. If one move finishes two players at once, the player whose turn it is wins.
- Drawing is a tap on the deck. Forget to draw before your turn ends (or your time runs out) and those cards are lost (owner's rule).
- Draw first (owner's rule, a table setting, on by default): play anything before drawing and the draw is lost for that turn.
- Players with no real choice (no Just Say No in hand, or nothing at all to pay with, even holding a Just Say No) are skipped automatically.
- Money first: you pay from your bank before you may add properties or buildings (owner's rule).
- Two unfinished sets of the same color always merge (e.g. after a wild card changes color).

## Phase 3 — Game server (Cloudflare)

Code in `_dealbreaker/server/` (not served by the website). Runs fully on your Mac with `npm run dev`; no Cloudflare account needed until launch.

- [x] Worker + Durable Object project (one Durable Object per room)
- [x] Leader code checked on the server (secret `LEADER_CODE`; spaces and letter case ignored; constant-time compare)
- [x] Leader creates a room with their chosen room code (letters only, 3–12, must be free)
- [x] Join a room with room code + name (letters and spaces only, unique in the room, 5 seats max)
- [x] Lobby settings (leader only): mode, AI seats, AI difficulty, win target, turn timer, kick player, start game
- [x] WebSockets with hibernation (keeps it inside the free plan)
- [x] Each player only receives their own hand
- [x] Reconnect token saved in the browser so a refresh keeps your seat
- [x] 15 s reconnect grace, then AI takeover
- [x] AI takeover after 3 timed-out turns; "I'm back" to reclaim
- [x] Rejoin request → leader prompt → seat handed back from the AI (leader rejoins with the leader code, no approval)
- [x] One clock for everything: turn timer, paused while others answer; 60 s discard window; AI "thinking" time
- [x] Chat: relay messages to everyone in the room, keep the room's history so rejoining players can catch up
- [x] Chat limits: 200 characters per message, max 1 message per second, leader can mute a player
- [x] Rematch and "end game" for the leader; a rematch closes everyone's results screen
- [x] Leader can kick anyone, AI included, in the lobby or mid-game; mid-game the seat leaves the table (cards to the discard pile, last player standing wins)
- [x] Leader's "•••" Options button in every seat's corner (slides open to "Options" on hover)
- [x] Tapping a player opens them full screen for everyone (badges, counts, whole table); the leader also gets Mute/Kick
- [x] Player options open full screen: profile (avatar ring, name, badges, sets / bank / hand / table during a game), big Mute and Kick tiles, and an in-place confirm
- [x] A turn timer change applies to the running clock at once
- [x] Leader can change the turn timer, sets to win and AI skill mid-game (who's playing is fixed once dealt)
- [x] Leader leaving after a match (or from the lobby) closes the room, so the code is free straight away
- [x] "Close the room" for the leader at any time, mid-game too; the app waits for the server's goodbye so it can't get lost; reopening a finished or empty room's code starts fresh
- [x] A player who dropped off in the lobby gets their name and seat back
- [x] Empty rooms clean themselves up after 1 hour; the room code becomes free again
- [x] Rate limiting on room creation, leader-code guesses and joins
- [x] Simple AI players (`engine/bot.js`) so AI seats work now; made smarter in Phase 5
- [x] Each player receives their legal moves with every update
- [x] 12 end-to-end tests over real WebSockets, clocks fast-forwarded 100× (`npm test` in `server/`)
- [ ] Owner: log in to Cloudflare once (`npx wrangler login`)
- [ ] Set the leader code as a secret and deploy (`npx wrangler secret put LEADER_CODE`, `npm run deploy`)
- [ ] Custom domain `dealbreaker.undisclosed0369.app`

## Phase 4 — Game UI

The game lives at `x/7a3797625d3c2330/` (it replaces the holding page): `index.html`, `app.css`, and `js/` (`app.js` screens & flow, `net.js` connection, `table.js` drawing & card motion, `play.js` card choices, drops & prompts, `drag.js` drag and drop, `spotlight.js` played-card reveals, `chat.js` Messages-style chat, `controls.js` tabs/sliders/switches, `sheets.js`, `fx.js` effects & sound, `lines.js` announcer). To try it locally: run the site preview on port 8000 and `npm run dev` in `_dealbreaker/server`.

### Screens
- [x] Rules page: grouped, searchable (`/` or ⌘K), contents sidebar / section chips, real cards, tables built from the deck data (`x/7a3797625d3c2330/rules/`)
- [x] Start screen: room code + name (players), or room name + name (leader, arriving with the leader code); names remembered
- [x] Lobby: big room code (tap to copy or share), player list with leader / you / muted tags, AI seats shown, leader settings (mode, AI seats, AI skill, sets to win, turn timer), kick & mute, start
- [x] Waiting screen for rejoin approval; graceful "room has closed" when a saved room is gone
- [x] Table layout: opponents seated around the table (left and right seats run down the sides, others across), your sets + bank, piles, announcer, your hand fanned at the bottom; chat and menu buttons sit by End turn
- [x] Whoever's turn it is: their seat and cards grow and their side widens, everyone else eases back; on your turn all opponents step back and your sets grow
- [x] Short phone screens: the deck and announcer move beside your properties; a tighter layout for phones with the browser bars showing
- [x] Play cards by tap → a sheet of exactly the legal choices (server sends each player their legal moves)
- [x] Drag and drop: pick a card up, it tilts as it follows you, every legal spot glows (your table, a set, the bank, the felt for actions, an opponent for targeted cards); let go to play, or it springs back. Wilds on your table drag to another set. Tap still opens the choices
- [x] Pass Go dropped on the bank asks first in a small centered dialog ("Draw 2 instead" on Return, "Bank it +1M", "Never mind" on Esc), so a near miss for the deck doesn't waste it
- [x] Chat: Discord-style emoji menu (search, skin tones, categories, frequently used, preview) and "… is typing" dots
- [x] Someone else's action card rises from their seat, flips face up in the middle with a caption, then drops onto the discard pile; your prompt to answer waits until you've seen it
- [x] Pay sheet: bank first; properties unlock once all your money is in
- [x] Full-screen menu: back to the table, how to play, chat, sound switch, who's winning, and the table rules (live for the leader)
- [x] Full-screen results with standings and rematch; closes for everyone when the leader deals again
- [x] Prompts: pick target, pick property, pick wild color, Just Say No, no-to-the-no, choose payment ("Pick for me" too), choose discards with countdown
- [x] Paying can be previewed: "← Back" returns to Just Say No until you press Pay
- [x] Confirmations: matched choices, soft red for the final one, soft teal for the way back
- [x] Timer ring on whoever the game is waiting for; 10-second warning pulse and tick
- [x] Plays-left dots, draw/discard piles, set progress (chips on opponents, gold glow on complete sets)
- [x] The deck glows with "Tap to draw 2" while your draw is waiting
- [x] Opponents' sets and bank shown as real cards (screens 600 px tall and up; chips on shorter ones); table centered on wide windows
- [x] Funny announcer lines for card plays and events (from COPY.md), incl. "one set away"
- [x] Live play-by-play: a personalised line for every move, naming every card (what was stolen, swapped, which set a Deal Breaker took, what each payment was made of, what a Just Say No stopped); last three kept on screen; tap for the full game's activity
- [x] Plays left: badge on the active player's seat, label under your own dots
- [x] Phones: deck and play-by-play in a slim strip so your own table always has a full row
- [x] Two-color wilds turn around to show the color they're used as (with a spin when changed)
- [x] Sets that don't fit scroll sideways by drag (mouse and touch) or mouse wheel, with momentum and fading edges
- [x] Tap any card to see it big; tap an opponent to see their whole table; tap your bank
- [x] Leader prompt for rejoin requests ("Let them in" / "Keep the robot")
- [x] "I'm back" button after an AI takeover for idling
- [x] Win screen with standings + rematch (leader); "End the game" for the leader
- [x] Sounds (synthesised, no files): a small studio mix with reverb; separate sounds for draw, place, bank, rent, double rent, paying, getting paid, steal, swap, Just Say No, Deal Breaker, birthday, set complete, win and lose; mute in the menu

### Chat
- [x] Works in the lobby and during the game, same conversation throughout
- [x] Desktop: docked side panel, open by default, close button, remembers your choice
- [x] Mobile/tablet: stays closed; a chat button with an unread count; slides over the table
- [x] Mobile: no pop-up previews while closed, just the unread badge
- [x] Quick reactions (😂 🔥 😭 👀 GG Nooo Why me)
- [x] Looks like Messages: blue and grey bubbles with tails, runs grouped, names and faces on incoming runs, timestamps, "Delivered", big emoji-only messages, send button appears as you type
- [x] Names on messages; AI marked with 🤖; system lines (joins, takeovers, wins, rule changes) styled quietly
- [x] Keyboard-safe input (16 px, so iPhone doesn't zoom)
- [x] Messages slide and fade in; smooth panel open/close
- [x] Muted players get the funny line
- [x] Leader can clear the chat for everyone (confirmation, sweep-away animation, a funny line left in the log)
- [x] Quick reactions scroll sideways by mouse drag as well as touch
- [x] Phones: with the keyboard up, the chat fits the visible space exactly, goes full width, and slims its header (reactions tucked away), so messages and the field stay in view
- [x] Markdown, Discord style: bold, italic, underline, strike, code, spoilers, links
- [x] Emoji by name (`:cat:` → 🐱) with suggestions as you type and skin tones; always Apple-style (Apple artwork on other devices). Data built by `_dealbreaker/tools/build-emoji.mjs`

### Look & feel (premium)
- [x] Apple's system fonts (SF Pro, SF Pro Rounded for numbers) with Inter as the fallback elsewhere; glass panels, glows and drifting background, always dark (a card table at night)
- [x] Buttons with a glass highlight, hover sheen and springy press; segmented tabs with a sliding thumb; sliders with a live value; iOS-style switches (game and secret door)
- [x] Card movement: every card glides from where it was to where it lands along an arc (deal, draw, play, bank, pay, steal, swap, discard); cards leaving to opponents fly into their panel
- [x] Hand fans out in an arc and lifts the card under your pointer
- [x] The deal: five rounds round the table, one card at a time from the deck; yours land face down and flip up, others glide into their seats. AI players wait for the last card
- [x] Drawing (the turn's cards, Pass Go, 5 on an empty hand) flies the same way, for you and for everyone else
- [x] Cards changing hands (payments, Sly Deal, Forced Deal, Deal Breaker) fly one at a time, slowly, glowing in the move's colour, and both seats light up
- [x] Special moments: "DEAL BREAKER!" and "NO!" stamps with shockwaves, birthday confetti, "DOUBLE RENT!" stamp, completed sets glow gold with a moving sheen and confetti, win celebration
- [x] Transform/opacity-only animation; respects Reduce Motion
- [x] Screens, sheets, toasts and buttons all animate in the same spring style
- [x] Keyboard on desktop: Return confirms (↩ keycap on the main choice), Esc cancels; Return still pays after clicking cards in the pay sheet

### Devices
- [x] "Rotate your device" screen on phones held upright
- [x] Tested at iPhone-landscape size (844×390), iPhone with Safari's bars (667×262, 5 players), phone portrait, desktop, and wide desktop with docked chat
- [x] Owner tested on a real iPhone (iPhone 15 Pro Max). iPad testing dropped: not a target device
- [x] Safe areas respected (notch / Dynamic Island / home bar)

### iPhone Home Screen app
- [x] Web app manifest + Apple meta tags: opens fullscreen, landscape, dark status bar
- [x] App icon made from the real cards (`icons/`, built by `_dealbreaker/cards/tools/build-icons.mjs`)
- [x] One-time hint on iPhone Safari: Share → Add to Home Screen
- [x] Reconnects instantly when coming back from another app; keeps the screen awake during a game

## Phase 5 — AI players

`x/7a3797625d3c2330/engine/bot.js`. Plays fair: it only reads its own hand and what's face up on the table. No lookahead, so each move costs about 0.01 ms (well inside the server's CPU budget).

- [x] Easy: knows the cards but plays loosely (lots of noise in its choices, the odd random move, pays with whatever comes to hand, only moves wilds to finish a set). Beatable, not brainless
- [x] Normal: plays the winning card when there is one, finishes sets, keeps money in the bank (more when it's thin), banks cards that would be discarded anyway, never banks its Just Say No or Deal Breaker, aims Debt Collectors, rent and steals at the player in the lead, spoils sets that are one card from done, avoids Forced Deals that hand over a finished set, doubles rent only when it really pays
- [x] Normal answers sensibly: Just Say No against a Deal Breaker or a steal from an almost-finished set, or a big bill that would cost properties; pays small bills; pays money first, then the properties it'll miss least; never breaks a finished set if it can help it; discards small money before properties and Just Say No
- [x] AI thinks like a person at the table, slowly enough to follow: 1.3–1.8 s to draw or end the turn, 2–2.8 s for a play, 2.9–3.6 s for the big decisions
- [x] AI can take over and hand back a seat mid-game (built in Phase 3)
- [x] 1,000 AI-only games (`node _dealbreaker/tests/ai-sim.mjs`): 0 stuck, 0 bugs, average 26 turns; Normal wins ~70% of games against Easy
- [x] 10 decision tests (`_dealbreaker/tests/bot.test.mjs`)

## Phase 6 — Player statistics

Built in four parts, each finished and tested before the next:
**6A** player directory, name lock, bans (done) · **6B** recording stats (done) · **6C** statistics screens and the full directory (done) · **6D** profile pictures (done).

### Server
- [x] Stats storage on Cloudflare: one shared `Directory` Durable Object holds every name's profile and its stats
- [x] Every tracked event counted per player, human moves only (`engine/stats.js`; the server says which seats their own humans are playing)
- [x] Final ranking + DNF detection at game end, saved for every human in one write
- [x] Generic per-game structure (`overall` + one section per game), so Mercy, One, etc. plug in later
- [x] Leader tool: reset or delete a name's stats (for typos and pranks) — server side; the buttons come with 6C
- [x] Name lock: set / change / remove a 4-digit PIN (keyed hash with a per-name salt and a server pepper; the PIN is never stored)
- [x] Joining with a locked name requires the PIN, every time; entering it gives that device a pass that only proves ownership for changing or removing the lock (changing the PIN voids every pass)
- [x] Guess limit: 5 wrong tries → that name is locked for 10 minutes
- [x] Leader tool: remove a name's lock (forgotten PIN)
- [x] Leader: asked for the PIN of a locked name like everyone else (opening a room, or the leader code on a new device); can't be banned
- [x] Leader-only profile list, over the leader's own room connection (checked on the server); no secrets ever leave it
- [x] Players can only fetch stats for themselves and people in their current room (the leader: anyone)

### Leader: players and bans
- [x] All players list: every unique player, with what they've given (name, lock on or off, first and last seen, rooms played) and their full stats (pictures come with 6D)
- [x] Ban a player from their full-screen view, or from the players list ("Ban" also kicks them if they're in the room)
- [x] Ban list: everyone banned, when and from which room, with Unban
- [x] Banned names can't join any room; the leader is never bannable

### Profile pictures
Waits for this phase: a picture belongs to a name, and only a name lock stops someone else from changing it.
- [x] Pick a picture: 16 built-in, card-themed ones (property colors with an Apple-style emoji: top hat, house, hotel, cake, detective, railroad…), or your own photo
- [x] Own photos: framed in a circle on the device (drag, pinch, wheel or zoom bar), shrunk to 160 × 160 (WebP, or JPEG on Safari; a few KB) before upload; stored with the name's profile and served as a cached image by version
- [x] Changing the picture of a locked name needs its PIN: only your own name, from inside a room, and a locked name's PIN is asked every time it sits down (the leader can reset any picture)
- [x] Shown everywhere the letter avatar is today: lobby, table seats, chat, menu, results, stats and Players & bans; it follows the name into every room
- [x] More freedom: any emoji on any colors, and a ring (8 styles) around any picture
- [x] GIFs: still frame by default; plays on the player's turn, on hover, and on their full-screen view and stats
- [x] Higher quality: 384 px avatar stills, the original kept (up to 5 MB) and shown at full size on tap (never bigger than it really is)

### Tracked stats
All recorded from 6B on (shown on screen in 6C). Favorite game, favorite color, nemesis and favorite victim are worked out from the counts when shown.

Overall (all games):
- [x] Games played
- [x] Favorite game (most played: Deal Breaker, Mercy, One, …)
- [x] Total wins + win rate
- [x] Total DNFs
- [x] Time played

Deal Breaker:
- [x] Games played, wins, win rate
- [x] Finishes by position: 1st / 2nd / 3rd / 4th / 5th
- [x] DNFs
- [x] Deal Breakers used
- [x] Just Say Nos used
- [x] Sly Deals, Forced Deals, Debt Collectors, Birthdays used
- [x] Rent collected (M) and rent paid (M)
- [x] Biggest single rent collected (M)
- [x] Cash accumulated: total money put in the bank (M)
- [x] Sets completed
- [x] Fun extras: favorite color set, nemesis (player who stole from you most), favorite victim (player you stole from most), longest win streak

### UI
- [x] Stats button in the lobby (next to the lock) and "My stats" in the game menu, plus "See mine →" on the game-over screen (the start page has no room connection yet, so stats open once you're in a room)
- [x] **Player Statistics**: overall summary on top, then a section per game (finishes chart, win streak, favorite color, nemesis, favorite victim, action cards, rent, cash, sets, recent games)
- [x] Tap any player in the lobby or game: their full-screen view has a "{name}'s stats" tile
- [x] Leader: **All Players** directory (Players & bans), from the lobby and the game menu
  - [x] Search by name, sort by games played / wins / win rate / last played
  - [x] Open any profile (locked or not) with the full Player Statistics view; "← Players & bans" comes back with the same tab, search and sort
  - [x] Actions per profile: reset stats, delete profile, remove lock (each asks "sure?" in place)
- [x] Animated counters, position bar chart, and tinted stat cards in the site's premium style (still with reduced motion)
- [x] Empty-profile state with funny copy (from COPY.md), plus the profile quips (zero wins, no Deal Breakers, DNFs, high win rate)
- [x] "Lock my name" (lobby and game menu): set, change or remove the PIN; the lobby's lock turns gold when locked
- [x] Join screen asks for the PIN whenever the name is locked (every time it sits down in a room): the panel slides into a PIN pad, the 4th digit sends it, wrong PINs shake and clear, the right one goes straight in
- [x] Works in landscape on iPhone (scrollable panel, tighter cards)
- [x] Esc goes back one step (or closes) on the stats screen
- [x] Pictures saved in an older format are upgraded as they're read, never dropped
- [x] Seats only count as online with a live connection (a server restart no longer revives an old lobby)
- [x] Server tests use their own storage (`npm run test:server`)

## Phase 7 — Consolidation & performance

Goal: the same game, lighter. iPhones ran warm and laggy in long games, so
before launch the code is tidied and the hardware cost cut on every device,
**without changing the look, feel or behaviour** of the game or the website.
Built in three parts, each tested before the next.

### 7A — Consolidation & refactoring ✅
Covers the game and the whole website (studio home, SwiftMediaInfo and its pages, the door, the hidden pages, the rules page) and the server.
- [x] Map the client: what each module owns, duplicated helpers, dead code and leftover styles (scripted scans of every declaration, export, import, selector, class, keyframe and variable)
- [x] One home for shared helpers: `js/util.js` (`$`, `store`, `reduceMotion`, `nameKey`, which were copied into up to 4 modules each); overlays and tiles in `js/overlay.js`. Two look-alikes stay apart on purpose: `ago` (people vs stats word it differently) and the Players & bans tile (slightly different markup)
- [x] Split `app.js` (1,130 lines → 557) into focused modules with no behaviour change: `state.js` (shared state), `overlay.js` (full-screen overlays, tiles, their keys), `lobby.js` (seats, table rules, a player full screen, leaving), `announcer.js` (play-by-play, activity, effects) and `menu.js` (menu, results)
- [x] Dead code pruned: game (`isBusy`, `COLOR_KEYS`), server (`ROOM_RE`), tests (an unused import and variable)
- [x] Unused CSS pruned: game (`.typing-dots`), site (`.dialog__btn--primary`, `.nav__link--optional`, `.nav__link--secondary`, `.path__head`, `.path__badge`, `.shot__spec`, `.wrap--text`), hidden pages (`.hidden-page__back--accent`, the unused `.fan` card fan and its two animations). Classes built at runtime (`active-left`, `is-p1`, `pcard__tag--on`, `standing--1`, `is-error`…) were checked and kept
- [x] Near-duplicate CSS reviewed: about 25 small coincidental matches, each in its own section; merging them would reorder the cascade for no measurable gain, so they stay
- [x] Server: helpers already shared (`nameKey`, checks, messages); nothing duplicated
- [x] Checks: engine 81/81, server 23/23, AI simulation clean, lint clean (no undefined or unused names); every site page's computed styles compared before/after at 1440×900, 390×844 and 932×430 (identical apart from always-running animations); the game played through in the browser (draw, plays, Return to end, menu, a player's view, activity, results → stats → back, end game, lobby, seats, leave)

### 7B — Performance (built; the iPhone check is the owner's)
- [x] Baseline, measured in the browser during a 5-player game: each update rebuilt about 146 of the table's ~230 elements, including ~14 card images; four background glows animated at the display's full rate on every page, keeping frosted-glass panels (4 seats, menu button, chat) re-blurring every frame; two loops repainted on every frame for as long as they showed (the complete-set shine, the player-view ring)
- [ ] Baseline on the iPhone 15 Pro Max (Safari Web Inspector timelines): needs the owner's phone and a cable
- [x] Redraw only what changed: every seat, set, bank, the discard and each hand card is kept with a signature of what it was drawn from, and reused (without being moved, so nothing replays) when that hasn't changed. Per update: ~146 → ~37 elements, ~14 → ~4 card images. Checked against the game state after 90 updates over 15 turns: every hand, set, seat, count and discard matched
- [x] Card images: not needed after all. With cards reused, phones decode a few new card images per update instead of a dozen, and each one stays rasterised; the card files stay untouched
- [x] Glass effects: kept exactly as they are; they now re-blur at most 30 times a second instead of 60–120, because the glows under them do (next item)
- [x] Background glows (every page of the site): the same CSS loops, paused, with their playhead moved 30 times a second from site.js. Same paths, easing and timing; nothing runs in a background tab; reduced motion has no loops
- [x] Complete-set shine and player-view ring: now transforms the GPU does alone instead of repaints, matching the old ones exactly (the shine's position checked to 0.01 px at six moments)
- [x] Timers: the game clock only touches the page when a number changes (it kept rewriting the same seconds 5 times a second). It keeps running in a background tab, so the last-10-seconds ticks still warn you
- [x] Network diffs: not needed. A full update is about 4 KB, parsed in well under a millisecond
- [ ] Re-measure on the iPhone against the baseline; the iPhone stays cool through a full game (owner's playtest, Phase 8)

### 7C — Clean-up ✅ (done alongside 7A)
- [x] Unreferenced files: none on the site (every image, frame, card, egg and script is used; the frames and cards are loaded by number and by card id)
- [x] Deleted temp files: `.DS_Store` files, wrangler's temp bundles, the test server's storage
- [x] Local dev data pruned: ~60 test profiles (and their pictures) and 358 old test rooms; labrat and Mobile kept with their PINs, stats and pictures
- [x] Heavy folders stay out of git (`node_modules`, `.wrangler`, `.dev.vars` are ignored)
- [x] Final clean-up after the sound work: audition pages and candidates, the voice engine and downloads, test storage, empty local rooms, `.DS_Store` files. The voice recorder is kept as `_dealbreaker/tools/voice/record-bella.py`
- [x] Card source material deleted (Monopoly Deal PDF, card back photo, 59 scans, 10 traced art files) after the owner approved the built cards; all 59 card SVGs exported to `~/Desktop/polished cards`. The gallery's "Compare with scans" view went with the scans

## Sound & music (after Phase 7)

- [x] Recorded effects for every game moment (CC0: Kenney casino set, Freesound), levelled by group; built by `_dealbreaker/tools/build-sounds.py`
- [x] One announcer, Bella ("the all-seeing croupier"), one line for each of 13 moments, picked by ear; per-device on/off
- [x] Background music: six tracks (Luxury Hotel Lounge by default), per-device on/off, volume and track; plays through lobby and game without a break; off unloads the stream
- [x] New picks for birthday, set complete, last ten seconds, win and lose (audition 3)
- [x] Owner picked a line per moment; three rewritten with pauses (Just Say No, birthday, time's up)
- [ ] Owner hears it all in a real game, on the iPhone too (Phase 8)

## Phase 8 — Playtest & launch

- [ ] Playtest with the owner on a real iPhone and PCs
- [ ] Fix bugs + polish
- [ ] Check free-plan usage after a few real games
- [ ] Launch 🎉
