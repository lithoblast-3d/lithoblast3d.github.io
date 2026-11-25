/* LithoBlast3D — sonido de la simulación del ciclo (Web Audio, sintetizado: no usa archivos).
   - Perforación: golpeteo del martillo (jackleg ≈ 35 golpes/s; jumbo hidráulico más grave) + soplido de aire.
   - Motor diésel (jumbo / scoop): zumbido grave que sube con la velocidad.
   - Carguío: golpes secos del atacador de madera.
   - Mecha: siseo de la mecha rápida / Carmex al arder.
   - Detonación: golpe grave con eco de galería; cada taladro un estampido.
   - Ventilación: soplido del ventilador.
   - Scoop: motor y golpe del balde al cargar.
   Los sonidos son ilustrativos (no son grabaciones de equipos reales). El navegador solo permite sonido después
   de que el usuario toca la pantalla: se activa con el primer ▶. */

export function crearSonido() {
  let ctx = null, maestro = null, ruido = null, activo = true;
  const capas = {};

  function iniciar() {
    if (ctx) { if (ctx.state === "suspended") ctx.resume(); return true; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    maestro = ctx.createGain(); maestro.gain.value = activo ? 0.8 : 0;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6;
    maestro.connect(comp); comp.connect(ctx.destination);
    // ruido blanco reutilizable (2 s)
    ruido = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = ruido.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }
  const fuenteRuido = () => { const s = ctx.createBufferSource(); s.buffer = ruido; s.loop = true; return s; };

  /* capa continua: se crea una vez y se regula con nivel(0..1) */
  function capa(nombre, crear) {
    if (!ctx) return null;
    if (!capas[nombre]) {
      const g = ctx.createGain(); g.gain.value = 0; g.connect(maestro);
      capas[nombre] = { g, ...crear(g) };
    }
    return capas[nombre];
  }
  function nivel(nombre, v, crear, extra) {
    const c = capa(nombre, crear);
    if (!c) return;
    c.g.gain.setTargetAtTime(v, ctx.currentTime, 0.08);
    if (extra) extra(c);
  }
  const perforadora = (g) => {
    // golpeteo: ruido filtrado modulado por un LFO cuadrado
    const s = fuenteRuido(), bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1800; bp.Q.value = 0.9;
    const mod = ctx.createGain(); mod.gain.value = 0;
    const lfo = ctx.createOscillator(); lfo.type = "square"; lfo.frequency.value = 35;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.5; lfo.connect(lfoG); lfoG.connect(mod.gain);
    const base = ctx.createConstantSource ? ctx.createConstantSource() : null;
    if (base) { base.offset.value = 0.5; base.connect(mod.gain); base.start(); }
    s.connect(bp); bp.connect(mod); mod.connect(g);
    const aire = fuenteRuido(), hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 3500;
    const ga = ctx.createGain(); ga.gain.value = 0.25; aire.connect(hp); hp.connect(ga); ga.connect(g);
    s.start(); lfo.start(); aire.start();
    return { lfo, bp };
  };
  const motor = (g) => {
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(); o1.type = "sawtooth"; o2.type = "square";
    o1.frequency.value = 42; o2.frequency.value = 84.5;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 260;
    const g2 = ctx.createGain(); g2.gain.value = 0.35;
    o1.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g);
    o1.start(); o2.start();
    return { o1, o2 };
  };
  const siseo = (g) => {
    const s = fuenteRuido(), hp = ctx.createBiquadFilter(); hp.type = "bandpass"; hp.frequency.value = 5200; hp.Q.value = 0.7;
    s.connect(hp); hp.connect(g); s.start(); return {};
  };
  const ventilador = (g) => {
    const s = fuenteRuido(), lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 700;
    s.connect(lp); lp.connect(g); s.start();
    const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = 118; const go = ctx.createGain(); go.gain.value = 0.15;
    o.connect(go); go.connect(g); o.start();
    return {};
  };

  function golpe(frec = 180, dur = 0.08, vol = 0.5) {         // atacador, balde, cambio de barra
    if (!ctx || !activo) return;
    const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "triangle"; o.frequency.setValueAtTime(frec, t); o.frequency.exponentialRampToValueAtTime(frec * 0.5, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(maestro); o.start(t); o.stop(t + dur + 0.02);
  }
  let ultimoTiro = 0;
  function detonacion(fuerza = 1) {                          // estampido grave + cola de eco en la galería
    if (!ctx || !activo) return;
    const t = Math.max(ctx.currentTime, ultimoTiro + 0.025); ultimoTiro = t;
    const s = ctx.createBufferSource(); s.buffer = ruido;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.setValueAtTime(1600, t); lp.frequency.exponentialRampToValueAtTime(90, t + 1.2);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.9 * fuerza, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
    s.connect(lp); lp.connect(g); g.connect(maestro); s.start(t, Math.random()); s.stop(t + 1.7);
    const o = ctx.createOscillator(), go = ctx.createGain(); o.type = "sine";
    o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(28, t + 0.5);
    go.gain.setValueAtTime(0.9 * fuerza, t); go.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    o.connect(go); go.connect(maestro); o.start(t); o.stop(t + 0.75);
  }
  function chispazo() {                                       // encendido de la mecha
    if (!ctx || !activo) return;
    const t = ctx.currentTime, s = ctx.createBufferSource(); s.buffer = ruido;
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 2500;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.6, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    s.connect(hp); hp.connect(g); g.connect(maestro); s.start(t); s.stop(t + 0.45);
  }

  /* estado por cuadro: qué suena y con qué intensidad */
  function actualizar(e) {
    if (!ctx) return;
    nivel("perf", e.perforando ? (e.jumbo ? 0.32 : 0.45) : 0, perforadora, (c) => {
      c.lfo.frequency.setTargetAtTime(e.jumbo ? 55 : 35, ctx.currentTime, 0.1);
      c.bp.frequency.setTargetAtTime(e.jumbo ? 1100 : 1900, ctx.currentTime, 0.1);
    });
    const m = e.motor || 0;
    nivel("motor", m * 0.42, motor, (c) => {
      c.o1.frequency.setTargetAtTime(38 + 22 * (e.rpm || 0), ctx.currentTime, 0.2);
      c.o2.frequency.setTargetAtTime(77 + 44 * (e.rpm || 0), ctx.currentTime, 0.2);
    });
    nivel("mecha", e.mecha ? Math.min(0.12 + 0.04 * e.mecha, 0.3) : 0, siseo);
    nivel("vent", e.ventilacion ? 0.22 : 0, ventilador);
  }
  function silenciar(on) {
    activo = !on;
    if (maestro) maestro.gain.setTargetAtTime(activo ? 0.8 : 0, ctx.currentTime, 0.05);
  }
  function apagar() {
    for (const k in capas) capas[k].g.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
  }
  function cerrar() { if (ctx) { try { ctx.close(); } catch (e) { /* ya cerrado */ } ctx = null; } }
  return { iniciar, actualizar, golpe, detonacion, chispazo, silenciar, apagar, cerrar, get activo() { return activo; } };
}
