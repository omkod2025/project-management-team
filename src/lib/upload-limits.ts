/** Per-file limit shared by asset uploads and their browser pickers. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
// Multipart boundaries and form fields need room beyond the file itself.
export const MAX_UPLOAD_REQUEST_BYTES = MAX_UPLOAD_BYTES + 1024 * 1024;
