<div align="center">
  <strong>dotagents</strong>
  <br />
  <em>One canonical .agents folder that powers all your AI tools.</em>

  <br /><br />
  <em>
    Simple setup • One source of truth • Safe to re-run anytime
  </em>
</div>

## Quick Start

Requirements: Bun 1.3+.

Run the guided TUI:
```bash
npx @iannuttall/dotagents
```

Or with Bun:
```bash
bunx @iannuttall/dotagents
```

Choose a workspace (Global home or Project folder) and follow the prompts. You can run it again anytime to add skills/plugins or repair links.

Global home affects all projects. Project folder only affects the current directory you run dotagents from.

## What it does

- Keeps `.agents` as the source of truth.
- Creates symlinks for Claude, Codex, and Factory.
- Installs skills from a local path, git URL, or HTTPS URL.
- Installs plugins from marketplaces.

## Where it links

`.agents/AGENTS.md` → `~/.claude/CLAUDE.md`

`.agents/commands` → `~/.claude/commands`

`.agents/commands` → `~/.factory/commands`

`.agents/commands` → `~/.codex/prompts`

`.agents/hooks` → `~/.claude/hooks`

`.agents/hooks` → `~/.factory/hooks`

`.agents/skills` → `~/.claude/skills`

`.agents/skills` → `~/.factory/skills`

## Development

Run the TUI in dev mode:
```bash
bun run dev
```

Type-check:
```bash
bun run type-check
```

Run tests:
```bash
bun test
```

Build the CLI:
```bash
bun run build
```

## Notes

- Codex prompts always symlink to `.agents/commands` (canonical source).
- Skills require a valid `SKILL.md` with `name` + `description` frontmatter.

## License

MIT
