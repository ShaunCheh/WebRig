# 20260604_185432_CST_render-items-factory-lifecycle-record

## 记录依据

本记录基于写入前通过系统 `date` 命令取得的时间戳、当前工作区 `changes`，以及相关文件的 `git diff` 与当前文件内容整理而成。

为了避免把原始 `git diff` 直接搬进记录，下面统一使用“修改前 / 修改后”的方式，如实说明这一次继续把 WebGPU 渲染抽象往下推进的过程。

截至记录时，本轮直接相关的工作区变更为：

- `M src/app/webgpu/page.tsx`
- `M src/components/webgpu/webgpu-surface.tsx`
- `M src/lib/webgpu/webgpu-engine.ts`

需要如实补充一点：`src/lib/webgpu/render-items.ts` 虽然是当前场景装配会继续调用的文件，但它没有出现在本轮 `git status` / `git diff` 中，因此本记录不把它算作“本轮已修改文件”。

## 变更一：`WebGpuEngine` 的输入边界从“render item 实例数组”改为“render item 工厂函数”

### 修改前

```ts
// 文件路径: src/lib/webgpu/webgpu-engine.ts
// 函数: WebGpuEngineOptions / WebGpuEngine.constructor
// 功能: 修改前 Engine 直接接收已经实例化完成的 renderItems，并在构造阶段立即复制到内部容器。
export type WebGpuEngineOptions = Readonly<{
  canvas: HTMLCanvasElement;
  renderItems: readonly WebGpuRenderItem[];
  clearColor: WebGpuClearColor;
  onStatusChange(status: WebGpuEngineStatus): void;
}>;

export class WebGpuEngine {
  private readonly renderItems: WebGpuRenderItem[];

  public constructor(options: WebGpuEngineOptions) {
    this.canvas = options.canvas;
    this.clearColor = options.clearColor;
    this.onStatusChange = options.onStatusChange;
    this.renderItems = [...options.renderItems];
  }
}
```

### 修改后

```ts
// 文件路径: src/lib/webgpu/webgpu-engine.ts
// 函数: WebGpuRenderItemsFactory / WebGpuEngineOptions / WebGpuEngine.constructor / initialize
// 功能: 修改后 Engine 只接收一个创建 render item 的工厂函数，并把真正的实例化时机推迟到 initialize 阶段。
export type WebGpuRenderItemsFactory = () => readonly WebGpuRenderItem[];

export type WebGpuEngineOptions = Readonly<{
  canvas: HTMLCanvasElement;
  createRenderItems: WebGpuRenderItemsFactory;
  clearColor: WebGpuClearColor;
  onStatusChange(status: WebGpuEngineStatus): void;
}>;

export class WebGpuEngine {
  private readonly createRenderItems: WebGpuEngineOptions["createRenderItems"];
  private renderItems: WebGpuRenderItem[] = [];

  public constructor(options: WebGpuEngineOptions) {
    this.canvas = options.canvas;
    this.createRenderItems = options.createRenderItems;
    this.clearColor = options.clearColor;
    this.onStatusChange = options.onStatusChange;
  }

  private async initialize(): Promise<void> {
    this.updateStatus({
      phase: "initializing",
      message: "正在初始化渲染项...",
    });

    // 初始化时再创建实例，避免在构造阶段提前绑定一组有状态对象。
    this.renderItems = [...this.createRenderItems()];
    await this.initializeRenderItems(device, presentationFormat);
  }
}
```

这部分变化的真实含义是：`Engine` 的职责继续收口，它不再接收“别人已经造好的有状态实例数组”，而是接收“如何创建一组实例”的工厂函数。这样每次 `Engine.initialize()` 都能拿到一套新的 render item，避免 mount / remount 或多实例场景下复用同一组对象。

## 变更二：`WebGpuRenderItem` 从“整套必实现接口”改为“按能力组合的可选生命周期接口”

### 修改前

```ts
// 文件路径: src/lib/webgpu/webgpu-engine.ts
// 函数: WebGpuRenderItem / initializeRenderItems / renderFrame / destroyRenderItems
// 功能: 修改前所有 render item 都必须实现 initialize、encodeRenderPass、dispose；Engine 在调用时假定这些方法一定存在。
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

for (const renderItem of this.renderItems) {
  renderItem.encodeRenderPass(renderPass, frameContext);
}

private destroyRenderItems(): void {
  for (const renderItem of this.renderItems) {
    renderItem.dispose();
  }
}
```

### 修改后

