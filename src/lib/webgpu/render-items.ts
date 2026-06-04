import type { ObjMesh } from "@/lib/loaders/obj-loader";
import { fitMeshToUnitCube, parseObj } from "@/lib/loaders/obj-loader";
import type {
  WebGpuRenderItem,
  WebGpuRenderItemFrameContext,
  WebGpuRenderItemInitializeContext,
} from "@/lib/webgpu/webgpu-engine";
import type { WebGpuProgramDefinition } from "@/lib/webgpu/programs/types";

export type WebGpuRotatingMeshRenderItemOptions = Readonly<{
  modelUrl: string;
  program: WebGpuProgramDefinition;
  cameraDistance: number;
  rotationSpeedX: number;
  rotationSpeedY: number;
}>;

type WebGpuMeshRenderResources = {
  vertexBuffer: GPUBuffer;
  indexBuffer: GPUBuffer;
  uniformBuffer: GPUBuffer;
  uniformValues: Float32Array<ArrayBuffer>;
  pipeline: GPURenderPipeline;
  bindGroup: GPUBindGroup;
  indexCount: number;
  indexFormat: GPUIndexFormat;
};

type WebGpuOverlayRenderResources = {
  vertexBuffer: GPUBuffer;
  vertexData: Float32Array<ArrayBuffer>;
  pipeline: GPURenderPipeline;
  vertexCount: number;
};

const overlayShaderUrl = "/shaders/overlay-square.wgsl";
const overlayVertexStride = 5 * Float32Array.BYTES_PER_ELEMENT;
const overlayVertexCount = 6;
const overlayPaddingPx = 16;
const overlaySizePx = 96;
const overlayColor = {
  r: 0.95,
  g: 0.35,
  b: 0.35,
} as const;

function createUniformValues(byteLength: number): Float32Array<ArrayBuffer> {
  if (byteLength % Float32Array.BYTES_PER_ELEMENT !== 0) {
    throw new Error("Program uniformBufferByteLength 必须是 4 字节对齐。");
  }

  return new Float32Array(byteLength / Float32Array.BYTES_PER_ELEMENT);
}

async function loadTextResource(
  resourceUrl: string,
  resourceName: string,
): Promise<string> {
  const response = await fetch(resourceUrl);

  if (!response.ok) {
    throw new Error(
      `加载 ${resourceName} 失败：${response.status} ${response.statusText || "未知错误"}`,
    );
  }

  return response.text();
}

async function loadMeshAsset(modelUrl: string): Promise<ObjMesh> {
  const modelText = await loadTextResource(modelUrl, "OBJ");
  const mesh = parseObj(modelText);

  fitMeshToUnitCube(mesh.vertices);

  return mesh;
}

function createMeshVertexBuffer(
  device: GPUDevice,
  program: WebGpuProgramDefinition,
  mesh: ObjMesh,
): GPUBuffer {
  const vertexBuffer = device.createBuffer({
    label: `${program.label}-vertex-buffer`,
    size: mesh.vertices.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
  });

  new Float32Array(vertexBuffer.getMappedRange()).set(mesh.vertices);
  vertexBuffer.unmap();

  return vertexBuffer;
}

function createMeshIndexBuffer(
  device: GPUDevice,
  program: WebGpuProgramDefinition,
  mesh: ObjMesh,
): {
  indexBuffer: GPUBuffer;
  indexCount: number;
  indexFormat: GPUIndexFormat;
} {
  const indexBuffer = device.createBuffer({
    label: `${program.label}-index-buffer`,
    size: mesh.indices.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
  });

  if (mesh.indices instanceof Uint32Array) {
    new Uint32Array(indexBuffer.getMappedRange()).set(mesh.indices);
  } else {
    new Uint16Array(indexBuffer.getMappedRange()).set(mesh.indices);
  }

  indexBuffer.unmap();

  return {
    indexBuffer,
    indexCount: mesh.indices.length,
    indexFormat: mesh.indices instanceof Uint32Array ? "uint32" : "uint16",
  };
}

function createProgramRenderPipeline(
  device: GPUDevice,
  program: WebGpuProgramDefinition,
  shaderCode: string,
  presentationFormat: GPUTextureFormat,
): GPURenderPipeline {
  const shaderModule = device.createShaderModule({
    label: `${program.label}-shader`,
    code: shaderCode,
  });

  return device.createRenderPipeline({
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
      targets: [
        {
          format: presentationFormat,
        },
      ],
    },
    primitive: program.primitive,
    depthStencil: program.depthStencil,
  });
}

function createOverlayResources(
  device: GPUDevice,
  presentationFormat: GPUTextureFormat,
  overlayShaderCode: string,
): WebGpuOverlayRenderResources {
  const overlayShaderModule = device.createShaderModule({
    label: "overlay-square-shader",
    code: overlayShaderCode,
  });
  const overlayVertexBuffer = device.createBuffer({
    label: "overlay-square-vertex-buffer",
    size: overlayVertexCount * overlayVertexStride,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });

  try {
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
              {
                shaderLocation: 0,
                offset: 0,
                format: "float32x2",
              },
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
        targets: [
          {
            format: presentationFormat,
          },
        ],
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
  } catch (error) {
    overlayVertexBuffer.destroy();
    throw error;
  }
}

