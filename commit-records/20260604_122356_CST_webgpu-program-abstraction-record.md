# 20260604_122356_CST_webgpu-program-abstraction-record

## 记录依据

本记录基于本次实现完成后的当前工作区 `changes` 与相关文件的 `git diff` 整理，不直接粘贴原始 diff，而是按“修改前 / 修改后”的方式，如实记录刚刚这次 `WebGPU program` 抽象改造。

截至记录时，当前工作区中与本次改动直接相关的文件状态如下：

- `M .cursor/plans/webgpu_program_抽象_8df50c44.plan.md`
- `M src/app/webgpu/page.tsx`
- `M src/components/webgpu/webgpu-surface.tsx`
- `?? src/lib/webgpu/programs/types.ts`
- `?? src/lib/webgpu/programs/basic-lit-program.ts`

需要特别说明：

1. `git status --short` 中只显示 `?? src/lib/webgpu/` 目录，本记录已按实际新增文件展开到具体文件路径。
2. `public/shaders/basic-lit.wgsl` 与 `src/lib/loaders/obj-loader.ts` 在本轮没有变更，但它们仍然是本次抽象所依赖的既有契约。

## 当前 changes 概览

本次改造的核心变化是：

1. `WebGpuSurface` 不再直接持有 `shader/pipeline/uniform` 的硬编码契约，而是改为消费 `program`。
2. 新增显式的 `WebGpuProgramDefinition` 类型，承载 shader 的 TS 侧契约。
3. 新增 `basicLitProgram`，把当前 `basic-lit` 方案对应的入口函数、顶点布局、uniform 大小、bind group 生成和每帧矩阵写入逻辑统一迁出。
4. 页面装配层从传 `shaderUrl` 改为选择 `basicLitProgram`。
5. 工作区中还附带存在一个计划文件 frontmatter 的状态更新，它不影响运行时逻辑，但属于本次真实的 `changes`。

## 变更一：`WebGpuSurface` 的 props 和职责从“直接持有 shader 契约”切到“消费 program 契约”

### 修改前

```ts
// 文件路径: src/components/webgpu/webgpu-surface.tsx
// 函数: WebGpuSurface
// 功能: 修改前组件直接接收 shaderUrl，并在内部持有固定的数学依赖、固定的顶点步长和固定的 shader/pipeline/uniform 约定。
import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { fitMeshToUnitCube, parseObj } from "@/lib/loaders/obj-loader";
import {
  createPerspectiveMat4,
  createRotationXMat4,
  createRotationYMat4,
  createTranslationMat4,
  multiplyMat4,
} from "@/lib/math/mat4";

const vertexStride = 6 * Float32Array.BYTES_PER_ELEMENT;

export type WebGpuSurfaceProps = Readonly<{
  modelUrl: string;
  shaderUrl: string;
  ariaLabel?: string;
  cameraDistance?: number;
  rotationSpeedX?: number;
  rotationSpeedY?: number;
  backgroundColor?: string;
  clearColor?: SurfaceClearColor;
  style?: CSSProperties;
}>;
```

### 修改后

```ts
// 文件路径: src/components/webgpu/webgpu-surface.tsx
// 函数: createUniformValues / WebGpuSurface
// 功能: 修改后组件不再持有 shader 契约细节，而是接收 program；uniform 缓冲区大小也按 program 约定动态创建。
import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { fitMeshToUnitCube, parseObj } from "@/lib/loaders/obj-loader";
import type { WebGpuProgramDefinition } from "@/lib/webgpu/programs/types";

function createUniformValues(byteLength: number): Float32Array<ArrayBuffer> {
  if (byteLength % Float32Array.BYTES_PER_ELEMENT !== 0) {
    throw new Error("Program uniformBufferByteLength 必须是 4 字节对齐。");
  }

  return new Float32Array(byteLength / Float32Array.BYTES_PER_ELEMENT);
}

export type WebGpuSurfaceProps = Readonly<{
  modelUrl: string;
  program: WebGpuProgramDefinition;
  ariaLabel?: string;
  cameraDistance?: number;
  rotationSpeedX?: number;
  rotationSpeedY?: number;
  backgroundColor?: string;
  clearColor?: SurfaceClearColor;
  style?: CSSProperties;
}>;
```

这部分变化的关键事实是：`WebGpuSurface` 的对外接口已经从“页面直接传 shader 资源路径”升级成了“页面传一个完整的 `program` 契约对象”。

