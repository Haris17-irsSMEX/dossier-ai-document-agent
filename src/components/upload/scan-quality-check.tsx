export type QualityIssue = {
  type: "blurry" | "too_dark" | "too_bright" | "too_small" | "bad_framing";
  message: string;
};

export type QualityResult = {
  ok: boolean;
  width: number;
  height: number;
  brightness: number;
  blurScore: number;
  issues: QualityIssue[];
  message: string;
};

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image."));
    };
    image.src = url;
  });
}

export async function analyzeImageQuality(file: File): Promise<QualityResult> {
  const image = await loadImage(file);
  const maxWidth = 360;
  const scale = Math.min(1, maxWidth / image.naturalWidth);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    throw new Error("Image quality check is not available.");
  }

  canvas.width = width;
  canvas.height = height;
  context.drawImage(image, 0, 0, width, height);

  const { data } = context.getImageData(0, 0, width, height);
  let brightnessTotal = 0;
  let edgeTotal = 0;
  let edgeCount = 0;
  let borderContentPixels = 0;
  let borderPixels = 0;
  const borderX = Math.max(8, Math.round(width * 0.06));
  const borderY = Math.max(8, Math.round(height * 0.06));

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const gray = (data[index] + data[index + 1] + data[index + 2]) / 3;
      brightnessTotal += gray;

      if (
        x < borderX ||
        y < borderY ||
        x >= width - borderX ||
        y >= height - borderY
      ) {
        borderPixels += 1;
        if (gray < 230) {
          borderContentPixels += 1;
        }
      }

      if (x + 1 < width && y + 1 < height) {
        const rightIndex = (y * width + x + 1) * 4;
        const downIndex = ((y + 1) * width + x) * 4;
        const rightGray =
          (data[rightIndex] + data[rightIndex + 1] + data[rightIndex + 2]) / 3;
        const downGray =
          (data[downIndex] + data[downIndex + 1] + data[downIndex + 2]) / 3;

        edgeTotal += Math.abs(gray - rightGray) + Math.abs(gray - downGray);
        edgeCount += 2;
      }
    }
  }

  const brightness = brightnessTotal / (width * height);
  const blurScore = edgeCount ? edgeTotal / edgeCount : 0;
  const borderContentRatio = borderPixels
    ? borderContentPixels / borderPixels
    : 0;
  const issues: QualityIssue[] = [];

  if (image.naturalWidth < 640 || image.naturalHeight < 400) {
    issues.push({
      type: "too_small",
      message: "Image resolution is too low."
    });
  }

  if (brightness < 45) {
    issues.push({
      type: "too_dark",
      message: "Image is too dark. Please retake in better light."
    });
  }

  if (brightness > 235) {
    issues.push({
      type: "too_bright",
      message: "Image is too bright. Please retake."
    });
  }

  if (blurScore < 7) {
    issues.push({
      type: "blurry",
      message: "Image looks blurry. Please retake."
    });
  }

  if (borderContentRatio > 0.86) {
    issues.push({
      type: "bad_framing",
      message: "Document may be cut. Please fit it inside the frame."
    });
  }

  return {
    ok: issues.length === 0,
    width: image.naturalWidth,
    height: image.naturalHeight,
    brightness,
    blurScore,
    issues,
    message: issues[0]?.message || "Photo looks clear enough to upload."
  };
}

export function ScanQualityCheck({
  result,
  isChecking
}: {
  result?: QualityResult | null;
  isChecking?: boolean;
}) {
  if (isChecking) {
    return (
      <div className="scan-quality-card warning">
        <strong>Checking quality...</strong>
      </div>
    );
  }

  if (!result) {
    return null;
  }

  return (
    <div className={`scan-quality-card ${result.ok ? "success" : "warning"}`}>
      <strong>{result.ok ? "Quality looks good" : "Retake recommended"}</strong>
      <p>{result.message}</p>
    </div>
  );
}
