/**
 * Albüm için: base64 boyutunu düşürür (localStorage/IDB dostu).
 * Küçük dosyalarda dokunmaz.
 */
const SKIP_BELOW_BYTES = 180_000;
const MAX_EDGE = 1680;
const JPEG_QUALITY = 0.82;

export async function imageFileToAlbumDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    return "";
  }
  if (file.size <= SKIP_BELOW_BYTES && file.type === "image/jpeg") {
    return readAsDataUrl(file);
  }

  try {
    const bmp = await createImageBitmap(file);
    const maxSide = Math.max(bmp.width, bmp.height);
    const scale = maxSide > MAX_EDGE ? MAX_EDGE / maxSide : 1;
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bmp.close();
      return readAsDataUrl(file);
    }
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  } catch {
    return readAsDataUrl(file);
  }
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () =>
      resolve(typeof fr.result === "string" ? fr.result : "");
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
}
