import { createContext, useContext } from "react";

import type { BlockDefinition, BlockValue, Model } from "@/types";

import type { ListId } from "./blocks";

/**
 * What every list of a block field shares: the field's value (blocks
 * inside blocks included), which blocks are open, and the drag in
 * progress. Every change goes through update, as one new value for the
 * whole field.
 */
export interface BlockTree {
  model: Model;
  getRoot(): BlockValue[];
  update(next: BlockValue[]): void;
  listInfo(list: ListId): {
    definitions: BlockDefinition[];
    maxNum: number | null;
  };
  isOpen(id: string): boolean;
  open(id: string): void;
  toggle(id: string): void;
  // The list a dragged block would drop into, when that is another list
  // that takes it.
  dropTarget: ListId | null;
}

export const BlockTreeContext = createContext<BlockTree | null>(null);

export function useBlockTree(): BlockTree {
  const tree = useContext(BlockTreeContext);

  if (!tree) {
    throw new Error("useBlockTree must be used inside a BlockWidget.");
  }

  return tree;
}

/** The data of a draggable block or a droppable list. */
export interface DragData {
  type: "block" | "list";
  list: ListId;
  // 0 for the field's own list, 1 inside a block.
  depth: number;
  // The block a nested list or its blocks belong to.
  parentId?: string;
}
