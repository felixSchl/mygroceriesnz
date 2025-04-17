<script lang="ts" setup>
definePageMeta({ layout: "admin" });
import type { Retailer, CategoryTreeNode } from "@repo/db";
import { onUnmounted, ref, computed } from "vue";
import CollapsibleTree from "~/components/CollapsibleTree.vue";
import Fuse from "fuse.js";
import { debounce } from "lodash-es";

interface Position {
  x: number;
  y: number;
}

const repaint = ref(0);
const isAltPressed = ref(false);

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === "Alt") {
    isAltPressed.value = true;
  }
}

function handleKeyUp(e: KeyboardEvent) {
  if (e.key === "Alt") {
    isAltPressed.value = false;
  }
}

onMounted(() => {
  document.addEventListener("keydown", handleKeyDown);
  document.addEventListener("keyup", handleKeyUp);
});

onBeforeMount(() => {
  document.removeEventListener("keydown", handleKeyDown);
  document.removeEventListener("keyup", handleKeyUp);
});

const trpc = useTrpc();
const toast = useToast();

const targetTree = ref<CategoryTreeNode[]>([]);

const hideIds = ref(true);

async function saveCategoryTree() {
  console.log("saving category tree", targetTree.value);
  await trpc.admin.updateCategoryTree.mutate(targetTree.value).then(
    () => {
      console.log("saved category tree");
    },
    (e) => {
      console.error("Failed to save category tree", e);
      toast.error("Failed to save category tree. Check console for details.");
    },
  );
}

async function saveCategoryMappings() {
  // prune broken connections (mutate connections array in place)
  for (let i = connections.value.length - 1; i >= 0; i--) {
    const c = connections.value[i]!;
    const sourceNode = findNodeById(sourceTree.value, c.sourceId);
    const targetNode = findNodeById(targetTree.value, c.targetId);
    if (!sourceNode || !targetNode) {
      connections.value.splice(i, 1);
    }
  }

  if (!sourceRetailer.value) return;
  await trpc.admin.updateCategoryMappings
    .mutate({
      retailer: sourceRetailer.value,
      mappings: { connections: connections.value },
    })
    .then(
      () => {
        console.log("saved category mapping");
      },
      (e) => {
        console.error("Failed to save category tree", e);
        toast.error("Failed to save category tree. Check console for details.");
      },
    );
}

// load the target tree
const { data: targetTreeRemote, error: targetTreeError } =
  trpc.admin.getCategoryTree.useQuery();

watchEffect(() => {
  targetTree.value.splice(0);
  targetTree.value.push(...(targetTreeRemote.value ?? []));
});

// load the source tree
const retailer = ref<Retailer>("pns");
const {
  data: sourceData,
  error: sourceTreeError,
  status: sourceTreeStatus,
} = trpc.admin.getRetailerCategoryTree.useQuery(
  () => ({
    retailer: retailer.value,
  }),
  {
    watch: [retailer],
  },
);

const sourceRetailer = computed(() => sourceData.value?.retailer);
const sourceTree = computed(() => sourceData.value?.tree ?? []);
const connections = ref<
  {
    sourceId: string; // start node ID
    targetId: string; // end node ID
  }[]
>([]);

watchEffect(() => {
  connections.value.splice(0);
  connections.value.push(...(sourceData.value?.connections ?? []));
});

const visualConnections = computed(() => {
  repaint.value; // force re-render

  // Filter connections if there's a pinned node
  const connectionsToShow = pinnedNodeId.value
    ? connections.value.filter((c) => c.sourceId === pinnedNodeId.value)
    : connections.value;

  return connectionsToShow.map((connection) => {
    const sourceVisible = trees.left.value?.isNodeVisible(connection.sourceId);
    const targetVisible = trees.right.value?.isNodeVisible(connection.targetId);

    // If both nodes are visible, return the original connection
    if (sourceVisible && targetVisible) {
      return {
        ...connection,
        isIndirect: false,
      };
    }

    // Find the nearest visible parent for source and target
    const visibleSourceId = sourceVisible
      ? connection.sourceId
      : trees.left.value?.findNearestVisibleParent(connection.sourceId);

    const visibleTargetId = targetVisible
      ? connection.targetId
      : trees.right.value?.findNearestVisibleParent(connection.targetId);

    return {
      sourceId: visibleSourceId ?? connection.sourceId,
      targetId: visibleTargetId ?? connection.targetId,
      originalSourceId: connection.sourceId,
      originalTargetId: connection.targetId,
      isIndirect: true,
    };
  });
});

