/* LithoBlast3D móvil — SIMULAR la labor con el diseño elegido.
   Escena a escala real: frente (galería), tajeo (corte y relleno, perforación en breasting) o chimenea
   (perforación hacia arriba desde una plataforma). Equipo con las medidas del catálogo (jumbo) o perforación
   manual (jackleg / stoper con operador y juego de barrenos). Fases: perforación → carguío → voladura por
   retardos → humo → material desplazado y nuevo frente.
   La física de los fragmentos es ILUSTRATIVA: cada bloque sale con su taladro más cercano y cae con gravedad. */

import { crearTrabajador, crearJackleg, crearScoop } from "./modelos3d.js";
import { crearSonido } from "./sonido.js";

const PIE = 0.3048;

/* -------------------------------------------------------------- texturas procedurales */
function texturaRoca(THREE, base = [104, 96, 88], semilla = 7) {
  const N = 256, c = document.createElement("canvas");
  c.width = c.height = N;
  const g = c.getContext("2d");
  let x = semilla * 9973;
  const az = () => ((x = (x * 16807) % 2147483647) / 2147483647);
  g.fillStyle = `rgb(${base.join(",")})`;
  g.fillRect(0, 0, N, N);
  for (let i = 0; i < 2600; i++) {               // granos y manchas
    const r = 1 + az() * 7, k = (az() - 0.5) * 46;
    g.fillStyle = `rgba(${base.map((v) => Math.max(0, Math.min(255, v + k))).join(",")},${0.25 + az() * 0.5})`;
    g.beginPath(); g.arc(az() * N, az() * N, r, 0, 7); g.fill();
  }
  g.strokeStyle = "rgba(30,26,22,.32)";            // fisuras
  for (let i = 0; i < 6; i++) {
    g.lineWidth = 0.6 + az() * 1.4;
    g.beginPath();
    let px = az() * N, py = az() * N;
    g.moveTo(px, py);
    for (let k = 0; k < 6; k++) { px += (az() - 0.5) * 60; py += (az() - 0.5) * 60; g.lineTo(px, py); }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function texturaHumo(THREE) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, "rgba(200,196,190,.9)");
  gr.addColorStop(1, "rgba(200,196,190,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/* -------------------------------------------------------------- colores de explosivos */
export const COLOR_EXP = (nombre) => {
  const n = (nombre || "").toLowerCase();
  if (n.includes("5000")) return 0xb8326f;
  if (n.includes("3000")) return 0xd9433a;
  if (n.includes("1000")) return 0x3fae4a;
  if (n.includes(" 500") || n.includes("500,")) return 0x8fd06a;
  if (n.includes("anfo")) return 0xe8d9a8;
  if (n.includes("dinam") || n.includes("gelatin") || n.includes("semexsa")) return 0xd98a2b;
  return 0xe07a3a;
};

export function crearLabor(caja, E, THREE, OrbitControls) {
  caja.innerHTML = "";
  caja.style.position = "relative";
  const W = caja.clientWidth || 360, H = caja.clientHeight || 520;
  const ren = new THREE.WebGLRenderer({ antialias: true });
  ren.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  ren.setSize(W, H);
  ren.setClearColor(0x0d0f12);
  caja.appendChild(ren.domElement);
  const sc = new THREE.Scene();
  sc.fog = new THREE.Fog(0x0d0f12, 18, 60);
  sc.add(new THREE.HemisphereLight(0xdfe6ee, 0x4a4036, 1.15));
  const luz = new THREE.DirectionalLight(0xffffff, 1.1);
  luz.position.set(3, 6, 8);
  sc.add(luz);
  const cam = new THREE.PerspectiveCamera(50, W / H, 0.03, 400);
  const ctl = new OrbitControls(cam, ren.domElement);
  ctl.enableDamping = true;
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const az = (() => { let x = 2468; return () => ((x = (x * 16807) % 2147483647) / 2147483647); })();

  const labor = E.labor || "frente";
  const chim = labor === "chimenea";
  const L = E.L || 6 * PIE;
  const avance = Math.min(E.avance || 0.9 * L, L);
  const eq = E.equipo || { tipo: chim ? "stoper" : "jackleg", brazos: 1 };
  const manual = eq.tipo !== "jumbo";
  const xs = E.contorno.map((p) => p[0]), ys = E.contorno.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const ancho = Math.max(...xs) - Math.min(...xs), alto = Math.max(...ys) - Math.min(...ys);
  const piso0 = 0;

  /* plano del diseño (x, y) a profundidad d → mundo.
     frente / tajeo: frente vertical en z = 0, la roca hacia −z, la galería hacia +z, y arriba.
     chimenea: el techo en y = 0, los taladros hacia +y; (x, y) del plano → (x, z). */
  const P = chim ? (x, y, d) => V3(x - cx, d, y - cy) : (x, y, d) => V3(x - cx, y, -d);
  const dirDe = (t) => {
    if (chim) return V3(0, 1, 0);
    const a = (t.azimut_rel || 0) * Math.PI / 180;
    return V3(Math.sin(a), 0, -Math.cos(a)).normalize();
  };

  const texRoca = texturaRoca(THREE);
  const texRelleno = texturaRoca(THREE, [150, 138, 112], 3);
  const matPared = new THREE.MeshStandardMaterial({ map: texRoca, bumpMap: texRoca, bumpScale: 0.03, roughness: 0.95, side: THREE.BackSide });
  const matFrente = new THREE.MeshStandardMaterial({ map: texRoca, bumpMap: texRoca, bumpScale: 0.03, roughness: 0.95, transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false });
  const matMacizo = new THREE.MeshStandardMaterial({ map: texRoca, color: 0x8d8174, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });

  /* -------------------------------------------------------------- tubo (paredes) a lo largo de un eje */
  function tubo(pol, d0, d1, mat) {
    // normales hacia afuera: con BackSide se ve la cara interior desde dentro y, desde fuera, el interior opuesto
    let ar = 0;
    for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) ar += pol[j][0] * pol[i][1] - pol[i][0] * pol[j][1];
    if (ar < 0) pol = pol.slice().reverse();
    const pos = [], uv = [];
    let per = 0;
    const n = pol.length;
    for (let i = 0; i < n; i++) {
      const [xa, ya] = pol[i], [xb, yb] = pol[(i + 1) % n];
      const l = Math.hypot(xb - xa, yb - ya);
      const a0 = P(xa, ya, d0), b0 = P(xb, yb, d0), a1 = P(xa, ya, d1), b1 = P(xb, yb, d1);
      pos.push(...a0.toArray(), ...b1.toArray(), ...b0.toArray(), ...a0.toArray(), ...a1.toArray(), ...b1.toArray());
      const u0 = per / 1.5, u1 = (per + l) / 1.5, v0 = d0 / 1.5, v1 = d1 / 1.5;
      uv.push(u0, v0, u1, v1, u1, v0, u0, v0, u0, v1, u1, v1);
      per += l;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    sc.add(m);
    return m;
  }
  function tapa(pol, d, mat) {
    const sh = new THREE.Shape(pol.map(([x, y]) => new THREE.Vector2(x - cx, chim ? y - cy : y)));
    const g = new THREE.ShapeGeometry(sh);
    const p = g.attributes.position, uv = [];
    for (let i = 0; i < p.count; i++) uv.push(p.getX(i) / 1.5, p.getY(i) / 1.5);
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    const m = new THREE.Mesh(g, mat);
    if (chim) { m.rotation.x = Math.PI / 2; m.position.y = d; } else m.position.z = -d;
    sc.add(m);
    return m;
  }

  /* -------------------------------------------------------------- la labor ya excavada */
  let largoGal, alturaLibre = alto;
  const pol = E.contorno;
  let polGal = pol;                         // sección de la labor por donde se trabaja
  if (labor === "tajeo") {                  // espacio abierto del tajeo sobre el relleno (más alto que el corte)
    alturaLibre = Math.max(alto, 2.2);
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    polGal = [[x0, 0], [x1, 0], [x1, alturaLibre], [x0, alturaLibre]];
  }
  const Hr = 4.5;                              // chimenea: altura ya excavada bajo el techo (visual)
  const yPlat = -1.95;                       // plataforma de trabajo en la chimenea

  // equipo: medidas
  const feedL = (eq.long_perforacion_max || 3.4) + 1.3;
  const zPivote = manual ? 0 : feedL * 0.55 + 2.4;
  const SC = !chim && E.scoop ? E.scoop : null;            // scoop para la limpieza (si cabe en la sección)
  largoGal = chim ? Hr : Math.max(manual ? 14 : zPivote + (eq.largo || 11) + 9, SC ? (SC.largo || 8.7) + 14 : 0);

  if (chim) {
    tubo(pol, -Hr, 0, matPared);                                  // paredes de la chimenea
    const fondo = tapa(pol, -Hr, new THREE.MeshStandardMaterial({ map: texRoca, roughness: 1, side: THREE.DoubleSide }));
    fondo.material.color.set(0x7d7368);
  } else {
    tubo(polGal, -largoGal, 0, matPared);                          // paredes de la galería / tajeo
    if (labor === "tajeo") {
      texRelleno.repeat.set(ancho / 1.5, largoGal / 1.5);
      const r = new THREE.Mesh(new THREE.BoxGeometry(ancho, 0.06, largoGal), new THREE.MeshStandardMaterial({ map: texRelleno, roughness: 1 }));
      r.position.set(0, 0.03 - 0.06, largoGal / 2); sc.add(r);
      if (alturaLibre > alto + 0.05) {                             // pared de roca sobre el corte, en el frente
        const sobre = tapa([[Math.min(...xs), alto], [Math.max(...xs), alto], [Math.max(...xs), alturaLibre], [Math.min(...xs), alturaLibre]], 0,
          new THREE.MeshStandardMaterial({ map: texRoca, roughness: 1, side: THREE.DoubleSide }));
        sobre.position.z = -0.002;
      }
    }
  }
  // frente actual (cara de la roca) y macizo de la ronda
  const cara = tapa(pol, 0, matFrente);
  const ronda = tubo(pol, 0, avance, matMacizo);
  const tapaRonda = tapa(pol, avance, matMacizo);
  const resto = [tubo(pol, avance, L + 0.6, matMacizo), tapa(pol, L + 0.6, matMacizo)];
  // tramo que queda excavado después de la voladura (oculto hasta el final)
  const nuevoTramo = tubo(pol, 0, avance, matPared);
  const nuevaCara = tapa(pol, avance, new THREE.MeshStandardMaterial({ map: texRoca, bumpMap: texRoca, bumpScale: 0.03, roughness: 0.95, side: THREE.DoubleSide }));
  nuevoTramo.visible = nuevaCara.visible = false;
  const contornoLinea = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pol.map(([x, y]) => P(x, y, 0.001))), new THREE.LineBasicMaterial({ color: 0xe8ebef }));
  sc.add(contornoLinea);

  /* -------------------------------------------------------------- taladros dentro de la roca */
  const cil = new THREE.CylinderGeometry(1, 1, 1, 12);
  const UP = V3(0, 1, 0);
  function cilEntre(m, a, b, r) {
    const d = b.clone().sub(a), l = d.length();
    m.visible = l > 1e-4;
    if (!m.visible) return;
    m.scale.set(r, l, r);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(UP, d.divideScalar(l));
  }
  const matVacio = new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 1, emissive: 0x111316 });
  const matTaco = new THREE.MeshStandardMaterial({ color: 0x9c8156, roughness: 1 });
  const matCebo = new THREE.MeshBasicMaterial({ color: 0xfff2a0 });
  const matCulo = new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 1 });
  const lc = E.lc || 8 * 0.0254;
  const tal = E.taladros.map((t, i) => {
    const a = P(t.x, t.y, 0), dir = dirDe(t), Lt = t.longitud || L;
    const alivio = t.tipo !== "cargado";
    const r = Math.max((t.diametro || 38) / 2000, 0.012) * 1.25;    // ligeramente engrosado para verse
    const hueco = new THREE.Mesh(cil, matVacio); sc.add(hueco);
    const anillo = new THREE.Mesh(new THREE.RingGeometry(r * 1.25, r * 1.9, 20), new THREE.MeshBasicMaterial({ color: alivio ? 0xffffff : t.color, side: THREE.DoubleSide }));
    anillo.position.copy(a).add(chim ? V3(0, -0.004, 0) : V3(0, 0, 0.004));
    if (chim) anillo.rotation.x = Math.PI / 2;
    sc.add(anillo);
    let carga = null, taco = null, cebo = null, culo = null, lCarga = 0;
    if (!alivio) {
      lCarga = Math.min(Math.max((t.cartuchos || 0) * lc, 0.3 * Lt), Lt - 0.25);
      carga = new THREE.Mesh(cil, new THREE.MeshStandardMaterial({ color: COLOR_EXP(t.explosivo), roughness: 0.5, emissive: COLOR_EXP(t.explosivo), emissiveIntensity: 0.15 }));
      taco = new THREE.Mesh(cil, matTaco);
      cebo = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), matCebo);
      culo = new THREE.Mesh(cil, matCulo);
      for (const m of [carga, taco, cebo, culo]) { m.visible = false; sc.add(m); }
    }
    return { ...t, i, a, dir, Lt, r, alivio, hueco, anillo, carga, taco, cebo, culo, lCarga, perf: 0, carg: 0, det: false };
  });
  const cargados = tal.filter((t) => !t.alivio);
  function ponerPerf(t, f) {
    t.perf = f;
    cilEntre(t.hueco, t.a, t.a.clone().add(t.dir.clone().multiplyScalar(t.Lt * f)), t.r);
    t.hueco.visible = f > 0 && !t.det;
    t.anillo.visible = true;
    t.anillo.material.opacity = f > 0 ? 1 : 0.35;
    t.anillo.material.transparent = true;
  }
  function ponerCarga(t, f) {
    t.carg = f;
    if (t.alivio) return;
    const fondo = t.a.clone().add(t.dir.clone().multiplyScalar(t.Lt));
    const l = t.lCarga * Math.min(f / 0.8, 1);
    const tope = fondo.clone().sub(t.dir.clone().multiplyScalar(l));
    cilEntre(t.carga, tope, fondo, t.r * 0.82);
    t.carga.visible = l > 0.001 && !t.det;
    t.cebo.visible = f > 0 && !t.det;
    t.cebo.scale.setScalar(t.r * 1.05);
    t.cebo.position.copy(fondo.clone().sub(t.dir.clone().multiplyScalar(Math.min(lc * 0.5, t.lCarga * 0.5))));
    const ft = Math.max((f - 0.8) / 0.2, 0);                       // taco al final
    const lTaco = Math.min(0.3, t.Lt - t.lCarga) * ft;
    cilEntre(t.taco, tope, tope.clone().sub(t.dir.clone().multiplyScalar(lTaco)), t.r * 0.82);
    t.taco.visible = lTaco > 0.001 && !t.det;
  }

  /* -------------------------------------------------------------- equipo de perforación */
  const amarillo = new THREE.MeshStandardMaterial({ color: 0xd9a51c, roughness: 0.55, metalness: 0.2 });
  const gris = new THREE.MeshStandardMaterial({ color: 0x5a6068, roughness: 0.5, metalness: 0.5 });
  const negro = new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.8 });
  const acero = new THREE.MeshStandardMaterial({ color: 0xb9c0c8, roughness: 0.3, metalness: 0.8 });
  const caja_ = (w, h, l, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, l), m);

  // operador (también para el carguío y el amarre): modelo con EPP; se agacha si la labor es baja
  function operador() {
    const g = crearTrabajador(THREE);
    sc.add(g);
    return g;
  }
  function operadorViejo() {
    const g = new THREE.Group();
    const ropa = new THREE.MeshStandardMaterial({ color: 0xe8752a, roughness: 0.8 });   // ropa con cinta reflectiva
    const piel = new THREE.MeshStandardMaterial({ color: 0xc89a78, roughness: 0.8 });
    const casco = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4 });
    const pierna = new THREE.CylinderGeometry(0.075, 0.07, 0.82, 8);
    for (const s of [-1, 1]) { const p = new THREE.Mesh(pierna, negro); p.position.set(s * 0.1, 0.41, 0); g.add(p); }
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.62, 10), ropa); torso.position.y = 1.15; g.add(torso);
    const cinta = new THREE.Mesh(new THREE.CylinderGeometry(0.172, 0.172, 0.05, 10), new THREE.MeshBasicMaterial({ color: 0xd8e0e0 })); cinta.position.y = 1.05; g.add(cinta);
    const cab = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), piel); cab.position.y = 1.58; g.add(cab);
    const ca = new THREE.Mesh(new THREE.SphereGeometry(0.135, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), casco); ca.position.y = 1.6; g.add(ca);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff6c8 })); lamp.position.set(0, 1.66, -0.12); g.add(lamp);
    const brazos = [-1, 1].map((s) => { const b = new THREE.Mesh(cil, ropa); g.add(b); return { b, hombro: V3(s * 0.2, 1.38, 0) }; });
    g.userData = { brazos };
    sc.add(g);
    return g;
  }
  // coloca al operador en el piso «pie» mirando hacia «mira» y lleva las manos a «manos»
  function ponerOperador(g, pie, mira, manos, inclinar = 0.12) {
    if (g.pose) {
      const agachar = chim ? 0 : Math.min(1, Math.max(0, (1.85 - alturaLibre) / 0.55));
      const alt = Array.isArray(manos) ? manos[0].y : manos.y;
      const bajo = Math.min(1, Math.max(0, (pie.y + 0.75 - alt) / 0.6));      // manos muy abajo → agacharse
      g.pose({ pie, mira, manos, agachar: Math.max(agachar, bajo * 0.8), inclinar });
      return;
    }
    const k = chim ? 1 : Math.min(1, (alturaLibre - 0.08) / 1.72);           // agacharse en labores bajas
    g.scale.set(1, k, 1);
    g.position.copy(pie);
    const d = mira.clone().sub(pie); d.y = 0;
    g.rotation.y = Math.atan2(-d.x, -d.z);
    g.updateMatrixWorld(true);
    for (const { b, hombro } of g.userData.brazos) {
      const h = g.localToWorld(hombro.clone());
      const m = manos.clone().add(V3((hombro.x > 0 ? 0.06 : -0.06), 0, 0));
      const l = Math.min(m.distanceTo(h), 0.72);
      const fin = h.clone().add(m.sub(h).normalize().multiplyScalar(l));
      const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
      const a = h.clone().applyMatrix4(inv), z = fin.applyMatrix4(inv);
      cilEntre(b, a, z, 0.05);
    }
  }

  const equipo = { grupo: new THREE.Group(), brazos: [] };
  sc.add(equipo.grupo);
  let op = null;                       // operador de la perforadora manual
  let carguero = operador();           // persona que carga los taladros
  carguero.visible = false;
  const atacador = new THREE.Mesh(cil, new THREE.MeshStandardMaterial({ color: 0xc9a46a })); sc.add(atacador); atacador.visible = false;
  let plataforma = null;

  if (!manual) {
    // jumbo electrohidráulico con las medidas del catálogo
    const A = eq.ancho || 2, Hh = eq.alto || 2.2, Lc = eq.largo || 11;
    const rw = Math.min(0.55, Hh * 0.24);
    const G = equipo.grupo;
    const chasis = caja_(A * 0.92, Hh * 0.32, Lc * 0.9, amarillo); chasis.position.set(0, rw * 0.9 + Hh * 0.16, Lc / 2); G.add(chasis);
    const motor = caja_(A * 0.86, Hh * 0.28, Lc * 0.28, amarillo); motor.position.set(0, rw * 0.9 + Hh * 0.46, Lc * 0.82); G.add(motor);
    const techo = caja_(A * 0.62, 0.06, 1.6, gris); techo.position.set(A * 0.1, Hh - 0.03, Lc * 0.42); G.add(techo);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const p = caja_(0.06, Hh - rw * 0.9 - Hh * 0.32, 0.06, negro);
      p.position.set(A * 0.1 + sx * A * 0.29, (Hh + rw * 0.9 + Hh * 0.32) / 2, Lc * 0.42 + sz * 0.75); G.add(p);
    }
    const asiento = caja_(0.45, 0.5, 0.5, negro); asiento.position.set(A * 0.1, rw * 0.9 + Hh * 0.32 + 0.25, Lc * 0.45); G.add(asiento);
    const rueda = new THREE.CylinderGeometry(rw, rw, Math.min(0.45, A * 0.2), 18);
    for (const sz of [Lc * 0.18, Lc * 0.75]) for (const sx of [-1, 1]) {
      const w = new THREE.Mesh(rueda, negro); w.rotation.z = Math.PI / 2; w.position.set(sx * (A / 2 - 0.2), rw, sz); G.add(w);
    }
    for (const sx of [-1, 1]) {                    // gatas de estabilización
      const g = caja_(0.12, rw * 1.6, 0.12, gris); g.position.set(sx * (A / 2 + 0.05), rw * 0.8, 0.3); G.add(g);
    }
    // carrete de cable eléctrico (atrás) y techo protector, como en los jumbos reales
    const carrete = new THREE.Group(); carrete.position.set(0, rw * 0.9 + Hh * 0.62, Lc * 0.98); G.add(carrete);
    for (const sx of [-1, 1]) { const d = new THREE.Mesh(new THREE.CylinderGeometry(Hh * 0.33, Hh * 0.33, 0.04, 28), amarillo); d.rotation.z = Math.PI / 2; d.position.x = sx * 0.28; carrete.add(d); }
    const tambor = new THREE.Mesh(new THREE.CylinderGeometry(Hh * 0.22, Hh * 0.22, 0.52, 20), negro); tambor.rotation.z = Math.PI / 2; carrete.add(tambor);
    const faro = new THREE.SpotLight(0xfff3d6, 18, 30, 0.7, 0.5); faro.position.set(0, Hh, 0.2); G.add(faro);
    faro.target.position.set(0, Hh * 0.6, -6); G.add(faro.target);
    const nB = Math.max(1, Math.min(eq.brazos || 1, 3));
    for (let k = 0; k < nB; k++) {
      const sx = nB === 1 ? 0 : (k / (nB - 1) - 0.5) * A * 0.55;
      const b = {
        pivoteLocal: V3(sx, rw * 0.9 + Hh * 0.32, 0.15),
        brazo: new THREE.Mesh(cil, amarillo), feed: caja_(0.17, 0.13, 1, new THREE.MeshStandardMaterial({ color: 0xc2c8ce, roughness: 0.3, metalness: 0.8 })), martillo: caja_(0.24, 0.24, 0.55, amarillo),
        barra: new THREE.Mesh(cil, acero), cilindro: new THREE.Mesh(cil, acero),
        actual: null, pos: null, dir: null,
      };
      for (const m of [b.brazo, b.feed, b.martillo, b.barra, b.cilindro]) sc.add(m);
      equipo.brazos.push(b);
    }
    equipo.grupo.position.set(0, piso0, zPivote);
  } else {
    // perforación manual: jackleg (frente / tajeo) o stoper (chimenea) con operador y juego de barrenos
    op = operador();
    const b = { jl: crearJackleg(THREE, sc), actual: null, pos: null, dir: null };
    equipo.brazos.push(b);
    if (chim) {
      plataforma = new THREE.Group();
      const tabla = new THREE.BoxGeometry(ancho * 0.98, 0.06, 0.24);
      const nT = Math.max(2, Math.floor(alto / 0.27));
      for (let k = 0; k < nT; k++) {
        const t = new THREE.Mesh(tabla, new THREE.MeshStandardMaterial({ color: 0x8a6a3e, roughness: 1 }));
        t.position.set(0, yPlat - 0.03, -alto / 2 + 0.13 + k * (alto - 0.26) / Math.max(nT - 1, 1)); plataforma.add(t);
      }
      for (const sz of [-1, 1]) { const p = new THREE.Mesh(cil, new THREE.MeshStandardMaterial({ color: 0x6b5230 })); p.rotation.z = Math.PI / 2; p.scale.set(0.07, ancho, 0.07); p.position.set(0, yPlat - 0.12, sz * alto * 0.35); plataforma.add(p); }
      sc.add(plataforma);
    }
  }

  // juego de barrenos (perforación manual): se cambia la barra a medida que avanza el taladro
  const JUEGO = [0.6, 1.2, 1.8, 2.4, 3.0].filter((x) => x <= (eq.long_perforacion_max || 2.44) + 0.61);
  const barraPara = (hecho) => JUEGO.find((x) => x >= hecho + 0.15) || JUEGO[JUEGO.length - 1];

  function ponerBrazo(b, collar, dir, hecho) {
    if (!manual) {
      // feed alineado con el taladro, centralizador apoyado en el collar
      const frente_ = collar.clone().sub(dir.clone().multiplyScalar(0.06));
      const atras = frente_.clone().sub(dir.clone().multiplyScalar(feedL));
      b.feed.visible = true;
      b.feed.scale.set(1, 1, feedL); b.feed.position.copy(atras).add(frente_).multiplyScalar(0.5);
      b.feed.quaternion.setFromUnitVectors(V3(0, 0, 1), dir.clone());
      const recorrido = Math.min(hecho, feedL - 0.7);
      const pm = atras.clone().add(dir.clone().multiplyScalar(0.35 + recorrido));
      b.martillo.visible = true;
      b.martillo.position.copy(pm); b.martillo.quaternion.copy(b.feed.quaternion);
      cilEntre(b.barra, pm, collar.clone().add(dir.clone().multiplyScalar(hecho)), 0.019);
      const piv = equipo.grupo.localToWorld(b.pivoteLocal.clone());
      const cuna = atras.clone().add(dir.clone().multiplyScalar(feedL * 0.45)).add(V3(0, -0.12, 0));
      cilEntre(b.brazo, piv, cuna, 0.11);
      cilEntre(b.cilindro, piv.clone().add(V3(0, -0.25, 0)), piv.clone().lerp(cuna, 0.55), 0.045);
      return;
    }
    // jackleg / stoper (modelo con barreno, pata neumática, mangueras de aire y agua y lubricador)
    const rodL = barraPara(hecho);
    const punta = collar.clone().add(dir.clone().multiplyScalar(hecho));
    const mFrente = punta.clone().sub(dir.clone().multiplyScalar(rodL));
    const mAtras = mFrente.clone().sub(dir.clone().multiplyScalar(0.58));
    const limX = (x, m = 0.25) => Math.max(Math.min(x, ancho / 2 - m), -ancho / 2 + m);
    if (chim) {
      // stoper: la pata va en línea con la máquina y se apoya en la plataforma
      const apoyo = V3(mAtras.x, yPlat, mAtras.z);
      const r = b.jl.poner({ punta, dir, rodL, apoyo, salidaAire: V3(limX(-ancho / 2 + 0.2, 0.1), yPlat, -alto / 2 + 0.2) });
      const pieOp = V3(limX(mAtras.x + 0.5), yPlat, Math.max(Math.min(mAtras.z + 0.3, alto / 2 - 0.2), -alto / 2 + 0.2));
      ponerOperador(op, pieOp, V3(mAtras.x, yPlat, mAtras.z), [r.atras.clone().add(V3(0, 0.12, 0)), r.atras.clone().lerp(r.frente, 0.5)], 0.05);
    } else {
      // jackleg: pata neumática desde la máquina hasta el piso, inclinada hacia atrás
      const apoyo = V3(limX(mAtras.x + 0.12, 0.1), piso0, mAtras.z + Math.max(0.85, (mAtras.y - piso0) * 0.8));
      const r = b.jl.poner({ punta, dir, rodL, apoyo, salidaAire: V3(limX(ancho / 2 - 0.15, 0.1), piso0, Math.min(largoGal - 1, mAtras.z + 4)) });
      const lado = mAtras.x > 0.15 ? -1 : 1;
      const pieOp = V3(limX(mAtras.x + lado * 0.42), piso0, r.mango.z + 0.42);
      const mano2 = r.atras.clone().lerp(r.frente, 0.45).add(V3(lado * 0.09, 0.08, 0));
      ponerOperador(op, pieOp, collar.clone().setY(piso0), [lado > 0 ? mano2 : r.mango, lado > 0 ? r.mango : mano2], 0.2);
    }
  }
  function verEquipo(on) {
    equipo.grupo.visible = on;
    for (const b of equipo.brazos) {
      for (const k of ["brazo", "feed", "martillo", "barra", "cilindro"]) if (b[k]) b[k].visible = on;
      if (b.jl) b.jl.visible = on;
    }
    if (op) op.visible = on;
  }

  /* -------------------------------------------------------------- reparto de taladros y orden de perforación */
  const nB = equipo.brazos.length;
  const orden = tal.slice().sort((p, q) => (chim ? (p.y - q.y) || (p.x - q.x) : (q.y - p.y) || (p.x - q.x)));
  const colas = Array.from({ length: nB }, () => []);
  if (nB === 1) colas[0] = orden;
  else {                                   // cada brazo perfora su lado del frente
    const s = orden.slice().sort((p, q) => p.x - q.x);
    s.forEach((t, k) => colas[Math.min(nB - 1, Math.floor(k * nB / s.length))].push(t));
    for (const c of colas) c.sort((p, q) => (q.y - p.y) || (p.x - q.x));
  }
  const DUR_P = Math.min(0.9, Math.max(0.28, 22 / tal.length));       // segundos de animación por taladro
  const DUR_C = Math.min(0.5, Math.max(0.12, 9 / Math.max(cargados.length, 1)));
  const tiempos = [...new Set(cargados.map((t) => t.retardo || 0))].sort((a, b) => a - b);
  const PASO_V = 0.32;

  /* -------------------------------------------------------------- fragmentos (bloques irregulares) */
  const areaSec = (() => { let a = 0; for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) a += pol[j][0] * pol[i][1] - pol[i][0] * pol[j][1]; return Math.abs(a / 2); })();
  const volRonda = areaSec * avance;
  const s = Math.min(Math.max(Math.cbrt(volRonda / 380), 0.12), 0.6);
  const dentro = (x, y) => { let d = false; for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) { const [xi, yi] = pol[i], [xj, yj] = pol[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-12) + xi) d = !d; } return d; };
  const formas = [0, 1, 2, 3].map(() => {
    const g = new THREE.IcosahedronGeometry(0.5, 0), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.7 + az() * 0.6), p.getY(i) * (0.6 + az() * 0.5), p.getZ(i) * (0.7 + az() * 0.6));
    g.computeVertexNormals();
    return g;
  });
  const matFrag = [0xa89a8a, 0x958878, 0xb4a796, 0x8a7e70].map((c) => new THREE.MeshStandardMaterial({ map: texRoca, color: c, roughness: 0.95, flatShading: true }));
  const bloques = [];
  for (let x = Math.min(...xs) + s / 2; x < Math.max(...xs); x += s)
    for (let y = Math.min(...ys) + s / 2; y < Math.max(...ys); y += s) {
      if (!dentro(x, y)) continue;
      for (let d = s / 2; d < avance; d += s) {
        const m = new THREE.Mesh(formas[Math.floor(az() * 4)], matFrag[Math.floor(az() * 4)]);
        const p0 = P(x + (az() - 0.5) * s * 0.2, y + (az() - 0.5) * s * 0.2, d);
        m.position.copy(p0); m.scale.setScalar(s * (0.85 + az() * 0.3)); m.visible = false; sc.add(m);
        let mejor = null, dmin = 1e9;
        for (const t of cargados) { const dd = Math.hypot(t.x - x, t.y - y); if (dd < dmin) { dmin = dd; mejor = t; } }
        bloques.push({ m, p0, v: V3(0, 0, 0), w: V3(0, 0, 0), estado: 0, tal: mejor, dist: dmin });
      }
    }

  /* -------------------------------------------------------------- física ilustrativa y pila */
  const pila = new Map();
  const lim = { x0: Math.min(...xs) - cx + s / 2, x1: Math.max(...xs) - cx - s / 2, z0: chim ? Math.min(...ys) - cy + s / 2 : -avance, z1: chim ? Math.max(...ys) - cy - s / 2 : largoGal - 1 };
  const pisoPila = chim ? -Hr : piso0;
  const celda = (x, z) => `${Math.round(x / s)},${Math.round(z / s)}`;
  function lanzar(b) {
    b.estado = 1;
    const k = Math.max(0.35, 1 - b.dist / 1.2);
    if (chim) b.v.set((az() - 0.5) * 1.2, -(1 + 3 * az()) * k, (az() - 0.5) * 1.2);
    else b.v.set(-b.m.position.x * 0.5 + (az() - 0.5) * 1.4, 0.6 + 2.2 * az(), (3.5 + 6 * az()) * k);
    b.w.set((az() - 0.5) * 9, (az() - 0.5) * 9, (az() - 0.5) * 9);
  }
  function fisica(dt) {
    let activos = 0;
    for (const b of bloques) {
      if (b.estado !== 1) continue;
      activos++;
      b.v.y -= 9.81 * dt;
      b.m.position.addScaledVector(b.v, dt);
      const p = b.m.position;
      if (p.x < lim.x0 || p.x > lim.x1) { p.x = Math.min(Math.max(p.x, lim.x0), lim.x1); b.v.x *= -0.3; }
      if (chim && (p.z < lim.z0 || p.z > lim.z1)) { p.z = Math.min(Math.max(p.z, lim.z0), lim.z1); b.v.z *= -0.3; }
      if (!chim && p.z > lim.z1) { p.z = lim.z1; b.v.z *= -0.2; }
      if (!chim && p.y > alturaLibre - s / 2) { p.y = alturaLibre - s / 2; b.v.y = -Math.abs(b.v.y) * 0.3; }
      b.m.rotation.x += b.w.x * dt; b.m.rotation.y += b.w.y * dt; b.m.rotation.z += b.w.z * dt;
      const k = celda(p.x, p.z), suelo = pisoPila + (pila.get(k) || 0) + s * 0.4;
      if (p.y < suelo) {
        p.y = suelo;
        if (Math.abs(b.v.y) < 1.4) {
          let ix = Math.round(p.x / s), iz = Math.round(p.z / s);
          for (let n = 0; n < 14; n++) {          // se desliza hacia la celda vecina más baja
            const h = pila.get(`${ix},${iz}`) || 0;
            let mejor = null, hm = h;
            for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const x = (ix + dx) * s, z = (iz + dz) * s;
              if (x < lim.x0 - s / 2 || x > lim.x1 + s / 2 || z < lim.z0 - s / 2 || z > lim.z1) continue;
              const hv = pila.get(`${ix + dx},${iz + dz}`) || 0;
              if (hv < hm - s * 0.7) { hm = hv; mejor = [dx, dz]; }
            }
            if (!mejor) break;
            ix += mejor[0]; iz += mejor[1];
          }
          const kk = `${ix},${iz}`;
          p.set(Math.min(Math.max(ix * s, lim.x0), lim.x1), pisoPila + (pila.get(kk) || 0) + s * 0.4, Math.min(Math.max(iz * s, lim.z0), lim.z1));
          b.estado = 2;
          pila.set(kk, (pila.get(kk) || 0) + s * 0.62);   // esponjamiento visual
        } else { b.v.y = -b.v.y * 0.25; b.v.x *= 0.5; b.v.z *= 0.5; b.w.multiplyScalar(0.5); }
      }
    }
    return activos;
  }

  /* -------------------------------------------------------------- destellos y humo */
  const esfera = new THREE.SphereGeometry(1, 14, 10);
  const destellos = [], humo = [];
  const texH = texturaHumo(THREE);
  function humear(pos) {
    if (humo.length > 36) return;
    for (let k = 0; k < 1; k++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: texH, transparent: true, opacity: 0.0, depthWrite: false, color: 0xbab5ad }));
      sp.position.copy(pos).add(V3((az() - 0.5) * 0.3, (az() - 0.5) * 0.3, (az() - 0.5) * 0.3));
      sc.add(sp);
      humo.push({ sp, edad: -k * 0.15, v: chim ? V3((az() - 0.5) * 0.4, -0.8 - az() * 0.6, (az() - 0.5) * 0.4) : V3((az() - 0.5) * 0.5, 0.25 + az() * 0.3, 1.2 + az() * 1.4) });
    }
  }
  function animarHumo(dt) {
    for (const h of humo) {
      h.edad += dt;
      if (h.edad < 0) continue;
      h.sp.position.addScaledVector(h.v, dt);
      if (!chim && h.sp.position.y > alturaLibre * 0.85) h.v.y = 0;
      h.v.multiplyScalar(1 - 0.25 * dt);
      const k = h.edad;
      h.sp.scale.setScalar(0.5 + k * 0.9);
      h.sp.material.opacity = Math.max(0, Math.min(0.22, k) * (1 - k / 5));
    }
    for (let i = humo.length - 1; i >= 0; i--) if (humo[i].edad > 5) { sc.remove(humo[i].sp); humo.splice(i, 1); }
  }

  /* -------------------------------------------------------------- amarre e iniciación */
  // Carmex: cada taladro lleva su Carmex (fulminante + mecha de seguridad); el extremo se une con un conector a la
  // mecha rápida, que se tiende en el ORDEN DE SALIDA. Al chispear la mecha rápida, la llama llega a cada conector
  // en ese orden y cada Carmex arde su largo: así se logra la secuencia (tiempos de combustión de fábrica, se miden
  // en la mina). No eléctrico: un Fanel por taladro amarrado al cordón detonante; el retardo lo da el número del Fanel.
  const sistema = E.sistema === "no_electrico" ? "no_electrico" : "carmex";
  const S_RAPIDA = 35, S_MECHA = 170;                    // s/m (mecha rápida Z-18; mecha de seguridad 150–200)
  const OUT = chim ? V3(0, -1, 0) : V3(0, 0, 1);
  const ABAJO = chim ? V3(0, 0, 0) : V3(0, -1, 0);
  const arr = cargados.filter((t) => /arranque/i.test(t.funcion || ""));
  const base_ = arr.length ? arr : cargados;
  const cxA = base_.reduce((a, t) => a + t.x, 0) / Math.max(base_.length, 1), cyA = base_.reduce((a, t) => a + t.y, 0) / Math.max(base_.length, 1);
  const ang = (t) => Math.atan2(t.y - cyA, t.x - cxA);
  // orden de salida por retardo; dentro de cada retardo, el vecino más cercano (así la mecha rápida es corta,
  // como se tiende en la práctica: del arranque hacia afuera, pasando de un conector al siguiente)
  const salidaOrden = [];
  {
    const grupos = new Map();
    for (const t of cargados.slice().sort((p, q) => ang(p) - ang(q))) {
      const k = t.retardo || 0; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(t);
    }
    let ult = null;
    for (const k of [...grupos.keys()].sort((a, b) => a - b)) {
      const resto = grupos.get(k).slice();
      while (resto.length) {
        let i = 0;
        if (ult) { let dm = 1e9; resto.forEach((t, j) => { const d = Math.hypot(t.x - ult.x, t.y - ult.y); if (d < dm) { dm = d; i = j; } }); }
        ult = resto.splice(i, 1)[0]; salidaOrden.push(ult);
      }
    }
  }
  const LARGOS_CARMEX = [5, 6, 7, 8, 9, 10, 12];
  const matMecha = new THREE.MeshStandardMaterial({ color: sistema === "carmex" ? 0x2f9e44 : 0xf1e6c8, roughness: 0.6 });
  const matQuemada = new THREE.MeshStandardMaterial({ color: 0x2a2623, roughness: 1 });
  const matLinea = new THREE.MeshStandardMaterial({ color: sistema === "carmex" ? 0x34383d : 0xf07a22, roughness: 0.6 });
  const matConector = new THREE.MeshStandardMaterial({ color: sistema === "carmex" ? 0xc9ced3 : 0xf2c12e, roughness: 0.35, metalness: 0.6 });
  const conGeo = new THREE.BoxGeometry(0.035, 0.035, 0.05);
  let sAcum = 0;
  salidaOrden.forEach((t, k) => {
    t.conn = t.a.clone().add(OUT.clone().multiplyScalar(0.28)).add(ABAJO.clone().multiplyScalar(0.12));
    if (k > 0) sAcum += t.conn.distanceTo(salidaOrden[k - 1].conn);
    t.sRuta = sAcum; t.orden = k;
    const codo_ = t.a.clone().add(OUT.clone().multiplyScalar(0.1)).add(ABAJO.clone().multiplyScalar(0.06));
    t.lin1 = new THREE.Mesh(cil, matLinea); t.lin2 = new THREE.Mesh(cil, matLinea); t.con = new THREE.Mesh(conGeo, matConector);
    cilEntre(t.lin1, t.a.clone().sub(t.dir.clone().multiplyScalar(-0.02)), codo_, 0.006); cilEntre(t.lin2, codo_, t.conn, 0.006);
    t.con.position.copy(t.conn);
    t.ruta = k > 0 ? new THREE.Mesh(cil, matMecha) : null;
    if (t.ruta) cilEntre(t.ruta, salidaOrden[k - 1].conn, t.conn, 0.007);
    for (const m of [t.lin1, t.lin2, t.con, t.ruta]) if (m) { m.visible = false; sc.add(m); }
    const pies = LARGOS_CARMEX.find((f) => f * PIE >= t.Lt + 0.3) || LARGOS_CARMEX[LARGOS_CARMEX.length - 1];
    t.carmexM = pies * PIE; t.carmexPies = pies;
  });
  const rutaTotal = sAcum;
  // cola de encendido: desde el primer conector hasta donde el trabajador chispea
  const c0 = salidaOrden.length ? salidaOrden[0].conn : V3(0, 1, 0.3);
  const finCola = chim ? V3(Math.min(ancho / 2 - 0.3, 0.3), yPlat + 1.0, Math.min(alto / 2 - 0.3, 0.2)) : V3(Math.max(-ancho / 2 + 0.3, Math.min(ancho / 2 - 0.3, c0.x)), piso0 + 0.9, 1.4);
  const colaPts = chim ? [c0, finCola] : [c0, V3(c0.x, Math.max(piso0 + 0.9, Math.min(c0.y, 1.0)), c0.z + 0.2), finCola];
  const colaSegs = colaPts.slice(1).map((q, i) => { const m = new THREE.Mesh(cil, new THREE.MeshStandardMaterial({ color: 0x2f9e44, roughness: 0.6 })); cilEntre(m, colaPts[i], q, 0.007); m.visible = false; sc.add(m); return m; });
  const colaLen = colaPts.slice(1).reduce((a, q, i) => a + q.distanceTo(colaPts[i]), 0);
  const chispa = new THREE.Sprite(new THREE.SpriteMaterial({ map: texturaHumo(THREE), color: 0xffa531, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  chispa.scale.setScalar(0.22); chispa.visible = false; sc.add(chispa);
  const chispas = salidaOrden.map(() => { const c = chispa.clone(); c.material = chispa.material; c.scale.setScalar(0.14); c.visible = false; sc.add(c); return c; });
  // tiempos: «real» (s) según la combustión; «anim» (s de animación)
  const ANIM_RUTA = 4.0, ANIM_CARMEX = 2.0, T_CHISPEO = 1.2;
  const realCola = colaLen * S_RAPIDA, realRuta = rutaTotal * S_RAPIDA;
  const kR = ANIM_RUTA / Math.max(realCola + realRuta, 1);
  const idxRet = [...new Set(cargados.map((t) => t.retardo || 0))].sort((a, b) => a - b);
  for (const t of salidaOrden) {
    if (sistema === "carmex") {
      t.tConn = T_CHISPEO + kR * (realCola + t.sRuta * S_RAPIDA);
      t.tDet = t.tConn + ANIM_CARMEX;
      t.tReal = realCola + t.sRuta * S_RAPIDA + t.carmexM * S_MECHA;
    } else {
      t.tConn = T_CHISPEO + 1.6 + 0.25 * (t.sRuta / Math.max(rutaTotal, 0.01));
      t.tDet = T_CHISPEO + 2.2 + idxRet.indexOf(t.retardo || 0) * PASO_V * 1.3;
      t.tReal = null;
    }
  }
  function puntoRuta(sReal) {        // posición de la llama sobre la cola + mecha rápida para una distancia recorrida
    let d = sReal;
    const pts = colaPts.slice().reverse().concat(salidaOrden.slice(1).map((t) => t.conn));
    for (let i = 1; i < pts.length; i++) {
      const l = pts[i].distanceTo(pts[i - 1]);
      if (d <= l) return pts[i - 1].clone().lerp(pts[i], l ? d / l : 0);
      d -= l;
    }
    return pts[pts.length - 1].clone();
  }
  function verAmarre(f) {             // f: avance del amarre (0..1) — hasta qué taladro está amarrado
    const n = salidaOrden.length;
    salidaOrden.forEach((t, k) => {
      const on = f * n > k && !t.det;
      t.lin1.visible = t.lin2.visible = t.con.visible = on;
      if (t.ruta) { t.ruta.visible = on; t.ruta.material = matMecha; }
    });
    for (const m of colaSegs) { m.visible = f >= 1; m.material.color.set(0x2f9e44); }
  }

  /* -------------------------------------------------------------- scoop (limpieza) */
  let scoop = null;
  if (SC) {
    scoop = crearScoop(THREE, SC);
    scoop.visible = false; sc.add(scoop);
  }
  const ESPONJ = 1.5;                                         // esponjamiento supuesto (ilustrativo)
  const ciclosReales = SC ? Math.ceil(volRonda * ESPONJ / ((SC.balde_m3 || 2.8) * 0.85)) : 0;
  const limp = { ciclo: 0, etapa: "", t: 0, z0: 0, z1: 0, carga: [], total: 0, ciclos: 0 };
  const zFuera = () => largoGal + (SC ? (SC.largo || 8.7) * 0.55 : 0);
  function iniciarLimpieza() {
    const quedan = bloques.filter((b) => b.estado === 2 && b.m.visible);
    limp.ciclo = 0; limp.total = quedan.length;
    limp.ciclos = Math.max(1, Math.min(ciclosReales || 1, 5));
    limp.porCiclo = Math.ceil(quedan.length / limp.ciclos);
    scoop.visible = true; scoop.position.set(0, piso0, zFuera()); scoop.posicion(0.6, 1);
    nuevoCiclo();
  }
  function nuevoCiclo() {
    const quedan = bloques.filter((b) => b.estado === 2 && b.m.visible).sort((p, q) => q.m.position.z - p.m.position.z);
    if (!quedan.length || limp.ciclo >= limp.ciclos) { limp.etapa = "fin"; return; }
    limp.ciclo++;
    limp.carga = limp.ciclo === limp.ciclos ? quedan : quedan.slice(0, limp.porCiclo);
    const lip = Math.max(Math.min(...limp.carga.map((b) => b.m.position.z)) - 0.15, -avance + 0.15);
    limp.z0 = scoop.position.z; limp.z1 = lip + scoop.alcance();
    limp.etapa = "entra"; limp.t = 0;
  }
  function pasoLimpieza(dt) {
    limp.t += dt;
    const V = 4.5;                                    // m/s de animación
    if (limp.etapa === "entra") {
      const dur = Math.abs(limp.z0 - limp.z1) / V + 0.3;
      const u = Math.min(limp.t / dur, 1), e = u * u * (3 - 2 * u);
      const z = limp.z0 + (limp.z1 - limp.z0) * e;
      scoop.rodar(scoop.position.z - z); scoop.position.z = z;
      scoop.posicion(0.6 * (1 - u), 1 - 0.95 * u);
      if (u >= 1) { limp.etapa = "carga"; limp.t = 0; }
    } else if (limp.etapa === "carga") {             // empuja, recoge el balde y levanta
      const u = Math.min(limp.t / 1.2, 1);
      scoop.position.z = limp.z1 - 0.35 * Math.sin(u * Math.PI / 2);
      scoop.posicion(0.35 * Math.max(0, (u - 0.5) * 2), 0.05 + 0.95 * u);
      if (u > 0.45 && limp.carga.length && limp.carga[0].m.parent !== scoop.balde) {
        const { Wb, prof, altB } = scoop.userData;
        limp.carga.forEach((b, i) => {
          scoop.balde.attach(b.m);
          const fila = Math.floor(i / 9), k = i % 9;
          b.m.position.set(-Wb / 2 + 0.2 + (k % 3 + Math.random() * 0.4) * (Wb - 0.4) / 3, 0.14 + fila * s * 0.55, -prof * 0.15 - (Math.floor(k / 3) + Math.random() * 0.3) * prof * 0.26);
          b.estado = 3;
        });
      }
      if (u >= 1) { limp.etapa = "sale"; limp.t = 0; limp.z0 = scoop.position.z; }
    } else if (limp.etapa === "sale") {
      const dur = Math.abs(zFuera() - limp.z0) / V + 0.3;
      const u = Math.min(limp.t / dur, 1), e = u * u * (3 - 2 * u);
      const z = limp.z0 + (zFuera() - limp.z0) * e;
      scoop.rodar(scoop.position.z - z); scoop.position.z = z;
      scoop.posicion(0.35, 1);
      if (u >= 1) {                                    // descarga fuera de la labor
        for (const b of limp.carga) { b.m.visible = false; scoop.balde.remove(b.m); sc.add(b.m); b.estado = 4; }
        nuevoCiclo();
      }
    }
    return limp.etapa === "fin";
  }

  /* -------------------------------------------------------------- fases */
  let fase = "diseno", reloj = 0, vel = 1, pausa = false, detonados = 0, tFin = 0, rocaSolida = false, actual = null;
  function reposarEquipo() {
    if (manual) {
      const b = equipo.brazos[0];
      const t0 = orden[0];
      ponerBrazo(b, t0.a, t0.dir, 0);
    } else {
      equipo.grupo.position.set(0, piso0, zPivote);
      equipo.grupo.updateMatrixWorld(true);
      equipo.brazos.forEach((b, k) => { const t = colas[k][0] || orden[0]; ponerBrazo(b, t.a, t.dir, 0); });
    }
  }
  function irA(f) {
    fase = f; reloj = 0; detonados = 0; tFin = 0; actual = null; pila.clear();
    snd.apagar(); ultAmarre = -1; ultCarga = -1;
    for (const d of destellos) sc.remove(d.m);
    destellos.length = 0;
    for (const h of humo) sc.remove(h.sp);
    humo.length = 0;
    const perforado = f !== "perforacion";
    const cargado = f === "voladura" || f === "diseno" || f === "amarre";
    for (const t of tal) {
      t.det = false;
      t.anillo.position.copy(t.a).add(chim ? V3(0, -0.004, 0) : V3(0, 0, 0.004));
      ponerPerf(t, perforado ? 1 : 0);
      if (!t.alivio) { ponerCarga(t, cargado ? 1 : 0); t.culo.visible = false; }
    }
    for (const b of bloques) {
      if (b.m.parent !== sc) sc.attach(b.m);
      b.m.position.copy(b.p0); b.m.rotation.set(0, 0, 0); b.m.visible = false; b.estado = 0; b.v.set(0, 0, 0);
    }
    verAmarre(f === "voladura" ? 1 : 0);
    chispa.visible = false; for (const c of chispas) c.visible = false;
    if (scoop) scoop.visible = false;
    limp.etapa = "";
    ronda.visible = tapaRonda.visible = true;
    cara.visible = contornoLinea.visible = true;
    nuevoTramo.visible = nuevaCara.visible = false;
    verEquipo(f === "perforacion" || f === "diseno");
    if (plataforma) plataforma.visible = f !== "voladura";
    if (f === "amarre") retirarEquipo(1);
    carguero.visible = atacador.visible = false;
    reposarEquipo();
    if (f === "voladura") verEquipo(false);
    pausa = false;
    hud();
  }
  function retirarEquipo(k) {                         // el jumbo se retira antes del carguío
    if (manual) { verEquipo(false); return; }
    equipo.grupo.position.z = zPivote + 7 * k;
    equipo.grupo.updateMatrixWorld(true);
    for (const b of equipo.brazos) {
      const piv = equipo.grupo.localToWorld(b.pivoteLocal.clone());
      const collar = piv.clone().add(V3(0, 0.4, -feedL - 1.5));
      ponerBrazo(b, collar, V3(0, 0, -1), 0);
    }
  }
  const snd = crearSonido();
  let son = {}, tGolpe = 0, ultAmarre = -1, ultCarga = -1;
  function pasoAnim(dt) {
    reloj += dt;
    son = { jumbo: !manual };
    if (fase === "perforacion") {
      let fin = true;
      equipo.brazos.forEach((b, k) => {
        const cola = colas[k];
        const i = Math.min(Math.floor(reloj / DUR_P), cola.length - 1);
        if (reloj < cola.length * DUR_P) fin = false;
        const t = cola[i], prev = cola[Math.max(i - 1, 0)];
        const u = Math.min(Math.max((reloj - i * DUR_P) / DUR_P, 0), 1);
        for (let j = 0; j < i; j++) if (cola[j].perf < 1) ponerPerf(cola[j], 1);
        if (u < 0.25 && i > 0) {                    // posicionando el brazo / la perforadora
          const w = u / 0.25, sm = w * w * (3 - 2 * w);
          const c = prev.a.clone().lerp(t.a, sm), d = prev.dir.clone().lerp(t.dir, sm).normalize();
          ponerBrazo(b, c, d, 0);
        } else {
          const f = i === 0 && u < 0.25 ? 0 : (u - 0.25) / 0.75;
          if (f > 0 && f < 1) son.perforando = true;
          ponerPerf(t, Math.max(f, 0));
          ponerBrazo(b, t.a, t.dir, t.Lt * Math.max(f, 0));
          if (k === 0) actual = t;
        }
        if (reloj >= cola.length * DUR_P) ponerPerf(cola[cola.length - 1], 1);
      });
      if (!manual) { son.motor = 0.5; son.rpm = 0.2; }
      if (fin) { fase = "carguio"; reloj = 0; }
    } else if (fase === "carguio") {
      retirarEquipo(Math.min(reloj / 1.2, 1));
      if (!manual && reloj < 1.4) { son.motor = 0.8; son.rpm = 0.7; }
      const t0 = 1.2;
      carguero.visible = atacador.visible = reloj > t0;
      cargados.forEach((t, k) => {
        const f = Math.min(Math.max((reloj - t0 - k * DUR_C) / DUR_C, 0), 1);
        if (f !== t.carg) ponerCarga(t, f);
        if (f > 0 && f < 1) {
          actual = t;
          if (reloj - tGolpe > 0.16) { tGolpe = reloj; snd.golpe(190 + 40 * Math.random(), 0.07, 0.35); }   // atacador
          const dentroL = t.Lt - t.lCarga * Math.min(f / 0.8, 1);
          const punta = t.a.clone().add(t.dir.clone().multiplyScalar(Math.max(dentroL, 0.05)));
          const fuera = punta.clone().sub(t.dir.clone().multiplyScalar(Math.max(t.Lt + 0.6, 2.2)));
          cilEntre(atacador, fuera, punta, 0.016);
          const pie = chim ? V3(Math.max(Math.min(t.a.x + 0.4, ancho / 2 - 0.25), -ancho / 2 + 0.25), yPlat, Math.max(Math.min(t.a.z + 0.3, alto / 2 - 0.2), -alto / 2 + 0.2))
                           : V3(Math.max(Math.min(t.a.x + 0.35, ancho / 2 - 0.25), -ancho / 2 + 0.25), piso0, fuera.z + 0.35 > 0.5 ? fuera.z + 0.35 : 0.9);
          ponerOperador(carguero, pie, chim ? fuera : t.a.clone().setY(piso0), fuera.clone().lerp(punta, 0.12));
        }
      });
      if (reloj >= t0 + cargados.length * DUR_C + 0.5) {
        fase = "amarre"; reloj = 0;
        verEquipo(false); atacador.visible = false;
      }
    } else if (fase === "amarre") {
      verEquipo(false);
      const DUR_AM = Math.min(0.45, Math.max(0.1, 7 / Math.max(salidaOrden.length, 1)));
      const f = Math.min(reloj / (DUR_AM * salidaOrden.length + 0.4), 1);
      verAmarre(f);
      const k = Math.min(Math.floor(f * salidaOrden.length), salidaOrden.length - 1);
      const t = salidaOrden[k];
      if (k !== ultAmarre && f < 1) { ultAmarre = k; snd.golpe(1300, 0.025, 0.12); }   // clic del conector
      if (t) {
        actual = t;
        carguero.visible = true;
        const pie = chim ? V3(Math.max(Math.min(t.a.x + 0.35, ancho / 2 - 0.25), -ancho / 2 + 0.25), yPlat, Math.max(Math.min(t.a.z + 0.3, alto / 2 - 0.2), -alto / 2 + 0.2))
                         : V3(Math.max(Math.min(t.conn.x + 0.3, ancho / 2 - 0.25), -ancho / 2 + 0.25), piso0, t.conn.z + 0.5);
        ponerOperador(carguero, pie, chim ? t.conn.clone().setY(yPlat) : t.conn.clone().setY(piso0), [t.conn.clone().add(V3(-0.05, 0, 0)), t.conn.clone().add(V3(0.05, 0, 0))], 0.15);
      }
      if (f >= 1 && reloj > DUR_AM * salidaOrden.length + 1.0) {
        fase = "voladura"; reloj = 0;
        if (plataforma) plataforma.visible = chim;
      }
    } else if (fase === "voladura" || fase === "humo") {
      // encendido: el trabajador chispea la cola de mecha rápida y se retira de la labor
      if (fase === "voladura") {
        const fuera = chim ? V3(0, yPlat, 0) : V3(Math.min(ancho / 2 - 0.3, 0.3), piso0, Math.min(largoGal - 0.5, finCola.z + 0.4 + Math.max(0, reloj - T_CHISPEO) * 3));
        if (reloj < T_CHISPEO + 2.5) {
          carguero.visible = !(chim && reloj > T_CHISPEO + 0.6);
          if (plataforma) plataforma.visible = carguero.visible;
          const pie = reloj < T_CHISPEO ? (chim ? V3(finCola.x + 0.2, yPlat, finCola.z + 0.2) : V3(finCola.x + 0.25, piso0, finCola.z + 0.45)) : fuera;
          ponerOperador(carguero, pie, reloj < T_CHISPEO ? finCola.clone().setY(pie.y) : pie.clone().add(V3(0, 0, 3)), reloj < T_CHISPEO ? [finCola, finCola] : pie.clone().add(V3(0, 0.9, 0.2)), 0.1);
        } else { carguero.visible = false; if (plataforma) plataforma.visible = false; }
        if (reloj >= T_CHISPEO && reloj - dt < T_CHISPEO) snd.chispazo();
        son.mecha = (chispa.visible ? 1 : 0) + chispas.filter((c) => c.visible).length;
        // llama sobre la cola y la mecha rápida (o el cordón)
        if (sistema === "carmex") {
          const sReal = (reloj - T_CHISPEO) / kR / S_RAPIDA;       // metros recorridos
          chispa.visible = reloj >= T_CHISPEO && sReal <= colaLen + rutaTotal + 0.01;
          if (chispa.visible) {
            chispa.position.copy(puntoRuta(sReal));
            const sR = sReal - colaLen;
            colaSegs.forEach((m) => { m.material.color.set(sReal > 0 ? 0x2a2623 : 0x2f9e44); });
            for (const t of salidaOrden) if (t.ruta && t.sRuta <= sR) t.ruta.material = matQuemada;
          }
        } else {
          chispa.visible = reloj >= T_CHISPEO && reloj < T_CHISPEO + 1.6;
          if (chispa.visible) chispa.position.copy(colaPts[colaPts.length - 1].clone().lerp(colaPts[0], (reloj - T_CHISPEO) / 1.6));
          const u = (reloj - T_CHISPEO - 1.6) / 0.25;
          if (u >= 0) for (const t of salidaOrden) if (t.ruta && t.sRuta <= u * rutaTotal) t.ruta.material = matQuemada;
        }
        // cada Carmex (o Fanel) arde desde el conector hasta el collar
        salidaOrden.forEach((t, k) => {
          const c = chispas[k];
          const u = (reloj - t.tConn) / Math.max(t.tDet - t.tConn, 0.01);
          c.visible = !t.det && u >= 0 && u < 1;
          if (c.visible) c.position.copy(u < 0.5 ? t.conn.clone().lerp(t.lin2.position.clone().add(t.lin2.position.clone().sub(t.conn)), u) : t.lin1.position.clone().lerp(t.a, (u - 0.5) * 2));
        });
      }
      for (const t of salidaOrden) {
        if (t.det || reloj < t.tDet) continue;
        t.lin1.visible = t.lin2.visible = t.con.visible = false;
        if (detonados === 0) {                     // la ronda se rompe: aparecen los bloques en su sitio
          ronda.visible = tapaRonda.visible = cara.visible = contornoLinea.visible = false;
          for (const b of bloques) b.m.visible = true;
        }
        t.det = true; detonados++; actual = t;
        snd.detonacion(Math.min(1, 0.55 + (t.kg || 0.5) * 0.35));
        for (const m of [t.carga, t.taco, t.cebo, t.hueco]) m.visible = false;
        t.anillo.visible = false;
        const d = new THREE.Mesh(esfera, new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0.95 }));
        d.position.copy(t.a.clone().add(t.dir.clone().multiplyScalar(t.Lt - t.lCarga / 2)));
        sc.add(d); destellos.push({ m: d, edad: 0 });
        humear(t.a.clone());
        for (const b of bloques) if (b.tal === t && b.estado === 0) lanzar(b);
        if (t.Lt > avance + 0.02) {                // culo del taladro que queda en el nuevo frente
          cilEntre(t.culo, t.a.clone().add(t.dir.clone().multiplyScalar(avance)), t.a.clone().add(t.dir.clone().multiplyScalar(t.Lt)), t.r * 0.9);
        }
      }
      for (const d of destellos) { d.edad += dt; const k = d.edad / 0.45; d.m.scale.setScalar(Math.max(Math.min(0.32, ancho * 0.09) * k, 0.001)); d.m.material.opacity = Math.max(0, 0.95 * (1 - k)); }
      for (let i = destellos.length - 1; i >= 0; i--) if (destellos[i].edad > 0.45) { sc.remove(destellos[i].m); destellos.splice(i, 1); }
      const activos = fisica(Math.min(dt, 1 / 30));
      if (detonados === cargados.length) {
        chispa.visible = false; for (const c of chispas) c.visible = false;
        if (fase === "voladura") {
          nuevoTramo.visible = nuevaCara.visible = true;
          for (const t of cargados) if (t.Lt > avance + 0.02) t.culo.visible = true;
          for (const t of tal) if (t.alivio) {           // el alivio queda solo detrás del nuevo frente
            if (t.Lt > avance + 0.02) cilEntre(t.hueco, t.a.clone().add(t.dir.clone().multiplyScalar(avance)), t.a.clone().add(t.dir.clone().multiplyScalar(t.Lt)), t.r);
            else t.hueco.visible = false;
            t.anillo.position.copy(t.a).add(t.dir.clone().multiplyScalar(avance - 0.004));
          }
        }
        fase = "humo"; tFin += dt; son.ventilacion = true;
        if ((activos === 0 && tFin > 2.5) || tFin > 14) {
          for (const t of salidaOrden) if (t.ruta) t.ruta.visible = false;
          for (const m of colaSegs) m.visible = false;
          if (scoop) { fase = "limpieza"; reloj = 0; iniciarLimpieza(); } else fase = "resultado";
        }
      }
    } else if (fase === "limpieza") {
      son.motor = 1; son.rpm = limp.etapa === "carga" ? 0.9 : limp.etapa === "fin" ? 0 : 0.5; son.ventilacion = true;
      if (limp.etapa === "carga" && limp.ciclo !== ultCarga && limp.t > 0.55) { ultCarga = limp.ciclo; snd.golpe(95, 0.35, 0.7); }
      if (pasoLimpieza(dt)) { fase = "resultado"; scoop.position.z = zFuera(); snd.apagar(); }
    }
    snd.actualizar(son);
    animarHumo(dt);
    hud();
  }

  /* -------------------------------------------------------------- HUD y controles */
  const NOMBRES = { diseno: "Diseño cargado", perforacion: "Perforación", carguio: "Carguío", amarre: "Amarre", voladura: "Voladura", humo: "Ventilación (humos)", limpieza: "Limpieza (scoop)", resultado: "Resultado" };
  const FASES_BTN = ["perforacion", "carguio", "amarre", "voladura"].concat(SC ? ["limpieza"] : []);
  const barra = document.createElement("div");
  barra.className = "sim-barra";
  barra.innerHTML = `<div class="sim-hud" id="lab-hud"></div><div class="sim-hud sim-det" id="lab-det"></div>
    <div class="sim-ctl"><button data-a="play">▶</button><button data-a="reset">⟲</button><button data-a="vel">1×</button><button data-a="roca" title="Roca transparente o sólida">◐</button><button data-a="cam" title="Cambiar vista">🎥</button><button data-a="son" title="Sonido">🔊</button></div>
    <div class="sim-fases">${FASES_BTN.map((f) => `<button data-f="${f}">${f === "limpieza" ? "Limpieza" : NOMBRES[f]}</button>`).join("")}</div>`;
  caja.appendChild(barra);
  const btnPlay = barra.querySelector('[data-a="play"]');
  const f2 = (v, d = 2) => (v == null || !isFinite(v)) ? "—" : Number(v).toFixed(d);
  function hud() {
    let txt = NOMBRES[fase];
    if (fase === "perforacion") txt += ` · ${tal.filter((t) => t.perf >= 1).length}/${tal.length} taladros`;
    if (fase === "carguio") txt += ` · ${cargados.filter((t) => t.carg >= 1).length}/${cargados.length} cargados`;
    if (fase === "amarre") txt += sistema === "carmex" ? " · Carmex + conectores + mecha rápida" : " · Fanel + cordón detonante";
    if (fase === "voladura" || fase === "humo") txt += ` · ${detonados}/${cargados.length} detonados`;
    if (fase === "limpieza") txt += ` · ciclo ${limp.ciclo}/${limp.ciclos} (≈ ${ciclosReales} ciclos reales)`;
    if (fase === "resultado") {
      const ps = bloques.filter((b) => b.estado === 2);
      const alcance = ps.length ? Math.max(...ps.map((b) => chim ? -b.m.position.y : b.m.position.z)) : 0;
      txt += chim ? ` · avance ${f2(avance)} m · el material cayó por la chimenea` : SC ? ` · avance ${f2(avance)} m · labor limpia` : ` · avance ${f2(avance)} m · pila hasta ${f2(alcance, 1)} m del frente (ilustrativo)`;
    }
    barra.querySelector("#lab-hud").textContent = txt;
    let det = "";
    if (fase === "limpieza") det = SC ? `${SC.nombre || "Scoop"} · balde ${f2(SC.balde_m3, 1)} m³ · volumen roto ≈ ${f2(volRonda, 1)} m³ in situ (×${ESPONJ} esponjado, supuesto)` : "";
    if (actual && (fase === "perforacion" || fase === "carguio" || fase === "amarre" || fase === "voladura" || fase === "humo")) {
      const t = actual;
      det = `${t.funcion || ""} · ${t.alivio ? "alivio (sin carga)" : `retardo ${t.retardo} · ${t.cartuchos} cart. · ${f2(t.kg, 2)} kg`}`;
      if (fase === "amarre" && !t.alivio) det = `${t.funcion || ""} · salida ${t.orden + 1}/${salidaOrden.length} · ` + (sistema === "carmex" ? `Carmex de ${t.carmexPies}' unido a la mecha rápida` : `Fanel N.° ${t.retardo} amarrado al cordón`);
      if ((fase === "voladura" || fase === "humo") && !t.alivio) det += sistema === "carmex" && t.tReal != null ? ` · salida ${t.orden + 1} a ≈ ${Math.round(t.tReal)} s del chispeo` : ` · Fanel N.° ${t.retardo}`;
      if (fase === "perforacion" && manual) det += ` · barreno ${barraPara(t.perf * t.Lt).toFixed(1)} m`;
    }
    barra.querySelector("#lab-det").textContent = det;
    btnPlay.textContent = pausa || fase === "diseno" || fase === "resultado" ? "▶" : "⏸";
    barra.querySelectorAll("[data-f]").forEach((b) => b.classList.toggle("on", b.dataset.f === fase || ((fase === "humo") && b.dataset.f === "voladura")));
    if (fase !== faseAvisada) { faseAvisada = fase; try { E.alFase && E.alFase(fase, { sistema, scoop: !!SC }); } catch (e) { /* sin aviso */ } }
  }
  let faseAvisada = null;
  barra.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    snd.iniciar();                                   // el navegador solo permite sonido tras un toque
    if (b.dataset.a === "son") { snd.silenciar(snd.activo); b.textContent = snd.activo ? "🔊" : "🔇"; return; }
    if (b.dataset.f === "limpieza") { saltarALimpieza(); return; }
    if (b.dataset.f) { irA(b.dataset.f); return; }
    if (b.dataset.a === "play") { if (fase === "diseno" || fase === "resultado") irA("perforacion"); else pausa = !pausa; }
    else if (b.dataset.a === "reset") irA("diseno");
    else if (b.dataset.a === "vel") { vel = vel >= 4 ? 0.5 : vel * 2; b.textContent = `${vel}×`; }
    else if (b.dataset.a === "cam") {
      vistaN = (vistaN + 1) % VISTAS.length;
      const [pos, obj] = VISTAS[vistaN](); cam.position.set(...pos); ctl.target.set(...obj); ctl.update();
      if (E.alVista) E.alVista(NOMBRES_VISTA[vistaN]);
    }
    else if (b.dataset.a === "roca") {
      rocaSolida = !rocaSolida;
      matFrente.opacity = rocaSolida ? 1 : 0.38; matFrente.depthWrite = rocaSolida;
      matMacizo.opacity = rocaSolida ? 0.9 : 0.16;
    }
    hud();
  });

  function rapido(fn) {                         // adelantar sin que suenen cientos de disparos de golpe
    const a = snd.activo; snd.silenciar(true);
    try { fn(); } finally { snd.silenciar(!a); }
  }
  function saltarALimpieza() {                 // voladura completa al instante y empieza la limpieza
    irA("voladura");
    rapido(() => { for (let i = 0; i < 4000 && fase !== "limpieza" && fase !== "resultado"; i++) pasoAnim(0.05); });
    hud();
  }

  /* -------------------------------------------------------------- cámara y bucle */
  // vista en corte: la cámara fuera del hastial (la pared cercana no se dibuja) mira la labor de lado
  if (chim) {
    ctl.target.set(0, -1.0, 0);
    cam.position.set(ancho * 2.2 + 2.4, 0.3, alto * 1.6 + 2.8);
  } else if (manual) {
    ctl.target.set(0, alturaLibre * 0.45, 0.6);
    cam.position.set(ancho * 1.4 + 2.6, alturaLibre * 1.15 + 0.4, 3.4);
  } else {
    ctl.target.set(0, alto * 0.4, zPivote * 0.75);
    cam.position.set(ancho * 1.5 + 7.5, alto * 1.45 + 1, zPivote * 0.75 + 7);
  }
  // vistas para explicar: corte lateral, de frente (como el perforista), en planta y desde la galería
  const NOMBRES_VISTA = ["Corte lateral", "De frente", "Planta", "Desde la galería"];
  const VISTAS = chim ? [
    () => [cam.position.toArray(), ctl.target.toArray()],
    () => [[0.01, -3.2, 0.01], [0, 0, 0]], () => [[ancho * 2.5, 1.5, 0.01], [0, 0, 0]], () => [[0.5, -Hr + 0.5, alto], [0, 0, 0]],
  ] : [
    () => [cam.position.toArray(), ctl.target.toArray()],
    () => [[0.2, alturaLibre * 0.6, 3.6 + ancho * 0.4], [0, alto * 0.45, -0.5]],
    () => [[0.01, alturaLibre + 7, 4], [0, 0, 3]],
    () => [[ancho * 0.25, Math.min(alturaLibre * 0.8, 2.4), Math.min(largoGal - 1, 12)], [0, alto * 0.45, 0]],
  ];
  let vistaN = 0;
  const vista0 = [cam.position.toArray(), ctl.target.toArray()];
  VISTAS[0] = () => vista0;
  const ro = new ResizeObserver(() => {
    const w = caja.clientWidth, h = caja.clientHeight;
    if (!w || !h) return;
    ren.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix();
  });
  ro.observe(caja);
  irA("diseno");
  let vivo = true, antes = performance.now();
  function bucle(ahora) {
    if (!vivo) return;
    const dt = Math.min(((ahora ?? performance.now()) - antes) / 1000, 0.05);
    antes = ahora ?? performance.now();
    if (!pausa && fase !== "diseno" && fase !== "resultado") pasoAnim(dt * vel);
    else { snd.actualizar({}); if (fase === "resultado") animarHumo(dt); }
    ctl.update();
    ren.render(sc, cam);
    requestAnimationFrame(bucle);
  }
  requestAnimationFrame(bucle);
  return {
    cerrar() { vivo = false; ro.disconnect(); snd.cerrar(); ren.dispose(); },
    sonido: snd,
    camara(pos, obj) { cam.position.set(...pos); ctl.target.set(...obj); ctl.update(); ren.render(sc, cam); },
    // para pruebas: avanza sin esperar y devuelve el estado
    avanzar(seg, f) {
      if (f === "limpieza") saltarALimpieza(); else if (f) irA(f);
      const n = Math.ceil(seg / 0.02);
      rapido(() => { for (let i = 0; i < n && fase !== "resultado"; i++) pasoAnim(0.02); });
      ren.render(sc, cam);
      return this.estado();
    },
    estado() {
      const ps = bloques.filter((b) => b.estado === 2);
      return { fase, labor, equipo: eq.tipo, brazos: nB, taladros: tal.length, perforados: tal.filter((t) => t.perf >= 1).length,
               cargados: cargados.filter((t) => t.carg >= 1).length, detonados, bloques: bloques.length, pila: ps.length,
               sistema, amarrados: salidaOrden.filter((t) => t.con.visible).length, scoop: !!SC, ciclos: limp.ciclo,
               retirados: bloques.filter((b) => b.estado === 4).length, tReal: salidaOrden.map((t) => t.tReal == null ? null : Math.round(t.tReal)).slice(0, 4),
               zmax: ps.length ? +Math.max(...ps.map((b) => b.m.position.z)).toFixed(2) : null,
               ymin: ps.length ? +Math.min(...ps.map((b) => b.m.position.y)).toFixed(2) : null };
    },
  };
}
