"use client";

import { useCallback } from "react";
import { WebGpuSurface } from "@/components/webgpu/webgpu-surface";
import { basicLitProgram } from "@/lib/webgpu/programs/basic-lit-program";
import {
  createOverlayRenderItem,
  createRotatingMeshRenderItem,
} from "@/lib/webgpu/render-items";

export default function WebGpuPage() {
  const createRenderItems = useCallback(function createWebGpuPageRenderItems() {
    return [
      createRotatingMeshRenderItem({
        modelUrl: "/models/torus.obj",
        program: basicLitProgram,
        cameraDistance: -5,
        rotationSpeedX: 0.0007,
        rotationSpeedY: 0.001,
      }),
      createOverlayRenderItem(),
    ] as const;
  }, []);

  return (
    <main
      style={{
        width: "100vw",
        height: "100vh",
      }}
    >
      <WebGpuSurface
        createRenderItems={createRenderItems}
        ariaLabel="Rotating WebGPU torus"
      />
    </main>
  );
}