## 变更二：新增 `WebGpuProgramDefinition`，把原本散落在 `surface` 里的契约收口成显式数据结构

### 修改前

```ts
// 文件路径: src/lib/webgpu/programs/types.ts
// 位置: 修改前文件不存在
// 功能: 修改前仓库里没有 program 层的显式类型，entry point、vertex layout、uniform 大小和 bind group 约定都散落在 WebGpuSurface 内部。
// 修改前: 文件不存在。
```

### 修改后

```ts
// 文件路径: src/lib/webgpu/programs/types.ts
// 位置: 类型定义 WebGpuProgramDefinition
// 功能: 新增 program 层类型，把 shader URL、pipeline 契约、bind group 构造和每帧 uniform 写入逻辑统一收口。
export type WebGpuProgramBindGroupArgs = Readonly<{
  uniformBuffer: GPUBuffer;
}>;

export type WebGpuProgramFrameUniformArgs = Readonly<{
  uniformValues: Float32Array<ArrayBuffer>;
  timestamp: DOMHighResTimeStamp;
  aspectRatio: number;
  cameraDistance: number;
  rotationSpeedX: number;
  rotationSpeedY: number;
}>;

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

这一步是本次抽象的核心。改造后，`shader/pipeline/uniform` 契约不再是散落的隐式约定，而是一个可复用、可显式传递的 TS 数据结构。

## 变更三：新增 `basicLitProgram`，把 `basic-lit` 的 TS 侧契约迁移为独立对象

### 修改前

```ts
// 文件路径: src/lib/webgpu/programs/basic-lit-program.ts
// 位置: 修改前文件不存在
// 功能: 修改前 basic-lit 方案的 TS 侧契约完全写死在 WebGpuSurface 中，没有独立的 program 定义文件。
// 修改前: 文件不存在。
```

### 修改后

```ts
// 文件路径: src/lib/webgpu/programs/basic-lit-program.ts
// 符号: basicLitProgram
// 功能: 新增 basicLitProgram，把 basic-lit.wgsl 对应的 shader 路径、顶点布局、uniform 大小、bind group 和每帧矩阵写入规则统一迁移到独立 program。
import {
  createPerspectiveMat4,
  createRotationXMat4,
  createRotationYMat4,
  createTranslationMat4,
  multiplyMat4,
} from "@/lib/math/mat4";
import type { WebGpuProgramDefinition } from "@/lib/webgpu/programs/types";

const vertexStride = 6 * Float32Array.BYTES_PER_ELEMENT;
const uniformFloatCount = 32;

export const basicLitProgram: WebGpuProgramDefinition = {
  label: "basic-lit",
  shaderUrl: "/shaders/basic-lit.wgsl",
  bindGroupIndex: 0,
  vertexEntryPoint: "vsMain",
  fragmentEntryPoint: "fsMain",
  vertexBufferLayouts: [
    {
      arrayStride: vertexStride,
      attributes: [
        { shaderLocation: 0, offset: 0, format: "float32x3" },
        {
          shaderLocation: 1,
          offset: 3 * Float32Array.BYTES_PER_ELEMENT,
          format: "float32x3",
        },
      ],
    },
  ],
  uniformBufferByteLength: uniformFloatCount * Float32Array.BYTES_PER_ELEMENT,
  primitive: {
    topology: "triangle-list",
    cullMode: "back",
  },
  depthStencil: {
    format: "depth24plus",
    depthWriteEnabled: true,
    depthCompare: "less",
  },
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
    // ... 计算 MVP 和 Model 矩阵并写入 uniformValues ...
  },
};
```

这部分变化说明：`basic-lit` 不再是 `WebGpuSurface` 内部写死的一套规则，而是一个可替换、可复用的外部 program 对象。

## 变更四：`WebGpuSurface` 的初始化和每帧渲染逻辑改为从 `program` 读取契约

### 修改前

```ts
// 文件路径: src/components/webgpu/webgpu-surface.tsx
// 函数: WebGpuSurface -> initializeSurface / render
// 功能: 修改前 surface 自己决定 shader 资源路径、shader entry point、顶点布局、uniform 大小、bind group 条目和每帧矩阵写入。
const [modelResponse, shaderResponse] = await Promise.all([
  fetch(modelUrl),
  fetch(shaderUrl),
]);

const shaderModule = device.createShaderModule({
  label: shaderUrl,
  code: shaderCode,
});

