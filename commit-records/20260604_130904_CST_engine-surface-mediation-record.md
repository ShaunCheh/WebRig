# 20260604_130904_CST_engine-surface-mediation-record

## 记录依据

本记录基于当前工作区 `changes` 与相关文件的 `git diff` 整理，不直接粘贴原始 diff，而是按“修改前 / 修改后”的方式，如实记录刚刚这次把 `GPU` 初始化与渲染驱动迁移到 `engine`，并将 `WebGpuSurface` 退化为媒介层的改动。

截至记录时，当前工作区中与本次改动直接相关的文件状态如下：

- `M src/components/webgpu/webgpu-surface.tsx`
- `M src/lib/webgpu/programs/basic-lit-program.ts`
- `M src/lib/webgpu/programs/types.ts`
- `?? src/lib/webgpu/webgpu-engine.ts`

本次记录只覆盖上述 4 个文件，不将其他未参与本轮重构的文件混入进来。

## 当前 changes 概览

本轮改动的核心事实是：

1. `WebGpuSurface` 不再直接负责 `WebGPU` 初始化、资源加载、pipeline 创建、渲染循环与资源销毁。
2. 新增 `WebGpuEngine`，统一接管 `GPU` 生命周期与渲染执行。
3. `basicLitProgram` 中原先保留的箭头函数字段实现，被提取成具名函数。
4. `WebGpuProgramDefinition` 的函数型字段声明，也从箭头签名改成了方法签名风格。

## 变更一：`WebGpuSurface` 从“宿主 + 初始化 + 渲染执行”改为“媒介 + 状态展示”

### 修改前

```ts
// 文件路径: src/components/webgpu/webgpu-surface.tsx
// 函数: WebGpuSurface
// 功能: 修改前 WebGpuSurface 直接承担 GPU 初始化、资源加载、pipeline 创建、每帧 draw 和销毁逻辑。
import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { fitMeshToUnitCube, parseObj } from "@/lib/loaders/obj-loader";
import type { WebGpuProgramDefinition } from "@/lib/webgpu/programs/types";

type Status =
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

export function WebGpuSurface({
  modelUrl,
  program,
  // ... 省略其他 props ...
}: WebGpuSurfaceProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState<Status>({
    phase: "initializing",
    message: "正在初始化 WebGPU...",
  });

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    // 关键点: 修改前这里直接写了 GPU 初始化、资源加载、
    // pipeline 创建、bind group 创建、render loop 和 dispose。
    // const adapter = await navigator.gpu.requestAdapter();
    // const mesh = parseObj(modelText);
    // const pipeline = device.createRenderPipeline(...);
    // renderPass.drawIndexed(indexCount);
  }, [
    // ... 依赖项 ...
  ]);
}
```

### 修改后

```ts
// 文件路径: src/components/webgpu/webgpu-surface.tsx
// 函数: createClearColor / WebGpuSurface / setupSurfaceEngine / cleanupSurfaceEngine
// 功能: 修改后 WebGpuSurface 只负责组织 canvas、状态展示和 engine 装配，不再直接处理 GPU 生命周期。
import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import {
  WebGpuEngine,
  type WebGpuClearColor,
  type WebGpuEngineStatus,
} from "@/lib/webgpu/webgpu-engine";
import type { WebGpuProgramDefinition } from "@/lib/webgpu/programs/types";

function createClearColor(
  clearColor: WebGpuSurfaceClearColor | undefined,
): WebGpuClearColor {
  return {
    r: clearColor?.r ?? defaultClearColor.r,
    g: clearColor?.g ?? defaultClearColor.g,
    b: clearColor?.b ?? defaultClearColor.b,
    a: clearColor?.a ?? defaultClearColor.a,
  };
}

export function WebGpuSurface({
  modelUrl,
  program,
  cameraDistance = -5,
  rotationSpeedX = 0.0007,
  rotationSpeedY = 0.001,
  clearColor,
}: WebGpuSurfaceProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState<WebGpuEngineStatus>({
    phase: "initializing",
    message: "正在初始化 WebGPU...",
  });

  useEffect(function setupSurfaceEngine() {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const normalizedClearColor = createClearColor({
      r: clearColor?.r ?? defaultClearColor.r,
      g: clearColor?.g ?? defaultClearColor.g,
      b: clearColor?.b ?? defaultClearColor.b,
      a: clearColor?.a ?? defaultClearColor.a,
    });

    function handleEngineStatusChange(nextStatus: WebGpuEngineStatus): void {
      setStatus(nextStatus);
    }

    const engine = new WebGpuEngine({
      canvas,
      modelUrl,
      program,
      cameraDistance,
      rotationSpeedX,
      rotationSpeedY,
      clearColor: normalizedClearColor,
      onStatusChange: handleEngineStatusChange,
    });

    void engine.start();

    return function cleanupSurfaceEngine(): void {
      engine.dispose();
    };
  }, [
    cameraDistance,
    clearColor?.a ?? defaultClearColor.a,
    clearColor?.b ?? defaultClearColor.b,
    clearColor?.g ?? defaultClearColor.g,
    clearColor?.r ?? defaultClearColor.r,
    modelUrl,
    program,
    rotationSpeedX,
    rotationSpeedY,
  ]);
}
```

