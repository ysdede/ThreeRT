# Demos

Browser demos of the engine, built and published from this folder.

| Page | Game | What it shows |
| --- | --- | --- |
| `bunny/` | `games/bunny.game.ts` | Stanford Bunny with metal, glass and frosted glass under a ring light; the window, sky reflections and the glass's caustics are traced |
| `test-room/` | `games/test-room.game.ts` | A checker room with a chrome sphere, a glass sphere, a turbine and one lamp |
| `showcase/` | `games/showcase.game.ts` | A lit street corner with every render buffer one click away |
| `studio/` | `games/studio.game.ts` | A neon sign in a dark studio |

Every page has controls that change the traced image: material parameters, light power, bounces, render scale, view modes
(albedo, normals, direct, diffuse, specular, raw sample, history).

## Build

```bash
npm ci
node demos/build.ts             # out/demos: the engine module, the pages, the files the scenes read
node demos/serve.ts out/demos 8100
```

Needs the wasm32 target and the wasm-bindgen CLI of the version in `renderer/web/Cargo.toml` (see `tools/build-web.ts`).
`node demos/build.ts --skip-cargo` reuses the last `cargo build`. The Showcase's Poly Haven hydrant (CC0) is fetched on the
first build by `tools/fetch-polyhaven.ts`.

`.github/workflows/demos.yml` builds the same folder on every push to `main` that touches it and publishes it with GitHub Pages.

## Layout

- `build.ts`, `serve.ts`: the build and a static server for it.
- `www/main.ts`: the page script (the engine's `renderer/web/www/main.ts` plus loading stages, scene files and the
  diagnostics `setRays`, `setViewMode`, `setBounces`, `setScale`). `www/loader.js`: the loading overlay and the compute
  pipelines' background compile.
- `pages/<demo>/index.html`: one page per demo. `games/`: the scenes. `assets/`: the files the scenes read (the bunny
  from the Draco sample in the `draco3d` package, `tools/make-bunny.mjs`; the neon sign textures). `fonts/`: Rubik.

## First visit

The browser compiles the engine's compute shaders on the first visit of a page. One of the 47, the path tracing kernel, takes
all of the time: 25-47 s on Windows with Direct3D 12 (an RTX A6000, Chrome 157; the scene's features set how big the kernel
is), a few seconds once the browser has compiled it. `www/loader.js` creates the pipelines with
`createComputePipelineAsync`, so the page stays alive meanwhile (the animation frames stall once, for 0.7-2.3 s at the start;
a plain `createComputePipeline` stalled them for the whole compile) and the overlay shows the count of shaders
compiled. `?syncpipelines` on a page's address turns that off.
