20260521_173027_CST

# 本次初始化修改记录

## 记录依据

- 基于创建本记录前的 `git status --short` 与各文件当前内容整理。
- 仓库在本次改动前是空仓状态，因此本次 `changes` 均为“新增文件”。
- 按要求不直接贴原始 `git diff`，改为按模块给出“修改前 / 修改后”的等价对照。

## 仓库初始状态

```bash
# 文件路径: /Users/shaun/cloudDev/WebRig | 函数: 无（目录状态）
# 修改前: 仓库根目录只有 Git 元数据，尚未初始化 TypeScript / Next.js / WebGPU 工程
.
..
.git
```

## 当前 changes 快照

```bash
# 文件路径: /Users/shaun/cloudDev/WebRig | 函数: 无（git status --short 快照）
# 说明: 该快照采集于本记录写入前，因此不包含当前这份 markdown 记录文件自身
?? .gitignore
?? eslint.config.mjs
?? next-env.d.ts
?? next.config.ts
?? package-lock.json
?? package.json
?? src/
?? tsconfig.json
```

## 1. 工程初始化与配置

### `.gitignore`

```gitignore
# 文件路径: .gitignore | 函数: 无（忽略规则）
# 修改前: 文件不存在，仓库没有 Node / Next.js 产物忽略配置
```

```gitignore
# 文件路径: .gitignore | 函数: 无（忽略规则）
# 功能: 忽略 node_modules、.next、日志和 TypeScript 增量构建缓存
node_modules
.next
out
coverage

.DS_Store
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*

*.tsbuildinfo
```

### `package.json`

```jsonc
// 文件路径: package.json | 函数: 无（项目清单）
// 修改前: 文件不存在，仓库没有 npm 包定义、脚本或依赖声明
```

```jsonc
// 文件路径: package.json | 函数: 无（项目清单）
// 功能: 定义 Next.js 运行脚本，并声明 React / Next / TypeScript / ESLint / WebGPU 类型依赖
{
  "name": "webrig",
  "version": "1.0.0",
  "private": true,
  "description": "A Next.js WebGPU playground.",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint . --max-warnings=0",
    "typecheck": "tsc --noEmit"
  },
  "repository": {
    "type": "git",
    "url": "git@github-personal:ShaunCheh/WebRig.git"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "dependencies": {
    "next": "^16.2.6",
    "react": "^19.2.6",
    "react-dom": "^19.2.6"
  },
  "devDependencies": {
    "@types/node": "^25.9.1",
    "@types/react": "^19.2.15",
    "@types/react-dom": "^19.2.3",
    "@webgpu/types": "^0.1.70",
    "eslint": "^9.39.4",
    "eslint-config-next": "^16.2.6",
    "typescript": "^6.0.3"
  }
}
```

### `package-lock.json`

```jsonc
// 文件路径: package-lock.json | 函数: 无（锁文件）
// 修改前: 文件不存在，npm 尚未解析并锁定依赖树
```

```jsonc
// 文件路径: package-lock.json | 函数: 无（锁文件）
// 功能: 固定本次 npm install 解析出的顶层依赖版本，以下仅保留锁文件头部与顶层包信息
{
  "name": "webrig",
  "version": "1.0.0",
  "lockfileVersion": 3,
  "requires": true,
  "packages": {
    "": {
      "name": "webrig",
      "version": "1.0.0",
      "license": "ISC",
      "dependencies": {
        "next": "^16.2.6",
        "react": "^19.2.6",
        "react-dom": "^19.2.6"
      },
      "devDependencies": {
        "@types/node": "^25.9.1",
        "@types/react": "^19.2.15",
        "@types/react-dom": "^19.2.3",
        "@webgpu/types": "^0.1.70",
        "eslint": "^9.39.4",
        "eslint-config-next": "^16.2.6",
        "typescript": "^6.0.3"
      }
    }
    // 其余 node_modules 依赖树条目由 npm 自动生成，这里省略
  }
}
```

### `tsconfig.json`

```jsonc
// 文件路径: tsconfig.json | 函数: 无（TypeScript 编译配置）
// 修改前: 文件不存在，仓库没有 TypeScript 编译目标、路径别名或 Next.js 类型接入
```

