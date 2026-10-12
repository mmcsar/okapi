/** Pièces jointes texte pour Accueil Agent (CSV / contrats collés / notes). */

export type AttachedChatDocument = {
  name: string;
  mimeType: string;
  text: string;
};

const MAX_BYTES = 2_000_000;
const MAX_CHARS = 80_000;
const DOC_EXT = /\.(txt|csv|tsv|md|markdown|json|log)$/i;

export function isChatDocumentFile(file: File) {
  const t = (file.type || "").toLowerCase();
  if (t.startsWith("text/")) return true;
  if (t === "application/json" || t === "text/csv") return true;
  return DOC_EXT.test(file.name || "");
}

export async function fileToChatDocument(
  file: File,
): Promise<AttachedChatDocument> {
  if (!isChatDocumentFile(file)) {
    throw new Error(
      "Formats acceptés : image, .txt, .csv, .md, .json. Pour Excel, exporte en CSV.",
    );
  }
  if (file.size > MAX_BYTES) {
    throw new Error("Fichier trop lourd (max ~2 Mo).");
  }
  const raw = await file.text();
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
    mimeType: file.type || "text/plain",
    text,
  };
}
