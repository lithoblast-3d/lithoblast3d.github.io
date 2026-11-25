/* LithoBlast3D — modelos 3D a escala real para la simulación de la labor.
   - Trabajador con EPP (casco con lámpara, lentes, camisa de alta visibilidad amarilla y azul con cintas
     reflectivas, guantes, botas) y esqueleto sencillo: brazos y piernas se resuelven con cinemática inversa
     de dos segmentos, así las manos llegan a la perforadora o al atacador.
   - Perforadora jackleg (máquina, barreno hexagonal con broca, pata neumática, manguera de aire con
     lubricador y manguera de agua).
   - Scoop (cargador de bajo perfil, LHD) articulado: bastidor trasero con motor y parrilla, cabina lateral,
     cuatro llantas, brazos de levante y balde con dientes. Medidas del catálogo (ancho, alto, largo). */

const Y = (THREE) => new THREE.Vector3(0, 1, 0);

/* coloca una malla de eje Y (cilindro / cápsula de altura 1) entre a y b, en el espacio del padre */
export function segmento(THREE, m, a, b, r) {
  const d = b.clone().sub(a), l = d.length();
  m.visible = l > 1e-4;
  if (!m.visible) return;
  m.scale.set(r, l, r);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(Y(THREE), d.divideScalar(l));
}

/* cinemática inversa de 2 segmentos: punto medio (codo / rodilla) entre «a» y «b» */
function codo(THREE, a, b, l1, l2, polo) {
  const ab = b.clone().sub(a);
  let d = ab.length();
  const u = ab.clone().normalize();
  d = Math.min(Math.max(d, Math.abs(l1 - l2) + 1e-3), l1 + l2 - 1e-3);
  const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const w = polo.clone().sub(u.clone().multiplyScalar(polo.dot(u)));
  if (w.lengthSq() < 1e-8) w.set(0, -1, 0).sub(u.clone().multiplyScalar(-u.y));
  w.normalize();
  const fin = a.clone().add(u.clone().multiplyScalar(d));
  return { codo: a.clone().add(u.multiplyScalar(l1 * cosA)).add(w.multiplyScalar(l1 * sinA)), fin };
}