这部分变化的核心事实是：`WebGpuSurface` 已经从“自己干所有活”的组件，退化成了“承载 canvas + 状态 UI + 启停 engine”的媒介层。

## 变更二：新增 `WebGpuEngine`，统一接管 GPU 初始化、资源加载、pipeline 创建、render loop 和销毁

### 修改前

```ts
// 文件路径: src/lib/webgpu/webgpu-engine.ts
// 位置: 修改前文件不存在
// 功能: 修改前仓库中没有独立 engine 层，所有 GPU 初始化与执行逻辑都堆在 WebGpuSurface 内部。
// 修改前: 文件不存在。
```

### 修改后

```ts
// 文件路径: src/lib/webgpu/webgpu-engine.ts
// 函数: WebGpuEngine.constructor / start / initialize / loadSceneAssets / renderFrame / dispose
// 功能: 新增 engine 层，集中管理 WebGPU 生命周期、场景资源加载、pipeline 创建、每帧绘制和销毁逻辑。
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

export class WebGpuEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly modelUrl: string;
  private readonly program: WebGpuProgramDefinition;
  private readonly cameraDistance: number;
  private readonly rotationSpeedX: number;
  private readonly rotationSpeedY: number;
  private readonly clearColor: WebGpuClearColor;
  private readonly onStatusChange: WebGpuEngineOptions["onStatusChange"];

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
    window.cancelAnimationFrame(this.animationFrameId);
    this.destroySceneResources();
    this.destroyDepthTexture();
    this.device?.destroy();
  }

  private async initialize(): Promise<void> {
    // 负责 adapter/device/context 初始化
    // 负责 createSceneResources()
    // 负责启动 requestAnimationFrame
  }

  private async loadSceneAssets(): Promise<{
    mesh: ObjMesh;
    shaderCode: string;
  }> {
    // 负责加载 model + shader，并执行 parseObj / fitMeshToUnitCube
  }

  private renderFrame(timestamp: DOMHighResTimeStamp): void {
    // 负责每帧 write uniform、beginRenderPass、drawIndexed
  }
}
```

这一部分是本轮重构的真正中心。改造后，`engine` 成为了 GPU 初始化与渲染执行的唯一入口。

## 变更三：`basicLitProgram` 中保留的箭头函数字段实现，改为具名函数

### 修改前

```ts
// 文件路径: src/lib/webgpu/programs/basic-lit-program.ts
// 符号: basicLitProgram.createBindGroupEntries / basicLitProgram.writeFrameUniforms
// 功能: 修改前 program 对象里的两个行为字段仍然以内联箭头函数形式存在，可读性较差。
export const basicLitProgram: WebGpuProgramDefinition = {
  // ... 省略其他字段 ...
  createBindGroupEntries: ({ uniformBuffer }) => [
    {
      binding: 0,
      resource: {
        buffer: uniformBuffer,
      },
    },
  ],
  writeFrameUniforms: ({
    uniformValues,
    timestamp,
    aspectRatio,
    cameraDistance,
    rotationSpeedX,
    rotationSpeedY,
  }) => {
    const projectionMatrix = createPerspectiveMat4(
      Math.PI / 4,
      aspectRatio,
      0.1,
      100,
    );
    // ... 省略矩阵计算 ...
    uniformValues.set(modelViewProjectionMatrix, 0);
    uniformValues.set(modelMatrix, 16);
  },
};
```

