// Draws the Studio's neon sign texture (demos/assets/studio/neon-sign.png: 2048 x 395, transparent, a cream fill with a warm
// outline and glow) in Chrome with the self-hosted Rubik.   node demos/tools/make-sign.mjs [text]
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
const { chromium } = await import(pathToFileURL(root + "node_modules/playwright-core/index.mjs").href);
const text = process.argv[2] ?? "THREERT";
const font = pathToFileURL(root + "demos/fonts/rubik-latin-wght-normal.woff2").href;
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 2048, height: 395 } });
mkdirSync(root + "out", { recursive: true });
writeFileSync(root + "out/sign.html", `<style>@font-face{font-family:R;src:url("${font}");font-weight:300 900}body{margin:0;background:transparent}</style><canvas id=c width=2048 height=395></canvas>`);
await page.goto(pathToFileURL(root + "out/sign.html").href);
const png = await page.evaluate(async (text) => {
  await document.fonts.load('500 236px R');
  const c = document.getElementById("c"), g = c.getContext("2d");
  g.font = '500 236px R';
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  g.lineJoin = "round";
  g.letterSpacing = "22px";
  const m = g.measureText(text);
  const x = 1024, y = 197 + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
  g.shadowColor = "rgba(255,150,100,0.85)"; g.shadowBlur = 28;
  g.strokeStyle = "#ffb28a"; g.lineWidth = 14; g.strokeText(text, x, y);
  g.shadowBlur = 0;
  g.strokeStyle = "#ffb28a"; g.lineWidth = 14; g.strokeText(text, x, y);
  g.fillStyle = "#fff0e0"; g.fillText(text, x, y);
  g.strokeStyle = "#fff0e0"; g.lineWidth = 3; g.strokeText(text, x, y);
  return c.toDataURL("image/png").split(",")[1];
}, text);
writeFileSync(fileURLToPath(new URL("../assets/studio/neon-sign.png", import.meta.url)), Buffer.from(png, "base64"));
await browser.close();
console.log("wrote neon-sign.png:", text);
