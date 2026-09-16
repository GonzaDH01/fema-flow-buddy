export type EquipoImpresion = {
  equipo_nombre: string;
  chofer?: string | null;
  dominio?: string | null;
  viajes?: number | string | null;
  metros_bolsa?: number | string | null;
  es_tercero: boolean;
};

export type PlanillaImpresion = {
  fecha?: string | null;
  cliente_nombre?: string | null;
  establecimiento?: string | null;
  lote?: string | null;
  zona?: string | null;
  cultivo?: string | null;
  bolsero_nombre?: string | null;
  observaciones?: string | null;
  bolsas?: (number | string | null)[] | null;
  total_viajes?: number | null;
  total_metros?: number | null;
  equipos?: EquipoImpresion[] | null;
};

const EQUIPOS_BASE = ["FORD 700", "CHEVROLET 600", "CARRO FONTANINI"];
const CONTEO = 30;
const v = (x: unknown) => (x === null || x === undefined || x === "" || x === 0 ? "" : String(x));

const fechaPartes = (f?: string | null) => {
  if (!f) return ["", "", ""];
  const [a, m, d] = f.split("-");
  return [d ?? "", m ?? "", a ?? ""];
};

/** 30 casillas en 6 grupos de 5; se marcan con X las primeras `viajes`. */
const conteoHTML = (viajes: number) => {
  let html = "";
  for (let g = 0; g < 6; g++) {
    html += `<span class="grp">`;
    for (let i = 0; i < 5; i++) {
      const n = g * 5 + i + 1;
      html += `<span class="tick">${n <= viajes ? "X" : ""}</span>`;
    }
    html += `</span>`;
  }
  return html;
};

const filaEquipo = (
  nombre: string,
  chofer: string,
  dominio: string,
  viajes: number | string,
  fijo: boolean,
  idx?: number,
) => `
  <tr>
    <td class="eq">${fijo ? (nombre || "&nbsp;") : `${idx}. <span class="linea">${nombre}</span>`}</td>
    <td class="ch">Chofer: <span class="linea">${chofer}</span>${dominio ? `<br/><span class="dom">Dom.: ${dominio}</span>` : ""}</td>
    <td class="conteo">${conteoHTML(Number(viajes) || 0)}</td>
    <td class="tot"><span class="cajaTot">${v(viajes)}</span></td>
  </tr>`;

