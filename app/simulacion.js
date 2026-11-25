/* LithoBlast3D móvil — simulación 3D: perforación → carguío → voladura (secuencia de retardos) → fragmentación.
   Física simplificada (ilustrativa): cada bloque sale con su taladro más cercano, cae con gravedad,
   rebota y se acomoda formando la pila. */

export function crearSimulacion(caja, escena, THREE, OrbitControls) {
  caja.innerHTML = "";
  caja.style.position = "relative";
  const W = caja.clientWidth || 360, H = caja.clientHeight || 480;
  const ren = new THREE.WebGLRenderer({ antialias: true });
  ren.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  ren.setSize(W, H);
  ren.setClearColor(0x111418);
  caja.appendChild(ren.domElement);
  const sc = new THREE.Scene();
  sc.add(new THREE.AmbientLight(0xffffff, 0.7));
  const luz = new THREE.DirectionalLight(0xffffff, 1.5);
  luz.position.set(4, 8, 6);
  sc.add(luz);
  const cam = new THREE.PerspectiveCamera(45, W / H, 0.05, 5000);
  const ctl = new OrbitControls(cam, ren.domElement);
  ctl.enableDamping = true;
  const V = (p) => new THREE.Vector3(p[0], p[1], p[2]);
  const caja3 = new THREE.Box3();

  // ------------------------------------------------------------ líneas fijas (contorno, curvas)
  for (const l of escena.lineas || []) {
    const geo = new THREE.BufferGeometry().setFromPoints(l.p.map(V));
    const o = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: l.color }));
    sc.add(o);
    caja3.expandByObject(o);
  }

  // ------------------------------------------------------------ superficie del terreno (TIN muestreado)
  const T = escena.terreno;
  const alturaTerreno = (X, Z) => {
    if (!T) return null;
    const fi = (X - T.X0) / T.dx, fj = (T.Z0 - Z) / T.dy;
    const i = Math.floor(fi), j = Math.floor(fj);
    if (i < 0 || j < 0 || i >= T.nx - 1 || j >= T.ny - 1) return null;
    const h = (a, b) => T.h[b * T.nx + a];
    const q = [h(i, j), h(i + 1, j), h(i, j + 1), h(i + 1, j + 1)];
    if (q.some((v) => v == null)) return q.find((v) => v != null) ?? null;
    const u = fi - i, v = fj - j;
    return (q[0] * (1 - u) + q[1] * u) * (1 - v) + (q[2] * (1 - u) + q[3] * u) * v;
  };
  if (T) {
    const pos = [], col = [], idx = [], c = new THREE.Color();
    const n0 = T.z0 ?? Math.min(...T.h.filter((v) => v != null)), n1 = T.z1 ?? Math.max(...T.h.filter((v) => v != null));
    for (let j = 0; j < T.ny; j++) for (let i = 0; i < T.nx; i++) {
      const y = T.h[j * T.nx + i] ?? 0;
      pos.push(T.X0 + i * T.dx, y, T.Z0 - j * T.dy);
      const k = Math.min(Math.max((y - n0) / ((n1 - n0) || 1), 0), 1);
      c.setHSL(0.1 - 0.04 * k, 0.22, 0.24 + 0.2 * k); col.push(c.r, c.g, c.b);
    }
    for (let j = 0; j < T.ny - 1; j++) for (let i = 0; i < T.nx - 1; i++) {
      const a = j * T.nx + i, b = a + 1, d = a + T.nx, e = d + 1;
      if ([a, b, d, e].some((k) => T.h[k] == null)) continue;
      idx.push(a, d, b, b, d, e);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    const sup = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide,
                                                                      transparent: true, opacity: 0.82, depthWrite: false,
                                                                      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
    sc.add(sup);
  }

  // ------------------------------------------------------------ taladros y cargas
  const cil = new THREE.CylinderGeometry(1, 1, 1, 10);
  const matCarga = new THREE.MeshStandardMaterial({ color: 0xe5534b, roughness: 0.5, emissive: 0x330000 });
  const matPunta = new THREE.MeshBasicMaterial({ color: 0xfff2a0 });
  const esfera = new THREE.SphereGeometry(1, 14, 10);
  const arriba = new THREE.Vector3(0, 1, 0);
  const tal = (escena.taladros || []).map((t, i) => {
    const a = V(t.a), b = V(t.b), dir = b.clone().sub(a), L = dir.length();
    dir.normalize();
    const m = new THREE.Mesh(cil, new THREE.MeshStandardMaterial({ color: t.color, roughness: 0.6 }));
    m.quaternion.setFromUnitVectors(arriba, dir);
    sc.add(m);
    let mc = null;
    if (t.carga) {
      mc = new THREE.Mesh(cil, matCarga);
      mc.quaternion.copy(m.quaternion);
      mc.visible = false;
      sc.add(mc);
    }
    caja3.expandByPoint(a);
    caja3.expandByPoint(b);
    return { ...t, i, a, b, dir, L, m, mc, perf: 1, carg: t.carga ? 1 : 0, det: false };
  });
  const cargados = tal.filter((t) => t.carga && t.t != null);
  const punta = new THREE.Mesh(esfera, matPunta);
  punta.visible = false;
  sc.add(punta);

  function ponerTaladro(t, frac) {
    const f = Math.max(frac, 0.0001);
    t.m.scale.set(t.r, t.L * f, t.r);
    t.m.position.copy(t.a.clone().add(t.dir.clone().multiplyScalar(t.L * f / 2)));
    t.m.visible = frac > 0;
  }
  function ponerCarga(t, frac) {
    if (!t.carga) return;
    const [f0, f1] = t.carga;
    const largo = (f1 - f0) * t.L * frac;
    t.mc.visible = frac > 0 && !t.det;
    if (!t.mc.visible) return;
    const fondo = t.a.clone().add(t.dir.clone().multiplyScalar(t.L * f1));
    t.mc.scale.set(t.r * 1.35, Math.max(largo, 0.0001), t.r * 1.35);
    t.mc.position.copy(fondo.clone().sub(t.dir.clone().multiplyScalar(largo / 2)));
  }

  // ------------------------------------------------------------ macizo rocoso en bloques
  const R = escena.roca || {};
  const dentro = (pol, x, y) => {
    let d = false;
    for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) {
      const [xi, yi] = pol[i], [xj, yj] = pol[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-12) + xi) d = !d;
    }
    return d;
  };
  const centros = [];
  let s = 0.4;
  if (R.tipo === "frente") {
    const xs = R.contorno.map((p) => p[0]), ys = R.contorno.map((p) => p[1]);
    const area = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
    s = Math.min(Math.max(Math.cbrt(area * 0.8 * R.prof / 420), 0.2), 0.8);  // unos 400 bloques
    for (let x = Math.min(...xs) + s / 2; x < Math.max(...xs); x += s)
      for (let y = Math.min(...ys) + s / 2; y < Math.max(...ys); y += s)
        if (dentro(R.contorno, x, y))
          for (let z = -s / 2; z > -R.prof; z -= s) centros.push([x, y, z]);
  } else if (R.tipo === "banco") {
    const xs = R.poligono.map((p) => p[0]), zs = R.poligono.map((p) => p[1]);
    const area = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...zs) - Math.min(...zs));
    const h = R.altura || 10;
    s = Math.max(Math.cbrt(area * h / 480), 0.5);  // unos 450 bloques
    for (let x = Math.min(...xs) + s / 2; x < Math.max(...xs); x += s)
      for (let z = Math.min(...zs) + s / 2; z < Math.max(...zs); z += s) {
        if (!dentro(R.poligono, x, z)) continue;
        let mejor = null, dmin = 1e9;
        for (const t of tal) { const d = Math.hypot(t.a.x - x, t.a.z - z); if (d < dmin) { dmin = d; mejor = t; } }
        if (!mejor) continue;
        const ht = alturaTerreno(x, z);
        const techo = ht ?? mejor.a.y, fondo = mejor.a.y - (mejor.altura || h);
        for (let y = techo - s / 2; y > fondo; y -= s) centros.push([x, y, z]);
      }
  }
  const caja_b = new THREE.BoxGeometry(s * 0.88, s * 0.88, s * 0.88);
  const matRoca = new THREE.MeshStandardMaterial({ color: 0x6f6458, transparent: true, opacity: 0.12, depthWrite: false });
  const matFrag = [0x7d7064, 0x8a7d70, 0x6a5f55, 0x968a7c].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }));
  const plano = R.tipo === "banco" ? (p, t) => Math.hypot(p.x - t.a.x, p.z - t.a.z) : (p, t) => Math.hypot(p.x - t.a.x, p.y - t.a.y);
  const bloques = centros.map((c) => {
    const m = new THREE.Mesh(caja_b, matRoca);
    m.position.set(c[0], c[1], c[2]);
    sc.add(m);
    let mejor = null, dmin = 1e9;
    for (const t of cargados) { const d = plano(m.position, t); if (d < dmin) { dmin = d; mejor = t; } }
    return { m, p0: m.position.clone(), v: new THREE.Vector3(), w: new THREE.Vector3(), estado: 0, tal: mejor, dist: dmin };
  });
  for (const b of bloques) caja3.expandByObject(b.m);

  // ------------------------------------------------------------ pila (mapa de alturas sencillo)
  const piso = escena.piso ?? 0;
  const paredes = R.tipo === "frente" ? [Math.min(...R.contorno.map((p) => p[0])) + s / 2, Math.max(...R.contorno.map((p) => p[0])) - s / 2] : null;
  const pila = new Map();
  const celda = (p) => `${Math.round(p.x / s)},${Math.round(p.z / s)}`;
  const salida = escena.salida ? new THREE.Vector3(escena.salida[0], 0, escena.salida[1]).normalize() : new THREE.Vector3(0, 0, 1);
  const azar = (() => { let x = 12345; return () => ((x = (x * 16807) % 2147483647) / 2147483647); })();
  const centro = caja3.getCenter(new THREE.Vector3());

  function lanzar(b) {
    b.estado = 1;
    b.m.material = matFrag[Math.floor(azar() * matFrag.length)];
    const k = Math.max(0.35, 1 - b.dist / ((escena.radio || 2.5)));
    if (R.tipo === "banco") {
      const vel = (3 + 5 * azar()) * k;
      b.v.copy(salida).multiplyScalar(vel).add(new THREE.Vector3((azar() - 0.5) * 2, 2 + 3 * azar(), (azar() - 0.5) * 2));
    } else {
      const lado = b.m.position.clone().sub(centro); lado.z = 0;
      b.v.set(lado.x * 0.9 + (azar() - 0.5), 1 + 2.5 * azar() + lado.y * 0.3, (4 + 6 * azar()) * k);
    }
    b.w.set((azar() - 0.5) * 8, (azar() - 0.5) * 8, (azar() - 0.5) * 8);
  }
  function fisica(dt) {
    let activos = 0;
    for (const b of bloques) {
      if (b.estado !== 1) continue;
      activos++;
      b.v.y -= 9.81 * dt;
      b.m.position.add(b.v.clone().multiplyScalar(dt));
      if (paredes && (b.m.position.x < paredes[0] || b.m.position.x > paredes[1])) {  // hastiales de la labor
        b.m.position.x = Math.min(Math.max(b.m.position.x, paredes[0]), paredes[1]);
        b.v.x = -b.v.x * 0.3;
      }
      b.m.rotation.x += b.w.x * dt; b.m.rotation.y += b.w.y * dt; b.m.rotation.z += b.w.z * dt;
      const k = celda(b.m.position), suelo = piso + (pila.get(k) || 0) + s * 0.44;
      if (b.m.position.y < suelo) {
        b.m.position.y = suelo;
        if (Math.abs(b.v.y) < 1.2) {
          // derrumbe: si la celda está más alta que una vecina, el bloque rueda hacia la más baja
          let ix = Math.round(b.m.position.x / s), iz = Math.round(b.m.position.z / s);
          for (let n = 0; n < 12; n++) {
            const h = pila.get(`${ix},${iz}`) || 0;
            let mejor = null, hm = h;
            for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
              const x = (ix + dx) * s;
              if (paredes && (x < paredes[0] - s / 2 || x > paredes[1] + s / 2)) continue;
              const hv = pila.get(`${ix + dx},${iz + dz}`) || 0;
              if (hv < hm - s * 0.6) { hm = hv; mejor = [dx, dz]; }
            }
            if (!mejor) break;
            ix += mejor[0]; iz += mejor[1];
          }
          const kk = `${ix},${iz}`;
          b.m.position.set(paredes ? Math.min(Math.max(ix * s, paredes[0]), paredes[1]) : ix * s,
                           piso + (pila.get(kk) || 0) + s * 0.44, iz * s);
          b.estado = 2;
          pila.set(kk, (pila.get(kk) || 0) + s * 0.55);
        } else {
          b.v.y = -b.v.y * 0.25; b.v.x *= 0.55; b.v.z *= 0.55; b.w.multiplyScalar(0.5);
        }
      }
    }
    return activos;
  }

  // ------------------------------------------------------------ línea de tiempo
  const tiempos = [...new Set(cargados.map((t) => t.t))].sort((x, y) => x - y);
  const paso = escena.paso_s || 0.3;           // segundos de animación por unidad de tiempo de salida
  const tDet = (t) => (escena.ms ? t * paso : tiempos.indexOf(t) * paso);
  const ordenPerf = tal.slice().sort((x, y) => (x.orden ?? x.i) - (y.orden ?? y.i));
  const DUR_P = Math.min(0.35, 14 / Math.max(tal.length, 1));
  const DUR_C = Math.min(0.18, 7 / Math.max(cargados.length, 1));
  const destellos = [];
  let fase = "malla", reloj = 0, vel = 1, pausa = false, detonados = 0, tFrag = 0;

  function irA(f) {
    fase = f; reloj = 0; detonados = 0; tFrag = 0; pila.clear();
    for (const d of destellos) sc.remove(d.m);
    destellos.length = 0;
    for (const b of bloques) { b.m.position.copy(b.p0); b.m.rotation.set(0, 0, 0); b.m.material = matRoca; b.estado = 0; b.v.set(0, 0, 0); }
    for (const t of tal) {
      t.det = false;
      t.perf = f === "malla" || f === "carguio" || f === "voladura" ? 1 : 0;
      t.carg = f === "voladura" || f === "malla" ? 1 : 0;
      ponerTaladro(t, t.perf); ponerCarga(t, t.carga ? t.carg : 0);
    }
    punta.visible = false;
    pausa = false;
    hud();
  }
  function paso_anim(dt) {
    reloj += dt;
    if (fase === "perforacion") {
      const total = ordenPerf.length * DUR_P;
      ordenPerf.forEach((t, k) => {
        const f = Math.min(Math.max((reloj - k * DUR_P) / DUR_P, 0), 1);
        if (f !== t.perf) { t.perf = f; ponerTaladro(t, f); }
        if (f > 0 && f < 1) { punta.visible = true; punta.scale.setScalar(t.r * 2.5); punta.position.copy(t.a.clone().add(t.dir.clone().multiplyScalar(t.L * f))); }
      });
      if (reloj >= total) { punta.visible = false; fase = "carguio"; reloj = 0; }
    } else if (fase === "carguio") {
      cargados.forEach((t, k) => { const f = Math.min(Math.max((reloj - k * DUR_C) / DUR_C, 0), 1); if (f !== t.carg) { t.carg = f; ponerCarga(t, f); } });
      if (reloj >= cargados.length * DUR_C + 0.4) { fase = "voladura"; reloj = 0; }
    } else if (fase === "voladura" || fase === "fragmentacion") {
      for (const t of cargados) {
        if (t.det || reloj < tDet(t.t)) continue;
        t.det = true; detonados++;
        if (t.mc) t.mc.visible = false;
        t.m.visible = false;
        const d = new THREE.Mesh(esfera, new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0.95 }));
        d.position.copy(t.a.clone().add(t.dir.clone().multiplyScalar(t.L * 0.6)));
        sc.add(d); destellos.push({ m: d, edad: 0, r: (escena.radio || 2.5) * 0.45 });
        for (const b of bloques) if (b.tal === t && b.estado === 0) lanzar(b);
      }
      for (const d of destellos) { d.edad += dt; const k = d.edad / 0.45; d.m.scale.setScalar(Math.max(d.r * k, 0.001)); d.m.material.opacity = Math.max(0, 0.95 * (1 - k)); }
      for (let i = destellos.length - 1; i >= 0; i--) if (destellos[i].edad > 0.45) { sc.remove(destellos[i].m); destellos.splice(i, 1); }
      const activos = fisica(Math.min(dt, 1 / 30));
      if (detonados === cargados.length) { fase = "fragmentacion"; tFrag += dt; if ((activos === 0 && tFrag > 0.5) || tFrag > 12) { fase = "resultado"; for (const b of bloques) if (b.estado === 0) b.m.visible = true; } }
    }
    hud();
  }

  // ------------------------------------------------------------ controles e indicador
  const NOMBRES = { malla: "Malla", perforacion: "Perforación", carguio: "Carguío", voladura: "Voladura", fragmentacion: "Fragmentación", resultado: "Resultado" };
  const barra = document.createElement("div");
  barra.className = "sim-barra";
  barra.innerHTML = `<div class="sim-hud" id="sim-hud"></div>
    <div class="sim-ctl"><button data-a="play">▶</button><button data-a="reset">⟲</button><button data-a="vel">1×</button></div>
    <div class="sim-fases">${["perforacion", "carguio", "voladura"].map((f) => `<button data-f="${f}">${NOMBRES[f]}</button>`).join("")}</div>`;
  caja.appendChild(barra);
  const btnPlay = barra.querySelector('[data-a="play"]');
  function hud() {
    const h = barra.querySelector("#sim-hud");
    let txt = NOMBRES[fase];
    if (fase === "perforacion") txt += ` · ${ordenPerf.filter((t) => t.perf >= 1).length}/${tal.length} taladros`;
    if (fase === "carguio") txt += ` · ${cargados.filter((t) => t.carg >= 1).length}/${cargados.length} cargados`;
    if (fase === "voladura" || fase === "fragmentacion") {
      const ult = cargados.filter((t) => t.det).map((t) => t.t);
      const tt = ult.length ? Math.max(...ult) : null;
      txt += ` · ${detonados}/${cargados.length} detonados` + (tt != null ? (escena.ms ? ` · ${Math.round(tt)} ms` : ` · retardo ${tt}`) : "");
    }
    if (fase === "resultado") txt += ` · ${bloques.filter((b) => b.estado === 2).length} bloques en la pila`;
    h.textContent = txt;
    btnPlay.textContent = pausa || fase === "malla" || fase === "resultado" ? "▶" : "⏸";
    barra.querySelectorAll("[data-f]").forEach((b) => b.classList.toggle("on", b.dataset.f === fase || (fase === "fragmentacion" && b.dataset.f === "voladura")));
  }
  barra.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.f) { irA(b.dataset.f); return; }
    if (b.dataset.a === "play") {
      if (fase === "malla" || fase === "resultado") irA("perforacion"); else pausa = !pausa;
    } else if (b.dataset.a === "reset") irA("malla");
    else if (b.dataset.a === "vel") { vel = vel >= 4 ? 0.5 : vel * 2; b.textContent = `${vel}×`; }
    hud();
  });

  // ------------------------------------------------------------ cámara y bucle
  const c = caja3.getCenter(new THREE.Vector3()), rr = caja3.getSize(new THREE.Vector3()).length() || 5;
  ctl.target.copy(c);
  cam.position.copy(c.clone().add(new THREE.Vector3(...(escena.vista || [0.6, 0.45, 1])).normalize().multiplyScalar(rr * 1.05)));
  irA("malla");
  let vivo = true, antes = performance.now();
  function bucle(ahora) {
    if (!vivo) return;
    const dt = Math.min(((ahora ?? performance.now()) - antes) / 1000, 0.05);
    antes = ahora ?? performance.now();
    if (!pausa && fase !== "malla" && fase !== "resultado") paso_anim(dt * vel);
    ctl.update();
    ren.render(sc, cam);
    requestAnimationFrame(bucle);
  }
  requestAnimationFrame(bucle);
  return {
    cerrar() { vivo = false; ren.dispose(); },
    // para pruebas: avanza la simulación sin esperar
    avanzar(seg, f) { if (f) irA(f); const n = Math.ceil(seg / 0.02); for (let i = 0; i < n && fase !== "resultado"; i++) paso_anim(0.02); const ps = bloques.filter((b) => b.estado === 2).map((b) => b.m.position);
      const r = (k, f) => ps.length ? +f(...ps.map((p) => p[k])).toFixed(2) : null;
      return { fase, detonados, bloques: bloques.length, pila: ps.length, x: [r("x", Math.min), r("x", Math.max)], y: [r("y", Math.min), r("y", Math.max)], z: [r("z", Math.min), r("z", Math.max)] }; },
  };
}