interface OutletPosition {
  x: number;
  y: number;
}

const trees = {
  left: useTemplateRef<InstanceType<typeof CollapsibleTree> | null>(
    "trees.left",
  ),
  right: useTemplateRef<InstanceType<typeof CollapsibleTree> | null>(
    "trees.right",
  ),
} as const;

const isDragging = ref(false);
const dragStart = ref<{
  treeId: "left" | "right";
  id: string;
  position: OutletPosition;
} | null>(null);
const dragEnd = ref<{ x: number; y: number }>({ x: 0, y: 0 });

const handleDragStart = (treeId: "left" | "right", id: string) => {
  isDragging.value = true;
  const position = trees[treeId].value?.getOutletPosition(id) ?? { x: 0, y: 0 };
  dragStart.value = { treeId, id, position };
  dragEnd.value = { ...position };

  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("mouseup", handleMouseUp);
};

const handleDragEnd = (treeId: string, id: string) => {
  if (dragStart.value) {
    // resolve start/end ids
    const sourceId = treeId === "left" ? id : dragStart.value.id;
    const targetId = treeId === "left" ? dragStart.value.id : id;

    // check if connection already exists
    if (
      !connections.value.find(
        (c) => c.sourceId === sourceId && c.targetId === targetId,
      )
    ) {
      connections.value.push({ sourceId, targetId });

      // save the mappings
      void saveCategoryMappings();
    }
  }

  cleanupDrag();
};

const handleMouseMove = (e: MouseEvent) => {
  if (!isDragging.value) return;
  // Adjust the mouse position by adding the scroll offset
  const scrollX = window.scrollX || window.pageXOffset;
  const scrollY = window.scrollY || window.pageYOffset;
  dragEnd.value = { x: e.clientX + scrollX, y: e.clientY + scrollY };
};

const handleMouseUp = () => {
  cleanupDrag();
};

const cleanupDrag = () => {
  isDragging.value = false;
  dragStart.value = null;
  document.removeEventListener("mousemove", handleMouseMove);
  document.removeEventListener("mouseup", handleMouseUp);
};

const getCurvedPath = (start: Position, end: Position): string => {
  const deltaX = end.x - start.x;
  const controlPointOffset = deltaX / 2;
  return `M ${start.x} ${start.y} C ${start.x + controlPointOffset} ${start.y}, ${end.x - controlPointOffset} ${end.y}, ${end.x} ${end.y}`;
};

const getDraggingPath = (): string => {
  if (!dragStart.value || !dragEnd.value) return "";
  const startPos = trees[dragStart.value.treeId].value?.getOutletPosition(
    dragStart.value.id,
  );
  const endPos = dragEnd.value;
  if (!startPos) return "";
  const deltaX = endPos.x - startPos.x;
  const controlPointOffset = deltaX / 2;
  return `M ${startPos.x} ${startPos.y} C ${startPos.x + controlPointOffset} ${startPos.y}, ${endPos.x - controlPointOffset} ${endPos.y}, ${endPos.x} ${endPos.y}`;
};

onUnmounted(() => {
  cleanupDrag();
});

