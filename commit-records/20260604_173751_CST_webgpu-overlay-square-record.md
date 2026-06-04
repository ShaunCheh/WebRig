# 20260604_173751_CST_webgpu-overlay-square-record

## 记录依据

本记录基于当前工作区 `changes` 与相关文件的 `git diff` 整理，不直接粘贴原始 diff，而是按“修改前 / 修改后”的方式，如实记录刚刚这次在 `WebGPU` 画面左上角增加正方形 `overlay` 的改动。

截至记录时，当前工作区中与本次改动直接相关的文件状态如下：

- `M src/lib/webgpu/webgpu-engine.ts`
- `?? public/shaders/overlay-square.wgsl`

当前工作区里还存在一个附带变化：

- `M next-env.d.ts`

这个 `next-env.d.ts` 变化是构建后带出的工作区变化，不属于本次 `overlay` 实现本身，下面会单独标注，不与本次功能改动混写。

## 当前 changes 概览

本次“刚刚的修改”核心上做了两件事：

1. 在 `src/lib/webgpu/webgpu-engine.ts` 内新增一套 `overlay` 资源与绘制逻辑，在同一个 `canvas`、同一个 `render pass` 里，追加绘制左上角正方形。
2. 新增 `public/shaders/overlay-square.wgsl`，作为 `overlay` 这条绘制路径对应的独立 `WGSL` shader。

这次不是用 `DOM` 覆盖层伪装，而是走现有 `WebGPU engine` 的真实 GPU 渲染链路。

## 变更一：场景资源结构从“只有主模型资源”扩展为“主模型资源 + overlay 资源”

### 修改前

```ts
// 文件路径: src/lib/webgpu/webgpu-engine.ts
// 函数: WebGpuEngine.createSceneResources / WebGpuSceneResources
// 功能: 修改前场景资源只有主模型渲染需要的 vertex/index/uniform/pipeline/bindGroup，不包含 overlay 的独立资源。
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
```

### 修改后

```ts
// 文件路径: src/lib/webgpu/webgpu-engine.ts
// 函数: WebGpuEngine.createSceneResources / WebGpuSceneResources
// 功能: 修改后场景资源被扩展为“主模型资源 + overlay 资源”，使 engine 能在主模型绘制后继续画一个屏幕空间正方形。
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

private async createSceneResources(
  presentationFormat: GPUTextureFormat,
): Promise<WebGpuSceneResources> {
  const { mesh, shaderCode, overlayShaderCode } = await this.loadSceneAssets();
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
  const overlayResources = this.createOverlayResources(
    device,
    presentationFormat,
    overlayShaderCode,
  );

  return {
    vertexBuffer,
    indexBuffer,
    uniformBuffer,
    uniformValues,
    pipeline,
    bindGroup,
    indexCount,
    indexFormat,
    overlayResources,
  };
}
```

这部分变化说明：`overlay` 不再是外部层叠物，而是被显式纳入 `engine` 自己维护的 GPU 场景资源里。

## 变更二：场景资源加载从“模型 + 主 shader”扩展为“模型 + 主 shader + overlay shader”

### 修改前

```ts
// 文件路径: src/lib/webgpu/webgpu-engine.ts
// 函数: WebGpuEngine.loadSceneAssets
// 功能: 修改前只加载模型和主渲染 shader，不加载任何 overlay 专用 shader。
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
```

### 修改后

```ts
// 文件路径: src/lib/webgpu/webgpu-engine.ts
// 函数: WebGpuEngine.loadSceneAssets
// 功能: 修改后会在初始化阶段并行加载模型、主 shader 和 overlay shader，并把 overlayShaderCode 一并返回。
const overlayShaderUrl = "/shaders/overlay-square.wgsl";

private async loadSceneAssets(): Promise<{
  mesh: ObjMesh;
  shaderCode: string;
  overlayShaderCode: string;
}> {
  this.updateStatus({
    phase: "initializing",
    message: "正在加载场景资源...",
  });

  const [modelResponse, shaderResponse, overlayShaderResponse] = await Promise.all([
    fetch(this.modelUrl),
    fetch(this.program.shaderUrl),
    fetch(overlayShaderUrl),
  ]);

  if (!overlayShaderResponse.ok) {
    throw new Error(
      `加载 Overlay Shader 失败：${overlayShaderResponse.status} ${overlayShaderResponse.statusText || "未知错误"}`,
    );
  }

  const [modelText, shaderCode, overlayShaderCode] = await Promise.all([
    modelResponse.text(),
    shaderResponse.text(),
    overlayShaderResponse.text(),
  ]);
  const mesh = parseObj(modelText);

  fitMeshToUnitCube(mesh.vertices);

  return {
    mesh,
    shaderCode,
    overlayShaderCode,
  };
}
```

这部分变化说明：overlay 的 shader 资源和主场景资源一起进入了初始化链路。

## 变更三：新增 overlay 的 GPU 资源创建、顶点更新和绘制流程

### 修改前

```ts
// 文件路径: src/lib/webgpu/webgpu-engine.ts
// 函数: renderFrame
// 功能: 修改前 renderFrame 只更新主模型的 uniform，并只绘制主模型一次 indexed draw。
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
    // ... 颜色和深度附件描述 ...
  });

  renderPass.setPipeline(sceneResources.pipeline);
  renderPass.setBindGroup(this.program.bindGroupIndex, sceneResources.bindGroup);
  renderPass.setVertexBuffer(0, sceneResources.vertexBuffer);
  renderPass.setIndexBuffer(sceneResources.indexBuffer, sceneResources.indexFormat);
  renderPass.drawIndexed(sceneResources.indexCount);
  renderPass.end();

  device.queue.submit([commandEncoder.finish()]);
}
```

