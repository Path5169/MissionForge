import struct
import json
import os

path = r"c:\Users\PARTH\Downloads\industrial platform 3d model.glb"

with open(path, "rb") as f:
    magic, version, length = struct.unpack("<4sII", f.read(12))
    chunk_len, chunk_type = struct.unpack("<I4s", f.read(8))
    gltf = json.loads(f.read(chunk_len).decode("utf-8"))

print("=== MESHES ===")
for i, m in enumerate(gltf.get("meshes", [])):
    print(f"Mesh {i}: {m.get('name')}, primitives: {len(m.get('primitives', []))}")

print("\n=== MATERIALS ===")
for i, mat in enumerate(gltf.get("materials", [])):
    name = mat.get("name")
    pbr = mat.get("pbrMetallicRoughness", {})
    print(f"Material {i}: {name}")
    print(f"  baseColorFactor: {pbr.get('baseColorFactor')}")
    print(f"  baseColorTexture: {pbr.get('baseColorTexture')}")
    print(f"  metallicRoughnessTexture: {pbr.get('metallicRoughnessTexture')}")
    print(f"  normalTexture: {mat.get('normalTexture')}")

print("\n=== IMAGES ===")
for i, img in enumerate(gltf.get("images", [])):
    print(f"Image {i}: name={img.get('name')}, mimeType={img.get('mimeType')}")

accessors = gltf.get("accessors", [])
for m in gltf.get("meshes", []):
    for prim in m.get("primitives", []):
        pos_idx = prim.get("attributes", {}).get("POSITION")
        if pos_idx is not None:
            acc = accessors[pos_idx]
            print(f"\nPosition Accessor min: {acc.get('min')}, max: {acc.get('max')}, count: {acc.get('count')}")
