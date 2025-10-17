
// Get DOM elements
const imageUpload = document.getElementById('image-upload');
const fileStatus = document.getElementById('file-status');
const outputArea = document.getElementById('output-area');
const outputCanvas = document.getElementById('output-canvas');
const downloadBtn = document.getElementById('download-btn');
const statusMessage = document.getElementById('status-message');

// Target dimensions
const TARGET_WIDTH = 300;
const TARGET_HEIGHT = 150;

/**
 * Displays an error message to the user.
 * @param {string} message The error message to display.
 */
function showError(message) {
    statusMessage.textContent = message;
    statusMessage.classList.remove('hidden');
    outputArea.classList.add('hidden');
    downloadBtn.disabled = true;
}

/**
 * Handles the file input change event.
 * @param {Event} event The change event object.
 */
function handleImageUpload(event) {
    const target = event.target;
    if (!target || !target.files || target.files.length === 0) {
        return;
    }

    const file = target.files[0];

    // Reset UI
    statusMessage.classList.add('hidden');
    statusMessage.textContent = '';
    downloadBtn.disabled = true;

    if (!file.type.startsWith('image/')) {
        showError('File yang diunggah bukan gambar.');
        return;
    }

    fileStatus.textContent = file.name;

    const reader = new FileReader();
    reader.onload = (e) => {
        const result = e.target?.result;
        if (typeof result !== 'string') {
            showError('Gagal membaca file gambar.');
            return;
        }

        const img = new Image();
        img.onload = () => {
            processImage(img);
        };
        img.onerror = () => {
            showError('Gagal memuat gambar dari file.');
        };
        img.src = result;
    };
    reader.onerror = () => {
        showError('Terjadi kesalahan saat membaca file.');
    };
    reader.readAsDataURL(file);
}

/**
 * Processes the image: resizes, applies Floyd-Steinberg dithering, and draws on canvas.
 * @param {HTMLImageElement} img The image element to process.
 */
function processImage(img) {
    const ctx = outputCanvas.getContext('2d');
    if (!ctx) {
        showError('Tidak bisa mendapatkan konteks canvas.');
        return;
    }

    // Draw resized image
    ctx.clearRect(0, 0, TARGET_WIDTH, TARGET_HEIGHT);
    ctx.drawImage(img, 0, 0, TARGET_WIDTH, TARGET_HEIGHT);

    // Get image data
    const imageData = ctx.getImageData(0, 0, TARGET_WIDTH, TARGET_HEIGHT);
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;

    // Create a single-channel grayscale copy of the image data for processing
    const grayData = new Float32Array(width * height);
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
        grayData[i / 4] = luminance;
    }

    // Apply Floyd-Steinberg dithering
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const index = y * width + x;
            const oldPixel = grayData[index];
            const newPixel = oldPixel < 128 ? 0 : 255;
            const quantError = oldPixel - newPixel;
            
            grayData[index] = newPixel;

            // Distribute the error to neighboring pixels
            if (x + 1 < width) {
                grayData[index + 1] += quantError * 7 / 16;
            }
            if (x - 1 >= 0 && y + 1 < height) {
                grayData[index + width - 1] += quantError * 3 / 16;
            }
            if (y + 1 < height) {
                grayData[index + width] += quantError * 5 / 16;
            }
            if (x + 1 < width && y + 1 < height) {
                grayData[index + width + 1] += quantError * 1 / 16;
            }
        }
    }
    
    // Put the dithered data back into the imageData object
    for (let i = 0; i < grayData.length; i++) {
        const color = grayData[i];
        data[i * 4] = color;
        data[i * 4 + 1] = color;
        data[i * 4 + 2] = color;
    }

    // Put the dithered data back onto the canvas
    ctx.putImageData(imageData, 0, 0);

    // Show output and enable download
    outputArea.classList.remove('hidden');
    downloadBtn.disabled = false;
}

/**
 * Converts a canvas element to a 1-bit monochrome BMP file Blob.
 * @param {HTMLCanvasElement} canvas The canvas element to convert.
 * @returns {Blob | null} A Blob object representing the BMP file, or null on error.
 */
function canvasToBmpBlob(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const width = canvas.width;
    const height = canvas.height;
    const imageData = ctx.getImageData(0, 0, width, height);

    // BMP header size
    const headerSize = 54;
    // Color palette for 1-bit BMP (black and white)
    const paletteSize = 8;
    // Each row must be a multiple of 4 bytes.
    const rowByteSize = Math.ceil(width / 8);
    const paddedRowSize = Math.floor((rowByteSize + 3) / 4) * 4;
    const pixelArraySize = paddedRowSize * height;
    const fileSize = headerSize + paletteSize + pixelArraySize;

    const buffer = new ArrayBuffer(fileSize);
    const view = new DataView(buffer);

    // All BMP integer values are little-endian.

    // BMP File Header
    view.setUint16(0, 0x4D42, true); // 'BM' in little-endian is 0x4D42
    view.setUint32(2, fileSize, true);
    view.setUint32(6, 0, true); // reserved
    view.setUint32(10, headerSize + paletteSize, true); // Offset to pixel data

    // DIB (Bitmap Information) Header
    view.setUint32(14, 40, true); // Header size
    view.setUint32(18, width, true);
    view.setUint32(22, height, true); // Positive for bottom-up
    view.setUint16(26, 1, true); // Planes
    view.setUint16(28, 1, true); // Bits per pixel
    view.setUint32(30, 0, true); // Compression (BI_RGB)
    view.setUint32(34, pixelArraySize, true); // Image data size
    view.setUint32(38, 2835, true); // Horizontal resolution (72 DPI)
    view.setUint32(42, 2835, true); // Vertical resolution (72 DPI)
    view.setUint32(46, 2, true); // Colors in palette
    view.setUint32(50, 2, true); // Important colors

    // Color Palette
    view.setUint32(54, 0x00000000, true); // Black (index 0)
    view.setUint32(58, 0x00FFFFFF, true); // White (index 1)

    // Pixel Data (using direct Uint8Array for performance)
    const pixelData = new Uint8Array(buffer, headerSize + paletteSize);
    const data = imageData.data;

    for (let y = 0; y < height; y++) {
        const canvasRowIndex = (height - 1 - y) * width * 4; // Read canvas data from bottom up
        const bmpRowIndex = y * paddedRowSize;

        for (let x = 0; x < width; x += 8) {
            let byte = 0;
            // Pack 8 pixels into one byte
            for (let bit = 0; bit < 8; bit++) {
                if (x + bit < width) {
                    const canvasPixelIndex = canvasRowIndex + (x + bit) * 4;
                    // R, G, and B are the same in monochrome. Check red channel.
                    const color = data[canvasPixelIndex];
                    
                    // Palette: black=0, white=1.
                    // If canvas pixel is white (255), set the bit to 1.
                    if (color === 255) {
                        byte |= (1 << (7 - bit));
                    }
                }
            }
            const byteIndex = bmpRowIndex + Math.floor(x / 8);
            pixelData[byteIndex] = byte;
        }
    }

    return new Blob([buffer], { type: 'image/bmp' });
}

/**
 * Handles the download button click event.
 */
function handleDownload() {
    const bmpBlob = canvasToBmpBlob(outputCanvas);
    if (bmpBlob) {
        const url = URL.createObjectURL(bmpBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'output_monochrome.bmp';
        document.body.appendChild(a);
a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } else {
        showError('Gagal membuat file BMP.');
    }
}

// Add event listeners
imageUpload.addEventListener('change', handleImageUpload);
downloadBtn.addEventListener('click', handleDownload);
