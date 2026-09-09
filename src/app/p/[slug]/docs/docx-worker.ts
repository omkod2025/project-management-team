import mammoth from "mammoth";
import { validateDocxExpansion } from "@/lib/docx-budget";
self.onmessage = async (event: MessageEvent<ArrayBuffer>) => {
  try {
    await validateDocxExpansion(event.data);
    const images: { buffer: ArrayBuffer; type: string }[] = [];
    const result = await mammoth.convertToHtml(
      { arrayBuffer: event.data },
      {
        externalFileAccess: false,
        convertImage: mammoth.images.imgElement(async (image) => {
          if (
            images.length >= 50 ||
            !/^image\/(png|jpeg|webp|gif)$/.test(image.contentType)
          )
            throw new Error(
              "DOCX images must be PNG, JPEG, WebP or GIF, with at most 50 images.",
            );
          const buffer = await image.readAsArrayBuffer();
          if (buffer.byteLength > 5 * 1024 * 1024)
            throw new Error("A DOCX image is larger than 5 MB.");
          images.push({ buffer, type: image.contentType });
          return { src: `/fieldbook-import-image/${images.length - 1}` };
        }),
      },
    );
    if (result.value.length > 1000000)
      throw new Error(
        "Converted document is too large. Split it into smaller files.",
      );
    self.postMessage({
      html: result.value,
      images,
      warnings: result.messages.map((m) => m.message),
    });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : "DOCX conversion failed.",
    });
  }
};
