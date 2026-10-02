# claude-code-plugins

Personal [Claude Code mods](https://code.claude.com/docs/en/plugins/mods/overview): small HUD tweaks for the terminal, packaged as one plugin marketplace named `lenadweb-mods`.

| Mod | What it does |
| --- | --- |
| **[lenadweb-usage-meter](plugins/lenadweb-usage-meter)** | Progress bars at the bottom right of the prompt footer, as in the desktop app: **context** window fill, **session** (5-hour) and **weekly** plan limits with time until reset. Bars are blue, turn amber past 70% and red past 90%. |
| **[lenadweb-image-preview](plugins/lenadweb-image-preview)** | When the clipboard holds an image, shows its preview above the prompt with its size and format. After you paste, each `[Image #N]` in the draft gets a thumbnail until you send the prompt. **↗ Open** opens the image in Preview. Previews size themselves to the terminal. Images are drawn with block characters picked per cell from quadrants, halves and eighths, so they work in every terminal; in Ghostty or kitty, the **Real pixels** setting draws the actual image. |

### lenadweb-usage-meter

![Context, session and weekly usage bars at the bottom right of the Claude Code prompt footer](plugins/lenadweb-usage-meter/docs/screenshot.png)

### lenadweb-image-preview

![A preview of the clipboard image above the Claude Code prompt, with its size, format and Open and Hide buttons](plugins/lenadweb-image-preview/docs/screenshot.png)

Each mod is a standalone plugin under [`plugins/`](plugins) and can be installed on its own.

## Install

Requires Claude Code 2.1.287 or later.

```sh
claude plugin marketplace add lenadweb/claude-code-plugins
claude plugin install lenadweb-usage-meter@lenadweb-mods
claude plugin install lenadweb-image-preview@lenadweb-mods
```

Then run `/reload-plugins` in an open session, or restart Claude Code.

## Notes

- **lenadweb-usage-meter**: session and weekly limits appear after the first reply of a session (Claude Code learns them from API responses) and only on a Pro or Max subscription. The context bar is there from the start.
- **lenadweb-image-preview**: macOS only (reads the clipboard with `osascript` and scales with `sips`, both built in); sends nothing over the network. With the band above the prompt focused (click it, or ctrl+x tab): `o` opens the clipboard image, `1`–`9` open a pasted one, `h` hides the preview until the clipboard changes.

## Develop

Load a mod straight from the working tree; edits hot-reload while the session runs:

```sh
claude --plugin-dir plugins/lenadweb-usage-meter --plugin-dir plugins/lenadweb-image-preview
```

Check a mod before committing:

```sh
claude plugin validate .
claude plugin validate plugins/lenadweb-usage-meter
claude plugin validate plugins/lenadweb-image-preview
```

To add a mod, create `plugins/<name>/` with `.claude-plugin/plugin.json`, `hooks/hooks.json` and `hooks/register.tsx`, then list it in [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json).

## License

[MIT](LICENSE)
