/** Pièces jointes texte pour Accueil Agent (CSV, Excel, notes). */

export type AttachedChatDocument = {
  name: string;
  mimeType: string;
  text: string;
};

const MAX_BYTES = 2_000_000;
const MAX_CHARS = 80_000;
const DOC_EXT = /\.(txt|csv|tsv|md|markdown|json|log|xlsx|xls|pdf)$/i;
const EXCEL_EXT = /\.xlsx?$/i;
const PDF_EXT = /\.pdf$/i;
const PDF_MAX_BYTES = 8_000_000;
const PDF_MAX_PAGES = 30;

export function isExcelFile(file: File) {
  const name = file.name || "";
  const type = (file.type || "").toLowerCase();
  return (
    EXCEL_EXT.test(name) ||
    type.includes("spreadsheet") ||
    type.includes("ms-excel") ||
    type.includes("excel")
  );
}

export function isPdfFile(file: File) {
  const name = file.name || "";
  const type = (file.type || "").toLowerCase();
  return PDF_EXT.test(name) || type === "application/pdf";
}

export function isChatDocumentFile(file: File) {
  if (isExcelFile(file) || isPdfFile(file)) return true;
  const t = (file.type || "").toLowerCase();
  if (t.startsWith("text/")) return true;
  if (t === "application/json" || t === "text/csv") return true;
  return DOC_EXT.test(file.name || "");
}

async function excelToText(file: File): Promise<string> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), {
    type: "array",
    cellDates: true,
  });
  const parts: string[] = [];
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    if (!sheet) continue;
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false }).trim();
    if (!csv) continue;
    parts.push(`Feuille: ${name}\n${csv}`);
  }
  if (!parts.length) {
    throw new Error("Ce fichier Excel est vide.");
  }
  return parts.join("\n\n");
}

async function pdfToText(data: Uint8Array): Promise<{ text: string; pages: number }> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(data);
  const pages = pdf.numPages;
  const extracted = await extractText(pdf, { mergePages: false });
  const list = (Array.isArray(extracted.text) ? extracted.text : [extracted.text]).slice(
    0,
    PDF_MAX_PAGES,
  );
  const parts = list
    .map((page, i) => {
      const body = String(page || "")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      return body ? `Page ${i + 1}/${pages}\n${body}` : "";
    })
    .filter(Boolean);
  const note =
    pages > PDF_MAX_PAGES
      ? `\n\n[… ${pages - PDF_MAX_PAGES} pages suivantes non lues …]`
      : "";
  return { text: `${parts.join("\n\n")}${note}`.trim(), pages };
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Page PDF illisible."));
    img.src = url;
  });
}

async function stackPageImages(urls: string[]): Promise<string> {
  if (urls.length === 1) return urls[0]!;
  const images = await Promise.all(urls.map(loadImage));
  const width = Math.max(...images.map((img) => img.naturalWidth || 1));
  const height = images.reduce((sum, img) => sum + (img.naturalHeight || 1), 0);
  const scale = Math.min(1, 1200 / width, 3600 / height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return urls[0]!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  let y = 0;
  for (const img of images) {
    const w = (img.naturalWidth || 1) * scale;
    const h = (img.naturalHeight || 1) * scale;
    ctx.drawImage(img, 0, y, w, h);
    y += h;
  }
  return canvas.toDataURL("image/jpeg", 0.82);
}

async function pdfScanToImage(
  data: Uint8Array,
  pages: number,
): Promise<{ dataUrl: string; base64: string } | null> {
  if (typeof document === "undefined") return null;
  const { getDocumentProxy, renderPageAsImage } = await import("unpdf");
  const pdf = await getDocumentProxy(data);
  const count = Math.min(pages || 1, 3);
  const urls: string[] = [];
  for (let page = 1; page <= count; page++) {
    const url = await renderPageAsImage(pdf, page, {
      toDataURL: true,
      scale: 1.2,
    });
    if (typeof url === "string" && url.startsWith("data:")) urls.push(url);
  }
  if (!urls.length) return null;
  const dataUrl = await stackPageImages(urls);
  const comma = dataUrl.indexOf(",");
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : "";
  if (base64.length < 32) return null;
  return { dataUrl, base64 };
}

export type PdfAttachment = {
  document: AttachedChatDocument | null;
  pageImage: {
    name: string;
    mimeType: string;
    base64: string;
    dataUrl: string;
  } | null;
};

export async function fileToPdfAttachment(file: File): Promise<PdfAttachment> {
  if (file.size > PDF_MAX_BYTES) {
    throw new Error("PDF trop lourd (max 8 Mo).");
  }
  const data = new Uint8Array(await file.arrayBuffer());
  let text = "";
  let pages = 1;
  try {
    const read = await pdfToText(data);
    text = read.text;
    pages = read.pages;
  } catch {
    text = "";
  }

  const readable = text.replace(/\s/g, "").length >= 40;
  let pageImage: PdfAttachment["pageImage"] = null;
  if (!readable) {
    try {
      const scan = await pdfScanToImage(data, pages);
      if (scan) {
        const base = (file.name || "document").replace(/\.pdf$/i, "");
        pageImage = {
          name: `${base || "document"}-pages.jpg`,
          mimeType: "image/jpeg",
          base64: scan.base64,
          dataUrl: scan.dataUrl,
        };
      }
    } catch {
      pageImage = null;
    }
  }

  if (!text && !pageImage) {
    throw new Error(
      "Ce PDF n’a pas pu être lu. Réessaie, ou colle une photo des pages.",
    );
  }

  const name = file.name?.trim() || "document.pdf";
  return {
    document: text
      ? {
          name,
          mimeType: "application/pdf",
          text:
            text.length > MAX_CHARS
              ? `${text.slice(0, MAX_CHARS)}\n\n[… document tronqué pour Okapi …]`
              : text,
        }
      : pageImage
        ? {
            name,
            mimeType: "application/pdf",
            text: "PDF scanné : le texte n’est pas sélectionnable. Les pages sont jointes en image. Lis l’image.",
          }
        : null,
    pageImage,
  };
}

export async function fileToChatDocument(
  file: File,
): Promise<AttachedChatDocument> {
  if (!isChatDocumentFile(file)) {
    throw new Error(
      "Formats acceptés : image, PDF, Excel (.xlsx, .xls), .txt, .csv, .md, .json.",
    );
  }
  if (file.size > (isPdfFile(file) ? PDF_MAX_BYTES : MAX_BYTES)) {
    throw new Error(
      isPdfFile(file) ? "PDF trop lourd (max 8 Mo)." : "Fichier trop lourd (max ~2 Mo).",
    );
  }
  const raw = isExcelFile(file)
    ? await excelToText(file)
    : isPdfFile(file)
      ? (await pdfToText(new Uint8Array(await file.arrayBuffer()))).text
      : await file.text();
  const trimmed = raw.replace(/\0/g, "").trim();
  if (!trimmed) {
    throw new Error("Fichier vide ou illisible.");
  }
  const text =
    trimmed.length > MAX_CHARS
      ? `${trimmed.slice(0, MAX_CHARS)}\n\n[… document tronqué pour Okapi …]`
      : trimmed;
  return {
    name: file.name?.trim() || "document.txt",
    mimeType:
      file.type ||
      (isPdfFile(file)
        ? "application/pdf"
        : isExcelFile(file)
          ? "application/vnd.ms-excel"
          : "text/plain"),
    text,
  };
}