```jsonc
// 文件路径: tsconfig.json | 函数: 无（TypeScript 编译配置）
// 功能: 配置 Next.js + TypeScript 编译环境；jsx 和 include 为构建后最终落地结果
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "es2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts"
  ],
  "exclude": ["node_modules"]
}
```

### `eslint.config.mjs`

```javascript
// 文件路径: eslint.config.mjs | 函数: 无（ESLint Flat Config）
// 修改前: 文件不存在，项目没有 ESLint 规则入口
```

```javascript
// 文件路径: eslint.config.mjs | 函数: 无（ESLint Flat Config）
// 功能: 合并 Next.js core-web-vitals 与 TypeScript 推荐规则
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const eslintConfig = [...nextCoreWebVitals, ...nextTypeScript];

export default eslintConfig;
```

### `next.config.ts`

```typescript
// 文件路径: next.config.ts | 函数: 无（NextConfig）
// 修改前: 文件不存在，项目没有 Next.js 配置入口
```

```typescript
// 文件路径: next.config.ts | 函数: 无（NextConfig）
// 功能: 提供最小可运行的 Next.js 配置导出，当前未附加额外行为
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;
```

### `next-env.d.ts`

```typescript
// 文件路径: next-env.d.ts | 函数: 无（Next.js 环境类型入口）
// 修改前: 文件不存在，项目没有 Next.js 运行时类型声明
```

```typescript
// 文件路径: next-env.d.ts | 函数: 无（Next.js 环境类型入口）
// 功能: 引入 Next.js 基础类型与构建时生成的路由类型；该文件应由 Next.js 维护
/// <reference types="next" />
/// <reference types="next/image-types/global" />
import "./.next/dev/types/routes.d.ts";

// NOTE: This file should not be edited
// see https://nextjs.org/docs/app/api-reference/config/typescript for more information.
```

## 2. 路由、布局与全局样式

### `src/app/globals.css`

```css
/* 文件路径: src/app/globals.css | 函数: 无（全局样式） */
/* 修改前: 文件不存在，页面默认会继承浏览器 margin，canvas 无法天然铺满视口 */
```

```css
/* 文件路径: src/app/globals.css | 函数: 无（全局样式） */
/* 功能: 去掉默认 margin / padding，锁定根节点高度，并让 canvas 以 block 方式铺满页面 */
html,
body {
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
}

body {
  overflow: hidden;
  background: #020617;
  color: #e2e8f0;
  font-family: Arial, Helvetica, sans-serif;
}

* {
  box-sizing: border-box;
}

canvas {
  display: block;
}
```

### `src/app/layout.tsx`

```tsx
// 文件路径: src/app/layout.tsx | 函数: RootLayout
// 修改前: 文件不存在，App Router 根布局未建立
```

```tsx
// 文件路径: src/app/layout.tsx | 函数: RootLayout
// 功能: 定义全局 metadata，挂载全局样式，并将页面语言设置为 zh-CN
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "WebRig",
  description: "Next.js + WebGPU rotating cube demo.",
};

type RootLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
```

### `src/app/page.tsx`

```tsx
// 文件路径: src/app/page.tsx | 函数: HomePage
// 修改前: 文件不存在，根路由没有页面入口
```

```tsx
// 文件路径: src/app/page.tsx | 函数: HomePage
// 功能: 访问根路径时直接跳转到 /webgpu
import { redirect } from "next/navigation";

export default function HomePage() {
  redirect("/webgpu");
}
```

### `src/app/webgpu/page.tsx`

```tsx
// 文件路径: src/app/webgpu/page.tsx | 函数: WebGpuPage
// 修改前: 文件不存在，/webgpu 路由不存在
```

```tsx
// 文件路径: src/app/webgpu/page.tsx | 函数: WebGpuPage
// 功能: 将 WebGPU 立方体画布组件挂到 /webgpu 页面
import { RotatingCubeCanvas } from "@/components/webgpu/rotating-cube-canvas";

export default function WebGpuPage() {
  return <RotatingCubeCanvas />;
}
```

## 3. WebGPU 类型与矩阵工具

### `src/types/webgpu.d.ts`

```typescript
// 文件路径: src/types/webgpu.d.ts | 函数: 无（全局类型补充）
// 修改前: 文件不存在，TypeScript 无法识别 WebGPU 全局类型
```

