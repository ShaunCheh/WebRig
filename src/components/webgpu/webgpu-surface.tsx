"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  WebGpuEngine,
  type WebGpuClearColor,
  type WebGpuEngineStatus,
  type WebGpuRenderItem,
} from "@/lib/webgpu/webgpu-engine";
import {
  createOverlayRenderItem,
  createRotatingMeshRenderItem,
} from "@/lib/webgpu/render-items";
import type { WebGpuProgramDefinition } from "@/lib/webgpu/programs/types";

const defaultBackgroundColor = "#020617";
const defaultClearColor = {
  r: 0.02,
  g: 0.04,
  b: 0.08,
  a: 1,
} as const;

type WebGpuSurfaceClearColor = {
  r: number;
  g: number;
  b: number;
  a?: number;
};

function createClearColor(
  clearColor: WebGpuSurfaceClearColor | undefined,
): WebGpuClearColor {
  return {
    r: clearColor?.r ?? defaultClearColor.r,
    g: clearColor?.g ?? defaultClearColor.g,
    b: clearColor?.b ?? defaultClearColor.b,
    a: clearColor?.a ?? defaultClearColor.a,
  };
}

export type WebGpuSurfaceProps = Readonly<{
  ariaLabel?: string;
  backgroundColor?: string;
  clearColor?: WebGpuSurfaceClearColor;
  style?: CSSProperties;
}> &
  (
    | Readonly<{
        renderItems: readonly WebGpuRenderItem[];
        modelUrl?: never;
        program?: never;
        cameraDistance?: never;
        rotationSpeedX?: never;
        rotationSpeedY?: never;
      }>
    | Readonly<{
        modelUrl: string;
        program: WebGpuProgramDefinition;
        cameraDistance?: number;
        rotationSpeedX?: number;
        rotationSpeedY?: number;
        renderItems?: never;
      }>
  );

export function WebGpuSurface(props: WebGpuSurfaceProps) {
  const {
    ariaLabel = "WebGPU surface",
    backgroundColor = defaultBackgroundColor,
    clearColor,
    style,
  } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState<WebGpuEngineStatus>({
    phase: "initializing",
    message: "正在初始化 WebGPU...",
  });

  const clearRed = clearColor?.r ?? defaultClearColor.r;
  const clearGreen = clearColor?.g ?? defaultClearColor.g;
  const clearBlue = clearColor?.b ?? defaultClearColor.b;
  const clearAlpha = clearColor?.a ?? defaultClearColor.a;
  const renderItemsProp = "renderItems" in props ? props.renderItems : undefined;
  const modelUrl = "renderItems" in props ? undefined : props.modelUrl;
  const program = "renderItems" in props ? undefined : props.program;
  const cameraDistance =
    "renderItems" in props ? undefined : (props.cameraDistance ?? -5);
  const rotationSpeedX =
    "renderItems" in props ? undefined : (props.rotationSpeedX ?? 0.0007);
  const rotationSpeedY =
    "renderItems" in props ? undefined : (props.rotationSpeedY ?? 0.001);
  const defaultRenderItems = useMemo<readonly WebGpuRenderItem[] | null>(
    function createDefaultRenderItems() {
      if (
        renderItemsProp !== undefined ||
        modelUrl === undefined ||
        program === undefined ||
        cameraDistance === undefined ||
        rotationSpeedX === undefined ||
        rotationSpeedY === undefined
      ) {
        return null;
      }

      return [
        createRotatingMeshRenderItem({
          modelUrl,
          program,
          cameraDistance,
          rotationSpeedX,
          rotationSpeedY,
        }),
        createOverlayRenderItem(),
      ];
    },
    [
      renderItemsProp,
      modelUrl,
      program,
      cameraDistance,
      rotationSpeedX,
      rotationSpeedY,
    ],
  );
  const resolvedRenderItems = useMemo<readonly WebGpuRenderItem[]>(
    function resolveRenderItems() {
      if (renderItemsProp !== undefined) {
        return renderItemsProp;
      }

      return defaultRenderItems ?? [];
    },
    [renderItemsProp, defaultRenderItems],
  );

  useEffect(function setupSurfaceEngine() {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const normalizedClearColor = createClearColor({
      r: clearRed,
      g: clearGreen,
      b: clearBlue,
      a: clearAlpha,
    });

    function handleEngineStatusChange(nextStatus: WebGpuEngineStatus): void {
      setStatus(nextStatus);
    }

    const engine = new WebGpuEngine({
      canvas,
      renderItems: resolvedRenderItems,
      clearColor: normalizedClearColor,
      onStatusChange: handleEngineStatusChange,
    });

    void engine.start();

    return function cleanupSurfaceEngine(): void {
      engine.dispose();
    };
  }, [
    clearAlpha,
    clearBlue,
    clearGreen,
    clearRed,
    resolvedRenderItems,
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
