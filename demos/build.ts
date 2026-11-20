// Builds the demo pages into out/demos: one engine module (wasm + its JavaScript), one page script and loader shared by
// every demo, each demo's game bundle and page, and the files the scenes name.
//
//   node demos/build.ts [-o out/demos] [--skip-cargo] [--serve [port]]
//
// Needs what tools/build-web.ts needs (the wasm32 target, the wasm-bindgen CLI of renderer/web/Cargo.toml's version) and
// `npm ci`. The Showcase's Poly Haven hydrant is fetched into assets/polyhaven when it is not there (tools/fetch-polyhaven.ts).
import { execFileSync } from "node:child_process";
import { build } from "esbuild";
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { gzipSync } from "node:zlib";
import { dirname, join, resolve } from "node:path";
import { bundleGame, repoRoot } from "../tools/bundle-game.ts";
import { serve } from "./serve.ts";

const here = import.meta.dirname;
const args = process.argv.slice(2);
const out = resolve(args.includes("-o") ? args[args.indexOf("-o") + 1] : join(repoRoot, "out/demos"));
const crate = join(repoRoot, "renderer/web");

/** The demos: the page's folder under demos/pages and the game it runs. */
export const DEMOS = [
  { id: "bunny", game: "bunny.game.ts", title: "Bunny Lab", text: "Stanford Bunny among metal, glass and frosted glass under a ring light, with caustics." },
  { id: "test-room", game: "test-room.game.ts", title: "Test Room", text: "A checker room with a chrome sphere, a glass sphere, a turbine gear and one lamp." },
  { id: "showcase", game: "showcase.game.ts", title: "Showcase", text: "A lit street corner, every render buffer one click away." },
  { id: "studio", game: "studio.game.ts", title: "Studio", text: "A neon sign in a dark studio, traced live." },
];

/** What the scenes name, as the path the scene uses -> where it is in the repo. */
const FILES: [string, string][] = [
  ["ThreeRT/assets/models/stanford_bunny.glb", "demos/assets/models/stanford_bunny.glb"],
  ["studio/assets/neon-sign.png", "demos/assets/studio/neon-sign.png"],
  ["ThreeRT/assets/polyhaven/models/fire_hydrant_1k.glb", "assets/polyhaven/models/fire_hydrant_1k.glb"],
];

const BINDGEN = /wasm-bindgen = "=([\d.]+)"/.exec(readFileSync(join(crate, "Cargo.toml"), "utf8"))![1];
function bindgen(): string {
  const local = join(homedir(), ".cargo/bin/wasm-bindgen");
  const bin = existsSync(local) || existsSync(local + ".exe") ? local : "wasm-bindgen";
  let version = "";
  try {
    version = execFileSync(bin, ["--version"], { encoding: "utf8" }).trim().split(" ").pop() ?? "";
  } catch {}
  if (version !== BINDGEN) throw new Error(`wasm-bindgen ${BINDGEN} is needed (found ${version || "none"}): cargo install wasm-bindgen-cli --version ${BINDGEN} --locked`);
  return bin;
}

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "pkg"), { recursive: true });

if (!args.includes("--skip-cargo")) {
  execFileSync("cargo", ["build", "--release", "--locked", "--target", "wasm32-unknown-unknown"], { cwd: crate, stdio: ["ignore", "inherit", "inherit"] });
}
execFileSync(bindgen(), ["--target", "web", "--no-typescript", "--out-dir", join(out, "pkg"), join(crate, "target/wasm32-unknown-unknown/release/threert_web.wasm")], { stdio: ["ignore", "ignore", "inherit"] });
const wasmFile = join(out, "pkg/threert_web_bg.wasm");
const gz = gzipSync(readFileSync(wasmFile), { level: 9 });
writeFileSync(wasmFile + ".gz", gz);
rmSync(wasmFile);
console.log(`engine module ${(gz.length / 1048576).toFixed(1)} MiB gzip`);

await build({ entryPoints: [join(here, "www/main.ts")], bundle: true, format: "esm", target: "es2022", outfile: join(out, "main.js"), nodePaths: [join(repoRoot, "node_modules")], logLevel: "warning" });
copyFileSync(join(here, "www/loader.js"), join(out, "loader.js"));
cpSync(join(here, "fonts"), join(out, "fonts"), { recursive: true });

for (const d of DEMOS) {
  cpSync(join(here, "pages", d.id), join(out, d.id), { recursive: true });
  const b = await bundleGame(join(here, "games", d.game), join(out, d.id, "game.js"));
  console.log(`${d.id}: game ${(b.bytes / 1024).toFixed(0)} KiB`);
}

if (!existsSync(join(repoRoot, FILES[2][1]))) {
  execFileSync(process.execPath, [join(repoRoot, "tools/fetch-polyhaven.ts"), "--res", "1k", "--textures", "", "--models", "fire_hydrant"], { cwd: repoRoot, stdio: "inherit" });
}
for (const [to, from] of FILES) {
  mkdirSync(dirname(join(out, to)), { recursive: true });
  copyFileSync(join(repoRoot, from), join(out, to));
}

const cards = DEMOS.map((d) => `    <a href="${d.id}/"><b>${d.title}</b><span>${d.text}</span></a>`).join("\n");
writeFileSync(
  join(out, "index.html"),
  `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>ThreeRT demos</title>
<style>
  @font-face { font-family: "Rubik"; src: url("fonts/rubik-latin-wght-normal.woff2") format("woff2"); font-weight: 300 900; }
  html, body { margin: 0; min-height: 100%; background: #191919; color: #eee; font: 14px/1.45 "Rubik", system-ui, sans-serif; }
  main { max-width: 760px; margin: 0 auto; padding: 48px 16px; }
  h1 { font-size: 22px; font-weight: 600; margin: 0 0 24px; }
  nav { display: grid; gap: 10px; }
  a { display: grid; gap: 2px; padding: 14px 16px; border: 1px solid #2d2d2d; border-radius: 8px; color: inherit; text-decoration: none; background: #202020; }
  a:hover, a:focus-visible { border-color: #de864f; outline: none; }
  a b { font-weight: 600; }
  a span { color: #9a9a9a; }
</style>
</head>
<body>
<main>
  <h1>ThreeRT demos</h1>
  <nav>
${cards}
  </nav>
</main>
</body>
</html>
`,
);
writeFileSync(join(out, ".nojekyll"), "");
console.log(`demos: ${out.replace(repoRoot + "/", "")}`);

if (args.includes("--serve")) {
  const port = Number(args[args.indexOf("--serve") + 1]);
  console.log(`serving ${await serve(out, Number.isFinite(port) ? port : 8787)} (Ctrl-C stops it)`);
}
