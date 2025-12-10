/**
 * Virtual List Hook
 * Renders only visible items in a list for optimal performance
 * with large datasets.
 *
 * Phase 10: Performance & Scalability
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";

export interface UseVirtualListOptions<T> {
  /** Array of items to virtualize */
  items: T[];
  /** Height of each item in pixels */
  itemHeight: number;
  /** Number of items to render above/below viewport */
  overscan?: number;
  /** Initial scroll offset */
  initialScrollOffset?: number;
  /** Callback when scroll position changes */
  onScroll?: (offset: number) => void;
}

export interface VirtualItem<T> {
  /** The item data */
  data: T;
  /** Index in the original array */
  index: number;
  /** Absolute offset from top in pixels */
  offsetTop: number;
  /** Height of the item */
  height: number;
}

export interface UseVirtualListReturn<T> {
  /** Ref to attach to the scroll container */
  containerRef: React.RefObject<HTMLDivElement>;
  /** Array of visible virtual items to render */
  virtualItems: VirtualItem<T>[];
  /** Total height of all items (for spacer) */
  totalHeight: number;
  /** Current scroll offset */
  scrollOffset: number;
  /** Scroll to a specific index */
  scrollToIndex: (index: number, behavior?: ScrollBehavior) => void;
  /** Scroll to a specific offset */
  scrollToOffset: (offset: number, behavior?: ScrollBehavior) => void;
}

/**
 * Hook for virtualized list rendering
 */
export function useVirtualList<T>({
  items,
  itemHeight,
  overscan = 3,
  initialScrollOffset = 0,
  onScroll,
}: UseVirtualListOptions<T>): UseVirtualListReturn<T> {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollOffset, setScrollOffset] = useState(initialScrollOffset);
  const [containerHeight, setContainerHeight] = useState(0);

  // Calculate total height
  const totalHeight = items.length * itemHeight;

  // Update container height on resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateHeight = () => {
      setContainerHeight(container.clientHeight);
    };

    updateHeight();

    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Handle scroll events
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const newOffset = container.scrollTop;
      setScrollOffset(newOffset);
      onScroll?.(newOffset);
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, [onScroll]);

  // Calculate visible items
  const virtualItems = useMemo((): VirtualItem<T>[] => {
    if (containerHeight === 0 || items.length === 0) {
      return [];
    }

    // Calculate visible range
    const startIndex = Math.max(
      0,
      Math.floor(scrollOffset / itemHeight) - overscan,
    );
    const endIndex = Math.min(
      items.length - 1,
      Math.ceil((scrollOffset + containerHeight) / itemHeight) + overscan,
    );

    // Generate virtual items
    const result: VirtualItem<T>[] = [];
    for (let i = startIndex; i <= endIndex; i++) {
      result.push({
        data: items[i],
        index: i,
        offsetTop: i * itemHeight,
        height: itemHeight,
      });
    }

    return result;
  }, [items, itemHeight, overscan, scrollOffset, containerHeight]);

  // Scroll to specific index
  const scrollToIndex = useCallback(
    (index: number, behavior: ScrollBehavior = "smooth") => {
      const container = containerRef.current;
      if (!container) return;

      const offset = index * itemHeight;
      container.scrollTo({ top: offset, behavior });
    },
    [itemHeight],
  );

  // Scroll to specific offset
  const scrollToOffset = useCallback(
    (offset: number, behavior: ScrollBehavior = "smooth") => {
      const container = containerRef.current;
      if (!container) return;

      container.scrollTo({ top: offset, behavior });
    },
    [],
  );

  return {
    containerRef,
    virtualItems,
    totalHeight,
    scrollOffset,
    scrollToIndex,
    scrollToOffset,
  };
}

/**
 * Hook for dynamic height virtual list
 */
export interface DynamicVirtualItem<T> extends VirtualItem<T> {
  /** Whether the item has been measured */
  measured: boolean;
}

