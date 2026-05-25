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
  // Front
  -1, -1, 1, 1, 0, 0,
  1, -1, 1, 1, 0, 0,
  1, 1, 1, 1, 0, 0,
  -1, 1, 1, 1, 0, 0,
  // Back
  1, -1, -1, 0, 1, 0,
  -1, -1, -1, 0, 1, 0,
  -1, 1, -1, 0, 1, 0,
  1, 1, -1, 0, 1, 0,
  // Right
  1, -1, 1, 0, 0, 1,
  1, -1, -1, 0, 0, 1,
  1, 1, -1, 0, 0, 1,
  1, 1, 1, 0, 0, 1,
  // Left
  -1, -1, -1, 1, 1, 0,
  -1, -1, 1, 1, 1, 0,
  -1, 1, 1, 1, 1, 0,
  -1, 1, -1, 1, 1, 0,
  // Top
  -1, 1, 1, 1, 0, 1,
  1, 1, 1, 1, 0, 1,
  1, 1, -1, 1, 0, 1,
  -1, 1, -1, 1, 0, 1,
  // Bottom
  -1, -1, -1, 0, 1, 1,
  1, -1, -1, 0, 1, 1,
  1, -1, 1, 0, 1, 1,
  -1, -1, 1, 0, 1, 1,
]);

const cubeIndices = new Uint16Array([
  0, 1, 2, 0, 2, 3,
  4, 5, 6, 4, 6, 7,
  8, 9, 10, 8, 10, 11,
  12, 13, 14, 12, 14, 15,
  16, 17, 18, 16, 18, 19,
  20, 21, 22, 20, 22, 23,
]);

const vertexStride = 6 * Float32Array.BYTES_PER_ELEMENT;
const cubeDistance = -5;

type Status =
  | {
      phase: "initializing";
      message: string;
    }
  | {
      phase: "ready";
      message: "";
    }
  | {
      phase: "unsupported" | "error";
      message: string;
    };

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
      if (!isDisposed) {
        setStatus(nextStatus);
      }
    };

    const destroyGpuResources = () => {
      depthTexture?.destroy();
      vertexBuffer?.destroy();
      indexBuffer?.destroy();
      uniformBuffer?.destroy();

      depthTexture = null;
      vertexBuffer = null;
      indexBuffer = null;
      uniformBuffer = null;
    };

    const ensureDrawableSize = (activeDevice: GPUDevice) => {
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

      try {
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

        void device.lost.then((info) => {
          if (isDisposed) {
            return;
          }

          updateStatus({
            phase: "error",
            message: `GPU 设备已断开：${info.message || info.reason}`,
          });
        });

        const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

        context.configure({
          device,
          format: presentationFormat,
          alphaMode: "opaque",
        });

        const shaderModule = device.createShaderModule({
          label: "cube-shader",
          code: shaderCode,
        });

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

        uniformBuffer = device.createBuffer({
          label: "cube-uniform-buffer",
          size: 16 * Float32Array.BYTES_PER_ELEMENT,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        const pipeline = device.createRenderPipeline({
          label: "cube-render-pipeline",
          layout: "auto",
          vertex: {
            module: shaderModule,
            entryPoint: "vsMain",
            buffers: [
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
          },
          fragment: {
            module: shaderModule,
            entryPoint: "fsMain",
            targets: [
              {
                format: presentationFormat,
              },
            ],
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
          label: "cube-bind-group",
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

        updateStatus({
          phase: "ready",
          message: "",
        });

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
          const projectionMatrix = createPerspectiveMat4(
            Math.PI / 4,
            aspectRatio,
            0.1,
            100,
          );
          const rotationXMatrix = createRotationXMat4(timestamp * 0.0007);
          const rotationYMatrix = createRotationYMat4(timestamp * 0.001);
          const modelMatrix = multiplyMat4(rotationYMatrix, rotationXMatrix);
          const viewMatrix = createTranslationMat4(0, 0, cubeDistance);
          const viewModelMatrix = multiplyMat4(viewMatrix, modelMatrix);
          const modelViewProjectionMatrix = multiplyMat4(
            projectionMatrix,
            viewModelMatrix,
          );

          device.queue.writeBuffer(uniformBuffer, 0, modelViewProjectionMatrix);

          const commandEncoder = device.createCommandEncoder({
            label: "cube-command-encoder",
          });
          const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [
              {
                view: context.getCurrentTexture().createView(),
                clearValue: {
                  r: 0.02,
                  g: 0.04,
                  b: 0.08,
                  a: 1,
                },
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
      } catch (error) {
        updateStatus({
          phase: "error",
          message:
            error instanceof Error
              ? error.message
              : "初始化 WebGPU 时发生未知错误。",
        });
      }
    };

    void initialize();

    return () => {
      isDisposed = true;
      window.cancelAnimationFrame(animationFrameId);
      destroyGpuResources();
      device?.destroy();
      device = null;
    };
  }, []);

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
}
