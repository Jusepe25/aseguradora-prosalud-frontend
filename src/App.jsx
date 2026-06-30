import { useState, useEffect, useCallback } from "react";

// ───────────────────────────────────────────────────────────────────────────
// Simulador de Proveedor Externo — Aseguradora ProSalud API
// Banco de pruebas del validador de cobertura (NO es el SPA de MediCitas).
// Stack: React + Tailwind v4.
// ───────────────────────────────────────────────────────────────────────────

const BASE_URL = "http://localhost:4001";
const API_KEY = "prosalud_secret_key_2026"; // banco de pruebas: clave estática del proveedor

// Capa de acceso al proveedor. En el sistema real esto vive dentro del
// Adaptador Aseguradora (puerto saliente), nunca en el SPA del usuario interno.
async function callProvider(path, { method = "GET", params, body } = {}) {
  const url = new URL(`${BASE_URL}${path}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, {
    method,
    headers: {
      "X-Api-Key": API_KEY,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

const TIPOS = [
  { value: "DNI", label: "DNI" },
  { value: "CE", label: "Carné de Extranjería (CE)" },
  { value: "PASAPORTE", label: "Pasaporte" },
];

// Reglas de formato por tipo de documento (espejo de las del backend).
//   DNI       → exactamente 8 dígitos numéricos
//   CE        → 6 a 12 caracteres alfanuméricos
//   PASAPORTE → 6 a 12 caracteres alfanuméricos
const REGLAS_DOC = {
  DNI:       { regex: /^\d{8}$/,             maxLength: 8,  soloDigitos: true,  ayuda: "8 dígitos" },
  CE:        { regex: /^[A-Za-z0-9]{6,12}$/, maxLength: 12, soloDigitos: false, ayuda: "6 a 12 caracteres alfanuméricos" },
  PASAPORTE: { regex: /^[A-Za-z0-9]{6,12}$/, maxLength: 12, soloDigitos: false, ayuda: "6 a 12 caracteres alfanuméricos" },
};

// Limpia el valor según la regla del tipo (quita no-dígitos para DNI y recorta al máximo).
function sanearDocumento(valor, tipo) {
  const regla = REGLAS_DOC[tipo];
  let v = regla.soloDigitos ? valor.replace(/\D/g, "") : valor.replace(/[^A-Za-z0-9]/g, "");
  return v.slice(0, regla.maxLength);
}

// Datos de prueba reales (sql/02_seed.sql del backend)
const EJEMPLOS = [
  { tipo: "DNI", doc: "12345678", hint: "Aprobada · 80%" },
  { tipo: "DNI", doc: "87654321", hint: "Aprobada · 50%" },
  { tipo: "CE", doc: "CE123456", hint: "Aprobada · 100%" },
  { tipo: "DNI", doc: "11223344", hint: "Rechazada · vencida" },
  { tipo: "DNI", doc: "99999999", hint: "Rechazada · no existe" },
];

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200";
const labelCls = "mb-1.5 block text-sm font-medium text-slate-600";

const EMPTY_REG = { nombre: "", apellido: "", tipo: "DNI", documento: "", porcentaje: "", plan: "" };

export default function App() {
  const [tab, setTab] = useState("validar"); // "validar" | "registrar"

  // ── Validar ───────────────────────────────────────────────────────────────
  const [tipo, setTipo] = useState("DNI");
  const [documento, setDocumento] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [reqError, setReqError] = useState(null);

  // ── Registrar ─────────────────────────────────────────────────────────────
  const [reg, setReg] = useState(EMPTY_REG);
  const [regLoading, setRegLoading] = useState(false);
  const [regResult, setRegResult] = useState(null);
  const [regError, setRegError] = useState(null);

  // ── Healthcheck ───────────────────────────────────────────────────────────
  const [health, setHealth] = useState({ state: "idle" });
  const [lastChecked, setLastChecked] = useState(null);

  const checkHealth = useCallback(async () => {
    setHealth({ state: "checking" });
    try {
      const res = await fetch(`${BASE_URL}/health`);
      const data = await res.json().catch(() => ({}));
      setHealth({ state: res.status === 200 && data?.status === "ok" ? "ok" : "down" });
    } catch {
      setHealth({ state: "down" });
    }
    setLastChecked(new Date());
  }, []);

  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  // ── Acciones: Validar ───────────────────────────────────────────────────────
  const canSend = documento.trim().length > 0 && !loading;

  async function validar(tDoc = tipo, nDoc = documento) {
    setReqError(null);
    setResult(null);
    setLoading(true);
    try {
      const { status, data } = await callProvider("/api/v1/asegurados/validar", {
        params: { tipoDocumento: tDoc, numeroDocumento: String(nDoc).trim() },
      });
      if (status === 200) setResult(data);
      else if (status === 401) setReqError("API Key inválida o ausente. Revisa la cabecera X-Api-Key.");
      else if (status === 400) setReqError(data?.mensaje || "Parámetros inválidos.");
      else setReqError(`El proveedor respondió ${status}.`);
    } catch {
      setReqError(
        `No se pudo contactar el proveedor en ${BASE_URL}. Verifica que la aseguradora-prosalud-api esté levantada.`
      );
    } finally {
      setLoading(false);
    }
  }

  function usarEjemplo(e) {
    setTipo(e.tipo);
    setDocumento(e.doc);
    setResult(null);
    setReqError(null);
  }

  // ── Acciones: Registrar ──────────────────────────────────────────────────────
  const pct = Number(reg.porcentaje);
  const docRegOk = REGLAS_DOC[reg.tipo].regex.test(reg.documento.trim());
  const regValid =
    reg.nombre.trim() &&
    reg.apellido.trim() &&
    docRegOk &&
    reg.porcentaje !== "" &&
    Number.isFinite(pct) &&
    pct >= 0 &&
    pct <= 100;

  const updateReg = (k, v) => setReg((r) => ({ ...r, [k]: v }));
  // Al cambiar el tipo de documento se limpia el número (sus reglas cambian).
  const updateRegTipo = (t) => setReg((r) => ({ ...r, tipo: t, documento: "" }));

  async function registrar() {
    setRegError(null);
    setRegResult(null);
    setRegLoading(true);
    try {
      const body = {
        nombre: reg.nombre.trim(),
        apellido: reg.apellido.trim(),
        tipoDocumento: reg.tipo,
        numeroDocumento: reg.documento.trim(),
        porcentajeCobertura: Number(reg.porcentaje),
      };
      if (reg.plan.trim()) body.plan = reg.plan.trim();

      const { status, data } = await callProvider("/api/v1/asegurados", { method: "POST", body });
      if (status === 201) {
        setRegResult(data);
        setReg(EMPTY_REG);
      } else if (status === 409) {
        setRegError(data?.mensaje || "Ya existe un asegurado con ese documento o número de póliza.");
      } else if (status === 400) {
        setRegError(data?.mensaje || "Datos inválidos.");
      } else if (status === 401) {
        setRegError("API Key inválida o ausente. Revisa la cabecera X-Api-Key.");
      } else {
        setRegError(`El proveedor respondió ${status}.`);
      }
    } catch {
      setRegError(
        `No se pudo contactar el proveedor en ${BASE_URL}. Verifica que la aseguradora-prosalud-api esté levantada.`
      );
    } finally {
      setRegLoading(false);
    }
  }

  function validarRegistrado() {
    if (!regResult) return;
    setTipo(regResult.tipoDocumento);
    setDocumento(regResult.numeroDocumento);
    setTab("validar");
    validar(regResult.tipoDocumento, regResult.numeroDocumento);
  }

  const healthMeta = {
    idle: { dot: "bg-slate-300", text: "Sin verificar" },
    checking: { dot: "bg-amber-400 animate-pulse", text: "Verificando…" },
    ok: { dot: "bg-emerald-500", text: "Operativa" },
    down: { dot: "bg-rose-500", text: "No responde" },
  }[health.state];

  const aprobada = result?.asegurado === true;
  const rechazada = result?.asegurado === false;

  const tabBtn = (key, label) =>
    `flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
      tab === key ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
    }`;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 font-sans antialiased">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap');
        .font-sans { font-family: 'Inter', system-ui, sans-serif; }
        .font-mono { font-family: 'IBM Plex Mono', monospace; }
      `}</style>

      <div className="max-w-5xl mx-auto px-5 py-8 sm:py-12">
        {/* Boundary */}
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-300 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
          <span className="font-mono">⚠ Banco de pruebas</span>
          <span className="text-blue-500">Proveedor externo · fuera del boundary del SPA</span>
        </div>

        <header className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-blue-900">
              Aseguradora ProSalud
            </h1>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-500">
              Simulador del validador externo de cobertura de pólizas. Sirve para probar el
              contrato del Adaptador Aseguradora antes de integrarlo.
            </p>
          </div>

          <button
            onClick={checkHealth}
            className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:bg-slate-50"
          >
            <span className={`h-2.5 w-2.5 rounded-full ${healthMeta.dot}`} />
            <div className="text-left">
              <div className="text-sm font-semibold leading-none text-slate-700">{healthMeta.text}</div>
              <div className="mt-1 font-mono text-[11px] text-slate-400">
                GET /health
                {lastChecked && health.state !== "checking" &&
                  ` · ${lastChecked.toLocaleTimeString()}`}
              </div>
            </div>
          </button>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          {/* ── Columna izquierda: formularios con pestañas ─────────────────── */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex gap-1 rounded-lg bg-slate-100 p-1">
              <button onClick={() => setTab("validar")} className={tabBtn("validar")}>
                Validar cobertura
              </button>
              <button onClick={() => setTab("registrar")} className={tabBtn("registrar")}>
                Registrar asegurado
              </button>
            </div>

            {tab === "validar" ? (
              <>
                <div className="mb-4 flex items-center justify-end">
                  <span className="font-mono text-[11px] text-slate-400">
                    GET /api/v1/asegurados/validar
                  </span>
                </div>

                <div className="space-y-4">
                  <label className="block">
                    <span className={labelCls}>Tipo de documento</span>
                    <select
                      value={tipo}
                      onChange={(e) => { setTipo(e.target.value); setDocumento(""); }}
                      className={inputCls}
                    >
                      {TIPOS.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className={labelCls}>Número de documento</span>
                    <input
                      value={documento}
                      onChange={(e) => setDocumento(sanearDocumento(e.target.value, tipo))}
                      onKeyDown={(e) => e.key === "Enter" && canSend && validar()}
                      placeholder={tipo === "DNI" ? "12345678" : "CE123456"}
                      maxLength={REGLAS_DOC[tipo].maxLength}
                      inputMode={REGLAS_DOC[tipo].soloDigitos ? "numeric" : "text"}
                      className={inputCls}
                    />
                    <span className="mt-1 block text-[11px] text-slate-400">
                      Formato {tipo}: {REGLAS_DOC[tipo].ayuda}.
                    </span>
                  </label>
                </div>

                <button
                  onClick={() => validar()}
                  disabled={!canSend}
                  className="mt-6 w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {loading ? "Validando…" : "Validar cobertura"}
                </button>

                <div className="mt-6 border-t border-slate-100 pt-4">
                  <p className="mb-2 text-xs font-medium text-slate-400">Datos de prueba</p>
                  <div className="flex flex-wrap gap-2">
                    {EJEMPLOS.map((e) => (
                      <button
                        key={`${e.tipo}-${e.doc}`}
                        onClick={() => usarEjemplo(e)}
                        title={e.hint}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-left text-xs transition hover:border-blue-300 hover:bg-blue-50"
                      >
                        <span className="font-mono font-medium text-slate-700">{e.tipo} {e.doc}</span>
                        <span className="block text-[10px] text-slate-400">{e.hint}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="mb-4 flex items-center justify-end">
                  <span className="font-mono text-[11px] text-slate-400">POST /api/v1/asegurados</span>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className={labelCls}>Nombre</span>
                      <input
                        value={reg.nombre}
                        onChange={(e) => updateReg("nombre", e.target.value)}
                        placeholder="Juan"
                        className={inputCls}
                      />
                    </label>
                    <label className="block">
                      <span className={labelCls}>Apellido</span>
                      <input
                        value={reg.apellido}
                        onChange={(e) => updateReg("apellido", e.target.value)}
                        placeholder="Pérez Ramos"
                        className={inputCls}
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className={labelCls}>Tipo de documento</span>
                      <select
                        value={reg.tipo}
                        onChange={(e) => updateRegTipo(e.target.value)}
                        className={inputCls}
                      >
                        {TIPOS.map((t) => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className={labelCls}>N° de documento</span>
                      <input
                        value={reg.documento}
                        onChange={(e) => updateReg("documento", sanearDocumento(e.target.value, reg.tipo))}
                        placeholder={reg.tipo === "DNI" ? "55667788" : "CE123456"}
                        maxLength={REGLAS_DOC[reg.tipo].maxLength}
                        inputMode={REGLAS_DOC[reg.tipo].soloDigitos ? "numeric" : "text"}
                        className={inputCls}
                      />
                      {reg.documento && !docRegOk ? (
                        <span className="mt-1 block text-[11px] text-rose-500">
                          {reg.tipo} inválido: debe ser {REGLAS_DOC[reg.tipo].ayuda}.
                        </span>
                      ) : (
                        <span className="mt-1 block text-[11px] text-slate-400">
                          Formato {reg.tipo}: {REGLAS_DOC[reg.tipo].ayuda}.
                        </span>
                      )}
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className={labelCls}>Cobertura (%)</span>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={reg.porcentaje}
                        onChange={(e) => updateReg("porcentaje", e.target.value)}
                        placeholder="75"
                        className={inputCls}
                      />
                    </label>
                    <label className="block">
                      <span className={labelCls}>
                        Plan <span className="font-normal text-slate-400">(opcional)</span>
                      </span>
                      <input
                        value={reg.plan}
                        onChange={(e) => updateReg("plan", e.target.value)}
                        placeholder="Plan Salud Plus"
                        className={inputCls}
                      />
                    </label>
                  </div>
                </div>

                <button
                  onClick={registrar}
                  disabled={!regValid || regLoading}
                  className="mt-6 w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {regLoading ? "Registrando…" : "Registrar asegurado"}
                </button>
                {!regValid && (
                  <p className="mt-2 text-center text-xs text-slate-400">
                    Nombre, apellido, documento válido y cobertura (0–100) son obligatorios.
                  </p>
                )}
                <p className="mt-4 border-t border-slate-100 pt-3 text-[11px] text-slate-400">
                  N° de póliza, fechas de vigencia (hoy → +1 año) y estado se generan
                  automáticamente si no se especifican.
                </p>
              </>
            )}
          </section>

          {/* ── Columna derecha: resultado según pestaña ───────────────────── */}
          <section className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-5 text-lg font-semibold text-slate-800">
              {tab === "validar" ? "Resultado de la póliza" : "Asegurado registrado"}
            </h2>

            {tab === "validar" ? (
              <>
                {!result && !reqError && (
                  <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 py-12 text-center">
                    <span className="font-mono text-3xl text-slate-300">🛡️</span>
                    <p className="mt-3 max-w-[15rem] text-sm text-slate-400">
                      Valida un documento para ver si su póliza está vigente y su porcentaje de cobertura.
                    </p>
                  </div>
                )}

                {reqError && (
                  <div className="flex-1 rounded-xl border border-rose-200 bg-rose-50 p-5">
                    <div className="flex items-center gap-2 text-rose-600">
                      <span className="h-2 w-2 rounded-full bg-rose-500" />
                      <span className="text-sm font-semibold">Error de conexión</span>
                    </div>
                    <p className="mt-2 text-sm text-rose-500">{reqError}</p>
                  </div>
                )}

                {aprobada && (
                  <div className="flex-1">
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
                      <div className="flex items-center gap-2.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                        <span className="text-base font-bold text-emerald-700">Póliza APROBADA</span>
                      </div>

                      <div className="mt-4 flex items-end gap-2">
                        <span className="text-5xl font-extrabold leading-none text-emerald-600">
                          {result.porcentajeCobertura}%
                        </span>
                        <span className="pb-1 text-sm text-emerald-700">de cobertura</span>
                      </div>

                      <dl className="mt-5 space-y-2.5 text-sm">
                        <div className="flex justify-between gap-4">
                          <dt className="text-slate-500">N° de póliza</dt>
                          <dd className="font-mono font-medium text-slate-700">{result.numeroPoliza}</dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className="text-slate-500">Plan</dt>
                          <dd className="font-medium text-slate-700">{result.plan}</dd>
                        </div>
                        {result.vigencia && (
                          <div className="flex justify-between gap-4">
                            <dt className="text-slate-500">Vigencia</dt>
                            <dd className="font-mono text-slate-700">
                              {result.vigencia.fechaInicio} → {result.vigencia.fechaFin}
                            </dd>
                          </div>
                        )}
                      </dl>
                    </div>
                  </div>
                )}

                {rechazada && (
                  <div className="flex-1">
                    <div className="rounded-xl border border-amber-300 bg-amber-50 p-5">
                      <div className="flex items-center gap-2.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                        <span className="text-base font-bold text-amber-700">Póliza RECHAZADA</span>
                      </div>
                      <p className="mt-3 text-sm text-amber-700">
                        El documento no tiene una póliza vigente (no existe, está vencida o suspendida).
                      </p>
                      <p className="mt-2 text-xs text-amber-600/70">
                        El proveedor responde <code className="font-mono">{`{ "asegurado": false }`}</code> sin
                        detallar el motivo exacto.
                      </p>
                    </div>
                  </div>
                )}

                {(result || reqError) && (
                  <>
                    {result && (
                      <details className="mt-4 group">
                        <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600">
                          Ver respuesta cruda
                        </summary>
                        <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900 p-3 font-mono text-[11px] text-slate-200">
{JSON.stringify(result, null, 2)}
                        </pre>
                      </details>
                    )}
                    <button
                      onClick={() => { setResult(null); setReqError(null); }}
                      className="mt-4 w-full rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-50"
                    >
                      Limpiar
                    </button>
                  </>
                )}
              </>
            ) : (
              <>
                {!regResult && !regError && (
                  <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 py-12 text-center">
                    <span className="font-mono text-3xl text-slate-300">➕</span>
                    <p className="mt-3 max-w-[16rem] text-sm text-slate-400">
                      Completa el formulario para dar de alta un nuevo asegurado con su porcentaje de cobertura.
                    </p>
                  </div>
                )}

                {regError && (
                  <div className="flex-1 rounded-xl border border-rose-200 bg-rose-50 p-5">
                    <div className="flex items-center gap-2 text-rose-600">
                      <span className="h-2 w-2 rounded-full bg-rose-500" />
                      <span className="text-sm font-semibold">No se pudo registrar</span>
                    </div>
                    <p className="mt-2 text-sm text-rose-500">{regError}</p>
                  </div>
                )}

                {regResult && (
                  <div className="flex-1">
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
                      <div className="flex items-center gap-2.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                        <span className="text-base font-bold text-emerald-700">Asegurado creado</span>
                      </div>

                      <p className="mt-3 text-lg font-semibold text-slate-800">
                        {regResult.nombre} {regResult.apellido}
                      </p>
                      <p className="font-mono text-xs text-slate-500">
                        {regResult.tipoDocumento} {regResult.numeroDocumento}
                      </p>

                      <dl className="mt-4 space-y-2.5 border-t border-emerald-200/60 pt-4 text-sm">
                        <div className="flex justify-between gap-4">
                          <dt className="text-slate-500">Cobertura</dt>
                          <dd className="font-semibold text-emerald-700">
                            {regResult.poliza.porcentajeCobertura}%
                          </dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className="text-slate-500">N° de póliza</dt>
                          <dd className="font-mono font-medium text-slate-700">{regResult.poliza.numeroPoliza}</dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className="text-slate-500">Plan</dt>
                          <dd className="font-medium text-slate-700">{regResult.poliza.plan}</dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className="text-slate-500">Vigencia</dt>
                          <dd className="font-mono text-slate-700">
                            {regResult.poliza.vigencia.fechaInicio} → {regResult.poliza.vigencia.fechaFin}
                          </dd>
                        </div>
                      </dl>
                    </div>

                    <button
                      onClick={validarRegistrado}
                      className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
                    >
                      Validar este documento →
                    </button>
                    <button
                      onClick={() => { setRegResult(null); setRegError(null); }}
                      className="mt-2 w-full rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-50"
                    >
                      Registrar otro
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        </div>

        <footer className="mt-8 text-center text-xs text-slate-400">
          Este simulador toca el proveedor directamente solo por ser un banco de pruebas. En
          producción, únicamente el Adaptador Aseguradora debe invocarlo.
        </footer>
      </div>
    </div>
  );
}
