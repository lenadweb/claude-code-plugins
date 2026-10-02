# lenadweb-image-preview

See the image you are about to paste into Claude Code before you paste it. When the clipboard holds an image, lenadweb-image-preview draws a preview above the prompt with its size and format. After you paste, every `[Image #N]` in your draft gets a thumbnail until you send the prompt, so you always know which image is which.

![A preview of the clipboard image above the Claude Code prompt, with its size, format and Open and Hide buttons](docs/screenshot.png)

## Features

- A preview of the clipboard image, sized to the terminal window.
- Thumbnails of the images pasted into the draft, numbered like the `[Image #N]` tags.
- **↗ Open** opens the full image in the default viewer, such as Preview.
- **✕ Hide** hides the preview until the clipboard changes.
- With the band above the prompt focused (click it, or press ctrl+x then tab): `o` opens the clipboard image, `1` to `9` open a pasted image, and `h` hides the preview.

By default the image is drawn with block characters, choosing for each cell the shape and two colours that match it best, which works in every terminal, Terminal.app included. In Ghostty or kitty, turn on the **Real pixels** setting to draw the actual image instead.

## Requirements

- macOS, because the plugin reads the clipboard through the system pasteboard. On Windows and Linux the plugin turns itself off when the session starts: it draws nothing and runs nothing else.
- Claude Code 2.1.287 or later, in a terminal. The plugin is a mod: it only draws inside the Claude Code terminal and does nothing in chat, Cowork or the desktop app, which has image previews of its own.

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| **Real pixels (Ghostty, kitty)** (`pixel_images`) | off | Draws images with real pixels through the kitty graphics protocol. Turn it on only in Ghostty or kitty. |

Change it in the `/config` panel of Claude Code.

## What it sends, and where

Nothing. The plugin makes no network requests and sends no data to any server, Anthropic included. Clipboard images and the prompt draft never leave your Mac. The only things it hands data to are the local macOS programs listed below, and only to save, scale, show or delete images in its own temporary folder.

## Programs it runs

| Program | Exact command | When | Why |
| --- | --- | --- | --- |
| `mktemp` | `mktemp -d -t claude-image-preview` | once, when the session starts | creates a private temporary folder for the images |
| `osascript` | `osascript -l JavaScript -e <script> check` | every 1.5 seconds | asks the macOS pasteboard whether the clipboard changed and holds an image; the script is in `hooks/pasteboard.ts` |
| `osascript` | `osascript -l JavaScript -e <script> save <file>` | when a new image is copied | saves that image into the temporary folder |
| `sips` | `sips -s format png <file> --out <file>.png` | when a new image is copied | converts the image to PNG |
| `sips` | `sips -s format bmp -z <height> <width> <file> --out <file>.bmp` | when a preview or thumbnail is drawn | scales the image down to the size of the preview |
| `open` | `open <file>.png` | only when you press **↗ Open** | shows the image in your default viewer |
| `rm` | `rm -rf <temporary folder>` | when the session ends | deletes the temporary folder and every image in it |

`mktemp`, `osascript`, `sips`, `open` and `rm` are built into macOS. Every `<file>` is inside the temporary folder.

## What it reads

- **The clipboard**, through `osascript`, but only images; text in the clipboard is never read.
- **The prompt draft**, only to find `[Image #N]` tags. The text is not stored or sent.
- **The terminal size** Claude Code reports for the area above the prompt, to size the preview.

Images are kept only in the temporary folder, which is deleted when the Claude Code session ends.

## Privacy

See the [privacy policy](PRIVACY.md): the plugin reads clipboard images and the prompt draft locally, keeps images only until the session ends and shares nothing.

## Hooks it adds

| Event | What the hook does |
| --- | --- |
| `session.start` | Creates the temporary folder and starts checking the clipboard every 1.5 seconds. |
| `prompt.edit` | Lets every edit through unchanged; when the draft mentions `[Image #N]`, checks for a new thumbnail at once. |
| `prompt.submit` | Lets the prompt through unchanged, then clears the thumbnails, because the images were sent with it. |
| `session.end` | Deletes the temporary folder. |
| `ui.render` for the band above the prompt | Draws the clipboard preview or the thumbnails. |

No hook changes, blocks or rewrites a prompt, a tool call or anything Claude sees.

## License

MIT
