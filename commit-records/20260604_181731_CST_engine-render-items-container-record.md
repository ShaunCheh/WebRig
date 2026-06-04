# 20260604_181731_CST_engine-render-items-container-record

## 记录依据

本记录基于以下事实来源整理：

- 系统命令 `date "+%Y%m%d_%H%M%S_%Z"` 的结果：`20260604_181731_CST`
- 当前工作区 `git status --short`
- `git diff -- src/lib/webgpu/webgpu-engine.ts`

下面不直接粘贴原始 `git diff`，而是按“修改前 / 修改后”的方式，如实记录刚刚这次对 `WebGpuEngine` 的重构。

截至记录时，当前工作区中与本次改动直接相关的 `changes` 如下：

- `M src/lib/webgpu/webgpu-engine.ts`

## 本次修改的事实概览

这次修改不是单纯把 `overlay` 的绘制语句抽到一个 helper 里，而是把 `WebGpuEngine` 从“直接持有并驱动主模型 + overlay 细节”的结构，改成“持有一组可遍历的 render item，并在帧循环里统一调用它们”的结构。

这次改动落到代码上，核心有四点：

1. 新增 `WebGpuRenderItem`、`WebGpuRenderItemInitializeContext`、`WebGpuRenderItemFrameContext` 三个抽象。
2. 把主模型和 `overlay` 各自变成独立的 render item。
3. 把 `renderFrame()` 从硬编码 draw 顺序，改成统一遍历 `prepareFrame()` / `encodeRenderPass()`。
4. 把初始化与销毁从 `sceneResources` 单体资源，改成 `renderItems` 生命周期管理。

## 变更一：Engine 的核心持有物从 `sceneResources` 变为 `renderItems`

### 修改前

```ts
// 文件路径: src/lib/webgpu/webgpu-engine.ts
// 函数: WebGpuEngine.constructor / WebGpuEngine.dispose
// 功能: 修改前 Engine 自己持有模型地址、program、旋转参数以及 sceneResources，说明具体绘制对象的配置和资源都堆在 Engine 内部。
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

  public constructor(options: WebGpuEngineOptions) {
    this.canvas = options.canvas;
    this.modelUrl = options.modelUrl;
    this.program = options.program;
    this.cameraDistance = options.cameraDistance;
    this.rotationSpeedX = options.rotationSpeedX;
    this.rotationSpeedY = options.rotationSpeedY;
    this.clearColor = options.clearColor;
    this.onStatusChange = options.onStatusChange;
  }

  public dispose(): void {
    this.isDisposed = true;
    window.cancelAnimationFrame(this.animationFrameId);
    this.destroySceneResources();
    this.destroyDepthTexture();
  }
}
```

### 修改后

```ts
// 文件路径: src/lib/webgpu/webgpu-engine.ts
// 函数: WebGpuEngine.constructor / WebGpuEngine.dispose
// 功能: 修改后 Engine 只保留画布、设备相关状态和 renderItems 容器，具体可绘制对象由容器统一管理和销毁。
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
  }

  public dispose(): void {
    this.isDisposed = true;
    window.cancelAnimationFrame(this.animationFrameId);
    this.destroyRenderItems();
    this.destroyDepthTexture();
  }
}
```

这部分变化说明：`Engine` 不再把“有哪些对象要画、这些对象各自需要哪些资源”硬编码进自己的字段里，而是转成一个明确的渲染项容器。

## 变更二：新增 render item 抽象，并把主模型 / overlay 的职责下沉

### 修改前

```ts
// 文件路径: src/lib/webgpu/webgpu-engine.ts
// 函数: WebGpuEngine.createSceneResources / WebGpuEngine.updateOverlayVertexData / WebGpuEngine.drawOverlay
// 功能: 修改前主模型和 overlay 的资源创建、每帧更新、编码绘制都由 Engine 自己的私有方法直接处理。
type WebGpuOverlayResources = {
  vertexBuffer: GPUBuffer;
  vertexData: Float32Array<ArrayBuffer>;
  pipeline: GPURenderPipeline;
  vertexCount: number;
};

type WebGpuSceneResources = {
  vertexBuffer: GPUBuffer;
  indexBuffer: GPUBuffer;
  uniformBuffer: GPUBuffer;
  uniformValues: Float32Array<ArrayBuffer>;
  pipeline: GPURenderPipeline;
  bindGroup: GPUBindGroup;
  indexCount: number;
  indexFormat: GPUIndexFormat;
  overlayResources: WebGpuOverlayResources;
};

private updateOverlayVertexData(
  overlayResources: WebGpuOverlayResources,
  width: number,
  height: number,
): void {
  // ... 根据画布尺寸计算 overlay 顶点 ...
}

private drawOverlay(
  renderPass: GPURenderPassEncoder,
  overlayResources: WebGpuOverlayResources,
): void {
  renderPass.setPipeline(overlayResources.pipeline);
  renderPass.setVertexBuffer(0, overlayResources.vertexBuffer);
  renderPass.draw(overlayResources.vertexCount);
}
```

### 修改后

