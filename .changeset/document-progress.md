---
'@doc-kit/core': minor
'@doc-kit/cli': minor
---

Show parsing and generation progress with stage names, completed item counts,
and file labels in interactive CLI builds. Hide the bar for redirected output
and log levels other than info. The core generator accepts an optional
`onProgress` callback in `createGenerator` options, reporting progress on the
calling thread for both local processing and worker tasks.
