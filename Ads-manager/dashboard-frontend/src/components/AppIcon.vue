<script setup lang="ts">
import { computed } from 'vue'
import {
  BadgeDollarSign,
  Check,
  Images,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  MoonStar,
  Palette,
  PanelLeftClose,
  RefreshCw,
  Settings2,
  Sparkles,
  SunMedium,
  Users,
  Workflow
} from 'lucide-vue-next'

const props = withDefaults(defineProps<{
  name:
    | 'badge-dollar-sign'
    | 'check'
    | 'images'
    | 'layout-dashboard'
    | 'log-out'
    | 'megaphone'
    | 'menu'
    | 'moon-star'
    | 'palette'
    | 'panel-left-close'
    | 'refresh-cw'
    | 'settings-2'
    | 'sparkles'
    | 'sun-medium'
    | 'users'
    | 'workflow'
  class?: string
  strokeWidth?: number
}>(), {
  class: 'size-4',
  strokeWidth: 2
})

const iconComponent = computed(() => ({
  'badge-dollar-sign': BadgeDollarSign,
  check: Check,
  images: Images,
  'layout-dashboard': LayoutDashboard,
  'log-out': LogOut,
  megaphone: Megaphone,
  menu: Menu,
  'moon-star': MoonStar,
  palette: Palette,
  'panel-left-close': PanelLeftClose,
  'refresh-cw': RefreshCw,
  'settings-2': Settings2,
  sparkles: Sparkles,
  'sun-medium': SunMedium,
  users: Users,
  workflow: Workflow
}[props.name]))
</script>

<template>
  <component :is="iconComponent" :class="props.class" :stroke-width="props.strokeWidth" />
</template>
