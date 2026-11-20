// RT Showcase: one room, every light-transport effect the browser engine traces, each on its own object.
//   window + sun          sharp sunlight patches through two openings, sky light, bounce into the room
//   square frame light    an emissive frame with a rect light inside: soft area shadows under everything
//   matte white sphere    diffuse GI: picks up the red wall and the floor
//   gold / chrome spheres glossy and mirror reflections of the whole room
//   glass sphere          refraction, Fresnel, light focused through it onto the floor (traced paths, not a decal)
//   frosted cube          rough transmission (the engine has no subsurface scattering: this is not SSS)
//   complex mesh          a scanned glTF prop: thousands of triangles in the BVH, contact shadows
//   red wall, blue light  colour bleeding from both
//   haze                  a fog volume in the room, switchable
// Inputs (events from the page): sun, area, fog on/off. The frame script writes the light powers and the fog's
// visibility (parameter updates in place). A slow drift of the camera is optional (orbit on/off).
import { Scene, PerspectiveCamera, Mesh, BoxGeometry, SphereGeometry, PlaneGeometry, MeshStandardMaterial, MeshPhysicalMaterial,
  DirectionalLight, RectAreaLight, SkyAtmosphere, FogVolume, GLTFModel, Color, SurfaceMaterial, Texture } from "@threert/scene";
import { defineGame } from "@threert/gameplay";
import { MaterialFunction } from "@threert/scene";

// White clay for the scanned prop (the white sculpture of the reference): base colour only, the scan normals kept.
const CLAY = new MaterialFunction("whiteclay", { params: {}, code: `
    o.base = vec3<f32>(0.78, 0.77, 0.75);
    o.metallic = 0.0;
    o.roughness = 0.8;` });

interface State { sun: number; area: number; fog: number; orbit: number }

const W = 8, D = 7, H = 4.2, T = 0.25;
const Z0 = -5, Z1 = 2;
const tex = (id: string, m: string) => new Texture(`ThreeRT/assets/polyhaven/tex/${id}/${id}_${m}_1k.jpg`, m === "diff" ? "srgb" : "linear");

let sun: DirectionalLight;
let rect: RectAreaLight;
let frameMat: MeshStandardMaterial;
let haze: FogVolume;

