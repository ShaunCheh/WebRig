import { WebGpuSurface } from "@/components/webgpu/webgpu-surface";

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
        shaderUrl="/shaders/basic-lit.wgsl"
        ariaLabel="Rotating WebGPU torus"
      />
    </main>
  );
}
