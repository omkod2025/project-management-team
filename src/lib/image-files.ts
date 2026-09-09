// Image formats that may arrive without a MIME type from the OS file picker.
export const IMAGE_EXTENSIONS = '.png,.jpg,.jpeg,.jfif,.pjpeg,.pjp,.gif,.webp,.svg,.avif,.heic,.heif,.hif,.bmp,.dib,.tif,.tiff,.ico,.cur,.jxl,.apng,.psd,.psb,.raw,.dng,.cr2,.cr3,.nef,.nrw,.arw,.sr2,.orf,.rw2,.raf,.pef,.srw,.exr,.hdr,.dds,.tga,.pcx,.jp2,.j2k,.jpf,.jpx,.jpm,.mj2,.ppm,.pgm,.pbm,.pnm,.qoi';
export function isImageFile(file: { name: string; type: string }) {
  return /^image\/[a-z0-9.+-]+$/i.test(file.type) || IMAGE_EXTENSIONS.split(',').some((ext) => file.name.toLowerCase().endsWith(ext));
}
