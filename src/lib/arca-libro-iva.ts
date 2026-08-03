// Generador de archivos del Libro de IVA Digital (ARCA, ex AFIP) — RG 4597/2019.
// Formatos de importación de "Portal IVA / Libro de IVA Digital":
//   REGINFO_CV_VENTAS_CBTE.txt      (266 posiciones)
//   REGINFO_CV_VENTAS_ALICUOTAS.txt (62 posiciones)
//   REGINFO_CV_COMPRAS_CBTE.txt     (325 posiciones)
//   REGINFO_CV_COMPRAS_ALICUOTAS.txt(86 posiciones)

export type LibroRow = Record<string, any>;

const pad = (v: string, n: number) => (v ?? "").toString().slice(0, n).padEnd(n, " ");
const num = (v: any, n: number, dec = 2) => {
  const x = Math.abs(Math.round(Number(v || 0) * 10 ** dec));
  return String(x).slice(-n).padStart(n, "0");
};
const zeros = (v: any, n: number) => String(Math.abs(Math.trunc(Number(v || 0)))).slice(-n).padStart(n, "0");

export const fechaAAAAMMDD = (f: string | null | undefined) => {
  if (!f) return "00000000";
  const d = String(f).slice(0, 10).split("-");
  return d.length === 3 ? `${d[0]}${d[1]}${d[2]}` : "00000000";
};

// Códigos de comprobante ARCA (tabla oficial)
export const codigoComprobante = (tipo?: string | null, tipoComprobante?: string | null) => {
  const t = (tipoComprobante || "").toLowerCase();
  const letra = (tipo || "A").toUpperCase();
  const nc = t.includes("credito") || t.includes("crédito");
  const nd = t.includes("debito") || t.includes("débito");
  const rec = t.includes("recibo");
  const map: Record<string, { fac: string; nd: string; nc: string; rec: string }> = {
    A: { fac: "001", nd: "002", nc: "003", rec: "004" },
    B: { fac: "006", nd: "007", nc: "008", rec: "009" },
    C: { fac: "011", nd: "012", nc: "013", rec: "015" },
    E: { fac: "019", nd: "020", nc: "021", rec: "019" },
    M: { fac: "051", nd: "052", nc: "053", rec: "054" },
  };
  const m = map[letra] ?? map.A;
  if (nc) return m.nc;
  if (nd) return m.nd;
  if (rec) return m.rec;
  return m.fac;
};

// "0001-00000123", "A 0001-00012345", "00012345"
export const partirNumero = (numero?: string | null) => {
  const limpio = (numero || "").replace(/[^0-9-]/g, "");
  const partes = limpio.split("-").filter(Boolean);
  if (partes.length >= 2) return { pv: partes[partes.length - 2], nro: partes[partes.length - 1] };
  return { pv: "0", nro: partes[0] ?? "0" };
};

export const codigoAlicuota = (alic: number) => {
  const t: Record<string, string> = { "0": "0003", "2.5": "0009", "5": "0008", "10.5": "0004", "21": "0005", "27": "0006" };
  return t[String(alic)] ?? "0005";
};

const docReceptor = (cuit?: string | null) => {
  const c = (cuit || "").replace(/\D/g, "");
  return c.length === 11 ? { cod: "80", nro: c.padStart(20, "0") } : { cod: "99", nro: "".padStart(20, "0") };
};

const alicuotasDe = (f: LibroRow) => {
  const out: { alic: number; neto: number; iva: number }[] = [];
  const i21 = Number(f.iva_21 || 0);
  const i105 = Number(f.iva_105 || 0);
  if (i21 > 0) out.push({ alic: 21, neto: i21 / 0.21, iva: i21 });
  if (i105 > 0) out.push({ alic: 10.5, neto: i105 / 0.105, iva: i105 });
  if (out.length === 0) {
    const neto = Number(f.neto || 0);
    if (neto > 0) out.push({ alic: 0, neto, iva: 0 });
  }
  return out;
};

const netoGravado = (f: LibroRow) => alicuotasDe(f).reduce((a, x) => a + (x.iva > 0 ? x.neto : 0), 0);
const exento = (f: LibroRow) => {
  const alics = alicuotasDe(f);
  const conIva = alics.some((a) => a.iva > 0);
  return conIva ? 0 : Number(f.neto || 0);
};

export function ventasCbte(facturas: LibroRow[], nombreCliente: (id: any) => string, cuitCliente: (id: any) => string) {
  return facturas.map((f) => {
    const { pv, nro } = partirNumero(f.numero);
    const doc = docReceptor(cuitCliente(f.cliente_id));
    const alics = alicuotasDe(f).filter((a) => a.iva > 0);
    return [
      fechaAAAAMMDD(f.fecha),
      codigoComprobante(f.tipo, f.tipo_comprobante),
      zeros(pv, 5),
      zeros(nro, 20),
      zeros(nro, 20),
      doc.cod,
      doc.nro,
      pad(nombreCliente(f.cliente_id), 30),
      num(f.total, 15),
      num(0, 15),
      num(0, 15),
      num(exento(f), 15),
      num(0, 15),
      num(f.percepciones, 15),
      num(0, 15),
      num(0, 15),
      "PES",
      "0001000000",
      String(Math.min(9, Math.max(alics.length, alics.length === 0 ? 0 : 1))),
      alics.length === 0 ? "E" : " ",
      num(0, 15),
      fechaAAAAMMDD(f.fecha_cobro || f.fecha),
    ].join("");
  });
}

