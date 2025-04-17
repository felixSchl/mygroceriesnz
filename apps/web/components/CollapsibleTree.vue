<script lang="ts" setup>
import type { CategoryTreeNode } from "@repo/db";
import TreeRow from "./TreeRow.vue";
import { FocusIcon, ViewIcon } from "lucide-vue-next";

const defaultExpanded = ref(false);

const props = defineProps<{
  nodes: CategoryTreeNode[];
  outletPosition?: "left" | "right";
  editable?: boolean;
  hideIds?: boolean;
  pinnable?: boolean;
  highlightedNode?: string | null;
  pinnedNode?: string | null;
  matchedNodes?: Set<string>;
}>();

const outletPositions = ref<Map<string, { x: number; y: number }>>(new Map());

const isExpanded = (nodeId: string) => {
  const val = expandedItems.value.get(nodeId);
  return (defaultExpanded.value && val == null) || val === true;
};

const nodeMap = ref(new Map<string, CategoryTreeNode>());
const pathsMap = ref(new Map<string, string[]>());

watch(
  () => props.nodes,
  (nodes) => {
    nodeMap.value.clear();
    pathsMap.value.clear();

    const buildMap = (nodes: CategoryTreeNode[], path: string[] = []) => {
      for (const node of nodes) {
        nodeMap.value.set(node.id, node);
        const newPath = [...path, node.id];
        pathsMap.value.set(node.id, [...newPath].reverse());
        if (node.children?.length) {
          buildMap(node.children, newPath);
        }
      }
    };

    buildMap(nodes);
  },
  { immediate: true },
);

const findPath = (targetId: string): string[] => {
  const path = pathsMap.value.get(targetId);
  if (!path) return [];
  return path;
};

const findNearestVisibleParent = (nodeId: string): string | undefined => {
  const path = findPath(nodeId);

  let lastExpandedSegment = path[path.length - 1];
  if (nodeId === lastExpandedSegment) return nodeId;

  for (let i = path.length - 2; i >= 0; i--) {
    if (!lastExpandedSegment) break;
    if (!isExpanded(lastExpandedSegment)) {
      return lastExpandedSegment;
    }
    if (lastExpandedSegment === nodeId) {
      return nodeId;
    }
    lastExpandedSegment = path[i];
  }

  return lastExpandedSegment;
};

const isolatedNodeId = ref<string | null>(null);
defineExpose({
  isolatedNodeId,
  getOutletPosition: (nodeId: string) => {
    const val = outletPositions.value.get(nodeId);
    return val?.x && val?.y ? val : null;
  },
  findNearestVisibleParent,
  isNodeVisible: (nodeId: string) => {
    const parentId = findNearestVisibleParent(nodeId);
    return parentId === nodeId;
  },
  expandNodes: (nodeIds: string[]) => {
    expandedItems.value.clear();
    for (const nodeId of nodeIds) {
      updateExpandedItems(true, nodeId);
    }
  },
});

const emit = defineEmits<{
  "drag-start": [id: string];
  "drag-end": [id: string];
  "create-node": [
    parentId: string | null,
    position: "before" | "after",
    referenceId?: string,
  ];
  "update:node": [id: string, updates: { name?: string; id?: string }];
  "update:isolated": [id: string | null];
  "pin-node": [id: string | null];
}>();

const expandedItems = ref(new Map<string, boolean>());

const updateOutletPosition = (element: HTMLElement, nodeId: string) => {
  const rect = element.getBoundingClientRect();
  const scrollX = window.scrollX || window.pageXOffset;
  const scrollY = window.scrollY || window.pageYOffset;

  const x =
    (props.outletPosition === "left"
      ? rect.left + rect.width / 2
      : rect.right - rect.width / 2) + scrollX;

  const y = rect.top + rect.height / 2 + scrollY;

  outletPositions.value.set(nodeId, { x, y });
};

const outletRefs = ref<Map<string, HTMLElement>>(new Map());

const handleOutletRegister = (nodeId: string, element: HTMLElement) => {
  outletRefs.value.set(nodeId, element);
  updateOutletPosition(element, nodeId);
};

const updateExpandedItems = (isExpanded: boolean, nodeId: string) => {
  // Capture current position before state changes
  if (!isExpanded) {
    const element = outletRefs.value.get(nodeId);
    if (element) {
      updateOutletPosition(element, nodeId);
    }
  }

  expandedItems.value.set(nodeId, isExpanded);

  // Track positions during animation
  const startTime = performance.now();
  const animationDuration = 500; // Match your transition duration

  const updateDuringAnimation = () => {
    const elapsed = performance.now() - startTime;

    outletRefs.value.forEach((element, nodeId) => {
      updateOutletPosition(element, nodeId);
    });

    if (elapsed < animationDuration) {
      requestAnimationFrame(updateDuringAnimation);
    }
  };

  requestAnimationFrame(updateDuringAnimation);
};