```typescript
// 文件路径: src/types/webgpu.d.ts | 函数: 无（全局类型补充）
// 功能: 把 @webgpu/types 的声明接入 TypeScript 编译上下文
/// <reference types="@webgpu/types" />
```

### `src/lib/math/mat4.ts`

```typescript
// 文件路径: src/lib/math/mat4.ts | 函数: multiplyMat4 / createPerspectiveMat4 / createRotationXMat4 / createRotationYMat4 / createTranslationMat4
// 修改前: 文件不存在，WebGPU 页面没有矩阵乘法、透视投影、旋转和平移的基础数学实现
```

```typescript
// 文件路径: src/lib/math/mat4.ts | 函数: multiplyMat4 / createPerspectiveMat4 / createRotationXMat4 / createRotationYMat4 / createTranslationMat4
// 功能: 提供 4x4 矩阵运算，供立方体在渲染时计算 MVP 矩阵
export type Mat4 = Float32Array;

export function multiplyMat4(left: Mat4, right: Mat4): Mat4 {
  const out = new Float32Array(16);

  const a00 = left[0];
  const a01 = left[1];
  const a02 = left[2];
  const a03 = left[3];
  const a10 = left[4];
  const a11 = left[5];
  const a12 = left[6];
  const a13 = left[7];
  const a20 = left[8];
  const a21 = left[9];
  const a22 = left[10];
  const a23 = left[11];
  const a30 = left[12];
  const a31 = left[13];
  const a32 = left[14];
  const a33 = left[15];

  let b0 = right[0];
  let b1 = right[1];
  let b2 = right[2];
  let b3 = right[3];

  out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

  b0 = right[4];
  b1 = right[5];
  b2 = right[6];
  b3 = right[7];

  out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

  b0 = right[8];
  b1 = right[9];
  b2 = right[10];
  b3 = right[11];

  out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

  b0 = right[12];
  b1 = right[13];
  b2 = right[14];
  b3 = right[15];

  out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

  return out;
}

export function createPerspectiveMat4(
  verticalFieldOfViewRadians: number,
  aspectRatio: number,
  near: number,
  far: number,
): Mat4 {
  const out = new Float32Array(16);
  const f = 1 / Math.tan(verticalFieldOfViewRadians * 0.5);
  const rangeInverse = 1 / (near - far);

  out[0] = f / aspectRatio;
  out[5] = f;
  out[10] = far * rangeInverse;
  out[11] = -1;
  out[14] = near * far * rangeInverse;

  return out;
}

export function createRotationXMat4(radians: number): Mat4 {
  const sine = Math.sin(radians);
  const cosine = Math.cos(radians);

  return new Float32Array([
    1, 0, 0, 0,
    0, cosine, sine, 0,
    0, -sine, cosine, 0,
    0, 0, 0, 1,
  ]);
}

export function createRotationYMat4(radians: number): Mat4 {
  const sine = Math.sin(radians);
  const cosine = Math.cos(radians);

  return new Float32Array([
    cosine, 0, -sine, 0,
    0, 1, 0, 0,
    sine, 0, cosine, 0,
    0, 0, 0, 1,
  ]);
}

export function createTranslationMat4(x: number, y: number, z: number): Mat4 {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, y, z, 1,
  ]);
}
```

## 4. WebGPU 旋转立方体页面主体

### `src/components/webgpu/rotating-cube-canvas.tsx`：新增前

```tsx
// 文件路径: src/components/webgpu/rotating-cube-canvas.tsx | 函数: RotatingCubeCanvas
// 修改前: 文件不存在，项目中没有全屏 canvas、WebGPU 初始化流程或旋转立方体渲染逻辑
```

### `src/components/webgpu/rotating-cube-canvas.tsx`：着色器与几何数据

```tsx
// 文件路径: src/components/webgpu/rotating-cube-canvas.tsx | 函数: 无（模块常量 shaderCode / cubeVertices / cubeIndices）
// 功能: 定义 WGSL shader、24 个顶点的彩色立方体数据和索引缓冲
"use client";

import { useEffect, useRef, useState } from "react";
import {
  createPerspectiveMat4,
  createRotationXMat4,
  createRotationYMat4,
  createTranslationMat4,
  multiplyMat4,
} from "@/lib/math/mat4";

const shaderCode = /* wgsl */ `
struct Uniforms {
  modelViewProjectionMatrix: mat4x4<f32>,
};

