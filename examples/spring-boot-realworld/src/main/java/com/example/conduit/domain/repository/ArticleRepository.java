package com.example.conduit.domain.repository;

import com.example.conduit.domain.model.Article;
import java.util.List;
import java.util.Optional;

public interface ArticleRepository {
    Optional<Article> findBySlug(String slug);
    List<Article> findByAuthorId(Long authorId);
    List<Article> findByTag(String tag);
    Article save(Article article);
    void delete(Article article);
    void deleteById(Long id);
}
