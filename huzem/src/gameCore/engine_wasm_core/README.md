## README

In order to compile this project correctly the [nightly toolchain](https://doc.rust-lang.org/book/appendix-07-nightly-rust.html) for [Rust](https://www.rust-lang.org/) is needed. 

After installing the [Rust Toolchain](https://www.rust-lang.org/tools/install) run this command in the root directory:

`rustup toolchain install nightly && rustup override set nightly`

and then compile with:

`node ./build.mjs`

The build script requires that you have [wasm-pack](https://rustwasm.github.io/wasm-pack/installer/#) installed.