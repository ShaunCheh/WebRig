import type { ObjMesh } from "@/lib/loaders/obj-loader";
import { fitMeshToUnitCube, parseObj } from "@/lib/loaders/obj-loader";
import type { WebGpuProgramDefinition } from "@/lib/webgpu/programs/types";

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

type WebGpuMeshRenderItemOptions = Readonly<{
  modelUrl: string;
  program: WebGpuProgramDefinition;
  cameraDistance: number;
  rotationSpeedX: number;
  rotationSpeedY: number;
}>;

type WebGpuMeshRenderResources = {
  vertexBuffer: GPUBuffer;
  indexBuffer: GPUBuffer;
  uniformBuffer: GPUBuffer;
  uniformValues: Float32Array<ArrayBuffer>;
  pipeline: GPURenderPipeline;
  bindGroup: GPUBindGroup;
  indexCount: number;
  indexFormat: GPUIndexFormat;
};

type WebGpuOverlayRenderResources = {
  vertexBuffer: GPUBuffer;
  vertexData: Float32Array<ArrayBuffer>;
  pipeline: GPURenderPipeline;
  vertexCount: number;
};

export type WebGpuEngineOptions = Readonly<{
  canvas: HTMLCanvasElement;
  modelUrl: string;
  program: WebGpuProgramDefinition;
  cameraDistance: number;
  rotationSpeedX: number;
  rotationSpeedY: number;
  clearColor: WebGpuClearColor;
  onStatusChange(status: WebGpuEngineStatus): void;
}>;

const overlayShaderUrl = "/shaders/overlay-square.wgsl";
const overlayVertexStride = 5 * Float32Array.BYTES_PER_ELEMENT;
const overlayVertexCount = 6;
const overlayPaddingPx = 16;
const overlaySizePx = 96;
const overlayColor = {
  r: 0.95,
  g: 0.35,
  b: 0.35,
} as const;

function createUniformValues(byteLength: number): Float32Array<ArrayBuffer> {
  if (byteLength % Float32Array.BYTES_PER_ELEMENT !== 0) {
    throw new Error("Program uniformBufferByteLength 必须是 4 字节对齐。");
  }

  return new Float32Array(byteLength / Float32Array.BYTES_PER_ELEMENT);
}

async function loadTextResource(
  resourceUrl: string,
  resourceName: string,
): Promise<string> {
  const response = await fetch(resourceUrl);

  if (!response.ok) {
    throw new Error(
      `加载 ${resourceName} 失败：${response.status} ${response.statusText || "未知错误"}`,
    );
  }

  return response.text();
}

async function loadMeshAsset(modelUrl: string): Promise<ObjMesh> {
  const modelText = await loadTextResource(modelUrl, "OBJ");
  const mesh = parseObj(modelText);

  fitMeshToUnitCube(mesh.vertices);

  return mesh;
}

function createMeshVertexBuffer(
  device: GPUDevice,
  program: WebGpuProgramDefinition,
  mesh: ObjMesh,
): GPUBuffer {
  const vertexBuffer = device.createBuffer({
    label: `${program.label}-vertex-buffer`,
    size: mesh.vertices.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
  });

  new Float32Array(vertexBuffer.getMappedRange()).set(mesh.vertices);
  vertexBuffer.unmap();

  return vertexBuffer;
}

function createMeshIndexBuffer(
  device: GPUDevice,
  program: WebGpuProgramDefinition,
  mesh: ObjMesh,
): {
  indexBuffer: GPUBuffer;
  indexCount: number;
  indexFormat: GPUIndexFormat;
} {
  const indexBuffer = device.createBuffer({
    label: `${program.label}-index-buffer`,
    size: mesh.indices.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
  });

  if (mesh.indices instanceof Uint32Array) {
    new Uint32Array(indexBuffer.getMappedRange()).set(mesh.indices);
  } else {
    new Uint16Array(indexBuffer.getMappedRange()).set(mesh.indices);
  }

  indexBuffer.unmap();

  return {
    indexBuffer,
    indexCount: mesh.indices.length,
    indexFormat: mesh.indices instanceof Uint32Array ? "uint32" : "uint16",
  };
}

