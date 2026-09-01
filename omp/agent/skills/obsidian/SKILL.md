---
name: obsidian
description: Interact with Obsidian vault via Local REST API MCP — read, write, search, edit notes, execute commands, and manage files.
allowed-tools: Bash(obsidian:*) obsidian_vault_read obsidian_vault_write obsidian_vault_append obsidian_vault_patch obsidian_vault_delete obsidian_vault_move obsidian_vault_copy obsidian_vault_list obsidian_vault_get_document_map obsidian_search_simple obsidian_search_query obsidian_tag_list obsidian_command_list obsidian_command_execute obsidian_open_file obsidian_active_file_get_path
---

# Obsidian Vault Interaction via MCP

MCP server: `http://127.0.0.1:27123/mcp/` (Local REST API with MCP plugin).

## Tools

### File CRUD

**`obsidian_vault_read`** — Full file content + metadata
```json
{ "path": "folder/note.md" }
// Returns: { content, frontmatter, tags, stat, links, backlinks, unresolvedLinks }
```

**`obsidian_vault_list`** — List directory contents
```json
{ "path": "folder/" }
// Returns: { files: ["note.md", "subdir/"] }
```

**`obsidian_vault_write`** — Create or overwrite a file
```json
{ "path": "new-note.md", "content": "# Title\n\nContent here" }
```

**`obsidian_vault_append`** — Append to end of file
```json
{ "path": "log.md", "content": "\n- New item" }
```

**`obsidian_vault_delete`** — Move to trash (or permanent)
```json
{ "path": "old-note.md" }
// { "path": "old-note.md", "permanent": true } — permanent delete
```

**`obsidian_vault_move`** — Rename/move a file
```json
{ "path": "old-name.md", "destination": "new-folder/new-name.md" }
```

**`obsidian_vault_copy`** — Copy a file
```json
{ "path": "source.md", "destination": "dest.md" }
```

### Document Map (Headings, Blocks, Frontmatter)

**`obsidian_vault_get_document_map`** — Get structure before patching
```json
{ "path": "note.md" }
// Returns: { headings: {...}, blocks: [...], frontmatterFields: [...], version: "hash" }
```
Always call this before patching to discover available headings and block IDs.

### Patching (Surgical Edits)

**`obsidian_vault_patch`** — Edit a specific heading, block, or frontmatter field

Core fields: `path`, `targetType` ("heading"|"block"|"frontmatter"), `target`, `operation` ("replace"|"prepend"|"append"|"delete"), `scope` ("content"|"marker"|"markerAndContent"|"parent")

Payload: `content` (string for markdown), `value` (JSON for frontmatter), or `destination` (for heading moves)

```json
// Replace heading content
{ "path": "note.md", "targetType": "heading", "target": ["Section 1"], "operation": "replace", "content": "New content" }

// Append to a heading
{ "path": "note.md", "targetType": "heading", "target": ["Log"], "operation": "append", "content": "\n- New log entry" }

// Replace frontmatter field
{ "path": "note.md", "targetType": "frontmatter", "target": "status", "operation": "replace", "value": "done" }

// Delete a heading and its content
{ "path": "note.md", "targetType": "heading", "target": ["Obsolete"], "operation": "delete" }

// Add new heading with content (createTargetIfMissing)
{ "path": "note.md", "targetType": "heading", "target": ["New Section"], "operation": "append", "content": "Content here", "createTargetIfMissing": true }

// Rename heading (scope=marker)
{ "path": "note.md", "targetType": "heading", "target": ["Old Name"], "operation": "replace", "scope": "marker", "content": "New Name" }

// Continue list within a block (within=-1 = last block under heading)
{ "path": "note.md", "targetType": "heading", "target": ["Tasks"], "within": -1, "operation": "append", "content": "\n- New task" }

// Optimistic concurrency (ifMatch from vault_get_document_map version)
{ "path": "note.md", "targetType": "heading", "target": ["Section"], "operation": "replace", "content": "Updated", "ifMatch": "abc123" }
```

Nodes and scopes:
- `scope: "content"` (default) — the heading's body / content of a block
- `scope: "marker"` — just the label (heading text, block id, frontmatter key)
- `scope: "markerAndContent"` — full node including label (for prepend/append siblings)
- `scope: "parent"` — move a heading (use `destination` field)

### Search

**`obsidian_search_simple`** — Full-text search
```json
{ "query": "project deadline", "contextLength": 100 }
// Returns: [{ filename, score, matches: [{ text, context }] }]
```

**`obsidian_search_query`** — Structured JsonLogic search
```json
{
  "query": {
    "and": [
      { "in": ["active", { "var": "tags" }] },
      { "==": [{ "var": "frontmatter.status" }, "in-progress"] }
    ]
  }
}
```
Available fields: `path`, `content`, `tags`, `frontmatter.*`, `stat.ctime`, `stat.mtime`, `stat.size`, `links`, `backlinks`
Operators: `==`, `!=`, `in`, `<`, `>`, `<=`, `>=`, `and`, `or`, `!`, `if`, `glob`, `regexp`

### Tags & Commands

**`obsidian_tag_list`** — All tags with usage counts
```json
{}
```

**`obsidian_command_list`** — All registered Obsidian commands
```json
{}
```

**`obsidian_command_execute`** — Run a command by ID
```json
{ "commandId": "daily-notes" }
```

### Active File & Navigation

**`obsidian_active_file_get_path`** — Path of currently open file
```json
{}
```

**`obsidian_open_file`** — Open file in Obsidian UI
```json
{ "path": "note.md" }
// { "path": "note.md", "newLeaf": true } — open in new pane
```

## Patterns

### Create a new daily note
```
1. vault_list "" → check folder structure
2. vault_write "daily/2026-07-29.md" with template content
3. open_file "daily/2026-07-29.md"
```

### Read note with specific section
```
1. vault_get_document_map "note.md" → find heading paths
2. vault_read with targetType="heading", target=["Section Name"]
```

### Update task list in place
```
1. vault_get_document_map "tasks.md" → find "Tasks" heading, get version
2. vault_patch with within=-1 to append to last list block
```

### Find notes by tag or frontmatter
```
1. search_query with JsonLogic filtering on tags or frontmatter fields
2. vault_read each matching file
```

### Batch rename/restructure
```
1. search_query or vault_list to find files
2. vault_move/vault_copy each file to new location
3. vault_patch to update internal links if needed
```

### Execute Obsidian command
```
1. command_list → find command ID
2. command_execute with that ID
```

## Tips

- Always call `vault_get_document_map` before `vault_patch` to discover headings and get the version for `ifMatch`
- Use `createTargetIfMissing: true` when appending to a heading that might not exist yet
- `within` index is 0-based, negative counts from end (-1 = last block)
- Heading levels in `content` are relative to target (`# Child` becomes a direct child, not root level)
- Whitespace in content is library-owned — `\n- item` with `within` to extend a list
- Use `read_mcp_resource` with `server: "obsidian"`, `uri: "obsidian://local-rest-api/openapi.yaml"` for full API reference
