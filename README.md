# pi-fzf

A [Pi](https://github.com/badlogic/pi) extension for fuzzy finding. Define commands that list candidates from any shell command, then perform actions on the selected item—fill the editor, send to the agent, or run shell commands.

> **Fork of [kaofelix/pi-fzf](https://github.com/kaofelix/pi-fzf)** — original by [@kaofelix](https://github.com/kaofelix). This fork adds YAML config, `bkt` caching, and rendering fixes.

## Installation

```bash
pi install github.com/indigoviolet/pi-fzf
```

## Dependencies

- [`fd`](https://github.com/sharkdp/fd) — fast file finding (used in examples)
- [`bkt`](https://github.com/dimo414/bkt) — subprocess caching (optional, for the `cache` feature)
- [`bat`](https://github.com/sharkdp/bat) — syntax-highlighted file preview (optional)

## Configuration

Create a config file to define your commands:

- `~/.pi/agent/fzf.yaml` — global commands
- `<project>/.pi/fzf.yaml` — project-specific (overrides global)

Each command has a `list` (shell command that outputs candidates) and an `action` (what to do with the selection):

```yaml
commands:
  file:
    list: fd --type f --max-depth 4
    action: "Read and explain {{selected}}"
```

This registers `/fzf:file` in Pi. The `{{selected}}` placeholder is replaced with the chosen candidate.

### Keyboard Shortcuts

Add a `shortcut` field to trigger a command via a keyboard shortcut instead of typing `/fzf:<name>`:

```yaml
commands:
  file:
    list: fd --type f --max-depth 4
    action: "Read and explain {{selected}}"
    shortcut: ctrl+shift+f
```

The shortcut format follows Pi's [keybinding syntax](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/keybindings.md#key-format): `modifier+key` where modifiers are `ctrl`, `shift`, `alt` (combinable).

### Caching

Add a `cache` field to cache the `list` output via [bkt](https://github.com/dimo414/bkt). The command runs once, and subsequent invocations serve the cached result instantly. Use `stale` to refresh in the background after a duration while still serving the cached result immediately.

```yaml
commands:
  sym:
    list: ctags -R ... | jq -r '...'
    cache:
      ttl: 5m       # cache valid for 5 minutes
      stale: 2m     # refresh in background after 2 minutes
      cwd: true     # include cwd in cache key (default: true)
```

This is equivalent to wrapping the command with `bkt --ttl 5m --stale 2m --cwd -- bash -c '...'`, but without the quoting nightmare.

### Selector Placement

Control where the selector renders:

- Per-command via `placement`
- Globally via top-level `defaultPlacement`

Allowed values: `overlay` (default), `aboveEditor`, `belowEditor`.

```yaml
defaultPlacement: belowEditor
commands:
  file:
    list: fd --type f --max-depth 4
    action: "Read and explain {{selected}}"
  branch:
    list: "git branch --format='%(refname:short)'"
    action:
      type: bash
      template: git checkout {{selected}}
    placement: aboveEditor
```

### Hide Header

Set `hideHeader: true` to hide the selector title line (`fzf:<name>`).

## Preview Pane

Add a `preview` field with a command template to show a preview pane:

```yaml
commands:
  file:
    list: fd --type f --max-depth 4
    action: "Read and explain {{selected}}"
    preview: bat --style=numbers --color=always {{selected}} 2>/dev/null || cat {{selected}}
```

When `preview` is configured, the selector splits into two panes:
- **Left pane**: Candidate list (35% width)
- **Right pane**: Preview output (65% width)

**Keyboard shortcuts for preview:**
- `Shift+↑` / `Shift+↓` — Scroll preview content (default, configurable)
- Standard navigation keys work in the list pane

### Preview Settings

```yaml
settings:
  previewScrollUp: shift+up
  previewScrollDown: shift+down
  previewScrollLines: 5
```

## Actions

### Editor (default)

Pastes text into the Pi editor at the current cursor position.

```yaml
action: "Explain {{selected}}"
```

Or explicitly:

```yaml
action:
  type: editor
  template: "Explain {{selected}}"
```

### Send

Sends directly to the agent, triggering a turn immediately.

```yaml
action:
  type: send
  template: "Explain {{selected}}"
```

### Bash

Runs a shell command. By default shows the result as a notification.

```yaml
action:
  type: bash
  template: git checkout {{selected}}
```

Add `output` to route the command's stdout elsewhere:

| Output | Behavior |
|--------|----------|
| `notify` | Show as notification (default) |
| `editor` | Paste stdout into the editor at cursor |
| `send` | Send stdout to the agent |

```yaml
action:
  type: bash
  template: cat {{selected}}
  output: editor
```

## Examples

### Override `@` for file selection

```yaml
file:
  list: fd --type f
  action: "@{{selected}}"
  shortcut: "@"
```

### Workspace symbols with ctags

```yaml
sym:
  list: |
    ctags -R \
      --languages=Python,TypeScript \
      --kinds-Python=cfm \
      --kinds-TypeScript=fcimCpv \
      --fields=+KSn \
      --output-format=json \
      --exclude=node_modules --exclude=.venv --exclude=__pycache__ \
      --exclude=dist --exclude=build --exclude=.git \
      -f - . 2>/dev/null \
    | jq -r '
        if .scope then "\(.scope).\(.name)  \(.path):\(.line)"
        else "\(.name)  \(.path):\(.line)"
        end
      '
  cache:
    ttl: 5m
  action:
    type: bash
    template: "selected='{{selected}}'; sym=${selected%%  *}; loc=${selected##*  }; echo \"$sym (@$loc)\""
    output: editor
  preview: |
    selected='{{selected}}'
    loc=${selected##*  }
    f=${loc%%:*}
    l=${loc##*:}
    bat --style=numbers --color=always --highlight-line "$l" \
      --line-range "$((l > 5 ? l - 5 : 1)):$((l + 20))" "$f" 2>/dev/null
  shortcut: "#"
```

### GitHub PRs (yours first)

```yaml
pr:
  list: |
    {
      gh pr list --author=@me --limit 100 --state all \
        --json number,title,author,isDraft,state \
        --jq '.[] | "\(.state)  #\(.number)  \(.title)  @\(.author.login)\(if .isDraft then " [draft]" else "" end)"'
      gh pr list --limit 100 --state all \
        --json number,title,author,isDraft,state \
        --jq '.[] | "\(.state)  #\(.number)  \(.title)  @\(.author.login)\(if .isDraft then " [draft]" else "" end)"'
    } | awk '!seen[$0]++' \
      | awk '/^OPEN/{print "1" $0; next} /^MERGED/{print "2" $0; next} {print "3" $0}' \
      | sort -k1,1 -s \
      | sed 's/^.//'
  cache:
    ttl: 10m
    stale: 2m
  action:
    type: bash
    template: "echo '{{selected}}' | grep -o '#[0-9]*'"
    output: editor
```

### GitHub issues (yours first)

```yaml
issue:
  list: |
    {
      gh issue list --state open --assignee=@me --limit 100 \
        --json number,title,author,labels \
        --jq '.[] | "#\(.number)  \(.title)  @\(.author.login)\(if (.labels | length) > 0 then "  [\(.labels | map(.name) | join(", "))]" else "" end)"'
      gh issue list --state open --limit 100 \
        --json number,title,author,labels \
        --jq '.[] | "#\(.number)  \(.title)  @\(.author.login)\(if (.labels | length) > 0 then "  [\(.labels | map(.name) | join(", "))]" else "" end)"'
    } | awk '!seen[$0]++'
  cache:
    ttl: 10m
    stale: 2m
  action:
    type: bash
    template: "echo '{{selected}}' | grep -o '#[0-9]*'"
    output: editor
```

### Switch git branches

```yaml
branch:
  list: "git branch --format='%(refname:short)'"
  action:
    type: bash
    template: git checkout {{selected}}
  preview: git log --oneline -10 {{selected}}
```

### Load a skill by name

```yaml
skill:
  list: "fd -L 'SKILL.md' ~/.pi/agent/skills ~/.pi/agent/git 2>/dev/null | sed -E 's|.*/skills/([^/]+)/SKILL\\.md|\\1|' | grep -v '/' | sort -u"
  action:
    type: editor
    template: "/skill:{{selected}}"
```

## Usage

1. Type `/fzf:<name>` (e.g., `/fzf:file`) or press the configured shortcut
2. Type to filter candidates
3. Use ↑/↓ to navigate, Enter to select, Escape to cancel
