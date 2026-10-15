<script setup lang="ts">
import { newDoc, openDoc, openRecent, recent, baseName, isTauri } from "../files";
import { t } from "../i18n";
</script>

<template>
  <main class="flex-1 min-h-0 overflow-y-auto bg-neutral-200/70">
    <div class="max-w-2xl mx-auto px-6 py-14 flex flex-col gap-8">
      <header class="flex items-center gap-4">
        <img src="/favicon.png" alt="" class="w-14 h-14" />
        <h1 class="text-2xl font-semibold text-neutral-800">Free Draw</h1>
      </header>

      <div class="flex gap-2 text-sm">
        <button class="px-4 h-9 rounded bg-blue-600 text-white hover:bg-blue-700" @click="newDoc">{{ t('Nuevo documento') }}</button>
        <button class="px-4 h-9 rounded border border-neutral-300 bg-white hover:bg-neutral-100" @click="openDoc">{{ t('Abrir…') }}</button>
      </div>

      <!-- the browser never sees real paths, so recents are desktop only -->
      <section v-if="isTauri">
        <h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">{{ t('Recientes') }}</h2>
        <ul v-if="recent.length" class="bg-white border border-neutral-300 rounded divide-y divide-neutral-200">
          <li v-for="p in recent" :key="p">
            <button class="w-full px-3 py-2 text-left hover:bg-blue-50" :title="p" @click="openRecent(p)">
              <span class="block text-sm font-medium text-neutral-800">{{ baseName(p) }}</span>
              <span class="block text-xs text-neutral-500 truncate">{{ p }}</span>
            </button>
          </li>
        </ul>
        <p v-else class="text-sm text-neutral-500">{{ t('Todavía no hay documentos recientes.') }}</p>
      </section>
    </div>
  </main>
</template>
