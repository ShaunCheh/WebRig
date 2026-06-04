export type WebGpuEngineStatus =
  | {
      phase: "initializing";
      message: string;
    }
  | {
      phase: "ready";
      message: "";
    }
  | {
      phase: "unsupported" | "error";
      message: string;
    };

export type WebGpuClearColor = Readonly<{
  r: number;
  g: number;
  b: number;
  a: number;
}>;

export type WebGpuRenderItemInitializeContext = Readonly<{
  device: GPUDevice;
  presentationFormat: GPUTextureFormat;
}>;

export type WebGpuRenderItemFrameContext = Readonly<{
  device: GPUDevice;
  queue: GPUQueue;
  canvas: HTMLCanvasElement;
  timestamp: DOMHighResTimeStamp;
  width: number;
  height: number;
  aspectRatio: number;
}>;

export type WebGpuRenderItem = {
  initialize(
    context: WebGpuRenderItemInitializeContext,
  ): Promise<void> | void;
  prepareFrame?(context: WebGpuRenderItemFrameContext): void;
  encodeRenderPass(
    renderPass: GPURenderPassEncoder,
    context: WebGpuRenderItemFrameContext,
  ): void;
  dispose(): void;
};

export type WebGpuEngineOptions = Readonly<{
  canvas: HTMLCanvasElement;
  renderItems: readonly WebGpuRenderItem[];
  clearColor: WebGpuClearColor;
  onStatusChange(status: WebGpuEngineStatus): void;
}>;

export class WebGpuEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly clearColor: WebGpuClearColor;
  private readonly onStatusChange: WebGpuEngineOptions["onStatusChange"];
  private readonly renderItems: WebGpuRenderItem[];

  private animationFrameId = 0;
  private isDisposed = false;
  private device: GPUDevice | null = null;
  private context: GPUCanvasContext | null = null;
  private depthTexture: GPUTexture | null = null;

  public constructor(options: WebGpuEngineOptions) {
    this.canvas = options.canvas;
    this.clearColor = options.clearColor;
    this.onStatusChange = options.onStatusChange;
    this.renderItems = [...options.renderItems];

    this.handleDeviceLost = this.handleDeviceLost.bind(this);
    this.renderFrame = this.renderFrame.bind(this);
  }

  public async start(): Promise<void> {
    await this.initialize();
  }

  public dispose(): void {
    this.isDisposed = true;
    window.cancelAnimationFrame(this.animationFrameId);
    this.destroyRenderItems();
    this.destroyDepthTexture();

    if (this.device !== null) {
      this.device.destroy();
      this.device = null;
    }

    this.context = null;
  }

  private async initialize(): Promise<void> {
    if (!("gpu" in navigator)) {
      this.updateStatus({
        phase: "unsupported",
        message: "当前浏览器不支持 WebGPU，请使用最新版 Chrome 或 Edge。",
      });
      return;
    }

    const context = this.canvas.getContext("webgpu");

    if (!context) {
      this.updateStatus({
        phase: "error",
        message: "浏览器返回了空的 WebGPU Canvas 上下文。",
      });
      return;
    }

    this.context = context;

    try {
      const device = await this.requestDevice();

      if (!device) {
        return;
      }

      if (this.isDisposed) {
        device.destroy();
        return;
      }

      this.device = device;

      void device.lost.then(this.handleDeviceLost);

      const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

      context.configure({
        device,
        format: presentationFormat,
        alphaMode: "opaque",
      });

      this.updateStatus({
        phase: "initializing",
        message: "正在加载场景资源...",
      });

      await this.initializeRenderItems(device, presentationFormat);

      if (this.isDisposed) {
        this.destroyRenderItems();
        return;
      }

      this.updateStatus({
        phase: "ready",
        message: "",
      });

      this.animationFrameId = window.requestAnimationFrame(this.renderFrame);
    } catch (error) {
      this.destroyRenderItems();
      this.destroyDepthTexture();

      this.updateStatus({
        phase: "error",
        message:
          error instanceof Error
            ? error.message
            : "初始化 WebGPU 时发生未知错误。",
      });
    }
  }

  private async requestDevice(): Promise<GPUDevice | null> {
    const adapter = await navigator.gpu.requestAdapter();

    if (!adapter) {
      this.updateStatus({
        phase: "unsupported",
        message: "未能获取可用的 GPU 适配器。",
      });
      return null;
    }

    return adapter.requestDevice();
  }

  private async initializeRenderItems(
    device: GPUDevice,
    presentationFormat: GPUTextureFormat,
  ): Promise<void> {
    for (const renderItem of this.renderItems) {
      await renderItem.initialize({
        device,
        presentationFormat,
      });
    }
  }

  private renderFrame(timestamp: DOMHighResTimeStamp): void {
    const device = this.device;
    const context = this.context;

    if (this.isDisposed || device === null || context === null) {
      return;
    }

    const { width, height } = this.ensureDrawableSize(device);
    const depthTexture = this.depthTexture;

    if (depthTexture === null) {
      return;
    }

    const frameContext: WebGpuRenderItemFrameContext = {
      device,
      queue: device.queue,
      canvas: this.canvas,
      timestamp,
      width,
      height,
      aspectRatio: width / height,
    };

    for (const renderItem of this.renderItems) {
      renderItem.prepareFrame?.(frameContext);
    }

    const commandEncoder = device.createCommandEncoder({
      label: "webgpu-engine-command-encoder",
    });
    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          clearValue: this.clearColor,
          loadOp: "clear",
          storeOp: "store",
        },
      ],
      depthStencilAttachment: {
        view: depthTexture.createView(),
        depthClearValue: 1,
        depthLoadOp: "clear",
        depthStoreOp: "store",
      },
    });

    for (const renderItem of this.renderItems) {
      renderItem.encodeRenderPass(renderPass, frameContext);
    }

    renderPass.end();
    device.queue.submit([commandEncoder.finish()]);
    this.animationFrameId = window.requestAnimationFrame(this.renderFrame);
  }

  private ensureDrawableSize(activeDevice: GPUDevice): {
    width: number;
    height: number;
  } {
    const devicePixelRatio = window.devicePixelRatio || 1;
    const nextWidth = Math.max(
      1,
      Math.floor(this.canvas.clientWidth * devicePixelRatio),
    );
    const nextHeight = Math.max(
      1,
      Math.floor(this.canvas.clientHeight * devicePixelRatio),
    );

    if (
      this.canvas.width === nextWidth &&
      this.canvas.height === nextHeight &&
      this.depthTexture !== null
    ) {
      return { width: nextWidth, height: nextHeight };
    }

    this.canvas.width = nextWidth;
    this.canvas.height = nextHeight;

    this.destroyDepthTexture();

    this.depthTexture = activeDevice.createTexture({
      label: "webgpu-engine-depth-texture",
      size: [nextWidth, nextHeight],
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    return { width: nextWidth, height: nextHeight };
  }

  private destroyRenderItems(): void {
    for (const renderItem of this.renderItems) {
      renderItem.dispose();
    }
  }

  private destroyDepthTexture(): void {
    this.depthTexture?.destroy();
    this.depthTexture = null;
  }

  private updateStatus(nextStatus: WebGpuEngineStatus): void {
    if (!this.isDisposed) {
      this.onStatusChange(nextStatus);
    }
  }

  private handleDeviceLost(info: GPUDeviceLostInfo): void {
    if (this.isDisposed) {
      return;
    }

    this.updateStatus({
      phase: "error",
      message: `GPU 设备已断开：${info.message || info.reason}`,
    });
  }
}
