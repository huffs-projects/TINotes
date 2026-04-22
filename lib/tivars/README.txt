Vendored Emscripten build of tivars_lib_cpp (TI variable file / TI-BASIC tokenizer).

- Underlying library: tivars_lib_cpp (MIT): https://github.com/adriweb/tivars_lib_cpp
- tivars_wasm.js and tivars_wasm.wasm are vendored from tivars_lib_cpp upstream:
  https://github.com/adriweb/tivars_lib_cpp/blob/master/TIVarsLib.js
  https://github.com/adriweb/tivars_lib_cpp/blob/master/TIVarsLib.wasm
  (renamed locally from TIVarsLib.* to tivars_wasm.*)

See LICENSE-tivars_lib_cpp for the library license.

GitHub Pages: a `.nojekyll` file at the repo root disables Jekyll so this folder is served as static files. Relative `lib/tivars/` is resolved against `document.baseURI` so project sites (`/repo-name/`) load the tokenizer correctly. Override with `window.TIVARS_LIB_BASE` if needed.

Runtime mode: WASM-only. The app no longer falls back to asm.js tokenizer runtime.

Upstream Emscripten build command (from Makefile.emscripten):
  em++ -O3 -flto -std=c++2a -DTH_GDB_SUPPORT=1 -Ivendor/pugixml -W -Wall -Wextra -flto --bind -s WASM=1 -s MODULARIZE=1 -s EXPORT_ES6=1 -s EXPORT_NAME="'TIVarsLib'" -s NO_EXIT_RUNTIME=1 -s ASSERTIONS=0 -s DISABLE_EXCEPTION_CATCHING=1 -s EXPORTED_RUNTIME_METHODS="['FS']" --embed-file ti-toolkit-8x-tokens.xml <sources...> -o TIVarsLib.js
