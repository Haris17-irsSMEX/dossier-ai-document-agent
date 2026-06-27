import { formatBytes } from "./upload-utils";

export function FilePreview({
  file,
  previewUrl
}: {
  file: File;
  previewUrl?: string | null;
}) {
  return (
    <div className="file-preview">
      {previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={previewUrl} alt="Selected file preview" />
      ) : (
        <div className="file-preview-placeholder">
          {file.name.split(".").pop()?.toUpperCase() || "FILE"}
        </div>
      )}
      <div>
        <strong>{file.name}</strong>
        <span className="muted">{formatBytes(file.size)}</span>
      </div>
    </div>
  );
}
