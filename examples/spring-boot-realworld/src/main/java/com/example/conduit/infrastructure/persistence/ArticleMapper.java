package com.example.conduit.infrastructure.persistence;

import com.example.conduit.domain.model.Article;
import org.apache.ibatis.annotations.Mapper;
import java.util.List;
import java.util.Optional;

@Mapper
public interface ArticleMapper {
    Optional<Article> findBySlug(String slug);
    List<Article> findByAuthorId(Long authorId);
    List<Article> findByTag(String tag);
    void insert(Article article);
    void update(Article article);
    void deleteById(Long id);
}
