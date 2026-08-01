<script setup lang="ts">
import heroImage from '../assets/bronze-ding-home-hero.png'
</script>

<template>
  <section class="hero hero--visual">
    <div class="hero-copy-block"><p class="eyebrow">HELUO DIGITAL MUSEUM · 2026</p><h1>让传统文化<br />成为今天的灵感。</h1><p class="hero-copy">面向年轻文化探索者的数字博物馆：先在线探索故事与 3D 展项，再决定是否线下参观。</p><div class="hero-actions"><el-button type="primary" size="large" tag="RouterLink" to="/explore">开始探索</el-button><el-button size="large" tag="RouterLink" to="/exhibits">进入数字展厅</el-button></div></div>
    <img class="hero-image" :src="heroImage" alt="项目组自主创作的青铜鼎数字展项概念图" />
  </section>
  <section class="feature-grid" aria-label="核心体验"><article><p class="feature-index">01</p><h2>故事化馆藏</h2><p>通过主题、文物和文章建立易理解的文化探索路径。</p></article><article><p class="feature-index">02</p><h2>互动 3D 展项</h2><p>加载自主创作的模型，支持旋转、缩放与展项说明。</p></article><article><p class="feature-index">03</p><h2>线上线下联动</h2><p>探索后预约参观，继续收藏有文化故事的原创文创。</p></article></section>
</template>