```ts
// 文件路径: src/lib/webgpu/webgpu-engine.ts
// 函数: WebGpuRenderItemInitializable / WebGpuRenderItemFramePreparable / WebGpuRenderPassEncodable / WebGpuRenderItemDisposable / initializeRenderItems / renderFrame / destroyRenderItems
// 功能: 修改后把 render item 生命周期拆成按能力组合的接口；某个对象只需要参与自己真正关心的阶段即可。
export type WebGpuRenderItemInitializable = {
  initialize?(
    context: WebGpuRenderItemInitializeContext,
  ): Promise<void> | void;
};

export type WebGpuRenderItemFramePreparable = {
  prepareFrame?(context: WebGpuRenderItemFrameContext): void;
};

export type WebGpuRenderPassEncodable = {
  encodeRenderPass?(
    renderPass: GPURenderPassEncoder,
    context: WebGpuRenderItemFrameContext,
  ): void;
};

export type WebGpuRenderItemDisposable = {
  dispose?(): void;
};

export type WebGpuRenderItem = WebGpuRenderItemInitializable &
  WebGpuRenderItemFramePreparable &
  WebGpuRenderPassEncodable &
  WebGpuRenderItemDisposable;

private async initializeRenderItems(
  device: GPUDevice,
  presentationFormat: GPUTextureFormat,
): Promise<void> {
  for (const renderItem of this.renderItems) {
    // 可选初始化: 没有 GPU 资源准备逻辑的对象，可以不实现 initialize。
    await renderItem.initialize?.({
      device,
      presentationFormat,
    });
  }
}

for (const renderItem of this.renderItems) {
  // 可选编码: 某些只做帧状态同步的对象，不必强制提供 draw 编码。
  renderItem.encodeRenderPass?.(renderPass, frameContext);
}

private destroyRenderItems(): void {
  for (const renderItem of this.renderItems) {
    // 可选释放: 没有 GPU 资源的对象，不必实现 dispose。
    renderItem.dispose?.();
  }

  // 清空内部容器，避免旧实例在失败重试或 dispose 后继续残留。
  this.renderItems = [];
}
```

这部分变化不是“换个写法”，而是把 `render item` 的最小职责边界继续往下压：`Engine` 只枚举生命周期阶段，但不再要求每个对象都背负完整接口。

## 变更三：`WebGpuSurface` 从“兼容层 + 默认组装层”继续收口为“只负责挂载 Engine 的薄组件”

### 修改前

```tsx
// 文件路径: src/components/webgpu/webgpu-surface.tsx
// 函数: WebGpuSurfaceProps / createDefaultRenderItems / resolveRenderItems / setupSurfaceEngine
// 功能: 修改前 WebGpuSurface 同时负责两件事:
// 1. 兼容 renderItems 直接注入。
// 2. 兼容 modelUrl/program 输入，并在组件内部组装默认场景。
export type WebGpuSurfaceProps = Readonly<{
  ariaLabel?: string;
  backgroundColor?: string;
  clearColor?: WebGpuSurfaceClearColor;
  style?: CSSProperties;
}> &
  (
    | Readonly<{
        renderItems: readonly WebGpuRenderItem[];
        modelUrl?: never;
        program?: never;
        cameraDistance?: never;
        rotationSpeedX?: never;
        rotationSpeedY?: never;
      }>
    | Readonly<{
        modelUrl: string;
        program: WebGpuProgramDefinition;
        cameraDistance?: number;
        rotationSpeedX?: number;
        rotationSpeedY?: number;
        renderItems?: never;
      }>
  );

const defaultRenderItems = useMemo<readonly WebGpuRenderItem[] | null>(
  function createDefaultRenderItems() {
    // 修改前默认组装逻辑仍然放在 Surface 内部。
    return [
      createRotatingMeshRenderItem({
        modelUrl,
        program,
        cameraDistance,
        rotationSpeedX,
        rotationSpeedY,
      }),
      createOverlayRenderItem(),
    ];
  },
  [renderItemsProp, modelUrl, program, cameraDistance, rotationSpeedX, rotationSpeedY],
);

const resolvedRenderItems = useMemo<readonly WebGpuRenderItem[]>(
  function resolveRenderItems() {
    // 修改前 Surface 自己还要处理“外部注入优先，否则走内部默认组装”的分支。
    return renderItemsProp ?? defaultRenderItems ?? [];
  },
  [renderItemsProp, defaultRenderItems],
);

const engine = new WebGpuEngine({
  canvas,
  renderItems: resolvedRenderItems,
  clearColor: normalizedClearColor,
  onStatusChange: handleEngineStatusChange,
});
```

### 修改后