/* ====================================================================== trabajador */
export function crearTrabajador(THREE) {
  const g = new THREE.Group();
  const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...o });
  const amarilloHV = M(0xf2cf1d, { roughness: 0.6 });
  const azul = M(0x1f2b4d);
  const cinta = new THREE.MeshStandardMaterial({ color: 0xdfe3e6, roughness: 0.25, metalness: 0.6, emissive: 0x3a3d40 });
  const piel = M(0xc99b78);
  const casco = M(0xf5c21a, { roughness: 0.35 });
  const negro = M(0x15171a);
  const bota = M(0xc58a3e, { roughness: 0.8 });
  const cil = new THREE.CylinderGeometry(1, 1, 1, 14);
  const bola = new THREE.SphereGeometry(1, 12, 10);
  const mesh = (geo, mat) => { const m = new THREE.Mesh(geo, mat); g.add(m); return m; };

  // tronco: grupo propio para poder inclinarlo
  const tronco = new THREE.Group(); g.add(tronco);
  const tm = (geo, mat) => { const m = new THREE.Mesh(geo, mat); tronco.add(m); return m; };
  const pecho = tm(new THREE.CylinderGeometry(0.175, 0.16, 0.36, 16), amarilloHV); pecho.position.y = 0.36;
  const vientre = tm(new THREE.CylinderGeometry(0.16, 0.155, 0.22, 16), azul); vientre.position.y = 0.08;
  for (const y of [0.25, 0.42]) { const c = tm(new THREE.CylinderGeometry(0.178, 0.17, 0.035, 16), cinta); c.position.y = y; }
  const correa = tm(new THREE.CylinderGeometry(0.158, 0.158, 0.04, 16), negro); correa.position.y = -0.02;
  const cuello = tm(new THREE.CylinderGeometry(0.06, 0.07, 0.08, 10), azul); cuello.position.y = 0.57;
  const hombros = tm(new THREE.CapsuleGeometry(0.075, 0.3, 4, 10), amarilloHV); hombros.rotation.z = Math.PI / 2; hombros.position.y = 0.5;
  const cabeza = new THREE.Group(); tronco.add(cabeza); cabeza.position.y = 0.7;
  const cara = new THREE.Mesh(new THREE.SphereGeometry(0.105, 18, 14), piel); cara.scale.set(0.92, 1.08, 1); cabeza.add(cara);
  const nariz = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), piel); nariz.position.set(0, -0.01, -0.1); cabeza.add(nariz);
  const lentes = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.04, 0.02),
    new THREE.MeshStandardMaterial({ color: 0x9fb4c2, transparent: true, opacity: 0.55, roughness: 0.1, metalness: 0.3 }));
  lentes.position.set(0, 0.02, -0.098); cabeza.add(lentes);
  const cupula = new THREE.Mesh(new THREE.SphereGeometry(0.132, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), casco);
  cupula.position.y = 0.035; cabeza.add(cupula);
  const ala = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.155, 0.015, 24), casco); ala.position.set(0, 0.035, -0.01); cabeza.add(ala);
  const visera = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.012, 0.06), casco); visera.position.set(0, 0.035, -0.15); cabeza.add(visera);
  const nervio = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.24), casco); nervio.position.set(0, 0.165, 0); cabeza.add(nervio);
  const lampara = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.034, 0.035, 14), M(0xe07a1f));
  lampara.rotation.x = Math.PI / 2; lampara.position.set(0, 0.1, -0.13); cabeza.add(lampara);
  const foco = new THREE.Mesh(new THREE.CircleGeometry(0.022, 14), new THREE.MeshBasicMaterial({ color: 0xfffbe0 }));
  foco.position.set(0, 0.1, -0.149); foco.rotation.y = Math.PI; cabeza.add(foco);
  const cable = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.006, 4, 16, Math.PI * 0.8), negro);
  cable.rotation.y = Math.PI / 2; cable.position.set(0.12, -0.03, 0); cabeza.add(cable);

  // extremidades (se ubican cada cuadro)
  const L = { muslo: 0.43, pierna: 0.41, brazo: 0.29, antebrazo: 0.27 };
  const pierna = [-1, 1].map(() => ({ muslo: mesh(cil, azul), pierna: mesh(cil, azul), banda: mesh(cil, cinta), rodilla: mesh(bola, azul),
                                      cad: mesh(bola, azul), bota: mesh(new THREE.BoxGeometry(0.11, 0.1, 0.27), bota), suela: mesh(new THREE.BoxGeometry(0.115, 0.025, 0.28), negro) }));
  const brazo = [-1, 1].map(() => ({ sup: mesh(cil, amarilloHV), inf: mesh(cil, azul), banda: mesh(cil, cinta), codo: mesh(bola, azul),
                                     hombro: mesh(bola, amarilloHV), mano: mesh(new THREE.SphereGeometry(0.05, 10, 8), negro) }));

  const estado = { agachar: 0, inclinar: 0 };
  g.userData.trabajador = true;

  /* pose: pie (piso), mira (hacia dónde mira), manos [izq, der] en coordenadas de mundo */
  g.pose = function ({ pie, mira, manos, agachar = 0, inclinar = 0 }) {
    g.position.copy(pie);
    const d = mira.clone().sub(pie); d.y = 0;
    if (d.lengthSq() > 1e-6) g.rotation.set(0, Math.atan2(-d.x, -d.z), 0);
    g.updateMatrixWorld(true);
    estado.agachar = agachar; estado.inclinar = inclinar;
    const cadera = 0.92 - 0.38 * agachar;
    tronco.position.set(0, cadera, 0);
    tronco.rotation.set(-(inclinar + 0.25 * agachar), 0, 0);
    tronco.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
    // piernas: pie fijo, rodilla hacia adelante
    [-1, 1].forEach((s, i) => {
      const p = pierna[i];
      const tobillo = new THREE.Vector3(s * 0.1, 0.11, -0.03 * agachar);
      const hip = new THREE.Vector3(s * 0.095, cadera - 0.02, 0.05 * agachar);
      const { codo: rod } = codo(THREE, hip, tobillo, L.muslo, L.pierna, new THREE.Vector3(0, 0, -1));
      segmento(THREE, p.muslo, hip, rod, 0.08);
      segmento(THREE, p.pierna, rod, tobillo, 0.066);
      p.rodilla.position.copy(rod); p.rodilla.scale.setScalar(0.072);
      p.cad.position.copy(hip); p.cad.scale.setScalar(0.085);
      const bb = rod.clone().lerp(tobillo, 0.45);
      segmento(THREE, p.banda, bb.clone().sub(tobillo.clone().sub(rod).normalize().multiplyScalar(0.02)), bb.clone().add(tobillo.clone().sub(rod).normalize().multiplyScalar(0.02)), 0.07);
      p.bota.position.set(s * 0.1, 0.06, -0.05); p.suela.position.set(s * 0.1, 0.012, -0.05);
    });
    // brazos: hombro → mano con el codo hacia abajo y afuera
    const objetivos = Array.isArray(manos) ? manos : manos ? [manos, manos] : [null, null];
    [-1, 1].forEach((s, i) => {
      const b = brazo[i];
      const hombro = tronco.localToWorld(new THREE.Vector3(s * 0.21, 0.5, 0)).applyMatrix4(inv);
      let mano = objetivos[i] ? objetivos[i].clone().applyMatrix4(inv) : hombro.clone().add(new THREE.Vector3(s * 0.06, -0.55, -0.05));
      const { codo: c, fin } = codo(THREE, hombro, mano, L.brazo, L.antebrazo, new THREE.Vector3(s * 0.8, -1, 0.4));
      mano = fin;
      segmento(THREE, b.sup, hombro, c, 0.058);
      segmento(THREE, b.inf, c, mano, 0.05);
      b.codo.position.copy(c); b.codo.scale.setScalar(0.054);
      b.hombro.position.copy(hombro); b.hombro.scale.setScalar(0.072);
      const u = mano.clone().sub(c).normalize();
      segmento(THREE, b.banda, c.clone().add(u.clone().multiplyScalar(0.03)), c.clone().add(u.clone().multiplyScalar(0.07)), 0.056);
      b.mano.position.copy(mano);
    });
  };
  g.pose({ pie: new THREE.Vector3(), mira: new THREE.Vector3(0, 0, -1) });
  return g;
}

