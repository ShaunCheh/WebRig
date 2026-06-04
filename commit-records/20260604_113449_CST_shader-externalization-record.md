# 20260604_113449_CST_shader-externalization-record

## 记录依据

本记录基于当前工作区 `changes` 与相关文件的 `git diff` 整理，不直接粘贴原始 diff，而是按“修改前 / 修改后”的方式，如实记录刚刚这次把 shader 从组件内联字符串拆到独立文件，并改为在 `WebGpuSurface` 场景初始化阶段加载的调整。

截至记录时，与本次修改直接相关的当前工作区状态如下：

- `M src/app/webgpu/page.tsx`
- `M src/components/webgpu/webgpu-surface.tsx`
- `?? public/shaders/`

本次记录只覆盖这 3 处真实变更，不把其他未参与本次调整的文件混入进来。

## 变更一：把内联的 WGSL 字符串从 `WebGpuSurface` 中拆出

### 修改前

```ts
// 文件路径: src/components/webgpu/webgpu-surface.tsx
// 函数: WebGpuSurface（模块级常量 shaderCode）
// 功能: 修改前 shader 代码以内联字符串的形式直接写在组件文件里，由组件模块静态持有。
const shaderCode = /* wgsl */ `
struct Uniforms {
  modelViewProjectionMatrix: mat4x4<f32>,
  modelMatrix: mat4x4<f32>,
};

@group(0) @binding(0)
var<uniform> uniforms: Uniforms;

struct VertexInput {
  @location(0) position: vec3<f32>,
  @location(1) normal: vec3<f32>,
};

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) worldNormal: vec3<f32>,
};

@vertex
fn vsMain(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  output.position = uniforms.modelViewProjectionMatrix * vec4<f32>(input.position, 1.0);
  output.worldNormal = normalize((uniforms.modelMatrix * vec4<f32>(input.normal, 0.0)).xyz);
  return output;
}

@fragment
fn fsMain(input: VertexOutput) -> @location(0) vec4<f32> {
  let lightDirection = normalize(vec3<f32>(0.45, 0.7, 1.0));
  let diffuse = max(dot(normalize(input.worldNormal), lightDirection), 0.0);
  let ambient = 0.22;
  let baseColor = vec3<f32>(0.35, 0.72, 1.0);

  return vec4<f32>(baseColor * (ambient + diffuse * 0.78), 1.0);
}
`;
```

### 修改后

```wgsl
// 文件路径: public/shaders/basic-lit.wgsl
// 函数: vsMain / fsMain
// 功能: 修改后 shader 被外置为独立资源文件，供 WebGpuSurface 在场景初始化时加载。
// 约定:
// 1. @location(0) 为 position: vec3<f32>
// 2. @location(1) 为 normal: vec3<f32>
// 3. @group(0) @binding(0) 为 Uniforms
struct Uniforms {
  modelViewProjectionMatrix: mat4x4<f32>,
  modelMatrix: mat4x4<f32>,
};

@group(0) @binding(0)
var<uniform> uniforms: Uniforms;

struct VertexInput {
  @location(0) position: vec3<f32>,
  @location(1) normal: vec3<f32>,
};

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) worldNormal: vec3<f32>,
};

@vertex
fn vsMain(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  output.position = uniforms.modelViewProjectionMatrix * vec4<f32>(input.position, 1.0);
  output.worldNormal = normalize((uniforms.modelMatrix * vec4<f32>(input.normal, 0.0)).xyz);
  return output;
}

@fragment
fn fsMain(input: VertexOutput) -> @location(0) vec4<f32> {
  let lightDirection = normalize(vec3<f32>(0.45, 0.7, 1.0));
  let diffuse = max(dot(normalize(input.worldNormal), lightDirection), 0.0);
  let ambient = 0.22;
  let baseColor = vec3<f32>(0.35, 0.72, 1.0);

  return vec4<f32>(baseColor * (ambient + diffuse * 0.78), 1.0);
}
```

这部分变化的核心事实是：shader 代码本身没有改变渲染语义，但其存放位置从组件内联字符串改成了独立的 `.wgsl` 资源文件。

## 变更二：`WebGpuSurface` 的输入契约新增 `shaderUrl`

### 修改前

```ts
// 文件路径: src/components/webgpu/webgpu-surface.tsx
// 函数: WebGpuSurfaceProps / WebGpuSurface
// 功能: 修改前组件只接收 modelUrl，不接收外部 shader 资源路径。
export type WebGpuSurfaceProps = Readonly<{
  modelUrl: string;
  ariaLabel?: string;
  cameraDistance?: number;
  rotationSpeedX?: number;
  rotationSpeedY?: number;
  backgroundColor?: string;
  clearColor?: SurfaceClearColor;
  style?: CSSProperties;
}>;

export function WebGpuSurface({
  modelUrl,
  ariaLabel = "WebGPU surface",
  cameraDistance = -5,
  rotationSpeedX = 0.0007,
  rotationSpeedY = 0.001,
  backgroundColor = defaultBackgroundColor,
  clearColor,
  style,
}: WebGpuSurfaceProps) {
```

