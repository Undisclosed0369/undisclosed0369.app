# Deal Breaker: voice script

One voice: **Bella**, the table's all-seeing croupier. She calls it as she
sees it. One line per moment, all original.

Recorded with Kokoro (Apache 2.0, voice "Bella") by
`_dealbreaker/tools/voice/record-bella.py` (its setup is at the top of the
file; the model is downloaded, not committed). The recordings are in
`sounds/voices`, and `_dealbreaker/tools/build-sounds.py voice` copies them
into the game (`x/7a3797625d3c2330/sounds/voice`). To change a line, edit it
in both this table and the script, record that moment, and rebuild. Lines marked ⏸ are spoken in two
parts with a real pause between them. Write "Humph", never "Hmph" (the
engine spells that one out letter by letter).

| Moment | Bella |
|---|---|
| Game start | "Welcome to the table. Good luck, everyone!" |
| Rent | "Time to pay the rent!" |
| Double the Rent | "Double rent!" |
| Debt Collector | "Debt Collector!" ⏸ 0.5 s "Pay up, please." ⏸ 0.4 s "Cash, property, or tears." |
| Deal Breaker | "Deal Breaker! Say goodbye to that set!" |
| Sly Deal | "Sly Deal! That one's mine now." |
| Forced Deal | "Forced Deal! Swap it!" |
| Just Say No | "Nope!" ⏸ 0.75 s "Denied." |
| It's my birthday | "Surprise! It's my birthday again." ⏸ 0.5 s "Somehow." |
| One set away | "One set away from victory!" |
| Hurry up (20 s left on your turn) | "Clock's ticking! Make your move!" |
| Time's up, robot steps in | "Time's up!" ⏸ 0.6 s "The robot's got this one now." |
| You win | "You win! Congratulations!" |
| You lose | "Game over. Better luck next time!" |

Each player can switch Bella off (Sound & music → Bella), on their own device.
