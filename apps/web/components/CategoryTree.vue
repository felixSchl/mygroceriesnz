<template>
  <div ref="treeContainer" class="tree-container"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted } from "vue";
import * as d3 from "d3";

// Props
interface TreeNode {
  name: string;
  children?: TreeNode[];
}

interface Props {
  data: TreeNode;
  nodeSpacing?: number;
}

const props = defineProps<Props>();
const nodeSpacing = props.nodeSpacing ?? 20;

const treeContainer = ref<HTMLDivElement | null>(null);
const svgWidth = ref(0);
const svgHeight = ref(0);

const updateDimensions = () => {
  if (!treeContainer.value) return;
  const { width, height } = treeContainer.value.getBoundingClientRect();
  svgWidth.value = width;
  svgHeight.value = height;
};

const drawTree = () => {
  if (!treeContainer.value) return;

  // Clear existing content
  d3.select(treeContainer.value).select("svg").remove();

  // Measure container dimensions
  updateDimensions();

  // Create a zoomable container
  const zoom = d3
    .zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.5, 2]) // Zoom range
    .on("zoom", (event) => {
      g.attr("transform", event.transform); // Apply zoom and pan
    });

  // Append the SVG container with zoom behavior
  const svg = d3
    .select(treeContainer.value)
    .append("svg")
    .attr("width", svgWidth.value)
    .attr("height", svgHeight.value)
    .call(zoom) // Enable zoom/pan
    .append("g")
    .attr("transform", "translate(50, 20)"); // Initial position

  const g = svg.append("g"); // Group to hold all content

  // Define the tree layout
  const treeLayout = d3.tree<TreeNode>().nodeSize([nodeSpacing, 200]);

  // Create a hierarchy from the data
  const root = d3.hierarchy(props.data);

  // Apply tree layout
  treeLayout(root);

  // Auto-resize based on depth and size
  const maxDepthWidth = root
    .descendants()
    .reduce((max, node) => Math.max(max, node.depth * 200), 0);
  svg.attr("width", Math.max(svgWidth.value, maxDepthWidth));

  // Draw links (edges)
  g.selectAll(".link")
    .data(root.links())
    .enter()
    .append("path")
    .attr("class", "link")
    .attr(
      "d",
      d3
        .linkHorizontal<
          d3.HierarchyPointLink<TreeNode>,
          d3.HierarchyPointNode<TreeNode>
        >()
        .x((d) => d.y)
        .y((d) => d.x) as any,
    )
    .attr("stroke", "#ccc")
    .attr("fill", "none");

  // Draw nodes
  const node = g
    .selectAll(".node")
    .data(root.descendants())
    .enter()
    .append("g")
    .attr("class", "node")
    .attr("transform", (d) => `translate(${d.y}, ${d.x})`);

  // Add circles
  node.append("circle").attr("r", 5).attr("fill", "#69b3a2");

  // Add text labels
  node
    .append("text")
    .attr("dx", 10)
    .attr("dy", 4)
    .attr("text-anchor", "start")
    .text((d) => d.data.name)
    .style("font-size", "12px")
    .style("font-family", "Arial");
};

// Recalculate dimensions and redraw tree on resize
onMounted(() => {
  updateDimensions();
  drawTree();
  window.addEventListener("resize", () => {
    updateDimensions();
    drawTree();
  });
});

onUnmounted(() => {
  window.removeEventListener("resize", updateDimensions);
});

// Redraw tree on data change
watch(() => props.data, drawTree);
</script>

<style scoped>
.tree-container {
  width: 100%;
  height: 100%;
  overflow: hidden;
  position: relative;
}

.node circle {
  stroke: #3182bd;
  stroke-width: 1.5px;
}

.node text {
  font-size: 12px;
  font-family: sans-serif;
}

.link {
  fill: none;
  stroke: #ccc;
  stroke-width: 1.5px;
}
</style>