const recalculatePositions = () => {
  outletRefs.value.forEach((element, nodeId) => {
    updateOutletPosition(element, nodeId);
  });
};

onMounted(() => {
  recalculatePositions();
  window.addEventListener("resize", recalculatePositions);
  window.addEventListener("scroll", recalculatePositions, true);
});

onUnmounted(() => {
  window.removeEventListener("resize", recalculatePositions);
  window.removeEventListener("scroll", recalculatePositions, true);
});

watch(props.nodes, () => {
  setTimeout(() => {
    recalculatePositions();
  });
});

const toggleNodeIsolation = (nodeId: string) => {
  isolatedNodeId.value = isolatedNodeId.value === nodeId ? null : nodeId;
  emit("update:isolated", isolatedNodeId.value);
  nextTick(() => {
    recalculatePositions();
  });
};

const visibleNodes = computed(() => {
  if (!isolatedNodeId.value) return props.nodes;
  return props.nodes.filter((node) => node.id === isolatedNodeId.value);
});
</script>

<template>
  <div class="flex flex-col">
    <template v-for="node in visibleNodes" :key="node.id">
      <Collapsible
        :open="isExpanded(node.id)"
        @update:open="updateExpandedItems($event, node.id)"
      >
        <CollapsibleTrigger as-child>
          <TreeRow
            :pinnable="pinnable"
            :depth="0"
            :node="node"
            :outlet-position="outletPosition"
            :editable="editable"
            :hide-ids="hideIds"
            :is-expanded="isExpanded(node.id)"
            :is-highlighted="highlightedNode === node.id"
            :is-pinned="pinnedNode === node.id"
            :is-matched="matchedNodes?.has(node.id)"
            class="w-full"
            @drag-start="emit('drag-start', node.id)"
            @drag-end="emit('drag-end', node.id)"
            @update:node="(updates) => emit('update:node', node.id, updates)"
            @register-outlet="handleOutletRegister(node.id, $event)"
            @pin="emit('pin-node', node.id)"
          >
            <template #actions>
              <button
                class="p-1 hover:bg-muted rounded-sm"
                @click.stop="toggleNodeIsolation(node.id)"
              >
                <FocusIcon
                  v-if="!isolatedNodeId || isolatedNodeId !== node.id"
                  class="h-4 w-4 text-muted-foreground"
                />
                <ViewIcon v-else class="h-4 w-4 text-muted-foreground" />
              </button>
            </template>
          </TreeRow>
        </CollapsibleTrigger>

        <CollapsibleContent class="ml-2 border-l-2 border-muted w-full">
          <template v-for="child in node.children" :key="child.id">
            <Collapsible
              :open="isExpanded(child.id)"
              class="mt-2"
              @update:open="updateExpandedItems($event, child.id)"
            >
              <CollapsibleTrigger as-child>
                <TreeRow
                  :pinnable="pinnable"
                  :depth="1"
                  :node="child"
                  :outlet-position="outletPosition"
                  :editable="editable"
                  :hide-ids="hideIds"
                  :is-expanded="isExpanded(child.id)"
                  :is-highlighted="highlightedNode === child.id"
                  :is-pinned="pinnedNode === child.id"
                  :is-matched="matchedNodes?.has(child.id)"
                  class="w-full"
                  @drag-start="emit('drag-start', child.id)"
                  @drag-end="emit('drag-end', child.id)"
                  @update:node="
                    (updates) => emit('update:node', child.id, updates)
                  "
                  @register-outlet="handleOutletRegister(child.id, $event)"
                  @pin="emit('pin-node', child.id)"
                />
              </CollapsibleTrigger>

              <CollapsibleContent class="ml-2 border-l-2 border-muted w-full">
                <template
                  v-for="grandChild in child.children"
                  :key="grandChild.id"
                >
                  <TreeRow
                    :pinnable="pinnable"
                    :depth="2"
                    :node="grandChild"
                    class="w-full"
                    :outlet-position="outletPosition"
                    :editable="editable"
                    :hide-ids="hideIds"
                    :is-highlighted="highlightedNode === grandChild.id"
                    :is-pinned="pinnedNode === grandChild.id"
                    :is-matched="matchedNodes?.has(grandChild.id)"
                    @drag-start="emit('drag-start', grandChild.id)"
                    @drag-end="emit('drag-end', grandChild.id)"
                    @update:node="
                      (updates) => emit('update:node', grandChild.id, updates)
                    "
                    @register-outlet="
                      handleOutletRegister(grandChild.id, $event)
                    "
                    @pin="emit('pin-node', grandChild.id)"
                  />
                </template>
              </CollapsibleContent>
            </Collapsible>
          </template>
        </CollapsibleContent>
      </Collapsible>
    </template>
  </div>
</template>
