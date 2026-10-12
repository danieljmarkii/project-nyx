---
paths:
  - "widgets/**"
  - "lib/widget*.ts"
---
# Home Screen Widget layouts.

Loaded when a session reads a file under these paths. Each rule keeps its guard and its pointer into `docs/engineering-lessons.md`; a guarded rule fails CI wherever its text lives. Same standing as `CLAUDE.md` (Tier 1).

- **Widget layouts (`widgets/*.tsx`, 2026-07-24, widget PR W5):** a `'widget'`-directive function is **not** a React component and does **not** run in the app process — babel-preset-expo stringifies it and the iOS widget extension evaluates that string in a bare JavaScriptCore context whose only globals are `@expo/ui/swift-ui`, its modifiers, and a JSX shim. So: **no imports are in scope at runtime** (a theme token, a helper, anything module-scope, is a ReferenceError on device — inline it inside the function), **no filesystem and no network** (a press returns a props patch; capture goes through the outbox in `lib/widgetBridge.ts`, never a direct write), and a **dynamic child list must be passed as one flat array expression** (the native child walker drops nested arrays). Every widget layout gets a test that evaluates its emitted string in a stand-in of that context (`widgets/CulpritWidget.test.ts`) — that eval, not review, is what keeps the constraint honest.