export default defineGame<State>({
  state: { sun: 1, area: 1, fog: 0, orbit: 0 },
  setup() {
    const scene = new Scene();
    scene.name = "rt-showcase";
    sun = new DirectionalLight(0xfff1dc, 45000).setSunAngles(24, 250);
    sun.name = "sun";
    scene.add(sun);
    scene.environment = new SkyAtmosphere({ sun });

    const concrete = () => new MeshStandardMaterial({ name: "concrete", color: new Color().setRGB(0.2, 0.2, 0.21), roughness: 0.85 });
    const box = (name: string, w: number, h: number, d: number, x: number, y: number, z: number, m: MeshStandardMaterial) => {
      const o = new Mesh(new BoxGeometry(w, h, d), m);
      o.name = name;
      o.position.set(x, y, z);
      scene.add(o);
      return o;
    };

    // Floor: polished concrete.
    const floor = new Mesh(new PlaneGeometry(W, D), new MeshPhysicalMaterial({ name: "polished-concrete", color: new Color().setRGB(0.12, 0.118, 0.115), roughness: 0.2, metalness: 0 }));
    floor.name = "floor";
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = (Z0 + Z1) / 2;
    scene.add(floor);

    // Walls: back, ceiling, right (with the red panel), left with two window openings.
    box("back", W + 2 * T, H, T, 0, H / 2, Z0 - T / 2, concrete());
    box("ceiling", W + 2 * T, T, D + T, 0, H + T / 2, (Z0 + Z1) / 2, concrete());
    box("right", T, H, D, W / 2 + T / 2, H / 2, (Z0 + Z1) / 2, concrete());
    const red = new MeshStandardMaterial({ name: "red-paint", color: new Color().setRGB(0.6, 0.04, 0.05), roughness: 0.7 });
    box("red-panel", 0.05, H - 0.6, 2.6, W / 2 - 0.03, (H - 0.6) / 2 + 0.1, -2.6, red);
    const xL = -W / 2 - T / 2;
    const win = { y0: 1.1, y1: 3.4, z: [[-3.9, -2.9], [-2.2, -1.2]] };
    box("left-low", T, win.y0, D, xL, win.y0 / 2, (Z0 + Z1) / 2, concrete());
    box("left-high", T, H - win.y1, D, xL, (H + win.y1) / 2, (Z0 + Z1) / 2, concrete());
    const cuts = [Z0, win.z[0][0], win.z[0][1], win.z[1][0], win.z[1][1], Z1];
    for (let k = 0; k < cuts.length; k += 2) {
      const za = cuts[k], zb = cuts[k + 1], len = zb - za;
      if (len > 0.01) box(`left-pier-${k}`, T, win.y1 - win.y0, len, xL, (win.y0 + win.y1) / 2, (za + zb) / 2, concrete());
    }

    // Blue light: a vertical emissive strip in the right corner.
    box("blue-strip", 0.06, H - 0.4, 0.55, W / 2 - 0.06, H / 2, -4.3, new MeshStandardMaterial({ name: "blue-light", color: 0x000000, emissive: new Color().setRGB(0.15, 0.3, 1.0), emissiveIntensity: 2600 }));

    // Square frame light: four emissive bars and a rect light inside facing down.
    frameMat = new MeshStandardMaterial({ name: "frame-light", color: 0x000000, emissive: new Color().setRGB(1.0, 0.82, 0.62), emissiveIntensity: 1400 });
    const fs = 1.7, fy = 2.95, fz = -1.6;
    box("frame-n", fs, 0.05, 0.05, 0, fy, fz - fs / 2, frameMat);
    box("frame-s", fs, 0.05, 0.05, 0, fy, fz + fs / 2, frameMat);
    box("frame-w", 0.05, 0.05, fs, -fs / 2, fy, fz, frameMat);
    box("frame-e", 0.05, 0.05, fs, fs / 2, fy, fz, frameMat);
    const cable = new MeshStandardMaterial({ name: "cable", color: 0x111111, roughness: 0.6 });
    for (const [x, z] of [[-fs / 2, fz - fs / 2], [fs / 2, fz - fs / 2], [-fs / 2, fz + fs / 2], [fs / 2, fz + fs / 2]]) box("cable", 0.008, H - fy, 0.008, x, (H + fy) / 2, z, cable);
    rect = new RectAreaLight(new Color().setRGB(1.0, 0.85, 0.7), 9000, fs, fs);
    rect.name = "frame-rect";
    rect.card = false;
    rect.position.set(0, fy - 0.03, fz);
    rect.lookAt(0, 0, fz);
    scene.add(rect);

    // The objects.
    const sphere = (name: string, r: number, x: number, z: number, m: MeshStandardMaterial) => {
      const o = new Mesh(new SphereGeometry(r, 128, 96), m);
      o.name = name;
      o.position.set(x, r, z);
      scene.add(o);
      return o;
    };
    sphere("matte", 0.85, -2.3, -1.9, new MeshStandardMaterial({ name: "matte-white", color: new Color().setRGB(0.78, 0.77, 0.75), roughness: 0.95 }));
    sphere("gold", 0.7, -1.2, -3.2, new MeshPhysicalMaterial({ name: "gold", color: new Color().setRGB(1.0, 0.766, 0.336), metalness: 1, roughness: 0.12 }));
    sphere("chrome", 0.8, 0.1, -1.0, new MeshPhysicalMaterial({ name: "chrome", color: 0xf6f6f6, metalness: 1, roughness: 0.02 }));
    sphere("glass", 0.62, 1.35, 0.35, new MeshPhysicalMaterial({ name: "glass", color: 0xffffff, transmission: 1, ior: 1.5, roughness: 0 }));
    const cube = box("frosted-cube", 1.3, 1.3, 1.3, 2.35, 0.65, -3.1, new MeshPhysicalMaterial({ name: "frosted", color: new Color().setRGB(0.96, 0.93, 0.9), transmission: 1, ior: 1.45, roughness: 0.35 }));
    cube.rotation.y = 0.35;

    // Complex mesh: a scanned glTF prop in front left.
    const prop = new GLTFModel("ThreeRT/assets/polyhaven/models/fire_hydrant_1k.glb", {
      nodes: ["fire_hydrant", "fire_hydrant_cap_01", "fire_hydrant_cap_02", "fire_hydrant_cap_03", "fire_hydrant_chain"],
      functions: { fire_hydrant: CLAY.with({}) },
    });
    prop.name = "complex-mesh";
    prop.position.set(-1.4, 0, 0.3);
    prop.rotation.y = 0.6;
    prop.scale.set(1.25, 1.25, 1.25);
    scene.add(prop);

    // Haze: a fog volume over the room, off at the start.
    haze = new FogVolume({ radialExtinction: 0.18, heightExtinction: 0, albedo: [1, 0.97, 0.92], phaseG: 0.55 });
    haze.name = "haze";
    haze.position.set(-1.5, 2.0, -2.0);
    haze.scale.set(7, 7, 7);
    haze.visible = false;
    scene.add(haze);

    const camera = new PerspectiveCamera(46, 16 / 9, 0.05, 200);
    camera.name = "camera";
    camera.position.set(0.4, 1.75, 5.4);
    camera.lookAt(0, 1.05, -1.6);
    camera.setManualExposure(9.2);
    scene.add(camera);
    return { scene, camera, options: { name: "rt-showcase" } };
  },
  handlers: {
    set(tx, ev: Partial<State>) {
      for (const k of ["sun", "area", "fog", "orbit"] as const) if (typeof ev[k] === "number") tx.state[k] = ev[k] as number;
    },
  },
  frame(f) {
    const s = f.state;
    sun.intensity = 45000 * Math.max(s.sun, 0.0001);
    sun.visible = s.sun > 0;
    rect.intensity = 9000 * s.area;
    frameMat.emissiveIntensity = 1400 * s.area;
    haze.visible = s.fog > 0;
    if (s.orbit > 0) {
      const t = f.time;
      f.camera.position.set(0.4 + 0.6 * Math.sin(t * 0.08), 1.75, 5.4 - 0.25 * Math.sin(t * 0.05));
      f.camera.lookAt(0, 1.05, -1.6);
    }
  },
});
