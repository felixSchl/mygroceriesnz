<script lang="ts" setup>
definePageMeta({ layout: "admin" });
const trpc = useTrpc();
const { data: summary, status } = trpc.admin.summary.useQuery(undefined, {
  lazy: true,
});

// Group summary by table_name for the stats cards
const summaryByTable = computed(() => {
  return summary.value?.reduce(
    (acc, curr) => {
      if (!acc[curr.table_name]) {
        acc[curr.table_name] = [];
      }
      acc[curr.table_name]?.push(curr);
      return acc;
    },
    {} as Record<string, typeof summary.value>,
  );
});

// Add stats array for the summary cards
const stats = computed(() => [
  {
    title: "Total Records",
    value:
      summary.value == null
        ? "-"
        : (summary.value
            .reduce((acc, curr) => acc + parseInt(curr.total_rows), 0)
            .toLocaleString() ?? 0),
    description: "Total records across all product tables",
  },
  {
    title: "Total Storage",
    value:
      summary.value == null
        ? "-"
        : summary.value
            .reduce((acc, curr) => acc + parseSize(curr.total_size), 0)
            .toFixed(2) + " MB",
    description: "Combined storage used for product data",
  },
  {
    title: "Index Storage",
    value:
      summary.value == null
        ? "-"
        : summary.value
            .reduce((acc, curr) => acc + parseSize(curr.index_size), 0)
            .toFixed(2) + " MB",
    description: "Total index storage used for product data",
  },
]);

// Helper function to parse size strings like "1.5 MB" to number
// output size is in MB
function parseSize(size: string): number {
  const num = parseFloat(size);
  if (size.endsWith("kB")) {
    return num / 1024; // to MB
  }
  return isNaN(num) ? 0 : num;
}

// Sort summary entries by total size for better visualization
const sortedSummary = computed(() => {
  return summary.value?.sort((a, b) => {
    const sizeA = parseSize(a.total_size);
    const sizeB = parseSize(b.total_size);
    return sizeB - sizeA;
  });
});
</script>

<template>
  <div class="flex flex-col gap-6">
    <!-- Loading State -->
    <div
      v-if="status === 'pending'"
      class="flex justify-center items-center min-h-[100px]"
    >
      <fa icon="spinner" class="h-8 w-8 animate-spin" />
      Loading disk usage... this is an expensive operation. Please be patient.
    </div>

    <template v-else>
      <!-- Stats Cards -->
      <div class="grid grid-cols-4 gap-4">
        <Card v-for="stat in stats" :key="stat.title" class="p-4">
          <div class="flex flex-col gap-1">
            <p class="text-sm font-medium text-muted-foreground">
              {{ stat.title }}
            </p>
            <p class="text-2xl font-bold">{{ stat.value }}</p>
            <p class="text-xs text-muted-foreground">{{ stat.description }}</p>
          </div>
        </Card>
      </div>

      <!-- Summary Breakdown Table -->
      <Card class="p-4">
        <table class="w-full">
          <thead>
            <tr class="border-b">
              <th class="text-left p-2">Table</th>
              <th class="text-left p-2">Retailer</th>
              <th class="text-right p-2">Total Rows</th>
              <th class="text-right p-2">Rows/Store</th>
              <th class="text-right p-2">Store Count</th>
              <th class="text-right p-2">Table Size</th>
              <th class="text-right p-2">Index Size</th>
              <th class="text-right p-2">Total Size</th>
              <th class="text-right p-2">Size/Store</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="item in sortedSummary"
              :key="`${item.table_name}-${item.retailer}`"
              class="border-b"
            >
              <td class="p-2">{{ item.table_name }}</td>
              <td class="p-2">{{ item.retailer ?? "N/A" }}</td>
              <td class="text-right p-2">
                {{ parseInt(item.total_rows).toLocaleString() }}
              </td>
              <td class="text-right p-2">
                {{ item.avg_rows_per_store ?? "N/A" }}
              </td>
              <td class="text-right p-2">
                {{ item.store_count?.toLocaleString() ?? "N/A" }}
              </td>
              <td class="text-right p-2">{{ item.table_size }}</td>
              <td class="text-right p-2">{{ item.index_size }}</td>
              <td class="text-right p-2">{{ item.total_size }}</td>
              <td class="text-right p-2">
                {{ item.avg_size_per_store ?? "N/A" }}
              </td>
            </tr>
          </tbody>
        </table>
      </Card>
    </template>
  </div>
</template>
