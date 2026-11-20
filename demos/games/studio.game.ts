// Studio: a virtual broadcast set, path traced. One scene, built so every light in it is a visible thing:
//   LED data wall      two rows of bars, a custom WGSL material, one data value per bar (customData, live)
//   neon sign          emissive artwork that lights the wall behind it
//   glass prism        transmission, IOR 1.5: refracts the wall, the strips and the haze
//   chrome             a ball and a torus knot: mirrors of the whole set
//   floor strips       two emissive runway lines: their reflections on the glossy floor draw the perspective
//   haze orb           a fog volume lit by a lamp inside it: the back light behind the prism
//   floor              near-mirror black: everything above it is traced a second time
// Everything here also runs in the browser build (no particles, no alpha cutout beyond the sign, no depth of field).
// Palette: the accent #de864f and an overlay cyan #a9dbe8, pushed to saturated emitter values.
// The data is synthetic: slow series, no pulses, no decorative sweeps.
import { Scene, PerspectiveCamera, Mesh, BoxGeometry, PlaneGeometry, IcosahedronGeometry, SphereGeometry, TorusKnotGeometry,
  MeshPhysicalMaterial, MeshStandardMaterial, NeonSignMaterial, PointLight, FogVolume, MaterialFunction, SkyColor, Color, Texture } from "@threert/scene";
import { defineGame } from "@threert/gameplay";

const ACCENT = [1.0, 0.36, 0.1] as [number, number, number];        // #de864f, saturated for an emitter
const ACCENT_HOT = [1.0, 0.66, 0.4] as [number, number, number];    // #ffb58c
const CYAN = [0.45, 0.82, 1.0] as [number, number, number];         // #a9dbe8

/** A bar of the data wall: gradient and ticks, lit up to a level read from the node's customData. */
const BAR = new MaterialFunction("studiobar", {
  params: { Gain: 260, Tint: [ACCENT[0], ACCENT[1], ACCENT[2], 0], Hot: [ACCENT_HOT[0], ACCENT_HOT[1], ACCENT_HOT[2], 0] },
  code: `
    let level = i.custom.x;
    let fy = 1.0 - i.uv.y;
    let on = select(0.0, 1.0, fy <= level);
    let tick = step(0.95, fract(fy * 12.0));
    let body = on * (0.2 + 0.8 * fy) + tick * 0.16;
    o.base = vec3<f32>(0.0);
    o.roughness = 0.5;
    o.emissive = mix($Tint.rgb, $Hot.rgb, on * fy * fy * 0.35) * $Gain * body;`,
});

const PRIMARY = 15;
const SECONDARY = 14;
const PITCH = 0.62;

/** Synthetic series in [0.08, 1]: slow, two sines per bar. */
function series(i: number, t: number, period: number): number {
  const v = 0.5 + 0.3 * Math.sin((2 * Math.PI * t) / period + i * 0.55) + 0.14 * Math.sin((2 * Math.PI * t) / (period * 0.57) + i * 1.31);
  return Math.min(1, Math.max(0.08, v));
}

