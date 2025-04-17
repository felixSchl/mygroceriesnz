<script lang="ts" setup>
import { formatDistance } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

defineProps<{
  date: Date;
}>();
</script>

<template>
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger>
        {{ formatDistance(date, new Date()) }} ago
      </TooltipTrigger>
      <TooltipContent>
        {{ formatInTimeZone(date, "Pacific/Auckland", "yyyy-MM-dd HH:mm:ss") }}
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
</template>
