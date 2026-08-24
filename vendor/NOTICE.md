# Third-party notice

`aac.js` and `aac.wasm` are based on:

- **aac-wasm-decoder** by Sunqi: https://github.com/sunqibuhuake/aac-wasm-decoder
- Upstream commit used: `ad352ea5e9e35a21dafb9d26b0381b50fccf6bf6`
- **FAAD2 2.7**, whose corresponding source archive is included at `source/aac-wasm-decoder/faad2-2.7.tar.gz`.

The generated `aac.js` was changed only so `aac.wasm` is resolved relative to the script URL, which is required when the player runs in an inherited `about:blank` origin. The wrapper/build source and patchable inputs are mirrored under `source/aac-wasm-decoder/`.

FAAD2's license text extracted from the source archive is at `source/aac-wasm-decoder/FAAD2-COPYING`. Third-party components are not covered by the root MIT license. The upstream wrapper repository did not contain a top-level license file at the pinned commit; review upstream rights and obligations before redistributing a public fork.
