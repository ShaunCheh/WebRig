# 20260604_102652_CST_webgpu-obj-cube-import-record

## 记录范围

本记录基于当前工作区的相关 `changes` 与对应文件的 `git diff` 整理，不直接粘贴原始 diff，而是按“修改前 / 修改后”的方式如实说明本次变更。

本次记录覆盖的实际文件如下：

- `src/components/webgpu/rotating-cube-canvas.tsx`
- `src/lib/loaders/obj-loader.ts`
- `public/models/cube.obj`
- `next-env.d.ts`（构建后产生的附带工作区变化，不属于 OBJ 导入逻辑本身）

本次未改动的页面入口文件：

- `src/app/webgpu/page.tsx`

## 当前工作区中的相关 changes

结合当前工作区状态，本次相关变化可以归纳为：

1. `src/components/webgpu/rotating-cube-canvas.tsx`：从“硬编码立方体顶点 + 顶点色渲染”改为“运行时加载 OBJ + 法线光照渲染”。
2. `src/lib/loaders/obj-loader.ts`：新增一个不依赖第三方库的 OBJ 解析器，并补了网格归一化能力。
3. `public/models/cube.obj`：新增一个带法线的立方体 OBJ 资源。
4. `next-env.d.ts`：在执行构建后发生了引用路径切换，这是当前工作区中的真实变化，但不属于这次 OBJ 导入功能的手写实现。

## 变更一：WebGPU 页面从硬编码立方体切换为运行时 OBJ 加载

### 修改前

```ts
// 文件路径: src/components/webgpu/rotating-cube-canvas.tsx
// 函数: RotatingCubeCanvas -> useEffect -> initialize
// 功能: 修改前直接把立方体的顶点和索引写死在组件里，再上传到 GPU；数据源不是模型文件。
const cubeVertices = new Float32Array([
  // 关键点: 每个顶点的后 3 个分量是颜色，不是法线。
  -1, -1, 1, 1, 0, 0,
  1, -1, 1, 1, 0, 0,
  1, 1, 1, 1, 0, 0,
  -1, 1, 1, 1, 0, 0,
  // ... 其余面省略 ...
]);

const cubeIndices = new Uint16Array([
  0, 1, 2, 0, 2, 3,
  4, 5, 6, 4, 6, 7,
  // ... 其余索引省略 ...
]);

vertexBuffer = device.createBuffer({
  label: "cube-vertex-buffer",
  size: cubeVertices.byteLength,
  usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  mappedAtCreation: true,
});
new Float32Array(vertexBuffer.getMappedRange()).set(cubeVertices);
vertexBuffer.unmap();

indexBuffer = device.createBuffer({
  label: "cube-index-buffer",
  size: cubeIndices.byteLength,
  usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  mappedAtCreation: true,
});
new Uint16Array(indexBuffer.getMappedRange()).set(cubeIndices);
indexBuffer.unmap();
```

### 修改后

```ts
// 文件路径: src/components/webgpu/rotating-cube-canvas.tsx
// 函数: RotatingCubeCanvas -> useEffect -> initialize
// 功能: 修改后先拉取 /models/cube.obj，再解析、归一化、上传到 GPU；渲染数据来源变成了外部模型文件。
import { fitMeshToUnitCube, parseObj } from "@/lib/loaders/obj-loader";

const modelUrl = "/models/cube.obj";
let indexCount = 0;
let indexFormat: GPUIndexFormat = "uint16";

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

indexCount = mesh.indices.length;
indexFormat = mesh.indices instanceof Uint32Array ? "uint32" : "uint16";

vertexBuffer = device.createBuffer({
  label: "obj-vertex-buffer",
  size: mesh.vertices.byteLength,
  usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  mappedAtCreation: true,
});
new Float32Array(vertexBuffer.getMappedRange()).set(mesh.vertices);
vertexBuffer.unmap();
```

这部分变化的核心事实是：组件不再依赖手写的立方体几何数组，而是改成从 `OBJ` 文本中恢复出真正的网格数据。

## 变更二：着色器输入从“位置 + 颜色”改为“位置 + 法线”，并补上简单光照

### 修改前

```wgsl
// 文件路径: src/components/webgpu/rotating-cube-canvas.tsx
// 函数: RotatingCubeCanvas（使用 shaderCode 常量）
// 功能: 修改前的 shader 只把顶点颜色原样传到片元阶段，没有使用法线，也没有光照计算。
struct Uniforms {
  modelViewProjectionMatrix: mat4x4<f32>,
};

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
```

### 修改后

