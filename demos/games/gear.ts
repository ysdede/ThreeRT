// A spur gear as one closed mesh: trapezoid teeth on a root circle, a centre bore, flat faces front and back, and
// side walls with their own normals (sharp machined edges). Standard proportions: module m = 2 * pitch radius / teeth,
// addendum m, dedendum 1.25 m. Two gears mesh when their centres are (r1 + r2) apart and the second is turned half a
// tooth; their angular speeds are in the inverse ratio of their teeth.
import { BufferGeometry } from "@threert/scene";

export interface GearSpec { teeth: number; pitchRadius: number; depth: number; bore: number }

export function gearGeometry({ teeth, pitchRadius, depth, bore }: GearSpec): BufferGeometry {
  const m = (2 * pitchRadius) / teeth;
  const ra = pitchRadius + m;          // tip
  const rf = pitchRadius - 1.25 * m;   // root
  // Outline: per tooth, root -> flank up -> tip land -> flank down (tip narrower than root: a trapezoid tooth).
  const outline: [number, number][] = [];
  for (let k = 0; k < teeth; k++) {
    const a = (k / teeth) * Math.PI * 2;
    const p = (Math.PI * 2) / teeth;
    for (const [f, r] of [[0.0, rf], [0.18, rf], [0.33, ra], [0.5, ra], [0.65, rf], [1.0, rf]] as const) {
      if (f === 1.0) continue;
      const t = a + f * p;
      outline.push([Math.cos(t) * r, Math.sin(t) * r]);
    }
  }
  const n = outline.length;
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  const vert = (x: number, y: number, z: number, nx: number, ny: number, nz: number) => {
    pos.push(x, y, z); nor.push(nx, ny, nz); uv.push(x / (2 * ra) + 0.5, y / (2 * ra) + 0.5);
    return pos.length / 3 - 1;
  };
  const h = depth / 2;
  // Faces: a ring from the bore circle to the outline, front (+z) and back (-z).
  for (const [z, nz] of [[h, 1], [-h, -1]] as const) {
    const o: number[] = [], b: number[] = [];
    for (let i = 0; i < n; i++) {
      const [x, y] = outline[i];
      const ang = Math.atan2(y, x);
      o.push(vert(x, y, z, 0, 0, nz));
      b.push(vert(Math.cos(ang) * bore, Math.sin(ang) * bore, z, 0, 0, nz));
    }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      if (nz > 0) idx.push(b[i], o[i], o[j], b[i], o[j], b[j]);
      else idx.push(b[i], o[j], o[i], b[i], b[j], o[j]);
    }
  }
  // Outer side walls: one quad per outline segment, normal facing out.
  for (let i = 0; i < n; i++) {
    const [x0, y0] = outline[i];
    const [x1, y1] = outline[(i + 1) % n];
    let nx = y1 - y0, ny = -(x1 - x0);
    const l = Math.hypot(nx, ny) || 1;
    nx /= l; ny /= l;
    const a = vert(x0, y0, h, nx, ny, 0), b = vert(x1, y1, h, nx, ny, 0), c = vert(x1, y1, -h, nx, ny, 0), d = vert(x0, y0, -h, nx, ny, 0);
    idx.push(a, d, c, a, c, b);
  }
  // Bore wall: normals pointing to the axis.
  const seg = 48;
  for (let i = 0; i < seg; i++) {
    const t0 = (i / seg) * Math.PI * 2, t1 = ((i + 1) / seg) * Math.PI * 2;
    const [c0, s0, c1, s1] = [Math.cos(t0), Math.sin(t0), Math.cos(t1), Math.sin(t1)];
    const a = vert(c0 * bore, s0 * bore, h, -c0, -s0, 0), b = vert(c1 * bore, s1 * bore, h, -c1, -s1, 0);
    const c = vert(c1 * bore, s1 * bore, -h, -c1, -s1, 0), d = vert(c0 * bore, s0 * bore, -h, -c0, -s0, 0);
    idx.push(a, b, c, a, c, d);
  }
  const g = new BufferGeometry();
  g.setData(pos, nor, uv, idx);
  return g;
}

/** Tip radius of a gear (for placement on the floor). */
export const tipRadius = (s: GearSpec) => s.pitchRadius + (2 * s.pitchRadius) / s.teeth;