function updateOverlayVertexData(
  overlayResources: WebGpuOverlayRenderResources,
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

  overlayResources.vertexData.set(
    [
      leftNdc,
      topNdc,
      overlayColor.r,
      overlayColor.g,
      overlayColor.b,
      rightNdc,
      topNdc,
      overlayColor.r,
      overlayColor.g,
      overlayColor.b,
      rightNdc,
      bottomNdc,
      overlayColor.r,
      overlayColor.g,
      overlayColor.b,
      leftNdc,
      topNdc,
      overlayColor.r,
      overlayColor.g,
      overlayColor.b,
      rightNdc,
      bottomNdc,
      overlayColor.r,
      overlayColor.g,
      overlayColor.b,
      leftNdc,
      bottomNdc,
      overlayColor.r,
      overlayColor.g,
      overlayColor.b,
    ],
    0,
  );
}

function destroyMeshResources(resources: WebGpuMeshRenderResources | null): void {
  if (resources === null) {
    return;
  }

  resources.vertexBuffer.destroy();
  resources.indexBuffer.destroy();
  resources.uniformBuffer.destroy();
}

function destroyOverlayResources(
  resources: WebGpuOverlayRenderResources | null,
): void {
  if (resources === null) {
    return;
  }

  resources.vertexBuffer.destroy();
}

export function createRotatingMeshRenderItem(
  options: WebGpuRotatingMeshRenderItemOptions,
): WebGpuRenderItem {
  let resources: WebGpuMeshRenderResources | null = null;

  return {
    async initialize({
      device,
      presentationFormat,
    }: WebGpuRenderItemInitializeContext): Promise<void> {
      const [mesh, shaderCode] = await Promise.all([
        loadMeshAsset(options.modelUrl),
        loadTextResource(options.program.shaderUrl, "Shader"),
      ]);
      const vertexBuffer = createMeshVertexBuffer(device, options.program, mesh);
      const {
        indexBuffer,
        indexCount,
        indexFormat,
      } = createMeshIndexBuffer(device, options.program, mesh);
      const uniformValues = createUniformValues(
        options.program.uniformBufferByteLength,
      );
      const uniformBuffer = device.createBuffer({
        label: `${options.program.label}-uniform-buffer`,
        size: options.program.uniformBufferByteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });

      try {
        const pipeline = createProgramRenderPipeline(
          device,
          options.program,
          shaderCode,
          presentationFormat,
        );
        const bindGroup = device.createBindGroup({
          label: `${options.program.label}-bind-group`,
          layout: pipeline.getBindGroupLayout(options.program.bindGroupIndex),
          entries: options.program.createBindGroupEntries({
            uniformBuffer,
          }),
        });

        destroyMeshResources(resources);
        resources = {
          vertexBuffer,
          indexBuffer,
          uniformBuffer,
          uniformValues,
          pipeline,
          bindGroup,
          indexCount,
          indexFormat,
        };
      } catch (error) {
        vertexBuffer.destroy();
        indexBuffer.destroy();
        uniformBuffer.destroy();
        throw error;
      }
    },

    prepareFrame(frameContext: WebGpuRenderItemFrameContext): void {
      if (resources === null) {
        return;
      }

      options.program.writeFrameUniforms({
        uniformValues: resources.uniformValues,
        timestamp: frameContext.timestamp,
        aspectRatio: frameContext.aspectRatio,
        cameraDistance: options.cameraDistance,
        rotationSpeedX: options.rotationSpeedX,
        rotationSpeedY: options.rotationSpeedY,
      });

      frameContext.queue.writeBuffer(
        resources.uniformBuffer,
        0,
        resources.uniformValues,
      );
    },

    encodeRenderPass(
      renderPass: GPURenderPassEncoder,
    ): void {
      if (resources === null) {
        return;
      }

      renderPass.setPipeline(resources.pipeline);
      renderPass.setBindGroup(
        options.program.bindGroupIndex,
        resources.bindGroup,
      );
      renderPass.setVertexBuffer(0, resources.vertexBuffer);
      renderPass.setIndexBuffer(resources.indexBuffer, resources.indexFormat);
      renderPass.drawIndexed(resources.indexCount);
    },

    dispose(): void {
      destroyMeshResources(resources);
      resources = null;
    },
  };
}

export function createOverlayRenderItem(): WebGpuRenderItem {
  let resources: WebGpuOverlayRenderResources | null = null;

  return {
    async initialize({
      device,
      presentationFormat,
    }: WebGpuRenderItemInitializeContext): Promise<void> {
      const overlayShaderCode = await loadTextResource(
        overlayShaderUrl,
        "Overlay Shader",
      );

      destroyOverlayResources(resources);
      resources = createOverlayResources(
        device,
        presentationFormat,
        overlayShaderCode,
      );
    },

    prepareFrame(frameContext: WebGpuRenderItemFrameContext): void {
      if (resources === null) {
        return;
      }

      updateOverlayVertexData(
        resources,
        frameContext.width,
        frameContext.height,
      );
      frameContext.queue.writeBuffer(resources.vertexBuffer, 0, resources.vertexData);
    },

    encodeRenderPass(
      renderPass: GPURenderPassEncoder,
    ): void {
      if (resources === null) {
        return;
      }

      renderPass.setPipeline(resources.pipeline);
      renderPass.setVertexBuffer(0, resources.vertexBuffer);
      renderPass.draw(resources.vertexCount);
    },

    dispose(): void {
      destroyOverlayResources(resources);
      resources = null;
    },
  };
}
