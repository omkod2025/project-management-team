export async function importDocx(
  file: File,
  projectId: string,
): Promise<{ html: string; warnings: string[] }> {
  const worker = new Worker(new URL("./docx-worker.ts", import.meta.url));
  try {
    const result = await new Promise<{
      html: string;
      images: { buffer: ArrayBuffer; type: string }[];
      warnings: string[];
    }>((resolve, reject) => {
      const timer = setTimeout(() => {
        worker.terminate();
        reject(new Error("DOCX conversion timed out. Try a smaller document."));
      }, 20000);
      worker.onmessage = (e) => {
        clearTimeout(timer);
        e.data.error ? reject(new Error(e.data.error)) : resolve(e.data);
      };
      worker.onerror = () => {
        clearTimeout(timer);
        reject(new Error("Could not convert this DOCX file."));
      };
      void file
        .arrayBuffer()
        .then((buffer) => worker.postMessage(buffer, [buffer]))
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
    let html = result.html;
    for (const [index, image] of result.images.entries()) {
      const form = new FormData();
      form.set(
        "file",
        new File(
          [image.buffer],
          `docx-image-${index + 1}.${image.type.split("/")[1]}`,
          { type: image.type },
        ),
      );
      form.set("kind", "image");
      const response = await fetch(`/api/projects/${projectId}/doc-assets`, {
        method: "POST",
        body: form,
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.message ?? "DOCX image upload failed.");
      html = html.replaceAll(
        `/fieldbook-import-image/${index}"`,
        `${body.url}"`,
      );
    }
    return { html, warnings: result.warnings };
  } finally {
    worker.terminate();
  }
}
