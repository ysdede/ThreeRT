// ThreeRT Test Room, after the reference picture: a white room, a chrome sphere and a glass sphere on a grey and white
// checker floor, a turbine gear leaning toward the camera, a round lamp, and two boxes whose side faces are painted red
// and green (the colour that bleeds onto the white walls, the floor, the gear's teeth and into the spheres).
//   chrome sphere   mirror reflection of the whole room (and of the glass sphere)
//   glass sphere    refraction, Fresnel, and caustics on the floor and the wall
//   turbine gear    a machined part: 40 teeth, vaned web, 24-blade impeller hub (steel; colour bounce on the teeth)
//   lamp            a round emissive ball with a point light inside
// The page drives it with real engine inputs: events set the chrome's roughness and metalness, the glass's IOR and the
// lamp's power; the frame script writes them to the materials and the light (in-place parameter updates, no rebuild).
// The chrome sphere and the gear are instances moved in place, in short bursts: BURST seconds out of every CYCLE they
// run, then rest, and the image converges (the live view keeps less history while anything moves). The chrome rolls
// without slipping (turn = distance / radius); the gear turns a few teeth.
import { Scene, PerspectiveCamera, Mesh, BoxGeometry, InstancedMesh, Matrix4, Quaternion, Vector3, BufferGeometry, SphereGeometry, PlaneGeometry,
  MeshStandardMaterial, MeshPhysicalMaterial, PointLight, SkyColor, Color, checkerTexture } from "@threert/scene";
import { turbineGeometry } from "./turbine.ts";
import { defineGame } from "@threert/gameplay";

interface State { roughness: number; metalness: number; ior: number; lamp: number; motion: number }
type V3 = [number, number, number];

const W = 3.4, H = 3.0, D = 3.4;                       // room: x in [-W/2, W/2], y in [0, H], z in [-D/2, D/2]
const R = 0.42;                                        // both spheres
const CHROME_HOME: V3 = [-0.78, R, 0.5], GLASS_AT: V3 = [0.8, R, 0.7];
const GEAR = { teeth: 40, pitchRadius: 0.37, rimDepth: 0.11, webRadius: 0.3, hubRadius: 0.205, fins: 24, vanes: 8 };
const GEAR_AT: V3 = [0.02, 0.4, -0.1];
const GEAR_TILT = { yaw: 0.42, pitch: -0.16 };         // turned toward the left, leaning back a little
const ZF = 6.5;                                       // the room's open end, behind the camera
const CYCLE = 12, BURST = 4;
const TEETH_PER_CYCLE = 3;

let clock = 0;
let chromeMat: MeshPhysicalMaterial;
let glassMat: MeshPhysicalMaterial;
let lamp: PointLight;
let bulbMat: MeshStandardMaterial;
let chromeInst: InstancedMesh, gearInst: InstancedMesh;

const _m = new Matrix4(), _q = new Quaternion(), _one = new Vector3(1, 1, 1);
const _qy = new Quaternion(), _qp = new Quaternion(), _qs = new Quaternion();
const X = new Vector3(1, 0, 0), Y = new Vector3(0, 1, 0), Z = new Vector3(0, 0, 1);
/** Instance 0: a position, then a base orientation (yaw about y, pitch about x), then a spin about the local z axis. */
function placeSpin(im: InstancedMesh, p: readonly number[], yaw: number, pitch: number, spin: number) {
  _qy.setFromAxisAngle(Y, yaw);
  _qp.setFromAxisAngle(X, pitch);
  _qs.setFromAxisAngle(Z, spin);
  _q.multiplyQuaternions(_qy, _qp).multiply(_qs);
  _m.compose(new Vector3(p[0], p[1], p[2]), _q, _one);
  im.setMatrixAt(0, _m);
  im.instanceMatrix.needsUpdate = true;
}
/** A rolling sphere: moved along x by dx, turned about z by -dx / R. */
function placeRoll(im: InstancedMesh, p: readonly number[], dx: number) {
  _q.setFromAxisAngle(Z, -dx / R);
  _m.compose(new Vector3(p[0] + dx, p[1], p[2]), _q, _one);
  im.setMatrixAt(0, _m);
  im.instanceMatrix.needsUpdate = true;
}

