package com.example.conduit.adapter.web;

import com.netflix.graphql.dgs.DgsComponent;
import com.netflix.graphql.dgs.DgsQuery;
import com.netflix.graphql.dgs.DgsMutation;
import com.netflix.graphql.dgs.InputArgument;

@DgsComponent
public class ArticleDataFetcher {

    @DgsQuery
    public Object articles(@InputArgument String tag, @InputArgument String author,
                          @InputArgument Integer limit, @InputArgument Integer offset) {
        return null;
    }

    @DgsQuery
    public Object article(@InputArgument String slug) {
        return null;
    }

    @DgsMutation
    public Object createArticle(@InputArgument Object input) {
        return null;
    }

    @DgsMutation
    public Object updateArticle(@InputArgument String slug, @InputArgument Object input) {
        return null;
    }

    @DgsMutation
    public boolean deleteArticle(@InputArgument String slug) {
        return true;
    }
}
