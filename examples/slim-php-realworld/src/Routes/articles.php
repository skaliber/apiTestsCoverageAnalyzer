<?php

use Slim\Routing\RouteCollectorProxy;

$app->group('/api', function (RouteCollectorProxy $group) {
    $group->group('/articles', function (RouteCollectorProxy $articles) {
        $articles->get('', 'ArticleController:index');
        $articles->post('', 'ArticleController:create')->add('jwt');
        $articles->get('/{slug}', 'ArticleController:show');
        $articles->put('/{slug}', 'ArticleController:update')->add('jwt');
        $articles->delete('/{slug}', 'ArticleController:delete')->add('jwt');
        $articles->get('/{slug}/comments', 'CommentController:index');
        $articles->post('/{slug}/comments', 'CommentController:create')->add('jwt');
        $articles->post('/{slug}/favorite', 'ArticleController:favorite')->add('jwt');
        $articles->delete('/{slug}/favorite', 'ArticleController:unfavorite')->add('jwt');
    });
});
