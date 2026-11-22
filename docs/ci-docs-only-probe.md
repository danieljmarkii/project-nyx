# CI docs only probe (CUL-2860)

A one-line probe: this commit changes only this doc, so its CI run should skip the timezone
and Deno jobs and run only the suites that read docs. The next commit removes this file.
