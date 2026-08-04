export const IMAGE_CROP_DATA_ATTRIBUTE = 'data-cwk-image-crop';
export const IMAGE_CROP_MIN_FRACTION = 0.05;

const CROP_PRECISION = 1000000;

export function normalizeImageCrop(value = {}) {
  const enabled = value.enabled === true || value.cropEnabled === true;
  const x = clamp(numberOr(value.x, value.cropX, 0), 0, 1 - IMAGE_CROP_MIN_FRACTION);
  const y = clamp(numberOr(value.y, value.cropY, 0), 0, 1 - IMAGE_CROP_MIN_FRACTION);
  const width = clamp(numberOr(value.width, value.cropWidth, 1), IMAGE_CROP_MIN_FRACTION, 1 - x);
  const height = clamp(numberOr(value.height, value.cropHeight, 1), IMAGE_CROP_MIN_FRACTION, 1 - y);
  const aspect = Math.max(0, numberOr(value.aspect, value.cropAspect, 0));
  const pixelWidth = Math.max(0, Math.round(numberOr(value.pixelWidth, value.cropPixelWidth, 0)));

  return {
    enabled,
    x: roundCropValue(x),
    y: roundCropValue(y),
    width: roundCropValue(width),
    height: roundCropValue(height),
    aspect: roundCropValue(aspect),
    pixelWidth,
  };
}

export function imageCropFromBlockProps(props = {}) {
  return normalizeImageCrop(props);
}

export function imageCropBlockProps(value = {}) {
  const crop = normalizeImageCrop(value);
  return {
    cropEnabled: crop.enabled,
    cropX: crop.x,
    cropY: crop.y,
    cropWidth: crop.width,
    cropHeight: crop.height,
    cropAspect: crop.aspect,
    cropPixelWidth: crop.pixelWidth,
  };
}

export function serializeImageCrop(value = {}) {
  const crop = normalizeImageCrop(value);
  if (!crop.enabled || crop.aspect <= 0 || crop.pixelWidth <= 0) return '';
  return [crop.x, crop.y, crop.width, crop.height, crop.aspect, crop.pixelWidth].join(',');
}

export function parseImageCrop(value = '') {
  const parts = String(value || '').split(',').map(Number);
  if (parts.length !== 6 || parts.some(part => !Number.isFinite(part))) {
    return normalizeImageCrop();
  }

  const crop = normalizeImageCrop({
    enabled: true,
    x: parts[0],
    y: parts[1],
    width: parts[2],
    height: parts[3],
    aspect: parts[4],
    pixelWidth: parts[5],
  });
  if (crop.aspect <= 0 || crop.pixelWidth <= 0) return normalizeImageCrop();
  return crop;
}

export function imageCropStyle(value = {}) {
  const crop = normalizeImageCrop(value);
  if (!crop.enabled || crop.aspect <= 0 || crop.pixelWidth <= 0) return null;

  return {
    frame: {
      aspectRatio: String(crop.aspect),
      width: `${crop.pixelWidth}px`,
    },
    image: {
      width: `${100 / crop.width}%`,
      height: 'auto',
      left: `${(-crop.x / crop.width) * 100}%`,
      top: `${(-crop.y / crop.height) * 100}%`,
    },
  };
}

export function fitImageCropToAspect(value = {}, targetAspect, naturalAspect) {
  const crop = normalizeImageCrop(value);
  const desiredAspect = Number(targetAspect);
  const sourceAspect = Number(naturalAspect);
  if (!(desiredAspect > 0) || !(sourceAspect > 0)) return crop;

  const centerX = crop.x + crop.width / 2;
  const centerY = crop.y + crop.height / 2;
  let width = crop.width;
  let height = width * sourceAspect / desiredAspect;

  if (height > crop.height) {
    height = crop.height;
    width = height * desiredAspect / sourceAspect;
  }
  if (width > 1) {
    width = 1;
    height = sourceAspect / desiredAspect;
  }
  if (height > 1) {
    height = 1;
    width = desiredAspect / sourceAspect;
  }

  const x = clamp(centerX - width / 2, 0, 1 - width);
  const y = clamp(centerY - height / 2, 0, 1 - height);
  return normalizeImageCrop({ ...crop, enabled: true, x, y, width, height });
}

export function cropAspectFromRect(value = {}, naturalAspect = 0) {
  const crop = normalizeImageCrop(value);
  const sourceAspect = Number(naturalAspect);
  if (!(sourceAspect > 0) || !(crop.width > 0) || !(crop.height > 0)) return 0;
  return roundCropValue(sourceAspect * crop.width / crop.height);
}

export function cropPixelWidthFromRect(value = {}, naturalWidth = 0) {
  const crop = normalizeImageCrop(value);
  return Math.max(1, Math.round(Number(naturalWidth || 0) * crop.width));
}

function numberOr(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return 0;
}

function clamp(value, min, max) {
  return Math.min(Math.max(Number(value), min), Math.max(min, max));
}

function roundCropValue(value) {
  return Math.round(Number(value) * CROP_PRECISION) / CROP_PRECISION;
}
