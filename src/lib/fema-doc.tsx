import logoUrl from "@/assets/fema-logo.jpg";
import watermarkUrl from "@/assets/fema-watermark.jpg";

export const FEMA_INFO = {
  razon: "FEMA AGRONEGOCIOS S. A. S.",
  domicilio: "Belgrano 135 - San Guillermo - CP 2347",
  telefono: "0356 252-5255",
  email: "femaagronegocios@gmail.com",
  cond: "RESPONSABLE INSCRIPTO",
};

export { logoUrl as femaLogoUrl, watermarkUrl as femaWatermarkUrl };

export function absoluteAssetUrl(url: string) {
  if (typeof window === "undefined") return url;
  try { return new URL(url, window.location.origin).href; } catch { return url; }
}

type MetaLine = { label: string; value: string };

export function FemaDocHeader({ title, meta }: { title: string; meta: MetaLine[] }) {
  return (
    <div className="grid grid-cols-[1.4fr_auto_1fr] items-stretch border-2 border-black bg-white">
      <div className="p-3 flex flex-col">
        <img src={logoUrl} alt="FEMA Agronegocios" className="h-12 w-auto object-contain self-start" />
        <div className="font-bold text-[12px] mt-2">{FEMA_INFO.razon}</div>
        <div className="text-[10px] leading-tight mt-0.5">
          {FEMA_INFO.domicilio}<br />
          Teléfono: {FEMA_INFO.telefono}<br />
          <u>Email: {FEMA_INFO.email}</u>
        </div>
        <div className="font-bold text-[10px] mt-1">{FEMA_INFO.cond}</div>
      </div>
      <div className="border-l-2 border-r-2 border-black flex items-center justify-center px-4 text-2xl font-bold">X</div>
      <div className="p-3 flex flex-col">
        <div className="text-xl font-bold italic text-right tracking-wide">{title}</div>
        <div className="mt-3 space-y-1 text-[11px]">
          {meta.map((m, i) => (
            <div key={i} className="grid grid-cols-[90px_1fr] gap-2">
              <span className="font-bold">{m.label}</span>
              <span className="font-bold">{m.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function FemaClientBox({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <div className="border-2 border-t-0 border-black px-3 py-2 grid grid-cols-2 gap-x-6 gap-y-1 text-[10.5px] bg-white">
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[100px_1fr] gap-2">
          <span className="font-bold">{r.label}</span>
          <span>{r.value || "—"}</span>
        </div>
      ))}
    </div>
  );
}

export function FemaWatermark() {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-0" aria-hidden>
      <img src={watermarkUrl} alt="" className="w-[55%] max-w-[380px]" style={{ opacity: 0.15 }} />
    </div>
  );
}

export const femaPrintCSS = `
  @page { size: A4 portrait; margin: 12mm; }
  body { font-family: Arial, Helvetica, sans-serif; color: #000; margin: 0; font-size: 11px; }
  .fema-page { position: relative; min-height: 273mm; display: flex; flex-direction: column; }
  .fema-watermark { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; opacity: 0.15; z-index: 0; pointer-events: none; }
  .fema-watermark img { width: 55%; max-width: 380px; }
  .fema-content { position: relative; z-index: 1; display: flex; flex-direction: column; flex: 1 1 auto; min-height: 273mm; }
  .fema-spacer { flex: 1 1 auto; }
  .fema-hdr { display: grid; grid-template-columns: 1.4fr auto 1fr; border: 2px solid #000; background: #fff; }
  .fema-hdr .l { padding: 8px; }
  .fema-hdr .l img { height: 50px; display: block; }
  .fema-hdr .l .razon { font-weight: bold; margin-top: 4px; font-size: 12px; }
  .fema-hdr .l .info { font-size: 10px; line-height: 1.35; margin-top: 2px; }
  .fema-hdr .l .cond { font-weight: bold; font-size: 10px; margin-top: 4px; }
  .fema-hdr .x { border-left: 2px solid #000; border-right: 2px solid #000; display: flex; align-items: center; justify-content: center; padding: 0 14px; font-weight: bold; font-size: 22px; }
  .fema-hdr .r { padding: 8px; }
  .fema-hdr .r .ttl { font-style: italic; font-weight: bold; font-size: 18px; text-align: right; letter-spacing: 0.04em; }
  .fema-hdr .r .meta { display: grid; grid-template-columns: 90px 1fr; gap: 4px 8px; margin-top: 10px; font-size: 11px; }
  .fema-hdr .r .meta b { font-weight: bold; }
  .fema-client { border: 2px solid #000; border-top: 0; padding: 6px 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; font-size: 10.5px; background: #fff; }
  .fema-client .row { display: grid; grid-template-columns: 100px 1fr; gap: 6px; }
  .fema-client b { font-weight: bold; }
  table.fema { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 10.5px; }
  table.fema thead th { border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 4px 6px; text-align: left; background: #fff; font-weight: bold; }
  table.fema thead th.right { text-align: right; }
  table.fema tbody td { padding: 3px 6px; border-bottom: 1px solid #ccc; }
  table.fema tbody td.right { text-align: right; }
  .fema-bottom { display: grid; grid-template-columns: 1fr 260px; gap: 12px; margin-top: 16px; }
  .fema-obs { border: 2px solid #000; padding: 8px 10px; font-size: 10.5px; min-height: 110px; background: #fff; }
  .fema-obs .t { font-style: italic; font-weight: bold; text-decoration: underline; margin-bottom: 4px; }
  .fema-tot { font-size: 10.5px; background: #fff; }
  .fema-tot .row { display: flex; justify-content: space-between; padding: 4px 8px; border-bottom: 1px solid #bbb; }
  .fema-tot .row.total { background: #fff; border-top: 1px solid #000; border-bottom: 0; font-weight: bold; font-size: 13px; padding-top: 6px; }
  .fema-sign { display: grid; grid-template-columns: 1fr 1fr; gap: 60px; margin-top: 60px; font-size: 10.5px; text-align: center; }
  .fema-sign div { border-top: 1px solid #000; padding-top: 4px; }
`;

export function femaHeaderHTML(title: string, meta: MetaLine[], logoAbsUrl: string) {
  return `<div class="fema-hdr">
    <div class="l">
      <img src="${logoAbsUrl}" alt="FEMA"/>
      <div class="razon">${FEMA_INFO.razon}</div>
      <div class="info">${FEMA_INFO.domicilio}<br>Teléfono: ${FEMA_INFO.telefono}<br><u>Email: ${FEMA_INFO.email}</u></div>
      <div class="cond">${FEMA_INFO.cond}</div>
    </div>
    <div class="x">X</div>
    <div class="r">
      <div class="ttl">${title}</div>
      <div class="meta">${meta.map(m => `<b>${m.label}</b><span><b>${m.value}</b></span>`).join("")}</div>
    </div>
  </div>`;
}

export function femaClientHTML(rows: { label: string; value: string }[]) {
  return `<div class="fema-client">${rows.map(r => `<div class="row"><b>${r.label}</b><span>${r.value || "—"}</span></div>`).join("")}</div>`;
}

export function femaWatermarkHTML(watermarkAbsUrl: string) {
  return `<div class="fema-watermark"><img src="${watermarkAbsUrl}" alt=""/></div>`;
}