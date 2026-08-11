# Historical H4 comparison archive result

Historical phase-exit archive:
`apps/lynxtron/evidence/2026-08-04/H8/comparison.html`

Historical H4 archive:
`apps/lynxtron/evidence/2026-08-04/H4/comparison.html`

Source:
`apps/lynxtron/evidence/manifests/main-shell.json`

The H4 verification below is historical:

- 7 manifest states;
- 21 Web/Lynx/Native frame slots;
- 2 retained Browser images loaded at exact 1280×820;
- 19 explicit missing/pending slots;
- 1 visible `visual-gap`;
- 3 filters;
- state filtering reduced the gallery from 7 cases to 1;
- lightbox exists and keyboard handlers are installed;
- assertions and console links are generated from manifest paths.

The archive has no overall PASS label. It reports retained, incomplete, gap
and invalid states independently.

The H8 archive was generated from the historical 39-state manifest. It is not
tracked as final5 authority. Current review starts from the small planning
manifest, which has no retained images and 18 required pending cells.

## Evidence provenance

The gallery now resolves every image path against Git and shows one of:

- `archived`: the artifact is tracked and byte-identical to `HEAD`;
- `tracked-modified`: Git tracks the path, but the current bytes are not archived;
- `untracked`: the artifact exists only in the working tree;
- `missing` or `outside-repository`.

`retained` describes the manifest's evidence role. It does not imply that the
artifact is archived. Use `pnpm evidence:verify:archived` for a phase-exit gate;
the normal verifier reports non-archived retained artifacts as warnings so
diagnostic and in-progress manifests remain usable.

The verifier also compares image bytes, not only paths. Copying one frame to a
new filename cannot satisfy two mutually exclusive states unless the later
entry explicitly sets `allowEvidenceReuse`.

### 2026-08-11 integrity outcome

Running the new checks against `main-shell.json` found two concrete evidence
integrity failures:

- all 78 retained image paths existed only in the working tree, although the
  gallery previously exposed no distinction between local and archived files;
- four duplicate-byte groups spanned 12 manifest entries. Eight later entries
  incorrectly claimed distinct model-picker or review states.

The eight false retained cells were made explicit in the historical working
manifest. Archaeology did not promote the remaining 70 old images: their
bundles predate final5, and one linked Native log was missing. The current
manifest therefore contains no retained pixels.
