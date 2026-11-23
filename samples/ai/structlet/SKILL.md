---
name: structlet
description: Create or update editable Structlet architecture diagrams from requirements, repositories, or infrastructure definitions and produce a validated .structlet file.
---

# Build a Structlet diagram

1. Read [the Structlet draft contract](references/prompt-en.md). Use the user's language for diagram labels. Use [the service catalog](references/services.tsv) to select built-in icon IDs when available.
2. Use the supplied requirements and authorized project files. Identify grouping boundaries and actual service connections before writing the draft. Include equipment specs where confirmed. Keep cloud credentials, tokens, and secret values out of the diagram.
3. For a new diagram, omit coordinates so Structlet can lay it out. For a revision, read the existing `.structlet` file, use its exact object IDs, and include only the requested changes. Include `remove` only for explicitly requested deletions.
4. Write a strict JSON draft. Run the compiler from this skill's directory with paths resolved to the draft and the requested output.

```sh
node /path/to/structlet/scripts/compile.mjs architecture.draft.json architecture.structlet
node /path/to/structlet/scripts/compile.mjs update.draft.json revised.structlet --base existing.structlet
```

The ZIP includes the standalone compiler. It runs with Node.js 22+, validates through Structlet's importer, lays out new objects, and saves a new file. If it reports a validation error, correct the draft and retry. Report the resulting `.structlet` path once validation succeeds.

When the compiler is unavailable, deliver the draft as a JSON file or raw JSON. Use **User guide → Build a diagram with AI** to convert a new draft, or **File → Import** with the existing diagram open for an update. Save the result as `.structlet`.
