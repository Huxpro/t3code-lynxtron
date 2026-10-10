// Upstream modules the main process typechecks through `src/shared` read
// browser globals behind a `typeof` test. Node has none of them; these
// declarations say so, without the DOM library.
declare var location: { readonly protocol: string } | undefined;
