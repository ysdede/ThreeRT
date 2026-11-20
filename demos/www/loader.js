// Loading overlay for the ThreeRT browser pages. Listens to the page script's events (threert-stage, threert-progress),
// shows the steps with their times, and stays up until the first traced image has really been presented: the engine's
// pipelines compile on the first frames (about a minute on a first visit, a few seconds once the browser has cached
// them) and until then the canvas is blank. Also reports WebGPU being absent, a lost device and GPU errors.
(() => {
  // Compute pipelines are compiled off the browser's GPU thread. The engine creates them with `createComputePipeline`, which
  // makes the GPU process compile every one in turn on its main thread, the thread that also draws every page of the
  // browser: the screen stands still for as long as that takes (about a minute on a first visit). `createComputePipelineAsync`
  // compiles on worker threads, so here the engine gets a stand-in at once and the real pipeline replaces it when it is
  // ready. Until then a compute pass that would use a stand-in is skipped (the page's script does not run frames before
  // `threertPipelinesReady` resolves, so nothing is drawn from a skipped pass). Pipelines with an automatic layout are
  // made as before: the engine reads their bind group layouts straight away.
  const pipes = (window.threertPipelines = { total: 0, ready: 0, failed: 0, skipped: 0, errors: [], async: false });
  const pipesChanged = () => window.dispatchEvent(new CustomEvent("threert-pipelines"));
  if (window.GPUDevice?.prototype.createComputePipelineAsync && window.GPUComputePassEncoder && !new URLSearchParams(location.search).has("syncpipelines")) {
    pipes.async = true;
    const device = GPUDevice.prototype, pass = GPUComputePassEncoder.prototype;
    const createSync = device.createComputePipeline;
    const standIns = new WeakMap();
    const skipping = new WeakSet();
    device.createComputePipeline = function (desc) {
      if (!desc || desc.layout === "auto" || desc.layout === undefined) return createSync.call(this, desc);
      const st = { real: null };
      const standIn = { label: desc.label ?? "" };
      standIns.set(standIn, st);
      pipes.total++;
      this.createComputePipelineAsync(desc).then(
        (p) => { st.real = p; pipes.ready++; pipesChanged(); },
        (e) => { pipes.failed++; pipes.errors.push(String(e?.message ?? e).slice(0, 400)); pipesChanged(); },
      );
      pipesChanged();
      return standIn;
    };
    const setPipeline = pass.setPipeline;
    pass.setPipeline = function (p) {
      const st = standIns.get(p);
      if (!st) { skipping.delete(this); return setPipeline.call(this, p); }
      if (st.real) { skipping.delete(this); return setPipeline.call(this, st.real); }
      skipping.add(this);
    };
    for (const m of ["dispatchWorkgroups", "dispatchWorkgroupsIndirect"]) {
      const orig = pass[m];
      pass[m] = function (...a) {
        if (skipping.has(this)) { pipes.skipped++; return; }
        return orig.apply(this, a);
      };
    }
  }
  /** Resolves once every pipeline created so far is compiled (rejects when one failed). */
  window.threertPipelinesReady = () => new Promise((ok, fail) => {
    const check = () => {
      if (pipes.failed) { removeEventListener("threert-pipelines", check); return fail(new Error("a shader failed to compile:\n" + pipes.errors[0])); }
      if (pipes.ready >= pipes.total) { removeEventListener("threert-pipelines", check); ok(); }
    };
    addEventListener("threert-pipelines", check);
    check();
  });

  const STEPS = [
    ["module", "Engine"],
    ["game", "Scene script"],
    ["files", "Scene data"],
    ["setup", "Scene setup"],
    ["gpu", "GPU"],
    ["compile", "Compiling shaders"],
    ["running", "First frame"],
  ];
  const wantsFiles = !!(new URLSearchParams(location.search).get("files") ?? document.body?.dataset?.files);
  const steps = STEPS.filter(([k]) => k !== "files" || wantsFiles);
  const css = `
  #tl { position: fixed; inset: 0; z-index: 100; display: grid; place-items: center; background: #191919; color: #eee;
        font: 13px/1.4 "Rubik", system-ui, sans-serif; transition: opacity .35s ease; }
  #tl.done { opacity: 0; pointer-events: none; }
  #tl .card { width: min(380px, calc(100vw - 32px)); }
  #tl h1 { font-size: 15px; font-weight: 600; margin: 0 0 16px; }
  #tl ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
  #tl li { display: grid; grid-template-columns: 18px 1fr auto; align-items: center; gap: 10px; height: 28px; color: #7d7d7d; font-variant-numeric: tabular-nums; }
  #tl li.active { color: #eee; }
  #tl li.done { color: #b8b8b8; }
  #tl li .mark { width: 14px; height: 14px; border-radius: 50%; border: 2px solid #383838; box-sizing: border-box; }
  #tl li.active .mark { border-color: #de864f33; border-top-color: #de864f; animation: tl-spin .8s linear infinite; }
  #tl li.done .mark { border: 0; background: #65c58d; }
  #tl li.error .mark { border: 0; background: #f47a7a; }
  #tl .bar { height: 3px; background: #2d2d2d; margin: 14px 0 0; border-radius: 2px; overflow: hidden; }
  #tl .bar i { display: block; height: 100%; width: 0; background: #de864f; transition: width .15s linear; }
  #tl .bar.indeterminate i { width: 35%; animation: tl-slide 1.4s ease-in-out infinite; }
  #tl .warn { margin-top: 14px; color: #b8b8b8; }
  #tl .err { margin-top: 16px; color: #f47a7a; white-space: pre-wrap; word-break: break-word; }
  @keyframes tl-spin { to { transform: rotate(360deg); } }
  @keyframes tl-slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(300%); } }
  @media (prefers-reduced-motion: reduce) { #tl li.active .mark, #tl .bar.indeterminate i { animation-duration: 3s; } }`;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);
  const root = document.createElement("div");
  root.id = "tl";
  root.setAttribute("role", "status");
  root.innerHTML = `<div class="card"><h1></h1><ol></ol><div class="bar indeterminate"><i></i></div><div class="warn" hidden></div><div class="err" hidden></div></div>`;
  root.querySelector("h1").textContent = document.title;
  const list = root.querySelector("ol");
  const bar = root.querySelector(".bar");
  const err = root.querySelector(".err");
  const warn = root.querySelector(".warn");
  // The browser compiles the engine's shaders on its GPU process, which also draws every page: the screen can stand still
  // meanwhile. The warning is shown before that starts (a frozen page cannot update it).
  const KEY = "threert-warm:" + location.pathname;
  let warm = false;
  try { warm = !!localStorage.getItem(KEY); } catch {}
  warn.textContent = pipes.async
    ? (warm ? "The browser is compiling the shaders." : "The browser is compiling the shaders for the first time. It can take up to a minute; later visits are quicker.")
    : (warm ? "The page can freeze for a few seconds while the browser compiles the shaders." : "The page can freeze for up to a minute while the browser compiles the shaders. First visit only.");
  const rows = new Map();
  for (const [k, label] of steps) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="mark"></span><span class="label"></span><span class="note"></span>`;
    li.querySelector(".label").textContent = label;
    list.append(li);
    rows.set(k, { li, note: li.querySelector(".note"), t0: 0, t1: 0 });
  }
  const mount = () => document.body.append(root);
  if (document.body) mount(); else addEventListener("DOMContentLoaded", mount);

  let current = null;
  const mb = (n) => (n / 1048576).toFixed(1);
  const secs = (ms) => (ms / 1000).toFixed(ms < 10000 ? 1 : 0) + " s";
  const finish = (k, now) => {
    const r = rows.get(k);
    if (!r || r.t1) return;
    r.t1 = now;
    r.li.className = "done";
    r.note.textContent = secs(r.t1 - r.t0);
  };
  const enter = (k, now) => {
    if (current && current !== k) finish(current, now);
    const r = rows.get(k);
    if (!r || r.t0) return;
    r.t0 = now;
    warn.hidden = !(k === "gpu" || k === "compile" || k === "running");
    r.li.className = "active";
    current = k;
    bar.classList.add("indeterminate");
    bar.firstElementChild.style.width = "";
  };
  const fail = (text) => {
    if (current) { const r = rows.get(current); if (r) r.li.className = "error"; }
    bar.hidden = true;
    warn.hidden = true;
    err.hidden = false;
    err.textContent = text;
    root.classList.remove("done");
  };
  window.threertLoaderFail = fail;

  addEventListener("threert-stage", (e) => enter(e.detail.stage, performance.now()));
  addEventListener("threert-progress", (e) => {
    const { what, loaded, total } = e.detail;
    const r = rows.get(what);
    if (!r) return;
    r.note.textContent = total ? `${mb(loaded)} / ${mb(total)} MB` : `${mb(loaded)} MB`;
    if (what === current && total) {
      bar.classList.remove("indeterminate");
      bar.firstElementChild.style.width = Math.min(100, (loaded / total) * 100) + "%";
    }
  });

  // Elapsed time of the active step, and the end: the engine's first frame done (firstFrame() > 0) and a frame drawn.
  const t00 = performance.now();
  const tick = setInterval(() => {
    const now = performance.now();
    if (current) {
      const r = rows.get(current);
      if (current === "compile" && pipes.total) {
        r.note.textContent = `${pipes.ready} / ${pipes.total} · ${secs(now - r.t0)}`;
        bar.classList.remove("indeterminate");
        bar.firstElementChild.style.width = (pipes.ready / pipes.total) * 100 + "%";
      } else if (!r.note.textContent.includes("MB")) r.note.textContent = secs(now - r.t0);
    }
    const t = window.threert;
    if (current === "running" && t && typeof t.firstFrame === "function" && t.firstFrame() > 0 && t.frames.length > 2) {
      finish("running", now);
      clearInterval(tick);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        root.classList.add("done");
        setTimeout(() => root.remove(), 500);
        window.threertLoaded = { total_ms: Math.round(performance.now() - t00) };
        try { localStorage.setItem(KEY, String(Date.now())); } catch {}
      }));
    }
    if (window.threertError && !err.textContent) fail(String(window.threertError).split("\n")[0]);
  }, 200);

  // WebGPU: absent, or the device lost / an error the engine could not report on its own.
  if (!navigator.gpu) {
    addEventListener("DOMContentLoaded", () => fail("WebGPU is not available in this browser. Use a current Chrome or Edge with hardware acceleration on."));
  } else {
    const proto = GPUAdapter.prototype;
    const orig = proto.requestDevice;
    proto.requestDevice = async function (...a) {
      const d = await orig.apply(this, a);
      d.lost.then((i) => { window.threertGpuLost = i; fail(`GPU device lost (${i.reason}): ${i.message}`); });
      d.addEventListener("uncapturederror", (e) => {
        (window.threertGpuErrors ??= []).push(e.error.message);
        console.error("WebGPU:", e.error.message);
        if (current === "running" || current === "compile" || current === "gpu") fail("GPU error while compiling shaders:\n" + e.error.message.slice(0, 400));
      });
      return d;
    };
  }
})();
