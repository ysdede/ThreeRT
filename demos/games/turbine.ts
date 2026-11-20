// A turbine gear as ONE closed mesh (so the browser engine can turn it in place as a single instance):
//   - a toothed rim (spur gear, `teeth` trapezoid teeth),
//   - a web of curved vanes between the rim and the hub (openings between them),
//   - an impeller hub: a core, `fins` thin radial blades each twisted about its own radial axis, a nut and a ring.
// The gear's axis is +z; the front (the impeller) faces +z. Dimensions in metres.
import { BufferGeometry, BoxGeometry, CylinderGeometry, TorusGeometry, Matrix4, Vector3 } from "@threert/scene";
import { gearGeometry } from "./gear.ts";

export interface TurbineSpec {
  teeth: number;      // teeth on the rim
  pitchRadius: number;
  rimDepth: number;   // rim thickness along the axis
  webRadius: number;  // inner radius of the rim, where the vanes meet it
  hubRadius: number;  // outer radius of the impeller hub
  fins: number;       // blades of the impeller
  vanes: number;      // curved vanes of the web
}

interface Part { geo: BufferGeometry; m: Matrix4 }

/** Merges rigid-transformed geometries into one (normals follow the rotation; no non-uniform scale is used here). */
function merge(parts: Part[]): BufferGeometry {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  const v = new Vector3(), n = new Vector3();
  for (const { geo, m } of parts) {
    const base = pos.length / 3;
    const p = geo.positions, nn = geo.normals, t = geo.uvs, ix = geo.index;
    const count = p.length / 3;
    for (let i = 0; i < count; i++) {
      v.set(p[3 * i], p[3 * i + 1], p[3 * i + 2]).applyMatrix4(m);
      n.set(nn[3 * i], nn[3 * i + 1], nn[3 * i + 2]).transformDirection(m);
      pos.push(v.x, v.y, v.z);
      nor.push(n.x, n.y, n.z);
      uv.push(t[2 * i] ?? 0, t[2 * i + 1] ?? 0);
    }
    if (ix.length) for (let i = 0; i < ix.length; i++) idx.push(base + ix[i]);
    else for (let i = 0; i < count; i++) idx.push(base + i);
  }
  return new BufferGeometry().setData(pos, nor, uv, idx);
}

const T = (x: number, y: number, z: number) => new Matrix4().makeTranslation(x, y, z);
const RX = (a: number) => new Matrix4().makeRotationX(a);
const RY = (a: number) => new Matrix4().makeRotationY(a);
const RZ = (a: number) => new Matrix4().makeRotationZ(a);
const mul = (...ms: Matrix4[]) => ms.reduce((a, b) => new Matrix4().multiplyMatrices(a, b));

export function turbineGeometry(s: TurbineSpec): BufferGeometry {
  const parts: Part[] = [];
  // Rim: the toothed ring from webRadius out to the tips.
  parts.push({ geo: gearGeometry({ teeth: s.teeth, pitchRadius: s.pitchRadius, depth: s.rimDepth, bore: s.webRadius }), m: new Matrix4() });

  // Web: curved vanes (each a box swept at an angle to the radius) between the hub and the rim; they sit behind the
  // rim's mid plane so the front shows the rim standing proud of the web.
  const webLen = s.webRadius - s.hubRadius + 0.01;
  for (let k = 0; k < s.vanes; k++) {
    const a = (k / s.vanes) * Math.PI * 2;
    const geo = new BoxGeometry(webLen, s.rimDepth * 0.42, s.rimDepth * 0.34);
    // centre radius (hub + webLen / 2), swept 0.45 rad off radial, set back 0.018 of the rim's front.
    parts.push({ geo, m: mul(RZ(a), T((s.hubRadius + webLen / 2) * 0.99, 0, -s.rimDepth * 0.12), RZ(0.45)) });
  }
  // A solid back plate so the openings between the vanes are not see-through to the wall behind.
  parts.push({ geo: new CylinderGeometry(s.webRadius, s.webRadius, s.rimDepth * 0.1, 96), m: mul(T(0, 0, -s.rimDepth * 0.38), RX(Math.PI / 2)) });

  // Impeller hub: core, blades, nut, ring.
  parts.push({ geo: new CylinderGeometry(s.hubRadius, s.hubRadius * 1.04, s.rimDepth * 0.7, 64), m: mul(T(0, 0, s.rimDepth * 0.1), RX(Math.PI / 2)) });
  const bladeIn = s.hubRadius * 0.34, bladeOut = s.hubRadius * 0.98, bladeLen = bladeOut - bladeIn;
  for (let k = 0; k < s.fins; k++) {
    const a = (k / s.fins) * Math.PI * 2;
    const geo = new BoxGeometry(bladeLen, s.rimDepth * 0.03, s.rimDepth * 0.5);
    // radial blade standing on the hub's front face, twisted 0.55 rad about its own radial (x) axis.
    parts.push({ geo, m: mul(RZ(a), T((bladeIn + bladeOut) / 2, 0, s.rimDepth * 0.5), RX(0.55)) });
  }
  parts.push({ geo: new CylinderGeometry(s.hubRadius * 0.3, s.hubRadius * 0.3, s.rimDepth * 0.9, 32), m: mul(T(0, 0, s.rimDepth * 0.5), RX(Math.PI / 2)) });
  parts.push({ geo: new TorusGeometry(s.hubRadius * 0.32, s.hubRadius * 0.05, 16, 48), m: T(0, 0, s.rimDepth * 0.97) });
  parts.push({ geo: new TorusGeometry(s.hubRadius * 1.0, s.hubRadius * 0.05, 16, 64), m: T(0, 0, s.rimDepth * 0.45) });
  return merge(parts);
}
