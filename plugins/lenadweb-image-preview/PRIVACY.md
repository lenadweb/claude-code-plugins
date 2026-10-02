# Privacy policy for lenadweb-image-preview

Last updated: 2 October 2026

lenadweb-image-preview is a Claude Code plugin that runs entirely on your Mac. This policy explains what it reads, what it keeps and what it shares.

## What it reads

- **Images in the clipboard.** When you copy an image, the plugin reads it from the macOS pasteboard to draw a preview. It never reads text from the clipboard.
- **The prompt draft.** It looks for `[Image #N]` tags in the text you are typing, to match thumbnails to pasted images. The text itself is not stored.

A copied image can contain personal information, such as a screenshot of a conversation or a document. The plugin treats every image the same way, as described below.

## What it keeps

Each copied image is saved to a private temporary folder on your Mac, created with `mktemp`, together with smaller copies used for drawing. The folder and everything in it is deleted when the Claude Code session ends. Nothing is kept between sessions.

## What it shares

Nothing. The plugin makes no network requests and does not send images, text or any other data to the author, to Anthropic or to any other service. The only programs it hands images to are the macOS tools listed in the README (`osascript`, `sips`, `open`, `rm`), all running locally.

## Analytics

The plugin collects no analytics, telemetry or usage data.

## Contact

Questions about this policy: open an issue at https://github.com/lenadweb/claude-code-plugins/issues.