function createProgramRenderPipeline(
  device: GPUDevice,
  program: WebGpuProgramDefinition,
  shaderCode: string,
  presentationFormat: GPUTextureFormat,
): GPURenderPipeline {
  const shaderModule = device.createShaderModule({
    label: `${program.label}-shader`,
    code: shaderCode,
  });

  return device.createRenderPipeline({
    label: `${program.label}-render-pipeline`,
    layout: "auto",
    vertex: {
      module: shaderModule,
      entryPoint: program.vertexEntryPoint,
      buffers: program.vertexBufferLayouts,
    },
    fragment: {
      module: shaderModule,
      entryPoint: program.fragmentEntryPoint,
      targets: [
        {
          format: presentationFormat,
        },
      ],
    },
    primitive: program.primitive,
    depthStencil: program.depthStencil,
  });
}

function createOverlayResources(
  device: GPUDevice,
  presentationFormat: GPUTextureFormat,
  overlayShaderCode: string,
): WebGpuOverlayRenderResources {
  const overlayShaderModule = device.createShaderModule({
    label: "overlay-square-shader",
    code: overlayShaderCode,
  });
  const overlayVertexBuffer = device.createBuffer({
    label: "overlay-square-vertex-buffer",
    size: overlayVertexCount * overlayVertexStride,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  const overlayVertexData = new Float32Array(overlayVertexCount * 5);
  const overlayPipeline = device.createRenderPipeline({
    label: "overlay-square-render-pipeline",
    layout: "auto",
    vertex: {
      module: overlayShaderModule,
      entryPoint: "vsMain",
      buffers: [
        {
          arrayStride: overlayVertexStride,
          attributes: [
            {
              shaderLocation: 0,
              offset: 0,
              format: "float32x2",
            },
            {
              shaderLocation: 1,
              offset: 2 * Float32Array.BYTES_PER_ELEMENT,
              format: "float32x3",
            },
          ],
        },
      ],
    },
    fragment: {
      module: overlayShaderModule,
      entryPoint: "fsMain",
      targets: [
        {
          format: presentationFormat,
        },
      ],
    },
    primitive: {
      topology: "triangle-list",
      cullMode: "none",
    },
    depthStencil: {
      format: "depth24plus",
      depthWriteEnabled: false,
      depthCompare: "always",
    },
  });

  return {
    vertexBuffer: overlayVertexBuffer,
    vertexData: overlayVertexData,
    pipeline: overlayPipeline,
    vertexCount: overlayVertexCount,
  };
}

function updateOverlayVertexData(
  overlayResources: WebGpuOverlayRenderResources,
  width: number,
  height: number,
): void {
  const left = overlayPaddingPx;
  const top = overlayPaddingPx;
  const right = left + overlaySizePx;
  const bottom = top + overlaySizePx;

  const leftNdc = (left / width) * 2 - 1;
  const rightNdc = (right / width) * 2 - 1;
  const topNdc = 1 - (top / height) * 2;
  const bottomNdc = 1 - (bottom / height) * 2;

  overlayResources.vertexData.set(
    [
      leftNdc,
      topNdc,
      overlayColor.r,
      overlayColor.g,
      overlayColor.b,
      rightNdc,
      topNdc,
      overlayColor.r,
      overlayColor.g,
      overlayColor.b,
      rightNdc,
      bottomNdc,
      overlayColor.r,
      overlayColor.g,
      overlayColor.b,
      leftNdc,
      topNdc,
      overlayColor.r,
      overlayColor.g,
      overlayColor.b,
      rightNdc,
      bottomNdc,
      overlayColor.r,
      overlayColor.g,
      overlayColor.b,
      leftNdc,
      bottomNdc,
      overlayColor.r,
      overlayColor.g,
      overlayColor.b,
    ],
    0,
  );
}

function createRotatingMeshRenderItem(
  options: WebGpuMeshRenderItemOptions,
): WebGpuRenderItem {
  let resources: WebGpuMeshRenderResources | null = null;

  return {
    async initialize({
      device,
      presentationFormat,
    }: WebGpuRenderItemInitializeContext): Promise<void> {
      const [mesh, shaderCode] = await Promise.all([
        loadMeshAsset(options.modelUrl),
        loadTextResource(options.program.shaderUrl, "Shader"),
      ]);
      const vertexBuffer = createMeshVertexBuffer(device, options.program, mesh);
      const {
        indexBuffer,
        indexCount,
        indexFormat,
      } = createMeshIndexBuffer(device, options.program, mesh);
      const uniformValues = createUniformValues(
        options.program.uniformBufferByteLength,
      );
      const uniformBuffer = device.createBuffer({
        label: `${options.program.label}-uniform-buffer`,
        size: options.program.uniformBufferByteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      const pipeline = createProgramRenderPipeline(
        device,
        options.program,
        shaderCode,
        presentationFormat,
      );
      const bindGroup = device.createBindGroup({
        label: `${options.program.label}-bind-group`,
        layout: pipeline.getBindGroupLayout(options.program.bindGroupIndex),
        entries: options.program.createBindGroupEntries({
          uniformBuffer,
        }),
      });

      resources = {
        vertexBuffer,
        indexBuffer,
        uniformBuffer,
        uniformValues,
        pipeline,
        bindGroup,
        indexCount,
        indexFormat,
      };
    },

    prepareFrame(frameContext: WebGpuRenderItemFrameContext): void {
      if (resources === null) {
        return;
      }

      options.program.writeFrameUniforms({
        uniformValues: resources.uniformValues,
        timestamp: frameContext.timestamp,
        aspectRatio: frameContext.aspectRatio,
        cameraDistance: options.cameraDistance,
        rotationSpeedX: options.rotationSpeedX,
        rotationSpeedY: options.rotationSpeedY,
      });

      frameContext.queue.writeBuffer(
        resources.uniformBuffer,
        0,
        resources.uniformValues,
      );
    },

    encodeRenderPass(
      renderPass: GPURenderPassEncoder,
      _frameContext: WebGpuRenderItemFrameContext,
    ): void {
      if (resources === null) {
        return;
      }

      renderPass.setPipeline(resources.pipeline);
      renderPass.setBindGroup(
        options.program.bindGroupIndex,
        resources.bindGroup,
      );
      renderPass.setVertexBuffer(0, resources.vertexBuffer);
      renderPass.setIndexBuffer(resources.indexBuffer, resources.indexFormat);
      renderPass.drawIndexed(resources.indexCount);
    },

    dispose(): void {
      if (resources === null) {
        return;
      }

      resources.vertexBuffer.destroy();
      resources.indexBuffer.destroy();
      resources.uniformBuffer.destroy();
      resources = null;
    },
  };
}

function createOverlayRenderItem(): WebGpuRenderItem {
  let resources: WebGpuOverlayRenderResources | null = null;

  return {
    async initialize({
      device,
      presentationFormat,
    }: WebGpuRenderItemInitializeContext): Promise<void> {
      const overlayShaderCode = await loadTextResource(
        overlayShaderUrl,
        "Overlay Shader",
      );

      resources = createOverlayResources(
        device,
        presentationFormat,
        overlayShaderCode,
      );
    },

    prepareFrame(frameContext: WebGpuRenderItemFrameContext): void {
      if (resources === null) {
        return;
      }

      updateOverlayVertexData(
        resources,
        frameContext.width,
        frameContext.height,
      );
      frameContext.queue.writeBuffer(resources.vertexBuffer, 0, resources.vertexData);
    },

    encodeRenderPass(
      renderPass: GPURenderPassEncoder,
      _frameContext: WebGpuRenderItemFrameContext,
    ): void {
      if (resources === null) {
        return;
      }

      renderPass.setPipeline(resources.pipeline);
      renderPass.setVertexBuffer(0, resources.vertexBuffer);
      renderPass.draw(resources.vertexCount);
    },

    dispose(): void {
      if (resources === null) {
        return;
      }

      resources.vertexBuffer.destroy();
      resources = null;
    },
  };
}

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
    this.renderItems = [
      createRotatingMeshRenderItem({
        modelUrl: options.modelUrl,
        program: options.program,
        cameraDistance: options.cameraDistance,
        rotationSpeedX: options.rotationSpeedX,
        rotationSpeedY: options.rotationSpeedY,
      }),
      createOverlayRenderItem(),
    ];

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
