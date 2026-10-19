/**
 * Redimensionne/compresse une image sélectionnée (caméra ou téléchargement)
 * avant de la garder en base64 — les photos sont stockées directement en
 * base (ErrorReport.photos, PurchaseRequest.photos — voir schema.prisma),
 * jamais via Supabase Storage. Ce redimensionnement les garde raisonnables
 * même avec plusieurs photos par formulaire (confirmé). Partagé entre
 * Rapports d'erreurs (28 août 2026, premier usage) et Demandes d'achat (19
 * octobre 2026, 2e usage — promu ici depuis features/errorReports/ au lieu
 * d'être dupliqué, même principe que les classes CSS globalisées au 2e
 * usage ce même trimestre).
 */
export function readAndCompressImage(file: File, maxDimension = 1280, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Impossible de lire le fichier."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Impossible de charger l'image."));
      img.onload = () => {
        const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(reader.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
