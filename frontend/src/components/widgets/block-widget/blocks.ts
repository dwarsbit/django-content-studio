import type { BlockDefinition, BlockValue } from "@/types";

/**
 * A block's id identifies one block on one page. crypto.randomUUID only
 * exists in secure contexts, so an admin served over plain HTTP falls
 * back to random bytes.
 */
export function newBlockId(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

/** A new block, with the defaults of its fields. */
export function createBlock(definition: BlockDefinition): BlockValue {
  const data: Record<string, unknown> = {};

  for (const [name, field] of Object.entries(definition.fields)) {
    if (field.default !== undefined) {
      data[name] = structuredClone(field.default);
    }
  }

  return { id: newBlockId(), type: definition.name, data };
}

export function moveBlock(
  blocks: BlockValue[],
  from: number,
  to: number,
): BlockValue[] {
  if (to < 0 || to >= blocks.length) {
    return blocks;
  }

  const moved = [...blocks];
  const [block] = moved.splice(from, 1);
  moved.splice(to, 0, block);

  return moved;
}

/** A copy of the block, with its own id, right after the original. */
export function duplicateBlock(
  blocks: BlockValue[],
  index: number,
): { blocks: BlockValue[]; copy: BlockValue } {
  const copy = { ...structuredClone(blocks[index]), id: newBlockId() };

  return {
    blocks: [...blocks.slice(0, index + 1), copy, ...blocks.slice(index + 1)],
    copy,
  };
}

/**
 * A one-line summary for the block's header: its first text value
 * (without markup), or else the name of its first related object.
 */
export function blockSummary(
  definition: BlockDefinition,
  block: BlockValue,
): string {
  for (const name of Object.keys(definition.fields)) {
    const value = block.data?.[name];

    if (typeof value === "string") {
      const text = value
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      if (text) {
        return text;
      }
    } else if (
      value &&
      typeof value === "object" &&
      "__str__" in value &&
      typeof value.__str__ === "string"
    ) {
      return value.__str__;
    }
  }

  return "";
}