```tsx
// 文件路径: src/components/webgpu/webgpu-surface.tsx
// 函数: WebGpuSurfaceProps / setupSurfaceEngine
// 功能: 修改后 WebGpuSurface 只接收 createRenderItems，并把它交给 Engine；它不再承担默认场景组装和参数兼容分支。
export type WebGpuSurfaceProps = Readonly<{
  createRenderItems: WebGpuRenderItemsFactory;
  ariaLabel?: string;
  backgroundColor?: string;
  clearColor?: WebGpuSurfaceClearColor;
  style?: CSSProperties;
}>;

export function WebGpuSurface(props: WebGpuSurfaceProps) {
  const {
    createRenderItems,
    ariaLabel = "WebGPU surface",
    backgroundColor = defaultBackgroundColor,
    clearColor,
    style,
  } = props;

  useEffect(function setupSurfaceEngine() {
    const normalizedClearColor = createClearColor({
      r: clearRed,
      g: clearGreen,
      b: clearBlue,
      a: clearAlpha,
    });

    const engine = new WebGpuEngine({
      canvas,
      createRenderItems,
      clearColor: normalizedClearColor,
      onStatusChange: handleEngineStatusChange,
    });

    void engine.start();

    return function cleanupSurfaceEngine(): void {
      engine.dispose();
    };
  }, [
    createRenderItems,
    clearAlpha,
    clearBlue,
    clearGreen,
    clearRed,
  ]);
}
```

这部分变化说明：`WebGpuSurface` 不再是“懂场景如何拼装”的组件，而是回到它更纯粹的角色，只负责 canvas、Engine 生命周期和状态展示。

## 变更四：页面层显式承担场景组装职责

### 修改前

```tsx
// 文件路径: src/app/webgpu/page.tsx
// 函数: WebGpuPage
// 功能: 修改前页面只传模型路径和 program；场景里到底有哪些 render item，页面层并不显式表达。
"use client";

import { WebGpuSurface } from "@/components/webgpu/webgpu-surface";
import { basicLitProgram } from "@/lib/webgpu/programs/basic-lit-program";

export default function WebGpuPage() {
  return (
    <main style={{ width: "100vw", height: "100vh" }}>
      <WebGpuSurface
        modelUrl="/models/torus.obj"
        program={basicLitProgram}
        ariaLabel="Rotating WebGPU torus"
      />
    </main>
  );
}
```

### 修改后

```tsx
// 文件路径: src/app/webgpu/page.tsx
// 函数: WebGpuPage / createWebGpuPageRenderItems
// 功能: 修改后页面层显式创建当前场景需要的 render item 工厂，把“有什么要画”直接写在页面里。
"use client";

import { useCallback } from "react";
import { WebGpuSurface } from "@/components/webgpu/webgpu-surface";
import { basicLitProgram } from "@/lib/webgpu/programs/basic-lit-program";
import {
  createOverlayRenderItem,
  createRotatingMeshRenderItem,
} from "@/lib/webgpu/render-items";

export default function WebGpuPage() {
  const createRenderItems = useCallback(function createWebGpuPageRenderItems() {
    return [
      createRotatingMeshRenderItem({
        modelUrl: "/models/torus.obj",
        program: basicLitProgram,
        cameraDistance: -5,
        rotationSpeedX: 0.0007,
        rotationSpeedY: 0.001,
      }),
      createOverlayRenderItem(),
    ] as const;
  }, []);

  return (
    <main style={{ width: "100vw", height: "100vh" }}>
      <WebGpuSurface
        createRenderItems={createRenderItems}
        ariaLabel="Rotating WebGPU torus"
      />
    </main>
  );
}
```

这里最关键的“修改后事实”是：场景描述已经正式上移到页面层。页面现在显式决定“旋转体 + overlay”这两个 render item 的存在，而 `Surface` 与 `Engine` 只负责执行这份场景装配结果。

## 本轮没有直接修改、但需要在记录里说明的事实

虽然 `src/lib/webgpu/render-items.ts` 没有出现在本轮 `git status` / `git diff` 中，但它在本轮结果里仍然是页面层组装场景时的直接依赖。换句话说，这一轮不是继续改造 render item 的具体实现，而是把“谁来决定并创建这些 render item”这件事，继续从 `Surface` / `Engine` 往页面层上移。

## 小结

本轮改动可以概括为 3 个连续动作：

1. `WebGpuEngine` 从接收实例数组改成接收工厂函数，并把实例创建推迟到 `initialize()`。
2. `WebGpuRenderItem` 生命周期继续拆成按能力组合的可选接口，避免所有对象被迫实现整套方法。
3. `WebGpuSurface` 退化成纯挂载层，页面层开始显式声明当前场景的 render item 组合。

这份记录只覆盖当前 `changes` 中真实发生的 3 个文件变更，不混入其他未在本轮 diff 中变化的文件。