/* ====================================================================== perforadora jackleg / stoper */
export function crearJackleg(THREE, escena) {
  const plata = new THREE.MeshStandardMaterial({ color: 0xc3c8cd, roughness: 0.28, metalness: 0.85 });
  const gris = new THREE.MeshStandardMaterial({ color: 0x6d747b, roughness: 0.45, metalness: 0.6 });
  const cromo = new THREE.MeshStandardMaterial({ color: 0xe6eaee, roughness: 0.12, metalness: 0.95 });
  const negro = new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.8 });
  const amarillo = new THREE.MeshStandardMaterial({ color: 0xe8b51c, roughness: 0.55 });
  const rojo = new THREE.MeshStandardMaterial({ color: 0xc8322b, roughness: 0.5 });
  const g = new THREE.Group(); escena.add(g);
  const cil = new THREE.CylinderGeometry(1, 1, 1, 14);
  const hex = new THREE.CylinderGeometry(1, 1, 1, 6);
  const m = (geo, mat) => { const x = new THREE.Mesh(geo, mat); g.add(x); return x; };
  const p = {
    cuerpo: m(cil, plata), culata: m(new THREE.BoxGeometry(0.16, 0.14, 0.12), gris), mandril: m(cil, gris),
    manija: m(cil, negro), manija2: m(cil, negro), palanca: m(new THREE.BoxGeometry(0.02, 0.07, 0.02), rojo),
    barra: m(hex, cromo), broca: m(new THREE.CylinderGeometry(1, 0.7, 1, 12), gris),
    pataExt: m(cil, gris), pataInt: m(cil, cromo), garra: m(new THREE.ConeGeometry(0.05, 0.09, 8), negro),
    articulacion: m(new THREE.SphereGeometry(0.04, 10, 8), gris), lubricador: m(new THREE.SphereGeometry(1, 14, 10), negro),
    tapa: m(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 10), rojo),
  };
  let aire = null, agua = null;
  const matAire = amarillo, matAgua = negro;
  function manguera(viejo, pts, r, mat) {
    if (viejo) { g.remove(viejo); viejo.geometry.dispose(); }
    const curva = new THREE.CatmullRomCurve3(pts);
    const t = new THREE.Mesh(new THREE.TubeGeometry(curva, 40, r, 6, false), mat);
    g.add(t);
    return t;
  }
  /* punta: posición de la broca; dir: dirección del taladro; rodL: largo del barreno; apoyo: pie de la pata
     (en el piso o la plataforma); salidaAire: punto lejano por donde llegan las mangueras */
  g.poner = function ({ punta, dir, rodL, apoyo, salidaAire, sinMangueras = false }) {
    const D = dir.clone().normalize();
    const frente = punta.clone().sub(D.clone().multiplyScalar(rodL));
    const atras = frente.clone().sub(D.clone().multiplyScalar(0.58));
    segmento(THREE, p.barra, frente, punta.clone().sub(D.clone().multiplyScalar(0.05)), 0.012);
    segmento(THREE, p.broca, punta.clone().sub(D.clone().multiplyScalar(0.05)), punta, 0.02);
    segmento(THREE, p.mandril, frente.clone().sub(D.clone().multiplyScalar(0.12)), frente, 0.05);
    segmento(THREE, p.cuerpo, atras.clone().add(D.clone().multiplyScalar(0.06)), frente.clone().sub(D.clone().multiplyScalar(0.1)), 0.085);
    p.culata.position.copy(atras); p.culata.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), D);
    // manija en T detrás de la culata
    const lado = new THREE.Vector3().crossVectors(D, Math.abs(D.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize();
    const mango = atras.clone().sub(D.clone().multiplyScalar(0.16));
    segmento(THREE, p.manija, atras, mango, 0.018);
    segmento(THREE, p.manija2, mango.clone().add(lado.clone().multiplyScalar(0.16)), mango.clone().sub(lado.clone().multiplyScalar(0.16)), 0.02);
    p.palanca.position.copy(atras.clone().add(new THREE.Vector3(0, 0.1, 0)));
    // pata neumática: de la articulación (bajo el cuerpo) al apoyo
    const art = atras.clone().lerp(frente, 0.35).add(new THREE.Vector3(0, -0.09, 0));
    p.articulacion.position.copy(art);
    const medio = art.clone().lerp(apoyo, 0.5);
    segmento(THREE, p.pataInt, art, medio, 0.028);
    segmento(THREE, p.pataExt, medio, apoyo.clone().add(apoyo.clone().sub(art).normalize().multiplyScalar(-0.05)), 0.045);
    p.garra.position.copy(apoyo); p.garra.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), apoyo.clone().sub(art).normalize());
    // mangueras de aire (amarilla, con lubricador) y de agua (negra)
    if (!sinMangueras) {
      const piso = apoyo.y;
      const lub = atras.clone().lerp(salidaAire, 0.4).setY(piso + 0.07);
      p.lubricador.position.copy(lub); p.lubricador.scale.set(0.07, 0.06, 0.11);
      p.tapa.position.copy(lub).add(new THREE.Vector3(0, 0.07, 0));
      aire = manguera(aire, [atras.clone().add(new THREE.Vector3(0.05, 0, 0)), atras.clone().add(new THREE.Vector3(0.18, -0.3, 0.2)).setY(Math.max(piso + 0.1, atras.y - 0.5)),
                             lub.clone().add(new THREE.Vector3(0, 0.02, -0.15)), lub, lub.clone().lerp(salidaAire, 0.5).setY(piso + 0.03), salidaAire.clone().setY(piso + 0.03)], 0.017, matAire);
      agua = manguera(agua, [atras.clone().add(new THREE.Vector3(-0.05, 0.03, 0)), atras.clone().add(new THREE.Vector3(-0.2, -0.25, 0.25)).setY(Math.max(piso + 0.1, atras.y - 0.45)),
                             salidaAire.clone().add(new THREE.Vector3(-0.35, 0, 0)).lerp(atras, 0.6).setY(piso + 0.02), salidaAire.clone().add(new THREE.Vector3(-0.35, 0, 0)).setY(piso + 0.02)], 0.011, matAgua);
    }
    return { atras, frente, mango };
  };
  g.ver = (on) => { g.visible = on; };
  return g;
}

