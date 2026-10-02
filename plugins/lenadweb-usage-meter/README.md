# lenadweb-usage-meter

See how much of your context window and plan limits you have used without leaving the Claude Code terminal. lenadweb-usage-meter draws three progress bars at the bottom right of the prompt footer, the same figures the Claude desktop app shows in its usage popover.

![Context, session and weekly usage bars at the bottom right of the Claude Code prompt footer](docs/screenshot.png)

## What it shows

- **Context**: how full the current context window is, with tokens used out of the window size.
- **Session**: the 5-hour plan limit, with the time until it resets.
- **Weekly**: the 7-day plan limit, with the time until it resets.

Bars are blue, turn amber past 70% and red past 90%. On a narrow terminal the footer drops the token counts and reset times first, then switches to short labels (`ctx`, `5h`, `7d`), and finally shows percentages only, so it always fits on one line.

Session and weekly limits appear after the first reply of a session, because Claude Code learns them from API responses, and only on a Pro or Max subscription. The context bar is there from the start.

## Requirements

- Claude Code 2.1.287 or later, in a terminal or the Code tab of the Claude desktop app. The plugin is a mod: it only draws inside Claude Code and does nothing in chat or Cowork.

## What it sends, and where

Nothing. The plugin makes no network requests, runs no programs, reads no files and sends no data anywhere. It only draws the usage figures Claude Code already has for the session.

## Hooks it adds

| Event | What the hook does |
| --- | --- |
| `session.start` | Reads the session's usage figures and starts a one-minute clock for the reset countdowns. |
| `session.measure` | Stores the new figures Claude Code measures after each turn. |
| `ui.render` for the footer mode labels | Draws the progress bars at the right of the prompt footer, keeping any mode labels Claude Code shows there. |

No hook changes, blocks or rewrites a prompt, a tool call or anything Claude sees.

## License

MIT
