/** Per-file limit shared by asset uploads and their browser pickers. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
// Multipart boundaries and form fields need room beyond the file itself.
export const MAX_UPLOAD_REQUEST_BYTES = MAX_UPLOAD_BYTES + 1024 * 1024;

/**
 * Attachments on a `file` column are held to a tighter limit than document
 * assets: a task row is read far more often than a document page, and a cell
 * that can hold twenty of these has to stay cheap to list.
 */
export const MAX_FILE_FIELD_BYTES = 20 * 1024 * 1024;
export const MAX_FILE_FIELD_REQUEST_BYTES = MAX_FILE_FIELD_BYTES + 1024 * 1024;