@group(0) @binding(0)
var<uniform> uniforms: Uniforms;

struct VertexInput {
  @location(0) position: vec3<f32>,
  @location(1) color: vec3<f32>,
};

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) color: vec3<f32>,
};

@vertex
fn vsMain(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  output.position = uniforms.modelViewProjectionMatrix * vec4<f32>(input.position, 1.0);
  output.color = input.color;
  return output;
}

@fragment
fn fsMain(input: VertexOutput) -> @location(0) vec4<f32> {
  return vec4<f32>(input.color, 1.0);
}
`;

const cubeVertices = new Float32Array([
  // 前后左右上下六个面分别给不同颜色
  -1, -1, 1, 1, 0, 0,
  1, -1, 1, 1, 0, 0,
  1, 1, 1, 1, 0, 0,
  -1, 1, 1, 1, 0, 0,
  1, -1, -1, 0, 1, 0,
  -1, -1, -1, 0, 1, 0,
  -1, 1, -1, 0, 1, 0,
  1, 1, -1, 0, 1, 0,
  // ...其余顶点数据与实际文件一致，此处省略重复面数据
]);

const cubeIndices = new Uint16Array([
  0, 1, 2, 0, 2, 3,
  4, 5, 6, 4, 6, 7,
  8, 9, 10, 8, 10, 11,
  12, 13, 14, 12, 14, 15,
  16, 17, 18, 16, 18, 19,
  20, 21, 22, 20, 22, 23,
]);
```

### `src/components/webgpu/rotating-cube-canvas.tsx`：初始化、尺寸同步与渲染循环

```tsx
// 文件路径: src/components/webgpu/rotating-cube-canvas.tsx | 函数: RotatingCubeCanvas
// 功能: 初始化 WebGPU device/context/pipeline，按视口同步 canvas 与 depth texture，并持续渲染旋转立方体
export function RotatingCubeCanvas() {
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

    let isDisposed = false;
    let animationFrameId = 0;
    let device: GPUDevice | null = null;
    let depthTexture: GPUTexture | null = null;
    let vertexBuffer: GPUBuffer | null = null;
    let indexBuffer: GPUBuffer | null = null;
    let uniformBuffer: GPUBuffer | null = null;

    const updateStatus = (nextStatus: Status) => {
      // 功能注释: 避免组件卸载后继续 setState
      if (!isDisposed) {
        setStatus(nextStatus);
      }
    };

    const ensureDrawableSize = (activeDevice: GPUDevice) => {
      // 功能注释: 每帧按 clientWidth / clientHeight 与 devicePixelRatio 同步真实绘制尺寸
      const devicePixelRatio = window.devicePixelRatio || 1;
      const nextWidth = Math.max(1, Math.floor(canvas.clientWidth * devicePixelRatio));
      const nextHeight = Math.max(1, Math.floor(canvas.clientHeight * devicePixelRatio));

      if (
        canvas.width === nextWidth &&
        canvas.height === nextHeight &&
        depthTexture !== null
      ) {
        return { width: nextWidth, height: nextHeight };
      }

      canvas.width = nextWidth;
      canvas.height = nextHeight;

      depthTexture?.destroy();
      depthTexture = activeDevice.createTexture({
        label: "cube-depth-texture",
        size: [nextWidth, nextHeight],
        format: "depth24plus",
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });

      return { width: nextWidth, height: nextHeight };
    };

    const initialize = async () => {
      if (!("gpu" in navigator)) {
        updateStatus({
          phase: "unsupported",
          message: "当前浏览器不支持 WebGPU，请使用最新版 Chrome 或 Edge。",
        });
        return;
      }

      const context = canvas.getContext("webgpu");
      if (!context) {
        updateStatus({
          phase: "error",
          message: "浏览器返回了空的 WebGPU Canvas 上下文。",
        });
        return;
      }

      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) {
        updateStatus({
          phase: "unsupported",
          message: "未能获取可用的 GPU 适配器。",
        });
        return;
      }

      const requestedDevice = await adapter.requestDevice();
      if (isDisposed) {
        requestedDevice.destroy();
        return;
      }

      device = requestedDevice;
      const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

      context.configure({
        device,
        format: presentationFormat,
        alphaMode: "opaque",
      });

      // 功能注释: 顶点/索引/uniform buffer、pipeline 与 bindGroup 在这里创建
      // 原文件中对应实现已完整存在，此处保留关键流程，不直接粘贴整段 400+ 行源码

      const render = (timestamp: DOMHighResTimeStamp) => {
        if (
          isDisposed ||
          device === null ||
          vertexBuffer === null ||
          indexBuffer === null ||
          uniformBuffer === null
        ) {
          return;
        }

        const { width, height } = ensureDrawableSize(device);
        const aspectRatio = width / height;
        const projectionMatrix = createPerspectiveMat4(Math.PI / 4, aspectRatio, 0.1, 100);
        const rotationXMatrix = createRotationXMat4(timestamp * 0.0007);
        const rotationYMatrix = createRotationYMat4(timestamp * 0.001);
        const modelMatrix = multiplyMat4(rotationYMatrix, rotationXMatrix);
        const viewMatrix = createTranslationMat4(0, 0, -5);
        const viewModelMatrix = multiplyMat4(viewMatrix, modelMatrix);
        const modelViewProjectionMatrix = multiplyMat4(projectionMatrix, viewModelMatrix);

        device.queue.writeBuffer(uniformBuffer, 0, modelViewProjectionMatrix);

        const commandEncoder = device.createCommandEncoder({
          label: "cube-command-encoder",
        });
        const renderPass = commandEncoder.beginRenderPass({
          colorAttachments: [
            {
              view: context.getCurrentTexture().createView(),
              clearValue: { r: 0.02, g: 0.04, b: 0.08, a: 1 },
              loadOp: "clear",
              storeOp: "store",
            },
          ],
          depthStencilAttachment: {
            view: depthTexture!.createView(),
            depthClearValue: 1,
            depthLoadOp: "clear",
            depthStoreOp: "store",
          },
        });

        renderPass.setPipeline(pipeline);
        renderPass.setBindGroup(0, bindGroup);
        renderPass.setVertexBuffer(0, vertexBuffer);
        renderPass.setIndexBuffer(indexBuffer, "uint16");
        renderPass.drawIndexed(cubeIndices.length);
        renderPass.end();

        device.queue.submit([commandEncoder.finish()]);
        animationFrameId = window.requestAnimationFrame(render);
      };

      animationFrameId = window.requestAnimationFrame(render);
    };

    void initialize();

    return () => {
      isDisposed = true;
      window.cancelAnimationFrame(animationFrameId);
      depthTexture?.destroy();
      vertexBuffer?.destroy();
      indexBuffer?.destroy();
      uniformBuffer?.destroy();
      device?.destroy();
    };
  }, []);
}
```

