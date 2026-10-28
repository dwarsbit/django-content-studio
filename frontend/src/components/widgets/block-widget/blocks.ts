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

/**
 * A copy of a block with new ids, for it and for the blocks inside it:
 * ids are unique across all lists of a block field.
 */
function copyBlock(block: BlockValue): BlockValue {
  const data = Object.fromEntries(
    Object.entries(block.data ?? {}).map(([name, value]) => [
      name,
      Array.isArray(value) && value.every(isBlockValue)
        ? value.map(copyBlock)
        : structuredClone(value),
    ]),
  );

  return { ...block, id: newBlockId(), data };
}

function isBlockValue(value: unknown): value is BlockValue {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "type" in value &&
    "data" in value
  );
}

/** A copy of the block, with its own id, right after the original. */
export function duplicateBlock(
  blocks: BlockValue[],
  index: number,
): { blocks: BlockValue[]; copy: BlockValue } {
  const copy = copyBlock(blocks[index]);

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

/**
 * A list of blocks in a block field: the field's own list ("root"), or a
 * block field inside one of its blocks, "<block id>:<field name>".
 */
export type ListId = string;

export const ROOT_LIST: ListId = "root";

export function nestedListId(blockId: string, field: string): ListId {
  return `${blockId}:${field}`;
}

function parseListId(list: ListId): { blockId: string; field: string } | null {
  if (list === ROOT_LIST) {
    return null;
  }

  const at = list.lastIndexOf(":");
  return { blockId: list.slice(0, at), field: list.slice(at + 1) };
}

function asBlocks(value: unknown): BlockValue[] {
  return Array.isArray(value) ? (value as BlockValue[]) : [];
}

/** The blocks of a list, from the field's value. */
export function getList(root: BlockValue[], list: ListId): BlockValue[] {
  const ref = parseListId(list);

  if (!ref) {
    return root;
  }

  const parent = root.find((block) => block.id === ref.blockId);
  return asBlocks(parent?.data?.[ref.field]);
}

/** The field's value with the blocks of a list replaced. */
export function setList(
  root: BlockValue[],
  list: ListId,
  blocks: BlockValue[],
): BlockValue[] {
  const ref = parseListId(list);

  if (!ref) {
    return blocks;
  }

  return root.map((block) =>
    block.id === ref.blockId
      ? { ...block, data: { ...block.data, [ref.field]: blocks } }
      : block,
  );
}

/** The list a block is in, and where, or null. */
export function findBlock(
  root: BlockValue[],
  id: string,
): { list: ListId; index: number } | null {
  const index = root.findIndex((block) => block.id === id);

  if (index !== -1) {
    return { list: ROOT_LIST, index };
  }

  for (const parent of root) {
    for (const [field, value] of Object.entries(parent.data ?? {})) {
      const nested = asBlocks(value);
      const at = nested.findIndex(
        (block) => block && typeof block === "object" && block.id === id,
      );

      if (at !== -1) {
        return { list: nestedListId(parent.id, field), index: at };
      }
    }
  }

  return null;
}

/**
 * The field's value with a block moved to index of a list (counted
 * without the block), within its list or into another one.
 */
export function moveBlockTo(
  root: BlockValue[],
  id: string,
  list: ListId,
  index: number,
): BlockValue[] {
  const from = findBlock(root, id);

  if (!from) {
    return root;
  }

  const block = getList(root, from.list)[from.index];
  const removed = setList(
    root,
    from.list,
    getList(root, from.list).filter((other) => other.id !== id),
  );
  const target = getList(removed, list);
  const at = Math.max(0, Math.min(index, target.length));

  return setList(removed, list, [
    ...target.slice(0, at),
    block,
    ...target.slice(at),
  ]);
}

/**
 * Whether a block may move into a list: the list takes its type, has
 * room for it, and is not inside the block itself.
 */
export function canMoveInto(
  block: BlockValue,
  list: ListId,
  {
    definitions,
    count,
    maxNum,
  }: {
    definitions: BlockDefinition[];
    count: number;
    maxNum: number | null;
  },
): boolean {
  return (
    parseListId(list)?.blockId !== block.id &&
    definitions.some((definition) => definition.name === block.type) &&
    (maxNum === null || count < maxNum)
  );
}
