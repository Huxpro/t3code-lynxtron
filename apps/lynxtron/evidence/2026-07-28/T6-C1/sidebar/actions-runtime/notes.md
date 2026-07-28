# T6-C1 Sidebar canonical actions — Lynx runtime evidence

The canonical Sidebar actions were driven through
`Input.emulateTouchFromMouseEvent` against the real Lynx nodes on the
`localhost:8903` T3 Code Lynxtron client. Database projection rows were read
after each action; component callbacks were not invoked directly.

## Fixed defect

Before the fix, Rename, Archive, and Delete all resolved to the same zero-height
box. A tap on the visible Rename label therefore reached the overlapping
Delete item. The menu now has an explicit height, every item is a
non-shrinking 30 px row, and the backdrop is a sibling of the menu instead of
an ancestor that can consume child taps.

Lynx DevTool reported three distinct logical boxes:

- Rename: `x=100, y=302, width=142, height=30`
- Archive: `x=100, y=332, width=142, height=30`
- Delete: `x=100, y=362, width=142, height=30`

## Runtime result

- Rename entered the inline rename editor and Save advanced the canonical
  `updated_at` projection.
- Archive wrote `archived_at` and removed the thread from the active list.
- Delete wrote `deleted_at` and removed the thread from the active list.
- Create added a canonical `New thread`.
- After Create collapsed the project preference, the project was expanded
  again and the long-title thread was selected successfully.

The machine-readable values are in `actions-result.json`.

`after-fixed-settled.jpg` is the authoritative final DevTool capture. It was
taken as the first DevTool operation in a fresh Lynxtron process, has a
2560×1640 physical image for the 1280×820 logical viewport, and reports zero
renderer errors.

`after-fixed.jpg` is retained only as diagnostic evidence. It was captured
after repeated DOM inspection on the same desktop session and exhibits the
known one-reliable-screencast-frame limitation; it must not be used for visual
certification.
