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
import { createHash } from "node:crypto";
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
  { id: "bunny", game: "bunny.game.ts", title: "Bunny Lab" },
  { id: "test-room", game: "test-room.game.ts", title: "Test Room" },
  { id: "showcase", game: "showcase.game.ts", title: "Showcase" },
  { id: "studio", game: "studio.game.ts", title: "Studio" },
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

/** Per demo: what its compile depends on (the engine module and the game's bundle), written into its page as `data-build`. */
const builds: Record<string, string> = {};
for (const d of DEMOS) {
  cpSync(join(here, "pages", d.id), join(out, d.id), { recursive: true });
  const b = await bundleGame(join(here, "games", d.game), join(out, d.id, "game.js"));
  builds[d.id] = createHash("sha1").update(gz).update(readFileSync(join(out, d.id, "game.js"))).digest("hex").slice(0, 10);
  const page = join(out, d.id, "index.html");
  writeFileSync(page, readFileSync(page, "utf8").replace(/<body /, `<body data-build="${builds[d.id]}" `));
  console.log(`${d.id}: game ${(b.bytes / 1024).toFixed(0)} KiB`);
}

if (!existsSync(join(repoRoot, FILES[2][1]))) {
  execFileSync(process.execPath, [join(repoRoot, "tools/fetch-polyhaven.ts"), "--res", "1k", "--textures", "", "--models", "fire_hydrant"], { cwd: repoRoot, stdio: "inherit" });
}
for (const [to, from] of FILES) {
  mkdirSync(dirname(join(out, to)), { recursive: true });
  copyFileSync(join(repoRoot, from), join(out, to));
}

const cards = DEMOS.map((d) => `    <a href="${d.id}/"><b>${d.title}</b></a>`).join("\n");
writeFileSync(
  join(out, "index.html"),
  readFileSync(join(here, "pages/index.html"), "utf8").replace("<!--CARDS-->", cards),
);
writeFileSync(join(out, ".nojekyll"), "");
console.log(`demos: ${out.replace(repoRoot + "/", "")}`);

if (args.includes("--serve")) {
  const port = Number(args[args.indexOf("--serve") + 1]);
  console.log(`serving ${await serve(out, Number.isFinite(port) ? port : 8787)} (Ctrl-C stops it)`);
}
