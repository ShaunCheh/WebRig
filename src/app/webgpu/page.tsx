"use client";

import { WebGpuSurface } from "@/components/webgpu/webgpu-surface";
import { basicLitProgram } from "@/lib/webgpu/programs/basic-lit-program";

export default function WebGpuPage() {
  return (
    <main
      style={{
        width: "100vw",
        height: "100vh",
      }}
    >
      <WebGpuSurface
        modelUrl="/models/torus.obj"
        program={basicLitProgram}
        ariaLabel="Rotating WebGPU torus"
      />
    </main>
  );
}
