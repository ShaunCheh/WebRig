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
        {
          shaderLocation: 0,
          offset: 0,
          format: "float32x3",
        },
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
    const projectionMatrix = createPerspectiveMat4(
      Math.PI / 4,
      aspectRatio,
      0.1,
      100,
    );
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
  },
};
