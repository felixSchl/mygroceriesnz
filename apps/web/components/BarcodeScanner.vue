<script setup lang="ts">
import {
  getDefaultScanner,
  getInstance,
  scanImageData,
  setModuleArgs,
} from "@undecaf/zbar-wasm";

const config = useRuntimeConfig();
const showDebug = ref(config.public.env !== "production");
const videoRef = ref<HTMLVideoElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);
const streamRef = ref<MediaStream | null>(null);
const hasCamera = ref(false);
const lastResult = ref<string | null>(null);
const hasRejectedPermission = ref(false);
const isScanning = ref(false);
const isZbarReady = ref(false);
const offCanvas = ref<OffscreenCanvas | null>(null);
const scanStats = ref({
  drawTime: 0,
  scanTime: 0,
});
const scanner = ref<any | null>(null);
const isAnimating = ref(true);

// check if OffscreenCanvas is supported
const usingOffscreenCanvas = computed(() => {
  try {
    return Boolean(new OffscreenCanvas(1, 1).getContext("2d"));
  } catch {
    return false;
  }
});

onMounted(async () => {
  try {
    await initialize();

    // initialize zbar
    setModuleArgs({
      // help resolve zbar.wasm file (we keep a copy in public/)
      locateFile: (path) => {
        return `/${path}`;
      },
    });
    await getInstance();
    scanner.value = await getDefaultScanner();
    isZbarReady.value = true;

    // start scanning
    if (isZbarReady.value && hasCamera.value) {
      isScanning.value = true;
      await startScanning();
    }
  } catch (err) {
    console.error("Failed to initialize:", err);
  }
});

async function initialize() {
  hasRejectedPermission.value = false;
  try {
    // Configure constraints to prefer the back camera
    const constraints = {
      audio: false,
      video: {
        facingMode: { exact: "environment" }, // Force back camera
        // width: { ideal: 1920 }, // Optional: request HD resolution
        // height: { ideal: 1080 },
      },
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    streamRef.value = stream;
    hasCamera.value = true;
    if (videoRef.value) {
      videoRef.value.srcObject = stream;
    }
  } catch (err) {
    console.error("Error accessing camera:", err);
    // If "environment" fails, fall back to any available camera
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
      streamRef.value = stream;
      hasCamera.value = true;
      if (videoRef.value) {
        videoRef.value.srcObject = stream;
      }
    } catch (fallbackErr) {
      console.error("Error accessing fallback camera:", fallbackErr);
      if (
        fallbackErr instanceof DOMException &&
        fallbackErr.name === "NotAllowedError"
      ) {
        hasRejectedPermission.value = true;
      }
      hasCamera.value = false;
    }
  }
}

async function startScanning() {
  if (
    !videoRef.value ||
    !canvasRef.value ||
    !isScanning.value ||
    !isZbarReady.value ||
    !scanner.value
  )
    return;

  const canvas = canvasRef.value;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;

  // match canvas size to video
  canvas.width = videoRef.value.videoWidth;
  canvas.height = videoRef.value.videoHeight;

  const drawStart = performance.now();

  // use OffscreenCanvas for processing, but keep main canvas for display
  const offCtx = getOffscreenContext(canvas.width, canvas.height) || ctx;
  offCtx.drawImage(videoRef.value, 0, 0);

  // copy the frame to the visible canvas
  ctx.drawImage(videoRef.value, 0, 0);

  const scanStart = performance.now();
  scanStats.value.drawTime = scanStart - drawStart;

  try {
    const imageData = offCtx.getImageData(0, 0, canvas.width, canvas.height);
    const results = await scanImageData(imageData, scanner.value);

    if (results.length > 0) {
      // pause the video and animation
      videoRef.value.pause();
      isAnimating.value = false;

      // draw markers on the visible canvas
      results.forEach((symbol) => {
        const centerX =
          symbol.points.reduce((sum, p) => sum + p.x, 0) / symbol.points.length;
        const centerY =
          symbol.points.reduce((sum, p) => sum + p.y, 0) / symbol.points.length;

        drawGreenDot(ctx, { x: centerX, y: centerY });
      });

      const newResult = results?.[0]?.decode();
      if (newResult && newResult !== lastResult.value) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        lastResult.value = newResult;
        emit("code-scanned", newResult);

        // resume video and animation after emitting
        videoRef.value.play();
        isAnimating.value = true;
      } else {
        // resume video and animation immediately if it's the same code
        videoRef.value.play();
        isAnimating.value = true;
      }
    }

    scanStats.value.scanTime = performance.now() - scanStart;
  } catch (err) {
    if (err instanceof Error && err.name === "IndexSizeError") {
      // ignore this error
    } else {
      console.error("Scanning error:", err);
    }
  }

  requestAnimationFrame(() => startScanning());
}

