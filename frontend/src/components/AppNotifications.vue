<script setup lang="ts">
import { computed } from "vue";
import { useNotifier } from "../composables/useNotifier";

const notifier = useNotifier();

const notificationStyles = computed(() => ({
  success: "border-emerald-300/40 bg-emerald-500/15 text-emerald-100",
  error: "border-rose-300/40 bg-rose-500/15 text-rose-100",
  info: "border-cyan-300/40 bg-cyan-500/15 text-cyan-100"
}));
</script>

<template>
  <div class="pointer-events-none fixed right-4 top-4 z-[100] flex w-[min(28rem,calc(100vw-2rem))] flex-col gap-3">
    <TransitionGroup name="toast" tag="div" class="flex flex-col gap-3">
      <article
        v-for="notification in notifier.notifications"
        :key="notification.id"
        class="rounded-xl border px-4 py-3 shadow-2xl backdrop-blur"
        :class="notificationStyles[notification.type]"
      >
        <h4 class="text-sm font-semibold tracking-wide">{{ notification.title }}</h4>
        <p v-if="notification.message" class="mt-1 text-xs/5 opacity-90">{{ notification.message }}</p>
      </article>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.28s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.98);
}
</style>