### 修改后

```ts
// 文件路径: src/components/webgpu/webgpu-surface.tsx
// 函数: WebGpuSurfaceProps / WebGpuSurface
// 功能: 修改后组件把 shader 资源路径纳入 props，由页面侧显式传入。
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

export function WebGpuSurface({
  modelUrl,
  shaderUrl,
  ariaLabel = "WebGPU surface",
  cameraDistance = -5,
  rotationSpeedX = 0.0007,
  rotationSpeedY = 0.001,
  backgroundColor = defaultBackgroundColor,
  clearColor,
  style,
}: WebGpuSurfaceProps) {
```

这部分变化说明：`WebGpuSurface` 不再假定 shader 永远来自组件内部常量，而是把它提升为场景级输入的一部分。

## 变更三：场景初始化从“只加载模型”升级为“并行加载模型与 shader”

### 修改前

```ts
// 文件路径: src/components/webgpu/webgpu-surface.tsx
// 函数: initializeSurface
// 功能: 修改前初始化阶段只拉取 OBJ 模型文本，随后直接使用组件内部的 shaderCode 创建 ShaderModule。
updateStatus({
  phase: "initializing",
  message: "正在加载 OBJ 模型...",
});

const response = await fetch(modelUrl);

if (!response.ok) {
  throw new Error(
    `加载 OBJ 失败：${response.status} ${response.statusText || "未知错误"}`,
  );
}

const mesh = parseObj(await response.text());
fitMeshToUnitCube(mesh.vertices);

const shaderModule = device.createShaderModule({
  label: "surface-shader",
  code: shaderCode,
});
```

### 修改后

```ts
// 文件路径: src/components/webgpu/webgpu-surface.tsx
// 函数: initializeSurface
// 功能: 修改后初始化阶段并行加载模型与 shader，两种资源均通过 URL 获取，再由加载得到的 shader 文本创建 ShaderModule。
updateStatus({
  phase: "initializing",
  message: "正在加载场景资源...",
});

const [modelResponse, shaderResponse] = await Promise.all([
  fetch(modelUrl),
  fetch(shaderUrl),
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

const shaderModule = device.createShaderModule({
  label: shaderUrl,
  code: shaderCode,
});
```

这部分变化的核心不只是“换了个文件位置”，而是把 shader 正式纳入了场景资源加载流程。

## 变更四：响应式依赖补入 `shaderUrl`

### 修改前

```ts
// 文件路径: src/components/webgpu/webgpu-surface.tsx
// 函数: WebGpuSurface（useEffect 依赖数组）
// 功能: 修改前 effect 只会因为模型、相机、转速和清屏色变化而重建场景，不会响应 shader 路径变化。
}, [
  cameraDistance,
  clearAlpha,
  clearBlue,
  clearGreen,
  clearRed,
  modelUrl,
  rotationSpeedX,
  rotationSpeedY,
]);
```

### 修改后

```ts
// 文件路径: src/components/webgpu/webgpu-surface.tsx
// 函数: WebGpuSurface（useEffect 依赖数组）
// 功能: 修改后 shaderUrl 被纳入依赖，切换 shader 资源时会重新执行场景初始化流程。
}, [
  cameraDistance,
  clearAlpha,
  clearBlue,
  clearGreen,
  clearRed,
  modelUrl,
  shaderUrl,
  rotationSpeedX,
  rotationSpeedY,
]);
```

这部分变化确保了“shader 是场景资源”的抽象在 React 生命周期上也成立，而不只是参数表面上多了一个字段。

## 变更五：页面侧开始显式传入 shader 资源路径

### 修改前

```tsx
// 文件路径: src/app/webgpu/page.tsx
// 函数: WebGpuPage
// 功能: 修改前页面只装配模型路径，shader 来源仍然隐含在 WebGpuSurface 内部。
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
// 功能: 修改后页面同时装配模型资源与 shader 资源，显式给 WebGpuSurface 传入 shaderUrl。
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

这部分变化把 shader 资源的选择权上移到了页面层，使页面能像选择模型一样选择当前使用的 shader。

## 结论

本次“刚刚的修改”本质上是一次 shader 资源化与场景加载流程升级：

1. 删除了 `WebGpuSurface` 中内联的 `shaderCode` 字符串常量。
2. 新增了独立的 shader 资源文件 `public/shaders/basic-lit.wgsl`。
3. `WebGpuSurface` 新增 `shaderUrl`，并在 `initializeSurface` 中并行加载 `modelUrl + shaderUrl`。
4. `src/app/webgpu/page.tsx` 开始显式传入 `shaderUrl="/shaders/basic-lit.wgsl"`。

因此，当前代码已经从“组件内嵌 shader 实现”转成了“shader 作为独立场景资源，在初始化阶段按 URL 加载”的结构。
