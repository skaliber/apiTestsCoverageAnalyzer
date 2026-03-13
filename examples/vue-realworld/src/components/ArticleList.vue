<template>
  <div class="article-list">
    <div v-for="article in articles" :key="article.slug">
      {{ article.title }}
    </div>
  </div>
</template>

<script>
export default {
  name: 'ArticleList',
  computed: {
    articles() {
      return this.$store.state.articles.articles;
    }
  },
  mounted() {
    this.$store.dispatch('fetchArticles', { limit: 20, offset: 0 });
  },
  methods: {
    favoriteArticle(slug) {
      this.$store.dispatch('favoriteArticle', slug);
    },
    unfavoriteArticle(slug) {
      this.$store.dispatch('unfavoriteArticle', slug);
    }
  }
};
</script>
