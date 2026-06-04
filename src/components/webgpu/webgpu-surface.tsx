"use client";

import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import {
  WebGpuEngine,
  type WebGpuClearColor,
  type WebGpuEngineStatus,
  type WebGpuRenderItemsFactory,
} from "@/lib/webgpu/webgpu-engine";

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
  createRenderItems: WebGpuRenderItemsFactory;
  ariaLabel?: string;
  backgroundColor?: string;
  clearColor?: WebGpuSurfaceClearColor;
  style?: CSSProperties;
}>;

export function WebGpuSurface(props: WebGpuSurfaceProps) {
  const {
    createRenderItems,
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
      createRenderItems,
      clearColor: normalizedClearColor,
      onStatusChange: handleEngineStatusChange,
    });

    void engine.start();

    return function cleanupSurfaceEngine(): void {
      engine.dispose();
    };
  }, [
    createRenderItems,
    clearAlpha,
    clearBlue,
    clearGreen,
    clearRed,
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