function getOffscreenContext(width: number, height: number) {
  if (!usingOffscreenCanvas.value) return null;

  if (
    !offCanvas.value ||
    offCanvas.value.width !== width ||
    offCanvas.value.height !== height
  ) {
    offCanvas.value = new OffscreenCanvas(width, height);
  }
  return offCanvas.value.getContext("2d", { willReadFrequently: true });
}

function drawGreenDot(
  ctx: CanvasRenderingContext2D,
  point: { x: number; y: number },
) {
  const centerX = point.x;
  const centerY = point.y;
  ctx.beginPath();
  ctx.arc(centerX, centerY, 10, 0, 2 * Math.PI);
  ctx.fillStyle = "#22c55e";
  ctx.fill();
}

const emit = defineEmits<{
  (e: "code-scanned", value: string): void;
}>();

// cleanup camera stream
onUnmounted(() => {
  if (streamRef.value) {
    streamRef.value.getTracks().forEach((track) => track.stop());
    streamRef.value = null;
  }
  isScanning.value = false;
});
</script>

<template>
  <ClientOnly>
    <div class="relative w-full">
      <div class="relative">
        <!-- eslint-disable-next-line vuejs-accessibility/media-has-caption -->
        <video
          ref="videoRef"
          class="w-full rounded-lg border border-border"
          autoplay
          playsinline
        />
        <canvas ref="canvasRef" class="absolute inset-0 w-full h-full" />

        <!-- Scanning overlay now relative to video wrapper -->
        <div
          v-if="hasCamera && !hasRejectedPermission"
          class="absolute inset-0 pointer-events-none z-10"
        >
          <div class="scan-line" :class="{ hidden: !isAnimating }" />
          <div class="scan-corner-lt" />
          <div class="scan-corner-rt" />
          <div class="scan-corner-lb" />
          <div class="scan-corner-rb" />
        </div>
      </div>

      <!-- Add loading state while ZBar initializes -->
      <div
        v-if="!isZbarReady"
        class="absolute inset-0 flex items-center justify-center bg-background/80"
      >
        <p class="text-sm text-muted-foreground">Initializing scanner...</p>
      </div>

      <!-- Optional: Add performance stats display -->
      <div
        v-if="showDebug"
        class="absolute top-2 left-2 text-xs text-white bg-black/50 p-2 rounded"
      >
        <div>Draw: {{ Math.round(scanStats.drawTime) }}ms</div>
        <div>Scan: {{ Math.round(scanStats.scanTime) }}ms</div>
        <div>
          Using OffscreenCanvas: {{ usingOffscreenCanvas ? "Yes" : "No" }}
        </div>
      </div>

      <div class="mt-4">
        <div v-if="lastResult" class="p-4 rounded-lg bg-muted">
          <p class="font-medium">Last Scanned Code:</p>
          <p class="mt-1 text-sm">{{ lastResult }}</p>
        </div>

        <div
          v-if="hasRejectedPermission"
          class="p-4 text-center text-destructive"
        >
          Camera permission not granted. Please grant camera permission in your
          browser settings to use the barcode scanner.
        </div>
        <div
          v-else-if="!hasCamera"
          class="p-4 text-center text-muted-foreground"
        >
          No camera detected
        </div>
      </div>
    </div>
  </ClientOnly>
</template>

<style scoped>
.scan-line {
  position: absolute;
  width: 100%;
  height: 2px;
  background: #22c55e99;
  box-shadow: 0 0 8px 2px rgba(34, 197, 94, 0.3);
  /* Combine both animations */
  animation:
    fadeIn 0.5s ease-in forwards,
    scan 2s linear infinite;
  /* Remove the fixed positioning */
  top: 0;
  transform: none;
}

.scan-corner-lt,
.scan-corner-rt,
.scan-corner-lb,
.scan-corner-rb {
  position: absolute;
  width: 20px;
  height: 20px;
  border-color: #22c55e;
  border-style: solid;
  border-width: 0;
}

.scan-corner-lt {
  top: 0;
  left: 0;
  border-top-width: 2px;
  border-left-width: 2px;
}

.scan-corner-rt {
  top: 0;
  right: 0;
  border-top-width: 2px;
  border-right-width: 2px;
}

.scan-corner-lb {
  bottom: 0;
  left: 0;
  border-bottom-width: 2px;
  border-left-width: 2px;
}

.scan-corner-rb {
  bottom: 0;
  right: 0;
  border-bottom-width: 2px;
  border-right-width: 2px;
}

@keyframes scan {
  0% {
    top: 0;
  }
  50% {
    top: calc(100% - 2px);
  }
  100% {
    top: 0;
  }
}

/* Add fade-in animation */
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>
