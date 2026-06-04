# 20260604_104753_CST_torus-model-switch-record

## 记录依据

本记录基于以下事实整理：

1. 当前工作区 `git status --short` 只显示 `src/components/webgpu/rotating-cube-canvas.tsx` 处于修改状态。
2. 本次记录参考了该文件当前的 `git diff`。
3. 本记录不直接粘贴原始 `git diff`，而是用“修改前 / 修改后”的代码块方式，如实说明刚刚的变更。

## 当前 changes 概览

截至记录时，当前工作区中与“切换显示 `torus.obj`”直接相关的真实变化只有一处：

- `src/components/webgpu/rotating-cube-canvas.tsx`

同时需要说明一件和显示结果相关、但**不属于本次代码修改**的事实：

- `public/models/torus.obj` 已经存在，可被当前页面加载。
- 本次并没有修改 `public/models/torus.obj` 文件内容。

## 变更一：默认加载模型从 `cube.obj` 切换为 `torus.obj`

### 修改前

```ts
// 文件路径: src/components/webgpu/rotating-cube-canvas.tsx
// 函数: RotatingCubeCanvas
// 功能: 修改前默认加载的是 cube.obj，因此页面进入后显示的是立方体模型。
const vertexStride = 6 * Float32Array.BYTES_PER_ELEMENT;
const modelDistance = -5;
const modelUrl = "/models/cube.obj";
```

### 修改后

```ts
// 文件路径: src/components/webgpu/rotating-cube-canvas.tsx
// 函数: RotatingCubeCanvas
// 功能: 修改后默认加载 torus.obj，因此现有 OBJ 加载链路会直接显示圆环模型。
const vertexStride = 6 * Float32Array.BYTES_PER_ELEMENT;
const modelDistance = -5;
const modelUrl = "/models/torus.obj";
```

这部分是本次行为变化的核心：页面展示的模型资源路径从 `cube.obj` 切到了 `torus.obj`。

## 变更二：深度纹理标签从 `cube` 命名改为泛化的 `model` 命名

### 修改前

```ts
// 文件路径: src/components/webgpu/rotating-cube-canvas.tsx
// 函数: ensureDrawableSize
// 功能: 修改前深度纹理标签仍然沿用 cube 命名，和当前可加载的通用 OBJ 模型语义不完全一致。
depthTexture?.destroy();
depthTexture = activeDevice.createTexture({
  label: "cube-depth-texture",
  size: [nextWidth, nextHeight],
  format: "depth24plus",
  usage: GPUTextureUsage.RENDER_ATTACHMENT,
});
```

### 修改后

```ts
// 文件路径: src/components/webgpu/rotating-cube-canvas.tsx
// 函数: ensureDrawableSize
// 功能: 修改后标签名称改为 model-depth-texture，使 GPU 资源标识与“通用模型渲染”语义保持一致。
depthTexture?.destroy();
depthTexture = activeDevice.createTexture({
  label: "model-depth-texture",
  size: [nextWidth, nextHeight],
  format: "depth24plus",
  usage: GPUTextureUsage.RENDER_ATTACHMENT,
});
```

这部分不会改变页面功能本身，但会让资源命名与当前模型切换后的实际用途保持一致。

## 变更三：Canvas 的可访问性描述从 `cube` 改为泛化的 `model`

### 修改前

```tsx
// 文件路径: src/components/webgpu/rotating-cube-canvas.tsx
// 函数: RotatingCubeCanvas
// 功能: 修改前 canvas 的 aria-label 明确写死为 cube，与切换到其他 OBJ 模型的场景不一致。
<canvas
  ref={canvasRef}
  aria-label="Rotating WebGPU cube"
  style={{
    width: "100%",
    height: "100%",
  }}
/>
```

### 修改后

```tsx
// 文件路径: src/components/webgpu/rotating-cube-canvas.tsx
// 函数: RotatingCubeCanvas
// 功能: 修改后 aria-label 改为 model，使无障碍描述与实际展示对象解耦，不再局限于立方体。
<canvas
  ref={canvasRef}
  aria-label="Rotating WebGPU model"
  style={{
    width: "100%",
    height: "100%",
  }}
/>
```

这部分同样不改变渲染逻辑本身，但让页面语义描述和当前模型加载能力保持一致。

## 未修改但与结果有关的部分

下面这些内容与最终“显示 `torus.obj`”有关，但本次并没有发生代码改动：

```ts
// 文件路径: src/components/webgpu/rotating-cube-canvas.tsx
// 函数: RotatingCubeCanvas -> useEffect -> initialize
// 功能: 这一段 OBJ 加载逻辑在本次修改前就已经存在，本次只是把 modelUrl 指向的资源从 cube.obj 换成了 torus.obj。
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
```

```obj
# 文件路径: public/models/torus.obj
# 函数: N/A（资源文件）
# 功能: 该资源文件已存在，当前只是被 modelUrl 引用来作为新的显示模型。
# 说明: 本次记录如实注明它参与了显示结果，但它的文件内容并没有在这次改动中被修改。
```

## 结论

本次“刚刚的修改”本质上是一次非常聚焦的模型切换与命名对齐：

1. 把默认模型资源从 `cube.obj` 改成了 `torus.obj`。
2. 把仍然写着 `cube` 的相关标识改成了更通用的 `model`。
3. 当前工作区中，这次改动只落在 `src/components/webgpu/rotating-cube-canvas.tsx` 一个文件上。