export function planillaHTML(p: PlanillaImpresion | null, cantContratistas = 4, cantBolsas = 7) {
  const bolsas = Array.from({ length: cantBolsas }, (_, i) => v(p?.bolsas?.[i]));
  const [dd, mm, aa] = fechaPartes(p?.fecha);

  const cargados = p?.equipos ?? [];
  const propiosCargados = cargados.filter((e) => !e.es_tercero);
  const tercerosCargados = cargados.filter((e) => e.es_tercero);

  const propios = propiosCargados.length
    ? propiosCargados
    : EQUIPOS_BASE.map((n) => ({ equipo_nombre: n, chofer: "", dominio: "", viajes: "", es_tercero: false }));

  const terceros = [...tercerosCargados];
  while (terceros.length < cantContratistas) {
    terceros.push({ equipo_nombre: "", chofer: "", dominio: "", viajes: "", es_tercero: true });
  }

  const totalMetros = v(p?.total_metros);
  const totMet = [totalMetros.slice(0, -2), totalMetros.slice(-2, -1), totalMetros.slice(-1)];

  return `<!doctype html><html lang="es"><head><meta charset="utf-8" />
<title>Planilla Bolsero</title>
<style>
  @page { size: A4 landscape; margin: 8mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #10233f; font-size: 10px; margin: 0; }
  h1 { font-size: 19px; margin: 0; letter-spacing: .2px; }
  h2 { font-size: 11px; margin: 1px 0 0; font-weight: 700; letter-spacing: .2px; }
  .ver { font-size: 7.5px; color: #3b6098; text-align: right; }
  table { width: 100%; border-collapse: collapse; }
  td, th { border: 1px solid #10233f; padding: 3px 5px; vertical-align: middle; }
  .cab td { border: none; padding: 3px 4px; font-weight: 700; font-size: 9.5px; }
  .marco { border: 1.4px solid #10233f; margin-bottom: 6px; }
  .band td { background: #10233f; color: #fff; font-weight: 700; text-transform: uppercase;
             letter-spacing: .3px; font-size: 9.5px; padding: 3px 6px; }
  .sub td { background: #c9d8ec; font-weight: 700; text-transform: uppercase; font-size: 9px; }
  .head td { background: #dfe8f4; font-weight: 700; text-transform: uppercase; font-size: 9px; text-align: center; }
  .linea { display: inline-block; border-bottom: 1px dotted #10233f; min-width: 95px; font-weight: 700; }
  .lg { min-width: 150px; }
  .caja { display: inline-block; width: 15px; height: 17px; border: 1px solid #10233f; margin-right: 2px;
          text-align: center; font-weight: 700; line-height: 17px; vertical-align: middle; }
  .cajaTot { display: inline-block; width: 30px; height: 19px; border: 1.2px solid #10233f;
             text-align: center; font-weight: 700; line-height: 19px; }
  .bolsa td { text-align: center; }
  .grp { display: inline-block; margin-right: 7px; }
  .tick { display: inline-block; width: 11px; height: 12px; border: 1px solid #10233f; margin-right: 1.5px;
          font-size: 8px; line-height: 12px; text-align: center; font-weight: 700; }
  .eq { font-weight: 700; width: 145px; font-size: 9.5px; }
  .ch { width: 185px; font-size: 9px; }
  .dom { font-size: 8px; }
  .conteo { text-align: center; }
  .tot { text-align: center; width: 62px; }
  .pie { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 8px; }
  .nota { font-size: 7.5px; line-height: 1.5; }
  .firma { text-align: center; }
  .firma span { display: inline-block; border-top: 1px solid #10233f; padding-top: 3px;
                min-width: 250px; font-weight: 700; font-size: 9px; }
</style></head><body>
  <div class="ver">[REGISTRO DIARIO / OCR - V8]</div>
  <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:5px">
    <div>
      <h1>FEMA AGRONEGOCIOS S.A.S.</h1>
      <h2>PLANILLA DIARIA DE PICADO Y EMBOLSADO</h2>
    </div>
    <div style="font-weight:700;font-size:10px">
      FECHA TRABAJO: <span class="linea" style="min-width:34px;text-align:center">${dd}</span> /
      <span class="linea" style="min-width:34px;text-align:center">${mm}</span> /
      <span class="linea" style="min-width:46px;text-align:center">${aa}</span>
    </div>
  </div>

  <div class="marco">
    <table class="cab">
      <tr>
        <td style="width:36%">CLIENTE: <span class="linea lg">${v(p?.cliente_nombre)}</span></td>
        <td style="width:34%">ESTABLECIMIENTO: <span class="linea">${v(p?.establecimiento)}</span></td>
        <td style="width:30%">BOLSERO INTERV.: <span class="linea">${v(p?.bolsero_nombre)}</span></td>
      </tr>
      <tr>
        <td>LOTE: <span class="linea lg">${v(p?.lote)}</span></td>
        <td>ZONA / LOC.: <span class="linea">${v(p?.zona)}</span></td>
        <td>CULTIVO: <span class="linea">${v(p?.cultivo)}</span></td>
      </tr>
    </table>
  </div>

  <table style="margin-bottom:6px">
    <tr class="band">
      <td colspan="${cantBolsas}">1. Registro de bolsas realizadas en el día (mts. por bolsa)</td>
      <td style="width:130px;text-align:center">Total metros día</td>
    </tr>
    <tr class="head">
      ${bolsas.map((_, i) => `<td>Bolsa ${i + 1}</td>`).join("")}
      <td rowspan="2" style="background:#fff">
        <span class="caja">${totMet[0]}</span><span class="caja">${totMet[1]}</span><span class="caja">${totMet[2]}</span> m
      </td>
    </tr>
    <tr class="bolsa">
      ${bolsas
        .map((b) => {
          const s = String(b);
          return `<td><span class="caja">${s.slice(0, -1) || ""}</span><span class="caja">${s.slice(-1) || ""}</span> m</td>`;
        })
        .join("")}
    </tr>
  </table>

  <table>
    <tr class="band"><td colspan="4">2. Registro de viajes por carro / transportista</td></tr>
    <tr class="head">
      <td>Equipo / Vehículo</td>
      <td>Chofer / Dominio</td>
      <td>Conteo de viajes (marcar "X" - hasta ${CONTEO} viajes)</td>
      <td>Total viajes</td>
    </tr>
    <tr class="sub"><td colspan="4">Equipos propios de la empresa</td></tr>
    ${propios
      .map((e) => filaEquipo(e.equipo_nombre, v(e.chofer), v(e.dominio), v(e.viajes), true))
      .join("")}
    <tr class="sub"><td colspan="4">Contratistas / Terceros</td></tr>
    ${terceros
      .map((e, i) => filaEquipo(e.equipo_nombre, v(e.chofer), v(e.dominio), v(e.viajes), false, i + 1))
      .join("")}
  </table>

  <div class="pie">
    <div class="nota">
      <strong>Modo de Llenado:</strong><br/>
      1. Escriba los metros por bolsa en sus casillas correspondientes.<br/>
      2. Marque con una "X" cada recuadro por viaje realizado (hasta ${CONTEO}) y anote el número final en la casilla correspondiente.
      ${p?.observaciones ? `<br/><strong>Observaciones:</strong> ${v(p.observaciones)}` : ""}
    </div>
    <div class="firma"><span>Firma Bolsero / Operador Responsable</span></div>
  </div>
</body></html>`;
}

/** Imprime en un iframe oculto: evita que el navegador se cuelgue al guardar como PDF. */
export function imprimirPlanilla(p: PlanillaImpresion | null) {
  if (typeof document === "undefined") return false;
  const html = planillaHTML(p);

  const prev = document.getElementById("fema-print-frame");
  if (prev) prev.remove();

  const iframe = document.createElement("iframe");
  iframe.id = "fema-print-frame";
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.visibility = "hidden";

  iframe.onload = () => {
    const win = iframe.contentWindow;
    if (!win) return;
    const limpiar = () => setTimeout(() => iframe.remove(), 1000);
    win.addEventListener("afterprint", limpiar);
    setTimeout(() => {
      try {
        win.focus();
        win.print();
      } catch {
        /* noop */
      }
      // Respaldo por si el navegador no dispara afterprint (Firefox al guardar como PDF)
      setTimeout(limpiar, 60000);
    }, 250);
  };

  document.body.appendChild(iframe);
  iframe.srcdoc = html;
  return true;
}
