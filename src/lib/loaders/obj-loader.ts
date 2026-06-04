type Vec3 = [number, number, number];

export type ObjMesh = {
  vertices: Float32Array;
  indices: Uint16Array | Uint32Array;
};

type FaceVertex = {
  positionIndex: number;
  normalIndex: number;
};

function resolveObjIndex(rawValue: string | undefined, count: number): number {
  if (!rawValue) {
    return -1;
  }

  const value = Number.parseInt(rawValue, 10);

  if (Number.isNaN(value) || value === 0) {
    return -1;
  }

  return value > 0 ? value - 1 : count + value;
}

function subtractVec3(left: Vec3, right: Vec3): Vec3 {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function crossVec3(left: Vec3, right: Vec3): Vec3 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function normalizeVec3(value: Vec3): Vec3 {
  const length = Math.hypot(value[0], value[1], value[2]);

  if (length < 1e-8) {
    return [0, 1, 0];
  }

  return [value[0] / length, value[1] / length, value[2] / length];
}

function parseFaceVertex(
  token: string,
  positionCount: number,
  normalCount: number,
): FaceVertex {
  const [positionRaw, , normalRaw] = token.split("/");

  return {
    positionIndex: resolveObjIndex(positionRaw, positionCount),
    normalIndex: resolveObjIndex(normalRaw, normalCount),
  };
}

export function parseObj(text: string): ObjMesh {
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const packedVertices: number[] = [];
  const packedIndices: number[] = [];
  const vertexMap = new Map<string, number>();

  const getVertexIndex = (
    positionIndex: number,
    normal: Vec3,
    normalKey: string,
  ): number => {
    const key = `${positionIndex}|${normalKey}`;
    const cachedIndex = vertexMap.get(key);

    if (cachedIndex !== undefined) {
      return cachedIndex;
    }

    const position = positions[positionIndex];

    if (!position) {
      throw new Error(`OBJ position index out of range: ${positionIndex}`);
    }

    packedVertices.push(
      position[0],
      position[1],
      position[2],
      normal[0],
      normal[1],
      normal[2],
    );

    const nextIndex = packedVertices.length / 6 - 1;
    vertexMap.set(key, nextIndex);

    return nextIndex;
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const [keyword, ...parts] = line.split(/\s+/);

    switch (keyword) {
      case "v":
        positions.push([
          Number(parts[0]),
          Number(parts[1]),
          Number(parts[2]),
        ]);
        break;

      case "vn":
        normals.push(
          normalizeVec3([
            Number(parts[0]),
            Number(parts[1]),
            Number(parts[2]),
          ]),
        );
        break;

      case "f": {
        const corners = parts.map((part) =>
          parseFaceVertex(part, positions.length, normals.length),
        );

        if (corners.length < 3) {
          break;
        }

        for (let i = 1; i < corners.length - 1; i += 1) {
          const triangle = [corners[0], corners[i], corners[i + 1]] as const;

          const position0 = positions[triangle[0].positionIndex];
          const position1 = positions[triangle[1].positionIndex];
          const position2 = positions[triangle[2].positionIndex];

          if (!position0 || !position1 || !position2) {
            throw new Error("OBJ face references an invalid position index.");
          }

          const generatedNormal = normalizeVec3(
            crossVec3(
              subtractVec3(position1, position0),
              subtractVec3(position2, position0),
            ),
          );
          const generatedNormalKey = [
            generatedNormal[0].toFixed(6),
            generatedNormal[1].toFixed(6),
            generatedNormal[2].toFixed(6),
          ].join(",");

          for (const corner of triangle) {
            const hasExplicitNormal = corner.normalIndex >= 0;
            const normal = hasExplicitNormal
              ? normals[corner.normalIndex]
              : generatedNormal;

            if (!normal) {
              throw new Error("OBJ face references an invalid normal index.");
            }

            const normalKey = hasExplicitNormal
              ? `n:${corner.normalIndex}`
              : `g:${generatedNormalKey}`;

            packedIndices.push(
              getVertexIndex(corner.positionIndex, normal, normalKey),
            );
          }
        }

        break;
      }

      default:
        break;
    }
  }

  if (positions.length === 0) {
    throw new Error("OBJ 文件不包含任何顶点位置。");
  }

  if (packedIndices.length === 0) {
    throw new Error("OBJ 文件不包含任何可渲染的面。");
  }

  const vertexCount = packedVertices.length / 6;

  return {
    vertices: new Float32Array(packedVertices),
    indices:
      vertexCount > 65535
        ? new Uint32Array(packedIndices)
        : new Uint16Array(packedIndices),
  };
}

export function fitMeshToUnitCube(
  vertices: Float32Array,
  stride = 6,
): void {
  if (vertices.length === 0) {
    return;
  }

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (let i = 0; i < vertices.length; i += stride) {
    const x = vertices[i];
    const y = vertices[i + 1];
    const z = vertices[i + 2];

    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }

  const centerX = (minX + maxX) * 0.5;
  const centerY = (minY + maxY) * 0.5;
  const centerZ = (minZ + maxZ) * 0.5;
  const maxExtent = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
  const scale = maxExtent > 0 ? 2 / maxExtent : 1;

  for (let i = 0; i < vertices.length; i += stride) {
    vertices[i] = (vertices[i] - centerX) * scale;
    vertices[i + 1] = (vertices[i + 1] - centerY) * scale;
    vertices[i + 2] = (vertices[i + 2] - centerZ) * scale;
  }
}
