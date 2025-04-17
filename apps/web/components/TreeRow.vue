<script lang="ts" setup>
import type { CategoryTreeNode } from "@repo/db";

defineProps<{
  node: CategoryTreeNode;
  outletPosition?: "left" | "right";
  editable?: boolean;
  hideIds?: boolean;
  isExpanded?: boolean;
  depth: number;
  isHighlighted?: boolean;
  isPinned?: boolean;
  pinnable?: boolean;
  isMatched?: boolean;
  pinnedNode?: string;
}>();

const emit = defineEmits<{
  "drag-start": [];
  "drag-end": [];
  "update:node": [updates: { name?: string; id?: string }];
  "update:expanded": [value: boolean];
  "register-outlet": [element: HTMLElement];
  pin: [];
}>();

// Editing state
const editingNode = ref<string | null>(null);
const editForm = ref({ name: "", id: "" });
const manualIdInput = ref(false);

const isValidId = computed(() => {
  const id = editForm.value.id;
  return id && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id);
});

const slugify = (text: string) => {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

const startEditing = (node: CategoryTreeNode) => {
  editingNode.value = node.id;
  editForm.value.name = node.name || "";
  editForm.value.id = node.id;
  manualIdInput.value = node.id.trim() !== "";
};

const saveEdits = () => {
  emit("update:node", {
    name: editForm.value.name,
    id: editForm.value.id,
  });
  editingNode.value = null;
};

watch(
  () => editForm.value.name,
  (newName) => {
    if (!manualIdInput.value) {
      editForm.value.id = slugify(newName);
    }
  },
);

const registerOutlet = (element: HTMLElement | null) => {
  if (element) {
    emit("register-outlet", element);
  }
};

const resetEdits = () => {
  editingNode.value = null;
  editForm.value = { name: "", id: "" };
  manualIdInput.value = false;
};
</script>

<template>
  <button
    class="flex items-center hover:bg-muted rounded-md p-2 text-sm group flex-1 px-4"
    :class="{
      'pr-6': depth > 0,
      'pr-[2rem]': depth > 1,
      'bg-blue-100 dark:bg-blue-900 border-blue-200 dark:border-blue-800':
        isPinned,
      'bg-blue-100/50 dark:bg-blue-900/50 border-blue-200 dark:border-blue-800':
        isHighlighted,
      'bg-blue-100 dark:bg-blue-900': isPinned,
      'bg-yellow-100/50 dark:bg-yellow-900/50': isMatched,
    }"
  >
    <!-- outlet (lhs) -->
    <button
      v-if="
        outletPosition === 'left' && (!pinnedNode || node.id === pinnedNode)
      "
      :ref="registerOutlet"
      class="w-3 h-3 rounded-full border-2 border-gray-400 group-hover:border-gray-600 cursor-grab active:cursor-grabbing relative p-2 z-10 mr-2"
      @mousedown="emit('drag-start')"
      @mouseup="emit('drag-end')"
    />

    <div class="flex items-center flex-1">
      <fa
        v-if="node.children?.length"
        icon="chevron-right"
        class="h-4 w-4 shrink-0 transition-transform duration-200"
        :class="{ 'transform rotate-90': isExpanded }"
      />

      <!-- editing -->
      <template v-if="editable && editingNode === node.id">
        <div class="ml-2 flex gap-2 flex-1" @click.stop>
          <input
            v-model="editForm.name"
            placeholder="Name"
            class="px-1 py-0.5 text-sm border rounded flex-1"
            @keydown.escape="resetEdits"
          />
          <input
            v-model="editForm.id"
            placeholder="Slug (ID)"
            class="px-1 py-0.5 text-sm border rounded w-24 flex-1"
            :class="{ 'border-red-500': editForm.id && !isValidId }"
            @input="manualIdInput = true"
            @keydown.escape="resetEdits"
            @change="
              (e) => {
                if (!manualIdInput) {
                  editForm.id = slugify(editForm.name);
                }
                if (editForm.id === '') {
                  manualIdInput = false;
                }
              }
            "
          />

          <button
            class="px-2 py-0.5 text-xs bg-destructive text-destructive-foreground rounded hover:bg-destructive/90"
            @click.stop="resetEdits()"
          >
            Cancel
          </button>
          <button
            class="px-2 py-0.5 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="!isValidId"
            @click.stop="saveEdits()"
          >
            Save
          </button>
        </div>
      </template>

      <!-- not editing -->
      <template v-else>
        <span class="ml-2 flex-1 text-left">
          <template v-if="node.name">{{ node.name }}</template>
          <span v-else class="text-muted-foreground italic">no name</span>
        </span>
        <span v-if="!hideIds" class="mr-3 text-[10px] text-muted-foreground">{{
          node.id
        }}</span>

        <!-- edit button -->
        <button
          v-if="editable"
          class="ml-2 p-1 text-xs text-muted-foreground hover:bg-muted rounded-md opacity-50 hover:opacity-100 mr-2"
          @click.stop="startEditing(node)"
        >
          <fa icon="pen" />
        </button>
      </template>
    </div>

    <div class="flex items-center gap-1">
      <button
        v-if="pinnable"
        class="p-1 hover:bg-muted rounded-sm"
        @click.stop="emit('pin')"
      >
        <fa
          icon="thumbtack"
          class="h-4 w-4 text-muted-foreground hover:text-primary"
          :class="{ 'rotate-45': !isPinned }"
        />
      </button>
      <slot name="actions"></slot>
    </div>

    <!-- outlet (rhs) -->
    <button
      v-if="
        outletPosition !== 'left' && (!pinnedNode || node.id === pinnedNode)
      "
      :ref="registerOutlet"
      class="w-3 h-3 rounded-full border-2 border-gray-400 group-hover:border-gray-600 cursor-grab active:cursor-grabbing relative p-2 z-10 flex-shrink-0 ml-2"
      @mousedown="emit('drag-start')"
      @mouseup="emit('drag-end')"
    />
  </button>
</template>