uniformBuffer = device.createBuffer({
  label: "surface-uniform-buffer",
  size: uniformValues.byteLength,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

const pipeline = device.createRenderPipeline({
  label: "surface-render-pipeline",
  layout: "auto",
  vertex: {
    module: shaderModule,
    entryPoint: "vsMain",
    buffers: [
      {
        arrayStride: vertexStride,
        attributes: [
          { shaderLocation: 0, offset: 0, format: "float32x3" },
          {
            shaderLocation: 1,
            offset: 3 * Float32Array.BYTES_PER_ELEMENT,
            format: "float32x3",
          },
        ],
      },
    ],
  },
  fragment: {
    module: shaderModule,
    entryPoint: "fsMain",
    targets: [{ format: presentationFormat }],
  },
  primitive: {
    topology: "triangle-list",
    cullMode: "back",
  },
  depthStencil: {
    format: "depth24plus",
    depthWriteEnabled: true,
    depthCompare: "less",
  },
});

const bindGroup = device.createBindGroup({
  label: "surface-bind-group",
  layout: pipeline.getBindGroupLayout(0),
  entries: [
    {
      binding: 0,
      resource: {
        buffer: uniformBuffer,
      },
    },
  ],
});

const projectionMatrix = createPerspectiveMat4(Math.PI / 4, aspectRatio, 0.1, 100);
const rotationXMatrix = createRotationXMat4(timestamp * rotationSpeedX);
const rotationYMatrix = createRotationYMat4(timestamp * rotationSpeedY);
const modelMatrix = multiplyMat4(rotationYMatrix, rotationXMatrix);
const viewMatrix = createTranslationMat4(0, 0, cameraDistance);
const viewModelMatrix = multiplyMat4(viewMatrix, modelMatrix);
const modelViewProjectionMatrix = multiplyMat4(
  projectionMatrix,
  viewModelMatrix,
);

uniformValues.set(modelViewProjectionMatrix, 0);
uniformValues.set(modelMatrix, 16);

renderPass.setBindGroup(0, bindGroup);
```

### 修改后

```ts
// 文件路径: src/components/webgpu/webgpu-surface.tsx
// 函数: WebGpuSurface -> initializeSurface / render
// 功能: 修改后 surface 只负责执行 program 提供的契约，shader URL、entry point、顶点布局、uniform buffer 大小和每帧 uniform 写入都改为由 program 决定。
const uniformValues = createUniformValues(program.uniformBufferByteLength);

const [modelResponse, shaderResponse] = await Promise.all([
  fetch(modelUrl),
  fetch(program.shaderUrl),
]);

const shaderModule = device.createShaderModule({
  label: `${program.label}-shader`,
  code: shaderCode,
});

uniformBuffer = device.createBuffer({
  label: `${program.label}-uniform-buffer`,
  size: program.uniformBufferByteLength,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

const pipeline = device.createRenderPipeline({
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
    targets: [{ format: presentationFormat }],
  },
  primitive: program.primitive,
  depthStencil: program.depthStencil,
});

const bindGroup = device.createBindGroup({
  label: `${program.label}-bind-group`,
  layout: pipeline.getBindGroupLayout(program.bindGroupIndex),
  entries: program.createBindGroupEntries({
    uniformBuffer,
  }),
});

program.writeFrameUniforms({
  uniformValues,
  timestamp,
  aspectRatio,
  cameraDistance,
  rotationSpeedX,
  rotationSpeedY,
});

renderPass.setBindGroup(program.bindGroupIndex, bindGroup);
```

这部分变化如实反映了本次运行时改造的本质：`WebGpuSurface` 现在只负责“宿主和执行”，不再负责“定义 basic-lit 的渲染规则”。

## 变更五：页面装配层从传 `shaderUrl` 改为选择 `basicLitProgram`，并切到 client 侧

### 修改前

```tsx
// 文件路径: src/app/webgpu/page.tsx
// 函数: WebGpuPage
// 功能: 修改前页面只把模型路径和 shader 路径传给 surface，页面本身仍是默认的 server 组件写法。
import { WebGpuSurface } from "@/components/webgpu/webgpu-surface";

export default function WebGpuPage() {
  return (
    <main
      style={{
        width: "100vw",
        height: "100vh",
      }}
    >
      <WebGpuSurface
        modelUrl="/models/torus.obj"
        shaderUrl="/shaders/basic-lit.wgsl"
        ariaLabel="Rotating WebGPU torus"
      />
    </main>
  );
}
```

### 修改后

```tsx
// 文件路径: src/app/webgpu/page.tsx
// 函数: WebGpuPage
// 功能: 修改后页面显式选择 basicLitProgram，并切到 client 侧装配，以便安全传递包含函数的 program 对象。
"use client";

import { WebGpuSurface } from "@/components/webgpu/webgpu-surface";
import { basicLitProgram } from "@/lib/webgpu/programs/basic-lit-program";

export default function WebGpuPage() {
  return (
    <main
      style={{
        width: "100vw",
        height: "100vh",
      }}
    >
      <WebGpuSurface
        modelUrl="/models/torus.obj"
        program={basicLitProgram}
        ariaLabel="Rotating WebGPU torus"
      />
    </main>
  );
}
```

页面侧这一步的变化很关键：原来页面只是传资源路径，现在它已经承担“选择当前使用哪套 program”的装配职责。

## 变更六：当前工作区中的附带变化，计划文件的 todo 状态从 `pending` 切为 `completed`

### 修改前

```md
<!-- 文件路径: .cursor/plans/webgpu_program_抽象_8df50c44.plan.md -->
<!-- 位置: frontmatter.todos -->
<!-- 功能: 修改前计划文件中的四个实施任务还处于 pending 状态。 -->
todos:
  - id: define-program-types
    content: 新增 program 类型定义，明确 shader/pipeline/uniform/bind-group 契约
    status: pending
  - id: migrate-basic-lit
    content: 把 basic-lit 的 TS 侧契约迁移为独立 basicLitProgram
    status: pending
  - id: refactor-surface
    content: 让 WebGpuSurface 改为消费 program，而不是持有硬编码 shader 契约
    status: pending
  - id: verify-contract
    content: 验证 torus + basic-lit 渲染结果与 lint/typecheck/build 一致
    status: pending
```

### 修改后

```md
<!-- 文件路径: .cursor/plans/webgpu_program_抽象_8df50c44.plan.md -->
<!-- 位置: frontmatter.todos -->
<!-- 功能: 修改后计划文件中的四个实施任务都已被标记为 completed。 -->
todos:
  - id: define-program-types
    content: 新增 program 类型定义，明确 shader/pipeline/uniform/bind-group 契约
    status: completed
  - id: migrate-basic-lit
    content: 把 basic-lit 的 TS 侧契约迁移为独立 basicLitProgram
    status: completed
  - id: refactor-surface
    content: 让 WebGpuSurface 改为消费 program，而不是持有硬编码 shader 契约
    status: completed
  - id: verify-contract
    content: 验证 torus + basic-lit 渲染结果与 lint/typecheck/build 一致
    status: completed
```

这部分属于当前工作区中的真实附带变化，但它不影响运行时渲染逻辑本身，应和代码改动分开理解。

## 未修改但继续复用的既有契约

本轮实现中，下面两个文件没有发生改动，但它们继续作为当前渲染链路的边界条件存在：

1. `public/shaders/basic-lit.wgsl`：WGSL 源码仍沿用当前的 `position + normal` 与 `Uniforms` 约定。
2. `src/lib/loaders/obj-loader.ts`：`ObjMesh` 仍然输出 `[px, py, pz, nx, ny, nz]` 这一固定顶点格式。

这也意味着：本次 program 抽象完成后，系统只是把“shader contract”从 `surface` 中抽了出来，还没有推进到“任意 mesh format”。

## 验证情况

本次修改完成后，已经执行并通过以下检查：

1. `npm run lint`
2. `npm run typecheck`
3. `npm run build`

## 结论

本次“刚刚的修改”本质上是把 `WebGpuSurface` 中原本隐式、硬编码的 shader/pipeline/uniform 契约上提为显式 `program` 层：

1. 新增 `WebGpuProgramDefinition`，明确了 program 的数据结构。
2. 新增 `basicLitProgram`，把 `basic-lit` 的 TS 侧契约迁移为独立对象。
3. `WebGpuSurface` 从“宿主 + 具体渲染规则”变成了“宿主 + 执行 program 契约”。
4. 页面从传 `shaderUrl` 升级为选择具体 `program`。

因此，当前仓库已经从“shader 文件独立化”进一步演进到“program 契约显式化”，为后续接入第二套 shader / pipeline 契约打下了结构基础。
