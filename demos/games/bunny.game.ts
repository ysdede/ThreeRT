// ThreeRT Bunny Lab: the composition of threert_reference_scene_manifest.json, lit like the reference picture and built
// with the real scene API. Six elements: matte sphere, Stanford Bunny (a true 69,451-triangle GLB), gold sphere, chrome
// sphere, clear glass sphere, frosted-transmission block.
// Light, all of it traced: a square emissive ring hangs over the set (its strips are the area light: emissive geometry is
// sampled, so nothing is lit twice), a low sun comes through a gridded window wall behind the camera (the grid's shadows land
// on the walls and the floor, the chrome and glass reflect the sky panes and their mullions), and a violet fill rectangle
// feeds the red/violet corner. Nothing is baked. What the renderer does not compute, caustics, is not drawn.
// The page drives it through events: chrome roughness/metalness, gold roughness, glass IOR, frosted roughness and
// transmission, ring power, daylight. Material fields outside the engine's per-frame set (IOR, transmission) need `needsUpdate`.
import { Scene, PerspectiveCamera, Mesh, BoxGeometry, SphereGeometry, MeshStandardMaterial, MeshPhysicalMaterial, RectAreaLight, DirectionalLight, GLTFModel, SkyColor } from "@threert/scene";
import { defineGame } from "@threert/gameplay";

interface State { chromeRough: number; chromeMetal: number; goldRough: number; ior: number; frostRough: number; frostTrans: number; lamp: number; window: number }
const D2R = Math.PI / 180;
const BUNNY_URI = "ThreeRT/assets/models/stanford_bunny.glb";
const BUNNY_YAW = 150; // the mesh's long axis is X: this turns it to a three-quarter view facing right and toward the camera
const RING = { y: 2.4, x: 0.55, z: -0.35, side: 1.8, yaw: 38, emissive: 14000 }; // fixture over the set
const BULB = 120000;
const SUN = 3800, SKY = 5200, FILL = 350, TOP = 5000;

let chrome: MeshPhysicalMaterial, gold: MeshStandardMaterial, glass: MeshPhysicalMaterial, frost: MeshPhysicalMaterial;
let ringMat: MeshStandardMaterial, sun: DirectionalLight, sky: SkyColor, top: RectAreaLight, bulbMat: MeshStandardMaterial;