### `src/components/webgpu/rotating-cube-canvas.tsx`：全屏画布输出

```tsx
// 文件路径: src/components/webgpu/rotating-cube-canvas.tsx | 函数: RotatingCubeCanvas
// 功能: 外层固定铺满视口，canvas 100% 占满容器，初始化中或异常时覆盖提示层
return (
  <div
    style={{
      position: "fixed",
      inset: 0,
      margin: 0,
      padding: 0,
      overflow: "hidden",
      backgroundColor: "#020617",
    }}
  >
    <canvas
      ref={canvasRef}
      aria-label="Rotating WebGPU cube"
      style={{
        width: "100%",
        height: "100%",
      }}
    />
    {status.phase !== "ready" ? (
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          padding: "24px",
          textAlign: "center",
          color: "#e2e8f0",
          background:
            status.phase === "initializing"
              ? "rgba(2, 6, 23, 0.55)"
              : "rgba(15, 23, 42, 0.88)",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            maxWidth: "32rem",
            lineHeight: 1.6,
            fontSize: "0.95rem",
          }}
        >
          {status.message}
        </div>
      </div>
    ) : null}
  </div>
);
```

## 5. 本次改动落地结果

```bash
# 文件路径: /Users/shaun/cloudDev/WebRig | 函数: 无（结果摘要）
# 功能: 总结本次初始化之后，仓库具备的实际能力
1. 已从空仓初始化为 TypeScript + Next.js 工程
2. 已具备 npm scripts: dev / build / start / lint / typecheck
3. 已提供 /webgpu 页面，并由根路径 / 自动跳转进入
4. 已实现全屏 canvas，无外层 margin，窗口多大画布就多大
5. 已使用 WebGPU 绘制并持续旋转一个带深度测试的彩色立方体
```