const handleReassignIds = () => {
  if (
    !confirm(
      "This will overwrite the current target tree with a new ID set. Are you sure?",
    )
  ) {
    return;
  }

  let ix = 42; // make it less obvious...

  // Helper function to recursively walk the tree
  const walkTree = (nodes: CategoryTreeNode[]): void => {
    for (const node of nodes) {
      // Store old ID to update connections
      const oldId = node.id;
      // Assign new ID
      const newId = `${ix++}`;

      // Update connections that reference this node
      for (const connection of connections.value) {
        if (connection.targetId === oldId) {
          connection.targetId = newId;
        }
      }

      // Update node ID
      node.id = newId;

      // Recursively process children
      if (node.children?.length) {
        walkTree(node.children);
      }
    }
  };

  // Process the entire tree
  walkTree(targetTree.value);

  // Save both tree and mappings
  void saveCategoryTree();
  void saveCategoryMappings();
};

// Handle deleting a connection
const onClickConnection = (
  connection: {
    sourceId: string;
    targetId: string;
  },
  event: MouseEvent,
) => {
  // check if 'alt' key is pressed
  if (!event.altKey) {
    return;
  }

  const confirmDelete = true;
  if (confirmDelete) {
    for (let i = 0; i < connections.value.length; i++) {
      const c = connections.value[i]!;
      if (
        c.sourceId === connection.sourceId &&
        c.targetId === connection.targetId
      ) {
        connections.value.splice(i, 1);
        break;
      }
    }

    // save the mappings
    void saveCategoryMappings();
  }
};

function findNodeById(
  nodes: CategoryTreeNode[],
  id: string,
): CategoryTreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const childNode = findNodeById(node.children, id);
    if (childNode) return childNode;
  }
  return null;
}

// Add this function to handle node updates
const handleUpdateNode = (
  nodeId: string,
  updates: { name?: string; id?: string },
) => {
  // Find and update the node in the tree
  const updateNodeInTree = (nodes: CategoryTreeNode[]): boolean => {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]!;
      if (node.id === nodeId) {
        // Update the node
        const updatedNode = { ...node, ...updates };
        nodes[i] = updatedNode;

        // Update connections by mutating the array in place
        if (updates.id && updates.id !== nodeId) {
          for (const connection of connections.value) {
            if (connection.sourceId === nodeId) {
              connection.sourceId = updates.id;
            }
            if (connection.targetId === nodeId) {
              connection.targetId = updates.id;
            }
          }
        }
        return true;
      }

      // Recursively search children
      if (node.children && updateNodeInTree(node.children)) {
        return true;
      }
    }
    return false;
  };

  updateNodeInTree(targetTree.value);

  void saveCategoryTree();
  void saveCategoryMappings();
};

const handleExportJSON = (
  tree: CategoryTreeNode[],
  isolatedNodeId?: string | null,
) => {
  let out: CategoryTreeNode[] = [...tree];

  // ...
  // if (isolatedNodeId) {
  //   const isolatedNode = findNodeById(tree, isolatedNodeId);
  //   if (isolatedNode) {
  //     out = [isolatedNode];
  //   }
  // }

  const json = JSON.stringify(out, null, 2);
  navigator.clipboard.writeText(json);
  toast.success("Copied to clipboard");
};

const handleImportJSON = async () => {
  const json = await navigator.clipboard.readText();
  if (!json) return;
  const confirmImport = confirm(
    "This will overwrite the current target tree with the JSON in your clipboard. Are you sure?",
  );
  if (!confirmImport) return;

  const data = JSON.parse(json);
  targetTree.value.splice(0);
  targetTree.value.push(...data);

  // void saveCategoryTree();
  // void saveCategoryMappings();
};

const handleExportConnections = () => {
  const json = JSON.stringify(connections.value, null, 2);
  navigator.clipboard.writeText(json);
  toast.success("Connections copied to clipboard");
};

const handleImportConnections = async () => {
  const json = await navigator.clipboard.readText();
  if (!json) return;
  const confirmImport = confirm(
    "This will overwrite the current connections with the JSON in your clipboard. Are you sure?",
  );
  if (!confirmImport) return;

  try {
    const data = JSON.parse(json);
    connections.value.splice(0);
    connections.value.push(...data);

    void saveCategoryMappings();
    toast.success("Connections imported successfully");
  } catch (e) {
    console.error("Failed to import connections", e);
    toast.error("Failed to import connections. Invalid JSON format.");
  }
};

