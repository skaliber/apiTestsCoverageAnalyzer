package com.example.conduit.adapter.web;

import org.springframework.web.bind.annotation.*;
import com.example.conduit.application.handler.CreateArticleHandler;
import com.example.conduit.application.handler.GetArticlesHandler;

@RestController
@RequestMapping("/api/articles")
public class ArticleController {

    private final CreateArticleHandler createArticleHandler;
    private final GetArticlesHandler getArticlesHandler;

    public ArticleController(CreateArticleHandler createArticleHandler,
                             GetArticlesHandler getArticlesHandler) {
        this.createArticleHandler = createArticleHandler;
        this.getArticlesHandler = getArticlesHandler;
    }

    @GetMapping
    public Object listArticles(@RequestParam(required = false) String tag,
                               @RequestParam(required = false) String author,
                               @RequestParam(defaultValue = "20") int limit,
                               @RequestParam(defaultValue = "0") int offset) {
        return getArticlesHandler.handle(new GetArticlesQuery(tag, author, limit, offset));
    }

    @PostMapping
    public Object createArticle(@RequestBody CreateArticleCommand cmd) {
        return createArticleHandler.handle(cmd);
    }

    @GetMapping("/{slug}")
    public Object getArticle(@PathVariable String slug) {
        return null;
    }

    @PutMapping("/{slug}")
    public Object updateArticle(@PathVariable String slug, @RequestBody Object body) {
        return null;
    }

    @DeleteMapping("/{slug}")
    public void deleteArticle(@PathVariable String slug) {
    }
}
