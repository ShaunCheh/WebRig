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

type WebGpuSceneResources = {
  vertexBuffer: GPUBuffer;
  indexBuffer: GPUBuffer;
  uniformBuffer: GPUBuffer;
  uniformValues: Float32Array<ArrayBuffer>;
  pipeline: GPURenderPipeline;
  bindGroup: GPUBindGroup;
  indexCount: number;
  indexFormat: GPUIndexFormat;
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

function createUniformValues(byteLength: number): Float32Array<ArrayBuffer> {
  if (byteLength % Float32Array.BYTES_PER_ELEMENT !== 0) {
    throw new Error("Program uniformBufferByteLength 必须是 4 字节对齐。");
  }

  return new Float32Array(byteLength / Float32Array.BYTES_PER_ELEMENT);
}

export class WebGpuEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly modelUrl: string;
  private readonly program: WebGpuProgramDefinition;
  private readonly cameraDistance: number;
  private readonly rotationSpeedX: number;
  private readonly rotationSpeedY: number;
  private readonly clearColor: WebGpuClearColor;
  private readonly onStatusChange: WebGpuEngineOptions["onStatusChange"];

  private animationFrameId = 0;
  private isDisposed = false;
  private device: GPUDevice | null = null;
  private context: GPUCanvasContext | null = null;
  private depthTexture: GPUTexture | null = null;
  private sceneResources: WebGpuSceneResources | null = null;

  private printCounter: number = 0;

  public constructor(options: WebGpuEngineOptions) {
    this.canvas = options.canvas;
    this.modelUrl = options.modelUrl;
    this.program = options.program;
    this.cameraDistance = options.cameraDistance;
    this.rotationSpeedX = options.rotationSpeedX;
    this.rotationSpeedY = options.rotationSpeedY;
    this.clearColor = options.clearColor;
    this.onStatusChange = options.onStatusChange;

    this.handleDeviceLost = this.handleDeviceLost.bind(this);
    this.renderFrame = this.renderFrame.bind(this);
  }

  public async start(): Promise<void> {
    await this.initialize();
  }

  public dispose(): void {
    this.isDisposed = true;
    window.cancelAnimationFrame(this.animationFrameId);
    this.destroySceneResources();
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

      const sceneResources = await this.createSceneResources(presentationFormat);

      if (this.isDisposed) {
        this.destroySceneResources(sceneResources);
        return;
      }

      this.sceneResources = sceneResources;

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

  private async createSceneResources(
    presentationFormat: GPUTextureFormat,
  ): Promise<WebGpuSceneResources> {
    const { mesh, shaderCode } = await this.loadSceneAssets();
    const device = this.getDeviceOrThrow();
    const shaderModule = this.createShaderModule(shaderCode);
    const vertexBuffer = this.createVertexBuffer(device, mesh);
    const {
      indexBuffer,
      indexCount,
      indexFormat,
    } = this.createIndexBuffer(device, mesh);
    const uniformValues = createUniformValues(this.program.uniformBufferByteLength);
    const uniformBuffer = device.createBuffer({
      label: `${this.program.label}-uniform-buffer`,
      size: this.program.uniformBufferByteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const pipeline = this.createRenderPipeline(shaderModule, presentationFormat);
    const bindGroup = device.createBindGroup({
      label: `${this.program.label}-bind-group`,
      layout: pipeline.getBindGroupLayout(this.program.bindGroupIndex),
      entries: this.program.createBindGroupEntries({
        uniformBuffer,
      }),
    });

    return {
      vertexBuffer,
      indexBuffer,
      uniformBuffer,
      uniformValues,
      pipeline,
      bindGroup,
      indexCount,
      indexFormat,
    };
  }

  private async loadSceneAssets(): Promise<{
    mesh: ObjMesh;
    shaderCode: string;
  }> {
    this.updateStatus({
      phase: "initializing",
      message: "正在加载场景资源...",
    });

    const [modelResponse, shaderResponse] = await Promise.all([
      fetch(this.modelUrl),
      fetch(this.program.shaderUrl),
    ]);

    if (!modelResponse.ok) {
      throw new Error(
        `加载 OBJ 失败：${modelResponse.status} ${modelResponse.statusText || "未知错误"}`,
      );
    }

    if (!shaderResponse.ok) {
      throw new Error(
        `加载 Shader 失败：${shaderResponse.status} ${shaderResponse.statusText || "未知错误"}`,
      );
    }

    const [modelText, shaderCode] = await Promise.all([
      modelResponse.text(),
      shaderResponse.text(),
    ]);
    const mesh = parseObj(modelText);

    fitMeshToUnitCube(mesh.vertices);

    return {
      mesh,
      shaderCode,
    };
  }

  private createShaderModule(shaderCode: string): GPUShaderModule {
    const device = this.getDeviceOrThrow();

    return device.createShaderModule({
      label: `${this.program.label}-shader`,
      code: shaderCode,
    });
  }

  private createVertexBuffer(device: GPUDevice, mesh: ObjMesh): GPUBuffer {
    const vertexBuffer = device.createBuffer({
      label: `${this.program.label}-vertex-buffer`,
      size: mesh.vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });

    new Float32Array(vertexBuffer.getMappedRange()).set(mesh.vertices);
    vertexBuffer.unmap();

    return vertexBuffer;
  }

  private createIndexBuffer(
    device: GPUDevice,
    mesh: ObjMesh,
  ): {
    indexBuffer: GPUBuffer;
    indexCount: number;
    indexFormat: GPUIndexFormat;
  } {
    const indexBuffer = device.createBuffer({
      label: `${this.program.label}-index-buffer`,
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

  private createRenderPipeline(
    shaderModule: GPUShaderModule,
    presentationFormat: GPUTextureFormat,
  ): GPURenderPipeline {
    const device = this.getDeviceOrThrow();
    const pipelineDescriptor = this.createRenderPipelineDescriptor(
      shaderModule,
      presentationFormat,
    );

    return device.createRenderPipeline(pipelineDescriptor);
  }

  private createRenderPipelineDescriptor(
    shaderModule: GPUShaderModule,
    presentationFormat: GPUTextureFormat,
  ): GPURenderPipelineDescriptor {
    return {
      label: `${this.program.label}-render-pipeline`,
      layout: "auto",
      vertex: {
        module: shaderModule,
        entryPoint: this.program.vertexEntryPoint,
        buffers: this.program.vertexBufferLayouts,
      },
      fragment: {
        module: shaderModule,
        entryPoint: this.program.fragmentEntryPoint,
        targets: [
          {
            format: presentationFormat,
          },
        ],
      },
      primitive: this.program.primitive,
      depthStencil: this.program.depthStencil,
    };
  }

  private renderFrame(timestamp: DOMHighResTimeStamp): void {
    const device = this.device;
    const context = this.context;
    const sceneResources = this.sceneResources;

    if (
      this.isDisposed ||
      device === null ||
      context === null ||
      sceneResources === null
    ) {
      return;
    }

    const { width, height } = this.ensureDrawableSize(device);
    const aspectRatio = width / height;

    this.program.writeFrameUniforms({
      uniformValues: sceneResources.uniformValues,
      timestamp,
      aspectRatio,
      cameraDistance: this.cameraDistance,
      rotationSpeedX: this.rotationSpeedX,
      rotationSpeedY: this.rotationSpeedY,
    });

    device.queue.writeBuffer(
      sceneResources.uniformBuffer,
      0,
      sceneResources.uniformValues,
    );

    const commandEncoder = device.createCommandEncoder({
      label: `${this.program.label}-command-encoder`,
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
        view: this.depthTexture!.createView(),
        depthClearValue: 1,
        depthLoadOp: "clear",
        depthStoreOp: "store",
      },
    });

    renderPass.setPipeline(sceneResources.pipeline);
    renderPass.setBindGroup(this.program.bindGroupIndex, sceneResources.bindGroup);
    renderPass.setVertexBuffer(0, sceneResources.vertexBuffer);
    renderPass.setIndexBuffer(sceneResources.indexBuffer, sceneResources.indexFormat);
    renderPass.drawIndexed(sceneResources.indexCount);
    renderPass.end();

    this.printCounter++;
    if (this.printCounter % 100 === 0) {
      console.log("commandEncoder", commandEncoder);
    }

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
      label: `${this.program.label}-depth-texture`,
      size: [nextWidth, nextHeight],
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    return { width: nextWidth, height: nextHeight };
  }

  private destroySceneResources(
    sceneResources: WebGpuSceneResources | null = this.sceneResources,
  ): void {
    if (sceneResources === null) {
      return;
    }

    sceneResources.vertexBuffer.destroy();
    sceneResources.indexBuffer.destroy();
    sceneResources.uniformBuffer.destroy();

    if (sceneResources === this.sceneResources) {
      this.sceneResources = null;
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

  private getDeviceOrThrow(): GPUDevice {
    if (this.device === null) {
      throw new Error("WebGPU 设备尚未初始化。");
    }

    return this.device;
  }
}
