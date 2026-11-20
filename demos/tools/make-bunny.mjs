// Run: npm install --no-save draco3d (anywhere), then  DRACO3D_PACKAGE=<that folder>/node_modules/draco3d node demos/tools/make-bunny.mjs [yaw degrees]
// (The committed demos/assets/models/stanford_bunny.glb is its output; the page needs the file, not this script.)
// Decodes the Stanford Bunny that ships (Draco-compressed) in the draco3d npm package, normalises it and writes a GLB.
// Height 0.82 m, lowest vertex at y = 0, centred in X/Z by its AABB; smooth area-weighted vertex normals.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const dir = (process.env.DRACO3D_PACKAGE ?? "node_modules/draco3d").replace(/[\/]*$/, "/");
const draco = await createRequire(dir)("./draco3d.js").createDecoderModule({});
const buf = readFileSync(dir + "bunny.drc");
const dec = new draco.Decoder();
const db = new draco.DecoderBuffer(); db.Init(new Int8Array(buf), buf.length);
if (dec.GetEncodedGeometryType(db) !== draco.TRIANGULAR_MESH) throw new Error("not a mesh");
const mesh = new draco.Mesh();
const st = dec.DecodeBufferToMesh(db, mesh);
if (!st.ok()) throw new Error(st.error_msg());
const nv = mesh.num_points(), nf = mesh.num_faces();
const posAttr = dec.GetAttributeByUniqueId(mesh, 0) ?? dec.GetAttribute(mesh, dec.GetAttributeId(mesh, draco.POSITION));
const pa = new draco.DracoFloat32Array(); dec.GetAttributeFloatForAllPoints(mesh, posAttr, pa);
let P = new Float32Array(nv * 3); for (let i = 0; i < nv * 3; i++) P[i] = pa.GetValue(i);
const ia = new draco.DracoInt32Array(); const I = new Uint32Array(nf * 3);
for (let f = 0; f < nf; f++) { dec.GetFaceFromMesh(mesh, f, ia); I[f * 3] = ia.GetValue(0); I[f * 3 + 1] = ia.GetValue(1); I[f * 3 + 2] = ia.GetValue(2); }
console.log("decoded", nv, "vertices", nf, "triangles");
// bounds
const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
for (let i = 0; i < nv; i++) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], P[i * 3 + k]); mx[k] = Math.max(mx[k], P[i * 3 + k]); }
console.log("raw bounds", mn.map((x) => +x.toFixed(4)), mx.map((x) => +x.toFixed(4)));
const yaw = Number(process.argv[2] ?? 0) * Math.PI / 180; // optional pre-rotation about Y (degrees)
const c = Math.cos(yaw), s = Math.sin(yaw);
for (let i = 0; i < nv; i++) { const x = P[i * 3], z = P[i * 3 + 2]; P[i * 3] = x * c + z * s; P[i * 3 + 2] = -x * s + z * c; }
mn.fill(1e9); mx.fill(-1e9);
for (let i = 0; i < nv; i++) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], P[i * 3 + k]); mx[k] = Math.max(mx[k], P[i * 3 + k]); }
const sc = 0.82 / (mx[1] - mn[1]);
const cx = (mn[0] + mx[0]) / 2, cz = (mn[2] + mx[2]) / 2;
for (let i = 0; i < nv; i++) { P[i * 3] = (P[i * 3] - cx) * sc; P[i * 3 + 1] = (P[i * 3 + 1] - mn[1]) * sc; P[i * 3 + 2] = (P[i * 3 + 2] - cz) * sc; }
// normals
const N = new Float32Array(nv * 3);
for (let f = 0; f < nf; f++) {
  const a = I[f * 3], b = I[f * 3 + 1], d = I[f * 3 + 2];
  const u = [0, 1, 2].map((k) => P[b * 3 + k] - P[a * 3 + k]), v = [0, 1, 2].map((k) => P[d * 3 + k] - P[a * 3 + k]);
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  for (const q of [a, b, d]) for (let k = 0; k < 3; k++) N[q * 3 + k] += n[k];
}
for (let i = 0; i < nv; i++) { const l = Math.hypot(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]) || 1; for (let k = 0; k < 3; k++) N[i * 3 + k] /= l; }
// outward check: normals should point away from the centroid on average
let dots = 0; for (let i = 0; i < nv; i++) dots += N[i * 3] * (P[i * 3]) + N[i * 3 + 1] * (P[i * 3 + 1] - 0.4) + N[i * 3 + 2] * P[i * 3 + 2];
console.log("mean outward dot", (dots / nv).toFixed(4), dots < 0 ? "(INWARD: flipping winding)" : "(outward)");
if (dots < 0) { for (let f = 0; f < nf; f++) { const t = I[f * 3 + 1]; I[f * 3 + 1] = I[f * 3 + 2]; I[f * 3 + 2] = t; } for (let i = 0; i < N.length; i++) N[i] = -N[i]; }
const fin = [[1e9, 1e9, 1e9], [-1e9, -1e9, -1e9]];
for (let i = 0; i < nv; i++) for (let k = 0; k < 3; k++) { fin[0][k] = Math.min(fin[0][k], P[i * 3 + k]); fin[1][k] = Math.max(fin[1][k], P[i * 3 + k]); }
console.log("final bounds", fin[0].map((x) => +x.toFixed(4)), fin[1].map((x) => +x.toFixed(4)));
// GLB
const pb = Buffer.from(P.buffer), nb = Buffer.from(N.buffer), ib = Buffer.from(I.buffer);
const bin = Buffer.concat([pb, nb, ib]);
const json = { asset: { version: "2.0", generator: "threert-lab make-bunny.mjs (Stanford Bunny via draco3d bunny.drc)" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: "stanford_bunny" }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
  materials: [{ name: "clay", pbrMetallicRoughness: { baseColorFactor: [0.9, 0.9, 0.87, 1], metallicFactor: 0, roughnessFactor: 0.83 } }],
  accessors: [{ bufferView: 0, componentType: 5126, count: nv, type: "VEC3", min: fin[0], max: fin[1] }, { bufferView: 1, componentType: 5126, count: nv, type: "VEC3" }, { bufferView: 2, componentType: 5125, count: nf * 3, type: "SCALAR" }],
  bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: pb.length, target: 34962 }, { buffer: 0, byteOffset: pb.length, byteLength: nb.length, target: 34962 }, { buffer: 0, byteOffset: pb.length + nb.length, byteLength: ib.length, target: 34963 }],
  buffers: [{ byteLength: bin.length }] };
let js = Buffer.from(JSON.stringify(json)); js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
const bp = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + bp.length, 8);
const ch = (len, type) => { const b = Buffer.alloc(8); b.writeUInt32LE(len, 0); b.writeUInt32LE(type, 4); return b; };
const out = fileURLToPath(new URL("../assets/models/stanford_bunny.glb", import.meta.url));
writeFileSync(out, Buffer.concat([head, ch(js.length, 0x4e4f534a), js, ch(bp.length, 0x004e4942), bp]));
console.log("wrote", out, nf, "triangles");
