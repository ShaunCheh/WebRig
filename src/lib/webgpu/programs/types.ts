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
  createBindGroupEntries(args: WebGpuProgramBindGroupArgs): GPUBindGroupEntry[];
  writeFrameUniforms(args: WebGpuProgramFrameUniformArgs): void;
}>;
