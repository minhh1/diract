<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes -- APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# No em dashes

Never use the em dash character (Unicode U+2014) anywhere in this codebase -- not in UI copy, not in code comments, not in commit messages. Use a plain hyphen, a colon, a period, or an ASCII double-hyphen ("--") instead, whichever reads best in context.

In anything user-facing (UI copy, AI-generated chat/document/email output, toast/error messages) -- not code comments or commit messages -- also avoid the ASCII double-hyphen ("--") and a spaced hyphen (" - ") as dash-style separators. Use a comma, colon, period, or just restructure the sentence instead.
