# mods

Two Claude Code mods, published as a plugin marketplace.

| Mod | What it does |
| --- | --- |
| [`cache-countdown`](cache-countdown) | Counts down to the prompt cache going cold, writes a handoff while you are away, and when the cache is cold offers to resume from the handoff or send with full context. |
| [`vitals`](claude-vitals) | A live sidebar of the session's vitals: prompt cache, context, spend and today's usage, edited files you can open in Zed, background tasks, and a pixel claw that reacts to it all. |

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install cache-countdown --marketplace floyda/mods
/plugin install vitals --marketplace floyda/mods
```

Answer `y` to add the marketplace, pick a scope (user is first), then set the mod's options. The mod is active straight away.

## cache-countdown

A band above the prompt counts down to the prompt cache going cold. Before it does, you get a toast and a chime. If you have stopped typing, the mod writes a handoff while the cache is still warm: one request that records the goal, state, decisions and how to resume.

When you send a prompt into a cold cache, it asks first: resume from the handoff, send with full context (shows roughly what that costs at API prices), or hold the prompt in the box.

`/handoff` writes a handoff on demand and offers to resume from it.

Options: cache TTL (`auto`, `5m`, `1h`), how early to warn, whether to ask before sending cold, whether to hand off when you are away and after how long, and the sound (macOS).

## vitals

A sidebar with cards for the prompt cache, context use, spend and today's usage (from [ccusage](https://github.com/ryoppippi/ccusage)), the files edited this session (open them in [Zed](https://zed.dev)), and background tasks. A pixel claw in the header reacts to how the session is going.

`/vitals` shows or hides the sidebar. It opens by itself when a session starts in the fullscreen layout at 144 columns or wider.

Pixel graphics need kitty or Ghostty; other terminals get coloured text. Usage figures run `pnpx ccusage` by default; set the ccusage command option to `npx -y ccusage@20` or `ccusage` instead.

Options: open on start, sidebar width, Zed CLI path, ccusage command and refresh interval, graphics mode, the claw, and animations.

## Developing

Run a mod from its folder:

```
claude --plugin-dir ./claude-vitals
```

Check and test it:

```
claude plugin validate .
claude plugin test cache-countdown
claude plugin test claude-vitals
```

`claude-vitals/tools/claw.py` draws the claw sprites in `claude-vitals/hooks/graphics/claw-art.ts`.

## License

[MIT](LICENSE)
