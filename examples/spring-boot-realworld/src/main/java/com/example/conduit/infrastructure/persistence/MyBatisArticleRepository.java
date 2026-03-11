package com.example.conduit.infrastructure.persistence;

import com.example.conduit.domain.model.Article;
import com.example.conduit.domain.repository.ArticleRepository;
import java.util.List;
import java.util.Optional;

public class MyBatisArticleRepository implements ArticleRepository {

    private final ArticleMapper articleMapper;

    public MyBatisArticleRepository(ArticleMapper articleMapper) {
        this.articleMapper = articleMapper;
    }

    @Override
    public Optional<Article> findBySlug(String slug) { return Optional.empty(); }

    @Override
    public List<Article> findByAuthorId(Long authorId) { return List.of(); }

    @Override
    public List<Article> findByTag(String tag) { return List.of(); }

    @Override
    public Article save(Article article) { return article; }

    @Override
    public void delete(Article article) {}

    @Override
    public void deleteById(Long id) {}
}