```wgsl
// 文件路径: src/components/webgpu/rotating-cube-canvas.tsx
// 函数: RotatingCubeCanvas（使用 shaderCode 常量）
// 功能: 修改后把第二个顶点属性切换为 normal，并使用 modelMatrix 把法线带到片元阶段做简单漫反射光照。
struct Uniforms {
  modelViewProjectionMatrix: mat4x4<f32>,
  modelMatrix: mat4x4<f32>,
};

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
  output.worldNormal =
    normalize((uniforms.modelMatrix * vec4<f32>(input.normal, 0.0)).xyz);
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

这部分变化说明：这次不是简单把数据源换掉，而是顺手把原来的“顶点色演示”改成了更符合 OBJ 导入场景的“法线驱动光照”。

## 变更三：新增原生 OBJ 解析器与网格归一化逻辑

### 修改前

```ts
// 文件路径: src/lib/loaders/obj-loader.ts
// 函数: N/A（修改前文件不存在）
// 功能: 修改前项目中没有原生 OBJ 解析入口，也没有把模型缩放/居中到统一尺寸的逻辑。
```

### 修改后

```ts
// 文件路径: src/lib/loaders/obj-loader.ts
// 函数: parseObj
// 功能: 解析 OBJ 文本中的 v / vn / f，支持多边形三角化、显式法线、负索引，并把结果打包为 GPU 可直接消费的顶点/索引数组。
export function parseObj(text: string): ObjMesh {
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const packedVertices: number[] = [];
  const packedIndices: number[] = [];
  const vertexMap = new Map<string, number>();

  // 关键点: positionIndex + normalKey 共同决定最终顶点，
  // 这样立方体的硬边不会因为错误去重而被平滑掉。
  const getVertexIndex = (
    positionIndex: number,
    normal: Vec3,
    normalKey: string,
  ): number => {
    const key = `${positionIndex}|${normalKey}`;
    const cachedIndex = vertexMap.get(key);

    if (cachedIndex !== undefined) {
      return cachedIndex;
    }

    const position = positions[positionIndex];

    if (!position) {
      throw new Error(`OBJ position index out of range: ${positionIndex}`);
    }

    packedVertices.push(
      position[0], position[1], position[2],
      normal[0], normal[1], normal[2],
    );

    const nextIndex = packedVertices.length / 6 - 1;
    vertexMap.set(key, nextIndex);
    return nextIndex;
  };

  // ... 解析 v / vn / f，并在需要时生成面法线 ...

  return {
    vertices: new Float32Array(packedVertices),
    indices:
      packedVertices.length / 6 > 65535
        ? new Uint32Array(packedIndices)
        : new Uint16Array(packedIndices),
  };
}
```

```ts
// 文件路径: src/lib/loaders/obj-loader.ts
// 函数: fitMeshToUnitCube
// 功能: 计算包围盒中心和最大边长，把导入网格缩放并居中到统一尺寸，避免模型因大小或偏移问题看不见。
export function fitMeshToUnitCube(
  vertices: Float32Array,
  stride = 6,
): void {
  if (vertices.length === 0) {
    return;
  }

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (let i = 0; i < vertices.length; i += stride) {
    const x = vertices[i];
    const y = vertices[i + 1];
    const z = vertices[i + 2];
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }

  const centerX = (minX + maxX) * 0.5;
  const centerY = (minY + maxY) * 0.5;
  const centerZ = (minZ + maxZ) * 0.5;
  const maxExtent = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
  const scale = maxExtent > 0 ? 2 / maxExtent : 1;

  for (let i = 0; i < vertices.length; i += stride) {
    vertices[i] = (vertices[i] - centerX) * scale;
    vertices[i + 1] = (vertices[i + 1] - centerY) * scale;
    vertices[i + 2] = (vertices[i + 2] - centerZ) * scale;
  }
}
```

这部分变化的关键点是：OBJ 文件本身不能直接喂给 GPU，必须先还原出“位置 + 法线”的最终顶点流；同时还要对模型做尺度和中心归一化，避免导入成功但画面中不可见。

## 变更四：新增立方体 OBJ 资源文件

### 修改前

```obj
# 文件路径: public/models/cube.obj
# 函数: N/A（修改前文件不存在）
# 功能: 修改前没有模型资源文件，页面只能依赖组件内部硬编码的几何数据。
```

### 修改后

```obj
# 文件路径: public/models/cube.obj
# 函数: N/A（资源文件）
# 功能: 定义一个带硬边法线的立方体模型，供页面通过 fetch("/models/cube.obj") 读取。
# 关键点: 6 个法线分别对应 6 个面，保证立方体显示为硬边而不是平滑球面。
v -1 -1 1
v 1 -1 1
v 1 1 1
v -1 1 1
v -1 -1 -1
v 1 -1 -1
v 1 1 -1
v -1 1 -1

vn 0 0 1
vn 0 0 -1
vn 1 0 0
vn -1 0 0
vn 0 1 0
vn 0 -1 0

f 1//1 2//1 3//1 4//1
f 6//2 5//2 8//2 7//2
f 2//3 6//3 7//3 3//3
f 5//4 1//4 4//4 8//4
f 4//5 3//5 7//5 8//5
f 5//6 6//6 2//6 1//6
```

## 变更五：当前工作区中的附带变化（非 OBJ 导入逻辑本身）

### 修改前

```ts
// 文件路径: next-env.d.ts
// 函数: N/A
// 功能: 修改前引用的是开发态生成的 routes 类型文件。
/// <reference types="next" />
/// <reference types="next/image-types/global" />
import "./.next/dev/types/routes.d.ts";
```

### 修改后

```ts
// 文件路径: next-env.d.ts
// 函数: N/A
// 功能: 当前工作区中该文件已切换为构建产物对应的 routes 类型引用；这是构建后的实际变化。
/// <reference types="next" />
/// <reference types="next/image-types/global" />
import "./.next/types/routes.d.ts";
```

这部分记录只是为了如实反映当前 `changes`，不应与本次 OBJ 导入能力的手写实现混为一谈。

## 验证情况

本次修改完成后，已经执行并通过以下检查：

1. `npm run lint`
2. `npm run typecheck`
3. `npm run build`

## 结论

本次修改把 `/webgpu` 页面的立方体渲染，从“组件内部手写几何”升级成了“运行时加载 OBJ 模型”。同时新增了原生 OBJ 解析、模型归一化，以及基于法线的基础光照链路，因此后续继续接入其他 OBJ 文件时，可以沿用同一套加载流程，而不需要继续手写顶点数组。
