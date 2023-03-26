## Notes

This project uses some unstable flags to compile to wasm (shared memory, simd, etc.). In order to compile this project you will need the [nightly toolchain](https://doc.rust-lang.org/book/appendix-07-nightly-rust.html) for [Rust](#https://www.rust-lang.org/):

`rustup toolchain install nightly && rustup override set nightly`

and then compile with [wasm-pack](https://rustwasm.github.io/wasm-pack/):

`wasm-pack build -t web --release`

or use the build script `build.sh` if you're on a linux system.