<?php

use Slim\Routing\RouteCollectorProxy;

$app->group('/api/profiles', function (RouteCollectorProxy $group) {
    $group->get('/{username}', 'ProfileController:show');
    $group->post('/{username}/follow', 'ProfileController:follow')->add('jwt');
    $group->delete('/{username}/follow', 'ProfileController:unfollow')->add('jwt');
});
