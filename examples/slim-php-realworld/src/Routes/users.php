<?php

use Slim\Routing\RouteCollectorProxy;

$app->group('/api', function (RouteCollectorProxy $group) {
    $group->group('/users', function (RouteCollectorProxy $users) {
        $users->post('/login', 'UserController:login');
        $users->post('', 'UserController:register');
    });
    $group->get('/user', 'UserController:current')->add('jwt');
    $group->put('/user', 'UserController:update')->add('jwt');
});
