export type AttachedImage = {
  name: string;
  mimeType: string;
  /** raw base64 without data: prefix */
  base64: string;
  /** data URL for preview / download */
  dataUrl: string;
};

const MAX_BYTES = 4 * 1024 * 1024; // 4 MB

export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  downloadDataUrl(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function fileToAttachedImage(file: File): Promise<AttachedImage> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choisis un fichier image (JPG, PNG, WebP…).");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("Image trop lourde (max 4 Mo).");
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Lecture image impossible."));
    reader.readAsDataURL(file);
  });

  const comma = dataUrl.indexOf(",");
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const mimeMatch = dataUrl.match(/^data:([^;]+);/);
  const mimeType = mimeMatch?.[1] || file.type || "image/jpeg";

  return {
    name: file.name || `okapi-image-${Date.now()}.png`,
    mimeType,
    base64,
    dataUrl,
  };
}
