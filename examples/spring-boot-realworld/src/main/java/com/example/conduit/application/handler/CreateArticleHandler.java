package com.example.conduit.application.handler;

import com.example.conduit.domain.repository.ArticleRepository;

public class CreateArticleHandler {

    private final ArticleRepository articleRepository;

    public CreateArticleHandler(ArticleRepository articleRepository) {
        this.articleRepository = articleRepository;
    }

    public Object handle(CreateArticleCommand command) {
        return null;
    }
}
