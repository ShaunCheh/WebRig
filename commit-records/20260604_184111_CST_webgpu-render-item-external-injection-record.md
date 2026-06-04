# 20260604_184111_CST_webgpu-render-item-external-injection-record

## 记录依据

本记录基于写入前通过系统 `date` 命令取得的时间戳、当前工作区 `changes`，以及相关文件的 `git diff` 与当前文件内容整理而成。

为了避免把原始 diff 直接搬进记录，下面统一使用“修改前 / 修改后”的方式，如实说明这一次把 `render item` 从 `Engine` 内部固定装配，继续推进到“外部可注入 API”的过程。

截至记录时，本轮直接相关的工作区变更为：

- `M src/components/webgpu/webgpu-surface.tsx`
- `M src/lib/webgpu/webgpu-engine.ts`
- `?? src/lib/webgpu/render-items.ts`

本记录只覆盖上述 3 个文件，不混入其他未参与本轮调整的文件。

## 变更一：`Engine` 从“内部固定装配 render item”改为“只接受外部注入的容器”

### 修改前

```ts
// 文件路径: src/lib/webgpu/webgpu-engine.ts
// 函数: WebGpuEngineOptions / WebGpuEngine.constructor
// 功能: 修改前 Engine 直接接收模型、program、相机与旋转参数，并在构造函数内部固定创建旋转体和 overlay 两个 render item。
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

// 固定装配行为: 修改前 render item 容器由 Engine 自己生成，外部无法替换里面的内容。
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
```

### 修改后

```ts
// 文件路径: src/lib/webgpu/webgpu-engine.ts
// 函数: WebGpuEngineOptions / WebGpuEngine.constructor
// 功能: 修改后 Engine 只接收外部注入的 renderItems；它只负责持有容器和驱动生命周期，不再决定场景里具体有哪些可绘制对象。
export type WebGpuEngineOptions = Readonly<{
  canvas: HTMLCanvasElement;
  renderItems: readonly WebGpuRenderItem[];
  clearColor: WebGpuClearColor;
  onStatusChange(status: WebGpuEngineStatus): void;
}>;

// 解耦结果: 修改后 Engine 只复制外部传入的容器，具体 render item 的创建已经移到外部。
this.renderItems = [...options.renderItems];
```

这部分变化的核心事实是：`Engine` 的输入边界被收口成了 `renderItems`。模型路径、program、相机参数、overlay 配置这些具体场景信息，不再由 `Engine` 直接感知。

## 变更二：render item 的具体实现从 `Engine` 中搬出，形成独立的 `render-items.ts`

### 修改前

```ts
// 文件路径: src/lib/webgpu/webgpu-engine.ts
// 函数: createRotatingMeshRenderItem / createOverlayRenderItem
// 功能: 修改前这两个 render item 的具体实现直接内嵌在 Engine 文件中，导致 Engine 同时承担“渲染框架”和“具体场景对象实现”两类职责。
function createRotatingMeshRenderItem(
  options: WebGpuMeshRenderItemOptions,
): WebGpuRenderItem {
  // mesh item: 在 Engine 文件内部完成 OBJ 加载、GPU buffer 创建、uniform 更新与 drawIndexed 编码。
}

function createOverlayRenderItem(): WebGpuRenderItem {
  // overlay item: 在 Engine 文件内部完成 overlay shader 加载、顶点更新与 draw 编码。
}
```

### 修改后

```ts
// 文件路径: src/lib/webgpu/render-items.ts
// 函数: createRotatingMeshRenderItem / createOverlayRenderItem
// 功能: 修改后 render item 实现被抽到独立文件，并以工厂函数形式导出，外部可以自行选择、组合并注入给 Engine。
export function createRotatingMeshRenderItem(
  options: WebGpuRotatingMeshRenderItemOptions,
): WebGpuRenderItem {
  return {
    async initialize(context) {
      // 初始化阶段: 加载 OBJ 与 shader，创建 pipeline / buffer / bind group。
    },
    prepareFrame(frameContext) {
      // 帧准备阶段: 写入 mesh 所需的 uniform 数据。
    },
    encodeRenderPass(renderPass) {
      // 编码阶段: 把 mesh 的 drawIndexed 命令写进 render pass。
    },
    dispose() {
      // 释放阶段: 销毁 mesh 对应的 GPU 资源。
    },
  };
}

export function createOverlayRenderItem(): WebGpuRenderItem {
  return {
    async initialize(context) {
      // 初始化阶段: 加载 overlay shader，并创建 overlay 顶点资源与 pipeline。
    },
    prepareFrame(frameContext) {
      // 帧准备阶段: 更新 overlay 顶点数据并写回 GPU。
    },
    encodeRenderPass(renderPass) {
      // 编码阶段: 把 overlay 的 draw 命令写进 render pass。
    },
    dispose() {
      // 释放阶段: 销毁 overlay 对应的 GPU 资源。
    },
  };
}
```

