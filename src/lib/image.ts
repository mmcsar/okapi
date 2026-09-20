export type AttachedImage = {
  name: string;
  mimeType: string;
  /** raw base64 without data: prefix */
  base64: string;
  /** data URL for preview / download */
  dataUrl: string;
};

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB avant compression
const MAX_EDGE = 1280;
const JPEG_QUALITY = 0.82;

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i;

export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Download data URL, blob URL, or same-origin / remote image URL. */
export async function downloadImageUrl(url: string, filename: string) {
  if (url.startsWith("data:") || url.startsWith("blob:")) {
    downloadDataUrl(url, filename);
    return;
  }
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    downloadBlob(blob, filename);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  downloadDataUrl(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function normalizeImageMime(mime: string, name?: string): string {
  const m = (mime || "").toLowerCase().trim();
  if (m === "image/jpg") return "image/jpeg";
  if (m === "image/pjpeg") return "image/jpeg";
  if (m.startsWith("image/") && m.length > 6) return m;
  const ext = (name || "").split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "bmp") return "image/bmp";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  return "image/jpeg";
}

function looksLikeImage(file: File) {
  if (file.type.startsWith("image/")) return true;
  return IMAGE_EXT.test(file.name || "");
}

async function compressToJpegDataUrl(
  file: File,
  maxEdge = MAX_EDGE,
  quality = JPEG_QUALITY,
): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const bitmap = await createImageBitmap(file).catch(async () => {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("Lecture image impossible."));
        el.src = objectUrl;
      });
      return img;
    });

    const w =
      "width" in bitmap ? bitmap.width : (bitmap as HTMLImageElement).naturalWidth;
    const h =
      "height" in bitmap
        ? bitmap.height
        : (bitmap as HTMLImageElement).naturalHeight;
    if (!w || !h) throw new Error("Image invalide ou corrompue.");

    const scale = Math.min(1, maxEdge / Math.max(w, h));
    const tw = Math.max(1, Math.round(w * scale));
    const th = Math.max(1, Math.round(h * scale));

    const canvas = document.createElement("canvas");
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Compression image impossible.");
    ctx.drawImage(bitmap as CanvasImageSource, 0, 0, tw, th);

    if ("close" in bitmap && typeof bitmap.close === "function") {
      bitmap.close();
    }

    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function fileToAttachedImage(file: File): Promise<AttachedImage> {
  if (!looksLikeImage(file)) {
    throw new Error("Choisis un fichier image (JPG, PNG, WebP…).");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("Image trop lourde (max 8 Mo). Compresse-la ou choisis une autre.");
  }

  // Compresse toujours en JPEG raisonnable pour que l’IA vision puisse lire
  // (téléchargements Windows souvent sans mime / trop lourds).
  let dataUrl: string;
  try {
    dataUrl = await compressToJpegDataUrl(file);
  } catch {
    dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Lecture image impossible."));
      reader.readAsDataURL(file);
    });
  }

  const comma = dataUrl.indexOf(",");
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  if (!base64 || base64.length < 32) {
    throw new Error("Image vide ou illisible. Réessaie avec un JPG/PNG.");
  }

  const mimeMatch = dataUrl.match(/^data:([^;]+);/);
  const mimeType = normalizeImageMime(
    mimeMatch?.[1] || file.type || "image/jpeg",
    file.name,
  );

  const baseName = (file.name || "okapi-image").replace(/\.[^.]+$/, "");
  const name = `${baseName || "okapi-image"}.jpg`;

  return {
    name,
    mimeType: mimeType.startsWith("image/") ? mimeType : "image/jpeg",
    base64,
    dataUrl,
  };
}