export default defineGame<State>({
  state: { chromeRough: 0.035, chromeMetal: 1, goldRough: 0.09, ior: 1.5, frostRough: 0.24, frostTrans: 0.75, lamp: 1, window: 1 },
  setup() {
    const scene = new Scene();
    scene.name = "bunny-lab";
    sky = new SkyColor(0xbdd2f4, SKY);
    scene.environment = sky;
    const std = (name: string, hex: number, rough: number, metal = 0) => new MeshStandardMaterial({ name, color: hex, roughness: rough, metalness: metal });
    const box = (name: string, w: number, h: number, d: number, x: number, y: number, z: number, m: MeshStandardMaterial, yawDeg = 0) => {
      const o = new Mesh(new BoxGeometry(w, h, d), m);
      o.name = name;
      o.position.set(x, y, z);
      o.rotation.y = yawDeg * D2R;
      scene.add(o);
      return o;
    };
    // Room: polished concrete floor, concrete walls, a red right wall, a ceiling; open to the sky only through the window wall.
    const ZW = 7.2; // window wall, behind the camera
    const zc = (ZW - 2.75) / 2, zl = ZW + 2.75; // centre and length of the side walls and floor
    const concrete = std("concrete_wall", 0x8d8883, 0.88);
    box("floor", 8, 0.12, zl, 0, -0.06, zc, std("floor_concrete", 0x77726e, 0.3));
    box("back_wall", 8, 3.8, 0.12, 0, 1.9, -2.75, std("back_dark", 0x39393d, 0.9));
    box("left_wall", 0.12, 3.8, zl, -3.84, 1.9, zc, concrete);
    box("right_wall", 0.12, 3.8, zl, 3.84, 1.9, zc, std("wall_red", 0x8a2536, 0.8));
    box("ceiling", 8, 0.12, zl, 0, 3.86, zc, std("ceiling", 0x2e2e31, 0.9));
    // Violet panel in the back-right corner (the reference's red/violet recess).
    box("violet_panel", 0.12, 3.8, 1.5, 3.7, 1.9, -1.9, std("wall_violet", 0x4b3f9e, 0.8));

    // Window wall: piers and header around three-by-three panes with dark mullions; the openings are holes to the sky.
    const dark = std("mullion", 0x141416, 0.6);
    box("win_sill", 8, 0.6, 0.2, 0, 0.3, ZW, concrete);
    box("win_head", 8, 0.76, 0.2, 0, 3.48, ZW, concrete);
    box("win_pier_l", 0.7, 2.5, 0.2, -3.65, 1.85, ZW, concrete);
    box("win_pier_r", 0.7, 2.5, 0.2, 3.65, 1.85, ZW, concrete);
    for (const x of [-1.15, 1.15]) box("mullion_v", 0.1, 2.5, 0.12, x, 1.85, ZW, dark);
    for (const y of [1.45, 2.3]) box("mullion_h", 6.6, 0.1, 0.12, 0, y, ZW, dark);

    const sphere = (name: string, r: number, x: number, y: number, z: number, m: MeshStandardMaterial) => {
      const o = new Mesh(new SphereGeometry(r, 128, 96), m);
      o.name = name;
      o.position.set(x, y, z);
      scene.add(o);
      return o;
    };
    sphere("matte_white_sphere", 0.57, -2.35, 0.57, 0.45, std("matte_white", 0xdedbd7, 0.9));
    gold = std("gold_metal", 0xd9ac60, 0.09, 1);
    sphere("gold_metal_sphere", 0.5, -1.43, 0.5, -0.42, gold);
    chrome = new MeshPhysicalMaterial({ name: "chrome_metal", color: 0xe2e5e8, metalness: 1, roughness: 0.035 });
    sphere("chrome_mirror_sphere", 0.73, -0.2, 0.73, 0.25, chrome);
    glass = new MeshPhysicalMaterial({ name: "clear_glass", color: 0xffffff, roughness: 0.015, metalness: 0, transmission: 1, ior: 1.5 });
    sphere("clear_glass_sphere", 0.6, 1.15, 0.6, 1.2, glass);
    frost = new MeshPhysicalMaterial({ name: "frosted_glass", color: 0xedeaf0, roughness: 0.24, metalness: 0, transmission: 0.75, ior: 1.47 });
    box("frosted_glass_block", 1.02, 1.52, 0.35, 1.91, 0.76, -0.6, frost, -9);

    // The Stanford Bunny: a GLB, normalised by tools (height 0.82 m, lowest vertex y = 0, centred in X/Z).
    const bunny = new GLTFModel(BUNNY_URI);
    bunny.name = "stanford_bunny";
    bunny.position.set(-1.25, 0, 1.55);
    bunny.rotation.y = BUNNY_YAW * D2R;
    scene.add(bunny);

    // The ring fixture: a dark housing with a warm emissive strip on its underside, hung on four wires. The strips are the light.
    ringMat = new MeshStandardMaterial({ name: "ring_emitter", color: 0x000000, emissive: 0xffb36b, emissiveIntensity: RING.emissive });
    const housing = std("ring_housing", 0x0d0d0f, 0.5);
    const { x: rx, y: ry, z: rz, side: rs, yaw } = RING;
    const half = rs / 2, bar = 0.1, strip = 0.05;
    const c = Math.cos(yaw * D2R), s = Math.sin(yaw * D2R);
    const at = (ox: number, oz: number): [number, number] => [rx + ox * c + oz * s, rz - ox * s + oz * c];
    const along = (name: string, ox: number, oz: number, rot: number) => {
      const [px, pz] = at(ox, oz);
      box(name + "-housing", rs + bar, bar, bar, px, ry, pz, housing, yaw + rot);
      box(name + "-strip", rs, strip, strip, px, ry - bar / 2 - strip / 2, pz, ringMat, yaw + rot);
    };
    along("ring-n", 0, -half, 0);
    along("ring-s", 0, half, 0);
    along("ring-w", -half, 0, 90);
    along("ring-e", half, 0, 90);
    const wire = std("wire", 0x0a0a0a, 0.6);
    for (const [ox, oz] of [[-half, -half], [half, -half], [-half, half], [half, half]]) {
      const [px, pz] = at(ox, oz);
      box("wire", 0.012, 3.86 - ry, 0.012, px, (3.86 + ry) / 2, pz, wire);
    }

    // Three small spot bulbs over the glass sphere. They are lamps like any other (sampled for direct light); the glass focuses
    // them into bright caustic spots on the floor because paths leaving the floor refract through the sphere and land on a bulb.
    bulbMat = new MeshStandardMaterial({ name: "spot_bulb", color: 0x000000, emissive: 0xffe2bd, emissiveIntensity: BULB });
    for (const [bx, bz] of [[0.1, 0.0], [0.55, -0.45], [-0.25, 0.35]]) {
      const b = new Mesh(new SphereGeometry(0.09, 32, 24), bulbMat);
      b.name = "spot_bulb";
      b.position.set(bx, 3.3, bz);
      scene.add(b);
    }

    // A low sun through the window wall (light travels toward -x and -z), and a violet fill for the right corner.
    sun = new DirectionalLight(0xffe2bd, SUN);
    sun.name = "sun";
    sun.setSunAngles(14, 28);
    scene.add(sun);
    const fill = new RectAreaLight(0x8a7bff, FILL, 1.2, 1.8);
    fill.name = "violet_fill";
    fill.card = false;
    fill.position.set(3.0, 2.1, 0.6);
    fill.lookAt(0.4, 0.5, 0.1);
    scene.add(fill);

    // Overhead fill (the manifest's main_overhead_area, hidden above the ring): a real rectangle light, kept weak, so the shadow side is not black.
    top = new RectAreaLight(0xfff1dc, TOP, 2.45, 1.23);
    top.name = "main_overhead_area";
    top.card = false;
    top.position.set(0.12, 3.7, -0.15);
    top.lookAt(0, 0, 0);
    scene.add(top);

    const camera = new PerspectiveCamera(37, 16 / 9, 0.05, 100);
    camera.name = "camera";
    camera.position.set(0, 1.55, 5.85);
    camera.lookAt(0, 0.82, 0);
    camera.setManualExposure(9.1);
    scene.add(camera);
    return { scene, camera, options: { name: "bunny-lab" } };
  },
  handlers: {
    set(tx, ev: Partial<State>) {
      for (const k of Object.keys(tx.state) as (keyof State)[]) {
        if (typeof ev[k] === "number" && Number.isFinite(ev[k])) tx.state[k] = ev[k] as number;
      }
    },
  },
  frame(f) {
    const s = f.state;
    chrome.roughness = s.chromeRough;
    chrome.metalness = s.chromeMetal;
    gold.roughness = s.goldRough;
    // IOR, transmission and roughness of the frosted block are not in the engine's per-frame comparison: needsUpdate.
    if (glass.ior !== s.ior) { glass.ior = s.ior; glass.needsUpdate = true; }
    if (frost.transmission !== s.frostTrans) { frost.transmission = s.frostTrans; frost.needsUpdate = true; }
    frost.roughness = s.frostRough;
    ringMat.emissiveIntensity = RING.emissive * s.lamp;
    top.intensity = TOP * s.lamp;
    bulbMat.emissiveIntensity = BULB * s.lamp;
    sun.intensity = SUN * s.window;
    sky.intensity = SKY * s.window;
  },
});
