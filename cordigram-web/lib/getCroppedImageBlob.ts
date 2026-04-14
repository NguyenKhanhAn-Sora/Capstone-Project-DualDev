import type { Area } from "react-easy-crop";

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", (error) => reject(error));
    image.setAttribute("crossOrigin", "anonymous");
    image.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: "image/png" | "image/webp",
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Không tạo được blob"));
      },
      type,
      quality,
    );
  });
}

/** Crop vuông từ ảnh (react-easy-crop, rotation=0 trên ảnh hiện tại). */
export async function exportSquareCropPng(
  imageSrc: string,
  pixelCrop: Area,
): Promise<Blob> {
  const img = await createImage(imageSrc);
  const c = document.createElement("canvas");
  c.width = pixelCrop.width;
  c.height = pixelCrop.height;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Canvas 2d không khả dụng");
  ctx.drawImage(
    img,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height,
  );
  return canvasToBlob(c, "image/png", 0.95);
}

export async function rotateImage90CwBlobUrl(
  imageSrc: string,
): Promise<{ url: string; blob: Blob }> {
  const img = await createImage(imageSrc);
  const c = document.createElement("canvas");
  c.width = img.naturalHeight;
  c.height = img.naturalWidth;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Canvas 2d không khả dụng");
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  const blob = await canvasToBlob(c, "image/png", 0.95);
  return { url: URL.createObjectURL(blob), blob };
}

export async function flipImageBlobUrl(
  imageSrc: string,
  horizontal: boolean,
): Promise<{ url: string; blob: Blob }> {
  const img = await createImage(imageSrc);
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Canvas 2d không khả dụng");
  if (horizontal) {
    ctx.translate(c.width, 0);
    ctx.scale(-1, 1);
  } else {
    ctx.translate(0, c.height);
    ctx.scale(1, -1);
  }
  ctx.drawImage(img, 0, 0);
  const blob = await canvasToBlob(c, "image/png", 0.95);
  return { url: URL.createObjectURL(blob), blob };
}

export async function compressImageBlobUnder(
  blob: Blob,
  maxBytes: number,
  mime: "image/png" | "image/webp" = "image/png",
): Promise<Blob> {
  let b = blob;
  if (b.size <= maxBytes) return b;

  const url = URL.createObjectURL(b);
  try {
    const img = await createImage(url);
    let scale = 0.92;
    let quality = mime === "image/webp" ? 0.85 : 0.92;

    for (let i = 0; i < 18 && b.size > maxBytes; i++) {
      const cw = Math.max(32, Math.floor(img.naturalWidth * scale));
      const ch = Math.max(32, Math.floor(img.naturalHeight * scale));
      const c = document.createElement("canvas");
      c.width = cw;
      c.height = ch;
      const x = c.getContext("2d");
      if (!x) break;
      x.drawImage(img, 0, 0, cw, ch);
      const next = await new Promise<Blob | null>((res) =>
        c.toBlob((bl) => res(bl), mime, quality),
      );
      if (!next) break;
      b = next;
      if (b.size <= maxBytes) break;
      scale *= 0.88;
      quality *= 0.9;
    }
    return b;
  } finally {
    URL.revokeObjectURL(url);
  }
}
