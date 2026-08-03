<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { apiGet } from '../lib/api'
import InlineStatus from '../components/InlineStatus.vue'
import LoadingSkeleton from '../components/LoadingSkeleton.vue'
interface ExhibitCard { slug:string;title:string;summary:string;coverImageUrl:string;artifactSlug:string;artifactTitle:string }
const items=ref<ExhibitCard[]>([]);const loading=ref(true);const error=ref('')
const coverFor = (item: ExhibitCard) => item.slug.includes('bronze-ding') ? '/media/editorial/exhibit-ding-moonlight.webp' : item.coverImageUrl
onMounted(async()=>{try{items.value=await apiGet<ExhibitCard[]>('/exhibits')}catch(reason){error.value=reason instanceof Error?reason.message:'数字展项加载失败。'}finally{loading.value=false}})
</script>
<template>
  <main class="curation-page exhibits-page">
    <svg class="river-route exhibit-route" viewBox="0 0 1200 500" preserveAspectRatio="none" aria-hidden="true"><path d="M0 430c139-135 231 27 399-124s184-42 335-155 259-46 466-226" /></svg>
    <section class="exhibits-intro">
      <div class="exhibits-intro__index"><span>DIGITAL ARCHIVE</span><b>01</b><small>ONLINE GALLERY</small></div>
      <div class="exhibits-intro__copy"><p class="eyebrow">DIGITAL EXHIBITION</p><h1>把一件器物，<br />拿到眼前。</h1><p>使用项目组自主创作的河洛风格青铜鼎 GLB 模型；你可以旋转、缩放，在实体与点云之间切换，并阅读展项说明。</p></div>
      <div class="exhibit-stats"><span>交互方式</span><span>旋转 · 缩放 · 阅读 · 切换视角</span></div>
    </section>
    <InlineStatus v-if="error" kind="error" :message="`${error} 请检查服务后重试。`" />
    <LoadingSkeleton v-if="loading" :lines="4" label="正在加载数字展项" />
    <section v-else-if="items.length===0" class="state-panel state-panel--action"><div aria-hidden="true">◇</div><h2>展厅正在布展</h2><p>当前没有已发布的数字展项，请先探索馆藏故事。</p><RouterLink to="/explore">前往馆藏索引 →</RouterLink></section>
    <section v-else class="exhibit-grid" aria-label="数字展项列表"><RouterLink v-for="(item, index) in items" :key="item.slug" v-pointer-surface="{ kind: 'exhibit', maxTilt: 1.15 }" :to="`/exhibits/${item.slug}`"><span class="exhibit-card-index">0{{ index + 1 }}</span><img :src="coverFor(item)" :alt="item.title" loading="lazy" decoding="async" /><div><p class="card-meta">关联展品 · {{ item.artifactTitle }}</p><h2>{{ item.title }}</h2><p>{{ item.summary }}</p><span>开始互动 <b>→</b></span></div></RouterLink></section>
  </main>
</template>
