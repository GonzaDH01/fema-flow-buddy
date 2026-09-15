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
};

const EQUIPOS_BASE = ["FORD 700", "CHEVROLET 660", "CARRO FONTANINI", "MB BATEA"];
const v = (x: unknown) => (x === null || x === undefined || x === "" || x === 0 ? "" : String(x));

const fechaLarga = (f?: string | null) => {
  if (!f) return "";
  const [a, m, d] = f.split("-");
  return `${d}/${m}/${a}`;
};

export function planillaHTML(p: PlanillaImpresion | null, cantContratistas = 5, cantBolsas = 7) {
  const bolsas = Array.from({ length: cantBolsas }, (_, i) => v(p?.bolsas?.[i]));
  const propios = EQUIPOS_BASE.map((n) => ({ equipo_nombre: n, chofer: "", dominio: "", viajes: "", metros_bolsa: "" }));
  const contratistas = Array.from({ length: cantContratistas }, () => ({
    equipo_nombre: "", chofer: "", dominio: "", viajes: "", metros_bolsa: "",
  }));

  const filaEquipo = (e: { equipo_nombre: string; chofer: string; dominio: string; viajes: string; metros_bolsa: string }, fijo: boolean) => `
    <tr>
      <td class="eq">${fijo ? e.equipo_nombre : `<span class="linea"></span>`}</td>
      <td>Chofer: <span class="linea"></span></td>
      <td>Dominio: <span class="linea"></span></td>
      <td class="num">${e.viajes}</td>
      <td class="num">${e.metros_bolsa}</td>
    </tr>`;

  return `<!doctype html><html lang="es"><head><meta charset="utf-8" />
<title>Planilla Bolsero</title>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #10233f; font-size: 11px; margin: 0; }
  h1 { font-size: 17px; margin: 0; letter-spacing: .5px; }
  h2 { font-size: 12px; margin: 2px 0 8px; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; }
  td, th { border: 1px solid #10233f; padding: 4px 6px; }
  .cab td { border: none; padding: 2px 0; }
  .band { background: #10233f; color: #fff; font-weight: 700; text-transform: uppercase; letter-spacing: .4px; }
  .sub { background: #dbe5f1; font-weight: 700; }
  .linea { display: inline-block; border-bottom: 1px dotted #10233f; min-width: 120px; height: 11px; }
  .val { font-weight: 700; }
  .num { text-align: center; width: 70px; }
  .eq { font-weight: 700; width: 150px; }
  .box { height: 26px; }
  .firma { margin-top: 26px; text-align: right; }
  .firma span { display: inline-block; border-top: 1px solid #10233f; padding-top: 4px; min-width: 240px; text-align: center; }
  .nota { margin-top: 8px; font-size: 9px; }
</style></head><body>
  <div style="display:flex;justify-content:space-between;align-items:flex-start">
    <div>
      <h1>FEMA AGRONEGOCIOS S.A.S.</h1>
      <h2>PLANILLA DIARIA DE PICADO Y EMBOLSADO</h2>
    </div>
    <div><strong>FECHA TRABAJO:</strong> <span class="val">${fechaLarga(p?.fecha) || "___ / ___ / ______"}</span></div>
  </div>

  <table style="margin-bottom:8px"><tr><td>
    <table class="cab">
      <tr>
        <td style="width:34%">CLIENTE: <span class="linea val">${v(p?.cliente_nombre)}</span></td>
        <td style="width:33%">ESTABLECIMIENTO: <span class="linea val">${v(p?.establecimiento)}</span></td>
        <td style="width:33%">BOLSERO INTERV.: <span class="linea val">${v(p?.bolsero_nombre)}</span></td>
      </tr>
      <tr>
        <td>LOTE: <span class="linea val">${v(p?.lote)}</span></td>
        <td>ZONA / LOC.: <span class="linea val">${v(p?.zona)}</span></td>
        <td>CULTIVO: <span class="linea val">${v(p?.cultivo)}</span></td>
      </tr>
    </table>
  </td></tr></table>

  <table style="margin-bottom:8px">
    <tr><td class="band" colspan="${cantBolsas}">1. Registro de bolsas realizadas en el día (mts. por bolsa)</td>
        <td class="band num">Total metros día</td></tr>
    <tr class="sub">${bolsas.map((_, i) => `<td class="num">Bolsa ${i + 1}</td>`).join("")}<td class="num"></td></tr>
    <tr>${bolsas.map((b) => `<td class="num box">${b}</td>`).join("")}
        <td class="num box val">${v(p?.total_metros)}</td></tr>
  </table>

  <table>
    <tr><td class="band" colspan="5">2. Registro de viajes por carro / transportista</td></tr>
    <tr class="sub"><td>Equipo / Vehículo</td><td>Chofer</td><td>Dominio</td><td class="num">Total viajes</td><td class="num">Mts. bolsa</td></tr>
    <tr><td class="sub" colspan="5">Equipos propios de la empresa</td></tr>
    ${propios.map((e) => filaEquipo(e, true)).join("")}
    <tr><td class="sub" colspan="5">Contratistas / Terceros</td></tr>
    ${contratistas.map((e) => filaEquipo(e, false)).join("")}
    <tr><td colspan="3" style="text-align:right;font-weight:700">TOTALES</td>
        <td class="num val">${v(p?.total_viajes)}</td><td class="num val">${v(p?.total_metros)}</td></tr>
  </table>

  <div class="nota">Observaciones: <span class="linea val" style="min-width:420px">${v(p?.observaciones)}</span></div>
  <div class="nota">Modo de llenado: 1. Escriba los metros por bolsa en las casillas correspondientes. 2. Anote la cantidad de viajes de cada equipo y el total de metros.</div>
  <div class="firma"><span>Firma Bolsero / Operador Responsable</span></div>
</body></html>`;
}

export function imprimirPlanilla(p: PlanillaImpresion | null) {
  const w = window.open("", "_blank", "width=1100,height=800");
  if (!w) return false;
  w.document.write(planillaHTML(p));
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 300);
  return true;
}