/* ====================================================================== scoop (LHD) */
export function crearScoop(THREE, d) {
  const W = d.ancho || 2.2, H = d.alto || 2.1, L = d.largo || 8.7;
  const Wb = d.ancho_balde || W * 0.95;
  const amarillo = new THREE.MeshStandardMaterial({ color: 0xe6b01e, roughness: 0.5, metalness: 0.25 });
  const amarilloOsc = new THREE.MeshStandardMaterial({ color: 0xc8951a, roughness: 0.6, metalness: 0.2 });
  const llanta = new THREE.MeshStandardMaterial({ color: 0x141517, roughness: 0.95 });
  const negro = new THREE.MeshStandardMaterial({ color: 0x1e2023, roughness: 0.7 });
  const vidrio = new THREE.MeshStandardMaterial({ color: 0x2b3640, roughness: 0.1, metalness: 0.5, transparent: true, opacity: 0.8 });
  const acero = new THREE.MeshStandardMaterial({ color: 0x8e959c, roughness: 0.4, metalness: 0.8 });
  const luz = new THREE.MeshBasicMaterial({ color: 0xfffbe6 });
  const roja = new THREE.MeshBasicMaterial({ color: 0xd8342c });
  const g = new THREE.Group();
  const box = (w, h, l, mat, x, y, z, padre = g) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), mat); m.position.set(x, y, z); padre.add(m); return m; };
  const r = Math.min(0.72, 0.31 * H);              // radio de llanta
  const anchoLl = Math.min(0.55, W * 0.21);
  const zEje1 = -0.2 * L, zEje2 = 0.2 * L;          // ejes delantero y trasero (frente hacia −z)
  // bastidor trasero: motor, capó escalonado, parrilla y parachoques
  const capoH = Math.min(H * 0.78, 1.97);
  box(W * 0.9, capoH - r * 0.75, 0.46 * L, amarillo, 0, r * 0.75 + (capoH - r * 0.75) / 2, 0.26 * L);
  box(W * 0.84, 0.14, 0.4 * L, amarilloOsc, 0, capoH + 0.07, 0.27 * L);
  const parrilla = box(W * 0.62, capoH * 0.48, 0.05, negro, 0, r * 0.75 + capoH * 0.3, 0.49 * L + 0.01);
  for (let k = 0; k < 7; k++) box(W * 0.6, 0.02, 0.06, acero, 0, parrilla.position.y - capoH * 0.22 + k * capoH * 0.075, 0.49 * L + 0.03);
  box(W * 0.95, 0.3, 0.18, amarillo, 0, r * 0.75, 0.495 * L);
  for (const s of [-1, 1]) {
    box(0.1, 0.1, 0.03, luz, s * W * 0.38, capoH * 0.78, 0.5 * L + 0.02);
    box(0.08, 0.08, 0.03, roja, s * W * 0.38, capoH * 0.6, 0.5 * L + 0.02);
    box(0.06, capoH * 0.6, 0.06, acero, s * W * 0.3, capoH + 0.3, 0.32 * L);      // pasamanos
  }
  // articulación central
  const art = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, r * 1.2, 16), acero); art.position.set(0, r * 0.9, 0); g.add(art);
  // cabina lateral (operador sentado de costado)
  const cabX = -W / 2 + 0.5;
  box(0.95, H - r * 0.9, 1.3, amarillo, cabX, r * 0.9 + (H - r * 0.9) / 2, 0.06 * L);
  box(1.0, 0.08, 1.4, amarilloOsc, cabX, H - 0.04, 0.06 * L);
  for (const s of [-1, 1]) box(0.02, (H - r * 0.9) * 0.45, 1.0, vidrio, cabX + s * 0.48, H - (H - r * 0.9) * 0.32, 0.06 * L);
  box(0.8, (H - r * 0.9) * 0.45, 0.02, vidrio, cabX, H - (H - r * 0.9) * 0.32, 0.06 * L - 0.66);
  box(0.11, 0.08, 0.04, luz, cabX + 0.3, H - 0.16, 0.06 * L - 0.67);
  box(0.11, 0.08, 0.04, luz, cabX - 0.3, H - 0.16, 0.06 * L - 0.67);
  // bastidor delantero
  const del = new THREE.Group(); g.add(del);
  box(W * 0.78, r * 0.95, 0.3 * L, amarillo, 0, r * 0.95, -0.16 * L, del);
  // llantas con aro
  const tire = new THREE.CylinderGeometry(r, r, anchoLl, 26), aro = new THREE.CylinderGeometry(r * 0.56, r * 0.56, anchoLl + 0.02, 18);
  const masa = new THREE.CylinderGeometry(r * 0.2, r * 0.2, anchoLl + 0.06, 10);
  const ruedas = [];
  for (const z of [zEje1, zEje2]) for (const s of [-1, 1]) {
    const w = new THREE.Group(); w.position.set(s * (W / 2 - anchoLl / 2), r, z); w.rotation.z = Math.PI / 2;
    w.add(new THREE.Mesh(tire, llanta)); w.add(new THREE.Mesh(aro, amarillo)); w.add(new THREE.Mesh(masa, amarilloOsc));
    for (let k = 0; k < 10; k++) {                                          // banda de rodadura
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.05, anchoLl * 0.92, r * 0.22), llanta);
      const a = k / 10 * Math.PI * 2; t.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); t.rotation.y = -a; w.add(t);
    }
    g.add(w); ruedas.push(w);
  }
  for (const z of [zEje1, zEje2]) box(W * 0.9, 0.5, r * 2.2, amarillo, 0, r * 1.62, z);   // guardafangos
  // brazos de levante (pivote atrás, arriba) y balde
  const brazos = new THREE.Group(); brazos.position.set(0, r * 1.75, -0.05 * L); g.add(brazos);
  const largoBrazo = 0.24 * L;
  for (const s of [-1, 1]) {
    const b = box(0.16, 0.26, largoBrazo, amarilloOsc, s * Wb * 0.32, 0, -largoBrazo / 2, brazos); b.rotation.x = 0.0;
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, largoBrazo * 0.8, 10), acero);
    c.rotation.x = Math.PI / 2 - 0.25; c.position.set(s * Wb * 0.16, -0.25, -largoBrazo * 0.45); brazos.add(c);
  }
  const balde = new THREE.Group(); brazos.add(balde);
  balde.position.set(0, -(r * 1.75 + largoBrazo * Math.sin(0.06) - 0.03) / Math.cos(0.06), -largoBrazo);
  const prof = Math.min(1.35, 0.17 * L), altB = Math.min(1.05, H * 0.47);
  const perfil = new THREE.Shape();
  perfil.moveTo(-prof, 0); perfil.lineTo(0.05, 0); perfil.quadraticCurveTo(0.22, 0.05, 0.25, altB * 0.6);
  perfil.lineTo(0.2, altB); perfil.lineTo(0.02, altB); perfil.lineTo(0.05, altB * 0.6);
  perfil.quadraticCurveTo(0.02, 0.18, -0.15, 0.13); perfil.lineTo(-prof + 0.05, 0.1); perfil.lineTo(-prof, 0);
  const geoB = new THREE.ExtrudeGeometry(perfil, { depth: Wb, bevelEnabled: false });
  geoB.translate(0, 0, -Wb / 2); geoB.rotateY(-Math.PI / 2);
  const cuerpoB = new THREE.Mesh(geoB, amarillo); balde.add(cuerpoB);
  const ladoMat = new THREE.MeshStandardMaterial({ color: 0xc8951a, roughness: 0.6, metalness: 0.2, side: THREE.DoubleSide });
  const lleno = new THREE.Shape(); lleno.moveTo(-prof, 0); lleno.lineTo(0.05, 0); lleno.quadraticCurveTo(0.22, 0.05, 0.25, altB * 0.6);
  lleno.lineTo(0.2, altB); lleno.lineTo(-prof * 0.35, altB * 0.55); lleno.lineTo(-prof, 0.12); lleno.lineTo(-prof, 0);
  for (const s of [-1, 1]) {
    const lado = new THREE.Mesh(new THREE.ShapeGeometry(lleno), ladoMat);
    lado.rotation.y = -Math.PI / 2; lado.position.x = s * Wb / 2; balde.add(lado);
  }
  const filo = new THREE.Mesh(new THREE.BoxGeometry(Wb, 0.05, 0.12), acero); filo.position.set(0, 0.02, -prof + 0.06); balde.add(filo);
  for (let k = 0; k < 7; k++) {
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.16, 4), acero);
    t.rotation.x = -Math.PI / 2; t.position.set(-Wb / 2 + 0.12 + k * (Wb - 0.24) / 6, 0.03, -prof - 0.06); balde.add(t);
  }
  const faro = new THREE.SpotLight(0xfff3d6, 14, 25, 0.75, 0.5); faro.position.set(cabX, H, -0.3); g.add(faro);
  faro.target.position.set(0, 0.5, -8); g.add(faro.target);
  g.userData = { W, H, L, Wb, r, prof, altB, capacidad: d.balde_m3 || 2.8 };
  g.brazos = brazos; g.balde = balde; g.ruedas = ruedas;
  /* subir (0 = balde al piso para cargar, 1 = posición de acarreo) e inclinar el balde (0 plano, 1 recogido) */
  g.posicion = function (subir, recoger) {
    brazos.rotation.x = 0.06 + 0.28 * subir;
    balde.rotation.x = 0.55 * recoger - 0.28 * subir;
  };
  g.rodar = function (dz) { for (const w of ruedas) w.rotation.x += dz / r; };
  /* distancia de la punta del balde al centro de la máquina (para acercarse a la pila) */
  g.alcance = () => 0.05 * L + largoBrazo + prof + 0.1;
  g.posicion(0, 0.3);
  return g;
}
