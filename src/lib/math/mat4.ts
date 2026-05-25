export type Mat4 = Float32Array;

export function multiplyMat4(left: Mat4, right: Mat4): Mat4 {
  const out = new Float32Array(16);

  const a00 = left[0];
  const a01 = left[1];
  const a02 = left[2];
  const a03 = left[3];
  const a10 = left[4];
  const a11 = left[5];
  const a12 = left[6];
  const a13 = left[7];
  const a20 = left[8];
  const a21 = left[9];
  const a22 = left[10];
  const a23 = left[11];
  const a30 = left[12];
  const a31 = left[13];
  const a32 = left[14];
  const a33 = left[15];

  let b0 = right[0];
  let b1 = right[1];
  let b2 = right[2];
  let b3 = right[3];

  out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

  b0 = right[4];
  b1 = right[5];
  b2 = right[6];
  b3 = right[7];

  out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

  b0 = right[8];
  b1 = right[9];
  b2 = right[10];
  b3 = right[11];

  out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

  b0 = right[12];
  b1 = right[13];
  b2 = right[14];
  b3 = right[15];

  out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

  return out;
}

export function createPerspectiveMat4(
  verticalFieldOfViewRadians: number,
  aspectRatio: number,
  near: number,
  far: number,
): Mat4 {
  const out = new Float32Array(16);
  const f = 1 / Math.tan(verticalFieldOfViewRadians * 0.5);
  const rangeInverse = 1 / (near - far);

  out[0] = f / aspectRatio;
  out[5] = f;
  out[10] = far * rangeInverse;
  out[11] = -1;
  out[14] = near * far * rangeInverse;

  return out;
}

export function createRotationXMat4(radians: number): Mat4 {
  const sine = Math.sin(radians);
  const cosine = Math.cos(radians);

  return new Float32Array([
    1,
    0,
    0,
    0,
    0,
    cosine,
    sine,
    0,
    0,
    -sine,
    cosine,
    0,
    0,
    0,
    0,
    1,
  ]);
}

export function createRotationYMat4(radians: number): Mat4 {
  const sine = Math.sin(radians);
  const cosine = Math.cos(radians);

  return new Float32Array([
    cosine,
    0,
    -sine,
    0,
    0,
    1,
    0,
    0,
    sine,
    0,
    cosine,
    0,
    0,
    0,
    0,
    1,
  ]);
}

export function createTranslationMat4(x: number, y: number, z: number): Mat4 {
  return new Float32Array([
    1,
    0,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    0,
    1,
    0,
    x,
    y,
    z,
    1,
  ]);
}