export default defineGame({
  state: {},
  setup() {
    const scene = new Scene();
    scene.name = "studio";
    scene.environment = new SkyColor(new Color().setRGB(0.03, 0.034, 0.046), 0.6);

    // Floor: near-mirror black.
    const floor = new Mesh(new PlaneGeometry(40, 40), new MeshPhysicalMaterial({ name: "studio-floor", color: 0x0d0e10, roughness: 0.05, metalness: 0 }));
    floor.name = "floor";
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    // Back wall.
    const wall = new Mesh(new BoxGeometry(16, 9, 0.3), new MeshStandardMaterial({ name: "studio-wall", color: 0x1a1b1e, roughness: 0.8 }));
    wall.name = "wall";
    wall.position.set(0, 4.5, -3.2);
    scene.add(wall);

    // LED data wall: orange primary bars, thinner cyan bars between them.
    for (let i = 0; i < PRIMARY; i++) {
      const bar = new Mesh(new BoxGeometry(0.22, 3.4, 0.06), new MeshStandardMaterial({ name: `p-${i}`, color: 0x000000, emissive: ACCENT, emissiveIntensity: 260 }));
      bar.material.shader = BAR.with({ Tint: [...ACCENT, 0], Hot: [...ACCENT_HOT, 0] });
      bar.name = `primary-${i}`;
      bar.position.set((i - (PRIMARY - 1) / 2) * PITCH, 1.7, -2.98);
      scene.add(bar);
    }
    for (let i = 0; i < SECONDARY; i++) {
      const bar = new Mesh(new BoxGeometry(0.1, 2.0, 0.06), new MeshStandardMaterial({ name: `s-${i}`, color: 0x000000, emissive: CYAN, emissiveIntensity: 200 }));
      bar.material.shader = BAR.with({ Tint: [...CYAN, 0], Hot: [...CYAN, 0], Gain: 200 });
      bar.name = `secondary-${i}`;
      bar.position.set((i - (SECONDARY - 1) / 2) * PITCH, 1.0, -2.93);
      scene.add(bar);
    }

    // Neon sign above the wall of bars.
    const sign = new Mesh(new PlaneGeometry(6.6, 6.6 * 395 / 2048), new NeonSignMaterial({
      map: new Texture("studio/assets/neon-sign.png", "srgb"), intensity: 220, glow: [1.0, 0.56, 0.35], masked: true,
    }));
    sign.name = "sign";
    sign.position.set(0, 4.9, -3.0);
    scene.add(sign);

    // Floor strips: two runway lines toward the wall. Their reflections are the perspective.
    for (const x of [-1.9, 1.9]) {
      const strip = new Mesh(new BoxGeometry(0.07, 0.02, 6.4), new MeshStandardMaterial({ name: "strip", color: 0x000000, emissive: ACCENT, emissiveIntensity: 140 }));
      strip.name = `strip-${x > 0 ? "r" : "l"}`;
      strip.position.set(x, 0.01, 0.2);
      scene.add(strip);
    }

    // Hero: glass prism between a chrome ball and a chrome torus knot.
    const glass = new Mesh(new IcosahedronGeometry(1.1, 0), new MeshPhysicalMaterial({ name: "glass-prism", color: 0xffffff, transmission: 1, ior: 1.5, roughness: 0.0 }));
    glass.name = "glass";
    glass.position.set(0, 1.35, -0.6);
    glass.rotation.set(0.4, 0.6, 0.2);
    scene.add(glass);
    const chrome = new MeshPhysicalMaterial({ name: "chrome", color: 0xf2f2f2, metalness: 1, roughness: 0.04 });
    const ball = new Mesh(new SphereGeometry(0.55, 128, 96), chrome);
    ball.name = "chrome-ball";
    ball.position.set(-2.4, 0.55, 0.3);
    scene.add(ball);
    const knot = new Mesh(new TorusKnotGeometry(0.55, 0.17, 256, 48), chrome);
    knot.name = "chrome-knot";
    knot.position.set(2.4, 0.85, -0.1);
    knot.rotation.set(0.2, 0.4, 0);
    scene.add(knot);

    // Haze orb with its lamp: the back light behind the prism.
    const haze = new FogVolume({ radialExtinction: 2, heightExtinction: 1, heightFalloff: 1000, heightOffset: 0.5, albedo: [1, 0.92, 0.84], phaseG: 0.2 });
    haze.name = "haze";
    haze.position.set(0, 2.9, -1.9);
    haze.scale.set(3.4, 3.4, 3.4);
    scene.add(haze);
    const lamp = new PointLight(0xfff1e6, 750, 0, 2);
    lamp.name = "lamp";
    lamp.radius = 0.2;
    lamp.position.set(0, 2.9, -1.9);
    scene.add(lamp);

    // Colour fills from the sides, low: cyan left, orange right.
    const cool = new PointLight(0x96dcff, 700, 0, 2);
    cool.name = "fill-cool";
    cool.radius = 0.3;
    cool.position.set(-3.8, 1.2, 1.6);
    scene.add(cool);
    const warm = new PointLight(0xffa060, 700, 0, 2);
    warm.name = "fill-warm";
    warm.radius = 0.3;
    warm.position.set(3.8, 1.2, 1.6);
    scene.add(warm);

    const camera = new PerspectiveCamera(38, 16 / 9, 0.05, 150);
    camera.name = "camera";
    camera.position.set(0, 1.7, 9.0);
    camera.lookAt(0, 2.1, -1);
    camera.setManualExposure(7.0);
    scene.add(camera);

    return { scene, camera, options: { name: "studio" } };
  },
  handlers: {},
  frame(f) {
    const t = f.time;
    for (let i = 0; i < PRIMARY; i++) {
      const m = f.object(`primary-${i}`) as Mesh | undefined;
      if (m) m.customData = [series(i, t, 18), 0, 0, 0];
    }
    for (let i = 0; i < SECONDARY; i++) {
      const m = f.object(`secondary-${i}`) as Mesh | undefined;
      if (m) m.customData = [series(i + 3, t, 12), 0, 0, 0];
    }
    // A slow dolly with a little sideways drift. The camera is not geometry: no rebuild.
    f.camera.position.set(1.1 * Math.sin(t * 0.09), 1.7 + 0.12 * Math.sin(t * 0.06), 9.0 - 0.9 * (0.5 + 0.5 * Math.sin(t * 0.05)));
    f.camera.lookAt(0, 2.1, -1);
  },
});
