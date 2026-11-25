/* Motor de cálculo de LithoBlast3D en un Web Worker (Pyodide = Python en el navegador).
   La interfaz no se congela mientras calcula. */
const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.29.3/full/";
importScripts(PYODIDE + "pyodide.js");

let py = null;
let listo = null;
const extras = new Set();

function avisar(texto) { postMessage({ tipo: "progreso", texto }); }

async function iniciar() {
  avisar("Cargando Python…");
  py = await loadPyodide({ indexURL: PYODIDE });
  avisar("Cargando numpy…");
  await py.loadPackage("numpy");
  avisar("Cargando el motor de LithoBlast3D…");
  const r = await fetch("nucleo.zip", { cache: "no-cache" });
  if (!r.ok) throw new Error("No se encontró nucleo.zip");
  py.unpackArchive(await r.arrayBuffer(), "zip", { extractDir: "/home/pyodide/b3d" });
  py.runPython("import sys; sys.path.insert(0, '/home/pyodide/b3d'); import movil");
  return true;
}

async function paquete(nombre, texto) {
  if (extras.has(nombre)) return;
  avisar(texto);
  await py.loadPackage(nombre);
  extras.add(nombre);
}

onmessage = async (ev) => {
  const { id, fn, arg } = ev.data;
  try {
    if (!listo) listo = iniciar();
    await listo;
    if (fn === "__iniciar__") { postMessage({ id, resultado: '{"ok": true, "datos": null}' }); return; }
    if (fn === "crear_tin" || fn === "malla_topo" || fn === "azimut_salida")
      await paquete("scipy", "Cargando el triangulador (solo la primera vez)…");
    const f = py.globals.get("movil")[fn];
    const res = f(arg == null ? "{}" : (typeof arg === "string" ? arg : JSON.stringify(arg)));
    postMessage({ id, resultado: res });
  } catch (e) {
    listo = listo && py ? listo : null;
    postMessage({ id, resultado: JSON.stringify({ ok: false, error: String(e && e.message || e) }) });
  }
};
