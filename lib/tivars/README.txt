Vendored Emscripten build of tivars_lib_cpp (TI variable file / TI-BASIC tokenizer).

- tivars_test.js is from the zText project (MIT): https://github.com/TI-Planet/zText
- Underlying library: tivars_lib_cpp (MIT): https://github.com/adriweb/tivars_lib_cpp

See LICENSE-tivars_lib_cpp for the library license.

GitHub Pages: a `.nojekyll` file at the repo root disables Jekyll so this folder is served as static files. Relative `lib/tivars/` is resolved against `document.baseURI` so project sites (`/repo-name/`) load the tokenizer correctly. Override with `window.TIVARS_LIB_BASE` if needed.