```ts
// 文件路径: src/lib/webgpu/webgpu-engine.ts
// 函数: WebGpuRenderItem / createRotatingMeshRenderItem / createOverlayRenderItem
// 功能: 修改后初始化、每帧准备、编码 render pass、销毁等职责下沉到 render item 自身，Engine 只负责统一调度。
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

function createRotatingMeshRenderItem(
  options: WebGpuMeshRenderItemOptions,
): WebGpuRenderItem {
  return {
    async initialize({ device, presentationFormat }) {
      // ... 加载 mesh / shader，创建 vertex/index/uniform/pipeline/bindGroup ...
    },
    prepareFrame(frameContext) {
      // ... 写入主模型 uniform，并上传 uniform buffer ...
    },
    encodeRenderPass(renderPass) {
      // ... 编码 indexed draw，负责旋转体绘制 ...
    },
    dispose() {
      // ... 释放旋转体使用的 GPU buffer ...
    },
  };
}

function createOverlayRenderItem(): WebGpuRenderItem {
  return {
    async initialize({ device, presentationFormat }) {
      // ... 加载 overlay shader，创建 overlay pipeline 与 vertex buffer ...
    },
    prepareFrame(frameContext) {
      // ... 更新屏幕空间顶点，并上传 overlay vertex buffer ...
    },
    encodeRenderPass(renderPass) {
      // ... 编码 overlay 的 draw 调用 ...
    },
    dispose() {
      // ... 释放 overlay 使用的 GPU buffer ...
    },
  };
}
```

这部分变化说明：原本分散在 `Engine` 内部的“主模型逻辑”和“overlay 逻辑”，现在都被收口成统一接口上的两个实例，职责边界更清楚。

## 变更三：`renderFrame()` 从硬编码 draw 顺序改成遍历 render item

### 修改前

```ts
// 文件路径: src/lib/webgpu/webgpu-engine.ts
// 函数: WebGpuEngine.renderFrame
// 功能: 修改前 renderFrame 自己知道主模型和 overlay 的更新顺序、buffer 上传顺序以及具体 draw 顺序。
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

  this.updateOverlayVertexData(sceneResources.overlayResources, width, height);

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
  device.queue.writeBuffer(
    sceneResources.overlayResources.vertexBuffer,
    0,
    sceneResources.overlayResources.vertexData,
  );

  // ... 创建 commandEncoder / renderPass ...

  renderPass.setPipeline(sceneResources.pipeline);
  renderPass.setBindGroup(this.program.bindGroupIndex, sceneResources.bindGroup);
  renderPass.setVertexBuffer(0, sceneResources.vertexBuffer);
  renderPass.setIndexBuffer(sceneResources.indexBuffer, sceneResources.indexFormat);
  renderPass.drawIndexed(sceneResources.indexCount);
  this.drawOverlay(renderPass, sceneResources.overlayResources);
  renderPass.end();
}
```

### 修改后

```ts
// 文件路径: src/lib/webgpu/webgpu-engine.ts
// 函数: WebGpuEngine.renderFrame
// 功能: 修改后 renderFrame 只负责组织一帧上下文、遍历 render item，并统一提交 render pass，不再知道具体对象怎么画。
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
    // ... color / depth attachment 配置保持在 Engine 内部统一管理 ...
  });

  for (const renderItem of this.renderItems) {
    renderItem.encodeRenderPass(renderPass, frameContext);
  }

  renderPass.end();
  device.queue.submit([commandEncoder.finish()]);
}
```

这部分变化说明：`renderFrame()` 的角色从“写死每个 draw call”变成“搭建帧上下文并调度 render item”，符合这次“Engine 有一个容器，遍历后逐个调用 encodeXXX”的改动目标。

## 变更四：初始化与销毁从 `sceneResources` 单体流程改成 `renderItems` 生命周期流程

### 修改前

```ts
// 文件路径: src/lib/webgpu/webgpu-engine.ts
// 函数: WebGpuEngine.initialize / WebGpuEngine.destroySceneResources
// 功能: 修改前初始化时一次性创建 sceneResources，销毁时也按 sceneResources 结构手动释放资源。
private async initialize(): Promise<void> {
  // ... 省略设备与 context 初始化 ...
  const sceneResources = await this.createSceneResources(presentationFormat);

  if (this.isDisposed) {
    this.destroySceneResources(sceneResources);
    return;
  }

  this.sceneResources = sceneResources;
  this.animationFrameId = window.requestAnimationFrame(this.renderFrame);
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
  sceneResources.overlayResources.vertexBuffer.destroy();
}
```

### 修改后

```ts
// 文件路径: src/lib/webgpu/webgpu-engine.ts
// 函数: WebGpuEngine.initialize / WebGpuEngine.initializeRenderItems / WebGpuEngine.destroyRenderItems
// 功能: 修改后初始化和销毁统一按 render item 生命周期遍历执行，不再依赖单个 sceneResources 聚合对象。
private async initialize(): Promise<void> {
  // ... 省略设备与 context 初始化 ...
  this.updateStatus({
    phase: "initializing",
    message: "正在加载场景资源...",
  });

  await this.initializeRenderItems(device, presentationFormat);

  if (this.isDisposed) {
    this.destroyRenderItems();
    return;
  }

  this.animationFrameId = window.requestAnimationFrame(this.renderFrame);
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

private destroyRenderItems(): void {
  for (const renderItem of this.renderItems) {
    renderItem.dispose();
  }
}
```

这部分变化说明：初始化和回收不再耦合在 `sceneResources` 这个聚合结构上，而是改成对每个 render item 的生命周期调度。

## 结果总结

结合当前 `changes` 和 `git diff`，这次刚刚的修改已经把 `WebGpuEngine` 的渲染结构改成了下面这种职责关系：

- `Engine` 负责 `device/context/pass/frame` 的外层调度。
- `RotatingMeshRenderItem` 负责主模型的资源、uniform 更新和 indexed draw。
- `OverlayRenderItem` 负责 overlay 的资源、屏幕空间顶点更新和 draw。

也就是说，这次改动已经把“待绘制的东西，对外提供 encodeXXX，然后在 renderFrame 里遍历调用”的目标，实打实落到了 `src/lib/webgpu/webgpu-engine.ts` 的当前实现里。

## 验证情况

- 已检查 `src/lib/webgpu/webgpu-engine.ts` 的 lints：无新增问题。
- 已执行 `npm run typecheck`：通过。
