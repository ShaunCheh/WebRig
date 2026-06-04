// 文件路径: public/shaders/basic-lit.wgsl
// 功能: 提供当前 WebGpuSurface 默认使用的基础光照 shader。
// 约定:
// 1. @location(0) 为 position: vec3<f32>
// 2. @location(1) 为 normal: vec3<f32>
// 3. @group(0) @binding(0) 为 Uniforms

struct Uniforms {
  modelViewProjectionMatrix: mat4x4<f32>,
  modelMatrix: mat4x4<f32>,
};

@group(0) @binding(0)
var<uniform> uniforms: Uniforms;

struct VertexInput {
  @location(0) position: vec3<f32>,
  @location(1) normal: vec3<f32>,
};

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) worldNormal: vec3<f32>,
};

@vertex
fn vsMain(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  output.position = uniforms.modelViewProjectionMatrix * vec4<f32>(input.position, 1.0);
  output.worldNormal = normalize((uniforms.modelMatrix * vec4<f32>(input.normal, 0.0)).xyz);
  return output;
}

@fragment
fn fsMain(input: VertexOutput) -> @location(0) vec4<f32> {
  let lightDirection = normalize(vec3<f32>(0.45, 0.7, 1.0));
  let diffuse = max(dot(normalize(input.worldNormal), lightDirection), 0.0);
  let ambient = 0.22;
  let baseColor = vec3<f32>(0.35, 0.72, 1.0);

  return vec4<f32>(baseColor * (ambient + diffuse * 0.78), 1.0);
}
