# 20260604_154333_CST_pipeline-descriptor-split-record

## 记录依据

本记录基于当前工作区中 `src/lib/webgpu/webgpu-engine.ts` 的相关 `changes` 与对应 `git diff` 整理，不直接粘贴原始 diff，而是按“修改前 / 修改后”的方式，如实记录刚刚这次将 `render pipeline` 的 descriptor 从 `createRenderPipeline()` 中拆出的改动。

截至记录时，`git status --short` 显示当前工作区中与本次改动直接相关的已跟踪文件如下：

- `M src/lib/webgpu/webgpu-engine.ts`

需要特别说明：

1. 当前 `webgpu-engine.ts` 工作区内容中还存在一段额外的临时调试逻辑：`printCounter` 与 `console.log("commandEncoder", commandEncoder)`。
2. 这段调试逻辑**不在本次 `git diff` 中**，因此本记录不会把它归为“刚刚这次修改”的内容。
3. 本记录只覆盖 `git diff` 中真实出现的那部分变更，也就是“先组 `pipelineDescriptor`，再创建 pipeline”。

## 当前 changes 概览

本次改动的核心事实是：

1. `createRenderPipeline()` 不再直接内联组装 `GPURenderPipelineDescriptor`。
2. 新增了 `createRenderPipelineDescriptor()`，专门返回一个显式的 `GPURenderPipelineDescriptor`。
3. `createRenderPipeline()` 现在改成“先拿 descriptor，再调用 `device.createRenderPipeline()`”。

这次改动不改变运行时渲染结果，主要提升的是 `pipeline` 配置的可观察性和调试可读性。

## 变更一：`createRenderPipeline()` 从“直接内联创建”改为“先生成 descriptor 再创建”

### 修改前

```ts
// 文件路径: src/lib/webgpu/webgpu-engine.ts
// 函数: createRenderPipeline
// 功能: 修改前直接在 device.createRenderPipeline(...) 调用里内联拼装整份 pipeline descriptor。
private createRenderPipeline(
  shaderModule: GPUShaderModule,
  presentationFormat: GPUTextureFormat,
): GPURenderPipeline {
  const device = this.getDeviceOrThrow();

  return device.createRenderPipeline({
    label: `${this.program.label}-render-pipeline`,
    layout: "auto",
    vertex: {
      module: shaderModule,
      entryPoint: this.program.vertexEntryPoint,
      buffers: this.program.vertexBufferLayouts,
    },
    fragment: {
      module: shaderModule,
      entryPoint: this.program.fragmentEntryPoint,
      targets: [
        {
          format: presentationFormat,
        },
      ],
    },
    primitive: this.program.primitive,
    depthStencil: this.program.depthStencil,
  });
}
```

### 修改后

```ts
// 文件路径: src/lib/webgpu/webgpu-engine.ts
// 函数: createRenderPipeline / createRenderPipelineDescriptor
// 功能: 修改后先显式生成 pipelineDescriptor，再调用 createRenderPipeline()；便于断点观察、临时打印和后续扩展。
private createRenderPipeline(
  shaderModule: GPUShaderModule,
  presentationFormat: GPUTextureFormat,
): GPURenderPipeline {
  const device = this.getDeviceOrThrow();
  const pipelineDescriptor = this.createRenderPipelineDescriptor(
    shaderModule,
    presentationFormat,
  );

  return device.createRenderPipeline(pipelineDescriptor);
}

private createRenderPipelineDescriptor(
  shaderModule: GPUShaderModule,
  presentationFormat: GPUTextureFormat,
): GPURenderPipelineDescriptor {
  return {
    label: `${this.program.label}-render-pipeline`,
    layout: "auto",
    vertex: {
      module: shaderModule,
      entryPoint: this.program.vertexEntryPoint,
      buffers: this.program.vertexBufferLayouts,
    },
    fragment: {
      module: shaderModule,
      entryPoint: this.program.fragmentEntryPoint,
      targets: [
        {
          format: presentationFormat,
        },
      ],
    },
    primitive: this.program.primitive,
    depthStencil: this.program.depthStencil,
  };
}
```

这部分变化的关键点是：原来“隐藏在函数调用参数里的 pipeline 内容”，现在被提升成了一个显式命名的 descriptor 构造步骤。

## 变更二：新增 `createRenderPipelineDescriptor()`，让 pipeline 内容可单独观察

### 修改前

```ts
// 文件路径: src/lib/webgpu/webgpu-engine.ts
// 函数: createRenderPipelineDescriptor
// 功能: 修改前没有这个函数，想看 pipeline 的完整内容时，只能从 createRenderPipeline(...) 的内联参数里读。
// 修改前: 函数不存在。
```

### 修改后

```ts
// 文件路径: src/lib/webgpu/webgpu-engine.ts
// 函数: createRenderPipelineDescriptor
// 功能: 修改后将 pipeline 的 descriptor 构造独立出来，后续可以在这里直接打断点、临时打印、或继续拆分子结构。
private createRenderPipelineDescriptor(
  shaderModule: GPUShaderModule,
  presentationFormat: GPUTextureFormat,
): GPURenderPipelineDescriptor {
  return {
    label: `${this.program.label}-render-pipeline`,
    layout: "auto",
    vertex: {
      module: shaderModule,
      entryPoint: this.program.vertexEntryPoint,
      buffers: this.program.vertexBufferLayouts,
    },
    fragment: {
      module: shaderModule,
      entryPoint: this.program.fragmentEntryPoint,
      targets: [
        {
          format: presentationFormat,
        },
      ],
    },
    primitive: this.program.primitive,
    depthStencil: this.program.depthStencil,
  };
}
```

它并没有引入新的渲染逻辑，而是把现有 `pipeline` 配置显式命名化了。

## 未纳入本次记录但当前工作区中存在的附带变化

当前 `src/lib/webgpu/webgpu-engine.ts` 里还可以看到如下调试逻辑：

```ts
// 文件路径: src/lib/webgpu/webgpu-engine.ts
// 函数: renderFrame
// 功能: 当前工作区里存在一段临时调试输出，用于周期性打印 commandEncoder。
this.printCounter++;
if (this.printCounter % 100 === 0) {
  console.log("commandEncoder", commandEncoder);
}
```

以及一个用于计数的字段：

```ts
// 文件路径: src/lib/webgpu/webgpu-engine.ts
// 位置: 类字段
// 功能: 当前工作区里存在一个临时调试计数字段。
private printCounter: number = 0;
```

但这两处内容**不在本次 `git diff` 中**，因此不应作为“刚刚这次修改”的正式变更内容来记录。

## 验证情况

本次修改完成后，已经执行并通过以下检查：

1. `npm run typecheck`
2. `ReadLints` 对 `src/lib/webgpu/webgpu-engine.ts` 未发现新的 linter 问题

## 结论

本次“刚刚的修改”是一次针对调试体验与可读性的结构优化：

1. `createRenderPipeline()` 从“内联配置并立即创建”改成了“先生成 descriptor，再创建 pipeline”。
2. 新增 `createRenderPipelineDescriptor()`，使 `pipeline` 配置本身成为一个可单独观察和调试的对象。
3. 渲染行为没有改变，核心收益在于后续查看 `pipeline` 内容时，不必再从 `device.createRenderPipeline({...})` 的内联对象里硬读。
