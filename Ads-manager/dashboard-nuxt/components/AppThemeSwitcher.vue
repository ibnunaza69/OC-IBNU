<script setup lang="ts">
import { computed } from 'vue';

import AppIcon from './AppIcon.vue';
import { useDashboardTheme, type DashboardMode, type DashboardTheme } from '../composables/useDashboardTheme';

const { theme, mode } = useDashboardTheme();

const modeOptions = computed(() => [
  { label: 'Dark', value: 'dark' as DashboardMode, description: 'Mode gelap' },
  { label: 'Light', value: 'light' as DashboardMode, description: 'Mode terang' }
]);

const themeOptions = computed(() => [
  { label: 'Green', value: 'green' as DashboardTheme, description: 'Primary green' },
  { label: 'Blue', value: 'blue' as DashboardTheme, description: 'Primary blue' },
  { label: 'Violet', value: 'violet' as DashboardTheme, description: 'Primary violet' },
  { label: 'Amber', value: 'amber' as DashboardTheme, description: 'Primary amber' }
]);
</script>

<template>
  <UPopover :content="{ align: 'end', side: 'bottom', sideOffset: 10 }">
    <UButton color="neutral" variant="soft" size="md" aria-label="Open appearance settings">
      <template #leading>
        <AppIcon name="palette" class="size-4" />
      </template>
      Tampilan
    </UButton>

    <template #content>
      <div class="w-[280px] space-y-5 p-4">
        <div class="space-y-2">
          <div class="text-sm font-semibold text-highlighted">Mode</div>
          <URadioGroup
            v-model="mode"
            class="w-full"
            size="lg"
            value-key="value"
            label-key="label"
            :items="modeOptions"
          />
        </div>

        <div class="space-y-2">
          <div class="text-sm font-semibold text-highlighted">Accent color</div>
          <URadioGroup
            v-model="theme"
            class="w-full"
            size="lg"
            value-key="value"
            label-key="label"
            :items="themeOptions"
          />
        </div>
      </div>
    </template>
  </UPopover>
</template>

