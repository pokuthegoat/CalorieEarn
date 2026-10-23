// Rebuilds assets/phone.glb from the Sketchfab download. Needs: npm i @gltf-transform/core@4 @gltf-transform/extensions@4 @gltf-transform/functions@4 meshoptimizer
// Usage: node tools/build-phone.mjs D:/Downloads/free_iphone_13_pro_2021.glb assets/phone.glb
// One phone only, then weld/simplify/meshopt-compress for the web.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { prune, dedup, weld, simplify, quantize, reorder, textureCompress } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(process.argv[2]);
const root = doc.getRoot();
for (const n of root.listNodes()) if (n.getName() === 'Iphone.001_1') { n.traverse(c => c.dispose()); }
// The Apple logo is a patch of the shiny frame mesh (GOLD) flush with the back: move those triangles onto the
// back's material so the logo disappears into the back without leaving a hole.
const backMat = root.listMaterials().find(m => m.getName() === 'Back');
for (const n of root.listNodes()) {
  const prim = n.getMesh()?.listPrimitives()[0];
  if (!prim || prim.getMaterial()?.getName() !== 'GOLD') continue;
  const pos = prim.getAttribute('POSITION'), idx = prim.getIndices().getArray();
  const inLogo = (i) => { const v = pos.getElement(i, []); return Math.abs(v[0]) < 0.2 && v[1] > -41 && v[1] < -25 && v[2] > -2 && v[2] < 12; };
  const keep = [], logo = [];
  for (let t = 0; t < idx.length; t += 3) {
    const tri = [idx[t], idx[t + 1], idx[t + 2]];
    (tri.every(inLogo) ? logo : keep).push(...tri);
  }
  console.log('logo triangles moved:', logo.length / 3);
  const Arr = idx.constructor;
  prim.getIndices().setArray(new Arr(keep));
  const lp = prim.clone();
  lp.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Arr(logo)).setBuffer(root.listBuffers()[0]));
  lp.setMaterial(backMat);
  n.getMesh().addPrimitive(lp);
}
await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
await doc.transform(
  prune(), dedup(), weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: 0.5, error: 0.0004, lockBorder: true }),
  reorder({ encoder: MeshoptEncoder }), quantize(), prune(),
);
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
await io.write(process.argv[3], doc);
