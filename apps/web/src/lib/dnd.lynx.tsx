import type { ReactNode } from "react";

export type DragCancelEvent = { active: { id: string } };
export type DragStartEvent = { active: { id: string } };
export type DragEndEvent = {
  active: { id: string };
  over: { id: string } | null;
};
export type CollisionDetection = (...args: unknown[]) => unknown[];

export function DndContext({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}

export function SortableContext({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}

export type AnimateLayoutChanges = (args: { isSorting: boolean }) => boolean;
export const defaultAnimateLayoutChanges: AnimateLayoutChanges = () => false;
export const PointerSensor = {};
export const verticalListSortingStrategy = {};
export const restrictToFirstScrollableAncestor = () => {};
export const restrictToVerticalAxis = () => {};
export const closestCorners: CollisionDetection = () => [];
export const pointerWithin: CollisionDetection = () => [];

export function useSensor() {
  return {};
}

export function useSensors(...sensors: unknown[]) {
  return sensors;
}

export function useSortable() {
  return {
    attributes: {},
    isDragging: false,
    listeners: undefined,
    setNodeRef: () => {},
    transform: null,
    transition: undefined,
  };
}

export const CSS = {
  Transform: {
    toString: () => undefined,
  },
};