export function ventasAlicuotas(facturas: LibroRow[]) {
  const out: string[] = [];
  for (const f of facturas) {
    const { pv, nro } = partirNumero(f.numero);
    for (const a of alicuotasDe(f).filter((x) => x.iva > 0)) {
      out.push([
        codigoComprobante(f.tipo, f.tipo_comprobante),
        zeros(pv, 5),
        zeros(nro, 20),
        num(a.neto, 15),
        codigoAlicuota(a.alic),
        num(a.iva, 15),
      ].join(""));
    }
  }
  return out;
}

export function comprasCbte(facturas: LibroRow[], nombreProv: (id: any) => string, cuitProv: (id: any) => string) {
  return facturas.map((f) => {
    const { pv, nro } = partirNumero(f.numero);
    const doc = docReceptor(cuitProv(f.proveedor_id));
    const alics = alicuotasDe(f).filter((a) => a.iva > 0);
    const creditoFiscal = alics.reduce((a, x) => a + x.iva, 0);
    return [
      fechaAAAAMMDD(f.fecha),
      codigoComprobante(f.tipo, f.tipo_comprobante),
      zeros(pv, 5),
      zeros(nro, 20),
      pad("", 16),
      doc.cod,
      doc.nro,
      pad(nombreProv(f.proveedor_id), 30),
      num(f.total, 15),
      num(0, 15),
      num(exento(f), 15),
      num(f.percepciones, 15),
      num(f.otros_impuestos, 15),
      num(0, 15),
      num(0, 15),
      num(f.impuestos_internos, 15),
      "PES",
      "0001000000",
      String(Math.min(9, alics.length)),
      alics.length === 0 ? "E" : " ",
      num(creditoFiscal, 15),
      num(0, 15),
      "".padStart(11, "0"),
      pad("", 30),
      num(0, 15),
    ].join("");
  });
}

export function comprasAlicuotas(facturas: LibroRow[], cuitProv: (id: any) => string) {
  const out: string[] = [];
  for (const f of facturas) {
    const { pv, nro } = partirNumero(f.numero);
    const doc = docReceptor(cuitProv(f.proveedor_id));
    for (const a of alicuotasDe(f).filter((x) => x.iva > 0)) {
      out.push([
        codigoComprobante(f.tipo, f.tipo_comprobante),
        zeros(pv, 5),
        zeros(nro, 20),
        doc.cod,
        doc.nro,
        num(a.neto, 15),
        codigoAlicuota(a.alic),
        num(a.iva, 15),
      ].join(""));
    }
  }
  return out;
}

export const descargarTxt = (nombre: string, lineas: string[]) => {
  const blob = new Blob([lineas.join("\r\n") + (lineas.length ? "\r\n" : "")], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
};

// Validaciones previas exigidas por ARCA para que el libro sea aceptado
export type ValidacionArca = { ok: boolean; titulo: string; detalle: string; norma: string };
export function validarLibro(ventas: LibroRow[], compras: LibroRow[], cuitCliente: (id: any) => string, cuitProv: (id: any) => string): ValidacionArca[] {
  const v: ValidacionArca[] = [];
  const sinNumV = ventas.filter((f) => !partirNumero(f.numero).nro || partirNumero(f.numero).nro === "0").length;
  const sinNumC = compras.filter((f) => !partirNumero(f.numero).nro || partirNumero(f.numero).nro === "0").length;
  v.push({ ok: sinNumV + sinNumC === 0, titulo: "Punto de venta y número de comprobante", norma: "RG 4597 — campos 3 y 4", detalle: sinNumV + sinNumC === 0 ? "Todos los comprobantes tienen numeración válida" : `${sinNumV + sinNumC} comprobante(s) sin punto de venta / número` });
  const cuitMalV = ventas.filter((f) => (cuitCliente(f.cliente_id) || "").replace(/\D/g, "").length !== 11).length;
  v.push({ ok: cuitMalV === 0, titulo: "CUIT de receptores (ventas)", norma: "RG 4597 — código doc 80", detalle: cuitMalV === 0 ? "Todos los clientes con CUIT de 11 dígitos" : `${cuitMalV} venta(s) sin CUIT válido (se informan como 'sin identificar')` });
  const cuitMalC = compras.filter((f) => (cuitProv(f.proveedor_id) || "").replace(/\D/g, "").length !== 11).length;
  v.push({ ok: cuitMalC === 0, titulo: "CUIT de emisores (compras)", norma: "RG 4597 — código doc 80", detalle: cuitMalC === 0 ? "Todos los proveedores con CUIT de 11 dígitos" : `${cuitMalC} compra(s) sin CUIT válido — el crédito fiscal puede ser impugnado` });
  const descuadre = [...ventas, ...compras].filter((f) => {
    const suma = netoGravado(f) + exento(f) + Number(f.iva_21 || 0) + Number(f.iva_105 || 0) + Number(f.percepciones || 0) + Number(f.impuestos_internos || 0) + Number(f.otros_impuestos || 0);
    return Math.abs(suma - Number(f.total || 0)) > Math.max(1, Number(f.total || 0) * 0.01);
  }).length;
  v.push({ ok: descuadre === 0, titulo: "Cuadre neto + IVA + tributos = total", norma: "RG 4597 — control de importes", detalle: descuadre === 0 ? "Todos los comprobantes cuadran" : `${descuadre} comprobante(s) con diferencia mayor al 1% entre el total y el desglose` });
  const tipoMal = [...ventas, ...compras].filter((f) => !["A", "B", "C", "E", "M"].includes(String(f.tipo || "").toUpperCase())).length;
  v.push({ ok: tipoMal === 0, titulo: "Tipo de comprobante codificable", norma: "Tabla de comprobantes ARCA", detalle: tipoMal === 0 ? "Todos los comprobantes tienen letra válida (A/B/C/E/M)" : `${tipoMal} comprobante(s) sin letra fiscal` });
  return v;
}