// Add this new ref to track the currently hovered connection
const hoveredConnection = ref<{ sourceId: string; targetId: string } | null>(
  null,
);

// Add these methods to handle hover events
const handleConnectionMouseEnter = (connection: {
  sourceId: string;
  targetId: string;
}) => {
  hoveredConnection.value = connection;
};

const handleConnectionMouseLeave = () => {
  hoveredConnection.value = null;
};

// Add new ref for pinned node
const pinnedNodeId = ref<string | null>(null);

// Add new method to handle pinning
const handlePinNode = (nodeId: string | null) => {
  pinnedNodeId.value = nodeId;
};

// Add these new refs and computed properties
const searchQuery = ref("");

// Create a flattened version of the tree for searching
const flattenedTree = computed(() => {
  const flattened: CategoryTreeNode[] = [];

  function flatten(nodes: CategoryTreeNode[]) {
    for (const node of nodes) {
      flattened.push(node);
      if (node.children?.length) {
        flatten(node.children);
      }
    }
  }

  flatten(targetTree.value);
  return flattened;
});

// Setup fuse search
const fuse = computed(
  () =>
    new Fuse(flattenedTree.value, {
      keys: ["name"],
      threshold: 0.1,
      includeMatches: true,
    }),
);

// Add new ref for matched node IDs
const matchedNodeIds = ref<Set<string>>(new Set());

// Modify the search handling to include parent nodes and ensure visibility
const handleSearch = debounce((query: string) => {
  searchQuery.value = query;
  matchedNodeIds.value = new Set();
  const expandedNodeIds = new Set<string>();

  if (!query.trim()) {
    return;
  }

  // Search and collect matching node IDs
  const results = fuse.value.search(query);
  results.forEach((result) => {
    const nodeId = result.item.id;
    matchedNodeIds.value.add(nodeId);

    // Find and expand all ancestor nodes
    let currentNode = findNodeById(targetTree.value, nodeId);
    while (currentNode) {
      const parent = findParentNode(targetTree.value, currentNode.id);
      if (parent) {
        expandedNodeIds.add(parent.id);
      }
      currentNode = parent;
    }
  });

  // ...
  trees.right.value?.expandNodes(Array.from(expandedNodeIds));

  // redraw the tree
  repaint.value++;
}, 300);

// Add helper function to find parent node if not already present
function findParentNode(
  nodes: CategoryTreeNode[],
  childId: string,
  parent?: CategoryTreeNode,
): CategoryTreeNode | null {
  for (const node of nodes) {
    if (node.children?.some((child) => child.id === childId)) {
      return node;
    }
    if (node.children?.length) {
      const found = findParentNode(node.children, childId, node);
      if (found) return found;
    }
  }
  return null;
}
</script>

