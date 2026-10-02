# lenadweb-mods

Personal [Claude Code mods](https://code.claude.com/docs/en/plugins/mods/overview): small HUD tweaks for the terminal, packaged as one plugin marketplace.

| Mod | What it does |
| --- | --- |
| **[usage-meter](plugins/usage-meter)** | Progress bars at the bottom right of the prompt footer, as in the desktop app: **context** window fill, **session** (5-hour) and **weekly** plan limits with time until reset. Bars are blue, turn amber past 70% and red past 90%. |

Each mod is a standalone plugin under [`plugins/`](plugins) and can be installed on its own.

## Install

Requires Claude Code 2.1.287 or later.

```sh
claude plugin marketplace add lenadweb/lenadweb-mods
claude plugin install usage-meter@lenadweb-mods
```

Then run `/reload-plugins` in an open session, or restart Claude Code.

## Notes

- **usage-meter**: session and weekly limits appear after the first reply of a session (Claude Code learns them from API responses) and only on a Pro or Max subscription. The context bar is there from the start.

## Develop

Load a mod straight from the working tree; edits hot-reload while the session runs:

```sh
claude --plugin-dir plugins/usage-meter
```

Check a mod before committing:

```sh
claude plugin validate .
claude plugin validate plugins/usage-meter
```

To add a mod, create `plugins/<name>/` with `.claude-plugin/plugin.json`, `hooks/hooks.json` and `hooks/register.tsx`, then list it in [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json).

## License

[MIT](LICENSE)
