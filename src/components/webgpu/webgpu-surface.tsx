"use client";

import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { fitMeshToUnitCube, parseObj } from "@/lib/loaders/obj-loader";
import type { WebGpuProgramDefinition } from "@/lib/webgpu/programs/types";

const defaultBackgroundColor = "#020617";
const defaultClearColor = {
  r: 0.02,
  g: 0.04,
  b: 0.08,
  a: 1,
} as const;

function createUniformValues(byteLength: number): Float32Array<ArrayBuffer> {
  if (byteLength % Float32Array.BYTES_PER_ELEMENT !== 0) {
    throw new Error("Program uniformBufferByteLength 必须是 4 字节对齐。");
  }

  return new Float32Array(byteLength / Float32Array.BYTES_PER_ELEMENT);
}

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

type SurfaceClearColor = {
  r: number;
  g: number;
  b: number;
  a?: number;
};

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

export function WebGpuSurface({
  modelUrl,
  program,
  ariaLabel = "WebGPU surface",
  cameraDistance = -5,
  rotationSpeedX = 0.0007,
  rotationSpeedY = 0.001,
  backgroundColor = defaultBackgroundColor,
  clearColor,
  style,
}: WebGpuSurfaceProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState<Status>({
    phase: "initializing",
    message: "正在初始化 WebGPU...",
  });

  const clearRed = clearColor?.r ?? defaultClearColor.r;
  const clearGreen = clearColor?.g ?? defaultClearColor.g;
  const clearBlue = clearColor?.b ?? defaultClearColor.b;
  const clearAlpha = clearColor?.a ?? defaultClearColor.a;

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const uniformValues = createUniformValues(program.uniformBufferByteLength);

    let isDisposed = false;
    let animationFrameId = 0;
    let device: GPUDevice | null = null;
    let depthTexture: GPUTexture | null = null;
    let vertexBuffer: GPUBuffer | null = null;
    let indexBuffer: GPUBuffer | null = null;
    let uniformBuffer: GPUBuffer | null = null;
    let indexCount = 0;
    let indexFormat: GPUIndexFormat = "uint16";

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
        label: "surface-depth-texture",
        size: [nextWidth, nextHeight],
        format: "depth24plus",
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });

      return { width: nextWidth, height: nextHeight };
    };

    const initializeSurface = async () => {
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

        updateStatus({
          phase: "initializing",
          message: "正在加载场景资源...",
        });

        const [modelResponse, shaderResponse] = await Promise.all([
          fetch(modelUrl),
          fetch(program.shaderUrl),
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

        if (isDisposed) {
          return;
        }

        const shaderModule = device.createShaderModule({
          label: `${program.label}-shader`,
          code: shaderCode,
        });

        indexCount = mesh.indices.length;
        indexFormat = mesh.indices instanceof Uint32Array ? "uint32" : "uint16";

        vertexBuffer = device.createBuffer({
          label: `${program.label}-vertex-buffer`,
          size: mesh.vertices.byteLength,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
          mappedAtCreation: true,
        });
        new Float32Array(vertexBuffer.getMappedRange()).set(mesh.vertices);
        vertexBuffer.unmap();

        indexBuffer = device.createBuffer({
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
            targets: [
              {
                format: presentationFormat,
              },
            ],
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
          program.writeFrameUniforms({
            uniformValues,
            timestamp,
            aspectRatio,
            cameraDistance,
            rotationSpeedX,
            rotationSpeedY,
          });

          device.queue.writeBuffer(uniformBuffer, 0, uniformValues);

          const commandEncoder = device.createCommandEncoder({
            label: "surface-command-encoder",
          });
          const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [
              {
                view: context.getCurrentTexture().createView(),
                clearValue: {
                  r: clearRed,
                  g: clearGreen,
                  b: clearBlue,
                  a: clearAlpha,
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
          renderPass.setBindGroup(program.bindGroupIndex, bindGroup);
          renderPass.setVertexBuffer(0, vertexBuffer);
          renderPass.setIndexBuffer(indexBuffer, indexFormat);
          renderPass.drawIndexed(indexCount);
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

    void initializeSurface();

    return () => {
      isDisposed = true;
      window.cancelAnimationFrame(animationFrameId);
      destroyGpuResources();
      device?.destroy();
      device = null;
    };
  }, [
    cameraDistance,
    clearAlpha,
    clearBlue,
    clearGreen,
    clearRed,
    modelUrl,
    program,
    rotationSpeedX,
    rotationSpeedY,
  ]);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        ...style,
        backgroundColor,
      }}
    >
      <canvas
        ref={canvasRef}
        aria-label={ariaLabel}
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
