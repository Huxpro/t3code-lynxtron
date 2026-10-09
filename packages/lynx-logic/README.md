# @t3tools/lynx-logic

Renderer-neutral logic owned by the Lynx client: the projections it renders
from (transcript rows, composer state, sidebar rows, settings fields) and the
small state machines it shares between its app, connector, and browser preview.
Nothing in upstream code imports this package; see
`apps/lynxtron/docs/architecture.md`.
