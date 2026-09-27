---
id: CF-40
title: Find why two board tests failed once and passed on rerun
status: To Do
assignee: []
created_date: '2026-09-27 06:51'
labels: []
dependencies: []
priority: Low
type: bug
ordinal: 67000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by the CF-26 coder. Two intermittent failures at 7d857f6 on cf-26-27-completed-edit, each failing once and passing on rerun at the same commit:

- content-store.test.ts "refreshes completed identity state when the completed corpus changes" (watcher timeout).
- dependency.test.ts "accepts an archived task as a dependency at create and edit time" (archiveTask(...).success false), beside leaked jsdom dispatchEvent / "fetch() URL is invalid" errors from a web test (App.tsx:649, TaskDetailsModal.tsx:1106) that the baseline shows too.

Neither touches the code CF-26 changed, but that is shown only by the code paths involved, not by a test.
<!-- SECTION:DESCRIPTION:END -->
