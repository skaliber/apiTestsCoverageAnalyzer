package com.example.conduit.application.handler;

import com.example.conduit.domain.repository.ArticleRepository;

public class GetArticlesHandler {

    private final ArticleRepository articleRepository;

    public GetArticlesHandler(ArticleRepository articleRepository) {
        this.articleRepository = articleRepository;
    }

    public Object handle(GetArticlesQuery query) {
        return null;
    }
}
