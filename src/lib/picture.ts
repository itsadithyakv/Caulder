import { PICTURE_MAX_BYTES, fitWithin, type VisionPicture } from "@shared/vision";

/**
 * A picture made small enough to keep (PLAN.md, phase 17): brought within
 * the long side a board tile is ever shown at, and written as WebP, stepping
 * the quality down until it fits. Done here, in the window, so a twelve
 * megabyte photo from a phone never crosses to the main process whole.
 *
 * `createImageBitmap` turns a photo the right way up from its EXIF, and
 * refuses anything that is not a picture - an SVG, a PDF - which is what
 * the board wants.
 */
export async function shrinkPicture(file: Blob): Promise<{ picture: VisionPicture; preview: string }> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Caulder could not read that picture. A photo, a PNG or a WebP works.");
  }
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Caulder could not read that picture.");
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);
    for (const quality of [0.86, 0.74, 0.6]) {
      const blob = await canvas.convertToBlob({ type: "image/webp", quality });
      if (blob.size <= PICTURE_MAX_BYTES) {
        // The preview is the same blob, so what is shown is what will be kept - as a data:
        // URL, because the window's CSP allows images from data: and not from blob:.
        return {
          picture: { bytes: new Uint8Array(await blob.arrayBuffer()), type: "image/webp", width, height },
          preview: await dataUrlOf(blob),
        };
      }
    }
    throw new Error("That picture is too large, even made smaller.");
  } finally {
    bitmap.close();
  }
}

function dataUrlOf(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Caulder could not read that picture."));
    reader.readAsDataURL(blob);
  });
}

/** The first picture among what was dropped or pasted, if there is one. */
export function pictureIn(files: FileList | readonly File[] | null | undefined): File | null {
  for (const file of Array.from(files ?? [])) {
    if (file.type.startsWith("image/")) return file;
  }
  return null;
}