/** A planar quad from four corners; normal from the winding; two-sided material. */
function quad(a: V3, b: V3, c: V3, d: V3, mat: MeshStandardMaterial): Mesh {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const l = Math.hypot(n[0], n[1], n[2]) || 1;
  const nn = n.map((x) => x / l);
  return new Mesh(new BufferGeometry().setData([...a, ...b, ...c, ...d], [...nn, ...nn, ...nn, ...nn], [0, 0, 1, 0, 1, 1, 0, 1], [0, 1, 2, 0, 2, 3]), mat);
}

export default defineGame<State>({
  state: { roughness: 0.02, metalness: 1, ior: 1.5, lamp: 1, motion: 1 },
  setup() {
    const scene = new Scene();
    scene.name = "test-room";
    scene.environment = new SkyColor(0x000000, 0);

    const matte = (name: string, r: number, g: number, b: number) =>
      new MeshStandardMaterial({ name, color: new Color().setRGB(r, g, b), roughness: 0.9, side: "double" });
    const white = matte("white", 0.74, 0.73, 0.72), red = matte("red", 0.78, 0.03, 0.03), green = matte("green", 0.03, 0.68, 0.06);
    const add = (m: Mesh, name: string) => { m.name = name; scene.add(m); return m; };

    // Room: floor, back, left, right and ceiling are white quads (zero thickness, two-sided).
    // The room runs on past the objects toward the camera (the camera stands inside it, as the reference shows no front edge).
    const hw = W / 2, hd = D / 2, zf = ZF;
    add(quad([-hw, H, -hd], [hw, H, -hd], [hw, 0, -hd], [-hw, 0, -hd], white), "back");
    add(quad([-hw, H, zf], [-hw, H, -hd], [-hw, 0, -hd], [-hw, 0, zf], white), "left");
    add(quad([hw, H, -hd], [hw, H, zf], [hw, 0, zf], [hw, 0, -hd], white), "right");
    add(quad([-hw, H, zf], [hw, H, zf], [hw, H, -hd], [-hw, H, -hd], white), "ceiling");
    add(quad([hw, H, zf], [-hw, H, zf], [-hw, 0, zf], [hw, 0, zf], white), "front");
    const tiles = checkerTexture(0xf0f0f0, 0x8a8a8a, 4, 512);
    tiles.repeat = [1, (zf + hd) / W];
    const floor = new Mesh(new PlaneGeometry(W, zf + hd), new MeshStandardMaterial({ name: "checker", map: tiles, roughness: 0.5 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, (zf - hd) / 2);
    add(floor, "floor");

    // Painted boxes: left face red, front face green, the other faces white. Rotated about y about their own centre.
    const paintedBox = (name: string, cx: number, cz: number, w: number, h: number, d: number, yaw: number) => {
      const c = Math.cos(yaw), s = Math.sin(yaw);
      const p = (x: number, y: number, z: number): V3 => [cx + x * c + z * s, y, cz - x * s + z * c];
      const x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2;
      add(quad(p(x0, 0, z1), p(x0, h, z1), p(x0, h, z0), p(x0, 0, z0), red), `${name}-left`);
      add(quad(p(x0, 0, z1), p(x1, 0, z1), p(x1, h, z1), p(x0, h, z1), green), `${name}-front`);
      add(quad(p(x1, 0, z1), p(x1, 0, z0), p(x1, h, z0), p(x1, h, z1), white), `${name}-right`);
      add(quad(p(x0, 0, z0), p(x0, h, z0), p(x1, h, z0), p(x1, 0, z0), white), `${name}-back`);
      add(quad(p(x0, h, z1), p(x1, h, z1), p(x1, h, z0), p(x0, h, z0), white), `${name}-top`);
    };
    paintedBox("short", -1.1, -0.8, 0.85, 0.85, 0.85, 0.32);
    paintedBox("tall", 1.2, -0.3, 0.7, 2.9, 0.6, 0.3);

    // Lamp: a round emissive ball under the ceiling, with a point light of the same radius inside.
    bulbMat = new MeshStandardMaterial({ name: "bulb", color: 0x000000, emissive: 0xffffff, emissiveIntensity: 2000 });
    const bulb = new Mesh(new SphereGeometry(0.2, 48, 32), bulbMat);
    bulb.castShadow = false;
    bulb.position.set(0.15, H - 0.62, -0.6);
    add(bulb, "bulb");
    lamp = new PointLight(0xfff4e8, 110, 0, 2);
    lamp.name = "lamp";
    lamp.radius = 0.2;
    lamp.position.set(0.15, H - 0.62, -0.6);
    // The wire it hangs from.
    const wire = new Mesh(new BoxGeometry(0.008, 0.47, 0.008), new MeshStandardMaterial({ name: "wire", color: 0x111111, roughness: 0.6 }));
    wire.position.set(0.15, H - 0.235, -0.6);
    add(wire, "wire");
    scene.add(lamp);

    // Chrome sphere (an instance) and glass sphere.
    chromeMat = new MeshPhysicalMaterial({ name: "chrome", color: 0xf6f6f6, metalness: 1, roughness: 0.02 });
    chromeInst = new InstancedMesh(new SphereGeometry(R, 64, 48), chromeMat, 1);
    chromeInst.name = "chrome";
    placeRoll(chromeInst, CHROME_HOME, 0);
    scene.add(chromeInst);
    glassMat = new MeshPhysicalMaterial({ name: "glass", color: 0xffffff, transmission: 1, ior: 1.5, roughness: 0 });
    const glass = new Mesh(new SphereGeometry(R, 128, 96), glassMat);
    glass.position.set(...GLASS_AT);
    add(glass, "glass");

    // Turbine gear (one instance, one merged mesh), steel with a satin finish.
    const steel = new MeshPhysicalMaterial({ name: "steel", color: 0xe2e6ea, metalness: 1, roughness: 0.26 });
    gearInst = new InstancedMesh(turbineGeometry(GEAR), steel, 1);
    gearInst.name = "turbine-gear";
    placeSpin(gearInst, GEAR_AT, GEAR_TILT.yaw, GEAR_TILT.pitch, 0);
    scene.add(gearInst);

    // A wide, low camera as in the reference (4:3).
    const camera = new PerspectiveCamera(40, 4 / 3, 0.05, 100);
    camera.name = "camera";
    camera.position.set(0.05, 0.95, 5.4);
    camera.lookAt(0.05, 0.9, -0.5);
    camera.setManualExposure(6.4);
    scene.add(camera);
    return { scene, camera, options: { name: "test-room" } };
  },
  handlers: {
    set(tx, ev: Partial<State>) {
      for (const k of ["roughness", "metalness", "ior", "lamp", "motion"] as const) {
        if (typeof ev[k] === "number" && Number.isFinite(ev[k])) tx.state[k] = ev[k] as number;
      }
    },
  },
  frame(f) {
    const s = f.state;
    chromeMat.roughness = s.roughness;
    chromeMat.metalness = s.metalness;
    // The engine compares colour, roughness and metalness every frame; IOR is not among them and needs `needsUpdate`.
    if (glassMat.ior !== s.ior) { glassMat.ior = s.ior; glassMat.needsUpdate = true; }
    lamp.intensity = 110 * s.lamp;
    bulbMat.emissiveIntensity = 2000 * s.lamp;

    // The motion clock only runs while motion is on, so pausing holds the pose (and the denoiser history settles).
    clock += f.dt * (s.motion > 0 ? 1 : 0);
    const t = clock;
    const k = Math.floor(t / CYCLE), u = Math.min((t % CYCLE) / BURST, 1);
    const p = k + u * u * (3 - 2 * u);
    placeSpin(gearInst, GEAR_AT, GEAR_TILT.yaw, GEAR_TILT.pitch, ((Math.PI * 2) / GEAR.teeth) * TEETH_PER_CYCLE * p);
    placeRoll(chromeInst, CHROME_HOME, 0.25 * Math.sin(Math.PI * 2 * p));
  },
});