这里需要如实补充一点：`src/lib/webgpu/render-items.ts` 是本轮新增文件，修改前该文件并不存在；对应实现此前是写在 `src/lib/webgpu/webgpu-engine.ts` 里的。

## 变更三：`WebGpuSurface` 从“只能传模型配置”改为“支持直接传入 renderItems，同时保留默认装配路径”

### 修改前

```tsx
// 文件路径: src/components/webgpu/webgpu-surface.tsx
// 函数: WebGpuSurfaceProps / setupSurfaceEngine
// 功能: 修改前 WebGpuSurface 只能接收 modelUrl、program 和旋转参数，再把这些参数原样转给 Engine；外部没有机会直接注入 render item。
export type WebGpuSurfaceProps = Readonly<{
  modelUrl: string;
  program: WebGpuProgramDefinition;
  ariaLabel?: string;
  cameraDistance?: number;
  rotationSpeedX?: number;
  rotationSpeedY?: number;
  backgroundColor?: string;
  clearColor?: WebGpuSurfaceClearColor;
  style?: CSSProperties;
}>;

// 关键行为: 修改前 WebGpuSurface 只能把场景参数交给 Engine，由 Engine 内部固定生成 render item。
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
```

### 修改后

```tsx
// 文件路径: src/components/webgpu/webgpu-surface.tsx
// 函数: WebGpuSurfaceProps / createDefaultRenderItems / resolveRenderItems / setupSurfaceEngine
// 功能: 修改后 WebGpuSurface 同时支持两条路径:
// 1. 外部直接传 renderItems，走完全自定义装配。
// 2. 继续使用 modelUrl + program，由组件内部组装默认的 mesh item + overlay item。
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
    // 兼容旧用法: 没有显式传 renderItems 时，仍然根据 modelUrl / program 组装默认场景。
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
    // 优先级: 如果外部直接传了 renderItems，就完全使用外部容器。
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

这部分变化的真实含义是：`WebGpuSurface` 已经变成“外部 render item 注入 API”的入口层，而不是只能传模型路径的薄包装。

## 变更四：`Engine.initialize()` 的异常路径补上了资源清理

### 修改前

```ts
// 文件路径: src/lib/webgpu/webgpu-engine.ts
// 函数: initialize
// 功能: 修改前如果初始化阶段抛错，只更新 error 状态；已经初始化过的 render item 或 depth 纹理不会在 catch 里显式清理。
    } catch (error) {
      this.updateStatus({
        phase: "error",
        message:
          error instanceof Error
            ? error.message
            : "初始化 WebGPU 时发生未知错误。",
      });
    }
```

### 修改后

```ts
// 文件路径: src/lib/webgpu/webgpu-engine.ts
// 函数: initialize
// 功能: 修改后在进入 error 状态前，先清理 render item 和 depth texture，避免初始化中途失败时留下半初始化资源。
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
```

这不是新功能入口，但它是本轮真实发生的行为变化，应该被记录下来。

## 结论

这次“刚刚的修改”不是单纯把几个函数挪文件，而是把渲染职责边界继续往外推了一层：

1. `WebGpuEngine` 现在只接受外部注入的 `renderItems`，不再装配具体渲染对象。
2. `src/lib/webgpu/render-items.ts` 成为具体 render item 的实现层，负责 mesh 与 overlay 的创建、逐帧准备、编码和释放。
3. `WebGpuSurface` 变成对外的装配入口，既支持新接口 `renderItems`，也兼容旧的 `modelUrl + program` 调用方式。
4. 初始化失败时补上了资源清理，异常路径比修改前完整。

如果后续还要继续抽象更多可绘制对象，本次改动后的真实落点已经是：“由外部组装 render item，Engine 只负责驱动它们”。