export interface UseDynamicVirtualListOptions<T> extends Omit<
  UseVirtualListOptions<T>,
  "itemHeight"
> {
  /** Estimated height for items before measurement */
  estimatedItemHeight: number;
  /** Get unique key for an item */
  getItemKey: (item: T, index: number) => string | number;
}

export function useDynamicVirtualList<T>({
  items,
  estimatedItemHeight,
  getItemKey,
  overscan = 3,
  initialScrollOffset = 0,
  onScroll,
}: UseDynamicVirtualListOptions<T>): UseVirtualListReturn<T> & {
  measureItem: (index: number, height: number) => void;
} {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollOffset, setScrollOffset] = useState(initialScrollOffset);
  const [containerHeight, setContainerHeight] = useState(0);
  const measuredHeightsRef = useRef<Map<string | number, number>>(new Map());

  // Get height for an item
  const getItemHeight = useCallback(
    (item: T, index: number): number => {
      const key = getItemKey(item, index);
      return measuredHeightsRef.current.get(key) ?? estimatedItemHeight;
    },
    [estimatedItemHeight, getItemKey],
  );

  // Calculate total height and offsets
  const { totalHeight, offsets } = useMemo(() => {
    let total = 0;
    const offs: number[] = [];

    for (let i = 0; i < items.length; i++) {
      offs.push(total);
      total += getItemHeight(items[i], i);
    }

    return { totalHeight: total, offsets: offs };
  }, [items, getItemHeight]);

  // Update container height
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateHeight = () => {
      setContainerHeight(container.clientHeight);
    };

    updateHeight();
    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, []);

  // Handle scroll
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      setScrollOffset(container.scrollTop);
      onScroll?.(container.scrollTop);
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [onScroll]);

  // Calculate visible items
  const virtualItems = useMemo((): VirtualItem<T>[] => {
    if (containerHeight === 0 || items.length === 0) return [];

    // Binary search for start index
    let startIndex = 0;
    let lo = 0;
    let hi = items.length - 1;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (offsets[mid] < scrollOffset) {
        startIndex = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    startIndex = Math.max(0, startIndex - overscan);

    // Find end index
    let endIndex = startIndex;
    let currentOffset = offsets[startIndex];
    const endOffset = scrollOffset + containerHeight;

    while (
      endIndex < items.length &&
      currentOffset < endOffset + estimatedItemHeight * overscan
    ) {
      currentOffset += getItemHeight(items[endIndex], endIndex);
      endIndex++;
    }
    endIndex = Math.min(items.length - 1, endIndex + overscan);

    const result: VirtualItem<T>[] = [];
    for (let i = startIndex; i <= endIndex; i++) {
      result.push({
        data: items[i],
        index: i,
        offsetTop: offsets[i],
        height: getItemHeight(items[i], i),
      });
    }

    return result;
  }, [
    items,
    offsets,
    scrollOffset,
    containerHeight,
    overscan,
    estimatedItemHeight,
    getItemHeight,
  ]);

  // Measure item callback
  const measureItem = useCallback(
    (index: number, height: number) => {
      const key = getItemKey(items[index], index);
      const currentHeight = measuredHeightsRef.current.get(key);
      if (currentHeight !== height) {
        measuredHeightsRef.current.set(key, height);
      }
    },
    [items, getItemKey],
  );

  const scrollToIndex = useCallback(
    (index: number, behavior: ScrollBehavior = "smooth") => {
      containerRef.current?.scrollTo({ top: offsets[index] ?? 0, behavior });
    },
    [offsets],
  );

  const scrollToOffset = useCallback(
    (offset: number, behavior: ScrollBehavior = "smooth") => {
      containerRef.current?.scrollTo({ top: offset, behavior });
    },
    [],
  );

  return {
    containerRef,
    virtualItems,
    totalHeight,
    scrollOffset,
    scrollToIndex,
    scrollToOffset,
    measureItem,
  };
}
