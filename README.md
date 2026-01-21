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

Run the guided CLI:
```bash
npx @iannuttall/dotagents
```

Or with Bun:
```bash
bunx @iannuttall/dotagents
```

Choose a workspace (Global home or Project folder), select the clients you want to manage, and follow the prompts. You can run it again anytime to repair links or undo changes.

Global home affects all projects. Project folder only affects the current directory you run dotagents from.

## What it does

- Keeps `.agents` as the source of truth.
- Creates symlinks for Claude, Codex, Factory, Cursor, OpenCode, and Gemini (based on your selection).
- Always creates a backup before any overwrite so changes are reversible.

## Where it links (global scope)

`.agents/CLAUDE.md` → `~/.claude/CLAUDE.md` (if present)

`.agents/AGENTS.md` → `~/.claude/CLAUDE.md` (fallback when no CLAUDE.md)

`.agents/GEMINI.md` → `~/.gemini/GEMINI.md` (if present)

`.agents/AGENTS.md` → `~/.gemini/GEMINI.md` (fallback when no GEMINI.md)

`.agents/commands` → `~/.claude/commands`

`.agents/commands` → `~/.factory/commands`

`.agents/commands` → `~/.codex/prompts`

`.agents/commands` → `~/.cursor/commands`

`.agents/commands` → `~/.config/opencode/commands`

`.agents/commands` → `~/.gemini/commands`

`.agents/hooks` → `~/.claude/hooks`

`.agents/hooks` → `~/.factory/hooks`

`.agents/AGENTS.md` → `~/.factory/AGENTS.md`

`.agents/AGENTS.md` → `~/.codex/AGENTS.md`

`.agents/AGENTS.md` → `~/.config/opencode/AGENTS.md`

`.agents/skills` → `~/.claude/skills`

`.agents/skills` → `~/.factory/skills`

`.agents/skills` → `~/.codex/skills`

`.agents/skills` → `~/.cursor/skills`

`.agents/skills` → `~/.config/opencode/skills`

`.agents/skills` → `~/.gemini/skills`

Project scope links only commands/hooks/skills into the project’s client folders (no AGENTS/CLAUDE/GEMINI rules).

## Development

Run the CLI in dev mode:
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

- Cursor supports `.claude/commands` and `.claude/skills` (global or project). dotagents also links `.agents/commands` → `.cursor/commands` and `.agents/skills` → `.cursor/skills`.
- OpenCode uses `~/.config/opencode/AGENTS.md` and prefers AGENTS.md over CLAUDE.md when both exist.
- Codex prompts always symlink to `.agents/commands` (canonical source).
- Skills require a valid `SKILL.md` with `name` + `description` frontmatter.
- Claude prompt precedence: if `.agents/CLAUDE.md` exists, it links to `.claude/CLAUDE.md`. Otherwise `.agents/AGENTS.md` is used. After adding or removing `.agents/CLAUDE.md`, re-run dotagents and apply/repair links to update the symlink. Factory/Codex always link to `.agents/AGENTS.md`.
- Gemini context file precedence: if `.agents/GEMINI.md` exists, it links to `.gemini/GEMINI.md`. Otherwise `.agents/AGENTS.md` is used. After adding or removing `.agents/GEMINI.md`, re-run dotagents and apply/repair links to update the symlink.
- Project scope creates `.agents` plus client folders for commands/hooks/skills only. Rule files (`AGENTS.md`/`CLAUDE.md`/`GEMINI.md`) are left to the repo root so you can manage them explicitly.
- Backups are stored under `.agents/backup/<timestamp>` and can be restored via “Undo last change.”

## License

MIT
