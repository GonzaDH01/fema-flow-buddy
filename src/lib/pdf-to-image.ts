// Renderiza la primera página de un PDF a PNG base64 usando pdf.js (cliente).
export async function pdfFirstPageToPng(file: File, scale = 2): Promise<{ base64: string; mimeType: string }> {
  const pdfjs = await import("pdfjs-dist");
  const workerMod = (await import(
    /* @vite-ignore */ "pdfjs-dist/build/pdf.worker.min.mjs?url"
  )) as { default: string };
  pdfjs.GlobalWorkerOptions.workerSrc = workerMod.default;

  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo crear el contexto de canvas");

  await page.render({ canvas, canvasContext: ctx, viewport } as Parameters<typeof page.render>[0]).promise;

  const dataUrl = canvas.toDataURL("image/png");
  const base64 = dataUrl.split(",")[1] ?? "";
  return { base64, mimeType: "image/png" };
}