<template>
  <ClientOnly>
    <div>
      <h1 class="text-2xl font-bold mb-4">Departments & Categories</h1>

      {{ isAltPressed }}

      <p class="mb-8 text-muted-foreground prose">
        Drag and drop to create connections between source department/category
        mappings to the MyGroceries equivalent. Changes take effect next time
        the catalog is re-indexed.
      </p>

      <div class="relative flex w-full gap-32">
        <div class="flex-1 flex flex-col flex-shrink-0">
          <template v-if="sourceTreeStatus === 'success' && sourceTree">
            <div class="flex justify-between mb-8 items-center">
              <h2 class="font-bold text-lg mb-3 flex items-center gap-1">
                <RetailerIcon
                  :retailer="retailer"
                  class="w-6 h-6 inline-block"
                />
                Source
              </h2>

              <div class="flex">
                <!-- eslint-disable-next-line vuejs-accessibility/form-control-has-label -->
                <Select v-model="retailer">
                  <SelectTrigger class="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pns">Pak'nSave</SelectItem>
                    <SelectItem value="nw">New World</SelectItem>
                    <SelectItem value="ww">Countdown</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div class="flex items-center space-x-2 mb-2 self-end">
              <!-- copy JSON -->
              <Button
                size="sm"
                variant="outline"
                @click="
                  handleExportJSON(sourceTree, trees.left.value?.isolatedNodeId)
                "
              >
                <fa icon="file-export" class="mr-1" />
                Export Tree JSON
              </Button>

              <!-- Add new Export Connections button -->
              <Button
                size="sm"
                variant="outline"
                @click="handleExportConnections"
              >
                <fa icon="file-export" class="mr-1" />
                Export Connections JSON
              </Button>

              <Button
                size="sm"
                variant="destructive"
                @click="handleImportConnections"
              >
                <fa icon="file-import" class="mr-1" />
                Import Connections JSON
              </Button>

              <Checkbox
                id="hide-ids"
                :checked="hideIds"
                @update:checked="hideIds = $event"
              />
              <!-- eslint-disable-next-line vuejs-accessibility/label-has-for -->
              <label
                for="hide-ids"
                class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-muted-foreground"
              >
                Hide IDs
              </label>
            </div>

            <div
              class="border p-2 rounded"
              :class="{ 'sticky top-2': pinnedNodeId }"
            >
              <CollapsibleTree
                ref="trees.left"
                pinnable
                :hide-ids="hideIds"
                :nodes="sourceTree"
                :highlighted-node="hoveredConnection?.sourceId"
                :pinned-node="pinnedNodeId"
                class="h-fit"
                @drag-start="
                  (nodeId: string) => handleDragStart('left', nodeId)
                "
                @drag-end="(nodeId: string) => handleDragEnd('left', nodeId)"
                @update:isolated="repaint++"
                @mouseenter="handleConnectionMouseEnter"
                @mouseleave="handleConnectionMouseLeave"
                @pin-node="handlePinNode"
              />
            </div>
          </template>
          <template v-else-if="sourceTreeError || sourceTreeStatus === 'error'">
            <AdminErrorScreen :error="sourceTreeError" class="mt-0 w-fit" />
          </template>
          <template v-else>
            <AdminLoadingScreen />
          </template>
        </div>

        <div class="flex-1 flex flex-col flex-shrink-0">
          <div class="flex justify-between mb-8 items-start">
            <h2 class="font-bold text-lg mb-3 flex items-start gap-1">
              <ShopsterIcon class="w-6 !h-6 inline-block" />
              Target
            </h2>

            <div class="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                @click="
                  handleExportJSON(
                    targetTree,
                    trees.right.value?.isolatedNodeId,
                  )
                "
              >
                <fa icon="file-export" class="mr-2" />
                Export JSON
              </Button>
              <Button size="sm" variant="destructive" @click="handleImportJSON">
                <fa icon="file-import" class="mr-2" />
                Import JSON
              </Button>
              <Button
                size="sm"
                variant="destructive"
                @click="handleReassignIds"
              >
                <fa icon="random" class="mr-2" />
                Re-assign IDs
              </Button>
            </div>
          </div>

          <div class="mb-4 relative flex items-center gap-2">
            <Input
              v-model="searchQuery"
              placeholder="Search categories..."
              @input="handleSearch($event.target.value)"
            />

            <!-- collapse all -->
            <Button
              variant="outline"
              size="lg"
              @click="trees.right.value?.expandNodes([])"
            >
              <fa icon="folder-tree" class="mr-2" />
              Collapse All
            </Button>
          </div>

          <template v-if="targetTree">
            <CollapsibleTree
              ref="trees.right"
              :nodes="targetTree"
              :highlighted-node="hoveredConnection?.targetId"
              :matched-nodes="matchedNodeIds"
              outlet-position="left"
              class="border p-2 rounded h-fit top-2"
              editable
              @update:node="handleUpdateNode"
              @drag-start="(nodeId: string) => handleDragStart('right', nodeId)"
              @drag-end="(nodeId: string) => handleDragEnd('right', nodeId)"
              @update:isolated="repaint++"
              @mouseenter="handleConnectionMouseEnter"
              @mouseleave="handleConnectionMouseLeave"
            />
          </template>
          <template v-else-if="targetTreeError">
            <AdminErrorScreen :error="targetTreeError" class="mt-0 w-fit" />
          </template>
          <template v-else>
            <AdminLoadingScreen />
          </template>
        </div>
      </div>

      <!-- SVG overlay for connections -->
      <svg
        class="absolute top-0 left-0 bottom-0 w-full pointer-events-none overflow-visible"
        style="z-index: 1"
      >
        <defs>
          <marker
            id="circle"
            markerWidth="3"
            markerHeight="3"
            refX="1.5"
            refY="1.5"
            markerUnits="strokeWidth"
            orient="auto"
          >
            <circle cx="1.5" cy="1.5" r="1.5" fill="#888" />
          </marker>
        </defs>

        <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions vuejs-accessibility/click-events-have-key-events -->
        <g
          v-for="(connection, index) in visualConnections"
          v-show="
            trees.left.value?.getOutletPosition(connection.sourceId) &&
            trees.right.value?.getOutletPosition(connection.targetId)
          "
          :key="`hit-${index}`"
          class="hover:cursor-pointer"
          :class="{
            group: !isDragging && !connection.isIndirect,
            'group/path': !isAltPressed,
            'group/delete': isAltPressed,
          }"
          @click.prevent.stop="onClickConnection(connection, $event)"
          @mouseenter="handleConnectionMouseEnter(connection)"
          @mouseleave="handleConnectionMouseLeave"
        >
          <path
            :d="
              getCurvedPath(
                trees.left.value?.getOutletPosition(connection.sourceId) ?? {
                  x: 0,
                  y: 0,
                },
                trees.right.value?.getOutletPosition(connection.targetId) ?? {
                  x: 0,
                  y: 0,
                },
              )
            "
            stroke="none"
            stroke-width="10"
            fill="none"
            class="hit-area group-hover/delete:cursor-crosshair"
            :class="[
              isDragging ? 'pointer-events-none' : 'pointer-events-auto',
            ]"
            style="pointer-events: stroke"
          />

          <path
            :key="index"
            :d="
              getCurvedPath(
                trees.left.value?.getOutletPosition(connection.sourceId) ?? {
                  x: 0,
                  y: 0,
                },
                trees.right.value?.getOutletPosition(connection.targetId) ?? {
                  x: 0,
                  y: 0,
                },
              )
            "
            :stroke="connection.isIndirect ? '#ccc' : '#ccc'"
            :stroke-dasharray="connection.isIndirect ? '5,5' : undefined"
            :stroke-opacity="connection.isIndirect ? 0.5 : 1"
            :class="[
              isDragging ? 'pointer-events-none' : 'pointer-events-auto',
              'group-hover:opacity-100',
              'group-hover/delete:cursor-crosshair group-hover/delete:stroke-destructive',
              'group-hover/path:stroke-black dark:group-hover/path:stroke-blue-400',
            ]"
            stroke-width="3"
            fill="none"
            marker-start="url(#circle)"
            marker-end="url(#circle)"
          />
        </g>

        <!-- Dragging line -->
        <path
          v-if="
            isDragging &&
            dragStart &&
            trees[dragStart.treeId].value?.getOutletPosition(dragStart.id)
          "
          :d="getDraggingPath()"
          fill="none"
          stroke="#888"
          stroke-width="2"
          stroke-dasharray="4"
        />
      </svg>
    </div>
  </ClientOnly>
</template>

<style scoped>
/* Your styles here */
.mb-4 {
  margin-bottom: 1rem;
}

/* Optional: Change stroke color on hover for better UX */
.connection-path:hover {
  stroke: #555;
}
</style>
