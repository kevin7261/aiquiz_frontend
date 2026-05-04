<script setup>
/**
 * 以 fetch（loggedFetch）載入 GET /rag/tab/unit/mp3-file，再以 blob URL 供原生 <audio> 播放。
 * 避免正式站與 API 跨網域時，<audio :src="https://api..."> 因 Range／CORP 等導致無法解碼。
 */
import { ref, watch, onBeforeUnmount } from 'vue';
import { apiRagTabUnitMp3FileBlob } from '../services/ragApi.js';

const props = defineProps({
  ragTabId: { type: String, required: true },
  ragUnitId: { type: Number, required: true },
  personId: { type: String, required: true },
});

const objectUrl = ref('');
const loadError = ref('');
const isLoading = ref(false);

let loadSeq = 0;

function revokeObjectUrl() {
  if (objectUrl.value) {
    URL.revokeObjectURL(objectUrl.value);
    objectUrl.value = '';
  }
}

async function loadAudio() {
  loadSeq += 1;
  const seq = loadSeq;
  loadError.value = '';
  revokeObjectUrl();

  const rid = String(props.ragTabId ?? '').trim();
  const ru = Number(props.ragUnitId);
  const pid = String(props.personId ?? '').trim();
  if (!rid || !pid || !Number.isFinite(ru) || ru < 1) {
    isLoading.value = false;
    return;
  }

  isLoading.value = true;
  try {
    const blob = await apiRagTabUnitMp3FileBlob({
      rag_tab_id: rid,
      rag_unit_id: ru,
      personId: pid,
    });
    if (seq !== loadSeq) return;
    if (!(blob instanceof Blob) || blob.size <= 0) {
      loadError.value = '音訊檔為空';
      return;
    }
    objectUrl.value = URL.createObjectURL(blob);
  } catch (e) {
    if (seq !== loadSeq) return;
    loadError.value = e?.message ? String(e.message) : '無法載入音訊';
  } finally {
    if (seq === loadSeq) isLoading.value = false;
  }
}

watch(
  () => [props.ragTabId, props.ragUnitId, props.personId],
  () => {
    loadAudio();
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  loadSeq += 1;
  revokeObjectUrl();
});
</script>

<template>
  <div class="w-100 min-w-0">
    <div
      v-if="isLoading"
      class="my-font-sm-400 my-color-gray-4 py-2"
    >
      音訊載入中…
    </div>
    <p
      v-else-if="loadError"
      class="my-font-sm-400 my-color-red mb-0"
    >
      {{ loadError }}
    </p>
    <audio
      v-if="objectUrl"
      :key="objectUrl"
      controls
      class="w-100"
      preload="metadata"
      :src="objectUrl"
    />
  </div>
</template>