### 修改后

```ts
// 文件路径: src/lib/webgpu/webgpu-engine.ts
// 函数: createOverlayResources / updateOverlayVertexData / drawOverlay / renderFrame
// 功能: 修改后 engine 会在同一个 render pass 中，先画主模型，再画一个屏幕空间的左上角正方形 overlay。
const overlayVertexStride = 5 * Float32Array.BYTES_PER_ELEMENT;
const overlayVertexCount = 6;
const overlayPaddingPx = 16;
const overlaySizePx = 96;
const overlayColor = {
  r: 0.95,
  g: 0.35,
  b: 0.35,
} as const;

private createOverlayResources(
  device: GPUDevice,
  presentationFormat: GPUTextureFormat,
  overlayShaderCode: string,
): WebGpuOverlayResources {
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
            { shaderLocation: 0, offset: 0, format: "float32x2" },
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
      targets: [{ format: presentationFormat }],
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

private updateOverlayVertexData(
  overlayResources: WebGpuOverlayResources,
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

  // 关键点: 用屏幕像素换算到 NDC，生成两个三角形组成的矩形。
  overlayResources.vertexData.set([
    leftNdc, topNdc, overlayColor.r, overlayColor.g, overlayColor.b,
    rightNdc, topNdc, overlayColor.r, overlayColor.g, overlayColor.b,
    rightNdc, bottomNdc, overlayColor.r, overlayColor.g, overlayColor.b,
    leftNdc, topNdc, overlayColor.r, overlayColor.g, overlayColor.b,
    rightNdc, bottomNdc, overlayColor.r, overlayColor.g, overlayColor.b,
    leftNdc, bottomNdc, overlayColor.r, overlayColor.g, overlayColor.b,
  ], 0);
}

private drawOverlay(
  renderPass: GPURenderPassEncoder,
  overlayResources: WebGpuOverlayResources,
): void {
  renderPass.setPipeline(overlayResources.pipeline);
  renderPass.setVertexBuffer(0, overlayResources.vertexBuffer);
  renderPass.draw(overlayResources.vertexCount);
}

private renderFrame(timestamp: DOMHighResTimeStamp): void {
  // ... 主场景前置逻辑省略 ...
  this.updateOverlayVertexData(sceneResources.overlayResources, width, height);

  device.queue.writeBuffer(
    sceneResources.overlayResources.vertexBuffer,
    0,
    sceneResources.overlayResources.vertexData,
  );

  renderPass.setPipeline(sceneResources.pipeline);
  renderPass.setBindGroup(this.program.bindGroupIndex, sceneResources.bindGroup);
  renderPass.setVertexBuffer(0, sceneResources.vertexBuffer);
  renderPass.setIndexBuffer(sceneResources.indexBuffer, sceneResources.indexFormat);
  renderPass.drawIndexed(sceneResources.indexCount);

  this.drawOverlay(renderPass, sceneResources.overlayResources);
  renderPass.end();
}
```

这部分变化说明：overlay 方块是作为第二条 GPU 绘制路径加入的，而且是同一个 render pass 里的追加绘制，不是额外的 HTML 层。

## 变更四：新增 overlay 的独立 WGSL 文件

### 修改前

```wgsl
// 文件路径: public/shaders/overlay-square.wgsl
// 函数: 修改前文件不存在
// 功能: 修改前仓库中没有专门给左上角方块 overlay 使用的独立 shader 文件。
```

### 修改后

```wgsl
// 文件路径: public/shaders/overlay-square.wgsl
// 函数: vsMain / fsMain
// 功能: 提供 overlay 方块使用的极简 2D shader，直接把 NDC 坐标输出到裁剪空间，并透传颜色。
struct VertexInput {
  @location(0) position: vec2<f32>,
  @location(1) color: vec3<f32>,
};

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) color: vec3<f32>,
};

@vertex
fn vsMain(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  output.position = vec4<f32>(input.position, 0.0, 1.0);
  output.color = input.color;
  return output;
}

@fragment
fn fsMain(input: VertexOutput) -> @location(0) vec4<f32> {
  return vec4<f32>(input.color, 1.0);
}
```

这一步把 overlay 的 shader 契约与主场景 shader 清晰分开了。

## 当前工作区中的附带变化（非 overlay 功能本身）

当前工作区里还存在一个附带变化：

```ts
// 文件路径: next-env.d.ts
// 函数: N/A
// 功能: 当前工作区中该文件的 routes 类型引用路径发生了切换，这是构建带出的副作用，不属于本次 overlay 功能实现本身。
/// <reference types="next" />
/// <reference types="next/image-types/global" />
import "./.next/types/routes.d.ts";
```

本记录如实注明它存在，但不会把它归因到“左上角 overlay 方块”这次功能改动。

## 验证情况

本次修改完成后，已经执行并通过以下检查：

1. `npm run lint`
2. `npm run typecheck`
3. `npm run build`

## 结论

本次“刚刚的修改”本质上是在现有 `WebGPU engine` 内部新增了一条独立的 `overlay` 绘制路径：

1. `engine` 现在会额外维护 `overlay` 的顶点缓冲、pipeline 和顶点数据。
2. 每帧会根据当前画布尺寸把左上角正方形换算到 `NDC`，再上传到 GPU。
3. 主模型绘制完成后，会在同一个 `render pass` 中追加一次 `draw()`，画出这个左上角方块。
4. `overlay-square.wgsl` 提供了对应的独立 shader，实现了真正的 GPU 叠加层，而不是 DOM 覆盖层。
