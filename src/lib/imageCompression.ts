// browser-image-compression (~50 Ko) est chargé DYNAMIQUEMENT au moment de la
// compression : ce module est importé par ChatWindow (monté au démarrage via
// ChatDock), un import statique tirerait la lib dans le bundle initial.
const loadCompressor = async () => (await import('browser-image-compression')).default;

export interface CompressionOptions {
  maxSizeMB?: number;
  maxWidthOrHeight?: number;
  useWebWorker?: boolean;
  fileType?: string;
}

// Public mobile 3G/4G Madagascar : viser des images légères (~0,5 Mo, 1600 px max)
const defaultOptions: CompressionOptions = {
  maxSizeMB: 0.6,
  maxWidthOrHeight: 1600,
  useWebWorker: true,
  fileType: 'image/jpeg',
};

export async function compressImage(
  file: File,
  options: CompressionOptions = {}
): Promise<File> {
  const mergedOptions = { ...defaultOptions, ...options };

  try {
    const imageCompression = await loadCompressor();
    const compressedFile = await imageCompression(file, mergedOptions);

    const originalSizeMB = file.size / 1024 / 1024;
    const compressedSizeMB = compressedFile.size / 1024 / 1024;
    const compressionRatio = ((1 - compressedSizeMB / originalSizeMB) * 100).toFixed(1);

    console.log(`Image compression:
      Original: ${originalSizeMB.toFixed(2)} MB
      Compressed: ${compressedSizeMB.toFixed(2)} MB
      Reduction: ${compressionRatio}%
    `);

    return compressedFile;
  } catch (error) {
    console.error('Error compressing image:', error);
    throw error;
  }
}

export async function compressImages(
  files: File[],
  options: CompressionOptions = {}
): Promise<File[]> {
  const compressionPromises = files.map(file => compressImage(file, options));
  return Promise.all(compressionPromises);
}

export async function compressImageWithProgress(
  file: File,
  onProgress: (progress: number) => void,
  options: CompressionOptions = {}
): Promise<File> {
  const mergedOptions = {
    ...defaultOptions,
    ...options,
    onProgress: (progress: number) => {
      onProgress(progress);
    },
  };

  try {
    const imageCompression = await loadCompressor();
    const compressedFile = await imageCompression(file, mergedOptions);
    return compressedFile;
  } catch (error) {
    console.error('Error compressing image with progress:', error);
    throw error;
  }
}