### 修改后

```ts
// 文件路径: src/lib/webgpu/programs/basic-lit-program.ts
// 函数: createBasicLitBindGroupEntries / writeBasicLitFrameUniforms
// 功能: 修改后把 program 的行为从对象内联箭头函数，提取为具名函数，再回填给 program 对象。
function createBasicLitBindGroupEntries({
  uniformBuffer,
}: WebGpuProgramBindGroupArgs): GPUBindGroupEntry[] {
  return [
    {
      binding: 0,
      resource: {
        buffer: uniformBuffer,
      },
    },
  ];
}

function writeBasicLitFrameUniforms({
  uniformValues,
  timestamp,
  aspectRatio,
  cameraDistance,
  rotationSpeedX,
  rotationSpeedY,
}: WebGpuProgramFrameUniformArgs): void {
  const projectionMatrix = createPerspectiveMat4(
    Math.PI / 4,
    aspectRatio,
    0.1,
    100,
  );
  // ... 省略矩阵计算 ...
  uniformValues.set(modelViewProjectionMatrix, 0);
  uniformValues.set(modelMatrix, 16);
}

export const basicLitProgram: WebGpuProgramDefinition = {
  // ... 省略其他字段 ...
  createBindGroupEntries: createBasicLitBindGroupEntries,
  writeFrameUniforms: writeBasicLitFrameUniforms,
};
```

这一步的目的不是改变行为，而是把 program 层的可读性拉回到“具名行为 + 显式职责”的风格。

## 变更四：`WebGpuProgramDefinition` 的函数型字段声明，从箭头签名改为方法签名

### 修改前

```ts
// 文件路径: src/lib/webgpu/programs/types.ts
// 符号: WebGpuProgramDefinition
// 功能: 修改前 program 类型中的函数型字段使用箭头函数签名。
export type WebGpuProgramDefinition = Readonly<{
  label: string;
  shaderUrl: string;
  bindGroupIndex: number;
  vertexEntryPoint: string;
  fragmentEntryPoint: string;
  vertexBufferLayouts: GPUVertexBufferLayout[];
  uniformBufferByteLength: number;
  primitive: GPUPrimitiveState;
  depthStencil: GPUDepthStencilState;
  createBindGroupEntries: (
    args: WebGpuProgramBindGroupArgs,
  ) => GPUBindGroupEntry[];
  writeFrameUniforms: (args: WebGpuProgramFrameUniformArgs) => void;
}>;
```

### 修改后

```ts
// 文件路径: src/lib/webgpu/programs/types.ts
// 符号: WebGpuProgramDefinition
// 功能: 修改后 program 类型中的函数型字段统一改为方法签名风格，和新的具名函数实现方式保持一致。
export type WebGpuProgramDefinition = Readonly<{
  label: string;
  shaderUrl: string;
  bindGroupIndex: number;
  vertexEntryPoint: string;
  fragmentEntryPoint: string;
  vertexBufferLayouts: GPUVertexBufferLayout[];
  uniformBufferByteLength: number;
  primitive: GPUPrimitiveState;
  depthStencil: GPUDepthStencilState;
  createBindGroupEntries(args: WebGpuProgramBindGroupArgs): GPUBindGroupEntry[];
  writeFrameUniforms(args: WebGpuProgramFrameUniformArgs): void;
}>;
```

这部分变化同样主要是可读性和风格统一，不改变运行时行为。

## 验证情况

本次修改完成后，已经执行并通过以下检查：

1. `npm run lint`
2. `npm run typecheck`
3. `npm run build`

## 结论

本次“刚刚的修改”本质上是一次职责重新划分与代码风格修正：

1. 新增 `WebGpuEngine`，集中接管 GPU 初始化、资源加载、pipeline 创建、render loop 和销毁。
2. `WebGpuSurface` 退化为真正的媒介层，只保留 canvas 与状态展示。
3. `basicLitProgram` 中残留的内联箭头行为，改成了具名函数。
4. `WebGpuProgramDefinition` 的函数型字段声明也同步改成方法签名风格。

因此，当前分层已经从“surface 直接驱动 GPU”进一步演进到“engine 驱动 GPU、surface 只做承载”的结构。 
